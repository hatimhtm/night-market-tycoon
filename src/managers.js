import Decimal from 'break_eternity.js';
import { BUSINESSES } from './businesses.js';

let _state = null;
export function bindState(stateModule) { _state = stateModule; }

// ── Manager Definitions ─────────────────────────────────────────────
export const MANAGERS = BUSINESSES.map((biz, i) => ({
  id: 'mgr_' + biz.id,
  bizId: biz.id,
  name: biz.name + ' Manager',
  image: i % 2 === 0 ? 'assets/images/seller.png' : 'assets/images/seller (1).png',
  baseCost: biz.baseCost * 100,
}));

// ── Cost (affected by Staff Uniforms) ───────────────────────────────
export function getManagerCost(id) {
  const mgr = MANAGERS.find(m => m.id === id);
  if (!mgr || !_state) return new Decimal(Infinity);
  let cost = new Decimal(mgr.baseCost);
  if (_state.hasUpgrade('staff_uniforms')) cost = cost.mul(0.8);
  return cost.ceil();
}

// ── Buy ─────────────────────────────────────────────────────────────
export function buyManager(id) {
  const mgr = MANAGERS.find(m => m.id === id);
  if (!mgr || !_state) return false;
  if (_state.hasManager(id)) return false;
  const cost = getManagerCost(id);
  if (_state.spendMoney(cost)) {
    _state.addManager(id);
    // Start auto-running the business
    _state.setBusinessRunning(mgr.bizId, true);
    _state.setBusinessTimer(mgr.bizId, 0);
    return true;
  }
  return false;
}

export function canBuyManager(id) {
  if (!_state) return false;
  if (_state.hasManager(id)) return false;
  return _state.canAfford(getManagerCost(id));
}

// ── Visibility ──────────────────────────────────────────────────────
export function isManagerVisible(id) {
  const mgr = MANAGERS.find(m => m.id === id);
  if (!mgr || !_state) return false;
  if (_state.hasManager(id)) return true;
  return _state.getBusinessOwned(mgr.bizId) > 0;
}
