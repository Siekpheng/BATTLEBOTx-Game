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

    if (!bot.totalInitialWheels && totalWheels > 0) {
      bot.totalInitialWheels = totalWheels;
    }
    const maxWheels = Math.max(1, (bot.wheels && bot.wheels.length > 0) ? bot.wheels.length : (bot.totalInitialWheels || 2));

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
      bot.drivePower = (bot.driveHealth / (bot.maxDriveHealth || 300)) * (0.25 + 0.75 * wheelFactor);
    }

    const botSpecs = (typeof getBotCombatSpecs === 'function')
      ? getBotCombatSpecs(bot.type)
      : { maxSpeed: (bot.type === 'robot6' ? 19.5 : 15.0), turnRate: (bot.type === 'robot6' ? 4.6 : 3.4), accel: (bot.type === 'robot6' ? 68.0 : 46.0), wallRadius: (bot.type === 'robot6' ? 0.95 : 1.32), gyroFactor: 1.0 };
    const maxSpeed = botSpecs.maxSpeed * (0.35 + 0.65 * bot.drivePower);
    let turnRate = botSpecs.turnRate * (0.35 + 0.65 * bot.drivePower);
    const accel = botSpecs.accel * bot.drivePower;

    const hasSpinningWeapon = (bot.weaponMesh && !bot.weaponDestroyed && (bot.weaponSpinSpeed || 0) > 15.0);
    const spinFactor = hasSpinningWeapon ? Math.min(1.0, bot.weaponSpinSpeed / (botSpecs.maxWeaponRpm || 95.0)) : 0;
    const isVertSpinner = (bot.type === 'robot1' || bot.type === 'robot4' || bot.type === 'robot5' || bot.type === 'robot6');
    const gyroMult = botSpecs.gyroFactor || 1.0;

    // Realistic BattleBots Gyroscopic Turn Resistance:
    // When a vertical spinner is spinning at high RPM and turning hard, gyroscopic precession lifts the inside wheel,
    // reducing effective steering bite by up to ~18% (drivers can feather steering or throttle for tighter flat turns)
    if (hasSpinningWeapon && isVertSpinner && Math.abs(bot.steerInput || 0) > 0.25) {
      const gyroTurnPenalty = Math.min(0.24, Math.abs(bot.steerInput) * spinFactor * 0.16 * gyroMult);
      turnRate *= (1.0 - gyroTurnPenalty);
    }

    // Differential Skid-Steer Power Sharing:
    // When turning hard while accelerating, left/right drive motors split effort between yaw rotation and forward thrust
    const diffThrustShare = 1.0 - Math.abs(bot.steerInput || 0) * 0.14;

    // Driving ONLY if not flipped, has drive power, AND has at least 1 wheel attached!
    if (!bot.flipped && bot.drivePower > 0 && totalWheels > 0) {
      if ((bot.recoilLockTimer || 0) > 0) {
        bot.recoilLockTimer = Math.max(0, bot.recoilLockTimer - dt);
      }
      const recoilDriveFactor = ((bot.recoilLockTimer || 0) > 0) ? Math.max(0.0, 1.0 - (bot.recoilLockTimer / 0.28)) : 1.0;

      if (leftWheels > 0 && rightWheels === 0) {
        // Only left wheels: counter-steerable asymmetric drag
        const asymmetricPull = -0.75 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate + asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * 0.80 * diffThrustShare * dt * recoilDriveFactor;
        bot.vz += forwardZ * bot.throttleInput * accel * 0.80 * diffThrustShare * dt * recoilDriveFactor;
      } else if (rightWheels > 0 && leftWheels === 0) {
        // Only right wheels: counter-steerable asymmetric drag
        const asymmetricPull = 0.75 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate + asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * 0.80 * diffThrustShare * dt * recoilDriveFactor;
        bot.vz += forwardZ * bot.throttleInput * accel * 0.80 * diffThrustShare * dt * recoilDriveFactor;
      } else if (leftWheels > 0 && rightWheels > 0) {
        // Both sides have wheels
        const asymmetricPull = (leftWheels - rightWheels) * 0.25 * bot.throttleInput;
        bot.yaw -= (bot.steerInput * turnRate - asymmetricPull) * dt;
        const forwardX = Math.sin(bot.yaw);
        const forwardZ = Math.cos(bot.yaw);
        bot.vx += forwardX * bot.throttleInput * accel * diffThrustShare * dt * recoilDriveFactor;
        bot.vz += forwardZ * bot.throttleInput * accel * diffThrustShare * dt * recoilDriveFactor;
      }
    } else {
      if ((bot.recoilLockTimer || 0) > 0) {
        bot.recoilLockTimer = Math.max(0, bot.recoilLockTimer - dt);
      }
    }

    // Anisotropic Tire Grip & Rolling Friction (Authentic RC Combat Robot Handling on Steel Floor):
    // Decompose velocity into longitudinal (wheel rolling axis) and lateral (sideways tire scrub axis).
    // Rubber tires roll easily forward/backward, but resist sideways sliding with high lateral grip!
    const isRecoiling = ((bot.recoilLockTimer || 0) > 0);
    if (!bot.flipped && totalWheels > 0 && (!bot.airY || bot.airY <= 0.05)) {
      const fwdX = Math.sin(bot.yaw);
      const fwdZ = Math.cos(bot.yaw);
      const latX = Math.cos(bot.yaw);
      const latZ = -Math.sin(bot.yaw);

      const vForward = bot.vx * fwdX + bot.vz * fwdZ;
      const vLateral = bot.vx * latX + bot.vz * latZ;

      const fwdDampBase = isRecoiling ? 0.68 : 0.18;
      const forwardDamped = vForward * Math.pow(fwdDampBase, dt);
      // High lateral tire grip at normal speeds, with controlled drift if knocked sideways hard (> 5.5 m/s)
      const lateralGripBase = (Math.abs(vLateral) > 5.5 || isRecoiling) ? 0.095 : 0.028;
      const lateralDamped = vLateral * Math.pow(lateralGripBase, dt);

      bot.vx = fwdX * forwardDamped + latX * lateralDamped;
      bot.vz = fwdZ * forwardDamped + latZ * lateralDamped;
    } else {
      const dampBase = isRecoiling ? 0.68 : 0.18;
      bot.vx *= Math.pow(dampBase, dt);
      bot.vz *= Math.pow(dampBase, dt);
    }

    const speed = Math.hypot(bot.vx, bot.vz);
    const currentMaxSpeed = isRecoiling ? Math.max(maxSpeed, 24.0) : maxSpeed;
    if (speed > currentMaxSpeed) {
      bot.vx = (bot.vx / speed) * currentMaxSpeed;
      bot.vz = (bot.vz / speed) * currentMaxSpeed;
    }

    if ((totalWheels === 0 || bot.driveHealth <= 0 || remainingParts <= threshold20 || bot.isEntirelyDestroyed) && (!bot.airY || bot.airY <= 0.05)) {
      bot.vx = 0;
      bot.vz = 0;
    }

    bot.x += bot.vx * dt;
    bot.z += bot.vz * dt;

    // 4. Arena Wall Collision (Square 4x4m battlebox enclosure with per-robot CAD wallRadius)
    const botRadius = botSpecs.wallRadius || 1.32;
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
          triggerGamepadRumble(Math.min(0.55, 0.2 + Math.abs(velDot) * 0.08), 120, bot);
        }

        // Wall weapon collision: ONLY stall weapon if front crashes into arena wall at high speed (velDot > 5.2)
        // Pressing/sliding along the wall or pinning an opponent against the wall will NOT stall the weapon!
        const wallFrontDot = Math.sin(bot.yaw) * outNx + Math.cos(bot.yaw) * outNz;
        const minWallStallSpin = 55.0; // Equal threshold for both robots
        if (velDot > 5.2 && wallFrontDot > 0.45 && bot.weaponSpinSpeed >= minWallStallSpin) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(outNx * 0.8, 0.3, outNz * 0.8)), 25);
          AudioSys.metalClashSound(1.6, true);
          bot.weaponSpinSpeed = 0; // Stalls weapon briefly on hard wall crash, then automatically spins back up!
          bot.weaponStallTimer = 1.0;
          AudioSys.weaponStallSound();
        }
      }
    }

      // Vertical launch / air kinematics if tossed or popped by drum weapon
    const wasInAir = (bot.airY > 0.05);
    const impactLandingVy = bot.vy || 0;
    if (bot.vy || bot.airY > 0) {
      bot.airY = (bot.airY || 0) + bot.vy * dt;
      bot.vy -= 26.0 * dt; // Strong snappy gravity for heavy 250lb combat robots
      if (bot.airY <= 0) {
        bot.airY = 0;
        bot.vy = 0;
        if (wasInAir) {
          AudioSys.hitSound(0.65);
          if (impactLandingVy < -6.0) {
            spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 12);
          }
        }
      }
    } else {
      bot.airY = 0;
    }

    const inAir = (bot.airY > 0.05 || bot.vy > 0);

    // 2.2 WEAPON GYROSCOPIC PRECESSION & ANGULAR INERTIA (BattleBots Authentic Kinematics)
    if (inAir) {
      if (hasSpinningWeapon) {
        if (isVertSpinner) {
          // Vertical Spinner / Drum: Angular momentum is transverse (Pitch axis).
          // Mid-air pitch flip couples with yaw/roll precession, creating authentic dynamic roll twist
          const gyroRollPrecession = -Math.sign(bot.pitchVel || 1) * spinFactor * 4.2 * gyroMult;
          bot.rollVel += gyroRollPrecession * dt;
          // Mid-air gyroscopic pitch stiffness resists uncontrolled end-over-end pinwheeling
          bot.pitchVel *= Math.pow(0.50, dt);
        } else {
          // Horizontal Spinner (Robot 2, Robot 3): Angular momentum is vertical (Yaw axis).
          // Acts like a spinning gyroscope/frisbee: strongly resists pitching and rolling in mid-air,
          // keeping the chassis flat and level while airborne!
          bot.pitchVel *= Math.pow(0.18, dt);
          bot.rollVel  *= Math.pow(0.18, dt);
          // Subtle gyroscopic nutation wobble
          bot.roll += Math.sin(performance.now() * 0.025) * 0.035 * spinFactor;
        }
      }

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
      // On Ground: Vertical spinners turning sharp at full RPM visibly lift an inside edge wheel (authentic BattleBots Gyro Dance)
      const steerVal = (bot.steerInput || 0);
      if (hasSpinningWeapon && isVertSpinner && Math.abs(steerVal) > 0.22 && !bot.flipped) {
        const gyroDanceTilt = -steerVal * spinFactor * 0.12 * gyroMult;
        bot.roll = THREE.MathUtils.lerp(bot.roll, gyroDanceTilt, Math.min(1.0, 12.0 * dt));
      }
      // Ground Leveling & Flip Resting Physics
      if (bot.flipped) {
        // Flipped upside down on roof: cleanly settle inverted without oscillating
        const targetPitch = (bot.pitch > 0 ? Math.PI : -Math.PI);
        bot.pitch = THREE.MathUtils.lerp(bot.pitch, targetPitch, Math.min(1.0, 24.0 * dt));
        bot.pitchVel = 0;
        const targetRoll = (bot.roll > 0 ? Math.PI : -Math.PI);
        bot.roll = THREE.MathUtils.lerp(bot.roll, targetRoll, Math.min(1.0, 24.0 * dt));
        bot.rollVel = 0;
      } else {
        // Firmly grounded on wheels: critically damped alignment flat to the arena floor (zero goofy rocking!)
        bot.pitch = THREE.MathUtils.lerp(bot.pitch, 0, Math.min(1.0, 32.0 * dt));
        bot.pitchVel = 0;
        bot.roll = THREE.MathUtils.lerp(bot.roll, 0, Math.min(1.0, 32.0 * dt));
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

      // 1. Process weapon stall cooldown timer (from hard impacts or ESC trips)
      if (bot.weaponStallTimer > 0) {
        bot.weaponStallTimer = Math.max(0, bot.weaponStallTimer - dt);
      }

      // 2. >70% DAMAGE WEAPON MOTOR & BELT BREAKDOWN + TOTAL DEMOLITION SHUTDOWN:
      // Once a robot suffers over 70% damage (<= 30% HP or <= 30% parts remaining), its weapon belt and motor break
      // permanently so the weapon can no longer spin!
      const maxHpWeaponCheck = bot.maxDriveHealth || 900;
      const threshold30Parts = (bot.totalInitialParts && bot.totalInitialParts > 0)
        ? Math.max(1, Math.floor(bot.totalInitialParts * 0.30))
        : 2;
      const isOver70PercentDamage = (remainingParts <= threshold30Parts) ||
        (bot.driveHealth < maxHpWeaponCheck * 0.30) ||
        (typeof getBotDamagePercent === 'function' && getBotDamagePercent(bot) > 70);

      if (!bot.weaponDestroyed && (isOver70PercentDamage || bot.driveHealth <= 0 || bot.isEntirelyDestroyed)) {
        bot.weaponDestroyed = true;
        bot.weaponMotorBroken = true;
        bot.weaponActive = false;
        bot.weaponSpinSpeed = 0;
        bot.weaponStallTimer = 0;
        if (typeof AudioSys !== 'undefined' && AudioSys.weaponStallSound) AudioSys.weaponStallSound();
        if (bot.root) {
          const breakPos = bot.root.position.clone().add(new THREE.Vector3(0, 0.35, 0));
          spawnCollisionSparks(breakPos, 24);
          try {
            if (typeof scene !== 'undefined' && typeof detachedDebris !== 'undefined') {
              const beltGeo = new THREE.TorusGeometry(0.16, 0.024, 6, 16, Math.PI * 1.65);
              beltGeo._isClonedDebris = true;
              const beltMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.85, metalness: 0.1 });
              beltMat._isClonedDebris = true;
              const beltMesh = new THREE.Mesh(beltGeo, beltMat);
              beltMesh.position.copy(breakPos);
              scene.add(beltMesh);
              detachedDebris.push({
                mesh: beltMesh,
                isWheel: false,
                vx: (Math.random() - 0.5) * 6.5,
                vy: 4.8 + Math.random() * 2.5,
                vz: (Math.random() - 0.5) * 6.5,
                rx: (Math.random() - 0.5) * 22,
                ry: (Math.random() - 0.5) * 22,
                rz: (Math.random() - 0.5) * 22
              });
            }
          } catch (e) {}
        }
      }

      if (bot.weaponDestroyed) {
        // Weapon blade remains completely stationary (0 RPM) when destroyed!
        bot.weaponSpinSpeed = 0;
        bot.weaponActive = false;
      } else if (gameMode === 'practice' && bot === enemyBot) {
        // Practice dummy weapon stays completely disarmed & inactive (0 RPM)
        bot.weaponSpinSpeed = 0;
      } else if (bot.driveHealth <= 0 || bot.isEntirelyDestroyed) {
        // Internal motor burnout spins down kinetic weapon
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - 20.0 * dt);
        if (Math.random() < 0.05) {
          spawnCollisionSparks(bot.root.position.clone().add(new THREE.Vector3(0, 0.35, 0)), 1);
        }
      } else if (bot.flipped) {
        // Flipped upside down: weapon stalls down to 0 while inverted (resumes automatically if righted)
        const spinDownDecel = 45.0;
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - spinDownDecel * dt);
      } else if (bot.weaponStallTimer > 0) {
        // Weapon currently stalled from heavy impact/shock: remains stopped at 0 RPM
        const spinDownDecel = 60.0;
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - spinDownDecel * dt);
      } else if (bot.weaponActive === false) {
        // Weapon motor turned OFF by player: smooth mechanical inertia spindown until stopped
        const spinDownDecel = 24.0; // Smooth realistic deceleration (~4.0s from full 95 rad/s)
        bot.weaponSpinSpeed = Math.max(0, bot.weaponSpinSpeed - spinDownDecel * dt);
      } else {
        // Continuous electric brushless motor wind-up towards each robot's unique max weapon speed & wind-up rate
        const botWpSpecs = (typeof getBotCombatSpecs === 'function')
          ? getBotCombatSpecs(bot.type)
          : { maxWeaponRpm: (bot.type === 'robot3' ? 102.0 : 95.0), windUpRate: (bot.type === 'robot3' ? 25.5 : 38.0) };
        const targetSpin = botWpSpecs.maxWeaponRpm;
        const windUpRate = botWpSpecs.windUpRate;
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

    const eHasWheels = (enemyBot.wheels && enemyBot.wheels.length > 0 && enemyBot.wheels.some(w => w.attached !== false)) ||
      (enemyBot.detachableParts && enemyBot.detachableParts.some(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent));
    const eNoWheels = !eHasWheels;
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

    // In Online 1v1, enemyBot is driven exclusively by the remote player - never by local AI!
    if ((typeof NetworkSys !== 'undefined' && NetworkSys.isOnline) || gameMode === '1v1_online') {
      return;
    }

    if (gameMode === '1v1') {
      if (enemyBot.flipped) {
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

    const eSpecsAI = (typeof getBotCombatSpecs === 'function') ? getBotCombatSpecs(enemyBot.type) : { maxWeaponRpm: 95 };
    const pSpecsAI = (typeof getBotCombatSpecs === 'function') ? getBotCombatSpecs(playerBot.type) : { maxWeaponRpm: 95 };
    const weaponReady = (enemyBot.weaponSpinSpeed >= (eSpecsAI.maxWeaponRpm || 95) * 0.62) || enemyBot.weaponDestroyed;
    const playerWeaponDangerous = (playerBot.weaponActive !== false && (playerBot.weaponSpinSpeed || 0) >= (pSpecsAI.maxWeaponRpm || 95) * 0.55 && !playerBot.weaponDestroyed);

    // Authentic BattleBots RC Pilot Tactics:
    // 1. Box-Rush Opportunity: If player's weapon is stalled or still spinning up (< 55% RPM) and AI is close/mid-range,
    //    commit to an aggressive box-rush to pin/stifle the player before their weapon reaches lethal RPM!
    const boxRushOpportunity = !playerWeaponDangerous && (enemyBot.weaponSpinSpeed >= 35.0 || enemyBot.type === 'robot2');

    // 2. Spin-Up Repositioning: If AI's weapon stalled on impact while player's weapon IS spinning dangerously,
    //    angle away toward open arena center to let the brushless weapon motor spin back up!
    if (!weaponReady && !boxRushOpportunity && distToPlayer < 4.2) {
      const centerYaw = Math.atan2(-enemyBot.x, -enemyBot.z);
      let escapeDiff = centerYaw - enemyBot.yaw;
      while (escapeDiff > Math.PI) escapeDiff -= Math.PI * 2;
      while (escapeDiff < -Math.PI) escapeDiff += Math.PI * 2;
      enemyBot.throttleInput = -0.68;
      enemyBot.steerInput = Math.max(-1, Math.min(1, escapeDiff * 1.6));
    } else {
      // 3. Tactical Flanking / Wheel-Sniping for agile robots (Robot 6 Vortex, Robot 1 Razor, Robot 5 BlueThunder):
      //    When approaching from mid-range (2.3m - 6.5m) while player faces AI head-on, aim slightly toward player's side wheels!
      let aimDiff = diff;
      const isAgileFlanker = (enemyBot.type === 'robot6' || enemyBot.type === 'robot1' || enemyBot.type === 'robot5');
      if (isAgileFlanker && distToPlayer > 2.3 && distToPlayer < 6.5 && playerWeaponDangerous) {
        const pFacingAI = -(Math.sin(playerBot.yaw) * (dx / (distToPlayer || 1)) + Math.cos(playerBot.yaw) * (dz / (distToPlayer || 1)));
        if (pFacingAI > 0.65) {
          const flankSide = (Math.sin(performance.now() * 0.0008) >= 0) ? 1 : -1;
          const flankAngle = (enemyBot.type === 'robot6') ? 0.34 : 0.22;
          aimDiff += flankSide * flankAngle;
        }
      }

      const steerTarget = Math.max(-1, Math.min(1, -aimDiff * 1.9));
      enemyBot.steerInput += (steerTarget - enemyBot.steerInput) * Math.min(1, dt * 8.5);

      // Throttle scaling: commit full charge when aligned and spun up (or during a box-rush)
      if ((weaponReady || boxRushOpportunity) && Math.abs(aimDiff) < 0.48) {
        enemyBot.throttleInput = 1.0; // High-speed kinetic charge (100% full speed, equal to P1)
      } else if (Math.abs(aimDiff) < 1.0) {
        enemyBot.throttleInput = 0.78; // Controlled pacing
      } else {
        enemyBot.throttleInput = 0.45; // Turning into alignment
      }
    }
  }

  function handleBotCollision() {
    if (!playerBot || !enemyBot) return;
    const pSpecs = (typeof getBotCombatSpecs === 'function') ? getBotCombatSpecs(playerBot.type) : { mass: 250, weaponReach: 0.35, weaponWidth: 0.90, weaponHalfWidth: 0.45, pushTractionMult: 1.0, maxWeaponRpm: 95, attackStall: 0.8, defendStall: 1.2, flingBase: 4.0, flingSpeedMult: 0.45, flipChance: 0.24, flipResistance: 1.0, partDamageChance: 0.50, partDamageHigh: 1, collisionRadius: 1.12, wedgeRating: 1.0 };
    const eSpecs = (typeof getBotCombatSpecs === 'function') ? getBotCombatSpecs(enemyBot.type) : { mass: 250, weaponReach: 0.35, weaponWidth: 0.90, weaponHalfWidth: 0.45, pushTractionMult: 1.0, maxWeaponRpm: 95, attackStall: 0.8, defendStall: 1.2, flingBase: 4.0, flingSpeedMult: 0.45, flipChance: 0.24, flipResistance: 1.0, partDamageChance: 0.50, partDamageHigh: 1, collisionRadius: 1.12, wedgeRating: 1.0 };

    const dx = enemyBot.x - playerBot.x;
    const dz = enemyBot.z - playerBot.z;
    const dist = Math.hypot(dx, dz);
    const pRad = pSpecs.collisionRadius || 1.12;
    const eRad = eSpecs.collisionRadius || 1.12;
    const minDist = pRad + eRad;

    const nowPerf = performance.now();
    const wasInContactRecently = !!(window._lastBotContactPerf && (nowPerf - window._lastBotContactPerf < 320));
    const grindEnvelope = wasInContactRecently ? 0.14 : 0.0;

    if (dist < (minDist + grindEnvelope) && dist > 0.0001) {
      window._lastBotContactPerf = nowPerf;
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = Math.max(0, minDist - dist);

      // Mass-weighted separation (all full-size robots 1-5 have identical 250 lb mass; Robot 6 is the only lightweight bot at 160 lb)
      const pWeight = (pSpecs.mass || 250);
      const eWeight = (eSpecs.mass || 250);
      const totalWeight = pWeight + eWeight || 1;
      const pMoveRatio = eWeight / totalWeight;
      const eMoveRatio = pWeight / totalWeight;

      if (overlap > 0) {
        playerBot.x -= nx * overlap * pMoveRatio;
        playerBot.z -= nz * overlap * pMoveRatio;
        enemyBot.x += nx * overlap * eMoveRatio;
        enemyBot.z += nz * overlap * eMoveRatio;
      }

      const rvx = playerBot.vx - enemyBot.vx;
      const rvz = playerBot.vz - enemyBot.vz;
      const impactSpeed = Math.hypot(rvx, rvz);

      // Active Combat Engagement ("No Mercy"):
      // Whenever the two robots collide or strike each other during a match,
      // immediately reset the 10-second Referee KO / Draw countdowns and hold a 2.5s engagement grace window
      // so the attacking robot can keep fighting for No Mercy Total Destruction without a premature KO count-out!
      if (typeof matchState !== 'undefined' && matchState === 'playing') {
        combatEngageTimer = 2.5;
        if (playerBot) playerBot.stoppedTimer = 0.0;
        if (enemyBot) enemyBot.stoppedTimer = 0.0;
        bothCantFightTimer = 0.0;
      }

      // Record pre-impact speeds and approach velocities
      const pSpeedBefore = Math.hypot(playerBot.vx, playerBot.vz);
      const eSpeedBefore = Math.hypot(enemyBot.vx, enemyBot.vz);
      const pApproach = Math.max(0, playerBot.vx * nx + playerBot.vz * nz);
      const eApproach = Math.max(0, enemyBot.vx * (-nx) + enemyBot.vz * (-nz));

      // Relative normal velocity (closing speed along collision normal)
      const relNormalVel = (playerBot.vx - enemyBot.vx) * nx + (playerBot.vz - enemyBot.vz) * nz;

      const pFwdDot = Math.sin(playerBot.yaw) * nx + Math.cos(playerBot.yaw) * nz;
      const eFwdDot = -(Math.sin(enemyBot.yaw) * nx + Math.cos(enemyBot.yaw) * nz);

      // Local impact direction relative to each bot's heading:
      const pHitForward = nx * Math.sin(playerBot.yaw) + nz * Math.cos(playerBot.yaw);
      const pHitRight   = nx * Math.cos(playerBot.yaw) - nz * Math.sin(playerBot.yaw);
      const eHitForward = (-nx) * Math.sin(enemyBot.yaw) + (-nz) * Math.cos(enemyBot.yaw);
      const eHitRight   = (-nx) * Math.cos(enemyBot.yaw) - (-nz) * Math.sin(enemyBot.yaw);

      // Lateral distance (meters from chassis center line) of the collision contact interface:
      const pContactOffset = Math.abs(pHitRight) * pRad;
      const eContactOffset = Math.abs(eHitRight) * eRad;

      const pReach = pSpecs.weaponReach;
      const eReach = eSpecs.weaponReach;
      const pWeaponHalfWidth = (pSpecs.weaponHalfWidth || 0.45);
      const eWeaponHalfWidth = (eSpecs.weaponHalfWidth || 0.45);

      // Precise 3D CAD Weapon Hitbox Verification:
      // A weapon ONLY connects if the contact is in front AND within the spinning weapon's physical width!
      // If contact is outside the weapon (e.g. Robot 2's wide corner plow or Robot 6's side frame),
      // the weapon does NOT connect, leaving that corner exposed to damage!
      const pWeaponAligned = (pHitForward > pReach && pContactOffset <= (pWeaponHalfWidth + 0.08));
      const eWeaponAligned = (eHitForward > eReach && eContactOffset <= (eWeaponHalfWidth + 0.08));

      const isPractice = (typeof gameMode !== 'undefined' && gameMode === 'practice');
      const isPrac = isPractice;
      const pHighSpinThreshold = Math.min((pSpecs.maxWeaponRpm || 95) * 0.38, 28.0);
      const eHighSpinThreshold = Math.min((eSpecs.maxWeaponRpm || 95) * 0.38, 28.0);

      const pWeaponCanStrike = (pWeaponAligned && playerBot.weaponActive !== false && !playerBot.weaponDestroyed && (playerBot.weaponStallTimer || 0) <= 0 && playerBot.weaponSpinSpeed >= pHighSpinThreshold);
      const eWeaponCanStrike = (!isPractice && eWeaponAligned && enemyBot.weaponActive !== false && !enemyBot.weaponDestroyed && (enemyBot.weaponStallTimer || 0) <= 0 && enemyBot.weaponSpinSpeed >= eHighSpinThreshold);

      // WEAPON-TO-WEAPON CLASH: Both weapons must physically align and strike each other!
      const isBothWeaponClash = pWeaponCanStrike && eWeaponCanStrike;

      // SINGLE WEAPON IMPACT: One weapon physically connects with the other robot's body/corner
      const isPWeaponImpact = isBothWeaponClash || (pWeaponCanStrike && (!wasInContactRecently || relNormalVel > 1.2 || impactSpeed > 2.0 || playerBot.weaponSpinSpeed >= (pSpecs.maxWeaponRpm || 95) * 0.80));
      const isEWeaponImpact = isBothWeaponClash || (eWeaponCanStrike && (!wasInContactRecently || relNormalVel > 1.2 || impactSpeed > 2.0 || enemyBot.weaponSpinSpeed >= (eSpecs.maxWeaponRpm || 95) * 0.80));
      const isKineticStrike = isBothWeaponClash || isPWeaponImpact || isEWeaponImpact;

      if (isKineticStrike) {
        // High-energy kinetic strikes apply explosive repulsive impulse below in weapon strike blocks
        const kineticRecoil = Math.min(3.6, impactSpeed * 0.30);
        playerBot.vx -= nx * kineticRecoil * pMoveRatio;
        playerBot.vz -= nz * kineticRecoil * pMoveRatio;
        enemyBot.vx += nx * kineticRecoil * eMoveRatio;
        enemyBot.vz += nz * kineticRecoil * eMoveRatio;
      } else {
        // ========================================================
        // 2.1 HEAD-ON BUMPER SPRING DAMPING (Eliminates Jitter & Ping-Pong Bouncing)
        // Inelastic steel crunch (e = 0.08) absorbs relative approach speed cleanly,
        // turning high-speed head-on rams into solid, crunchy, weighted collisions!
        // ========================================================
        if (overlap > 0 && relNormalVel > 0.04) {
          const restitution = 0.08; // 8% minimal bounce (solid steel energy absorption)
          const dampedNormalImpulse = (1.0 + restitution) * relNormalVel;
          playerBot.vx -= nx * dampedNormalImpulse * pMoveRatio;
          playerBot.vz -= nz * dampedNormalImpulse * pMoveRatio;
          enemyBot.vx += nx * dampedNormalImpulse * eMoveRatio;
          enemyBot.vz += nz * dampedNormalImpulse * eMoveRatio;
        }

        // Tangential contact friction: prevents frictionless sliding when locked horns
        const tx = -nz;
        const tz = nx;
        const relTangentialVel = (playerBot.vx - enemyBot.vx) * tx + (playerBot.vz - enemyBot.vz) * tz;
        const frictionImpulse = relTangentialVel * 0.24;
        playerBot.vx -= tx * frictionImpulse * pMoveRatio * 2.0;
        playerBot.vz -= tz * frictionImpulse * pMoveRatio * 2.0;
        enemyBot.vx += tx * frictionImpulse * eMoveRatio * 2.0;
        enemyBot.vz += tz * frictionImpulse * eMoveRatio * 2.0;

        // ========================================================
        // 2.1B AUTHENTIC WEDGE / GROUND-GAME & DIRECTIONAL PUSHING CONTEST
        // - Wheels can only push along the robot's heading (`|FwdDot|`); a T-boned sideways robot cannot push sideways!
        // - Low-profile front wedges (`wedgeRating`) slide underneath opponents when driving forward (`FwdDot > 0.65`),
        //   slightly lifting the opponent's edge and reducing their wheel traction!
        // ========================================================
        const pWheels = (playerBot.wheels && playerBot.wheels.length > 0)
          ? playerBot.wheels.filter(w => w.attached !== false).length
          : ((playerBot.detachableParts && playerBot.detachableParts.length > 0)
            ? playerBot.detachableParts.filter(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent).length
            : 2);
        const eWheels = (enemyBot.wheels && enemyBot.wheels.length > 0)
          ? enemyBot.wheels.filter(w => w.attached !== false).length
          : ((enemyBot.detachableParts && enemyBot.detachableParts.length > 0)
            ? enemyBot.detachableParts.filter(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent).length
            : 2);

        const pWheelAlignment = 0.18 + 0.82 * Math.abs(pFwdDot);
        const eWheelAlignment = 0.18 + 0.82 * Math.abs(eFwdDot);

        const pWedgeScore = (pFwdDot > 0.65 && (playerBot.throttleInput || 0) > 0.25 && !playerBot.flipped) ? (pSpecs.wedgeRating || 1.0) * pFwdDot : 0;
        const eWedgeScore = (!isPractice && eFwdDot > 0.65 && (enemyBot.throttleInput || 0) > 0.25 && !enemyBot.flipped) ? (eSpecs.wedgeRating || 1.0) * eFwdDot : 0;

        let pWedgeGripPenalty = 1.0;
        let eWedgeGripPenalty = 1.0;
        if (pWedgeScore > eWedgeScore + 0.12 && !enemyBot.flipped) {
          // Player's wedge gets underneath Enemy: lift Enemy slightly and reduce Enemy's wheel traction by 35%
          eWedgeGripPenalty = 0.65;
          enemyBot.pitch = THREE.MathUtils.lerp(enemyBot.pitch || 0, -0.11 * Math.sign(eFwdDot || 1), 0.18);
        } else if (eWedgeScore > pWedgeScore + 0.12 && !playerBot.flipped) {
          // Enemy's wedge gets underneath Player: lift Player slightly and reduce Player's wheel traction by 35%
          pWedgeGripPenalty = 0.65;
          playerBot.pitch = THREE.MathUtils.lerp(playerBot.pitch || 0, -0.11 * Math.sign(pFwdDot || 1), 0.18);
        }

        // Wheel traction: normalized to attached wheel ratio so 2-wheel and 4-wheel bots push with equal traction when intact
        const pMaxWheels = (playerBot.wheels && playerBot.wheels.length > 0) ? playerBot.wheels.length : ((playerBot.type === 'robot2' || playerBot.type === 'robot4' || playerBot.type === 'robot6') ? 4 : 2);
        const eMaxWheels = (enemyBot.wheels && enemyBot.wheels.length > 0) ? enemyBot.wheels.length : ((enemyBot.type === 'robot2' || enemyBot.type === 'robot4' || enemyBot.type === 'robot6') ? 4 : 2);
        const pWheelHealth = Math.min(1.0, Math.max(0.0, pWheels / pMaxWheels));
        const eWheelHealth = Math.min(1.0, Math.max(0.0, eWheels / eMaxWheels));

        const pTraction = pWheelHealth * (pSpecs.pushTractionMult || 1.0) * pWheelAlignment * pWedgeGripPenalty;
        const eTraction = eWheelHealth * (eSpecs.pushTractionMult || 1.0) * eWheelAlignment * eWedgeGripPenalty;
        const pDriveForce = (playerBot.throttleInput || 0) * (playerBot.drivePower || 0) * pTraction;
        const eDriveForce = (enemyBot.throttleInput || 0) * (enemyBot.drivePower || 0) * eTraction;
        const netPushTraction = (pDriveForce - eDriveForce) * 5.2 * 0.016;

        playerBot.vx += nx * netPushTraction;
        playerBot.vz += nz * netPushTraction;
        enemyBot.vx += nx * netPushTraction;
        enemyBot.vz += nz * netPushTraction;
      }

      // Realistic horizontal yaw deflection
      const yawTorque = (nx * (playerBot.vz - enemyBot.vz) - nz * (playerBot.vx - enemyBot.vx)) * 0.08;
      playerBot.yaw += yawTorque;
      enemyBot.yaw -= yawTorque;

      // Exact hull contact interface between the two robots (accurate even when Robot 6 collides with a full-size bot)
      const midPos = new THREE.Vector3(playerBot.x + nx * pRad, 0.3, playerBot.z + nz * pRad);
      // Only play discrete collision audio when there is an actual closing impact (not silent pushing/grinding)
      if (!wasInContactRecently && impactSpeed > 1.8) {
        AudioSys.metalClashSound(Math.min(2.6, 0.65 + impactSpeed * 0.26), impactSpeed > 5.0);
      }

      // ========================================================
      // CONTINUOUS WEAPON WIND-UP & GRINDING DAMAGE DURING RAMMING / PUSHING (v1.4.1 / 87c3892)
      // - Whenever robots are ramming/pushing in close contact (!isKineticStrike), weapons NEVER stall!
      // - The weapon winds up smoothly all the way to 100% RPM and stays spinning continuously while grinding.
      // - Deals continuous gradual health wear every frame and detaches 1 part every ~3.30s of continuous grinding
      //   (~4.65s for Robot 6's small weapon) without stalling the weapon or flinging the opponent away!
      // - Grinding ONLY triggers if the spinning weapon physically aligns with the contact point (not corner plow/frame!)
      // ========================================================
      const minGrindSpin = 12.0;
      const pSpinningContact = (!isKineticStrike && pWeaponAligned && playerBot.weaponActive !== false && !playerBot.weaponDestroyed && (playerBot.weaponStallTimer || 0) <= 0 && playerBot.weaponSpinSpeed >= minGrindSpin);
      const eSpinningContact = (!isKineticStrike && !isPractice && eWeaponAligned && enemyBot.weaponActive !== false && !enemyBot.weaponDestroyed && (enemyBot.weaponStallTimer || 0) <= 0 && enemyBot.weaponSpinSpeed >= minGrindSpin);

      if (pSpinningContact || eSpinningContact) {
        const pRpmRatio = pSpinningContact ? Math.min(1.0, playerBot.weaponSpinSpeed / (pSpecs.maxWeaponRpm || 95)) : 0;
        const eRpmRatio = eSpinningContact ? Math.min(1.0, enemyBot.weaponSpinSpeed / (eSpecs.maxWeaponRpm || 95)) : 0;
        const maxGrindRpmRatio = Math.max(pRpmRatio, eRpmRatio);

        // Continuous grinding sparks & metallic grinding sound (scales with current weapon RPM as it winds up)
        if (!window._lastWeaponGrindSparkTime || nowPerf - window._lastWeaponGrindSparkTime > 85) {
          window._lastWeaponGrindSparkTime = nowPerf;
          const grindSparkCount = Math.max(4, Math.round(5 + maxGrindRpmRatio * 10));
          spawnCollisionSparks(midPos, grindSparkCount);
          AudioSys.metalClashSound(0.55 + maxGrindRpmRatio * 0.45, false);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: grindSparkCount });
          }
        }

        // Continuous gradual health wear & part-shearing progress (weapon keeps spinning without stalling!)
        // Tuned for 3x longer battles: ~3.30s of continuous grinding per part detached (~4.65s for Robot 6)
        if (pSpinningContact) {
          const pGrindRate = 0.40 + 0.60 * pRpmRatio;
          playerBot._grindContactTimer = (playerBot._grindContactTimer || 0) + 0.016 * pGrindRate;
          const pContinuousDps = (playerBot.type === 'robot6') ? 3.0 : 5.5;
          enemyBot.driveHealth = Math.max(1, (enemyBot.driveHealth || 900) - pContinuousDps * pGrindRate * 0.016);

          const pGrindInterval = (playerBot.type === 'robot6') ? 4.65 : 3.30;
          if (playerBot._grindContactTimer >= pGrindInterval) {
            playerBot._grindContactTimer -= pGrindInterval;
            AudioSys.weaponSliceSound();
            const burstSparksP = (playerBot.type === 'robot6') ? 10 : 16;
            spawnCollisionSparks(midPos, burstSparksP);
            // Subtle grinding vibration jolt (does NOT fling opponent away or stall weapon!)
            enemyBot.vx += nx * 0.35;
            enemyBot.vz += nz * 0.35;
            detachSinglePart(enemyBot, { x: nx, z: nz }, midPos, null, true);
          }
        }

        if (eSpinningContact) {
          const eGrindRate = 0.40 + 0.60 * eRpmRatio;
          enemyBot._grindContactTimer = (enemyBot._grindContactTimer || 0) + 0.016 * eGrindRate;
          const eContinuousDps = (enemyBot.type === 'robot6') ? 3.0 : 5.5;
          playerBot.driveHealth = Math.max(1, (playerBot.driveHealth || 900) - eContinuousDps * eGrindRate * 0.016);

          const eGrindInterval = (enemyBot.type === 'robot6') ? 4.65 : 3.30;
          if (enemyBot._grindContactTimer >= eGrindInterval) {
            enemyBot._grindContactTimer -= eGrindInterval;
            AudioSys.weaponSliceSound();
            const burstSparksE = (enemyBot.type === 'robot6') ? 10 : 16;
            spawnCollisionSparks(midPos, burstSparksE);
            playerBot.vx -= nx * 0.35;
            playerBot.vz -= nz * 0.35;
            triggerDamageVignette();
            detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos, null, true);
          }
        }

        if (!isPractice && playerBot.isEntirelyDestroyed && enemyBot.isEntirelyDestroyed) {
          if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, true, true, true);
        } else if (!isPractice && playerBot.isEntirelyDestroyed) {
          if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
        } else if (enemyBot.isEntirelyDestroyed) {
          if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
        }
      }

      if (isKineticStrike || (impactSpeed > 1.8 && !pSpinningContact && !eSpinningContact)) {
        const isPWeaponHit = isPWeaponImpact;
        const isEWeaponHit = isEWeaponImpact;
        const isBothWeaponClash = isPWeaponHit && isEWeaponHit;

        if (isBothWeaponClash) {
          // ========================================================
          // TRUE WEAPON-TO-WEAPON CLASH: SIDE-HIT KNOCKBACK FEEL + BOTH WEAPONS STALLED
          // When robot weapons hit each other:
          // 1. Both robots take the solid, grounded knockback pushback felt during a side weapon hit (pFling / eFling).
          // 2. Both robot weapons stall to 0 RPM with their stall timers (attackStall / defendStall).
          // 3. Drive belt rip has a chance of happening ONLY when a robot is at less than 50% HP!
          // ========================================================
          AudioSys.metalClashSound(2.2, true);
          AudioSys.weaponSliceSound();
          AudioSys.weaponStallSound();
          addCameraTrauma(0.55);
          triggerGamepadRumble(0.85, 260);
          triggerHitStop(0.045);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: 2.2, h: true });
            NetworkSys.queueEvent({ t: 'slice' });
            NetworkSys.queueEvent({ t: 'stall' });
          }

          const pSpinRatio = Math.min(1.0, (playerBot.weaponSpinSpeed || 0) / (pSpecs.maxWeaponRpm || 95));
          const eSpinRatio = Math.min(1.0, (enemyBot.weaponSpinSpeed || 0) / (eSpecs.maxWeaponRpm || 95));
          const avgSpinRatio = (pSpinRatio + eSpinRatio) * 0.5;

          // Helper to spawn a physical ripped rubber drive belt flying off the weapon on belt failure
          const ripWeaponBelt = (bot, dirX, dirZ) => {
            if (!bot || bot.weaponDestroyed) return;
            bot.weaponDestroyed = true;
            bot.weaponBeltRipped = true;
            bot.weaponActive = false;
            bot.weaponSpinSpeed = 0;
            bot.weaponStallTimer = 0;
            if (typeof AudioSys !== 'undefined' && AudioSys.weaponStallSound) AudioSys.weaponStallSound();
            if (typeof AudioSys !== 'undefined' && AudioSys.crowdGasp) AudioSys.crowdGasp(0.9);
            spawnCollisionSparks(midPos, 35);
            try {
              if (typeof scene !== 'undefined' && typeof detachedDebris !== 'undefined') {
                const beltGeo = new THREE.TorusGeometry(0.16, 0.024, 6, 16, Math.PI * 1.65);
                beltGeo._isClonedDebris = true;
                const beltMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.85, metalness: 0.1 });
                beltMat._isClonedDebris = true;
                const beltMesh = new THREE.Mesh(beltGeo, beltMat);
                beltMesh.position.set(midPos.x, 0.42, midPos.z);
                scene.add(beltMesh);
                detachedDebris.push({
                  mesh: beltMesh,
                  isWheel: false,
                  vx: dirX * (5.5 + Math.random() * 3.5) + (Math.random() - 0.5) * 3.0,
                  vy: 5.2 + Math.random() * 3.0,
                  vz: dirZ * (5.5 + Math.random() * 3.5) + (Math.random() - 0.5) * 3.0,
                  rx: (Math.random() - 0.5) * 24,
                  ry: (Math.random() - 0.5) * 24,
                  rz: (Math.random() - 0.5) * 24
                });
              }
            } catch (e) {}
          };

          // Both weapons stall on impact just like a weapon hit
          if (typeof matchState === 'undefined' || matchState !== 'menu') {
            playerBot.weaponSpinSpeed = 0;
            enemyBot.weaponSpinSpeed = 0;
            playerBot.weaponStallTimer = pSpecs.attackStall || 0.8;
            enemyBot.weaponStallTimer = eSpecs.attackStall || 0.8;
            AudioSys.weaponStallSound();

            // Drive Belt Rip Check: ONLY has a chance of happening when robot is less than 50% HP!
            const maxHpP = playerBot.maxDriveHealth || 900;
            const maxHpE = enemyBot.maxDriveHealth || 900;
            const isPLessThan50 = (playerBot.driveHealth < maxHpP * 0.50) || (playerBot.totalInitialParts && (playerBot.detachableParts ? playerBot.detachableParts.filter(p => p.attached).length : 0) <= playerBot.totalInitialParts * 0.50);
            const isELessThan50 = (enemyBot.driveHealth < maxHpE * 0.50) || (enemyBot.totalInitialParts && (enemyBot.detachableParts ? enemyBot.detachableParts.filter(p => p.attached).length : 0) <= enemyBot.totalInitialParts * 0.50);

            const isHighEnergyClash = (avgSpinRatio >= 0.55 || impactSpeed >= 4.2);
            if (!isPractice && isHighEnergyClash) {
              if (isPLessThan50) {
                const baseBeltRipFromE = (enemyBot.type === 'robot3' || enemyBot.type === 'robot4') ? 0.09 : (enemyBot.type === 'robot6' ? 0.03 : 0.06);
                const pBeltProtection = (playerBot.type === 'robot2' || playerBot.type === 'robot5') ? 0.80 : 1.0;
                if (Math.random() < baseBeltRipFromE * eSpinRatio * pBeltProtection) {
                  ripWeaponBelt(playerBot, -nx, -nz);
                }
              }

              if (isELessThan50) {
                const baseBeltRipFromP = (playerBot.type === 'robot3' || playerBot.type === 'robot4') ? 0.09 : (playerBot.type === 'robot6' ? 0.03 : 0.06);
                const eBeltProtection = (enemyBot.type === 'robot2' || enemyBot.type === 'robot5') ? 0.80 : 1.0;
                if (Math.random() < baseBeltRipFromP * pSpinRatio * eBeltProtection) {
                  ripWeaponBelt(enemyBot, nx, nz);
                }
              }
            }
          } else {
            playerBot.weaponSpinSpeed = pSpecs.maxWeaponRpm;
            enemyBot.weaponSpinSpeed = eSpecs.maxWeaponRpm;
          }

          // Firmly grounded on wheels with clean flat recoil slide (NO floaty air hop & NO goofy rocking!)
          playerBot.vy = 0;
          playerBot.airY = 0;
          enemyBot.vy = 0;
          enemyBot.airY = 0;

          playerBot.pitch = 0;
          playerBot.pitchVel = 0;
          playerBot.roll = 0;
          playerBot.rollVel = 0;

          enemyBot.pitch = 0;
          enemyBot.pitchVel = 0;
          enemyBot.roll = 0;
          enemyBot.rollVel = 0;

          // Recoil slide timers so both robots slide apart across the arena floor
          playerBot.recoilLockTimer = 0.30;
          enemyBot.recoilLockTimer = 0.30;

          // Weighted explosive knockback impulse separating bots (~1.5–2.5m)
          const baseClashFling = 8.2;
          const pFlingOnEnemy = (baseClashFling + (pSpecs.flingBase || 4.0) * 0.5 + impactSpeed * 0.45) * (0.80 + 0.40 * pSpinRatio);
          const eFlingOnPlayer = (baseClashFling + (eSpecs.flingBase || 4.0) * 0.5 + impactSpeed * 0.45) * (0.80 + 0.40 * eSpinRatio);

          playerBot.vx -= nx * eFlingOnPlayer * pMoveRatio * 1.5;
          playerBot.vz -= nz * eFlingOnPlayer * pMoveRatio * 1.5;
          enemyBot.vx += nx * pFlingOnEnemy * eMoveRatio * 1.5;
          enemyBot.vz += nz * pFlingOnEnemy * eMoveRatio * 1.5;

          // Horizontal Bar Spinner (Robot 3) sideways kick if involved
          if (playerBot.type === 'robot3') {
            const tangKick = 3.2;
            enemyBot.vx += (-nz) * tangKick;
            enemyBot.vz += nx * tangKick;
            enemyBot.yaw -= 0.28;
          }
          if (enemyBot.type === 'robot3') {
            const tangKick = 3.2;
            playerBot.vx -= (-nz) * tangKick;
            playerBot.vz += nx * tangKick;
            playerBot.yaw += 0.28;
          }

          spawnCollisionSparks(midPos, 65);
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: 65 });
          }
          triggerDamageVignette();

          // Multi-hit wear & clash damage tuned for 3x longer battles:
          const pClashWearBase = (playerBot.type === 'robot6') ? 0.22 : ((playerBot.type === 'robot3' || playerBot.type === 'robot4') ? 0.44 : 0.35);
          const eClashWearBase = (enemyBot.type === 'robot6') ? 0.22 : ((enemyBot.type === 'robot3' || enemyBot.type === 'robot4') ? 0.44 : 0.35);

          let wearOnEnemy = pClashWearBase * (0.55 + 0.45 * pSpinRatio);
          let wearOnPlayer = eClashWearBase * (0.55 + 0.45 * eSpinRatio);
          if (enemyBot.type === 'robot2') wearOnEnemy *= 0.85;
          if (playerBot.type === 'robot2') wearOnPlayer *= 0.85;

          enemyBot.driveHealth = Math.max(1, (enemyBot.driveHealth || 900) - Math.round(22 * wearOnEnemy));
          enemyBot._weaponPartWear = (enemyBot._weaponPartWear || 0) + wearOnEnemy;
          if (enemyBot._weaponPartWear >= 1.0) {
            enemyBot._weaponPartWear -= 1.0;
            detachSinglePart(enemyBot, { x: nx, z: nz }, midPos);
          }

          if (!isPractice) {
            playerBot.driveHealth = Math.max(1, (playerBot.driveHealth || 900) - Math.round(22 * wearOnPlayer));
            playerBot._weaponPartWear = (playerBot._weaponPartWear || 0) + wearOnPlayer;
            if (playerBot._weaponPartWear >= 1.0) {
              playerBot._weaponPartWear -= 1.0;
              detachSinglePart(playerBot, { x: -nx, z: -nz }, midPos);
            }
          }

          if (!isPractice && playerBot.isEntirelyDestroyed && enemyBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, true, true, true);
          } else if (!isPractice && playerBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
          } else if (enemyBot.isEntirelyDestroyed) {
            if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
          }
        } else if (isPWeaponHit) {
          // ========================================================
          // PLAYER WEAPON STRIKE ON ENEMY (Original 87c3892 Mechanics)
          // (Enemy takes kinetic damage, sparks, flings. Player takes 0 damage!)
          // ========================================================
          const isFrontalOrRear = Math.abs(eHitForward) >= 0.25 || Math.abs(eHitForward) >= Math.abs(eHitRight);

          const isPWeaponMax = (playerBot.weaponActive !== false && playerBot.weaponSpinSpeed >= pSpecs.maxWeaponRpm * 0.90);
          const wasPSpinFast = (playerBot.weaponSpinSpeed >= pSpecs.maxWeaponRpm * 0.78);
          const isPTravelFast = (pSpeedBefore >= 6.2 && (pApproach >= 4.2 || impactSpeed >= 7.6));
          const isVerticalBiteP = isFrontalOrRear || (playerBot.vy > 0.35);
          const isHardVerticalHitP = isPWeaponMax && isPTravelFast && isVerticalBiteP;
          const effectiveFlipChanceP = pSpecs.flipChance * (eSpecs.flipResistance || 1.0);
          const canFlipEnemy = isHardVerticalHitP && (Math.random() < effectiveFlipChanceP);
          const wasEnemyFlipped = enemyBot.flipped;

          AudioSys.metalClashSound(canFlipEnemy ? 2.2 : (playerBot.type === 'robot6' ? 1.35 : 1.8), true);
          AudioSys.weaponSliceSound();
          if (canFlipEnemy) {
            AudioSys.crowdCheer(0.85, 1.6);
            addCameraTrauma(0.70);
            triggerGamepadRumble(0.75, 200, 0); // Crisp weapon strike feedback for P1
            triggerGamepadRumble(1.0, 360, 1);  // Heavy impact shudder for P2 victim
            triggerHitStop(0.045);
          } else {
            addCameraTrauma(playerBot.type === 'robot6' ? 0.22 : 0.38);
            triggerGamepadRumble(0.50, 150, 0);
            triggerGamepadRumble(0.80, 240, 1);
          }

          // Attacker Weapon Recoil (Newton's 3rd Law counter-force — strictly horizontal so attacker stays grounded)
          const pRecoil = canFlipEnemy ? 3.4 : (playerBot.type === 'robot6' ? 1.2 : 1.8);
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
            enemyBot.pitch = 0;
            enemyBot.pitchVel = 0;
            enemyBot.roll = 0;
            enemyBot.rollVel = 0;
            playerBot.pitch = 0;
            playerBot.pitchVel = 0;
            playerBot.roll = 0;
            playerBot.rollVel = 0;
            enemyBot.recoilLockTimer = 0.28;
            playerBot.recoilLockTimer = 0.16;
            const pFling = Math.max(7.2, (pSpecs.flingBase || 4.0) * 1.35 + impactSpeed * (pSpecs.flingSpeedMult || 0.45));
            enemyBot.vx += nx * pFling;
            enemyBot.vz += nz * pFling;

            // Horizontal Bar Spinner Tangential Throw (Robot 3 KineticBar):
            // Spinning horizontal bar imparts a sideways tangential kick + yaw spin to the target, and opposite reaction to attacker!
            if (playerBot.type === 'robot3') {
              const tangKick = 3.2;
              enemyBot.vx += (-nz) * tangKick;
              enemyBot.vz += nx * tangKick;
              enemyBot.yaw -= 0.26;
              playerBot.vx -= (-nz) * (tangKick * 0.45);
              playerBot.vz -= nx * (tangKick * 0.45);
              playerBot.yaw += 0.14;
            }
            // Firmly remains on wheels: NO enemyBot.flipped = true

            const hitSparksP = (playerBot.type === 'robot6') ? 14 : 24;
            spawnCollisionSparks(midPos, hitSparksP);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: hitSparksP });
            }
          }

          playerBot.weaponSpinSpeed = 0;
          enemyBot.weaponSpinSpeed = 0;
          playerBot.weaponStallTimer = pSpecs.attackStall;
          enemyBot.weaponStallTimer = eSpecs.defendStall;
          AudioSys.weaponStallSound();
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'stall' });
          }

          // Multi-hit wear & health damage tuned for 3x longer battles (~3 hits per detached part, ~4-5 for Robot 6):
          let pStrikeWear = 0.35;
          if (playerBot.type === 'robot6') {
            pStrikeWear = (wasPSpinFast && impactSpeed > 6.5) ? 0.28 : 0.22;
          } else if (playerBot.type === 'robot3') {
            pStrikeWear = (wasPSpinFast && (impactSpeed > 5.5 || canFlipEnemy)) ? 0.52 : 0.38;
          } else if (playerBot.type === 'robot4') {
            pStrikeWear = (wasPSpinFast && (impactSpeed > 5.5 || canFlipEnemy)) ? 0.46 : 0.36;
          } else if (playerBot.type === 'robot2') {
            pStrikeWear = (canFlipEnemy || impactSpeed > 6.0) ? 0.36 : 0.30;
          } else {
            pStrikeWear = (canFlipEnemy || impactSpeed > 6.0) ? 0.40 : 0.33;
          }
          if (enemyBot.type === 'robot2') pStrikeWear *= 0.85;

          enemyBot.driveHealth = Math.max(1, (enemyBot.driveHealth || 900) - Math.round(28 * pStrikeWear));
          enemyBot._weaponPartWear = (enemyBot._weaponPartWear || 0) + pStrikeWear;
          if (enemyBot._weaponPartWear >= 1.0) {
            enemyBot._weaponPartWear -= 1.0;
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
          // ENEMY WEAPON STRIKE ON PLAYER (Original 87c3892 Mechanics — 100% Symmetric with P1!)
          // ========================================================
          const isFrontalOrRear = Math.abs(pHitForward) >= 0.25 || Math.abs(pHitForward) >= Math.abs(pHitRight);

          const isEWeaponMax = (enemyBot.weaponActive !== false && enemyBot.weaponSpinSpeed >= eSpecs.maxWeaponRpm * 0.90);
          const wasESpinFast = (enemyBot.weaponSpinSpeed >= eSpecs.maxWeaponRpm * 0.78);
          const isETravelFast = (eSpeedBefore >= 6.2 && (eApproach >= 4.2 || impactSpeed >= 7.6));
          const isVerticalBiteE = isFrontalOrRear || (enemyBot.vy > 0.35);
          const isHardVerticalHitE = isEWeaponMax && isETravelFast && isVerticalBiteE;
          const effectiveFlipChanceE = eSpecs.flipChance * (pSpecs.flipResistance || 1.0);
          const canFlipPlayer = isHardVerticalHitE && (Math.random() < effectiveFlipChanceE);
          const wasPlayerFlipped = playerBot.flipped;

          AudioSys.metalClashSound(canFlipPlayer ? 2.2 : (enemyBot.type === 'robot6' ? 1.35 : 1.8), true);
          AudioSys.weaponSliceSound();
          if (canFlipPlayer) {
            AudioSys.crowdCheer(0.85, 1.6);
            addCameraTrauma(0.70);
            triggerGamepadRumble(0.75, 200, 1); // Crisp weapon strike feedback for P2
            triggerGamepadRumble(1.0, 360, 0);  // Heavy impact shudder for P1 victim
            triggerHitStop(0.045);
          } else {
            addCameraTrauma(enemyBot.type === 'robot6' ? 0.22 : 0.38);
            triggerGamepadRumble(0.50, 150, 1);
            triggerGamepadRumble(0.80, 240, 0);
          }

          // Attacker Weapon Recoil (Newton's 3rd Law counter-force — strictly horizontal so attacker stays grounded)
          const eRecoil = canFlipPlayer ? 3.4 : (enemyBot.type === 'robot6' ? 1.2 : 1.8);
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
            playerBot.pitch = 0;
            playerBot.pitchVel = 0;
            playerBot.roll = 0;
            playerBot.rollVel = 0;
            enemyBot.pitch = 0;
            enemyBot.pitchVel = 0;
            enemyBot.roll = 0;
            enemyBot.rollVel = 0;
            playerBot.recoilLockTimer = 0.28;
            enemyBot.recoilLockTimer = 0.16;
            const eFling = Math.max(7.2, (eSpecs.flingBase || 4.0) * 1.35 + impactSpeed * (eSpecs.flingSpeedMult || 0.45));
            playerBot.vx -= nx * eFling;
            playerBot.vz -= nz * eFling;

            // Horizontal Bar Spinner Tangential Throw (Robot 3 KineticBar):
            // Spinning horizontal bar imparts a sideways tangential kick + yaw spin to the target, and opposite reaction to attacker!
            if (enemyBot.type === 'robot3') {
              const tangKick = 3.2;
              playerBot.vx -= (-nz) * tangKick;
              playerBot.vz -= nx * tangKick;
              playerBot.yaw -= 0.26;
              enemyBot.vx += (-nz) * (tangKick * 0.45);
              enemyBot.vz += nx * (tangKick * 0.45);
              enemyBot.yaw += 0.14;
            }
            // Firmly remains on wheels: NO playerBot.flipped = true

            const hitSparksE = (enemyBot.type === 'robot6') ? 14 : 24;
            spawnCollisionSparks(midPos, hitSparksE);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: hitSparksE });
            }
          }

          enemyBot.weaponSpinSpeed = 0;
          playerBot.weaponSpinSpeed = 0;
          enemyBot.weaponStallTimer = eSpecs.attackStall;
          playerBot.weaponStallTimer = pSpecs.defendStall;
          AudioSys.weaponStallSound();
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'stall' });
          }

          triggerDamageVignette();

          // Multi-hit wear & health damage tuned for 3x longer battles (~3 hits per detached part, ~4-5 for Robot 6):
          let eStrikeWear = 0.35;
          if (enemyBot.type === 'robot6') {
            eStrikeWear = (wasESpinFast && impactSpeed > 6.5) ? 0.28 : 0.22;
          } else if (enemyBot.type === 'robot3') {
            eStrikeWear = (wasESpinFast && (impactSpeed > 5.5 || canFlipPlayer)) ? 0.52 : 0.38;
          } else if (enemyBot.type === 'robot4') {
            eStrikeWear = (wasESpinFast && (impactSpeed > 5.5 || canFlipPlayer)) ? 0.46 : 0.36;
          } else if (enemyBot.type === 'robot2') {
            eStrikeWear = (canFlipPlayer || impactSpeed > 6.0) ? 0.36 : 0.30;
          } else {
            eStrikeWear = (canFlipPlayer || impactSpeed > 6.0) ? 0.40 : 0.33;
          }
          if (playerBot.type === 'robot2') eStrikeWear *= 0.85;

          if (!isPractice) {
            playerBot.driveHealth = Math.max(1, (playerBot.driveHealth || 900) - Math.round(28 * eStrikeWear));
          }
          playerBot._weaponPartWear = (playerBot._weaponPartWear || 0) + eStrikeWear;
          if (playerBot._weaponPartWear >= 1.0) {
            playerBot._weaponPartWear -= 1.0;
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
          // CHASSIS / BUMPER / WEDGE COLLISION (RAMMING WITHOUT SPINNING WEAPON)
          // ========================================================
          AudioSys.metalClashSound(Math.min(1.8, 0.55 + impactSpeed * 0.22), false);
          addCameraTrauma(Math.min(0.35, 0.08 + impactSpeed * 0.04));
          triggerGamepadRumble(Math.min(0.55, 0.2 + impactSpeed * 0.06), 140, 'both');
          if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
            NetworkSys.queueEvent({ t: 'clash', i: Math.min(1.8, 0.55 + impactSpeed * 0.22), h: false });
          }

          // Realistic non-weapon impact sparks:
          // ONLY show a single instant burst of sparks if a robot drives FAST and slams hard into the other robot!
          // If neither robot is driving fast and weapons aren't spinning, NO sparks at all!
          const isFastRamImpact = (relNormalVel >= 5.5 || impactSpeed >= 6.5) && (pSpeedBefore >= 6.0 || eSpeedBefore >= 6.0);
          if (isFastRamImpact && (!window._lastRamSparkTime || nowPerf - window._lastRamSparkTime > 350)) {
            window._lastRamSparkTime = nowPerf;
            const ramSparkCount = Math.min(18, Math.max(8, Math.floor(impactSpeed * 1.8)));
            spawnCollisionSparks(midPos, ramSparkCount);
            if (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && NetworkSys.isHost) {
              NetworkSys.queueEvent({ t: 'sparks', x: midPos.x, y: midPos.y, z: midPos.z, c: ramSparkCount });
            }
          }

          // Helper: Non-weapon high-speed ram counter (requires 5 to 6 hard rams before 1 piece flies off!)
          const applyRamHitCounter = (victimBot, dirX, dirZ) => {
            if (!victimBot) return;
            victimBot.ramHitCount = (victimBot.ramHitCount || 0) + 1;
            if (!victimBot.ramHitsRequired) {
              victimBot.ramHitsRequired = (Math.random() < 0.5) ? 5 : 6; // 5–6 hard rams per part
            }
            if (victimBot.ramHitCount >= victimBot.ramHitsRequired) {
              victimBot.ramHitCount = 0;
              victimBot.ramHitsRequired = (Math.random() < 0.5) ? 5 : 6;
              detachSinglePart(victimBot, { x: dirX, z: dirZ }, midPos, null, true);
            }
          };

          if (isPractice) {
            // Practice dummy: requires 3-4 fast, hard rams for 1 piece to fly off
            if (impactSpeed >= 6.0 && relNormalVel >= 4.8 && (!window._lastPracRamCountTime || nowPerf - window._lastPracRamCountTime > 320)) {
              window._lastPracRamCountTime = nowPerf;
              enemyBot.vy = 0;
              enemyBot.airY = 0;
              enemyBot.pitchVel = 0;
              enemyBot.rollVel = 0;
              applyRamHitCounter(enemyBot, nx, nz);
              if (enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
              }
            }
          } else {
            // Real combat ramming (weapons stalled/off or non-weapon side collision):
            // Requires 3-4 genuinely fast, hard rams (cooldown-gated per distinct ram) for 1 piece to fly off!
            const pIsFastAttacker = (pSpeedBefore >= 6.0 && pApproach >= 4.8 && pApproach > eApproach * 1.15);
            const eIsFastAttacker = (eSpeedBefore >= 6.0 && eApproach >= 4.8 && eApproach > pApproach * 1.15);

            if (pIsFastAttacker && (!window._lastPRamCountTime || nowPerf - window._lastPRamCountTime > 320)) {
              window._lastPRamCountTime = nowPerf;
              enemyBot.vy = 0;
              enemyBot.airY = 0;
              enemyBot.pitchVel = 0;
              enemyBot.rollVel = 0;
              applyRamHitCounter(enemyBot, nx, nz);
              if (impactSpeed >= 6.5 && enemyBot.weaponSpinSpeed > 0) {
                enemyBot.weaponSpinSpeed = 0;
                enemyBot.weaponStallTimer = 1.0;
              }
              if (enemyBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(true, false, true, true);
              }
            } else if (eIsFastAttacker && (!window._lastERamCountTime || nowPerf - window._lastERamCountTime > 320)) {
              window._lastERamCountTime = nowPerf;
              triggerDamageVignette();
              playerBot.vy = 0;
              playerBot.airY = 0;
              playerBot.pitchVel = 0;
              playerBot.rollVel = 0;
              applyRamHitCounter(playerBot, -nx, -nz);
              if (impactSpeed >= 6.5 && playerBot.weaponSpinSpeed > 0) {
                playerBot.weaponSpinSpeed = 0;
                playerBot.weaponStallTimer = 1.0;
              }
              if (playerBot.isEntirelyDestroyed) {
                if (typeof matchState !== 'undefined' && matchState === 'playing') endMatch(false, false, true, true);
              }
            } else if (impactSpeed >= 7.0 && relNormalVel >= 5.5 && pSpeedBefore >= 5.8 && eSpeedBefore >= 5.8 && (!window._lastMutualRamCountTime || nowPerf - window._lastMutualRamCountTime > 320)) {
              // High-speed mutual head-on ram: increments both robots' 3-4 hit counters
              window._lastMutualRamCountTime = nowPerf;
              applyRamHitCounter(playerBot, -nx, -nz);
              applyRamHitCounter(enemyBot, nx, nz);
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
    } else if (!wasInContactRecently) {
      if (playerBot._grindContactTimer > 0) playerBot._grindContactTimer = Math.max(0, playerBot._grindContactTimer - 0.032);
      if (enemyBot._grindContactTimer > 0) enemyBot._grindContactTimer = Math.max(0, enemyBot._grindContactTimer - 0.032);
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
    const isGuestOnline = (typeof NetworkSys !== 'undefined' && NetworkSys.isOnline && !NetworkSys.isHost);
    if (typeof combatEngageTimer !== 'number') combatEngageTimer = 0.0;
    if (combatEngageTimer > 0) {
      combatEngageTimer = Math.max(0.0, combatEngageTimer - dt);
    }

    const pSpeed = Math.hypot(playerBot.vx || 0, playerBot.vz || 0);
    const eSpeed = Math.hypot(enemyBot.vx || 0, enemyBot.vz || 0);
    const distBetweenBots = Math.hypot((playerBot.x || 0) - (enemyBot.x || 0), (playerBot.z || 0) - (enemyBot.z || 0));

    const botHasDriveWheels = (b) => {
      if (!b) return false;
      if (b.wheels && b.wheels.length > 0 && b.wheels.some(w => w.attached !== false)) return true;
      if (b.detachableParts && b.detachableParts.length > 0 && b.detachableParts.some(p => p.category === 'wheel' && p.attached && p.mesh && p.mesh.parent)) return true;
      return false;
    };
    const pNoWheels = !botHasDriveWheels(playerBot);
    const eNoWheels = !botHasDriveWheels(enemyBot);

    const pNoDrive = (playerBot.driveHealth <= 0) || (playerBot.drivePower <= 0);
    const eNoDrive = (enemyBot.driveHealth <= 0) || (enemyBot.drivePower <= 0);

    const isPImmobilized = !!playerBot.flipped || pNoWheels || pNoDrive;
    const isEImmobilized = !!enemyBot.flipped || eNoWheels || eNoDrive;

    const pThrottleActive = Math.abs(playerBot.throttleInput || 0) > 0.1 || Math.abs(playerBot.steerInput || 0) > 0.15;
    const eThrottleActive = Math.abs(enemyBot.throttleInput || 0) > 0.1 || Math.abs(enemyBot.steerInput || 0) > 0.15;

    // Active Fighting / "No Mercy" Detection:
    // If one robot is immobilized and the other mobile robot is still fighting it
    // (hitting/colliding within the last 2.5s, charging/driving within 5.0m, or AI going for No Mercy),
    // the 10-second KO countdown MUST reset to 0 so the attacker can go for NO MERCY TOTAL DESTRUCTION!
    const pGoingForNoMercy = !isPImmobilized && (
      combatEngageTimer > 0 ||
      (distBetweenBots < 5.0 && (pSpeed > 1.0 || pThrottleActive))
    );
    const eGoingForNoMercy = !isEImmobilized && (
      combatEngageTimer > 0 ||
      (distBetweenBots < 5.0 && (eSpeed > 1.0 || eThrottleActive)) ||
      (!isGuestOnline && gameMode !== '1v1' && gameMode !== '1v1_online' && gameMode !== 'practice' && enemyBot.aiNoMercyDecision === true)
    );

    const isPStopped = isPImmobilized && (pSpeed < 1.8) && !eGoingForNoMercy;
    const isEStopped = isEImmobilized && (eSpeed < 1.8) && !pGoingForNoMercy;

    // Check if BOTH robots cannot fight:
    // (a) Both robots are immobilized and not colliding/moving, OR
    // (b) Both robots' weapons are destroyed in non-practice mode AND neither robot is driving/ramming
    const isPracticeMode = (typeof gameMode !== 'undefined' && gameMode === 'practice');
    const isBothImmobilized = isPImmobilized && isEImmobilized && pSpeed < 1.5 && eSpeed < 1.5 && combatEngageTimer <= 0;
    const isBothWeaponsDestroyed = !isPracticeMode && (!!playerBot.weaponDestroyed && !!enemyBot.weaponDestroyed) &&
      pSpeed < 0.8 && eSpeed < 0.8 && !pThrottleActive && !eThrottleActive && combatEngageTimer <= 0;
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

