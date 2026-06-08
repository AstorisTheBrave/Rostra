# Permissions and Intents

Most problems where a feature does nothing come down to permissions or role position. This page is the
quick reference.

## Role position

Rostra can only act on roles and members that are below its own highest role. Put Rostra's role high in
Server Settings, Roles. This affects bans, kicks, timeouts, role rewards, autoroles, reaction roles, and
nickname changes.

## Permissions by feature

| Feature | Permissions the bot needs |
| --- | --- |
| Moderation (ban, kick, timeout) | Ban Members, Kick Members, Moderate Members |
| Auto moderation | Manage Messages, Moderate Members |
| Antinuke and anti raid | View Audit Log, Ban Members, Kick Members, Manage Guild |
| Logging | View Audit Log, Read Message History |
| Tickets | Manage Channels |
| Modmail | Create Public Threads, Send Messages |
| Roles (rewards, autorole, reaction roles, voice roles, bulk role) | Manage Roles |
| Starboard | Read Message History, Send Messages, Add Reactions |
| Server stats channels | Manage Channels |
| Welcome and greetings | Send Messages (Manage Roles for autorole) |
| Steal emoji | Manage Expressions |
| Music | Connect, Speak |

When in doubt, a role with Administrator works, but the list above is the least privilege set.

## Privileged intents

Enable these for the bot in the Discord Developer Portal, Bot tab:

- **Server Members**: needed for welcome, autorole, anti raid, and member logging.
- **Message Content**: needed for auto moderation, counting, highlights, autoresponders, and anything that
  reads message text.
- **Presence**: only needed for vanity status roles.

If you do not enable Message Content, content based features will not see message text.

## Channel level overrides

Discord channel permission overrides can block the bot even if the role looks correct. If a feature works in
one channel but not another, check that channel's permission overrides for the bot or its role.
