import { Gauge, Moon, RotateCcw, Sun, Target, Wand2 } from "lucide-react";

import type { ViewerBackground, ViewerQuality } from "../types";

type Props = {
  background: ViewerBackground;
  quality: ViewerQuality;
  onBackgroundChange: (background: ViewerBackground) => void;
  onQualityChange: (quality: ViewerQuality) => void;
  onReset: () => void;
};

export function ViewerToolbar({
  background,
  quality,
  onBackgroundChange,
  onQualityChange,
  onReset
}: Props) {
  return (
    <div className="viewer-toolbar" aria-label="Viewer controls">
      <button type="button" title="Reset camera" onClick={onReset}>
        <RotateCcw size={18} />
      </button>
      <button type="button" title="Frame scene" onClick={onReset}>
        <Target size={18} />
      </button>
      <div className="segmented" aria-label="Background">
        <button
          type="button"
          title="Grid background"
          className={background === "grid" ? "is-active" : ""}
          onClick={() => onBackgroundChange("grid")}
        >
          <Gauge size={17} />
        </button>
        <button
          type="button"
          title="Dark background"
          className={background === "dark" ? "is-active" : ""}
          onClick={() => onBackgroundChange("dark")}
        >
          <Moon size={17} />
        </button>
        <button
          type="button"
          title="Light background"
          className={background === "light" ? "is-active" : ""}
          onClick={() => onBackgroundChange("light")}
        >
          <Sun size={17} />
        </button>
      </div>
      <div className="quality-select">
        <Wand2 size={16} />
        <select
          value={quality}
          title="Render quality"
          onChange={(event) => onQualityChange(event.target.value as ViewerQuality)}
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="studio">Studio</option>
        </select>
      </div>
    </div>
  );
}
