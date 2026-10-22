// Autopilot learning loop (issue #19):
// - bid/skip/won/lost feedback -> per-company score adjustments the matcher applies;
// - a prediction ledger (likely bidders, possible incumbent) graded against the
//   award notice that shares the tender's eForms procedure id;
// - a backtest that replays past tenders using only award data published before
//   them, compared with a naive "most frequent winners" baseline.
import { pool } from '../db';
import { awardIndex, competitorsForTender, findIncumbent } from './competitors';
import { aliasKey, buyerKey, cpvSig, cpvSim, fmtEur, isoDate } from './text';

// ---------- feedback ----------

export const DECISIONS = ['bid', 'skip', 'won', 'lost'] as const;
export type Decision = (typeof DECISIONS)[number];
export const SKIP_REASONS = ['scope', 'too_large', 'too_small', 'buyer', 'region', 'deadline', 'incumbent', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const REASON_LABELS: Record<SkipReason, string> = {
  scope: 'Outside our services',
  too_large: 'Too large for us',
  too_small: 'Too small to be worth it',
  buyer: "Buyer we don't work with",
  region: 'Wrong region',
  deadline: 'Deadline too short',
  incumbent: 'Incumbent too strong',
  other: 'Other',
};

export async function recordFeedback(
  companyId: string,
  tenderId: string,
  input: { decision: Decision; reason?: SkipReason | null; note?: string | null },
) {
  // Snapshot what the matcher saw, so later weight learning has the signals.
  const { rows } = await pool.query<{ score: number | null; signals: Record<string, unknown> | null }>(
    `SELECT score, signals FROM tender_matches WHERE company_id = $1 AND tender_id = $2`,
    [companyId, tenderId],
  );
  const s = rows[0]?.signals ?? {};
  const signals = rows[0]
    ? { score: rows[0].score, cpv: s.cpv ?? 0, text: s.text ?? 0, buyer: s.buyer ?? 0, region: s.region ? 1 : 0 }
    : null;
  await pool.query(
    `INSERT INTO tender_feedback (company_id, tender_id, decision, reason, note, signals)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, tender_id) DO UPDATE
       SET decision = EXCLUDED.decision, reason = EXCLUDED.reason, note = EXCLUDED.note,
           signals = EXCLUDED.signals, updated_at = now()`,
    [companyId, tenderId, input.decision, input.reason ?? null, input.note?.slice(0, 500) ?? null, signals],
  );
}

export type FeedbackRow = {
  tenderId: string;
  decision: Decision;
  reason: SkipReason | null;
  note: string | null;
  updatedAt: string;
  title: string;
  buyerName: string | null;
  cpvCodes: string[];
  estimatedValue: number | null;
  publicationNumber: string;
  signals: Record<string, unknown> | null;
};

export async function listFeedback(companyId: string): Promise<FeedbackRow[]> {
  const { rows } = await pool.query(
    `SELECT f.tender_id AS "tenderId", f.decision, f.reason, f.note, f.updated_at AS "updatedAt", f.signals,
       t.title, t.buyer_name AS "buyerName", t.cpv_codes AS "cpvCodes", t.estimated_value::float8 AS "estimatedValue",
       t.publication_number AS "publicationNumber"
     FROM tender_feedback f JOIN tenders t ON t.id = f.tender_id
     WHERE f.company_id = $1 ORDER BY f.updated_at DESC LIMIT 500`,
    [companyId],
  );
  return rows;
}

// ---------- learned adjustments ----------

export type Weights = { cpv: number; text: number; buyer: number; region: number };
export const BASE_WEIGHTS: Weights = { cpv: 0.45, text: 0.35, buyer: 0.15, region: 0.05 };

export type Rule = {
  kind: 'buyer' | 'cpv' | 'max_value' | 'min_value' | 'region' | 'buyer_affinity';
  delta: number;
  label: string;
  buyerKey?: string;
  cpv?: string;
  value?: number;
};

export type Learned = {
  decisions: number;
  weights: Weights;
  weightNote: string | null;
  rules: Rule[];
  skipped: Set<string>;
};

const short = (s: string, n = 50) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Turns the company's feedback into score adjustments. Small n by design: every rule cites its decision. */
export function learnFromFeedback(rows: FeedbackRow[]): Learned {
  const rules: Rule[] = [];
  const skipped = new Set(rows.filter((r) => r.decision === 'skip').map((r) => r.tenderId));
  const positiveCpv = new Set(
    rows.filter((r) => r.decision !== 'skip').flatMap((r) => r.cpvCodes.map(cpvSig)),
  );

  for (const r of rows) {
    const t = `"${short(r.title)}"`;
    if (r.decision === 'skip') {
      if (r.reason === 'buyer' && r.buyerName) {
        rules.push({ kind: 'buyer', buyerKey: buyerKey(r.buyerName), delta: -20, label: `You skipped ${t} because of the buyer (${r.buyerName})` });
      } else if (r.reason === 'scope') {
        // Only specific CPV codes (class level or deeper) that never appear on a tender you'd bid on.
        for (const c of r.cpvCodes) {
          const sig = cpvSig(c);
          if (sig.length >= 4 && !positiveCpv.has(sig)) {
            rules.push({ kind: 'cpv', cpv: sig, delta: -15, label: `You skipped ${t} as outside your services (CPV ${c})` });
          }
        }
      } else if (r.reason === 'too_large' && r.estimatedValue && r.estimatedValue > 1) {
        rules.push({ kind: 'max_value', value: r.estimatedValue * 0.8, delta: -15, label: `You skipped ${t} (${fmtEur(r.estimatedValue)}) as too large` });
      } else if (r.reason === 'too_small' && r.estimatedValue && r.estimatedValue > 1) {
        rules.push({ kind: 'min_value', value: r.estimatedValue * 1.25, delta: -10, label: `You skipped ${t} (${fmtEur(r.estimatedValue)}) as too small` });
      } else if (r.reason === 'region') {
        rules.push({ kind: 'region', delta: -10, label: `You skipped ${t} for its region, so out-of-region tenders rank lower` });
      }
    } else if ((r.decision === 'won' || r.decision === 'bid') && r.buyerName) {
      rules.push({
        kind: 'buyer_affinity',
        buyerKey: buyerKey(r.buyerName),
        delta: r.decision === 'won' ? 10 : 5,
        label: `You ${r.decision === 'won' ? 'won' : 'bid on'} ${t} with ${r.buyerName}`,
      });
    }
  }

  // Merge duplicates: keep the strongest value-cap rule and one rule per buyer/CPV.
  const merged = new Map<string, Rule>();
  for (const r of rules) {
    const key = r.kind === 'max_value' || r.kind === 'min_value' || r.kind === 'region' ? r.kind : `${r.kind}:${r.buyerKey ?? r.cpv}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, r);
    else if (r.kind === 'max_value' && (r.value ?? Infinity) < (prev.value ?? Infinity)) merged.set(key, r);
    else if (r.kind === 'min_value' && (r.value ?? 0) > (prev.value ?? 0)) merged.set(key, r);
  }

  // Signal weights: which signals separate tenders you pursue from ones you skip?
  // Shrunk towards the defaults; needs at least 2 of each before it moves.
  let weights = { ...BASE_WEIGHTS };
  let weightNote: string | null = null;
  const sig = (r: FeedbackRow, k: keyof Weights) => {
    const v = (r.signals as Record<string, unknown> | null)?.[k];
    return typeof v === 'number' ? v : typeof v === 'string' ? (v ? 1 : 0) : 0;
  };
  const pos = rows.filter((r) => r.decision !== 'skip' && r.signals && 'cpv' in r.signals);
  const neg = rows.filter((r) => r.decision === 'skip' && r.signals && 'cpv' in r.signals);
  if (pos.length >= 2 && neg.length >= 2) {
    const n = pos.length + neg.length;
    const shrink = n / (n + 6);
    const mean = (xs: FeedbackRow[], k: keyof Weights) => xs.reduce((a, r) => a + sig(r, k), 0) / xs.length;
    const raw = { ...BASE_WEIGHTS };
    for (const k of Object.keys(raw) as (keyof Weights)[]) {
      const d = mean(pos, k) - mean(neg, k);
      raw[k] = BASE_WEIGHTS[k] * Math.min(2, Math.max(0.5, 1 + 1.5 * d * shrink));
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    weights = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 1000) / 1000])) as Weights;
    const moved = (Object.keys(weights) as (keyof Weights)[])
      .filter((k) => Math.abs(weights[k] - BASE_WEIGHTS[k]) >= 0.02)
      .map((k) => `${k} ${Math.round(BASE_WEIGHTS[k] * 100)}%→${Math.round(weights[k] * 100)}%`);
    if (moved.length) weightNote = `Signal weights re-learned from ${n} decisions: ${moved.join(', ')}`;
  }

  return { decisions: rows.length, weights, weightNote, rules: [...merged.values()], skipped };
}

export async function learnedForCompany(companyId: string): Promise<Learned> {
  return learnFromFeedback(await listFeedback(companyId));
}

/** Score deltas from learned rules for one tender. */
export function applyRules(
  learned: Learned,
  t: { buyerName: string | null; cpvCodes: string[]; estimatedValue: number | null; regionHit: boolean },
): { delta: number; label: string }[] {
  const out: { delta: number; label: string }[] = [];
  const bk = buyerKey(t.buyerName);
  const sigs = t.cpvCodes.map(cpvSig);
  for (const r of learned.rules) {
    if ((r.kind === 'buyer' || r.kind === 'buyer_affinity') && r.buyerKey === bk) out.push(r);
    else if (r.kind === 'cpv' && r.cpv && sigs.some((s) => s.startsWith(r.cpv!))) out.push(r);
    else if (r.kind === 'max_value' && t.estimatedValue && t.estimatedValue >= (r.value ?? Infinity)) out.push(r);
    else if (r.kind === 'min_value' && t.estimatedValue && t.estimatedValue > 1 && t.estimatedValue <= (r.value ?? 0)) out.push(r);
    else if (r.kind === 'region' && !t.regionHit) out.push(r);
  }
  return out.map(({ delta, label }) => ({ delta, label }));
}

/** Learned rules in a UI-friendly shape. */
export async function learnedSummary(companyId: string) {
  const learned = await learnedForCompany(companyId);
  return {
    decisions: learned.decisions,
    skippedHidden: learned.skipped.size,
    weights: learned.weights,
    weightNote: learned.weightNote,
    rules: learned.rules.map((r) => ({ kind: r.kind, delta: r.delta, label: r.label })),
  };
}

// ---------- prediction ledger ----------

type Predicted = { organisationId: string | null; name: string; incumbent: boolean };

/** Replace this tender's pending predictions (top 5 likely bidders + possible incumbents). */
export async function recordPredictions(
  tenderId: string,
  competitors: Predicted[],
  opts: { companyId?: string | null; source?: 'live' | 'backtest' | 'baseline'; incumbents?: Predicted[] } = {},
) {
  const source = opts.source ?? 'live';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM predictions WHERE tender_id = $1 AND source = $2 AND company_id IS NOT DISTINCT FROM $3`,
      [tenderId, source, opts.companyId ?? null],
    );
    const top = competitors.slice(0, 5);
    const rows: [string, string, number, string | null][] = top.map((c, i) => ['competitor', c.name, i + 1, c.organisationId]);
    (opts.incumbents ?? top.filter((c) => c.incumbent)).forEach((c, i) => rows.push(['incumbent', c.name, i + 1, c.organisationId]));
    for (const [kind, name, rank, orgId] of rows) {
      await client.query(
        `INSERT INTO predictions (company_id, tender_id, kind, source, organisation_id, name, alias_key, rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [opts.companyId ?? null, tenderId, kind, source, orgId, name, aliasKey(name), rank],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Grade pending predictions whose tender now has an award notice (same eForms
 * procedure id). Hit = a predicted firm (by alias key) is among the winners.
 * Award notices with no winner (e.g. unsuccessful procedures) grade as 'void'.
 */
export async function gradePredictions() {
  const { rows } = await pool.query<{ id: string; alias_key: string; award_id: string; winners: string[] | null }>(
    `SELECT p.id, p.alias_key, can.id AS award_id,
       (SELECT array_agg(a.winner_name) FROM awards a WHERE a.tender_id = can.id) AS winners
     FROM predictions p
     JOIN tenders cn ON cn.id = p.tender_id
     JOIN LATERAL (
       SELECT c.id FROM tenders c
       WHERE c.procedure_id = cn.procedure_id AND c.notice_type = 'can-standard' AND c.id <> cn.id
       ORDER BY c.publication_date DESC NULLS LAST LIMIT 1
     ) can ON true
     WHERE p.outcome = 'pending' AND cn.procedure_id IS NOT NULL`,
  );
  let graded = 0;
  for (const r of rows) {
    const keys = new Set((r.winners ?? []).map(aliasKey));
    const outcome = keys.size === 0 ? 'void' : keys.has(r.alias_key) ? 'hit' : 'miss';
    await pool.query(`UPDATE predictions SET outcome = $2, award_tender_id = $3, graded_at = now() WHERE id = $1`, [
      r.id,
      outcome,
      r.award_id,
    ]);
    graded++;
  }
  return { graded };
}

// ---------- backtest ----------

/**
 * Replays past tenders that already have an award notice: predicts likely bidders
 * using only awards dated before the tender's publication, then grades. Also records
 * a naive baseline (the 5 most frequent winners in CPV division 72 before that date).
 */
export async function runBacktest(opts: { limit?: number; onProgress?: (done: number, total: number) => void } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 150, 1), 500);
  const { rows } = await pool.query<{ id: string; publication_date: Date }>(
    `SELECT cn.id, cn.publication_date FROM tenders cn
     WHERE cn.notice_type = 'cn-standard' AND cn.procedure_id IS NOT NULL
       AND cn.publication_date >= '2025-04-01'
       AND EXISTS (
         SELECT 1 FROM tenders c JOIN awards a ON a.tender_id = c.id
         WHERE c.procedure_id = cn.procedure_id AND c.notice_type = 'can-standard')
     ORDER BY cn.publication_date DESC LIMIT $1`,
    [limit],
  );
  const { notices } = await awardIndex();
  let done = 0;
  for (const r of rows) {
    const asOf = isoDate(r.publication_date)!;
    const brief = await competitorsForTender(r.id, 5, { asOf });
    if (brief) {
      const t = brief.tender;
      const prev = await findIncumbent({ id: t.id, title: t.title, buyerName: t.buyerName, cpvCodes: t.cpvCodes }, { asOf });
      const field = brief.competitors.map((c) => ({ organisationId: c.organisationId, name: c.name, incumbent: false }));
      await recordPredictions(r.id, field, {
        source: 'backtest',
        incumbents: prev && prev.winners.length <= 3 ? prev.winners.map((w) => ({ organisationId: w.orgId, name: w.name, incumbent: true })) : [],
      });
      await recordPredictions(r.id, baselineFor(notices, brief.tender.cpvCodes, asOf), { source: 'baseline' });
    }
    done++;
    if (done % 10 === 0) opts.onProgress?.(done, rows.length);
  }
  const graded = await gradePredictions();
  return { tenders: rows.length, ...graded };
}

/** Naive baseline: most frequent winners (1/N per framework) in the same CPV division before `asOf`. */
function baselineFor(notices: Awaited<ReturnType<typeof awardIndex>>['notices'], cpvCodes: string[], asOf: string): Predicted[] {
  const counts = new Map<string, { name: string; orgId: string | null; n: number }>();
  for (const n of notices) {
    if (!n.date || n.date >= asOf || !cpvSim(cpvCodes, n.cpvCodes).sim) continue;
    for (const w of n.winners) {
      const k = aliasKey(w.name);
      const e = counts.get(k) ?? { name: w.name, orgId: w.orgId, n: 0 };
      e.n += 1 / Math.max(1, n.winners.length);
      counts.set(k, e);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((e) => ({ organisationId: e.orgId, name: e.name, incumbent: false }));
}

// ---------- scorecard ----------

export type Scorecard = {
  live: { predicted: number; graded: number; pending: number; top5Hits: number; incumbentGraded: number; incumbentHits: number };
  backtest: { graded: number; top5Hits: number; incumbentGraded: number; incumbentHits: number; avgWinners: number };
  baseline: { graded: number; top5Hits: number };
  examples: {
    tenderId: string;
    publicationNumber: string;
    title: string;
    buyerName: string | null;
    url: string | null;
    awardUrl: string | null;
    source: string;
    predicted: { name: string; hit: boolean }[];
    winners: string[];
  }[];
  notes: string[];
};

/** Hit rates per tender (any of the top-5 predicted firms among the winners). */
export async function scorecard(companyId: string | null): Promise<Scorecard> {
  const { rows } = await pool.query<{
    source: string; tender_id: string; graded: boolean; pending: boolean; top5_hit: boolean; inc_graded: boolean; inc_hit: boolean; winners: number;
  }>(
    `SELECT p.source, p.tender_id,
       bool_or(p.outcome IN ('hit','miss')) AS graded,
       bool_and(p.outcome = 'pending') AS pending,
       bool_or(p.kind = 'competitor' AND p.outcome = 'hit') AS top5_hit,
       bool_or(p.kind = 'incumbent' AND p.outcome IN ('hit','miss')) AS inc_graded,
       bool_or(p.kind = 'incumbent' AND p.outcome = 'hit') AS inc_hit,
       coalesce(max((SELECT count(*) FROM awards a WHERE a.tender_id = p.award_tender_id)), 0)::int AS winners
     FROM predictions p
     WHERE (p.source <> 'live' OR p.company_id = $1)
     GROUP BY p.source, p.tender_id`,
    [companyId],
  );
  const by = (s: string) => rows.filter((r) => r.source === s);
  const live = by('live');
  const bt = by('backtest').filter((r) => r.graded);
  const bl = by('baseline').filter((r) => r.graded);
  const examples = await pool.query(
    `SELECT p.tender_id AS "tenderId", t.publication_number AS "publicationNumber", t.title, t.buyer_name AS "buyerName", t.url,
       aw.url AS "awardUrl", p.source,
       json_agg(json_build_object('name', p.name, 'hit', p.outcome = 'hit') ORDER BY p.rank) AS predicted,
       (SELECT coalesce(json_agg(DISTINCT a.winner_name), '[]') FROM awards a WHERE a.tender_id = max(p.award_tender_id::text)::uuid) AS winners
     FROM predictions p JOIN tenders t ON t.id = p.tender_id LEFT JOIN tenders aw ON aw.id = p.award_tender_id
     WHERE p.kind = 'competitor' AND p.outcome IN ('hit','miss')
       AND ((p.source = 'live' AND p.company_id = $1) OR p.source = 'backtest')
     GROUP BY p.tender_id, t.publication_number, t.title, t.buyer_name, t.url, aw.url, p.source
     ORDER BY bool_or(p.outcome = 'hit') DESC, max(p.graded_at) DESC LIMIT 6`,
    [companyId],
  );
  return {
    live: {
      predicted: live.length,
      graded: live.filter((r) => r.graded).length,
      pending: live.filter((r) => r.pending).length,
      top5Hits: live.filter((r) => r.top5_hit).length,
      incumbentGraded: live.filter((r) => r.inc_graded).length,
      incumbentHits: live.filter((r) => r.inc_hit).length,
    },
    backtest: {
      graded: bt.length,
      top5Hits: bt.filter((r) => r.top5_hit).length,
      incumbentGraded: bt.filter((r) => r.inc_graded).length,
      incumbentHits: bt.filter((r) => r.inc_hit).length,
      avgWinners: bt.length ? Math.round((bt.reduce((a, r) => a + r.winners, 0) / bt.length) * 10) / 10 : 0,
    },
    baseline: { graded: bl.length, top5Hits: bl.filter((r) => r.top5_hit).length },
    examples: examples.rows,
    notes: [
      'Backtest: past TED tenders that now have an award notice (matched by eForms procedure id). Predictions use only award notices published before the tender.',
      'Baseline: the 5 most frequent winners in the same CPV area before that date.',
      'A hit means one of the top 5 predicted firms is among the winners. Multi-winner frameworks make hits easier; predictions are evidence, not certainty.',
      'Previous supplier: the winner of the buyer\'s most recent similar award. Award data starts in 2025, so the true predecessor of a multi-year contract is often older and missing.',
    ],
  };
}
