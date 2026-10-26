// ========================================================
// BATTLEBOTx - INPUT CONTROLLERS & GAMEPAD ENGINE
// ========================================================

  // ========================================================
  // 7. INPUT HANDLING
  // ========================================================
  function togglePlayerWeapon(bot = playerBot) {
    if (!bot) return;
    bot.weaponActive = (bot.weaponActive === false) ? true : false;
    // When turning off, do not stop abruptly: let mechanical inertia smoothly coast down in updateRobotPhysics
    if (typeof AudioSys !== 'undefined' && AudioSys.ctx) {
      if (bot.weaponActive) {
        AudioSys.beep(840, 0.08); // High chirp for Weapon ON
      } else {
        AudioSys.beep(320, 0.12); // Low spindown hum for Weapon OFF
      }
    }
    console.log(`⚡ Weapon toggled: ${bot.weaponActive ? 'ON' : 'OFF'}`);
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

  function pollGamepadControls(playerIndex = 0) {
    if (typeof navigator.getGamepads !== 'function') return null;
    const rawGamepads = navigator.getGamepads();
    if (!rawGamepads) return null;

    const connectedPads = [];
    for (let i = 0; i < rawGamepads.length; i++) {
      if (rawGamepads[i] && rawGamepads[i].connected) connectedPads.push(rawGamepads[i]);
    }
    if (playerIndex >= connectedPads.length) return null;
    const pad = connectedPads[playerIndex];

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
    if (lbPressed && !prev.lb) {
      if (playerIndex === 0 && playerBot) {
        togglePlayerWeapon(playerBot);
      } else if (playerIndex === 1 && enemyBot && gameMode === '1v1') {
        togglePlayerWeapon(enemyBot);
      }
    }
    prev.lb = lbPressed;

    // 4. Right button (RB / buttons[5]) for changing camera angle
    const rbPressed = !!(pad.buttons && pad.buttons[5] && (pad.buttons[5].pressed || pad.buttons[5].value > 0.5));
    if (rbPressed && !prev.rb) {
      if (playerIndex === 0 && (matchState === 'playing' || matchState === 'countdown')) {
        cycleCameraMode();
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

  window.AudioSys = AudioSys;
  window.BgmSys = BgmSys;
  window.addRobotMeshOutline = addRobotMeshOutline;
  window.pollGamepadControls = pollGamepadControls;
  window.togglePlayerWeapon = togglePlayerWeapon;
  window.handleBotCollision = (...args) => (typeof handleBotCollision === 'function' ? handleBotCollision(...args) : null);
  window.camera = camera;
  window.getMenuCameraMode = () => menuCameraMode;
  window.getMatchState = () => matchState;
  window.setMatchState = (s) => { matchState = s; };
  window.ensureBotModelLoaded = ensureBotModelLoaded;
  window.getBotScene = getBotScene;
  window.scene = scene;
  window.renderer = renderer;
  window.createBotInstance = (...args) => (typeof createBotInstance === 'function' ? createBotInstance(...args) : null);
  window.attachCadToRobot1 = attachCadToRobot1;
  window.attachCadToRobot2 = attachCadToRobot2;
  window.attachCadToRobot6 = attachCadToRobot6;

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
  }

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
      if (e.target === menuScreenEl && menuCardEl && menuCardEl.classList.contains('minimized')) {
        toggleMenuSpectate(false);
      }
    });
  }

  if (btnMenuCamera) {
    btnMenuCamera.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleMenuCameraMode();
    });
  }

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

