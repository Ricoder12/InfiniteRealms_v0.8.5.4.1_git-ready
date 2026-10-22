'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from life-paths-combat-v0.3 (orig. line 519)
const IR_ENEMIES={
 goblin:{id:'goblin',name:'Goblin Scavenger',icon:'👺',hp:27,attack:7,defense:1,xp:24,coins:[4,10],style:'trickster',bribe:8,loot:['scrap','scrap','dagger'],biomes:['forest','plains','mountain','woodland'],desc:'A quick opportunist with a chipped blade and a plan to leave before the odds turn.'},
 slime:{id:'slime',name:'Cave Slime',icon:'🟢',hp:30,attack:6,defense:2,xp:22,coins:[1,5],style:'acid',loot:['herb','charm'],biomes:['swamp','cave','river','coast'],desc:'A gelatinous creature that absorbs debris and leaves a sharp, sour smell.'},
 wolf:{id:'wolf',name:'Grey Wolf',icon:'🐺',hp:32,attack:8,defense:1,xp:25,coins:[0,2],style:'bleed',loot:['wolf_fang','herb'],biomes:['forest','plains','snow','woodland'],desc:'It tests your stance, looking for a chance to bite and pull you off balance.'},
 spider:{id:'spider',name:'Giant Spider',icon:'🕷️',hp:29,attack:7,defense:2,xp:28,coins:[0,3],style:'poison',loot:['spider_silk','herb'],biomes:['forest','swamp','cave','mountain'],desc:'A large spider waits low to the ground, its fangs glistening with venom.'},
 bandit:{id:'bandit',name:'Road Bandit',icon:'🗡️',hp:36,attack:9,defense:2,xp:34,coins:[7,16],style:'balanced',bribe:15,loot:['scrap','dagger','bread'],biomes:['plains','desert','coast','woodland','mountain'],desc:'An armed road robber who expects fear to do half the work.'},
 thief:{id:'thief',name:'Nervous Thief',icon:'🥷',hp:25,attack:6,defense:1,xp:24,coins:[3,9],style:'steal',bribe:6,loot:['charm','scrap'],biomes:['settlement','plains','coast','river'],desc:'A desperate thief who would rather take your purse and run than fight fairly.'},
 guard:{id:'guard',name:'Corrupt Guard',icon:'🛡️',hp:43,attack:9,defense:5,xp:38,coins:[5,12],style:'balanced',bribe:20,loot:['sword','shield'],biomes:['settlement'],desc:'A guard abuses their authority and blocks the path. This is a serious fight, not a routine encounter.'},
 skeleton:{id:'skeleton',name:'Restless Skeleton',icon:'💀',hp:34,attack:8,defense:3,xp:32,coins:[1,5],style:'undead',loot:['bone','bone'],biomes:['mountain','snow','swamp','cave'],desc:'Old bones move under a thread of leftover magic. It does not tire.'},
 wight:{id:'wight',name:'Barrow Wight',icon:'☠️',hp:42,attack:10,defense:4,xp:43,coins:[4,12],style:'curse',loot:['bone','curse_shard'],biomes:['swamp','snow','mountain','cave'],desc:'A cold shape, still holding the spite of a forgotten burial.'},
 boar:{id:'boar',name:'Wild Boar',icon:'🐗',hp:38,attack:9,defense:2,xp:30,coins:[0,3],style:'charge',loot:['wolf_fang','herb'],biomes:['forest','plains','woodland'],desc:'A broad boar scrapes the ground and lowers its head for a charge.'},
 direwolf:{id:'direwolf',name:'Dire Wolf',icon:'🐺',hp:48,attack:11,defense:3,xp:45,coins:[2,6],style:'bleed',loot:['wolf_fang','wolf_fang'],biomes:['forest','snow','mountain'],desc:'A much larger predator that has learned to circle rather than rush.'},
 ogre:{id:'ogre',name:'Ogre Bruiser',icon:'👹',hp:62,attack:12,defense:4,xp:52,coins:[10,22],style:'heavy',bribe:28,loot:['axe','scrap'],biomes:['mountain','swamp','woodland'],desc:'A hulking creature. Blocking its strongest swings is safer than trading blows.'},
 troll:{id:'troll',name:'Moss Troll',icon:'🪨',hp:66,attack:10,defense:4,xp:56,coins:[7,18],style:'regenerate',loot:['ore','herb'],biomes:['swamp','mountain','forest'],desc:'A resilient troll that slowly recovers unless its opponent keeps up the pressure.'},
 cultist:{id:'cultist',name:'Forbidden Cultist',icon:'🕯️',hp:37,attack:10,defense:2,xp:42,coins:[8,18],style:'curse',bribe:18,loot:['curse_shard','charm'],biomes:['settlement','swamp','mountain','cave'],desc:'A practiced ritualist who uses curses and tries to drain your energy.'},
 guardian:{id:'guardian',name:'Vault Guardian',icon:'🗿',hp:88,attack:13,defense:6,xp:95,coins:[22,38],style:'boss',loot:['dungeon_relic','curse_shard'],biomes:['dungeon'],desc:'A stone-and-iron sentinel animated by the sealed vault’s last command.'}
};

// from life-paths-combat-v0.3 (orig. line 536)
const IR_BIOME_ENEMIES={forest:['wolf','spider','goblin','boar','direwolf'],plains:['wolf','boar','bandit','goblin'],mountain:['goblin','skeleton','ogre','spider','troll'],swamp:['slime','spider','wight','troll','cultist'],desert:['bandit','thief','boar','slime'],snow:['wolf','direwolf','skeleton','wight'],coast:['thief','bandit','slime'],river:['slime','thief','wolf','spider'],woodland:['goblin','wolf','boar','bandit']};

// from progression-economy-v0.4 (orig. line 783)
const IR_V04_ENEMY_OVERRIDES={
 goblin:{hp:18,attack:5,defense:0,xp:16,coins:[2,6],threatRank:1,threatLabel:'Minor · local',threatDesc:'A lone scavenger; often defeated in two or three clean hits by a trained character.',level:1},
 slime:{hp:23,attack:5,defense:1,xp:18,coins:[1,5],threatRank:1,threatLabel:'Minor · local',threatDesc:'Low raw power; acid can punish careless gear use.',level:1},
 thief:{hp:28,attack:7,defense:1,xp:19,coins:[2,8],threatRank:1,threatLabel:'Minor · local',threatDesc:'A desperate opponent more likely to steal or flee than hold ground.',level:1},
 wolf:{hp:44,attack:9,defense:2,xp:30,coins:[0,3],threatRank:2,threatLabel:'Wildlife · dangerous',threatDesc:'A real predator with higher durability and bleeding bites.',level:3},
 spider:{hp:36,attack:8,defense:2,xp:31,coins:[0,4],threatRank:2,threatLabel:'Wildlife · dangerous',threatDesc:'Moderate health plus a chance to poison its target.',level:3},
 bandit:{hp:56,attack:11,defense:3,xp:42,coins:[7,16],threatRank:2,threatLabel:'Armed · serious',threatDesc:'A trained hostile who combines weapons with opportunism.',level:4},
 skeleton:{hp:64,attack:11,defense:4,xp:40,coins:[1,5],threatRank:2,threatLabel:'Undead · dangerous',threatDesc:'Harder to stop than a goblin and not vulnerable to exhaustion.',level:4},
 boar:{hp:61,attack:12,defense:3,xp:36,coins:[0,3],threatRank:2,threatLabel:'Wildlife · dangerous',threatDesc:'A charging animal with heavy impact and a risk of bleeding.',level:4},
 guard:{hp:105,attack:15,defense:7,xp:70,coins:[5,12],threatRank:3,threatLabel:'Settlement · elite',threatDesc:'A trained guard in armor; fighting one is a serious choice.',level:7},
 wight:{hp:128,attack:17,defense:7,xp:86,coins:[4,12],threatRank:3,threatLabel:'Regional · elite',threatDesc:'An old undead threat with substantial resilience and curse effects.',level:8},
 direwolf:{hp:145,attack:19,defense:6,xp:92,coins:[2,6],threatRank:3,threatLabel:'Regional predator',threatDesc:'A large apex predator built for endurance, not a routine wolf encounter.',level:8},
 cultist:{hp:96,attack:17,defense:5,xp:80,coins:[8,18],threatRank:3,threatLabel:'Occult · elite',threatDesc:'A practiced ritualist with strong attacks and energy-draining curses.',level:8},
 ogre:{hp:245,attack:25,defense:11,xp:170,coins:[10,22],threatRank:4,threatLabel:'Regional · major',threatDesc:'A massive brute able to punish unprepared low-level characters.',level:13},
 troll:{hp:320,attack:20,defense:10,xp:200,coins:[7,18],threatRank:4,threatLabel:'Regional · major',threatDesc:'A regenerating creature whose durability rewards preparation and sustained pressure.',level:14},
 guardian:{hp:620,attack:32,defense:17,xp:650,coins:[22,38],threatRank:5,threatLabel:'Dungeon boss',threatDesc:'A fortified vault sentinel with boss-scale endurance and punishing attacks.',level:20},
 dragon:{id:'dragon',name:'Ancient Dragon',icon:'🐉',hp:5200,attack:125,defense:48,xp:25000,coins:[500,900],style:'dragon',loot:['dragon_scale','dragon_core','dungeon_relic'],biomes:['mountain','volcano'],desc:'An ancient calamity whose awakening could threaten a city or nation.',threatRank:7,threatLabel:'National / city threat',threatDesc:'Not a random encounter. Requires high-level preparation, allies, specialist equipment, and a major warning chain.',level:60,bribe:0}
};
