# Rostra

Rostra is my open-source Discord bot for communities that would rather manage one capable bot than a stack of smaller ones. It brings moderation, server safety, tickets, member engagement, games, music and everyday utilities together behind slash commands.

I am building Rostra in public. The Discord bot is the established product. The workspace also contains API routes, a web login with read-only guild summaries, and durable workers; their tested boundaries and limits are listed in the [capability status](docs/product/capability-status.mdx).

## What Rostra can do

- **Moderate and protect:** moderation cases, audit logging, anti-raid controls and configurable automoderation.
- **Support members:** tickets, modmail, applications, welcome flows and verification.
- **Keep a community active:** leveling, economy, giveaways, polls, suggestions, trivia, games and music.
- **Handle the everyday work:** role menus, feeds, reminders, server information and other utilities.
- **Run across shards:** native sharding is the default. Optional hybrid process-mode code exists, but live Discord behavior and production capacity have not been verified.

The command and module move has parity fixtures for 47 commands, 42 modules and 48 events. That proves the extracted registry still matches its recorded baseline; it does not mean every optional app or planned capability is production-ready. See [what works today](docs/product/capability-status.mdx) and [the roadmap](docs/product/roadmap.mdx).

## Current status

The gateway is the working Discord runtime. The API and workers have authenticated boundaries and durable queue contracts. The web app has a Discord login flow and persisted, read-only guild summaries. Realtime and Activity are authenticated scaffolds and are disabled in the default runtime.

The browser and service flows have local automated evidence, and Linux Compose smoke is configured and has passed in the implementation environment. GitHub CI, the prior-image rollback rehearsal, multi-image builds, browser matrix, dependency review, secret scanning, SBOM and CodeQL are **pending remote verification** for the Phase 00 branch. The [Phase 00 evidence index](docs/phase-reports/phase-00/index.mdx) states what has and has not been proved.

There is no published product screenshot yet. I am leaving the README image-free until there is a suitable capture from the implemented app with deterministic fake data.

## Architecture

The Discord gateway owns sharding and interaction routing. Features live in `modules/`; shared contracts and services live in `packages/`. The API handles authenticated domain and webhook requests. Workers process durable work recorded in PostgreSQL and delivered at least once through Redis. The web app uses a typed API client and does not connect to the database directly.

PostgreSQL is required. Redis is used for shared cache, coordination and queue delivery; a local in-memory fallback exists for some non-production paths, but it is not a production substitute for the shared queue. Web sessions currently live in process memory, so multiple web replicas are not supported. See the [architecture map](docs/architecture/index.mdx) for boundaries and [recovery guide](docs/runbooks/recovery.mdx) for data and rollback limits.

## Run the bot locally

You need Node.js `22.22.2+` or `24.15.0+` (or a supported later major), Corepack 0.35.0, PostgreSQL, and a Discord application. Redis is recommended for local development and required for shared queue behavior. Detailed setup and checks are in [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/AstorisTheBrave/Rostra.git
cd Rostra
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `DATABASE_URL`, `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in `.env`; set `REDIS_URL` when using Redis. Then:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm deploy:commands
pnpm start
```

`pnpm deploy:commands` publishes slash-command definitions to Discord. Use a development application or guild when setting up; do not run it as part of migration or verification checks. Database migrations use a direct PostgreSQL connection. For disposable local services, profiles, and production image pinning, follow the [deployment runbook](docs/runbooks/deployment.mdx).

## Configuration and operations

Configuration is validated centrally. Start with [`.env.example`](.env.example) and the [environment reference](docs/infrastructure/env.mdx). Do not commit `.env` or production credentials.

Compose deployment, upgrade, shutdown and passive reverse-proxy guidance is in the [deployment runbook](docs/runbooks/deployment.mdx). Backup, forward-migration rollback and restore limits are in the [recovery runbook](docs/runbooks/recovery.mdx). These guides do not provision hosting, storage, TLS or ingress resources.

## Documentation

- [Capability status](docs/product/capability-status.mdx) and [roadmap](docs/product/roadmap.mdx)
- [Architecture map](docs/architecture/index.mdx) and [workspace overview](docs/overview.mdx)
- [Phase 00 evidence](docs/phase-reports/phase-00/index.mdx)
- [Module guides](docs/modules/)
- [Deployment](docs/runbooks/deployment.mdx), [recovery](docs/runbooks/recovery.mdx) and [environment variables](docs/infrastructure/env.mdx)
- [Contributing](CONTRIBUTING.md), [security policy](SECURITY.md) and [changelog](CHANGELOG.md)

## Security

Please report vulnerabilities privately using the instructions in [SECURITY.md](SECURITY.md), rather than in a public issue. Guild permissions are checked within the guild boundary; a host operator does not get automatic access to guild moderation or private member data.

## Contributing

Issues, documentation fixes and focused code contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Changes go through a pull request and the required checks. The Phase 00 implementation is still awaiting its remote CI and review evidence; local success alone does not complete the phase.

## Roadmap

Rostra's next work is tracked in the [roadmap](docs/product/roadmap.mdx). Later phases will replace the temporary module compatibility loader and deepen feature ownership, authorization coverage and web operations. They are planned work, not shipped capabilities.

## License

[MIT](LICENSE) © AstorisTheBrave
