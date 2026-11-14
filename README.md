# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's `token-radar-01` bounty ("Build the best token launch radar"). It reads a
sealed snapshot of the protocol universe (DefiLlama, 758 protocols at or above $5M TVL), works out
which ones still record no token and are not a wrapped or staked product of one that trades, and
ranks them by what their launch would be worth — then hands in a web dashboard with the board, a
detail view for each protocol, and the steps to farm it.

## The model (radar-2)

Implied value is a power law fitted at runtime from the snapshot's own token-bearing protocols,
not a flat multiple: the market pays a shrinking multiple of TVL as protocols get bigger, and a
different multiple by category.

```
implied = round( 10^(A + B x log10(tvl)) x catFactor
  x (1 + clamp(change_7d, -50, 100) / 100 x 0.5)
  x (0.7 + 0.3 x min(age_days, 1095) / 1095)
  x (1 + 0.02 x min(chains - 1, 5)) )
```

`log10(mcap) = A + B x log10(tvl)` is an OLS fit over the 128 token-bearing protocols with a
market cap above zero (on this snapshot A = 3.025, B = 0.522, R2 = 0.194). `catFactor` is the
category's median log-residual against that fit, used only when at least 3 protocols in the
category carry a market cap, and clamped to [0.5, 2.0]; every other category scores 1.0. The board
is 178 rows: all 40 watchlist protocols plus the 138 below-floor pre-token protocols that pass the
watchlist's own exclusion test. The 92 above-floor pre-token protocols not on the watchlist are not
ranked: the ones the snapshot's own rules exclude are wrapped/staked products of tokens that
already trade, and the rest cannot be verified as independent protocols. Implied value is a
valuation, not a forecast: it does not predict whether or when a token launches, and "no token on
record" is never written as "no token".

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
