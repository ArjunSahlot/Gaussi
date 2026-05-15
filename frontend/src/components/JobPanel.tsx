import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import type { ConversionJob } from "../types";
import { formatDate } from "../utils";

type Props = {
  jobs: ConversionJob[];
  onOpenScene: (job: ConversionJob) => void;
};

function StatusIcon({ status }: { status: ConversionJob["status"] }) {
  if (status === "completed") return <CheckCircle2 size={16} />;
  if (status === "failed") return <AlertTriangle size={16} />;
  if (status === "running") return <Loader2 className="spin" size={16} />;
  return <Clock3 size={16} />;
}

export function JobPanel({ jobs, onOpenScene }: Props) {
  const activeJobs = jobs.slice(0, 8);

  return (
    <section className="panel jobs-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Conversion</span>
          <h2>{jobs.filter((job) => job.status === "running" || job.status === "queued").length} active</h2>
        </div>
      </div>
      <div className="job-list">
        {activeJobs.map((job) => (
          <div key={job.id} className={`job-row job-${job.status}`}>
            <span className="job-icon">
              <StatusIcon status={job.status} />
            </span>
            <span className="job-copy">
              <strong>{job.sourceFileName}</strong>
              <span>{job.error || job.progressLabel}</span>
              <small>{formatDate(job.updatedAt)}</small>
            </span>
            {job.scene ? (
              <button type="button" onClick={() => onOpenScene(job)}>
                Open
              </button>
            ) : null}
          </div>
        ))}
        {activeJobs.length === 0 && <p className="empty-copy">No conversion jobs yet.</p>}
      </div>
    </section>
  );
}
