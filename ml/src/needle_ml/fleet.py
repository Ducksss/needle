"""fleet.json: missions, chaser dots and Pc-confirmed events from the test set's latest CDMs."""
import numpy as np
import pandas as pd

from .data import latest_cdm
from .tiers import bucket, tier

CODE = {"none": 0, "distance": 1, "hidden": 2, "pc": 3}


def build(tr, te):
    last = latest_cdm(te)
    last["bucket"] = bucket(last.risk.values, last.miss_distance.values)
    last["tier"] = tier(last.risk.values, last.miss_distance.values)

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

    dots = []
    for eid, r in last.iterrows():
        alt = (r.c_h_apo + r.c_h_per) / 2
        dots.append([idx[r.mission_id], round(float(alt)), round(float(r.c_j2k_inc), 1), CODE[r.bucket], int(eid)])

    pc_events = []
    for eid, r in last[last.bucket == "pc"].sort_values("risk", ascending=False).iterrows():
        pc_events.append({
            "id": int(eid), "sat": missions[idx[r.mission_id]]["label"], "obj": r.c_object_type.title(),
            "risk": round(float(r.risk), 2), "miss": round(float(r.miss_distance)), "tca": round(float(r.time_to_tca), 2),
            "speed": round(float(r.relative_speed)), "r": round(float(r.relative_position_r)),
            "t": round(float(r.relative_position_t)), "n": round(float(r.relative_position_n)),
            "sr": round(float(np.sqrt(r.t_sigma_r ** 2 + r.c_sigma_r ** 2)), 1),
            "st": round(float(np.sqrt(r.t_sigma_t ** 2 + r.c_sigma_t ** 2)), 1),
            "sn": round(float(np.sqrt(r.t_sigma_n ** 2 + r.c_sigma_n ** 2)), 1)})
    return {"missions": missions, "dots": dots, "pcEvents": pc_events}
