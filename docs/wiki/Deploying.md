# Deploying Rostra

Use the current [deployment runbook](../runbooks/deployment.mdx) for the supported Compose profiles,
configuration, rollout and verification steps. Use the [recovery runbook](../runbooks/recovery.mdx) for
restore and rollback procedures.

The old version of this page conflated implemented mechanisms with deployment guarantees. Gateway command
sync is hash-gated, and the owner feature-flag control is implemented, but this does not establish a
zero-downtime blue-green or rolling deployment procedure. See [feature flags](Feature-Flags.md) for that
specific control and the [capability status](../product/capability-status.mdx) for evidence boundaries.
Rostra does not manage a hosting provider's ingress or control plane. A passive reverse proxy or tunnel can
route traffic to the documented app endpoints; configure and secure that infrastructure independently.
