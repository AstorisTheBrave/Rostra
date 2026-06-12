-- Ticket tags for categorising / searching tickets.
ALTER TABLE "Ticket"
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
