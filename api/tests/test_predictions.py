import csv
from collections import Counter

import pytest

from .conftest import ARTIFACTS_DIR

with (ARTIFACTS_DIR / "test_predictions.csv").open(newline="") as fh:
    reader = csv.DictReader(fh)
    COLUMNS = reader.fieldnames
    CSV_ROWS = list(reader)


def test_default_page(client):
    r = client.get("/api/predictions")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == len(CSV_ROWS) == 24484
    assert len(body["rows"]) == 100
    assert [row["row"] for row in body["rows"]] == list(range(100))


def test_rows_carry_the_csv_columns_and_values(client):
    first = client.get("/api/predictions", params={"limit": 1}).json()["rows"][0]
    assert list(first) == COLUMNS
    expected = CSV_ROWS[0]
    assert first["event_id"] == int(expected["event_id"])
    assert first["pred_tier"] == expected["pred_tier"]
    assert first["reason"] == expected["reason"]
    for column in ("time_to_tca", "miss_distance_m", "pred_log10_pc", "p_pc_below_1e-6", "p_pc_1e-6_to_1e-4", "p_pc_at_least_1e-4"):
        assert first[column] == pytest.approx(float(expected[column]))


def test_filter_by_event_id(client):
    event_id = int(CSV_ROWS[-1]["event_id"])
    expected = [int(r["row"]) for r in CSV_ROWS if int(r["event_id"]) == event_id]
    body = client.get("/api/predictions", params={"event_id": event_id}).json()
    assert body["total"] == len(expected) > 0
    assert [row["row"] for row in body["rows"]] == expected
    assert {row["event_id"] for row in body["rows"]} == {event_id}


@pytest.mark.parametrize("tier", ["Safe", "Elevated", "Critical"])
def test_filter_by_tier(client, tier):
    counts = Counter(r["pred_tier"] for r in CSV_ROWS)
    body = client.get("/api/predictions", params={"tier": tier, "limit": 1000}).json()
    assert body["total"] == counts[tier] > 0
    assert {row["pred_tier"] for row in body["rows"]} == {tier}


def test_filter_by_event_id_and_tier(client):
    pairs = Counter((int(r["event_id"]), r["pred_tier"]) for r in CSV_ROWS)
    event_id = next(e for (e, t) in pairs if t == "Critical" and any(t2 != "Critical" for (e2, t2) in pairs if e2 == e))
    body = client.get("/api/predictions", params={"event_id": event_id, "tier": "Critical"}).json()
    assert body["total"] == pairs[(event_id, "Critical")]
    assert all(row["event_id"] == event_id and row["pred_tier"] == "Critical" for row in body["rows"])


def test_unknown_event_returns_empty_page(client):
    assert client.get("/api/predictions", params={"event_id": 999999}).json() == {"total": 0, "rows": []}


def test_pagination(client):
    page = client.get("/api/predictions", params={"tier": "Critical", "limit": 7, "offset": 21}).json()
    critical = [int(r["row"]) for r in CSV_ROWS if r["pred_tier"] == "Critical"]
    assert page["total"] == len(critical)
    assert [row["row"] for row in page["rows"]] == critical[21:28]


def test_limit_upper_bound_is_1000(client):
    assert len(client.get("/api/predictions", params={"limit": 1000}).json()["rows"]) == 1000


def test_offset_past_the_end(client):
    body = client.get("/api/predictions", params={"offset": len(CSV_ROWS)}).json()
    assert body == {"total": len(CSV_ROWS), "rows": []}


def test_last_partial_page(client):
    body = client.get("/api/predictions", params={"offset": len(CSV_ROWS) - 3, "limit": 10}).json()
    assert [row["row"] for row in body["rows"]] == [len(CSV_ROWS) - 3, len(CSV_ROWS) - 2, len(CSV_ROWS) - 1]


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 1001},
        {"limit": "ten"},
        {"offset": -1},
        {"offset": "x"},
        {"event_id": -1},
        {"event_id": "abc"},
        {"tier": "critical"},
        {"tier": "Unknown"},
    ],
)
def test_bad_parameters_are_422(client, params):
    r = client.get("/api/predictions", params=params)
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["query", next(iter(params))]
