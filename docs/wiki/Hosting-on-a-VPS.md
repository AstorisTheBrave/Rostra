# Hosting Rostra on a VPS

Rostra's supported self-hosting path is documented in the [deployment runbook](../runbooks/deployment.mdx).
It covers the Compose profiles and required configuration. Check the repository [README](../../README.md)
for the product and development quick start, and the [environment reference](../infrastructure/env.mdx)
for configuration ownership.

The previous version of this page assumed a single bot container, a 1 GB host, automatic schema setup,
and automatic Discord command publication. Those claims do not match the current multi-service repository
and have been removed. Choose host capacity based on the documented service limits and your measured
workload. Do not expose databases, Redis, or internal app ports directly to the public internet.

Rostra supports passive reverse proxies and tunnels as documented, but does not provision or manage an
ingress provider. For restoring data or returning to a prior image, use the
[recovery runbook](../runbooks/recovery.mdx).
