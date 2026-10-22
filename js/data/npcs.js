'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from core-v0.1 (orig. line 64)
const NPC_NAMES=[{name:'Mira Fen',role:'Innkeeper',icon:'🍲',line:'The roads are kinder when you know who to ask.'},{name:'Bram Alder',role:'Road Warden',icon:'🛡️',line:'Keep your eyes up when you leave the lamps behind.'},{name:'Tavi Reed',role:'Courier',icon:'📯',line:'Every little job has a way of leading somewhere.'}];

// from talents-spells-factions-v0.5 (orig. line 966)
const IR_V05_FACTION_DEFS={adventurers:{name:'Adventurers Guild',icon:'⚔️',desc:'Contracts, monster reports, and dangerous route protection.',req:'Available in settlements'},merchants:{name:'Merchant Consortium',icon:'🪙',desc:'Trade routes, market intelligence, and supply contracts.',req:'A settlement market'},royal:{name:'Regional Authority',icon:'🏰',desc:'Settlement defense, law, and public works.',req:'A town, city, or work board'},arcanum:{name:'Circle of the Arcanum',icon:'🔮',desc:'Magical study, anomaly investigation, and artifact handling.',req:'Magic 2 or a library'},shadow:{name:'Shadow Network',icon:'🌑',desc:'Covert information, discreet retrieval, and risky favors.',req:'Stealth 2, Demonkin affinity, or Goblin contacts'}};

// from npc-foundation-v0.6 (orig. line 1287)
const IR06_NAMES=['Alden','Mira','Tavi','Bram','Nessa','Corin','Elara','Dain','Pella','Orin','Sella','Rook','Liora','Fen','Kest','Iven','Maelin','Toren','Veya','Noll','Sorin','Anwen','Perrin','Ysra','Calder','Edda','Jory','Maren','Thom','Leth'];

// from npc-foundation-v0.6 (orig. line 1288)
const IR06_SURNAMES=['Fen','Alder','Reed','Stone','Moss','Vale','Thorn','Brook','Ash','Hollow','Wick','Dale','Copper','Wren','Pike','Briar','Morrow','Glen','Hart','Flint'];

// from npc-foundation-v0.6 (orig. line 1289)
const IR06_TRAITS=[['generous','Generous'],['suspicious','Suspicious'],['ambitious','Ambitious'],['cautious','Cautious'],['competitive','Competitive'],['loyal','Loyal'],['curious','Curious'],['patient','Patient']];

// from npc-foundation-v0.6 (orig. line 1290)
const IR06_POOLS={
 market:[['merchant','Merchant','🪙'],['trader','Trader','🧺'],['shopper','Shopper','🛍️'],['courier','Courier','📯']],
 forge:[['blacksmith','Blacksmith','🔨'],['apprentice','Apprentice','⚒️'],['armorer','Armorer','🛡️'],['customer','Customer','🧰']],
 tavern:[['innkeeper','Innkeeper','🍲'],['bard','Entertainer','🎻'],['traveler','Traveler','🎒'],['adventurer','Adventurer','⚔️']],
 guild:[['recruiter','Guild Recruiter','📜'],['adventurer','Adventurer','⚔️'],['trainer','Trainer','🎯'],['scribe','Guild Scribe','📚']],
 farm:[['farmer','Farmer','🌾'],['laborer','Farm Laborer','🧺'],['herbalist','Herbalist','🌿']],
 forest:[['hunter','Hunter','🏹'],['herbalist','Herbalist','🌿'],['ranger','Ranger','🌲']],
 mine:[['miner','Miner','⛏️'],['prospector','Prospector','🪨'],['guard','Mine Guard','🛡️']],
 road:[['merchant','Road Merchant','🛒'],['messenger','Messenger','📯'],['mercenary','Mercenary','🗡️']],
 dungeon:[['explorer','Explorer','🧭'],['researcher','Researcher','📘'],['rival','Rival Adventurer','⚔️']],
 royal:[['official','Official','🏛️'],['knight','Knight','🛡️'],['noble','Noble','👑']]
};

// from town-services-road-trading-v0.7.2 (orig. line 2511)
const IR072_TOWN_RESIDENT_POOL=[
 ['resident','Resident','♙'],['farmer','Farmer','🌾'],['innkeeper','Innkeeper','🍲'],
 ['guard','Town Guard','🛡️'],['scholar','Scholar','📚'],['hunter','Hunter','🏹'],
 ['herbalist','Herbalist','🌿'],['courier','Courier','📯'],['bard','Entertainer','🎻'],
 ['recruiter','Guild Recruiter','📜'],['laborer','Laborer','🧺'],['traveler','Traveler','🎒']
];
