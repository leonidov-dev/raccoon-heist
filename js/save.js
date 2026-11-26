// Save / load with versioning for future migrations.
window.RH = window.RH || {};

RH.Save = (function () {
  const C = RH.CONFIG;

  // Everything that resets when the gang moves to a new district.
  function districtState(district) {
    const upgrades = {};
    C.upgrades.forEach((u) => (upgrades[u.id] = 0));
    const firstHeist = C.districts[district - 1].targets[0][0];
    return {
      coins: C.startCoins * Math.pow(C.district.incomeBase, district - 1),
      upgrades,
      heistsUnlocked: { [firstHeist]: true },
      zones: {},             // zoneId -> paid coins (>= cost means bought)
      padPaid: {},           // levelPad id -> coins paid toward next level
      stationLv: {},         // levelPad id -> level
      crew: {},              // crew id -> level (0 = not hired)
      marketBuys: 0,
      gangs: [newGang()],
      garageBags: [],        // values of bags waiting in the stash
      carried: [],           // values of bags the Boss carries
      heat: 0,
    };
  }

  function newState() {
    return Object.assign({
      v: C.saveVersion,
      district: 1,
      totalEarned: 0,
      collection: {},        // treasureId -> copies
      displaySlots: [null, null, null],
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

  // Migrations: add `if (s.v < N) { ...; s.v = N; }` blocks here.
  function migrate(s) {
    const base = newState();
    for (const k in base) if (s[k] === undefined) s[k] = base[k];
    for (const u of C.upgrades) if (s.upgrades[u.id] === undefined) s.upgrades[u.id] = 0;
    s.v = C.saveVersion;
    return s;
  }

  return {
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
        localStorage.setItem(C.saveKey, JSON.stringify(state));
      } catch (e) { /* storage full / private mode */ }
    },
    clear() { localStorage.removeItem(C.saveKey); },
  };
})();
