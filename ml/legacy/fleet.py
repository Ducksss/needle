import json
import sys
import numpy as np
import pandas as pd

D, S = sys.argv[1], sys.argv[2]
COLS = ["event_id", "time_to_tca", "mission_id", "risk", "miss_distance", "relative_speed",
        "relative_position_r", "relative_position_t", "relative_position_n", "c_object_type",
        "t_j2k_inc", "c_j2k_inc", "t_h_apo", "t_h_per", "c_h_apo", "c_h_per",
        "t_sigma_r", "c_sigma_r", "t_sigma_t", "c_sigma_t", "t_sigma_n", "c_sigma_n"]
tr = pd.read_csv(f"{D}/train_data.csv", usecols=COLS)
te = pd.read_csv(f"{D}/test_data.csv", usecols=COLS)
print("units check t_h_apo/per:", te.t_h_apo.describe()[["min", "50%", "max"]].round(1).tolist(),
      te.t_h_per.describe()[["min", "50%", "max"]].round(1).tolist(), "inc:", te.t_j2k_inc.describe()[["min", "50%", "max"]].round(1).tolist())

last = te.sort_values("time_to_tca").groupby("event_id").first()
last["bucket"] = np.select(
    [last.risk >= -4, (last.miss_distance > 5000) & (last.risk >= -6), (last.miss_distance < 1000)],
    ["pc", "hidden", "distance"], default="none")
last["tier"] = np.where((last.risk >= -4) | (last.miss_distance < 1000), "Critical",
                        np.where((last.risk >= -6) | (last.miss_distance <= 5000), "Elevated", "Safe"))

both = pd.concat([tr, te])
ev_tr = tr.groupby("mission_id").event_id.nunique()
ev_te = te.groupby("mission_id").event_id.nunique()
orb = both.groupby("mission_id").agg(alt=("t_h_apo", "median"), per=("t_h_per", "median"), inc=("t_j2k_inc", "median"))
missions = []
for mid in orb.index:
    sub = last[last.mission_id == mid]
    top = sub.sort_values("risk", ascending=False).head(1)
    missions.append({
        "mid": int(mid), "alt": round(float((orb.loc[mid].alt + orb.loc[mid].per) / 2)), "inc": round(float(orb.loc[mid].inc), 1),
        "evTrain": int(ev_tr.get(mid, 0)), "evTest": int(ev_te.get(mid, 0)),
        "pc": int((sub.bucket == "pc").sum()), "hidden": int((sub.bucket == "hidden").sum()),
        "distance": int((sub.bucket == "distance").sum()), "critical": int((sub.tier == "Critical").sum()),
        "elevated": int((sub.tier == "Elevated").sum()), "safe": int((sub.tier == "Safe").sum()),
        "topId": int(top.index[0]) if len(top) else None,
        "topRisk": round(float(top.risk.iloc[0]), 2) if len(top) else None,
        "topMiss": round(float(top.miss_distance.iloc[0])) if len(top) else None,
    })
# label satellites by risk: Pc-confirmed, then hidden, then critical, then events
missions.sort(key=lambda m: (-m["pc"], -m["hidden"], -m["critical"], -(m["evTrain"] + m["evTest"])))
for i, m in enumerate(missions):
    m["label"] = f"ESA-{i + 1:02d}"
idx = {m["mid"]: i for i, m in enumerate(missions)}

code = {"none": 0, "distance": 1, "hidden": 2, "pc": 3}
dots = []
for eid, r in last.iterrows():
    alt = (r.c_h_apo + r.c_h_per) / 2
    dots.append([idx[r.mission_id], round(float(alt)), round(float(r.c_j2k_inc), 1), code[r.bucket], int(eid)])

pcev = []
for eid, r in last[last.bucket == "pc"].sort_values("risk", ascending=False).iterrows():
    sr = np.sqrt(r.t_sigma_r ** 2 + r.c_sigma_r ** 2)
    st = np.sqrt(r.t_sigma_t ** 2 + r.c_sigma_t ** 2)
    sn = np.sqrt(r.t_sigma_n ** 2 + r.c_sigma_n ** 2)
    pcev.append({"id": int(eid), "sat": missions[idx[r.mission_id]]["label"], "obj": r.c_object_type.title(),
                 "risk": round(float(r.risk), 2), "miss": round(float(r.miss_distance)), "tca": round(float(r.time_to_tca), 2),
                 "speed": round(float(r.relative_speed)), "r": round(float(r.relative_position_r)),
                 "t": round(float(r.relative_position_t)), "n": round(float(r.relative_position_n)),
                 "sr": round(float(sr), 1), "st": round(float(st), 1), "sn": round(float(sn), 1)})
out = {"missions": missions, "dots": dots, "pcEvents": pcev}
json.dump(out, open(f"{S}/fleet.json", "w"), separators=(",", ":"))
print("missions", len(missions), "dots", len(dots), "pcEvents", len(pcev), "bytes", len(json.dumps(out, separators=(",", ":"))))
for m in missions:
    print(m)
print(pcev[:3])
print("chaser alt range", min(d[1] for d in dots), max(d[1] for d in dots))
