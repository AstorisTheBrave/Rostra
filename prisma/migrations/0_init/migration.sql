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
    "antiRaid" BOOLEAN NOT NULL DEFAULT false,
    "raidThreshold" INTEGER NOT NULL DEFAULT 10,
    "raidWindowSec" INTEGER NOT NULL DEFAULT 10,
    "raidLockMinutes" INTEGER NOT NULL DEFAULT 10,
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
CREATE TABLE "AutomodRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL DEFAULT 'keyword',
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'delete',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomodRule_pkey" PRIMARY KEY ("id")
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
    "bulkDelete" BOOLEAN NOT NULL DEFAULT true,
    "voiceMoves" BOOLEAN NOT NULL DEFAULT true,
    "nicknameChanges" BOOLEAN NOT NULL DEFAULT true,
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
    "welcomeCard" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "roleId" TEXT,
    "stock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
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
    "reqRoleId" TEXT,
    "reqLevel" INTEGER NOT NULL DEFAULT 0,
    "reqAccountDays" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "StatsChannel" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "template" TEXT NOT NULL,

    CONSTRAINT "StatsChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "VoiceRoleConfig" (
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "VoiceRoleConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "RepUser" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lastGiven" TIMESTAMP(3),

    CONSTRAINT "RepUser_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "StickyMessage" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lastMessageId" TEXT,

    CONSTRAINT "StickyMessage_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "BotState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GuildTenant" (
    "guildId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "logChannelId" TEXT,
    "modLogChannelId" TEXT,
    "welcomeChannelId" TEXT,
    "muteRoleId" TEXT,
    "features" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildTenant_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "locale" TEXT,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "VerificationConfig" (
    "guildId" TEXT NOT NULL,
    "roleId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "captcha" BOOLEAN NOT NULL DEFAULT false,
    "kickAfterMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "creatorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" INTEGER NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuggestionConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVote" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "SuggestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSuggestionCounter" (
    "guildId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildSuggestionCounter_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "CountingConfig" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "best" INTEGER NOT NULL DEFAULT 0,
    "lastUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountingConfig_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "ModmailConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModmailConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ModmailThread" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedSubscription" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT,
    "lastItemId" TEXT,
    "mention" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Starboard" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "emojis" TEXT[] DEFAULT ARRAY['⭐']::TEXT[],
    "requiredStars" INTEGER NOT NULL DEFAULT 3,
    "removeStars" INTEGER,
    "selfStar" BOOLEAN NOT NULL DEFAULT false,
    "filterBots" BOOLEAN NOT NULL DEFAULT true,
    "syncDeletes" BOOLEAN NOT NULL DEFAULT true,
    "rewardRoleId" TEXT,
    "rewardStars" INTEGER NOT NULL DEFAULT 0,
    "authorRoleId" TEXT,
    "ignoredChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "blacklistUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blacklistRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blacklistChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelistUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelistRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelistChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "downvoteEmojis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removeInvalid" BOOLEAN NOT NULL DEFAULT false,
    "minChars" INTEGER NOT NULL DEFAULT 0,
    "minAttachments" INTEGER NOT NULL DEFAULT 0,
    "requireImage" BOOLEAN NOT NULL DEFAULT false,
    "maxMessageAgeHours" INTEGER NOT NULL DEFAULT 0,
    "requireNsfwChannel" BOOLEAN NOT NULL DEFAULT false,
    "displayTiers" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Starboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarboardOverride" (
    "id" TEXT NOT NULL,
    "starboardId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requiredStars" INTEGER,
    "removeStars" INTEGER,
    "selfStar" BOOLEAN,
    "filterBots" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarboardOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarboardEntry" (
    "id" TEXT NOT NULL,
    "starboardId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "starboardMessageId" TEXT,
    "authorId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutostarChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "emojis" TEXT[] DEFAULT ARRAY['⭐']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutostarChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "AutomodRule_guildId_idx" ON "AutomodRule"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomodRule_guildId_name_key" ON "AutomodRule"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_userId_idx" ON "Ticket"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");

-- CreateIndex
CREATE INDEX "EconomyUser_guildId_idx" ON "EconomyUser"("guildId");

-- CreateIndex
CREATE INDEX "ShopItem_guildId_idx" ON "ShopItem"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_guildId_name_key" ON "ShopItem"("guildId", "name");

-- CreateIndex
CREATE INDEX "InventoryItem_guildId_userId_idx" ON "InventoryItem"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_guildId_userId_itemName_key" ON "InventoryItem"("guildId", "userId", "itemName");

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
CREATE INDEX "StatsChannel_guildId_idx" ON "StatsChannel"("guildId");

-- CreateIndex
CREATE INDEX "RepUser_guildId_idx" ON "RepUser"("guildId");

-- CreateIndex
CREATE INDEX "StickyMessage_guildId_idx" ON "StickyMessage"("guildId");

-- CreateIndex
CREATE INDEX "Highlight_guildId_idx" ON "Highlight"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Highlight_guildId_userId_word_key" ON "Highlight"("guildId", "userId", "word");

-- CreateIndex
CREATE INDEX "TriviaScore_guildId_idx" ON "TriviaScore"("guildId");

-- CreateIndex
CREATE INDEX "Tag_guildId_idx" ON "Tag"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_guildId_idx" ON "Reminder"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- CreateIndex
CREATE INDEX "Poll_guildId_idx" ON "Poll"("guildId");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");

-- CreateIndex
CREATE INDEX "Suggestion_guildId_idx" ON "Suggestion"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_guildId_number_key" ON "Suggestion"("guildId", "number");

-- CreateIndex
CREATE INDEX "SuggestionVote_suggestionId_idx" ON "SuggestionVote"("suggestionId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVote_suggestionId_userId_key" ON "SuggestionVote"("suggestionId", "userId");

-- CreateIndex
CREATE INDEX "CountingConfig_guildId_idx" ON "CountingConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ModmailThread_channelId_key" ON "ModmailThread"("channelId");

-- CreateIndex
CREATE INDEX "ModmailThread_guildId_idx" ON "ModmailThread"("guildId");

-- CreateIndex
CREATE INDEX "ModmailThread_userId_idx" ON "ModmailThread"("userId");

-- CreateIndex
CREATE INDEX "FeedSubscription_guildId_idx" ON "FeedSubscription"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedSubscription_guildId_type_sourceId_key" ON "FeedSubscription"("guildId", "type", "sourceId");

-- CreateIndex
CREATE INDEX "Starboard_guildId_idx" ON "Starboard"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Starboard_guildId_name_key" ON "Starboard"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Starboard_guildId_channelId_key" ON "Starboard"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "StarboardOverride_starboardId_idx" ON "StarboardOverride"("starboardId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardOverride_starboardId_name_key" ON "StarboardOverride"("starboardId", "name");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_idx" ON "StarboardEntry"("guildId");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_authorId_idx" ON "StarboardEntry"("guildId", "authorId");

-- CreateIndex
CREATE INDEX "StarboardEntry_starboardId_idx" ON "StarboardEntry"("starboardId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_starboardId_messageId_key" ON "StarboardEntry"("starboardId", "messageId");

-- CreateIndex
CREATE INDEX "AutostarChannel_guildId_idx" ON "AutostarChannel"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AutostarChannel_guildId_channelId_key" ON "AutostarChannel"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "ScheduledTask_runAt_idx" ON "ScheduledTask"("runAt");

-- CreateIndex
CREATE INDEX "ScheduledTask_guildId_idx" ON "ScheduledTask"("guildId");

-- AddForeignKey
ALTER TABLE "GuildModuleConfig" ADD CONSTRAINT "GuildModuleConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVote" ADD CONSTRAINT "UserVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVote" ADD CONSTRAINT "SuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardOverride" ADD CONSTRAINT "StarboardOverride_starboardId_fkey" FOREIGN KEY ("starboardId") REFERENCES "Starboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardEntry" ADD CONSTRAINT "StarboardEntry_starboardId_fkey" FOREIGN KEY ("starboardId") REFERENCES "Starboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
