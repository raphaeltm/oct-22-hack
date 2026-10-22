import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// One company per user for now. user_id is the BetterAuth user id (no FK:
// BetterAuth owns its own tables).
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').unique(),
  name: text('name').notNull(),
  description: text('description'),
  services: text('services').array().notNull().default(sql`'{}'`),
  sectors: text('sectors').array().notNull().default(sql`'{}'`),
  regions: text('regions').array().notNull().default(sql`'{}'`),
  cpvCodes: text('cpv_codes').array().notNull().default(sql`'{}'`),
  size: text('size'),
  differentiators: text('differentiators').array().notNull().default(sql`'{}'`),
  // Free-form extras the agent learns (past wins, known competitors, ...).
  profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
  // Radar search terms (any language) and the contract size the firm can take on.
  keywords: text('keywords').array().notNull().default(sql`'{}'`),
  minValue: numeric('min_value', { mode: 'number' }),
  maxValue: numeric('max_value', { mode: 'number' }),
  // Preferences distilled from the team's go/no-go decisions; fed to the scorer.
  learnedRules: text('learned_rules').notNull().default(''),
  ...timestamps,
});

// The firm's track record: what it bid on before and how it went.
export const pastBids = pgTable(
  'past_bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    buyer: text('buyer').notNull().default(''),
    year: integer('year'),
    value: numeric('value', { mode: 'number' }),
    outcome: text('outcome').notNull().default('won'), // 'won' | 'lost'
    summary: text('summary').notNull().default(''),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('past_bids_company_idx').on(t.companyId)],
);

// One radar sweep of TED for a company.
export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  fetched: integer('fetched').notNull().default(0),
  fresh: integer('fresh').notNull().default(0),
  error: text('error'),
});

// TED notices: cn-standard (open tenders) and can-standard (awards).
// Text is mostly French; search uses the 'french' config.
export const tenders = pgTable(
  'tenders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationNumber: text('publication_number').notNull().unique(),
    noticeType: text('notice_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    buyerName: text('buyer_name'),
    buyerCountry: text('buyer_country'),
    cpvCodes: text('cpv_codes').array().notNull().default(sql`'{}'`),
    estimatedValue: numeric('estimated_value', { mode: 'number' }),
    currency: text('currency'),
    deadline: timestamp('deadline', { withTimezone: true }),
    publicationDate: timestamp('publication_date', { withTimezone: true }),
    url: text('url'),
    raw: jsonb('raw'),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('french', coalesce(title, '')), 'A') || setweight(to_tsvector('french', coalesce(buyer_name, '')), 'B') || setweight(to_tsvector('french', coalesce(description, '')), 'C')`,
    ),
    ...timestamps,
  },
  (t) => [
    index('tenders_search_idx').using('gin', t.search),
    index('tenders_cpv_idx').using('gin', t.cpvCodes),
    index('tenders_type_deadline_idx').on(t.noticeType, t.deadline),
    index('tenders_buyer_idx').on(t.buyerName),
  ],
);

// Normalised companies seen as winners (i.e. competitors).
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  normalisedName: text('normalised_name').notNull().unique(),
  country: text('country'),
  website: text('website'),
  summary: text('summary'),
  lastResearchedAt: timestamp('last_researched_at', { withTimezone: true }),
  ...timestamps,
});

// One row per winner per award notice (frameworks often have many winners).
export const awards = pgTable(
  'awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
    winnerName: text('winner_name').notNull(),
    winnerCountry: text('winner_country'),
    value: numeric('value', { mode: 'number' }),
    currency: text('currency'),
    awardDate: timestamp('award_date', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('awards_tender_idx').on(t.tenderId),
    index('awards_org_idx').on(t.organisationId),
  ],
);

export const researchNotes = pgTable(
  'research_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').references(() => tenders.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'ted' | 'keenable' | 'chat'
    content: text('content').notNull(),
    url: text('url'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('research_notes_org_idx').on(t.organisationId)],
);

export const tenderMatches = pgTable(
  'tender_matches',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    rationale: text('rationale'),
    verdict: text('verdict').notNull().default('maybe'), // 'go' | 'maybe' | 'no'
    headline: text('headline').notNull().default(''),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
    risks: jsonb('risks').$type<string[]>().notNull().default([]),
    effort: text('effort'),
    scoredBy: text('scored_by').notNull().default('quick'), // 'quick' heuristic or the model id
    brief: text('brief'),
    // The team's call, which the radar learns from.
    decision: text('decision'), // 'go' | 'no-go'
    decisionReason: text('decision_reason'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tenderId] })],
);

export type Company = typeof companies.$inferSelect;
export type Tender = typeof tenders.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type Award = typeof awards.$inferSelect;
