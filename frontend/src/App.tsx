import { AlertCircle, CloudOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchConfig, fetchJobs, fetchScenes, uploadScene, uploadVideo } from "./api";
import { GaussianViewer } from "./components/GaussianViewer";
import { JobPanel } from "./components/JobPanel";
import { SceneRail } from "./components/SceneRail";
import { UploadDropzone } from "./components/UploadDropzone";
import { ViewerToolbar } from "./components/ViewerToolbar";
import type { ApiConfig, ConversionJob, Scene, ViewerBackground, ViewerQuality } from "./types";
import { fileExtension, formatBytes } from "./utils";

const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

function createLocalScene(file: File): Scene {
  return {
    id: `local-${crypto.randomUUID()}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    sourceKind: "local",
    plyUrl: URL.createObjectURL(file),
    sizeBytes: file.size,
    createdAt: new Date().toISOString()
  };
}

export default function App() {
  const [serverScenes, setServerScenes] = useState<Scene[]>([]);
  const [localScenes, setLocalScenes] = useState<Scene[]>([]);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [backendOnline, setBackendOnline] = useState(true);
  const [background, setBackground] = useState<ViewerBackground>("grid");
  const [quality, setQuality] = useState<ViewerQuality>("balanced");
  const [resetToken, setResetToken] = useState(0);
  const localObjectUrls = useRef<string[]>([]);

  const scenes = useMemo(() => [...localScenes, ...serverScenes], [localScenes, serverScenes]);
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0] ?? null;

  const loadServerState = useCallback(async () => {
    try {
      const [nextScenes, nextJobs, nextConfig] = await Promise.all([
        fetchScenes(),
        fetchJobs(),
        config ? Promise.resolve(config) : fetchConfig()
      ]);
      setBackendOnline(true);
      setServerScenes(nextScenes);
      setJobs(nextJobs);
      setConfig(nextConfig);
      setNotice("");
    } catch (caught) {
      setBackendOnline(false);
      setNotice(caught instanceof Error ? caught.message : "Backend unavailable");
    }
  }, [config]);

  useEffect(() => {
    void loadServerState();
  }, [loadServerState]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadServerState();
    }, jobs.some((job) => job.status === "queued" || job.status === "running") ? 2500 : 7000);
    return () => window.clearInterval(interval);
  }, [jobs, loadServerState]);

  useEffect(() => {
    if (!selectedSceneId && scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  useEffect(() => {
    return () => {
      for (const url of localObjectUrls.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const extension = fileExtension(file);
      if (extension === ".ply") {
        const localScene = createLocalScene(file);
        localObjectUrls.current.push(localScene.plyUrl);
        setLocalScenes((current) => [localScene, ...current]);
        setSelectedSceneId(localScene.id);
        setNotice(`Opening ${file.name} locally and uploading it to the library`);
        try {
          const uploaded = await uploadScene(file);
          setServerScenes((current) => [uploaded, ...current]);
          setSelectedSceneId(uploaded.id);
          setNotice(`${uploaded.name} is in the library`);
        } catch (caught) {
          setNotice(caught instanceof Error ? caught.message : "Scene upload failed");
        }
      } else if (videoExtensions.has(extension)) {
        setNotice(`Uploading ${file.name} for conversion`);
        try {
          const job = await uploadVideo(file);
          setJobs((current) => [job, ...current]);
          setNotice(`${file.name} is queued`);
        } catch (caught) {
          setNotice(caught instanceof Error ? caught.message : "Video upload failed");
        }
      } else {
        setNotice(`${file.name} is not a supported file type`);
      }
    }
  }

  function openJobScene(job: ConversionJob) {
    if (!job.scene) return;
    setSelectedSceneId(job.scene.id);
  }

  const totalSceneBytes = scenes.reduce((sum, scene) => sum + scene.sizeBytes, 0);

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand-lockup">
          <span className="brand-mark">G</span>
          <div>
            <strong>Gaussi</strong>
            <span>Gaussian scene workbench</span>
          </div>
        </div>
        <SceneRail scenes={scenes} selectedSceneId={selectedScene?.id} onSelect={(scene) => setSelectedSceneId(scene.id)} />
      </aside>

      <main className="stage">
        <header className="stage-header">
          <div>
            <span className="eyebrow">Viewer</span>
            <h1>{selectedScene?.name ?? "Ready"}</h1>
          </div>
          <ViewerToolbar
            background={background}
            quality={quality}
            onBackgroundChange={setBackground}
            onQualityChange={setQuality}
            onReset={() => setResetToken((value) => value + 1)}
          />
        </header>
        <GaussianViewer
          scene={selectedScene}
          background={background}
          quality={quality}
          resetToken={resetToken}
        />
      </main>

      <aside className="right-rail">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Input</span>
              <h2>Upload</h2>
            </div>
            <button className="icon-button" type="button" title="Refresh" onClick={() => void loadServerState()}>
              <RefreshCw size={16} />
            </button>
          </div>
          <UploadDropzone maxUploadMb={config?.maxUploadMb} onFiles={(files) => void handleFiles(files)} />
          {notice ? (
            <div className={`notice ${backendOnline ? "" : "notice-warning"}`}>
              {backendOnline ? <AlertCircle size={16} /> : <CloudOff size={16} />}
              <span>{notice}</span>
            </div>
          ) : null}
        </section>

        <section className="panel stats-panel">
          <div className="stat-line">
            <span>Scenes</span>
            <strong>{scenes.length}</strong>
          </div>
          <div className="stat-line">
            <span>Storage</span>
            <strong>{formatBytes(totalSceneBytes)}</strong>
          </div>
          <div className="stat-line">
            <span>Backend</span>
            <strong>{backendOnline ? "Online" : "Offline"}</strong>
          </div>
        </section>

        <JobPanel jobs={jobs} onOpenScene={openJobScene} />
      </aside>
    </div>
  );
}
