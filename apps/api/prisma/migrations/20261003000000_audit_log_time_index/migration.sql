-- The audit log page lists newest first; the table only ever grows (M9, performance pass).
CREATE INDEX "audit_logs_at_id_idx" ON "audit_logs"("at" DESC, "id" DESC);
