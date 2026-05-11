import Decimal from 'break_eternity.js';
import { BUSINESSES } from './businesses.js';
import { ACHIEVEMENTS, getActiveBonus } from './achievements.js';

// ── Core State ──────────────────────────────────────────────────────
const state = {
  money: new Decimal(0),
  totalEarned: new Decimal(0),    // resets on prestige — drives reward calc
  lifetimeEarned: new Decimal(0), // never resets — drives "true" lifetime stats
  reputationStars: new Decimal(0),

  businesses: {},

  purchasedManagers: new Set(),
  purchasedUpgrades: new Set(),
  unlockedAchievements: new Set(),

  // ── Stats (never reset) ───────────────────────────────────────────
  stats: {
    totalClicks: 0,
    totalBusinessesBought: 0,
    totalManagersHired: 0,
    totalUpgradesBought: 0,
    prestigeCount: 0,
    biggestCash: new Decimal(0),
    biggestMps: new Decimal(0),
    firstPlayedAt: Date.now(),
    totalPlayTimeSec: 0, // accumulated across sessions
  },

  muted: false,
  lastSave: Date.now(),
  sessionStartedAt: Date.now(),
};

export function initState() {
  for (const biz of BUSINESSES) {
    state.businesses[biz.id] = {
      owned: 0,
      timer: 0,
      running: false,
    };
  }
  state.money = new Decimal(4);
  state.sessionStartedAt = Date.now();
  try {
    state.muted = localStorage.getItem('nmt_muted') === 'true';
  } catch (e) { }
}

// ── Money ───────────────────────────────────────────────────────────
export function getMoney() { return state.money; }

export function addMoney(amount) {
  const dec = new Decimal(amount);
  if (dec.lte(0) || dec.isNan()) return;
  state.money = state.money.add(dec);
  state.totalEarned = state.totalEarned.add(dec);
  state.lifetimeEarned = state.lifetimeEarned.add(dec);
  if (state.money.gt(state.stats.biggestCash)) {
    state.stats.biggestCash = state.money;
  }
}

export function spendMoney(amount) {
  const dec = new Decimal(amount);
  if (state.money.gte(dec)) {
    state.money = state.money.sub(dec);
    return true;
  }
  return false;
}

export function canAfford(amount) {
  return state.money.gte(new Decimal(amount));
}

// ── Business State ──────────────────────────────────────────────────
export function getBusinessOwned(id) { return state.businesses[id]?.owned || 0; }
export function setBusinessOwned(id, count) {
  if (state.businesses[id]) state.businesses[id].owned = count;
}

export function getBusinessTimer(id) { return state.businesses[id]?.timer || 0; }
export function setBusinessTimer(id, val) {
  if (state.businesses[id]) state.businesses[id].timer = val;
}

export function isBusinessRunning(id) { return state.businesses[id]?.running || false; }
export function setBusinessRunning(id, val) {
  if (state.businesses[id]) state.businesses[id].running = val;
}

// ── Managers ────────────────────────────────────────────────────────
export function hasManager(id) { return state.purchasedManagers.has(id); }
export function addManager(id) {
  state.purchasedManagers.add(id);
  state.stats.totalManagersHired += 1;
}
export function hasManagerForBiz(bizId) { return state.purchasedManagers.has('mgr_' + bizId); }

// ── Upgrades ────────────────────────────────────────────────────────
export function hasUpgrade(id) { return state.purchasedUpgrades.has(id); }
export function addUpgrade(id) {
  state.purchasedUpgrades.add(id);
  state.stats.totalUpgradesBought += 1;
}

// ── Achievements ────────────────────────────────────────────────────
export function hasAchievement(id) { return state.unlockedAchievements.has(id); }
export function unlockAchievement(id) { state.unlockedAchievements.add(id); }
export function getAchievementCount() { return state.unlockedAchievements.size; }
export function getAchievementTotal() { return ACHIEVEMENTS.length; }
export function getAchievementIds() { return [...state.unlockedAchievements]; }

/** Additive bonus from all unlocked achievements (stacks with prestige bonus). */
export function getAchievementBonus() {
  return getActiveBonus(state.unlockedAchievements);
}

/** Highest `owned` across all businesses — used by tier-based achievements. */
export function maxOwnedAcrossBusinesses() {
  let max = 0;
  for (const biz of BUSINESSES) {
    const owned = state.businesses[biz.id]?.owned || 0;
    if (owned > max) max = owned;
  }
  return max;
}

/** Bag of getters passed to `checkAchievements` so achievements.js never has
 *  to import from state.js (avoiding a circular dep). */
export function getAchievementGetters() {
  return {
    businessIds: () => BUSINESSES.map((b) => b.id),
    businessOwned: (id) => state.businesses[id]?.owned || 0,
    maxOwnedAcrossBusinesses,
    totalManagersHired: () => state.stats.totalManagersHired,
    totalUpgradesBought: () => state.stats.totalUpgradesBought,
    totalClicks: () => state.stats.totalClicks,
    prestigeCount: () => state.stats.prestigeCount,
    reputationStars: () => state.reputationStars.toNumber(),
    biggestCash: () => state.stats.biggestCash,
    totalPlayTimeSec: () => getTotalPlayTimeSec(),
  };
}

// ── Stats accessors ─────────────────────────────────────────────────
export function recordClick() { state.stats.totalClicks += 1; }
export function recordBusinessBought(count = 1) { state.stats.totalBusinessesBought += count; }
export function setBiggestMps(mps) {
  if (mps.gt(state.stats.biggestMps)) state.stats.biggestMps = mps;
}
export function getStats() { return state.stats; }
export function getCurrentSessionDurationSec() {
  return Math.max(0, Math.floor((Date.now() - state.sessionStartedAt) / 1000));
}
export function getTotalPlayTimeSec() {
  return state.stats.totalPlayTimeSec + getCurrentSessionDurationSec();
}

// ── Prestige ────────────────────────────────────────────────────────
export function getReputationStars() { return state.reputationStars; }
export function getTotalEarned() { return state.totalEarned; }
export function getLifetimeEarned() { return state.lifetimeEarned; }
export function getPrestigeCount() { return state.stats.prestigeCount; }

export function addReputationStars(amount) {
  state.reputationStars = state.reputationStars.add(new Decimal(amount));
}

export function getPrestigeBonus() {
  return state.reputationStars.toNumber() * 0.02;
}

// Three rank images, more granular titles based on star count.
const RANK_TITLES = [
  { min: 0,     title: 'Apprentice',  image: 'assets/ranks/rank001.png' },
  { min: 1,     title: 'Vendor',      image: 'assets/ranks/rank002.png' },
  { min: 10,    title: 'Vendor II',   image: 'assets/ranks/rank002.png' },
  { min: 50,    title: 'Vendor III',  image: 'assets/ranks/rank002.png' },
  { min: 100,   title: 'Tycoon',      image: 'assets/ranks/rank003.png' },
  { min: 500,   title: 'Tycoon II',   image: 'assets/ranks/rank003.png' },
  { min: 2500,  title: 'Mogul',       image: 'assets/ranks/rank003.png' },
  { min: 10000, title: 'Mogul Prime', image: 'assets/ranks/rank003.png' },
];

export function getRankImage() { return getRank().image; }
export function getRankTitle() { return getRank().title; }

function getRank() {
  const stars = state.reputationStars.toNumber();
  let best = RANK_TITLES[0];
  for (const tier of RANK_TITLES) {
    if (stars >= tier.min) best = tier;
  }
  return best;
}

export function calculatePrestigeReward() {
  const earned = state.totalEarned;
  const trillion = new Decimal(1e12);
  if (earned.lt(trillion)) return new Decimal(0);
  return earned.div(trillion).floor();
}

export function canPrestige() {
  return calculatePrestigeReward().gt(0);
}

export function doPrestige() {
  const reward = calculatePrestigeReward();
  if (reward.lte(0)) return new Decimal(0);

  state.reputationStars = state.reputationStars.add(reward);
  state.stats.prestigeCount += 1;
  state.money = new Decimal(4);
  state.totalEarned = new Decimal(0);
  for (const biz of BUSINESSES) {
    state.businesses[biz.id] = { owned: 0, timer: 0, running: false };
  }
  state.purchasedManagers = new Set();
  state.purchasedUpgrades = new Set();
  return reward;
}

// ── Mute ────────────────────────────────────────────────────────────
export function isMuted() { return state.muted; }
export function setMuted(val) {
  state.muted = val;
  try { localStorage.setItem('nmt_muted', val ? 'true' : 'false'); } catch (e) { }
}

// ── Serialization ───────────────────────────────────────────────────
const SAVE_KEY = 'nightmarket_save';
const SAVE_VERSION = 2; // bumped from 1 (which had no version field) for stats

function safeDec(val) {
  try {
    const d = new Decimal(val || 0);
    if (d.isNan() || !d.isFinite()) return new Decimal(0);
    return d;
  } catch (e) {
    return new Decimal(0);
  }
}

function safeInt(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function buildSaveData() {
  // Pre-roll the current session into totalPlayTimeSec so the export
  // reflects accurate cumulative time even if the player never re-opens.
  const sessionSec = getCurrentSessionDurationSec();
  return {
    version: SAVE_VERSION,
    money: state.money.toString(),
    totalEarned: state.totalEarned.toString(),
    lifetimeEarned: state.lifetimeEarned.toString(),
    reputationStars: state.reputationStars.toString(),
    businesses: Object.fromEntries(
      Object.entries(state.businesses).map(([k, v]) => [k, { owned: v.owned }])
    ),
    purchasedManagers: [...state.purchasedManagers],
    purchasedUpgrades: [...state.purchasedUpgrades],
    unlockedAchievements: [...state.unlockedAchievements],
    stats: {
      totalClicks: state.stats.totalClicks,
      totalBusinessesBought: state.stats.totalBusinessesBought,
      totalManagersHired: state.stats.totalManagersHired,
      totalUpgradesBought: state.stats.totalUpgradesBought,
      prestigeCount: state.stats.prestigeCount,
      biggestCash: state.stats.biggestCash.toString(),
      biggestMps: state.stats.biggestMps.toString(),
      firstPlayedAt: state.stats.firstPlayedAt,
      totalPlayTimeSec: state.stats.totalPlayTimeSec + sessionSec,
    },
    timestamp: Date.now(),
  };
}

function applyLoadedData(data) {
  state.money = safeDec(data.money);
  state.totalEarned = safeDec(data.totalEarned);
  state.lifetimeEarned = safeDec(data.lifetimeEarned);
  state.reputationStars = safeDec(data.reputationStars);

  if (data.businesses) {
    for (const [id, bData] of Object.entries(data.businesses)) {
      if (state.businesses[id]) {
        state.businesses[id].owned = safeInt(bData.owned);
      }
    }
  }

  state.purchasedManagers = new Set(data.purchasedManagers || []);
  state.purchasedUpgrades = new Set(data.purchasedUpgrades || []);
  state.unlockedAchievements = new Set(data.unlockedAchievements || []);

  // Stats — defensive defaults for older saves that didn't have these
  const s = data.stats || {};
  state.stats.totalClicks = safeInt(s.totalClicks);
  state.stats.totalBusinessesBought = safeInt(s.totalBusinessesBought);
  state.stats.totalManagersHired = safeInt(s.totalManagersHired);
  state.stats.totalUpgradesBought = safeInt(s.totalUpgradesBought);
  state.stats.prestigeCount = safeInt(s.prestigeCount);
  state.stats.biggestCash = safeDec(s.biggestCash);
  state.stats.biggestMps = safeDec(s.biggestMps);
  state.stats.firstPlayedAt = safeInt(s.firstPlayedAt, Date.now());
  state.stats.totalPlayTimeSec = safeInt(s.totalPlayTimeSec);
  state.sessionStartedAt = Date.now(); // current session restarts at load
}

export function saveGame() {
  try {
    const data = buildSaveData();
    const jsonStr = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    const hash = simpleHash(jsonStr);
    localStorage.setItem(SAVE_KEY, encoded + '|' + hash);
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const [encoded, savedHash] = raw.split('|');
    const jsonStr = decodeURIComponent(escape(atob(encoded)));
    const hash = simpleHash(jsonStr);
    if (hash !== savedHash) return null; // tampered

    const data = JSON.parse(jsonStr);
    applyLoadedData(data);
    return { timestamp: data.timestamp || Date.now() };
  } catch (e) {
    console.warn('Load failed:', e);
    return null;
  }
}

/** Export current save as a portable Base64 string the player can copy
 *  to clipboard and paste into another browser / device. */
export function exportSave() {
  const data = buildSaveData();
  const jsonStr = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(jsonStr)));
}

/** Import a save string previously exported via `exportSave()`.
 *  Returns true on success, false on bad / corrupt input. */
export function importSave(encoded) {
  try {
    if (!encoded || typeof encoded !== 'string') return false;
    const cleaned = encoded.trim();
    const jsonStr = decodeURIComponent(escape(atob(cleaned)));
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;
    applyLoadedData(data);
    saveGame(); // persist the imported state to localStorage
    return true;
  } catch (e) {
    console.warn('Import failed:', e);
    return false;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
