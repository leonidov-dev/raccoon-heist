// DOM UI: HUD, station panels, modals, toasts, city mini-map.
window.RH = window.RH || {};

RH.UI = (function () {
  const C = RH.CONFIG;
  const $ = (s) => document.querySelector(s);
  const t = (k) => RH.t(k);
  const G = () => RH.Game;

  let panelId = null;
  let suppressed = null;     // station whose panel the player closed while standing in it
  let sig = '';
  let modal = null;
  let mini, mctx;

  // ---------- panels ----------
  const STATION_PANELS = ['board', 'workshop', 'display', 'market', 'crew'];
  const PANEL_ICONS = { album: 'album', wardrobe: 'hat_sunhat' };

  function onStation(id) {
    if (id !== suppressed) suppressed = null;
    if (id && STATION_PANELS.includes(id) && id !== suppressed) open(id);
    else if (panelId && STATION_PANELS.includes(panelId)) close();
  }

  function open(id) {
    panelId = id;
    sig = '';
    $('#panel').classList.add('open');
    const icon = RH.Sprites.html(PANEL_ICONS[id] || 'st_' + id, C.stations[id] ? C.stations[id].emoji : '');
    $('#panel-title').innerHTML = icon + ' ' + t(id);
    refresh(true);
  }
  function close(user) {
    if (user && panelId && STATION_PANELS.includes(panelId)) suppressed = panelId;
    panelId = null;
    $('#panel').classList.remove('open');
  }

  const COIN = () => RH.Sprites.html('coin', '🪙');
  const coinBtn = (ok, act, id, cost, label = '') =>
    `<button class="btn ${label ? 'two ' : ''}${ok ? 'buy' : 'off'}" data-act="${act}" data-id="${id}">${label ? `<small>${label}</small>` : ''}<span>${COIN()} ${RH.fmt(cost)}</span></button>`;

  function heistRow(h) {
    const s = G().stats, S = G().S;
    const unlocked = S.heistsUnlocked[h.id];
    const freeGang = S.gangs.some((g) => !g.target);
    const info = `<div class="row-sub">⏱ ${RH.fmtTime(s.heistTime(h))} · ${RH.Sprites.html('h_' + h.id, h.emoji)} ${s.heistBags(h)} × ${COIN()}${RH.fmt(h.bagValue)} · 🚨 +${Math.round(s.heistNoise(h))}% · 💎 ${Math.round(s.treasureChance(h) * 100)}%</div>`;
    let btn;
    if (!unlocked) btn = coinBtn(S.coins >= h.unlock, 'unlock', h.id, h.unlock, '🔓 ' + t('unlockFor'));
    else btn = `<button class="btn ${freeGang ? 'go' : 'off'}" data-act="send" data-id="${h.id}">${freeGang ? t('send') : t('busy')}</button>`;
    return `<div class="row ${unlocked ? '' : 'locked'}"><div class="row-icon">${RH.Sprites.html('h_' + h.id, h.emoji)}</div><div class="row-main"><div class="row-title">${t('heist_' + h.id)}</div>${info}</div>${btn}</div>`;
  }

  function gangRow(g, i) {
    const S = G().S;
    const loader = S.upgrades.loader > 0;
    const rep = `<button class="chip ${g.repeat ? 'on' : ''} ${loader ? '' : 'off'}" data-act="repeat" data-id="${i}">🔁 ${t('repeat')}${loader ? '' : ' 🔒'}</button>`;
    if (!g.target) return `<div class="gang"><span>${RH.Sprites.html('raccoon', '🦝')} ${t('gang')} ${i + 1}</span><span class="muted">${t('idle')}</span>${rep}</div>`;
    const h = G().heistCfg(g.target);
    return `<div class="gang"><span>${h ? RH.Sprites.html('h_' + h.id, h.emoji) : '❔'} ${t('gang')} ${i + 1}</span><div class="bar"><div class="bar-fill" data-gang="${i}"></div></div><span class="gang-time" data-gang-time="${i}"></span>${rep}<button class="chip ad" data-act="instant" data-id="${i}">📺 ${t('instant')}</button></div>`;
  }

  // all districts: travel to unlocked ones, unlock the next one
  function districtsBlock() {
    const S = G().S, s = G().stats;
    let html = `<div class="move"><div class="move-title">🗺️ ${t('districtsTitle')}</div><div class="row-sub">${t('travelHint')}</div>`;
    C.districts.forEach((d, i) => {
      const n = i + 1;
      if (n > S.maxDistrict + 1) return;
      const name = `${d.emoji} ${t('district_' + d.id)}`;
      if (n === S.district) html += `<div class="drow here"><span>${name}</span><span class="chip on">📍 ${t('here')}</span></div>`;
      else if (n <= S.maxDistrict) html += `<div class="drow"><span>${name}</span><button class="chip go" data-act="travel" data-id="${n}">🚚 ${t('travel')}</button></div>`;
      else {
        const ready = s.canMoveDistrict(), cost = s.moveCost();
        html += `<div class="drow locked"><span>🔒 ${name}</span></div>
          <div class="row-sub">${t('moveReset')}</div>
          <div class="move-bonus">⭐ ${t('moveBonus')} +${Math.round(C.district.repBonus * S.maxDistrict * 100)}%</div>
          ${ready ? coinBtn(S.coins >= cost, 'move', n, cost, '🚚 ' + t('moveBtn'))
            : `<div class="move-need">🔒 ${S.district !== S.maxDistrict ? t('moveFromLast') : t('moveNeed')}</div>`}`;
      }
    });
    if (S.maxDistrict >= C.districts.length) html += `<div class="row-sub">🏁 ${t('moveLast')}</div>`;
    return html + '</div>';
  }

  function levelRow(icon, title, lv, desc, act, id, cost, maxed) {
    const S = G().S;
    const btn = maxed ? `<button class="btn off">${t('max')}</button>` : coinBtn(S.coins >= cost, act, id, cost);
    const lvTag = `<span class="lvl">${t('lvl')} ${lv}</span>`;
    return `<div class="row"><div class="row-icon">${icon}</div><div class="row-main"><div class="row-title">${title} ${lvTag}</div><div class="row-sub">${desc}</div></div>${btn}</div>`;
  }

  const UP_ICON = { car: 'van_van', bigBags: 'bag', gang: 'raccoon', cashier: 'st_laundry' };

  function upgradeRows() {
    const S = G().S, s = G().stats;
    const price = (u) => (S.upgrades[u.id] >= u.max ? Infinity : s.upgradeCost(u.id));
    return C.upgrades.slice().sort((a, b) => price(a) - price(b))
      .map((u) => levelRow(RH.Sprites.html(UP_ICON[u.id] || 'up_' + u.id, u.emoji), t('up_' + u.id), S.upgrades[u.id], t('upd_' + u.id), 'upgrade', u.id, s.upgradeCost(u.id), S.upgrades[u.id] >= u.max)).join('');
  }
  function crewRows() {
    const S = G().S, s = G().stats;
    return `<div class="legend">${t('crewHint')}</div>` + C.crew.map((c) => {
      const cr = S.crew[c.id] || { a: 0, b: 0 };
      const head = `<div class="row-icon">${RH.Sprites.raccoonHtml('crew_' + c.id)}</div>`;
      if (!cr.a) {
        const cost = s.crewCost(c.id, 'a');
        return `<div class="crew-card"><div class="row">${head}<div class="row-main"><div class="row-title">${t('crew_' + c.id)} <span class="lvl off">${t('notHired')}</span></div><div class="row-sub">${t('crewrole_' + c.id)}</div></div>${coinBtn(S.coins >= cost, 'crew', c.id + ':a', cost, t('hire'))}</div></div>`;
      }
      const skill = (k) => {
        const lv = cr[k], maxed = s.crewMaxed(c.id, k), cost = s.crewCost(c.id, k);
        const btn = maxed ? `<button class="btn off">${t('max')}</button>` : coinBtn(S.coins >= cost, 'crew', c.id + ':' + k, cost);
        return `<div class="skill"><div class="row-main"><div class="row-title">${t('crew' + k + '_' + c.id)} <span class="lvl">${t('lvl')} ${lv}</span></div><div class="row-sub">${t('crew' + k + 'd_' + c.id)}</div></div>${btn}</div>`;
      };
      return `<div class="crew-card"><div class="row">${head}<div class="row-main"><div class="row-title">${t('crew_' + c.id)}</div><div class="row-sub">${t('crewrole_' + c.id)}</div></div></div>${skill('a')}${skill('b')}</div>`;
    }).join('');
  }

  function treasureCard(tr, extra = '') {
    const S = G().S, s = G().stats;
    const owned = S.collection[tr.id] || 0;
    const r = C.rarities[tr.rarity];
    const stars = s.stars(tr.id);
    return `<div class="card ${owned ? '' : 'unknown'}" style="--rc:${r.color}">
      <div class="card-emoji">${RH.Sprites.html('t_' + tr.id, tr.emoji)}</div>
      <div class="card-name">${owned ? t('t_' + tr.id) : '???'}</div>
      <div class="card-stars">${owned ? '★'.repeat(stars) + '<span class="dim">' + '★'.repeat(5 - stars) + '</span>' : `<span style="color:${r.color}">${t('r_' + r.id)}</span>`}</div>
      ${owned ? `<div class="card-inc">+${RH.fmt(s.treasureIncome(tr.id))}${t('perSec')} · ×${owned}</div>` : ''}
      ${extra}</div>`;
  }

  function oddsLine(weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    return C.rarities.map((r, i) => `<span style="color:${r.color}">${t('r_' + r.id)} ${Math.round(weights[i] / sum * 100)}%</span>`).join(' · ');
  }

  function cosmeticGrid(kind) {
    const S = G().S;
    const key = kind === 'hats' ? 'hat' : 'van';
    return `<div class="grid">` + C.cosmetics[kind].map((c) => {
      const owned = S.cosmetics[kind].includes(c.id);
      const worn = S.cosmetics[key] === c.id;
      const btn = worn ? `<button class="chip on">✓ ${t('equipped')}</button>`
        : owned ? `<button class="chip" data-act="cosm" data-kind="${kind}" data-id="${c.id}">${t('equip')}</button>`
        : `<button class="chip ${S.coins >= c.cost ? 'buyc' : 'off'}" data-act="cosm" data-kind="${kind}" data-id="${c.id}">${COIN()} ${RH.fmt(c.cost)}</button>`;
      const spr = (kind === 'hats' ? 'hat_' : 'van_') + c.id;
      return `<div class="card" style="--rc:${worn ? '#7dffb2' : '#554a6e'}"><div class="card-emoji">${RH.Sprites.html(spr, c.emoji)}</div><div class="card-name">${t('cos_' + c.id)}</div>${btn}</div>`;
    }).join('') + `</div>`;
  }

  function panelSig() {
    const S = G().S, s = G().stats;
    const base = RH.lang + '|' + panelId + '|' + S.district + '|';
    const afford = (c) => (S.coins >= c ? 1 : 0);
    if (panelId === 'board') return base + S.gangs.map((g) => (g.target || '-') + g.repeat).join() + '|' + S.upgrades.loader + '|' +
      G().heists().map((h) => (S.heistsUnlocked[h.id] ? 1 : 0) + '' + afford(h.unlock) + Math.round(s.heistTime(h)) + s.heistBags(h)).join() +
      '|' + afford(s.moveCost()) + s.canMoveDistrict() + S.maxDistrict;
    if (panelId === 'workshop') return base + C.upgrades.map((u) => S.upgrades[u.id] + ':' + afford(s.upgradeCost(u.id))).join();
    if (panelId === 'crew') return base + C.crew.map((c) => JSON.stringify(S.crew[c.id] || 0) + afford(s.crewCost(c.id, 'a')) + afford(s.crewCost(c.id, 'b'))).join();
    if (panelId === 'display') return base + S.displaySlots.join() + '|' + JSON.stringify(S.collection) + '|' + afford(s.slotCost() || Infinity);
    if (panelId === 'album') return base + JSON.stringify(S.collection);
    if (panelId === 'market') return base + S.marketBuys + afford(s.marketPrice(false)) + afford(s.marketPrice(true)) + Object.keys(S.collection).length;
    if (panelId === 'wardrobe') return base + JSON.stringify(S.cosmetics) + C.cosmetics.hats.concat(C.cosmetics.vans).map((c) => afford(c.cost)).join('');
    return base;
  }

  function buildPanel() {
    const S = G().S, s = G().stats;
    let html = '';
    if (panelId === 'board') {
      html += `<div class="gangs">${S.gangs.map(gangRow).join('')}</div>`;
      html += `<div class="legend">${t('legend')}</div>`;
      html += G().heists().map(heistRow).join('');
      if (S.tutorial >= 6) html += districtsBlock();
    } else if (panelId === 'workshop') {
      html += upgradeRows();
    } else if (panelId === 'crew') {
      html += crewRows();
    } else if (panelId === 'display') {
      html += `<div class="slots">` + S.displaySlots.map((id, i) => {
        if (!id) return `<div class="slot empty">${t('emptySlot')}</div>`;
        const tr = C.treasures.find((x) => x.id === id);
        return `<div class="slot" style="--rc:${C.rarities[tr.rarity].color}"><div class="card-emoji">${RH.Sprites.html('t_' + tr.id, tr.emoji)}</div><div class="card-inc">+${RH.fmt(s.treasureIncome(id))}${t('perSec')}</div><button class="chip" data-act="remove" data-id="${i}">${t('remove')}</button></div>`;
      }).join('') + `</div>`;
      const cost = s.slotCost();
      if (cost != null) html += `<button class="btn wide ${S.coins >= cost ? 'buy' : 'off'}" data-act="slot">➕ ${t('buySlot')} ${COIN()} ${RH.fmt(cost)}</button>`;
      const owned = C.treasures.filter((tr) => S.collection[tr.id] && !S.displaySlots.includes(tr.id));
      if (!Object.keys(S.collection).length) html += `<div class="empty-note">${t('noTreasures')}</div>`;
      else html += `<div class="grid">` + owned.map((tr) => treasureCard(tr, `<button class="chip" data-act="place" data-id="${tr.id}">${t('place')}</button>`)).join('') + `</div>`;
    } else if (panelId === 'market') {
      const p1 = s.marketPrice(false), p2 = s.marketPrice(true);
      const D = G().districtCfg();
      html += `<div class="legend">${t('marketHint')} ${t('marketPool')} ${D.emoji} ${t('district_' + D.id)}.</div>`;
      html += `<div class="row"><div class="row-icon">${RH.Sprites.html('chest', '🎁')}</div><div class="row-main"><div class="row-title">${t('chestSmall')}</div><div class="row-sub odds">${oddsLine(C.market.rarity)}</div></div>${coinBtn(S.coins >= p1, 'chest', 'small', p1)}</div>`;
      html += `<div class="row"><div class="row-icon">${RH.Sprites.html('chest_big', '🧰')}</div><div class="row-main"><div class="row-title">${t('chestBig')}</div><div class="row-sub odds">${oddsLine(C.market.bigRarity)}</div></div>${coinBtn(S.coins >= p2, 'chest', 'big', p2)}</div>`;
      html += `<div class="album-count">📖 ${Object.keys(S.collection).length} / ${C.treasures.length}</div>`;
    } else if (panelId === 'wardrobe') {
      html += `<div class="legend">${t('wardrobeHint')}</div>`;
      html += `<div class="section">🎩 ${t('hats')}</div>` + cosmeticGrid('hats');
      html += `<div class="section">🚐 ${t('vans')}</div>` + cosmeticGrid('vans');
    } else if (panelId === 'album') {
      const n = Object.keys(S.collection).length;
      html += `<div class="album-count">${n} / ${C.treasures.length}</div>`;
      C.districts.forEach((d, i) => {
        const open = i < S.maxDistrict;
        html += `<div class="section">${d.emoji} ${t('district_' + d.id)}${open ? '' : ' 🔒'}</div>`;
        html += `<div class="grid">` + C.treasures.filter((tr) => tr.d === i).map((tr) => treasureCard(tr)).join('') + `</div>`;
      });
      html += `<button class="btn wide danger" data-act="reset">🗑 ${t('reset')}</button>`;
    }
    $('#panel-body').innerHTML = html;
  }

  function refresh(force) {
    if (!panelId) return;
    const s = panelSig();
    if (force || s !== sig) { sig = s; buildPanel(); }
    if (panelId === 'board') {
      G().S.gangs.forEach((g, i) => {
        const bar = document.querySelector(`[data-gang="${i}"]`);
        const tm = document.querySelector(`[data-gang-time="${i}"]`);
        if (bar && g.target) bar.style.width = Math.min(100, (g.t / g.dur) * 100) + '%';
        if (tm && g.target) tm.textContent = RH.fmtTime(g.dur - g.t);
      });
    }
  }

  function confirmMove() {
    const S = G().S;
    const next = C.districts[S.maxDistrict];
    showModal(`<div class="m-emoji">🚚${next.emoji}</div><h2>${t('moveTitle')}: ${t('district_' + next.id)}</h2>
      <p>✅ ${t('moveKeep')}</p><p>🆕 ${t('moveReset')}</p>
      <div class="m-big">⭐ +${Math.round(C.district.repBonus * S.maxDistrict * 100)}%</div><p>${t('moveBonus')}</p>
      <div class="m-btns"><button class="btn off" data-m="no">${t('cancel')}</button><button class="btn go" data-m="yes">🚚 ${t('moveBtn')}</button></div>`, {
      no: hideModal,
      yes: () => {
        hideModal();
        if (G().actions.moveDistrict()) {
          close();
          toast(`<div class="toast-emoji">${next.emoji}</div><div><div class="toast-head">${t('district_' + next.id)}</div><div>${t('moveDone')}</div></div>`, '#7dffb2');
        }
      },
    });
  }

  function onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const A = G().actions, id = b.dataset.id;
    switch (b.dataset.act) {
      case 'send': A.sendGang(id); break;
      case 'unlock': A.unlockHeist(id); break;
      case 'upgrade': A.buyUpgrade(id); break;
      case 'crew': { const [cid, sk] = id.split(':'); A.buyCrew(cid, sk); break; }
      case 'travel': {
        const d = +id, D = C.districts[d - 1];
        const coins = A.travel(d);
        if (coins != null) {
          close();
          toast(`<div class="toast-emoji">${D.emoji}</div><div><div class="toast-head">${t('district_' + D.id)}</div><div>${coins > 0 ? t('awayDistrict') + ' ' + RH.Sprites.html('coin', '🪙') + ' ' + RH.fmt(coins) : t('travelDone')}</div></div>`, '#7dffb2');
        }
        break;
      }
      case 'repeat':
        if (G().S.upgrades.loader < 1) toast('🔒 ' + t('repeatLocked'));
        A.toggleRepeat(+id);
        break;
      case 'instant': A.instantFinish(+id); break;
      case 'place': A.placeTreasure(id); break;
      case 'remove': A.removeTreasure(+id); break;
      case 'slot': A.buySlot(); break;
      case 'chest': A.buyChest(id === 'big'); break;
      case 'cosm': A.buyCosmetic(b.dataset.kind, id); break;
      case 'move': if (G().S.coins >= G().stats.moveCost()) confirmMove(); else RH.Audio.deny(); break;
      case 'reset':
        if (confirm(t('resetConfirm'))) { G().reset(); location.reload(); }
        break;
    }
    if (panelId) refresh(true);
  }

  // ---------- modals ----------
  function showModal(html, handlers) {
    modal = true;
    const m = $('#modal');
    m.innerHTML = `<div class="modal-box">${html}</div>`;
    m.classList.add('open');
    m.onclick = (e) => {
      const b = e.target.closest('[data-m]');
      if (b && handlers[b.dataset.m]) handlers[b.dataset.m]();
    };
    RH.Input.resetJoystick();
  }
  function hideModal() {
    modal = null;
    $('#modal').classList.remove('open');
    $('#modal').innerHTML = '';
  }

  function offlinePopup(coins) {
    const give = (mul) => { G().addCoins(coins * mul); hideModal(); RH.Audio.buy(); };
    showModal(`<div class="m-emoji">🦝💰</div><h2>${t('awayTitle')}</h2><p>${t('awayText')}</p>
      <div class="m-big">🪙 ${RH.fmt(coins)}</div>
      <div class="m-btns"><button class="btn buy" data-m="x1">${t('collect')}</button><button class="btn go ad" data-m="x2">📺 ${t('double')}</button></div>`, {
      x1: () => give(1),
      x2: () => RH.Poki.rewardedBreak().then((ok) => give(ok ? 2 : 1)),
    });
  }

  function chaseIntro(onGo, onTunnel) {
    close();
    showModal(`<div class="m-emoji siren">🚨🚓🚨</div><h2>${t('chaseTitle')}</h2><p>${t('chaseText')}</p>
      <div class="m-btns"><button class="btn go" data-m="go">${RH.Sprites.html('van_' + G().S.cosmetics.van, G().vanEmoji())} ${t('chaseGo')}</button><button class="btn buy ad" data-m="tunnel">📺 ${t('tunnel')}</button></div>`, {
      go: () => { hideModal(); onGo(); },
      tunnel: () => { hideModal(); onTunnel(); },
    });
  }

  function chaseResult(success, bonusCoins, result, onOk) {
    const bags = success ? result.bags : Math.ceil(result.bags * (1 - C.chase.failLoss));
    showModal(`<div class="m-emoji">${success ? '😎🦝' : '😵🚓'}</div><h2>${success ? t('chaseWin') : t('chaseFail')}</h2>
      <div class="m-big">💰 ×${bags}${success ? ` <small>(+${Math.round(C.chase.successBonus * 100)}%)</small>` : ''}</div>
      ${bonusCoins ? `<p>${t('chaseBonus')}: 🪙 ${RH.fmt(bonusCoins)}</p>` : ''}
      <div class="m-btns"><button class="btn go" data-m="ok">${t('ok')}</button></div>`, {
      ok: () => { hideModal(); onOk(); },
    });
  }

  // ---------- toasts ----------
  function toast(html, color) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (color) el.style.setProperty('--rc', color);
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }
  function treasureToast(tr, isNew, starUp) {
    const r = C.rarities[tr.rarity];
    const head = isNew ? t('newTreasure') : starUp ? t('dupTreasure') : '+1';
    toast(`<div class="toast-emoji">${RH.Sprites.html('t_' + tr.id, tr.emoji)}</div><div><div class="toast-head">${head}</div><div>${t('t_' + tr.id)} <span style="color:${r.color}">· ${t('r_' + r.id)}</span></div></div>`, r.color);
  }

  // ---------- HUD ----------
  function updateHud() {
    const S = G().S, s = G().stats;
    $('#coins').textContent = RH.fmt(S.coins);
    const inc = s.displayIncome();
    $('#income').textContent = inc ? '+' + RH.fmt(inc) + t('perSec') : '';
    const heat = S.heat / C.heat.max;
    $('#heat-fill').style.width = heat * 100 + '%';
    $('#heat-pct').textContent = Math.round(heat * 100) + '%';
    if (!S.tips) S.tips = {};
    if (!S.tips.heat && heat >= 0.3) { S.tips.heat = 1; toast('🚨 ' + t('heatTip')); }
    if (!S.tips.map && S.gangs.some((g) => g.target)) { S.tips.map = 1; toast('🗺️ ' + t('mapTip')); }
    if (!S.tips.move && s.canMoveDistrict()) { S.tips.move = 1; toast('🚚 ' + t('moveTip'), '#7dffb2'); }
    $('#heat').classList.toggle('hot', heat > 0.8);
    const now = Date.now();
    const chestLeft = (S.chestReadyAt - now) / 1000;
    const cb = $('#btn-chest');
    cb.classList.toggle('ready', chestLeft <= 0);
    cb.querySelector('.sub').textContent = chestLeft > 0 ? RH.fmtTime(chestLeft) : '📺';
    const boostLeft = (S.boostUntil - now) / 1000;
    const bb = $('#btn-boost');
    bb.classList.toggle('active', boostLeft > 0);
    bb.querySelector('.sub').textContent = boostLeft > 0 ? RH.fmtTime(boostLeft) : '📺';
    $('#btn-sound').textContent = RH.Audio.userMuted ? '🔇' : '🔊';
    $('#btn-lang').textContent = RH.lang.toUpperCase();

    updateTutorial();

    $('#hud').style.display = G().mode === 'chase' ? 'none' : '';
    drawMinimap();
  }

  // ---------- step-by-step tutorial ----------
  // 0 board (press Go!) → 1 wait for the gang → 2 take loot in the stash → 3 put it on its stall
  // → 4 take money at the register → 5 buy an upgrade → 6 done
  let tutDomTarget = null;
  function tutorialPointer() {
    const S = G().S, step = S.tutorial;
    if (step === 0 && panelId === 'board') return document.querySelector(`[data-act="send"][data-id="${G().heists()[0].id}"]`);
    if (step === 5 && panelId === 'workshop') return document.querySelector('[data-act="upgrade"].buy');
    return null;
  }
  function updateTutorial() {
    const S = G().S, s = G().stats, step = S.tutorial;
    const th = $('#tut-hint');
    let hint = '';
    if (step === 0) hint = panelId === 'board' ? t('tut_send') : t('tut_board');
    else if (step === 1) {
      const g = S.gangs.find((x) => x.target);
      hint = S.garageBags.length || !g ? t('tut_garage') : t('tut_wait') + ' ' + RH.fmtTime(g.dur - g.t);
    } else if (step === 2) hint = t('tut_garage');
    else if (step === 3) hint = S.carried.length ? t('tut_stall') : t('tut_garage');
    else if (step === 4) hint = G().queueLength() ? t('tut_register') : t('tut_wait_buyer');
    else if (step === 5) {
      const min = Math.min(...C.upgrades.slice(0, 6).map((u) => s.upgradeCost(u.id)));
      hint = S.coins < min ? t('tut_more_money') : panelId === 'workshop' ? t('tut_buy') : t('tut_workshop');
    }
    if (step >= 6 && !S.tips.tutDone) {
      S.tips.tutDone = 1;
      showModal(`<div class="m-emoji">🦝🎉</div><h2>${t('tutDoneTitle')}</h2><p>${t('tutDoneText')}</p>
        <div class="tut-goals"><div>🔓 ${t('tutGoal1')}</div><div>📦 ${t('tutGoal2')}</div><div>🏆 ${t('tutGoal3')}</div></div>
        <div class="m-btns"><button class="btn go" data-m="ok">${t('tutDoneBtn')}</button></div>`, { ok: hideModal });
    }
    const show = hint && G().mode === 'hideout' && !modal;
    const html = step < 6 ? `<span class="tut-num">${step + 1}/6</span>${hint}` : hint;
    if (th.innerHTML !== html) th.innerHTML = html;
    th.style.display = show ? '' : 'none';

    // finger on the button to press inside a panel
    const el = show ? tutorialPointer() : null;
    if (tutDomTarget && tutDomTarget !== el) tutDomTarget.classList.remove('tut-pulse');
    tutDomTarget = el;
    const f = $('#tut-finger');
    if (el) {
      el.classList.add('tut-pulse');
      const r = el.getBoundingClientRect();
      f.style.left = r.left + r.width / 2 + 'px';
      f.style.top = r.bottom - 6 + 'px';
      f.style.display = 'block';
    } else f.style.display = 'none';
  }

  function drawMinimap() {
    const S = G().S;
    const list = G().heists();
    const w = mini.width, h = mini.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = 'rgba(30,15,60,0.75)';
    mctx.beginPath();
    mctx.roundRect ? mctx.roundRect(0, 0, w, h, 14) : mctx.rect(0, 0, w, h);
    mctx.fill();
    const y = h * 0.5, x0 = 30, x1 = w - 22;
    mctx.strokeStyle = '#3fd8d0';
    mctx.lineWidth = 4;
    mctx.beginPath(); mctx.moveTo(x0, y); mctx.lineTo(x1, y); mctx.stroke();
    const posOf = (i) => x0 + ((i + 1) / list.length) * (x1 - x0);
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    mctx.font = '22px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    mctx.fillText('🏠', x0, y - 2);
    list.forEach((hc, i) => {
      mctx.globalAlpha = S.heistsUnlocked[hc.id] ? 1 : 0.3;
      RH.Sprites.draw(mctx, 'h_' + hc.id, hc.emoji, posOf(i), y - 16, 26);
    });
    mctx.globalAlpha = 1;
    mctx.textAlign = 'left';
    mctx.font = '800 12px "Trebuchet MS", sans-serif';
    mctx.fillStyle = 'rgba(255,255,255,0.75)';
    const D = G().districtCfg();
    mctx.fillText('🗺️ ' + t('cityMap') + ': ' + t('district_' + D.id), 10, h - 9);
    mctx.textAlign = 'center';
    mctx.font = '18px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    const van = G().vanEmoji();
    S.gangs.forEach((g, gi) => {
      if (!g.target) return;
      const i = list.findIndex((x) => x.id === g.target);
      if (i < 0) return;
      const p = g.t / g.dur;
      const k = p < 0.5 ? p * 2 : (1 - p) * 2;
      const x = x0 + (posOf(i) - x0) * k;
      mctx.save();
      mctx.translate(x, y + 4 + gi * 3);
      if (p >= 0.5) mctx.scale(-1, 1);
      RH.Sprites.draw(mctx, 'van_' + S.cosmetics.van, van, 0, 0, 30);
      mctx.restore();
    });
  }

  function applyLang() {
    document.documentElement.lang = RH.lang;
    $('#heat-label').innerHTML = RH.Sprites.html('siren', '🚨') + ' ' + t('heat');
    $('#btn-album .hlabel').textContent = t('album');
    $('#btn-wardrobe .hlabel').textContent = t('wardrobe');
    $('#btn-chest .hlabel').textContent = t('lblChest');
    $('#btn-boost .hlabel').textContent = t('lblBoost');
    sig = '';
    if (panelId) open(panelId);
  }

  function init() {
    mini = $('#minimap');
    $('#money .coin').innerHTML = RH.Sprites.html('coin', '🪙');
    [['#btn-album', 'album', '📖'], ['#btn-wardrobe', 'hat_sunhat', '👒'], ['#btn-chest', 'chest', '🎁'], ['#btn-boost', 'boost', '⚡']].forEach(([sel, spr, e]) => {
      const b = $(sel);
      b.firstChild.nodeType === 3 ? b.firstChild.replaceWith(document.createRange().createContextualFragment(RH.Sprites.html(spr, e))) : null;
    });
    mctx = mini.getContext('2d');
    $('#panel-close').addEventListener('click', () => close(true));
    $('#panel-body').addEventListener('click', onPanelClick);
    $('#btn-album').addEventListener('click', () => (panelId === 'album' ? close() : open('album')));
    $('#btn-wardrobe').addEventListener('click', () => (panelId === 'wardrobe' ? close() : open('wardrobe')));
    $('#btn-chest').addEventListener('click', () => G().actions.openChest());
    $('#btn-boost').addEventListener('click', () => G().actions.startBoost());
    $('#btn-sound').addEventListener('click', () => RH.Audio.toggle());
    $('#heat').addEventListener('click', () => toast('🚨 ' + t('heatTip')));
    $('#minimap').addEventListener('click', () => toast('🗺️ ' + t('mapTip')));
    $('#btn-lang').addEventListener('click', () => {
      RH.lang = RH.lang === 'ru' ? 'en' : 'ru';
      G().S.lang = RH.lang;
      applyLang();
    });
    // keep UI taps from starting the joystick / chase taps
    ['#hud', '#panel', '#modal'].forEach((s) => $(s).addEventListener('pointerdown', (e) => e.stopPropagation()));
    applyLang();
  }

  return {
    init,
    onStation,
    update() { updateHud(); refresh(false); },
    modalOpen: () => !!modal || RH.Poki.inAd,
    offlinePopup,
    chaseIntro,
    chaseResult,
    treasureToast,
    toast,
  };
})();
