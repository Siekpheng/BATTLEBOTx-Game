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
      if (obj.isMesh && obj.visible && obj.name !== 'CAD_Outline' && (!obj.material || obj.material.visible !== false)) {
        meshes.push(obj);
      }
    });

    meshes.forEach((obj, partIdx) => {
      const name = obj.name || '';
      const parentName = obj.parent ? (obj.parent.name || '') : '';

      // Compute bounding box and local radial distance relative to bot.root
      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const localCenter = bot.root ? bot.root.worldToLocal(center.clone()) : center.clone();
      const radialDist = Math.hypot(localCenter.x, localCenter.z);

      const isGenuineWheel = !name.startsWith('Chassis_') && !name.startsWith('Weapon_') && !name.startsWith('Armor_') && (
        name.startsWith('Wheel_') || name.includes('Wheel') ||
        name.includes('Tire') || name.includes('Rim') ||
        parentName.startsWith('Wheel_') || parentName.includes('Wheel') ||
        parentName.startsWith('Belt_') || parentName.includes('Belt') ||
        (bot.wheels && bot.wheels.some(w => w.mesh === obj || (w.mesh && w.mesh.children && w.mesh.children.includes(obj))))
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
        // 2WD bots (Robot 3, Robot 5) protect their vital drive wheels behind side armor/hubs:
        priority = (bot.type === 'robot3' || bot.type === 'robot5') ? 2 : 1;
      } else if (isArmor) {
        category = 'armor';
        priority = 1; // Outermost armor panels, wedges & bumpers take initial exterior impacts
      } else if (isWeapon) {
        category = 'weapon';
        // Hardened combat spinner mount: Robot 5 drum spinner and Robot 3 bar are built into core structure
        priority = (bot.type === 'robot5' || bot.type === 'robot3') ? 4 : ((radialDist > 0.70) ? 2 : 3);
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
        partIdx: partIdx,
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
    // Health hierarchy: Robot 2 most HP (450), Robot 3 & 6 least HP (200), Others similar HP (300)
    bot.maxDriveHealth = (typeof getBotMaxHealth === 'function')
      ? getBotMaxHealth(bot.type)
      : ((bot.type === 'robot2') ? 450 : ((bot.type === 'robot3' || bot.type === 'robot6') ? 200 : 300));
    bot.driveHealth = bot.maxDriveHealth;
  }
  window.initBotDetachableParts = initBotDetachableParts;

  // Sync bot.root world transform before querying any mesh world positions
  function syncBotRootMatrix(bot) {
    if (!bot || !bot.root) return;
    if (typeof bot.x === 'number' && typeof bot.z === 'number') {
      const effectiveRoll = (bot.roll || 0) + (bot.wheelTilt || 0);
      const groundElev = (typeof getBotGroundElevation === 'function')
        ? getBotGroundElevation(bot, bot.pitch || 0, effectiveRoll)
        : (bot.groundElevation || 0);
      bot.root.position.set(bot.x, (bot.airY || 0) + groundElev, bot.z);
    }
    if (typeof bot.yaw === 'number') {
      bot.root.rotation.y = bot.yaw;
    }
    if (bot.tiltGroup) {
      bot.tiltGroup.rotation.x = bot.pitch || 0;
      bot.tiltGroup.rotation.z = (bot.roll || 0) + (bot.wheelTilt || 0);
    }
    bot.root.updateMatrixWorld(true);
  }

  // Center a detached mesh's geometry on its local origin (0,0,0) and place it at its exact world bounding box center
  // so it flies off directly from its position on the robot and spins around its own center of mass!
  function detachAndCenterMeshToScene(mesh, bot) {
    if (!mesh) return null;
    syncBotRootMatrix(bot);
    mesh.updateMatrixWorld(true);

    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    mesh.getWorldQuaternion(worldQuat);
    mesh.getWorldScale(worldScale);

    // Clone geometry and recenter vertices around (0, 0, 0)
    let localGeoCenter = new THREE.Vector3(0, 0, 0);
    if (mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox && !mesh.geometry.boundingBox.isEmpty()) {
        mesh.geometry.boundingBox.getCenter(localGeoCenter);
        mesh.geometry.translate(-localGeoCenter.x, -localGeoCenter.y, -localGeoCenter.z);
        mesh.geometry.computeBoundingBox();
      }
    }

    // Also shift any child CAD_Outline geometry by the exact same offset so outlines stay aligned on the flying part!
    if (mesh.children && mesh.children.length > 0 && localGeoCenter.lengthSq() > 0.00001) {
      mesh.children.forEach(c => {
        if ((c.name === 'CAD_Outline' || c.isLineSegments) && c.geometry) {
          c.geometry = c.geometry.clone();
          c.geometry.translate(-localGeoCenter.x, -localGeoCenter.y, -localGeoCenter.z);
        }
      });
    }

    // Compute exact world position of the geometry's center on the robot BEFORE removing from parent
    const trueWorldPos = localGeoCenter.clone().applyMatrix4(mesh.matrixWorld);
    trueWorldPos.y = Math.max(0.18, trueWorldPos.y);

    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }

    mesh.position.copy(trueWorldPos);
    mesh.quaternion.copy(worldQuat);
    mesh.scale.copy(worldScale);
    mesh.visible = true;
    scene.add(mesh);

    return trueWorldPos;
  }

  // Split large multi-part CAD meshes (like Chassis_Mesh) into separate individual pieces
  // so when the robot explodes at 20%, remaining parts separate into individual pieces instead of flying off as a clump!
  function splitMeshIntoIndividualDebrisMeshes(mesh, bot) {
    if (!mesh || !mesh.geometry) return [];
    syncBotRootMatrix(bot);
    mesh.updateMatrixWorld(true);

    const worldMatrix = mesh.matrixWorld.clone();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    mesh.getWorldQuaternion(worldQuat);
    mesh.getWorldScale(worldScale);

    const baseGeo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const posAttr = baseGeo.attributes.position;
    if (!posAttr || posAttr.count < 12) {
      detachAndCenterMeshToScene(mesh, bot);
      return [mesh];
    }

    baseGeo.computeBoundingBox();
    const bbox = baseGeo.boundingBox;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const triCount = Math.floor(posAttr.count / 3);

    // If it's already a small individual part, just center and detach it directly
    if (triCount < 36 || maxDim < 0.38) {
      detachAndCenterMeshToScene(mesh, bot);
      return [mesh];
    }

    // Partition triangles into spatial octants/quadrants around the geometry center so merged chassis/clumps separate into individual parts!
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const normAttr = baseGeo.attributes.normal;
    const uvAttr = baseGeo.attributes.uv;
    const colorAttr = baseGeo.attributes.color;

    const buckets = new Map();
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = t * 3 + 1;
      const i2 = t * 3 + 2;
      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;

      // Subdivide into up to 6 individual structural sections (Front-Left, Front-Right, Mid-Left, Mid-Right, Rear-Left, Rear-Right)
      const xSide = cx >= center.x ? 1 : 0;
      let zBand = 1;
      if (size.z > 0.35) {
        const relZ = (cz - bbox.min.z) / Math.max(0.001, size.z);
        zBand = relZ < 0.34 ? 0 : (relZ < 0.67 ? 1 : 2);
      } else {
        zBand = cz >= center.z ? 1 : 0;
      }
      const key = `${xSide}_${zBand}`;
      if (!buckets.has(key)) {
        buckets.set(key, { pos: [], norm: [], uv: [], color: [] });
      }
      const b = buckets.get(key);
      for (const idx of [i0, i1, i2]) {
        b.pos.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        if (normAttr) b.norm.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
        if (uvAttr) b.uv.push(uvAttr.getX(idx), uvAttr.getY(idx));
        if (colorAttr) b.color.push(colorAttr.getX(idx), colorAttr.getY(idx), colorAttr.getZ(idx));
      }
    }

    if (buckets.size <= 1) {
      detachAndCenterMeshToScene(mesh, bot);
      return [mesh];
    }

    // Remove original clumped mesh from robot parent
    if (mesh.children && mesh.children.length > 0) {
      const toRemove = mesh.children.filter(c => c.name === 'CAD_Outline' || c.isLineSegments);
      toRemove.forEach(c => mesh.remove(c));
    }
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }

    const resultMeshes = [];
    let pieceIdx = 0;
    buckets.forEach((b) => {
      if (b.pos.length < 9) return;
      const subGeo = new THREE.BufferGeometry();
      subGeo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      if (normAttr && b.norm.length === b.pos.length) {
        subGeo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
      } else {
        subGeo.computeVertexNormals();
      }
      if (uvAttr && b.uv.length > 0) {
        subGeo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      }
      if (colorAttr && b.color.length === b.pos.length) {
        subGeo.setAttribute('color', new THREE.Float32BufferAttribute(b.color, 3));
      }

      subGeo.computeBoundingBox();
      const subCenter = new THREE.Vector3();
      subGeo.boundingBox.getCenter(subCenter);
      subGeo.translate(-subCenter.x, -subCenter.y, -subCenter.z);
      subGeo.computeBoundingBox();

      const subWorldPos = subCenter.clone().applyMatrix4(worldMatrix);
      subWorldPos.y = Math.max(0.18, subWorldPos.y);

      const subMesh = new THREE.Mesh(subGeo, mesh.material);
      subMesh.name = `${mesh.name || 'Part'}_Piece_${pieceIdx++}`;
      subMesh.castShadow = mesh.castShadow;
      subMesh.receiveShadow = mesh.receiveShadow;
      subMesh.position.copy(subWorldPos);
      subMesh.quaternion.copy(worldQuat);
      subMesh.scale.copy(worldScale);
      subMesh.visible = true;

      // Add crisp outline to each separated individual piece so it remains clearly visible even inside bright explosion bloom
      try {
        const edges = new THREE.EdgesGeometry(subGeo, 28);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x050a12,
          transparent: true,
          opacity: 0.90,
          depthTest: true,
          depthWrite: false
        });
        const lines = new THREE.LineSegments(edges, lineMat);
        lines.name = 'CAD_Outline';
        subMesh.add(lines);
      } catch (e) {}

      scene.add(subMesh);
      resultMeshes.push(subMesh);
    });

    return resultMeshes;
  }

  function explodeRobot(bot, impactDir = { x: 0, z: 1 }, hitPoint = null) {
    if (!bot || bot.isEntirelyDestroyed) return [];
    if (!bot.detachableParts || bot.detachableParts.length === 0) {
      initBotDetachableParts(bot);
    }

    // Ensure bot.root matrixWorld is synced to bot.x / bot.z BEFORE computing any world positions
    syncBotRootMatrix(bot);
    const botPos = new THREE.Vector3(bot.x || 0, (bot.airY || 0) + 0.35, bot.z || 0);
    if (bot.root) bot.root.getWorldPosition(botPos);

    // Collect ALL remaining parts and meshes on the robot (both from detachableParts and tiltGroup hierarchy)
    const meshesToExplode = [];
    const seenMeshes = new Set();

    if (bot.detachableParts) {
      bot.detachableParts.forEach(p => {
        if (p.mesh && (p.attached || (p.mesh.parent && p.mesh.parent !== scene))) {
          if (!seenMeshes.has(p.mesh)) {
            seenMeshes.add(p.mesh);
            meshesToExplode.push({
              mesh: p.mesh,
              name: p.name,
              category: p.category
            });
          }
          p.attached = false;
        }
      });
    }

    if (bot.tiltGroup) {
      bot.tiltGroup.traverse(obj => {
        if (obj.isMesh && obj.visible !== false && obj.name !== 'CAD_Outline' && (!obj.material || obj.material.visible !== false)) {
          if (!seenMeshes.has(obj)) {
            seenMeshes.add(obj);
            meshesToExplode.push({
              mesh: obj,
              name: obj.name,
              category: 'chassis'
            });
          }
        }
      });
    }

    if (meshesToExplode.length === 0) {
      bot.isEntirelyDestroyed = true;
      bot.driveHealth = 0;
      bot.drivePower = 0;
      return [];
    }

    // Separate any clumped/multi-part meshes (such as Chassis_Mesh) into individual pieces
    // and center every piece's geometry at (0,0,0) on its exact world position on the robot!
    const individualPieces = [];
    meshesToExplode.forEach((item) => {
      const mesh = item.mesh;
      const isWheelPart = (item.category === 'wheel' || (typeof isWheelMesh === 'function' && isWheelMesh(mesh)));
      if (isWheelPart) {
        detachAndCenterMeshToScene(mesh, bot);
        individualPieces.push({
          mesh: mesh,
          name: item.name,
          category: item.category,
          isWheel: true
        });
      } else {
        const subMeshes = splitMeshIntoIndividualDebrisMeshes(mesh, bot);
        subMeshes.forEach(sm => {
          individualPieces.push({
            mesh: sm,
            name: sm.name,
            category: item.category,
            isWheel: false
          });
        });
      }
    });

    const explodedParts = [];
    const totalPieces = individualPieces.length;

    // Launch all separated individual pieces outward from their true positions on the robot!
    individualPieces.forEach((piece, idx) => {
      const mesh = piece.mesh;

      // Compute outward radial direction from the robot center toward this piece's position, plus 360-degree spread
      const dxFromBot = mesh.position.x - botPos.x;
      const dzFromBot = mesh.position.z - botPos.z;
      const distFromBot = Math.hypot(dxFromBot, dzFromBot);

      const spreadAngle = (idx / Math.max(1, totalPieces)) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      let radialDirX = Math.cos(spreadAngle);
      let radialDirZ = Math.sin(spreadAngle);
      if (distFromBot > 0.08) {
        radialDirX = (dxFromBot / distFromBot) * 0.55 + radialDirX * 0.45;
        radialDirZ = (dzFromBot / distFromBot) * 0.55 + radialDirZ * 0.45;
        const rLen = Math.hypot(radialDirX, radialDirZ) || 1;
        radialDirX /= rLen;
        radialDirZ /= rLen;
      }

      const blastSpeed = 8.5 + Math.random() * 8.0;
      const impX = (impactDir && typeof impactDir.x === 'number') ? impactDir.x : 0;
      const impZ = (impactDir && typeof impactDir.z === 'number') ? impactDir.z : 1;
      const vx = (radialDirX * 0.82 + impX * 0.18) * blastSpeed + (bot.vx ? bot.vx * 0.30 : 0);
      const vz = (radialDirZ * 0.82 + impZ * 0.18) * blastSpeed + (bot.vz ? bot.vz * 0.30 : 0);
      const vy = 5.0 + Math.random() * 5.5;

      detachedDebris.push({
        mesh: mesh,
        isWheel: piece.isWheel,
        vx: vx,
        vy: vy,
        vz: vz,
        rx: (Math.random() - 0.5) * 26,
        ry: (Math.random() - 0.5) * 26,
        rz: (Math.random() - 0.5) * 26
      });

      explodedParts.push(piece);
    });

    // Cleanly remove any leftover empty groups or outline segments in bot.tiltGroup and bot.root so robot is 100% dismantled
    if (bot.tiltGroup) {
      bot.tiltGroup.traverse(obj => {
        if (obj !== bot.tiltGroup && (obj.isLineSegments || obj.name === 'CAD_Outline' || obj.isMesh)) {
          obj.visible = false;
        }
      });
      while (bot.tiltGroup.children.length > 0) {
        bot.tiltGroup.remove(bot.tiltGroup.children[0]);
      }
      bot.tiltGroup.visible = false;
    }
    if (bot.root) {
      bot.root.traverse(obj => {
        if (obj.isLineSegments || obj.name === 'CAD_Outline') {
          obj.visible = false;
        }
      });
    }

    // Synchronize legacy structures
    if (bot.armorPanels) {
      bot.armorPanels.forEach(a => { a.attached = false; });
    }
    if (bot.wheels) {
      bot.wheels.forEach(w => { w.attached = false; });
    }
    if (bot.detachableParts) {
      bot.detachableParts.forEach(p => { p.attached = false; });
    }

    // Robot completely dismantled
    bot.isEntirelyDestroyed = true;
    bot.driveHealth = 0;
    bot.drivePower = 0;
    bot.throttleInput = 0;
    bot.steerInput = 0;
    bot.weaponDestroyed = true;
    bot.weaponSpinSpeed = 0;
    bot.weaponActive = false;

    // 1. Immediately extinguish all active chassis fire on this robot
    clearBotFlames();

    // 2. Catastrophic Fire Explosion Effect!
    const explosionCenter = hitPoint || botPos;
    const botVelocity = (bot.vx || bot.vz) ? { x: bot.vx || 0, z: bot.vz || 0 } : null;
    spawnFireExplosion(explosionCenter, botVelocity);
    spawnCollisionSparks(explosionCenter, 95);

    if (typeof AudioSys !== 'undefined') {
      if (AudioSys.explosionSound) AudioSys.explosionSound();
      else if (AudioSys.metalClashSound) AudioSys.metalClashSound(3.0, true);
      if (AudioSys.weaponStallSound) AudioSys.weaponStallSound();
      if (AudioSys.crowdCheer) AudioSys.crowdCheer(1.0, 5.0);
    }
    if (typeof addCameraTrauma === 'function') addCameraTrauma(1.0);
    if (typeof triggerGamepadRumble === 'function') triggerGamepadRumble(1.0, 500);
    if (typeof triggerHitStop === 'function') triggerHitStop(0.08);
    if (typeof triggerDamageVignette === 'function') triggerDamageVignette();

    if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
      const targetWho = (typeof playerBot !== 'undefined' && bot === playerBot) ? 'p1' : 'p2';
      NetworkSys.queueEvent({
        t: 'explode',
        w: targetWho,
        dx: impactDir ? (impactDir.x || 0) : 0,
        dz: impactDir ? (impactDir.z || 1) : 1,
        hx: explosionCenter.x,
        hy: explosionCenter.y,
        hz: explosionCenter.z
      });
    }

    return explodedParts;
  }
  window.explodeRobot = explodeRobot;

  function detachSinglePart(bot, impactDir = { x: 0, z: 1 }, hitPoint = null, forcedPartIdx = null) {
    if (!bot || bot.isEntirelyDestroyed) return null;
    if (!bot.detachableParts || bot.detachableParts.length === 0) {
      initBotDetachableParts(bot);
    }
    if (!bot.detachableParts || bot.detachableParts.length === 0) return null;

    // Ensure bot.root matrixWorld is synced to bot.x / bot.z BEFORE computing any world positions
    syncBotRootMatrix(bot);

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

    let chosen = null;
    if (typeof forcedPartIdx === 'number') {
      const exactPart = bot.detachableParts.find(p => p.partIdx === forcedPartIdx);
      if (exactPart) {
        if (!exactPart.attached || !exactPart.mesh || !exactPart.mesh.parent) {
          return null;
        }
        chosen = exactPart;
      }
    }

    // Progressive demolition by layer (Outside-In):
    // (Layer 1 Armor & Wheels -> Layer 2 Exterior Cladding & Blade -> Layer 3 Mid Structure -> Layer 4 Inner Frame -> Layer 5 Core Spine)
    const minPriority = Math.min(...remaining.map(p => p.priority));
    let candidatePool = remaining.filter(p => p.priority <= minPriority + 1);

    if (!chosen && hitPoint) {
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

    // Weapon Retention Protection for combat robots:
    // Robot 5 (BlueThunder) and Robot 3 primary weapons NEVER detach while exterior armor, wheels, or chassis remain!
    if (chosen && chosen.category === 'weapon' && (bot.type === 'robot5' || bot.type === 'robot3')) {
      const nonWeaponPool = remaining.filter(p => p.category !== 'weapon' && p.category !== 'chassis_core');
      if (nonWeaponPool.length > 0) {
        // Divert impact shockwave to rip off exterior armor or wheels instead of breaking the primary weapon
        nonWeaponPool.sort((a, b) => a.priority - b.priority);
        chosen = nonWeaponPool[0];
      } else if (bot.type === 'robot5') {
        // Even when down to the bare chassis, Robot 5's drum is integral to its spine
        if (remaining.length > threshold20) {
          spawnCollisionSparks(new THREE.Vector3(bot.x, 0.35, bot.z), 35);
          return null;
        }
      }
    }

    chosen.attached = false;

    // Synchronize legacy armor and wheel arrays
    if (bot.armorPanels) {
      const ap = bot.armorPanels.find(p => p.mesh === chosen.mesh || p.name === chosen.name);
      if (ap) ap.attached = false;
    }

    // IMPORTANT: Detach and center `chosen.mesh` FIRST while its parent hierarchy is still intact on the robot!
    // (Previously, removing `targetWheelMesh` first orphaned `chosen.mesh`, causing getWorldPosition to return (0,0,0)!)
    const worldPos = detachAndCenterMeshToScene(chosen.mesh, bot) || new THREE.Vector3(bot.x || 0, 0.35, bot.z || 0);

    // Synchronize wheel assemblies:
    // When a wheel part detaches, detach the ENTIRE wheel assembly so no floating ghost parts remain!
    let detachedWheelObj = null;
    if (bot.wheels) {
      bot.wheels.forEach(w => {
        if (
          w.mesh === chosen.mesh ||
          (chosen.mesh && chosen.mesh.parent === w.mesh) ||
          (w.mesh && w.mesh.parent === chosen.mesh) ||
          w.name === chosen.name ||
          (chosen.mesh && chosen.mesh.parent && w.name === chosen.mesh.parent.name) ||
          (chosen.parentName && w.name === chosen.parentName) ||
          (chosen.name && w.name && (chosen.name === w.name || chosen.name.startsWith(w.name + '_')))
        ) {
          w.attached = false;
          detachedWheelObj = w;
        }
      });
    }

    // If this part is a wheel (or belongs to a wheel assembly), detach all sibling sub-meshes of that wheel too
    if (detachedWheelObj || chosen.category === 'wheel') {
      const targetWheelName = detachedWheelObj ? detachedWheelObj.name : chosen.parentName;
      const targetWheelMesh = detachedWheelObj ? detachedWheelObj.mesh : null;

      const siblingParts = bot.detachableParts.filter(p =>
        p !== chosen && p.attached && (
          (targetWheelMesh && (p.mesh === targetWheelMesh || (p.mesh && p.mesh.parent === targetWheelMesh))) ||
          (targetWheelName && (p.name === targetWheelName || p.parentName === targetWheelName || (p.name && p.name.startsWith(targetWheelName + '_'))))
        )
      );

      siblingParts.forEach(sp => {
        sp.attached = false;
        detachAndCenterMeshToScene(sp.mesh, bot);

        detachedDebris.push({
          mesh: sp.mesh,
          isWheel: true,
          vx: (impactDir.x || 0) * (5.0 + Math.random() * 4.0) + (Math.random() - 0.5) * 3.0,
          vy: 4.0 + Math.random() * 3.0,
          vz: (impactDir.z || 0) * (5.0 + Math.random() * 4.0) + (Math.random() - 0.5) * 3.0,
          rx: (Math.random() - 0.5) * 20,
          ry: (Math.random() - 0.5) * 20,
          rz: (Math.random() - 0.5) * 20
        });
      });

      // Remove the wheel group itself from the bot tiltGroup AFTER all its sub-meshes have captured their world positions
      if (targetWheelMesh && targetWheelMesh.parent && targetWheelMesh !== scene) {
        targetWheelMesh.parent.remove(targetWheelMesh);
      }
    }

    // Check if ALL functional wheels on the robot are now detached
    const remainingAttachedWheels = bot.wheels
      ? bot.wheels.filter(w => w.attached).length
      : bot.detachableParts.filter(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent).length;

    if (remainingAttachedWheels === 0) {
      if (bot.wheels) bot.wheels.forEach(w => { w.attached = false; });
      if (bot.detachableParts) {
        bot.detachableParts.forEach(p => {
          if (p.category === 'wheel') p.attached = false;
        });
      }
      bot.drivePower = 0;
      bot.throttleInput = 0;
      bot.steerInput = 0;
      bot.vx = 0;
      bot.vz = 0;
    }

    // Check if ALL weapon parts on the robot are now detached
    const hadWeaponParts = bot.detachableParts.some(p => p.category === 'weapon');
    const remainingWeaponParts = bot.detachableParts.filter(p => p.category === 'weapon' && p.attached && p.mesh && p.mesh.parent).length;
    if ((hadWeaponParts && remainingWeaponParts === 0) || chosen.category === 'weapon' && remainingWeaponParts === 0) {
      bot.weaponDestroyed = true;
      bot.weaponSpinSpeed = 0;
      bot.weaponActive = false;
    }

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

    if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
      const targetWho = (typeof playerBot !== 'undefined' && bot === playerBot) ? 'p1' : 'p2';
      NetworkSys.queueEvent({
        t: 'detach',
        w: targetWho,
        pi: chosen.partIdx,
        dx: impactDir ? (impactDir.x || 0) : 0,
        dz: impactDir ? (impactDir.z || 1) : 1,
        hx: hitPoint ? hitPoint.x : worldPos.x,
        hy: hitPoint ? hitPoint.y : worldPos.y,
        hz: hitPoint ? hitPoint.z : worldPos.z
      });
    }

    // Update remaining count & driveHealth
    const remainingCount = bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length;
    // Balanced progressive health depletion:
    // Normalize effective part divisor so robots with fewer discrete CAD meshes (e.g. Robot 5 with 7 components)
    // do not suffer massive chunk health losses (54 HP per hit). Each component absorbs ~18-20 HP.
    const effectivePartDivisor = Math.max(18, bot.totalInitialParts);
    const detachedCount = (bot.totalInitialParts - remainingCount);
    const healthLoss = (detachedCount / effectivePartDivisor) * bot.maxDriveHealth;
    bot.driveHealth = Math.max(0, Math.round(bot.maxDriveHealth - healthLoss));

    // If remaining parts dropped to <= 20%, trigger explosion immediately so ALL remaining parts fly out all at once!
    if (remainingCount <= threshold20) {
      explodeRobot(bot, impactDir, hitPoint);
      return chosen;
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

  // Dedicated High-Impact Fire Explosion Particle System
  const EXPLOSION_FIRE_POOL_SIZE = 55;
  const EXPLOSION_SMOKE_POOL_SIZE = 40;
  const explosionFirePool = [];
  const explosionSmokePool = [];

  const explosionFireLight = new THREE.PointLight(0xff6600, 0, 26, 1.4);
  scene.add(explosionFireLight);

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

  // Pre-allocate explosion fire sprites (Additive Blending for incandescent bloom)
  for (let i = 0; i < EXPLOSION_FIRE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fireTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    explosionFirePool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1.0,
      vx: 0, vy: 0, vz: 0,
      baseScale: 1.0
    });
  }

  // Pre-allocate explosion smoke sprites (Normal Blending for dense dark billowing smoke)
  for (let i = 0; i < EXPLOSION_SMOKE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.65
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    explosionSmokePool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1.5,
      vx: 0, vy: 0, vz: 0,
      baseScale: 1.0,
      rotSpeed: 0
    });
  }

  function spawnFireExplosion(pos, botVel = null) {
    if (!pos) return;

    // 1. Dynamic Incandescent Arena Flash
    explosionFireLight.position.set(pos.x, pos.y + 0.65, pos.z);
    explosionFireLight.intensity = 15.0;

    // 2. Expanding Spherical Fireball Burst
    const fireCount = 42;
    for (let i = 0; i < fireCount; i++) {
      const p = explosionFirePool.find(item => !item.active);
      if (!p) break;
      p.active = true;
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.45;
      p.sprite.visible = true;

      const jx = (Math.random() - 0.5) * 0.6;
      const jy = (Math.random() - 0.5) * 0.4;
      const jz = (Math.random() - 0.5) * 0.6;
      p.sprite.position.set(pos.x + jx, pos.y + 0.4 + jy, pos.z + jz);

      const speed = 6.5 + Math.random() * 11.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48; // Upward hemisphere
      p.vx = Math.cos(theta) * Math.sin(phi) * speed + (botVel ? botVel.x * 0.35 : 0);
      p.vy = Math.cos(phi) * speed * 0.85 + 2.8;
      p.vz = Math.sin(theta) * Math.sin(phi) * speed + (botVel ? botVel.z * 0.35 : 0);

      p.baseScale = 1.35 + Math.random() * 1.65;
      p.sprite.scale.set(p.baseScale * 0.45, p.baseScale * 0.45, 1);
      p.sprite.material.color.setRGB(1.0, 1.0, 0.95); // White-hot ignition
      p.sprite.material.opacity = 1.0;
    }

    // 3. Dense Billowing Explosion Smoke Clouds
    const smokeCount = 28;
    for (let i = 0; i < smokeCount; i++) {
      const s = explosionSmokePool.find(item => !item.active);
      if (!s) break;
      s.active = true;
      s.life = 0;
      s.maxLife = 1.25 + Math.random() * 0.85;
      s.sprite.visible = true;

      const jx = (Math.random() - 0.5) * 0.8;
      const jz = (Math.random() - 0.5) * 0.8;
      s.sprite.position.set(pos.x + jx, pos.y + 0.5, pos.z + jz);

      const speed = 3.5 + Math.random() * 6.0;
      const angle = Math.random() * Math.PI * 2;
      s.vx = Math.cos(angle) * speed + (botVel ? botVel.x * 0.25 : 0);
      s.vy = 2.0 + Math.random() * 3.2;
      s.vz = Math.sin(angle) * speed + (botVel ? botVel.z * 0.25 : 0);

      s.baseScale = 1.6 + Math.random() * 1.8;
      s.rotSpeed = (Math.random() - 0.5) * 2.5;
      s.sprite.material.rotation = Math.random() * Math.PI * 2;
      s.sprite.material.opacity = 0.70;
      s.sprite.scale.set(s.baseScale * 0.5, s.baseScale * 0.5, 1);
    }

    // 4. Fiery Embers & Sparks Burst
    for (let i = 0; i < 35; i++) {
      spawnEmberParticle(pos, {
        x: (Math.random() - 0.5) * 14.0,
        z: (Math.random() - 0.5) * 14.0
      });
    }
  }
  window.spawnFireExplosion = spawnFireExplosion;

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
    // If bot is destroyed, fire burning MUST stop!
    if (!bot || bot.isEntirelyDestroyed) return false;

    // Per user specification: fire effect starts when 50% of the parts have fallen off!
    if (bot.detachableParts && bot.detachableParts.length > 0) {
      const remainingCount = bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length;
      const initialTotal = bot.totalInitialParts || bot.detachableParts.length;
      return remainingCount <= Math.round(initialTotal * 0.50);
    }
    return getBotDamagePercent(bot) >= 50;
  }

  function checkAndSpawnBotFlames(bot, fireLight, dt) {
    if (!bot || !bot.root || bot.isEntirelyDestroyed) {
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
    // Decay dynamic explosion light
    if (explosionFireLight && explosionFireLight.intensity > 0) {
      explosionFireLight.intensity = Math.max(0, explosionFireLight.intensity - dt * 25.0);
    }

    // Simulate Catastrophic Explosion Fireballs
    for (const p of explosionFirePool) {
      if (!p.active) continue;
      p.life += dt;
      const progress = p.life / p.maxLife;
      if (progress >= 1.0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vx *= Math.pow(0.70, dt);
      p.vz *= Math.pow(0.70, dt);
      p.vy += 3.5 * dt; // Strong convective thermal lift

      // Rapid fireball expansion
      const scaleProg = (progress < 0.28) ? (progress / 0.28) : 1.0;
      const curScale = p.baseScale * (0.45 + scaleProg * 2.2);
      p.sprite.scale.set(curScale, curScale, 1);

      // Incandescent color progression: White-hot -> Fire orange -> Crimson -> Dark ash
      if (progress < 0.15) {
        p.sprite.material.color.setRGB(1.0, 1.0, 0.95);
      } else if (progress < 0.45) {
        p.sprite.material.color.setRGB(1.0, 0.62, 0.08);
      } else if (progress < 0.75) {
        p.sprite.material.color.setRGB(0.90, 0.18, 0.03);
      } else {
        p.sprite.material.color.setRGB(0.35, 0.08, 0.02);
      }
      p.sprite.material.opacity = Math.max(0, 1.0 - Math.pow(progress, 1.4));
    }

    // Simulate Billowing Explosion Smoke Clouds
    for (const s of explosionSmokePool) {
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
      s.vx *= Math.pow(0.80, dt);
      s.vz *= Math.pow(0.80, dt);
      s.vy += 1.8 * dt; // Slow rising smoke column
      s.sprite.material.rotation += s.rotSpeed * dt;

      const curScale = s.baseScale * (0.50 + progress * 2.5);
      s.sprite.scale.set(curScale, curScale, 1);
      s.sprite.material.opacity = Math.max(0, 0.65 * (1.0 - progress));
    }
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

  function clearAllFlamesAndExplosions() {
    clearBotFlames();
    for (const p of explosionFirePool) { p.active = false; p.sprite.visible = false; }
    for (const s of explosionSmokePool) { s.active = false; s.sprite.visible = false; }
    if (explosionFireLight) explosionFireLight.intensity = 0;
  }
  window.clearAllFlamesAndExplosions = clearAllFlamesAndExplosions;

  // Expose inspection & dev testing helpers on window
  window.getBotDamagePercent = getBotDamagePercent;
  window.isBotFlaming = isBotFlaming;
  window.testDamageBot = (bot = playerBot, hp = 15) => {
    if (bot) {
      bot.driveHealth = hp;
      console.log(`Set ${bot === playerBot ? 'Player' : 'Enemy'} HP to ${hp}. Damage: ${getBotDamagePercent(bot).toFixed(1)}%. Flaming: ${isBotFlaming(bot)}`);
    }
  };

