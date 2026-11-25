// Orizzonte: stato della scena, pannelli, camera, anteprima progressiva e render finale.
'use strict';
(function () {
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DEG = Math.PI / 180;
  const T_SIZE = 16000;
  const MAX_OBJ = 8;
  const SUN_POWER = 12;
  // ?px=200000 limita la risoluzione dell'anteprima (prove automatiche)
  const TEST_MAXPX = parseInt(new URLSearchParams(location.search).get('px')) || 0;
  const STORE = 'orizzonte-scena-v1';

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

  // ---------- stato ----------
  function baseState() {
    return {
      terrain: { type: 'montagne', seed: 7, scale: 0.45, roughness: 0.55, erosion: 0.6, terraces: 0, height: 2200, resolution: 512, palette: 'alpino', snowLine: 0.68, rockSlope: 0.30 },
      sky: { sunElev: 22, sunAzim: 200, sunSize: 0.8, atmos: 'terra', clarity: 0.7, fog: 0.25, fogHeight: 900, skyLight: 1.8 },
      clouds: { cover: 0.4, density: 0.5, bottom: 2900, thickness: 1400, scale: 7000 },
      water: { on: true, level: 0.1, color: '#1f5868', clarity: 0.4, waves: 0.4 },
      objects: [],
      camera: { tx: 0, ty: 0, tz: 0, yaw: 0.6, pitch: 0.12, dist: 6500, focal: 35, blur: 0, focus: 0, snap: true },
      render: { format: '16:9', size: 1920, samples: 256, exposure: 1, contrast: 1, saturation: 1, vignette: 0.25 },
    };
  }
  function obj(shape, material, color, size, x, z, lift, extra) {
    return Object.assign({ shape, material, color, size, x, z, lift, rot: 0, rough: 0.05, emit: 6 }, extra || {});
  }
  function withPalette(s, key) {
    const p = PALETTES[key];
    s.terrain.palette = key; s.terrain.snowLine = p.snowLine; s.terrain.rockSlope = p.rockSlope;
    return s;
  }
  const PRESETS = [
    {
      name: 'Valle alpina', desc: 'Montagne erose, lago e luce del pomeriggio', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'montagne', seed: 11, scale: 0.4, erosion: 0.7, height: 2400 });
        withPalette(s, 'alpino');
        Object.assign(s.sky, { sunElev: 16, sunAzim: 120, fog: 0.3, fogHeight: 700 });
        Object.assign(s.water, { level: 0.08, color: '#24525c', clarity: 0.35 });
        Object.assign(s.camera, { yaw: 0.9, pitch: 0.1, dist: 7000 });
        return s;
      }
    },
    {
      name: 'Isola tropicale', desc: 'Acqua limpida, sole alto, nuvole basse', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'isola', seed: 4, scale: 0.35, erosion: 0.5, height: 1100 });
        withPalette(s, 'tropicale');
        Object.assign(s.water, { level: 0.2, color: '#1f9aa0', clarity: 0.85, waves: 0.35 });
        Object.assign(s.sky, { sunElev: 48, sunAzim: 160, clarity: 0.85, fog: 0.12 });
        Object.assign(s.clouds, { cover: 0.35, bottom: 1500, thickness: 900, scale: 4000 });
        Object.assign(s.camera, { dist: 9500, pitch: 0.22, yaw: 0.3 });
        return s;
      }
    },
    {
      name: 'Canyon al tramonto', desc: 'Altipiani a gradoni e sole radente', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'canyon', seed: 21, scale: 0.5, erosion: 0.45, height: 1300 });
        withPalette(s, 'deserto');
        s.water.on = false;
        Object.assign(s.sky, { sunElev: 9, sunAzim: 165, clarity: 0.5, fog: 0.2, fogHeight: 900 });
        Object.assign(s.clouds, { cover: 0.2 });
        Object.assign(s.camera, { dist: 4500, pitch: 0.08, yaw: 1.2 });
        return s;
      }
    },
    {
      name: 'Pianeta alieno', desc: 'Cielo viola, sfere di vetro e cromo', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'montagne', seed: 33, scale: 0.55, erosion: 0.8, height: 2800 });
        withPalette(s, 'alieno');
        Object.assign(s.sky, { atmos: 'viola', sunElev: 14, sunAzim: 75, sunSize: 1.5, fog: 0.2 });
        Object.assign(s.water, { level: 0.12, color: '#3a1d5a', clarity: 0.6 });
        s.objects = [
          obj(0, 2, '#e8f4ff', 320, -500, 300, 180),
          obj(0, 1, '#d8dde3', 240, 350, -150, 0),
        ];
        Object.assign(s.camera, { yaw: 0.2, pitch: 0.08, dist: 3200 });
        return s;
      }
    },
    {
      name: 'Fiordo nella nebbia', desc: 'Pareti a picco, nebbia bassa, alba fredda', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'montagne', seed: 5, scale: 0.35, roughness: 0.5, erosion: 0.9, height: 2600 });
        withPalette(s, 'artico');
        s.terrain.snowLine = 0.45;
        Object.assign(s.water, { level: 0.22, color: '#1a3a45', clarity: 0.3, waves: 0.2 });
        Object.assign(s.sky, { sunElev: 6, sunAzim: 140, clarity: 0.6, fog: 0.7, fogHeight: 350 });
        Object.assign(s.clouds, { cover: 0.55, bottom: 2300, thickness: 1200 });
        Object.assign(s.camera, { dist: 8000, pitch: 0.06, yaw: -0.4 });
        return s;
      }
    },
    {
      name: 'Sfera sul mare', desc: 'Una sfera cromata, il mare e il tramonto', make() {
        const s = baseState();
        Object.assign(s.terrain, { type: 'colline', seed: 3, scale: 0.3, erosion: 0.3, height: 600 });
        withPalette(s, 'vulcanico');
        Object.assign(s.water, { level: 0.55, color: '#123848', clarity: 0.5, waves: 0.5 });
        Object.assign(s.sky, { atmos: 'densa', sunElev: 4, sunAzim: 200, clarity: 0.55, fog: 0.15 });
        Object.assign(s.clouds, { cover: 0.5, density: 0.6, bottom: 2000, thickness: 1500 });
        s.objects = [obj(0, 1, '#e6e8ec', 120, 0, 0, 30)];
        Object.assign(s.camera, { yaw: 0, pitch: 0.04, dist: 700 });
        return s;
      }
    },
  ];

  let S = loadState() || PRESETS[0].make();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      return mergeDeep(baseState(), JSON.parse(raw));
    } catch (e) { return null; }
  }
  function saveState() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* niente */ }
  }
  function mergeDeep(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') mergeDeep(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  const getPath = p => p.split('.').reduce((o, k) => o[k], S);
  const setPath = (p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; };

  // ---------- utilita' ----------
  function lin(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v / 255, 2.2));
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function fmtLen(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
  const pct = v => Math.round(v * 100) + '%';
  function fmtTime(s) {
    if (!isFinite(s)) return '…';
    s = Math.round(s);
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    return m + ' min ' + (s % 60 ? (s % 60) + ' s' : '');
  }

  // ---------- terreno ----------
  let terrain = null;
  function heightAt(x, z) {
    if (!terrain) return 0;
    const N = terrain.N;
    const u = (x / T_SIZE + 0.5) * (N - 1), v = (z / T_SIZE + 0.5) * (N - 1);
    if (u < 0 || v < 0 || u >= N - 1 || v >= N - 1) return 0;
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j, h = terrain.h;
    const k = j * N + i;
    const a = h[k] * (1 - fx) + h[k + 1] * fx, b = h[k + N] * (1 - fx) + h[k + N + 1] * fx;
    return (a * (1 - fy) + b * fy) * S.terrain.height;
  }
  function surfaceAt(x, z) {
    const h = heightAt(x, z);
    return S.water.on ? Math.max(h, S.water.level * S.terrain.height) : h;
  }

  // ---------- renderer ----------
  const canvas = $('#cv');
  let R;
  try {
    R = new Renderer(canvas);
  } catch (e) {
    $('#fatal').hidden = false;
    $('#fatal-msg').textContent = e.message;
    console.error(e);
    return;
  }

  let scene = null;           // uniform pronti
  let skyDirty = true;
  let rect = { x: 0, y: 0, w: 1, h: 1 }, rectCss = { x: 0, y: 0, w: 1, h: 1 };
  let accFast = null, accFull = null, accFinal = null;
  let mode = 'preview';        // preview | final | done
  let lastChange = 0;
  let budget = 250000;
  let lastFrame = 0;
  let needShow = true;
  let finalStart = 0;
  let previewMax = 96;
  let busy = false;

  const Q_FAST = { bounces: 1, cloudSteps: 18, terrainSteps: 200, maxPasses: 1e9, seed: 0 };
  const Q_PREV = { bounces: 3, cloudSteps: 40, terrainSteps: 360, maxPasses: 96, seed: 0 };
  const Q_FINAL = { bounces: 4, cloudSteps: 72, terrainSteps: 520, maxPasses: 256, seed: 100000 };

  function sunDir() {
    const e = S.sky.sunElev * DEG, a = S.sky.sunAzim * DEG;
    return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  }
  function mieCoef() { return 3e-6 + (1 - S.sky.clarity) * 45e-6; }

  // trasmittanza dell'atmosfera lungo la direzione del sole (stessa fisica della texture del cielo)
  function sunColor(d) {
    const RE = 6360e3, RA = 6420e3, HR = 8000, HM = 1200;
    const r0 = RE + 2;
    const b = r0 * d[1], c = r0 * r0 - RA * RA;
    const tmax = -b + Math.sqrt(b * b - c);
    const cg = r0 * r0 - RE * RE;
    if (d[1] < 0 && b * b - cg > 0) return [0, 0, 0];
    const n = 64, seg = tmax / n;
    let oR = 0, oM = 0;
    for (let i = 0; i < n; i++) {
      const t = seg * (i + 0.5);
      const px = d[0] * t, py = r0 + d[1] * t, pz = d[2] * t;
      const hgt = Math.hypot(px, py, pz) - RE;
      oR += Math.exp(-hgt / HR) * seg; oM += Math.exp(-hgt / HM) * seg;
    }
    const ray = ATMOS[S.sky.atmos].r, mie = mieCoef();
    const P = SUN_POWER;
    return ray.map(r => Math.exp(-(r * oR + mie * 1.1 * oM)) * P);
  }

  function camera() {
    const c = S.camera;
    const cp = Math.cos(c.pitch);
    const pos = [c.tx + c.dist * cp * Math.sin(c.yaw), c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * cp * Math.cos(c.yaw)];
    const g = surfaceAt(pos[0], pos[2]) + 3;
    if (pos[1] < g) pos[1] = g;
    const fwd = norm(sub([c.tx, c.ty, c.tz], pos));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const tanHalf = 12 / c.focal;
    const focus = c.focus > 0 ? c.focus : Math.hypot(...sub([c.tx, c.ty, c.tz], pos));
    const aperture = c.blur * c.blur * 0.03 * focus;
    return { pos, fwd, right, up, tanHalf, focus, aperture };
  }

  function buildScene() {
    const pal = PALETTES[S.terrain.palette] || PALETTES.alpino;
    const objA = new Float32Array(MAX_OBJ * 4), objB = new Float32Array(MAX_OBJ * 4), objC = new Float32Array(MAX_OBJ * 4);
    S.objects.slice(0, MAX_OBJ).forEach((o, i) => {
      const y = surfaceAt(o.x, o.z) + o.size * (o.shape === 0 ? 0.92 : 1) + o.lift;
      objA.set([o.x, y, o.z, o.size], i * 4);
      objB.set([o.shape, o.material, o.rough, o.rot * DEG], i * 4);
      objC.set([...lin(o.color), o.emit], i * 4);
    });
    const sd = sunDir();
    scene = {
      cam: camera(),
      tSize: T_SIZE, tHeight: S.terrain.height,
      waterOn: S.water.on, waterLevel: S.water.level * S.terrain.height, waterClarity: S.water.clarity, waves: S.water.waves,
      waterColor: lin(S.water.color),
      sunDir: sd, sunColor: sunColor(sd), sunSize: S.sky.sunSize * DEG, sunPower: SUN_POWER,
      rayleigh: ATMOS[S.sky.atmos].r, mie: mieCoef(), skyLight: S.sky.skyLight,
      fogDensity: S.sky.fog > 0 ? 0.000003 + Math.pow(S.sky.fog, 2) * 0.0005 : 0, fogFalloff: 1 / S.sky.fogHeight,
      cloudCover: S.clouds.cover, cloudDensity: S.clouds.density, cloudBottom: S.clouds.bottom,
      cloudTop: S.clouds.bottom + S.clouds.thickness, cloudScale: S.clouds.scale,
      pal: {
        low: lin(pal.low), mid: lin(pal.mid), rock: lin(pal.rock), snow: lin(pal.snow), sand: lin(pal.sand),
        snowLine: S.terrain.snowLine, rockSlope: S.terrain.rockSlope,
      },
      objCount: Math.min(S.objects.length, MAX_OBJ), objA, objB, objC,
    };
  }

  // ---------- dimensioni ----------
  function aspect() { const f = FORMATS[S.render.format] || FORMATS['16:9']; return f[0] / f[1]; }
  function finalSize() {
    const a = aspect(), L = S.render.size;
    return a >= 1 ? [L, Math.round(L / a)] : [Math.round(L * a), L];
  }
  function layout() {
    const stage = $('#stage');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = stage.clientWidth, ch = stage.clientHeight;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    const pad = 16;
    const a = aspect();
    let w = cw - pad * 2, h = w / a;
    if (h > ch - pad * 2) { h = ch - pad * 2; w = h * a; }
    w = Math.max(16, w); h = Math.max(16, h);
    rectCss = { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
    rect = { x: rectCss.x * dpr, y: (ch - rectCss.y - h) * dpr, w: w * dpr, h: h * dpr };
    const frame = $('#frame');
    frame.style.left = rectCss.x + 'px'; frame.style.top = rectCss.y + 'px';
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    // accumulatori dell'anteprima
    let fw = Math.round(rect.w), fh = Math.round(rect.h);
    const maxPx = TEST_MAXPX || 2.4e6;
    if (fw * fh > maxPx) { const k = Math.sqrt(maxPx / (fw * fh)); fw = Math.round(fw * k); fh = Math.round(fh * k); }
    const sw = Math.max(8, Math.round(fw * 0.3)), sh = Math.max(8, Math.round(fh * 0.3));
    if (!accFull || accFull.w !== fw || accFull.h !== fh) { R.deleteAccum(accFull); accFull = R.createAccum(fw, fh); }
    if (!accFast || accFast.w !== sw || accFast.h !== sh) { R.deleteAccum(accFast); accFast = R.createAccum(sw, sh); }
    reset(true, true);
  }

  // keepFinal: un ridimensionamento della finestra non deve interrompere il render finale
  function reset(quiet, keepFinal) {
    if (mode !== 'preview' && !keepFinal) cancelFinal();
    if (accFast) R.clearAccum(accFast);
    if (accFull) R.clearAccum(accFull);
    scene = null;
    lastChange = performance.now();
    needShow = true;
    if (!quiet) saveState();
  }

  // ---------- generazione del terreno ----------
  let genTimer = 0;
  function scheduleTerrain(delay) {
    clearTimeout(genTimer);
    genTimer = setTimeout(regenTerrain, delay == null ? 250 : delay);
  }
  function regenTerrain() {
    busy = true;
    $('#busy').hidden = false;
    setTimeout(() => {
      const t0 = performance.now();
      terrain = generateHeightmap(S.terrain);
      R.setTerrain(terrain, buildNormalMap(terrain, T_SIZE, S.terrain.height));
      if (S.camera.snap) {
        S.camera.ty = surfaceAt(S.camera.tx, S.camera.tz) + 20;
        S.camera.snap = false;
      }
      busy = false;
      $('#busy').hidden = true;
      // prova automatica del render finale: ?finale=campioni
      const fq = parseInt(new URLSearchParams(location.search).get('finale'));
      if (fq && !window._finaleProva) { window._finaleProva = 1; S.render.samples = fq; S.render.size = 1280; setTimeout(startFinal, 50); }
      console.log('terreno generato in', Math.round(performance.now() - t0), 'ms');
      reset();
    }, 30);
  }
  function rebuildNormals() {
    if (!terrain) return;
    R.updateNormals(terrain.N, buildNormalMap(terrain, T_SIZE, S.terrain.height));
  }

  // ---------- cambi dai pannelli ----------
  function changed(kind) {
    switch (kind) {
      case 'terrain': scheduleTerrain(); break;
      case 'normals': rebuildNormals(); reset(); break;
      case 'sky': skyDirty = true; reset(); break;
      case 'format': layout(); saveState(); break;
      case 'display': needShow = true; saveState(); break;
      case 'none': saveState(); break;
      default: reset();
    }
  }

  // ---------- render finale ----------
  function startFinal() {
    if (busy) return;
    const [w, h] = finalSize();
    R.deleteAccum(accFinal);
    accFinal = R.createAccum(w, h);
    mode = 'final';
    finalStart = performance.now();
    budget = Math.max(budget, 150000);
    $('#renderbar').hidden = false;
    $('#btnSave').hidden = true;
    $('#btnCancel').textContent = 'Annulla';
    $('#btnRender').disabled = true;
    document.body.classList.add('rendering');
    needShow = true;
  }
  function cancelFinal() {
    mode = 'preview';
    R.deleteAccum(accFinal); accFinal = null;
    $('#renderbar').hidden = true;
    $('#btnRender').disabled = false;
    document.body.classList.remove('rendering');
    needShow = true;
  }
  async function savePNG() {
    if (!accFinal) return;
    const blob = await R.exportPNG(accFinal, S.render);
    const a = document.createElement('a');
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    a.download = `orizzonte-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('#btnRender').addEventListener('click', startFinal);
  $('#btnCancel').addEventListener('click', () => { cancelFinal(); });
  $('#btnSave').addEventListener('click', savePNG);

  // ---------- ciclo principale ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (busy || !terrain) return;
    const dprNow = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(canvas.width - Math.round(stage.clientWidth * dprNow)) > 1 || Math.abs(canvas.height - Math.round(stage.clientHeight * dprNow)) > 1) layout();
    if (!scene) buildScene();
    if (skyDirty) { R.renderSky(scene); skyDirty = false; }

    let shown = null, worked = false;
    if (mode === 'final' || mode === 'done') {
      const q = Object.assign({}, Q_FINAL, { maxPasses: S.render.samples });
      if (mode === 'final') {
        adapt(dt, 90);
        R.step(accFinal, scene, q, budget);
        worked = true;
        if (accFinal.passes >= q.maxPasses) {
          mode = 'done';
          $('#btnSave').hidden = false;
          $('#btnCancel').textContent = 'Chiudi';
          document.body.classList.remove('rendering');
        }
      }
      shown = accFinal;
      if (worked || needShow) updateStatus();
    } else {
      const interacting = now - lastChange < 220 || dragging;
      if (interacting || (accFull.passes === 0 && accFast.passes < 2)) {
        if (accFast.passes < 6 || !interacting) { R.step(accFast, scene, Q_FAST, accFast.w * accFast.h); worked = true; }
        shown = accFast;
      } else if (accFull.passes < previewMax) {
        adapt(dt, 45);
        R.step(accFull, scene, Q_PREV, budget);
        worked = true;
        shown = accFull.passes > 0 ? accFull : accFast;
      } else shown = accFull;
      if (worked || needShow) updateStatus();
    }
    if (worked || needShow) { R.show(shown, rect, S.render); needShow = false; }
  }
  function adapt(dt, target) {
    if (dt > target * 1.25) budget *= 0.8;
    else if (dt < target * 0.85) budget *= 1.12;
    budget = clamp(budget, 20000, 6e6);
  }
  function updateStatus() {
    const st = $('#status');
    if (mode === 'preview') {
      const n = accFull.passes;
      st.textContent = n > 0 ? `Anteprima · ${n}/${previewMax} campioni` : 'Anteprima veloce';
    } else {
      const [w, h] = finalSize();
      const n = accFinal.passes, tot = S.render.samples;
      const el = (performance.now() - finalStart) / 1000;
      const frac = (n + accFinal.tile / accFinal.tiles.length) / tot;
      const eta = frac > 0.01 ? el / frac - el : Infinity;
      $('#rb-fill').style.width = (frac * 100).toFixed(1) + '%';
      if (mode === 'done') {
        $('#rb-text').textContent = `Fatto: ${w}×${h}, ${tot} campioni in ${fmtTime(el)}`;
        st.textContent = 'Render completato';
      } else {
        $('#rb-text').textContent = `${w}×${h} · ${n}/${tot} campioni · mancano circa ${fmtTime(eta)}`;
        st.textContent = 'Render in corso';
      }
    }
  }

  // ---------- picking sulla CPU ----------
  function rayFromCss(mx, my) {
    const c = scene ? scene.cam : camera();
    const sx = ((mx - rectCss.x) / rectCss.w) * 2 - 1;
    const sy = -(((my - rectCss.y) / rectCss.h) * 2 - 1);
    if (Math.abs(sx) > 1 || Math.abs(sy) > 1) return null;
    const a = aspect();
    const d = norm([
      c.fwd[0] + c.right[0] * sx * c.tanHalf * a + c.up[0] * sy * c.tanHalf,
      c.fwd[1] + c.right[1] * sx * c.tanHalf * a + c.up[1] * sy * c.tanHalf,
      c.fwd[2] + c.right[2] * sx * c.tanHalf * a + c.up[2] * sy * c.tanHalf,
    ]);
    return { o: c.pos, d };
  }
  function pick(mx, my) {
    const r = rayFromCss(mx, my);
    if (!r) return null;
    const { o, d } = r;
    let best = { t: Infinity, obj: -1 };
    if (scene) for (let i = 0; i < scene.objCount; i++) {
      const cx = scene.objA[i * 4], cy = scene.objA[i * 4 + 1], cz = scene.objA[i * 4 + 2];
      const rad = scene.objA[i * 4 + 3] * (S.objects[i].shape === 0 ? 1 : 1.5);
      const oc = [o[0] - cx, o[1] - cy, o[2] - cz];
      const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
      const c2 = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - rad * rad;
      const h = b * b - c2;
      if (h >= 0) { const t = -b - Math.sqrt(h); if (t > 0 && t < best.t) best = { t, obj: i }; }
    }
    let t = 1, prev = 1;
    for (let i = 0; i < 3000 && t < 120000; i++) {
      const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      const dd = p[1] - surfaceAt(p[0], p[2]);
      if (dd < 0) {
        let a = prev, b = t;
        for (let j = 0; j < 20; j++) {
          const m = (a + b) / 2;
          if (o[1] + d[1] * m - surfaceAt(o[0] + d[0] * m, o[2] + d[2] * m) < 0) b = m; else a = m;
        }
        if (b < best.t) best = { t: b, obj: -1 };
        break;
      }
      prev = t;
      t += Math.max(dd * 0.4, 1 + t * 0.002);
    }
    if (!isFinite(best.t)) return null;
    best.p = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
    return best;
  }

  // ---------- mouse sulla scena ----------
  let dragging = false, dragBtn = 0, px0 = 0, py0 = 0, moved = 0, placing = false;
  const stage = $('#stage');
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => {
    if (mode !== 'preview') return;
    dragging = true; moved = 0;
    dragBtn = (e.button === 2 || e.shiftKey) ? 2 : 0;
    px0 = e.clientX; py0 = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - px0, dy = e.clientY - py0;
    px0 = e.clientX; py0 = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 3) return;
    const c = S.camera;
    if (dragBtn === 2) {
      const k = c.dist * 0.0016;
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      c.tx += (-cy * dx - sy * dy) * k;
      c.tz += (sy * dx - cy * dy) * k;
      c.tx = clamp(c.tx, -T_SIZE, T_SIZE); c.tz = clamp(c.tz, -T_SIZE, T_SIZE);
    } else {
      c.yaw -= dx * 0.005;
      c.pitch = clamp(c.pitch + dy * 0.004, -0.35, 1.45);
    }
    reset(true);
    syncCameraPanel();
  });
  stage.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    if (moved < 3) clickAt(e);
    saveState();
  });
  stage.addEventListener('wheel', e => {
    if (mode !== 'preview') return;
    e.preventDefault();
    S.camera.dist = clamp(S.camera.dist * Math.exp(e.deltaY * 0.0012), 20, 60000);
    reset(true);
    syncCameraPanel();
    clearTimeout(stage._wt); stage._wt = setTimeout(saveState, 400);
  }, { passive: false });
  stage.addEventListener('dblclick', e => {
    if (mode !== 'preview') return;
    const r = stage.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    S.camera.focus = Math.round(h.t);
    if (S.camera.blur === 0) S.camera.blur = 0.3;
    toast('A fuoco a ' + fmtLen(h.t));
    reset();
    renderTab();
  });
  function clickAt(e) {
    const r = stage.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (placing) {
      placing = false;
      stage.classList.remove('placing');
      const o = S.objects[selObj];
      if (h && o) { o.x = Math.round(h.p[0]); o.z = Math.round(h.p[2]); reset(); }
      renderTab();
      return;
    }
    if (h && h.obj >= 0) {
      selObj = h.obj;
      showTab('oggetti');
    }
  }

  // ---------- toast ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 1800);
  }

  // ---------- costruzione dei pannelli ----------
  const body = $('#tabbody');
  let curTab = 'scene';
  let selObj = 0;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function section(title, hint) {
    const s = el('section', 'sec');
    s.appendChild(el('h3', null, title));
    if (hint) s.appendChild(el('p', 'hint', hint));
    body.appendChild(s);
    return s;
  }
  function slider(parent, label, path, min, max, step, kind, fmt, opts) {
    opts = opts || {};
    const row = el('label', 'ctl');
    const head = el('div', 'ctl-head');
    const name = el('span', 'ctl-name', label);
    const val = el('span', 'ctl-val');
    head.append(name, val);
    const inp = document.createElement('input');
    inp.type = 'range';
    const toSlider = v => opts.log ? Math.log(v) : v;
    const fromSlider = v => opts.log ? Math.exp(v) : v;
    inp.min = toSlider(min); inp.max = toSlider(max); inp.step = opts.log ? 0.001 : step;
    const get = () => opts.get ? opts.get() : getPath(path);
    const set = v => opts.set ? opts.set(v) : setPath(path, v);
    inp.value = toSlider(get());
    val.textContent = fmt ? fmt(get()) : get();
    inp.addEventListener('input', () => {
      let v = fromSlider(parseFloat(inp.value));
      if (opts.log) v = Math.round(v / step) * step;
      set(v);
      val.textContent = fmt ? fmt(v) : v;
      changed(kind);
    });
    row.append(head, inp);
    parent.appendChild(row);
    row._sync = () => { inp.value = toSlider(get()); val.textContent = fmt ? fmt(get()) : get(); };
    return row;
  }
  function select(parent, label, path, options, kind, onSet) {
    const row = el('label', 'ctl');
    row.appendChild(el('div', 'ctl-head', `<span class="ctl-name">${label}</span>`));
    const s = document.createElement('select');
    for (const [k, v] of Object.entries(options)) { const o = document.createElement('option'); o.value = k; o.textContent = v; s.appendChild(o); }
    s.value = String(getPath(path));
    s.addEventListener('change', () => {
      const cur = getPath(path);
      const v = typeof cur === 'number' ? Number(s.value) : s.value;
      setPath(path, v);
      if (onSet) onSet(v);
      changed(kind);
    });
    row.appendChild(s);
    parent.appendChild(row);
    return row;
  }
  function color(parent, label, path, kind) {
    const row = el('label', 'ctl ctl-inline');
    row.appendChild(el('span', 'ctl-name', label));
    const c = document.createElement('input');
    c.type = 'color'; c.value = getPath(path);
    c.addEventListener('input', () => { setPath(path, c.value); changed(kind); });
    row.appendChild(c);
    parent.appendChild(row);
  }
  function toggle(parent, label, path, kind) {
    const row = el('label', 'ctl ctl-inline toggle');
    row.appendChild(el('span', 'ctl-name', label));
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!getPath(path);
    c.addEventListener('change', () => { setPath(path, c.checked); changed(kind); renderTab(); });
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

  let cameraRows = [];
  function syncCameraPanel() { for (const r of cameraRows) r._sync(); }

  const TABS = {
    scene() {
      const s = section('Scene pronte', 'Un punto di partenza: poi cambia quello che vuoi dagli altri pannelli.');
      const grid = el('div', 'presets');
      PRESETS.forEach(p => {
        const b = el('button', 'preset', `<strong>${p.name}</strong><span>${p.desc}</span>`);
        b.type = 'button';
        b.addEventListener('click', () => applyState(p.make()));
        grid.appendChild(b);
      });
      s.appendChild(grid);
      const s2 = section('Sorprendimi');
      button(s2, 'Scena casuale', randomScene, 'wide');
      const s3 = section('File della scena', 'La scena si salva da sola in questo browser. Per spostarla altrove esportala in un file.');
      const row = el('div', 'row');
      button(row, 'Esporta', exportScene);
      button(row, 'Importa…', () => $('#importFile').click());
      s3.appendChild(row);
    },
    terreno() {
      const s = section('Forma');
      select(s, 'Tipo', 'terrain.type', TERRAIN_TYPES, 'terrain');
      const seedRow = el('div', 'ctl');
      seedRow.appendChild(el('div', 'ctl-head', '<span class="ctl-name">Variante</span>'));
      const sr = el('div', 'row');
      const num = document.createElement('input');
      num.type = 'number'; num.min = 1; num.max = 99999; num.value = S.terrain.seed;
      num.addEventListener('change', () => { S.terrain.seed = Math.max(1, parseInt(num.value) || 1); changed('terrain'); });
      sr.appendChild(num);
      button(sr, 'Nuova', () => { S.terrain.seed = 1 + Math.floor(Math.random() * 99999); num.value = S.terrain.seed; changed('terrain'); });
      seedRow.appendChild(sr);
      s.appendChild(seedRow);
      slider(s, 'Rilievo', 'terrain.height', 200, 4500, 50, 'normals', fmtLen);
      slider(s, 'Grandezza delle forme', 'terrain.scale', 0, 1, 0.01, 'terrain', v => v < 0.33 ? 'grandi' : v < 0.66 ? 'medie' : 'piccole');
      slider(s, 'Rugosità', 'terrain.roughness', 0, 1, 0.01, 'terrain', pct);
      slider(s, 'Erosione', 'terrain.erosion', 0, 1, 0.01, 'terrain', pct);
      slider(s, 'Terrazze', 'terrain.terraces', 0, 1, 0.01, 'terrain', pct);
      select(s, 'Dettaglio', 'terrain.resolution', { 512: 'Normale (512)', 1024: 'Alto (1024, più lento)' }, 'terrain');
      const s2 = section('Colori');
      select(s2, 'Tavolozza', 'terrain.palette', Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.name])), 'scene', v => {
        S.terrain.snowLine = PALETTES[v].snowLine; S.terrain.rockSlope = PALETTES[v].rockSlope; setTimeout(renderTab);
      });
      slider(s2, 'Quota della neve', 'terrain.snowLine', 0, 1.2, 0.01, 'scene', v => v > 1 ? 'niente neve' : pct(v));
      slider(s2, 'Roccia sui pendii', 'terrain.rockSlope', 0.05, 0.7, 0.01, 'scene', v => pct(1 - v));
    },
    cielo() {
      const s = section('Sole');
      slider(s, 'Altezza', 'sky.sunElev', -4, 90, 0.5, 'sky', v => v.toFixed(1).replace('.', ',') + '°');
      slider(s, 'Direzione', 'sky.sunAzim', 0, 360, 1, 'sky', v => Math.round(v) + '°');
      slider(s, 'Ampiezza (ombre morbide)', 'sky.sunSize', 0.3, 6, 0.05, 'scene', v => v.toFixed(1).replace('.', ',') + '°');
      const row = el('div', 'row');
      button(row, 'Sole alle spalle', () => { S.sky.sunAzim = ((S.camera.yaw / DEG) % 360 + 360) % 360; changed('sky'); renderTab(); });
      button(row, 'Controluce', () => { S.sky.sunAzim = ((S.camera.yaw / DEG + 180) % 360 + 360) % 360; changed('sky'); renderTab(); });
      s.appendChild(row);
      const s2 = section('Atmosfera');
      select(s2, 'Tipo', 'sky.atmos', Object.fromEntries(Object.entries(ATMOS).map(([k, v]) => [k, v.name])), 'sky');
      slider(s2, 'Limpidezza dell’aria', 'sky.clarity', 0, 1, 0.01, 'sky', pct);
      slider(s2, 'Luce del cielo (schiarisce le ombre)', 'sky.skyLight', 0.3, 5, 0.05, 'scene', v => v.toFixed(1).replace('.', ','), { log: true });
      slider(s2, 'Foschia', 'sky.fog', 0, 1, 0.01, 'scene', pct);
      slider(s2, 'Altezza della foschia', 'sky.fogHeight', 80, 4000, 10, 'scene', fmtLen, { log: true });
      const s3 = section('Nuvole');
      slider(s3, 'Copertura', 'clouds.cover', 0, 1, 0.01, 'scene', v => v === 0 ? 'sereno' : pct(v));
      slider(s3, 'Densità', 'clouds.density', 0.05, 1, 0.01, 'scene', pct);
      slider(s3, 'Quota', 'clouds.bottom', 300, 8000, 50, 'scene', fmtLen);
      slider(s3, 'Spessore', 'clouds.thickness', 200, 4000, 50, 'scene', fmtLen);
      slider(s3, 'Grandezza', 'clouds.scale', 1500, 25000, 100, 'scene', fmtLen, { log: true });
    },
    acqua() {
      const s = section('Acqua');
      toggle(s, 'Mostra l’acqua', 'water.on', 'scene');
      if (!S.water.on) return;
      slider(s, 'Livello', 'water.level', 0, 0.8, 0.005, 'scene', v => fmtLen(v * S.terrain.height));
      color(s, 'Colore', 'water.color', 'scene');
      slider(s, 'Limpidezza', 'water.clarity', 0, 1, 0.01, 'scene', pct);
      slider(s, 'Onde', 'water.waves', 0, 1, 0.01, 'scene', pct);
    },
    oggetti() {
      const s = section('Oggetti', `Fino a ${MAX_OBJ}. Clic su un oggetto nella scena per selezionarlo.`);
      const row = el('div', 'row');
      const add = (shape, mat) => {
        if (S.objects.length >= MAX_OBJ) { toast('Massimo ' + MAX_OBJ + ' oggetti'); return; }
        const c = S.camera;
        const size = Math.max(5, Math.round(c.dist * 0.06));
        S.objects.push(obj(shape, mat, mat === 1 ? '#d8dde3' : mat === 2 ? '#eef6ff' : '#c9c2b8', size, Math.round(c.tx), Math.round(c.tz), 0));
        selObj = S.objects.length - 1;
        changed('scene'); renderTab();
      };
      button(row, '+ Sfera', () => add(0, 1));
      button(row, '+ Cubo', () => add(1, 0));
      button(row, '+ Cilindro', () => add(2, 2));
      s.appendChild(row);
      if (!S.objects.length) { s.appendChild(el('p', 'hint', 'Nessun oggetto. I nuovi oggetti compaiono al centro dell’inquadratura.')); return; }
      selObj = clamp(selObj, 0, S.objects.length - 1);
      const list = el('div', 'chips');
      S.objects.forEach((o, i) => {
        const b = el('button', 'chip' + (i === selObj ? ' on' : ''), `<i style="background:${o.color}"></i>${SHAPES[o.shape]} ${i + 1}`);
        b.type = 'button';
        b.addEventListener('click', () => { selObj = i; renderTab(); });
        list.appendChild(b);
      });
      s.appendChild(list);
      const o = S.objects[selObj], P = `objects.${selObj}.`;
      const s2 = section(`${SHAPES[o.shape]} ${selObj + 1}`);
      select(s2, 'Forma', P + 'shape', SHAPES, 'scene', () => setTimeout(renderTab));
      select(s2, 'Materiale', P + 'material', MATERIALS, 'scene', () => setTimeout(renderTab));
      color(s2, 'Colore', P + 'color', 'scene');
      if (o.material === 1 || o.material === 2) slider(s2, 'Ruvidità', P + 'rough', 0, 1, 0.01, 'scene', pct);
      if (o.material === 3) slider(s2, 'Intensità della luce', P + 'emit', 0.5, 60, 0.5, 'scene', v => v.toFixed(1).replace('.', ','), { log: true });
      slider(s2, 'Dimensione', P + 'size', 2, 3000, 1, 'scene', fmtLen, { log: true });
      slider(s2, 'Altezza dal suolo', P + 'lift', -0.9 * o.size, 3000, 1, 'scene', fmtLen);
      if (o.shape !== 0) slider(s2, 'Rotazione', P + 'rot', 0, 90, 1, 'scene', v => Math.round(v) + '°');
      const r2 = el('div', 'row');
      button(r2, 'Posiziona col clic', () => { placing = true; stage.classList.add('placing'); toast('Clic sul terreno per spostare l’oggetto'); }, 'accent');
      button(r2, 'Duplica', () => {
        if (S.objects.length >= MAX_OBJ) return;
        const c = JSON.parse(JSON.stringify(o)); c.x += o.size * 2.5;
        S.objects.push(c); selObj = S.objects.length - 1; changed('scene'); renderTab();
      });
      button(r2, 'Elimina', () => { S.objects.splice(selObj, 1); selObj = Math.max(0, selObj - 1); changed('scene'); renderTab(); }, 'danger');
      s2.appendChild(r2);
    },
    camera() {
      const s = section('Inquadratura', 'Trascina sulla scena per ruotare, rotella per avvicinarti, tasto destro o Maiusc+trascina per spostarti.');
      cameraRows = [
        slider(s, 'Distanza', 'camera.dist', 20, 60000, 1, 'scene', fmtLen, { log: true }),
        slider(s, 'Inclinazione', 'camera.pitch', -0.35, 1.45, 0.005, 'scene', v => Math.round(v / DEG) + '°'),
        slider(s, 'Rotazione', 'camera.yaw', -Math.PI, Math.PI, 0.005, 'scene', v => Math.round(((v / DEG) % 360 + 360) % 360) + '°', {
          get: () => Math.atan2(Math.sin(S.camera.yaw), Math.cos(S.camera.yaw)),
        }),
      ];
      slider(s, 'Obiettivo', 'camera.focal', 12, 300, 1, 'scene', v => Math.round(v) + ' mm', { log: true });
      const row = el('div', 'row');
      button(row, 'Torna al centro', () => {
        Object.assign(S.camera, { tx: 0, tz: 0 }); S.camera.ty = surfaceAt(0, 0) + 20; changed('scene'); renderTab();
      });
      s.appendChild(row);
      const s2 = section('Profondità di campo', 'Doppio clic su un punto della scena per mettere a fuoco lì.');
      slider(s2, 'Sfocatura', 'camera.blur', 0, 1, 0.01, 'scene', v => v === 0 ? 'nessuna' : pct(v));
      slider(s2, 'Distanza di messa a fuoco', 'camera.focus', 0, 60000, 1, 'scene', v => v === 0 ? 'sul centro' : fmtLen(v), {
        log: true, get: () => Math.max(1, S.camera.focus), set: v => { S.camera.focus = v <= 1.5 ? 0 : v; },
      });
    },
    render() {
      const s = section('Immagine finale');
      select(s, 'Formato', 'render.format', Object.fromEntries(Object.keys(FORMATS).map(k => [k, k])), 'format');
      select(s, 'Dimensione (lato lungo)', 'render.size', { 1280: '1280 px', 1920: '1920 px (Full HD)', 2560: '2560 px', 3840: '3840 px (4K)' }, 'none');
      select(s, 'Qualità', 'render.samples', { 64: 'Bozza (64 campioni)', 256: 'Buona (256)', 1024: 'Massima (1024)', 2048: 'Da esposizione (2048)' }, 'none');
      s.appendChild(el('p', 'hint', 'Più campioni = meno granulosità, ma più tempo. Puoi ritoccare i valori qui sotto anche a render finito.'));
      const s2 = section('Ritocco');
      slider(s2, 'Esposizione', 'render.exposure', 0.1, 4, 0.01, 'display', v => v.toFixed(2).replace('.', ','), { log: true });
      slider(s2, 'Contrasto', 'render.contrast', 0.6, 1.5, 0.01, 'display', pct);
      slider(s2, 'Saturazione', 'render.saturation', 0, 2, 0.01, 'display', pct);
      slider(s2, 'Vignettatura', 'render.vignette', 0, 1, 0.01, 'display', pct);
    },
  };

  function renderTab() {
    body.innerHTML = '';
    cameraRows = [];
    TABS[curTab]();
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === curTab));
  }
  function showTab(t) { curTab = t; renderTab(); }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function applyState(ns) {
    const oldT = JSON.stringify(S.terrain);
    const keepFormat = { format: S.render.format, size: S.render.size, samples: S.render.samples };
    S = ns;
    Object.assign(S.render, keepFormat);
    skyDirty = true;
    layout();
    if (JSON.stringify(S.terrain) !== oldT || !terrain) scheduleTerrain(0);
    else {
      rebuildNormals();
      if (S.camera.snap) { S.camera.ty = surfaceAt(S.camera.tx, S.camera.tz) + 20; S.camera.snap = false; }
      reset();
    }
    renderTab();
  }

  function randomScene() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick1 = a => a[Math.floor(Math.random() * a.length)];
    const s = baseState();
    const types = Object.keys(TERRAIN_TYPES);
    Object.assign(s.terrain, { type: pick1(types), seed: 1 + Math.floor(Math.random() * 99999), scale: rnd(0.2, 0.7), roughness: rnd(0.35, 0.7), erosion: rnd(0.3, 0.9), height: Math.round(rnd(700, 3000) / 50) * 50 });
    withPalette(s, pick1(Object.keys(PALETTES)));
    s.water.on = Math.random() < 0.7;
    s.water.level = rnd(0.05, 0.3);
    s.water.color = pick1(['#1f5868', '#1f9aa0', '#123848', '#2b4a3a', '#3a1d5a']);
    Object.assign(s.sky, { sunElev: rnd(3, 40), sunAzim: rnd(0, 360), atmos: Math.random() < 0.8 ? pick1(['terra', 'terra', 'densa']) : pick1(['marte', 'viola', 'verde']), clarity: rnd(0.4, 0.9), fog: rnd(0.1, 0.5) });
    Object.assign(s.clouds, { cover: rnd(0, 0.6), density: rnd(0.3, 0.8), bottom: rnd(1800, 4000) });
    Object.assign(s.camera, { yaw: rnd(-Math.PI, Math.PI), pitch: rnd(0.04, 0.25), dist: rnd(4000, 9000) });
    applyState(s);
  }
  function exportScene() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'scena-orizzonte.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const ns = mergeDeep(baseState(), JSON.parse(await f.text()));
      ns.camera.snap = false;
      applyState(ns);
      toast('Scena importata');
    } catch (err) { toast('File non valido'); }
    e.target.value = '';
  });

  // ---------- avvio ----------
  new ResizeObserver(() => { clearTimeout(window._rz); window._rz = setTimeout(layout, 100); }).observe(stage);
  const qp = new URLSearchParams(location.search);
  if (qp.has('scena')) {
    const i = parseInt(qp.get('scena')) - 1;
    if (PRESETS[i]) S = PRESETS[i].make();
  }
  if (TABS[qp.get('pannello')]) curTab = qp.get('pannello');
  renderTab();
  layout();
  scheduleTerrain(0);
  requestAnimationFrame(frame);

  // per le prove automatiche
  window.__orizzonte = { state: () => S, passes: () => accFull ? accFull.passes : 0, applyPreset: i => applyState(PRESETS[i].make()) };
})();
