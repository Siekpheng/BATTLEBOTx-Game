// ========================================================
// BATTLEBOTx - ROBOT MODELS, CAD STREAMING & MESHES
// ========================================================

  // ========================================================
  // 3. HIGH-RESOLUTION ROBOT 1 MODEL LOADER & MATERIAL OPTIMIZER
  // ========================================================
  let robot1ModelScene = null;

  function fixMeshWinding(mesh) {
    if (!mesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    if (!pos || pos.count < 3) return;

    // Detect inverted winding where geometric normal opposes attribute normal
    const p = pos.array;
    const n = norm ? norm.array : null;
    const v0x = p[0], v0y = p[1], v0z = p[2];
    const v1x = p[3], v1y = p[4], v1z = p[5];
    const v2x = p[6], v2y = p[7], v2z = p[8];

    const ax = v1x - v0x, ay = v1y - v0y, az = v1z - v0z;
    const bx = v2x - v0x, by = v2y - v0y, bz = v2z - v0z;
    const crossX = ay * bz - az * by;
    const crossY = az * bx - ax * bz;
    const crossZ = ax * by - ay * bx;

    let dot = 1;
    if (n) {
      const avgNx = (n[0] + n[3] + n[6]) / 3;
      const avgNy = (n[1] + n[4] + n[7]) / 3;
      const avgNz = (n[2] + n[5] + n[8]) / 3;
      dot = crossX * avgNx + crossY * avgNy + crossZ * avgNz;
    }

    if (dot < 0) {
      if (geo.index) {
        const idx = geo.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          const tmp = idx[i + 1];
          idx[i + 1] = idx[i + 2];
          idx[i + 2] = tmp;
        }
        geo.index.needsUpdate = true;
      } else {
        for (let i = 0; i < p.length; i += 9) {
          for (let c = 0; c < 3; c++) {
            const tmpP = p[i + 3 + c];
            p[i + 3 + c] = p[i + 6 + c];
            p[i + 6 + c] = tmpP;
            if (n) {
              const tmpN = n[i + 3 + c];
              n[i + 3 + c] = n[i + 6 + c];
              n[i + 6 + c] = tmpN;
            }
          }
        }
        pos.needsUpdate = true;
        if (n) norm.needsUpdate = true;
      }
      geo.computeVertexNormals();
    }
  }

  function isWheelMesh(mesh) {
    if (!mesh) return false;
    let curr = mesh;
    while (curr) {
      const n = (curr.name || '').toLowerCase();
      if (n.includes('wheel') || n.includes('tire') || n.includes('rim') || n.startsWith('wheel')) {
        return true;
      }
      curr = curr.parent;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && m.name) {
        const mn = m.name.toLowerCase();
        if (mn.includes('rubber') || mn.includes('tire') || mn.includes('rim')) {
          return true;
        }
      }
    }
    return false;
  }
  window.isWheelMesh = isWheelMesh;

  function addRobotMeshOutline(mesh, outlineColor = 0x050a12) {
    if (!mesh || !mesh.geometry) return;
    if (mesh.name === 'CAD_Outline') return;

    // Per user specification: only outline the robot model, no outline on any wheel or tire
    if (isWheelMesh(mesh)) {
      const existing = mesh.children ? mesh.children.find(c => c.name === 'CAD_Outline') : null;
      if (existing) {
        mesh.remove(existing);
        if (existing.geometry) existing.geometry.dispose();
        if (existing.material) existing.material.dispose();
      }
      mesh._hasOutline = false;
      return;
    }

    let existingLine = null;
    if (mesh.children && mesh.children.length > 0) {
      existingLine = mesh.children.find(c => c.name === 'CAD_Outline');
    }

    if (existingLine) {
      if (existingLine.material) {
        existingLine.material = existingLine.material.clone();
        existingLine.material.color.setHex(outlineColor);
        existingLine.material.transparent = true;
        existingLine.material.opacity = 0.95;
        existingLine.material.depthTest = true;
        existingLine.material.depthWrite = false;
        existingLine.material.polygonOffset = true;
        existingLine.material.polygonOffsetFactor = -1.0;
        existingLine.material.polygonOffsetUnits = -2.0;
        existingLine.material.needsUpdate = true;
      }
      mesh._hasOutline = true;
      return;
    }

    try {
      const edges = new THREE.EdgesGeometry(mesh.geometry, 26);
      const lineMat = new THREE.LineBasicMaterial({
        color: outlineColor,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -2.0
      });
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.name = 'CAD_Outline';
      lines.renderOrder = 1;
      mesh.add(lines);
      mesh._hasOutline = true;
    } catch (e) {
      console.warn('Could not generate outline for mesh:', e);
    }
  }

  function optimizeRobotMaterial(mesh) {
    if (!mesh || !mesh.material) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false; // Robot casts crisp contact shadow on floor, but never self-shadows top surfaces

    // Clone material so instances don't cross-contaminate
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(m => m.clone());
    } else {
      mesh.material = mesh.material.clone();
    }

    let maxLum = 0;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(mat => {
      // 1. Guarantee 100% solid, fully opaque rendering with DoubleSide (completely eliminates see-through on all CAD plates & cavity)
      mat.transparent = false;
      mat.opacity = 1.0;
      mat.depthWrite = true;
      mat.depthTest = true;
      mat.side = THREE.DoubleSide; // Render both sides so CAD sheet metal panels & interior cavity are 100% solid
      mat.needsUpdate = true;

      // 2. Refined Robot Luminance & Specular Shading (Preserves rich 3D curvature, specular depth & bevel highlights):
      if (mat.color && !mat._emissiveApplied) {
        const lum = mat.color.r * 0.299 + mat.color.g * 0.587 + mat.color.b * 0.114;
        if (lum > maxLum) maxLum = lum;
        if (lum < 0.15) {
          // Dark parts (chassis frame, tires, carbon): clean subtle lift so interior CAD cavity is clearly visible
          mat.emissive = new THREE.Color(0x12161f);
        } else {
          // Vibrant painted body, armor, wedges, weapons: subtle ambient lift (0.06) restoring genuine 3D specular depth & shading gradients
          mat.emissive = mat.color.clone().multiplyScalar(0.06);
        }
        mat._emissiveApplied = true;
      }
      mat.roughness = 0.32; // Crisp specular sheen
      if (mat.metalness !== undefined && mat.metalness > 0.05) {
        mat.metalness = Math.min(0.55, mat.metalness * 1.25);
      }
    });

    // 3. Crisp Industrial CAD Outline Definition (sharp panel seams, chamfers, armor, weapons):
    // Outline ONLY the robot body model (chassis, armor, weapons, wedges); omit all wheels and tires
    if (!isWheelMesh(mesh)) {
      // Adaptive contrast: on dark chassis/carbon (lum < 0.22), use crisp technical slate outline (0x475569)
      // On light/vibrant armor & wedges (lum >= 0.22), use dark industrial ink (0x050a12)
      const outlineCol = (maxLum < 0.22) ? 0x475569 : 0x050a12;
      addRobotMeshOutline(mesh, outlineCol);
    } else {
      const existing = mesh.children ? mesh.children.find(c => c.name === 'CAD_Outline') : null;
      if (existing) {
        mesh.remove(existing);
      }
    }
  }

  function attachCadToRobot1(bot) {
    if (!robot1ModelScene || !bot || !bot.tiltGroup || bot.cadAttached) return;
    const clone = robot1ModelScene.clone(true);
    bot.tiltGroup.add(clone);
    bot.armorPanels = [];
    bot.wheels = [];
    clone.traverse(obj => {
      if (obj.name === 'Weapon_Pivot') {
        bot.weaponMesh = obj;
        bot.weaponMesh.rotation.set(0, 0, 0);
        bot.weaponMesh.quaternion.set(0, 0, 0, 1);
      }
      if (obj.name && obj.name.startsWith('Armor_') && !obj.name.includes('_Mesh')) {
        bot.armorPanels.push({ name: obj.name, mesh: obj, attached: true });
      }
      if (obj.name && (obj.name === 'Wheel_L' || obj.name === 'Wheel_R' || obj.name.startsWith('Wheel_')) && !obj.name.includes('_Mesh')) {
        const side = (obj.name.endsWith('L') || obj.name.includes('_L')) ? 'left' : 'right';
        bot.wheels.push({ name: obj.name, mesh: obj, side: side, attached: true });
      }
      if (obj.isMesh) {
        optimizeRobotMaterial(obj);
      }
    });
    bot.cadAttached = true;
  }

  // Extract Big Rear Wheels from Robot 1 Chassis into distinct spinning wheel nodes
  // Strictly isolates wheel components: Rubber tires (Rubber_-_Soft), Rims (ABS_(White)), and Hub locknuts (Opaque(203,203,203))
  // The Powder_Coat_(Black) chassis frame and all other components are 100% untouched and remain completely static!
  function extractRobot1RearWheels(modelScene) {
    if (!modelScene) return;

    let chassisNode = null;
    modelScene.traverse(obj => {
      if (obj.name === 'Chassis') chassisNode = obj;
    });
    if (!chassisNode) return;

    let alreadyExtracted = false;
    modelScene.traverse(obj => {
      if (obj.name === 'Wheel_Rear_L') alreadyExtracted = true;
    });
    if (alreadyExtracted) return;

    // Exact CAD Axle centerline for Robot 1 rear wheels: Y = 0.2465, Z = -0.9810, X = ±0.734
    const leftAxle = new THREE.Vector3(-0.734, 0.2465, -0.981);
    const rightAxle = new THREE.Vector3(0.734, 0.2465, -0.981);

    const wheelRearL = new THREE.Group();
    wheelRearL.name = 'Wheel_Rear_L';
    wheelRearL.position.copy(leftAxle);

    const wheelRearR = new THREE.Group();
    wheelRearR.name = 'Wheel_Rear_R';
    wheelRearR.position.copy(rightAxle);

    const meshesToProcess = [];
    if (chassisNode.isMesh) {
      meshesToProcess.push(chassisNode);
    } else {
      chassisNode.traverse(obj => {
        if (obj.isMesh) meshesToProcess.push(obj);
      });
    }

    meshesToProcess.forEach(mesh => {
      let geo = mesh.geometry;
      if (!geo || !geo.attributes.position) return;

      const matName = (mesh.material && mesh.material.name) ? mesh.material.name : '';
      
      // CRITICAL: Filter by material so the chassis frame (Powder_Coat_(Black)) is NEVER touched or rotated!
      // Only extract geometry from genuine wheel parts:
      // 1. Rear Rubber Tires ('Rubber_-_Soft', excluding 'Rubber_-_Soft_1' which is front tires)
      // 2. Wheel Rims ('ABS_(White)')
      // 3. Wheel Locknuts ('203,203,203')
      const isTire = matName.includes('Rubber_-_Soft') && !matName.includes('Rubber_-_Soft_1');
      const isRim = matName.includes('ABS_(White)') || matName.includes('ABS');
      const isNut = matName.includes('203,203,203');

      if (!isTire && !isRim && !isNut) {
        // Leave chassis frame (Powder_Coat_(Black)) and all other internal components completely untouched and static!
        return;
      }

      if (geo.index) {
        geo = geo.toNonIndexed();
        mesh.geometry = geo;
      }

      const pos = geo.attributes.position.array;
      const norm = geo.attributes.normal ? geo.attributes.normal.array : null;
      const triCount = pos.length / 9;

      const leftPos = [], leftNorm = [];
      const rightPos = [], rightNorm = [];
      const chassisPos = [], chassisNorm = [];

      for (let t = 0; t < triCount; t++) {
        const i = t * 9;
        const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
        const cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
        const cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;

        // Radial distance from rear wheel axle line (Y = 0.2465, Z = -0.9810)
        const distYZ = Math.hypot(cy - leftAxle.y, cz - leftAxle.z);

        let isWheelTri = false;
        if (isTire) {
          // 100% of this mesh is the rear tires
          isWheelTri = true;
        } else if (isRim) {
          // Rear rim concentric with axle and outside chassis wall (|cx| >= 0.61)
          isWheelTri = (distYZ <= 0.255 && Math.abs(cx) >= 0.61);
        } else if (isNut) {
          // Outer wheel locknut only (|cx| >= 0.65)
          isWheelTri = (distYZ <= 0.06 && Math.abs(cx) >= 0.65);
        }

        if (isWheelTri && cx < 0) {
          // Left rear wheel triangle (offset by leftAxle position)
          for (let v = 0; v < 9; v += 3) {
            leftPos.push(pos[i + v] - leftAxle.x, pos[i + v + 1] - leftAxle.y, pos[i + v + 2] - leftAxle.z);
            if (norm) leftNorm.push(norm[i + v], norm[i + v + 1], norm[i + v + 2]);
          }
        } else if (isWheelTri && cx >= 0) {
          // Right rear wheel triangle (offset by rightAxle position)
          for (let v = 0; v < 9; v += 3) {
            rightPos.push(pos[i + v] - rightAxle.x, pos[i + v + 1] - rightAxle.y, pos[i + v + 2] - rightAxle.z);
            if (norm) rightNorm.push(norm[i + v], norm[i + v + 1], norm[i + v + 2]);
          }
        } else {
          // Remaining geometry stays in chassis
          for (let v = 0; v < 9; v++) {
            chassisPos.push(pos[i + v]);
            if (norm) chassisNorm.push(norm[i + v]);
          }
        }
      }

      if (leftPos.length > 0) {
        const lGeo = new THREE.BufferGeometry();
        lGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftPos, 3));
        if (norm) lGeo.setAttribute('normal', new THREE.Float32BufferAttribute(leftNorm, 3));
        const lMesh = new THREE.Mesh(lGeo, mesh.material);
        lMesh.castShadow = true;
        lMesh.receiveShadow = false;
        wheelRearL.add(lMesh);
      }

      if (rightPos.length > 0) {
        const rGeo = new THREE.BufferGeometry();
        rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightPos, 3));
        if (norm) rGeo.setAttribute('normal', new THREE.Float32BufferAttribute(rightNorm, 3));
        const rMesh = new THREE.Mesh(rGeo, mesh.material);
        rMesh.castShadow = true;
        rMesh.receiveShadow = false;
        wheelRearR.add(rMesh);
      }

      if (chassisPos.length > 0) {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(chassisPos, 3));
        if (norm) geo.setAttribute('normal', new THREE.Float32BufferAttribute(chassisNorm, 3));
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
      } else {
        mesh.visible = false;
      }
    });

    if (wheelRearL.children.length > 0) {
      if (chassisNode.parent) chassisNode.parent.add(wheelRearL);
      else modelScene.add(wheelRearL);
    }
    if (wheelRearR.children.length > 0) {
      if (chassisNode.parent) chassisNode.parent.add(wheelRearR);
      else modelScene.add(wheelRearR);
    }
    console.log('✅ Extracted Robot 1 Big Rear Wheels (Wheel_Rear_L & Wheel_Rear_R) successfully with stationary chassis frame!');
  }

  let robot2ModelScene = null;
  let robot3ModelScene = null;
  let robot4ModelScene = null;
  let robot5ModelScene = null;
  let robot6ModelScene = null;

  function attachCadToRobot2(bot) {
    if (!robot2ModelScene || !bot || !bot.tiltGroup || bot.cadAttached) return;
    const clone = robot2ModelScene.clone(true);
    bot.tiltGroup.add(clone);
    bot.armorPanels = [];
    bot.wheels = [];
    clone.traverse(obj => {
      if (obj.name === 'Weapon_Pivot') {
        bot.weaponMesh = obj;
      }
      if (obj.name && obj.name.startsWith('Armor_') && !obj.name.includes('_Mesh')) {
        bot.armorPanels.push({ name: obj.name, mesh: obj, attached: true });
      }
      if (obj.name && obj.name.startsWith('Wheel_') && !obj.name.includes('_Mesh')) {
        const side = (obj.name.endsWith('L') || obj.name.includes('_L')) ? 'left' : 'right';
        bot.wheels.push({ name: obj.name, mesh: obj, side: side, attached: true });
      }
      if (obj.isMesh) {
        optimizeRobotMaterial(obj);
      }
    });
    bot.cadAttached = true;
  }

  // Extract static drive belts from Robot 2 rear wheels so rear wheels can spin freely
  function extractRobot2RearBelts(modelScene) {
    if (!modelScene) return;

    ['Wheel_BL', 'Wheel_BR'].forEach(nodeName => {
      let wheelNode = null;
      modelScene.traverse(obj => {
        if (obj.name === nodeName) wheelNode = obj;
      });
      if (!wheelNode) return;

      const staticBeltGroup = new THREE.Group();
      staticBeltGroup.name = 'Belt_' + nodeName;
      staticBeltGroup.position.copy(wheelNode.position);

      const meshesToProcess = [];
      if (wheelNode.isMesh) meshesToProcess.push(wheelNode);
      else wheelNode.traverse(obj => { if (obj.isMesh) meshesToProcess.push(obj); });

      meshesToProcess.forEach(mesh => {
        let geo = mesh.geometry;
        if (!geo || !geo.attributes.position) return;
        if (geo.index) {
          geo = geo.toNonIndexed();
          mesh.geometry = geo;
        }

        const pos = geo.attributes.position.array;
        const norm = geo.attributes.normal ? geo.attributes.normal.array : null;
        const triCount = pos.length / 9;

        const wheelPos = [], wheelNorm = [];
        const beltPos = [], beltNorm = [];

        for (let t = 0; t < triCount; t++) {
          const i = t * 9;
          const cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;

          if (cz >= 0.35) {
            // Belt triangles connecting to front pulley
            for (let v = 0; v < 9; v++) {
              beltPos.push(pos[i + v]);
              if (norm) beltNorm.push(norm[i + v]);
            }
          } else {
            // Concentric wheel triangles centered on axle
            for (let v = 0; v < 9; v++) {
              wheelPos.push(pos[i + v]);
              if (norm) wheelNorm.push(norm[i + v]);
            }
          }
        }

        if (beltPos.length > 0) {
          const bGeo = new THREE.BufferGeometry();
          bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beltPos, 3));
          if (norm) bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(beltNorm, 3));
          const bMesh = new THREE.Mesh(bGeo, mesh.material);
          bMesh.castShadow = true;
          bMesh.receiveShadow = false;
          staticBeltGroup.add(bMesh);
        }

        if (wheelPos.length > 0) {
          geo.setAttribute('position', new THREE.Float32BufferAttribute(wheelPos, 3));
          if (norm) geo.setAttribute('normal', new THREE.Float32BufferAttribute(wheelNorm, 3));
          geo.computeBoundingBox();
          geo.computeBoundingSphere();
        } else {
          mesh.visible = false;
        }
      });

      if (staticBeltGroup.children.length > 0) {
        if (wheelNode.parent) wheelNode.parent.add(staticBeltGroup);
        else modelScene.add(staticBeltGroup);
      }
    });
    console.log('✅ Extracted Robot 2 Static Drive Belts successfully!');
  }

  const botModelScenes = {
    robot1: null,
    robot2: null,
    robot3: null,
    robot4: null,
    robot5: null,
    robot6: null
  };
  const botLoadingPromises = {};

  function ensureBotModelLoaded(type, onProgress) {
    if (!type) return Promise.resolve(null);
    if (getBotScene(type)) {
      if (onProgress) onProgress(1.0);
      return Promise.resolve(getBotScene(type));
    }
    if (botLoadingPromises[type]) {
      return botLoadingPromises[type];
    }

    const botNum = type.replace('robot', '');
    const promise = new Promise((resolve) => {
      if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.warn('THREE.GLTFLoader not ready');
        return resolve(null);
      }
      const loader = new THREE.GLTFLoader();

      function onLoaded(gltf) {
        const scene = gltf.scene;
        if (type === 'robot1') {
          extractRobot1RearWheels(scene);
        } else if (type === 'robot2') {
          extractRobot2RearBelts(scene);
        }
        scene.traverse(obj => {
          if (obj.isMesh) {
            optimizeRobotMaterial(obj);
            obj.castShadow = true;
            obj.receiveShadow = false;
          }
        });

        if (type === 'robot1') robot1ModelScene = scene;
        else if (type === 'robot2') robot2ModelScene = scene;
        else if (type === 'robot3') robot3ModelScene = scene;
        else if (type === 'robot4') robot4ModelScene = scene;
        else if (type === 'robot5') robot5ModelScene = scene;
        else if (type === 'robot6') robot6ModelScene = scene;
        botModelScenes[type] = scene;

        console.log(`✅ High-Resolution Autodesk Fusion Robot ${botNum} loaded successfully!`);

        if (playerBot && playerBot.type === type && typeof attachCadToBot === 'function') {
          attachCadToBot(playerBot, type);
        }
        if (enemyBot && enemyBot.type === type && typeof attachCadToBot === 'function') {
          attachCadToBot(enemyBot, type);
        }

        if (onProgress) onProgress(1.0);
        resolve(scene);
      }

      function tryParseBase64() {
        const b64 = window[`ROBOT${botNum}_GLB_BASE64`];
        if (b64) {
          try {
            const binStr = atob(b64);
            const len = binStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
            loader.parse(bytes.buffer, '', onLoaded, (err) => {
              console.warn(`Base64 parse error for Robot ${botNum}:`, err);
              resolve(null);
            });
            return true;
          } catch (e) {
            console.warn(`Base64 decode error for Robot ${botNum}:`, e);
          }
        }
        return false;
      }

      if (tryParseBase64()) return;

      const isFileProtocol = window.location.protocol === 'file:';

      if (isFileProtocol) {
        const script = document.createElement('script');
        script.src = `Robot${botNum}_Model.js`;
        script.onload = () => {
          if (!tryParseBase64()) resolve(null);
        };
        script.onerror = (e) => {
          console.warn(`Failed to inject Robot${botNum}_Model.js offline:`, e);
          resolve(null);
        };
        document.head.appendChild(script);
        return;
      }

      const modelPath = `./models/Robot${botNum}.glb`;
      loader.load(
        modelPath,
        onLoaded,
        (xhr) => {
          if (xhr && xhr.lengthComputable && xhr.total > 0 && onProgress) {
            onProgress(Math.min(0.99, xhr.loaded / xhr.total));
          }
        },
        (err) => {
          console.warn(`Primary load failed for ${modelPath}, trying fallback path...`, err);
          loader.load(
            `models/Robot${botNum}.glb`,
            onLoaded,
            (xhr) => {
              if (xhr && xhr.lengthComputable && xhr.total > 0 && onProgress) {
                onProgress(Math.min(0.99, xhr.loaded / xhr.total));
              }
            },
            (err2) => {
              console.warn(`Fallback binary load failed for Robot ${botNum}:`, err2);
              const script = document.createElement('script');
              script.src = `Robot${botNum}_Model.js`;
              script.onload = () => {
                if (!tryParseBase64()) resolve(null);
              };
              script.onerror = () => resolve(null);
              document.head.appendChild(script);
            }
          );
        }
      );
    });

    botLoadingPromises[type] = promise;
    return promise;
  }

  function loadRobot1HighRes() { return ensureBotModelLoaded('robot1'); }
  function loadRobot2HighRes() { return ensureBotModelLoaded('robot2'); }
  function loadRobot3HighRes() { return ensureBotModelLoaded('robot3'); }
  function loadRobot4HighRes() { return ensureBotModelLoaded('robot4'); }
  function loadRobot5HighRes() { return ensureBotModelLoaded('robot5'); }
  function loadRobot6HighRes() { return ensureBotModelLoaded('robot6'); }

  function getBotScene(type) {
    if (type === 'robot1') return robot1ModelScene;
    if (type === 'robot2') return robot2ModelScene;
    if (type === 'robot3') return robot3ModelScene;
    if (type === 'robot4') return robot4ModelScene;
    if (type === 'robot5') return robot5ModelScene;
    if (type === 'robot6') return robot6ModelScene;
    return null;
  }

  function attachCadToBot(bot, type) {
    const sceneToClone = getBotScene(type);
    if (!sceneToClone || !bot || !bot.tiltGroup || bot.cadAttached) return;
    const clone = sceneToClone.clone(true);
    bot.tiltGroup.add(clone);
    bot.armorPanels = [];
    bot.wheels = [];
    clone.traverse(obj => {
      if (obj.name === 'Weapon_Pivot') {
        bot.weaponMesh = obj;
        bot.weaponMesh.rotation.set(0, 0, 0);
        bot.weaponMesh.quaternion.set(0, 0, 0, 1);
      }
      if (obj.name && obj.name.startsWith('Armor_') && !obj.name.includes('_Mesh')) {
        bot.armorPanels.push({ name: obj.name, mesh: obj, attached: true });
      }
      if (obj.name && obj.name.startsWith('Wheel_') && !obj.name.includes('_Mesh')) {
        const side = (obj.name.endsWith('L') || obj.name.includes('_L')) ? 'left' : 'right';
        bot.wheels.push({ name: obj.name, mesh: obj, side: side, attached: true });
      }
      if (obj.isMesh) {
        optimizeRobotMaterial(obj);
      }
    });
    bot.cadAttached = true;
  }

  function attachCadToRobot1(bot) { attachCadToBot(bot, 'robot1'); }
  function attachCadToRobot2(bot) { attachCadToBot(bot, 'robot2'); }
  function attachCadToRobot3(bot) { attachCadToBot(bot, 'robot3'); }
  function attachCadToRobot4(bot) { attachCadToBot(bot, 'robot4'); }
  function attachCadToRobot5(bot) { attachCadToBot(bot, 'robot5'); }
  function attachCadToRobot6(bot) { attachCadToBot(bot, 'robot6'); }

  // ========================================================
  // 4. ROBOT BUILDER & DETACHABLE ARMOR PLATES
  // ========================================================
  function createRobotMesh(type) {
    const root = new THREE.Group();
    const tiltGroup = new THREE.Group();
    root.add(tiltGroup);

    const armorPanels = [];
    const wheels = [];
    let weaponMesh = null;
    let cadAttached = false;

    const sceneToClone = getBotScene(type);
    if (sceneToClone) {
      const clone = sceneToClone.clone(true);
      tiltGroup.add(clone);

      clone.traverse(obj => {
        if (obj.name === 'Weapon_Pivot') {
          weaponMesh = obj;
          weaponMesh.rotation.set(0, 0, 0);
          weaponMesh.quaternion.set(0, 0, 0, 1);
        }
        if (obj.name && obj.name.startsWith('Armor_') && !obj.name.includes('_Mesh')) {
          armorPanels.push({ name: obj.name, mesh: obj, attached: true });
        }
        if (obj.name && obj.name.startsWith('Wheel_') && !obj.name.includes('_Mesh')) {
          const side = (obj.name.endsWith('L') || obj.name.includes('_L')) ? 'left' : 'right';
          wheels.push({ name: obj.name, mesh: obj, side: side, attached: true });
        }
        if (obj.isMesh) {
          optimizeRobotMaterial(obj);
        }
      });
      cadAttached = true;
    }

    return { root, tiltGroup, weaponMesh: weaponMesh || tiltGroup, armorPanels, wheels, cadAttached };
  }

