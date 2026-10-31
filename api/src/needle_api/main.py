"""FastAPI app for Needle. Endpoints and shapes follow contracts/README.md § API."""

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import __version__
from .artifacts import ArtifactStore, get_store, load_artifacts
from .physics import Physics, call_physics, get_physics, ml_available
from .schemas import (
    Cdm,
    CoaRequest,
    CoaResult,
    Fleet,
    Health,
    Metrics,
    PcResult,
    PredictionPage,
    Replay,
    Tier,
)
from .settings import Settings, load_settings

Store = Annotated[ArtifactStore, Depends(get_store)]
PhysicsDep = Annotated[Physics, Depends(get_physics)]

router = APIRouter(prefix="/api")


@router.get("/health", response_model=Health)
def health(store: Store) -> Health:
    loaded = store.loaded()
    return Health(
        status="ok" if all(loaded.values()) else "degraded",
        artifacts=loaded,
        errors=store.errors,
        ml=ml_available(),
    )


@router.get("/fleet", response_model=Fleet)
def fleet(store: Store) -> Response:
    return store.json_response("fleet")


@router.get("/replay", response_model=Replay)
def replay(store: Store) -> Response:
    return store.json_response("replay")


@router.get("/metrics", response_model=Metrics)
def metrics(store: Store) -> Response:
    return store.json_response("metrics")


@router.get("/predictions", response_model=PredictionPage)
def predictions(
    store: Store,
    event_id: Annotated[int | None, Query(ge=0, description="ESA event_id")] = None,
    tier: Annotated[Tier | None, Query(description="Predicted tier")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PredictionPage:
    rows = store.require_predictions().query(event_id=event_id, tier=tier)
    return PredictionPage(total=len(rows), rows=rows[offset : offset + limit])


@router.post("/pc", response_model=PcResult, description="Physics model: encounter-plane Pc from the full CDM.")
def pc(cdm: Cdm, physics: PhysicsDep) -> dict:
    return call_physics(physics.pc_from_cdm, cdm.model_dump())


@router.post("/coa", response_model=CoaResult, description="Physics model: burn options and cost of waiting.")
def coa(body: CoaRequest, physics: PhysicsDep) -> dict:
    return call_physics(physics.plan_burns, body.cdm.model_dump(), body.budgetMmS)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = load_artifacts(settings.artifacts_dir)
        yield

    app = FastAPI(
        title="Needle API",
        version=__version__,
        description="Serves the Needle artifacts and computes Pc and burn options on demand.",
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)
    return app


app = create_app()
