// Shared helpers for tender matching and competitor ranking (issues #7, #8):
// CPV similarity, name/buyer normalisation, competitor alias keys, profile
// keywords, and Postgres full-text similarity.
import { pool } from '../db';

// ---------- CPV ----------

/** Significant digits of a CPV code: "72413000" -> "72413", "72000000" -> "72". */
export function cpvSig(code: string): string {
  const c = code.trim().split('-')[0].replace(/\D/g, '').slice(0, 8);
  const s = c.replace(/0+$/, '');
  return s.length < 2 ? c.slice(0, 2) : s;
}

const LEVEL = (digits: number) => (digits >= 5 ? 1 : digits === 4 ? 0.8 : digits === 3 ? 0.6 : digits === 2 ? 0.4 : 0);

/**
 * Similarity of two CPV codes in [0, 1], weighted by specificity:
 * identical / nested codes score by the depth of the more general one
 * (division 0.4, group 0.6, class 0.8, category+ 1.0); siblings that only
 * share a prefix score 70% of the shared level. Different divisions -> 0.
 */
export function cpvPairSim(a: string, b: string): number {
  const sa = cpvSig(a);
  const sb = cpvSig(b);
  let common = 0;
  while (common < Math.min(sa.length, sb.length) && sa[common] === sb[common]) common++;
  if (common < 2) return 0;
  if (common >= Math.min(sa.length, sb.length)) return LEVEL(Math.min(sa.length, sb.length));
  return LEVEL(common) * 0.7;
}

/**
 * Best pairwise similarity between two CPV lists, with the codes that produced it.
 * `strong` ignores matches on generic codes of `b` (division/group level such as
 * 72400000 "internet services", which also covers telecoms) and sibling matches
 * below 0.6, so it is safe to use as a relevance filter.
 */
export function cpvSim(a: string[], b: string[]): { sim: number; strong: number; mine?: string; theirs?: string } {
  let best = { sim: 0, strong: 0 } as { sim: number; strong: number; mine?: string; theirs?: string };
  for (const x of a) for (const y of b) {
    const s = cpvPairSim(x, y);
    if (s > best.sim) best = { ...best, sim: s, mine: x, theirs: y };
    if (cpvSig(y).length >= 4 && s >= 0.6 && s > best.strong) best.strong = s;
  }
  return best;
}

export const CPV_LABELS: Record<string, string> = {
  '72000000': 'IT services',
  '72200000': 'software programming and consultancy',
  '72210000': 'programming of packaged software',
  '72212000': 'application software development',
  '72220000': 'systems and technical consultancy',
  '72222300': 'IT services consultancy',
  '72224000': 'IT project management consultancy',
  '72230000': 'custom software development',
  '72250000': 'system and support services',
  '72260000': 'software-related services',
  '72267000': 'software maintenance',
  '72267100': 'IT software maintenance',
  '72300000': 'data services',
  '72310000': 'data processing',
  '72320000': 'database services',
  '72322000': 'data management',
  '72400000': 'internet services',
  '72413000': 'website design',
  '72415000': 'website hosting',
  '72420000': 'internet development',
  '72500000': 'computer-related services',
  '72510000': 'computer-related management',
  '72600000': 'computer support and consultancy',
  '72700000': 'computer network services',
  '72800000': 'computer audit and testing',
  '48000000': 'software packages',
  '79411000': 'general management consultancy',
  '79400000': 'business and management consultancy',
  '80500000': 'training services',
};
export const cpvLabel = (code: string) => (CPV_LABELS[code] ? `${code} (${CPV_LABELS[code]})` : code);

// ---------- names ----------

export function fold(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();
}

/** Buyer key for "same buyer" comparisons (case/accent/punctuation-insensitive). */
export const buyerKey = (name: string | null | undefined) => fold(name);

// Big groups whose subsidiaries/entities appear under many names in TED.
const BRANDS: [RegExp, string][] = [
  [/^cap ?gemini\b/, 'capgemini'],
  [/^cgi\b/, 'cgi'],
  [/^sopra ?steria\b/, 'sopra steria'],
  [/^atos\b/, 'atos'],
  [/^inetum\b/, 'inetum'],
  [/^orange business\b/, 'orange business services'],
  [/^orange cyberdefense\b/, 'orange cyberdefense'],
  [/^econocom\b/, 'econocom'],
  [/^docaposte\b/, 'docaposte'],
  [/^deloitte\b/, 'deloitte'],
  [/^accenture\b/, 'accenture'],
  [/^scc\b/, 'scc'],
  [/^wavestone\b/, 'wavestone'],
  [/^kpmg\b/, 'kpmg'],
  [/^(pwc|pricewaterhouse)/, 'pwc'],
  [/^(ernst & young|ey advisory|ey )/, 'ernst & young'],
  [/^ibm\b/, 'ibm'],
  [/^alten\b/, 'alten'],
  [/^akkodis\b/, 'akkodis'],
  [/^talan\b/, 'talan'],
  [/^onepoint\b/, 'onepoint'],
  [/^berger levrault\b/, 'berger levrault'],
  [/^bouygues telecom\b/, 'bouygues telecom'],
  [/^spie ics\b/, 'spie ics'],
  [/^nxo\b/, 'nxo'],
  [/^computacenter\b/, 'computacenter'],
  [/^insight\b/, 'insight'],
  [/^micropole\b/, 'micropole'],
  [/^neurones\b/, 'neurones'],
  [/^sii\b/, 'sii'],
];
const SUFFIX_TOKENS = new Set(['france', 'group', 'groupe', 'sas', 'sa', 'sasu', 'sarl', 'eurl', 'se', 'mandataire', 'rang', 'ltd', 'gmbh', 'bv', 'nv', 'inc', 'holding', '1', '2', '3']);

/**
 * Light alias key used to group name variants of the same competitor:
 * "CGI France" / "CGI" -> "cgi", "SOPRA STERIA GROUP" -> "sopra steria".
 * Conservative: known big brands by prefix, otherwise only legal/geo suffixes
 * and " - ..." qualifiers are stripped.
 */
export function aliasKey(name: string): string {
  let s = fold(name.replace(/\(.*?\)/g, ' ').split(/\s[-–]\s/)[0]);
  for (const [re, key] of BRANDS) if (re.test(s)) return key;
  const toks = s.split(' ').filter(Boolean);
  while (toks.length > 1 && SUFFIX_TOKENS.has(toks[toks.length - 1])) toks.pop();
  s = toks.join(' ');
  return s || fold(name);
}

// ---------- profile keywords ----------

// English (and French) profile phrases -> French search terms used in notices.
const EXPANSIONS: [RegExp, string[]][] = [
  [/accessib|rgaa/, ['accessibilité', 'RGAA']],
  [/\bdsfr\b|design system/, ['DSFR', 'système de design']],
  [/\bweb\b|website|site internet|site web/, ['"site internet"', '"site web"', 'refonte']],
  [/portal|portail/, ['portail']],
  [/mobile/, ['"application mobile"']],
  [/cloud/, ['cloud']],
  [/hosting|hébergement|hebergement/, ['hébergement']],
  [/sovereign|souverain|secnumcloud/, ['souverain', 'SecNumCloud']],
  [/open.?data|données ouvertes/, ['"open data"', '"données ouvertes"']],
  [/dashboard|tableau/, ['"tableau de bord"', 'datavisualisation']],
  [/\bdata\b|données/, ['données']],
  [/user research|\bux\b|user experience|service design/, ['UX', '"expérience utilisateur"', 'ergonomie']],
  [/design/, ['design']],
  [/migration/, ['migration']],
  [/open.?source|logiciel libre/, ['"logiciel libre"', '"open source"']],
  [/training|formation/, ['formation']],
  [/cyber|security|sécurité/, ['cybersécurité']],
  [/devops/, ['DevOps']],
  [/\bcrm\b/, ['CRM']],
  [/\bgis\b|\bsig\b|cartograph/, ['SIG', 'cartographie']],
  [/\bai\b|artificial intelligence|intelligence artificielle/, ['"intelligence artificielle"']],
  [/citizen|usager|e-service|démarches|demarches/, ['"démarches en ligne"', 'usagers']],
];
const ACRONYM_SKIP = new Set(['SME', 'ESN', 'IT', 'EU', 'PME', 'SA', 'SAS', 'OVHCLOUD']);

/** French full-text keywords derived from the company profile. */
export function profileKeywords(company: {
  services: string[];
  differentiators: string[];
  sectors?: string[];
  description: string | null;
  profile: Record<string, unknown>;
}): string[] {
  const out: string[] = [];
  const explicit = company.profile?.keywords;
  if (Array.isArray(explicit)) for (const k of explicit) if (typeof k === 'string' && k.trim()) out.push(k.trim());
  const text = [...company.services, ...company.differentiators, company.description ?? ''].join(' . ');
  for (const m of text.match(/\b[A-Za-z]*[A-Z][a-z]*[A-Z][A-Za-z]*\b/g) ?? []) {
    if (!ACRONYM_SKIP.has(m.toUpperCase()) && m.length >= 2) out.push(m);
  }
  const lower = text.toLowerCase();
  for (const [re, terms] of EXPANSIONS) if (re.test(lower)) out.push(...terms);
  const seen = new Set<string>();
  return out.filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** websearch_to_tsquery string OR-ing the keywords. */
export function orQuery(keywords: string[]): string {
  return keywords.map((k) => (k.includes(' ') && !k.startsWith('"') ? `"${k}"` : k)).join(' or ');
}

// Region hints: buyer/title words that place a tender in a region.
const REGION_HINTS: [RegExp, string[]][] = [
  [/auvergne|rh[oô]ne|aura/i, ['lyon', 'rhone', 'grenoble', 'isere', 'saint etienne', 'loire', 'clermont', 'auvergne', 'savoie', 'annecy', 'villeurbanne', 'ain', 'drome', 'ardeche', 'valence', 'chambery', 'allier', 'puy de dome', 'cantal']],
  [/[iî]le.de.france|paris|idf/i, ['paris', 'ile de france', 'hauts de seine', 'seine saint denis', 'val de marne', 'essonne', 'yvelines', 'val d oise', 'seine et marne']],
  [/provence|paca|sud\b|c[oô]te d.azur/i, ['marseille', 'nice', 'toulon', 'provence', 'bouches du rhone', 'var', 'vaucluse', 'alpes maritimes', 'avignon', 'aix']],
  [/occitanie/i, ['toulouse', 'montpellier', 'occitanie', 'herault', 'gard', 'nimes', 'perpignan', 'haute garonne']],
  [/nouvelle.aquitaine/i, ['bordeaux', 'gironde', 'limoges', 'poitiers', 'nouvelle aquitaine', 'pau', 'la rochelle']],
  [/bretagne/i, ['rennes', 'brest', 'bretagne', 'finistere', 'morbihan', 'ille et vilaine', 'lorient', 'quimper']],
  [/pays de la loire/i, ['nantes', 'angers', 'le mans', 'loire atlantique', 'vendee', 'pays de la loire']],
  [/hauts.de.france/i, ['lille', 'amiens', 'nord', 'pas de calais', 'somme', 'hauts de france', 'oise', 'aisne']],
  [/grand est/i, ['strasbourg', 'metz', 'nancy', 'reims', 'grand est', 'alsace', 'moselle', 'mulhouse']],
];

export function regionTerms(regions: string[]): string[] {
  const out = new Set<string>();
  for (const r of regions) for (const [re, terms] of REGION_HINTS) if (re.test(r)) terms.forEach((t) => out.add(t));
  return [...out];
}

export function regionHit(terms: string[], ...texts: (string | null | undefined)[]): string | null {
  if (!terms.length) return null;
  const hay = ` ${texts.map(fold).join(' ')} `;
  return terms.find((t) => hay.includes(` ${t} `)) ?? null;
}

// ---------- full-text similarity ----------

let commonLexemes: { at: number; set: Set<string> } | null = null;

/** Lexemes present in more than 6% of notices (too generic to signal similarity). */
async function getCommonLexemes(): Promise<Set<string>> {
  if (commonLexemes && Date.now() - commonLexemes.at < 3600_000) return commonLexemes.set;
  const { rows } = await pool.query<{ word: string }>(
    `SELECT word FROM ts_stat('SELECT search FROM tenders')
     WHERE ndoc > 0.06 * (SELECT greatest(count(*), 1) FROM tenders)`,
  );
  commonLexemes = { at: Date.now(), set: new Set(rows.map((r) => r.word)) };
  return commonLexemes.set;
}

/** Distinctive French lexemes of a text (for "similar notice" search). */
export async function distinctiveLexemes(text: string, max = 25): Promise<string[]> {
  const common = await getCommonLexemes();
  const { rows } = await pool.query<{ lexeme: string; n: number }>(
    `SELECT lexeme, array_length(positions, 1) AS n FROM unnest(to_tsvector('french', $1))`,
    [text],
  );
  return rows
    .filter((r) => r.lexeme.length >= 4 && !/^\d+$/.test(r.lexeme) && !common.has(r.lexeme))
    .sort((a, b) => (b.n ?? 0) - (a.n ?? 0))
    .slice(0, max)
    .map((r) => r.lexeme);
}

export type TextHit = { sim: number; matched: string[] };

/**
 * Full-text similarity of award (or other) notices to a set of terms.
 * mode 'lexeme': already-stemmed lexemes; mode 'websearch': user keywords/phrases.
 * sim in [0,1] = coverage of terms (saturating at `saturate` matched terms) x relative rank.
 */
export async function textSimilarity(
  terms: string[],
  mode: 'lexeme' | 'websearch',
  where: string,
  opts: { minMatched?: number; saturate?: number; limit?: number } = {},
): Promise<Map<string, TextHit>> {
  const out = new Map<string, TextHit>();
  if (!terms.length) return out;
  const minMatched = opts.minMatched ?? 1;
  const saturate = Math.max(1, Math.min(opts.saturate ?? 3, terms.length));
  const query =
    mode === 'lexeme'
      ? `to_tsquery('simple', $1)`
      : `websearch_to_tsquery('french', $1)`;
  const termQuery = mode === 'lexeme' ? `to_tsquery('simple', quote_literal(k))` : `websearch_to_tsquery('french', k)`;
  const qstr = mode === 'lexeme' ? terms.map((t) => `'${t.replace(/'/g, "''")}'`).join(' | ') : orQuery(terms);
  const { rows } = await pool.query<{ id: string; r: number; matched: string[] }>(
    `SELECT t.id, ts_rank(t.search, ${query}, 32)::float8 AS r,
       ARRAY(SELECT k FROM unnest($2::text[]) k WHERE t.search @@ ${termQuery}) AS matched
     FROM tenders t
     WHERE ${where} AND t.search @@ ${query}
     ORDER BY r DESC LIMIT ${opts.limit ?? 400}`,
    [qstr, terms],
  );
  const maxR = rows.reduce((m, r) => Math.max(m, r.r), 0) || 1;
  for (const r of rows) {
    if (r.matched.length < minMatched) continue;
    const coverage = Math.min(1, r.matched.length / saturate);
    out.set(r.id, { sim: coverage * (0.5 + 0.5 * (r.r / maxR)), matched: r.matched });
  }
  return out;
}

// ---------- misc ----------

export const isoDate = (d: unknown): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export function fmtEur(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e6) return `€${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `€${Math.round(v / 1e3)}k`;
  return `€${Math.round(v)}`;
}

export const hasModel = () => Boolean(process.env.ANTHROPIC_API_KEY);
