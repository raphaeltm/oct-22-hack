// Partner finder backtest: replays real joint bids (eForms groupements) on French
// IT award notices. For each one, the lead firm plays "us": its profile is built
// only from its own award notices before the bid, and the partner finder ranks
// co-bidders using only awards and joint bids dated before it (the bid itself and
// other notices of the same procedure are hidden). A hit is a real partner of
// that bid in the shortlist. Two naive baselines are scored on the same cases.
//
// Results are cached in Redis (shared, market-wide; no user data).
import { pool } from '../db';
import { redis } from '../events';
import type { CompanyRow } from '../mastra/tools/company';
import { awardIndex } from './competitors';
import { nutsRegion, partnersForTender } from './partners';
import { aliasKey, cpvSim, isoDate } from './text';

const KEY = 'partners:backtest';
const K = [3, 10] as const;

type Member = { orgId: string; name: string; leader: number; nuts: string | null };
type Hits = { top3: number; top10: number };
type Example = {
  publicationNumber: string;
  title: string;
  buyer: string | null;
  date: string;
  url: string | null;
  lead: string;
  partners: string[];
  rank: number | null;
  baselineRank: number | null;
  shortlist: string[];
};

export type PartnerBacktest = {
  ranAt: string;
  cases: number;
  findable: number;
  radar: Hits;
  baselineWinners: Hits;
  baselineJointBidders: Hits;
  avgPartners: number;
  medianMs: number;
  examples: Example[];
  notes: string[];
};

const rankOf = (names: string[], targets: Set<string>) => {
  const i = names.findIndex((n) => targets.has(aliasKey(n)));
  return i < 0 ? null : i + 1;
};
const tally = (ranks: (number | null)[]): Hits => ({
  top3: ranks.filter((r) => r != null && r <= K[0]).length,
  top10: ranks.filter((r) => r != null && r <= K[1]).length,
});

export async function runPartnerBacktest(opts: { limit?: number; onProgress?: (done: number, total: number) => void } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 250, 1), 500);
  // One case per joint bid with at least two identified members; identical
  // groups on several lots of one notice count once.
  const { rows } = await pool.query<{
    tender_id: string; procedure_id: string | null; publication_number: string; title: string; buyer_name: string | null;
    url: string | null; cpv_codes: string[]; date: Date; members: Member[];
  }>(
    `SELECT DISTINCT ON (t.id, member_key) t.id AS tender_id, t.procedure_id, t.publication_number, t.title, t.buyer_name,
       t.url, t.cpv_codes, t.publication_date AS date, g.members
     FROM consortia c JOIN tenders t ON t.id = c.tender_id
     CROSS JOIN LATERAL (
       SELECT json_agg(json_build_object('orgId', m.organisation_id, 'name', m.name, 'leader', m.leader, 'nuts', o.nuts)
                ORDER BY m.leader DESC, m.org_ref) AS members,
              string_agg(m.organisation_id::text, ',' ORDER BY m.organisation_id) AS member_key,
              count(DISTINCT m.organisation_id) AS n
       FROM consortium_members m JOIN organisations o ON o.id = m.organisation_id
       WHERE m.consortium_id = c.id
     ) g
     WHERE g.n >= 2 AND t.publication_date IS NOT NULL
     ORDER BY t.id, member_key
     LIMIT $1`,
    [limit],
  );
  const procedures = await pool.query<{ procedure_id: string; ids: string[] }>(
    `SELECT procedure_id, array_agg(id::text) AS ids FROM tenders WHERE procedure_id = ANY($1::text[]) GROUP BY procedure_id`,
    [[...new Set(rows.map((r) => r.procedure_id).filter(Boolean))]],
  );
  const sameProcedure = new Map(procedures.rows.map((p) => [p.procedure_id, p.ids]));
  const jointBids = await pool.query<{ name: string; tender_id: string; date: Date | null }>(
    `SELECT m.name, c.tender_id, t.publication_date AS date
     FROM consortium_members m JOIN consortia c ON c.id = m.consortium_id JOIN tenders t ON t.id = c.tender_id`,
  );
  const { notices } = await awardIndex();

  const radar: (number | null)[] = [];
  const winners: (number | null)[] = [];
  const joint: (number | null)[] = [];
  const examples: Example[] = [];
  const ms: number[] = [];
  let findable = 0;
  let partnerCount = 0;

  for (const [i, r] of rows.entries()) {
    const hidden = new Set([r.tender_id, ...(r.procedure_id ? sameProcedure.get(r.procedure_id) ?? [] : [])]);
    const target = notices.find((n) => n.id === r.tender_id);
    const asOf = [isoDate(r.date), target?.date].filter((d): d is string => !!d).sort()[0];
    const before = notices.filter((n) => !hidden.has(n.id) && n.date && n.date < asOf);
    const lead = r.members[0];
    const leadKey = aliasKey(lead.name);
    const partners = new Set(r.members.slice(1).map((m) => aliasKey(m.name)).filter((k) => k !== leadKey));
    if (!partners.size) continue;
    partnerCount += partners.size;

    // "Us": the lead firm, described only by its own earlier awards.
    const own = before.filter((n) => n.winners.some((w) => aliasKey(w.name) === leadKey));
    const cpv = new Map<string, number>();
    for (const n of own) for (const c of n.cpvCodes) cpv.set(c, (cpv.get(c) ?? 0) + 1);
    const region = nutsRegion(lead.nuts);
    const company = {
      id: '00000000-0000-0000-0000-000000000000', userId: null, name: lead.name,
      description: own.slice(0, 15).map((n) => n.title).join('. ') || null,
      services: [], sectors: [], differentiators: [], size: null, profile: {},
      regions: region ? [region] : [],
      cpvCodes: [...cpv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c),
      createdAt: new Date(), updatedAt: new Date(),
    } as CompanyRow;

    const known = new Set(before.flatMap((n) => n.winners.map((w) => aliasKey(w.name))));
    for (const j of jointBids.rows) if (!hidden.has(j.tender_id) && j.date && isoDate(j.date)! < asOf) known.add(aliasKey(j.name));
    if ([...partners].some((p) => known.has(p))) findable++;

    const t0 = Date.now();
    const res = await partnersForTender(company, r.tender_id, 10, { asOf, excludeTenderIds: [...hidden] });
    ms.push(Date.now() - t0);
    const shortlist = (res?.partners ?? []).map((p) => p.name);
    radar.push(rankOf(shortlist, partners));

    // Baseline 1: the most frequent winners in the same CPV area (1/N per framework).
    const counts = new Map<string, { name: string; n: number }>();
    for (const n of before) {
      if (!cpvSim(r.cpv_codes, n.cpvCodes).sim) continue;
      for (const w of n.winners) {
        const k = aliasKey(w.name);
        if (k === leadKey) continue;
        const e = counts.get(k) ?? { name: w.name, n: 0 };
        e.n += 1 / Math.max(1, n.winners.length);
        counts.set(k, e);
      }
    }
    const top = (m: Map<string, { name: string; n: number }>) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((e) => e.name);
    const baseline = top(counts);
    winners.push(rankOf(baseline, partners));

    // Baseline 2: the firms with the most joint bids so far (any tender).
    const jb = new Map<string, { name: string; n: number }>();
    for (const j of jointBids.rows) {
      if (hidden.has(j.tender_id) || !j.date || isoDate(j.date)! >= asOf) continue;
      const k = aliasKey(j.name);
      if (k === leadKey) continue;
      const e = jb.get(k) ?? { name: j.name, n: 0 };
      e.n++;
      jb.set(k, e);
    }
    joint.push(rankOf(top(jb), partners));

    examples.push({
      publicationNumber: r.publication_number, title: r.title, buyer: r.buyer_name, date: asOf, url: r.url,
      lead: lead.name, partners: r.members.slice(1).map((m) => m.name),
      rank: radar[radar.length - 1], baselineRank: winners[winners.length - 1], shortlist: shortlist.slice(0, 5),
    });
    if ((i + 1) % 10 === 0) opts.onProgress?.(i + 1, rows.length);
  }

  ms.sort((a, b) => a - b);
  const result: PartnerBacktest = {
    ranAt: new Date().toISOString(),
    cases: radar.length,
    findable,
    radar: tally(radar),
    baselineWinners: tally(winners),
    baselineJointBidders: tally(joint),
    avgPartners: radar.length ? Math.round((partnerCount / radar.length) * 10) / 10 : 0,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
    // Hits first (best rank), then the misses, for the UI and evidence pack.
    examples: examples.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 12),
    notes: [
      'Cases: real joint bids (eForms tendering parties) on French IT award notices since 2025, with at least two identified members. The first-listed (lead) member plays the company.',
      "The lead's profile is built only from its own award notices before the bid. The partner finder, and both baselines, only see awards and joint bids dated before it; the bid and other notices of the same procedure are hidden.",
      'Hit: a real partner of that bid is in the top 3 / top 10. Baseline 1: the 10 most frequent winners in the same CPV area. Baseline 2: the 10 firms with the most joint bids so far.',
      'Findable: at least one real partner had an earlier award or joint bid in the data, so any method could have named it. Data starts in 2025, so many partners are new to the data.',
      'Radar network signals (invite replies) are ignored in the backtest. Fit scores are heuristics for ordering a shortlist, not probabilities.',
    ],
  };
  await redis.set(KEY, JSON.stringify(result));
  return { cases: result.cases, radarTop10: result.radar.top10, baselineTop10: result.baselineWinners.top10 };
}

export async function partnerBacktest(): Promise<PartnerBacktest | null> {
  const raw = await redis.get(KEY);
  return raw ? (JSON.parse(raw) as PartnerBacktest) : null;
}
