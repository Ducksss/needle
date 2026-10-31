"""replay.json: real training-set CDM histories placed on a simulated 21-day calendar.

Message timing within each event is real (time_to_tca); only each event's closest-approach time on
the calendar is simulated, because the data has no dates. High-risk events are over-sampled for the
demo. Burn options and the cost-of-waiting envelope are computed for every CDM with Pc >= 1e-4 and at
least 3 h to closest approach.
"""
import numpy as np
import pandas as pd

from .data import latest_cdm
from .physics import coa_entry

RUNS, RUN_H, WINDOW_H = 64, 8, 21 * 24
N_EVENTS = 280
SEED = 7
NOTE = "Real ESA training-set CDM histories; simulated calendar; high-risk events over-sampled"


def choose_events(tr, rng):
    """Every event that ends at Pc >= 1e-4, plus samples of peaked-then-dropped, distance-only and hidden events."""
    info = tr.groupby("event_id").agg(n=("risk", "size"), tmin=("time_to_tca", "min"), tmax=("time_to_tca", "max"),
                                      rmax=("risk", "max"))
    final = latest_cdm(tr)
    elig = info[(info.tmin < 0.5) & (info.tmax >= 2) & (info.n >= 4)].index
    fin = final.loc[elig]
    pc_final = fin[fin.risk >= -4].index
    down = info.loc[elig][info.loc[elig].rmax >= -4].index.difference(pc_final)
    dist = fin[(fin.miss_distance < 1000) & (fin.risk < -4)].index
    hidden = fin[(fin.miss_distance > 5000) & (fin.risk >= -6)].index

    def take(idx, k):
        idx = list(idx)
        return list(rng.choice(idx, size=min(k, len(idx)), replace=False)) if idx else []

    chosen = list(dict.fromkeys(int(x) for x in list(pc_final) + take(down, 14)
                                + take(dist.difference(pc_final), 26) + take(hidden.difference(pc_final), 14)))
    rest = pd.Index(elig).difference(pd.Index(chosen))
    chosen += [int(x) for x in take(rest, N_EVENTS - len(chosen))]
    high = set(int(x) for x in pc_final) | set(int(x) for x in down)
    return chosen, high


def build(tr, fleet, log=print):
    """Build replay.json from train and the fleet labels. Seeded, so two builds match."""
    label = {m["mid"]: (i, m["label"]) for i, m in enumerate(fleet["missions"])}
    rng = np.random.default_rng(SEED)
    chosen, high = choose_events(tr, rng)
    by_event = dict(tuple(tr[tr.event_id.isin(chosen)].groupby("event_id")))

    events = []
    for eid in chosen:
        e = by_event[eid].sort_values("time_to_tca", ascending=False)
        if eid in high or (e.risk.max() >= -4):
            lo, hi = 72, 456  # keep escalating events inside the visible window
        else:
            lo, hi = 0, WINDOW_H + 7 * 24
        tca_h = float(rng.uniform(lo, hi))
        mi, sat = label[int(e.mission_id.iloc[0])]
        msgs, rtn, coas = [], [], {}
        for k, (_, r) in enumerate(e.iterrows()):
            arr = tca_h - max(r.time_to_tca, 0) * 24
            msgs.append([round(arr, 1), round(float(r.risk), 1), round(float(r.miss_distance))])
            rtn.append([round(float(r.relative_position_r)), round(float(r.relative_position_t)),
                        round(float(r.relative_position_n))])
            if r.risk >= -4 and r.time_to_tca * 24 >= 3:
                c = coa_entry(r)
                if c["opts"]:
                    coas[str(k)] = c
        events.append({"id": int(eid), "sat": sat, "mi": mi, "obj": e.c_object_type.iloc[0].title(),
                       "inc": round(float(e.c_j2k_inc.iloc[0]), 1), "tca": round(tca_h, 1), "m": msgs, "rtn": rtn,
                       "coa": coas})
        if coas:
            log(f"replay: event {eid} {sat}: {len(coas)} burn-option CDMs")
    events.sort(key=lambda x: x["tca"])
    return {"runs": RUNS, "runH": RUN_H, "windowH": WINDOW_H, "events": events, "note": NOTE}


def summary(replay):
    """Counts reported in metrics.json."""
    coas = [c for ev in replay["events"] for c in ev["coa"].values()]
    ratios = []
    for c in coas:
        w = dict((h, dv) for h, dv in c["wait"])
        if w.get(0) and w.get(24):
            ratios.append(w[24] / w[0])
    return {"events": len(replay["events"]),
            "escalated": sum(1 for ev in replay["events"] if max(m[1] for m in ev["m"]) >= -4),
            "coaMessages": len(coas),
            "pcModelWithin01": sum(1 for c in coas if c["pcModelOk"]),
            "medianWaitRatio24h": round(float(np.median(ratios)), 2) if ratios else None,
            "waitRatioPairs": len(ratios)}
