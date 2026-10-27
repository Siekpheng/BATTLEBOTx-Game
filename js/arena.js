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
    c.width = 2048;
    c.height = 2048;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 16;

    const bbxImg = new Image();
    bbxImg.src = 'logo_battlebotx.png';

    const renderFloor = () => {
      const W = 2048;
      const H = 2048;
      const margin = 36;
      const cx = 1024;
      const cy = 1024;

      // 1. Base Industrial Satin Combat Steel Floor
      ctx.fillStyle = '#737884';
      ctx.fillRect(0, 0, W, H);

      // Subtle metallic rolled steel plate grain
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      for (let i = 0; i < 60; i++) {
        const py = Math.floor(Math.random() * H);
        const ph = Math.floor(Math.random() * 8) + 2;
        ctx.fillRect(0, py, W, ph);
      }
      ctx.restore();

      // Outer boundary line
      ctx.strokeStyle = '#222630';
      ctx.lineWidth = 6;
      ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);

      // 2. Four Corner Light-Silver Triangular Plates (Brushed Aluminum / Stainless Steel)
      const cornerSize = 380;
      const cornerPlates = [
        // Top-Left
        [ [margin, margin], [margin + cornerSize, margin], [margin, margin + cornerSize] ],
        // Top-Right
        [ [W - margin, margin], [W - margin - cornerSize, margin], [W - margin, margin + cornerSize] ],
        // Bottom-Left
        [ [margin, H - margin], [margin + cornerSize, H - margin], [margin, H - margin - cornerSize] ],
        // Bottom-Right
        [ [W - margin, H - margin], [W - margin - cornerSize, H - margin], [W - margin, H - margin - cornerSize] ]
      ];

      cornerPlates.forEach(pts => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        ctx.fillStyle = '#737884'; // Gray like the rest of the arena floor
        ctx.fill();
        ctx.strokeStyle = '#252932'; // Clean dark steel perimeter seam
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      });

      // 3. Three Modular Floor Panels with 2 Vertical Seams
      const seamX1 = 580;
      const seamX2 = 1468;

      [seamX1, seamX2].forEach(sx => {
        // Dark groove
        ctx.beginPath();
        ctx.moveTo(sx, margin);
        ctx.lineTo(sx, H - margin);
        ctx.strokeStyle = '#222630';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Light metallic bevel highlight
        ctx.beginPath();
        ctx.moveTo(sx + 2.5, margin);
        ctx.lineTo(sx + 2.5, H - margin);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 4. M8 Hex Bolt Fasteners along Seams & Perimeter
      const drawBolt = (x, y, r = 7) => {
        ctx.save();
        // Bolt head shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath(); ctx.arc(x + 1, y + 1.5, r, 0, Math.PI * 2); ctx.fill();
        // Bolt dark steel base
        ctx.fillStyle = '#1a1d24';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // Metallic specular rim
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.stroke();
        // Inner socket hole
        ctx.fillStyle = '#121418';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };

      const drawBoltPair = (x, y, dx = 14) => {
        drawBolt(x - dx, y);
        drawBolt(x + dx, y);
      };

      // Bolt pairs along the two vertical seams
      const seamBoltYs = [120, 260, 520, 880, 1168, 1528, 1788, 1928];
      seamBoltYs.forEach(by => {
        drawBoltPair(seamX1, by);
        drawBoltPair(seamX2, by);
      });

      // Outer perimeter bolts
      for (let bx = 450; bx <= W - 450; bx += 220) {
        drawBolt(bx, margin + 12);
        drawBolt(bx, H - margin - 12);
      }
      for (let by = 450; by <= H - 450; by += 220) {
        drawBolt(margin + 12, by);
        drawBolt(W - margin - 12, by);
      }

      // 5. Team Starting Boxes (Generous 340x340 tournament boxes centered at Z = +/-9.626)
      // Top Red Starting Box (North, Enemy / P2 Starting Position)
      const redW = 340, redH = 340;
      const redX = cx - redW / 2, redY = margin + 12;
      ctx.save();
      ctx.fillStyle = '#b23630';
      ctx.fillRect(redX, redY, redW, redH);
      ctx.strokeStyle = '#1a1d24';
      ctx.lineWidth = 5;
      ctx.strokeRect(redX, redY, redW, redH);
      // Subtle metallic highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(redX + 4, redY + 4, redW - 8, redH - 8);
      ctx.restore();

      // Bottom Green Starting Box (South, Player 1 Starting Position)
      const greenW = 340, greenH = 340;
      const greenX = cx - greenW / 2, greenY = H - margin - 12 - greenH;
      ctx.save();
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(greenX, greenY, greenW, greenH);
      ctx.strokeStyle = '#1a1d24';
      ctx.lineWidth = 5;
      ctx.strokeRect(greenX, greenY, greenW, greenH);
      // Subtle metallic highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(greenX + 4, greenY + 4, greenW - 8, greenH - 8);
      ctx.restore();

      // 6. Left Panel Features (Two Circular Milled Rings)
      [830, 1218].forEach(py => {
        ctx.save();
        // Outer dark ring
        ctx.strokeStyle = '#252932';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(310, py, 52, 0, Math.PI * 2); ctx.stroke();
        // Inner ring
        ctx.strokeStyle = '#252932';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(310, py, 36, 0, Math.PI * 2); ctx.stroke();
        // Center pin
        ctx.fillStyle = '#1e222a';
        ctx.beginPath(); ctx.arc(310, py, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // 7. Right Panel Features (Two Square Milled Hatches)
      [830, 1218].forEach(py => {
        ctx.save();
        // Outer square
        ctx.strokeStyle = '#252932';
        ctx.lineWidth = 6;
        ctx.strokeRect(1738 - 50, py - 50, 100, 100);
        // Inner square
        ctx.strokeStyle = '#252932';
        ctx.lineWidth = 3;
        ctx.strokeRect(1738 - 34, py - 34, 68, 68);
        ctx.restore();
      });

      // 8. Hazard Markings
      // Top-Left Orange Hazard Ring
      ctx.save();
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(490, 490, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#222630';
      ctx.beginPath(); ctx.arc(490, 490, 34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Bottom-Right Orange Hazard Ring
      ctx.save();
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(1558, 1558, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#222630';
      ctx.beginPath(); ctx.arc(1558, 1558, 34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Bottom-Left Triangular Chevron (pointing outward toward corner)
      ctx.save();
      ctx.strokeStyle = '#222630';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(490 - 45, 1558 + 45);
      ctx.lineTo(490 + 45, 1558 + 20);
      ctx.lineTo(490 - 20, 1558 - 45);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Top-Right Triangular Chevron (pointing outward toward corner)
      ctx.save();
      ctx.strokeStyle = '#222630';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(1558 + 45, 490 - 45);
      ctx.lineTo(1558 - 45, 490 - 20);
      ctx.lineTo(1558 + 20, 490 + 45);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // 9. Center Emblem Square Box
      const boxSize = 580;
      const halfBox = boxSize / 2;
      const bx1 = cx - halfBox;
      const by1 = cy - halfBox;

      ctx.save();
      // Drop shadow for the center plate
      ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      // White/platinum box background
      ctx.fillStyle = '#f5f7f9';
      ctx.fillRect(bx1, by1, boxSize, boxSize);
      ctx.shadowColor = 'transparent';
      // Green perimeter frame
      ctx.strokeStyle = '#284e20';
      ctx.lineWidth = 12;
      ctx.strokeRect(bx1, by1, boxSize, boxSize);
      ctx.restore();

      // Center Emblem Graphic
      if (bbxImg.complete && bbxImg.naturalWidth > 0) {
        ctx.save();
        const pad = 14;
        ctx.beginPath();
        ctx.rect(bx1 + pad, by1 + pad, boxSize - pad * 2, boxSize - pad * 2);
        ctx.clip();
        const logoW = boxSize - pad * 2;
        const logoH = Math.round(logoW * (bbxImg.naturalHeight / bbxImg.naturalWidth));
        ctx.drawImage(bbxImg, bx1 + pad, cy - logoH / 2, logoW, logoH);
        ctx.restore();
      } else {
        // Fallback procedural emblem
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx1, by1, boxSize, boxSize);
        ctx.clip();
        ctx.fillStyle = '#d4972c';
        ctx.strokeStyle = '#284e20';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(bx1, by1 + boxSize);
        ctx.lineTo(bx1, by1 + 40);
        ctx.lineTo(bx1 + boxSize - 30, by1 + 40);
        ctx.lineTo(cx + 40, cy);
        ctx.lineTo(bx1 + boxSize, cy + 60);
        ctx.lineTo(bx1 + boxSize, by1 + boxSize);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 10. Khmer Text Above Center: "សង្វៀន រ៉ូបូត" (Robot Arena)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 80px "Koulen", "Kantumruy Pro", "Leelawadee UI", "Khmer UI", sans-serif';
      ctx.fillStyle = '#222630';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillText('សង្វៀន រ៉ូបូត', cx, 590);
      ctx.restore();

      // 11. English Text Below Center: "BATTLEBOTx"
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 84px Orbitron, sans-serif';
      ctx.letterSpacing = '0.08em';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = '#181b22';
      ctx.lineWidth = 6;
      ctx.strokeText('BATTLEBOTx', cx, 1468);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#656b78';
      ctx.fillText('BATTLEBOTx', cx, 1468);
      ctx.restore();
    };

    bbxImg.onload = () => { renderFloor(); tex.needsUpdate = true; };
    if (document.fonts) {
      document.fonts.ready.then(() => { renderFloor(); tex.needsUpdate = true; });
    }
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
    roughness: 0.58, // Authentic satin steel combat surface (gives crisp metallic sheen under arena lights)
    metalness: 0.25  // Real painted steel combat floor
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = -0.2;
  floorMesh.receiveShadow = true;
  arenaGroup.add(floorMesh);

  // 3. Lower Steel Bumper / Kickplate (Curb around bottom perimeter)
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x222630,
    metalness: 0.65,
    roughness: 0.35
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

