CREATE TABLE "GuildRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "GuildRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildCapabilityGrant" (
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    CONSTRAINT "GuildCapabilityGrant_pkey" PRIMARY KEY ("guildId", "roleId", "capability"),
    CONSTRAINT "GuildCapabilityGrant_capability_check" CHECK ("capability" IN ('guilds:read', 'guilds:admin', 'operations:read', 'operations:write', 'realtime:connect', 'activity:launch'))
);

CREATE TABLE "GuildMemberRole" (
    "guildId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "GuildMemberRole_pkey" PRIMARY KEY ("guildId", "memberId", "roleId")
);

CREATE UNIQUE INDEX "GuildRole_guildId_id_key" ON "GuildRole"("guildId", "id");
CREATE UNIQUE INDEX "GuildRole_guildId_name_key" ON "GuildRole"("guildId", "name");
CREATE INDEX "GuildRole_guildId_idx" ON "GuildRole"("guildId");
CREATE UNIQUE INDEX "GuildMember_guildId_id_key" ON "GuildMember"("guildId", "id");
CREATE INDEX "GuildMemberRole_guildId_roleId_idx" ON "GuildMemberRole"("guildId", "roleId");

ALTER TABLE "GuildRole" ADD CONSTRAINT "GuildRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildCapabilityGrant" ADD CONSTRAINT "GuildCapabilityGrant_guildId_roleId_fkey" FOREIGN KEY ("guildId", "roleId") REFERENCES "GuildRole"("guildId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_guildId_memberId_fkey" FOREIGN KEY ("guildId", "memberId") REFERENCES "GuildMember"("guildId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_guildId_roleId_fkey" FOREIGN KEY ("guildId", "roleId") REFERENCES "GuildRole"("guildId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
