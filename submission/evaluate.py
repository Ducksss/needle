"""Score Needle's final-tier predictions against labels. Needs only pandas.

Usage:
  python evaluate.py heldout_event_predictions.csv
      the file carries its own labels (final_tier), from challenge1_event_labels.xlsx
  python evaluate.py test_event_predictions.csv --labels your_labels.csv
      your labels: a CSV (or .xlsx) with event_id and final_tier columns
  python evaluate.py test_row_predictions.csv --labels your_row_labels.csv --key row
      score row by row; the labels file needs the key column and final_tier

Options:
  --pred-col NAME   prediction column to score (default pred_final_tier; try persistence_tier or model_tier)
"""
import argparse
import sys

import pandas as pd

TIERS = ["Safe", "Elevated", "Critical"]


def load(path, **kw):
    return pd.read_excel(path, **kw) if str(path).endswith((".xlsx", ".xls")) else pd.read_csv(path)


def main():
    ap = argparse.ArgumentParser(description="Score final-tier predictions: confusion matrix, precision and recall per tier.")
    ap.add_argument("predictions")
    ap.add_argument("--labels", help="CSV or XLSX with the key column and final_tier")
    ap.add_argument("--key", default="event_id")
    ap.add_argument("--pred-col", default="pred_final_tier")
    ap.add_argument("--sheet", default="train_event_labels", help="sheet name when --labels is the organisers' .xlsx")
    a = ap.parse_args()

    pred = load(a.predictions)
    if a.labels:
        if a.labels.endswith((".xlsx", ".xls")):
            lab = pd.read_excel(a.labels, sheet_name=a.sheet, header=None)
            head = lab.index[lab.iloc[:, 0].astype(str) == a.key][0]  # the organisers' sheet has a title row first
            lab = pd.read_excel(a.labels, sheet_name=a.sheet, header=head)
        else:
            lab = load(a.labels)
        df = pred.drop(columns=["final_tier"], errors="ignore").merge(lab[[a.key, "final_tier"]], on=a.key, how="inner")
        print(f"matched {len(df):,} of {len(pred):,} predictions to labels on {a.key}")
    else:
        if "final_tier" not in pred:
            sys.exit("no final_tier column: pass --labels")
        df = pred
    y, p = df.final_tier, df[a.pred_col]
    bad = set(y) - set(TIERS) | set(p) - set(TIERS)
    if bad:
        sys.exit(f"unexpected tier names: {sorted(bad)}")

    conf = pd.crosstab(y, p).reindex(index=TIERS, columns=TIERS, fill_value=0)
    print(f"\n{len(df):,} items scored on '{a.pred_col}'. Confusion matrix (rows true, columns predicted):")
    print(conf.to_string())
    print(f"\naccuracy {(y == p).mean():.4f}")
    f1s = []
    for t in TIERS:
        tp = int(conf.loc[t, t]); fp = int(conf[t].sum()) - tp; fn = int(conf.loc[t].sum()) - tp
        prec = tp / (tp + fp) if tp + fp else float("nan")
        rec = tp / (tp + fn) if tp + fn else float("nan")
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        f1s.append(f1)
        print(f"{t:<9} precision {prec:.4f}  recall {rec:.4f}  F1 {f1:.4f}  (caught {tp}, false alarms {fp}, missed {fn})")
    print(f"macro F1 {sum(f1s) / 3:.4f}")


if __name__ == "__main__":
    main()
