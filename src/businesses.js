import Decimal from 'break_eternity.js';

// ── Business Definitions (20 tiers — extended from 15 in 1.0) ───────
// Cost ratio between tiers: ~12x. Profit/cost ratio held roughly constant
// so each new tier feels meaningful but doesn't trivialise the prior one.
// `baseTime` grows quadratically late-game to keep cycles satisfying
// rather than blink-and-miss.
export const BUSINESSES = [
  { id: 'biz_01', name: 'Vending Machine', image: './assets/images/vending-machine.png', baseCost: 4,                       baseProfit: 1,                     baseTime: 0.6 },
  { id: 'biz_02', name: 'Snack Bench',     image: './assets/images/bench.png',           baseCost: 60,                      baseProfit: 60,                    baseTime: 3 },
  { id: 'biz_03', name: 'Coffee Stand',    image: './assets/images/coffee-cup.png',      baseCost: 720,                     baseProfit: 540,                   baseTime: 6 },
  { id: 'biz_04', name: 'Food Table',      image: './assets/images/table.png',           baseCost: 8640,                    baseProfit: 4320,                  baseTime: 12 },
  { id: 'biz_05', name: 'Market Booth',    image: './assets/images/booth.png',           baseCost: 103680,                  baseProfit: 51840,                 baseTime: 24 },
  { id: 'biz_06', name: 'Food Cart',       image: './assets/images/food-cart.png',       baseCost: 1244160,                 baseProfit: 622080,                baseTime: 96 },
  { id: 'biz_07', name: 'Food Stall',      image: './assets/images/food-stall.png',      baseCost: 14929920,                baseProfit: 7464960,               baseTime: 384 },
  { id: 'biz_08', name: 'Gourmet Cart',    image: './assets/images/food-cart (1).png',   baseCost: 179159040,               baseProfit: 89579520,              baseTime: 1536 },
  { id: 'biz_09', name: 'Night Stall',     image: './assets/images/food-stall (1).png',  baseCost: 2149908480,              baseProfit: 1074954240,            baseTime: 6144 },
  { id: 'biz_10', name: 'Food Truck',      image: './assets/images/food-truck.png',      baseCost: 25798901760,             baseProfit: 12899450880,           baseTime: 24576 },
  { id: 'biz_11', name: 'Deluxe Stall',    image: './assets/images/food-stall (2).png',  baseCost: 309586821120,            baseProfit: 154793410560,          baseTime: 36864 },
  { id: 'biz_12', name: 'Mega Truck',      image: './assets/images/food-truck (1).png',  baseCost: 3715041853440,           baseProfit: 1857520926720,         baseTime: 55296 },
  { id: 'biz_13', name: 'Corner Store',    image: './assets/images/store.png',           baseCost: 44580502241280,          baseProfit: 22290251120640,        baseTime: 82944 },
  { id: 'biz_14', name: 'Grocery',         image: './assets/images/grocery.png',         baseCost: 534966026895360,         baseProfit: 267483013447680,       baseTime: 110592 },
  { id: 'biz_15', name: 'Street Market',   image: './assets/images/street-market.png',   baseCost: 6419592322744320,        baseProfit: 3209796161372160,      baseTime: 147456 },
  // ── 2.0 expansion: late-game empire tier ────────────────────────────────
  { id: 'biz_16', name: 'Pop-up Stall',    image: './assets/images/stall.png',             baseCost: 77035107872931840,       baseProfit: 38517553936465920,     baseTime: 184320 },
  { id: 'biz_17', name: 'Floating Booth',  image: './assets/images/booth (1).png',         baseCost: 924421294475182080,      baseProfit: 462210647237591040,    baseTime: 230400 },
  { id: 'biz_18', name: 'Twin Stalls',     image: './assets/images/food-stall (3).png',    baseCost: 11093055533702184960,    baseProfit: 5546527766851092480,   baseTime: 288000 },
  { id: 'biz_19', name: 'Chain Stores',    image: './assets/images/stores.png',            baseCost: 133116666404426219520,   baseProfit: 66558333202213109760,  baseTime: 360000 },
  { id: 'biz_20', name: 'Bazaar Empire',   image: './assets/images/street-market (1).png', baseCost: 1597399996853114634240,  baseProfit: 798699998426557317120, baseTime: 432000 },
];

export const MILESTONES = [25, 50, 100, 250, 500];

// ── Imports from state (deferred to avoid circular) ─────────────────
let _state = null;
export function bindState(stateModule) { _state = stateModule; }

// ── Internal Helpers ────────────────────────────────────────────────
function getGeometricCost(baseCost, ratio, currentOwned, amountToBuy) {
  // Sum of geometric series: a * r^n * (1 - r^k) / (1 - r)
  const a = new Decimal(baseCost).mul(Decimal.pow(ratio, currentOwned));
  if (ratio === 1) return a.mul(amountToBuy).ceil();
  const rPowerK = Decimal.pow(ratio, amountToBuy);
  return a.mul(new Decimal(1).sub(rPowerK)).div(1 - ratio).ceil();
}

function getMaxAffordable(baseCost, ratio, currentOwned, currentMoney) {
  const currentLevelCost = new Decimal(baseCost).mul(Decimal.pow(ratio, currentOwned));
  if (currentMoney.lt(currentLevelCost)) return 0;
  if (ratio === 1) return currentMoney.div(currentLevelCost).floor().toNumber();

  const term1 = currentMoney.mul(ratio - 1).div(currentLevelCost);
  const term2 = term1.add(1);
  return Math.floor(term2.ln() / Math.log(ratio));
}

// ── Cost ────────────────────────────────────────────────────────────
export function getBusinessCost(id, multiplier = 1) {
  const biz = BUSINESSES.find(b => b.id === id);
  if (!biz || !_state) return { cost: new Decimal(Infinity), count: 0 };

  const owned = _state.getBusinessOwned(id);
  // Stacked discount: Sanitation -> 1.10, Sanitation II -> 1.08
  let growth = 1.15;
  if (_state.hasUpgrade('sanitation')) growth = 1.10;
  if (_state.hasUpgrade('sanitation_ii')) growth = 1.08;

  if (multiplier === 'max') {
    const money = _state.getMoney();
    const maxCount = getMaxAffordable(biz.baseCost, growth, owned, money);
    if (maxCount === 0) {
      return { cost: getGeometricCost(biz.baseCost, growth, owned, 1), count: 0 };
    }
    return { cost: getGeometricCost(biz.baseCost, growth, owned, maxCount), count: maxCount };
  }

  return { cost: getGeometricCost(biz.baseCost, growth, owned, multiplier), count: multiplier };
}

// ── Profit per cycle ────────────────────────────────────────────────
export function getBusinessProfit(id) {
  const biz = BUSINESSES.find(b => b.id === id);
  if (!biz || !_state) return new Decimal(0);
  const owned = _state.getBusinessOwned(id);
  if (owned === 0) return new Decimal(0);

  let profit = new Decimal(biz.baseProfit).mul(owned);

  // Global upgrade multipliers
  if (_state.hasUpgrade('tip_jar'))           profit = profit.mul(1.1);
  if (_state.hasUpgrade('expanded_parking'))  profit = profit.mul(5);
  if (_state.hasUpgrade('neon_signage'))      profit = profit.mul(2);   // 2.0
  if (_state.hasUpgrade('night_lights'))      profit = profit.mul(3);   // 2.0
  if (_state.hasUpgrade('vip_lounge'))        profit = profit.mul(10);  // 2.0

  // Specific upgrade multipliers
  if (_state.hasUpgrade('secret_menus') && (id === 'biz_01' || id === 'biz_03')) {
    profit = profit.mul(3);
  }
  if (_state.hasUpgrade('exotic_spices') && (id === 'biz_06' || id === 'biz_08' || id === 'biz_10' || id === 'biz_12')) {
    profit = profit.mul(10);
  }
  // 2.0: late-tier specialist upgrade
  if (_state.hasUpgrade('chain_synergy') && (id === 'biz_17' || id === 'biz_18' || id === 'biz_19' || id === 'biz_20')) {
    profit = profit.mul(20);
  }

  // Prestige bonus + achievement bonuses (rolled in)
  const bonus = _state.getPrestigeBonus() + (_state.getAchievementBonus ? _state.getAchievementBonus() : 0);
  if (bonus > 0) profit = profit.mul(1 + bonus);

  return profit.floor();
}

// ── Time per cycle (seconds) ────────────────────────────────────────
export function getBusinessTime(id) {
  const biz = BUSINESSES.find(b => b.id === id);
  if (!biz || !_state) return 1;
  const owned = _state.getBusinessOwned(id);

  let time = biz.baseTime;

  // Milestone speed doublings (now 5 tiers: 25, 50, 100, 250, 500)
  for (const ms of MILESTONES) {
    if (owned >= ms) time /= 2;
  }

  // Speed upgrades stack
  if (_state.hasUpgrade('express_checkout')) time /= 2;
  if (_state.hasUpgrade('rush_hour'))        time /= 1.5; // 2.0

  return Math.max(0.05, time);
}

// ── Buy ─────────────────────────────────────────────────────────────
export function buyBusiness(id, multiplier = 1) {
  const { cost, count } = getBusinessCost(id, multiplier);
  if (count === 0 || !_state.spendMoney(cost)) return { success: false };

  const prev = _state.getBusinessOwned(id);
  const newOwned = prev + count;
  _state.setBusinessOwned(id, newOwned);
  _state.recordBusinessBought(count);

  // Check for milestone (first time crossing each threshold)
  let achievedMilestone = null;
  for (const ms of MILESTONES) {
    if (prev < ms && newOwned >= ms) {
      achievedMilestone = ms;
    }
  }

  return { success: true, milestone: achievedMilestone, newOwned };
}

// ── Can afford ──────────────────────────────────────────────────────
export function canBuyBusiness(id, multiplier = 1) {
  if (!_state) return false;
  const { cost, count } = getBusinessCost(id, multiplier);
  if (multiplier === 'max' && count === 0) return false;
  return _state.canAfford(cost);
}

// ── Visibility ──────────────────────────────────────────────────────
export function isBusinessVisible(id) {
  if (!_state) return false;
  const idx = BUSINESSES.findIndex(b => b.id === id);
  if (idx === 0) return true;
  if (_state.getBusinessOwned(id) > 0) return true;
  // Visible if previous business is owned
  const prevBiz = BUSINESSES[idx - 1];
  if (prevBiz && _state.getBusinessOwned(prevBiz.id) > 0) return true;
  return false;
}

// ── Total Money Per Second (managed only) ───────────────────────────
export function getTotalMPS() {
  if (!_state) return new Decimal(0);
  let total = new Decimal(0);
  for (const biz of BUSINESSES) {
    const owned = _state.getBusinessOwned(biz.id);
    if (owned === 0) continue;
    if (!_state.hasManagerForBiz(biz.id)) continue;
    const profit = getBusinessProfit(biz.id);
    const time = getBusinessTime(biz.id);
    total = total.add(profit.div(time));
  }
  return total;
}

// ── Offline Progress ────────────────────────────────────────────────
export function calculateOfflineProgress(savedTimestamp) {
  if (!_state) return new Decimal(0);
  const now = Date.now();
  // Cap at 7 days, then halve to discourage extreme offline parking
  const rawSec = Math.max(0, (now - savedTimestamp) / 1000);
  const cappedSec = Math.min(rawSec, 86400 * 7);
  if (cappedSec < 10) return new Decimal(0);

  let total = new Decimal(0);
  for (const biz of BUSINESSES) {
    const owned = _state.getBusinessOwned(biz.id);
    if (owned === 0) continue;
    if (!_state.hasManagerForBiz(biz.id)) continue;
    const time = getBusinessTime(biz.id);
    const cycles = Math.floor(cappedSec / time);
    if (cycles > 0) {
      const profit = getBusinessProfit(biz.id);
      total = total.add(profit.mul(cycles));
    }
  }
  // Offline efficiency: 75% — playing actively should always feel better
  return total.mul(0.75).floor();
}
