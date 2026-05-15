import {
  Badge,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton
} from "@mantine/core";
import { Box, Check, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { Scene } from "../types";
import { formatBytes, formatDate } from "../utils";

type Props = {
  scenes: Scene[];
  selectedSceneId?: string;
  onSelect: (scene: Scene) => void;
};

function sourceLabel(scene: Scene): string {
  if (scene.sourceKind === "video_conversion") return "Video";
  if (scene.sourceKind === "local") return "Local";
  return "PLY";
}

export function SceneRail({ scenes, selectedSceneId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scenes;
    return scenes.filter((scene) => scene.name.toLowerCase().includes(normalized));
  }, [query, scenes]);

  return (
    <Stack h="100%" gap="sm">
      <Group justify="space-between" align="end">
        <div>
          <Text size="xs" fw={800} c="cyan.4" tt="uppercase">
            Library
          </Text>
          <Title order={3}>{scenes.length} scenes</Title>
        </div>
      </Group>
      <TextInput
        leftSection={<Search size={16} />}
        placeholder="Search scenes"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ScrollArea flex={1} offsetScrollbars>
        <Stack gap="xs" pr="xs">
          {filtered.map((scene) => {
            const selected = scene.id === selectedSceneId;
            return (
              <UnstyledButton
                key={scene.id}
                className="scene-button"
                data-selected={selected || undefined}
                onClick={() => onSelect(scene)}
              >
                <Group wrap="nowrap" gap="sm">
                  <ThemeIcon variant={selected ? "filled" : "light"} color={selected ? "green" : "gray"}>
                    {selected ? <Check size={16} /> : <Box size={16} />}
                  </ThemeIcon>
                  <Stack gap={2} flex={1} miw={0}>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={700} truncate>
                        {scene.name}
                      </Text>
                      <Badge size="xs" variant="light">
                        {sourceLabel(scene)}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                      {formatBytes(scene.sizeBytes)} / {formatDate(scene.createdAt)}
                    </Text>
                  </Stack>
                </Group>
              </UnstyledButton>
            );
          })}
          {filtered.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No scenes match that search.
            </Text>
          ) : null}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
