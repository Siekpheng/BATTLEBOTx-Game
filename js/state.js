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
var MENU_ROBOT_ROSTER = ['robot1', 'robot2', 'robot3', 'robot4', 'robot5', 'robot6'];

window.startMatch = () => (typeof startMatchSequence === 'function' ? startMatchSequence() : null);
