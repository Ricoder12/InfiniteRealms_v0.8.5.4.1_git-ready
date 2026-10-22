'use strict';
boot();
try{const ir073v=ir073Data();if(!Number.isFinite(Number(ir073v.lastObservedReputation)))ir073v.lastObservedReputation=ir073Rep();persist()}catch(e){console.warn('Reputation history initialization deferred safely',e)}
try{ir0729CompensateLegacyBossReward()}catch(e){console.warn('Legacy Gang Boss reward compensation deferred safely',e)}
// Migrate only NPCs already present in the save; do not pre-generate residents for unvisited sites.
if(state?.character){try{ir071MigrateExistingNPCs();ir071RecordPresentNPCs()}catch(e){console.warn('NPC schedule migration deferred safely',e)}}
