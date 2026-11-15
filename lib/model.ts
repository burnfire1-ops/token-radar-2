// Token Radar — radar-11 model + v11 farm economics.
//
// v11 keeps the v10 model EXACTLY (radar-11: rank 1's verified recipe plus
// the one validated v10 improvement, a chain-breadth factor) and improves
// the product only. The v11 experiments (EXPERIMENT_V11.md, 29 candidates,
// triple-reviewed ALL AGREE) proved no model idea beats radar-11 —
// restricted comps, einsteincy factors, mechanism grouping,
// parent-aggregation and sibling x0.3 all hurt or tie — so the model is
// untouched and the work is in the farm plans and the dashboard.
//
//   comps      = the snapshot's traded tokens, trimmed: drop Bridge /
//                Canonical Bridge / CEX, drop versioned names, drop mcap/TVL
//                outside [1/500, 50]. Expect 101 comps on this snapshot.
//   curve      = linear log-log OLS: log10(mcap) = a + b * log10(TVL / $100M).
//                Expect a ~= 7.13, b ~= 0.50. No quadratic.
//   family     = mean log residual per category, shrunk n/(n+20), capped
//                [0.5, 2.5]. Computed INSIDE each validation fold.
//   growth     = the protocol's TVL carried two weeks ahead at its 7-day
//                rate: (1 + clamp(change_7d, -30, +30) / 100) ^ (2b).
//   seasoning  = piecewise age factor, months-based (rank 1's exact form):
//                x0.70 at launch, rising linearly to x1.15 at 18 months,
//                falling linearly to x0.95 at 60 months, then flat x0.95.
//                Null listed_at = 1 (no age information).
//   sibling    = x0.50 for a watchlist protocol whose name starts with a
//                traded token's first word. Non-watchlist siblings are
//                EXCLUDED from the board (recorded in the set-aside list).
//   breadth    = a binary indicator: 1 when the protocol lists two or more
//                chains, 0 when it lists one. Its slope beta comes from a
//                one-feature ridge regression on the log residuals against
//                curve x family, lambda = 10n (strong shrinkage). The applied
//                multiplier is clamp(10 ^ (beta * x), 0.85, 1.18). On the
//                full fit the unshrunk beta is about -0.030 log10
//                (multi-chain tokens trade ~7% lower, counterintuitively);
//                after shrinkage the applied correction is ~0.4%. The factor
//                is refit inside every validation fold, like family.
//   implied    = max(1, round(curve * family * growth * seasoning *
//                sibling * breadth))
//   NO kin discount anywhere. NO Huber trim. NO chain factor (it fails LOO).
//   NO restricted comps (they hurt all three splits in the v11 experiments).
//
// Farm economics, NEW in v11 — P(launch) enters the net. The launch
// probability is empirical, from the snapshot itself: for each age x TVL
// band, P(launch) = (protocols in the band WITH a traded token) / (all
// protocols in the band), where "with a token" means mcap_usd > 0. Overall
// P is 0.169 on this snapshot. Note the definition: rank 13 einsteincy's
// table reports 0.549 because it counts a SYMBOL as a token (416 of 758
// protocols carry one); this radar counts a TRADED market cap, which is the
// stricter reading and the one a farmer can sell into. The table is an
// UPPER BOUND for old pre-token rows: the protocols that survived without
// launching are "overdue" — it measures who has launched so far, not who
// will launch next.
//
//   slice   = capital / (TVL + capital) x airdrop share x implied value.
//   net     = P(launch) x slice - fees - T-bill, evaluated at three implied
//             values: P25, point, P75 (the band the blind residuals earn).
//   verdict = ROBUST when net(P25) > 0 (the low end pays), FARM when
//             net(point) > 0, THIN when net(P75) > 0, else SKIP.
//   break-even capital = the capital at which the point net is exactly zero
//             (the net is concave in capital, so one root on the rising
//             side); null with "never breaks even" when the point net never
//             turns positive at any capital. Break-even share = the airdrop
//             share at which the $1,000 plan's point net is zero.
// Fees are the gas and bridge of the cheapest of the protocol's first three
// chains, from one table; the T-bill is the 4% a year the capital gives up
// over the hold. Standard position $1,000, airdrop share 10%.
//
// NEW in v11 — capital-tiered plans carry the 4-way verdict at each capital
// ($100 / $1,000 / $10,000); the row's headline verdict is the $1,000
// tier's. NEW in v11 — every plan ends in a walk-away step: the plan's case
// against itself, written from the row's own numbers. NEW in v11 — the
// points-honesty rule: no points program is ever invented; a step states
// the points status as known, none confirmed, or inferred only where the
// category norm is a points season (with conditional wording).
//
// Validation (median multiplicative miss, miss = 10^|log10(real/pred)|):
//   LOO  = leave-one-out, curve + family + breadth refit without each token.
//   OOS  = time split: fit on tokens listed before 2025-01-01, test after;
//          a second split at 2024-01-01 is reported too.
//   Bars (v9 baseline, must beat all three): LOO < x2.8294,
//          OOS 2025 < x1.9298, OOS 2024 < x2.0991. v11 must reproduce the
//          v10 numbers exactly (LOO x2.8207, OOS 2025 x1.9294, OOS 2024
//          x2.0938): the model did not move.

export type SnapshotProtocol = {
  id: string;
  name: string;
  symbol: string | null;
  tvl: number;
  mcap_usd: number | null;
  gecko_id: string | null;
  category: string;
  chains: string[];
  change_7d: number | null;
  listed_at: string | null;
};

export type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
};

export type FitPoint = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  mcap: number;
  change_7d: number | null;
  listed_at: string | null;
};

export type CurveFit = {
  a: number;
  b: number;
  n: number;
};

export type FamilyStat = {
  category: string;
  tokens: number;
  factor: number;
};

export type Backtest = {
  loo_miss: number;
  loo_within3: number;
  loo_within10: number;
  loo_flat_miss: number;
  loo_flat_within3: number;
  oos_miss: number;
  oos_within3: number;
  oos_flat_miss: number;
  oos_flat_within3: number;
  oos_train: number;
  oos_test: number;
  oos2024_miss: number;
  oos2024_within3: number;
  oos2024_flat_miss: number;
  oos2024_flat_within3: number;
  oos2024_train: number;
  oos2024_test: number;
  curve_only_loo: number;
  breadth_beta: number;
  breadth_multi_count: number;
  factor_growth_r: number;
  factor_age_r: number;
  band50: number;
  band80: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  loo_points: { slug: string; tvl: number; real: number; pred: number; category: string }[];
};

export type ChainFee = {
  gas: number;
  bridge: number;
};

export type FarmStep = {
  text: string;
  cost: string;
  time: string;
};

/** One cell of the P(launch) table: an age band crossed with a TVL band. */
export type PlaunchCell = {
  age_band: string;
  tvl_band: string;
  n: number;
  has_token: number;
  p: number;
};

/** The empirical launch-probability table, computed from the snapshot. */
export type PlaunchTable = {
  cells: PlaunchCell[];
  overall_n: number;
  overall_has: number;
  overall_p: number;
};

/** The four-way verdict: the low end, the point, the high end, or nothing pays. */
export type Verdict = "robust" | "farm" | "thin" | "skip";

/** One capital tier of a row's farm plan: its own steps, costs and verdict. */
export type FarmTier = {
  capital_usd: number;
  chain: string;
  fees_usd: number;
  hold_days: number;
  time_minutes: number;
  slice_usd: number;
  net_usd: number;
  net_p25_usd: number;
  net_p75_usd: number;
  p_launch: number;
  verdict: Verdict;
  per_hour_usd: number;
  steps: string[];
};

export type FarmCost = {
  capital_usd: number;
  airdrop_share: number;
  chain: string;
  fees_usd: number;
  hold_days: number;
  time_minutes: number;
  time_usd: number;
  opportunity_usd: number;
  slice_usd: number;
  total_cost_usd: number;
  net_usd: number;
  net_p25_usd: number;
  net_p75_usd: number;
  p_launch: number;
  verdict: Verdict;
  min_deposit_usd: number | null;
  break_even_capital_usd: number | null;
  break_even_share: number | null;
  per_hour_usd: number;
  sensitivity: number[][];
};

export type BoardRow = {
  slug: string;
  name: string;
  symbol: string | null;
  category: string;
  chains: string[];
  tvl: number;
  change_7d: number | null;
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  is_watchlist: boolean;
  possible_parent: boolean;
  sibling: boolean;
  farm_steps: string[];
  farm: FarmCost;
  farm_tiers: FarmTier[];
  model: {
    curve_usd: number;
    family_factor: number;
    growth_factor: number;
    seasoning_factor: number;
    sibling_factor: number;
    breadth_factor: number;
    breadth_beta: number;
    multi_chain: boolean;
    implied_tvl_multiple: number;
    p10_usd: number;
    p25_usd: number;
    p75_usd: number;
    p90_usd: number;
    p_launch: number;
    loo_within3: number;
    oos_miss: number;
    oos2024_miss: number;
  };
};

export type LiveRow = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  mcap_usd: number | null;
  change_7d: number | null;
  fdv_tvl: number | null;
};

export type SetAsideRow = {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  reason: string;
};

/** One comp for the dashboard's comps tab: fitted value vs the real cap. */
export type CompRow = {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  fitted: number;
  miss: number;
};

export type ModelFit = {
  version: string;
  comps_count: number;
  dropped: { slug: string; name: string; reason: string }[];
  a: number;
  b: number;
  r2: number;
  breadth_beta: number;
  breadth_multi_count: number;
  loo_miss: number;
  loo_within3: number;
  loo_within10: number;
  loo_flat_miss: number;
  loo_flat_within3: number;
  oos_miss: number;
  oos_train: number;
  oos_test: number;
  oos_within3: number;
  oos_flat_miss: number;
  oos_flat_within3: number;
  oos2024_miss: number;
  oos2024_train: number;
  oos2024_test: number;
  oos2024_within3: number;
  oos2024_flat_miss: number;
  oos2024_flat_within3: number;
  curve_only_loo: number;
  factor_growth_r: number;
  factor_age_r: number;
  band50: number;
  band80: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  anchors: { flat: number; v1: number; v5: number; v6: number; v7: number; v9: number; v10: number; top: number };
};

export type Radar = {
  board: BoardRow[];
  early_size: number;
  live_size: number;
  watchlist_size: number;
  set_aside_size: number;
  model: ModelFit;
  top: BoardRow[];
  median_implied: number;
  farm_next: { slug: string; name: string; net_per_hour: number; net_usd: number; capital_usd: number }[];
  best_per_hour: { slug: string; name: string; per_hour_usd: number; net_usd: number }[];
  verdict_counts: { robust: number; farm: number; thin: number; skip: number };
  as_of: string;
  live: LiveRow[];
  set_aside_rows: SetAsideRow[];
  comps: CompRow[];
  plaunch: PlaunchTable;
  family: FamilyStat[];
  fees: Record<string, ChainFee>;
  curve_points: { slug: string; name: string; tvl: number; mcap: number; category: string }[];
  loo_points: { slug: string; tvl: number; real: number; pred: number; category: string }[];
  universe: { total: number; ranked: number; traded: number; set_aside: number };
};

// ---- constants -----------------------------------------------------------

export const FLOOR_USD = 50_000_000;
export const MODEL_VERSION = "radar-11";
export const OOS_CUTOFF = "2025-01-01";
export const OOS_CUTOFF_2024 = "2024-01-01";
export const TIME_RATE_USD_PER_HOUR = 15;
export const STANDARD_CAPITAL = 1000;
/** The three capitals every row's farm plan is priced at. */
export const TIER_CAPITALS = [100, 1000, 10000];
export const AIRDROP_SHARE = 0.1;
export const TBILL_RATE = 0.04;
export const FAMILY_SHRINK = 20;
export const FAMILY_CAP_LO = 0.5;
export const FAMILY_CAP_HI = 2.5;
/** The breadth ridge: lambda = 10 * n, and the applied multiplier's cap. */
export const BREADTH_LAMBDA_PER_N = 10;
export const BREADTH_CAP_LO = 0.85;
export const BREADTH_CAP_HI = 1.18;
/** v9 baseline bars: v10 must beat all three, and v11 must reproduce v10. */
export const LOO_BAR_V9 = 2.8294;
export const OOS_BAR_V9 = 1.9298;
export const OOS2024_BAR_V9 = 2.0991;

/** Gas and bridge per chain, in whole dollars: typical mainnet costs, November 2026. */
export const CHAIN_FEES: Record<string, ChainFee> = {
  Ethereum: { gas: 6, bridge: 12 },
  Arbitrum: { gas: 0.5, bridge: 2 },
  Binance: { gas: 0.15, bridge: 1.5 },
  Base: { gas: 0.1, bridge: 1.5 },
  Solana: { gas: 0.05, bridge: 2 },
  Avalanche: { gas: 0.3, bridge: 2 },
  Polygon: { gas: 0.1, bridge: 1.5 },
  Optimism: { gas: 0.3, bridge: 2 },
  Bitcoin: { gas: 2, bridge: 5 },
  "Hyperliquid L1": { gas: 0.1, bridge: 2 },
  Monad: { gas: 0.1, bridge: 2 },
  Tron: { gas: 0.5, bridge: 2 },
  Linea: { gas: 0.2, bridge: 2 },
  Plasma: { gas: 0.2, bridge: 2 },
  Sonic: { gas: 0.1, bridge: 2 },
  Sui: { gas: 0.05, bridge: 2 },
  Mantle: { gas: 0.1, bridge: 2 },
  Fantom: { gas: 0.1, bridge: 2 },
  Scroll: { gas: 0.2, bridge: 2 },
  Berachain: { gas: 0.2, bridge: 2 },
  xDai: { gas: 0.2, bridge: 2 },
  Celo: { gas: 0.1, bridge: 2 },
  "zkSync Era": { gas: 0.2, bridge: 2 },
  Unichain: { gas: 0.1, bridge: 2 },
  Sei: { gas: 0.1, bridge: 2 },
};
export const DEFAULT_FEE: ChainFee = { gas: 1, bridge: 2.5 };

/** A name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Exchange names a product name must not begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** A whole word for wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product of another protocol. */
const PRODUCT_CATEGORIES = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
/** Categories a curve point never comes from: a bridge's token, a versioned listing, an exchange token. */
const FIT_DROP_CATEGORIES = new Set(["Bridge", "Canonical Bridge", "CEX"]);

// ---- small numeric helpers -----------------------------------------------

function log10(x: number): number {
  return Math.log(x) / Math.LN10;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Standard median: the average of the two middles for an even count. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median of a list of misses. The standard median is the convention that
 * reproduces rank 1's published numbers (LOO x2.8294, OOS 2024 x2.10, OOS
 * 2025 x1.93). Rank 1's own missSummary takes the upper middle element,
 * which gives OOS 2024 x2.23 instead of the published x2.10.
 */
function missMedian(misses: number[]): number {
  if (misses.length === 0) return 1;
  return median(misses);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** The p-quantile of a sorted list (p in [0, 1]). */
function quantileOfSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 1;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Pearson's r between two equal-length lists. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = average(xs);
  const my = average(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

// ---- snapshot parsing ----------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text);
  const snap = raw.snapshot ?? raw;
  const protocols: SnapshotProtocol[] = [];
  for (const p of snap.protocols ?? []) {
    protocols.push({
      id: String(p.slug ?? p.id ?? ""),
      name: String(p.name ?? ""),
      symbol: p.symbol == null ? null : String(p.symbol),
      tvl: Number(p.tvl_usd ?? p.tvl ?? 0),
      mcap_usd: p.mcap_usd == null ? null : Number(p.mcap_usd),
      gecko_id: p.gecko_id == null ? null : String(p.gecko_id),
      category: String(p.category ?? ""),
      chains: Array.isArray(p.chains) ? p.chains.map((c: unknown) => String(c)) : [],
      change_7d: p.change_7d == null ? null : Number(p.change_7d),
      listed_at: p.listed_at == null ? null : String(p.listed_at),
    });
  }
  const watchlist: string[] = (snap.watchlist ?? []).map((w: unknown) =>
    typeof w === "string" ? w : String((w as Record<string, unknown>).id ?? (w as Record<string, unknown>).slug ?? w),
  );
  return {
    as_of: String(snap.as_of ?? "2026-11-14"),
    source: String(snap.source ?? ""),
    floor_usd: Number(snap.floor_usd ?? FLOOR_USD),
    protocols,
    watchlist,
  };
}

// ---- age, growth, seasoning, breadth -------------------------------------

/** Whole days from listed_at to as_of, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const t0 = Date.parse(listedAt);
  const t1 = Date.parse(asOf);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const days = Math.floor((t1 - t0) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * The growth factor: the TVL carried two weeks ahead at its 7-day rate,
 * through the slope. Null change is 0.
 */
export function growthFactor(change7d: number | null, slope: number): number {
  const g = finiteNumber(change7d, 0);
  const clamped = clamp(g, -30, 30) / 100;
  return Math.pow(1 + clamped, 2 * slope);
}

/**
 * The seasoning factor, piecewise in months (rank 1's exact form): x0.70 at
 * launch, rising linearly to x1.15 at 18 months, falling linearly to x0.95 at
 * 60 months (5 years), then flat x0.95. Null listed_at returns 1 (no age
 * information, so no seasoning adjustment).
 *
 * Note (carried from v9): a days-based piecewise (540 / 1825 days) with null
 * age treated as 365 days gives LOO x2.8400 — it misses the bar — because the
 * null-age rows get a 1.004 factor instead of 1. Rank 1's exact months form
 * gives LOO x2.8294. The two forms differ by at most ~0.1% on any factor;
 * the null-age rule is the only material difference.
 */
export function seasoningFactor(age: number | null): number {
  if (age === null) return 1;
  const months = age / 30;
  if (months <= 0) return 0.7;
  if (months <= 18) return 0.7 + (1.15 - 0.7) * (months / 18);
  if (months <= 60) return 1.15 - (1.15 - 0.95) * ((months - 18) / 42);
  return 0.95;
}

/** 1 when a point lists two or more chains, 0 when it lists one or none. */
export function breadthX(chains: string[]): number {
  return chains.length > 1 ? 1 : 0;
}

/**
 * The breadth slope beta: a one-feature ridge regression of the log residuals
 * (against curve x family) on the binary breadth indicator, lambda = 10n.
 * Strong shrinkage on purpose — the unshrunk slope is about -0.030 log10,
 * the shrunk slope about -0.0016, so the applied correction is ~0.4%.
 * Computed inside every validation fold, like the family factors.
 */
export function breadthBeta(points: FitPoint[], fit: CurveFit, fam: Map<string, number> | null): number {
  let sumXR = 0;
  let sumXX = 0;
  const n = points.length;
  for (const d of points) {
    let pred = curveValue(fit, d.tvl);
    if (fam) pred *= fam.get(d.category) ?? 1;
    const residual = log10(d.mcap / pred);
    const x = breadthX(d.chains);
    sumXR += x * residual;
    sumXX += x * x;
  }
  return sumXR / (sumXX + BREADTH_LAMBDA_PER_N * n);
}

/** The breadth multiplier for a chain list: clamp(10 ^ (beta * x), 0.85, 1.18). */
export function breadthFactor(beta: number, chains: string[]): number {
  return clamp(Math.pow(10, beta * breadthX(chains)), BREADTH_CAP_LO, BREADTH_CAP_HI);
}

// ---- comps, curve, family ------------------------------------------------

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The first word of a name, lowercased, letters and digits only. */
export function firstWord(name: string): string {
  const m = name.trim().toLowerCase().match(/^[a-z0-9]+/);
  return m ? m[0] : "";
}

/**
 * The traded tokens the curve is fit from: live-token protocols with a market
 * cap, minus bridges, version listings and exchange tokens, with mcap/TVL
 * outside [1/500, 50] trimmed. Returns the points plus the dropped list.
 */
export function fitPoints(snapshot: Snapshot): { points: FitPoint[]; dropped: { slug: string; name: string; reason: string }[] } {
  const dropped: { slug: string; name: string; reason: string }[] = [];
  const points: FitPoint[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl <= 0) continue;
    if (p.category !== "" && FIT_DROP_CATEGORIES.has(p.category)) {
      dropped.push({ slug: p.id, name: p.name, reason: "category " + p.category + " (bridge/CEX)" });
      continue;
    }
    if (VERSIONED.test(p.name)) {
      dropped.push({ slug: p.id, name: p.name, reason: "versioned name" });
      continue;
    }
    const r = p.mcap_usd / p.tvl;
    if (r < 1 / 500 || r > 50) {
      dropped.push({ slug: p.id, name: p.name, reason: "mcap/TVL " + round3(r) + "x outside [1/500, 50]" });
      continue;
    }
    points.push({
      slug: p.id,
      name: p.name,
      category: p.category === "" ? "Uncategorized" : p.category,
      chains: p.chains,
      tvl: p.tvl,
      mcap: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
    });
  }
  return { points, dropped };
}

/** Least squares on log10(mcap) against log10(TVL / $100M). */
export function ols(points: FitPoint[]): CurveFit {
  const xs = points.map((d) => log10(d.tvl / 1e8));
  const ys = points.map((d) => log10(d.mcap));
  const n = points.length;
  const mx = average(xs);
  const my = average(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b, n };
}

/** The curve's value for a TVL, in dollars. */
export function curveValue(fit: CurveFit, tvl: number): number {
  return Math.pow(10, fit.a + fit.b * log10(Math.max(1, tvl) / 1e8));
}

/**
 * One category's family factor: the mean log residual against the curve, shrunk
 * as if FAMILY_SHRINK extra tokens sat on the curve, capped to [0.5, 2.5].
 * A 1-token category counts 1/21 — nearly nothing.
 */
export function familyFactors(points: FitPoint[], fit: CurveFit): Map<string, number> {
  const byCat = new Map<string, { sum: number; n: number }>();
  for (const d of points) {
    const r = log10(d.mcap) - log10(curveValue(fit, d.tvl));
    const e = byCat.get(d.category);
    if (e) {
      e.sum += r;
      e.n++;
    } else {
      byCat.set(d.category, { sum: r, n: 1 });
    }
  }
  const out = new Map<string, number>();
  for (const [cat, e] of byCat) {
    const shrunk = (e.sum / e.n) * (e.n / (e.n + FAMILY_SHRINK));
    out.set(cat, Math.min(FAMILY_CAP_HI, Math.max(FAMILY_CAP_LO, Math.pow(10, shrunk))));
  }
  return out;
}

/** A fit point's predicted market cap: curve x family x growth x seasoning x breadth. */
export function predictPoint(d: FitPoint, fit: CurveFit, fam: Map<string, number> | null, beta: number, asOf: string): number {
  let v = curveValue(fit, d.tvl);
  if (fam) v *= fam.get(d.category) ?? 1;
  v *= growthFactor(d.change_7d, fit.b);
  v *= seasoningFactor(ageDays(asOf, d.listed_at));
  v *= breadthFactor(beta, d.chains);
  return v;
}

/** The miss of a prediction: how many times off the real value, at least 1. */
function miss(pred: number, real: number): number {
  return Math.pow(10, Math.abs(log10(real / pred)));
}

/** A list of misses, summarised: the median miss and the shares within 3x and 10x. */
function missSummary(misses: number[]): { median: number; within3: number; within10: number } {
  return {
    median: missMedian(misses),
    within3: misses.filter((m) => m <= 3).length / Math.max(1, misses.length),
    within10: misses.filter((m) => m <= 10).length / Math.max(1, misses.length),
  };
}

// ---- backtest ------------------------------------------------------------

/**
 * The backtest, computed from the snapshot: leave-one-out (curve + family +
 * breadth refit without each token), two time splits (fit before 2025-01-01
 * and fit before 2024-01-01, test the newer tokens), a factor check (the
 * blind residuals against growth and log age), and the band calibration. The
 * flat anchor is the median mcap/TVL multiple, refit without each token for
 * LOO. The breadth slope is refit inside every fold, so no fold sees the
 * token it is tested on.
 */
export function backtest(snapshot: Snapshot, points: FitPoint[]): Backtest {
  const asOf = snapshot.as_of;
  // Leave-one-out.
  const looResiduals: number[] = [];
  const looMisses: number[] = [];
  const looFlatMisses: number[] = [];
  const looPoints: { slug: string; tvl: number; real: number; pred: number; category: string }[] = [];
  const looCurveOnlyMisses: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const rest = points.filter((_, j) => j !== i);
    const fit = ols(rest);
    const fam = familyFactors(rest, fit);
    const beta = breadthBeta(rest, fit, fam);
    const d = points[i]!;
    const pred = predictPoint(d, fit, fam, beta, asOf);
    looPoints.push({ slug: d.slug, tvl: d.tvl, real: d.mcap, pred: Math.round(pred), category: d.category });
    looResiduals.push(log10(d.mcap / pred));
    looMisses.push(miss(pred, d.mcap));
    looCurveOnlyMisses.push(miss(curveValue(fit, d.tvl), d.mcap));
    const ratios = rest.map((x) => x.mcap / x.tvl).sort((x, y) => x - y);
    const flat = ratios[Math.floor(ratios.length / 2)]!;
    looFlatMisses.push(miss(d.tvl * flat, d.mcap));
  }
  const loo = missSummary(looMisses);
  const looFlat = missSummary(looFlatMisses);
  const curveOnly = missSummary(looCurveOnlyMisses);

  // Time split helper: fit on tokens listed before `cutoff`, test after.
  function timeSplit(cutoff: string): { median: number; within3: number; flatMedian: number; flatWithin3: number; train: number; test: number } {
    const pre = points.filter((d) => d.listed_at !== null && d.listed_at < cutoff);
    const post = points.filter((d) => d.listed_at !== null && d.listed_at >= cutoff);
    if (pre.length < 10 || post.length < 5) {
      return { median: NaN, within3: 0, flatMedian: NaN, flatWithin3: 0, train: pre.length, test: post.length };
    }
    const fit = ols(pre);
    const fam = familyFactors(pre, fit);
    const beta = breadthBeta(pre, fit, fam);
    const s = missSummary(post.map((d) => miss(predictPoint(d, fit, fam, beta, asOf), d.mcap)));
    const ratios = pre.map((d) => d.mcap / d.tvl).sort((x, y) => x - y);
    const flat = ratios[Math.floor(ratios.length / 2)]!;
    const flatS = missSummary(post.map((d) => miss(d.tvl * flat, d.mcap)));
    return { median: s.median, within3: s.within3, flatMedian: flatS.median, flatWithin3: flatS.within3, train: pre.length, test: post.length };
  }
  const split2025 = timeSplit(OOS_CUTOFF);
  const split2024 = timeSplit(OOS_CUTOFF_2024);

  // The breadth slope on the full fit, and how many comps are multi-chain.
  const fullFit = ols(points);
  const fullFam = familyFactors(points, fullFit);
  const fullBeta = breadthBeta(points, fullFit, fullFam);
  const multiCount = points.filter((d) => breadthX(d.chains) === 1).length;

  // Factor check: the blind residuals against growth and against log age.
  const growths = points.map((d) => finiteNumber(d.change_7d, 0));
  const factorGrowthR = pearson(growths, looResiduals);
  const ageXs: number[] = [];
  const ageYs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const age = ageDays(asOf, points[i]!.listed_at);
    if (age !== null && age > 0) {
      ageXs.push(log10(age));
      ageYs.push(looResiduals[i]!);
    }
  }
  const factorAgeR = pearson(ageXs, ageYs);

  // Band calibration: the share of tokens whose real cap falls inside the 50%
  // and 80% bands built from the other tokens' blind residuals.
  const sortedRes = [...looResiduals].sort((a, b) => a - b);
  const p10 = quantileOfSorted(sortedRes, 0.1);
  const p25 = quantileOfSorted(sortedRes, 0.25);
  const p75 = quantileOfSorted(sortedRes, 0.75);
  const p90 = quantileOfSorted(sortedRes, 0.9);
  let in50 = 0;
  let in80 = 0;
  for (let i = 0; i < points.length; i++) {
    const others = looResiduals.filter((_, j) => j !== i).sort((a, b) => a - b);
    const lo50 = quantileOfSorted(others, 0.25);
    const hi50 = quantileOfSorted(others, 0.75);
    const lo80 = quantileOfSorted(others, 0.1);
    const hi80 = quantileOfSorted(others, 0.9);
    if (looResiduals[i]! >= lo50 && looResiduals[i]! <= hi50) in50++;
    if (looResiduals[i]! >= lo80 && looResiduals[i]! <= hi80) in80++;
  }

  // The medians are returned exact (unrounded): the v9 bar is LOO < x2.8294
  // and the exact LOO is x2.8207, which rounds to x2.82 for display but is
  // below the bar. Rounding the medians before the bar check would fail a
  // model that passes. Display code rounds with toFixed(2).
  return {
    loo_miss: loo.median,
    loo_within3: round3(loo.within3),
    loo_within10: round3(loo.within10),
    loo_flat_miss: looFlat.median,
    loo_flat_within3: round3(looFlat.within3),
    oos_miss: split2025.median,
    oos_within3: round3(split2025.within3),
    oos_flat_miss: split2025.flatMedian,
    oos_flat_within3: round3(split2025.flatWithin3),
    oos_train: split2025.train,
    oos_test: split2025.test,
    oos2024_miss: split2024.median,
    oos2024_within3: round3(split2024.within3),
    oos2024_flat_miss: split2024.flatMedian,
    oos2024_flat_within3: round3(split2024.flatWithin3),
    oos2024_train: split2024.train,
    oos2024_test: split2024.test,
    curve_only_loo: curveOnly.median,
    breadth_beta: round4(fullBeta),
    breadth_multi_count: multiCount,
    factor_growth_r: round3(factorGrowthR),
    factor_age_r: round3(factorAgeR),
    band50: round3(in50 / Math.max(1, points.length)),
    band80: round3(in80 / Math.max(1, points.length)),
    p10: round3(Math.pow(10, p10)),
    p25: round3(Math.pow(10, p25)),
    p75: round3(Math.pow(10, p75)),
    p90: round3(Math.pow(10, p90)),
    loo_points: looPoints,
  };
}

// ---- P(launch): the empirical launch-probability table --------------------

/** The age band of an age in days: under 6 months, 6-12, 1-2 years, over 2, or unknown. */
export function plaunchAgeBand(age: number | null): string {
  if (age === null) return "unknown";
  if (age < 180) return "<6mo";
  if (age < 365) return "6-12mo";
  if (age < 730) return "1-2y";
  return ">2y";
}

/** The TVL band of a TVL in dollars: under $10M, $10-100M, or $100M and up. */
export function plaunchTvlBand(tvl: number): string {
  if (tvl < 1e7) return "<$10M";
  if (tvl < 1e8) return "$10-100M";
  return "$100M+";
}

/**
 * The P(launch) table, computed from the snapshot itself: for each age x TVL
 * band, the share of protocols in the band WITH a traded token (mcap_usd > 0)
 * over all protocols in the band. The $100M+ column merges $100M-1B and
 * >$1B on purpose: the young-age >$1B cells hold 1-3 protocols, too thin to
 * stand alone, and every cell of the merged table holds at least 10
 * protocols (the builder throws if one does not, rather than shipping a
 * thin cell). The overall rate is 0.169 on this snapshot — not the 0.549 a
 * rank-13 entry reports, because that table counts a SYMBOL as a token and
 * this one counts a TRADED market cap.
 */
export function plaunchTable(snapshot: Snapshot): PlaunchTable {
  const asOf = snapshot.as_of;
  const ageBands = ["<6mo", "6-12mo", "1-2y", ">2y", "unknown"];
  const tvlBands = ["<$10M", "$10-100M", "$100M+"];
  const counts = new Map<string, { n: number; has: number }>();
  for (const a of ageBands) {
    for (const t of tvlBands) counts.set(a + "|" + t, { n: 0, has: 0 });
  }
  let overallN = 0;
  let overallHas = 0;
  for (const p of snapshot.protocols) {
    const age = ageDays(asOf, p.listed_at);
    const key = plaunchAgeBand(age) + "|" + plaunchTvlBand(p.tvl);
    const cell = counts.get(key)!;
    cell.n++;
    overallN++;
    if (p.mcap_usd !== null && p.mcap_usd > 0) {
      cell.has++;
      overallHas++;
    }
  }
  const cells: PlaunchCell[] = [];
  for (const a of ageBands) {
    for (const t of tvlBands) {
      const c = counts.get(a + "|" + t)!;
      if (c.n < 10) throw new Error("P(launch) cell " + a + " x " + t + " holds " + c.n + " protocols, under the 10 minimum");
      cells.push({ age_band: a, tvl_band: t, n: c.n, has_token: c.has, p: round4(c.has / c.n) });
    }
  }
  return { cells, overall_n: overallN, overall_has: overallHas, overall_p: round4(overallHas / overallN) };
}

/** A row's launch probability: its age x TVL cell, or the overall rate when the cell is missing. */
export function plaunchFor(age: number | null, tvl: number, table: PlaunchTable): number {
  const key = plaunchAgeBand(age) + "|" + plaunchTvlBand(tvl);
  for (const c of table.cells) {
    if (c.age_band + "|" + c.tvl_band === key) return c.p;
  }
  return table.overall_p;
}

// ---- farm plans ----------------------------------------------------------

/** The cheapest chain of a protocol's first three, by gas plus bridge. */
export function cheapestChain(chains: string[]): { chain: string; fee: ChainFee } {
  const candidates = chains.slice(0, 3).map((c) => ({ chain: c, fee: CHAIN_FEES[c] ?? DEFAULT_FEE }));
  if (candidates.length === 0) return { chain: "its main chain", fee: DEFAULT_FEE };
  candidates.sort((x, y) => x.fee.gas + x.fee.bridge - (y.fee.gas + y.fee.bridge) || (x.chain < y.chain ? -1 : 1));
  return candidates[0]!;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. Null age counts as 365 days, so 90. */
export function holdDaysFor(age: number | null): number {
  const days = age ?? 365;
  if (days < 180) return 120;
  if (days < 540) return 90;
  return 60;
}

/** The dollars a step costs, in words. */
function dollars(n: number): string {
  return n === 0 ? "$0" : "$" + round2(n).toFixed(2);
}

/** A signed dollar figure in words: +$12.34 or -$6.85. */
function signed(n: number): string {
  return (n < 0 ? "-$" : "+$") + Math.abs(round2(n)).toFixed(2);
}

/** A step as one string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = step.text + " Cost: " + step.cost + ". Time: " + step.time + ".";
  if (s.length > 600) s = s.slice(0, 596) + "...";
  if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : "its main chain";
}

/** The category's one action, in the words a farmer can follow, at a given capital. */
function actionFor(p: SnapshotProtocol, chain: string, capital: number): string {
  const c = (p.category ?? "").toLowerCase();
  const name = p.name;
  const amt = "$" + capital.toLocaleString("en-US");
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) return "Supply " + amt + " of USDC into " + name + "'s main market on " + chain + " and leave the supply earning for the full hold.";
  if (c.includes("dex") || c.includes("amm") || c.includes("swap")) return "Add " + amt + " of liquidity to " + name + "'s busiest pool on " + chain + ", a stable pair when one exists, and keep the LP position.";
  if (c.includes("yield") || c.includes("leveraged farm") || c.includes("farm") || c.includes("aggregator")) return "Deposit " + amt + " into " + name + "'s highest-TVL vault on " + chain + " and leave the receipt tokens untouched.";
  if (c.includes("derivative") || c.includes("perpetual") || c.includes("perp") || c.includes("basis")) return "Deposit " + amt + " of USDC as collateral on " + name + " and open one small hedged position; close the hedge, never the deposit.";
  if (c.includes("bridge")) return "Bridge " + amt + " of USDC through " + name + " to " + chain + ", then use the bridged funds once inside the destination app.";
  if (c.includes("staking") || c.includes("restak")) return "Stake " + amt + " of the chain's base asset through " + name + " and keep the liquid receipt for the full hold.";
  if (c.includes("prediction")) return "Fund " + amt + " and take one small position on a " + name + " market that settles inside the hold window.";
  if (c.includes("rwa") || c.includes("real world")) return "Mint " + amt + " of " + name + "'s yield-bearing asset on " + chain + " and hold it for the full period.";
  if (c.includes("curator") || c.includes("allocator") || c.includes("vault") || c.includes("risk")) return "Deposit " + amt + " into a " + name + " vault on " + chain + " and keep the vault shares for the full hold.";
  if (c.includes("stable")) return "Mint " + amt + " of the stable asset through " + name + " on " + chain + " against USDC collateral and hold it.";
  if (c.includes("insurance")) return "Buy " + amt + " of cover from " + name + " on " + chain + " for a position you already hold.";
  if (c.includes("locker") || c.includes("token lock")) return "Lock " + amt + " of tokens in " + name + " on " + chain + " for the full hold and keep the lock receipt.";
  return "Deposit " + amt + " of USDC into " + name + " on " + chain + " and keep the position open for the full hold.";
}

/** The weekly habit that keeps a farm alive, by category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? "").toLowerCase();
  if (c.includes("dex") || c.includes("amm") || c.includes("swap")) return "Route one small swap through the pool each week so the wallet stays active on it.";
  if (c.includes("lend") || c.includes("cdp")) return "Borrow a small amount against the supply once, then repay it, so the wallet shows both sides.";
  if (c.includes("derivative") || c.includes("perpetual") || c.includes("perp") || c.includes("basis")) return "Adjust the hedge once a week and keep the collateral deposited the whole time.";
  if (c.includes("prediction")) return "Settle or roll the position weekly and take one new small position.";
  if (c.includes("bridge")) return "Bridge a small amount back or across once a week so the wallet shows repeat use.";
  return "Make one qualifying action each week, such as a deposit, a swap, a vote or a claim.";
}

/** The tier-specific note: what changes when the capital is small or large. */
function tierNote(capital: number): string {
  if (capital <= 100) return "This is a test-size position: the fees are a large share of it, so only farm when the protocol's implied value is high and the net still clears the fees.";
  if (capital >= 10000) return "Split the deposit across two wallets so no single wallet holds the whole position, and check the pool's depth before adding liquidity.";
  return "This is the standard position the board's verdicts are judged on.";
}

/**
 * Whether points seasons are the norm for a category: DEXs, lending, yield,
 * derivatives, prediction markets and CDPs run points seasons so often that
 * a farmer may reasonably expect one — but none is confirmed for THIS
 * protocol in the sealed snapshot, so the step says so and tells the farmer
 * to verify first. Every other category gets the plain "none confirmed" line.
 * Neither wording invents a points program.
 */
function pointsNorm(category: string): boolean {
  const c = (category ?? "").toLowerCase();
  return c.includes("dex") || c.includes("lend") || c.includes("yield") || c.includes("derivat") || c.includes("prediction") || c === "cdp";
}

/** The points-honesty step: the protocol's points status, stated, never invented. */
function pointsStep(p: SnapshotProtocol): string {
  if (pointsNorm(p.category)) {
    return "Points seasons are the norm for " + (p.category || "this category") + " protocols, but no points program is confirmed for " + p.name + " in the sealed snapshot — if a season opens, verify the rules on the protocol's own page before depositing anything.";
  }
  return "No points program is confirmed for " + p.name + " in the sealed snapshot — farm by usage, not by points: deposit, hold, and use the protocol, and check its own page before expecting a reward.";
}

/** The plan's costs: cheapest chain, fees, hold, and hands-on minutes (walk-away step included). */
export function planCosts(p: SnapshotProtocol, age: number | null): { chain: string; fee: ChainFee; fees: number; holdDays: number; minutes: number } {
  const cheapest = cheapestChain(p.chains);
  const { gas, bridge } = cheapest.fee;
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  // 5 (bridge) + 15 (points) + 15 (deposit) + 5/week (habit) + 5 (alert) + 10 (claim) + 10 (unwind) + 5 (walk-away).
  const minutes = 5 + 15 + 15 + 5 * weeks + 5 + 10 + 10 + 5;
  return { chain: cheapest.chain, fee: cheapest.fee, fees: round2(2 * bridge + 5 * gas), holdDays: hold, minutes };
}

/** The slice of the airdrop a capital earns: its share of the TVL times the airdrop share of the value. */
export function sliceFor(capital: number, tvl: number, implied: number, share: number = AIRDROP_SHARE): number {
  return (capital / (tvl + capital)) * share * implied;
}

/** The P25/P75 band multipliers the nets are evaluated at (from the backtest). */
export type PlanBand = { p25: number; p75: number };

/** A plan's numbers at one capital: slices, nets at three implied values, verdict, break-evens. */
export type PlanNumbers = {
  slice: number;
  slice_p25: number;
  slice_p75: number;
  tbill: number;
  net: number;
  net_p25: number;
  net_p75: number;
  verdict: Verdict;
  break_even: number | null;
  break_even_share: number | null;
};

/**
 * The capital at which the point net is exactly zero, or null when the point
 * net never turns positive at any capital ("never breaks even"). The net is
 * concave in the capital (the slice saturates at P x share x implied while
 * the T-bill grows linearly), so its maximum sits where the marginal slice
 * equals the T-bill rate; when even that maximum is not positive, no deposit
 * clears the costs. Same bisection shape as v10's minDeposit, with the
 * launch probability folded into the slice.
 */
export function breakEvenCapital(tvl: number, implied: number, fees: number, holdDays: number, pLaunch: number, share: number = AIRDROP_SHARE): number | null {
  const k = pLaunch * share * implied;
  const rate = TBILL_RATE * (holdDays / 365);
  const netAt = (c: number): number => sliceFor(c, tvl, implied, share) * pLaunch - fees - rate * c;
  if (k <= 0 || rate <= 0) return null;
  const peak = Math.sqrt((k * tvl) / rate) - tvl;
  if (peak <= 10) return null;
  if (netAt(peak) <= 0) return null;
  let lo = 10;
  let hi = peak;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (netAt(mid) > 0) hi = mid;
    else lo = mid;
  }
  return Math.round(hi);
}

/**
 * The airdrop share at which a capital's point net is exactly zero, or null
 * when the launch probability or the implied value is zero. A value above 1
 * is reported as it is: it says the plan needs more than the whole airdrop
 * to break even, which is the point.
 */
export function breakEvenShare(tvl: number, implied: number, fees: number, holdDays: number, pLaunch: number, capital: number = STANDARD_CAPITAL): number | null {
  if (pLaunch <= 0 || implied <= 0) return null;
  const tbill = TBILL_RATE * capital * (holdDays / 365);
  const denom = pLaunch * (capital / (tvl + capital)) * implied;
  if (denom <= 0) return null;
  return round4((fees + tbill) / denom);
}

/** The four-way verdict from the nets at the three band points. */
export function verdict4(netP25: number, netPoint: number, netP75: number): Verdict {
  if (netP25 > 0) return "robust";
  if (netPoint > 0) return "farm";
  if (netP75 > 0) return "thin";
  return "skip";
}

/** One plan's numbers at one capital and airdrop share, with the launch probability applied. */
export function planNumbers(tvl: number, implied: number, fees: number, holdDays: number, pLaunch: number, capital: number, share: number, band: PlanBand): PlanNumbers {
  const tbill = round2(TBILL_RATE * capital * (holdDays / 365));
  const slice = round2(sliceFor(capital, tvl, implied, share));
  const sliceP25 = round2(sliceFor(capital, tvl, implied * band.p25, share));
  const sliceP75 = round2(sliceFor(capital, tvl, implied * band.p75, share));
  const net = round2(pLaunch * slice - fees - tbill);
  const netP25 = round2(pLaunch * sliceP25 - fees - tbill);
  const netP75 = round2(pLaunch * sliceP75 - fees - tbill);
  return {
    slice,
    slice_p25: sliceP25,
    slice_p75: sliceP75,
    tbill,
    net,
    net_p25: netP25,
    net_p75: netP75,
    verdict: verdict4(netP25, net, netP75),
    break_even: breakEvenCapital(tvl, implied, fees, holdDays, pLaunch, share),
    break_even_share: breakEvenShare(tvl, implied, fees, holdDays, pLaunch, capital),
  };
}

/** The walk-away step: the plan's case against itself, from its own numbers. */
function walkAwayText(nums: PlanNumbers, pLaunch: number): string {
  const pct = Math.round(pLaunch * 100) + "%";
  const be = nums.break_even === null
    ? "No deposit breaks even at the point value."
    : "The plan breaks even above a $" + nums.break_even.toLocaleString("en-US") + " deposit.";
  if (nums.verdict === "robust") {
    return "The case against this plan: even the low end of the band nets " + signed(nums.net_p25) + ", but the launch chance is only " + pct + " — most protocols in this band never launch, and the point net of " + signed(nums.net) + " assumes this one does. " + be + " Farm it only if you accept that the launch, not the ranking, is the bet.";
  }
  if (nums.verdict === "farm") {
    return "The case against this plan: the launch chance is only " + pct + " and the low end of the band nets " + signed(nums.net_p25) + ", so the point net of " + signed(nums.net) + " depends on this protocol launching at or above its point value. " + be + " Size it as a bet on the launch, not on the ranking.";
  }
  if (nums.verdict === "thin") {
    return "The case against this plan: only the high end of the band pays (" + signed(nums.net_p75) + ") while the point net is " + signed(nums.net) + ", and the launch chance is " + pct + ". " + be + " There are better rows on this board.";
  }
  return "Do not farm this one: the launch chance is " + pct + ", the point net is " + signed(nums.net) + ", the high end nets " + signed(nums.net_p75) + ", and " + (nums.break_even === null ? "no deposit breaks even." : "the plan only breaks even above a $" + nums.break_even.toLocaleString("en-US") + " deposit.") + " The fees and the T-bill eat the slice at every size — the honest move is to skip it and farm a row whose low end pays.";
}

// ---- the eight steps -----------------------------------------------------

/** A row's farm plan at one capital: eight concrete steps, plus the numbers that back them. */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  capital: number,
  implied: number,
  pLaunch: number,
  band: PlanBand,
): { steps: string[]; costs: { chain: string; fee: ChainFee; fees: number; holdDays: number; minutes: number }; nums: PlanNumbers } {
  const costs = planCosts(p, age);
  const nums = planNumbers(p.tvl, implied, costs.fees, costs.holdDays, pLaunch, capital, AIRDROP_SHARE, band);
  const { gas, bridge } = costs.fee;
  const weeks = Math.ceil(costs.holdDays / 7);
  const cap = "$" + capital.toLocaleString("en-US");
  const verdictWord = nums.verdict === "robust" ? "ROBUST" : nums.verdict === "farm" ? "FARM" : nums.verdict === "thin" ? "THIN" : "SKIP";
  const steps: FarmStep[] = [
    {
      text: "Open a fresh wallet that holds only the funds you plan to farm, and bridge " + cap + " of USDC to " + costs.chain + " for the position.",
      cost: dollars(bridge + gas),
      time: "5 minutes",
    },
    { text: pointsStep(p), cost: "$0", time: "15 minutes" },
    { text: actionFor(p, chainOf(p), capital), cost: dollars(2 * gas), time: "15 minutes" },
    {
      text: weeklyFor(p) + " Repeat it weekly for " + weeks + " weeks.",
      cost: "$0",
      time: 5 * weeks + " minutes over " + weeks + " weeks",
    },
    { text: "Set an alert for " + p.name + "'s token launch or points season announcement and check the protocol's official page once a week.", cost: "$0", time: "5 minutes" },
    {
      text: "Claim the points or airdrop from " + p.name + "'s official claim page and check the receipt lands in the farm wallet. " + tierNote(capital) + " Plan verdict " + verdictWord + " at this capital (launch chance " + Math.round(pLaunch * 100) + "%).",
      cost: dollars(gas),
      time: "10 minutes",
    },
    { text: "Unwind: withdraw the deposit and bridge the funds back to your main wallet once the claim is confirmed.", cost: dollars(gas + bridge), time: "10 minutes" },
    { text: walkAwayText(nums, pLaunch), cost: "$0", time: "5 minutes" },
  ];
  return { steps: steps.map(stepText), costs, nums };
}

/** A row's farm economics at the standard capital: what a $1,000 plan pays, at the point and at both band ends. */
export function farmEcon(p: SnapshotProtocol, age: number | null, implied: number, pLaunch: number, band: PlanBand): FarmCost {
  const plan = farmSteps(p, age, STANDARD_CAPITAL, implied, pLaunch, band);
  const { fees, holdDays, minutes, chain } = plan.costs;
  const nums = plan.nums;
  const timeUsd = round2((minutes / 60) * TIME_RATE_USD_PER_HOUR);
  const totalCost = round2(fees + nums.tbill + timeUsd);
  const net = nums.net;
  // min_deposit_usd is the same root as break_even_capital_usd (the smallest
  // capital whose point net is positive); one number, two names, no drift.
  const sensitivity: number[][] = [];
  const shares = [0.05, 0.1, 0.15];
  const capitals = [100, 500, 1000, 5000, 10000];
  for (const share of shares) {
    const row: number[] = [];
    for (const cap of capitals) {
      const slice = sliceFor(cap, p.tvl, implied, share);
      row.push(round2(pLaunch * slice - fees - round2(TBILL_RATE * cap * (holdDays / 365))));
    }
    sensitivity.push(row);
  }
  return {
    capital_usd: STANDARD_CAPITAL,
    airdrop_share: AIRDROP_SHARE,
    chain,
    fees_usd: fees,
    hold_days: holdDays,
    time_minutes: minutes,
    time_usd: timeUsd,
    opportunity_usd: nums.tbill,
    slice_usd: nums.slice,
    total_cost_usd: totalCost,
    net_usd: net,
    net_p25_usd: nums.net_p25,
    net_p75_usd: nums.net_p75,
    p_launch: pLaunch,
    verdict: nums.verdict,
    min_deposit_usd: nums.break_even,
    break_even_capital_usd: nums.break_even,
    break_even_share: nums.break_even_share,
    per_hour_usd: round2(net / (minutes / 60)),
    sensitivity,
  };
}

/** A row's farm plan at one capital tier: its own steps, costs and verdict. */
export function farmTier(p: SnapshotProtocol, age: number | null, implied: number, capital: number, pLaunch: number, band: PlanBand): FarmTier {
  const plan = farmSteps(p, age, capital, implied, pLaunch, band);
  const { fees, holdDays, minutes, chain } = plan.costs;
  const nums = plan.nums;
  return {
    capital_usd: capital,
    chain,
    fees_usd: fees,
    hold_days: holdDays,
    time_minutes: minutes,
    slice_usd: nums.slice,
    net_usd: nums.net,
    net_p25_usd: nums.net_p25,
    net_p75_usd: nums.net_p75,
    p_launch: pLaunch,
    verdict: nums.verdict,
    per_hour_usd: round2(nums.net / (minutes / 60)),
    steps: plan.steps,
  };
}

// ---- the board -----------------------------------------------------------

/**
 * Build the ranked board from the snapshot: the model fit, the watchlist and
 * the ranked rows, the live-token list, the set-aside list, the comparables,
 * the launch-probability table, and the universe arithmetic. Each row costs
 * the model's implied value at the standard capital, plus the same plan at
 * $100 and $10,000, each with its own 4-way verdict. The model fit is
 * computed once (it uses the trimmed comps); the backtest is NOT recomputed
 * here — it is run separately by the driver and recorded as the anchors.
 *
 * Each row's model object records the input factors and the uncertainty
 * display: the P10-P90 band and the band calibration. To reproduce v10 the
 * model must be identical: the same comps, the same curve, family, growth,
 * seasoning, sibling and breadth.
 */
export function buildBoard(snapshot: Snapshot, backtestData: Backtest): Radar {
  const asOf = snapshot.as_of;
  const { points, dropped } = fitPoints(snapshot);
  const fit = ols(points);
  const fam = familyFactors(points, fit);
  const beta = breadthBeta(points, fit, fam);
  const plaunch = plaunchTable(snapshot);
  const band: PlanBand = { p25: backtestData.p25, p75: backtestData.p75 };

  const watchlist = new Set(snapshot.watchlist);
  // The first protocol per first word among protocols that HAVE a token in
  // the loose sense (a market cap, a symbol, or a gecko id). A strictly
  // pre-token protocol sharing such a first word is a sibling of a token
  // that trades. The parent need not trade itself: GMX Solana's parent is
  // GMX EVM, which carries the GMX symbol but no market cap, and Solv
  // Strategies' parent is a Solv record with the SOLV symbol.
  const liveFirst = new Map<string, string>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    const key = firstWord(p.name);
    if (key.length > 0 && !liveFirst.has(key)) liveFirst.set(key, p.id);
  }

  const liveRows: LiveRow[] = [];
  const setAsideRows: SetAsideRow[] = [];
  const board: BoardRow[] = [];

  for (const p of snapshot.protocols) {
    const traded = p.mcap_usd !== null && p.mcap_usd > 0;
    if (traded) {
      liveRows.push({
        slug: p.id,
        name: p.name,
        category: p.category === "" ? "Uncategorized" : p.category,
        chains: p.chains,
        tvl: p.tvl,
        mcap_usd: p.mcap_usd,
        change_7d: p.change_7d,
        fdv_tvl: p.tvl > 0 ? round2(p.mcap_usd! / p.tvl) : null,
      });
      continue;
    }
    if (!isPreToken(p)) {
      // The board's exclusion, in order (reproduces v10's 192 ranked /
      // 128 traded / 438 set aside exactly). A market cap of zero or less
      // — the snapshot carries one at -1 — is "zero", checked before the
      // announced test so a symbol does not rescue it.
      if (p.mcap_usd !== null && p.mcap_usd <= 0) {
        setAsideRows.push({
          slug: p.id,
          name: p.name,
          category: p.category === "" ? "Uncategorized" : p.category,
          tvl: p.tvl,
          reason: "Market cap is zero.",
        });
        continue;
      }
      // No market cap, but a symbol or a gecko_id: announced, unlaunched or
      // dead, so the radar does not rank it. Airdrop farmers care about
      // tokenless protocols, not about announced ones.
      setAsideRows.push({
        slug: p.id,
        name: p.name,
        category: p.category === "" ? "Uncategorized" : p.category,
        tvl: p.tvl,
        reason: "Has a symbol or CoinGecko id but no market cap; not strictly pre-token.",
      });
      continue;
    }
    const age = ageDays(asOf, p.listed_at);
    const isWatch = watchlist.has(p.id);
    const first = firstWord(p.name);
    const sibling = liveFirst.has(first);
    // A "possible parent" is a loose flag, not a model input: not on the
    // watchlist and at least $50M TVL, big enough that it could be the
    // parent protocol of a family. The dashboard does not display it.
    const possibleParent = !isWatch && p.tvl >= FLOOR_USD;

    if (PRODUCT_CATEGORIES.has(p.category)) {
      setAsideRows.push({
        slug: p.id,
        name: p.name,
        category: p.category,
        tvl: p.tvl,
        reason: "Category " + p.category + " is a wrapped, staked or bridged product of a token that trades.",
      });
      continue;
    }
    if (VERSIONED.test(p.name)) {
      setAsideRows.push({
        slug: p.id,
        name: p.name,
        category: p.category === "" ? "Uncategorized" : p.category,
        tvl: p.tvl,
        reason: "The name ends in a version marker: a pool of another protocol.",
      });
      continue;
    }
    if (WRAPPED_WORD.test(p.name)) {
      setAsideRows.push({
        slug: p.id,
        name: p.name,
        category: p.category === "" ? "Uncategorized" : p.category,
        tvl: p.tvl,
        reason: "The name carries wrapped, staked or staking: a product of a token that trades.",
      });
      continue;
    }
    if (sibling && !isWatch) {
      // Sibling rows are set aside: a wrapped, staked or bridged product of
      // a protocol that already has a token. Watchlist siblings stay on the
      // board, discounted x0.50, because the user explicitly listed them.
      setAsideRows.push({
        slug: p.id,
        name: p.name,
        category: p.category === "" ? "Uncategorized" : p.category,
        tvl: p.tvl,
        reason: "A sibling of a token that trades: its first word matches one.",
      });
      continue;
    }

    let implied = curveValue(fit, p.tvl);
    const familyFactor = fam.get(p.category === "" ? "Uncategorized" : p.category) ?? 1;
    implied *= familyFactor;
    const growth = growthFactor(p.change_7d, fit.b);
    implied *= growth;
    const seasoning = seasoningFactor(age);
    implied *= seasoning;
    const siblingFactor = sibling ? 0.5 : 1;
    implied *= siblingFactor;
    const breadth = breadthFactor(beta, p.chains);
    implied *= breadth;
    implied = Math.max(1, Math.round(implied));

    const pLaunch = plaunchFor(age, p.tvl, plaunch);
    const farm = farmEcon(p, age, implied, pLaunch, band);
    const tiers = TIER_CAPITALS.map((cap) => farmTier(p, age, implied, cap, pLaunch, band));
    const standard = farmSteps(p, age, STANDARD_CAPITAL, implied, pLaunch, band);

    board.push({
      slug: p.id,
      name: p.name,
      symbol: p.symbol,
      category: p.category === "" ? "Uncategorized" : p.category,
      chains: p.chains,
      tvl: p.tvl,
      change_7d: p.change_7d,
      age_days: age,
      rank: 0,
      implied_value_usd: implied,
      is_watchlist: isWatch,
      possible_parent: possibleParent,
      sibling,
      farm_steps: standard.steps,
      farm,
      farm_tiers: tiers,
      model: {
        curve_usd: curveValue(fit, p.tvl),
        family_factor: familyFactor,
        growth_factor: growth,
        seasoning_factor: seasoning,
        sibling_factor: siblingFactor,
        breadth_factor: breadth,
        breadth_beta: round4(beta),
        multi_chain: breadthX(p.chains) === 1,
        implied_tvl_multiple: round2(implied / p.tvl),
        p10_usd: Math.round(implied * backtestData.p10),
        p25_usd: Math.round(implied * backtestData.p25),
        p75_usd: Math.round(implied * backtestData.p75),
        p90_usd: Math.round(implied * backtestData.p90),
        p_launch: pLaunch,
        loo_within3: backtestData.loo_within3,
        oos_miss: backtestData.oos_miss,
        oos2024_miss: backtestData.oos2024_miss,
      },
    });
  }

  // Rank by implied value, then by name for ties.
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.name < b.name ? -1 : 1));
  board.forEach((row, i) => {
    row.rank = i + 1;
  });
  liveRows.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  setAsideRows.sort((a, b) => b.tvl - a.tvl || (a.name < b.name ? -1 : 1));

  // The comps tab: every fitted token, its real cap, its fitted value and its miss.
  const comps: CompRow[] = points.map((d) => {
    const fitted = Math.round(predictPoint(d, fit, fam, beta, asOf));
    return { slug: d.slug, name: d.name, category: d.category, tvl: d.tvl, mcap: d.mcap, fitted, miss: round2(miss(fitted, d.mcap)) };
  });
  comps.sort((a, b) => b.miss - a.miss);

  const ratios = points.map((d) => d.mcap / d.tvl).sort((x, y) => x - y);
  const flat = ratios[Math.floor(ratios.length / 2)]!;
  const r2 = ((): number => {
    const ys = points.map((d) => log10(d.mcap));
    const my = average(ys);
    let sst = 0;
    let sse = 0;
    for (let i = 0; i < points.length; i++) {
      const pred = log10(predictPoint(points[i]!, fit, fam, beta, asOf));
      sst += (ys[i]! - my) ** 2;
      sse += (ys[i]! - pred) ** 2;
    }
    return round3(1 - sse / sst);
  })();

  const familyStats: FamilyStat[] = [...fam.entries()]
    .map(([category, factor]) => ({ category, tokens: points.filter((d) => d.category === category).length, factor: round3(factor) }))
    .sort((a, b) => b.factor - a.factor);

  const counts = { robust: 0, farm: 0, thin: 0, skip: 0 };
  for (const row of board) counts[row.farm.verdict]++;
  const medianImplied = board.length > 0 ? median(board.map((r) => r.implied_value_usd)) : 0;
  const top = board.slice(0, 5);

  return {
    board,
    early_size: board.length,
    live_size: liveRows.length,
    watchlist_size: board.filter((r) => r.is_watchlist).length,
    set_aside_size: setAsideRows.length,
    model: {
      version: MODEL_VERSION,
      comps_count: points.length,
      dropped,
      a: round4(fit.a),
      b: round4(fit.b),
      r2,
      breadth_beta: round4(beta),
      breadth_multi_count: points.filter((d) => breadthX(d.chains) === 1).length,
      loo_miss: backtestData.loo_miss,
      loo_within3: backtestData.loo_within3,
      loo_within10: backtestData.loo_within10,
      loo_flat_miss: backtestData.loo_flat_miss,
      loo_flat_within3: backtestData.loo_flat_within3,
      oos_miss: backtestData.oos_miss,
      oos_train: backtestData.oos_train,
      oos_test: backtestData.oos_test,
      oos_within3: backtestData.oos_within3,
      oos_flat_miss: backtestData.oos_flat_miss,
      oos_flat_within3: backtestData.oos_flat_within3,
      oos2024_miss: backtestData.oos2024_miss,
      oos2024_train: backtestData.oos2024_train,
      oos2024_test: backtestData.oos2024_test,
      oos2024_within3: backtestData.oos2024_within3,
      oos2024_flat_miss: backtestData.oos2024_flat_miss,
      oos2024_flat_within3: backtestData.oos2024_flat_within3,
      curve_only_loo: backtestData.curve_only_loo,
      factor_growth_r: backtestData.factor_growth_r,
      factor_age_r: backtestData.factor_age_r,
      band50: backtestData.band50,
      band80: backtestData.band80,
      p10: backtestData.p10,
      p25: backtestData.p25,
      p75: backtestData.p75,
      p90: backtestData.p90,
      anchors: { flat: round2(flat), v1: 3.376, v5: 3.15, v6: 3.4, v7: 3.376, v9: 2.8294, v10: 2.8207, top: 2.01 },
    },
    top,
    median_implied: Math.round(medianImplied),
    farm_next: board
      .filter((r) => r.farm.net_usd > 0)
      .sort((a, b) => b.farm.per_hour_usd - a.farm.per_hour_usd)
      .slice(0, 10)
      .map((r) => ({ slug: r.slug, name: r.name, net_per_hour: r.farm.per_hour_usd, net_usd: r.farm.net_usd, capital_usd: STANDARD_CAPITAL })),
    best_per_hour: board
      .filter((r) => r.farm.net_usd > 0)
      .sort((a, b) => b.farm.per_hour_usd - a.farm.per_hour_usd)
      .slice(0, 10)
      .map((r) => ({ slug: r.slug, name: r.name, per_hour_usd: r.farm.per_hour_usd, net_usd: r.farm.net_usd })),
    verdict_counts: counts,
    as_of: snapshot.as_of,
    live: liveRows,
    set_aside_rows: setAsideRows,
    comps,
    plaunch,
    family: familyStats,
    fees: CHAIN_FEES,
    curve_points: points.map((d) => ({ slug: d.slug, name: d.name, tvl: d.tvl, mcap: d.mcap, category: d.category })),
    loo_points: backtestData.loo_points,
    universe: { total: snapshot.protocols.length, ranked: board.length, traded: liveRows.length, set_aside: setAsideRows.length },
  };
}

// ---- driver surface ------------------------------------------------------

/** The full build in one call: backtest, then the board. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const { points } = fitPoints(snapshot);
  const bt = backtest(snapshot, points);
  const radar = buildBoard(snapshot, bt);
  return { board: radar.board, radar };
}

/**
 * The board's own gate, run before anything is written: every watchlist
 * protocol ranked, every row carrying eight steps of 20-600 characters,
 * three capital tiers, a verdict from the four-way set, a launch
 * probability in [0, 1], and a break-even capital that is null or at least
 * $10. Returns the first problem found, or null when the board is clean.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return "board holds " + board.length + " rows, under 100";
  const watch = new Set(snapshot.watchlist);
  const ranked = new Set(board.map((r) => r.slug));
  for (const w of watch) {
    if (!ranked.has(w)) return "watchlist protocol " + w + " is not on the board";
  }
  const verdicts = new Set(["robust", "farm", "thin", "skip"]);
  for (const row of board) {
    if (row.implied_value_usd <= 0) return row.slug + ": implied value " + row.implied_value_usd;
    if (row.farm_steps.length !== 8) return row.slug + ": " + row.farm_steps.length + " steps, expected 8";
    for (const s of row.farm_steps) {
      if (s.length < 20 || s.length > 600) return row.slug + ": step of " + s.length + " chars, outside 20..600";
    }
    if (row.farm_tiers.length !== 3) return row.slug + ": " + row.farm_tiers.length + " tiers, expected 3";
    for (const t of row.farm_tiers) {
      if (!verdicts.has(t.verdict)) return row.slug + ": tier verdict " + t.verdict;
      if (t.p_launch < 0 || t.p_launch > 1) return row.slug + ": P(launch) " + t.p_launch;
    }
    if (!verdicts.has(row.farm.verdict)) return row.slug + ": verdict " + row.farm.verdict;
    if (row.farm.p_launch < 0 || row.farm.p_launch > 1) return row.slug + ": P(launch) " + row.farm.p_launch;
    if (row.farm.break_even_capital_usd !== null && row.farm.break_even_capital_usd < 10) return row.slug + ": break-even capital " + row.farm.break_even_capital_usd;
    if (row.model.p_launch < 0 || row.model.p_launch > 1) return row.slug + ": model P(launch) " + row.model.p_launch;
  }
  return null;
}

/** The data.js the dashboard reads: the whole radar as window.RADAR. */
export function dataScript(radar: Radar): string {
  return "window.RADAR = " + JSON.stringify(radar) + ";\n";
}
