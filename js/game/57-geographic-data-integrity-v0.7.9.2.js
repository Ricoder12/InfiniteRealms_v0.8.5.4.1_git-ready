'use strict';
// Infinite Realms v0.7.9.2 — geographic integrity validation hardening.
// This release adds diagnostics only; it does not rewrite locations, routes, or saved references.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.9.2';
const ir0792ShellBase = typeof shell === 'function' ? shell : null;
if (ir0792ShellBase) shell = function () {
  return ir0792ShellBase.apply(this, arguments).replace(/0\.7\.8\.8/g, '0.7.9.2');
};
const ir0792RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0792RenderTitleBase) renderTitle = function () {
  return ir0792RenderTitleBase.apply(this, arguments).replace(/0\.7\.8\.8/g, '0.7.9.2');
};
const ir0792RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0792RenderCharacterBase) renderCharacter = function () {
  const html = ir0792RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.8\.8/g, 'CHARACTER STATUS · v0.7.9.2') : html;
};
