# Setup Guide

New to Rostra? This gets your server running in a few minutes. It assumes the bot is already in your server
(if you self host, see [[Getting Started]] first).

## 1. Open the setup panel

Run:

```
/setup wizard
```

You get a panel where you can toggle systems on or off and apply a recommended baseline with one click. The
baseline turns on the core safety systems (auto moderation, logging, welcome, and antinuke).

## 2. Set your server language

```
/setup language
```

Pick from 16 languages. Every bot message in your server now uses it. Members can also set their own
language with `/preferences language`, which takes priority in their DMs and personal replies.

## 3. Pick what you want

Rostra is modular. Common starting points:

- Safety: see [[Moderation and Security]]
- Fun and engagement: see [[Engagement]]
- Greeting new members: `/welcome setup`
- Support: `/ticket` for ticket channels, `/modmail setup` for DM to staff

You only enable what you want. Anything you do not turn on stays out of the way.

## 4. Give the bot the right permissions

For best results, give Rostra a role high in your role list with the permissions it needs (Manage Roles,
Manage Channels, Ban Members, Kick Members, Moderate Members, Manage Messages). Many features fail silently
if the bot's role is below the roles or members it needs to act on.

## 5. Explore commands

```
/help
```

This shows every command grouped by category, with descriptions in your language. Use the dropdown to
browse, or the language selector to switch on the spot.

## Next steps

- [[Moderation and Security]]
- [[Engagement]]
- [[FAQ]] if something is not working
