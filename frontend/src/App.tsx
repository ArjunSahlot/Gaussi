import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";
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
  const totalSceneBytes = scenes.reduce((sum, scene) => sum + scene.sizeBytes, 0);
  const activeJobCount = jobs.filter((job) =>
    ["queued", "running", "canceling"].includes(job.status)
  ).length;

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
    }, activeJobCount > 0 ? 2500 : 7000);
    return () => window.clearInterval(interval);
  }, [activeJobCount, loadServerState]);

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

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 320, breakpoint: "md" }}
      aside={{ width: 380, breakpoint: "lg" }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Box className="brand-mark">G</Box>
            <div>
              <Text fw={900} lh={1}>
                Gaussi
              </Text>
              <Text size="xs" c="dimmed">
                Gaussian scene workbench
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Badge color={backendOnline ? "green" : "yellow"} variant="light">
              {backendOnline ? "API online" : "API offline"}
            </Badge>
            <ActionIcon variant="default" title="Refresh" onClick={() => void loadServerState()}>
              <RefreshCw size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <SceneRail
          scenes={scenes}
          selectedSceneId={selectedScene?.id}
          onSelect={(scene) => setSelectedSceneId(scene.id)}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack h="calc(100vh - 64px)" gap={0}>
          <Group className="stage-header" justify="space-between" wrap="nowrap">
            <div>
              <Text size="xs" fw={800} c="cyan.4" tt="uppercase">
                Viewer
              </Text>
              <Title order={2} className="viewer-title">
                {selectedScene?.name ?? "Ready"}
              </Title>
            </div>
            <ViewerToolbar
              background={background}
              quality={quality}
              onBackgroundChange={setBackground}
              onQualityChange={setQuality}
              onReset={() => setResetToken((value) => value + 1)}
            />
          </Group>
          <Box flex={1} mih={0}>
            <GaussianViewer
              scene={selectedScene}
              background={background}
              quality={quality}
              resetToken={resetToken}
            />
          </Box>
        </Stack>
      </AppShell.Main>

      <AppShell.Aside p="md">
        <Stack gap="md">
          <Paper withBorder p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="end">
                <div>
                  <Text size="xs" fw={800} c="cyan.4" tt="uppercase">
                    Input
                  </Text>
                  <Title order={3}>Upload</Title>
                </div>
              </Group>
              <UploadDropzone
                maxUploadMb={config?.maxUploadMb}
                onFiles={(files) => void handleFiles(files)}
                onReject={setNotice}
              />
              {notice ? (
                <Alert
                  color={backendOnline ? "blue" : "yellow"}
                  icon={backendOnline ? <AlertCircle size={16} /> : <CloudOff size={16} />}
                  onClose={() => setNotice("")}
                  withCloseButton
                >
                  {notice}
                </Alert>
              ) : null}
            </Stack>
          </Paper>

          <SimpleGrid cols={3} spacing="xs">
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">
                Scenes
              </Text>
              <Text fw={800}>{scenes.length}</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">
                Storage
              </Text>
              <Text fw={800}>{formatBytes(totalSceneBytes)}</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text size="xs" c="dimmed">
                Jobs
              </Text>
              <Text fw={800}>{activeJobCount}</Text>
            </Paper>
          </SimpleGrid>

          <Paper withBorder p="md">
            <JobPanel
              jobs={jobs}
              onOpenScene={openJobScene}
              onRefresh={() => void loadServerState()}
              onNotice={setNotice}
            />
          </Paper>
        </Stack>
      </AppShell.Aside>
    </AppShell>
  );
}
