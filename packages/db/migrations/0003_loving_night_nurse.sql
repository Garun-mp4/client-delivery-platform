CREATE TYPE "public"."client_company_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."client_membership_role" AS ENUM('primary', 'member');--> statement-breakpoint
CREATE TYPE "public"."project_membership_role" AS ENUM('owner', 'employee', 'client', 'observer');--> statement-breakpoint
CREATE TYPE "public"."project_membership_side" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'onboarding', 'in_progress', 'waiting_for_client', 'review', 'paused', 'completed', 'maintenance', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('website', 'landing', 'ecommerce', 'redesign', 'other');--> statement-breakpoint
CREATE TABLE "client_company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"website" text,
	"phone" text,
	"email" text,
	"messenger" text,
	"internal_notes" text,
	"status" "client_company_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invitation_context" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"role" "client_membership_role" DEFAULT 'member' NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"can_manage_members" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "client_membership_role" DEFAULT 'member' NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"can_manage_members" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_project_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" "project_membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"project_type" "project_type" NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"status_before_archive" "project_status",
	"owner_user_id" uuid NOT NULL,
	"planned_start_date" date NOT NULL,
	"planned_end_date" date NOT NULL,
	"client_access_mode" text DEFAULT 'explicit_grants' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"side" "project_membership_side" NOT NULL,
	"role" "project_membership_role" NOT NULL,
	"permissions" jsonb DEFAULT '{"version":1,"grants":[]}'::jsonb NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_company_id_workspace_unique" ON "client_company" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_id_workspace_unique" ON "project" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_id_workspace_unique" ON "invitation" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "client_company" ADD CONSTRAINT "client_company_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invitation_context" ADD CONSTRAINT "client_invitation_invitation_workspace_fk" FOREIGN KEY ("invitation_id","workspace_id") REFERENCES "public"."invitation"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invitation_context" ADD CONSTRAINT "client_invitation_company_workspace_fk" FOREIGN KEY ("client_company_id","workspace_id") REFERENCES "public"."client_company"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_membership" ADD CONSTRAINT "client_membership_company_workspace_fk" FOREIGN KEY ("client_company_id","workspace_id") REFERENCES "public"."client_company"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_membership" ADD CONSTRAINT "client_membership_workspace_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_project_grant" ADD CONSTRAINT "invitation_project_grant_invitation_workspace_fk" FOREIGN KEY ("invitation_id","workspace_id") REFERENCES "public"."invitation"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_project_grant" ADD CONSTRAINT "invitation_project_grant_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_company_workspace_fk" FOREIGN KEY ("client_company_id","workspace_id") REFERENCES "public"."client_company"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_workspace_membership_fk" FOREIGN KEY ("workspace_id","owner_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_workspace_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_company_workspace_status_idx" ON "client_company" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "client_company_workspace_updated_idx" ON "client_company" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "client_invitation_workspace_company_idx" ON "client_invitation_context" USING btree ("workspace_id","client_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_membership_company_user_unique" ON "client_membership" USING btree ("client_company_id","user_id");--> statement-breakpoint
CREATE INDEX "client_membership_workspace_user_idx" ON "client_membership" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_project_grant_invitation_project_unique" ON "invitation_project_grant" USING btree ("invitation_id","project_id");--> statement-breakpoint
CREATE INDEX "invitation_project_grant_project_idx" ON "invitation_project_grant" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspace_slug_unique" ON "project" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "project_workspace_status_idx" ON "project" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "project_company_status_idx" ON "project" USING btree ("client_company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_membership_project_user_unique" ON "project_membership" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_membership_workspace_user_idx" ON "project_membership" USING btree ("workspace_id","user_id");
