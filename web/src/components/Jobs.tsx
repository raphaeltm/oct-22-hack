import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Icon } from './ui';

// Follows background job events (GET /api/jobs/events) and shows them as toasts.

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';
export type Job = {
  jobId: string;
  queue: string;
  name: string;
  status: JobStatus;
  progress?: { current: number; total: number; message?: string };
  error?: string;
  at: string;
};

const JobsContext = createContext<Record<string, Job>>({});

/** Live state of background jobs keyed by jobId. */
export function useJobs() {
  return useContext(JobsContext);
}

const STATUS: Record<string, JobStatus> = {
  'job.queued': 'queued',
  'job.active': 'active',
  'job.progress': 'active',
  'job.completed': 'completed',
  'job.failed': 'failed',
};

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const source = new EventSource('/api/jobs/events');
    const onEvent = (e: MessageEvent) => {
      const ev = JSON.parse(e.data);
      setJobs((all) => {
        const prev = all[ev.jobId];
        return {
          ...all,
          [ev.jobId]: {
            jobId: ev.jobId,
            queue: ev.queue,
            name: ev.name,
            at: ev.at,
            status: STATUS[ev.type] ?? prev?.status ?? 'queued',
            progress: ev.progress ?? prev?.progress,
            error: ev.error ?? prev?.error,
          },
        };
      });
      if (ev.type === 'job.completed' || ev.type === 'job.failed') {
        window.setTimeout(() => setDismissed((d) => new Set(d).add(ev.jobId)), 6000);
      }
    };
    for (const type of Object.keys(STATUS)) source.addEventListener(type, onEvent);
    return () => source.close();
  }, []);

  const visible = Object.values(jobs)
    .filter((j) => !dismissed.has(j.jobId))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-3);

  return (
    <JobsContext.Provider value={jobs}>
      {children}
      {visible.length > 0 && (
        <div className="toasts" aria-live="polite">
          {visible.map((j) => (
            <JobToast key={j.jobId} job={j} onClose={() => setDismissed((d) => new Set(d).add(j.jobId))} />
          ))}
        </div>
      )}
    </JobsContext.Provider>
  );
}

const AUTOPILOT_LABELS: Record<string, string> = {
  dossier: 'Autopilot: pre-bid dossier',
  sweep: 'Autopilot: matching new tenders',
  backtest: 'Autopilot: grading predictions',
};

function JobToast({ job, onClose }: { job: Job; onClose: () => void }) {
  const label =
    job.queue === 'research'
      ? 'Competitor research'
      : job.queue === 'ted-import'
        ? 'TED import'
        : job.queue === 'autopilot'
          ? AUTOPILOT_LABELS[job.name] ?? 'Autopilot'
          : job.name;
  const p = job.progress;
  const pct = p && p.total ? Math.round((p.current / p.total) * 100) : null;
  const message =
    job.status === 'failed'
      ? job.error ?? 'Failed'
      : job.status === 'completed'
        ? 'Done'
        : p?.message ?? (job.status === 'queued' ? 'Queued…' : 'Running…');

  return (
    <div className={`toast ${job.status}`}>
      <div className="toast-icon">
        {job.status === 'completed' ? '✓' : job.status === 'failed' ? '!' : <span className="spinner sm" />}
      </div>
      <div className="toast-body">
        <div className="toast-title">{label}</div>
        <div className="toast-msg">{message}</div>
        {(job.status === 'active' || job.status === 'queued') && (
          <div className="toast-bar">
            <span className={pct == null ? 'indeterminate' : ''} style={pct == null ? undefined : { width: `${pct}%` }} />
          </div>
        )}
      </div>
      <button className="icon-btn" onClick={onClose} title="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
