import json
import sys
import numpy as np
import pandas as pd

D, S = sys.argv[1], sys.argv[2]
queue = json.load(open(f"{S}/queue.json"))["rows"]
fleet = json.load(open(f"{S}/fleet.json"))
cols = ["event_id", "time_to_tca", "risk", "miss_distance", "relative_position_r", "relative_position_n"]
te = pd.read_csv(f"{D}/test_data.csv", usecols=cols).sort_values(["event_id", "time_to_tca"], ascending=[True, False])

last = te.groupby("event_id").tail(1).set_index("event_id")
code = np.select([last.risk >= -4, (last.miss_distance > 5000) & (last.risk >= -6), last.miss_distance < 1000], [3, 2, 1], default=0)
allpts = [[int(e), round(float(m)), round(float(r), 2), int(c)] for e, m, r, c in zip(last.index, last.miss_distance, last.risk, code)]

by = {e: g for e, g in te.groupby("event_id")}
rows = []
for q in queue:
    g = by[q["id"]]
    q = dict(q)
    q["s"] = [[round(float(t), 2), round(float(r), 1), round(float(m)), round(float(rr)), round(float(nn))]
              for t, r, m, rr, nn in zip(g.time_to_tca, g.risk, g.miss_distance, g.relative_position_r, g.relative_position_n)]
    rows.append(q)
missions = {m["label"]: {"alt": m["alt"], "inc": m["inc"], "ev": m["evTest"]} for m in fleet["missions"]}
out = {"all": allpts, "rows": rows, "missions": missions}
json.dump(out, open(f"{S}/console.json", "w"), separators=(",", ":"))
print("all", len(allpts), "rows", len(rows), "bytes", len(json.dumps(out, separators=(",", ":"))))
print("codes", {c: sum(1 for p in allpts if p[3] == c) for c in range(4)})
print(rows[0]["id"], rows[0]["s"][:3])
