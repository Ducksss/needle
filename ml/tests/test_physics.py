import json

import numpy as np
import pytest

from needle_ml import data, physics
from needle_ml.physics import (GRID, MU_KM3_S2, coa_entry, cw_disp, encounter, pc2d, pc_from_cdm, plan_burns,
                               search, two_body_displacement)
from shapes import PC_KEYS, check_ell, check_opt, check_wait


def test_cw_matches_two_body_for_7_mm_s_burn_two_days_out():
    a_km, t = 7070.0, 2 * 86400.0
    dv = np.array([0.0, -0.007, 0.0])  # 7 mm/s retrograde
    n = np.sqrt(MU_KM3_S2 / a_km ** 3)
    cw = cw_disp(dv, n, t)
    num = two_body_displacement(a_km, dv, t)
    assert abs(cw[1]) > 3000  # a retrograde burn moves the satellite ahead along-track by kilometres
    assert np.linalg.norm(num - cw) / np.linalg.norm(num) < 0.01
    assert abs(num[1] - cw[1]) / abs(num[1]) < 0.01


def test_pc2d_matches_numerical_integration():
    m2 = np.array([30.0, -120.0])
    c2 = np.array([[900.0, 300.0], [300.0, 40000.0]])
    hbr = 5.0
    # integrate the 2D Gaussian over the hard-body disk on a fine grid
    g = np.linspace(-hbr, hbr, 801)
    x, y = np.meshgrid(g, g)
    inside = x ** 2 + y ** 2 <= hbr ** 2
    d = np.stack([x - m2[0], y - m2[1]], axis=-1)
    q = np.einsum("...i,ij,...j->...", d, np.linalg.inv(c2), d)
    dens = np.exp(-0.5 * q) / (2 * np.pi * np.sqrt(np.linalg.det(c2)))
    exact = (dens * inside).sum() * (g[1] - g[0]) ** 2
    # pc2d is the small-hard-body form: disk area times the density at the miss point
    assert pc2d(m2, c2, hbr) == pytest.approx(exact, rel=0.01)


def test_pc_from_cdm_shape(cdm):
    out = pc_from_cdm(cdm)
    assert set(out) == PC_KEYS
    assert out["model"] == "encounter-plane"
    assert out["hbr"] == pytest.approx((cdm["t_span"] + cdm["c_span"]) / 2)
    assert len(out["m2"]) == 2
    check_ell(out["ell"])
    json.dumps(out)


def test_pc_from_cdm_without_risk_uses_span_radius(cdm):
    with_risk = pc_from_cdm(cdm)
    del cdm["risk"]
    assert pc_from_cdm(cdm) == with_risk


def test_missing_columns_raise(cdm):
    del cdm["c_sigma_t"]
    with pytest.raises(ValueError, match="c_sigma_t"):
        pc_from_cdm(cdm)


def test_plan_burns_shape_and_budget(cdm):
    out = plan_burns(cdm, budget_mm_s=5.0)
    assert set(out) == {"opts", "wait"}
    assert [o["key"] for o in out["opts"]] == ["coa1", "coa2", "coa3"]
    for o in out["opts"]:
        check_opt(o)
        assert o["feasible"] == (o["dv"] <= 5.0)
    assert out["opts"][1]["pcAfter"] < 1e-6 and out["opts"][1]["missAfter"] > 2000
    assert out["opts"][2]["leadH"] == pytest.approx(out["opts"][0]["leadH"] - 24)
    check_wait(out["wait"])
    json.dumps(out)
    assert all(o["feasible"] for o in plan_burns(cdm, budget_mm_s=None)["opts"])


def test_plan_burns_skips_options_under_3_hours(cdm):
    cdm["time_to_tca"] = 2.5 / 24
    assert plan_burns(cdm) == {"opts": [], "wait": []}


def test_ellipse_survives_the_wait_loop(cdm):
    # legacy trap: the wait loop once reused `w`, which held the covariance eigenvalues
    entry = coa_entry(cdm)
    assert entry["ell"] == pc_from_cdm(cdm)["ell"]
    check_wait(entry["wait"])


def test_wait_starts_at_the_recommended_dv_or_lower(cdm):
    out = plan_burns(cdm)
    coa1 = out["opts"][0]["dv"]
    # the envelope samples more burn times and directions, so it can only match or beat coa1
    assert out["wait"][0][1] <= coa1


@pytest.fixture(scope="module")
def pc_events(test_df):
    last = data.latest_cdm(test_df)
    return last[last.risk >= -4].sort_values("risk", ascending=False)


def test_physics_pc_reproduces_esa_risk(pc_events):
    assert len(pc_events) == 23
    err = np.array([np.log10(encounter(r).pc_model) - r.risk for _, r in pc_events.iterrows()])
    assert (np.abs(err) < 0.1).sum() >= 18


def test_event_891_burn(pc_events):
    r = pc_events.loc[891]
    enc = encounter(r)
    dv, alpha, beta, pc, miss, _, _ = search(enc, r.time_to_tca * 86400, 1e-4, 1000, dirs=GRID,
                                             dvs=np.arange(0.5, 60.01, 0.5))
    assert (dv, alpha, beta) == (7.0, 180, 0)  # 7.0 mm/s retrograde
    assert miss == pytest.approx(1056, abs=1)
    assert pc == pytest.approx(9.1e-5, rel=0.01)


def test_physics_imports_only_numpy():
    import subprocess
    import sys
    code = f"import sys; import {physics.__name__}; print('pandas' in sys.modules or 'sklearn' in sys.modules)"
    assert subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True).stdout.strip() == "False"
