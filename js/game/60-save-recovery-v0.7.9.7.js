'use strict';
// Preserve unreadable autosave bytes before a later new life can replace the active key.
const IR0797_RECOVERY_KEY = 'infiniteRealms.v0797.damaged-autosave';
const ir0797ReadAutosaveBase = typeof readAutosave === 'function' ? readAutosave : null;
if (ir0797ReadAutosaveBase) {
  readAutosave = function () {
    const loaded = ir0797ReadAutosaveBase.apply(this, arguments);
    if (loaded) return loaded;
    try {
      const primary = localStorage.getItem(SAVE_KEY);
      const legacy = primary ? null : localStorage.getItem(LEGACY_SAVE_KEY);
      const raw = primary || legacy;
      if (raw && !localStorage.getItem(IR0797_RECOVERY_KEY)) {
        localStorage.setItem(IR0797_RECOVERY_KEY, JSON.stringify({
          savedAt: new Date().toISOString(),
          sourceKey: primary ? SAVE_KEY : LEGACY_SAVE_KEY,
          raw
        }));
      }
    } catch (error) { /* Storage can be unavailable; leave the original autosave untouched. */ }
    return null;
  };
}

const ir0797RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0797RenderTitleBase) {
  renderTitle = function () {
    const html = ir0797RenderTitleBase.apply(this, arguments);
    let recovery = null;
    try { recovery = JSON.parse(localStorage.getItem(IR0797_RECOVERY_KEY) || 'null'); } catch (error) {}
    if (!recovery || typeof recovery.raw !== 'string') return html;
    const notice = '<section class="notice" role="status"><strong>Unreadable autosave preserved.</strong> A recovery copy is stored in this browser profile before a new life can replace the autosave.</section>';
    return typeof html === 'string' ? html.replace('<main class="creator">', `<main class="creator">${notice}`) : html;
  };
}
