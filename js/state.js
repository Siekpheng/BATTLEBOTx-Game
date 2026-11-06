// ========================================================
// BATTLEBOTx - CORE GAME STATE & SHARED REFERENCES
// ========================================================
var GAME_VERSION = 'v1.6.0';
var gameMode = 'bot'; // 'bot', '1v1', 'practice'
var selectedBotType = 'robot1';
var matchState = 'menu'; // 'menu', 'countdown', 'playing', 'paused', 'gameover'
var matchTimeRemaining = 180;
var playerScore = 0;
var enemyScore = 0;

var cameraMode = 0;
var cameraModeP2 = 0;
var cameraZoomScale = 1.0;
var targetCameraZoom = 1.0;
var bothCantFightTimer = 0.0;
var mutualStallTimer = 0.0;
var combatEngageTimer = 0.0;
var gamepadPlayerMap = { p1: 0, p2: 1 }; // Maps Player 1 & Player 2 to connected controller slot (0, 1, ...) or -1 for Keyboard Only
var cameraHeight = 19.5;
var cameraDistance = 12.0;

var playerBot = null;
var enemyBot = null;
var MENU_ROBOT_ROSTER = ['robot1', 'robot2', 'robot3', 'robot4', 'robot5', 'robot6'];

window.startMatchSequence = null;
window.startMatch = () => (typeof window.startMatchSequence === 'function' ? window.startMatchSequence() : null);
window.endMatch = null;

(function syncGameVersionBadge() {
  const applyVer = () => {
    const el = document.getElementById('game-version-tag');
    if (el) el.textContent = GAME_VERSION;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVer);
  } else {
    applyVer();
  }
})();
