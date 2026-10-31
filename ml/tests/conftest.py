import os
from pathlib import Path

import pytest

from needle_ml import data

REPO = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(os.environ.get("NEEDLE_ARTIFACTS_DIR", REPO / "artifacts"))

# A made-up CDM with plausible values, for tests that must run without the ESA CSVs.
SYNTHETIC_CDM = {
    "time_to_tca": 2.0, "risk": -3.5, "miss_distance": 300.0,
    "relative_position_r": 20.0, "relative_position_t": -50.0, "relative_position_n": -295.0,
    "relative_velocity_r": -5.0, "relative_velocity_t": -9000.0, "relative_velocity_n": 11000.0,
    "t_j2k_sma": 7000.0, "t_span": 5.0, "c_span": 2.0,
    "t_sigma_r": 10.0, "t_sigma_t": 300.0, "t_sigma_n": 8.0, "t_ct_r": 0.1, "t_cn_r": 0.0, "t_cn_t": -0.05,
    "c_sigma_r": 50.0, "c_sigma_t": 2000.0, "c_sigma_n": 30.0, "c_ct_r": 0.2, "c_cn_r": 0.0, "c_cn_t": 0.0,
}


@pytest.fixture(scope="session")
def data_path():
    p = os.environ.get(data.DATA_ENV)
    if not p:
        pytest.skip(f"{data.DATA_ENV} is not set")
    try:
        return data.data_dir(p)
    except FileNotFoundError as e:
        pytest.skip(str(e))


@pytest.fixture(scope="session")
def test_df(data_path):
    return data.load(data_path, "test")


@pytest.fixture(scope="session")
def train_df(data_path):
    return data.load(data_path, "train")


@pytest.fixture
def cdm():
    return dict(SYNTHETIC_CDM)
