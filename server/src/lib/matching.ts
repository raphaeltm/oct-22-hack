// Tender search and matching against the company profile (issue #7).
import { Agent } from '@mastra/core/agent';
import { pool } from '../db';
import { getCompany, type CompanyRow } from '../mastra/tools/company';
import { awardIndex } from './competitors';
import { autopilotForMatches } from './autopilot';
import { applyRules, learnedForCompany } from './learning';
import {
  buyerKey,
  cpvLabel,
  cpvSim,
  fmtEur,
  hasModel,
  isoDate,
  orQuery,
  profileKeywords,
  regionHit,
  regionTerms,
  textSimilarity,
} from './text';

const TENDER_COLS = `t.id, t.publication_number AS "publicationNumber", t.notice_type AS "noticeType", t.title,
  t.buyer_name AS "buyerName", t.cpv_codes AS "cpvCodes", t.estimated_value::float8 AS "estimatedValue",
  t.currency, t.deadline, t.publication_date AS "publicationDate", t.url`;

export type SearchTendersInput = {
  query?: string;
  cpv?: string | string[];
  buyer?: string;
  openOnly?: boolean;
  noticeType?: 'cn-standard' | 'can-standard';
  sort?: 'deadline_asc' | 'deadline_desc';
  limit?: number;
};

/** Full-text (French) search over TED notices with CPV prefix / buyer / open filters. */
export async function searchTenders(input: SearchTendersInput) {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [];
  let rank: string | null = null;
  if (input.query?.trim()) {
    const q = p(input.query.trim());
    where.push(`t.search @@ websearch_to_tsquery('french', ${q})`);
    rank = `ts_rank(t.search, websearch_to_tsquery('french', ${q}))`;
  }
  const cpvs = (Array.isArray(input.cpv) ? input.cpv : input.cpv ? input.cpv.split(',') : [])
    .map((c) => c.trim().replace(/0+$/, ''))
    .filter(Boolean);
  if (cpvs.length) where.push(`EXISTS (SELECT 1 FROM unnest(t.cpv_codes) c WHERE c LIKE ANY(${p(cpvs.map((c) => c + '%'))}::text[]))`);
  if (input.buyer?.trim()) where.push(`t.buyer_name ILIKE ${p('%' + input.buyer.trim() + '%')}`);
  if (input.openOnly) where.push(`t.notice_type = 'cn-standard' AND t.deadline > now()`);
  else if (input.noticeType) where.push(`t.notice_type = ${p(input.noticeType)}`);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const { rows } = await pool.query(
    `SELECT ${TENDER_COLS}, left(t.description, 400) AS "descriptionExcerpt",
       (SELECT coalesce(json_agg(a.winner_name), '[]') FROM awards a WHERE a.tender_id = t.id) AS winners
     FROM tenders t
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${rank ? `${rank} DESC, ` : ''}${input.openOnly ? `t.deadline ${input.sort === 'deadline_asc' ? 'ASC' : 'DESC'} NULLS LAST` : 't.publication_date DESC NULLS LAST'}
     LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => ({ ...r, deadline: isoDate(r.deadline), publicationDate: isoDate(r.publicationDate) }));
}

export type MatchSignals = {
  cpv: number;
  cpvMatch?: { mine: string; theirs: string };
  text: number;
  keywords: string[];
  buyer: number;
  buyerSimilarAwards: number;
  buyerLastAward?: { title: string; date: string | null; winners: string[]; url: string | null };
  region?: string;
  /** Score changes learned from the company's bid/skip/won/lost feedback. */
  learned?: { delta: number; label: string }[];
};

export type TenderMatch = {
  tenderId: string;
  publicationNumber: string;
  title: string;
  buyerName: string | null;
  cpvCodes: string[];
  estimatedValue: number | null;
  deadline: string | null;
  publicationDate: string | null;
  url: string | null;
  status: 'open' | 'recent';
  score: number;
  rationale: string;
  signals: MatchSignals;
};

function deterministicRationale(m: Omit<TenderMatch, 'rationale'>): string {
  const s = m.signals;
  const parts: string[] = [];
  if (s.cpvMatch) {
    parts.push(
      s.cpvMatch.mine === s.cpvMatch.theirs
        ? `CPV ${cpvLabel(s.cpvMatch.theirs)} is one of your codes`
        : `CPV ${cpvLabel(s.cpvMatch.theirs)} overlaps your ${cpvLabel(s.cpvMatch.mine)}`,
    );
  }
  if (s.keywords.length) parts.push(`notice mentions ${s.keywords.slice(0, 4).join(', ')}`);
  if (s.buyerSimilarAwards) {
    const last = s.buyerLastAward;
    parts.push(
      `buyer awarded ${s.buyerSimilarAwards} similar IT contract(s)` +
        (last ? ` (latest: "${last.title.slice(0, 60)}" to ${last.winners.slice(0, 2).join(', ')}${last.date ? `, ${last.date}` : ''})` : ''),
    );
  }
  if (s.region) parts.push(`in your region (${s.region})`);
  const meta = [m.deadline ? `deadline ${m.deadline}` : null, fmtEur(m.estimatedValue) ? `est. ${fmtEur(m.estimatedValue)}` : null]
    .filter(Boolean)
    .join(', ');
  let text = parts.length ? parts.join('; ') : 'Weak overlap with your profile';
  text = text[0].toUpperCase() + text.slice(1) + '.';
  if (meta) text += ` ${meta[0].toUpperCase() + meta.slice(1)}.`;
  if (m.status === 'recent') text += ' Recently published; the deadline has passed or is not stated, so check the notice.';
  return text;
}

let writer: Agent | null = null;

/** Optional Claude polish of the top rationales; falls back silently. */
async function polishRationales(company: CompanyRow, matches: TenderMatch[], max = 10) {
  if (!hasModel() || !matches.length) return false;
  writer ??= new Agent({
    id: 'match-rationale-writer',
    name: 'Match rationale writer',
    instructions:
      'You write one-sentence bid/no-bid rationales (max 35 words, English) for French public tenders, for a specific SME. ' +
      'Only use the facts given. Mention the strongest fit signal and, if relevant, a risk or the incumbent.',
    model: process.env.MODEL ?? 'anthropic/claude-sonnet-5',
  });
  const top = matches.slice(0, max);
  const prompt =
    `Company: ${company.name}. Services: ${company.services.join('; ')}. Differentiators: ${company.differentiators.join('; ')}.\n\n` +
    top.map((m, i) => `[${i}] "${m.title}" (buyer: ${m.buyerName}; CPV ${m.cpvCodes.join(', ')})\nSignals: ${m.rationale}`).join('\n\n') +
    `\n\nReturn ONLY a JSON array of ${top.length} strings, one rationale per tender in order.`;
  try {
    const res = await Promise.race([
      writer.generate(prompt),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25_000)),
    ]);
    const arr = JSON.parse(res.text.match(/\[[\s\S]*\]/)?.[0] ?? 'null') as unknown;
    if (!Array.isArray(arr)) return false;
    top.forEach((m, i) => {
      if (typeof arr[i] === 'string' && arr[i].trim()) m.rationale = arr[i].trim();
    });
    return true;
  } catch (err) {
    console.warn('rationale polish failed, keeping deterministic text:', (err as Error).message);
    return false;
  }
}

const MIN_GOOD = 5;
const GOOD_SCORE = 40;

/**
 * Score open cn-standard tenders (deadline > now) against the company profile:
 * CPV overlap (weighted by specificity) 45%, French full-text match of profile
 * keywords 35%, buyer history (buyer awarded similar CPV work) 15%, region 5%.
 * Feedback re-weights those signals and adds per-buyer/CPV/value adjustments;
 * skipped tenders are dropped. If fewer than 5 good open matches exist, recently
 * published notices are added with status 'recent'.
 */
export async function computeMatches(company: CompanyRow, opts: { limit?: number; polish?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const keywords = profileKeywords(company);
  const regions = regionTerms(company.regions);
  const [{ notices }, learned] = await Promise.all([awardIndex(), learnedForCompany(company.id)]);
  const w = learned.weights;

  // Buyer history: buyers who awarded work similar to the company's CPV codes.
  const buyers = new Map<string, { n: number; last: (typeof notices)[number] }>();
  for (const n of notices) {
    if (!n.buyerKey || cpvSim(company.cpvCodes, n.cpvCodes).strong < 0.6) continue;
    const e = buyers.get(n.buyerKey);
    if (!e) buyers.set(n.buyerKey, { n: 1, last: n });
    else {
      e.n++;
      if ((n.date ?? '') > (e.last.date ?? '')) e.last = n;
    }
  }

  const score = async (status: 'open' | 'recent', where: string) => {
    const { rows } = await pool.query<{
      id: string; publicationNumber: string; title: string; buyerName: string | null; cpvCodes: string[];
      estimatedValue: number | null; deadline: Date | null; publicationDate: Date | null; url: string | null;
    }>(`SELECT ${TENDER_COLS} FROM tenders t WHERE ${where}`);
    const text = await textSimilarity(keywords, 'websearch', where, { minMatched: 1, saturate: 3, limit: 1000 });
    const out: TenderMatch[] = [];
    for (const t of rows) {
      if (learned.skipped.has(t.id)) continue;
      const cpv = cpvSim(company.cpvCodes, t.cpvCodes);
      const tx = text.get(t.id);
      if (!cpv.sim && !tx) continue;
      const b = buyers.get(buyerKey(t.buyerName));
      const region = regionHit(regions, t.buyerName, t.title) ?? undefined;
      const signals: MatchSignals = {
        cpv: cpv.sim,
        ...(cpv.mine && cpv.theirs ? { cpvMatch: { mine: cpv.mine, theirs: cpv.theirs } } : {}),
        text: Math.round((tx?.sim ?? 0) * 100) / 100,
        keywords: (tx?.matched ?? []).map((k) => k.replace(/"/g, '')),
        buyer: b ? Math.min(1, b.n / 3) : 0,
        buyerSimilarAwards: b?.n ?? 0,
        ...(b
          ? { buyerLastAward: { title: b.last.title, date: b.last.date, winners: b.last.winners.map((w) => w.name), url: b.last.url } }
          : {}),
        ...(region ? { region } : {}),
      };
      let s = 100 * (w.cpv * signals.cpv + w.text * signals.text + w.buyer * signals.buyer + w.region * (region ? 1 : 0));
      const adjustments = applyRules(learned, {
        buyerName: t.buyerName,
        cpvCodes: t.cpvCodes,
        estimatedValue: t.estimatedValue,
        regionHit: !!region,
      });
      if (adjustments.length) {
        signals.learned = adjustments;
        s = Math.min(100, Math.max(0, s + adjustments.reduce((a, x) => a + x.delta, 0)));
      }
      if (status === 'recent') s *= 0.8;
      const m = {
        tenderId: t.id,
        publicationNumber: t.publicationNumber,
        title: t.title,
        buyerName: t.buyerName,
        cpvCodes: t.cpvCodes,
        estimatedValue: t.estimatedValue,
        deadline: isoDate(t.deadline),
        publicationDate: isoDate(t.publicationDate),
        url: t.url,
        status,
        score: Math.round(s * 10) / 10,
        signals,
      };
      out.push({ ...m, rationale: deterministicRationale(m) });
    }
    // Same buyer + same title (lots, re-publications): keep the best one.
    const seen = new Set<string>();
    return out
      .sort((a, b) => b.score - a.score)
      .filter((m) => {
        const k = `${buyerKey(m.buyerName)}|${m.title.toLowerCase().slice(0, 80)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };

  const open = await score('open', `t.notice_type = 'cn-standard' AND t.deadline > now()`);
  let matches = open.slice(0, limit);
  const notes: string[] = [`Scored ${open.length} open TED tenders (cn-standard, deadline in the future) against the profile.`];
  const good = open.filter((m) => m.score >= GOOD_SCORE).length;
  if (good < MIN_GOOD) {
    const recent = await score(
      'recent',
      `t.notice_type = 'cn-standard' AND (t.deadline IS NULL OR t.deadline <= now()) AND t.publication_date > now() - interval '60 days'`,
    );
    matches = [...open.filter((m) => m.score >= GOOD_SCORE), ...recent, ...open.filter((m) => m.score < GOOD_SCORE)]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    notes.push(
      `Only ${good} open tender(s) scored ${GOOD_SCORE}+, so recently published notices (last 60 days, deadline passed or not stated) are included with status "recent".`,
    );
  }
  notes.push(`Keywords used: ${keywords.join(', ') || '(none)'}. Company CPV codes: ${company.cpvCodes.join(', ') || '(none)'}.`);
  if (learned.decisions) {
    notes.push(
      `Learned from ${learned.decisions} bid/skip decision(s): ${learned.rules.length} adjustment rule(s), ${learned.skipped.size} skipped tender(s) hidden.` +
        (learned.weightNote ? ` ${learned.weightNote}.` : ''),
    );
  }
  const polished = opts.polish === false ? false : await polishRationales(company, matches);
  for (const m of matches) {
    const l = m.signals.learned;
    if (l?.length) m.rationale += ` Feedback: ${l.map((x) => `${x.delta > 0 ? '+' : ''}${x.delta} (${x.label})`).join('; ')}.`;
  }
  return { matches, notes, polished, keywordQuery: orQuery(keywords) };
}

/** Compute and save matches (tender_matches) for the user's company. */
export async function refreshMatches(userId: string, opts: { limit?: number; polish?: boolean } = {}) {
  const company = await getCompany(userId);
  if (!company) return null;
  const res = await computeMatches(company, { limit: opts.limit ?? 25, polish: opts.polish });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tender_matches WHERE company_id = $1', [company.id]);
    for (const m of res.matches) {
      await client.query(
        `INSERT INTO tender_matches (company_id, tender_id, score, rationale, signals) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, tender_id) DO UPDATE
           SET score = EXCLUDED.score, rationale = EXCLUDED.rationale, signals = EXCLUDED.signals, created_at = now()`,
        [company.id, m.tenderId, m.score, m.rationale, m.signals],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  // Autopilot: start pre-bid dossiers for the best new matches in the background.
  const autopilot = await autopilotForMatches(company.id, res.matches).catch((err) => {
    console.error('[autopilot] failed to queue dossiers', err);
    return [] as string[];
  });
  return { companyId: company.id, ...res, autopilot };
}

/** Saved matches joined with tenders, best first. */
export async function savedMatches(userId: string, limit = 50) {
  const company = await getCompany(userId);
  if (!company) return null;
  const { rows } = await pool.query(
    `SELECT m.score, m.rationale, m.created_at AS "matchedAt", ${TENDER_COLS},
       CASE WHEN t.deadline > now() THEN 'open' ELSE 'recent' END AS status
     FROM tender_matches m JOIN tenders t ON t.id = m.tender_id
     WHERE m.company_id = $1 ORDER BY m.score DESC LIMIT $2`,
    [company.id, limit],
  );
  return {
    companyId: company.id,
    matches: rows.map((r) => ({
      tenderId: r.id,
      ...r,
      deadline: isoDate(r.deadline),
      publicationDate: isoDate(r.publicationDate),
      matchedAt: r.matchedAt,
    })),
  };
}
