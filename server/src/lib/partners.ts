// Partner finder: who could co-bid (groupement / sous-traitance) with the
// company on one tender, from real TED evidence.
//
// 1. Gaps: capabilities the notice asks for that the company profile doesn't cover.
// 2. Candidates: firms whose past awards show those capabilities, preferring firms
//    that already bid in groupements (eForms tendering parties), know the buyer or
//    the region, and don't mostly sell what the company sells (complement, not rival).
// 3. Network: firms that answered invites on Procurement Radar rank higher.
//
// Scores are heuristics for ordering a shortlist, not probabilities.
import { pool } from '../db';
import type { CompanyRow } from '../mastra/tools/company';
import { awardIndex, type AwardNotice } from './competitors';
import { aliasKey, cpvSim, fold, isoDate, profileKeywords, regionHit, regionTerms, textSimilarity, distinctiveLexemes, type TextHit } from './text';

// ---------- capabilities ----------

export type Capability = {
  key: string;
  label: string;
  /** Matches the tender text (French). */
  re: RegExp;
  /** Matches the company profile (English or French). */
  profile: RegExp;
  /** French full-text query terms used to find award notices showing this capability. */
  terms: string[];
  cpv: string[];
};

export const CAPABILITIES: Capability[] = [
  { key: 'hosting', label: 'Hosting / infogérance', re: /h[ée]bergement|infog[ée]rance|exploitation des? (serveurs|infrastructures)|cloud/i, profile: /hosting|h[ée]bergement|infog[ée]rance|cloud|devops/i, terms: ['hébergement', 'infogérance', 'cloud'], cpv: ['72510000', '72514000', '72415000', '72317000'] },
  { key: 'security', label: 'Cybersecurity', re: /cybers[ée]curit|s[ée]curit[ée] des syst[eè]mes|pentest|tests? d.intrusion|audit de s[ée]curit|\bSOC\b|\bSSI\b/i, profile: /cyber|security|s[ée]curit|pentest|\bsoc\b/i, terms: ['cybersécurité', '"sécurité des systèmes d\'information"', '"tests d\'intrusion"'], cpv: ['72150000', '79417000'] },
  { key: 'tma', label: 'Application maintenance (TMA)', re: /\bTMA\b|maintenance applicative|tierce maintenance|maintien en conditions? op[ée]rationnelles?|\bMCO\b/i, profile: /\btma\b|maintenance|\bmco\b|run\b/i, terms: ['TMA', '"maintenance applicative"', '"tierce maintenance applicative"'], cpv: ['72267000', '72250000'] },
  { key: 'data', label: 'Data / BI', re: /d[ée]cisionnel|business intelligence|entrep[oô]t de donn[ée]es|data ?(viz|visualisation|lake|warehouse)|\bBI\b/i, profile: /\bdata\b|\bbi\b|dashboard|d[ée]cisionnel|analytics/i, terms: ['décisionnel', '"entrepôt de données"', '"business intelligence"', 'datavisualisation'], cpv: ['72300000', '72316000', '72322000'] },
  { key: 'gis', label: 'GIS / géomatique', re: /\bSIG\b|g[ée]omatique|cartograph|information g[ée]ographique/i, profile: /\bgis\b|\bsig\b|g[ée]omat|cartograph|mapping/i, terms: ['SIG', 'géomatique', 'cartographie'], cpv: ['72212422'] },
  { key: 'amoa', label: 'Project ownership support (AMOA)', re: /\bAMOA?\b|assistance [àa] ma[iî]trise d.ouvrage|sch[ée]ma directeur/i, profile: /\bamoa\b|project management|ma[iî]trise d.ouvrage|consult/i, terms: ['AMOA', '"assistance à maîtrise d\'ouvrage"', '"schéma directeur"'], cpv: ['72224000', '72221000', '79411000'] },
  { key: 'erp', label: 'ERP / software package integration', re: /progiciel|\bERP\b|\bSIRH\b|gestion financi[eè]re|int[ée]gration d.(une )?solution/i, profile: /\berp\b|progiciel|sirh|software package|integration/i, terms: ['progiciel', 'ERP', 'SIRH', '"gestion financière"'], cpv: ['48000000', '48400000', '48440000', '72263000'] },
  { key: 'change', label: 'Training / change management', re: /conduite du changement|accompagnement (au|du) changement|plan de formation|formation des (utilisateurs|agents)|ing[ée]nierie de formation/i, profile: /training|formation|change management|conduite du changement/i, terms: ['formation', '"conduite du changement"'], cpv: ['80500000', '80533000'] },
  { key: 'accessibility', label: 'Accessibility (RGAA)', re: /\bRGAA\b|accessibilit/i, profile: /rgaa|accessib/i, terms: ['RGAA', 'accessibilité'], cpv: [] },
  { key: 'ux', label: 'UX / service design', re: /\bUX\b|exp[ée]rience utilisateur|ergonomie|design de service|\bUI\b/i, profile: /\bux\b|user (research|experience)|service design|ergonom/i, terms: ['UX', '"expérience utilisateur"', 'ergonomie'], cpv: [] },
  { key: 'web', label: 'Web / portal development', re: /site (internet|web)|portail|\bCMS\b|refonte/i, profile: /\bweb\b|website|portal|portail|\bcms\b/i, terms: ['"site internet"', 'portail', 'refonte'], cpv: ['72413000', '72212000'] },
  { key: 'mobile', label: 'Mobile apps', re: /application mobile|\biOS\b|android/i, profile: /mobile/i, terms: ['"application mobile"'], cpv: [] },
  { key: 'network', label: 'Networks / telecom / infrastructure', re: /r[ée]seaux?\b|t[ée]l[ée]com|infrastructure|wifi|\bLAN\b/i, profile: /network|r[ée]seau|telecom|infrastructure/i, terms: ['réseau', 'télécommunications', 'infrastructure'], cpv: ['72700000', '72710000', '32400000'] },
  { key: 'ai', label: 'AI', re: /intelligence artificielle|\bIA\b|machine learning|\bLLM\b/i, profile: /\bai\b|artificial intelligence|intelligence artificielle|machine learning/i, terms: ['"intelligence artificielle"'], cpv: [] },
  { key: 'health', label: 'Health data hosting (HDS)', re: /\bHDS\b|donn[ée]es de sant[ée]/i, profile: /\bhds\b|health data/i, terms: ['HDS', '"données de santé"'], cpv: [] },
];

function companyText(c: CompanyRow) {
  return [c.description, ...c.services, ...c.differentiators, JSON.stringify(c.profile ?? {})].join(' ');
}

function snippet(text: string, re: RegExp, width = 60): string {
  const m = re.exec(text);
  if (!m) return '';
  const start = Math.max(0, m.index - width);
  const end = Math.min(text.length, m.index + m[0].length + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

export type Gap = { key: string; label: string; evidence: string };

/** Capabilities the tender asks for, split into what the company covers and what it lacks. */
export function tenderGaps(company: CompanyRow, text: string) {
  const ctext = companyText(company);
  const asked = CAPABILITIES.filter((c) => c.re.test(text));
  const gaps: Gap[] = [];
  const covered: string[] = [];
  for (const c of asked) {
    if (c.profile.test(ctext)) covered.push(c.label);
    else gaps.push({ key: c.key, label: c.label, evidence: snippet(text, c.re) });
  }
  return { gaps, covered };
}

// ---------- regions (NUTS 1 codes in eForms organisation addresses) ----------

const NUTS1: Record<string, string> = {
  FR1: 'Île-de-France', FRB: 'Centre-Val de Loire', FRC: 'Bourgogne-Franche-Comté', FRD: 'Normandie', FRE: 'Hauts-de-France',
  FRF: 'Grand Est', FRG: 'Pays de la Loire', FRH: 'Bretagne', FRI: 'Nouvelle-Aquitaine', FRJ: 'Occitanie',
  FRK: 'Auvergne-Rhône-Alpes', FRL: "Provence-Alpes-Côte d'Azur", FRM: 'Corse', FRY: 'Outre-mer',
};
export const nutsRegion = (nuts: string | null | undefined) => (nuts ? NUTS1[nuts.slice(0, 3).toUpperCase()] ?? null : null);

// ---------- network data ----------

type OrgMeta = { id: string; name: string; siret: string | null; city: string | null; nuts: string | null; contactEmail: string | null; contactSource: string | null; website: string | null };
type CoBid = { consortium: string | null; partners: string[]; leader: boolean; tenderId: string; title: string; buyer: string | null; date: string | null; publicationNumber: string; url: string | null };
type Network = { invites: number; responded: number; interested: number; medianHours: number | null; member: boolean };

async function loadOrgData(orgIds: string[], asOf?: string, excludeTenderIds: string[] = []) {
  const [meta, cobids, network] = await Promise.all([
    pool.query<OrgMeta>(
      `SELECT id, name, siret, city, nuts, contact_email AS "contactEmail", contact_source AS "contactSource", website
       FROM organisations WHERE id = ANY($1::uuid[])`,
      [orgIds],
    ),
    pool.query<{ organisation_id: string; consortium: string | null; partners: string[]; leader: number; tender_id: string; title: string; buyer: string | null; date: Date | null; publication_number: string; url: string | null }>(
      `SELECT m.organisation_id, c.name AS consortium, m.leader, t.id AS tender_id, t.title, t.buyer_name AS buyer,
         t.publication_date AS date, t.publication_number, t.url,
         ARRAY(SELECT o.name FROM consortium_members o WHERE o.consortium_id = c.id AND o.org_ref <> m.org_ref) AS partners
       FROM consortium_members m JOIN consortia c ON c.id = m.consortium_id JOIN tenders t ON t.id = c.tender_id
       WHERE m.organisation_id = ANY($1::uuid[]) AND ($2::date IS NULL OR t.publication_date < $2::date)
         AND NOT (t.id = ANY($3::uuid[]))
       ORDER BY t.publication_date DESC NULLS LAST`,
      [orgIds, asOf ?? null, excludeTenderIds],
    ),
    // Aggregate responsiveness across all companies' invites (counts only, never who invited).
    pool.query<{ organisation_id: string; invites: number; responded: number; interested: number; median_hours: number | null; member: boolean }>(
      `SELECT i.organisation_id, count(*) FILTER (WHERE i.sent_at IS NOT NULL)::int AS invites,
         count(r.invite_id)::int AS responded,
         count(r.invite_id) FILTER (WHERE r.interest IN ('yes', 'maybe'))::int AS interested,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.responded_at - coalesce(i.sent_at, i.created_at)) / 3600)
           FILTER (WHERE i.responded_at IS NOT NULL) AS median_hours,
         bool_or(r.claimed_company_id IS NOT NULL) AS member
       FROM partner_invites i LEFT JOIN partner_responses r ON r.invite_id = i.id
       WHERE i.organisation_id = ANY($1::uuid[])
       GROUP BY i.organisation_id`,
      [orgIds],
    ),
  ]);
  const cob = new Map<string, CoBid[]>();
  for (const r of cobids.rows) {
    const list = cob.get(r.organisation_id) ?? [];
    list.push({
      consortium: r.consortium, partners: r.partners, leader: r.leader === 1, tenderId: r.tender_id, title: r.title,
      buyer: r.buyer, date: isoDate(r.date), publicationNumber: r.publication_number, url: r.url,
    });
    cob.set(r.organisation_id, list);
  }
  return {
    meta: new Map(meta.rows.map((m) => [m.id, m])),
    cobids: cob,
    network: new Map<string, Network>(network.rows.map((n) => [n.organisation_id, {
      invites: n.invites, responded: n.responded, interested: n.interested,
      medianHours: n.median_hours == null ? null : Math.round(n.median_hours), member: n.member,
    }])),
  };
}

// ---------- ranking ----------

export type PartnerEvidence = { tenderId: string; publicationNumber: string; title: string; buyer: string | null; date: string | null; url: string | null; capability: string | null };

export type PartnerCandidate = {
  organisationId: string;
  name: string;
  score: number;
  role: 'cotraitant' | 'sous-traitant' | 'mandataire';
  roleNote: string;
  covers: string[];
  why: string;
  signals: { capability: number; similarity: number; coBids: number; buyer: number; region: number; network: number; overlap: number };
  evidence: PartnerEvidence[];
  coBids: CoBid[];
  sameBuyerWins: number;
  wins: number;
  distinctBuyers: number;
  large: boolean;
  city: string | null;
  region: string | null;
  siret: string | null;
  contactEmail: string | null;
  contactSource: string | null;
  website: string | null;
  network: Network | null;
};

const recency = (d: string | null, now = Date.now()) => 0.6 + 0.4 * Math.exp(-(d ? Math.max(0, (now - Date.parse(d)) / 86_400_000) : 730) / 365);

/**
 * Ranked co-bidding partners for one tender. `asOf` (YYYY-MM-DD) only uses award
 * notices and joint bids dated before it, and ignores Radar network signals;
 * `excludeTenderIds` hides notices from the same procedure (backtesting).
 */
export async function partnersForTender(
  company: CompanyRow,
  tenderIdOrPub: string,
  limit = 8,
  opts: { asOf?: string; excludeTenderIds?: string[] } = {},
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenderIdOrPub);
  const { rows } = await pool.query<{
    id: string; publication_number: string; title: string; description: string | null; buyer_name: string | null;
    cpv_codes: string[]; deadline: Date | null; url: string | null; notice_type: string; raw: Record<string, unknown> | null;
  }>(
    `SELECT id, publication_number, title, description, buyer_name, cpv_codes, deadline, url, notice_type,
       jsonb_build_object('title-lot', raw->'title-lot') AS raw
     FROM tenders WHERE ${uuid ? 'id = $1::uuid' : 'publication_number = $1'}`,
    [tenderIdOrPub],
  );
  const t = rows[0];
  if (!t) return null;
  const lotTitles = Object.values((t.raw?.['title-lot'] as Record<string, unknown>) ?? {}).flat().filter((s) => typeof s === 'string');
  const text = `${t.title}\n${lotTitles.join('\n')}\n${t.description ?? ''}`;
  const { gaps, covered } = tenderGaps(company, text);
  const gapCaps = CAPABILITIES.filter((c) => gaps.some((g) => g.key === c.key));

  const index = await awardIndex();
  const hidden = new Set(opts.excludeTenderIds ?? []);
  const notices = index.notices.filter((n) => !hidden.has(n.id) && (!opts.asOf || (n.date && n.date < opts.asOf)));
  const now = opts.asOf ? Date.parse(opts.asOf) : Date.now();
  const byId = new Map(notices.map((n) => [n.id, n]));
  const can = `t.notice_type = 'can-standard'`;
  const [similar, own, ...capHits] = await Promise.all([
    distinctiveLexemes(`${t.title} ${t.title} ${(t.description ?? '').slice(0, 600)}`).then((lex) =>
      textSimilarity(lex, 'lexeme', can, { minMatched: 2, saturate: 4 }),
    ),
    textSimilarity(profileKeywords(company), 'websearch', can, { minMatched: 1, saturate: 3, limit: 1500 }),
    ...gapCaps.map((c) => textSimilarity(c.terms, 'websearch', can, { minMatched: 1, saturate: 1, limit: 600 })),
  ]);

  // Per organisation (grouped by alias key): capability evidence, similar work, overlap with the company.
  type Acc = {
    orgIds: Map<string, number>; name: string; cap: Map<string, number>; sim: number; overlapHits: number; wins: Set<string>;
    buyers: Set<string>; sameBuyer: number; evidence: (PartnerEvidence & { w: number })[];
  };
  const self = aliasKey(company.name);
  const bk = fold(t.buyer_name);
  const acc = new Map<string, Acc>();
  const add = (n: AwardNotice, f: (a: Acc, share: number) => void) => {
    const share = 1 / Math.sqrt(Math.max(1, n.winners.length));
    for (const w of n.winners) {
      if (!w.orgId) continue;
      const key = aliasKey(w.name);
      if (key === self) continue;
      let a = acc.get(key);
      if (!a) {
        a = { orgIds: new Map(), name: w.name, cap: new Map(), sim: 0, overlapHits: 0, wins: new Set(), buyers: new Set(), sameBuyer: 0, evidence: [] };
        acc.set(key, a);
      }
      a.orgIds.set(w.orgId, (a.orgIds.get(w.orgId) ?? 0) + 1);
      f(a, share);
    }
  };
  // Track record (all wins) for size, buyers and overlap.
  for (const n of notices) {
    if (n.id === t.id) continue;
    const ownHit = own.get(n.id)?.sim ?? 0;
    const strongOwn = cpvSim(company.cpvCodes, n.cpvCodes).strong >= 0.8;
    add(n, (a) => {
      a.wins.add(n.id);
      a.buyers.add(n.buyerKey);
      if (n.buyerKey === bk) a.sameBuyer++;
      if (ownHit >= 0.5 || strongOwn) a.overlapHits++;
    });
  }
  const ev = (n: AwardNotice, capability: string | null, w: number): PartnerEvidence & { w: number } => ({
    tenderId: n.id, publicationNumber: n.publicationNumber, title: n.title, buyer: n.buyerName, date: n.date, url: n.url, capability, w,
  });
  gapCaps.forEach((c, i) => {
    const hits = capHits[i] as Map<string, TextHit>;
    for (const n of notices) {
      const textHit = hits.get(n.id)?.sim ?? 0;
      const cpvHit = c.cpv.length ? cpvSim(c.cpv, n.cpvCodes).strong : 0;
      const s = Math.max(textHit, cpvHit);
      if (s < 0.3) continue;
      add(n, (a, share) => {
        const w = s * share * recency(n.date, now);
        a.cap.set(c.key, (a.cap.get(c.key) ?? 0) + w);
        a.evidence.push(ev(n, c.label, w));
      });
    }
  });
  for (const [id, hit] of similar) {
    const n = byId.get(id);
    if (!n || n.id === t.id) continue;
    add(n, (a, share) => {
      a.sim += hit.sim * share * recency(n.date, now);
      a.evidence.push(ev(n, null, hit.sim * share * 0.5));
    });
  }

  // Keep firms with some relevant evidence, then load SIRET/location/co-bids/network for the best.
  const pre = [...acc.values()]
    .map((a) => {
      const capability = gapCaps.length ? [...a.cap.values()].reduce((s, v) => s + Math.min(1, v), 0) / gapCaps.length : 0;
      return { a, capability, similarity: Math.min(1, a.sim / 1.5) };
    })
    .filter((x) => x.capability > 0 || x.similarity > 0.15)
    .sort((x, y) => y.capability + y.similarity - (x.capability + x.similarity))
    .slice(0, 80);
  const primaryId = (a: Acc) => [...a.orgIds.entries()].sort((x, y) => y[1] - x[1])[0][0];
  const allIds = pre.flatMap((x) => [...x.a.orgIds.keys()]);
  const data = await loadOrgData(allIds, opts.asOf, [...hidden]);
  const terms = regionTerms(company.regions);
  const smallCompany = !/\b(large|ETI|grand groupe|enterprise)\b/i.test(company.size ?? '');

  const out: PartnerCandidate[] = pre.map(({ a, capability, similarity }) => {
    const ids = [...a.orgIds.keys()];
    const id = primaryId(a);
    // One organisation row for SIRET + address, so city and region stay consistent.
    const meta = ids.map((i) => data.meta.get(i)).find((m) => m?.city) ?? data.meta.get(id);
    const coBids = ids.flatMap((i) => data.cobids.get(i) ?? []);
    const net = opts.asOf ? null : ids.map((i) => data.network.get(i)).find(Boolean) ?? null;
    const region = nutsRegion(meta?.nuts);
    const regionOk = !!regionHit(terms, region, meta?.city);
    const overlap = a.wins.size ? a.overlapHits / a.wins.size : 0;
    const large = a.buyers.size >= 15;
    const coBidScore = Math.min(1, coBids.length / 2);
    const netScore = net ? (net.member ? 1 : 0) * 0.5 + (net.invites ? 0.5 * (net.interested / net.invites) : 0) : 0;
    const base = gapCaps.length
      ? 50 * capability + 12 * similarity + 15 * coBidScore + 8 * Math.min(1, a.sameBuyer) + 7 * (regionOk ? 1 : 0) + 8 * netScore
      : 45 * similarity + 25 * coBidScore + 10 * Math.min(1, a.sameBuyer) + 10 * (regionOk ? 1 : 0) + 10 * netScore;
    // With gaps to fill, firms that mostly win what the company sells are rivals, not
    // complements. Capacity partners do similar work by definition, so no penalty
    // there (the partner backtest showed it pushed real co-bidders out of the list).
    // A large integrator rarely joins a small firm's bid as a co-contractor.
    const sizeFactor = large && smallCompany ? 0.6 : 1;
    const overlapFactor = gapCaps.length ? 1 - 0.45 * overlap : 1;
    const score = Math.round(Math.min(100, base * overlapFactor * sizeFactor));
    const covers = gapCaps.filter((c) => (a.cap.get(c.key) ?? 0) > 0).map((c) => c.label);
    const role: PartnerCandidate['role'] = large ? 'mandataire' : covers.length && capability < 0.4 ? 'sous-traitant' : 'cotraitant';
    const roleNote =
      role === 'mandataire'
        ? `Large firm (${a.buyers.size} buyers): more likely to lead the groupement, with you as co-contractor or subcontractor.`
        : role === 'sous-traitant'
          ? 'Narrow overlap with the gap: a subcontract for that part is probably enough.'
          : 'Comparable firm that covers a gap: a joint bid (groupement momentané) with you as mandataire.';
    const evidence = [...new Map(a.evidence.sort((x, y) => y.w - x.w).map((e) => [e.tenderId, e])).values()]
      .slice(0, 4)
      .map(({ w: _w, ...e }) => e);
    const why = [
      covers.length ? `covers ${covers.join(', ')}` : similarity > 0.15 ? 'won similar contracts' : null,
      coBids.length ? `${coBids.length} joint bid${coBids.length > 1 ? 's' : ''} on TED${coBids.some((c) => c.leader) ? ' (led at least one)' : ''}` : null,
      a.sameBuyer ? `${a.sameBuyer} win(s) with this buyer` : null,
      regionOk ? `based in ${titleCase(meta?.city) ?? region} (your region)` : null,
      overlap >= 0.5 ? `${Math.round(overlap * 100)}% of their wins overlap your own offer` : null,
      net?.responded ? `answered ${net.responded}/${net.invites} invites on Radar` : null,
    ]
      .filter(Boolean)
      .join('; ');
    return {
      organisationId: id,
      name: data.meta.get(id)?.name ?? a.name,
      score,
      role,
      roleNote,
      covers,
      why,
      signals: {
        capability: round2(capability), similarity: round2(similarity), coBids: coBids.length, buyer: a.sameBuyer,
        region: regionOk ? 1 : 0, network: round2(netScore), overlap: round2(overlap),
      },
      evidence,
      coBids: coBids.slice(0, 3),
      sameBuyerWins: a.sameBuyer,
      wins: a.wins.size,
      distinctBuyers: a.buyers.size,
      large,
      city: titleCase(meta?.city),
      region,
      siret: meta?.siret ?? null,
      contactEmail: ids.map((i) => data.meta.get(i)?.contactEmail).find(Boolean) ?? null,
      contactSource: ids.map((i) => data.meta.get(i)).find((m) => m?.contactEmail)?.contactSource ?? null,
      website: ids.map((i) => data.meta.get(i)?.website).find(Boolean) ?? null,
      network: net,
    };
  });
  out.sort((x, y) => y.score - x.score);

  return {
    tender: { id: t.id, publicationNumber: t.publication_number, title: t.title, buyerName: t.buyer_name, deadline: isoDate(t.deadline), url: t.url, noticeType: t.notice_type },
    gaps,
    covered,
    mode: gapCaps.length ? ('gap' as const) : ('capacity' as const),
    partners: out.slice(0, limit),
    notes: [
      gapCaps.length
        ? 'Gaps are capabilities the notice mentions that your profile does not. Partners are ranked on TED award evidence for those gaps.'
        : 'Your profile covers everything this notice mentions, so partners are ranked as capacity partners (similar work, proven joint bidders).',
      'Joint bids come from eForms tendering parties (groupements) on French IT award notices since 2025. A past award is evidence, not proof of current capacity or interest.',
      'Fit scores are heuristics for ordering a shortlist, not probabilities.',
    ],
  };
}

const titleCase = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : null;
const round2 = (n: number) => Math.round(n * 100) / 100;
