"""Lazy access to needle_ml.physics, which ships from the ML segment.

The API installs and runs without needle_ml. /api/pc and /api/coa answer 503
until it is installed into this environment (`uv pip install -e ../ml`).
"""

import importlib
import logging
import math
from collections.abc import Callable
from typing import Any, Protocol

from fastapi import HTTPException

log = logging.getLogger(__name__)

INSTALL_HINT = "Install the ML package from api/ with `uv pip install -e ../ml`, then restart the server."


class Physics(Protocol):
    def pc_from_cdm(self, cdm: dict) -> dict: ...

    def plan_burns(self, cdm: dict, budget_mm_s: float = 10.0) -> dict: ...


def load_physics() -> Physics:
    module = importlib.import_module("needle_ml.physics")
    missing = [name for name in ("pc_from_cdm", "plan_burns") if not callable(getattr(module, name, None))]
    if missing:
        raise ImportError(f"needle_ml.physics has no {', '.join(missing)}")
    return module


def ml_available() -> bool:
    try:
        load_physics()
    except Exception:
        return False
    return True


def get_physics() -> Physics:
    """FastAPI dependency. Tests replace it through app.dependency_overrides."""
    try:
        return load_physics()
    except Exception as exc:
        log.warning("needle_ml.physics unavailable: %r", exc)
        raise HTTPException(503, detail=f"Physics model unavailable ({type(exc).__name__}: {exc}). {INSTALL_HINT}") from exc


def to_plain(value: Any) -> Any:
    """Convert numpy scalars and arrays to Python values, and non-finite floats to None."""
    if isinstance(value, dict):
        return {k: to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_plain(v) for v in value]
    if hasattr(value, "tolist") and not isinstance(value, (str, bytes)):
        return to_plain(value.tolist())
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def call_physics(fn: Callable[..., dict], *args: Any) -> dict:
    """Run a needle_ml function; inputs it cannot compute become 422 rather than 500."""
    try:
        result = fn(*args)
    except (ValueError, KeyError, ZeroDivisionError) as exc:
        raise HTTPException(422, detail=f"needle_ml could not compute this CDM ({type(exc).__name__}: {exc})") from exc
    return to_plain(result)
