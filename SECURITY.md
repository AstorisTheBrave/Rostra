# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Instead, report it privately via GitHub's **"Report a vulnerability"** button under the repository's
**Security** tab (Security advisories → Report a vulnerability). This opens a private channel with the
maintainers.

When reporting, please include:
- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version / commit

We'll acknowledge your report, investigate, and coordinate a fix and disclosure. Responsible disclosure is
appreciated and credited.

## Scope

In scope: the bot's source in this repository (command handling, permissions, data access, the web
endpoints, sharding/IPC). Out of scope: vulnerabilities in third-party services (Discord, Lavalink nodes,
hosting providers) and issues requiring a malicious server administrator acting within their own server.

## Hardening already in place

- Strict permission checks per command + role-hierarchy validation for moderation/antinuke actions.
- All input validated (Zod) and database access funneled through a single layer.
- Secrets only come from environment variables; none are committed.
- Rate-limiting / cooldowns and a global error boundary so a single failure can't crash a shard.
