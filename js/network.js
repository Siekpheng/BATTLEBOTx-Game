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
      if (this.isOnline && this.isHost) {
        this.queuedEvents.push(ev);
      }
    },

    createRoom(botType, onReady, onError) {
      this.isOnline = true;
      this.isHost = true;
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
          this.conn.send({
            type: 'start_match',
            hostBot: this.selectedBot,
            guestBot: this.opponentBot
          });
          document.getElementById('modal-online-host').classList.add('hidden');
          gameMode = '1v1_online';
          startMatchSequence();
        } else if (data.type === 'guest_input') {
          if (enemyBot) {
            enemyBot.throttleInput = data.t || 0;
            enemyBot.steerInput = data.s || 0;
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
      if (now - this.lastSendTime < 24) return; // ~40 FPS broadcast
      this.lastSendTime = now;

      const evs = this.queuedEvents.slice();
      this.queuedEvents.length = 0;

      this.conn.send({
        type: 'state',
        p1: {
          x: playerBot.x, z: playerBot.z, y: playerBot.root.position.y,
          yaw: playerBot.yaw, pitch: playerBot.pitch, roll: playerBot.roll,
          spin: playerBot.weaponSpinSpeed, hp: playerBot.driveHealth, fp: playerBot.flipped
        },
        p2: {
          x: enemyBot.x, z: enemyBot.z, y: enemyBot.root.position.y,
          yaw: enemyBot.yaw, pitch: enemyBot.pitch, roll: enemyBot.roll,
          spin: enemyBot.weaponSpinSpeed, hp: enemyBot.driveHealth, fp: enemyBot.flipped
        },
        events: evs
      });
    },

    applyRemoteState(data) {
      if (!playerBot || !enemyBot) return;

      // Host robot (p1)
      playerBot.x = data.p1.x;
      playerBot.z = data.p1.z;
      playerBot.root.position.x = data.p1.x;
      playerBot.root.position.z = data.p1.z;
      playerBot.root.position.y = (data.p1.y || 0);
      playerBot.yaw = data.p1.yaw;
      playerBot.pitch = data.p1.pitch;
      playerBot.roll = data.p1.roll;
      playerBot.root.rotation.y = data.p1.yaw;
      playerBot.tiltGroup.rotation.x = data.p1.pitch;
      playerBot.tiltGroup.rotation.z = data.p1.roll;
      playerBot.weaponSpinSpeed = data.p1.spin;
      playerBot.driveHealth = data.p1.hp;
      playerBot.flipped = data.p1.fp;

      // Guest robot (p2)
      enemyBot.x = data.p2.x;
      enemyBot.z = data.p2.z;
      enemyBot.root.position.x = data.p2.x;
      enemyBot.root.position.z = data.p2.z;
      enemyBot.root.position.y = (data.p2.y || 0);
      enemyBot.yaw = data.p2.yaw;
      enemyBot.pitch = data.p2.pitch;
      enemyBot.roll = data.p2.roll;
      enemyBot.root.rotation.y = data.p2.yaw;
      enemyBot.tiltGroup.rotation.x = data.p2.pitch;
      enemyBot.tiltGroup.rotation.z = data.p2.roll;
      enemyBot.weaponSpinSpeed = data.p2.spin;
      enemyBot.driveHealth = data.p2.hp;
      enemyBot.flipped = data.p2.fp;

      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(ev => {
          if (ev.t === 'clash') AudioSys.metalClashSound(ev.i, ev.h);
          if (ev.t === 'slice') AudioSys.weaponSliceSound();
          if (ev.t === 'stall') AudioSys.weaponStallSound();
          if (ev.t === 'sparks') spawnCollisionSparks(new THREE.Vector3(ev.x, ev.y, ev.z), ev.c);
        });
      }
    },

    handleDisconnect(msg) {
      if (!this.isOnline) return;
      alert(msg || 'Connection lost.');
      this.isOnline = false;
      this.isHost = false;
      if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
      if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
      matchState = 'menu';
      cleanupBots();
      hud.classList.add('hidden');
      menuScreen.classList.remove('hidden');
    }
  };

