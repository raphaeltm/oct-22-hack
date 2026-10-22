import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { mastra, memory } from './mastra';

const RESOURCE_ID = 'default-user';
const hasModelKey = Boolean(process.env.ANTHROPIC_API_KEY);

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, model: hasModelKey }));

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

app.post('/api/chat', async (c) => {
  const { threadId, message } = await c.req.json<{ threadId: string; message: string }>();
  if (!threadId || !message) return c.json({ error: 'threadId and message are required' }, 400);

  if (!hasModelKey) {
    return streamText(c, async (stream) => {
      await stream.write('No ANTHROPIC_API_KEY configured yet — the agent is wired up but has no model. You said: ' + message);
    });
  }

  const agent = mastra.getAgent('assistant');
  const result = await agent.stream(message, {
    memory: { thread: threadId, resource: RESOURCE_ID },
  });

  return streamText(c, async (stream) => {
    for await (const chunk of result.textStream) {
      await stream.write(chunk);
    }
  });
});

// Serve the built frontend in production.
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ path: './public/index.html' }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
