-- Ticket watchers: staff who get notified on escalate/close.
ALTER TABLE "Ticket"
    ADD COLUMN "watchers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
