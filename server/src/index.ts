import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runMigrations } from './db';
import { publish, redis, subscribe } from './events';
import { mastra, memory } from './mastra';

const RESOURCE_ID = 'default-user';
const hasModelKey = Boolean(process.env.ANTHROPIC_API_KEY);

const app = new Hono();

app.get('/api/health', async (c) => {
  const redisOk = await redis.ping().then(() => true, () => false);
  return c.json({ ok: true, model: hasModelKey, redis: redisOk });
});

app.get('/api/threads/:threadId/messages', async (c) => {
  const threadId = c.req.param('threadId');
  const thread = await memory.getThreadById({ threadId });
  if (!thread) return c.json({ messages: [] });
  const { messages } = await memory.recall({ threadId, resourceId: RESOURCE_ID });
  return c.json({
    messages: messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content.parts
          .map((p) => (p.type === 'text' ? p.text : ''))
          .join(''),
      }))
      .filter((m) => m.content),
  });
});

// Starts an agent run and returns immediately; output is delivered via the
// thread's event stream (GET /api/threads/:threadId/events).
app.post('/api/chat', async (c) => {
  const { threadId, message, messageId } = await c.req.json<{
    threadId: string;
    message: string;
    messageId?: string;
  }>();
  if (!threadId || !message) return c.json({ error: 'threadId and message are required' }, 400);

  const runId = crypto.randomUUID();
  await publish(threadId, { type: 'user.message', messageId: messageId ?? crypto.randomUUID(), content: message });
  void runAgent(threadId, runId, message);
  return c.json({ runId }, 202);
});

async function runAgent(threadId: string, runId: string, message: string) {
  await publish(threadId, { type: 'run.started', runId });
  try {
    if (!hasModelKey) {
      const reply = 'No ANTHROPIC_API_KEY configured yet — the agent is wired up but has no model. You said: ' + message;
      await publish(threadId, { type: 'text.delta', runId, delta: reply });
    } else {
      const agent = mastra.getAgent('assistant');
      const result = await agent.stream(message, {
        memory: { thread: threadId, resource: RESOURCE_ID },
      });
      for await (const delta of result.textStream) {
        await publish(threadId, { type: 'text.delta', runId, delta });
      }
    }
    await publish(threadId, { type: 'run.finished', runId });
  } catch (err) {
    console.error('agent run failed', err);
    await publish(threadId, { type: 'run.error', runId, error: (err as Error).message }).catch(() => {});
  }
}

// Realtime thread events over SSE. Browsers resume via Last-Event-ID.
app.get('/api/threads/:threadId/events', (c) => {
  const threadId = c.req.param('threadId');
  const lastId = c.req.header('Last-Event-ID') ?? c.req.query('since') ?? '$';
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    for await (const item of subscribe(threadId, lastId, abort.signal)) {
      if (!item) {
        await stream.writeSSE({ event: 'ping', data: '' });
        continue;
      }
      await stream.writeSSE({ id: item.id, event: item.event.type, data: JSON.stringify(item.event) });
    }
  });
});

// Serve the built frontend in production.
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ path: './public/index.html' }));

await runMigrations();

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
