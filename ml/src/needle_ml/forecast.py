"""Forecast ranges: how far an event's miss distance and tier can still move before closest approach.

From train events (excluding the replay's own events, so the demo never sees its outcomes), take each
event's latest message inside every lead-time bin and compare it with the event's final message.
For each (lead bin, current-miss bin) cell, store the 10th, 50th and 90th percentiles of
final miss / current miss, and the share of events that end under 1 km and that end Critical.
A held-out 20% of events checks that the 10th to 90th band covers about 80% of outcomes.
"""
import numpy as np
import pandas as pd

from .tiers import MISS_CRITICAL_M, tier_code

LEAD_EDGES_D = (0.0, 1.0, 2.0, 3.0, 5.0, np.inf)
MISS_EDGES_M = (0.0, 1000.0, 2000.0, 5000.0, np.inf)
QUANTILES = (0.1, 0.5, 0.9)
MIN_CELL = 30
SEED = 11


def samples(tr, exclude=()):
    """One row per (event, lead bin): the event's latest message in that bin, against its final message."""
    df = tr[~tr.event_id.isin(set(exclude))][["event_id", "time_to_tca", "risk", "miss_distance"]]
    df = df.sort_values(["event_id", "time_to_tca"], ascending=[True, False])
    final = df.groupby("event_id").last()
    df = df.join(final, on="event_id", rsuffix="_final")
    df = df[df.time_to_tca > df.time_to_tca_final]  # the final message has nothing left to forecast
    df["lead_bin"] = np.digitize(df.time_to_tca.clip(lower=0), LEAD_EDGES_D[1:-1])
    df = df.groupby(["event_id", "lead_bin"]).last().reset_index()
    df["miss_bin"] = np.digitize(df.miss_distance, MISS_EDGES_M[1:-1])
    df["ratio"] = df.miss_distance_final / df.miss_distance.clip(lower=1.0)
    df["final_under_1km"] = df.miss_distance_final < MISS_CRITICAL_M
    df["final_critical"] = tier_code(df.risk_final.values, df.miss_distance_final.values) == 2
    return df


def _cell(s):
    q = s.ratio.quantile(QUANTILES).values
    return {"n": int(len(s)), "ratioQ10": round(float(q[0]), 3), "ratioQ50": round(float(q[1]), 3),
            "ratioQ90": round(float(q[2]), 3), "pUnder1km": round(float(s.final_under_1km.mean()), 3),
            "pCritical": round(float(s.final_critical.mean()), 3)}


def table(s):
    """cells[lead_bin][miss_bin]; a sparse cell falls back to its lead bin across all misses."""
    cells = []
    for lb in range(len(LEAD_EDGES_D) - 1):
        row_all = s[s.lead_bin == lb]
        row = []
        for mb in range(len(MISS_EDGES_M) - 1):
            c = row_all[row_all.miss_bin == mb]
            cell = _cell(c if len(c) >= MIN_CELL else row_all)
            cell["pooled"] = bool(len(c) < MIN_CELL)
            row.append(cell)
        cells.append(row)
    return cells


def robust_ratio(s):
    """Per lead bin, the 10th-percentile shrink of the miss for events now 1 to 5 km out (the planning regime)."""
    out = []
    for lb in range(len(LEAD_EDGES_D) - 1):
        c = s[(s.lead_bin == lb) & (s.miss_distance >= 1000) & (s.miss_distance < 5000)]
        out.append(round(float(c.ratio.quantile(0.1)), 3) if len(c) >= MIN_CELL else None)
    return out


def coverage(cells, s):
    """Share of messages whose final miss falls inside the cell's 10th to 90th band."""
    lo = np.array([cells[a][b]["ratioQ10"] for a, b in zip(s.lead_bin, s.miss_bin)])
    hi = np.array([cells[a][b]["ratioQ90"] for a, b in zip(s.lead_bin, s.miss_bin)])
    inside = (s.ratio.values >= lo) & (s.ratio.values <= hi)
    return round(float(inside.mean()), 3)


def build(tr, exclude=(), log=print):
    """forecast.json: the full table, plus an event-level 80/20 check of the band's coverage."""
    s = samples(tr, exclude)
    events = s.event_id.unique()
    rng = np.random.default_rng(SEED)
    held = set(rng.choice(events, size=len(events) // 5, replace=False))
    fit, test = s[~s.event_id.isin(held)], s[s.event_id.isin(held)]
    cov_held = coverage(table(fit), test)
    by_lead = {}
    t = table(fit)
    for lb in range(len(LEAD_EDGES_D) - 1):
        part = test[test.lead_bin == lb]
        by_lead[str(lb)] = coverage(t, part) if len(part) else None
    cells = table(s)
    log(f"forecast: {s.event_id.nunique():,} events, {len(s):,} samples; held-out 10-90 band coverage {cov_held}")
    return {"leadEdgesDays": [e if np.isfinite(e) else None for e in LEAD_EDGES_D],
            "missEdgesM": [e if np.isfinite(e) else None for e in MISS_EDGES_M],
            "quantiles": list(QUANTILES), "cells": cells, "robustRatioQ10": robust_ratio(s),
            "validation": {"heldOutEvents": len(held), "coverage10to90": cov_held, "coverageByLeadBin": by_lead},
            "excludedReplayEvents": len(set(exclude)),
            "note": "final miss = current miss x ratio; one sample per event per lead bin; replay events excluded"}


def lookup(fc, lead_days, miss_m):
    """The forecast cell for a message `lead_days` before closest approach with miss `miss_m`."""
    lb = int(np.digitize([max(lead_days, 0.0)], LEAD_EDGES_D[1:-1])[0])
    mb = int(np.digitize([miss_m], MISS_EDGES_M[1:-1])[0])
    return fc["cells"][lb][mb], fc["robustRatioQ10"][lb]


def robust_miss_m(fc, lead_days, floor_m=MISS_CRITICAL_M):
    """Nominal post-burn miss that keeps the 10th-percentile outcome at or above 1 km."""
    _, r10 = lookup(fc, lead_days, floor_m)
    if not r10 or r10 >= 1:
        return floor_m
    return round(floor_m / r10, -1)
