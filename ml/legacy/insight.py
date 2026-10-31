import sys
import numpy as np
import pandas as pd
S = sys.argv[1]
for name in ["test", "train"]:
    df = pd.read_parquet(f"{S}/data/{name}.parquet")
    last = df.sort_values("time_to_tca").groupby("event_id").first()  # latest CDM per event
    for label, d in [("rows", df), ("latest CDM per event", last)]:
        dist_only = (d.miss_distance < 1000) & (d.risk < -4)
        pc_crit = d.risk >= -4
        crit = dist_only | pc_crit
        r = d.risk[dist_only]
        print(f"{name} {label}: Critical {int(crit.sum())} = Pc-triggered {int(pc_crit.sum())} + distance-only {int(dist_only.sum())}")
        print(f"   distance-only Critical: risk at -30 floor {np.mean(r <= -30):.1%}, below 1e-10 {np.mean(r < -10):.1%}, below 1e-6 {np.mean(r < -6):.1%}, median log10 Pc {r.median():.1f}")
        far = (d.miss_distance > 5000) & (d.risk >= -6)
        print(f"   miss > 5 km yet Pc >= 1e-6: {int(far.sum())}; of those Pc >= 1e-4: {int(((d.miss_distance > 5000) & pc_crit).sum())}")
