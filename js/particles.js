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

  // ========================================================
  // 5. PROGRESSIVE 1-BY-1 PIECE DETACHMENT & EXPLOSION SYSTEM
  // (Outside-in breakdown progression + 20% catastrophic explosion)
  // ========================================================
  function initBotDetachableParts(bot) {
    if (!bot || !bot.tiltGroup) return;
    bot.detachableParts = [];

    const meshes = [];
    bot.tiltGroup.traverse(obj => {
      if (obj.isMesh && obj.name !== 'CAD_Outline') {
        meshes.push(obj);
      }
    });

    meshes.forEach(obj => {
      const name = obj.name || '';
      const parentName = obj.parent ? (obj.parent.name || '') : '';

      // Compute bounding box and local radial distance relative to bot.root
      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const localCenter = bot.root ? bot.root.worldToLocal(center.clone()) : center.clone();
      const radialDist = Math.hypot(localCenter.x, localCenter.z);

      const isGenuineWheel = (
        name.startsWith('Wheel_') || name.includes('Wheel') ||
        name.includes('Tire') || name.includes('Rim') ||
        parentName.startsWith('Wheel_') || parentName.includes('Wheel') ||
        parentName.startsWith('Belt_') || parentName.includes('Belt') ||
        ((typeof isWheelMesh === 'function' && isWheelMesh(obj)) && (radialDist > 0.55 || name.includes('Wheel')))
      );
      const isWeapon = (
        name.startsWith('Weapon_') || name.includes('Weapon') ||
        name.includes('Blade') || name.includes('Drum') ||
        name.includes('Disc') || name.includes('Spinner') ||
        parentName.startsWith('Weapon_') || parentName.includes('Weapon')
      );
      const isArmor = (
        name.startsWith('Armor_') || name.includes('Armor') ||
        name.includes('Wedge') || name.includes('Shield') ||
        name.includes('Bumper') || name.includes('Skirt')
      );
      const isCore = (name === 'Chassis_Mesh' || name === 'Chassis_Mesh_1' || name === 'Chassis_Core');

      // Realistic outside-to-inside progression:
      // Priority 1: Outermost boundary elements — Wheels, exterior armor panels, wedges, shields, bumpers
      // Priority 2: Exterior chassis cladding, top covers, front weapon blade
      // Priority 3: Mid-chassis structure, secondary brackets, weapon mounts
      // Priority 4: Inner chassis frame & motor mounts
      // Priority 5: Innermost central core chassis spine
      let category = 'chassis';
      let priority = 3;

      if (isCore) {
        category = 'chassis_core';
        priority = 5; // Innermost structural spine remains until the absolute core
      } else if (isGenuineWheel) {
        category = 'wheel';
        priority = 1; // Wheels are on the far lateral outside! Struck early when hit on flanks/sides.
      } else if (isArmor) {
        category = 'armor';
        priority = 1; // Outermost armor panels, wedges & bumpers take initial exterior impacts
      } else if (isWeapon) {
        category = 'weapon';
        priority = (radialDist > 0.70) ? 2 : 3;
      } else {
        if (radialDist > 0.75) {
          category = 'chassis_exterior';
          priority = 2; // Outer chassis panels
        } else if (radialDist > 0.40) {
          category = 'chassis_mid';
          priority = 3; // Mid chassis structure
        } else {
          category = 'chassis_inner';
          priority = 4; // Inner chassis frame
        }
      }

      bot.detachableParts.push({
        name: name,
        parentName: parentName,
        mesh: obj,
        category: category,
        priority: priority,
        radialDist: radialDist,
        localCenter: localCenter,
        attached: true
      });
    });

    bot.totalInitialParts = Math.max(1, bot.detachableParts.length);
    bot.maxDriveHealth = bot.totalInitialParts * 10;
    bot.driveHealth = bot.maxDriveHealth;
  }
  window.initBotDetachableParts = initBotDetachableParts;

  function explodeRobot(bot, impactDir = { x: 0, z: 1 }, hitPoint = null) {
    if (!bot || bot.isEntirelyDestroyed) return [];
    if (!bot.detachableParts || bot.detachableParts.length === 0) {
      initBotDetachableParts(bot);
    }
    const remaining = bot.detachableParts ? bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent) : [];
    if (remaining.length === 0) {
      bot.isEntirelyDestroyed = true;
      bot.driveHealth = 0;
      bot.drivePower = 0;
      return [];
    }

    const botPos = new THREE.Vector3();
    if (bot.root) bot.root.getWorldPosition(botPos);

    const explodedParts = [];

    // Detach all remaining parts simultaneously in a massive radial blast!
    remaining.forEach(p => {
      p.attached = false;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      p.mesh.getWorldPosition(worldPos);
      p.mesh.getWorldQuaternion(worldQuat);
      p.mesh.getWorldScale(worldScale);

      // Remove outline children
      if (p.mesh.children && p.mesh.children.length > 0) {
        const toRemove = p.mesh.children.filter(c => c.name === 'CAD_Outline' || c.isLineSegments);
        toRemove.forEach(c => p.mesh.remove(c));
      }

      if (p.mesh.parent) {
        p.mesh.parent.remove(p.mesh);
      }

      p.mesh.position.copy(worldPos);
      p.mesh.quaternion.copy(worldQuat);
      p.mesh.scale.copy(worldScale);
      p.mesh.visible = true;
      scene.add(p.mesh);

      // Radial blast outward from bot center
      const blastDx = (worldPos.x - botPos.x) + (Math.random() - 0.5) * 0.8 + (impactDir.x || 0) * 0.5;
      const blastDz = (worldPos.z - botPos.z) + (Math.random() - 0.5) * 0.8 + (impactDir.z || 0) * 0.5;
      const blastDist = Math.hypot(blastDx, blastDz) || 1.0;
      const blastSpeed = 8.5 + Math.random() * 6.5;

      const isWheelPart = (p.category === 'wheel' || (typeof isWheelMesh === 'function' && isWheelMesh(p.mesh)));

      detachedDebris.push({
        mesh: p.mesh,
        isWheel: isWheelPart,
        vx: (blastDx / blastDist) * blastSpeed + (bot.vx ? bot.vx * 0.35 : 0),
        vy: 5.5 + Math.random() * 4.5,
        vz: (blastDz / blastDist) * blastSpeed + (bot.vz ? bot.vz * 0.35 : 0),
        rx: (Math.random() - 0.5) * 26,
        ry: (Math.random() - 0.5) * 26,
        rz: (Math.random() - 0.5) * 26
      });

      explodedParts.push(p);
    });

    // Synchronize legacy structures
    if (bot.armorPanels) {
      bot.armorPanels.forEach(a => { a.attached = false; });
    }
    if (bot.wheels) {
      bot.wheels.forEach(w => { w.attached = false; });
    }

    // Robot completely dismantled
    bot.isEntirelyDestroyed = true;
    bot.driveHealth = 0;
    bot.drivePower = 0;
    bot.throttleInput = 0;
    bot.steerInput = 0;
    bot.weaponSpinSpeed = 0;
    bot.weaponActive = false;

    // Catastrophic explosion FX
    const explosionCenter = hitPoint || botPos;
    spawnCollisionSparks(explosionCenter, 95);
    if (typeof AudioSys !== 'undefined') {
      if (AudioSys.metalClashSound) AudioSys.metalClashSound(3.0, true);
      if (AudioSys.weaponStallSound) AudioSys.weaponStallSound();
      if (AudioSys.crowdCheer) AudioSys.crowdCheer(1.0, 5.0);
    }
    if (typeof addCameraTrauma === 'function') addCameraTrauma(1.0);
    if (typeof triggerGamepadRumble === 'function') triggerGamepadRumble(1.0, 500);
    if (typeof triggerHitStop === 'function') triggerHitStop(0.08);
    if (typeof triggerDamageVignette === 'function') triggerDamageVignette();

    if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
      NetworkSys.queueEvent({ t: 'sparks', x: explosionCenter.x, y: explosionCenter.y, z: explosionCenter.z, c: 95 });
      NetworkSys.queueEvent({ t: 'clash', i: 3.0, h: true });
    }

    return explodedParts;
  }
  window.explodeRobot = explodeRobot;

  function detachSinglePart(bot, impactDir = { x: 0, z: 1 }, hitPoint = null) {
    if (!bot || bot.isEntirelyDestroyed) return null;
    if (!bot.detachableParts || bot.detachableParts.length === 0) {
      initBotDetachableParts(bot);
    }
    if (!bot.detachableParts || bot.detachableParts.length === 0) return null;

    const remaining = bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent);
    if (remaining.length === 0) {
      if (!bot.isEntirelyDestroyed) {
        bot.isEntirelyDestroyed = true;
        bot.driveHealth = 0;
        bot.drivePower = 0;
        bot.weaponSpinSpeed = 0;
        bot.weaponActive = false;
        if (typeof AudioSys !== 'undefined' && AudioSys.crowdCheer) AudioSys.crowdCheer(1.0, 3.5);
      }
      return null;
    }

    // 20% EXPLOSION RULE per user specification:
    // If <= 20% parts remain and the robot gets hit, IT JUST EXPLODES!
    const threshold20 = Math.max(1, Math.round(bot.totalInitialParts * 0.20));
    if (remaining.length <= threshold20) {
      explodeRobot(bot, impactDir, hitPoint);
      return null;
    }

    // Progressive demolition by layer (Outside-In):
    // (Layer 1 Armor & Wheels -> Layer 2 Exterior Cladding & Blade -> Layer 3 Mid Structure -> Layer 4 Inner Frame -> Layer 5 Core Spine)
    const minPriority = Math.min(...remaining.map(p => p.priority));
    let candidatePool = remaining.filter(p => p.priority <= minPriority + 1);

    let chosen = null;
    if (hitPoint) {
      // Precision strike: select candidate part whose world center is closest to impact point!
      let minDistSq = Infinity;
      const partCenter = new THREE.Vector3();
      const pBox = new THREE.Box3();

      for (const p of candidatePool) {
        pBox.setFromObject(p.mesh);
        pBox.getCenter(partCenter);
        const dSq = partCenter.distanceToSquared(hitPoint);
        const priorityPenalty = (p.priority - minPriority) * 0.75;
        const effectiveDistSq = dSq + priorityPenalty;
        if (effectiveDistSq < minDistSq) {
          minDistSq = effectiveDistSq;
          chosen = p;
        }
      }
    }

    if (!chosen) {
      // Fallback: outermost radial distance first within lowest priority layer
      const pool = remaining.filter(p => p.priority === minPriority);
      pool.sort((a, b) => (b.radialDist || 0) - (a.radialDist || 0));
      chosen = pool[0];
    }

    chosen.attached = false;

    // Synchronize legacy armor and wheel arrays
    if (bot.armorPanels) {
      const ap = bot.armorPanels.find(p => p.mesh === chosen.mesh || p.name === chosen.name);
      if (ap) ap.attached = false;
    }
    if (bot.wheels) {
      bot.wheels.forEach(w => {
        if (
          w.mesh === chosen.mesh ||
          (chosen.mesh && chosen.mesh.parent === w.mesh) ||
          (w.mesh && w.mesh.parent === chosen.mesh) ||
          w.name === chosen.name ||
          (chosen.mesh && chosen.mesh.parent && w.name === chosen.mesh.parent.name) ||
          (chosen.name && w.name && (chosen.name.startsWith(w.name) || w.name.startsWith(chosen.name)))
        ) {
          const hasRemaining = bot.detachableParts.some(p =>
            p !== chosen && p.attached && (
              p.mesh === w.mesh ||
              (p.mesh && p.mesh.parent === w.mesh) ||
              (p.name && p.name.startsWith(w.name))
            )
          );
          if (!hasRemaining) {
            w.attached = false;
          }
        }
      });
    }

    // Capture exact world position, orientation, scale
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    chosen.mesh.getWorldPosition(worldPos);
    chosen.mesh.getWorldQuaternion(worldQuat);
    chosen.mesh.getWorldScale(worldScale);

    // Remove outline children from detached part
    if (chosen.mesh.children && chosen.mesh.children.length > 0) {
      const toRemove = chosen.mesh.children.filter(c => c.name === 'CAD_Outline' || c.isLineSegments);
      toRemove.forEach(c => chosen.mesh.remove(c));
    }

    // Remove from robot hierarchy
    if (chosen.mesh.parent) {
      chosen.mesh.parent.remove(chosen.mesh);
    }

    // Add directly to arena scene as physics debris
    chosen.mesh.position.copy(worldPos);
    chosen.mesh.quaternion.copy(worldQuat);
    chosen.mesh.scale.copy(worldScale);
    chosen.mesh.visible = true;
    scene.add(chosen.mesh);

    const isWheelPart = (chosen.category === 'wheel' || (typeof isWheelMesh === 'function' && isWheelMesh(chosen.mesh)));
    const flySpeed = 5.4 + Math.random() * 4.6;
    const outwardX = (impactDir.x || 0) + (Math.random() - 0.5) * 0.45;
    const outwardZ = (impactDir.z || 0) + (Math.random() - 0.5) * 0.45;
    const norm = Math.hypot(outwardX, outwardZ) || 1;

    detachedDebris.push({
      mesh: chosen.mesh,
      isWheel: isWheelPart,
      vx: (outwardX / norm) * flySpeed + (bot.vx ? bot.vx * 0.35 : 0),
      vy: 4.2 + Math.random() * 3.6,
      vz: (outwardZ / norm) * flySpeed + (bot.vz ? bot.vz * 0.35 : 0),
      rx: (Math.random() - 0.5) * 18,
      ry: (Math.random() - 0.5) * 18,
      rz: (Math.random() - 0.5) * 18
    });

    if (typeof AudioSys !== 'undefined' && AudioSys.metalClashSound) AudioSys.metalClashSound(1.9, true);
    spawnCollisionSparks(worldPos, 26);
    if (typeof AudioSys !== 'undefined' && AudioSys.crowdGasp) AudioSys.crowdGasp(0.75);
    addCameraTrauma(0.26);
    triggerGamepadRumble(0.60, 190);

    // Update remaining count & driveHealth
    const remainingCount = bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length;
    bot.driveHealth = (remainingCount / bot.totalInitialParts) * bot.maxDriveHealth;

    // If remaining parts dropped to <= 20%, kill drive power immediately so lone scraps cannot move
    if (remainingCount <= threshold20) {
      bot.drivePower = 0;
      bot.throttleInput = 0;
      bot.steerInput = 0;
    }

    if (remainingCount === 0) {
      bot.isEntirelyDestroyed = true;
      bot.driveHealth = 0;
      bot.drivePower = 0;
      bot.weaponSpinSpeed = 0;
      bot.weaponActive = false;
      if (typeof AudioSys !== 'undefined' && AudioSys.crowdCheer) AudioSys.crowdCheer(1.0, 3.5);
    }

    return chosen;
  }
  window.detachSinglePart = detachSinglePart;

  function detachArmorPiece(bot, impactDir, hitPoint) {
    return detachSinglePart(bot, impactDir, hitPoint);
  }

  function detachWheel(bot, impactDir, hitPoint) {
    return detachSinglePart(bot, impactDir, hitPoint);
  }

  function destroyRobotEntirely(bot, impactDir = { x: 0, z: 1 }, hitPoint = null) {
    if (!bot || bot.isEntirelyDestroyed) return;
    explodeRobot(bot, impactDir, hitPoint);
  }
  window.destroyRobotEntirely = destroyRobotEntirely;

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
    const maxHp = bot.maxDriveHealth || 100;
    const hpLoss = Math.max(0, Math.min(100, ((maxHp - (bot.driveHealth ?? maxHp)) / maxHp) * 100));
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

