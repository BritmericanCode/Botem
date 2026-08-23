# Botem — Twitch Chat Bot + OBS Overlay

A browser-based Twitch chat bot with a plugin system and a live OBS
browser-source overlay. Runs entirely client-side — no server, no
Node.js, no build step. Just static HTML/CSS/JS files loaded directly
by your browser and by OBS.

---

## What you get

- Custom chat commands (simple and overloaded/multi-response)
- Permission levels & per-command cooldowns
- A live overlay (timer, death counter, chat mirror, alerts, sounds,
  video clips, and more) — fully drag-to-position, no CSS editing
  required
- A plugin system — enable/disable individual features from the
  sidebar
- Everything is stored locally in your browser (`localStorage` /
  `IndexedDB`) — no external database, no account signup beyond
  Twitch itself

---

## Requirements

- **OBS Studio** (with the built-in `obs-websocket` server — included
  by default in OBS 28+)
- **Google Chrome** or another Chromium-based browser (this app relies
  on Chrome-specific APIs like the File System Access API and
  BroadcastChannel)
- A **Twitch account** for your bot (can be your main account, but a
  separate bot account is strongly recommended)
- A **Twitch Developer application** (free, takes 2 minutes — see
  below)

---

## Part 1 — Get the files running

1. Download or clone this repository to a folder on your PC, e.g.
   `C:\Botem`.
2. That's it for installation — there's nothing to build or run. You
   will point OBS directly at the `.html` files in this folder.

---

## Part 2 — Register a Twitch application (for login)

1. Go to <https://dev.twitch.tv/console/apps/create>
2. Log in with **your bot's Twitch account** (recommended) or your own
3. Fill in:
   - **Name:** anything (e.g. "My Stream Bot")
   - **OAuth Redirect URLs:** `http://localhost`
   - **Category:** Chat Bot
4. Click **Create**
5. Copy the **Client ID** shown — you'll paste this into the bot in
   the next step

---

## Part 3 — Set up the bot control panel (`bot.html`) in OBS

1. In OBS: **View → Docks → Custom Browser Docks → +**
2. **Name:** `Bot Control` (or anything you like)
3. **URL:** the full local file path to `bot.html`, e.g.
   `file:///C:/Botem/bot.html`
4. Click **Apply**/**OK** — a new dock should appear showing the bot's
   control panel

### Connecting to Twitch

1. In the **Connection** panel, enter your **bot's Twitch username**
2. Paste in the **Client ID** from Part 2
3. Click **Authorise with Twitch**
   - A new browser tab will open showing a code
   - **Important:** if you're not already logged into Twitch as your
     bot account in that browser, either log out and back in as the
     bot first, or open the link in an **Incognito window** — otherwise
     you may accidentally authorize your main account instead
   - Go to [twitch.tv/activate](https://www.twitch.tv/activate),
     enter the code shown, and confirm
4. Once authorized, enter your **channel name** (the channel the bot
   should join and chat in)
5. Click **Connect**

You should see a "✔ Connected" message and a ready message posted in
your chat.

---

## Part 4 — Connect OBS WebSocket

This lets the bot control what appears on your stream overlay.

1. In OBS: **Tools → obs-websocket Settings**
2. Tick **Enable WebSocket server**
3. For simplicity, untick **Enable Authentication** (or set a password
   and enter it in the bot's OBS Setup panel if you'd prefer)
4. Note the **port** (default `4455`)
5. Back in the bot's **OBS Setup** panel, click **Connect to OBS
   WebSocket** — it should show "✔ Connected"

---

## Part 5 — Add the overlay to your scene

The overlay (`overlay.html`) is what actually displays on your stream
— timers, alerts, chat, sounds, etc.

1. In OBS, in your scene: **Sources → + → Browser Source**
2. Name it (e.g. "Bot Overlay")
3. **Untick "Local file"**
4. **URL:** see below — you have two options depending on your setup
5. **Width:** `1920`, **Height:** `1080`
6. Tick **"Control audio via OBS"**
7. Click **OK**

### Choosing the overlay URL — loopback vs. LAN IP

Some OBS/Windows configurations block a browser source from
connecting to `ws://127.0.0.1` (loopback). Others work perfectly fine
with it and have trouble with a LAN IP instead. **Try loopback first**
— it's simpler:
file:///C:/Botem/overlay.html?wsHost=127.0.0.1&wsPort=4455

After changing the URL, right-click the source → **Properties** →
**Refresh cache of current page**.

---

## Part 6 — Positioning overlay elements

Once a plugin (Timer, Death Counter, Chat Overlay, etc.) has something
showing on the overlay:

1. In the bot's sidebar, open the **Positioning** panel
2. Choose the element from the dropdown
3. Click **Start Positioning**
4. In OBS, right-click the overlay source → **Interact**
5. Click and drag the element to wherever you want it
6. Click **Stop Positioning** when done

You can also use the arrow buttons to nudge by small increments, or
**Reset** to return to the default position. Positions are saved
automatically and survive OBS restarts.

---

## Enabling / disabling features

Every plugin panel in the sidebar has a small toggle switch in its
title bar. Turning a plugin off:

- Stops its chat commands from responding
- Immediately hides anything it currently has on the overlay (Timer,
  Death Counter, Chat Overlay text)

**Known limitation:** Sounds, Video Clips, GIF Player, and Shoutout
currently share the same on-screen alert/video area. Disabling one of
these plugins will stop new triggers, but won't interrupt something
that's already mid-playback when you disable it. This is a planned
future improvement.

---

## Optional features

### Sounds
Click **📂 Pick Folder** in the Sounds panel and choose a folder of
audio files. Viewers can then use `!sound <name>` in chat.

### Video Clips
Same idea — pick a folder of video files. **Important:** the overlay
loads clips from a `videos/` folder sitting next to `overlay.html` on
disk — it does not use whatever folder you picked in the "Open Files"
button for actual playback, only for the local preview and the
`!clips` list. Copy your clip files into the `videos/` folder in this
project for them to actually play on stream.

### Shoutout
Customize the `!so @user` message template. If you've entered your
Client ID and are authorized, it will also try to show the target's
last game and a random recent clip.

### Intro Bot
Lets viewers set a personal intro sound via a Channel Points reward.

1. Create a Channel Points reward on Twitch with **"Require viewer to
   enter text"** enabled
2. In the Intro Bot panel, click **Auto-detect**, then have someone
   redeem the reward — this captures the reward's ID automatically
3. Viewers redeem the reward and paste a direct audio link (MP3/WAV/
   OGG) or a [vocaroo.com](https://vocaroo.com) link
4. For security, links pointing at local/internal network addresses
   are automatically rejected

### Auto Respond
Create rules that make the bot automatically reply when chat matches
a trigger phrase (plain text or regex). Includes configurable delay,
cooldown, and a "fire once" option.

### Announcements
Schedule recurring messages (Discord links, follow reminders, etc.)
with configurable timing, weighting, and an option to pause while
chat is active.

---

## Saving your commands

The **Commands File** panel lets you save/load your custom commands
as a `commands.json` file. Auto-save requires a Chromium browser
context that supports the File System Access API — this may not work
inside OBS's Custom Browser Dock depending on your OBS version; if so,
it will fall back to downloading a file each time you click Save.

---

## Troubleshooting

**The overlay shows "Connecting..." and never changes:**
Your obs-websocket connection isn't reaching the overlay. Try
switching between `127.0.0.1` and your LAN IP in the overlay's URL
(see Part 5), and confirm **Tools → obs-websocket Settings** has the
server enabled in OBS.

**A sidebar panel or feature just disappeared:**
Right-click the affected source → Properties → **Refresh cache of
current page**. Browser sources in OBS can cache old versions of a
file after you've edited it.

**Popup blocked" during Twitch authorization:**
Allow popups for this page in your browser settings, then try
**Authorise with Twitch** again.

**Intro Bot rejects a Vocaroo link:**
Vocaroo's short-link domain (`voca.ro`) is supported, but some
Vocaroo/CORS-proxy combinations occasionally return an error page
instead of the actual audio file. If a link fails, try re-uploading
the audio directly via the **manual add** field with a plain, direct
`.mp3`/`.wav` URL instead.

---

## Project structure
bot.html          — the control panel (loads as an OBS Custom Browser Dock)
overlay.html       — the stream overlay (loads as an OBS Browser Source)
js/                — core application logic
plugins/           — individual features, each with its own folder
sounds/            — drop sound-effect files here for the Sounds plugin
videos/            — drop video clips here for the Video Clips plugin

---

## Privacy & data

Everything this bot stores (your OAuth token, Client ID, command list,
saved intros, etc.) lives entirely in your browser's local storage on
your own machine. Nothing is sent to any third-party server except
Twitch itself (for chat/API access) and, optionally, a CORS proxy used
only when downloading intro audio from certain external sources.

---

## License

This project is licensed under the MIT License — see the
[LICENSE](LICENSE) file for details.
