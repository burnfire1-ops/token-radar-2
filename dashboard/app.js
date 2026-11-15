// Token Radar's dashboard (radar-11, v11). Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail view with the model's own inputs,
// the protocol's costed farm plan at three capitals, the live-token comparables, the set-aside
// list, the method and backtest tab, the family and fee tables, the research note, and the
// interactive lab. No network: every byte it shows is in data.js. No name is special-cased.
// The detail view recomputes each row's farm economics live from the row's own figures
// (slice = capital / (TVL + capital) x share x implied; net = P(launch) x slice - fees -
// T-bill, at the point and at both band ends); at the default $1,000 / 10% with breadth on
// it must match board.json exactly.
(function () {
  'use strict';
  var R = window.RADAR;
  var rows = R.board;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ---- formatting ---------------------------------------------------------
  function money(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  }
  function money2(n) { return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }
  function int(n) { return n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pct(n, d) { return (n * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function vlabel(v) { return v === 'robust' ? 'ROBUST' : v === 'farm' ? 'FARM' : v === 'thin' ? 'THIN' : 'SKIP'; }
  function vclass(v) { return 'v-' + v; }
  function ageStr(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return (d / 30).toFixed(1) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }

  // ---- farm economics, live ----------------------------------------------
  // Replicates lib/model.ts planNumbers + breakEvenCapital + breakEvenShare.
  // The band multipliers are the row's own P25/P75 over its point implied
  // value, so toggling breadth rescales the band with the implied value.
  function econOf(r, capital, share, breadthOn) {
    var implied = r.implied_value_usd;
    if (!breadthOn && r.model.multi_chain) implied = Math.max(1, Math.round(implied / r.model.breadth_factor));
    var p = r.model.p_launch;
    var mult25 = r.model.p25_usd / r.implied_value_usd;
    var mult75 = r.model.p75_usd / r.implied_value_usd;
    var slice = (capital / (r.tvl + capital)) * share * implied;
    var s25 = slice * mult25;
    var s75 = slice * mult75;
    var fees = r.farm.fees_usd;
    var tbill = 0.04 * capital * r.farm.hold_days / 365;
    var net = p * slice - fees - tbill;
    var n25 = p * s25 - fees - tbill;
    var n75 = p * s75 - fees - tbill;
    var verdict = n25 > 0 ? 'robust' : net > 0 ? 'farm' : n75 > 0 ? 'thin' : 'skip';
    var be = null;
    var k = p * share * implied;
    var rate = 0.04 * r.farm.hold_days / 365;
    if (k > 0 && rate > 0) {
      var peak = Math.sqrt((k * r.tvl) / rate) - r.tvl;
      var netAt = function (c) { return p * (c / (r.tvl + c)) * share * implied - fees - rate * c; };
      if (peak > 10 && netAt(peak) > 0) {
        var lo = 10, hi = peak;
        for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (netAt(mid) > 0) hi = mid; else lo = mid; }
        be = Math.round(hi);
      }
    }
    var beShare = null;
    if (p > 0 && implied > 0) {
      var denom = p * (capital / (r.tvl + capital)) * implied;
      if (denom > 0) beShare = (fees + tbill) / denom;
    }
    return { implied: implied, slice: slice, s25: s25, s75: s75, fees: fees, tbill: tbill, net: net, n25: n25, n75: n75, verdict: verdict, be: be, beShare: beShare };
  }

  // ---- state ---------------------------------------------------------------
  var state = { tab: 'board', q: '', verdict: 'all', watch: false, sort: 'rank', sel: null, boardCap: 1000, labSlug: rows[0] ? rows[0].slug : '', labCap: 1000, labShare: 0.1, labBreadth: true };
  function boardEcon(r) { return econOf(r, state.boardCap, 0.1, true); }
  function vcolor(v) { return v === 'robust' ? '#2563eb' : v === 'farm' ? '#16a34a' : v === 'thin' ? '#d97706' : '#dc2626'; }
  function capMoney(c) { return '$' + Math.round(c).toLocaleString('en-US'); }
  function readHash() {
    var h = location.hash || '';
    var m = h.match(/tab=([a-z]+)/); if (m) state.tab = m[1];
    m = h.match(/p=([a-z0-9-]+)/); if (m) state.sel = bySlug[m[1]] ? m[1] : null;
    m = h.match(/verdict=(robust|farm|thin|skip)/); if (m) state.verdict = m[1];
  }
  function writeHash() {
    var parts = ['tab=' + state.tab];
    if (state.sel) parts.push('p=' + state.sel);
    if (state.verdict !== 'all') parts.push('verdict=' + state.verdict);
    history.replaceState(null, '', '#' + parts.join('&'));
  }
  readHash();

  var root = document.getElementById('app');

  // ---- shared bits ---------------------------------------------------------
  function verdictBadge(v) { return '<span class="badge ' + vclass(v) + '">' + vlabel(v) + '</span>'; }
  function plaunchCaveat() {
    return '<p class="caveat">P(launch) is an <b>upper bound</b>: it counts who has launched so far, not who will launch next. ' +
      'Protocols that survived years without launching are "overdue" — their band-mates launched, they did not — so an old ' +
      'pre-token row\'s cell overstates its own chance. Treat the net as the optimistic case, and the walk-away step as the honest one.</p>';
  }
  function plaunchTableHtml() {
    var ages = ['<6mo', '6-12mo', '1-2y', '>2y', 'unknown'];
    var tvls = ['<$10M', '$10-100M', '$100M+'];
    var cell = {};
    R.plaunch.cells.forEach(function (c) { cell[c.age_band + '|' + c.tvl_band] = c; });
    var h = '<table class="mini"><thead><tr><th>Age \\ TVL</th>' + tvls.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + '</tr></thead><tbody>';
    ages.forEach(function (a) {
      h += '<tr><th>' + esc(a) + '</th>';
      tvls.forEach(function (t) {
        var c = cell[a + '|' + t];
        h += '<td><b>' + pct(c.p) + '</b><br><span class="mut">' + c.has_token + '/' + c.n + '</span></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table><p class="mut">Overall ' + pct(R.plaunch.overall_p, 1) + ' (' + R.plaunch.overall_has + '/' + R.plaunch.overall_n + '). ' +
      '"Has a token" means a traded market cap (mcap_usd &gt; 0), not a symbol: 416 of 758 protocols carry a symbol, only 128 carry a cap. ' +
      'The $100M+ column merges $100M–1B and &gt;$1B because the young-age &gt;$1B cells hold 1–3 protocols each; every cell here holds at least 14.</p>';
    return h;
  }

  // ---- board tab -----------------------------------------------------------
  function spotlightHtml() {
    var farms = rows.filter(function (r) { return r.farm.verdict === 'farm'; })
      .sort(function (a, b) { return b.farm.net_usd - a.farm.net_usd; }).slice(0, 5);
    if (!farms.length) return '<p class="mut">No row is FARM at $1,000: no protocol\'s point net pays after launch probability, fees and T-bill. The table below shows why, row by row.</p>';
    var h = '<h3>Spotlight — the ' + farms.length + ' FARM rows at $1,000</h3><div class="spot">';
    farms.forEach(function (r) {
      h += '<div class="spot-card" data-slug="' + esc(r.slug) + '" role="button" tabindex="0">' +
        '<span class="nm">' + esc(r.name) + '</span>' + verdictBadge('farm') +
        '<span class="big">' + money(r.implied_value_usd) + ' implied</span>' +
        '<span class="sub">P(launch) ' + pct(r.model.p_launch) + ' · net ' + money2(r.farm.net_usd) + ' · break-even ' + (r.farm.break_even_capital_usd === null ? 'never' : money(r.farm.break_even_capital_usd)) + '</span></div>';
    });
    return h + '</div>';
  }
  function scatterHtml() {
    var W = 620, H = 340, L = 52, R2 = 12, T = 14, B = 34;
    var xs = rows.map(function (r) { return Math.log10(r.tvl); });
    var ys = rows.map(function (r) { return Math.log10(r.implied_value_usd); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var X = function (x) { return L + (x - x0) / (x1 - x0) * (W - L - R2); };
    var Y = function (y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); };
    var pts = '';
    rows.forEach(function (r) {
      pts += '<circle cx="' + X(Math.log10(r.tvl)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="4" fill="' + vcolor(r.farm.verdict) + '"><title>' + esc(r.name) + ' · ' + money(r.implied_value_usd) + ' · ' + vlabel(r.farm.verdict) + '</title></circle>';
    });
    var curve = '';
    for (var i = 0; i <= 20; i++) {
      var lx = x0 + (x1 - x0) * i / 20;
      var ly = R.model.a + R.model.b * (lx - 8);
      curve += (i ? ' L' : 'M') + X(lx).toFixed(1) + ' ' + Y(ly).toFixed(1);
    }
    var h = '<div class="chart"><h3>Implied value vs TVL</h3>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of implied value against TVL, coloured by verdict">' +
      '<path d="' + curve + '" fill="none" stroke="#ffb81f" stroke-width="2" stroke-dasharray="6 4"/>' + pts +
      '<text x="' + L + '" y="' + (H - 8) + '" fill="#d3c4a4" font-size="12">' + money(Math.pow(10, x0)) + ' TVL</text>' +
      '<text x="' + (W - R2) + '" y="' + (H - 8) + '" fill="#d3c4a4" font-size="12" text-anchor="end">' + money(Math.pow(10, x1)) + ' TVL</text>' +
      '<text x="8" y="' + (T + 4) + '" fill="#d3c4a4" font-size="12">' + money(Math.pow(10, y1)) + '</text>' +
      '<text x="8" y="' + (H - B - 4) + '" fill="#d3c4a4" font-size="12">' + money(Math.pow(10, y0)) + '</text></svg>' +
      '<p class="mut">One dot per row, coloured by verdict at $1,000. Gold dashed line: the fitted size curve. Dots above it beat the curve for their size.</p></div>';
    return h;
  }
  function histHtml() {
    var nets = rows.map(function (r) { return r.farm.net_usd; });
    var lo = Math.min.apply(null, nets), hi = Math.max.apply(null, nets);
    var NB = 16, w = (hi - lo) / NB || 1, bins = [];
    for (var i = 0; i < NB; i++) bins.push(0);
    nets.forEach(function (n) { var b = Math.min(NB - 1, Math.floor((n - lo) / w)); bins[b]++; });
    var mx = Math.max.apply(null, bins);
    var W = 620, H = 220, L = 8, R2 = 8, T = 10, B = 30, bw = (W - L - R2) / NB;
    var bars = '';
    bins.forEach(function (c, i) {
      var bh = mx ? (H - T - B) * c / mx : 0;
      var mid = lo + (i + 0.5) * w;
      bars += '<rect x="' + (L + i * bw + 1).toFixed(1) + '" y="' + (H - B - bh).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + (mid >= 0 ? '#16a34a' : '#dc2626') + '"/>';
    });
    var pos = nets.filter(function (n) { return n > 0; }).length;
    var h = '<div class="chart"><h3>Net at $1,000 — distribution</h3>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Histogram of net at 1000 dollars">' +
      bars +
      '<text x="' + L + '" y="' + (H - 8) + '" fill="#d3c4a4" font-size="12">' + money2(lo) + '</text>' +
      '<text x="' + (W - R2) + '" y="' + (H - 8) + '" fill="#d3c4a4" font-size="12" text-anchor="end">' + money2(hi) + '</text></svg>' +
      '<p class="mut"><b style="color:#4ade80">' + pos + ' of 192 rows</b> are net-positive at $1,000. Green bars pay, red bars do not — most of the board sits left of zero.</p></div>';
    return h;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.watch && !r.is_watchlist) return false;
      if (state.verdict !== 'all' && boardEcon(r).verdict !== state.verdict) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0 && r.category.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var s = state.sort;
    list.sort(function (a, b) {
      if (s === 'implied') return b.implied_value_usd - a.implied_value_usd;
      if (s === 'net') return boardEcon(b).net - boardEcon(a).net;
      if (s === 'tvl') return b.tvl - a.tvl;
      if (s === 'plaunch') return b.model.p_launch - a.model.p_launch;
      return a.rank - b.rank;
    });
    return list;
  }
  function boardHtml() {
    var vc = R.verdict_counts;
    var list = filteredRows();
    var h = '<section><div class="hero"><h1>Token Radar <span class="mut">radar-11 · v11</span></h1>' +
      '<p>Pre-token protocols ranked by implied value — what the protocol would be worth if it launched a token today, ' +
      'priced off the snapshot\'s own traded tokens. Net = P(launch) × slice − fees − T-bill. Snapshot ' + esc(R.as_of) + ', ' +
      int(R.universe.total) + ' protocols ≥ $5M TVL, ' + int(R.universe.ranked) + ' ranked, ' + int(R.universe.traded) + ' traded, ' +
      int(R.universe.set_aside) + ' set aside.</p></div>' +
      '<div class="cards">' +
      '<div class="card"><b>' + int(R.universe.ranked) + '</b><span>rows · median ' + money(R.median_implied) + '</span></div>' +
      '<div class="card vc-robust"><b>' + vc.robust + ' ROBUST</b><span>low end pays</span></div>' +
      '<div class="card vc-farm"><b>' + vc.farm + ' FARM</b><span>point pays</span></div>' +
      '<div class="card vc-thin"><b>' + vc.thin + ' THIN</b><span>high end only</span></div>' +
      '<div class="card vc-skip"><b>' + vc.skip + ' SKIP</b><span>nothing pays</span></div>' +
      '<div class="card"><b>' + pct(R.plaunch.overall_p, 1) + '</b><span>overall P(launch)</span></div>' +
      '</div>' +
      spotlightHtml() +
      '<div class="charts">' + scatterHtml() + histHtml() + '</div>' +
      '<div class="capbar"><label for="cap">Table capital <b id="cap-val">' + capMoney(state.boardCap) + '</b></label>' +
      '<input id="cap" type="range" min="2" max="4" step="0.01" value="' + Math.log10(state.boardCap).toFixed(2) + '" aria-label="Table capital, 100 to 10000 dollars, log scale">' +
      '<span class="note">Drag to reprice the table: Net, Verdict and $/h follow the chosen capital. The verdict cards above stay at the standard $1,000.</span></div>' +
      '<div class="filters">' +
      '<input id="q" type="search" placeholder="Search name, slug or category…" value="' + esc(state.q) + '">' +
      '<select id="f-verdict"><option value="all">All verdicts</option>' +
      ['robust', 'farm', 'thin', 'skip'].map(function (v) { return '<option value="' + v + '"' + (state.verdict === v ? ' selected' : '') + '>' + vlabel(v) + '</option>'; }).join('') + '</select>' +
      '<label class="chk"><input id="f-watch" type="checkbox"' + (state.watch ? ' checked' : '') + '> Watchlist only (' + R.watchlist_size + ')</label>' +
      '<select id="f-sort">' +
      [['rank', 'Rank'], ['implied', 'Implied value'], ['net', 'Net (table capital)'], ['tvl', 'TVL'], ['plaunch', 'P(launch)']].map(function (o) { return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="mut">' + list.length + ' rows</span></div>' +
      '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Implied</th><th>P(launch)</th><th>Net <span id="cap-hdr">' + capMoney(state.boardCap) + '</span></th><th>Verdict</th><th>$/h</th></tr></thead><tbody>';
    list.forEach(function (r) {
      var e = boardEcon(r);
      var ph = e.net / (r.farm.time_minutes / 60);
      h += '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '">' +
        '<td>' + r.rank + '</td><td><b>' + esc(r.name) + '</b>' + (r.is_watchlist ? ' <span class="wl">★</span>' : '') + (r.sibling ? ' <span class="mut" title="Watchlist sibling of a traded token, ×0.50">sib</span>' : '') + '<br><span class="mut">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td><td>' + money(r.tvl) + '</td><td>' + money(r.implied_value_usd) + '</td>' +
        '<td>' + pct(r.model.p_launch) + '</td><td class="net ' + (e.net >= 0 ? 'num-pos' : 'num-neg') + '">' + money2(e.net) + '</td><td class="vd">' + verdictBadge(e.verdict) + '</td>' +
        '<td class="ph ' + (ph >= 0 ? 'num-pos' : 'num-neg') + '">' + money2(ph) + '</td></tr>';
    });
    h += '</tbody></table>' + plaunchCaveat() + '</section>';
    return h;
  }

  // ---- detail drawer -------------------------------------------------------
  function tierHtml(r, t) {
    var h = '<div class="tier"><h4>$' + int(t.capital_usd) + ' plan · ' + esc(t.chain) + ' · ' + verdictBadge(t.verdict) + '</h4>' +
      '<p>Slice ' + money(t.slice_usd) + ' · net ' + money2(t.net_usd) + ' (P25 ' + money2(t.net_p25_usd) + ' / P75 ' + money2(t.net_p75_usd) + ') · ' +
      'fees ' + money2(t.fees_usd) + ' · hold ' + t.hold_days + 'd · ' + t.time_minutes + ' min · ' + money2(t.per_hour_usd) + '/h</p><ol>';
    t.steps.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
    return h + '</ol></div>';
  }
  function drawerHtml() {
    var r = bySlug[state.sel];
    if (!r) return '';
    var e = econOf(r, 1000, 0.1, true);
    var h = '<aside class="drawer"><button class="close" id="drawer-close">✕ close</button>' +
      '<h2>' + esc(r.name) + ' <span class="mut">#' + r.rank + '</span></h2>' +
      '<p>' + esc(r.category) + ' · ' + r.chains.map(esc).join(', ') + ' · TVL ' + money(r.tvl) + ' · age ' + ageStr(r.age_days) +
      (r.change_7d === null ? '' : ' · 7d ' + (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      (r.is_watchlist ? ' · <span class="wl">★ watchlist</span>' : '') + (r.sibling ? ' · watchlist sibling ×0.50' : '') + '</p>' +
      '<h3>Implied value ' + money(r.implied_value_usd) + ' <span class="mut">(P10 ' + money(r.model.p10_usd) + ' – P90 ' + money(r.model.p90_usd) + ')</span></h3>' +
      '<p class="mut">P25 ' + money(r.model.p25_usd) + ' · P75 ' + money(r.model.p75_usd) + ' · ' + r.model.implied_tvl_multiple.toFixed(2) + '× TVL · ' +
      'blind LOO within-3× ' + pct(r.model.loo_within3) + ' · OOS miss ×' + r.model.oos_miss.toFixed(2) + ' (2025) / ×' + r.model.oos2024_miss.toFixed(2) + ' (2024)</p>' +
      '<table class="mini"><thead><tr><th>Factor</th><th>Value</th><th>What it is</th></tr></thead><tbody>' +
      '<tr><td>Curve</td><td>' + money(r.model.curve_usd) + '</td><td>log-log size curve on 101 comps</td></tr>' +
      '<tr><td>Family</td><td>×' + r.model.family_factor.toFixed(3) + '</td><td>' + esc(r.category) + ' residual, shrunk n/(n+20)</td></tr>' +
      '<tr><td>Growth</td><td>×' + r.model.growth_factor.toFixed(3) + '</td><td>TVL carried 2 weeks at the 7-day rate</td></tr>' +
      '<tr><td>Seasoning</td><td>×' + r.model.seasoning_factor.toFixed(3) + '</td><td>age factor, 0.70 at launch → 1.15 at 18mo → 0.95</td></tr>' +
      '<tr><td>Sibling</td><td>×' + r.model.sibling_factor.toFixed(2) + '</td><td>watchlist sibling of a traded token</td></tr>' +
      '<tr><td>Breadth</td><td>×' + r.model.breadth_factor.toFixed(4) + '</td><td>' + (r.model.multi_chain ? 'multi-chain (β ' + r.model.breadth_beta.toFixed(4) + ')' : 'single-chain') + '</td></tr>' +
      '</tbody></table>' +
      '<h3>Launch probability ' + pct(r.model.p_launch) + ' ' + verdictBadge(r.farm.verdict) + '</h3>' +
      '<p>Age band ' + esc(plaunchAge(r)) + ' × TVL band ' + esc(plaunchTvl(r)) + ': ' + plaunchCellText(r) + ' of protocols in this band have a traded token. ' +
      'Overall ' + pct(R.plaunch.overall_p, 1) + '.</p>' + plaunchCaveat() +
      '<h3>Farm economics — $1,000 · 10% share · ' + esc(r.farm.chain) + '</h3>' +
      '<table class="mini"><tbody>' +
      '<tr><td>Slice (point)</td><td>' + money(e.slice) + '</td><td>P25 ' + money(e.s25) + ' · P75 ' + money(e.s75) + '</td></tr>' +
      '<tr><td>Expected slice</td><td>' + money(r.model.p_launch * e.slice) + '</td><td>P(launch) × slice</td></tr>' +
      '<tr><td>Fees</td><td>' + money2(e.fees) + '</td><td>cheapest of first 3 chains: 2× bridge + 5× gas</td></tr>' +
      '<tr><td>T-bill given up</td><td>' + money2(e.tbill) + '</td><td>4% a year over ' + r.farm.hold_days + ' days</td></tr>' +
      '<tr><td><b>Net (point)</b></td><td><b>' + money2(e.net) + '</b></td><td>P25 ' + money2(e.n25) + ' · P75 ' + money2(e.n75) + '</td></tr>' +
      '<tr><td>Break-even capital</td><td>' + (e.be === null ? '<b>never breaks even</b>' : money(e.be)) + '</td><td>smallest deposit whose point net is positive</td></tr>' +
      '<tr><td>Break-even share</td><td>' + (e.beShare === null ? '—' : (e.beShare * 100).toFixed(1) + '%') + '</td><td>airdrop share at which the $1,000 plan nets zero</td></tr>' +
      '<tr><td>Time</td><td>' + r.farm.time_minutes + ' min · ' + money2(r.farm.per_hour_usd) + '/h</td><td>time valued at $15/h: ' + money2(r.farm.time_usd) + '</td></tr>' +
      '</tbody></table>' +
      '<h3>Plans by capital</h3>';
    r.farm_tiers.forEach(function (t) { h += tierHtml(r, t); });
    h += '<h3>Sensitivity — point net at other shares and capitals</h3>' +
      '<table class="mini"><thead><tr><th>Share \\ Capital</th><th>$100</th><th>$500</th><th>$1,000</th><th>$5,000</th><th>$10,000</th></tr></thead><tbody>';
    var shares = ['5%', '10%', '15%'];
    r.farm.sensitivity.forEach(function (row, i) {
      h += '<tr><th>' + shares[i] + '</th>' + row.map(function (v) { return '<td>' + money2(v) + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table></aside>';
  }
  function plaunchAge(r) {
    if (r.age_days === null) return 'unknown';
    if (r.age_days < 180) return '<6mo';
    if (r.age_days < 365) return '6-12mo';
    if (r.age_days < 730) return '1-2y';
    return '>2y';
  }
  function plaunchTvl(r) {
    if (r.tvl < 1e7) return '<$10M';
    if (r.tvl < 1e8) return '$10-100M';
    return '$100M+';
  }
  function plaunchCellText(r) {
    var a = plaunchAge(r), t = plaunchTvl(r);
    for (var i = 0; i < R.plaunch.cells.length; i++) {
      var c = R.plaunch.cells[i];
      if (c.age_band === a && c.tvl_band === t) return pct(c.p) + ' (' + c.has_token + '/' + c.n + ')';
    }
    return pct(R.plaunch.overall_p, 1);
  }

  // ---- comps tab -------------------------------------------------------------
  function compsHtml() {
    var h = '<section><h1>Live-token comparables</h1>' +
      '<p>The 101 traded tokens the size curve is fitted on. The snapshot holds 128 live tokens; 27 are dropped: ' +
      'bridges, canonical bridges and CEX tokens, versioned names, and mcap/TVL outside [1/500, 50]. ' +
      'Fitted = curve × family × growth × seasoning × breadth on the full fit. Miss = how many times off the real cap.</p>' +
      '<table class="board"><thead><tr><th>#</th><th>Token</th><th>Category</th><th>TVL</th><th>Real cap</th><th>Fitted</th><th>Miss</th></tr></thead><tbody>';
    R.comps.forEach(function (c, i) {
      h += '<tr><td>' + (i + 1) + '</td><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.category) + '</td><td>' + money(c.tvl) + '</td><td>' + money(c.mcap) + '</td><td>' + money(c.fitted) + '</td><td>×' + c.miss.toFixed(2) + '</td></tr>';
    });
    h += '</tbody></table><p class="mut">Median miss on the full fit is lower than the leave-one-out miss ×' + R.model.loo_miss.toFixed(2) +
      ' because each token helped fit its own curve. The honest number is the LOO one — see the method tab.</p></section>';
    return h;
  }

  // ---- set-aside tab ---------------------------------------------------------
  function setAsideHtml() {
    var u = R.universe;
    var h = '<section><h1>Set aside</h1>' +
      '<p>Universe arithmetic: ' + int(u.total) + ' protocols = ' + int(u.ranked) + ' ranked + ' + int(u.traded) + ' traded + ' + int(u.set_aside) + ' set aside. ' +
      'Nothing is silently dropped: every protocol the radar does not rank is listed here with its reason.</p>' +
      '<h3>Traded (' + R.live.length + ')</h3><p class="mut">Protocols with a market cap. They price the curve; they are never ranked as pre-token.</p>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap/TVL</th></tr></thead><tbody>';
    R.live.forEach(function (l) {
      h += '<tr><td><b>' + esc(l.name) + '</b></td><td>' + esc(l.category) + '</td><td>' + money(l.tvl) + '</td><td>' + money(l.mcap_usd) + '</td><td>' + (l.fdv_tvl === null ? '—' : l.fdv_tvl.toFixed(2) + '×') + '</td></tr>';
    });
    h += '</tbody></table><h3>Set aside (' + R.set_aside_rows.length + ')</h3>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Reason</th></tr></thead><tbody>';
    R.set_aside_rows.forEach(function (s) {
      h += '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.category) + '</td><td>' + money(s.tvl) + '</td><td>' + esc(s.reason) + '</td></tr>';
    });
    return h + '</tbody></table></section>';
  }

  // ---- method tab ------------------------------------------------------------
  function methodHtml() {
    var m = R.model;
    var h = '<section><h1>Method and backtest</h1>' +
      '<h3>The model — radar-11</h3><p>A linear size curve on the snapshot\'s own traded tokens: ' +
      'log10(mcap) = ' + m.a.toFixed(4) + ' + ' + m.b.toFixed(4) + ' × log10(TVL / $100M), fitted on ' + m.comps_count + ' comps ' +
      '(R² ' + m.r2.toFixed(3) + '), then adjusted by family (mean log residual per category, shrunk n/(n+20), capped [0.5, 2.5]), ' +
      'growth (TVL carried two weeks ahead at the 7-day rate), seasoning (piecewise age factor: ×0.70 at launch, ×1.15 at 18 months, ×0.95 after 5 years; ' +
      'unknown age = ×1), sibling (×0.50 for a watchlist sibling of a traded token), and breadth (binary multi-chain indicator, ridge λ = 10n, ' +
      'β ' + m.breadth_beta.toFixed(4) + ', ' + m.breadth_multi_count + ' of ' + m.comps_count + ' comps multi-chain, applied multiplier capped [0.85, 1.18]). ' +
      'No kin discount anywhere. No Huber trim. No chain factor.</p>' +
      '<h3>Backtest — median multiplicative miss</h3>' +
      '<table class="mini"><thead><tr><th>Split</th><th>This model</th><th>Flat anchor</th><th>Bar (v9)</th></tr></thead><tbody>' +
      '<tr><td>Leave-one-out (' + m.comps_count + ' tokens)</td><td><b>×' + m.loo_miss.toFixed(4) + '</b> · within-3× ' + pct(m.loo_within3) + ' · within-10× ' + pct(m.loo_within10) + '</td><td>×' + m.loo_flat_miss.toFixed(2) + ' · within-3× ' + pct(m.loo_flat_within3) + '</td><td>×' + m.anchors.v9.toFixed(4) + '</td></tr>' +
      '<tr><td>Time split 2025 (' + m.oos_train + ' train / ' + m.oos_test + ' test)</td><td><b>×' + m.oos_miss.toFixed(4) + '</b> · within-3× ' + pct(m.oos_within3) + '</td><td>×' + m.oos_flat_miss.toFixed(2) + ' · within-3× ' + pct(m.oos_flat_within3) + '</td><td>×' + m.anchors.v9.toFixed(4) + '</td></tr>' +
      '<tr><td>Time split 2024 (' + m.oos2024_train + ' train / ' + m.oos2024_test + ' test)</td><td><b>×' + m.oos2024_miss.toFixed(4) + '</b> · within-3× ' + pct(m.oos2024_within3) + '</td><td>×' + m.oos2024_flat_miss.toFixed(2) + ' · within-3× ' + pct(m.oos2024_flat_within3) + '</td><td>×' + m.anchors.v9.toFixed(4) + '</td></tr>' +
      '<tr><td>Curve only (no family/growth/seasoning/breadth)</td><td>×' + m.curve_only_loo.toFixed(2) + '</td><td>—</td><td>—</td></tr>' +
      '</tbody></table>' +
      '<p class="mut">The band: P10 ×' + m.p10 + ', P25 ×' + m.p25 + ', P75 ×' + m.p75 + ', P90 ×' + m.p90 + ' of the point value, from the blind LOO residuals. ' +
      'Calibration: ' + pct(m.band50) + ' of tokens fall inside their own 50% band, ' + pct(m.band80) + ' inside the 80% band. ' +
      'Factor check: blind residuals correlate ' + m.factor_growth_r.toFixed(2) + ' with growth and ' + m.factor_age_r.toFixed(2) + ' with log age — nothing left on the table. ' +
      'Top leaderboard entry reports OOS ×2.01 on the same metric (median miss, chronological split).</p>' +
      '<h3>P(launch) — empirical age × TVL table</h3>' + plaunchTableHtml() + plaunchCaveat() +
      '<h3>Family factors</h3><table class="mini"><thead><tr><th>Category</th><th>Tokens</th><th>Factor</th></tr></thead><tbody>';
    R.family.forEach(function (f) { h += '<tr><td>' + esc(f.category) + '</td><td>' + f.tokens + '</td><td>×' + f.factor.toFixed(3) + '</td></tr>'; });
    h += '</tbody></table><h3>Chain fees (USD)</h3><table class="mini"><thead><tr><th>Chain</th><th>Gas</th><th>Bridge</th><th>Plan fees (2× bridge + 5× gas)</th></tr></thead><tbody>';
    Object.keys(R.fees).sort().forEach(function (c) {
      var f = R.fees[c];
      h += '<tr><td>' + esc(c) + '</td><td>' + money2(f.gas) + '</td><td>' + money2(f.bridge) + '</td><td>' + money2(2 * f.bridge + 5 * f.gas) + '</td></tr>';
    });
    return h + '</tbody></table><p class="mut">A plan uses the cheapest of the protocol\'s first three chains. Default chain (unknown): gas $1.00, bridge $2.50.</p></section>';
  }

  // ---- research note ---------------------------------------------------------
  function researchHtml() {
    var h = '<section><h1>Research note — what was tested, what was dropped, and what this radar does not know</h1>' +
      '<h3>Tested and dropped (v11 experiments, 29 candidates, model stays radar-11)</h3>' +
      '<table class="mini"><thead><tr><th>Idea</th><th>Result</th><th>Verdict</th></tr></thead><tbody>' +
      '<tr><td>Restricted comps (drop infra, 90 comps)</td><td>LOO ×3.0437, OOS25 ×1.9921, OOS24 ×2.2160</td><td>Hurts all three splits</td></tr>' +
      '<tr><td>Full einsteincy recipe (restricted comps + no growth/seasoning/breadth)</td><td>LOO ×3.5826, OOS24 ×2.8183</td><td>Hurts badly</td></tr>' +
      '<tr><td>Remove growth / seasoning</td><td>Both hurt LOO and OOS</td><td>Keep both</td></tr>' +
      '<tr><td>Family k=20 vs k=3</td><td>k=20 still best; k=3 worst</td><td>Keep k=20</td></tr>' +
      '<tr><td>Parent-aggregation of comps</td><td>LOO ×2.8308, OOS25 ×1.9571, OOS24 ×2.0750</td><td>Neutral — not adopted</td></tr>' +
      '<tr><td>Mechanism grouping</td><td>OOS25 ×2.4947, OOS24 ×3.1083</td><td>Hurts badly</td></tr>' +
      '<tr><td>Sibling ×0.5</td><td>Kept</td><td>Validated in v9</td></tr>' +
      '<tr><td>Chain breadth binary</td><td>LOO ×2.8207, OOS25 ×1.9294, OOS24 ×2.0938</td><td>The one v10 improvement</td></tr>' +
      '</tbody></table>' +
      '<h3>The einsteincy attribution — a negative result</h3>' +
      '<p>Rank 13 (einsteincy) reports that dropping infra categories improves its time-split miss from ×2.91 to ×2.08. ' +
      'That gain does not transfer. Reproducing its 94-comp set gives OOS24 ×2.0846 but LOO ×3.2859; this radar\'s 101 comps already get ' +
      'OOS24 ×2.0938 with LOO ×2.82. The gain is the Bridge/CEX drop — already in rank 1\'s recipe and in this radar — not the infra drop. ' +
      'Its 94 keeps four junk comps (Aave V2, a versioned listing; Concentrator; Obol; Rain — ratio outliers) that this radar\'s trimming removes. ' +
      'Adopting the idea without the attribution check would have made the model worse on every split.</p>' +
      '<h3>How the P(launch) bands were derived</h3>' +
      '<p>For each age × TVL band: (protocols in the band with a traded token) / (all protocols in the band), "with a token" = mcap_usd &gt; 0. ' +
      'Overall 0.169 (128/758). The $100M+ column merges $100M–1B and &gt;$1B because the young-age &gt;$1B cells hold 1–3 protocols each; ' +
      'every merged cell holds at least 14. The table is non-monotone on purpose: the 1–2y band dips below the 6–12mo band, and in the older bands ' +
      'the &lt;$10M column launches more often than $10–100M — small old protocols either launch or die, while mid-size ones can linger. ' +
      'Unknown-age rows (113 protocols, no listed_at) launch most often (0.21–0.35): they are disproportionately new listings whose date the snapshot lacks, not old survivors.</p>' +
      '<h3>Starter audit — what the sealed snapshot does and does not contain</h3>' +
      '<p>The snapshot (as of 2026-11-14) holds 758 protocols at ≥ $5M TVL with TVL, 7-day change, category, chains, listed_at, and — for traded tokens — ' +
      'market cap, symbol and gecko_id. It does not contain points programs, launch dates, tokenomics, team or funding information, or any airdrop rules. ' +
      'This radar invents none of those: the points step states the status as known, none confirmed, or inferred-only-by-category-norm with conditional wording. ' +
      'The 40-protocol watchlist is the task\'s own list, not the radar\'s choice. The $1,000 / 10% standard position and the 4% T-bill are stated assumptions, not measurements.</p>' +
      '<h3>Honesty box — what this radar cannot know</h3><ul>' +
      '<li>Whether any single protocol launches, or when. P(launch) is a band rate, and an upper bound for old rows (see the caveat).</li>' +
      '<li>The airdrop share. 10% is an assumption; the sensitivity table shows 5% and 15% too, and the break-even share shows what each row needs.</li>' +
      '<li>Whether a points season exists. No points program is confirmed for any row in the snapshot.</li>' +
      '<li>The exact launch value. The typical error is ×2.82 (LOO); the P25–P75 band is the honest range, not the point.</li>' +
      '<li>Gas at launch week. Fees use November 2026 typical costs; a congested launch costs more.</li></ul>' +
      '<p class="mut">v11 changes vs v10: the model is unchanged (radar-11). New: P(launch) in every net, the 4-way ROBUST verdict, break-even capital and share, ' +
      'the walk-away step, the comps and set-aside tabs, and this note. v10 validation reproduced exactly: LOO ×2.8207, OOS25 ×1.9294, OOS24 ×2.0938. ' +
      'Headline verdicts at $1,000: 0 ROBUST, 5 FARM, 40 THIN, 147 SKIP. No row is ROBUST: the best P25 net is -$4.00 (manifest-trade), so no row\'s low end pays at the ' +
      'standard capital — the launch probability, not the ranking, is the binding constraint. At $10,000 the count is 0 ROBUST, 20 FARM, 41 THIN, 131 SKIP.</p></section>';
    return h;
  }

  // ---- lab tab ---------------------------------------------------------------
  function labHtml() {
    var r = bySlug[state.labSlug] || rows[0];
    var e = econOf(r, state.labCap, state.labShare, state.labBreadth);
    var h = '<section><h1>Lab — recompute a row live</h1>' +
      '<p>Change the capital, the airdrop share, or the breadth factor and the nets recompute from the row\'s own figures. ' +
      'At $1,000 / 10% with breadth on, the lab matches board.json exactly.</p>' +
      '<div class="filters"><label>Protocol <select id="lab-row">' +
      rows.map(function (x) { return '<option value="' + esc(x.slug) + '"' + (x.slug === r.slug ? ' selected' : '') + '>#' + x.rank + ' ' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>Capital $ <input id="lab-cap" type="number" min="10" max="1000000" step="10" value="' + state.labCap + '"></label>' +
      '<label>Share % <input id="lab-share" type="number" min="0.5" max="100" step="0.5" value="' + (state.labShare * 100) + '"></label>' +
      '<label class="chk"><input id="lab-breadth" type="checkbox"' + (state.labBreadth ? ' checked' : '') + '> Breadth factor on</label></div>' +
      '<table class="mini"><tbody>' +
      '<tr><td>Protocol</td><td><b>' + esc(r.name) + '</b> · ' + esc(r.category) + ' · TVL ' + money(r.tvl) + '</td></tr>' +
      '<tr><td>Implied value</td><td>' + money(e.implied) + ' (breadth ' + (state.labBreadth ? 'on' : 'off') + ')</td></tr>' +
      '<tr><td>P(launch)</td><td>' + pct(r.model.p_launch) + '</td></tr>' +
      '<tr><td>Slice</td><td>' + money(e.slice) + ' · P25 ' + money(e.s25) + ' · P75 ' + money(e.s75) + '</td></tr>' +
      '<tr><td>Fees / T-bill</td><td>' + money2(e.fees) + ' / ' + money2(e.tbill) + '</td></tr>' +
      '<tr><td><b>Net (point)</b></td><td><b>' + money2(e.net) + '</b> · P25 ' + money2(e.n25) + ' · P75 ' + money2(e.n75) + '</td></tr>' +
      '<tr><td>Verdict</td><td>' + verdictBadge(e.verdict) + '</td></tr>' +
      '<tr><td>Break-even capital</td><td>' + (e.be === null ? '<b>never breaks even</b>' : money(e.be)) + '</td></tr>' +
      '<tr><td>Break-even share</td><td>' + (e.beShare === null ? '—' : (e.beShare * 100).toFixed(1) + '%') + '</td></tr>' +
      '</tbody></table>' +
      '<p class="mut">The verdict rule: ROBUST when the P25 net is positive, FARM when the point net is, THIN when only the P75 net is, SKIP otherwise. ' +
      'The break-even capital is the smallest deposit whose point net is positive; the net is concave in capital, so past the peak the T-bill eats the slice.</p></section>';
    return h;
  }

  // ---- render + wiring -------------------------------------------------------
  var tabs = [['board', 'Board'], ['comps', 'Comps'], ['setaside', 'Set aside'], ['method', 'Method + backtest'], ['research', 'Research note'], ['lab', 'Lab']];
  function updateBoardCells() {
    var cv = document.getElementById('cap-val');
    if (cv) cv.textContent = capMoney(state.boardCap);
    var ch = document.getElementById('cap-hdr');
    if (ch) ch.textContent = capMoney(state.boardCap);
    root.querySelectorAll('table.board tr[data-slug]').forEach(function (tr) {
      var r = bySlug[tr.getAttribute('data-slug')];
      if (!r) return;
      var e = boardEcon(r);
      var ph = e.net / (r.farm.time_minutes / 60);
      var net = tr.querySelector('td.net');
      if (net) { net.textContent = money2(e.net); net.className = 'net ' + (e.net >= 0 ? 'num-pos' : 'num-neg'); }
      var vd = tr.querySelector('td.vd');
      if (vd) vd.innerHTML = verdictBadge(e.verdict);
      var phc = tr.querySelector('td.ph');
      if (phc) { phc.textContent = money2(ph); phc.className = 'ph ' + (ph >= 0 ? 'num-pos' : 'num-neg'); }
    });
  }
  function render() {
    var h = '<header><nav>' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (state.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</nav></header><main id="main">';
    if (state.tab === 'board') h += boardHtml();
    else if (state.tab === 'comps') h += compsHtml();
    else if (state.tab === 'setaside') h += setAsideHtml();
    else if (state.tab === 'method') h += methodHtml();
    else if (state.tab === 'research') h += researchHtml();
    else if (state.tab === 'lab') h += labHtml();
    h += '</main>';
    if (state.sel && state.tab === 'board') h += drawerHtml();
    root.innerHTML = h;
    wire();
  }
  function wire() {
    root.querySelectorAll('nav button').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); writeHash(); render(); });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var fv = document.getElementById('f-verdict');
    if (fv) fv.addEventListener('change', function () { state.verdict = fv.value; writeHash(); render(); });
    var fw = document.getElementById('f-watch');
    if (fw) fw.addEventListener('change', function () { state.watch = fw.checked; render(); });
    var fs = document.getElementById('f-sort');
    if (fs) fs.addEventListener('change', function () { state.sort = fs.value; render(); });
    root.querySelectorAll('table.board tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { state.sel = tr.getAttribute('data-slug'); writeHash(); render(); });
    });
    root.querySelectorAll('.spot-card').forEach(function (c) {
      c.addEventListener('click', function () { state.sel = c.getAttribute('data-slug'); writeHash(); render(); });
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); state.sel = c.getAttribute('data-slug'); writeHash(); render(); } });
    });
    var cap = document.getElementById('cap');
    if (cap) {
      cap.addEventListener('input', function () { state.boardCap = Math.round(Math.pow(10, Number(cap.value))); updateBoardCells(); });
      cap.addEventListener('change', function () { state.boardCap = Math.round(Math.pow(10, Number(cap.value))); render(); });
    }
    var dc = document.getElementById('drawer-close');
    if (dc) dc.addEventListener('click', function () { state.sel = null; writeHash(); render(); });
    var lr = document.getElementById('lab-row');
    if (lr) lr.addEventListener('change', function () { state.labSlug = lr.value; render(); });
    var lc = document.getElementById('lab-cap');
    if (lc) lc.addEventListener('change', function () { state.labCap = Math.max(10, Number(lc.value) || 1000); render(); });
    var ls = document.getElementById('lab-share');
    if (ls) ls.addEventListener('change', function () { state.labShare = Math.max(0.005, Math.min(1, (Number(ls.value) || 10) / 100)); render(); });
    var lb = document.getElementById('lab-breadth');
    if (lb) lb.addEventListener('change', function () { state.labBreadth = lb.checked; render(); });
  }
  render();
})();
