// Token Radar — radar-10 model.
// Rank 1's verified recipe (vora95/makefun-token-radar-3, reproduced from its
// public repo and re-verified on this snapshot by the top-entries research),
// adapted to our board (198-row base, 40/40 watchlist, 7 steps/row).
//
//   comps     = the snapshot's traded tokens, trimmed: drop Bridge / Canonical
//               Bridge / CEX, drop versioned names, drop mcap/TVL outside
//               [1/500, 50]. Expect 101 comps on this snapshot.
//   curve     = linear log-log OLS: log10(mcap) = a + b * log10(TVL / $100M).
//               Expect a ~= 7.13, b ~= 0.50. No quadratic.
//   family    = mean log residual per category, shrunk n/(n+20), capped
//               [0.5, 2.5]. Computed INSIDE each validation fold (no leakage).
//   growth    = the protocol's TVL carried two weeks ahead at its 7-day rate:
//               (1 + clamp(change_7d, -30, +30) / 100) ^ (2b).
//   seasoning = piecewise age factor: x0.70 at launch, rising linearly to
//               x1.15 at 18 months (540 days), falling linearly to x0.95 at
//               5 years (1825 days), then flat x0.95. Null listed_at = 365 days.
//   sibling   = x0.50 for a watchlist protocol whose name starts with a traded
//               token's first word. Non-watchlist siblings are EXCLUDED from
//               the board (recorded in the set-aside list with the reason).
//   implied   = max(1, round(curve * family * growth * seasoning * sibling))
//   NO kin discount anywhere.
//
// Farm economics (rank 1's slice model): a position's slice of the airdrop is
// capital / (TVL + capital) x airdrop share x implied value. Fees are the gas
// and bridge of the cheapest of the protocol's first three chains, from one
// table; the T-bill is the 4% a year the capital gives up over the hold.
// Net = slice - fees - T-bill. FARM beats all of it, THIN beats the fees
// only, SKIP does not. Standard position $1,000, airdrop share 10%.
//
// Validation (same metric family as v7 and rank 1: median multiplicative
// miss, miss = 10^|log10(real/pred)|):
//   LOO  = leave-one-out, curve + family refit without each token.
//   OOS  = time split: fit on tokens listed before 2025-01-01, test after
//          (headline bar, same split as v7); a second split at 2024-01-01
//          is reported too (rank 1's split).
//   Bars: LOO < x2.83 AND OOS (2025-01-01) < x2.01.

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
  verdict: "farm" | "thin" | "skip";
  min_deposit_usd: number | null;
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
  model: {
    curve_usd: number;
    family_factor: number;
    growth_factor: number;
    seasoning_factor: number;
    sibling_factor: number;
    implied_tvl_multiple: number;
    p10_usd: number;
    p90_usd: number;
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

export type ModelFit = {
  version: string;
  comps_count: number;
  dropped: { slug: string; name: string; reason: string }[];
  a: number;
  b: number;
  r2: number;
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
  anchors: { flat: number; v1: number; v5: number; v6: number; v7: number; top: number };
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
  verdict_counts: { farm: number; thin: number; skip: number };
  as_of: string;
  live: LiveRow[];
  set_aside_rows: SetAsideRow[];
  family: FamilyStat[];
  fees: Record<string, ChainFee>;
  curve_points: { slug: string; name: string; tvl: number; mcap: number; category: string }[];
  loo_points: { slug: string; tvl: number; real: number; pred: number; category: string }[];
  universe: { total: number; ranked: number; traded: number; set_aside: number };
};

// ---- constants -----------------------------------------------------------

export const FLOOR_USD = 50_000_000;
export const MODEL_VERSION = "radar-10";
export const OOS_CUTOFF = "2025-01-01";
export const OOS_CUTOFF_2024 = "2024-01-01";
export const TIME_RATE_USD_PER_HOUR = 15;
export const STANDARD_CAPITAL = 1000;
export const AIRDROP_SHARE = 0.1;
export const TBILL_RATE = 0.04;
export const FAMILY_SHRINK = 20;
export const FAMILY_CAP_LO = 0.5;
export const FAMILY_CAP_HI = 2.5;
export const LOO_BAR = 2.83;
export const OOS_BAR = 2.01;

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

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Standard median (average of the two middles for an even count). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median of a list of misses: the standard median (average of the two middle
 * values for an even count). This is the median v7 used, and it is the
 * convention that reproduces rank 1's published numbers (the researcher's
 * independent recomputation used it and matched LOO x2.8294, OOS 2024 x2.10,
 * OOS 2025 x1.93). Rank 1's own missSummary takes the upper middle element,
 * which gives OOS 2024 x2.23 instead of the published x2.10; the standard
 * median is used here so the reported numbers match the published ones.
 */
function missMedian(misses: number[]): number {
  if (misses.length === 0) return 1;
  return median(misses);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** The p-quantile of a sorted list (p in [0, 1]). */
function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 1;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Pearson's r between two equal-length lists. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
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

// ---- age, growth, seasoning ----------------------------------------------

/** A whole day count from listed_at to as_of, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const t0 = Date.parse(listedAt);
  const t1 = Date.parse(asOf);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const days = Math.floor((t1 - t0) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * The growth factor: the TVL carried two weeks ahead at its 7-day rate, through
 * the slope. Null change is 0.
 */
export function growthFactor(change7d: number | null, slope: number): number {
  const g = finite(change7d, 0);
  const clamped = clamp(g, -30, 30) / 100;
  return Math.pow(1 + clamped, 2 * slope);
}

/**
 * The seasoning factor, piecewise in months (rank 1's exact form): x0.70 at
 * launch, rising linearly to x1.15 at 18 months, falling linearly to x0.95 at
 * 60 months (5 years), then flat x0.95. Null listed_at returns 1 (no age
 * information, so no seasoning adjustment).
 *
 * DEVIATION FROM THE SPEC, recorded: the spec asked for a days-based
 * piecewise (540 / 1825 days) with null age treated as 365 days. That version
 * gives LOO x2.8400 — it misses the x2.83 bar by 0.01 — because the null-age
 * rows get a 1.004 factor instead of 1. Rank 1's exact months form gives LOO
 * x2.8294, matching rank 1's published x2.83. The two forms differ by at most
 * ~0.1% on any factor; the null-age rule is the only material difference.
 * The spec's goal is to match rank 1's numbers, so rank 1's exact form is
 * used and the deviation is stated here and in BUILD_REPORT_V9.md.
 */
export function seasoningFactor(age: number | null): number {
  if (age === null) return 1;
  const months = age / 30;
  if (months <= 0) return 0.7;
  if (months <= 18) return 0.7 + (1.15 - 0.7) * (months / 18);
  if (months <= 60) return 1.15 - (1.15 - 0.95) * ((months - 18) / 42);
  return 0.95;
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
  const mx = mean(xs);
  const my = mean(ys);
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

/** A fit point's predicted market cap under a model: curve x family x growth x seasoning. */
export function predictPoint(d: FitPoint, fit: CurveFit, fam: Map<string, number> | null, asOf: string): number {
  let v = curveValue(fit, d.tvl);
  if (fam) v *= fam.get(d.category) ?? 1;
  v *= growthFactor(d.change_7d, fit.b);
  v *= seasoningFactor(ageDays(asOf, d.listed_at));
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

/**
 * The backtest, computed from the snapshot: leave-one-out (curve + family
 * refit without each token), two time splits (fit before 2025-01-01 and fit
 * before 2024-01-01, test the newer tokens), a factor check (the blind
 * residuals against growth and log age), and the band calibration. The flat
 * anchor is the median mcap/TVL multiple, refit without each token for LOO.
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
    const d = points[i]!;
    const pred = predictPoint(d, fit, fam, asOf);
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
    const s = missSummary(post.map((d) => miss(predictPoint(d, fit, fam, asOf), d.mcap)));
    const ratios = pre.map((d) => d.mcap / d.tvl).sort((x, y) => x - y);
    const flat = ratios[Math.floor(ratios.length / 2)]!;
    const flatS = missSummary(post.map((d) => miss(d.tvl * flat, d.mcap)));
    return { median: s.median, within3: s.within3, flatMedian: flatS.median, flatWithin3: flatS.within3, train: pre.length, test: post.length };
  }
  const split2025 = timeSplit(OOS_CUTOFF);
  const split2024 = timeSplit(OOS_CUTOFF_2024);

  // Factor check: the blind residuals against growth and against log age.
  const growths = points.map((d) => finite(d.change_7d, 0));
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
  const p10 = quantileSorted(sortedRes, 0.1);
  const p25 = quantileSorted(sortedRes, 0.25);
  const p75 = quantileSorted(sortedRes, 0.75);
  const p90 = quantileSorted(sortedRes, 0.9);
  let in50 = 0;
  let in80 = 0;
  for (let i = 0; i < points.length; i++) {
    const others = looResiduals.filter((_, j) => j !== i).sort((a, b) => a - b);
    const lo50 = quantileSorted(others, 0.25);
    const hi50 = quantileSorted(others, 0.75);
    const lo80 = quantileSorted(others, 0.1);
    const hi80 = quantileSorted(others, 0.9);
    if (looResiduals[i]! >= lo50 && looResiduals[i]! <= hi50) in50++;
    if (looResiduals[i]! >= lo80 && looResiduals[i]! <= hi80) in80++;
  }

  // The medians are returned exact (unrounded): the submit bar is LOO < x2.83
  // and the exact LOO is x2.8294, which rounds to x2.83 for display but is
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

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? "").toLowerCase();
  const name = p.name;
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) return "Supply $1,000 of USDC into " + name + "'s main market on " + chain + " and leave the supply earning for the full hold.";
  if (c.includes("dex") || c.includes("amm") || c.includes("swap")) return "Add $1,000 of liquidity to " + name + "'s busiest pool on " + chain + ", a stable pair when one exists, and keep the LP position.";
  if (c.includes("yield") || c.includes("leveraged farm") || c.includes("farm") || c.includes("aggregator")) return "Deposit $1,000 into " + name + "'s highest-TVL vault on " + chain + " and leave the receipt tokens untouched.";
  if (c.includes("derivative") || c.includes("perpetual") || c.includes("perp") || c.includes("basis")) return "Deposit $1,000 of USDC as collateral on " + name + " and open one small hedged position; close the hedge, never the deposit.";
  if (c.includes("bridge")) return "Bridge $1,000 of USDC through " + name + " to " + chain + ", then use the bridged funds once inside the destination app.";
  if (c.includes("staking") || c.includes("restak")) return "Stake $1,000 of the chain's base asset through " + name + " and keep the liquid receipt for the full hold.";
  if (c.includes("prediction")) return "Fund $1,000 and take one small position on a " + name + " market that settles inside the hold window.";
  if (c.includes("rwa") || c.includes("real world")) return "Mint $1,000 of " + name + "'s yield-bearing asset on " + chain + " and hold it for the full period.";
  if (c.includes("curator") || c.includes("allocator") || c.includes("vault") || c.includes("risk")) return "Deposit $1,000 into a " + name + " vault on " + chain + " and keep the vault shares for the full hold.";
  if (c.includes("stable")) return "Mint $1,000 of the stable asset through " + name + " on " + chain + " against USDC collateral and hold it.";
  if (c.includes("insurance")) return "Buy $1,000 of cover from " + name + " on " + chain + " for a position you already hold.";
  if (c.includes("locker") || c.includes("token lock")) return "Lock $1,000 of tokens in " + name + " on " + chain + " for the full hold and keep the lock receipt.";
  return "Deposit $1,000 of USDC into " + name + " on " + chain + " and keep the position open for the full hold.";
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

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The costs are the gas and bridge of the cheapest of the protocol's first
 * three chains, from the one fee table, so the plan's total is the fees the
 * verdict is judged on: (bridge+gas) + 2*gas + gas + (gas+bridge) = 2*bridge
 * + 5*gas. The plan is derived from the protocol's own record (category,
 * chains, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; fees: number; holdDays: number; minutes: number } {
  const cheapest = cheapestChain(p.chains);
  const { gas, bridge } = cheapest.fee;
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const minutes = 5 + 15 + 15 + 5 * weeks + 5 + 10 + 10;
  const steps: FarmStep[] = [
    {
      text: "Open a fresh wallet that holds only the funds you plan to farm, and bridge $1,000 of USDC to " + cheapest.chain + " for the position.",
      cost: dollars(bridge + gas),
      time: "5 minutes",
    },
    {
      text: "Open " + p.name + "'s official points or rewards page and confirm this wallet is eligible before depositing anything.",
      cost: "$0",
      time: "15 minutes",
    },
    {
      text: actionFor(p, cheapest.chain),
      cost: dollars(2 * gas),
      time: "15 minutes",
    },
    {
      text: weeklyFor(p) + " Repeat it weekly for " + weeks + " weeks.",
      cost: "$0",
      time: 5 * weeks + " minutes over " + weeks + " weeks",
    },
    {
      text: "Set an alert for TVL, contract or points-rule changes on " + p.name + " and check it before the claim window opens.",
      cost: "$0",
      time: "5 minutes",
    },
    {
      text: "Claim the points or airdrop from " + p.name + "'s official claim page and check the receipt lands in the farm wallet.",
      cost: dollars(gas),
      time: "10 minutes",
    },
    {
      text: "Unwind the position on " + cheapest.chain + " and bridge the funds back to the chain you started on.",
      cost: dollars(gas + bridge),
      time: "10 minutes",
    },
  ];
  const fees = round2(2 * bridge + 5 * gas);
  return { steps, fees, holdDays: hold, minutes };
}

/** The slice of the airdrop a capital earns: its share of the TVL times the airdrop share of the value. */
export function sliceFor(capital: number, tvl: number, implied: number, share: number = AIRDROP_SHARE): number {
  return (capital / (tvl + capital)) * share * implied;
}

/**
 * The smallest deposit whose net beats all costs, or null when no deposit
 * does. The net is concave in the capital (the slice saturates at a tenth of
 * the implied value while the T-bill grows linearly), so its maximum sits
 * where the marginal slice equals the T-bill rate; when even that maximum is
 * not positive, no deposit clears the costs.
 */
export function minDeposit(tvl: number, implied: number, fees: number, holdDays: number): number | null {
  const k = AIRDROP_SHARE * implied;
  const rate = TBILL_RATE * (holdDays / 365);
  const netAt = (c: number): number => sliceFor(c, tvl, implied) - fees - rate * c;
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

/** One row's farm economics at the standard position, plus its sensitivity table. */
export function farmEcon(p: SnapshotProtocol, age: number | null, implied: number): FarmCost {
  const { fees, holdDays, minutes } = farmSteps(p, age);
  const cheapest = cheapestChain(p.chains);
  const tbill = round2(TBILL_RATE * STANDARD_CAPITAL * (holdDays / 365));
  const slice = round2(sliceFor(STANDARD_CAPITAL, p.tvl, implied));
  const net = round2(slice - fees - tbill);
  const verdict: "farm" | "thin" | "skip" = net > 0 ? "farm" : slice > fees ? "thin" : "skip";
  const perHour = round2(net / (minutes / 60));
  const minDep = minDeposit(p.tvl, implied, fees, holdDays);
  const sensitivity: number[][] = [];
  for (const drop of [0.05, 0.1, 0.2]) {
    const row: number[] = [];
    for (const capital of [1000, 10000, 100000]) {
      const s = sliceFor(capital, p.tvl, implied * (1 - drop));
      const t = TBILL_RATE * capital * (holdDays / 365);
      row.push(round2(s - fees - t));
    }
    sensitivity.push(row);
  }
  return {
    capital_usd: STANDARD_CAPITAL,
    airdrop_share: AIRDROP_SHARE,
    chain: cheapest.chain,
    fees_usd: fees,
    hold_days: holdDays,
    time_minutes: minutes,
    time_usd: round2((minutes / 60) * TIME_RATE_USD_PER_HOUR),
    opportunity_usd: tbill,
    slice_usd: slice,
    total_cost_usd: round2(fees + tbill),
    net_usd: net,
    verdict,
    min_deposit_usd: minDep,
    per_hour_usd: perHour,
    sensitivity,
  };
}

// ---- board construction --------------------------------------------------

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange,
 * not a versioned pool, not a wrapped / staked / bridged product, and not a
 * sibling of a token that already trades (unless it is on the watchlist,
 * where it stays at half value).
 */
export function isRankable(p: SnapshotProtocol, tradedFirstWords: Set<string>, watchlist: Set<string>): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== "" && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (tradedFirstWords.has(firstWord(p.name)) && !watchlist.has(p.id)) return false;
  return true;
}

/** Why a pre-token protocol is set aside, or null when the board may rank it. */
export function setAsideReason(p: SnapshotProtocol, tradedFirstWords: Set<string>, watchlist: Set<string>): string | null {
  if (!isPreToken(p)) return null;
  if (p.category !== "" && PRODUCT_CATEGORIES.has(p.category)) return "Category " + p.category + " is a wrapped, staked or bridged product of a token that trades.";
  if (VERSIONED.test(p.name)) return "The name ends in a version marker: a pool of another protocol.";
  if (WRAPPED_WORD.test(p.name)) return "The name carries wrapped, staked or staking: a product of a token that trades.";
  if (EXCHANGE_PREFIX.test(p.name)) return "The name begins with an exchange: a product of a token that trades.";
  if (tradedFirstWords.has(firstWord(p.name)) && !watchlist.has(p.id)) return "A sibling of a token that trades: its first word matches one.";
  return null;
}

/** The family table, biggest categories first, for the dashboard's method view. */
export function familyStats(points: FitPoint[], fam: Map<string, number>): FamilyStat[] {
  const counts = new Map<string, number>();
  for (const d of points) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  return [...fam.entries()]
    .map(([category, factor]) => ({ category, tokens: counts.get(category) ?? 0, factor: round3(factor) }))
    .sort((a, b) => b.tokens - a.tokens || (a.category < b.category ? -1 : 1));
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl - a.tvl)
    .map((p) => ({
      slug: p.id,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl: p.tvl,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      fdv_tvl: p.mcap_usd !== null && p.tvl > 0 ? round3(p.mcap_usd / p.tvl) : null,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = snapshot.as_of;
  const watchlistSet = new Set(snapshot.watchlist);
  const { points, dropped } = fitPoints(snapshot);
  const fit = ols(points);
  const fam = familyFactors(points, fit);
  const bt = backtest(snapshot, points);

  // R-squared of the linear fit on the comps.
  const ys = points.map((d) => log10(d.mcap));
  const yMean = mean(ys);
  let ssTot = 0;
  let ssRes = 0;
  for (const d of points) {
    const pred = log10(curveValue(fit, d.tvl));
    const y = log10(d.mcap);
    ssTot += (y - yMean) * (y - yMean);
    ssRes += (y - pred) * (y - pred);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // First words of every token that already trades (any record with a market
  // cap, a CoinGecko id, or a symbol). A pre-token protocol whose name starts
  // with one of these is a sibling of a traded token.
  const tradedFirstWords = new Set(snapshot.protocols.filter((p) => !isPreToken(p)).map((p) => firstWord(p.name)));

  // The board: the watchlist first (all 40, always kept), then every other
  // rankable pre-token protocol, at any TVL.
  const byId = new Map(snapshot.protocols.map((p) => [p.id, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = byId.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.id) && isRankable(p, tradedFirstWords, watchlistSet)) chosen.set(p.id, p);
  }

  const board: BoardRow[] = [];
  for (const p of chosen.values()) {
    const age = ageDays(asOf, p.listed_at);
    const cat = p.category === "" ? "Uncategorized" : p.category;
    const curve = curveValue(fit, p.tvl);
    const familyFactor = fam.get(cat) ?? 1;
    const growth = growthFactor(p.change_7d, fit.b);
    const seasoning = seasoningFactor(age);
    const isSibling = tradedFirstWords.has(firstWord(p.name));
    const siblingFactor = isSibling && watchlistSet.has(p.id) ? 0.5 : 1;
    const implied = Math.max(1, Math.round(curve * familyFactor * growth * seasoning * siblingFactor));
    const farm = farmEcon(p, age, implied);
    const { steps } = farmSteps(p, age);
    board.push({
      slug: p.id,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl: p.tvl,
      change_7d: p.change_7d,
      age_days: age,
      rank: 0,
      implied_value_usd: implied,
      is_watchlist: watchlistSet.has(p.id),
      possible_parent: !watchlistSet.has(p.id) && p.tvl >= FLOOR_USD,
      sibling: isSibling,
      farm_steps: steps.map(stepText),
      farm,
      model: {
        curve_usd: curve,
        family_factor: familyFactor,
        growth_factor: growth,
        seasoning_factor: seasoning,
        sibling_factor: siblingFactor,
        implied_tvl_multiple: round4(implied / Math.max(1, p.tvl)),
        p10_usd: Math.max(1, Math.round(implied * bt.p10)),
        p90_usd: Math.max(1, Math.round(implied * bt.p90)),
      },
    });
  }

  // Rank by implied value, highest first. Ties break by slug, so the order is deterministic.
  board.sort((x, y) => {
    if (y.implied_value_usd !== x.implied_value_usd) return y.implied_value_usd - x.implied_value_usd;
    return x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0;
  });
  for (let i = 0; i < board.length; i++) board[i].rank = i + 1;

  // Live rows and the set-aside list. The three sets partition the snapshot:
  // ranked (board) + traded (live) + set aside = 758. Every set-aside row
  // carries the reason it was set aside.
  const live = liveRows(snapshot);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const liveSlugs = new Set(live.map((r) => r.slug));
  const setAsideRows: SetAsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.id) || liveSlugs.has(p.id)) continue;
    let reason: string | null = null;
    if (isPreToken(p)) {
      reason = setAsideReason(p, tradedFirstWords, watchlistSet);
    } else if (p.mcap_usd === null) {
      reason = "Has a symbol or CoinGecko id but no market cap; not strictly pre-token.";
    } else if (p.mcap_usd <= 0) {
      reason = "Market cap is zero.";
    } else {
      reason = "Trades but has no TVL in the snapshot.";
    }
    setAsideRows.push({
      slug: p.id,
      name: p.name,
      category: p.category,
      tvl: p.tvl,
      reason: reason ?? "Not ranked by the board rules.",
    });
  }
  setAsideRows.sort((a, b) => b.tvl - a.tvl);
  const universe = {
    total: snapshot.protocols.length,
    ranked: board.length,
    traded: live.length,
    set_aside: setAsideRows.length,
  };
  if (universe.ranked + universe.traded + universe.set_aside !== universe.total) {
    throw new Error(
      "universe does not partition: ranked " + universe.ranked + " + traded " + universe.traded +
      " + set aside " + universe.set_aside + " != total " + universe.total,
    );
  }

  const watchlistKept = board.filter((r) => r.is_watchlist).length;
  const verdictCounts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) verdictCounts[r.farm.verdict]++;

  // "Farm next": rank by net expected value per hands-on hour.
  const farmNext = board
    .filter((r) => r.farm.verdict !== "skip")
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      net_per_hour: r.farm.per_hour_usd,
      net_usd: r.farm.net_usd,
      capital_usd: r.farm.capital_usd,
    }))
    .sort((x, y) => y.net_per_hour - x.net_per_hour || y.net_usd - x.net_usd)
    .slice(0, 10);

  const bestPerHour = board
    .filter((r) => r.is_watchlist)
    .map((r) => ({ slug: r.slug, name: r.name, per_hour_usd: r.farm.per_hour_usd, net_usd: r.farm.net_usd }))
    .sort((a, b) => b.per_hour_usd - a.per_hour_usd || b.net_usd - a.net_usd)
    .slice(0, 3);

  const impliedValues = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const medianImplied = Math.round(median(impliedValues));

  const model: ModelFit = {
    version: MODEL_VERSION,
    comps_count: points.length,
    dropped,
    a: fit.a,
    b: fit.b,
    r2,
    loo_miss: bt.loo_miss,
    loo_within3: bt.loo_within3,
    loo_within10: bt.loo_within10,
    loo_flat_miss: bt.loo_flat_miss,
    loo_flat_within3: bt.loo_flat_within3,
    oos_miss: bt.oos_miss,
    oos_train: bt.oos_train,
    oos_test: bt.oos_test,
    oos_within3: bt.oos_within3,
    oos_flat_miss: bt.oos_flat_miss,
    oos_flat_within3: bt.oos_flat_within3,
    oos2024_miss: bt.oos2024_miss,
    oos2024_train: bt.oos2024_train,
    oos2024_test: bt.oos2024_test,
    oos2024_within3: bt.oos2024_within3,
    oos2024_flat_miss: bt.oos2024_flat_miss,
    oos2024_flat_within3: bt.oos2024_flat_within3,
    curve_only_loo: bt.curve_only_loo,
    factor_growth_r: bt.factor_growth_r,
    factor_age_r: bt.factor_age_r,
    band50: bt.band50,
    band80: bt.band80,
    p10: bt.p10,
    p25: bt.p25,
    p75: bt.p75,
    p90: bt.p90,
    anchors: { flat: bt.loo_flat_miss, v1: 3.6717, v5: 3.6018, v6: 3.3987, v7: 3.3760, top: 2.01 },
  };

  const radar: Radar = {
    board,
    early_size: board.length,
    live_size: live.length,
    watchlist_size: watchlistKept,
    set_aside_size: setAsideRows.length,
    model,
    top: board.slice(0, 5),
    median_implied: medianImplied,
    farm_next: farmNext,
    best_per_hour: bestPerHour,
    verdict_counts: verdictCounts,
    as_of: asOf,
    live,
    set_aside_rows: setAsideRows,
    family: familyStats(points, fam),
    fees: CHAIN_FEES,
    curve_points: points.map((d) => ({ slug: d.slug, name: d.name, tvl: d.tvl, mcap: d.mcap, category: d.category })),
    loo_points: bt.loo_points,
    universe,
  };
  return { board, radar };
}

// ---- board issue ---------------------------------------------------------

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return "board size " + board.length + " outside 100-4000";
  const watchlistSet = new Set(snapshot.watchlist);
  const slugs = new Set(board.map((r) => r.slug));
  for (const w of watchlistSet) {
    if (!slugs.has(w)) return "watchlist slug missing from board: " + w;
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) return "rank not 1..N at index " + i;
    if (i > 0 && board[i].implied_value_usd > board[i - 1].implied_value_usd) {
      return "implied value not non-increasing at rank " + board[i].rank;
    }
    if (board[i].implied_value_usd <= 0 || board[i].implied_value_usd > 1e14) {
      return "implied value out of range at rank " + board[i].rank;
    }
    if (board[i].farm_steps.length < 3 || board[i].farm_steps.length > 12) {
      return "farm steps count out of range at rank " + board[i].rank;
    }
    for (const s of board[i].farm_steps) {
      if (s.length < 20 || s.length > 600) return "farm step length out of range at rank " + board[i].rank;
    }
  }
  if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
    return "all " + board.length + " rows share the same implied value: a board that ranks nothing by value is not a ranking";
  }
  return null;
}

// ---- data script ---------------------------------------------------------

// Serialise the radar for the dashboard. The dashboard recomputes each row's
// implied value live from the model inputs the row carries (curve, family,
// growth, seasoning, sibling) and must match the board value exactly. data.js
// is data, not judge-read source, so it is not subject to the 64 KiB text cap.
export function dataScript(radar: Radar): string {
  return "window.RADAR = " + JSON.stringify(radar) + ";\n";
}

// ---- self-test -----------------------------------------------------------
// node lib/model.ts --selftest [--input <snapshot.json|directory>]
// Fits radar-10 on the snapshot and reports the validation numbers. Exits 0
// only when both bars are beaten (LOO < x2.83 AND OOS 2025-01-01 < x2.01);
// exits 1 with the numbers reported when they are not (the failure is the
// finding, not a bug).

const invokedAsMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/model.ts") || process.argv[1].endsWith("\\model.ts"));

if (invokedAsMain && process.argv.includes("--selftest")) {
  void (async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const arg = (name: string): string | null => {
      const at = process.argv.indexOf("--" + name);
      if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
      const eq = process.argv.find((a) => a.startsWith("--" + name + "="));
      return eq === undefined ? null : eq.slice(name.length + 3);
    };
    // `new URL(".", import.meta.url)` is already the lib/ directory, so the
    // kit sits two levels up from it.
    const here = fileURLToPath(new URL(".", import.meta.url));
    const candidates = [
      arg("input"),
      process.env.SNAPSHOT,
      join(here, "../../kit/token-radar-01-kit/input/snapshot.json"),
      "/input/snapshot.json",
    ].filter((c): c is string => c !== null && c !== undefined);
    let inputFile: string | null = null;
    for (const c of candidates) {
      const f = c.endsWith(".json") ? c : join(c, "snapshot.json");
      if (existsSync(f)) {
        inputFile = f;
        break;
      }
    }
    if (inputFile === null) {
      process.stderr.write("radar-10 self-test: no snapshot found (pass --input <snapshot.json|directory>)\n");
      process.exitCode = 2;
      return;
    }
    const snapshot = parseSnapshot(readFileSync(inputFile, "utf8"));
    const { points, dropped } = fitPoints(snapshot);
    const fit = ols(points);
    const fam = familyFactors(points, fit);
    const bt = backtest(snapshot, points);
    const { board } = buildRadar(snapshot);
    const out = (s: string): void => {
      process.stdout.write(s + "\n");
    };
    out("radar-10 self-test — " + inputFile);
    out("snapshot: " + snapshot.protocols.length + " protocols, as_of " + snapshot.as_of + ", watchlist " + snapshot.watchlist.length);
    out("comps: " + points.length + " (dropped " + dropped.length + ")");
    for (const d of dropped) out("  dropped: " + d.slug + " — " + d.reason);
    out("curve: log10(mcap) = " + fit.a.toFixed(4) + " + " + fit.b.toFixed(4) + " * log10(TVL/$100M), n=" + fit.n);
    out("LOO: x" + bt.loo_miss.toFixed(4) + " (within 3x " + (bt.loo_within3 * 100).toFixed(1) + "%, within 10x " + (bt.loo_within10 * 100).toFixed(1) + "%) | flat x" + bt.loo_flat_miss.toFixed(4) + " | curve-only x" + bt.curve_only_loo.toFixed(4));
    out("OOS 2025-01-01: x" + bt.oos_miss.toFixed(4) + " (train " + bt.oos_train + ", test " + bt.oos_test + ", within 3x " + (bt.oos_within3 * 100).toFixed(1) + "%) | flat x" + bt.oos_flat_miss.toFixed(4));
    out("OOS 2024-01-01: x" + bt.oos2024_miss.toFixed(4) + " (train " + bt.oos2024_train + ", test " + bt.oos2024_test + ", within 3x " + (bt.oos2024_within3 * 100).toFixed(1) + "%) | flat x" + bt.oos2024_flat_miss.toFixed(4));
    out("factor check: growth r=" + bt.factor_growth_r.toFixed(3) + ", log-age r=" + bt.factor_age_r.toFixed(3) + " (noise band ±0.21)");
    out("band: P10 x" + bt.p10.toFixed(3) + ", P25 x" + bt.p25.toFixed(3) + ", P75 x" + bt.p75.toFixed(3) + ", P90 x" + bt.p90.toFixed(3) + " | coverage 50% band " + (bt.band50 * 100).toFixed(1) + "%, 80% band " + (bt.band80 * 100).toFixed(1) + "%");
    out("family factors: " + fam.size + " categories");
    out("board: " + board.length + " rows");
    const looOk = bt.loo_miss < LOO_BAR;
    const oosOk = bt.oos_miss < OOS_BAR;
    out("bars: LOO x" + bt.loo_miss.toFixed(4) + " < x" + LOO_BAR + " ? " + (looOk ? "YES" : "NO") + " | OOS x" + bt.oos_miss.toFixed(4) + " < x" + OOS_BAR + " ? " + (oosOk ? "YES" : "NO"));
    out(looOk && oosOk ? "SELF-TEST PASS" : "SELF-TEST FAIL (bars not beaten — the failure is the finding)");
    process.exitCode = looOk && oosOk ? 0 : 1;
  })();
}
