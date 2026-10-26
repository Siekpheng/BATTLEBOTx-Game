// ========================================================
// BATTLEBOTx - AUDIO ENGINE & PROCEDURAL SOUNDTRACK
// ========================================================

  // ========================================================
  // 1.0 NON-COPYRIGHT PROCEDURAL COMBAT SOUNDTRACK (BgmSys)
  // 100% Original Code-Synthesized Cyberpunk Industrial Soundtrack
  // 0 KB Footprint, Loud & Punchy Mastered Mix, Adaptive To Match Combat State
  // ========================================================
  const BgmSys = {
    ctx: null,
    masterOut: null,
    bgmGain: null,
    noiseBuffer: null,

    enabled: true,
    isPlaying: false,
    tempo: 128, // High-energy cyberpunk combat tempo
    step: 0,
    nextNoteTime: 0,
    timerId: null,
    mode: 'menu', // 'menu' | 'combat' | 'climax'

    init(ctx, masterOut, noiseBuffer) {
      this.ctx = ctx;
      this.masterOut = masterOut;
      this.noiseBuffer = noiseBuffer;

      if (!this.bgmGain && this.ctx) {
        this.bgmGain = this.ctx.createGain();
        let saved = null;
        try { saved = localStorage.getItem('battlebotx_bgm_enabled'); } catch(e){}
        this.enabled = (saved !== null) ? (saved === 'true') : true;
        // Punchy, studio-mastered soundtrack level (0.70)
        this.bgmGain.gain.setValueAtTime(this.enabled ? 0.70 : 0.0001, this.ctx.currentTime);
        this.bgmGain.connect(this.masterOut);
      }
      this.updateUI();
    },

    start() {
      if (!this.ctx || this.isPlaying) return;
      this.isPlaying = true;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.step = 0;
      this.scheduleLoop();
    },

    stop() {
      this.isPlaying = false;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    },

    setMode(mode) {
      this.mode = mode; // 'menu' | 'combat' | 'climax'
    },

    updateGain() {
      if (this.bgmGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setTargetAtTime(this.enabled ? 0.70 : 0.0001, now, 0.05);
      }
    },

    toggle() {
      this.enabled = !this.enabled;
      try { localStorage.setItem('battlebotx_bgm_enabled', String(this.enabled)); } catch(e){}
      this.updateGain();
      this.updateUI();
      return this.enabled;
    },

    updateUI() {
      const menuBtn = document.getElementById('btn-menu-music');
      const hudBtn = document.getElementById('btn-hud-music');
      const isSuspended = (this.ctx && this.ctx.state === 'suspended');

      if (menuBtn) {
        if (!this.enabled) {
          menuBtn.innerHTML = '🔇 Music: <strong>OFF</strong>';
          menuBtn.style.color = '#94a3b8';
        } else if (isSuspended) {
          menuBtn.innerHTML = '🎵 Music: <strong>CLICK TO PLAY</strong>';
          menuBtn.style.color = '#38bdf8';
        } else {
          menuBtn.innerHTML = '🎵 Music: <strong>ON</strong>';
          menuBtn.style.color = '#38bdf8';
        }
      }
      if (hudBtn) {
        hudBtn.textContent = this.enabled ? '🎵' : '🔇';
        hudBtn.title = this.enabled ? 'Mute Music' : 'Unmute Music';
        hudBtn.style.opacity = this.enabled ? '1.0' : '0.55';
      }
    },

    scheduleLoop() {
      if (!this.isPlaying || !this.ctx) return;
      const secondsPer16th = (60.0 / this.tempo) / 4.0;
      const lookahead = 0.12;

      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this.scheduleStep(this.step, this.nextNoteTime);
        this.step = (this.step + 1) % 64; // 4-bar progression (16 steps * 4 = 64)
        this.nextNoteTime += secondsPer16th;
      }

      this.timerId = setTimeout(() => this.scheduleLoop(), 35);
    },

    scheduleStep(step, time) {
      if (!this.enabled && this.bgmGain && this.bgmGain.gain.value < 0.001) return;
      const bar = Math.floor(step / 16);
      const stepInBar = step % 16;
      const isMenu = (this.mode === 'menu');
      const isClimax = (this.mode === 'climax');

      // 1. DRUMS (Punchy Kick, Snappy Snare, Crisp Hi-Hats)
      const isKickStep = isMenu
        ? (stepInBar === 0 || stepInBar === 8 || stepInBar === 14)
        : (stepInBar === 0 || stepInBar === 4 || stepInBar === 8 || stepInBar === 12 || (isClimax && stepInBar === 14));

      if (isKickStep) {
        this.playKick(time, isMenu ? 0.52 : (isClimax ? 0.68 : 0.60), isMenu ? 130 : 160);
      }

      // Snare on beats 4 and 12 (both in Menu and Combat for clear rhythmic pulse!)
      if (stepInBar === 4 || stepInBar === 12) {
        this.playSnare(time, isMenu ? 0.36 : (isClimax ? 0.50 : 0.44));
      }

      // Hi-Hats & Shakers
      const isHatStep = isMenu ? (stepInBar % 2 === 0) : (isClimax || stepInBar % 2 === 0);
      if (isHatStep) {
        const isOpen = (stepInBar === 2 || stepInBar === 6 || stepInBar === 10 || stepInBar === 14);
        this.playHat(time, isOpen ? 0.20 : 0.12, isOpen);
      }

      // 2. HEAVY INDUSTRIAL CYBERPUNK BASSLINE
      // 4-Bar Chord Progression in D-Minor:
      // Bar 0: D (D1 = 36.71 Hz / D2 = 73.42 Hz)
      // Bar 1: F (F1 = 43.65 Hz / F2 = 87.31 Hz)
      // Bar 2: G (G1 = 49.00 Hz / G2 = 98.00 Hz)
      // Bar 3: Bb -> A (Bb0 = 29.14 Hz, step >= 8: A0 = 27.50 Hz)
      let rootHz = 36.71;
      if (bar === 1) rootHz = 43.65;
      else if (bar === 2) rootHz = 49.00;
      else if (bar === 3) rootHz = (stepInBar < 8) ? 29.14 : 27.50;

      const isOctave = (stepInBar % 2 === 1);
      const bassFreq = isOctave ? rootHz * 2.0 : rootHz;

      const cutoff = isMenu ? 580 : (isClimax ? 1200 : 850);
      const bassVol = isKickStep ? 0.38 : (isMenu ? 0.44 : 0.52);
      this.playBass(time, bassFreq, cutoff, bassVol);

      // 3. MELODIC SYNTH ARPEGGIO & BATTLE HOOK (Lush, Audible, Sparkling Lead)
      const arpNotes = [
        146.83, 220.00, 293.66, 349.23,  220.00, 293.66, 349.23, 440.00,
        146.83, 220.00, 293.66, 349.23,  293.66, 349.23, 440.00, 523.25,
        174.61, 220.00, 261.63, 349.23,  220.00, 261.63, 349.23, 440.00,
        174.61, 220.00, 261.63, 349.23,  261.63, 349.23, 440.00, 523.25,
        196.00, 233.08, 293.66, 392.00,  233.08, 293.66, 392.00, 466.16,
        196.00, 233.08, 293.66, 392.00,  293.66, 392.00, 466.16, 587.33,
        233.08, 293.66, 349.23, 466.16,  220.00, 261.63, 329.63, 440.00,
        220.00, 261.63, 329.63, 440.00,  261.63, 329.63, 440.00, 587.33
      ];

      // In Menu: 8th note arpeggios; in Combat: driving 16ths
      if (stepInBar % 2 === 0 || !isMenu) {
        const leadFreq = arpNotes[step % arpNotes.length];
        this.playLead(time, leadFreq, isMenu ? 0.32 : (isClimax ? 0.44 : 0.38), isMenu);
      }
    },

    playKick(time, vol = 0.60, startFreq = 160) {
      if (!this.ctx || !this.bgmGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch punch: snappy dive from startFreq down to deep sub 42 Hz
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

      // Volume envelope: strong transient attack decaying over 0.14s
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + 0.15);
    },

    playSnare(time, vol = 0.44) {
      if (!this.ctx || !this.bgmGain) return;

      // Noise body
      if (this.noiseBuffer) {
        const nNode = this.ctx.createBufferSource();
        const nFilter = this.ctx.createBiquadFilter();
        const nGain = this.ctx.createGain();
        nNode.buffer = this.noiseBuffer;
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(1900, time);
        nFilter.Q.setValueAtTime(1.4, time);
        nGain.gain.setValueAtTime(vol * 0.9, time);
        nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
        nNode.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.bgmGain);
        nNode.start(time);
        nNode.stop(time + 0.18);
      }

      // Tonal body (snappy electronic snap)
      const osc = this.ctx.createOscillator();
      const oGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, time);
      osc.frequency.exponentialRampToValueAtTime(95, time + 0.07);
      oGain.gain.setValueAtTime(vol * 0.85, time);
      oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.connect(oGain);
      oGain.connect(this.bgmGain);
      osc.start(time);
      osc.stop(time + 0.09);
    },

    playHat(time, vol = 0.14, isOpen = false) {
      if (!this.ctx || !this.bgmGain || !this.noiseBuffer) return;
      const node = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      node.buffer = this.noiseBuffer;
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(5500, time);
      const dur = isOpen ? 0.12 : 0.045;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      node.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      node.start(time);
      node.stop(time + dur + 0.01);
    },

    playBass(time, freq, cutoff = 850, vol = 0.48) {
      if (!this.ctx || !this.bgmGain) return;
      // Dual oscillators: Sawtooth for rich audible harmonics on laptops + Triangle for deep subwoofer punch
      const oscSaw = this.ctx.createOscillator();
      const oscTri = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      oscSaw.type = 'sawtooth';
      oscTri.type = 'triangle';

      // Mid harmonics (octave 2/3 for clear presence on small speakers)
      oscSaw.frequency.setValueAtTime(freq * 2.0, time);
      // Subwoofer foundation
      oscTri.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(Math.max(160, cutoff * 0.40), time + 0.12);
      filter.Q.setValueAtTime(2.8, time);

      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      oscSaw.connect(filter);
      oscTri.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      oscSaw.start(time);
      oscTri.start(time);
      oscSaw.stop(time + 0.15);
      oscTri.stop(time + 0.15);
    },

    playLead(time, freq, vol = 0.36, isMenu = false) {
      if (!this.ctx || !this.bgmGain) return;
      // Dual detuned oscillators for lush cyberpunk stereo-feel
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.005, time); // Subtle rich chorus detune

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isMenu ? 2600 : 3800, time);
      filter.frequency.exponentialRampToValueAtTime(isMenu ? 1200 : 1800, time + (isMenu ? 0.22 : 0.14));
      filter.Q.setValueAtTime(1.8, time);

      const dur = isMenu ? 0.24 : 0.16;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + dur + 0.02);
      osc2.stop(time + dur + 0.02);
    }
  };

  // ========================================================
  // 1. PROFESSIONAL REAL-TIME WEB AUDIO COMBAT ENGINE
  // ========================================================
  const AudioSys = {
    ctx: null,
    masterGain: null,
    compressor: null,
    noiseBuffer: null,

    // Continuous real-time synthesizer channels
    loopsInitialized: false,
    pMotorOsc: null,
    pMotorGain: null,
    pMotorFilter: null,
    pAirNode: null,
    pAirFilter: null,
    pAirGain: null,
    pTurbineOsc: null,
    pTurbineGain: null,

    eMotorOsc: null,
    eMotorGain: null,
    eMotorFilter: null,
    eAirNode: null,
    eAirFilter: null,
    eAirGain: null,
    eTurbineOsc: null,
    eTurbineGain: null,

    pDriveOsc: null,
    pDriveFilter: null,
    pDriveGain: null,

    lastSkidTime: 0,
    lastCrackleTime: 0,

    fireRumbleNode: null,
    fireRumbleFilter: null,
    fireRumbleGain: null,
    fireAirNode: null,
    fireAirFilter: null,
    fireAirGain: null,
    fireSoundEnabled: true,

    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          this.setupMasterChain();
          this.generateNoiseBuffer();
          this.initContinuousNodes();
          BgmSys.init(this.ctx, this.masterGain, this.noiseBuffer);
          BgmSys.start();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          if (!BgmSys.isPlaying) BgmSys.start();
        });
      }
    },

    setupMasterChain() {
      try {
        // High-end dynamics compressor for broadcast tournament punch
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(18, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.20, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
      } catch (err) {
        console.warn('Audio master chain init:', err);
      }
    },

    generateNoiseBuffer() {
      try {
        // 3-second procedural white/pink noise buffer for metal crunch, sparks, and air shear
        const rate = this.ctx.sampleRate;
        const length = Math.floor(rate * 3.0);
        this.noiseBuffer = this.ctx.createBuffer(1, length, rate);
        const data = this.noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2.0 - 1.0;
          lastOut = (lastOut * 0.82) + (white * 0.18);
          data[i] = lastOut * 2.2;
        }
      } catch (err) {
        console.warn('Noise buffer init:', err);
      }
    },

    initContinuousNodes() {
      if (this.loopsInitialized || !this.ctx || !this.masterGain) return;
      try {
        const now = this.ctx.currentTime;

        // --- 1. PLAYER WEAPON SYNTHESIZER ---
        // A. Brushless Inverter Whine
        this.pMotorOsc = this.ctx.createOscillator();
        this.pMotorOsc.type = 'sawtooth';
        this.pMotorOsc.frequency.setValueAtTime(110, now);

        this.pMotorFilter = this.ctx.createBiquadFilter();
        this.pMotorFilter.type = 'lowpass';
        this.pMotorFilter.frequency.setValueAtTime(900, now);
        this.pMotorFilter.Q.setValueAtTime(2.0, now);

        this.pMotorGain = this.ctx.createGain();
        this.pMotorGain.gain.setValueAtTime(0.0001, now);

        this.pMotorOsc.connect(this.pMotorFilter);
        this.pMotorFilter.connect(this.pMotorGain);
        this.pMotorGain.connect(this.masterGain);
        this.pMotorOsc.start(now);

        // B. Aerodynamic Blade Air Rush / Wind Shear
        if (this.noiseBuffer) {
          this.pAirNode = this.ctx.createBufferSource();
          this.pAirNode.buffer = this.noiseBuffer;
          this.pAirNode.loop = true;

          this.pAirFilter = this.ctx.createBiquadFilter();
          this.pAirFilter.type = 'bandpass';
          this.pAirFilter.frequency.setValueAtTime(320, now);
          this.pAirFilter.Q.setValueAtTime(3.2, now);

          this.pAirGain = this.ctx.createGain();
          this.pAirGain.gain.setValueAtTime(0.0001, now);

          this.pAirNode.connect(this.pAirFilter);
          this.pAirFilter.connect(this.pAirGain);
          this.pAirGain.connect(this.masterGain);
          this.pAirNode.start(now);
        }

        // C. Supersonic High-RPM Turbine Screamer Whistle
        this.pTurbineOsc = this.ctx.createOscillator();
        this.pTurbineOsc.type = 'sine';
        this.pTurbineOsc.frequency.setValueAtTime(800, now);

        this.pTurbineGain = this.ctx.createGain();
        this.pTurbineGain.gain.setValueAtTime(0.0001, now);

        this.pTurbineOsc.connect(this.pTurbineGain);
        this.pTurbineGain.connect(this.masterGain);
        this.pTurbineOsc.start(now);

        // --- 2. ENEMY WEAPON SYNTHESIZER ---
        this.eMotorOsc = this.ctx.createOscillator();
        this.eMotorOsc.type = 'sawtooth';
        this.eMotorOsc.frequency.setValueAtTime(95, now);

        this.eMotorFilter = this.ctx.createBiquadFilter();
        this.eMotorFilter.type = 'lowpass';
        this.eMotorFilter.frequency.setValueAtTime(850, now);
        this.eMotorFilter.Q.setValueAtTime(1.8, now);

        this.eMotorGain = this.ctx.createGain();
        this.eMotorGain.gain.setValueAtTime(0.0001, now);

        this.eMotorOsc.connect(this.eMotorFilter);
        this.eMotorFilter.connect(this.eMotorGain);
        this.eMotorGain.connect(this.masterGain);
        this.eMotorOsc.start(now);

        if (this.noiseBuffer) {
          this.eAirNode = this.ctx.createBufferSource();
          this.eAirNode.buffer = this.noiseBuffer;
          this.eAirNode.loop = true;

          this.eAirFilter = this.ctx.createBiquadFilter();
          this.eAirFilter.type = 'bandpass';
          this.eAirFilter.frequency.setValueAtTime(300, now);
          this.eAirFilter.Q.setValueAtTime(2.8, now);

          this.eAirGain = this.ctx.createGain();
          this.eAirGain.gain.setValueAtTime(0.0001, now);

          this.eAirNode.connect(this.eAirFilter);
          this.eAirFilter.connect(this.eAirGain);
          this.eAirGain.connect(this.masterGain);
          this.eAirNode.start(now);
        }

        this.eTurbineOsc = this.ctx.createOscillator();
        this.eTurbineOsc.type = 'sine';
        this.eTurbineOsc.frequency.setValueAtTime(750, now);

        this.eTurbineGain = this.ctx.createGain();
        this.eTurbineGain.gain.setValueAtTime(0.0001, now);

        this.eTurbineOsc.connect(this.eTurbineGain);
        this.eTurbineGain.connect(this.masterGain);
        this.eTurbineOsc.start(now);

        // --- 3. PLAYER ELECTRIC DRIVE MOTORS ---
        this.pDriveOsc = this.ctx.createOscillator();
        this.pDriveOsc.type = 'triangle';
        this.pDriveOsc.frequency.setValueAtTime(70, now);

        this.pDriveFilter = this.ctx.createBiquadFilter();
        this.pDriveFilter.type = 'lowpass';
        this.pDriveFilter.frequency.setValueAtTime(450, now);

        this.pDriveGain = this.ctx.createGain();
        this.pDriveGain.gain.setValueAtTime(0.0001, now);

        this.pDriveOsc.connect(this.pDriveFilter);
        this.pDriveFilter.connect(this.pDriveGain);
        this.pDriveGain.connect(this.masterGain);
        this.pDriveOsc.start(now);

        // --- 4. REALISTIC COMBUSTION FIRE ROAR & DRAFT ---
        if (this.noiseBuffer) {
          // Layer A: Low-frequency turbulent combustion draft / deep fire rumble (70 - 180 Hz)
          this.fireRumbleNode = this.ctx.createBufferSource();
          this.fireRumbleNode.buffer = this.noiseBuffer;
          this.fireRumbleNode.loop = true;

          this.fireRumbleFilter = this.ctx.createBiquadFilter();
          this.fireRumbleFilter.type = 'lowpass';
          this.fireRumbleFilter.frequency.setValueAtTime(140, now);
          this.fireRumbleFilter.Q.setValueAtTime(1.5, now);

          this.fireRumbleGain = this.ctx.createGain();
          this.fireRumbleGain.gain.setValueAtTime(0.0001, now);

          this.fireRumbleNode.connect(this.fireRumbleFilter);
          this.fireRumbleFilter.connect(this.fireRumbleGain);
          this.fireRumbleGain.connect(this.masterGain);
          this.fireRumbleNode.start(now);

          // Layer B: Mid-frequency turbulent air draft rush (250 - 550 Hz)
          this.fireAirNode = this.ctx.createBufferSource();
          this.fireAirNode.buffer = this.noiseBuffer;
          this.fireAirNode.loop = true;

          this.fireAirFilter = this.ctx.createBiquadFilter();
          this.fireAirFilter.type = 'bandpass';
          this.fireAirFilter.frequency.setValueAtTime(360, now);
          this.fireAirFilter.Q.setValueAtTime(1.8, now);

          this.fireAirGain = this.ctx.createGain();
          this.fireAirGain.gain.setValueAtTime(0.0001, now);

          this.fireAirNode.connect(this.fireAirFilter);
          this.fireAirFilter.connect(this.fireAirGain);
          this.fireAirGain.connect(this.masterGain);
          this.fireAirNode.start(now);
        }

        this.loopsInitialized = true;
      } catch (err) {
        console.warn('Continuous audio nodes init:', err);
      }
    },

    updateCombatAudio(pBot, eBot, matchState, dt) {
      if (!this.ctx || this.ctx.state !== 'running' || !this.loopsInitialized) return;
      const now = this.ctx.currentTime;
      const isCombatActive = (matchState === 'playing' || matchState === 'countdown' || (matchState === 'menu' && pBot && eBot));
      const menuVol = (matchState === 'menu') ? 0.35 : 1.0;

      // --- PLAYER WEAPON WINDING & SPIN SOUND ---
      const pSpeed = (pBot && isCombatActive) ? (pBot.weaponSpinSpeed || 0) : 0;
      const pRpm = Math.min(1.0, Math.max(0, pSpeed / 95.0));

      if (pRpm > 0.02) {
        // Brushless motor inverter whine pitch glide (110 Hz up to ~990 Hz)
        const motorFreq = 110 + Math.pow(pRpm, 1.45) * 880;
        this.pMotorOsc.frequency.setTargetAtTime(motorFreq, now, 0.035);
        this.pMotorFilter.frequency.setTargetAtTime(motorFreq * 1.6, now, 0.035);
        this.pMotorGain.gain.setTargetAtTime((0.025 + pRpm * 0.15) * menuVol, now, 0.04);

        // Aerodynamic air rush filter tracking RPM
        if (this.pAirFilter && this.pAirGain) {
          const airFreq = 300 + Math.pow(pRpm, 1.3) * 1950;
          this.pAirFilter.frequency.setTargetAtTime(airFreq, now, 0.04);
          this.pAirGain.gain.setTargetAtTime(0.02 + pRpm * 0.17, now, 0.04);
        }

        // Supersonic whistling overtone when above 65% RPM
        if (this.pTurbineGain) {
          const turbineFreq = motorFreq * 2.15;
          this.pTurbineOsc.frequency.setTargetAtTime(turbineFreq, now, 0.035);
          const turbineVol = Math.max(0, (pRpm - 0.65) / 0.35) * 0.085;
          this.pTurbineGain.gain.setTargetAtTime(turbineVol, now, 0.05);
        }
      } else {
        if (this.pMotorGain) this.pMotorGain.gain.setTargetAtTime(0.0001, now, 0.06);
        if (this.pAirGain) this.pAirGain.gain.setTargetAtTime(0.0001, now, 0.06);
        if (this.pTurbineGain) this.pTurbineGain.gain.setTargetAtTime(0.0001, now, 0.06);
      }

      // --- ENEMY WEAPON WINDING & SPIN SOUND ---
      const eSpeed = (eBot && isCombatActive) ? (eBot.weaponSpinSpeed || 0) : 0;
      const eRpm = Math.min(1.0, Math.max(0, eSpeed / 95.0));

      if (eRpm > 0.02) {
        const eMotorFreq = 95 + Math.pow(eRpm, 1.45) * 820;
        this.eMotorOsc.frequency.setTargetAtTime(eMotorFreq, now, 0.035);
        this.eMotorFilter.frequency.setTargetAtTime(eMotorFreq * 1.5, now, 0.035);
        this.eMotorGain.gain.setTargetAtTime((0.02 + eRpm * 0.12) * menuVol, now, 0.04);

        if (this.eAirFilter && this.eAirGain) {
          const eAirFreq = 280 + Math.pow(eRpm, 1.3) * 1750;
          this.eAirFilter.frequency.setTargetAtTime(eAirFreq, now, 0.04);
          this.eAirGain.gain.setTargetAtTime(0.015 + eRpm * 0.13, now, 0.04);
        }

        if (this.eTurbineGain) {
          const eTurbineFreq = eMotorFreq * 2.1;
          this.eTurbineOsc.frequency.setTargetAtTime(eTurbineFreq, now, 0.035);
          const eTurbineVol = Math.max(0, (eRpm - 0.68) / 0.32) * 0.065;
          this.eTurbineGain.gain.setTargetAtTime(eTurbineVol, now, 0.05);
        }
      } else {
        if (this.eMotorGain) this.eMotorGain.gain.setTargetAtTime(0.0001, now, 0.06);
        if (this.eAirGain) this.eAirGain.gain.setTargetAtTime(0.0001, now, 0.06);
        if (this.eTurbineGain) this.eTurbineGain.gain.setTargetAtTime(0.0001, now, 0.06);
      }

      // --- PLAYER DRIVE MOTORS GEARBOX HUM ---
      if (pBot && isCombatActive && this.pDriveGain) {
        const pSpeedLin = Math.hypot(pBot.vx || 0, pBot.vz || 0);
        const isDriving = (pBot.throttleInput !== 0 || pBot.steerInput !== 0);
        if (isDriving || pSpeedLin > 0.6) {
          const driveRatio = Math.min(1.0, pSpeedLin / 14.0);
          const driveFreq = 72 + driveRatio * 290;
          this.pDriveOsc.frequency.setTargetAtTime(driveFreq, now, 0.04);
          this.pDriveFilter.frequency.setTargetAtTime(driveFreq * 2.5, now, 0.04);
          const driveVol = 0.02 + (isDriving ? 0.055 : 0.02);
          this.pDriveGain.gain.setTargetAtTime(driveVol, now, 0.05);
        } else {
          this.pDriveGain.gain.setTargetAtTime(0.0001, now, 0.08);
        }
      } else if (this.pDriveGain) {
        this.pDriveGain.gain.setTargetAtTime(0.0001, now, 0.08);
      }
    },

    setFireActive(active) {
      if (!this.ctx || !this.loopsInitialized) return;
      const now = this.ctx.currentTime;
      if (active && this.fireSoundEnabled !== false) {
        // Natural turbulent breathing of active combustion blaze
        const time = now * 3.2;
        const rumbleMod = 0.08 + Math.sin(time * 0.75) * 0.02 + Math.cos(time * 1.4) * 0.015;
        const airMod = 0.04 + Math.cos(time * 0.95) * 0.015;

        if (this.fireRumbleGain) this.fireRumbleGain.gain.setTargetAtTime(rumbleMod, now, 0.08);
        if (this.fireAirGain) this.fireAirGain.gain.setTargetAtTime(airMod, now, 0.08);

        if (this.fireRumbleFilter) {
          const rumbleFreq = 135 + Math.sin(time * 0.8) * 25;
          this.fireRumbleFilter.frequency.setTargetAtTime(rumbleFreq, now, 0.08);
        }
      } else {
        if (this.fireRumbleGain) this.fireRumbleGain.gain.setTargetAtTime(0.0001, now, 0.15);
        if (this.fireAirGain) this.fireAirGain.gain.setTargetAtTime(0.0001, now, 0.15);
      }
    },

    stopCombatAudio() {
      if (!this.ctx || !this.loopsInitialized) return;
      const now = this.ctx.currentTime;
      if (this.pMotorGain) this.pMotorGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.pAirGain) this.pAirGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.pTurbineGain) this.pTurbineGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.eMotorGain) this.eMotorGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.eAirGain) this.eAirGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.eTurbineGain) this.eTurbineGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.pDriveGain) this.pDriveGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.fireRumbleGain) this.fireRumbleGain.gain.setTargetAtTime(0.0001, now, 0.05);
      if (this.fireAirGain) this.fireAirGain.gain.setTargetAtTime(0.0001, now, 0.05);
    },

    // --- REALISTIC ONE-SHOT COMBAT SOUND EFFECTS ---

    // 1.5 Authentic Heavy Metal-on-Steel Clashing (Robot-on-Robot Clangs, Gouges & Slams)
    metalClashSound(intensity = 1, isHardClash = false) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;
      const scale = Math.min(2.8, Math.max(0.35, intensity));

      // Layer A: Sharp Dual-Harmonic Anvil Clang (High-hardness AR500 steel strike)
      // Metallic resonant frequencies with natural inharmonic dissonance & random frequency jitter per hit
      const jitter = 0.90 + Math.random() * 0.20;
      const clangFreq1 = (isHardClash ? 920 : 640) * jitter;
      const clangFreq2 = (isHardClash ? 2180 : 1560) * jitter;

      const clangOsc1 = this.ctx.createOscillator();
      const clangFilter1 = this.ctx.createBiquadFilter();
      const clangGain1 = this.ctx.createGain();
      clangOsc1.type = 'triangle';
      clangOsc1.frequency.setValueAtTime(clangFreq1, now);
      clangFilter1.type = 'bandpass';
      clangFilter1.frequency.setValueAtTime(clangFreq1, now);
      clangFilter1.Q.setValueAtTime(5.5, now);
      const vol1 = Math.min(0.55, 0.28 * scale);
      clangGain1.gain.setValueAtTime(vol1, now);
      clangGain1.gain.exponentialRampToValueAtTime(0.001, now + (isHardClash ? 0.32 : 0.22));
      clangOsc1.connect(clangFilter1);
      clangFilter1.connect(clangGain1);
      clangGain1.connect(dest);
      clangOsc1.start(now);
      clangOsc1.stop(now + 0.35);

      const clangOsc2 = this.ctx.createOscillator();
      const clangFilter2 = this.ctx.createBiquadFilter();
      const clangGain2 = this.ctx.createGain();
      clangOsc2.type = 'sawtooth';
      clangOsc2.frequency.setValueAtTime(clangFreq2, now);
      clangFilter2.type = 'bandpass';
      clangFilter2.frequency.setValueAtTime(clangFreq2, now);
      clangFilter2.Q.setValueAtTime(6.5, now);
      const vol2 = Math.min(0.42, 0.20 * scale);
      clangGain2.gain.setValueAtTime(vol2, now);
      clangGain2.gain.exponentialRampToValueAtTime(0.001, now + (isHardClash ? 0.25 : 0.16));
      clangOsc2.connect(clangFilter2);
      clangFilter2.connect(clangGain2);
      clangGain2.connect(dest);
      clangOsc2.start(now);
      clangOsc2.stop(now + 0.28);

      // Layer B: Heavy Steel Monocoque Chassis Shudder / Hollow Ring (Lower body vibration)
      const plateOsc = this.ctx.createOscillator();
      const plateGain = this.ctx.createGain();
      plateOsc.type = 'sine';
      plateOsc.frequency.setValueAtTime(210 * jitter, now);
      plateOsc.frequency.exponentialRampToValueAtTime(75, now + 0.24);
      const plateVol = Math.min(0.50, 0.24 * scale);
      plateGain.gain.setValueAtTime(plateVol, now);
      plateGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      plateOsc.connect(plateGain);
      plateGain.connect(dest);
      plateOsc.start(now);
      plateOsc.stop(now + 0.28);

      // Layer C: Steel-on-Steel Abrasive Gouge / Plate Friction Scratch
      if (this.noiseBuffer) {
        const scratchNode = this.ctx.createBufferSource();
        const scratchFilter = this.ctx.createBiquadFilter();
        const scratchGain = this.ctx.createGain();
        scratchNode.buffer = this.noiseBuffer;
        scratchFilter.type = 'bandpass';
        scratchFilter.frequency.setValueAtTime(isHardClash ? 3600 : 2200, now);
        scratchFilter.Q.setValueAtTime(3.2, now);
        const scratchVol = Math.min(0.45, 0.22 * scale);
        scratchGain.gain.setValueAtTime(scratchVol, now);
        scratchGain.gain.exponentialRampToValueAtTime(0.001, now + (isHardClash ? 0.18 : 0.11));
        scratchNode.connect(scratchFilter);
        scratchFilter.connect(scratchGain);
        scratchGain.connect(dest);
        scratchNode.start(now);
        scratchNode.stop(now + 0.20);
      }

      // Layer D: Deep Kinetic Impact Punch (Sub-bass shockwave)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(92, now);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.20);
      const subVol = Math.min(0.60, 0.26 * scale);
      subGain.gain.setValueAtTime(subVol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      subOsc.stop(now + 0.24);
    },

    // 1. Heavy Multi-Layered Kinetic Hit
    hitSound(intensity = 1, isWeapon = false) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;
      const scale = Math.min(2.5, Math.max(0.4, intensity));

      // Layer A: Sub-Bass Body Slam Boom (Punch)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(85, now);
      subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.22);
      subGain.gain.setValueAtTime(Math.min(0.55, 0.22 * scale), now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      subOsc.stop(now + 0.25);

      // Layer B: Resonant Steel Anvil Strike (Ring)
      const ringOsc = this.ctx.createOscillator();
      const ringFilter = this.ctx.createBiquadFilter();
      const ringGain = this.ctx.createGain();
      ringOsc.type = 'triangle';
      ringOsc.frequency.setValueAtTime(isWeapon ? 1280 : 540, now);
      ringFilter.type = 'bandpass';
      ringFilter.frequency.setValueAtTime(isWeapon ? 1600 : 780, now);
      ringFilter.Q.setValueAtTime(4.2, now);
      ringGain.gain.setValueAtTime(Math.min(0.40, 0.16 * scale), now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      ringOsc.connect(ringFilter);
      ringFilter.connect(ringGain);
      ringGain.connect(dest);
      ringOsc.start(now);
      ringOsc.stop(now + 0.20);

      // Layer C: Armor Deformation & Metal Crunch Burst
      if (this.noiseBuffer) {
        const crunchNode = this.ctx.createBufferSource();
        const crunchFilter = this.ctx.createBiquadFilter();
        const crunchGain = this.ctx.createGain();
        crunchNode.buffer = this.noiseBuffer;
        crunchFilter.type = 'bandpass';
        crunchFilter.frequency.setValueAtTime(isWeapon ? 2200 : 1300, now);
        crunchFilter.Q.setValueAtTime(2.2, now);
        crunchGain.gain.setValueAtTime(Math.min(0.45, 0.18 * scale), now);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + (isWeapon ? 0.15 : 0.10));
        crunchNode.connect(crunchFilter);
        crunchFilter.connect(crunchGain);
        crunchGain.connect(dest);
        crunchNode.start(now);
        crunchNode.stop(now + 0.16);
      }
    },

    // 2. High-Speed Tooth Gouge & Sparks Grinding
    weaponSliceSound() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // High dissonant metal shear
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1350 + Math.random() * 300, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.09);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(3.0, now);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.11);

      // High-frequency friction sparks spray
      if (this.noiseBuffer) {
        const sNode = this.ctx.createBufferSource();
        const sFilter = this.ctx.createBiquadFilter();
        const sGain = this.ctx.createGain();
        sNode.buffer = this.noiseBuffer;
        sFilter.type = 'highpass';
        sFilter.frequency.setValueAtTime(3200, now);
        sGain.gain.setValueAtTime(0.24, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        sNode.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(dest);
        sNode.start(now);
        sNode.stop(now + 0.13);
      }
    },

    // 3. Kinetic Weapon Stall Shudder & Groan
    weaponStallSound() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.24);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.26);

      // Brake shudder noise
      if (this.noiseBuffer) {
        const bNode = this.ctx.createBufferSource();
        const bFilter = this.ctx.createBiquadFilter();
        const bGain = this.ctx.createGain();
        bNode.buffer = this.noiseBuffer;
        bFilter.type = 'lowpass';
        bFilter.frequency.setValueAtTime(500, now);
        bGain.gain.setValueAtTime(0.26, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        bNode.connect(bFilter);
        bFilter.connect(bGain);
        bGain.connect(dest);
        bNode.start(now);
        bNode.stop(now + 0.19);
      }
    },

    // 3.5 Exciting Esports Tournament Countdown Beats (3... 2... 1...)
    countdownBeat(step) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // Pitch progression building intense tension:
      // Step 3: Low-mid power pulse (E4 = 330 Hz, Sub: 160Hz -> 42Hz)
      // Step 2: Rising alert pulse (G#4 = 415 Hz, Sub: 185Hz -> 45Hz)
      // Step 1: High peak anticipation pulse (B4 = 494 Hz, Sub: 215Hz -> 48Hz)
      let baseFreq = 330;
      let overtoneFreq = 660;
      let subStart = 160;
      let pulseGain = 0.30;

      if (step === 2) {
        baseFreq = 415;
        overtoneFreq = 830;
        subStart = 185;
        pulseGain = 0.34;
      } else if (step === 1) {
        baseFreq = 494;
        overtoneFreq = 988;
        subStart = 215;
        pulseGain = 0.38;
      }

      // 1. Heavy Sub-Bass Heartbeat Impact Punch (Tactile chest thud)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(subStart, now);
      subOsc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      subGain.gain.setValueAtTime(0.35, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      subOsc.stop(now + 0.22);

      // 2. Harmonic Sci-Fi Tension Synthesizer Chord & Tournament Horn (Crisp attack, resonant body)
      if (step === 3) {
        // High-energy tournament kickoff horn layer on "3"
        const hornOsc1 = this.ctx.createOscillator();
        const hornOsc2 = this.ctx.createOscillator();
        const hornFilter = this.ctx.createBiquadFilter();
        const hornGain = this.ctx.createGain();
        hornOsc1.type = 'sawtooth';
        hornOsc2.type = 'sawtooth';
        hornOsc1.frequency.setValueAtTime(220, now);
        hornOsc2.frequency.setValueAtTime(330, now);
        hornFilter.type = 'lowpass';
        hornFilter.frequency.setValueAtTime(800, now);
        hornFilter.Q.setValueAtTime(2.2, now);
        hornGain.gain.setValueAtTime(0.0001, now);
        hornGain.gain.linearRampToValueAtTime(0.32, now + 0.02);
        hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        hornOsc1.connect(hornFilter);
        hornOsc2.connect(hornFilter);
        hornFilter.connect(hornGain);
        hornGain.connect(dest);
        hornOsc1.start(now);
        hornOsc2.start(now);
        hornOsc1.stop(now + 0.35);
        hornOsc2.stop(now + 0.35);
      }

      const osc1 = this.ctx.createOscillator();
      const filter1 = this.ctx.createBiquadFilter();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(baseFreq, now);
      filter1.type = 'bandpass';
      filter1.frequency.setValueAtTime(baseFreq * 1.8, now);
      filter1.Q.setValueAtTime(4.2, now);
      gain1.gain.setValueAtTime(pulseGain, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc1.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.28);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(overtoneFreq, now);
      gain2.gain.setValueAtTime(pulseGain * 0.75, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.start(now);
      osc2.stop(now + 0.24);

      // 3. Tension Shimmer / Acoustic Air Whoosh
      if (this.noiseBuffer) {
        const nNode = this.ctx.createBufferSource();
        const nFilter = this.ctx.createBiquadFilter();
        const nGain = this.ctx.createGain();
        nNode.buffer = this.noiseBuffer;
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(baseFreq * 2.5, now);
        nFilter.Q.setValueAtTime(3.0, now);
        nGain.gain.setValueAtTime(0.08, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        nNode.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(dest);
        nNode.start(now);
        nNode.stop(now + 0.18);
      }
    },

    // 4. Official BattleBots Arena Match Buzzer & Pyrotechnic Fight Start Shockwave
    arenaBuzzer() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // Layer A: Massive Stadium Sub-Boom Impact Shockwave (40Hz chest thud)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(120, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.65);
      subGain.gain.setValueAtTime(0.48, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      subOsc.stop(now + 0.80);

      // Layer B: Dual-Sawtooth Arena Klaxon Horn
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(136, now); // G2
      osc2.frequency.setValueAtTime(204, now); // D3 (Musical fifth)

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(820, now);
      filter.Q.setValueAtTime(2.2, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.42, now + 0.02);
      gain.gain.setValueAtTime(0.42, now + 0.85);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.30);
      osc2.stop(now + 1.30);

      // Layer C: Pyrotechnic Flame Cannon Blast / Stadium Spark Burst
      if (this.noiseBuffer) {
        const pyroNode = this.ctx.createBufferSource();
        const pyroFilter = this.ctx.createBiquadFilter();
        const pyroGain = this.ctx.createGain();
        pyroNode.buffer = this.noiseBuffer;
        pyroFilter.type = 'bandpass';
        pyroFilter.frequency.setValueAtTime(1600, now);
        pyroFilter.frequency.exponentialRampToValueAtTime(450, now + 0.40);
        pyroFilter.Q.setValueAtTime(2.2, now);
        pyroGain.gain.setValueAtTime(0.24, now);
        pyroGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        pyroNode.connect(pyroFilter);
        pyroFilter.connect(pyroGain);
        pyroGain.connect(dest);
        pyroNode.start(now);
        pyroNode.stop(now + 0.50);
      }
    },

    // 5. Tire Skid / Floor Drift Screech
    tireSkid(speed = 1) {
      if (!this.ctx || !this.noiseBuffer) return;
      const now = performance.now();
      if (now - this.lastSkidTime < 240) return;
      this.lastSkidTime = now;

      const actNow = this.ctx.currentTime;
      const sNode = this.ctx.createBufferSource();
      const sFilter = this.ctx.createBiquadFilter();
      const sGain = this.ctx.createGain();
      sNode.buffer = this.noiseBuffer;
      sFilter.type = 'bandpass';
      sFilter.frequency.setValueAtTime(2600 + Math.random() * 400, actNow);
      sFilter.Q.setValueAtTime(3.8, actNow);
      const vol = Math.min(0.20, 0.08 * speed);
      sGain.gain.setValueAtTime(vol, actNow);
      sGain.gain.exponentialRampToValueAtTime(0.001, actNow + 0.14);
      sNode.connect(sFilter);
      sFilter.connect(sGain);
      sGain.connect(this.masterGain || this.ctx.destination);
      sNode.start(actNow);
      sNode.stop(actNow + 0.15);
    },

    // 6. Realistic Thermal Ember Snap & LiPo Cell Rupture Pop
    playFireCrackle() {
      if (!this.ctx || this.fireSoundEnabled === false) return;
      const now = performance.now();
      // Natural, organic cadence (~3-5 pops per second instead of 15/sec machine-gun)
      if (now - this.lastCrackleTime < 180 + Math.random() * 140) return;
      this.lastCrackleTime = now;

      const actNow = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // Layer A: Soft organic ember pop (damped bandpass noise burst, 550-1200 Hz, fast 25ms decay)
      if (this.noiseBuffer && Math.random() < 0.70) {
        const nNode = this.ctx.createBufferSource();
        const nFilter = this.ctx.createBiquadFilter();
        const nGain = this.ctx.createGain();
        nNode.buffer = this.noiseBuffer;
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(550 + Math.random() * 650, actNow);
        nFilter.Q.setValueAtTime(3.8, actNow);
        nGain.gain.setValueAtTime(0.024 + Math.random() * 0.018, actNow);
        nGain.gain.exponentialRampToValueAtTime(0.0001, actNow + 0.028);
        nNode.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(dest);
        nNode.start(actNow);
        nNode.stop(actNow + 0.035);
      }

      // Layer B: Miniature thermal cell rupture "whump" / puff (sub-mid pitch drop 160Hz -> 45Hz)
      if (Math.random() < 0.40) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle'; // Warm organic hollow tone, ZERO harsh buzzy sawtooth
        osc.frequency.setValueAtTime(160 + Math.random() * 50, actNow);
        osc.frequency.exponentialRampToValueAtTime(45, actNow + 0.035);
        gain.gain.setValueAtTime(0.032, actNow);
        gain.gain.exponentialRampToValueAtTime(0.0001, actNow + 0.04);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(actNow);
        osc.stop(actNow + 0.045);
      }
    },

    // 6.5 Official BattleBots Referee Immobilization / Count-Out Warning Horn
    refereeWarningHorn() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // Authoritative dual-blast emergency referee horn ("BWAAP! ... BWAAP!")
      // Signalling 10-second count-out to K.O. — creates high-stakes panic to recover
      const blasts = [0.0, 0.22];
      const hornF1 = 280; // D4
      const hornF2 = 420; // A4 (Resonant fifth)

      blasts.forEach((offset, idx) => {
        const t = now + offset;
        const dur = (idx === 0) ? 0.16 : 0.30;

        // Sub-bass arena chest thud
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(115, t);
        subOsc.frequency.exponentialRampToValueAtTime(42, t + dur);
        subGain.gain.setValueAtTime(0.38, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        subOsc.connect(subGain);
        subGain.connect(dest);
        subOsc.start(t);
        subOsc.stop(t + dur + 0.02);

        // Dual detuned sawtooth emergency klaxon horn
        const oscA = this.ctx.createOscillator();
        const oscB = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        oscA.type = 'sawtooth';
        oscB.type = 'sawtooth';
        oscA.frequency.setValueAtTime(hornF1, t);
        oscB.frequency.setValueAtTime(hornF2, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(920, t);
        filter.Q.setValueAtTime(2.8, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.38, t + 0.015);
        gain.gain.setValueAtTime(0.38, t + dur * 0.75);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        oscA.start(t);
        oscB.start(t);
        oscA.stop(t + dur + 0.02);
        oscB.stop(t + dur + 0.02);
      });
    },

    // 7. Referee Countdown Pip (Ticks every second during 10s count-out with escalating pitch)
    alarmBeep(sec = 10) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      const isCritical = (sec <= 3);
      // Pitch climbs steadily as seconds tick down (780 Hz -> 1174 Hz) to ratchet up tension
      const freq = isCritical ? 1174 : (760 + (10 - sec) * 38);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isCritical ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (isCritical) {
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.08);
      }
      const vol = isCritical ? 0.32 : 0.22;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isCritical ? 0.12 : 0.08));
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + (isCritical ? 0.13 : 0.09));
    },

    // 8. General UI Click / Tone Beep
    beep(freq = 520, duration = 0.12, type = 'sine', gainVal = 0.14) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    },

    lungeSound() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);
      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    },

    selfRightSound() {
      if (!this.ctx) return;
      this.beep(280, 0.08, 'square', 0.18);
      this.beep(440, 0.14, 'sawtooth', 0.20);
    },

    winFanfare() {
      if (!this.ctx) return;
      [440, 554, 659, 880].forEach((f, idx) => {
        setTimeout(() => this.beep(f, 0.28, 'triangle', 0.18), idx * 110);
      });
    },

    loseSound() {
      if (!this.ctx) return;
      [330, 290, 240, 180].forEach((f, idx) => {
        setTimeout(() => this.beep(f, 0.32, 'sawtooth', 0.2), idx * 130);
      });
    },

    // 9. Synthesized Stadium Crowd Roar / Arena Cheering
    crowdCheer(intensity = 1.0, duration = 1.8) {
      if (!this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      // Layer A: Low-mid vocal crowd resonance swell (620Hz)
      const nNodeA = this.ctx.createBufferSource();
      const nFilterA = this.ctx.createBiquadFilter();
      const nGainA = this.ctx.createGain();
      nNodeA.buffer = this.noiseBuffer;
      nFilterA.type = 'bandpass';
      nFilterA.frequency.setValueAtTime(620, now);
      nFilterA.Q.setValueAtTime(2.4, now);
      const volA = Math.min(0.35, 0.20 * intensity);
      nGainA.gain.setValueAtTime(0.001, now);
      nGainA.gain.linearRampToValueAtTime(volA, now + 0.18);
      nGainA.gain.exponentialRampToValueAtTime(0.001, now + duration);
      nNodeA.connect(nFilterA);
      nFilterA.connect(nGainA);
      nGainA.connect(dest);
      nNodeA.start(now);
      nNodeA.stop(now + duration + 0.05);

      // Layer B: Bright excitement crowd formant (1650Hz)
      const nNodeB = this.ctx.createBufferSource();
      const nFilterB = this.ctx.createBiquadFilter();
      const nGainB = this.ctx.createGain();
      nNodeB.buffer = this.noiseBuffer;
      nFilterB.type = 'bandpass';
      nFilterB.frequency.setValueAtTime(1650, now);
      nFilterB.Q.setValueAtTime(3.2, now);
      const volB = Math.min(0.24, 0.13 * intensity);
      nGainB.gain.setValueAtTime(0.001, now);
      nGainB.gain.linearRampToValueAtTime(volB, now + 0.22);
      nGainB.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);
      nNodeB.connect(nFilterB);
      nFilterB.connect(nGainB);
      nGainB.connect(dest);
      nNodeB.start(now);
      nNodeB.stop(now + duration + 0.05);
    },

    // 10. Synthesized Arena Crowd Gasp / Collective Shock ("OHHH!")
    crowdGasp(intensity = 0.8) {
      if (!this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const dest = this.masterGain || this.ctx.destination;

      const nNode = this.ctx.createBufferSource();
      const nFilter = this.ctx.createBiquadFilter();
      const nGain = this.ctx.createGain();
      nNode.buffer = this.noiseBuffer;
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(450, now);
      nFilter.frequency.exponentialRampToValueAtTime(820, now + 0.14);
      nFilter.Q.setValueAtTime(2.8, now);
      const vol = Math.min(0.28, 0.16 * intensity);
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(vol, now + 0.08);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      nNode.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(dest);
      nNode.start(now);
      nNode.stop(now + 0.45);
    }
  };

  // ========================================================
  // 1.6 COMBAT IMPACT JUICE: CAMERA SHAKE, GAMEPAD RUMBLE, HIT-STOP
  // ========================================================
  let cameraTrauma = 0.0;
  let hitStopRemaining = 0.0;

  function addCameraTrauma(amount) {
    if (typeof matchState !== 'undefined' && matchState === 'menu') {
      cameraTrauma = Math.min(0.22, cameraTrauma + amount * 0.22);
      return;
    }
    cameraTrauma = Math.min(1.0, cameraTrauma + amount);
  }

  function triggerHitStop(durationSec = 0.055) {
    if (typeof matchState !== 'undefined' && matchState === 'menu') return;
    hitStopRemaining = Math.max(hitStopRemaining, durationSec);
  }

  function triggerGamepadRumble(intensity = 0.7, durationMs = 200) {
    if (typeof matchState !== 'undefined' && matchState === 'menu') return;
    // 1. Dual-Motor Gamepad Haptics (Xbox / PlayStation / USB Controller)
    if (typeof navigator.getGamepads === 'function') {
      try {
        const pads = navigator.getGamepads();
        if (pads) {
          for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (pad && pad.connected && pad.vibrationActuator && pad.vibrationActuator.type === 'dual-rumble') {
              pad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: Math.min(1000, durationMs),
                weakMagnitude: Math.min(1.0, intensity * 0.75),
                strongMagnitude: Math.min(1.0, intensity)
              }).catch(() => {});
            }
          }
        }
      } catch (err) {}
    }

    // 2. Mobile Device Vibration Haptics
    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(Math.min(350, durationMs));
      } catch (err) {}
    }
  }

  window.addCameraTrauma = addCameraTrauma;
  window.triggerHitStop = triggerHitStop;
  window.triggerGamepadRumble = triggerGamepadRumble;

  // Global pointer/keyboard interaction triggers to unlock AudioContext seamlessly
  const unlockAudioContext = () => {
    AudioSys.init();
    if (AudioSys.ctx && AudioSys.ctx.state === 'running') {
      if (BgmSys.enabled && !BgmSys.isPlaying) BgmSys.start();
      BgmSys.updateUI();
    }
  };
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
    window.addEventListener(evt, unlockAudioContext, { passive: true });
  });

