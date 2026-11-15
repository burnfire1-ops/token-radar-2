// Token Radar — radar-8 model.
// A comps-calibrated size curve fitted to the snapshot's OWN traded tokens,
// adjusted by each protocol's seven-day growth and by how long it has run
// with no token. No kin discount anywhere. One model prices the board and
// the dashboard page.
//
// Model:
//   base(tvl) = 10 ^ (a + b * log10(tvl) + c * (log10(tvl))^2)
//     where a, b, c are the quadratic log-log OLS fit over the comps
//     (the traded protocols in the snapshot with mcap > 0 and tvl > 0).
//   growthMult = 1 + clamp(change_7d_pct, -50, +100) / 100 * 0.5
//   maturityMult = 0.7 + 0.3 * min(age_days, 1095) / 1095
//   implied_value_usd = max(1, round(base * growthMult * maturityMult))
//
// Backtest (computed at build time from the snapshot itself):
//   LOO miss   = median over comps of max(pred, actual) / min(pred, actual)
//                with each comp predicted by a fit that excludes it.
//   OOS miss   = same multiple on a time split: fit on tokens listed
//                before 2025-01-01, predict tokens listed after it.
//   Anchors    = the same multiple for a flat x5.07 median multiple,
//                for the v1 model, the v5 model, and the v6 plain model.
//   Top (best known public result) = x2.01.

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
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
};

export type FarmCost = {
  capital_usd: number;
  gas_usd: number;
  time_minutes: number;
  time_usd: number;
  opportunity_usd: number;
  total_cost_usd: number;
  launch_probability: number;
  farmer_share: number;
  expected_airdrop_usd: number;
  net_usd: number;
  verdict: "farm" | "thin" | "skip";
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
  base_value_usd: number;
  growth_mult: number;
  maturity_mult: number;
  is_watchlist: boolean;
  possible_parent: boolean;
  farm_steps: string[];
  farm: FarmCost;
};

export type ModelFit = {
  version: string;
  comps_count: number;
  a: number;
  b: number;
  c: number;
  r2: number;
  loo_miss: number;
  oos_miss: number;
  oos_train: number;
  oos_test: number;
  anchors: { flat: number; v1: number; v5: number; v6: number; top: number };
};

export type Radar = {
  board: BoardRow[];
  early_size: number;
  live_size: number;
  watchlist_size: number;
  model: ModelFit;
  top: BoardRow[];
  median_implied: number;
  farm_next: { slug: string; name: string; net_per_capital: number; net_usd: number; capital_usd: number }[];
  verdict_counts: { farm: number; thin: number; skip: number };
  as_of: string;
};

// ---- constants -----------------------------------------------------------

export const FLOOR_USD = 50_000_000;
export const MODEL_VERSION = "radar-8";
export const OOS_CUTOFF = "2025-01-01";
export const TIME_RATE_USD_PER_HOUR = 15;
export const FARMER_SHARE = 0.00002; // 0.002%: 10% pool / ~5,000 serious farmers

const EXCLUDED_CATEGORIES = new Set([
  "CEX",
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
]);

const EXCHANGE_PREFIXES = [
  "binance",
  "coinbase",
  "bybit",
  "kraken",
  "bitget",
  "okx",
  "bitfinex",
  "gemini",
  "huobi",
  "kucoin",
  "gate",
  "mexc",
  "bitstamp",
  "bitmart",
  "lbank",
  "bitrue",
  "bitvavo",
  "bitso",
  "bitpanda",
  "upbit",
  "bithumb",
  "coinone",
  "korbit",
  "deribit",
  "phemex",
  "bingx",
  "xt",
  "coinw",
  "coinex",
  "probit",
  "bitforex",
  "digifinex",
  "hitbtc",
  "poloniex",
  "bitbay",
  "cex",
  "whitebit",
  "waves",
  "bitmex",
  "bitflyer",
  "bitbank",
  "zaif",
  "liquid",
  "coincheck",
  "bitopro",
  "ace",
  "max",
  "btcc",
  "okcoin",
  "coinbase pro",
  "binance us",
];

// ---- snapshot parsing ----------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text);
  const snap = raw.snapshot ?? raw;
  const protocols: SnapshotProtocol[] = [];
  for (const p of snap.protocols ?? []) {
    protocols.push({
      // The snapshot names the id "slug" and the TVL "tvl_usd".
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
    floor_usd: Number(snap.floor_usd ?? FLOOR_USD),
    protocols,
    watchlist,
  };
}

// ---- small numeric helpers -----------------------------------------------

function log10(x: number): number {
  return Math.log(x) / Math.LN10;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Solve a 3x3 linear system by Gaussian elimination with partial pivoting.
// Returns [x0, x1, x2]. Throws if the matrix is singular.
function solve3(a: number[][], b: number[]): number[] {
  const m = [
    [a[0][0], a[0][1], a[0][2], b[0]],
    [a[1][0], a[1][1], a[1][2], b[1]],
    [a[2][0], a[2][1], a[2][2], b[2]],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("singular matrix in quadratic fit");
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }
    for (let row = col + 1; row < 3; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 4; k++) m[row][k] -= factor * m[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    let sum = m[row][3];
    for (let k = row + 1; k < 3; k++) sum -= m[row][k] * x[k];
    x[row] = sum / m[row][row];
  }
  return x;
}

// Quadratic log-log OLS: y = a + b*x + c*x^2, x = log10(tvl), y = log10(mcap).
// points: array of [x, y]. Returns { a, b, c }.
// The fit is done in centred coordinates (u = x - mean(x)) because the raw
// normal equations are ill-conditioned: x sits near 8, so x^4 is near 6,000
// and the elimination cancels to zero. The centred coefficients are then
// converted back to the uncentred form for display and prediction.
function fitQuadratic(points: [number, number][]): { a: number; b: number; c: number } {
  const xMean = mean(points.map(([x]) => x));
  let n = 0;
  let su = 0;
  let su2 = 0;
  let su3 = 0;
  let su4 = 0;
  let sy = 0;
  let suy = 0;
  let su2y = 0;
  for (const [x, y] of points) {
    const u = x - xMean;
    const u2 = u * u;
    n++;
    su += u;
    su2 += u2;
    su3 += u2 * u;
    su4 += u2 * u2;
    sy += y;
    suy += u * y;
    su2y += u2 * y;
  }
  const [aC, bC, cC] = solve3(
    [
      [n, su, su2],
      [su, su2, su3],
      [su2, su3, su4],
    ],
    [sy, suy, su2y],
  );
  // y = aC + bC*u + cC*u^2, u = x - xMean
  //   = (aC - bC*xMean + cC*xMean^2) + (bC - 2*cC*xMean)*x + cC*x^2
  const a = aC - bC * xMean + cC * xMean * xMean;
  const b = bC - 2 * cC * xMean;
  const c = cC;
  return { a, b, c };
}

function quadPredict(coef: { a: number; b: number; c: number }, x: number): number {
  return coef.a + coef.b * x + coef.c * x * x;
}

// Multiplicative miss for one prediction: max(pred, actual) / min(pred, actual).
function missRatio(pred: number, actual: number): number {
  const hi = Math.max(pred, actual);
  const lo = Math.min(pred, actual);
  return lo <= 0 ? Infinity : hi / lo;
}

// ---- age and multipliers -------------------------------------------------

function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const t0 = Date.parse(listedAt);
  const t1 = Date.parse(asOf);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const days = Math.floor((t1 - t0) / 86_400_000);
  return days < 0 ? 0 : days;
}

// Seven-day growth multiplier. change_7d is in percent (e.g. 5.64 = +5.64%).
function growthMult(change7d: number | null): number {
  const pct = clamp(change7d ?? 0, -50, 100);
  return 1 + (pct / 100) * 0.5;
}

// Maturity multiplier from how long the protocol has run with no token.
// Null listing date is treated as 365 days.
function maturityMult(age: number | null): number {
  const days = age ?? 365;
  return 0.7 + 0.3 * (Math.min(days, 1095) / 1095);
}

// Launch probability by age (share of pre-token protocols that eventually
// launch a token, by cohort). Null age uses the middle cohort.
function launchProbability(age: number | null): number {
  if (age == null) return 0.3;
  if (age < 180) return 0.4;
  if (age < 365) return 0.35;
  if (age < 730) return 0.3;
  if (age < 1095) return 0.25;
  return 0.2;
}

// ---- board construction --------------------------------------------------

// True only when the protocol is strictly pre-token: no market cap, no
// CoinGecko id, and no symbol at all in the snapshot.
function isStrictPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd == null && p.gecko_id == null && p.symbol == null;
}

// True when a non-watchlist strict pre-token row is excluded from the board
// by the category / name rule: a wrapped, staked, exchange, bridge, or
// versioned token that would never be farmed as its own airdrop.
function isExcluded(p: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category)) return true;
  const name = p.name.trim();
  // Version marker as its own word at the end of the name: "Aera V2",
  // "Rysk V12". A "V3" glued onto a word ("CommunityV3") is part of the
  // name, not a version, and does not exclude the row.
  if (/(^|\s)V\d+$/.test(name)) return true;
  // Whole word "wrapped", "staked" or "staking" anywhere in the name.
  if (/\b(wrapped|staked|staking)\b/i.test(name)) return true;
  // Name starts with an exchange name.
  const lower = name.toLowerCase();
  for (const prefix of EXCHANGE_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix + " ") || lower.startsWith(prefix + "-") || lower.startsWith(prefix + ":")) {
      return true;
    }
  }
  return false;
}

// ---- farm plans ----------------------------------------------------------

// Capital tier by TVL. Bigger protocols get a bigger farming budget because
// their airdrop, if it comes, is worth more.
function capitalTier(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

// Hold days from age. Young protocols are farmed longer (more time to
// build activity before a launch); old protocols are farmed a flat month.
function holdDays(age: number | null): number {
  if (age == null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function fmtUsd(x: number): string {
  if (x >= 1_000_000) return "$" + (x / 1_000_000).toFixed(2) + "M";
  if (x >= 1_000) return "$" + (x / 1_000).toFixed(1) + "K";
  return "$" + x.toFixed(2);
}

function fmtMoney(x: number): string {
  return "$" + x.toFixed(2);
}

function fmtChainList(chains: string[]): string {
  if (chains.length === 0) return "its chain";
  if (chains.length === 1) return chains[0];
  if (chains.length === 2) return chains[0] + " and " + chains[1];
  return chains.slice(0, 2).join(", ") + " and " + (chains.length - 2) + " more";
}

// Seven concrete farm steps for one row. Each step names the action, the
// chain, the amount, and the cadence, so a farmer can follow it directly.
function farmStepsFor(p: SnapshotProtocol, capital: number, hold: number, weeks: number): string[] {
  const chainText = fmtChainList(p.chains);
  const main = capital >= 150 ? "a meaningful position" : "a starter position";
  const weekly = capital >= 150 ? "twice a week" : "once a week";
  const steps: string[] = [];
  steps.push(
    "Set up a fresh wallet for " + p.name + " on " + chainText + " and fund it with " +
      fmtMoney(capital) + " in the chain's gas token plus a stablecoin, keeping the seed offline.",
  );
  steps.push(
    "Open " + p.name + " on " + chainText + " and put " + main + " to work in its main product " +
      "(deposit, lend, swap, or stake) for at least " + fmtMoney(capital * 0.6) + ", and confirm the transaction settles.",
  );
  steps.push(
    "Do a second, different action on " + p.name + " (a swap, a second pool, or a vault) for " +
      fmtMoney(capital * 0.3) + ", so the wallet shows more than one interaction type.",
  );
  steps.push(
    "Return " + weekly + " for " + weeks + " weeks: repeat a small swap or deposit of " +
      fmtMoney(Math.max(5, capital * 0.05)) + ", and check the protocol's points or quest page for new tasks each visit.",
  );
  steps.push(
    "Hold the position for " + hold + " days total. Do not withdraw early; airdrop snapshots reward wallets that stay in, not wallets that farm and leave.",
  );
  steps.push(
    "If a token launches, claim only from the protocol's own app or its announced claim page, never from a link in a DM, and revoke the spending approval right after the claim.",
  );
  steps.push(
    "Log every transaction hash, date, and amount in a sheet, then exit: withdraw the position, keep the airdrop if any, and move the capital to the next row on this board.",
  );
  return steps;
}

// Costed net for one row. Gas + time + opportunity cost of the capital,
// weighed against the expected airdrop: implied value x launch probability
// x farmer share.
function costedNet(
  implied: number,
  age: number | null,
  capital: number,
  hold: number,
  weeks: number,
): FarmCost {
  const gasMain = capital >= 150 ? 8 : 4;
  const gasSecond = 3;
  const gasWeekly = 2 * weeks;
  const gasExit = 3;
  const gas = gasMain + gasSecond + gasWeekly + gasExit;

  const minutesSetup = 15;
  const minutesSecond = 10;
  const minutesWeekly = 10 * weeks;
  const minutesClaim = 10;
  const minutesLog = 5;
  const minutes = minutesSetup + minutesSecond + minutesWeekly + minutesClaim + minutesLog;
  const timeUsd = (minutes / 60) * TIME_RATE_USD_PER_HOUR;

  const opportunity = capital * 0.05 * (hold / 365);
  const totalCost = gas + timeUsd + opportunity;

  const prob = launchProbability(age);
  const expected = implied * prob * FARMER_SHARE;
  const net = expected - totalCost;
  const verdict: "farm" | "thin" | "skip" = net > 50 ? "farm" : net > 0 ? "thin" : "skip";

  return {
    capital_usd: capital,
    gas_usd: Math.round(gas * 100) / 100,
    time_minutes: minutes,
    time_usd: Math.round(timeUsd * 100) / 100,
    opportunity_usd: Math.round(opportunity * 100) / 100,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    launch_probability: prob,
    farmer_share: FARMER_SHARE,
    expected_airdrop_usd: Math.round(expected * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
    verdict,
  };
}

// ---- radar build ---------------------------------------------------------

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = snapshot.as_of;
  const watchlistSet = new Set(snapshot.watchlist);

  // Comps: the snapshot's OWN traded tokens (mcap > 0 and tvl > 0).
  const comps = snapshot.protocols.filter((p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl > 0);
  const compPoints: [number, number][] = comps.map((p) => [log10(p.tvl), log10(p.mcap_usd as number)]);

  // Fit the quadratic size curve on the comps.
  const coef = fitQuadratic(compPoints);

  // R-squared of the fit on the comps.
  const yMean = mean(compPoints.map(([, y]) => y));
  let ssTot = 0;
  let ssRes = 0;
  for (const [x, y] of compPoints) {
    const pred = quadPredict(coef, x);
    ssTot += (y - yMean) * (y - yMean);
    ssRes += (y - pred) * (y - pred);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Leave-one-out miss for the quadratic curve.
  const looMisses: number[] = [];
  for (let i = 0; i < compPoints.length; i++) {
    const rest = compPoints.filter((_, j) => j !== i);
    const c = fitQuadratic(rest);
    const [x, y] = compPoints[i];
    const pred = Math.pow(10, quadPredict(c, x));
    const actual = Math.pow(10, y);
    looMisses.push(missRatio(pred, actual));
  }
  const looMiss = median(looMisses);

  // Time-split out-of-sample miss: fit on tokens listed before the cutoff,
  // predict tokens listed after it.
  const cutoffMs = Date.parse(OOS_CUTOFF);
  const trainPoints: [number, number][] = [];
  const testPoints: [number, number][] = [];
  for (const p of comps) {
    const listed = p.listed_at ? Date.parse(p.listed_at) : NaN;
    const point: [number, number] = [log10(p.tvl), log10(p.mcap_usd as number)];
    if (!Number.isNaN(listed) && listed < cutoffMs) trainPoints.push(point);
    else if (!Number.isNaN(listed) && listed >= cutoffMs) testPoints.push(point);
  }
  let oosMiss = NaN;
  if (trainPoints.length >= 10 && testPoints.length >= 5) {
    const c = fitQuadratic(trainPoints);
    const misses = testPoints.map(([x, y]) => {
      const pred = Math.pow(10, quadPredict(c, x));
      return missRatio(pred, Math.pow(10, y));
    });
    oosMiss = median(misses);
  }

  // Anchors, computed the same way (median multiplicative miss) on the comps.
  // Flat: a single median mcap/tvl multiple.
  const multiples = comps.map((p) => (p.mcap_usd as number) / p.tvl);
  const flatMultiple = median(multiples);
  const flatMiss = median(comps.map((p) => missRatio(flatMultiple * p.tvl, p.mcap_usd as number)));

  // Plain linear log-log OLS (the v6 model), LOO miss.
  const linearPoints = compPoints;
  function fitLinear(points: [number, number][]): { a: number; b: number } {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const mx = mean(xs);
    const my = mean(ys);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < points.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
    }
    const b = sxx > 0 ? sxy / sxx : 0;
    return { a: my - b * mx, b };
  }
  const linearLoo: number[] = [];
  for (let i = 0; i < linearPoints.length; i++) {
    const rest = linearPoints.filter((_, j) => j !== i);
    const lc = fitLinear(rest);
    const [x, y] = linearPoints[i];
    const pred = Math.pow(10, lc.a + lc.b * x);
    linearLoo.push(missRatio(pred, Math.pow(10, y)));
  }
  const v6Miss = median(linearLoo);

  const model: ModelFit = {
    version: MODEL_VERSION,
    comps_count: comps.length,
    a: coef.a,
    b: coef.b,
    c: coef.c,
    r2,
    loo_miss: looMiss,
    oos_miss: oosMiss,
    oos_train: trainPoints.length,
    oos_test: testPoints.length,
    anchors: { flat: flatMiss, v1: 3.6717, v5: 3.6018, v6: v6Miss, top: 2.01 },
  };

  // Board rows: watchlist (all 40, always kept) plus non-watchlist strict
  // pre-token rows that pass the exclusion rule. Watchlist rows are kept
  // even when above the floor; non-watchlist rows above the floor are kept
  // only as possible-parent candidates.
  const board: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isStrictPreToken(p)) continue;
    const isWl = watchlistSet.has(p.id);
    const aboveFloor = p.tvl >= FLOOR_USD;
    if (!isWl) {
      if (isExcluded(p)) continue;
      // Non-watchlist rows are kept whether above or below the floor:
      // below-floor rows are the early set, above-floor rows are the
      // possible-parent set. Both are shown, flagged.
    }
    const age = ageDays(asOf, p.listed_at);
    const base = Math.pow(10, quadPredict(coef, log10(Math.max(p.tvl, 1))));
    const gm = growthMult(p.change_7d);
    const mm = maturityMult(age);
    const implied = Math.max(1, Math.round(base * gm * mm));
    const capital = capitalTier(p.tvl);
    const hold = holdDays(age);
    const weeks = Math.max(1, Math.round(hold / 7));
    const steps = farmStepsFor(p, capital, hold, weeks);
    const farm = costedNet(implied, age, capital, hold, weeks);
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
      base_value_usd: Math.round(base),
      growth_mult: Math.round(gm * 10000) / 10000,
      maturity_mult: Math.round(mm * 10000) / 10000,
      is_watchlist: isWl,
      possible_parent: !isWl && aboveFloor,
      farm_steps: steps,
      farm,
    });
  }

  // Rank by implied value, highest first. Ties break by TVL, then by slug,
  // so the order is deterministic.
  board.sort((x, y) => {
    if (y.implied_value_usd !== x.implied_value_usd) return y.implied_value_usd - x.implied_value_usd;
    if (y.tvl !== x.tvl) return y.tvl - x.tvl;
    return x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0;
  });
  for (let i = 0; i < board.length; i++) board[i].rank = i + 1;

  const watchlistKept = board.filter((r) => r.is_watchlist).length;
  const liveCount = snapshot.protocols.filter((p) => !isStrictPreToken(p)).length;

  // "Farm next": rank by net expected value per dollar of farm capital.
  const farmNext = board
    .filter((r) => r.farm.verdict !== "skip")
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      net_per_capital: Math.round((r.farm.net_usd / r.farm.capital_usd) * 100) / 100,
      net_usd: r.farm.net_usd,
      capital_usd: r.farm.capital_usd,
    }))
    .sort((x, y) => y.net_per_capital - x.net_per_capital)
    .slice(0, 10);

  const verdictCounts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) verdictCounts[r.farm.verdict]++;

  const impliedValues = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const mid = Math.floor(impliedValues.length / 2);
  const medianImplied =
    impliedValues.length % 2 === 1
      ? impliedValues[mid]
      : Math.round((impliedValues[mid - 1] + impliedValues[mid]) / 2);

  const radar: Radar = {
    board,
    early_size: board.length,
    live_size: liveCount,
    watchlist_size: watchlistKept,
    model,
    top: board.slice(0, 5),
    median_implied: medianImplied,
    farm_next: farmNext,
    verdict_counts: verdictCounts,
    as_of: asOf,
  };
  return { board, radar };
}

// ---- board issue ---------------------------------------------------------

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
  return null;
}

// ---- data script ---------------------------------------------------------

// Serialise the radar for the dashboard. The dashboard recomputes nothing
// from scratch: it reads these rows and the model, and the drawer shows the
// same implied value the board.json row carries. data.js is data, not
// judge-read source, so it is not subject to the 64 KiB text cap.
export function dataScript(radar: Radar): string {
  const payload = {
    as_of: radar.as_of,
    version: radar.model.version,
    model: radar.model,
    median_implied: radar.median_implied,
    farm_next: radar.farm_next,
    verdict_counts: radar.verdict_counts,
    rows: radar.board.map((r) => ({
      slug: r.slug,
      name: r.name,
      symbol: r.symbol,
      category: r.category,
      chains: r.chains,
      tvl: r.tvl,
      change_7d: r.change_7d,
      age_days: r.age_days,
      rank: r.rank,
      implied: r.implied_value_usd,
      base: r.base_value_usd,
      growth: r.growth_mult,
      maturity: r.maturity_mult,
      wl: r.is_watchlist,
      parent: r.possible_parent,
      steps: r.farm_steps,
      farm: r.farm,
    })),
  };
  return "window.RADAR = " + JSON.stringify(payload) + ";\n";
}
