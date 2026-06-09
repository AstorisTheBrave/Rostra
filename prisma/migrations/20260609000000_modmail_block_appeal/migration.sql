-- Modmail abuse controls: appeal-only mode and a per-guild block list.
ALTER TABLE "ModmailConfig"
    ADD COLUMN "appealOnly" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "blockedUsers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
