// Fictional demo company for the hackathon demo (issue #12).
// Competitors are deliberately NOT seeded: they must come from real TED award data.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

export const rivageCompany = {
  name: 'Rivage Numérique',
  description:
    'Lyon-based digital services company (ESN) founded in 2015, building accessible, sovereign digital public services for French public bodies.',
  size: 'SME, ~40 staff',
  services: [
    'User research and service design',
    'Accessible web and mobile apps (RGAA compliance, DSFR)',
    'Cloud migration to sovereign hosting (OVHcloud, Scaleway, SecNumCloud-aware)',
    'Data dashboards and open data',
  ],
  sectors: [
    'Collectivités territoriales (métropoles, départements, régions)',
    'Public agencies',
    'Hospitals',
  ],
  regions: ['Auvergne-Rhône-Alpes', 'France'],
  cpvCodes: ['72000000', '72200000', '72413000', '72224000', '79411000'],
  // Radar search terms (TED full text is mostly French) and contract size.
  keywords: ['accessibilité RGAA', 'DSFR', 'site internet', 'application mobile', 'hébergement souverain', 'open data', 'tableau de bord'],
  minValue: 50000,
  maxValue: 1200000,
  differentiators: [
    'RGAA / accessibility expertise',
    'DSFR (French government design system) experience',
    'Open-source first',
    'Sovereign cloud',
    'Small senior team',
    'Fixed-price delivery',
  ],
  profile: {
    founded: 2015,
    headquarters: 'Lyon',
    headcount: 40,
    pastWins: [
      { title: 'Citizen-services portal redesign', buyer: 'A French métropole' },
      { title: 'Open-data dashboard', buyer: 'A French département' },
    ],
    painPoints: [
      'Only two people do business development',
      'Miss relevant tenders on BOAMP/TED',
      "Don't know who they're bidding against",
    ],
  } as Record<string, unknown>,
};

// Fictional track record for the radar (buyers kept generic on purpose).
export const rivagePastBids = [
  { title: 'Citizen-services portal redesign (RGAA AA, DSFR)', buyer: 'A French métropole', year: 2025, value: 380000, outcome: 'won', summary: 'Service design + accessible React/DSFR portal, 35 online procedures, hosted on OVHcloud.' },
  { title: 'Open-data dashboard', buyer: 'A French département', year: 2024, value: 140000, outcome: 'won', summary: 'Data pipeline and public dashboards on open-source stack; 3-year maintenance.' },
  { title: 'Accessibility audit framework (RGAA) for 40 websites', buyer: 'A French region', year: 2024, value: 220000, outcome: 'won', summary: 'Multi-year audit and remediation framework; renewed once.' },
  { title: 'Sovereign cloud migration of hospital apps', buyer: 'A university hospital', year: 2023, value: 610000, outcome: 'lost', summary: 'Lost on price to a larger integrator; technical score was second.' },
  { title: 'National ERP rollout', buyer: 'A national agency', year: 2023, value: 5200000, outcome: 'lost', summary: 'Lost: required 120+ consultants and an SAP partnership.' },
];

/** Upsert the Rivage Numérique profile for a user (replaces any existing profile). */
export async function seedCompany(userId: string) {
  const values = { ...rivageCompany, userId, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.companies)
    .values(values)
    .onConflictDoUpdate({ target: schema.companies.userId, set: values })
    .returning();
  await db.delete(schema.pastBids).where(eq(schema.pastBids.companyId, row.id));
  await db.insert(schema.pastBids).values(rivagePastBids.map((b) => ({ ...b, companyId: row.id })));
  return row;
}

export async function removeCompany(userId: string) {
  await db.delete(schema.companies).where(eq(schema.companies.userId, userId));
}
