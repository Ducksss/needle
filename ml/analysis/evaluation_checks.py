"""Checks behind ml/METHODOLOGY.md: train/test separation, where the test recall comes from,
and how well a next-day forecast does.

Run from ml/:  NEEDLE_DATA_DIR=/path/to/csvs uv run python analysis/evaluation_checks.py
Reads the CSVs and the committed artifacts; writes nothing.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from needle_ml import data
from needle_ml.classifier import features
from needle_ml.tiers import miss_band, pc_band

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"
PHYS_KEY = ["time_to_tca", "miss_distance", "relative_speed", "relative_position_r", "relative_position_t",
            "relative_position_n", "c_sigma_r", "t_sigma_r"]


def wilson(k, n, z=1.96):
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - h) / d, (c + h) / d


def separation(tr, te):
    print("1. Train/test separation")
    tr_rows = set(map(tuple, tr[PHYS_KEY].round(6).values))
    te_keys = list(map(tuple, te[PHYS_KEY].round(6).values))
    shared = sum(k in tr_rows for k in te_keys)
    print(f"   test rows whose physical values also appear as a train row: {shared} of {len(te):,}")
    cols = list(features(te.head(5)).columns)
    print(f"   model inputs ({len(cols)}): {', '.join(cols)}")
    print(f"   'risk' among model inputs: {'risk' in cols}")
    print(f"   test rows at least 2 days before closest approach: {(te.time_to_tca >= 2).mean():.3f}")


def recall_breakdown(te, pred):
    print("2. Where the test Critical recall comes from")
    mb = miss_band(te.miss_distance.values)
    y = np.maximum(pc_band(te.risk.values), mb)
    yp = pred.pred_tier.map({"Safe": 0, "Elevated": 1, "Critical": 2}).values
    crit, flagged = y == 2, yp == 2
    by_miss = crit & (mb == 2)
    pc_only = crit & (mb < 2)
    print(f"   Critical rows: {crit.sum():,}; under 1 km (miss rule alone catches them): {by_miss.sum():,}; "
          f"Critical only through Pc >= 1e-4: {pc_only.sum()}")
    print(f"   caught: {(crit & flagged).sum():,}; missed: {(crit & ~flagged).sum()}; "
          f"false alarms: {(~crit & flagged).sum()} (truly Elevated {((y == 1) & flagged).sum()}, truly Safe {((y == 0) & flagged).sum()})")
    k, n = int((pc_only & flagged).sum()), int(pc_only.sum())
    lo, hi = wilson(k, n)
    print(f"   Pc-only Critical rows caught: {k} of {n} ({k / n:.3f}, 95% interval {lo:.2f} to {hi:.2f}); "
          f"miss rule alone: 0 of {n}")
    print(f"   miss-distance rule alone: Critical recall {(mb[crit] == 2).mean():.4f}")
    fa_pc = (~crit & flagged)
    print(f"   false alarms by predicted Pc band only (miss >= 1 km): {int((fa_pc & (mb < 2)).sum())} of {int(fa_pc.sum())}")


def day_ahead(tr, replay):
    print("3. Next-day forecast (prediction = latest known tier; truth = tier of the final CDM)")

    def tier(r, m):
        return 2 if (r >= -4 or m < 1000) else 1 if (r >= -6 or m <= 5000) else 0

    def report(name, rows):
        print(f"   {name}: {len(rows):,} forecasts")
        for label, f in [("Critical tier", lambda r, m: tier(r, m) == 2), ("Pc >= 1e-4", lambda r, m: r >= -4)]:
            tp = sum(f(a, b) and f(c, d) for a, b, c, d in rows)
            fp = sum(f(a, b) and not f(c, d) for a, b, c, d in rows)
            fn = sum((not f(a, b)) and f(c, d) for a, b, c, d in rows)
            p_lo, p_hi = wilson(tp, tp + fp)
            r_lo, r_hi = wilson(tp, tp + fn)
            prec = tp / (tp + fp) if tp + fp else float("nan")
            rec = tp / (tp + fn) if tp + fn else float("nan")
            print(f"     {label:<13} correct alarms {tp:>4}, false alarms {fp:>3}, missed {fn:>3}; "
                  f"precision {prec:.2f} ({p_lo:.2f} to {p_hi:.2f}), recall {rec:.2f} ({r_lo:.2f} to {r_hi:.2f})")

    rows = []
    for _, g in tr.groupby("event_id"):
        g = g.sort_values("time_to_tca", ascending=False)
        early, late = g[g.time_to_tca >= 1.0], g[g.time_to_tca < 1.0]
        if len(early) and len(late):
            a, b = early.iloc[-1], g.iloc[-1]
            rows.append((a.risk, a.miss_distance, b.risk, b.miss_distance))
    report("all training events, latest CDM at least 24 h out vs final CDM", rows)

    def latest(e, t):
        ks = [i for i, m in enumerate(e["m"]) if m[0] <= t]
        return ks[-1] if ks else None

    rows = []
    for e in replay["events"]:
        for run in range(replay["runs"]):
            t = run * replay["runH"]
            if t < e["tca"] <= t + 24:
                k = latest(e, t)
                if k is not None:
                    rows.append((e["m"][k][1], e["m"][k][2], e["m"][-1][1], e["m"][-1][2]))
                break
    report("replay, each event at its first next-24 h forecast (high-risk events over-sampled)", rows)


def main():
    src = data.data_dir()
    tr = data.load(src, "train")
    te = data.load(src, "test")
    pred = pd.read_csv(ARTIFACTS / "test_predictions.csv")
    assert len(pred) == len(te) and (pred.event_id.values == te.event_id.values).all()
    replay = json.loads((ARTIFACTS / "replay.json").read_text())
    separation(tr, te)
    recall_breakdown(te, pred)
    day_ahead(tr, replay)


if __name__ == "__main__":
    main()
