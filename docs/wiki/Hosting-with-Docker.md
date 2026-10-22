# Hosting with Docker

Rostra runs from the Compose files in `infra/compose/`. Before exposing the service, configure
`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `INTERNAL_API_TOKEN`, and a random
`WEB_SESSION_SECRET` of at least 32 characters in a restricted `.env` file. The development overlay
binds the web, PostgreSQL, and Redis ports to loopback. Do not reuse production credentials locally.

Validate and start the development profile from the repository root:

```sh
docker compose --env-file .env -f infra/compose/compose.yml -f infra/compose/compose.dev.yml config --quiet
docker compose --env-file .env -f infra/compose/compose.yml -f infra/compose/compose.dev.yml up -d --build
docker compose --env-file .env -f infra/compose/compose.yml -f infra/compose/compose.dev.yml ps
```

The default profile contains PostgreSQL, Redis, gateway, API, workers, and web. Realtime and Activity
are disabled unless their named profiles are enabled. The startup wrapper applies migrations using a
direct PostgreSQL connection and fails closed if they do not succeed. Use the
[deployment runbook](../runbooks/deployment.mdx) for immutable VPS images, startup behavior, and
routine operations. Read the [recovery runbook](../runbooks/recovery.mdx) before production upgrades;
never remove storage volumes as a rollback step.
