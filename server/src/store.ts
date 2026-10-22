import { pool } from './db';
import type { Tender as TedTender } from './ted';

// Plain-SQL helpers for the radar over the Drizzle schema (src/db/schema.ts).
// Selects alias columns to the short names the radar and API use.

export { pool };

export type Company = {
  id: string;
  name: string;
  pitch: string;
  cpv: string[];
  countries: string[]; // ISO-3, derived from regions
  regions: string[];
  keywords: string[];
  min_value: number | null;
  max_value: number | null;
  learned_rules: string;
  size: string | null;
  services: string[];
  sectors: string[];
  differentiators: string[];
  profile: Record<string, unknown>;
};

// regions hold free text ("France", "Auvergne-Rhône-Alpes") or ISO-3 codes.
const COUNTRY_NAMES: Record<string, string> = {
  france: 'FRA', belgium: 'BEL', belgique: 'BEL', luxembourg: 'LUX', germany: 'DEU', allemagne: 'DEU',
  netherlands: 'NLD', 'pays-bas': 'NLD', spain: 'ESP', espagne: 'ESP', italy: 'ITA', italie: 'ITA',
  portugal: 'PRT', ireland: 'IRL', austria: 'AUT', switzerland: 'CHE', suisse: 'CHE', poland: 'POL',
  sweden: 'SWE', denmark: 'DNK', finland: 'FIN', czechia: 'CZE', greece: 'GRC', romania: 'ROU',
};
const FRENCH_REGIONS = /auvergne|rh[oô]ne|bretagne|normandie|occitanie|provence|hauts-de-france|grand est|nouvelle-aquitaine|pays de la loire|centre|bourgogne|corse|[iî]le-de-france|paris|lyon|marseille|toulouse|lille|bordeaux|nantes/i;

export function countriesOf(regions: string[]): string[] {
  const out = new Set<string>();
  for (const r of regions) {
    const t = r.trim();
    if (/^[A-Z]{3}$/.test(t)) out.add(t);
    else if (COUNTRY_NAMES[t.toLowerCase()]) out.add(COUNTRY_NAMES[t.toLowerCase()]);
    else if (FRENCH_REGIONS.test(t)) out.add('FRA');
  }
  return [...out];
}

function toCompany(r: any): Company {
  return { ...r, countries: countriesOf(r.regions ?? []), profile: r.profile ?? {} };
}

export type PastBid = {
  id: string;
  title: string;
  buyer: string;
  year: number | null;
  value: number | null;
  outcome: 'won' | 'lost';
  summary: string;
};

const COMPANY_COLS = `id, name, coalesce(description, '') as pitch, cpv_codes as cpv, regions, keywords,
  min_value::float as min_value, max_value::float as max_value, learned_rules, size, services, sectors, differentiators, profile`;

export async function getCompany(id: string): Promise<Company | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query(`select ${COMPANY_COLS} from companies where id = $1`, [id]);
  return rows[0] ? toCompany(rows[0]) : null;
}

export async function listCompanies(): Promise<Company[]> {
  const { rows } = await pool.query(`select ${COMPANY_COLS} from companies order by created_at`);
  return rows.map(toCompany);
}

export type ProfileInput = {
  name: string;
  pitch: string;
  cpv: string[];
  countries: string[];
  keywords: string[];
  minValue?: number | null;
  maxValue?: number | null;
};

/** Create (or replace) the user's company profile; one company per user. */
export async function createCompany(userId: string, p: ProfileInput): Promise<string> {
  const { rows } = await pool.query(
    `insert into companies (user_id, name, description, cpv_codes, regions, keywords, min_value, max_value)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (user_id) do update set name = excluded.name, description = excluded.description, cpv_codes = excluded.cpv_codes,
       regions = excluded.regions, keywords = excluded.keywords, min_value = excluded.min_value, max_value = excluded.max_value, updated_at = now()
     returning id`,
    [userId, p.name, p.pitch, p.cpv, p.countries, p.keywords, p.minValue ?? null, p.maxValue ?? null],
  );
  return rows[0].id;
}

export async function companyOwnedBy(companyId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return false;
  const { rowCount } = await pool.query('select 1 from companies where id = $1 and user_id = $2', [companyId, userId]);
  return Boolean(rowCount);
}

export async function updateCompany(id: string, p: ProfileInput) {
  await pool.query(
    `update companies set name = $2, description = $3, cpv_codes = $4, regions = $5, keywords = $6,
       min_value = $7, max_value = $8, updated_at = now() where id = $1`,
    [id, p.name, p.pitch, p.cpv, p.countries, p.keywords, p.minValue ?? null, p.maxValue ?? null],
  );
}

export async function getPastBids(companyId: string): Promise<PastBid[]> {
  const { rows } = await pool.query(
    `select id, title, buyer, year, value::float as value, outcome, summary
       from past_bids where company_id = $1 order by year desc nulls last, created_at`,
    [companyId],
  );
  return rows;
}

export async function getDecisions(companyId: string, limit = 12) {
  const { rows } = await pool.query(
    `select t.title, t.buyer_name as buyer, t.buyer_country as country, t.cpv_codes as cpv, t.estimated_value::float as value,
            m.score, m.verdict, m.decision, m.decision_reason, m.decided_at
       from tender_matches m join tenders t on t.id = m.tender_id
      where m.company_id = $1 and m.decision is not null
      order by m.decided_at desc limit $2`,
    [companyId, limit],
  );
  return rows as {
    title: string;
    buyer: string;
    country: string;
    cpv: string[];
    value: number | null;
    score: number;
    verdict: string;
    decision: 'go' | 'no-go';
    decision_reason: string | null;
    decided_at: string;
  }[];
}

/** Upsert a TED notice; returns the row id. */
export async function saveTender(t: TedTender): Promise<string> {
  const { rows } = await pool.query(
    `insert into tenders (publication_number, notice_type, title, description, buyer_name, buyer_country, cpv_codes,
                          estimated_value, currency, deadline, publication_date, url, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (publication_number) do update set title = excluded.title, deadline = excluded.deadline,
       estimated_value = excluded.estimated_value, raw = excluded.raw, updated_at = now()
     returning id`,
    [t.id, t.noticeType || 'cn-standard', t.title, t.description, t.buyer, t.country, t.cpv, t.value, t.currency, t.deadline, t.published, t.url, JSON.stringify(t.raw)],
  );
  return rows[0].id;
}

export type MatchInput = { score: number; verdict: string; headline?: string; reasons?: string[]; risks?: string[]; effort?: string };

export async function saveMatch(companyId: string, tenderRowId: string, m: MatchInput, scoredBy: string) {
  await pool.query(
    `insert into tender_matches (company_id, tender_id, score, verdict, headline, reasons, risks, effort, scored_by, rationale)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (company_id, tender_id) do update set score = excluded.score, verdict = excluded.verdict,
       headline = excluded.headline, reasons = excluded.reasons, risks = excluded.risks, effort = excluded.effort,
       scored_by = excluded.scored_by, rationale = excluded.rationale, scored_at = now()`,
    [companyId, tenderRowId, m.score, m.verdict, m.headline ?? '', JSON.stringify(m.reasons ?? []), JSON.stringify(m.risks ?? []), m.effort ?? null, scoredBy, m.headline ?? null],
  );
}

/** Stored notice in the shape the radar scores. */
export function rowToTender(r: any): TedTender & { rowId: string } {
  return {
    rowId: r.id,
    id: r.publication_number,
    title: r.title,
    buyer: r.buyer_name ?? '',
    country: r.buyer_country ?? '',
    cpv: r.cpv_codes ?? [],
    noticeType: r.notice_type,
    nature: '',
    value: r.estimated_value == null ? null : Number(r.estimated_value),
    currency: r.currency,
    published: r.publication_date ? new Date(r.publication_date).toISOString().slice(0, 10) : null,
    deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
    description: r.description ?? '',
    url: r.url,
    raw: null,
  };
}

/** Columns the API returns for a tender + its match, keyed by publication number. */
export const MATCH_SELECT = `t.publication_number as id, t.title, t.buyer_name as buyer, t.buyer_country as country, t.cpv_codes as cpv,
  t.estimated_value::float as value, t.currency, t.publication_date as published, t.deadline, t.url,
  m.score, m.verdict, m.headline, m.reasons, m.risks, m.effort, m.scored_by, m.decision, m.decision_reason, m.scored_at`;
