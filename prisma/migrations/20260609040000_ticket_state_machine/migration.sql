-- Ticket state machine, priority, SLA fields + transcript message capture.
ALTER TABLE "Ticket"
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general',
    ADD COLUMN "subject" TEXT,
    ADD COLUMN "slaMinutes" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "lastActivityAt" TIMESTAMP(3),
    ADD COLUMN "firstResponseAt" TIMESTAMP(3),
    ADD COLUMN "escalatedAt" TIMESTAMP(3),
    ADD COLUMN "closedAt" TIMESTAMP(3),
    ADD COLUMN "closedBy" TEXT,
    ADD COLUMN "closeReason" TEXT,
    ADD COLUMN "summary" TEXT;

CREATE INDEX "Ticket_guildId_open_idx" ON "Ticket"("guildId", "open");

CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorTag" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketMessage_channelId_idx" ON "TicketMessage"("channelId");
