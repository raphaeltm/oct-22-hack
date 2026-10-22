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

/** Upsert the Rivage Numérique profile for a user (replaces any existing profile). */
export async function seedCompany(userId: string) {
  const values = { ...rivageCompany, userId, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.companies)
    .values(values)
    .onConflictDoUpdate({ target: schema.companies.userId, set: values })
    .returning();
  return row;
}

export async function removeCompany(userId: string) {
  await db.delete(schema.companies).where(eq(schema.companies.userId, userId));
}
