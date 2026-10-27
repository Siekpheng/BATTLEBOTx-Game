// ========================================================
// BATTLEBOTx - INPUT CONTROLLERS & GAMEPAD ENGINE
// ========================================================

  // ========================================================
  // 7. INPUT HANDLING
  // ========================================================
  function togglePlayerWeapon(bot = playerBot) {
    const targetBot = (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && !NetworkSys.isHost && enemyBot && bot === playerBot) ? enemyBot : bot;
    if (!targetBot || targetBot.weaponDestroyed || targetBot.isEntirelyDestroyed) return;
    if (typeof matchState !== 'undefined' && matchState === 'menu') return;
    targetBot.weaponActive = (targetBot.weaponActive === false) ? true : false;
    if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && !NetworkSys.isHost && NetworkSys.conn && NetworkSys.conn.open) {
      NetworkSys.conn.send({ type: 'guest_toggle_weapon' });
    }
    // When turning off, do not stop abruptly: let mechanical inertia smoothly coast down in updateRobotPhysics
    if (typeof AudioSys !== 'undefined' && AudioSys.ctx) {
      if (targetBot.weaponActive) {
        AudioSys.beep(840, 0.08); // High chirp for Weapon ON
      } else {
        AudioSys.beep(320, 0.12); // Low spindown hum for Weapon OFF
      }
    }
    console.log(`⚡ Weapon toggled: ${targetBot.weaponActive ? 'ON' : 'OFF'}`);
  }

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyC' && (matchState === 'playing' || matchState === 'countdown')) {
      cycleCameraMode();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && (matchState === 'playing' || matchState === 'countdown') && playerBot) {
        togglePlayerWeapon(playerBot);
      }
    }
    if (e.code === 'Numpad0' || e.code === 'ShiftRight') {
      if (!e.repeat && gameMode === '1v1' && (matchState === 'playing' || matchState === 'countdown') && enemyBot) {
        togglePlayerWeapon(enemyBot);
      }
    }
    if ((e.code === 'KeyM' || e.code === 'Numpad1') && gameMode === '1v1' && (matchState === 'playing' || matchState === 'countdown')) {
      if (typeof cycleCameraModeP2 === 'function') cycleCameraModeP2();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('wheel', (e) => {
    if (matchState === 'playing' || matchState === 'countdown') {
      cameraHeight = Math.max(10, Math.min(32, cameraHeight + (e.deltaY > 0 ? 1.4 : -1.4)));
    }
  }, { passive: true });

  let dragThrottle = false;
  let dragSteer = false;
  let sliderThrottleVal = 0;
  let sliderSteerVal = 0;

  // Weapon RPM click toggle (Desktop & Mobile)
  const weaponRpmWrap = document.getElementById('weapon-rpm-wrap');
  if (weaponRpmWrap) {
    weaponRpmWrap.style.cursor = 'pointer';
    weaponRpmWrap.title = 'Click or press [SPACE] / Controller [LB] to toggle weapon ON/OFF';
    weaponRpmWrap.addEventListener('click', (e) => {
      if (e.target.closest('#btn-dock-toggle')) return;
      togglePlayerWeapon(playerBot);
    });
  }
  const p2WeaponRpmWrap = document.getElementById('p2-weapon-rpm-wrap');
  if (p2WeaponRpmWrap) {
    p2WeaponRpmWrap.addEventListener('click', () => {
      if (enemyBot && gameMode === '1v1') togglePlayerWeapon(enemyBot);
    });
  }

  // ========================================================
  // 7.5 GAMEPAD / CONTROLLER ENGINE
  // Left Stick Y: Forward & Backward (Throttle)
  // Right Stick X: Turn Left & Right (Steer)
  // Left Bumper (LB / Button 4): Weapon ON / OFF
  // Right Bumper (RB / Button 5): Change Camera Angle
  // ========================================================
  const prevGamepadButtons = [
    { lb: false, rb: false, start: false },
    { lb: false, rb: false, start: false }
  ];

  function getConnectedGamepadsList() {
    if (window._mockGamepads && Array.isArray(window._mockGamepads) && window._mockGamepads.length > 0) {
      return window._mockGamepads.filter(p => p && p.connected !== false);
    }
    if (typeof navigator.getGamepads !== 'function') return [];
    const rawGamepads = navigator.getGamepads();
    if (!rawGamepads) return [];
    const connectedPads = [];
    for (let i = 0; i < rawGamepads.length; i++) {
      if (rawGamepads[i] && rawGamepads[i].connected) connectedPads.push(rawGamepads[i]);
    }
    return connectedPads;
  }

  // ========================================================
  // CONTROLLER TO PLAYER (P1 / P2) MAPPER
  // Allows assigning any connected controller (or Keyboard Only) to P1 or P2,
  // swapping P1 <-> P2 with 1 click or [Y], or pressing [LB] for P1 / [RB] for P2!
  // ========================================================
  const GamepadMapper = {
    init() {
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el && !el._mapperBound) {
          el._mapperBound = true;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            fn();
          });
        }
      };
      bindClick('btn-map-p1', () => this.cyclePlayerPad(0));
      bindClick('btn-map-p2', () => this.cyclePlayerPad(1));
      bindClick('btn-swap-controllers', () => this.swapControllers());
      bindClick('btn-pause-map-p1', () => this.cyclePlayerPad(0));
      bindClick('btn-pause-map-p2', () => this.cyclePlayerPad(1));
      bindClick('btn-pause-swap-controllers', () => this.swapControllers());
      this.updateUI();
    },

    getPadForPlayer(playerSlot = 0) {
      const pads = getConnectedGamepadsList();
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const mappedIdx = (playerSlot === 0) ? gamepadPlayerMap.p1 : gamepadPlayerMap.p2;
      if (mappedIdx === -1) return null; // Explicitly set to Keyboard Only
      if (mappedIdx >= 0 && mappedIdx < pads.length) {
        return pads[mappedIdx];
      }
      // In single-player modes (vs_bot / practice), if only 1 controller is connected at slot 0, allow P1 to use it
      if (playerSlot === 0 && (typeof gameMode === 'undefined' || gameMode !== '1v1') && pads.length === 1 && mappedIdx >= 1) {
        return pads[0];
      }
      return null;
    },

    setPlayerPad(playerSlot, padIdx) {
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const oldP1 = gamepadPlayerMap.p1;
      const oldP2 = gamepadPlayerMap.p2;

      if (playerSlot === 0) {
        gamepadPlayerMap.p1 = padIdx;
        // If P2 was using this physical controller, automatically swap P2 to P1's previous slot
        if (padIdx >= 0 && gamepadPlayerMap.p2 === padIdx) {
          gamepadPlayerMap.p2 = (oldP1 !== padIdx) ? oldP1 : (padIdx === 0 ? 1 : 0);
        }
      } else {
        gamepadPlayerMap.p2 = padIdx;
        // If P1 was using this physical controller, automatically swap P1 to P2's previous slot
        if (padIdx >= 0 && gamepadPlayerMap.p1 === padIdx) {
          gamepadPlayerMap.p1 = (oldP2 !== padIdx) ? oldP2 : (padIdx === 0 ? 1 : 0);
        }
      }

      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(playerSlot === 0 ? 640 : 760, 0.06);
      }
      this.updateUI();
    },

    cyclePlayerPad(playerSlot) {
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const pads = getConnectedGamepadsList();
      const maxControllers = Math.max(2, pads.length);
      // Options sequence: Controller #1 (0), Controller #2 (1), ..., Keyboard Only (-1)
      const options = [];
      for (let i = 0; i < maxControllers; i++) options.push(i);
      options.push(-1);

      const cur = (playerSlot === 0) ? gamepadPlayerMap.p1 : gamepadPlayerMap.p2;
      let idx = options.indexOf(cur);
      if (idx < 0) idx = 0;
      const nextVal = options[(idx + 1) % options.length];
      this.setPlayerPad(playerSlot, nextVal);
    },

    swapControllers() {
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const tmp = gamepadPlayerMap.p1;
      gamepadPlayerMap.p1 = gamepadPlayerMap.p2;
      gamepadPlayerMap.p2 = tmp;
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(720, 0.07);
      }
      this.updateUI();
    },

    formatSlotLabel(padIdx, kbFallback, shortMode = false) {
      const pads = getConnectedGamepadsList();
      if (padIdx === -1) {
        return shortMode ? `⌨️ ${kbFallback} ONLY` : `⌨️ Keyboard Only (${kbFallback})`;
      }
      const isConnected = padIdx >= 0 && padIdx < pads.length;
      const num = padIdx + 1;
      if (shortMode) {
        return `🎮 CONTROLLER #${num} / ${kbFallback}`;
      }
      return isConnected
        ? `🎮 Controller #${num} (Ready) + ${kbFallback}`
        : `🎮 Controller #${num} + ${kbFallback}`;
    },

    updateUI() {
      if (typeof gamepadPlayerMap === 'undefined' || !gamepadPlayerMap) return;
      const pads = getConnectedGamepadsList();
      const statusEl = document.getElementById('controller-connected-status');
      if (statusEl) {
        if (pads.length === 0) {
          statusEl.textContent = '0 Controllers Connected (Keyboard Active)';
          statusEl.classList.remove('connected');
        } else if (pads.length === 1) {
          statusEl.textContent = '1 Controller Connected';
          statusEl.classList.add('connected');
        } else {
          statusEl.textContent = `${pads.length} Controllers Connected`;
          statusEl.classList.add('connected');
        }
      }

      const p1Label = document.getElementById('map-p1-label');
      if (p1Label) p1Label.textContent = this.formatSlotLabel(gamepadPlayerMap.p1, 'WASD', false);
      const p2Label = document.getElementById('map-p2-label');
      if (p2Label) p2Label.textContent = this.formatSlotLabel(gamepadPlayerMap.p2, 'Arrows', false);

      const pauseP1 = document.getElementById('pause-map-p1-label');
      if (pauseP1) pauseP1.textContent = this.formatSlotLabel(gamepadPlayerMap.p1, 'WASD', false);
      const pauseP2 = document.getElementById('pause-map-p2-label');
      if (pauseP2) pauseP2.textContent = this.formatSlotLabel(gamepadPlayerMap.p2, 'Arrows', false);

      const p1Badge = document.querySelector('#splitscreen-overlay .p1-badge');
      if (p1Badge) {
        p1Badge.textContent = `🔵 P1 · ${this.formatSlotLabel(gamepadPlayerMap.p1, 'WASD', true)}`;
      }
      const p2Badge = document.querySelector('#splitscreen-overlay .p2-badge');
      if (p2Badge) {
        p2Badge.textContent = `🔴 P2 · ${this.formatSlotLabel(gamepadPlayerMap.p2, 'ARROWS', true)}`;
      }
    }
  };
  window.GamepadMapper = GamepadMapper;
  setTimeout(() => GamepadMapper.init(), 0);

  function pollGamepadControls(playerIndex = 0) {
    const pad = GamepadMapper.getPadForPlayer(playerIndex);
    if (!pad) return null;

    const applyDeadzone = (val, threshold = 0.16) => {
      if (Math.abs(val) < threshold) return 0;
      const sign = Math.sign(val);
      return sign * Math.min(1.0, (Math.abs(val) - threshold) / (1.0 - threshold));
    };

    // 1. Trigger acceleration/reverse controls:
    // Right Trigger (RT / R2 / buttons[7]): Forward (0 to +1.0)
    // Left Trigger (LT / L2 / buttons[6]): Backward / Reverse (0 to -1.0)
    let rtVal = 0;
    let ltVal = 0;
    if (pad.buttons) {
      if (pad.buttons[7]) {
        rtVal = typeof pad.buttons[7].value === 'number' ? pad.buttons[7].value : (pad.buttons[7].pressed ? 1.0 : 0);
      }
      if (pad.buttons[6]) {
        ltVal = typeof pad.buttons[6].value === 'number' ? pad.buttons[6].value : (pad.buttons[6].pressed ? 1.0 : 0);
      }
    }
    const rtFiltered = applyDeadzone(rtVal, 0.08);
    const ltFiltered = applyDeadzone(ltVal, 0.08);
    const triggerThrottle = rtFiltered - ltFiltered; // RT drives forward (+), LT drives backward (-)

    // 2. Left joystick for forward and backward (axes[1], inverted: up = forward)
    let leftY = (pad.axes && pad.axes.length > 1) ? pad.axes[1] : 0;
    let stickThrottle = -applyDeadzone(leftY, 0.16);

    // Combine Trigger Throttle and Stick Throttle:
    // If triggers are actively pulled, use trigger throttle; otherwise fall back to joystick or D-pad
    let throttle = 0;
    if (Math.abs(triggerThrottle) > 0.02) {
      throttle = triggerThrottle;
    } else {
      throttle = stickThrottle;
    }

    // Optional D-Pad fallback for throttle
    if (Math.abs(throttle) < 0.1 && pad.buttons) {
      if (pad.buttons[12] && (pad.buttons[12].pressed || pad.buttons[12].value > 0.5)) throttle = 1.0;
      else if (pad.buttons[13] && (pad.buttons[13].pressed || pad.buttons[13].value > 0.5)) throttle = -1.0;
    }

    // 2. Turn Left and Right: Supports BOTH Left Joystick (axes[0]) AND Right Joystick (axes[2])
    // Left Stick X (axes[0]): Allows full single-stick driving on left joystick
    let leftX = (pad.axes && pad.axes.length > 0) ? pad.axes[0] : 0;
    let leftStickSteer = applyDeadzone(leftX, 0.16);

    // Right Stick X (axes[2] or fallback axes[5]): Also allows dual-stick steering
    let rightX = (pad.axes && pad.axes.length > 2) ? pad.axes[2] : 0;
    if (Math.abs(rightX) < 0.1 && pad.axes && pad.axes.length > 5 && Math.abs(pad.axes[5]) > 0.1) {
      rightX = pad.axes[5];
    }
    let rightStickSteer = applyDeadzone(rightX, 0.16);

    // Steer with EITHER left joystick or right joystick (dominant stick deflection)
    let steer = Math.abs(leftStickSteer) >= Math.abs(rightStickSteer) ? leftStickSteer : rightStickSteer;

    // Optional D-Pad fallback for steer
    if (Math.abs(steer) < 0.1 && pad.buttons) {
      if (pad.buttons[14] && (pad.buttons[14].pressed || pad.buttons[14].value > 0.5)) steer = -1.0;
      else if (pad.buttons[15] && (pad.buttons[15].pressed || pad.buttons[15].value > 0.5)) steer = 1.0;
    }

    if (!prevGamepadButtons[playerIndex]) {
      prevGamepadButtons[playerIndex] = { lb: false, rb: false, start: false };
    }
    const prev = prevGamepadButtons[playerIndex];

    // 3. Left button (LB / buttons[4]) for turning weapon on/off
    const lbPressed = !!(pad.buttons && pad.buttons[4] && (pad.buttons[4].pressed || pad.buttons[4].value > 0.5));
    if (lbPressed && !prev.lb && (typeof matchState !== 'undefined' && (matchState === 'playing' || matchState === 'countdown'))) {
      if (playerIndex === 0 && playerBot) {
        togglePlayerWeapon(playerBot);
      } else if (playerIndex === 1 && enemyBot && gameMode === '1v1') {
        togglePlayerWeapon(enemyBot);
      }
    }
    prev.lb = lbPressed;

    // 4. Right button (RB / buttons[5]) for changing camera angle (P1 cycles Cam 1, P2 cycles Cam 2 in Split Screen!)
    const rbPressed = !!(pad.buttons && pad.buttons[5] && (pad.buttons[5].pressed || pad.buttons[5].value > 0.5));
    if (rbPressed && !prev.rb) {
      if (playerIndex === 0 && (matchState === 'playing' || matchState === 'countdown')) {
        cycleCameraMode();
      } else if (playerIndex === 1 && gameMode === '1v1' && (matchState === 'playing' || matchState === 'countdown')) {
        if (typeof cycleCameraModeP2 === 'function') cycleCameraModeP2();
      }
    }
    prev.rb = rbPressed;

    // 5. Start / Menu button (buttons[9]) for pause toggle
    const startPressed = !!(pad.buttons && pad.buttons[9] && (pad.buttons[9].pressed || pad.buttons[9].value > 0.5));
    if (startPressed && !prev.start) {
      const btnPause = document.getElementById('btn-pause');
      const btnResume = document.getElementById('btn-resume-game');
      if (matchState === 'playing' && btnPause) btnPause.click();
      else if (matchState === 'paused' && btnResume) btnResume.click();
    }
    prev.start = startPressed;

    return {
      throttle,
      steer,
      hasInput: Math.abs(throttle) > 0.05 || Math.abs(steer) > 0.05
    };
  }

  window.addEventListener('gamepadconnected', (e) => {
    console.log(`🎮 Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}`);
    const hint = document.getElementById('hint-controls-text');
    if (hint) {
      hint.innerHTML = `<span style="color:#38bdf8;">🎮 CONTROLLER CONNECTED:</span> <kbd>RT</kbd> Forward · <kbd>LT</kbd> Reverse · Stick: Steer · <kbd>LB</kbd> Weapon · <kbd>RB</kbd> Camera`;
    }
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    console.log(`🎮 Gamepad disconnected from index ${e.gamepad.index}`);
    const hint = document.getElementById('hint-controls-text');
    if (hint) {
      hint.innerHTML = `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> Drive · <kbd>SPACE</kbd> Weapon ON/OFF`;
    }
  });


  // BGM Soundtrack Toggle Buttons (Menu & In-Game HUD)
  const btnMenuMusic = document.getElementById('btn-menu-music');
  if (btnMenuMusic) {
    btnMenuMusic.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioSys.init();
      if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
        AudioSys.ctx.resume().then(() => {
          BgmSys.enabled = true;
          BgmSys.updateGain();
          if (!BgmSys.isPlaying) BgmSys.start();
          BgmSys.updateUI();
        });
      } else if (!BgmSys.isPlaying) {
        BgmSys.enabled = true;
        BgmSys.updateGain();
        BgmSys.start();
        BgmSys.updateUI();
      } else {
        BgmSys.toggle();
      }
    });
  }

  const btnHudMusic = document.getElementById('btn-hud-music');
  if (btnHudMusic) {
    btnHudMusic.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioSys.init();
      if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
        AudioSys.ctx.resume().then(() => {
          BgmSys.enabled = true;
          BgmSys.updateGain();
          if (!BgmSys.isPlaying) BgmSys.start();
          BgmSys.updateUI();
        });
      } else {
        BgmSys.toggle();
      }
    });
  }

  // Menu Spectate & Camera Controls
  const btnMenuSpectate = document.getElementById('btn-menu-spectate');
  const btnMenuRestore = document.getElementById('btn-menu-restore');
  const btnMenuCamera = document.getElementById('btn-menu-camera');
  const menuCardEl = document.querySelector('#menu-screen .menu-card');

  // ========================================================
  // AUTO SPECTATE IDLE ENGINE (10s Inactivity in Main Menu)
  // ========================================================
  let lastMenuActivityTime = performance.now();
  const MENU_IDLE_TIMEOUT_SEC = 10.0;

  function resetMenuIdleTimer() {
    lastMenuActivityTime = performance.now();
  }

  function isAnyModalOpen() {
    const modalIds = ['modal-select', 'modal-1v1', 'modal-online-host', 'modal-online-join', 'modal-pause', 'modal-gameover'];
    for (const id of modalIds) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) return true;
    }
    const menuEl = document.getElementById('menu-screen');
    if (!menuEl || menuEl.classList.contains('hidden')) return true;
    return false;
  }

  function isMenuSpectating() {
    return (typeof matchState !== 'undefined' && matchState === 'menu' && menuCardEl && menuCardEl.classList.contains('minimized'));
  }

  function toggleMenuSpectate(minimized) {
    if (!menuCardEl) return;
    const isMin = (typeof minimized === 'boolean') ? minimized : !menuCardEl.classList.contains('minimized');
    if (isMin) {
      menuCardEl.classList.add('minimized');
      if (btnMenuRestore) btnMenuRestore.classList.remove('hidden');
      if (btnMenuSpectate) btnMenuSpectate.innerHTML = '👁 Show Menu';
    } else {
      menuCardEl.classList.remove('minimized');
      if (btnMenuRestore) btnMenuRestore.classList.add('hidden');
      if (btnMenuSpectate) btnMenuSpectate.innerHTML = '👁 Spectate Arena';
    }
    resetMenuIdleTimer();
  }

  function updateMenuIdleSpectate() {
    if (typeof matchState === 'undefined' || matchState !== 'menu') {
      lastMenuActivityTime = performance.now();
      return;
    }
    if (isAnyModalOpen()) {
      lastMenuActivityTime = performance.now();
      return;
    }
    if (isMenuSpectating()) {
      lastMenuActivityTime = performance.now();
      return;
    }

    const idleSeconds = (performance.now() - lastMenuActivityTime) / 1000;
    if (idleSeconds >= MENU_IDLE_TIMEOUT_SEC) {
      lastMenuActivityTime = performance.now();
      toggleMenuSpectate(true);
    }
  }

  // Periodic heartbeat timer guaranteeing 10s idle trigger even if rAF is backgrounded
  setInterval(updateMenuIdleSpectate, 250);

  // 1. Press ANY key: exit spectate mode & reset idle countdown
  window.addEventListener('keydown', (e) => {
    if (isMenuSpectating()) {
      toggleMenuSpectate(false);
      resetMenuIdleTimer();
      return;
    }
    if (typeof matchState !== 'undefined' && matchState === 'menu') {
      resetMenuIdleTimer();
    }
  }, { passive: true });

  // 2. Click or tap anywhere: exit spectate mode & reset idle countdown
  window.addEventListener('pointerdown', (e) => {
    if (isMenuSpectating()) {
      const isTopControl = e.target && e.target.closest && e.target.closest('#btn-menu-camera, #btn-menu-music, #btn-menu-fullscreen');
      if (!isTopControl) {
        toggleMenuSpectate(false);
        resetMenuIdleTimer();
        return;
      }
    }
    if (typeof matchState !== 'undefined' && matchState === 'menu') {
      resetMenuIdleTimer();
    }
  }, { passive: true });

  // 3. Pointer move & wheel: reset idle countdown while in menu
  window.addEventListener('pointermove', () => {
    if (typeof matchState !== 'undefined' && matchState === 'menu' && !isMenuSpectating()) {
      resetMenuIdleTimer();
    }
  }, { passive: true });

  window.addEventListener('wheel', () => {
    if (isMenuSpectating()) {
      toggleMenuSpectate(false);
    }
    resetMenuIdleTimer();
  }, { passive: true });

  // 4. Touchstart support
  window.addEventListener('touchstart', (e) => {
    if (isMenuSpectating()) {
      const isTopControl = e.target && e.target.closest && e.target.closest('#btn-menu-camera, #btn-menu-music, #btn-menu-fullscreen');
      if (!isTopControl) {
        toggleMenuSpectate(false);
        resetMenuIdleTimer();
        return;
      }
    }
    if (typeof matchState !== 'undefined' && matchState === 'menu') {
      resetMenuIdleTimer();
    }
  }, { passive: true });

  if (btnMenuSpectate) {
    btnMenuSpectate.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenuSpectate();
    });
  }
  if (btnMenuRestore) {
    btnMenuRestore.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenuSpectate(false);
    });
  }

  const menuScreenEl = document.getElementById('menu-screen');
  if (menuScreenEl) {
    menuScreenEl.addEventListener('click', (e) => {
      if (menuCardEl && menuCardEl.classList.contains('minimized')) {
        const isTopControl = e.target && e.target.closest && e.target.closest('#btn-menu-camera, #btn-menu-music, #btn-menu-fullscreen');
        if (!isTopControl) {
          toggleMenuSpectate(false);
        }
      }
    });
  }

  if (btnMenuCamera) {
    btnMenuCamera.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleMenuCameraMode();
    });
  }

  window.toggleMenuSpectate = toggleMenuSpectate;
  window.updateMenuIdleSpectate = updateMenuIdleSpectate;
  window.resetMenuIdleTimer = resetMenuIdleTimer;
  window.isMenuSpectating = isMenuSpectating;
  window.fastForwardMenuIdle = (sec) => { lastMenuActivityTime -= sec * 1000; updateMenuIdleSpectate(); };
  window.getMenuIdleSeconds = () => (performance.now() - lastMenuActivityTime) / 1000;

  // HUD Side Dock Toggle (Left / Right)
  const btnDockToggle = document.getElementById('btn-dock-toggle');
  const controlsBar = document.getElementById('controls-bottom-bar');
  if (btnDockToggle && controlsBar) {
    const savedDock = localStorage.getItem('bbx_hud_dock');
    if (savedDock === 'right') {
      controlsBar.classList.add('dock-right');
    }
    btnDockToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isRight = controlsBar.classList.toggle('dock-right');
      localStorage.setItem('bbx_hud_dock', isRight ? 'right' : 'left');
    });
  }

  const throttleTrack = document.getElementById('throttle-track');
  const throttleKnob = document.getElementById('throttle-knob');
  const steerTrack = document.getElementById('steer-track');
  const steerKnob = document.getElementById('steer-knob');

  function updateThrottleFromCoord(clientY) {
    const rect = throttleTrack.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const maxOffset = (rect.height - 50) / 2;
    const dy = Math.max(-maxOffset, Math.min(maxOffset, clientY - center));
    sliderThrottleVal = -dy / maxOffset;
    if (throttleKnob) throttleKnob.style.transform = `translateY(${dy}px)`;
  }

  function updateSteerFromCoord(clientX) {
    const rect = steerTrack.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const maxOffset = (rect.width - 50) / 2;
    const dx = Math.max(-maxOffset, Math.min(maxOffset, clientX - center));
    sliderSteerVal = dx / maxOffset;
    if (steerKnob) steerKnob.style.transform = `translateX(${dx}px)`;
  }

  function resetThrottle() {
    dragThrottle = false;
    sliderThrottleVal = 0;
    if (throttleKnob) throttleKnob.style.transform = 'translateY(0px)';
  }

  function resetSteer() {
    dragSteer = false;
    sliderSteerVal = 0;
    if (steerKnob) steerKnob.style.transform = 'translateX(0px)';
  }

  // Pointer event listeners (desktop mice & unified pointers)
  throttleTrack.addEventListener('pointerdown', (e) => {
    dragThrottle = true;
    try { throttleTrack.setPointerCapture(e.pointerId); } catch (err) {}
    updateThrottleFromCoord(e.clientY);
  });
  throttleTrack.addEventListener('pointermove', (e) => {
    if (dragThrottle) updateThrottleFromCoord(e.clientY);
  });
  throttleTrack.addEventListener('pointerup', resetThrottle);
  throttleTrack.addEventListener('pointercancel', resetThrottle);

  steerTrack.addEventListener('pointerdown', (e) => {
    dragSteer = true;
    try { steerTrack.setPointerCapture(e.pointerId); } catch (err) {}
    updateSteerFromCoord(e.clientX);
  });
  steerTrack.addEventListener('pointermove', (e) => {
    if (dragSteer) updateSteerFromCoord(e.clientX);
  });
  steerTrack.addEventListener('pointerup', resetSteer);
  steerTrack.addEventListener('pointercancel', resetSteer);

  // Dedicated multi-touch engine for mobile phones & tablets (allows simultaneous drive & steer)
  let activeThrottleTouchId = null;
  let activeSteerTouchId = null;

  throttleTrack.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.targetTouches[0];
    if (t) {
      activeThrottleTouchId = t.identifier;
      dragThrottle = true;
      updateThrottleFromCoord(t.clientY);
    }
  }, { passive: false });

  steerTrack.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.targetTouches[0];
    if (t) {
      activeSteerTouchId = t.identifier;
      dragSteer = true;
      updateSteerFromCoord(t.clientX);
    }
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeThrottleTouchId) {
        updateThrottleFromCoord(t.clientY);
      }
      if (t.identifier === activeSteerTouchId) {
        updateSteerFromCoord(t.clientX);
      }
    }
  }, { passive: false });

  function handleTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeThrottleTouchId) {
        activeThrottleTouchId = null;
        resetThrottle();
      }
      if (t.identifier === activeSteerTouchId) {
        activeSteerTouchId = null;
        resetSteer();
      }
    }
  }
  window.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('touchcancel', handleTouchEnd);



  // ========================================================
  // 7.6 CONTROLLER UI & MENU NAVIGATION ENGINE (1 & 2 CONTROLLERS)
  // Navigate all menus, modals, and robot cards with D-Pad / Left Stick,
  // [A / Cross] to Select, [B / Circle] to Go Back, [Start] to Launch Match!
  // ========================================================
  const GamepadUINav = {
    focusedEl: null,
    activeContainerId: null,
    navCooldown: 0,
    prevPadStates: [
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null }
    ],

    getActiveContainer() {
      const modalPriority = [
        'modal-gameover',
        'modal-pause',
        'modal-online-host',
        'modal-online-join',
        'modal-select',
        'modal-1v1'
      ];
      for (const id of modalPriority) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return el;
      }
      if (typeof matchState === 'undefined' || matchState === 'menu') {
        const menuEl = document.getElementById('menu-screen');
        if (menuEl && !menuEl.classList.contains('hidden')) return menuEl;
      }
      return null;
    },

    getFocusableElements(container) {
      if (!container) return [];
      if (container.id === 'menu-screen' && typeof isMenuSpectating === 'function' && isMenuSpectating()) {
        const restoreBtn = document.getElementById('btn-menu-restore');
        return restoreBtn ? [restoreBtn] : [];
      }
      const selector = [
        '.mode-btn:not(.hidden)',
        '.controller-map-btn:not(.hidden)',
        '.bot-card:not(.hidden)',
        '.mini-bot-card:not(.hidden)',
        '.action-btn:not(.hidden)',
        '.close-btn:not(.hidden)',
        '.menu-nav-btn:not(.hidden)',
        '.menu-music-btn:not(.hidden)',
        '.menu-fullscreen-btn:not(.hidden)'
      ].join(', ');
      const nodes = Array.from(container.querySelectorAll(selector));
      return nodes.filter(el => {
        if (el.disabled || el.classList.contains('hidden')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    },

    setFocus(el) {
      if (this.focusedEl && this.focusedEl !== el) {
        this.focusedEl.classList.remove('gamepad-focus');
      }
      this.focusedEl = el;
      if (el) {
        el.classList.add('gamepad-focus');
        try {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) {}
      }
    },

    clearFocus() {
      if (this.focusedEl) {
        this.focusedEl.classList.remove('gamepad-focus');
        this.focusedEl = null;
      }
      this.activeContainerId = null;
    },

    ensureValidFocus() {
      const container = this.getActiveContainer();
      if (!container) {
        this.clearFocus();
        return null;
      }
      const items = this.getFocusableElements(container);
      if (items.length === 0) {
        this.clearFocus();
        return null;
      }
      if (this.activeContainerId !== container.id || !this.focusedEl || !items.includes(this.focusedEl)) {
        this.activeContainerId = container.id;
        // Pick a sensible default focus element in the new container
        let def = null;
        if (container.id === 'menu-screen') {
          def = container.querySelector('.menu-actions .mode-btn.primary') || container.querySelector('.menu-actions .mode-btn');
        } else if (container.id === 'modal-1v1') {
          def = document.getElementById('btn-1v1-local');
        } else if (container.id === 'modal-select') {
          def = container.querySelector('#p1-bot-selector .bot-card.selected') || container.querySelector('#p1-bot-selector .bot-card');
        } else if (container.id === 'modal-pause') {
          def = document.getElementById('btn-resume-game');
        } else if (container.id === 'modal-gameover') {
          def = document.getElementById('btn-play-again');
        } else if (container.id === 'modal-online-host') {
          def = container.querySelector('#host-bot-selector .mini-bot-card.selected') || document.getElementById('btn-copy-code');
        } else if (container.id === 'modal-online-join') {
          def = container.querySelector('#join-bot-selector .mini-bot-card.selected') || document.getElementById('btn-join-connect');
        }
        this.setFocus((def && items.includes(def)) ? def : items[0]);
      } else {
        this.focusedEl.classList.add('gamepad-focus');
      }
      return this.focusedEl;
    },

    moveFocus(dir) {
      const container = this.getActiveContainer();
      if (!container) return false;
      if (container.id === 'menu-screen' && typeof isMenuSpectating === 'function' && isMenuSpectating()) {
        toggleMenuSpectate(false);
        return true;
      }
      const items = this.getFocusableElements(container);
      if (items.length === 0) return false;

      const current = this.ensureValidFocus();
      if (!current) return false;

      const curRect = current.getBoundingClientRect();
      const fx = curRect.left + curRect.width * 0.5;
      const fy = curRect.top + curRect.height * 0.5;

      let bestCandidate = null;
      let bestScore = Infinity;

      for (const el of items) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        const dx = cx - fx;
        const dy = cy - fy;

        if (dir === 'right') {
          if (dx <= 8) continue;
          const sameRow = Math.abs(dy) < Math.max(curRect.height, r.height) * 0.75;
          const score = sameRow ? dx + Math.abs(dy) * 2.5 : 10000 + dx + Math.abs(dy) * 8.0;
          if (score < bestScore) { bestScore = score; bestCandidate = el; }
        } else if (dir === 'left') {
          if (dx >= -8) continue;
          const sameRow = Math.abs(dy) < Math.max(curRect.height, r.height) * 0.75;
          const score = sameRow ? Math.abs(dx) + Math.abs(dy) * 2.5 : 10000 + Math.abs(dx) + Math.abs(dy) * 8.0;
          if (score < bestScore) { bestScore = score; bestCandidate = el; }
        } else if (dir === 'down') {
          if (dy <= 10) continue;
          const score = dy * 2.2 + Math.abs(dx) * 0.85;
          if (score < bestScore) { bestScore = score; bestCandidate = el; }
        } else if (dir === 'up') {
          if (dy >= -10) continue;
          const score = Math.abs(dy) * 2.2 + Math.abs(dx) * 0.85;
          if (score < bestScore) { bestScore = score; bestCandidate = el; }
        }
      }

      if (bestCandidate) {
        this.setFocus(bestCandidate);
        if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
          AudioSys.init();
          AudioSys.beep(520, 0.04);
        }
        if (typeof resetMenuIdleTimer === 'function') resetMenuIdleTimer();
        return true;
      }
      return false;
    },

    confirmSelection() {
      const container = this.getActiveContainer();
      if (!container) return false;
      if (container.id === 'menu-screen' && typeof isMenuSpectating === 'function' && isMenuSpectating()) {
        toggleMenuSpectate(false);
        return true;
      }
      const current = this.ensureValidFocus();
      if (!current) return false;

      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(680, 0.07);
      }
      if (typeof resetMenuIdleTimer === 'function') resetMenuIdleTimer();

      const isP1Card = current.closest && current.closest('#p1-bot-selector');
      const isP2Card = current.closest && current.closest('#p2-bot-selector');

      current.click();

      // Ergonomic Controller Flow in Robot Select Modal:
      // Selecting a P1 robot card advances focus to P2 robot row; selecting a P2 robot card advances focus to START MATCH!
      if (isP1Card) {
        const p2Selected = container.querySelector('#p2-bot-selector .bot-card.selected') || container.querySelector('#p2-bot-selector .bot-card');
        if (p2Selected) this.setFocus(p2Selected);
      } else if (isP2Card) {
        const startBtn = document.getElementById('btn-start-match');
        if (startBtn) this.setFocus(startBtn);
      } else {
        setTimeout(() => this.ensureValidFocus(), 30);
      }
      return true;
    },

    cancelOrBack() {
      const container = this.getActiveContainer();
      if (!container) return false;
      if (container.id === 'menu-screen') {
        if (typeof isMenuSpectating === 'function' && isMenuSpectating()) {
          toggleMenuSpectate(false);
          return true;
        }
        return false;
      }
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(380, 0.06);
      }
      const backMap = {
        'modal-select': 'btn-select-close',
        'modal-1v1': 'btn-1v1-back',
        'modal-online-host': 'btn-host-cancel',
        'modal-online-join': 'btn-join-back',
        'modal-pause': 'btn-resume-game',
        'modal-gameover': 'btn-back-menu'
      };
      const btnId = backMap[container.id];
      const backBtn = btnId ? document.getElementById(btnId) : null;
      if (backBtn) {
        backBtn.click();
        setTimeout(() => this.ensureValidFocus(), 30);
        return true;
      }
      return false;
    },

    cycleP2BotDirect(step) {
      const modalSelect = document.getElementById('modal-select');
      if (!modalSelect || modalSelect.classList.contains('hidden')) return false;
      const cards = Array.from(modalSelect.querySelectorAll('#p2-bot-selector .bot-card'));
      if (cards.length === 0) return false;
      let idx = cards.findIndex(c => c.classList.contains('selected'));
      if (idx < 0) idx = 0;
      idx = (idx + step + cards.length) % cards.length;
      cards[idx].click();
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(580, 0.04);
      }
      return true;
    },

    readPadDir(pad) {
      if (!pad) return null;
      const b = pad.buttons || [];
      if (b[12] && (b[12].pressed || b[12].value > 0.5)) return 'up';
      if (b[13] && (b[13].pressed || b[13].value > 0.5)) return 'down';
      if (b[14] && (b[14].pressed || b[14].value > 0.5)) return 'left';
      if (b[15] && (b[15].pressed || b[15].value > 0.5)) return 'right';
      const axX = (pad.axes && pad.axes.length > 0) ? pad.axes[0] : 0;
      const axY = (pad.axes && pad.axes.length > 1) ? pad.axes[1] : 0;
      if (axY < -0.55) return 'up';
      if (axY > 0.55) return 'down';
      if (axX < -0.55) return 'left';
      if (axX > 0.55) return 'right';
      return null;
    },

    update(dt) {
      if (typeof GamepadMapper !== 'undefined') {
        GamepadMapper.updateUI();
      }
      const container = this.getActiveContainer();
      if (!container) {
        if (this.focusedEl) this.clearFocus();
        return;
      }

      const pads = getConnectedGamepadsList();
      if (pads.length > 0) {
        this.ensureValidFocus();
      }

      if (this.navCooldown > 0) {
        this.navCooldown = Math.max(0, this.navCooldown - dt);
      }

      const isMappingModal = (container.id === 'modal-select' || container.id === 'modal-pause');

      for (let pIdx = 0; pIdx < Math.min(4, pads.length); pIdx++) {
        const pad = pads[pIdx];
        if (!pad) continue;
        if (!this.prevPadStates[pIdx]) {
          this.prevPadStates[pIdx] = { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null };
        }
        const prev = this.prevPadStates[pIdx];
        const b = pad.buttons || [];

        const aPressed = !!(b[0] && (b[0].pressed || b[0].value > 0.5));
        const bPressed = !!(b[1] && (b[1].pressed || b[1].value > 0.5));
        const yPressed = !!(b[3] && (b[3].pressed || b[3].value > 0.5));
        const lbPressed = !!(b[4] && (b[4].pressed || b[4].value > 0.5));
        const rbPressed = !!(b[5] && (b[5].pressed || b[5].value > 0.5));
        const startPressed = !!(b[9] && (b[9].pressed || b[9].value > 0.5));
        const dir = this.readPadDir(pad);

        // Quick Controller Mapping Shortcuts on Robot Select & Pause Modals:
        // - Press [LB] on any controller -> Assigns that controller to PLAYER 1 (P1)
        // - Press [RB] on any controller -> Assigns that controller to PLAYER 2 (P2)
        // - Press [Y] on any controller  -> Swaps P1 <-> P2 Controllers
        if (isMappingModal && typeof GamepadMapper !== 'undefined') {
          if (lbPressed && !prev.lb) {
            GamepadMapper.setPlayerPad(0, pIdx);
          }
          if (rbPressed && !prev.rb) {
            GamepadMapper.setPlayerPad(1, pIdx);
          }
          if (yPressed && !prev.y) {
            GamepadMapper.swapControllers();
          }
        }

        const isMappedToP2 = (typeof gamepadPlayerMap !== 'undefined' && gamepadPlayerMap.p2 === pIdx && gamepadPlayerMap.p1 !== pIdx);

        // When a controller is mapped to P2 on the Robot Select screen (#modal-select) and another controller or keyboard is P1,
        // P2's controller Left/Right directly cycles Player 2's robot selection card!
        if (isMappedToP2 && container.id === 'modal-select' && pads.length >= 2 && (dir === 'left' || dir === 'right')) {
          if (dir !== prev.dir || this.navCooldown <= 0) {
            this.cycleP2BotDirect(dir === 'right' ? 1 : -1);
            this.navCooldown = (dir !== prev.dir) ? 0.26 : 0.16;
          }
        } else if (dir) {
          if (dir !== prev.dir || this.navCooldown <= 0) {
            this.moveFocus(dir);
            this.navCooldown = (dir !== prev.dir) ? 0.26 : 0.16;
          }
        }

        if (aPressed && !prev.a) {
          this.confirmSelection();
        }
        if (bPressed && !prev.b) {
          this.cancelOrBack();
        }
        if (startPressed && !prev.start && container.id === 'modal-select') {
          const startBtn = document.getElementById('btn-start-match');
          if (startBtn) startBtn.click();
        }

        prev.a = aPressed;
        prev.b = bPressed;
        prev.y = yPressed;
        prev.lb = lbPressed;
        prev.rb = rbPressed;
        prev.start = startPressed;
        prev.dir = dir;
      }
    }
  };

  function updateGamepadMenuNavigation(dt) {
    GamepadUINav.update(dt || 0.016);
  }
  window.GamepadUINav = GamepadUINav;
  window.updateGamepadMenuNavigation = updateGamepadMenuNavigation;
