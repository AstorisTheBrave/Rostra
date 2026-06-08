# Hosting with Docker

This is the easiest way to run Rostra. Docker starts the bot, its database, and Redis together for you, so
you do not have to install or configure them yourself. You need your bot token first: see
[[Creating Your Bot]].

## 1. Install Docker

- Windows or Mac: download and install **Docker Desktop** from https://www.docker.com/products/docker-desktop.
  Open it once so it is running.
- Linux: run `curl -fsSL https://get.docker.com | sh` then `sudo usermod -aG docker $USER` and log out and
  back in.

To check it works, open a terminal and run `docker --version`. You should see a version number.

## 2. Get the code

Two options:

- Easiest: open https://github.com/AstorisTheBrave/Rostra, click the green **Code** button, choose **Download
  ZIP**, and unzip it.
- Or with git: `git clone https://github.com/AstorisTheBrave/Rostra`

Open a terminal in that folder (the one with `docker-compose.yml` in it).

## 3. Create your settings file

In that folder, create a file named exactly `.env` (yes, starting with a dot). Put this inside, with your
own values from [[Creating Your Bot]]:

```
DISCORD_TOKEN=paste-your-bot-token-here
DISCORD_CLIENT_ID=paste-your-application-id-here
OWNER_IDS=paste-your-user-id-here
```

You do not need to set the database or Redis. Docker sets those up automatically.

## 4. Start everything

In the terminal, run:

```
docker compose up -d --build
```

The first time takes a few minutes while it downloads and builds. After that, Rostra:

- creates its database tables automatically,
- registers its slash commands with Discord,
- comes online in your server.

Wait a minute, then check Discord. The bot should show as online.

## 5. Invite and set up

If you have not invited the bot yet, follow step 7 in [[Creating Your Bot]]. Then run `/setup wizard` in your
server. See the [[Setup Guide]].

## Everyday commands

- See the logs (useful if something is wrong): `docker compose logs -f bot`
- Stop the bot: `docker compose down`
- Start it again: `docker compose up -d`
- Update to the latest version: download or `git pull` the new code, then `docker compose up -d --build`

## Music (optional)

Music needs a Lavalink audio node. The compose file has one ready but commented out. To enable it, open
`docker-compose.yml`, remove the `#` in front of the `lavalink` lines, set `LAVALINK_NODES` in your `.env`
(ask in Discussions if you need the exact value), and run `docker compose up -d --build` again. Everything
else works without it.

## Troubleshooting

- Bot stays offline: check `docker compose logs -f bot` for errors, usually a wrong token.
- Commands do not appear: they can take up to an hour the first time. Try typing `/` and looking for Rostra.
- See the [[FAQ]] for more.
