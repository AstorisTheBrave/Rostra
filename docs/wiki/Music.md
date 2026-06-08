# Music

Play audio in a voice channel. Music uses Lavalink audio nodes, which the bot host configures. If music
commands do not work, ask your host whether a node is set up (self hosters set `LAVALINK_NODES`).

## Commands

```
/music play query:<song or url>
/music pause
/music resume
/music skip
/music stop
/music queue
/music nowplaying
/music volume percent:50
/music loop mode:<off | track | queue>
```

## How to use it

1. Join a voice channel.
2. Run `/music play` with a search term or a link.
3. The bot joins, plays, and queues anything else you add.

## Notes

- The bot needs permission to connect and speak in your voice channel.
- `query` accepts a search term or a direct link from supported sources.
- Looping can repeat the current track or the whole queue.
- Music depends on a healthy Lavalink node. If playback fails for everyone, the node may be down; this is a
  hosting concern, not a server setting.
