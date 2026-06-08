# Feature Flags

Rostra has a fleet wide feature flag system so you can ship features dormant and turn them on or off live,
with no restart. It is also an instant kill switch: if a feature or an upstream dependency misbehaves, you
can disable it everywhere in seconds.

## How it works

- A feature registers a flag with a default state. New features ship with the default off (dormant), so the
  code is deployed but inactive until you switch it on.
- Flipping a flag writes to the database and publishes on the Redis control bus, so every shard and cluster
  applies the change in memory immediately.

## Owner commands

Only users in `OWNER_IDS` can use these.

- `/owner feature list` shows every registered flag, its default, and whether it is live.
- `/owner feature set <name> <enabled>` turns a feature on or off across the whole fleet, instantly.

## Example

The assistant command is gated on a flag. If your provider degrades:

```
/owner feature set ai off
```

The `/ask` command stops responding everywhere in seconds, with no restart. Turn it back on the same way
once the provider recovers.

## Why this matters at scale

With millions of users across many shards, you cannot restart the whole fleet to change behavior. Pushing
as much as possible into data (flags, translations, per server config) means most changes are instant and
safe. Only code changes need a deploy, and those use blue green or rolling. See [[Deploying]].
