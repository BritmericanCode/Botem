/* ════════════════════════════════════════
   PLUGIN MANIFEST  —  edit this file
════════════════════════════════════════ */

window.ENABLED_PLUGINS = [

  'shoutout',
  'sounds',
  'videoclips',
  'timer',
  'gifplayer',
  'autorespond',
  'chatoverlay',
  'announcements',
  'intro',
  'deathcount',

];

try {
  localStorage.setItem(
    'twitchbot_enabled_plugins',
    JSON.stringify(window.ENABLED_PLUGINS)
  );
} catch(_) {}