import sys
import numpy as np
import pandas as pd
S = sys.argv[1]
for name in ["train", "test"]:
    df = pd.read_parquet(f"{S}/data/{name}.parquet").sort_values(["event_id", "time_to_tca"], ascending=[True, False])
    n = df.groupby("event_id").size()
    gaps = (-df.groupby("event_id").time_to_tca.diff()).dropna() * 24
    first = df.groupby("event_id").time_to_tca.max()
    print(f"{name}: {len(df):,} messages / {len(n):,} events = {len(df)/len(n):.1f} per event (median {n.median():.0f}, max {n.max()})")
    print(f"   hours between updates: median {gaps.median():.1f}, p25 {gaps.quantile(.25):.1f}, p75 {gaps.quantile(.75):.1f}")
    print(f"   first message arrives at median {first.median():.1f} days before TCA")
    s = df.groupby("event_id").risk
    print(f"   per event, risk swing (max - min) median {(s.max()-s.min()).median():.1f} orders of magnitude")
