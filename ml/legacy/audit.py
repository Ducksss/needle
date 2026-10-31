import sys
import numpy as np
import pandas as pd

COLS = ["event_id", "time_to_tca", "risk", "miss_distance", "relative_speed",
        "relative_position_r", "relative_position_t", "relative_position_n",
        "c_object_type", "c_sigma_r", "t_sigma_r", "max_risk_estimate", "F10", "AP"]


def tier(risk, miss):
    crit = (risk >= -4) | (miss < 1000)
    elev = (risk >= -6) | (miss <= 5000)
    return np.where(crit, "Critical", np.where(elev, "Elevated", "Safe"))


def describe(name, df):
    print(f"\n=== {name}: {len(df):,} rows, {df.event_id.nunique():,} events")
    print("time_to_tca range:", df.time_to_tca.min().round(3), "to", df.time_to_tca.max().round(3))
    print("rows with time_to_tca < 2:", (df.time_to_tca < 2).sum(), "| < 1:", (df.time_to_tca < 1).sum())
    print("risk range:", df.risk.min(), "to", df.risk.max(), "| share <= -30:", round((df.risk <= -30).mean(), 3))
    print("miss_distance quantiles (m):", df.miss_distance.quantile([0, .01, .1, .5, .9, 1]).round(0).tolist())
    print("c_object_type:", df.c_object_type.value_counts().to_dict())
    df["tier"] = tier(df.risk, df.miss_distance)
    print("row tiers:", df.tier.value_counts().to_dict())
    c = df[df.tier == "Critical"]
    by_pc = (c.risk >= -4)
    by_miss = (c.miss_distance < 1000)
    print(f"Critical rows driven by: Pc only {int((by_pc & ~by_miss).sum())}, miss only {int((~by_pc & by_miss).sum())}, both {int((by_pc & by_miss).sum())}")
    last = df.sort_values("time_to_tca").groupby("event_id").first()
    print("final-CDM tiers per event:", last.tier.value_counts().to_dict())
    print("events with final risk >= -4:", int((last.risk >= -4).sum()), "| >= -6:", int((last.risk >= -6).sum()))
    print("corr(risk, max_risk_estimate) where risk > -30:",
          round(df.loc[df.risk > -30, ["risk", "max_risk_estimate"]].corr().iloc[0, 1], 3))


def naive_forecast(name, df):
    # ESA setup: learn from CDMs >= 2 days out, target is the last CDM within 1 day of TCA
    g = df.groupby("event_id")
    has_early = g.time_to_tca.max() >= 2
    has_late = g.time_to_tca.min() < 1
    ok = has_early & has_late
    ev = ok[ok].index
    d = df[df.event_id.isin(ev)]
    early = d[d.time_to_tca >= 2].sort_values("time_to_tca").groupby("event_id").first()
    final = d.sort_values("time_to_tca").groupby("event_id").first()
    cm = pd.crosstab(early.tier, final.tier, rownames=["latest at >=2d"], colnames=["final"])
    print(f"\n--- {name}: eligible events {len(ev):,}")
    print(cm)
    fc = final.tier == "Critical"
    ec = early.tier == "Critical"
    print(f"final Critical {int(fc.sum())}; naive catches {int((fc & ec).sum())}, misses {int((fc & ~ec).sum())}, false alarms {int((~fc & ec).sum())}")
    return ev


if __name__ == "__main__":
    tr = pd.read_csv(sys.argv[1], usecols=COLS)
    te = pd.read_csv(sys.argv[2], usecols=COLS)
    describe("TRAIN", tr)
    describe("TEST", te)
    naive_forecast("TRAIN", tr)
    naive_forecast("TEST", te)
    tr.to_parquet(sys.argv[3] + "/train.parquet")
    te.to_parquet(sys.argv[3] + "/test.parquet")
