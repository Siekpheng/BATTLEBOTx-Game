// ========================================================
// BATTLEBOTx - COMBAT PHYSICS, COLLISIONS & REFEREE COUNT
// ========================================================

  // ========================================================
  // 10. REAL COMBAT PHYSICS & VERIFIED ZERO-CLIPPING GROUND KINEMATICS
  // ========================================================
  // ========================================================
  // MATHEMATICALLY VERIFIED ZERO-CLIPPING GROUND KINEMATICS
  // Evaluates all 8 3D bounding corners under current Euler XYZ rotation (pitch & roll)
  // Ensures robot NEVER clips through floor during flips at ANY orientation (0 to 360 deg)
  // ========================================================
  const _elevCorner = new THREE.Vector3();
  const _elevEuler = new THREE.Euler(0, 0, 0, 'XYZ');

  function computeBotLocalBounds(bot) {
    if (!bot || !bot.tiltGroup || !bot.root) return;
    try {
      const origRootX = bot.root.position.x;
      const origRootY = bot.root.position.y;
      const origRootZ = bot.root.position.z;
      const origYaw = bot.root.rotation.y;
      const origP = bot.tiltGroup.rotation.x;
      const origR = bot.tiltGroup.rotation.z;
      const origWheelRots = bot.wheels ? bot.wheels.map(w => (w.mesh ? w.mesh.rotation.x : 0)) : [];

      bot.root.position.set(0, 0, 0);
      bot.root.rotation.set(0, 0, 0);
      bot.tiltGroup.rotation.set(0, 0, 0);
      bot.root.updateMatrixWorld(true);

      const box = new THREE.Box3();
      let hasVisible = false;

      // Sample wheel rotations across 8 angles to capture full envelope of spinning wheels
      const wheelAngles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];

      wheelAngles.forEach(ang => {
        if (bot.wheels) {
          bot.wheels.forEach(w => { if (w.mesh) w.mesh.rotation.x = ang; });
        }
        bot.root.updateMatrixWorld(true);
        bot.tiltGroup.traverse(o => {
          if (o.isMesh && o.visible && o.name !== 'CAD_Outline' && (!o.material || o.material.visible !== false)) {
            box.expandByObject(o);
            hasVisible = true;
          }
        });
      });

      // Restore original transforms
      if (bot.wheels) {
        bot.wheels.forEach((w, idx) => { if (w.mesh) w.mesh.rotation.x = origWheelRots[idx] || 0; });
      }
      bot.root.position.set(origRootX, origRootY, origRootZ);
      bot.root.rotation.y = origYaw;
      bot.tiltGroup.rotation.x = origP;
      bot.tiltGroup.rotation.z = origR;
      bot.root.updateMatrixWorld(true);

      if (hasVisible && !box.isEmpty()) {
        bot.localBounds = {
          minX: box.min.x,
          maxX: box.max.x,
          minY: Math.min(0, box.min.y),
          maxY: Math.max(0.6, box.max.y),
          minZ: box.min.z,
          maxZ: box.max.z
        };
      } else {
        bot.localBounds = { minX: -1.05, maxX: 1.05, minY: -0.11, maxY: 1.10, minZ: -1.35, maxZ: 1.35 };
      }
    } catch (e) {
      bot.localBounds = { minX: -1.05, maxX: 1.05, minY: -0.11, maxY: 1.10, minZ: -1.35, maxZ: 1.35 };
    }
  }
  window.computeBotLocalBounds = computeBotLocalBounds;

  function getBotGroundElevation(bot, pitchOverride, rollOverride) {
    if (!bot || !bot.tiltGroup) return 0;
    if (!bot.localBounds && typeof computeBotLocalBounds === 'function') {
      computeBotLocalBounds(bot);
    }
    const b = bot.localBounds || {
      minX: -1.05, maxX: 1.05,
      minY: 0.0,   maxY: 1.20,
      minZ: -1.45, maxZ: 1.45
    };

    const curPitch = (typeof pitchOverride !== 'undefined')
      ? pitchOverride
      : (bot.pitch || 0);

    const curRoll = (typeof rollOverride !== 'undefined')
      ? rollOverride
      : (typeof bot.wheelTilt !== 'undefined'
          ? (bot.roll || 0) + bot.wheelTilt
          : (bot.tiltGroup ? bot.tiltGroup.rotation.z : (bot.roll || 0)));

    _elevEuler.set(curPitch, 0, curRoll, 'XYZ');

    let lowestY = 0;
    for (const x of [b.minX, b.maxX]) {
      for (const y of [b.minY, b.maxY]) {
        for (const z of [b.minZ, b.maxZ]) {
          _elevCorner.set(x, y, z).applyEuler(_elevEuler);
          if (_elevCorner.y < lowestY) lowestY = _elevCorner.y;
        }
      }
    }
    return Math.max(0, -lowestY);
  }
  window.getBotGroundElevation = getBotGroundElevation;

  function updateBotPhysics(bot, dt) {
    const remainingParts = (bot.detachableParts && bot.detachableParts.length > 0)
      ? bot.detachableParts.filter(p => p.attached && p.mesh && p.mesh.parent).length
      : 999;
    const threshold20 = (bot.totalInitialParts && bot.totalInitialParts > 0)
      ? Math.max(1, Math.round(bot.totalInitialParts * 0.20))
      : 2;

    let totalWheels = 0;
    let leftWheels = 0;
    let rightWheels = 0;

    if (bot.wheels && bot.wheels.length > 0) {
      bot.wheels.forEach(w => {
        if (w.attached) {
          totalWheels++;
          if (w.side === 'left') leftWheels++;
          else rightWheels++;
        }
      });
    } else if (bot.detachableParts && bot.detachableParts.length > 0) {
      const wheelParts = bot.detachableParts.filter(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent);
      totalWheels = wheelParts.length;
      wheelParts.forEach(p => {
        const lx = p.localCenter ? p.localCenter.x : 0;
        const isLeft = (lx > 0) || (p.name && (p.name.includes('_L') || p.name.includes('Left') || p.name.endsWith('L')));
        if (isLeft) leftWheels++;
        else rightWheels++;
      });
    }

    const maxWheels = Math.max(1, bot.wheels && bot.wheels.length > 0 ? bot.wheels.length : 2);

    // A robot with no wheels, depleted drive health, <= 20% parts remaining, or entirely destroyed CANNOT move!
    if (totalWheels === 0 || bot.driveHealth <= 0 || remainingParts <= threshold20 || bot.isEntirelyDestroyed) {
      if (!bot.isEntirelyDestroyed && remainingParts <= threshold20 && remainingParts > 0) {
        explodeRobot(bot, { x: 0, z: 1 });
      }
      bot.drivePower = 0;
      bot.throttleInput = 0;
      bot.steerInput = 0;
      // High ground friction: a chassis sitting on its belly with no wheels stops immediately!
      if (!bot.airY || bot.airY <= 0.05) {
        bot.vx = 0;
        bot.vz = 0;
      } else {
        const bellyDrag = Math.pow(0.005, dt);
        bot.vx *= bellyDrag;
        bot.vz *= bellyDrag;
      }
    } else {
      // Symmetrically balanced wheel factor
      const wheelFactor = Math.min(1.0, (totalWheels / maxWheels) * 0.70 + 0.30);
      bot.drivePower = (bot.driveHealth / (bot.maxDriveHealth || 220)) * (0.25 + 0.75 * wheelFactor);
    }

    const maxSpeed = 15.0 * (0.35 + 0.65 * bot.drivePower);
    const turnRate = 3.4 * (0.35 + 0.65 * bot.drivePower);
    const accel = 46.0 * bot.drivePower;

    // Driving ONLY if not flipped, has drive power, AND has at least 1 wheel attached!
    if (!bot.flipped && bot.drivePower > 0 && totalWheels > 0) {
      if (leftWheels > 0 && rightWheels === 0) {
        // Only left wheels: counter-steerable asymmetric drag
        const asymmetricPull = -0.75 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate + asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * 0.80 * dt;
        bot.vz += forwardZ * bot.throttleInput * accel * 0.80 * dt;
        if (Math.abs(bot.throttleInput) > 0.1 && Math.random() < 0.25) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(0.65, 0.1, 0)), 1);
        }
      } else if (rightWheels > 0 && leftWheels === 0) {
        // Only right wheels: counter-steerable asymmetric drag
        const asymmetricPull = 0.75 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate + asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * 0.80 * dt;
        bot.vz += forwardZ * bot.throttleInput * accel * 0.80 * dt;
        if (Math.abs(bot.throttleInput) > 0.1 && Math.random() < 0.25) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(-0.65, 0.1, 0)), 1);
        }
      } else if (leftWheels > 0 && rightWheels > 0) {
        // Both sides have wheels
        const asymmetricPull = (leftWheels - rightWheels) * 0.25 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate - asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * dt;
        bot.vz += forwardZ * bot.throttleInput * accel * dt;
      }
    }

    // Velocity Damping
    bot.vx *= Math.pow(0.18, dt);
    bot.vz *= Math.pow(0.18, dt);

    const speed = Math.hypot(bot.vx, bot.vz);
    if (speed > maxSpeed) {
      bot.vx = (bot.vx / speed) * maxSpeed;
      bot.vz = (bot.vz / speed) * maxSpeed;
    }

    if ((totalWheels === 0 || bot.driveHealth <= 0 || remainingParts <= threshold20 || bot.isEntirelyDestroyed) && (!bot.airY || bot.airY <= 0.05)) {
      bot.vx = 0;
      bot.vz = 0;
    }

    bot.x += bot.vx * dt;
    bot.z += bot.vz * dt;

    // 4. Arena Wall Collision (Square 4x4m battlebox enclosure)
    const botRadius = 1.35;
    const maxBound = ARENA_HALF - botRadius;
    const walls = [
      { nx: 0, nz: 1, dist: bot.z + maxBound, axis: 'z', push: 1 },  // North wall at z = -ARENA_HALF
      { nx: 0, nz: -1, dist: maxBound - bot.z, axis: 'z', push: -1 }, // South wall at z = +ARENA_HALF
      { nx: 1, nz: 0, dist: bot.x + maxBound, axis: 'x', push: 1 },  // West wall at x = -ARENA_HALF
      { nx: -1, nz: 0, dist: maxBound - bot.x, axis: 'x', push: -1 }  // East wall at x = +ARENA_HALF
    ];

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.dist < 0) {
        const overlap = -w.dist;
        if (w.axis === 'x') {
          bot.x += w.push * overlap;
        } else {
          bot.z += w.push * overlap;
        }

        const outNx = -w.nx;
        const outNz = -w.nz;
        const velDot = bot.vx * outNx + bot.vz * outNz;
        if (velDot > 0) {
          bot.vx -= 1.6 * velDot * outNx;
          bot.vz -= 1.6 * velDot * outNz;
        }

        // Wall weapon collision: if front strikes arena wall with spinning weapon, stop weapon
        const wallFrontDot = Math.sin(bot.yaw) * outNx + Math.cos(bot.yaw) * outNz;
        const minWallStallSpin = 45.0; // Equal threshold for both robots
        if (wallFrontDot > 0.4 && bot.weaponSpinSpeed >= minWallStallSpin) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(outNx * 0.8, 0.3, outNz * 0.8)), 25);
          if (typeof matchState === 'undefined' || matchState !== 'menu') {
            AudioSys.metalClashSound(1.6, true);
            bot.weaponSpinSpeed = 0; // Stops weapon on wall impact!
            AudioSys.weaponStallSound();
          }
        }
      }
    }

    // Vertical launch / air kinematics if tossed or popped by drum weapon
    const wasInAir = (bot.airY > 0.05);
    if (bot.vy || bot.airY > 0) {
      bot.airY = (bot.airY || 0) + bot.vy * dt;
      bot.vy -= 26.0 * dt; // Strong snappy gravity for heavy 250lb combat robots
      if (bot.airY <= 0) {
        bot.airY = 0;
        bot.vy = 0;
        if (wasInAir) {
          AudioSys.hitSound(0.65);
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 16);
        }
      }
    } else {
      bot.airY = 0;
    }

    const inAir = (bot.airY > 0.05 || bot.vy > 0);

    if (inAir) {
      // Free tumbling mid-air rotation
      bot.pitch += bot.pitchVel * dt;
      bot.roll += bot.rollVel * dt;
      while (bot.pitch > Math.PI) bot.pitch -= Math.PI * 2;
      while (bot.pitch < -Math.PI) bot.pitch += Math.PI * 2;
      while (bot.roll > Math.PI) bot.roll -= Math.PI * 2;
      while (bot.roll < -Math.PI) bot.roll += Math.PI * 2;
      bot.pitchVel *= Math.pow(0.65, dt);
      bot.rollVel *= Math.pow(0.65, dt);
    } else {
      // Bi-stable Pitch Physics (end-over-end frontflip/backflip on ground)
      if (bot.flipped || Math.abs(bot.pitch) > 0.04 || Math.abs(bot.pitchVel) > 0.04) {
        bot.pitch += bot.pitchVel * dt;
        while (bot.pitch > Math.PI) bot.pitch -= Math.PI * 2;
        while (bot.pitch < -Math.PI) bot.pitch += Math.PI * 2;

        const targetPitch = Math.abs(bot.pitch) > Math.PI * 0.48 ? (bot.pitch > 0 ? Math.PI : -Math.PI) : 0;
        const pitchError = targetPitch - bot.pitch;
        bot.pitchVel += pitchError * 35 * dt;
        bot.pitchVel *= Math.pow(0.04, dt);

        if (Math.abs(bot.pitch) < 0.03 && Math.abs(bot.pitchVel) < 0.15) {
          bot.pitch = 0;
          bot.pitchVel = 0;
        } else if (Math.abs(Math.abs(bot.pitch) - Math.PI) < 0.04 && Math.abs(bot.pitchVel) < 0.15) {
          bot.pitch = (bot.pitch > 0 ? Math.PI : -Math.PI);
          bot.pitchVel = 0;
        }
      } else {
        bot.pitch = 0;
        bot.pitchVel = 0;
      }

      // Bi-stable Roll Physics (barrel roll sideways on ground)
      if (bot.flipped || Math.abs(bot.roll) > 0.04 || Math.abs(bot.rollVel) > 0.04) {
        bot.roll += bot.rollVel * dt;
        while (bot.roll > Math.PI) bot.roll -= Math.PI * 2;
        while (bot.roll < -Math.PI) bot.roll += Math.PI * 2;

        const targetRoll = Math.abs(bot.roll) > Math.PI * 0.48 ? (bot.roll > 0 ? Math.PI : -Math.PI) : 0;
        const rollError = targetRoll - bot.roll;
        bot.rollVel += rollError * 35 * dt;
        bot.rollVel *= Math.pow(0.04, dt);

        if (Math.abs(bot.roll) < 0.03 && Math.abs(bot.rollVel) < 0.15) {
          bot.roll = 0;
          bot.rollVel = 0;
        } else if (Math.abs(Math.abs(bot.roll) - Math.PI) < 0.04 && Math.abs(bot.rollVel) < 0.15) {
          bot.roll = (bot.roll > 0 ? Math.PI : -Math.PI);
          bot.rollVel = 0;
        }
      } else {
        bot.roll = 0;
        bot.rollVel = 0;
      }
    }

    bot.flipped = (Math.abs(bot.pitch) > Math.PI * 0.48) || (Math.abs(bot.roll) > Math.PI * 0.48);

    const wheelDiff = (rightWheels - leftWheels);
    const wheelTilt = Math.max(-0.10, Math.min(0.10, wheelDiff * 0.045));
    bot.wheelTilt = wheelTilt;

    const targetRoll = bot.roll + wheelTilt;
    bot.groundElevation = getBotGroundElevation(bot, bot.pitch, targetRoll);
    bot.root.position.set(bot.x, bot.groundElevation + (bot.airY || 0), bot.z);
    bot.root.rotation.y = bot.yaw;
    bot.tiltGroup.rotation.x = bot.pitch;
    bot.tiltGroup.rotation.z = targetRoll;

    // Active Weapon Rotation & Continuous Electric Motor Wind-Up
    if (bot.weaponMesh) {
      const isMenu = (typeof matchState !== 'undefined' && matchState === 'menu');
      const isCountdown = (typeof matchState !== 'undefined' && matchState === 'countdown');
      if (isCountdown || bot.weaponDestroyed) {
        // Weapon blade remains completely stationary (0 RPM) during the 3s countdown or if the weapon blade was detached!
        bot.weaponSpinSpeed = 0;
        if (bot.weaponDestroyed) bot.weaponActive = false;
      } else if (!isMenu && gameMode === 'practice' && bot === enemyBot) {
        // Practice dummy weapon stays completely disarmed & inactive (0 RPM)
        bot.weaponSpinSpeed = 0;
      } else if (!isMenu && bot.drivePower <= 0) {
        // Internal motor burnout spins down kinetic weapon
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - 20.0 * dt);
        if (Math.random() < 0.05) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(0, 0.35, 0)), 1);
        }
      } else if (!isMenu && bot.weaponActive === false) {
        // Weapon motor turned OFF by player: smooth mechanical inertia spindown until stopped
        const spinDownDecel = 24.0; // Smooth realistic deceleration (~4.0s from full 95 rad/s)
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - spinDownDecel * dt);
      } else {
        // Continuous electric brushless motor wind-up towards full speed (95.0 rad/s)
        const targetSpin = 95.0;
        const windUpRate = isMenu ? 190.0 : 38.0; // Instant aggressive wind-up in menu demo fight!
        if (bot.weaponSpinSpeed < targetSpin) {
          bot.weaponSpinSpeed = Math.min(targetSpin, bot.weaponSpinSpeed + windUpRate * dt);
        }
      }

      if (bot.type === 'robot2') {
        bot.weaponMesh.rotation.x -= bot.weaponSpinSpeed * dt;
      } else if (bot.type === 'robot1') {
        // Robot 1 weapon is natively modeled at 10-degree tilt in CAD geometry.
        // Spin around its true 10-degree tilted spindle normal axis:
        const robot1SpindleAxis = new THREE.Vector3(0, Math.cos((10.0 * Math.PI) / 180), Math.sin((10.0 * Math.PI) / 180)).normalize();
        bot.weaponAngle = ((bot.weaponAngle || 0) + bot.weaponSpinSpeed * dt) % (Math.PI * 2);
        bot.weaponMesh.quaternion.setFromAxisAngle(robot1SpindleAxis, bot.weaponAngle);
      } else if (bot.type === 'robot3') {
        // Robot 3: Horizontal blade spinner rotates around vertical Y axis
        bot.weaponMesh.rotation.y += bot.weaponSpinSpeed * dt;
      } else if (bot.type === 'robot4' || bot.type === 'robot5' || bot.type === 'robot6') {
        // Robot 4 & 5: Vertical drum / disc spinner rotates around horizontal X axis
        bot.weaponMesh.rotation.x += bot.weaponSpinSpeed * dt;
      } else {
        bot.weaponMesh.rotation.y += bot.weaponSpinSpeed * dt;
      }
    }

    // Active Wheel Rolling & Spin Physics Animation
    if (bot.wheels && bot.wheels.length > 0) {
      const fwdX = Math.sin(bot.yaw);
      const fwdZ = Math.cos(bot.yaw);
      const forwardVel = (bot.vx * fwdX + bot.vz * fwdZ);

      const isR2 = (bot.type === 'robot2');
      const wheelRadius = isR2 ? 0.245 : 0.099;
      const halfTrack = isR2 ? 0.935 : 0.682;

      const steerIn = bot.steerInput || 0;
      const throttleIn = bot.throttleInput || 0;

      // When accelerating, pushing, or spinning in place, blend in motor drive
      const throttleDrive = throttleIn * 11.0;
      const steerDrive = steerIn * 3.4 * halfTrack;

      // Realistic slip blend: rolls with ground speed + wheelspin burnout when pushed against obstacles
      const slipFactor = Math.max(0, 1.0 - Math.min(1.0, Math.abs(forwardVel) / 3.5));
      const leftV = (forwardVel + (steerIn * 3.4 * halfTrack)) * (1.0 - slipFactor * 0.35)
                  + (throttleDrive + steerDrive) * (slipFactor * 0.35);
      const rightV = (forwardVel - (steerIn * 3.4 * halfTrack)) * (1.0 - slipFactor * 0.35)
                   + (throttleDrive - steerDrive) * (slipFactor * 0.35);

      const leftOmega = leftV / wheelRadius;
      const rightOmega = rightV / wheelRadius;

      for (let i = 0; i < bot.wheels.length; i++) {
        const w = bot.wheels[i];
        if (w.attached && w.mesh) {
          const isSmallWheel = (bot.type === 'robot1') && w.name.includes('Front');
          const wRadius = isSmallWheel ? 0.099 : 0.244;
          const omega = ((w.side === 'left') ? leftV : rightV) / wRadius;
          w.mesh.rotation.x += omega * dt;
        }
      }
    }
  }

  function updateEnemyAI(dt) {
    if (!enemyBot || !playerBot) return;

    const eNoWheels = (!enemyBot.wheels || enemyBot.wheels.length === 0 || enemyBot.wheels.filter(w => w.attached).length === 0);
    if (enemyBot.driveHealth <= 0 || enemyBot.isEntirelyDestroyed || eNoWheels) {
      enemyBot.drivePower = 0;
      enemyBot.throttleInput = 0;
      enemyBot.steerInput = 0;
      return;
    }

    if (gameMode === 'practice') {
      enemyBot.throttleInput = 0;
      enemyBot.steerInput = 0;
      return;
    }

    if (gameMode === '1v1') {
      if (enemyBot.flipped) {
        enemyBot.drivePower = 0;
        enemyBot.throttleInput = 0;
        enemyBot.steerInput = 0;
        return;
      }
      let t = 0, s = 0;
      if (keys['ArrowUp']) t += 1;
      if (keys['ArrowDown']) t -= 1;
      if (keys['ArrowLeft']) s -= 1;
      if (keys['ArrowRight']) s += 1;

      // Controller 2 input (if connected)
      const gp2 = (typeof window._latestGp2 !== 'undefined') ? window._latestGp2 : pollGamepadControls(1);
      if (gp2 && gp2.hasInput) {
        t = gp2.throttle;
        s = gp2.steer;
      }

      enemyBot.throttleInput = t;
      enemyBot.steerInput = s;
      return;
    }

    if (enemyBot.flipped) {
      // Flipped bots cannot self-right; referee 10s countout applies
      enemyBot.throttleInput = 0;
      enemyBot.steerInput = 0;
      return;
    }

    const dx = playerBot.x - enemyBot.x;
    const dz = playerBot.z - enemyBot.z;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - enemyBot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const distToPlayer = Math.hypot(dx, dz);

    // Total Demolition check: stop if player is completely dismantled
    if (playerBot.isEntirelyDestroyed) {
      enemyBot.throttleInput = 0;
      enemyBot.steerInput = 0;
      return;
    }

    // BattleBots Referee Countout vs. AI "No Mercy" Total Destruction:
    // If player is immobilized (countdown started, flipped, drive burned out, or all wheels detached):
    // - By default, AI decides once per immobilization whether to show mercy (back off for 10s referee countout)
    //   or go for NO MERCY TOTAL DESTRUCTION (keep attacking until the player's robot explodes at 20% parts)!
    const pNoWheels = (!playerBot.wheels || playerBot.wheels.length === 0 || playerBot.wheels.filter(w => w.attached).length === 0);
    const isPlayerImmobilized = (playerBot.stoppedTimer > 0.20) || playerBot.flipped || (playerBot.drivePower <= 0) || (playerBot.driveHealth <= 0) || pNoWheels;

    if (isPlayerImmobilized) {
      if (typeof enemyBot.aiNoMercyDecision !== 'boolean') {
        // 45% chance AI goes for ruthless Total Destruction instead of showing mercy!
        enemyBot.aiNoMercyDecision = (Math.random() < 0.45);
      }
      if (!enemyBot.aiNoMercyDecision) {
        if (distToPlayer < 7.0) {
          // Reverse away smoothly from the immobilized player to let referee 10s countout proceed
          enemyBot.throttleInput = -0.55;
          enemyBot.steerInput = (diff > 0) ? -0.35 : 0.35;
        } else {
          // Stand by at neutral distance and idle
          enemyBot.throttleInput = 0;
          enemyBot.steerInput = 0;
        }
        return;
      }
    } else {
      enemyBot.aiNoMercyDecision = undefined;
    }

    const weaponReady = (enemyBot.weaponSpinSpeed >= 60.0) || enemyBot.weaponDestroyed;

    // Realistic combat driver tactics:
    // If weapon stalled on impact and too close to player, back off or circle to build RPM
    if (!weaponReady && distToPlayer < 3.2) {
      enemyBot.throttleInput = -0.60;
      enemyBot.steerInput = Math.sin(performance.now() * 0.0025) > 0 ? 0.65 : -0.65;
    } else {
      const steerTarget = Math.max(-1, Math.min(1, -diff * 1.8));
      // Damped steering interpolation (human reaction latency)
      enemyBot.steerInput += (steerTarget - enemyBot.steerInput) * Math.min(1, dt * 5.0);

      // Throttle scaling: commit full charge only when aligned and spun up
      if (weaponReady && Math.abs(diff) < 0.45) {
        enemyBot.throttleInput = 0.90; // High-speed kinetic charge
      } else if (Math.abs(diff) < 1.0) {
        enemyBot.throttleInput = 0.62; // Controlled pacing
      } else {
        enemyBot.throttleInput = 0.35; // Turning into alignment
      }
    }
  }

  function handleBotCollision() {
    if (!playerBot || !enemyBot) return;
    const dx = enemyBot.x - playerBot.x;
    const dz = enemyBot.z - playerBot.z;
    const dist = Math.hypot(dx, dz);
    const minDist = 2.25;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      playerBot.x -= nx * overlap * 0.5;
      playerBot.z -= nz * overlap * 0.5;
      enemyBot.x += nx * overlap * 0.5;
      enemyBot.z += nz * overlap * 0.5;

      const rvx = playerBot.vx - enemyBot.vx;
      const rvz = playerBot.vz - enemyBot.vz;
      const impactSpeed = Math.hypot(rvx, rvz);

      // Record pre-impact speeds and approach velocities before impulse dampens them
      const pSpeedBefore = Math.hypot(playerBot.vx, playerBot.vz);
      const eSpeedBefore = Math.hypot(enemyBot.vx, enemyBot.vz);
      const pApproach = Math.max(0, playerBot.vx * nx + playerBot.vz * nz);
      const eApproach = Math.max(0, enemyBot.vx * (-nx) + enemyBot.vz * (-nz));

      // Proportional impulse scaling naturally with impact speed
      const impulse = Math.min(5.2, impactSpeed * 0.52);
      if (impulse > 0.08) {
        playerBot.vx -= nx * impulse;
        playerBot.vz -= nz * impulse;
        enemyBot.vx += nx * impulse;
        enemyBot.vz += nz * impulse;
      }

      // Realistic horizontal yaw deflection
      const yawTorque = (nx * (playerBot.vz - enemyBot.vz) - nz * (playerBot.vx - enemyBot.vx)) * 0.09;
      playerBot.yaw += yawTorque;
      enemyBot.yaw -= yawTorque;

      const midPos = new THREE.Vector3((playerBot.x + enemyBot.x) * 0.5, 0.3, (playerBot.z + enemyBot.z) * 0.5);
      const sparkCount = (impactSpeed > 4.5) ? Math.min(50, Math.floor(impactSpeed * 3.5 + 10)) : Math.max(3, Math.floor(impactSpeed * 2.5));
      spawnCollisionSparks(midPos, sparkCount);
      AudioSys.metalClashSound(Math.min(2.6, 0.65 + impactSpeed * 0.26), impactSpeed > 5.0);

      const pForwardDot = Math.sin(playerBot.yaw) * nx + Math.cos(playerBot.yaw) * nz;
      const eForwardDot = -(Math.sin(enemyBot.yaw) * nx + Math.cos(enemyBot.yaw) * nz);

      // Local impact direction relative to each bot's heading:
      const eHitForward = (-nx) * Math.sin(enemyBot.yaw) + (-nz) * Math.cos(enemyBot.yaw);
      const eHitRight   = (-nx) * Math.cos(enemyBot.yaw) - (-nz) * Math.sin(enemyBot.yaw);
      const pHitForward = nx * Math.sin(playerBot.yaw) + nz * Math.cos(playerBot.yaw);
      const pHitRight   = nx * Math.cos(playerBot.yaw) - nz * Math.sin(playerBot.yaw);

      const minWeaponSpin = 40.0;
      const isPractice = (gameMode === 'practice');

      if (impactSpeed > 1.8) {
        const isPWeaponHit = (playerBot.weaponActive !== false && pForwardDot > 0.35 && playerBot.weaponSpinSpeed >= minWeaponSpin);
        const isEWeaponHit = (!isPractice && enemyBot.weaponActive !== false && eForwardDot > 0.35 && enemyBot.weaponSpinSpeed >= minWeaponSpin);
        const isBothWeaponClash = isPWeaponHit && isEWeaponHit;

        if (isBothWeaponClash) {
          // ========================================================
          // TRUE WEAPON-TO-WEAPON HEAD-ON KINETIC CLASH
          // ========================================================
          AudioSys.metalClashSound(2.5, true);
          AudioSys.weaponSliceSound();
          AudioSys.weaponStallSound();
          AudioSys.crowdCheer(0.95, 1.9);
          addCameraTrauma(0.95);
          triggerGamepadRumble(1.0, 420);
          triggerHitStop(0.065);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: 2.5, h: true });
            NetworkSys.queueEvent({ t: 'slice' });
            NetworkSys.queueEvent({ t: 'stall' });
          }

          // Record pre-impact weapon spin speeds BEFORE stalling them to 0!
          const bothWeaponsMax = (playerBot.weaponSpinSpeed >= 88.0 && enemyBot.weaponSpinSpeed >= 88.0);
          const bothTravelFast = (impactSpeed >= 12.0 && pSpeedBefore >= 6.0 && eSpeedBefore >= 6.0);
          const canClashFlip = bothWeaponsMax && bothTravelFast && (Math.random() < 0.15);

          if (typeof matchState === 'undefined' || matchState !== 'menu') {
            playerBot.weaponSpinSpeed = 0;
            enemyBot.weaponSpinSpeed = 0;
          } else {
            playerBot.weaponSpinSpeed = 95.0;
            enemyBot.weaponSpinSpeed = 95.0;
          }

          const clashImpulse = Math.min(8.0, 3.2 + impactSpeed * 0.45);
          playerBot.vx -= nx * clashImpulse;
          playerBot.vz -= nz * clashImpulse;
          enemyBot.vx += nx * clashImpulse;
          enemyBot.vz += nz * clashImpulse;

          if (canClashFlip) {
            playerBot.vy = 2.0 + Math.random() * 0.3;
            enemyBot.vy = 2.0 + Math.random() * 0.3;
            playerBot.airY = 0.15;
            enemyBot.airY = 0.15;
            playerBot.pitchVel = (Math.random() < 0.5 ? -8.2 : 8.2);
            enemyBot.pitchVel = (Math.random() < 0.5 ? -8.2 : 8.2);
            playerBot.flipped = true;
            enemyBot.flipped = true;
          } else {
            // Keep both robots firmly planted on the floor during non-flip head-on clash (no jumpy hop!)
            playerBot.vy = 0;
            enemyBot.vy = 0;
            playerBot.airY = 0;
            enemyBot.airY = 0;
            playerBot.pitchVel = (Math.random() < 0.5 ? -1.1 : 1.1);
            enemyBot.pitchVel = (Math.random() < 0.5 ? -1.1 : 1.1);
          }

          spawnCollisionSparks(midPos, 65);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 65 });
          }
          triggerDamageVignette();

          const pRemainingArmor = playerBot.armorPanels.filter(p => p.attached).length;
          const pMaxArmor = Math.max(1, playerBot.armorPanels.length);
          const pVuln = 1.0 + (1.0 - (pRemainingArmor / pMaxArmor)) * 1.25;

          const eRemainingArmor = enemyBot.armorPanels.filter(p => p.attached).length;
          const eMaxArmor = Math.max(1, enemyBot.armorPanels.length);
          const eVuln = 1.0 + (1.0 - (eRemainingArmor / eMaxArmor)) * 1.25;

          // Head-on clash detaches parts 1 by 1 from both robots
          if (!isPractice) {
            detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
            if (impactSpeed > 6.5) detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
          }
          detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
          if (impactSpeed > 6.5) detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);

          if (!isPractice && playerBot.isEntirelyDestroyed && enemyBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, true, true, true);
          } else if (!isPractice && playerBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
          } else if (enemyBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
          }
        } else if (isPWeaponHit) {
          // ========================================================
          // PLAYER WEAPON STRIKE ON ENEMY
          // (Enemy takes kinetic damage, sparks, flings. Player takes 0 damage!)
          // ========================================================
          const isFrontalOrRear = Math.abs(eHitForward) >= 0.25 || Math.abs(eHitForward) >= Math.abs(eHitRight);
          
          // Realistic flipping criteria per user specification:
          // 1. Only flip when the other robot hits it VERTICALLY VERY HARD!
          //    - Weapon must be spinning at high RPM (>= 88 rad/s)
          //    - Travel speed must be fast (>= 6.5 m/s) with direct high-energy impact (>= 8.0 m/s or approach >= 4.5)
          //    - Vertical bite / lifting strike (frontal/rear weapon bite underneath chassis or vertical launch)
          // 2. "Not every hit is a flip ... only sometime flip":
          //    - Even on hard vertical hits, only a ~24% probability to flip;
          //    - The other ~76% of hard hits cause heavy knockback, sparks, pop on wheels (NO flip).
          const isPWeaponMax = (playerBot.weaponActive !== false && playerBot.weaponSpinSpeed >= 88.0);
          const isPTravelFast = (pSpeedBefore >= 6.5 && (pApproach >= 4.5 || impactSpeed >= 8.0));
          const isVerticalBiteP = isFrontalOrRear || (playerBot.vy > 0.35);
          const isHardVerticalHitP = isPWeaponMax && isPTravelFast && isVerticalBiteP;
          const canFlipEnemy = isHardVerticalHitP && (Math.random() < 0.24);
          const wasEnemyFlipped = enemyBot.flipped;

          AudioSys.metalClashSound(canFlipEnemy ? 2.2 : 1.8, true);
          AudioSys.weaponSliceSound();
          if (canFlipEnemy) {
            AudioSys.crowdCheer(0.85, 1.6);
            addCameraTrauma(0.70);
            triggerGamepadRumble(0.9, 300);
            triggerHitStop(0.045);
          } else {
            addCameraTrauma(0.38);
            triggerGamepadRumble(0.60, 200);
          }

          // Attacker Weapon Recoil (Newton's 3rd Law counter-force — strictly horizontal so attacker stays grounded)
          const pRecoil = canFlipEnemy ? 3.4 : 1.8;
          playerBot.vx -= nx * pRecoil;
          playerBot.vz -= nz * pRecoil;

          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: canFlipEnemy ? 2.2 : 1.8, h: true });
            NetworkSys.queueEvent({ t: 'slice' });
          }

          if (canFlipEnemy) {
            // WEIGHTY, CONTROLLED, REALISTIC FLIP (NO dramatic catapulting into the ceiling!)
            enemyBot.vy = 2.1 + Math.random() * 0.35;
            enemyBot.airY = 0.15;
            enemyBot.vx += nx * (5.5 + impactSpeed * 0.40);
            enemyBot.vz += nz * (5.5 + impactSpeed * 0.40);

            if (isFrontalOrRear) {
              enemyBot.pitchVel = (eHitForward > 0 ? -8.5 : 8.5);
              enemyBot.rollVel = (Math.random() - 0.5) * 2.5;
            } else {
              enemyBot.rollVel = (eHitRight > 0 ? -8.5 : 8.5);
              enemyBot.pitchVel = (Math.random() - 0.5) * 2.5;
            }
            enemyBot.flipped = true;

            spawnCollisionSparks(midPos, 45);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 45 });
            }
          } else {
            // CONTROLLED SOLID HIT: HEAVY PUSHBACK ON WHEELS, NO FLIP & NO JUMPY HOP!
            enemyBot.vy = 0;
            enemyBot.airY = 0;
            enemyBot.vx += nx * (4.0 + impactSpeed * 0.45);
            enemyBot.vz += nz * (4.0 + impactSpeed * 0.45);

            if (isFrontalOrRear) {
              enemyBot.pitchVel = (eHitForward > 0 ? -1.2 : 1.2);
              enemyBot.rollVel = 0;
            } else {
              enemyBot.rollVel = (eHitRight > 0 ? -1.2 : 1.2);
              enemyBot.pitchVel = 0;
            }
            // Firmly remains on wheels: NO enemyBot.flipped = true

            spawnCollisionSparks(midPos, 24);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 24 });
            }
          }

          if (typeof matchState === 'undefined' || matchState !== 'menu') {
            playerBot.weaponSpinSpeed = 0;
            enemyBot.weaponSpinSpeed = 0;
            AudioSys.weaponStallSound();
          } else {
            playerBot.weaponSpinSpeed = 95.0;
            enemyBot.weaponSpinSpeed = 95.0;
          }
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'stall' });
          }

          // Parts fly off 1 by 1 with each solid hit until NOTHING left!
          detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
          if (canFlipEnemy || impactSpeed > 6.0) {
            detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
          }

          if (enemyBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
          }
          if (!wasEnemyFlipped && enemyBot.flipped) {
            AudioSys.crowdGasp(0.8);
          }
          // Player takes strictly ZERO damage!
        } else if (isEWeaponHit) {
          // ========================================================
          // ENEMY WEAPON STRIKE ON PLAYER (Non-practice mode only)
          // ========================================================
          const isFrontalOrRear = Math.abs(pHitForward) >= 0.25 || Math.abs(pHitForward) >= Math.abs(pHitRight);

          // Realistic flipping criteria per user specification:
          // 1. Only flip when the other robot hits it VERTICALLY VERY HARD!
          //    - Weapon must be spinning at high RPM (>= 88 rad/s)
          //    - Travel speed must be fast (>= 6.5 m/s) with direct high-energy impact (>= 8.0 m/s or approach >= 4.5)
          //    - Vertical bite / lifting strike (frontal/rear weapon bite underneath chassis or vertical launch)
          // 2. "Not every hit is a flip ... only sometime flip":
          //    - Even on hard vertical hits, only a ~24% probability to flip;
          //    - The other ~76% of hard hits cause heavy knockback, sparks, pop on wheels (NO flip).
          const isEWeaponMax = (enemyBot.weaponActive !== false && enemyBot.weaponSpinSpeed >= 88.0);
          const isETravelFast = (eSpeedBefore >= 6.5 && (eApproach >= 4.5 || impactSpeed >= 8.0));
          const isVerticalBiteE = isFrontalOrRear || (enemyBot.vy > 0.35);
          const isHardVerticalHitE = isEWeaponMax && isETravelFast && isVerticalBiteE;
          const canFlipPlayer = isHardVerticalHitE && (Math.random() < 0.24);
          const wasPlayerFlipped = playerBot.flipped;

          AudioSys.metalClashSound(canFlipPlayer ? 2.2 : 1.8, true);
          AudioSys.weaponSliceSound();
          if (canFlipPlayer) {
            AudioSys.crowdCheer(0.85, 1.6);
            addCameraTrauma(0.70);
            triggerGamepadRumble(0.9, 300);
            triggerHitStop(0.045);
          } else {
            addCameraTrauma(0.38);
            triggerGamepadRumble(0.60, 200);
          }

          // Attacker Weapon Recoil (Newton's 3rd Law counter-force — strictly horizontal so attacker stays grounded)
          const eRecoil = canFlipPlayer ? 3.4 : 1.8;
          enemyBot.vx += nx * eRecoil;
          enemyBot.vz += nz * eRecoil;

          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: canFlipPlayer ? 2.2 : 1.8, h: true });
            NetworkSys.queueEvent({ t: 'slice' });
          }

          if (canFlipPlayer) {
            // WEIGHTY, CONTROLLED, REALISTIC FLIP (NO dramatic catapulting into the ceiling!)
            playerBot.vy = 2.1 + Math.random() * 0.35;
            playerBot.airY = 0.15;
            playerBot.vx -= nx * (5.5 + impactSpeed * 0.40);
            playerBot.vz -= nz * (5.5 + impactSpeed * 0.40);

            if (isFrontalOrRear) {
              playerBot.pitchVel = (pHitForward > 0 ? -8.5 : 8.5);
              playerBot.rollVel = (Math.random() - 0.5) * 2.5;
            } else {
              playerBot.rollVel = (pHitRight > 0 ? -8.5 : 8.5);
              playerBot.pitchVel = (Math.random() - 0.5) * 2.5;
            }
            playerBot.flipped = true;

            spawnCollisionSparks(midPos, 45);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 45 });
            }
          } else {
            // CONTROLLED SOLID HIT: HEAVY PUSHBACK ON WHEELS, NO FLIP & NO JUMPY HOP!
            playerBot.vy = 0;
            playerBot.airY = 0;
            playerBot.vx -= nx * (4.0 + impactSpeed * 0.45);
            playerBot.vz -= nz * (4.0 + impactSpeed * 0.45);

            if (isFrontalOrRear) {
              playerBot.pitchVel = (pHitForward > 0 ? -1.2 : 1.2);
              playerBot.rollVel = 0;
            } else {
              playerBot.rollVel = (pHitRight > 0 ? -1.2 : 1.2);
              playerBot.pitchVel = 0;
            }
            // Firmly remains on wheels: NO playerBot.flipped = true

            spawnCollisionSparks(midPos, 24);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 24 });
            }
          }

          if (typeof matchState === 'undefined' || matchState !== 'menu') {
            enemyBot.weaponSpinSpeed = 0;
            playerBot.weaponSpinSpeed = 0;
            AudioSys.weaponStallSound();
          } else {
            enemyBot.weaponSpinSpeed = 95.0;
            playerBot.weaponSpinSpeed = 95.0;
          }
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'stall' });
          }

          triggerDamageVignette();

          // Parts fly off 1 by 1 with each solid hit until NOTHING left!
          detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
          if (canFlipPlayer || impactSpeed > 6.0) {
            detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
          }

          if (playerBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
          }
          if (!wasPlayerFlipped && playerBot.flipped) {
            AudioSys.crowdGasp(0.8);
          }
        } else {
          // ========================================================
          // CHASSIS / BUMPER / WEDGE COLLISION (RAMMING)
          // ========================================================
          AudioSys.metalClashSound(Math.min(1.8, 0.55 + impactSpeed * 0.22), false);
          addCameraTrauma(Math.min(0.35, 0.08 + impactSpeed * 0.04));
          triggerGamepadRumble(Math.min(0.55, 0.2 + impactSpeed * 0.06), 140);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: Math.min(1.8, 0.55 + impactSpeed * 0.22), h: false });
          }

          if (isPractice) {
            // Practice dummy: detach parts 1 by 1 on solid hits and trigger 20% explosion when player weapon is active!
            if (playerBot.weaponActive !== false && !playerBot.weaponDestroyed && impactSpeed > 4.2) {
              enemyBot.vy = 0;
              enemyBot.airY = 0;
              enemyBot.rollVel = (eHitRight > 0 ? -1.5 : 1.5);
              detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
              if (enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
              }
            }
          } else {
            // Real combat: only inflict damage if attacking robot has weapon enabled
            const pIsAttacker = (pApproach > 1.2 && pApproach > eApproach * 1.15);
            const eIsAttacker = (eApproach > 1.2 && eApproach > pApproach * 1.15);

            if (pIsAttacker && playerBot.weaponActive !== false) {
              // Player rammed Enemy with active weapon: detach part 1 by 1 (stay planted on floor, no jumpy hop)!
              if (impactSpeed > 4.2) {
                enemyBot.vy = 0;
                enemyBot.airY = 0;
                enemyBot.rollVel = (eHitRight > 0 ? -1.5 : 1.5);
                detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
              }
              if (enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
              }
            } else if (eIsAttacker && enemyBot.weaponActive !== false) {
              // Enemy rammed Player with active weapon: detach part 1 by 1 (stay planted on floor, no jumpy hop)!
              triggerDamageVignette();
              if (impactSpeed > 4.2) {
                playerBot.vy = 0;
                playerBot.airY = 0;
                playerBot.rollVel = (pHitRight > 0 ? -1.5 : 1.5);
                detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
              }
              if (playerBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
              }
            } else if (playerBot.weaponActive !== false && enemyBot.weaponActive !== false) {
              // Mutual bumper crunch: detach 1 part on hard collision
              if (impactSpeed > 4.5) {
                detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
                detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
              }
              if (playerBot.isEntirelyDestroyed && enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, true, true, true);
              } else if (playerBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
              } else if (enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
              }
            }
          }
        }
      }
    }
  }

    let lastCountoutSec = 10;
  let countoutHornPlayed = false;

  function updateImmobilizationAndCountout(dt) {
    if (typeof matchState === 'undefined' || matchState !== 'playing') return;
    if (!playerBot || !enemyBot) return;

    const warnContainer = document.getElementById('flip-warning-container');
    const warnWho = document.getElementById('flip-who-text');
    const warnNum = document.getElementById('flip-timer-num');
    const flipPill = warnContainer ? warnContainer.querySelector('.flip-pill span') : null;
    if (!warnContainer || !warnWho || !warnNum) return;

    // 1. Instant Win / Draw on Total Destruction (when all parts have flown off!) -> triggers 5s celebration delay
    if (playerBot.isEntirelyDestroyed && enemyBot.isEntirelyDestroyed) {
      warnContainer.classList.add('hidden');
      countoutHornPlayed = false;
      endMatch(false, true, true, true);
      return;
    }
    if (playerBot.isEntirelyDestroyed) {
      warnContainer.classList.add('hidden');
      countoutHornPlayed = false;
      endMatch(false, false, true, true);
      return;
    }
    if (enemyBot.isEntirelyDestroyed) {
      warnContainer.classList.add('hidden');
      countoutHornPlayed = false;
      endMatch(true, false, true, true);
      return;
    }

    // 2. BattleBots Referee 10-Second Count-out for Immobilization & Mutual Stalemate (Draw):
    // A bot cannot move or fight back if:
    // - Flipped onto back/side (cannot drive)
    // - All drive wheels detached (cannot translate)
    // - Drive burnout / power lost (drivePower <= 0 or driveHealth <= 0)
    const pSpeed = Math.hypot(playerBot.vx || 0, playerBot.vz || 0);
    const eSpeed = Math.hypot(enemyBot.vx || 0, enemyBot.vz || 0);

    const pNoWheels = (!playerBot.wheels || playerBot.wheels.length === 0 || playerBot.wheels.filter(w => w.attached).length === 0);
    const eNoWheels = (!enemyBot.wheels || enemyBot.wheels.length === 0 || enemyBot.wheels.filter(w => w.attached).length === 0);

    const pNoDrive = (playerBot.driveHealth <= 0) || (playerBot.drivePower <= 0);
    const eNoDrive = (enemyBot.driveHealth <= 0) || (enemyBot.drivePower <= 0);

    const isPImmobilized = !!playerBot.flipped || pNoWheels || pNoDrive;
    const isEImmobilized = !!enemyBot.flipped || eNoWheels || eNoDrive;

    const isPStopped = isPImmobilized && (pSpeed < 1.8 || (playerBot.stoppedTimer || 0) > 0.1 || (bothCantFightTimer || 0) > 0.1);
    const isEStopped = isEImmobilized && (eSpeed < 1.8 || (enemyBot.stoppedTimer || 0) > 0.1 || (bothCantFightTimer || 0) > 0.1);

    const isGuestOnline = (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && !NetworkSys.isHost);

    // Check if BOTH robots cannot fight:
    // (a) Both robots are immobilized (flipped, wheelless, or motor burnout), OR
    // (b) Both robots' weapons are destroyed in non-practice mode (neither robot can deal damage anymore)
    const isPracticeMode = (typeof gameMode !== 'undefined' && gameMode === 'practice');
    const isBothImmobilized = isPImmobilized && isEImmobilized;
    const isBothWeaponsDestroyed = !isPracticeMode && (!!playerBot.weaponDestroyed && !!enemyBot.weaponDestroyed);
    const isBothCantFight = isBothImmobilized || isBothWeaponsDestroyed;

    if (typeof bothCantFightTimer !== 'number') bothCantFightTimer = 0.0;
    if (typeof playerBot.stoppedTimer !== 'number') playerBot.stoppedTimer = 0.0;
    if (typeof enemyBot.stoppedTimer !== 'number') enemyBot.stoppedTimer = 0.0;

    if (!isGuestOnline) {
      if (isBothCantFight) {
        bothCantFightTimer += dt;
        // Pause single-bot knockout timers while both robots are unable to fight so it resolves fairly as a DRAW
        playerBot.stoppedTimer = 0.0;
        enemyBot.stoppedTimer = 0.0;
      } else {
        bothCantFightTimer = 0.0;
        if (isPStopped) {
          playerBot.stoppedTimer += dt;
        } else {
          playerBot.stoppedTimer = 0.0;
        }

        if (isEStopped) {
          enemyBot.stoppedTimer += dt;
        } else {
          enemyBot.stoppedTimer = 0.0;
        }
      }
    }

    // 2A. Simultaneous Mutual Stalemate / Double Count-Out -> Referee 10s Countdown to DRAW!
    if (bothCantFightTimer > 0.4) {
      if (!countoutHornPlayed) {
        if (typeof AudioSys !== 'undefined' && AudioSys.refereeWarningHorn) {
          AudioSys.refereeWarningHorn();
        }
        if (typeof addCameraTrauma === 'function') {
          addCameraTrauma(0.25);
        }
        countoutHornPlayed = true;
      }

      warnContainer.classList.remove('hidden');
      if (flipPill) flipPill.textContent = '⚠️ DRAW COUNTDOWN IN';
      const remainingDrawTime = Math.max(0, 10.0 - bothCantFightTimer);
      const ceilDrawSec = Math.max(1, Math.ceil(remainingDrawTime));
      warnNum.textContent = String(ceilDrawSec);

      if (isBothImmobilized) {
        warnWho.textContent = 'BOTH ROBOTS IMMOBILIZED — REFEREE DRAW COUNTDOWN!';
      } else if (isBothWeaponsDestroyed) {
        warnWho.textContent = 'BOTH WEAPONS DESTROYED (CANNOT FIGHT) — DRAW COUNTDOWN!';
      } else {
        warnWho.textContent = 'BOTH ROBOTS UNABLE TO FIGHT — DRAW COUNTDOWN!';
      }

      if (ceilDrawSec !== lastCountoutSec) {
        lastCountoutSec = ceilDrawSec;
        if (typeof AudioSys !== 'undefined' && AudioSys.alarmBeep) {
          AudioSys.alarmBeep(ceilDrawSec);
        }
      }

      if (!isGuestOnline && bothCantFightTimer >= 10.0) {
        warnContainer.classList.add('hidden');
        countoutHornPlayed = false;
        bothCantFightTimer = 0.0;
        endMatch(false, true, true, false); // Declared a DRAW by Referee Count-Out!
      }
      return;
    }

    let activeBot = null;
    let isPlayerTarget = false;

    if (enemyBot.stoppedTimer > 0.4 && enemyBot.stoppedTimer >= playerBot.stoppedTimer) {
      activeBot = enemyBot;
      isPlayerTarget = false;
    } else if (playerBot.stoppedTimer > 0.4) {
      activeBot = playerBot;
      isPlayerTarget = true;
    }

    if (activeBot) {
      // Sound referee warning horn on first trigger
      if (!countoutHornPlayed) {
        if (typeof AudioSys !== 'undefined' && AudioSys.refereeWarningHorn) {
          AudioSys.refereeWarningHorn();
        }
        if (typeof addCameraTrauma === 'function') {
          addCameraTrauma(0.25);
        }
        countoutHornPlayed = true;
      }

      warnContainer.classList.remove('hidden');
      if (flipPill) flipPill.textContent = '⚠️ COUNTDOWN K.O. IN';
      const remainingTime = Math.max(0, 10.0 - activeBot.stoppedTimer);
      const ceilSec = Math.max(1, Math.ceil(remainingTime));
      warnNum.textContent = String(ceilSec);

      // In Online Guest mode, playerBot is Opponent (Host) and enemyBot is Player (Guest)
      const isMyRobotImmobilized = isGuestOnline ? !isPlayerTarget : isPlayerTarget;
      const targetNoWheels = isPlayerTarget ? pNoWheels : eNoWheels;
      const targetFlipped = isPlayerTarget ? playerBot.flipped : enemyBot.flipped;

      if (gameMode === '1v1') {
        const whoTag = isPlayerTarget ? 'P1' : 'P2';
        if (targetNoWheels) {
          warnWho.textContent = `${whoTag} ALL WHEELS DETACHED (IMMOBILIZED)!`;
        } else if (targetFlipped) {
          warnWho.textContent = `${whoTag} FLIPPED OVER — REFEREE COUNTDOWN!`;
        } else {
          warnWho.textContent = `${whoTag} MOTOR BURNOUT (IMMOBILIZED)!`;
        }
      } else if (isMyRobotImmobilized) {
        if (targetNoWheels) {
          warnWho.textContent = 'PLAYER WHEELS DETACHED — REFEREE COUNTDOWN!';
        } else if (targetFlipped) {
          warnWho.textContent = 'PLAYER FLIPPED OVER — REFEREE COUNTDOWN!';
        } else {
          warnWho.textContent = 'PLAYER IMMOBILIZED — REFEREE COUNTDOWN!';
        }
      } else {
        if (targetNoWheels) {
          warnWho.textContent = 'ENEMY WHEELS DETACHED — REFEREE COUNTDOWN!';
        } else if (targetFlipped) {
          warnWho.textContent = 'ENEMY FLIPPED OVER — REFEREE COUNTDOWN!';
        } else {
          warnWho.textContent = 'ENEMY IMMOBILIZED — REFEREE COUNTDOWN!';
        }
      }

      if (ceilSec !== lastCountoutSec) {
        lastCountoutSec = ceilSec;
        if (typeof AudioSys !== 'undefined' && AudioSys.alarmBeep) {
          AudioSys.alarmBeep(ceilSec);
        }
      }

      // 10-Second Count-Out Completed: KNOCKOUT!
      if (!isGuestOnline && activeBot.stoppedTimer >= 10.0) {
        warnContainer.classList.add('hidden');
        countoutHornPlayed = false;
        endMatch(!isPlayerTarget, false, true, false); // KO by Countout (isTotalDestruction = false)
      }
    } else {
      lastCountoutSec = 10;
      countoutHornPlayed = false;
      warnContainer.classList.add('hidden');
    }
  }

  // Persistent smoothed camera targets to eliminate violent collision micro-jitter
  const currentCamLookTarget = new THREE.Vector3(0, 0.75, 0);
  let smoothCamHeading = 0;
  let smoothCameraInitialized = false;


  function updateBotVisuals(bot, dt) {
    if (!bot || !bot.root) return;
    const effectiveRoll = (bot.roll || 0) + (bot.wheelTilt || 0);
    bot.groundElevation = getBotGroundElevation(bot, bot.pitch, effectiveRoll);
    bot.root.position.set(bot.x, (bot.airY || 0) + (bot.groundElevation || 0), bot.z);
    bot.root.rotation.y = bot.yaw;
    if (bot.tiltGroup) {
      bot.tiltGroup.rotation.x = bot.pitch;
      bot.tiltGroup.rotation.z = effectiveRoll;
    }
    if (bot.weaponMesh && bot.weaponSpinSpeed) {
      if (bot.type === 'robot1') {
        const robot1SpindleAxis = new THREE.Vector3(0, Math.cos((10.0 * Math.PI) / 180), Math.sin((10.0 * Math.PI) / 180)).normalize();
        bot.weaponAngle = ((bot.weaponAngle || 0) + bot.weaponSpinSpeed * dt) % (Math.PI * 2);
        bot.weaponMesh.quaternion.setFromAxisAngle(robot1SpindleAxis, bot.weaponAngle);
      } else if (bot.type === 'robot2') {
        bot.weaponMesh.rotation.x -= bot.weaponSpinSpeed * dt;
      } else if (bot.type === 'robot3') {
        bot.weaponMesh.rotation.y += bot.weaponSpinSpeed * dt;
      } else {
        bot.weaponMesh.rotation.x += bot.weaponSpinSpeed * dt;
      }
    }
    if (bot.wheels) {
      const fwdVel = Math.hypot(bot.vx || 0, bot.vz || 0);
      const spinAngle = (fwdVel / 0.45) * dt;
      bot.wheels.forEach(w => {
        if (w.mesh && w.attached) w.mesh.rotation.x += spinAngle;
      });
    }
    if (!bot.cadAttached) {
      if (bot.type === 'robot1' && typeof attachCadToRobot1 === 'function') attachCadToRobot1(bot);
      if (bot.type === 'robot2' && typeof attachCadToRobot2 === 'function') attachCadToRobot2(bot);
      if (bot.type === 'robot3' && typeof attachCadToRobot3 === 'function') attachCadToRobot3(bot);
      if (bot.type === 'robot4' && typeof attachCadToRobot4 === 'function') attachCadToRobot4(bot);
      if (bot.type === 'robot5' && typeof attachCadToRobot5 === 'function') attachCadToRobot5(bot);
      if (bot.type === 'robot6' && typeof attachCadToRobot6 === 'function') attachCadToRobot6(bot);
    }
  }

