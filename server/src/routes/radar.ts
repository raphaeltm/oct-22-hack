import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AuthVariables } from '../auth';
import { feedKey, publish, subscribeTo } from '../events';
import { draftProfile, makeAnalyst } from '../mastra';
import { hasModelKey } from '../model';
import { learnRules, rescore, scan } from '../radar';
import { companyOwnedBy, createCompany, getCompany, getPastBids, MATCH_SELECT, pool, type ProfileInput, updateCompany } from '../store';

// Radar API: the TED watcher's shortlist for the logged-in user's company,
// go/no-go decisions, bid briefs and the live feed. Mounted under /api,
// behind the auth middleware.

export const radar = new Hono<{ Variables: AuthVariables }>();

// A company is only reachable by the user who owns it.
radar.use('/companies/:id/*', async (c, next) => {
  const id = c.req.param('id');
  if (id === 'draft') return next();
  if (!(await companyOwnedBy(id, c.get('user')!.id))) return c.json({ error: 'Not found' }, 404);
  await next();
});

radar.post('/companies/draft', async (c) => {
  const { description } = await c.req.json<{ description: string }>();
  if (!hasModelKey) return c.json({ error: 'No model key configured' }, 503);
  return c.json({ profile: await draftProfile(description) });
});

radar.post('/companies', async (c) => {
  const id = await createCompany(c.get('user')!.id, await c.req.json<ProfileInput>());
  void scan(id);
  return c.json({ id }, 201);
});

radar.get('/companies/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await companyOwnedBy(id, c.get('user')!.id))) return c.json({ error: 'Not found' }, 404);
  return c.json({ company: await getCompany(id), pastBids: await getPastBids(id) });
});

radar.put('/companies/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await companyOwnedBy(id, c.get('user')!.id))) return c.json({ error: 'Not found' }, 404);
  await updateCompany(id, await c.req.json<ProfileInput>());
  return c.json({ ok: true });
});

radar.post('/companies/:id/bids', async (c) => {
  const b = await c.req.json<{ title: string; buyer: string; year?: number; value?: number; outcome: string; summary: string }>();
  await pool.query(
    'insert into past_bids (company_id, title, buyer, year, value, outcome, summary) values ($1,$2,$3,$4,$5,$6,$7)',
    [c.req.param('id'), b.title, b.buyer, b.year ?? null, b.value ?? null, b.outcome === 'lost' ? 'lost' : 'won', b.summary ?? ''],
  );
  return c.json({ ok: true }, 201);
});

radar.delete('/companies/:id/bids/:bidId', async (c) => {
  await pool.query('delete from past_bids where company_id = $1 and id = $2', [c.req.param('id'), c.req.param('bidId')]);
  return c.json({ ok: true });
});

radar.get('/companies/:id/matches', async (c) => {
  const { rows } = await pool.query(
    `select ${MATCH_SELECT}, m.brief is not null as has_brief
       from tender_matches m join tenders t on t.id = m.tender_id
      where m.company_id = $1 and (t.deadline is null or t.deadline > now() or m.decision is not null)
      order by (m.scored_by <> 'quick') desc, m.score desc, t.deadline asc nulls last
      limit 200`,
    [c.req.param('id')],
  );
  return c.json({ matches: rows });
});

radar.get('/companies/:id/stats', async (c) => {
  const id = c.req.param('id');
  const [{ rows: m }, { rows: s }, { rows: total }] = await Promise.all([
    pool.query(
      `select count(*)::int as matches,
              count(*) filter (where m.verdict = 'go' and m.decision is null and m.scored_by <> 'quick')::int as go,
              count(*) filter (where m.verdict = 'maybe' and m.decision is null and m.scored_by <> 'quick')::int as maybe,
              count(*) filter (where m.decision is not null)::int as decided,
              coalesce(sum(t.estimated_value) filter (where m.verdict in ('go','maybe') and m.scored_by <> 'quick' and coalesce(m.decision, 'go') = 'go'), 0)::float as pipeline,
              min(t.deadline) filter (where m.verdict = 'go' and m.decision is distinct from 'no-go' and t.deadline > now()) as next_deadline
         from tender_matches m join tenders t on t.id = m.tender_id
        where m.company_id = $1 and (t.deadline is null or t.deadline > now())`,
      [id],
    ),
    pool.query('select * from scans where company_id = $1 order by started_at desc limit 1', [id]),
    pool.query('select coalesce(sum(fetched), 0)::int as scanned, count(*)::int as sweeps from scans where company_id = $1', [id]),
  ]);
  return c.json({ ...m[0], ...total[0], lastScan: s[0] ?? null });
});

radar.post('/companies/:id/scan', async (c) => {
  void scan(c.req.param('id'));
  return c.json({ ok: true }, 202);
});

radar.get('/companies/:id/tenders/:tid', async (c) => {
  const { rows } = await pool.query(
    `select ${MATCH_SELECT}, t.description, m.brief
       from tenders t left join tender_matches m on m.tender_id = t.id and m.company_id = $1
      where t.publication_number = $2`,
    [c.req.param('id'), c.req.param('tid')],
  );
  if (!rows[0]) return c.json({ error: 'not found' }, 404);
  return c.json({ tender: rows[0] });
});

radar.post('/companies/:id/tenders/:tid/decision', async (c) => {
  const id = c.req.param('id');
  const tid = c.req.param('tid');
  const { decision, reason } = await c.req.json<{ decision: 'go' | 'no-go' | null; reason?: string }>();
  await pool.query(
    `update tender_matches m set decision = $3, decision_reason = $4, decided_at = case when $3::text is null then null else now() end
       from tenders t where t.id = m.tender_id and m.company_id = $1 and t.publication_number = $2`,
    [id, tid, decision, reason ?? null],
  );
  // Learn from it, then re-score the open undecided shortlist with the new rules.
  void (async () => {
    await learnRules(id);
    const { rows } = await pool.query(
      `select t.publication_number from tender_matches m join tenders t on t.id = m.tender_id
        where m.company_id = $1 and m.decision is null and m.scored_by <> 'quick' and (t.deadline is null or t.deadline > now())
        order by m.score desc limit 8`,
      [id],
    );
    await rescore(id, rows.map((r) => r.publication_number));
  })().catch((e) => console.error('learn/rescore', e));
  return c.json({ ok: true });
});

radar.post('/companies/:id/tenders/:tid/brief', async (c) => {
  const id = c.req.param('id');
  const tid = c.req.param('tid');
  const threadId = `brief-${id}-${tid}`;
  const runId = crypto.randomUUID();
  void runBrief(id, tid, threadId, runId);
  return c.json({ threadId, runId }, 202);
});

// SSE: live radar activity for a company.
radar.get('/companies/:id/feed', (c) => {
  const lastId = c.req.header('Last-Event-ID') ?? c.req.query('since') ?? '$';
  const key = feedKey(c.req.param('id'));
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    for await (const item of subscribeTo<{ type: string }>(key, lastId, abort.signal)) {
      if (!item) {
        await stream.writeSSE({ event: 'ping', data: '' });
        continue;
      }
      await stream.writeSSE({ id: item.id, event: item.event.type, data: JSON.stringify(item.event) });
    }
  });
});

const BRIEF_PROMPT = (tid: string) => `Write the bid brief for tender ${tid}.
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

/** Stream an agent run into a thread's events, tool calls included. */
export async function streamRun(threadId: string, runId: string, result: { fullStream: unknown }) {
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
  return text;
}

function summarize(result: unknown): string {
  if (result == null || typeof result !== 'object') return String(result ?? '');
  const r = result as Record<string, any>;
  if ('awards' in r && 'topWinners' in r) return `${r.awards} past awards, ${r.topWinners.length} recurring winners`;
  if ('count' in r) return `${r.count} open tenders`;
  if ('tenders' in r && Array.isArray(r.tenders)) return `${r.tenders.length} tenders`;
  if ('profile' in r) return 'profile, past bids and decisions loaded';
  if ('title' in r) return String(r.title).slice(0, 80);
  if ('error' in r) return `error: ${r.error}`;
  return 'done';
}

async function runBrief(companyId: string, tid: string, threadId: string, runId: string) {
  await publish(threadId, { type: 'run.started', runId });
  try {
    if (!hasModelKey) {
      await publish(threadId, { type: 'text.delta', runId, delta: 'No model key configured yet, so the analyst is offline.' });
    } else {
      const result = await makeAnalyst(companyId).stream(BRIEF_PROMPT(tid), { maxSteps: 12 });
      const text = await streamRun(threadId, runId, result);
      await pool.query(
        `update tender_matches m set brief = $3 from tenders t where t.id = m.tender_id and m.company_id = $1 and t.publication_number = $2`,
        [companyId, tid, text],
      );
    }
    await publish(threadId, { type: 'run.finished', runId });
  } catch (err) {
    console.error('brief failed', err);
    await publish(threadId, { type: 'run.error', runId, error: (err as Error).message }).catch(() => {});
  }
}
