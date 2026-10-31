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

## Usage

Run every command from `api/`.

```bash
uv sync
uv run uvicorn needle_api.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the generated schema of every endpoint.

| Variable | Default | Meaning |
|---|---|---|
| `NEEDLE_ARTIFACTS_DIR` | `../artifacts` | Folder holding `fleet.json`, `replay.json`, `metrics.json` and `test_predictions.csv`. A relative path is resolved against the working directory. |
| `NEEDLE_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed by CORS. `*` allows any origin. |

The artifacts are read and checked against the contract once, at startup. A file that is missing or does not match the contract is not served: its endpoint returns 503, and `/api/health` reports `"status": "degraded"` with the reason under `errors`. Restart the server after the ML segment rebuilds the artifacts.

### Enabling `/api/pc` and `/api/coa`

These two endpoints call `needle_ml.physics` from the ML segment. Until that package is installed they return 503, and `/api/health` reports `"ml": false`. Once `ml/pyproject.toml` exists, install it into this environment:

```bash
uv pip install -e ../ml
```

`uv run` keeps it installed, but `uv sync` removes packages that are not in `uv.lock`, so run the install again after a `uv sync`. The Docker image installs `ml/` automatically when `ml/pyproject.toml` is present.

### Tests

```bash
uv run pytest
```

The tests read the committed `artifacts/`. They do not need `needle_ml`: they replace it with a fake through `app.dependency_overrides`.

### Docker

Build from the repository root, so the image can include `artifacts/` and `ml/`:

```bash
docker build -f api/Dockerfile -t needle-api .
docker run --rm -p 8000:8000 needle-api
```
