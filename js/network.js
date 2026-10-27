// ========================================================
// BATTLEBOTx - WEBRTC MULTIPLAYER NETWORKING (PEERJS)
// ========================================================

  // ========================================================
  // WEBRTC ONLINE 1V1 ROOM SYSTEM (PEERJS P2P BROKER)
  // ========================================================
  const NetworkSys = {
    peer: null,
    conn: null,
    isOnline: false,
    isHost: false,
    roomCode: '',
    selectedBot: 'robot1',
    opponentBot: 'robot2',
    queuedEvents: [],
    lastSendTime: 0,

    queueEvent(ev) {
      // Only queue network events during active combat (never during the background menu demo fight!)
      if (this.isOnline && this.isHost && typeof matchState !== 'undefined' && (matchState === 'playing' || matchState === 'celebrating')) {
        this.queuedEvents.push(ev);
      }
    },

    createRoom(botType, onReady, onError) {
      this.isOnline = true;
      this.isHost = true;
      this.queuedEvents = [];
      this.selectedBot = botType;
      this.roomCode = String(Math.floor(1000 + Math.random() * 9000));
      const peerId = 'bbx-' + this.roomCode;

      try {
        if (this.peer) {
          try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('[Network] Host Peer ready with ID:', id);
          onReady(this.roomCode);
        });

        this.peer.on('connection', (conn) => {
          this.conn = conn;
          this.setupHostConnection();
        });

        this.peer.on('error', (err) => {
          console.warn('[Network] Peer error:', err);
          if (err.type === 'unavailable-id') {
            this.createRoom(botType, onReady, onError);
          } else {
            onError(err.message || 'Network broker error');
          }
        });
      } catch (e) {
        onError(e.message);
      }
    },

    setupHostConnection() {
      const statusEl = document.getElementById('host-status');
      if (statusEl) {
        statusEl.textContent = '✓ Opponent connected! Starting match...';
        statusEl.style.color = '#34d399';
      }

      this.conn.on('data', (data) => {
        if (data.type === 'guest_join') {
          this.opponentBot = data.botType || 'robot2';
          this.queuedEvents = [];
          this.conn.send({
            type: 'start_match',
            hostBot: this.selectedBot,
            guestBot: this.opponentBot
          });
          document.getElementById('modal-online-host').classList.add('hidden');
          gameMode = '1v1_online';
          startMatchSequence();
        } else if (data.type === 'guest_input') {
          if (enemyBot && !enemyBot.isEntirelyDestroyed) {
            const eNoWheels = (!enemyBot.wheels || enemyBot.wheels.length === 0 || enemyBot.wheels.filter(w => w.attached).length === 0);
            if (enemyBot.driveHealth <= 0 || enemyBot.flipped || eNoWheels) {
              enemyBot.drivePower = 0;
              enemyBot.throttleInput = 0;
              enemyBot.steerInput = 0;
            } else {
              enemyBot.throttleInput = data.t || 0;
              enemyBot.steerInput = data.s || 0;
            }
          }
        } else if (data.type === 'guest_toggle_weapon') {
          if (enemyBot && typeof togglePlayerWeapon === 'function') {
            togglePlayerWeapon(enemyBot);
          }
        }
      });

      this.conn.on('close', () => {
        this.handleDisconnect('Opponent disconnected from battle.');
      });
    },

    joinRoom(code, botType, onConnected, onError) {
      this.isOnline = true;
      this.isHost = false;
      this.queuedEvents = [];
      this.selectedBot = botType;
      this.roomCode = code.trim().replace(/^bbx-/i, '');
      const targetPeerId = 'bbx-' + this.roomCode;

      try {
        if (this.peer) {
          try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('[Network] Guest Peer ready with ID:', id);
          const conn = this.peer.connect(targetPeerId, { reliable: true });
          this.conn = conn;

          conn.on('open', () => {
            conn.send({ type: 'guest_join', botType: this.selectedBot });
            onConnected();
          });

          conn.on('data', (data) => {
            if (data.type === 'start_match') {
              this.opponentBot = data.hostBot;
              document.getElementById('modal-online-join').classList.add('hidden');
              gameMode = '1v1_online';
              startMatchSequence();
            } else if (data.type === 'state') {
              this.applyRemoteState(data);
            } else if (data.type === 'end_match') {
              if (data.isTotalDestruction && typeof explodeRobot === 'function') {
                const defeatedBot = data.playerWon ? enemyBot : playerBot;
                if (defeatedBot && !defeatedBot.isEntirelyDestroyed) {
                  explodeRobot(defeatedBot, { x: data.playerWon ? 1 : -1, z: 0 }, new THREE.Vector3(defeatedBot.x, 0.3, defeatedBot.z));
                }
              }
              endMatch(data.playerWon, data.isDraw, data.isKO, data.isTotalDestruction);
            }
          });

          conn.on('close', () => {
            this.handleDisconnect('Host closed the battle room.');
          });

          setTimeout(() => {
            if (!conn.open && !this.opponentBot) {
              onError('Connection timeout. Please verify the 4-digit Room Code.');
            }
          }, 9000);
        });

        this.peer.on('error', (err) => {
          console.warn('[Network] Guest error:', err);
          onError('Room not found or host not ready. Check the code.');
        });
      } catch (e) {
        onError(e.message);
      }
    },

    sendInput(t, s) {
      if (this.conn && this.conn.open && !this.isHost) {
        this.conn.send({ type: 'guest_input', t, s });
      }
    },

    broadcastState() {
      if (!this.conn || !this.conn.open || !this.isHost) return;
      if (!playerBot || !enemyBot) return;

      const now = performance.now();
      if (now - this.lastSendTime < 24 && this.queuedEvents.length === 0) return; // ~40 FPS broadcast, immediate flush on damage events
      this.lastSendTime = now;

      if ((!playerBot.detachableParts || playerBot.detachableParts.length === 0) && typeof initBotDetachableParts === 'function') {
        initBotDetachableParts(playerBot);
      }
      if ((!enemyBot.detachableParts || enemyBot.detachableParts.length === 0) && typeof initBotDetachableParts === 'function') {
        initBotDetachableParts(enemyBot);
      }

      const evs = this.queuedEvents.slice();
      this.queuedEvents.length = 0;

      const p1Parts = playerBot.detachableParts
        ? playerBot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length
        : 999;
      const p2Parts = enemyBot.detachableParts
        ? enemyBot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length
        : 999;

      const p1Detached = playerBot.detachableParts
        ? playerBot.detachableParts.filter(p => !p.attached).map(p => p.partIdx)
        : [];
      const p2Detached = enemyBot.detachableParts
        ? enemyBot.detachableParts.filter(p => !p.attached).map(p => p.partIdx)
        : [];

      this.conn.send({
        type: 'state',
        ms: typeof matchState !== 'undefined' ? matchState : 'playing',
        tm: typeof matchTimeRemaining === 'number' ? matchTimeRemaining : 180,
        p1: {
          x: playerBot.x, z: playerBot.z, y: playerBot.root.position.y,
          ay: playerBot.airY || 0, wt: playerBot.wheelTilt || 0,
          vx: playerBot.vx || 0, vz: playerBot.vz || 0,
          yaw: playerBot.yaw, pitch: playerBot.pitch, roll: playerBot.roll,
          spin: playerBot.weaponSpinSpeed, hp: playerBot.driveHealth, fp: playerBot.flipped,
          wa: playerBot.weaponActive !== false, wd: !!playerBot.weaponDestroyed,
          ed: !!playerBot.isEntirelyDestroyed, st: playerBot.stoppedTimer || 0,
          rc: p1Parts, dp: p1Detached
        },
        p2: {
          x: enemyBot.x, z: enemyBot.z, y: enemyBot.root.position.y,
          ay: enemyBot.airY || 0, wt: enemyBot.wheelTilt || 0,
          vx: enemyBot.vx || 0, vz: enemyBot.vz || 0,
          yaw: enemyBot.yaw, pitch: enemyBot.pitch, roll: enemyBot.roll,
          spin: enemyBot.weaponSpinSpeed, hp: enemyBot.driveHealth, fp: enemyBot.flipped,
          wa: enemyBot.weaponActive !== false, wd: !!enemyBot.weaponDestroyed,
          ed: !!enemyBot.isEntirelyDestroyed, st: enemyBot.stoppedTimer || 0,
          rc: p2Parts, dp: p2Detached
        },
        events: evs
      });
    },

    applyRemoteState(data) {
      if (!playerBot || !enemyBot) return;

      // If Host has already transitioned from countdown to playing, synchronize Guest immediately
      if (typeof matchState !== 'undefined' && matchState === 'countdown' && (data.ms === 'playing' || data.ms === 'celebrating')) {
        if (typeof activeCountdownInterval !== 'undefined' && activeCountdownInterval) {
          clearInterval(activeCountdownInterval);
          activeCountdownInterval = null;
        }
        const cdOverlay = document.getElementById('countdown-overlay');
        if (cdOverlay) cdOverlay.classList.add('hidden');
        matchState = data.ms;
      }

      if (typeof data.tm === 'number' && typeof matchTimeRemaining !== 'undefined') {
        matchTimeRemaining = data.tm;
        if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
      }

      if ((!playerBot.detachableParts || playerBot.detachableParts.length === 0) && typeof initBotDetachableParts === 'function') {
        initBotDetachableParts(playerBot);
      }
      if ((!enemyBot.detachableParts || enemyBot.detachableParts.length === 0) && typeof initBotDetachableParts === 'function') {
        initBotDetachableParts(enemyBot);
      }

      // Host robot (p1 -> playerBot at -7.5 on both Host and Guest)
      playerBot.x = data.p1.x;
      playerBot.z = data.p1.z;
      playerBot.airY = data.p1.ay || 0;
      playerBot.wheelTilt = data.p1.wt || 0;
      playerBot.vx = data.p1.vx || 0;
      playerBot.vz = data.p1.vz || 0;
      playerBot.root.position.x = data.p1.x;
      playerBot.root.position.z = data.p1.z;
      playerBot.root.position.y = (data.p1.y || 0);
      playerBot.yaw = data.p1.yaw;
      playerBot.pitch = data.p1.pitch;
      playerBot.roll = data.p1.roll;
      playerBot.root.rotation.y = data.p1.yaw;
      playerBot.tiltGroup.rotation.x = data.p1.pitch;
      playerBot.tiltGroup.rotation.z = data.p1.roll + (playerBot.wheelTilt || 0);
      playerBot.weaponSpinSpeed = data.p1.spin;
      playerBot.driveHealth = data.p1.hp;
      playerBot.flipped = data.p1.fp;
      playerBot.weaponActive = (data.p1.wa !== false);
      playerBot.weaponDestroyed = !!data.p1.wd;
      playerBot.stoppedTimer = data.p1.st || 0;

      // Guest robot (p2 -> enemyBot at +7.5 on both Host and Guest)
      enemyBot.x = data.p2.x;
      enemyBot.z = data.p2.z;
      enemyBot.airY = data.p2.ay || 0;
      enemyBot.wheelTilt = data.p2.wt || 0;
      enemyBot.vx = data.p2.vx || 0;
      enemyBot.vz = data.p2.vz || 0;
      enemyBot.root.position.x = data.p2.x;
      enemyBot.root.position.z = data.p2.z;
      enemyBot.root.position.y = (data.p2.y || 0);
      enemyBot.yaw = data.p2.yaw;
      enemyBot.pitch = data.p2.pitch;
      enemyBot.roll = data.p2.roll;
      enemyBot.root.rotation.y = data.p2.yaw;
      enemyBot.tiltGroup.rotation.x = data.p2.pitch;
      enemyBot.tiltGroup.rotation.z = data.p2.roll + (enemyBot.wheelTilt || 0);
      enemyBot.weaponSpinSpeed = data.p2.spin;
      enemyBot.driveHealth = data.p2.hp;
      enemyBot.flipped = data.p2.fp;
      enemyBot.weaponActive = (data.p2.wa !== false);
      enemyBot.weaponDestroyed = !!data.p2.wd;
      enemyBot.stoppedTimer = data.p2.st || 0;

      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(ev => {
          if (ev.t === 'clash') AudioSys.metalClashSound(ev.i, ev.h);
          if (ev.t === 'slice') AudioSys.weaponSliceSound();
          if (ev.t === 'stall') AudioSys.weaponStallSound();
          if (ev.t === 'sparks') spawnCollisionSparks(new THREE.Vector3(ev.x, ev.y, ev.z), ev.c);
          if (ev.t === 'detach') {
            const targetBot = (ev.w === 'p1') ? playerBot : enemyBot;
            if (ev.w === 'p2' && typeof triggerDamageVignette === 'function') {
              triggerDamageVignette();
            }
            if (targetBot && typeof detachSinglePart === 'function') {
              detachSinglePart(
                targetBot,
                { x: ev.dx || 0, z: ev.dz || 1 },
                new THREE.Vector3(ev.hx || targetBot.x, ev.hy || 0.3, ev.hz || targetBot.z),
                typeof ev.pi === 'number' ? ev.pi : null
              );
            }
          }
          if (ev.t === 'explode') {
            const targetBot = (ev.w === 'p1') ? playerBot : enemyBot;
            if (ev.w === 'p2' && typeof triggerDamageVignette === 'function') {
              triggerDamageVignette();
            }
            if (targetBot && !targetBot.isEntirelyDestroyed && typeof explodeRobot === 'function') {
              explodeRobot(
                targetBot,
                { x: ev.dx || 0, z: ev.dz || 1 },
                new THREE.Vector3(ev.hx || targetBot.x, ev.hy || 0.3, ev.hz || targetBot.z)
              );
            }
          }
        });
      }

      // Authoritative Part & Destruction Reconciliation:
      // Even if a 'detach' or 'explode' packet arrived while Guest was still loading models or in countdown,
      // reconcile exact detached part indices (dp), remaining count (rc), and total destruction (ed) on every tick!
      if (data.p1 && data.p1.ed && !playerBot.isEntirelyDestroyed && typeof explodeRobot === 'function') {
        explodeRobot(playerBot, { x: -1, z: 0 }, new THREE.Vector3(playerBot.x, 0.3, playerBot.z));
      } else if (data.p1 && !playerBot.isEntirelyDestroyed && playerBot.detachableParts && playerBot.detachableParts.length > 0) {
        if (Array.isArray(data.p1.dp) && data.p1.dp.length > 0) {
          for (let i = 0; i < data.p1.dp.length; i++) {
            if (playerBot.isEntirelyDestroyed) break;
            const dIdx = data.p1.dp[i];
            const partObj = playerBot.detachableParts.find(p => p.partIdx === dIdx);
            if (partObj && partObj.attached && partObj.mesh && partObj.mesh.parent) {
              detachSinglePart(playerBot, { x: -1, z: 0 }, new THREE.Vector3(playerBot.x, 0.3, playerBot.z), dIdx);
            }
          }
        }
        if (typeof data.p1.rc === 'number' && !playerBot.isEntirelyDestroyed) {
          let safety = 0;
          while (playerBot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length > data.p1.rc && !playerBot.isEntirelyDestroyed && safety < 60) {
            safety++;
            detachSinglePart(playerBot, { x: -1, z: 0 }, new THREE.Vector3(playerBot.x, 0.3, playerBot.z));
          }
        }
      }

      if (data.p2 && data.p2.ed && !enemyBot.isEntirelyDestroyed && typeof explodeRobot === 'function') {
        if (typeof triggerDamageVignette === 'function') triggerDamageVignette();
        explodeRobot(enemyBot, { x: 1, z: 0 }, new THREE.Vector3(enemyBot.x, 0.3, enemyBot.z));
      } else if (data.p2 && !enemyBot.isEntirelyDestroyed && enemyBot.detachableParts && enemyBot.detachableParts.length > 0) {
        if (Array.isArray(data.p2.dp) && data.p2.dp.length > 0) {
          for (let i = 0; i < data.p2.dp.length; i++) {
            if (enemyBot.isEntirelyDestroyed) break;
            const dIdx = data.p2.dp[i];
            const partObj = enemyBot.detachableParts.find(p => p.partIdx === dIdx);
            if (partObj && partObj.attached && partObj.mesh && partObj.mesh.parent) {
              if (typeof triggerDamageVignette === 'function') triggerDamageVignette();
              detachSinglePart(enemyBot, { x: 1, z: 0 }, new THREE.Vector3(enemyBot.x, 0.3, enemyBot.z), dIdx);
            }
          }
        }
        if (typeof data.p2.rc === 'number' && !enemyBot.isEntirelyDestroyed) {
          let safety = 0;
          while (enemyBot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length > data.p2.rc && !enemyBot.isEntirelyDestroyed && safety < 60) {
            safety++;
            if (typeof triggerDamageVignette === 'function') triggerDamageVignette();
            detachSinglePart(enemyBot, { x: 1, z: 0 }, new THREE.Vector3(enemyBot.x, 0.3, enemyBot.z));
          }
        }
      }
    },

    handleDisconnect(msg) {
      if (!this.isOnline) return;
      alert(msg || 'Connection lost.');
      this.isOnline = false;
      this.isHost = false;
      this.queuedEvents = [];
      if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
      if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
      matchState = 'menu';
      cleanupBots();
      hud.classList.add('hidden');
      menuScreen.classList.remove('hidden');
    }
  };
