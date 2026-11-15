// Token Radar v6 — model radar-7.
//
// A plain OLS power law, and nothing else. The implied value of a
// protocol is the power-law base alone, halved (a x0.5 kin discount)
// when the row is flagged possible_parent. No category or family
// factor, no growth factor, no maturity factor, no chain-breadth
// factor, no clamp, no shrinkage, no chosen k. One function, one
// formula, for every row.
//
//   log10(mcap) = A + B x log10(tvl), fitted at runtime on the 128
//   token-bearing protocols with mcap > 0 in the snapshot.
//   base    = 10 ^ (A + B x log10(tvl))
//   implied = max(1, round(base x discount))
//   discount = 0.5 when possible_parent, else 1.
//
// The kin discount is a board-level adjustment, applied after the
// fit: possible_parent rows may share a parent or a token with another
// protocol, so their standalone implied value is halved. The fit
// itself never sees the discount, and the leave-one-out backtest
// measures the plain power law, not the discounted board.
//
// The board is 198 rows: all 40 watchlist protocols plus the 158
// pre-token protocols that pass the watchlist's own exclusion test
// (138 below the $50M floor, 20 above it). The 20 above-floor rows
// are flagged possible_parent: the snapshot does not carry
// parentProtocol, so their independence cannot be verified here, and
// the dashboard says so openly.
//
// Every row carries a 7-step farm plan with a concrete cost and time
// per step, built from the row's own category, chains, TVL and age.
// The dashboard regenerates the same steps from the same generator,
// so the page and board.json always agree.
//
// Node 22 standard library only. Deterministic: no clock (age is
// computed from the snapshot's fixed as_of, never Date.now()), no
// randomness, no network, sorted iteration everywhere.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  implied_value_usd: number;
  base_value_usd: number;
  kin_discount: number;
  is_watchlist: boolean;
  possible_parent: boolean;
  capital_usd: number;
  hold_days: number;
  farm_steps: string[];
}

export interface FarmNextRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  capital_usd: number;
  hold_days: number;
  efficiency: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: {
    version: string;
    kind: string;
    fit: { n: number; intercept: number; slope: number; r2: number };
    loo: { typical_miss_model: number; typical_miss_flat: number; n: number };
    kin_discount: { factor: number; rows: number; note: string };
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  possible_parent_size: number;
  live_size: number;
  rows: Omit<BoardRow, 'farm_steps'>[];
  live: LiveRow[];
  farm_next: FarmNextRow[];
}

/** Parse and minimally validate the sealed snapshot. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw.as_of !== 'string' || typeof raw.source !== 'string') {
    throw new Error('snapshot: as_of and source must be strings');
  }
  if (typeof raw.floor_usd !== 'number' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: floor_usd, protocols and watchlist are required');
  }
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Array.isArray(p.chains)) {
      throw new Error(`snapshot: protocol ${String(p.slug)} is missing slug, name, tvl_usd or chains`);
    }
  }
  return raw;
}

/** Days between the snapshot date and listed_at; null listed_at counts as 365 days. */
export function ageDays(asOf: string, listedAt: string | null): number {
  if (listedAt === null) return 365;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 365;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/** The median of a list of numbers (average of the two middles when even). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** Ordinary least squares on log10(mcap) against log10(tvl). */
export function fitPowerLaw(points: { tvl: number; mcap: number }[]): {
  n: number;
  intercept: number;
  slope: number;
  r2: number;
} {
  const xs = points.map((p) => Math.log10(p.tvl));
  const ys = points.map((p) => Math.log10(p.mcap));
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sst += (ys[i]! - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssr += r * r;
  }
  return { n, intercept, slope, r2: sst === 0 ? 0 : 1 - ssr / sst };
}

/** A protocol records no token when mcap, gecko_id and symbol are all null. */
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * The watchlist's own exclusion test: a pre-token protocol passes
 * unless it is a wrapped, staked or bridged product of a token that
 * already trades, or a versioned name, or an exchange-branded name.
 * The snapshot carries no parentProtocol field, so this test is all
 * the snapshot itself can check.
 */
export function isRankable(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((e) => lower.startsWith(e.toLowerCase()))) return false;
  return true;
}

/** Farm capital tier by TVL: $250 / $150 / $100 / $50. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** Gas for the main action: about $8 when capital is $150 or more, else about $4. */
export function gasFor(capitalUsd: number): number {
  return capitalUsd >= 150 ? 8 : 4;
}

/** Hold days from age: under 180 days hold 60, 180-364 hold 45, a year or more (or unknown) hold 30. */
export function holdDaysFor(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain the protocol reports TVL on, or Ethereum when it reports none. */
export function firstChain(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'Ethereum';
}

interface CategoryPlan {
  main: (name: string, capital: number, chain: string) => string;
  second: (name: string, capital: number, chain: string) => string;
  verb: string;
}

const CATEGORY_PLANS: Record<string, CategoryPlan> = {
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

const DEFAULT_PLAN: CategoryPlan = {
  main: (name, capital, chain) => `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
  second: (name, _capital, _chain) => `Repeat with a smaller deposit into ${name} each week to keep the wallet active.`,
  verb: 'deposit',
};

function planFor(category: string | null): CategoryPlan {
  if (category !== null && Object.hasOwn(CATEGORY_PLANS, category)) return CATEGORY_PLANS[category]!;
  return DEFAULT_PLAN;
}

function withCostTime(action: string, cost: string, time: string): string {
  let step = `${action} Cost: ${cost}. Time: ${time}.`;
  if (step.length > 600) step = `${step.slice(0, 597)}...`;
  return step;
}

/**
 * The 7-step farm plan for one row. The dashboard regenerates these
 * steps from the same generator, so the page and board.json agree.
 * Every step carries a concrete cost and time.
 */
export function farmSteps(row: {
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  age_days: number;
}): string[] {
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

/** The leave-one-out miss factor for one protocol: max(actual/pred, pred/actual), always >= 1. */
function missFactor(actual: number, predicted: number): number {
  return Math.max(actual / predicted, predicted / actual);
}

/**
 * Leave-one-out calibration of the plain power law, plus the flat
 * multiple baseline, on the same 128 fit protocols. Each protocol is
 * predicted by a fit that excludes it; the typical miss is the
 * median miss factor across the 128.
 */
export function looCalibration(fit: Protocol[]): {
  typical_miss_model: number;
  typical_miss_flat: number;
  n: number;
} {
  const modelMisses: number[] = [];
  const flatMisses: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const rest = fit.filter((_p, j) => j !== i);
    const f = fitPowerLaw(rest.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd! })));
    const p = fit[i]!;
    const pred = 10 ** (f.intercept + f.slope * Math.log10(p.tvl_usd));
    modelMisses.push(missFactor(p.mcap_usd!, pred));
    const flatMultiple = median(rest.map((q) => q.mcap_usd! / q.tvl_usd));
    flatMisses.push(missFactor(p.mcap_usd!, p.tvl_usd * flatMultiple));
  }
  return { typical_miss_model: median(modelMisses), typical_miss_flat: median(flatMisses), n: fit.length };
}

/** The plain power-law implied value before any kin discount. */
export function baseValue(fit: { intercept: number; slope: number }, tvlUsd: number): number {
  return 10 ** (fit.intercept + fit.slope * Math.log10(tvlUsd));
}

/**
 * Build the board and the dashboard payload from the snapshot.
 * Board: 40 watchlist + 158 early, ranked by discounted implied
 * value desc, ties by slug asc.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const fitProtocols = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const fit = fitPowerLaw(fitProtocols.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd! })));
  const loo = looCalibration(fitProtocols);

  const watchlistSet = new Set(snapshot.watchlist);
  const picked: { protocol: Protocol; isWatchlist: boolean; possibleParent: boolean }[] = [];

  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) picked.push({ protocol: p, isWatchlist: true, possibleParent: false });
  }
  for (const p of snapshot.protocols) {
    if (watchlistSet.has(p.slug)) continue;
    if (!isPreToken(p) || !isRankable(p)) continue;
    const possibleParent = p.tvl_usd >= snapshot.floor_usd;
    picked.push({ protocol: p, isWatchlist: false, possibleParent });
  }

  const rows: BoardRow[] = picked.map(({ protocol: p, isWatchlist, possibleParent }) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const base = baseValue(fit, p.tvl_usd);
    const discount = possibleParent ? 0.5 : 1;
    const implied = Math.max(1, Math.round(base * discount));
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      implied_value_usd: implied,
      base_value_usd: Math.max(1, Math.round(base)),
      kin_discount: discount,
      is_watchlist: isWatchlist,
      possible_parent: possibleParent,
      capital_usd: capitalFor(p.tvl_usd),
      hold_days: holdDaysFor(age),
      farm_steps: farmSteps({
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        age_days: age,
      }),
    };
  });

  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const farmNext: FarmNextRow[] = [...rows]
    .map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      implied_value_usd: r.implied_value_usd,
      capital_usd: r.capital_usd,
      hold_days: r.hold_days,
      efficiency: r.implied_value_usd / (r.capital_usd * r.hold_days),
    }))
    .sort((a, b) => b.efficiency - a.efficiency || (a.slug < b.slug ? -1 : 1))
    .slice(0, 10);

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
    }));

  const possibleParentSize = rows.filter((r) => r.possible_parent).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: 'radar-7',
      kind: 'plain OLS power law, no factors',
      fit: { n: fit.n, intercept: fit.intercept, slope: fit.slope, r2: fit.r2 },
      loo: { typical_miss_model: loo.typical_miss_model, typical_miss_flat: loo.typical_miss_flat, n: loo.n },
      kin_discount: {
        factor: 0.5,
        rows: possibleParentSize,
        note: 'Possible-parent rows are discounted x0.5 because they may share a parent or token with another protocol, so their standalone implied value is halved.',
      },
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((r) => !r.is_watchlist).length,
    possible_parent_size: possibleParentSize,
    live_size: live.length,
    rows: rows.map(({ farm_steps: _steps, ...rest }) => rest),
    live,
    farm_next: farmNext,
  };
  return { board: rows, radar };
}

/**
 * The gate self-check. Returns an issue string when the board would
 * be refused, else null. Checks coverage, ranks, order, the kin
 * discount, and the farm-step lengths.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length !== 198) return `board has ${board.length} rows, expected 198`;
  const slugs = new Set<string>();
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlistSeen = new Set<string>();
  let possibleParentCount = 0;
  let previousImplied = Number.POSITIVE_INFINITY;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank}, expected ${i + 1}`;
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) {
      return `row ${i + 1} has a bad slug`;
    }
    if (slugs.has(r.slug)) return `duplicate slug ${r.slug}`;
    slugs.add(r.slug);
    if (!bySlug.has(r.slug)) return `slug ${r.slug} is not in the snapshot`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `row ${r.slug} has an empty name`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) {
      return `row ${r.slug} has a bad implied value ${r.implied_value_usd}`;
    }
    if (r.implied_value_usd > previousImplied) return `implied value rises at rank ${r.rank}`;
    previousImplied = r.implied_value_usd;
    if (r.is_watchlist) watchlistSeen.add(r.slug);
    if (r.possible_parent) {
      possibleParentCount++;
      if (r.is_watchlist) return `watchlist row ${r.slug} is flagged possible_parent`;
      if (r.tvl_usd < snapshot.floor_usd) return `possible_parent row ${r.slug} is below the floor`;
      if (r.kin_discount !== 0.5) return `possible_parent row ${r.slug} has no kin discount`;
      // round(base x 0.5) and round(round(base) x 0.5) can differ by 1; allow that rounding slack.
      if (Math.abs(r.implied_value_usd - r.base_value_usd * 0.5) > 1) {
        return `possible_parent row ${r.slug} implied is not base x 0.5`;
      }
    } else if (r.kin_discount !== 1) {
      return `row ${r.slug} has an unexpected kin discount ${r.kin_discount}`;
    } else if (r.implied_value_usd !== Math.max(1, Math.round(r.base_value_usd))) {
      return `row ${r.slug} implied is not its base value`;
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length !== 7) {
      return `row ${r.slug} has ${Array.isArray(r.farm_steps) ? r.farm_steps.length : 0} farm steps, expected 7`;
    }
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${r.slug} has a farm step of ${len} chars`;
    }
  }
  if (watchlistSeen.size !== snapshot.watchlist.length) {
    return `board covers ${watchlistSeen.size} of ${snapshot.watchlist.length} watchlist slugs`;
  }
  if (possibleParentCount !== 20) return `board flags ${possibleParentCount} possible_parent rows, expected 20`;
  if (board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'all implied values are identical';
  }
  return null;
}

/** The dashboard payload: one compact `window.RADAR = {...};` line. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
