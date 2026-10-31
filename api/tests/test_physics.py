import sys
import types

import pytest

from needle_api.physics import get_physics, to_plain

# Shape-valid CDM with ESA column names. Values are illustrative, not from the dataset.
CDM = {
    "time_to_tca": 2.18,
    "risk": -4.2,
    "miss_distance": 503.0,
    "relative_position_r": 37.0,
    "relative_position_t": -66.0,
    "relative_position_n": -497.0,
    "relative_velocity_r": -12.0,
    "relative_velocity_t": -10250.0,
    "relative_velocity_n": 10480.0,
    "t_j2k_sma": 7163.0,
    "t_span": 2.5,
    "c_span": 0.6,
    "t_sigma_r": 8.1,
    "t_sigma_t": 160.0,
    "t_sigma_n": 4.2,
    "t_ct_r": -0.4,
    "t_cn_r": 0.05,
    "t_cn_t": -0.02,
    "c_sigma_r": 25.4,
    "c_sigma_t": 2758.4,
    "c_sigma_n": 14.7,
    "c_ct_r": -0.9,
    "c_cn_r": 0.1,
    "c_cn_t": -0.1,
}

PC_RESULT = {
    "log10Pc": -4.05,
    "missM": 503.0,
    "m2": [-66.0, -497.0],
    "ell": {"a": 2760.1, "b": 26.3, "deg": 1.4},
    "hbr": 1.55,
    "model": "encounter-plane",
}

OPTION = {
    "key": "coa1", "feasible": True, "dv": 7.0, "alpha": 180, "beta": 0, "leadH": 52.3,
    "pcAfter": 9.1e-05, "missAfter": 1056, "dR": 3, "dT": 1040, "dN": 0,
    "burnS": 7.0, "propG": 3.24, "dA": -13.1, "m2After": [-70.0, -1056.0],
}


class FakeArray:
    """Stands in for a numpy array: only exposes tolist()."""

    def __init__(self, values):
        self.values = values

    def tolist(self):
        return list(self.values)


class FakePhysics:
    def __init__(self, error: Exception | None = None):
        self.calls = []
        self.error = error

    def pc_from_cdm(self, cdm):
        self.calls.append(("pc_from_cdm", cdm))
        if self.error:
            raise self.error
        return {**PC_RESULT, "m2": FakeArray(PC_RESULT["m2"])}

    def plan_burns(self, cdm, budget_mm_s=10.0):
        self.calls.append(("plan_burns", cdm, budget_mm_s))
        if self.error:
            raise self.error
        return {"opts": [OPTION], "wait": [[0, 7.0], [6, 7.5], [12, float("nan")]]}


@pytest.fixture
def fake(client):
    """Each test builds its own app, so the override does not leak between tests."""
    physics = FakePhysics()
    client.app.dependency_overrides[get_physics] = lambda: physics
    return physics


@pytest.mark.parametrize(("path", "body"), [("/api/pc", CDM), ("/api/coa", {"cdm": CDM})])
def test_503_when_ml_package_is_missing(client, no_ml, path, body):
    r = client.post(path, json=body)
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail.startswith("Physics model unavailable (ModuleNotFoundError")
    assert "uv pip install -e ../ml" in detail


def test_503_when_ml_package_lacks_the_contract_functions(client, monkeypatch):
    module = types.ModuleType("needle_ml.physics")
    module.pc_from_cdm = lambda cdm: PC_RESULT
    monkeypatch.setitem(sys.modules, "needle_ml", types.ModuleType("needle_ml"))
    monkeypatch.setitem(sys.modules, "needle_ml.physics", module)
    r = client.post("/api/pc", json=CDM)
    assert r.status_code == 503
    assert "needle_ml.physics has no plan_burns" in r.json()["detail"]
    assert client.get("/api/health").json()["ml"] is False


def test_health_reports_ml_when_importable(client, monkeypatch):
    module = types.ModuleType("needle_ml.physics")
    module.pc_from_cdm = FakePhysics().pc_from_cdm
    module.plan_burns = FakePhysics().plan_burns
    monkeypatch.setitem(sys.modules, "needle_ml", types.ModuleType("needle_ml"))
    monkeypatch.setitem(sys.modules, "needle_ml.physics", module)
    assert client.get("/api/health").json()["ml"] is True
    assert client.post("/api/pc", json=CDM).json() == PC_RESULT


def test_pc_with_fake(client, fake):
    r = client.post("/api/pc", json={**CDM, "c_object_type": "DEBRIS"})
    assert r.status_code == 200
    assert r.json() == PC_RESULT
    name, cdm = fake.calls[0]
    assert name == "pc_from_cdm"
    assert cdm == {**CDM, "c_object_type": "DEBRIS"}


def test_coa_with_fake(client, fake):
    r = client.post("/api/coa", json={"cdm": CDM, "budgetMmS": 25})
    assert r.status_code == 200
    assert r.json() == {"opts": [OPTION], "wait": [[0, 7.0], [6, 7.5], [12, None]]}
    assert fake.calls == [("plan_burns", CDM, 25.0)]


def test_coa_budget_defaults_to_10(client, fake):
    assert client.post("/api/coa", json={"cdm": CDM}).status_code == 200
    assert fake.calls[0][2] == 10.0


@pytest.mark.parametrize("budget", [0, -5, "lots"])
def test_coa_rejects_bad_budget(client, fake, budget):
    r = client.post("/api/coa", json={"cdm": CDM, "budgetMmS": budget})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "budgetMmS"]
    assert fake.calls == []


def test_pc_rejects_cdm_missing_a_contract_column(client, fake):
    cdm = {k: v for k, v in CDM.items() if k != "relative_velocity_t"}
    r = client.post("/api/pc", json=cdm)
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "relative_velocity_t"]
    assert fake.calls == []


def test_coa_rejects_cdm_missing_a_contract_column(client, fake):
    cdm = {k: v for k, v in CDM.items() if k != "c_sigma_t"}
    r = client.post("/api/coa", json={"cdm": cdm})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "cdm", "c_sigma_t"]


def test_physics_value_error_is_422(client):
    client.app.dependency_overrides[get_physics] = lambda: FakePhysics(ValueError("covariance is not positive definite"))
    r = client.post("/api/pc", json=CDM)
    assert r.status_code == 422
    assert "covariance is not positive definite" in r.json()["detail"]


def test_to_plain_converts_arrays_and_non_finite_floats():
    assert to_plain({"a": FakeArray([1.0, float("inf")]), "b": (1, float("nan")), "c": "x"}) == {"a": [1.0, None], "b": [1, None], "c": "x"}
