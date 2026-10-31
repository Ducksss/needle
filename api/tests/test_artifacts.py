import json
from pathlib import Path

import pytest

from needle_api.settings import load_settings

from .conftest import ARTIFACTS_DIR, FRONTEND_ORIGIN


def read_json(name: str):
    return json.loads((ARTIFACTS_DIR / name).read_text())


def test_health_reports_every_artifact_loaded(client, no_ml):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok",
        "artifacts": {"fleet": True, "replay": True, "metrics": True, "predictions": True},
        "errors": {},
        "ml": False,
    }


@pytest.mark.parametrize(("path", "filename"), [("/api/fleet", "fleet.json"), ("/api/replay", "replay.json"), ("/api/metrics", "metrics.json")])
def test_json_artifacts_are_served_unchanged(client, path, filename):
    r = client.get(path)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/json"
    assert r.json() == read_json(filename)


def test_fleet_shape(client):
    body = client.get("/api/fleet").json()
    assert len(body["missions"]) == 19
    assert [m["label"] for m in body["missions"]] == [f"ESA-{i:02d}" for i in range(1, 20)]
    assert all(len(dot) == 5 and dot[3] in (0, 1, 2, 3) for dot in body["dots"])
    assert {"id", "sat", "obj", "risk", "miss", "tca", "speed"} <= body["pcEvents"][0].keys()


def test_replay_shape(client):
    body = client.get("/api/replay").json()
    assert (body["runs"], body["runH"], body["windowH"]) == (64, 8, 504)
    assert len(body["events"]) == 280
    point = next(c for e in body["events"] for c in e["coa"].values())
    assert {o["key"] for o in point["opts"]} <= {"coa1", "coa2", "coa3"}
    assert all(len(w) == 2 for w in point["wait"])


def test_metrics_shape(client):
    body = client.get("/api/metrics").json()
    assert body["test"]["rows"] == 24484
    assert {m["name"] for m in body["test"]["methods"]} >= {"Needle classifier + miss", "Miss-distance rule only"}


def test_large_artifacts_are_gzipped(client):
    r = client.get("/api/replay", headers={"Accept-Encoding": "gzip"})
    assert r.headers["content-encoding"] == "gzip"


def test_missing_artifacts_degrade_and_return_503(make_client, tmp_path):
    client = make_client(tmp_path)
    health = client.get("/api/health").json()
    assert health["status"] == "degraded"
    assert health["artifacts"] == {"fleet": False, "replay": False, "metrics": False, "predictions": False}
    assert health["errors"]["fleet"] == "file not found"
    for path in ("/api/fleet", "/api/replay", "/api/metrics", "/api/predictions"):
        r = client.get(path)
        assert r.status_code == 503, path
        assert "is not loaded" in r.json()["detail"]


def test_artifact_that_breaks_the_contract_is_not_served(make_client, tmp_path):
    for name in ("replay.json", "metrics.json", "test_predictions.csv"):
        (tmp_path / name).write_bytes((ARTIFACTS_DIR / name).read_bytes())
    (tmp_path / "fleet.json").write_text(json.dumps({"missions": [], "dots": [[1, 2]], "pcEvents": []}))
    client = make_client(tmp_path)
    health = client.get("/api/health").json()
    assert health["artifacts"]["fleet"] is False
    assert health["artifacts"]["replay"] is True
    assert "does not match the contract at dots.0" in health["errors"]["fleet"]
    assert client.get("/api/fleet").status_code == 503


def test_cors_allows_the_frontend_origin(client):
    r = client.options(
        "/api/predictions",
        headers={"Origin": FRONTEND_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert client.get("/api/health", headers={"Origin": FRONTEND_ORIGIN}).headers["access-control-allow-origin"] == FRONTEND_ORIGIN


def test_cors_rejects_other_origins(client):
    r = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_settings_from_environment(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("NEEDLE_ARTIFACTS_DIR", "built")
    monkeypatch.setenv("NEEDLE_CORS_ORIGINS", "http://localhost:5173, https://needle.example ,")
    settings = load_settings()
    assert settings.artifacts_dir == (tmp_path / "built").resolve()
    assert settings.cors_origins == ("http://localhost:5173", "https://needle.example")


def test_settings_defaults(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("NEEDLE_ARTIFACTS_DIR", raising=False)
    monkeypatch.delenv("NEEDLE_CORS_ORIGINS", raising=False)
    settings = load_settings()
    assert settings.artifacts_dir == Path(tmp_path.parent / "artifacts").resolve()
    assert settings.cors_origins == ("http://localhost:5173",)
