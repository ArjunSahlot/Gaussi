# Gaussi Backend

FastAPI service for storing `.ply` scenes, accepting video uploads, and running the FFmpeg -> COLMAP -> OpenSplat conversion pipeline.

## Local run

```bash
cd backend
uv sync --extra dev
GAUSSI_PIPELINE_DRY_RUN=true uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`GAUSSI_PIPELINE_DRY_RUN=true` is only for machines without COLMAP/OpenSplat. On the GCP VM, leave it false and set the binary paths in `.env`.

## VM notes

- Use a persistent disk or durable mount for `GAUSSI_DATA_DIR`.
- Set `GAUSSI_PUBLIC_BASE_URL` to the public API origin so Vercel receives absolute asset URLs.
- Set `GAUSSI_FRONTEND_ORIGINS` to the deployed Vercel URL plus any preview URLs you want to allow.
- Keep `GAUSSI_JOB_WORKERS=1` on `c3d-standard-4` until conversion timing says the VM can handle parallel jobs.
- `GAUSSI_JOB_HEARTBEAT_SECONDS` controls how often running jobs update their heartbeat/log tail.
- `GAUSSI_COMMAND_TIMEOUT_SECONDS=0` disables per-command timeouts; set it if you want stuck conversion steps to fail automatically.
- The default COLMAP path uses `view_graph_calibrator` followed by `global_mapper`.
- If your COLMAP global mapper entrypoint differs, change `GAUSSI_COLMAP_MAPPER_TEMPLATE` instead of editing code.
- If the VM has strong camera intrinsics and you want to skip calibration, set `GAUSSI_COLMAP_RUN_VIEW_GRAPH_CALIBRATOR=false`.
- If your OpenSplat CLI differs, change `GAUSSI_OPENSLAT_TEMPLATE`.

## API

- `GET /health`
- `GET /api/config`
- `GET /api/scenes`
- `POST /api/scenes` with multipart field `file` for `.ply`
- `GET /api/jobs`
- `POST /api/jobs` with multipart field `file` for videos
- `GET /api/jobs/{job_id}`
- `POST /api/jobs/{job_id}/cancel`
- `POST /api/jobs/{job_id}/retry`
- `GET /api/jobs/{job_id}/events`
- `GET /api/jobs/{job_id}/logs`
- `GET /api/jobs/{job_id}/logs/{log_name}`
