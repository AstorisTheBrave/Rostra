-- Registry of provisioned channels/roles by logical key, used by /setup provision.
ALTER TABLE "GuildTenant"
    ADD COLUMN "channelMap" JSONB NOT NULL DEFAULT '{}';
