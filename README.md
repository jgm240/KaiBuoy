# Buoy

A WhatsApp-style messenger and dialer for KaiOS. It uses the phone's own SMS and calls, so it works with any phone, KaiOS or not, with no server or account.

Chats, group chats, broadcast lists, reply quoting, emoji shortcodes, group calls, speed dial, call-back reminders, search, contacts, a SIM selector and themes (dark/light, accent colors, text size, wallpapers).

<p align="center"><img src="design/buoy-preview.png" width="160" alt="Buoy logo"></p>

## Look

The layout follows the phone's own Messages app: a dark themed header, gray section headers (Pinned, Today, Yesterday, and A to Z for contacts), tall two-line rows with a solid accent for the focused row, option menus that pop up over the dimmed screen, and the stock text sizes. The accent palette (Blue, Cyan, Lime, Orange, Pink, Purple, Red) uses the same colors KaiOS offers. Everything is written from scratch; no code, icons or images from the KaiOS apps are included.

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

## Updating

With the phone connected over USB (USB debugging on) and gdeploy installed, one command downloads the latest version from this repo and installs it:

```
node tools/update-phone.js              # Buoy C (certified), the default
node tools/update-phone.js --build privileged
node tools/update-phone.js --dry-run    # download and check, change nothing
```

Other options: `--release` (latest GitHub release instead of `main`), `--ref <branch-or-tag>`, `--from <folder>` (a local copy), `--force` (reinstall the same version), `--start` (launch afterwards). It installs under a fixed app id (`buoy-c` or `buoy`) so it is an update in place rather than a new random-id copy like `gdeploy install` makes. An in-place update keeps the app's saved chats, calls and settings: checked on a Nokia 8110 4G (KaiOS 2.5.1) by updating Buoy C from 0.4.0 to 0.5.0 and comparing its saved data before and after.

In the app, Settings, Check for updates compares the installed version with the latest on GitHub and shows this command when there is a newer one. The app cannot install the update itself: KaiOS refuses to import an app that is already installed, and an app cannot uninstall itself and then install its replacement.

## Status

Tested in a desktop browser (demo mode) and on a Nokia 8110 4G running KaiOS 2.5.1 (texts and calls with the certified build). Other phones and KaiOS versions are untested.
