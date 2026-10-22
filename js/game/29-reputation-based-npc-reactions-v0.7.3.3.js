'use strict';
// ================= Infinite Realms v0.7.3.3 — reputation-based NPC reactions =================
// Keep the patch additive: social refusals are action-specific; occupation services stay available.

const ir0733ModalBase = ir073InteractionModalBase;
const ir0733PriceBase = ir04ItemPrice;
const ir0733ContextLineBase = ir073ContextLine;
const ir0733MemoryStandingBase = ir073MemoryStanding;

function ir0733TextOfMemory(m) {
 return `${String(m?.kind || '')} ${String(m?.text || '')}`.toLowerCase();
}
function ir0733IsHarmMemory(m) {
 return /broken.?promise|promise.?broken|betray|crime|theft|assault|murder|killed|stole|threaten|harmed|hurt/.test(ir0733TextOfMemory(m));
}
function ir0733IsRepairMemory(m) {
 return /reconcil|make amends|apolog|forgiven|forgive|promise.?kept|kept.*promise/.test(ir0733TextOfMemory(m));
}

// Public reputation is not a substitute for the specific NPC's remembered experience.
// A later explicit reconciliation can soften the active grievance; ordinary gifts or help
// do not erase an earlier harmful event.
function ir0733PersonalGrievance(n) {
 if (!n) return null;
 let relationship = null;
 try { relationship = ir06Relationship(n); } catch (e) {}
 if (String(relationship?.status || '').toLowerCase() === 'enemy') {
  return { kind: 'personal-rivalry', text: `${n.name} regards you as a personal enemy.`, day: null };
 }
 const memories = Array.isArray(n.memories) ? n.memories : [];
 const relevant = memories.find(m => ir0733IsHarmMemory(m) || ir0733IsRepairMemory(m));
 const lastHarm = n.ir073LastHarm && typeof n.ir073LastHarm === 'object' ? n.ir073LastHarm : null;
 if (relevant && ir0733IsHarmMemory(relevant)) {
  const memoryDay = Number(relevant.day);
  const lastHarmDay = Number(lastHarm?.day);
  if (lastHarm && Number.isFinite(lastHarmDay) && (!Number.isFinite(memoryDay) || lastHarmDay > memoryDay)) {
   return { kind: String(lastHarm.type || 'harm'), text: String(lastHarm.detail || 'A harmful action remains in this NPC’s personal history.'), day: lastHarmDay };
  }
  return { kind: String(relevant.kind || 'harm'), text: String(relevant.text || 'A harmful action remains in this NPC’s personal history.'), day: Number.isFinite(memoryDay) ? memoryDay : null };
 }
 if (relevant && ir0733IsRepairMemory(relevant)) {
  const repairDay = Number(relevant.day), lastHarmDay = Number(lastHarm?.day);
  // Since NPC memories are newest-first, a same-day repair appearing before a harm is
  // already handled by the harm branch above. A newer repair can soften this grievance.
  if (!lastHarm || !Number.isFinite(lastHarmDay) || !Number.isFinite(repairDay) || repairDay >= lastHarmDay) return null;
 }
 if (lastHarm) return { kind: String(lastHarm.type || 'harm'), text: String(lastHarm.detail || 'A harmful action remains in this NPC’s personal history.'), day: Number(lastHarm.day) };
 return null;
}

// Persistent harmful memories take precedence over unrelated positive memories when
// computing the standing used by existing talk and favor calculations.
ir073MemoryStanding = function(n) {
 if (ir0733PersonalGrievance(n)) return -3;
 return ir0733MemoryStandingBase.apply(this, arguments);
};

// Make the existing response line acknowledge the NPC's own remembered grievance even
// when the player has a Celebrated public reputation or a more recent unrelated gift.
ir073ContextLine = function(n) {
 const grievance = ir0733PersonalGrievance(n);
 if (grievance) {
  const kind = String(grievance.kind || '').toLowerCase();
  const text = String(grievance.text || '').toLowerCase();
  if (/promise/.test(kind + ' ' + text)) return `${n.name} remembers the broken promise. Your public standing does not erase the personal history between you.`;
  if (/crime|theft|assault|murder|killed|stole|harm|hurt|threaten/.test(kind + ' ' + text)) {
   return n.tier === 'unique'
    ? `${n.name} remembers the harm recorded in their personal history. As a key local figure, they will weigh that experience even if the wider public respects you.`
    : `${n.name} remembers the harm recorded in their personal history. Public reputation cannot make them forget what happened to them personally.`;
  }
  return `${n.name} remembers the personal history between you and remains cautious; public reputation alone does not establish trust.`;
 }
 return ir0733ContextLineBase.apply(this, arguments);
};

// Restore the original presence/combat gate for NPC references. The v0.7.3.2 wrapper
// blocked the entire NPC modal/service surface at low reputation; social handlers below
// still apply their own refusal checks, while trades, lodging, training and safety services
// remain usable so a low-reputation player is not soft-locked.
if (typeof ir073RequireNPCBase === 'function') ir072RequireNPC = ir073RequireNPCBase;

// Render the normal occupation modal for all NPCs and add contextual reputation guidance.
// The original all-purpose refusal overlay is intentionally not used: refusals happen on
// appropriate social actions, while occupation-specific behavior remains visible.
ir072InteractionModal = function() {
 const n = ir072NPC(modal?.npc);
 let html = ir0733ModalBase.apply(this, arguments);
 if (!n) return html;
 const rep = ir073Rep(), tier = ir073RepTier(rep), grievance = ir0733PersonalGrievance(n);
 let note = '';
 if (ir073ShouldRefuse(n)) {
  note = `<section class="notice warning ir0733-standing-note"><strong>${esc(tier)} public standing (${rep})</strong><p>${esc(n.name)} may refuse conversation, gifts, favors, or bargaining because of what people know about you. Available occupation services remain listed separately.</p></section>`;
 } else if (rep >= 25) {
  note = `<section class="notice ir0733-standing-note"><strong>${esc(tier)} public standing (${rep})</strong><p>Your public standing may improve eligible conversations and merchant negotiations, but it does not replace this person’s own trust or memories.</p></section>`;
 } else if (rep <= -1) {
  note = `<section class="notice ir0733-standing-note"><strong>${esc(tier)} public standing (${rep})</strong><p>Some social interactions may be harder. Public reputation is separate from this NPC’s personal relationship with you.</p></section>`;
 }
 const context = `<section class="ir073-social-context ir0733-personal-context"><strong>Personal history</strong><p>${esc(ir073ContextLine(n))}</p></section>`;
 html = html.replace(/(<section class="ir072-location-context">[\s\S]*?<\/section>)/, `$1${note}${context}`);
 return html.replace(/NPC INTERACTIONS · V0\.7\.2(?:\.\d+)?/g, 'NPC INTERACTIONS · V0.7.3.3');
};

// Merchant copy makes the relationship-sensitive discount rule visible before bargaining.
const ir0733ShopCardBase = ir072ShopCard;
ir072ShopCard = function(n) {
 let html = ir0733ShopCardBase.apply(this, arguments);
 if (n && ir0733PersonalGrievance(n)) {
  html = html.replace('High public reputation improves both your odds and the size of the offer.', 'A personal grievance can limit this NPC to the usual 8% offer; public standing alone does not erase their memory.');
 }
 return html;
};

// Keep the current v0.7.3 bargain cooldown, costs, one-purchase coupon, and price tiers.
// A remembered personal grievance removes the *public-reputation bonus*, not market access.
ir072Bargain = function(id) {
 const n = ir072RequireNPC(id); if (!n) return;
 if (ir073ShouldRefuse(n)) {
  ir073RecordRefusal(n);
  toast(`${n.name} declines to negotiate because your public reputation is ${ir073Rep()} (${ir073RepTier()}). Other available market services remain usable.`);
  return;
 }
 const c = state.character, s = site(), v = ir072Data(), day = Number(c.daysLived) || 0;
 if (ir072Occupation(n) !== 'merchant') { toast('Only a merchant or trader can negotiate a market offer.'); return; }
 if (!ir072CanShopHere()) { toast('There is no usable market service at this location.'); return; }
 if (Number(v.bargainAttempts?.[n.id] ?? -999) === day) { toast('You already tried bargaining with this merchant today.'); return; }
 if (v.activeBargain?.siteId === s.id) { toast('You already have a negotiated discount waiting for one purchase here.'); return; }
 if (c.energy < 4) { toast('You need 4 energy to negotiate.'); return; }
 if (c.hunger < 8) { toast('Eat something before negotiating.'); return; }
 const rep = ir073Rep(), grievance = !!ir0733PersonalGrievance(n);
 const discount = !grievance && rep >= 60 ? 15 : !grievance && rep >= 25 ? 12 : 8;
 const chance = clamp(
  38 + Math.max(0, (c.skills?.Trade?.level || 1) - 1) * 4 + ((c.attrs?.Charisma || 10) - 10) * 2 +
  (ir06Trait(n, 'generous') ? 5 : 0) - (ir06Trait(n, 'cautious') ? 5 : 0) +
  (grievance ? 0 : Math.max(0, Math.floor(rep / 10))), 20, 85
 );
 v.bargainAttempts = v.bargainAttempts || {};
 v.bargainAttempts[n.id] = day;
 c.energy -= 4;
 if (Math.random() * 100 < chance) {
  v.activeBargain = { npcId: n.id, npcName: n.name, siteId: s.id, percent: discount, createdDay: day };
  const r = ir06Relationship(n);
  if (rep >= 25 && !grievance) { r.trust = clamp((Number(r.trust) || 0) + 1, -100, 100); n.trust = r.trust; }
  const detail = grievance
   ? `${n.name} agreed to a base ${discount}% discount on one eligible purchase at ${s.name}. Your public reputation did not erase their personal reservations, so no reputation-based discount bonus applied.`
   : `${n.name} agreed to a ${discount}% discount on one eligible purchase at ${s.name}. Your ${ir073RepTier(rep).toLowerCase()} public standing and trade skill helped secure the offer.`;
  ir06Remember(n, detail, 'bargain');
  addFeed('🤝', 'Bargain accepted', detail, 'social'); persist(); modal = null; render(); toast(`Bargain accepted: ${discount}% off one item here.`);
 } else {
  const detail = grievance
   ? `You tried to bargain with ${n.name} at ${s.name}, but they held to listed prices. Their personal reservations outweighed any general public regard; no coins were charged.`
   : `You tried to bargain with ${n.name} at ${s.name}, but they held to the listed prices. Your ${ir073RepTier(rep).toLowerCase()} public standing and trade skill influenced the negotiation; no coins were charged.`;
  ir06Remember(n, detail, 'bargain'); addFeed('🤝', 'Bargain declined', detail, 'social'); persist(); modal = null; render(); toast('The merchant declined. No coins were charged; 4 energy was spent.');
 }
};

// Final guard for market prices. The existing economy owns the formula; this layer only
// guarantees a finite, whole-number price of at least one coin after any eligible coupon.
ir04ItemPrice = function(id, mode = 'buy', siteId = site()?.id) {
 const value = ir0733PriceBase.apply(this, arguments);
 const price = Number(value);
 if (!Number.isFinite(price)) return 1;
 return Math.max(1, Math.round(price));
};

// Carry the patch version through the existing save/version chain without changing schema 8.
const ir0733ShellBase = shell;
shell = function() {
 return ir0733ShellBase.apply(this, arguments)
  .replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g, 'VERSION 0.7.3.3')
  .replace(/V0\.7\.3(?:\.\d+)?/g, 'V0.7.3.3');
};
const ir0733TopbarBase = topbar;
topbar = function() { return ir0733TopbarBase.apply(this, arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g, 'VERSION 0.7.3.3'); };
const ir0733PersistBase = persist;
persist = function() {
 const result = ir0733PersistBase.apply(this, arguments);
 if (state?.character) {
  state.gameVersion = '0.7.3.3';
  state.saveSchemaVersion = IR073_SAVE_SCHEMA;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
 }
 return result;
};
const ir0733NormalizeBase = normalizeSave;
normalizeSave = function() {
 const result = ir0733NormalizeBase.apply(this, arguments);
 if (result?.character) { result.gameVersion = '0.7.3.3'; result.saveSchemaVersion = IR073_SAVE_SCHEMA; }
 return result;
};
if (typeof document !== 'undefined') {
 document.title = 'Infinite Realms — Version 0.7.3.3';
 const css = document.createElement('style');
 css.textContent = '.ir0733-standing-note{margin:10px 0}.ir0733-standing-note p{font-size:11px;line-height:1.6;margin:5px 0 0;color:var(--muted)}.ir0733-personal-context{margin-top:10px}';
 document.head.appendChild(css);
}
// ================= End Infinite Realms v0.7.3.3 patch =================
