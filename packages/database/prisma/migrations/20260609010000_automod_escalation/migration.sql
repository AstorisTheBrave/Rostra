-- Automod severity-weighted escalation ladder.
ALTER TABLE "AutomodConfig"
    ADD COLUMN "antiHate" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "escalate" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AutomodRule"
    ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'LOW';

CREATE TABLE "AutomodWarning" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "reason" TEXT,
    "ruleId" TEXT,
    "action" TEXT NOT NULL DEFAULT 'WARN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomodWarning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomodWarning_guildId_userId_idx" ON "AutomodWarning"("guildId", "userId");
