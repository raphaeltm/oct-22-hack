// TED (EU Tenders Electronic Daily) importer: French IT-services tenders
// (cn-standard) and award notices with winners (can-standard).
//
//   npm run import:ted                      # everything since 2025-01-01
//   npm run import:ted -- --since 20250901 --limit 500
//
// Idempotent: tenders upsert on publication_number, a tender's awards are
// replaced on every re-import, organisations upsert on normalised_name.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { db, pool, runMigrations } from '../db';
import { awards, organisations, tenders } from '../db/schema';

const SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

const FIELDS = [
  'publication-number',
  'notice-type',
  'notice-title',
  'title-proc',
  'title-lot',
  'description-proc',
  'description-lot',
  'buyer-name',
  'buyer-country',
  'classification-cpv',
  'publication-date',
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',
  'deadline-receipt-request',
  'estimated-value-proc',
  'estimated-value-cur-proc',
  'total-value',
  'total-value-cur',
  'winner-name',
  'winner-country',
  'winner-decision-date',
  'tender-value',
  'tender-value-cur',
  'result-value-lot',
  // Groupements: the leader flag is only present when a tendering party has
  // several members; the full structure is read from the notice XML (ted-parties.ts).
  'tendering-party-name',
  'tendering-party-leader',
  // Pre-bid dossier (eForms): award criteria, duration/renewals, framework,
  // procurement documents, bids received, contract conclusion.
  'procedure-identifier',
  'procedure-type',
  'award-criterion-type-lot',
  'award-criterion-description-lot',
  'award-criterion-number-lot',
  'duration-period-value-lot',
  'duration-period-unit-lot',
  'contract-duration-end-date-lot',
  'renewal-maximum-lot',
  'framework-agreement-lot',
  'document-url-lot',
  'submission-url-lot',
  'deadline-receipt-answers-date-lot',
  'received-submissions-type-code',
  'received-submissions-type-val',
  'contract-conclusion-date',
  'tender-value-lowest',
  'tender-value-highest',
];

// TED caps (fields + links) x page size at 10,000.
const PAGE_SIZE = Math.min(250, Math.floor(10_000 / (FIELDS.length + 2)));

type Multilingual = Record<string, string | string[]>;
type Notice = Record<string, unknown>;

export interface ImportTedOptions {
  /** Publication date lower bound, YYYYMMDD or YYYY-MM-DD. Default 20250101. */
  since?: string;
  /** Stop after this many notices. */
  limit?: number;
  onProgress?: (n: number) => void;
}

export interface ImportTedResult {
  notices: number;
  awards: number;
  total: number;
}

export function buildQuery(since: string) {
  const d = since.replace(/-/g, '');
  return `buyer-country=FRA AND classification-cpv IN (72* 79411000) AND publication-date>=${d} AND notice-type IN (cn-standard can-standard)`;
}

export async function importTed(opts: ImportTedOptions = {}): Promise<ImportTedResult> {
  const query = buildQuery(opts.since ?? '20250101');
  let token: string | null = null;
  let done = 0;
  let awardRows = 0;
  let total = 0;

  while (true) {
    const pageSize = opts.limit ? Math.min(PAGE_SIZE, opts.limit - done) : PAGE_SIZE;
    if (pageSize <= 0) break;
    const page = await search({
      query,
      fields: FIELDS,
      limit: pageSize,
      paginationMode: 'ITERATION',
      ...(token ? { iterationNextToken: token } : {}),
    });
    total = page.totalNoticeCount;
    for (const notice of page.notices) {
      awardRows += await upsertNotice(notice);
      done++;
    }
    opts.onProgress?.(done);
    token = page.iterationNextToken;
    if (!token || page.notices.length === 0) break;
  }
  return { notices: done, awards: awardRows, total };
}

async function search(body: object): Promise<{
  notices: Notice[];
  totalNoticeCount: number;
  iterationNextToken: string | null;
}> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json() as never;
    const text = await res.text();
    if (attempt >= 5 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`TED search failed: ${res.status} ${text.slice(0, 500)}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

// ---------- field mapping ----------

const LANG_ORDER = ['fra', 'eng'];

/** TED text is sometimes HTML-escaped once or twice ("&amp;amp;"). */
function unescape(s: string) {
  let prev = '';
  while (prev !== s && s.includes('&')) {
    prev = s;
    s = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return s;
}

/** Values of a multilingual field, preferring fra, then eng, then any. */
function ml(field: unknown): string[] {
  if (!field || typeof field !== 'object') return [];
  const m = field as Multilingual;
  const key = LANG_ORDER.find((k) => m[k] != null) ?? Object.keys(m)[0];
  if (!key) return [];
  const v = m[key];
  return (Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === 'string');
}

function list(field: unknown): string[] {
  if (field == null) return [];
  return (Array.isArray(field) ? field : [field]).map(String);
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}

/** TED dates look like "2025-01-02+01:00" (date with offset). */
function tedDate(v: string | undefined, time = '00:00:00'): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})(T[\d:]+)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${m[1]}${m[2] ?? `T${time}`}${m[3] ?? 'Z'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "France – IT services – <french title>" -> "<french title>". */
export function stripTitlePrefix(title: string) {
  const parts = title.split(' – ');
  return parts.length >= 3 ? parts.slice(2).join(' – ').trim() : title.trim();
}

function deadlineOf(n: Notice): Date | null {
  const dates = list(n['deadline-receipt-tender-date-lot']);
  const times = list(n['deadline-receipt-tender-time-lot']);
  const candidates: Date[] = dates
    .map((d, i) => {
      // date "2025-02-03+02:00" + time "14:30:00+02:00"
      const t = times[i]?.match(/^([\d:]+)/)?.[1];
      return tedDate(d, t ?? '23:59:59');
    })
    .filter((d): d is Date => d != null);
  if (!candidates.length) {
    candidates.push(...list(n['deadline-receipt-request']).map((d) => tedDate(d)).filter((d): d is Date => d != null));
  }
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

const LEGAL_SUFFIXES = new Set(['sa', 'sas', 'sasu', 'sarl', 'eurl']);

export function normaliseName(name: string) {
  const s = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/_\d+\s*$/, '')
    // consortium notes: "X, Co-traitant : Y", "X (mandataire) / Y (co-traitant)"
    .replace(/\s*[,(/-]\s*(co-?traitants?|mandataire)\b.*$/, '')
    // dotted legal forms: "s.a.s." -> "sas"
    .replace(/\b(?:[a-z]\.){1,4}[a-z]?\.?(?=\s|$|[,)])/g, (m) => m.replace(/\./g, ''))
    .replace(/[,()]/g, ' ');
  const tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1].replace(/[.\-]+$/, '');
    if (!last || LEGAL_SUFFIXES.has(last)) tokens.pop();
    else break;
  }
  return tokens.join(' ').replace(/[\s.,\-]+$/, '');
}

interface WinnerRow {
  name: string;
  country: string | null;
  value: number | null;
  currency: string | null;
}

/** One row per distinct winner. Values are only attributed when unambiguous. */
function winnersOf(n: Notice): WinnerRow[] {
  const names = ml(n['winner-name']).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return [];
  const countries = list(n['winner-country']);
  const tenderValues = list(n['tender-value']).map(num);
  const currency = list(n['tender-value-cur'])[0] ?? list(n['total-value-cur'])[0] ?? null;
  const totalValue = num(n['total-value']);

  const byKey = new Map<string, WinnerRow & { values: (number | null)[] }>();
  names.forEach((name, i) => {
    const key = normaliseName(name);
    if (!key) return;
    const country = countries.length === names.length ? countries[i] : countries.length === 1 ? countries[0] : null;
    const value = tenderValues.length === names.length ? tenderValues[i] : null;
    const row = byKey.get(key);
    if (row) row.values.push(value);
    else byKey.set(key, { name, country: country ?? null, value: null, currency, values: [value] });
  });

  const rows = [...byKey.values()];
  for (const r of rows) {
    const known = r.values.filter((v): v is number => v != null);
    r.value = known.length ? known.reduce((a, b) => a + b, 0) : null;
  }
  // A single winner takes the whole notice value.
  if (rows.length === 1 && totalValue != null) rows[0].value = totalValue;
  return rows.map(({ values: _v, ...r }) => r);
}

async function upsertNotice(n: Notice): Promise<number> {
  const publicationNumber = String(n['publication-number']);
  const noticeType = String(n['notice-type']);
  // Titles/descriptions only: names stay as-is so organisation keys don't change.
  const title = unescape(
    ml(n['title-proc'])[0] || stripTitlePrefix(ml(n['notice-title'])[0] ?? '') || ml(n['title-lot'])[0] || '',
  );
  const rawDescription = ml(n['description-proc'])[0] ?? (ml(n['description-lot']).join('\n\n') || null);
  const description = rawDescription && unescape(rawDescription);
  const cpvCodes = [...new Set(list(n['classification-cpv']))];
  const publicationDate = tedDate(list(n['publication-date'])[0]);
  const estimatedValue = num(n['estimated-value-proc']) ?? num(n['total-value']);
  const currency = list(n['estimated-value-cur-proc'])[0] ?? list(n['total-value-cur'])[0] ?? null;

  // Links are ~100 per-language URLs; drop them from the stored raw notice.
  const { links: _links, ...raw } = n;

  const values = {
    publicationNumber,
    noticeType,
    title: title || publicationNumber,
    description,
    buyerName: ml(n['buyer-name'])[0] ?? null,
    buyerCountry: list(n['buyer-country'])[0] ?? null,
    cpvCodes,
    estimatedValue,
    currency,
    deadline: noticeType === 'cn-standard' ? deadlineOf(n) : null,
    publicationDate,
    url: `https://ted.europa.eu/en/notice/-/detail/${publicationNumber}`,
    procedureId: list(n['procedure-identifier'])[0] ?? null,
    raw,
  };

  const winners = noticeType === 'can-standard' ? winnersOf(n) : [];
  const awardDate = tedDate(list(n['winner-decision-date'])[0]) ?? publicationDate;

  return db.transaction(async (tx) => {
    const { publicationNumber: _pn, ...update } = values;
    const [tender] = await tx
      .insert(tenders)
      .values(values)
      .onConflictDoUpdate({ target: tenders.publicationNumber, set: { ...update, updatedAt: new Date() } })
      .returning({ id: tenders.id });

    await tx.delete(awards).where(eq(awards.tenderId, tender.id));
    for (const w of winners) {
      const [org] = await tx
        .insert(organisations)
        .values({ name: w.name, normalisedName: normaliseName(w.name), country: w.country })
        .onConflictDoUpdate({
          target: organisations.normalisedName,
          set: { updatedAt: new Date(), country: sql`coalesce(${organisations.country}, excluded.country)` },
        })
        .returning({ id: organisations.id });
      await tx.insert(awards).values({
        tenderId: tender.id,
        organisationId: org.id,
        winnerName: w.name,
        winnerCountry: w.country,
        value: w.value,
        currency: w.currency,
        awardDate,
      });
    }
    return winners.length;
  });
}

// ---------- CLI ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const started = Date.now();
  try {
    await runMigrations();
    const result = await importTed({
      since: arg('since'),
      limit,
      onProgress: (n) => console.log(`imported ${n} notices`),
    });
    console.log(
      `done: ${result.notices}/${result.total} notices, ${result.awards} award rows in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
