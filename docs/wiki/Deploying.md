# Deploying

Rostra is designed so that most changes do not need a restart, and the changes that do use a deploy
strategy with little or no user visible downtime.

## Changes that are live, no restart

These apply across every shard and cluster instantly over the Redis control bus:

- Translations: `npm run i18n:push`
- Feature flags and kill switches: `/owner feature set <name> <on|off>`
- Per server settings and most content (tags, autoresponders, welcome text, thresholds)

## Changes that need a deploy (code)

New command handlers, bug fixes, and refactors are code, so they ship in a release. Two strategies:

### Blue green (recommended for breaking changes)

1. Run database migrations forward compatibly first (additive only).
2. Stand up a second fleet (green) on the new version next to the current fleet (blue). Both share the same
   database and Redis.
3. Verify green: health, shard ready counts, error rate.
4. Cut the gateway over to green; blue stops.
5. Soak, then retire blue. If anything is wrong, cut back to blue, which is still warm.

### Rolling per cluster (cheaper, for non breaking changes)

Restart one cluster at a time. Its shards resume in seconds while the rest of the fleet keeps serving, so
the bot is never fully down.

## Tips

- Keep migrations additive so blue and green can run against the same schema during a cutover.
- Command registration is hash gated, so a deploy with no command changes makes no extra Discord calls.
- See also [[Hybrid Sharding]] and [[Feature Flags]].
