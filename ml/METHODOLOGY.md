# How Needle is evaluated

The updated Airbus brief (31 October 2026, 12:45) sets the task: **predict each event's final risk tier, using only messages at least 2 days before closest approach, and report Critical recall with a confusion matrix on a held-out split of train events.**

On a held-out 20% of train events (2,389 events, 167 of them Critical), Needle's shipped rule catches **150 of 167 Critical events** (recall 0.898, 95% interval 0.84 to 0.94). It misses 17 and raises 33 false Critical alarms. A plain persistence baseline (the latest tier 2+ days out) catches 149. The trained model on its own catches 146. The model does not beat persistence; its value is the probability it attaches to each call. ESA's own competition on this dataset found the same: the winner beat the latest-risk baseline only narrowly.

Earlier, we scored per-message tiers on the test rows (0.975 accuracy, 0.992 Critical recall). The update says test has no final outcomes and that reading tiers off `risk` "is not the challenge". Those numbers are kept in [Appendix A](#appendix-a-per-message-tiers-on-test-rows-superseded) for the record; they are not the score.

Every number here comes from [`analysis/event_forecast.py`](analysis/event_forecast.py), [`analysis/evaluation_checks.py`](analysis/evaluation_checks.py) or `needle-ml build`.

## 1. Data and labels

| File | Content |
|---|---|
| `train_data.csv` | 162,634 messages (CDMs) across 13,154 events |
| `test_data.csv` | 24,484 messages across 2,167 events; every message is 2 to 7 days before closest approach; no final outcomes |
| `challenge1_event_labels.xlsx` | One row per train event: final risk, final miss distance and final tier (908 Critical, 2,403 Elevated, 9,843 Safe), plus `usable_for_training` |

- **Labels checked.** The `final_tier` labels agree with our own reading of each event's last message for all 13,154 events.
- **The `risk` floor.** `risk` = -30 (about 41% of messages) stands for a probability too small to compute. We treat it as Pc ≈ 0: it falls below every threshold.
- **Event IDs.** IDs restart in each file. Train and test are never joined on `event_id`.

| Tier | Rule (Pc = 10^risk) |
|---|---|
| Critical | Pc ≥ 1e-4, or miss distance < 1,000 m |
| Elevated | Not Critical, and 1e-6 ≤ Pc < 1e-4 or miss distance 1,000 to 5,000 m |
| Safe | Pc < 1e-6 and miss distance > 5,000 m |

## 2. What is predicted

For each event, the inputs are only its messages with `time_to_tca` ≥ 2 days. The target is `final_tier`, the tier of the event's last message before closest approach.

- **Usable events.** 11,942 of the 13,154 train events have at least one message 2 or more days out. The other 1,212 cannot be predicted under the rule and are left out.
- **Easy events.** In 3,050 usable events, the final message is itself 2 or more days out, so it is part of the input. Section 5 therefore also reports the 8,892 events whose final message falls inside the last 2 days. That harder subset is the fairer measure.

## 3. Inputs

The brief suggests 13 columns and allows others "if explained". The event model builds 23 features from each event's messages 2+ days out:

- **From the latest such message:** `time_to_tca`, `risk`, `max_risk_estimate`, `miss_distance`, `relative_speed`, `relative_position_r/t/n`, `c_sigma_r`, `t_sigma_r`, `F10`, `AP` and object type.
  - `risk` is not on the suggested list. We use it because the final tier is defined by Pc, and the brief allows extra columns when explained. It is the Pc of messages 2 or more days out, never the final message's Pc when that message falls inside the last 2 days.
- **Across those messages:** the message count, the highest `risk`, the smallest miss distance, the slopes of `risk` and miss distance over time, the change in the chaser's radial sigma, and a flag for the -30 placeholder.
- **The latest message's tier as numbers:** its tier, its Pc band and its miss band.

## 4. Methods compared

| Method | Rule |
|---|---|
| Persistence | The final tier equals the tier of the latest message 2+ days out |
| Needle event model | Gradient-boosted classifier (`HistGradientBoostingClassifier`, 300 iterations, learning rate 0.05, balanced class weights) gives P(Safe), P(Elevated) and P(Critical). Two thresholds turn these into a tier. |
| **Shipped: model or persistence** | The model's tier, raised to Critical when the latest message is already Critical. The probabilities come from the model. |

## 5. Evaluation protocol and results

1. **Split.** Usable train events are split 80/20 by event, stratified by final tier (seed 42). No event has messages in both parts.
2. **Thresholds.** These are set by 5-fold cross-validation inside the 80% only, keeping the pair with the best macro F1. The model calls Critical when P(Critical) ≥ 0.65. Otherwise it calls Elevated when P(Elevated or Critical) ≥ 0.45.
3. **Final fit.** The model is fitted on the whole 80%.
4. **Scoring.** The 20% is scored once.

**All held-out events (2,389; 167 Critical):**

| Method | Accuracy | Macro F1 | Critical recall | Critical precision | Caught | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Persistence | 0.947 | 0.904 | 0.892 (0.84 to 0.93) | 0.856 | 149 | 18 | 25 |
| Needle event model | 0.948 | 0.901 | 0.874 (0.82 to 0.92) | 0.854 | 146 | 21 | 25 |
| **Shipped: model or persistence** | **0.947** | **0.898** | **0.898 (0.84 to 0.94)** | **0.820** | **150** | **17** | **33** |

**Harder subset, final message inside the last 2 days (1,781; 116 Critical):**

| Method | Accuracy | Macro F1 | Critical recall | Critical precision | Caught | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Persistence | 0.929 | 0.870 | 0.845 (0.77 to 0.90) | 0.797 | 98 | 18 | 25 |
| Needle event model | 0.933 | 0.875 | 0.828 (0.75 to 0.89) | 0.814 | 96 | 20 | 22 |
| **Shipped** | **0.931** | **0.869** | **0.853 (0.78 to 0.91)** | **0.767** | **99** | **17** | **30** |

Confusion matrix of the shipped rule on all held-out events (rows are truth, columns are prediction):

| | Safe | Elevated | Critical |
|---|---|---|---|
| **Safe** (1,790) | 1,737 | 48 | 5 |
| **Elevated** (432) | 29 | 375 | 28 |
| **Critical** (167) | 1 | 16 | 150 |

Ranges are 95% Wilson intervals.

**What the numbers mean:**

- About 9 in 10 events that end Critical are already flagged 2 days out.
- Of the 17 misses, 16 are called Elevated, so they stay on the watch list rather than being cleared.
- All 18 events that persistence misses turn Critical because their final miss distance drops under 1 km; none turns Critical through Pc. A model given only messages 2 or more days out cannot see that last drop coming.

## 6. Test-set predictions (demo)

`artifacts/test_event_predictions.csv` gives one row per test event (2,167), using the shipped rule fitted on all usable train events. Each row has:

- the latest tier
- P(Safe), P(Elevated) and P(Critical)
- the model's tier
- the shipped `pred_final_tier`

The rule flags 190 Critical, 507 Elevated and 1,470 Safe. Test has no final outcomes, so these predictions are for the demo and cannot be scored.

## 7. Checks against leakage

| Check | Result |
|---|---|
| Messages from one event in both the 80% and the 20% | None; the split is by event |
| Thresholds or features tuned on the 20% | No; cross-validation inside the 80% only |
| Final-message values used as inputs when the final message is under 2 days out | No; only messages with `time_to_tca` ≥ 2 enter the features |
| Train and test joined on `event_id` | Never |
| Test messages that match a train message on physical values | 0 of 24,484 |
| Labels match the last message of each train event | 13,154 of 13,154 |

## 8. Next-day warnings

The brief's 24-hour view uses `time_to_tca` windows, for example closest approach within the next day. For every training event with messages on both sides of the 24 h mark, we forecast the final tier from the latest message at least 24 h out (persistence) and compare it with the final message:

| Target | Correct alarms | False alarms | Missed | Precision | Recall |
|---|---|---|---|---|---|
| Critical tier (8,898 events) | 531 | 66 | 55 | 0.89 (0.86 to 0.91) | 0.91 (0.88 to 0.93) |
| Pc ≥ 1e-4 only | 4 | 14 | 3 | 0.22 (0.09 to 0.45) | 0.57 (0.25 to 0.84) |

A day out, the Critical tier holds about 90% of the time. Pc ≥ 1e-4 on its own does not: it is rare and it swings. In the training histories, 141 of the 154 events that reached it fell back below it by their last message.

## 9. Forecast range and robust burns

The console forecasts each open event's final miss distance from its latest message, at every message, not only 2 days out. The data has no message more than 7 days before closest approach, so forecasts start about 7 days out. They narrow as closest approach nears.

- **Table.** For train events outside the replay (12,649 events), take each event's latest message in every lead-time bin (under 1, 1 to 2, 2 to 3, 3 to 5, and over 5 days). Compare its miss with the final miss. Each cell, split by lead bin and current miss (under 1, 1 to 2, 2 to 5, over 5 km), stores:
  - the 10th, 50th and 90th percentiles of final miss divided by current miss
  - the share of events that end under 1 km
  - the share that end Critical
- **Calibration.** Fitted on 80% of those events, the 10th to 90th band covers **79.9%** of final outcomes on the other 20% (2,529 events). Each lead bin falls between 78.8% and 80.5%.
- **What it shows.** For an event 1 to 2 km out:
  - **2 to 3 days out:** the final miss lands between 0.68× and 1.79× the current miss, and 15% end under 1 km.
  - **More than 5 days out:** the band is 0.53× to 6.6×, and 22% end under 1 km.
  - **Under a day out:** it narrows to 0.97× to 1.04×.
- **Robust burn (`coa4`).** The recommended burn targets a nominal post-burn miss of 1 km divided by the 10th-percentile shrink for the planning lead time, so the pessimistic outcome still clears 1 km. That is 1.02 km under a day out, 1.33 km at 2 to 3 days and 1.89 km beyond 5 days.
  - In the replay, the minimum-Δv burn already meets this target in 86 of 118 escalation messages, because pushing Pc below 1e-4 usually opens the miss well past 1 km.
  - Where it does not, the robust burn costs 0.37 mm/s more on average, and 4.5 mm/s at most.

**Collision probability forecast.** Before closest approach, Pc behaves in one of two ways: it mostly stays at or below today's value, or it collapses to the -30 floor as tracking improves. A band would span about 25 orders of magnitude. So for each current-Pc bin and lead bin, the console shows three things:

- **A ceiling:** the 90th percentile of the final Pc relative to today's.
- **The chance it falls to about zero.**
- **The chance it ends at or above 1e-4.**

On held-out events, the final Pc stayed under the ceiling 89.9% of the time (4,355 samples). The predicted chance of falling to the floor averaged 75.5%, against 76.0% observed. For events now at Pc ≥ 1e-4:

- **Ceiling:** 9 in 10 end at least about 0.5 orders of magnitude lower.
- **Collapse:** 51 to 64% fall to about zero.
- **Still high:** only about 10% are still at or above 1e-4 at closest approach.

## 10. Physics model checks (not part of the scores)

The console's Pc and burn planner use the full CDM: relative state, both covariances and object sizes. The UI labels them as the physics model.

- On the 23 test events at Pc ≥ 1e-4, the model reproduces ESA's `risk` within 0.02 orders of magnitude for 20 events (median absolute error 0.003).
- Its Clohessy-Wiltshire burn response matches two-body propagation.
- For event 891, it plans 7.0 mm/s retrograde, which gives a 1,056 m miss and Pc 9.1e-5.

## 11. Limitations

- **One split.** The intervals cover sampling noise in the 20%, not variation across different splits.
- **Critical is rare.** 167 held-out events; one more catch moves recall by 0.6 points.
- **The model ties the baseline.** We report that plainly. The model's contribution is calibrated probabilities, not more catches.
- **The operating point is a choice.** The thresholds maximise macro F1. A deployment that weights misses more heavily would lower the Critical threshold and accept more false alarms.

## 12. Reproduce

From `ml/`, with the ESA CSVs and `challenge1_event_labels.xlsx` in `NEEDLE_DATA_DIR`:

```sh
uv run --with openpyxl python analysis/event_forecast.py --write   # sections 2 to 6; writes the test-event predictions and event_metrics.json
uv run python analysis/evaluation_checks.py                        # sections 7 and 8, and Appendix A
uv run needle-ml build && uv run pytest                            # artifacts and tests
```

## Appendix A: per-message tiers on test rows (superseded)

Before the update, we read the brief as per-message classification of `test_data` rows. A classifier using only the 13 suggested columns (never `risk`) predicted each message's Pc band. That band was combined with the message's own miss band. Settings were chosen by event-grouped cross-validation on train, and test labels, computed from each row's own `risk`, were read once.

| Method on 24,484 test messages | Accuracy | Critical recall | Critical precision |
|---|---|---|---|
| Miss-distance rule only | 0.954 | 0.959 | 1.000 |
| Classifier + miss | 0.975 | 0.992 (2,210 of 2,227) | 0.990 |

Most of that recall is the distance rule. 2,136 of the 2,227 Critical messages are under 1 km, and miss distance is an input. On the 91 messages that are Critical only through Pc, the classifier caught 74. These numbers remain in `artifacts/metrics.json` and `test_predictions.csv` for reference. Under the updated brief, they are not the task's score.
