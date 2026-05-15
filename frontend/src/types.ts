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

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type ConversionJob = {
  id: string;
  status: JobStatus;
  sourceFileName: string;
  progressLabel: string;
  error?: string | null;
  scene?: Scene | null;
  logUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiConfig = {
  maxUploadMb: number;
  acceptedVideoTypes: string[];
  acceptedSceneTypes: string[];
};

export type ViewerQuality = "fast" | "balanced" | "studio";
export type ViewerBackground = "grid" | "dark" | "light";
