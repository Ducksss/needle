"""Key sets from contracts/README.md, shared by the shape tests."""

MISSION_KEYS = {"mid", "label", "alt", "inc", "evTrain", "evTest", "pc", "hidden", "distance",
                "critical", "elevated", "safe", "topId", "topRisk", "topMiss"}
PC_EVENT_KEYS = {"id", "sat", "obj", "risk", "miss", "tca", "speed", "r", "t", "n", "sr", "st", "sn"}

REPLAY_KEYS = {"runs", "runH", "windowH", "note", "events"}
REPLAY_EVENT_KEYS = {"id", "sat", "mi", "obj", "inc", "tca", "m", "rtn", "coa"}
COA_KEYS = {"risk", "miss", "tca", "relSpeed", "crossDeg", "altKm", "m2", "ell", "hbrEff", "pcModelOk", "robustMissM",
            "wait", "opts"}
ELL_KEYS = {"a", "b", "deg"}
OPT_KEYS = {"key", "feasible", "dv", "alpha", "beta", "leadH", "pcAfter", "missAfter",
            "dR", "dT", "dN", "burnS", "propG", "dA", "m2After"}
OPT_NAMES = {"coa1", "coa2", "coa3", "coa4"}

PREDICTION_COLUMNS = ["row", "event_id", "time_to_tca", "miss_distance_m", "pred_log10_pc",
                      "p_pc_below_1e-6", "p_pc_1e-6_to_1e-4", "p_pc_at_least_1e-4", "pred_tier", "reason"]

PC_KEYS = {"log10Pc", "missM", "m2", "ell", "hbr", "model"}


def check_ell(ell):
    assert set(ell) == ELL_KEYS
    assert ell["a"] >= ell["b"] > 0


def check_wait(wait):
    assert wait, "wait envelope is empty"
    hours = [h for h, _ in wait]
    assert hours == list(range(0, 6 * len(wait), 6))
    for _, dv in wait:
        assert dv is None or 0 < dv <= 80


def check_opt(opt):
    assert set(opt) == OPT_KEYS
    assert opt["key"] in OPT_NAMES
    assert isinstance(opt["feasible"], bool)
    # pcAfter is rounded to 3 significant figures, so 9.9996e-5 is stored as 1e-4
    assert opt["pcAfter"] <= 1e-4 and opt["missAfter"] >= 1000
    assert len(opt["m2After"]) == 2
