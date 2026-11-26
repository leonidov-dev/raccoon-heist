// "Chase!" mini-game: 3 lanes, dodge cop cars, grab coins.
window.RH = window.RH || {};

RH.Chase = (function () {
  const C = RH.CONFIG.chase;
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  let st = null; // chase state
  let swipe = null;

  function begin(result, onDone) {
    st = {
      phase: 'intro', result, onDone,
      t: 0, lane: 1, laneX: 1, lives: RH.Game.stats.chaseLives(), coins: 0, objs: [], spawn: 0.8,
      scroll: 0, hitFlash: 0, speed: 1,
    };
    RH.UI.chaseIntro(
      () => { st.phase = 'run'; RH.Poki.gameplayStart(); },
      () => {
        RH.Poki.rewardedBreak().then((ok) => {
          if (ok) finish(true);
          else { st.phase = 'run'; }
        });
      }
    );
  }

  function move(dir) {
    if (!st || st.phase !== 'run') return;
    st.lane = Math.max(0, Math.min(2, st.lane + dir));
    RH.Audio.pick();
  }

  RH.Input.on('key', (e) => {
    if (RH.Game.mode !== 'chase') return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') move(1);
  });
  window.addEventListener('pointerdown', (e) => {
    if (RH.Game.mode !== 'chase' || !st || st.phase !== 'run') return;
    if (e.target.tagName !== 'CANVAS') return;
    swipe = { x: e.clientX, y: e.clientY, used: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!swipe || swipe.used) return;
    const dx = e.clientX - swipe.x;
    if (Math.abs(dx) > 40) { move(dx < 0 ? -1 : 1); swipe.used = true; }
  });
  window.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    if (!swipe.used) move(e.clientX < window.innerWidth / 2 ? -1 : 1);
    swipe = null;
  });

  function finish(success) {
    st.phase = 'result';
    const bonusCoins = Math.round(st.coins * st.result.bagValue * C.coinValueMul);
    if (success) RH.Audio.treasure(); else RH.Audio.hit();
    RH.UI.chaseResult(success, bonusCoins, st.result, () => {
      const cb = st.onDone;
      st = null;
      cb({ success, bonusCoins });
    });
  }

  function update(dt) {
    if (!st) return;
    st.laneX += (st.lane - st.laneX) * Math.min(1, dt * 14);
    st.hitFlash = Math.max(0, st.hitFlash - dt);
    if (st.phase !== 'run') return;
    st.t += dt;
    st.speed = 1 + st.t / C.duration * 0.8;
    st.scroll += dt * 600 * st.speed;
    st.spawn -= dt;
    if (st.spawn <= 0 && st.t < C.duration - 1) {
      st.spawn = 0.75 / st.speed;
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      const cops = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < cops; i++) st.objs.push({ lane: lanes[i], y: -0.1, type: 'cop' });
      if (Math.random() < 0.7) st.objs.push({ lane: lanes[2], y: -0.1 - Math.random() * 0.15, type: 'coin' });
    }
    const playerY = 0.82;
    for (let i = st.objs.length - 1; i >= 0; i--) {
      const o = st.objs[i];
      o.y += dt * 0.55 * st.speed;
      if (!o.hit && Math.abs(o.y - playerY) < 0.06 && Math.abs(o.lane - st.laneX) < 0.5) {
        o.hit = true;
        if (o.type === 'cop') {
          st.lives--;
          st.hitFlash = 0.4;
          RH.Audio.hit();
          if (st.lives <= 0) { finish(false); return; }
        } else {
          st.coins++;
          RH.Audio.coin();
        }
      }
      if (o.y > 1.1 || (o.hit && o.type === 'coin')) st.objs.splice(i, 1);
    }
    if (st.t >= C.duration) finish(true);
  }

  function emoji(ctx, e, x, y, size) {
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
  }

  function render(ctx, W, H, time) {
    ctx.fillStyle = '#2a1b47';
    ctx.fillRect(0, 0, W, H);
    if (!st) return;
    const rw = Math.min(W * 0.92, 460);
    const rx = (W - rw) / 2;
    const lw = rw / 3;
    // sidewalks with palms / neon
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(0, 0, rx, H);
    ctx.fillRect(rx + rw, 0, W - rx - rw, H);
    const off = st.scroll % 160;
    for (let y = -160; y < H + 160; y += 160) {
      emoji(ctx, '🌴', rx - 30, y + off, 44);
      emoji(ctx, (y / 160) % 2 ? '🏪' : '🌴', rx + rw + 30, y + off + 80, 44);
    }
    // road
    ctx.fillStyle = '#3d3d55';
    ctx.fillRect(rx, 0, rw, H);
    ctx.fillStyle = '#ffe35c';
    const doff = st.scroll % 80;
    for (let l = 1; l < 3; l++) for (let y = -80; y < H; y += 80) ctx.fillRect(rx + lw * l - 3, y + doff, 6, 40);
    // objects
    const size = Math.min(lw * 0.75, 70);
    st.objs.forEach((o) => {
      if (o.hit && o.type === 'cop') ctx.globalAlpha = 0.4;
      const ox = rx + lw * (o.lane + 0.5), oy = o.y * H;
      if (o.type === 'cop') {
        RH.Sprites.draw(ctx, 'police_car', '🚓', ox, oy, size * 1.25);
        RH.Sprites.draw(ctx, 'cop', null, ox, oy - size * 0.5, size * 0.62);
      } else RH.Sprites.draw(ctx, 'coin', '🪙', ox, oy, size * 0.55);
      ctx.globalAlpha = 1;
    });
    // player car (pointing up)
    const px = rx + lw * (st.laneX + 0.5), py = 0.82 * H;
    if (!(st.hitFlash > 0 && Math.floor(time * 20) % 2)) {
      ctx.save();
      ctx.translate(px, py);
      RH.Sprites.draw(ctx, 'van_' + RH.Game.S.cosmetics.van, RH.Game.vanEmoji(), 0, 0, size * 1.25);
      RH.Sprites.draw(ctx, 'raccoon', '🦝', 0, -size * 0.5, size * 0.62);
      ctx.restore();
    }
    // siren glow
    ctx.fillStyle = Math.floor(time * 4) % 2 ? 'rgba(255,60,80,0.10)' : 'rgba(60,120,255,0.10)';
    ctx.fillRect(0, 0, W, H);
    // HUD
    const left = Math.max(0, C.duration - st.t);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(rx, 12, rw, 14);
    ctx.fillStyle = '#7dffb2';
    ctx.fillRect(rx, 12, rw * (left / C.duration), 14);
    ctx.font = '900 26px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText('❤️'.repeat(Math.max(0, st.lives)), rx + 4, 48);
    ctx.textAlign = 'right';
    ctx.fillText(String(st.coins), rx + rw - 4, 48);
    const cw = ctx.measureText(String(st.coins)).width;
    RH.Sprites.draw(ctx, 'coin', '🪙', rx + rw - 4 - cw - 18, 39, 28);
    if (st.phase === 'run' && st.t < 1.5) {
      ctx.textAlign = 'center';
      ctx.font = '900 30px "Trebuchet MS", sans-serif';
      ctx.fillText('⬅️  ➡️', W / 2, H * 0.5);
    }
  }

  return { begin, update, render, get active() { return !!st; }, get state() { return st; } };
})();
