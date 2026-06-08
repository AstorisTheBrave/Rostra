# FAQ and Troubleshooting

## The bot does not respond to commands

- Make sure slash commands are registered. They can take up to an hour to appear globally after the bot
  first joins. Try typing `/` and looking for Rostra's commands.
- Check the bot is online and has permission to view and send in the channel.

## A command says it is missing permissions

Rostra can only act on roles and members below its own highest role. Move Rostra's role up in Server
Settings, Roles, and make sure it has the permission the command needs (for example Ban Members for `/mod
ban`, Manage Roles for reward and autoroles).

## Moderation DMs are not sent

The target may have DMs from server members turned off, or may have opted out with `/preferences`. The
action still happens; only the notification is skipped.

## A feature is not working at all

Some features must be enabled first. Run `/setup wizard` and toggle the system on, or use the system's own
setup command (for example `/automod setup`, `/verification setup`, `/starboard create`).

## How do I change the language?

- Whole server: `/setup language`
- Just for you: `/preferences language`

If your language is not fully translated yet, missing text falls back to English. Translations are added
over time.

## Music does not play

Music needs a Lavalink audio node configured by the host. If you self host, set `LAVALINK_NODES`. If you use
a hosted instance, ask the operator whether music is enabled.

## I run the bot myself and something is broken

- Re run `npm run deploy:commands` after changing commands.
- Check `DATABASE_URL` and `REDIS_URL` are set and reachable.
- See [[Getting Started]] for setup and [[Deploying]] for updates without downtime.

## Where do I get help or report a bug?

- Open an issue: https://github.com/AstorisTheBrave/Rostra/issues
- Ask in Discussions: https://github.com/AstorisTheBrave/Rostra/discussions
