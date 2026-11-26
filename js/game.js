// Core game: state, economy, hideout simulation and rendering.
window.RH = window.RH || {};

RH.fmt = function (n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)).toString().replace(/\.?0+$/, '') + units[u];
};
RH.fmtTime = function (s) {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return s + RH.t('sec');
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + RH.t('min') + (r ? ' ' + r + RH.t('sec') : '');
  return Math.floor(m / 60) + RH.t('hr') + ' ' + (m % 60) + RH.t('min');
};
RH.niceCost = function (x) {
  if (x < 100) return Math.round(x);
  const step = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / step) * step;
};

RH.Game = (function () {
  const C = RH.CONFIG;
  const E = C.upgradeEffects;
  const CE = C.crewEffects;
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  let S = null;            // saved state
  let canvas, ctx, dpr = 1, W = 0, H = 0;
  const cam = { x: 0, y: 0, scale: 1 };
  const player = { x: 0, y: 0, vx: 0, vy: 0, face: 1, bob: 0 };
  let helpers = [];
  let crewBots = [];
  let buyers = [];
  let queue = [];
  let spawnTimer = 1;
  let serveTimer = 0;
  const floaters = [];
  let pickTimer = 0, dropTimer = 0;
  let currentStation = null;
  let time = 0;
  let mode = 'hideout';    // 'hideout' | 'chase'
  let drainAccum = 0;
  let stillTime = 0;       // zones only take coins when the Boss stops on them
  let heistCache = { d: 0, list: [] };

  // ---------- district ----------
  const districtCfg = (d = S.district) => C.districts[d - 1];
  const incomeMul = () => Math.pow(C.district.incomeBase, S.district - 1);
  const costMul = () => Math.pow(C.district.costBase, S.district - 1);
  // shared things (crew, display) scale with the furthest district reached
  const globalCostMul = () => Math.pow(C.district.costBase, S.maxDistrict - 1);
  const repMul = () => 1 + C.district.repBonus * (S.maxDistrict - 1);

  function heists() {
    if (heistCache.d !== S.district) {
      const m = incomeMul();
      heistCache = {
        d: S.district,
        list: districtCfg().targets.map(([id, emoji], i) => {
          const s = C.heistSlots[i];
          return { id, emoji, slot: i, time: s.time, bags: s.bags, bagValue: s.bagValue * m, noise: s.noise,
            unlock: RH.niceCost(s.unlock * m), treasure: s.treasure, rarity: s.rarity };
        }),
      };
    }
    return heistCache.list;
  }
  const heistCfg = (id) => heists().find((h) => h.id === id);

  // ---------- derived stats ----------
  const lvl = (id) => S.upgrades[id] || 0;
  const crewA = (id) => (S.crew[id] ? S.crew[id].a : 0);
  const crewB = (id) => (S.crew[id] ? S.crew[id].b : 0);
  const padLv = (id) => S.stationLv[id] || 0;
  const upCfg = (id) => C.upgrades.find((u) => u.id === id);
  const crewCfg = (id) => C.crew.find((u) => u.id === id);
  const padCfg = (id) => C.levelPads.find((p) => p.id === id);
  const zoneCfg = (id) => C.buyZones.find((z) => z.id === id);
  const zoneCost = (z) => RH.niceCost(z.cost * costMul());
  function zoneBought(id) { return (S.zones[id] || 0) >= zoneCost(zoneCfg(id)); }
  const stationOn = (id) => !C.stations[id].needs || zoneBought(C.stations[id].needs);

  const stats = {
    incomeMul, costMul, repMul, globalCostMul,
    carryCap: () => C.player.baseCarry + E.backpackAdd * lvl('backpack'),
    speed: () => C.player.speed * (1 + E.speedAdd * lvl('speed')),
    heistTime: (h) => Math.max(2, h.time * Math.pow(E.carTimeMul, lvl('car')) * Math.pow(CE.driverTime, crewA('driver'))),
    heistBags: (h) => h.bags + lvl('bigBags'),
    heistNoise: (h) => h.noise * Math.pow(E.noiseMul, lvl('paws')) * Math.pow(CE.sneakNoise, crewA('sneak')),
    treasureChance: (h) => Math.min(0.9, h.treasure + E.noseAdd * lvl('nose') + CE.sneakTreasure * crewB('sneak')),
    gangCount: () => 1 + lvl('gang'),
    cashierServe: () => C.shop.serveCashier / (1 + 0.5 * (lvl('cashier') - 1)),
    chaseLives: () => C.chase.lives + CE.driverLives * crewB('driver'),
    muscleCarry: () => CE.muscleCarry * (1 + crewB('muscle')),
    offlineCap: () => C.offlineCapSec + CE.hackerOffline * crewB('hacker'),
    boostMul: () => (Date.now() < S.boostUntil ? C.rewards.boostMul : 1),
    // coins per bag value (everything except the temporary boost)
    bagCoinMul: () => (1 + (zoneBought('washer2') ? zoneCfg('washer2').laundryBonus : 0)) *
      (1 + padCfg('laundry').effect * padLv('laundry')) * (1 + CE.muscleCoins * crewA('muscle')) * repMul(),
    displayMul: () => globalCostMul() * (1 + padCfg('display').effect * padLv('display')) *
      (1 + CE.hackerDisplay * crewA('hacker')) * repMul(),
    coolMul: () => (zoneBought('cooler') ? zoneCfg('cooler').coolMul : 1),
    upgradeCost: (id) => RH.niceCost(upCfg(id).base * Math.pow(upCfg(id).growth, lvl(id)) * costMul()),
    crewCost: (id, skill) => {
      const c = crewCfg(id);
      const raw = skill === 'a' ? c.hire * Math.pow(c.a.growth, Math.max(0, crewA(id) - 1)) : c.b.base * Math.pow(c.b.growth, crewB(id));
      return RH.niceCost(raw * globalCostMul());
    },
    crewMaxed: (id, skill) => (skill === 'a' ? crewA(id) >= crewCfg(id).a.max : crewB(id) >= crewCfg(id).b.max),
    padCost: (id) => RH.niceCost(padCfg(id).base * Math.pow(padCfg(id).growth, padLv(id)) * costMul()),
    marketPrice: (big) => RH.niceCost(C.market.base * Math.pow(C.market.growth, S.marketBuys) * incomeMul() * (big ? C.market.bigMul : 1)),
    slotCost: () => C.display.slotCosts[S.displaySlots.length - C.display.startSlots],
    moveCost: () => RH.niceCost(C.district.moveCost * incomeMul()),
    canMoveDistrict: () => S.maxDistrict < C.districts.length && S.district === S.maxDistrict && heists().every((h) => S.heistsUnlocked[h.id]),
    stars: (id) => {
      const c = S.collection[id] || 0;
      let s = 0;
      C.starThresholds.forEach((th, i) => { if (c >= th) s = i + 1; });
      return s;
    },
    // per-second income of one treasure on the display (without boost)
    treasureIncome: (id) => {
      const t = C.treasures.find((x) => x.id === id);
      const st = stats.stars(id);
      if (!st) return 0;
      return C.rarities[t.rarity].income * Math.pow(C.starMul, st - 1) * stats.displayMul();
    },
    displayIncome: (withBoost = true) => {
      if (!zoneBought('display')) return 0;
      let sum = 0;
      S.displaySlots.forEach((id) => { if (id) sum += stats.treasureIncome(id); });
      return sum * (withBoost ? stats.boostMul() : 1);
    },
  };

  // ---------- helpers ----------
  function inRect(px, py, r, pad = 0) {
    return px > r.x - r.w / 2 - pad && px < r.x + r.w / 2 + pad && py > r.y - r.h / 2 - pad && py < r.y + r.h / 2 + pad;
  }
  function floater(x, y, text, color = '#ffe35c', size = 26) {
    floaters.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
    if (floaters.length > 60) floaters.shift();
  }
  function addCoins(n) {
    S.coins += n;
    S.totalEarned += n;
  }
  function spend(cost) {
    if (S.coins < cost) { RH.Audio.deny(); return false; }
    S.coins -= cost;
    RH.Audio.buy();
    return true;
  }
  function weightedPick(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  }

  const goodsSprite = (item) => { const h = heists()[item.k]; return h ? 'h_' + h.id : 'bag'; };
  const goodsEmoji = (item) => { const h = heists()[item.k]; return h ? h.emoji : '💰'; };
  const stallRect = (i) => ({ x: C.shop.stalls[i][0], y: C.shop.stalls[i][1], w: C.shop.stallW, h: C.shop.stallH });
  const stallOpen = (i) => { const h = heists()[i]; return !!(h && S.heistsUnlocked[h.id]); };
  const stallSpace = (i) => C.shop.stallCap - S.stalls[i].length;

  // ---------- districts: travel / unlock ----------
  function stashDistrict() {
    const ds = {};
    RH.Save.DISTRICT_KEYS.forEach((k) => (ds[k] = S[k]));
    ds.seen = Date.now();
    S.dist[districtCfg().id] = ds;
  }
  function enterDistrict(d, fresh) {
    S.district = d;
    const id = districtCfg().id;
    const keep = {};
    C.buyZones.forEach((z) => { if (z.keep && (S.zones[z.id] || 0) >= RH.Save.KEEP_PAID) keep[z.id] = RH.Save.KEEP_PAID; });
    const ds = fresh || !S.dist[id] ? RH.Save.districtState(d, keep) : S.dist[id];
    delete S.dist[id];
    Object.assign(S, ds);
    C.buyZones.forEach((z) => { if (keep[z.id]) S.zones[z.id] = keep[z.id]; });
    heistCache.d = 0;
    helpers = [];
    syncHelpers();
    crewBots = [];
    syncCrew();
    buyers = [];
    queue = [];
    player.x = C.startPos.x; player.y = C.startPos.y;
    currentStation = null;
    RH.UI.onStation(null);
    // catch up what the gangs on repeat did here while we were away
    const away = Math.min((Date.now() - (ds.seen || Date.now())) / 1000, stats.offlineCap());
    return fresh ? 0 : catchUp(away);
  }

  // ---------- actions ----------
  const actions = {
    sendGang(heistId) {
      const h = heistCfg(heistId);
      if (!h || !S.heistsUnlocked[heistId]) return false;
      const gi = S.gangs.findIndex((g) => !g.target);
      if (gi < 0) { RH.Audio.deny(); return false; }
      launch(S.gangs[gi], h);
      RH.Audio.send();
      if (S.tutorial === 0) S.tutorial = 1;
      return true;
    },
    unlockHeist(id) {
      const h = heistCfg(id);
      if (S.heistsUnlocked[id] || !spend(h.unlock)) return false;
      S.heistsUnlocked[id] = true;
      return true;
    },
    buyUpgrade(id) {
      const u = upCfg(id);
      if (lvl(id) >= u.max || !spend(stats.upgradeCost(id))) return false;
      S.upgrades[id]++;
      if (id === 'gang') S.gangs.push(RH.Save.newGang());
      if (id === 'loader') syncHelpers();
      if (S.tutorial === 5) S.tutorial = 6;
      floater(player.x, player.y - 70, RH.t('up_' + id) + ' ↑', '#7dffb2', 22);
      return true;
    },
    buyCrew(id, skill) {
      if (skill === 'b' && crewA(id) < 1) return false;
      if (stats.crewMaxed(id, skill) || !spend(stats.crewCost(id, skill))) return false;
      const c = S.crew[id] || (S.crew[id] = { a: 0, b: 0 });
      c[skill]++;
      syncCrew();
      floater(player.x, player.y - 70, RH.t('crew_' + id) + ' ↑', '#7dffb2', 22);
      return true;
    },
    instantFinish(gi) {
      const g = S.gangs[gi];
      if (!g || !g.target) return;
      RH.Poki.rewardedBreak().then((ok) => { if (ok && g.target) g.t = g.dur; });
    },
    toggleRepeat(gi) {
      if (lvl('loader') < 1) return;
      const g = S.gangs[gi];
      g.repeat = !g.repeat;
    },
    placeTreasure(id) {
      if (!zoneBought('display')) return;
      if (S.displaySlots.includes(id)) return;
      const i = S.displaySlots.indexOf(null);
      if (i < 0) { RH.Audio.deny(); return; }
      S.displaySlots[i] = id;
      RH.Audio.pick();
    },
    removeTreasure(slot) { S.displaySlots[slot] = null; RH.Audio.pick(); },
    buySlot() {
      const cost = stats.slotCost();
      if (cost == null || !spend(cost)) return;
      S.displaySlots.push(null);
    },
    buyChest(big) {
      if (!spend(stats.marketPrice(big))) return;
      S.marketBuys++;
      grantTreasure(weightedPick(big ? C.market.bigRarity : C.market.rarity));
    },
    buyCosmetic(kind, id) {
      const item = C.cosmetics[kind].find((x) => x.id === id);
      const owned = S.cosmetics[kind];
      const key = kind === 'hats' ? 'hat' : 'van';
      if (!owned.includes(id)) {
        if (!spend(item.cost)) return;
        owned.push(id);
      } else RH.Audio.pick();
      S.cosmetics[key] = id;
    },
    // unlock the next district (costs coins, needs all heists here) and go there
    moveDistrict() {
      if (!stats.canMoveDistrict() || !spend(stats.moveCost())) return false;
      stashDistrict();
      S.maxDistrict++;
      enterDistrict(S.maxDistrict, true);
      RH.Audio.treasure();
      RH.Poki.commercialBreak();
      return true;
    },
    // travel to an already unlocked district; returns coins the gangs made there meanwhile
    travel(d) {
      if (d === S.district || d < 1 || d > S.maxDistrict || mode !== 'hideout') return null;
      stashDistrict();
      const coins = enterDistrict(d, false);
      if (coins > 0) addCoins(coins);
      RH.Audio.send();
      RH.Poki.commercialBreak();
      return coins;
    },
    openChest() {
      if (Date.now() < S.chestReadyAt) return;
      RH.Poki.rewardedBreak().then((ok) => {
        if (!ok) return;
        S.chestReadyAt = Date.now() + C.rewards.chestCooldownSec * 1000;
        grantTreasure(weightedPick(C.rewards.chestRarity));
      });
    },
    startBoost() {
      if (Date.now() < S.boostUntil) return;
      RH.Poki.rewardedBreak().then((ok) => { if (ok) S.boostUntil = Date.now() + C.rewards.boostSec * 1000; });
    },
  };

  function launch(g, h) {
    g.target = h.id;
    g.lastTarget = h.id;
    g.t = 0;
    g.dur = stats.heistTime(h);
    g.bags = stats.heistBags(h);
    g.bagValue = h.bagValue;
    S.heat = Math.min(C.heat.max, S.heat + stats.heistNoise(h));
    g.hot = S.heat >= C.heat.max; // this heist woke up the cops -> chase on return
  }

  // treasures of the current district only
  function grantTreasure(rarity) {
    const d = S.district - 1;
    const pool = C.treasures.filter((t) => t.rarity === rarity && t.d === d);
    const t = pool[Math.floor(Math.random() * pool.length)];
    const isNew = !S.collection[t.id];
    const oldStars = stats.stars(t.id);
    S.collection[t.id] = (S.collection[t.id] || 0) + 1;
    const starUp = stats.stars(t.id) > oldStars;
    if (isNew && zoneBought('display')) {
      const i = S.displaySlots.indexOf(null);
      if (i >= 0) S.displaySlots[i] = t.id;
    }
    RH.Audio.treasure();
    RH.UI.treasureToast(t, isNew, starUp);
  }

  function completeGang(g) {
    const h = heistCfg(g.target);
    g.target = null;
    g.t = 0;
    if (!h) return;
    const result = { bags: g.bags, bagValue: g.bagValue, heist: h, k: h.slot };
    if (Math.random() < stats.treasureChance(h)) grantTreasure(weightedPick(h.rarity));
    RH.Audio.arrive();
    const hot = g.hot;
    g.hot = false;
    if (hot && mode === 'hideout' && !RH.UI.modalOpen()) {
      RH.Audio.siren();
      RH.Chase.begin(result, (res) => {
        // the chase clears the wanted level for EVERY gang (heists launched while it was 100% included)
        S.heat = 0;
        S.gangs.forEach((x) => (x.hot = false));
        let bags = result.bags;
        let value = result.bagValue;
        if (res.success) value = Math.round(value * (1 + C.chase.successBonus));
        else bags = Math.ceil(bags * (1 - C.chase.failLoss));
        for (let i = 0; i < bags; i++) S.garageBags.push({ k: result.k, v: value });
        if (res.bonusCoins) addCoins(res.bonusCoins);
        mode = 'hideout';
        RH.Input.resetJoystick();
        RH.Poki.commercialBreak();
      });
      mode = 'chase';
    } else {
      for (let i = 0; i < result.bags; i++) S.garageBags.push({ k: result.k, v: result.bagValue });
    }
    if (g.repeat && lvl('loader') > 0) launch(g, h);
  }

  // ---------- loader raccoons ----------
  function syncHelpers() {
    while (helpers.length < lvl('loader')) {
      const st = C.stations.garage;
      helpers.push({ x: st.x - 40 + helpers.length * 30, y: st.y + 60, carry: [], state: 'toGarage', drop: 0, bob: Math.random() * 6 });
    }
  }
  // walk a carrier between the stash and the stalls; cap = goods per trip
  function carrierStep(hp, i, dt, cap, sp) {
    const G = C.stations.garage;
    let tgt;
    if (hp.state === 'toGarage') tgt = { x: G.x - 80 + (i % 6) * 32, y: G.y + 40 };
    else {
      const k = hp.carry.length ? hp.carry[0].k : 0;
      const r = stallRect(k);
      tgt = { x: r.x - 30 + (i % 3) * 30, y: r.y - r.h / 2 - 16 };
    }
    const dx = tgt.x - hp.x, dy = tgt.y - hp.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      hp.x += (dx / d) * Math.min(d, sp * dt);
      hp.y += (dy / d) * Math.min(d, sp * dt);
      hp.bob += dt * 12;
      hp.face = dx < 0 ? -1 : 1;
    } else if (hp.state === 'toGarage') {
      // take only goods whose stall has room
      const room = [0, 1, 2, 3].map((k) => stallSpace(k));
      for (let j = S.garageBags.length - 1; j >= 0 && hp.carry.length < cap; j--) {
        const it = S.garageBags[j];
        if (room[it.k] > 0) { room[it.k]--; hp.carry.push(it); S.garageBags.splice(j, 1); }
      }
      if (hp.carry.length) { hp.carry.sort((a, b) => a.k - b.k); hp.state = 'toStall'; }
    } else {
      hp.drop -= dt;
      const k = hp.carry.length ? hp.carry[0].k : -1;
      if (k >= 0 && hp.drop <= 0) {
        if (stallSpace(k) > 0) { S.stalls[k].push(hp.carry.shift().v); hp.drop = C.player.dropInterval * 1.5; RH.Audio.pick(); }
        else S.garageBags.push(...hp.carry.splice(0, hp.carry.filter((x) => x.k === k).length)); // full: put back
      }
      if (!hp.carry.length) hp.state = 'toGarage';
    }
  }
  function updateHelpers(dt) {
    const sp = C.helper.speed * (1 + E.speedAdd * lvl('speed') * 0.5);
    helpers.forEach((hp, i) => carrierStep(hp, i, dt, C.helper.carry, sp));
  }

  // ---------- crew walking around the hideout ----------
  const ST = C.stations;
  const CREW_ROUTES = {
    driver: [[ST.crew.x + 40, ST.crew.y + 30], [ST.garage.x - 110, ST.garage.y + 130], [ST.board.x + 140, ST.board.y + 40]],
    hacker: [[ST.crew.x - 50, ST.crew.y - 10], [ST.crew.x - 50, ST.crew.y - 10], [ST.display.x, ST.display.y + 120]],
  };
  function syncCrew() {
    C.crew.forEach((c, i) => {
      if (crewA(c.id) < 1 || crewBots.some((b) => b.id === c.id)) return;
      crewBots.push({ id: c.id, emoji: c.emoji, x: ST.crew.x - 60 + i * 40, y: ST.crew.y + 20, tx: null, ty: null,
        wait: Math.random() * 2, step: 0, bob: 0, face: 1, carry: [], state: 'toGarage', drop: 0 });
    });
  }
  function pickCrewTarget(b) {
    if (b.id === 'sneak') {
      // tiptoes around the whole hideout
      b.tx = 120 + Math.random() * (C.world.w - 240);
      b.ty = 140 + Math.random() * (C.world.h - 280);
    } else {
      const r = CREW_ROUTES[b.id];
      b.step = (b.step + 1) % r.length;
      [b.tx, b.ty] = r[b.step];
    }
    b.wait = b.id === 'hacker' && b.step < 2 ? 4 + Math.random() * 4 : 1 + Math.random() * 2.5;
  }
  function updateCrew(dt) {
    crewBots.forEach((b, i) => {
      if (b.id === 'muscle') {
        carrierStep(b, 3 + i, dt, stats.muscleCarry(), CE.speed);
        return;
      }
      if (b.tx == null) { pickCrewTarget(b); return; }
      const dx = b.tx - b.x, dy = b.ty - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 5) {
        const sp = b.id === 'sneak' ? CE.speed * 0.7 : CE.speed;
        b.x += (dx / d) * Math.min(d, sp * dt);
        b.y += (dy / d) * Math.min(d, sp * dt);
        b.bob += dt * (b.id === 'sneak' ? 7 : 11);
        b.face = dx < 0 ? -1 : 1;
      } else {
        b.bob = 0;
        b.wait -= dt;
        if (b.wait <= 0) pickCrewTarget(b);
      }
    });
  }

  // ---------- shop: buyers take goods from stalls and pay at the register ----------
  const REG = C.stations.laundry;
  const queueSpot = (i) => ({ x: C.shop.queue[0] + C.shop.queue[2] * i, y: C.shop.queue[1] });
  function moveTo(b, x, y, dt) {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
    if (d <= 4) { b.bob = 0; return true; }
    const step = Math.min(d, C.shop.buyerSpeed * dt);
    b.x += (dx / d) * step; b.y += (dy / d) * step;
    b.bob += dt * 11; b.face = dx < 0 ? -1 : 1;
    return false;
  }
  function pickStall() {
    const open = [0, 1, 2, 3].filter((k) => stallOpen(k) && S.stalls[k].length);
    return open.length ? open[Math.floor(Math.random() * open.length)] : -1;
  }
  function updateShop(dt, bossAtRegister) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && buyers.length < C.shop.maxBuyers && pickStall() >= 0) {
      spawnTimer = C.shop.spawnEvery * (0.7 + Math.random() * 0.6);
      const t = Math.floor(Math.random() * C.shop.buyers.length);
      buyers.push({ x: C.shop.door[0], y: C.shop.door[1] + (Math.random() - 0.5) * 60, kind: t, state: 'toStall', stall: pickStall(),
        items: [], wait: 0, bob: 0, face: -1 });
    }
    buyers.forEach((b) => {
      if (b.state === 'toStall') {
        const r = stallRect(b.stall);
        if (moveTo(b, r.x + (b.kind - 1) * 26, r.y + r.h / 2 + 40, dt)) { b.state = 'take'; b.wait = 0.5; }
      } else if (b.state === 'take') {
        b.wait -= dt;
        if (b.wait > 0) return;
        const want = C.shop.take[0] + Math.floor(Math.random() * (C.shop.take[1] - C.shop.take[0] + 1));
        const st = S.stalls[b.stall];
        while (b.items.length < want && st.length) b.items.push({ k: b.stall, v: st.pop() });
        if (b.items.length) { b.state = 'queue'; queue.push(b); }
        else { const k = pickStall(); if (k >= 0) { b.stall = k; b.state = 'toStall'; } else b.state = 'leave'; }
      } else if (b.state === 'queue') {
        const i = queue.indexOf(b);
        const p = queueSpot(i);
        moveTo(b, p.x, p.y, dt);
      } else if (b.state === 'leave') {
        if (moveTo(b, C.shop.door[0] + 40, C.shop.door[1], dt)) b.gone = true;
      }
    });
    buyers = buyers.filter((b) => !b.gone);

    // serving the queue: the Boss is fast, a hired cashier is slower
    const front = queue[0];
    const ready = front && Math.hypot(front.x - queueSpot(0).x, front.y - queueSpot(0).y) < 8;
    const serving = bossAtRegister ? C.shop.serveBoss : lvl('cashier') > 0 ? stats.cashierServe() : 0;
    if (ready && serving) {
      serveTimer += dt;
      if (serveTimer >= serving) {
        serveTimer = 0;
        queue.shift();
        const sum = front.items.reduce((a, it) => a + it.v, 0);
        const coins = Math.round(sum * stats.bagCoinMul() * stats.boostMul());
        addCoins(coins);
        floater(REG.x + (Math.random() - 0.5) * 50, REG.y - 70, '+' + RH.fmt(coins));
        RH.Audio.coin();
        front.items = [];
        front.state = 'leave';
        if (S.tutorial === 4) S.tutorial = 5;
      }
    } else serveTimer = 0;
  }

  // ---------- away / offline progress of the current district ----------
  // Gangs finish their heists; gangs on repeat (with a loader) keep robbing and their loot is
  // cashed in directly. Returns the coins made (not added yet).
  function catchUp(elapsed) {
    if (elapsed < 1) return 0;
    let coins = 0;
    S.gangs.forEach((g) => {
      if (!g.target) return;
      const h = heistCfg(g.target);
      if (!h) { g.target = null; return; }
      const remaining = g.dur - g.t;
      if (elapsed < remaining) { g.t += elapsed; return; }
      for (let i = 0; i < g.bags; i++) S.garageBags.push({ k: h.slot, v: g.bagValue });
      if (g.repeat && lvl('loader') > 0) {
        const after = elapsed - remaining;
        const dur = stats.heistTime(h);
        const runs = Math.floor(after / dur);
        coins += runs * stats.heistBags(h) * h.bagValue * stats.bagCoinMul();
        launch(g, h);
        g.t = after - runs * dur;
      } else {
        g.target = null;
        g.t = 0;
      }
      g.hot = false;
    });
    S.heat = Math.max(0, S.heat - C.heat.coolPerSec * stats.coolMul() * elapsed);
    return Math.floor(coins);
  }

  function applyOffline() {
    const now = Date.now();
    const elapsed = Math.min((now - (S.lastSeen || now)) / 1000, stats.offlineCap());
    if (elapsed < 1) return 0;
    const coins = Math.floor(stats.displayIncome(false) * elapsed) + catchUp(elapsed);
    if (elapsed >= C.offlineMinSec && coins > 0) return coins;
    addCoins(coins);
    return 0;
  }

  // ---------- coin drain into zones / level pads ----------
  function drain(dt, cost, paid, onPaid) {
    if (S.coins < 1) { drainAccum = 0; return paid; }
    const rate = Math.max(20, cost / 1.5);
    drainAccum += rate * dt;
    const amt = Math.min(Math.floor(drainAccum), Math.floor(S.coins), cost - paid);
    if (amt > 0) {
      drainAccum -= amt;
      S.coins -= amt;
      paid += amt;
      RH.Audio.coin();
      if (paid >= cost) { RH.Audio.buy(); onPaid(); }
    }
    return paid;
  }

  // ---------- update ----------
  function update(dt) {
    time += dt;
    if (mode === 'chase') { RH.Chase.update(dt); return; }

    // passive income
    const inc = stats.displayIncome();
    if (inc > 0) addCoins(inc * dt);

    // wanted level cooling (paused while a "hot" heist is on the road)
    if (!S.gangs.some((g) => g.hot)) S.heat = Math.max(0, S.heat - C.heat.coolPerSec * stats.coolMul() * dt);

    // gangs
    S.gangs.forEach((g) => {
      if (!g.target) return;
      g.t += dt;
      if (g.t >= g.dur && mode === 'hideout' && !(g.hot && RH.UI.modalOpen())) completeGang(g);
    });

    // player movement
    const mv = RH.UI.modalOpen() ? { x: 0, y: 0 } : RH.Input.move();
    const sp = stats.speed();
    player.vx = mv.x * sp;
    player.vy = mv.y * sp;
    player.x = Math.max(40, Math.min(C.world.w - 40, player.x + player.vx * dt));
    player.y = Math.max(50, Math.min(C.world.h - 30, player.y + player.vy * dt));
    if (Math.abs(mv.x) > 0.1) player.face = mv.x < 0 ? -1 : 1;
    if (mv.x || mv.y) { player.bob += dt * 14; stillTime = 0; } else { player.bob = 0; stillTime += dt; }
    S.player.x = player.x; S.player.y = player.y;

    // stations
    let here = null;
    for (const id in ST) {
      if (!stationOn(id)) continue;
      if (inRect(player.x, player.y, ST[id], 10)) { here = id; break; }
    }
    if (here !== currentStation) {
      currentStation = here;
      RH.UI.onStation(here);
    }

    pickTimer -= dt;
    dropTimer -= dt;
    if (here === 'garage' && S.garageBags.length && S.carried.length < stats.carryCap() && pickTimer <= 0) {
      S.carried.push(S.garageBags.pop());
      pickTimer = C.player.pickInterval;
      RH.Audio.pick();
      if (S.tutorial <= 2) S.tutorial = 3;
    }
    // put goods on the stall you stand at (only goods of that stall)
    for (let k = 0; k < 4; k++) {
      if (!stallOpen(k) || !inRect(player.x, player.y, stallRect(k), 14)) continue;
      const j = S.carried.findIndex((it) => it.k === k);
      if (j >= 0 && stallSpace(k) > 0 && dropTimer <= 0) {
        S.stalls[k].push(S.carried.splice(j, 1)[0].v);
        dropTimer = C.player.dropInterval;
        RH.Audio.pick();
        if (S.tutorial === 3) S.tutorial = 4;
      }
    }
    updateShop(dt, here === 'laundry');
    if (S.tutorial === 1 && S.garageBags.length) S.tutorial = 2;

    // buy zones and level pads
    const standing = stillTime >= 0.25; // walking through a zone never pays
    let draining = !standing;
    for (const z of standing ? C.buyZones : []) {
      if (zoneBought(z.id) || !inRect(player.x, player.y, z, 0)) continue;
      draining = true;
      S.zones[z.id] = drain(dt, zoneCost(z), S.zones[z.id] || 0, () => {
        if (z.keep) S.zones[z.id] = RH.Save.KEEP_PAID;
        floater(z.x, z.y - 40, '✨ ' + RH.t('zone_' + z.id) + '!', '#7dffb2', 30);
        RH.UI.toast(`<div class="toast-emoji">${RH.Sprites.html(zoneSprite(z), z.emoji)}</div><div><div class="toast-head">${RH.t('zone_' + z.id)}</div><div>${RH.t('zoned_' + z.id)}</div></div>`, '#7dffb2');
      });
      if (z.keep && (S.zones[z.id] || 0) >= zoneCost(z)) S.zones[z.id] = RH.Save.KEEP_PAID;
      break;
    }
    if (!draining) for (const p of C.levelPads) {
      if ((p.needs && !zoneBought(p.needs)) || !inRect(player.x, player.y, p, 0)) continue;
      draining = true;
      const cost = stats.padCost(p.id);
      const paid = drain(dt, cost, S.padPaid[p.id] || 0, () => {});
      if (paid >= cost) {
        S.stationLv[p.id] = padLv(p.id) + 1;
        S.padPaid[p.id] = 0;
        drainAccum = 0;
        floater(p.x, p.y - 40, '⬆ ' + RH.t(p.id) + ' ' + RH.t('lvl') + ' ' + padLv(p.id), '#7dffb2', 26);
      } else S.padPaid[p.id] = paid;
      break;
    }
    if (!standing) drainAccum = 0;

    updateHelpers(dt);
    updateCrew(dt);

    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt;
      floaters[i].y -= 50 * dt;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }

    // camera
    const vw = W / cam.scale, vh = H / cam.scale;
    const m = 60;
    const cx = (v, world) => (v >= world + m * 2 ? (world - v) / 2 : null);
    const fx = cx(vw, C.world.w), fy = cx(vh, C.world.h);
    const tx = fx != null ? fx : Math.max(-m, Math.min(C.world.w + m - vw, player.x - vw / 2));
    const ty = fy != null ? fy : Math.max(-m, Math.min(C.world.h + m - vh, player.y - vh / 2));
    cam.x += (tx - cam.x) * Math.min(1, dt * 8);
    cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  }

  // ---------- rendering ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function emoji(e, x, y, size) {
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
  }
  function text(s, x, y, size, color, weight = 800, stroke = true) {
    ctx.font = `${weight} ${size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(30,10,50,0.85)'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function drawFloorPattern(D) {
    const { w, h } = C.world;
    const [a, b] = D.tiles;
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    if (D.floor === 'checker') {
      for (let y = 0; y < h; y += 100) for (let x = 0; x < w; x += 100) {
        if (((x + y) / 100) % 2) continue;
        ctx.fillStyle = b; ctx.fillRect(x, y, 100, 100);
      }
    } else if (D.floor === 'grid') {
      ctx.strokeStyle = 'rgba(63,216,208,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += 80) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,111,181,0.35)';
      for (let y = 0; y <= h; y += 80) for (let x = 0; x <= w; x += 80) ctx.fillRect(x - 3, y - 3, 6, 6);
    } else if (D.floor === 'tiles') {
      for (let y = 0; y < h; y += 60) for (let x = 0; x < w; x += 60) {
        ctx.fillStyle = ((x / 60 + y / 60) % 3) ? a : b;
        ctx.fillRect(x + 2, y + 2, 56, 56);
      }
    } else if (D.floor === 'parquet') {
      for (let y = 0; y < h; y += 60) for (let x = 0; x < w; x += 120) {
        const odd = (y / 60) % 2;
        ctx.fillStyle = odd ? b : a;
        ctx.fillRect(x + (odd ? 60 : 0) - 60, y, 118, 58);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + (odd ? 60 : 0) - 60, y + 56, 118, 4);
      }
    } else if (D.floor === 'planks') {
      for (let y = 0; y < h; y += 50) {
        const off = ((y / 50) % 3) * 70;
        for (let x = -off; x < w; x += 210) {
          ctx.fillStyle = ((x + y) / 10) % 2 ? a : b;
          ctx.fillRect(x, y, 206, 46);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x + 8, y + 20, 4, 4); ctx.fillRect(x + 194, y + 20, 4, 4);
        }
      }
    }
    // central rug under the sign
    ctx.fillStyle = D.rug + '30';
    ctx.strokeStyle = D.rug + '80';
    ctx.lineWidth = 6;
    rr(900 - 260, 360, 520, 160, 40);
    ctx.fill();
    ctx.stroke();
  }

  function drawFloor() {
    const { w, h } = C.world;
    const D = districtCfg();
    ctx.fillStyle = D.outside;
    ctx.fillRect(-500, -500, w + 1000, h + 1000);
    if (D.sea) {
      ctx.fillStyle = '#4fd3e6';
      ctx.fillRect(-500, h + 90, w + 1000, 500);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = -500; i < w + 500; i += 80) {
        const yy = h + 90 + Math.sin(time * 2 + i * 0.05) * 6;
        ctx.fillRect(i, yy, 50, 6);
      }
    }
    [[-80, 100], [-90, 600], [w + 80, 120], [w + 70, 560], [w + 90, 900], [-70, 1000]].forEach(([x, y]) => emoji(D.deco, x, y, 80));
    drawFloorPattern(D);
    ctx.lineWidth = 10;
    ctx.strokeStyle = D.wall;
    ctx.shadowColor = D.wall;
    ctx.shadowBlur = 20;
    rr(0, 0, w, h, 24);
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawDoor();
    // interior decor of this district
    C.decorSpots.forEach(([x, y], i) => RH.Sprites.draw(ctx, D.decor[i % D.decor.length], '', x, y, 96));
    const glow = 0.75 + Math.sin(time * 3) * 0.25;
    ctx.globalAlpha = glow;
    text('RACCOON HQ', 900, 420, 50, D.sign, 900);
    ctx.globalAlpha = 1;
    text(D.emoji + ' ' + RH.t('district_' + D.id), 900, 470, 22, '#fff');
  }

  function drawStation(id, s) {
    const active = currentStation === id;
    const pulse = active ? 1 + Math.sin(time * 8) * 0.03 : 1;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = s.color + '40';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = active ? 7 : 4;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = active ? 25 : 10;
    rr(-s.w / 2, -s.h / 2, s.w, s.h, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    if (id === 'garage') {
      RH.Sprites.draw(ctx, 'st_garage', s.emoji, s.x + 62, s.y - 36, 76);
      const n = S.garageBags.length;
      const shown = Math.min(n, 18);
      for (let i = 0; i < shown; i++) {
        const col = i % 6, row = Math.floor(i / 6);
        const it = S.garageBags[i];
        RH.Sprites.draw(ctx, goodsSprite(it), goodsEmoji(it), s.x - 90 + col * 24, s.y + 55 - row * 22, 30);
      }
      if (n) text('×' + n, s.x + 70, s.y + 40, 26, '#fff');
    } else if (id === 'display') {
      const slots = S.displaySlots;
      const sw = s.w / slots.length;
      const es = slots.length > 4 ? 30 : 38;
      slots.forEach((tid, i) => {
        const x = s.x - s.w / 2 + sw * (i + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        rr(x - sw * 0.4, s.y - 4, sw * 0.8, 30, 8);
        ctx.fill();
        if (tid) {
          const t = C.treasures.find((q) => q.id === tid);
          RH.Sprites.draw(ctx, 't_' + t.id, t.emoji, x, s.y - 22 + Math.sin(time * 3 + i) * 3, es);
        } else text('?', x, s.y - 18, 24, 'rgba(255,255,255,0.35)');
      });
      const inc = stats.displayIncome();
      if (inc) text('+' + RH.fmt(inc) + RH.t('perSec'), s.x, s.y + 44, 20, '#ffe35c');
    } else {
      RH.Sprites.draw(ctx, 'st_' + id, s.emoji, s.x, s.y - 8, 84);
    }
    text(RH.t(id), s.x, s.y + s.h / 2 + 18, 20, '#fff');
    text(RH.t('desc_' + id), s.x, s.y + s.h / 2 + 40, 14, 'rgba(255,255,255,0.7)', 700);
  }

  function drawDrainBox(r, paid, cost, color) {
    const p = Math.min(1, paid / cost);
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time * 30;
    ctx.lineWidth = 4;
    ctx.strokeStyle = S.coins + paid >= cost ? '#7dffb2' : color;
    rr(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 14);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(125,255,178,0.3)';
    rr(r.x - r.w / 2, r.y + r.h / 2 - r.h * p, r.w, r.h * p, 14);
    ctx.fill();
  }
  function coinText(amount, x, y, size) {
    const s = RH.fmt(amount);
    ctx.font = `800 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    const w = ctx.measureText(s).width;
    RH.Sprites.draw(ctx, 'coin', '🪙', x - w / 2 - size * 0.45, y, size * 0.95);
    text(s, x + size * 0.45, y, size, '#ffe35c');
  }

  const zoneSprite = (z) => (C.stations[z.id] ? 'st_' : 'zone_') + z.id;

  function drawZone(z) {
    const unlocksStation = Object.values(C.stations).some((s) => s.needs === z.id);
    if (zoneBought(z.id)) {
      if (unlocksStation) return;
      ctx.fillStyle = 'rgba(125,255,178,0.12)';
      rr(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 14);
      ctx.fill();
      RH.Sprites.draw(ctx, zoneSprite(z), z.emoji, z.x, z.y - 6, 70);
      text(RH.t('zone_' + z.id), z.x, z.y + z.h / 2 + 14, 16, '#cfe');
      text('✓ ' + RH.t('zoned_' + z.id), z.x, z.y + z.h / 2 + 34, 14, '#7dffb2', 700);
      return;
    }
    const cost = zoneCost(z), paid = S.zones[z.id] || 0;
    drawDrainBox(z, paid, cost, 'rgba(255,255,255,0.55)');
    ctx.globalAlpha = 0.5;
    RH.Sprites.draw(ctx, zoneSprite(z), z.emoji, z.x, z.y - 18, 48);
    ctx.globalAlpha = 1;
    coinText(cost - paid, z.x, z.y + 22, 24);
    text(RH.t('zone_' + z.id), z.x, z.y + z.h / 2 + 14, 16, '#fff');
    text(RH.t('zoned_' + z.id), z.x, z.y + z.h / 2 + 34, 14, 'rgba(255,255,255,0.7)', 700);
  }

  function drawPad(p) {
    if (p.needs && !zoneBought(p.needs)) return;
    const cost = stats.padCost(p.id), paid = S.padPaid[p.id] || 0;
    drawDrainBox(p, paid, cost, 'rgba(255,227,92,0.6)');
    emoji('⬆️', p.x - 26, p.y - 16, 26);
    RH.Sprites.draw(ctx, 'st_' + p.id, p.emoji, p.x + 22, p.y - 16, 38);
    coinText(cost - paid, p.x, p.y + 22, 20);
    const lv = padLv(p.id);
    text(RH.t('lvl') + ' ' + lv + ' → ' + (lv + 1), p.x, p.y + p.h / 2 + 14, 15, '#fff');
    text(RH.t('padd_' + p.id), p.x, p.y + p.h / 2 + 32, 13, 'rgba(255,255,255,0.7)', 700);
  }

  // All hat sprites share one frame (120×100, head line at y≈88): width share of the raccoon sprite.
  const HAT_W = 0.46;

  function drawRaccoon(x, y, size, face, bob, stack, hat, glow, hatSprite) {
    const by = Math.abs(Math.sin(bob)) * -5;
    const g = ctx.createRadialGradient(x, y, size * 0.1, x, y, size * 0.75);
    g.addColorStop(0, glow ? 'rgba(255,240,200,0.55)' : 'rgba(200,255,240,0.4)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.45, size * 0.4, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    const R = RH.Sprites.img('raccoon');
    const rw = size * 1.35, rh = rw * 210 / 200;
    const top = y + by - rh * 0.62;
    ctx.save();
    ctx.translate(x, y + by);
    ctx.scale(face, 1);
    if (R) ctx.drawImage(R, -rw / 2, -rh * 0.62, rw, rh);
    else emoji('🦝', 0, 0, size);
    ctx.restore();
    const Hs = hatSprite && RH.Sprites.img(hatSprite);
    if (R && Hs) {
      const hw = rw * HAT_W, hh = hw * Hs.naturalHeight / Hs.naturalWidth;
      ctx.drawImage(Hs, x - hw / 2, top + rh * 54 / 210 - hh * 0.88, hw, hh);
    } else if (hat) emoji(hat, x, R ? top + rh * 0.06 : y + by - size * 0.55, size * 0.55);
    const n = stack.length;
    const shown = Math.min(n, 12);
    for (let i = 0; i < shown; i++) {
      RH.Sprites.draw(ctx, goodsSprite(stack[i]), goodsEmoji(stack[i]), x - face * size * 0.45, y + by - size * 0.15 - i * size * 0.26, size * 0.5);
    }
    if (n > 12) text('×' + n, x - face * size * 0.35, y + by - size * 0.25 - 12 * size * 0.26 - 6, 16, '#fff');
  }

  function tutorialTarget() {
    const step = S.tutorial;
    if (step >= 6) return null;
    if (step === 0) return ST.board;
    if (step <= 2) return ST.garage;
    if (step === 3) return S.carried.length ? stallRect(S.carried[0].k) : ST.garage;
    if (step === 4) return queue.length ? ST.laundry : null;
    if (S.coins < Math.min(...C.upgrades.slice(0, 6).map((u) => stats.upgradeCost(u.id)))) return null;
    return ST.workshop;
  }
  function drawTutorial() {
    const target = tutorialTarget();
    if (!target) return;
    const y = target.y - target.h / 2 - 40 + Math.sin(time * 6) * 10;
    emoji('👇', target.x, y, 54);
    const dx = target.x - player.x, dy = target.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 180) {
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(player.x + Math.cos(a) * 70, player.y + Math.sin(a) * 70);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,227,92,' + (0.6 + Math.sin(time * 6) * 0.3) + ')';
      ctx.beginPath();
      ctx.moveTo(22, 0); ctx.lineTo(-10, -16); ctx.lineTo(-4, 0); ctx.lineTo(-10, 16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStalls() {
    for (let k = 0; k < 4; k++) {
      const r = stallRect(k);
      const h = heists()[k];
      if (!stallOpen(k)) {
        ctx.globalAlpha = 0.35;
        RH.Sprites.draw(ctx, 'st_stall', '🏪', r.x, r.y, r.w);
        RH.Sprites.draw(ctx, 'h_' + h.id, h.emoji, r.x, r.y - 6, 36);
        ctx.globalAlpha = 1;
        text('🔒', r.x, r.y + r.h / 2 + 16, 16, '#fff');
        continue;
      }
      const near = inRect(player.x, player.y, r, 14) && S.carried.some((it) => it.k === k);
      if (near) {
        ctx.fillStyle = 'rgba(125,255,178,0.25)';
        rr(r.x - r.w / 2 - 6, r.y - r.h / 2 - 6, r.w + 12, r.h + 12, 16);
        ctx.fill();
      }
      RH.Sprites.draw(ctx, 'st_stall', '🏪', r.x, r.y, r.w);
      const n = S.stalls[k].length;
      for (let i = 0; i < Math.min(n, 8); i++) {
        const col = i % 4, row = Math.floor(i / 4);
        RH.Sprites.draw(ctx, 'h_' + h.id, h.emoji, r.x - 42 + col * 28, r.y + 4 - row * 18, 30);
      }
      if (!n) RH.Sprites.draw(ctx, 'h_' + h.id, h.emoji, r.x, r.y - 2, 30);
      text(n + '/' + C.shop.stallCap, r.x, r.y + r.h / 2 + 14, 15, n ? '#fff' : '#ff9aa8');
    }
  }

  function drawBuyer(b) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 22, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const by = Math.abs(Math.sin(b.bob)) * -4;
    ctx.save();
    ctx.translate(b.x, b.y + by);
    ctx.scale(b.face, 1);
    RH.Sprites.draw(ctx, C.shop.buyers[b.kind], C.shop.buyerEmoji[b.kind], 0, -6, 60);
    ctx.restore();
    b.items.slice(0, 3).forEach((it, i) => RH.Sprites.draw(ctx, goodsSprite(it), goodsEmoji(it), b.x - 14 + i * 14, b.y - 46 + by, 24));
  }

  function drawDoor() {
    const [, y] = C.shop.door;
    ctx.fillStyle = districtCfg().tiles[0];
    ctx.fillRect(C.world.w - 12, y - 60, 24, 120);
    ctx.fillStyle = '#ffd84d';
    ctx.fillRect(C.world.w - 4, y - 60, 8, 8);
    ctx.fillRect(C.world.w - 4, y + 52, 8, 8);
    text('➜', C.world.w + 34, y, 30, '#ffd84d');
  }

  const hatEmoji = () => (C.cosmetics.hats.find((h) => h.id === S.cosmetics.hat) || C.cosmetics.hats[0]).emoji;
  const vanEmoji = () => (C.cosmetics.vans.find((h) => h.id === S.cosmetics.van) || C.cosmetics.vans[0]).emoji;

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode === 'chase') { RH.Chase.render(ctx, W, H, time); return; }
    ctx.fillStyle = districtCfg().outside;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    drawFloor();
    C.buyZones.forEach(drawZone);
    C.levelPads.forEach(drawPad);
    for (const id in ST) if (stationOn(id)) drawStation(id, ST[id]);
    drawStalls();
    // characters sorted by y so the lower one is drawn in front
    const actors = [];
    buyers.forEach((b) => actors.push({ y: b.y, draw: () => drawBuyer(b) }));
    if (lvl('cashier') > 0) actors.push({ y: REG.y - 40, draw: () => drawRaccoon(REG.x + 60, REG.y - 40, 40, -1, 0, [], '💵', false, 'hat_cap') });
    crewBots.forEach((b) => actors.push({ y: b.y, draw: () => drawRaccoon(b.x, b.y, 42, b.face || 1, b.bob, b.carry, b.emoji, false, 'crew_' + b.id) }));
    helpers.forEach((hp) => actors.push({ y: hp.y, draw: () => drawRaccoon(hp.x, hp.y, 40, hp.face || 1, hp.bob, hp.carry, '🧢', false, 'hat_cap') }));
    actors.push({ y: player.y, draw: () => drawRaccoon(player.x, player.y, 56, player.face, player.bob, S.carried, hatEmoji(), true, 'hat_' + S.cosmetics.hat) });
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    if (S.carried.length >= stats.carryCap()) text('MAX', player.x, player.y + 44, 16, '#ff6fb5');
    drawTutorial();
    floaters.forEach((f) => {
      ctx.globalAlpha = Math.min(1, f.life / f.max * 2);
      text(f.text, f.x, f.y, f.size, f.color);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    const j = RH.Input.joy;
    if (j.active && !RH.UI.modalOpen()) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(j.sx, j.sy, RH.Input.JOY_R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7;
      const dx = j.x - j.sx, dy = j.y - j.sy, l = Math.hypot(dx, dy), m = Math.min(l, RH.Input.JOY_R);
      ctx.beginPath(); ctx.arc(j.sx + (l ? dx / l * m : 0), j.sy + (l ? dy / l * m : 0), 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    cam.scale = Math.max(Math.min(W, H) / 780, H / (C.world.h + 120), W / (C.world.w + 120));
  }

  return {
    get S() { return S; },
    get mode() { return mode; },
    get tutorialStep() { return S.tutorial; },
    stats,
    actions,
    heists,
    heistCfg,
    upCfg,
    crewCfg,
    districtCfg,
    zoneBought,
    vanEmoji,
    queueLength: () => queue.length,
    init(c) {
      canvas = c;
      ctx = canvas.getContext('2d');
      S = RH.Save.load() || RH.Save.newState();
      if (S.lang) RH.lang = S.lang;
      player.x = S.player.x; player.y = S.player.y;
      syncHelpers();
      syncCrew();
      resize();
      window.addEventListener('resize', resize);
      cam.x = player.x - W / cam.scale / 2;
      cam.y = player.y - H / cam.scale / 2;
      return applyOffline();
    },
    addCoins,
    update,
    render,
    save() { RH.Save.save(S); },
    reset() {
      RH.Save.clear();
      S = RH.Save.newState();
      S.lang = RH.lang;
      helpers = [];
      crewBots = [];
      heistCache.d = 0;
      player.x = S.player.x; player.y = S.player.y;
      RH.Save.save(S);
    },
  };
})();
