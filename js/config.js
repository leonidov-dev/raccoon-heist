// Raccoon Heist Tycoon — balance config.
// All tunable numbers live here.
window.RH = window.RH || {};

RH.CONFIG = {
  saveKey: 'raccoonHeist_save',
  saveVersion: 3,
  autosaveSec: 5,
  offlineCapSec: 2 * 60 * 60, // 2 hours (Hacker's "Cloud" skill adds more)
  offlineMinSec: 60,           // show "while you were away" only after 1 min

  world: { w: 1800, h: 1200 },

  player: {
    speed: 270,        // world units / sec
    baseCarry: 4,      // goods in hands
    pickInterval: 0.10,
    dropInterval: 0.07,
  },

  helper: { speed: 170, carry: 5 },

  heat: {
    max: 100,
    coolPerSec: 0.5,   // wanted-level points per second
  },

  chase: {
    duration: 12,
    lives: 3,          // Driver's "Stuntman" skill adds more
    successBonus: 0.5, // +50% goods value
    failLoss: 0.5,     // lose 50% of the goods of that heist
    coinValueMul: 2,   // coin pickup = goods value * this
  },

  // Station layout in world units (x, y = center). `needs` = buy zone that unlocks it.
  // 'laundry' is the Cash Register (id kept for old saves).
  stations: {
    board:    { x: 240,  y: 230,  w: 200, h: 140, emoji: '🗺️', color: '#ff6fb5' },
    garage:   { x: 1560, y: 250,  w: 240, h: 200, emoji: '🔐', color: '#3fd8d0' },
    laundry:  { x: 1600, y: 1030, w: 200, h: 130, emoji: '💵', color: '#ffa94d' },
    workshop: { x: 240,  y: 1020, w: 200, h: 150, emoji: '🛠️', color: '#a77bff' },
    crew:     { x: 260,  y: 600,  w: 220, h: 150, emoji: '🦝', color: '#7ee6ff' },
    display:  { x: 720,  y: 210,  w: 280, h: 130, emoji: '🏆', color: '#ffd84d', needs: 'display' },
    market:   { x: 600,  y: 1040, w: 200, h: 130, emoji: '🛒', color: '#7dffb2', needs: 'market' },
  },

  // Shop: heists bring goods -> carry them to the stall of that heist -> buyers take them
  // -> buyers pay at the Cash Register while the Boss (or a cashier) stands there.
  shop: {
    stalls: [[900, 760], [1060, 760], [1220, 760], [1380, 760]], // one per heist slot
    stallW: 140, stallH: 110,
    stallCap: 12,              // goods per stall
    door: [1850, 640],         // buyers come in and leave here (gap in the right wall)
    queue: [1470, 1040, -70],  // first spot x, y, step
    spawnEvery: 2.4,           // seconds between buyers (if a stall has goods)
    maxBuyers: 7,
    take: [1, 3],              // goods per buyer
    buyerSpeed: 150,
    serveBoss: 0.3,            // seconds per buyer when the Boss stands at the register
    serveCashier: 1.2,         // seconds per buyer for a cashier (level 1; faster per level)
    buyers: ['npc_cat', 'npc_bird', 'npc_bunny'],
    buyerEmoji: ['🐱', '🐦', '🐀'],
  },

  // Buy zones ("$ 500" style): stand on it, coins drain into it.
  // Costs are multiplied by the district cost multiplier. `keep` = bought once for every district.
  buyZones: [
    { id: 'display', x: 720,  y: 210,  w: 280, h: 130, cost: 100, emoji: '🏆', keep: true },
    { id: 'market',  x: 600,  y: 1040, w: 200, h: 130, cost: 400, emoji: '🛒' },
    { id: 'washer2', x: 860,  y: 1040, w: 150, h: 120, cost: 500, emoji: '🧮', laundryBonus: 0.25 },
    { id: 'cooler',  x: 620,  y: 660,  w: 150, h: 120, cost: 1500, emoji: '📡', coolMul: 2 },
  ],

  // Station level pads: endless levels, coins drain in like buy zones.
  levelPads: [
    { id: 'laundry', x: 1640, y: 820, w: 120, h: 90, emoji: '💵', base: 150, growth: 1.45, effect: 0.10 },                     // +10% sale price
    { id: 'display', x: 1000, y: 210, w: 120, h: 90, emoji: '🏆', base: 300, growth: 1.5,  effect: 0.15, needs: 'display' }, // +15% display income
  ],

  // Free spots for district decor (never on stations, zones or walkways)
  decorSpots: [[470, 410], [1320, 450], [470, 840], [760, 840]],

  startPos: { x: 900, y: 600 },
  startCoins: 20,

  // ----- Districts -----
  // Each district keeps its own upgrades, stations and gangs. Coins, crew, collection,
  // display and wardrobe are shared. Travel between unlocked districts at any time.
  district: {
    incomeBase: 8,   // bag values, heist unlocks, market prices ×8 per district
    costBase: 4,     // upgrades, zones, level pads ×4 per district
    repBonus: 0.5,   // +50% ALL income per unlocked district (permanent)
    moveCost: 50000, // × income multiplier of the current district; also needs all 4 heists unlocked
  },

  // Same 4 heist "slots" in every district; values scaled by the district multiplier.
  heistSlots: [
    { time: 10,  bags: 3, bagValue: 5,   noise: 5,  unlock: 0,     treasure: 0.10, rarity: [85, 13, 2, 0] },
    { time: 25,  bags: 4, bagValue: 15,  noise: 10, unlock: 150,   treasure: 0.14, rarity: [70, 24, 5, 1] },
    { time: 60,  bags: 5, bagValue: 50,  noise: 15, unlock: 1500,  treasure: 0.20, rarity: [55, 30, 12, 3] },
    { time: 180, bags: 6, bagValue: 200, noise: 25, unlock: 12000, treasure: 0.35, rarity: [35, 35, 22, 8] },
  ],

  // floor: checker | grid | tiles | parquet | planks
  districts: [
    { id: 'beach', emoji: '🏖️', tiles: ['#3b2a5e', '#43306a'], floor: 'checker', wall: '#ff6fb5', sign: '#3fd8d0', rug: '#ff6fb5',
      outside: '#ffd9a0', sea: true, deco: '🌴', decor: ['d_surf', 'd_umbrella'],
      targets: [['donut', '🍩'], ['icecream', '🍦'], ['souvenir', '🐚'], ['yacht', '🛥️']] },
    { id: 'neon', emoji: '🌃', tiles: ['#1d1638', '#241b45'], floor: 'grid', wall: '#3fd8d0', sign: '#ff6fb5', rug: '#a77bff',
      outside: '#4a3b78', sea: false, deco: '🌃', decor: ['d_neon', 'd_jukebox'],
      targets: [['arcade', '🕹️'], ['burger', '🍔'], ['karaoke', '🎤'], ['ferris', '🎡']] },
    { id: 'downtown', emoji: '🏙️', tiles: ['#3c4258', '#454c64'], floor: 'tiles', wall: '#ffd84d', sign: '#ffd84d', rug: '#4d7fc1',
      outside: '#9aa3b5', sea: false, deco: '🏢', decor: ['d_plant', 'd_cabinet'],
      targets: [['bakery', '🧁'], ['gadgets', '📱'], ['office', '🏢'], ['bank', '🏦']] },
    { id: 'hills', emoji: '⛰️', tiles: ['#6b4a34', '#7a5640'], floor: 'parquet', wall: '#ffa94d', sign: '#ffc928', rug: '#c0475a',
      outside: '#9bd28a', sea: false, deco: '🌳', decor: ['d_fireplace', 'd_armchair'],
      targets: [['golf', '⛳'], ['gallery', '🖼️'], ['museum', '🐢'], ['mansion', '🏰']] },
    { id: 'port', emoji: '⚓', tiles: ['#5a4632', '#654f39'], floor: 'planks', wall: '#7dffb2', sign: '#7ee6ff', rug: '#33558a',
      outside: '#e9d6a8', sea: true, deco: '⚓', decor: ['d_barrel', 'd_anchor'],
      targets: [['crabs', '🦀'], ['toys', '🧸'], ['lighthouse', '🗼'], ['pirates', '🏴‍☠️']] },
  ],

  // Boss upgrades (per district): cost = base * growth^level * districtCostMul
  upgrades: [
    { id: 'car',      emoji: '🚐', base: 50,   growth: 1.18, max: 40 },  // -8% heist time
    { id: 'bigBags',  emoji: '👜', base: 80,   growth: 1.22, max: 50 },  // +1 bag
    { id: 'paws',     emoji: '🐾', base: 120,  growth: 1.20, max: 30 },  // -10% wanted
    { id: 'nose',     emoji: '👃', base: 200,  growth: 1.25, max: 20 },  // +2% treasure chance
    { id: 'backpack', emoji: '🎒', base: 40,   growth: 1.15, max: 40 },  // +2 carry
    { id: 'speed',    emoji: '👟', base: 30,   growth: 1.15, max: 20 },  // +5% walk speed
    { id: 'gang',     emoji: '🦝', base: 1000, growth: 3.0,  max: 3 },   // +1 parallel heist
    { id: 'loader',   emoji: '📦', base: 2500, growth: 2.0,  max: 5 },   // helper raccoon: stash -> stalls
    { id: 'cashier',  emoji: '💵', base: 800,  growth: 2.5,  max: 4 },   // raccoon at the register (faster per level)
  ],

  upgradeEffects: {
    carTimeMul: 0.92,
    noiseMul: 0.90,
    noseAdd: 0.02,
    backpackAdd: 2,
    speedAdd: 0.05,
  },

  // Crew specialists (shared by all districts). Skill "a" level 1 = hired.
  // a cost = hire * a.growth^level, b cost = b.base * b.growth^level, both × highest-district cost multiplier.
  crew: [
    { id: 'driver', emoji: '🚗', hire: 600,  a: { growth: 1.6, max: 30 }, b: { base: 4000, growth: 3.0, max: 2 } },
    { id: 'sneak',  emoji: '🤹', hire: 1200, a: { growth: 1.6, max: 30 }, b: { base: 3000, growth: 1.7, max: 20 } },
    { id: 'muscle', emoji: '💪', hire: 2500, a: { growth: 1.6, max: 50 }, b: { base: 2000, growth: 1.8, max: 10 } },
    { id: 'hacker', emoji: '💻', hire: 5000, a: { growth: 1.6, max: 50 }, b: { base: 8000, growth: 2.0, max: 8 } },
  ],
  crewEffects: {
    driverTime: 0.96,     // a: ×0.96 heist time per level
    driverLives: 1,       // b: +1 chase life per level
    sneakNoise: 0.95,     // a: ×0.95 wanted per level
    sneakTreasure: 0.01,  // b: +1% treasure chance per level
    muscleCoins: 0.15,    // a: +15% sale price per level
    muscleCarry: 2,       // b: carries 2 + 2 per level goods from stash to stalls
    hackerDisplay: 0.20,  // a: +20% display income per level
    hackerOffline: 1800,  // b: +30 min offline / away income cap per level
    speed: 150,
  },

  rarities: [
    { id: 'common',    color: '#b8b8c8', income: 0.5 },
    { id: 'rare',      color: '#4da3ff', income: 2 },
    { id: 'epic',      color: '#b65cff', income: 6 },
    { id: 'legendary', color: '#ffc928', income: 20 },
  ],

  // Copies needed for ★1..★5; income multiplier per star = starMul^(stars-1)
  starThresholds: [1, 2, 4, 7, 11],
  starMul: 1.5,

  // d = district index (0-based): heists, market and the free chest drop the current district's treasures
  treasures: [
    { id: 'duck',         emoji: '🐤', rarity: 0, d: 0 },
    { id: 'wifiShell',    emoji: '🐚', rarity: 1, d: 0 },
    { id: 'scooter',      emoji: '🛴', rarity: 2, d: 0 },
    { id: 'gullCrown',    emoji: '👑', rarity: 3, d: 0 },
    { id: 'soda',         emoji: '🥤', rarity: 0, d: 1 },
    { id: 'guitar',       emoji: '🎸', rarity: 1, d: 1 },
    { id: 'discoBall',    emoji: '🪩', rarity: 2, d: 1 },
    { id: 'gigaDuck',     emoji: '🦆', rarity: 3, d: 1 },
    { id: 'goldDonut',    emoji: '🍩', rarity: 0, d: 2 },
    { id: 'piggyCat',     emoji: '🐱', rarity: 1, d: 2 },
    { id: 'diamondPizza', emoji: '🍕', rarity: 2, d: 2 },
    { id: 'chipsThrone',  emoji: '🪑', rarity: 3, d: 2 },
    { id: 'cap',          emoji: '🧢', rarity: 0, d: 3 },
    { id: 'xray',         emoji: '🕶️', rarity: 1, d: 3 },
    { id: 'cactus',       emoji: '🌵', rarity: 2, d: 3 },
    { id: 'flamingo',     emoji: '🦩', rarity: 3, d: 3 },
    { id: 'sock',         emoji: '🧦', rarity: 0, d: 4 },
    { id: 'discoPine',    emoji: '🍍', rarity: 1, d: 4 },
    { id: 'skate',        emoji: '🛹', rarity: 2, d: 4 },
    { id: 'whale',        emoji: '🐋', rarity: 3, d: 4 },
  ],

  display: {
    startSlots: 3,
    slotCosts: [5000, 25000, 150000], // 4th, 5th, 6th slot (shared by all districts)
  },

  // Black market: chests for coins. price = base * growth^buys * districtIncomeMul
  market: {
    base: 300,
    growth: 1.3,
    rarity: [70, 22, 7, 1],
    bigMul: 6,
    bigRarity: [30, 42, 22, 6],
  },

  // Cosmetics: fixed prices, kept forever
  cosmetics: {
    hats: [
      { id: 'tophat', emoji: '🎩', cost: 0 },
      { id: 'cap',    emoji: '🧢', cost: 1000 },
      { id: 'sunhat', emoji: '👒', cost: 5000 },
      { id: 'grad',   emoji: '🎓', cost: 25000 },
      { id: 'helmet', emoji: '⛑️', cost: 100000 },
      { id: 'crown',  emoji: '👑', cost: 1000000 },
    ],
    vans: [
      { id: 'van',    emoji: '🚐', cost: 0 },
      { id: 'jeep',   emoji: '🚙', cost: 3000 },
      { id: 'taxi',   emoji: '🚕', cost: 15000 },
      { id: 'racer',  emoji: '🏎️', cost: 75000 },
      { id: 'bus',    emoji: '🚌', cost: 300000 },
      { id: 'pickup', emoji: '🛻', cost: 1500000 },
    ],
  },

  rewards: {
    chestCooldownSec: 300,
    chestRarity: [60, 28, 10, 2],
    boostSec: 300,
    boostMul: 2,
  },
};
