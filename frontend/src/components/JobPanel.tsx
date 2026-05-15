import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Loader2, RotateCcw, Square } from "lucide-react";
import { useState } from "react";

import { cancelJob, fetchJobEvents, fetchJobLogs, retryJob } from "../api";
import type { ConversionJob, JobEvent, JobLogs } from "../types";
import { formatDate } from "../utils";

type Props = {
  jobs: ConversionJob[];
  onOpenScene: (job: ConversionJob) => void;
  onRefresh: () => void;
  onNotice: (message: string) => void;
};

function statusColor(status: ConversionJob["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "canceling" || status === "canceled") return "yellow";
  if (status === "running") return "blue";
  return "gray";
}

function StatusIcon({ status }: { status: ConversionJob["status"] }) {
  if (status === "completed") return <CheckCircle2 size={16} />;
  if (status === "failed") return <AlertTriangle size={16} />;
  if (status === "running" || status === "canceling") return <Loader2 className="spin" size={16} />;
  return <Clock3 size={16} />;
}

function progressValue(job: ConversionJob): number {
  if (job.status === "completed") return 100;
  if (!job.totalSteps) return 0;
  return Math.max(5, Math.min(95, ((job.currentStepIndex - 1) / job.totalSteps) * 100));
}

export function JobPanel({ jobs, onOpenScene, onRefresh, onNotice }: Props) {
  const [opened, modal] = useDisclosure(false);
  const [inspectedJob, setInspectedJob] = useState<ConversionJob | null>(null);
  const [logs, setLogs] = useState<JobLogs | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);

  async function inspect(job: ConversionJob) {
    setInspectedJob(job);
    modal.open();
    try {
      const [nextLogs, nextEvents] = await Promise.all([fetchJobLogs(job.id), fetchJobEvents(job.id)]);
      setLogs(nextLogs);
      setEvents(nextEvents);
    } catch (caught) {
      onNotice(caught instanceof Error ? caught.message : "Could not load job logs");
    }
  }

  async function cancel(job: ConversionJob) {
    try {
      await cancelJob(job.id);
      onNotice(`Cancel requested for ${job.sourceFileName}`);
      onRefresh();
    } catch (caught) {
      onNotice(caught instanceof Error ? caught.message : "Cancel failed");
    }
  }

  async function retry(job: ConversionJob) {
    try {
      await retryJob(job.id);
      onNotice(`${job.sourceFileName} requeued`);
      onRefresh();
    } catch (caught) {
      onNotice(caught instanceof Error ? caught.message : "Retry failed");
    }
  }

  return (
    <>
      <Stack gap="sm">
        <Group justify="space-between" align="end">
          <div>
            <Text size="xs" fw={800} c="cyan.4" tt="uppercase">
              Conversion
            </Text>
            <Text fw={800}>
              {jobs.filter((job) => job.status === "running" || job.status === "queued").length} active
            </Text>
          </div>
        </Group>
        <Stack gap="xs">
          {jobs.slice(0, 8).map((job) => (
            <Stack key={job.id} className="job-card" gap="xs">
              <Group wrap="nowrap" align="flex-start">
                <ThemeIcon color={statusColor(job.status)} variant="light">
                  <StatusIcon status={job.status} />
                </ThemeIcon>
                <Stack gap={3} flex={1} miw={0}>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={700} truncate>
                      {job.sourceFileName}
                    </Text>
                    <Badge size="xs" color={statusColor(job.status)} variant="light">
                      {job.status}
                    </Badge>
                  </Group>
                  <Text size="xs" c={job.error ? "red.3" : "dimmed"} truncate>
                    {job.error || job.currentStep || job.progressLabel}
                  </Text>
                  {job.lastLogLine ? (
                    <Text size="xs" c="dimmed" truncate>
                      {job.lastLogLine}
                    </Text>
                  ) : null}
                </Stack>
              </Group>
              <Progress value={progressValue(job)} color={statusColor(job.status)} size="xs" />
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  {formatDate(job.updatedAt)}
                </Text>
                <Group gap={4}>
                  <Tooltip label="Logs">
                    <ActionIcon variant="default" size="sm" onClick={() => void inspect(job)}>
                      <FileText size={15} />
                    </ActionIcon>
                  </Tooltip>
                  {job.status === "running" || job.status === "queued" || job.status === "canceling" ? (
                    <Tooltip label="Cancel">
                      <ActionIcon variant="default" color="yellow" size="sm" onClick={() => void cancel(job)}>
                        <Square size={13} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label="Retry">
                      <ActionIcon variant="default" size="sm" onClick={() => void retry(job)}>
                        <RotateCcw size={15} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {job.scene ? (
                    <Button size="xs" variant="light" onClick={() => onOpenScene(job)}>
                      Open
                    </Button>
                  ) : null}
                </Group>
              </Group>
            </Stack>
          ))}
          {jobs.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No conversion jobs yet.
            </Text>
          ) : null}
        </Stack>
      </Stack>

      <Modal
        opened={opened}
        onClose={modal.close}
        title={inspectedJob ? `Logs: ${inspectedJob.sourceFileName}` : "Logs"}
        size="xl"
      >
        <Stack>
          {inspectedJob ? (
            <Group gap="xs">
              <Badge color={statusColor(inspectedJob.status)}>{inspectedJob.status}</Badge>
              {inspectedJob.activeProcessPid ? (
                <Badge variant="light">PID {inspectedJob.activeProcessPid}</Badge>
              ) : null}
              {inspectedJob.lastHeartbeatAt ? (
                <Badge variant="light">Heartbeat {formatDate(inspectedJob.lastHeartbeatAt)}</Badge>
              ) : null}
            </Group>
          ) : null}
          <Timeline active={Math.max(0, events.length - 1)} bulletSize={20} lineWidth={2}>
            {events.map((event) => (
              <Timeline.Item key={event.id} title={event.message}>
                <Text size="xs" c="dimmed">
                  {event.stepLabel ? `${event.stepLabel} / ` : ""}
                  {formatDate(event.createdAt)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
          <ScrollArea h={320} type="always">
            <Code block className="log-tail">
              {logs?.tail || "No log output yet."}
            </Code>
          </ScrollArea>
        </Stack>
      </Modal>
    </>
  );
}
