ALTER TABLE "questionnaire_answer_comment" DROP CONSTRAINT "questionnaire_comment_submission_project_workspace_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_submission_id_questionnaire_project_workspace_unique" ON "questionnaire_submission" USING btree ("id","questionnaire_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "questionnaire_answer_comment" ADD CONSTRAINT "questionnaire_comment_submission_project_workspace_fk" FOREIGN KEY ("submission_id","questionnaire_id","project_id","workspace_id") REFERENCES "public"."questionnaire_submission"("id","questionnaire_id","project_id","workspace_id") ON DELETE cascade ON UPDATE no action;
