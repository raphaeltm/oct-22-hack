import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getCompany, getPastBids, migrate, pool } from './db';
import { feedKey, publish, redis, subscribe, threadKey } from './events';
import { draftProfile, makeAnalyst, memory } from './mastra';
import { hasModelKey, MODEL } from './model';
import { learnRules, rescore, scan, startWatcher } from './radar';
import { searchAwards } from './ted';
import { seed } from './seed';

const RESOURCE_ID = 'default-user';

const app = new Hono();

app.get('/api/health', async (c) => {
  const redisOk = await redis.ping().then(() => true, () => false);
  const dbOk = await pool.query('select 1').then(() => true, () => false);
  const { rows } = await pool
    .query('select finished_at, error from scans where finished_at is not null order by id desc limit 1')
    .catch(() => ({ rows: [] as any[] }));
  const ted = rows[0] ? { ok: !rows[0].error, at: rows[0].finished_at, error: rows[0].error } : null;
  return c.json({ ok: true, model: hasModelKey ? MODEL : null, redis: redisOk, db: dbOk, ted });
});

// ---------- Companies ----------

app.get('/api/companies', async (c) => {
  const { rows } = await pool.query('select id, name from companies order by id');
  return c.json({ companies: rows });
});

app.post('/api/companies/draft', async (c) => {
  const { description } = await c.req.json<{ description: string }>();
  if (!hasModelKey) return c.json({ error: 'No model key configured' }, 503);
  return c.json({ profile: await draftProfile(description) });
});

type ProfileInput = {
  name: string;
  pitch: string;
  cpv: string[];
  countries: string[];
  keywords: string[];
  minValue?: number | null;
  maxValue?: number | null;
};

app.post('/api/companies', async (c) => {
  const p = await c.req.json<ProfileInput>();
  const { rows } = await pool.query(
    `insert into companies (name, pitch, cpv, countries, keywords, min_value, max_value)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [p.name, p.pitch, p.cpv, p.countries, p.keywords, p.minValue ?? null, p.maxValue ?? null],
  );
  const id = rows[0].id as number;
  void scan(id);
  return c.json({ id }, 201);
});

app.get('/api/companies/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const company = await getCompany(id);
  if (!company) return c.json({ error: 'not found' }, 404);
  return c.json({ company, pastBids: await getPastBids(id) });
});

app.put('/api/companies/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const p = await c.req.json<ProfileInput>();
  await pool.query(
    `update companies set name = $2, pitch = $3, cpv = $4, countries = $5, keywords = $6, min_value = $7, max_value = $8 where id = $1`,
    [id, p.name, p.pitch, p.cpv, p.countries, p.keywords, p.minValue ?? null, p.maxValue ?? null],
  );
  return c.json({ ok: true });
});

app.post('/api/companies/:id/bids', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ title: string; buyer: string; year?: number; value?: number; outcome: string; summary: string }>();
  await pool.query(
    'insert into past_bids (company_id, title, buyer, year, value, outcome, summary) values ($1,$2,$3,$4,$5,$6,$7)',
    [id, b.title, b.buyer, b.year ?? null, b.value ?? null, b.outcome === 'lost' ? 'lost' : 'won', b.summary ?? ''],
  );
  return c.json({ ok: true }, 201);
});

app.delete('/api/companies/:id/bids/:bidId', async (c) => {
  await pool.query('delete from past_bids where company_id = $1 and id = $2', [Number(c.req.param('id')), Number(c.req.param('bidId'))]);
  return c.json({ ok: true });
});

// ---------- Radar ----------

app.get('/api/companies/:id/matches', async (c) => {
  const id = Number(c.req.param('id'));
  const { rows } = await pool.query(
    `select t.id, t.title, t.buyer, t.country, t.cpv, t.nature, t.value, t.currency, t.published, t.deadline, t.url,
            m.score, m.prev_score, m.verdict, m.headline, m.reasons, m.risks, m.effort, m.scored_by, m.decision, m.decision_reason,
            m.brief is not null as has_brief, m.scored_at
       from matches m join tenders t on t.id = m.tender_id
      where m.company_id = $1 and (t.deadline is null or t.deadline > now() or m.decision is not null)
      order by (m.scored_by <> 'quick') desc, m.score desc, t.deadline asc nulls last
      limit 200`,
    [id],
  );
  return c.json({ matches: rows });
});

app.get('/api/companies/:id/stats', async (c) => {
  const id = Number(c.req.param('id'));
  const [{ rows: m }, { rows: s }, { rows: total }] = await Promise.all([
    pool.query(
      `select count(*)::int as matches,
              count(*) filter (where m.verdict = 'go' and m.decision is null and m.scored_by <> 'quick')::int as go,
              count(*) filter (where m.verdict = 'maybe' and m.decision is null and m.scored_by <> 'quick')::int as maybe,
              count(*) filter (where m.decision is not null)::int as decided,
              count(*) filter (where m.prev_score is not null)::int as rescored,
              coalesce(sum(t.value) filter (where m.verdict in ('go','maybe') and m.scored_by <> 'quick' and coalesce(m.decision, 'go') = 'go'), 0)::float as pipeline,
              min(t.deadline) filter (where m.verdict = 'go' and m.decision is distinct from 'no-go' and t.deadline > now()) as next_deadline
         from matches m join tenders t on t.id = m.tender_id
        where m.company_id = $1 and (t.deadline is null or t.deadline > now())`,
      [id],
    ),
    pool.query('select * from scans where company_id = $1 order by id desc limit 1', [id]),
    pool.query('select coalesce(sum(fetched), 0)::int as scanned, count(*)::int as sweeps from scans where company_id = $1', [id]),
  ]);
  return c.json({ ...m[0], ...total[0], lastScan: s[0] ?? null });
});

app.post('/api/companies/:id/scan', async (c) => {
  const id = Number(c.req.param('id'));
  void scan(id);
  return c.json({ ok: true }, 202);
});

app.get('/api/companies/:id/tenders/:tid', async (c) => {
  const id = Number(c.req.param('id'));
  const { rows } = await pool.query(
    `select t.id, t.title, t.buyer, t.country, t.cpv, t.nature, t.value, t.currency, t.published, t.deadline, t.url, t.description,
            m.score, m.prev_score, m.verdict, m.headline, m.reasons, m.risks, m.effort, m.scored_by, m.decision, m.decision_reason, m.brief
       from tenders t left join matches m on m.tender_id = t.id and m.company_id = $1
      where t.id = $2`,
    [id, c.req.param('tid')],
  );
  if (!rows[0]) return c.json({ error: 'not found' }, 404);
  return c.json({ tender: rows[0] });
});

app.post('/api/companies/:id/tenders/:tid/decision', async (c) => {
  const id = Number(c.req.param('id'));
  const tid = c.req.param('tid');
  const { decision, reason } = await c.req.json<{ decision: 'go' | 'no-go' | null; reason?: string }>();
  await pool.query(
    'update matches set decision = $3, decision_reason = $4, decided_at = case when $3::text is null then null else now() end where company_id = $1 and tender_id = $2',
    [id, tid, decision, reason ?? null],
  );
  // Learn from it, then re-score the open undecided shortlist with the new rules.
  void (async () => {
    await learnRules(id);
    const { rows } = await pool.query(
      `select m.tender_id from matches m join tenders t on t.id = m.tender_id
        where m.company_id = $1 and m.decision is null and m.scored_by <> 'quick' and (t.deadline is null or t.deadline > now())
        order by m.score desc limit 8`,
      [id],
    );
    await rescore(id, rows.map((r) => r.tender_id));
  })().catch((e) => console.error('learn/rescore', e));
  return c.json({ ok: true });
});

app.post('/api/companies/:id/tenders/:tid/brief', async (c) => {
  const id = Number(c.req.param('id'));
  const tid = c.req.param('tid');
  const threadId = `brief-${id}-${tid}`;
  const runId = crypto.randomUUID();
  const prompt = `Write the bid brief for tender ${tid}.
Steps: call tender-details for ${tid}, company-profile, and award-history (same CPV family and country; then the buyer's own past awards).
Then write markdown with exactly these sections:
## Verdict
(GO / MAYBE / NO-GO in bold, then one sentence)
## Why we can win
## Risks and blockers
## Competitive landscape
(who wins this kind of work, typical award values; cite award notices)
## Pricing guidance
## Response outline
(numbered sections of our technical response, each citing which past bid or strength backs it)
## Next steps
(3-5 concrete actions with owners like "Bid manager", "Tech lead")`;
  void runAgent({ companyId: id, threadId, runId, message: prompt, persist: false, onDone: async (text) => {
    await pool.query('update matches set brief = $3 where company_id = $1 and tender_id = $2', [id, tid, text]);
  } });
  return c.json({ threadId, runId }, 202);
});

// Who wins this kind of work: award notices in the same CPV family and country,
// plus the buyer's own past awards. Live from TED, cached in Valkey.
app.get('/api/companies/:id/tenders/:tid/competition', async (c) => {
  const { rows } = await pool.query('select buyer, country, cpv from tenders where id = $1', [c.req.param('tid')]);
  const t = rows[0];
  if (!t) return c.json({ error: 'not found' }, 404);
  const family = [...new Set((t.cpv as string[]).map((x) => x.slice(0, 3).padEnd(8, '0')))].slice(0, 3);
  try {
    const [similar, buyer] = await Promise.all([
      searchAwards({ cpv: family, countries: t.country ? [t.country] : undefined, years: 3 }),
      t.buyer ? searchAwards({ buyer: t.buyer, years: 5 }) : Promise.resolve([]),
    ]);
    const tally = new Map<string, { name: string; wins: number; total: number }>();
    for (const a of similar)
      for (const w of a.winners) {
        const e = tally.get(w) ?? { name: w, wins: 0, total: 0 };
        e.wins++;
        e.total += a.value ?? 0;
        tally.set(w, e);
      }
    const values = similar.map((a) => a.value).filter((v): v is number => v != null).sort((a, b) => a - b);
    return c.json({
      awards: similar.length,
      winners: [...tally.values()].sort((a, b) => b.wins - a.wins).slice(0, 6),
      median: values.length ? values[Math.floor(values.length / 2)] : null,
      buyerAwards: buyer.slice(0, 6),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// SSE: live radar activity for a company.
app.get('/api/companies/:id/feed', (c) => sse(c, feedKey(Number(c.req.param('id')))));

// ---------- Chat ----------

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
        content: m.content.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''),
      }))
      .filter((m) => m.content),
  });
});

// Starts an agent run and returns immediately; output arrives on the thread's event stream.
app.post('/api/chat', async (c) => {
  const { threadId, message, messageId, companyId } = await c.req.json<{
    threadId: string;
    message: string;
    messageId?: string;
    companyId: number;
  }>();
  if (!threadId || !message || !companyId) return c.json({ error: 'threadId, message and companyId are required' }, 400);

  const runId = crypto.randomUUID();
  await publish(threadId, { type: 'user.message', messageId: messageId ?? crypto.randomUUID(), content: message });
  void runAgent({ companyId, threadId, runId, message });
  return c.json({ runId }, 202);
});

function summarize(result: unknown): string {
  if (result == null || typeof result !== 'object') return String(result ?? '');
  const r = result as Record<string, any>;
  if ('awards' in r && 'topWinners' in r) return `${r.awards} past awards, ${r.topWinners.length} recurring winners`;
  if ('count' in r) return `${r.count} open tenders`;
  if ('tenders' in r) return `${r.tenders.length} tenders in pipeline`;
  if ('profile' in r) return 'profile, past bids and decisions loaded';
  if ('title' in r) return String(r.title).slice(0, 80);
  if ('error' in r) return `error: ${r.error}`;
  return 'done';
}

async function runAgent(o: {
  companyId: number;
  threadId: string;
  runId: string;
  message: string;
  persist?: boolean;
  onDone?: (text: string) => Promise<void>;
}) {
  const { threadId, runId } = o;
  await publish(threadId, { type: 'run.started', runId });
  try {
    if (!hasModelKey) {
      await publish(threadId, { type: 'text.delta', runId, delta: 'No model key configured yet, so the analyst is offline.' });
    } else {
      const agent = makeAnalyst(o.companyId);
      const result = await agent.stream(o.message, {
        memory: o.persist === false ? undefined : { thread: threadId, resource: RESOURCE_ID },
        maxSteps: 12,
      });
      let text = '';
      for await (const chunk of result.fullStream as AsyncIterable<any>) {
        if (chunk.type === 'text-delta') {
          const delta = chunk.payload?.text ?? '';
          text += delta;
          if (delta) await publish(threadId, { type: 'text.delta', runId, delta });
        } else if (chunk.type === 'tool-call') {
          await publish(threadId, { type: 'tool.call', runId, callId: chunk.payload.toolCallId, tool: chunk.payload.toolName, args: chunk.payload.args });
        } else if (chunk.type === 'tool-result') {
          await publish(threadId, { type: 'tool.result', runId, callId: chunk.payload.toolCallId, tool: chunk.payload.toolName, summary: summarize(chunk.payload.result) });
        } else if (chunk.type === 'tool-error') {
          const error = chunk.payload?.error?.message ?? String(chunk.payload?.error ?? 'failed');
          await publish(threadId, { type: 'tool.result', runId, callId: chunk.payload.toolCallId, tool: chunk.payload.toolName, summary: `failed: ${error}`.slice(0, 160) });
        } else if (chunk.type === 'error') {
          throw new Error(String(chunk.payload?.error?.message ?? chunk.payload?.error ?? 'agent error'));
        }
      }
      if (o.onDone) await o.onDone(text);
    }
    await publish(threadId, { type: 'run.finished', runId });
  } catch (err) {
    console.error('agent run failed', err);
    await publish(threadId, { type: 'run.error', runId, error: (err as Error).message }).catch(() => {});
  }
}

app.get('/api/threads/:threadId/events', (c) => sse(c, threadKey(c.req.param('threadId'))));

// Realtime events over SSE from a Redis/Valkey stream. Browsers resume via Last-Event-ID.
function sse(c: any, key: string) {
  const lastId = c.req.header('Last-Event-ID') ?? c.req.query('since') ?? '$';
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    for await (const item of subscribe(key, lastId, abort.signal)) {
      if (!item) {
        await stream.writeSSE({ event: 'ping', data: '' });
        continue;
      }
      await stream.writeSSE({ id: item.id, event: item.event.type, data: JSON.stringify(item.event) });
    }
  });
}

// Serve the built frontend in production.
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ path: './public/index.html' }));

await migrate();
await seed();
if (process.env.WATCHER !== 'off') startWatcher();

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
