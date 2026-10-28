// ========================================================
// BATTLEBOTx - WEBRTC MULTIPLAYER NETWORKING (PEERJS)
// ========================================================

  // ========================================================
  // WEBRTC ONLINE 1V1 ROOM SYSTEM (PEERJS P2P BROKER)
  // Cross-network multi-provider STUN & synchronized CAD model loading
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
    lastInputSendTime: 0,
    lastSentT: null,
    lastSentS: null,
    hostReady: false,
    guestReady: false,
    isRematchActive: false,
    myRematchReady: false,
    peerRematchReady: false,
    rematchLaunching: false,

    // Global redundant STUN servers for cross-network and mobile carrier NAT traversal
    ICE_SERVERS: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    PEER_PREFIX: 'bbx2026-room-',

    queueEvent(ev) {
      // Only queue network events during active combat (never during the background menu demo fight!)
      if (this.isOnline && this.isHost && typeof matchState !== 'undefined' && (matchState === 'playing' || matchState === 'celebrating')) {
        this.queuedEvents.push(ev);
      }
    },

    createRoom(botType, onReady, onError) {
      this.isOnline = true;
      this.isHost = true;
      this.hostReady = false;
      this.guestReady = false;
      this.queuedEvents = [];
      this.selectedBot = botType;
      this.roomCode = String(Math.floor(1000 + Math.random() * 9000));
      const peerId = this.PEER_PREFIX + this.roomCode;

      try {
        if (this.peer) {
          try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: this.ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        this.peer.on('open', (id) => {
          console.log('[Network] Host Peer ready with ID:', id);
          if (typeof onReady === 'function') onReady(this.roomCode);
        });

        this.peer.on('disconnected', () => {
          console.log('[Network] Host signaling disconnected, attempting reconnection...');
          try {
            if (this.peer && !this.peer.destroyed) this.peer.reconnect();
          } catch (e) {}
        });

        this.peer.on('connection', (conn) => {
          console.log('[Network] Inbound connection from Guest');
          this.conn = conn;
          this.setupHostConnection(onError);
        });

        this.peer.on('error', (err) => {
          console.warn('[Network] Host Peer error:', err);
          if (err.type === 'unavailable-id') {
            this.createRoom(botType, onReady, onError);
          } else {
            if (typeof onError === 'function') onError(err.message || 'Network broker error');
          }
        });
      } catch (e) {
        if (typeof onError === 'function') onError(e.message);
      }
    },

    setupHostConnection(onError) {
      const statusEl = document.getElementById('host-status');
      if (statusEl) {
        statusEl.textContent = '✓ Opponent connected! Synchronizing robot telemetry...';
        statusEl.style.color = '#34d399';
      }

      if (this.conn && this.conn.peerConnection) {
        this.conn.peerConnection.oniceconnectionstatechange = () => {
          const s = this.conn.peerConnection.iceConnectionState;
          console.log('[Network] Host ICE state:', s);
          if (s === 'failed') {
            this.handleDisconnect('P2P connection failed between networks. Please retry.');
          }
        };
      }

      this.conn.on('error', (err) => {
        console.warn('[Network] Host data channel error:', err);
        if (typeof onError === 'function') onError(err.message);
      });

      this.conn.on('data', async (data) => {
        if (data.type === 'guest_join') {
          this.opponentBot = data.botType || 'robot2';
          this.queuedEvents = [];

          // Instruct Guest to prepare & preload 3D CAD models
          this.conn.send({
            type: 'prepare_match',
            hostBot: this.selectedBot,
            guestBot: this.opponentBot
          });

          const hostModal = document.getElementById('modal-online-host');
          if (hostModal) hostModal.classList.add('hidden');
          gameMode = '1v1_online';

          // Preload models locally on Host
          await this.preloadMatchModels(this.selectedBot, this.opponentBot);
          this.hostReady = true;

          if (this.guestReady) {
            this.launchSynchronizedMatch();
          } else {
            const loadingStatus = document.getElementById('match-loading-status');
            if (loadingStatus) loadingStatus.textContent = 'Waiting for opponent to finish streaming CAD telemetry...';
          }
        } else if (data.type === 'guest_ready') {
          console.log('[Network] Guest model loading completed');
          this.guestReady = true;
          if (this.hostReady) {
            this.launchSynchronizedMatch();
          }
        } else if (data.type === 'guest_input') {
          if (enemyBot && !enemyBot.isEntirelyDestroyed) {
            const eHasWheels = (enemyBot.wheels && enemyBot.wheels.length > 0 && enemyBot.wheels.some(w => w.attached !== false)) ||
              (enemyBot.detachableParts && enemyBot.detachableParts.some(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent));
            const eNoWheels = !eHasWheels;
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
        } else if (data.type === 'rematch_request') {
          this.handlePeerRematchRequest(data);
        } else if (data.type === 'rematch_bot_pick') {
          this.handlePeerRematchBotPick(data);
        } else if (data.type === 'rematch_ready') {
          this.handlePeerRematchReady(data);
        } else if (data.type === 'rematch_cancel') {
          this.handlePeerRematchCancel(data);
        }
      });

      this.conn.on('close', () => {
        this.handleDisconnect('Opponent disconnected from battle.');
      });
    },

    launchSynchronizedMatch() {
      console.log('[Network] Both players ready! Launching synchronized match countdown...');
      if (this.conn && this.conn.open) {
        this.conn.send({
          type: 'start_countdown',
          hostBot: this.selectedBot,
          guestBot: this.opponentBot
        });
      }
      const loadingOverlay = document.getElementById('match-loading-overlay');
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      startMatchSequence();
    },

    joinRoom(code, botType, onConnected, onError) {
      this.isOnline = true;
      this.isHost = false;
      this.hostReady = false;
      this.guestReady = false;
      this.queuedEvents = [];
      this.selectedBot = botType;
      this.roomCode = code.trim().replace(/^bbx2026-room-/i, '').replace(/^bbx-/i, '');
      const targetPeerId = this.PEER_PREFIX + this.roomCode;

      try {
        if (this.peer) {
          try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: this.ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        let connectTimeout = setTimeout(() => {
          if (!this.conn || !this.conn.open) {
            onError('Connection timed out. Check the 4-digit code and ensure Host room is active.');
          }
        }, 16000);

        this.peer.on('open', (id) => {
          console.log('[Network] Guest Peer ready with ID:', id, 'connecting to:', targetPeerId);
          const conn = this.peer.connect(targetPeerId, { reliable: true });
          this.conn = conn;

          conn.on('open', () => {
            clearTimeout(connectTimeout);
            console.log('[Network] Connected to Host data channel!');
            conn.send({ type: 'guest_join', botType: this.selectedBot });
            if (typeof onConnected === 'function') onConnected();
          });

          if (conn.peerConnection) {
            conn.peerConnection.oniceconnectionstatechange = () => {
              const s = conn.peerConnection.iceConnectionState;
              console.log('[Network] Guest ICE state:', s);
              if (s === 'failed') {
                onError('P2P connection blocked by network firewall or NAT.');
              }
            };
          }

          conn.on('error', (err) => {
            clearTimeout(connectTimeout);
            console.warn('[Network] Guest connection error:', err);
            onError('Connection error: ' + (err.message || 'Failed to connect.'));
          });

          conn.on('data', async (data) => {
            if (data.type === 'prepare_match') {
              clearTimeout(connectTimeout);
              this.opponentBot = data.hostBot;
              if (data.guestBot) this.selectedBot = data.guestBot;
              this.closeRematchModal();
              const joinModal = document.getElementById('modal-online-join');
              if (joinModal) joinModal.classList.add('hidden');
              gameMode = '1v1_online';

              // Preload CAD models on Guest
              await this.preloadMatchModels(this.opponentBot, this.selectedBot);
              console.log('[Network] Guest preloading finished. Signaling ready to Host...');
              conn.send({ type: 'guest_ready' });

              const loadingStatus = document.getElementById('match-loading-status');
              if (loadingStatus) loadingStatus.textContent = '✓ Ready! Waiting for Host countdown trigger...';
            } else if (data.type === 'start_countdown') {
              console.log('[Network] Received start_countdown from Host!');
              this.closeRematchModal();
              const loadingOverlay = document.getElementById('match-loading-overlay');
              if (loadingOverlay) loadingOverlay.classList.add('hidden');
              startMatchSequence();
            } else if (data.type === 'start_match') {
              console.log('[Network] Received start_match fallback from Host!');
              if (data.hostBot) this.opponentBot = data.hostBot;
              if (data.guestBot) this.selectedBot = data.guestBot;
              this.closeRematchModal();
              const modalGameover = document.getElementById('modal-gameover');
              if (modalGameover) modalGameover.classList.add('hidden');
              startMatchSequence();
            } else if (data.type === 'rematch_request') {
              this.handlePeerRematchRequest(data);
            } else if (data.type === 'rematch_bot_pick') {
              this.handlePeerRematchBotPick(data);
            } else if (data.type === 'rematch_ready') {
              this.handlePeerRematchReady(data);
            } else if (data.type === 'rematch_cancel') {
              this.handlePeerRematchCancel(data);
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
            clearTimeout(connectTimeout);
            this.handleDisconnect('Host closed the battle room.');
          });
        });

        this.peer.on('disconnected', () => {
          console.log('[Network] Guest signaling disconnected, attempting reconnection...');
          try {
            if (this.peer && !this.peer.destroyed) this.peer.reconnect();
          } catch (e) {}
        });

        this.peer.on('error', (err) => {
          clearTimeout(connectTimeout);
          console.warn('[Network] Guest peer error:', err);
          onError('Room not found or host not ready. Check the code.');
        });
      } catch (e) {
        onError(e.message);
      }
    },

    async preloadMatchModels(hostBot, guestBot) {
      const loadingOverlay = document.getElementById('match-loading-overlay');
      const loadingBar = document.getElementById('match-loading-bar-fill');
      const loadingStatus = document.getElementById('match-loading-status');
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');

      const p1Ready = typeof getBotScene === 'function' && !!getBotScene(hostBot);
      const p2Ready = typeof getBotScene === 'function' && !!getBotScene(guestBot);
      let prog1 = p1Ready ? 1.0 : 0;
      let prog2 = p2Ready ? 1.0 : 0;

      const updateDisplay = () => {
        const pct = Math.round(((prog1 + prog2) / 2) * 100);
        if (loadingBar) loadingBar.style.width = pct + '%';
        if (loadingStatus) loadingStatus.textContent = `Streaming high-precision CAD telemetry... ${pct}%`;
      };
      updateDisplay();

      if (typeof ensureBotModelLoaded === 'function') {
        await Promise.all([
          ensureBotModelLoaded(hostBot, (p) => { prog1 = p; updateDisplay(); }),
          ensureBotModelLoaded(guestBot, (p) => { prog2 = p; updateDisplay(); })
        ]);
      }
      updateDisplay();
    },

    sendInput(t, s) {
      if (this.conn && this.conn.open && !this.isHost) {
        try {
          const now = performance.now();
          const changed = (t !== this.lastSentT || s !== this.lastSentS);
          if (changed || (now - this.lastInputSendTime >= 33)) {
            this.lastSentT = t;
            this.lastSentS = s;
            this.lastInputSendTime = now;
            this.conn.send({ type: 'guest_input', t, s });
          }
        } catch (e) {
          console.warn('[Network] sendInput error:', e);
        }
      }
    },

    broadcastState() {
      if (!this.conn || !this.conn.open || !this.isHost) return;
      if (!playerBot || !enemyBot) return;

      const now = performance.now();
      if (now - this.lastSendTime < 28 && this.queuedEvents.length === 0) return; // ~35 FPS broadcast, immediate flush on damage events
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

      try {
        this.conn.send({
          type: 'state',
          ms: typeof matchState !== 'undefined' ? matchState : 'playing',
          tm: typeof matchTimeRemaining === 'number' ? matchTimeRemaining : 180,
          bt: typeof bothCantFightTimer === 'number' ? bothCantFightTimer : 0,
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
      } catch (err) {
        console.warn('[Network] broadcastState error:', err);
      }
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

      if (typeof data.bt === 'number' && typeof bothCantFightTimer !== 'undefined') {
        bothCantFightTimer = data.bt;
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
      // Smooth reconciliation with Client-Side Prediction:
      if (!enemyBot.isEntirelyDestroyed) {
        const dx = data.p2.x - enemyBot.x;
        const dz = data.p2.z - enemyBot.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > 1.2) {
          enemyBot.x = data.p2.x;
          enemyBot.z = data.p2.z;
        } else {
          enemyBot.x += dx * 0.65;
          enemyBot.z += dz * 0.65;
        }
        enemyBot.root.position.x = enemyBot.x;
        enemyBot.root.position.z = enemyBot.z;
      }
      enemyBot.airY = data.p2.ay || 0;
      enemyBot.wheelTilt = data.p2.wt || 0;
      enemyBot.vx = data.p2.vx || 0;
      enemyBot.vz = data.p2.vz || 0;
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
        if (typeof data.p1.rc === 'number' && !playerBot.isEntirelyDestroyed && Array.isArray(data.p1.dp) && data.p1.dp.length > 0) {
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
        if (typeof data.p2.rc === 'number' && !enemyBot.isEntirelyDestroyed && Array.isArray(data.p2.dp) && data.p2.dp.length > 0) {
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
      this.isOnline = false;
      this.isHost = false;
      this.hostReady = false;
      this.guestReady = false;
      this.isRematchActive = false;
      this.myRematchReady = false;
      this.peerRematchReady = false;
      this.rematchLaunching = false;
      this.queuedEvents = [];
      if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
      if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
      matchState = 'menu';
      if (typeof cleanupBots === 'function') cleanupBots();
      const loadingOverlay = document.getElementById('match-loading-overlay');
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      const rematchModal = document.getElementById('modal-online-rematch');
      if (rematchModal) rematchModal.classList.add('hidden');
      const gameoverModal = document.getElementById('modal-gameover');
      if (gameoverModal) gameoverModal.classList.add('hidden');
      const hud = document.getElementById('hud');
      if (hud) hud.classList.add('hidden');
      const menuScreen = document.getElementById('menu-screen');
      if (menuScreen) menuScreen.classList.remove('hidden');

      const statusEl = document.getElementById('join-status') || document.getElementById('host-status');
      if (statusEl && msg) {
        statusEl.textContent = 'ℹ️ ' + msg;
        statusEl.style.color = '#fbbf24';
      }
      console.warn('[Network] Disconnected:', msg);
    },

    openRematchModal(localInitiated = false) {
      this.isRematchActive = true;
      this.myRematchReady = false;
      this.peerRematchReady = false;
      this.rematchLaunching = false;

      const modalGameover = document.getElementById('modal-gameover');
      if (modalGameover) modalGameover.classList.add('hidden');
      const hud = document.getElementById('hud');
      if (hud) hud.classList.add('hidden');
      const rematchModal = document.getElementById('modal-online-rematch');
      if (rematchModal) rematchModal.classList.remove('hidden');

      if (localInitiated && this.conn && this.conn.open) {
        try {
          this.conn.send({
            type: 'rematch_request',
            bot: this.selectedBot
          });
        } catch (e) {
          console.warn('[Network] Failed to send rematch_request:', e);
        }
      }

      const statusEl = document.getElementById('rematch-status');
      if (statusEl) {
        if (localInitiated) {
          statusEl.textContent = 'Rematch requested! Pick your robot & click READY.';
          statusEl.style.color = '#fbbf24';
        } else {
          statusEl.textContent = 'Opponent requested a rematch! Pick your robot & ready up.';
          statusEl.style.color = '#38bdf8';
        }
      }

      this.updateRematchUI();

      if (typeof GamepadUINav !== 'undefined') {
        GamepadUINav.activeContainerId = null;
        GamepadUINav.ensureValidFocus();
      }
    },

    selectRematchBot(botId) {
      const validBots = ['robot1', 'robot2', 'robot3', 'robot4', 'robot5', 'robot6'];
      if (!validBots.includes(botId)) return;
      this.selectedBot = botId;
      this.myRematchReady = false;

      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(650, 0.05);
      }

      if (this.conn && this.conn.open) {
        try {
          this.conn.send({
            type: 'rematch_bot_pick',
            bot: this.selectedBot
          });
        } catch (e) {
          console.warn('[Network] Failed to send rematch_bot_pick:', e);
        }
      }

      this.updateRematchUI();
    },

    toggleRematchReady() {
      this.myRematchReady = !this.myRematchReady;

      if (typeof AudioSys !== 'undefined' && AudioSys.beep) {
        AudioSys.init();
        AudioSys.beep(this.myRematchReady ? 780 : 360, 0.08);
      }

      if (this.conn && this.conn.open) {
        try {
          this.conn.send({
            type: 'rematch_ready',
            ready: this.myRematchReady,
            bot: this.selectedBot
          });
        } catch (e) {
          console.warn('[Network] Failed to send rematch_ready:', e);
        }
      }

      this.updateRematchUI();
      this.checkBothRematchReady();
    },

    handlePeerRematchRequest(data) {
      if (data && data.bot) {
        this.opponentBot = data.bot;
      }
      const rematchModal = document.getElementById('modal-online-rematch');
      if (!this.isRematchActive || (rematchModal && rematchModal.classList.contains('hidden'))) {
        this.openRematchModal(false);
      } else {
        this.updateRematchUI();
      }
      const statusEl = document.getElementById('rematch-status');
      if (statusEl) {
        statusEl.textContent = 'Opponent requested a rematch! Pick your robot and ready up.';
        statusEl.style.color = '#38bdf8';
      }
    },

    handlePeerRematchBotPick(data) {
      if (data && data.bot) {
        this.opponentBot = data.bot;
        this.peerRematchReady = false;
        this.updateRematchUI();
      }
    },

    handlePeerRematchReady(data) {
      if (data) {
        this.peerRematchReady = !!data.ready;
        if (data.bot) this.opponentBot = data.bot;
        this.updateRematchUI();
        this.checkBothRematchReady();
      }
    },

    handlePeerRematchCancel(data) {
      this.closeRematchModal();
      this.handleDisconnect('Opponent exited the rematch room.');
    },

    cancelRematch() {
      if (this.conn && this.conn.open) {
        try {
          this.conn.send({ type: 'rematch_cancel' });
        } catch (e) {}
      }
      this.closeRematchModal();
      this.handleDisconnect('Exited online rematch.');
    },

    closeRematchModal() {
      this.isRematchActive = false;
      this.myRematchReady = false;
      this.peerRematchReady = false;
      this.rematchLaunching = false;
      const rematchModal = document.getElementById('modal-online-rematch');
      if (rematchModal) rematchModal.classList.add('hidden');
    },

    checkBothRematchReady() {
      if (this.rematchLaunching) return;
      if (this.myRematchReady && this.peerRematchReady) {
        if (this.isHost) {
          this.rematchLaunching = true;
          const statusEl = document.getElementById('rematch-status');
          if (statusEl) {
            statusEl.textContent = '⚡ Both players ready! Deploying robots...';
            statusEl.style.color = '#34d399';
          }
          setTimeout(async () => {
            this.hostReady = false;
            this.guestReady = false;
            if (this.conn && this.conn.open) {
              this.conn.send({
                type: 'prepare_match',
                hostBot: this.selectedBot,
                guestBot: this.opponentBot
              });
            }
            this.closeRematchModal();
            gameMode = '1v1_online';
            await this.preloadMatchModels(this.selectedBot, this.opponentBot);
            this.hostReady = true;
            if (this.guestReady) {
              this.launchSynchronizedMatch();
            } else {
              const loadingStatus = document.getElementById('match-loading-status');
              if (loadingStatus) loadingStatus.textContent = 'Waiting for opponent to finish streaming CAD telemetry...';
            }
          }, 350);
        } else {
          const statusEl = document.getElementById('rematch-status');
          if (statusEl) {
            statusEl.textContent = '✓ You are ready! Waiting for Host to synchronize match...';
            statusEl.style.color = '#34d399';
          }
        }
      }
    },

    getBotDisplayInfo(botKey) {
      const map = {
        robot1: 'Robot 1 (Overhead Blade)',
        robot2: 'Robot 2 (Vertical Drum)',
        robot3: 'Robot 3 (Horizontal Bar)',
        robot4: 'Robot 4 (Twin Blade)',
        robot5: 'Robot 5 (Drum Spinner)',
        robot6: 'Robot 6 (Heavy Disc)'
      };
      return map[botKey] || botKey || 'Robot 1';
    },

    updateRematchUI() {
      const cards = document.querySelectorAll('#rematch-bot-selector .mini-bot-card');
      cards.forEach(card => {
        if (card.dataset.bot === this.selectedBot) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      });

      const myBadge = document.getElementById('rematch-my-badge');
      const readyBtn = document.getElementById('btn-rematch-ready');
      if (myBadge) {
        if (this.myRematchReady) {
          myBadge.className = 'ready-badge ready';
          myBadge.textContent = '✓ READY';
        } else {
          myBadge.className = 'ready-badge not-ready';
          myBadge.textContent = 'NOT READY';
        }
      }
      if (readyBtn) {
        if (this.myRematchReady) {
          readyBtn.innerHTML = 'CANCEL READY &nbsp;✕';
          readyBtn.classList.remove('primary');
          readyBtn.classList.add('secondary');
        } else {
          readyBtn.innerHTML = 'READY UP &nbsp;✓';
          readyBtn.classList.remove('secondary');
          readyBtn.classList.add('primary');
        }
      }

      const oppInfo = document.getElementById('rematch-opponent-info');
      const oppBadge = document.getElementById('rematch-opponent-badge');
      if (oppInfo) {
        const oppBotName = this.getBotDisplayInfo(this.opponentBot);
        oppInfo.textContent = `${this.isHost ? 'Guest' : 'Host'}: ${oppBotName}`;
      }
      if (oppBadge) {
        if (this.peerRematchReady) {
          oppBadge.className = 'ready-badge ready';
          oppBadge.textContent = '✓ READY';
        } else {
          oppBadge.className = 'ready-badge not-ready';
          oppBadge.textContent = 'WAITING';
        }
      }
    },

    initRematchUI() {
      if (this._rematchUIInitialized) return;
      this._rematchUIInitialized = true;

      document.querySelectorAll('#rematch-bot-selector .mini-bot-card').forEach(card => {
        card.addEventListener('click', () => {
          this.selectRematchBot(card.dataset.bot);
        });
      });

      const readyBtn = document.getElementById('btn-rematch-ready');
      if (readyBtn) {
        readyBtn.addEventListener('click', () => {
          this.toggleRematchReady();
        });
      }

      const menuBtn = document.getElementById('btn-rematch-menu');
      if (menuBtn) {
        menuBtn.addEventListener('click', () => {
          this.cancelRematch();
        });
      }

      const closeBtn = document.getElementById('btn-rematch-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.cancelRematch();
        });
      }
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => NetworkSys.initRematchUI());
  } else {
    NetworkSys.initRematchUI();
  }
