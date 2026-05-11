import Decimal from 'break_eternity.js';

let _state = null;
export function bindState(stateModule) { _state = stateModule; }

// ── Upgrade Definitions (12 — extended from 7 in 1.0) ───────────────
// Costs scale exponentially; effects compound. Each upgrade unlocks
// once the player has enough cash; nothing is permanently gated by
// other upgrades, so the player chooses their own progression path.
export const UPGRADES = [
  {
    id: 'tip_jar',
    name: 'Tip Jar',
    image: 'assets/images/tips.png',
    cost: 500,
    description: '+10% Global Profit',
  },
  {
    id: 'express_checkout',
    name: 'Express Checkout',
    image: 'assets/images/cash-counter.png',
    cost: 10000,
    description: 'All bars fill 2× faster',
  },
  {
    id: 'secret_menus',
    name: 'Secret Menus',
    image: 'assets/images/menu.png',
    cost: 100000,
    description: 'Vending Machine & Coffee profit ×3',
  },
  {
    id: 'expanded_parking',
    name: 'Expanded Parking',
    image: 'assets/images/parking.png',
    cost: 5_000_000,
    description: 'Global ×5 multiplier',
  },
  {
    id: 'exotic_spices',
    name: 'Exotic Spices',
    image: 'assets/images/spices.png',
    cost: 50_000_000,
    description: 'Food trucks profit ×10',
  },
  {
    id: 'staff_uniforms',
    name: 'Staff Uniforms',
    image: 'assets/images/clothes.png',
    cost: 500_000_000,
    description: 'Manager costs −20%',
  },
  {
    id: 'sanitation',
    name: 'Sanitation',
    image: 'assets/images/garbage.png',
    cost: 5_000_000_000,
    description: 'Cost scaling 1.15 → 1.10',
  },
  // ── 2.0 expansion ────────────────────────────────────────────────
  {
    id: 'neon_signage',
    name: 'Neon Signage',
    image: 'assets/images/location-pin.png',
    cost: 50_000_000_000,
    description: 'Global ×2 multiplier · attracts more customers',
  },
  {
    id: 'rush_hour',
    name: 'Rush Hour',
    image: 'assets/images/cash-counter.png',
    cost: 500_000_000_000,
    description: 'All bars 1.5× faster (stacks with Express)',
  },
  {
    id: 'night_lights',
    name: 'Night Lights',
    image: 'assets/images/parking.png',
    cost: 5_000_000_000_000,
    description: 'Global ×3 multiplier · the market never sleeps',
  },
  {
    id: 'chain_synergy',
    name: 'Chain Synergy',
    image: 'assets/images/menu.png',
    cost: 50_000_000_000_000,
    description: 'Late-tier businesses (Floating Booth+) profit ×20',
  },
  {
    id: 'sanitation_ii',
    name: 'Sanitation II',
    image: 'assets/images/garbage.png',
    cost: 500_000_000_000_000,
    description: 'Cost scaling 1.10 → 1.08 (requires Sanitation)',
    requires: 'sanitation',
  },
  {
    id: 'vip_lounge',
    name: 'VIP Lounge',
    image: 'assets/images/clothes.png',
    cost: 5_000_000_000_000_000,
    description: 'Global ×10 multiplier — the apex upgrade',
  },
];

// ── Buy ─────────────────────────────────────────────────────────────
export function buyUpgrade(id) {
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg || !_state) return false;
  if (_state.hasUpgrade(id)) return false;
  if (upg.requires && !_state.hasUpgrade(upg.requires)) return false;
  const cost = new Decimal(upg.cost);
  if (_state.spendMoney(cost)) {
    _state.addUpgrade(id);
    return true;
  }
  return false;
}

export function canBuyUpgrade(id) {
  if (!_state) return false;
  if (_state.hasUpgrade(id)) return false;
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg) return false;
  if (upg.requires && !_state.hasUpgrade(upg.requires)) return false;
  return _state.canAfford(upg.cost);
}

/** True if the upgrade is unlocked for display (prerequisite met or no prereq). */
export function isUpgradeUnlocked(id) {
  if (!_state) return false;
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg) return false;
  if (!upg.requires) return true;
  return _state.hasUpgrade(upg.requires);
}
