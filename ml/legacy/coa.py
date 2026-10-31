"""Course-of-action computation for Pc-confirmed events.

Encounter-plane Pc from the CDM's relative state and both covariances, validated
against ESA's own risk, then a burn search with Clohessy-Wiltshire relative motion.
"""
import json
import sys
import numpy as np
import pandas as pd

MU = 398600.4418  # km^3/s^2
D, S = sys.argv[1], sys.argv[2]
cols = ["event_id", "time_to_tca", "mission_id", "risk", "miss_distance", "c_object_type",
        "relative_position_r", "relative_position_t", "relative_position_n",
        "relative_velocity_r", "relative_velocity_t", "relative_velocity_n",
        "t_j2k_sma", "t_span", "c_span",
        "t_sigma_r", "t_sigma_t", "t_sigma_n", "t_ct_r", "t_cn_r", "t_cn_t",
        "c_sigma_r", "c_sigma_t", "c_sigma_n", "c_ct_r", "c_cn_r", "c_cn_t"]
te = pd.read_csv(f"{D}/test_data.csv", usecols=cols)
last = te.sort_values("time_to_tca").groupby("event_id").first()
pc_ev = last[last.risk >= -4].sort_values("risk", ascending=False)
fleet = json.load(open(f"{S}/fleet.json"))
label = {m["mid"]: m["label"] for m in fleet["missions"]}
print("correlation ranges:", te[["t_ct_r", "t_cn_r", "t_cn_t", "c_ct_r"]].describe().loc[["min", "max"]].round(3).to_dict())
print("span ranges:", te[["t_span", "c_span"]].describe().loc[["min", "50%", "max"]].round(2).to_dict())


def cov(sr, st, sn, ctr, cnr, cnt):
    s = np.diag([sr, st, sn])
    rho = np.array([[1, ctr, cnr], [ctr, 1, cnt], [cnr, cnt, 1]])
    return s @ rho @ s


def frame(rel_v, v_t):
    """Encounter-plane basis (in target RTN) and chaser-RTN -> target-RTN rotation."""
    vhat = rel_v / np.linalg.norm(rel_v)
    rhat = np.array([1.0, 0, 0])
    e1 = rhat - rhat.dot(vhat) * vhat
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(vhat, e1)
    v_c = np.array([0, v_t, 0]) + rel_v
    tc = np.array([0, v_c[1], v_c[2]])
    tc /= np.linalg.norm(tc)
    nc = np.cross(rhat, tc)
    rot = np.column_stack([rhat, tc, nc])  # columns: chaser R, T, N expressed in target RTN
    return vhat, np.vstack([e1, e2]), rot


def pc2d(m2, c2, hbr):
    ci = np.linalg.inv(c2)
    return hbr ** 2 / (2 * np.sqrt(np.linalg.det(c2))) * np.exp(-0.5 * m2 @ ci @ m2)


def cw_disp(dv, n, t):
    """Target displacement (R, T, N metres) at time t after an impulse dv (m/s) in RTN."""
    s, c = np.sin(n * t), np.cos(n * t)
    x = dv[0] / n * s + 2 * dv[1] / n * (1 - c)
    y = 2 * dv[0] / n * (c - 1) + dv[1] / n * (4 * s - 3 * n * t)
    z = dv[2] / n * s
    return np.array([x, y, z])


def direction(alpha, beta):
    """alpha: in-plane angle from velocity (+T) toward radial-out (+R); beta: out-of-plane toward +N."""
    a, b = np.radians(alpha), np.radians(beta)
    return np.array([np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)])


GRID = [(a, b) for a in range(0, 360, 10) for b in (-60, -30, 0, 30, 60)]
DVS = np.arange(0.5, 60.01, 0.5)  # mm/s


def search(r_rel, P, C2, hbr, n, lead_s, dirs, pc_max=1e-4, miss_min=1000):
    for dv_mm in DVS:
        best = None
        for (a, b) in dirs:
            d = cw_disp(direction(a, b) * dv_mm / 1000, n, lead_s)
            m2 = P @ (r_rel - d)
            miss = np.linalg.norm(m2)
            pc = pc2d(m2, C2, hbr)
            if pc < pc_max and miss > miss_min and (best is None or pc < best[3]):
                best = (dv_mm, a, b, pc, miss, d)
        if best:
            return best
    return None


rows, checks = [], []
for eid, r in pc_ev.iterrows():
    a_km = r.t_j2k_sma
    n = np.sqrt(MU / a_km ** 3)
    v_t = np.sqrt(MU / a_km) * 1000
    r_rel = np.array([r.relative_position_r, r.relative_position_t, r.relative_position_n])
    v_rel = np.array([r.relative_velocity_r, r.relative_velocity_t, r.relative_velocity_n])
    vhat, P, rot = frame(v_rel, v_t)
    Ct = cov(r.t_sigma_r, r.t_sigma_t, r.t_sigma_n, r.t_ct_r, r.t_cn_r, r.t_cn_t)
    Cc = rot @ cov(r.c_sigma_r, r.c_sigma_t, r.c_sigma_n, r.c_ct_r, r.c_cn_r, r.c_cn_t) @ rot.T
    C2 = P @ (Ct + Cc) @ P.T
    m0 = P @ r_rel
    hbr_span = (r.t_span + r.c_span) / 2
    pc_model = pc2d(m0, C2, hbr_span)
    pc_esa = 10 ** r.risk
    # effective radius that reproduces ESA's Pc with this geometry (used for after-burn estimates)
    hbr_eff = hbr_span * np.sqrt(pc_esa / pc_model) if pc_model > 0 else hbr_span
    vt_vec = np.array([0, v_t, 0])
    vc_vec = vt_vec + v_rel
    cross = np.degrees(np.arccos(np.clip(vt_vec.dot(vc_vec) / (np.linalg.norm(vt_vec) * np.linalg.norm(vc_vec)), -1, 1)))
    w, V = np.linalg.eigh(C2)
    ell = {"a": round(float(np.sqrt(w[1])), 1), "b": round(float(np.sqrt(w[0])), 1), "deg": round(float(np.degrees(np.arctan2(V[1, 1], V[0, 1]))), 1)}
    checks.append((int(eid), round(np.log10(pc_model), 2) if pc_model > 0 else None, r.risk, round(hbr_span, 1), round(hbr_eff, 2),
                   round(np.linalg.norm(m0)), round(r.miss_distance)))

    lead = r.time_to_tca * 86400
    opts = []
    for key, name, dirs, lead_s, pc_max, miss_min in [
        ("coa1", "Recommended", GRID, lead, 1e-4, 1000),
        ("coa2", "More margin", GRID, lead, 1e-6, 2000),
        ("coa3", "Wait 24 h", GRID, lead - 86400, 1e-4, 1000),
    ]:
        if lead_s < 3 * 3600:
            continue
        res = search(r_rel, P, C2, hbr_eff, n, lead_s, dirs, pc_max, miss_min)
        if not res:
            opts.append({"key": key, "name": name, "feasible": False})
            continue
        dv_mm, al, be, pc_after, miss_after, d = res
        mass, thrust, isp = 1000.0, 1.0, 220.0
        opts.append({
            "key": key, "name": name, "feasible": True, "dv": float(dv_mm), "alpha": al, "beta": be,
            "leadH": round(lead_s / 3600, 1),
            "pcAfter": float(f"{pc_after:.3g}"), "missAfter": round(float(miss_after)),
            "dR": round(float(d[0])), "dT": round(float(d[1])), "dN": round(float(d[2])),
            "burnS": round(mass * dv_mm / 1000 / thrust, 1),
            "dA": round(float(2 * a_km * 1000 * (dv_mm / 1000) * np.cos(np.radians(al)) * np.cos(np.radians(be)) / v_t), 1),
            "propG": round(mass * (1 - np.exp(-dv_mm / 1000 / (isp * 9.80665))) * 1000, 2),
            "m2After": [round(float(v)) for v in (P @ (r_rel - d))],
        })
    ev = {
        "id": int(eid), "sat": label[int(r.mission_id)], "obj": r.c_object_type.title(), "risk": round(float(r.risk), 2),
        "miss": round(float(r.miss_distance)), "tca": round(float(r.time_to_tca), 2), "relSpeed": round(float(np.linalg.norm(v_rel)) / 1000, 2),
        "crossDeg": round(float(cross), 1), "altKm": round(float(a_km - 6378.137)),
        "r": [round(float(v)) for v in r_rel], "m2": [round(float(v)) for v in m0],
        "c2": [[round(float(v), 1) for v in row] for row in C2],
        "ell": ell, "pcModelOk": bool(abs(np.log10(pc_model) - r.risk) < 0.1) if pc_model > 0 else False,
        "hbrSpan": round(float(hbr_span), 1), "hbrEff": round(float(hbr_eff), 2),
        "pcModelLog": round(float(np.log10(pc_model)), 2) if pc_model > 0 else None,
        "opts": opts,
    }
    rows.append(ev)

print("\nvalidation (id, log10 Pc model with span HBR, ESA risk, span HBR m, effective HBR m, encounter-plane miss m, CDM miss m):")
for c in checks:
    print(c)
diff = [c[1] - c[2] for c in checks if c[1] is not None]
print("model minus ESA (orders of magnitude): median", round(float(np.median(diff)), 2), "range", round(min(diff), 2), round(max(diff), 2))
print("\nCOAs:")
for e in rows:
    print(e["id"], e["sat"], "cross", e["crossDeg"], "ell", e["ell"], [(o["key"], o.get("dv"), o.get("alpha"), o.get("beta"), o.get("pcAfter"), o.get("missAfter"), o.get("dA"), o.get("burnS"), o.get("propG")) for o in e["opts"]])
json.dump({"events": rows, "assumptions": {"massKg": 1000, "thrustN": 1, "ispS": 220}}, open(f"{S}/coa.json", "w"), separators=(",", ":"))
print("bytes", len(json.dumps(rows, separators=(",", ":"))))
