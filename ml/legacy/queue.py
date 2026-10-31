import json
import sys
import numpy as np
import pandas as pd

D, S = sys.argv[1], sys.argv[2]
dash = json.load(open(f"{S}/dash.json"))
fleet = json.load(open(f"{S}/fleet.json"))
label = {m["mid"]: (i, m["label"]) for i, m in enumerate(fleet["missions"])}
cols = ["event_id", "time_to_tca", "mission_id", "relative_position_r", "relative_position_t", "relative_position_n",
        "t_sigma_r", "c_sigma_r", "t_sigma_t", "c_sigma_t", "t_sigma_n", "c_sigma_n"]
te = pd.read_csv(f"{D}/test_data.csv", usecols=cols)
last = te.sort_values("time_to_tca").groupby("event_id").first()

rows = []
for r in dash["rows"]:
    l = last.loc[r["id"]]
    mi, sat = label[int(l.mission_id)]
    rows.append({
        "id": r["id"], "b": r["bucket"], "mi": mi, "sat": sat, "obj": r["obj"], "tca": r["tca"],
        "miss": round(r["miss"] * 1000), "risk": r["risk"], "pc": r["pc"], "pCrit": r["pCrit"],
        "tier": r["tier"], "ch": r["change"], "trig": r["trigger"], "speed": r["speed"], "n": r["n"],
        "r": round(float(l.relative_position_r)), "t": round(float(l.relative_position_t)), "nn": round(float(l.relative_position_n)),
        "sr": round(float(np.hypot(l.t_sigma_r, l.c_sigma_r)), 1),
        "st": round(float(np.hypot(l.t_sigma_t, l.c_sigma_t)), 1),
        "sn": round(float(np.hypot(l.t_sigma_n, l.c_sigma_n)), 1),
        "s": [[p[0], p[1]] for p in r["series"]],
    })
json.dump({"rows": rows}, open(f"{S}/queue.json", "w"), separators=(",", ":"))
print(len(rows), "rows", len(json.dumps({"rows": rows}, separators=(",", ":"))), "bytes")
print({b: sum(1 for x in rows if x["b"] == b) for b in ["pc", "hidden", "distance"]})
print(rows[0]["sat"], rows[0]["id"], rows[0]["t"], rows[0]["st"])
