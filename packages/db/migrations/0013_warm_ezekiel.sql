ALTER TABLE "comment" DROP CONSTRAINT "comment_author_workspace_fk";
--> statement-breakpoint
ALTER TABLE "feedback_item" DROP CONSTRAINT "feedback_author_workspace_fk";
--> statement-breakpoint
ALTER TABLE "feedback_item" DROP CONSTRAINT "feedback_assignee_workspace_fk";
--> statement-breakpoint
ALTER TABLE "project_update" DROP CONSTRAINT "project_update_author_workspace_fk";
--> statement-breakpoint
ALTER TABLE "site_version" DROP CONSTRAINT "site_version_publisher_workspace_fk";
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_workspace_fk" FOREIGN KEY ("workspace_id","author_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_author_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_assignee_workspace_fk" FOREIGN KEY ("workspace_id","assigned_to_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_author_workspace_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_version" ADD CONSTRAINT "site_version_publisher_workspace_fk" FOREIGN KEY ("workspace_id","published_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;