# Tickets and Modmail

Two ways for members to reach your staff: ticket channels for in server support, and modmail for private DM
to staff conversations.

## Tickets

A button panel that opens a private channel between the member and your support team.

```
/ticket enable
/ticket category category:#Support      # where ticket channels are created
/ticket logchannel channel:#ticket-logs
/ticket supportrole add role:@Support
/ticket panel                            # post the open a ticket button
```

Inside a ticket:

- `/ticket claim` to take ownership
- `/ticket add user:@member` to pull someone in
- `/ticket close` to close and log it

Use `/ticket status` to see the current configuration. The bot needs Manage Channels to create and close
ticket channels.

## Modmail

Members DM the bot and it relays to a staff thread; your replies relay back to their DMs. Good for appeals
and private reports.

```
/modmail setup channel:#modmail     # a staff only channel where threads open
```

- A member DMs the bot to open or continue a thread.
- Staff reply in the thread; lines starting with `//` stay internal and are not sent to the member.
- `/modmail close` closes the conversation and tells the member.
- `/modmail status` shows settings, `/modmail disable` turns it off.

Make sure only staff can see the modmail channel, since threads inherit its visibility. Modmail needs the
Direct Messages capability, which is enabled by default.

## Tips

- Tickets are best for ongoing support with extra members; modmail is best for one to one private contact.
- Both respect role hierarchy and permissions, so keep Rostra's role high enough to manage channels and
  threads.
