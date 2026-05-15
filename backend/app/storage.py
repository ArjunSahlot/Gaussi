from __future__ import annotations

import secrets
import sqlite3
import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import Settings


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')}"


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = threading.RLock()

    def initialize(self) -> None:
        self.settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.settings.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.settings.artifacts_dir.mkdir(parents=True, exist_ok=True)

        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    source_file_name TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    output_path TEXT,
                    progress_label TEXT NOT NULL,
                    error TEXT,
                    scene_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS scenes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    ply_path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    source_job_id TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.settings.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def create_job(self, source_file_name: str, source_path: Path, workspace_path: Path) -> dict[str, Any]:
        timestamp = now_iso()
        job_id = new_id("job")
        workspace_path.mkdir(parents=True, exist_ok=True)
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    id, status, source_file_name, source_path, workspace_path, progress_label,
                    created_at, updated_at
                )
                VALUES (?, 'queued', ?, ?, ?, 'Waiting for a worker', ?, ?)
                """,
                (
                    job_id,
                    source_file_name,
                    str(source_path),
                    str(workspace_path),
                    timestamp,
                    timestamp,
                ),
            )
        job = self.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create job")
        return job

    def update_job(self, job_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            job = self.get_job(job_id)
            if job is None:
                raise KeyError(job_id)
            return job

        fields["updated_at"] = now_iso()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = [str(value) if isinstance(value, Path) else value for value in fields.values()]
        values.append(job_id)

        with self._lock, self._connect() as conn:
            conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?", values)
        job = self.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        return job

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def list_jobs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def jobs_with_status(self, statuses: Iterable[str]) -> list[dict[str, Any]]:
        status_list = list(statuses)
        placeholders = ", ".join("?" for _ in status_list)
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM jobs WHERE status IN ({placeholders}) ORDER BY created_at ASC",
                status_list,
            ).fetchall()
        return [dict(row) for row in rows]

    def create_scene(
        self,
        name: str,
        source_kind: str,
        ply_path: Path,
        source_job_id: str | None = None,
    ) -> dict[str, Any]:
        scene_id = new_id("scene")
        timestamp = now_iso()
        size_bytes = ply_path.stat().st_size
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO scenes (
                    id, name, source_kind, ply_path, size_bytes, source_job_id, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scene_id,
                    name,
                    source_kind,
                    str(ply_path),
                    size_bytes,
                    source_job_id,
                    timestamp,
                ),
            )
        scene = self.get_scene(scene_id)
        if scene is None:
            raise RuntimeError("Failed to create scene")
        return scene

    def get_scene(self, scene_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM scenes WHERE id = ?", (scene_id,)).fetchone()
        return dict(row) if row else None

    def list_scenes(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM scenes ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]
