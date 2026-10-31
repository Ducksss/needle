import sys
from contextlib import ExitStack
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from needle_api.main import create_app
from needle_api.settings import Settings

ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "artifacts"
FRONTEND_ORIGIN = "http://localhost:5173"


@pytest.fixture
def make_client():
    """Build a client for an app reading the given artifacts folder (the committed one by default)."""
    with ExitStack() as stack:

        def make(artifacts_dir: Path = ARTIFACTS_DIR, cors_origins: tuple[str, ...] = (FRONTEND_ORIGIN,)) -> TestClient:
            app = create_app(Settings(artifacts_dir=artifacts_dir, cors_origins=cors_origins))
            return stack.enter_context(TestClient(app))

        yield make


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


@pytest.fixture
def no_ml(monkeypatch):
    """Make `import needle_ml.physics` fail, even if the ML package is installed."""
    monkeypatch.setitem(sys.modules, "needle_ml", None)
    monkeypatch.setitem(sys.modules, "needle_ml.physics", None)
