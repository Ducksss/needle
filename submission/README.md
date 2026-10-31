# Needle submission files

Everything a judge needs to score Needle's predictions with their own scripts.

The task, from the updated Airbus brief: **predict each event's final risk tier using only messages at least 2 days before closest approach.** The test set has no final outcomes, so our scores come from a held-out 20% of train events. Those predictions are included here with their labels, so you can check every number we report.

| File | Rows | What it is |
|---|---|---|
| [`test_event_predictions.csv`](test_event_predictions.csv) | 2,167 | **Our predictions:** one row per test event, with the predicted final tier and probabilities |
| [`test_row_predictions.csv`](test_row_predictions.csv) | 24,484 | The same predictions, one row per `test_data.csv` row, in file order, for row-based scripts |
| [`heldout_event_predictions.csv`](heldout_event_predictions.csv) | 2,389 | Predictions for the held-out train events, with the official `final_tier` label |
| [`test_data.csv`](test_data.csv) | 24,484 | The organisers' test file, unchanged |
| [`evaluate.py`](evaluate.py) | | Reference scorer (pandas only): confusion matrix, precision, recall and F1 per tier |

## Score them

```sh
pip install pandas openpyxl        # openpyxl only for .xlsx labels
python evaluate.py heldout_event_predictions.csv                  # our held-out scores
python evaluate.py heldout_event_predictions.csv --pred-col persistence_tier
python evaluate.py heldout_event_predictions.csv --labels challenge1_event_labels.xlsx
python evaluate.py test_event_predictions.csv --labels your_test_labels.csv   # event_id, final_tier
python evaluate.py test_row_predictions.csv --labels your_row_labels.csv --key row
```

Held-out result for the shipped prediction (`pred_final_tier`), 2,389 events:

| Tier | Precision | Recall | Caught | False alarms | Missed |
|---|---|---|---|---|---|
| Critical (167) | 0.820 | **0.898** | 150 | 33 | 17 |
| Elevated (432) | 0.854 | 0.868 | 375 | 64 | 57 |
| Safe (1,790) | 0.983 | 0.970 | 1,737 | 30 | 53 |

Accuracy 0.947, macro F1 0.898. Persistence alone (`persistence_tier`, the latest tier 2+ days out) catches 149 Critical events with 25 false alarms.

## Columns

**`test_event_predictions.csv`**
- `event_id`: test event ID. IDs restart in each file, so never join test with train on it.
- `messages`, `latest_time_to_tca_days`, `latest_tier`: the event's messages and its latest tier. All test messages are 2+ days out.
- `p_safe`, `p_elevated`, `p_critical`: model probabilities for the final tier.
- `model_tier`: the model's own call.
- `pred_final_tier`: **the shipped prediction**: `model_tier`, raised to Critical when `latest_tier` is already Critical.

**`test_row_predictions.csv`**
- `row`: 0-based row index in `test_data.csv`.
- `event_id`, `time_to_tca`: copied from that row.
- `pred_final_tier` and the probabilities: that row's event-level prediction.

**`heldout_event_predictions.csv`**
- `event_id`: train event ID.
- `final_tier`: the label from `challenge1_event_labels.xlsx`.
- `final_message_under_2_days`: `True` when the final message was not among the inputs, which is the harder subset.
- `persistence_tier`, `model_tier`, `pred_final_tier` and the probabilities.

Tier rules (Pc = 10^risk, miss in metres):
- **Critical:** Pc ≥ 1e-4, or miss < 1,000.
- **Elevated:** not Critical, and 1e-6 ≤ Pc < 1e-4 or miss 1,000 to 5,000.
- **Safe:** otherwise.

`risk` = -30 means Pc ≈ 0.

## How they were made

- **Split:** usable train events (11,942 with a message 2+ days out) are split 80/20 by event, stratified by final tier, with seed 42.
- **Thresholds:** chosen by 5-fold cross-validation inside the 80%. The 20% is scored once.
- **Test predictions:** come from the same rule refitted on all usable train events.
- **Full method:** [`ml/METHODOLOGY.md`](../ml/METHODOLOGY.md).
- **Regenerate:** `cd ml && uv run --with openpyxl python analysis/event_forecast.py --write`

## Data credit

`test_data.csv` is from the ESA Kelvins Collision Avoidance Challenge dataset, by ESA's Advanced Concepts Team and Space Debris Office. It is published on Zenodo (record [4463683](https://zenodo.org/records/4463683)) under the Creative Commons Attribution 4.0 International licence and redistributed here unchanged.

SHA-256: `fc4110e979e7d569cb8aa819d450d29311e799115b2fe5b519b8a18eafa37323`
