// Raccoon Heist Tycoon — balance config.
// All tunable numbers live here.
window.RH = window.RH || {};

RH.CONFIG = {
  saveKey: 'raccoonHeist_save',
  saveVersion: 2,
  autosaveSec: 5,
  offlineCapSec: 2 * 60 * 60, // 2 hours
  offlineMinSec: 60,           // show "while you were away" only after 1 min

  world: { w: 1400, h: 1000 },

  player: {
    speed: 260,        // world units / sec
    baseCarry: 4,      // bags in hands
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
    lives: 3,
    successBonus: 0.5, // +50% bag value
    failLoss: 0.5,     // lose 50% of bags of that heist
    coinValueMul: 2,   // coin pickup = bag value * this
  },

  // Station layout in world units (x, y = center). `needs` = buy zone that unlocks it.
  stations: {
    board:    { x: 230,  y: 220, w: 200, h: 140, emoji: '🗺️', color: '#ff6fb5' },
    garage:   { x: 1160, y: 240, w: 240, h: 200, emoji: '🔐', color: '#3fd8d0' },
    laundry:  { x: 1160, y: 760, w: 220, h: 170, emoji: '💱', color: '#ffa94d' },
    workshop: { x: 230,  y: 770, w: 200, h: 150, emoji: '🛠️', color: '#a77bff' },
    display:  { x: 700,  y: 160, w: 280, h: 130, emoji: '🏆', color: '#ffd84d', needs: 'display' },
    market:   { x: 560,  y: 870, w: 200, h: 130, emoji: '🛒', color: '#7dffb2', needs: 'market' },
  },

  // Buy zones ("$ 500" style): stand on it, coins drain into it.
  // Costs are multiplied by the district cost multiplier. `keep` = survives a move.
  buyZones: [
    { id: 'display', x: 700, y: 160, w: 280, h: 130, cost: 100, emoji: '🏆', keep: true },
    { id: 'market',  x: 560, y: 870, w: 200, h: 130, cost: 400, emoji: '🛒' },
    { id: 'washer2', x: 870, y: 850, w: 150, h: 120, cost: 500, emoji: '🧮', laundryBonus: 0.25 },
    { id: 'cooler',  x: 520, y: 520, w: 150, h: 120, cost: 1500, emoji: '📡', coolMul: 2 },
  ],

  // Station level pads: endless levels, coins drain in like buy zones.
  levelPads: [
    { id: 'laundry', x: 990, y: 600, w: 120, h: 90, emoji: '💱', base: 150, growth: 1.45, effect: 0.10 },                     // +10% coins per bag
    { id: 'display', x: 950, y: 150, w: 120, h: 90, emoji: '🏆', base: 300, growth: 1.5,  effect: 0.15, needs: 'display' }, // +15% display income
  ],

  startPos: { x: 700, y: 620 },
  startCoins: 20,

  // ----- Districts (prestige "move") -----
  district: {
    incomeBase: 8,   // bag values, heist unlocks, market prices ×8 per district
    costBase: 4,     // upgrades, crew, zones, level pads, treasure income ×4 per district
    repBonus: 0.5,   // +50% ALL income per district moved (permanent)
    moveCost: 50000, // × income multiplier; also needs all 4 heists unlocked
  },

  // Same 4 heist "slots" in every district; values scaled by the district multiplier.
  heistSlots: [
    { time: 10,  bags: 3, bagValue: 5,   noise: 5,  unlock: 0,     treasure: 0.10, rarity: [85, 13, 2, 0] },
    { time: 25,  bags: 4, bagValue: 15,  noise: 10, unlock: 150,   treasure: 0.14, rarity: [70, 24, 5, 1] },
    { time: 60,  bags: 5, bagValue: 50,  noise: 15, unlock: 1500,  treasure: 0.20, rarity: [55, 30, 12, 3] },
    { time: 180, bags: 6, bagValue: 200, noise: 25, unlock: 12000, treasure: 0.35, rarity: [35, 35, 22, 8] },
  ],

  districts: [
    { id: 'beach', emoji: '🏖️', tiles: ['#3b2a5e', '#43306a'], wall: '#ff6fb5', outside: '#ffd9a0', sea: true, deco: '🌴',
      targets: [['donut', '🍩'], ['icecream', '🍦'], ['souvenir', '🐚'], ['yacht', '🛥️']] },
    { id: 'neon', emoji: '🌃', tiles: ['#2a1f4a', '#33265a'], wall: '#3fd8d0', outside: '#4a3b78', sea: false, deco: '🌃',
      targets: [['arcade', '🕹️'], ['burger', '🍔'], ['karaoke', '🎤'], ['ferris', '🎡']] },
    { id: 'downtown', emoji: '🏙️', tiles: ['#30344a', '#383d55'], wall: '#ffd84d', outside: '#9aa3b5', sea: false, deco: '🏢',
      targets: [['bakery', '🧁'], ['gadgets', '📱'], ['office', '🏢'], ['bank', '🏦']] },
    { id: 'hills', emoji: '⛰️', tiles: ['#2f4a3a', '#365442'], wall: '#ffa94d', outside: '#9bd28a', sea: false, deco: '🌳',
      targets: [['golf', '⛳'], ['gallery', '🖼️'], ['museum', '🐢'], ['mansion', '🏰']] },
    { id: 'port', emoji: '⚓', tiles: ['#24405a', '#2b4a66'], wall: '#7dffb2', outside: '#e9d6a8', sea: true, deco: '⚓',
      targets: [['crabs', '🦀'], ['toys', '🧸'], ['lighthouse', '🗼'], ['pirates', '🏴‍☠️']] },
  ],

  // Upgrades: cost = base * growth^level * districtCostMul
  upgrades: [
    { id: 'car',      emoji: '🚐', base: 50,   growth: 1.18, max: 40 },  // -8% heist time
    { id: 'bigBags',  emoji: '👜', base: 80,   growth: 1.22, max: 50 },  // +1 bag
    { id: 'paws',     emoji: '🐾', base: 120,  growth: 1.20, max: 30 },  // -10% wanted
    { id: 'nose',     emoji: '👃', base: 200,  growth: 1.25, max: 20 },  // +2% treasure chance
    { id: 'backpack', emoji: '🎒', base: 40,   growth: 1.15, max: 40 },  // +2 carry
    { id: 'speed',    emoji: '👟', base: 30,   growth: 1.15, max: 20 },  // +5% walk speed
    { id: 'gang',     emoji: '🦝', base: 1000, growth: 3.0,  max: 3 },   // +1 parallel heist
    { id: 'loader',   emoji: '📦', base: 2500, growth: 2.0,  max: 5 },   // helper raccoon
  ],

  upgradeEffects: {
    carTimeMul: 0.92,
    noiseMul: 0.90,
    noseAdd: 0.02,
    backpackAdd: 2,
    speedAdd: 0.05,
  },

  // Crew specialists: level 0 = not hired. cost = hire * growth^level * districtCostMul
  crew: [
    { id: 'driver', emoji: '🚗', hire: 600,  growth: 1.6, max: 100 },
    { id: 'sneak',  emoji: '🤹', hire: 1200, growth: 1.6, max: 100 },
    { id: 'muscle', emoji: '💪', hire: 2500, growth: 1.6, max: 100 },
    { id: 'hacker', emoji: '💻', hire: 5000, growth: 1.6, max: 100 },
  ],
  crewEffects: {
    driverTime: 0.96,     // ×0.96 heist time per level
    sneakNoise: 0.95,     // ×0.95 wanted per level
    sneakTreasure: 0.01,  // +1% treasure chance per level
    muscleCoins: 0.15,    // +15% coins per bag per level
    hackerDisplay: 0.20,  // +20% display income per level
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

  treasures: [
    { id: 'goldDonut',    emoji: '🍩', rarity: 0 },
    { id: 'duck',         emoji: '🐤', rarity: 0 },
    { id: 'sock',         emoji: '🧦', rarity: 0 },
    { id: 'cap',          emoji: '🧢', rarity: 0 },
    { id: 'soda',         emoji: '🥤', rarity: 0 },
    { id: 'discoPine',    emoji: '🍍', rarity: 1 },
    { id: 'piggyCat',     emoji: '🐱', rarity: 1 },
    { id: 'wifiShell',    emoji: '🐚', rarity: 1 },
    { id: 'guitar',       emoji: '🎸', rarity: 1 },
    { id: 'xray',         emoji: '🕶️', rarity: 1 },
    { id: 'diamondPizza', emoji: '🍕', rarity: 2 },
    { id: 'cactus',       emoji: '🌵', rarity: 2 },
    { id: 'scooter',      emoji: '🛴', rarity: 2 },
    { id: 'skate',        emoji: '🛹', rarity: 2 },
    { id: 'discoBall',    emoji: '🪩', rarity: 2 },
    { id: 'chipsThrone',  emoji: '🪑', rarity: 3 },
    { id: 'gullCrown',    emoji: '👑', rarity: 3 },
    { id: 'gigaDuck',     emoji: '🦆', rarity: 3 },
    { id: 'flamingo',     emoji: '🦩', rarity: 3 },
    { id: 'whale',        emoji: '🐋', rarity: 3 },
  ],

  display: {
    startSlots: 3,
    slotCosts: [5000, 25000, 150000], // 4th, 5th, 6th slot (kept across moves)
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
