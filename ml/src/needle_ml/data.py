"""Loading the ESA Kelvins CSVs and the column lists each model may use."""
import os
from pathlib import Path

import pandas as pd

DATA_ENV = "NEEDLE_DATA_DIR"
TRAIN_FILE = "train_data.csv"
TEST_FILE = "test_data.csv"

# The brief's simplified list. The scored classifier may read nothing else.
ALLOWED = ("event_id", "time_to_tca", "miss_distance", "relative_speed", "relative_position_r",
           "relative_position_t", "relative_position_n", "c_object_type", "c_sigma_r", "t_sigma_r",
           "max_risk_estimate", "F10", "AP")

# Full-CDM columns for the physics Pc and burn planner (labelled as the physics model in the UI).
PHYSICS = ("time_to_tca", "risk", "miss_distance",
           "relative_position_r", "relative_position_t", "relative_position_n",
           "relative_velocity_r", "relative_velocity_t", "relative_velocity_n",
           "t_j2k_sma", "t_span", "c_span",
           "t_sigma_r", "t_sigma_t", "t_sigma_n", "t_ct_r", "t_cn_r", "t_cn_t",
           "c_sigma_r", "c_sigma_t", "c_sigma_n", "c_ct_r", "c_cn_r", "c_cn_t")

# Extra descriptive columns for fleet.json and replay.json.
FLEET = ("mission_id", "c_object_type", "t_j2k_inc", "c_j2k_inc", "t_h_apo", "t_h_per", "c_h_apo", "c_h_per")

BUILD_COLUMNS = tuple(dict.fromkeys(ALLOWED + ("risk", "mission_id") + PHYSICS + FLEET))


def data_dir(path=None):
    """Resolve the CSV folder from an explicit path or NEEDLE_DATA_DIR."""
    p = path or os.environ.get(DATA_ENV)
    if not p:
        raise FileNotFoundError(f"no data folder: pass --data or set {DATA_ENV}")
    p = Path(p).expanduser()
    missing = [f for f in (TRAIN_FILE, TEST_FILE) if not (p / f).is_file()]
    if missing:
        raise FileNotFoundError(f"{p} is missing {', '.join(missing)}")
    return p


def load(path, name, columns=BUILD_COLUMNS):
    """Read train or test with only the columns needed. Row order is the CSV order."""
    file = TRAIN_FILE if name == "train" else TEST_FILE
    return pd.read_csv(Path(path) / file, usecols=list(columns))


def latest_cdm(df):
    """Latest CDM per event (smallest time_to_tca), indexed by event_id, as the legacy scripts did."""
    return df.sort_values("time_to_tca").groupby("event_id").first()
