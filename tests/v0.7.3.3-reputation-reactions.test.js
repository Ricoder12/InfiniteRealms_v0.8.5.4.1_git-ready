'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const patchPath = path.join(__dirname, '..', 'js', 'game', '29-reputation-based-npc-reactions-v0.7.3.3.js');
const patch = fs.readFileSync(patchPath, 'utf8');

function setup({ reputation = 0, npc = null, random = () => 0, basePrice = 10 } = {}) {
  const merchant = npc || { id: 'merchant-1', name: 'Mira', occupation: 'merchant', homeSite: 'town-1', memories: [], traits: [] };
  const relationships = { [merchant.id]: { affinity: 4, trust: 3, status: 'Acquaintance' } };
  const state = {
    character: { reputation, daysLived: 10, energy: 30, hunger: 50, coin: 20, attrs: { Charisma: 10 }, skills: { Trade: { level: 1 } }, relationships, npcs: [merchant] },
    world: { siteId: 'town-1', v072: { bargainAttempts: {}, activeBargain: null }, v073: { schema: 1, events: [], refusals: {} } },
    combat: null, pendingEvent: null
  };
  const calls = { toasts: [], feeds: [], remembered: [], persisted: 0, rendered: 0 };
  const math = Object.create(Math); math.random = random;
  const sandbox = {
    state, Math: math, console,
    IR073_SAVE_SCHEMA: 8, SAVE_KEY: 'ir-test-save',
    localStorage: { setItem() {} },
    site: () => ({ id: 'town-1', name: 'Greyhaven' }),
    esc: value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch])),
    ir072Data: () => state.world.v072,
    ir072NPC: id => state.character.npcs.find(n => n.id === id) || null,
    ir072IsPresent: () => true,
    ir072Blocked: () => false,
    ir072Occupation: n => String(n?.occupation || n?.role || 'resident').toLowerCase() === 'trader' ? 'merchant' : String(n?.occupation || n?.role || 'resident').toLowerCase(),
    ir072CanShopHere: () => true,
    ir072ShopCard: () => 'Try for an 8–15% discount. High public reputation improves both your odds and the size of the offer.',
    ir072RequireNPCBase: id => sandbox.ir072NPC(id),
    ir072RequireNPC: id => sandbox.ir072NPC(id),
    ir073RequireNPCBase: id => sandbox.ir072NPC(id),
    ir073InteractionModalBase: () => '<section class="ir072-location-context"><p>Town context</p></section><section class="services">Occupation services still available</section>',
    ir072InteractionModal: () => '<section class="old-refusal-overlay">old blanket refusal</section>',
    ir072Bargain: () => { throw new Error('old bargain should be replaced'); },
    ir04ItemPrice: () => basePrice,
    ir073ContextLine: n => `${n.name} has no major recorded grievance or favor to bring up yet.`,
    ir073MemoryStanding: () => 2,
    ir073ShouldRefuse: n => !!(n && Number(state.character.reputation) <= -10 && sandbox.ir072Occupation(n) !== 'guard' && !n.dead && !n.ir0724Dead),
    ir073RecordRefusal: n => { n.refusalRecorded = true; },
    ir073Rep: () => Math.max(-100, Math.min(100, Math.trunc(Number(state.character.reputation) || 0))),
    ir073RepTier: rep => { rep = rep === undefined ? sandbox.ir073Rep() : rep; return rep <= -50 ? 'Outlawed' : rep <= -25 ? 'Distrusted' : rep <= -10 ? 'Unwelcome' : rep >= 60 ? 'Celebrated' : rep >= 25 ? 'Respected' : rep >= 5 ? 'Known' : 'Unknown'; },
    ir073Data: () => state.world.v073,
    ir06Relationship: n => state.character.relationships[n.id] || (state.character.relationships[n.id] = { affinity: 0, trust: 0 }),
    ir06Trait: (n, trait) => (n.traits || []).includes(trait),
    ir06Remember: (n, text, kind) => { n.memories = Array.isArray(n.memories) ? n.memories : []; n.memories.unshift({ day: state.character.daysLived, kind, text }); n.memories = n.memories.slice(0, 5); calls.remembered.push({ npcId: n.id, text, kind }); },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    addFeed: (...args) => calls.feeds.push(args),
    toast: msg => calls.toasts.push(String(msg)),
    persist: () => { calls.persisted++; },
    render: () => { calls.rendered++; },
    modal: { kind: 'ir072-interactions', npc: merchant.id },
    shell: inner => `VERSION 0.7.3.2 ${inner || ''}`,
    topbar: () => 'VERSION 0.7.3.2',
    normalizeSave: input => JSON.parse(JSON.stringify(input)),
    document: undefined
  };
  // Mock the base implementation captured by v0.7.3.2; the patch intentionally restores it.
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: patchPath });
  return { sandbox, state, merchant, calls };
}

// 1. Low reputation does not globally lock the NPC or hide their normal occupation modal.
{
  const x = setup({ reputation: -65 });
  assert.equal(x.sandbox.ir072RequireNPC(x.merchant.id), x.merchant);
  const html = x.sandbox.ir072InteractionModal();
  assert.match(html, /Occupation services still available/);
  assert.match(html, /Outlawed public standing/);
  assert.doesNotMatch(html, /old-refusal-overlay/);
  for (const occupation of ['merchant', 'blacksmith', 'guard', 'hunter', 'scholar', 'innkeeper', 'farmer', 'resident']) {
    x.merchant.occupation = occupation;
    assert.equal(x.sandbox.ir072RequireNPC(x.merchant.id), x.merchant, `${occupation} should remain reachable at low reputation`);
  }
}

// 2. Low reputation can refuse an optional bargain with a reason and without charging energy.
{
  const x = setup({ reputation: -15 });
  const energy = x.state.character.energy;
  x.sandbox.ir072Bargain(x.merchant.id);
  assert.equal(x.state.character.energy, energy);
  assert.equal(x.state.world.v072.activeBargain, null);
  assert.match(x.calls.toasts.join(' '), /declines to negotiate.*public reputation/i);
  assert.equal(x.merchant.refusalRecorded, true);
}

// 3. High public reputation improves a clean merchant's bargain to an existing 15% tier.
{
  const x = setup({ reputation: 80, random: () => 0 });
  x.sandbox.ir072Bargain(x.merchant.id);
  assert.equal(x.state.world.v072.activeBargain.percent, 15);
  assert.ok(x.calls.remembered.some(m => /15% discount/.test(m.text)));
}

// 4. Personal harm remains relevant even after a newer unrelated gift: high reputation gives
// only the existing base 8% offer and does not automatically improve this merchant's trust.
{
  const harmed = { id: 'merchant-harmed', name: 'Mira', occupation: 'merchant', memories: [
    { day: 9, kind: 'gift', text: 'You gave Mira bread.' },
    { day: 7, kind: 'crime', text: 'You stole from Mira.' }
  ], ir073LastHarm: { day: 7, type: 'theft', detail: 'You stole from Mira.' }, traits: [] };
  const x = setup({ reputation: 80, npc: harmed, random: () => 0 });
  const trustBefore = x.state.character.relationships[harmed.id].trust;
  assert.ok(x.sandbox.ir0733PersonalGrievance(harmed));
  assert.match(x.sandbox.ir073ContextLine(harmed), /remembers the harm/i);
  assert.match(x.sandbox.ir072ShopCard(harmed), /personal grievance can limit this NPC to the usual 8% offer/i);
  x.sandbox.ir072Bargain(harmed.id);
  assert.equal(x.state.world.v072.activeBargain.percent, 8);
  assert.equal(x.state.character.relationships[harmed.id].trust, trustBefore);
}

// 5. Public standing does not improve bargaining odds for an NPC with a personal grievance.
{
  const harmed = { id: 'merchant-harmed-chance', name: 'Mira', occupation: 'merchant', memories: [
    { day: 7, kind: 'crime', text: 'You stole from Mira.' }
  ], ir073LastHarm: { day: 7, type: 'theft', detail: 'You stole from Mira.' }, traits: [] };
  const x = setup({ reputation: 80, npc: harmed, random: () => 0.42 });
  x.sandbox.ir072Bargain(harmed.id);
  assert.equal(x.state.world.v072.activeBargain, null);
  assert.match(x.calls.toasts.join(' '), /merchant declined/i);
}

// 5. A later explicit reconciliation can soften the active grievance without deleting memories.
{
  const x = setup({ reputation: 80, random: () => 0 });
  x.merchant.ir073LastHarm = { day: 7, type: 'assault', detail: 'You attacked Mira.' };
  x.merchant.memories = [
    { day: 9, kind: 'reconciliation', text: 'You made amends with Mira.' },
    { day: 7, kind: 'crime', text: 'You attacked Mira.' }
  ];
  assert.equal(x.sandbox.ir0733PersonalGrievance(x.merchant), null);
  assert.ok(x.merchant.memories.some(m => /attacked/.test(m.text)));
}

// 6. Market pricing cannot return a negative or non-finite value.
{
  const negative = setup({ basePrice: -200 });
  const invalid = setup({ basePrice: Number.NaN });
  const normal = setup({ basePrice: 10 });
  assert.equal(negative.sandbox.ir04ItemPrice('bread', 'buy'), 1);
  assert.equal(invalid.sandbox.ir04ItemPrice('bread', 'buy'), 1);
  assert.equal(normal.sandbox.ir04ItemPrice('bread', 'buy'), 10);
  assert.ok(Number.isInteger(normal.sandbox.ir04ItemPrice('bread', 'buy')));
}

// 7. Save migration keeps the existing schema and adds only the new version metadata.
{
  const x = setup();
  const migrated = x.sandbox.normalizeSave({ character: { name: 'Test' }, saveSchemaVersion: 8, world: {} });
  assert.equal(migrated.gameVersion, '0.7.3.3');
  assert.equal(migrated.saveSchemaVersion, 8);
  x.sandbox.persist();
  assert.equal(x.state.gameVersion, '0.7.3.3');
  assert.equal(x.state.saveSchemaVersion, 8);
}

console.log('v0.7.3.3 reputation reaction tests: 8 checks passed');
