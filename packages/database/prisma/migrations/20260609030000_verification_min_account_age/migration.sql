-- Account-age gate: kick accounts younger than N days on join (null = off).
ALTER TABLE "VerificationConfig"
    ADD COLUMN "minAccountAgeDays" INTEGER;
