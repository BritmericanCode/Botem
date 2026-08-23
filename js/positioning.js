/* ════════════════════════════════════════
   POSITIONING  —  core UI

   Lets the streamer pick any overlay element
   that has declared itself positionable (via
   a `positioning` block on its OverlayPlugin
   registration), then drag it directly on the
   overlay, or nudge/reset it without dragging.

   This is core, not a plugin — it has no
   overlay-side file of its own. The actual
   drag/nudge/reset logic lives in core
   overlay.js's PositionEditor; this file only
   sends the messages that drive it.

   Runtime dependencies on later-loaded files:
   sendToOverlay → obs.js
   BotPlugin     → plugins.js
   Both are only called from user-triggered
   methods, never at parse time.
════════════════════════════════════════ */

const Positioning = {

  _editing:    false,
  _selectedId: null,

  /**
   * Called once from init.js after all plugins have registered —
   * scans every registered BotPlugin definition for `positionable: true`
   * and populates the dropdown with them.
   */
  populateSelect() {
    const sel = g('posSelect');
    if (!sel) return;

    const positionable = BotPlugin.all().filter(p => p.positionable);

    if (!positionable.length) {
      const opt       = document.createElement('option');
      opt.value       = '';
      opt.textContent = 'No positionable elements loaded';
      sel.innerHTML   = '';
      sel.appendChild(opt);
      return;
    }

    positionable.forEach(p => {
      const opt       = document.createElement('option');
      opt.value       = p.id;
      opt.textContent = p.name || p.id;
      sel.appendChild(opt);
    });
  },

  onSelectChange() {
    const sel   = g('posSelect');
    const newId = sel?.value || null;

    if (this._editing) {
      sendToOverlay({ type: 'position-edit-stop' });
      this._editing = false;
      this._setEditBtnLabel();
    }

    this._selectedId = newId;
    this._setControlsEnabled(!!newId);
  },

  toggleEdit() {
    if (!this._selectedId) return;
    this._editing = !this._editing;

    sendToOverlay(this._editing
      ? { type: 'position-edit-start', id: this._selectedId }
      : { type: 'position-edit-stop' });

    this._setEditBtnLabel();
  },

  _setEditBtnLabel() {
    const btn = g('posEditBtn');
    if (btn) btn.textContent = this._editing ? '⏹ Stop Positioning' : '🖱 Start Positioning';
  },

  _setControlsEnabled(enabled) {
    ['posEditBtn', 'posUp', 'posDown', 'posLeft', 'posRight', 'posReset'].forEach(id => {
      const el = g(id);
      if (el) el.disabled = !enabled;
    });
  },

  nudge(dx, dy) {
    if (!this._selectedId) return;
    sendToOverlay({ type: 'position-nudge', id: this._selectedId, dx, dy });
  },

  reset() {
    if (!this._selectedId) return;
    sendToOverlay({ type: 'position-reset', id: this._selectedId });
  }

};