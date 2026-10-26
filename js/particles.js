// ========================================================
// BATTLEBOTx - SPARKS, DEBRIS & FLAME SIMULATION
// ========================================================

  // ========================================================
  // 5. SPARKS & DEBRIS
  // ========================================================
  const sparks = [];
  const detachedDebris = [];

  function spawnCollisionSparks(pos, count = 26) {
    if (typeof triggerImpactFlash === 'function') {
      triggerImpactFlash(pos, Math.min(4.8, 1.6 + count * 0.10));
    }
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.35 ? 0xfacc15 : 0xf97316
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.position.y += 0.45;
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 9.5;
      scene.add(m);
      sparks.push({
        mesh: m,
        vx: Math.cos(angle) * speed,
        vy: 3.0 + Math.random() * 6.5,
        vz: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.35
      });
    }
  }

  function detachArmorPiece(bot, impactDir, hitPoint) {
    const remaining = bot.armorPanels.filter(p => p.attached);
    if (remaining.length === 0) return;

    let chosen = remaining[0];

    if (hitPoint && remaining.length > 1) {
      // Find the armor panel closest to the collision impact point in bot local coordinates
      const localHit = bot.root.worldToLocal(hitPoint.clone());
      let minDistSq = Infinity;
      for (const panel of remaining) {
        const dSq = panel.mesh.position.distanceToSquared(localHit);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          chosen = panel;
        }
      }
    }

    chosen.attached = false;

    // Capture exact world position, orientation, and scale before removing
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    chosen.mesh.getWorldPosition(worldPos);
    chosen.mesh.getWorldQuaternion(worldQuat);
    chosen.mesh.getWorldScale(worldScale);

    // Detach from robot hierarchy
    if (chosen.mesh.parent) {
      chosen.mesh.parent.remove(chosen.mesh);
    }

    // Add directly to arena scene as physics debris
    chosen.mesh.position.copy(worldPos);
    chosen.mesh.quaternion.copy(worldQuat);
    chosen.mesh.scale.copy(worldScale);
    chosen.mesh.visible = true;
    scene.add(chosen.mesh);

    const flySpeed = 5.2 + Math.random() * 4.2;
    const outwardX = impactDir.x + (Math.random() - 0.5) * 0.4;
    const outwardZ = impactDir.z + (Math.random() - 0.5) * 0.4;
    const norm = Math.hypot(outwardX, outwardZ) || 1;

    detachedDebris.push({
      mesh: chosen.mesh,
      vx: (outwardX / norm) * flySpeed + (bot.vx * 0.35),
      vy: 4.8 + Math.random() * 3.2,
      vz: (outwardZ / norm) * flySpeed + (bot.vz * 0.35),
      rx: (Math.random() - 0.5) * 14,
      ry: (Math.random() - 0.5) * 14,
      rz: (Math.random() - 0.5) * 14
    });

    AudioSys.metalClashSound(1.8, true);
    spawnCollisionSparks(worldPos, 22);
    AudioSys.crowdGasp(0.75);
    addCameraTrauma(0.24);
    triggerGamepadRumble(0.55, 180);
  }

  function detachWheel(bot, impactDir, hitPoint) {
    if (!bot || !bot.wheels) return;
    const remaining = bot.wheels.filter(w => w.attached);
    if (remaining.length === 0) return;

    let chosen = remaining[0];
    if (hitPoint && remaining.length > 1) {
      const localHit = bot.root.worldToLocal(hitPoint.clone());
      let minDistSq = Infinity;
      for (const w of remaining) {
        const dSq = w.mesh.position.distanceToSquared(localHit);
        if (dSq < minDistSq) {
          minDistSq = dSq;
          chosen = w;
        }
      }
    } else {
      chosen = remaining[Math.floor(Math.random() * remaining.length)];
    }

    // REALISTIC ARMOR-FIRST PROTECTION:
    // Wheels are physically housed behind side armor panels.
    // If the side armor protecting this wheel is still attached, the armor absorbs the impact and detaches first!
    if (bot.armorPanels && bot.armorPanels.length > 0) {
      const side = chosen.side; // 'left' or 'right'
      const sideArmor = bot.armorPanels.find(p => {
        if (!p.attached) return false;
        const name = (p.name || '').toLowerCase();
        if (side === 'left') {
          return name.includes('side_l') || (name.includes('side') && name.includes('l')) || name.includes('wedge_l');
        } else {
          return name.includes('side_r') || (name.includes('side') && name.includes('r')) || name.includes('wedge_r');
        }
      });

      if (sideArmor) {
        // The protective side armor takes the blow and falls off first!
        detachArmorPiece(bot, impactDir, hitPoint);
        return;
      }
    }

    // Side armor is gone: wheel is directly exposed and can now be torn off!
    chosen.attached = false;

    // Capture exact world position, orientation, and scale before removing
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    chosen.mesh.getWorldPosition(worldPos);
    chosen.mesh.getWorldQuaternion(worldQuat);
    chosen.mesh.getWorldScale(worldScale);

    // Detach from robot hierarchy
    if (chosen.mesh.parent) {
      chosen.mesh.parent.remove(chosen.mesh);
    }

    // Add directly to arena scene as physics debris
    chosen.mesh.position.copy(worldPos);
    chosen.mesh.quaternion.copy(worldQuat);
    chosen.mesh.scale.copy(worldScale);
    chosen.mesh.visible = true;
    scene.add(chosen.mesh);

    const flySpeed = 5.8 + Math.random() * 4.4;
    const outwardX = impactDir.x + (Math.random() - 0.5) * 0.45;
    const outwardZ = impactDir.z + (Math.random() - 0.5) * 0.45;
    const norm = Math.hypot(outwardX, outwardZ) || 1;

    detachedDebris.push({
      mesh: chosen.mesh,
      isWheel: true,
      vx: (outwardX / norm) * flySpeed + (bot.vx * 0.4),
      vy: 4.2 + Math.random() * 3.6,
      vz: (outwardZ / norm) * flySpeed + (bot.vz * 0.4),
      rx: (Math.random() - 0.5) * 16,
      ry: (Math.random() - 0.5) * 16,
      rz: (Math.random() - 0.5) * 16
    });

    AudioSys.metalClashSound(1.9, true);
    spawnCollisionSparks(worldPos, 34);
    AudioSys.crowdGasp(0.85);
    addCameraTrauma(0.35);
    triggerGamepadRumble(0.75, 240);
  }

  function clearArenaDebris() {
    while (sparks.length) {
      const s = sparks.pop();
      scene.remove(s.mesh);
    }
    while (detachedDebris.length) {
      const d = detachedDebris.pop();
      scene.remove(d.mesh);
    }
    clearBotFlames();

  }

  // ========================================================
  // 5.1 TOURNAMENT FLAME & SMOKE PARTICLE SYSTEM (80%+ DAMAGE)
  // ========================================================
  const playerFireLight = new THREE.PointLight(0xff5500, 0, 10, 1.8);
  scene.add(playerFireLight);
  const enemyFireLight = new THREE.PointLight(0xff5500, 0, 10, 1.8);
  scene.add(enemyFireLight);

  function createProceduralFireTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');    // White hot core
    grad.addColorStop(0.20, 'rgba(255, 220, 60, 0.95)');   // Intense yellow
    grad.addColorStop(0.46, 'rgba(255, 100, 15, 0.75)');   // Fire hazard orange
    grad.addColorStop(0.76, 'rgba(215, 30, 0, 0.35)');     // Red perimeter
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function createProceduralSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(35, 35, 40, 0.70)');
    grad.addColorStop(0.35, 'rgba(55, 55, 60, 0.45)');
    grad.addColorStop(0.70, 'rgba(75, 75, 80, 0.18)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function createProceduralEmberTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0.0, 'rgba(255, 255, 220, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 185, 30, 0.9)');
    grad.addColorStop(0.80, 'rgba(255, 60, 0, 0.35)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  const fireTex = createProceduralFireTexture();
  const smokeTex = createProceduralSmokeTexture();
  const emberTex = createProceduralEmberTexture();

  const FIRE_POOL_SIZE = 90;
  const SMOKE_POOL_SIZE = 60;
  const EMBER_POOL_SIZE = 40;

  const firePool = [];
  const smokePool = [];
  const emberPool = [];

  for (let i = 0; i < FIRE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fireTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.95
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    firePool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1,
      vx: 0, vy: 0, vz: 0,
      baseScale: 1.0,
      turbPhase: Math.random() * Math.PI * 2
    });
  }

  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.50
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    smokePool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1,
      vx: 0, vy: 0, vz: 0,
      baseScale: 1.0,
      rotSpeed: (Math.random() - 0.5) * 2.2
    });
  }

  for (let i = 0; i < EMBER_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: emberTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    emberPool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1,
      vx: 0, vy: 0, vz: 0
    });
  }

  function spawnFlameParticle(pos, botVel) {
    const p = firePool.find(item => !item.active);
    if (!p) return;
    p.active = true;
    p.life = 0;
    p.maxLife = 0.34 + Math.random() * 0.28;
    p.sprite.visible = true;
    const jx = (Math.random() - 0.5) * 0.44;
    const jy = (Math.random() - 0.5) * 0.14;
    const jz = (Math.random() - 0.5) * 0.44;
    p.sprite.position.set(pos.x + jx, pos.y + jy, pos.z + jz);
    p.vx = (botVel ? botVel.x * 0.28 : 0) + (Math.random() - 0.5) * 0.75;
    p.vy = 2.6 + Math.random() * 3.2;
    p.vz = (botVel ? botVel.z * 0.28 : 0) + (Math.random() - 0.5) * 0.75;
    p.baseScale = 0.40 + Math.random() * 0.45;
    p.turbPhase = Math.random() * Math.PI * 2;
    p.sprite.material.color.setRGB(1, 1, 1);
    p.sprite.material.opacity = 0.95;
    p.sprite.scale.set(p.baseScale * 0.35, p.baseScale * 0.55, 1);
  }

  function spawnSmokeParticle(pos, botVel) {
    const s = smokePool.find(item => !item.active);
    if (!s) return;
    s.active = true;
    s.life = 0;
    s.maxLife = 0.95 + Math.random() * 0.75;
    s.sprite.visible = true;
    const jx = (Math.random() - 0.5) * 0.35;
    const jz = (Math.random() - 0.5) * 0.35;
    s.sprite.position.set(pos.x + jx, pos.y + 0.35, pos.z + jz);
    s.vx = (botVel ? botVel.x * 0.22 : 0) + (Math.random() - 0.5) * 0.45;
    s.vy = 1.3 + Math.random() * 1.6;
    s.vz = (botVel ? botVel.z * 0.22 : 0) + (Math.random() - 0.5) * 0.45;
    s.baseScale = 0.45 + Math.random() * 0.40;
    s.rotSpeed = (Math.random() - 0.5) * 2.0;
    s.sprite.material.rotation = Math.random() * Math.PI * 2;
    s.sprite.material.opacity = 0.50;
    s.sprite.scale.set(s.baseScale, s.baseScale, 1);
  }

  function spawnEmberParticle(pos, botVel) {
    const e = emberPool.find(item => !item.active);
    if (!e) return;
    e.active = true;
    e.life = 0;
    e.maxLife = 0.45 + Math.random() * 0.35;
    e.sprite.visible = true;
    e.sprite.position.set(pos.x, pos.y + 0.2, pos.z);
    e.vx = (botVel ? botVel.x * 0.4 : 0) + (Math.random() - 0.5) * 3.8;
    e.vy = 3.5 + Math.random() * 4.2;
    e.vz = (botVel ? botVel.z * 0.4 : 0) + (Math.random() - 0.5) * 3.8;
    const sc = 0.12 + Math.random() * 0.12;
    e.sprite.scale.set(sc, sc, 1);
    e.sprite.material.opacity = 1.0;
  }

  function getBotDamagePercent(bot) {
    if (!bot) return 0;
    const hpLoss = Math.max(0, Math.min(100, 100 - (bot.driveHealth ?? 100)));
    let armorLoss = hpLoss;
    if (bot.armorPanels && bot.armorPanels.length > 0) {
      const total = bot.armorPanels.length;
      const detached = bot.armorPanels.filter(p => !p.attached).length;
      armorLoss = (detached / total) * 100;
    }
    return Math.max(hpLoss, hpLoss * 0.70 + armorLoss * 0.30);
  }

  function isBotFlaming(bot) {
    return getBotDamagePercent(bot) >= 80;
  }

  function checkAndSpawnBotFlames(bot, fireLight, dt) {
    if (!bot || !bot.root) {
      if (fireLight) fireLight.intensity = 0;
      return false;
    }
    const burning = isBotFlaming(bot);
    if (burning) {
      if (fireLight) {
        fireLight.position.copy(bot.root.position);
        fireLight.position.y += 0.55;
        fireLight.intensity = 2.4 + (Math.random() - 0.5) * 1.2 + Math.sin(Date.now() * 0.032) * 0.8;
        fireLight.color.setHex(Math.random() > 0.4 ? 0xff5500 : 0xff7711);
      }

      const centerPos = bot.root.position.clone();
      centerPos.y += (bot.height || 0.6) * 0.42;
      const yaw = bot.yaw || 0;
      centerPos.x -= Math.sin(yaw) * 0.22;
      centerPos.z -= Math.cos(yaw) * 0.22;

      const botVel = { x: bot.vx || 0, z: bot.vz || 0 };

      spawnFlameParticle(centerPos, botVel);
      spawnFlameParticle(centerPos, botVel);
      if (Math.random() < 0.65) spawnSmokeParticle(centerPos, botVel);
      if (Math.random() < 0.28) spawnEmberParticle(centerPos, botVel);

      AudioSys.playFireCrackle();
      return true;
    } else {
      if (fireLight) fireLight.intensity = 0;
      return false;
    }
  }

  function updateFlames(dt) {
    for (const p of firePool) {
      if (!p.active) continue;
      p.life += dt;
      const progress = p.life / p.maxLife;
      if (progress >= 1.0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.turbPhase += dt * 8.0;
      const turbX = Math.sin(p.turbPhase) * 0.45;
      const turbZ = Math.cos(p.turbPhase * 1.25) * 0.45;
      p.sprite.position.x += (p.vx + turbX) * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += (p.vz + turbZ) * dt;
      p.vy -= 1.8 * dt;

      let scaleFactor;
      if (progress < 0.22) {
        scaleFactor = (progress / 0.22) * 1.15;
      } else {
        scaleFactor = 1.15 * (1.0 - (progress - 0.22) / 0.78 * 0.65);
      }
      const curScale = p.baseScale * Math.max(0.12, scaleFactor);
      p.sprite.scale.set(curScale * 0.82, curScale * 1.48, 1);

      if (progress < 0.18) {
        p.sprite.material.color.setRGB(1.0, 0.98, 0.85);
      } else if (progress < 0.52) {
        p.sprite.material.color.setRGB(1.0, 0.58, 0.08);
      } else if (progress < 0.78) {
        p.sprite.material.color.setRGB(0.92, 0.16, 0.04);
      } else {
        p.sprite.material.color.setRGB(0.32, 0.06, 0.02);
      }

      p.sprite.material.opacity = Math.max(0, 1.0 - Math.pow(progress, 1.4));
    }

    for (const s of smokePool) {
      if (!s.active) continue;
      s.life += dt;
      const progress = s.life / s.maxLife;
      if (progress >= 1.0) {
        s.active = false;
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.x += s.vx * dt;
      s.sprite.position.y += s.vy * dt;
      s.sprite.position.z += s.vz * dt;
      s.vy *= Math.pow(0.85, dt);
      s.sprite.material.rotation += s.rotSpeed * dt;
      const curScale = s.baseScale * (0.65 + progress * 2.4);
      s.sprite.scale.set(curScale, curScale, 1);
      s.sprite.material.opacity = Math.max(0, 0.50 * (1.0 - progress));
    }

    for (const e of emberPool) {
      if (!e.active) continue;
      e.life += dt;
      const progress = e.life / e.maxLife;
      if (progress >= 1.0) {
        e.active = false;
        e.sprite.visible = false;
        continue;
      }
      e.vy -= 14.0 * dt;
      e.sprite.position.x += e.vx * dt;
      e.sprite.position.y += e.vy * dt;
      e.sprite.position.z += e.vz * dt;
      if (e.sprite.position.y < 0.04) {
        e.sprite.position.y = 0.04;
        e.vy *= -0.32;
      }
      e.sprite.material.opacity = Math.max(0, 1.0 - progress);
    }
  }

  function clearBotFlames() {
    for (const p of firePool) { p.active = false; p.sprite.visible = false; }
    for (const s of smokePool) { s.active = false; s.sprite.visible = false; }
    for (const e of emberPool) { e.active = false; e.sprite.visible = false; }
    if (playerFireLight) playerFireLight.intensity = 0;
    if (enemyFireLight) enemyFireLight.intensity = 0;
  }

  // Expose inspection & dev testing helpers on window
  window.getBotDamagePercent = getBotDamagePercent;
  window.isBotFlaming = isBotFlaming;
  window.testDamageBot = (bot = playerBot, hp = 15) => {
    if (bot) {
      bot.driveHealth = hp;
      console.log(`Set ${bot === playerBot ? 'Player' : 'Enemy'} HP to ${hp}. Damage: ${getBotDamagePercent(bot).toFixed(1)}%. Flaming: ${isBotFlaming(bot)}`);
    }
  };

