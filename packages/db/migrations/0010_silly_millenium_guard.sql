ALTER TABLE "file_object" ADD COLUMN "processing_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_object" ADD COLUMN "next_processing_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "material_revision_current_integrity_unique" ON "material_revision" USING btree ("id","material_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_current_revision_integrity_fk" FOREIGN KEY ("current_revision_id","id","project_id","workspace_id") REFERENCES "public"."material_revision"("id","material_id","project_id","workspace_id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
