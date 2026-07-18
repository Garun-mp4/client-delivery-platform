CREATE TYPE "public"."comment_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."feedback_classification" AS ENUM('in_scope', 'potential_change');--> statement-breakpoint
CREATE TYPE "public"."feedback_priority" AS ENUM('low', 'normal', 'high', 'blocking');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'accepted', 'clarification', 'in_progress', 'fixed', 'awaiting_verification', 'closed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feedback_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."project_update_importance" AS ENUM('normal', 'important');--> statement-breakpoint
CREATE TYPE "public"."project_update_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."site_access_mode" AS ENUM('public', 'password');--> statement-breakpoint
CREATE TYPE "public"."site_embed_status" AS ENUM('unknown', 'allowed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."site_environment_type" AS ENUM('prototype', 'design', 'preview', 'staging', 'production', 'archived');--> statement-breakpoint
CREATE TYPE "public"."url_availability_status" AS ENUM('pending', 'reachable', 'unreachable');--> statement-breakpoint
CREATE TYPE "public"."url_security_status" AS ENUM('pending', 'checking', 'safe', 'unsafe', 'error');--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"feedback_item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" "comment_visibility" DEFAULT 'client' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_body_or_tombstone_check" CHECK ("comment"."deleted_at" IS NOT NULL OR nullif(btrim("comment"."body"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "feedback_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"priority" "feedback_priority" DEFAULT 'normal' NOT NULL,
	"visibility" "feedback_visibility" DEFAULT 'client' NOT NULL,
	"classification" "feedback_classification" DEFAULT 'in_scope' NOT NULL,
	"page_url" text,
	"screenshot_file_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"assigned_to_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_title_nonempty_check" CHECK (nullif(btrim("feedback_item"."title"), '') IS NOT NULL),
	CONSTRAINT "feedback_body_nonempty_check" CHECK (nullif(btrim("feedback_item"."body"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "project_update" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"visibility" "project_update_visibility" DEFAULT 'client' NOT NULL,
	"importance" "project_update_importance" DEFAULT 'normal' NOT NULL,
	"pinned_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_update_title_nonempty_check" CHECK (nullif(btrim("project_update"."title"), '') IS NOT NULL),
	CONSTRAINT "project_update_body_nonempty_check" CHECK (nullif(btrim("project_update"."body"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "site_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_id" uuid,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"change_log" text NOT NULL,
	"check_instructions" text NOT NULL,
	"url" text NOT NULL,
	"environment_type" "site_environment_type" NOT NULL,
	"commit_sha" text,
	"deployment_external_id" text,
	"access_mode" "site_access_mode" DEFAULT 'public' NOT NULL,
	"access_secret_encrypted" text,
	"security_status" "url_security_status" DEFAULT 'pending' NOT NULL,
	"availability_status" "url_availability_status" DEFAULT 'pending' NOT NULL,
	"embed_status" "site_embed_status" DEFAULT 'unknown' NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"check_attempts" integer DEFAULT 0 NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_version_positive_number_check" CHECK ("site_version"."version_number" > 0),
	CONSTRAINT "site_version_name_nonempty_check" CHECK (nullif(btrim("site_version"."name"), '') IS NOT NULL),
	CONSTRAINT "site_version_url_nonempty_check" CHECK (nullif(btrim("site_version"."url"), '') IS NOT NULL),
	CONSTRAINT "site_version_access_secret_check" CHECK (("site_version"."access_mode" = 'public' AND "site_version"."access_secret_encrypted" IS NULL) OR ("site_version"."access_mode" = 'password' AND "site_version"."access_secret_encrypted" IS NOT NULL)),
	CONSTRAINT "site_version_publication_check" CHECK ("site_version"."client_visible" = false OR ("site_version"."security_status" = 'safe' AND "site_version"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "site_version_check_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_version_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"security_status" "url_security_status" NOT NULL,
	"availability_status" "url_availability_status" NOT NULL,
	"result_code" text NOT NULL,
	"final_url_origin" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_version_attempt_positive_check" CHECK ("site_version_check_attempt"."attempt" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_id_project_workspace_unique" ON "feedback_item" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_version_id_project_workspace_unique" ON "site_version" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_feedback_project_workspace_fk" FOREIGN KEY ("feedback_item_id","project_id","workspace_id") REFERENCES "public"."feedback_item"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_workspace_fk" FOREIGN KEY ("workspace_id","author_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_version_project_workspace_fk" FOREIGN KEY ("site_version_id","project_id","workspace_id") REFERENCES "public"."site_version"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_screenshot_project_workspace_fk" FOREIGN KEY ("screenshot_file_id","project_id","workspace_id") REFERENCES "public"."file_object"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_author_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_assignee_workspace_fk" FOREIGN KEY ("workspace_id","assigned_to_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_stage_project_workspace_fk" FOREIGN KEY ("stage_id","project_id","workspace_id") REFERENCES "public"."project_stage"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_author_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_version" ADD CONSTRAINT "site_version_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_version" ADD CONSTRAINT "site_version_stage_project_workspace_fk" FOREIGN KEY ("stage_id","project_id","workspace_id") REFERENCES "public"."project_stage"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_version" ADD CONSTRAINT "site_version_publisher_workspace_fk" FOREIGN KEY ("workspace_id","published_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_version_check_attempt" ADD CONSTRAINT "site_version_attempt_version_project_workspace_fk" FOREIGN KEY ("site_version_id","project_id","workspace_id") REFERENCES "public"."site_version"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_feedback_created_idx" ON "comment" USING btree ("feedback_item_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_version_status_idx" ON "feedback_item" USING btree ("site_version_id","status");--> statement-breakpoint
CREATE INDEX "feedback_project_status_updated_idx" ON "feedback_item" USING btree ("project_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_update_id_project_workspace_unique" ON "project_update" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE INDEX "project_update_project_visibility_published_idx" ON "project_update" USING btree ("project_id","visibility","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_version_project_number_unique" ON "site_version" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "site_version_check_queue_idx" ON "site_version" USING btree ("security_status","next_check_at");--> statement-breakpoint
CREATE INDEX "site_version_project_visibility_idx" ON "site_version" USING btree ("project_id","client_visible","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "site_version_attempt_unique" ON "site_version_check_attempt" USING btree ("site_version_id","attempt");--> statement-breakpoint
CREATE INDEX "site_version_attempt_project_checked_idx" ON "site_version_check_attempt" USING btree ("project_id","checked_at");
