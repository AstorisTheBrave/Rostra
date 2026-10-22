# Hosting on Ori Host

A walkthrough for running Rostra on Ori Host, a cheap game style panel (Pterodactyl) with
plans from about 1 euro a month. It works well for a small bot, but it is fiddlier than the click and go
hosts because the panel gives you only a Node.js container: no database, no Redis, and it does not build
TypeScript for you. This page covers every step and every error people actually hit.

If you want zero hassle, use a managed host from [[Easy Hosting]] instead. For a large bot, use
[[Hosting on a VPS]] or [[Hosting at Scale]].

## How it works (read this first)

Rostra is TypeScript and runs through a tool called tsx, with no separate build step. Ori's panel just clones
your repo and runs `node <MAIN_FILE>`. Plain `node` cannot run the TypeScript or resolve Rostra's `@/` import
shortcut, and the panel has no field for secret settings like your bot token.

To bridge all of that, the repo ships a launcher at its root called `panel-start.mjs`. You point the panel at
that one file. On boot it:

1. loads your settings from a `.env` file you upload,
2. prepares the database (generates the client and applies tables),
3. starts the bot the correct way so `@/` imports resolve.

The single most important setting on this whole page is therefore **MAIN_FILE = `panel-start.mjs`**. Almost
every failure below is that field being wrong.

## What you need before you start

1. A bot token and application ID. See [[Creating Your Bot]].
2. A PostgreSQL database, because Ori does not include one. Make a free one at Neon (https://neon.com) and
   copy its connection string (it starts with `postgres://`).
3. A Redis instance, also not included. Make a free one at Upstash (https://upstash.com) and copy its
   connection string (it starts with `redis://` or `rediss://`).
4. A GitHub access token so the panel can clone the repo. Rostra is public, but Ori's egg still requires a
   username and token. At GitHub, go to Settings, Developer settings, Personal access tokens, and make a
   fine grained token with read only Contents permission.

## Step 1: create the server

In Ori, click **Create Server** and choose a **Node.js** plan. Give it **at least 1 GB of RAM**, ideally 2 GB.
The first install is memory hungry; too little RAM shows up as a `Killed` message during dependency installation.

## Step 2: set the Docker image

Choose a Node.js image satisfying `engines.node` in `package.json`, with Corepack 0.35.0 available.
Before starting, confirm the panel's dependency installer runs these commands from the checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
```

The installer must use the repository's pinned pnpm version, lockfile and workspace security overrides.
If the egg's installer is locked to another package manager, ask the host to change it or use the
[[Hosting on a VPS]] setup. Changing `MAIN_FILE` alone does not fix dependency installation.
This pnpm install path has been checked locally; installation on Ori's current panel is unverified.
See [CONTRIBUTING.md](https://github.com/AstorisTheBrave/Rostra/blob/main/CONTRIBUTING.md) for canonical setup.

## Step 3: fill the Startup tab fields

Still on the **Startup** tab. Leave the big **Startup Command** box exactly as it is; you do not edit it. It
is locked to the egg default, and that is correct. Fill these fields instead:

| Field | Value |
| --- | --- |
| Git Repo Address | `https://github.com/AstorisTheBrave/Rostra` (or your fork) |
| Install Branch | `main` |
| Username | your GitHub username |
| Access Token | the read only token from the prerequisites |
| MAIN_FILE | `panel-start.mjs` |

If there is an `AUTO_UPDATE` field, set it to `1` so the bot pulls the latest version on every restart.

> The `MAIN_FILE` field is usually further down the Startup tab under Environment Variables, separate from the
> Startup Command box. Set it to exactly `panel-start.mjs`. Not a gateway source file, not a path
> with folders. Just the file name. This is the field that breaks most setups.

## Step 4: add your settings as a .env file

The panel has no field for secret values, so you provide them in a file. Go to the **Files** tab, create a new
file named exactly `.env` (with the leading dot), and paste this, replacing each value with your own:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
OWNER_IDS=your-user-id
DATABASE_URL=your-postgres-url
DIRECT_URL=your-direct-postgres-url
REDIS_URL=your-upstash-redis-url
LAVALINK_NODES=[]
```

About the two database URLs: many hosted databases give you a **pooled** string and a **direct** string. Use
the pooled one for `DATABASE_URL` (the bot opens many connections) and the direct one for `DIRECT_URL`
(migrations need a direct connection). On Neon the direct URL is the host without `-pooler`. If your provider
only gives one URL, put it in both. Skipping `DIRECT_URL` on a pooled database causes the `P1002`
advisory-lock error in the troubleshooting table.

`LAVALINK_NODES=[]` turns music off, which is correct unless you run your own audio node. Every setting is
explained in [[Environment Variables]].

## Step 5: start it and watch the log

Press **Start**. The first boot takes a few minutes. A healthy boot looks like this, in order:

1. Git lines, ending in `Already up to date` or a pull summary.
2. `pnpm install --frozen-lockfile`, completing successfully with the pinned package-manager version.
3. **Prisma output**: lines like `Generated Prisma Client` and a migration summary. Seeing this is your proof
   that `panel-start.mjs` is running. If you do NOT see Prisma output, your MAIN_FILE is wrong (see below).
4. Rostra's own logs: `shard spawned`, then `shard logged in`, then `all shards spawned`.

Once it is running, invite the bot and run `/setup wizard` in your server. See the [[Setup Guide]].

## Step 6: updating later

With `AUTO_UPDATE=1` and the installer configured as above, restarting pulls the newest version, installs
from its frozen lockfile, reapplies any new database tables, and starts. Confirm the installer still uses
the pinned pnpm version after changing the panel image or egg.

## Troubleshooting

Match the message you see to the fix.

| You see | What it means | Fix |
| --- | --- | --- |
| `Cannot find package '@/config.ts'` or `@/client`, and no Prisma output above it | `node` is running the TypeScript directly, so `panel-start.mjs` never ran | Set **MAIN_FILE** to exactly `panel-start.mjs`. This is the number one cause. |
| No Prisma lines at all before the crash | the launcher is not in control | Same fix: MAIN_FILE must be `panel-start.mjs`, not an app source file |
| `tsconfig.json needs import attribute of type json` | the panel is pointed at the wrong file | Same fix: MAIN_FILE is `panel-start.mjs` |
| `MAIN_FILE is not set. Skipping execution.` | misleading. The egg prints this whenever the program exits non-zero, even when MAIN_FILE is set | Ignore this line. Read the real error above it |
| `Skipping git operations, missing variables` | the clone fields are incomplete | Fill **Username** and **Access Token** in the Startup tab |
| `Killed` during dependency installation | the plan ran out of memory | Use a plan with 1 GB of RAM or more |
| `Database setup failed. Check DATABASE_URL` | Postgres is unreachable | Check `DATABASE_URL` in `.env` is correct and the database is awake |
| `P1002` or `advisory lock` timeout | a pooled `DATABASE_URL` cannot hold a migration lock | The launcher already disables that lock, so just restart on the latest version. If it persists, add a direct `DIRECT_URL` |
| The installer uses a different package manager | it bypasses the frozen workspace install | Configure the installer from Step 2 before starting |

If MAIN_FILE genuinely reads `panel-start.mjs`, you see Prisma output, and it still fails, paste the full log
and a screenshot of the Startup tab so the exact panel state is visible.

## Why a VPS is calmer

Ori is cheap and works, but you are bringing your own database and babysitting a panel that was built for game
servers. If you want fewer moving parts for a similar price, a small cloud server with Docker handles the
database and Redis for you in one command. See [[Hosting on a VPS]].

## See also

- [[Easy Hosting]] - simpler click and go hosts
- [[Hosting on a VPS]] - more control, still cheap
- [[Environment Variables]] - every setting explained
- [[Creating Your Bot]] - get your token
- [[Glossary]] - plain language definitions
