import { ActionIcon, Group, SegmentedControl, Select } from "@mantine/core";
import { Gauge, Moon, RotateCcw, Sun } from "lucide-react";

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
    <Group gap="xs" wrap="nowrap">
      <ActionIcon variant="default" title="Reset camera" onClick={onReset}>
        <RotateCcw size={18} />
      </ActionIcon>
      <SegmentedControl
        size="xs"
        value={background}
        onChange={(value) => onBackgroundChange(value as ViewerBackground)}
        data={[
          { label: <Gauge size={16} />, value: "grid" },
          { label: <Moon size={16} />, value: "dark" },
          { label: <Sun size={16} />, value: "light" }
        ]}
      />
      <Select
        w={122}
        size="xs"
        value={quality}
        onChange={(value) => value && onQualityChange(value as ViewerQuality)}
        data={[
          { value: "fast", label: "Fast" },
          { value: "balanced", label: "Balanced" },
          { value: "studio", label: "Studio" }
        ]}
      />
    </Group>
  );
}
