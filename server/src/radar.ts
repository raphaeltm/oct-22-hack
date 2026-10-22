import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { type Company, getCompany, getDecisions, getPastBids, listCompanies, pool } from './db';
import { publishFeed, redis } from './events';
import { hasModelKey, MODEL, SCORING_MODEL } from './model';
import { cpvPattern, searchTenders, type Tender } from './ted';

// The radar: watch TED for a company, score every new notice against its
// profile, past bids and past go/no-go decisions, and stream progress live.

const LLM_SCORE_LIMIT = 12; // per scan, best quick scores first
const SCAN_EVERY_MS = Number(process.env.SCAN_EVERY_MIN ?? 30) * 60_000;

const scorer = new Agent({
  id: 'scorer',
  name: 'Tender scorer',
  instructions: `You are a senior bid manager at a small firm. You decide whether a public tender is worth bidding on.
Be blunt and specific. Score 0-100 for how likely this firm wins AND wants the contract.
"go" means bid, "maybe" means worth a closer read, "no" means skip.
Weigh: fit with the firm's services and references, size versus the firm's capacity, location, deadline, and the firm's past decisions (they reveal its real preferences).`,
  model: SCORING_MODEL,
});

const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(['go', 'maybe', 'no']),
  headline: z.string().describe('One line, max 14 words, why this matters or why to skip'),
  reasons: z.array(z.string()).describe('2-4 concrete reasons it fits, citing past bids where relevant'),
  risks: z.array(z.string()).describe('0-3 concrete risks or blockers'),
  effort: z.enum(['low', 'medium', 'high']),
});

/** Cheap first pass so the LLM only reads the promising notices. */
export function quickScore(c: Company, t: Tender) {
  let score = 20;
  const prefixes = c.cpv.map((x) => cpvPattern(x).slice(0, -1));
  const best = Math.max(0, ...t.cpv.map((code) => Math.max(0, ...prefixes.map((p) => (code.startsWith(p) ? p.length : 0)))));
  score += Math.min(35, best * 6);
  const hay = `${t.title} ${t.description}`.toLowerCase();
  const hits = c.keywords.filter((k) => hay.includes(k.toLowerCase())).length;
  score += Math.min(25, hits * 10);
  if (c.countries.includes(t.country)) score += 5;
  if (t.value && c.max_value && t.value > c.max_value * 1.5) score -= 20;
  if (t.value && c.min_value && t.value < c.min_value * 0.5) score -= 10;
  if (t.deadline) {
    const days = (new Date(t.deadline).getTime() - Date.now()) / 86_400_000;
    if (days < 7) score -= 15;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, verdict: score >= 65 ? 'go' : score >= 45 ? 'maybe' : 'no' };
}

export async function companyContext(c: Company) {
  const [bids, decisions] = await Promise.all([getPastBids(c.id), getDecisions(c.id)]);
  return [
    `FIRM: ${c.name}`,
    c.pitch,
    `Target CPV families: ${c.cpv.join(', ') || 'any'}. Countries: ${c.countries.join(', ') || 'any'}.`,
    `Sweet spot contract value: ${c.min_value ?? '?'} - ${c.max_value ?? '?'} EUR.`,
    bids.length
      ? `PAST BIDS:\n${bids.map((b) => `- [${b.outcome.toUpperCase()}] ${b.title} for ${b.buyer} (${b.year ?? '?'}, ${b.value ? `€${b.value}` : 'value n/a'}): ${b.summary}`).join('\n')}`
      : 'PAST BIDS: none recorded.',
    decisions.length
      ? `RECENT DECISIONS BY THE TEAM (learn from these):\n${decisions.map((d) => `- ${d.decision.toUpperCase()} on "${d.title}" (${d.buyer}, ${d.country}; you had scored ${d.score})${d.decision_reason ? `: ${d.decision_reason}` : ''}`).join('\n')}`
      : '',
    c.learned_rules ? `RULES LEARNED FROM THE TEAM'S DECISIONS:\n${c.learned_rules}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function tenderText(t: Tender) {
  return [
    `TENDER ${t.id}: ${t.title}`,
    `Buyer: ${t.buyer} (${t.country}). Nature: ${t.nature || 'n/a'}. CPV: ${t.cpv.join(', ')}.`,
    `Estimated value: ${t.value ? `${t.value} ${t.currency ?? 'EUR'}` : 'not published'}. Deadline: ${t.deadline?.slice(0, 10) ?? 'n/a'}. Published: ${t.published}.`,
    t.description ? `Description: ${t.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function llmScore(context: string, t: Tender) {
  const r = await scorer.generate(`${context}\n\n---\n${tenderText(t)}`, {
    structuredOutput: { schema: ScoreSchema },
  });
  return r.object as z.infer<typeof ScoreSchema>;
}

async function saveTender(t: Tender) {
  await pool.query(
    `insert into tenders (id, title, buyer, country, cpv, notice_type, nature, value, currency, published, deadline, description, url, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (id) do update set title = excluded.title, deadline = excluded.deadline, value = excluded.value, raw = excluded.raw`,
    [t.id, t.title, t.buyer, t.country, t.cpv, t.noticeType, t.nature, t.value, t.currency, t.published, t.deadline, t.description, t.url, JSON.stringify(t.raw)],
  );
}

async function saveMatch(
  companyId: number,
  tenderId: string,
  m: { score: number; verdict: string; headline?: string; reasons?: string[]; risks?: string[]; effort?: string },
  scoredBy: string,
) {
  await pool.query(
    `insert into matches (company_id, tender_id, score, verdict, headline, reasons, risks, effort, scored_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (company_id, tender_id) do update set score = excluded.score, verdict = excluded.verdict,
       headline = excluded.headline, reasons = excluded.reasons, risks = excluded.risks, effort = excluded.effort,
       scored_by = excluded.scored_by, scored_at = now()`,
    [companyId, tenderId, m.score, m.verdict, m.headline ?? '', JSON.stringify(m.reasons ?? []), JSON.stringify(m.risks ?? []), m.effort ?? null, scoredBy],
  );
}

const running = new Set<number>();

/** One radar sweep for a company. Only notices it has never seen get scored. */
export async function scan(companyId: number, opts: { rescoreAll?: boolean } = {}) {
  if (running.has(companyId)) return null;
  running.add(companyId);
  const { rows } = await pool.query('insert into scans (company_id) values ($1) returning id', [companyId]);
  const scanId: number = rows[0].id;
  const progress = (message: string) => publishFeed(companyId, { type: 'scan.progress', scanId, message });
  try {
    const c = await getCompany(companyId);
    if (!c) throw new Error('company not found');
    await publishFeed(companyId, { type: 'scan.started', scanId });
    await progress(`Querying TED for ${c.cpv.length} CPV families and ${c.keywords.length} keywords in ${c.countries.join(', ') || 'all EU'}`);

    const found = await searchTenders({ cpv: c.cpv, keywords: c.keywords, countries: c.countries, sinceDays: 30 }, 80);
    const seenKey = `company:${companyId}:seen`;
    const fresh: Tender[] = [];
    for (const t of found) {
      await saveTender(t);
      const isNew = (await redis.sadd(seenKey, t.id)) === 1;
      if (isNew || opts.rescoreAll) fresh.push(t);
    }
    await progress(`${found.length} open notices, ${fresh.length} new since last sweep`);

    const ranked = fresh.map((t) => ({ t, q: quickScore(c, t) })).sort((a, b) => b.q.score - a.q.score);
    for (const { t, q } of ranked) await saveMatch(companyId, t.id, q, 'quick');

    if (hasModelKey && ranked.length) {
      const context = await companyContext(c);
      const top = ranked.slice(0, LLM_SCORE_LIMIT);
      await progress(`Agent reading the ${top.length} most promising notices`);
      await runPool(top, 4, async ({ t }) => {
        try {
          const m = await llmScore(context, t);
          await saveMatch(companyId, t.id, m, MODEL);
          await publishFeed(companyId, { type: 'tender.scored', tenderId: t.id, score: m.score, verdict: m.verdict, title: t.title });
        } catch (err) {
          console.error('scoring failed', t.id, err);
        }
      });
    }

    await pool.query('update scans set finished_at = now(), fetched = $2, fresh = $3 where id = $1', [scanId, found.length, fresh.length]);
    await publishFeed(companyId, { type: 'scan.finished', scanId, fetched: found.length, fresh: fresh.length });
    return { scanId, fetched: found.length, fresh: fresh.length };
  } catch (err) {
    const error = (err as Error).message;
    console.error('scan failed', err);
    await pool.query('update scans set finished_at = now(), error = $2 where id = $1', [scanId, error]);
    await publishFeed(companyId, { type: 'scan.error', scanId, error });
    return { scanId, error };
  } finally {
    running.delete(companyId);
  }
}

/** Re-score already stored tenders with the latest context (after the team teaches it). */
export async function rescore(companyId: number, tenderIds: string[]) {
  const c = await getCompany(companyId);
  if (!c || !hasModelKey) return;
  const context = await companyContext(c);
  const { rows } = await pool.query('select * from tenders where id = any($1)', [tenderIds]);
  await runPool(rows, 4, async (r: any) => {
    const t: Tender = { ...r, noticeType: r.notice_type, value: r.value == null ? null : Number(r.value), published: r.published?.toISOString?.().slice(0, 10) ?? r.published, deadline: r.deadline?.toISOString?.() ?? r.deadline };
    const m = await llmScore(context, t);
    await saveMatch(companyId, t.id, m, MODEL);
    await publishFeed(companyId, { type: 'tender.scored', tenderId: t.id, score: m.score, verdict: m.verdict, title: t.title });
  });
}

const rulesAgent = new Agent({
  id: 'rules',
  name: 'Preference learner',
  instructions:
    'You turn a bid team\'s go/no-go decisions into 3-6 short, concrete rules about what they bid on and what they skip. Each rule on its own line starting with "- ". No preamble.',
  model: SCORING_MODEL,
});

/** After every decision, distil the team's revealed preferences into rules the scorer reads. */
export async function learnRules(companyId: number) {
  if (!hasModelKey) return;
  const decisions = await getDecisions(companyId, 30);
  if (!decisions.length) return;
  const r = await rulesAgent.generate(
    decisions
      .map((d) => `${d.decision.toUpperCase()}: "${d.title}" — ${d.buyer} (${d.country}), CPV ${d.cpv.join(',')}, value ${d.value ?? 'n/a'}. Reason: ${d.decision_reason || 'none given'}`)
      .join('\n'),
  );
  const rules = r.text.trim();
  await pool.query('update companies set learned_rules = $2 where id = $1', [companyId, rules]);
  await publishFeed(companyId, { type: 'rules.updated', rules });
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

/** Background watcher: every SCAN_EVERY_MIN minutes, sweep every company. */
export function startWatcher() {
  const tick = async () => {
    for (const c of await listCompanies()) await scan(c.id);
  };
  setTimeout(() => void tick().catch((e) => console.error('watcher', e)), 5_000);
  setInterval(() => void tick().catch((e) => console.error('watcher', e)), SCAN_EVERY_MS);
}
