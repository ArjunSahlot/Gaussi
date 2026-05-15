import type { ApiConfig, ConversionJob, JobEvent, JobLogs, Scene } from "./types";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return request<T>(path, {
    method: "POST",
    body: form
  });
}

export function fetchConfig(): Promise<ApiConfig> {
  return request<ApiConfig>("/api/config");
}

export function fetchScenes(): Promise<Scene[]> {
  return request<Scene[]>("/api/scenes");
}

export function uploadScene(file: File): Promise<Scene> {
  return upload<Scene>("/api/scenes", file);
}

export function fetchJobs(): Promise<ConversionJob[]> {
  return request<ConversionJob[]>("/api/jobs");
}

export function uploadVideo(file: File): Promise<ConversionJob> {
  return upload<ConversionJob>("/api/jobs", file);
}

export function cancelJob(jobId: string): Promise<ConversionJob> {
  return request<ConversionJob>(`/api/jobs/${jobId}/cancel`, { method: "POST" });
}

export function retryJob(jobId: string): Promise<ConversionJob> {
  return request<ConversionJob>(`/api/jobs/${jobId}/retry`, { method: "POST" });
}

export function fetchJobLogs(jobId: string): Promise<JobLogs> {
  return request<JobLogs>(`/api/jobs/${jobId}/logs`);
}

export function fetchJobEvents(jobId: string): Promise<JobEvent[]> {
  return request<JobEvent[]>(`/api/jobs/${jobId}/events`);
}
