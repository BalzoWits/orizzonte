// Orizzonte: scena a oggetti, vista 3D (three.js) con gizmo, pannelli, anteprima e render finale.
import * as THREE from '../lib/three.module.js';
import { OrbitControls } from '../lib/OrbitControls.js';
import { TransformControls } from '../lib/TransformControls.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const SUN_POWER = 12;
const STORE = 'orizzonte-scena-v2';
const QP = new URLSearchParams(location.search);
const TEST_MAXPX = parseInt(QP.get('px')) || 0;

const PALETTES = {
  alpino: { name: 'Alpino', low: '#4a6430', mid: '#6f6a45', rock: '#77706a', snow: '#f3f5f8', sand: '#bcae88', snowLine: 0.68, rockSlope: 0.30 },
  tropicale: { name: 'Tropicale', low: '#3d7a2c', mid: '#2f5e24', rock: '#5f574d', snow: '#7a8a4a', sand: '#e6d6a8', snowLine: 2.0, rockSlope: 0.42 },
  deserto: { name: 'Deserto', low: '#c89565', mid: '#b5764a', rock: '#a35e3b', snow: '#e8d2b0', sand: '#dcb582', snowLine: 2.0, rockSlope: 0.22 },
  autunno: { name: 'Autunno', low: '#7d6a2a', mid: '#8f4a22', rock: '#6c645c', snow: '#eef0f2', sand: '#b9a47c', snowLine: 0.85, rockSlope: 0.33 },
  vulcanico: { name: 'Vulcanico', low: '#2e2a28', mid: '#3d3532', rock: '#1e1b1a', snow: '#dfe2e6', sand: '#3b3735', snowLine: 0.8, rockSlope: 0.28 },
  artico: { name: 'Artico', low: '#9aa5ae', mid: '#dfe6ee', rock: '#4f555d', snow: '#f5f8fb', sand: '#8f989f', snowLine: 0.2, rockSlope: 0.38 },
  alieno: { name: 'Alieno', low: '#a274c2', mid: '#62a8b2', rock: '#5d6894', snow: '#d6f4ff', sand: '#d89aba', snowLine: 0.75, rockSlope: 0.30 },
};
const ATMOS = {
  terra: { name: 'Terrestre', r: [5.8e-6, 13.5e-6, 33.1e-6] },
  densa: { name: 'Terrestre densa', r: [11.6e-6, 27e-6, 66.2e-6] },
  marte: { name: 'Marziana', r: [12e-6, 7e-6, 3e-6] },
  viola: { name: 'Aliena viola', r: [10e-6, 2.5e-6, 16e-6] },
  verde: { name: 'Aliena verde', r: [3e-6, 12e-6, 6e-6] },
};
const FORMATS = { '16:9': [16, 9], '3:2': [3, 2], '4:3': [4, 3], '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16], '21:9': [21, 9] };
const SHAPES = { 0: 'Sfera', 1: 'Cubo', 2: 'Cilindro' };
const MATERIALS = { 0: 'Opaco', 1: 'Metallo', 2: 'Vetro', 3: 'Luce' };
const STYLES = [
  { name: 'Fotorealistico', desc: 'Luce indiretta e ombre morbide. Il più lento.', bounces: 4 },
  { name: 'Classico', desc: 'Ombre nette e colori pieni, da raytracer anni ’90.', bounces: 6 },
  { name: 'Illustrato', desc: 'Bande di colore e contorni a inchiostro.', bounces: 6 },
];
const TYPE_NAMES = { terrain: 'Terreno', water: 'Acqua', ground: 'Suolo', clouds: 'Nuvole', prim: 'Oggetto' };
const ICONS = {
  terrain: '<path d="M2 20l6-10 4 6 3-4 7 8z"/>',
  water: '<path d="M2 10c3-3 5 3 8 0s5 3 8 0 4-1 4-1M2 16c3-3 5 3 8 0s5 3 8 0 4-1 4-1"/>',
  clouds: '<path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  ground: '<path d="M2 17l5-5h15l-5 5zM2 21h15"/>',
  0: '<circle cx="12" cy="12" r="8"/>',
  1: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  2: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};

// ---------- oggetti della scena ----------
let uidN = 0;
const uid = () => 'o' + Date.now().toString(36) + (uidN++).toString(36);
function mkTerrain(o) {
  return Object.assign({
    id: uid(), type: 'terrain', name: 'Terreno', x: 0, y: 0, z: 0, rot: 0, w: 16000, d: 16000, h: 2200,
    gen: { type: 'montagne', seed: 7, scale: 0.45, roughness: 0.55, erosion: 0.6, terraces: 0 },
    palette: 'alpino', snowLine: 0.68, rockSlope: 0.30,
  }, o);
}
function withPalette(t, key) { const p = PALETTES[key]; t.palette = key; t.snowLine = p.snowLine; t.rockSlope = p.rockSlope; return t; }
const mkWater = o => Object.assign({ id: uid(), type: 'water', name: 'Acqua', y: 200, color: '#1f5868', clarity: 0.4, waves: 0.4 }, o);
const mkGround = o => Object.assign({ id: uid(), type: 'ground', name: 'Suolo', y: 0, color: '#6e6650' }, o);
const mkClouds = o => Object.assign({ id: uid(), type: 'clouds', name: 'Nuvole', y: 2900, thickness: 1400, cover: 0.4, density: 0.5, scale: 7000 }, o);
function mkPrim(shape, o) {
  return Object.assign({
    id: uid(), type: 'prim', shape, name: SHAPES[shape], x: 0, y: 0, z: 0, sx: 100, sy: 100, sz: 100, rx: 0, ry: 0, rz: 0,
    material: 0, color: '#c9c2b8', rough: 0.05, emit: 8,
  }, o);
}

function baseState() {
  return {
    objects: [],
    sky: { sunElev: 22, sunAzim: 200, sunSize: 0.8, atmos: 'terra', clarity: 0.7, fog: 0.25, fogHeight: 900, skyLight: 1.8 },
    camera: { pos: [6000, 1500, 6000], target: [0, 300, 0], focal: 35, blur: 0, focus: 0, snap: null },
    render: { format: '16:9', size: 1920, samples: 256, style: 0, exposure: 1, contrast: 1, saturation: 1, vignette: 0.25, detail: 512 },
    view: { shading: 'material' },
  };
}
// snap: la camera si piazza dopo la generazione dei terreni (orbita attorno a tx,tz sulla superficie)
const camSnap = (yaw, pitch, dist, tx = 0, tz = 0) => ({ yaw, pitch, dist, tx, tz });

const PRESETS = [
  {
    name: 'Valle alpina', desc: 'Montagne erose, lago e luce del pomeriggio', make() {
      const s = baseState();
      s.objects = [mkGround({ color: '#5d5a44' }), withPalette(mkTerrain({ gen: { type: 'montagne', seed: 11, scale: 0.4, roughness: 0.55, erosion: 0.7, terraces: 0 }, h: 2400 }), 'alpino'),
        mkWater({ y: 190, color: '#24525c', clarity: 0.35 }), mkClouds()];
      Object.assign(s.sky, { sunElev: 16, sunAzim: 120, fog: 0.3, fogHeight: 700 });
      s.camera.snap = camSnap(0.9, 0.1, 7000);
      return s;
    }
  },
  {
    name: 'Isola tropicale', desc: 'Acqua limpida, sole alto, nuvole basse', make() {
      const s = baseState();
      s.objects = [mkGround({ color: '#c9b98f' }), withPalette(mkTerrain({ gen: { type: 'isola', seed: 4, scale: 0.35, roughness: 0.55, erosion: 0.5, terraces: 0 }, h: 1100 }), 'tropicale'),
        mkWater({ y: 220, color: '#1f9aa0', clarity: 0.85, waves: 0.35 }), mkClouds({ y: 1500, thickness: 900, cover: 0.35, scale: 4000 })];
      Object.assign(s.sky, { sunElev: 48, sunAzim: 160, clarity: 0.85, fog: 0.12 });
      s.camera.snap = camSnap(0.3, 0.22, 9500);
      return s;
    }
  },
  {
    name: 'Canyon al tramonto', desc: 'Altipiani a gradoni e sole radente', make() {
      const s = baseState();
      s.objects = [mkGround({ color: '#b07a4e' }), withPalette(mkTerrain({ gen: { type: 'canyon', seed: 21, scale: 0.5, roughness: 0.55, erosion: 0.45, terraces: 0 }, h: 1300 }), 'deserto'),
        mkClouds({ cover: 0.2 })];
      Object.assign(s.sky, { sunElev: 9, sunAzim: 165, clarity: 0.5, fog: 0.2, fogHeight: 900 });
      s.camera.snap = camSnap(1.2, 0.08, 4500);
      return s;
    }
  },
  {
    name: 'Pianeta alieno', desc: 'Cielo viola, sfere di vetro e cromo', make() {
      const s = baseState();
      s.objects = [mkGround({ color: '#4a3a5a' }), withPalette(mkTerrain({ gen: { type: 'montagne', seed: 33, scale: 0.55, roughness: 0.55, erosion: 0.8, terraces: 0 }, h: 2800 }), 'alieno'),
        mkWater({ y: 336, color: '#3a1d5a', clarity: 0.6 }), mkClouds(),
        mkPrim(0, { name: 'Sfera di vetro', material: 2, color: '#e8f4ff', sx: 320, sy: 320, sz: 320, x: -500, z: 300, _land: 180 }),
        mkPrim(0, { name: 'Sfera cromata', material: 1, color: '#d8dde3', sx: 240, sy: 240, sz: 240, x: 350, z: -150, _land: 0 })];
      Object.assign(s.sky, { atmos: 'viola', sunElev: 14, sunAzim: 75, sunSize: 1.5, fog: 0.2 });
      s.camera.snap = camSnap(0.2, 0.08, 3200);
      return s;
    }
  },
  {
    name: 'Fiordo nella nebbia', desc: 'Pareti a picco, nebbia bassa, alba fredda', make() {
      const s = baseState();
      const t = withPalette(mkTerrain({ gen: { type: 'montagne', seed: 5, scale: 0.35, roughness: 0.5, erosion: 0.9, terraces: 0 }, h: 2600 }), 'artico');
      t.snowLine = 0.45;
      s.objects = [mkGround({ color: '#3a3f44' }), t, mkWater({ y: 572, color: '#1a3a45', clarity: 0.3, waves: 0.2 }), mkClouds({ y: 2300, thickness: 1200, cover: 0.55 })];
      Object.assign(s.sky, { sunElev: 6, sunAzim: 140, clarity: 0.6, fog: 0.7, fogHeight: 350 });
      s.camera.snap = camSnap(-0.4, 0.06, 8000);
      return s;
    }
  },
  {
    name: 'Sfera sul mare', desc: 'Una sfera cromata, il mare e il tramonto', make() {
      const s = baseState();
      s.objects = [mkGround({ color: '#2e2a28' }), withPalette(mkTerrain({ gen: { type: 'colline', seed: 3, scale: 0.3, roughness: 0.55, erosion: 0.3, terraces: 0 }, h: 600 }), 'vulcanico'),
        mkWater({ y: 330, color: '#123848', clarity: 0.5, waves: 0.5 }), mkClouds({ y: 2000, thickness: 1500, cover: 0.5, density: 0.6 }),
        mkPrim(0, { name: 'Sfera cromata', material: 1, color: '#e6e8ec', sx: 120, sy: 120, sz: 120, _land: 30 })];
      Object.assign(s.sky, { atmos: 'densa', sunElev: 4, sunAzim: 200, clarity: 0.55, fog: 0.15 });
      s.camera.snap = camSnap(0, 0.04, 700);
      return s;
    }
  },
  {
    name: 'Scena vuota', desc: 'Solo suolo e cielo: costruisci tu', make() {
      const s = baseState();
      s.objects = [mkGround()];
      s.camera.snap = camSnap(0.6, 0.15, 1500);
      return s;
    }
  },
];

function mergeDeep(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) mergeDeep(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const s = mergeDeep(baseState(), JSON.parse(raw));
    return Array.isArray(s.objects) ? s : null;
  } catch (e) { return null; }
}
let S = loadState() || PRESETS[0].make();
if (QP.has('scena') && PRESETS[parseInt(QP.get('scena')) - 1]) S = PRESETS[parseInt(QP.get('scena')) - 1].make();
if (QP.has('vista')) S.view.shading = QP.get('vista');
if (QP.has('stile')) S.render.style = clamp(parseInt(QP.get('stile')) || 0, 0, 2);

let saveTimer = 0;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    syncCameraState();
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* niente */ }
  }, 300);
}

// ---------- utilita' ----------
function lin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v / 255, 2.2));
}
function fmtLen(m) { const a = Math.abs(m); return a >= 1000 ? (m / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
const pct = v => Math.round(v * 100) + '%';
function fmtTime(s) {
  if (!isFinite(s)) return '…';
  s = Math.round(s);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  return m + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
}
const findObj = id => S.objects.find(o => o.id === id);
const terrains = () => S.objects.filter(o => o.type === 'terrain');
const prims = () => S.objects.filter(o => o.type === 'prim');
const firstOf = type => S.objects.find(o => o.type === type);

// ---------- path tracer ----------
const cv = $('#cv');
let R;
try { R = new Renderer(cv); } catch (e) {
  $('#fatal').hidden = false; $('#fatal-msg').textContent = e.message; console.error(e);
  throw e;
}

// ---------- vista 3D ----------
const stage = $('#stage');
const vp = $('#vp');
const r3 = new THREE.WebGLRenderer({ canvas: vp, antialias: true, alpha: true, logarithmicDepthBuffer: true });
r3.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
r3.outputColorSpace = THREE.SRGBColorSpace;
const scene3 = new THREE.Scene();
const world = new THREE.Group();
scene3.add(world);
const camera3 = new THREE.PerspectiveCamera(50, 1, 0.5, 600000);
scene3.add(camera3);
const orbit = new OrbitControls(camera3, vp);
orbit.screenSpacePanning = true;
orbit.zoomSpeed = 1.2;
orbit.maxPolarAngle = Math.PI * 0.97;
const tc = new TransformControls(camera3, vp);
tc.setSize(0.9);
scene3.add(tc.getHelper());
const selBox = new THREE.BoxHelper(undefined, 0xf2b45a);
selBox.visible = false;
scene3.add(selBox);

const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2);
const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
const headLight = new THREE.DirectionalLight(0xffffff, 1.6);
headLight.position.set(0.3, 0.6, 1);
camera3.add(headLight);
scene3.add(hemi, sunLight, sunLight.target);

let skyBgTex = null, horizonColor = new THREE.Color(0x9aa8b5);
const nodes = new Map();   // id -> { root, mesh, wire, grid, data }
let selId = null;
let gizmoMode = 'translate';

const GEO = {
  0: new THREE.SphereGeometry(1, 48, 24),
  1: new THREE.BoxGeometry(2, 2, 2),
  2: new THREE.CylinderGeometry(1, 1, 2, 48),
};
const PLANE_GEO = new THREE.PlaneGeometry(400000, 400000).rotateX(-Math.PI / 2);
const WIRE_COLOR = 0xb4bcc6, SEL_COLOR = 0xf2b45a;

function makeNode(o) {
  const root = new THREE.Group();
  root.userData.id = o.id;
  const node = { root, mesh: null, wire: null, grid: null };
  if (o.type === 'terrain') {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    node.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    node.wire = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, color: WIRE_COLOR }));
    root.add(node.mesh, node.wire);
  } else if (o.type === 'prim') {
    node.mesh = new THREE.Mesh(GEO[o.shape], new THREE.MeshStandardMaterial());
    node.wire = new THREE.Mesh(GEO[o.shape], new THREE.MeshBasicMaterial({ wireframe: true, color: WIRE_COLOR }));
    root.add(node.mesh, node.wire);
  } else {
    node.mesh = new THREE.Mesh(PLANE_GEO, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    node.grid = new THREE.GridHelper(400000, 160, 0x667080, 0x4a525c);
    if (o.type === 'water') node.grid.material.color.set(0x5f8fb0);
    if (o.type === 'clouds') node.grid.material.color.set(0xdfe6ee);
    node.grid.material.transparent = true; node.grid.material.opacity = 0.5;
    root.add(node.mesh, node.grid);
  }
  node.mesh.userData.id = o.id;
  world.add(root);
  nodes.set(o.id, node);
  syncNode(o);
  return node;
}
function removeNode(id) {
  const n = nodes.get(id);
  if (!n) return;
  world.remove(n.root);
  if (n.mesh && n.mesh.geometry !== PLANE_GEO && !Object.values(GEO).includes(n.mesh.geometry)) n.mesh.geometry.dispose();
  if (n.wire && n.wire.geometry !== n.mesh.geometry && !Object.values(GEO).includes(n.wire.geometry)) n.wire.geometry.dispose();
  nodes.delete(id);
}

// stato -> trasformazione e materiale del nodo
function syncNode(o) {
  const n = nodes.get(o.id);
  if (!n) return;
  const r = n.root;
  if (o.type === 'terrain') {
    r.position.set(o.x, o.y, o.z); r.rotation.set(0, o.rot, 0); r.scale.set(o.w, o.h, o.d);
  } else if (o.type === 'prim') {
    r.position.set(o.x, o.y, o.z); r.rotation.set(o.rx * DEG, o.ry * DEG, o.rz * DEG); r.scale.set(o.sx, o.sy, o.sz);
    if (n.mesh.geometry !== GEO[o.shape]) { n.mesh.geometry = GEO[o.shape]; n.wire.geometry = GEO[o.shape]; }
  } else {
    r.position.set(0, o.y, 0);
  }
  applyNodeLook(o, n);
}

function applyNodeLook(o, n) {
  const mode = S.view.shading;
  const sel = o.id === selId;
  const wire = mode === 'wire';
  if (n.wire) { n.wire.visible = wire; n.wire.material.color.setHex(sel ? SEL_COLOR : WIRE_COLOR); }
  if (n.grid) { n.grid.visible = wire || (mode === 'solid' && o.type !== 'ground'); }
  n.mesh.visible = !wire;
  let m = n.mesh.material;
  if (o.type === 'clouds') {
    if (!(m instanceof THREE.MeshBasicMaterial)) { m.dispose(); m = n.mesh.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); }
    m.color.set(0xffffff); m.transparent = true; m.depthWrite = false;
    m.opacity = mode === 'material' ? 0.12 + o.cover * 0.35 : 0.12;
    return;
  }
  if (!(m instanceof THREE.MeshStandardMaterial)) { m.dispose(); m = n.mesh.material = new THREE.MeshStandardMaterial(); }
  m.vertexColors = false; m.transparent = false; m.opacity = 1; m.metalness = 0; m.roughness = 0.85;
  m.emissive.setHex(0); m.depthWrite = true; m.side = o.type === 'water' || o.type === 'ground' ? THREE.DoubleSide : THREE.FrontSide;
  if (mode === 'solid') {
    m.color.setHex(o.type === 'water' ? 0x8496a6 : o.type === 'ground' ? 0x8a8a8a : 0xc4c4c4);
    if (o.type === 'water') { m.transparent = true; m.opacity = 0.55; }
  } else if (mode === 'material') {
    if (o.type === 'terrain') { m.color.setHex(0xffffff); m.vertexColors = true; m.roughness = 1; }
    else if (o.type === 'ground') { m.color.setRGB(...lin(o.color)); m.roughness = 1; }
    else if (o.type === 'water') { m.color.setRGB(...lin(o.color).map(v => v * 0.8)); m.roughness = 0.06; m.metalness = 0.1; m.transparent = true; m.opacity = 0.5 + o.clarity * -0.25 + 0.3; }
    else {
      m.color.setRGB(...lin(o.color));
      if (o.material === 1) { m.metalness = 1; m.roughness = Math.max(0.03, o.rough); }
      else if (o.material === 2) { m.transparent = true; m.opacity = 0.3; m.roughness = 0.05; m.metalness = 0.2; }
      else if (o.material === 3) { m.emissive.setRGB(...lin(o.color)); m.emissiveIntensity = Math.min(3, o.emit / 4); }
      else m.roughness = 0.75;
    }
  }
  m.needsUpdate = true;
}

function refreshAllLooks() {
  for (const o of S.objects) { const n = nodes.get(o.id); if (n) applyNodeLook(o, n); }
  updateSelBox();
}

// ---------- terreni: generazione e colori ----------
const terrData = new Map(); // id -> { key, t, grid }
let genQueue = [], genTimer = 0;

function terrainKey(o) { return JSON.stringify([o.gen, S.render.detail]); }
function scheduleGen(o, delay) {
  if (!genQueue.includes(o.id)) genQueue.push(o.id);
  clearTimeout(genTimer);
  genTimer = setTimeout(runGenQueue, delay == null ? 250 : delay);
}
function runGenQueue() {
  if (!genQueue.length) return;
  $('#busy').hidden = false;
  $('#busy-text').textContent = 'Genero il terreno…';
  busy = true;
  setTimeout(() => {
    const id = genQueue.shift();
    const o = findObj(id);
    if (o && o.type === 'terrain') {
      const t = generateHeightmap(Object.assign({}, o.gen, { resolution: S.render.detail }));
      const grid = terrainGrid(t, Math.min(t.N - 1, 256));
      const wireGrid = terrainGrid(t, 48);
      terrData.set(id, { key: terrainKey(o), t, grid });
      const n = nodes.get(id);
      if (n) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(grid.pos, 3));
        g.setIndex(new THREE.BufferAttribute(grid.idx, 1));
        g.computeVertexNormals();
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(grid.pos.length), 3));
        const gw = new THREE.BufferGeometry();
        gw.setAttribute('position', new THREE.BufferAttribute(wireGrid.pos, 3));
        gw.setIndex(new THREE.BufferAttribute(wireGrid.idx, 1));
        if (n.mesh.geometry.type === 'BufferGeometry') n.mesh.geometry.dispose();
        if (n.wire.geometry !== n.mesh.geometry) n.wire.geometry.dispose();
        n.mesh.geometry = g; n.wire.geometry = gw;
        recolorTerrain(o);
      }
      layersDirty = true;
    }
    if (genQueue.length) runGenQueue();
    else {
      busy = false;
      $('#busy').hidden = true;
      afterAllGenerated();
      resetTrace();
    }
  }, 30);
}
function waterY() { const w = firstOf('water'); return w ? w.y : null; }
function recolorTerrain(o) {
  const d = terrData.get(o.id), n = nodes.get(o.id);
  if (!d || !n) return;
  const p = PALETTES[o.palette] || PALETTES.alpino;
  const pal = { low: lin(p.low), mid: lin(p.mid), rock: lin(p.rock), snow: lin(p.snow), sand: lin(p.sand) };
  const col = terrainColors(d.grid, d.t, o, pal, waterY());
  const attr = n.mesh.geometry.getAttribute('color');
  if (attr) { attr.array.set(col); attr.needsUpdate = true; }
  if (o.id === selId) updateSelBox();
}
function recolorAll() { terrains().forEach(recolorTerrain); }

// carica sulla GPU i terreni pronti, uno per layer
let layersDirty = true;
let terLayers = [];
function uploadLayers() {
  terLayers = [];
  for (const o of terrains()) {
    const d = terrData.get(o.id);
    if (!d || terLayers.length >= MAX_TER) continue;
    R.uploadTerrain(terLayers.length, d.t);
    terLayers.push(o.id);
  }
  layersDirty = false;
}

// quota della superficie (terreni, suolo, acqua) sotto x,z
const ray = new THREE.Raycaster();
function surfaceY(x, z, opts) {
  opts = opts || {};
  world.updateMatrixWorld(true);
  const targets = [];
  for (const o of S.objects) {
    if (o.type === 'clouds' || o.type === 'prim' || o.id === opts.exclude) continue;
    if (o.type === 'water' && opts.noWater) continue;
    const n = nodes.get(o.id);
    if (n) targets.push(n.mesh);
  }
  ray.set(new THREE.Vector3(x, 200000, z), new THREE.Vector3(0, -1, 0));
  ray.far = 400000;
  const hit = ray.intersectObjects(targets, false)[0];
  return hit ? hit.point.y : 0;
}

function afterAllGenerated() {
  // oggetti da appoggiare e camera da piazzare (scene pronte)
  for (const o of prims()) {
    if (o._land != null) { o.y = surfaceY(o.x, o.z) + o.sy + o._land; delete o._land; syncNode(o); }
  }
  if (S.camera.snap) {
    const c = S.camera.snap;
    const ty = surfaceY(c.tx, c.tz) + 20;
    orbit.target.set(c.tx, ty, c.tz);
    camera3.position.set(c.tx + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw));
    const g = surfaceY(camera3.position.x, camera3.position.z) + 3;
    if (camera3.position.y < g) camera3.position.y = g;
    S.camera.snap = null;
    orbit.update();
    saveState();
  }
  updateSelBox();
  refreshPanel();
}

// ---------- selezione e gizmo ----------
function select(id) {
  selId = id && findObj(id) ? id : null;
  const o = selId ? findObj(selId) : null;
  if (o) tc.attach(nodes.get(o.id).root); else tc.detach();
  configGizmo();
  refreshAllLooks();
  if (curTab !== 'oggetto' && o) curTab = 'oggetto';
  renderTab();
}
function configGizmo() {
  const o = selId ? findObj(selId) : null;
  if (!o) return;
  let mode = gizmoMode;
  const plane = o.type === 'water' || o.type === 'ground' || o.type === 'clouds';
  if (plane) mode = 'translate';
  tc.setMode(mode);
  tc.setSpace(mode === 'scale' || (o.type === 'prim' && mode === 'rotate') ? 'local' : 'world');
  tc.showX = !plane && !(o.type === 'terrain' && mode === 'rotate');
  tc.showZ = !plane && !(o.type === 'terrain' && mode === 'rotate');
  tc.showY = true;
  document.querySelectorAll('#gizmoModes button').forEach(b => b.classList.toggle('on', b.dataset.gizmo === gizmoMode));
}
function setGizmo(m) { gizmoMode = m; configGizmo(); }
function updateSelBox() {
  const o = selId ? findObj(selId) : null;
  const n = o && nodes.get(o.id);
  if (!n || o.type === 'water' || o.type === 'ground' || o.type === 'clouds' || S.view.shading === 'wire') { selBox.visible = false; return; }
  selBox.setFromObject(n.mesh);
  selBox.visible = true;
}

// gizmo -> stato
function readBack() {
  const o = selId ? findObj(selId) : null;
  if (!o) return;
  const r = nodes.get(o.id).root;
  if (o.type === 'terrain') {
    r.rotation.x = 0; r.rotation.z = 0;
    o.x = r.position.x; o.y = r.position.y; o.z = r.position.z; o.rot = r.rotation.y;
    o.w = Math.max(10, Math.abs(r.scale.x)); o.h = Math.max(1, Math.abs(r.scale.y)); o.d = Math.max(10, Math.abs(r.scale.z));
    r.scale.set(o.w, o.h, o.d);
  } else if (o.type === 'prim') {
    o.x = r.position.x; o.y = r.position.y; o.z = r.position.z;
    o.rx = r.rotation.x / DEG; o.ry = r.rotation.y / DEG; o.rz = r.rotation.z / DEG;
    o.sx = Math.max(0.05, Math.abs(r.scale.x)); o.sy = Math.max(0.05, Math.abs(r.scale.y)); o.sz = Math.max(0.05, Math.abs(r.scale.z));
    r.scale.set(o.sx, o.sy, o.sz);
  } else {
    r.position.x = 0; r.position.z = 0;
    o.y = r.position.y;
  }
  updateSelBox();
}
tc.addEventListener('objectChange', () => { readBack(); resetTrace(true); syncPanelValues(); });
tc.addEventListener('dragging-changed', e => {
  orbit.enabled = !e.value;
  dragging = e.value;
  if (!e.value) {
    const o = selId && findObj(selId);
    if (o && (o.type === 'terrain' || o.type === 'water')) recolorAll();
    resetTrace();
    saveState();
  }
});

// ---------- dimensioni e cornice del render ----------
function aspectFinal() { const f = FORMATS[S.render.format] || FORMATS['16:9']; return f[0] / f[1]; }
function finalSize() {
  const a = aspectFinal(), L = S.render.size;
  return a >= 1 ? [L, Math.round(L / a)] : [Math.round(L * a), L];
}
let cssW = 1, cssH = 1, guideRect = { x: 0, y: 0, w: 1, h: 1 };
let accFast = null, accFull = null, accFinal = null;

function layout() {
  cssW = Math.max(1, stage.clientWidth); cssH = Math.max(1, stage.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  r3.setPixelRatio(dpr);
  r3.setSize(cssW, cssH, false);
  camera3.aspect = cssW / cssH;
  camera3.updateProjectionMatrix();
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  // cornice del formato finale dentro la vista
  const af = aspectFinal(), av = cssW / cssH;
  let gw = cssW, gh = cssW / af;
  if (gh > cssH) { gh = cssH; gw = cssH * af; }
  guideRect = { x: (cssW - gw) / 2, y: (cssH - gh) / 2, w: gw, h: gh };
  const g = $('#guide');
  Object.assign(g.style, { left: guideRect.x + 'px', top: guideRect.y + 'px', width: gw + 'px', height: gh + 'px' });
  // accumulatori della vista render
  let fw = cv.width, fh = cv.height;
  const maxPx = TEST_MAXPX || 2.4e6;
  if (fw * fh > maxPx) { const k = Math.sqrt(maxPx / (fw * fh)); fw = Math.round(fw * k); fh = Math.round(fh * k); }
  const sw = Math.max(8, Math.round(fw * 0.3)), sh = Math.max(8, Math.round(fh * 0.3));
  if (!accFull || accFull.w !== fw || accFull.h !== fh) { R.deleteAccum(accFull); accFull = R.createAccum(fw, fh); }
  if (!accFast || accFast.w !== sw || accFast.h !== sh) { R.deleteAccum(accFast); accFast = R.createAccum(sw, sh); }
  void av;
  resetTrace(false, true);
}

// ---------- scena per lo shader ----------
let scene = null, skyDirty = true, skyImgDirty = true;
function sunDir() {
  const e = S.sky.sunElev * DEG, a = S.sky.sunAzim * DEG;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
function mieCoef() { return 3e-6 + (1 - S.sky.clarity) * 45e-6; }
function sunColor(d) {
  const RE = 6360e3, RA = 6420e3, HR = 8000, HM = 1200;
  const r0 = RE + 2;
  const b = r0 * d[1], c = r0 * r0 - RA * RA;
  const tmax = -b + Math.sqrt(b * b - c);
  if (d[1] < 0 && b * b - (r0 * r0 - RE * RE) > 0) return [0, 0, 0];
  const n = 64, seg = tmax / n;
  let oR = 0, oM = 0;
  for (let i = 0; i < n; i++) {
    const t = seg * (i + 0.5);
    const hgt = Math.hypot(d[0] * t, r0 + d[1] * t, d[2] * t) - RE;
    oR += Math.exp(-hgt / HR) * seg; oM += Math.exp(-hgt / HM) * seg;
  }
  const ray = ATMOS[S.sky.atmos].r, mie = mieCoef();
  return ray.map(r => Math.exp(-(r * oR + mie * 1.1 * oM)) * SUN_POWER);
}

function cameraFor(final) {
  camera3.updateMatrixWorld();
  const e = camera3.matrixWorld.elements;
  const right = [e[0], e[1], e[2]], up = [e[4], e[5], e[6]], fwd = [-e[8], -e[9], -e[10]];
  let tanHalf = Math.tan(camera3.fov * DEG / 2);
  if (final) tanHalf *= Math.min(1, (cssW / cssH) / aspectFinal());
  const pos = camera3.position.toArray();
  const focus = S.camera.focus > 0 ? S.camera.focus : camera3.position.distanceTo(orbit.target);
  return { pos, right, up, fwd, tanHalf, focus, aperture: S.camera.blur * S.camera.blur * 0.03 * focus };
}

function buildScene(final) {
  if (layersDirty) uploadLayers();
  const T = MAX_TER;
  const terPos = new Float32Array(T * 4), terSize = new Float32Array(T * 4), terMat = new Float32Array(T * 2);
  const terLow = new Float32Array(T * 3), terMid = new Float32Array(T * 3), terRock = new Float32Array(T * 3), terSnow = new Float32Array(T * 3), terSand = new Float32Array(T * 3);
  terLayers.forEach((id, i) => {
    const o = findObj(id);
    if (!o) return;
    const p = PALETTES[o.palette] || PALETTES.alpino;
    terPos.set([o.x, o.y, o.z, o.rot], i * 4);
    terSize.set([o.w, o.h, o.d, i], i * 4);
    terMat.set([o.snowLine, o.rockSlope], i * 2);
    terLow.set(lin(p.low), i * 3); terMid.set(lin(p.mid), i * 3); terRock.set(lin(p.rock), i * 3); terSnow.set(lin(p.snow), i * 3); terSand.set(lin(p.sand), i * 3);
  });
  const O = MAX_OBJ;
  const objPos = new Float32Array(O * 4), objScale = new Float32Array(O * 4), objMat = new Float32Array(O * 4), objRot = new Float32Array(O * 9), objEmit = new Float32Array(O);
  const pr = prims().slice(0, O);
  const m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), eul = new THREE.Euler();
  pr.forEach((o, i) => {
    objPos.set([o.x, o.y, o.z, o.shape], i * 4);
    objScale.set([o.sx, o.sy, o.sz, o.material], i * 4);
    objMat.set([...lin(o.color), o.rough], i * 4);
    eul.set(o.rx * DEG, o.ry * DEG, o.rz * DEG, 'XYZ');
    m3.setFromMatrix4(m4.makeRotationFromEuler(eul)).transpose();
    objRot.set(m3.elements, i * 9);
    objEmit[i] = o.emit;
  });
  const gr = firstOf('ground'), wa = firstOf('water'), cl = firstOf('clouds');
  const sd = sunDir();
  const style = S.render.style;
  scene = {
    cam: cameraFor(final), style,
    terCount: terLayers.length, terPos, terSize, terMat, terLow, terMid, terRock, terSnow, terSand,
    groundOn: !!gr, groundY: gr ? gr.y : 0, groundColor: lin(gr ? gr.color : '#6e6650'),
    waterOn: !!wa, waterLevel: wa ? wa.y : 0, waterClarity: wa ? wa.clarity : 0.5, waves: wa ? wa.waves : 0, waterColor: lin(wa ? wa.color : '#1f5868'),
    cloudCover: cl ? cl.cover : 0, cloudDensity: cl ? cl.density : 0.5, cloudBottom: cl ? cl.y : 3000, cloudTop: cl ? cl.y + cl.thickness : 4000, cloudScale: cl ? cl.scale : 7000,
    sunDir: sd, sunColor: sunColor(sd), sunSize: (style === 0 ? S.sky.sunSize : 0.3) * DEG, sunPower: SUN_POWER,
    rayleigh: ATMOS[S.sky.atmos].r, mie: mieCoef(), skyLight: S.sky.skyLight,
    fogDensity: S.sky.fog > 0 ? 0.000003 + Math.pow(S.sky.fog, 2) * 0.0005 : 0, fogFalloff: 1 / S.sky.fogHeight,
    objCount: pr.length, objPos, objScale, objMat, objRot, objEmit,
  };
  return scene;
}

// luci e sfondo della vista "Materiali"
function updateViewLights() {
  const sd = sunDir(), sc = sunColor(sd);
  const mx = Math.max(sc[0], sc[1], sc[2], 1e-6);
  sunLight.color.setRGB(sc[0] / mx, sc[1] / mx, sc[2] / mx);
  sunLight.intensity = 3.2 * Math.min(1, mx / SUN_POWER * 1.4);
  sunLight.position.set(sd[0] * 100000, sd[1] * 100000, sd[2] * 100000);
}
function updateSkyImage() {
  const img = R.skyImage(S.render);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  if (skyBgTex) skyBgTex.dispose();
  skyBgTex = new THREE.CanvasTexture(c);
  skyBgTex.mapping = THREE.EquirectangularReflectionMapping;
  skyBgTex.colorSpace = THREE.SRGBColorSpace;
  // colori medi di orizzonte e zenit per luce emisferica e foschia
  const px = (u, v) => { const x = Math.min(img.width - 1, Math.round(u * img.width)), y = Math.min(img.height - 1, Math.round((1 - v) * img.height)); const k = (y * img.width + x) * 4; return [img.data[k], img.data[k + 1], img.data[k + 2]]; };
  let hr = 0, hg = 0, hb = 0;
  for (let i = 0; i < 16; i++) { const p = px(i / 16, 0.52); hr += p[0]; hg += p[1]; hb += p[2]; }
  horizonColor = new THREE.Color().setRGB(hr / 16 / 255, hg / 16 / 255, hb / 16 / 255, THREE.SRGBColorSpace);
  const z = px(0.5, 0.98);
  hemi.color.setRGB(z[0] / 255, z[1] / 255, z[2] / 255, THREE.SRGBColorSpace);
  skyImgDirty = false;
  applyViewEnv();
}
function applyViewEnv() {
  const mode = S.view.shading;
  if (mode === 'material' && skyBgTex) {
    scene3.background = skyBgTex;
    scene3.environment = skyBgTex;
    const fd = S.sky.fog > 0 ? 0.000003 + Math.pow(S.sky.fog, 2) * 0.0005 : 0;
    scene3.fog = fd > 0 ? new THREE.FogExp2(horizonColor, Math.sqrt(fd / 6000)) : null;
    r3.toneMapping = THREE.ACESFilmicToneMapping;
    r3.toneMappingExposure = S.render.exposure;
    hemi.intensity = 0.9 * S.sky.skyLight / 1.8; hemi.groundColor.setHex(0x3a342c);
    sunLight.visible = true; headLight.visible = false;
  } else {
    scene3.background = mode === 'render' ? null : new THREE.Color(0x393d42);
    scene3.environment = null; scene3.fog = null;
    r3.toneMapping = THREE.NoToneMapping;
    hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0x555555); hemi.intensity = 1.1;
    sunLight.visible = false; headLight.visible = true;
  }
}

// ---------- modalita' della vista ----------
function setShading(m) {
  S.view.shading = m;
  document.querySelectorAll('#shadeModes button').forEach(b => b.classList.toggle('on', b.dataset.shade === m));
  world.visible = m !== 'render';
  cv.style.visibility = m === 'render' || mode === 'final' ? 'visible' : 'hidden';
  if (m === 'render') r3.setClearColor(0x000000, 0); else r3.setClearColor(0x393d42, 1);
  refreshAllLooks();
  applyViewEnv();
  resetTrace();
  saveState();
}

// ---------- ciclo principale ----------
let mode = 'view';        // view | final | done
let lastChange = 0, budget = 250000, lastFrame = 0, needShow = true, finalStart = 0, busy = false, dragging = false;
const PREVIEW_MAX = 128;

function resetTrace(fromDrag, keepFinal) {
  if (mode !== 'view' && !keepFinal) cancelFinal();
  if (accFast) R.clearAccum(accFast);
  if (accFull) R.clearAccum(accFull);
  scene = null;
  lastChange = performance.now();
  needShow = true;
  if (!fromDrag) saveState();
}
function qualityFor(kind) {
  const st = S.render.style;
  if (kind === 'fast') return { bounces: st === 0 ? 1 : 4, cloudSteps: 18, terrainSteps: 200, maxPasses: 1e9, seed: 0 };
  if (kind === 'prev') return { bounces: st === 0 ? 3 : 5, cloudSteps: 40, terrainSteps: 360, maxPasses: PREVIEW_MAX, seed: 0 };
  return { bounces: STYLES[st].bounces, cloudSteps: 72, terrainSteps: 520, maxPasses: S.render.samples, seed: 100000 };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastFrame ? now - lastFrame : 16;
  lastFrame = now;
  if (Math.abs(cssW - stage.clientWidth) > 1 || Math.abs(cssH - stage.clientHeight) > 1) layout();
  if (skyDirty && !busy) {
    R.renderSky(buildScene(mode !== 'view'));
    skyDirty = false;
    updateSkyImage();
    updateViewLights();
  }
  if (!busy && (mode === 'final' || mode === 'done')) {
    if (mode === 'final') {
      if (!scene) buildScene(true);
      adapt(dt, 90);
      R.step(accFinal, scene, qualityFor('final'), budget);
      if (accFinal.passes >= S.render.samples) {
        mode = 'done';
        $('#btnSave').hidden = false;
        $('#btnCancel').textContent = 'Chiudi';
      }
      needShow = true;
    }
    if (needShow) {
      const dpr = cv.width / cssW;
      R.show(accFinal, { x: guideRect.x * dpr, y: (cssH - guideRect.y - guideRect.h) * dpr, w: guideRect.w * dpr, h: guideRect.h * dpr }, S.render);
      updateStatus();
      needShow = false;
    }
    return;
  }
  if (!busy && S.view.shading === 'render') {
    if (!scene) buildScene(false);
    const interacting = now - lastChange < 220 || dragging;
    let shown = null, worked = false;
    if (interacting || (accFull.passes === 0 && accFast.passes < 2)) {
      if (accFast.passes < 6 || !interacting) { R.step(accFast, scene, qualityFor('fast'), accFast.w * accFast.h); worked = true; }
      shown = accFast;
    } else if (accFull.passes < PREVIEW_MAX) {
      adapt(dt, 45);
      R.step(accFull, scene, qualityFor('prev'), budget);
      worked = true;
      shown = accFull.passes > 0 ? accFull : accFast;
    } else shown = accFull;
    if (worked || needShow) { R.show(shown, { x: 0, y: 0, w: cv.width, h: cv.height }, S.render); needShow = false; updateStatus(); }
  } else if (needShow) { updateStatus(); needShow = false; }
  r3.render(scene3, camera3);
}
function adapt(dt, target) {
  if (dt > target * 1.25) budget *= 0.8;
  else if (dt < target * 0.85) budget *= 1.12;
  budget = clamp(budget, 20000, 6e6);
}
function updateStatus() {
  const st = $('#status');
  if (mode === 'view') {
    const names = { wire: 'Fil di ferro', solid: 'Solido', material: 'Materiali', render: 'Render' };
    let t = `Vista ${names[S.view.shading]} · ${S.objects.length} oggetti`;
    if (S.view.shading === 'render') t = accFull.passes > 0 ? `Render nella vista · ${accFull.passes}/${PREVIEW_MAX} campioni` : 'Render nella vista · anteprima veloce';
    st.textContent = t;
    return;
  }
  const [w, h] = finalSize();
  const n = accFinal.passes, tot = S.render.samples;
  const el = (performance.now() - finalStart) / 1000;
  const frac = Math.min(1, (n + accFinal.tile / accFinal.tiles.length) / tot);
  const eta = frac > 0.01 ? el / frac - el : Infinity;
  $('#rb-fill').style.width = (frac * 100).toFixed(1) + '%';
  if (mode === 'done') {
    $('#rb-text').textContent = `Fatto: ${w}×${h}, ${tot} campioni in ${fmtTime(el)}`;
    st.textContent = 'Render completato';
  } else {
    $('#rb-text').textContent = `${w}×${h} · ${n}/${tot} campioni · mancano circa ${fmtTime(eta)}`;
    st.textContent = 'Render in corso · ' + STYLES[S.render.style].name;
  }
}

// ---------- render finale ----------
function startFinal() {
  if (busy) return;
  const [w, h] = finalSize();
  R.deleteAccum(accFinal);
  accFinal = R.createAccum(w, h);
  mode = 'final';
  scene = null;
  finalStart = performance.now();
  budget = Math.max(budget, 150000);
  tc.detach(); selBox.visible = false;
  cv.style.visibility = 'visible';
  $('#renderbar').hidden = false;
  $('#btnSave').hidden = true;
  $('#btnCancel').textContent = 'Annulla';
  $('#btnRender').disabled = true;
  document.body.classList.add('final');
  needShow = true;
}
function cancelFinal() {
  mode = 'view';
  R.deleteAccum(accFinal); accFinal = null;
  $('#renderbar').hidden = true;
  $('#btnRender').disabled = false;
  document.body.classList.remove('final');
  scene = null;
  select(selId);
  setShading(S.view.shading);
}
async function savePNG() {
  if (!accFinal) return;
  const blob = await R.exportPNG(accFinal, S.render);
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  download(blob, `orizzonte-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#btnRender').addEventListener('click', startFinal);
$('#btnCancel').addEventListener('click', cancelFinal);
$('#btnSave').addEventListener('click', savePNG);

// ---------- interazione nella vista ----------
let downX = 0, downY = 0, downOnGizmo = false;
vp.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downOnGizmo = tc.axis !== null && tc.axis !== undefined; });
vp.addEventListener('pointerup', e => {
  if (mode !== 'view' || downOnGizmo) return;
  if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4 || e.button !== 0) return;
  const h = pickAt(e);
  select(h ? h.object.userData.id : null);
});
vp.addEventListener('dblclick', e => {
  if (mode !== 'view') return;
  const h = pickAt(e);
  if (!h) return;
  S.camera.focus = Math.round(h.distance);
  if (S.camera.blur === 0) S.camera.blur = 0.3;
  toast('A fuoco a ' + fmtLen(h.distance));
  resetTrace();
  if (curTab === 'camera') renderTab();
});
vp.addEventListener('contextmenu', e => e.preventDefault());
function pickAt(e) {
  const r = vp.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera3);
  ray.far = Infinity;
  world.updateMatrixWorld(true);
  const meshes = [];
  for (const n of nodes.values()) meshes.push(n.mesh);
  const hits = ray.intersectObjects(meshes, false);
  // le nuvole si scelgono solo se non c'e' altro davanti
  return hits.find(h => findObj(h.object.userData.id)?.type !== 'clouds') || hits[0] || null;
}
orbit.addEventListener('start', () => { dragging = true; });
orbit.addEventListener('end', () => { dragging = false; resetTrace(); });
orbit.addEventListener('change', () => { resetTrace(true); });

function frameSelection() {
  const o = selId && findObj(selId);
  let center, radius;
  if (o && (o.type === 'terrain' || o.type === 'prim')) {
    const b = new THREE.Box3().setFromObject(nodes.get(o.id).mesh);
    const sph = b.getBoundingSphere(new THREE.Sphere());
    center = sph.center; radius = sph.radius;
  } else {
    // niente selezione: inquadra tutti i terreni e gli oggetti
    const b = new THREE.Box3();
    for (const x of S.objects) if (x.type === 'terrain' || x.type === 'prim') b.expandByObject(nodes.get(x.id).mesh);
    if (b.isEmpty()) return;
    const sph = b.getBoundingSphere(new THREE.Sphere());
    center = sph.center; radius = sph.radius;
  }
  const dir = new THREE.Vector3().subVectors(camera3.position, orbit.target).normalize();
  const dist = radius / Math.sin(camera3.fov * DEG / 2) * 1.1;
  orbit.target.copy(center);
  camera3.position.copy(center).addScaledVector(dir, dist);
  orbit.update();
  resetTrace();
}
$('#btnFrame').addEventListener('click', frameSelection);
document.querySelectorAll('#gizmoModes button').forEach(b => b.addEventListener('click', () => setGizmo(b.dataset.gizmo)));
document.querySelectorAll('#shadeModes button').forEach(b => b.addEventListener('click', () => setShading(b.dataset.shade)));

window.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (mode !== 'view') return;
  const k = e.key.toLowerCase();
  if (k === 'w') setGizmo('translate');
  else if (k === 'e') setGizmo('rotate');
  else if (k === 'r' && !e.ctrlKey && !e.metaKey) setGizmo('scale');
  else if (k === 'f') frameSelection();
  else if (k === 'escape') select(null);
  else if (k === 'delete' || k === 'backspace') { if (selId) { e.preventDefault(); deleteObj(selId); } }
  else if (k === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (selId) duplicateObj(selId); }
  else if (k === '1') setShading('wire');
  else if (k === '2') setShading('solid');
  else if (k === '3') setShading('material');
  else if (k === '4') setShading('render');
});

// ---------- crea, duplica, elimina ----------
function nextName(base) {
  const used = new Set(S.objects.map(o => o.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(base + ' ' + i)) return base + ' ' + i;
}
function maxTerrainTop() { return terrains().reduce((m, o) => Math.max(m, o.y + o.h), 0); }
function create(kind) {
  if (mode !== 'view') return;
  const tgt = orbit.target;
  const dist = camera3.position.distanceTo(tgt);
  let o;
  if (kind === 'water' || kind === 'ground' || kind === 'clouds') {
    const ex = firstOf(kind);
    if (ex) { select(ex.id); toast('C’è già: è un piano infinito, l’ho selezionato'); return; }
    const gr = firstOf('ground');
    if (kind === 'water') o = mkWater({ y: Math.round((gr ? gr.y : 0) + Math.max(20, maxTerrainTop() * 0.12)) });
    if (kind === 'ground') o = mkGround({ y: 0 });
    if (kind === 'clouds') o = mkClouds({ y: Math.round(Math.max(1500, maxTerrainTop() + 600)) });
  } else if (kind === 'terrain') {
    if (terrains().length >= MAX_TER) { toast(`Al massimo ${MAX_TER} terreni`); return; }
    const w = Math.round(clamp(dist * 0.9, 300, 30000));
    const gr = firstOf('ground');
    o = mkTerrain({ name: nextName('Terreno'), x: Math.round(tgt.x), z: Math.round(tgt.z), y: gr ? gr.y : 0, w, d: w, h: Math.round(w * 0.22),
      gen: { type: 'montagne', seed: 1 + Math.floor(Math.random() * 99999), scale: 0.4, roughness: 0.55, erosion: 0.6, terraces: 0 } });
    withPalette(o, 'alpino');
  } else {
    if (prims().length >= MAX_OBJ) { toast(`Al massimo ${MAX_OBJ} oggetti`); return; }
    const shape = kind === 'cube' ? 1 : kind === 'cylinder' ? 2 : 0;
    const r = Math.round(clamp(dist * 0.06, 0.5, 5000) * 10) / 10;
    const light = kind === 'light';
    o = mkPrim(shape, {
      name: nextName(light ? 'Luce' : SHAPES[shape]), x: Math.round(tgt.x), z: Math.round(tgt.z), sx: light ? r * 0.4 : r, sy: light ? r * 0.4 : r, sz: light ? r * 0.4 : r,
      material: light ? 3 : shape === 0 ? 1 : 0, color: light ? '#ffd9a0' : shape === 0 ? '#d8dde3' : '#c9c2b8',
    });
    o.y = surfaceY(o.x, o.z) + o.sy + (light ? r * 2 : 0);
  }
  S.objects.push(o);
  makeNode(o);
  if (o.type === 'terrain') scheduleGen(o, 0);
  if (o.type === 'water') recolorAll();
  layersDirty = true;
  select(o.id);
  resetTrace();
}
function deleteObj(id) {
  const i = S.objects.findIndex(o => o.id === id);
  if (i < 0) return;
  const o = S.objects[i];
  S.objects.splice(i, 1);
  removeNode(id);
  terrData.delete(id);
  layersDirty = true;
  if (o.type === 'water') recolorAll();
  select(null);
  resetTrace();
}
function duplicateObj(id) {
  const o = findObj(id);
  if (!o || o.type === 'water' || o.type === 'ground' || o.type === 'clouds') return;
  if (o.type === 'terrain' && terrains().length >= MAX_TER) { toast(`Al massimo ${MAX_TER} terreni`); return; }
  if (o.type === 'prim' && prims().length >= MAX_OBJ) { toast(`Al massimo ${MAX_OBJ} oggetti`); return; }
  const c = JSON.parse(JSON.stringify(o));
  c.id = uid(); c.name = nextName(o.name.replace(/ \d+$/, ''));
  if (c.type === 'terrain') c.x += c.w * 1.02; else c.x += c.sx * 2.6;
  S.objects.push(c);
  makeNode(c);
  if (c.type === 'terrain') {
    const d = terrData.get(o.id);
    if (d) { scheduleGen(c, 0); }
  }
  layersDirty = true;
  select(c.id);
  resetTrace();
}
function landObj(o) {
  if (o.type === 'prim') {
    const b = new THREE.Box3().setFromObject(nodes.get(o.id).mesh);
    const bottom = b.min.y;
    const s = surfaceY(o.x, o.z, { exclude: o.id });
    o.y += s - bottom;
  } else if (o.type === 'terrain') {
    const gr = firstOf('ground');
    o.y = gr ? gr.y : 0;
  }
  syncNode(o);
  updateSelBox();
  recolorAll();
  resetTrace();
  renderTab();
}
document.querySelectorAll('[data-create]').forEach(b => b.addEventListener('click', () => create(b.dataset.create)));

// ---------- toast ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2000);
}

// ---------- pannelli ----------
const body = $('#tabbody');
let curTab = 'oggetto';
if (['oggetto', 'cielo', 'camera', 'render', 'scene'].includes(QP.get('pannello'))) curTab = QP.get('pannello');
let syncRows = [];

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function section(title, hint) {
  const s = el('section', 'sec');
  if (title) s.appendChild(el('h3', null, title));
  if (hint) s.appendChild(el('p', 'hint', hint));
  body.appendChild(s);
  return s;
}
// get/set su un oggetto qualunque (stato o oggetto di scena)
function bind(target, key) { return { get: () => target[key], set: v => { target[key] = v; } }; }
function slider(parent, label, b, min, max, step, onChange, fmt, opts) {
  opts = opts || {};
  const row = el('label', 'ctl');
  const head = el('div', 'ctl-head');
  const val = el('span', 'ctl-val');
  head.append(el('span', 'ctl-name', label), val);
  const inp = document.createElement('input');
  inp.type = 'range';
  const to = v => opts.log ? Math.log(Math.max(v, 1e-6)) : v;
  const from = v => opts.log ? Math.exp(v) : v;
  inp.min = to(min); inp.max = to(max); inp.step = opts.log ? 0.001 : step;
  const show = () => { const v = b.get(); inp.value = to(v); val.textContent = fmt ? fmt(v) : v; };
  show();
  inp.addEventListener('input', () => {
    let v = from(parseFloat(inp.value));
    v = Math.round(v / step) * step;
    b.set(v);
    val.textContent = fmt ? fmt(v) : v;
    onChange(v);
  });
  row.append(head, inp);
  parent.appendChild(row);
  row._sync = show;
  syncRows.push(row);
  return row;
}
function select2(parent, label, b, options, onChange) {
  const row = el('label', 'ctl');
  row.appendChild(el('div', 'ctl-head', `<span class="ctl-name">${label}</span>`));
  const s = document.createElement('select');
  for (const [k, v] of Object.entries(options)) { const o = document.createElement('option'); o.value = k; o.textContent = v; s.appendChild(o); }
  s.value = String(b.get());
  s.addEventListener('change', () => {
    const v = typeof b.get() === 'number' ? Number(s.value) : s.value;
    b.set(v); onChange(v);
  });
  row.appendChild(s);
  parent.appendChild(row);
}
function color(parent, label, b, onChange) {
  const row = el('label', 'ctl ctl-inline');
  row.appendChild(el('span', 'ctl-name', label));
  const c = document.createElement('input');
  c.type = 'color'; c.value = b.get();
  c.addEventListener('input', () => { b.set(c.value); onChange(); });
  row.appendChild(c);
  parent.appendChild(row);
}
function button(parent, label, fn, cls) {
  const b = el('button', 'btn ' + (cls || ''), label);
  b.type = 'button';
  b.addEventListener('click', fn);
  parent.appendChild(b);
  return b;
}
function numbers(parent, fields, onChange) {
  const box = el('div', 'nums');
  for (const f of fields) {
    const l = el('label', null, f.label);
    const i = document.createElement('input');
    i.type = 'number'; i.step = f.step || 1;
    const show = () => { i.value = Math.round(f.b.get() * 10) / 10; };
    show();
    i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v)) { f.b.set(f.min != null ? Math.max(f.min, v) : v); onChange(); } show(); });
    l.appendChild(i);
    box.appendChild(l);
    l._sync = show;
    syncRows.push(l);
  }
  parent.appendChild(box);
}
function syncPanelValues() { for (const r of syncRows) r._sync(); }
function refreshPanel() { renderTab(); }

// effetti dei cambi
const onObj = o => () => { syncNode(o); updateSelBox(); resetTrace(); };
const onTerrainLook = o => () => { syncNode(o); recolorTerrain(o); resetTrace(); };
const onSky = () => { skyDirty = true; resetTrace(); };
const onScene = () => resetTrace();
const onDisplay = () => { needShow = true; skyDirty = true; saveState(); };

const TABS = {
  oggetto() {
    const s = section('Nella scena', S.objects.length ? null : 'Scena vuota: crea qualcosa dalla barra «Crea» qui sopra.');
    const ol = el('div', 'outliner');
    for (const o of S.objects) {
      const ic = o.type === 'prim' ? (o.material === 3 ? ICONS.light : ICONS[o.shape]) : ICONS[o.type];
      const dot = o.type === 'prim' || o.type === 'water' || o.type === 'ground' ? `<i style="background:${o.color}"></i>` : '';
      const b = el('button', 'ol-item' + (o.id === selId ? ' on' : ''), `<svg viewBox="0 0 24 24">${ic}</svg><span>${o.name}</span>${dot}`);
      b.type = 'button';
      b.addEventListener('click', () => select(o.id));
      ol.appendChild(b);
    }
    s.appendChild(ol);
    const o = selId && findObj(selId);
    if (!o) {
      section(null, 'Clic su un oggetto nella vista (o nell’elenco) per selezionarlo: compaiono le frecce per spostarlo. W E R cambiano tra sposta, ruota e scala.');
      return;
    }
    const head = section(o.name);
    const nm = document.createElement('input');
    nm.type = 'text'; nm.value = o.name; nm.className = 'name-in';
    nm.addEventListener('change', () => { o.name = nm.value.trim() || o.name; renderTab(); saveState(); });
    head.appendChild(nm);
    const acts = el('div', 'row');
    if (o.type === 'terrain' || o.type === 'prim') {
      button(acts, 'Appoggia al suolo', () => landObj(o), 'accent');
      button(acts, 'Duplica', () => duplicateObj(o.id));
    }
    button(acts, 'Elimina', () => deleteObj(o.id), 'danger');
    head.appendChild(acts);
    PROPS[o.type](o);
  },
  cielo() {
    const s = section('Sole');
    slider(s, 'Altezza', bind(S.sky, 'sunElev'), -4, 90, 0.5, onSky, v => v.toFixed(1).replace('.', ',') + '°');
    slider(s, 'Direzione', bind(S.sky, 'sunAzim'), 0, 360, 1, onSky, v => Math.round(v) + '°');
    slider(s, 'Ampiezza (ombre morbide)', bind(S.sky, 'sunSize'), 0.3, 6, 0.05, onScene, v => v.toFixed(1).replace('.', ',') + '°');
    const row = el('div', 'row');
    const yawDeg = () => { const d = new THREE.Vector3().subVectors(camera3.position, orbit.target); return Math.atan2(d.x, d.z) / DEG; };
    button(row, 'Sole alle spalle', () => { S.sky.sunAzim = (yawDeg() + 360) % 360; onSky(); renderTab(); });
    button(row, 'Controluce', () => { S.sky.sunAzim = (yawDeg() + 540) % 360; onSky(); renderTab(); });
    s.appendChild(row);
    const s2 = section('Atmosfera');
    select2(s2, 'Tipo', bind(S.sky, 'atmos'), Object.fromEntries(Object.entries(ATMOS).map(([k, v]) => [k, v.name])), onSky);
    slider(s2, 'Limpidezza dell’aria', bind(S.sky, 'clarity'), 0, 1, 0.01, onSky, pct);
    slider(s2, 'Luce del cielo (schiarisce le ombre)', bind(S.sky, 'skyLight'), 0.3, 5, 0.05, () => { applyViewEnv(); onScene(); }, v => v.toFixed(1).replace('.', ','), { log: true });
    slider(s2, 'Foschia', bind(S.sky, 'fog'), 0, 1, 0.01, () => { applyViewEnv(); onScene(); }, pct);
    slider(s2, 'Altezza della foschia', bind(S.sky, 'fogHeight'), 80, 4000, 10, onScene, fmtLen, { log: true });
    section(null, 'Le nuvole, l’acqua e il suolo sono oggetti: li aggiungi dalla barra «Crea» e li regoli selezionandoli.');
  },
  camera() {
    const s = section('Obiettivo', 'Nella vista: sinistro ruota, destro sposta, rotella avvicina. Doppio clic su un punto per metterlo a fuoco.');
    slider(s, 'Lunghezza focale', bind(S.camera, 'focal'), 12, 300, 1, v => { camera3.fov = 2 * Math.atan(12 / v) / DEG; camera3.updateProjectionMatrix(); resetTrace(); }, v => Math.round(v) + ' mm', { log: true });
    const row = el('div', 'row');
    button(row, 'Inquadra tutto', () => { select(null); frameSelection(); });
    s.appendChild(row);
    const s2 = section('Profondità di campo');
    slider(s2, 'Sfocatura', bind(S.camera, 'blur'), 0, 1, 0.01, onScene, v => v === 0 ? 'nessuna' : pct(v));
    slider(s2, 'Distanza di messa a fuoco', { get: () => Math.max(1, S.camera.focus), set: v => { S.camera.focus = v <= 1.5 ? 0 : v; } }, 1, 60000, 1, onScene,
      v => v <= 1.5 ? 'sul centro' : fmtLen(v), { log: true });
  },
  render() {
    const s = section('Stile');
    const box = el('div', 'styles');
    STYLES.forEach((st, i) => {
      const b = el('button', i === S.render.style ? 'on' : '', `<strong>${st.name}</strong><span>${st.desc}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => { S.render.style = i; resetTrace(); renderTab(); });
      box.appendChild(b);
    });
    s.appendChild(box);
    const s1 = section('Immagine finale', 'Il riquadro tratteggiato nella vista mostra cosa finirà nell’immagine.');
    select2(s1, 'Formato', bind(S.render, 'format'), Object.fromEntries(Object.keys(FORMATS).map(k => [k, k])), () => { layout(); saveState(); });
    select2(s1, 'Dimensione (lato lungo)', bind(S.render, 'size'), { 1280: '1280 px', 1920: '1920 px (Full HD)', 2560: '2560 px', 3840: '3840 px (4K)' }, saveState);
    select2(s1, 'Qualità', bind(S.render, 'samples'), { 32: 'Bozza (32 campioni)', 128: 'Media (128)', 256: 'Buona (256)', 1024: 'Massima (1024)', 2048: 'Da esposizione (2048)' }, saveState);
    s1.appendChild(el('p', 'hint', 'Gli stili Classico e Illustrato sono puliti già con pochi campioni.'));
    const s2 = section('Ritocco', 'Si può cambiare anche a render finito.');
    slider(s2, 'Esposizione', bind(S.render, 'exposure'), 0.1, 4, 0.01, () => { onDisplay(); applyViewEnv(); }, v => v.toFixed(2).replace('.', ','), { log: true });
    slider(s2, 'Contrasto', bind(S.render, 'contrast'), 0.6, 1.5, 0.01, onDisplay, pct);
    slider(s2, 'Saturazione', bind(S.render, 'saturation'), 0, 2, 0.01, onDisplay, pct);
    slider(s2, 'Vignettatura', bind(S.render, 'vignette'), 0, 1, 0.01, onDisplay, pct);
    const s3 = section('Terreni');
    select2(s3, 'Dettaglio', bind(S.render, 'detail'), { 512: 'Normale (512)', 1024: 'Alto (1024, più lento)' }, () => { terrains().forEach(o => scheduleGen(o, 0)); });
  },
  scene() {
    const s = section('Scene pronte', 'Un punto di partenza da modificare. Sostituisce la scena attuale.');
    const grid = el('div', 'presets');
    PRESETS.forEach(p => {
      const b = el('button', 'preset', `<strong>${p.name}</strong><span>${p.desc}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => loadScene(p.make()));
      grid.appendChild(b);
    });
    s.appendChild(grid);
    const s2 = section('Sorprendimi');
    button(s2, 'Scena casuale', randomScene, 'wide');
    const s3 = section('File della scena', 'La scena si salva da sola in questo browser. Per spostarla altrove esportala in un file.');
    const row = el('div', 'row');
    button(row, 'Esporta', () => { syncCameraState(); download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), 'scena-orizzonte.json'); });
    button(row, 'Importa…', () => $('#importFile').click());
    s3.appendChild(row);
  },
};

const PROPS = {
  terrain(o) {
    const s = section('Forma');
    const g = o.gen;
    const regen = () => scheduleGen(o);
    select2(s, 'Tipo', bind(g, 'type'), TERRAIN_TYPES, regen);
    const seedRow = el('div', 'ctl');
    seedRow.appendChild(el('div', 'ctl-head', '<span class="ctl-name">Variante</span>'));
    const sr = el('div', 'row');
    const num = document.createElement('input');
    num.type = 'number'; num.min = 1; num.max = 99999; num.value = g.seed;
    num.addEventListener('change', () => { g.seed = Math.max(1, parseInt(num.value) || 1); regen(); });
    sr.appendChild(num);
    button(sr, 'Nuova', () => { g.seed = 1 + Math.floor(Math.random() * 99999); num.value = g.seed; regen(); });
    seedRow.appendChild(sr);
    s.appendChild(seedRow);
    slider(s, 'Grandezza delle forme', bind(g, 'scale'), 0, 1, 0.01, regen, v => v < 0.33 ? 'grandi' : v < 0.66 ? 'medie' : 'piccole');
    slider(s, 'Rugosità', bind(g, 'roughness'), 0, 1, 0.01, regen, pct);
    slider(s, 'Erosione', bind(g, 'erosion'), 0, 1, 0.01, regen, pct);
    slider(s, 'Terrazze', bind(g, 'terraces'), 0, 1, 0.01, regen, pct);
    const s2 = section('Dimensioni e posizione', 'Puoi anche trascinare le frecce nella vista (W sposta, E ruota, R scala).');
    slider(s2, 'Larghezza', bind(o, 'w'), 100, 60000, 10, onTerrainLook(o), fmtLen, { log: true });
    slider(s2, 'Profondità', bind(o, 'd'), 100, 60000, 10, onTerrainLook(o), fmtLen, { log: true });
    slider(s2, 'Altezza', bind(o, 'h'), 10, 8000, 5, onTerrainLook(o), fmtLen, { log: true });
    slider(s2, 'Rotazione', { get: () => ((o.rot / DEG) % 360 + 360) % 360, set: v => { o.rot = v * DEG; } }, 0, 360, 1, onObj(o), v => Math.round(v) + '°');
    numbers(s2, [{ label: 'X (m)', b: bind(o, 'x') }, { label: 'Quota (m)', b: bind(o, 'y') }, { label: 'Z (m)', b: bind(o, 'z') }], onTerrainLook(o));
    const s3 = section('Colori');
    select2(s3, 'Tavolozza', bind(o, 'palette'), Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.name])), v => {
      o.snowLine = PALETTES[v].snowLine; o.rockSlope = PALETTES[v].rockSlope; onTerrainLook(o)(); setTimeout(renderTab);
    });
    slider(s3, 'Quota della neve', bind(o, 'snowLine'), 0, 1.2, 0.01, onTerrainLook(o), v => v > 1 ? 'niente neve' : pct(v));
    slider(s3, 'Roccia sui pendii', bind(o, 'rockSlope'), 0.05, 0.7, 0.01, onTerrainLook(o), v => pct(1 - v));
  },
  prim(o) {
    const s = section('Aspetto');
    select2(s, 'Forma', bind(o, 'shape'), SHAPES, () => { onObj(o)(); renderTab(); });
    select2(s, 'Materiale', bind(o, 'material'), MATERIALS, () => { onObj(o)(); renderTab(); });
    color(s, 'Colore', bind(o, 'color'), onObj(o));
    if (o.material === 1 || o.material === 2) slider(s, 'Ruvidità', bind(o, 'rough'), 0, 1, 0.01, onObj(o), pct);
    if (o.material === 3) slider(s, 'Intensità della luce', bind(o, 'emit'), 0.5, 80, 0.5, onObj(o), v => v.toFixed(1).replace('.', ','), { log: true });
    const s2 = section('Dimensioni', 'Semiassi in metri (raggio per la sfera). Con R trascini le maniglie di scala.');
    const uni = { get: () => (o.sx + o.sy + o.sz) / 3, set: v => { const k = v / ((o.sx + o.sy + o.sz) / 3); o.sx *= k; o.sy *= k; o.sz *= k; } };
    slider(s2, 'Grandezza', uni, 0.1, 8000, 0.1, () => { onObj(o)(); syncPanelValues(); }, fmtLen, { log: true });
    numbers(s2, [{ label: 'X', b: bind(o, 'sx'), min: 0.05 }, { label: 'Y', b: bind(o, 'sy'), min: 0.05 }, { label: 'Z', b: bind(o, 'sz'), min: 0.05 }], onObj(o));
    const s3 = section('Posizione e rotazione');
    numbers(s3, [{ label: 'X (m)', b: bind(o, 'x') }, { label: 'Quota (m)', b: bind(o, 'y') }, { label: 'Z (m)', b: bind(o, 'z') }], onObj(o));
    numbers(s3, [{ label: 'Rot. X°', b: bind(o, 'rx') }, { label: 'Rot. Y°', b: bind(o, 'ry') }, { label: 'Rot. Z°', b: bind(o, 'rz') }], onObj(o));
  },
  water(o) {
    const s = section('Acqua', 'Piano infinito: con la freccia verde ne alzi o abbassi il livello.');
    const lvl = () => { syncNode(o); recolorAll(); resetTrace(); };
    slider(s, 'Livello', bind(o, 'y'), -500, 6000, 1, lvl, fmtLen);
    color(s, 'Colore', bind(o, 'color'), onObj(o));
    slider(s, 'Limpidezza', bind(o, 'clarity'), 0, 1, 0.01, onObj(o), pct);
    slider(s, 'Onde', bind(o, 'waves'), 0, 1, 0.01, onScene, pct);
  },
  ground(o) {
    const s = section('Suolo', 'Piano infinito sotto a tutto, come un deserto senza fine. Senza suolo, sotto l’orizzonte si vede il cielo.');
    slider(s, 'Quota', bind(o, 'y'), -2000, 4000, 1, onObj(o), fmtLen);
    color(s, 'Colore', bind(o, 'color'), onObj(o));
  },
  clouds(o) {
    const s = section('Nuvole', 'Strato infinito: con la freccia verde ne cambi la quota.');
    slider(s, 'Copertura', bind(o, 'cover'), 0, 1, 0.01, onObj(o), v => v === 0 ? 'sereno' : pct(v));
    slider(s, 'Densità', bind(o, 'density'), 0.05, 1, 0.01, onScene, pct);
    slider(s, 'Quota', bind(o, 'y'), 100, 10000, 10, onObj(o), fmtLen);
    slider(s, 'Spessore', bind(o, 'thickness'), 100, 5000, 10, onScene, fmtLen);
    slider(s, 'Grandezza', bind(o, 'scale'), 1500, 25000, 100, onScene, fmtLen, { log: true });
  },
};

function renderTab() {
  body.innerHTML = '';
  syncRows = [];
  TABS[curTab]();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === curTab));
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { curTab = b.dataset.tab; renderTab(); }));

// ---------- caricamento di una scena intera ----------
function syncCameraState() {
  S.camera.pos = camera3.position.toArray().map(v => Math.round(v * 10) / 10);
  S.camera.target = orbit.target.toArray().map(v => Math.round(v * 10) / 10);
}
function loadScene(ns) {
  if (mode !== 'view') cancelFinal();
  for (const id of [...nodes.keys()]) removeNode(id);
  terrData.clear();
  S = ns;
  for (const o of S.objects) makeNode(o);
  camera3.fov = 2 * Math.atan(12 / S.camera.focal) / DEG;
  camera3.updateProjectionMatrix();
  if (!S.camera.snap) {
    camera3.position.fromArray(S.camera.pos);
    orbit.target.fromArray(S.camera.target);
    orbit.update();
  }
  selId = null; tc.detach();
  layersDirty = true; skyDirty = true;
  layout();
  setShading(S.view.shading);
  const ts = terrains();
  if (ts.length) ts.forEach(o => scheduleGen(o, 0));
  else afterAllGenerated();
  renderTab();
}
function randomScene() {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick1 = a => a[Math.floor(Math.random() * a.length)];
  const s = baseState();
  const h = Math.round(rnd(700, 3000) / 50) * 50;
  const t = withPalette(mkTerrain({ h, gen: { type: pick1(Object.keys(TERRAIN_TYPES)), seed: 1 + Math.floor(Math.random() * 99999), scale: rnd(0.2, 0.7), roughness: rnd(0.35, 0.7), erosion: rnd(0.3, 0.9), terraces: 0 } }), pick1(Object.keys(PALETTES)));
  s.objects = [mkGround({ color: pick1(['#6e6650', '#5d5a44', '#8a7a60', '#3a3f44']) }), t];
  if (Math.random() < 0.7) s.objects.push(mkWater({ y: Math.round(h * rnd(0.05, 0.3)), color: pick1(['#1f5868', '#1f9aa0', '#123848', '#2b4a3a', '#3a1d5a']) }));
  if (Math.random() < 0.7) s.objects.push(mkClouds({ y: Math.round(h + rnd(300, 1500)), cover: rnd(0.15, 0.6), density: rnd(0.3, 0.8) }));
  Object.assign(s.sky, { sunElev: rnd(3, 40), sunAzim: rnd(0, 360), atmos: Math.random() < 0.8 ? pick1(['terra', 'terra', 'densa']) : pick1(['marte', 'viola', 'verde']), clarity: rnd(0.4, 0.9), fog: rnd(0.1, 0.5) });
  s.camera.snap = camSnap(rnd(-Math.PI, Math.PI), rnd(0.04, 0.25), rnd(4000, 9000));
  s.render = Object.assign({}, S.render);
  s.view = Object.assign({}, S.view);
  loadScene(s);
}
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const ns = mergeDeep(baseState(), JSON.parse(await f.text()));
    if (!Array.isArray(ns.objects)) throw new Error('niente oggetti');
    ns.camera.snap = null;
    loadScene(ns);
    toast('Scena importata');
  } catch (err) { toast('File non valido'); }
  e.target.value = '';
});

// ---------- avvio ----------
setGizmo('translate');
loadScene(S);
// prova automatica del render finale: ?finale=campioni
if (QP.get('finale')) {
  const wait = () => { if (busy || genQueue.length) return setTimeout(wait, 200); S.render.samples = parseInt(QP.get('finale')); S.render.size = 1280; startFinal(); };
  setTimeout(wait, 500);
}
if (QP.get('seleziona')) setTimeout(() => { const o = S.objects.find(x => x.type === QP.get('seleziona')); if (o) select(o.id); }, 800);
requestAnimationFrame(frame);
window.__orizzonte = { state: () => S };
