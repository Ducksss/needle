import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from needle_ml import forecast

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"


def toy_train():
    """Two lead bins worth of messages for 60 events whose miss shrinks by 10% at the end."""
    rows = []
    for eid in range(60):
        miss0 = 1500.0 + 5 * eid  # stays inside the 1 to 2 km bin
        for t in (2.5, 1.5, 0.2):
            miss = miss0 if t > 1 else miss0 * 0.9
            rows.append({"event_id": eid, "time_to_tca": t, "risk": -7.0, "miss_distance": miss})
    return pd.DataFrame(rows)


def test_samples_skip_the_final_message_and_keep_one_per_lead_bin():
    s = forecast.samples(toy_train())
    assert len(s) == 60 * 2 and (s.time_to_tca > 0.2).all()
    assert np.allclose(s.ratio, 0.9)


def test_table_shape_and_pooling():
    cells = forecast.table(forecast.samples(toy_train()))
    assert len(cells) == len(forecast.LEAD_EDGES_D) - 1
    assert all(len(row) == len(forecast.MISS_EDGES_M) - 1 for row in cells)
    c = cells[2][1]  # 2 to 3 days out, 1 to 2 km
    assert c["n"] == 60 and not c["pooled"] and c["ratioQ10"] == c["ratioQ90"] == 0.9


def test_pcrit_table_pools_sparse_cells_and_never_writes_nan():
    tab = forecast.pcrit_table(forecast.samples(toy_train()))
    assert len(tab) == 3 and len(tab[0]) == len(forecast.LEAD_EDGES_D) - 1
    c = tab[0][2][1]  # Pc below 1e-6, 2 to 3 days out, 1 to 2 km
    assert c == {"p": 0.0, "n": 60, "pooledOver": "lead and miss"}
    assert tab[2][2][1] == {"p": None, "n": 0, "pooledOver": "Pc band"}


def test_pc_forecast_bins_and_table():
    assert list(forecast._pc_fc_bin([-30, -12, -8, -5, -3])) == [0, 1, 2, 3, 4]
    tab = forecast.pc_table(forecast.samples(toy_train()))
    assert len(tab) == 5 and all(len(row) == len(forecast.LEAD_EDGES_D) - 1 for row in tab)
    c = tab[2][2]  # Pc 1e-10 to 1e-6 (toy risk -7), 2 to 3 days out
    assert c["n"] == 60 and c["ceilingDelta"] == 0.0 and c["pFloor"] == 0.0 and c["pAtLeast1e4"] == 0.0


def test_robust_miss_grows_with_the_pessimistic_shrink():
    fc = {"cells": [[{}] * 4] * 5, "robustRatioQ10": [0.98, 0.9, 0.75, 0.64, 0.53]}
    near, mid, far = (forecast.robust_miss_m(fc, d) for d in (0.5, 2.5, 6.0))
    assert 1000 <= near < mid < far
    assert mid == 1330.0


def test_forecast_artifact():
    path = ARTIFACTS / "forecast.json"
    if not path.exists():
        pytest.skip("forecast.json not built yet")
    fc = json.loads(path.read_text())
    assert {"leadEdgesDays", "missEdgesM", "quantiles", "cells", "robustRatioQ10", "pCriticalByPc", "validation"} <= set(fc)
    for band in fc["pCriticalByPc"]:
        for row in band:
            for c in row:
                assert c["p"] is None or 0 <= c["p"] <= 1
    pv = fc["validation"]["pcForecast"]
    assert 0.85 <= pv["ceilingHeld"] <= 0.95
    assert abs(pv["pFloor"]["meanPredicted"] - pv["pFloor"]["observed"]) < 0.05
    assert len(fc["pcForecast"]["cells"]) == 5
    v = fc["validation"]["pCritical"]
    assert v["brier"] < v["brierBaseRate"]
    for row in fc["cells"]:
        for c in row:
            assert c["ratioQ10"] <= c["ratioQ50"] <= c["ratioQ90"]
            assert 0 <= c["pUnder1km"] <= 1 and 0 <= c["pCritical"] <= 1
    assert 0.75 <= fc["validation"]["coverage10to90"] <= 0.85
    assert fc["excludedReplayEvents"] == 280
