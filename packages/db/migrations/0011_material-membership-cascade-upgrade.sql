ALTER TABLE "file_object" DROP CONSTRAINT "file_object_uploader_workspace_fk";--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_uploader_workspace_fk" FOREIGN KEY ("workspace_id","uploaded_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" DROP CONSTRAINT "material_requested_from_workspace_fk";--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_requested_from_workspace_fk" FOREIGN KEY ("workspace_id","requested_from_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" DROP CONSTRAINT "material_requested_by_workspace_fk";--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_requested_by_workspace_fk" FOREIGN KEY ("workspace_id","requested_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revision" DROP CONSTRAINT "material_revision_submitter_workspace_fk";--> statement-breakpoint
ALTER TABLE "material_revision" ADD CONSTRAINT "material_revision_submitter_workspace_fk" FOREIGN KEY ("workspace_id","submitted_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revision" DROP CONSTRAINT "material_revision_acceptor_workspace_fk";--> statement-breakpoint
ALTER TABLE "material_revision" ADD CONSTRAINT "material_revision_acceptor_workspace_fk" FOREIGN KEY ("workspace_id","accepted_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
