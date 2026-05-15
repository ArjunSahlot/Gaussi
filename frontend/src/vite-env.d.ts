/// <reference types="vite/client" />

declare module "@mkkellogg/gaussian-splats-3d" {
  export const Viewer: new (options: Record<string, unknown>) => {
    addSplatScene: (path: string, options?: Record<string, unknown>) => Promise<void>;
    start: () => void;
    stop?: () => void;
    dispose?: () => void;
    removeSplatScenes?: () => Promise<void>;
  };
}
