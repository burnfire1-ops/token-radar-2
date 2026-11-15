# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's `token-radar-01` bounty ("Build the best token launch radar"). It reads a
sealed snapshot of the protocol universe (DefiLlama, 758 protocols at or above $5M TVL), works out
which ones still record no token and are not a wrapped or staked product of one that trades, and
ranks them by what their launch would be worth — then hands in a web dashboard with the board, a
detail view for each protocol, and the steps to farm it.

## The model (radar-7)

Implied value is a plain power law fitted at runtime from the snapshot's own token-bearing
protocols, with no factors at all: the market pays a shrinking multiple of TVL as protocols get
bigger, and that is the whole model.

```
implied = round( 10^(A + B x log10(tvl)) x discount )
discount = 0.5 when the row is flagged possible_parent, else 1
```

`log10(mcap) = A + B x log10(tvl)` is an OLS fit over the 128 token-bearing protocols with a
market cap above zero (on this snapshot A = 3.025, B = 0.522, R2 = 0.194). The board is 198 rows:
all 40 watchlist protocols plus the 158 pre-token protocols that pass the watchlist's own
exclusion test. The 20 above-floor pre-token protocols not on the watchlist are flagged
possible_parent and discounted x0.5: the snapshot carries no parent data, so their independence
cannot be verified here, and their standalone implied value is halved rather than trusted at
face value. Implied value is a valuation, not a forecast: it does not predict whether or when a
token launches, and "no token on record" is never written as "no token".

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
