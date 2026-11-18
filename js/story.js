// Scroll-driven 3D story:
//   1) Sam (blue, white helmet) at the north of 75 firefighters; camera pulls back to reveal 150+ surge
//   2) walks to an audit desk and sits at a laptop with binders (second-line oversight)
//   3) walks to a classroom and points at a screen in front of 20 students (training)
//   4) walks to the ship's edge, hops into a RIB with a Navy boat SAR team, the RIB is lowered by davit,
//      and the team heads to a person overboard (search & rescue)
// Scroll position drives the story; when the reader scrolls past, the last frame stays frozen.
// Three.js is self-hosted in js/vendor.

const story = document.getElementById('story');
if (story) init().catch((err) => { console.error(err); story.classList.add('no-webgl'); });

async function init() {
  const THREE = await import('three');
  const { mergeGeometries } = await import('./vendor/BufferGeometryUtils.js');

  const stage = story.querySelector('.story-stage');
  const canvas = stage.querySelector('canvas');
  const arrowsSvg = stage.querySelector('.story-arrows');
  const hint = stage.querySelector('.scroll-hint');
  const chapterEls = [...stage.querySelectorAll('.chapters li')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const BG = 0x0e0e0e;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 40, 120);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // Deck (the grid floor) ends at the ship's edge, x = EDGE; open water lies beyond.
  const EDGE = 50, SEA_Y = -6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 400), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.x = EDGE - 125;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(250, 250, 0x353535, 0x272727);
  grid.position.set(EDGE - 125, 0.003, 0);
  scene.add(grid);

  // ---------- geometry helpers ----------
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const colorize = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const limb = (a, b, r) => {
    const g = new THREE.CapsuleGeometry(r, a.distanceTo(b), 3, 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    return g;
  };
  const box = (w, h, dd, x, y, z, hex) => colorize(new THREE.BoxGeometry(w, h, dd).translate(x, y, z), hex);
  const band = (r, x, y, z, sz = 1) => {
    const g = new THREE.CylinderGeometry(r, r, 0.05, 18, 1, true);
    g.scale(1, 1, sz); g.translate(x, y, z);
    return g;
  };
  // Firefighter helmet: dome, comb ridge, brim slightly longer at the back, front shield.
  // Sized for a 0.18 head (HK scales the original 0.125-head helmet up to match).
  const HK = 1.42;
  const helmetParts = (hex, shieldHex, y = 1.75) => [
    colorize(new THREE.SphereGeometry(0.15 * HK, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1.06).translate(0, y, 0), hex),
    colorize(new THREE.BoxGeometry(0.03 * HK, 0.04 * HK, 0.26 * HK).translate(0, y + 0.14 * HK, -0.01), hex),
    colorize(new THREE.CylinderGeometry(0.205 * HK, 0.205 * HK, 0.022, 28).scale(1, 1, 1.15).translate(0, y + 0.005, -0.03 * HK), hex),
    colorize(new THREE.BoxGeometry(0.1 * HK, 0.09 * HK, 0.02).rotateX(-0.45).translate(0, y + 0.08 * HK, 0.15 * HK), shieldHex),
  ];
  // Standing mannequin body (front = +z), arms at sides.
  const standingBody = (hex) => [
    limb(V(-0.11, 0.1, 0), V(-0.11, 0.84, 0), 0.095),
    limb(V(0.11, 0.1, 0), V(0.11, 0.84, 0), 0.095),
    limb(V(0, 1.42, 0), V(0, 1.52, 0), 0.06),
    new THREE.CapsuleGeometry(0.19, 0.36, 4, 14).scale(1, 1, 0.72).translate(0, 1.12, 0),
    new THREE.SphereGeometry(0.18, 16, 12).translate(0, 1.7, 0),
    limb(V(0.27, 1.36, 0), V(0.29, 0.82, 0), 0.066),
    limb(V(-0.27, 1.36, 0), V(-0.29, 0.82, 0), 0.066),
  ].map((g) => colorize(g, hex));

  function firefighterGeo() {
    const p = standingBody(0xd11f27);
    p.push(...helmetParts(0xf2c200, 0x151515));
    p.push(colorize(new THREE.CapsuleGeometry(0.085, 0.4, 3, 12).translate(0, 1.16, -0.225), 0xbdbdbd));
    p.push(...[
      band(0.104, -0.11, 0.34, 0), band(0.104, 0.11, 0.34, 0),
      band(0.076, 0.285, 1.0, 0), band(0.076, -0.285, 1.0, 0),
      band(0.2, 0, 1.0, 0, 0.74),
    ].map((g) => colorize(g, 0xf2d43a)));
    return mergeGeometries(p);
  }
  // Navy boat crew: red body, orange life vest, grey boat helmet.
  const vestAndHelmet = (vestY, headY) => [
    colorize(new THREE.CapsuleGeometry(0.225, 0.3, 4, 14).scale(1, 1, 0.8).translate(0, vestY, 0), 0xf07c00),
    colorize(new THREE.SphereGeometry(0.205, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.0, 1.06).translate(0, headY + 0.1, 0), 0x9a9a9a),
  ];
  // Coxswain standing at the helm, hands forward on the console.
  function helmsmanGeo() {
    const R = 0xd11f27;
    const p = [
      limb(V(-0.13, 0.1, 0.05), V(-0.11, 0.84, 0), 0.095),
      limb(V(0.13, 0.1, -0.05), V(0.11, 0.84, 0), 0.095),
      limb(V(0, 1.42, 0), V(0, 1.52, 0), 0.06),
      new THREE.CapsuleGeometry(0.19, 0.36, 4, 14).scale(1, 1, 0.72).translate(0, 1.12, 0),
      new THREE.SphereGeometry(0.18, 16, 12).translate(0, 1.7, 0),
      limb(V(0.27, 1.36, 0), V(0.25, 1.12, 0.22), 0.066), limb(V(0.25, 1.12, 0.22), V(0.14, 1.2, 0.48), 0.062),
      limb(V(-0.27, 1.36, 0), V(-0.25, 1.12, 0.22), 0.066), limb(V(-0.25, 1.12, 0.22), V(-0.14, 1.2, 0.48), 0.062),
    ].map((g) => colorize(g, R));
    p.push(...vestAndHelmet(1.17, 1.65));
    return mergeGeometries(p);
  }
  // Crew member sitting on a tube, forearms resting on the knees.
  function seatedCrewGeo() {
    const R = 0xd11f27;
    const p = [
      limb(V(-0.11, 0.5, 0), V(-0.12, 0.47, 0.4), 0.09), limb(V(0.11, 0.5, 0), V(0.12, 0.47, 0.4), 0.09),
      limb(V(-0.12, 0.47, 0.42), V(-0.14, 0.08, 0.5), 0.085), limb(V(0.12, 0.47, 0.42), V(0.14, 0.08, 0.5), 0.085),
      new THREE.CapsuleGeometry(0.19, 0.36, 4, 14).scale(1, 1, 0.72).rotateX(0.18).translate(0, 0.76, 0.04),
      limb(V(0, 1.05, 0.08), V(0, 1.14, 0.1), 0.06),
      new THREE.SphereGeometry(0.18, 16, 12).translate(0, 1.32, 0.12),
      limb(V(0.27, 0.98, 0.06), V(0.27, 0.72, 0.2), 0.066), limb(V(0.27, 0.72, 0.2), V(0.16, 0.56, 0.4), 0.062),
      limb(V(-0.27, 0.98, 0.06), V(-0.27, 0.72, 0.2), 0.066), limb(V(-0.27, 0.72, 0.2), V(-0.16, 0.56, 0.4), 0.062),
    ].map((g) => colorize(g, R));
    p.push(colorize(new THREE.CapsuleGeometry(0.225, 0.3, 4, 14).scale(1, 1, 0.8).rotateX(0.18).translate(0, 0.81, 0.05), 0xf07c00));
    p.push(colorize(new THREE.SphereGeometry(0.205, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.0, 1.06).translate(0, 1.36, 0.12), 0x9a9a9a));
    return mergeGeometries(p);
  }
  function studentGeo() {
    const S = 0xcfcfcf;
    const p = [
      limb(V(-0.11, 0.5, 0), V(-0.11, 0.5, 0.4), 0.09), limb(V(0.11, 0.5, 0), V(0.11, 0.5, 0.4), 0.09),
      limb(V(-0.11, 0.5, 0.42), V(-0.11, 0.08, 0.45), 0.085), limb(V(0.11, 0.5, 0.42), V(0.11, 0.08, 0.45), 0.085),
      new THREE.CapsuleGeometry(0.19, 0.36, 4, 14).scale(1, 1, 0.72).translate(0, 0.76, 0),
      limb(V(0, 1.05, 0), V(0, 1.14, 0), 0.06),
      new THREE.SphereGeometry(0.18, 16, 12).translate(0, 1.32, 0),
      limb(V(0.27, 0.98, 0), V(0.3, 0.72, 0.14), 0.066), limb(V(0.3, 0.72, 0.14), V(0.2, 0.74, 0.42), 0.062),
      limb(V(-0.27, 0.98, 0), V(-0.3, 0.72, 0.14), 0.066), limb(V(-0.3, 0.72, 0.14), V(-0.2, 0.74, 0.42), 0.062),
    ].map((g) => colorize(g, S));
    p.push(box(0.75, 0.04, 0.45, 0, 0.72, 0.55, 0x6b6b6b), box(0.06, 0.7, 0.3, 0, 0.35, 0.6, 0x4a4a4a));
    p.push(box(0.44, 0.05, 0.42, 0, 0.43, 0, 0x2f2f2f), box(0.44, 0.42, 0.04, 0, 0.7, -0.22, 0x2f2f2f), box(0.05, 0.42, 0.05, 0, 0.21, 0, 0x2f2f2f));
    return mergeGeometries(p);
  }

  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 });
  const d = new THREE.Object3D();

  // ---------- station A: formation ----------
  const SP = 1.9, COLS = 15;
  const crew = new THREE.InstancedMesh(firefighterGeo(), vcMat, 75 + 150);
  crew.castShadow = true; crew.receiveShadow = true;
  scene.add(crew);
  const crewPos = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < COLS; c++) crewPos.push({ x: (c - 7) * SP, z: 2 + r * SP, delay: r * 0.14 + Math.abs(c - 7) * 0.012 });
  for (let r = 0; r < 10; r++) for (let c = 0; c < COLS; c++) crewPos.push({ x: (c - 7) * SP, z: 12.6 + r * SP, row: r, surge: true });
  const surgeTint = new THREE.Color(0.55, 0.55, 0.55), full = new THREE.Color(1, 1, 1);
  crewPos.forEach((p, i) => crew.setColorAt(i, p.surge ? surgeTint : full));

  // ---------- station B: audit desk ----------
  const B = V(30, 0, -6);
  const deskParts = [
    box(1.7, 0.05, 0.85, 0, 0.75, 0, 0x5a5a5a),
    box(0.05, 0.73, 0.8, -0.8, 0.365, 0, 0x3a3a3a), box(0.05, 0.73, 0.8, 0.8, 0.365, 0, 0x3a3a3a),
    box(0.42, 0.02, 0.3, 0, 0.785, 0.12, 0x2a2a2a),
    box(0.07, 0.31, 0.27, -0.72, 0.93, -0.18, 0xd11f27), box(0.07, 0.31, 0.27, -0.64, 0.93, -0.18, 0x1c1c1c),
    box(0.07, 0.31, 0.27, -0.56, 0.93, -0.18, 0xe6e6e6), box(0.07, 0.31, 0.27, -0.48, 0.93, -0.18, 0xd11f27),
    box(0.3, 0.06, 0.4, 0.55, 0.805, -0.05, 0xf2f2f2), box(0.3, 0.04, 0.4, 0.57, 0.855, -0.06, 0xe2e2e2),
    box(0.24, 0.012, 0.33, 0.42, 0.782, 0.24, 0x8a6a43), box(0.2, 0.006, 0.27, 0.42, 0.79, 0.25, 0xffffff),
    box(0.08, 0.02, 0.03, 0.42, 0.795, 0.1, 0x9a9a9a),
    box(0.48, 0.05, 0.46, 0, 0.45, 0.72, 0x2a2a2a), box(0.48, 0.5, 0.05, 0, 0.75, 0.97, 0x2a2a2a), box(0.06, 0.44, 0.06, 0, 0.22, 0.72, 0x2a2a2a),
    box(0.5, 1.4, 1.3, -1.5, 0.7, -0.1, 0x262626),
  ];
  const binderColors = [0xd11f27, 0x1c1c1c, 0xe6e6e6, 0x5a5a5a];
  for (let s = 0; s < 3; s++) for (let i = 0; i < 9; i++) deskParts.push(box(0.3, 0.33, 0.11, -1.38, 0.2 + s * 0.45, -0.62 + i * 0.13, binderColors[(i + s) % 4]));
  const desk = new THREE.Mesh(mergeGeometries(deskParts), vcMat);
  desk.position.copy(B); desk.castShadow = true; desk.receiveShadow = true;
  scene.add(desk);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.015), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4 }));
  lid.position.set(B.x, 0.93, B.z - 0.03); lid.rotation.x = -0.2; lid.castShadow = true;
  const canvasTex = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  // Laptop: a BCM audit checklist
  const lcdTex = canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#f4f6f9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d11f27'; g.fillRect(0, 0, w, 52);
    g.fillStyle = '#fff'; g.font = '600 26px Arial'; g.fillText('BCM AUDIT CHECKLIST', 18, 35);
    const rows = [['Business continuity plan current', 1], ['Business impact analysis reviewed', 1], ['Recovery time objectives met', 1], ['Exercise findings closed', 0], ['Training records complete', 1]];
    rows.forEach(([txt, ok], i) => {
      const y = 92 + i * 46;
      g.strokeStyle = '#555'; g.lineWidth = 3; g.strokeRect(18, y - 22, 26, 26);
      g.fillStyle = ok ? '#1a8f3c' : '#d11f27'; g.font = '600 26px Arial'; g.fillText(ok ? '✓' : '!', 22, y);
      g.fillStyle = '#222'; g.font = '22px Arial'; g.fillText(txt, 58, y - 2);
    });
  });
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshBasicMaterial({ map: lcdTex }));
  lcd.position.set(0, 0, 0.009); lid.add(lcd);
  scene.add(lid);

  // Wall board behind the desk: the business continuity management lifecycle
  const boardTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111'; g.font = '600 40px Arial'; g.fillText('BUSINESS CONTINUITY MANAGEMENT', 36, 64);
    g.fillStyle = '#d11f27'; g.fillRect(36, 82, 120, 6);
    const steps = ['Governance & policy', 'Business impact analysis', 'Risk assessment', 'Continuity plans', 'Exercises & testing', 'Audit & improvement'];
    const cx = w / 2, cy = 300, rx = 330, ry = 150;
    steps.forEach((s, i) => {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / steps.length);
      const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      g.fillStyle = i === 5 ? '#d11f27' : '#111';
      g.fillRect(x - 150, y - 28, 300, 56);
      g.fillStyle = '#fff'; g.font = '600 24px Arial'; g.textAlign = 'center'; g.fillText(s, x, y + 8);
      g.textAlign = 'left';
    });
    g.strokeStyle = '#d11f27'; g.lineWidth = 4; g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(cx, cy, rx - 20, ry - 30, 0, 0, Math.PI * 2); g.stroke();
  });
  const board = new THREE.Group();
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: boardTex }));
  boardFace.position.set(0, 1.65, 0.05);
  const boardFrame = new THREE.Mesh(mergeGeometries([
    box(2.75, 1.45, 0.08, 0, 1.65, 0, 0x1e1e1e), box(0.08, 1.0, 0.08, -1.1, 0.5, 0, 0x1e1e1e), box(0.08, 1.0, 0.08, 1.1, 0.5, 0, 0x1e1e1e),
  ]), vcMat);
  boardFrame.castShadow = true;
  board.add(boardFrame, boardFace);
  board.position.set(B.x + 0.1, 0, B.z - 1.1);
  scene.add(board);
  const CHAIR = V(B.x, 0, B.z + 0.72);

  // ---------- station C: classroom ----------
  const C = V(30, 0, -27);
  const studentMesh = new THREE.InstancedMesh(studentGeo(), vcMat, 20);
  studentMesh.castShadow = true; studentMesh.receiveShadow = true;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    d.position.set(C.x - 2.5 + c * 1.25, 0, C.z + 0.5 + r * 1.45); d.rotation.set(0, Math.PI, 0); d.scale.setScalar(1); d.updateMatrix();
    studentMesh.setMatrixAt(r * 5 + c, d.matrix);
  }
  scene.add(studentMesh);
  const screenTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const g = cv.getContext('2d');
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#d11f27'; g.fillRect(0, 0, 640, 64);
    g.fillStyle = '#ffffff'; g.font = '600 34px Arial'; g.fillText('BUSINESS CONTINUITY EXERCISE', 28, 44);
    g.fillStyle = '#222'; g.font = '600 26px Arial'; g.fillText('Scenario: loss of primary site', 28, 112);
    g.fillStyle = '#9a9a9a';
    [150, 190, 230, 270].forEach((y, i) => { g.fillRect(28, y, 14, 14); g.fillRect(56, y + 2, 300 - i * 40, 10); });
    g.fillStyle = '#d11f27'; [[420, 150, 50], [480, 200, 50], [540, 120, 50]].forEach(([x, y, w]) => g.fillRect(x, y, w, 300 - y));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(C.x + 1.9, 1.9, C.z - 3.3);
  scene.add(screen);
  const screenStand = new THREE.Mesh(mergeGeometries([box(3.4, 2.0, 0.08, 0, 1.9, -0.06, 0x1e1e1e), box(0.1, 0.9, 0.1, -1.2, 0.45, -0.06, 0x1e1e1e), box(0.1, 0.9, 0.1, 1.2, 0.45, -0.06, 0x1e1e1e)]), vcMat);
  screenStand.position.set(C.x + 1.9, 0, C.z - 3.3); screenStand.castShadow = true;
  scene.add(screenStand);

  // ---------- station D: ship's edge, davit, RIB, sea, person overboard ----------
  const D_Z = -27;
  const hull = new THREE.Mesh(mergeGeometries([
    box(0.4, 6.4, 90, EDGE - 0.2, SEA_Y / 2 - 0.2, D_Z, 0x737a82),
    box(0.42, 0.25, 90, EDGE - 0.2, -0.13, D_Z, 0x2e3236),
    box(0.12, 0.02, 90, EDGE - 0.35, 0.012, D_Z, 0xffd400),
  ]), vcMat);
  hull.receiveShadow = true;
  scene.add(hull);
  for (let i = -8; i <= 8; i++) {
    if (Math.abs(i) <= 1) continue; // gap in the railing at the davit
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f95 }));
    post.position.set(EDGE - 0.35, 0.5, D_Z + i * 1.6); scene.add(post);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f95 });
  for (const [z0, z1] of [[D_Z - 12.8, D_Z - 3.2], [D_Z + 3.2, D_Z + 12.8]]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, z1 - z0, 8).rotateX(Math.PI / 2), railMat);
    rail.position.set(EDGE - 0.35, 1.0, (z0 + z1) / 2); scene.add(rail);
  }
  const DAVIT_TIP = V(EDGE + 1.9, 3.3, D_Z);
  const davit = new THREE.Mesh(mergeGeometries([
    box(0.28, 3.4, 0.28, EDGE - 0.7, 1.7, D_Z, 0x9aa0a6),
    box(2.9, 0.24, 0.24, EDGE + 0.6, 3.3, D_Z, 0x9aa0a6),
    box(0.2, 0.3, 0.2, DAVIT_TIP.x, 3.15, D_Z, 0x55595e),
  ]), vcMat);
  davit.castShadow = true;
  scene.add(davit);

  // Sea: faceted, slowly rolling as the reader scrolls.
  const seaGeo = new THREE.PlaneGeometry(220, 260, 110, 130);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(EDGE + 110, SEA_Y, D_Z);
  const seaBase = seaGeo.attributes.position.array.slice();
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x174a66, roughness: 0.4, metalness: 0.1, flatShading: true }));
  sea.receiveShadow = true;
  scene.add(sea);
  const wave = (x, z, t) => 0.14 * Math.sin(0.33 * x + t) + 0.09 * Math.sin(0.47 * z - 1.3 * t) + 0.05 * Math.sin(0.9 * (x + z) + 2 * t);
  function updateSea(t) {
    const a = seaGeo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) a[i + 1] = seaBase[i + 1] + wave(seaBase[i], seaBase[i + 2], t);
    seaGeo.attributes.position.needsUpdate = true;
    seaGeo.computeVertexNormals();
  }

  // RIB (long axis along z, bow toward -z): grey tubes, dark hull, console, outboard, lifting frame.
  const rib = new THREE.Group();
  const ribParts = [
    colorize(new THREE.CapsuleGeometry(0.3, 5.0, 4, 14).rotateX(Math.PI / 2).translate(-1.0, 0.42, 0.1), 0x59606a),
    colorize(new THREE.CapsuleGeometry(0.3, 5.0, 4, 14).rotateX(Math.PI / 2).translate(1.0, 0.42, 0.1), 0x59606a),
    colorize(new THREE.CapsuleGeometry(0.3, 1.6, 4, 14).rotateZ(Math.PI / 2).translate(0, 0.42, -2.75), 0x59606a),
    colorize(new THREE.BoxGeometry(1.7, 0.35, 5.4).translate(0, 0.12, 0.15), 0x1f2326),
    box(1.6, 0.04, 5.0, 0, 0.3, 0.2, 0x2c3034),
    box(0.7, 0.9, 0.55, 0, 0.75, 0.4, 0x6c7278),
    box(0.65, 0.04, 0.4, 0, 1.22, 0.25, 0x0d0d0d),
    box(0.45, 0.8, 0.4, 0, 0.5, 2.95, 0x1a1a1a),
    box(0.08, 1.7, 0.08, -0.75, 1.15, 0.9, 0x8a8f95), box(0.08, 1.7, 0.08, 0.75, 1.15, 0.9, 0x8a8f95),
    box(1.58, 0.08, 0.08, 0, 2.0, 0.9, 0x8a8f95),
  ];
  const ribHull = new THREE.Mesh(mergeGeometries(ribParts), vcMat);
  ribHull.castShadow = true; ribHull.receiveShadow = true;
  rib.add(ribHull);
  // 3 crew: coxswain at the console, two seated on the tubes facing inboard.
  const helmsman = new THREE.Mesh(helmsmanGeo(), vcMat);
  helmsman.position.set(0, 0.3, 1.0); helmsman.rotation.y = Math.PI; helmsman.castShadow = true;
  rib.add(helmsman);
  const seatedGeo = seatedCrewGeo();
  for (const [x, z, ry] of [[-1.0, -1.3, Math.PI / 2], [1.0, 2.0, -Math.PI / 2]]) {
    const m = new THREE.Mesh(seatedGeo, vcMat);
    m.position.set(x, 0.22, z); m.rotation.y = ry; m.castShadow = true;
    rib.add(m);
  }
  const RIB_SLOT = V(0.55, 0.3, -0.5);
  const RIB_HANG = V(DAVIT_TIP.x, 0.0, D_Z);
  const RIB_WATER_Y = SEA_Y + 0.05;
  scene.add(rib);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  scene.add(cable);

  // Ship's deck crew deploying the RIB: davit operator, safety observer, two line handlers
  // holding the bow and stern lines until the boat is waterborne.
  const deckGeo = helmsmanGeo();
  const deckCrew = [
    { pos: V(EDGE - 1.6, 0, D_Z + 1.0), rot: Math.PI / 2 },        // davit operator, hands on the controls
    { pos: V(EDGE - 3.0, 0, D_Z + 2.4), rot: Math.PI / 2 - 0.4 },  // safety observer
    { pos: V(EDGE - 0.9, 0, D_Z - 3.4), rot: Math.PI / 2 + 0.35, line: V(0, 0.55, -2.9) }, // bow line
    { pos: V(EDGE - 0.9, 0, D_Z + 3.4), rot: Math.PI / 2 - 0.35, line: V(0, 0.55, 2.9) },  // stern line
  ];
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
  for (const c of deckCrew) {
    const m = new THREE.Mesh(deckGeo, vcMat);
    m.position.copy(c.pos); m.rotation.y = c.rot; m.castShadow = true;
    scene.add(m);
    if (c.line) {
      m.updateMatrixWorld(true);
      c.hand = m.localToWorld(V(0, 1.2, 0.5));
      c.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), lineMat);
      scene.add(c.mesh);
    }
  }
  const davitControl = new THREE.Mesh(mergeGeometries([box(0.35, 1.0, 0.3, 0, 0.5, 0, 0x55595e), box(0.05, 0.25, 0.05, 0, 1.12, 0.05, 0xd11f27)]), vcMat);
  davitControl.position.set(EDGE - 1.05, 0, D_Z + 1.0); davitControl.castShadow = true;
  scene.add(davitControl);
  const yAxis = V(0, 1, 0), tmpA = V(), tmpB = V();
  function stretch(mesh, a, b) {
    const len = a.distanceTo(b);
    mesh.scale.set(1, len, 1);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(yAxis, tmpA.copy(b).sub(a).normalize());
  }

  const MOB = V(EDGE + 15, SEA_Y, D_Z - 13);
  const mob = new THREE.Group();
  mob.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12).translate(0, 0.36, 0), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.3 })));
  mob.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12).translate(0, 0.05, 0), new THREE.MeshStandardMaterial({ color: 0xf07c00, roughness: 0.4 })));
  mob.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 10, 28).rotateX(Math.PI / 2).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4 })));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.095, 10, 6, Math.PI / 6).rotateX(Math.PI / 2).rotateY(i * Math.PI / 2).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    mob.add(s);
  }
  scene.add(mob);

  // ---------- yellow outlines ----------
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  function outline(xa, xb, za, zb, w = 0.12) {
    for (const [cx, cz, sx, sz] of [[(xa + xb) / 2, za, xb - xa + w, w], [(xa + xb) / 2, zb, xb - xa + w, w], [xa, (za + zb) / 2, w, zb - za], [xb, (za + zb) / 2, w, zb - za]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), yellow);
      m.position.set(cx, 0.011, cz);
      scene.add(m);
    }
  }
  outline(-14.6, 14.6, -5.4, 10.9);
  outline(B.x - 2.1, B.x + 1.4, B.z - 0.9, B.z + 1.5, 0.06);
  outline(C.x - 3.4, C.x + 3.9, C.z - 4.0, C.z + 5.4, 0.08);

  // ---------- leader rig (blue, white firefighter helmet) ----------
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f6fe5, roughness: 0.28, metalness: 0.05 });
  const mk = (geo, parent, mat = blue) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const leader = new THREE.Group();
  const pelvis = new THREE.Group(); leader.add(pelvis);
  mk(new THREE.CapsuleGeometry(0.19, 0.36, 4, 16).scale(1, 1, 0.72).translate(0, 0.24, 0), pelvis);
  mk(new THREE.CapsuleGeometry(0.06, 0.1, 3, 10).translate(0, 0.59, 0), pelvis);
  mk(new THREE.SphereGeometry(0.18, 20, 14).translate(0, 0.82, 0), pelvis);
  const lHelmet = mk(mergeGeometries(helmetParts(0xf4f4f4, 0x1f6fe5, 0)), pelvis, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.05 }));
  lHelmet.position.y = 0.87;
  const vest = mk(new THREE.CapsuleGeometry(0.225, 0.3, 4, 14).scale(1, 1, 0.8).translate(0, 0.29, 0), pelvis, new THREE.MeshStandardMaterial({ color: 0xf07c00, roughness: 0.4 }));
  const joints = {};
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'P' : 'N';
    const hip = new THREE.Group(); hip.position.set(0.11 * s, 0, 0); pelvis.add(hip);
    mk(new THREE.CapsuleGeometry(0.095, 0.26, 3, 10).translate(0, -0.21, 0), hip);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    mk(new THREE.CapsuleGeometry(0.09, 0.28, 3, 10).translate(0, -0.21, 0), knee);
    const sh = new THREE.Group(); sh.position.set(0.25 * s, 0.48, 0); pelvis.add(sh);
    mk(new THREE.CapsuleGeometry(0.068, 0.17, 3, 10).translate(0, -0.15, 0), sh);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    mk(new THREE.CapsuleGeometry(0.064, 0.18, 3, 10).translate(0, -0.15, 0), el);
    joints['hip' + k] = hip; joints['knee' + k] = knee; joints['sh' + k] = sh; joints['el' + k] = el;
  }
  scene.add(leader);

  const STAND = { y: 0.88, hipP: 0, hipN: 0, kneeP: 0, kneeN: 0, shPx: 0, shPz: 0.8, elPx: 0, elPz: -1.75, shNx: 0, shNz: -0.8, elNx: 0, elNz: 1.75 };
  const NEUTRAL = { ...STAND, shPz: 0.1, elPz: 0, shNz: -0.1, elNz: 0 };
  const SIT = { y: 0.5, hipP: -1.5708, hipN: -1.5708, kneeP: 1.5708, kneeN: 1.5708, shPx: -0.95, shPz: 0.08, elPx: -0.75, elPz: 0, shNx: -0.95, shNz: -0.08, elNx: -0.75, elNz: 0 };
  const POINT = { ...NEUTRAL, shPx: -0.25, shPz: 1.45, elPx: 0, elPz: 0, shNz: -0.12, elNx: -0.2 };
  const CROUCH = { ...NEUTRAL, y: 0.72, hipP: -0.8, hipN: -0.8, kneeP: 1.3, kneeN: 1.3, shPx: -0.6, shNx: -0.6 };
  const AIR = { ...NEUTRAL, y: 0.86, hipP: -0.5, hipN: -0.2, kneeP: 0.9, kneeN: 0.5, shPx: -1.2, shPz: 0.3, shNx: -1.2, shNz: -0.3 };
  const BRACE = { ...NEUTRAL, y: 0.84, hipP: -0.15, hipN: 0.1, kneeP: 0.25, kneeN: 0.1, shPx: -0.5, shPz: 0.35, elPx: -0.6, shNx: 0, shNz: -0.15 };
  const walk = (ph) => {
    const s = Math.sin(ph);
    return { y: 0.88 + 0.03 * Math.abs(Math.cos(ph)), hipP: 0.45 * s, hipN: -0.45 * s, kneeP: 0.55 * Math.max(0, s), kneeN: 0.55 * Math.max(0, -s),
      shPx: -0.35 * s, shPz: 0.12, elPx: -0.3, elPz: 0, shNx: 0.35 * s, shNz: -0.12, elNx: -0.3, elNz: 0 };
  };
  const mixPose = (a, b, t) => { const o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
  function applyPose(p) {
    pelvis.position.y = p.y;
    joints.hipP.rotation.x = p.hipP; joints.hipN.rotation.x = p.hipN;
    joints.kneeP.rotation.x = p.kneeP; joints.kneeN.rotation.x = p.kneeN;
    joints.shP.rotation.set(p.shPx, 0, p.shPz); joints.shN.rotation.set(p.shNx, 0, p.shNz);
    joints.elP.rotation.set(p.elPx, 0, p.elPz); joints.elN.rotation.set(p.elNx, 0, p.elNz);
  }

  // ---------- paths ----------
  const A_POS = V(0, 0, -4);
  const C_POS = V(C.x - 0.5, 0, C.z - 2.6);
  const EDGE_POS = V(EDGE - 0.9, 0, D_Z - 0.5);
  const mkPath = (pts) => {
    const segs = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push({ a: pts[i - 1], b: pts[i], l, s0: L }); L += l; }
    return { segs, L };
  };
  const at = (path, s) => {
    s = Math.min(Math.max(s, 0), path.L);
    const seg = path.segs.find((g) => s <= g.s0 + g.l) || path.segs[path.segs.length - 1];
    const t = seg.l ? (s - seg.s0) / seg.l : 0;
    const dir = seg.b.clone().sub(seg.a);
    return { pos: seg.a.clone().lerp(seg.b, t), rot: Math.atan2(dir.x, dir.z) };
  };
  const pathAB = mkPath([A_POS, V(10, 0, -4.8), V(26, 0, -4.4), CHAIR]);
  const pathBC = mkPath([CHAIR, V(27.2, 0, -4.4), V(26.2, 0, -8), V(26.2, 0, C_POS.z), C_POS]);
  const pathCD = mkPath([C_POS, V(35, 0, C_POS.z), V(44, 0, D_Z - 1.5), EDGE_POS]);
  const STRIDE = 0.72;

  // ---------- camera stations ----------
  const camA0 = { t: V(0, 0.9, 5.2), dir: V(0.12, 0.42, 0.9).normalize(), dist: 21, need: 12 };
  const camA = { t: V(0, 0, 11.5), dir: V(0.12, 0.8, 0.59).normalize(), dist: 58, need: 34 };
  const camB = { t: V(B.x + 0.1, 1.15, B.z - 0.2), dir: V(0.42, 0.42, 0.8).normalize(), dist: 7.2, need: 4.6 };
  const camC = { t: V(C.x + 0.2, 0.9, C.z), dir: V(0.48, 0.6, 0.64).normalize(), dist: 17, need: 11 };
  const camD1 = { t: V(EDGE + 1.2, -2.0, D_Z), dir: V(0.75, 0.42, 0.54).normalize(), dist: 18, need: 9 };
  const camD2 = { t: V(EDGE + 9, SEA_Y + 0.5, D_Z - 7.5), dir: V(0.3, 0.62, 0.73).normalize(), dist: 30, need: 20 };

  // ---------- timeline (p = scroll progress 0..1) ----------
  const ease = (t) => { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); };
  const span = (p, a, b) => Math.min(Math.max((p - a) / (b - a), 0), 1);
  const K = {
    zoom: [0.06, 0.15], walk1: [0.2, 0.32], sit: [0.32, 0.35], up: [0.42, 0.44], walk2: [0.44, 0.56], point: [0.56, 0.6],
    walk3: [0.66, 0.74], hop: [0.74, 0.78], lower: [0.79, 0.86], drive: [0.86, 0.97],
  };
  const lerpAngle = (a, b, t) => { const dd = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + dd * t; };

  const endAB = at(pathAB, pathAB.L), endBC = at(pathBC, pathBC.L), endCD = at(pathCD, pathCD.L);
  const phEnd1 = pathAB.L / STRIDE * Math.PI, phEnd2 = pathBC.L / STRIDE * Math.PI, phEnd3 = pathCD.L / STRIDE * Math.PI;

  // RIB state: hangs at deck level, lowered to the sea, then drives to the person overboard.
  const DRIVE_END = MOB.clone().add(V(-4.6, 0, 5.6));
  const driveDir = DRIVE_END.clone().sub(RIB_HANG).setY(0);
  const DRIVE_HEADING = Math.atan2(-driveDir.x, -driveDir.z);
  function ribState(p, seaT) {
    const lower = ease(span(p, ...K.lower));
    const drive = span(p, ...K.drive);
    const pos = RIB_HANG.clone();
    pos.y = RIB_HANG.y + (RIB_WATER_Y - RIB_HANG.y) * lower;
    let heading = 0;
    if (drive > 0) {
      const e = ease(drive);
      pos.x = RIB_HANG.x + (DRIVE_END.x - RIB_HANG.x) * e;
      pos.z = RIB_HANG.z + (DRIVE_END.z - RIB_HANG.z) * e;
      heading = lerpAngle(0, DRIVE_HEADING, ease(drive / 0.35));
    }
    const inWater = lower >= 1;
    if (inWater) pos.y += wave(pos.x, pos.z, seaT) * 0.8;
    return { pos, heading, roll: inWater ? 0.05 * Math.sin(seaT * 1.3) : 0, pitch: inWater ? 0.03 * Math.sin(seaT * 0.9 + 1) : 0, lower };
  }

  function leaderState(p, R) {
    if (p < K.walk1[0]) return { pos: A_POS, rot: 0, pose: STAND, vest: false };
    if (p < K.walk1[1]) {
      const s = span(p, ...K.walk1) * pathAB.L, q = at(pathAB, s);
      return { pos: q.pos, rot: lerpAngle(0, q.rot, Math.min(s / 0.6, 1)), pose: mixPose(STAND, walk(s / STRIDE * Math.PI), Math.min(s / 0.8, 1)) };
    }
    if (p < K.sit[1]) {
      const t = ease(span(p, ...K.sit));
      return { pos: CHAIR, rot: lerpAngle(endAB.rot, Math.PI, t), pose: mixPose(walk(phEnd1), SIT, t) };
    }
    if (p < K.up[0]) return { pos: CHAIR, rot: Math.PI, pose: SIT };
    if (p < K.up[1]) return { pos: CHAIR, rot: Math.PI, pose: mixPose(SIT, NEUTRAL, ease(span(p, ...K.up))) };
    if (p < K.walk2[1]) {
      const s = span(p, ...K.walk2) * pathBC.L, q = at(pathBC, s);
      return { pos: q.pos, rot: lerpAngle(Math.PI, q.rot, Math.min(s / 0.6, 1)), pose: mixPose(NEUTRAL, walk(s / STRIDE * Math.PI), Math.min(s / 0.8, 1)) };
    }
    if (p < K.walk3[0]) {
      const t = ease(span(p, ...K.point));
      return { pos: C_POS, rot: lerpAngle(endBC.rot, 0, t), pose: mixPose(walk(phEnd2), POINT, t) };
    }
    if (p < K.walk3[1]) {
      const s = span(p, ...K.walk3) * pathCD.L, q = at(pathCD, s);
      return { pos: q.pos, rot: lerpAngle(0, q.rot, Math.min(s / 0.6, 1)), pose: mixPose(POINT, walk(s / STRIDE * Math.PI), Math.min(s / 0.8, 1)), vest: s > pathCD.L * 0.5 };
    }
    // in the boat: slot follows the RIB
    rib.updateMatrixWorld(true);
    const slot = rib.localToWorld(RIB_SLOT.clone());
    const boatRot = R.heading + Math.PI;
    if (p < K.hop[1]) {
      const t = span(p, ...K.hop);
      const pos = EDGE_POS.clone().lerp(slot, ease(t));
      pos.y += Math.sin(Math.PI * t) * 1.1 + (slot.y - EDGE_POS.y) * 0;
      const pose = t < 0.25 ? mixPose(walk(phEnd3), CROUCH, t / 0.25) : t < 0.8 ? mixPose(CROUCH, AIR, Math.min((t - 0.25) / 0.3, 1)) : mixPose(AIR, BRACE, (t - 0.8) / 0.2);
      return { pos, rot: lerpAngle(endCD.rot, boatRot, ease(t)), pose, vest: true };
    }
    return { pos: slot, rot: boatRot, pose: BRACE, vest: true };
  }

  function camFor(p, lpos) {
    const blend = (a, b, t, follow) => {
      const tt = a.t.clone().lerp(b.t, t);
      if (follow) tt.lerp(lpos.clone().setY(Math.max(lpos.y, 0) + 0.8), 0.45 * Math.sin(Math.PI * t));
      return { t: tt, dir: a.dir.clone().lerp(b.dir, t).normalize(), dist: a.dist + (b.dist - a.dist) * t, need: a.need + (b.need - a.need) * t };
    };
    if (p < K.zoom[0]) return camA0;
    if (p < K.zoom[1]) return blend(camA0, camA, ease(span(p, ...K.zoom)), false);
    if (p < K.walk1[0]) return camA;
    if (p < K.sit[0]) return blend(camA, camB, ease(span(p, K.walk1[0], K.sit[0])), true);
    if (p < K.walk2[0]) return camB;
    if (p < K.point[0]) return blend(camB, camC, ease(span(p, K.walk2[0], K.point[0])), true);
    if (p < K.walk3[0]) return camC;
    if (p < K.walk3[1]) return blend(camC, camD1, ease(span(p, ...K.walk3)), true);
    if (p < K.lower[1] - 0.02) return camD1;
    return blend(camD1, camD2, ease(span(p, K.lower[1] - 0.02, K.drive[1])), false);
  }

  // ---------- callouts ----------
  const callouts = {
    ff: { anchor: V(-3.8, 1.8, 4.0), range: [0, 0.07] },
    surge: { anchor: V(8, 1.8, 19), range: [0.14, 0.21] },
    audit: { anchor: V(B.x - 0.05, 0.95, B.z + 0.05), range: [0.35, 0.43] },
    train: { anchor: V(C.x + 1.2, 2.2, C.z - 3.25), range: [0.59, 0.67] },
    sar: { anchor: null, range: [0.8, 1.01] },
    mob: { anchor: V(MOB.x, SEA_Y + 0.6, MOB.z), range: [0.9, 1.01] },
  };
  for (const k in callouts) {
    callouts[k].el = stage.querySelector(`.callout[data-key="${k}"]`);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = '<path class="a"/><path class="h"/>';
    arrowsSvg.appendChild(g);
    callouts[k].g = g;
  }
  const ribAnchor = V();
  function drawCallouts(p, introDone) {
    const W = stage.clientWidth, H = stage.clientHeight, sr = stage.getBoundingClientRect();
    rib.updateMatrixWorld(true);
    ribAnchor.copy(rib.localToWorld(V(0, 1.4, -1.5)));
    for (const k in callouts) {
      const c = callouts[k];
      if (!c.el) continue;
      const on = introDone && p >= c.range[0] && p < c.range[1];
      c.el.classList.toggle('on', on);
      c.g.style.opacity = on ? 1 : 0;
      if (!on) continue;
      const pr = (c.anchor || ribAnchor).clone().project(camera);
      const tx = (pr.x + 1) / 2 * W, ty = (1 - pr.y) / 2 * H;
      const lr = c.el.getBoundingClientRect();
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || !lr.width) { c.g.style.opacity = 0; continue; }
      const lx = lr.left - sr.left, ly = lr.top - sr.top;
      const below = ty > ly + lr.height;
      const sx = lx + lr.width * (k === 'surge' || k === 'mob' ? 0.3 : 0.4), sy = below ? ly + lr.height + 10 : ly - 10;
      const len = Math.hypot(tx - sx, ty - sy) || 1;
      const hx = tx - (tx - sx) / len * 18, hy = ty - (ty - sy) / len * 18;
      const cx = sx, cy = hy;
      c.g.querySelector('.a').setAttribute('d', `M${sx},${sy} Q${cx},${cy} ${hx},${hy}`);
      const ang = Math.atan2(hy - cy, hx - cx), L = 13;
      c.g.querySelector('.h').setAttribute('d', `M${hx - L * Math.cos(ang - 0.5)},${hy - L * Math.sin(ang - 0.5)} L${hx},${hy} L${hx - L * Math.cos(ang + 0.5)},${hy - L * Math.sin(ang + 0.5)}`);
    }
  }

  // ---------- frame ----------
  let progress = 0, introT = reduce ? 99 : 0;
  function progressFromScroll() {
    const r = story.getBoundingClientRect();
    const total = story.offsetHeight - stage.offsetHeight;
    return total > 0 ? Math.min(Math.max((58 - r.top) / total, 0), 1) : 0;
  }

  function frame() {
    const p = progress;
    const seaT = p * 40;

    crewPos.forEach((c, i) => {
      const s = c.surge ? ease((p - K.zoom[0] - c.row * 0.0075) / 0.025) : ease((introT - 0.2 - c.delay) / 0.45);
      d.position.set(c.x, 0, c.z); d.rotation.set(0, Math.PI, 0); d.scale.setScalar(Math.max(s, 0.0001)); d.updateMatrix();
      crew.setMatrixAt(i, d.matrix);
    });
    crew.instanceMatrix.needsUpdate = true;

    if (p > K.walk3[0] - 0.02) updateSea(seaT);
    const R = ribState(p, seaT);
    rib.position.copy(R.pos); rib.rotation.set(R.pitch, R.heading, R.roll);
    const hookY = R.pos.y + 2.05;
    cable.visible = R.lower < 1;
    cable.scale.y = Math.max(DAVIT_TIP.y - hookY, 0.01);
    cable.position.set(DAVIT_TIP.x, (DAVIT_TIP.y + hookY) / 2, D_Z + 0.9);
    // handling lines stay attached until the RIB gets under way
    rib.updateMatrixWorld(true);
    const linesOn = p < K.drive[0] + 0.01;
    for (const c of deckCrew) {
      if (!c.mesh) continue;
      c.mesh.visible = linesOn;
      if (linesOn) stretch(c.mesh, c.hand, rib.localToWorld(tmpB.copy(c.line)));
    }
    mob.position.set(MOB.x, SEA_Y + wave(MOB.x, MOB.z, seaT) * 0.9, MOB.z);

    const L = leaderState(p, R);
    leader.position.copy(L.pos); leader.rotation.y = L.rot; applyPose(L.pose);
    vest.visible = !!L.vest;

    const cs = camFor(p, L.pos);
    const vfov = camera.aspect < 1 ? 46 : 30;
    camera.fov = vfov;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * camera.aspect);
    const dist = Math.max(cs.dist, cs.need / 2 / Math.tan(hfov / 2) * 1.1);
    camera.position.copy(cs.t).addScaledVector(cs.dir, dist);
    camera.lookAt(cs.t);
    camera.updateProjectionMatrix();
    scene.fog.near = dist * 0.9; scene.fog.far = dist * 2.4;

    const sh = Math.min(Math.max(dist * 0.55, 5), 32);
    sun.target.position.copy(cs.t);
    sun.position.copy(cs.t).add(V(-0.45, 1, 0.55).multiplyScalar(Math.max(dist * 0.6, 12)));
    Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 0.5, far: Math.max(dist * 2, 40) });
    sun.shadow.camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    drawCallouts(p, introT > 2.0);
    const ch = p < K.walk1[1] ? 0 : p < K.walk2[1] ? 1 : p < K.walk3[0] + 0.03 ? 2 : 3;
    chapterEls.forEach((el, i) => el.classList.toggle('on', i === ch));
    hint.classList.toggle('off', p > 0.02);
  }

  function resize() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    frame();
  }

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const p = progressFromScroll();
      if (p !== progress) { progress = p; frame(); }
    });
  };

  updateSea(0);
  progress = progressFromScroll();
  resize();
  new ResizeObserver(resize).observe(stage);
  addEventListener('scroll', onScroll, { passive: true });

  if (!reduce) {
    const t0 = performance.now();
    (function intro(now) {
      introT = (now - t0) / 1000;
      frame();
      if (introT < 2.2) requestAnimationFrame(intro);
    })(t0);
  }
}
