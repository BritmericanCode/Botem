/* ════════════════════════════════════════
   UTILITY FUNCTIONS
   No dependencies — safe to load first.
════════════════════════════════════════ */

/** Get DOM element by id */
function g(id) { return document.getElementById(id); }

/**
 * Escape HTML to prevent XSS in innerHTML contexts.
 * Covers all five characters that are dangerous in both
 * element content and attribute values (single- and double-quoted).
 */
function esc(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');   // FIX: added — prevents injection in single-quoted attributes
}

/*
 * FIX: moved to module scope.
 * Previously declared as `const p = n => ...` inside fmtDur,
 * creating a new function object on every timer tick.
 */
const _pad2 = n => String(n).padStart(2, '0');

/** Format seconds → MM:SS or H:MM:SS */
function fmtDur(secs) {
  secs = Math.max(0, Math.ceil(secs));
  const h = Math.floor(secs / 3600),
        m = Math.floor((secs % 3600) / 60),
        s = secs % 60;
  return h ? `${h}:${_pad2(m)}:${_pad2(s)}` : `${_pad2(m)}:${_pad2(s)}`;
}

/**
 * Parse "5:00", "300", "1:30:00" → seconds.
 * Returns 0 for any input that cannot be cleanly parsed.
 */
function parseTimeDuration(str) {
  const parts = (str || '').trim().split(':');
  // FIX: reject malformed input (e.g. "1:2:3:4") rather than silently
  //      returning 1 via the parseInt(str) fallback.
  if (parts.length > 3) return 0;
  // FIX: parseInt with explicit radix; Math.max clamps negative segments.
  const mapped = parts.map(x => Math.max(0, parseInt(x, 10) || 0));
  if (mapped.length === 3) return mapped[0] * 3600 + mapped[1] * 60 + mapped[2];
  if (mapped.length === 2) return mapped[0] * 60 + mapped[1];
  return Math.max(0, parseInt(str, 10) || 0);
}

/** Join array of names into natural English */
function joinTargets(arr = []) {   // FIX: default parameter — was TypeError when undefined
  if (!arr.length)      return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
}

/** Normalise a command name so it always starts with ! */
function toKey(name) {
  // FIX: trim() prevents whitespace-padded names creating broken lookup keys.
  //      (name || '') guards against null / undefined callers.
  const n = (name || '').trim().toLowerCase();
  return n.startsWith('!') ? n : '!' + n;
}

/**
 * Apply @user / @target / @targets / @random placeholders.
 *   @random          → random integer 1–100
 *   @random(min,max) → random integer in range
 */
function applyPlaceholders(tpl, dname, targets = []) {   // FIX: default — was TypeError when omitted
  return tpl
    /*
     * FIX: every static replacement now uses a function () => value
     * instead of a plain string.  String replacements interpret $& / $1 / $'
     * as special insertion patterns — a display name containing a $ sign
     * would silently corrupt the output.
     */
    .replace(/@user\b/gi,    () => dname)
    .replace(/@targets\b/gi, () => joinTargets(targets))
    .replace(/@target\b/gi,  () => targets[0] || '')
    .replace(/@random\((\d+)\s*,\s*(\d+)\)/gi, (_, a, b) => {
      const lo = Math.min(parseInt(a, 10), parseInt(b, 10));   // FIX: radix
      const hi = Math.max(parseInt(a, 10), parseInt(b, 10));   // FIX: radix
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    })
    .replace(/@random(?!\()\b/gi, () => String(Math.floor(Math.random() * 100) + 1));
}