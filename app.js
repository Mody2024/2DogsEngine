/* ============================================================
   FORGE3D ENGINE — engine.js
   Full 3D scene editor built on Three.js r128
   ============================================================ */

'use strict';

// ─── STATE ────────────────────────────────────────────────────
const State = {
  objects: [],          // all scene objects (metadata)
  selected: null,       // selected object (Three.js Object3D)
  tool: 'select',       // select | move | rotate | scale
  playing: false,
  wireframe: false,
  showGrid: true,
  showSky: true,
  shading: 'solid',
  viewMode: 'perspective',
  nextId: 1,
  camera: null,
  orbitActive: false,
  mouseDown: false,
  lastMouse: { x: 0, y: 0 },
  orbitTarget: new THREE.Vector3(0, 0, 0),
  orbitRadius: 12,
  orbitTheta: 0.4,
  orbitPhi: 1.1,
  playStateSnapshot: null,
  frameCount: 0,
  lastFPSTime: performance.now(),
  fps: 60,
  dragAxis: null,
  dragStartPos: null,
  dragStartMouse: null,
  raycaster: new THREE.Raycaster(),
  clock: new THREE.Clock(),
};

// ─── THREE.JS SETUP ────────────────────────────────────────────
let renderer, scene, camera, gizmoRenderer, gizmoScene, gizmoCamera;
let gridHelper, axesHelper, ambientLight, directionalLight;
let transformHelper = null;
let selectionBox = null;
let skyMesh = null;

function initEngine() {
  const canvas = document.getElementById('viewport-canvas');

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111520);

  // Camera
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  updateCameraOrbit();

  // Default lights
  ambientLight = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(8, 15, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 80;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  scene.add(directionalLight);

  // Grid
  gridHelper = new THREE.GridHelper(30, 30, 0x1f2535, 0x1f2535);
  gridHelper.material.opacity = 0.6;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Axes
  axesHelper = new THREE.AxesHelper(2);
  axesHelper.position.y = 0.002;
  scene.add(axesHelper);

  // Skybox
  createSky();

  // Gizmo renderer (XYZ orientation ball)
  initGizmo();

  // Resize
  resizeViewport();
  window.addEventListener('resize', resizeViewport);

  // Events
  setupViewportEvents();
  setupUIEvents();

  // Default objects
  addDefaultScene();

  // Start loop
  animate();

  engineLog('FORGE3D engine initialized', 'success');
  engineLog('Three.js r128 | WebGL renderer ready', 'info');
}

function createSky() {
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x0a1025) },
      bottomColor: { value: new THREE.Color(0x1a0a2e) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);
}

function initGizmo() {
  const gc = document.getElementById('gizmo-canvas');
  gizmoRenderer = new THREE.WebGLRenderer({ canvas: gc, alpha: true, antialias: true });
  gizmoRenderer.setSize(80, 80);
  gizmoScene = new THREE.Scene();
  gizmoCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  gizmoCamera.position.set(0, 0, 3);

  const gl = new THREE.AmbientLight(0xffffff, 1.2);
  gizmoScene.add(gl);

  const arrows = [
    { dir: [1,0,0], color: 0xff4455, label: 'X' },
    { dir: [0,1,0], color: 0x44ff88, label: 'Y' },
    { dir: [0,0,1], color: 0x4488ff, label: 'Z' },
  ];
  arrows.forEach(a => {
    const mat = new THREE.MeshBasicMaterial({ color: a.color });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), mat);
    const head  = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), mat);
    const group = new THREE.Group();
    shaft.position.set(0, 0.35, 0);
    head.position.set(0, 0.775, 0);
    group.add(shaft); group.add(head);
    // Orient
    if (a.dir[0]) group.rotation.z = -Math.PI/2;
    else if (a.dir[2]) group.rotation.x = Math.PI/2;
    gizmoScene.add(group);
  });

  // Center sphere
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x888888 })
  );
  gizmoScene.add(center);
}

function addDefaultScene() {
  // Ground plane
  addObject('plane', { name: 'Ground', position: [0,0,0], scale: [10,1,10], color: 0x22293a });
  // Center box
  addObject('box', { name: 'Box', position: [0,0.5,0], color: 0x00c8ff });
  // Sphere
  addObject('sphere', { name: 'Sphere', position: [2.5,0.7,0], color: 0xff4466 });
  // Cylinder
  addObject('cylinder', { name: 'Cylinder', position: [-2.5,0.8,0], color: 0x44ff99 });
}

// ─── OBJECT CREATION ──────────────────────────────────────────
function addObject(type, opts = {}) {
  const id = State.nextId++;
  const name = opts.name || `${capitalize(type)}_${id}`;
  const pos = opts.position || [0, 0, 0];
  const rot = opts.rotation || [0, 0, 0];
  const scale = opts.scale || [1, 1, 1];
  const color = opts.color !== undefined ? opts.color : randomColor();

  let mesh = null;
  const meta = { id, name, type, visible: true, color };

  if (type === 'empty') {
    mesh = new THREE.Object3D();
    mesh.userData = { id, name, type, meta };
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    scene.add(mesh);
    State.objects.push(meta);
    renderTree();
    engineLog(`Added Empty: ${name}`, 'info');
    return mesh;
  }

  if (type.startsWith('light-')) {
    return addLight(type, opts);
  }

  if (type === 'camera') {
    return addCameraObject(opts);
  }

  let geo;
  switch (type) {
    case 'box':      geo = new THREE.BoxGeometry(1,1,1); break;
    case 'sphere':   geo = new THREE.SphereGeometry(0.5, 32, 24); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(0.4, 0.4, 1, 32); break;
    case 'cone':     geo = new THREE.ConeGeometry(0.5, 1, 32); break;
    case 'torus':    geo = new THREE.TorusGeometry(0.5, 0.18, 16, 100); break;
    case 'plane':    geo = new THREE.PlaneGeometry(1, 1); break;
    default:         geo = new THREE.BoxGeometry(1,1,1);
  }

  const mat = new THREE.MeshStandardMaterial({
    color, metalness: 0.1, roughness: 0.6,
  });

  mesh = new THREE.Mesh(geo, mat);
  if (type === 'plane') mesh.rotation.x = -Math.PI/2;

  mesh.position.set(...pos);
  if (type !== 'plane') mesh.rotation.set(...rot);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { id, name, type, meta };

  scene.add(mesh);
  State.objects.push(meta);
  meta.mesh = mesh;

  renderTree();
  updateObjCounter();
  engineLog(`Added ${capitalize(type)}: ${name}`, 'info');
  return mesh;
}

function addLight(type, opts = {}) {
  const id = State.nextId++;
  const name = opts.name || `Light_${id}`;
  const pos = opts.position || [3, 5, 3];

  let light;
  if (type === 'light-point') {
    light = new THREE.PointLight(0xffffff, 1.0, 20);
    light.castShadow = true;
  } else {
    light = new THREE.DirectionalLight(0xffffff, 1.0);
  }

  light.position.set(...pos);
  scene.add(light);

  // Visual helper
  const helper = type === 'light-point'
    ? new THREE.PointLightHelper(light, 0.25)
    : new THREE.DirectionalLightHelper(light, 1);
  scene.add(helper);
  light.userData.helper = helper;

  const meta = { id, name, type, visible: true, light, helper, color: 0xffffff };
  light.userData = { id, name, type, meta };
  State.objects.push(meta);

  renderTree();
  updateObjCounter();
  engineLog(`Added ${type === 'light-point' ? 'Point Light' : 'Directional Light'}: ${name}`, 'info');
  return light;
}

function addCameraObject(opts = {}) {
  const id = State.nextId++;
  const name = opts.name || `Camera_${id}`;
  const pos = opts.position || [4, 3, 4];

  const camObj = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camObj.position.set(...pos);
  camObj.lookAt(0, 0, 0);
  scene.add(camObj);

  const helper = new THREE.CameraHelper(camObj);
  scene.add(helper);
  camObj.userData.helper = helper;

  const meta = { id, name, type: 'camera', visible: true, camera: camObj, helper };
  camObj.userData = { id, name, type: 'camera', meta };
  State.objects.push(meta);

  renderTree();
  updateObjCounter();
  engineLog(`Added Camera: ${name}`, 'info');
  return camObj;
}

function removeSelected() {
  if (!State.selected) return;
  const obj = State.selected;
  const meta = obj.userData.meta;
  if (!meta) return;

  scene.remove(obj);
  if (obj.userData.helper) scene.remove(obj.userData.helper);
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) obj.material.dispose();

  clearSelectionBox();

  State.objects = State.objects.filter(m => m.id !== meta.id);
  State.selected = null;

  renderTree();
  renderInspector();
  updateObjCounter();
  engineLog(`Removed: ${meta.name}`, 'warn');
}

// ─── SELECTION ─────────────────────────────────────────────────
function selectObject(obj) {
  clearSelectionBox();
  State.selected = obj;

  if (obj && obj.isMesh) {
    const box = new THREE.BoxHelper(obj, 0x00e5ff);
    box.userData.isHelper = true;
    scene.add(box);
    selectionBox = box;
  }

  renderTree();
  renderInspector();
}

function clearSelectionBox() {
  if (selectionBox) {
    scene.remove(selectionBox);
    selectionBox = null;
  }
}

function pickObject(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  State.raycaster.setFromCamera({ x, y }, camera);
  const meshes = [];
  scene.traverse(obj => {
    if (obj.isMesh && !obj.userData.isHelper && obj !== skyMesh && obj !== gridHelper) {
      meshes.push(obj);
    }
  });

  const hits = State.raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    selectObject(hits[0].object);
  } else {
    selectObject(null);
  }
}

// ─── TRANSFORM TOOLS ──────────────────────────────────────────
function startTransformDrag(axis, event) {
  if (!State.selected) return;
  State.dragAxis = axis;
  State.dragStartPos = State.selected.position.clone();
  State.dragStartMouse = { x: event.clientX, y: event.clientY };
}

// ─── CAMERA ORBIT ─────────────────────────────────────────────
function updateCameraOrbit() {
  const x = State.orbitRadius * Math.sin(State.orbitPhi) * Math.sin(State.orbitTheta);
  const y = State.orbitRadius * Math.cos(State.orbitPhi);
  const z = State.orbitRadius * Math.sin(State.orbitPhi) * Math.cos(State.orbitTheta);
  camera.position.set(
    State.orbitTarget.x + x,
    State.orbitTarget.y + y,
    State.orbitTarget.z + z
  );
  camera.lookAt(State.orbitTarget);
}

function setOrthoView(view) {
  State.viewMode = view;
  const d = State.orbitRadius;
  switch (view) {
    case 'top':
      camera.position.set(0, d, 0.001);
      camera.lookAt(0,0,0);
      break;
    case 'front':
      camera.position.set(0, 0, d);
      camera.lookAt(0,0,0);
      break;
    case 'right':
      camera.position.set(d, 0, 0);
      camera.lookAt(0,0,0);
      break;
    default:
      State.viewMode = 'perspective';
      updateCameraOrbit();
  }
}

// ─── VIEWPORT EVENTS ──────────────────────────────────────────
function setupViewportEvents() {
  const canvas = renderer.domElement;

  canvas.addEventListener('mousedown', e => {
    State.mouseDown = true;
    State.lastMouse = { x: e.clientX, y: e.clientY };

    if (e.button === 0 && State.tool === 'select') {
      pickObject(e);
    }
    if (e.button === 2) {
      State.orbitActive = true;
    }
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (!State.mouseDown) return;
    const dx = e.clientX - State.lastMouse.x;
    const dy = e.clientY - State.lastMouse.y;
    State.lastMouse = { x: e.clientX, y: e.clientY };

    // Right mouse = orbit
    if (e.buttons === 2 && State.viewMode === 'perspective') {
      State.orbitTheta -= dx * 0.007;
      State.orbitPhi = Math.max(0.05, Math.min(Math.PI - 0.05, State.orbitPhi + dy * 0.007));
      updateCameraOrbit();
    }

    // Middle mouse = pan
    if (e.buttons === 4) {
      const panSpeed = 0.005 * State.orbitRadius;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(right);
      right.crossVectors(camera.up, right).normalize().multiplyScalar(dx * panSpeed);
      up.copy(camera.up).normalize().multiplyScalar(-dy * panSpeed);
      State.orbitTarget.add(right).add(up);
      updateCameraOrbit();
    }

    // Left drag = move object (move tool)
    if (e.buttons === 1 && State.selected && State.tool === 'move') {
      const speed = 0.01 * (State.orbitRadius / 8);
      const right = new THREE.Vector3();
      camera.getWorldDirection(right);
      const camRight = new THREE.Vector3().crossVectors(camera.up, right).normalize();
      const camUp = new THREE.Vector3().copy(camera.up).normalize();

      State.selected.position.addScaledVector(camRight, -dx * speed);
      State.selected.position.addScaledVector(camUp, dy * speed);

      updateInspectorTransform();
      document.getElementById('transform-overlay').classList.remove('hidden');
      const p = State.selected.position;
      document.getElementById('transform-label').textContent =
        `T: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
    }

    // Left drag = rotate object (rotate tool)
    if (e.buttons === 1 && State.selected && State.tool === 'rotate') {
      State.selected.rotation.y += dx * 0.01;
      State.selected.rotation.x += dy * 0.01;
      updateInspectorTransform();
    }

    // Left drag = scale object (scale tool)
    if (e.buttons === 1 && State.selected && State.tool === 'scale') {
      const delta = 1 + (dx - dy) * 0.005;
      State.selected.scale.multiplyScalar(delta);
      updateInspectorTransform();
    }
  });

  canvas.addEventListener('mouseup', e => {
    State.mouseDown = false;
    State.orbitActive = false;
    document.getElementById('transform-overlay').classList.add('hidden');
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    State.orbitRadius = Math.max(1, Math.min(100, State.orbitRadius + e.deltaY * 0.02));
    if (State.viewMode === 'perspective') updateCameraOrbit();
    else setOrthoView(State.viewMode);
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key.toLowerCase()) {
      case 'q': setTool('select'); break;
      case 'w': setTool('move'); break;
      case 'e': setTool('rotate'); break;
      case 'r': setTool('scale'); break;
      case 'delete':
      case 'backspace':
        removeSelected(); break;
      case 'f':
        if (State.selected) focusCamera(); break;
      case 'g':
        if (State.selected) setTool('move'); break;
      case 'escape':
        selectObject(null); break;
    }
  });
}

function focusCamera() {
  if (!State.selected) return;
  const pos = State.selected.position;
  State.orbitTarget.copy(pos);
  State.orbitRadius = 5;
  updateCameraOrbit();
}

// ─── UI EVENTS ─────────────────────────────────────────────────
function setupUIEvents() {
  // Tool buttons
  document.getElementById('btn-select').onclick = () => setTool('select');
  document.getElementById('btn-move').onclick   = () => setTool('move');
  document.getElementById('btn-rotate').onclick = () => setTool('rotate');
  document.getElementById('btn-scale').onclick  = () => setTool('scale');

  // Play/pause/stop
  document.getElementById('btn-play').onclick  = startPlay;
  document.getElementById('btn-pause').onclick = pausePlay;
  document.getElementById('btn-stop').onclick  = stopPlay;

  // Screenshot
  document.getElementById('btn-screenshot').onclick = takeScreenshot;

  // Add object
  document.getElementById('btn-add-obj').onclick = () => {
    document.getElementById('modal-overlay').classList.remove('hidden');
  };
  document.getElementById('btn-del-obj').onclick = removeSelected;
  document.getElementById('modal-close').onclick = () => {
    document.getElementById('modal-overlay').classList.add('hidden');
  };

  // Primitive buttons
  document.querySelectorAll('.prim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      addObject(type, { position: [0, 0.5, 0] });
    });
  });

  // Viewport tabs
  document.querySelectorAll('.vp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setOrthoView(tab.dataset.view);
    });
  });

  // Toggles
  document.getElementById('toggle-grid').onchange = e => {
    gridHelper.visible = e.target.checked;
    axesHelper.visible = e.target.checked;
  };
  document.getElementById('toggle-wireframe').onchange = e => {
    State.wireframe = e.target.checked;
    scene.traverse(obj => {
      if (obj.isMesh && obj !== skyMesh && !obj.userData.isHelper) {
        if (obj.material) obj.material.wireframe = State.wireframe;
      }
    });
  };
  document.getElementById('toggle-skybox').onchange = e => {
    skyMesh.visible = e.target.checked;
    scene.background = e.target.checked ? null : new THREE.Color(0x111520);
  };
  document.getElementById('shading-mode').onchange = e => {
    State.shading = e.target.value;
    scene.traverse(obj => {
      if (obj.isMesh && obj !== skyMesh && !obj.userData.isHelper) {
        updateShadingMode(obj);
      }
    });
  };

  // Console clear
  document.getElementById('clear-console').onclick = () => {
    document.getElementById('console-log').innerHTML = '';
  };

  // Context menu
  document.addEventListener('click', () => {
    document.getElementById('context-menu')?.remove();
  });
}

function setTool(tool) {
  State.tool = tool;
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  const map = { select:'btn-select', move:'btn-move', rotate:'btn-rotate', scale:'btn-scale' };
  if (map[tool]) document.getElementById(map[tool]).classList.add('active');
  engineLog(`Tool: ${tool.toUpperCase()}`, 'info');
}

function updateShadingMode(obj) {
  if (!obj.material) return;
  if (State.shading === 'unlit') {
    obj.material.type !== 'MeshBasicMaterial' && (obj.userData._savedMat = obj.material);
    obj.material = new THREE.MeshBasicMaterial({ color: obj.material.color || 0x888888, wireframe: State.wireframe });
  } else {
    if (obj.userData._savedMat) {
      obj.material = obj.userData._savedMat;
      delete obj.userData._savedMat;
    }
    obj.material.wireframe = State.wireframe;
  }
}

// ─── PLAY MODE ────────────────────────────────────────────────
function startPlay() {
  if (State.playing) return;
  State.playing = true;
  State.playStateSnapshot = JSON.stringify(captureSceneState());

  document.getElementById('btn-play').style.display = 'none';
  document.getElementById('btn-pause').style.display = '';
  document.getElementById('play-overlay').classList.remove('hidden');
  document.getElementById('play-status').textContent = '▶ PLAYING';
  document.getElementById('play-status').classList.add('playing');
  document.body.classList.add('playing');

  engineLog('Scene started ▶', 'success');
}

function pausePlay() {
  if (!State.playing) return;
  State.playing = false;
  document.getElementById('btn-play').style.display = '';
  document.getElementById('btn-pause').style.display = 'none';
  document.getElementById('play-status').textContent = '⏸ PAUSED';
  engineLog('Scene paused ⏸', 'warn');
}

function stopPlay() {
  State.playing = false;
  document.getElementById('btn-play').style.display = '';
  document.getElementById('btn-pause').style.display = 'none';
  document.getElementById('play-overlay').classList.add('hidden');
  document.getElementById('play-status').textContent = '● EDIT';
  document.getElementById('play-status').classList.remove('playing');
  document.body.classList.remove('playing');

  if (State.playStateSnapshot) {
    restoreSceneState(JSON.parse(State.playStateSnapshot));
    State.playStateSnapshot = null;
  }
  engineLog('Scene stopped ■', 'warn');
}

function captureSceneState() {
  return State.objects.map(meta => {
    const obj = meta.mesh || meta.light || meta.camera;
    if (!obj) return null;
    return {
      id: meta.id,
      px: obj.position.x, py: obj.position.y, pz: obj.position.z,
      rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z,
      sx: obj.scale.x,    sy: obj.scale.y,    sz: obj.scale.z,
    };
  }).filter(Boolean);
}

function restoreSceneState(snap) {
  snap.forEach(s => {
    const meta = State.objects.find(m => m.id === s.id);
    if (!meta) return;
    const obj = meta.mesh || meta.light || meta.camera;
    if (!obj) return;
    obj.position.set(s.px, s.py, s.pz);
    obj.rotation.set(s.rx, s.ry, s.rz);
    obj.scale.set(s.sx, s.sy, s.sz);
  });
}

// ─── SCREENSHOT ───────────────────────────────────────────────
function takeScreenshot() {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `forge3d_screenshot_${Date.now()}.png`;
  a.click();
  engineLog('Screenshot saved 📸', 'success');
}

// ─── SCENE TREE ───────────────────────────────────────────────
function renderTree() {
  const tree = document.getElementById('scene-tree');
  tree.innerHTML = '';

  const typeIcons = {
    box: '⬛', sphere: '⚪', cylinder: '🔵', cone: '🔺',
    torus: '⭕', plane: '▬', 'light-point': '💡',
    'light-dir': '☀️', camera: '🎥', empty: '◎',
  };

  State.objects.forEach(meta => {
    const li = document.createElement('li');
    const obj = meta.mesh || meta.light || meta.camera;
    li.dataset.id = meta.id;

    if (State.selected && State.selected.userData?.id === meta.id) {
      li.classList.add('selected');
    }

    const icon = typeIcons[meta.type] || '◻';
    li.innerHTML = `
      <span class="tree-icon">${icon}</span>
      <span class="tree-name">${meta.name}</span>
      <span class="tree-vis" data-id="${meta.id}">${meta.visible ? '👁' : '○'}</span>
    `;

    li.addEventListener('click', e => {
      if (e.target.classList.contains('tree-vis')) return;
      const target = meta.mesh || meta.light || meta.camera;
      if (target) selectObject(target);
    });

    li.querySelector('.tree-vis').addEventListener('click', e => {
      e.stopPropagation();
      meta.visible = !meta.visible;
      const t = meta.mesh || meta.light || meta.camera;
      if (t) t.visible = meta.visible;
      if (meta.helper) meta.helper.visible = meta.visible;
      renderTree();
    });

    tree.appendChild(li);
  });
}

// ─── INSPECTOR ────────────────────────────────────────────────
function renderInspector() {
  const content = document.getElementById('inspector-content');
  if (!State.selected) {
    content.innerHTML = '<div class="inspector-empty">Select an object to inspect</div>';
    return;
  }

  const obj = State.selected;
  const meta = obj.userData.meta;
  const type = obj.userData.type;

  content.innerHTML = '';

  // Type tag
  const tag = document.createElement('div');
  let tagClass = 'mesh';
  if (type && type.startsWith('light')) tagClass = 'light';
  if (type === 'camera') tagClass = 'camera';
  tag.className = `inspector-tag ${tagClass}`;
  tag.textContent = (type || 'unknown').toUpperCase();
  content.appendChild(tag);

  // Name
  buildSection(content, 'OBJECT', [
    buildNameRow('Name', obj.userData.name || 'Unnamed', v => {
      obj.userData.name = v;
      if (meta) meta.name = v;
      renderTree();
    })
  ]);

  // Transform
  buildSection(content, 'TRANSFORM', [
    buildVec3Row('Position', obj.position,
      (axis, val) => { obj.position[axis] = val; if (selectionBox) selectionBox.update(); }),
    buildVec3Row('Rotation', {
      x: THREE.MathUtils.radToDeg(obj.rotation.x),
      y: THREE.MathUtils.radToDeg(obj.rotation.y),
      z: THREE.MathUtils.radToDeg(obj.rotation.z),
    }, (axis, val) => {
      obj.rotation[axis] = THREE.MathUtils.degToRad(val);
      if (selectionBox) selectionBox.update();
    }),
    buildVec3Row('Scale', obj.scale,
      (axis, val) => { obj.scale[axis] = Math.max(0.001, val); if (selectionBox) selectionBox.update(); }),
  ]);

  // Material (mesh objects)
  if (obj.isMesh && obj.material && type !== 'empty' && obj !== skyMesh) {
    buildSection(content, 'MATERIAL', [
      buildColorRow('Color', obj.material.color, color => {
        obj.material.color.setHex(parseInt(color.replace('#', '0x')));
      }),
      buildSliderRow('Roughness', obj.material.roughness, 0, 1, 0.01, v => {
        obj.material.roughness = v;
      }),
      buildSliderRow('Metalness', obj.material.metalness, 0, 1, 0.01, v => {
        obj.material.metalness = v;
      }),
      buildSliderRow('Opacity', obj.material.opacity !== undefined ? obj.material.opacity : 1, 0, 1, 0.01, v => {
        obj.material.transparent = v < 1;
        obj.material.opacity = v;
      }),
    ]);
  }

  // Light properties
  if (type && type.startsWith('light')) {
    const light = obj;
    buildSection(content, 'LIGHT', [
      buildColorRow('Color', light.color, color => {
        light.color.setHex(parseInt(color.replace('#', '0x')));
      }),
      buildSliderRow('Intensity', light.intensity, 0, 5, 0.05, v => { light.intensity = v; }),
    ]);
    if (type === 'light-point') {
      buildSection(content, 'POINT LIGHT', [
        buildSliderRow('Distance', light.distance || 20, 0, 100, 1, v => { light.distance = v; }),
        buildSliderRow('Decay', light.decay || 2, 0, 5, 0.1, v => { light.decay = v; }),
      ]);
    }
  }

  // Camera properties
  if (type === 'camera' && obj.isPerspectiveCamera) {
    buildSection(content, 'CAMERA', [
      buildSliderRow('FOV', obj.fov, 10, 160, 1, v => {
        obj.fov = v; obj.updateProjectionMatrix();
      }),
      buildSliderRow('Near', obj.near, 0.01, 10, 0.01, v => {
        obj.near = v; obj.updateProjectionMatrix();
      }),
      buildSliderRow('Far', obj.far, 1, 1000, 1, v => {
        obj.far = v; obj.updateProjectionMatrix();
      }),
    ]);
  }

  // Renderer section (for meshes)
  if (obj.isMesh && type !== 'empty') {
    buildSection(content, 'RENDERER', [
      buildCheckRow('Cast Shadow', obj.castShadow, v => { obj.castShadow = v; }),
      buildCheckRow('Receive Shadow', obj.receiveShadow, v => { obj.receiveShadow = v; }),
      buildCheckRow('Visible', obj.visible, v => {
        obj.visible = v;
        if (meta) meta.visible = v;
        renderTree();
      }),
    ]);
  }
}

function buildSection(parent, title, rows) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = 'inspector-section-header';
  header.innerHTML = `<span>${title}</span><span class="collapse-arrow">▾</span>`;
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'inspector-section-body';
  rows.forEach(row => { if (row) body.appendChild(row); });
  section.appendChild(body);

  header.addEventListener('click', () => {
    header.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
  });

  parent.appendChild(section);
}

function buildNameRow(label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${label}</span>`;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'name-input'; inp.value = value;
  inp.addEventListener('change', () => onChange(inp.value));
  row.appendChild(inp);
  return row;
}

function buildVec3Row(label, vec, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${label}</span>`;
  const inputs = document.createElement('div');
  inputs.className = 'prop-inputs';

  ['x','y','z'].forEach((axis, i) => {
    const lbl = document.createElement('span');
    lbl.className = `xyz-label xyz-${axis}`;
    lbl.textContent = axis.toUpperCase();
    inputs.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'num-input';
    inp.step = '0.01'; inp.value = parseFloat(vec[axis]).toFixed(3);
    inp.dataset.axis = axis;
    inp.addEventListener('change', () => onChange(axis, parseFloat(inp.value) || 0));
    inputs.appendChild(inp);
  });

  row.appendChild(inputs);
  return row;
}

function buildColorRow(label, color, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${label}</span>`;
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.className = 'color-input';
  inp.value = '#' + (color.getHex ? color.getHex().toString(16).padStart(6,'0') : color.toString(16).padStart(6,'0'));
  inp.addEventListener('input', () => onChange(inp.value));
  row.appendChild(inp);
  return row;
}

function buildSliderRow(label, value, min, max, step, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${label}</span>`;
  const inputs = document.createElement('div');
  inputs.className = 'prop-inputs';

  const slider = document.createElement('input');
  slider.type = 'range'; slider.className = 'range-input';
  slider.min = min; slider.max = max; slider.step = step; slider.value = value;

  const display = document.createElement('span');
  display.className = 'prop-value-display';
  display.textContent = parseFloat(value).toFixed(2);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    display.textContent = v.toFixed(2);
    onChange(v);
  });

  inputs.appendChild(slider);
  inputs.appendChild(display);
  row.appendChild(inputs);
  return row;
}

function buildCheckRow(label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${label}</span>`;
  const inp = document.createElement('input');
  inp.type = 'checkbox'; inp.className = 'prop-checkbox'; inp.checked = !!value;
  inp.addEventListener('change', () => onChange(inp.checked));
  row.appendChild(inp);
  return row;
}

function updateInspectorTransform() {
  if (!State.selected) return;
  const obj = State.selected;
  const inputs = document.querySelectorAll('.num-input');
  // Quick update for position/rotation/scale — rebuild is expensive
  inputs.forEach(inp => {
    const row = inp.closest('.prop-row');
    if (!row) return;
    const label = row.querySelector('.prop-label')?.textContent;
    const axis = inp.dataset.axis;
    if (!axis) return;
    if (label === 'Position') inp.value = obj.position[axis].toFixed(3);
    if (label === 'Rotation') inp.value = THREE.MathUtils.radToDeg(obj.rotation[axis]).toFixed(3);
    if (label === 'Scale') inp.value = obj.scale[axis].toFixed(3);
  });
}

// ─── ANIMATION LOOP ───────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const delta = State.clock.getDelta();
  const time = State.clock.elapsedTime;

  // Play mode: simple animation demo
  if (State.playing) {
    State.objects.forEach(meta => {
      const obj = meta.mesh || meta.light;
      if (!obj || !obj.isMesh) return;
      if (meta.type === 'sphere') {
        obj.position.y = (meta._baseY !== undefined ? meta._baseY : 0.7) + Math.sin(time * 2 + meta.id) * 0.3;
      }
      if (meta.type === 'box') {
        obj.rotation.y += delta * 1.5;
      }
      if (meta.type === 'torus') {
        obj.rotation.x += delta * 1.2;
        obj.rotation.y += delta * 0.8;
      }
    });
  }

  // Capture base Y for spheres
  if (!State.playing) {
    State.objects.forEach(meta => {
      if (meta.type === 'sphere' && meta.mesh) {
        meta._baseY = meta.mesh.position.y;
      }
    });
  }

  // Update selection box
  if (selectionBox) selectionBox.update();

  // Update camera helpers
  scene.traverse(obj => {
    if (obj.isCamera && obj !== camera) {
      if (obj.userData.helper) obj.userData.helper.update();
    }
    if (obj.isPointLight || obj.isDirectionalLight) {
      if (obj.userData.helper) obj.userData.helper.update();
    }
  });

  // FPS counter
  State.frameCount++;
  const now = performance.now();
  if (now - State.lastFPSTime > 500) {
    State.fps = Math.round(State.frameCount / ((now - State.lastFPSTime) / 1000));
    State.frameCount = 0;
    State.lastFPSTime = now;
    document.getElementById('fps-counter').textContent = `${State.fps} FPS`;
  }

  renderer.render(scene, camera);

  // Gizmo sync
  gizmoCamera.position.copy(camera.position).sub(State.orbitTarget).normalize().multiplyScalar(3);
  gizmoCamera.lookAt(0,0,0);
  gizmoRenderer.render(gizmoScene, gizmoCamera);
}

// ─── RESIZE ───────────────────────────────────────────────────
function resizeViewport() {
  const wrap = document.getElementById('viewport-wrap');
  const header = document.getElementById('viewport-header');
  const w = wrap.clientWidth;
  const h = wrap.clientHeight - header.offsetHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── UTILITIES ────────────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function randomColor() {
  const palette = [0x00e5ff, 0xff4466, 0x44ff99, 0xffe600, 0xff8c00, 0x8844ff, 0x44aaff, 0xff44cc];
  return palette[Math.floor(Math.random() * palette.length)];
}

function updateObjCounter() {
  document.getElementById('obj-counter').textContent = `${State.objects.length} Objects`;
}

// ─── CONSOLE ──────────────────────────────────────────────────
function engineLog(msg, level = 'info') {
  const log = document.getElementById('console-log');
  const now = new Date();
  const t = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  const div = document.createElement('div');
  div.className = `log-entry log-${level}`;
  div.innerHTML = `<span class="log-time">${t}</span>${msg}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE === 'undefined') {
    console.error('Three.js not loaded!');
    return;
  }
  initEngine();
});