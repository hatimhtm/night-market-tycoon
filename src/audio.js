import { Howl, Howler } from 'howler';
import { isMuted } from './state.js';

// ── Sound Definitions ───────────────────────────────────────────────
const sounds = {};
const lastPlayed = {};
const RATE_LIMIT = 50; // ms

function loadSound(key, src, volume = 0.5) {
  sounds[key] = new Howl({ src: [src], volume, preload: true });
  lastPlayed[key] = 0;
}

export function initAudio() {
  loadSound('hover', 'assets/audio/rollover2.ogg', 0.3);
  loadSound('click', 'assets/audio/click_001.ogg', 0.5);
  loadSound('buy', 'assets/audio/chips-collide-1.ogg', 0.5);
  loadSound('error', 'assets/audio/error_004.ogg', 0.4);
  loadSound('unlock', 'assets/audio/powerUp2.ogg', 0.5);
  loadSound('milestone', 'assets/audio/jingles_PIZZI10.ogg', 0.6);
  loadSound('prestige1', 'assets/audio/jingles_HIT15.ogg', 0.6);
  loadSound('prestige2', 'assets/audio/level_up.ogg', 0.5);
}

function play(key) {
  if (isMuted()) return;
  const now = Date.now();
  if (now - lastPlayed[key] < RATE_LIMIT) return;
  lastPlayed[key] = now;
  if (sounds[key]) sounds[key].play();
}

export function playHover() { play('hover'); }
export function playClick() { play('click'); }
export function playBuy() { play('buy'); }
export function playError() { play('error'); }
export function playUnlock() { play('unlock'); }
export function playMilestone() { play('milestone'); }

export function playPrestige() {
  play('prestige1');
  setTimeout(() => play('prestige2'), 200);
}

export function unlockAudio() {
  if (Howler.ctx && Howler.ctx.state === 'suspended') {
    Howler.ctx.resume();
  }
}

export function suspendAudio() {
  try { if (Howler.ctx) Howler.ctx.suspend(); } catch (e) {}
}

export function resumeAudio() {
  try { if (Howler.ctx) Howler.ctx.resume(); } catch (e) {}
}
