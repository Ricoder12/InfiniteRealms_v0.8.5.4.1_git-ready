'use strict';
// ================= Infinite Realms v0.7.3.4 — positive public reputation sources =================
// Isolated integration layer: rewards only follow confirmed completion callbacks. Public reputation
// uses the existing character.reputation / ir073ChangeReputation system; cooldowns live in world.v0734.

function ir0734CleanLedger(raw) {
 const out = { schema: 1, cooldowns: {}, awards: [] };
 if (!raw || typeof raw !== 'object') return out;
 const srcCooldowns = raw.cooldowns && typeof raw.cooldowns === 'object' ? raw.cooldowns : {};
 for (const [key, day] of Object.entries(srcCooldowns)) {
  const k = String(key).slice(0, 120), d = Math.floor(Number(day));
  if (/^[a-z0-9:_-]+$/i.test(k) && Number.isFinite(d) && d >= 0) out.cooldowns[k] = d;
 }
 out.awards = Array.isArray(raw.awards) ? raw.awards.filter(x => x && typeof x === 'object').slice(0, 120).map(x => ({
  day: Math.max(0, Math.floor(Number(x.day) || 0)),
  key: String(x.key || '').slice(0, 120),
  delta: Math.max(0, Math.min(100, Math.floor(Number(x.delta) || 0))),
  reason: String(x.reason || '').slice(0, 60),
  detail: String(x.detail || '').slice(0, 240),
  after: Math.max(-100, Math.min(100, Math.floor(Number(x.after) || 0)))
 })) : [];
 return out;
}
function ir0734Data() {
 const w = state?.world;
 if (!w) return null;
 w.v0734 = ir0734CleanLedger(w.v0734);
 return w.v0734;
}
function ir0734TryAward(key, amount, reason, detail, cooldownDays = 0) {
 const c = state?.character, ledger = ir0734Data();
 if (!c || !ledger) return { awarded: false, reason: 'no-active-life' };
 const safeKey = String(key || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 120);
 const delta = Math.max(0, Math.min(10, Math.floor(Number(amount) || 0)));
 if (!safeKey || delta <= 0) return { awarded: false, reason: 'invalid-reward' };
 const day = Math.max(0, Math.floor(Number(c.daysLived) || 0));
 const cooldown = Math.max(0, Math.floor(Number(cooldownDays) || 0));
 const prior = Number(ledger.cooldowns[safeKey]);
 if (Number.isFinite(prior) && day - prior < cooldown) return { awarded: false, reason: 'cooldown', nextEligibleDay: prior + cooldown };
 const change = ir073ChangeReputation(delta, String(reason || 'community-contribution'), String(detail || 'A completed community contribution.'), {});
 if (!(change.delta > 0)) return { awarded: false, reason: 'reputation-capped' };
 ledger.cooldowns[safeKey] = day;
 ledger.awards.unshift({ day, key: safeKey, delta: change.delta, reason: String(reason || 'community-contribution').slice(0, 60), detail: String(detail || '').slice(0, 240), after: change.after });
 ledger.awards = ledger.awards.slice(0, 120);
 addFeed('🌟', 'Public reputation improved', `+${change.delta} public reputation. ${detail || 'Your completed work helped the community.'} Public standing: ${change.after >= 0 ? '+' : ''}${change.after}.`, 'milestone');
 persist();
 toast(`Public reputation +${change.delta}. ${detail || 'Your community contribution was recognized.'}`);
 return { awarded: true, delta: change.delta, after: change.after };
}
function ir0734MarkSuppressedFeedback() {
 const feed = state?.feed?.[0];
 if (!feed || typeof feed.detail !== 'string') return;
 const suffix = ' Similar work was recognized recently, so this completion did not grant additional public reputation.';
 if (!feed.detail.includes('did not grant additional public reputation')) feed.detail += suffix;
}
function ir0734SuccessfulChoiceFeed(oldFeed, eventId) {
 const f = state?.feed?.[0];
 if (!f || f === oldFeed) return false;
 // All mapped options produce a new journal/feed entry on success; rejected affordability checks return early.
 return !!eventId;
}

// Normalize repeatable, reputation-positive event outcomes into a saved, cooldown-controlled award.
// replaceExisting keeps the original success-scaled reward where the old handler already grants one.
const ir0734EventRewards = {
 'purse:return': { key: 'event-return-purse', delta: 2, cooldown: 30, replaceExisting: true, reason: 'returned-lost-property', detail: 'Returning lost property earned the owner’s gratitude.' },
 'courier:help': { key: 'event-help-courier', delta: 2, cooldown: 14, replaceExisting: true, reason: 'helped-injured-courier', detail: 'You helped an injured courier reach safety and keep their deliveries secure.' },
 'courier:advice': { key: 'event-guide-courier', delta: 1, cooldown: 14, replaceExisting: true, reason: 'guided-courier-to-shelter', detail: 'You helped a courier find shelter and continue their work.' },
 'goblin:talk': { key: 'event-fair-roadside-trade', delta: 1, cooldown: 30, replaceExisting: true, requiresExistingPositive: true, reason: 'fair-roadside-trade', detail: 'You completed a friendly, fair roadside exchange.' },
 'notice:accept': { key: 'event-supply-contract', delta: 2, cooldown: 14, reason: 'completed-supply-contract', detail: 'You completed a supply delivery that helped local stores.' },
 'path_mediation:mediate': { key: 'path-community-mediation', delta: 2, cooldown: 21, replaceExisting: true, reason: 'resolved-community-dispute', detail: 'You helped both traders reach workable terms and settled a local dispute.' },
 'path_forge:repair': { key: 'path-tool-repair', delta: 1, cooldown: 30, reason: 'completed-repair-commission', detail: 'Repairing a craftsperson’s tools helped keep local work moving.' },
 'path_tracks:mark': { key: 'path-safe-trail-marking', delta: 1, cooldown: 14, replaceExisting: true, reason: 'warned-travelers-about-tracks', detail: 'You marked a trail and warned other travelers of a possible hazard.' },
 'path_escort:accept': { key: 'path-caravan-escort', delta: 2, cooldown: 21, reason: 'completed-caravan-escort', detail: 'You escorted a caravan to a safe checkpoint.' },
 'path_salvage:share': { key: 'path-fair-salvage-share', delta: 2, cooldown: 21, replaceExisting: true, reason: 'shared-salvage-fairly', detail: 'You made a fair split of salvage with a local workshop.' },
 'path_contract:cleanse': { key: 'path-safe-curse-removal', delta: 1, cooldown: 21, replaceExisting: true, reason: 'protected-shipment-from-curse', detail: 'You completed a curse-removal job that protected a shipment.' },
 'path_sample:teach': { key: 'path-safe-material-research', delta: 1, cooldown: 30, reason: 'shared-safe-material-practice', detail: 'You documented a safe material-handling procedure for research.' }
};
const ir0734ChooseEventBase = chooseEvent;
chooseEvent = function(choice) {
 const eventId = state?.pendingEvent;
 const cfg = ir0734EventRewards[`${eventId}:${choice}`];
 if (!cfg || !state?.character) return ir0734ChooseEventBase.apply(this, arguments);
 const beforeRep = ir073Rep();
 const oldFeed = state?.feed?.[0] || null;
 const oldPending = state.pendingEvent;
 const dayBefore = Number(state.character.daysLived) || 0;
 const contractsBefore = Number(state.character.pathProgress?.contractsCompleted) || 0;
 const result = ir0734ChooseEventBase.apply(this, arguments);
 const c = state?.character;
 if (!c || !ir0734SuccessfulChoiceFeed(oldFeed, eventId)) return result;
 const feed = state?.feed?.[0];
 const dayAfter = Number(c.daysLived) || 0;
 const resolved = state.pendingEvent !== oldPending || dayAfter !== dayBefore || Number(c.pathProgress?.contractsCompleted || 0) > contractsBefore || feed !== oldFeed;
 if (!resolved) return result;
 const afterRep = ir073Rep();
 let amount = Math.max(0, afterRep - beforeRep);
 if (cfg.replaceExisting) {
  // Undo the legacy direct increment before re-applying it through the idempotent ledger.
  // This preserves the original activity's real positive delta but suppresses repeats during cooldown.
  c.reputation = beforeRep;
  try { ir073Data().lastObservedReputation = beforeRep; } catch (e) {}
  if (cfg.requiresExistingPositive && amount <= 0) {
   persist();
   return result;
  }
  amount = amount > 0 ? Math.min(amount, cfg.delta || amount) : cfg.delta;
 } else {
  amount = cfg.delta;
 }
 if (amount <= 0) return result;
 const detail = cfg.detail;
 const award = ir0734TryAward(cfg.key, amount, cfg.reason, detail, cfg.cooldown);
 if (!award.awarded && award.reason === 'cooldown') {
  ir0734MarkSuppressedFeedback();
  persist();
 }
 return result;
};

// Paid work is repeatable, so public recognition is limited to one shift reward per 30 simulated days.
const ir0734DoWorkBase = doWork;
doWork = function() {
 const cBefore = state?.character;
 const shiftsBefore = Number(cBefore?.jobShifts) || 0;
 const oldFeed = state?.feed?.[0] || null;
 const result = ir0734DoWorkBase.apply(this, arguments);
 const c = state?.character;
 if (c && Number(c.jobShifts) > shiftsBefore && state?.feed?.[0] !== oldFeed && /^Shift completed:/.test(String(state?.feed?.[0]?.title || ''))) {
  const job = JOBS.find(j => j.id === c.job);
  ir0734TryAward('paid-job-shift', 1, 'completed-paid-work', `Completing a paid ${job?.name || 'work'} shift contributed to the local economy.`, 30);
 }
 return result;
};

// Farm work already has an occupation-level daily limit and a +1 reputation change. Route that same
// reward through the shared ledger so visiting multiple farmers cannot farm unlimited public standing.
const ir0734FarmWorkBase = ir0724FarmWork;
ir0724FarmWork = function(n) {
 const cBefore = state?.character;
 if (!cBefore || !n) return ir0734FarmWorkBase.apply(this, arguments);
 const dayBefore = Number(cBefore.daysLived) || 0;
 const repBefore = ir073Rep();
 const oldFeed = state?.feed?.[0] || null;
 const persistFn = persist;
 let result;
 // Suppress the legacy intermediate autosave while its direct +1 is still present; persist the normalized result below.
 persist = function() {};
 try { result = ir0734FarmWorkBase.apply(this, arguments); }
 finally { persist = persistFn; }
 const c = state?.character;
 const completed = !!(c && Number(n.ir0724LastFarmDay) === dayBefore && Number(c.daysLived) > dayBefore && state?.feed?.[0] !== oldFeed && state?.feed?.[0]?.title === 'Farm work completed');
 if (!completed) return result;
 c.reputation = repBefore; // remove the legacy direct +1 before the controlled award attempt
 try { ir073Data().lastObservedReputation = repBefore; } catch (e) {}
 const award = ir0734TryAward('farmer-assistance', 1, 'completed-farm-assistance', `You completed a day of farm labor for ${n.name}; the work helped keep the settlement supplied.`, 7);
 const farmFeed = state?.feed?.find(x => x && x.title === 'Farm work completed');
 if (farmFeed) {
  farmFeed.detail = `You earned payment and Survival experience for a day of farm labor. ${award.awarded ? 'The community recognized your work with public reputation.' : award.reason === 'cooldown' ? 'Similar farm work was recognized recently, so no additional public reputation was awarded this time.' : 'Your public standing cannot increase further right now.'}`;
 }
 persist(); render();
 return result;
};

// A private hunt does not automatically become public knowledge. Turn-in to an existing hunter is the
// information path: a successful sale supplies local materials and can earn a modest reputation reward.
const ir0734HunterSellBase = ir0724HunterSell;
ir0724HunterSell = function(n, item) {
 const cBefore = state?.character;
 if (!cBefore || !n) return ir0734HunterSellBase.apply(this, arguments);
 const coinBefore = Number(cBefore.coin) || 0;
 const quantityBefore = Number(cBefore.inventory?.[item]) || 0;
 const oldFeed = state?.feed?.[0] || null;
 const result = ir0734HunterSellBase.apply(this, arguments);
 const c = state?.character;
 const sold = !!(c && Number(c.coin) > coinBefore && (Number(c.inventory?.[item]) || 0) < quantityBefore && state?.feed?.[0] !== oldFeed && state?.feed?.[0]?.title === 'Hunting material sold');
 if (!sold) return result;
 ir0734TryAward('hunter-material-turn-in', 1, 'supplied-local-hunter', `You supplied ${ITEMS?.[item]?.name || item} to ${n.name}; the hunter will use it for local supplies.`, 14);
 return result;
};

// Bounty completion (+5), criminal-group threat clear (+3/+4), and the daily road-bandit reward already
// have completion/status guards in v0.7.2.5a/5b. Keep those established callbacks unchanged.
// Save/load migration keeps the schema at 8 and preserves the cooldown/award ledger if present.
const ir0734PersistBase = persist;
persist = function() {
 const result = ir0734PersistBase.apply(this, arguments);
 if (state?.character) {
  state.gameVersion = '0.7.3.4';
  state.saveSchemaVersion = IR073_SAVE_SCHEMA;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
 }
 return result;
};
const ir0734NormalizeBase = normalizeSave;
normalizeSave = function(input) {
 const ledger = input?.world?.v0734 ? ir0734CleanLedger(input.world.v0734) : null;
 const result = ir0734NormalizeBase.apply(this, arguments);
 if (result?.character) {
  result.world = result.world && typeof result.world === 'object' ? result.world : {};
  if (ledger) result.world.v0734 = ledger;
  else result.world.v0734 = ir0734CleanLedger(result.world.v0734);
  result.gameVersion = '0.7.3.4';
  result.saveSchemaVersion = IR073_SAVE_SCHEMA;
 }
 return result;
};
const ir0734ShellBase = shell;
shell = function() { return ir0734ShellBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.4').replace(/V0\.7\.3(?:\.\d+)?/g, 'V0.7.3.4'); };
const ir0734TopbarBase = topbar;
topbar = function() { return ir0734TopbarBase.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.3.4'); };
if (typeof document !== 'undefined') {
 document.title = 'Infinite Realms — Version 0.7.3.4';
 const css = document.createElement('style');
 css.textContent = '.ir0734-reputation-note{font-size:11px;color:var(--muted)}';
 document.head.appendChild(css);
}
// ================= End Infinite Realms v0.7.3.4 patch =================
