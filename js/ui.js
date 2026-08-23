/* ════════════════════════════════════════
   UI HELPERS & RENDERING
════════════════════════════════════════ */

// ── General UI ───────────────────────────────────

function setUI(state) {
  const badge = g('statusBadge'), btn = g('connBtn'); if (!badge || !btn) return;
  btn.disabled = false;
  if (state === 'on') {
    badge.className = 'live'; badge.textContent = `● #${channel}`;
    btn.textContent = 'Disconnect'; btn.className = 'btn-full btn-red';
  } else if (state === 'connecting') {
    badge.className = ''; badge.textContent = '● Connecting…';
    btn.textContent = 'Connecting…'; btn.className = 'btn-full btn-muted'; btn.disabled = true;
  } else {
    badge.className = ''; badge.textContent = '● Disconnected';
    btn.textContent = 'Connect'; btn.className = 'btn-full btn-purple';
  }
}

function logSys(text, isError = false) {
  const log = g('chatLog'); if (!log) return;
  const d = document.createElement('div');
  d.className   = `msg ${isError ? 'msg-err' : 'msg-sys'}`;
  d.textContent = text;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
}

function addChat(name, text, isBot) {
  const log = g('chatLog'); if (!log) return;
  const d = document.createElement('div');
  d.className = `msg msg-chat ${isBot ? 'bot' : 'viewer'}`;
  d.innerHTML = `<span class="who">${esc(name)}</span>: ${esc(text)}`;
  log.appendChild(d); log.scrollTop = log.scrollHeight;

  /*
   * FIX: route every displayed line through BotPlugin.dispatchDisplay().
   * This replaces the need for individual plugins to monkey-patch
   * addChat directly — see the dispatchDisplay() comment in plugins.js
   * for the full rationale. Guarded with a typeof check purely for
   * defensive symmetry with the rest of the codebase; BotPlugin is
   * always defined by the time addChat is actually called in practice.
   */
  if (typeof BotPlugin !== 'undefined') BotPlugin.dispatchDisplay(name, text, isBot);
}

// ── Token ─────────────────────────────────────────

function openTokenGenerator() {
  window.open('https://twitchtokengenerator.com', '_blank', 'noopener,noreferrer');
}

async function pasteToken() {
  try {
    let t = (await navigator.clipboard.readText()).trim();
    if (!t) { logSys('Clipboard empty.', true); return; }
    if (!t.startsWith('oauth:')) t = 'oauth:' + t;
    g('inOauth').value           = t;
    g('tokenStatus').textContent = '✔ ready';
    logSys('Token pasted ✔ — enter channel and connect.');
  } catch(_) { logSys('Clipboard access denied — paste manually.', true); }
}

// ── Collapsible panels ────────────────────────────

function togglePanel(id) {
  const panel = g('panel-' + id); if (!panel) return;
  panel.classList.toggle('collapsed');
}

function loadPanelStates() {
  document.querySelectorAll('.panel[id^="panel-"]').forEach(p => {
    p.classList.add('collapsed');
  });

  const connPanel = g('panel-connection');
  if (connPanel) {
    connPanel.classList.add('panel-incomplete');
    const savedUser = localStorage.getItem('twitchbot_user') || '';
    const savedChan = localStorage.getItem('twitchbot_chan') || '';
    if (!savedUser || !savedChan) {
      connPanel.classList.remove('collapsed');
    }
  }

  const obsPanel = g('panel-obs');
  if (obsPanel) {
    obsPanel.classList.add('panel-incomplete');
    const savedIp = localStorage.getItem('twitchbot_lan_ip') || '';
    if (!savedIp) {
      obsPanel.classList.remove('collapsed');
    }
  }
}

function setPanelComplete(id) {
  const panel = g('panel-' + id);
  if (panel) panel.classList.remove('panel-incomplete');
}

function setPanelIncomplete(id, openPanel = false) {
  const panel = g('panel-' + id);
  if (!panel) return;
  panel.classList.add('panel-incomplete');
  if (openPanel) panel.classList.remove('collapsed');
}

// ── Command form ──────────────────────────────────

function setCmdType(type) {
  g('simpleFields').style.display     = type === 'simple'     ? '' : 'none';
  g('overloadedFields').style.display = type === 'overloaded' ? '' : 'none';
}

function startEdit(key) {
  editingKey = key; const cmd = commands[key];
  g('newName').value = key.slice(1);

  if (cmd.response != null) {
    document.querySelector('input[name=cmdType][value=simple]').checked = true;
    setCmdType('simple'); g('newResp').value = cmd.response;
  } else {
    document.querySelector('input[name=cmdType][value=overloaded]').checked = true;
    setCmdType('overloaded');
    g('newResp0').value = cmd.variants?.['0'] || '';
    g('newResp1').value = cmd.variants?.['1'] || '';
    g('newRespN').value = cmd.variants?.['n'] || '';
  }

  g('newCooldown').value   = cmd.cooldown   ?? 10;
  g('newPermission').value = cmd.permission || 'everyone';
  g('addCmdBtn').textContent       = 'Update Command';
  g('cancelEditBtn').style.display = '';

  const panel = g('panel-addcmd');
  if (panel) panel.classList.remove('collapsed');
  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelEdit() {
  editingKey = null;
  ['newName','newResp','newResp0','newResp1','newRespN'].forEach(id => {
    const el = g(id); if (el) el.value = '';
  });
  g('newCooldown').value   = 10;
  g('newPermission').value = 'everyone';
  document.querySelector('input[name=cmdType][value=simple]').checked = true;
  setCmdType('simple');
  g('addCmdBtn').textContent       = 'Add Command';
  g('cancelEditBtn').style.display = 'none';
}

function addCommandUI() {
  const name = g('newName').value.trim(); if (!name) return;
  const newKey = toKey(name);
  const type   = document.querySelector('input[name=cmdType]:checked').value;
  const cd     = Math.max(0, isNaN(parseInt(g('newCooldown').value)) ? 10 : parseInt(g('newCooldown').value));
  const perm   = g('newPermission').value || 'everyone';

  let cmdData;
  if (type === 'overloaded') {
    const r0 = g('newResp0').value.trim(), r1 = g('newResp1').value.trim(), rn = g('newRespN').value.trim();
    if (!r0 && !r1 && !rn) return;
    const variants = {};
    if (r0) variants['0'] = r0; if (r1) variants['1'] = r1; if (rn) variants['n'] = rn;
    cmdData = { response: null, variants, cooldown: cd, permission: perm };
  } else {
    const resp = g('newResp').value.trim(); if (!resp) return;
    cmdData = { response: resp, variants: null, cooldown: cd, permission: perm };
  }

  if (editingKey && editingKey !== newKey) delete commands[editingKey];
  commands[newKey] = cmdData;
  saveCommands(); renderCommands(); cancelEdit();
}

function removeCmd(key) {
  delete commands[key]; saveCommands(); renderCommands();
  if (editingKey === key) cancelEdit();
}

// ── Inline card controls ──────────────────────────

function setCmdPermissionUI(key, level, sel) {
  if (!(key in commands) || !PERM_LEVELS.includes(level)) return;
  commands[key].permission = level;
  sel.className = 'cmd-perm-select perm-' + level;
  saveCommands();
}

function setCmdCooldownUI(key, val, inp) {
  if (!(key in commands)) return;
  const s = Math.max(0, parseInt(val) || 0);
  commands[key].cooldown = s; inp.value = s;
  saveCommands();
}

// ── Active commands list ──────────────────────────

function renderCommands() {
  const list = g('cmdList'); if (!list) return;
  const keys = Object.keys(commands);
  if (!keys.length) { list.innerHTML = '<p class="cmd-empty">No commands added yet.</p>'; return; }

  const permOpts = [
    { value: 'everyone',  label: 'Everyone' },
    { value: 'vip',       label: 'VIP+'     },
    { value: 'moderator', label: 'Mod+'     },
    { value: 'streamer',  label: 'Streamer' }
  ];

  list.innerHTML = keys.map(k => {
    const cmd  = commands[k];
    const perm = cmd.permission || 'everyone';
    const cd   = cmd.cooldown   ?? 10;

    let body = '';
    if (cmd.response != null) {
      body = `<div class="cmd-resp" title="${esc(cmd.response)}">${esc(cmd.response)}</div>`;
    } else if (cmd.variants) {
      body = `<div class="cmd-variants">${
        ['0','1','n'].filter(v => cmd.variants[v]).map(v =>
          `<div class="cmd-variant">
             <span class="cmd-vl">${v}</span>
             <span title="${esc(cmd.variants[v])}">${esc(cmd.variants[v])}</span>
           </div>`
        ).join('')
      }</div>`;
    }

    const permSel = `<select class="cmd-perm-select perm-${perm}"
      data-action="perm"
      title="Permission level">
      ${permOpts.map(o =>
        `<option value="${o.value}"${perm === o.value ? ' selected' : ''}>${o.label}</option>`
      ).join('')}
    </select>`;

    const cdInp = `<div class="cmd-cd-wrap" title="Cooldown in seconds">
      <input class="cmd-cd-input" type="number" min="0" step="1" value="${cd}"
             data-action="cooldown">
      <span class="cmd-cd-label">s</span>
    </div>`;

    return `
      <div class="cmd-card" data-key="${esc(k)}">
        <div class="cmd-header">
          <div class="cmd-body">
            <div class="cmd-name">
              ${esc(k)}${cmd.variants ? '<span class="cmd-ol-badge">overloaded</span>' : ''}
            </div>
            ${body}
          </div>
          <div class="cmd-btns">
            <button class="btn-xs btn-edit" data-action="edit" title="Edit">✏</button>
            <button class="btn-xs" data-action="remove" title="Remove">✕</button>
          </div>
        </div>
        <div class="cmd-inline">${permSel}${cdInp}</div>
      </div>`;
  }).join('');
}

(function setupCommandListDelegation() {
  const list = g('cmdList');
  if (!list) return;

  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const key = btn.closest('.cmd-card')?.dataset.key;
    if (!key) return;

    if (btn.dataset.action === 'edit')   startEdit(key);
    if (btn.dataset.action === 'remove') removeCmd(key);
  });

  list.addEventListener('change', e => {
    const el  = e.target;
    const key = el.closest('.cmd-card')?.dataset.key;
    if (!key) return;

    if (el.dataset.action === 'perm') {
      setCmdPermissionUI(key, el.value, el);
    } else if (el.dataset.action === 'cooldown') {
      setCmdCooldownUI(key, el.value, el);
    }
  });
})();