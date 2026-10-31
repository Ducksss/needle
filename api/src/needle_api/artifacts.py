"""Load the files in artifacts/ once at startup and validate them against the contract."""

import csv
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ValidationError

from .schemas import Fleet, Metrics, PredictionRow, Replay, Tier

log = logging.getLogger(__name__)

JSON_ARTIFACTS: dict[str, tuple[str, type[BaseModel]]] = {
    "fleet": ("fleet.json", Fleet),
    "replay": ("replay.json", Replay),
    "metrics": ("metrics.json", Metrics),
}
PREDICTIONS_FILE = "test_predictions.csv"


class Predictions:
    """Rows of test_predictions.csv, indexed by event_id for the filter."""

    def __init__(self, rows: list[PredictionRow]):
        self.rows = rows
        self.by_event: dict[int, list[PredictionRow]] = defaultdict(list)
        for row in rows:
            self.by_event[row.event_id].append(row)

    def query(self, event_id: int | None = None, tier: Tier | None = None) -> list[PredictionRow]:
        rows = self.rows if event_id is None else self.by_event.get(event_id, [])
        if tier is not None:
            rows = [r for r in rows if r.pred_tier == tier]
        return rows


@dataclass
class ArtifactStore:
    directory: Path
    json_bytes: dict[str, bytes] = field(default_factory=dict)
    predictions: Predictions | None = None
    errors: dict[str, str] = field(default_factory=dict)

    def loaded(self) -> dict[str, bool]:
        status = {name: name in self.json_bytes for name in JSON_ARTIFACTS}
        status["predictions"] = self.predictions is not None
        return status

    def json_response(self, name: str) -> Response:
        """Serve a JSON artifact as the validated bytes on disk, without re-encoding."""
        if name not in self.json_bytes:
            raise HTTPException(503, detail=f"{JSON_ARTIFACTS[name][0]} is not loaded: {self.errors.get(name, 'unknown error')}")
        return Response(self.json_bytes[name], media_type="application/json")

    def require_predictions(self) -> Predictions:
        if self.predictions is None:
            raise HTTPException(503, detail=f"{PREDICTIONS_FILE} is not loaded: {self.errors.get('predictions', 'unknown error')}")
        return self.predictions


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        return f"does not match the contract at {where or '(root)'}: {first['msg']} ({exc.error_count()} errors)"
    if isinstance(exc, FileNotFoundError):
        return "file not found"
    return f"{type(exc).__name__}: {exc}"


def _read_predictions(path: Path) -> Predictions:
    with path.open(newline="") as fh:
        return Predictions([PredictionRow.model_validate(raw) for raw in csv.DictReader(fh)])


def load_artifacts(directory: Path) -> ArtifactStore:
    store = ArtifactStore(directory=directory)
    for name, (filename, model) in JSON_ARTIFACTS.items():
        try:
            raw = (directory / filename).read_bytes()
            model.model_validate_json(raw)
            store.json_bytes[name] = raw
        except (OSError, ValidationError) as exc:
            store.errors[name] = _describe(exc)
    try:
        store.predictions = _read_predictions(directory / PREDICTIONS_FILE)
    except (OSError, ValidationError) as exc:
        store.errors["predictions"] = _describe(exc)
    for name, error in store.errors.items():
        log.warning("artifact %s not loaded from %s: %s", name, directory, error)
    return store


def get_store(request: Request) -> ArtifactStore:
    return request.app.state.store
