'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from core-v0.1 (orig. line 47)
const SKILLS={Combat:{icon:'⚔️',desc:'Basic fighting, awareness, and defense.',stat:'Strength'},Survival:{icon:'🌲',desc:'Tracking, foraging, and reading danger.',stat:'Perception'},Crafting:{icon:'🔨',desc:'Practical work, repair, and making useful things.',stat:'Intelligence'},Lore:{icon:'📘',desc:'Study, history, magical theory, and research.',stat:'Wisdom'},Social:{icon:'🗣️',desc:'Conversation, trust, persuasion, and connections.',stat:'Charisma'},Magic:{icon:'✨',desc:'Control over the strange forces of the world.',stat:'Wisdom'},Trade:{icon:'🪙',desc:'Bargaining, markets, and handling coin.',stat:'Charisma'}};

// from progression-economy-v0.4 (orig. line 729)
const IR_V04_DISCIPLINES = ['Swordsmanship','Martial Arts','Spear Arts','Axe Mastery','Archery','Shield Handling','Elemental Magic','Healing Magic','Stealth','Tracking','Smithing','Leatherworking','Alchemy','Mining','Herbalism','Fishing','Trade','Negotiation','Monster Lore'];

// from progression-economy-v0.4 (orig. line 730)
const IR_V04_WEAPON_SKILL = {dagger:'Swordsmanship',sword:'Swordsmanship',iron_sword:'Swordsmanship',spear:'Spear Arts',wooden_spear:'Spear Arts',axe:'Axe Mastery',bow:'Archery',staff:'Elemental Magic'};

// from talents-spells-factions-v0.5 (orig. line 869)
const IR_V05_TALENTS = [
 {id:'elite_swordsman',name:'Elite Swordsman',rarity:'Uncommon',icon:'⚔️',desc:'+18% damage with swords and daggers; Swordsmanship develops faster.',skills:['Swordsmanship'],races:['human','orc','dwarf'],backgrounds:['orc_warveteran','human_mediator','wanderer'],effect:'sword'},
 {id:'keen_hand_eye',name:'Keen Hand-Eye Coordination',rarity:'Rare',icon:'🏹',desc:'Archery develops faster and ranged attacks are more precise.',skills:['Archery'],races:['elf','beastkin','human'],backgrounds:['beastkin_tracker','elf_groveward'],effect:'archery'},
 {id:'master_craftsman',name:'Master Craftsman',rarity:'Uncommon',icon:'⚒️',desc:'Smithing, leatherworking, and crafting knowledge improve faster.',skills:['Smithing','Leatherworking','Crafting'],races:['dwarf','goblin'],backgrounds:['dwarf_forgeward','goblin_scrapwright','apprentice'],effect:'craft'},
 {id:'predator_instinct',name:'Predator’s Instinct',rarity:'Uncommon',icon:'🐾',desc:'Tracking and Survival improve faster; hunting leads are clearer.',skills:['Tracking','Survival'],races:['beastkin','orc'],backgrounds:['beastkin_tracker','beastkin_outrunner'],effect:'tracking'},
 {id:'born_fighter',name:'Born Fighter',rarity:'Uncommon',icon:'🥊',desc:'Combat, Martial Arts, and Axe Mastery develop faster.',skills:['Combat','Martial Arts','Axe Mastery'],races:['orc','human'],backgrounds:['orc_warveteran','orc_duelist'],effect:'fighter'},
 {id:'resourceful',name:'Resourceful',rarity:'Common',icon:'🧰',desc:'Survival, Mining, and salvage-related learning improve faster.',skills:['Survival','Mining','Herbalism'],races:['goblin','slimefolk'],backgrounds:['goblin_scrapwright','village','wanderer'],effect:'resourceful'},
 {id:'arcane_affinity',name:'Arcane Affinity',rarity:'Rare',icon:'✨',desc:'Magic and Elemental Magic develop faster; Fire Bolt is known at the start.',skills:['Magic','Elemental Magic','Lore'],races:['elf','demonkin','human'],backgrounds:['elf_arcanist','demonkin_occultist','apprentice'],effect:'arcane'},
 {id:'healing_aptitude',name:'Healing Aptitude',rarity:'Uncommon',icon:'💚',desc:'Healing Magic grows faster and healing spells restore 20% more health.',skills:['Healing Magic','Magic'],races:['slimefolk','elf','human'],backgrounds:['elf_groveward','slimefolk_laboratory'],effect:'healing'},
 {id:'mana_efficiency',name:'Mana Efficiency',rarity:'Rare',icon:'🔷',desc:'Spells cost 18% less mana.',skills:['Magic','Elemental Magic','Healing Magic'],races:['elf','demonkin','slimefolk'],backgrounds:['elf_arcanist','demonkin_occultist'],effect:'mana'},
 {id:'spell_precision',name:'Spell Precision',rarity:'Uncommon',icon:'🎯',desc:'Offensive magic deals 12% more damage.',skills:['Elemental Magic'],races:['elf','demonkin'],backgrounds:['elf_arcanist','demonkin_occultist'],effect:'spell'},
 {id:'quick_learner',name:'Quick Learner',rarity:'Uncommon',icon:'📚',desc:'Most skill learning is 12% more effective.',skills:['Lore','Social','Crafting','Magic','Combat'],races:['human'],backgrounds:['apprentice','merchant'],effect:'learning'},
 {id:'danger_sense',name:'Danger Sense',rarity:'Rare',icon:'👁️',desc:'Improved awareness of dangerous locations and ambushes.',skills:['Tracking','Monster Lore','Survival'],races:['beastkin','goblin'],backgrounds:['beastkin_tracker','wanderer'],effect:'danger'},
 {id:'sturdy_constitution',name:'Sturdy Constitution',rarity:'Common',icon:'🛡️',desc:'+8 maximum health.',skills:['Martial Arts','Combat'],races:['dwarf','orc','slimefolk'],backgrounds:['village','orc_warveteran'],effect:'health'},
 {id:'gifted_negotiator',name:'Gifted Negotiator',rarity:'Uncommon',icon:'🤝',desc:'Negotiation, Social, and Trade improve faster; market buying is slightly cheaper.',skills:['Negotiation','Social','Trade'],races:['human','goblin'],backgrounds:['merchant','human_mediator'],effect:'trade'},
 {id:'swift_reflexes',name:'Swift Reflexes',rarity:'Uncommon',icon:'💨',desc:'Agility-oriented disciplines develop faster and escaping danger is easier.',skills:['Archery','Stealth','Swordsmanship'],races:['beastkin','elf','goblin'],backgrounds:['wanderer','beastkin_tracker'],effect:'reflex'},
 {id:'natural_alchemist',name:'Natural Alchemist',rarity:'Rare',icon:'⚗️',desc:'Alchemy and Herbalism develop faster; alchemy results improve.',skills:['Alchemy','Herbalism'],races:['slimefolk','demonkin','elf'],backgrounds:['slimefolk_laboratory','demonkin_occultist'],effect:'alchemy'},
 {id:'wilderness_instinct',name:'Wilderness Instinct',rarity:'Common',icon:'🌿',desc:'Survival, Herbalism, and Tracking training are more effective.',skills:['Survival','Herbalism','Tracking'],races:['beastkin','slimefolk'],backgrounds:['beastkin_tracker','village'],effect:'wild'},
 {id:'iron_will',name:'Iron Will',rarity:'Rare',icon:'🗿',desc:'Resistance to fear and curse effects; Wisdom-focused skills develop faster.',skills:['Magic','Monster Lore','Negotiation'],races:['orc','dwarf','demonkin'],backgrounds:['orc_warveteran','demonkin_occultist'],effect:'will'},
 {id:'born_leader',name:'Born Leader',rarity:'Rare',icon:'👑',desc:'Social and Negotiation grow faster; regional aid has improved results.',skills:['Social','Negotiation'],races:['human','orc'],backgrounds:['human_mediator','merchant'],effect:'leader'},
 {id:'swift_hands',name:'Swift Hands',rarity:'Common',icon:'🖐️',desc:'Stealth, Trade, and improvised crafting develop faster.',skills:['Stealth','Trade','Crafting'],races:['goblin','beastkin'],backgrounds:['goblin_scrapwright','wanderer'],effect:'hands'},
 {id:'mana_well',name:'Deep Mana Well',rarity:'Exceptional',icon:'🔮',desc:'+18 maximum mana and improved mana regeneration.',skills:['Magic','Elemental Magic','Healing Magic'],races:['elf','demonkin','slimefolk'],backgrounds:['elf_arcanist','demonkin_occultist'],effect:'mana_well'},
 {id:'dragon_scholar',name:'Draconic Scholar',rarity:'Exceptional',icon:'🐉',desc:'Monster Lore and magical research improve faster; dragon signs are easier to interpret.',skills:['Monster Lore','Lore','Magic'],races:['human','elf','demonkin'],backgrounds:['apprentice','demonkin_occultist'],effect:'lore'},
 {id:'adaptive_form',name:'Adaptive Form',rarity:'Rare',icon:'🫧',desc:'Slimefolk or other adaptable characters learn Survival and Alchemy faster.',skills:['Survival','Alchemy'],races:['slimefolk','goblin'],backgrounds:['slimefolk_laboratory','goblin_scrapwright'],effect:'adaptive'}
];

// from talents-spells-factions-v0.5 (orig. line 894)
const IR_V05_SPELLS = {
 arcane_bolt:{name:'Arcane Bolt',icon:'✨',school:'Arcane',cost:10,kind:'damage',base:12,desc:'A reliable bolt of raw magical force.',req:'Magic 1',skill:'Magic',level:1,price:0,combat:true},
 fire_bolt:{name:'Fire Bolt',icon:'🔥',school:'Elemental',cost:13,kind:'burn',base:17,desc:'A sharp fire spell that leaves a lingering burn.',req:'Elemental Magic 1',skill:'Elemental Magic',level:1,price:14,combat:true},
 ice_shard:{name:'Ice Shard',icon:'❄️',school:'Elemental',cost:15,kind:'slow',base:15,desc:'A piercing shard that weakens the target’s next attacks.',req:'Elemental Magic 2',skill:'Elemental Magic',level:2,price:20,combat:true},
 lightning_arc:{name:'Lightning Arc',icon:'⚡',school:'Elemental',cost:23,kind:'damage',base:28,desc:'A powerful arc of lightning. Expensive, but hits hard.',req:'Elemental Magic 4',skill:'Elemental Magic',level:4,price:42,combat:true},
 healing_light:{name:'Healing Light',icon:'💚',school:'Restoration',cost:15,kind:'heal',base:24,desc:'Restore health in battle or while exploring.',req:'Healing Magic 1',skill:'Healing Magic',level:1,price:16,combat:true},
 mana_shield:{name:'Mana Shield',icon:'🔷',school:'Protection',cost:17,kind:'shield',base:0,desc:'A mana barrier braces you against the next incoming blow.',req:'Elemental Magic 2',skill:'Elemental Magic',level:2,price:22,combat:true},
 entangling_roots:{name:'Entangling Roots',icon:'🌱',school:'Nature',cost:17,kind:'root',base:5,desc:'Roots lash out and can interrupt a foe’s turn.',req:'Survival 2 or Elemental Magic 2',skill:'Survival',level:2,price:22,combat:true},
 earth_wall:{name:'Earth Wall',icon:'🪨',school:'Earth',cost:18,kind:'wall',base:0,desc:'Raise a temporary wall and reduce the next hit.',req:'Shield Handling 2 or Elemental Magic 2',skill:'Elemental Magic',level:2,price:22,combat:true},
 nature_aid:{name:'Nature’s Aid',icon:'🍃',school:'Nature',cost:13,kind:'heal',base:15,desc:'Ask nearby nature for modest restorative help.',req:'Survival 2',skill:'Survival',level:2,price:15,combat:true},
 mana_detection:{name:'Mana Detection',icon:'🧿',school:'Utility',cost:7,kind:'detect',base:0,desc:'Reveal a nearby unknown place or a hidden magical clue.',req:'Magic 1 or Lore 2',skill:'Magic',level:1,price:10,combat:false},
 identify:{name:'Identify',icon:'📜',school:'Utility',cost:8,kind:'identify',base:0,desc:'Study an item, monster, or local anomaly to uncover reliable details.',req:'Lore 2',skill:'Lore',level:2,price:12,combat:false},
 telekinesis:{name:'Telekinesis',icon:'🪄',school:'Utility',cost:20,kind:'telekinesis',base:0,desc:'Retrieve a small visible item or interact with a distant object.',req:'Elemental Magic 3',skill:'Elemental Magic',level:3,price:30,combat:false}
};
