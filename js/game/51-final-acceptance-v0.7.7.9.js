/* Infinite Realms v0.7.7.9 — final regression/acceptance release branding.
 * This thin release layer changes presentation metadata only. It does not modify gameplay,
 * save data, geographic IDs, map state, travel, progression, or normalization rules.
 */
(function () {
  'use strict';

  if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.9';

  const ir0779ShellBase = typeof shell === 'function' ? shell : null;
  if (ir0779ShellBase) {
    shell = function () {
      return ir0779ShellBase.apply(this, arguments)
        .replace(/0\.7\.7\.8/g, '0.7.7.9')
        .replace(/MAPS, CHARACTER & UI POLISH/g, 'MAPS, CHARACTER & SAVE INTEGRITY');
    };
  }

  const ir0779RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
  if (ir0779RenderTitleBase) {
    renderTitle = function () {
      return ir0779RenderTitleBase.apply(this, arguments).replace(/0\.7\.7\.8/g, '0.7.7.9');
    };
  }

  const ir0779RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
  if (ir0779RenderCharacterBase) {
    renderCharacter = function () {
      const html = ir0779RenderCharacterBase.apply(this, arguments);
      return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.7\.8/g, 'CHARACTER STATUS · v0.7.7.9') : html;
    };
  }
})();
