# Buoy

A WhatsApp-style messenger and dialer for KaiOS. It uses the phone's own SMS and calls, so it works with any phone, KaiOS or not, with no server or account.

Chats, group chats, broadcast lists, reply quoting, emoji shortcodes, group calls, speed dial, call-back reminders, search, contacts, a SIM selector and themes (dark/light, accent colors, text size, wallpapers).

<p align="center"><img src="design/buoy-preview.png" width="160" alt="Buoy logo"></p>

## Two builds

| Folder | Type | What it can do |
|---|---|---|
| [`buoy`](buoy) | privileged | Contacts work. Texts open in the Messages app, because KaiOS only gives `sms` and `telephony` to certified apps. |
| [`buoy-certified`](buoy-certified) | certified ("Buoy C") | Same code. Sends texts itself, places calls on a chosen SIM, and does group calls. |

The code in both folders is identical. Only `manifest.webapp` differs.

## Install

Install from the folder (not a ZIP) with gdeploy (the BananaHackers CLI), over ADB:

```
gdeploy install buoy-certified
```

Installing a certified app needs a phone that allows it over the debugger. If gdeploy refuses, use `buoy`. See each folder's README for details, permissions, keys and limits.

## Status

Tested in a desktop browser (demo mode) and on a Nokia 8110 4G running KaiOS 2.5.1 (texts and calls with the certified build). Other phones and KaiOS versions are untested.
