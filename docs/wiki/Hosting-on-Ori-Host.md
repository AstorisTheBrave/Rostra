# Hosting on Ori Host

Ori Host is a cheap game style panel (Pterodactyl) that can run Rostra from a GitHub clone, with plans from
about 1 euro a month. It works, but it is fiddlier than the easy options because the panel gives you only a
Node.js container: no database and no Redis are included, and it does not build TypeScript for you. This page
gets you all the way there.

If you would rather not deal with any of this, the click and go hosts on [[Easy Hosting]] are simpler. For a
large bot, use [[Hosting on a VPS]] or [[Hosting at Scale]] instead.

## Before you start, you need

1. A bot token and application ID: see [[Creating Your Bot]].
2. A free PostgreSQL database and a Redis instance, because Ori does not provide them:
   - Postgres: make one at Neon (https://neon.com) and copy its connection string.
   - Redis: make one at Upstash (https://upstash.com) and copy its connection string.
3. A GitHub access token to let the panel clone the repo. Even though Rostra is public, Ori's egg requires a
   username and token. Make a read only one at GitHub, Settings, Developer settings, Personal access tokens.
   A fine grained token with read only Contents is enough.

## How it works

Rostra runs its TypeScript directly with a tool called tsx, with no separate build step. Plain `node` cannot
do that, and the panel cannot add secret settings in its interface. To bridge both gaps, the repo includes a
launcher named `panel-start.mjs`. You point the panel at that file. On start it loads your settings from a
`.env` file, prepares the database, and launches the bot.

## Step 1: create the server

In Ori, click **Create Server** and choose a **Node.js** option. In the server's **Startup** tab, set the
**Docker Image** to **Node.js 22** if it is offered (Node.js 25 also works).

## Step 2: fill in the Startup tab

Set these fields:

| Field | Value |
| --- | --- |
| Git Repo Address | `https://github.com/AstorisTheBrave/Rostra` (or your fork) |
| Install Branch | `main` |
| Username | your GitHub username |
| Access Token | the read only token you made above |
| MAIN_FILE | `panel-start.mjs` |

If you see an `AUTO_UPDATE` option, set it to `1` so the bot pulls the latest version each time it restarts.

The big Startup Command box does not need editing. The default already clones the repo, runs `npm install`,
and then runs your `MAIN_FILE`.

## Step 3: add your settings as a .env file

The panel has no place to type secret values, so you provide them in a file. Open the **Files** tab, create a
new file named exactly `.env`, and paste this, with your own values:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
OWNER_IDS=your-user-id
DATABASE_URL=your-neon-postgres-url
REDIS_URL=your-upstash-redis-url
LAVALINK_NODES=[]
```

`LAVALINK_NODES=[]` turns music off, which is the right choice unless you run an audio node. Every setting is
explained in [[Environment Variables]].

## Step 4: start it

Press **Start**. The first boot takes a few minutes: it clones the repo, installs packages, generates the
database client, applies the database tables, and then comes online. Later restarts are quick.

When it is running, invite the bot and run `/setup wizard` in your server. See the [[Setup Guide]].

## Choosing a plan

- Give it **at least 1 GB of RAM**, ideally 2 GB. The first install is memory hungry, and a crash with a
  `Killed` message during install means the plan is too small.
- A single small bot of 10 to 20 servers runs comfortably on a modest plan. This uses native sharding, the
  default, which is right for this size. You do not need hybrid clustering.

## Troubleshooting

| You see | What it means | Fix |
| --- | --- | --- |
| `Cannot find package '@/client'` | `node` is running the raw TypeScript without tsx | Set **MAIN_FILE** to `panel-start.mjs`, not `src/bot.ts` |
| `tsconfig.json needs import attribute of type json` | the panel is pointed at the wrong file | Same fix: **MAIN_FILE** is `panel-start.mjs` |
| `MAIN_FILE is not set. Skipping execution.` | the field is empty | Set **MAIN_FILE** to `panel-start.mjs` |
| `Skipping git operations, missing variables` | the clone fields are incomplete | Fill **Username** and **Access Token** in the Startup tab |
| `Killed` during `npm install` | the plan ran out of memory | Use a plan with 1 GB or more of RAM |
| `Database setup failed` | the database is unreachable | Check `DATABASE_URL` in your `.env` is correct and the Neon database is awake |
| `npm warn allow-scripts` | the panel blocked install scripts | Harmless. `panel-start.mjs` prepares the database itself |

## See also

- [[Easy Hosting]] - simpler click and go hosts
- [[Hosting on a VPS]] - more control, still cheap
- [[Environment Variables]] - every setting explained
- [[Creating Your Bot]] - get your token
- [[Glossary]] - plain language definitions
