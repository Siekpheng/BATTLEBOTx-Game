// ========================================================
// BATTLEBOTx - CORE GAME STATE & SHARED REFERENCES
// ========================================================
var gameMode = 'bot'; // 'bot', '1v1', 'practice'
var selectedBotType = 'robot1';
var matchState = 'menu'; // 'menu', 'countdown', 'playing', 'paused', 'gameover'
var matchTimeRemaining = 180;
var playerScore = 0;
var enemyScore = 0;

var cameraMode = 0; // 0: Follow Direction, 1: Tactical Chase, 2: Top-down, 3: Full Broadcast
var cameraHeight = 19.5;
var cameraDistance = 12.0;

var playerBot = null;
var enemyBot = null;

window.startMatch = () => (typeof startMatchSequence === 'function' ? startMatchSequence() : null);
