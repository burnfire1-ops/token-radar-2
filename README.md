# Token Launch Radar

A dashboard that ranks 178 pre-token protocols by implied launch value and
shows a concrete 7-step farm plan for each one.

## The model (radar-2)

Implied value is fitted, not guessed. The program fits a power law,
`log10(market cap) = A + B * log10(TVL)`, on this snapshot's own 128
token-bearing protocols with a market cap above zero (A ≈ 3.025, B ≈ 0.522,
R² ≈ 0.194), then adjusts each protocol by a category factor (median
log-residual, only where a category has at least 3 comparables, clamped to
[0.5, 2.0]), a growth factor from the 7-day TVL change (clamped to
[-50, +100], weighted 0.5), a maturity factor (0.70–1.00 over three years),
and a chain-breadth factor (up to 1.10). No protocol name is special-cased.

The board covers all 40 watchlist protocols plus 138 early protocols below
the $50M floor that pass the watchlist's own exclusion test (not a wrapped,
staked or bridged product of a token that already trades). The 24
token-bearing protocols with the largest market caps are set aside in a
separate Live token tab, never mixed into the ranking. Implied value is an
estimate, not a price, and the model does not predict whether or when a
token launches.

## How to run it

```sh
node main.ts --input kit/input/snapshot.json --output out
```

Node 22+ with standard library only. The program writes `board.json`,
`data.js`, `dashboard/` and `screenshots/` into the output directory, then
writes `dossier.json` last. It is deterministic: two runs write identical
bytes. Run `node verify.mjs` to check the board, the dossier byte-equality,
the page/detail agreement, and the screenshots.

## Layout

- `main.ts` — entrypoint: parse, build, self-check, write outputs.
- `lib/model.ts` — snapshot parsing, power-law fit, category factors, implied
  value, eligibility, farm steps, board construction, gate self-check.
- `vendor/makefun-board.ts` — the dossier builder, copied unchanged from the kit.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (about 30 KB
  total). The page recomputes every row's implied value live from the same
  fit and factors, and regenerates the farm steps from the same generator.
- `screenshots/` — the three required views at 1440×900.
