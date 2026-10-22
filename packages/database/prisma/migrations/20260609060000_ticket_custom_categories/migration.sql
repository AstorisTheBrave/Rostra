-- Per-guild custom ticket queues (empty = built-in defaults).
ALTER TABLE "TicketConfig"
    ADD COLUMN "categories" JSONB NOT NULL DEFAULT '[]';
