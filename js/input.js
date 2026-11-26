// Keyboard (WASD / arrows) + floating touch/mouse joystick anywhere on the canvas.
window.RH = window.RH || {};

RH.Input = (function () {
  const keys = new Set();
  const joy = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 };
  const listeners = { any: [], tap: [], key: [] };
  const JOY_R = 60;

  function emit(type, e) { listeners[type].forEach((f) => f(e)); }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    emit('any', e);
    emit('key', e);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); joy.active = false; });

  function attach(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      emit('any', e);
      emit('tap', e);
      if (joy.active) return;
      joy.active = true;
      joy.id = e.pointerId;
      joy.sx = joy.x = e.clientX;
      joy.sy = joy.y = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!joy.active || e.pointerId !== joy.id) return;
      joy.x = e.clientX;
      joy.y = e.clientY;
    });
    const end = (e) => { if (e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // Returns movement vector with length 0..1
  function move() {
    let x = 0, y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    if (joy.active) {
      const dx = joy.x - joy.sx, dy = joy.y - joy.sy;
      const l = Math.hypot(dx, dy);
      if (l < 8) return { x: 0, y: 0 };
      const m = Math.min(1, l / JOY_R);
      return { x: (dx / l) * m, y: (dy / l) * m };
    }
    return { x: 0, y: 0 };
  }

  return {
    attach,
    move,
    joy,
    JOY_R,
    keys,
    on(type, f) { listeners[type].push(f); },
    resetJoystick() { joy.active = false; joy.id = null; },
  };
})();
