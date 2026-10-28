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
    { lb: false, rb: false, start: false },
    { lb: false, rb: false, start: false },
    { lb: false, rb: false, start: false }
  ];

  if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
    window.gamepadPlayerMap = { p1: 0, p2: 1 };
  }

  // ========================================================
  // NATIVE WINDOWS XINPUT / DIRECTINPUT BRIDGE FALLBACK
  // Fixes Windows 11 (26H2) XBOX Synthetic Gamepad Bus issue where
  // browser navigator.getGamepads() returns [null, null, null, null]
  // even when physical controllers are connected and active in Windows.
  // ========================================================
  window._nativeWinPads = [];
  let _nativePollInFlight = false;
  const _isLocalHostServer = (typeof location !== 'undefined') &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]');

  function pollNativeWinGamepads() {
    if (!_isLocalHostServer || _nativePollInFlight) return;
    if (window._mockGamepads && Array.isArray(window._mockGamepads) && window._mockGamepads.length > 0) return;
    _nativePollInFlight = true;
    fetch('/__gamepads', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        _nativePollInFlight = false;
        if (data && Array.isArray(data.pads)) {
          window._nativeWinPads = data.pads;
        }
      })
      .catch(() => {
        _nativePollInFlight = false;
      });
  }
  if (_isLocalHostServer) {
    setInterval(pollNativeWinGamepads, 32);
    pollNativeWinGamepads();
  }

  function isStandardGamepad(pad) {
    if (!pad) return false;
    if (pad.mapping === 'standard') return true;
    const id = String(pad.id || '').toLowerCase();
    return /xbox|xinput|standard|dualsense|dualshock|wireless controller|playstation|pro controller|gamepad/i.test(id);
  }

  function getConnectedGamepadsList() {
    if (window._mockGamepads && Array.isArray(window._mockGamepads) && window._mockGamepads.length > 0) {
      return window._mockGamepads.filter(p => p && p.connected !== false);
    }
    const navPads = (typeof navigator.getGamepads === 'function')
      ? navigator.getGamepads()
      : (typeof navigator.webkitGetGamepads === 'function' ? navigator.webkitGetGamepads() : null);
    const connectedPads = [];
    if (navPads) {
      for (let i = 0; i < navPads.length; i++) {
        const p = navPads[i];
        if (p && p.connected !== false) {
          connectedPads.push(p);
        }
      }
    }
    // If browser Gamepad API returned fewer controllers than the Windows Native XInput/DirectInput bridge,
    // use the native Windows controllers so connected controllers are always recognized!
    if (Array.isArray(window._nativeWinPads) && window._nativeWinPads.length > connectedPads.length) {
      return window._nativeWinPads.filter(p => p && p.connected !== false);
    }
    // Prioritize standard gamepads ahead of raw unmapped virtual HID devices when multiple devices exist
    if (connectedPads.length > 1) {
      connectedPads.sort((a, b) => {
        const aStd = isStandardGamepad(a) ? 1 : 0;
        const bStd = isStandardGamepad(b) ? 1 : 0;
        if (aStd !== bStd) return bStd - aStd;
        return (a.index || 0) - (b.index || 0);
      });
    }
    return connectedPads;
  }

  function shortPadName(pad, slotNum) {
    if (!pad || !pad.id) return `Controller #${slotNum}`;
    const id = String(pad.id);
    if (/xbox|xinput/i.test(id)) return `Xbox #${slotNum}`;
    if (/dualsense|dualshock|wireless controller|054c/i.test(id)) return `PlayStation #${slotNum}`;
    if (/pro controller|nintendo/i.test(id)) return `Switch #${slotNum}`;
    return `Controller #${slotNum}`;
  }

  // Decode DirectInput POV Hat Switch (axes[9]) if present
  function readPovHatDir(pad) {
    if (!pad || !pad.axes || pad.axes.length <= 9) return null;
    const hat = pad.axes[9];
    if (typeof hat !== 'number' || isNaN(hat) || hat > 1.05 || Math.abs(hat) < 0.01) return null;
    if (hat <= -0.80 || hat >= 0.85) return 'up';
    if (hat > -0.60 && hat < -0.25) return 'right';
    if (hat >= -0.05 && hat <= 0.30) return 'down';
    if (hat > 0.55 && hat < 0.85) return 'left';
    return null;
  }

  // ========================================================
  // CONTROLLER TO PLAYER (P1 / P2) MAPPER
  // Supports:
  // 1. Clicking [🔵 P1] or [🔴 P2] ALWAYS cycles: Controller #1 -> Controller #2 -> Keyboard Only
  // 2. Pressing [LB] / [LT] on any physical controller to claim P1, or [RB] / [RT] to claim P2
  // 3. Clicking [⇄ Swap P1 ↔ P2] or pressing [Y] to swap P1 & P2 controllers
  // 4. Automatic active controller detection (ignores dead virtual HID devices)
  // ========================================================
  const GamepadMapper = {
    listeningFor: null,
    listenTimer: 0,
    activePadsSeen: {},
    lastActivePadIndex: -1,
    prevRawState: {},

    init() {
      if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
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
      bindClick('btn-map-p1', () => this.handleMapButtonClick(0));
      bindClick('btn-map-p2', () => this.handleMapButtonClick(1));
      bindClick('btn-swap-controllers', () => this.swapControllers());
      bindClick('btn-pause-map-p1', () => this.handleMapButtonClick(0));
      bindClick('btn-pause-map-p2', () => this.handleMapButtonClick(1));
      bindClick('btn-pause-swap-controllers', () => this.swapControllers());
      this.updateUI();
    },

    handleMapButtonClick(playerSlot) {
      // ALWAYS cycle the player's controller slot immediately (Controller #1 -> Controller #2 -> Keyboard Only)
      // even if 0 or 1 controller is currently awake in the browser!
      this.cyclePlayerPad(playerSlot);
      // Also listen for 5s so if the user presses any button on a physical controller right after clicking,
      // that physical controller immediately binds to this playerSlot!
      const map = window.gamepadPlayerMap || { p1: 0, p2: 1 };
      const assigned = (playerSlot === 0) ? map.p1 : map.p2;
      if (assigned >= 0) {
        this.listeningFor = playerSlot;
        this.listenTimer = 5.0;
      } else {
        this.listeningFor = null;
        this.listenTimer = 0;
      }
      this.updateUI();
    },

    getPadForPlayer(playerSlot = 0) {
      const pads = getConnectedGamepadsList();
      if (pads.length === 0) return null;
      const map = window.gamepadPlayerMap || { p1: 0, p2: 1 };
      const mappedIdx = (playerSlot === 0) ? map.p1 : map.p2;

      if (mappedIdx === -1) return null; // Explicitly set to Keyboard Only
      if (mappedIdx >= 0 && mappedIdx < pads.length) {
        return pads[mappedIdx];
      }
      // If only 1 controller is connected (pads[0]) and the OTHER player is on Keyboard Only (-1),
      // let this player use pads[0] even if their label says Controller #2 (index 1)
      if (pads.length === 1 && mappedIdx >= 0) {
        const otherIdx = (playerSlot === 0) ? map.p2 : map.p1;
        if (otherIdx === -1) return pads[0];
      }
      return null;
    },

    setPlayerPad(playerSlot, padIdx) {
      if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const map = window.gamepadPlayerMap;
      const pads = getConnectedGamepadsList();
      const oldP1 = map.p1;
      const oldP2 = map.p2;

      if (playerSlot === 0) {
        map.p1 = padIdx;
        if (padIdx >= 0 && map.p2 === padIdx) {
          if (pads.length === 1) {
            map.p2 = -1; // Single connected controller assigned to P1 -> P2 uses Keyboard (Arrows)
          } else {
            map.p2 = (oldP1 >= 0 && oldP1 !== padIdx) ? oldP1 : (padIdx === 0 ? 1 : 0);
          }
        }
      } else {
        map.p2 = padIdx;
        if (padIdx >= 0 && map.p1 === padIdx) {
          if (pads.length === 1) {
            map.p1 = -1; // Single connected controller assigned to P2 -> P1 uses Keyboard (WASD)
          } else {
            map.p1 = (oldP2 >= 0 && oldP2 !== padIdx) ? oldP2 : (padIdx === 0 ? 1 : 0);
          }
        }
      }

      this.listeningFor = null;
      this.listenTimer = 0;

      // Brief rumble feedback on the assigned controller
      if (padIdx >= 0 && padIdx < pads.length) {
        const assignedPad = pads[padIdx];
        if (assignedPad && assignedPad.vibrationActuator && typeof assignedPad.vibrationActuator.playEffect === 'function') {
          try {
            assignedPad.vibrationActuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: 110,
              weakMagnitude: 0.45,
              strongMagnitude: 0.45
            }).catch(() => {});
          } catch (e) {}
        }
      }

      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(playerSlot === 0 ? 640 : 760, 0.06);
      }
      this.updateUI();
    },

    cyclePlayerPad(playerSlot) {
      if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const map = window.gamepadPlayerMap;
      const pads = getConnectedGamepadsList();
      const cur = (playerSlot === 0) ? map.p1 : map.p2;

      // Ergonomic 1-controller shortcut: if <= 1 controller is connected and P2 is on default slot 1 (Controller #2),
      // clicking P2 immediately assigns Controller #1 (0) to P2!
      if (playerSlot === 1 && pads.length <= 1 && cur === 1) {
        this.setPlayerPad(1, 0);
        return;
      }

      // Always allow cycling Controller #1 (0), Controller #2 (1), ..., and Keyboard Only (-1)
      const maxControllers = Math.max(2, pads.length);
      const options = [];
      for (let i = 0; i < maxControllers; i++) options.push(i);
      options.push(-1);

      let idx = options.indexOf(cur);
      if (idx < 0) idx = -1;
      const nextVal = options[(idx + 1) % options.length];
      this.setPlayerPad(playerSlot, nextVal);
    },

    swapControllers() {
      if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const map = window.gamepadPlayerMap;
      const pads = getConnectedGamepadsList();
      if (pads.length === 1) {
        if (map.p1 === 0) {
          map.p1 = -1;
          map.p2 = 0;
        } else {
          map.p1 = 0;
          map.p2 = -1;
        }
      } else {
        const tmp = map.p1;
        map.p1 = map.p2;
        map.p2 = tmp;
      }
      this.listeningFor = null;
      this.listenTimer = 0;
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(720, 0.07);
      }
      this.updateUI();
    },

    pollActivityAndAutoMap(dt) {
      const pads = getConnectedGamepadsList();
      if (this.listenTimer > 0) {
        this.listenTimer = Math.max(0, this.listenTimer - (dt || 0.016));
        if (this.listenTimer <= 0) {
          this.listeningFor = null;
        }
      }

      const map = window.gamepadPlayerMap;

      for (let pIdx = 0; pIdx < pads.length; pIdx++) {
        const pad = pads[pIdx];
        if (!pad) continue;
        const b = pad.buttons || [];
        const ax = pad.axes || [];

        if (!this.prevRawState[pIdx]) {
          this.prevRawState[pIdx] = {
            buttons: b.map(btn => !!(btn && (btn.pressed || btn.value > 0.5))),
            axes: ax.slice(0, 6)
          };
          // If we were waiting for a controller to wake up in browser, bind it immediately upon connection!
          if (this.listeningFor !== null) {
            this.setPlayerPad(this.listeningFor, pIdx);
            return;
          }
          continue;
        }

        const prev = this.prevRawState[pIdx];
        let newlyPressedBtn = -1;
        for (let k = 0; k < b.length; k++) {
          const isNow = !!(b[k] && (b[k].pressed || b[k].value > 0.5));
          if (isNow && !prev.buttons[k]) {
            newlyPressedBtn = k;
          }
          prev.buttons[k] = isNow;
        }

        let stickMoved = false;
        for (let k = 0; k < Math.min(4, ax.length); k++) {
          const prevVal = typeof prev.axes[k] === 'number' ? prev.axes[k] : 0;
          if (Math.abs(ax[k] - prevVal) > 0.25 && Math.abs(ax[k]) > 0.30) {
            stickMoved = true;
          }
          prev.axes[k] = ax[k];
        }

        if (newlyPressedBtn >= 0 || stickMoved) {
          this.activePadsSeen[pIdx] = true;
          this.lastActivePadIndex = pIdx;

          if (this.listeningFor !== null) {
            this.setPlayerPad(this.listeningFor, pIdx);
            return;
          }

          // Auto-heal if a virtual HID device occupied slot 0 while the user is actively using controller pIdx
          if (map.p1 !== pIdx && map.p2 !== pIdx) {
            const p1Active = map.p1 >= 0 && map.p1 < pads.length && this.activePadsSeen[map.p1];
            const p2Active = map.p2 >= 0 && map.p2 < pads.length && this.activePadsSeen[map.p2];
            if (!p1Active && map.p1 !== -1) {
              map.p1 = pIdx;
              this.updateUI();
            } else if (!p2Active && map.p2 !== -1) {
              map.p2 = pIdx;
              this.updateUI();
            }
          }
        }
      }
    },

    formatSlotLabel(padIdx, kbFallback, shortMode = false, playerSlot = null) {
      const pads = getConnectedGamepadsList();
      if (padIdx === -1) {
        return shortMode ? `⌨️ ${kbFallback} ONLY` : `⌨️ Keyboard Only (${kbFallback})`;
      }
      const isConnected = padIdx >= 0 && padIdx < pads.length;
      const num = padIdx + 1;
      const devName = isConnected ? shortPadName(pads[padIdx], num) : `Controller #${num}`;
      if (shortMode) {
        return isConnected ? `🎮 ${devName.toUpperCase()} / ${kbFallback}` : `🎮 CONTROLLER #${num} / ${kbFallback}`;
      }
      return isConnected
        ? `🎮 ${devName} (Ready) + ${kbFallback}`
        : `🎮 Controller #${num} + ${kbFallback}`;
    },

    updateUI() {
      if (typeof window.gamepadPlayerMap === 'undefined' || !window.gamepadPlayerMap) {
        window.gamepadPlayerMap = { p1: 0, p2: 1 };
      }
      const map = window.gamepadPlayerMap;
      const pads = getConnectedGamepadsList();
      const statusEl = document.getElementById('controller-connected-status');
      if (statusEl) {
        if (pads.length === 0) {
          statusEl.textContent = '🎮 Press any button on controller to wake & detect';
          statusEl.classList.remove('connected');
        } else if (pads.length === 1) {
          statusEl.textContent = `✓ 1 Controller Ready (${shortPadName(pads[0], 1)})`;
          statusEl.classList.add('connected');
        } else {
          statusEl.textContent = `✓ ${pads.length} Controllers Connected`;
          statusEl.classList.add('connected');
        }
      }

      const btnP1 = document.getElementById('btn-map-p1');
      const btnP2 = document.getElementById('btn-map-p2');
      const pauseBtnP1 = document.getElementById('btn-pause-map-p1');
      const pauseBtnP2 = document.getElementById('btn-pause-map-p2');

      if (btnP1) btnP1.classList.toggle('listening', this.listeningFor === 0 && pads.length === 0);
      if (pauseBtnP1) pauseBtnP1.classList.toggle('listening', this.listeningFor === 0 && pads.length === 0);
      if (btnP2) btnP2.classList.toggle('listening', this.listeningFor === 1 && pads.length === 0);
      if (pauseBtnP2) pauseBtnP2.classList.toggle('listening', this.listeningFor === 1 && pads.length === 0);

      const p1Label = document.getElementById('map-p1-label');
      if (p1Label) p1Label.textContent = this.formatSlotLabel(map.p1, 'WASD', false, 0);
      const p2Label = document.getElementById('map-p2-label');
      if (p2Label) p2Label.textContent = this.formatSlotLabel(map.p2, 'Arrows', false, 1);

      const pauseP1 = document.getElementById('pause-map-p1-label');
      if (pauseP1) pauseP1.textContent = this.formatSlotLabel(map.p1, 'WASD', false, 0);
      const pauseP2 = document.getElementById('pause-map-p2-label');
      if (pauseP2) pauseP2.textContent = this.formatSlotLabel(map.p2, 'Arrows', false, 1);

      const p1Badge = document.querySelector('#splitscreen-overlay .p1-badge');
      if (p1Badge) {
        p1Badge.textContent = `🔵 P1 · ${this.formatSlotLabel(map.p1, 'WASD', true)}`;
      }
      const p2Badge = document.querySelector('#splitscreen-overlay .p2-badge');
      if (p2Badge) {
        p2Badge.textContent = `🔴 P2 · ${this.formatSlotLabel(map.p2, 'ARROWS', true)}`;
      }
    }
  };
  window.GamepadMapper = GamepadMapper;
  GamepadMapper.init();

  function readSinglePadControls(pad, playerIndex = 0) {
    if (!pad) return null;

    const applyDeadzone = (val, threshold = 0.16) => {
      if (Math.abs(val) < threshold) return 0;
      const sign = Math.sign(val);
      return sign * Math.min(1.0, (Math.abs(val) - threshold) / (1.0 - threshold));
    };

    // 1. Trigger acceleration/reverse controls:
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
    const triggerThrottle = rtFiltered - ltFiltered;

    // 2. Left joystick for forward and backward (axes[1], inverted: up = forward)
    let leftY = (pad.axes && pad.axes.length > 1) ? pad.axes[1] : 0;
    let stickThrottle = -applyDeadzone(leftY, 0.16);

    let throttle = (Math.abs(triggerThrottle) > 0.02) ? triggerThrottle : stickThrottle;

    const povDir = readPovHatDir(pad);
    // Optional D-Pad / POV Hat fallback for throttle
    if (Math.abs(throttle) < 0.1) {
      if ((pad.buttons && pad.buttons[12] && (pad.buttons[12].pressed || pad.buttons[12].value > 0.5)) || povDir === 'up') throttle = 1.0;
      else if ((pad.buttons && pad.buttons[13] && (pad.buttons[13].pressed || pad.buttons[13].value > 0.5)) || povDir === 'down') throttle = -1.0;
    }

    // 3. Turn Left and Right: Supports BOTH Left Joystick (axes[0]) AND Right Joystick (axes[2])
    let leftX = (pad.axes && pad.axes.length > 0) ? pad.axes[0] : 0;
    let leftStickSteer = applyDeadzone(leftX, 0.16);

    let rightX = (pad.axes && pad.axes.length > 2) ? pad.axes[2] : 0;
    if (Math.abs(rightX) < 0.1 && pad.axes && pad.axes.length > 5 && Math.abs(pad.axes[5]) > 0.1) {
      rightX = pad.axes[5];
    }
    let rightStickSteer = applyDeadzone(rightX, 0.16);

    let steer = Math.abs(leftStickSteer) >= Math.abs(rightStickSteer) ? leftStickSteer : rightStickSteer;

    // Optional D-Pad / POV Hat fallback for steer
    if (Math.abs(steer) < 0.1) {
      if ((pad.buttons && pad.buttons[14] && (pad.buttons[14].pressed || pad.buttons[14].value > 0.5)) || povDir === 'left') steer = -1.0;
      else if ((pad.buttons && pad.buttons[15] && (pad.buttons[15].pressed || pad.buttons[15].value > 0.5)) || povDir === 'right') steer = 1.0;
    }

    if (!prevGamepadButtons[playerIndex]) {
      prevGamepadButtons[playerIndex] = { lb: false, rb: false, start: false, back: false, a: false, x: false, y: false };
    }
    const prev = prevGamepadButtons[playerIndex];
    const inMatch = (typeof matchState !== 'undefined' && (matchState === 'playing' || matchState === 'countdown'));

    // 4. Weapon ON / OFF toggle:
    // Left Bumper [LB] (buttons[4]) OR Face Buttons [A] (buttons[0]) / [X] (buttons[2])
    const lbPressed = !!(pad.buttons && pad.buttons[4] && (pad.buttons[4].pressed || pad.buttons[4].value > 0.5));
    const aPressed  = !!(pad.buttons && pad.buttons[0] && (pad.buttons[0].pressed || pad.buttons[0].value > 0.5));
    const xPressed  = !!(pad.buttons && pad.buttons[2] && (pad.buttons[2].pressed || pad.buttons[2].value > 0.5));
    const weaponTriggered = (lbPressed && !prev.lb) || (aPressed && !prev.a) || (xPressed && !prev.x);

    if (weaponTriggered && inMatch) {
      if (playerIndex === 0 && playerBot) {
        togglePlayerWeapon(playerBot);
      } else if (playerIndex === 1 && enemyBot && gameMode === '1v1') {
        togglePlayerWeapon(enemyBot);
      }
    }
    prev.lb = lbPressed;
    prev.a = aPressed;
    prev.x = xPressed;

    // 5. Change Camera Angle:
    // Right Bumper [RB] (buttons[5]) OR Top Face Button [Y] (buttons[3])
    const rbPressed = !!(pad.buttons && pad.buttons[5] && (pad.buttons[5].pressed || pad.buttons[5].value > 0.5));
    const yPressed  = !!(pad.buttons && pad.buttons[3] && (pad.buttons[3].pressed || pad.buttons[3].value > 0.5));
    const cameraTriggered = (rbPressed && !prev.rb) || (yPressed && !prev.y);

    if (cameraTriggered && inMatch) {
      if (playerIndex === 0) {
        cycleCameraMode();
      } else if (playerIndex === 1 && gameMode === '1v1') {
        if (typeof cycleCameraModeP2 === 'function') cycleCameraModeP2();
      }
    }
    prev.rb = rbPressed;
    prev.y = yPressed;

    // 6. Start / Menu button (buttons[9]) or Back / Select (buttons[8]) for pause toggle
    const startPressed   = !!(pad.buttons && pad.buttons[9] && (pad.buttons[9].pressed || pad.buttons[9].value > 0.5));
    const backBtnPressed = !!(pad.buttons && pad.buttons[8] && (pad.buttons[8].pressed || pad.buttons[8].value > 0.5));
    const pauseTriggered = (startPressed && !prev.start) || (backBtnPressed && !prev.back);

    if (pauseTriggered) {
      const btnPause = document.getElementById('btn-pause');
      const btnResume = document.getElementById('btn-resume-game');
      if (matchState === 'playing' && btnPause) btnPause.click();
      else if (matchState === 'paused' && btnResume) btnResume.click();
    }
    prev.start = startPressed;
    prev.back = backBtnPressed;

    return {
      throttle,
      steer,
      hasInput: Math.abs(throttle) > 0.05 || Math.abs(steer) > 0.05
    };
  }

  function pollGamepadControls(playerIndex = 0) {
    if (playerIndex === 0 && typeof GamepadMapper !== 'undefined') {
      GamepadMapper.pollActivityAndAutoMap(0.016);
    }

    // In any game mode other than 1v1, only Controller 1 can drive.
    // Controller 2 cannot drive or take over in vs_bot, practice, or online.
    if (playerIndex !== 0 && (typeof gameMode === 'undefined' || gameMode !== '1v1')) {
      return null;
    }

    const pad = GamepadMapper.getPadForPlayer(playerIndex);
    const primaryRes = readSinglePadControls(pad, playerIndex);
    return primaryRes;
  }

  window.addEventListener('gamepadconnected', (e) => {
    console.log(`🎮 Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}`);
    const hint = document.getElementById('hint-controls-text');
    if (hint) {
      hint.innerHTML = `<span style="color:#38bdf8;">🎮 CONTROLLER READY:</span> <kbd>RT</kbd> Drive · <kbd>LT</kbd> Rev · Stick: Steer · <kbd>A</kbd>/<kbd>X</kbd>/<kbd>LB</kbd> Weapon · <kbd>Y</kbd>/<kbd>RB</kbd> Cam`;
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
    const modalIds = ['modal-select', 'modal-1v1', 'modal-online-host', 'modal-online-join', 'modal-pause', 'modal-gameover', 'modal-online-rematch'];
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
  // DUAL CONTROLLER 1V1 READY STATE MANAGER
  // ========================================================
  const Local1v1State = {
    p1Ready: false,
    p2Ready: false,
    autoStartTimer: null,

    isBothReady() {
      return this.p1Ready && this.p2Ready;
    },

    setP1Ready(val) {
      const boolVal = !!val;
      if (this.p1Ready === boolVal) return;
      this.p1Ready = boolVal;
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(this.p1Ready ? 740 : 360, 0.06);
      }
      this.updateUI();
      this.checkBothReady();
    },

    setP2Ready(val) {
      const boolVal = !!val;
      if (this.p2Ready === boolVal) return;
      this.p2Ready = boolVal;
      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(this.p2Ready ? 740 : 360, 0.06);
      }
      this.updateUI();
      this.checkBothReady();
    },

    toggleP1Ready() {
      this.setP1Ready(!this.p1Ready);
    },

    toggleP2Ready() {
      this.setP2Ready(!this.p2Ready);
    },

    reset() {
      this.p1Ready = false;
      this.p2Ready = false;
      if (this.autoStartTimer) {
        clearTimeout(this.autoStartTimer);
        this.autoStartTimer = null;
      }
      this.updateUI();
    },

    checkBothReady() {
      if (this.autoStartTimer) {
        clearTimeout(this.autoStartTimer);
        this.autoStartTimer = null;
      }
      if (this.isBothReady()) {
        if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
          AudioSys.init();
          AudioSys.beep(880, 0.12);
        }
        this.autoStartTimer = setTimeout(() => {
          this.autoStartTimer = null;
          if (this.isBothReady()) {
            const btnStart = document.getElementById('btn-start-match');
            if (btnStart) {
              btnStart.click();
            }
          }
        }, 400);
      }
    },

    updateUI() {
      const is1v1 = (typeof gameMode !== 'undefined' && gameMode === '1v1');
      const badgeP1 = document.getElementById('p1-ready-badge');
      const badgeP2 = document.getElementById('p2-ready-badge');
      const btnStart = document.getElementById('btn-start-match');

      if (!is1v1) {
        if (badgeP1) badgeP1.style.display = 'none';
        if (badgeP2) badgeP2.style.display = 'none';
        if (btnStart) {
          btnStart.classList.remove('both-ready', 'waiting-ready');
          btnStart.innerHTML = 'START MATCH &nbsp;➔';
        }
        return;
      }

      if (badgeP1) {
        badgeP1.style.display = 'inline-flex';
        if (this.p1Ready) {
          badgeP1.className = 'ready-badge ready';
          badgeP1.innerHTML = '✓ P1 READY!';
        } else {
          badgeP1.className = 'ready-badge not-ready';
          badgeP1.innerHTML = '🎮 P1: PRESS [A] TO READY';
        }
      }

      if (badgeP2) {
        badgeP2.style.display = 'inline-flex';
        if (this.p2Ready) {
          badgeP2.className = 'ready-badge ready';
          badgeP2.innerHTML = '✓ P2 READY!';
        } else {
          badgeP2.className = 'ready-badge not-ready';
          badgeP2.innerHTML = '🎮 P2: PRESS [A] TO READY';
        }
      }

      if (btnStart) {
        if (this.isBothReady()) {
          btnStart.classList.add('both-ready');
          btnStart.classList.remove('waiting-ready');
          btnStart.innerHTML = '✓ BOTH READY · START MATCH ➔';
        } else {
          btnStart.classList.remove('both-ready');
          btnStart.classList.add('waiting-ready');
          const count = (this.p1Ready ? 1 : 0) + (this.p2Ready ? 1 : 0);
          btnStart.innerHTML = `🎮 WAITING FOR BOTH PLAYERS (${count}/2 READY)`;
        }
      }
    }
  };
  window.Local1v1State = Local1v1State;

  function exitSelectToMainMenu() {
    if (typeof Local1v1State !== 'undefined') {
      Local1v1State.reset();
    }
    const modalSelect = document.getElementById('modal-select');
    const modal1v1 = document.getElementById('modal-1v1');
    const menuScreen = document.getElementById('menu-screen');
    if (modalSelect) modalSelect.classList.add('hidden');
    if (modal1v1) modal1v1.classList.add('hidden');
    if (menuScreen) menuScreen.classList.remove('hidden');
    if (typeof matchState !== 'undefined') matchState = 'menu';
    if (typeof gameMode !== 'undefined') gameMode = 'bot';
    if (typeof GamepadUINav !== 'undefined') {
      GamepadUINav.clearFocus();
      GamepadUINav.ensureValidFocus();
    }
    if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
      AudioSys.init();
      AudioSys.beep(360, 0.08);
    }
  }
  window.exitSelectToMainMenu = exitSelectToMainMenu;

  // ========================================================
  // 7.6 CONTROLLER UI & MENU NAVIGATION ENGINE (1 & 2 CONTROLLERS)
  // Navigate all menus, modals, and robot cards with D-Pad / Left Stick,
  // [A / Cross] to Select, [B / Circle] to Go Back, [Start] to Launch Match!
  // ========================================================
  const GamepadUINav = {
    focusedEl: null,
    activeContainerId: null,
    navCooldown: 0,
    p2NavCooldown: 0,
    prevPadStates: [
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null },
      { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, dir: null }
    ],

    getActiveContainer() {
      const modalPriority = [
        'modal-online-rematch',
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
        } else if (container.id === 'modal-online-rematch') {
          def = document.getElementById('btn-rematch-ready') || container.querySelector('#rematch-bot-selector .mini-bot-card.selected');
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
        'modal-online-rematch': 'btn-rematch-menu',
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

    cycleP1BotDirect(step) {
      const modalSelect = document.getElementById('modal-select');
      if (!modalSelect || modalSelect.classList.contains('hidden')) return false;
      const cards = Array.from(modalSelect.querySelectorAll('#p1-bot-selector .bot-card'));
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
      const pov = readPovHatDir(pad);
      if (pov) return pov;
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
      if (this.p2NavCooldown > 0) {
        this.p2NavCooldown = Math.max(0, this.p2NavCooldown - dt);
      }

      const isMappingModal = (container.id === 'modal-select' || container.id === 'modal-pause');
      const is1v1Select = (container.id === 'modal-select' && typeof gameMode !== 'undefined' && gameMode === '1v1');

      const p1PadIndex = (typeof window.gamepadPlayerMap !== 'undefined' && typeof window.gamepadPlayerMap.p1 === 'number' && window.gamepadPlayerMap.p1 >= 0)
        ? window.gamepadPlayerMap.p1
        : 0;
      const p2PadIndex = (typeof window.gamepadPlayerMap !== 'undefined' && typeof window.gamepadPlayerMap.p2 === 'number' && window.gamepadPlayerMap.p2 >= 0)
        ? window.gamepadPlayerMap.p2
        : 1;

      for (let pIdx = 0; pIdx < Math.min(4, pads.length); pIdx++) {
        const pad = pads[pIdx];
        if (!pad) continue;

        const isP1Pad = (pIdx === p1PadIndex);
        const isP2Pad = (pIdx === p2PadIndex);

        // REQUIREMENT:
        // In the Main Menu (#menu-screen) and any non-1v1 mode (vs_bot, practice, online), ONLY Controller 1 can navigate.
        // Controller 2 is strictly ignored.
        if (!is1v1Select && !isP1Pad) {
          continue;
        }

        if (!this.prevPadStates[pIdx]) {
          this.prevPadStates[pIdx] = { a: false, b: false, x: false, y: false, lb: false, rb: false, start: false, lt: false, rt: false, dir: null };
        }
        const prev = this.prevPadStates[pIdx];
        const b = pad.buttons || [];

        const aPressed = !!(b[0] && (b[0].pressed || b[0].value > 0.5));
        const bPressed = !!(b[1] && (b[1].pressed || b[1].value > 0.5));
        const yPressed = !!(b[3] && (b[3].pressed || b[3].value > 0.5));
        const lbPressed = !!(b[4] && (b[4].pressed || b[4].value > 0.5));
        const rbPressed = !!(b[5] && (b[5].pressed || b[5].value > 0.5));
        const startPressed = !!(b[9] && (b[9].pressed || b[9].value > 0.5));
        const ltPressed = !!(b[6] && (b[6].pressed || b[6].value > 0.6));
        const rtPressed = !!(b[7] && (b[7].pressed || b[7].value > 0.6));
        const dir = this.readPadDir(pad);

        // Quick Controller Mapping Shortcuts on Robot Select & Pause Modals:
        if (isMappingModal && typeof GamepadMapper !== 'undefined') {
          if ((lbPressed && !prev.lb) || (ltPressed && !prev.lt)) {
            GamepadMapper.setPlayerPad(0, pIdx);
          }
          if ((rbPressed && !prev.rb) || (rtPressed && !prev.rt)) {
            GamepadMapper.setPlayerPad(1, pIdx);
          }
          if (yPressed && !prev.y) {
            GamepadMapper.swapControllers();
          }
        }
        prev.lt = ltPressed;
        prev.rt = rtPressed;

        // ========================================================
        // 1V1 LOCAL SELECT MODAL: DUAL CONTROLLER FLOW
        // Controller 1 navigates & readies P1; Controller 2 navigates & readies P2.
        // Both players must be ready to start. Back [B] from either returns to Main Menu.
        // ========================================================
        if (is1v1Select) {
          if (isP1Pad) {
            // Controller 1 navigates P1 Robot Selection cards
            if (dir === 'left' || dir === 'right') {
              if (dir !== prev.dir || this.navCooldown <= 0) {
                this.cycleP1BotDirect(dir === 'right' ? 1 : -1);
                if (typeof Local1v1State !== 'undefined') {
                  Local1v1State.setP1Ready(false);
                }
                this.navCooldown = (dir !== prev.dir) ? 0.24 : 0.16;
              }
            }
            // Controller 1 confirms: Toggle P1 Ready
            if (aPressed && !prev.a) {
              if (typeof Local1v1State !== 'undefined') {
                Local1v1State.toggleP1Ready();
              }
            }
            // Controller 1 Back [B]: Return to Main Menu
            if (bPressed && !prev.b) {
              exitSelectToMainMenu();
            }
            // Controller 1 Start: If both ready, start match; else toggle P1 ready
            if (startPressed && !prev.start) {
              if (typeof Local1v1State !== 'undefined' && Local1v1State.isBothReady()) {
                const startBtn = document.getElementById('btn-start-match');
                if (startBtn) startBtn.click();
              } else if (typeof Local1v1State !== 'undefined') {
                Local1v1State.toggleP1Ready();
              }
            }
          }

          if (isP2Pad && (!isP1Pad || pads.length >= 2)) {
            // Controller 2 navigates P2 Robot Selection cards
            if (dir === 'left' || dir === 'right') {
              if (dir !== prev.dir || this.p2NavCooldown <= 0) {
                this.cycleP2BotDirect(dir === 'right' ? 1 : -1);
                if (typeof Local1v1State !== 'undefined') {
                  Local1v1State.setP2Ready(false);
                }
                this.p2NavCooldown = (dir !== prev.dir) ? 0.24 : 0.16;
              }
            }
            // Controller 2 confirms: Toggle P2 Ready
            if (aPressed && !prev.a) {
              if (typeof Local1v1State !== 'undefined') {
                Local1v1State.toggleP2Ready();
              }
            }
            // Controller 2 Back [B]: Return to Main Menu
            if (bPressed && !prev.b) {
              exitSelectToMainMenu();
            }
            // Controller 2 Start: If both ready, start match; else toggle P2 ready
            if (startPressed && !prev.start) {
              if (typeof Local1v1State !== 'undefined' && Local1v1State.isBothReady()) {
                const startBtn = document.getElementById('btn-start-match');
                if (startBtn) startBtn.click();
              } else if (typeof Local1v1State !== 'undefined') {
                Local1v1State.toggleP2Ready();
              }
            }
          }

          prev.a = aPressed;
          prev.b = bPressed;
          prev.y = yPressed;
          prev.lb = lbPressed;
          prev.rb = rbPressed;
          prev.start = startPressed;
          prev.dir = dir;
          continue;
        }

        // ========================================================
        // STANDARD SINGLE-CONTROLLER MODAL & MENU NAVIGATION
        // ========================================================
        if (dir) {
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

  // 1v1 Local Select Keyboard & Click Listeners
  window.addEventListener('keydown', (e) => {
    const modalSelect = document.getElementById('modal-select');
    const is1v1Select = modalSelect && !modalSelect.classList.contains('hidden') && typeof gameMode !== 'undefined' && gameMode === '1v1';
    if (!is1v1Select) return;

    if (e.code === 'KeyA') {
      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.cycleP1BotDirect(-1);
        if (typeof Local1v1State !== 'undefined') Local1v1State.setP1Ready(false);
      }
    } else if (e.code === 'KeyD') {
      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.cycleP1BotDirect(1);
        if (typeof Local1v1State !== 'undefined') Local1v1State.setP1Ready(false);
      }
    } else if (e.code === 'Space' || e.code === 'KeyF') {
      e.preventDefault();
      if (!e.repeat && typeof Local1v1State !== 'undefined') Local1v1State.toggleP1Ready();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.cycleP2BotDirect(-1);
        if (typeof Local1v1State !== 'undefined') Local1v1State.setP2Ready(false);
      }
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.cycleP2BotDirect(1);
        if (typeof Local1v1State !== 'undefined') Local1v1State.setP2Ready(false);
      }
    } else if (e.code === 'Enter' || e.code === 'Numpad0') {
      e.preventDefault();
      if (!e.repeat && typeof Local1v1State !== 'undefined') Local1v1State.toggleP2Ready();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      if (typeof exitSelectToMainMenu === 'function') exitSelectToMainMenu();
    }
  });

  function initReadyBadgeClicks() {
    const p1Badge = document.getElementById('p1-ready-badge');
    if (p1Badge && !p1Badge._hasClickListener) {
      p1Badge._hasClickListener = true;
      p1Badge.style.cursor = 'pointer';
      p1Badge.addEventListener('click', () => {
        if (typeof Local1v1State !== 'undefined') Local1v1State.toggleP1Ready();
      });
    }
    const p2Badge = document.getElementById('p2-ready-badge');
    if (p2Badge && !p2Badge._hasClickListener) {
      p2Badge._hasClickListener = true;
      p2Badge.style.cursor = 'pointer';
      p2Badge.addEventListener('click', () => {
        if (typeof Local1v1State !== 'undefined') Local1v1State.toggleP2Ready();
      });
    }
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initReadyBadgeClicks);
  } else {
    initReadyBadgeClicks();
  }

