-- Fence stale workers after an operation lease is reclaimed.
ALTER TABLE "OperationRecord"
ADD COLUMN "claimVersion" INTEGER NOT NULL DEFAULT 0;
