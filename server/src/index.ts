import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq } from 'drizzle-orm';
import { auth, requireAuth, runAuthMigrations, sessionMiddleware, type AuthVariables } from './auth';
import { db, runMigrations, schema } from './db';
import { publish, redis, subscribe } from './events';
import { jobsRoutes } from './jobs/routes';
import { startWorkers } from './jobs/worker';
import { mastra, memory } from './mastra';
import { mcpRoutes } from './mcp';
import { userRequestContext } from './mastra/context';
import { autopilotRoutes } from './routes/autopilot';
import { data } from './routes/data';
import { matchesRoutes } from './routes/matches';

const hasModelKey = Boolean(process.env.ANTHROPIC_API_KEY);

const app = new Hono<{ Variables: AuthVariables }>();

// BetterAuth endpoints (sign-up, sign-in, sign-out, get-session, ...).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Load the session for every API request, then require it for everything
// except health and auth. Routes added later under /api/* are covered too.
app.use('/api/*', sessionMiddleware);
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/health' || path.startsWith('/api/auth/')) return next();
  return requireAuth(c, next);
});

app.get('/api/health', async (c) => {
  const redisOk = await redis.ping().then(() => true, () => false);
  return c.json({ ok: true, model: hasModelKey, redis: redisOk });
});

app.get('/api/me', async (c) => {
  const user = c.get('user')!;
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.userId, user.id)).limit(1);
  return c.json({ user, company: company ?? null });
});

// A thread belongs to the user whose id is its Mastra resourceId. Threads that
// don't exist yet are treated as unclaimed (ids are random UUIDs).
async function threadAccess(threadId: string, userId: string) {
  const thread = await memory.getThreadById({ threadId });
  if (!thread) return 'missing' as const;
  return thread.resourceId === userId ? ('owned' as const) : ('forbidden' as const);
}

// Read-only TED data (tenders, competitors); behind the auth middleware above.
// Matches + competitor intelligence; mounted before `data` so /competitors/relevant
// and /competitors?forCompany=1 win over /competitors/:id.
app.route('/api', matchesRoutes);
app.route('/api', autopilotRoutes);
app.route('/api', data);

app.get('/api/threads/:threadId/messages', async (c) => {
  const threadId = c.req.param('threadId');
  const userId = c.get('user')!.id;
  const access = await threadAccess(threadId, userId);
  if (access === 'forbidden') return c.json({ error: 'Forbidden' }, 403);
  if (access === 'missing') return c.json({ messages: [] });
  const { messages } = await memory.recall({ threadId, resourceId: userId });
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

  const userId = c.get('user')!.id;
  const access = await threadAccess(threadId, userId);
  if (access === 'forbidden') return c.json({ error: 'Forbidden' }, 403);
  if (access === 'missing') await memory.createThread({ threadId, resourceId: userId });

  const runId = crypto.randomUUID();
  await publish(threadId, { type: 'user.message', messageId: messageId ?? crypto.randomUUID(), content: message });
  void runAgent(threadId, userId, runId, message);
  return c.json({ runId }, 202);
});

async function runAgent(threadId: string, resourceId: string, runId: string, message: string) {
  await publish(threadId, { type: 'run.started', runId });
  try {
    if (!hasModelKey) {
      const reply = 'No ANTHROPIC_API_KEY configured yet — the agent is wired up but has no model. You said: ' + message;
      await publish(threadId, { type: 'text.delta', runId, delta: reply });
    } else {
      const agent = mastra.getAgent('assistant');
      const result = await agent.stream(message, {
        memory: { thread: threadId, resource: resourceId },
        requestContext: userRequestContext(resourceId),
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
app.get('/api/threads/:threadId/events', async (c) => {
  const threadId = c.req.param('threadId');
  if ((await threadAccess(threadId, c.get('user')!.id)) === 'forbidden') return c.json({ error: 'Forbidden' }, 403);
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

// Background jobs: POST /api/jobs/ted-import, POST /api/competitors/:id/research, GET /api/jobs/events
app.route('/api', jobsRoutes);

// MCP server + OAuth discovery (/mcp, /.well-known/*); Bearer-token auth, not sessions.
app.route('/', mcpRoutes);

// Serve the built frontend in production.
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ path: './public/index.html' }));

await runMigrations();
await runAuthMigrations();
if (process.env.SEED_DEMO === '1') {
  const { seedDemo } = await import('./seed/demo');
  await seedDemo().catch((err) => console.error('demo seed failed', err));
}
if (process.env.WORKER !== '0') await startWorkers();

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
