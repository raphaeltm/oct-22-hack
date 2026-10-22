// Autopilot routes (issue #19): pre-bid dossiers, bid/skip feedback, prediction
// scorecard. Mounted at /api behind auth; everything is scoped to the user's company.
import { Hono } from 'hono';
import type { AuthVariables } from '../auth';
import { pool } from '../db';
import { enqueueAutopilot } from '../jobs/queues';
import { queueDossier } from '../lib/autopilot';
import { getDossier, listDossiers } from '../lib/dossier';
import { DECISIONS, learnedSummary, listFeedback, recordFeedback, REASON_LABELS, scorecard, SKIP_REASONS } from '../lib/learning';
import { refreshMatches } from '../lib/matching';
import { getCompany } from '../mastra/tools/company';

export const autopilotRoutes = new Hono<{ Variables: AuthVariables }>();

/** Tender uuid from a uuid or TED publication number. */
async function tenderUuid(idOrPub: string): Promise<string | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrPub);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM tenders WHERE ${uuid ? 'id = $1::uuid' : 'publication_number = $1'}`,
    [idOrPub],
  );
  return rows[0]?.id ?? null;
}

// GET /api/autopilot  inbox of dossiers + what the agent learned + scorecard
autopilotRoutes.get('/autopilot', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const [dossiers, learned, card, feedback] = await Promise.all([
    listDossiers(company.id),
    learnedSummary(company.id),
    scorecard(company.id),
    listFeedback(company.id),
  ]);
  return c.json({
    dossiers,
    learned,
    scorecard: card,
    feedback: feedback.slice(0, 20).map(({ signals: _s, ...f }) => f),
    reasons: REASON_LABELS,
  });
});

// GET /api/autopilot/scorecard
autopilotRoutes.get('/autopilot/scorecard', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  return c.json(await scorecard(company?.id ?? null));
});

// POST /api/autopilot/backtest  re-run the backtest (shared, market-wide)
autopilotRoutes.post('/autopilot/backtest', async (c) => {
  const jobId = await enqueueAutopilot({ kind: 'backtest' });
  return c.json({ jobId }, 202);
});

// GET /api/tenders/:id/dossier
autopilotRoutes.get('/tenders/:id/dossier', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const tenderId = await tenderUuid(c.req.param('id'));
  if (!tenderId) return c.json({ error: 'not found' }, 404);
  const d = await getDossier(company.id, tenderId);
  if (d && !d.seenAt && d.status === 'ready') {
    await pool.query(`UPDATE prebid_dossiers SET seen_at = now() WHERE company_id = $1 AND tender_id = $2`, [company.id, tenderId]);
  }
  return c.json(d ?? { status: 'none', tenderId });
});

// POST /api/tenders/:id/dossier  build (or rebuild) on demand
autopilotRoutes.post('/tenders/:id/dossier', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const tenderId = await tenderUuid(c.req.param('id'));
  if (!tenderId) return c.json({ error: 'not found' }, 404);
  const jobId = await queueDossier(company.id, tenderId, 'manual');
  return c.json({ jobId, status: 'queued' }, 202);
});

// POST /api/tenders/:id/feedback  { decision: bid|skip|won|lost, reason?, note? }
autopilotRoutes.post('/tenders/:id/feedback', async (c) => {
  const userId = c.get('user')!.id;
  const company = await getCompany(userId);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const tenderId = await tenderUuid(c.req.param('id'));
  if (!tenderId) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ decision?: string; reason?: string; note?: string }>().catch(() => ({}) as Record<string, string>);
  const decision = DECISIONS.find((d) => d === body.decision);
  if (!decision) return c.json({ error: `decision must be one of ${DECISIONS.join(', ')}` }, 400);
  const reason = body.reason ? SKIP_REASONS.find((r) => r === body.reason) : undefined;
  if (body.reason && !reason) return c.json({ error: `reason must be one of ${SKIP_REASONS.join(', ')}` }, 400);
  await recordFeedback(company.id, tenderId, { decision, reason: reason ?? null, note: typeof body.note === 'string' ? body.note : null });
  // Re-rank right away so the shortlist reflects what was learned.
  const res = await refreshMatches(userId, { limit: 25, polish: false });
  return c.json({ ok: true, learned: await learnedSummary(company.id), notes: res?.notes ?? [] });
});

// DELETE /api/tenders/:id/feedback  undo a decision
autopilotRoutes.delete('/tenders/:id/feedback', async (c) => {
  const userId = c.get('user')!.id;
  const company = await getCompany(userId);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const tenderId = await tenderUuid(c.req.param('id'));
  if (!tenderId) return c.json({ error: 'not found' }, 404);
  await pool.query(`DELETE FROM tender_feedback WHERE company_id = $1 AND tender_id = $2`, [company.id, tenderId]);
  await refreshMatches(userId, { limit: 25, polish: false });
  return c.json({ ok: true, learned: await learnedSummary(company.id) });
});
