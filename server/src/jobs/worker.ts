import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { companies } from '../db/schema';
import { invalidateAwardIndex } from '../lib/competitors';
import { buildDossier } from '../lib/dossier';
import { gradePredictions, runBacktest } from '../lib/learning';
import { refreshMatches } from '../lib/matching';
import { researchOrganisation, type ResearchResult } from '../lib/research';
import {
  bullConnection,
  enqueueAutopilot,
  type AutopilotJobData,
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
  // Joint bids (groupements): read the XML of new award notices that report one.
  const { enrichParties } = await import('../importers/ted-parties');
  const parties = await enrichParties({
    limit: 300,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) void reportProgress(job, { current: done, total, message: `Reading joint bids ${done}/${total}` });
    },
  }).catch((err) => {
    console.error('[ted-import] joint-bid enrichment failed', err);
    return null;
  });
  invalidateAwardIndex();
  // New award notices may resolve earlier predictions; new tenders may match companies.
  const graded = await gradePredictions();
  await enqueueAutopilot({ kind: 'sweep' });
  await enqueueAutopilot({ kind: 'backtest' });
  return { ...result, graded: graded.graded, groupements: parties?.consortia ?? null };
}

async function processAutopilot(job: Job<AutopilotJobData>) {
  const data = job.data;
  if (data.kind === 'dossier') {
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId)).limit(1);
    if (!company) return { skipped: 'company deleted' };
    await pool.query(
      `UPDATE prebid_dossiers SET status = 'running', error = NULL, updated_at = now() WHERE company_id = $1 AND tender_id = $2`,
      [data.companyId, data.tenderId],
    );
    await reportProgress(job, { current: 0, total: 1, message: 'Reading the notice, buyer history and likely bidders' });
    try {
      const dossier = await buildDossier(company, data.tenderId);
      await pool.query(
        `UPDATE prebid_dossiers SET status = 'ready', content = $3, error = NULL, updated_at = now() WHERE company_id = $1 AND tender_id = $2`,
        [data.companyId, data.tenderId, dossier],
      );
      return { tenderId: data.tenderId, verdict: dossier.recommendation.verdict };
    } catch (err) {
      await pool.query(
        `UPDATE prebid_dossiers SET status = 'failed', error = $3, updated_at = now() WHERE company_id = $1 AND tender_id = $2`,
        [data.companyId, data.tenderId, (err as Error).message.slice(0, 500)],
      );
      throw err;
    }
  }
  if (data.kind === 'sweep') {
    const { rows } = await pool.query<{ user_id: string }>(`SELECT user_id FROM companies WHERE user_id IS NOT NULL`);
    let queued = 0;
    for (const [i, r] of rows.entries()) {
      await reportProgress(job, { current: i, total: rows.length, message: `Matching new tenders for company ${i + 1}/${rows.length}` });
      const res = await refreshMatches(r.user_id, { limit: 25 }).catch((err) => {
        console.error('[autopilot] sweep failed for a company', err);
        return null;
      });
      queued += res?.autopilot.length ?? 0;
    }
    return { companies: rows.length, dossiersQueued: queued };
  }
  return runBacktest({
    limit: data.limit,
    onProgress: (done, total) => void reportProgress(job, { current: done, total, message: `Backtesting ${done}/${total} past tenders` }),
  });
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
    wire(
      new Worker<AutopilotJobData>(QUEUE_NAMES.autopilot, processAutopilot, {
        connection: bullConnection(),
        prefix: QUEUE_PREFIX,
        concurrency: 2,
      }),
      'autopilot',
    ),
  ];
  // First boot: build the prediction scorecard once there is data to replay.
  const { rows } = await pool.query(`SELECT 1 FROM predictions WHERE source = 'backtest' LIMIT 1`).catch(() => ({ rows: [1] }));
  if (!rows.length) {
    await enqueueAutopilot({ kind: 'backtest' }).catch((err) => console.error('[jobs] failed to queue backtest', err));
  }
  if (process.env.TED_IMPORT_SCHEDULE !== '0') {
    await scheduleTedImport().catch((err) => console.error('[jobs] failed to schedule ted-import', err));
  }
  console.log('[jobs] workers started');
  return workers;
}
