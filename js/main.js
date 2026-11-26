// Boot + main loop.
(function () {
  const canvas = document.getElementById('game');
  let last = performance.now();
  let saveTimer = 0;
  let started = false;

  RH.Poki.init().then(() => {
    RH.Input.attach(canvas);
    const offlineCoins = RH.Game.init(canvas);
    RH.UI.init();
    RH.Poki.loadingFinished();
    document.getElementById('loading').remove();
    if (offlineCoins > 0) RH.UI.offlinePopup(offlineCoins);

    // gameplayStart on first interaction (also unlocks WebAudio)
    const start = () => {
      RH.Audio.unlock();
      if (!started) { started = true; RH.Poki.gameplayStart(); }
    };
    RH.Input.on('any', start);
    window.addEventListener('pointerdown', start, { once: false });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (!RH.skipUnloadSave) RH.Game.save(); RH.Poki.gameplayStop(); RH.Audio.setMuted(true, 'hidden'); }
      else { RH.Audio.setMuted(false, 'hidden'); if (started) RH.Poki.gameplayStart(); last = performance.now(); }
    });
    window.addEventListener('beforeunload', () => { if (!RH.skipUnloadSave) RH.Game.save(); });

    // debug helpers in console: RH.debug.coins(1e6) — dev build, or release with ?debug in the URL
    if (!window.RH_RELEASE || /[?&]debug\b/.test(location.search)) RH.debug = {
      coins: (n) => RH.Game.addCoins(n),
      heat: (n) => (RH.Game.S.heat = n),
      offline: (sec) => {
        RH.skipUnloadSave = true;
        const S = RH.Game.S;
        S.lastSeen = Date.now() - sec * 1000;
        localStorage.setItem(RH.CONFIG.saveKey, JSON.stringify(S));
        location.reload();
      },
    };

    requestAnimationFrame(loop);
  });

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!RH.Poki.inAd) {
      RH.Game.update(dt);
      saveTimer += dt;
      if (saveTimer >= RH.CONFIG.autosaveSec) { saveTimer = 0; RH.Game.save(); }
    }
    RH.Game.render();
    RH.UI.update();
    requestAnimationFrame(loop);
  }
})();
