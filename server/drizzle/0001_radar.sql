CREATE TABLE "past_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"buyer" text DEFAULT '' NOT NULL,
	"year" integer,
	"value" numeric,
	"outcome" text DEFAULT 'won' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"fresh" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "min_value" numeric;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "max_value" numeric;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "learned_rules" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "verdict" text DEFAULT 'maybe' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "risks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "effort" text;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "scored_by" text DEFAULT 'quick' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "scored_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "past_bids" ADD CONSTRAINT "past_bids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "past_bids_company_idx" ON "past_bids" USING btree ("company_id");