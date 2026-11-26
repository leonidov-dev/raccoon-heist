// Poki SDK wrapper.
// Dev (index.html as is): mock SDK with fake ad overlays, logs to console.
// Release (built by tools/build.py): window.RH_RELEASE = true and the real Poki SDK script is loaded.
// If the real SDK is blocked (adblock), ads silently do nothing and rewarded ads give no reward.
// Preview (tools/build.py --preview, for sharing outside Poki): no SDK, no ads, rewards are granted right away.
window.RH = window.RH || {};

(function () {
  const USE_REAL_SDK = window.RH_RELEASE === true;

  const log = (...a) => console.log('%c[PokiMock]', 'color:#ff6fb5;font-weight:bold', ...a);

  // Mock overlay so ads are visible while testing locally.
  function showMockAd(label, seconds) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.innerHTML = `<div class="mock-ad-box"><div class="mock-ad-title">📺 ${label}</div><div class="mock-ad-timer">${seconds}</div></div>`;
      document.body.appendChild(el);
      let left = seconds;
      const timer = el.querySelector('.mock-ad-timer');
      const iv = setInterval(() => {
        left--;
        timer.textContent = left;
        if (left <= 0) { clearInterval(iv); el.remove(); resolve(); }
      }, 1000);
    });
  }

  const mock = {
    init: () => { log('init'); return Promise.resolve(); },
    gameLoadingFinished: () => log('gameLoadingFinished'),
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    commercialBreak: () => { log('commercialBreak'); return showMockAd(RH.t('adMock'), 1); },
    rewardedBreak: () => { log('rewardedBreak'); return showMockAd(RH.t('adRewardedMock'), 2).then(() => true); },
  };

  const noop = {
    init: () => Promise.resolve(),
    gameLoadingFinished() {}, gameplayStart() {}, gameplayStop() {},
    commercialBreak: () => Promise.resolve(),
    rewardedBreak: () => Promise.resolve(false),
  };

  const free = Object.assign({}, noop, { rewardedBreak: () => Promise.resolve(true) });

  const sdk = window.RH_PREVIEW === true ? free : USE_REAL_SDK ? (window.PokiSDK || noop) : mock;

  let playing = false;
  let inAd = false;

  RH.Poki = {
    get inAd() { return inAd; },
    init() {
      return sdk.init().catch((e) => { console.warn('Poki init failed (adblock?)', e); });
    },
    loadingFinished() { sdk.gameLoadingFinished(); },
    gameplayStart() { if (!playing && !inAd) { playing = true; sdk.gameplayStart(); } },
    gameplayStop() { if (playing) { playing = false; sdk.gameplayStop(); } },

    _wrap(fn) {
      if (inAd) return Promise.resolve(false);
      const wasPlaying = playing;
      this.gameplayStop();
      inAd = true;
      RH.Audio && RH.Audio.setMuted(true, 'ad');
      return Promise.resolve(fn())
        .catch(() => false)
        .then((res) => {
          inAd = false;
          RH.Audio && RH.Audio.setMuted(false, 'ad');
          if (wasPlaying) this.gameplayStart();
          return res;
        });
    },
    // Interstitial: call at natural pauses. SDK decides whether to show.
    commercialBreak() { return this._wrap(() => sdk.commercialBreak()).then(() => undefined); },
    // Rewarded: resolves true if the player should get the reward.
    rewardedBreak() {
      return this._wrap(() => sdk.rewardedBreak()).then((r) => {
        if (!r && RH.UI) RH.UI.toast('📺 ' + RH.t('adUnavailable'));
        return !!r;
      });
    },
  };
})();
