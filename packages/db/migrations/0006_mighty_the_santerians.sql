CREATE TYPE "public"."questionnaire_status" AS ENUM('open', 'submitted', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_submission_status" AS ENUM('submitted', 'clarification_requested', 'accepted');--> statement-breakpoint
CREATE TABLE "questionnaire" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"schema_snapshot" jsonb NOT NULL,
	"status" "questionnaire_status" DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_schema_version_check" CHECK ("questionnaire"."schema_version" > 0),
	CONSTRAINT "questionnaire_state_timestamps_check" CHECK (("questionnaire"."status" = 'open' AND "questionnaire"."completed_at" IS NULL AND "questionnaire"."cancelled_at" IS NULL) OR ("questionnaire"."status" = 'submitted' AND "questionnaire"."submitted_at" IS NOT NULL AND "questionnaire"."completed_at" IS NULL AND "questionnaire"."cancelled_at" IS NULL) OR ("questionnaire"."status" = 'completed' AND "questionnaire"."submitted_at" IS NOT NULL AND "questionnaire"."completed_at" IS NOT NULL AND "questionnaire"."cancelled_at" IS NULL) OR ("questionnaire"."status" = 'cancelled' AND "questionnaire"."cancelled_at" IS NOT NULL AND "questionnaire"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answer_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_comment_field_nonempty_check" CHECK (nullif(btrim("questionnaire_answer_comment"."field_id"), '') IS NOT NULL),
	CONSTRAINT "questionnaire_comment_body_nonempty_check" CHECK (nullif(btrim("questionnaire_answer_comment"."body"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "questionnaire_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_idempotency_key" text,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_draft_version_check" CHECK ("questionnaire_draft"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "questionnaire_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"schema_snapshot" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"status" "questionnaire_submission_status" DEFAULT 'submitted' NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_submission_revision_check" CHECK ("questionnaire_submission"."revision" > 0),
	CONSTRAINT "questionnaire_submission_review_state_check" CHECK (("questionnaire_submission"."status" = 'submitted' AND "questionnaire_submission"."reviewed_by_user_id" IS NULL AND "questionnaire_submission"."reviewed_at" IS NULL AND "questionnaire_submission"."review_comment" IS NULL) OR ("questionnaire_submission"."status" = 'clarification_requested' AND "questionnaire_submission"."reviewed_by_user_id" IS NOT NULL AND "questionnaire_submission"."reviewed_at" IS NOT NULL AND nullif(btrim("questionnaire_submission"."review_comment"), '') IS NOT NULL) OR ("questionnaire_submission"."status" = 'accepted' AND "questionnaire_submission"."reviewed_by_user_id" IS NOT NULL AND "questionnaire_submission"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_membership_project_workspace_user_unique" ON "project_membership" USING btree ("project_id","workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_id_workspace_unique" ON "questionnaire" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_id_project_workspace_unique" ON "questionnaire" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_submission_id_project_workspace_unique" ON "questionnaire_submission" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_assignee_project_membership_fk" FOREIGN KEY ("project_id","workspace_id","assigned_to_user_id") REFERENCES "public"."project_membership"("project_id","workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_creator_workspace_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answer_comment" ADD CONSTRAINT "questionnaire_comment_submission_project_workspace_fk" FOREIGN KEY ("submission_id","project_id","workspace_id") REFERENCES "public"."questionnaire_submission"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answer_comment" ADD CONSTRAINT "questionnaire_comment_questionnaire_project_workspace_fk" FOREIGN KEY ("questionnaire_id","project_id","workspace_id") REFERENCES "public"."questionnaire"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answer_comment" ADD CONSTRAINT "questionnaire_comment_author_workspace_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_draft" ADD CONSTRAINT "questionnaire_draft_questionnaire_project_workspace_fk" FOREIGN KEY ("questionnaire_id","project_id","workspace_id") REFERENCES "public"."questionnaire"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_draft" ADD CONSTRAINT "questionnaire_draft_user_project_membership_fk" FOREIGN KEY ("project_id","workspace_id","user_id") REFERENCES "public"."project_membership"("project_id","workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_submission" ADD CONSTRAINT "questionnaire_submission_questionnaire_project_workspace_fk" FOREIGN KEY ("questionnaire_id","project_id","workspace_id") REFERENCES "public"."questionnaire"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_submission" ADD CONSTRAINT "questionnaire_submission_submitter_project_membership_fk" FOREIGN KEY ("project_id","workspace_id","submitted_by_user_id") REFERENCES "public"."project_membership"("project_id","workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questionnaire_project_status_idx" ON "questionnaire" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "questionnaire_assignee_status_due_idx" ON "questionnaire" USING btree ("workspace_id","assigned_to_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "questionnaire_comment_submission_field_idx" ON "questionnaire_answer_comment" USING btree ("submission_id","field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_draft_questionnaire_unique" ON "questionnaire_draft" USING btree ("questionnaire_id");--> statement-breakpoint
CREATE INDEX "questionnaire_draft_user_updated_idx" ON "questionnaire_draft" USING btree ("workspace_id","user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_submission_questionnaire_revision_unique" ON "questionnaire_submission" USING btree ("questionnaire_id","revision");--> statement-breakpoint
CREATE INDEX "questionnaire_submission_questionnaire_created_idx" ON "questionnaire_submission" USING btree ("questionnaire_id","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_questionnaire_submission_content_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.questionnaire_id IS DISTINCT FROM OLD.questionnaire_id
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.schema_snapshot IS DISTINCT FROM OLD.schema_snapshot
    OR NEW.answers IS DISTINCT FROM OLD.answers
    OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'questionnaire submission content is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER questionnaire_submission_content_immutable
BEFORE UPDATE ON "questionnaire_submission"
FOR EACH ROW
EXECUTE FUNCTION prevent_questionnaire_submission_content_update();
