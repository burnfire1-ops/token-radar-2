// Token Radar v6 — dashboard (dark theme).
//
// Reads window.RADAR (written by main.ts from the same board), renders
// the board, the spotlight, the model and farm panels, and the detail
// drawer. No framework, no network, no cookies. All state lives in
// the URL hash, so a filtered view or an open drawer is a link.
//
// The page recomputes two things from the model instead of trusting
// the payload: impliedOf() re-derives a row's implied value from its
// TVL and the fitted power law (plus the x0.5 kin discount when the
// row is flagged possible_parent), and farmSteps() regenerates the
// farm plan. Both must match board.json exactly; the verification
// step runs them in Node over all 198 rows.
//
// The top-level function declarations (impliedOf, farmSteps and the
// helpers they use) are plain functions so the Node harness can call
// them after loading this file in a VM.

const R = window.RADAR;
const FIT = R.model.fit;
const KIN = R.model.kin_discount.factor;

/** The plain power-law base value for a TVL, from the fitted model. */
function baseValue(tvlUsd) {
  return 10 ** (FIT.intercept + FIT.slope * Math.log10(tvlUsd));
}

/** A row's implied value: the power-law base, halved when possible_parent. */
function impliedOf(row) {
  const discount = row.possible_parent ? KIN : 1;
  return Math.max(1, Math.round(baseValue(row.tvl_usd) * discount));
}

/** Farm capital tier by TVL: $250 / $150 / $100 / $50. */
function capitalFor(tvlUsd) {
  if (tvlUsd >= 5000000000) return 250;
  if (tvlUsd >= 1000000000) return 150;
  if (tvlUsd >= 100000000) return 100;
  return 50;
}

/** Gas for the main action: about $8 when capital is $150 or more, else about $4. */
function gasFor(capitalUsd) {
  return capitalUsd >= 150 ? 8 : 4;
}

/** Hold days from age: under 180 days hold 60, 180-364 hold 45, a year or more hold 30. */
function holdDaysFor(ageDays) {
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  return 30;
}

/** The first chain the protocol reports TVL on, or Ethereum when it reports none. */
function firstChain(chains) {
  return chains && chains.length > 0 ? chains[0] : 'Ethereum';
}

const CATEGORY_PLANS = {
  'Risk Curators': {
    main: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    second: (name, _capital, chain) => `Allocate to a second ${name} vault on ${chain} so the farm has two qualifying positions.`,
    verb: 'deposit',
  },
  'Onchain Capital Allocator': {
    main: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    second: (name, _capital, chain) => `Allocate to a second ${name} vault on ${chain} so the farm has two qualifying positions.`,
    verb: 'deposit',
  },
  RWA: {
    main: (name, capital, chain) => `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it in the farming wallet.`,
    second: (name, _capital, _chain) => `Claim the yield from ${name} and restake it so the position keeps compounding.`,
    verb: 'mint',
  },
  Lending: {
    main: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and leave it supplied.`,
    second: (name, _capital, _chain) => `Borrow under 30% of the supplied value on ${name} and repay it within the week.`,
    verb: 'supply',
  },
  CDP: {
    main: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and leave it supplied.`,
    second: (name, _capital, _chain) => `Borrow under 30% of the supplied value on ${name} and repay it within the week.`,
    verb: 'supply',
  },
  'CDP Manager': {
    main: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and leave it supplied.`,
    second: (name, _capital, _chain) => `Borrow under 30% of the supplied value on ${name} and repay it within the week.`,
    verb: 'supply',
  },
  'Collateral Markets': {
    main: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and leave it supplied.`,
    second: (name, _capital, _chain) => `Borrow under 30% of the supplied value on ${name} and repay it within the week.`,
    verb: 'supply',
  },
  Dexs: {
    main: (name, capital, chain) => `Provide $${capital} of liquidity to ${name} on ${chain} and hold the LP position.`,
    second: (name, _capital, _chain) => `Stake the LP receipt from ${name} so the position earns a second reward stream.`,
    verb: 'provide liquidity',
  },
  'Basis Trading': {
    main: (name, capital, chain) => `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position open.`,
    second: (name, _capital, _chain) => `Add a second deposit to ${name} after the first funding round settles.`,
    verb: 'deposit',
  },
  Yield: {
    main: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    second: (name, _capital, _chain) => `Harvest the yield from ${name} and redeposit it into the same vault.`,
    verb: 'deposit',
  },
  'Yield Aggregator': {
    main: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    second: (name, _capital, _chain) => `Harvest the yield from ${name} and redeposit it into the same vault.`,
    verb: 'deposit',
  },
  'Liquidity Manager': {
    main: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    second: (name, _capital, _chain) => `Harvest the yield from ${name} and redeposit it into the same vault.`,
    verb: 'deposit',
  },
  Chain: {
    main: (name, capital, chain) => `Bridge $${capital} of USDC to ${name} through its official bridge and hold it there.`,
    second: (name, _capital, _chain) => `Make one native transaction a week on ${name} so the wallet stays active.`,
    verb: 'bridge',
  },
  Restaking: {
    main: (name, capital, chain) => `Stake $${capital} with ${name} on ${chain} and hold the receipt in the farming wallet.`,
    second: (name, _capital, _chain) => `Restake the receipt from ${name} so the position earns a second layer of rewards.`,
    verb: 'stake',
  },
  'Staking Pool': {
    main: (name, capital, chain) => `Stake $${capital} with ${name} on ${chain} and hold the receipt in the farming wallet.`,
    second: (name, _capital, _chain) => `Restake the receipt from ${name} so the position earns a second layer of rewards.`,
    verb: 'stake',
  },
  Payments: {
    main: (name, capital, chain) => `Fund $${capital} into ${name} on ${chain} and make one payment through it.`,
    second: (name, _capital, _chain) => `Repeat a smaller payment through ${name} each week to keep the wallet active.`,
    verb: 'pay',
  },
  Insurance: {
    main: (name, capital, chain) => `Buy $${capital} of cover through ${name} on ${chain} and hold the policy in the farming wallet.`,
    second: (name, _capital, _chain) => `Repeat with a smaller cover purchase through ${name} each week.`,
    verb: 'buy cover',
  },
  'Prediction Market': {
    main: (name, capital, chain) => `Place a $${capital} market position through ${name} on ${chain} and hold it.`,
    second: (name, _capital, _chain) => `Repeat with a smaller market position through ${name} each week.`,
    verb: 'trade',
  },
};

const DEFAULT_PLAN = {
  main: (name, capital, chain) => `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
  second: (name, _capital, _chain) => `Repeat with a smaller deposit into ${name} each week to keep the wallet active.`,
  verb: 'deposit',
};

function planFor(category) {
  if (category !== null && category !== undefined && Object.hasOwn(CATEGORY_PLANS, category)) {
    return CATEGORY_PLANS[category];
  }
  return DEFAULT_PLAN;
}

function withCostTime(action, cost, time) {
  let step = `${action} Cost: ${cost}. Time: ${time}.`;
  if (step.length > 600) step = `${step.slice(0, 597)}...`;
  return step;
}

/** The 7-step farm plan for one row. Must match lib/model.ts exactly. */
function farmSteps(row) {
  const capital = capitalFor(row.tvl_usd);
  const gas = gasFor(capital);
  const hold = holdDaysFor(row.age_days);
  const chain = firstChain(row.chains);
  const plan = planFor(row.category);
  return [
    withCostTime(
      'Open a fresh wallet for this farm and write the seed phrase down offline.',
      '$0',
      '10 minutes to set up',
    ),
    withCostTime(
      plan.main(row.name, capital, chain),
      `$${capital} of capital and about $${gas} of gas`,
      '15 minutes to set up',
    ),
    withCostTime(plan.second(row.name, capital, chain), `about $${gas} of gas`, '10 minutes'),
    withCostTime(
      `Do one qualifying ${plan.verb} action on ${row.name} every week so the wallet keeps a steady record.`,
      'about $4 of gas a week',
      '10 minutes a week',
    ),
    withCostTime(
      `Hold the position for at least ${hold} days before touching it.`,
      '$0',
      `${hold} days of holding`,
    ),
    withCostTime(
      `Claim only from ${row.name}'s own points or rewards page on ${chain}; never pay to claim, and never follow a claim link from a DM.`,
      '$0',
      '10 minutes when claiming',
    ),
    withCostTime(
      `Write the wallet, dates and transactions in a farm log, and note how to unwind the ${row.name} position before you need it.`,
      '$0',
      '10 minutes to log',
    ),
  ];
}

/* ---------- formatting ---------- */

function fmtUsd(v) {
  if (v >= 1000000000) return `$${(v / 1000000000).toFixed(2)}B`;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  return `${days}d`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/* ---------- state ---------- */

/** The default direction for a sort key: rank ascending (1 first), everything else descending (largest first). */
function defaultDir(key) {
  return key === 'rank' ? 1 : -1;
}

function readHash() {
  const state = { p: '', scope: 'all', token: 'pre', q: '', cat: '', sort: 'rank', dir: 1 };
  if (typeof location === 'undefined' || !location.hash) return state;
  let dirGiven = false;
  const parts = location.hash.slice(1).split('&');
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === undefined || v === undefined) continue;
    const val = decodeURIComponent(v.replace(/\+/g, ' '));
    if (k === 'p') state.p = val;
    if (k === 'scope' && ['all', 'watchlist', 'early'].includes(val)) state.scope = val;
    if (k === 'token' && ['pre', 'live'].includes(val)) state.token = val;
    if (k === 'q') state.q = val;
    if (k === 'cat') state.cat = val;
    if (k === 'sort' && ['rank', 'tvl', 'change', 'age', 'implied', 'mcap'].includes(val)) state.sort = val;
    if (k === 'dir' && (val === '1' || val === '-1')) {
      state.dir = Number(val);
      dirGiven = true;
    }
  }
  if (!dirGiven) state.dir = defaultDir(state.sort);
  return state;
}

function writeHash(state) {
  if (typeof location === 'undefined') return;
  const parts = [];
  if (state.p) parts.push(`p=${encodeURIComponent(state.p)}`);
  if (state.scope !== 'all') parts.push(`scope=${state.scope}`);
  if (state.token !== 'pre') parts.push(`token=${state.token}`);
  if (state.q) parts.push(`q=${encodeURIComponent(state.q)}`);
  if (state.cat) parts.push(`cat=${encodeURIComponent(state.cat)}`);
  if (state.sort !== 'rank') parts.push(`sort=${state.sort}`);
  if (state.dir !== defaultDir(state.sort)) parts.push(`dir=${state.dir}`);
  const next = parts.length > 0 ? `#${parts.join('&')}` : '#';
  if (location.hash !== next) location.hash = next;
}

let S = readHash();

/* ---------- derived data ---------- */

const ROWS = R.rows;
const MAX_IMPLIED = Math.max(...ROWS.map((r) => r.implied_value_usd));
const MEDIAN_IMPLIED = median(ROWS.map((r) => r.implied_value_usd));
const CATEGORIES = [...new Set(ROWS.map((r) => r.category).filter((c) => c !== null))].sort();

function sortKey(row, key) {
  if (key === 'rank') return row.rank;
  if (key === 'tvl') return row.tvl_usd;
  if (key === 'change') return row.change_7d === null ? -Infinity : row.change_7d;
  if (key === 'age') return row.age_days;
  if (key === 'implied') return row.implied_value_usd;
  return row.rank;
}

function visibleRows() {
  let rows = ROWS;
  if (S.scope === 'watchlist') rows = rows.filter((r) => r.is_watchlist);
  if (S.scope === 'early') rows = rows.filter((r) => !r.is_watchlist);
  if (S.cat) rows = rows.filter((r) => r.category === S.cat);
  if (S.q) {
    const q = S.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category !== null && r.category.toLowerCase().includes(q)),
    );
  }
  const key = S.sort;
  return [...rows].sort((a, b) => {
    const d = sortKey(a, key) - sortKey(b, key);
    if (d !== 0) return S.dir * d;
    return a.slug < b.slug ? -1 : 1;
  });
}

function visibleLive() {
  let rows = [...R.live];
  if (S.cat) rows = rows.filter((r) => r.category === S.cat);
  if (S.q) {
    const q = S.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category !== null && r.category.toLowerCase().includes(q)),
    );
  }
  // Live rows are ordered by market cap, largest first, unless the
  // user sorted by TVL (then that direction applies).
  const byTvl = S.sort === 'tvl';
  const dir = byTvl ? S.dir : -1;
  return rows.sort((a, b) => {
    const av = byTvl ? a.tvl_usd : a.mcap_usd;
    const bv = byTvl ? b.tvl_usd : b.mcap_usd;
    const d = av - bv;
    if (d !== 0) return dir * d;
    return a.slug < b.slug ? -1 : 1;
  });
}

/* ---------- rendering ---------- */

function sortArrow(key) {
  if (S.sort !== key) return '';
  return S.dir === -1 ? ' ↓' : ' ↑';
}

function rowHtml(r) {
  const pct = fmtPct(r.change_7d);
  const pctClass = r.change_7d === null ? '' : r.change_7d < 0 ? 'neg' : 'pos';
  const barPct = Math.max(2, Math.round((r.implied_value_usd / MAX_IMPLIED) * 100));
  const scope = r.is_watchlist
    ? '<span class="pill pill-watch">Watchlist</span>'
    : '<span class="pill">Early</span>';
  const parent = r.possible_parent ? ' <span class="pill pill-parent" title="May share a parent or token with another protocol; implied value is halved">possible parent</span>' : '';
  return `<tr data-slug="${esc(r.slug)}" class="${S.p === r.slug ? 'selected' : ''}" tabindex="0">
    <td class="num">${r.rank}</td>
    <td><div class="name">${esc(r.name)}${parent}</div><div class="sub">${esc(r.category || 'Uncategorized')} · ${esc(r.chains.slice(0, 3).join(', ') || '—')}</div></td>
    <td class="num">${fmtUsd(r.tvl_usd)}</td>
    <td class="num ${pctClass}">${pct}</td>
    <td class="num">${fmtAge(r.age_days)}</td>
    <td class="imp"><div class="bar" style="width:${barPct}%"></div><span class="num">${fmtUsd(r.implied_value_usd)}</span></td>
    <td>${scope}</td>
    <td><span class="dot"></span> no token</td>
  </tr>`;
}

function liveRowHtml(r) {
  const pct = fmtPct(r.change_7d);
  const pctClass = r.change_7d === null ? '' : r.change_7d < 0 ? 'neg' : 'pos';
  return `<tr>
    <td><div class="name">${esc(r.name)}</div><div class="sub">${esc(r.category || 'Uncategorized')} · ${esc(r.chains.slice(0, 3).join(', ') || '—')}</div></td>
    <td class="num">${fmtUsd(r.tvl_usd)}</td>
    <td class="num">${fmtUsd(r.mcap_usd)}</td>
    <td class="num ${pctClass}">${pct}</td>
  </tr>`;
}

function drawerHtml(r) {
  const steps = farmSteps(r);
  const discountLine = r.possible_parent
    ? `<div class="kv"><span>Kin discount</span><span class="num">×0.5 — possible parent</span></div>`
    : '';
  const parentNote = r.possible_parent
    ? `<p class="note">Possible parent: this protocol may share a parent or token with another protocol, so its standalone implied value is halved. The snapshot does not carry parent data, so the flag is a caution, not a verdict.</p>`
    : '';
  const stepItems = steps
    .map((step) => {
      const [action, rest] = step.split(' Cost: ');
      return `<li><div class="step-action">${esc(action || '')}</div><div class="step-cost">Cost: ${esc(rest || '')}</div></li>`;
    })
    .join('');
  return `<aside class="drawer" role="dialog" aria-label="Protocol detail">
    <button class="drawer-close" data-action="close" aria-label="Close detail">×</button>
    <div class="drawer-head">
      <div class="drawer-rank">#${r.rank} of ${R.board_size}</div>
      <h2>${esc(r.name)}</h2>
      <div class="sub">${esc(r.category || 'Uncategorized')} · ${esc(r.chains.join(', ') || '—')}</div>
    </div>
    <div class="kv"><span>TVL</span><span class="num">${fmtUsd(r.tvl_usd)}</span></div>
    <div class="kv"><span>7d change</span><span class="num">${fmtPct(r.change_7d)}</span></div>
    <div class="kv"><span>Age</span><span class="num">${fmtAge(r.age_days)}</span></div>
    <div class="kv"><span>Power-law base</span><span class="num">${fmtUsd(r.base_value_usd)}</span></div>
    ${discountLine}
    <div class="kv kv-total"><span>Implied value</span><span class="num">${fmtUsd(r.implied_value_usd)}</span></div>
    ${parentNote}
    <h3>Farm plan — $${r.capital_usd} capital, hold ${r.hold_days}d</h3>
    <ol class="steps">${stepItems}</ol>
  </aside>`;
}

function render() {
  const board = document.getElementById('board');
  if (!board) return;
  const rows = S.token === 'pre' ? visibleRows() : [];
  const live = S.token === 'live' ? visibleLive() : [];
  const shown = S.token === 'pre' ? rows : live;
  const top = ROWS.slice(0, 3);
  const spot = top
    .map(
      (r) => `<article class="spot">
        <div class="spot-badge">#${r.rank}</div>
        <h3>${esc(r.name)}</h3>
        <div class="sub">${esc(r.category || 'Uncategorized')} · ${esc(r.chains.slice(0, 2).join(', ') || '—')}</div>
        <div class="spot-value">${fmtUsd(r.implied_value_usd)}</div>
        <div class="sub">TVL ${fmtUsd(r.tvl_usd)} · 7d ${fmtPct(r.change_7d)}</div>
      </article>`,
    )
    .join('');
  const farmNext = R.farm_next
    .map(
      (f) => `<li><span class="fn-rank">#${f.rank}</span> <span class="fn-name">${esc(f.name)}</span> <span class="fn-num num">${fmtUsd(f.implied_value_usd)} · $${f.capital_usd} · ${f.hold_days}d</span></li>`,
    )
    .join('');
  const catOptions = ['<option value="">All categories</option>']
    .concat(CATEGORIES.map((c) => `<option value="${esc(c)}"${S.cat === c ? ' selected' : ''}>${esc(c)}</option>`))
    .join('');
  const tableHead =
    S.token === 'pre'
      ? `<thead><tr>
          <th data-sort="rank" class="sortable num">Rank${sortArrow('rank')}</th>
          <th>Protocol</th>
          <th data-sort="tvl" class="sortable num">TVL${sortArrow('tvl')}</th>
          <th data-sort="change" class="sortable num">7d${sortArrow('change')}</th>
          <th data-sort="age" class="sortable num">Age${sortArrow('age')}</th>
          <th data-sort="implied" class="sortable num">Implied value${sortArrow('implied')}</th>
          <th>Scope</th><th>Token</th>
        </tr></thead>`
      : `<thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead>`;
  const tableBody =
    S.token === 'pre'
      ? rows.map(rowHtml).join('')
      : live.map(liveRowHtml).join('');
  const selected = S.p ? ROWS.find((r) => r.slug === S.p) : undefined;
  board.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-dot"></span>TOKEN RADAR</div>
    <div class="meta">Snapshot ${esc(R.as_of)} · ${esc(R.source)} protocol index · Model ${esc(R.model.version)}</div>
  </header>
  <h1>${R.watchlist_size} watchlist protocols, <em>ranked by implied value</em></h1>
  <p class="lede">The watchlist is the floor: every protocol with at least $50M of TVL and no token on record. The early radar adds ${R.early_size} pre-token protocols below that floor and above it. Implied value is a model, not a promise.</p>
  <section class="stats" aria-label="Board summary">
    <div class="stat"><div class="stat-num">${R.watchlist_size}/${R.watchlist_size}</div><div class="stat-label">Watchlist covered</div></div>
    <div class="stat"><div class="stat-num">${R.board_size}</div><div class="stat-label">Pre-token rows scored</div></div>
    <div class="stat"><div class="stat-num">${fmtUsd(MAX_IMPLIED)}</div><div class="stat-label">Top implied value</div></div>
    <div class="stat"><div class="stat-num">${fmtUsd(MEDIAN_IMPLIED)}</div><div class="stat-label">Median implied value</div></div>
  </section>
  <section class="spots" aria-label="Top three">${spot}</section>
  <section class="panels">
    <div class="panel">
      <h2>Model — ${esc(R.model.version)}</h2>
      <p>${esc(R.model.kind)}. log10(mcap) = ${FIT.intercept.toFixed(4)} + ${FIT.slope.toFixed(4)} × log10(tvl), R² ${FIT.r2.toFixed(3)}, n = ${FIT.n}.</p>
      <p>Leave-one-out: the model misses the typical protocol by ×${R.model.loo.typical_miss_model.toFixed(2)}; a flat multiple misses by ×${R.model.loo.typical_miss_flat.toFixed(2)}.</p>
      <p>${esc(R.model.kin_discount.note)}</p>
    </div>
    <div class="panel">
      <h2>Market line</h2>
      <p>The market pays a shrinking multiple of TVL as protocols get bigger: a $100M protocol prices at about ×${(baseValue(100000000) / 100000000).toFixed(1)} its TVL, a $1B protocol at about ×${(baseValue(1000000000) / 1000000000).toFixed(1)}.</p>
      <p>That is why the board is a power law and not a flat multiple: the flat multiple is wrong by a factor of five on the typical protocol.</p>
    </div>
    <div class="panel">
      <h2>Farm next</h2>
      <p>Highest implied value per dollar of farm capital, by hold days:</p>
      <ol class="farm-next">${farmNext}</ol>
    </div>
  </section>
  <div class="controls">
    <input type="search" id="q" placeholder="Search name, slug or category" value="${esc(S.q)}" aria-label="Search">
    <select id="cat" aria-label="Category">${catOptions}</select>
    <div class="tabs" role="tablist" aria-label="Scope">
      <button data-scope="all" class="${S.scope === 'all' ? 'active' : ''}">All</button>
      <button data-scope="watchlist" class="${S.scope === 'watchlist' ? 'active' : ''}">Watchlist</button>
      <button data-scope="early" class="${S.scope === 'early' ? 'active' : ''}">Early</button>
    </div>
    <div class="tabs" role="tablist" aria-label="Token">
      <button data-token="pre" class="${S.token === 'pre' ? 'active' : ''}">Pre-token</button>
      <button data-token="live" class="${S.token === 'live' ? 'active' : ''}">Live token</button>
    </div>
    <span class="count">${shown.length} rows shown</span>
  </div>
  <div class="table-wrap" id="table"><table>
    ${tableHead}
    <tbody>${tableBody || `<tr><td colspan="8" class="empty">No rows match this filter.</td></tr>`}</tbody>
  </table></div>
  <p class="foot">Implied value is a valuation, not a forecast: it does not predict whether or when a token launches, and “no token on record” is never written as “no token”. ${R.possible_parent_size} rows are flagged possible parent and discounted ×0.5.</p>
  ${selected ? drawerHtml(selected) : ''}`;
  board.setAttribute('aria-busy', 'false');
}

/* ---------- events ---------- */

function bind() {
  const board = document.getElementById('board');
  if (!board) return;
  board.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const closeBtn = target.closest('[data-action="close"]');
    if (closeBtn) {
      S.p = '';
      writeHash(S);
      render();
      return;
    }
    const scopeBtn = target.closest('[data-scope]');
    if (scopeBtn) {
      S.scope = scopeBtn.getAttribute('data-scope');
      writeHash(S);
      render();
      return;
    }
    const tokenBtn = target.closest('[data-token]');
    if (tokenBtn) {
      S.token = tokenBtn.getAttribute('data-token');
      writeHash(S);
      render();
      return;
    }
    const th = target.closest('th[data-sort]');
    if (th) {
      const key = th.getAttribute('data-sort');
      if (S.sort === key) {
        S.dir = S.dir === -1 ? 1 : -1;
      } else {
        S.sort = key;
        S.dir = defaultDir(key);
      }
      writeHash(S);
      render();
      return;
    }
    const tr = target.closest('tr[data-slug]');
    if (tr) {
      S.p = tr.getAttribute('data-slug');
      writeHash(S);
      render();
      return;
    }
  });
  board.addEventListener('input', (event) => {
    const target = event.target;
    if (!target || target.id === 'q') {
      S.q = target ? target.value : '';
      writeHash(S);
      render();
      const q = document.getElementById('q');
      if (q && typeof q.focus === 'function') {
        q.focus();
        if (typeof q.setSelectionRange === 'function') q.setSelectionRange(q.value.length, q.value.length);
      }
    }
  });
  board.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.id === 'cat') {
      S.cat = target.value;
      writeHash(S);
      render();
    }
  });
  board.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && S.p) {
      S.p = '';
      writeHash(S);
      render();
      return;
    }
    if (event.key === 'Enter') {
      const target = event.target;
      if (target && typeof target.closest === 'function') {
        const tr = target.closest('tr[data-slug]');
        if (tr) {
          S.p = tr.getAttribute('data-slug');
          writeHash(S);
          render();
        }
      }
    }
  });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('hashchange', () => {
      S = readHash();
      render();
    });
  }
}

render();
bind();
