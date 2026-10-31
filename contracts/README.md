# Contracts

Every segment codes against this file. Change it only in a pull request of its own, and update the example files with it.

## Artifacts

The ML segment writes these files to `artifacts/`. The API serves them. The frontend reads them through the API, or from `frontend/public/data/` in static mode.

### `fleet.json`

```jsonc
{
  "missions": [{
    "mid": 2,              // ESA mission_id
    "label": "ESA-01",     // display label, ESA-01..ESA-19, ordered by risk
    "alt": 785,            // km, from t_j2k_sma
    "inc": 98.6,           // deg
    "evTrain": 1497, "evTest": 316,
    "pc": 6, "hidden": 9, "distance": 28,          // test events by bucket (latest CDM)
    "critical": 34, "elevated": 94, "safe": 188,   // test events by brief tier (latest CDM)
    "topId": 1448, "topRisk": -3.04, "topMiss": 104
  }],
  "dots": [[13, 704, 74.1, 0, 0]],  // [missionIndex, chaserAltKm, chaserIncDeg, code, eventId]; code 0 none, 1 distance, 2 hidden, 3 pc
  "pcEvents": [{ "id": 891, "sat": "ESA-02", "obj": "Debris", "risk": -2.89, "miss": 503, "tca": 2.18, "speed": 14865,
                 "r": 37, "t": -66, "n": -497, "sr": 25.4, "st": 2758.4, "sn": 14.7 }]
}
```

Buckets for a CDM: `pc` when Pc ≥ 1e-4; `hidden` when Pc ≥ 1e-6 but miss > 5 km; `distance` when miss < 1 km and Pc < 1e-4; otherwise `none`.

### `replay.json`

Real ESA training-set CDM histories placed on a simulated 21-day calendar. Message timing within each event is real (relative to closest approach); each event's closest-approach time on the calendar is simulated. High-risk events are over-sampled about 7×, and the UI must say so.

```jsonc
{
  "runs": 64, "runH": 8, "windowH": 504,
  "note": "Real ESA training-set CDM histories; simulated calendar; high-risk events over-sampled",
  "events": [{
    "id": 6341, "sat": "ESA-07", "mi": 6,          // mi = index into fleet.missions
    "obj": "Unknown", "inc": 97.9,                 // chaser object type, chaser inclination (deg)
    "tca": 101.4,                                  // closest approach, hours from replay start
    "m": [[arrivalH, risk, missM]],                // one entry per CDM, oldest first; risk = log10 Pc (floor -30)
    "rtn": [[r, t, n]],                            // relative position per CDM in metres, aligned with "m"
    "coa": {                                       // keyed by CDM index (string) for CDMs with Pc >= 1e-4 and >= 3 h to TCA
      "4": {
        "risk": -3.6, "miss": 334, "tca": 3.21,    // tca in days before closest approach at that CDM
        "relSpeed": 4.1, "crossDeg": 32.0, "altKm": 512,
        "m2": [r1, r2],                            // encounter-plane miss vector, m
        "ell": { "a": 457.0, "b": 39.0, "deg": 12.3 },  // combined 1-sigma ellipse, m and deg
        "hbrEff": 7.2, "pcModelOk": true,          // effective hard-body radius; model within 0.1 orders of ESA Pc
        "robustMissM": 1330,                       // nominal post-burn miss that keeps the forecast 10th percentile >= 1 km
        "wait": [[hoursAfterCdm, dvMmS | null]],   // lowest Δv if the burn happens anywhere in each 6 h window; null = over 80 mm/s
        "opts": [{
          "key": "coa1",                           // coa1 Minimum Δv now (miss > 1 km), coa2 More margin (Pc < 1e-6, miss > 2 km), coa3 Wait 24 h,
                                                   // coa4 Robust, the recommended option (miss > robustMissM); present on most burn-option CDMs
          "feasible": true, "dv": 1.0,             // mm/s
          "alpha": 180, "beta": 0,                 // deg: alpha in-plane from velocity toward radial-out; beta out of plane
          "leadH": 77.0, "pcAfter": 1.3e-5, "missAfter": 1140,
          "dR": 0, "dT": 800, "dN": 0,             // displacement at closest approach, m
          "burnS": 1.0, "propG": 0.46, "dA": -1.9, // burn seconds at 1 N, propellant g, semi-major axis change m
          "m2After": [r1, r2]
        }]
      }
    }
  }]
}
```

Assumed spacecraft: 1,000 kg, 1 N thruster, Isp 220 s.

### `forecast.json`

How far an event's miss distance can still move before closest approach, from train events outside the replay. Written by `needle-ml build`.

```jsonc
{
  "leadEdgesDays": [0, 1, 2, 3, 5, null],      // lead-time bins, days before closest approach
  "missEdgesM": [0, 1000, 2000, 5000, null],    // current-miss bins, metres
  "quantiles": [0.1, 0.5, 0.9],
  "cells": [[{ "n": 495, "ratioQ10": 0.677, "ratioQ50": 1.003, "ratioQ90": 1.792,
               "pUnder1km": 0.154, "pCritical": 0.154, "pooled": false }]],   // cells[leadBin][missBin]
  "robustRatioQ10": [0.976, 0.901, 0.751, 0.636, 0.529],                     // per lead bin, events now 1 to 5 km out
  "pcEdgesLog10": [-6, -4],                                                   // Pc bands: below 1e-6, 1e-6 to 1e-4, at or above 1e-4
  "pCriticalByPc": [[[{ "p": 0.06, "n": 8144, "pooledOver": "lead and miss" }]]], // [pcBand][leadBin][missBin]; p may be null
  "validation": { "heldOutEvents": 2529, "coverage10to90": 0.799, "coverageByLeadBin": { "0": 0.801 } },
  "excludedReplayEvents": 280
}
```

To forecast an event at replay time `T`: take its latest message received by `T`. Its lead is `(tca - arrivalH) / 24` days. Pick the cell by lead bin and miss bin.

- **Predicted final miss:** `miss × ratioQ50`.
- **Lower and upper limits:** `miss × ratioQ10` and `miss × ratioQ90`. About 8 in 10 held-out outcomes fall inside them.
- **Probabilities:** `pUnder1km` from the cell. For the chance of ending Critical, use `pCriticalByPc[pcBand][leadBin][missBin].p`, where `pcBand` comes from the latest message's Pc. Pc changes this a lot: about 6% below 1e-6, and up to 75% at 1e-4 and above. `cells[...].pCritical` ignores Pc; don't show it.

Pc has no band, because it is bimodal: it mostly stays at or below today's value, or collapses to the -30 floor. `pcForecast.cells[pcBin][leadBin]` gives what is useful instead.

- `pcBin`: 0 at the floor; 1 below 1e-10; 2 for 1e-10 to 1e-6; 3 for 1e-6 to 1e-4; 4 at or above 1e-4 (`pcBinEdgesLog10`).
- `ceilingDelta`: the 90th percentile of final minus current log10 Pc. Draw a "ceiling" at current + ceilingDelta: 9 in 10 similar events ended at or below it. It is null at the floor.
- `pFloor`: the chance it ends too small to compute (Pc ≈ 0).
- `pBelow1e6`: the chance it ends below 1e-6.
- `pAtLeast1e4`: the chance it ends at or above 1e-4.
- `n` and `pooledOverLead`: the sample count, and whether it pools across lead times.

Held-out checks are in `validation.pcForecast`.

### `test_event_predictions.csv` (the task's predictions)

One row per test event: the final tier predicted from its messages (all 2+ days out). Written by `ml/analysis/event_forecast.py --write`.

| Column | Meaning |
|---|---|
| `event_id` | test event ID (IDs restart per file; never join with train) |
| `messages`, `latest_time_to_tca_days`, `latest_tier` | the event's messages and its latest tier |
| `p_safe`, `p_elevated`, `p_critical` | model probabilities for the final tier |
| `model_tier` | the model's tier from those probabilities |
| `pred_final_tier` | shipped rule: `model_tier`, raised to Critical when `latest_tier` is Critical |

### `event_metrics.json`

Held-out scores for the final-tier task: `heldOut.all` and `heldOut.finalUnder2Days`, each keyed by method name with `events`, `accuracy`, `macroF1`, `criticalRecall`, `criticalPrecision`, `criticalCaught`, `criticalMissed`, `falseCriticalAlarms` and `confusion` (rows true Safe, Elevated, Critical). Also `thresholds`, `shippedRule`, `split` and `testPredictions`.

### `test_predictions.csv` (superseded per-message scores)

One row per `test_data.csv` row, same order. Kept for reference; the updated brief scores the event-level task above.

| Column | Meaning |
|---|---|
| `row` | 0-based row index in `test_data.csv` |
| `event_id`, `time_to_tca` | copied from the input row |
| `miss_distance_m` | copied from the input row |
| `pred_log10_pc` | regression estimate of log10 Pc (informative only) |
| `p_pc_below_1e-6`, `p_pc_1e-6_to_1e-4`, `p_pc_at_least_1e-4` | classifier probabilities for the Pc band |
| `pred_tier` | `Safe`, `Elevated` or `Critical`: the higher of the predicted Pc band and the row's miss band |
| `reason` | the rule that set the tier |

### `metrics.json`

```jsonc
{
  "generatedAt": "2026-10-31T14:30:00+08:00",
  "test": { "rows": 24484, "methods": [{ "name": "Needle classifier + miss", "accuracy": 0.971, "macroF1": 0.972,
            "criticalRecall": 0.993, "criticalPrecision": 0.988, "confusion": [[...],[...],[...]] }] },
  "physics": { "pcEvents": 23, "within002": 20, "medianAbsErr": 0.01 },
  "replay": { "events": 280, "escalated": 23, "coaMessages": 119, "pcModelWithin01": 106, "medianWaitRatio24h": 1.25 }
}
```

## API

Base path `/api`. JSON unless stated. CORS open for local development.

| Method and path | Returns |
|---|---|
| `GET /api/health` | `{"status": "ok", "artifacts": {"fleet": true, ...}}` |
| `GET /api/fleet` | `fleet.json` |
| `GET /api/replay` | `replay.json` |
| `GET /api/metrics` | `metrics.json` |
| `GET /api/predictions?event_id=&tier=&limit=100&offset=0` | `{"total": n, "rows": [...]}` with the CSV columns |
| `POST /api/pc` | body: one CDM as a JSON object with the ESA column names; returns `{"log10Pc", "missM", "m2", "ell", "hbr", "model": "encounter-plane"}` |
| `POST /api/coa` | body: `{"cdm": {...}, "budgetMmS": 10}`; returns `{"opts": [...], "wait": [...]}` in the `replay.json` shapes |

## ML package interface used by the API

```python
from needle_ml.physics import pc_from_cdm, plan_burns
pc_from_cdm(cdm: dict) -> dict          # keys: log10Pc, missM, m2, ell, hbr, model
plan_burns(cdm: dict, budget_mm_s: float = 10.0) -> dict   # keys: opts, wait
```

`cdm` uses ESA column names: `time_to_tca`, `risk`, `miss_distance`, `relative_position_{r,t,n}`, `relative_velocity_{r,t,n}`, `t_j2k_sma`, `t_span`, `c_span`, `t_sigma_{r,t,n}`, `t_ct_r`, `t_cn_r`, `t_cn_t`, `c_sigma_{r,t,n}`, `c_ct_r`, `c_cn_r`, `c_cn_t`.

## 24 h warnings (computed in the frontend from `replay.json`)

The brief asks: in a 24 hour frame, how many events come within the dangerous distance, plus insights.

- Window: `[T, T + 24 h]` of replay time, where `T = run × runH`.
- In scope: events whose `tca` falls in the window and whose first CDM arrived at or before `T`. Use each event's latest CDM at `T`.
- Counts: passes in window; latest miss < 1 km (dangerous distance); miss 1 to 5 km; Pc ≥ 1e-4; decision deadlines inside the window.
- List: sorted by `tca`, showing time to closest approach, event, satellite, object, miss, Pc, brief tier and Needle queue state.
- Insights: at most three, generated from the counts. Examples: how many sub-1 km passes have Pc below 1e-6; the busiest satellite; the earliest decision deadline.
- Timeline: shade `[T, T + 24 h]` on the replay dock.
