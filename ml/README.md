# ML segment: `needle_ml`

Turn the working scripts in `legacy/` into a tested Python package that rebuilds every artifact from the ESA CSVs with one command.

## Scope

- `pyproject.toml` managed with uv, Python ≥ 3.11, package `needle_ml`, console script `needle-ml`.
- Modules (suggested): `data.py` (loading, column lists), `tiers.py` (brief rules and buckets), `physics.py` (encounter-plane Pc, covariance rotation, Clohessy-Wiltshire response, burn search, cost-of-waiting envelope), `classifier.py` (allowed-column tier model), `fleet.py`, `replay.py`, `metrics.py`, `cli.py`.
- `needle-ml build --data $NEEDLE_DATA_DIR --out ../artifacts` writes `fleet.json`, `replay.json`, `test_predictions.csv` and `metrics.json` exactly as `contracts/README.md` describes. Seed every random step so two builds match.
- Public functions for the API, signatures fixed by the contract: `pc_from_cdm(cdm) -> dict` and `plan_burns(cdm, budget_mm_s=10.0) -> dict`.

## Legacy sources

| File | What it does |
|---|---|
| `legacy/coa.py` | Encounter-plane Pc from the full CDM, checks it against ESA `risk`, burn search for the 23 Pc-confirmed test events |
| `legacy/cwcheck.py` | Checks Clohessy-Wiltshire displacement against numerical two-body propagation |
| `legacy/replay.py` | Builds `replay.json`: 280 training histories on a 21-day calendar, burn options per escalation CDM, cost-of-waiting envelope |
| `legacy/fleet.py` | Builds `fleet.json` from the test set |
| `legacy/predict.py` | Allowed-column tier classifier with event-grouped CV; writes `test_predictions.csv` |
| `legacy/model.py` | Earlier experiments, including the 2-day forecast that did not beat the latest-tier baseline |
| others | Data builders for older dashboard boards; port only what the artifacts need |

## Facts the rebuild must reproduce

- Test predictions (classifier + miss): row accuracy 0.971, macro F1 0.972, Critical recall 0.993, Critical precision 0.988. Miss-distance rule only: accuracy 0.954.
- Physics Pc within 0.02 orders of magnitude of ESA `risk` for 20 of the 23 Pc-confirmed test events (latest CDM). The other 3 use a calibrated hard-body radius.
- CW displacement matches two-body propagation (0.00% along-track error in the legacy check). Example: event 891 needs 7.0 mm/s retrograde for a 1,056 m miss and Pc 9.1e-5.
- Replay: 280 events, 24 escalate to Pc ≥ 1e-4, 119 escalation CDMs with burn options, Pc model within 0.1 orders for 106 of them. Median Δv ratio for a 24 h delay is 1.25×.

## Tests (pytest)

- Tier rules at the exact boundaries: 1e-6, 1e-4, 1,000 m and 5,000 m.
- Physics Pc reproduces ESA `risk` within 0.1 orders for at least 18 of the 23 Pc-confirmed test events.
- CW displacement within 1% of two-body propagation for a 7 mm/s burn two days out.
- The classifier's feature columns are a subset of the allowed list in `AGENTS.md`.
- Grouped CV macro F1 of the classifier beats the miss-distance rule.
- `replay.json` and `fleet.json` match the contract shapes.
- Tests that need the CSVs skip cleanly when `NEEDLE_DATA_DIR` is unset.

## Done when

`uv run pytest` passes, `uv run needle-ml build` regenerates all four artifacts with numbers matching the facts above (within rounding), and a pull request to `main` is open with the commands and results in its Validation section.
