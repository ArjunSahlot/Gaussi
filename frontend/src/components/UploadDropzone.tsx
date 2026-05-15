import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  maxUploadMb?: number;
  onFiles: (files: File[]) => void;
};

export function UploadDropzone({ disabled = false, maxUploadMb, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || disabled) return;
    onFiles(Array.from(fileList));
  }

  return (
    <div
      className={`dropzone ${isDragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept=".ply,video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <button
        className="dropzone-button"
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud size={18} />
        <span>Add files</span>
      </button>
      <p>.ply, .mp4, .mov, .webm, .mkv</p>
      {maxUploadMb ? <small>Limit {maxUploadMb} MB</small> : null}
    </div>
  );
}
