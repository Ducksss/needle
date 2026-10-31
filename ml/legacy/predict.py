"""Per-row risk tiers for test_data, using only the columns the Airbus brief allows.

Label (train and test): tier = max(Pc band from `risk`, miss-distance band), per the brief's rules.
Model: gradient boosting on allowed features predicts the Pc band; the tier combines it with the
row's own miss-distance band. Choices are made by event-grouped cross-validation on train only;
test labels are used once, for the final score.
"""
import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold

D, OUT = sys.argv[1], sys.argv[2]
ALLOWED = ["event_id", "time_to_tca", "miss_distance", "relative_speed", "relative_position_r", "relative_position_t",
           "relative_position_n", "c_object_type", "c_sigma_r", "t_sigma_r", "max_risk_estimate", "F10", "AP"]
TIERS = np.array(["Safe", "Elevated", "Critical"])
OBJ = {"DEBRIS": 0, "UNKNOWN": 1, "PAYLOAD": 2, "ROCKET BODY": 3}

tr = pd.read_csv(f"{D}/train_data.csv", usecols=ALLOWED + ["risk"])
te_x = pd.read_csv(f"{D}/test_data.csv", usecols=ALLOWED)


def pc_band(log_pc):
    return np.where(log_pc >= -4, 2, np.where(log_pc >= -6, 1, 0))


def miss_band(miss):
    return np.where(miss < 1000, 2, np.where(miss <= 5000, 1, 0))


def features(df):
    x = df[[c for c in ALLOWED if c not in ("event_id", "c_object_type")]].copy()
    x["obj"] = df.c_object_type.map(OBJ).fillna(4)
    sig = np.sqrt(df.c_sigma_r ** 2 + df.t_sigma_r ** 2)
    x["sig_comb_r"] = sig
    x["r_over_sig"] = df.relative_position_r.abs() / sig
    x["log_miss"] = np.log10(df.miss_distance.clip(lower=1))
    # isotropic Gaussian Pc proxy (10 m hard-body radius), log10; a physics prior from allowed columns only
    x["log_pc_proxy"] = np.log10(100 / (2 * sig ** 2)) - (df.miss_distance ** 2 / (2 * sig ** 2)) / np.log(10)
    return x


def score(name, y_true, y_pred, raised):
    acc = (y_true == y_pred).mean()
    f1 = f1_score(y_true, y_pred, average="macro")
    crit = y_true == 2
    rec_c = (y_pred[crit] == 2).mean()
    prec_c = (y_true[y_pred == 2] == 2).mean()
    rr = (y_true[raised] == y_pred[raised]).mean()
    print(f"  {name:<34} acc {acc:.4f} | macro-F1 {f1:.4f} | Critical recall {rec_c:.4f} precision {prec_c:.4f} | Pc-raised rows right {rr:.3f}")
    return f1


Xtr, ytr_band, mtr = features(tr), pc_band(tr.risk.values), miss_band(tr.miss_distance.values)
ytr = np.maximum(ytr_band, mtr)
raised_tr = ytr_band > mtr
groups = tr.event_id.values

# out-of-fold predictions on train, grouped by event so no event leaks across folds
oof_p = np.zeros((len(tr), 3)); oof_r = np.zeros(len(tr))
for k, (a, b) in enumerate(GroupKFold(5).split(Xtr, ytr_band, groups)):
    c = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, class_weight="balanced", random_state=k)
    c.fit(Xtr.iloc[a], ytr_band[a]); oof_p[b] = c.predict_proba(Xtr.iloc[b])
    r = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, random_state=k)
    r.fit(Xtr.iloc[a], tr.risk.values[a]); oof_r[b] = r.predict(Xtr.iloc[b])

print(f"TRAIN out-of-fold ({len(tr):,} rows, {tr.event_id.nunique():,} events, Pc-raised rows {raised_tr.sum():,})")
score("miss-distance rule only", ytr, mtr, raised_tr)
score("max_risk_estimate band + miss", ytr, np.maximum(pc_band(tr.max_risk_estimate.values), mtr), raised_tr)
score("regression Pc + miss", ytr, np.maximum(pc_band(oof_r), mtr), raised_tr)
score("classifier argmax + miss", ytr, np.maximum(oof_p.argmax(1), mtr), raised_tr)
best, best_cfg = -1, None
for t2 in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
    for t1 in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
        band = np.where(oof_p[:, 2] >= t2, 2, np.where(oof_p[:, 1] + oof_p[:, 2] >= t1, 1, 0))
        f = f1_score(ytr, np.maximum(band, mtr), average="macro")
        if f > best: best, best_cfg = f, (t1, t2)
t1, t2 = best_cfg
band_oof = np.where(oof_p[:, 2] >= t2, 2, np.where(oof_p[:, 1] + oof_p[:, 2] >= t1, 1, 0))
score(f"classifier thresholds {t1}/{t2} + miss", ytr, np.maximum(band_oof, mtr), raised_tr)

# final fit on all train, predict test
clf = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, class_weight="balanced", random_state=0).fit(Xtr, ytr_band)
reg = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, random_state=0).fit(Xtr, tr.risk.values)
Xte = features(te_x)
p = clf.predict_proba(Xte); lp = reg.predict(Xte)
mte = miss_band(te_x.miss_distance.values)
band = np.where(p[:, 2] >= t2, 2, np.where(p[:, 1] + p[:, 2] >= t1, 1, 0))
tier = np.maximum(band, mte)
reason = np.where(tier == 0, "Pc below 1e-6 and miss over 5 km",
          np.where(tier == 2, np.where(mte == 2, "miss under 1 km", "predicted Pc at or above 1e-4"),
                   np.where(mte == 1, "miss 1 to 5 km", "predicted Pc 1e-6 to 1e-4")))
out = pd.DataFrame({"row": np.arange(len(te_x)), "event_id": te_x.event_id, "time_to_tca": te_x.time_to_tca,
                    "miss_distance_m": te_x.miss_distance, "pred_log10_pc": np.round(np.clip(lp, -30, 0), 3),
                    "p_pc_below_1e-6": p[:, 0].round(4), "p_pc_1e-6_to_1e-4": p[:, 1].round(4), "p_pc_at_least_1e-4": p[:, 2].round(4),
                    "pred_tier": TIERS[tier], "reason": reason})
out.to_csv(OUT, index=False)
print(f"\nwrote {OUT}: {len(out):,} rows; tiers {dict(zip(*np.unique(out.pred_tier, return_counts=True)))}; thresholds t1={t1} t2={t2}")

# final score on test labels (used only here)
te_r = pd.read_csv(f"{D}/test_data.csv", usecols=["risk"]).risk.values
yte_band = pc_band(te_r); yte = np.maximum(yte_band, mte); raised_te = yte_band > mte
print(f"TEST ({len(te_x):,} rows, Pc-raised rows {raised_te.sum():,})")
score("miss-distance rule only", yte, mte, raised_te)
score("max_risk_estimate band + miss", yte, np.maximum(pc_band(te_x.max_risk_estimate.values), mte), raised_te)
score("regression Pc + miss", yte, np.maximum(pc_band(lp), mte), raised_te)
score("Needle submission (classifier)", yte, tier, raised_te)
ct = pd.crosstab(pd.Series(TIERS[yte], name="true"), pd.Series(TIERS[tier], name="pred")).reindex(index=TIERS, columns=TIERS, fill_value=0)
print(ct.to_string())
