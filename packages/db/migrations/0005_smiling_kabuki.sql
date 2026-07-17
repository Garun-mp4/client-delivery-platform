CREATE TYPE "public"."action_item_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."action_item_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."action_item_type" AS ENUM('upload_material', 'answer_question', 'review_version', 'approve_stage', 'make_payment', 'fix_feedback', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."action_item_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."project_stage_status" AS ENUM('not_started', 'in_progress', 'waiting_for_client', 'ready_for_review', 'changes_requested', 'approved', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scope_decision_type" AS ENUM('agreed', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."scope_revision_status" AS ENUM('draft', 'client_review', 'agreed', 'superseded');--> statement-breakpoint
CREATE TABLE "action_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"type" "action_item_type" DEFAULT 'other' NOT NULL,
	"status" "action_item_status" DEFAULT 'open' NOT NULL,
	"priority" "action_item_priority" DEFAULT 'normal' NOT NULL,
	"visibility" "action_item_visibility" NOT NULL,
	"assignee_user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"is_blocking" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_item_terminal_timestamps_check" CHECK (("action_item"."status" = 'done' AND "action_item"."completed_at" IS NOT NULL AND "action_item"."cancelled_at" IS NULL) OR ("action_item"."status" = 'cancelled' AND "action_item"."cancelled_at" IS NOT NULL AND "action_item"."completed_at" IS NULL) OR ("action_item"."status" IN ('open', 'in_progress') AND "action_item"."completed_at" IS NULL AND "action_item"."cancelled_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "project_scope_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "scope_revision_status" DEFAULT 'draft' NOT NULL,
	"summary" text NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"integrations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision_limits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contract_url" text,
	"proposal_url" text,
	"planned_start_date" date,
	"planned_end_date" date,
	"cost_minor" bigint,
	"currency" text,
	"created_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"agreed_by_user_id" uuid,
	"agreed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scope_revision_positive_revision_check" CHECK ("project_scope_revision"."revision" > 0),
	CONSTRAINT "scope_revision_dates_check" CHECK ("project_scope_revision"."planned_start_date" IS NULL OR "project_scope_revision"."planned_end_date" IS NULL OR "project_scope_revision"."planned_end_date" >= "project_scope_revision"."planned_start_date"),
	CONSTRAINT "scope_revision_cost_currency_check" CHECK (("project_scope_revision"."cost_minor" IS NULL AND "project_scope_revision"."currency" IS NULL) OR ("project_scope_revision"."cost_minor" >= 0 AND char_length("project_scope_revision"."currency") = 3)),
	CONSTRAINT "scope_revision_state_timestamps_check" CHECK (("project_scope_revision"."status" = 'draft' AND "project_scope_revision"."submitted_at" IS NULL AND "project_scope_revision"."agreed_at" IS NULL AND "project_scope_revision"."superseded_at" IS NULL) OR ("project_scope_revision"."status" = 'client_review' AND "project_scope_revision"."submitted_at" IS NOT NULL AND "project_scope_revision"."agreed_at" IS NULL AND "project_scope_revision"."superseded_at" IS NULL) OR ("project_scope_revision"."status" = 'agreed' AND "project_scope_revision"."submitted_at" IS NOT NULL AND "project_scope_revision"."agreed_at" IS NOT NULL AND "project_scope_revision"."agreed_by_user_id" IS NOT NULL AND "project_scope_revision"."superseded_at" IS NULL) OR ("project_scope_revision"."status" = 'superseded' AND "project_scope_revision"."superseded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "project_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer NOT NULL,
	"weight" integer NOT NULL,
	"status" "project_stage_status" DEFAULT 'not_started' NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"counts_toward_progress" boolean DEFAULT true NOT NULL,
	"planned_start_date" date NOT NULL,
	"planned_end_date" date NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"acceptance_criteria" text,
	"result_summary" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stage_positive_weight_check" CHECK ("project_stage"."weight" > 0),
	CONSTRAINT "project_stage_nonnegative_order_check" CHECK ("project_stage"."order_index" >= 0),
	CONSTRAINT "project_stage_dates_check" CHECK ("project_stage"."planned_end_date" >= "project_stage"."planned_start_date"),
	CONSTRAINT "project_stage_skip_reason_check" CHECK ("project_stage"."status" <> 'skipped' OR nullif(btrim("project_stage"."skip_reason"), '') IS NOT NULL),
	CONSTRAINT "project_stage_review_result_check" CHECK ("project_stage"."status" NOT IN ('ready_for_review', 'approved') OR nullif(btrim("project_stage"."result_summary"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "scope_approval_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_revision_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"decision" "scope_decision_type" NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_revision_approver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_revision_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "progress_completed_weight" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "progress_total_weight" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "scope_revision_id_project_workspace_unique" ON "project_scope_revision" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_id_project_workspace_unique" ON "project_stage" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_approver_revision_user_project_workspace_unique" ON "scope_revision_approver" USING btree ("scope_revision_id","user_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_stage_project_workspace_fk" FOREIGN KEY ("stage_id","project_id","workspace_id") REFERENCES "public"."project_stage"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_assignee_workspace_fk" FOREIGN KEY ("workspace_id","assignee_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_creator_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_revision" ADD CONSTRAINT "scope_revision_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope_revision" ADD CONSTRAINT "scope_revision_creator_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_owner_workspace_fk" FOREIGN KEY ("workspace_id","owner_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_approval_decision" ADD CONSTRAINT "scope_decision_assigned_approver_fk" FOREIGN KEY ("scope_revision_id","approver_user_id","project_id","workspace_id") REFERENCES "public"."scope_revision_approver"("scope_revision_id","user_id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_approval_decision" ADD CONSTRAINT "scope_decision_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_revision_approver" ADD CONSTRAINT "scope_approver_revision_project_workspace_fk" FOREIGN KEY ("scope_revision_id","project_id","workspace_id") REFERENCES "public"."project_scope_revision"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_revision_approver" ADD CONSTRAINT "scope_approver_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_revision_approver" ADD CONSTRAINT "scope_approver_user_workspace_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_item_assignee_status_due_idx" ON "action_item" USING btree ("workspace_id","assignee_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "action_item_project_status_due_idx" ON "action_item" USING btree ("project_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_revision_project_revision_unique" ON "project_scope_revision" USING btree ("project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_revision_id_workspace_unique" ON "project_scope_revision" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "scope_revision_project_status_idx" ON "project_scope_revision" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_project_order_unique" ON "project_stage" USING btree ("project_id","order_index");--> statement-breakpoint
CREATE INDEX "project_stage_project_status_idx" ON "project_stage" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_decision_revision_approver_unique" ON "scope_approval_decision" USING btree ("scope_revision_id","approver_user_id");--> statement-breakpoint
CREATE INDEX "scope_decision_project_created_idx" ON "scope_approval_decision" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_approver_revision_user_unique" ON "scope_revision_approver" USING btree ("scope_revision_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_approver_revision_user_workspace_unique" ON "scope_revision_approver" USING btree ("scope_revision_id","user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "scope_approver_user_idx" ON "scope_revision_approver" USING btree ("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_progress_weights_check" CHECK ("project"."progress_completed_weight" >= 0 AND "project"."progress_total_weight" >= 0 AND "project"."progress_completed_weight" <= "project"."progress_total_weight");
--> statement-breakpoint
CREATE UNIQUE INDEX "scope_revision_one_active_unique"
ON "project_scope_revision" ("project_id")
WHERE "status" IN ('draft', 'client_review');
--> statement-breakpoint
CREATE UNIQUE INDEX "scope_revision_one_agreed_unique"
ON "project_scope_revision" ("project_id")
WHERE "status" = 'agreed';
--> statement-breakpoint
CREATE FUNCTION prevent_agreed_scope_content_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'agreed' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'agreed scope revision is immutable';
  END IF;
  IF OLD.status = 'agreed' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - ARRAY['status', 'superseded_at', 'updated_at'])
       <> (to_jsonb(OLD) - ARRAY['status', 'superseded_at', 'updated_at']) THEN
    RAISE EXCEPTION 'agreed scope revision content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agreed_scope_content_immutable
BEFORE UPDATE ON "project_scope_revision"
FOR EACH ROW EXECUTE FUNCTION prevent_agreed_scope_content_change();
