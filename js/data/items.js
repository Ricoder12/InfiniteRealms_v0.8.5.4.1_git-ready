'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from core-v0.1 (orig. line 48)
const ITEMS={bread:{name:'Trail Bread',icon:'🍞',desc:'A sturdy loaf that restores hunger.',use:'Eat',sell:2},bandage:{name:'Field Bandage',icon:'🩹',desc:'A clean wrap for minor injuries.',use:'Use',sell:3},journal:{name:'Guild Journal',icon:'📓',desc:'A worn notebook with blank pages.',use:'Study',sell:4},dagger:{name:'Rusty Dagger',icon:'🗡️',desc:'Not pretty, but better than bare hands.',use:'Inspect',sell:5},charm:{name:'Copper Charm',icon:'🧿',desc:'A small keepsake that feels faintly warm.',use:'Inspect',sell:6},scrap:{name:'Useful Scrap',icon:'⚙️',desc:'A salvaged piece that someone may want.',use:'Sell',sell:4},herb:{name:'Bitterleaf',icon:'🌿',desc:'A common herb used in simple remedies.',use:'Sell',sell:3},ore:{name:'Raw Ore',icon:'🪨',desc:'A heavy lump of workable ore.',use:'Sell',sell:5},map:{name:'Rough Region Map',icon:'🗺️',desc:'A hand-drawn map of local paths.',use:'Inspect',sell:7}};

// from life-paths-combat-v0.3 (orig. line 537)
const IR_WEAPON_DATA={dagger:{damage:3,magic:0},axe:{damage:6,magic:0},sword:{damage:5,magic:0},staff:{damage:2,magic:4}};

// from progression-economy-v0.4 (orig. line 717)
const IR_V04_ITEM_DATA = {
 bread:{value:5,category:'food',shop:'general',stock:10}, bandage:{value:10,category:'medicine',shop:'general',stock:5}, potion:{value:18,category:'medicine',shop:'alchemist',stock:3},
 scrap:{value:5,category:'parts',shop:'general',stock:8}, herb:{value:4,category:'herbs',shop:'alchemist',stock:7}, ore:{value:8,category:'ore',shop:'smithy',stock:5}, wood:{value:4,category:'wood',shop:'general',stock:8}, cloth:{value:4,category:'cloth',shop:'general',stock:5}, leather:{value:7,category:'leather',shop:'hunter',stock:4}, wolf_pelt:{value:11,category:'leather',shop:'hunter',stock:2}, wolf_fang:{value:10,category:'trophy',shop:'hunter',stock:2}, spider_silk:{value:14,category:'reagent',shop:'alchemist',stock:2}, slime_gel:{value:12,category:'reagent',shop:'alchemist',stock:2}, coal:{value:5,category:'fuel',shop:'smithy',stock:6}, iron_ingot:{value:18,category:'metal',shop:'smithy',stock:3}, stone:{value:4,category:'stone',shop:'general',stock:8}, fish:{value:7,category:'food',shop:'general',stock:4}, dagger:{value:12,category:'weapon',shop:'smithy',stock:2}, sword:{value:22,category:'weapon',shop:'smithy',stock:2}, iron_sword:{value:34,category:'weapon',shop:'smithy',stock:1}, axe:{value:24,category:'weapon',shop:'smithy',stock:1}, spear:{value:24,category:'weapon',shop:'smithy',stock:2}, wooden_spear:{value:9,category:'weapon',shop:'general',stock:2}, bow:{value:22,category:'weapon',shop:'hunter',stock:2}, staff:{value:22,category:'weapon',shop:'alchemist',stock:1}, shield:{value:17,category:'armor',shop:'smithy',stock:2}, leather_armor:{value:28,category:'armor',shop:'smithy',stock:1}, iron_armor:{value:58,category:'armor',shop:'smithy',stock:1}, journal:{value:16,category:'knowledge',shop:'general',stock:3}, charm:{value:9,category:'reagent',shop:'alchemist',stock:3}, dungeon_relic:{value:42,category:'relic',shop:'general',stock:0}, curse_shard:{value:24,category:'reagent',shop:'alchemist',stock:0}, bone:{value:4,category:'trophy',shop:'hunter',stock:0}, dragon_scale:{value:240,category:'relic',shop:'alchemist',stock:0}, dragon_core:{value:500,category:'relic',shop:'alchemist',stock:0}
};

// from progression-economy-v0.4 (orig. line 724)
const IR_V04_ITEM_WEIGHT={bread:.4,bandage:.2,potion:.35,scrap:.8,herb:.1,ore:2,wood:1.5,cloth:.4,leather:1,wolf_pelt:1.5,wolf_fang:.15,spider_silk:.1,slime_gel:.4,coal:1,iron_ingot:2,stone:2,fish:.5,dagger:1.5,sword:2.6,iron_sword:2.8,axe:3,spear:2.8,wooden_spear:1.5,bow:2,staff:2,shield:3,leather_armor:4,iron_armor:9,journal:.7,charm:.1,dungeon_relic:.5,curse_shard:.1,bone:.5,dragon_scale:1.5,dragon_core:1.2};

// from progression-economy-v0.4 (orig. line 744)
const IR_V04_RECIPES = {
 bandage:{name:'Field Bandage',icon:'🩹',station:'field',skill:'Leatherworking',level:1,needs:{herb:1,cloth:1},output:{bandage:1},desc:'A simple medical wrap.'},
 wooden_spear:{name:'Wooden Practice Spear',icon:'🔱',station:'field',skill:'Spear Arts',level:1,needs:{wood:2,scrap:1},output:{wooden_spear:1},desc:'A basic training weapon.'},
 iron_ingot:{name:'Smelt Iron Ingot',icon:'🧱',station:'forge',skill:'Smithing',level:1,needs:{ore:2,coal:1},output:{iron_ingot:1},desc:'Refine raw ore with fuel.'},
 iron_sword:{name:'Forge Iron Sword',icon:'⚔️',station:'forge',skill:'Smithing',level:2,needs:{iron_ingot:2,wood:1},output:{iron_sword:1},desc:'A reliable blade for the next leg of the journey.'},
 leather_armor:{name:'Make Leather Armor',icon:'🥋',station:'forge',skill:'Leatherworking',level:2,needs:{wolf_pelt:2,leather:1,cloth:1},output:{leather_armor:1},desc:'Flexible protection made from processed hide.'},
 potion:{name:'Brew Minor Potion',icon:'🧪',station:'alchemy',skill:'Alchemy',level:1,needs:{herb:2,slime_gel:1},output:{potion:1},desc:'A small restorative draught.'},
 spear:{name:'Forge Iron-Tipped Spear',icon:'🔱',station:'forge',skill:'Smithing',level:2,needs:{iron_ingot:1,wood:2,scrap:1},output:{spear:1},desc:'A proper polearm with better reach.'},
 shield:{name:'Make Wooden Shield',icon:'🛡️',station:'forge',skill:'Smithing',level:1,needs:{wood:2,leather:1},output:{shield:1},desc:'A basic shield for the off-hand.'}
};

// from progression-economy-v0.4 (orig. line 762)
const IR_V04_SHOPS={general:['bread','bandage','wood','cloth','scrap','stone','wooden_spear','journal'],smithy:['ore','coal','iron_ingot','dagger','sword','iron_sword','axe','spear','shield','leather_armor','iron_armor'],alchemist:['herb','potion','slime_gel','spider_silk','charm','staff'],hunter:['wolf_pelt','leather','wolf_fang','bow','fish','bandage']};

// from talents-spells-factions-v0.5 (orig. line 908)
const IR_V05_GEAR = {
 iron_helmet:{slot:'head',armor:1,icon:'⛑️',name:'Iron Helmet',desc:'A sturdy cap that protects the head.',sell:11,weight:2,shop:'smithy',category:'armor',value:22,stock:2},
 leather_gloves:{slot:'hands',armor:1,icon:'🧤',name:'Leather Gloves',desc:'Flexible gloves for handling weapons and tools.',sell:6,weight:.5,shop:'hunter',category:'leather',value:12,stock:3},
 travel_leggings:{slot:'legs',armor:1,icon:'🦵',name:'Reinforced Leggings',desc:'Padded leg protection for long journeys.',sell:8,weight:1.5,shop:'smithy',category:'armor',value:17,stock:2},
 trail_boots:{slot:'feet',armor:1,icon:'🥾',name:'Trail Boots',desc:'Tough boots with reliable grip on dirt roads.',sell:7,weight:1.1,shop:'hunter',category:'leather',value:15,stock:2},
 silver_amulet:{slot:'accessory',armor:0,icon:'📿',name:'Silver Amulet',desc:'A simple charm that steadies magical focus.',sell:14,weight:.1,shop:'alchemist',category:'reagent',value:28,stock:1,manaBonus:5},
 iron_ring:{slot:'accessory',armor:0,icon:'💍',name:'Iron Signet Ring',desc:'A durable ring stamped with a small regional crest.',sell:8,weight:.1,shop:'general',category:'relic',value:16,stock:2}
};
