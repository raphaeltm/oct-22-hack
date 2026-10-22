import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { publishTo } from '../events';

// BullMQ queues on REDIS_URL. Keys are namespaced under `rfp:` so they can
// share a Redis with other apps. Job lifecycle events are mirrored to the
// `jobs:events` Redis Stream and served over SSE at GET /api/jobs/events.

export const JOBS_STREAM = 'jobs:events';
export const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? 'rfp';

export const QUEUE_NAMES = { tedImport: 'ted-import', research: 'research', autopilot: 'autopilot' } as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface TedImportJobData {
  since?: string;
  limit?: number;
}

export interface ResearchJobData {
  organisationIds: string[];
  force?: boolean;
}

/** Autopilot jobs: build one pre-bid dossier, sweep all companies, or backtest predictions / the partner finder. */
export type AutopilotJobData =
  | { kind: 'dossier'; companyId: string; tenderId: string }
  | { kind: 'sweep' }
  | { kind: 'backtest'; limit?: number }
  | { kind: 'partner-backtest'; limit?: number };

export interface JobProgress {
  current: number;
  total: number;
  message?: string;
}

export type JobEvent = { queue: QueueName; jobId: string; name: string; at: string } & (
  | { type: 'job.queued'; data: unknown }
  | { type: 'job.active' }
  | { type: 'job.progress'; progress: JobProgress }
  | { type: 'job.completed'; result: unknown }
  | { type: 'job.failed'; error: string }
);

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export async function publishJobEvent(event: DistributiveOmit<JobEvent, 'at'>) {
  await publishTo(JOBS_STREAM, { ...event, at: new Date().toISOString() }).catch((err) =>
    console.error('failed to publish job event', err),
  );
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ requires maxRetriesPerRequest: null on connections used by workers.
export const bullConnection = () => new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const connection = bullConnection();
const defaultJobOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
};

export const tedImportQueue = new Queue<TedImportJobData>(QUEUE_NAMES.tedImport, {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions,
});

export const researchQueue = new Queue<ResearchJobData>(QUEUE_NAMES.research, {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions,
});

export const autopilotQueue = new Queue<AutopilotJobData>(QUEUE_NAMES.autopilot, {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions,
});

/** Queue an autopilot job. Job events only carry the tender id (the stream is shared by all users). */
export async function enqueueAutopilot(data: AutopilotJobData) {
  const name = data.kind === 'dossier' ? 'dossier' : data.kind;
  const job = await autopilotQueue.add(name, data);
  const publicData = data.kind === 'dossier' ? { tenderId: data.tenderId } : {};
  await publishJobEvent({ type: 'job.queued', queue: 'autopilot', jobId: job.id!, name, data: publicData });
  return job.id!;
}

export async function enqueueTedImport(data: TedImportJobData = {}) {
  const job = await tedImportQueue.add('ted-import', data);
  await publishJobEvent({ type: 'job.queued', queue: 'ted-import', jobId: job.id!, name: job.name, data });
  return job.id!;
}

export async function enqueueResearch(organisationIds: string[], opts: { force?: boolean } = {}) {
  const data: ResearchJobData = { organisationIds, force: opts.force };
  const job = await researchQueue.add('research', data);
  await publishJobEvent({ type: 'job.queued', queue: 'research', jobId: job.id!, name: job.name, data });
  return job.id!;
}

const TED_IMPORT_EVERY_MS = Number(process.env.TED_IMPORT_EVERY_MS ?? 6 * 60 * 60 * 1000);

/** Registers (idempotently) the repeatable TED import, every 6h by default. */
export async function scheduleTedImport() {
  await tedImportQueue.upsertJobScheduler(
    'ted-import-every-6h',
    { every: TED_IMPORT_EVERY_MS },
    { name: 'ted-import:scheduled', data: {} },
  );
}
