# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/burnfire1-ops/token-radar-2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/burnfire1-ops/token-radar-2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's `token-radar-01` bounty ("Build the best token launch radar"). It reads a
sealed snapshot of the protocol universe (DefiLlama, 758 protocols at or above $5M TVL), works out
which ones still record no token and are not a wrapped or staked product of one that trades, and
ranks them by what their launch would be worth — then hands in a web dashboard with the board, a
detail view for each protocol, and the steps to farm it.

## The model (radar-8)

Implied value is a size curve fitted at runtime to the snapshot's own traded tokens, adjusted by
each protocol's seven-day growth and by how long it has run with no token. No kin discount
anywhere: a possible_parent row is flagged, not halved.

```
base     = 10^(a + b x log10(tvl) + c x (log10(tvl))^2)   (quadratic log-log OLS, fitted to the comps)
growth   = 1 + clamp(change_7d_pct, -50, +100) / 100 x 0.5
maturity = 0.7 + 0.3 x min(age_days, 1095) / 1095
implied  = max(1, round(base x growth x maturity))
```

The quadratic is fitted over the 128 protocols in the snapshot that already trade (market cap
above zero and TVL above zero). On this snapshot the fit is a = 4.3668, b = 0.1893, c = 0.0204,
R2 = 0.19. Leave-one-out miss x3.38; time-split out-of-sample miss x2.61 (fit on tokens listed
before 2025-01-01, tested on tokens listed after). Anchors on the same measure: a flat median
multiple misses by x5.07, the v1 model by x3.67, the v5 model by x3.60, the v6 plain power law by
x3.40, and the best known public result by x2.01.

The board is 198 rows: all 40 watchlist protocols plus the 158 pre-token protocols that pass the
watchlist's own exclusion test. The 20 above-floor pre-token protocols not on the watchlist are
flagged possible_parent and shown as such; their value is not discounted, because the snapshot
carries no parent data either way and a halving would be an invented number.

Every row carries a 7-step farm plan and a costed net: gas (main action, second action, weekly
actions, exit) plus time at $15/hour plus the opportunity cost of the farm capital at 5% APR,
weighed against the expected airdrop (implied value x launch probability by age x a 0.002%
farmer share). Rows are marked farm (net over $50), thin ($0 to $50), or skip (below $0), and
"Farm next" ranks by net value per dollar of farm capital. Implied value is a valuation, not a
forecast: it does not predict whether or when a token launches, and "no token on record" is never
written as "no token".

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
```

Node 22 or later, standard library only. `main.ts` reads the snapshot, writes `board.json` and
`data.js` to the output directory, copies `dashboard/` and `screenshots/` there, and writes
`dossier.json` last via the vendored `vendor/makefun-board.ts`. Serve the output directory over
HTTP (for example `python3 -m http.server`) and open `dashboard/index.html` to use the dashboard.
The three screenshots in `screenshots/` are the board, a protocol's detail view, and a filtered
view, each 1440x900.

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ej1kkdkc&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
