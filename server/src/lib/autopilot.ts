// Autopilot (issue #19): when a tender matches a company well, queue a pre-bid
// dossier without being asked. Dossier rows are the source of truth for the UI;
// the BullMQ job does the work and emits progress on the shared jobs stream.
import { pool } from '../db';
import { enqueueAutopilot } from '../jobs/queues';

const MIN_SCORE = Number(process.env.AUTOPILOT_MIN_SCORE ?? 40);
const MAX_PER_RUN = Number(process.env.AUTOPILOT_MAX_PER_RUN ?? 3);
// A dossier is only useful if there is time to act on it.
const MIN_DAYS_LEFT = Number(process.env.AUTOPILOT_MIN_DAYS_LEFT ?? 7);

/** Insert (or reset) the dossier row and queue the job. */
export async function queueDossier(companyId: string, tenderId: string, trigger: 'autopilot' | 'manual', score: number | null = null) {
  const { rowCount } = await pool.query(
    `INSERT INTO prebid_dossiers (company_id, tender_id, status, trigger, score)
     VALUES ($1, $2, 'queued', $3, $4)
     ON CONFLICT (company_id, tender_id) DO UPDATE
       SET status = 'queued', error = NULL, updated_at = now(), score = coalesce(EXCLUDED.score, prebid_dossiers.score)
       WHERE $3 = 'manual' OR prebid_dossiers.status = 'failed'`,
    [companyId, tenderId, trigger, score],
  );
  if (!rowCount) return null; // already built or in progress
  return enqueueAutopilot({ kind: 'dossier', companyId, tenderId });
}

/** After matching: dossiers for the best new open matches (bounded per run). */
export async function autopilotForMatches(
  companyId: string,
  matches: { tenderId: string; score: number; status: 'open' | 'recent'; deadline: string | null }[],
) {
  if (process.env.AUTOPILOT === '0') return [];
  const minDeadline = new Date(Date.now() + MIN_DAYS_LEFT * 86_400_000).toISOString().slice(0, 10);
  const candidates = matches.filter(
    (m) => m.status === 'open' && m.score >= MIN_SCORE && (m.deadline == null || m.deadline >= minDeadline),
  );
  if (!candidates.length) return [];
  const { rows } = await pool.query<{ tender_id: string }>(
    `SELECT tender_id FROM prebid_dossiers WHERE company_id = $1 AND tender_id = ANY($2::uuid[])
     UNION SELECT tender_id FROM tender_feedback WHERE company_id = $1 AND tender_id = ANY($2::uuid[])`,
    [companyId, candidates.map((m) => m.tenderId)],
  );
  const done = new Set(rows.map((r) => r.tender_id));
  const queued: string[] = [];
  for (const m of candidates) {
    if (queued.length >= MAX_PER_RUN) break;
    if (done.has(m.tenderId)) continue;
    if (await queueDossier(companyId, m.tenderId, 'autopilot', m.score)) queued.push(m.tenderId);
  }
  return queued;
}
