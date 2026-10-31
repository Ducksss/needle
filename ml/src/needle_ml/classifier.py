"""Per-row risk tiers for test_data from the brief's allowed columns only.

Label (train and test): tier = max(Pc band from `risk`, miss-distance band). Gradient boosting on
allowed features predicts the Pc band; the tier combines it with the row's own miss band. The Pc-band
thresholds are chosen by event-grouped out-of-fold predictions on train only. Test labels are used
once, for scoring.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold

from .data import ALLOWED
from .tiers import TIERS, miss_band, pc_band

OBJ = {"DEBRIS": 0, "UNKNOWN": 1, "PAYLOAD": 2, "ROCKET BODY": 3}
FOLDS = 5
HGB = {"max_iter": 400, "learning_rate": 0.05}

# Legacy grid; its t1 pick (0.8) sat at the top edge.
LEGACY_GRID = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
WIDE_GRID = tuple(round(0.30 + 0.05 * i, 2) for i in range(14))  # 0.30 to 0.95


def features(df):
    """Model inputs. Reads only the allowed columns, so nothing else can leak in."""
    df = df[list(ALLOWED)]
    x = df[[c for c in ALLOWED if c not in ("event_id", "c_object_type")]].copy()
    x["obj"] = df.c_object_type.map(OBJ).fillna(4)
    sig = np.sqrt(df.c_sigma_r ** 2 + df.t_sigma_r ** 2)
    x["sig_comb_r"] = sig
    x["r_over_sig"] = df.relative_position_r.abs() / sig
    x["log_miss"] = np.log10(df.miss_distance.clip(lower=1))
    # isotropic Gaussian Pc proxy (10 m hard-body radius), log10; a physics prior from allowed columns only
    x["log_pc_proxy"] = np.log10(100 / (2 * sig ** 2)) - (df.miss_distance ** 2 / (2 * sig ** 2)) / np.log(10)
    return x


def new_classifier(seed, **kw):
    return HistGradientBoostingClassifier(**{**HGB, **kw}, class_weight="balanced", random_state=seed)


def new_regressor(seed, **kw):
    return HistGradientBoostingRegressor(**{**HGB, **kw}, random_state=seed)


def out_of_fold(x, band, risk, groups, folds=FOLDS, **kw):
    """Event-grouped out-of-fold Pc-band probabilities and log10 Pc regression on train."""
    oof_p = np.zeros((len(x), 3))
    oof_r = np.zeros(len(x))
    for k, (a, b) in enumerate(GroupKFold(folds).split(x, band, groups)):
        c = new_classifier(k, **kw).fit(x.iloc[a], band[a])
        oof_p[b] = c.predict_proba(x.iloc[b])
        r = new_regressor(k, **kw).fit(x.iloc[a], risk[a])
        oof_r[b] = r.predict(x.iloc[b])
    return oof_p, oof_r


def band_from_proba(p, t1, t2):
    """Pc band from class probabilities: Critical if P(band 2) >= t2, else Elevated if P(band >= 1) >= t1."""
    return np.where(p[:, 2] >= t2, 2, np.where(p[:, 1] + p[:, 2] >= t1, 1, 0))


def select_thresholds(oof_p, y_tier, mband, grid):
    """Grid search (t1, t2) for macro F1 of the combined tier on out-of-fold predictions. First best wins."""
    best, best_cfg = -1.0, None
    for t2 in grid:
        for t1 in grid:
            f = f1_score(y_tier, np.maximum(band_from_proba(oof_p, t1, t2), mband), average="macro")
            if f > best:
                best, best_cfg = f, (t1, t2)
    return best_cfg, best


def score(y_true, y_pred):
    """Row accuracy, macro F1, Critical recall and precision, confusion (rows true, columns predicted)."""
    crit = y_true == 2
    conf = pd.crosstab(pd.Series(y_true), pd.Series(y_pred)).reindex(index=range(3), columns=range(3), fill_value=0)
    return {"accuracy": round(float((y_true == y_pred).mean()), 4),
            "macroF1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
            "criticalRecall": round(float((y_pred[crit] == 2).mean()), 4),
            "criticalPrecision": round(float((y_true[y_pred == 2] == 2).mean()), 4),
            "confusion": conf.values.tolist()}


def reasons(tier, mband):
    return np.where(tier == 0, "Pc below 1e-6 and miss over 5 km",
                    np.where(tier == 2, np.where(mband == 2, "miss under 1 km", "predicted Pc at or above 1e-4"),
                             np.where(mband == 1, "miss 1 to 5 km", "predicted Pc 1e-6 to 1e-4")))


def predictions_frame(te, proba, log_pc, t1, t2):
    """test_predictions.csv rows, in test_data order."""
    mband = miss_band(te.miss_distance.values)
    tier = np.maximum(band_from_proba(proba, t1, t2), mband)
    return pd.DataFrame({"row": np.arange(len(te)), "event_id": te.event_id.values, "time_to_tca": te.time_to_tca.values,
                         "miss_distance_m": te.miss_distance.values, "pred_log10_pc": np.round(np.clip(log_pc, -30, 0), 3),
                         "p_pc_below_1e-6": proba[:, 0].round(4), "p_pc_1e-6_to_1e-4": proba[:, 1].round(4),
                         "p_pc_at_least_1e-4": proba[:, 2].round(4),
                         "pred_tier": TIERS[tier], "reason": reasons(tier, mband)})


GRIDS = {"legacy": LEGACY_GRID, "wide": WIDE_GRID}


def run(tr, te, grid="wide", log=print):
    """Fit, select thresholds on train out-of-fold, predict test, then score test once.

    Both grids are searched and scored; `grid` picks the one that writes test_predictions.csv.
    Returns (predictions DataFrame, metrics dict).
    """
    xtr = features(tr)
    band_tr = pc_band(tr.risk.values)
    mtr = miss_band(tr.miss_distance.values)
    ytr = np.maximum(band_tr, mtr)
    log(f"classifier: out-of-fold on train ({len(tr):,} rows, {tr.event_id.nunique():,} events, {FOLDS} event-grouped folds)")
    oof_p, oof_r = out_of_fold(xtr, band_tr, tr.risk.values, tr.event_id.values)

    selections = {}
    for name, values in GRIDS.items():
        (t1, t2), f = select_thresholds(oof_p, ytr, mtr, values)
        selections[name] = {"grid": list(values), "t1": t1, "t2": t2,
                            "oof": score(ytr, np.maximum(band_from_proba(oof_p, t1, t2), mtr))}
        log(f"classifier: {name} grid picks t1={t1} t2={t2}, out-of-fold macro F1 {f:.4f}")
    oof_methods = [
        {"name": "Miss-distance rule only", **score(ytr, mtr)},
        {"name": "max_risk_estimate band + miss", **score(ytr, np.maximum(pc_band(tr.max_risk_estimate.values), mtr))},
        {"name": "Regression Pc + miss", **score(ytr, np.maximum(pc_band(oof_r), mtr))},
    ]

    log("classifier: final fit on all train")
    clf = new_classifier(0).fit(xtr, band_tr)
    reg = new_regressor(0).fit(xtr, tr.risk.values)
    xte = features(te)
    proba, log_pc = clf.predict_proba(xte), reg.predict(xte)
    chosen = selections[grid]
    preds = predictions_frame(te, proba, log_pc, chosen["t1"], chosen["t2"])

    # test labels are read here, after every choice is fixed
    mte = miss_band(te.miss_distance.values)
    yte = np.maximum(pc_band(te.risk.values), mte)
    methods = [
        {"name": "Miss-distance rule only", **score(yte, mte)},
        {"name": "max_risk_estimate band + miss", **score(yte, np.maximum(pc_band(te.max_risk_estimate.values), mte))},
        {"name": "Regression Pc + miss", **score(yte, np.maximum(pc_band(log_pc), mte))},
    ]
    for name, sel in selections.items():
        label = "Needle classifier + miss" if name == grid else f"Needle classifier + miss ({name} grid, t1={sel['t1']} t2={sel['t2']})"
        methods.append({"name": label, **score(yte, np.maximum(band_from_proba(proba, sel["t1"], sel["t2"]), mte))})
    for m in methods:
        log(f"classifier: test {m['name']}: acc {m['accuracy']} macro F1 {m['macroF1']} "
            f"Critical recall {m['criticalRecall']} precision {m['criticalPrecision']}")

    metrics = {"rows": int(len(te)), "tiers": TIERS.tolist(), "methods": methods,
               "thresholds": {"selectedBy": "macro F1 on event-grouped 5-fold out-of-fold predictions, train only",
                              "grid": grid, "t1": chosen["t1"], "t2": chosen["t2"], "grids": selections},
               "trainOutOfFold": oof_methods}
    return preds, metrics
