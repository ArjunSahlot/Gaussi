import { Box, Check, CircleDot, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { Scene } from "../types";
import { formatBytes, formatDate } from "../utils";

type Props = {
  scenes: Scene[];
  selectedSceneId?: string;
  onSelect: (scene: Scene) => void;
};

export function SceneRail({ scenes, selectedSceneId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scenes;
    return scenes.filter((scene) => scene.name.toLowerCase().includes(normalized));
  }, [query, scenes]);

  return (
    <section className="panel library-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Library</span>
          <h2>{scenes.length} scenes</h2>
        </div>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search scenes"
        />
      </label>
      <div className="scene-list">
        {filtered.map((scene) => {
          const selected = scene.id === selectedSceneId;
          return (
            <button
              key={scene.id}
              className={`scene-row ${selected ? "is-selected" : ""}`}
              type="button"
              onClick={() => onSelect(scene)}
            >
              <span className="scene-icon">{selected ? <Check size={16} /> : <Box size={16} />}</span>
              <span className="scene-copy">
                <strong>{scene.name}</strong>
                <span>
                  {scene.sourceKind === "video_conversion" ? "Video" : scene.sourceKind === "local" ? "Local" : "PLY"}
                  {" / "}
                  {formatBytes(scene.sizeBytes)}
                </span>
              </span>
              <span className="scene-date">
                <CircleDot size={10} />
                {formatDate(scene.createdAt)}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="empty-copy">No scenes match that search.</p>}
      </div>
    </section>
  );
}
