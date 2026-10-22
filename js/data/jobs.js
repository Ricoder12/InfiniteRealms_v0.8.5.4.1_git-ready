'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from core-v0.1 (orig. line 49)
const JOBS=[
{id:'laborer',name:'Quarry Hand',icon:'⛏️',pay:34,skill:'Crafting',desc:'Carry stone and help with repairs. Steady and physical.',req:'Strength 9'},
{id:'shop',name:'Market Assistant',icon:'🧺',pay:30,skill:'Trade',desc:'Stock shelves, help travelers, and mind the till.',req:'Charisma 8'},
{id:'courier',name:'Local Courier',icon:'📯',pay:38,skill:'Survival',desc:'Carry letters between nearby settlements and outposts.',req:'Agility 9'},
{id:'scribe',name:'Copyist’s Aid',icon:'🪶',pay:32,skill:'Lore',desc:'Copy notices, sort records, and learn from old texts.',req:'Intelligence 9'},
{id:'apprentice',name:'Workshop Apprentice',icon:'🔧',pay:36,skill:'Crafting',desc:'Assist a craftsperson and learn useful techniques.',req:'Crafting 2'},
{id:'guide',name:'Trail Guide',icon:'🧭',pay:40,skill:'Survival',desc:'Guide locals along familiar paths. Riskier but rewarding.',req:'Survival 2'}
];

// from life-paths-combat-v0.3 (orig. line 498)
const IR_LIFE_JOBS=[
 {id:'human_mediator',name:'Settlement Mediator',icon:'⚖️',pay:43,skill:'Social',desc:'Resolve disputes and help merchants reach workable agreements.',req:'Social 2',pathRace:'human',pathBackgrounds:['human_mediator'],service:'work-board',minSkills:{Social:2},specialty:'Negotiation'},
 {id:'human_envoy',name:'Caravan Envoy',icon:'📯',pay:40,skill:'Trade',desc:'Carry offers between settlements and negotiate safe passage.',req:'Trade 2',pathRace:'human',service:'caravan',minSkills:{Trade:2},specialty:'Diplomacy'},
 {id:'dwarf_forge',name:'Forge Assistant',icon:'🔨',pay:45,skill:'Crafting',desc:'Repair tools, prepare metal, and help a smith meet urgent orders.',req:'Crafting 2',pathRace:'dwarf',pathBackgrounds:['dwarf_forgeward'],service:'work-board',minSkills:{Crafting:2},specialty:'Craftsmanship'},
 {id:'dwarf_delver',name:'Mine Surveyor',icon:'⛏️',pay:43,skill:'Survival',desc:'Mark safe passages and identify mineral seams before a crew enters.',req:'Survival 2',pathRace:'dwarf',pathBackgrounds:['dwarf_deepdelver'],service:'work-board',minSkills:{Survival:2},specialty:'Delving'},
 {id:'elf_arcanist',name:'Arcane Research Assistant',icon:'📚',pay:42,skill:'Lore',desc:'Catalogue rune fragments and help a scholar study magical phenomena.',req:'Lore 2',pathRace:'elf',pathBackgrounds:['elf_arcanist'],service:'library',minSkills:{Lore:2},specialty:'Arcane Study'},
 {id:'elf_groveward',name:'Herbal Warden',icon:'🌿',pay:39,skill:'Survival',desc:'Gather rare herbs and investigate changes in local plant life.',req:'Survival 2',pathRace:'elf',pathBackgrounds:['elf_groveward'],service:'work-board',minSkills:{Survival:2},specialty:'Nature'},
 {id:'beastkin_tracker',name:'Professional Tracker',icon:'🐾',pay:44,skill:'Survival',desc:'Follow trails, locate missing livestock, and warn travelers about danger.',req:'Survival 2',pathRace:'beastkin',pathBackgrounds:['beastkin_tracker'],service:'work-board',minSkills:{Survival:2},specialty:'Tracking'},
 {id:'beastkin_warden',name:'Wilderness Warden',icon:'🌲',pay:40,skill:'Combat',desc:'Protect trail users and relocate dangerous animals when possible.',req:'Combat 2',pathRace:'beastkin',service:'work-board',minSkills:{Combat:2},specialty:'Wilderness'},
 {id:'orc_guard',name:'Caravan Guard',icon:'🛡️',pay:48,skill:'Combat',desc:'Protect cargo and travelers on roads where ambushes are common.',req:'Combat 2',pathRace:'orc',pathBackgrounds:['orc_warveteran'],service:'caravan',minSkills:{Combat:2},specialty:'Protection'},
 {id:'orc_fighter',name:'Pit Fighter',icon:'🥊',pay:46,skill:'Combat',desc:'Enter controlled bouts to earn coin and improve practical combat skill.',req:'Combat 2',pathRace:'orc',pathBackgrounds:['orc_duelist'],service:'guild',minSkills:{Combat:2},specialty:'Combat'},
 {id:'goblin_scrapwright',name:'Salvage Appraiser',icon:'⚙️',pay:42,skill:'Crafting',desc:'Sort useful scrap from rubbish and salvage reusable parts for workshops.',req:'Crafting 2',pathRace:'goblin',pathBackgrounds:['goblin_scrapwright'],service:'market',minSkills:{Crafting:2},specialty:'Scavenging'},
 {id:'goblin_trapper',name:'Trap Setter',icon:'🪤',pay:41,skill:'Survival',desc:'Place warning snares and harmless deterrents around vulnerable storehouses.',req:'Survival 2',pathRace:'goblin',pathBackgrounds:['goblin_alleyghost'],service:'work-board',minSkills:{Survival:2},specialty:'Traps'},
 {id:'demonkin_cursewright',name:'Cursewright',icon:'🔮',pay:54,skill:'Magic',desc:'Lay or remove contract-bound curses for clients willing to pay for discreet occult work. Failed or exposed jobs can damage local trust.',req:'Magic 2',pathRace:'demonkin',pathBackgrounds:['demonkin_occultist'],service:'library',minSkills:{Magic:2},specialty:'Occult',shadow:true},
 {id:'demonkin_shadow',name:'Shadow Operative',icon:'🌑',pay:58,skill:'Survival',desc:'Handle discreet assignments including misdirection, counter-sabotage, and carefully scoped interference in rival operations.',req:'Survival 2',pathRace:'demonkin',pathBackgrounds:['demonkin_exile','demonkin_occultist'],service:'guild',minSkills:{Survival:2},specialty:'Covert Work',shadow:true},
 {id:'demonkin_hexbreaker',name:'Hexbreaker',icon:'🧿',pay:46,skill:'Lore',desc:'Investigate curses and protect clients from malicious enchantments.',req:'Lore 2',pathRace:'demonkin',service:'work-board',minSkills:{Lore:2},specialty:'Curse Removal'},
 {id:'slimefolk_alchemist',name:'Alchemist’s Assistant',icon:'🧪',pay:43,skill:'Lore',desc:'Gather safe samples and help prepare controlled material tests.',req:'Lore 2',pathRace:'slimefolk',pathBackgrounds:['slimefolk_laboratory'],service:'library',minSkills:{Lore:2},specialty:'Alchemy'},
 {id:'slimefolk_collector',name:'Material Collector',icon:'🫧',pay:40,skill:'Crafting',desc:'Locate compatible materials and sort useful substances from dangerous residue.',req:'Crafting 2',pathRace:'slimefolk',pathBackgrounds:['slimefolk_collector'],service:'market',minSkills:{Crafting:2},specialty:'Adaptation'}
];
