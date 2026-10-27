// ========================================================
// BATTLEBOTx - THREE.JS ARENA, LIGHTING & TEXTURES
// ========================================================

  // ========================================================
  // 2. THREE.JS SCENE, ARENA & LIGHTS
  // ========================================================
  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  // Dark, atmospheric tournament hall (matches official photo)
  scene.background = new THREE.Color(0x02050e);
  scene.fog = new THREE.FogExp2(0x0a0507, 0.010);

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 240);
  const cameraP2 = new THREE.PerspectiveCamera(46, (window.innerWidth * 0.5) / window.innerHeight, 0.1, 240);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.80; // Dark, moody, high-contrast atmospheric arena exposure
  container.appendChild(renderer.domElement);

  // Professional Tournament Cinema Lighting (Dark Arena Atmosphere):
  // 1. Dual-tone hemisphere light: soft sky tint (0xdbeafe, 0.22), deep floor contrast (0x0f172a, 0.16)
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.22);
  scene.add(hemiLight);

  // 2. Main overhead tournament keylight (crisp neutral white shining straight down over arena center)
  const topCenterLight = new THREE.DirectionalLight(0xffffff, 0.52);
  topCenterLight.position.set(0, 32, 1);
  topCenterLight.target.position.set(0, 0, 0);
  topCenterLight.castShadow = true;
  topCenterLight.shadow.mapSize.width = 2048;
  topCenterLight.shadow.mapSize.height = 2048;
  topCenterLight.shadow.camera.near = 5;
  topCenterLight.shadow.camera.far = 55;
  const shadowRange = 16;
  topCenterLight.shadow.camera.left = -shadowRange;
  topCenterLight.shadow.camera.right = shadowRange;
  topCenterLight.shadow.camera.top = shadowRange;
  topCenterLight.shadow.camera.bottom = -shadowRange;
  topCenterLight.shadow.bias = -0.00005;
  topCenterLight.shadow.normalBias = 0.02;
  scene.add(topCenterLight);
  scene.add(topCenterLight.target);

  // 3. Dual overhead arena combat spotlights focused on the fighting arena
  const spot1 = new THREE.SpotLight(0xf8fafc, 0.45, 42, Math.PI / 3.4, 0.35, 1.1);
  spot1.position.set(-4.0, 20.0, -1.0);
  spot1.target.position.set(-1.0, 0, 0);
  spot1.castShadow = false; // Prevents multi-shadow acne on robot assemblies
  scene.add(spot1);
  scene.add(spot1.target);

  const spot2 = new THREE.SpotLight(0xf8fafc, 0.45, 42, Math.PI / 3.4, 0.35, 1.1);
  spot2.position.set(4.0, 20.0, -1.0);
  spot2.target.position.set(1.0, 0, 0);
  spot2.castShadow = false;
  scene.add(spot2);
  scene.add(spot2.target);

  // 4. Subtle metallic edge rim light from the North/rear: catches metallic bevels & armor silhouettes
  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.20);
  rimLight.position.set(0, 16, -16);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  // ========================================================
  // 4x4m SQUARE BATTLEBOX ENCLOSURE (CALIBRATED TO CAD SPECS)
  // Robot 1 Reference Specs: Width = 315mm (1.9265 u), Length = 421mm (2.6001 u)
  // Real-World Proportions: 4000mm arena / 315mm bot width = 12.698x ratio
  // ========================================================
  const ARENA_METERS = 4.0;
  const UNITS_PER_METER = 1.9265 / 0.315; // ~6.11587 units per meter (calibrated to Robot 1 CAD width 315mm)
  const ARENA_SIZE = ARENA_METERS * UNITS_PER_METER; // ~24.46 units (4.0m x 4.0m arena)
  const ARENA_HALF = ARENA_SIZE / 2; // ~12.23 units
  const ARENA_HEIGHT = 2.35 * UNITS_PER_METER; // ~14.37 units (~2.35m tall enclosure)
  const wallRadius = ARENA_HALF; // For backward compatibility

  function createFloorTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;

    const bbxImg = new Image();
    bbxImg.src = 'logo_battlebotx.png';

    const renderFloor = () => {
      // 1. Clean matte slate-steel combat floor (#2b3544)
      ctx.fillStyle = '#2b3544';
      ctx.fillRect(0, 0, 1024, 1024);

      // 2. Subtle arena floor tile seams
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1.5;
      const step = 64;
      for (let i = 0; i <= 1024; i += step) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
      }

      // 3. Outer perimeter boundary caution line
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
      ctx.lineWidth = 6;
      ctx.strokeRect(36, 36, 952, 952);

      // Inner subtle border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(48, 48, 928, 928);

      // ========================================================
      // 4. BLUE STARTING SQUARE (West / Left Spawn: x=-7.5, z=0 -> canvas 198, 512)
      // ========================================================
      const blueX = 198, blueY = 512, sqSize = 200, halfSq = sqSize / 2;
      const bx = blueX - halfSq, by = blueY - halfSq;

      // Subtle blue glow fill
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.fillRect(bx, by, sqSize, sqSize);

      // Outer Blue Border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 5;
      ctx.strokeRect(bx, by, sqSize, sqSize);

      // Inner Blue Accent Frame
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 8, by + 8, sqSize - 16, sqSize - 16);

      // High-tech Corner Brackets
      const bLen = 22;
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 3.5;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(bx, by + bLen); ctx.lineTo(bx, by); ctx.lineTo(bx + bLen, by); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(bx + sqSize, by + bLen); ctx.lineTo(bx + sqSize, by); ctx.lineTo(bx + sqSize - bLen, by); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(bx, by + sqSize - bLen); ctx.lineTo(bx, by + sqSize); ctx.lineTo(bx + bLen, by + sqSize); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(bx + sqSize, by + sqSize - bLen); ctx.lineTo(bx + sqSize, by + sqSize); ctx.lineTo(bx - bLen + sqSize, by + sqSize); ctx.stroke();

      // Blue Square Start Label (Top)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 17px Orbitron, sans-serif';
      ctx.fillText('BLUE SQUARE', blueX, by + 24);

      // Start alignment chevron pointing East (towards arena center)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.font = '700 13px Orbitron, sans-serif';
      ctx.fillText('► START ►', blueX, by + sqSize - 22);

      // Crosshair center pip
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(blueX - 18, blueY); ctx.lineTo(blueX + 18, blueY);
      ctx.moveTo(blueX, blueY - 18); ctx.lineTo(blueX, blueY + 18);
      ctx.stroke();

      // ========================================================
      // 5. RED STARTING SQUARE (East / Right Spawn: x=+7.5, z=0 -> canvas 826, 512)
      // ========================================================
      const redX = 826, redY = 512;
      const rx = redX - halfSq, ry = redY - halfSq;

      // Subtle red glow fill
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(rx, ry, sqSize, sqSize);

      // Outer Red Border
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.strokeRect(rx, ry, sqSize, sqSize);

      // Inner Red Accent Frame
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 8, ry + 8, sqSize - 16, sqSize - 16);

      // High-tech Corner Brackets
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 3.5;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(rx, ry + bLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + bLen, ry); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(rx + sqSize, ry + bLen); ctx.lineTo(rx + sqSize, ry); ctx.lineTo(rx + sqSize - bLen, ry); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(rx, ry + sqSize - bLen); ctx.lineTo(rx, ry + sqSize); ctx.lineTo(rx + bLen, ry + sqSize); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(rx + sqSize, ry + sqSize - bLen); ctx.lineTo(rx + sqSize, ry + sqSize); ctx.lineTo(rx - bLen + sqSize, ry + sqSize); ctx.stroke();

      // Red Square Start Label (Top)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 17px Orbitron, sans-serif';
      ctx.fillText('RED SQUARE', redX, ry + 24);

      // Start alignment chevron pointing West (towards arena center)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.font = '700 13px Orbitron, sans-serif';
      ctx.fillText('◄ START ◄', redX, ry + sqSize - 22);

      // Crosshair center pip
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.40)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(redX - 18, redY); ctx.lineTo(redX + 18, redY);
      ctx.moveTo(redX, redY - 18); ctx.lineTo(redX, redY + 18);
      ctx.stroke();

      // ========================================================
      // 6. ARENA CENTER DECAL & BATTLEBOTx LOGO
      // ========================================================
      const cx = 512, cy = 512;

      // Outer circular tournament ring
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 195, 0, Math.PI * 2); ctx.stroke();

      // Inner gold hazard ring
      ctx.strokeStyle = 'rgba(253, 201, 17, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Subtle center circle fill
      ctx.fillStyle = 'rgba(15, 23, 42, 0.40)';
      ctx.beginPath(); ctx.arc(cx, cy, 175, 0, Math.PI * 2); ctx.fill();

      // Draw BATTLEBOTx Logo emblem with white background
      if (bbxImg.complete && bbxImg.naturalWidth > 0) {
        const logoW = 146;
        const logoH = Math.round(logoW * (bbxImg.naturalHeight / bbxImg.naturalWidth));
        const badgePad = 8;
        const badgeW = logoW + badgePad * 2;
        const badgeH = logoH + badgePad * 2;
        const badgeX = cx - badgeW / 2;
        const badgeY = cy - badgeH / 2 - 76;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#fdc911';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 14);
        } else {
          ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.clip();
        ctx.drawImage(bbxImg, cx - logoW / 2, badgeY + badgePad, logoW, logoH);
        ctx.restore();
      } else {
        // Fallback procedural chevron
        ctx.fillStyle = '#fdc911';
        ctx.strokeStyle = '#7d973c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - 50, cy - 100);
        ctx.lineTo(cx + 40, cy - 65);
        ctx.lineTo(cx - 10, cy - 65);
        ctx.lineTo(cx + 40, cy - 30);
        ctx.lineTo(cx - 50, cy - 30);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }

      // Exact Capitalization: BATTLEBOTx (capital BATTLEBOT, lowercase x)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Drop shadow for crisp contrast against any floor lighting
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px Orbitron, sans-serif';
      ctx.fillText('BATTLEBOTx', cx, cy + 58);
      ctx.restore();
    };

    bbxImg.onload = () => { renderFloor(); tex.needsUpdate = true; };
    renderFloor();

    return tex;
  }

  function createNorthBillboardTexture() {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 512;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;

    const bbxImg = new Image();
    bbxImg.src = 'logo_battlebotx.png';

    const aifarmImg = new Image();
    aifarmImg.src = 'logo_aifarm.png';

    const renderBillboard = () => {
      // Stage LED Big Screen Background
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, 2048, 512);

      // Glowing outer border frame
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 10;
      ctx.strokeRect(24, 16, 2000, 480);

      // Inner accent frame
      ctx.strokeStyle = 'rgba(253, 201, 17, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(38, 30, 1972, 452);

      // Center Branding Content (Clean Esports Broadcast, No 4x4m / Official Tournament text)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // Header: AI FARM ROBOTICS
      ctx.fillStyle = '#38bdf8';
      ctx.font = '800 46px Orbitron, sans-serif';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 14;
      ctx.fillText('AI FARM ROBOTICS', 1024, 135);

      // Main Logo Title: Exact Casing BATTLEBOTx
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 110px Orbitron, sans-serif';
      ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
      ctx.shadowBlur = 22;
      ctx.fillText('BATTLEBOTx', 1024, 275);

      // Spec subtitle
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 32px Orbitron, sans-serif';
      ctx.fillText('HIGH-PERFORMANCE COMBAT ROBOTICS', 1024, 390);
      ctx.restore();

      // Symmetrical Flank Logos: Calibrated for True Square in 3D Space
      // Plane 3D Aspect Ratio is 22.9957 / 5.8500 = 3.9309. Canvas is 2048 x 512 (4.0).
      // Badge of 218px width x 214px height on canvas projects to a 100% exact square in 3D camera space!
      const badgeW = 218;
      const badgeH = 214;
      const pad = 12;
      const imgW = badgeW - pad * 2;
      const imgH = badgeH - pad * 2;

      const drawBadge = (img, posX, posY) => {
        if (!img.complete || img.naturalWidth === 0) return;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#fdc911';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(posX - badgeW / 2, posY - badgeH / 2, badgeW, badgeH, 16);
        } else {
          ctx.rect(posX - badgeW / 2, posY - badgeH / 2, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.clip();
        ctx.drawImage(img, posX - imgW / 2, posY - imgH / 2, imgW, imgH);
        ctx.restore();
      };

      // Left Flank: AI FARM ROBOTICS Logo
      drawBadge(aifarmImg, 240, 256);

      // Right Flank: BATTLEBOTx Logo
      drawBadge(bbxImg, 1808, 256);
    };

    bbxImg.onload = () => { renderBillboard(); tex.needsUpdate = true; };
    aifarmImg.onload = () => { renderBillboard(); tex.needsUpdate = true; };
    renderBillboard();

    return tex;
  }

  const arenaGroup = new THREE.Group();
  scene.add(arenaGroup);

  // 1. Dark Tournament Venue Floor (Matches photo background - No green plane)
  const venueFloorGeo = new THREE.PlaneGeometry(90, 90);
  venueFloorGeo.rotateX(-Math.PI / 2);
  const venueFloorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0507, // Dark vignette floor
    roughness: 0.98,
    metalness: 0.02
  });
  const venueFloor = new THREE.Mesh(venueFloorGeo, venueFloorMat);
  venueFloor.position.y = -0.21;
  venueFloor.receiveShadow = true;
  arenaGroup.add(venueFloor);

  // 2. Main Arena Combat Floor (4x4m square plate, reflective tournament sheen)
  const floorGeo = new THREE.BoxGeometry(ARENA_SIZE, 0.4, ARENA_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createFloorTexture(),
    roughness: 0.65, // Authentic satin steel combat surface (gives subtle sheen without blinding glare)
    metalness: 0.22  // Real painted steel combat floor
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = -0.2;
  floorMesh.receiveShadow = true;
  arenaGroup.add(floorMesh);

  // 3. Lower Steel Bumper / Kickplate (Curb around bottom perimeter)
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.22
  });

  const curbH = 0.55;
  const curbT = 0.35;
  const curbY = curbH / 2;

  const curbConfigs = [
    { w: ARENA_SIZE, h: curbH, d: curbT, x: 0, y: curbY, z: -ARENA_HALF + curbT / 2 }, // North
    { w: ARENA_SIZE, h: curbH, d: curbT, x: 0, y: curbY, z: ARENA_HALF - curbT / 2 },  // South
    { w: curbT, h: curbH, d: ARENA_SIZE, x: -ARENA_HALF + curbT / 2, y: curbY, z: 0 }, // West
    { w: curbT, h: curbH, d: ARENA_SIZE, x: ARENA_HALF - curbT / 2, y: curbY, z: 0 }   // East
  ];
  curbConfigs.forEach(c => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), curbMat);
    curb.position.set(c.x, c.y, c.z);
    curb.castShadow = true;
    curb.receiveShadow = true;
    arenaGroup.add(curb);
  });

  // ========================================================
  // BROADCAST TOURNAMENT ARENA LIGHTING EFFECTS
  // ========================================================
  // A. Dynamic Kinetic Collision Flash Light (flashes upon weapon impacts)
  const impactFlashLight = new THREE.PointLight(0xffeedd, 0, 24, 1.8);
  impactFlashLight.position.set(0, 1, 0);
  scene.add(impactFlashLight);

  function triggerImpactFlash(pos, intensity = 4.0, colorHex = 0xffeedd) {
    if (pos) impactFlashLight.position.copy(pos);
    impactFlashLight.color.setHex(colorHex);
    impactFlashLight.intensity = intensity;
  }

  // B. Perimeter Neon LED Hazard Strips (Animated High-Tech Border Under-Glow)
  const arenaLedStrips = [];
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const ledH = 0.05;
  const ledY = curbH + 0.03;
  const ledConfigs = [
    { w: ARENA_SIZE - 0.4, h: ledH, d: 0.06, x: 0, y: ledY, z: -ARENA_HALF + curbT / 2 },
    { w: ARENA_SIZE - 0.4, h: ledH, d: 0.06, x: 0, y: ledY, z: ARENA_HALF - curbT / 2 },
    { w: 0.06, h: ledH, d: ARENA_SIZE - 0.4, x: -ARENA_HALF + curbT / 2, y: ledY, z: 0 },
    { w: 0.06, h: ledH, d: ARENA_SIZE - 0.4, x: ARENA_HALF - curbT / 2, y: ledY, z: 0 }
  ];
  ledConfigs.forEach(cfg => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), ledMat);
    strip.position.set(cfg.x, cfg.y, cfg.z);
    arenaGroup.add(strip);
    arenaLedStrips.push(strip);
  });

  // C. Four Corner Industrial Warning Beacons
  const cornerBeacons = [];
  const beaconPostMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
  const beaconGlassMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const beaconOffset = ARENA_HALF - 0.35;
  const cornerCoords = [
    [-beaconOffset, -beaconOffset],
    [ beaconOffset, -beaconOffset],
    [-beaconOffset,  beaconOffset],
    [ beaconOffset,  beaconOffset]
  ];
  cornerCoords.forEach(([cx, cz]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.35, 0.32), beaconPostMat);
    post.position.set(cx, 1.35 / 2, cz);
    arenaGroup.add(post);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12), beaconGlassMat);
    cap.position.set(cx, 1.35 + 0.11, cz);
    arenaGroup.add(cap);

    const bLight = new THREE.PointLight(0xf59e0b, 0.35, 7.5, 2.0);
    bLight.position.set(cx, 1.35 + 0.20, cz);
    arenaGroup.add(bLight);
    cornerBeacons.push({ cap, light: bLight });
  });

  // D. Moving Tournament Searchlights with Volumetric Beams
  const searchSpot1 = new THREE.SpotLight(0x00f0ff, 0.50, 42, Math.PI / 7.5, 0.45, 1.2);
  searchSpot1.position.set(-11, 23, -11);
  scene.add(searchSpot1);
  scene.add(searchSpot1.target);

  const searchSpot2 = new THREE.SpotLight(0xa855f7, 0.45, 42, Math.PI / 7.5, 0.45, 1.2);
  searchSpot2.position.set(11, 23, 11);
  scene.add(searchSpot2);
  scene.add(searchSpot2.target);

  function createVolumetricBeam(colorHex) {
    const coneGeo = new THREE.CylinderGeometry(0.35, 5.2, 25, 16, 1, true);
    coneGeo.translate(0, -12.5, 0);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    return new THREE.Mesh(coneGeo, coneMat);
  }
  const beamCone1 = createVolumetricBeam(0x00f0ff);
  scene.add(beamCone1);
  const beamCone2 = createVolumetricBeam(0xa855f7);
  scene.add(beamCone2);

  // E. Dynamic Weapon Friction Glow Lights
  const playerWeaponGlow = new THREE.PointLight(0x00e5ff, 0, 5.5, 2.0);
  scene.add(playerWeaponGlow);
  const enemyWeaponGlow = new THREE.PointLight(0xff3b30, 0, 5.5, 2.0);
  scene.add(enemyWeaponGlow);

  // 4. Open-Top Transparent Polycarbonate Walls (Clean unobstructed view - No Pillars, No Roof)
  const arenaWallMeshes = [];
  const wallH = 7.5; // Clean tournament wall height
  const wallY = 0.55 + wallH / 2;

  const wallDefs = [
    { name: 'north', w: ARENA_SIZE, h: wallH, d: 0.08, x: 0, y: wallY, z: -ARENA_HALF, nx: 0, nz: -1 },
    { name: 'south', w: ARENA_SIZE, h: wallH, d: 0.08, x: 0, y: wallY, z: ARENA_HALF, nx: 0, nz: 1 },
    { name: 'west',  w: 0.08, h: wallH, d: ARENA_SIZE, x: -ARENA_HALF, y: wallY, z: 0, nx: -1, nz: 0 },
    { name: 'east',  w: 0.08, h: wallH, d: ARENA_SIZE, x: ARENA_HALF, y: wallY, z: 0, nx: 1, nz: 0 }
  ];

  wallDefs.forEach(def => {
    const wMat = new THREE.MeshStandardMaterial({
      color: 0xd8ecf8,
      transparent: true,
      opacity: 0.28,
      roughness: 0.10,
      metalness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), wMat);
    wMesh.position.set(def.x, def.y, def.z);
    arenaGroup.add(wMesh);

    arenaWallMeshes.push({
      mesh: wMesh,
      material: wMat,
      nx: def.nx, // Outward normal
      nz: def.nz,
      currentOpacity: 0.28
    });
  });

  // 5. Event Tournament Banner Mounted Directly on the North Wall
  const billboardGeo = new THREE.PlaneGeometry(ARENA_SIZE * 0.94, wallH * 0.78);
  const billboardMat = new THREE.MeshBasicMaterial({
    map: createNorthBillboardTexture(),
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide
  });
  const billboard = new THREE.Mesh(billboardGeo, billboardMat);
  billboard.position.set(0, wallY, -ARENA_HALF + 0.06);
  arenaGroup.add(billboard);

  // 6. Overhead combat lighting is provided by roofSpot1 and roofSpot2 directly above.

  function updateArenaWallTransparency(dt, activeCam = camera, primaryBot = playerBot) {
    const camRef = activeCam || camera;
    const cx = camRef.position.x;
    const cz = camRef.position.z;

    for (let i = 0; i < arenaWallMeshes.length; i++) {
      const w = arenaWallMeshes[i];
      let targetOpacity = 0.28;

      if (playerBot) {
        const px = playerBot.x;
        const pz = playerBot.z;
        // Normal points outward
        const pDot = px * w.nx + pz * w.nz;
        const pDist = ARENA_HALF - pDot;

        let eDist = 999;
        if (enemyBot) {
          const eDot = enemyBot.x * w.nx + enemyBot.z * w.nz;
          eDist = ARENA_HALF - eDot;
        }

        const cDot = cx * w.nx + cz * w.nz;
        const cDist = ARENA_HALF - cDot;

        // Distance from closest bot to this wall
        const minBotDist = Math.min(pDist, eDist);

        // When robot is close to wall (< 3.2 units), fade even more transparent (0.08)
        if (minBotDist < 3.2) {
          const proximity = Math.max(0, Math.min(1, minBotDist / 3.2));
          targetOpacity = Math.min(targetOpacity, 0.08 + 0.20 * proximity);
        }

        // When camera is on the other side looking through or close to this wall
        if (cDist < 3.0 || (cDot > pDot && cDot > ARENA_HALF - 2.5)) {
          const camProximity = Math.max(0, Math.min(1, Math.max(0, cDist) / 3.0));
          targetOpacity = Math.min(targetOpacity, 0.02 + 0.18 * camProximity);
        }
      } else {
        // Menu cinematic flyover mode:
        // When camera is outside looking inward, fade whichever wall is between the camera and center
        const cDot = cx * w.nx + cz * w.nz;
        if (cDot > 0) { // Camera is on the outer side of this wall
          const distToWall = cDot - ARENA_HALF;
          if (distToWall > -2.0 && distToWall < 9.0) {
            targetOpacity = 0.04; // Transparent so interior arena, lighting & floor are crystal clear!
          } else {
            targetOpacity = 0.15;
          }
        } else {
          targetOpacity = 0.22;
        }
      }

      w.currentOpacity += (targetOpacity - w.currentOpacity) * Math.min(1, dt * 8.0);
      w.material.opacity = w.currentOpacity;

      // When North wall is transparent to camera, fade the banner on the North wall too
      if (w.nz < -0.9 && billboardMat) {
        if (!playerBot) {
          billboardMat.opacity = (cz < -ARENA_HALF) ? Math.max(0.08, w.currentOpacity) : 0.95;
        } else {
          billboardMat.opacity = Math.max(0.08, w.currentOpacity);
        }
      }
    }
  }

