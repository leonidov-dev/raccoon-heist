// Tiny WebAudio beeps — no sound files needed.
window.RH = window.RH || {};

RH.Audio = (function () {
  let ctx = null;
  const muteReasons = new Set();
  let userMuted = localStorage.getItem('raccoonHeist_muted') === '1';

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (userMuted || muteReasons.size) return;
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  let lastCoin = 0;
  return {
    unlock: ensure,
    get userMuted() { return userMuted; },
    toggle() {
      userMuted = !userMuted;
      localStorage.setItem('raccoonHeist_muted', userMuted ? '1' : '0');
      return userMuted;
    },
    setMuted(on, reason) {
      if (on) muteReasons.add(reason); else muteReasons.delete(reason);
      if (ctx) { if (muteReasons.size) ctx.suspend(); else ctx.resume(); }
    },
    pick() { tone(520, 0.06, 'square', 0.04, 120); },
    coin() {
      const now = performance.now();
      if (now - lastCoin < 45) return;
      lastCoin = now;
      tone(880 + Math.random() * 200, 0.08, 'triangle', 0.05, 300);
    },
    buy() { tone(440, 0.08, 'square', 0.05); setTimeout(() => tone(660, 0.12, 'square', 0.05), 80); },
    send() { tone(300, 0.15, 'sawtooth', 0.04, 300); },
    arrive() { tone(600, 0.1, 'triangle', 0.06); setTimeout(() => tone(800, 0.12, 'triangle', 0.06), 100); },
    treasure() { [660, 880, 990, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.06), i * 90)); },
    siren() { tone(700, 0.25, 'sawtooth', 0.04, 300); setTimeout(() => tone(1000, 0.25, 'sawtooth', 0.04, -300), 250); },
    hit() { tone(150, 0.25, 'sawtooth', 0.08, -80); },
    deny() { tone(200, 0.12, 'square', 0.04); },
  };
})();
