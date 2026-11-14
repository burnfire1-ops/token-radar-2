// lib/model.ts — Token Radar model (radar-2).
// Reads the frozen DefiLlama snapshot, fits a power law of market cap on TVL
// from the snapshot's own token-bearing protocols, and scores every eligible
// pre-token protocol by implied launch value. No protocol name is special-cased;
// every row goes through the same functions below.

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

export interface PowerLawFit {
  n: number;
  intercept: number;
  slope: number;
  r2: number;
}

export interface RowBreakdown {
  base_value_usd: number;
  cat_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
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
  age_days: number | null;
  implied_value_usd: number;
  base_value_usd: number;
  cat_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  is_watchlist: boolean;
  farm_steps: string[];
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

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// Published precision: the fit and the category factors are rounded to three
// decimals BEFORE any row is scored, and the same rounded values are what
// data.js publishes — so the dashboard's live recomputation uses exactly the
// numbers the board was built from, and the two always agree to the dollar.
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Snapshot parsing and age
// ---------------------------------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error("snapshot must carry protocols[] and watchlist[]");
  }
  return data;
}

// Whole days between the snapshot date and the day DefiLlama first listed the
// protocol. Null when the snapshot carries no listing date.
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const start = Date.parse(listedAt + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

// ---------------------------------------------------------------------------
// The value model
// ---------------------------------------------------------------------------

// Ordinary least squares on log10(market cap) against log10(TVL), over the
// token-bearing protocols that carry a positive market cap. Protocols with a
// zero market cap are dead or illiquid tokens, not comparables, and log(0)
// is undefined, so they are left out.
export function fitPowerLaw(protocols: Protocol[]): PowerLawFit {
  const pts = protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({
      x: Math.log10(p.tvl_usd),
      y: Math.log10(p.mcap_usd as number),
    }));
  const n = pts.length;
  if (n < 10) throw new Error(`too few comparables to fit a power law: ${n}`);
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { n, intercept, slope, r2 };
}

// Per-category multiplier from the median log-residual against the power law.
// Only categories with at least 3 comparables get a factor; a single small
// protocol must never set a whole category's multiple. Clamped to [0.5, 2.0]
// so an outlier-driven category cannot dominate the board.
export function categoryFactors(
  protocols: Protocol[],
  fit: PowerLawFit,
): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (!p.category) continue;
    const predicted = fit.intercept + fit.slope * Math.log10(p.tvl_usd);
    const residual = Math.log10(p.mcap_usd) - predicted;
    const list = byCat.get(p.category) ?? [];
    list.push(residual);
    byCat.set(p.category, list);
  }
  const factors = new Map<string, number>();
  for (const [cat, residuals] of byCat) {
    if (residuals.length < 3) continue;
    factors.set(cat, clamp(10 ** median(residuals), 0.5, 2.0));
  }
  return factors;
}

export function categoryFactor(
  category: string | null,
  factors: Map<string, number>,
): number {
  if (!category) return 1;
  return factors.get(category) ?? 1;
}

// Growth: the 7-day TVL change, clamped to [-50, +100] so one wild week
// (the snapshot's +4,448% outlier) cannot crown a protocol on its own.
// Weighted 0.5, so growth nudges the value instead of driving it.
export function growthMultiplier(change7d: number | null): number {
  const pct = clamp(change7d ?? 0, -50, 100);
  return 1 + (pct / 100) * 0.5;
}

// Maturity: how long the protocol has run. Unknown age counts as one year.
// Capped at 3 years and floored at 0.70, so youth is a small discount, never
// a punishment: a young protocol is also the most likely to launch soon.
export function maturityMultiplier(age: number | null): number {
  const days = age ?? 365;
  return 0.7 + 0.3 * (Math.min(days, 1095) / 1095);
}

// Chain breadth: a small bonus for real distribution, capped at 6+ chains.
export function chainMultiplier(chains: string[]): number {
  const extra = Math.min(Math.max(chains.length - 1, 0), 5);
  return 1 + 0.02 * extra;
}

// The full implied value: power-law base, then the four multipliers, rounded
// to whole dollars and floored at $1 so every row stays a positive integer.
export function impliedValue(
  p: Protocol,
  fit: PowerLawFit,
  factors: Map<string, number>,
  asOf: string,
): { value: number; breakdown: RowBreakdown } {
  const base = 10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
  const cat = categoryFactor(p.category, factors);
  const growth = growthMultiplier(p.change_7d);
  const maturity = maturityMultiplier(ageDays(asOf, p.listed_at));
  const chain = chainMultiplier(p.chains);
  const value = Math.max(1, Math.round(base * cat * growth * maturity * chain));
  return {
    value,
    breakdown: {
      base_value_usd: Math.round(base),
      cat_factor: round2(cat),
      growth_multiplier: round2(growth),
      maturity_multiplier: round2(maturity),
      chain_multiplier: round2(chain),
    },
  };
}

// ---------------------------------------------------------------------------
// Eligibility: which protocols belong on the board
// ---------------------------------------------------------------------------

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

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
];

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

// The watchlist's own exclusion test, applied to any protocol: not a wrapped,
// staked or bridged product of a token that already trades, not a CEX, not a
// versioned name, and not an exchange's own product. A protocol that fails
// this test is a product of an existing token, not a launch waiting to happen.
export function isRankableStrict(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lowered = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((prefix) => lowered.startsWith(prefix))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Farm plans: 7 concrete steps per protocol
// ---------------------------------------------------------------------------

// Capital sized to the protocol, so the plan never asks a reader to risk
// more than the protocol's scale warrants.
export function capitalTier(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

export function gasFor(capital: number): number {
  return capital >= 150 ? 8 : 4;
}

// Younger protocols get a longer hold: their snapshots come more often, so
// a short position is less likely to be counted.
export function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function step2For(p: Protocol, capital: number, chain: string): string {
  const name = p.name;
  const cat = p.category ?? "";
  if (cat === "Risk Curators" || cat === "Onchain Capital Allocator") {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (cat === "RWA") {
    return `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it in the farming wallet.`;
  }
  if (cat === "Lending" || cat === "CDP" || cat === "Collateral Markets") {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (cat === "Dexs") {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (cat === "Basis Trading") {
    return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position open.`;
  }
  if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Liquidity Manager") {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (cat === "Chain") {
    return `Bridge $${capital} of USDC to ${chain} through the chain's official bridge and use the funds in ${name}'s app.`;
  }
  if (cat === "Restaking" || cat === "Staking Pool") {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (cat === "Payments") {
    return `Fund $${capital} and make one payment through ${name} on ${chain}.`;
  }
  if (cat === "Insurance") {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  if (cat === "Prediction Market") {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function step3For(p: Protocol, _capital: number, chain: string): string {
  const name = p.name;
  const cat = p.category ?? "";
  if (cat === "Risk Curators" || cat === "Onchain Capital Allocator") {
    return `Allocate the shares to a second vault or strategy inside ${name} so the wallet shows activity in more than one vault.`;
  }
  if (cat === "RWA") {
    return `Check the asset's yield page weekly and claim or restake the yield inside ${name} rather than moving it out.`;
  }
  if (cat === "Lending" || cat === "CDP" || cat === "Collateral Markets") {
    return `Borrow a small amount (under 30% of the supplied value) against the deposit and repay it within the week, so the wallet shows both sides of the market.`;
  }
  if (cat === "Dexs") {
    return `Stake the LP receipt in ${name}'s own gauge or rewards contract when it offers one, and keep it staked.`;
  }
  if (cat === "Basis Trading") {
    return `Add a second deposit after the first funding round settles, so the wallet shows repeated inflows rather than one deposit.`;
  }
  if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Liquidity Manager") {
    return `Harvest the vault's yield once and redeposit it, so the wallet shows a harvest and a redeposit.`;
  }
  if (cat === "Chain") {
    return `Make one native transaction a week on ${chain} (a swap or a vote) so the wallet is active on the chain itself, not only on the bridge.`;
  }
  if (cat === "Restaking" || cat === "Staking Pool") {
    return `Restake the receipt once inside ${name} when it offers restaking, and keep the restaked position.`;
  }
  return `Repeat the same action once a week in a smaller size so the wallet shows a pattern of use, not a single deposit.`;
}

function weeklyVerb(category: string | null): string {
  switch (category) {
    case "Risk Curators":
    case "Onchain Capital Allocator":
      return "an allocation, a deposit or a vote";
    case "Lending":
    case "CDP":
    case "Collateral Markets":
      return "a supply, a borrow or a repayment";
    case "Dexs":
      return "a swap, a deposit or a vote";
    case "RWA":
      return "a claim, a restake or a mint";
    case "Basis Trading":
      return "a deposit or a rebalance";
    case "Chain":
      return "a swap or a vote";
    case "Restaking":
    case "Staking Pool":
      return "a stake or a restake";
    case "Yield":
    case "Yield Aggregator":
    case "Liquidity Manager":
      return "a deposit, a harvest or a redeposit";
    default:
      return "a deposit, a swap or a vote";
  }
}

// Seven steps, every one ending with what it costs and how long it takes.
// The same generator scores every row; nothing here names a protocol.
export function farmSteps(p: Protocol, asOf: string): string[] {
  const capital = capitalTier(p.tvl_usd);
  const gas = gasFor(capital);
  const chain = p.chains[0] ?? "Ethereum";
  const age = ageDays(asOf, p.listed_at);
  const hold = holdDays(age);
  const raw: string[] = [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${step2For(p, capital, chain)} Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    `${step3For(p, capital, chain)} Cost: about $3 of gas. Time: 10 minutes.`,
    `Make one qualifying action each week, such as ${weeklyVerb(p.category)}. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  // Gate length control: 20–600 chars per step, trimmed.
  return raw.map((s) => {
    const t = s.trim();
    if (t.length > 600) return t.slice(0, 597) + "...";
    if (t.length < 20) return t + " Hold the position and check the protocol's own page.";
    return t;
  });
}

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

export function buildBoard(snapshot: Snapshot): {
  rows: BoardRow[];
  fit: PowerLawFit;
  factors: Map<string, number>;
  live: LiveRow[];
  earlyCount: number;
} {
  const rawFit = fitPowerLaw(snapshot.protocols);
  const fit: PowerLawFit = {
    n: rawFit.n,
    intercept: round3(rawFit.intercept),
    slope: round3(rawFit.slope),
    r2: round3(rawFit.r2),
  };
  const rawFactors = categoryFactors(snapshot.protocols, fit);
  const factors = new Map<string, number>(
    [...rawFactors.entries()].map(([cat, value]) => [cat, round3(value)] as [string, number]),
  );
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  // Seed with the whole watchlist first: coverage is never gambled.
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) chosen.set(slug, p);
  }
  // Then every below-floor protocol that passes the watchlist's own test.
  let earlyCount = 0;
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (p.tvl_usd >= snapshot.floor_usd) continue;
    if (!isRankableStrict(p)) continue;
    chosen.set(p.slug, p);
    earlyCount++;
  }

  const scored: BoardRow[] = [];
  for (const p of chosen.values()) {
    const { value, breakdown } = impliedValue(p, fit, factors, snapshot.as_of);
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      implied_value_usd: value,
      base_value_usd: breakdown.base_value_usd,
      cat_factor: breakdown.cat_factor,
      growth_multiplier: breakdown.growth_multiplier,
      maturity_multiplier: breakdown.maturity_multiplier,
      chain_multiplier: breakdown.chain_multiplier,
      is_watchlist: snapshot.watchlist.includes(p.slug),
      farm_steps: farmSteps(p, snapshot.as_of),
    });
  }
  // Rank by implied value, ties broken by slug so the order is deterministic.
  scored.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Live-token protocols are set aside from the ranking, top 24 by market cap.
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));

  return { rows: scored, fit, factors, live, earlyCount };
}

// ---------------------------------------------------------------------------
// Dashboard payload (data.js) and gate self-check
// ---------------------------------------------------------------------------

export function buildRadar(
  snapshot: Snapshot,
  rows: BoardRow[],
  fit: PowerLawFit,
  factors: Map<string, number>,
  live: LiveRow[],
  earlyCount: number,
): Record<string, unknown> {
  const catFactors: Record<string, number> = {};
  for (const [cat, f] of [...factors.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    catFactors[cat] = round3(f);
  }
  catFactors["default"] = 1.0;
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: "radar-2",
      kind: "power-law",
      fit: {
        n: fit.n,
        intercept: round3(fit.intercept),
        slope: round3(fit.slope),
        r2: round3(fit.r2),
      },
      growth: { weight: 0.5, floor: -50, cap: 100 },
      maturity: { floor: 0.7, range: 0.3, days: 1095, unknown_age_days: 365 },
      chain: { per_extra_chain: 0.02, max_extra: 5 },
      cat_factor_clamp: [0.5, 2.0],
    },
    cat_factors: catFactors,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: earlyCount,
    live_size: live.length,
    rows: rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      base_value_usd: r.base_value_usd,
      cat_factor: r.cat_factor,
      growth_multiplier: r.growth_multiplier,
      maturity_multiplier: r.maturity_multiplier,
      chain_multiplier: r.chain_multiplier,
      is_watchlist: r.is_watchlist,
    })),
    live,
  };
}

export function dataScript(radar: Record<string, unknown>): string {
  return "window.RADAR=" + JSON.stringify(radar) + ";";
}

// The gate self-check: returns every problem found, empty when the board is
// valid. main.ts refuses to write output while any issue is listed.
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string[] {
  const issues: string[] = [];
  if (rows.length < 100 || rows.length > 4000) {
    issues.push(`row count ${rows.length} outside 100-4000`);
  }
  const slugs = new Set<string>();
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  let prev = Infinity;
  rows.forEach((row, i) => {
    if (row.rank !== i + 1) issues.push(`row ${row.slug} has rank ${row.rank}, expected ${i + 1}`);
    if (!bySlug.has(row.slug)) issues.push(`row ${row.slug} is not in the snapshot`);
    if (slugs.has(row.slug)) issues.push(`duplicate slug ${row.slug}`);
    slugs.add(row.slug);
    if (!row.name) issues.push(`row ${row.slug} has an empty name`);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      issues.push(`row ${row.slug} has a bad implied value ${row.implied_value_usd}`);
    }
    if (row.implied_value_usd > prev) {
      issues.push(`implied value rises at rank ${row.rank}`);
    }
    prev = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length !== 7) {
      issues.push(`row ${row.slug} has ${row.farm_steps?.length} farm steps, expected 7`);
    } else {
      for (const step of row.farm_steps) {
        const len = step.trim().length;
        if (len < 20 || len > 600) {
          issues.push(`row ${row.slug} has a farm step of ${len} chars`);
        }
      }
    }
    if (row.base_value_usd < 1 || row.cat_factor < 0.5 || row.cat_factor > 2) {
      issues.push(`row ${row.slug} has a bad model breakdown`);
    }
  });
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) issues.push(`watchlist slug ${slug} is missing from the board`);
  }
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length > 1 && values.size === 1) {
    issues.push("all implied values are identical");
  }
  return issues;
}
