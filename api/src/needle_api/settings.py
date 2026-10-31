"""Runtime settings read from environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ARTIFACTS_DIR = "../artifacts"
DEFAULT_CORS_ORIGINS = "http://localhost:5173"


@dataclass(frozen=True)
class Settings:
    artifacts_dir: Path
    cors_origins: tuple[str, ...]


def load_settings() -> Settings:
    """Read NEEDLE_ARTIFACTS_DIR and NEEDLE_CORS_ORIGINS (comma-separated).

    A relative artifacts path is resolved against the working directory, so the
    default `../artifacts` works when the server is started from `api/`.
    """
    artifacts_dir = Path(os.environ.get("NEEDLE_ARTIFACTS_DIR") or DEFAULT_ARTIFACTS_DIR)
    origins = os.environ.get("NEEDLE_CORS_ORIGINS") or DEFAULT_CORS_ORIGINS
    return Settings(
        artifacts_dir=artifacts_dir.resolve(),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
    )
