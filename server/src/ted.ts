import { redis } from './events';

// Client for the TED (Tenders Electronic Daily) v3 search API: free, keyless,
// every EU public tender above the thresholds. Field names are eForms names.
// Docs: https://docs.ted.europa.eu/api/latest/search.html

const TED_URL = 'https://api.ted.europa.eu/v3/notices/search';

export type Tender = {
  id: string; // publication number, e.g. 652318-2026
  title: string;
  buyer: string;
  country: string; // ISO-3
  cpv: string[];
  noticeType: string;
  nature: string;
  value: number | null;
  currency: string | null;
  published: string | null; // YYYY-MM-DD
  deadline: string | null; // ISO timestamp
  description: string;
  url: string;
  raw: unknown;
};

export type Award = {
  id: string;
  title: string;
  buyer: string;
  country: string;
  winners: string[];
  value: number | null;
  currency: string | null;
  published: string | null;
  url: string;
};

// Fields every query asks for; optional ones are dropped if TED rejects them.
const CORE_FIELDS = [
  'publication-number',
  'notice-title',
  'notice-type',
  'buyer-name',
  'buyer-country',
  'classification-cpv',
  'publication-date',
];
const TENDER_FIELDS = [
  'contract-nature',
  'total-value',
  'total-value-cur',
  'deadline-receipt-tender-date-lot',
  'deadline',
  'description-lot',
  'description-proc',
];
const AWARD_FIELDS = ['winner-name', 'total-value', 'total-value-cur', 'tender-value', 'tender-value-cur'];

// TED rejects unknown fields with a 400; remember the ones it refused.
const rejectedFields = new Set<string>();

type SearchOpts = { query: string; fields: string[]; limit?: number; scope?: 'ACTIVE' | 'ALL' | 'LATEST' };

async function search({ query, fields, limit = 50, scope = 'ACTIVE' }: SearchOpts): Promise<any[]> {
  let wanted = fields.filter((f) => !rejectedFields.has(f));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(TED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, fields: wanted, limit, scope }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const body = (await res.json()) as { notices?: any[] };
      return body.notices ?? [];
    }
    const text = await res.text();
    if (res.status === 400) {
      const named = wanted.filter((f) => !CORE_FIELDS.includes(f) && text.includes(f));
      const drop = named.length ? named : wanted.filter((f) => !CORE_FIELDS.includes(f));
      if (drop.length) {
        drop.forEach((f) => rejectedFields.add(f));
        console.warn(`TED rejected fields ${drop.join(', ')}; retrying`);
        wanted = wanted.filter((f) => !drop.includes(f));
        continue;
      }
    }
    throw new Error(`TED search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  throw new Error('TED search failed after retries');
}

/** Pick a readable string from TED's multilingual / array-valued fields. */
export function text(v: unknown, prefer = ['eng', 'fra', 'deu']): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => text(x, prefer)).filter(Boolean)[0] ?? '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const lang of prefer) if (o[lang]) return text(o[lang], prefer);
    const first = Object.values(o)[0];
    return text(first, prefer);
  }
  return '';
}

function list(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return [...new Set(v.flatMap(list))];
  if (typeof v === 'object') return list(Object.values(v as object).flat());
  return [String(v)];
}

function num(v: unknown): number | null {
  const n = Number(text(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function date(v: unknown): string | null {
  const s = text(v);
  return s ? s.slice(0, 10) : null;
}

function deadline(n: any): string | null {
  const values = [...list(n['deadline-receipt-tender-date-lot']), ...list(n['deadline'])].sort();
  if (!values.length) return null;
  // eForms dates look like 2026-11-14+01:00; keep the day, assume end of business.
  const d = values[0].slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T17:00:00Z` : null;
}

const noticeUrl = (id: string) => `https://ted.europa.eu/en/notice/-/detail/${id}`;

function toTender(n: any): Tender {
  const id = text(n['publication-number']);
  return {
    id,
    title: text(n['notice-title']) || '(untitled notice)',
    buyer: text(n['buyer-name']),
    country: list(n['buyer-country'])[0] ?? '',
    cpv: list(n['classification-cpv']).map((c) => c.slice(0, 8)),
    noticeType: text(n['notice-type']),
    nature: text(n['contract-nature']),
    value: num(n['total-value']),
    currency: text(n['total-value-cur']) || null,
    published: date(n['publication-date']),
    deadline: deadline(n),
    description: (text(n['description-lot']) || text(n['description-proc'])).slice(0, 2000),
    url: noticeUrl(id),
    raw: n,
  };
}

/** CPV 72000000 → "72*" so the query matches the whole family. */
export function cpvPattern(code: string) {
  const trimmed = code.replace(/\D/g, '').slice(0, 8).replace(/0+$/, '');
  return `${trimmed.length >= 2 ? trimmed : code.slice(0, 2)}*`;
}

const or = (parts: string[]) => (parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
const quote = (s: string) => `"${s.replace(/"/g, '')}"`;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

export type TenderQuery = { cpv?: string[]; keywords?: string[]; countries?: string[]; sinceDays?: number; text?: string };

export function buildQuery(q: TenderQuery) {
  const subject: string[] = [
    ...(q.cpv ?? []).map((c) => `classification-cpv=${cpvPattern(c)}`),
    ...(q.keywords ?? []).map((k) => `FT~${quote(k)}`),
  ];
  const clauses: string[] = [];
  if (subject.length) clauses.push(or(subject));
  if (q.text) clauses.push(`FT~${quote(q.text)}`);
  if (q.countries?.length) clauses.push(or(q.countries.map((c) => `buyer-country=${c}`)));
  const since = new Date(Date.now() - (q.sinceDays ?? 21) * 86_400_000);
  clauses.push(`publication-date>=${ymd(since)}`);
  return `${clauses.join(' AND ')} SORT BY publication-date DESC`;
}

/** Open calls for tender matching the query (award notices filtered out). */
export async function searchTenders(q: TenderQuery, limit = 50): Promise<Tender[]> {
  const notices = await search({ query: buildQuery(q), fields: [...CORE_FIELDS, ...TENDER_FIELDS], limit });
  return notices
    .map(toTender)
    .filter((t) => t.id && !/^can|^veat|result/i.test(t.noticeType))
    .filter((t) => !t.deadline || new Date(t.deadline).getTime() > Date.now());
}

/**
 * Past contract award notices: who won similar work, from whom, at what price.
 * Cached in Valkey for 6h because the archive changes slowly.
 */
export async function searchAwards(q: { cpv?: string[]; buyer?: string; countries?: string[]; years?: number }) {
  const clauses = ['notice-type=can-standard'];
  if (q.cpv?.length) clauses.push(or(q.cpv.map((c) => `classification-cpv=${cpvPattern(c)}`)));
  if (q.buyer) clauses.push(`FT~${quote(q.buyer)}`);
  if (q.countries?.length) clauses.push(or(q.countries.map((c) => `buyer-country=${c}`)));
  const since = new Date(Date.now() - (q.years ?? 3) * 365 * 86_400_000);
  clauses.push(`publication-date>=${ymd(since)}`);
  const query = `${clauses.join(' AND ')} SORT BY publication-date DESC`;

  const cacheKey = `ted:awards:${query}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as Award[];

  const notices = await search({ query, fields: [...CORE_FIELDS, ...AWARD_FIELDS], limit: 40, scope: 'ALL' });
  const awards: Award[] = notices.map((n) => {
    const id = text(n['publication-number']);
    return {
      id,
      title: text(n['notice-title']),
      buyer: text(n['buyer-name']),
      country: list(n['buyer-country'])[0] ?? '',
      winners: list(n['winner-name']).slice(0, 4),
      value: num(n['total-value']) ?? num(n['tender-value']),
      currency: text(n['total-value-cur']) || text(n['tender-value-cur']) || null,
      published: date(n['publication-date']),
      url: noticeUrl(id),
    };
  });
  await redis.set(cacheKey, JSON.stringify(awards), 'EX', 6 * 3600).catch(() => {});
  return awards;
}
