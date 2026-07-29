CREATE TYPE "public"."export_audience" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."export_job_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "export_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"audience" "export_audience" NOT NULL,
	"status" "export_job_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"artifact_storage_key" text,
	"artifact_sha256" text,
	"artifact_size" bigint,
	"attachment_count" integer,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_job_attempts_check" CHECK ("export_job"."attempts" >= 0),
	CONSTRAINT "export_job_result_check" CHECK (("export_job"."status" = 'succeeded' AND "export_job"."artifact_storage_key" IS NOT NULL AND "export_job"."artifact_sha256" IS NOT NULL AND "export_job"."artifact_size" > 0 AND "export_job"."attachment_count" >= 0 AND "export_job"."completed_at" IS NOT NULL AND "export_job"."expires_at" IS NOT NULL AND "export_job"."failure_code" IS NULL) OR ("export_job"."status" IN ('failed', 'expired') AND "export_job"."artifact_storage_key" IS NULL AND "export_job"."completed_at" IS NOT NULL AND "export_job"."failure_code" IS NOT NULL) OR ("export_job"."status" IN ('pending', 'processing') AND "export_job"."artifact_storage_key" IS NULL AND "export_job"."completed_at" IS NULL AND "export_job"."failure_code" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_requester_workspace_fk" FOREIGN KEY ("workspace_id","requested_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_job_id_project_workspace_unique" ON "export_job" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_job_workspace_idempotency_unique" ON "export_job" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "export_job_queue_idx" ON "export_job" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "export_job_project_requester_created_idx" ON "export_job" USING btree ("project_id","requested_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "export_job_expiry_idx" ON "export_job" USING btree ("status","expires_at");