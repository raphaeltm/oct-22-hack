import { Worker, type Job } from 'bullmq';
import { researchOrganisation, type ResearchResult } from '../lib/research';
import {
  bullConnection,
  publishJobEvent,
  QUEUE_NAMES,
  QUEUE_PREFIX,
  scheduleTedImport,
  type JobProgress,
  type QueueName,
  type ResearchJobData,
  type TedImportJobData,
} from './queues';

// In-process BullMQ workers, started from index.ts unless WORKER=0.

async function reportProgress(job: Job, progress: JobProgress) {
  await job.updateProgress(progress as unknown as object); // emits worker 'progress' -> job.progress event
}

async function processTedImport(job: Job<TedImportJobData>) {
  // Imported lazily so the API boots even if the importer has a load-time problem.
  const mod = await import('../importers/ted');
  let last = 0;
  const result = await mod.importTed({
    since: job.data.since,
    limit: job.data.limit,
    onProgress: (n) => {
      // Throttle: one event per 25 notices.
      if (n - last < 25) return;
      last = n;
      void reportProgress(job, { current: n, total: job.data.limit ?? 0, message: `Imported ${n} notices` });
    },
  });
  return result;
}

async function processResearch(job: Job<ResearchJobData>) {
  const ids = job.data.organisationIds ?? [];
  const results: ResearchResult[] = [];
  for (const [i, id] of ids.entries()) {
    const step = (message: string) => reportProgress(job, { current: i, total: ids.length, message });
    await step(`Researching ${i + 1}/${ids.length} competitors`);
    results.push(await researchOrganisation(id, { force: job.data.force, onProgress: step }));
  }
  await reportProgress(job, { current: ids.length, total: ids.length, message: 'Research complete' });
  return { results };
}

function wire(worker: Worker, queue: QueueName) {
  const base = (job: Job) => ({ queue, jobId: job.id!, name: job.name });
  worker.on('active', (job) => void publishJobEvent({ type: 'job.active', ...base(job) }));
  worker.on('progress', (job, progress) =>
    void publishJobEvent({ type: 'job.progress', ...base(job), progress: progress as unknown as JobProgress }),
  );
  worker.on('completed', (job, result) => void publishJobEvent({ type: 'job.completed', ...base(job), result }));
  worker.on('failed', (job, err) => {
    console.error(`[jobs] ${queue} job ${job?.id} failed:`, err.message);
    if (job) void publishJobEvent({ type: 'job.failed', ...base(job), error: err.message });
  });
  worker.on('error', (err) => console.error(`[jobs] ${queue} worker error`, err));
  return worker;
}

export async function startWorkers() {
  const workers = [
    wire(
      new Worker<TedImportJobData>(QUEUE_NAMES.tedImport, processTedImport, {
        connection: bullConnection(),
        prefix: QUEUE_PREFIX,
        concurrency: 1,
      }),
      'ted-import',
    ),
    wire(
      new Worker<ResearchJobData>(QUEUE_NAMES.research, processResearch, {
        connection: bullConnection(),
        prefix: QUEUE_PREFIX,
        concurrency: 2,
      }),
      'research',
    ),
  ];
  if (process.env.TED_IMPORT_SCHEDULE !== '0') {
    await scheduleTedImport().catch((err) => console.error('[jobs] failed to schedule ted-import', err));
  }
  console.log('[jobs] workers started');
  return workers;
}
