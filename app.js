/* =============================================================
   FORGE3D — Real Game Engine
   Three.js r128 + Cannon.js physics
   Features: Physics, Collision, RigidBodies, CharacterController,
   Triggers, Component Scripts, Play/Edit mode, Transform gizmos,
   Raycasting, Material system, Scene settings
   ============================================================= */
'use strict';

// ═══════════════════════════════════════════════
//  ENGINE CORE
// ═══════════════════════════════════════════════
const E = {
  nodes: [],
  selected: null,
  tool: 'select',
  playing: false,
  paused: false,
  snapEnabled: false,
  snapSize: 0.25,
  localSpace: false,

  // Viewport state
  viewMode: '3d',
  showGrid: true,
  showWire: false,
  showPhysViz: false,
  showSky: true,
  renderMode: 'lit',

  // Camera orbit
  orbitTheta: 0.5,
  orbitPhi: 1.05,
  orbitRadius: 14,
  orbitTarget: null,

  // Mouse
  mouse: { x:0, y:0 },
  mouseDown: false,
  mouseButton: -1,
  lastMouse: { x:0, y:0 },

  // Physics world
  physWorld: null,
  physBodies: [],         // {node, body, shape}
  physDebugMeshes: [],

  // Play mode
  playSnapshot: null,
  playerNode: null,
  playerBody: null,
  playerInput: {},
  camYaw: 0, camPitch: 0,
  mouseLocked: false,

  // Collision events
  collisionLog: [],

  // Scripts
  scripts: {},            // nodeId -> fn

  // Raycaster
  raycaster: null,
  selectionOutline: null,

  // Three objects
  renderer: null, scene: null, camera: null,
  gizmoRenderer: null, gizmoScene: null, gizmoCamera: null,
  grid: null, axesH: null, sky: null,
  ambient: null, sun: null,

  // Timing
  clock: null,
  frameN: 0,
  lastFPS: 0,
  fps: 60,

  // Materials palette
  materials: {},
  nextId: 1,
};

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
function init() {
  E.orbitTarget = new THREE.Vector3();
  E.raycaster = new THREE.Raycaster();
  E.clock = new THREE.Clock();

  initRenderer();
  initScene();
  initPhysics();
  initMaterials();
  initGizmo();
  initEvents();
  initUI();
  buildDefaultScene();
  animate();
  log('FORGE3D engine ready ⚙', 'ok');
  log('Physics: Cannon.js | Renderer: Three.js r128', 'info');
  log('Keyboard: Q/W/E/R tools | P play | Del delete | F focus', 'info');
}

function initRenderer() {
  const canvas = document.getElementById('main-canvas');
  E.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  E.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  E.renderer.shadowMap.enabled = true;
  E.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  E.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  E.renderer.toneMappingExposure = 1.0;
  resize();
  window.addEventListener('resize', resize);
}

function initScene() {
  E.scene = new THREE.Scene();
  E.scene.background = new THREE.Color(0x0e111a);
  E.scene.fog = new THREE.FogExp2(0x0e111a, 0.018);

  E.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  syncOrbitCamera();

  // Ambient
  E.ambient = new THREE.AmbientLight(0x334466, 0.5);
  E.scene.add(E.ambient);

  // Directional sun
  E.sun = new THREE.DirectionalLight(0xfff5e0, 1.3);
  E.sun.position.set(12, 20, 8);
  E.sun.castShadow = true;
  E.sun.shadow.mapSize.set(2048, 2048);
  E.sun.shadow.camera.left = -30;
  E.sun.shadow.camera.right = 30;
  E.sun.shadow.camera.top = 30;
  E.sun.shadow.camera.bottom = -30;
  E.sun.shadow.camera.far = 80;
  E.sun.shadow.bias = -0.001;
  E.scene.add(E.sun);

  // Hemisphere
  const hemi = new THREE.HemisphereLight(0x334466, 0x223322, 0.3);
  E.scene.add(hemi);

  // Grid
  E.grid = new THREE.GridHelper(40, 40, 0x1c2030, 0x1c2030);
  E.grid.material.opacity = 0.5; E.grid.material.transparent = true;
  E.scene.add(E.grid);

  E.axesH = new THREE.AxesHelper(3);
  E.axesH.position.y = 0.003;
  E.scene.add(E.axesH);

  buildSky();
}

function buildSky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms:{
      top:{value:new THREE.Color(0x060a18)},
      mid:{value:new THREE.Color(0x0d1530)},
      bot:{value:new THREE.Color(0x1a0a2e)},
    },
    vertexShader:`varying vec3 vPos;void main(){vPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 top,mid,bot;varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 c=h>0.?mix(mid,top,h):mix(mid,bot,-h);gl_FragColor=vec4(c,1.);}`,
    side:THREE.BackSide,depthWrite:false
  });
  E.sky = new THREE.Mesh(geo, mat);
  E.scene.add(E.sky);
}

// ═══════════════════════════════════════════════
//  PHYSICS
// ═══════════════════════════════════════════════
function initPhysics() {
  E.physWorld = new CANNON.World();
  E.physWorld.gravity.set(0, -18, 0);
  E.physWorld.broadphase = new CANNON.SAPBroadphase(E.physWorld);
  E.physWorld.solver.iterations = 10;
  E.physWorld.defaultContactMaterial.friction = 0.4;
  E.physWorld.defaultContactMaterial.restitution = 0.3;

  // Ground plane (permanent static)
  const groundMat = new CANNON.Material('ground');
  const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
  E.physWorld.addBody(groundBody);

  // Collision event
  E.physWorld.addEventListener('beginContact', (e) => {
    const a = E.physBodies.find(p => p.body === e.bodyA);
    const b = E.physBodies.find(p => p.body === e.bodyB);
    const nameA = a?.node?.name || 'Ground';
    const nameB = b?.node?.name || 'Ground';

    // Trigger check
    if (a?.node?.isTrigger || b?.node?.isTrigger) {
      const trigger = a?.node?.isTrigger ? a.node : b.node;
      const other   = a?.node?.isTrigger ? b?.node : a?.node;
      colLog(`🟦 Trigger "${trigger.name}" entered by "${other?.name || '?'}"`);
      if (trigger.onTriggerEnter) {
        try { trigger.onTriggerEnter(other); } catch(ex) {}
      }
    } else {
      colLog(`💥 Collision: "${nameA}" ↔ "${nameB}"`);
    }
  });
}

function addPhysicsToNode(node, type = 'dynamic', shape = 'box') {
  // Remove existing
  removePhysicsFromNode(node);

  const s = node.mesh.scale;
  let cannonShape;
  let shapeType = shape || node.physShape || 'box';

  if (shapeType === 'sphere') {
    const r = Math.max(s.x, s.y, s.z) * 0.5;
    cannonShape = new CANNON.Sphere(r);
  } else if (shapeType === 'cylinder') {
    cannonShape = new CANNON.Cylinder(s.x*0.4, s.x*0.4, s.y, 12);
    // rotate cannon cylinder to match three
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
    cannonShape.transformAllPoints(new CANNON.Vec3(), q);
  } else {
    cannonShape = new CANNON.Box(new CANNON.Vec3(s.x/2, s.y/2, s.z/2));
  }

  const mass = (type === 'dynamic') ? (node.physMass || 1) : 0;
  const body = new CANNON.Body({ mass, linearDamping: 0.1, angularDamping: 0.3 });
  body.addShape(cannonShape);
  body.position.copy(node.mesh.position);
  body.quaternion.copy(node.mesh.quaternion);

  if (type === 'kinematic') body.type = CANNON.Body.KINEMATIC;

  E.physWorld.addBody(body);
  const entry = { node, body, shape: shapeType, type };
  E.physBodies.push(entry);
  node.physBody = body;
  node.physType = type;
  node.hasPhysics = true;

  // Debug viz
  createPhysDebugMesh(entry);
  log(`Physics added: "${node.name}" [${type}/${shapeType}]`, 'phys');
  return body;
}

function removePhysicsFromNode(node) {
  const idx = E.physBodies.findIndex(p => p.node === node);
  if (idx < 0) return;
  E.physWorld.remove(E.physBodies[idx].body);
  const dbg = E.physDebugMeshes.find(d => d.nodeId === node.id);
  if (dbg) { E.scene.remove(dbg.mesh); E.physDebugMeshes = E.physDebugMeshes.filter(d => d.nodeId !== node.id); }
  E.physBodies.splice(idx, 1);
  node.physBody = null; node.hasPhysics = false;
}

function createPhysDebugMesh(entry) {
  let dbgGeo;
  const s = entry.node.mesh.scale;
  if (entry.shape === 'sphere') dbgGeo = new THREE.SphereGeometry(Math.max(s.x,s.y,s.z)*0.5, 12, 8);
  else if (entry.shape === 'cylinder') dbgGeo = new THREE.CylinderGeometry(s.x*0.4, s.x*0.4, s.y, 12);
  else dbgGeo = new THREE.BoxGeometry(s.x, s.y, s.z);
  const dbgMat = new THREE.MeshBasicMaterial({ color:0xff6b35, wireframe:true, opacity:0.6, transparent:true });
  const dbgMesh = new THREE.Mesh(dbgGeo, dbgMat);
  dbgMesh.visible = E.showPhysViz;
  E.scene.add(dbgMesh);
  E.physDebugMeshes.push({ nodeId: entry.node.id, mesh: dbgMesh });
}

function stepPhysics(dt) {
  if (!E.playing || E.paused) return;
  E.physWorld.step(1/60, dt, 3);

  E.physBodies.forEach(entry => {
    const { node, body } = entry;
    if (body.mass === 0) return; // static
    if (entry.type === 'kinematic') return;
    node.mesh.position.copy(body.position);
    node.mesh.quaternion.copy(body.quaternion);
    // sync debug mesh
    const dbg = E.physDebugMeshes.find(d => d.nodeId === node.id);
    if (dbg) {
      dbg.mesh.position.copy(body.position);
      dbg.mesh.quaternion.copy(body.quaternion);
    }
  });
}

// ═══════════════════════════════════════════════
//  MATERIALS
// ═══════════════════════════════════════════════
function initMaterials() {
  const defs = [
    { id:'default',    color:0x4488cc, rough:0.6, metal:0.1 },
    { id:'red',        color:0xff3355, rough:0.5, metal:0.0 },
    { id:'blue',       color:0x3388ff, rough:0.5, metal:0.0 },
    { id:'green',      color:0x33cc66, rough:0.6, metal:0.0 },
    { id:'metal',      color:0x99aacc, rough:0.2, metal:0.9 },
    { id:'glass',      color:0x88ddff, rough:0.0, metal:0.0, opacity:0.4 },
    { id:'ground',     color:0x334422, rough:0.9, metal:0.0 },
    { id:'emissive',   color:0x00ffcc, rough:0.5, metal:0.0, emissive:0x003322 },
  ];
  defs.forEach(d => {
    const m = new THREE.MeshStandardMaterial({
      color: d.color, roughness: d.rough, metalness: d.metal,
    });
    if (d.opacity !== undefined) { m.transparent = true; m.opacity = d.opacity; }
    if (d.emissive) m.emissive.setHex(d.emissive);
    E.materials[d.id] = m;
  });
}

// ═══════════════════════════════════════════════
//  NODE SYSTEM
// ═══════════════════════════════════════════════
const NODE_ICONS = {
  box:'📦', sphere:'🔵', cylinder:'🛢', cone:'🔺', torus:'⭕', plane:'▬',
  capsule:'💊', wedge:'◥',
  light_point:'💡', light_spot:'🔦', light_dir:'☀️',
  rigidbody_box:'⬛', rigidbody_sphere:'⚫', staticbody:'🧱', character:'🧑',
  camera_node:'🎥', spawn_point:'📍', trigger_box:'🟦', empty_node:'◎',
};

function createNode(type, overrides = {}) {
  const id = E.nextId++;
  const name = overrides.name || `${type}_${id}`;
  const pos  = overrides.position || [0, 0.5, 0];
  const rot  = overrides.rotation || [0, 0, 0];
  const scl  = overrides.scale || [1, 1, 1];

  const node = {
    id, name, type, visible: true,
    isTrigger: false, hasPhysics: false,
    physBody: null, physType: null, physMass: 1, physShape: 'box',
    script: '', scriptFn: null,
    mesh: null, lightObj: null, helper: null,
    matId: overrides.matId || 'default',
    userData: {},
  };

  // Build Three.js object
  let mesh;

  if (type.startsWith('light_')) {
    mesh = buildLight(node, type, pos);
  } else if (type === 'camera_node') {
    mesh = buildCameraNode(node, pos);
  } else if (type === 'spawn_point') {
    mesh = buildSpawnPoint(node, pos);
  } else if (type === 'trigger_box') {
    mesh = buildTrigger(node, pos, scl);
  } else if (type === 'empty_node') {
    mesh = new THREE.Object3D();
    mesh.position.set(...pos);
    E.scene.add(mesh);
  } else {
    mesh = buildMesh(node, type, pos, rot, scl);
  }

  node.mesh = mesh;
  mesh.userData.nodeId = id;

  // Auto-physics
  if (type === 'rigidbody_box') {
    node.physShape = 'box';
    addPhysicsToNode(node, 'dynamic', 'box');
  } else if (type === 'rigidbody_sphere') {
    node.physShape = 'sphere';
    addPhysicsToNode(node, 'dynamic', 'sphere');
  } else if (type === 'staticbody') {
    node.physShape = 'box';
    addPhysicsToNode(node, 'static', 'box');
  } else if (type === 'character') {
    node.physShape = 'capsule';
    addPhysicsToNode(node, 'dynamic', 'box');
    node.isCharacter = true;
    E.playerNode = node;
    log(`Character controller created: "${name}" — will respond to WASD in play mode`, 'ok');
  } else if (type === 'trigger_box') {
    node.isTrigger = true;
  }

  E.nodes.push(node);
  refreshHierarchy();
  updateObjCount();
  return node;
}

function buildMesh(node, type, pos, rot, scl) {
  let geo;
  switch(type) {
    case 'box':      geo = new THREE.BoxGeometry(1,1,1); break;
    case 'sphere':   geo = new THREE.SphereGeometry(0.5,32,24); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(0.4,0.4,1,32); break;
    case 'cone':     geo = new THREE.ConeGeometry(0.5,1,32); break;
    case 'torus':    geo = new THREE.TorusGeometry(0.5,0.18,16,80); break;
    case 'plane':    geo = new THREE.PlaneGeometry(1,1); break;
    case 'capsule':
      // Capsule = cylinder + 2 spheres
      geo = new THREE.CylinderGeometry(0.35,0.35,0.6,20);
      break;
    case 'wedge': {
      // Custom wedge geometry
      const wg = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  -0.5, 0.5,-0.5,
        -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,
      ]);
      const idx = [0,1,2, 0,2,3, 4,5,1, 4,1,0, 3,2,5, 3,5,4, 0,4,5, 0,5,1, 0,3,4, 3,5,4];
      wg.setAttribute('position', new THREE.BufferAttribute(verts,3));
      wg.setIndex(idx);
      wg.computeVertexNormals();
      geo = wg;
      break;
    }
    case 'rigidbody_box':  geo = new THREE.BoxGeometry(1,1,1); break;
    case 'rigidbody_sphere': geo = new THREE.SphereGeometry(0.5,24,18); break;
    case 'staticbody':     geo = new THREE.BoxGeometry(1,1,1); break;
    case 'character': {
      // Capsule shape for character
      geo = new THREE.CylinderGeometry(0.35,0.35,1,16);
      break;
    }
    default: geo = new THREE.BoxGeometry(1,1,1);
  }

  const mat = E.materials[node.matId].clone();
  node._mat = mat;

  // Color by type
  const cols = {
    rigidbody_box:0xff6b35, rigidbody_sphere:0xff3355,
    staticbody:0x88aacc, character:0x23d160,
  };
  if (cols[type]) mat.color.setHex(cols[type]);

  const mesh = new THREE.Mesh(geo, mat);
  if (type === 'plane') mesh.rotation.x = -Math.PI/2;
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.scale.set(...scl);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (type === 'character') {
    mesh.position.set(...pos);
    // Add head sphere
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3,12,8), mat.clone());
    head.position.y = 0.85;
    mesh.add(head);
  }

  E.scene.add(mesh);
  return mesh;
}

function buildLight(node, type, pos) {
  let light;
  if (type === 'light_point') {
    light = new THREE.PointLight(0xffeedd, 1, 15, 2);
    light.castShadow = true;
  } else if (type === 'light_spot') {
    light = new THREE.SpotLight(0xffeedd, 1.5, 20, Math.PI/6, 0.2, 2);
    light.castShadow = true;
    light.target.position.set(0,0,0);
    E.scene.add(light.target);
  } else {
    light = new THREE.DirectionalLight(0xfff5e0, 1);
    light.castShadow = true;
  }
  light.position.set(...pos);
  E.scene.add(light);
  node.lightObj = light;

  // Visual helper
  let helper;
  if (type === 'light_point') helper = new THREE.PointLightHelper(light, 0.3);
  else if (type === 'light_spot') helper = new THREE.SpotLightHelper(light);
  else helper = new THREE.DirectionalLightHelper(light, 1);
  E.scene.add(helper);
  node.helper = helper;

  // Proxy mesh for selection
  const proxy = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2),
    new THREE.MeshBasicMaterial({ color:0xffdd57, wireframe:true })
  );
  proxy.position.set(...pos);
  E.scene.add(proxy);
  node._proxy = proxy;
  return proxy;
}

function buildCameraNode(node, pos) {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  cam.position.set(...pos);
  cam.lookAt(0,0,0);
  E.scene.add(cam);
  const helper = new THREE.CameraHelper(cam);
  E.scene.add(helper);
  node.helper = helper;
  node._cam = cam;
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.3,0.25,0.4),
    new THREE.MeshBasicMaterial({ color:0xaa66ff, wireframe:true })
  );
  proxy.position.set(...pos);
  E.scene.add(proxy);
  node._proxy = proxy;
  return proxy;
}

function buildSpawnPoint(node, pos) {
  const geo = new THREE.ConeGeometry(0.2, 0.5, 8);
  const mat = new THREE.MeshBasicMaterial({ color:0x00ff88, wireframe:false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.y = 0;
  E.scene.add(mesh);
  // Arrow up
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0.3,0), 0.5, 0x00ff88);
  mesh.add(arrow);
  return mesh;
}

function buildTrigger(node, pos, scl) {
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshBasicMaterial({ color:0x23d160, wireframe:true, opacity:0.5, transparent:true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.scale.set(...scl);
  E.scene.add(mesh);
  node.isTrigger = true;
  // Add as static trigger body
  const body = new CANNON.Body({ mass:0, isTrigger:true });
  const s = mesh.scale;
  body.addShape(new CANNON.Box(new CANNON.Vec3(s.x/2, s.y/2, s.z/2)));
  body.position.copy(mesh.position);
  E.physWorld.addBody(body);
  node.physBody = body;
  node.hasPhysics = true;
  E.physBodies.push({ node, body, shape:'box', type:'trigger' });
  return mesh;
}

function deleteNode(node) {
  if (!node) return;
  const obj = node.mesh || node._proxy;
  if (obj) E.scene.remove(obj);
  if (node.helper)   E.scene.remove(node.helper);
  if (node._proxy)   E.scene.remove(node._proxy);
  if (node.lightObj) E.scene.remove(node.lightObj);
  if (node._cam)     E.scene.remove(node._cam);
  if (node.hasPhysics) removePhysicsFromNode(node);
  if (node.mesh && node.mesh.geometry) node.mesh.geometry.dispose();
  clearSelection();
  E.nodes = E.nodes.filter(n => n !== node);
  if (E.playerNode === node) E.playerNode = null;
  refreshHierarchy();
  updateObjCount();
  log(`Deleted: "${node.name}"`, 'warn');
}

function duplicateNode(node) {
  if (!node) return;
  const obj = node.mesh;
  if (!obj) return;
  const p = obj.position;
  const r = obj.rotation;
  const s = obj.scale;
  const n = createNode(node.type, {
    position: [p.x+0.5, p.y, p.z+0.5],
    rotation: [r.x, r.y, r.z],
    scale:    [s.x, s.y, s.z],
    matId:    node.matId,
    name:     node.name + '_copy',
  });
  if (node.script) { n.script = node.script; compileScript(n); }
  selectNode(n);
}

// ═══════════════════════════════════════════════
//  SELECTION & OUTLINE
// ═══════════════════════════════════════════════
let outlineBox = null;

function selectNode(node) {
  E.selected = node;
  clearOutline();
  if (node) {
    const obj = node.mesh;
    if (obj && obj.isMesh) {
      outlineBox = new THREE.BoxHelper(obj, 0x00d4ff);
      outlineBox.userData.isHelper = true;
      E.scene.add(outlineBox);
    }
    renderInspector();
    document.getElementById('script-node-name').textContent = node.name;
    document.getElementById('script-editor').value = node.script || '';
    document.getElementById('script-error').textContent = '';
  } else {
    renderInspector();
  }
  refreshHierarchy();
}

function clearSelection() {
  E.selected = null;
  clearOutline();
  renderInspector();
  refreshHierarchy();
}

function clearOutline() {
  if (outlineBox) { E.scene.remove(outlineBox); outlineBox = null; }
}

function pickAt(e) {
  const rect = E.renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  E.raycaster.setFromCamera({ x, y }, E.camera);

  const targets = [];
  E.scene.traverse(obj => {
    if (obj.isMesh && !obj.userData.isHelper && obj !== E.sky) targets.push(obj);
  });
  const hits = E.raycaster.intersectObjects(targets, false);
  if (hits.length) {
    const nodeId = hits[0].object.userData.nodeId;
    const node = E.nodes.find(n => n.id === nodeId);
    if (node) selectNode(node);
    else clearSelection();
  } else {
    clearSelection();
  }
}

// ═══════════════════════════════════════════════
//  TRANSFORM TOOLS
// ═══════════════════════════════════════════════
let dragState = null;

function startDrag(e) {
  if (!E.selected || E.tool === 'select') return;
  const obj = E.selected.mesh;
  if (!obj) return;
  dragState = {
    tool: E.tool,
    startPos: obj.position.clone(),
    startRot: obj.rotation.clone(),
    startScale: obj.scale.clone(),
    startMouse: { x: e.clientX, y: e.clientY },
  };
}

function updateDrag(e) {
  if (!dragState || !E.selected) return;
  const obj = E.selected.mesh;
  if (!obj) return;
  const dx = e.clientX - dragState.startMouse.x;
  const dy = e.clientY - dragState.startMouse.y;
  const speed = 0.008 * (E.orbitRadius / 8);

  // Get camera right/up vectors
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0,1,0);
  E.camera.getWorldDirection(right);
  right.crossVectors(up, right).normalize();

  if (dragState.tool === 'move') {
    let snap = E.snapEnabled ? E.snapSize : 0;
    const newPos = dragState.startPos.clone()
      .addScaledVector(right, dx * speed * E.orbitRadius * 0.1)
      .addScaledVector(up, -dy * speed * E.orbitRadius * 0.1);
    if (snap) {
      newPos.x = Math.round(newPos.x / snap) * snap;
      newPos.y = Math.round(newPos.y / snap) * snap;
      newPos.z = Math.round(newPos.z / snap) * snap;
    }
    obj.position.copy(newPos);
    // Sync physics body
    if (E.selected.physBody) {
      E.selected.physBody.position.copy(obj.position);
      E.selected.physBody.velocity.set(0,0,0);
    }
    const p = obj.position;
    showTransformHUD(`POS  ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
  } else if (dragState.tool === 'rotate') {
    obj.rotation.y = dragState.startRot.y + dx * 0.012;
    obj.rotation.x = dragState.startRot.x + dy * 0.012;
    if (E.selected.physBody) {
      E.selected.physBody.quaternion.copy(obj.quaternion);
    }
    showTransformHUD(`ROT  Y:${THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1)}°`);
  } else if (dragState.tool === 'scale') {
    const factor = 1 + (dx - dy) * 0.004;
    obj.scale.set(
      Math.max(0.01, dragState.startScale.x * factor),
      Math.max(0.01, dragState.startScale.y * factor),
      Math.max(0.01, dragState.startScale.z * factor),
    );
    showTransformHUD(`SCALE  ${obj.scale.x.toFixed(2)}`);
  }
  if (outlineBox) outlineBox.update();
  updateInspectorLive();
}

function endDrag() {
  dragState = null;
  document.getElementById('transform-hud').classList.add('hidden');
}

function showTransformHUD(txt) {
  const hud = document.getElementById('transform-hud');
  hud.textContent = txt;
  hud.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
//  PLAY MODE
// ═══════════════════════════════════════════════
function startPlay() {
  if (E.playing) return;
  E.playing = true;
  E.paused = false;

  // Snapshot all node transforms
  E.playSnapshot = E.nodes.map(n => ({
    id: n.id,
    px: n.mesh?.position.x || 0, py: n.mesh?.position.y || 0, pz: n.mesh?.position.z || 0,
    rx: n.mesh?.rotation.x || 0, ry: n.mesh?.rotation.y || 0, rz: n.mesh?.rotation.z || 0,
    sx: n.mesh?.scale.x    || 1, sy: n.mesh?.scale.y    || 1, sz: n.mesh?.scale.z    || 1,
  }));

  // Sync all physics bodies to current positions
  E.physBodies.forEach(entry => {
    if (!entry.node.mesh) return;
    entry.body.position.copy(entry.node.mesh.position);
    entry.body.quaternion.copy(entry.node.mesh.quaternion);
    entry.body.velocity.set(0,0,0);
    entry.body.angularVelocity.set(0,0,0);
    entry.body.wakeUp();
  });

  // Compile all scripts
  E.nodes.forEach(n => { if (n.script) compileScript(n); });

  // Setup play camera
  E.camYaw = E.orbitTheta;
  E.camPitch = 0;
  E.playerInput = {};

  // Enter pointer lock for play
  document.getElementById('main-canvas').requestPointerLock?.();
  E.mouseLocked = true;

  document.getElementById('play-frame').classList.remove('hidden');
  document.getElementById('physics-badge').classList.remove('hidden');
  document.getElementById('mode-badge').textContent = '▶ PLAYING';
  document.getElementById('mode-badge').classList.add('playing');
  document.getElementById('btn-play').style.display = 'none';
  document.getElementById('btn-pause').style.display = '';
  document.body.classList.add('playing');

  E.clock.start();
  log('▶ Play mode started — physics active', 'ok');
}

function pausePlay() {
  E.paused = !E.paused;
  document.getElementById('mode-badge').textContent = E.paused ? '⏸ PAUSED' : '▶ PLAYING';
  log(E.paused ? '⏸ Paused' : '▶ Resumed', 'warn');
}

function stopPlay() {
  if (!E.playing) return;
  E.playing = false; E.paused = false;

  // Exit pointer lock
  document.exitPointerLock?.();
  E.mouseLocked = false;

  // Restore transforms
  if (E.playSnapshot) {
    E.playSnapshot.forEach(s => {
      const n = E.nodes.find(x => x.id === s.id);
      if (!n || !n.mesh) return;
      n.mesh.position.set(s.px, s.py, s.pz);
      n.mesh.rotation.set(s.rx, s.ry, s.rz);
      n.mesh.scale.set(s.sx, s.sy, s.sz);
      if (n.physBody) {
        n.physBody.position.copy(n.mesh.position);
        n.physBody.velocity.set(0,0,0);
        n.physBody.angularVelocity.set(0,0,0);
      }
    });
    E.playSnapshot = null;
  }

  document.getElementById('play-frame').classList.add('hidden');
  document.getElementById('physics-badge').classList.add('hidden');
  document.getElementById('mode-badge').textContent = 'EDITOR';
  document.getElementById('mode-badge').classList.remove('playing');
  document.getElementById('btn-play').style.display = '';
  document.getElementById('btn-pause').style.display = 'none';
  document.body.classList.remove('playing');

  // Restore orbit camera
  syncOrbitCamera();
  log('■ Play mode stopped — scene restored', 'warn');
}

// ── Character Controller ──
function updateCharacterController(delta) {
  if (!E.playerNode || !E.playerNode.physBody) return;
  const body = E.playerNode.physBody;
  const speed = 8;
  const jumpForce = 10;
  const inp = E.playerInput;

  // Movement direction relative to camera yaw
  const angle = E.camYaw;
  let vx = 0, vz = 0;
  if (inp['w'] || inp['arrowup'])    { vx -= Math.sin(angle)*speed; vz -= Math.cos(angle)*speed; }
  if (inp['s'] || inp['arrowdown'])  { vx += Math.sin(angle)*speed; vz += Math.cos(angle)*speed; }
  if (inp['a'] || inp['arrowleft'])  { vx -= Math.cos(angle)*speed; vz += Math.sin(angle)*speed; }
  if (inp['d'] || inp['arrowright']) { vx += Math.cos(angle)*speed; vz -= Math.sin(angle)*speed; }

  body.velocity.x = vx;
  body.velocity.z = vz;

  // Jump
  if ((inp[' '] || inp['space']) && Math.abs(body.velocity.y) < 0.5) {
    body.velocity.y = jumpForce;
  }

  // Camera follows character
  const pos = body.position;
  const camDist = 6, camHeight = 3;
  E.camera.position.set(
    pos.x - Math.sin(E.camYaw) * Math.cos(E.camPitch) * camDist,
    pos.y + camHeight + Math.sin(E.camPitch) * camDist,
    pos.z - Math.cos(E.camYaw) * Math.cos(E.camPitch) * camDist,
  );
  E.camera.lookAt(pos.x, pos.y + 1, pos.z);
  E.playerNode.mesh.rotation.y = E.camYaw + Math.PI;
}

function updateFreePlayCamera(delta) {
  if (E.playerNode) return; // character handles it
  const speed = delta * 10;
  const inp = E.playerInput;
  const dir = new THREE.Vector3();
  E.camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, E.camera.up).normalize();

  if (inp['w']||inp['arrowup'])    E.camera.position.addScaledVector(dir, speed);
  if (inp['s']||inp['arrowdown'])  E.camera.position.addScaledVector(dir,-speed);
  if (inp['a']||inp['arrowleft'])  E.camera.position.addScaledVector(right,-speed);
  if (inp['d']||inp['arrowright']) E.camera.position.addScaledVector(right, speed);
}

// ═══════════════════════════════════════════════
//  SCRIPTING
// ═══════════════════════════════════════════════
const TEMPLATES = {
  rotate: `// Rotate around Y axis
node.mesh.rotation.y += 1.5 * delta;`,
  bounce: `// Bounce up and down
node.mesh.position.y = node.userData.baseY + Math.sin(time * 2) * 0.5;
if (!node.userData.baseY) node.userData.baseY = node.mesh.position.y;`,
  patrol: `// Patrol back and forth
node.userData.t = (node.userData.t||0) + delta;
node.mesh.position.x = (node.userData.startX||0) + Math.sin(node.userData.t) * 3;
if (!node.userData.startX) node.userData.startX = node.mesh.position.x;`,
  player: `// FPS-style movement (manual)
// In play mode, use CharacterBody node for built-in controller
// This script runs every frame during play
const speed = 5 * delta;
if (input.w) node.mesh.position.z -= speed;
if (input.s) node.mesh.position.z += speed;
if (input.a) node.mesh.position.x -= speed;
if (input.d) node.mesh.position.x += speed;`,
  follow: `// Follow the camera position
const cam = scene.camera;
if (cam) {
  node.mesh.position.lerp(cam.position, delta * 2);
}`,
  spinner: `// Spin on all axes
node.mesh.rotation.x += 0.8 * delta;
node.mesh.rotation.y += 1.2 * delta;
node.mesh.rotation.z += 0.4 * delta;`,
};

function compileScript(node) {
  if (!node.script || !node.script.trim()) { node.scriptFn = null; return; }
  try {
    // Create script function with context bindings
    node.scriptFn = new Function('node','scene','delta','time','input','physics',
      `"use strict";\n${node.script}`
    );
    document.getElementById('script-error').textContent = '';
    log(`Script compiled: "${node.name}"`, 'ok');
  } catch(err) {
    node.scriptFn = null;
    document.getElementById('script-error').textContent = `Error: ${err.message}`;
    log(`Script error in "${node.name}": ${err.message}`, 'err');
  }
}

function runScripts(delta, time) {
  const scriptScene = {
    camera: E.camera,
    nodes: E.nodes,
    getNodeByName: name => E.nodes.find(n => n.name === name),
  };
  const physicsAPI = {
    applyForce: (node, x,y,z) => {
      if (node.physBody) node.physBody.applyForce(new CANNON.Vec3(x,y,z), node.physBody.position);
    },
    applyImpulse: (node, x,y,z) => {
      if (node.physBody) node.physBody.applyImpulse(new CANNON.Vec3(x,y,z), node.physBody.position);
    },
    setVelocity: (node, x,y,z) => {
      if (node.physBody) node.physBody.velocity.set(x,y,z);
    },
  };
  E.nodes.forEach(n => {
    if (!n.scriptFn) return;
    try {
      n.scriptFn(n, scriptScene, delta, time, E.playerInput, physicsAPI);
      // Sync physics body if has one
      if (n.physBody && n.physBody.mass > 0) {
        n.physBody.position.copy(n.mesh.position);
      }
    } catch(err) {
      // Silence per-frame errors to avoid spam
    }
  });
}

// ═══════════════════════════════════════════════
//  GIZMO
// ═══════════════════════════════════════════════
function initGizmo() {
  const gc = document.getElementById('gizmo-canvas');
  E.gizmoRenderer = new THREE.WebGLRenderer({ canvas:gc, alpha:true, antialias:true });
  E.gizmoRenderer.setSize(90,90);
  E.gizmoScene = new THREE.Scene();
  E.gizmoCamera = new THREE.PerspectiveCamera(35,1,0.1,100);
  E.gizmoCamera.position.z = 3;
  E.gizmoScene.add(new THREE.AmbientLight(0xffffff,1.5));

  const axes = [
    { dir:[1,0,0], color:0xff4455, rot:[0,0,-Math.PI/2] },
    { dir:[0,1,0], color:0x44ff88, rot:[0,0,0] },
    { dir:[0,0,1], color:0x4488ff, rot:[Math.PI/2,0,0] },
  ];
  axes.forEach(a => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.7,8), new THREE.MeshBasicMaterial({color:a.color}));
    shaft.position.y = .35;
    const head  = new THREE.Mesh(new THREE.ConeGeometry(.1,.25,8), new THREE.MeshBasicMaterial({color:a.color}));
    head.position.y = .825;
    g.add(shaft); g.add(head);
    g.rotation.set(...a.rot);
    E.gizmoScene.add(g);
  });
  E.gizmoScene.add(new THREE.Mesh(new THREE.SphereGeometry(.12,8,6), new THREE.MeshBasicMaterial({color:0x888888})));
}

// ═══════════════════════════════════════════════
//  ORBIT CAMERA
// ═══════════════════════════════════════════════
function syncOrbitCamera() {
  const x = E.orbitRadius * Math.sin(E.orbitPhi) * Math.sin(E.orbitTheta);
  const y = E.orbitRadius * Math.cos(E.orbitPhi);
  const z = E.orbitRadius * Math.sin(E.orbitPhi) * Math.cos(E.orbitTheta);
  E.camera.position.set(
    E.orbitTarget.x + x, E.orbitTarget.y + y, E.orbitTarget.z + z
  );
  E.camera.lookAt(E.orbitTarget);
}

function setViewMode(mode) {
  E.viewMode = mode;
  const d = E.orbitRadius;
  switch(mode) {
    case 'top':   E.camera.position.set(0,d,0.001); E.camera.lookAt(0,0,0); break;
    case 'front': E.camera.position.set(0,0,d);     E.camera.lookAt(0,0,0); break;
    case 'side':  E.camera.position.set(d,0,0);     E.camera.lookAt(0,0,0); break;
    default: syncOrbitCamera();
  }
}

function focusOnSelected() {
  if (!E.selected || !E.selected.mesh) return;
  const p = E.selected.mesh.position;
  E.orbitTarget.copy(p);
  E.orbitRadius = 6;
  syncOrbitCamera();
  log(`Camera focused on "${E.selected.name}"`, 'info');
}

// ═══════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════
function initEvents() {
  const canvas = E.renderer.domElement;

  // Viewport mouse
  canvas.addEventListener('mousedown', e => {
    E.mouseDown = true;
    E.mouseButton = e.button;
    E.lastMouse = { x:e.clientX, y:e.clientY };
    if (e.button === 0 && !E.playing) {
      if (E.tool === 'select') pickAt(e);
      else startDrag(e);
    }
  });

  canvas.addEventListener('mousemove', e => {
    E.mouse = { x:e.clientX, y:e.clientY };
    if (!E.mouseDown) return;
    const dx = e.clientX - E.lastMouse.x;
    const dy = e.clientY - E.lastMouse.y;
    E.lastMouse = { x:e.clientX, y:e.clientY };

    if (E.playing) return;

    // Right drag = orbit
    if (E.mouseButton === 2 && E.viewMode === '3d') {
      E.orbitTheta -= dx * 0.007;
      E.orbitPhi = Math.max(0.05, Math.min(Math.PI-0.05, E.orbitPhi + dy * 0.007));
      syncOrbitCamera();
    }
    // Middle drag = pan
    if (E.mouseButton === 1) {
      const panSpeed = 0.003 * E.orbitRadius;
      const right = new THREE.Vector3();
      E.camera.getWorldDirection(right);
      right.crossVectors(new THREE.Vector3(0,1,0), right).normalize();
      E.orbitTarget.addScaledVector(right, -dx * panSpeed);
      E.orbitTarget.y += dy * panSpeed;
      syncOrbitCamera();
    }
    // Left drag with transform tool
    if (E.mouseButton === 0 && E.tool !== 'select') updateDrag(e);
  });

  canvas.addEventListener('mouseup', e => { E.mouseDown = false; endDrag(); });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!E.playing) {
      E.orbitRadius = Math.max(1, Math.min(100, E.orbitRadius + e.deltaY * 0.02));
      if (E.viewMode === '3d') syncOrbitCamera();
    }
  }, { passive:false });

  // Play mode mouse look
  document.addEventListener('mousemove', e => {
    if (!E.playing || !E.mouseLocked) return;
    E.camYaw   -= e.movementX * 0.003;
    E.camPitch  = Math.max(-1.2, Math.min(1.2, E.camPitch - e.movementY * 0.003));
    if (!E.playerNode) {
      E.camera.rotation.order = 'YXZ';
      E.camera.rotation.y = E.camYaw;
      E.camera.rotation.x = E.camPitch;
    }
  });

  document.addEventListener('pointerlockchange', () => {
    E.mouseLocked = !!document.pointerLockElement;
  });

  // Keyboard
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    // Play mode input
    if (E.playing) {
      E.playerInput[k] = true;
      if (k === 'escape') stopPlay();
      return;
    }
    // Editor shortcuts
    switch(k) {
      case 'q': setTool('select'); break;
      case 'w': setTool('move');   break;
      case 'e': setTool('rotate'); break;
      case 'r': setTool('scale');  break;
      case 'p': startPlay();       break;
      case 'f': focusOnSelected(); break;
      case 'delete': case 'backspace':
        if (E.selected) deleteNode(E.selected);
        break;
      case 'escape': clearSelection(); break;
      case 'd':
        if (e.ctrlKey && E.selected) { e.preventDefault(); duplicateNode(E.selected); }
        break;
    }
  });
  window.addEventListener('keyup', e => {
    E.playerInput[e.key.toLowerCase()] = false;
  });

  // Play/Stop buttons
  document.getElementById('btn-play').onclick  = startPlay;
  document.getElementById('btn-pause').onclick = pausePlay;
  document.getElementById('btn-stop').onclick  = stopPlay;

  // Tool buttons
  document.querySelectorAll('[data-tool]').forEach(b => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });

  // Snap
  document.getElementById('btn-snap').onclick = () => {
    E.snapEnabled = !E.snapEnabled;
    document.getElementById('btn-snap').classList.toggle('active', E.snapEnabled);
    log(`Snap: ${E.snapEnabled ? 'ON ('+E.snapSize+'u)' : 'OFF'}`, 'info');
  };

  // Local/World space
  document.getElementById('btn-local').onclick = () => {
    E.localSpace = !E.localSpace;
    document.getElementById('btn-local').classList.toggle('active', E.localSpace);
    log(`Space: ${E.localSpace ? 'LOCAL' : 'WORLD'}`, 'info');
  };

  // Node add buttons
  document.querySelectorAll('[data-add]').forEach(b => {
    b.addEventListener('click', () => {
      const node = createNode(b.dataset.add, { position:[0, 0.5, 0] });
      selectNode(node);
      log(`Added ${b.dataset.add}: "${node.name}"`, 'ok');
    });
  });

  // Delete/dup buttons
  document.getElementById('del-btn').onclick = () => { if (E.selected) deleteNode(E.selected); };
  document.getElementById('dup-btn').onclick = () => { if (E.selected) duplicateNode(E.selected); };

  // Viewport toggles
  document.getElementById('tog-grid').onchange = e => {
    E.grid.visible = e.target.checked; E.axesH.visible = e.target.checked;
  };
  document.getElementById('tog-wire').onchange = e => {
    E.showWire = e.target.checked;
    E.scene.traverse(o => {
      if (o.isMesh && o !== E.sky && !o.userData.isHelper && o.material?.isMeshStandardMaterial) {
        o.material.wireframe = E.showWire;
      }
    });
  };
  document.getElementById('tog-phys').onchange = e => {
    E.showPhysViz = e.target.checked;
    E.physDebugMeshes.forEach(d => d.mesh.visible = E.showPhysViz);
  };
  document.getElementById('tog-sky').onchange = e => {
    E.sky.visible = e.target.checked;
    E.scene.background = e.target.checked ? null : new THREE.Color(0x0e111a);
  };

  document.getElementById('render-mode').onchange = e => {
    E.renderMode = e.target.value;
    applyRenderMode();
  };

  // Viewport tabs
  document.querySelectorAll('.vp-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.vp-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      setViewMode(t.dataset.vp);
    });
  });

  // Inspector tabs
  document.querySelectorAll('.ins-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.ins-tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.ins-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('ins-' + t.dataset.ins).classList.add('active');
      if (t.dataset.ins === 'physics') renderPhysicsPanel();
      if (t.dataset.ins === 'scene')   renderScenePanel();
    });
  });

  // Bottom tabs
  document.querySelectorAll('.bot-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.bot-tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.bot-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('bot-' + t.dataset.bot).classList.add('active');
    });
  });

  document.getElementById('clear-log').onclick = () => {
    document.getElementById('console-output').innerHTML = '';
    document.getElementById('collision-log').innerHTML = '';
  };

  // Script editor
  document.getElementById('btn-apply-script').onclick = () => {
    if (!E.selected) return;
    E.selected.script = document.getElementById('script-editor').value;
    compileScript(E.selected);
    log(`Script applied to "${E.selected.name}"`, 'ok');
  };
  document.getElementById('btn-clear-script').onclick = () => {
    if (!E.selected) return;
    E.selected.script = '';
    E.selected.scriptFn = null;
    document.getElementById('script-editor').value = '';
    document.getElementById('script-error').textContent = '';
    log(`Script cleared from "${E.selected.name}"`, 'warn');
  };
  document.querySelectorAll('.tmpl').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('script-editor').value = TEMPLATES[b.dataset.tmpl] || '';
    });
  });

  // Context menu
  document.getElementById('ctx-menu').addEventListener('click', e => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    hideContextMenu();
    const action = item.dataset.ctx;
    if (!E.selected && action !== 'delete') return;
    switch(action) {
      case 'duplicate': duplicateNode(E.selected); break;
      case 'focus': focusOnSelected(); break;
      case 'reset-transform':
        if (E.selected?.mesh) {
          E.selected.mesh.position.set(0,0.5,0);
          E.selected.mesh.rotation.set(0,0,0);
          E.selected.mesh.scale.set(1,1,1);
          renderInspector();
          log(`Transform reset: "${E.selected.name}"`, 'info');
        }
        break;
      case 'add-rigidbody':
        if (E.selected) addPhysicsToNode(E.selected, 'dynamic', E.selected.physShape || 'box');
        renderInspector();
        break;
      case 'add-script':
        document.querySelectorAll('.ins-tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.ins-panel').forEach(x => x.classList.remove('active'));
        document.querySelector('[data-ins="script"]').classList.add('active');
        document.getElementById('ins-script').classList.add('active');
        break;
      case 'delete': if (E.selected) deleteNode(E.selected); break;
    }
  });
  document.addEventListener('click', hideContextMenu);

  // Asset item click
  document.querySelectorAll('.asset-item').forEach((item, i) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.asset-item').forEach(x => x.classList.remove('selected'));
      item.classList.add('selected');
      if (E.selected && E.selected.mesh?.material) {
        const mats = Object.values(E.materials);
        if (mats[i]) {
          E.selected.mesh.material = mats[i].clone();
          E.selected._mat = E.selected.mesh.material;
          renderInspector();
        }
      }
    });
  });
}

function showContextMenu(e) {
  const ctx = document.getElementById('ctx-menu');
  ctx.style.left = e.clientX + 'px';
  ctx.style.top  = e.clientY + 'px';
  ctx.classList.add('show');
  e.stopPropagation();
}
function hideContextMenu() {
  document.getElementById('ctx-menu').classList.remove('show');
}

function setTool(t) {
  E.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-tool="${t}"]`);
  if (btn) btn.classList.add('active');
}

function applyRenderMode() {
  E.scene.traverse(o => {
    if (!o.isMesh || o === E.sky || o.userData.isHelper) return;
    if (E.renderMode === 'wireframe') {
      if (!o.userData._origMat) o.userData._origMat = o.material;
      o.material = new THREE.MeshBasicMaterial({ color:0x00d4ff, wireframe:true });
    } else if (E.renderMode === 'normals') {
      if (!o.userData._origMat) o.userData._origMat = o.material;
      o.material = new THREE.MeshNormalMaterial();
    } else if (E.renderMode === 'unlit') {
      if (!o.userData._origMat) o.userData._origMat = o.material;
      o.material = new THREE.MeshBasicMaterial({ color: o.userData._origMat?.color || 0x888888 });
    } else {
      if (o.userData._origMat) { o.material = o.userData._origMat; delete o.userData._origMat; }
    }
  });
}

// ═══════════════════════════════════════════════
//  INSPECTOR
// ═══════════════════════════════════════════════
function renderInspector() {
  const body = document.getElementById('inspector-body');
  if (!E.selected) { body.innerHTML = '<div class="empty-state">Select a node to inspect</div>'; return; }
  const node = E.selected;
  const obj = node.mesh;
  body.innerHTML = '';

  // Type tag
  let tagClass = 'mesh';
  if (node.type?.startsWith('light')) tagClass = 'light';
  if (node.type?.includes('rigid') || node.type === 'staticbody' || node.type === 'character') tagClass = 'physics';
  if (node.type === 'camera_node') tagClass = 'camera';
  if (node.type === 'trigger_box') tagClass = 'trigger';
  body.insertAdjacentHTML('beforeend', `<div class="tag ${tagClass}">${node.type?.toUpperCase()}</div>`);

  // General
  buildCmpBlock(body, 'NODE', [
    buildNameRow('Name', node.name, v => { node.name = v; refreshHierarchy(); }),
  ]);

  // Transform
  if (obj) {
    buildCmpBlock(body, 'TRANSFORM', [
      buildVec3('Position', obj.position, (a,v) => {
        obj.position[a] = v;
        if (node.physBody) { node.physBody.position.copy(obj.position); node.physBody.velocity.set(0,0,0); }
        if (outlineBox) outlineBox.update();
      }),
      buildVec3('Rotation', {
        x: THREE.MathUtils.radToDeg(obj.rotation.x),
        y: THREE.MathUtils.radToDeg(obj.rotation.y),
        z: THREE.MathUtils.radToDeg(obj.rotation.z),
      }, (a,v) => {
        obj.rotation[a] = THREE.MathUtils.degToRad(v);
        if (outlineBox) outlineBox.update();
      }),
      buildVec3('Scale', obj.scale, (a,v) => {
        obj.scale[a] = Math.max(0.001, v);
        if (outlineBox) outlineBox.update();
      }),
    ]);
  }

  // Material
  if (obj?.isMesh && obj.material?.isMeshStandardMaterial && !node.type?.startsWith('light')) {
    const mat = obj.material;
    buildCmpBlock(body, 'MATERIAL', [
      buildColorRow('Albedo', mat.color, c => mat.color.setHex(parseInt(c.replace('#',''),16))),
      buildSlider('Roughness', mat.roughness, 0, 1, .01, v => mat.roughness = v),
      buildSlider('Metalness', mat.metalness, 0, 1, .01, v => mat.metalness = v),
      buildSlider('Opacity', mat.opacity ?? 1, 0, 1, .01, v => { mat.transparent = v<1; mat.opacity = v; }),
      buildColorRow('Emissive', mat.emissive, c => mat.emissive.setHex(parseInt(c.replace('#',''),16))),
      buildSlider('Emissive Int.', mat.emissiveIntensity ?? 0, 0, 5, .05, v => mat.emissiveIntensity = v),
    ]);
  }

  // Light properties
  if (node.type?.startsWith('light') && node.lightObj) {
    const light = node.lightObj;
    buildCmpBlock(body, 'LIGHT', [
      buildColorRow('Color', light.color, c => light.color.setHex(parseInt(c.replace('#',''),16))),
      buildSlider('Intensity', light.intensity, 0, 10, .05, v => light.intensity = v),
      ...(light.distance !== undefined ? [buildSlider('Range', light.distance||15, 0, 100, .5, v => light.distance = v)] : []),
      buildCheckRow('Cast Shadow', light.castShadow, v => light.castShadow = v),
    ]);
  }

  // Physics Component
  if (node.hasPhysics) {
    const body = node.physBody;
    buildCmpBlock(body, 'PHYSICS BODY', [
      buildSelectRow('Type', node.physType||'dynamic', ['dynamic','static','kinematic'], v => {
        node.physType = v;
        if (body) body.mass = v==='dynamic' ? (node.physMass||1) : 0;
      }),
      buildSelectRow('Shape', node.physShape||'box', ['box','sphere','cylinder'], v => {
        node.physShape = v;
        addPhysicsToNode(node, node.physType||'dynamic', v);
        renderInspector();
      }),
      buildSlider('Mass', node.physMass||1, 0.1, 100, .1, v => {
        node.physMass = v;
        if (body && body.mass > 0) body.mass = v;
      }),
      buildCheckRow('Gravity', !body?.sleepSpeedLimit, v => {
        if (body) body.linearDamping = v ? 0.1 : 0.99;
      }),
    ]);
  } else if (!node.type?.startsWith('light') && node.type !== 'camera_node') {
    const addBtn = document.createElement('button');
    addBtn.className = 'cmp-add-btn';
    addBtn.textContent = '⚙ Add Physics Body';
    addBtn.onclick = () => {
      addPhysicsToNode(node, 'dynamic', 'box');
      renderInspector();
    };
    document.getElementById('inspector-body').appendChild(addBtn);
  }

  // Trigger
  if (node.type !== 'trigger_box') return;
  buildCmpBlock(body, 'TRIGGER', [
    buildCheckRow('Is Trigger', node.isTrigger, v => node.isTrigger = v),
  ]);
}

function updateInspectorLive() {
  if (!E.selected || !E.selected.mesh) return;
  const inputs = document.querySelectorAll('.ninp');
  const obj = E.selected.mesh;
  inputs.forEach(inp => {
    const ctx = inp.dataset.ctx;
    const ax  = inp.dataset.ax;
    if (!ctx || !ax) return;
    if (ctx === 'pos') inp.value = obj.position[ax].toFixed(3);
    if (ctx === 'rot') inp.value = THREE.MathUtils.radToDeg(obj.rotation[ax]).toFixed(2);
    if (ctx === 'scl') inp.value = obj.scale[ax].toFixed(3);
  });
}

// Inspector builders
function buildCmpBlock(parent, title, rows) {
  const block = document.createElement('div');
  block.className = 'cmp-block';
  const hdr = document.createElement('div');
  hdr.className = 'cmp-header';
  hdr.innerHTML = `<span>${title}</span><span class="cmp-arrow">▾</span>`;
  block.appendChild(hdr);
  const bdy = document.createElement('div');
  bdy.className = 'cmp-body';
  rows.forEach(r => { if (r) bdy.appendChild(r); });
  block.appendChild(bdy);
  hdr.addEventListener('click', () => {
    hdr.classList.toggle('collapsed');
    bdy.classList.toggle('collapsed');
  });
  // Need to append to inspector body, not parent param which may be string
  document.getElementById('inspector-body').appendChild(block);
}

function buildNameRow(label, val, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const inp = el('input'); inp.type='text'; inp.className='name-inp'; inp.value=val;
  inp.addEventListener('change', () => cb(inp.value));
  row.appendChild(inp); return row;
}

function buildVec3(label, vec, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const wrap = div('prop-val');
  const ctxMap = { Position:'pos', Rotation:'rot', Scale:'scl' };
  ['x','y','z'].forEach(a => {
    const lbl = el('span'); lbl.className=`ax ${a}`; lbl.textContent=a.toUpperCase();
    const inp = el('input'); inp.type='number'; inp.className='ninp'; inp.step='0.01';
    inp.value = parseFloat(vec[a]).toFixed(3);
    inp.dataset.ctx = ctxMap[label]||''; inp.dataset.ax = a;
    inp.addEventListener('change', () => cb(a, parseFloat(inp.value)||0));
    wrap.appendChild(lbl); wrap.appendChild(inp);
  });
  row.appendChild(wrap); return row;
}

function buildColorRow(label, color, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const inp = el('input'); inp.type='color'; inp.className='cinp';
  const hex = color.getHex ? color.getHex() : (typeof color === 'number' ? color : 0x888888);
  inp.value = '#' + hex.toString(16).padStart(6,'0');
  inp.addEventListener('input', () => cb(inp.value));
  row.appendChild(inp); return row;
}

function buildSlider(label, val, min, max, step, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const wrap = div('prop-val');
  const slider = el('input'); slider.type='range'; slider.className='sinp';
  slider.min=min; slider.max=max; slider.step=step; slider.value=val;
  const disp = el('span'); disp.className='sval'; disp.textContent=parseFloat(val).toFixed(2);
  slider.addEventListener('input', () => { const v=parseFloat(slider.value); disp.textContent=v.toFixed(2); cb(v); });
  wrap.appendChild(slider); wrap.appendChild(disp);
  row.appendChild(wrap); return row;
}

function buildSelectRow(label, val, opts, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const sel = el('select'); sel.className='sel';
  opts.forEach(o => { const opt=el('option'); opt.value=o; opt.textContent=o; if(o===val) opt.selected=true; sel.appendChild(opt); });
  sel.addEventListener('change', () => cb(sel.value));
  row.appendChild(sel); return row;
}

function buildCheckRow(label, val, cb) {
  const row = div('prop-row');
  row.innerHTML = `<span class="prop-lbl">${label}</span>`;
  const inp = el('input'); inp.type='checkbox'; inp.className='chk'; inp.checked=!!val;
  inp.addEventListener('change', () => cb(inp.checked));
  row.appendChild(inp); return row;
}

function div(cls) { const d = document.createElement('div'); d.className=cls; return d; }
function el(tag)  { return document.createElement(tag); }

// ═══════════════════════════════════════════════
//  PHYSICS PANEL
// ═══════════════════════════════════════════════
function renderPhysicsPanel() {
  const panel = document.getElementById('physics-global-panel');
  panel.innerHTML = '';
  const sections = [
    ['WORLD', [
      ['Gravity X', E.physWorld.gravity.x, -50, 50, .5, v => E.physWorld.gravity.x = v],
      ['Gravity Y', E.physWorld.gravity.y, -50, 50, .5, v => E.physWorld.gravity.y = v],
      ['Gravity Z', E.physWorld.gravity.z, -50, 50, .5, v => E.physWorld.gravity.z = v],
    ]],
    ['SIMULATION', [
      ['Iterations', E.physWorld.solver.iterations, 1, 30, 1, v => E.physWorld.solver.iterations = v],
      ['Friction', E.physWorld.defaultContactMaterial.friction, 0, 2, .01, v => E.physWorld.defaultContactMaterial.friction = v],
      ['Restitution', E.physWorld.defaultContactMaterial.restitution, 0, 2, .01, v => E.physWorld.defaultContactMaterial.restitution = v],
    ]],
  ];
  sections.forEach(([title, props]) => {
    const lbl = document.createElement('div');
    lbl.className = 'phys-section-label'; lbl.textContent = title;
    panel.appendChild(lbl);
    props.forEach(([name, val, min, max, step, cb]) => {
      const r = buildSlider(name.substring(0,8), val, min, max, step, cb);
      r.querySelector('.prop-lbl').title = name;
      panel.appendChild(r);
    });
  });

  // Body list
  const lbl2 = document.createElement('div');
  lbl2.className = 'phys-section-label'; lbl2.textContent = 'ACTIVE BODIES';
  panel.appendChild(lbl2);
  if (!E.physBodies.length) {
    const e = document.createElement('div'); e.style.cssText='color:var(--txt3);font-size:10px;padding:4px 0';
    e.textContent='No physics bodies in scene'; panel.appendChild(e);
  }
  E.physBodies.forEach(entry => {
    const d = document.createElement('div');
    d.style.cssText='display:flex;gap:6px;align-items:center;padding:3px 0;font-size:10px;color:var(--txt2)';
    d.innerHTML = `<span style="color:var(--acc5)">⚙</span><span style="flex:1">${entry.node.name}</span><span style="color:var(--txt3)">${entry.type}/${entry.shape}</span>`;
    panel.appendChild(d);
  });
}

// ═══════════════════════════════════════════════
//  SCENE PANEL
// ═══════════════════════════════════════════════
function renderScenePanel() {
  const panel = document.getElementById('scene-settings-panel');
  panel.innerHTML = '';
  const items = [
    ['Environment', [
      ['Sky Visible', E.sky.visible, v => { E.sky.visible=v; document.getElementById('tog-sky').checked=v; },'check'],
      ['Fog Density', E.scene.fog?.density||0.018, 0, 0.1, .001, v => { if(E.scene.fog) E.scene.fog.density=v; },'slider'],
      ['Ambient Int.', E.ambient.intensity, 0, 3, .05, v => E.ambient.intensity=v,'slider'],
      ['Sun Int.', E.sun.intensity, 0, 5, .05, v => E.sun.intensity=v,'slider'],
    ]],
    ['Renderer', [
      ['Exposure', E.renderer.toneMappingExposure, 0, 3, .05, v => E.renderer.toneMappingExposure=v,'slider'],
      ['Shadows', E.renderer.shadowMap.enabled, v => E.renderer.shadowMap.enabled=v,'check'],
    ]],
  ];
  items.forEach(([title, props]) => {
    const lbl = document.createElement('div');
    lbl.className = 'phys-section-label'; lbl.textContent = title;
    panel.appendChild(lbl);
    props.forEach(arr => {
      const [name, val, ...rest] = arr;
      const type = rest[rest.length-1];
      let row;
      if (type === 'check') {
        row = buildCheckRow(name.substring(0,10), val, rest[0]);
      } else {
        const [min, max, step, cb] = rest;
        row = buildSlider(name.substring(0,10), val, min, max, step, cb);
        row.querySelector('.prop-lbl').title = name;
      }
      panel.appendChild(row);
    });
  });
}

// ═══════════════════════════════════════════════
//  HIERARCHY
// ═══════════════════════════════════════════════
function refreshHierarchy() {
  const list = document.getElementById('hierarchy-list');
  list.innerHTML = '';
  E.nodes.forEach(node => {
    const item = document.createElement('div');
    item.className = 'h-item' + (E.selected === node ? ' selected' : '');
    const icon = NODE_ICONS[node.type] || '◻';
    const physBadge = node.hasPhysics ? `<span class="h-phys">⚙</span>` : '';
    const scriptBadge = node.script ? `<span class="h-phys" style="color:var(--acc3)">📝</span>` : '';
    item.innerHTML = `
      <span class="h-icon">${icon}</span>
      <span class="h-name">${node.name}</span>
      ${physBadge}${scriptBadge}
      <span class="h-vis" data-id="${node.id}">${node.visible?'👁':'○'}</span>
    `;
    item.addEventListener('click', e => {
      if (e.target.classList.contains('h-vis')) return;
      selectNode(node);
    });
    item.querySelector('.h-vis').addEventListener('click', e => {
      e.stopPropagation();
      node.visible = !node.visible;
      const obj = node.mesh || node._proxy;
      if (obj) obj.visible = node.visible;
      if (node.helper) node.helper.visible = node.visible;
      if (node.lightObj) node.lightObj.visible = node.visible;
      refreshHierarchy();
    });
    list.appendChild(item);
  });
}

// ═══════════════════════════════════════════════
//  DEFAULT SCENE
// ═══════════════════════════════════════════════
function buildDefaultScene() {
  // Ground
  createNode('plane', { name:'Ground', position:[0,0,0], scale:[15,1,15], matId:'ground' });

  // Static platform
  createNode('staticbody', { name:'Platform', position:[0,0.25,0], scale:[8,0.5,8], matId:'ground' });

  // Dynamic boxes
  createNode('rigidbody_box', { name:'Box_Red', position:[-2,3,0], matId:'red' });
  createNode('rigidbody_box', { name:'Box_Blue', position:[0,4,0], matId:'blue' });
  createNode('rigidbody_sphere', { name:'Ball', position:[2,5,0], matId:'metal' });

  // Character
  createNode('character', { name:'Player', position:[0,1.5,4], matId:'green' });

  // Lights
  createNode('light_point', { name:'PointLight', position:[5,5,5] });
  createNode('light_dir', { name:'SunLight', position:[10,15,8] });

  // Trigger zone
  createNode('trigger_box', { name:'WinZone', position:[-4,0.5,-4], scale:[2,2,2] });

  // Spawn point
  createNode('spawn_point', { name:'SpawnPoint', position:[0,0.5,6] });

  // Decorative torus with script
  const t = createNode('torus', { name:'Spinner', position:[4,2,-2], matId:'emissive' });
  t.script = TEMPLATES.spinner;
  compileScript(t);

  log('Default scene loaded: 11 nodes, 4 physics bodies', 'ok');
  log('Press P to play — WASD to move Player — ESC to stop', 'info');
  log('Right-click viewport for context menu', 'info');
}

// ═══════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(E.clock.getDelta(), 0.05);
  const t  = E.clock.elapsedTime;

  if (E.playing && !E.paused) {
    stepPhysics(dt);
    runScripts(dt, t);
    updateCharacterController(dt);
    updateFreePlayCamera(dt);
  }

  // Sync light helpers
  E.nodes.forEach(n => {
    if (n.helper && n.helper.update) n.helper.update();
    if (n._proxy && n.lightObj) n._proxy.position.copy(n.lightObj.position);
    if (n._proxy && n._cam)     n._proxy.position.copy(n._cam.position);
  });

  // Update outline
  if (outlineBox) outlineBox.update();

  // FPS counter
  E.frameN++;
  if (t - E.lastFPS > 0.5) {
    E.fps = Math.round(E.frameN / (t - E.lastFPS));
    E.frameN = 0; E.lastFPS = t;
    document.getElementById('fps-display').textContent = E.fps + ' FPS';
  }

  // Tri count
  let tris = 0;
  E.scene.traverse(o => { if (o.isMesh && o.geometry?.index) tris += o.geometry.index.count / 3; });
  document.getElementById('tri-display').textContent = Math.round(tris) + ' tris';

  E.renderer.render(E.scene, E.camera);

  // Gizmo
  E.gizmoCamera.position.copy(E.camera.position).sub(E.orbitTarget).normalize().multiplyScalar(3);
  E.gizmoCamera.lookAt(0,0,0);
  E.gizmoRenderer.render(E.gizmoScene, E.gizmoCamera);
}

// ═══════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════
function resize() {
  const wrap = document.getElementById('viewport-container');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  E.renderer.setSize(w, h);
  E.camera.aspect = w / h;
  E.camera.updateProjectionMatrix();
}

// ═══════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════
function log(msg, type='info') {
  const out = document.getElementById('console-output');
  const now = new Date();
  const t = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.innerHTML = `<span class="log-t">${t}</span>${msg}`;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
  // Keep max 200 lines
  while (out.children.length > 200) out.removeChild(out.firstChild);
}

function colLog(msg) {
  const out = document.getElementById('collision-log');
  const line = document.createElement('div');
  line.className = 'col-line';
  line.textContent = msg;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
  while (out.children.length > 100) out.removeChild(out.firstChild);
}

function updateObjCount() {
  document.getElementById('tri-display').textContent = E.nodes.length + ' nodes';
}

// ═══════════════════════════════════════════════
//  INIT UI
// ═══════════════════════════════════════════════
function initUI() {
  renderPhysicsPanel();
  renderScenePanel();
}

// ═══════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE === 'undefined' || typeof CANNON === 'undefined') {
    document.body.innerHTML = '<div style="color:#ff3860;padding:40px;font-family:monospace;font-size:14px">ERROR: Three.js or Cannon.js failed to load. Please check your internet connection.</div>';
    return;
  }
  init();
});
