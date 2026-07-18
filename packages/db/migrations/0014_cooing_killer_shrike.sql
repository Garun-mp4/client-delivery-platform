DROP INDEX "site_version_attempt_unique";--> statement-breakpoint
CREATE INDEX "site_version_attempt_cycle_idx" ON "site_version_check_attempt" USING btree ("site_version_id","attempt");