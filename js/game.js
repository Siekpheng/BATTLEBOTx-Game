// ========================================================
// BATTLEBOTx - GAME MANAGER, UI NAVIGATION & ANIMATION LOOP
// ========================================================

  function createBotInstance(type, x, z, yaw) {
    const built = createRobotMesh(type);
    built.root.position.set(x, 0, z);
    built.root.rotation.y = yaw;
    scene.add(built.root);
    const bot = {
      type,
      root: built.root,
      tiltGroup: built.tiltGroup,
      weaponMesh: built.weaponMesh,
      armorPanels: built.armorPanels,
      wheels: built.wheels || [],
      cadAttached: built.cadAttached || false,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw,
      pitch: 0,
      pitchVel: 0,
      roll: 0,
      rollVel: 0,
      weaponSpinSpeed: (typeof matchState !== 'undefined' && matchState === 'menu') ? 95.0 : 0.0,
      weaponActive: true,
      halfWidth: 1.02,
      halfLength: 1.25,
      height: 0.78,
      flipped: false,
      driveHealth: (type === 'robot3') ? 380 : ((type === 'robot5') ? 260 : 220), // Balanced authentic durability
      maxDriveHealth: (type === 'robot3') ? 380 : ((type === 'robot5') ? 260 : 220),
      isEntirelyDestroyed: false,
      drivePower: 1.0,
      stoppedTimer: 0.0,
      throttleInput: 0,
      steerInput: 0
    };
    if (!bot.cadAttached) {
      if (typeof getBotScene === 'function' && getBotScene(type)) {
        attachCadToBot(bot, type);
      } else if (typeof ensureBotModelLoaded === 'function') {
        ensureBotModelLoaded(type).then(sc => {
          if (sc && bot && !bot.cadAttached && typeof attachCadToBot === 'function') {
            attachCadToBot(bot, type);
          }
        });
      }
    }
    if (typeof initBotDetachableParts === 'function') {
      initBotDetachableParts(bot);
    }
    if (typeof computeBotLocalBounds === 'function') {
      computeBotLocalBounds(bot);
    }
    return bot;
  }

    // ========================================================
  // 6.5 FLOATING OVERHEAD 3D BADGES & MIRROR MATCH STYLING
  // ========================================================
  let p1BadgeSprite = null;
  let p2BadgeSprite = null;

  function createBadgeTexture(text, color, subText) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');

    // Rounded pill container
    ctx.fillStyle = 'rgba(10, 15, 24, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(4, 4, 248, 64, 32);
    } else {
      ctx.rect(4, 4, 248, 64);
    }
    ctx.fill();
    ctx.stroke();

    // Main tag text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Orbitron, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(text, 128, subText ? 26 : 36);

    if (subText) {
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(subText, 128, 52);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function clearBotBadges() {
    if (p1BadgeSprite) { scene.remove(p1BadgeSprite); p1BadgeSprite = null; }
    if (p2BadgeSprite) { scene.remove(p2BadgeSprite); p2BadgeSprite = null; }
  }

  function setupBotBadges() {
    clearBotBadges();
    // Overhead 3D player tags removed per user request
  }

  function updateBotBadges() {
    // Overhead 3D player tags removed per user request
  }

  function applyMirrorMatchRivalStyle(bot) {
    if (!bot || !bot.root) return;
    bot.root.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          const n = (mat.name || '').toLowerCase();
          // Tint body frame and armor accents to crimson rival red
          if (!n.includes('tire') && !n.includes('rubber') && !n.includes('nut') && !n.includes('rim') && !n.includes('steel') && !n.includes('blade')) {
            if (mat.color) {
              mat.color.setHex(0xdc2626);
              if (mat.emissive) mat.emissive.setHex(0x180404);
              mat.needsUpdate = true;
            }
          }
        });
      }
    });
  }

  let totalDestructionCelebrationTimer = 0.0;
  let pendingGameOverData = null;
  let activeCountdownInterval = null;

  function cleanupBots() {
    if (activeCountdownInterval) {
      clearInterval(activeCountdownInterval);
      activeCountdownInterval = null;
    }
    countoutHornPlayed = false;
    if (typeof bothCantFightTimer !== 'undefined') bothCantFightTimer = 0.0;
    if (typeof mutualStallTimer !== 'undefined') mutualStallTimer = 0.0;
    totalDestructionCelebrationTimer = 0.0;
    pendingGameOverData = null;
    AudioSys.stopCombatAudio();
    clearBotBadges();
    const warnContainer = document.getElementById('flip-warning-container');
    if (warnContainer) {
      warnContainer.classList.add('hidden');
      const flipPill = warnContainer.querySelector('.flip-pill span');
      if (flipPill) flipPill.textContent = '⚠️ COUNTDOWN K.O. IN';
    }
    if (playerBot) { scene.remove(playerBot.root); playerBot = null; }
    if (enemyBot) { scene.remove(enemyBot.root); enemyBot = null; }
    clearArenaDebris();
    smoothCameraInitialized = false;
  }



  // ========================================================
  // 8. UI NAVIGATION & MODALS
  // ========================================================
  const menuScreen = document.getElementById('menu-screen');
  const modal1v1 = document.getElementById('modal-1v1');
  const modalSelect = document.getElementById('modal-select');
  const modalPause = document.getElementById('modal-pause');
  const modalGameover = document.getElementById('modal-gameover');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownText = document.getElementById('countdown-text');
  const hud = document.getElementById('hud');

  document.querySelectorAll('.menu-actions .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      autoFullscreenOnMobile();
      AudioSys.init();
      AudioSys.beep(620, 0.08);
      const m = btn.dataset.mode;
      if (m === '1v1') {
        modal1v1.classList.remove('hidden');
      } else {
        gameMode = m;
        updateControlsHint();
        refreshSelectModalLabels();
        modalSelect.classList.remove('hidden');
      }
    });
  });


  // ========================================================
  // 1V1 MODAL & ONLINE ROOM LISTENERS
  // ========================================================
  const modalOnlineHost = document.getElementById('modal-online-host');
  const modalOnlineJoin = document.getElementById('modal-online-join');

  let onlineHostBot = 'robot1';
  let onlineJoinBot = 'robot2';

  // 1v1 Mode selection button
  function refreshSelectModalLabels() {
    const titleEl = document.getElementById('modal-select-title');
    const p1Label = document.getElementById('p1-select-label');
    const oppLabel = document.getElementById('opponent-select-label');
    if (!titleEl || !p1Label || !oppLabel) return;

    if (typeof GamepadMapper !== 'undefined') GamepadMapper.updateUI();
    if (gameMode === '1v1') {
      titleEl.textContent = '1V1 LOCAL BATTLE · SELECT ROBOTS & READY UP';
      p1Label.textContent = 'PLAYER 1 ROBOT';
      oppLabel.textContent = 'PLAYER 2 ROBOT';
    } else if (gameMode === 'vs_bot') {
      titleEl.textContent = 'VS BOT · SELECT YOUR ROBOT';
      p1Label.textContent = 'YOUR ROBOT';
      oppLabel.textContent = 'AI OPPONENT ROBOT (SAME ROBOT ALLOWED)';
    } else if (gameMode === 'practice') {
      titleEl.textContent = 'PRACTICE ARENA · SELECT ROBOT';
      p1Label.textContent = 'YOUR ROBOT';
      oppLabel.textContent = 'TARGET DUMMY ROBOT (SAME ROBOT ALLOWED)';
    }
    if (typeof Local1v1State !== 'undefined') {
      Local1v1State.reset();
    }
  }

  document.getElementById('btn-1v1-local').addEventListener('click', () => {
    gameMode = '1v1';
    modal1v1.classList.add('hidden');
    updateControlsHint();
    refreshSelectModalLabels();
    modalSelect.classList.remove('hidden');
    if (typeof Local1v1State !== 'undefined') {
      Local1v1State.reset();
    }
    if (typeof GamepadUINav !== 'undefined') {
      GamepadUINav.activeContainerId = null;
      GamepadUINav.ensureValidFocus();
    }
  });

  document.getElementById('btn-1v1-close').addEventListener('click', () => {
    modal1v1.classList.add('hidden');
  });
  document.getElementById('btn-1v1-back').addEventListener('click', () => {
    modal1v1.classList.add('hidden');
  });

  // CREATE ONLINE ROOM
  document.getElementById('btn-1v1-create-room').addEventListener('click', () => {
    modal1v1.classList.add('hidden');
    modalOnlineHost.classList.remove('hidden');
    const codeDisplay = document.getElementById('host-room-code-display');
    const statusEl = document.getElementById('host-status');
    codeDisplay.textContent = 'GENERATING...';
    statusEl.textContent = '⏳ Connecting to peer network...';
    statusEl.style.color = '#fbbf24';

    NetworkSys.createRoom(
      onlineHostBot,
      (code) => {
        codeDisplay.textContent = code;
        statusEl.textContent = '⏳ Room active! Share code with Player 2...';
        statusEl.style.color = '#38bdf8';
      },
      (err) => {
        statusEl.textContent = '❌ Error: ' + err;
        statusEl.style.color = '#ef4444';
      }
    );
  });

  // Host mini-bot cards
  document.querySelectorAll('#host-bot-selector .mini-bot-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#host-bot-selector .mini-bot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onlineHostBot = card.dataset.bot;
      NetworkSys.selectedBot = onlineHostBot;
    });
  });

  // Copy Code button
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    if (NetworkSys.roomCode) {
      navigator.clipboard.writeText(NetworkSys.roomCode);
      const btn = document.getElementById('btn-copy-code');
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Code'; }, 2000);
    }
  });

  // Copy Invite Link button
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    if (NetworkSys.roomCode) {
      const inviteUrl = window.location.origin + window.location.pathname + '?room=' + NetworkSys.roomCode;
      navigator.clipboard.writeText(inviteUrl);
      const btn = document.getElementById('btn-copy-link');
      btn.textContent = '✓ Link Copied!';
      setTimeout(() => { btn.textContent = '🔗 Copy Invite Link'; }, 2000);
    }
  });

  // Host Cancel / Close
  function closeHostModal() {
    modalOnlineHost.classList.add('hidden');
    if (NetworkSys.peer) {
      try { NetworkSys.peer.destroy(); } catch (e) {}
      NetworkSys.peer = null;
    }
    NetworkSys.isOnline = false;
    NetworkSys.isHost = false;
  }
  document.getElementById('btn-host-close').addEventListener('click', closeHostModal);
  document.getElementById('btn-host-cancel').addEventListener('click', closeHostModal);

  // JOIN ONLINE ROOM
  document.getElementById('btn-1v1-join-room').addEventListener('click', () => {
    modal1v1.classList.add('hidden');
    modalOnlineJoin.classList.remove('hidden');
    document.getElementById('join-status').textContent = 'Enter code and choose your robot:';
    document.getElementById('join-status').style.color = '#fbbf24';
  });

  // Join mini-bot cards
  document.querySelectorAll('#join-bot-selector .mini-bot-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#join-bot-selector .mini-bot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onlineJoinBot = card.dataset.bot;
      NetworkSys.selectedBot = onlineJoinBot;
    });
  });

  // Join Connect button
  document.getElementById('btn-join-connect').addEventListener('click', () => {
    const code = document.getElementById('join-room-code-input').value.trim();
    const statusEl = document.getElementById('join-status');
    if (!code || code.length < 3) {
      statusEl.textContent = '⚠️ Please enter a valid Room Code!';
      statusEl.style.color = '#ef4444';
      return;
    }
    statusEl.textContent = '⏳ Connecting to Host (Room ' + code + ')...';
    statusEl.style.color = '#38bdf8';

    NetworkSys.joinRoom(
      code,
      onlineJoinBot,
      () => {
        statusEl.textContent = '✓ Connected! Entering arena...';
        statusEl.style.color = '#34d399';
      },
      (err) => {
        statusEl.textContent = '❌ ' + err;
        statusEl.style.color = '#ef4444';
      }
    );
  });

  // Join Cancel / Close
  function closeJoinModal() {
    modalOnlineJoin.classList.add('hidden');
    if (NetworkSys.peer) {
      try { NetworkSys.peer.destroy(); } catch (e) {}
      NetworkSys.peer = null;
    }
    NetworkSys.isOnline = false;
  }
  document.getElementById('btn-join-close').addEventListener('click', closeJoinModal);
  document.getElementById('btn-join-back').addEventListener('click', closeJoinModal);

  // Check URL query parameters for auto-join link: ?room=XXXX
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const cleanCode = roomParam.trim().replace(/^bbx2026-room-/i, '').replace(/^bbx-/i, '');
      const inputEl = document.getElementById('join-room-code-input');
      if (inputEl) inputEl.value = cleanCode;
      modalOnlineJoin.classList.remove('hidden');
      const statusEl = document.getElementById('join-status');
      if (statusEl) {
        statusEl.textContent = 'Room ' + cleanCode + ' detected from link! Pick your bot and click Connect.';
        statusEl.style.color = '#38bdf8';
      }
    }
  });


  document.getElementById('btn-select-close').addEventListener('click', () => {
    if (typeof exitSelectToMainMenu === 'function') {
      exitSelectToMainMenu();
    } else {
      modalSelect.classList.add('hidden');
    }
  });

  function updateControlsHint() {
    const hint = document.getElementById('hint-controls-text');
    if (!hint) return;
    if (gameMode === '1v1') {
      hint.innerHTML = '<strong>P1:</strong> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · Auto Weapon Wind-Up &nbsp;|&nbsp; <strong>P2:</strong> <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>';
    } else if (gameMode === 'practice') {
      hint.innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> · Auto Weapon Wind-Up (Practice Dummy)';
    } else {
      hint.innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> Drive Controls · Auto Weapon Wind-Up';
    }
  }

  let selectedP2BotType = 'robot2';

  // P1 selection cards
  document.querySelectorAll('#p1-bot-selector .bot-card').forEach(card => {
    card.addEventListener('click', () => {
      AudioSys.init();
      AudioSys.beep(540, 0.06);
      document.querySelectorAll('#p1-bot-selector .bot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedBotType = card.dataset.bot;
      if (selectedBotType && typeof ensureBotModelLoaded === 'function') {
        ensureBotModelLoaded(selectedBotType);
      }
      if (typeof Local1v1State !== 'undefined') {
        Local1v1State.setP1Ready(false);
      }
    });
  });

  // P2 / Opponent selection cards (Allows picking the exact same robot!)
  document.querySelectorAll('#p2-bot-selector .bot-card').forEach(card => {
    card.addEventListener('click', () => {
      AudioSys.init();
      AudioSys.beep(540, 0.06);
      document.querySelectorAll('#p2-bot-selector .bot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedP2BotType = card.dataset.p2bot;
      if (selectedP2BotType && selectedP2BotType !== 'random' && typeof ensureBotModelLoaded === 'function') {
        ensureBotModelLoaded(selectedP2BotType);
      }
      if (typeof Local1v1State !== 'undefined') {
        Local1v1State.setP2Ready(false);
      }
    });
  });

  // Background preloader: preload all 6 robots so all menu combatants have instant high-res CAD models
  setTimeout(() => {
    if (typeof ensureBotModelLoaded === 'function') {
      MENU_ROBOT_ROSTER.forEach((t, i) => {
        setTimeout(() => ensureBotModelLoaded(t), i * 180);
      });
    }
  }, 200);

  // HUD Touch Controls Toggle: OFF by default
  const btnToggleTouch = document.getElementById('btn-toggle-touch');
  const storedTouch = (function() {
    try { return localStorage.getItem('battlebotx_touch_controls'); } catch (e) { return null; }
  })();
  const touchEnabled = (storedTouch === 'on'); // OFF by default
  if (!touchEnabled) {
    document.body.classList.add('hide-touch-controls');
    if (btnToggleTouch) btnToggleTouch.textContent = '🎮 Touch: OFF';
  } else {
    document.body.classList.remove('hide-touch-controls');
    if (btnToggleTouch) btnToggleTouch.textContent = '🎮 Touch: ON';
  }
  if (btnToggleTouch) {
    btnToggleTouch.addEventListener('click', () => {
      const isHidden = document.body.classList.toggle('hide-touch-controls');
      btnToggleTouch.textContent = isHidden ? '🎮 Touch: OFF' : '🎮 Touch: ON';
      try {
        localStorage.setItem('battlebotx_touch_controls', isHidden ? 'off' : 'on');
      } catch (e) {}
    });
  }

  // ========================================================
  // UNIVERSAL MOBILE FULLSCREEN & LANDSCAPE ENGINE
  // ========================================================
  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function requestAppFullscreen() {
    const docEl = document.documentElement;
    const req = docEl.requestFullscreen ||
                docEl.webkitRequestFullscreen ||
                docEl.webkitRequestFullScreen ||
                docEl.mozRequestFullScreen ||
                docEl.msRequestFullscreen;

    if (req) {
      try {
        const p = req.call(docEl);
        if (p && p.catch) p.catch(() => {});
      } catch (err) {}
    }

    // Attempt to lock into landscape orientation on mobile
    if (screen.orientation && screen.orientation.lock) {
      try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    } else if (screen.lockOrientation) {
      try { screen.lockOrientation('landscape'); } catch (e) {}
    }

    // iOS Safari / Mobile address bar scroll trick
    setTimeout(() => {
      window.scrollTo(0, 1);
      if (typeof renderer !== 'undefined' && renderer && typeof camera !== 'undefined' && camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }, 250);

    updateFullscreenButtonText();
  }

  function exitAppFullscreen() {
    const exit = document.exitFullscreen ||
                 document.webkitExitFullscreen ||
                 document.mozCancelFullScreen ||
                 document.msExitFullscreen;
    if (exit) {
      try {
        const p = exit.call(document);
        if (p && p.catch) p.catch(() => {});
      } catch (err) {}
    }
    updateFullscreenButtonText();
  }

  function toggleAppFullscreen() {
    if (isFullscreenActive()) {
      exitAppFullscreen();
    } else {
      requestAppFullscreen();
    }
  }

  function updateFullscreenButtonText() {
    const active = isFullscreenActive();
    const btnMenu = document.getElementById('btn-menu-fullscreen');
    if (btnMenu) btnMenu.textContent = active ? '✕ Exit Fullscreen' : '⛶ Fullscreen';
    const btnHud = document.getElementById('btn-fullscreen');
    if (btnHud) btnHud.textContent = active ? '✕ Exit' : '⛶';
  }

  document.addEventListener('fullscreenchange', updateFullscreenButtonText);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtonText);

  // Hook up all fullscreen buttons
  const btnMenuFs = document.getElementById('btn-menu-fullscreen');
  if (btnMenuFs) btnMenuFs.addEventListener('click', toggleAppFullscreen);

  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) btnFullscreen.addEventListener('click', toggleAppFullscreen);

  const btnMobileFs = document.getElementById('btn-mobile-fs');
  if (btnMobileFs) btnMobileFs.addEventListener('click', toggleAppFullscreen);

  // Dynamic camera FOV adjustment for mobile devices on orientation/resize
  function checkMobileOrientation() {
    // Dynamic FOV compensation for portrait mode so arena is never zoomed in or cropped!
    if (typeof camera !== 'undefined' && camera) {
      const aspect = window.innerWidth / window.innerHeight;
      if (aspect < 1.0) {
        camera.fov = Math.min(82, 50 / aspect);
      } else {
        camera.fov = 50;
      }
      camera.updateProjectionMatrix();
    }
  }

  window.addEventListener('resize', checkMobileOrientation);
  window.addEventListener('orientationchange', checkMobileOrientation);
  checkMobileOrientation();

  // Auto-trigger fullscreen on first mobile tap when launching any game mode
  function autoFullscreenOnMobile() {
    const isMobileDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);
    if (isMobileDevice && !isFullscreenActive()) {
      requestAppFullscreen();
    }
  }

  // Mobile Quick Action camera button
  const btnMobileCam = document.getElementById('btn-mobile-cam');
  if (btnMobileCam) {
    btnMobileCam.addEventListener('click', cycleCameraMode);
  }

  const camBtn = document.getElementById('btn-cam-mode');
  function cycleCameraMode() {
    cameraMode = (cameraMode + 1) % 4;
    const labels = [
      '🎥 Cam: Follow Direction [C]',
      '🎥 Cam: Tactical 1v1 [C]',
      '🎥 Cam: Top-Down Aerial [C]',
      '🎥 Cam: Full Arena Broadcast [C]'
    ];
    camBtn.textContent = labels[cameraMode];
  }
  camBtn.addEventListener('click', cycleCameraMode);

  function cycleCameraModeP2() {
    cameraModeP2 = ((typeof cameraModeP2 === 'number' ? cameraModeP2 : 0) + 1) % 4;
  }
  window.cycleCameraModeP2 = cycleCameraModeP2;

  function isSplitScreenActive() {
    return (
      gameMode === '1v1' &&
      (typeof NetworkSys === 'undefined' || !NetworkSys.isOnline) &&
      typeof matchState !== 'undefined' &&
      (matchState === 'countdown' || matchState === 'playing' || matchState === 'celebrating' || matchState === 'paused')
    );
  }
  window.isSplitScreenActive = isSplitScreenActive;

  document.getElementById('btn-cam-up').addEventListener('click', () => {
    cameraHeight = Math.min(32, cameraHeight + 2.5);
  });
  document.getElementById('btn-cam-down').addEventListener('click', () => {
    cameraHeight = Math.max(10, cameraHeight - 2.5);
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    if (matchState === 'playing') {
      matchState = 'paused';
      modalPause.classList.remove('hidden');
    }
  });

  document.getElementById('btn-resume-game').addEventListener('click', () => {
    modalPause.classList.add('hidden');
    matchState = 'playing';
  });

  document.getElementById('btn-restart-game').addEventListener('click', () => {
    modalPause.classList.add('hidden');
    startMatchSequence();
  });

  document.getElementById('btn-pause-menu').addEventListener('click', () => {
    modalPause.classList.add('hidden');
    hud.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    matchState = 'menu';
    gameMode = 'bot';
    cleanupBots();
  });

  document.getElementById('btn-start-match').addEventListener('click', () => {
    if (gameMode === '1v1' && typeof Local1v1State !== 'undefined') {
      if (!Local1v1State.isBothReady()) {
        Local1v1State.setP1Ready(true);
        Local1v1State.setP2Ready(true);
        return;
      }
    }
    autoFullscreenOnMobile();
    modalSelect.classList.add('hidden');
    menuScreen.classList.add('hidden');
    startMatchSequence();
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    modalGameover.classList.add('hidden');
    if (NetworkSys.isOnline) {
      NetworkSys.openRematchModal(true);
    } else if (gameMode === '1v1') {
      hud.classList.add('hidden');
      cleanupBots();
      refreshSelectModalLabels();
      modalSelect.classList.remove('hidden');
      if (typeof Local1v1State !== 'undefined') {
        Local1v1State.reset();
      }
      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.activeContainerId = null;
        GamepadUINav.ensureValidFocus();
      }
    } else {
      startMatchSequence();
    }
  });

  document.getElementById('btn-back-menu').addEventListener('click', () => {
    modalGameover.classList.add('hidden');
    hud.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    matchState = 'menu';
    gameMode = 'bot';
    cleanupBots();
    if (NetworkSys.isOnline) {
      NetworkSys.handleDisconnect('Exited online match.');
    }
  });

  // ========================================================
  // 9. MATCH SEQUENCE & COUNTDOWN
  // ========================================================



  async function startMatchSequence() {
    window.startMatchSequence = startMatchSequence;
    window.startMatch = startMatchSequence;
    AudioSys.init();
    // Set matchState to 'countdown' immediately so the menu loop does not respawn menu bots
    // and createBotInstance / attachCadToBot initialize weaponSpinSpeed to 0.0 during the 3s countdown!
    matchState = 'countdown';
    if (typeof NetworkSys !== 'undefined' && NetworkSys.queuedEvents) {
      NetworkSys.queuedEvents.length = 0;
    }
    cleanupBots();
    smoothCameraInitialized = false;
    menuCamInitialized = false;
    if (typeof toggleMenuSpectate === 'function') toggleMenuSpectate(false);

    // 1. Force hide the main menu screen and every overlay/modal
    const menuEl = document.getElementById('menu-screen');
    if (menuEl) menuEl.classList.add('hidden');
    const allModals = ['modal-1v1', 'modal-select', 'modal-online-host', 'modal-online-join', 'modal-pause', 'modal-gameover', 'modal-online-rematch'];
    allModals.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.overlay-screen').forEach(el => el.classList.add('hidden'));

    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (typeof window.focus === 'function') {
        window.focus();
      }
    } catch (e) {}

    let botTypeChoice = selectedBotType || 'robot1';
    const allBots = ['robot1', 'robot2', 'robot3', 'robot4', 'robot5', 'robot6'];
    if (!allBots.includes(botTypeChoice)) botTypeChoice = 'robot1';

    let enemyType;
    if (NetworkSys.isOnline) {
      // Consistent Arena Spawn Mapping on Both Host and Guest:
      // playerBot (-7.5) is ALWAYS Host's robot, enemyBot (+7.5) is ALWAYS Guest's robot!
      botTypeChoice = NetworkSys.isHost ? NetworkSys.selectedBot : NetworkSys.opponentBot;
      enemyType = NetworkSys.isHost ? NetworkSys.opponentBot : NetworkSys.selectedBot;
    } else if (gameMode === '1v1') {
      // Local 1v1: Use selected Player 2 robot (same robot as P1 is fully supported!)
      enemyType = (selectedP2BotType && selectedP2BotType !== 'random') ? selectedP2BotType : (selectedBotType || 'robot2');
    } else {
      // VS Bot or Practice: Use picked opponent or pick randomly from ALL 5 robots (including mirror match!)
      if (selectedP2BotType && selectedP2BotType !== 'random' && allBots.includes(selectedP2BotType)) {
        enemyType = selectedP2BotType;
      } else {
        enemyType = allBots[Math.floor(Math.random() * allBots.length)];
      }
    }

    // High-precision on-demand model streaming with live progress overlay
    const p1Ready = !!getBotScene(botTypeChoice);
    const p2Ready = !!getBotScene(enemyType);

    if (!p1Ready || !p2Ready) {
      const loadingOverlay = document.getElementById('match-loading-overlay');
      const loadingBar = document.getElementById('match-loading-bar-fill');
      const loadingStatus = document.getElementById('match-loading-status');
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');

      let prog1 = p1Ready ? 1.0 : 0;
      let prog2 = p2Ready ? 1.0 : 0;
      const updateProgressDisplay = () => {
        const pct = Math.round(((prog1 + prog2) / 2) * 100);
        if (loadingBar) loadingBar.style.width = pct + '%';
        if (loadingStatus) loadingStatus.textContent = `Streaming high-precision CAD telemetry... ${pct}%`;
      };
      updateProgressDisplay();

      await Promise.all([
        ensureBotModelLoaded(botTypeChoice, (p) => { prog1 = p; updateProgressDisplay(); }),
        ensureBotModelLoaded(enemyType, (p) => { prog2 = p; updateProgressDisplay(); })
      ]);

      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    playerBot = createBotInstance(botTypeChoice, 0, 9.626, Math.PI);
    enemyBot = createBotInstance(enemyType, 0, -9.626, 0);

    // If mirror match (same robot), give the opponent a distinct rival red livery
    if (playerBot.type === enemyBot.type) {
      applyMirrorMatchRivalStyle(enemyBot);
    }
    setupBotBadges();

    // Immediately attach high-res CAD models
    if (playerBot.type === 'robot1' && typeof attachCadToRobot1 === 'function') attachCadToRobot1(playerBot);
    if (playerBot.type === 'robot2' && typeof attachCadToRobot2 === 'function') attachCadToRobot2(playerBot);
    if (playerBot.type === 'robot3' && typeof attachCadToRobot3 === 'function') attachCadToRobot3(playerBot);
    if (playerBot.type === 'robot4' && typeof attachCadToRobot4 === 'function') attachCadToRobot4(playerBot);
    if (playerBot.type === 'robot5' && typeof attachCadToRobot5 === 'function') attachCadToRobot5(playerBot);
    if (playerBot.type === 'robot6' && typeof attachCadToRobot6 === 'function') attachCadToRobot6(playerBot);

    if (enemyBot.type === 'robot1' && typeof attachCadToRobot1 === 'function') attachCadToRobot1(enemyBot);
    if (enemyBot.type === 'robot2' && typeof attachCadToRobot2 === 'function') attachCadToRobot2(enemyBot);
    if (enemyBot.type === 'robot3' && typeof attachCadToRobot3 === 'function') attachCadToRobot3(enemyBot);
    if (enemyBot.type === 'robot4' && typeof attachCadToRobot4 === 'function') attachCadToRobot4(enemyBot);
    if (enemyBot.type === 'robot5' && typeof attachCadToRobot5 === 'function') attachCadToRobot5(enemyBot);
    if (enemyBot.type === 'robot6' && typeof attachCadToRobot6 === 'function') attachCadToRobot6(enemyBot);

    if (typeof initBotDetachableParts === 'function') {
      if (!playerBot.detachableParts || playerBot.detachableParts.length === 0) initBotDetachableParts(playerBot);
      if (!enemyBot.detachableParts || enemyBot.detachableParts.length === 0) initBotDetachableParts(enemyBot);
    }

    // Strictly keep weapons at 0 RPM during the 3-second countdown; blades only begin winding up after the countdown finishes!
    playerBot.weaponSpinSpeed = 0.0;
    enemyBot.weaponSpinSpeed = 0.0;
    updateBotVisuals(playerBot, 0);
    updateBotVisuals(enemyBot, 0);

    const rpmTextInit = document.getElementById('weapon-rpm-text');
    const rpmFillInit = document.getElementById('weapon-rpm-fill');
    if (rpmTextInit && rpmFillInit) {
      rpmTextInit.textContent = '0% (WAITING FOR FIGHT...)';
      rpmTextInit.style.color = '#94a3b8';
      rpmFillInit.style.width = '0%';
      rpmFillInit.classList.remove('ready');
      rpmFillInit.style.background = '';
    }

    matchTimeRemaining = 180;
    bothCantFightTimer = 0.0;
    combatEngageTimer = 0.0;
    totalDestructionCelebrationTimer = 0.0;
    pendingGameOverData = null;
    if (typeof GamepadMapper !== 'undefined') GamepadMapper.updateUI();
    updateTimerDisplay();
    document.getElementById('flip-warning-container').classList.add('hidden');
    hud.classList.remove('hidden');

    matchState = 'countdown';
    countdownOverlay.classList.remove('hidden');

    const steps = ['3', '2', '1', 'FIGHT!'];
    let idx = 0;
    countdownText.textContent = steps[0];
    AudioSys.countdownBeat(3);

    if (activeCountdownInterval) {
      clearInterval(activeCountdownInterval);
    }
    activeCountdownInterval = setInterval(() => {
      idx++;
      if (idx < steps.length) {
        countdownText.textContent = steps[idx];
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'zoomStep 0.4s ease-out';

        if (idx === 3) {
          AudioSys.arenaBuzzer();
        } else {
          AudioSys.countdownBeat(3 - idx);
        }
      } else {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
        countdownOverlay.classList.add('hidden');
        matchState = 'playing';
      }
    }, 850);
  }
  window.startMatchSequence = startMatchSequence;
  window.startMatch = startMatchSequence;

  function endMatch(playerWon, isDraw = false, isKO = true, isTotalDestruction = false) {
    if (matchState === 'gameover' || matchState === 'celebrating') return;

    if (isTotalDestruction) {
      matchState = 'celebrating';
      totalDestructionCelebrationTimer = 5.0;
      pendingGameOverData = { playerWon, isDraw, isKO, isTotalDestruction: true };

      AudioSys.arenaBuzzer();
      const isGuest = (NetworkSys.isOnline && !NetworkSys.isHost);
      const didIWin = isGuest ? !playerWon : playerWon;
      if (isDraw) {
        AudioSys.crowdGasp(0.95);
        AudioSys.beep(320, 0.35);
      } else if (didIWin) {
        AudioSys.winFanfare();
        AudioSys.crowdCheer(1.0, 5.0);
      } else {
        AudioSys.crowdGasp(0.9);
        AudioSys.loseSound();
      }

      const warnContainer = document.getElementById('flip-warning-container');
      const warnWho = document.getElementById('flip-who-text');
      const warnNum = document.getElementById('flip-timer-num');
      const flipPill = warnContainer ? warnContainer.querySelector('.flip-pill span') : null;
      if (warnContainer && warnWho && warnNum) {
        warnContainer.classList.remove('hidden');
        if (isDraw) {
          warnWho.textContent = '💥 DOUBLE TOTAL DESTRUCTION! DRAW!';
          if (flipPill) flipPill.textContent = '🤝 MUTUAL KNOCKOUT';
        } else if (didIWin) {
          warnWho.textContent = '💥 ENEMY TOTAL DESTRUCTION! VICTORY!';
          if (flipPill) flipPill.textContent = '🏆 VICTORY CELEBRATION';
        } else {
          warnWho.textContent = '💥 ROBOT COMPLETELY DEMOLISHED! DEFEAT!';
          if (flipPill) flipPill.textContent = '💀 TOTAL KNOCKOUT';
        }
        warnNum.textContent = 'KO (5s)';
      }

      if (NetworkSys.isOnline && NetworkSys.isHost && NetworkSys.conn && NetworkSys.conn.open) {
        NetworkSys.conn.send({
          type: 'end_match',
          playerWon,
          isDraw,
          isKO,
          isTotalDestruction: true
        });
      }
      return;
    }

    // Normal referee countout KO or judges' decision
    if (NetworkSys.isOnline && NetworkSys.isHost && NetworkSys.conn && NetworkSys.conn.open) {
      NetworkSys.conn.send({
        type: 'end_match',
        playerWon,
        isDraw,
        isKO,
        isTotalDestruction: false
      });
    }

    finalizeGameOver(playerWon, isDraw, isKO, false);
  }
  window.endMatch = endMatch;

  function finalizeGameOver(playerWon, isDraw = false, isKO = true, isTotalDestruction = false) {
    if (matchState === 'gameover') return;
    matchState = 'gameover';
    BgmSys.setMode('menu');
    if (!isTotalDestruction) {
      AudioSys.arenaBuzzer();
    }
    AudioSys.stopCombatAudio();

    const warnContainer = document.getElementById('flip-warning-container');
    const flipPill = warnContainer ? warnContainer.querySelector('.flip-pill span') : null;
    if (warnContainer) {
      warnContainer.classList.add('hidden');
      if (flipPill) flipPill.textContent = '⚠️ COUNTDOWN K.O. IN';
    }

    const isGuest = (NetworkSys.isOnline && !NetworkSys.isHost);
    const didIWin = isGuest ? !playerWon : playerWon;

    if (!isDraw) {
      if (didIWin) playerScore++;
      else enemyScore++;
    }

    const heading = document.getElementById('result-heading');
    const detail = document.getElementById('result-detail');

    if (isDraw) {
      heading.textContent = isTotalDestruction
        ? 'DRAW — DOUBLE DESTRUCTION!'
        : (isKO ? 'DRAW — DOUBLE COUNT-OUT!' : 'DRAW');
      heading.className = 'result-title draw';
      if (detail) {
        detail.textContent = isTotalDestruction
          ? 'Both robots exploded simultaneously!'
          : (isKO ? 'Both robots unable to fight — Referee declared a Draw!' : 'Time Expired — Both robots active!');
      }
      AudioSys.beep(300, 0.3);
    } else if (didIWin) {
      heading.textContent = isTotalDestruction ? 'TOTAL DESTRUCTION!' : (isKO ? 'KNOCKOUT!' : 'VICTORY');
      heading.className = 'result-title win';
      if (detail) {
        detail.textContent = isTotalDestruction
          ? 'Opponent robot obliterated! All parts destroyed!'
          : (isKO ? 'Opponent counted out by referee! KO Victory!' : 'Won by Judges\' Decision!');
      }
      if (!isTotalDestruction) {
        AudioSys.winFanfare();
        AudioSys.crowdCheer(1.0, 2.5);
      }
    } else {
      heading.textContent = isTotalDestruction ? 'DEFEAT — DEMOLISHED!' : (isKO ? 'DEFEAT — COUNTED OUT!' : 'DEFEAT');
      heading.className = 'result-title lose';
      if (detail) {
        detail.textContent = isTotalDestruction
          ? 'Your robot was torn apart! All parts destroyed!'
          : (isKO ? 'Your robot was immobilized and counted out!' : 'Lost by Judges\' Decision!');
      }
      if (!isTotalDestruction) {
        AudioSys.loseSound();
      }
    }

    document.getElementById('result-score').textContent = `YOU ${playerScore} - ${enemyScore} OPPONENT`;
    modalGameover.classList.remove('hidden');
    if (typeof GamepadUINav !== 'undefined' && typeof GamepadUINav.ensureValidFocus === 'function') {
      GamepadUINav.ensureValidFocus();
    }
  }

  function updateTimerDisplay() {
    const mins = Math.floor(matchTimeRemaining / 60);
    const secs = Math.floor(matchTimeRemaining % 60);
    document.getElementById('hud-timer').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateHealthHUD() {
    // HP bar removed for authentic BattleBots experience (matches decided by KO / countout)
  }

  function triggerDamageVignette() {
    if (matchState === 'menu') return;
    const vig = document.getElementById('damage-vignette');
    vig.style.opacity = '1';
    setTimeout(() => { vig.style.opacity = '0'; }, 240);
  }



  // ========================================================
  // CINEMATIC ARENA FLYOVER CAMERA SYSTEM (MAIN MENU)
  // ========================================================
  let menuCamTime = 0;
  let menuCameraMode = 'tour'; // 'tour' (default), 'broadcast', 'lowglide', 'stage', 'topdown'
  const menuCamTargetPos = new THREE.Vector3();
  const menuCamTargetLook = new THREE.Vector3();
  let menuCamInitialized = false;

  const MENU_CAMERA_MODES = [
    { id: 'tour', label: 'Dynamic Tour' },
    { id: 'broadcast', label: 'High Stadium' },
    { id: 'lowglide', label: 'Low Floor Glide' },
    { id: 'stage', label: 'North Stage' },
    { id: 'topdown', label: 'Aerial Crane' }
  ];
  let menuCameraModeIdx = 0;

  function cycleMenuCameraMode() {
    menuCameraModeIdx = (menuCameraModeIdx + 1) % MENU_CAMERA_MODES.length;
    menuCameraMode = MENU_CAMERA_MODES[menuCameraModeIdx].id;
    const btn = document.getElementById('btn-menu-camera');
    if (btn) {
      btn.innerHTML = `🎥 Angle: <strong>${MENU_CAMERA_MODES[menuCameraModeIdx].label}</strong>`;
    }
  }

  function updateMenuCamera(dt) {
    menuCamTime += dt;
    const t = menuCamTime * 0.22;

    if (menuCameraMode === 'tour') {
      // Dynamic undulating 360-degree flyover:
      // Smoothly swoops between low floor skimming (2.6m) and high stadium crane (18.5m),
      // undulating radius (12.0m to 19.5m), dynamically tracking floor decals, stage screen, and corners.
      const orbitAngle = t;
      const radius = 15.6 + Math.sin(t * 1.5) * 2.8 + Math.cos(t * 0.5) * 1.2;
      const rawH = 10.5 + Math.sin(t * 1.0 - 0.5) * 7.2 + Math.cos(t * 2.0) * 3.2;
      const height = Math.max(2.6, rawH);

      menuCamTargetPos.set(
        Math.cos(orbitAngle) * radius,
        height,
        Math.sin(orbitAngle) * radius
      );

      // Dynamically track fighting bots in menu background
      const bMidX = (playerBot && enemyBot) ? (playerBot.x + enemyBot.x) * 0.5 : 0;
      const bMidZ = (playerBot && enemyBot) ? (playerBot.z + enemyBot.z) * 0.5 : 0;
      menuCamTargetLook.set(
        bMidX * 0.70,
        0.85,
        bMidZ * 0.70
      );
    } else if (menuCameraMode === 'broadcast') {
      // High-angle sweeping stadium broadcast orbit
      const orbitAngle = t * 0.85;
      const radius = 17.5;
      const height = 13.5 + Math.sin(t * 0.6) * 2.0;
      menuCamTargetPos.set(
        Math.cos(orbitAngle) * radius,
        height,
        Math.sin(orbitAngle) * radius
      );
      menuCamTargetLook.set(0, 0.6, -1.0);
    } else if (menuCameraMode === 'lowglide') {
      // Dramatic low floor glide skimming just above kickplates
      const orbitAngle = t * 1.1;
      const radius = 13.5;
      const height = 3.0 + Math.sin(t * 1.4) * 0.6;
      menuCamTargetPos.set(
        Math.cos(orbitAngle) * radius,
        height,
        Math.sin(orbitAngle) * radius
      );
      menuCamTargetLook.set(
        Math.sin(orbitAngle + 0.6) * 2.5,
        1.2,
        Math.cos(orbitAngle + 0.6) * 2.5
      );
    } else if (menuCameraMode === 'stage') {
      // Stage & Billboard spotlight framing from the South/Southeast
      const swayAngle = Math.sin(t * 0.7) * 0.45;
      const radius = 16.5;
      menuCamTargetPos.set(
        Math.sin(swayAngle) * radius,
        6.5 + Math.sin(t * 0.5) * 1.5,
        Math.cos(swayAngle) * radius
      );
      menuCamTargetLook.set(0, 3.5, -ARENA_HALF + 0.5); // Framing North stage billboard
    } else if (menuCameraMode === 'topdown') {
      // High aerial crane overview with slow majestic rotation
      const driftAngle = t * 0.4;
      const driftRad = 4.0;
      menuCamTargetPos.set(
        Math.cos(driftAngle) * driftRad,
        22.5 + Math.sin(t * 0.3) * 1.5,
        Math.sin(driftAngle) * driftRad
      );
      menuCamTargetLook.set(0, 0, 0);
    }

    if (!menuCamInitialized) {
      camera.position.copy(menuCamTargetPos);
      currentCamLookTarget.copy(menuCamTargetLook);
      camera.lookAt(currentCamLookTarget);
      menuCamInitialized = true;
    } else {
      // Butter-smooth interpolation for camera position and look target
      camera.position.lerp(menuCamTargetPos, Math.min(1, dt * 3.5));
      currentCamLookTarget.lerp(menuCamTargetLook, Math.min(1, dt * 3.5));
      camera.lookAt(currentCamLookTarget);
    }
  }

  const currentCamLookTargetP2 = new THREE.Vector3(0, 0.75, 0);
  let smoothCamHeadingP2 = 0;
  let smoothCameraP2Initialized = false;

  function updateSingleViewportCamera(camObj, targetBot, otherBot, mode, isP2Cam, dt) {
    if (!camObj || !targetBot) return;
    const desiredPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    let heading = isP2Cam ? smoothCamHeadingP2 : smoothCamHeading;
    const curLook = isP2Cam ? currentCamLookTargetP2 : currentCamLookTarget;

    if (isP2Cam ? !smoothCameraP2Initialized : !smoothCameraInitialized) {
      heading = targetBot.yaw;
      curLook.set(targetBot.x, 0.75, targetBot.z);
      if (isP2Cam) {
        smoothCamHeadingP2 = heading;
        smoothCameraP2Initialized = true;
      } else {
        smoothCamHeading = heading;
        smoothCameraInitialized = true;
      }
    }

    let headingDiff = targetBot.yaw - heading;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    heading += headingDiff * Math.min(1, dt * 5.2);

    if (isP2Cam) smoothCamHeadingP2 = heading;
    else smoothCamHeading = heading;

    if (mode === 0) {
      const followDist = 10.5;
      const followHeight = 5.2;

      let camX = targetBot.x - Math.sin(heading) * followDist;
      let camZ = targetBot.z - Math.cos(heading) * followDist;
      let camY = (targetBot.root ? targetBot.root.position.y : 0) + followHeight;

      const pDistCenter = Math.max(Math.abs(targetBot.x), Math.abs(targetBot.z));
      const wallNear = Math.max(0, pDistCenter - (ARENA_HALF - 3.8));
      if (wallNear > 0) {
        camY += wallNear * 1.5;
      }

      const maxCamCoord = ARENA_HALF + 2.5;
      camX = Math.max(-maxCamCoord, Math.min(maxCamCoord, camX));
      camZ = Math.max(-maxCamCoord, Math.min(maxCamCoord, camZ));

      desiredPos.set(camX, camY, camZ);

      const forwardLead = 4.8;
      lookTarget.set(
        targetBot.x + Math.sin(heading) * forwardLead,
        (targetBot.root ? targetBot.root.position.y : 0) + 0.85,
        targetBot.z + Math.cos(heading) * forwardLead
      );
    } else if (mode === 1) {
      const pDistFromCenter = Math.max(Math.abs(targetBot.x), Math.abs(targetBot.z));
      const wallDanger = Math.max(0, pDistFromCenter - (ARENA_HALF - 4.2));

      const baseDist = 12.8;
      let rawCamX = targetBot.x - Math.sin(heading) * baseDist * 0.72;
      let rawCamZ = targetBot.z - Math.cos(heading) * baseDist * 0.72;

      const dynamicHeight = 17.5 + wallDanger * 2.2;

      if (wallDanger > 0) {
        const centerPull = (wallDanger / 4.2) * 0.35;
        rawCamX = rawCamX * (1 - centerPull);
        rawCamZ = rawCamZ * (1 - centerPull);
      }

      const maxCamCoord = ARENA_HALF + 4.0;
      rawCamX = Math.max(-maxCamCoord, Math.min(maxCamCoord, rawCamX));
      rawCamZ = Math.max(-maxCamCoord, Math.min(maxCamCoord, rawCamZ));

      desiredPos.set(rawCamX, dynamicHeight, rawCamZ);

      const midX = otherBot ? (targetBot.x * 0.58 + otherBot.x * 0.42) : targetBot.x;
      const midZ = otherBot ? (targetBot.z * 0.58 + otherBot.z * 0.42) : targetBot.z;
      lookTarget.set(midX, 0.75, midZ);
    } else if (mode === 2) {
      desiredPos.set(0, 28.5, 0.1);
      lookTarget.set(0, 0, 0);
    } else {
      desiredPos.set(0, 24.0, 22.5);
      lookTarget.set(0, 2.0, -1.5);
    }

    camObj.position.lerp(desiredPos, Math.min(1, dt * 6.0));

    // Only apply screen shake for the default follow-robot camera angle (mode 0)
    if (mode === 0 && cameraTrauma > 0) {
      const shake = cameraTrauma * cameraTrauma;
      const maxOffset = 0.95;
      camObj.position.x += (Math.random() * 2 - 1) * maxOffset * shake;
      camObj.position.y += (Math.random() * 2 - 1) * (maxOffset * 0.7) * shake;
      camObj.position.z += (Math.random() * 2 - 1) * maxOffset * shake;
    }

    curLook.lerp(lookTarget, Math.min(1, dt * 5.0));
    camObj.lookAt(curLook);
  }

  function updateCamera(dt) {
    if (matchState === 'menu') {
      smoothCameraP2Initialized = false;
      updateMenuCamera(dt);
      return;
    }

    const activeTargetBot = (NetworkSys.isOnline && !NetworkSys.isHost && enemyBot) ? enemyBot : playerBot;
    const otherBot = (activeTargetBot === enemyBot) ? playerBot : enemyBot;
    if (!activeTargetBot) {
      camera.position.set(0, 20, 18);
      camera.lookAt(0, 0, 0);
      return;
    }

    updateSingleViewportCamera(camera, activeTargetBot, otherBot, cameraMode, false, dt);

    if (isSplitScreenActive() && typeof cameraP2 !== 'undefined' && enemyBot) {
      updateSingleViewportCamera(cameraP2, enemyBot, playerBot, typeof cameraModeP2 === 'number' ? cameraModeP2 : 0, true, dt);
    }

    if (cameraTrauma > 0) {
      cameraTrauma = Math.max(0, cameraTrauma - dt * 2.8);
    }
  }

  // ========================================================
  // 10.5 MENU AI EXHIBITION BATTLE SYSTEM (ANTI-CIRCLING LEAD PURSUIT)
  // ========================================================
  // MENU_ROBOT_ROSTER is globally defined in js/state.js
  let menuP1Type = 'robot1';
  let menuP2Type = 'robot2';
  let menuRespawnCooldown = 0.0;
  let menuCirclingTimer = 0.0;
  let menuCircleBreakPhase = 0.0;

  function driveMenuBotAI(bot, target, dt, isP1) {
    if (!bot || !target) return;
    const bNoWheels = (!bot.wheels || bot.wheels.length === 0 || bot.wheels.filter(w => w.attached).length === 0);
    if (bot.driveHealth <= 0 || bot.flipped || bot.isEntirelyDestroyed || bNoWheels) {
      bot.drivePower = 0;
      bot.throttleInput = 0;
      bot.steerInput = 0;
      return;
    }

    // 1. Predictive Interception (Lead Pursuit)
    // Cuts across the opponent's circle instead of tail-chasing behind them
    const rawDx = target.x - bot.x;
    const rawDz = target.z - bot.z;
    const dist = Math.hypot(rawDx, rawDz);

    // Dynamic lead factor: higher at range to intercept, tighter when closing in to punch through
    const targetSpeed = Math.hypot(target.vx || 0, target.vz || 0);
    const leadFactor = (dist < 2.5) ? 0.08 : Math.min(0.52, dist / 11.0);

    // Subtle asymmetric path bias: P1 cuts inside-left, P2 cuts inside-right to guarantee collision
    const perpX = -(target.vz || 0) * (isP1 ? 0.16 : -0.16);
    const perpZ = (target.vx || 0) * (isP1 ? 0.16 : -0.16);

    const aimX = target.x + (target.vx || 0) * leadFactor + perpX;
    const aimZ = target.z + (target.vz || 0) * leadFactor + perpZ;

    const dx = aimX - bot.x;
    const dz = aimZ - bot.z;
    const targetYaw = Math.atan2(dx, dz);

    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // 2. Anti-Circling Detector & Circle Breaker
    // If bots circle between 1.2m and 4.8m for > 0.85s without an impact, break the orbit immediately
    if (dist < 4.8 && dist > 1.2) {
      menuCirclingTimer += dt;
      if (menuCirclingTimer > 0.85) {
        menuCircleBreakPhase = 0.65; // Trigger 0.65s forced collision break
        menuCirclingTimer = 0;
      }
    } else {
      menuCirclingTimer = Math.max(0, menuCirclingTimer - dt * 2.0);
    }

    if (menuCircleBreakPhase > 0) {
      // Circle Break: One bot commits to a direct center line charge, the other cuts hard inward
      if (isP1) {
        bot.steerInput = 0;
        bot.throttleInput = 1.0;
      } else {
        bot.steerInput = Math.max(-1, Math.min(1, -diff * 3.4));
        bot.throttleInput = 1.0;
      }
      return;
    }

    // 3. Close-Quarters Ramming Commitment (Distance < 3.2m)
    // NEVER reverse away! Commit 100% full forward throttle directly into opponent!
    if (dist < 3.2) {
      bot.steerInput = Math.max(-1, Math.min(1, -diff * 2.8));
      bot.throttleInput = 1.0; // Floor throttle into opponent chassis!
    } else {
      // Mid / Long-Range High-Aggression Pursuit
      const steerTarget = Math.max(-1, Math.min(1, -diff * 2.5));
      bot.steerInput += (steerTarget - bot.steerInput) * Math.min(1, dt * 7.5);

      if (Math.abs(diff) < 0.65) {
        bot.throttleInput = 1.0; // Kinetic charge
      } else if (Math.abs(diff) < 1.25) {
        bot.throttleInput = 0.85; // High-speed intercept
      } else {
        bot.throttleInput = 0.55; // Quick turn to face
      }
    }

    // 3.5 Unstick Maneuver if Pinned or Motionless
    const currentSpeed = Math.hypot(bot.vx || 0, bot.vz || 0);
    if (currentSpeed < 0.35 && dist > 1.5) {
      bot.menuUnstickTimer = (bot.menuUnstickTimer || 0) + dt;
      if (bot.menuUnstickTimer > 0.8) {
        bot.throttleInput = -0.85;
        bot.steerInput = (bot.x > 0 ? -1.0 : 1.0);
        return;
      }
    } else {
      bot.menuUnstickTimer = 0.0;
    }

    // 4. Arena Boundary Bounce-Back
    // Prevent bots from grinding along walls: turn forcefully back toward center arena
    const wallBound = ARENA_HALF - 1.5;
    if (Math.abs(bot.x) > wallBound || Math.abs(bot.z) > wallBound) {
      const centerYaw = Math.atan2(-bot.x, -bot.z);
      let cDiff = centerYaw - bot.yaw;
      while (cDiff > Math.PI) cDiff -= Math.PI * 2;
      while (cDiff < -Math.PI) cDiff += Math.PI * 2;
      bot.steerInput = Math.max(-1, Math.min(1, -cDiff * 3.0));
      bot.throttleInput = Math.max(0.75, bot.throttleInput);
    }
  }

  function isMenuBotImmobilized(bot, dt) {
    if (!bot) return true;

    // Auto self-right if flipped during menu fight: pop back upright after 0.8s!
    if (bot.flipped) {
      bot.menuFlipTimer = (bot.menuFlipTimer || 0) + dt;
      if (bot.menuFlipTimer > 0.8) {
        bot.flipped = false;
        bot.pitch = 0;
        bot.roll = 0;
        bot.pitchVel = 0;
        bot.rollVel = 0;
        bot.vy = 2.2;
        bot.menuFlipTimer = 0.0;
      }
    } else {
      bot.menuFlipTimer = 0.0;
    }

    // Total Destruction in Menu: parts explode and scatter
    if (bot.isEntirelyDestroyed) {
      bot.menuDestroyedTimer = (bot.menuDestroyedTimer || 0) + dt;
      return bot.menuDestroyedTimer > 1.2;
    }

    const bNoWheels = (!bot.wheels || bot.wheels.length === 0 || bot.wheels.filter(w => w.attached).length === 0);
    if (bNoWheels && !bot.isEntirelyDestroyed) {
      bot.menuNoWheelsTimer = (bot.menuNoWheelsTimer || 0) + dt;
      if (bot.menuNoWheelsTimer > 2.5) {
        bot.isEntirelyDestroyed = true;
        bot.menuDestroyedTimer = 0.0;
        return false;
      }
    } else {
      bot.menuNoWheelsTimer = 0.0;
    }

    // If bot has been motionless/stuck against wall/opponent for > 4.5s, mark destroyed so clean replacement occurs
    const botSpeed = Math.hypot(bot.vx || 0, bot.vz || 0);
    if (botSpeed < 0.25 && !bot.isEntirelyDestroyed) {
      bot.menuStuckTimer = (bot.menuStuckTimer || 0) + dt;
      if (bot.menuStuckTimer > 4.5) {
        bot.isEntirelyDestroyed = true;
        bot.menuDestroyedTimer = 0.0;
        return false;
      }
    } else {
      bot.menuStuckTimer = 0.0;
    }

    return false;
  }

  function pickNextMenuRobot(exclude1, exclude2) {
    // Prioritize robots whose CAD models are already fully loaded
    const readyPool = MENU_ROBOT_ROSTER.filter(t => t !== exclude1 && t !== exclude2 && (typeof getBotScene === 'function' && !!getBotScene(t)));
    if (readyPool.length > 0) return readyPool[Math.floor(Math.random() * readyPool.length)];

    const pool = MENU_ROBOT_ROSTER.filter(t => t !== exclude1 && t !== exclude2);
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    return MENU_ROBOT_ROSTER.filter(t => t !== exclude1)[0] || 'robot1';
  }

  function startMenuDemoFight() {
    if (matchState !== 'menu') return;
    cleanupBots();

    if (!menuP1Type) menuP1Type = 'robot1';
    if (!menuP2Type) menuP2Type = 'robot2';

    playerBot = createBotInstance(menuP1Type, 0, 9.626, Math.PI);
    enemyBot = createBotInstance(menuP2Type, 0, -9.626, 0);

    playerBot.weaponActive = true;
    enemyBot.weaponActive = true;
    playerBot.weaponSpinSpeed = 95.0;
    enemyBot.weaponSpinSpeed = 95.0;

    if (playerBot.type === enemyBot.type) {
      applyMirrorMatchRivalStyle(enemyBot);
    }
    menuRespawnCooldown = 0.4;
  }

  function checkMenuBotKnockout(dt) {
    if (menuRespawnCooldown > 0) {
      menuRespawnCooldown -= dt;
      return;
    }

    const pStopped = isMenuBotImmobilized(playerBot, dt);
    const eStopped = isMenuBotImmobilized(enemyBot, dt);

    if (pStopped || eStopped) {
      // Instant robot replacement — no 10s countdown!
      AudioSys.metalClashSound(2.2, true);

      let nextP1 = menuP1Type;
      let nextP2 = menuP2Type;

      if (pStopped && eStopped) {
        nextP1 = pickNextMenuRobot(menuP1Type, menuP2Type);
        nextP2 = pickNextMenuRobot(nextP1, menuP2Type);
      } else if (pStopped) {
        nextP1 = pickNextMenuRobot(menuP1Type, menuP2Type);
      } else if (eStopped) {
        nextP2 = pickNextMenuRobot(menuP2Type, menuP1Type);
      }

      menuP1Type = nextP1;
      menuP2Type = nextP2;

      // Spawn knockout sparks at defeated location
      const defeatedBot = pStopped ? playerBot : enemyBot;
      if (defeatedBot && defeatedBot.root) {
        spawnCollisionSparks(new THREE.Vector3(defeatedBot.x, 0.4, defeatedBot.z), 50);
      }

      cleanupBots();

      playerBot = createBotInstance(menuP1Type, 0, 9.626, Math.PI);
      enemyBot = createBotInstance(menuP2Type, 0, -9.626, 0);

      playerBot.weaponActive = true;
      enemyBot.weaponActive = true;
      playerBot.weaponSpinSpeed = 95.0;
      enemyBot.weaponSpinSpeed = 95.0;

      if (playerBot.type === enemyBot.type) {
        applyMirrorMatchRivalStyle(enemyBot);
      }

      menuRespawnCooldown = 0.6;
    }
  }

  // ========================================================
  // 11. MAIN ANIMATION LOOP
  // ========================================================
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Cinematic Hit-Stop (Freeze-frame on catastrophic weapon impacts)
    let simDt = dt;
    if (hitStopRemaining > 0) {
      hitStopRemaining -= dt;
      simDt = 0.0001; // Freeze physics integration for high-impact crunch
    }

    // ----------------------------------------------------
    // DYNAMIC TOURNAMENT ARENA LIGHTING UPDATE
    // ----------------------------------------------------
    // 1. Kinetic Collision Flash Decay
    if (typeof impactFlashLight !== 'undefined' && impactFlashLight.intensity > 0.02) {
      impactFlashLight.intensity *= Math.pow(0.003, dt);
    } else if (typeof impactFlashLight !== 'undefined') {
      impactFlashLight.intensity = 0;
    }

    // 2. Moving Stadium Searchlights & Volumetric Beams
    if (typeof searchSpot1 !== 'undefined') {
      const t1x = Math.sin(now * 0.00065) * 7.5;
      const t1z = Math.cos(now * 0.00055) * 7.5;
      searchSpot1.target.position.set(t1x, 0, t1z);
      if (typeof beamCone1 !== 'undefined') {
        beamCone1.position.copy(searchSpot1.position);
        beamCone1.lookAt(t1x, 0, t1z);
      }
    }
    if (typeof searchSpot2 !== 'undefined') {
      const t2x = -Math.cos(now * 0.00055) * 7.5;
      const t2z = Math.sin(now * 0.00075) * 7.5;
      searchSpot2.target.position.set(t2x, 0, t2z);
      if (typeof beamCone2 !== 'undefined') {
        beamCone2.position.copy(searchSpot2.position);
        beamCone2.lookAt(t2x, 0, t2z);
      }
    }

    // 3. LED Hazard Border Strips & Corner Strobe Beacons
    if (typeof ledMat !== 'undefined') {
      const isCountoutActive = (playerBot && playerBot.stoppedTimer > 0.5) || (enemyBot && enemyBot.stoppedTimer > 0.5);
      if (isCountoutActive) {
        // Rapid emergency hazard strobe during referee countdown
        const alertPulse = (Math.sin(now * 0.016) > 0);
        const alertColor = alertPulse ? 0xff1744 : 0x7f0010;
        ledMat.color.setHex(alertColor);

        cornerBeacons.forEach(b => {
          b.cap.material.color.setHex(alertColor);
          b.light.color.setHex(alertColor);
          b.light.intensity = alertPulse ? 0.9 : 0.1;
        });
      } else {
        // High-tech electric cyan breathing pulse
        const breath = 0.70 + Math.sin(now * 0.0032) * 0.30;
        ledMat.color.setRGB(0.0, 0.90 * breath, 1.0 * breath);

        const beaconFlash = (Math.floor(now * 0.0016) % 2 === 0);
        cornerBeacons.forEach(b => {
          b.cap.material.color.setHex(0xf59e0b);
          b.light.color.setHex(0xf59e0b);
          b.light.intensity = beaconFlash ? 0.45 : 0.08;
        });
      }
    }

    // 4. Weapon High-RPM Friction Glow Lights
    if (typeof playerWeaponGlow !== 'undefined' && playerBot && playerBot.root) {
      const pRpmRatio = Math.min(1.0, (playerBot.weaponSpinSpeed || 0) / 95.0);
      if (pRpmRatio > 0.25) {
        playerWeaponGlow.intensity = Math.pow(pRpmRatio, 2.5) * 1.4;
        const wp = playerBot.root.position.clone();
        wp.x += Math.sin(playerBot.yaw) * 0.65;
        wp.z += Math.cos(playerBot.yaw) * 0.65;
        wp.y += 0.35;
        playerWeaponGlow.position.copy(wp);
      } else {
        playerWeaponGlow.intensity = 0;
      }
    }
    if (typeof enemyWeaponGlow !== 'undefined' && enemyBot && enemyBot.root) {
      const eRpmRatio = Math.min(1.0, (enemyBot.weaponSpinSpeed || 0) / 95.0);
      if (eRpmRatio > 0.25) {
        enemyWeaponGlow.intensity = Math.pow(eRpmRatio, 2.5) * 1.4;
        const ep = enemyBot.root.position.clone();
        ep.x += Math.sin(enemyBot.yaw) * 0.65;
        ep.z += Math.cos(enemyBot.yaw) * 0.65;
        ep.y += 0.35;
        enemyWeaponGlow.position.copy(ep);
      } else {
        enemyWeaponGlow.intensity = 0;
      }
    }

    // Adaptive BGM Intensity (Climax mode when either bot < 30% HP or flaming)
    if (matchState === 'playing' || matchState === 'countdown') {
      const pLow = playerBot && (playerBot.driveHealth < 30 || (typeof isBotFlaming === 'function' && isBotFlaming(playerBot)));
      const eLow = enemyBot && (enemyBot.driveHealth < 30 || (typeof isBotFlaming === 'function' && isBotFlaming(enemyBot)));
      BgmSys.setMode((pLow || eLow) ? 'climax' : 'combat');
    } else {
      BgmSys.setMode('menu');
    }

    // Dynamic Real-Time Combat Audio (Weapon wind-up scream, drive motors hum, floor drift)
    AudioSys.updateCombatAudio(playerBot, enemyBot, matchState, dt);

    // Floor drift & tire skid acoustic detection
    if (playerBot && (matchState === 'playing' || matchState === 'countdown')) {
      const fwdX = Math.sin(playerBot.yaw);
      const fwdZ = Math.cos(playerBot.yaw);
      const lateralVel = -playerBot.vx * fwdZ + playerBot.vz * fwdX;
      if (Math.abs(lateralVel) > 4.2) {
        AudioSys.tireSkid(Math.abs(lateralVel));
      }
    }

    // Always poll Controller 1 & Controller 2 every frame + run Controller UI Menu Navigation
    const gp1 = pollGamepadControls(0);
    const gp2 = pollGamepadControls(1);
    window._latestGp2 = gp2;
    if (typeof updateGamepadMenuNavigation === 'function') {
      updateGamepadMenuNavigation(dt);
    }

    if (matchState === 'menu') {
      if (playerBot) {
        playerBot.weaponActive = true;
        if (playerBot.weaponSpinSpeed < 90.0 && !playerBot.isEntirelyDestroyed) {
          playerBot.weaponSpinSpeed = 95.0;
        }
      }
      if (enemyBot) {
        enemyBot.weaponActive = true;
        if (enemyBot.weaponSpinSpeed < 90.0 && !enemyBot.isEntirelyDestroyed) {
          enemyBot.weaponSpinSpeed = 95.0;
        }
      }
      if (typeof updateMenuIdleSpectate === 'function') {
        updateMenuIdleSpectate(dt);
      }
      if (gp1 && gp1.hasInput) {
        if (typeof isMenuSpectating === 'function' && isMenuSpectating()) {
          toggleMenuSpectate(false);
        }
        if (typeof resetMenuIdleTimer === 'function') {
          resetMenuIdleTimer();
        }
      }
      if (!playerBot || !enemyBot) {
        startMenuDemoFight();
      } else {
        if (menuCircleBreakPhase > 0) menuCircleBreakPhase -= dt;
        driveMenuBotAI(playerBot, enemyBot, simDt, true);
        driveMenuBotAI(enemyBot, playerBot, simDt, false);
        updateBotPhysics(playerBot, simDt);
        updateBotPhysics(enemyBot, simDt);
        handleBotCollision();
        checkMenuBotKnockout(dt);
      }
    } else if (matchState === 'countdown') {
      // During the 3-second pre-match countdown, keep weapons strictly at 0 RPM so blades only begin spinning when the countdown finishes!
      if (playerBot) {
        playerBot.weaponSpinSpeed = 0.0;
        updateBotVisuals(playerBot, 0);
      }
      if (enemyBot) {
        enemyBot.weaponSpinSpeed = 0.0;
        updateBotVisuals(enemyBot, 0);
      }
    } else if ((matchState === 'playing' || matchState === 'celebrating') && playerBot && enemyBot) {
      let t = sliderThrottleVal;
      let s = sliderSteerVal;

      if (gp1 && gp1.hasInput) {
        t = gp1.throttle;
        s = gp1.steer;
      }

      const throttleKnobEl = document.getElementById('throttle-knob');
      const steerKnobEl = document.getElementById('steer-knob');

      if (NetworkSys.isOnline && !NetworkSys.isHost) {
        // GUEST MODE: Send local controls to Host, apply local client prediction
        if (keys['KeyW'] || keys['ArrowUp']) t = 1;
        if (keys['KeyS'] || keys['ArrowDown']) t = -1;
        if (keys['KeyA'] || keys['ArrowLeft']) s = -1;
        if (keys['KeyD'] || keys['ArrowRight']) s = 1;

        if (gp1 && gp1.hasInput) {
          t = gp1.throttle;
          s = gp1.steer;
        }

        if (throttleKnobEl) throttleKnobEl.style.transform = `translateY(${-t * 42}px)`;
        if (steerKnobEl) steerKnobEl.style.transform = `translateX(${s * 46}px)`;

        NetworkSys.sendInput(t, s);

        // Guest Controls enemyBot: apply client prediction so Guest drives immediately without waiting for round-trip!
        if (enemyBot && !enemyBot.isEntirelyDestroyed) {
          const eHasWheels = (enemyBot.wheels && enemyBot.wheels.length > 0 && enemyBot.wheels.some(w => w.attached !== false)) ||
            (enemyBot.detachableParts && enemyBot.detachableParts.some(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent));
          const eNoWheels = !eHasWheels;
          if (enemyBot.driveHealth <= 0 || enemyBot.flipped || eNoWheels) {
            enemyBot.drivePower = 0;
            enemyBot.throttleInput = 0;
            enemyBot.steerInput = 0;
          } else {
            enemyBot.throttleInput = t;
            enemyBot.steerInput = s;
          }
          updateBotPhysics(enemyBot, simDt);
        }

        updateBotVisuals(playerBot, dt);
        updateBotVisuals(enemyBot, dt);
        if (matchState === 'playing') {
          updateImmobilizationAndCountout(dt);
        }
      } else {
        // HOST OR SINGLE-PLAYER / LOCAL / PRACTICE MODE:
        if (keys['KeyW'] || (keys['ArrowUp'] && gameMode !== '1v1')) t = 1;
        if (keys['KeyS'] || (keys['ArrowDown'] && gameMode !== '1v1')) t = -1;
        if (keys['KeyA'] || (keys['ArrowLeft'] && gameMode !== '1v1')) s = -1;
        if (keys['KeyD'] || (keys['ArrowRight'] && gameMode !== '1v1')) s = 1;

        if (gp1 && gp1.hasInput) {
          t = gp1.throttle;
          s = gp1.steer;
        }

        const pHasWheels = (playerBot.wheels && playerBot.wheels.length > 0 && playerBot.wheels.some(w => w.attached !== false)) ||
          (playerBot.detachableParts && playerBot.detachableParts.some(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent));
        const pNoWheels = !pHasWheels;
        if (playerBot.driveHealth <= 0 || playerBot.flipped || playerBot.isEntirelyDestroyed || pNoWheels) {
          playerBot.drivePower = 0;
          playerBot.throttleInput = 0;
          playerBot.steerInput = 0;
        } else {
          playerBot.throttleInput = t;
          playerBot.steerInput = s;
        }

        if (throttleKnobEl) throttleKnobEl.style.transform = `translateY(${-t * 42}px)`;
        if (steerKnobEl) steerKnobEl.style.transform = `translateX(${s * 46}px)`;

        if (!NetworkSys.isOnline) {
          updateEnemyAI(simDt);
        }
        updateBotPhysics(playerBot, simDt);
        updateBotPhysics(enemyBot, simDt);
        if (matchState === 'playing') {
          handleBotCollision();
          updateImmobilizationAndCountout(dt);
        }

        if (NetworkSys.isOnline && NetworkSys.isHost) {
          NetworkSys.broadcastState();
        }
      }

      // Update Weapon RPM Gauge in HUD (Guest in Online 1v1 controls enemyBot!)
      const myLocalBot = (NetworkSys.isOnline && !NetworkSys.isHost && enemyBot) ? enemyBot : playerBot;
      const rpmPct = Math.min(100, Math.round((myLocalBot.weaponSpinSpeed / 95.0) * 100));
      const rpmText = document.getElementById('weapon-rpm-text');
      const rpmFill = document.getElementById('weapon-rpm-fill');
      if (rpmText && rpmFill) {
        if (myLocalBot.weaponDestroyed || myLocalBot.isEntirelyDestroyed) {
          rpmText.textContent = '0% (WEAPON DESTROYED)';
          rpmText.style.color = '#ef4444';
          rpmFill.style.width = '0%';
          rpmFill.classList.remove('ready');
          rpmFill.style.background = '#475569';
        } else if (myLocalBot.weaponActive === false) {
          rpmText.textContent = rpmPct > 0 ? `${rpmPct}% (COASTING)` : 'OFF (SPACE / LB)';
          rpmText.style.color = rpmPct > 0 ? '#f59e0b' : '#94a3b8';
          rpmFill.style.width = `${rpmPct}%`;
          rpmFill.classList.remove('ready');
          rpmFill.style.background = rpmPct > 0 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : '#475569';
        } else if (rpmPct >= 92) {
          rpmText.textContent = '100% (SMASH READY!)';
          rpmText.style.color = '#34d399';
          rpmFill.style.width = '100%';
          rpmFill.classList.add('ready');
          rpmFill.style.background = '';
        } else if (rpmPct <= 5) {
          rpmText.textContent = '0% (STALLED — WINDING UP...)';
          rpmText.style.color = '#ef4444';
          rpmFill.style.width = `${rpmPct}%`;
          rpmFill.classList.remove('ready');
          rpmFill.style.background = '';
        } else {
          rpmText.textContent = `${rpmPct}% (WINDING UP...)`;
          rpmText.style.color = '#38bdf8';
          rpmFill.style.width = `${rpmPct}%`;
          rpmFill.classList.remove('ready');
          rpmFill.style.background = '';
        }
      }

      if (matchState === 'playing') {
        matchTimeRemaining -= dt;
        if (matchTimeRemaining <= 0) {
          matchTimeRemaining = 0;
          // Judges' Decision based on remaining drive power & attached armor pieces
          const pAttached = playerBot.armorPanels.filter(p => p.attached).length;
          const eAttached = enemyBot.armorPanels.filter(p => p.attached).length;
          const pScore = playerBot.driveHealth * 0.6 + pAttached * 10;
          const eScore = enemyBot.driveHealth * 0.6 + eAttached * 10;
          const isDraw = Math.abs(pScore - eScore) < 4;
          endMatch(pScore > eScore, isDraw, false, false);
        }
        updateTimerDisplay();
      } else if (matchState === 'celebrating') {
        totalDestructionCelebrationTimer -= dt;
        const warnNum = document.getElementById('flip-timer-num');
        if (warnNum) {
          const secLeft = Math.max(1, Math.ceil(totalDestructionCelebrationTimer));
          warnNum.textContent = `KO (${secLeft}s)`;
        }
        if (totalDestructionCelebrationTimer <= 0) {
          if (pendingGameOverData) {
            finalizeGameOver(
              pendingGameOverData.playerWon,
              pendingGameOverData.isDraw,
              pendingGameOverData.isKO,
              true
            );
          }
        }
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.vy -= 18 * dt;
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y += sp.vy * dt;
      sp.mesh.position.z += sp.vz * dt;
      if (sp.mesh.position.y < 0.05) {
        sp.mesh.position.y = 0.05;
        sp.vy *= -0.4;
      }
      sp.life -= dt;
      if (sp.life <= 0) {
        scene.remove(sp.mesh);
        sparks.splice(i, 1);
      }
    }

    for (const d of detachedDebris) {
      // Physical interaction: moving robots kick/push detached debris across the arena floor!
      if (d.mesh.position.y < 0.75) {
        const activeBots = [playerBot, enemyBot];
        for (let bIdx = 0; bIdx < activeBots.length; bIdx++) {
          const b = activeBots[bIdx];
          if (!b || b.isEntirelyDestroyed) continue;
          const bdx = d.mesh.position.x - b.x;
          const bdz = d.mesh.position.z - b.z;
          const bDist = Math.hypot(bdx, bdz);
          const hitRad = 1.38;
          if (bDist < hitRad && bDist > 0.001) {
            const pushNx = bdx / bDist;
            const pushNz = bdz / bDist;
            const overlap = hitRad - bDist;
            d.mesh.position.x += pushNx * overlap;
            d.mesh.position.z += pushNz * overlap;

            const botSpeed = Math.hypot(b.vx || 0, b.vz || 0);
            const kickSpeed = Math.max(2.2, botSpeed * 1.15);
            d.vx = (b.vx || 0) * 0.65 + pushNx * kickSpeed;
            d.vz = (b.vz || 0) * 0.65 + pushNz * kickSpeed;
            if (botSpeed > 3.5 && d.mesh.position.y <= 0.20) {
              d.vy = Math.min(3.2, 1.2 + botSpeed * 0.22);
              d.rx = (Math.random() - 0.5) * 14;
              d.ry = (Math.random() - 0.5) * 14;
              d.rz = (Math.random() - 0.5) * 14;
              if (typeof AudioSys !== 'undefined' && AudioSys.hitSound && Math.random() < 0.35) {
                AudioSys.hitSound(0.15);
              }
            }
          }
        }
      }

      if (d.mesh.position.y > 0.06 || Math.abs(d.vy) > 0.1 || Math.hypot(d.vx, d.vz) > 0.05) {
        d.vy -= 18 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.rx * dt;
        d.mesh.rotation.y += d.ry * dt;
        d.mesh.rotation.z += d.rz * dt;

        // Arena boundary collision for debris (Square 4x4m battlebox)
        const debMax = ARENA_HALF - 0.45;
        if (d.mesh.position.x < -debMax) {
          d.mesh.position.x = -debMax;
          d.vx = Math.abs(d.vx) * 0.5;
        } else if (d.mesh.position.x > debMax) {
          d.mesh.position.x = debMax;
          d.vx = -Math.abs(d.vx) * 0.5;
        }
        if (d.mesh.position.z < -debMax) {
          d.mesh.position.z = -debMax;
          d.vz = Math.abs(d.vz) * 0.5;
        } else if (d.mesh.position.z > debMax) {
          d.mesh.position.z = debMax;
          d.vz = -Math.abs(d.vz) * 0.5;
        }

        // Floor bounce & rolling / sliding friction
        const floorY = d.isWheel ? 0.16 : 0.06;
        if (d.mesh.position.y <= floorY) {
          d.mesh.position.y = floorY;
          if (d.vy < -1.0) {
            d.vy = -d.vy * (d.isWheel ? 0.45 : 0.35); // bouncy wheel
            AudioSys.hitSound(d.isWheel ? 0.18 : 0.12);
          } else {
            d.vy = 0;
          }
          if (d.isWheel) {
            // Wheels roll along floor with lower rolling friction
            d.vx *= Math.pow(0.55, dt);
            d.vz *= Math.pow(0.55, dt);
            d.rx *= Math.pow(0.2, dt);
            d.ry *= Math.pow(0.2, dt);
            d.rz *= Math.pow(0.2, dt);
            d.mesh.rotation.x += Math.hypot(d.vx, d.vz) * 4.0 * dt;
          } else {
            d.vx *= Math.pow(0.1, dt);
            d.vz *= Math.pow(0.1, dt);
            d.rx *= Math.pow(0.08, dt);
            d.ry *= Math.pow(0.08, dt);
            d.rz *= Math.pow(0.08, dt);
          }
        }
      }
    }

    // Update Flames (80%+ Damage Fire Effect)
    const isPBurning = checkAndSpawnBotFlames(playerBot, playerFireLight, dt);
    const isEBurning = checkAndSpawnBotFlames(enemyBot, enemyFireLight, dt);
    AudioSys.setFireActive((isPBurning || isEBurning) && (matchState === 'playing' || matchState === 'countdown'));
    updateFlames(dt);

// Fire banner message removed per user request (flame particles & combustion audio remain active)

    // UI is now docked to the side, so it never blocks the robot view and never dims down
    const controlsBottomBar = document.getElementById('controls-bottom-bar');
    if (controlsBottomBar) {
      controlsBottomBar.style.opacity = '1.0';
    }

    // Update Split-Screen Overlay & Player 2 Weapon RPM Gauge when in Local 1v1 Split Screen
    const splitOverlay = document.getElementById('splitscreen-overlay');
    const splitActive = isSplitScreenActive();
    document.body.classList.toggle('splitscreen-mode', splitActive);
    if (splitOverlay) {
      if (splitActive) {
        splitOverlay.classList.remove('hidden');
        if (enemyBot) {
          const p2RpmPct = Math.min(100, Math.round((enemyBot.weaponSpinSpeed / 95.0) * 100));
          const p2RpmText = document.getElementById('p2-weapon-rpm-text');
          const p2RpmFill = document.getElementById('p2-weapon-rpm-fill');
          if (p2RpmText && p2RpmFill) {
            if (enemyBot.weaponDestroyed || enemyBot.isEntirelyDestroyed) {
              p2RpmText.textContent = '0% (WEAPON DESTROYED)';
              p2RpmText.style.color = '#ef4444';
              p2RpmFill.style.width = '0%';
              p2RpmFill.classList.remove('ready');
              p2RpmFill.style.background = '#475569';
            } else if (enemyBot.weaponActive === false) {
              p2RpmText.textContent = p2RpmPct > 0 ? `${p2RpmPct}% (COASTING)` : 'OFF (R-SHIFT / LB)';
              p2RpmText.style.color = p2RpmPct > 0 ? '#f59e0b' : '#94a3b8';
              p2RpmFill.style.width = `${p2RpmPct}%`;
              p2RpmFill.classList.remove('ready');
              p2RpmFill.style.background = p2RpmPct > 0 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : '#475569';
            } else if (p2RpmPct >= 92) {
              p2RpmText.textContent = '100% (SMASH READY!)';
              p2RpmText.style.color = '#34d399';
              p2RpmFill.style.width = '100%';
              p2RpmFill.classList.add('ready');
              p2RpmFill.style.background = '';
            } else if (p2RpmPct <= 5) {
              p2RpmText.textContent = '0% (STALLED — WINDING UP...)';
              p2RpmText.style.color = '#ef4444';
              p2RpmFill.style.width = `${p2RpmPct}%`;
              p2RpmFill.classList.remove('ready');
              p2RpmFill.style.background = '';
            } else {
              p2RpmText.textContent = `${p2RpmPct}% (WINDING UP...)`;
              p2RpmText.style.color = '#f87171';
              p2RpmFill.style.width = `${p2RpmPct}%`;
              p2RpmFill.classList.remove('ready');
              p2RpmFill.style.background = '';
            }
          }
        }
      } else {
        splitOverlay.classList.add('hidden');
      }
    }

    updateCamera(dt);
    updateBotBadges();

    if (splitActive && typeof cameraP2 !== 'undefined') {
      const fullW = window.innerWidth;
      const fullH = window.innerHeight;
      const halfW = Math.floor(fullW * 0.5);
      const rightW = fullW - halfW;

      renderer.setScissorTest(true);

      // Left Viewport: Player 1 (Blue Corner)
      camera.aspect = halfW / fullH;
      camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, halfW, fullH);
      renderer.setScissor(0, 0, halfW, fullH);
      updateArenaWallTransparency(dt, camera, playerBot);
      renderer.render(scene, camera);

      // Right Viewport: Player 2 (Red Corner)
      cameraP2.aspect = rightW / fullH;
      cameraP2.updateProjectionMatrix();
      renderer.setViewport(halfW, 0, rightW, fullH);
      renderer.setScissor(halfW, 0, rightW, fullH);
      updateArenaWallTransparency(dt, cameraP2, enemyBot);
      renderer.render(scene, cameraP2);

      renderer.setScissorTest(false);
    } else {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      const targetAspect = window.innerWidth / window.innerHeight;
      if (Math.abs(camera.aspect - targetAspect) > 0.001) {
        camera.aspect = targetAspect;
        camera.updateProjectionMatrix();
      }
      updateArenaWallTransparency(dt, camera, playerBot);
      renderer.render(scene, camera);
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

    // Launch initial Menu Exhibition Fight
  startMenuDemoFight();

  requestAnimationFrame(animate);

