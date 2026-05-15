from __future__ import annotations

import shutil
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, load_settings
from .jobs import JobQueue
from .models import (
    HealthResponse,
    JobEventResponse,
    JobLogFileResponse,
    JobLogsResponse,
    JobResponse,
    SceneResponse,
    UploadLimitResponse,
)
from .pipeline import ConversionPipeline
from .storage import Storage, new_id

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
PLY_EXTENSIONS = {".ply"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    storage = Storage(settings)
    storage.initialize()
    pipeline = ConversionPipeline(settings, storage)
    queue = JobQueue(storage, pipeline, workers=settings.job_workers)

    app.state.settings = settings
    app.state.storage = storage
    app.state.pipeline = pipeline
    app.state.queue = queue

    await queue.start()
    try:
        yield
    finally:
        await queue.stop()


app = FastAPI(title="Gaussi API", version="0.1.0", lifespan=lifespan)
settings_for_mount = load_settings()
app.mount(
    "/assets",
    StaticFiles(directory=settings_for_mount.artifacts_dir, check_dir=False),
    name="assets",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=load_settings().frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def settings(request: Request) -> Settings:
    return request.app.state.settings


def storage(request: Request) -> Storage:
    return request.app.state.storage


def pipeline(request: Request) -> ConversionPipeline:
    return request.app.state.pipeline


def queue(request: Request) -> JobQueue:
    return request.app.state.queue


def _asset_url(request: Request, absolute_path: str | Path) -> str:
    cfg = settings(request)
    path = Path(absolute_path)
    relative = path.relative_to(cfg.artifacts_dir).as_posix()
    if cfg.public_base_url:
        return f"{cfg.public_base_url}/assets/{relative}"
    return str(request.url_for("assets", path=relative))


def _log_url(request: Request, job: dict[str, Any]) -> str | None:
    log_path = _active_log_path(job)
    if not log_path.exists():
        return None
    return str(request.url_for("job_log", job_id=job["id"], log_name=log_path.name))


def scene_response(request: Request, scene: dict[str, Any]) -> SceneResponse:
    return SceneResponse(
        id=scene["id"],
        name=scene["name"],
        sourceKind=scene["source_kind"],
        plyUrl=_asset_url(request, scene["ply_path"]),
        sizeBytes=scene["size_bytes"],
        createdAt=scene["created_at"],
        sourceJobId=scene["source_job_id"],
    )


def job_response(request: Request, job: dict[str, Any]) -> JobResponse:
    linked_scene = None
    if job["scene_id"]:
        scene = storage(request).get_scene(job["scene_id"])
        if scene:
            linked_scene = scene_response(request, scene)
    return JobResponse(
        id=job["id"],
        status=job["status"],
        sourceFileName=job["source_file_name"],
        progressLabel=job["progress_label"],
        error=job["error"],
        scene=linked_scene,
        logUrl=_log_url(request, job),
        logsUrl=str(request.url_for("get_job_logs", job_id=job["id"])),
        eventsUrl=str(request.url_for("get_job_events", job_id=job["id"])),
        currentStep=job["current_step"],
        currentStepIndex=job["current_step_index"],
        totalSteps=job["total_steps"],
        startedAt=job["started_at"],
        finishedAt=job["finished_at"],
        stepStartedAt=job["step_started_at"],
        lastHeartbeatAt=job["last_heartbeat_at"],
        lastLogLine=job["last_log_line"],
        cancelRequested=bool(job["cancel_requested"]),
        activeProcessPid=job["active_process_pid"],
        createdAt=job["created_at"],
        updatedAt=job["updated_at"],
    )


def job_event_response(event: dict[str, Any]) -> JobEventResponse:
    return JobEventResponse(
        id=event["id"],
        level=event["level"],
        message=event["message"],
        stepLabel=event["step_label"],
        createdAt=event["created_at"],
    )


def _safe_name(filename: str | None, fallback: str) -> str:
    if not filename:
        return fallback
    return Path(filename).name.replace("/", "_").replace("\\", "_")


def _require_extension(filename: str, allowed: set[str], label: str) -> None:
    extension = Path(filename).suffix.lower()
    if extension not in allowed:
        allowed_text = ", ".join(sorted(allowed))
        raise HTTPException(status_code=415, detail=f"{label} must use one of: {allowed_text}")


async def _save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with destination.open("wb") as output:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Upload exceeds configured size limit")
            output.write(chunk)
    return total


def _job_or_404(request: Request, job_id: str) -> dict[str, Any]:
    job = storage(request).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _active_log_path(job: dict[str, Any]) -> Path:
    current = job.get("current_log_path")
    if current:
        return Path(current)
    logs_dir = Path(job["workspace_path"]) / "logs"
    if not logs_dir.exists():
        return logs_dir / "conversion.log"
    logs = sorted(logs_dir.glob("*.log"), key=lambda path: path.stat().st_mtime, reverse=True)
    return logs[0] if logs else logs_dir / "conversion.log"


def _tail_file(path: Path, lines: int) -> str:
    if not path.exists():
        return ""
    byte_limit = 512 * 1024
    size = path.stat().st_size
    with path.open("rb") as handle:
        handle.seek(max(size - byte_limit, 0))
        text = handle.read().decode("utf-8", errors="replace")
    return "\n".join(text.splitlines()[-lines:])


def _log_file_response(request: Request, job: dict[str, Any], path: Path) -> JobLogFileResponse:
    stat = path.stat()
    return JobLogFileResponse(
        name=path.name,
        sizeBytes=stat.st_size,
        updatedAt=datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        url=str(request.url_for("job_log", job_id=job["id"], log_name=path.name)),
    )


@app.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    cfg = settings(request)
    return HealthResponse(ok=True, dryRun=cfg.pipeline_dry_run, binaries=pipeline(request).binary_report())


@app.get("/api/config", response_model=UploadLimitResponse)
async def api_config(request: Request) -> UploadLimitResponse:
    cfg = settings(request)
    return UploadLimitResponse(
        maxUploadMb=cfg.max_upload_mb,
        acceptedVideoTypes=sorted(VIDEO_EXTENSIONS),
        acceptedSceneTypes=sorted(PLY_EXTENSIONS),
    )


@app.get("/api/scenes", response_model=list[SceneResponse])
async def list_scenes(request: Request) -> list[SceneResponse]:
    return [scene_response(request, scene) for scene in storage(request).list_scenes()]


@app.post("/api/scenes", response_model=SceneResponse)
async def upload_scene(request: Request, file: UploadFile = File(...)) -> SceneResponse:
    cfg = settings(request)
    filename = _safe_name(file.filename, "scene.ply")
    _require_extension(filename, PLY_EXTENSIONS, "Scene")
    scene_id = new_id("scenefile")
    destination = cfg.artifacts_dir / "uploads" / f"{scene_id}.ply"
    size = await _save_upload(file, destination, cfg.max_upload_bytes)
    if size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded scene is empty")
    scene = storage(request).create_scene(
        name=Path(filename).stem,
        source_kind="ply_upload",
        ply_path=destination,
    )
    return scene_response(request, scene)


@app.get("/api/jobs", response_model=list[JobResponse])
async def list_jobs(request: Request) -> list[JobResponse]:
    return [job_response(request, job) for job in storage(request).list_jobs()]


@app.post("/api/jobs", response_model=JobResponse)
async def create_job(request: Request, file: UploadFile = File(...)) -> JobResponse:
    cfg = settings(request)
    filename = _safe_name(file.filename, "source.mp4")
    _require_extension(filename, VIDEO_EXTENSIONS, "Video")

    upload_id = new_id("upload")
    source_path = cfg.uploads_dir / upload_id / filename
    workspace_path = cfg.jobs_dir / upload_id
    size = await _save_upload(file, source_path, cfg.max_upload_bytes)
    if size == 0:
        shutil.rmtree(source_path.parent, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Uploaded video is empty")

    job = storage(request).create_job(filename, source_path, workspace_path)
    await queue(request).enqueue(job["id"])
    return job_response(request, job)


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job(request: Request, job_id: str) -> JobResponse:
    return job_response(request, _job_or_404(request, job_id))


@app.post("/api/jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(request: Request, job_id: str) -> JobResponse:
    _job_or_404(request, job_id)
    job = queue(request).cancel(job_id)
    return job_response(request, job)


@app.post("/api/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job(request: Request, job_id: str) -> JobResponse:
    job = _job_or_404(request, job_id)
    if job["status"] in {"queued", "running", "canceling"}:
        raise HTTPException(status_code=409, detail="Only finished jobs can be retried")
    job = await queue(request).retry(job_id)
    return job_response(request, job)


@app.get("/api/jobs/{job_id}/events", response_model=list[JobEventResponse], name="get_job_events")
async def get_job_events(request: Request, job_id: str, limit: int = 100) -> list[JobEventResponse]:
    _job_or_404(request, job_id)
    return [
        job_event_response(event)
        for event in storage(request).list_job_events(job_id, limit=max(1, min(limit, 500)))
    ]


@app.get("/api/jobs/{job_id}/logs", response_model=JobLogsResponse, name="get_job_logs")
async def get_job_logs(request: Request, job_id: str, lines: int = 200) -> JobLogsResponse:
    job = _job_or_404(request, job_id)
    logs_dir = Path(job["workspace_path"]) / "logs"
    log_paths = sorted(logs_dir.glob("*.log")) if logs_dir.exists() else []
    active_log = _active_log_path(job)
    if not active_log.exists() and log_paths:
        active_log = log_paths[-1]
    return JobLogsResponse(
        files=[_log_file_response(request, job, path) for path in log_paths],
        activeLogName=active_log.name if active_log.exists() else None,
        tail=_tail_file(active_log, max(1, min(lines, 1000))),
    )


@app.get("/api/jobs/{job_id}/logs/{log_name}", name="job_log")
async def get_job_log(request: Request, job_id: str, log_name: str) -> FileResponse:
    job = _job_or_404(request, job_id)
    logs_dir = Path(job["workspace_path"]) / "logs"
    requested = logs_dir / Path(log_name).name
    if not requested.exists() or requested.parent != logs_dir:
        raise HTTPException(status_code=404, detail="Log not found")
    return FileResponse(requested, media_type="text/plain")
