DROP INDEX "file_link_revision_object_unique";--> statement-breakpoint
ALTER TABLE "file_link" ALTER COLUMN "material_revision_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "file_link" ADD COLUMN "questionnaire_id" uuid;--> statement-breakpoint
ALTER TABLE "file_link" ADD COLUMN "questionnaire_field_id" text;--> statement-breakpoint
ALTER TABLE "file_object" ADD COLUMN "upload_session_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "file_link" ADD CONSTRAINT "file_link_questionnaire_project_workspace_fk" FOREIGN KEY ("questionnaire_id","project_id","workspace_id") REFERENCES "public"."questionnaire"("id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_link_questionnaire_field_object_unique" ON "file_link" USING btree ("questionnaire_id","questionnaire_field_id","file_object_id") WHERE "file_link"."questionnaire_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_object_workspace_uploader_session_unique" ON "file_object" USING btree ("workspace_id","uploaded_by_user_id","upload_session_key");--> statement-breakpoint
CREATE UNIQUE INDEX "file_link_revision_object_unique" ON "file_link" USING btree ("material_revision_id","file_object_id") WHERE "file_link"."material_revision_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "file_link" ADD CONSTRAINT "file_link_single_context_check" CHECK (("file_link"."material_revision_id" IS NOT NULL AND "file_link"."questionnaire_id" IS NULL AND "file_link"."questionnaire_field_id" IS NULL) OR ("file_link"."material_revision_id" IS NULL AND "file_link"."questionnaire_id" IS NOT NULL AND nullif(btrim("file_link"."questionnaire_field_id"), '') IS NOT NULL));