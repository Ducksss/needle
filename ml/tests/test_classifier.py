import re

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold

from conftest import REPO
from needle_ml.classifier import LEGACY_GRID, WIDE_GRID, features, new_classifier, select_thresholds
from needle_ml.data import ALLOWED
from needle_ml.tiers import miss_band, pc_band


def synthetic_rows(n=200, seed=0):
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        "event_id": np.repeat(np.arange(n // 10), 10), "time_to_tca": rng.uniform(2, 7, n),
        "miss_distance": rng.uniform(10, 50_000, n), "relative_speed": rng.uniform(100, 15_000, n),
        "relative_position_r": rng.normal(0, 200, n), "relative_position_t": rng.normal(0, 5000, n),
        "relative_position_n": rng.normal(0, 5000, n),
        "c_object_type": rng.choice(["DEBRIS", "PAYLOAD", "UNKNOWN", "ROCKET BODY", "TBA"], n),
        "c_sigma_r": rng.uniform(1, 500, n), "t_sigma_r": rng.uniform(1, 50, n),
        "max_risk_estimate": rng.uniform(-20, -2, n), "F10": rng.uniform(70, 200, n), "AP": rng.uniform(0, 30, n),
    })


def test_allowed_list_matches_agents_md():
    agents = REPO / "AGENTS.md"
    if not agents.is_file():
        pytest.skip("AGENTS.md not found")
    line = next(x for x in agents.read_text().splitlines() if "for the scored model" in x)
    listed = re.findall(r"\b[A-Za-z0-9_]+\b", line.split("scored model:", 1)[1].split(". The physics")[0])
    assert set(listed) == set(ALLOWED)


def test_features_use_only_allowed_columns():
    df = synthetic_rows()
    x = features(df)
    assert len(x) == len(df) and np.isfinite(x.to_numpy(dtype=float)).all()
    # extra columns, including the label, are ignored
    leaky = df.assign(risk=-3.0, c_sigma_t=1.0, mahalanobis_distance=0.5)
    pd.testing.assert_frame_equal(features(leaky), x)
    assert "risk" not in x.columns
    # every raw column the model reads is on the allowed list
    raw = [c for c in x.columns if c in df.columns]
    assert set(raw) <= set(ALLOWED)
    with pytest.raises(KeyError):
        features(df.drop(columns=["max_risk_estimate"]))


def test_threshold_grids():
    assert max(LEGACY_GRID) == 0.8
    assert WIDE_GRID[0] == 0.3 and WIDE_GRID[-1] == 0.95 and len(WIDE_GRID) == 14
    assert set(LEGACY_GRID) <= set(WIDE_GRID)


def test_select_thresholds_prefers_first_best():
    p = np.array([[0.9, 0.05, 0.05], [0.1, 0.8, 0.1], [0.05, 0.1, 0.85]])
    y = np.array([0, 1, 2])
    (t1, t2), f = select_thresholds(p, y, np.zeros(3, dtype=int), LEGACY_GRID)
    assert f == 1.0 and (t1, t2) == (0.3, 0.3)


def test_grouped_cv_beats_miss_distance_rule(train_df):
    # a seeded 30% sample of events keeps this test to seconds; the build runs the full version
    events = train_df.event_id.unique()
    keep = np.random.default_rng(0).choice(events, size=int(0.3 * len(events)), replace=False)
    tr = train_df[train_df.event_id.isin(keep)].reset_index(drop=True)
    x, band, mband = features(tr), pc_band(tr.risk.values), miss_band(tr.miss_distance.values)
    y = np.maximum(band, mband)
    oof = np.zeros(len(tr), dtype=int)
    for k, (a, b) in enumerate(GroupKFold(5).split(x, band, tr.event_id.values)):
        assert not set(tr.event_id.values[a]) & set(tr.event_id.values[b])
        oof[b] = new_classifier(k, max_iter=150).fit(x.iloc[a], band[a]).predict(x.iloc[b])
    f_model = f1_score(y, np.maximum(oof, mband), average="macro")
    f_rule = f1_score(y, mband, average="macro")
    assert f_model > f_rule
