/* Infinite Realms v0.7.7.7 — unified map and Character UI polish.
 * Presentation and map-view navigation only. Existing geography, route, travel, combat,
 * condition, equipment, and save data are authoritative and are not modified here.
 */
(function () {
  'use strict';

  function ir0777Esc(value) {
    return typeof esc === 'function'
      ? esc(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
  }

  function ir0777ActiveView() {
    try {
      if (typeof ir0772MapScope !== 'undefined') {
        if (ir0772MapScope === 'regional') return 'regional';
        if (ir0772MapScope === 'local') return 'local';
      }
    } catch (_) { /* Older accepted builds can omit the transient map-scope binding. */ }
    return 'world';
  }

  function ir0777ViewSwitcher(activeView) {
    const model = typeof ir0772WorldMapModel === 'function' ? ir0772WorldMapModel() : null;
    const hasUsableRegion = !!(model?.region && model?.current);
    const views = [
      { id: 'world', icon: '✧', label: 'World', action: 'ir0777-map-world', title: 'Open the world atlas: overview of charted land and recorded hierarchy.' },
      { id: 'regional', icon: '⌖', label: 'Regional', action: 'ir0777-map-regional', title: 'Open the regional map: known places, selectable markers, and verified route connections.' },
      { id: 'local', icon: '⌂', label: 'Local', action: 'ir0777-map-local', title: 'Open the local view: current-site services, occupants, and existing exits.' }
    ];
    const buttons = views.map(view => {
      const active = activeView === view.id;
      return `<button type="button" data-action="${view.action}" title="${ir0777Esc(view.title)}" aria-label="${ir0777Esc(view.title)}" aria-pressed="${active ? 'true' : 'false'}" ${active ? 'aria-current="page"' : ''} ${!hasUsableRegion ? 'disabled' : ''}><span aria-hidden="true">${view.icon}</span><span>${view.label}</span>${active ? '<span class="ir0777-map-active-mark" aria-hidden="true">◆</span>' : ''}</button>`;
    }).join('');
    return `<nav class="ir0777-map-view-switcher" aria-label="Map views">
      <div class="ir0777-map-switcher-title"><strong>Map layers</strong><small>Switch between the world atlas, regional chart, and current-site view. This changes the map display, not your location or travel time.</small></div>
      <div class="ir0777-map-switcher-buttons" role="group" aria-label="Choose map view">${buttons}</div>
      <p class="ir0777-map-switcher-hint"><strong>Map key:</strong> gold marker/ring = current or selected location · solid line = recorded connection · dashed line = recorded shortcut. Map lines are schematic rather than surveyed roads.</p>
    </nav>`;
  }

  function ir0777InjectSwitcher(html) {
    if (typeof html !== 'string' || !html) return html;
    const active = ir0777ActiveView();
    const switcher = ir0777ViewSwitcher(active);
    if (html.includes('ir0772-atlas-frame')) {
      return html.replace('<section class="ir0772-atlas-frame"', `${switcher}<section class="ir0772-atlas-frame"`);
    }
    if (html.includes('ir0773-regional-panel')) {
      // Replace the one-off World Atlas backbar with a shared, all-layer control.
      if (html.includes('<div class="ir0772-map-viewbar"')) {
        html = html.replace(/<div class="ir0772-map-viewbar">[\s\S]*?(?=<section[^>]*ir0772-regional-panel)/, switcher);
      } else {
        html = html.replace('<section class="panel panel-pad world-map-panel ir0772-regional-panel"', `${switcher}<section class="panel panel-pad world-map-panel ir0772-regional-panel"`);
      }
      return html;
    }
    if (html.includes('ir0773-local-panel')) {
      // Replace the older two-button local nav so the same three controls live in the same place.
      if (html.includes('<div class="ir0773-local-nav">')) {
        html = html.replace(/<div class="ir0773-local-nav">[\s\S]*?(?=<section[^>]*ir0773-local-panel)/, switcher);
      } else {
        html = html.replace('<section class="panel panel-pad ir0773-local-panel"', `${switcher}<section class="panel panel-pad ir0773-local-panel"`);
      }
      return html;
    }
    return html;
  }

  // Wrap the final accepted renderer, leaving every underlying map geometry renderer untouched.
  const ir0777RenderWorldBase = typeof renderWorld === 'function' ? renderWorld : null;
  if (ir0777RenderWorldBase) {
    renderWorld = function () {
      return ir0777InjectSwitcher(ir0777RenderWorldBase.apply(this, arguments));
    };
  }

  function ir0777SwitchMapView(action) {
    if (state?.combat?.active) {
      if (typeof toast === 'function') toast('Finish the current encounter before switching map views.');
      return true;
    }
    const model = typeof ir0772WorldMapModel === 'function' ? ir0772WorldMapModel() : null;
    if (!model?.region || !model?.current) {
      if (typeof toast === 'function') toast('A complete current-region record is not available in this save.');
      return true;
    }
    if (action === 'ir0777-map-world') {
      ir0772MapScope = 'atlas';
      if (typeof ir0772SelectedFromIntel !== 'undefined') ir0772SelectedFromIntel = false;
    } else if (action === 'ir0777-map-regional') {
      const selected = typeof ir0773SelectedRecord === 'function' ? ir0773SelectedRecord(model) : null;
      if (!selected || (typeof ir0772CanInspectSite === 'function' && !ir0772CanInspectSite(selected, model, false))) {
        ir0772SelectedGeoId = model.current.geoId || model.current.id || null;
      }
      ir0772SelectedFromIntel = false;
      ir0772MapScope = 'regional';
    } else if (action === 'ir0777-map-local') {
      ir0772MapScope = 'local';
    } else {
      return false;
    }
    if (typeof render === 'function') render();
    return true;
  }

  const ir0777RunActionBase = typeof runAction === 'function' ? runAction : null;
  if (ir0777RunActionBase) {
    runAction = function (target) {
      const action = target?.dataset?.action;
      if (['ir0777-map-world', 'ir0777-map-regional', 'ir0777-map-local'].includes(action)) {
        ir0777SwitchMapView(action);
        return;
      }
      return ir0777RunActionBase.apply(this, arguments);
    };
  }

  // Keep modifier/value help available on focus and hover without changing the displayed values.
  const ir0777RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
  if (ir0777RenderCharacterBase) {
    renderCharacter = function () {
      let html = ir0777RenderCharacterBase.apply(this, arguments);
      if (typeof html !== 'string') return html;
      html = html.replace('CHARACTER STATUS · v0.7.7.6', 'CHARACTER STATUS · v0.7.7.7');
      let meterIndex = 0;
      html = html.replace(/<div class="ir0776-meter">/g, () => {
        meterIndex += 1;
        const label = meterIndex === 1
          ? 'title="Health currently available compared with maximum health."'
          : meterIndex === 2
            ? 'title="Current stamina or energy compared with maximum energy."'
            : '';
        return `<div class="ir0776-meter" ${label}>`;
      });
      html = html.replace(/(<div class="ir0776-gear">)/g, '$1');
      html = html.replace('>Equipped gear summary</h3>', ' title="Item names and numeric bonuses come from the existing equipment data.">Equipped gear summary</h3>');
      return html;
    };
  }

  // Update release branding after inherited v0.7.7.6 wrappers have run.
  if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.7';
  const ir0777ShellBase = typeof shell === 'function' ? shell : null;
  if (ir0777ShellBase) {
    shell = function () {
      return ir0777ShellBase.apply(this, arguments)
        .replace(/0\.7\.7\.6/g, '0.7.7.7')
        .replace(/MAPS, TRAVEL & CHARACTER STATUS/g, 'MAPS, CHARACTER & UI POLISH');
    };
  }
  const ir0777RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
  if (ir0777RenderTitleBase) {
    renderTitle = function () {
      return ir0777RenderTitleBase.apply(this, arguments).replace(/0\.7\.7\.6/g, '0.7.7.7');
    };
  }
})();
