from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed"]
SceneSourceKind = Literal["ply_upload", "video_conversion"]


class HealthResponse(BaseModel):
    ok: bool
    dryRun: bool
    binaries: dict[str, dict[str, str | bool]]


class SceneResponse(BaseModel):
    id: str
    name: str
    sourceKind: SceneSourceKind
    plyUrl: str
    sizeBytes: int
    createdAt: str
    sourceJobId: str | None = None


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    sourceFileName: str
    progressLabel: str
    error: str | None = None
    scene: SceneResponse | None = None
    logUrl: str | None = None
    createdAt: str
    updatedAt: str


class UploadLimitResponse(BaseModel):
    maxUploadMb: int
    acceptedVideoTypes: list[str] = Field(default_factory=list)
    acceptedSceneTypes: list[str] = Field(default_factory=list)
