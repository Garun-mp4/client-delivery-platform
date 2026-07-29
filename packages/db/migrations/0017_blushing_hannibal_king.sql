CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'processing', 'delivered', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "action_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action_item_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"status" "reminder_status" DEFAULT 'active' NOT NULL,
	"last_kind" text,
	"last_sent_at" timestamp with time zone,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"notification_event_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"source_outbox_event_id" uuid,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"deep_link_path" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_event_deep_link_relative_check" CHECK ("notification_event"."deep_link_path" LIKE '/%')
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"quiet_hours_start_minute" integer,
	"quiet_hours_end_minute" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_quiet_hours_check" CHECK (("notification_preference"."quiet_hours_start_minute" IS NULL AND "notification_preference"."quiet_hours_end_minute" IS NULL) OR ("notification_preference"."quiet_hours_start_minute" BETWEEN 0 AND 1439 AND "notification_preference"."quiet_hours_end_minute" BETWEEN 0 AND 1439 AND "notification_preference"."quiet_hours_start_minute" <> "notification_preference"."quiet_hours_end_minute"))
);
--> statement-breakpoint
CREATE TABLE "project_handover_checklist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "action_item_id_project_workspace_unique" ON "action_item" USING btree ("id","project_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_id_workspace_unique" ON "notification_event" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "action_reminder" ADD CONSTRAINT "action_reminder_action_project_workspace_fk" FOREIGN KEY ("action_item_id","project_id","workspace_id") REFERENCES "public"."action_item"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_reminder" ADD CONSTRAINT "action_reminder_recipient_workspace_fk" FOREIGN KEY ("workspace_id","recipient_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_event_workspace_fk" FOREIGN KEY ("notification_event_id","workspace_id") REFERENCES "public"."notification_event"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_source_outbox_event_id_outbox_event_id_fk" FOREIGN KEY ("source_outbox_event_id") REFERENCES "public"."outbox_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_recipient_workspace_fk" FOREIGN KEY ("workspace_id","recipient_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_workspace_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover_checklist_item" ADD CONSTRAINT "project_handover_checklist_item_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover_checklist_item" ADD CONSTRAINT "handover_checklist_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."project"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_reminder_action_recipient_unique" ON "action_reminder" USING btree ("action_item_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "action_reminder_due_idx" ON "action_reminder" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_event_channel_unique" ON "notification_delivery" USING btree ("notification_event_id","channel");--> statement-breakpoint
CREATE INDEX "notification_delivery_dispatch_idx" ON "notification_delivery" USING btree ("status","available_at","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_recipient_dedupe_unique" ON "notification_event" USING btree ("recipient_user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_event_recipient_read_created_idx" ON "notification_event" USING btree ("workspace_id","recipient_user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_event_project_created_idx" ON "notification_event" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_workspace_user_unique" ON "notification_preference" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handover_checklist_project_key_unique" ON "project_handover_checklist_item" USING btree ("project_id","item_key");--> statement-breakpoint
CREATE INDEX "handover_checklist_project_completed_idx" ON "project_handover_checklist_item" USING btree ("project_id","completed_at");
