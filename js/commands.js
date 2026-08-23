/* ════════════════════════════════════════
   COMMAND HANDLING
════════════════════════════════════════ */

/*
 * Variant keys for overloaded commands.
 * Defined here as a global so ui.js (loaded after this file) can
 * reference the same constants — prevents the magic strings '0', '1',
 * 'n' from being scattered and independently maintained across
 * commands.js, ui.js, and persistence.js.
 */
const VARIANT_KEYS = Object.freeze({ zero: '0', one: '1', many: 'n' });

/*
 * Built-in command names that cannot be registered as user-defined
 * commands.  Set lookup is O(1) vs O(n) array scan.
 */
const BUILTIN_COMMANDS = Object.freeze(new Set([
  '!commands', '!addcommand', '!removecommand', '!setcooldown', '!setpermission'
]));

async function handleCommand(dname, nick, text, chan, tags) {
  /*
   * FIX: top-level try/catch.
   * handleCommand is async and irc.js chains .catch() at the call site,
   * but a synchronous throw before the first await could still escape
   * as an unhandled rejection in edge cases.  This catch ensures all
   * errors surface visibly to the console rather than disappearing.
   */
  try {
    await _handleCommandImpl(dname, nick, text, chan, tags);
  } catch(e) {
    console.error('handleCommand error:', e);
  }
}

async function _handleCommandImpl(dname, nick, text, chan, tags) {

  /* Give all plugins access to every message with full tag data */
  BotPlugin.dispatchMessage(dname, nick, text, chan, tags);

  const parts = text.trim().split(/\s+/);
  const token = parts[0].toLowerCase();
  const ul    = getUserLevel(tags);

  // ── !commands ────────────────────────────────────
  if (token === '!commands') {
    const now = Date.now(); if (now - lastCmdList < LIST_CD) return;
    const keys = Object.keys(commands);
    if (!keys.length) {
      lastCmdList = now;
      send(chan, 'No commands yet.');
      return;
    }
    /*
     * FIX: paginate to stay within Twitch's 500-character limit.
     * A single string listing all commands is silently dropped once it
     * exceeds 500 characters.  Multiple messages are queued normally —
     * the queue's rate limiter handles spaced delivery automatically.
     */
    const PREFIX = 'Commands: ';
    const LIMIT  = 490;   // 10-char reserve for the " (1/3)" page suffix
    const chunks = [];
    let   chunk  = '';
    for (const key of keys) {
      const sep       = chunk ? ' · ' : '';
      const candidate = chunk + sep + key;
      if ((PREFIX + candidate).length > LIMIT) {
        if (chunk) chunks.push(chunk);
        chunk = key;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) chunks.push(chunk);
    /*
     * FIX: stamp cooldown before queuing so a rapid second !commands
     * cannot stack additional pages onto the queue before the first
     * set has drained.
     */
    lastCmdList = now;
    chunks.forEach((c, i) =>
      send(chan, PREFIX + c + (chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''))
    );
    return;
  }

  // ── !addcommand ──────────────────────────────────
  if (token === '!addcommand') {
    if (!canUse(ul, 'moderator')) return;
    if (parts.length < 3) {
      send(chan,
        'Usage: !addcommand <name> <response>  or  ' +
        '!addcommand <name> [0|1|n] <response>');
      return;
    }
    const key = toKey(parts[1]);
    /*
     * FIX: prevent user-defined commands from shadowing built-ins.
     * A command named '!commands' in the user map is unreachable
     * (built-ins are checked first) but clutters the Active Commands list.
     */
    if (BUILTIN_COMMANDS.has(key)) {
      send(chan, `"${key}" is a built-in command and cannot be overridden.`);
      return;
    }
    const vm = /^\[([01n])\]$/i.exec(parts[2]);
    const ex = commands[key];
    if (vm) {
      if (parts.length < 4) { send(chan, 'Provide a response after the variant tag.'); return; }
      const v = vm[1].toLowerCase();
      /*
       * FIX: warn the moderator when a simple command is being converted
       * to overloaded.  Previously the old response was silently deleted
       * with a misleading "✅ updated!" confirmation.
       */
      if (ex?.response != null) {
        send(chan,
          `⚠ !${key.slice(1)} was a simple command — converting to overloaded. Old response cleared.`
        );
      }
      if (!ex || ex.response != null) {
        commands[key] = {
          response:   null,
          variants:   { [v]: parts.slice(3).join(' ') },
          cooldown:   ex?.cooldown   ?? DEFAULT_COOLDOWN,
          permission: ex?.permission || 'everyone'
        };
      } else {
        if (!commands[key].variants) commands[key].variants = {};
        commands[key].variants[v] = parts.slice(3).join(' ');
      }
    } else {
      commands[key] = {
        response:   parts.slice(2).join(' '),
        variants:   null,
        cooldown:   ex?.cooldown   ?? DEFAULT_COOLDOWN,
        permission: ex?.permission || 'everyone'
      };
    }
    saveCommands(); renderCommands();
    send(chan, `✅ Command ${key} updated!`);
    return;
  }

  // ── !removecommand ───────────────────────────────
  if (token === '!removecommand') {
    if (!canUse(ul, 'moderator')) return;
    /* FIX: explicit argument check — missing arg produced `"!" not found.` */
    if (parts.length < 2) { send(chan, 'Usage: !removecommand <name>'); return; }
    const key = toKey(parts[1]);
    if (key in commands) {
      delete commands[key]; saveCommands(); renderCommands();
      send(chan, `❌ Command ${key} removed.`);
    } else { send(chan, `"${key}" not found.`); }
    return;
  }

  // ── !setcooldown ─────────────────────────────────
  if (token === '!setcooldown') {
    if (!canUse(ul, 'moderator')) return;
    /* FIX: explicit argument check */
    if (parts.length < 3) { send(chan, 'Usage: !setcooldown <name> <seconds>'); return; }
    const key  = toKey(parts[1]);
    const secs = parseInt(parts[2], 10);   // FIX: explicit radix
    if (!(key in commands))      { send(chan, `"${key}" not found.`); return; }
    if (isNaN(secs) || secs < 0) { send(chan, 'Usage: !setcooldown <name> <seconds>'); return; }
    commands[key].cooldown = secs; saveCommands(); renderCommands();
    send(chan, `✅ Cooldown for ${key} → ${secs}s`);
    return;
  }

  // ── !setpermission ───────────────────────────────
  if (token === '!setpermission') {
    if (!canUse(ul, 'moderator')) return;
    /* FIX: explicit argument check */
    if (parts.length < 3) {
      send(chan, `Usage: !setpermission <name> <${PERM_LEVELS.join('|')}>`);
      return;
    }
    const key   = toKey(parts[1]);
    const level = parts[2].toLowerCase();
    if (!(key in commands))           { send(chan, `"${key}" not found.`); return; }
    if (!PERM_LEVELS.includes(level)) {
      send(chan, `Valid levels: ${PERM_LEVELS.join(', ')}`); return;
    }
    commands[key].permission = level; saveCommands(); renderCommands();
    send(chan, `✅ Permission for ${key} → ${level}`);
    return;
  }

  // ── Plugin commands ──────────────────────────────
  if (await BotPlugin.handleCommand(token, dname, nick, parts, chan, tags)) return;

  // ── User-defined commands ────────────────────────
  if (!(token in commands)) return;
  const cmd = commands[token];
  if (!canUse(ul, cmd.permission)) return;
  if (isOnCooldown(token, nick))   return;

  const targets = parts.slice(1)
    .map(p => p.replace(/^@/, '').replace(/[,;.!?]+$/, ''))
    .filter(Boolean);

  /*
   * FIX: resolve the template BEFORE stamping the cooldown.
   *
   * Previously stampCooldown ran before the variant check — a command
   * with no variant defined for the current target count would consume
   * the user's cooldown and then return silently with no message sent.
   *
   * Now: if there is no usable template we return immediately with no
   * side effects — the cooldown is only stamped when we know a message
   * will actually be sent.
   */
  let tpl;
  if (cmd.response != null) {
    tpl = cmd.response;
  } else if (cmd.variants) {
    const c = targets.length;
    tpl = c === 0 ? cmd.variants[VARIANT_KEYS.zero]
        : c === 1 ? cmd.variants[VARIANT_KEYS.one]
        :           cmd.variants[VARIANT_KEYS.many];
    if (!tpl) return;   // no variant for this target count — exit, no cooldown
  } else { return; }

  /* Stamp only after confirming a response will be sent */
  stampCooldown(token, nick);
  send(chan, applyPlaceholders(tpl, dname, targets));
}