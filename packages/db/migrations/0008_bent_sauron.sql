CREATE TYPE "public"."file_scan_status" AS ENUM('pending', 'scanning', 'clean', 'infected', 'error');--> statement-breakpoint
CREATE TYPE "public"."file_upload_status" AS ENUM('initiated', 'uploaded', 'scanning', 'available', 'rejected', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."file_visibility" AS ENUM('project', 'internal');--> statement-breakpoint
CREATE TYPE "public"."material_revision_status" AS ENUM('uploading', 'pending_scan', 'submitted', 'clarification_requested', 'accepted', 'replaced', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('requested', 'uploaded', 'clarification', 'accepted', 'replaced', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('text', 'contact', 'link', 'file', 'image', 'video', 'logo', 'document', 'details', 'service', 'testimonial', 'employee', 'legal_text', 'other');--> statement-breakpoint
CREATE TABLE "file_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_object_id" uuid NOT NULL,
	"material_revision_id" uuid NOT NULL,
	"label" text,
	"visibility" "file_visibility" DEFAULT 'project' NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_link_positive_version_check" CHECK ("file_link"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "file_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"preview_storage_key" text,
	"original_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"detected_mime_type" text,
	"size" bigint NOT NULL,
	"client_checksum" text NOT NULL,
	"checksum" text,
	"upload_status" "file_upload_status" DEFAULT 'initiated' NOT NULL,
	"scan_status" "file_scan_status" DEFAULT 'pending' NOT NULL,
	"scanner_engine" text,
	"scan_result_code" text,
	"scan_started_at" timestamp with time zone,
	"scanned_at" timestamp with time zone,
	"uploaded_by_user_id" uuid NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"available_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_object_positive_size_check" CHECK ("file_object"."size" > 0)
);
--> statement-breakpoint
CREATE TABLE "material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_id" uuid,
	"action_item_id" uuid,
	"type" "material_type" NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"status" "material_status" DEFAULT 'requested' NOT NULL,
	"current_revision_id" uuid,
	"requested_from_user_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"final_at" timestamp with time zone,
	"not_required_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_not_required_reason_check" CHECK ("material"."status" <> 'not_required' OR nullif(btrim("material"."not_required_reason"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "material_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "material_revision_status" NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"expected_file_count" integer DEFAULT 0 NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_revision_positive_revision_check" CHECK ("material_revision"."revision" > 0),
	CONSTRAINT "material_revision_file_count_check" CHECK ("material_revision"."expected_file_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "file_object_id_project_workspace_unique" ON "file_object" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_id_project_workspace_unique" ON "material" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_revision_id_project_workspace_unique" ON "material_revision" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "file_link" ADD CONSTRAINT "file_link_object_project_workspace_fk" FOREIGN KEY ("file_object_id","project_id","workspace_id") REFERENCES "public"."file_object"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_link" ADD CONSTRAINT "file_link_revision_project_workspace_fk" FOREIGN KEY ("material_revision_id","project_id","workspace_id") REFERENCES "public"."material_revision"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_uploader_workspace_fk" FOREIGN KEY ("workspace_id","uploaded_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_stage_project_workspace_fk" FOREIGN KEY ("stage_id","project_id","workspace_id") REFERENCES "public"."project_stage"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_requested_from_workspace_fk" FOREIGN KEY ("workspace_id","requested_from_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_requested_by_workspace_fk" FOREIGN KEY ("workspace_id","requested_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revision" ADD CONSTRAINT "material_revision_material_project_workspace_fk" FOREIGN KEY ("material_id","project_id","workspace_id") REFERENCES "public"."material"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revision" ADD CONSTRAINT "material_revision_submitter_workspace_fk" FOREIGN KEY ("workspace_id","submitted_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revision" ADD CONSTRAINT "material_revision_acceptor_workspace_fk" FOREIGN KEY ("workspace_id","accepted_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_link_revision_object_unique" ON "file_link" USING btree ("material_revision_id","file_object_id");--> statement-breakpoint
CREATE INDEX "file_link_revision_current_idx" ON "file_link" USING btree ("material_revision_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "file_object_storage_key_unique" ON "file_object" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_object_scan_queue_idx" ON "file_object" USING btree ("upload_status","scan_status","created_at");--> statement-breakpoint
CREATE INDEX "file_object_workspace_quota_idx" ON "file_object" USING btree ("workspace_id","upload_status");--> statement-breakpoint
CREATE INDEX "file_object_upload_expiry_idx" ON "file_object" USING btree ("upload_status","upload_expires_at");--> statement-breakpoint
CREATE INDEX "material_project_status_category_idx" ON "material" USING btree ("project_id","status","category");--> statement-breakpoint
CREATE INDEX "material_requested_from_status_idx" ON "material" USING btree ("workspace_id","requested_from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "material_revision_material_revision_unique" ON "material_revision" USING btree ("material_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "material_revision_material_idempotency_unique" ON "material_revision" USING btree ("material_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "material_revision_material_status_idx" ON "material_revision" USING btree ("material_id","status");
