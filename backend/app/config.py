from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _split_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    public_base_url: str
    frontend_origins: list[str]
    max_upload_mb: int
    job_workers: int
    job_heartbeat_seconds: int
    command_timeout_seconds: int

    ffmpeg_bin: str
    colmap_bin: str
    opensplat_bin: str
    pipeline_dry_run: bool
    colmap_run_view_graph_calibrator: bool

    frame_rate: int
    max_frame_width: int
    colmap_use_gpu: int
    opensplat_iterations: int

    ffmpeg_template: str
    colmap_feature_template: str
    colmap_match_template: str
    colmap_calibrator_template: str
    colmap_mapper_template: str
    opensplat_template: str

    @property
    def db_path(self) -> Path:
        return self.data_dir / "gaussi.sqlite3"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def artifacts_dir(self) -> Path:
        return self.data_dir / "artifacts"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


def load_settings() -> Settings:
    data_dir = Path(_env("GAUSSI_DATA_DIR", str(Path.cwd() / ".data"))).expanduser().resolve()
    frontend_origins = _split_origins(
        _env(
            "GAUSSI_FRONTEND_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
        )
    )

    return Settings(
        data_dir=data_dir,
        public_base_url=_env("GAUSSI_PUBLIC_BASE_URL", "").rstrip("/"),
        frontend_origins=frontend_origins,
        max_upload_mb=_env_int("GAUSSI_MAX_UPLOAD_MB", 1024),
        job_workers=_env_int("GAUSSI_JOB_WORKERS", 1),
        job_heartbeat_seconds=_env_int("GAUSSI_JOB_HEARTBEAT_SECONDS", 5),
        command_timeout_seconds=_env_int("GAUSSI_COMMAND_TIMEOUT_SECONDS", 0),
        ffmpeg_bin=_env("GAUSSI_FFMPEG_BIN", "ffmpeg"),
        colmap_bin=_env("GAUSSI_COLMAP_BIN", "colmap"),
        opensplat_bin=_env("GAUSSI_OPENSLAT_BIN", "opensplat"),
        pipeline_dry_run=_env_bool("GAUSSI_PIPELINE_DRY_RUN", False),
        colmap_run_view_graph_calibrator=_env_bool(
            "GAUSSI_COLMAP_RUN_VIEW_GRAPH_CALIBRATOR", True
        ),
        frame_rate=_env_int("GAUSSI_FRAME_RATE", 3),
        max_frame_width=_env_int("GAUSSI_MAX_FRAME_WIDTH", 1600),
        colmap_use_gpu=_env_int("GAUSSI_COLMAP_USE_GPU", 0),
        opensplat_iterations=_env_int("GAUSSI_OPENSLAT_ITERATIONS", 7000),
        ffmpeg_template=_env(
            "GAUSSI_FFMPEG_TEMPLATE",
            (
                "{ffmpeg} -y -i {input_video} -vf "
                "fps={frame_rate},scale={max_frame_width}:-2 {frames_dir}/frame_%06d.png"
            ),
        ),
        colmap_feature_template=_env(
            "GAUSSI_COLMAP_FEATURE_TEMPLATE",
            (
                "{colmap} feature_extractor --database_path {database_path} "
                "--image_path {frames_dir} --ImageReader.single_camera 1 "
                "--FeatureExtraction.use_gpu {colmap_use_gpu}"
            ),
        ),
        colmap_match_template=_env(
            "GAUSSI_COLMAP_MATCH_TEMPLATE",
            (
                "{colmap} exhaustive_matcher --database_path {database_path} "
                "--FeatureMatching.use_gpu {colmap_use_gpu}"
            ),
        ),
        colmap_calibrator_template=_env(
            "GAUSSI_COLMAP_CALIBRATOR_TEMPLATE",
            "{colmap} view_graph_calibrator --database_path {mapper_database_path}",
        ),
        colmap_mapper_template=_env(
            "GAUSSI_COLMAP_MAPPER_TEMPLATE",
            (
                "{colmap} global_mapper --database_path {mapper_database_path} "
                "--image_path {frames_dir} --output_path {sparse_dir}"
            ),
        ),
        opensplat_template=_env(
            "GAUSSI_OPENSLAT_TEMPLATE",
            "{opensplat} {colmap_workspace} -n {opensplat_iterations} -o {output_ply}",
        ),
    )
