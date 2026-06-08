# Self-Hosting

Hosting means running the bot on a computer that stays on, so it is online for your server. This page helps
you pick how, even if you have never done this before.

First, make sure you have created your bot and have your token. See [[Creating Your Bot]].

## What you need to run Rostra

Rostra needs three things to run: the bot itself, a PostgreSQL database (where it stores settings), and
Redis (a fast memory store). That sounds like a lot, but you do not have to install them separately. The
easiest method sets all three up for you with a single command.

## Choose how to host

### Easiest: Docker on your own computer or a server (recommended)

Docker is a tool that runs the bot and its database and Redis together in a self-contained box. You do not
need to know anything about databases. One command starts everything. This is the recommended path for
almost everyone.

Go to [[Hosting with Docker]].

### Always on: a VPS (a rented cloud computer)

Your home computer is not always on, and the bot goes offline when it is off. A VPS is a small computer you
rent in the cloud that runs all the time. You install Docker on it once, then follow the same steps. Cheap
options start around a few dollars a month.

Go to [[Hosting on a VPS]].

### For developers: run from source

If you are comfortable with Node.js and want to edit the code, you can run it directly without Docker. See
[[Getting Started]].

## Quick comparison

| Method | Good for | Stays online when your PC is off |
| --- | --- | --- |
| Docker on your PC | trying it out, learning | no |
| Docker on a VPS | a real always on bot | yes |
| From source | developers and contributors | depends on your setup |

## Recommended path for a beginner

1. [[Creating Your Bot]] to get your token.
2. [[Hosting on a VPS]] so the bot is always online, using Docker.
3. [[Setup Guide]] to configure features in your server.

If something does not work, see the [[FAQ]].
