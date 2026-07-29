CREATE TYPE "public"."project_cover_capture_status" AS ENUM('pending', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."project_cover_kind" AS ENUM('manual', 'automatic');--> statement-breakpoint
CREATE TABLE "project_cover_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "project_cover_kind" NOT NULL,
	"file_object_id" uuid NOT NULL,
	"source_site_version_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_cover_asset_source_check" CHECK (("project_cover_asset"."kind" = 'manual' AND "project_cover_asset"."source_site_version_id" IS NULL) OR ("project_cover_asset"."kind" = 'automatic' AND "project_cover_asset"."source_site_version_id" IS NOT NULL)),
	CONSTRAINT "project_cover_asset_current_check" CHECK (("project_cover_asset"."is_current" = true AND "project_cover_asset"."superseded_at" IS NULL) OR "project_cover_asset"."is_current" = false)
);
--> statement-breakpoint
CREATE TABLE "project_cover_capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"result_asset_id" uuid,
	"status" "project_cover_capture_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_cover_capture_attempts_check" CHECK ("project_cover_capture"."attempts" >= 0),
	CONSTRAINT "project_cover_capture_completion_check" CHECK (("project_cover_capture"."status" = 'succeeded' AND "project_cover_capture"."result_asset_id" IS NOT NULL AND "project_cover_capture"."completed_at" IS NOT NULL AND "project_cover_capture"."failure_code" IS NULL) OR ("project_cover_capture"."status" = 'failed' AND "project_cover_capture"."result_asset_id" IS NULL AND "project_cover_capture"."completed_at" IS NOT NULL AND "project_cover_capture"."failure_code" IS NOT NULL) OR ("project_cover_capture"."status" IN ('pending', 'processing') AND "project_cover_capture"."result_asset_id" IS NULL AND "project_cover_capture"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "project_cover_asset" ADD CONSTRAINT "project_cover_asset_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_asset" ADD CONSTRAINT "project_cover_asset_file_project_workspace_fk" FOREIGN KEY ("file_object_id","project_id","workspace_id") REFERENCES "public"."file_object"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_asset" ADD CONSTRAINT "project_cover_asset_version_project_workspace_fk" FOREIGN KEY ("source_site_version_id","project_id","workspace_id") REFERENCES "public"."site_version"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_asset" ADD CONSTRAINT "project_cover_asset_creator_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_capture" ADD CONSTRAINT "project_cover_capture_result_asset_id_project_cover_asset_id_fk" FOREIGN KEY ("result_asset_id") REFERENCES "public"."project_cover_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_capture" ADD CONSTRAINT "project_cover_capture_version_project_workspace_fk" FOREIGN KEY ("site_version_id","project_id","workspace_id") REFERENCES "public"."site_version"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cover_capture" ADD CONSTRAINT "project_cover_capture_requester_workspace_fk" FOREIGN KEY ("workspace_id","requested_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_cover_asset_current_kind_unique" ON "project_cover_asset" USING btree ("project_id","kind") WHERE "project_cover_asset"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "project_cover_asset_file_unique" ON "project_cover_asset" USING btree ("file_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_cover_asset_id_project_workspace_unique" ON "project_cover_asset" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE INDEX "project_cover_asset_project_created_idx" ON "project_cover_asset" USING btree ("project_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_cover_capture_idempotency_unique" ON "project_cover_capture" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "project_cover_capture_queue_idx" ON "project_cover_capture" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "project_cover_capture_project_created_idx" ON "project_cover_capture" USING btree ("project_id","created_at");