-- CreateTable
CREATE TABLE "OperationRecord" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationAttempt" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "classification" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationEffect" (
    "operationId" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationEffect_pkey" PRIMARY KEY ("operationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationRecord_idempotencyKey_key" ON "OperationRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OperationRecord_guildId_idx" ON "OperationRecord"("guildId");

-- CreateIndex
CREATE INDEX "OperationRecord_status_leaseUntil_idx" ON "OperationRecord"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "OperationAttempt_operationId_idx" ON "OperationAttempt"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationAttempt_operationId_attempt_key" ON "OperationAttempt"("operationId", "attempt");

-- AddForeignKey
ALTER TABLE "OperationAttempt" ADD CONSTRAINT "OperationAttempt_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OperationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationEffect" ADD CONSTRAINT "OperationEffect_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "OperationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve failed scheduled work for operator inspection instead of deleting it.
ALTER TABLE "ScheduledTask"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT;
