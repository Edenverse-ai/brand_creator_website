# Backend

> **DECOMMISSIONED 2026-08-06.** The FastAPI sidecar this document describes no longer
> runs, is no longer deployed, and is no longer called by any application code. Its
> source now sits read-only under [`legacy/backend/`](../legacy/backend/); every route
> it served has a native Next.js equivalent. Read
> [`legacy/ARCHIVE.md`](../legacy/ARCHIVE.md) for what replaced what, and
> [`legacy/HANDOFF.md`](../legacy/HANDOFF.md) for the remaining AWS teardown.
>
> Everything below is kept verbatim as historical reference. Paths written as
> `backend/…` now live under `legacy/backend/…`. Do not follow its run instructions.

FastAPI Python sidecar for platform integrations and media handling.

See [architecture.md](architecture.md) for how it fits into the overall system.

---

## Purpose

The FastAPI service handles workloads that belong in Python rather than Node:

- TikTok API integration (creator info, video upload, OAuth)
- Supabase storage operations
- Business logic that depends on Python libraries

The Next.js app delegates to this service via its API routes (`src/app/api/**`). The FastAPI process is optional — the Next.js app degrades gracefully if it is not running locally.

---

## Entry Point

```
backend/
  app/
    main/
      main.py       # FastAPI application entry point
      routes/       # FastAPI routers
      services/     # Supabase + business logic
    legacy/         # Older scripts kept for reference (safe to delete later)
  requirements.txt
```

The FastAPI application is instantiated in `backend/app/main/main.py`. Routers live under `backend/app/main/routes/`; service modules under `backend/app/main/services/`.

For the route map, see [`backend/README.md`](../backend/README.md) — that file is the source of truth for endpoint documentation and is kept closer to the code.

---

## Run Scripts

Two helper scripts start the FastAPI server. Both live at the **repo root**:

| Script                 | Platform      | Usage                      |
| ---------------------- | ------------- | -------------------------- |
| `start_api_server.sh`  | macOS / Linux | `bash start_api_server.sh` |
| `start_api_server.bat` | Windows       | `start_api_server.bat`     |

Run these from the repo root after activating the Python virtual environment and installing dependencies (see Local Development below).

> **Note:** `backend/README.md` and `AGENTS.md` reference a `backend_local.sh` script. As of this writing that script does not exist in the repository; use `start_api_server.sh` at the repo root instead.

---

## Environment Variables

The FastAPI service reads its configuration from environment variables. See [`backend/README.md`](../backend/README.md) for the full list and required values.

At minimum you will need Supabase credentials and TikTok API keys in your `.env.local` (or shell environment) before the service can handle platform requests.

---

## Local Development

```bash
# 1. Create and activate a virtual environment
python -m venv backend/.venv
source backend/.venv/bin/activate   # Windows: backend\.venv\Scripts\activate

# 2. Install runtime dependencies + dev tooling (Ruff + mypy)
pip install -r backend/requirements.txt -r backend/requirements-dev.txt

# 3. Start the FastAPI server
bash start_api_server.sh            # Windows: start_api_server.bat
```

> **Harness requirement:** The dev harness calls tools via `backend/.venv/bin/ruff` and `backend/.venv/bin/mypy` explicitly, so you do **not** need to activate the venv before committing or pushing. You do need the venv to exist at `backend/.venv` with dev deps installed (`pip install -r backend/requirements-dev.txt`).

> **Note on `requirements.txt` install failures:** Some runtime packages (e.g. `psycopg2-binary`) may fail to build in environments without system libraries. In that case, install dev deps alone: `pip install -r backend/requirements-dev.txt`. Ruff and mypy do not depend on FastAPI or database drivers and will work correctly. mypy's `ignore_missing_imports = true` setting in `backend/pyproject.toml` prevents errors from unresolved runtime imports.

---

## Lint and Type Check

The harness wires two Python quality tools via `backend/pyproject.toml`:

| Tool   | Purpose           | Command (from `backend/`)        |
| ------ | ----------------- | -------------------------------- |
| `ruff` | Lint + format     | `ruff check .` / `ruff format .` |
| `mypy` | Static type check | `mypy app`                       |

These run automatically:

- **On commit** (via lint-staged): `ruff format` and `ruff check --fix` run against staged `.py` files in `backend/`. mypy is intentionally excluded from per-file lint-staged because per-file invocation produces false positives on Pydantic models (the rest of the package is required for accurate type resolution); the full mypy check runs on push instead.
- **On push** (via `harness:prepush`): `ruff check .`, `ruff format --check .`, and `mypy app` run against the full backend.

To run manually:

```bash
source backend/.venv/bin/activate
cd backend
ruff check .
ruff format --check .
mypy app
```

---

## When to Update

Update this file when:

- A new run script is added or the existing ones move.
- The entry point path changes.
- Required environment variables change (also update `backend/README.md`).
- The local dev setup steps change.
