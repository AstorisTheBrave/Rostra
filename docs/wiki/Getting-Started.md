# Getting started

Rostra is a modular Discord app with a web client, API, gateway, workers and PostgreSQL/Redis-backed
services. The repository root [README](../../README.md) is the current quick start. Contributors should
follow [CONTRIBUTING](../../CONTRIBUTING.md) for the supported toolchain and checks.

For local development, copy `.env.example` to `.env`, configure local credentials and services, then
follow the README commands. Do not use real Discord credentials for tests or migration verification.
The current environment reference is [here](../infrastructure/env.mdx).

For deployment, use the supported [Compose deployment guide](../runbooks/deployment.mdx) and
[recovery guide](../runbooks/recovery.mdx). Older wiki pages may describe the pre-migration application
and are not a supported deployment recipe.
