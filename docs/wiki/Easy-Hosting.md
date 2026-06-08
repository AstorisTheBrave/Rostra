# Easy Hosting

This is the no hassle way to get Rostra online. No terminal, no Linux, no Docker commands. You click a few
buttons on a hosting website and the bot runs 24/7. If that is what you want, you are on the right page.

If you would rather run it yourself, or you are growing past a few servers, see [[Hosting Rostra]] for the
technical paths.

You still need a bot token first. That part is the same for everyone: see [[Creating Your Bot]].

## What a managed host gives you

Rostra needs three things: the bot, a PostgreSQL database, and Redis. A managed host can provide all three
in one place, so you never install a database yourself. You point it at Rostra, add two database add ons,
paste a few settings, and it stays online.

The only settings you must paste are the ones from [[Environment Variables]]:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
OWNER_IDS=your-user-id
```

The host fills in `DATABASE_URL` and `REDIS_URL` for you when you add its Postgres and Redis add ons.

## Pick a host

| Host | Best for | Roughly | Notes |
| --- | --- | --- | --- |
| Railway | the easiest start | about 5 USD a month | Built in Postgres and Redis with one click. Deploys straight from GitHub. |
| PebbleHost | cheap and supported | a few USD a month | Friendly support, made for bot and game hosting. |
| Fly.io | a free leaning option | 0 to a few USD | A bit more technical, needs their command line tool. |

For most people with a handful of servers, Railway is the simplest. PebbleHost is the budget pick with real
human support. Fly.io has a free leaning tier but expects a little more comfort with tools.

## Railway, step by step

1. Sign in at Railway with your GitHub account.
2. Click **New Project**, then **Deploy from GitHub repo**, and choose your fork of Rostra. If you have not
   forked it yet, fork `https://github.com/AstorisTheBrave/Rostra` on GitHub first.
3. In the project, click **New**, then **Database**, and add **PostgreSQL**. Repeat and add **Redis**.
   Railway wires `DATABASE_URL` and `REDIS_URL` into your bot automatically.
4. Open the bot service, go to **Variables**, and add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `OWNER_IDS`
   with your own values.
5. Railway builds and starts the bot. Rostra creates its database tables and registers its commands on first
   start, so there is nothing else to run.
6. Invite the bot and run `/setup wizard` in your server. See the [[Setup Guide]].

To update later, push to your GitHub fork (or click **Redeploy**) and Railway rebuilds.

## PebbleHost, step by step

1. Buy a **Bot Hosting** plan at PebbleHost and open the client area panel.
2. Upload Rostra, or point the panel at the GitHub repo, and set the start command the panel asks for (a
   Node start). PebbleHost docs walk through both.
3. Add a **PostgreSQL** database and a **Redis** instance from the panel, then copy their connection URLs
   into `DATABASE_URL` and `REDIS_URL`.
4. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `OWNER_IDS` in the panel's startup or environment section.
5. Start it, then run `/setup wizard` in your server. See the [[Setup Guide]].

If you get stuck, PebbleHost support is responsive and used to Discord bots.

## How big can this go

Easy hosting on a single instance comfortably covers a personal bot in 10 to 20 servers. When you outgrow
that, or you want native sharding across machines for hundreds of thousands of servers, move to the
technical track: [[Hosting Rostra]] and [[Hybrid Sharding]].

## A note on the referral links above

When you use the host links on this page, the bot maintainer may earn a small referral credit at no extra
cost to you. It never changes your price. If you would rather not, just search the host name and sign up
directly. Either way the setup steps are identical.

## Next steps

- [[Creating Your Bot]] - get your token first
- [[Setup Guide]] - configure features once the bot is online
- [[Commands]] - everything you can run
- [[FAQ]] - common questions and fixes
