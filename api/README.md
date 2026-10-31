# API segment: `needle_api`

A FastAPI service that serves the built artifacts and computes Pc and burn options on demand. Endpoints and shapes are fixed by `contracts/README.md`.

## Scope

- `pyproject.toml` managed with uv, Python ≥ 3.11, package `needle_api`. Run with `uv run uvicorn needle_api.main:app --reload --port 8000`.
- Read artifacts from `NEEDLE_ARTIFACTS_DIR`, default `../artifacts`. Load once at startup; `/api/health` reports which files loaded.
- `GET /api/predictions` filters by `event_id` and `tier` and paginates with `limit` (max 1000) and `offset`.
- `POST /api/pc` and `POST /api/coa` call `needle_ml.physics.pc_from_cdm` and `plan_burns`. The ML package is being built in parallel on another branch. Add it as a path dependency on `../ml`, inject it through a FastAPI dependency, and return 503 with a clear message when it cannot be imported. Tests replace it with a fake.
- Pydantic response models that match the contract, so `/docs` documents them.
- CORS open for `http://localhost:5173` and configurable through `NEEDLE_CORS_ORIGINS`.
- `Dockerfile` in this folder.

## Tests (pytest with FastAPI's TestClient)

- Every GET endpoint against the committed `artifacts/`.
- Predictions filtering and pagination, including bad parameters (422).
- 503 from `/api/pc` and `/api/coa` when the ML package is missing; correct shapes with the fake.

## Done when

`uv run pytest` passes, the server starts and answers every endpoint locally (paste `curl` output into the pull request), and a pull request to `main` is open.
