CREATE TABLE "consortia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"party_ref" text NOT NULL,
	"name" text,
	"won" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consortium_members" (
	"consortium_id" uuid NOT NULL,
	"org_ref" text NOT NULL,
	"organisation_id" uuid,
	"name" text NOT NULL,
	"leader" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "consortium_members_consortium_id_org_ref_pk" PRIMARY KEY("consortium_id","org_ref")
);
--> statement-breakpoint
CREATE TABLE "partner_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"company_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"organisation_id" uuid,
	"partner_name" text NOT NULL,
	"contact_email" text,
	"role" text NOT NULL,
	"need" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"fit_score" real,
	"signals" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "partner_responses" (
	"invite_id" uuid PRIMARY KEY NOT NULL,
	"interest" text NOT NULL,
	"role" text,
	"company_name" text,
	"siret" text,
	"contact_name" text,
	"contact_email" text,
	"website" text,
	"capabilities" text,
	"availability" text,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text,
	"score" real,
	"breakdown" jsonb,
	"claimed_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "siret" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "nuts" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "contact_source" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "parties_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consortia" ADD CONSTRAINT "consortia_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consortium_members" ADD CONSTRAINT "consortium_members_consortium_id_consortia_id_fk" FOREIGN KEY ("consortium_id") REFERENCES "public"."consortia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consortium_members" ADD CONSTRAINT "consortium_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_responses" ADD CONSTRAINT "partner_responses_invite_id_partner_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."partner_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_responses" ADD CONSTRAINT "partner_responses_claimed_company_id_companies_id_fk" FOREIGN KEY ("claimed_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consortia_tender_party_idx" ON "consortia" USING btree ("tender_id","party_ref");--> statement-breakpoint
CREATE INDEX "consortium_members_org_idx" ON "consortium_members" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "partner_invites_company_idx" ON "partner_invites" USING btree ("company_id","tender_id");--> statement-breakpoint
CREATE INDEX "partner_invites_org_idx" ON "partner_invites" USING btree ("organisation_id");