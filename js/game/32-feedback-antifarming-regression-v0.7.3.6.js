'use strict';
// ================= Infinite Realms v0.7.3.6 — relationship feedback and anti-farming =================
// Isolated overlay only. Existing relationship, memory, occupation, combat and reputation systems remain authoritative.

function ir0736CleanData(raw) {
  const out = { schema: 1, earned: {}, claims: {} };
  if (!raw || typeof raw !== 'object') return out;
  const earned = raw.earned && typeof raw.earned === 'object' ? raw.earned : {};
  for (const [rawKey, value] of Object.entries(earned)) {
    const key = String(rawKey).slice(0, 150);
    if (!/^[a-z0-9:_-]+$/i.test(key) || !value || typeof value !== 'object') continue;
    out.earned[key] = {
      affinity: Math.max(0, Math.min(1000, Math.floor(Number(value.affinity) || 0))),
      trust: Math.max(0, Math.min(1000, Math.floor(Number(value.trust) || 0)))
    };
  }
  // Do not evict older reward caps: forgetting them after enough NPCs would reopen farming.
  const claims = raw.claims && typeof raw.claims === 'object' ? raw.claims : {};
  for (const [rawKey, value] of Object.entries(claims)) {
    const key = String(rawKey).slice(0, 180), day = Math.floor(Number(value));
    if (/^[a-z0-9:_-]+$/i.test(key) && Number.isFinite(day) && day >= 0) out.claims[key] = day;
  }
  // Keep old per-NPC gift claims too; dropping them would let old gift types be farmed again.
  return out;
}
function ir0736Data() {
  const w = state?.world;
  if (!w) return null;
  w.v0736 = ir0736CleanData(w.v0736);
  return w.v0736;
}
function ir0736SafeId(value) { return String(value || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 70); }
function ir0736LedgerKey(action, id) { return `${String(action || 'interaction').replace(/[^a-z0-9_-]/gi, '_')}:${ir0736SafeId(id)}`.slice(0, 150); }
function ir0736ClaimKey(action, id, detail = '') { return `${String(action || 'interaction').replace(/[^a-z0-9_-]/gi, '_')}:${ir0736SafeId(id)}:${String(detail || '').replace(/[^a-z0-9_-]/gi, '_')}`.slice(0, 180); }
function ir0736NPC(ref) {
  if (ref && typeof ref === 'object' && ref.id != null) return ref;
  const id = String(ref ?? '');
  return (state?.character?.npcs || []).find(n => String(n?.id) === id) || (typeof ir072NPC === 'function' ? ir072NPC(ref) : null);
}
function ir0736Rel(n) {
  if (!n) return null;
  const c = state?.character;
  c.relationships = c.relationships && typeof c.relationships === 'object' ? c.relationships : {};
  let r = c.relationships[n.id];
  if (!r || typeof r !== 'object') {
    try { r = typeof ir06Relationship === 'function' ? ir06Relationship(n) : null; } catch (e) {}
  }
  if (!r || typeof r !== 'object') r = c.relationships[n.id] = { affinity: Number(n.affinity) || 0, trust: Number(n.trust) || 0 };
  return r;
}
function ir0736Snapshot(n) {
  const r = ir0736Rel(n);
  return {
    affinity: Number(r?.affinity) || 0,
    trust: Number(r?.trust) || 0,
    status: String(r?.status || ''),
    reputation: Number(state?.character?.reputation) || 0,
    day: Number(state?.character?.daysLived) || 0,
    energy: Number(state?.character?.energy) || 0,
    coin: Number(state?.character?.coin) || 0,
    health: Number(state?.character?.health) || 0,
    feedTop: state?.feed?.[0] || null,
    memoryTop: n?.memories?.[0] || null,
    memoriesLength: Array.isArray(n?.memories) ? n.memories.length : 0,
    inventory: JSON.stringify(state?.character?.inventory || {}),
    combat: state?.combat || null,
    pendingEvent: state?.pendingEvent ?? null,
    attr: JSON.stringify(state?.character?.attrs || {}),
    skills: JSON.stringify(state?.character?.skills || {})
  };
}
function ir0736Deltas(before, after) { return { affinity: after.affinity - before.affinity, trust: after.trust - before.trust, reputation: after.reputation - before.reputation }; }
function ir0736HasSideEffect(before, after) {
  return before.day !== after.day || before.energy !== after.energy || before.coin !== after.coin || before.health !== after.health ||
    before.feedTop !== after.feedTop || before.memoryTop !== after.memoryTop || before.memoriesLength !== after.memoriesLength ||
    before.inventory !== after.inventory || before.combat !== after.combat || before.pendingEvent !== after.pendingEvent ||
    before.attr !== after.attr || before.skills !== after.skills || before.reputation !== after.reputation || before.status !== after.status ||
    before.affinity !== after.affinity || before.trust !== after.trust;
}
const ir0736Profiles = {
  // Finite lifetime contribution limits per NPC and interaction type. Other distinct actions retain their own allowance.
  talk: { affinity: 6, trust: 6 },
  favor: { affinity: 0, trust: 4 },
  'spend-time': { affinity: 6, trust: 4 },
  advice: { affinity: 3, trust: 0 },
  'train-together': { affinity: 4, trust: 4 },
  'work-together': { affinity: 5, trust: 5 },
  meal: { affinity: 6, trust: 4 },
  'personal-task': { affinity: 8, trust: 6 },
  'special-bar': { affinity: 6, trust: 4 },
  'special-campfire': { affinity: 6, trust: 6 },
  'special-romance': { affinity: 8, trust: 6 },
  'special-mentor': { affinity: 3, trust: 6 },
  bargain: { affinity: 0, trust: 3 },
  sparring: { affinity: 3, trust: 3 },
  'farm-work': { affinity: 0, trust: 4 },
  'guard-report': { affinity: 0, trust: 4 }
};
const ir0736ActionLabels = {
  talk: 'conversation', favor: 'favor', 'spend-time': 'time together', advice: 'advice',
  'train-together': 'training together', 'work-together': 'working together', meal: 'shared meal',
  'personal-task': 'personal task', 'special-bar': 'tavern outing', 'special-campfire': 'campfire evening',
  'special-romance': 'private evening', 'special-mentor': 'mentorship', bargain: 'merchant bargain',
  sparring: 'controlled sparring', 'farm-work': 'farm assistance', 'guard-report': 'guard report',
  'relationship-status': 'relationship decision', assault: 'assault', 'npc-death': 'NPC death',
  'event-choice': 'event choice', 'combat-end': 'combat resolution'
};
const ir0736RecentCalls = new Map();
const ir0736ActiveCalls = new Set();
function ir0736CorrectRecentMemory(n, beforeMemory, before, after, action) {
  if (!n || !Array.isArray(n.memories) || !n.memories[0] || n.memories[0] === beforeMemory) return;
  const m = n.memories[0];
  if (typeof m.text !== 'string') return;
  const deltaA = after.affinity - before.affinity, deltaT = after.trust - before.trust;
  const signed = x => `${x >= 0 ? '+' : ''}${x}`;
  let text = m.text;
  // The existing talk handler records its requested gain. Correct only the just-created entry if
  // an anti-farming cap reduced the actual amount; historical memories are left alone.
  if (/Affinity\s+[+-]?\d+/i.test(text)) text = text.replace(/(Affinity\s+)[+-]?\d+/i, `$1${signed(deltaA)}`);
  if (/trust\s+[+-]?\d+/i.test(text)) text = text.replace(/(trust\s+)[+-]?\d+/i, `$1${signed(deltaT)}`);
  text = text.replace(/Totals:\s*affinity\s+-?\d+\s*,\s*trust\s+-?\d+/i, `Totals: affinity ${after.affinity}, trust ${after.trust}`);
  if (text === m.text) return;
  const oldText = m.text;
  m.text = text;
  const v = state?.world?.v06;
  if (v) {
    for (const store of [v.registry?.[n.id], v.changes?.[n.id]]) {
      if (!store || !Array.isArray(store.memories)) continue;
      const stored = store.memories.find(x => Number(x?.day) === Number(m.day) && String(x?.kind || '') === String(m.kind || '') && String(x?.text || '') === oldText);
      if (stored) stored.text = text;
    }
    const journalEntry = (v.journal || []).find(x => String(x?.npc || '') === String(n.name || '') && Number(x?.day) === Number(m.day) && String(x?.kind || '') === String(m.kind || '') && String(x?.text || '') === oldText);
    if (journalEntry) journalEntry.text = text;
  }
}
function ir0736ContextCue(n, actionKey, oldMemory, newMemory) {
  const text = `${oldMemory?.kind || ''} ${oldMemory?.text || ''} ${newMemory?.kind || ''} ${newMemory?.text || ''}`.toLowerCase();
  const newest = `${newMemory?.kind || ''} ${newMemory?.text || ''}`.toLowerCase();
  if (newMemory && /reconcil|make amends|made amends|apolog|forgave|forgiveness/.test(newest)) {
    return `${n?.name || 'They'} now have a record of this reconciliation attempt; earlier harm is not erased automatically.`;
  }
  if (/broken.?promise|promise.?broken|broke(?:n)? (?:a |your |the )?promise|failed to keep.*promise/.test(text)) return `${n?.name || 'They'} remember the broken promise.`;
  if (/remembered your earlier relevant help|remembered your earlier help|earlier relevant help|earlier help shaped/.test(text)) return `${n?.name || 'They'} remembered your earlier help.`;
  if (/personal harm|remembers the harm|you stole|you assaulted|you killed|you harmed|crime.*personal history/.test(text)) return `${n?.name || 'They'} remember the personal harm.`;
  if (/public reputation.*did not erase|public standing did not erase/.test(text)) return `Their personal history remains separate from public reputation.`;
  if (actionKey === 'relationship-status' && /became enemies|relationship turned hostile|now: enemy/.test(text)) return `The relationship was marked hostile.`;
  if (actionKey === 'relationship-status' && /now: friend|now: companion|now: lover/.test(text)) return `The relationship status was updated.`;
  return '';
}
function ir0736Feedback(n, actionKey, before, after, beforeMemory, newMemory, options = {}) {
  const d = ir0736Deltas(before, after);
  const hasRel = d.affinity !== 0 || d.trust !== 0;
  const hasRep = d.reputation !== 0;
  const statusChange = before.status !== after.status;
  if (!hasRel && !hasRep && !statusChange) return '';
  const label = options.label || ir0736ActionLabels[actionKey] || 'interaction';
  const parts = [];
  if (n && hasRel) {
    const a = d.affinity === 0 ? 'affinity unchanged' : `affinity ${d.affinity > 0 ? '+' : ''}${d.affinity}`;
    const t = d.trust === 0 ? 'trust unchanged' : `trust ${d.trust > 0 ? '+' : ''}${d.trust}`;
    parts.push(`${n.name}: ${a}, ${t} after ${label}.`);
  } else if (n && statusChange) {
    parts.push(`${n.name}'s relationship status changed to ${after.status || 'updated'}.`);
  }
  if (hasRep) {
    const rep = `${d.reputation > 0 ? '+' : ''}${d.reputation}`;
    parts.push(n && hasRel
      ? `Separately, public reputation ${rep}; that public consequence does not replace ${n.name}'s personal relationship history.`
      : `Public reputation ${rep}${options.reason ? ` — ${options.reason}` : ''}. Current standing: ${after.reputation >= 0 ? '+' : ''}${after.reputation}.`);
  }
  const cue = n ? ir0736ContextCue(n, actionKey, beforeMemory, newMemory) : '';
  if (cue) parts.push(cue);
  if (options.suppressed) parts.push('The repeated action reached its relationship-reward limit; its other successful benefits were retained.');
  return parts.join(' ');
}
function ir0736RunAction(actionKey, npcRef, baseFn, thisArg, args, options = {}) {
  const n = ir0736NPC(npcRef);
  const c = state?.character;
  if (typeof baseFn !== 'function' || !c) return typeof baseFn === 'function' ? baseFn.apply(thisArg, args || []) : undefined;
  const id = String(n?.id || options.identity || 'world');
  const callbackKey = `${String(actionKey)}:${id}`;
  const now = Date.now();
  // Debounce entries matter only for 450 ms. Periodically discard stale keys so this
  // session-only guard does not grow with every NPC the player ever meets.
  if (ir0736RecentCalls.size > 64) {
    for (const [key, timestamp] of ir0736RecentCalls) if (now < timestamp || now - timestamp >= 450) ir0736RecentCalls.delete(key);
  }
  if (ir0736ActiveCalls.has(callbackKey) || (ir0736RecentCalls.has(callbackKey) && now - ir0736RecentCalls.get(callbackKey) >= 0 && now - ir0736RecentCalls.get(callbackKey) < 450)) {
    if (typeof toast === 'function') toast(n ? `${n.name}'s ${ir0736ActionLabels[actionKey] || 'interaction'} was already processed; no duplicate reward was applied.` : 'That event was already processed; no duplicate reward was applied.');
    return undefined;
  }
  ir0736ActiveCalls.add(callbackKey);
  const ledger = ir0736Data();
  const profile = options.noCaps ? null : (options.profile || ir0736Profiles[options.policy || actionKey] || null);
  const ledgerKey = n ? ir0736LedgerKey(options.policy || actionKey, n.id) : '';
  const earned = ledger && ledgerKey ? (ledger.earned[ledgerKey] || { affinity: 0, trust: 0 }) : { affinity: 0, trust: 0 };
  const earnedAtStart = { affinity: Number(earned.affinity) || 0, trust: Number(earned.trust) || 0 };
  const spent = { affinity: 0, trust: 0 };
  const limited = { affinity: false, trust: false };
  const positiveCaps = profile ? Object.entries(profile).filter(([, cap]) => Number(cap) > 0) : [];
  const capExhaustedAtStart = !!(positiveCaps.length && positiveCaps.every(([prop, cap]) => (earnedAtStart[prop] || 0) >= Number(cap)));
  const before = n ? ir0736Snapshot(n) : {
    reputation: Number(c.reputation) || 0, day: Number(c.daysLived) || 0, energy: Number(c.energy) || 0,
    coin: Number(c.coin) || 0, feedTop: state?.feed?.[0] || null, memoryTop: null, memoriesLength: 0,
    inventory: JSON.stringify(c.inventory || {}), combat: state?.combat || null, pendingEvent: state?.pendingEvent ?? null,
    attr: JSON.stringify(c.attrs || {}), skills: JSON.stringify(c.skills || {}), affinity: 0, trust: 0, status: ''
  };
  const beforeMemory = n?.memories?.[0] || null;
  let result, failure;
  const originalToast = typeof toast === 'function' ? toast : null;
  const capturedToasts = [];
  let targetRaw = n ? c.relationships?.[n.id] : null;
  if (n && (!targetRaw || typeof targetRaw !== 'object')) targetRaw = ir0736Rel(n);
  let targetProxy = null;
  const makeProxy = (ref, rel) => {
    if (!n || String(ref?.id ?? '') !== String(n.id) || !rel || typeof rel !== 'object' || !profile) return rel;
    if (targetRaw === rel && targetProxy) return targetProxy;
    targetRaw = rel;
    targetProxy = new Proxy(rel, {
      get(target, prop, receiver) { return Reflect.get(target, prop, receiver); },
      set(target, prop, rawValue, receiver) {
        if ((prop === 'affinity' || prop === 'trust') && Number.isFinite(Number(rawValue))) {
          const oldValue = Number(target[prop]) || 0, nextValue = Number(rawValue);
          if (nextValue > oldValue && Object.prototype.hasOwnProperty.call(profile, prop)) {
            const cap = Math.max(0, Number(profile[prop]) || 0);
            const remaining = Math.max(0, cap - earnedAtStart[prop] - spent[prop]);
            const allowed = Math.min(nextValue, oldValue + remaining);
            if (allowed < nextValue) limited[prop] = true;
            const actual = Math.max(oldValue, allowed);
            spent[prop] += Math.max(0, actual - oldValue);
            rawValue = actual;
          }
        }
        return Reflect.set(target, prop, rawValue, receiver);
      }
    });
    return targetProxy;
  };
  const originalRelationship = typeof ir06Relationship === 'function' ? ir06Relationship : null;
  const originalRelById = typeof ir062Rel === 'function' ? ir062Rel : null;
  if (originalToast) toast = msg => capturedToasts.push(String(msg ?? ''));
  if (n && originalRelationship) ir06Relationship = function(ref) { const rel = originalRelationship.apply(this, arguments); return makeProxy(ref, rel); };
  if (n && originalRelById) ir062Rel = function(ref) { const rel = originalRelById.apply(this, arguments); return String(ref) === String(n.id) ? makeProxy(n, rel) : rel; };
  try {
    result = baseFn.apply(thisArg, args || []);
  } catch (error) { failure = error; }
  finally {
    if (originalRelationship) ir06Relationship = originalRelationship;
    if (originalRelById) ir062Rel = originalRelById;
    if (originalToast) toast = originalToast;
    ir0736ActiveCalls.delete(callbackKey);
  }
  if (failure) throw failure;
  const after = n ? ir0736Snapshot(n) : {
    reputation: Number(c.reputation) || 0, day: Number(c.daysLived) || 0, energy: Number(c.energy) || 0,
    coin: Number(c.coin) || 0, feedTop: state?.feed?.[0] || null, memoryTop: null, memoriesLength: 0,
    inventory: JSON.stringify(c.inventory || {}), combat: state?.combat || null, pendingEvent: state?.pendingEvent ?? null,
    attr: JSON.stringify(c.attrs || {}), skills: JSON.stringify(c.skills || {}), affinity: 0, trust: 0, status: ''
  };
  const d = ir0736Deltas(before, after);
  let relationshipLedgerChanged = false;
  if (n) {
    n.affinity = after.affinity; n.trust = after.trust;
    ir0736CorrectRecentMemory(n, beforeMemory, before, after, actionKey);
    if (profile && ledger && ledgerKey && (spent.affinity || spent.trust)) {
      const stored = ledger.earned[ledgerKey] || (ledger.earned[ledgerKey] = { affinity: 0, trust: 0 });
      stored.affinity = Math.min(Number(profile.affinity) > 0 ? Number(profile.affinity) : 0, (Number(stored.affinity) || 0) + spent.affinity);
      stored.trust = Math.min(Number(profile.trust) > 0 ? Number(profile.trust) : 0, (Number(stored.trust) || 0) + spent.trust);
      relationshipLedgerChanged = true;
    }
    if (d.affinity || d.trust) {
      try { if (typeof ir0731StoreNPC === 'function') ir0731StoreNPC(n); } catch (e) {}
    }
  }
  const changed = ir0736HasSideEffect(before, after);
  if (changed) ir0736RecentCalls.set(callbackKey, Date.now());
  if (ledger) state.world.v0736 = ir0736CleanData(ledger);
  const actionMemory = n?.memories?.[0] || null;
  const feedback = ir0736Feedback(n, actionKey, before, after, beforeMemory, actionMemory, {
    label: options.label,
    reason: options.reason,
    suppressed: !!(profile && changed && capExhaustedAtStart && !d.affinity && !d.trust)
  });
  const capNotice = !!(profile && changed && capExhaustedAtStart && !d.affinity && !d.trust);
  const partialCapNotice = !!(profile && changed && (limited.affinity || limited.trust) && (d.affinity || d.trust));
  // Preserve important non-relationship outcome feedback (pay, skill practice, discount, reward)
  // when consolidating the relationship notice. Generic old toasts are intentionally omitted.
  const benefitNotice = [...capturedToasts].reverse().find(msg => /\b(?:coins?|skill|improv|experience|xp|practice|training|reward|discount|earned|received|paid|loot|item)\b/i.test(msg));
  const appendBenefit = message => benefitNotice && !message.includes(benefitNotice) ? `${message} ${benefitNotice}` : message;
  if (feedback) {
    const suffix = partialCapNotice ? ' Repeated routine gains are limited; meaningful different activities still have their own allowance.' : '';
    if (originalToast) originalToast(appendBenefit(feedback + suffix));
  } else if (capNotice && originalToast) {
    originalToast(appendBenefit(`${n?.name || 'This NPC'} has already gained the relationship benefit available from repeated ${ir0736ActionLabels[actionKey] || 'interactions'}; other successful activity benefits were retained.`));
  } else if (originalToast && capturedToasts.length) {
    originalToast(capturedToasts[capturedToasts.length - 1]);
  }
  if (ledger && state?.world) state.world.v0736 = ir0736CleanData(ledger);
  // The original interaction often persists before this wrapper updates its reward ledger. Save the
  // changed ledger once more so a quit/reload immediately after the action cannot reset the cap.
  if (relationshipLedgerChanged && typeof persist === 'function') {
    try { persist(); } catch (e) { /* Preserve the successful interaction; later saves can retry. */ }
  }
  return result;
}

// Route repeatable relationship actions through a capped relationship-only proxy. Costs, skills,
// coins, items, travel, time, service availability, and combat outcomes still use their original handlers.
const ir0736TalkBase = ir06Talk;
ir06Talk = function(id) { return ir0736RunAction('talk', id, ir0736TalkBase, this, arguments); };

// One meaningful relationship reward per NPC per gift-item type. Previously given item types are skipped
// so an available different gift can still be selected by the existing gift button.
ir06Gift = function(id) {
  const c = state?.character, n = ir0736NPC(id);
  if (!n || !c) return;
  if (typeof ir072IsPresent === 'function' && !ir072IsPresent(n)) { toast(`${n.name} is not currently available here.`); return; }
  if (typeof ir073ShouldRefuse === 'function' && ir073ShouldRefuse(n)) { toast(`${n.name} refuses your gift because of your public reputation.`); return; }
  if (typeof ir072Blocked === 'function' && ir072Blocked()) { toast('Resolve the current combat or event first.'); return; }
  const day = Number(c.daysLived) || 0;
  if (day - Number(n.ir073LastGiftDay ?? -999) < 3) { toast(`${n.name} recently received a gift. Wait ${3 - (day - Number(n.ir073LastGiftDay ?? -999))} day(s) before giving another.`); return; }
  const types = ['charm', 'herb', 'bread', 'scrap'];
  const available = types.filter(k => Number(c.inventory?.[k]) > 0);
  if (!available.length) { toast('You need a gift item such as bread, a charm, an herb, or scrap.'); return; }
  const ledger = ir0736Data();
  const item = available.find(k => !ledger?.claims?.[ir0736ClaimKey('gift', n.id, k)]);
  if (!item) { toast(`${n.name} has already received each gift type currently in your pack. Gifts already recorded still matter; try a different item or a different meaningful activity.`); return; }
  return ir0736RunAction(`gift-${item}`, n, function() {
    c.inventory[item] = Math.max(0, Number(c.inventory[item]) - 1);
    n.ir073LastGiftDay = Number(c.daysLived) || 0;
    const rel = ir06Relationship(n), rep = typeof ir073Rep === 'function' ? ir073Rep() : Math.max(-100, Math.min(100, Math.trunc(Number(c.reputation) || 0)));
    const standing = typeof ir073MemoryStanding === 'function' ? ir073MemoryStanding(n) : 0;
    let affinityGain = typeof ir06Trait === 'function' && ir06Trait(n, 'generous') ? 3 : 2, trustGain = 1;
    if (rep >= 25) { affinityGain++; trustGain++; }
    if (rep >= 60) affinityGain++;
    if (standing < 0) affinityGain = Math.max(1, affinityGain - 1);
    rel.affinity = clamp(rel.affinity + affinityGain, -100, 100);
    rel.trust = clamp(rel.trust + trustGain, -100, 100);
    n.affinity = rel.affinity; n.trust = rel.trust;
    const text = `You gave ${n.name} ${ITEMS[item]?.name || item}. Public reputation ${rep} influenced how warmly they received it; the gift was recorded as a distinct gesture.`;
    ir06Remember(n, text, 'gift');
    const currentLedger = state?.world?.v0736;
    if (currentLedger && currentLedger.claims) currentLedger.claims[ir0736ClaimKey('gift', n.id, item)] = Math.max(0, Math.floor(Number(c.daysLived) || 0));
    if (typeof ir0724PersistNPC === 'function') ir0724PersistNPC(n);
    addFeed('🎁', 'A thoughtful gift', text, 'social'); persist(); render();
  }, this, [], { policy: `gift-${item}`, profile: { affinity: 4, trust: 2 }, label: `gift of ${ITEMS[item]?.name || item}` });
};

const ir0736FavorBase = ir06Favor;
ir06Favor = function(id) { return ir0736RunAction('favor', id, ir0736FavorBase, this, arguments); };
const ir0736SpendBase = ir061SpendTime;
ir061SpendTime = function(id) { return ir0736RunAction('spend-time', id, ir0736SpendBase, this, arguments); };
const ir0736AdviceBase = ir061Advice;
ir061Advice = function(id) { return ir0736RunAction('advice', id, ir0736AdviceBase, this, arguments); };
const ir0736TrainTogetherBase = ir061TrainTogether;
ir061TrainTogether = function(id) { return ir0736RunAction('train-together', id, ir0736TrainTogetherBase, this, arguments); };
const ir0736WorkTogetherBase = ir061WorkTogether;
ir061WorkTogether = function(id) { return ir0736RunAction('work-together', id, ir0736WorkTogetherBase, this, arguments); };
const ir0736MealBase = ir062Meal;
ir062Meal = function(id) { return ir0736RunAction('meal', id, ir0736MealBase, this, arguments); };
const ir0736AmendsBase = ir062Amends;
ir062Amends = function(id) { return ir0736RunAction('amends', id, ir0736AmendsBase, this, arguments, { noCaps: true, label: 'attempt at reconciliation' }); };
const ir0736SetStatusBase = ir062SetStatus;
ir062SetStatus = function(id, status) { return ir0736RunAction('relationship-status', id, ir0736SetStatusBase, this, arguments, { noCaps: true, label: `relationship decision (${status})` }); };
const ir0736ReportTaskBase = ir062ReportTask;
ir062ReportTask = function(id) { return ir0736RunAction('personal-task', id, ir0736ReportTaskBase, this, arguments); };
const ir0736SpecialBase = ir063Special;
ir063Special = function(id, kind, stat) { return ir0736RunAction(`special-${kind}`, id, ir0736SpecialBase, this, arguments); };

// Eligible farming and guard-report actions already use their established reputation/occupation logic;
// cap only the repeatable personal-trust component and consolidate their feedback.
const ir0736FarmWorkBase = ir0724FarmWork;
ir0724FarmWork = function(n) {
  const npc = ir0736NPC(n);
  return ir0736RunAction('farm-work', npc, ir0736FarmWorkBase, this, arguments);
};
const ir0736GuardReportBase = ir0724GuardReport;
ir0724GuardReport = function(n) {
  const npc = ir0736NPC(n);
  const s = typeof site === 'function' ? site() : null;
  const lead = s?.changes?.criminalIntel;
  const ev = state?.world?.v05?.activeEvent;
  const localLead = !!lead && (lead.status === 'active' || lead.status === 'confirmed');
  const localEvent = !!ev && (ev.siteId === s?.id || /bandit|thief|gang|crime|disturb/i.test(`${ev.title || ''} ${ev.detail || ''}`));
  // Legacy handler checked lead.reported but not event.reported when no lead existed. Stop the same
  // persistent disturbance from being reported for +3 public reputation on every repeat visit/day.
  if (!localLead && localEvent && ev.reported) { toast('This disturbance has already been reported. No duplicate informer reward was issued.'); return; }
  return ir0736RunAction('guard-report', npc, ir0736GuardReportBase, this, arguments);
};
const ir0736BargainBase = ir072Bargain;
ir072Bargain = function(id) { return ir0736RunAction('bargain', id, ir0736BargainBase, this, arguments); };

// Successful witnessed crime feedback reports public reputation and the victim's private relationship separately.
const ir0736AttackNPCBase = ir0726AttackNPC;
ir0726AttackNPC = function(n) { return ir0736RunAction('assault', n, ir0736AttackNPCBase, this, arguments, { noCaps: true, label: 'assault attempt' }); };

// Sparring relationship gains have their own finite cap. Combat XP/discipline progression, health restoration,
// loot, and all non-spar combat paths remain handled by the original combat callback.
const ir0736CombatEndBase = irCombatEnd;
irCombatEnd = function(kind, detail = '') {
  const battle = state?.combat, source = battle?.source || {};
  if (source.type === 'spar' && source.npcId) return ir0736RunAction('sparring', source.npcId, ir0736CombatEndBase, this, arguments);
  if (battle && source.type === 'npc-assault' && kind === 'victory' && source.npcId) return ir0736RunAction('npc-death', source.npcId, ir0736CombatEndBase, this, arguments, { noCaps: true, label: 'combat resolution' });
  if (battle && source.bountySiteId) return ir0736RunAction('combat-end', null, ir0736CombatEndBase, this, arguments, { noCaps: true, identity: `bounty-${source.bountySiteId}-${kind}`, label: 'bounty resolution' });
  return ir0736CombatEndBase.apply(this, arguments);
};

// Consolidate mapped event reward feedback so public standing is explained once rather than appearing
// beside a generic “choice recorded” toast. Reward amounts and completion checks remain in v0.7.3.4.
const ir0736ChooseEventBase = chooseEvent;
chooseEvent = function(choice) {
  const eventId = state?.pendingEvent;
  const config = typeof ir0734EventRewards === 'object' ? ir0734EventRewards[`${eventId}:${choice}`] : null;
  if (!config) return ir0736ChooseEventBase.apply(this, arguments);
  return ir0736RunAction('event-choice', null, ir0736ChooseEventBase, this, arguments, { noCaps: true, identity: `${eventId}-${choice}`, label: 'completed activity', reason: config.detail });
};

// Keep data additive. Existing schema 8 saves migrate with empty reward counters; old relationship and memory records survive.
const ir0736PersistBase = persist;
persist = function() {
  if (state?.world) state.world.v0736 = ir0736CleanData(state.world.v0736);
  const result = ir0736PersistBase.apply(this, arguments);
  if (state?.character) {
    state.gameVersion = '0.7.3.6';
    state.saveSchemaVersion = IR073_SAVE_SCHEMA;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  return result;
};
const ir0736NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const result = ir0736NormalizeBase.apply(this, arguments);
  if (result?.character) {
    result.world = result.world && typeof result.world === 'object' ? result.world : {};
    result.world.v0736 = ir0736CleanData(result.world.v0736);
    result.gameVersion = '0.7.3.6';
    result.saveSchemaVersion = IR073_SAVE_SCHEMA;
  }
  return result;
};
const ir0736ShellBase = shell;
shell = function() { return ir0736ShellBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.6').replace(/V0\.7\.3(?:\.\d+)?/g, 'V0.7.3.6'); };
const ir0736TopbarBase = topbar;
topbar = function() { return ir0736TopbarBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.6'); };
if (typeof document !== 'undefined') {
  document.title = 'Infinite Realms — Version 0.7.3.6';
  const css = document.createElement('style');
  css.textContent = '.ir0736-feedback-note{font-size:11px;color:var(--muted)}';
  document.head.appendChild(css);
}
// ================= End Infinite Realms v0.7.3.6 patch =================
