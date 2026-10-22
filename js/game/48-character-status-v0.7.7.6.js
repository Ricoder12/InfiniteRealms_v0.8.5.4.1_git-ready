/* Infinite Realms v0.7.7.6 — append-only Character Status summary.
 * Preserve the accepted v0.7.7.5 Character screen unchanged, then append live
 * condition, location/environment, and equipped-gear details below it.
 * Presentation only: existing character/game state remains the source of truth.
 */
(function () {
  const ir0776OriginalRenderCharacter = renderCharacter;

  function ir0776Safe(value) {
    return typeof esc === 'function'
      ? esc(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
  }

  function ir0776Meter(label, current, maximum, colorClass) {
    if (current == null || maximum == null) return '';
    const currentNumber = Number(current);
    const maximumNumber = Number(maximum);
    if (!Number.isFinite(currentNumber) || !Number.isFinite(maximumNumber) || maximumNumber <= 0) return '';
    const percent = Math.max(0, Math.min(100, currentNumber / maximumNumber * 100));
    return `<div class="ir0776-meter"><div class="ir0776-meter-label"><span>${label}</span><b>${ir0776Safe(currentNumber)} / ${ir0776Safe(maximumNumber)}</b></div><i><em class="${colorClass}" style="width:${percent}%"></em></i></div>`;
  }

  function ir0776RecordedConditions(character) {
    const found = [];
    for (const source of [character?.conditions, character?.statusEffects, character?.effects, character?.activeEffects]) {
      if (Array.isArray(source)) {
        for (const item of source) {
          if (typeof item === 'string') found.push(item);
          else if (item && item.active !== false) found.push(item.name || item.label || item.description || item.id);
        }
      } else if (source && typeof source === 'object') {
        for (const [key, item] of Object.entries(source)) {
          if (item && item.active !== false && item !== 0 && item !== false) {
            found.push(typeof item === 'string' ? item : (item.name || item.label || item.description || key));
          }
        }
      }
    }
    return [...new Set(found.filter(Boolean).map(String))];
  }

  function ir0776CurrentSite(world) {
    if (typeof ir0763CurrentSite === 'function') {
      const resolved = ir0763CurrentSite();
      if (resolved) return resolved;
    }
    const sites = world?.region?.sites;
    if (Array.isArray(sites) && world?.siteId) {
      const matches = sites.filter(siteRecord => siteRecord?.id === world.siteId);
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  function ir0776EquipmentSummary(character) {
    const slots = [
      ['weapon', 'Weapon', '⚔️'], ['head', 'Head', '🪖'], ['armor', 'Armor', '🛡️'],
      ['hands', 'Hands', '🧤'], ['legs', 'Legs', '🦵'], ['feet', 'Feet', '🥾'],
      ['offhand', 'Off-hand', '🔰'], ['accessory', 'Accessory', '💍']
    ];
    return slots.map(([slot, label, icon]) => {
      const id = character?.equipment?.[slot];
      const item = id ? ITEMS?.[id] : null;
      const weaponDamage = id ? (item?.damage ?? IR_WEAPON_DATA?.[id]?.damage) : null;
      const armorValue = id ? (item?.defense ?? item?.armor ?? IR_V05_GEAR?.[id]?.armor) : null;
      const bonuses = [];
      if (weaponDamage != null && Number.isFinite(Number(weaponDamage)) && Number(weaponDamage) > 0) bonuses.push(`Damage ${Number(weaponDamage)}`);
      if (armorValue != null && Number.isFinite(Number(armorValue)) && Number(armorValue) > 0) bonuses.push(`Armor ${Number(armorValue)}`);
      if (item?.magic != null && Number(item.magic) > 0) bonuses.push(`Magic ${Number(item.magic)}`);
      if (item?.manaBonus != null && Number(item.manaBonus) !== 0) bonuses.push(`Mana ${Number(item.manaBonus) > 0 ? '+' : ''}${Number(item.manaBonus)}`);
      return `<div class="ir0776-gear"><span>${icon} ${label}</span><b>${id && item ? ir0776Safe(item.name || id) : 'Empty'}</b><small>${id ? ir0776Safe(bonuses.join(' · ') || item?.desc || 'Equipped item; no numeric bonus recorded') : 'No item equipped'}</small></div>`;
    }).join('');
  }

  function ir0776Addendum() {
    const character = state?.character;
    if (!character) return '';
    const world = state?.world || {};
    const siteRecord = ir0776CurrentSite(world);
    const locationName = siteRecord?.name || 'Location unavailable';
    const conditions = ir0776RecordedConditions(character);
    let environment = null;
    if (siteRecord && typeof ir0763HazardForSite === 'function') {
      try { environment = ir0763HazardForSite(siteRecord); } catch (_) { environment = null; }
    }
    let affinityMarkup = '';
    if (siteRecord && typeof ir0764AffinityNotice === 'function') {
      try { affinityMarkup = ir0764AffinityNotice(siteRecord); } catch (_) { affinityMarkup = ''; }
    }
    const conditionMarkup = conditions.length
      ? `<ul class="ir0776-condition-list">${conditions.map(item => `<li>${ir0776Safe(item)}</li>`).join('')}</ul>`
      : '<p class="muted">No character-specific status effects are currently recorded in the character state.</p>';
    const environmentMarkup = environment
      ? (() => {
          const affinityReduction = typeof ir0764HazardEnergyReduction === 'function' ? Math.max(0, Number(ir0764HazardEnergyReduction(siteRecord)) || 0) : 0;
          const effectiveEnergyLoss = environment.mitigated ? 0 : Math.max(0, Number(environment.energyLoss) - affinityReduction);
          const effectiveHealthLoss = environment.mitigated ? 0 : Math.max(0, Number(environment.healthLoss) || 0);
          const impact = environment.mitigated
            ? '<small>Current Survival skill or equipment prevents this hazard’s recurring effects.</small>'
            : `<small>Effective loss: ${ir0776Safe(effectiveEnergyLoss)} energy${effectiveHealthLoss ? ` · ${ir0776Safe(effectiveHealthLoss)} health` : ''} per interval.</small>`;
          const affinity = affinityReduction && !environment.mitigated
            ? `<small>Current racial affinity reduces energy loss by ${ir0776Safe(Math.min(affinityReduction, Number(environment.energyLoss) || 0))} per interval.</small>`
            : '';
          return `<div class="ir0776-effect-row"><strong>${ir0776Safe(environment.icon || '⚠️')} ${ir0776Safe(environment.name || 'Environmental hazard')}</strong><p>${ir0776Safe(environment.warning || environment.desc || 'An existing environmental hazard applies at this location.')}</p>${impact}${affinity}</div>`;
        })()
      : '<p class="muted">No active environmental hazard is reported by the existing hazard system for this location.</p>';

    return `<section class="panel panel-pad ir0776-addendum" aria-label="Additional character status">
      <div class="panel-heading"><div><div class="eyebrow">CHARACTER STATUS · v0.7.7.6</div><h3>Current condition</h3><p>Live values read from your existing character state.</p></div><span class="tag blue">STATUS</span></div>
      ${ir0776Meter('Health', character.health, character.maxHealth, 'health')}
      ${ir0776Meter('Stamina / Energy', character.energy, character.maxEnergy, 'energy')}
      <div class="ir0776-condition-facts">${character.hunger != null ? `<div><span>Hunger</span><b>${ir0776Safe(character.hunger)}</b></div>` : ''}${character.mood != null ? `<div><span>Mood</span><b>${ir0776Safe(character.mood)}</b></div>` : ''}<div><span>Current location</span><b>${ir0776Safe(locationName)}</b></div><div><span>Money</span><b>${ir0776Safe(character.coin ?? character.money ?? 0)} ◈</b></div></div>
      <div class="grid two ir0776-condition-grid"><section class="ir0776-inner-panel"><h4>Recorded conditions & temporary effects</h4>${conditionMarkup}${affinityMarkup}</section><section class="ir0776-inner-panel"><h4>Current environmental effect</h4>${environmentMarkup}</section></div>
      <div class="panel-heading ir0776-equipment-heading"><div><h3>Equipped gear summary</h3><p>Equipment is read from the existing loadout. Manage and change items in Inventory.</p></div><span class="tag gold">LOADOUT</span></div>
      <div class="ir0776-gear-grid">${ir0776EquipmentSummary(character)}</div>
      <button class="button block ir0776-inventory-link" data-tab="Inventory">Open Inventory & equipment</button>
    </section>`;
  }

  // Keep the accepted Character screen intact and append the new status section after it.
  renderCharacter = function () {
    const originalScreen = ir0776OriginalRenderCharacter.apply(this, arguments);
    return originalScreen + ir0776Addendum();
  };

  // Release branding: v0.7.7.5 sets an older title and shell label before this module loads.
  if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.6';
  const ir0776OriginalShell = typeof shell === 'function' ? shell : null;
  if (ir0776OriginalShell) {
    shell = function () {
      return ir0776OriginalShell.apply(this, arguments)
        .replace(/0\.7\.7\.5/g, '0.7.7.6')
        .replace(/MAPS &amp; TRAVEL|MAPS & TRAVEL/g, 'MAPS, TRAVEL & CHARACTER STATUS');
    };
  }
  const ir0776OriginalRenderTitle = typeof renderTitle === 'function' ? renderTitle : null;
  if (ir0776OriginalRenderTitle) {
    renderTitle = function () {
      return ir0776OriginalRenderTitle.apply(this, arguments).replace(/0\.7\.7\.5/g, '0.7.7.6');
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .ir0776-addendum{margin-top:18px}
    .ir0776-meter{margin:12px 0}
    .ir0776-meter-label{display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:5px}
    .ir0776-meter>i{display:block;height:9px;background:var(--line,#303544);border-radius:20px;overflow:hidden}
    .ir0776-meter em{display:block;height:100%;border-radius:20px}
    .ir0776-meter .health{background:#d85b68}.ir0776-meter .energy{background:#55a9d8}
    .ir0776-condition-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}
    .ir0776-condition-facts>div,.ir0776-gear{padding:10px;border:1px solid var(--line,#303544);border-radius:10px;min-width:0}
    .ir0776-condition-facts span,.ir0776-gear>span{display:block;color:var(--muted,#9ba3b5);font-size:12px;margin-bottom:5px}
    .ir0776-condition-facts b,.ir0776-gear b{display:block;overflow-wrap:anywhere}
    .ir0776-condition-grid{gap:12px;margin-top:12px}
    .ir0776-inner-panel{padding:14px;border:1px solid var(--line,#303544);border-radius:12px;min-width:0}
    .ir0776-inner-panel h4{margin:0 0 10px;font-size:14px}
    .ir0776-inner-panel p{margin:7px 0}
    .ir0776-condition-list{margin:0;padding-left:20px}
    .ir0776-effect-row small{color:var(--muted,#9ba3b5)}
    .ir0776-equipment-heading{margin-top:18px}
    .ir0776-gear-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
    .ir0776-gear small{display:block;color:var(--muted,#9ba3b5);font-size:11px;margin-top:5px;overflow-wrap:anywhere}
    .ir0776-inventory-link{margin-top:12px}
    @media(max-width:760px){.ir0776-gear-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ir0776-condition-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
})();
