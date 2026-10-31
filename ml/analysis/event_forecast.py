"""The updated brief's task: predict each event's final tier from messages 2+ days out.

Target: final_tier from challenge1_event_labels.xlsx (the last message before closest approach).
Inputs: only messages with time_to_tca >= 2 days. Evaluation: an 80/20 split of train events,
stratified by final tier; no event has messages in both parts. Settings are chosen by 5-fold
cross-validation inside the 80%; the 20% is scored once. Test events get demo predictions.

Run from ml/:
  NEEDLE_DATA_DIR=/path/to/csvs uv run --with openpyxl python analysis/event_forecast.py [--write]
--write saves artifacts/test_event_predictions.csv and artifacts/event_metrics.json.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold, train_test_split

from needle_ml import data
from needle_ml.tiers import TIERS, miss_band, pc_band, tier_code

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
SUBMISSION = Path(__file__).resolve().parents[2] / "submission"
LABELS_FILE = "challenge1_event_labels.xlsx"
COLS = ["event_id", "time_to_tca", "risk", "max_risk_estimate", "miss_distance", "relative_speed",
        "relative_position_r", "relative_position_t", "relative_position_n", "c_object_type",
        "c_sigma_r", "t_sigma_r", "F10", "AP"]
OBJ = {"DEBRIS": 0, "UNKNOWN": 1, "PAYLOAD": 2, "ROCKET BODY": 3}
SEED = 42
GRID = tuple(round(0.05 * i, 2) for i in range(2, 20))  # 0.10 to 0.95


def event_features(df):
    """One row per event from its messages with time_to_tca >= 2 days."""
    d = df[df.time_to_tca >= 2].sort_values(["event_id", "time_to_tca"], ascending=[True, False])
    g = d.groupby("event_id")
    last, first = g.last(), g.first()
    span = (first.time_to_tca - last.time_to_tca).clip(lower=1e-3)
    x = pd.DataFrame(index=last.index)
    for c in ["time_to_tca", "risk", "max_risk_estimate", "miss_distance", "relative_speed", "relative_position_r",
              "relative_position_t", "relative_position_n", "c_sigma_r", "t_sigma_r", "F10", "AP"]:
        x[f"last_{c}"] = last[c]
    x["obj"] = last.c_object_type.map(OBJ).fillna(4)
    x["n_msgs"] = g.size()
    x["max_risk"] = g.risk.max()
    x["min_miss"] = g.miss_distance.min()
    x["risk_slope"] = (last.risk - first.risk) / span
    x["miss_slope"] = (last.miss_distance - first.miss_distance) / span
    x["sigma_ratio"] = last.c_sigma_r / first.c_sigma_r.clip(lower=1e-6)
    x["risk_is_floor"] = (last.risk <= -30).astype(int)
    x["last_tier"] = tier_code(last.risk.values, last.miss_distance.values)
    x["last_pc_band"] = pc_band(last.risk.values)
    x["last_miss_band"] = miss_band(last.miss_distance.values)
    return x


def decide(p, tc, te):
    """Critical if P(Critical) >= tc; else Elevated if P(Elevated or Critical) >= te; else Safe."""
    return np.where(p[:, 2] >= tc, 2, np.where(p[:, 1] + p[:, 2] >= te, 1, 0))


def model(seed):
    return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, class_weight="balanced", random_state=seed)


def score(y, yp):
    crit = y == 2
    conf = pd.crosstab(pd.Series(y), pd.Series(yp)).reindex(index=range(3), columns=range(3), fill_value=0)
    return {"events": int(len(y)), "accuracy": round(float((y == yp).mean()), 4),
            "macroF1": round(float(f1_score(y, yp, average="macro")), 4),
            "criticalRecall": round(float((yp[crit] == 2).mean()), 4),
            "criticalPrecision": round(float((y[yp == 2] == 2).mean()), 4) if (yp == 2).any() else None,
            "criticalCaught": int((crit & (yp == 2)).sum()), "criticalMissed": int((crit & (yp != 2)).sum()),
            "falseCriticalAlarms": int((~crit & (yp == 2)).sum()), "confusion": conf.values.tolist()}


def show(name, s):
    print(f"  {name:<34} events {s['events']:>5} | acc {s['accuracy']:.3f} | macro F1 {s['macroF1']:.3f} | "
          f"Critical recall {s['criticalRecall']:.3f} precision {s['criticalPrecision']} | "
          f"caught {s['criticalCaught']} missed {s['criticalMissed']} false alarms {s['falseCriticalAlarms']}")
    print(f"  {'':<34} confusion (rows true Safe/Elevated/Critical, cols predicted): {s['confusion']}")


def main(write=False):
    src = data.data_dir()
    tr = data.load(src, "train", COLS)
    te = data.load(src, "test", COLS)
    lab = pd.read_excel(src / LABELS_FILE, sheet_name="train_event_labels", header=2).set_index("event_id")

    # the labels must match the last message of each train event
    last_all = tr.sort_values("time_to_tca").groupby("event_id").first()
    mine = pd.Series(TIERS[tier_code(last_all.risk.values, last_all.miss_distance.values)], index=last_all.index)
    agree = (mine.reindex(lab.index) == lab.final_tier).mean()
    print(f"labels: {len(lab):,} events {lab.final_tier.value_counts().to_dict()}; agree with last message: {agree:.4f}")

    x_all = event_features(tr)
    usable = x_all.index.intersection(lab.index[lab.usable_for_training == "yes"])
    x = x_all.loc[usable]
    y = lab.loc[usable, "final_tier"].map({t: i for i, t in enumerate(TIERS)}).values
    final_late = (lab.loc[usable, "final_time_to_tca_days"] < 2).values
    print(f"usable events (a message 2+ days out): {len(usable):,}; of these, final message under 2 days out: {final_late.sum():,}")

    idx = np.arange(len(x))
    a, b = train_test_split(idx, test_size=0.2, stratify=y, random_state=SEED)
    xa, ya, xb, yb = x.iloc[a], y[a], x.iloc[b], y[b]

    oof = np.zeros((len(a), 3))
    for k, (i, j) in enumerate(StratifiedKFold(5, shuffle=True, random_state=SEED).split(xa, ya)):
        oof[j] = model(k).fit(xa.iloc[i], ya[i]).predict_proba(xa.iloc[j])
    best = max(((f1_score(ya, decide(oof, tc, t1), average="macro"), tc, t1) for tc in GRID for t1 in GRID))
    _, tc, t1 = best
    print(f"thresholds from 5-fold CV inside the 80%: Critical at P >= {tc}, Elevated at P >= {t1} (CV macro F1 {best[0]:.4f})")

    clf = model(0).fit(xa, ya)
    pb = clf.predict_proba(xb)
    ypb = decide(pb, tc, t1)
    persist = xb.last_tier.values

    print("\nheld-out 20% of train events (scored once):")
    results = {"all": {}, "finalUnder2Days": {}}
    for subset, mask in [("all", np.ones(len(b), bool)), ("finalUnder2Days", final_late[b])]:
        print(f" subset: {subset}")
        for name, pred in [("Persistence (latest tier 2+ days out)", persist), ("Needle event model", ypb),
                           ("Model OR persistence for Critical", np.where((ypb == 2) | (persist == 2), 2, ypb))]:
            s = score(yb[mask], pred[mask])
            results[subset][name] = s
            show(name, s)

    if write:
        full = model(0).fit(x, y)
        xt = event_features(te)
        pt = full.predict_proba(xt)
        # shipped rule: the model's tier, raised to Critical when the latest message is already Critical
        dt = decide(pt, tc, t1)
        shipped = np.where((dt == 2) | (xt.last_tier.values == 2), 2, dt)
        out = pd.DataFrame({"event_id": xt.index, "messages": xt.n_msgs.values,
                            "latest_time_to_tca_days": xt.last_time_to_tca.round(3).values,
                            "latest_tier": TIERS[xt.last_tier.values],
                            "p_safe": pt[:, 0].round(4), "p_elevated": pt[:, 1].round(4), "p_critical": pt[:, 2].round(4),
                            "model_tier": TIERS[dt], "pred_final_tier": TIERS[shipped]})
        out.to_csv(ARTIFACTS / "test_event_predictions.csv", index=False)

        # judge files: the same test predictions, a per-row view, and the held-out events with their labels
        SUBMISSION.mkdir(exist_ok=True)
        out.to_csv(SUBMISSION / "test_event_predictions.csv", index=False)
        rows = te[["event_id", "time_to_tca"]].reset_index(drop=True)
        rows.insert(0, "row", np.arange(len(rows)))
        rows = rows.merge(out[["event_id", "pred_final_tier", "p_safe", "p_elevated", "p_critical"]], on="event_id",
                          how="left", validate="many_to_one")
        rows.to_csv(SUBMISSION / "test_row_predictions.csv", index=False)
        shipped_b = np.where((ypb == 2) | (persist == 2), 2, ypb)
        heldout = pd.DataFrame({"event_id": xb.index, "final_tier": TIERS[yb], "final_message_under_2_days": final_late[b],
                                "persistence_tier": TIERS[persist], "model_tier": TIERS[ypb],
                                "pred_final_tier": TIERS[shipped_b], "p_safe": pb[:, 0].round(4),
                                "p_elevated": pb[:, 1].round(4), "p_critical": pb[:, 2].round(4)})
        heldout.sort_values("event_id").to_csv(SUBMISSION / "heldout_event_predictions.csv", index=False)
        print(f"wrote submission/: {len(out):,} test events, {len(rows):,} test rows, {len(heldout):,} held-out train events")
        sgt = timezone(timedelta(hours=8))
        meta = {"generatedAt": datetime.now(sgt).isoformat(timespec="seconds"),
                "task": "predict each event's final tier from messages with time_to_tca >= 2 days",
                "labels": LABELS_FILE, "split": "80/20 of usable train events, stratified by final tier, seed 42",
                "thresholds": {"critical": tc, "elevatedOrAbove": t1, "selectedBy": "macro F1, 5-fold CV inside the 80%"},
                "shippedRule": "Model OR persistence for Critical",
                "usableEvents": int(len(usable)), "heldOut": results,
                "testPredictions": {"events": int(len(out)), "byTier": out.pred_final_tier.value_counts().to_dict()}}
        (ARTIFACTS / "event_metrics.json").write_text(json.dumps(meta, indent=2) + "\n")
        print(f"\nwrote test_event_predictions.csv ({len(out):,} events: {meta['testPredictions']['byTier']}) and event_metrics.json")


if __name__ == "__main__":
    main(write="--write" in sys.argv)
