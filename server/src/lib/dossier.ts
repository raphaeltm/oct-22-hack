// Pre-bid dossier (issue #19): what a bid manager would assemble in the first
// days after a matching tender is published. Facts come from the TED notice
// (eForms fields kept in tenders.raw), award history and the company profile;
// Claude only writes the short memo and buyer questions from those facts.
import { Agent } from '@mastra/core/agent';
import { pool } from '../db';
import type { CompanyRow } from '../mastra/tools/company';
import { awardIndex, competitorsForTender, findIncumbent } from './competitors';
import { applyRules, learnedForCompany, recordPredictions } from './learning';
import { aliasKey, cpvSim, fmtEur, hasModel, isoDate, regionHit, regionTerms } from './text';

type Raw = Record<string, unknown>;

const list = (v: unknown): string[] => (v == null ? [] : (Array.isArray(v) ? v : [v]).map(String));
const ml = (v: unknown): string[] => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return list(v);
  const m = v as Record<string, unknown>;
  return list(m.fra ?? m.eng ?? Object.values(m)[0]);
};
const decode = (url: string) => url.replace(/&amp;/g, '&');
const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export type DossierCriterion = { type: string; name: string | null; weight: number | null };
export type Requirement = { key: string; label: string; evidence: string; covered: boolean | null };
export type CalendarItem = { label: string; date: string; kind: 'official' | 'estimate' | 'suggested'; note?: string };

export type Dossier = {
  version: 1;
  generatedAt: string;
  tender: {
    id: string;
    publicationNumber: string;
    title: string;
    buyerName: string | null;
    url: string | null;
    procedureType: string | null;
    estimatedValue: number | null;
    deadline: string | null;
    publicationDate: string | null;
    lots: number;
    daysLeft: number | null;
  };
  fit: {
    score: number | null;
    rationale: string | null;
    learned: { delta: number; label: string }[];
    signals: Record<string, number>;
  };
  calendar: CalendarItem[];
  criteria: { items: DossierCriterion[]; priceWeight: number | null; environmental: boolean; note: string };
  contract: { framework: string | null; duration: string | null; renewals: number | null; endDate: string | null };
  documents: { dceUrl: string | null; submissionUrl: string | null };
  requirements: Requirement[];
  buyerHistory: {
    awardNotices: number;
    recent: { tenderId: string; title: string; date: string | null; winners: string[]; bidsReceived: number | null; url: string | null }[];
  };
  incumbent: { name: string; organisationId: string | null; basis: string; url: string | null; confidence: 'possible' } | null;
  competitors: { name: string; organisationId: string | null; incumbent: boolean; why: string; url: string | null }[];
  market: { similarAwards: number; valueN: number; valueMedian: number | null; valueP25: number | null; valueP75: number | null; bidsN: number; bidsMedian: number | null };
  checklist: { item: string; note?: string }[];
  questions: { fr: string; en: string }[];
  recommendation: { verdict: 'go' | 'consider' | 'no-go'; reasons: string[] };
  memo: string | null;
  memoBy: 'model' | 'rules';
  sources: { label: string; url: string }[];
};

// ---------- notice parsing ----------

const FRAMEWORK: Record<string, string> = {
  'fa-wo-rc': 'Framework agreement, call-offs without reopening competition',
  'fa-w-rc': 'Framework agreement, call-offs with reopened competition (mini-competitions)',
  'fa-mix': 'Framework agreement, mixed call-off rules',
};
const PROCEDURE: Record<string, string> = {
  open: 'Open procedure (appel d’offres ouvert)',
  restricted: 'Restricted procedure (appel d’offres restreint)',
  'neg-w-call': 'Competitive negotiated procedure',
  'comp-dial': 'Competitive dialogue',
  innovation: 'Innovation partnership',
  oth: 'Other / adapted procedure',
};

/** Award criteria of the first lot (lots usually repeat the same grid). */
export function parseCriteria(raw: Raw): DossierCriterion[] {
  const types = list(raw['award-criterion-type-lot']);
  const names = ml(raw['award-criterion-description-lot']);
  const weights = list(raw['award-criterion-number-lot']).map(Number);
  if (!types.length) return [];
  const out: DossierCriterion[] = [];
  let total = 0;
  for (let i = 0; i < types.length; i++) {
    const w = Number.isFinite(weights[i]) ? weights[i] : null;
    out.push({ type: types[i], name: names[i] ?? null, weight: w });
    total += w ?? 0;
    // Stop at the end of the first lot's grid (weights summing to 100).
    if (total >= 100 && i + 1 < types.length) break;
  }
  return out;
}

function parseDuration(raw: Raw): string | null {
  const v = list(raw['duration-period-value-lot'])[0];
  const u = list(raw['duration-period-unit-lot'])[0];
  if (!v) return null;
  const unit = { MONTH: 'month', YEAR: 'year', DAY: 'day' }[u ?? ''] ?? (u ?? '').toLowerCase();
  return `${v} ${unit}${v === '1' ? '' : 's'}`;
}

const REQUIREMENTS: { key: string; label: string; re: RegExp; profile: RegExp }[] = [
  { key: 'rgaa', label: 'Accessibility (RGAA)', re: /\bRGAA\b|accessibilit/i, profile: /rgaa|accessib/i },
  { key: 'dsfr', label: 'State design system (DSFR)', re: /\bDSFR\b|syst[eè]me de design de l.[ée]tat/i, profile: /dsfr|design system/i },
  { key: 'secnumcloud', label: 'SecNumCloud / sovereign hosting', re: /secnumcloud|cloud souverain|h[ée]bergement souverain|souverainet/i, profile: /secnumcloud|sovereign|souverain/i },
  { key: 'hds', label: 'Health-data hosting (HDS)', re: /\bHDS\b|donn[ée]es de sant[ée]/i, profile: /\bhds\b|health/i },
  { key: 'rgpd', label: 'GDPR / personal data (RGPD)', re: /\bRGPD\b|donn[ée]es (à caract[eè]re )?personnel/i, profile: /rgpd|gdpr|personal data/i },
  { key: 'rgs', label: 'Security accreditation (RGS / homologation)', re: /\bRGS\b|homologation/i, profile: /\brgs\b|homologation|security accreditation/i },
  { key: 'iso27001', label: 'ISO 27001', re: /27001/, profile: /27001/ },
  { key: 'opensource', label: 'Open source / logiciel libre', re: /logiciel(s)? libre|open.?source/i, profile: /open.?source|logiciel libre/i },
  { key: 'tma', label: 'Application maintenance (TMA)', re: /\bTMA\b|maintenance applicative|tierce maintenance/i, profile: /\btma\b|maintenance/i },
  { key: 'hosting', label: 'Hosting (hébergement)', re: /h[ée]bergement/i, profile: /hosting|h[ée]bergement|cloud/i },
  { key: 'ecodesign', label: 'Eco-design (RGESN / sobriété)', re: /RGESN|[ée]co-?conception|sobri[ée]t[ée] num/i, profile: /rgesn|eco-?design|[ée]co-?conception|sobri/i },
  { key: 'agile', label: 'Agile delivery', re: /\bagile\b|agilit[ée]|scrum/i, profile: /agile|scrum/i },
];

function snippet(text: string, re: RegExp, width = 70): string {
  const m = re.exec(text);
  if (!m) return '';
  const start = Math.max(0, m.index - width);
  const end = Math.min(text.length, m.index + m[0].length + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

function companyText(c: CompanyRow) {
  return [c.description, ...c.services, ...c.differentiators, ...c.sectors, JSON.stringify(c.profile ?? {})].join(' ');
}

const median = (xs: number[]) => quantile(xs, 0.5);
function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (pos - lo));
}

/** Bids received on an award notice: the "tenders" count, max over lots. */
function bidsReceived(raw: Raw | null): number | null {
  if (!raw) return null;
  const codes = list(raw['received-submissions-type-code']);
  const vals = list(raw['received-submissions-type-val']).map(Number);
  const xs = vals.filter((v, i) => Number.isFinite(v) && (codes[i] === 'tenders' || codes.length !== vals.length));
  return xs.length ? Math.max(...xs) : null;
}

// ---------- builder ----------

export async function buildDossier(company: CompanyRow, tenderId: string): Promise<Dossier> {
  const { rows } = await pool.query<{
    id: string; publication_number: string; title: string; description: string | null; buyer_name: string | null;
    cpv_codes: string[]; estimated_value: number | null; deadline: Date | null; publication_date: Date | null; url: string | null; raw: Raw | null;
  }>(
    `SELECT id, publication_number, title, description, buyer_name, cpv_codes, estimated_value::float8 AS estimated_value,
       deadline, publication_date, url, raw FROM tenders WHERE id = $1`,
    [tenderId],
  );
  const t = rows[0];
  if (!t) throw new Error(`tender ${tenderId} not found`);
  const raw = t.raw ?? {};
  const now = new Date();
  const value = t.estimated_value && t.estimated_value > 1 ? t.estimated_value : null;
  const daysLeft = t.deadline ? Math.ceil((t.deadline.getTime() - now.getTime()) / DAY) : null;
  const lots = Math.max(1, list(raw['title-lot']).length ? ml(raw['title-lot']).length : 1);

  // Fit (from the saved match, plus what the company taught us).
  const [match, learned] = await Promise.all([
    pool.query<{ score: number; rationale: string | null; signals: Record<string, unknown> | null }>(
      `SELECT score, rationale, signals FROM tender_matches WHERE company_id = $1 AND tender_id = $2`,
      [company.id, tenderId],
    ),
    learnedForCompany(company.id),
  ]);
  const regionOk = !!regionHit(regionTerms(company.regions), t.buyer_name, t.title);
  const learnedRules = applyRules(learned, { buyerName: t.buyer_name, cpvCodes: t.cpv_codes, estimatedValue: value, regionHit: regionOk });
  const cpv = cpvSim(company.cpvCodes, t.cpv_codes);

  // Criteria / contract.
  const criteria = parseCriteria(raw);
  const priceWeight = criteria.filter((c) => c.type === 'price').reduce((a, c) => a + (c.weight ?? 0), 0) || null;
  const environmental =
    list(raw['green-procurement-criteria-lot']).length > 0 ||
    criteria.some((c) => /environ|durable|carbone|[ée]co|sobri/i.test(c.name ?? ''));
  const framework = FRAMEWORK[list(raw['framework-agreement-lot'])[0] ?? ''] ?? null;
  const renewalsRaw = list(raw['renewal-maximum-lot'])[0];
  const endDate = isoDate(list(raw['contract-duration-end-date-lot'])[0]?.slice(0, 10));

  // Calendar.
  const calendar: CalendarItem[] = [];
  if (t.publication_date) calendar.push({ label: 'Published on TED', date: isoDate(t.publication_date)!, kind: 'official' });
  const answers = list(raw['deadline-receipt-answers-date-lot'])[0];
  if (t.deadline) {
    const goNoGo = new Date(Math.min(addDays(t.publication_date ?? now, 7).getTime(), addDays(t.deadline, -14).getTime()));
    if (goNoGo > now) calendar.push({ label: 'Go / no-go decision', date: isoDate(goNoGo)!, kind: 'suggested', note: 'Leaves two weeks to write the response.' });
    if (answers) {
      calendar.push({ label: 'Deadline for questions to the buyer', date: isoDate(answers.slice(0, 10))!, kind: 'official' });
    } else {
      calendar.push({
        label: 'Send questions to the buyer by',
        date: isoDate(addDays(t.deadline, -10))!,
        kind: 'estimate',
        note: 'The buyer must answer at least 6 days before the deadline (Code de la commande publique, R2132-6), so ask ~10 days ahead. Check the RC for the exact rule.',
      });
    }
    calendar.push({ label: 'Internal review of the full response', date: isoDate(addDays(t.deadline, -3))!, kind: 'suggested' });
    calendar.push({ label: 'Submission deadline', date: t.deadline.toISOString(), kind: 'official' });
  }

  // Requirements found in the notice, compared with the profile.
  const text = `${t.title}\n${ml(raw['title-lot']).join('\n')}\n${t.description ?? ''}`;
  const ctext = companyText(company);
  const requirements: Requirement[] = REQUIREMENTS.filter((r) => r.re.test(text)).map((r) => ({
    key: r.key,
    label: r.label,
    evidence: snippet(text, r.re),
    covered: r.profile.test(ctext) ? true : null,
  }));

  // Buyer history, possible incumbent, likely bidders (and log the prediction).
  const brief = await competitorsForTender(tenderId, 8);
  const awardRaw = new Map<string, Raw | null>();
  const { notices } = await awardIndex();
  const similar = notices.filter((n) => cpvSim(t.cpv_codes, n.cpvCodes).strong >= 0.6);
  const ids = [...new Set([...similar.map((n) => n.id), ...(brief?.buyerHistory.recent.map((r) => r.tenderId) ?? [])])];
  if (ids.length) {
    const res = await pool.query<{ id: string; raw: Raw }>(
      `SELECT id, jsonb_build_object('received-submissions-type-code', raw->'received-submissions-type-code',
         'received-submissions-type-val', raw->'received-submissions-type-val') AS raw
       FROM tenders WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const r of res.rows) awardRaw.set(r.id, r.raw);
  }
  // Sole-winner values only: framework totals say little about one contract.
  const values = similar
    .filter((n) => n.winners.length === 1)
    .map((n) => n.winners[0].value ?? n.estimatedValue)
    .filter((v): v is number => !!v && v > 1);
  const bids = similar.map((n) => bidsReceived(awardRaw.get(n.id) ?? null)).filter((v): v is number => v != null && v > 0);
  const market: Dossier['market'] = {
    similarAwards: similar.length,
    valueN: values.length,
    valueMedian: median(values),
    valueP25: quantile(values, 0.25),
    valueP75: quantile(values, 0.75),
    bidsN: bids.length,
    bidsMedian: median(bids),
  };
  const prev = await findIncumbent({ id: t.id, title: t.title, buyerName: t.buyer_name, cpvCodes: t.cpv_codes });
  const incumbent: Dossier['incumbent'] =
    prev && prev.winners.length <= 3
      ? {
          name: prev.winners.map((w) => w.name).join(' + '),
          organisationId: prev.winners[0].orgId,
          basis:
            `Won "${prev.notice.title.slice(0, 90)}" from this buyer${prev.notice.date ? ` (${prev.notice.date})` : ''}` +
            `${prev.winners.length > 1 ? ' as co-winners' : ''}; ${prev.basis}`,
          url: prev.notice.url,
          confidence: 'possible',
        }
      : null;
  const incumbentKeys = new Set(incumbent ? prev!.winners.map((w) => aliasKey(w.name)) : []);
  const competitors = (brief?.competitors ?? []).slice(0, 5).map((c) => ({
    name: c.name,
    organisationId: c.organisationId,
    incumbent: incumbentKeys.has(aliasKey(c.name)),
    why: c.why,
    url: c.examples[0]?.url ?? null,
  }));
  if (brief) {
    await recordPredictions(
      tenderId,
      brief.competitors.map((c) => ({ organisationId: c.organisationId, name: c.name, incumbent: false })),
      {
        companyId: company.id,
        source: 'live',
        incumbents: incumbent ? prev!.winners.map((w) => ({ organisationId: w.orgId, name: w.name, incumbent: true })) : [],
      },
    );
  }

  // Admin checklist (standard French public-tender file; confirm against the RC).
  const checklist: Dossier['checklist'] = [
    { item: 'Download the consultation file (DCE) and read the RC, CCAP and CCTP', note: 'Link below when the notice provides it.' },
    { item: 'Candidate forms: DC1 + DC2, or the DUME' },
    { item: 'Acte d’engagement (ATTRI1), signed' },
    { item: 'URSSAF attestation de vigilance (less than 6 months old)' },
    { item: 'Kbis extract and tax certificate (attestation de régularité fiscale)' },
    { item: 'Professional liability insurance certificate' },
    { item: `Mémoire technique structured on the award criteria${criteria.length ? ` (${criteria.map((c) => `${c.name ?? c.type} ${c.weight ?? '?'}%`).join(', ')})` : ''}` },
    { item: 'Price schedule (BPU/DQE or DPGF), as required by the RC' },
    { item: '3–5 references similar in scope, with buyer contacts' },
  ];
  checklist.push({
    item: 'Environmental commitments section',
    note: environmental
      ? 'The notice includes an environmental criterion or clause.'
      : 'French contracts must include an environmental award criterion since August 2026, so expect one in the RC.',
  });
  if (value && value > 1_000_000 && /\b([1-4]?\d)\b/.test(company.size ?? '')) {
    checklist.push({ item: 'Consider a groupement (co-contracting) or subcontracting (DC4)', note: `Estimated value ${fmtEur(value)} is large for a ${company.size} firm.` });
  }

  const textSignal = match.rows[0]?.signals?.text;
  const recommendation = recommend({
    score: match.rows[0]?.score ?? null,
    keywordHit: typeof textSignal === 'number' ? textSignal > 0 : null,
    daysLeft, requirements, incumbent, value, learned: learnedRules, market });

  const dossier: Dossier = {
    version: 1,
    generatedAt: now.toISOString(),
    tender: {
      id: t.id,
      publicationNumber: t.publication_number,
      title: t.title,
      buyerName: t.buyer_name,
      url: t.url,
      procedureType: PROCEDURE[list(raw['procedure-type'])[0] ?? ''] ?? list(raw['procedure-type'])[0] ?? null,
      estimatedValue: value,
      deadline: t.deadline?.toISOString() ?? null,
      publicationDate: isoDate(t.publication_date),
      lots,
      daysLeft,
    },
    fit: {
      score: match.rows[0]?.score ?? null,
      rationale: match.rows[0]?.rationale ?? null,
      learned: learnedRules,
      signals: Object.fromEntries(
        Object.entries(match.rows[0]?.signals ?? { cpv: cpv.sim, region: regionOk }).flatMap(([k, v]) =>
          typeof v === 'number' ? [[k, v]] : typeof v === 'string' || typeof v === 'boolean' ? [[k, v ? 1 : 0]] : [],
        ),
      ),
    },
    calendar,
    criteria: {
      items: criteria,
      priceWeight,
      environmental,
      note: criteria.length
        ? 'From the TED notice (first lot). The RC may add sub-criteria.'
        : 'The notice does not list award criteria: they will be in the RC (règlement de la consultation).',
    },
    contract: {
      framework,
      duration: parseDuration(raw),
      renewals: renewalsRaw != null && renewalsRaw !== '' ? Number(renewalsRaw) : null,
      endDate,
    },
    documents: {
      dceUrl: list(raw['document-url-lot'])[0] ? decode(list(raw['document-url-lot'])[0]) : null,
      submissionUrl: list(raw['submission-url-lot'])[0] ? decode(list(raw['submission-url-lot'])[0]) : null,
    },
    requirements,
    buyerHistory: {
      awardNotices: brief?.buyerHistory.awardNotices ?? 0,
      recent: (brief?.buyerHistory.recent ?? []).map((r) => ({ ...r, bidsReceived: bidsReceived(awardRaw.get(r.tenderId) ?? null) })),
    },
    incumbent,
    competitors,
    market,
    checklist,
    questions: ruleQuestions({ criteria, incumbent, value, framework }),
    recommendation,
    memo: null,
    memoBy: 'rules',
    sources: [
      ...(t.url ? [{ label: `TED notice ${t.publication_number}`, url: t.url }] : []),
      ...(incumbent?.url ? [{ label: 'Previous similar award from this buyer', url: incumbent.url }] : []),
      ...(brief?.buyerHistory.recent ?? []).filter((r) => r.url).slice(0, 3).map((r) => ({ label: `Buyer award: ${r.title.slice(0, 60)}`, url: r.url! })),
    ],
  };

  await polish(company, dossier, text);
  return dossier;
}

function recommend(x: {
  score: number | null;
  /** Does the notice text mention the profile's keywords (null = unknown)? */
  keywordHit: boolean | null;
  daysLeft: number | null;
  requirements: Requirement[];
  incumbent: Dossier['incumbent'];
  value: number | null;
  learned: { delta: number; label: string }[];
  market: Dossier['market'];
}): Dossier['recommendation'] {
  const pros: string[] = [];
  const cons: string[] = [];
  if (x.score != null) (x.score >= 50 ? pros : x.score < 35 ? cons : pros).push(`Fit score ${Math.round(x.score)}/100${x.score < 35 ? ' is low' : ''}`);
  if (x.keywordHit === false) cons.push('The notice text mentions none of your services; the match rests on the CPV code only');
  const covered = x.requirements.filter((r) => r.covered);
  const unknown = x.requirements.filter((r) => r.covered == null);
  if (covered.length) pros.push(`Your profile covers ${covered.map((r) => r.label).join(', ')}`);
  if (unknown.length) cons.push(`Check you can evidence: ${unknown.map((r) => r.label).join(', ')}`);
  if (x.daysLeft != null && x.daysLeft < 0) cons.push('The deadline has passed');
  else if (x.daysLeft != null && x.daysLeft < 10) cons.push(`Only ${x.daysLeft} days left`);
  else if (x.daysLeft != null) pros.push(`${x.daysLeft} days to respond`);
  if (x.incumbent) cons.push(`${x.incumbent.name} won this buyer's last similar contract`);
  if (x.market.bidsMedian != null) pros.push(`Similar contracts typically drew ${x.market.bidsMedian} bids (n=${x.market.bidsN})`);
  for (const l of x.learned) (l.delta > 0 ? pros : cons).push(`Learned: ${l.label}`);
  const negativeLearned = x.learned.some((l) => l.delta <= -15);
  const verdict: Dossier['recommendation']['verdict'] =
    (x.daysLeft != null && x.daysLeft < 5) || (x.score != null && x.score < 30) || negativeLearned
      ? 'no-go'
      : x.score != null && x.score >= 55 && x.keywordHit !== false && (x.daysLeft == null || x.daysLeft >= 10) && unknown.length <= 1
        ? 'go'
        : 'consider';
  return { verdict, reasons: [...pros.map((p) => `+ ${p}`), ...cons.map((c) => `− ${c}`)] };
}

function ruleQuestions(x: { criteria: DossierCriterion[]; incumbent: Dossier['incumbent']; value: number | null; framework: string | null }) {
  const q: { fr: string; en: string }[] = [];
  if (!x.criteria.length || x.criteria.every((c) => c.weight == null))
    q.push({
      fr: 'Pourriez-vous préciser les critères de jugement des offres et leur pondération, y compris les éventuels sous-critères de la valeur technique ?',
      en: 'Ask for the award criteria, their weights and any technical sub-criteria.',
    });
  if (!x.value)
    q.push({
      fr: 'Pourriez-vous indiquer le montant estimatif ou maximum du marché, ainsi que les volumes prévisionnels ?',
      en: 'Ask for the estimated or maximum value and expected volumes.',
    });
  if (x.incumbent)
    q.push({
      fr: 'Le marché fait-il suite à un marché existant ? Si oui, quelles sont les modalités de réversibilité et de transfert de connaissances prévues avec le titulaire sortant ?',
      en: 'Ask whether this renews an existing contract and how handover from the outgoing supplier will work.',
    });
  if (x.framework)
    q.push({
      fr: 'Pouvez-vous préciser les modalités d’émission des bons de commande / marchés subséquents et le volume de commandes constaté sur le marché précédent ?',
      en: 'Ask how call-offs will be issued and what volume the previous contract actually used.',
    });
  return q.slice(0, 4);
}

let writer: Agent | null = null;

/** Claude memo + buyer questions from the dossier facts only; falls back to the rules version. */
async function polish(company: CompanyRow, d: Dossier, noticeText: string) {
  if (!hasModel()) return;
  writer ??= new Agent({
    id: 'dossier-writer',
    name: 'Pre-bid dossier writer',
    instructions:
      'You are a bid manager at a small French IT consultancy. From the JSON facts given (and only those), write:\n' +
      '1. "memo": a go/no-go memo in English, 4-6 short markdown bullets. The first bullet starts with the verdict from rulesVerdict.verdict in bold (**Go**, **Consider** or **No-go**); do not change it, explain it. Be concrete: name the buyer, the criteria weights, the previous supplier (who won the buyer’s last similar contract), the deadline, and the 1-2 strongest bid angles from the company profile. Never call the previous supplier the incumbent as a fact: our award data starts in 2025. Never invent numbers, references or certifications.\n' +
      '2. "questions": 2-4 clarification questions to send to the buyer, in formal French, each with a short English gloss. Ask about real gaps in the facts (missing weights, volumes, incumbent handover, hosting/security requirements).\n' +
      'Return ONLY JSON: {"memo": string, "questions": [{"fr": string, "en": string}]}',
    model: process.env.MODEL ?? 'anthropic/claude-sonnet-5',
  });
  const facts = {
    company: {
      name: company.name,
      size: company.size,
      services: company.services,
      differentiators: company.differentiators,
      regions: company.regions,
      pastWins: company.profile?.pastWins ?? [],
    },
    tender: d.tender,
    noticeExcerpt: noticeText.slice(0, 2500),
    fit: { score: d.fit.score, learned: d.fit.learned },
    criteria: d.criteria,
    contract: d.contract,
    requirements: d.requirements.map((r) => ({ label: r.label, coveredByProfile: r.covered })),
    incumbent: d.incumbent,
    likelyBidders: d.competitors.map((c) => ({ name: c.name, why: c.why })),
    market: d.market,
    rulesVerdict: d.recommendation,
  };
  try {
    const res = await Promise.race([
      writer.generate(JSON.stringify(facts)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 45_000)),
    ]);
    const parsed = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? 'null') as { memo?: unknown; questions?: unknown } | null;
    if (parsed && typeof parsed.memo === 'string' && parsed.memo.trim()) {
      d.memo = parsed.memo.trim();
      d.memoBy = 'model';
    }
    if (parsed && Array.isArray(parsed.questions)) {
      const qs = parsed.questions.filter(
        (q): q is { fr: string; en: string } => !!q && typeof q.fr === 'string' && typeof q.en === 'string',
      );
      if (qs.length) d.questions = qs.slice(0, 4);
    }
  } catch (err) {
    console.warn('dossier memo failed, keeping rules version:', (err as Error).message);
  }
}

// ---------- persistence ----------

export async function getDossier(companyId: string, tenderId: string) {
  const { rows } = await pool.query(
    `SELECT d.id, d.tender_id AS "tenderId", d.status, d.trigger, d.score, d.content, d.error, d.seen_at AS "seenAt",
       d.created_at AS "createdAt", d.updated_at AS "updatedAt", f.decision, f.reason
     FROM prebid_dossiers d LEFT JOIN tender_feedback f ON f.company_id = d.company_id AND f.tender_id = d.tender_id
     WHERE d.company_id = $1 AND d.tender_id = $2`,
    [companyId, tenderId],
  );
  return rows[0] ?? null;
}

/** Autopilot inbox: newest dossiers first, without the heavy content. */
export async function listDossiers(companyId: string, limit = 30) {
  const { rows } = await pool.query(
    `SELECT d.tender_id AS "tenderId", d.status, d.trigger, d.score, d.error, d.seen_at AS "seenAt",
       d.created_at AS "createdAt", d.updated_at AS "updatedAt",
       d.content->'recommendation'->>'verdict' AS verdict,
       d.content->'incumbent'->>'name' AS "lastSimilarWinner",
       jsonb_array_length(coalesce(d.content->'criteria'->'items', '[]'::jsonb)) AS criteria,
       t.title, t.buyer_name AS "buyerName", t.publication_number AS "publicationNumber", t.deadline,
       t.estimated_value::float8 AS "estimatedValue", f.decision, f.reason
     FROM prebid_dossiers d JOIN tenders t ON t.id = d.tender_id
     LEFT JOIN tender_feedback f ON f.company_id = d.company_id AND f.tender_id = d.tender_id
     WHERE d.company_id = $1
     -- Work in progress, then undecided Go / Consider / No-go, then decided; newest first within each.
     ORDER BY (d.status IN ('queued', 'running')) DESC, (f.decision IS NULL) DESC,
       CASE d.content->'recommendation'->>'verdict' WHEN 'go' THEN 0 WHEN 'consider' THEN 1 ELSE 2 END,
       d.created_at DESC
     LIMIT $2`,
    [companyId, limit],
  );
  return rows;
}

