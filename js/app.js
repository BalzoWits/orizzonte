// Orizzonte: scena a oggetti, vista 3D (three.js) con gizmo, pannelli, anteprima e render finale.
import * as THREE from '../lib/three.module.js';
import { OrbitControls } from '../lib/OrbitControls.js';
import { TransformControls } from '../lib/TransformControls.js';
import { readModelFile, normalizeTris, simplifyTris, computeNormals, buildBVH, saveMesh, loadMesh, deleteMesh, f32ToB64, b64ToF32 } from './models.js?v=9';

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
const SHAPES = { 0: 'Sfera', 1: 'Cubo', 2: 'Cilindro', 3: 'Toro', 4: 'Cono', 5: 'Piramide', 6: 'Capsula', 7: 'Anello', 8: 'Arco', 9: 'Blob', 10: 'Cupola' };
const SHAPE_NAMES = Object.assign({ 11: 'Modello 3D' }, SHAPES);
// parametro di forma: etichetta e valore iniziale
const SHAPE_PARAM = {
  3: ['Spessore', 0.3], 4: ['Punta (0 = appuntita)', 0], 6: ['Rotondità', 0.5], 7: ['Larghezza della fascia', 0.35],
  8: ['Spessore', 0.2], 9: ['Morbidezza delle unioni', 0.45], 10: ['Spessore della parete', 0.15],
};
const MATERIALS = { 0: 'Opaco / plastica', 1: 'Metallo', 2: 'Vetro', 3: 'Luce' };
const PATTERNS = { 0: 'Tinta unita', 1: 'Scacchiera', 2: 'Marmo psichedelico', 3: 'Strisce', 4: 'Sfumatura', 5: 'Immagine' };
// materiali pronti: si applicano all'oggetto selezionato (la scala del motivo si adatta alla grandezza)
const MAT_PRESETS = [
  { name: 'Cromo', m: { material: 1, pattern: 0, color: '#e8eaee', rough: 0.02 } },
  { name: 'Oro', m: { material: 1, pattern: 0, color: '#e6b450', rough: 0.06 } },
  { name: 'Vetro', m: { material: 2, pattern: 0, color: '#eef6ff', rough: 0 } },
  { name: 'Vetro rosa', m: { material: 2, pattern: 0, color: '#ff9ad5', rough: 0 } },
  { name: 'Plastica lucida', m: { material: 0, pattern: 0, color: '#d23a3a', shine: 0.85, mirror: 0.08 } },
  { name: 'Scacchiera', m: { material: 0, pattern: 1, color: '#d01f1f', color2: '#f4f4f4', shine: 0.7, mirror: 0.12, _ps: 0.5 } },
  { name: 'Marmo psichedelico', m: { material: 0, pattern: 2, color: '#ff3fb4', color2: '#3fe0ff', color3: '#fff23f', shine: 0.6, mirror: 0.05, _ps: 0.6 } },
  { name: 'Strisce', m: { material: 0, pattern: 3, color: '#2a4dff', color2: '#ffffff', shine: 0.6, _ps: 0.25 } },
  { name: 'Pietra', m: { material: 0, pattern: 2, color: '#8a8580', color2: '#5c5650', color3: '#b5afa5', shine: 0, mirror: 0, _ps: 0.8 } },
  { name: 'Neon', m: { material: 3, pattern: 0, color: '#ff4fd8', emit: 10 } },
];
const GROUND_PRESETS = [
  { name: 'Terra', m: { pattern: 0, color: '#6e6650', mirror: 0, shine: 0 } },
  { name: 'Scacchiera', m: { pattern: 1, color: '#1d2fd0', color2: '#f2f2f2', pscale: 25, mirror: 0.3, shine: 0.6 } },
  { name: 'Specchio', m: { pattern: 0, color: '#20242c', mirror: 0.85, shine: 0.8 } },
  { name: 'Marmo', m: { pattern: 2, color: '#ff3fb4', color2: '#5b2bd6', color3: '#3fe0ff', pscale: 60, mirror: 0.15, shine: 0.4 } },
];
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
  3: '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="4" ry="2"/>',
  4: '<path d="M12 3l7 16H5z"/><ellipse cx="12" cy="19" rx="7" ry="2"/>',
  5: '<path d="M12 3l9 15H3zM12 3l2 15"/>',
  6: '<rect x="7" y="3" width="10" height="18" rx="5"/>',
  7: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="6" ry="2"/>',
  8: '<path d="M4 20V12a8 8 0 0 1 16 0v8M8 20v-8a4 4 0 0 1 8 0v8"/>',
  9: '<circle cx="9" cy="10" r="5"/><circle cx="16" cy="15" r="4"/>',
  10: '<path d="M3 17a9 9 0 0 1 18 0zM2 17h20"/>',
  11: '<path d="M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/><path d="M7.5 4.5l9 5"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};

// ---------- oggetti della scena ----------
let uidN = 0;
const uid = () => 'o' + Date.now().toString(36) + (uidN++).toString(36);
function mkTerrain(o) {
  return Object.assign({
    id: uid(), type: 'terrain', name: 'Terreno', x: 0, y: 0, z: 0, rot: 0, w: 16000, d: 16000, h: 2200,
    gen: { type: 'montagne', seed: 7, scale: 0.45, roughness: 0.55, erosion: 0.6, terraces: 0 },
    palette: 'alpino', snowLine: 0.68, rockSlope: 0.30, floating: false, under: 0.9,
  }, o);
}
function withPalette(t, key) { const p = PALETTES[key]; t.palette = key; t.snowLine = p.snowLine; t.rockSlope = p.rockSlope; return t; }
const mkWater = o => Object.assign({ id: uid(), type: 'water', name: 'Acqua', y: 200, color: '#1f5868', clarity: 0.4, waves: 0.4 }, o);
const mkGround = o => Object.assign({ id: uid(), type: 'ground', name: 'Suolo', y: 0, color: '#6e6650', color2: '#f2f2f2', color3: '#3fe0ff', pattern: 0, pscale: 25, mirror: 0, shine: 0, image: null }, o);
const mkClouds = o => Object.assign({ id: uid(), type: 'clouds', name: 'Nuvole', y: 2900, thickness: 1400, cover: 0.4, density: 0.5, scale: 7000 }, o);
function mkPrim(shape, o) {
  const p = Object.assign({
    id: uid(), type: 'prim', shape, name: SHAPE_NAMES[shape], x: 0, y: 0, z: 0, sx: 100, sy: 100, sz: 100, rx: 0, ry: 0, rz: 0,
    material: 0, color: '#c9c2b8', color2: '#f4f4f4', color3: '#3fe0ff', pattern: 0, pscale: 0, image: null,
    rough: 0.05, emit: 8, shine: 0.3, mirror: 0, p1: SHAPE_PARAM[shape] ? SHAPE_PARAM[shape][1] : 0.3, seed: 1 + Math.floor(Math.random() * 9999),
  }, o);
  if (!p.pscale) p.pscale = Math.max(0.05, Math.round(Math.max(p.sx, p.sy, p.sz) * 0.5 * 100) / 100);
  return p;
}
// completa gli oggetti salvati con una versione precedente
function upgradeObj(o) {
  if (o.type === 'prim') {
    const d = mkPrim(o.shape, {});
    for (const k of Object.keys(d)) if (o[k] === undefined && k !== 'id' && k !== 'name') o[k] = d[k];
    if (!o.pscale) o.pscale = Math.max(0.05, Math.max(o.sx, o.sy, o.sz) * 0.5);
  } else if (o.type === 'ground') {
    const d = mkGround({});
    for (const k of Object.keys(d)) if (o[k] === undefined && k !== 'id' && k !== 'name') o[k] = d[k];
  }
  return o;
}
// sfere del blob (spazio unitario), uguali per vista 3D e path tracer
function blobBalls(seed) {
  const r = mulberry32(seed | 0);
  const n = 3 + Math.floor(r() * 3);
  const balls = [];
  for (let i = 0; i < n; i++) {
    const rad = 0.28 + r() * 0.2;
    const lim = 1 - rad;
    let x, y, z;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const k = i === 0 ? 0 : lim * 0.85;
    balls.push([x * k, y * k, z * k, rad]);
  }
  return balls;
}

function baseState() {
  return {
    objects: [],
    images: [],   // { id, name, data: dataURL 512x512 }
    sky: {
      sunElev: 22, sunAzim: 200, sunSize: 0.8, atmos: 'terra', clarity: 0.7, fog: 0.25, fogHeight: 900, skyLight: 1.8,
      mode: 'fisico', zenith: '#2a5bd7', horizon: '#f6c9a8', below: '#3a3530', sunTint: '#fff1d6', sunPow: 1, bright: 1,
      stars: 0.6, nebula: 0.5, neb1: '#7a2bd6', neb2: '#ff3fa0',
    },
    camera: { pos: [6000, 1500, 6000], target: [0, 300, 0], focal: 35, blur: 0, focus: 0, snap: null },
    render: { format: '16:9', size: 1920, samples: 256, style: 0, exposure: 1, contrast: 1, saturation: 1, vignette: 0.25, detail: 512, modelTris: 60000 },
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
    name: 'Silicon Dreams', desc: 'Cromo, scacchiera e un pianeta: anni ’90', make() {
      const s = baseState();
      const P = (shape, o) => mkPrim(shape, o);
      s.objects = [
        mkGround({ name: 'Pavimento', pattern: 1, color: '#1d2fd0', color2: '#f2f2f2', pscale: 25, mirror: 0.3, shine: 0.6 }),
        P(0, { name: 'Sfera cromata', material: 1, color: '#e8eaee', rough: 0.02, sx: 40, sy: 40, sz: 40, x: 0, z: 0, y: 40 }),
        P(0, { name: 'Sfera a scacchi', material: 0, pattern: 1, color: '#d01f1f', color2: '#f4f4f4', shine: 0.7, mirror: 0.12, pscale: 12, sx: 26, sy: 26, sz: 26, x: -75, z: 40, y: 26 }),
        P(3, { name: 'Toro', material: 1, color: '#c8ccff', rough: 0.03, p1: 0.28, sx: 34, sy: 34, sz: 34, x: 70, z: 30, y: 34, rx: 70, rz: 20 }),
        P(9, { name: 'Blob', material: 1, color: '#dfe3ea', rough: 0.02, p1: 0.5, seed: 42, sx: 30, sy: 30, sz: 30, x: 40, z: -70, y: 34 }),
        P(4, { name: 'Cristallo', material: 2, color: '#9fd8ff', p1: 0, sx: 10, sy: 45, sz: 10, x: -40, z: -60, y: 45 }),
        P(5, { name: 'Piramide', material: 0, pattern: 2, color: '#ff3fb4', color2: '#3fe0ff', color3: '#fff23f', pscale: 20, shine: 0.6, sx: 22, sy: 22, sz: 22, x: -110, z: -40, y: 22 }),
        P(8, { name: 'Arco', material: 0, pattern: 0, color: '#f2efe8', shine: 0.5, p1: 0.12, sx: 60, sy: 60, sz: 60, x: 10, z: -150, y: 0 }),
        P(0, { name: 'Pianeta', material: 0, pattern: 2, color: '#f08a3c', color2: '#7a3cb4', color3: '#ffe2a8', pscale: 2500, shine: 0, sx: 2600, sy: 2600, sz: 2600, x: -12000, z: -26000, y: 3600 }),
        P(7, { name: 'Anelli', material: 0, pattern: 3, color: '#f4d9a8', color2: '#b89a70', pscale: 600, shine: 0, p1: 0.45, sx: 5300, sy: 5300, sz: 5300, x: -12000, z: -26000, y: 3600, rx: 14, rz: -16 }),
      ];
      Object.assign(s.sky, { sunElev: 28, sunAzim: 30, atmos: 'terra', clarity: 0.85, fog: 0.05, skyLight: 2.2 });
      s.render.style = 1;
      s.render.format = '4:3';
      s.camera.snap = camSnap(0.15, 0.12, 330);
      return s;
    }
  },
  {
    name: 'Isole sospese', desc: 'Rocce fluttuanti sopra un mare di nuvole', make() {
      const s = baseState();
      const isl = (o, pal) => withPalette(mkTerrain(Object.assign({ floating: true, under: 1.1 }, o)), pal);
      s.objects = [
        mkGround({ y: -2500, color: '#3a3f55' }),
        isl({ name: 'Isola grande', x: 0, y: 1200, z: 0, w: 3200, d: 3200, h: 700, gen: { type: 'isola', seed: 12, scale: 0.35, roughness: 0.55, erosion: 0.6, terraces: 0 } }, 'tropicale'),
        isl({ name: 'Isola media', x: 2900, y: 1900, z: -1700, w: 1800, d: 1800, h: 450, rot: 0.8, gen: { type: 'isola', seed: 77, scale: 0.4, roughness: 0.6, erosion: 0.5, terraces: 0.2 } }, 'alpino'),
        isl({ name: 'Isola piccola', x: -2400, y: 800, z: -1200, w: 1100, d: 1100, h: 300, gen: { type: 'isola', seed: 5, scale: 0.45, roughness: 0.6, erosion: 0.4, terraces: 0 } }, 'autunno'),
        mkClouds({ y: -300, thickness: 700, cover: 0.62, density: 0.6, scale: 3000 }),
        mkPrim(0, { name: 'Sfera cromata', material: 1, color: '#e8eaee', rough: 0.02, sx: 160, sy: 160, sz: 160, x: 900, y: 2300, z: 700 }),
        mkPrim(3, { name: 'Anello sospeso', material: 1, color: '#ffd38a', rough: 0.05, p1: 0.15, sx: 380, sy: 380, sz: 380, x: -900, y: 2100, z: 900, rx: 75, ry: 20 }),
      ];
      Object.assign(s.sky, { mode: 'dipinto', zenith: '#6a7fe0', horizon: '#f6c9e8', below: '#4a3a5a', sunTint: '#fff0dc', sunPow: 1.1, bright: 1.2, sunElev: 24, sunAzim: 50, fog: 0.06, fogHeight: 2000, skyLight: 1.6 });
      s.camera.snap = camSnap(0.35, 0.12, 6500);
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
if (QP.has('cielo')) S.sky.mode = QP.get('cielo');

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
// solo gli oggetti visibili entrano nel render
const firstVisible = type => S.objects.find(o => o.type === type && !o.hidden);

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
const isShared = g => g === PLANE_GEO || Object.values(GEO).includes(g) || !!g.userData.shared;

// ---------- modelli importati ----------
const meshStore = new Map();   // id -> { name, pos, nor, half, orig, geo, nodes, data }
const meshInfo = new Map();    // id -> { root } nel BVH globale caricato sulla GPU
let meshesDirty = true;
// prepara un modello: BVH, triangoli riordinati per la GPU, geometria per la vista
function prepareMesh(id, rec) {
  const nT = rec.pos.length / 9;
  const { nodes, order } = buildBVH(rec.pos);
  const data = new Float32Array(nT * 24);
  for (let i = 0; i < nT; i++) {
    const t = order[i];
    for (let v = 0; v < 3; v++) {
      data.set(rec.pos.subarray(t * 9 + v * 3, t * 9 + v * 3 + 3), i * 24 + v * 4);
      data.set(rec.nor.subarray(t * 9 + v * 3, t * 9 + v * 3 + 3), i * 24 + 12 + v * 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(rec.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(rec.nor, 3));
  // uv a scatola per le texture della vista
  const uv = new Float32Array(nT * 6);
  for (let i = 0; i < nT * 3; i++) {
    const x = rec.pos[i * 3], y = rec.pos[i * 3 + 1], z = rec.pos[i * 3 + 2];
    const nx = Math.abs(rec.nor[i * 3]), ny = Math.abs(rec.nor[i * 3 + 1]), nz = Math.abs(rec.nor[i * 3 + 2]);
    const [u, v] = nx > ny && nx > nz ? [z, y] : ny > nz ? [x, z] : [x, y];
    uv[i * 2] = u * 0.5 + 0.5; uv[i * 2 + 1] = v * 0.5 + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.shared = true;
  meshStore.set(id, Object.assign({}, rec, { geo, nodes, data, tris: nT }));
  meshesDirty = true;
}
// unisce i modelli usati in un unico BVH per la GPU
function assembleMeshes() {
  meshInfo.clear();
  const used = [...new Set(prims().filter(o => o.shape === 11 && !o.hidden && meshStore.has(o.mesh)).map(o => o.mesh))];
  let nNodes = 0, nTris = 0;
  for (const id of used) { const m = meshStore.get(id); nNodes += m.nodes.length / 8; nTris += m.tris; }
  const nodes = new Float32Array(Math.max(1, nNodes) * 8), tris = new Float32Array(Math.max(1, nTris) * 24);
  let nb = 0, tb = 0;
  for (const id of used) {
    const m = meshStore.get(id);
    const k = m.nodes.length / 8;
    for (let i = 0; i < k; i++) {
      const s = i * 8, d = (nb + i) * 8;
      for (let j = 0; j < 8; j++) nodes[d + j] = m.nodes[s + j];
      if (m.nodes[s + 7] > 0) nodes[d + 3] = m.nodes[s + 3] + tb; else nodes[d + 3] = m.nodes[s + 3] + nb;
    }
    tris.set(m.data, tb * 24);
    meshInfo.set(id, { root: nb });
    nb += k; tb += m.tris;
  }
  R.uploadMeshes(nodes, tris);
  meshesDirty = false;
}
async function ensureMeshes() {
  const need = [...new Set(prims().filter(o => o.shape === 11 && o.mesh && !meshStore.has(o.mesh)).map(o => o.mesh))];
  for (const id of need) {
    const rec = await loadMesh(id);
    if (!rec) { toast('Un modello 3D della scena non è più salvato in questo browser'); continue; }
    prepareMesh(id, rec);
    for (const o of prims()) if (o.mesh === id) syncNode(o);
  }
  if (need.length) { resetTrace(); updateSelBox(); }
}
const modelPicker = document.createElement('input');
modelPicker.type = 'file'; modelPicker.accept = '.obj,.stl,.glb,.gltf'; modelPicker.hidden = true;
document.body.appendChild(modelPicker);
modelPicker.addEventListener('change', () => { const f = modelPicker.files[0]; modelPicker.value = ''; if (f) importModel(f); });
async function importModel(file) {
  if (prims().length >= MAX_OBJ) { toast(`Al massimo ${MAX_OBJ} oggetti`); return; }
  busy = true;
  $('#busy').hidden = false; $('#busy-text').textContent = 'Leggo il modello…';
  await new Promise(r => setTimeout(r, 30));
  try {
    let tris = await readModelFile(file);
    const orig = tris.length / 9;
    $('#busy-text').textContent = orig > S.render.modelTris ? `Semplifico ${orig.toLocaleString('it')} triangoli…` : 'Preparo il modello…';
    await new Promise(r => setTimeout(r, 30));
    const { half } = normalizeTris(tris);
    tris = simplifyTris(tris, S.render.modelTris);
    const { pos, nor } = computeNormals(tris);
    const id = uid();
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Modello';
    const rec = { name, pos, nor, half, orig };
    await saveMesh(id, rec);
    prepareMesh(id, rec);
    const tgt = orbit.target, dist = camera3.position.distanceTo(tgt);
    const k = (dist * 0.15) / Math.max(...half);
    const o = mkPrim(11, { name: nextName(name), mesh: id, x: Math.round(tgt.x), z: Math.round(tgt.z), sx: half[0] * k, sy: half[1] * k, sz: half[2] * k, color: '#c9c2b8', shine: 0.5 });
    S.objects.push(o);
    makeNode(o);
    o.y = 0; syncNode(o);
    nodes.get(o.id).root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(nodes.get(o.id).mesh);
    o.y = surfaceY(o.x, o.z) - b.min.y;
    syncNode(o);
    const n = pos.length / 9;
    toast(n < orig ? `Modello semplificato da ${orig.toLocaleString('it')} a ${n.toLocaleString('it')} triangoli` : `Modello importato: ${n.toLocaleString('it')} triangoli`);
    busy = false; $('#busy').hidden = true;
    select(o.id);
    resetTrace();
  } catch (e) {
    console.error(e);
    busy = false; $('#busy').hidden = true;
    toast('Non riesco a leggere il modello: ' + e.message);
  }
}
const PLACEHOLDER_GEO = new THREE.BoxGeometry(2, 2, 2);
PLACEHOLDER_GEO.userData.shared = true;

// geometria della vista 3D, con le stesse misure delle forme del path tracer (spazio unitario)
function primGeoKey(o) { return o.shape + '|' + (o.shape >= 3 ? o.p1 : '') + '|' + (o.shape === 9 ? o.seed : '') + '|' + (o.shape === 11 ? o.mesh + meshStore.has(o.mesh) : ''); }
function primGeometry(o) {
  const p1 = o.p1;
  switch (o.shape) {
    case 11: return meshStore.has(o.mesh) ? meshStore.get(o.mesh).geo : PLACEHOLDER_GEO;
    case 0: case 1: case 2: return GEO[o.shape];
    case 3: { const r = clamp(p1, 0.05, 0.5); return new THREE.TorusGeometry(1 - r, r, 24, 72).rotateX(Math.PI / 2); }
    case 4: return new THREE.CylinderGeometry(clamp(p1, 0, 1), 1, 2, 48);
    case 5: return new THREE.ConeGeometry(Math.SQRT2, 2, 4).rotateY(Math.PI / 4);
    case 6: { const r = clamp(p1, 0.1, 1); return new THREE.CapsuleGeometry(r, Math.max(0.001, 2 * (1 - r)), 12, 32); }
    case 7: { const w = p1 * 0.45 + 0.02; return new THREE.RingGeometry(1 - 2 * w, 1, 72).rotateX(-Math.PI / 2); }
    case 8: { const r = clamp(p1, 0.05, 0.5); return new THREE.TorusGeometry(1 - r, r, 20, 48, Math.PI); }
    case 9: return mergeSpheres(blobBalls(o.seed));
    default: return new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  }
}
// unione semplice di sfere (anteprima del blob)
function mergeSpheres(balls) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const [x, y, z, r] of balls) {
    const g = new THREE.SphereGeometry(r, 32, 16);
    const base = pos.length / 3;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const ix = g.getIndex();
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- immagini dell'utente ----------
const imgCanvas = new Map();   // id -> canvas IMG_SIZE
function imageLayer(id) { const i = S.images.findIndex(im => im.id === id); return i < 0 ? 0 : i; }
function loadImages() {
  // ricarica tutte le immagini nei layer (l'indice nell'elenco e' il layer)
  S.images.forEach((im, i) => {
    const done = c => { R.uploadImage(i, c); resetTrace(); refreshAllLooks(); };
    if (imgCanvas.has(im.id)) { done(imgCanvas.get(im.id)); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = IMG_SIZE;
      c.getContext('2d').drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
      imgCanvas.set(im.id, c);
      texCache.clear();
      done(c);
    };
    img.src = im.data;
  });
}
function addImageFromFile(file, cb) {
  if (S.images.length >= MAX_IMG) { toast(`Al massimo ${MAX_IMG} immagini: sostituisco la più vecchia`); const old = S.images.shift(); imgCanvas.delete(old.id); }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = IMG_SIZE;
    c.getContext('2d').drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
    URL.revokeObjectURL(url);
    const id = uid();
    S.images.push({ id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 30), data: c.toDataURL('image/jpeg', 0.85) });
    imgCanvas.set(id, c);
    texCache.clear();
    loadImages();
    cb(id);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Immagine non leggibile'); };
  img.src = url;
}
const imgPicker = document.createElement('input');
imgPicker.type = 'file'; imgPicker.accept = 'image/*'; imgPicker.hidden = true;
document.body.appendChild(imgPicker);
let imgPickerCb = null;
imgPicker.addEventListener('change', () => { const f = imgPicker.files[0]; if (f && imgPickerCb) addImageFromFile(f, imgPickerCb); imgPicker.value = ''; });
function pickImage(cb) { imgPickerCb = cb; imgPicker.click(); }

// texture dei motivi per la vista "Materiali" (approssimano quelli del path tracer)
const texCache = new Map();
function patternTexture(o) {
  if (!o.pattern) return null;
  const key = [o.pattern, o.color, o.color2, o.color3, o.image].join('|');
  if (texCache.has(key)) return texCache.get(key);
  let c;
  if (o.pattern === 5) {
    c = imgCanvas.get(o.image);
    if (!c) return null;
  } else {
    c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (o.pattern === 1) { c.width = c.height = 2; ctx.fillStyle = o.color; ctx.fillRect(0, 0, 2, 2); ctx.fillStyle = o.color2; ctx.fillRect(1, 0, 1, 1); ctx.fillRect(0, 1, 1, 1); }
    else if (o.pattern === 3) { c.width = 1; c.height = 2; ctx.fillStyle = o.color; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = o.color2; ctx.fillRect(0, 1, 1, 1); }
    else if (o.pattern === 4) { c.width = 1; c.height = 64; const g = ctx.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, o.color); g.addColorStop(0.5, o.color2); g.addColorStop(1, o.color3); ctx.fillStyle = g; ctx.fillRect(0, 0, 1, 64); }
    else {
      const N = 128; c.width = c.height = N;
      const img = ctx.createImageData(N, N), noise = makePerlin2D(7);
      const h2r = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const a = h2r(o.color), b = h2r(o.color2), d = h2r(o.color3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = noise(x / 40, y / 40) * 0.6 + noise(x / 15, y / 15) * 0.25;
        const v = Math.sin(x * 0.06 + y * 0.03 + n * 9) * 0.5 + 0.5;
        const k = (y * N + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[k + ch] = v < 0.5 ? a[ch] + (b[ch] - a[ch]) * v * 2 : b[ch] + (d[ch] - b[ch]) * (v - 0.5) * 2;
        img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.pattern === 2 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  if (o.pattern === 1 || o.pattern === 3) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
  texCache.set(key, t);
  return t;
}
function patternMap(o, size) {
  const base = patternTexture(o);
  if (!base) return null;
  const t = base.clone();
  if (o.type === 'ground' && o.pattern === 5) {
    // immagine centrata nell'origine, lato = pscale
    const reps = 400000 / Math.max(o.pscale, 0.01);
    const off = 0.5 - ((0.5 * reps) % 1);
    t.repeat.set(reps, reps); t.offset.set(off, off);
    t.needsUpdate = true;
    return t;
  }
  const reps = o.pattern === 4 || o.pattern === 5 ? 1 : Math.max(1, Math.round(size / Math.max(o.pscale, 0.01)));
  t.repeat.set(o.pattern === 3 ? 1 : reps, o.pattern === 4 ? 1 : reps);
  t.needsUpdate = true;
  return t;
}

function makeNode(o) {
  const root = new THREE.Group();
  root.userData.id = o.id;
  const node = { root, mesh: null, wire: null, grid: null };
  if (o.type === 'terrain') {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    node.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    node.wire = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, color: WIRE_COLOR }));
    // parte sotto delle isole sospese (forma specchiata)
    node.under = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    root.add(node.mesh, node.wire, node.under);
  } else if (o.type === 'prim') {
    const g = primGeometry(o);
    node.geoKey = primGeoKey(o);
    node.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    node.wire = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, color: WIRE_COLOR }));
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
  if (n.mesh && !isShared(n.mesh.geometry)) n.mesh.geometry.dispose();
  if (n.wire && n.wire.geometry !== n.mesh.geometry && !isShared(n.wire.geometry)) n.wire.geometry.dispose();
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
    const key = primGeoKey(o);
    if (n.geoKey !== key) {
      if (!isShared(n.mesh.geometry)) n.mesh.geometry.dispose();
      const g = primGeometry(o);
      n.mesh.geometry = g; n.wire.geometry = g; n.geoKey = key;
    }
  } else {
    r.position.set(0, o.y, 0);
  }
  r.visible = !o.hidden;
  applyNodeLook(o, n);
}
function toggleHidden(o) {
  o.hidden = !o.hidden;
  syncNode(o);
  if (o.hidden && o.id === selId) { tc.detach(); selBox.visible = false; }
  else if (!o.hidden && o.id === selId) select(o.id);
  layersDirty = true;
  if (o.type === 'water') recolorAll();
  resetTrace();
  renderTab();
  updateSelTools();
}

function applyNodeLook(o, n) {
  const mode = S.view.shading;
  const sel = o.id === selId;
  const wire = mode === 'wire';
  if (n.wire) { n.wire.visible = wire; n.wire.material.color.setHex(sel ? SEL_COLOR : WIRE_COLOR); }
  if (n.grid) { n.grid.visible = wire || (mode === 'solid' && o.type !== 'ground'); }
  n.mesh.visible = !wire;
  if (n.under) {
    n.under.visible = !!o.floating;
    n.under.scale.set(1, -o.under * 1.1, 1);
    const um = n.under.material;
    um.wireframe = wire;
    const p = PALETTES[o.palette] || PALETTES.alpino;
    if (wire) um.color.setHex(sel ? SEL_COLOR : WIRE_COLOR);
    else if (mode === 'material') um.color.setRGB(...lin(p.rock));
    else um.color.setHex(0xa8a8a8);
    um.needsUpdate = true;
  }
  let m = n.mesh.material;
  if (o.type === 'clouds') {
    if (!(m instanceof THREE.MeshBasicMaterial)) { m.dispose(); m = n.mesh.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); }
    m.color.set(0xffffff); m.transparent = true; m.depthWrite = false;
    m.opacity = mode === 'material' ? 0.12 + o.cover * 0.35 : 0.12;
    return;
  }
  if (!(m instanceof THREE.MeshStandardMaterial)) { m.dispose(); m = n.mesh.material = new THREE.MeshStandardMaterial(); }
  m.vertexColors = false; m.transparent = false; m.opacity = 1; m.metalness = 0; m.roughness = 0.85;
  if (m.map) { m.map.dispose(); m.map = null; }
  m.emissiveMap = null;
  m.emissive.setHex(0); m.depthWrite = true;
  m.side = o.type === 'water' || o.type === 'ground' || (o.type === 'prim' && (o.shape === 7 || o.shape === 10)) ? THREE.DoubleSide : THREE.FrontSide;
  if (mode === 'solid') {
    m.color.setHex(o.type === 'water' ? 0x8496a6 : o.type === 'ground' ? 0x8a8a8a : 0xc4c4c4);
    if (o.type === 'water') { m.transparent = true; m.opacity = 0.55; }
  } else if (mode === 'material') {
    if (o.type === 'terrain') { m.color.setHex(0xffffff); m.vertexColors = true; m.roughness = 1; }
    else if (o.type === 'ground') {
      const map = patternMap(o, 400000 / 2);
      if (map) { m.map = map; m.color.setHex(0xffffff); } else m.color.setRGB(...lin(o.color));
      m.roughness = o.mirror > 0 ? clamp(1 - o.mirror * 1.1, 0.05, 1) : 1; m.metalness = o.mirror * 0.6;
    }
    else if (o.type === 'water') { m.color.setRGB(...lin(o.color).map(v => v * 0.8)); m.roughness = 0.06; m.metalness = 0.1; m.transparent = true; m.opacity = 0.96 - o.clarity * 0.5; }
    else {
      const map = patternMap(o, 2 * Math.max(o.sx, o.sy, o.sz));
      if (map) { m.map = map; m.color.setHex(0xffffff); } else m.color.setRGB(...lin(o.color));
      if (o.material === 1) { m.metalness = 1; m.roughness = Math.max(0.03, o.rough); }
      else if (o.material === 2) { m.transparent = true; m.opacity = 0.3; m.roughness = 0.05; m.metalness = 0.2; }
      else if (o.material === 3) { m.emissive.setRGB(...lin(o.color)); m.emissiveIntensity = Math.min(3, o.emit / 4); if (map) m.emissiveMap = map; }
      else { m.roughness = clamp(0.8 - o.shine * 0.7, 0.08, 1); m.metalness = o.mirror * 0.5; }
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
        n.mesh.geometry = g; n.wire.geometry = gw; n.under.geometry = g;
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
function waterY() { const w = firstVisible('water'); return w ? w.y : null; }
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
    if (!d || o.hidden || terLayers.length >= MAX_TER) continue;
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
    if (o.type === 'clouds' || o.type === 'prim' || o.id === opts.exclude || o.hidden) continue;
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
  if (o && !o.hidden) tc.attach(nodes.get(o.id).root); else tc.detach();
  configGizmo();
  refreshAllLooks();
  if (curTab !== 'oggetto' && o) curTab = 'oggetto';
  renderTab();
  updateSelTools();
}
function updateSelTools() {
  const o = selId && findObj(selId);
  $('#selTools').hidden = !o || mode !== 'view';
  if (o) $('#btnHide').querySelector('span').textContent = o.hidden ? 'Mostra' : 'Nascondi';
}
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
const TRASH = '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>';
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
const SKY_MODES = { fisico: 0, dipinto: 1, spazio: 2 };
function sunColor(d) {
  // cieli artistici: colore e forza scelti a mano
  if (S.sky.mode !== 'fisico') {
    const fade = S.sky.mode === 'spazio' ? 1 : clamp((d[1] + 0.03) / 0.06, 0, 1);
    return lin(S.sky.sunTint).map(v => v * SUN_POWER * S.sky.sunPow * fade);
  }
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

// parti dello shader da escludere perche' la scena non le usa (compilazione molto piu' rapida)
function traceDefs(pr, gr, wa, cl, terFloat, style) {
  const d = [];
  if (!terLayers.length) d.push('#define TER_N 0');
  if (!terFloat.some(v => v > 0)) d.push('#define NO_FLOAT');
  if (!pr.length) d.push('#define OBJ_N 0');
  if (!pr.some(o => o.shape >= 3 && o.shape <= 10)) d.push('#define NO_SDF');
  if (!pr.some(o => o.shape === 11)) d.push('#define NO_MESH');
  if (!wa) d.push('#define NO_WATER');
  if (!gr) d.push('#define NO_GROUND');
  if (!cl || cl.cover <= 0.001) d.push('#define NO_CLOUDS');
  d.push('#define STYLE ' + style);
  return d;
}
// stato della compilazione del render: avviso a schermo mentre il driver lavora
let traceErrShown = '';
function traceReady() {
  const st = R.prepareTrace(scene.defs);
  const b = $('#busy');
  if (st === 'compiling') {
    if (!busy) { b.hidden = false; $('#busy-text').textContent = 'Preparo il render per questa scena…'; }
  } else if (!busy && $('#busy-text').textContent.startsWith('Preparo il render')) b.hidden = true;
  if (st === 'error' && traceErrShown !== R.traceError) {
    traceErrShown = R.traceError;
    toast('Il render non si compila su questa scheda grafica: ' + String(R.traceError).slice(0, 140));
  }
  return st === 'ready';
}

let lastMeshSig = '';
function buildScene(final) {
  if (layersDirty) uploadLayers();
  const meshSig = [...new Set(prims().filter(o => o.shape === 11 && !o.hidden && meshStore.has(o.mesh)).map(o => o.mesh))].join(',');
  if (meshesDirty || meshSig !== lastMeshSig) { assembleMeshes(); lastMeshSig = meshSig; }
  const T = MAX_TER;
  const terPos = new Float32Array(T * 4), terSize = new Float32Array(T * 4), terMat = new Float32Array(T * 2);
  const terLow = new Float32Array(T * 3), terMid = new Float32Array(T * 3), terRock = new Float32Array(T * 3), terSnow = new Float32Array(T * 3), terSand = new Float32Array(T * 3);
  const terFloat = new Float32Array(T);
  terLayers.forEach((id, i) => {
    const o = findObj(id);
    if (!o) return;
    terFloat[i] = o.floating ? o.under : 0;
    const p = PALETTES[o.palette] || PALETTES.alpino;
    terPos.set([o.x, o.y, o.z, o.rot], i * 4);
    terSize.set([o.w, o.h, o.d, i], i * 4);
    terMat.set([o.snowLine, o.rockSlope], i * 2);
    terLow.set(lin(p.low), i * 3); terMid.set(lin(p.mid), i * 3); terRock.set(lin(p.rock), i * 3); terSnow.set(lin(p.snow), i * 3); terSand.set(lin(p.sand), i * 3);
  });
  // dati degli oggetti in texture (vedi l'elenco delle righe nello shader)
  const objData = new Float32Array(OBJ_W * MAX_OBJ * 4);
  const pr = prims().filter(o => !o.hidden).slice(0, MAX_OBJ);
  const m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), eul = new THREE.Euler();
  pr.forEach((o, i) => {
    const put = (k, a) => objData.set(a, (i * OBJ_W + k) * 4);
    put(0, [o.x, o.y, o.z, o.shape]);
    put(1, [o.sx, o.sy, o.sz, o.material]);
    eul.set(o.rx * DEG, o.ry * DEG, o.rz * DEG, 'XYZ');
    const e = m3.setFromMatrix4(m4.makeRotationFromEuler(eul)).transpose().elements;
    put(2, [e[0], e[1], e[2], 0]); put(3, [e[3], e[4], e[5], 0]); put(4, [e[6], e[7], e[8], 0]);
    put(5, [...lin(o.color), o.rough]);
    put(6, [...lin(o.color2), o.material === 0 ? o.mirror : 0]);
    put(7, [...lin(o.color3), o.material === 0 ? o.shine : 0]);
    const pat = o.pattern === 5 && !imgCanvas.has(o.image) ? 0 : o.pattern;
    put(8, [pat, o.pscale, imageLayer(o.image), o.emit]);
    const mi = o.shape === 11 ? meshInfo.get(o.mesh) : null;
    put(9, [o.p1, mi ? mi.root : -1, 0, Math.hypot(o.sx, o.sy, o.sz) * 1.01]);
    if (o.shape === 9) blobBalls(o.seed).forEach((b, j) => put(10 + j, b));
  });
  const gr = firstVisible('ground'), wa = firstVisible('water'), cl = firstVisible('clouds');
  const grPat = gr && !(gr.pattern === 5 && !imgCanvas.has(gr.image)) ? gr.pattern : 0;
  const sd = sunDir();
  const style = S.render.style;
  scene = {
    cam: cameraFor(final), style,
    terCount: terLayers.length, terPos, terSize, terMat, terLow, terMid, terRock, terSnow, terSand,
    groundOn: !!gr, groundY: gr ? gr.y : 0, groundColor: lin(gr ? gr.color : '#6e6650'),
    groundColor2: lin(gr ? gr.color2 : '#f2f2f2'), groundColor3: lin(gr ? gr.color3 : '#3fe0ff'),
    groundPat: [grPat, gr ? gr.pscale : 25, gr ? imageLayer(gr.image) : 0, gr ? gr.mirror : 0], groundShine: gr ? gr.shine : 0, groundImgRepeat: gr ? gr.imgRepeat !== false : true,
    waterOn: !!wa, waterLevel: wa ? wa.y : 0, waterClarity: wa ? wa.clarity : 0.5, waves: wa ? wa.waves : 0, waterColor: lin(wa ? wa.color : '#1f5868'),
    cloudCover: cl ? cl.cover : 0, cloudDensity: cl ? cl.density : 0.5, cloudBottom: cl ? cl.y : 3000, cloudTop: cl ? cl.y + cl.thickness : 4000, cloudScale: cl ? cl.scale : 7000,
    sunDir: sd, sunColor: sunColor(sd), sunSize: (style === 0 ? S.sky.sunSize : 0.3) * DEG, sunPower: SUN_POWER,
    rayleigh: ATMOS[S.sky.atmos].r, mie: mieCoef(), skyLight: S.sky.skyLight,
    skyMode: SKY_MODES[S.sky.mode] || 0, skyZenith: lin(S.sky.zenith), skyHorizon: lin(S.sky.horizon), skyBelow: lin(S.sky.below),
    skySunTint: lin(S.sky.sunTint), skyNeb1: lin(S.sky.neb1), skyNeb2: lin(S.sky.neb2), skyBright: S.sky.bright, skyNebula: S.sky.nebula, skyStars: S.sky.stars,
    terFloat,
    fogDensity: S.sky.fog > 0 ? 0.000003 + Math.pow(S.sky.fog, 2) * 0.0005 : 0, fogFalloff: 1 / S.sky.fogHeight,
    objCount: pr.length, objData,
    defs: traceDefs(pr, gr, wa, cl, terFloat, style),
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
  if (!busy) navFrame(now, dt);
  if (skyDirty && !busy) {
    R.renderSky(buildScene(mode !== 'view'));
    skyDirty = false;
    updateSkyImage();
    updateViewLights();
  }
  if (!busy && (mode === 'final' || mode === 'done')) {
    if (mode === 'final') {
      if (!scene) buildScene(true);
      if (traceReady()) {
        adapt(dt, 90);
        R.step(accFinal, scene, qualityFor('final'), budget);
        if (accFinal.passes >= S.render.samples) {
          mode = 'done';
          $('#btnSave').hidden = false;
          $('#btnCancel').textContent = 'Chiudi';
        }
        needShow = true;
      }
    }
    if (needShow) {
      const dpr = cv.width / cssW;
      R.show(accFinal, { x: guideRect.x * dpr, y: (cssH - guideRect.y - guideRect.h) * dpr, w: guideRect.w * dpr, h: guideRect.h * dpr }, S.render);
      updateStatus();
      needShow = false;
    }
    return;
  }
  let ready = false;
  if (!busy && S.view.shading === 'render') {
    if (!scene) buildScene(false);
    ready = traceReady();
    // mentre il render si prepara si vede la scena 3D normale
    world.visible = !ready;
    cv.style.visibility = ready ? 'visible' : 'hidden';
  }
  if (ready) {
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
// doppio clic: quel punto diventa il centro della vista (e il punto a fuoco)
vp.addEventListener('dblclick', e => {
  if (mode !== 'view') return;
  const h = pickAt(e);
  if (!h) return;
  S.camera.focus = 0;
  centerAnim = { from: orbit.target.clone(), to: h.point.clone(), t0: performance.now(), dur: 280 };
  toast('Ora la vista gira attorno a questo punto');
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
  for (const o of S.objects) { const n = nodes.get(o.id); if (n && !o.hidden) meshes.push(n.mesh); }
  const hits = ray.intersectObjects(meshes, false);
  // le nuvole si scelgono solo se non c'e' altro davanti
  return hits.find(h => findObj(h.object.userData.id)?.type !== 'clouds') || hits[0] || null;
}
orbit.addEventListener('start', () => { dragging = true; });
orbit.addEventListener('end', () => { dragging = false; keepAboveGround(); orbit.update(); resetTrace(); });
orbit.addEventListener('change', () => { showMarker(); resetTrace(true); });

// ---------- navigazione: comandi a schermo, volo, viste rapide ----------
orbit.zoomToCursor = true;
const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0xf2b45a, depthTest: false, transparent: true, opacity: 0.9 }));
marker.renderOrder = 999;
marker.visible = false;
scene3.add(marker);
let markerUntil = 0, centerAnim = null;
const fly = new Set();
let flyFast = false, flyWasActive = false;
function showMarker() { markerUntil = performance.now() + 900; }
function keepAboveGround() {
  const g = surfaceY(camera3.position.x, camera3.position.z) + 2;
  if (camera3.position.y < g) camera3.position.y = g;
}
function camMoved(done) {
  keepAboveGround();
  orbit.update();
  showMarker();
  resetTrace(!done);
}
function camBasis() {
  camera3.updateMatrixWorld();
  const e = camera3.matrixWorld.elements;
  return { right: new THREE.Vector3(e[0], e[1], e[2]), up: new THREE.Vector3(e[4], e[5], e[6]), fwd: new THREE.Vector3(-e[8], -e[9], -e[10]) };
}
function orbitBy(dx, dy) {
  const off = camera3.position.clone().sub(orbit.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta -= dx * 0.008;
  sph.phi = clamp(sph.phi - dy * 0.008, 0.02, Math.PI * 0.97);
  off.setFromSpherical(sph);
  camera3.position.copy(orbit.target).add(off);
}
function panBy(dx, dy) {
  const k = camera3.position.distanceTo(orbit.target) * 0.002;
  const b = camBasis();
  const mv = b.right.multiplyScalar(-dx * k).add(b.up.multiplyScalar(dy * k));
  camera3.position.add(mv); orbit.target.add(mv);
}
function dollyBy(dy) {
  const off = camera3.position.clone().sub(orbit.target);
  const d = clamp(off.length() * Math.exp(dy * 0.01), 1, 200000);
  camera3.position.copy(orbit.target).add(off.setLength(d));
}
document.querySelectorAll('.nav-pad').forEach(pad => {
  let px = 0, py = 0, on = false;
  pad.addEventListener('pointerdown', e => {
    if (mode !== 'view') return;
    on = true; px = e.clientX; py = e.clientY; dragging = true;
    pad.classList.add('on'); pad.setPointerCapture(e.pointerId);
  });
  pad.addEventListener('pointermove', e => {
    if (!on) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    const k = pad.dataset.pad;
    if (k === 'orbit') orbitBy(dx, dy); else if (k === 'pan') panBy(dx, dy); else dollyBy(dy);
    camMoved(false);
  });
  const end = () => { if (!on) return; on = false; dragging = false; pad.classList.remove('on'); camMoved(true); };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
});
document.querySelectorAll('.nav-fly button').forEach(b => {
  const k = b.dataset.fly;
  const end = () => { fly.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', e => { if (mode !== 'view') return; fly.add(k); b.classList.add('on'); b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('lostpointercapture', end);
});
const FLY_KEYS = { arrowup: 'fwd', arrowdown: 'back', arrowleft: 'left', arrowright: 'right', pageup: 'up', pagedown: 'down' };
window.addEventListener('keyup', e => {
  const k = FLY_KEYS[e.key.toLowerCase()];
  if (k) fly.delete(k);
  if (e.key === 'Shift') flyFast = false;
});
window.addEventListener('blur', () => fly.clear());
function flyStep(dt) {
  if (!fly.size) {
    if (flyWasActive) { flyWasActive = false; dragging = false; camMoved(true); }
    return;
  }
  flyWasActive = true; dragging = true;
  const b = camBasis();
  const fwd = new THREE.Vector3(b.fwd.x, 0, b.fwd.z);
  if (fwd.lengthSq() < 1e-6) fwd.set(b.up.x, 0, b.up.z);
  fwd.normalize();
  const right = new THREE.Vector3(b.right.x, 0, b.right.z).normalize();
  const above = Math.max(2, camera3.position.y - surfaceY(camera3.position.x, camera3.position.z));
  const speed = clamp(above * 0.8 + camera3.position.distanceTo(orbit.target) * 0.15, 5, 20000) * (flyFast ? 3 : 1) * dt / 1000;
  const mv = new THREE.Vector3();
  if (fly.has('fwd')) mv.add(fwd); if (fly.has('back')) mv.sub(fwd);
  if (fly.has('right')) mv.add(right); if (fly.has('left')) mv.sub(right);
  if (fly.has('up')) mv.y += 1; if (fly.has('down')) mv.y -= 1;
  if (mv.lengthSq() === 0) return;
  mv.normalize().multiplyScalar(speed);
  camera3.position.add(mv); orbit.target.add(mv);
  camMoved(false);
}
function viewTop() {
  const d = Math.max(500, camera3.position.distanceTo(orbit.target));
  camera3.position.set(orbit.target.x, orbit.target.y + d, orbit.target.z + d * 0.01);
  camMoved(true);
}
function viewGround() {
  const b = camBasis();
  const fwd = new THREE.Vector3(b.fwd.x, 0, b.fwd.z);
  if (fwd.lengthSq() < 1e-6) fwd.set(b.up.x, 0, b.up.z);
  fwd.normalize();
  const p = camera3.position;
  p.y = surfaceY(p.x, p.z) + 6;
  const d = Math.max(300, Math.min(5000, orbit.target.distanceTo(p)));
  orbit.target.set(p.x + fwd.x * d, p.y, p.z + fwd.z * d);
  camMoved(true);
}
document.querySelectorAll('.nav-views button').forEach(b => b.addEventListener('click', () => {
  if (mode !== 'view') return;
  if (b.dataset.view === 'top') viewTop();
  else if (b.dataset.view === 'ground') viewGround();
  else frameSelection(true);
}));
function navFrame(now, dt) {
  if (centerAnim) {
    const k = Math.min(1, (now - centerAnim.t0) / centerAnim.dur);
    const s = k * k * (3 - 2 * k);
    orbit.target.lerpVectors(centerAnim.from, centerAnim.to, s);
    orbit.update();
    showMarker();
    resetTrace(k < 1);
    if (k >= 1) centerAnim = null;
  }
  if (mode === 'view') flyStep(Math.min(dt, 100));
  const on = mode === 'view' && now < markerUntil;
  marker.visible = on;
  if (on) {
    marker.position.copy(orbit.target);
    marker.scale.setScalar(camera3.position.distanceTo(orbit.target) * 0.006);
  }
}

function frameSelection(all) {
  const o = !all && selId && findObj(selId);
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
  camMoved(true);
}
$('#btnFrame').addEventListener('click', () => frameSelection(false));
$('#btnDelete').addEventListener('click', () => { if (selId) deleteObj(selId); });
$('#btnHide').addEventListener('click', () => { const o = selId && findObj(selId); if (o) toggleHidden(o); });
document.querySelectorAll('#gizmoModes button').forEach(b => b.addEventListener('click', () => setGizmo(b.dataset.gizmo)));
document.querySelectorAll('#shadeModes button').forEach(b => b.addEventListener('click', () => setShading(b.dataset.shade)));

window.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (mode !== 'view') return;
  const k = e.key.toLowerCase();
  if (e.key === 'Shift') flyFast = true;
  if (FLY_KEYS[k]) { e.preventDefault(); fly.add(FLY_KEYS[k]); return; }
  if (k === 'w') setGizmo('translate');
  else if (k === 'e') setGizmo('rotate');
  else if (k === 'r' && !e.ctrlKey && !e.metaKey) setGizmo('scale');
  else if (k === 'f') frameSelection(false);
  else if (k === 'escape') select(null);
  else if (k === 'h') { const o = selId && findObj(selId); if (o) toggleHidden(o); }
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
function createPlanet() {
  if (prims().length > MAX_OBJ - 2) { toast(`Al massimo ${MAX_OBJ} oggetti`); return; }
  // lontano davanti alla camera, alto sull'orizzonte
  const b = camBasis();
  const f = new THREE.Vector3(b.fwd.x, 0, b.fwd.z).normalize();
  const D = 30000, R = 2800;
  const pos = camera3.position.clone().addScaledVector(f, D);
  pos.y = camera3.position.y + D * Math.tan(12 * DEG);
  const pick1 = a => a[Math.floor(Math.random() * a.length)];
  const pal = pick1([['#f08a3c', '#7a3cb4', '#ffe2a8'], ['#3fa7ff', '#1d2fd0', '#c8f0ff'], ['#e86b9a', '#ffd166', '#5b2bd6'], ['#9be37a', '#2b7a5a', '#f2f7c4']]);
  const planet = mkPrim(0, { name: nextName('Pianeta'), material: 0, pattern: 2, color: pal[0], color2: pal[1], color3: pal[2], pscale: R * 0.8, shine: 0, sx: R, sy: R, sz: R, x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) });
  const ring = mkPrim(7, { name: nextName('Anelli'), material: 0, pattern: 3, color: '#f4d9a8', color2: '#b89a70', pscale: R * 0.22, shine: 0, p1: 0.45, sx: R * 2.1, sy: R * 2.1, sz: R * 2.1, x: planet.x, y: planet.y, z: planet.z, rx: 16, rz: -14 });
  for (const o of [planet, ring]) { S.objects.push(o); makeNode(o); }
  select(planet.id);
  resetTrace();
  toast('Pianeta e anelli sono due oggetti: puoi eliminare o nascondere gli anelli');
}
function create(kind) {
  if (mode !== 'view') return;
  if (kind === 'import') { modelPicker.click(); return; }
  if (kind === 'planet') { createPlanet(); return; }
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
    const SH = { sphere: 0, cube: 1, cylinder: 2, torus: 3, cone: 4, pyramid: 5, capsule: 6, ring: 7, arch: 8, blob: 9, dome: 10, light: 0 };
    const shape = SH[kind] ?? 0;
    const r = Math.round(clamp(dist * 0.06, 0.5, 5000) * 10) / 10;
    const light = kind === 'light';
    const bright = ['#d23a3a', '#2a6dff', '#f2c230', '#2bbf6a', '#ff6fd0', '#7a4dff'];
    o = mkPrim(shape, {
      name: nextName(light ? 'Luce' : SHAPES[shape]), x: Math.round(tgt.x), z: Math.round(tgt.z), sx: light ? r * 0.4 : r, sy: light ? r * 0.4 : r, sz: light ? r * 0.4 : r,
      material: light ? 3 : shape === 0 || shape === 3 || shape === 9 ? 1 : 0,
      color: light ? '#ffd9a0' : shape === 0 || shape === 3 || shape === 9 ? '#d8dde3' : bright[Math.floor(Math.random() * bright.length)],
      shine: 0.6,
    });
    if (shape === 4) { o.sx = o.sz = r * 0.4; o.sy = r * 1.5; o.material = 2; o.color = '#9fd8ff'; o.pscale = r * 0.3; }
  }
  S.objects.push(o);
  makeNode(o);
  if (o.type === 'prim') {
    // appoggia al suolo (la luce resta sospesa)
    o.y = 0; syncNode(o);
    nodes.get(o.id).root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(nodes.get(o.id).mesh);
    o.y = surfaceY(o.x, o.z, { exclude: o.id }) - b.min.y + (kind === 'light' ? o.sy * 5 : 0);
    syncNode(o);
  }
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
  // modello non piu' usato da nessun oggetto: si toglie dall'archivio
  if (o.shape === 11 && o.mesh && !prims().some(p => p.mesh === o.mesh)) { deleteMesh(o.mesh); meshStore.delete(o.mesh); }
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
    nodes.get(o.id).root.updateMatrixWorld(true);
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
      const row = el('div', 'ol-row' + (o.hidden ? ' off' : ''));
      const b = el('button', 'ol-item' + (o.id === selId ? ' on' : ''), `<svg viewBox="0 0 24 24">${ic}</svg><span>${o.name}</span>${dot}`);
      b.type = 'button';
      b.addEventListener('click', () => select(o.id));
      const eye = el('button', 'ol-act', `<svg viewBox="0 0 24 24">${o.hidden ? EYE_OFF : EYE}</svg>`);
      eye.type = 'button'; eye.title = o.hidden ? 'Mostra' : 'Nascondi';
      eye.addEventListener('click', () => toggleHidden(o));
      const del = el('button', 'ol-act del', `<svg viewBox="0 0 24 24">${TRASH}</svg>`);
      del.type = 'button'; del.title = 'Elimina';
      del.addEventListener('click', () => deleteObj(o.id));
      row.append(b, eye, del);
      ol.appendChild(row);
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
    const s0 = section('Tipo di cielo');
    select2(s0, 'Cielo', bind(S.sky, 'mode'), { fisico: 'Fisico (atmosfera reale)', dipinto: 'Dipinto (sfumatura libera)', spazio: 'Spaziale (stelle e nebulose)' }, v => {
      if (v === 'spazio') { S.sky.fog = 0; S.sky.skyLight = Math.min(S.sky.skyLight, 1.2); }
      onSky(); applyViewEnv(); renderTab();
    });
    if (S.sky.mode === 'dipinto') {
      color(s0, 'Colore in alto', bind(S.sky, 'zenith'), onSky);
      color(s0, 'Colore all’orizzonte', bind(S.sky, 'horizon'), onSky);
      color(s0, 'Colore sotto l’orizzonte', bind(S.sky, 'below'), onSky);
      const chips = el('div', 'chips');
      const SKIES = [
        ['Tramonto', '#3d4fc2', '#ff9a6b', '#3a2a36'], ['Vaporwave', '#2b1a6e', '#ff6fd0', '#1a0f2e'], ['Mezzogiorno', '#2a6be0', '#cfe4ff', '#5b6a78'],
        ['Alba lilla', '#6a7fe0', '#f6c9e8', '#4a3a5a'], ['Notte', '#060a1e', '#1c2a5a', '#05060c'],
      ];
      for (const [n, z, h, b] of SKIES) {
        const c = el('button', 'chip', `<i style="background:linear-gradient(${z},${h})"></i>${n}`);
        c.type = 'button';
        c.addEventListener('click', () => { Object.assign(S.sky, { zenith: z, horizon: h, below: b }); onSky(); renderTab(); });
        chips.appendChild(c);
      }
      s0.appendChild(chips);
    }
    if (S.sky.mode === 'spazio') {
      slider(s0, 'Stelle', bind(S.sky, 'stars'), 0, 1, 0.01, onScene, pct);
      slider(s0, 'Nebulose', bind(S.sky, 'nebula'), 0, 1, 0.01, onSky, pct);
      color(s0, 'Colore nebulosa 1', bind(S.sky, 'neb1'), onSky);
      color(s0, 'Colore nebulosa 2', bind(S.sky, 'neb2'), onSky);
      color(s0, 'Fondo dello spazio', bind(S.sky, 'zenith'), onSky);
    }
    if (S.sky.mode !== 'fisico') {
      slider(s0, 'Luminosità del cielo', bind(S.sky, 'bright'), 0.1, 4, 0.01, onSky, v => v.toFixed(2).replace('.', ','), { log: true });
      color(s0, 'Colore del sole', bind(S.sky, 'sunTint'), () => { onSky(); updateViewLights(); });
      slider(s0, 'Forza del sole', bind(S.sky, 'sunPow'), 0, 3, 0.01, () => { onSky(); updateViewLights(); }, pct);
    }
    s0.appendChild(el('p', 'hint', 'Per un pianeta nel cielo usa «Pianeta» nella barra Crea.'));
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
    if (S.sky.mode === 'fisico') {
      select2(s2, 'Tipo', bind(S.sky, 'atmos'), Object.fromEntries(Object.entries(ATMOS).map(([k, v]) => [k, v.name])), onSky);
      slider(s2, 'Limpidezza dell’aria', bind(S.sky, 'clarity'), 0, 1, 0.01, onSky, pct);
    }
    slider(s2, 'Luce del cielo (schiarisce le ombre)', bind(S.sky, 'skyLight'), 0.3, 5, 0.05, () => { applyViewEnv(); onScene(); }, v => v.toFixed(1).replace('.', ','), { log: true });
    slider(s2, 'Foschia', bind(S.sky, 'fog'), 0, 1, 0.01, () => { applyViewEnv(); onScene(); }, pct);
    slider(s2, 'Altezza della foschia', bind(S.sky, 'fogHeight'), 80, 4000, 10, onScene, fmtLen, { log: true });
    section(null, 'Le nuvole, l’acqua e il suolo sono oggetti: li aggiungi dalla barra «Crea» e li regoli selezionandoli.');
  },
  camera() {
    const s0 = section('Come muoversi', 'La vista gira sempre attorno a un centro (il pallino arancione che compare mentre ti muovi).');
    s0.appendChild(el('div', 'legend', [
      ['Trascina', 'gira attorno al centro'],
      ['Tasto destro', 'sposta la vista (sul telefono: due dita)'],
      ['Rotella', 'avvicina verso il punto indicato (sul telefono: pizzica)'],
      ['Doppio clic', 'quel punto diventa il nuovo centro, e va a fuoco'],
      ['Frecce', 'vola avanti, indietro e di lato'],
      ['PagSu / PagGiù', 'sali e scendi (Maiusc: più veloce)'],
      ['F', 'inquadra l’oggetto selezionato'],
    ].map(([a, b]) => `<b>${a}</b><span>${b}</span>`).join('')));
    s0.appendChild(el('p', 'hint', 'Gli stessi comandi sono nel riquadro in basso a destra della vista: trascina i pad o tieni premute le frecce.'));
    const tg = el('label', 'ctl ctl-inline toggle');
    tg.appendChild(el('span', 'ctl-name', 'Mostra i comandi a schermo'));
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = S.view.nav !== false;
    cb.addEventListener('change', () => { S.view.nav = cb.checked; $('#nav').hidden = !cb.checked; saveState(); });
    tg.appendChild(cb);
    s0.appendChild(tg);
    const s = section('Obiettivo');
    slider(s, 'Lunghezza focale', bind(S.camera, 'focal'), 12, 300, 1, v => { camera3.fov = 2 * Math.atan(12 / v) / DEG; camera3.updateProjectionMatrix(); resetTrace(); }, v => Math.round(v) + ' mm', { log: true });
    const row = el('div', 'row');
    button(row, 'Inquadra tutto', () => frameSelection(true));
    button(row, 'Dall’alto', viewTop);
    button(row, 'Rasoterra', viewGround);
    s.appendChild(row);
    const s2 = section('Profondità di campo', 'Il fuoco è sul centro della vista: fai doppio clic su un punto per centrarlo e metterlo a fuoco.');
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
    const s4 = section('Modelli 3D importati', 'Sopra questo limite il modello viene semplificato in automatico all’importazione. Meno triangoli = render più veloce.');
    select2(s4, 'Massimo triangoli per modello', bind(S.render, 'modelTris'), { 15000: '15.000 (leggero)', 30000: '30.000', 60000: '60.000 (consigliato)', 120000: '120.000', 250000: '250.000 (pesante)' }, saveState);
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
    button(row, 'Esporta', () => {
      syncCameraState();
      // i modelli 3D viaggiano dentro il file della scena
      const meshes = {};
      for (const o of prims()) if (o.shape === 11 && meshStore.has(o.mesh) && !meshes[o.mesh]) {
        const m = meshStore.get(o.mesh);
        meshes[o.mesh] = { name: m.name, half: m.half, orig: m.orig, pos: f32ToB64(m.pos), nor: f32ToB64(m.nor) };
      }
      download(new Blob([JSON.stringify(Object.assign({}, S, { meshes }))], { type: 'application/json' }), 'scena-orizzonte.json');
    });
    button(row, 'Importa…', () => $('#importFile').click());
    s3.appendChild(row);
  },
};

// ---------- Ripeti: copie in fila, cerchio, spirale o sparse ----------
const REP = { mode: 'spirale', count: 12, step: 3, radius: 6, turns: 1.5, rise: 0.8, scaleEnd: 0.5, face: true, spread: 25, vary: 0.4 };
function repeatEditor(o) {
  const s = section('Ripeti', 'Crea copie di questo oggetto con lo stesso materiale. Le misure sono in multipli della sua grandezza.');
  const size = Math.max(o.sx, o.sy, o.sz);
  const free = MAX_OBJ - prims().length;
  if (free <= 0) { s.appendChild(el('p', 'hint', `Hai già ${MAX_OBJ} oggetti: non ci sono posti per altre copie.`)); return; }
  REP.count = Math.min(REP.count, free);
  select2(s, 'Disposizione', bind(REP, 'mode'), { fila: 'In fila', cerchio: 'In cerchio', spirale: 'A spirale', sparse: 'Sparse sul terreno' }, () => renderTab());
  const noop = () => {};
  slider(s, 'Copie', bind(REP, 'count'), 1, free, 1, noop, v => String(v));
  const mult = v => '× ' + v.toFixed(1).replace('.', ',');
  if (REP.mode === 'fila') slider(s, 'Distanza tra le copie', bind(REP, 'step'), 1, 20, 0.1, noop, mult);
  if (REP.mode === 'cerchio') slider(s, 'Raggio del cerchio', bind(REP, 'radius'), 1, 40, 0.1, noop, mult);
  if (REP.mode === 'spirale') {
    slider(s, 'Raggio finale', bind(REP, 'radius'), 1, 40, 0.1, noop, mult);
    slider(s, 'Giri', bind(REP, 'turns'), 0.25, 6, 0.05, noop, v => v.toFixed(2).replace('.', ','));
    slider(s, 'Salita a ogni copia', bind(REP, 'rise'), -3, 3, 0.05, noop, mult);
  }
  if (REP.mode === 'sparse') {
    slider(s, 'Area', bind(REP, 'spread'), 3, 200, 1, noop, mult);
    slider(s, 'Varietà di grandezza', bind(REP, 'vary'), 0, 1, 0.01, noop, pct);
  } else slider(s, 'Grandezza dell’ultima copia', bind(REP, 'scaleEnd'), 0.1, 3, 0.01, noop, pct);
  if (REP.mode === 'cerchio' || REP.mode === 'spirale') {
    const tg = el('label', 'ctl ctl-inline toggle');
    tg.appendChild(el('span', 'ctl-name', 'Ruota le copie verso il centro'));
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = REP.face;
    cb.addEventListener('change', () => { REP.face = cb.checked; });
    tg.appendChild(cb);
    s.appendChild(tg);
  }
  const r = el('div', 'row');
  button(r, 'Crea le copie', () => makeCopies(o, size), 'accent');
  s.appendChild(r);
}
function makeCopies(o, size) {
  const n = Math.min(REP.count, MAX_OBJ - prims().length);
  const b = camBasis();
  const right = new THREE.Vector3(b.right.x, 0, b.right.z).normalize();
  const rnd = mulberry32((Math.random() * 1e9) | 0);
  const above = o.y - surfaceY(o.x, o.z);
  const created = [];
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    const c = JSON.parse(JSON.stringify(o));
    c.id = uid(); c.name = nextName(o.name.replace(/ \d+$/, ''));
    let sc = 1 + (REP.scaleEnd - 1) * f;
    if (REP.mode === 'fila') {
      c.x = o.x + right.x * REP.step * size * k; c.z = o.z + right.z * REP.step * size * k;
    } else if (REP.mode === 'cerchio') {
      const R = REP.radius * size;
      const a = 2 * Math.PI * k / (n + 1);
      const cx = o.x - right.x * R, cz = o.z - right.z * R;
      const a0 = Math.atan2(o.z - cz, o.x - cx);
      c.x = cx + Math.cos(a0 + a) * R; c.z = cz + Math.sin(a0 + a) * R;
      if (REP.face) c.ry = o.ry - a / DEG;
    } else if (REP.mode === 'spirale') {
      const R = (0.3 + (REP.radius - 0.3) * f) * size;
      const a = REP.turns * 2 * Math.PI * f;
      c.x = o.x + Math.cos(a) * R; c.z = o.z + Math.sin(a) * R;
      c.y = o.y + REP.rise * size * k;
      if (REP.face) c.ry = o.ry - a / DEG;
    } else {
      const a = rnd() * 2 * Math.PI, R = Math.sqrt(rnd()) * REP.spread * size;
      c.x = o.x + Math.cos(a) * R; c.z = o.z + Math.sin(a) * R;
      sc = 1 + (rnd() * 2 - 1) * REP.vary;
      c.ry = o.ry + rnd() * 360;
    }
    c.sx = o.sx * sc; c.sy = o.sy * sc; c.sz = o.sz * sc;
    if (c.pscale) c.pscale = o.pscale * sc;
    if (REP.mode !== 'spirale') c.y = surfaceY(c.x, c.z) + above * sc;
    c.x = Math.round(c.x * 100) / 100; c.z = Math.round(c.z * 100) / 100;
    S.objects.push(c);
    makeNode(c);
    created.push(c);
  }
  toast(`Create ${created.length} copie`);
  select(o.id);
  resetTrace();
}

// editor del materiale: oggetti e suolo
function materialEditor(o, ground) {
  const s = section('Materiale');
  const chips = el('div', 'chips');
  const presets = ground ? GROUND_PRESETS : MAT_PRESETS;
  for (const p of presets) {
    const b = el('button', 'chip', p.name);
    b.type = 'button';
    b.addEventListener('click', () => {
      const m = Object.assign({ shine: 0.3, mirror: 0 }, p.m);
      if (m._ps) { m.pscale = Math.max(0.05, Math.round(Math.max(o.sx, o.sy, o.sz) * m._ps * 100) / 100); delete m._ps; }
      Object.assign(o, m);
      onObj(o)(); renderTab();
    });
    chips.appendChild(b);
  }
  s.appendChild(chips);
  if (!ground) select2(s, 'Tipo', bind(o, 'material'), MATERIALS, () => { onObj(o)(); renderTab(); });
  select2(s, 'Motivo', bind(o, 'pattern'), ground ? { 0: 'Terra (rumore)', 1: 'Scacchiera', 2: 'Marmo psichedelico', 3: 'Strisce', 5: 'Immagine' } : PATTERNS, v => {
    if (v === 5 && !o.image) {
      if (S.images.length) o.image = S.images[S.images.length - 1].id;
      else { pickImage(id => { o.image = id; onObj(o)(); renderTab(); }); }
    }
    onObj(o)(); renderTab();
  });
  const pat = o.pattern;
  const n = pat === 0 || pat === 5 ? 1 : pat === 2 || pat === 4 ? 3 : 2;
  if (pat !== 5) {
    color(s, n > 1 ? 'Colore 1' : 'Colore', bind(o, 'color'), onObj(o));
    if (n > 1) color(s, 'Colore 2', bind(o, 'color2'), onObj(o));
    if (n > 2) color(s, 'Colore 3', bind(o, 'color3'), onObj(o));
  } else if (!ground) {
    const opts = Object.fromEntries(S.images.map(im => [im.id, im.name]));
    if (S.images.length) select2(s, 'Immagine', bind(o, 'image'), opts, onObj(o));
    const r = el('div', 'row');
    button(r, 'Carica un’immagine…', () => pickImage(id => { o.image = id; onObj(o)(); renderTab(); }));
    s.appendChild(r);
    s.appendChild(el('p', 'hint', `Fino a ${MAX_IMG} immagini per scena, ridotte a ${IMG_SIZE}×${IMG_SIZE}. Restano salvate nella scena.`));
  }
  if (pat === 1 || pat === 2 || pat === 3) slider(s, 'Grandezza del motivo', bind(o, 'pscale'), 0.05, 20000, 0.05, onObj(o), fmtLen, { log: true });
  const kind = ground ? 0 : o.material;
  if (kind === 0) {
    slider(s, 'Lucentezza', bind(o, 'shine'), 0, 1, 0.01, onObj(o), v => v === 0 ? 'opaco' : pct(v));
    slider(s, 'Specchio', bind(o, 'mirror'), 0, 1, 0.01, onObj(o), v => v === 0 ? 'no' : pct(v));
  }
  if (kind === 1 || kind === 2) slider(s, 'Ruvidità', bind(o, 'rough'), 0, 1, 0.01, onObj(o), pct);
  if (kind === 3) slider(s, 'Intensità della luce', bind(o, 'emit'), 0.5, 80, 0.5, onObj(o), v => v.toFixed(1).replace('.', ','), { log: true });
}

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
    const tg = el('label', 'ctl ctl-inline toggle');
    tg.appendChild(el('span', 'ctl-name', 'Sospeso nel vuoto (isola fluttuante)'));
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!o.floating;
    cb.addEventListener('change', () => {
      o.floating = cb.checked;
      // un'isola sospesa sta in aria: se poggia a terra la si alza
      if (o.floating && o.y < o.h * o.under * 1.6) o.y = Math.round(o.h * o.under * 1.8 + 100);
      onTerrainLook(o)(); renderTab();
    });
    tg.appendChild(cb);
    s2.appendChild(tg);
    if (o.floating) slider(s2, 'Profondità della roccia sotto', bind(o, 'under'), 0.2, 2, 0.01, onObj(o), pct);
    numbers(s2, [{ label: 'X (m)', b: bind(o, 'x') }, { label: 'Quota (m)', b: bind(o, 'y') }, { label: 'Z (m)', b: bind(o, 'z') }], onTerrainLook(o));
    const s3 = section('Colori');
    select2(s3, 'Tavolozza', bind(o, 'palette'), Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.name])), v => {
      o.snowLine = PALETTES[v].snowLine; o.rockSlope = PALETTES[v].rockSlope; onTerrainLook(o)(); setTimeout(renderTab);
    });
    slider(s3, 'Quota della neve', bind(o, 'snowLine'), 0, 1.2, 0.01, onTerrainLook(o), v => v > 1 ? 'niente neve' : pct(v));
    slider(s3, 'Roccia sui pendii', bind(o, 'rockSlope'), 0.05, 0.7, 0.01, onTerrainLook(o), v => pct(1 - v));
  },
  prim(o) {
    const s = section('Forma');
    if (o.shape === 11) {
      const m = meshStore.get(o.mesh);
      s.appendChild(el('p', 'hint', m ? `Modello importato «${m.name}»: ${m.tris.toLocaleString('it')} triangoli${m.orig > m.tris ? ` (semplificato da ${m.orig.toLocaleString('it')})` : ''}.` : 'Modello non ancora caricato.'));
    } else
    select2(s, 'Forma', bind(o, 'shape'), SHAPES, v => { if (SHAPE_PARAM[v]) o.p1 = SHAPE_PARAM[v][1]; onObj(o)(); renderTab(); });
    if (SHAPE_PARAM[o.shape]) slider(s, SHAPE_PARAM[o.shape][0], bind(o, 'p1'), 0, 1, 0.01, onObj(o), pct);
    if (o.shape === 9) {
      const r = el('div', 'row');
      button(r, 'Altra disposizione delle sfere', () => { o.seed = 1 + Math.floor(Math.random() * 99999); onObj(o)(); });
      s.appendChild(r);
    }
    materialEditor(o, false);
    const s2 = section('Dimensioni', 'Semiassi in metri (raggio per la sfera). Con R trascini le maniglie di scala.');
    const uni = { get: () => (o.sx + o.sy + o.sz) / 3, set: v => { const k = v / ((o.sx + o.sy + o.sz) / 3); o.sx *= k; o.sy *= k; o.sz *= k; } };
    slider(s2, 'Grandezza', uni, 0.1, 8000, 0.1, () => { onObj(o)(); syncPanelValues(); }, fmtLen, { log: true });
    numbers(s2, [{ label: 'X', b: bind(o, 'sx'), min: 0.05 }, { label: 'Y', b: bind(o, 'sy'), min: 0.05 }, { label: 'Z', b: bind(o, 'sz'), min: 0.05 }], onObj(o));
    const s3 = section('Posizione e rotazione');
    numbers(s3, [{ label: 'X (m)', b: bind(o, 'x') }, { label: 'Quota (m)', b: bind(o, 'y') }, { label: 'Z (m)', b: bind(o, 'z') }], onObj(o));
    numbers(s3, [{ label: 'Rot. X°', b: bind(o, 'rx') }, { label: 'Rot. Y°', b: bind(o, 'ry') }, { label: 'Rot. Z°', b: bind(o, 'rz') }], onObj(o));
    repeatEditor(o);
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
    // immagine sul pavimento, in evidenza
    const si = section('Immagine sul pavimento', 'Una tua foto o texture sul suolo: centrata sotto la scena, ripetuta come piastrelle oppure una volta sola.');
    const ri = el('div', 'row');
    button(ri, o.pattern === 5 ? 'Cambia immagine…' : 'Usa un’immagine…', () => pickImage(id => {
      o.image = id; if (o.pattern !== 5) { o.pattern = 5; o.pscale = 100; }
      onObj(o)(); renderTab();
    }), 'accent');
    if (o.pattern === 5) button(ri, 'Togli', () => { o.pattern = 0; onObj(o)(); renderTab(); });
    si.appendChild(ri);
    if (o.pattern === 5) {
      slider(si, 'Lato dell’immagine', bind(o, 'pscale'), 1, 50000, 0.5, onObj(o), fmtLen, { log: true });
      const tg = el('label', 'ctl ctl-inline toggle');
      tg.appendChild(el('span', 'ctl-name', 'Ripeti come piastrelle'));
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = o.imgRepeat !== false;
      cb.addEventListener('change', () => { o.imgRepeat = cb.checked; onObj(o)(); });
      tg.appendChild(cb);
      si.appendChild(tg);
      if (o.imgRepeat === false) color(si, 'Colore attorno all’immagine', bind(o, 'color'), onObj(o));
    }
    materialEditor(o, true);
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
  if (!Array.isArray(S.images)) S.images = [];
  imgCanvas.clear(); texCache.clear();
  S.objects.forEach(upgradeObj);
  for (const o of S.objects) makeNode(o);
  loadImages();
  ensureMeshes();
  camera3.fov = 2 * Math.atan(12 / S.camera.focal) / DEG;
  camera3.updateProjectionMatrix();
  if (!S.camera.snap) {
    camera3.position.fromArray(S.camera.pos);
    orbit.target.fromArray(S.camera.target);
    orbit.update();
  }
  selId = null; tc.detach();
  $('#nav').hidden = S.view.nav === false;
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
    const raw = JSON.parse(await f.text());
    const meshes = raw.meshes || {};
    delete raw.meshes;
    for (const [id, m] of Object.entries(meshes)) {
      const rec = { name: m.name, half: m.half, orig: m.orig, pos: b64ToF32(m.pos), nor: b64ToF32(m.nor) };
      await saveMesh(id, rec);
      prepareMesh(id, rec);
    }
    const ns = mergeDeep(baseState(), raw);
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
// prova automatica dell'import senza file: ?modello=1 (nodo toroidale generato, poi semplificato)
if (QP.get('modello')) setTimeout(async () => {
  try {
    const g = new THREE.TorusKnotGeometry(1, 0.32, 400, 48).toNonIndexed();
    let tris = new Float32Array(g.getAttribute('position').array);
    const orig = tris.length / 9;
    const { half } = normalizeTris(tris);
    tris = simplifyTris(tris, 8000);
    const { pos, nor } = computeNormals(tris);
    const id = uid();
    prepareMesh(id, { name: 'Nodo', pos, nor, half, orig });
    const o = mkPrim(11, { name: 'Nodo', mesh: id, material: 1, color: '#e6b450', rough: 0.05, x: 120, z: -40, sx: half[0] * 40, sy: half[1] * 40, sz: half[2] * 40, y: 60 });
    S.objects.push(o); makeNode(o); resetTrace();
    console.log('PROVA modello: triangoli', orig, '->', pos.length / 9, 'nodi BVH', meshStore.get(id).nodes.length / 8);
  } catch (err) { console.log('PROVA errore', err.message, err.stack); }
}, 1500);
requestAnimationFrame(frame);
window.__orizzonte = { state: () => S };
