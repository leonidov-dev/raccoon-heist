// SVG sprites with emoji fallback. Add a file to assets/sprites and its name to LIST.
window.RH = window.RH || {};

RH.Sprites = (function () {
  const C = RH.CONFIG;
  const LIST = ['raccoon', 'cop', 'bag', 'coin', 'chest', 'chest_big', 'boost', 'album', 'siren', 'police_car',
    'zone_washer2', 'zone_cooler', 'up_paws', 'up_nose', 'up_backpack', 'up_speed', 'up_loader', 'st_stall']
    .concat(C.shop.buyers)
    .concat([].concat(...C.districts.map((d) => d.decor)))
    .concat(C.treasures.map((t) => 't_' + t.id))
    .concat(C.cosmetics.hats.map((h) => 'hat_' + h.id))
    .concat(C.cosmetics.vans.map((v) => 'van_' + v.id))
    .concat(C.crew.map((c) => 'crew_' + c.id))
    .concat(Object.keys(C.stations).map((id) => 'st_' + id))
    .concat([].concat(...C.districts.map((d) => d.targets.map((t) => 'h_' + t[0]))));
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const imgs = {};
  const V = window.RH_BUILD ? '?v=' + window.RH_BUILD : ''; // cache-busting in builds

  LIST.forEach((name) => {
    const im = new Image();
    im.src = 'assets/sprites/' + name + '.svg' + V;
    imgs[name] = im;
  });

  function img(name) {
    const im = imgs[name];
    return im && im.complete && im.naturalWidth ? im : null;
  }

  // Draw sprite fitted into a size×size box centered at (x, y); fall back to emoji.
  function draw(ctx, name, fallback, x, y, size) {
    const im = img(name);
    if (im) {
      const k = size / Math.max(im.naturalWidth, im.naturalHeight);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
      return;
    }
    if (!fallback) return;
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback, x, y);
  }

  // HTML for panels/toasts: <img> if we have the sprite, emoji otherwise.
  function html(name, fallback) {
    return imgs[name] ? `<img class="spr" src="assets/sprites/${name}.svg${V}" alt="">` : fallback;
  }

  // Raccoon with a hat on top, for panel icons.
  function raccoonHtml(hat) {
    return `<span class="rac"><img src="assets/sprites/raccoon.svg${V}" alt="">${hat ? `<img class="rac-hat" src="assets/sprites/${hat}.svg${V}" alt="">` : ''}</span>`;
  }

  return { img, draw, html, raccoonHtml, has: (name) => !!imgs[name] };
})();
