# Needle

Needle is a conjunction triage console for satellite operators. It reads conjunction data messages (CDMs), computes collision probability (Pc), ranks events by the decision they need, and plans a burn when Pc reaches the action threshold.

Built for Autonomous SG 2026 (Acacia Hackathon Society × NUS Product Club), AI and Aerospace track, Airbus Challenge #1: satellite collision avoidance. Data: the ESA Kelvins Collision Avoidance Challenge dataset.

## Risk tiers (from the brief)

| Tier | Rule |
|---|---|
| Safe | Pc < 1e-6 and miss distance > 5 km |
| Elevated | 1e-6 ≤ Pc < 1e-4, or miss distance 1 to 5 km |
| Critical (manoeuvre required) | Pc ≥ 1e-4 (`risk` ≥ -4), or miss distance < 1 km |

## Repository layout

| Folder | Owner segment | What it holds |
|---|---|---|
| [`ml/`](ml/README.md) | ML | Python package `needle_ml`: physics Pc, burn planner, tier classifier, artifact builders, tests |
| [`api/`](api/README.md) | API | FastAPI service that serves the artifacts and computes Pc and burn options on demand |
| [`frontend/`](frontend/README.md) | Frontend | React + TypeScript console: queue, workspace, replay timeline, 24 h warnings, approval modal |
| [`contracts/`](contracts/README.md) | Shared | Data shapes and API endpoints every segment codes against |
| [`artifacts/`](artifacts/) | ML writes, others read | Built JSON and CSV outputs (fleet, replay, test predictions, metrics) |
| [`data/`](data/README.md) | Nobody commits here | Local copy of the ESA CSVs (git-ignored) |

Segments talk only through `contracts/` and `artifacts/`. A change to a contract needs its own pull request.

## Current results

Per-row tier predictions for `test_data` (24,484 rows), using only the columns the brief allows. The thresholds were chosen by event-grouped cross-validation on train. Test labels were used once, for scoring.

| Method | Row accuracy | Macro F1 | Critical recall | Critical precision |
|---|---|---|---|---|
| Miss-distance rule only | 0.954 | 0.952 | 0.959 | 1.000 |
| `max_risk_estimate` band + miss | 0.808 | 0.842 | 1.000 | 0.928 |
| Needle classifier + miss | 0.971 | 0.972 | 0.993 | 0.988 |

File: [`artifacts/test_predictions.csv`](artifacts/test_predictions.csv). Script: [`ml/legacy/predict.py`](ml/legacy/predict.py).

The physics Pc model (encounter plane, full covariance, object sizes) reproduces ESA's own Pc within 0.02 orders of magnitude for 20 of the 23 Pc-confirmed test events. It needs more columns than the brief's simplified list, so the scored predictions do not use it.

## Status

Scaffold. The ML, API and frontend segments are being built in parallel on their own branches. See each folder's README for its brief and definition of done.
