import { useEffect, useRef, useState } from "react";

import type { Scene, ViewerBackground, ViewerQuality } from "../types";

type ViewerStatus = "idle" | "loading" | "ready" | "failed";

type Props = {
  scene: Scene | null;
  background: ViewerBackground;
  quality: ViewerQuality;
  resetToken: number;
};

const controlSettings: Record<
  ViewerQuality,
  { radius: number; dampening: number; minZoom: number; maxZoom: number }
> = {
  fast: { radius: 4.5, dampening: 0.22, minZoom: 0.15, maxZoom: 60 },
  balanced: { radius: 5.5, dampening: 0.15, minZoom: 0.1, maxZoom: 80 },
  studio: { radius: 6.5, dampening: 0.1, minZoom: 0.08, maxZoom: 120 }
};

function isPlyUrl(url: string, scene: Scene | null): boolean {
  return scene?.sourceKind === "local" || url.startsWith("blob:") || url.toLowerCase().includes(".ply");
}

export function GaussianViewer({ scene, background, quality, resetToken }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const sceneId = scene?.id ?? "";
  const sceneName = scene?.name ?? "";
  const sceneUrl = scene?.plyUrl ?? "";
  const plyScene = isPlyUrl(sceneUrl, scene);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !sceneUrl) {
      setStatus("idle");
      setProgress(0);
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let controls:
      | {
          update: () => void;
          dispose: () => void;
          dampening: number;
          minZoom: number;
          maxZoom: number;
        }
      | undefined;
    let renderer: { resize: () => void; render: (scene: any, camera: any) => void; dispose: () => void } | undefined;
    const canvas = document.createElement("canvas");
    canvas.className = "gsplat-canvas";
    mount.replaceChildren(canvas);

    setStatus("loading");
    setError("");
    setProgress(0);

    async function load() {
      try {
        const SPLAT = await import("gsplat");
        if (disposed) return;

        const splatScene = new SPLAT.Scene();
        const camera = new SPLAT.Camera();
        renderer = new SPLAT.WebGLRenderer(canvas);

        const settings = controlSettings[quality];
        controls = new SPLAT.OrbitControls(camera, canvas, 0.45, 0.28, settings.radius, true);
        if (controls) {
          controls.dampening = settings.dampening;
          controls.minZoom = settings.minZoom;
          controls.maxZoom = settings.maxZoom;
        }

        const onProgress = (value: number) => {
          if (!disposed) setProgress(Math.round(value * 100));
        };

        if (plyScene) {
          await SPLAT.PLYLoader.LoadAsync(sceneUrl, splatScene, onProgress);
        } else {
          await SPLAT.Loader.LoadAsync(sceneUrl, splatScene, onProgress);
        }

        if (disposed) return;
        setStatus("ready");

        const frame = () => {
          if (disposed || !renderer || !controls) return;
          controls.update();
          renderer.resize();
          renderer.render(splatScene, camera);
          animationFrame = requestAnimationFrame(frame);
        };
        animationFrame = requestAnimationFrame(frame);
      } catch (caught) {
        if (disposed) return;
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "Unable to load this scene");
      }
    }

    void load();

    return () => {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      controls?.dispose();
      renderer?.dispose();
      canvas.remove();
    };
  }, [sceneId, sceneUrl, plyScene, quality, resetToken]);

  return (
    <section className={`viewer-surface viewer-${background}`}>
      <div ref={mountRef} className="viewer-canvas" />
      {!scene && (
        <div className="viewer-empty">
          <span className="eyebrow">Gaussi</span>
          <h1>Open a `.ply` scene or convert a video.</h1>
        </div>
      )}
      {scene && status === "loading" && (
        <div className="viewer-state">
          <span className="loader" />
          <p>
            Loading {sceneName}
            {progress > 0 ? ` ${progress}%` : ""}
          </p>
        </div>
      )}
      {scene && status === "failed" && (
        <div className="viewer-state viewer-error">
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
