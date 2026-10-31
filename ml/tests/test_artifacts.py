"""The committed artifacts match contracts/README.md, and the builders reproduce them."""
import json

import numpy as np
import pandas as pd
import pytest

from conftest import ARTIFACTS
from needle_ml import fleet, replay
from shapes import (COA_KEYS, MISSION_KEYS, PC_EVENT_KEYS, PREDICTION_COLUMNS, REPLAY_EVENT_KEYS, REPLAY_KEYS,
                    check_ell, check_opt, check_wait)


def load(name):
    path = ARTIFACTS / name
    if not path.is_file():
        pytest.skip(f"{path} not built")
    return json.loads(path.read_text()) if name.endswith(".json") else pd.read_csv(path)


@pytest.fixture(scope="module")
def fleet_json():
    return load("fleet.json")


@pytest.fixture(scope="module")
def replay_json():
    return load("replay.json")


def test_fleet_shape(fleet_json):
    assert set(fleet_json) == {"missions", "dots", "pcEvents"}
    missions = fleet_json["missions"]
    assert [m["label"] for m in missions] == [f"ESA-{i + 1:02d}" for i in range(len(missions))]
    for m in missions:
        assert set(m) == MISSION_KEYS
        assert m["critical"] + m["elevated"] + m["safe"] == m["evTest"]
    for d in fleet_json["dots"]:
        assert len(d) == 5 and 0 <= d[0] < len(missions) and d[3] in (0, 1, 2, 3)
    assert sum(1 for d in fleet_json["dots"] if d[3] == 3) == len(fleet_json["pcEvents"])
    for e in fleet_json["pcEvents"]:
        assert set(e) == PC_EVENT_KEYS and e["risk"] >= -4


def test_replay_shape(replay_json):
    assert set(replay_json) == REPLAY_KEYS
    assert (replay_json["runs"], replay_json["runH"], replay_json["windowH"]) == (64, 8, 504)
    n_missions = len(load("fleet.json")["missions"])
    tcas = [e["tca"] for e in replay_json["events"]]
    assert tcas == sorted(tcas)
    for e in replay_json["events"]:
        assert set(e) == REPLAY_EVENT_KEYS and 0 <= e["mi"] < n_missions
        arrivals = [m[0] for m in e["m"]]
        assert all(len(m) == 3 for m in e["m"]) and arrivals == sorted(arrivals)
        assert len(e["rtn"]) == len(e["m"]) and all(len(p) == 3 for p in e["rtn"])
        for k, c in e["coa"].items():
            assert 0 <= int(k) < len(e["m"]) and e["m"][int(k)][1] >= -4
            assert set(c) == COA_KEYS and c["opts"]
            check_ell(c["ell"])
            check_wait(c["wait"])
            for o in c["opts"]:
                check_opt(o)


def test_replay_facts(replay_json):
    s = replay.summary(replay_json)
    assert (s["events"], s["escalated"], s["coaMessages"], s["pcModelWithin01"]) == (280, 24, 119, 106)
    assert s["medianWaitRatio24h"] == 1.25


def test_predictions_shape():
    df = load("test_predictions.csv")
    assert list(df.columns) == PREDICTION_COLUMNS
    assert (df.row.values == np.arange(len(df))).all()
    assert set(df.pred_tier) <= {"Safe", "Elevated", "Critical"}
    p = df[["p_pc_below_1e-6", "p_pc_1e-6_to_1e-4", "p_pc_at_least_1e-4"]].sum(axis=1)
    assert np.allclose(p, 1, atol=2e-4)
    assert (df.loc[df.miss_distance_m < 1000, "pred_tier"] == "Critical").all()


def test_metrics_shape_and_facts():
    m = load("metrics.json")
    assert {"generatedAt", "test", "physics", "replay"} <= set(m)
    methods = {x["name"]: x for x in m["test"]["methods"]}
    shipped = methods["Needle classifier + miss"]
    assert {"accuracy", "macroF1", "criticalRecall", "criticalPrecision", "confusion"} <= set(shipped)
    assert np.array(shipped["confusion"]).sum() == m["test"]["rows"]
    legacy = next(v for k, v in methods.items() if "legacy grid" in k)
    assert (round(legacy["accuracy"], 3), round(legacy["macroF1"], 3), round(legacy["criticalRecall"], 3)) == (0.971, 0.972, 0.993)
    assert methods["Miss-distance rule only"]["accuracy"] == pytest.approx(0.954, abs=5e-4)
    assert (m["physics"]["pcEvents"], m["physics"]["within002"]) == (23, 20)
    assert m["replay"]["events"] == 280 and m["replay"]["medianWaitRatio24h"] == 1.25


def test_fleet_build_matches_artifact(train_df, test_df, fleet_json):
    assert fleet.build(train_df, test_df) == fleet_json


def test_replay_event_choice_is_seeded(train_df):
    a, _ = replay.choose_events(train_df, np.random.default_rng(replay.SEED))
    b, _ = replay.choose_events(train_df, np.random.default_rng(replay.SEED))
    assert a == b and len(a) == replay.N_EVENTS == len(set(a))
