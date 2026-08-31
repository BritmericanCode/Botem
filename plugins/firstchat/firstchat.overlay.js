/* ════════════════════════════════════════
   FIRST CHAT SOUND — overlay-side handler
   ════════════════════════════════════════
   Plays a bundled sound file whenever the bot-side plugin
   detects a user's first-ever message in this channel
   (driven by Twitch's own "first-msg" IRC tag — see irc.js
   and plugins/firstchat/firstchat.js for where that's read
   and dispatched).

   No visual element — this plugin never draws anything on
   screen. It exists purely because overlay.html is the only
   page OBS actually captures audio/video from.

   IMPLEMENTATION NOTE: deliberately uses a plain Audio
   element with a relative src, NOT fetch(). Both overlay.html
   (when OBS's Browser Source points at a Local File) and a
   directly-double-clicked overlay.html are loaded via file://,
   and Chromium (including OBS's CEF) blocks fetch() of local
   relative files from a file:// origin — confirmed by testing
   both in a raw Chrome file:// tab (explicit CORS error) and
   in OBS itself (silent failure, no audio meter movement).
   Assigning src on a real media element uses the browser's
   native resource loader instead, which is NOT subject to that
   restriction — this is the same reason core overlay.js's
   playLocalSound() falls back to `new Audio(...)` on fetch
   failure, and why the Sounds plugin ships raw bytes over
   BroadcastChannel rather than ever fetching a local path from
   inside the overlay page.

   Setup: drop an audio file at
     plugins/firstchat/welcome.mp3
   No settings, no chat commands — this plugin just plays
   that one file every time it's triggered.
════════════════════════════════════════ */

OverlayPlugin.register('firstchat', {
  handles: ['firstchat-play'],

  onMessage(msg) {
    playWelcomeSound();
  }
});

function playWelcomeSound() {
  try {
    const el = new Audio('plugins/firstchat/welcome.mp3');
    el.play().catch(e => console.warn('firstchat: playback blocked/failed:', e));
  } catch(e) {
    console.warn('firstchat: could not play welcome sound:', e);
  }
}