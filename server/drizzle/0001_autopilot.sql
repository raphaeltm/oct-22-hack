CREATE TABLE "prebid_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'autopilot' NOT NULL,
	"score" real,
	"content" jsonb,
	"error" text,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"tender_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"organisation_id" uuid,
	"name" text NOT NULL,
	"alias_key" text NOT NULL,
	"rank" integer NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"award_tender_id" uuid,
	"graded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_feedback" (
	"company_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"note" text,
	"signals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tender_feedback_company_id_tender_id_pk" PRIMARY KEY("company_id","tender_id")
);
--> statement-breakpoint
ALTER TABLE "tender_matches" ADD COLUMN "signals" jsonb;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "procedure_id" text;--> statement-breakpoint
ALTER TABLE "prebid_dossiers" ADD CONSTRAINT "prebid_dossiers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prebid_dossiers" ADD CONSTRAINT "prebid_dossiers_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_award_tender_id_tenders_id_fk" FOREIGN KEY ("award_tender_id") REFERENCES "public"."tenders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_feedback" ADD CONSTRAINT "tender_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_feedback" ADD CONSTRAINT "tender_feedback_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prebid_dossiers_company_tender_idx" ON "prebid_dossiers" USING btree ("company_id","tender_id");--> statement-breakpoint
CREATE INDEX "predictions_tender_idx" ON "predictions" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "predictions_outcome_idx" ON "predictions" USING btree ("source","outcome");--> statement-breakpoint
CREATE INDEX "tenders_procedure_idx" ON "tenders" USING btree ("procedure_id");