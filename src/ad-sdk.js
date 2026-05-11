/**
 * Ad SDK Abstraction Layer for Night Market Tycoon
 * 
 * Supports three platforms:
 *  - 'gamedistribution' → GameDistribution SDK (gdsdk)
 *  - 'crazygames'       → CrazyGames SDK
 *  - 'stub'             → No real ads (for testing / Y8 which handles ads itself)
 * 
 * Switch platform by changing AD_PLATFORM below.
 * Each platform build should only change this one constant.
 */

// ═══════════════════════════════════════════════════════════════════
// 🔧 CHANGE THIS PER BUILD
// ═══════════════════════════════════════════════════════════════════
export const AD_PLATFORM = 'crazygames'; // 'gamedistribution' | 'crazygames' | 'stub'

// ── State ────────────────────────────────────────────────────────
let _onPause = null;  // callback to pause & mute game
let _onResume = null; // callback to resume game
let _initialized = false;

/**
 * Initialize the ad SDK.
 * @param {Object} opts
 * @param {Function} opts.onPause  — called when an ad is about to play (pause game, mute audio)
 * @param {Function} opts.onResume — called when ad finishes or is skipped (resume game)
 * @param {string}   [opts.gameId] — GameDistribution Game Hash (only needed for GD)
 */
export function initAds({ onPause, onResume, gameId } = {}) {
    _onPause = onPause || (() => { });
    _onResume = onResume || (() => { });

    if (AD_PLATFORM === 'gamedistribution') {
        _initGameDistribution(gameId);
    } else if (AD_PLATFORM === 'crazygames') {
        _initCrazyGames();
    } else {
        // stub — nothing to init
        _initialized = true;
    }
}

/**
 * Show a rewarded video ad.
 * @returns {Promise<boolean>} — resolves true if ad was watched, false if skipped/error
 */
export function showRewardedAd() {
    if (AD_PLATFORM === 'gamedistribution') {
        return _showRewardedGD();
    } else if (AD_PLATFORM === 'crazygames') {
        return _showRewardedCG();
    } else {
        return _showRewardedStub();
    }
}

// ═══════════════════════════════════════════════════════════════════
// GameDistribution Implementation
//
// The GD SDK is loaded via <script> in index.html, which sets up
// GD_OPTIONS with gameId and an onEvent callback. That callback
// dispatches custom window events: 'gd-pause', 'gd-resume', 'gd-reward'.
//
// To show a rewarded ad we call gdsdk.showAd('rewarded').
// The entire ad lifecycle (pause → reward → resume) is handled
// via those window events. We use a simple state machine to
// track whether the reward was granted before the ad ended.
// ═══════════════════════════════════════════════════════════════════

// GD ad state machine
let _gdRewardResolve = null;   // promise resolve function for current ad
let _gdRewardGranted = false;  // true if SDK_REWARDED_WATCH_COMPLETE fired

function _initGameDistribution(gameId) {
    // ── Pause: ad is about to play ──
    window.addEventListener('gd-pause', () => {
        console.log('[AdSDK] GD event: SDK_GAME_PAUSE');
        if (_onPause) _onPause();
    });

    // ── Resume: ad has ended (watched, skipped, or errored) ──
    window.addEventListener('gd-resume', () => {
        console.log('[AdSDK] GD event: SDK_GAME_START');
        if (_onResume) _onResume();

        // Resolve the ad promise now that the ad flow is fully done
        if (_gdRewardResolve) {
            const wasGranted = _gdRewardGranted;
            console.log('[AdSDK] Ad flow ended. Reward granted:', wasGranted);
            _gdRewardResolve(wasGranted);
            _gdRewardResolve = null;
            _gdRewardGranted = false;
        }
    });

    // ── Reward: user watched the rewarded ad to completion ──
    window.addEventListener('gd-reward', () => {
        console.log('[AdSDK] GD event: SDK_REWARDED_WATCH_COMPLETE');
        _gdRewardGranted = true;
        // Don't resolve the promise yet — wait for SDK_GAME_START (gd-resume)
        // so the game properly resumes before we credit the reward
    });

    // Wait for the GD SDK global to become available
    const checkReady = setInterval(() => {
        if (typeof window.gdsdk !== 'undefined') {
            clearInterval(checkReady);
            _initialized = true;
            console.log('[AdSDK] GameDistribution SDK ready');
        }
    }, 200);

    // Fallback: mark as initialized after 15 seconds even if SDK didn't load
    // (allows the game to work without ads rather than blocking forever)
    setTimeout(() => {
        if (!_initialized) {
            _initialized = true;
            console.warn('[AdSDK] GameDistribution SDK did not load in time, continuing without ads');
        }
    }, 15000);
}

function _showRewardedGD() {
    return new Promise((resolve) => {
        if (typeof window.gdsdk === 'undefined') {
            console.warn('[AdSDK] GD SDK not available (window.gdsdk is undefined)');
            resolve(false);
            return;
        }

        // Reset state for this ad attempt
        _gdRewardGranted = false;
        _gdRewardResolve = resolve;

        try {
            console.log('[AdSDK] Calling gdsdk.showAd("rewarded")...');
            window.gdsdk.showAd('rewarded');
        } catch (e) {
            console.warn('[AdSDK] gdsdk.showAd() threw an error:', e);
            _gdRewardResolve = null;
            _gdRewardGranted = false;
            resolve(false);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// CrazyGames Implementation
// ═══════════════════════════════════════════════════════════════════
function _initCrazyGames() {
    const checkReady = setInterval(() => {
        if (typeof window.CrazyGames !== 'undefined' && window.CrazyGames.SDK) {
            clearInterval(checkReady);
            window.CrazyGames.SDK.init().then(() => {
                _initialized = true;
                console.log('[AdSDK] CrazyGames SDK initialized');
                try {
                    // Let CrazyGames know that gameplay has started
                    window.CrazyGames.SDK.game.gameplayStart();
                } catch (e) {
                    console.warn('[AdSDK] CrazyGames gameplayStart error:', e);
                }
            }).catch(err => {
                console.warn('[AdSDK] CrazyGames SDK init failed:', err);
                // We'll still mark as initialized to allow fallback behavior
                _initialized = true;
            });
        }
    }, 200);
}

function _showRewardedCG() {
    return new Promise((resolve) => {
        if (!_initialized || typeof window.CrazyGames === 'undefined') {
            resolve(false);
            return;
        }

        try {
            const callbacks = {
                adStarted: () => { if (_onPause) _onPause(); },
                adFinished: () => { if (_onResume) _onResume(); resolve(true); },
                adError: () => { if (_onResume) _onResume(); resolve(false); },
            };

            window.CrazyGames.SDK.ad.requestAd('rewarded', callbacks);
        } catch (e) {
            console.warn('[AdSDK] CrazyGames rewarded ad error:', e);
            resolve(false);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════
// Stub Implementation (testing / Y8)
// ═══════════════════════════════════════════════════════════════════
function _showRewardedStub() {
    return new Promise((resolve) => {
        // Simulate a 2-second "ad" for testing
        if (_onPause) _onPause();

        const overlay = document.createElement('div');
        overlay.id = 'stub-ad-overlay';
        overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:'Fredoka',sans-serif;">
        <div style="font-size:1.4rem;font-weight:700;color:#FFE246;margin-bottom:10px;">📺 Ad Playing...</div>
        <div style="font-size:0.9rem;color:#A9A0D0;margin-bottom:20px;">This is a test ad (2 seconds)</div>
        <div id="stub-ad-timer" style="font-size:2rem;font-weight:700;color:#00FF87;">2</div>
      </div>
    `;
        document.body.appendChild(overlay);

        let remaining = 2;
        const timer = document.getElementById('stub-ad-timer');
        const countdown = setInterval(() => {
            remaining--;
            if (timer) timer.textContent = remaining;
            if (remaining <= 0) {
                clearInterval(countdown);
                overlay.remove();
                if (_onResume) _onResume();
                resolve(true);
            }
        }, 1000);
    });
}
