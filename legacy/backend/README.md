# Backend Services

All FastAPI services now live under this `backend/` directory. The main application is inside `backend/app/main`, leaving `src/app/api` free for lightweight Next.js route handlers.

```
backend/
  app/
    main/        # FastAPI project
      main.py    # FastAPI entrypoint
      routes/    # FastAPI routers
      services/  # Supabase + business logic
    legacy/      # Older scripts/services kept for reference (safe to delete later)
  backend_local.sh   # helper to run uvicorn locally
  start_api_server.bat
```

Use `backend_local.sh` (macOS/Linux) or `start_api_server.bat` (Windows) to start the FastAPI server from the repo root. Make sure Python dependencies are installed via `pip install -r backend/requirements.txt`.
