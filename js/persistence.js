/* ════════════════════════════════════════
   PERSISTENCE
   localStorage + commands JSON file I/O
════════════════════════════════════════ */

const DEFAULT_COOLDOWN = 10;

function saveCommands() {
  try { localStorage.setItem('twitchbot_commands', JSON.stringify(commands)); } catch(_) {}
  autoSaveToFile();
}

function loadCommands() {
  try {
    const raw = localStorage.getItem('twitchbot_commands');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        commands[toKey(k)] = migrate(v);
      }
    }
  } catch(e) {
    console.warn('loadCommands: corrupted data in localStorage, clearing:', e);
    try { localStorage.removeItem('twitchbot_commands'); } catch(_) {}
  }
  renderCommands();
}

function saveField(key, val) {
  try { localStorage.setItem(key, val); } catch(_) {}
}

function loadSavedFields() {
  const fields = [
    ['twitchbot_user',         'inUser'],
    ['twitchbot_chan',          'inChan'],
    ['twitchbot_client_id',    'inClientId'],
    ['twitchbot_ready_msg',    'inReadyMsg'],
    ['twitchbot_exit_msg',     'inExitMsg'],
    ['twitchbot_obs_port',     'obsPort'],
    ['twitchbot_obs_password', 'obsPassword'],
  ];
  for (const [key, id] of fields) {
    try {
      const val = localStorage.getItem(key);
      const el  = g(id);
      if (val !== null && el) el.value = val;
    } catch(_) {}
  }
}

function saveOBSSetting(key, value) {
  try { localStorage.setItem(key, value); } catch(_) {}
  pushTimerAppearance();
}

function pushTimerAppearance() {
  sendToOverlay({
    type: 'settings-update',
    pos:  g('selTimerPos')?.value  || 'pos-br',
    size: g('selTimerSize')?.value || '5rem'
  });
}

function migrate(v) {
  if (typeof v === 'string')
    return { response: v, variants: null,
             cooldown: DEFAULT_COOLDOWN, permission: 'everyone' };
  if (typeof v === 'object' && v !== null) {
    if (('0' in v || '1' in v || 'n' in v) && !('response' in v) && !('variants' in v))
      return { response: null, variants: { ...v },
               cooldown: DEFAULT_COOLDOWN, permission: 'everyone' };
    return {
      response:   v.response   ?? null,
      variants:   v.variants   ?? null,
      cooldown:   v.cooldown   ?? DEFAULT_COOLDOWN,
      permission: PERM_LEVELS.includes(v.permission) ? v.permission : 'everyone'
    };
  }
  return { response: '', variants: null,
           cooldown: DEFAULT_COOLDOWN, permission: 'everyone' };
}


// ── Commands JSON file ────────────────────────────

/*
 * FIX (#10): shared write queue serializes EVERY write to fileHandle,
 * regardless of which caller triggered it.
 *
 * Previously autoSaveToFile() (fired automatically on every
 * !addcommand/!setcooldown/etc.) and saveCommandsToFile() (fired by
 * the manual Save button) could both call writeHandle() on the same
 * handle independently. createWritable() truncates the target file
 * immediately on creation — if both calls overlapped, whichever
 * write finished last silently won, and the other's data was lost
 * with no error surfaced anywhere.
 *
 * queueWrite() chains every write onto a single promise, so a second
 * write request always waits for the first to fully complete (success
 * OR failure) before it begins.
 */
let _writeQueue = Promise.resolve();

function queueWrite(fn) {
  _writeQueue = _writeQueue.then(fn, fn);   // run fn even if the previous write failed
  return _writeQueue;
}

let _saveInProgress = false;

async function loadCommandsFromFile() {
  if ('showOpenFilePicker' in window) {
    try {
      [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Commands JSON', accept: { 'application/json': ['.json'] } }]
      });
      parseAndLoadCommands(await (await fileHandle.getFile()).text(), fileHandle.name);
      return;
    } catch(e) {
      if (e.name === 'AbortError') return;
      console.warn('showOpenFilePicker failed, falling back to <input type=file>:', e);
      /* Falls through to the manual input picker below */
    }
  }
  const inp = Object.assign(document.createElement('input'),
                            { type: 'file', accept: '.json' });
  inp.onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    parseAndLoadCommands(await f.text(), f.name);
    setFileLabel(`Loaded ${f.name} ✔ — use Save button (auto-save unavailable)`);
  };
  inp.click();
}

async function saveCommandsToFile() {
  if (_saveInProgress) return;
  _saveInProgress = true;
  try   { await queueWrite(() => _doSaveCommandsToFile()); }
  finally { _saveInProgress = false; }
}

async function _doSaveCommandsToFile() {
  const json = buildCommandsJSON();

  if (fileHandle) {
    try { await writeHandle(fileHandle, json); setFileLabel('Saved ✔'); }
    catch(e) { logSys('Save error: ' + e.message, true); }
    return;
  }

  if ('showSaveFilePicker' in window) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'commands.json',
        types: [{ description: 'Commands JSON', accept: { 'application/json': ['.json'] } }]
      });
      await writeHandle(fileHandle, json);
      setFileLabel('Saved to ' + fileHandle.name + ' ✔');
      return;
    } catch(e) {
      if (e.name === 'AbortError') return;   // user cancelled — not an error
      /*
       * FIX: showSaveFilePicker can exist on window but still be refused
       * by the embedding context — confirmed in practice inside OBS's
       * Custom Browser Dock (CEF), which throws NotAllowedError even
       * though the function is present. This is NOT the same as the API
       * being absent, so the original code's structure (only falling
       * back when the API doesn't exist at all) never reached the
       * download fallback below. Now it does.
       *
       * Consequence: fileHandle is never set in this fallback case, so
       * autoSaveToFile() will keep no-op'ing for the rest of the session
       * (see its own guard below) — the user needs to click Save again
       * after future changes, each producing a fresh download. This is
       * an inherent limitation of the fallback method, not something
       * fixable without a different persistence strategy (e.g. IndexedDB).
       */
      console.warn('showSaveFilePicker failed, falling back to download:', e);
    }
  }

  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: 'commands.json'
  });
  a.click(); URL.revokeObjectURL(a.href);
  logSys('Downloaded commands.json — auto-save unavailable in this context, use Save button after future edits.');
}

async function autoSaveToFile() {
  if (!fileHandle) return;
  /*
   * FIX (#10): routed through the same queueWrite() as the manual save
   * path — this is the change that actually closes the race described
   * above.
   */
  await queueWrite(async () => {
    try {
      await writeHandle(fileHandle, buildCommandsJSON());
    } catch(e) {
      console.warn('autoSaveToFile failed:', e);
      setFileLabel('⚠ Auto-save failed — ' + e.message);
    }
  });
}

async function writeHandle(h, text) {
  const w = await h.createWritable();
  try {
    await w.write(text);
    await w.close();
  } catch(e) {
    await w.abort().catch(() => {});
    throw e;
  }
}

function buildCommandsJSON() {
  const out = {};
  for (const key of Object.keys(commands).sort()) {
    const cmd = commands[key];
    const e = {
      cooldown:   cmd.cooldown   ?? DEFAULT_COOLDOWN,
      permission: cmd.permission || 'everyone'
    };
    if (cmd.response != null) e.response = cmd.response;
    else if (cmd.variants)    e.variants  = cmd.variants;
    out[key] = e;
  }
  return JSON.stringify(out, null, 2);
}

function parseAndLoadCommands(text, filename) {
  try {
    const data = JSON.parse(text);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error(
        `Expected a JSON object, got ${Array.isArray(data) ? 'array' : typeof data}`
      );
    }

    const incoming = Object.create(null);
    for (const [k, v] of Object.entries(data)) {
      incoming[toKey(k)] = migrate(v);
    }

    Object.keys(commands).forEach(k => delete commands[k]);
    Object.assign(commands, incoming);

    try { localStorage.setItem('twitchbot_commands', JSON.stringify(commands)); } catch(_) {}
    renderCommands();
    setFileLabel(`Loaded ${filename} ✔`);
    logSys(`Loaded ${Object.keys(commands).length} command(s) from ${filename}`);
  } catch(e) { logSys('Parse error: ' + e.message, true); }
}

function setFileLabel(t) {
  const el = g('fileLabel');
  if (el) el.textContent = t;
}