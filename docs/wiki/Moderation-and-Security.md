# Moderation and Security

Rostra has a full safety stack. Here is a sensible order to set it up.

## Antinuke (protect against rogue admins)

Antinuke watches for destructive actions (mass bans, mass channel or role deletes, malicious bot adds) and
punishes whoever did it, based on the audit log.

```
/security setup
```

This enables the recommended protections. Add trusted people so they are never punished:

```
/security whitelist add @user
/security extraowner add @user
```

## Anti raid

Detects join floods and locks the server down (raises verification, alerts you) then lifts automatically.

```
/security antiraid enabled:true
```

For a manual lockdown during an active raid:

```
/security panic state:on
```

## Auto moderation

Deletes messages that break the rules (invites, links, spam, mass mentions, profanity, excessive caps).

```
/automod setup
```

You can also add custom rules with keyword, wildcard, or regex matching:

```
/automod rule add name:noslurs trigger:keyword pattern:badword action:timeout
```

## Verification gate

Make new members click a button (and optionally solve a quick captcha) before they can see the server.

```
/verification setup role:@Member
/verification panel
/verification captcha enabled:true
/verification autokick minutes:10
```

## Logging

Record what happens in a channel: message edits and deletes, bulk deletes, joins and leaves, bans, role and
channel changes, voice activity, and nickname changes.

```
/logging setup
```

## Day to day moderation

```
/mod warn @user reason:...
/mod timeout @user duration:10m reason:...
/mod ban @user reason:...
/mod cases @user        # view a member's history
```

Punished members are notified by DM in their own language, while your confirmation stays in yours.

## Tips

- Put Rostra's role above the roles and members it needs to act on.
- Use `/security panic state:off` to lift a manual lockdown.
- See [[Setup Guide]] for the one click baseline that enables automod, logging, welcome, and antinuke.
