'use strict';
// ================= Infinite Realms v0.7.3.5 — contextual favors and information =================
// Isolated decision layer. Existing memory records are read-only; only context-use markers are saved.

function ir0735CleanData(raw) {
  const out = { schema: 1, contextUses: {} };
  if (!raw || typeof raw !== 'object') return out;
  const uses = raw.contextUses && typeof raw.contextUses === 'object' ? raw.contextUses : {};
  for (const [key, value] of Object.entries(uses)) {
    const safeKey = String(key).slice(0, 180);
    const day = Math.floor(Number(value));
    if (/^[a-z0-9:_-]+$/i.test(safeKey) && Number.isFinite(day) && day >= 0) out.contextUses[safeKey] = day;
  }
  const entries = Object.entries(out.contextUses).sort((a, b) => b[1] - a[1]).slice(0, 300);
  out.contextUses = Object.fromEntries(entries);
  return out;
}
function ir0735Data() {
  const w = state?.world;
  if (!w) return null;
  w.v0735 = ir0735CleanData(w.v0735);
  return w.v0735;
}
function ir0735Hash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function ir0735MemoryText(m) {
  return `${String(m?.kind || '')} ${String(m?.text || '')}`.trim().toLowerCase();
}
function ir0735MemoryDay(m) {
  const n = Number(m?.day);
  return Number.isFinite(n) ? n : -1;
}
function ir0735Grievance(n) {
  if (!n) return null;
  try {
    const known = typeof ir0733PersonalGrievance === 'function' ? ir0733PersonalGrievance(n) : null;
    if (known) return known;
  } catch (e) {}
  const memories = Array.isArray(n.memories) ? n.memories : [];
  let issue = null, repair = null;
  for (let i = 0; i < memories.length; i++) {
    const m = memories[i], all = ir0735MemoryText(m);
    const day = ir0735MemoryDay(m);
    if (!issue && /broken.?promise|promise.?broken|broke(?:n)?\s+(?:a\s+|your\s+|the\s+)?promise|failed to keep.*promise|promise.*not kept|betray|crime|theft|assault|murder|killed|stole|threaten|harmed|hurt/.test(all)) issue = { m, day, index: i };
    if (!repair && /reconcil|make amends|apolog|forgiven|promise.?kept|kept.*promise/.test(all)) repair = { m, day, index: i };
  }
  if (!issue) return null;
  if (repair && ((repair.day >= 0 && issue.day >= 0 && repair.day > issue.day) || (repair.day === issue.day && repair.index < issue.index))) return null;
  return { kind: String(issue.m.kind || 'personal-history'), text: String(issue.m.text || 'A harmful action remains in this NPC’s personal history.'), day: issue.day >= 0 ? issue.day : null };
}
function ir0735GrievanceKind(n) {
  const g = ir0735Grievance(n);
  if (!g) return { grievance: null, brokenPromise: false, severe: false };
  const all = `${g.kind || ''} ${g.text || ''}`.toLowerCase();
  return {
    grievance: g,
    brokenPromise: /broken.?promise|promise.?broken|broke(?:n)?\s+(?:a\s+|your\s+|the\s+)?promise|failed to keep.*promise|promise.*not kept|betray/.test(all),
    severe: /murder|killed|assault|theft|stole|personal-rivalry/.test(all)
  };
}
function ir0735TopicPattern(topic) {
  const patterns = {
    favor: /help|favor|work|assist|promise|protected|repair|delivery|return|research|escort|supply|shared fairly/,
    safety: /guard|safety|route|crime|escort|bandit|disturbance|assist|protect/,
    trails: /hunt|track|trail|hunter|wildlife|animal|pelt|fang/,
    lore: /lore|research|translation|scholar|study|ancient|discovery|record|ruin|rune/,
    farming: /farm|farmer|work|crop|food|supply|harvest/,
    rumor: /rumor|information|introduction|help|favor|local knowledge/,
    community: /community|settlement|supply|work|repair|delivery|help|farm|protect/
  };
  return patterns[topic] || /help|work|assist|promise|research|repair/;
}
function ir0735IsHelpfulMemory(n, m, topic = 'favor') {
  if (!m) return false;
  const kind = String(m.kind || '').toLowerCase();
  const text = String(m.text || '').toLowerCase();
  const all = `${kind} ${text}`;
  // The memory must describe meaningful cooperation, not merely receiving a gift or repeating dialogue.
  const playerHelped = /you helped\b|you assisted\b|you supported\b|you protected\b|you returned\b|you repaid\b|you repaired\b|you kept (?:(?:your|the) )?promise|promise kept|you fulfilled (?:(?:the|your) )?promise|you shared .* fairly|you completed .* for (?:the )?/.test(text);
  const explicitPromise = /promise-kept|promise_kept|kept-promise/.test(kind) && /keep|fulfill|honor|promise/.test(all);
  if (!(playerHelped || explicitPromise)) return false;
  return ir0735TopicPattern(topic).test(all);
}
function ir0735FindHelpfulMemory(n, topic = 'favor') {
  const memories = Array.isArray(n?.memories) ? n.memories : [];
  // NPC-local records only. We never search other NPCs or treat the global journal as personal knowledge.
  return memories.find(m => ir0735IsHelpfulMemory(n, m, topic)) || null;
}
function ir0735ContextKey(n, topic, memory) {
  const identity = String(n?.id || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
  const fingerprint = ir0735Hash(`${memory?.day ?? ''}|${memory?.kind || ''}|${memory?.text || ''}`);
  return `${String(topic || 'general').replace(/[^a-z0-9_-]/gi, '_')}:${identity}:${fingerprint}`.slice(0, 180);
}
function ir0735ContextWasUsed(n, topic, memory) {
  const data = ir0735Data();
  return !!(data && memory && Number.isFinite(Number(data.contextUses[ir0735ContextKey(n, topic, memory)])));
}
function ir0735UseContext(n, topic, memory) {
  const data = ir0735Data();
  if (!data || !memory) return false;
  const key = ir0735ContextKey(n, topic, memory);
  if (Object.prototype.hasOwnProperty.call(data.contextUses, key)) return false;
  data.contextUses[key] = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0));
  state.world.v0735 = ir0735CleanData(data);
  return true;
}
function ir0735Relationship(n) {
  try { return ir06Relationship(n) || { affinity: Number(n?.affinity) || 0, trust: Number(n?.trust) || 0, status: '' }; }
  catch (e) { return { affinity: Number(n?.affinity) || 0, trust: Number(n?.trust) || 0, status: '' }; }
}
function ir0735Rep() {
  return typeof ir073Rep === 'function' ? ir073Rep() : Math.max(-100, Math.min(100, Math.trunc(Number(state?.character?.reputation) || 0)));
}
function ir0735HasUsefulContext(n, topic) {
  const r = ir0735Relationship(n), standing = ir0735Rep();
  const grievance = ir0735Grievance(n);
  if (grievance) return { detailed: false, grievance, memory: null, via: 'grievance' };
  const memory = ir0735FindHelpfulMemory(n, topic);
  const availableMemory = memory && !ir0735ContextWasUsed(n, topic, memory) ? memory : null;
  const trusted = Number(r.trust) >= 2 || Number(r.affinity) >= 4 || String(r.status || '').toLowerCase() === 'friend' || String(r.status || '').toLowerCase() === 'companion';
  const publicEase = standing >= 25;
  return { detailed: !!(availableMemory || trusted || publicEase), grievance: null, memory: availableMemory, via: availableMemory ? 'remembered-help' : trusted ? 'relationship' : publicEase ? 'public-standing' : 'general' };
}
function ir0735ContextReason(n, topic, context) {
  if (context?.grievance) {
    const g = context.grievance;
    const type = /promise|betray/i.test(`${g.kind || ''} ${g.text || ''}`) ? 'the broken promise' : 'the harm recorded in their personal history';
    return `${n.name} keeps the optional details to themselves because they still remember ${type}. Public reputation does not erase that personal history.`;
  }
  if (context?.via === 'remembered-help') return `${n.name} remembers your earlier relevant help and is willing to share a more specific lead.`;
  if (context?.via === 'relationship') return `${n.name} shares a little more detail because of the trust you have built together.`;
  if (context?.via === 'public-standing') return `${n.name} is more willing to share optional details because of your positive public standing, without assuming personal trust.`;
  return `${n.name} shares general information for now; a stronger relationship or relevant shared history may open more specific details.`;
}
function ir0735FeedbackRefusal(n, topic, reason) {
  const detail = n?.tier === 'unique'
    ? `${n.name} is a key local figure and deliberately withholds ${topic}; the recorded personal history still matters.`
    : `${n.name} declines to share ${topic}. ${reason}`;
  if (n && typeof ir06Remember === 'function') ir06Remember(n, detail, 'contextual-refusal');
  if (typeof addFeed === 'function') addFeed('🔒', 'Information withheld', detail, 'social');
  if (typeof persist === 'function') persist();
  if (typeof render === 'function') render();
  if (typeof toast === 'function') toast(detail);
}
function ir0735ShouldWithholdOptional(n, topic) {
  const r = ir0735Relationship(n), rep = ir0735Rep(), grievance = ir0735Grievance(n);
  if (grievance && (topic === 'rumor' || topic === 'targeted trail' || String(r.status || '').toLowerCase() === 'enemy')) {
    return { refuse: true, grievance, memory: null, usedForOverride: false, reason: 'They still remember the broken promise or harmful action involving you.' };
  }
  const memoryTopic = topic === 'targeted trail' ? 'trails' : topic;
  const contextTopic = topic === 'targeted trail' ? 'tracked-lead' : topic;
  const candidate = ir0735FindHelpfulMemory(n, memoryTopic);
  const availableMemory = candidate && !ir0735ContextWasUsed(n, contextTopic, candidate) ? candidate : null;
  if (rep <= -10 && Number(r.trust) < 1 && !availableMemory) {
    return { refuse: true, grievance: null, memory: null, usedForOverride: false, reason: `Your public reputation is ${rep}, and this person has little personal trust in you.` };
  }
  return { refuse: false, grievance: null, memory: availableMemory, usedForOverride: rep <= -10 && Number(r.trust) < 1 && !!availableMemory, reason: '' };
}
function ir0735RememberInfo(n, title, detail, kind, context, topic) {
  const suffix = (context?.detailed || context?.grievance) ? ` ${ir0735ContextReason(n, topic, context)}` : '';
  const text = `${detail}${suffix}`;
  if (typeof ir072RememberAction === 'function') ir072RememberAction(n, title, text, kind);
  else {
    ir06Remember(n, text, kind);
    if (typeof addFeed === 'function') addFeed('♧', title, text, 'social');
    if (typeof persist === 'function') persist();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast(title);
  }
  if (context?.memory && ir0735UseContext(n, topic, context.memory) && typeof persist === 'function') persist();
  if (context?.grievance && typeof toast === 'function') toast(`${n.name} shared only general information because of the personal history between you.`);
}

// Favors read only this NPC's relevant record. A positive history can improve one resolved favor;
// an unresolved grievance remains a standing obstacle until the existing memory system records repair.
ir06Favor = function(id) {
  const c = state?.character, n = ir072NPC(id);
  if (!c || !n) return;
  if (!ir072IsPresent(n)) { toast(`${n.name} is not currently available here.`); return; }
  if (ir073ShouldRefuse(n)) { toast(`${n.name} refuses to help because your public reputation is ${ir0735Rep()}.`); return; }
  if (ir072Blocked()) { toast('Resolve the current combat or event first.'); return; }
  const r = ir06Relationship(n), day = Number(c.daysLived) || 0;
  const personal = ir0735GrievanceKind(n);
  const relationshipStatus = String(r.status || '').toLowerCase();
  if ((relationshipStatus === 'enemy' || (personal.severe && Number(r.trust) < 0)) && personal.grievance) {
    toast(`${n.name} refuses this favor because they still remember ${personal.brokenPromise ? 'the broken promise' : 'the personal harm'}. Your public reputation does not erase that history.`);
    return;
  }
  if (r.affinity < 2 || r.trust < 1) { toast('Build affinity and trust first; this person does not know you well enough yet.'); return; }
  if (day - Number(n.ir073LastFavorDay ?? -999) < 3) { toast(`${n.name} has recently helped you. Wait before asking for another favor.`); return; }
  if (c.energy < 8) { toast('You need at least 8 energy to ask for help.'); return; }
  const helpfulMemory = !personal.grievance ? ir0735FindHelpfulMemory(n, 'favor') : null;
  const hasMemoryBonus = !!(helpfulMemory && !ir0735ContextWasUsed(n, 'favor', helpfulMemory));
  const memoryBonus = hasMemoryBonus ? 2 : 0;
  const memoryPenalty = personal.grievance ? (personal.brokenPromise ? -5 : -4) : 0;
  const rep = ir0735Rep();
  const score = r.affinity + r.trust + (ir06Trait(n, 'cautious') ? -2 : 0) + (ir06Trait(n, 'generous') ? 2 : 0) + (rep >= 25 ? 2 : 0) + (rep >= 60 ? 2 : 0) + memoryBonus + memoryPenalty;
  n.ir073LastFavorDay = day;
  c.energy -= 8;
  dayPass(1, 'social');
  let detail;
  if (score >= 5) {
    const reward = /merchant|trader/i.test(n.occupation || n.role || '') ? 5 : 2;
    c.coin += reward;
    r.trust = clamp(r.trust + 1, -100, 100); n.trust = r.trust;
    const contextText = hasMemoryBonus ? `${n.name} remembered your earlier relevant help, improving the favor outcome.` : personal.grievance ? `${n.name} remained cautious because they remember ${personal.brokenPromise ? 'the broken promise' : 'the harm'}; public standing did not erase it.` : 'Your existing relationship and public standing influenced the decision.';
    detail = `${n.name} helped you with a small favor worth ${reward} coins. ${contextText}`;
    ir06Remember(n, detail, 'favor');
    addFeed('🤝', `${n.name} helped you`, detail, 'social');
    toast(hasMemoryBonus ? `The favor worked out; ${n.name} remembered your earlier help.` : 'The favor worked out.');
  } else {
    const contextText = hasMemoryBonus ? `${n.name} remembered your earlier help, but it was not enough to overcome the current circumstances.` : personal.grievance ? `${n.name} is still cautious because of ${personal.brokenPromise ? 'the broken promise' : 'the harm in their personal history'}.` : 'Their decision reflected your relationship and public standing.';
    detail = `You asked ${n.name} for help, but they were unable to assist. ${contextText}`;
    ir06Remember(n, detail, 'favor');
    addFeed('🤝', 'A favor declined', detail, 'social');
    toast(hasMemoryBonus ? `${n.name} considered your past help but could not assist this time.` : 'They could not help this time.');
  }
  if (hasMemoryBonus) ir0735UseContext(n, 'favor', helpfulMemory);
  if (typeof ir0724PersistNPC === 'function') ir0724PersistNPC(n);
  persist(); render();
};

// Context-sensitive information actions reuse only facts already present in the world save.
const ir0735ActionBase = ir072Action;
ir072Action = function(target) {
  const action = target?.dataset?.action;
  const id = target?.dataset?.npc || modal?.npc;
  const n = id ? ir072NPC(id) : null;
  if (!n) return ir0735ActionBase.apply(this, arguments);
  const relevantInfoActions = new Set(['ir072-guard-info', 'ir072-hunter-info', 'ir072-scholar-info']);
  if (!relevantInfoActions.has(action)) return ir0735ActionBase.apply(this, arguments);
  if (!ir072RequireNPC(id)) return true;

  const kind = ir072Occupation(n), s = site();
  if (action === 'ir072-guard-info') {
    if (kind !== 'guard') { toast('This information interaction is intended for guards.'); return true; }
    const context = ir0735HasUsefulContext(n, 'safety');
    const e = state.world?.v05?.activeEvent;
    let eventText = 'No active regional disturbance is recorded.';
    if (e && context.detailed) eventText = e.siteId === s?.id ? `${e.title}: ${e.stage === 'warning' ? e.warning : e.escalation}` : `Regional concern: ${e.title} near ${ir071SiteName(e.siteId)}.`;
    else if (e) eventText = 'A regional disturbance is recorded, but the guard keeps the specific report private for now.';
    const text = `The guard briefed you on ${s?.name || 'this location'}: risk ${Number(s?.risk) || 0}/100, terrain ${((typeof irBiomeProfileForSite==='function'&&s)?irBiomeProfileForSite(s).name:(s?.biome||s?.biomeId||'')) || 'unknown'}. ${eventText}`;
    ir0735RememberInfo(n, 'Guard briefing recorded', text, 'local-information', context, 'safety');
    return true;
  }
  if (action === 'ir072-hunter-info') {
    if (kind !== 'hunter') { toast('This interaction is intended for hunters.'); return true; }
    const context = ir0735HasUsefulContext(n, 'trails');
    const ids = (irBiomeEncounterIds(s)).filter(enemyId => ['wolf', 'spider', 'boar', 'direwolf', 'slime', 'goblin'].includes(enemyId));
    const names = [...new Set(ids.map(enemyId => IR_ENEMIES?.[enemyId]?.name || enemyId))];
    let detail = `${n.name} discussed trails around ${s?.name || 'this area'}. Huntable signs associated with this biome include ${names.join(', ') || 'no specifically listed creatures'}.`;
    if (context.detailed && names.length) detail += ` The hunter calls out ${names[0]} as one of the known local signs; a targeted lead can be requested through the existing tracking option, but an encounter is not guaranteed.`;
    else if (context.grievance) detail += ` ${n.name} shares the general signs but does not offer a more specific lead because of the personal history between you.`;
    ir0735RememberInfo(n, 'Hunter shared trail knowledge', detail, 'local-information', context, 'trails');
    return true;
  }
  if (action === 'ir072-scholar-info') {
    if (kind !== 'scholar') { toast('This history discussion belongs to a scholar.'); return true; }
    const context = ir0735HasUsefulContext(n, 'lore');
    const records = [
      ...(state.world?.journal?.discoveries || []).filter(d => !d.siteId || d.siteId === s?.id).map(d => ({ title: d.title, detail: d.detail || '' })),
      ...(state.world?.v05?.history || []).slice(0, 2).map(e => ({ title: e.title, detail: e.detail || '' }))
    ].filter(x => x.title).slice(0, 4);
    let detail = records.length ? `${n.name} discussed existing records about ${s?.name || 'this area'}: ${records.map(x => x.title).join('; ')}.` : `${n.name} explained that no significant local records have been collected about ${s?.name || 'this area'} yet.`;
    const recordWithDetail = records.find(x => String(x.detail || '').trim());
    if (context.detailed && recordWithDetail) detail += ` The scholar shares a closer reading of “${recordWithDetail.title}”: ${recordWithDetail.detail}`;
    else if (context.grievance && records.length) detail += ` The scholar sticks to the record titles rather than offering a personal interpretation because of the history between you.`;
    ir0735RememberInfo(n, 'Scholar discussion recorded', detail, 'lore', context, 'lore');
    return true;
  }
  return ir0735ActionBase.apply(this, arguments);
};

// Innkeeper rumors are optional, personally shared information. The existing rumor data and map
// reveal flow are preserved; only the decision to share is contextual.
// The action wrapper above passes rumors through, so place a narrow pre-check before the old handler.
const ir0735ActionWithInfoBase = ir072Action;
ir072Action = function(target) {
  const action = target?.dataset?.action;
  if (action !== 'ir072-rumor') return ir0735ActionWithInfoBase.apply(this, arguments);
  const id = target?.dataset?.npc || modal?.npc, n = id ? ir072NPC(id) : null;
  if (!n) return ir0735ActionWithInfoBase.apply(this, arguments);
  if (!ir072RequireNPC(id)) return true;
  if (ir072Occupation(n) !== 'innkeeper') { toast('This rumor service belongs to an innkeeper.'); return true; }
  const rumor = (state.world?.journal?.rumors || []).find(x => !x.resolved);
  if (!rumor) return ir0735ActionWithInfoBase.apply(this, arguments);
  const decision = ir0735ShouldWithholdOptional(n, 'rumor');
  if (decision.refuse) {
    ir0735FeedbackRefusal(n, 'the local rumor', decision.reason);
    return true;
  }
  ir06Remember(n, `${n.name} shared a local rumor: ${rumor.title}.`, 'rumor');
  if (decision.usedForOverride && decision.memory) { ir0735UseContext(n, 'rumor', decision.memory); persist(); }
  modal = null;
  revealRumor(rumor.id);
  return true;
};

// A targeted hunter lead is assistance rather than guaranteed combat success. An unresolved
// personal grievance may make this optional service unavailable; remembered cooperation can
// improve one qualifying hunt lead by +1 quality, only once per specific memory/topic.
const ir0735TrackTargetBase = ir0724TrackTarget;
ir0724TrackTarget = function(n, enemyId) {
  if (!n) return ir0735TrackTargetBase.apply(this, arguments);
  if (typeof ir072RequireNPC === 'function' && !ir072RequireNPC(n.id)) return;
  if (state?.hunt) return ir0735TrackTargetBase.apply(this, arguments);
  const personal = ir0735GrievanceKind(n), r = ir0735Relationship(n), rep = ir0735Rep();
  if (personal.grievance && (String(r.status || '').toLowerCase() === 'enemy' || Number(r.trust) < 0)) {
    toast(`${n.name} will not identify a specific trail because they remember ${personal.brokenPromise ? 'the broken promise' : 'the harm'} between you. Ordinary hunting remains available.`);
    return;
  }
  const candidateMemory = !personal.grievance ? ir0735FindHelpfulMemory(n, 'trails') : null;
  const helpMemory = candidateMemory && !ir0735ContextWasUsed(n, 'tracked-lead', candidateMemory) ? candidateMemory : null;
  if (rep <= -10 && Number(r.trust) < 1 && !helpMemory) {
    toast(`${n.name} keeps the specific trail to themselves because of your public reputation and the limited trust between you. You can still begin an ordinary hunt.`);
    return;
  }
  const useMemory = !!helpMemory;
  const qualityBefore = Number(state?.hunt?.quality) || 0;
  const oldFeed = state?.feed?.[0] || null;
  const result = ir0735TrackTargetBase.apply(this, arguments);
  const hunt = state?.hunt;
  const completedLead = !!(hunt && String(hunt.trackerNpcId) === String(n.id) && hunt !== null && (hunt.targeted || Number(hunt.quality) > qualityBefore || state?.feed?.[0] !== oldFeed));
  if (completedLead && useMemory) {
    hunt.quality = Math.max(0, Number(hunt.quality) || 0) + 1;
    ir0735UseContext(n, 'tracked-lead', helpMemory);
    const text = `${n.name} remembered your earlier relevant help and made the tracked lead clearer. Hunt quality improved slightly; the encounter and outcome are still governed by the existing hunt system.`;
    if (typeof addFeed === 'function') addFeed('🐾', 'A clearer trail', text, 'discovery');
    if (typeof persist === 'function') persist();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast('Your shared history helped the hunter identify a clearer trail.');
  }
  return result;
};

// Keep decision state additive and save-compatible; never edit/delete existing memories.
const ir0735PersistBase = persist;
persist = function() {
  if (state?.world) state.world.v0735 = ir0735CleanData(state.world.v0735);
  const result = ir0735PersistBase.apply(this, arguments);
  if (state?.character) {
    state.gameVersion = '0.7.3.5';
    state.saveSchemaVersion = IR073_SAVE_SCHEMA;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  return result;
};
const ir0735NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const result = ir0735NormalizeBase.apply(this, arguments);
  if (result?.character) {
    result.world = result.world && typeof result.world === 'object' ? result.world : {};
    result.world.v0735 = ir0735CleanData(result.world.v0735);
    result.gameVersion = '0.7.3.5';
    result.saveSchemaVersion = IR073_SAVE_SCHEMA;
  }
  return result;
};
const ir0735ShellBase = shell;
shell = function() { return ir0735ShellBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.5').replace(/V0\.7\.3(?:\.\d+)?/g, 'V0.7.3.5'); };
const ir0735TopbarBase = topbar;
topbar = function() { return ir0735TopbarBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.5'); };
if (typeof document !== 'undefined') {
  document.title = 'Infinite Realms — Version 0.7.3.5';
  const css = document.createElement('style');
  css.textContent = '.ir0735-context-note{font-size:11px;color:var(--muted)}';
  document.head.appendChild(css);
}
// ================= End Infinite Realms v0.7.3.5 patch =================
