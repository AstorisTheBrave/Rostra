# Hosting on a VPS

Your home computer is not always on, so the bot goes offline when it is off or asleep. A VPS is a small
computer you rent in the cloud that runs all the time. This guide gets Rostra running on one, even if you
have never used a server before. It uses Docker, which does the hard parts for you.

You need your bot token first: see [[Creating Your Bot]].

## 1. Rent a VPS

Pick any VPS provider you like. A small plan with **1 GB of RAM or more** is enough to start. When asked for
an operating system, choose **Ubuntu** (a recent version like 22.04 or 24.04). The provider gives you an IP
address and a way to log in.

## 2. Connect to it

From your own computer's terminal:

```
ssh root@YOUR_SERVER_IP
```

Enter the password (or use the key) your provider gave you. You are now typing commands on the server.

## 3. Install Docker on the server

```
curl -fsSL https://get.docker.com | sh
```

Wait for it to finish. Check it worked with `docker --version`.

## 4. Get the code

```
git clone https://github.com/AstorisTheBrave/Rostra
cd Rostra
```

## 5. Create your settings file

Create the `.env` file:

```
nano .env
```

Paste this, with your own values from [[Creating Your Bot]]:

```
DISCORD_TOKEN=paste-your-bot-token-here
DISCORD_CLIENT_ID=paste-your-application-id-here
OWNER_IDS=paste-your-user-id-here
```

Press Ctrl+O then Enter to save, and Ctrl+X to exit. You do not need to set the database or Redis; Docker
handles those.

## 6. Start it

```
docker compose up -d --build
```

The first build takes a few minutes. Rostra then creates its database, registers its commands, and comes
online. It is set to restart automatically, so it survives crashes and server reboots.

## 7. Invite and set up

Invite the bot (step 7 in [[Creating Your Bot]]) and run `/setup wizard` in your server. See the
[[Setup Guide]].

## Keeping it running and updating

- See logs: `docker compose logs -f bot`
- Update later: `git pull` then `docker compose up -d --build`
- Stop: `docker compose down`

Because of `restart: unless-stopped` in the compose file, the bot comes back on its own after a reboot, so
you do not need to do anything to keep it online.

## Tips

- Keep your `.env` private. Anyone with your token controls your bot.
- 1 GB RAM is fine for a single small bot. If you run many servers or use music, give it more.
- For scaling to very large numbers of servers, see [[Hybrid Sharding]].
