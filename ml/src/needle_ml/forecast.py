"""Forecast ranges: how far an event's miss distance and tier can still move before closest approach.

From train events (excluding the replay's own events, so the demo never sees its outcomes), take each
event's latest message inside every lead-time bin and compare it with the event's final message.
For each (lead bin, current-miss bin) cell, store the 10th, 50th and 90th percentiles of
final miss / current miss, and the share of events that end under 1 km and that end Critical.
A held-out 20% of events checks that the 10th to 90th band covers about 80% of outcomes.
"""
import numpy as np
import pandas as pd

from .tiers import MISS_CRITICAL_M, pc_band, tier_code

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
    df["pc_bin"] = pc_band(df.risk.values)
    return df


def _cell(s):
    q = s.ratio.quantile(QUANTILES).values
    return {"n": int(len(s)), "ratioQ10": round(float(q[0]), 3), "ratioQ50": round(float(q[1]), 3),
            "ratioQ90": round(float(q[2]), 3), "pUnder1km": round(float(s.final_under_1km.mean()), 3),
            "pCritical": round(float(s.final_critical.mean()), 3)}  # all Pc bands; prefer pCriticalByPc


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


PC_MIN_CELL = 20
PC_POOLING = ("lead and miss", "miss", "lead", "Pc band")


def pcrit_table(s):
    """P(final Critical) by current Pc band, lead bin and miss bin: pcrit[pc][lead][miss].

    Pc changes the answer a lot (about 6% below 1e-6, up to 75% at 1e-4 and above), but few events sit
    at Pc >= 1e-4, so a sparse cell pools over lead time, then over miss, then over the whole Pc band.
    """
    out = []
    for pb in range(3):
        sp = s[s.pc_bin == pb]
        rows = []
        for lb in range(len(LEAD_EDGES_D) - 1):
            row = []
            for mb in range(len(MISS_EDGES_M) - 1):
                tries = (sp[(sp.lead_bin == lb) & (sp.miss_bin == mb)], sp[sp.miss_bin == mb], sp[sp.lead_bin == lb], sp)
                for level, c in zip(PC_POOLING, tries):
                    if len(c) >= PC_MIN_CELL or level == "Pc band":
                        p = round(float(c.final_critical.mean()), 3) if len(c) else None
                        row.append({"p": p, "n": int(len(c)), "pooledOver": level})
                        break
            rows.append(row)
        out.append(rows)
    return out


def pcrit_check(table_, test):
    """Held-out check of P(final Critical): Brier score against a base-rate guess, and calibration by Pc band."""
    pred = np.array([table_[pb][lb][mb]["p"] for pb, lb, mb in zip(test.pc_bin, test.lead_bin, test.miss_bin)])
    obs = test.final_critical.values.astype(float)
    base = np.full_like(pred, obs.mean())
    by_pc = []
    for pb in range(3):
        m = test.pc_bin.values == pb
        by_pc.append({"pcBand": pb, "n": int(m.sum()), "meanPredicted": round(float(pred[m].mean()), 3) if m.any() else None,
                      "observed": round(float(obs[m].mean()), 3) if m.any() else None})
    return {"brier": round(float(((pred - obs) ** 2).mean()), 4), "brierBaseRate": round(float(((base - obs) ** 2).mean()), 4),
            "byPcBand": by_pc}


PC_FLOOR = -30.0
PC_FC_EDGES = (-10.0, -6.0, -4.0)  # current log10 Pc bins above the floor: <1e-10, 1e-10..1e-6, 1e-6..1e-4, >=1e-4
PC_FC_MIN = 20


def _pc_fc_bin(risk):
    """0 = at the -30 floor (too small to compute), then 1..4 by PC_FC_EDGES."""
    risk = np.asarray(risk, dtype=float)
    return np.where(risk <= PC_FLOOR, 0, 1 + np.digitize(risk, PC_FC_EDGES))


def _pc_cell(c):
    above = c[c.risk > PC_FLOOR]
    delta = (above.risk_final - above.risk) if len(above) else None
    return {"n": int(len(c)),
            "ceilingDelta": round(float(delta.quantile(0.9)), 2) if delta is not None and len(delta) else None,
            "pFloor": round(float((c.risk_final <= PC_FLOOR).mean()), 3),
            "pBelow1e6": round(float((c.risk_final < -6).mean()), 3),
            "pAtLeast1e4": round(float((c.risk_final >= -4).mean()), 3)}


def pc_table(s):
    """How the final Pc relates to today's, by current-Pc bin and lead bin: cells[pcBin][leadBin].

    Pc is bimodal before closest approach: it mostly stays at or below today's value, or collapses to the
    -30 floor (too small to compute). So the table stores a ceiling (the 90th percentile of final minus
    current log10 Pc) and the chances of ending at the floor, below 1e-6 and at or above 1e-4, not a band.
    A cell with fewer than 20 samples pools over lead time.
    """
    s = s.assign(pc_fc=_pc_fc_bin(s.risk.values))
    out = []
    for pb in range(len(PC_FC_EDGES) + 2):
        sp = s[s.pc_fc == pb]
        row = []
        for lb in range(len(LEAD_EDGES_D) - 1):
            c = sp[sp.lead_bin == lb]
            cell = _pc_cell(c if len(c) >= PC_FC_MIN else sp)
            cell["pooledOverLead"] = bool(len(c) < PC_FC_MIN)
            row.append(cell)
        out.append(row)
    return out


def pc_check(table_, test):
    """Held-out checks: how often the final Pc stays under the ceiling, and calibration of P(final >= 1e-4) and P(floor)."""
    t = test.assign(pc_fc=_pc_fc_bin(test.risk.values))
    under, n_ceiling = 0, 0
    p4, pf = [], []
    for pb, lb, r, rf in zip(t.pc_fc, t.lead_bin, t.risk, t.risk_final):
        cell = table_[pb][lb]
        if r > PC_FLOOR and cell["ceilingDelta"] is not None:
            n_ceiling += 1
            under += rf <= r + cell["ceilingDelta"] + 1e-9
        p4.append(cell["pAtLeast1e4"]); pf.append(cell["pFloor"])
    p4, pf = np.array(p4), np.array(pf)
    y4, yf = (t.risk_final.values >= -4).astype(float), (t.risk_final.values <= PC_FLOOR).astype(float)
    return {"ceilingHeld": round(under / n_ceiling, 3), "ceilingSamples": n_ceiling,
            "pAtLeast1e4": {"meanPredicted": round(float(p4.mean()), 4), "observed": round(float(y4.mean()), 4),
                            "brier": round(float(((p4 - y4) ** 2).mean()), 4),
                            "brierBaseRate": round(float(((y4.mean() - y4) ** 2).mean()), 4)},
            "pFloor": {"meanPredicted": round(float(pf.mean()), 3), "observed": round(float(yf.mean()), 3)}}


def build(tr, exclude=(), log=print):
    """forecast.json: the full table, plus an event-level 80/20 check of the band's coverage."""
    s = samples(tr, exclude)
    events = s.event_id.unique()
    rng = np.random.default_rng(SEED)
    held = set(rng.choice(events, size=len(events) // 5, replace=False))
    fit, test = s[~s.event_id.isin(held)], s[s.event_id.isin(held)]
    cov_held = coverage(table(fit), test)
    pcrit_held = pcrit_check(pcrit_table(fit), test)
    pcfc_held = pc_check(pc_table(fit), test)
    by_lead = {}
    t = table(fit)
    for lb in range(len(LEAD_EDGES_D) - 1):
        part = test[test.lead_bin == lb]
        by_lead[str(lb)] = coverage(t, part) if len(part) else None
    cells = table(s)
    log(f"forecast: {s.event_id.nunique():,} events, {len(s):,} samples; held-out 10-90 band coverage {cov_held}; "
        f"P(final Critical) Brier {pcrit_held['brier']} vs base rate {pcrit_held['brierBaseRate']}")
    return {"leadEdgesDays": [e if np.isfinite(e) else None for e in LEAD_EDGES_D],
            "missEdgesM": [e if np.isfinite(e) else None for e in MISS_EDGES_M],
            "quantiles": list(QUANTILES), "cells": cells, "robustRatioQ10": robust_ratio(s),
            "pCriticalByPc": pcrit_table(s), "pcEdgesLog10": [-6, -4],
            "pcForecast": {"pcBinEdgesLog10": list(PC_FC_EDGES), "floorLog10": PC_FLOOR, "cells": pc_table(s)},
            "validation": {"heldOutEvents": len(held), "coverage10to90": cov_held, "coverageByLeadBin": by_lead,
                           "pCritical": pcrit_held, "pcForecast": pcfc_held},
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
