# Roles and Self-Roles

Let members pick their own roles, hand out roles automatically, and manage roles in bulk.

## Reaction role panels

A message with buttons or a dropdown that toggle roles when clicked.

```
/reactionrole create title:"Pick your roles" mode:<multiple | single>
/reactionrole addrole panel:<name> role:@Gamer label:"Gamer" emoji:🎮
/reactionrole post panel:<name>        # post as buttons
/reactionrole postmenu panel:<name>    # post as a dropdown menu
/reactionrole list
/reactionrole delete panel:<name>
```

`mode` controls whether members can hold many of the panel's roles or just one at a time.

## Voice roles

Give a role to members while they are in a voice channel, and remove it when they leave.

```
/voicerole set role:@In-Voice
/voicerole status
/voicerole disable
```

## Vanity roles

Grant a role to members whose custom status or presence contains a keyword (for example your invite link).

```
/vanityrole set keyword:"discord.gg/yourserver" role:@Supporter
/vanityrole status
/vanityrole disable
```

This needs the Presence intent enabled for the bot.

## Bulk role

Add or remove a role across the whole server at once.

```
/role all add role:@Member
/role all remove role:@OldRole
```

Large servers are processed in batches to respect rate limits. The bot needs Manage Roles and its role must
sit above the role being assigned.

## Tips

- For any role feature, Rostra's role must be higher in the list than the roles it grants.
- Reaction role panels are the easiest self serve option for most servers.
