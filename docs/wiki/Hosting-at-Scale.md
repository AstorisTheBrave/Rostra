# Hosting at Scale

This page is for the technical track: running Rostra on your own server, with native sharding, when you are
past a few servers and heading toward hundreds of thousands or a million. If you just want it online with no
fuss, use [[Easy Hosting]] instead.

You should already be comfortable with a Linux terminal, SSH, and Docker. If not, start with
[[Hosting on a VPS]], which holds your hand through the basics, then come back here.

## The shape of a scaled deployment

At scale, Rostra runs as several shard processes that share one PostgreSQL database and one Redis. Redis is
not optional here: it is the control bus that makes clustering, leaderboards, and zero restart changes work.

- Bot: one or more cluster processes, each running a slice of the shards. See [[Hybrid Sharding]].
- PostgreSQL: a single, properly sized database.
- Redis: a single instance reachable by every cluster process.

The relevant settings from [[Environment Variables]]:

| Variable | Use |
| --- | --- |
| `SHARDING_MODE` | `native` (default) or `hybrid` for clustering across processes or machines. |
| `TOTAL_SHARDS` | Total shard count. Leave unset to let Discord decide. |
| `SHARDS_PER_CLUSTER` | Hybrid only: how many shards each cluster process owns. |

Discord asks for roughly one shard per 2,500 guilds, so a million guilds is in the hundreds of shards. Plan
memory and CPU around that, and read [[Hybrid Sharding]] before you size anything.

## Compute: rent the server

You want a VPS or dedicated box you control, not a per app platform, because you are running long lived
sharded processes and your own databases.

| Provider | Why | Roughly |
| --- | --- | --- |
| [Hetzner](https://www.hetzner.com) | best raw value, strong EU network | a 2 vCPU / 4 GB box around 4 to 5 USD a month |
| [DigitalOcean](https://www.digitalocean.com) | broad managed services, great docs | a comparable box around 24 USD a month |
| [Vultr](https://www.vultr.com/?ref=9905575) | many regions, simple pricing | between the two |

Hetzner is roughly half the price of US providers for the same specs, which matters when you scale up. The
trade off is that Hetzner has no managed database service, so you either run Postgres and Redis in Docker on
the same box (fine to start) or pair it with a managed database (below). DigitalOcean costs more but offers
managed Postgres and Redis if you would rather not run them yourself.

Start on one box running everything with Docker, exactly like [[Hosting on a VPS]] but on a larger plan.
Split databases onto their own machines only when one box is no longer enough.

## Databases: self run or managed

- Self run (cheapest): Postgres and Redis in the same Docker stack on your VPS. Good until you need
  redundancy or you are saturating one machine.
- Managed Postgres: [Neon](https://neon.com) has a generous free tier and scales up cleanly. Good when you
  want backups and scaling handled for you.
- Managed Redis: [Upstash](https://upstash.com) has a free tier and pay as you go pricing. Good when you do
  not want to operate Redis yourself.

A common growth path: start all in one on Hetzner, then move Postgres to a managed provider first (it is the
stateful part you least want to babysit), and keep Redis on the box or on Upstash.

## Going from one box to many

1. Run all in one on a single VPS with Docker. Set `SHARDING_MODE=native` and let shard count auto size.
2. When memory gets tight, switch to `SHARDING_MODE=hybrid` and tune `SHARDS_PER_CLUSTER`. See
   [[Hybrid Sharding]].
3. Move PostgreSQL and Redis off the bot box so the databases are not competing with shards for memory.
4. Add more cluster machines, all pointed at the same Postgres and Redis.

Ship risky changes dormant and flip them per server with [[Feature Flags]], and roll out new versions with
[[Deploying]] so you never take the whole fleet down at once.

## Costs at a glance

- Hobby to mid size, one VPS, all in one: a single Hetzner or similar box, a few dollars a month.
- Growth, databases split off: VPS plus managed Postgres and Redis, low tens of dollars a month.
- Large fleet: several cluster machines plus a sized managed Postgres, scaling with your guild count.

## A note on the links above

Some of the provider links on this page (currently Vultr) carry a referral code, so the bot maintainer may
earn a credit at no extra cost to you, and it never changes your price. Prefer to skip it? Search the
provider name and sign up directly. The instructions are the same.

## Next steps

- [[Hybrid Sharding]] - clustering across processes and machines
- [[Deploying]] - blue green and rolling deploys
- [[Feature Flags]] - flip features without a restart
- [[Hosting with Docker]] - the Docker stack these steps build on
- [[Environment Variables]] - every setting explained
