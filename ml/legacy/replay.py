"""Replay dataset: real training-set CDM histories placed on a simulated 21-day calendar.

Message timing within each event is real (time_to_tca); only each event's closest-approach
time on the calendar is simulated, because the data has no dates. High-risk events are
over-sampled for the demo. Courses of action are computed for every message with Pc >= 1e-4.
"""
import json
import sys
import numpy as np
import pandas as pd

MU = 398600.4418
D, S = sys.argv[1], sys.argv[2]
RUNS, RUN_H, WINDOW_H = 64, 8, 21 * 24
cols = ["event_id", "time_to_tca", "mission_id", "risk", "miss_distance", "c_object_type", "c_j2k_inc",
        "relative_position_r", "relative_position_t", "relative_position_n",
        "relative_velocity_r", "relative_velocity_t", "relative_velocity_n",
        "t_j2k_sma", "t_span", "c_span",
        "t_sigma_r", "t_sigma_t", "t_sigma_n", "t_ct_r", "t_cn_r", "t_cn_t",
        "c_sigma_r", "c_sigma_t", "c_sigma_n", "c_ct_r", "c_cn_r", "c_cn_t"]
tr = pd.read_csv(f"{D}/train_data.csv", usecols=cols)
fleet = json.load(open(f"{S}/fleet.json"))
label = {m["mid"]: (i, m["label"]) for i, m in enumerate(fleet["missions"])}

g = tr.groupby("event_id")
info = g.agg(n=("risk", "size"), tmin=("time_to_tca", "min"), tmax=("time_to_tca", "max"), rmax=("risk", "max"))
final = tr.sort_values("time_to_tca").groupby("event_id").first()
elig = info[(info.tmin < 0.5) & (info.tmax >= 2) & (info.n >= 4)].index
fin = final.loc[elig]
pc_final = fin[fin.risk >= -4].index
down = info.loc[elig][info.loc[elig].rmax >= -4].index.difference(pc_final)
late = fin[(fin.risk >= -4)].index  # same as pc_final, kept for clarity
dist = fin[(fin.miss_distance < 1000) & (fin.risk < -4)].index
hidden = fin[(fin.miss_distance > 5000) & (fin.risk >= -6)].index
print("eligible", len(elig), "| Pc>=1e-4 at final", len(pc_final), "| peaked then dropped", len(down), "| distance-only final", len(dist), "| hidden final", len(hidden))

rng = np.random.default_rng(7)
def take(idx, k):
    idx = list(idx)
    return list(rng.choice(idx, size=min(k, len(idx)), replace=False)) if idx else []
chosen = list(dict.fromkeys(int(x) for x in list(pc_final) + take(down, 14) + take(dist.difference(pc_final), 26) + take(hidden.difference(pc_final), 14)))
rest = pd.Index(elig).difference(pd.Index(chosen))
chosen += [int(x) for x in take(rest, 280 - len(chosen))]
hi = set(int(x) for x in pc_final) | set(int(x) for x in down)


def cov(sr, st, sn, ctr, cnr, cnt):
    s = np.diag([sr, st, sn]); rho = np.array([[1, ctr, cnr], [ctr, 1, cnt], [cnr, cnt, 1]])
    return s @ rho @ s


def pc2d(m2, c2, hbr):
    return hbr ** 2 / (2 * np.sqrt(np.linalg.det(c2))) * np.exp(-0.5 * m2 @ np.linalg.inv(c2) @ m2)


def cw_disp(dv, n, t):
    s, c = np.sin(n * t), np.cos(n * t)
    return np.array([dv[0] / n * s + 2 * dv[1] / n * (1 - c), 2 * dv[0] / n * (c - 1) + dv[1] / n * (4 * s - 3 * n * t), dv[2] / n * s])


def direction(a, b):
    a, b = np.radians(a), np.radians(b)
    return np.array([np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)])


DIRS = [(a, 0) for a in range(0, 360, 10)]
DVS = np.arange(0.5, 80.01, 0.5)


def search(r_rel, P, C2, hbr, n, lead_s, pc_max, miss_min, dirs=None):
    for dv_mm in DVS:
        best = None
        for (a, b) in (dirs or DIRS):
            d = cw_disp(direction(a, b) * dv_mm / 1000, n, lead_s)
            m2 = P @ (r_rel - d); miss = float(np.linalg.norm(m2)); pc = pc2d(m2, C2, hbr)
            if pc < pc_max and miss > miss_min and (best is None or pc < best[3]):
                best = (float(dv_mm), a, b, float(pc), miss, d, m2)
        if best:
            return best
    return None


def coa_for(r):
    a_km = r.t_j2k_sma; n = np.sqrt(MU / a_km ** 3); v_t = np.sqrt(MU / a_km) * 1000
    r_rel = np.array([r.relative_position_r, r.relative_position_t, r.relative_position_n])
    v_rel = np.array([r.relative_velocity_r, r.relative_velocity_t, r.relative_velocity_n])
    vhat = v_rel / np.linalg.norm(v_rel); rh = np.array([1.0, 0, 0])
    e1 = rh - rh.dot(vhat) * vhat; e1 /= np.linalg.norm(e1); e2 = np.cross(vhat, e1); P = np.vstack([e1, e2])
    vc = np.array([0, v_t, 0]) + v_rel; tc = np.array([0, vc[1], vc[2]]); tc /= np.linalg.norm(tc)
    rot = np.column_stack([rh, tc, np.cross(rh, tc)])
    C2 = P @ (cov(r.t_sigma_r, r.t_sigma_t, r.t_sigma_n, r.t_ct_r, r.t_cn_r, r.t_cn_t) + rot @ cov(r.c_sigma_r, r.c_sigma_t, r.c_sigma_n, r.c_ct_r, r.c_cn_r, r.c_cn_t) @ rot.T) @ P.T
    m0 = P @ r_rel
    hbr = (r.t_span + r.c_span) / 2
    pcm = pc2d(m0, C2, hbr); pce = 10 ** r.risk
    hbr_eff = hbr * np.sqrt(pce / pcm) if pcm > 0 else hbr
    cross = float(np.degrees(np.arccos(np.clip(np.array([0, v_t, 0]).dot(vc) / (v_t * np.linalg.norm(vc)), -1, 1))))
    w, V = np.linalg.eigh(C2)
    lead = r.time_to_tca * 86400
    opts = []
    for key, lead_s, pmax, mmin in [("coa1", lead, 1e-4, 1000), ("coa2", lead, 1e-6, 2000), ("coa3", lead - 86400, 1e-4, 1000)]:
        if lead_s < 3 * 3600:
            continue
        res = search(r_rel, P, C2, hbr_eff, n, lead_s, pmax, mmin)
        if not res:
            continue
        dv, al, be, pc, miss, d, m2 = res
        opts.append({"key": key, "feasible": True, "dv": dv, "alpha": al, "beta": be, "leadH": round(lead_s / 3600, 1),
                     "pcAfter": float(f"{pc:.3g}"), "missAfter": round(miss), "dR": round(float(d[0])), "dT": round(float(d[1])), "dN": round(float(d[2])),
                     "burnS": round(1000 * dv / 1000 / 1.0, 1), "propG": round(1000 * (1 - np.exp(-dv / 1000 / (220 * 9.80665))) * 1000, 2),
                     "dA": round(float(2 * a_km * 1000 * (dv / 1000) * np.cos(np.radians(al)) / v_t), 1),
                     "m2After": [round(float(x)) for x in m2]})
    # cost of waiting: lowest dv (mm/s) achievable if the burn happens anywhere inside each 6 h window,
    # sampling burn time every 20 min (orbital phase matters) over 24 thrust directions. None = above 80 mm/s.
    Ci = np.linalg.inv(C2); kk = hbr_eff ** 2 / (2 * np.sqrt(np.linalg.det(C2)))
    dvs = DVS / 1000.0
    wait, win = [], 0
    while lead - win * 3600 >= 3 * 3600 and len(wait) < 30:
        best = None
        for sub in range(0, 360, 20):
            ld = lead - win * 3600 - sub * 60
            if ld < 3 * 3600:
                break
            for a in range(0, 360, 15):
                PD = P @ cw_disp(direction(a, 0), n, ld)
                m2s = m0[None, :] - dvs[:, None] * PD[None, :]
                q = np.einsum("ij,jk,ik->i", m2s, Ci, m2s)
                ok = np.where((kk * np.exp(-0.5 * q) < 1e-4) & (np.linalg.norm(m2s, axis=1) > 1000))[0]
                if len(ok) and (best is None or DVS[ok[0]] < best):
                    best = float(DVS[ok[0]])
        wait.append([win, best])
        win += 6
    return {"wait": wait, "risk": round(float(r.risk), 2), "miss": round(float(r.miss_distance)), "tca": round(float(r.time_to_tca), 2),
            "relSpeed": round(float(np.linalg.norm(v_rel)) / 1000, 2), "crossDeg": round(cross, 1), "altKm": round(float(a_km - 6378.137)),
            "m2": [round(float(x)) for x in m0], "ell": {"a": round(float(np.sqrt(w[1])), 1), "b": round(float(np.sqrt(w[0])), 1), "deg": round(float(np.degrees(np.arctan2(V[1, 1], V[0, 1]))), 1)},
            "hbrEff": round(float(hbr_eff), 2), "pcModelOk": bool(pcm > 0 and abs(np.log10(pcm) - r.risk) < 0.1), "opts": opts}


events, n_coa, ok_model = [], 0, 0
for eid in chosen:
    e = tr[tr.event_id == eid].sort_values("time_to_tca", ascending=False)
    if eid in hi or (e.risk.max() >= -4):
        lo, hi_h = 72, 456  # keep escalating events inside the visible window
    else:
        lo, hi_h = 0, WINDOW_H + 7 * 24
    tca_h = float(rng.uniform(lo, hi_h))
    mi, sat = label[int(e.mission_id.iloc[0])]
    msgs, coas = [], {}
    for k, (_, r) in enumerate(e.iterrows()):
        arr = tca_h - max(r.time_to_tca, 0) * 24
        msgs.append([round(arr, 1), round(float(r.risk), 1), round(float(r.miss_distance))])
        if r.risk >= -4 and r.time_to_tca * 24 >= 3:
            c = coa_for(r)
            if c["opts"]:
                coas[str(k)] = c; n_coa += 1; ok_model += c["pcModelOk"]
    events.append({"id": int(eid), "sat": sat, "mi": mi, "obj": e.c_object_type.iloc[0].title(), "inc": round(float(e.c_j2k_inc.iloc[0]), 1),
                   "tca": round(tca_h, 1), "m": msgs, "coa": coas})
events.sort(key=lambda x: x["tca"])
fin_r = {ev["id"]: ev["m"][-1] for ev in events}
print("events", len(events), "| with COA", sum(1 for ev in events if ev["coa"]), "| COA messages", n_coa, "| Pc model within 0.1 orders", ok_model)
print("final Pc>=1e-4:", sum(1 for v in fin_r.values() if v[1] >= -4), "| escalated at some point:", sum(1 for ev in events if max(m[1] for m in ev["m"]) >= -4))
for ev in events:
    if ev["coa"]:
        k0 = sorted(ev["coa"], key=int)[0]; c = ev["coa"][k0]
        print(ev["id"], ev["sat"], "tca", ev["tca"], "first Pc msg", k0, "risk", c["risk"], "final risk", ev["m"][-1][1], "coa1", [(o["key"], o["dv"], o["alpha"], o["missAfter"], o["pcAfter"]) for o in c["opts"]][:1])
out = {"runs": RUNS, "runH": RUN_H, "windowH": WINDOW_H, "events": events,
       "note": "Real ESA training-set CDM histories; simulated calendar; high-risk events over-sampled"}
json.dump(out, open(f"{S}/replay2.json", "w"), separators=(",", ":"))
print("bytes", len(json.dumps(out, separators=(",", ":"))))
