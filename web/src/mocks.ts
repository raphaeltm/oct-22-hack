// Sample data, used only for links to mock ids (was the stand-in for /api/matches and
// /api/tenders/:id/competitors). Buyers and winners are real French public
// bodies and IT firms, but awards, amounts and notes are invented for the demo.
import type {
  Award,
  CompetitorDetail,
  CompetitorSummary,
  Match,
  ResearchNote,
  Tender,
  TenderCompetitors,
} from './api';

const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const ted = (pn: string) => `https://ted.europa.eu/en/notice/-/detail/${pn}`;

type MockTender = Tender & { score?: number; rationale?: string };

const open: MockTender[] = [
  {
    id: 't-lyon-portail',
    publicationNumber: '612847-2026',
    noticeType: 'cn-standard',
    title: "Refonte du portail usagers de la Métropole de Lyon et accompagnement à la conception de services numériques accessibles (RGAA 4.1)",
    description:
      "La Métropole de Lyon engage la refonte de son portail usagers. Le marché comprend la recherche utilisateurs, la conception des parcours, le design d'interface conforme au Système de Design de l'État (DSFR), le développement sous Drupal 11 et l'accompagnement à la mise en conformité RGAA 4.1. Durée : 36 mois, reconductible une fois 12 mois.",
    buyerName: 'Métropole de Lyon',
    buyerCountry: 'FRA',
    cpvCodes: ['72413000', '72212000', '79415200'],
    estimatedValue: 850_000,
    currency: 'EUR',
    deadline: inDays(19),
    publicationDate: inDays(-12),
    url: ted('612847-2026'),
    score: 0.93,
    rationale:
      'Exact fit with your core offer (UX research + Drupal + RGAA), local buyer in Lyon, and the budget sits within your usual 300k–1M€ range.',
  },
  {
    id: 't-lyon-toodego',
    publicationNumber: '598311-2026',
    noticeType: 'cn-standard',
    title: "Prestations de design de services et de recherche utilisateurs pour la plateforme Toodego",
    description:
      "Accord-cadre mono-attributaire à bons de commande portant sur des prestations d'UX research, d'ateliers de co-conception avec les usagers et de prototypage pour les services en ligne de la plateforme Toodego.",
    buyerName: 'Métropole de Lyon',
    buyerCountry: 'FRA',
    cpvCodes: ['79415200', '72000000'],
    estimatedValue: 300_000,
    currency: 'EUR',
    deadline: inDays(8),
    publicationDate: inDays(-21),
    url: ted('598311-2026'),
    score: 0.88,
    rationale:
      'Pure service-design scope where your in-house researchers are a differentiator. Deadline is close: 8 days to respond.',
  },
  {
    id: 't-vendee-web',
    publicationNumber: '605529-2026',
    noticeType: 'cn-standard',
    title: "Accord-cadre de prestations de conception, de développement et de maintenance des sites internet et applications web du Département de la Vendée",
    description:
      "Le Département de la Vendée souhaite confier à un prestataire la conception, le développement, l'hébergement et la maintenance évolutive de ses sites internet (vendee.fr, sites thématiques) et applications métiers web. Lot unique.",
    buyerName: 'Département de la Vendée',
    buyerCountry: 'FRA',
    cpvCodes: ['72413000', '72267000', '72212000'],
    estimatedValue: 1_200_000,
    currency: 'EUR',
    deadline: inDays(26),
    publicationDate: inDays(-9),
    url: ted('605529-2026'),
    score: 0.84,
    rationale:
      'Strong technical fit (web + TMA) and Pays de la Loire is one of your regions. Hosting is in scope, which you would need to subcontract.',
  },
  {
    id: 't-arte-edu',
    publicationNumber: '617002-2026',
    noticeType: 'cn-standard',
    title: "Conception et réalisation d'expériences numériques interactives pour les programmes éducatifs d'ARTE Éducation",
    description:
      "ARTE France recherche une équipe pluridisciplinaire (design, développement front-end, accessibilité) pour concevoir des expériences interactives destinées aux enseignants et élèves, en français et en allemand.",
    buyerName: 'ARTE France',
    buyerCountry: 'FRA',
    cpvCodes: ['72212000', '92111000'],
    estimatedValue: 420_000,
    currency: 'EUR',
    deadline: inDays(33),
    publicationDate: inDays(-4),
    url: ted('617002-2026'),
    score: 0.78,
    rationale:
      'Culture & media is a target sector and the design-led scope suits you. German-language delivery is a gap to cover with a partner.',
  },
  {
    id: 't-cdc-a11y',
    publicationNumber: '601874-2026',
    noticeType: 'cn-standard',
    title: "Prestations d'audit et d'accompagnement à la mise en conformité de l'accessibilité numérique des sites et applications du Groupe Caisse des Dépôts",
    description:
      "Audits RGAA de conformité, audits de contrôle, formation des équipes et accompagnement des projets pour l'ensemble des services numériques du Groupe Caisse des Dépôts.",
    buyerName: 'Caisse des Dépôts',
    buyerCountry: 'FRA',
    cpvCodes: ['72000000', '80533100'],
    estimatedValue: 600_000,
    currency: 'EUR',
    deadline: inDays(14),
    publicationDate: inDays(-16),
    url: ted('601874-2026'),
    score: 0.73,
    rationale:
      'Accessibility audits are a core service, but the buyer usually favours larger firms (mc2i won the previous contract).',
  },
  {
    id: 't-brgm-infoterre',
    publicationNumber: '594460-2026',
    noticeType: 'cn-standard',
    title: "Développement et tierce maintenance applicative du portail de données géologiques InfoTerre",
    description:
      "Évolutions fonctionnelles et TMA du portail InfoTerre (Java, PostGIS, OpenLayers) et des services cartographiques associés. Engagement de niveau de service avec astreinte.",
    buyerName: 'BRGM',
    buyerCountry: 'FRA',
    cpvCodes: ['72267000', '72212000', '72319000'],
    estimatedValue: 1_800_000,
    currency: 'EUR',
    deadline: inDays(41),
    publicationDate: inDays(-2),
    url: ted('594460-2026'),
    score: 0.58,
    rationale:
      'TMA fits, but the Java/GIS stack and on-call SLA are outside your usual Drupal/Symfony work. Consider a consortium.',
  },
];

// Past award notices (can-standard) feeding the competitor views.
const past: Tender[] = [
  ['h1', '284113-2023', 'Métropole de Lyon', 'Tierce maintenance applicative des sites web de la Métropole de Lyon'],
  ['h2', '412907-2024', 'Métropole de Lyon', "Accompagnement à la transformation numérique des services aux usagers"],
  ['h3', '133280-2025', 'Métropole de Lyon', 'Audit et mise en accessibilité RGAA du site grandlyon.com'],
  ['h4', '356021-2023', 'Département de la Vendée', "Refonte du site vendee.fr et de l'intranet départemental"],
  ['h5', '220518-2025', 'Département de la Vendée', 'Maintenance des applications métiers web du Département'],
  ['h6', '301455-2024', 'ARTE France', "Développement des applications ARTE.tv sur supports connectés"],
  ['h7', '094372-2025', 'ARTE France', 'Prestations de conception UX/UI pour ARTE Éducation'],
  ['h8', '175640-2023', 'Caisse des Dépôts', "Audits d'accessibilité numérique du Groupe Caisse des Dépôts"],
  ['h9', '388210-2024', 'Caisse des Dépôts', 'Assistance à maîtrise d’ouvrage pour les projets digitaux'],
  ['h10', '260734-2024', 'BRGM', 'Tierce maintenance applicative du système d’information géologique'],
  ['h11', '051988-2026', 'BRGM', 'Développement de services web cartographiques pour les données ouvertes'],
].map(([id, pn, buyer, title]) => ({
  id,
  publicationNumber: pn,
  noticeType: 'can-standard',
  title,
  description: null,
  buyerName: buyer,
  buyerCountry: 'FRA',
  cpvCodes: ['72000000'],
  estimatedValue: null,
  currency: 'EUR',
  deadline: null,
  publicationDate: null,
  url: ted(pn),
}));

const orgs: Record<string, Omit<CompetitorSummary, 'wins' | 'buyers' | 'totalValue' | 'lastWin'>> = {
  'o-open': {
    id: 'o-open',
    name: 'OPEN',
    country: 'FRA',
    website: 'https://www.open.global',
    summary:
      'Large French digital services company (ESN) with a strong public-sector practice. Competes on scale, multi-year TMA contracts and broad framework agreements.',
  },
  'o-softeam': {
    id: 'o-softeam',
    name: 'SOFTEAM',
    country: 'FRA',
    website: 'https://www.softeam.fr',
    summary:
      'IT consulting and engineering group, part of Docaposte. Frequent winner of application development and maintenance lots for public agencies.',
  },
  'o-davidson': {
    id: 'o-davidson',
    name: 'Davidson Consulting',
    country: 'FRA',
    website: 'https://www.davidson.fr',
    summary:
      'Engineering and consulting firm with regional agencies, including Lyon. Positions on agile delivery teams and digital product engineering.',
  },
  'o-mc2i': {
    id: 'o-mc2i',
    name: 'mc2i',
    country: 'FRA',
    website: 'https://www.mc2i.fr',
    summary:
      'Digital transformation consultancy focused on project ownership support (AMOA) and accessibility compliance for large public and financial organisations.',
  },
  'o-klee': {
    id: 'o-klee',
    name: 'Klee Conseil Intégration',
    country: 'FRA',
    website: 'https://www.klee-group.com',
    summary:
      'Part of Klee Group. Builds and maintains business web applications and data portals, with references in research bodies and local government.',
  },
};

const awardRows: [string, string, number, string][] = [
  // tenderId, orgId, value, awardDate
  ['h1', 'o-open', 1_450_000, '2023-06-14'],
  ['h2', 'o-davidson', 640_000, '2024-09-03'],
  ['h3', 'o-mc2i', 185_000, '2025-03-21'],
  ['h3', 'o-davidson', 95_000, '2025-03-21'],
  ['h4', 'o-softeam', 780_000, '2023-11-08'],
  ['h5', 'o-open', 920_000, '2025-05-27'],
  ['h6', 'o-klee', 510_000, '2024-07-02'],
  ['h7', 'o-davidson', 230_000, '2025-02-11'],
  ['h8', 'o-mc2i', 410_000, '2023-04-19'],
  ['h9', 'o-mc2i', 870_000, '2024-10-30'],
  ['h9', 'o-softeam', 560_000, '2024-10-30'],
  ['h10', 'o-klee', 1_320_000, '2024-12-05'],
  ['h11', 'o-softeam', 375_000, '2026-01-22'],
  ['h11', 'o-klee', 290_000, '2026-01-22'],
];

const awards: Award[] = awardRows.map(([tenderId, orgId, value, date], i) => {
  const t = past.find((p) => p.id === tenderId)!;
  return {
    id: `a${i + 1}`,
    tenderId,
    organisationId: orgId,
    winnerName: orgs[orgId].name,
    winnerCountry: 'FRA',
    value,
    currency: 'EUR',
    awardDate: date,
    tender: { id: t.id, title: t.title, buyerName: t.buyerName, publicationNumber: t.publicationNumber, url: t.url },
  };
});

const notes: Record<string, ResearchNote[]> = {
  'o-open': [
    { id: 'n1', source: 'ted', content: 'Won 2 of the last 3 web TMA contracts with Lyon-area and Vendée buyers; bids are typically priced 10–15% under estimate.', url: ted('220518-2025'), createdAt: '2026-10-20T09:12:00Z' },
    { id: 'n2', source: 'web', content: 'Public-sector division announced a new delivery centre in Lyon in 2026, which makes them a closer local competitor.', url: 'https://www.open.global/actualites', createdAt: '2026-10-20T09:14:00Z' },
  ],
  'o-davidson': [
    { id: 'n3', source: 'web', content: 'Lyon agency of around 150 consultants. Recent case studies emphasise agile squads for local government digital services.', url: 'https://www.davidson.fr/agences/lyon', createdAt: '2026-10-19T15:40:00Z' },
    { id: 'n4', source: 'ted', content: 'Shared the 2025 Métropole de Lyon accessibility lot with mc2i, so they may team up again.', url: ted('133280-2025'), createdAt: '2026-10-19T15:42:00Z' },
  ],
  'o-mc2i': [
    { id: 'n5', source: 'ted', content: 'Incumbent on Caisse des Dépôts accessibility audits since 2023 and on the AMOA framework since 2024.', url: ted('388210-2024'), createdAt: '2026-10-18T11:05:00Z' },
  ],
};

function stats(orgId: string) {
  const own = awards.filter((a) => a.organisationId === orgId);
  return {
    wins: own.length,
    buyers: new Set(own.map((a) => a.tender?.buyerName)).size,
    totalValue: own.reduce((s, a) => s + (a.value ?? 0), 0),
    lastWin: own.map((a) => a.awardDate!).sort().at(-1) ?? null,
  };
}

export const matches: Match[] = open.map(({ score, rationale, ...tender }) => ({
  tender,
  score: Math.round((score ?? 0) * 100),
  rationale: rationale ?? null,
  status: 'open' as const,
}));

export function getTender(id: string) {
  const tender = [...matches.map((m) => m.tender), ...past].find((t) => t.id === id);
  return tender ? { tender, awards: awards.filter((a) => a.tenderId === id) } : null;
}

export function competitors(): CompetitorSummary[] {
  return Object.values(orgs)
    .map((o) => ({ ...o, ...stats(o.id) }))
    .sort((a, b) => b.wins - a.wins || b.totalValue - a.totalValue);
}

export function getCompetitor(id: string): CompetitorDetail | null {
  const o = orgs[id];
  if (!o) return null;
  return {
    ...o,
    ...stats(id),
    lastResearchedAt: notes[id]?.[0]?.createdAt ?? null,
    awards: awards.filter((a) => a.organisationId === id).sort((a, b) => b.awardDate!.localeCompare(a.awardDate!)),
    notes: notes[id] ?? [],
  };
}

export function tenderCompetitors(tenderId: string, buyerHint: string | null): TenderCompetitors {
  const buyer = getTender(tenderId)?.tender.buyerName ?? buyerHint;
  const buyerAwards = awards
    .filter((a) => a.tender?.buyerName === buyer)
    .sort((a, b) => b.awardDate!.localeCompare(a.awardDate!));
  const withBuyer = new Map<string, number>();
  for (const a of buyerAwards) withBuyer.set(a.organisationId!, (withBuyer.get(a.organisationId!) ?? 0) + 1);
  const ranked = competitors()
    .map((c) => ({
      ...c,
      winsWithBuyer: withBuyer.get(c.id) ?? 0,
      incumbent: (withBuyer.get(c.id) ?? 0) > 0,
      frameworkWins: 0,
      score: 0,
      why: null,
      aliases: [],
      examples: [],
    }))
    .sort((a, b) => b.winsWithBuyer - a.winsWithBuyer || b.wins - a.wins);
  // Buyer's past winners first, then the most active firms in the sector.
  return { competitors: ranked.slice(0, Math.max(3, withBuyer.size)), buyerAwards, notes: [] };
}
