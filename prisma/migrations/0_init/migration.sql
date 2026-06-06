-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "prefix" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildModuleConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "GuildModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMember" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blacklist" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isWeekend" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'topgg',

    CONSTRAINT "UserVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerAudit" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "durationMs" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildCaseCounter" (
    "guildId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildCaseCounter_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "AntinukeConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "punishment" TEXT NOT NULL DEFAULT 'ban',
    "logChannelId" TEXT,
    "notifyOwner" BOOLEAN NOT NULL DEFAULT true,
    "antiBan" BOOLEAN NOT NULL DEFAULT true,
    "antiKick" BOOLEAN NOT NULL DEFAULT true,
    "antiBotAdd" BOOLEAN NOT NULL DEFAULT true,
    "antiChannel" BOOLEAN NOT NULL DEFAULT true,
    "antiRole" BOOLEAN NOT NULL DEFAULT true,
    "antiWebhook" BOOLEAN NOT NULL DEFAULT true,
    "antiGuildUpdate" BOOLEAN NOT NULL DEFAULT true,
    "extraOwners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntinukeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "AutomodConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "logChannelId" TEXT,
    "antiInvite" BOOLEAN NOT NULL DEFAULT false,
    "antiLink" BOOLEAN NOT NULL DEFAULT false,
    "antiSpam" BOOLEAN NOT NULL DEFAULT false,
    "antiMassMention" BOOLEAN NOT NULL DEFAULT false,
    "antiProfanity" BOOLEAN NOT NULL DEFAULT false,
    "antiCaps" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL DEFAULT 'delete',
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "spamCount" INTEGER NOT NULL DEFAULT 5,
    "spamWindowMs" INTEGER NOT NULL DEFAULT 5000,
    "mentionLimit" INTEGER NOT NULL DEFAULT 5,
    "capsPercent" INTEGER NOT NULL DEFAULT 70,
    "capsMinLength" INTEGER NOT NULL DEFAULT 10,
    "exemptRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exemptChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomodConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "LoggingConfig" (
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "messageDelete" BOOLEAN NOT NULL DEFAULT true,
    "messageEdit" BOOLEAN NOT NULL DEFAULT true,
    "memberJoin" BOOLEAN NOT NULL DEFAULT true,
    "memberLeave" BOOLEAN NOT NULL DEFAULT true,
    "memberBan" BOOLEAN NOT NULL DEFAULT true,
    "memberUnban" BOOLEAN NOT NULL DEFAULT true,
    "roleChanges" BOOLEAN NOT NULL DEFAULT true,
    "channelChanges" BOOLEAN NOT NULL DEFAULT true,
    "ignoredChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoggingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "guildId" TEXT NOT NULL,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeChannelId" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Welcome {user} to **{server}**! You''re member #{membercount}.',
    "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeChannelId" TEXT,
    "goodbyeMessage" TEXT NOT NULL DEFAULT '**{username}** has left the server.',
    "dmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dmMessage" TEXT NOT NULL DEFAULT 'Welcome to {server}! We''re glad to have you.',
    "autoroleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "logChannelId" TEXT,
    "supportRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "panelTitle" TEXT NOT NULL DEFAULT 'Need help?',
    "panelMessage" TEXT NOT NULL DEFAULT 'Click the button below to open a ticket.',
    "openMessage" TEXT NOT NULL DEFAULT 'Thanks for opening a ticket. Support will be with you shortly.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "claimedBy" TEXT,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildTicketCounter" (
    "guildId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildTicketCounter_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "EconomyUser" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wallet" INTEGER NOT NULL DEFAULT 0,
    "bank" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastDaily" TIMESTAMP(3),
    "lastWork" TIMESTAMP(3),
    "lastCrime" TIMESTAMP(3),
    "lastRob" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomyUser_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "LevelConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "announceChannelId" TEXT,
    "xpMin" INTEGER NOT NULL DEFAULT 10,
    "xpMax" INTEGER NOT NULL DEFAULT 20,
    "cooldownMs" INTEGER NOT NULL DEFAULT 60000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "LevelUser" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelUser_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "LevelReward" (
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "LevelReward_pkey" PRIMARY KEY ("guildId","level")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "winners" INTEGER NOT NULL DEFAULT 1,
    "hostId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "ended" BOOLEAN NOT NULL DEFAULT false,
    "entries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinToCreateConfig" (
    "guildId" TEXT NOT NULL,
    "hubChannelId" TEXT,
    "categoryId" TEXT,
    "nameTemplate" TEXT NOT NULL DEFAULT '{user}''s channel',
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JoinToCreateConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "J2CChannel" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "J2CChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "ReactionRolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'multiple',
    "roles" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BirthdayConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "roleId" TEXT,
    "message" TEXT NOT NULL DEFAULT '🎂 Happy birthday {user}!',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Birthday" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER,

    CONSTRAINT "Birthday_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "AfkStatus" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfkStatus_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "AutoResponder" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,

    CONSTRAINT "AutoResponder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaScore" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaScore_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("guildId","name")
);

-- CreateTable
CREATE TABLE "VanityRoleConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keyword" TEXT,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VanityRoleConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "FeedbackConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "background" TEXT,
    "accent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "GuildModuleConfig_guildId_idx" ON "GuildModuleConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildModuleConfig_guildId_module_key" ON "GuildModuleConfig"("guildId", "module");

-- CreateIndex
CREATE INDEX "GuildMember_guildId_idx" ON "GuildMember"("guildId");

-- CreateIndex
CREATE INDEX "GuildMember_userId_idx" ON "GuildMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMember_guildId_userId_key" ON "GuildMember"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Blacklist_targetId_key" ON "Blacklist"("targetId");

-- CreateIndex
CREATE INDEX "UserVote_userId_idx" ON "UserVote"("userId");

-- CreateIndex
CREATE INDEX "OwnerAudit_ownerId_idx" ON "OwnerAudit"("ownerId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_targetId_idx" ON "ModerationCase"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_type_idx" ON "ModerationCase"("guildId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_guildId_caseNumber_key" ON "ModerationCase"("guildId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_userId_idx" ON "Ticket"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");

-- CreateIndex
CREATE INDEX "EconomyUser_guildId_idx" ON "EconomyUser"("guildId");

-- CreateIndex
CREATE INDEX "LevelUser_guildId_idx" ON "LevelUser"("guildId");

-- CreateIndex
CREATE INDEX "LevelReward_guildId_idx" ON "LevelReward"("guildId");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_ended_idx" ON "Giveaway"("guildId", "ended");

-- CreateIndex
CREATE INDEX "Giveaway_ended_idx" ON "Giveaway"("ended");

-- CreateIndex
CREATE INDEX "J2CChannel_guildId_idx" ON "J2CChannel"("guildId");

-- CreateIndex
CREATE INDEX "ReactionRolePanel_guildId_idx" ON "ReactionRolePanel"("guildId");

-- CreateIndex
CREATE INDEX "Birthday_month_day_idx" ON "Birthday"("month", "day");

-- CreateIndex
CREATE INDEX "AutoResponder_guildId_idx" ON "AutoResponder"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoResponder_guildId_trigger_key" ON "AutoResponder"("guildId", "trigger");

-- CreateIndex
CREATE INDEX "TriviaScore_guildId_idx" ON "TriviaScore"("guildId");

-- CreateIndex
CREATE INDEX "Tag_guildId_idx" ON "Tag"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_guildId_idx" ON "Reminder"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- AddForeignKey
ALTER TABLE "GuildModuleConfig" ADD CONSTRAINT "GuildModuleConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVote" ADD CONSTRAINT "UserVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
