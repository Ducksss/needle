import numpy as np
import pytest

from needle_ml.tiers import bucket, miss_band, pc_band, tier

FAR = 50_000.0  # miss that never raises the tier
EPS = 1e-9


@pytest.mark.parametrize("log_pc, band", [
    (np.log10(1e-6) - EPS, 0),
    (np.log10(1e-6), 1),   # Pc = 1e-6 is Elevated
    (np.log10(1e-4) - EPS, 1),
    (np.log10(1e-4), 2),   # Pc = 1e-4 is Critical
    (-30.0, 0),
    (0.0, 2),
])
def test_pc_band_boundaries(log_pc, band):
    assert pc_band(log_pc) == band


@pytest.mark.parametrize("miss, band", [
    (1000.0 - EPS, 2),
    (1000.0, 1),           # 1 km exactly is Elevated, Critical needs under 1 km
    (5000.0, 1),           # 5 km exactly is Elevated, Safe needs over 5 km
    (5000.0 + EPS, 0),
    (0.0, 2),
])
def test_miss_band_boundaries(miss, band):
    assert miss_band(miss) == band


@pytest.mark.parametrize("log_pc, miss, expected", [
    (-7.0, 5000.0 + EPS, "Safe"),
    (-6.0, FAR, "Elevated"),
    (-6.0 - EPS, FAR, "Safe"),
    (-4.0, FAR, "Critical"),
    (-4.0 - EPS, FAR, "Elevated"),
    (-7.0, 1000.0, "Elevated"),
    (-7.0, 1000.0 - EPS, "Critical"),
    (-7.0, 5000.0, "Elevated"),
    (-5.0, 999.0, "Critical"),    # the higher of the two bands wins
    (-3.0, 3000.0, "Critical"),
])
def test_tier_takes_the_higher_band(log_pc, miss, expected):
    assert tier(log_pc, miss) == expected


def test_tier_vectorised():
    out = tier(np.array([-7.0, -5.0, -4.0]), np.array([6000.0, 6000.0, 6000.0]))
    assert out.tolist() == ["Safe", "Elevated", "Critical"]


@pytest.mark.parametrize("log_pc, miss, expected", [
    (-4.0, 500.0, "pc"),
    (-4.0, 9000.0, "pc"),
    (-6.0, 5000.0 + EPS, "hidden"),
    (-6.0, 5000.0, "none"),
    (-6.0 - EPS, 9000.0, "none"),
    (-4.0 - EPS, 1000.0 - EPS, "distance"),
    (-4.0 - EPS, 1000.0, "none"),
])
def test_bucket_boundaries(log_pc, miss, expected):
    assert bucket(log_pc, miss) == expected
