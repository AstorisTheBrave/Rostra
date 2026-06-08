# Utility and Extras

A grab bag of everyday helpers and fun extras.

## Utility

```
/util avatar user:@member
/util banner user:@member
/util userinfo user:@member
/util serverinfo
```

## Tags (saved snippets)

Store reusable text and recall it on demand.

```
/tag add name:rules content:"Be kind. No spam."
/tag get name:rules
/tag list
/tag remove name:rules
```

## Reminders

```
/reminder set when:2h message:"Stream starts"
/reminder list
/reminder cancel id:<id>
```

## Birthdays

```
/birthday set day:14 month:6 year:2000
/birthday channel channel:#birthdays
/birthday role role:@Birthday
/birthday next
/birthday view user:@member
```

## AFK, snipe, autoresponder

```
/afk reason:"back later"          # clears automatically when you next speak
/snipe                            # show the last deleted message in a channel
/autoresponder add trigger:"hello" response:"Hi there!"
/autoresponder list
```

## Profiles and social

```
/profile view user:@member        # an image profile card
/profile bio text:"..."
/profile background url:<image>
/profile color hex:#5865f2
/roleplay                         # gif reactions and the ship command
/steal emoji:<emoji> name:<name>  # add another server's emoji to yours
```

## Server stats channels

Voice channels whose names show live counts (members, bots, online), updated automatically.

```
/serverstats add ...
/serverstats list
/serverstats remove ...
```

## Highlights and sticky messages

```
/highlight add word:<keyword>     # DM you when a word is said
/highlight list
/sticky set                       # keep a message pinned to the bottom of a channel
/sticky remove
```

## Tips

- Most of these need only basic Send Messages permission. `/steal` needs Manage Expressions, and server
  stats channels need Manage Channels.
- Profile and rank cards are rendered images, so they look the same everywhere.
