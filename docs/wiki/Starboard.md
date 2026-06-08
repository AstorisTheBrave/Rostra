# Starboard

Members react to a message with a star and, once it passes a threshold, the bot reposts it to a starboard
channel. Rostra supports many boards at once with rich per board settings.

## Create a board

```
/starboard create name:best channel:#starboard emojis:⭐
/starboard list
/starboard delete name:best
```

A guild can have several boards. A message can appear on more than one at the same time.

## Edit settings

```
/starboard edit name:best
   required_stars:5
   remove_stars:3          # hysteresis: only un-post when it drops below this
   emojis:"⭐ 🌟"           # multiple star emojis
   self_star:false         # allow authors to star their own messages
   filter_bots:true
   sync_deletes:true       # remove the post if the original is deleted
   reward_role:@Star reward_stars:10   # role granted when a message hits a milestone
   author_role:@Verified   # role based board: only accept messages by authors with this role
   downvote_emojis:👎       # subtract from the net star count
   remove_invalid:true     # strip reactions that are not valid stars
   min_chars:0 min_attachments:0 require_image:false
   max_age_hours:0         # only star messages newer than N hours (0 = no limit)
   require_nsfw:false
   display_tiers:"5:⭐ 10:🌟 25:💫"   # the header emoji changes as stars climb
   enabled:true
```

## Blacklist and whitelist

```
/starboard block name:best role:@Muted      # or channel: or user:
/starboard allow name:best user:@trusted     # whitelist beats blacklist
/starboard ignore name:best channel:#spam
```

A more specific whitelist beats a less specific blacklist (user beats role beats channel).

## Auto star channels

The bot reacts to every new message in these channels with the star emoji. It does not auto post; the
message still needs the required stars.

```
/starboard autostar add channel:#art emojis:⭐
/starboard autostar list
/starboard autostar remove channel:#art
```

## Overrides

Change specific settings for a channel or role, inheriting everything else from the board.

```
/starboard override create board:best name:vip channel:#vip
/starboard override set board:best name:vip required_stars:3 self_star:true
/starboard override delete board:best name:vip
```

Channel scope wins over role scope when both match.

## Leaderboard

```
/starboard leaderboard
```

## Tips

- Needs the Message Reactions intent (enabled by default).
- Reward roles need Rostra's role above them.
- Star counts come from fetching a reaction's users, so very large counts are capped by Discord at 100 per
  fetch.
