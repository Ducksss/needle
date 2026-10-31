"""Physics model: encounter-plane Pc from the full CDM, Clohessy-Wiltshire burn search, cost of waiting.

This module uses the full CDM (both covariances, object spans, relative velocity), so the UI must
label its output as the physics model. It imports only numpy so the API can load it cheaply.

Frames: the CDM's relative state is in the target's RTN frame. The chaser covariance is rotated from
the chaser's RTN into the target's RTN, both are summed, and the sum is projected onto the encounter
plane (perpendicular to the relative velocity). Pc uses the small-hard-body approximation.
"""
from dataclasses import dataclass

import numpy as np

MU_KM3_S2 = 398600.4418
R_EARTH_KM = 6378.137
G0 = 9.80665

# Assumed spacecraft, as stated in contracts/README.md
MASS_KG = 1000.0
THRUST_N = 1.0
ISP_S = 220.0

PC_ACTION = 1e-4
MISS_ACTION_M = 1000.0
MIN_LEAD_S = 3 * 3600
LOG10_FLOOR = -30.0

# Burn search: Δv from 0.5 to 80 mm/s, in-plane directions every 10 deg.
DVS_MM_S = np.arange(0.5, 80.01, 0.5)
DIRS = [(a, 0) for a in range(0, 360, 10)]
# Wider direction grid with out-of-plane tilts, used by the legacy test-set check in coa.py.
GRID = [(a, b) for a in range(0, 360, 10) for b in (-60, -30, 0, 30, 60)]

# (key, lead offset s, Pc limit, miss limit m): coa1 Minimum, coa2 More margin, coa3 Wait 24 h.
# coa4 Robust is added per CDM from the forecast's 10th-percentile miss shrink (see forecast.py).
COA_TARGETS = (("coa1", 0, PC_ACTION, MISS_ACTION_M),
               ("coa2", 0, 1e-6, 2000.0),
               ("coa3", -86400, PC_ACTION, MISS_ACTION_M))

# Cost of waiting: 6 h windows, burn time sampled every 20 min, 24 directions, at most 30 windows.
WAIT_STEP_H = 6
WAIT_SUB_MIN = 20
WAIT_DIR_DEG = 15
WAIT_MAX_WINDOWS = 30

REQUIRED = ("relative_position_r", "relative_position_t", "relative_position_n",
            "relative_velocity_r", "relative_velocity_t", "relative_velocity_n",
            "t_j2k_sma", "t_span", "c_span",
            "t_sigma_r", "t_sigma_t", "t_sigma_n", "t_ct_r", "t_cn_r", "t_cn_t",
            "c_sigma_r", "c_sigma_t", "c_sigma_n", "c_ct_r", "c_cn_r", "c_cn_t")


def cov(sr, st, sn, ctr, cnr, cnt):
    """3x3 RTN position covariance from sigmas and correlations."""
    s = np.diag([sr, st, sn])
    rho = np.array([[1, ctr, cnr], [ctr, 1, cnt], [cnr, cnt, 1]])
    return s @ rho @ s


def pc2d(m2, c2, hbr):
    """Small-hard-body Pc for encounter-plane miss m2, covariance c2 and hard-body radius hbr."""
    return hbr ** 2 / (2 * np.sqrt(np.linalg.det(c2))) * np.exp(-0.5 * m2 @ np.linalg.inv(c2) @ m2)


def cw_disp(dv, n, t):
    """Displacement (R, T, N metres) t seconds after an impulse dv (m/s, RTN) on a circular orbit of mean motion n."""
    s, c = np.sin(n * t), np.cos(n * t)
    return np.array([dv[0] / n * s + 2 * dv[1] / n * (1 - c),
                     2 * dv[0] / n * (c - 1) + dv[1] / n * (4 * s - 3 * n * t),
                     dv[2] / n * s])


def direction(alpha, beta):
    """Unit RTN vector. alpha: in-plane angle from velocity (+T) toward radial-out (+R); beta: toward +N."""
    a, b = np.radians(alpha), np.radians(beta)
    return np.array([np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)])


@dataclass
class Encounter:
    a_km: float
    n: float              # mean motion, rad/s
    v_t: float            # target circular speed, m/s
    lead_s: float | None  # seconds to closest approach, if the CDM has time_to_tca
    risk: float | None    # ESA log10 Pc, if the CDM has it
    miss: float | None
    r_rel: np.ndarray
    v_rel: np.ndarray
    P: np.ndarray         # 2x3 projection onto the encounter plane
    C2: np.ndarray        # combined encounter-plane covariance
    m0: np.ndarray        # encounter-plane miss vector
    hbr_span: float       # hard-body radius from the object spans
    pc_model: float
    hbr_eff: float        # radius that reproduces ESA's Pc with this geometry
    cross_deg: float
    evals: np.ndarray     # eigenvalues of C2 (ascending); kept apart from any loop variable
    evecs: np.ndarray

    @property
    def ell(self):
        return {"a": round(float(np.sqrt(self.evals[1])), 1), "b": round(float(np.sqrt(self.evals[0])), 1),
                "deg": round(float(np.degrees(np.arctan2(self.evecs[1, 1], self.evecs[0, 1]))), 1)}

    @property
    def pc_model_ok(self):
        return bool(self.risk is not None and self.pc_model > 0 and abs(np.log10(self.pc_model) - self.risk) < 0.1)

    @property
    def log10_pc_model(self):
        return max(float(np.log10(self.pc_model)), LOG10_FLOOR) if self.pc_model > 0 else LOG10_FLOOR


def _get(cdm, key):
    v = cdm.get(key) if hasattr(cdm, "get") else None
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return v


def encounter(cdm):
    """Encounter geometry from one CDM (dict or pandas Series with ESA column names)."""
    missing = [k for k in REQUIRED if _get(cdm, k) is None]
    if missing:
        raise ValueError(f"CDM is missing {', '.join(missing)}")
    r = {k: float(cdm[k]) for k in REQUIRED}
    risk, tca, miss = (None if v is None else float(v) for v in (_get(cdm, k) for k in ("risk", "time_to_tca", "miss_distance")))

    a_km = r["t_j2k_sma"]
    n = np.sqrt(MU_KM3_S2 / a_km ** 3)
    v_t = np.sqrt(MU_KM3_S2 / a_km) * 1000
    r_rel = np.array([r["relative_position_r"], r["relative_position_t"], r["relative_position_n"]])
    v_rel = np.array([r["relative_velocity_r"], r["relative_velocity_t"], r["relative_velocity_n"]])
    vhat = v_rel / np.linalg.norm(v_rel)
    rh = np.array([1.0, 0, 0])
    e1 = rh - rh.dot(vhat) * vhat
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(vhat, e1)
    P = np.vstack([e1, e2])
    # chaser RTN axes expressed in target RTN, assuming a near-circular chaser at the same radius
    vc = np.array([0, v_t, 0]) + v_rel
    tc = np.array([0, vc[1], vc[2]])
    tc /= np.linalg.norm(tc)
    rot = np.column_stack([rh, tc, np.cross(rh, tc)])
    ct = cov(r["t_sigma_r"], r["t_sigma_t"], r["t_sigma_n"], r["t_ct_r"], r["t_cn_r"], r["t_cn_t"])
    cc = cov(r["c_sigma_r"], r["c_sigma_t"], r["c_sigma_n"], r["c_ct_r"], r["c_cn_r"], r["c_cn_t"])
    C2 = P @ (ct + rot @ cc @ rot.T) @ P.T
    m0 = P @ r_rel
    hbr = (r["t_span"] + r["c_span"]) / 2
    pcm = pc2d(m0, C2, hbr)
    if risk is not None and pcm > 0:
        hbr_eff = hbr * np.sqrt(10 ** risk / pcm)
    else:
        hbr_eff = hbr
    cross = float(np.degrees(np.arccos(np.clip(np.array([0, v_t, 0]).dot(vc) / (v_t * np.linalg.norm(vc)), -1, 1))))
    evals, evecs = np.linalg.eigh(C2)
    return Encounter(a_km=a_km, n=n, v_t=v_t, lead_s=None if tca is None else tca * 86400, risk=risk, miss=miss,
                     r_rel=r_rel, v_rel=v_rel, P=P, C2=C2, m0=m0, hbr_span=hbr, pc_model=pcm, hbr_eff=hbr_eff,
                     cross_deg=cross, evals=evals, evecs=evecs)


def search(enc, lead_s, pc_max, miss_min, dirs=DIRS, dvs=DVS_MM_S):
    """Smallest Δv (mm/s) on the grid that brings Pc under pc_max and miss over miss_min.

    Among directions that work at that Δv, the one with the lowest Pc wins (first in grid order on ties).
    Returns (dv_mm_s, alpha, beta, pc, miss, displacement_rtn, m2) or None.
    """
    for dv_mm in dvs:
        best = None
        for (a, b) in dirs:
            d = cw_disp(direction(a, b) * dv_mm / 1000, enc.n, lead_s)
            m2 = enc.P @ (enc.r_rel - d)
            miss = float(np.linalg.norm(m2))
            pc = pc2d(m2, enc.C2, enc.hbr_eff)
            if pc < pc_max and miss > miss_min and (best is None or pc < best[3]):
                best = (float(dv_mm), a, b, float(pc), miss, d, m2)
        if best:
            return best
    return None


def burn_option(enc, key, res, lead_s):
    """One option in the replay.json `opts` shape."""
    dv, al, be, pc, miss, d, m2 = res
    return {"key": key, "feasible": True, "dv": dv, "alpha": al, "beta": be, "leadH": round(float(lead_s) / 3600, 1),
            "pcAfter": float(f"{pc:.3g}"), "missAfter": round(miss),
            "dR": round(float(d[0])), "dT": round(float(d[1])), "dN": round(float(d[2])),
            "burnS": round(MASS_KG * dv / 1000 / THRUST_N, 1),
            "propG": round(float(MASS_KG * (1 - np.exp(-dv / 1000 / (ISP_S * G0))) * 1000), 2),
            "dA": round(float(2 * enc.a_km * 1000 * (dv / 1000) * np.cos(np.radians(al)) * np.cos(np.radians(be)) / enc.v_t), 1),
            "m2After": [round(float(x)) for x in m2]}


def burn_options(enc, dirs=DIRS, dvs=DVS_MM_S, robust_miss_m=None):
    """coa1, coa2 and coa3 for an encounter, plus coa4 (Robust) when robust_miss_m is above 1 km.

    coa4 burns now, like coa1, but sizes the burn so the forecast's 10th-percentile miss stays at or
    above 1 km. Options with no solution on the grid, or under 3 h lead, are left out.
    """
    targets = list(COA_TARGETS)
    if robust_miss_m and robust_miss_m > MISS_ACTION_M:
        targets.append(("coa4", 0, PC_ACTION, float(robust_miss_m)))
    opts = []
    for key, offset, pc_max, miss_min in targets:
        lead_s = enc.lead_s + offset
        if lead_s < MIN_LEAD_S:
            continue
        res = search(enc, lead_s, pc_max, miss_min, dirs, dvs)
        if res:
            opts.append(burn_option(enc, key, res, lead_s))
    return opts


def wait_envelope(enc):
    """Lowest Δv (mm/s) that meets the action limits if the burn happens anywhere in each 6 h window.

    Returns [[hours after the CDM, dv or None]]; None means over 80 mm/s. Orbital phase matters, so
    burn time is sampled every 20 min inside the window, over 24 in-plane directions.
    """
    ci = np.linalg.inv(enc.C2)
    kk = enc.hbr_eff ** 2 / (2 * np.sqrt(np.linalg.det(enc.C2)))
    dvs = DVS_MM_S / 1000.0
    lead = enc.lead_s
    wait, win_h = [], 0
    while lead - win_h * 3600 >= MIN_LEAD_S and len(wait) < WAIT_MAX_WINDOWS:
        best = None
        for sub in range(0, WAIT_STEP_H * 60, WAIT_SUB_MIN):
            ld = lead - win_h * 3600 - sub * 60
            if ld < MIN_LEAD_S:
                break
            for a in range(0, 360, WAIT_DIR_DEG):
                pd_ = enc.P @ cw_disp(direction(a, 0), enc.n, ld)
                m2s = enc.m0[None, :] - dvs[:, None] * pd_[None, :]
                q = np.einsum("ij,jk,ik->i", m2s, ci, m2s)
                ok = np.where((kk * np.exp(-0.5 * q) < PC_ACTION) & (np.linalg.norm(m2s, axis=1) > MISS_ACTION_M))[0]
                if len(ok) and (best is None or DVS_MM_S[ok[0]] < best):
                    best = float(DVS_MM_S[ok[0]])
        wait.append([win_h, best])
        win_h += WAIT_STEP_H
    return wait


def coa_entry(cdm, robust_miss_m=None):
    """The replay.json `coa` entry for one CDM with Pc >= 1e-4 and at least 3 h to closest approach."""
    enc = encounter(cdm)
    wait = wait_envelope(enc)
    return {"wait": wait, "risk": round(float(enc.risk), 2), "miss": round(float(enc.miss)),
            "tca": round(float(cdm["time_to_tca"]), 2), "relSpeed": round(float(np.linalg.norm(enc.v_rel)) / 1000, 2),
            "crossDeg": round(enc.cross_deg, 1), "altKm": round(float(enc.a_km - R_EARTH_KM)),
            "m2": [round(float(x)) for x in enc.m0], "ell": enc.ell,
            "hbrEff": round(float(enc.hbr_eff), 2), "pcModelOk": enc.pc_model_ok,
            "robustMissM": round(float(robust_miss_m or MISS_ACTION_M)),
            "opts": burn_options(enc, robust_miss_m=robust_miss_m)}


def pc_from_cdm(cdm):
    """Encounter-plane Pc for one CDM.

    Returns log10Pc (span hard-body radius, floored at -30), missM (encounter-plane miss, m),
    m2 (miss vector, m), ell (combined 1-sigma ellipse), hbr (m) and model.
    """
    enc = encounter(cdm)
    return {"log10Pc": round(enc.log10_pc_model, 3), "missM": round(float(np.linalg.norm(enc.m0)), 1),
            "m2": [round(float(x)) for x in enc.m0], "ell": enc.ell, "hbr": round(float(enc.hbr_span), 2),
            "model": "encounter-plane"}


def plan_burns(cdm, budget_mm_s=10.0, robust_miss_m=None):
    """Burn options and cost-of-waiting envelope for one CDM, in the replay.json shapes.

    The search runs to 80 mm/s like the replay. An option is `feasible` when its Δv is within
    budget_mm_s; pass None to mark every found option feasible. Options with no solution under
    80 mm/s, or under 3 h lead, are left out. If the CDM has `risk`, after-burn Pc uses the
    hard-body radius calibrated to ESA's Pc; otherwise the span radius.
    """
    if _get(cdm, "time_to_tca") is None:
        raise ValueError("CDM is missing time_to_tca")
    enc = encounter(cdm)
    opts = burn_options(enc, robust_miss_m=robust_miss_m)
    if budget_mm_s is not None:
        for o in opts:
            o["feasible"] = bool(o["dv"] <= budget_mm_s)
    return {"opts": opts, "wait": wait_envelope(enc)}


def two_body_displacement(a_km, dv_rtn, t_s, dt=5.0):
    """RTN displacement (m) t_s seconds after an impulse dv_rtn (m/s) on a circular two-body orbit, by RK4.

    Used to check the Clohessy-Wiltshire response; returns the displacement in the reference orbit's RTN frame.
    """
    mu = MU_KM3_S2 * 1e9

    def f(s):
        r = s[:3]
        return np.concatenate([s[3:], -mu * r / np.linalg.norm(r) ** 3])

    def step(s, h):
        k1 = f(s)
        k2 = f(s + h / 2 * k1)
        k3 = f(s + h / 2 * k2)
        k4 = f(s + h * k3)
        return s + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)

    a = a_km * 1000
    ref = np.array([a, 0, 0, 0, np.sqrt(mu / a), 0.0])
    bur = ref.copy()
    bur[3:] += np.asarray(dv_rtn, dtype=float)  # at t0 the inertial x, y, z axes are R, T, N
    steps = int(np.ceil(t_s / dt))
    h = t_s / steps
    for _ in range(steps):
        ref, bur = step(ref, h), step(bur, h)
    r, v = ref[:3], ref[3:]
    rhat = r / np.linalg.norm(r)
    nhat = np.cross(r, v)
    nhat /= np.linalg.norm(nhat)
    that = np.cross(nhat, rhat)
    d = bur[:3] - ref[:3]
    return np.array([d.dot(rhat), d.dot(that), d.dot(nhat)])
