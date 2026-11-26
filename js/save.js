// Save / load with versioning for migrations.
//
// Shape: global fields (coins, crew, collection, display, wardrobe, ...) live at the top level,
// the CURRENT district's fields too (see DISTRICT_KEYS), and every other unlocked district's
// fields are stashed in S.dist[districtId].
window.RH = window.RH || {};

RH.Save = (function () {
  const C = RH.CONFIG;
  const KEEP_PAID = 1e18; // a `keep` zone (display) bought once counts as bought everywhere

  const DISTRICT_KEYS = ['upgrades', 'heistsUnlocked', 'zones', 'padPaid', 'stationLv', 'marketBuys',
    'gangs', 'garageBags', 'carried', 'stalls', 'heat', 'seen'];

  // Fresh state of one district (its own upgrades, stations and gangs).
  function districtState(district, keepZones) {
    const upgrades = {};
    C.upgrades.forEach((u) => (upgrades[u.id] = 0));
    const firstHeist = C.districts[district - 1].targets[0][0];
    return {
      upgrades,
      heistsUnlocked: { [firstHeist]: true },
      zones: Object.assign({}, keepZones || {}), // zoneId -> paid coins (>= cost means bought)
      padPaid: {},           // levelPad id -> coins paid toward next level
      stationLv: {},         // levelPad id -> level
      marketBuys: 0,
      gangs: [newGang()],
      garageBags: [],        // goods waiting in the stash: { k: heist slot, v: value }
      carried: [],           // goods the Boss carries
      stalls: [[], [], [], []], // goods values on each stall (one stall per heist slot)
      heat: 0,
      seen: Date.now(),      // last time this district was active (for "while you were away")
    };
  }

  function newState() {
    return Object.assign({
      v: C.saveVersion,
      district: 1,
      maxDistrict: 1,
      dist: {},              // stashed state of the other unlocked districts
      coins: C.startCoins,
      totalEarned: 0,
      collection: {},        // treasureId -> copies
      displaySlots: [null, null, null],
      crew: {},              // crewId -> { a: level, b: level } (a >= 1 = hired)
      cosmetics: { hats: ['tophat'], vans: ['van'], hat: 'tophat', van: 'van' },
      chestReadyAt: 0,
      boostUntil: 0,
      tutorial: 0,
      tips: {},
      lastSeen: Date.now(),
      lang: null,
      player: { x: C.startPos.x, y: C.startPos.y },
    }, districtState(1));
  }

  function newGang() {
    return { target: null, t: 0, dur: 0, bags: 0, bagValue: 0, repeat: false, lastTarget: null };
  }

  function migrate(s) {
    // v2 -> v3: districts keep their own progress, coins are shared, crew has 2 skills.
    if ((s.v || 1) < 3) {
      s.maxDistrict = s.district || 1;
      s.dist = {};
      const keep = (s.zones && s.zones.display >= 100) ? { display: KEEP_PAID } : {};
      if (keep.display) s.zones.display = KEEP_PAID;
      for (let d = 1; d < s.maxDistrict; d++) {
        const ds = districtState(d, keep);
        C.districts[d - 1].targets.forEach(([id]) => (ds.heistsUnlocked[id] = true));
        s.dist[C.districts[d - 1].id] = ds;
      }
      const crew = {};
      for (const id in (s.crew || {})) {
        const lv = s.crew[id];
        crew[id] = typeof lv === 'number' ? { a: lv, b: 0 } : lv;
      }
      s.crew = crew;
      s.seen = Date.now();
      s.player = { x: C.startPos.x, y: C.startPos.y }; // hideout layout changed
      if (s.tutorial >= 5) { s.tutorial = 6; (s.tips = s.tips || {}).tutDone = 1; } // tutorial got two more steps
    }
    // money bags (numbers) became goods ({ k, v }) and stalls appeared
    const fixGoods = (ds) => {
      ['garageBags', 'carried'].forEach((k) => { ds[k] = (ds[k] || []).map((it) => (typeof it === 'number' ? { k: 0, v: it } : it)); });
      if (!ds.stalls) ds.stalls = [[], [], [], []];
    };
    fixGoods(s);
    Object.values(s.dist || {}).forEach(fixGoods);
    const base = newState();
    for (const k in base) if (s[k] === undefined) s[k] = base[k];
    for (const u of C.upgrades) if (s.upgrades[u.id] === undefined) s.upgrades[u.id] = 0;
    s.v = C.saveVersion;
    return s;
  }

  return {
    KEEP_PAID,
    DISTRICT_KEYS,
    newState,
    newGang,
    districtState,
    load() {
      try {
        const raw = localStorage.getItem(C.saveKey);
        if (!raw) return null;
        return migrate(JSON.parse(raw));
      } catch (e) {
        console.warn('Save corrupted, starting fresh', e);
        return null;
      }
    },
    save(state) {
      try {
        state.lastSeen = Date.now();
        state.seen = state.lastSeen;
        localStorage.setItem(C.saveKey, JSON.stringify(state));
      } catch (e) { /* storage full / private mode */ }
    },
    clear() { localStorage.removeItem(C.saveKey); },
  };
})();
