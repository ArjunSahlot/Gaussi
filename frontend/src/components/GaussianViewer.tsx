import { useEffect, useRef, useState } from "react";

import type { Scene, ViewerBackground, ViewerQuality } from "../types";

type ViewerStatus = "idle" | "loading" | "ready" | "failed";

type Props = {
  scene: Scene | null;
  background: ViewerBackground;
  quality: ViewerQuality;
  resetToken: number;
};

const cameraByQuality: Record<ViewerQuality, Record<string, unknown>> = {
  fast: {
    sphericalHarmonicsDegree: 0,
    sharedMemoryForWorkers: false,
    ignoreDevicePixelRatio: true
  },
  balanced: {
    sphericalHarmonicsDegree: 1,
    sharedMemoryForWorkers: false
  },
  studio: {
    sphericalHarmonicsDegree: 2,
    sharedMemoryForWorkers: false
  }
};

export function GaussianViewer({ scene, background, quality, resetToken }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !scene) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    let viewer:
      | {
          addSplatScene: (path: string, options?: Record<string, unknown>) => Promise<void>;
          start: () => void;
          stop?: () => void;
          dispose?: () => void;
          removeSplatScenes?: () => Promise<void>;
        }
      | undefined;

    mount.replaceChildren();
    setStatus("loading");
    setError("");

    async function load() {
      try {
        const GaussianSplats3D = await import("@mkkellogg/gaussian-splats-3d");
        viewer = new GaussianSplats3D.Viewer({
          rootElement: mount,
          cameraUp: [0, -1, 0.4],
          initialCameraPosition: [2.8, -4.2, 2.2],
          initialCameraLookAt: [0, 0, 0.2],
          dynamicScene: true,
          useBuiltInControls: true,
          webXRMode: "None",
          ...cameraByQuality[quality]
        });

        await viewer.addSplatScene(scene!.plyUrl, {
          progressiveLoad: true,
          showLoadingUI: false,
          splatAlphaRemovalThreshold: quality === "fast" ? 10 : 5
        });

        if (disposed) return;
        viewer.start();
        setStatus("ready");
      } catch (caught) {
        if (disposed) return;
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "Unable to load this scene");
      }
    }

    void load();

    return () => {
      disposed = true;
      try {
        viewer?.stop?.();
        viewer?.dispose?.();
      } catch (e) {
        console.warn("Viewer dispose error:", e);
      }
      mount.replaceChildren();
    };
  }, [scene, quality, resetToken]);

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
          <p>Loading {scene.name}</p>
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
