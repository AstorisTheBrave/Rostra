# Creating Your Bot Application

Before you can host Rostra, you need a Discord application and a bot token. This is free and takes a few
minutes. You do this once.

## 1. Open the Developer Portal

Go to https://discord.com/developers/applications and log in with your Discord account.

## 2. Create the application

Click **New Application**, give it a name (this is the bot's name), agree to the terms, and click Create.

## 3. Get the Application ID

On the **General Information** page, find **Application ID** and click Copy. Save it somewhere. This is your
`DISCORD_CLIENT_ID`.

## 4. Get the bot token

1. Click **Bot** in the left menu.
2. Click **Reset Token**, confirm, and then **Copy**. Save it somewhere safe.
3. This is your `DISCORD_TOKEN`. Treat it like a password. Never share it or commit it to a public place.
   If it ever leaks, reset it here.

## 5. Turn on the required permissions to read events

Still on the **Bot** page, scroll to **Privileged Gateway Intents** and turn on:

- **Server Members Intent**
- **Message Content Intent**
- **Presence Intent** (only needed if you want vanity status roles)

Click Save. Without these, some features cannot see members or message text.

## 6. Get your own user ID (for owner commands)

In Discord, enable Developer Mode (User Settings, Advanced, Developer Mode). Then right click your own name
and choose **Copy User ID**. This is your `OWNER_IDS` value. It lets you use owner only commands.

## 7. Invite the bot to your server

1. In the Developer Portal, click **OAuth2**, then **URL Generator**.
2. Under **Scopes**, tick **bot** and **applications.commands**.
3. Under **Bot Permissions**, tick **Administrator** for the simplest setup (or pick the specific
   permissions from [[Permissions and Intents]] if you prefer least privilege).
4. Copy the generated URL at the bottom, open it in your browser, choose your server, and click Authorize.

The bot now appears in your server (offline until you host it).

## What you should have now

- `DISCORD_CLIENT_ID` (the Application ID)
- `DISCORD_TOKEN` (the bot token, kept secret)
- `OWNER_IDS` (your user ID)

Next: pick a way to host it in [[Self-Hosting]].
