// Competitor intelligence from TED award notices (issue #8).
//
// Ranking rules (see data quirks in the issue):
// - a win on a notice with N winners counts 1/N (big frameworks don't dominate);
// - repeated notices from the same buyer with the same title (e.g. GÉANT's OCRE
//   framework, 38 notices) are deduped, and further wins from one buyer have
//   diminishing returns, so breadth (distinct buyers) beats volume;
// - name variants are grouped with a light alias key ("CGI" + "CGI France").
import { pool } from '../db';
import { getCompany, type CompanyRow } from '../mastra/tools/company';
import {
  aliasKey,
  buyerKey,
  cpvLabel,
  cpvSim,
  distinctiveLexemes,
  fmtEur,
  fold,
  isoDate,
  profileKeywords,
  textSimilarity,
  type TextHit,
} from './text';

export type Winner = { orgId: string | null; name: string; value: number | null };
export type AwardNotice = {
  id: string;
  publicationNumber: string;
  title: string;
  buyerName: string | null;
  buyerKey: string;
  cpvCodes: string[];
  date: string | null;
  estimatedValue: number | null;
  url: string | null;
  winners: Winner[];
};
type Org = { id: string; name: string; alias: string };

let cache: { at: number; notices: AwardNotice[]; orgs: Map<string, Org> } | null = null;

/** All award notices with their winners, cached in memory (a few thousand rows). */
export async function awardIndex() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const [notices, orgs] = await Promise.all([
    pool.query<{
      id: string; publication_number: string; title: string; buyer_name: string | null; cpv_codes: string[];
      date: Date | null; estimated_value: number | null; url: string | null; winners: Winner[];
    }>(`
      SELECT t.id, t.publication_number, t.title, t.buyer_name, t.cpv_codes,
        coalesce(max(a.award_date), t.publication_date) AS date,
        CASE WHEN t.estimated_value > 1 THEN t.estimated_value::float8 END AS estimated_value, t.url,
        -- values of 0/1 are placeholders in TED, treat them as unknown
        json_agg(json_build_object('orgId', a.organisation_id, 'name', coalesce(o.name, a.winner_name),
          'value', CASE WHEN a.value > 1 THEN a.value::float8 END)) AS winners
      FROM tenders t
      JOIN awards a ON a.tender_id = t.id
      LEFT JOIN organisations o ON o.id = a.organisation_id
      GROUP BY t.id`),
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM organisations`),
  ]);
  cache = {
    at: Date.now(),
    notices: notices.rows.map((r) => ({
      id: r.id,
      publicationNumber: r.publication_number,
      title: r.title,
      buyerName: r.buyer_name,
      buyerKey: buyerKey(r.buyer_name),
      cpvCodes: r.cpv_codes ?? [],
      date: isoDate(r.date),
      estimatedValue: r.estimated_value,
      url: r.url,
      winners: r.winners,
    })),
    orgs: new Map(orgs.rows.map((o) => [o.id, { ...o, alias: aliasKey(o.name) }])),
  };
  return cache;
}

export function invalidateAwardIndex() {
  cache = null;
}

const daysSince = (d: string | null) => (d ? Math.max(0, (Date.now() - Date.parse(d)) / 86_400_000) : 730);

export type CompetitorExample = {
  tenderId: string;
  publicationNumber: string;
  title: string;
  buyer: string | null;
  date: string | null;
  value: number | null;
  valueNote?: string;
  coWinners: number;
  sameBuyer: boolean;
  url: string | null;
};

export type Competitor = {
  organisationId: string;
  organisationIds: string[];
  name: string;
  aliases: string[];
  score: number;
  wins: number;
  distinctBuyers: number;
  sameBuyerWins: number;
  cpvWins: number;
  frameworkWins: number;
  totalValue: number;
  lastWin: string | null;
  incumbent: boolean;
  why: string;
  examples: CompetitorExample[];
};

type Target = {
  cpvCodes: string[];
  /** Relative weight of CPV vs wording similarity. */
  weights?: { cpv: number; text: number };
  buyerKey?: string;
  text: Map<string, TextHit>;
  excludeTenderId?: string;
};

type Scored = { notice: AwardNotice; score: number; sameBuyer: boolean; cpv: number; text: number; winner: Winner; n: number };

function rankCompetitors(notices: AwardNotice[], orgs: Map<string, Org>, target: Target, limit: number): Competitor[] {
  const groups = new Map<string, Scored[]>();
  const w = target.weights ?? { cpv: 2, text: 1.5 };
  for (const notice of notices) {
    if (notice.id === target.excludeTenderId) continue;
    const sameBuyer = !!target.buyerKey && notice.buyerKey === target.buyerKey;
    const c = cpvSim(target.cpvCodes, notice.cpvCodes);
    const cpv = c.sim;
    const text = target.text.get(notice.id)?.sim ?? 0;
    // Same buyer: any IT overlap. Otherwise a specific CPV match, or same CPV
    // division plus similar wording.
    const relevant = sameBuyer ? cpv > 0 || text > 0 : c.strong >= 0.6 || (cpv > 0 && text >= 0.2);
    if (!relevant) continue;
    const n = Math.max(1, notice.winners.length);
    const recency = 0.5 + 0.5 * Math.exp(-daysSince(notice.date) / 365);
    const value = n === 1 ? (notice.winners[0].value ?? notice.estimatedValue) : notice.winners[0]?.value ?? null;
    const valueFactor = value && value > 0 ? 1 + Math.min(0.3, 0.1 * Math.log10(1 + value / 100_000)) : 1;
    const rel = 3 * (sameBuyer ? 1 : 0) + w.cpv * cpv + w.text * text;
    const base = (rel * recency * valueFactor) / n;
    const seen = new Set<string>();
    for (const winner of notice.winners) {
      const org = winner.orgId ? orgs.get(winner.orgId) : undefined;
      const key = org?.alias ?? aliasKey(winner.name);
      if (seen.has(key)) continue; // same group twice on one notice
      seen.add(key);
      const list = groups.get(key) ?? [];
      list.push({ notice, score: base, sameBuyer, cpv, text, winner, n });
      groups.set(key, list);
    }
  }

  const out: Competitor[] = [];
  for (const [key, items] of groups) {
    // Dedupe repeated framework notices: one per (buyer, title).
    const dedup = new Map<string, Scored>();
    for (const s of items) {
      const k = `${s.notice.buyerKey}|${fold(s.notice.title).slice(0, 60)}`;
      const prev = dedup.get(k);
      if (!prev || s.score > prev.score) dedup.set(k, s);
    }
    const wins = [...dedup.values()];
    // Diminishing returns per buyer: 1, 1/2, 1/4, ...
    const byBuyer = new Map<string, Scored[]>();
    for (const s of wins) byBuyer.set(s.notice.buyerKey, [...(byBuyer.get(s.notice.buyerKey) ?? []), s]);
    // Same-buyer history counts double; breadth elsewhere is compressed (sqrt)
    // so large integrators with dozens of buyers don't bury the incumbent.
    let samePart = 0;
    let otherPart = 0;
    for (const [bk, list] of byBuyer) {
      list.sort((a, b) => b.score - a.score);
      const sum = list.reduce((acc, s, i) => acc + s.score / 2 ** i, 0);
      if (target.buyerKey && bk === target.buyerKey) samePart += sum;
      else otherPart += sum;
    }
    const score = 2 * samePart + 3 * Math.sqrt(otherPart);

    // Primary organisation = the variant with most wins.
    const orgCount = new Map<string, { n: number; name: string }>();
    for (const s of items) {
      const id = s.winner.orgId ?? '';
      const e = orgCount.get(id) ?? { n: 0, name: s.winner.name };
      e.n++;
      orgCount.set(id, e);
    }
    const ranked = [...orgCount.entries()].sort((a, b) => b[1].n - a[1].n);
    const primary = ranked.find(([id]) => id) ?? ranked[0];
    const sameBuyerWins = wins.filter((s) => s.sameBuyer).length;
    const cpvWins = wins.filter((s) => s.cpv >= 0.6).length;
    const frameworkWins = wins.filter((s) => s.n >= 5).length;
    const totalValue = wins.reduce((sum, s) => sum + (s.winner.value ?? (s.n === 1 ? s.notice.estimatedValue ?? 0 : 0)), 0);
    const lastWin = wins.map((s) => s.notice.date).filter(Boolean).sort().pop() ?? null;
    const incumbent = wins.some((s) => s.sameBuyer && (s.cpv >= 0.6 || s.text >= 0.3));
    const examples = [...wins]
      .sort((a, b) => b.score - a.score || (b.notice.date ?? '').localeCompare(a.notice.date ?? ''))
      .slice(0, 3)
      .map((s) => {
        const v = s.winner.value ?? (s.n === 1 ? s.notice.estimatedValue : null);
        return {
          tenderId: s.notice.id,
          publicationNumber: s.notice.publicationNumber,
          title: s.notice.title,
          buyer: s.notice.buyerName,
          date: s.notice.date,
          value: v,
          ...(s.winner.value == null && v != null ? { valueNote: 'estimated value of the notice' } : {}),
          coWinners: s.n - 1,
          sameBuyer: s.sameBuyer,
          url: s.notice.url,
        };
      });
    const why = [
      sameBuyerWins ? `${sameBuyerWins} win(s) with this buyer${incumbent ? ' (likely incumbent)' : ''}` : null,
      `${wins.length} similar award(s) across ${byBuyer.size} buyer(s)`,
      frameworkWins ? `${frameworkWins} as one of 5+ framework holders` : null,
      fmtEur(totalValue) ? `${fmtEur(totalValue)} known value` : null,
      lastWin ? `last ${lastWin}` : null,
    ]
      .filter(Boolean)
      .join('; ');
    out.push({
      organisationId: primary[0],
      organisationIds: ranked.map(([id]) => id).filter(Boolean),
      name: primary[1].name,
      aliases: [...new Set(items.map((s) => s.winner.name))].filter((n) => n !== primary[1].name).slice(0, 5),
      score: Math.round(score * 100) / 100,
      wins: wins.length,
      distinctBuyers: byBuyer.size,
      sameBuyerWins,
      cpvWins,
      frameworkWins,
      totalValue,
      lastWin,
      incumbent,
      why,
      examples,
    });
    void key;
  }
  out.sort((a, b) => b.score - a.score);
  // Always show the buyer's past winners (likely incumbents), up to half the list.
  const keep = new Set(out.filter((c) => c.sameBuyerWins > 0).slice(0, Math.max(1, Math.floor(limit / 2))));
  const rest = out.filter((c) => !keep.has(c)).slice(0, Math.max(0, limit - keep.size));
  return [...keep, ...rest].sort((a, b) => b.score - a.score);
}

const NOTES = [
  'Ranked from real TED award notices (can-standard). Wins on multi-winner frameworks count 1/N; repeated notices with the same buyer and title are counted once.',
  'Award values are often missing on multi-winner frameworks; totalValue only sums known values.',
];

/**
 * Likely bidders for one tender: past winners with the same buyer and/or overlapping CPV codes.
 * `asOf` (YYYY-MM-DD) only uses award notices dated before it (backtesting).
 */
export async function competitorsForTender(tenderIdOrPub: string, limit = 10, opts: { asOf?: string } = {}) {
  const uuid = /^[0-9a-f-]{36}$/i.test(tenderIdOrPub);
  const { rows } = await pool.query<{
    id: string; publication_number: string; notice_type: string; title: string; description: string | null;
    buyer_name: string | null; cpv_codes: string[]; deadline: Date | null; estimated_value: number | null; url: string | null;
  }>(
    `SELECT id, publication_number, notice_type, title, description, buyer_name, cpv_codes, deadline,
       estimated_value::float8 AS estimated_value, url
     FROM tenders WHERE ${uuid ? 'id = $1' : 'publication_number = $1'}`,
    [tenderIdOrPub],
  );
  const t = rows[0];
  if (!t) return null;
  const index = await awardIndex();
  const { orgs } = index;
  const notices = opts.asOf ? index.notices.filter((n) => n.date && n.date < opts.asOf!) : index.notices;
  const lexemes = await distinctiveLexemes(`${t.title} ${t.title} ${(t.description ?? '').slice(0, 600)}`);
  const text = await textSimilarity(lexemes, 'lexeme', `t.notice_type = 'can-standard'`, { minMatched: 2, saturate: 4 });
  const bk = buyerKey(t.buyer_name);
  const competitors = rankCompetitors(notices, orgs, { cpvCodes: t.cpv_codes, buyerKey: bk, text, excludeTenderId: t.id }, limit);
  const buyerAwards = notices
    .filter((n) => n.buyerKey === bk && n.id !== t.id)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return {
    tender: {
      id: t.id,
      publicationNumber: t.publication_number,
      noticeType: t.notice_type,
      title: t.title,
      buyerName: t.buyer_name,
      cpvCodes: t.cpv_codes,
      cpvLabels: t.cpv_codes.map(cpvLabel),
      deadline: isoDate(t.deadline),
      estimatedValue: t.estimated_value,
      url: t.url,
    },
    buyerHistory: {
      awardNotices: buyerAwards.length,
      recent: buyerAwards.slice(0, 5).map((n) => ({
        tenderId: n.id,
        title: n.title,
        date: n.date,
        winners: n.winners.map((w) => w.name),
        url: n.url,
      })),
    },
    // UI-friendly aliases: buyers / winsWithBuyer per competitor, flattened buyer awards.
    competitors: competitors.map((c) => ({ ...c, buyers: c.distinctBuyers, winsWithBuyer: c.sameBuyerWins })),
    buyerAwards: buyerAwards.slice(0, 12).flatMap((n) =>
      n.winners.map((w, i) => ({
        id: `${n.id}:${i}`,
        tenderId: n.id,
        organisationId: w.orgId,
        winnerName: w.name,
        value: w.value ?? (n.winners.length === 1 ? n.estimatedValue : null),
        awardDate: n.date,
        coWinners: n.winners.length, // number of winners on the notice (as in /api/competitors/:id)
        title: n.title,
        buyerName: n.buyerName,
        publicationNumber: n.publicationNumber,
        url: n.url,
      })),
    ),
    notes: NOTES,
  };
}

/** Top competitors across the company's CPV codes and profile keywords. */
export async function competitorsForCompany(company: CompanyRow, limit = 15) {
  const { notices, orgs } = await awardIndex();
  const keywords = profileKeywords(company);
  const text = await textSimilarity(keywords, 'websearch', `t.notice_type = 'can-standard'`, { minMatched: 1, saturate: 3 });
  const competitors = rankCompetitors(notices, orgs, { cpvCodes: company.cpvCodes, text, weights: { cpv: 1, text: 4 } }, limit);
  return {
    company: { id: company.id, name: company.name, cpvCodes: company.cpvCodes, keywords },
    competitors: competitors.map((c) => ({ ...c, buyers: c.distinctBuyers })),
    notes: NOTES,
  };
}

export async function competitorsForUser(userId: string, limit = 15) {
  const company = await getCompany(userId);
  if (!company) return null;
  return competitorsForCompany(company, limit);
}

/** Award history (all name variants), research notes and summary for one competitor. */
export async function competitorProfile(organisationId: string, companyId?: string | null) {
  const { notices, orgs } = await awardIndex();
  const org = orgs.get(organisationId);
  if (!org) return null;
  const ids = [...orgs.values()].filter((o) => o.alias === org.alias).map((o) => o.id);
  const idSet = new Set(ids);
  const won = notices
    .filter((n) => n.winners.some((w) => w.orgId && idSet.has(w.orgId)))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const buyers = new Map<string, { name: string; wins: number }>();
  const cpvs = new Map<string, number>();
  let totalValue = 0;
  for (const n of won) {
    const b = buyers.get(n.buyerKey) ?? { name: n.buyerName ?? '?', wins: 0 };
    b.wins++;
    buyers.set(n.buyerKey, b);
    for (const c of n.cpvCodes) cpvs.set(c, (cpvs.get(c) ?? 0) + 1);
    const w = n.winners.find((x) => x.orgId && idSet.has(x.orgId));
    totalValue += w?.value ?? (n.winners.length === 1 ? n.estimatedValue ?? 0 : 0);
  }
  const [meta, notes] = await Promise.all([
    pool.query(
      `SELECT name, website, summary, last_researched_at AS "lastResearchedAt" FROM organisations WHERE id = $1`,
      [organisationId],
    ),
    pool.query(
      `SELECT content, url, source, created_at AS "createdAt" FROM research_notes
       WHERE organisation_id = ANY($1::uuid[]) AND (company_id IS NULL OR company_id = $2::uuid)
       ORDER BY created_at DESC LIMIT 20`,
      [ids, companyId ?? null],
    ),
  ]);
  const m = meta.rows[0] as { name: string; website: string | null; summary: string | null; lastResearchedAt: Date | null };
  const distinctTitles = new Set(won.map((n) => `${n.buyerKey}|${fold(n.title).slice(0, 60)}`));
  return {
    organisationId,
    name: m.name,
    organisationIds: ids,
    aliases: ids.map((id) => orgs.get(id)!.name).filter((n) => n !== m.name),
    website: m.website,
    summary: m.summary,
    lastResearchedAt: isoDate(m.lastResearchedAt),
    stats: {
      awardNotices: won.length,
      distinctContracts: distinctTitles.size,
      distinctBuyers: buyers.size,
      frameworkWins: won.filter((n) => n.winners.length >= 5).length,
      totalKnownValue: totalValue,
      lastWin: won[0]?.date ?? null,
      topBuyers: [...buyers.values()].sort((a, b) => b.wins - a.wins).slice(0, 8),
      topCpv: [...cpvs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code, n]) => ({ code: cpvLabel(code), wins: n })),
    },
    awards: won.slice(0, 40).map((n) => {
      const w = n.winners.find((x) => x.orgId && idSet.has(x.orgId));
      return {
        tenderId: n.id,
        publicationNumber: n.publicationNumber,
        title: n.title,
        buyer: n.buyerName,
        date: n.date,
        value: w?.value ?? (n.winners.length === 1 ? n.estimatedValue : null),
        coWinners: n.winners.length - 1,
        cpvCodes: n.cpvCodes,
        url: n.url,
      };
    }),
    researchNotes: notes.rows,
  };
}

// Generic procurement words that say nothing about what is being bought.
const TITLE_STOP = new Set(
  (
    'marche marches public publics prestation prestations service services accord cadre accords relatif relative relatifs ' +
    'realisation fourniture fournitures mise place oeuvre dans pour lot lots ville commune departement region metropole ' +
    'agglomeration communaute direction besoins ensemble associes associees concernant annee annees conseil generale general ' +
    'solution solutions'
  ).split(' '),
);
const titleTokens = (s: string) => new Set(fold(s).split(' ').filter((w) => w.length >= 5 && !TITLE_STOP.has(w)));

/**
 * Possible incumbent: the buyer's most recent earlier award for the same kind of
 * work (class-level CPV match, or 2+ distinctive title words in common). Evidence,
 * not proof: buyers re-scope contracts and frameworks have several holders.
 */
export async function findIncumbent(
  t: { id: string; title: string; buyerName: string | null; cpvCodes: string[] },
  opts: { asOf?: string } = {},
) {
  const { notices } = await awardIndex();
  const bk = buyerKey(t.buyerName);
  if (!bk) return null;
  const mine = titleTokens(t.title);
  const candidates = notices
    .filter((n) => n.buyerKey === bk && n.id !== t.id && n.winners.length && (!opts.asOf || (n.date && n.date < opts.asOf)))
    .map((n) => {
      const shared = [...titleTokens(n.title)].filter((w) => mine.has(w));
      return { n, shared, cpv: cpvSim(t.cpvCodes, n.cpvCodes).strong };
    })
    .filter((c) => c.cpv >= 0.8 || c.shared.length >= 2)
    .sort((a, b) => (b.n.date ?? '').localeCompare(a.n.date ?? ''));
  const best = candidates[0];
  if (!best) return null;
  return {
    notice: best.n,
    winners: best.n.winners,
    basis: best.shared.length >= 2 ? `shared terms: ${best.shared.slice(0, 4).join(', ')}` : 'same CPV class',
  };
}
