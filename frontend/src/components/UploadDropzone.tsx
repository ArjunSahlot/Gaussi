import { Group, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { FileUp, UploadCloud, X } from "lucide-react";

type Props = {
  disabled?: boolean;
  maxUploadMb?: number;
  onFiles: (files: File[]) => void;
  onReject?: (message: string) => void;
};

const acceptedTypes = {
  "application/octet-stream": [".ply"],
  "model/ply": [".ply"],
  "video/mp4": [".mp4", ".m4v"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "video/x-matroska": [".mkv"],
  "video/x-msvideo": [".avi"]
};

export function UploadDropzone({ disabled = false, maxUploadMb, onFiles, onReject }: Props) {
  return (
    <Dropzone
      accept={acceptedTypes}
      disabled={disabled}
      maxSize={(maxUploadMb ?? 1024) * 1024 ** 2}
      multiple
      onDrop={onFiles}
      onReject={(rejections) => {
        const first = rejections[0];
        const message = first?.errors[0]?.message ?? "File rejected";
        onReject?.(message);
      }}
      radius="sm"
      p="md"
    >
      <Group justify="center" gap="md" mih={110} style={{ pointerEvents: "none" }}>
        <Dropzone.Accept>
          <FileUp size={34} color="var(--mantine-color-green-5)" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <X size={34} color="var(--mantine-color-red-5)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <UploadCloud size={34} color="var(--mantine-color-dimmed)" />
        </Dropzone.Idle>
        <Stack gap={2}>
          <Text fw={700}>Drop files or click to upload</Text>
          <Text size="sm" c="dimmed">
            .ply scenes and video sources
          </Text>
          {maxUploadMb ? (
            <Text size="xs" c="dimmed">
              Limit {maxUploadMb} MB
            </Text>
          ) : null}
        </Stack>
      </Group>
    </Dropzone>
  );
}
