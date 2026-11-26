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
  const KEEP_PAID = 1e18; // marks a kept zone as bought in every district

  let S = null;            // saved state
  let canvas, ctx, dpr = 1, W = 0, H = 0;
  const cam = { x: 0, y: 0, scale: 1 };
  const player = { x: 0, y: 0, vx: 0, vy: 0, face: 1, bob: 0 };
  let helpers = [];
  const floaters = [];
  let pickTimer = 0, dropTimer = 0;
  let currentStation = null;
  let time = 0;
  let mode = 'hideout';    // 'hideout' | 'chase'
  let drainAccum = 0;
  let heistCache = { d: 0, list: [] };

  // ---------- district ----------
  const districtCfg = () => C.districts[S.district - 1];
  const incomeMul = () => Math.pow(C.district.incomeBase, S.district - 1);
  const costMul = () => Math.pow(C.district.costBase, S.district - 1);
  const repMul = () => 1 + C.district.repBonus * (S.district - 1);

  function heists() {
    if (heistCache.d !== S.district) {
      const m = incomeMul();
      heistCache = {
        d: S.district,
        list: districtCfg().targets.map(([id, emoji], i) => {
          const s = C.heistSlots[i];
          return { id, emoji, time: s.time, bags: s.bags, bagValue: s.bagValue * m, noise: s.noise,
            unlock: RH.niceCost(s.unlock * m), treasure: s.treasure, rarity: s.rarity };
        }),
      };
    }
    return heistCache.list;
  }
  const heistCfg = (id) => heists().find((h) => h.id === id);

  // ---------- derived stats ----------
  const lvl = (id) => S.upgrades[id] || 0;
  const crewLv = (id) => S.crew[id] || 0;
  const padLv = (id) => S.stationLv[id] || 0;
  const upCfg = (id) => C.upgrades.find((u) => u.id === id);
  const crewCfg = (id) => C.crew.find((u) => u.id === id);
  const padCfg = (id) => C.levelPads.find((p) => p.id === id);
  const zoneCfg = (id) => C.buyZones.find((z) => z.id === id);
  const zoneCost = (z) => RH.niceCost(z.cost * costMul());
  function zoneBought(id) { return (S.zones[id] || 0) >= zoneCost(zoneCfg(id)); }
  const stationOn = (id) => !C.stations[id].needs || zoneBought(C.stations[id].needs);

  const stats = {
    incomeMul, costMul, repMul,
    carryCap: () => C.player.baseCarry + E.backpackAdd * lvl('backpack'),
    speed: () => C.player.speed * (1 + E.speedAdd * lvl('speed')),
    heistTime: (h) => Math.max(2, h.time * Math.pow(E.carTimeMul, lvl('car')) * Math.pow(CE.driverTime, crewLv('driver'))),
    heistBags: (h) => h.bags + lvl('bigBags'),
    heistNoise: (h) => h.noise * Math.pow(E.noiseMul, lvl('paws')) * Math.pow(CE.sneakNoise, crewLv('sneak')),
    treasureChance: (h) => Math.min(0.9, h.treasure + E.noseAdd * lvl('nose') + CE.sneakTreasure * crewLv('sneak')),
    gangCount: () => 1 + lvl('gang'),
    boostMul: () => (Date.now() < S.boostUntil ? C.rewards.boostMul : 1),
    // coins per bag value (everything except the temporary boost)
    bagCoinMul: () => (1 + (zoneBought('washer2') ? zoneCfg('washer2').laundryBonus : 0)) *
      (1 + padCfg('laundry').effect * padLv('laundry')) * (1 + CE.muscleCoins * crewLv('muscle')) * repMul(),
    displayMul: () => costMul() * (1 + padCfg('display').effect * padLv('display')) *
      (1 + CE.hackerDisplay * crewLv('hacker')) * repMul(),
    coolMul: () => (zoneBought('cooler') ? zoneCfg('cooler').coolMul : 1),
    upgradeCost: (id) => RH.niceCost(upCfg(id).base * Math.pow(upCfg(id).growth, lvl(id)) * costMul()),
    crewCost: (id) => RH.niceCost(crewCfg(id).hire * Math.pow(crewCfg(id).growth, crewLv(id)) * costMul()),
    padCost: (id) => RH.niceCost(padCfg(id).base * Math.pow(padCfg(id).growth, padLv(id)) * costMul()),
    marketPrice: (big) => RH.niceCost(C.market.base * Math.pow(C.market.growth, S.marketBuys) * incomeMul() * (big ? C.market.bigMul : 1)),
    slotCost: () => C.display.slotCosts[S.displaySlots.length - C.display.startSlots],
    moveCost: () => RH.niceCost(C.district.moveCost * incomeMul()),
    canMoveDistrict: () => S.district < C.districts.length && heists().every((h) => S.heistsUnlocked[h.id]),
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
      if (S.tutorial === 4) S.tutorial = 5;
      floater(player.x, player.y - 70, RH.t('up_' + id) + ' ↑', '#7dffb2', 22);
      return true;
    },
    buyCrew(id) {
      if (crewLv(id) >= crewCfg(id).max || !spend(stats.crewCost(id))) return false;
      S.crew[id] = crewLv(id) + 1;
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
      const list = C.cosmetics[kind];
      const item = list.find((x) => x.id === id);
      const owned = S.cosmetics[kind];
      const key = kind === 'hats' ? 'hat' : 'van';
      if (!owned.includes(id)) {
        if (!spend(item.cost)) return;
        owned.push(id);
      } else RH.Audio.pick();
      S.cosmetics[key] = id;
    },
    moveDistrict() {
      if (!stats.canMoveDistrict() || S.coins < stats.moveCost()) { RH.Audio.deny(); return false; }
      const keepZones = {};
      C.buyZones.forEach((z) => { if (z.keep && zoneBought(z.id)) keepZones[z.id] = KEEP_PAID; });
      Object.assign(S, RH.Save.districtState(S.district + 1));
      S.district++;
      S.zones = keepZones;
      helpers = [];
      player.x = C.startPos.x; player.y = C.startPos.y;
      heistCache.d = 0;
      currentStation = null;
      RH.Audio.treasure();
      RH.Poki.commercialBreak();
      return true;
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

  function grantTreasure(rarity) {
    const pool = C.treasures.filter((t) => t.rarity === rarity);
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
    const result = { bags: g.bags, bagValue: g.bagValue, heist: h };
    if (Math.random() < stats.treasureChance(h)) grantTreasure(weightedPick(h.rarity));
    RH.Audio.arrive();
    const hot = g.hot;
    g.hot = false;
    if (hot && mode === 'hideout' && !RH.UI.modalOpen()) {
      RH.Audio.siren();
      RH.Chase.begin(result, (res) => {
        S.heat = 0;
        let bags = result.bags;
        let value = result.bagValue;
        if (res.success) value = Math.round(value * (1 + C.chase.successBonus));
        else bags = Math.ceil(bags * (1 - C.chase.failLoss));
        for (let i = 0; i < bags; i++) S.garageBags.push(value);
        if (res.bonusCoins) addCoins(res.bonusCoins);
        mode = 'hideout';
        RH.Input.resetJoystick();
        RH.Poki.commercialBreak();
      });
      mode = 'chase';
    } else {
      for (let i = 0; i < result.bags; i++) S.garageBags.push(result.bagValue);
    }
    if (g.repeat && lvl('loader') > 0) launch(g, h);
  }

  // ---------- helpers (loader raccoons) ----------
  function syncHelpers() {
    while (helpers.length < lvl('loader')) {
      const st = C.stations.garage;
      helpers.push({ x: st.x - 40 + helpers.length * 30, y: st.y + 60, carry: [], state: 'toGarage', drop: 0, bob: Math.random() * 6 });
    }
  }
  function updateHelpers(dt) {
    const G = C.stations.garage, L = C.stations.laundry;
    helpers.forEach((hp, i) => {
      const tgt = hp.state === 'toGarage' ? { x: G.x - 70 + i * 35, y: G.y + 40 } : { x: L.x - 70 + i * 35, y: L.y - 20 };
      const dx = tgt.x - hp.x, dy = tgt.y - hp.y;
      const d = Math.hypot(dx, dy);
      const sp = C.helper.speed * (1 + E.speedAdd * lvl('speed') * 0.5);
      if (d > 6) {
        hp.x += (dx / d) * Math.min(d, sp * dt);
        hp.y += (dy / d) * Math.min(d, sp * dt);
        hp.bob += dt * 12;
        hp.face = dx < 0 ? -1 : 1;
      } else if (hp.state === 'toGarage') {
        if (S.garageBags.length) {
          while (hp.carry.length < C.helper.carry && S.garageBags.length) hp.carry.push(S.garageBags.pop());
          hp.state = 'toLaundry';
        }
      } else {
        hp.drop -= dt;
        if (hp.drop <= 0 && hp.carry.length) {
          hp.drop = C.player.dropInterval * 1.5;
          launder(hp.carry.pop(), hp.x, hp.y - 30);
        }
        if (!hp.carry.length) hp.state = 'toGarage';
      }
    });
  }

  function launder(value, x, y) {
    const coins = Math.round(value * stats.bagCoinMul() * stats.boostMul());
    addCoins(coins);
    floater(x + (Math.random() - 0.5) * 40, y, '+' + RH.fmt(coins));
    RH.Audio.coin();
  }

  // ---------- offline progress ----------
  function applyOffline() {
    const now = Date.now();
    const elapsed = Math.min((now - (S.lastSeen || now)) / 1000, C.offlineCapSec);
    if (elapsed < 1) return 0;
    let coins = stats.displayIncome(false) * elapsed;
    S.gangs.forEach((g) => {
      if (!g.target) return;
      const h = heistCfg(g.target);
      if (!h) { g.target = null; return; }
      const remaining = g.dur - g.t;
      if (elapsed < remaining) { g.t += elapsed; return; }
      for (let i = 0; i < g.bags; i++) S.garageBags.push(g.bagValue);
      g.hot = false;
      if (g.repeat && lvl('loader') > 0) {
        const after = elapsed - remaining;
        const dur = stats.heistTime(h);
        const runs = Math.floor(after / dur);
        coins += runs * stats.heistBags(h) * h.bagValue * stats.bagCoinMul();
        launch(g, h);
        g.hot = false;
        g.t = after - runs * dur;
      } else {
        g.target = null;
        g.t = 0;
      }
    });
    S.heat = Math.max(0, S.heat - C.heat.coolPerSec * stats.coolMul() * elapsed);
    coins = Math.floor(coins);
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
    if (mv.x || mv.y) player.bob += dt * 14; else player.bob = 0;
    S.player.x = player.x; S.player.y = player.y;

    // stations
    const st = C.stations;
    let here = null;
    for (const id in st) {
      if (!stationOn(id)) continue;
      if (inRect(player.x, player.y, st[id], 10)) { here = id; break; }
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
    if (here === 'laundry' && S.carried.length && dropTimer <= 0) {
      launder(S.carried.pop(), st.laundry.x, st.laundry.y - 40);
      dropTimer = C.player.dropInterval;
      if (S.tutorial === 3 && !S.carried.length) S.tutorial = 4;
    }
    if (S.tutorial === 1 && S.garageBags.length) S.tutorial = 2;

    // buy zones and level pads
    let draining = false;
    for (const z of C.buyZones) {
      if (zoneBought(z.id) || !inRect(player.x, player.y, z, 0)) continue;
      draining = true;
      S.zones[z.id] = drain(dt, zoneCost(z), S.zones[z.id] || 0, () => {
        floater(z.x, z.y - 40, '✨ ' + RH.t('zone_' + z.id) + '!', '#7dffb2', 30);
        RH.UI.toast(`<div class="toast-emoji">${z.emoji}</div><div><div class="toast-head">${RH.t('zone_' + z.id)}</div><div>${RH.t('zoned_' + z.id)}</div></div>`, '#7dffb2');
      });
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
    if (!draining) drainAccum = 0;

    updateHelpers(dt);

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

  function drawFloor() {
    const { w, h } = C.world;
    const D = districtCfg();
    ctx.fillStyle = D.outside;
    ctx.fillRect(-400, -400, w + 800, h + 800);
    if (D.sea) {
      ctx.fillStyle = '#4fd3e6';
      ctx.fillRect(-400, h + 90, w + 800, 400);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = -400; i < w + 400; i += 80) {
        const yy = h + 90 + Math.sin(time * 2 + i * 0.05) * 6;
        ctx.fillRect(i, yy, 50, 6);
      }
    }
    [[-80, 100], [-90, 600], [w + 80, 120], [w + 70, 560], [w + 90, 900], [-70, 920]].forEach(([x, y]) => emoji(D.deco, x, y, 80));
    const tile = 100;
    for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) {
      ctx.fillStyle = ((x + y) / tile) % 2 ? D.tiles[0] : D.tiles[1];
      ctx.fillRect(x, y, tile, tile);
    }
    ctx.lineWidth = 10;
    ctx.strokeStyle = D.wall;
    ctx.shadowColor = D.wall;
    ctx.shadowBlur = 20;
    rr(0, 0, w, h, 24);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const glow = 0.75 + Math.sin(time * 3) * 0.25;
    ctx.globalAlpha = glow;
    text('RACCOON HQ', w / 2, 360, 46, '#3fd8d0', 900);
    ctx.globalAlpha = 1;
    text(D.emoji + ' ' + RH.t('district_' + D.id), w / 2, 402, 20, '#fff');
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
        RH.Sprites.draw(ctx, 'bag', '💰', s.x - 90 + col * 24, s.y + 55 - row * 22, 30);
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
    text('🪙 ' + RH.fmt(cost - paid), z.x, z.y + 22, 24, '#ffe35c');
    text(RH.t('zone_' + z.id), z.x, z.y + z.h / 2 + 14, 16, '#fff');
    text(RH.t('zoned_' + z.id), z.x, z.y + z.h / 2 + 34, 14, 'rgba(255,255,255,0.7)', 700);
  }

  function drawPad(p) {
    if (p.needs && !zoneBought(p.needs)) return;
    const cost = stats.padCost(p.id), paid = S.padPaid[p.id] || 0;
    drawDrainBox(p, paid, cost, 'rgba(255,227,92,0.6)');
    emoji('⬆️', p.x - 26, p.y - 16, 26);
    RH.Sprites.draw(ctx, 'st_' + p.id, p.emoji, p.x + 22, p.y - 16, 38);
    text('🪙 ' + RH.fmt(cost - paid), p.x, p.y + 22, 20, '#ffe35c');
    text(RH.t(p.id) + ' · ' + RH.t('lvl') + ' ' + padLv(p.id), p.x, p.y + p.h / 2 + 14, 15, '#fff');
    text(RH.t('padd_' + p.id), p.x, p.y + p.h / 2 + 32, 13, 'rgba(255,255,255,0.7)', 700);
  }

  // hat offsets relative to the raccoon sprite: width share and top shift (in sprite widths)
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
    const H = hatSprite && RH.Sprites.img(hatSprite);
    if (R && H) {
      const hw = rw * HAT_W, hh = hw * H.naturalHeight / H.naturalWidth;
      ctx.drawImage(H, x - hw / 2, top + rh * 54 / 210 - hh * 0.88, hw, hh);
    } else if (hat) emoji(hat, x, R ? top + rh * 0.06 : y + by - size * 0.55, size * 0.55);
    const n = stack.length;
    const shown = Math.min(n, 12);
    for (let i = 0; i < shown; i++) {
      RH.Sprites.draw(ctx, 'bag', '💰', x - face * size * 0.45, y + by - size * 0.15 - i * size * 0.26, size * 0.5);
    }
    if (n > 12) text('×' + n, x - face * size * 0.35, y + by - size * 0.25 - 12 * size * 0.26 - 6, 16, '#fff');
  }

  function drawCrew() {
    const hired = C.crew.filter((c) => crewLv(c.id) > 0);
    hired.forEach((c, i) => {
      const x = C.world.w / 2 - (hired.length - 1) * 45 + i * 90;
      const y = 460 + Math.sin(time * 2 + i) * 3;
      drawRaccoon(x, y, 40, i % 2 ? -1 : 1, 0, [], c.emoji, false, 'crew_' + c.id);
      text(RH.t('lvl') + ' ' + crewLv(c.id), x, y + 32, 13, '#fff');
    });
  }

  function drawTutorial() {
    const step = S.tutorial;
    if (step >= 5) return;
    const target = step === 0 ? C.stations.board : step <= 2 ? C.stations.garage : step === 3 ? C.stations.laundry : C.stations.workshop;
    if (step === 3 && !S.carried.length) return;
    if (step === 4 && S.coins < Math.min(...C.upgrades.slice(0, 6).map((u) => stats.upgradeCost(u.id)))) return;
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
    for (const id in C.stations) if (stationOn(id)) drawStation(id, C.stations[id]);
    drawCrew();
    helpers.forEach((hp) => drawRaccoon(hp.x, hp.y, 40, hp.face || 1, hp.bob, hp.carry, '🧢', false, 'hat_cap'));
    drawRaccoon(player.x, player.y, 56, player.face, player.bob, S.carried, hatEmoji(), true, 'hat_' + S.cosmetics.hat);
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
    cam.scale = Math.max(Math.min(W, H) / 760, H / 1120, W / 1520);
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
    init(c) {
      canvas = c;
      ctx = canvas.getContext('2d');
      S = RH.Save.load() || RH.Save.newState();
      if (S.lang) RH.lang = S.lang;
      player.x = S.player.x; player.y = S.player.y;
      syncHelpers();
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
      heistCache.d = 0;
      player.x = S.player.x; player.y = S.player.y;
      RH.Save.save(S);
    },
  };
})();
