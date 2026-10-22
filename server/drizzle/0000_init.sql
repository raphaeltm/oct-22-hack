CREATE TABLE "awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"organisation_id" uuid,
	"winner_name" text NOT NULL,
	"winner_country" text,
	"value" numeric,
	"currency" text,
	"award_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text,
	"services" text[] DEFAULT '{}' NOT NULL,
	"sectors" text[] DEFAULT '{}' NOT NULL,
	"regions" text[] DEFAULT '{}' NOT NULL,
	"cpv_codes" text[] DEFAULT '{}' NOT NULL,
	"size" text,
	"differentiators" text[] DEFAULT '{}' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalised_name" text NOT NULL,
	"country" text,
	"website" text,
	"summary" text,
	"last_researched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_normalised_name_unique" UNIQUE("normalised_name")
);
--> statement-breakpoint
CREATE TABLE "research_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"organisation_id" uuid,
	"tender_id" uuid,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_matches" (
	"company_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"score" real NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tender_matches_company_id_tender_id_pk" PRIMARY KEY("company_id","tender_id")
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_number" text NOT NULL,
	"notice_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"buyer_name" text,
	"buyer_country" text,
	"cpv_codes" text[] DEFAULT '{}' NOT NULL,
	"estimated_value" numeric,
	"currency" text,
	"deadline" timestamp with time zone,
	"publication_date" timestamp with time zone,
	"url" text,
	"raw" jsonb,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('french', coalesce(title, '')), 'A') || setweight(to_tsvector('french', coalesce(buyer_name, '')), 'B') || setweight(to_tsvector('french', coalesce(description, '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenders_publication_number_unique" UNIQUE("publication_number")
);
--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "awards_tender_idx" ON "awards" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "awards_org_idx" ON "awards" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "research_notes_org_idx" ON "research_notes" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "tenders_search_idx" ON "tenders" USING gin ("search");--> statement-breakpoint
CREATE INDEX "tenders_cpv_idx" ON "tenders" USING gin ("cpv_codes");--> statement-breakpoint
CREATE INDEX "tenders_type_deadline_idx" ON "tenders" USING btree ("notice_type","deadline");--> statement-breakpoint
CREATE INDEX "tenders_buyer_idx" ON "tenders" USING btree ("buyer_name");