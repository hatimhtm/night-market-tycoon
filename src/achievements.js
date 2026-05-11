import Decimal from 'break_eternity.js';

/** 13 achievements. Each unlocks once its `condition(getters)` returns true,
 *  then grants a permanent additive bonus to global profit. The bonus stacks
 *  with the prestige bonus (see businesses.getBusinessProfit).
 *
 *  Conditions take a `getters` bag instead of importing from state.js to
 *  avoid the circular dep that was already a pain in 1.0. */

export const ACHIEVEMENTS = [
  {
    id: 'ach_first_steps',
    title: 'First Steps',
    description: 'Own 5 of any single business',
    bonus: 0.01,
    condition: (g) => g.maxOwnedAcrossBusinesses() >= 5,
  },
  {
    id: 'ach_vendor',
    title: 'Vendor',
    description: 'Own 25 of any single business',
    bonus: 0.01,
    condition: (g) => g.maxOwnedAcrossBusinesses() >= 25,
  },
  {
    id: 'ach_empire',
    title: 'Empire Builder',
    description: 'Own 100 of any single business',
    bonus: 0.02,
    condition: (g) => g.maxOwnedAcrossBusinesses() >= 100,
  },
  {
    id: 'ach_diversified',
    title: 'Diversified',
    description: 'Own at least 1 of every business in the catalogue',
    bonus: 0.03,
    condition: (g) => g.businessIds().every((id) => g.businessOwned(id) >= 1),
  },
  {
    id: 'ach_manage',
    title: "Hire 'em All",
    description: 'Hire 10 managers',
    bonus: 0.02,
    condition: (g) => g.totalManagersHired() >= 10,
  },
  {
    id: 'ach_upgrades_10',
    title: 'Upgrade Junkie',
    description: 'Buy 10 upgrades',
    bonus: 0.03,
    condition: (g) => g.totalUpgradesBought() >= 10,
  },
  {
    id: 'ach_click_100',
    title: 'Click Warrior',
    description: 'Manually start 100 cycles',
    bonus: 0.01,
    condition: (g) => g.totalClicks() >= 100,
  },
  {
    id: 'ach_first_reset',
    title: 'First Reset',
    description: 'Prestige for the first time',
    bonus: 0.02,
    condition: (g) => g.prestigeCount() >= 1,
  },
  {
    id: 'ach_tycoon',
    title: 'Tycoon',
    description: 'Accumulate 100 reputation stars',
    bonus: 0.05,
    condition: (g) => g.reputationStars() >= 100,
  },
  {
    id: 'ach_millionaire',
    title: 'Millionaire',
    description: 'Hold $1M cash at any point',
    bonus: 0.01,
    condition: (g) => g.biggestCash().gte(new Decimal(1e6)),
  },
  {
    id: 'ach_billionaire',
    title: 'Billionaire',
    description: 'Hold $1B cash at any point',
    bonus: 0.02,
    condition: (g) => g.biggestCash().gte(new Decimal(1e9)),
  },
  {
    id: 'ach_cosmic',
    title: 'Cosmic',
    description: 'Hold $1T cash at any point',
    bonus: 0.05,
    condition: (g) => g.biggestCash().gte(new Decimal(1e12)),
  },
  {
    id: 'ach_marathon',
    title: 'Marathon',
    description: 'Play for 10 cumulative hours',
    bonus: 0.05,
    condition: (g) => g.totalPlayTimeSec() >= 36_000,
  },
];

/** Total additive bonus from unlocked achievement IDs. Returns a number that
 *  is added to the prestige bonus before multiplying business profit. */
export function getActiveBonus(unlockedIds) {
  const set = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds);
  let total = 0;
  for (const a of ACHIEVEMENTS) {
    if (set.has(a.id)) total += a.bonus;
  }
  return total;
}

/** Find newly-unlocked achievements given the current state getters and the
 *  set of already-unlocked IDs. Returns the unlocked achievement objects. */
export function checkAchievements(getters, alreadyUnlocked) {
  const set = alreadyUnlocked instanceof Set ? alreadyUnlocked : new Set(alreadyUnlocked);
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (set.has(a.id)) continue;
    try {
      if (a.condition(getters)) newly.push(a);
    } catch (e) {
      // Defensive: a bad getter shouldn't take the whole game down
      console.warn('Achievement check failed for', a.id, e);
    }
  }
  return newly;
}
