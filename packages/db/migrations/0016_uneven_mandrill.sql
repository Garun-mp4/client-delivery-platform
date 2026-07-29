CREATE TYPE "public"."approval_decision_type" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."approval_entity_type" AS ENUM('scope_revision', 'project_stage', 'site_version', 'file_object', 'final_handover');--> statement-breakpoint
CREATE TYPE "public"."approval_mode" AS ENUM('any_one', 'all_required');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('pending', 'approved', 'changes_requested', 'cancelled', 'invalidated');--> statement-breakpoint
CREATE TABLE "approval_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"decision" "approval_decision_type" NOT NULL,
	"comment" text,
	"idempotency_key" text NOT NULL,
	"network_fingerprint" text,
	"user_agent" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decision_comment_check" CHECK ("approval_decision"."decision" <> 'changes_requested' OR nullif(btrim("approval_decision"."comment"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_type" "approval_entity_type" NOT NULL,
	"target_key" text NOT NULL,
	"scope_revision_id" uuid,
	"stage_id" uuid,
	"site_version_id" uuid,
	"file_object_id" uuid,
	"entity_revision" text NOT NULL,
	"entity_snapshot" jsonb NOT NULL,
	"snapshot_checksum" text NOT NULL,
	"acknowledgement_text" text NOT NULL,
	"acknowledgement_checksum" text NOT NULL,
	"mode" "approval_mode" DEFAULT 'any_one' NOT NULL,
	"status" "approval_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_request_target_check" CHECK (("approval_request"."entity_type" = 'scope_revision' AND "approval_request"."scope_revision_id" IS NOT NULL AND "approval_request"."stage_id" IS NULL AND "approval_request"."site_version_id" IS NULL AND "approval_request"."file_object_id" IS NULL) OR ("approval_request"."entity_type" = 'project_stage' AND "approval_request"."scope_revision_id" IS NULL AND "approval_request"."stage_id" IS NOT NULL AND "approval_request"."site_version_id" IS NULL AND "approval_request"."file_object_id" IS NULL) OR ("approval_request"."entity_type" = 'site_version' AND "approval_request"."scope_revision_id" IS NULL AND "approval_request"."stage_id" IS NULL AND "approval_request"."site_version_id" IS NOT NULL AND "approval_request"."file_object_id" IS NULL) OR ("approval_request"."entity_type" = 'file_object' AND "approval_request"."scope_revision_id" IS NULL AND "approval_request"."stage_id" IS NULL AND "approval_request"."site_version_id" IS NULL AND "approval_request"."file_object_id" IS NOT NULL) OR ("approval_request"."entity_type" = 'final_handover' AND "approval_request"."scope_revision_id" IS NULL AND "approval_request"."stage_id" IS NULL AND "approval_request"."site_version_id" IS NULL AND "approval_request"."file_object_id" IS NULL)),
	CONSTRAINT "approval_request_resolution_check" CHECK (("approval_request"."status" = 'pending' AND "approval_request"."resolved_at" IS NULL AND "approval_request"."cancelled_at" IS NULL AND "approval_request"."invalidated_at" IS NULL) OR ("approval_request"."status" IN ('approved', 'changes_requested') AND "approval_request"."resolved_at" IS NOT NULL AND "approval_request"."cancelled_at" IS NULL AND "approval_request"."invalidated_at" IS NULL) OR ("approval_request"."status" = 'cancelled' AND "approval_request"."resolved_at" IS NULL AND "approval_request"."cancelled_at" IS NOT NULL AND nullif(btrim("approval_request"."cancel_reason"), '') IS NOT NULL AND "approval_request"."invalidated_at" IS NULL) OR ("approval_request"."status" = 'invalidated' AND "approval_request"."resolved_at" IS NULL AND "approval_request"."cancelled_at" IS NULL AND "approval_request"."invalidated_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "approval_request_approver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_decision_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"decision" "approval_decision_type" NOT NULL,
	"source" text NOT NULL,
	"source_decision_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"explanation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_decision_source_check" CHECK (nullif(btrim("external_decision_record"."source"), '') IS NOT NULL),
	CONSTRAINT "external_decision_explanation_check" CHECK (nullif(btrim("external_decision_record"."explanation"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_id_project_workspace_unique" ON "approval_request" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_approver_request_user_project_workspace_unique" ON "approval_request_approver" USING btree ("approval_request_id","user_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_assigned_approver_fk" FOREIGN KEY ("approval_request_id","approver_user_id","project_id","workspace_id") REFERENCES "public"."approval_request_approver"("approval_request_id","user_id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_scope_project_workspace_fk" FOREIGN KEY ("scope_revision_id","project_id","workspace_id") REFERENCES "public"."project_scope_revision"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_stage_project_workspace_fk" FOREIGN KEY ("stage_id","project_id","workspace_id") REFERENCES "public"."project_stage"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_version_project_workspace_fk" FOREIGN KEY ("site_version_id","project_id","workspace_id") REFERENCES "public"."site_version"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_file_project_workspace_fk" FOREIGN KEY ("file_object_id","project_id","workspace_id") REFERENCES "public"."file_object"("id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request_approver" ADD CONSTRAINT "approval_approver_request_project_workspace_fk" FOREIGN KEY ("approval_request_id","project_id","workspace_id") REFERENCES "public"."approval_request"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request_approver" ADD CONSTRAINT "approval_approver_project_member_fk" FOREIGN KEY ("project_id","workspace_id","user_id") REFERENCES "public"."project_membership"("project_id","workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_decision_record" ADD CONSTRAINT "external_decision_record_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_decision_record" ADD CONSTRAINT "external_decision_request_project_workspace_fk" FOREIGN KEY ("approval_request_id","project_id","workspace_id") REFERENCES "public"."approval_request"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decision_request_approver_unique" ON "approval_decision" USING btree ("approval_request_id","approver_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decision_request_idempotency_unique" ON "approval_decision" USING btree ("approval_request_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "approval_decision_project_created_idx" ON "approval_decision" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_workspace_idempotency_unique" ON "approval_request" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_active_target_unique" ON "approval_request" USING btree ("project_id","target_key") WHERE "approval_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approval_request_project_status_created_idx" ON "approval_request" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "approval_request_workspace_status_idx" ON "approval_request" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_approver_request_user_unique" ON "approval_request_approver" USING btree ("approval_request_id","user_id");--> statement-breakpoint
CREATE INDEX "approval_approver_user_idx" ON "approval_request_approver" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_decision_request_idempotency_unique" ON "external_decision_record" USING btree ("approval_request_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "external_decision_request_unique" ON "external_decision_record" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX "external_decision_project_created_idx" ON "external_decision_record" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE FUNCTION prevent_approval_evidence_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approval evidence is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER approval_decision_immutable
BEFORE UPDATE ON "approval_decision"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_evidence_change();
--> statement-breakpoint
CREATE TRIGGER external_decision_record_immutable
BEFORE UPDATE ON "external_decision_record"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_evidence_change();
--> statement-breakpoint
CREATE FUNCTION prevent_approval_request_snapshot_change() RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id <> OLD.workspace_id
    OR NEW.project_id <> OLD.project_id
    OR NEW.entity_type <> OLD.entity_type
    OR NEW.target_key <> OLD.target_key
    OR NEW.scope_revision_id IS DISTINCT FROM OLD.scope_revision_id
    OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
    OR NEW.site_version_id IS DISTINCT FROM OLD.site_version_id
    OR NEW.file_object_id IS DISTINCT FROM OLD.file_object_id
    OR NEW.entity_revision <> OLD.entity_revision
    OR NEW.entity_snapshot <> OLD.entity_snapshot
    OR NEW.snapshot_checksum <> OLD.snapshot_checksum
    OR NEW.acknowledgement_text <> OLD.acknowledgement_text
    OR NEW.acknowledgement_checksum <> OLD.acknowledgement_checksum
    OR NEW.mode <> OLD.mode
    OR NEW.requested_by_user_id <> OLD.requested_by_user_id
    OR NEW.idempotency_key <> OLD.idempotency_key
    OR NEW.requested_at <> OLD.requested_at
    OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'approval request snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER approval_request_snapshot_immutable
BEFORE UPDATE ON "approval_request"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_request_snapshot_change();
