import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix, fbeta_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, GroupKFold

S = sys.argv[1]
tr = pd.read_parquet(f"{S}/data/train.parquet")
te = pd.read_parquet(f"{S}/data/test.parquet")
TIERS = ["Safe", "Elevated", "Critical"]


def pc_band(risk):
    return np.where(risk >= -4, 2, np.where(risk >= -6, 1, 0))


def miss_band(miss):
    return np.where(miss < 1000, 2, np.where(miss <= 5000, 1, 0))


def features(df):
    x = pd.DataFrame(index=df.index)
    for c in ["time_to_tca", "miss_distance", "relative_speed", "relative_position_r",
              "relative_position_t", "relative_position_n", "c_sigma_r", "t_sigma_r",
              "max_risk_estimate", "F10", "AP"]:
        x[c] = df[c]
    x["obj"] = df.c_object_type.astype("category").cat.codes
    sig = np.sqrt(df.c_sigma_r ** 2 + df.t_sigma_r ** 2)
    x["sig_comb_r"] = sig
    x["r_over_sig"] = df.relative_position_r.abs() / sig
    x["log_miss"] = np.log10(df.miss_distance.clip(lower=1))
    # isotropic Gaussian proxy with a 10 m hard-body radius, log10
    x["log_pc_proxy"] = np.log10(100 / (2 * sig ** 2)) - (df.miss_distance ** 2 / (2 * sig ** 2)) / np.log(10)
    return x


def report_rows(name, y_true_tier, y_pred_tier, pc_true, pc_pred):
    yt = pd.Series(y_true_tier)
    yp = pd.Series(y_pred_tier)
    acc = (yt == yp).mean()
    rec = {t: round(((yt == t) & (yp == t)).sum() / max((yt == t).sum(), 1), 3) for t in TIERS}
    prec = {t: round(((yt == t) & (yp == t)).sum() / max((yp == t).sum(), 1), 3) for t in TIERS}
    hard = pc_true > miss_band_arr  # rows whose tier is raised by Pc, not miss distance
    hard_ok = (yt[hard] == yp[hard]).mean()
    print(f"{name}: accuracy {acc:.4f} | recall {rec} | precision {prec} | Pc-raised rows {int(hard.sum())}, correct {hard_ok:.3f}")


# Per-row nowcast on test (the scored task)
pc_tr = pc_band(tr.risk.values)
pc_te = pc_band(te.risk.values)
miss_band_arr = miss_band(te.miss_distance.values)
true_tier = np.array(TIERS)[np.maximum(pc_te, miss_band_arr)]

rule_tier = np.array(TIERS)[miss_band_arr]
report_rows("Miss-distance rule only", true_tier, rule_tier, pc_te, None)

Xtr, Xte = features(tr), features(te)
clf = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, class_weight="balanced", random_state=0)
clf.fit(Xtr, pc_tr)
pc_hat = clf.predict(Xte)
print("Pc band confusion on test (rows true 0/1/2, cols pred):\n", confusion_matrix(pc_te, pc_hat))
ml_tier = np.array(TIERS)[np.maximum(pc_hat, miss_band_arr)]
report_rows("Miss rule + ML Pc band", true_tier, ml_tier, pc_te, pc_hat)

# Per-event forecast on train (CV): from CDMs >= 2 days, predict final tier == Critical
tr["tier"] = np.array(TIERS)[np.maximum(pc_tr, miss_band(tr.miss_distance.values))]
g = tr.groupby("event_id").time_to_tca
ok = (g.max() >= 2) & (g.min() < 1)
d = tr[tr.event_id.isin(ok[ok].index)]
early = d[d.time_to_tca >= 2].sort_values(["event_id", "time_to_tca"])
final = d.sort_values("time_to_tca").groupby("event_id").first()


def event_features(e):
    e = e.sort_values("time_to_tca", ascending=False)  # oldest first
    last = e.iloc[-1]
    first = e.iloc[0]
    span = max(first.time_to_tca - last.time_to_tca, 1e-3)
    return pd.Series({
        "n_cdm": len(e), "last_tca": last.time_to_tca,
        "last_risk": last.risk, "risk_slope": (last.risk - first.risk) / span, "max_risk": e.risk.max(),
        "last_miss": last.miss_distance, "min_miss": e.miss_distance.min(),
        "miss_slope": (last.miss_distance - first.miss_distance) / span,
        "last_sig_c": last.c_sigma_r, "last_sig_t": last.t_sigma_r,
        "sig_c_ratio": last.c_sigma_r / max(first.c_sigma_r, 1e-6),
        "last_mre": last.max_risk_estimate, "rel_speed": last.relative_speed,
        "last_r": last.relative_position_r, "obj": {"DEBRIS": 0, "UNKNOWN": 1, "PAYLOAD": 2, "ROCKET BODY": 3}.get(last.c_object_type, 4),
        "F10": last.F10, "AP": last.AP,
        "naive_crit": int(last.tier == "Critical"),
    })


E = early.groupby("event_id").apply(event_features)
y = (final.loc[E.index].tier == "Critical").astype(int).values
naive = E.naive_crit.values
print(f"\nForecast events {len(E):,}, final Critical {y.sum()}")
print(f"Naive latest-tier: recall {recall_score(y, naive):.3f} precision {precision_score(y, naive):.3f} F2 {fbeta_score(y, naive, beta=2):.3f}")
oof = np.zeros(len(E))
for trn, val in StratifiedKFold(5, shuffle=True, random_state=0).split(E, y):
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, class_weight="balanced", random_state=0)
    m.fit(E.iloc[trn], y[trn])
    oof[val] = m.predict_proba(E.iloc[val])[:, 1]
for th in [0.3, 0.5, 0.7]:
    p = (oof >= th).astype(int)
    print(f"Model th={th}: recall {recall_score(y, p):.3f} precision {precision_score(y, p):.3f} F2 {fbeta_score(y, p, beta=2):.3f} | alerts {p.sum()}")
missed = (y == 1) & (naive == 0)
fin = final.loc[E.index]
print(f"Naive misses {missed.sum()}: became Critical via miss<1km {int((fin.miss_distance[missed] < 1000).sum())}, via Pc {int((fin.risk[missed] >= -4).sum())}")
print(f"Model (th=0.5) recovers {int(((oof >= 0.5) & missed).sum())} of the naive misses")
