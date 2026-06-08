# Localization

Localization in Rostra is a core platform capability, not a per command afterthought. The same action is
executed once and the presentation layer is rendered per recipient, so a single moderation command can
confirm to the moderator in one language while the target receives a DM in theirs.

## Supported languages

English (the source of truth), French, German, Spanish, Portuguese (Brazil), Russian, Simplified Chinese,
Italian, Dutch, Polish, Turkish, Ukrainian, Japanese, Korean, Traditional Chinese, and Arabic. The system
supports all of them from day one; translations are filled in over time.

## How a language is chosen

- Guild facing messages (public logs, announcements): the server language, else English.
- User facing messages (DMs, warnings, profile, help): the user's chosen language, else their Discord
  client language, else the server language, else English.

## Changing language

- Server owners and admins: `/setup language`
- Any user, for themselves: `/preferences language`
- Quick switch in `/help`: a language selector re-renders the help panel instantly

## For contributors and operators

- Translations live in JSON files, one folder per language. Anything missing falls back to English.
- `npm run i18n:coverage` shows how complete each language is.
- `npm run i18n:validate` checks that every translation compiles and keeps the same placeholders as English.
- `npm run i18n:draft` produces machine translation drafts for review (needs a translation provider).
- `npm run i18n:push` makes translations live across every shard with no restart.

The engine uses ICU MessageFormat, so plurals, select, and number formatting work correctly in every
language.
