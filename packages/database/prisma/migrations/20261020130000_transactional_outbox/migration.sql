CREATE TABLE "OperationOutbox" (
    "operationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimVersion" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationOutbox_pkey" PRIMARY KEY ("operationId")
);

CREATE INDEX "OperationOutbox_status_nextAttemptAt_idx" ON "OperationOutbox"("status", "nextAttemptAt");
CREATE INDEX "OperationOutbox_status_leaseUntil_idx" ON "OperationOutbox"("status", "leaseUntil");
ALTER TABLE "OperationOutbox" ADD CONSTRAINT "OperationOutbox_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OperationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing recoverable operation intent must enter the relay on upgrade.
INSERT INTO "OperationOutbox" ("operationId", "status", "nextAttemptAt", "createdAt", "updatedAt")
SELECT "id", 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OperationRecord"
WHERE "status" IN ('pending', 'retryable', 'processing');
