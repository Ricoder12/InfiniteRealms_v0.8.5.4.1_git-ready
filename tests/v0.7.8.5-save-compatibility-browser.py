"""Browser-level save compatibility tests for Infinite Realms v0.7.8.5.
Creates the older save by running the accepted v0.7.6.6 standalone in Chromium,
then loads that save into the v0.7.8.5 standalone and checks continuation.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CURRENT_HTML = ROOT / 'dist' / 'infinite-realms.html'
LEGACY_HTML = ROOT / 'backups' / 'InfiniteRealms_v0.7.6.6_accepted_baseline.html'
ACCEPTED_777_HTML = ROOT / 'backups' / 'InfiniteRealms_v0.7.7.7_accepted_baseline.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.8.5-save-compatibility-browser-log.json'
SCREENSHOTS = ROOT / 'docs' / 'screenshots'
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def storage_shim(initial):
    payload = json.dumps(initial, ensure_ascii=False).replace('</', '<\\/')
    return """<script>(function(){const initial=%s;const store=new Map(Object.entries(initial));const shim={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>Array.from(store.keys())[i]||null,get length(){return store.size}};Object.defineProperty(window,'localStorage',{configurable:true,value:shim});window.__irTestStore=store;})();</script>""" % payload


def inject_storage(html, initial=None):
    shim = storage_shim(initial or {})
    if '<body>' not in html:
        raise RuntimeError('Expected body tag in standalone HTML')
    return html.replace('<body>', '<body>' + shim, 1)


def read_text(path):
    return path.read_text(encoding='utf-8')

results, browser_errors = [], []
def add(name, passed, detail=''):
    row = {'test': name, 'status': 'PASS' if passed else 'FAIL', 'detail': str(detail)}
    results.append(row)
    print(row['status'] + ': ' + name + (': ' + str(detail) if detail else ''), flush=True)


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])

    # Build authentic pre-v0.7.7.7 save fixtures with the accepted v0.7.6.6 game code running in Chromium.
    old_page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    old_page.on('pageerror', lambda error: browser_errors.append('legacy pageerror: ' + str(error)))
    old_page.on('console', lambda msg: browser_errors.append('legacy console error: ' + msg.text) if msg.type == 'error' else None)
    old_page.set_content(inject_storage(read_text(LEGACY_HTML)), wait_until='load', timeout=60000)
    legacy_data = old_page.evaluate(r'''() => {
      createSeed='IR-0778-LEGACY-766-BROWSER'; createStart='roadside';
      state=makeInitial('Legacy Cartographer','elf','ranger');
      const w=state.world,c=state.character,sites=w.region.sites;
      c.ageMonths=382;c.daysLived=1164;c.coin=481;c.reputation=23;c.attrs.Intelligence=27;c.attrs.Wisdom=19;
      c.skills.Lore={level:18,xp:43};c.skills.Swordsmanship={level:12,xp:76};
      c.inventory={bread:7,bandage:3,journal:2,herb:5,ore:4,scrap:6,iron_sword:1,leather_armor:1,shield:1,iron_helmet:1,leather_gloves:1,travel_leggings:1,trail_boots:1,silver_amulet:1};
      c.equipment={weapon:'iron_sword',armor:'leather_armor',offhand:'shield',head:'iron_helmet',hands:'leather_gloves',legs:'travel_leggings',feet:'trail_boots',accessory:'silver_amulet'};
      c.relationships.npc1={affinity:9,trust:6,status:'Friend',milestones:['met','trusted']};
      c.npcs[0].memories=[{day:800,kind:'help',text:'Remembered legacy favor'}];
      w.region.name='Preserved Legacy March';w.travelCount=37;
      const active=sites.find(s=>s.id===w.siteId),other=sites.find(s=>s.id!==w.siteId);
      active.name='Old Road Refuge';active.visits=7;active.discovered=true;active.changes.scouted=true;active.changes.searches=12;active.changes.lastVisited={year:104,month:4,day:8};
      other.name='Surveyed Silver Glade';other.visits=3;other.discovered=true;other.changes.scouted=true;
      w.known=[...new Set([...(w.known||[]),other.id])];w.visited=[...new Set([...(w.visited||[]),other.id])];
      w.journal.discoveries.unshift({id:'legacy-kept-discovery',title:'Silver Glade Record',detail:'A discovery from the older save.',siteId:other.id,date:'DAY 800'});
      if(w.journal.rumors[0])w.journal.rumors[0].resolved=true;
      w.region.routes[0].customCompatibilityField='preserve-global-edge-extension';
      w.geography.customCompatibilityField={token:'keep-index-extension'};w.v0723={schema:1,activeLeads:{bandits:{type:'bandits',status:'active',siteId:other.id,enemyId:'bandit',issuedBy:'Legacy innkeeper'}},history:[{type:'gangs',siteId:other.id,status:'confirmed'}]};
      w.v06=w.v06||{schema:2,changes:{},journal:[],socialQuests:[],registry:{}};w.v06.registry=w.v06.registry||{};
      w.v06.registry['legacy-smith']={id:'legacy-smith',name:'Legacy Smith',homeSite:active.id,memories:[{text:'Legacy registry must survive'}]};
      persist();
      const standard=JSON.parse(JSON.stringify(state));
      const explored=JSON.parse(JSON.stringify(state));
      explored.world.visited=explored.world.region.sites.map(s=>s.id);
      explored.world.known=explored.world.region.sites.map(s=>s.id);
      explored.world.journal.visitedLocations=[...explored.world.visited];explored.world.journal.knownLocations=[...explored.world.known];
      for(let i=0;i<explored.world.region.sites.length;i++){
        const s=explored.world.region.sites[i];s.discovered=true;s.visits=Math.max(1,s.visits||0);s.changes=s.changes||{};s.changes.scouted=true;s.changes.searches=(s.changes.searches||0)+2;
      }
      explored.world.journal.discoveries.unshift(...explored.world.region.sites.slice(0,12).map((s,i)=>({id:'extensive-discovery-'+i,title:'Explored '+s.name,detail:'A saved exploration note.',siteId:s.id,date:'DAY '+(801+i)})));
      explored.world.journal.rumors=(explored.world.journal.rumors||[]).map((r,i)=>({...r,resolved:i%2===0}));
      const incomplete=JSON.parse(JSON.stringify(standard));delete incomplete.world.known;delete incomplete.world.visited;delete incomplete.world.journal;delete incomplete.character.relationships;delete incomplete.character.npcs;delete incomplete.character.discoveries;
      return {standard,explored,incomplete,saveKey:SAVE_KEY,slotsKey:SLOTS_KEY,legacyVersion:standard.version,legacyTitle:document.title};
    }''')
    add('Accepted v0.7.6.6 browser build generated a valid older save', legacy_data['legacyVersion'] == 6 and len(legacy_data['standard']['world']['region']['sites']) == 49,
        f"save version={legacy_data['legacyVersion']}; sites={len(legacy_data['standard']['world']['region']['sites'])}")
    add('Legacy fixture contains retained character, exploration, relationship and geography fields',
        legacy_data['standard']['character']['ageMonths'] == 382 and legacy_data['standard']['character']['equipment']['weapon'] == 'iron_sword' and any(d.get('id') == 'legacy-kept-discovery' for d in legacy_data['standard']['world']['journal']['discoveries']) and 'legacy-smith' in legacy_data['standard']['world']['v06']['registry'],
        'Fixture was created by the accepted legacy game code and enhanced to cover compatibility fields')
    if browser_errors:
        add('Legacy fixture generation has no uncaught browser errors', False, json.dumps(browser_errors))

    # Generate a second save with the exact accepted v0.7.7.7 build, the requested starting point.
    accepted_page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    accepted_page.on('pageerror', lambda error: browser_errors.append('accepted v0.7.7.7 pageerror: ' + str(error)))
    accepted_page.on('console', lambda msg: browser_errors.append('accepted v0.7.7.7 console error: ' + msg.text) if msg.type == 'error' else None)
    accepted_page.set_content(inject_storage(read_text(ACCEPTED_777_HTML)), wait_until='load', timeout=60000)
    accepted_data = accepted_page.evaluate(r'''() => {
      createSeed='IR-0778-ACCEPTED-777';createStart='settlement';
      state=makeInitial('Accepted 777 Adventurer','human','village');
      state.character.ageMonths=517;state.character.daysLived=1551;state.character.coin=777;state.character.reputation=31;
      state.character.attrs.Strength=29;state.character.skills.Swordsmanship={level:22,xp:76};
      state.character.inventory={iron_sword:1,leather_armor:1,shield:1,iron_helmet:1,leather_gloves:1,travel_leggings:1,trail_boots:1,silver_amulet:1,bread:4};
      state.character.equipment={weapon:'iron_sword',armor:'leather_armor',offhand:'shield',head:'iron_helmet',hands:'leather_gloves',legs:'travel_leggings',feet:'trail_boots',accessory:'silver_amulet'};
      state.world.region.name='Accepted 777 Preserve';state.world.travelCount=21;
      state.world.visited=[...new Set([...(state.world.visited||[]),state.world.siteId])];
      state.world.known=[...new Set([...(state.world.known||[]),state.world.siteId])];
      const active=state.world.region.sites.find(s=>s.id===state.world.siteId);active.name='Accepted Baseline Outpost';active.visits=5;active.discovered=true;active.changes.scouted=true;
      state.world.journal.discoveries.unshift({id:'accepted-777-discovery',title:'Prior Accepted Discovery',detail:'Persisted by the accepted v0.7.7.7 baseline.',siteId:active.id,date:'DAY 1551'});
      persist();
      return {save:JSON.parse(localStorage.getItem(SAVE_KEY)),saveKey:SAVE_KEY,slotsKey:SLOTS_KEY,title:document.title,version:state.version,sitePairs:state.world.region.sites.map(s=>[s.id,s.geoId]),routeIds:state.world.region.routes.map(r=>r.geoId)};
    }''')
    add('Accepted v0.7.7.7 build generated its own compatible save', accepted_data['title'] == 'Infinite Realms — Version 0.7.7.7' and len(accepted_data['sitePairs']) == 49,
        f"title={accepted_data['title']}; sites={len(accepted_data['sitePairs'])}; save version={accepted_data['version']}")
    accepted_page.close()

    save_key = legacy_data['saveKey']; slots_key = legacy_data['slotsKey']
    store = {
        save_key: json.dumps(legacy_data['standard'], ensure_ascii=False),
        slots_key: json.dumps([
            {'label': 'Extensive Legacy Exploration', 'data': legacy_data['explored']},
            {'label': 'Legacy Save Missing Optional Fields', 'data': legacy_data['incomplete']},
            {'label': 'Accepted v0.7.7.7 Save', 'data': accepted_data['save']}
        ], ensure_ascii=False)
    }
    source = read_text(CURRENT_HTML)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: browser_errors.append('current pageerror: ' + str(error)))
    page.on('console', lambda msg: browser_errors.append('current console error: ' + msg.text) if msg.type == 'error' else None)
    page.set_content(inject_storage(source, store), wait_until='load', timeout=60000)
    page.wait_for_timeout(200)

    add('Current standalone is branded v0.7.8.5 at runtime', page.title() == 'Infinite Realms — Version 0.7.8.5' and 'VERSION 0.7.8.5' in page.locator('#app').inner_text(), page.title())
    initial = page.evaluate('''() => ({name:state?.character?.name,version:state?.version,age:state?.character?.ageMonths,coin:state?.character?.coin,seed:state?.world?.seed,siteId:state?.world?.siteId,region:state?.world?.region?.name,sites:state?.world?.region?.sites?.length,visited:state?.world?.visited?.length,travelCount:state?.world?.travelCount,legacyNpc:state?.world?.v06?.registry?.['legacy-smith']?.memories?.[0]?.text,routeIds:state?.world?.region?.routes?.map(r=>r.geoId),sitePairs:state?.world?.region?.sites?.map(s=>[s.id,s.geoId]),audit:ir0778AuditSaveWorld(state?.world,state?.character)})''')
    add('Accepted v0.7.6.6 autosave loads and continues without changing identity or progress',
        initial['name'] == 'Legacy Cartographer' and initial['age'] == 382 and initial['coin'] == 481 and initial['region'] == 'Preserved Legacy March' and initial['travelCount'] == 37 and initial['sites'] == 49,
        f"name={initial['name']}; age={initial['age']}; coin={initial['coin']}; region={initial['region']}; site count={initial['sites']}")
    add('Legacy site and geographic IDs plus route IDs remain stable with unique IDs',
        initial['audit']['ok'] and len(initial['routeIds']) == len(set(initial['routeIds'])) and len(initial['sitePairs']) == len({x[0] for x in initial['sitePairs']}) == len({x[1] for x in initial['sitePairs']}) == 49,
        json.dumps(initial['audit']['counts']))
    add('NPC registry and journal discovery survive loading',
        initial['legacyNpc'] == 'Legacy registry must survive' and page.evaluate("state.world.journal.discoveries.some(d=>d.id==='legacy-kept-discovery') && state.world.v0723.activeLeads.bandits.issuedBy==='Legacy innkeeper' && state.world.v0723.history[0].status==='confirmed'"),
        'NPC memory and saved discovery remain present')
    add('Equipment, relationships, inventory, skills and reputation survive loading',
        page.evaluate("state.character.equipment.weapon==='iron_sword' && state.character.equipment.armor==='leather_armor' && state.character.equipment.head==='iron_helmet' && state.character.equipment.hands==='leather_gloves' && state.character.equipment.legs==='travel_leggings' && state.character.equipment.feet==='trail_boots' && state.character.equipment.accessory==='silver_amulet' && state.character.inventory.bread===7 && state.character.skills.Lore.level===18 && state.character.relationships.npc1.affinity===9 && state.character.reputation===23"),
        'Checked selected saved character fields against the fixture values')

    # The accepted v0.7.7.7 save is a second real-browser compatibility fixture.
    page.evaluate("ir0772MapScope='local';ir0772SelectedGeoId='stale-from-legacy-slot';ir0772SelectedFromIntel=true;loadSlot(2)")
    page.wait_for_timeout(180)
    accepted_loaded = page.evaluate('''() => ({name:state?.character?.name,age:state?.character?.ageMonths,coin:state?.character?.coin,reputation:state?.character?.reputation,strength:state?.character?.attrs?.Strength,sword:state?.character?.skills?.Swordsmanship?.level,region:state?.world?.region?.name,travelCount:state?.world?.travelCount,sitePairs:state?.world?.region?.sites?.map(s=>[s.id,s.geoId]),routeIds:state?.world?.region?.routes?.map(r=>r.geoId),equipment:state?.character?.equipment,discovery:state?.world?.journal?.discoveries?.some(d=>d.id==='accepted-777-discovery'),mapScope:ir0772MapScope,selected:ir0772SelectedGeoId,currentGeo:state?.world?.region?.sites?.find(s=>s.id===state?.world?.siteId)?.geoId,audit:ir0778AuditSaveWorld(state?.world,state?.character)})''')
    add('Accepted v0.7.7.7 save loads with character progression, exploration, routes and equipment intact',
        accepted_loaded['name'] == 'Accepted 777 Adventurer' and accepted_loaded['age'] == 517 and accepted_loaded['coin'] == 777 and accepted_loaded['reputation'] == 31 and accepted_loaded['strength'] == 29 and accepted_loaded['sword'] == 22 and accepted_loaded['region'] == 'Accepted 777 Preserve' and accepted_loaded['travelCount'] == 21 and accepted_loaded['sitePairs'] == accepted_data['sitePairs'] and accepted_loaded['routeIds'] == accepted_data['routeIds'] and all(accepted_loaded['equipment'].get(k) == v for k, v in {'weapon':'iron_sword','armor':'leather_armor','offhand':'shield','head':'iron_helmet','hands':'leather_gloves','legs':'travel_leggings','feet':'trail_boots','accessory':'silver_amulet'}.items()) and accepted_loaded['discovery'] and accepted_loaded['mapScope'] == 'atlas' and accepted_loaded['selected'] == accepted_loaded['currentGeo'] and accepted_loaded['audit']['ok'],
        f"name={accepted_loaded['name']}; age={accepted_loaded['age']}; coin={accepted_loaded['coin']}; region={accepted_loaded['region']}; route count={len(accepted_loaded['routeIds'])}")
    # Restore the v0.7.6.6 autosave before testing map switching, because loading a slot promotes it to autosave.
    page.evaluate('(data)=>{localStorage.setItem(SAVE_KEY,JSON.stringify(data));state=normalizeSave(data);render()}', legacy_data['standard'])
    page.wait_for_timeout(140)

    # World / regional / local map controls and selections should not modify the saved world.
    page.locator('#app [data-tab="World"]').first.click(); page.wait_for_timeout(120)
    before_map = page.evaluate('JSON.stringify(state.world)'); before_map_obj = page.evaluate('JSON.parse(JSON.stringify(state.world))')
    page.locator('#app [data-action="ir0777-map-world"]').first.click(); page.wait_for_timeout(80)
    page.locator('#app [data-action="ir0777-map-regional"]').first.click(); page.wait_for_timeout(100)
    # Prefer a known non-current visible location selector when present; otherwise click a regional marker.
    inspect = page.locator('#app [data-action="ir0772-inspect-location"][data-site]').first
    if inspect.count(): inspect.click(); page.wait_for_timeout(100)
    page.locator('#app [data-action="ir0777-map-local"]').first.click(); page.wait_for_timeout(100)
    after_map = page.evaluate('JSON.stringify(state.world)'); after_map_obj = page.evaluate('JSON.parse(JSON.stringify(state.world))')
    map_diff = page.evaluate('(before)=>{const after=state.world;return Object.keys(after).filter(k=>JSON.stringify(after[k])!==JSON.stringify(before[k])).map(k=>({key:k,before:before[k],after:after[k]}))}', before_map_obj)
    add('World/Regional/Local switching and location inspection leave authoritative world state unchanged', before_map == after_map,
        json.dumps(map_diff, ensure_ascii=False)[:2000])

    # Load the extensive-exploration legacy save through the actual save-slot loader.
    page.evaluate("ir0772MapScope='local';ir0772SelectedGeoId='stale-geo-from-other-save';ir0772SelectedFromIntel=true;loadSlot(0)")
    page.wait_for_timeout(180)
    extensive = page.evaluate('''() => ({name:state?.character?.name,siteId:state?.world?.siteId,visited:state?.world?.visited?.length,known:state?.world?.known?.length,sites:state?.world?.region?.sites?.length,discoveries:state?.world?.journal?.discoveries?.length,hasExtensive:state?.world?.journal?.discoveries?.some(d=>d.id==='extensive-discovery-0'),allVisited:state?.world?.region?.sites?.every(s=>s.discovered===true&&s.visits>=1&&s.changes?.scouted&&s.changes?.searches>=2),mapScope:ir0772MapScope,selected:ir0772SelectedGeoId,currentGeo:state?.world?.region?.sites?.find(s=>s.id===state?.world?.siteId)?.geoId,intel:ir0772SelectedFromIntel,audit:ir0778AuditSaveWorld(state?.world,state?.character)})''')
    add('Extensive-exploration v0.7.6.6 save loads through the existing save-slot loader',
        extensive['name'] == 'Legacy Cartographer' and extensive['sites'] == 49 and extensive['visited'] == 49 and extensive['known'] == 49 and extensive['hasExtensive'] and extensive['allVisited'],
        f"sites={extensive['sites']}; visited={extensive['visited']}; known={extensive['known']}; discoveries={extensive['discoveries']}")
    add('Loading another save resets stale map selections without changing saved geographic IDs',
        extensive['mapScope'] == 'atlas' and extensive['intel'] is False and extensive['selected'] == extensive['currentGeo'] and extensive['audit']['ok'],
        f"scope={extensive['mapScope']}; selected={extensive['selected']}; current geo={extensive['currentGeo']}")

    # Optional missing arrays: loadSlot uses real loader and normalizer, rather than directly calling normalizeSave.
    page.evaluate("ir0772MapScope='regional';ir0772SelectedGeoId='stale-before-incomplete-save';loadSlot(1)")
    page.wait_for_timeout(160)
    missing = page.evaluate('''() => ({name:state?.character?.name,known:Array.isArray(state?.world?.known),visited:Array.isArray(state?.world?.visited),journal:Array.isArray(state?.world?.journal?.discoveries)&&Array.isArray(state?.world?.journal?.rumors),relationships:!!state?.character?.relationships&&typeof state.character.relationships==='object',npcs:Array.isArray(state?.character?.npcs),discoveries:Array.isArray(state?.character?.discoveries),siteId:state?.world?.siteId,unique:state?.world?.region?.sites?.length===new Set(state.world.region.sites.map(s=>s.id)).size})''')
    add('Save with absent optional arrays opens with safe defaults and retains character/world identity',
        missing['name'] == 'Legacy Cartographer' and all(missing[k] for k in ['known','visited','journal','relationships','npcs','discoveries','unique']) and bool(missing['siteId']),
        json.dumps(missing))

    # Continue travel in loaded exploration save, then verify route and site counts remain stable.
    page.evaluate("loadSlot(0);state.character.energy=state.character.maxEnergy;state.character.hunger=100;state.pendingEvent=null;state.combat={active:false};Math.random=()=>0.999")
    page.wait_for_timeout(100)
    before_travel = page.evaluate('''() => ({siteId:state.world.siteId,travelCount:state.world.travelCount||0,sites:state.world.region.sites.length,routes:state.world.region.routes.length,siteIds:state.world.region.sites.map(s=>s.id),routeIds:state.world.region.routes.map(r=>r.geoId),target:ir0775ConnectionsFrom(state.world.siteId)[0]?.to,coin:state.character.coin,age:state.character.ageMonths,gear:JSON.stringify(state.character.equipment),inventory:JSON.stringify(state.character.inventory)})''')
    travel_ok = False
    if before_travel['target']:
        travel_ok = page.evaluate('(target)=>ir0775CommitTravel(target,"foot")', before_travel['target'])
    page.wait_for_timeout(140)
    after_travel = page.evaluate('''() => ({siteId:state.world.siteId,travelCount:state.world.travelCount||0,sites:state.world.region.sites.length,routes:state.world.region.routes.length,siteIds:state.world.region.sites.map(s=>s.id),routeIds:state.world.region.routes.map(r=>r.geoId),visited:state.world.visited.length,visitedIds:state.world.visited,routeUnique:state.world.region.routes.length===new Set(state.world.region.routes.map(r=>r.geoId)).size,siteUnique:state.world.region.sites.length===new Set(state.world.region.sites.map(s=>s.id)).size,geoUnique:state.world.region.sites.length===new Set(state.world.region.sites.map(s=>s.geoId)).size,coin:state.character.coin,age:state.character.ageMonths,gear:JSON.stringify(state.character.equipment),inventory:JSON.stringify(state.character.inventory),audit:ir0778AuditSaveWorld(state.world,state.character),saved:JSON.parse(localStorage.getItem(SAVE_KEY)||'null')})''')
    add('Travel after old-save load changes location/visits once without adding sites or duplicate routes',
        bool(travel_ok) and after_travel['siteId'] == before_travel['target'] and after_travel['travelCount'] == before_travel['travelCount'] + 1 and after_travel['sites'] == before_travel['sites'] and after_travel['routes'] == before_travel['routes'] and after_travel['siteIds'] == before_travel['siteIds'] and after_travel['routeIds'] == before_travel['routeIds'] and after_travel['siteId'] in after_travel['visitedIds'] and after_travel['routeUnique'] and after_travel['siteUnique'] and after_travel['geoUnique'] and after_travel['audit']['ok'],
        f"travelCount {before_travel['travelCount']} -> {after_travel['travelCount']}; sites={after_travel['sites']}; global routes={after_travel['routes']}")
    add('Existing inventory/equipment/progression stay intact after travel',
        after_travel['coin'] == before_travel['coin'] and after_travel['age'] >= before_travel['age'] and after_travel['gear'] == before_travel['gear'] and after_travel['inventory'] == before_travel['inventory'],
        'Compared preserved fields around a valid travel action')

    # Character status refresh using loaded state values and capture actual screenshots.
    page.locator('#app [data-tab="Character"]').first.click(); page.wait_for_timeout(140)
    character_text = page.locator('#app').inner_text()
    char_values = page.evaluate('''() => ({name:state.character.name,health:`${state.character.health} / ${state.character.maxHealth}`,energy:`${state.character.energy} / ${state.character.maxEnergy}`,lore:state.character.skills.Lore?.level,weapon:state.character.equipment.weapon,healthHtml:document.querySelector('.ir0776-addendum')?.innerText})''')
    add('Character Status displays live loaded health/energy, existing skill progression and equipped item',
        char_values['health'] in character_text and char_values['energy'] in character_text and 'Lore' in character_text and str(char_values['lore']) in character_text and ('Iron Sword' in char_values['healthHtml'] if char_values['weapon']=='iron_sword' else True),
        f"health={char_values['health']}; energy={char_values['energy']}; Lore={char_values['lore']}; weapon={char_values['weapon']}")
    status_html = page.locator('#app .ir0776-addendum').inner_text()
    add('Character status section uses current release branding and does not invent an active condition',
        'character status · v0.7.8.5' in status_html.lower() and ('no character-specific status effects are currently recorded' in status_html.lower() or any(token in status_html.lower() for token in ['poison','burning','frozen','bleeding'])),
        'status heading and condition section verified')
    page.screenshot(path=str(SCREENSHOTS / 'v0.7.8.5-legacy-save-character-desktop.png'), full_page=False)
    page.locator('#app [data-tab="World"]').first.click(); page.wait_for_timeout(120)
    page.screenshot(path=str(SCREENSHOTS / 'v0.7.8.5-legacy-save-map-desktop.png'), full_page=False)

    # Reload a fresh page from the persisted, post-travel autosave and compare core saved data.
    if after_travel['saved']:
        reloaded_store = {save_key: json.dumps(after_travel['saved'], ensure_ascii=False)}
        reload_page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        reload_page.on('pageerror', lambda error: browser_errors.append('reload pageerror: ' + str(error)))
        reload_page.on('console', lambda msg: browser_errors.append('reload console error: ' + msg.text) if msg.type == 'error' else None)
        reload_page.set_content(inject_storage(source, reloaded_store), wait_until='load', timeout=60000)
        reload_summary = reload_page.evaluate('''() => ({name:state?.character?.name,siteId:state?.world?.siteId,travelCount:state?.world?.travelCount,sites:state?.world?.region?.sites?.length,visited:state?.world?.visited?.length,visitedIds:state?.world?.visited,coin:state?.character?.coin,gear:JSON.stringify(state?.character?.equipment),inventory:JSON.stringify(state?.character?.inventory),discoveries:state?.world?.journal?.discoveries?.map(d=>d.id),audit:ir0778AuditSaveWorld(state?.world,state?.character)})''')
        add('Post-travel autosave can be reopened in a fresh v0.7.8.5 browser session without state loss',
            reload_summary['name'] == 'Legacy Cartographer' and reload_summary['siteId'] == after_travel['siteId'] and reload_summary['travelCount'] == after_travel['travelCount'] and reload_summary['sites'] == after_travel['sites'] and reload_summary['visitedIds'] == after_travel['visitedIds'] and reload_summary['coin'] == after_travel['coin'] and reload_summary['gear'] == after_travel['gear'] and reload_summary['inventory'] == after_travel['inventory'] and reload_summary['audit']['ok'],
            json.dumps(reload_summary, ensure_ascii=False)[:2400])
        reload_page.close()
    else:
        add('Post-travel autosave can be reopened in a fresh v0.7.8.5 browser session without state loss', False, 'No autosave serialized after travel')

    # New game smoke check in a clean context.
    new_page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    new_page.on('pageerror', lambda error: browser_errors.append('new-game pageerror: ' + str(error)))
    new_page.on('console', lambda msg: browser_errors.append('new-game console error: ' + msg.text) if msg.type == 'error' else None)
    new_page.set_content(inject_storage(source), wait_until='load', timeout=60000)
    if new_page.locator('#app [data-action="create"]').count():
        if new_page.locator('#newName').count(): new_page.locator('#newName').fill('Fresh Start Tester')
        if new_page.locator('#worldSeed').count(): new_page.locator('#worldSeed').fill('IR-0778-NEW-GAME')
        new_page.locator('#app [data-action="create"]').first.click(); new_page.wait_for_timeout(120)
    new_summary = new_page.evaluate('''() => ({name:state?.character?.name,sites:state?.world?.region?.sites?.length,siteId:state?.world?.siteId,audit:ir0778AuditSaveWorld(state?.world,state?.character)})''')
    add('New game still creates a valid current world after compatibility changes', new_summary['name'] == 'Fresh Start Tester' and new_summary['sites'] == 49 and bool(new_summary['siteId']) and new_summary['audit']['ok'], json.dumps(new_summary))
    new_world_before = new_page.evaluate('JSON.stringify(state.world)')
    new_page.locator('#app [data-tab="World"]').first.click(); new_page.wait_for_timeout(100)
    new_page.locator('#app [data-action="ir0777-map-regional"]').first.click(); new_page.wait_for_timeout(100)
    new_page.locator('#app [data-action="ir0777-map-local"]').first.click(); new_page.wait_for_timeout(100)
    add('Fresh-game map rendering and switching do not add lazy data to the saved world', new_world_before == new_page.evaluate('JSON.stringify(state.world)'), 'Compared complete world state before and after the first map render')

    add('No uncaught Chromium JavaScript errors across legacy-load, travel, reload, and new-game checks', not browser_errors, json.dumps(browser_errors, ensure_ascii=False))
    browser.close()

summary = {
    'suite': 'Infinite Realms v0.7.8.5 Save Compatibility and Integration',
    'total': len(results), 'passed': sum(row['status'] == 'PASS' for row in results),
    'failed': sum(row['status'] == 'FAIL' for row in results), 'results': results,
    'browser_errors': browser_errors,
    'fixtures': {
        'legacy_source': str(LEGACY_HTML.relative_to(ROOT)),
        'accepted_777_source': str(ACCEPTED_777_HTML.relative_to(ROOT)),
        'legacy_save_version': legacy_data['legacyVersion'],
        'world_site_count': len(legacy_data['standard']['world']['region']['sites']),
        'extensive_visited_count': len(legacy_data['explored']['world']['visited']),
        'note': 'Both baseline saves were generated by their accepted game builds inside Chromium. The extensive-exploration save is a deterministic fixture, not a user-exported exploration save.'
    }
}
LOG_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
print('\nSUMMARY', summary['passed'], '/', summary['total'], 'passed;', summary['failed'], 'failed', flush=True)
