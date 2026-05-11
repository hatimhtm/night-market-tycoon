import Decimal from 'break_eternity.js';
import '../style.css';
import {
  initState, getMoney, addMoney, canAfford,
  getBusinessOwned, setBusinessOwned, getBusinessTimer, setBusinessTimer,
  isBusinessRunning, setBusinessRunning, hasManager, hasManagerForBiz,
  hasUpgrade, isMuted, setMuted,
  getReputationStars, getPrestigeBonus, getRankImage, getRankTitle,
  calculatePrestigeReward, canPrestige, doPrestige,
  saveGame, loadGame,
  recordClick, getStats, getTotalPlayTimeSec,
  getAchievementCount, getAchievementTotal, getAchievementIds,
  hasAchievement, unlockAchievement, getAchievementGetters,
  getLifetimeEarned, getPrestigeCount,
  exportSave, importSave,
} from './state.js';
import {
  BUSINESSES, MILESTONES, bindState as bindBizState,
  getBusinessCost, getBusinessProfit, getBusinessTime,
  buyBusiness, canBuyBusiness, isBusinessVisible,
  getTotalMPS, calculateOfflineProgress,
} from './businesses.js';
import { MANAGERS, bindState as bindMgrState, getManagerCost, buyManager, canBuyManager, isManagerVisible } from './managers.js';
import { UPGRADES, bindState as bindUpgState, buyUpgrade, canBuyUpgrade, isUpgradeUnlocked } from './upgrades.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { initAudio, playClick, playBuy, playError, playUnlock, playMilestone, playPrestige, playHover, unlockAudio } from './audio.js';
import { initAds, showRewardedAd } from './ad-sdk.js';
import * as stateModule from './state.js';

// ── Format Numbers ──────────────────────────────────────────────────
function fmt(val) {
  if (!(val instanceof Decimal)) val = new Decimal(val);
  if (val.isNan() || !val.isFinite()) return '0';
  const n = val.toNumber();
  if (n < 1000) return Math.floor(n).toLocaleString();
  if (n < 1e6) return (Math.floor(n / 100) / 10).toFixed(1) + 'K';
  if (n < 1e9) return (Math.floor(n / 1e4) / 100).toFixed(2) + 'M';
  if (n < 1e12) return (Math.floor(n / 1e7) / 100).toFixed(2) + 'B';
  if (n < 1e15) return (Math.floor(n / 1e10) / 100).toFixed(2) + 'T';
  if (n < 1e18) return (Math.floor(n / 1e13) / 100).toFixed(2) + 'Qa';
  if (n < 1e21) return (Math.floor(n / 1e16) / 100).toFixed(2) + 'Qi';
  return val.toExponential(2);
}

function fmtTime(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

// ── State ───────────────────────────────────────────────────────────
let activeTab = 'businesses';
let activeMultiplier = 1; // 1, 5, 10, 25, 'max'
let saveTimer = 0;
let pendingFloats = [];
let adCooldownEnd = 0; // timestamp when ad cooldown ends
const AD_COOLDOWN_MS = 180000; // 3 minutes

// ── DOM Cache ───────────────────────────────────────────────────────
const dom = {};
const cachedText = {};

function $(id) { return document.getElementById(id); }

function setText(el, text) {
  if (!el) return;
  const key = el.id || el.className;
  if (cachedText[key] !== text) {
    cachedText[key] = text;
    el.innerHTML = text; // Allow HTML spans for cost formatting
  }
}

// ── Init ────────────────────────────────────────────────────────────
function init() {
  // Bind state to modules (break circular dependency)
  bindBizState(stateModule);
  bindMgrState(stateModule);
  bindUpgState(stateModule);

  initState();
  initAudio();

  // Cache DOM
  dom.moneyAmount = $('money-amount');
  dom.moneyPerSec = $('money-per-sec');
  dom.rankImg = $('rank-img');
  dom.starCount = $('star-count');
  dom.starBonus = $('star-bonus');
  dom.prestigeBtn = $('prestige-btn');
  dom.muteBtn = $('mute-btn');
  dom.tabContent = $('tab-content');
  dom.offlineModal = $('offline-modal');
  dom.offlineAmount = $('offline-amount');
  dom.prestigeModal = $('prestige-modal');
  dom.prestigeReward = $('prestige-reward-text');
  dom.milestoneOverlay = $('milestone-overlay');
  dom.milestoneText = $('milestone-text');
  dom.wipeBtn = $('wipe-btn');
  dom.wipeModal = $('wipe-modal');
  dom.wipeConfirmBtn = $('wipe-confirm-btn');
  dom.wipeCancelBtn = $('wipe-cancel-btn');
  dom.watchAdBtn = $('watch-ad-btn');
  dom.adBtnSub = $('ad-btn-sub');
  dom.adRewardModal = $('ad-reward-modal');
  dom.adRewardAmount = $('ad-reward-amount');
  dom.adWatchBtn = $('ad-watch-btn');
  dom.adCancelBtn = $('ad-cancel-btn');
  dom.creditsBtn = $('credits-btn');
  dom.creditsModal = $('credits-modal');
  dom.creditsCloseBtn = $('credits-close-btn');

  // Load save
  const saveData = loadGame();
  if (saveData) {
    const offlineEarnings = calculateOfflineProgress(saveData.timestamp);
    if (offlineEarnings.gt(0)) {
      showOfflineModal(offlineEarnings);
    }
  }

  setupTabs();
  setupMultipliers();
  setupLeftPanel();
  setupWipeModal();
  setupAdSystem();
  setupCreditsModal();
  setupImportModal();
  setupKeyboardShortcuts();
  renderActiveTab();
  updateLeftPanel();
  updateMuteBtn();

  // First interaction for audio
  const unlockOnce = () => {
    unlockAudio();
    document.removeEventListener('click', unlockOnce);
    document.removeEventListener('touchstart', unlockOnce);
  };
  document.addEventListener('click', unlockOnce);
  document.addEventListener('touchstart', unlockOnce);

  // Start loops
  lastLogicTime = Date.now();
  setInterval(logicTick, 100);
  requestAnimationFrame(renderLoop);
}

// ── Logic Loop (100ms, Date.now delta) ──────────────────────────────
let lastLogicTime = Date.now();

function logicTick() {
  const now = Date.now();
  const delta = Math.min((now - lastLogicTime) / 1000, 2); // cap 2s
  lastLogicTime = now;

  for (const biz of BUSINESSES) {
    const owned = getBusinessOwned(biz.id);
    if (owned === 0) continue;

    const managed = hasManagerForBiz(biz.id);
    const running = isBusinessRunning(biz.id);

    if (!managed && !running) continue;

    const time = getBusinessTime(biz.id);
    let timer = getBusinessTimer(biz.id);
    timer += delta / time;

    if (timer >= 1) {
      const profit = getBusinessProfit(biz.id);
      const cycles = Math.floor(timer);

      if (managed) {
        addMoney(profit.mul(cycles));
        timer = timer - cycles;
        pendingFloats.push({ bizId: biz.id, amount: profit.mul(cycles) });
      } else {
        addMoney(profit);
        timer = 0;
        setBusinessRunning(biz.id, false);
        pendingFloats.push({ bizId: biz.id, amount: profit });
      }
    }

    setBusinessTimer(biz.id, timer);
  }

  // Save periodically
  saveTimer += delta * 1000;
  if (saveTimer >= 10000) {
    saveTimer = 0;
    saveGame();
  }

  // Achievement check (cheap; runs every tick is fine but throttle to ~1s)
  achievementCheckTimer += delta * 1000;
  if (achievementCheckTimer >= 1000) {
    achievementCheckTimer = 0;
    runAchievementCheck();
  }

  // Update left panel
  updateLeftPanel();
}

let achievementCheckTimer = 0;

function runAchievementCheck() {
  const getters = getAchievementGetters();
  const unlocked = new Set(getAchievementIds());
  const newly = checkAchievements(getters, unlocked);
  for (const ach of newly) {
    unlockAchievement(ach.id);
    playUnlock();
    spawnToast(`★ ${ach.title} — ${ach.description}`, 'success');
  }
  if (newly.length > 0 && activeTab === 'achievements') renderAchievementsTab();
}

// ── Keyboard shortcuts ─────────────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore when the user is typing into the import textarea
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;

    // Esc closes any open modal
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
      return;
    }

    const TABS = ['businesses', 'managers', 'upgrades', 'achievements', 'stats', 'settings'];
    if (e.key >= '1' && e.key <= '6') {
      const idx = parseInt(e.key, 10) - 1;
      const target = TABS[idx];
      if (!target) return;
      const btn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
      if (btn) btn.click();
      return;
    }

    if (e.key === 'm' || e.key === 'M') {
      setMuted(!isMuted());
      updateMuteBtn();
      return;
    }

    if (e.key === 'p' || e.key === 'P') {
      if (canPrestige()) dom.prestigeBtn?.click();
      return;
    }
  });
}

// ── Render Loop (60fps, visuals only) ───────────────────────────────
function renderLoop() {
  // Update progress bars
  if (activeTab === 'businesses') {
    for (const biz of BUSINESSES) {
      const owned = getBusinessOwned(biz.id);

      if (owned > 0) {
        const bar = $('bar-' + biz.id);
        if (bar) {
          const timer = getBusinessTimer(biz.id);
          bar.style.width = Math.min(timer * 100, 100) + '%';
        }
      }

      // Update buy button affordability
      const btn = $('buy-' + biz.id);
      if (btn) {
        const mult = owned === 0 ? 1 : getActiveMultiplier();
        const aff = canBuyBusiness(biz.id, mult);
        btn.classList.toggle('btn-disabled', !aff);

        const { cost, count } = getBusinessCost(biz.id, mult);

        const costSpan = btn.querySelector('.buy-cost');
        if (costSpan) {
          const newText = '$' + fmt(cost);
          if (costSpan.textContent !== newText) costSpan.textContent = newText;
        }

        const countSpan = btn.querySelector('.buy-count');
        if (countSpan) {
          // "Buy x0" looks broken — when the player can't afford even one on
          // 'max', say "Need" + the cost-of-1 instead so the button still
          // communicates something useful.
          const newCountText =
            count === 0 ? 'Need' : 'Buy x' + count;
          if (countSpan.textContent !== newCountText) countSpan.textContent = newCountText;
        }
      }

      // Update locked visual state
      const row = $('row-' + biz.id);
      if (row && owned === 0) {
        const aff = canBuyBusiness(biz.id, 1);
        row.classList.toggle('biz-locked', !aff);
      }
    }
  } else if (activeTab === 'managers') {
    for (const mgr of MANAGERS) {
      if (!isManagerVisible(mgr.id)) continue;
      const btn = document.querySelector(`[data-mgr-buy="${mgr.id}"]`);
      if (btn) {
        const aff = canBuyManager(mgr.id);
        btn.classList.toggle('btn-disabled', !aff);
      }
    }
  } else if (activeTab === 'upgrades') {
    for (const upg of UPGRADES) {
      const btn = document.querySelector(`[data-upg-buy="${upg.id}"]`);
      if (btn) {
        const aff = canBuyUpgrade(upg.id);
        btn.classList.toggle('btn-disabled', !aff);
      }
    }
  }

  // Process pending floating numbers
  while (pendingFloats.length > 0) {
    const f = pendingFloats.shift();
    spawnFloatingNumber(f.bizId, f.amount);
  }

  requestAnimationFrame(renderLoop);
}

// ── Multiplier State ────────────────────────────────────────────────
export function getActiveMultiplier() { return activeMultiplier; }

function setupMultipliers() {
  document.querySelectorAll('.mult-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();

      const val = btn.dataset.mult;
      activeMultiplier = val === 'max' ? 'max' : parseInt(val, 10);

      document.querySelectorAll('.mult-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      renderActiveTab(); // Re-render to show updated bulk prices
    });
    btn.addEventListener('mouseenter', () => playHover());
  });
}

// ── Left Panel Updates ──────────────────────────────────────────────
function updateLeftPanel() {
  setText(dom.moneyAmount, '$' + fmt(getMoney()));
  const mps = getTotalMPS();
  setText(dom.moneyPerSec, '$' + fmt(mps) + '/sec');
  stateModule.setBiggestMps(mps);

  const stars = getReputationStars().toNumber();
  setText(dom.starCount, Math.floor(stars) + '');
  // Total bonus = prestige + achievement, both render as one number
  const bonus = getPrestigeBonus() + stateModule.getAchievementBonus();
  setText(dom.starBonus, '+' + (bonus * 100).toFixed(0) + '% Profit');

  // Rank image
  const rankSrc = getRankImage();
  if (dom.rankImg && dom.rankImg.src !== rankSrc) {
    dom.rankImg.src = rankSrc;
  }

  // Prestige button
  if (dom.prestigeBtn) {
    dom.prestigeBtn.disabled = !canPrestige();
  }
}

// ── Tab System ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      unlockAudio();
      playClick();
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderActiveTab();
    });
    tab.addEventListener('mouseenter', () => playHover());
  });
}

function renderActiveTab() {
  if (!dom.tabContent) return;
  switch (activeTab) {
    case 'businesses':   renderBusinessTab();   break;
    case 'managers':     renderManagerTab();    break;
    case 'upgrades':     renderUpgradeTab();    break;
    case 'achievements': renderAchievementsTab(); break;
    case 'stats':        renderStatsTab();      break;
    case 'settings':     renderSettingsTab();   break;
  }
}

// ── Achievements tab ───────────────────────────────────────────────
function renderAchievementsTab() {
  const unlockedCount = getAchievementCount();
  const total = getAchievementTotal();
  let html = `<div class="section-header">${unlockedCount} / ${total} unlocked · each grants a permanent profit bonus</div>`;

  for (const ach of ACHIEVEMENTS) {
    const owned = hasAchievement(ach.id);
    html += `
      <div class="upgrade-row ${owned ? 'owned-row' : ''}">
        <div class="ach-icon ${owned ? 'ach-unlocked' : 'ach-locked'}">${owned ? '★' : '?'}</div>
        <div class="upgrade-info">
          <div class="upgrade-name">${owned ? ach.title : '???'}</div>
          <div class="upgrade-desc">${ach.description} · <span class="ach-bonus">+${(ach.bonus * 100).toFixed(0)}% profit</span></div>
        </div>
        ${owned ? '<div class="owned-badge">UNLOCKED</div>' : '<div class="locked-badge">LOCKED</div>'}
      </div>`;
  }
  dom.tabContent.innerHTML = html;
}

// ── Stats tab ──────────────────────────────────────────────────────
function renderStatsTab() {
  const stats = getStats();
  const playSec = getTotalPlayTimeSec();
  const hours = Math.floor(playSec / 3600);
  const mins = Math.floor((playSec % 3600) / 60);
  const playTimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const totalBusinessesOwned = BUSINESSES.reduce((sum, b) => sum + getBusinessOwned(b.id), 0);

  const rows = [
    ['Lifetime earnings',     '$' + fmt(getLifetimeEarned())],
    ['Biggest cash held',     '$' + fmt(stats.biggestCash)],
    ['Reputation stars',      Math.floor(getReputationStars().toNumber()).toLocaleString()],
    ['Rank',                  getRankTitle()],
    ['Prestiges',             stats.prestigeCount.toLocaleString()],
    ['Total businesses bought', stats.totalBusinessesBought.toLocaleString()],
    ['Businesses currently owned', totalBusinessesOwned.toLocaleString()],
    ['Managers hired',        stats.totalManagersHired.toLocaleString()],
    ['Upgrades bought',       stats.totalUpgradesBought.toLocaleString()],
    ['Manual clicks',         stats.totalClicks.toLocaleString()],
    ['Achievements',          `${getAchievementCount()} / ${getAchievementTotal()}`],
    ['Time played',           playTimeStr],
    ['First played',          new Date(stats.firstPlayedAt).toLocaleDateString()],
  ];

  let html = '<div class="section-header">Your night-market career, by the numbers</div><div class="stats-grid">';
  for (const [label, value] of rows) {
    html += `<div class="stats-row"><span class="stats-label">${label}</span><span class="stats-value">${value}</span></div>`;
  }
  html += '</div>';
  dom.tabContent.innerHTML = html;
}

// ── Settings tab ───────────────────────────────────────────────────
function renderSettingsTab() {
  const html = `
    <div class="section-header">Save management & preferences</div>
    <div class="settings-card">
      <div class="settings-title">Backup your save</div>
      <div class="settings-desc">Copy this code somewhere safe (or to another device).</div>
      <div class="settings-actions">
        <button class="modal-btn" id="settings-export-btn">Copy save to clipboard</button>
        <button class="modal-btn btn-cancel" id="settings-import-btn">Import from clipboard</button>
      </div>
    </div>
    <div class="settings-card">
      <div class="settings-title">Audio</div>
      <div class="settings-desc">Mute all sounds (also toggleable from the left panel).</div>
      <div class="settings-actions">
        <button class="modal-btn" id="settings-mute-toggle">${isMuted() ? '🔇 Unmute' : '🔊 Mute'}</button>
      </div>
    </div>
    <div class="settings-card">
      <div class="settings-title">Keyboard shortcuts</div>
      <div class="settings-desc">
        <code>1</code>–<code>6</code> switch tabs · <code>M</code> mute ·
        <code>P</code> prestige · <code>Esc</code> close any modal
      </div>
    </div>
  `;
  dom.tabContent.innerHTML = html;

  const exportBtn = $('settings-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      playClick();
      const str = exportSave();
      try {
        await navigator.clipboard.writeText(str);
        spawnToast('Save copied to clipboard');
      } catch {
        // Fallback if clipboard API is blocked (insecure context, etc.)
        prompt('Copy this save string:', str);
      }
    });
  }
  const importBtn = $('settings-import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      playClick();
      openImportModal();
    });
  }
  const muteBtn = $('settings-mute-toggle');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      updateMuteBtn();
      renderSettingsTab();
    });
  }
}

// ── Toast notifications ───────────────────────────────────────────
function spawnToast(text, kind = 'info') {
  const stack = $('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  stack.appendChild(el);
  // Auto-dismiss after 4.5s; CSS animates fade-out
  setTimeout(() => {
    el.classList.add('toast-fade');
    setTimeout(() => el.remove(), 400);
  }, 4500);
}

// ── Import save modal ─────────────────────────────────────────────
function openImportModal() {
  const modal = $('import-modal');
  if (!modal) return;
  const ta = $('import-textarea');
  if (ta) ta.value = '';
  modal.classList.remove('hidden');
}

function setupImportModal() {
  const modal = $('import-modal');
  if (!modal) return;
  const confirmBtn = $('import-confirm-btn');
  const cancelBtn = $('import-cancel-btn');
  const ta = $('import-textarea');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      playClick();
      const str = ta ? ta.value : '';
      if (!str.trim()) {
        spawnToast('Paste a save string first', 'error');
        return;
      }
      if (importSave(str)) {
        spawnToast('Save imported — reloading…');
        setTimeout(() => window.location.reload(), 700);
      } else {
        spawnToast('Invalid save string', 'error');
        playError();
      }
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
}

// ── Business Tab ────────────────────────────────────────────────────
function renderBusinessTab() {
  let html = '';

  for (const biz of BUSINESSES) {
    if (!isBusinessVisible(biz.id)) continue;

    const owned = getBusinessOwned(biz.id);
    const mult = owned === 0 ? 1 : getActiveMultiplier();
    const { cost, count } = getBusinessCost(biz.id, mult);
    const profit = getBusinessProfit(biz.id);
    const time = getBusinessTime(biz.id);
    const aff = canBuyBusiness(biz.id, mult);
    const managed = hasManagerForBiz(biz.id);
    const timer = getBusinessTimer(biz.id);
    const progressW = owned > 0 ? Math.min(timer * 100, 100) : 0;

    const isLocked = owned === 0 && !aff;

    html += `
      <div class="biz-card ${isLocked ? 'biz-locked' : ''}" id="row-${biz.id}">
        <div class="biz-icon-wrap">
          <img src="${biz.image}" class="biz-icon" alt="${biz.name}" draggable="false" data-biz-click="${biz.id}">
          <div class="biz-level-badge">${owned}</div>
        </div>
        <div class="biz-middle">
          <div class="biz-header">
            <span class="biz-name">${biz.name}${managed ? '<span class="auto-badge">AUTO</span>' : ''}</span>
            <span class="biz-level">Lv. ${owned}</span>
          </div>
          <div class="biz-profit">${owned > 0 ? '$' + fmt(profit) + ' / cycle' : 'Not owned'}</div>
          <div class="progress-track" data-biz-click="${biz.id}">
            <div class="progress-fill" id="bar-${biz.id}" style="width:${progressW}%"></div>
            <span class="progress-time">${owned > 0 ? fmtTime(time) : 'Locked'}</span>
          </div>
        </div>
        <button class="buy-btn ${aff ? '' : 'btn-disabled'}" id="buy-${biz.id}" data-biz-buy="${biz.id}">
          <span class="buy-count">${count === 0 ? 'Need' : 'Buy x' + count}</span><br><span class="buy-cost">$${fmt(cost)}</span>
        </button>
      </div>`;
  }

  dom.tabContent.innerHTML = html;

  // Buy handlers
  dom.tabContent.querySelectorAll('[data-biz-buy]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      unlockAudio();
      const id = btn.dataset.bizBuy;
      const owned = getBusinessOwned(id);
      const mult = owned === 0 ? 1 : getActiveMultiplier();
      const result = buyBusiness(id, mult);
      if (result.success) {
        playBuy();
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 350);

        if (result.milestone) {
          showMilestone(id, result.milestone);
        }

        renderBusinessTab();
      } else {
        playError();
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 350);
      }
    });
    btn.addEventListener('mouseenter', () => playHover());
  });

  // Click-to-run handlers
  dom.tabContent.querySelectorAll('[data-biz-click]').forEach(icon => {
    icon.addEventListener('click', () => {
      unlockAudio();
      const id = icon.dataset.bizClick;
      const owned = getBusinessOwned(id);
      if (owned === 0) return;
      if (hasManagerForBiz(id)) return; // manager handles it
      if (isBusinessRunning(id)) return; // already running

      playClick();
      recordClick();
      setBusinessRunning(id, true);
      setBusinessTimer(id, 0);
    });
  });
}

// ── Manager Tab ─────────────────────────────────────────────────────
function renderManagerTab() {
  let html = '<div class="section-header">Hire managers for auto-production</div>';
  let anyVisible = false;

  for (const mgr of MANAGERS) {
    if (!isManagerVisible(mgr.id)) continue;
    anyVisible = true;

    const owned = hasManager(mgr.id);
    const cost = getManagerCost(mgr.id);
    const aff = canBuyManager(mgr.id);

    html += `
      <div class="upgrade-row ${owned ? 'owned-row' : ''}">
        <img src="${mgr.image}" class="upgrade-img" alt="${mgr.name}" draggable="false">
        <div class="upgrade-info">
          <div class="upgrade-name">${mgr.name}</div>
          <div class="upgrade-desc">Auto-runs ${mgr.name.replace(' Manager', '')}</div>
        </div>
        ${owned
        ? '<div class="owned-badge">HIRED</div>'
        : `<button class="upgrade-buy-btn ${aff ? '' : 'btn-disabled'}" data-mgr-buy="${mgr.id}">$${fmt(cost)}</button>`
      }
      </div>`;
  }

  if (!anyVisible) {
    html += '<div class="section-header">Buy a business first to see managers!</div>';
  }

  dom.tabContent.innerHTML = html;

  dom.tabContent.querySelectorAll('[data-mgr-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      const id = btn.dataset.mgrBuy;
      if (buyManager(id)) {
        playUnlock();
        renderManagerTab();
        updateLeftPanel();
      } else {
        playError();
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 350);
      }
    });
    btn.addEventListener('mouseenter', () => playHover());
  });
}

// ── Upgrade Tab ─────────────────────────────────────────────────────
function renderUpgradeTab() {
  let html = '<div class="section-header">Permanent upgrades to boost your empire</div>';

  for (const upg of UPGRADES) {
    const owned = hasUpgrade(upg.id);
    const aff = canBuyUpgrade(upg.id);

    html += `
      <div class="upgrade-row ${owned ? 'owned-row' : ''}">
        <img src="${upg.image}" class="upgrade-img" alt="${upg.name}" draggable="false">
        <div class="upgrade-info">
          <div class="upgrade-name">${upg.name}</div>
          <div class="upgrade-desc">${upg.description}</div>
        </div>
        ${owned
        ? '<div class="owned-badge">ACTIVE</div>'
        : `<button class="upgrade-buy-btn ${aff ? '' : 'btn-disabled'}" data-upg-buy="${upg.id}">$${fmt(upg.cost)}</button>`
      }
      </div>`;
  }

  dom.tabContent.innerHTML = html;

  dom.tabContent.querySelectorAll('[data-upg-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      const id = btn.dataset.upgBuy;
      if (buyUpgrade(id)) {
        playUnlock();
        renderUpgradeTab();
      } else {
        playError();
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 350);
      }
    });
    btn.addEventListener('mouseenter', () => playHover());
  });
}

// ── Left Panel Setup ────────────────────────────────────────────────
function setupLeftPanel() {
  // Prestige button
  if (dom.prestigeBtn) {
    dom.prestigeBtn.addEventListener('click', () => {
      unlockAudio();
      if (!canPrestige()) {
        playError();
        return;
      }
      showPrestigeModal();
    });
  }

  // Mute button
  if (dom.muteBtn) {
    dom.muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      updateMuteBtn();
    });
  }
}

function updateMuteBtn() {
  if (dom.muteBtn) dom.muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}

// ── Floating Numbers ────────────────────────────────────────────────
function spawnFloatingNumber(bizId, amount) {
  const row = $('row-' + bizId);
  if (!row) return;

  const el = document.createElement('div');
  el.className = 'float-number';
  el.innerHTML = `<img src="./assets/particles/spark_01.png" alt="" draggable="false"><span>+ $${fmt(amount)}</span>`;
  el.style.left = (20 + Math.random() * 40) + '%';
  el.style.top = '30%';
  row.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ── Milestone Celebration ───────────────────────────────────────────
function showMilestone(bizId, level) {
  playMilestone();

  // Show overlay text
  if (dom.milestoneOverlay && dom.milestoneText) {
    const biz = BUSINESSES.find(b => b.id === bizId);
    dom.milestoneText.textContent = `${biz ? biz.name : ''} Level ${level}! SPEED x2!`;
    dom.milestoneOverlay.classList.remove('hidden');
    setTimeout(() => dom.milestoneOverlay.classList.add('hidden'), 1500);
  }

  // Spawn star particles
  const row = $('row-' + bizId);
  if (row) {
    const rect = row.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const star = document.createElement('div');
      star.className = 'star-particle';
      star.innerHTML = '<img src="./assets/particles/star_01.png" alt="" draggable="false">';
      star.style.position = 'fixed';
      star.style.left = (rect.left + Math.random() * rect.width) + 'px';
      star.style.top = (rect.top + Math.random() * rect.height) + 'px';
      star.style.animationDelay = (i * 0.06) + 's';
      document.body.appendChild(star);
      star.addEventListener('animationend', () => star.remove());
    }
  }
}

// ── Offline Modal ───────────────────────────────────────────────────
function showOfflineModal(amount) {
  if (!dom.offlineModal) return;
  if (dom.offlineAmount) dom.offlineAmount.textContent = '$' + fmt(amount);
  dom.offlineModal.classList.remove('hidden');

  $('offline-collect-btn').onclick = () => {
    unlockAudio();
    addMoney(amount);
    dom.offlineModal.classList.add('hidden');
    playBuy();
  };
}

// ── Prestige Modal ──────────────────────────────────────────────────
function showPrestigeModal() {
  if (!dom.prestigeModal) return;
  const reward = calculatePrestigeReward();
  if (dom.prestigeReward) dom.prestigeReward.textContent = '+' + fmt(reward) + ' Stars';
  dom.prestigeModal.classList.remove('hidden');

  $('prestige-confirm-btn').onclick = () => {
    unlockAudio();
    const earned = doPrestige();
    dom.prestigeModal.classList.add('hidden');
    playPrestige();
    renderActiveTab();
    updateLeftPanel();
  };

  $('prestige-cancel-btn').onclick = () => {
    dom.prestigeModal.classList.add('hidden');
  };
}

// ── Wipe Modal ──────────────────────────────────────────────────────
function setupWipeModal() {
  if (!dom.wipeBtn || !dom.wipeModal) return;

  dom.wipeBtn.addEventListener('click', () => {
    playClick();
    dom.wipeModal.classList.remove('hidden');
  });

  dom.wipeConfirmBtn.addEventListener('click', () => {
    playPrestige();
    stateModule.clearSave();
    window.location.reload();
  });

  dom.wipeCancelBtn.addEventListener('click', () => {
    playClick();
    dom.wipeModal.classList.add('hidden');
  });
}

// ── Rewarded Ad System ──────────────────────────────────────────────
function getAdReward() {
  // Industry standard: 2 hours of current income
  // With a minimum of $100 so early players still get something useful
  const mps = getTotalMPS();
  const twoHoursIncome = mps.mul(7200); // 2 hours = 7200 seconds
  const minimum = new Decimal(100);
  return Decimal.max(twoHoursIncome, minimum);
}

function setupAdSystem() {
  // Initialize the ad SDK
  let wasMutedBeforeAd = false;
  initAds({
    onPause: () => {
      // Save current mute state, then mute during ad
      wasMutedBeforeAd = isMuted();
      if (!wasMutedBeforeAd) setMuted(true);
    },
    onResume: () => {
      // Restore original mute state after ad
      if (!wasMutedBeforeAd) setMuted(false);
      updateMuteBtn();
    },
  });

  if (!dom.watchAdBtn) return;

  // Watch Ad button click → show reward modal
  dom.watchAdBtn.addEventListener('click', () => {
    if (Date.now() < adCooldownEnd) return; // still on cooldown

    playClick();
    const reward = getAdReward();
    if (dom.adRewardAmount) dom.adRewardAmount.textContent = '$' + fmt(reward);
    if (dom.adRewardModal) dom.adRewardModal.classList.remove('hidden');
  });

  // "Watch Now" button in the modal → play ad
  if (dom.adWatchBtn) {
    dom.adWatchBtn.addEventListener('click', async () => {
      unlockAudio();
      if (dom.adRewardModal) dom.adRewardModal.classList.add('hidden');

      const reward = getAdReward();
      const success = await showRewardedAd();

      if (success) {
        addMoney(reward);
        playBuy();

        // Start cooldown
        adCooldownEnd = Date.now() + AD_COOLDOWN_MS;
        updateAdButton();

        // Celebration — spawn some star particles
        for (let i = 0; i < 10; i++) {
          const star = document.createElement('div');
          star.className = 'star-particle';
          star.innerHTML = '<img src="./assets/particles/star_01.png" alt="" draggable="false">';
          star.style.position = 'fixed';
          star.style.left = (20 + Math.random() * 60) + '%';
          star.style.top = (30 + Math.random() * 40) + '%';
          star.style.animationDelay = (i * 0.08) + 's';
          document.body.appendChild(star);
          star.addEventListener('animationend', () => star.remove());
        }
      } else {
        playError();
      }
    });
  }

  // "No Thanks" button
  if (dom.adCancelBtn) {
    dom.adCancelBtn.addEventListener('click', () => {
      playClick();
      if (dom.adRewardModal) dom.adRewardModal.classList.add('hidden');
    });
  }

  // Start cooldown update loop
  setInterval(updateAdButton, 1000);
}

function updateAdButton() {
  if (!dom.watchAdBtn || !dom.adBtnSub) return;

  const now = Date.now();
  if (now < adCooldownEnd) {
    const remaining = Math.ceil((adCooldownEnd - now) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    dom.watchAdBtn.classList.add('on-cooldown');
    dom.adBtnSub.textContent = `Ready in ${mins}:${secs.toString().padStart(2, '0')}`;
  } else {
    dom.watchAdBtn.classList.remove('on-cooldown');
    dom.adBtnSub.textContent = 'Watch ad for rewards';
  }
}

// ── Credits Modal ───────────────────────────────────────────────────
function setupCreditsModal() {
  if (!dom.creditsBtn || !dom.creditsModal) return;

  dom.creditsBtn.addEventListener('click', () => {
    playClick();
    dom.creditsModal.classList.remove('hidden');
  });

  if (dom.creditsCloseBtn) {
    dom.creditsCloseBtn.addEventListener('click', () => {
      playClick();
      dom.creditsModal.classList.add('hidden');
    });
  }
}

// ── Boot ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
