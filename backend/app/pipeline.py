from __future__ import annotations

import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .config import Settings
from .storage import Storage


class PipelineError(RuntimeError):
    pass


def render_command(template: str, **values: Any) -> list[str]:
    quoted = {key: shlex.quote(str(value)) for key, value in values.items()}
    return shlex.split(template.format(**quoted))


class ConversionPipeline:
    def __init__(self, settings: Settings, storage: Storage) -> None:
        self.settings = settings
        self.storage = storage

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

        for label, template, log_path in steps:
            self.storage.update_job(job_id, status="running", progress_label=label)
            if template == self.settings.colmap_calibrator_template:
                shutil.copy2(database_path, mapper_database_path)
            command = render_command(template, **context)
            self._run_command(command, log_path)

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
        )

    def _run_command(self, command: list[str], log_path: Path) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("w", encoding="utf-8") as log_file:
            log_file.write("$ " + " ".join(shlex.quote(part) for part in command) + "\n\n")
            log_file.flush()
            completed = subprocess.run(
                command,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
            )
        if completed.returncode != 0:
            raise PipelineError(
                f"Command failed with exit code {completed.returncode}. See {log_path}"
            )

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
