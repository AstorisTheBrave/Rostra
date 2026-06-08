# Engagement

Features that make a server fun and sticky. Turn on what fits your community.

## Leveling

Members earn XP for chatting and level up. `/level rank` shows an image rank card.

```
/level enable
/level reward add level:10 role:@Active
/level announcechannel channel:#level-ups
```

## Economy

A virtual currency with daily rewards, work, gambling, a leaderboard, and a shop with buyable roles.

```
/economy daily
/economy additem name:VIP price:5000 role:@VIP   # a buyable role
/economy shop
/economy buy item:VIP
```

## Starboard

Members react with a star and the best messages get reposted to a board. Rostra supports multiple boards,
custom emojis, downvotes, filters, reward roles, and per channel or per role overrides.

```
/starboard create name:best channel:#starboard
/starboard edit name:best required_stars:5 reward_role:@Star reward_stars:10
/starboard autostar add channel:#art
```

## Welcome and autorole

Greet new members with a message or an image card, and hand out roles automatically.

```
/welcome setup
/welcome card enabled:true
/welcome autorole add role:@Member
```

## Community

```
/giveaway start duration:1h prize:Nitro winners:1
/poll create question:"Movie night?" option1:Yes option2:No
/suggest setup channel:#suggestions     # then members use /suggest add
/counting setup channel:#counting        # a count up game
```

## Personal preferences

Members can opt out of fun and social commands, and choose their language, with `/preferences`. Commands
that target someone (like ship) respect their opt out.

## Tips

- Reward roles need Rostra's role to sit above them.
- See [[Setup Guide]] to enable systems, and [[FAQ]] if something does not appear.
