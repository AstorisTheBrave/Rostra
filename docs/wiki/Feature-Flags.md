# Feature flags

The owner module exposes global feature flags through `/owner feature list` and `/owner feature set`.
Flags are declared by modules, default to their declared state, and can be overridden in PostgreSQL. A
change publishes an update through the Redis control bus so connected gateway processes can apply it
without a restart. This is a whole-bot control, not a per-guild permission setting.

The current code is the authority for which flags exist. For current deployment prerequisites and limits,
see the [capability status](../product/capability-status.mdx),
[environment reference](../infrastructure/env.mdx), and [deployment runbook](../runbooks/deployment.mdx).
