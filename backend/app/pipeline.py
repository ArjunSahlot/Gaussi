from __future__ import annotations

import os
import select
import signal
import shlex
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from .config import Settings
from .storage import Storage


class PipelineError(RuntimeError):
    pass


class PipelineCanceled(RuntimeError):
    pass


def render_command(template: str, **values: Any) -> list[str]:
    quoted = {key: shlex.quote(str(value)) for key, value in values.items()}
    return shlex.split(template.format(**quoted))


class ConversionPipeline:
    def __init__(self, settings: Settings, storage: Storage) -> None:
        self.settings = settings
        self.storage = storage
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._process_lock = threading.RLock()

    def binary_report(self) -> dict[str, dict[str, str | bool]]:
        return {
            "ffmpeg": {
                "configured": self.settings.ffmpeg_bin,
                "available": shutil.which(self.settings.ffmpeg_bin) is not None,
            },
            "colmap": {
                "configured": self.settings.colmap_bin,
                "available": shutil.which(self.settings.colmap_bin) is not None,
            },
            "opensplat": {
                "configured": self.settings.opensplat_bin,
                "available": shutil.which(self.settings.opensplat_bin) is not None,
            },
        }

    def run(self, job_id: str) -> dict[str, Any]:
        job = self.storage.get_job(job_id)
        if job is None:
            raise PipelineError(f"Unknown job: {job_id}")
        if job["cancel_requested"]:
            raise PipelineCanceled("Job was canceled before it started")

        workspace = Path(job["workspace_path"])
        images_dir = workspace / "images"
        sparse_dir = workspace / "sparse"
        database_path = workspace / "colmap.db"
        mapper_database_path = workspace / "colmap_global.db"
        logs_dir = workspace / "logs"
        output_ply = self.settings.artifacts_dir / f"{job_id}.ply"

        for directory in (images_dir, sparse_dir, logs_dir, self.settings.artifacts_dir):
            directory.mkdir(parents=True, exist_ok=True)

        if self.settings.pipeline_dry_run:
            self.storage.update_job(
                job_id,
                status="running",
                current_step="Dry run",
                current_step_index=1,
                total_steps=1,
                started_at=self.storage_now(),
                step_started_at=self.storage_now(),
                last_heartbeat_at=self.storage_now(),
                progress_label="Writing dry run PLY",
            )
            self.storage.record_event(job_id, "info", "Writing dry run placeholder scene", "Dry run")
            self._write_placeholder_ply(output_ply)
            scene = self.storage.create_scene(
                name=Path(job["source_file_name"]).stem,
                source_kind="video_conversion",
                ply_path=output_ply,
                source_job_id=job_id,
            )
            return self.storage.update_job(
                job_id,
                status="completed",
                output_path=output_ply,
                scene_id=scene["id"],
                progress_label="Dry run scene generated",
                current_step="Dry run",
                finished_at=self.storage_now(),
                last_heartbeat_at=self.storage_now(),
            )

        context = {
            "ffmpeg": self.settings.ffmpeg_bin,
            "colmap": self.settings.colmap_bin,
            "opensplat": self.settings.opensplat_bin,
            "input_video": job["source_path"],
            "frames_dir": images_dir,
            "database_path": database_path,
            "mapper_database_path": mapper_database_path
            if self.settings.colmap_run_view_graph_calibrator
            else database_path,
            "sparse_dir": sparse_dir,
            "colmap_workspace": workspace,
            "output_ply": output_ply,
            "frame_rate": self.settings.frame_rate,
            "max_frame_width": self.settings.max_frame_width,
            "colmap_use_gpu": self.settings.colmap_use_gpu,
            "opensplat_iterations": self.settings.opensplat_iterations,
        }

        steps = [
            ("Extracting frames", self.settings.ffmpeg_template, logs_dir / "01-ffmpeg.log"),
            ("Finding COLMAP features", self.settings.colmap_feature_template, logs_dir / "02-features.log"),
            ("Matching COLMAP features", self.settings.colmap_match_template, logs_dir / "03-matches.log"),
        ]
        if self.settings.colmap_run_view_graph_calibrator:
            steps.append(
                (
                    "Calibrating COLMAP view graph",
                    self.settings.colmap_calibrator_template,
                    logs_dir / "04-view-graph-calibrator.log",
                )
            )
        steps.extend(
            [
                (
                    "Building global sparse reconstruction",
                    self.settings.colmap_mapper_template,
                    logs_dir / "05-global-mapper.log",
                ),
                ("Training Gaussian splat", self.settings.opensplat_template, logs_dir / "06-opensplat.log"),
            ]
        )

        started_at = self.storage_now()
        self.storage.update_job(
            job_id,
            status="running",
            started_at=started_at,
            finished_at=None,
            total_steps=len(steps),
            cancel_requested=0,
            progress_label="Starting conversion",
            last_heartbeat_at=started_at,
        )
        self.storage.record_event(job_id, "info", "Conversion started")

        for index, (label, template, log_path) in enumerate(steps, start=1):
            self._raise_if_canceled(job_id)
            step_started_at = self.storage_now()
            self.storage.update_job(
                job_id,
                status="running",
                progress_label=label,
                current_step=label,
                current_step_index=index,
                total_steps=len(steps),
                current_log_path=log_path,
                step_started_at=step_started_at,
                last_heartbeat_at=step_started_at,
                active_process_pid=None,
            )
            self.storage.record_event(job_id, "info", f"Step {index}/{len(steps)} started", label)
            if template == self.settings.colmap_calibrator_template:
                shutil.copy2(database_path, mapper_database_path)
            command = render_command(template, **context)
            self._run_command(job_id, command, log_path, label)
            self.storage.record_event(job_id, "info", f"Step {index}/{len(steps)} completed", label)

        if not output_ply.exists():
            raise PipelineError(f"OpenSplat finished but no PLY was created at {output_ply}")

        scene = self.storage.create_scene(
            name=Path(job["source_file_name"]).stem,
            source_kind="video_conversion",
            ply_path=output_ply,
            source_job_id=job_id,
        )
        return self.storage.update_job(
            job_id,
            status="completed",
            output_path=output_ply,
            scene_id=scene["id"],
            progress_label="Scene ready",
            current_step="Scene ready",
            finished_at=self.storage_now(),
            last_heartbeat_at=self.storage_now(),
            active_process_pid=None,
        )

    def request_cancel(self, job_id: str) -> dict[str, Any]:
        job = self.storage.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        if job["status"] == "queued":
            return self.storage.update_job(
                job_id,
                status="canceled",
                cancel_requested=1,
                progress_label="Canceled before start",
                finished_at=self.storage_now(),
            )
        if job["status"] not in {"running", "canceling"}:
            return job

        updated = self.storage.update_job(
            job_id,
            status="canceling",
            cancel_requested=1,
            progress_label="Cancel requested",
            last_heartbeat_at=self.storage_now(),
        )
        self.storage.record_event(job_id, "warning", "Cancel requested")
        with self._process_lock:
            process = self._processes.get(job_id)
        if process and process.poll() is None:
            self._terminate_process(process)
        return updated

    def storage_now(self) -> str:
        from .storage import now_iso

        return now_iso()

    def _raise_if_canceled(self, job_id: str) -> None:
        job = self.storage.get_job(job_id)
        if job and job["cancel_requested"]:
            raise PipelineCanceled("Cancellation requested")

    def _run_command(self, job_id: str, command: list[str], log_path: Path, label: str) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("w", encoding="utf-8") as log_file:
            log_file.write("$ " + " ".join(shlex.quote(part) for part in command) + "\n\n")
            log_file.flush()
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
            with self._process_lock:
                self._processes[job_id] = process
            self.storage.update_job(job_id, active_process_pid=process.pid)

            started = time.monotonic()
            last_heartbeat = 0.0
            last_line: str | None = None
            try:
                while True:
                    if self.storage.get_job(job_id)["cancel_requested"]:
                        self._terminate_process(process)
                        raise PipelineCanceled("Cancellation requested")

                    if (
                        self.settings.command_timeout_seconds > 0
                        and time.monotonic() - started > self.settings.command_timeout_seconds
                    ):
                        self._terminate_process(process)
                        raise PipelineError(
                            f"{label} exceeded {self.settings.command_timeout_seconds} seconds"
                        )

                    stdout = process.stdout
                    if stdout is not None:
                        ready, _, _ = select.select([stdout], [], [], 1.0)
                        if ready:
                            line = stdout.readline()
                            if line:
                                log_file.write(line)
                                log_file.flush()
                                last_line = line.strip()[:2000]

                    now = time.monotonic()
                    if now - last_heartbeat >= self.settings.job_heartbeat_seconds:
                        self.storage.update_job(
                            job_id,
                            last_heartbeat_at=self.storage_now(),
                            last_log_line=last_line,
                        )
                        last_heartbeat = now

                    return_code = process.poll()
                    if return_code is not None:
                        stdout = process.stdout
                        if stdout is not None:
                            for line in stdout.readlines():
                                log_file.write(line)
                                log_file.flush()
                                last_line = line.strip()[:2000]
                        self.storage.update_job(
                            job_id,
                            last_heartbeat_at=self.storage_now(),
                            last_log_line=last_line,
                            active_process_pid=None,
                        )
                        if return_code != 0:
                            job = self.storage.get_job(job_id)
                            if job and job["cancel_requested"]:
                                raise PipelineCanceled("Cancellation requested")
                            raise PipelineError(
                                f"{label} failed with exit code {return_code}. See {log_path}"
                            )
                        return
            finally:
                with self._process_lock:
                    self._processes.pop(job_id, None)
                self.storage.update_job(job_id, active_process_pid=None)

    def _terminate_process(self, process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except Exception:
            process.terminate()

        try:
            process.wait(timeout=10)
            return
        except subprocess.TimeoutExpired:
            pass

        try:
            os.killpg(process.pid, signal.SIGKILL)
        except Exception:
            process.kill()
        process.wait(timeout=5)

    def _write_placeholder_ply(self, output_ply: Path) -> None:
        output_ply.write_text(
            "\n".join(
                [
                    "ply",
                    "format ascii 1.0",
                    "element vertex 4",
                    "property float x",
                    "property float y",
                    "property float z",
                    "property uchar red",
                    "property uchar green",
                    "property uchar blue",
                    "end_header",
                    "0 0 0 255 80 80",
                    "1 0 0 80 220 120",
                    "0 1 0 90 170 255",
                    "0 0 1 255 210 90",
                    "",
                ]
            ),
            encoding="utf-8",
        )
