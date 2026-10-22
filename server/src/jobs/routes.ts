import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { subscribeTo } from '../events';
import { enqueueResearch, enqueueTedImport, JOBS_STREAM, type JobEvent } from './queues';

// Mounted at /api in index.ts.
export const jobsRoutes = new Hono();

// Manually trigger a TED import. Body (optional): { since?, limit? }
jobsRoutes.post('/jobs/ted-import', async (c) => {
  const body = await c.req.json<{ since?: string; limit?: number }>().catch(() => ({}) as { since?: string; limit?: number });
  const jobId = await enqueueTedImport({ since: body.since, limit: body.limit });
  return c.json({ jobId }, 202);
});

// Queue web research on a competitor organisation. Body (optional): { force? }
jobsRoutes.post('/competitors/:id/research', async (c) => {
  const body = await c.req.json<{ force?: boolean }>().catch(() => ({}) as { force?: boolean });
  const jobId = await enqueueResearch([c.req.param('id')], { force: body.force });
  return c.json({ jobId }, 202);
});

// Job lifecycle events (Redis Stream `jobs:events`) over SSE; resumes via Last-Event-ID.
jobsRoutes.get('/jobs/events', (c) => {
  const lastId = c.req.header('Last-Event-ID') ?? c.req.query('since') ?? '$';
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    for await (const item of subscribeTo<JobEvent>(JOBS_STREAM, lastId, abort.signal)) {
      if (!item) {
        await stream.writeSSE({ event: 'ping', data: '' });
        continue;
      }
      await stream.writeSSE({ id: item.id, event: item.event.type, data: JSON.stringify(item.event) });
    }
  });
});
