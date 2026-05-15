from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed", "canceling", "canceled"]
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
    logsUrl: str
    eventsUrl: str
    currentStep: str | None = None
    currentStepIndex: int = 0
    totalSteps: int = 0
    startedAt: str | None = None
    finishedAt: str | None = None
    stepStartedAt: str | None = None
    lastHeartbeatAt: str | None = None
    lastLogLine: str | None = None
    cancelRequested: bool = False
    activeProcessPid: int | None = None
    createdAt: str
    updatedAt: str


class JobEventResponse(BaseModel):
    id: int
    level: str
    message: str
    stepLabel: str | None = None
    createdAt: str


class JobLogFileResponse(BaseModel):
    name: str
    sizeBytes: int
    updatedAt: str
    url: str


class JobLogsResponse(BaseModel):
    files: list[JobLogFileResponse]
    activeLogName: str | None = None
    tail: str = ""


class UploadLimitResponse(BaseModel):
    maxUploadMb: int
    acceptedVideoTypes: list[str] = Field(default_factory=list)
    acceptedSceneTypes: list[str] = Field(default_factory=list)
