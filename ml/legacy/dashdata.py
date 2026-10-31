import json
import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

S = sys.argv[1]
tr = pd.read_parquet(f"{S}/data/train.parquet")
te = pd.read_parquet(f"{S}/data/test.parquet")


def pc_band(r):
    return np.where(r >= -4, 2, np.where(r >= -6, 1, 0))


def features(df):
    x = pd.DataFrame(index=df.index)
    for c in ["time_to_tca", "miss_distance", "relative_speed", "relative_position_r",
              "relative_position_t", "relative_position_n", "c_sigma_r", "t_sigma_r",
              "max_risk_estimate", "F10", "AP"]:
        x[c] = df[c]
    x["obj"] = df.c_object_type.map({"DEBRIS": 0, "UNKNOWN": 1, "PAYLOAD": 2, "ROCKET BODY": 3}).fillna(4)
    sig = np.sqrt(df.c_sigma_r ** 2 + df.t_sigma_r ** 2)
    x["sig_comb_r"] = sig
    x["r_over_sig"] = df.relative_position_r.abs() / sig
    x["log_miss"] = np.log10(df.miss_distance.clip(lower=1))
    x["log_pc_proxy"] = np.log10(100 / (2 * sig ** 2)) - (df.miss_distance ** 2 / (2 * sig ** 2)) / np.log(10)
    return x


clf = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, class_weight="balanced", random_state=0)
clf.fit(features(tr), pc_band(tr.risk.values))

te = te.sort_values(["event_id", "time_to_tca"], ascending=[True, False]).reset_index(drop=True)
proba = clf.predict_proba(features(te))
te["p_crit"] = proba[:, 2]
te["p_elev"] = proba[:, 1] + proba[:, 2]
te["tier"] = np.where((te.risk >= -4) | (te.miss_distance < 1000), "Critical",
                      np.where((te.risk >= -6) | (te.miss_distance <= 5000), "Elevated", "Safe"))

last = te.groupby("event_id").tail(1).set_index("event_id")
prev = te.groupby("event_id").nth(-2).set_index("event_id") if hasattr(te.groupby("event_id").nth(-2), "set_index") else None
prev_tier = te.groupby("event_id").tier.apply(lambda s: s.iloc[-2] if len(s) > 1 else s.iloc[-1])

pc_conf = last[last.risk >= -4]
dist_only = last[(last.miss_distance < 1000) & (last.risk < -4)]
hidden = last[(last.miss_distance > 5000) & (last.risk >= -6)]
print("buckets", len(pc_conf), len(dist_only), len(hidden))

rank = {"Critical": 2, "Elevated": 1, "Safe": 0}


def fmt_pc(r):
    if r <= -30:
        return "<1e-30"
    m, e = 10 ** (r - np.floor(r)), int(np.floor(r))
    m = np.floor(m * 10) / 10  # truncate so a value never displays across a threshold
    return f"{m:.1f}e{e}"


def event_row(eid, bucket):
    e = te[te.event_id == eid]
    l = last.loc[eid]
    pt = prev_tier.loc[eid]
    change = "up" if rank[l.tier] > rank[pt] else ("down" if rank[l.tier] < rank[pt] else "same")
    trig = []
    if l.risk >= -4:
        trig.append("Pc")
    if l.miss_distance < 1000:
        trig.append("Distance")
    if not trig:
        trig.append("Pc" if l.risk >= -6 else "Distance")
    return {
        "id": int(eid), "bucket": bucket, "obj": l.c_object_type.title(),
        "tca": round(float(l.time_to_tca), 2), "miss": round(float(l.miss_distance) / 1000, 2),
        "risk": round(float(l.risk), 2), "pc": fmt_pc(l.risk),
        "pCrit": round(float(l.p_crit), 3), "pElev": round(float(l.p_elev), 3),
        "tier": l.tier, "change": change, "trigger": " + ".join(trig),
        "speed": round(float(l.relative_speed) / 1000, 2),
        "radial": round(float(l.relative_position_r), 0),
        "sigC": round(float(l.c_sigma_r), 0), "sigT": round(float(l.t_sigma_r), 1),
        "n": int(len(e)),
        "series": [[round(float(t), 2), round(float(r), 1), round(float(m) / 1000, 2)]
                   for t, r, m in zip(e.time_to_tca, e.risk, e.miss_distance)],
    }


rows = []
for df, b, n in [(pc_conf.sort_values("risk", ascending=False), "pc", len(pc_conf)),
                 (hidden.sort_values("risk", ascending=False), "hidden", len(hidden)),
                 (dist_only.sort_values("risk", ascending=False), "distance", len(dist_only))]:
    rows += [event_row(eid, b) for eid in df.index[:n]]

# 24 h window: messages issued in the 24 h up to each event's latest message
lt = te.event_id.map(last.time_to_tca)
win = te[te.time_to_tca <= lt + 1.0]
w1 = win[win.miss_distance < 1000]
day = {"messages": int(len(win)), "events": int(win.event_id.nunique()),
       "within1km": int(len(w1)), "within1kmEvents": int(w1.event_id.nunique()),
       "within1kmPc": int((w1.risk >= -4).sum()), "within1kmPcEvents": int(w1[w1.risk >= -4].event_id.nunique())}

# TCA horizon histogram by day
hist = []
for d0 in range(2, 7):
    m = (last.time_to_tca >= d0) & (last.time_to_tca < d0 + 1)
    sub = last[m]
    hist.append({"label": f"{d0}-{d0 + 1} d", "total": int(m.sum()),
                 "pc": int((sub.risk >= -4).sum()),
                 "distance": int(((sub.miss_distance < 1000) & (sub.risk < -4)).sum()),
                 "hidden": int(((sub.miss_distance > 5000) & (sub.risk >= -6)).sum())})

r = dist_only.risk
pcdist = [
    {"label": "below 1e-10", "n": int((r < -10).sum())},
    {"label": "1e-10 to 1e-6", "n": int(((r >= -10) & (r < -6)).sum())},
    {"label": "1e-6 to 1e-4", "n": int(((r >= -6) & (r < -4)).sum())},
]
objs = pc_conf.c_object_type.str.title().value_counts().to_dict()
tiers = last.tier.value_counts().to_dict()
out = {"kpi": {"messages": int(len(te)), "events": int(te.event_id.nunique()), "critical": int((last.tier == "Critical").sum()),
               "pc": len(pc_conf), "distance": len(dist_only), "hidden": len(hidden),
               "elevated": int(tiers.get("Elevated", 0)), "safe": int(tiers.get("Safe", 0))},
       "day": day, "hist": hist, "pcdist": pcdist, "objs": objs, "rows": rows}
json.dump(out, open(f"{S}/dash.json", "w"), separators=(",", ":"))
print(json.dumps({k: v for k, v in out.items() if k != "rows"}, indent=1))
print("rows", len(rows), "bytes", len(json.dumps(out, separators=(",", ":"))))
for x in rows[:5] + rows[23:26] + rows[35:38]:
    print({k: v for k, v in x.items() if k != "series"})
