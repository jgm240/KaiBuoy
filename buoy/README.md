# Buoy

A WhatsApp-style messenger and dialer for KaiOS. It uses the phone's own SMS and calls, so it works with any phone, KaiOS or not. No server or account is needed.

## Features

**Messaging**
- Chats built from the phone's SMS history, with unread badges, sent ticks and times.
- **Group chats**: a local group of contacts. A message goes out as a normal SMS to each member, prefixed with `[Group name] `. Other Buoy users who have a group with the same name and that member see one group conversation. Anyone else just sees a text starting with the group name.
- **Broadcast lists**: one message sent as an ordinary text to each person. It also appears in each person's own chat, and replies arrive there.
- **Reply quoting**: reply to a message and the first line of your text quotes the original (`↩ "original"`). Buoy shows it as a quote block. On other phones it reads as plain text.
- **Message options**: select a message with Up, press Enter for Reply, Copy text, Forward or Delete. Delete removes it from Buoy only, not from the phone's own Messages app.
- **Emoji**: a 48-emoji picker, plus shortcodes. Typing `:fire:` or an emoticon such as `:)`, `:D`, `<3` turns into an emoji. Emoji make an SMS use Unicode encoding (70 characters per segment instead of 160).
- **Pin and mute chats**: pinned chats stay on top. Muted chats get a grey badge and no in-app alert. The phone's own SMS notifications aren't affected.
- **Search**: `#` on Chats or Contacts, or Options, Search. Chats match names and message text.

**Calls**
- Normal calls go through the built-in dialer. The Calls tab lists calls placed from Buoy.
- **Group calls**: a phone conference call using the telephony API. Without that permission it starts the first call and tells you to add the others from the call screen.
- **Speed dial**: set it from a contact's menu, then hold a number key (2 to 9) on the main screen.
- **Call-back reminders**: set from a contact, a chat or a call (in 15 minutes, 1 hour, 3 hours, or tomorrow at 9:00). Due reminders show at the top of Calls. Calls that go unanswered while the app is running are logged as missed.

**Contacts**
- Reads the phone's contacts and adds new ones.

**Look**
- Settings (Options, Settings): theme (Light, Dark, or Auto from 7pm to 7am), accent color (7 choices), text size (3 sizes) and chat wallpaper (Default, Tint, Dots, Plain).
- The text field stays above the T9 prediction bar. The layout resizes with the screen. If the phone covers the screen instead, the whole screen lifts.

## Keys

| Key | Action |
|---|---|
| Left / right arrows | Switch Chats / Calls / Contacts |
| Up / down | Move, or select messages in a chat |
| Enter | Open, select, or send |
| Left soft key | New / Dial / Emoji |
| Right soft key | Options |
| Number keys 1 to 9 (Chats) | Open that chat |
| Number keys (Contacts) | Jump to names starting with that key's letters |
| Hold number key 2 to 9 | Speed dial |
| `*` | Dial pad |
| `#` | Search |
| Back | Go back |

On a desktop browser, F1 and F2 stand in for the soft keys. Without KaiOS APIs the app runs in demo mode with sample contacts, and sent messages get a fake reply.

## If the app has no SMS permission

If the phone doesn't grant `sms`, Buoy can't send texts itself. It says so when it starts. A one-to-one message opens in the built-in Messages app, ready for you to send, and shows a ↗ instead of a ✓ because Buoy can't tell whether you sent it. Group and broadcast texts are refused. The fake "Got it" replies and sample contacts only exist in a desktop browser (the title says "demo"); they never appear on a phone. If your chats contain fake messages from an older build, use Settings, Reset app data.

## SIM select

Settings, SIM select chooses which SIM slot texts and calls use: Auto, SIM 1 or SIM 2. Auto uses the first slot that has a card. Some phones report two slots with the card in only one, and a text or call that doesn't name the slot can go to the empty one. Seeing which slot has a card needs the `mobileconnection` permission. Without it, Auto leaves the choice to the phone, and you can still pick SIM 1 or SIM 2 yourself. Calls on a chosen SIM need `telephony` access; otherwise they go through the built-in dialer, which picks its own SIM.

## Request permissions

Settings, Request permissions lists SMS, Contacts, Calls, Alarms and Notifications with what the phone has granted. Press Enter on one (or on "Request all") to ask. Only Notifications can show a system prompt. For the rest the phone decides when the app is installed, so a missing one shows how to fix it, and the right key restarts the app to re-check.

## What I haven't verified

I tested the app in a desktop browser only, in demo mode. These parts need a real KaiOS phone or simulator:

- Permissions. `contacts`, `sms`, `telephony`, `alarms` and `desktop-notification` may need a privileged or certified app. Without them the app still loads, but contacts and message history can be empty, and reminders only fire while the app is open.
- Reading and sending through `mozMobileMessage`.
- The group call merge and missed-call logging, which depend on the `telephony` permission.
- Whether your phone resizes the screen for the T9 bar or covers it. Both cases are handled, but I couldn't see either on a phone.
- Copy text, which relies on `execCommand('copy')`.
- Emoji display, which depends on the phone's font.

## Limits

- Group chats and broadcast lists are individual SMS messages, so the carrier charges per member.
- Group chat messages only form one thread on a member's phone if they also run Buoy.
- Only the first number of each contact is used, and contacts can't be edited or deleted.
- MMS and picture messages aren't supported.
- Phone reminders when the app is closed need the `alarms` permission.

## Install

Use the app folder, not a ZIP:

```
gdeploy install /path/to/buoy
```

Or load it in the KaiOS simulator (WebIDE).
