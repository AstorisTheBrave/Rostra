# Feeds and Notifications

Announce new content from around the web in a channel of your choice.

## Sources

```
/feeds youtube channel:<id, url, or @handle> post_to:#videos mention:@Subscribers
/feeds twitch streamer:<username> post_to:#live mention:@LiveNotify
/feeds reddit subreddit:<name> post_to:#reddit
/feeds rss url:<feed url> post_to:#news
```

- YouTube and Reddit and generic RSS work with no API keys.
- Twitch needs the host to configure Twitch credentials; if it is not set up, the command tells you.
- The optional mention pings a role when something new is posted.

## Managing feeds

```
/feeds list           # see every feed and its id
/feeds remove id:<id> # stop a feed
```

## How it works

A background poller checks each feed on a schedule and posts only items newer than when you added it, so
subscribing never floods your channel with old posts. YouTube and Twitch links expand to rich previews
automatically.

## Tips

- For a YouTube channel, the channel id (starts with UC) is the most reliable input, but a URL or @handle
  usually works too.
- Give the bot permission to send messages and mention roles in the target channel.
