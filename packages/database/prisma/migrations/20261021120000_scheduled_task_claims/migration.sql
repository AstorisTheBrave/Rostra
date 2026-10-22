ALTER TABLE "ScheduledTask"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "claimVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ScheduledTask" SET "nextAttemptAt" = "runAt" WHERE "nextAttemptAt" IS NULL;

CREATE INDEX "ScheduledTask_status_nextAttemptAt_idx" ON "ScheduledTask"("status", "nextAttemptAt");
CREATE INDEX "ScheduledTask_status_leaseUntil_idx" ON "ScheduledTask"("status", "leaseUntil");
