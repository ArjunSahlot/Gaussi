export type SceneSourceKind = "ply_upload" | "video_conversion" | "local";

export type Scene = {
  id: string;
  name: string;
  sourceKind: SceneSourceKind;
  plyUrl: string;
  sizeBytes: number;
  createdAt: string;
  sourceJobId?: string | null;
};

export type JobStatus = "queued" | "running" | "completed" | "failed" | "canceling" | "canceled";

export type ConversionJob = {
  id: string;
  status: JobStatus;
  sourceFileName: string;
  progressLabel: string;
  error?: string | null;
  scene?: Scene | null;
  logUrl?: string | null;
  logsUrl: string;
  eventsUrl: string;
  currentStep?: string | null;
  currentStepIndex: number;
  totalSteps: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  stepStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastLogLine?: string | null;
  cancelRequested: boolean;
  activeProcessPid?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type JobEvent = {
  id: number;
  level: string;
  message: string;
  stepLabel?: string | null;
  createdAt: string;
};

export type JobLogFile = {
  name: string;
  sizeBytes: number;
  updatedAt: string;
  url: string;
};

export type JobLogs = {
  files: JobLogFile[];
  activeLogName?: string | null;
  tail: string;
};

export type ApiConfig = {
  maxUploadMb: number;
  acceptedVideoTypes: string[];
  acceptedSceneTypes: string[];
};

export type ViewerQuality = "fast" | "balanced" | "studio";
export type ViewerBackground = "grid" | "dark" | "light";
