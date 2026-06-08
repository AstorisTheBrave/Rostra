# Contributing

Thanks for wanting to help. This page is a quick map of the project for code contributors.

## Tech stack

Node.js 20+, TypeScript (strict, no `any`), discord.js v14, Prisma with PostgreSQL, Redis, Pino, Zod,
Fastify, and Biome for lint and format. ESM only.

## Project shape

- `src/modules/<name>/` is one self contained feature, exporting commands, events, interactions, jobs, and
  i18n. Modules do not import each other's internals, only shared services, utils, and types.
- `src/services/` holds the platform: database, cache, the localization service, the control bus, feature
  flags, leader election, and the scheduler.
- `src/ui/` is the single source of truth for the interface. All UI is built from here using Components V2;
  modules never build raw discord.js components.
- `src/i18n/` is the localization engine. Every user facing string goes through the `t()` helper.
- `prisma/schema.prisma` is the data model.

## Conventions

- Commands are slash only, namespaced under one top level command per module with subcommands.
- Every user facing string goes through `t()` for localization.
- Database access goes through `getPrisma()`, config through the validated `config`, never raw environment
  reads.
- No em dashes in user facing text, docs, or commit messages. Conventional commits.

## Local development

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
npm run lint:fix
npm run test:env
```

All three must pass. Add a `*.test.ts` next to any pure logic you write.

## How to add a feature behind a flag

New features can ship dormant and be turned on live. Register a flag at module import with a default of off,
gate the feature on `isFeatureLive("name")`, and the owner can switch it on with `/owner feature set`. See
[[Feature Flags]].

## Links

- Contributing guidelines: the `CONTRIBUTING.md` file in the repository
- Issues: https://github.com/AstorisTheBrave/Rostra/issues
- Discussions: https://github.com/AstorisTheBrave/Rostra/discussions
- Translations: [[Translating Rostra]]
