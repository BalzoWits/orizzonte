// Generazione dei terreni (mappa di altezza), erosione idraulica e texture di rumore 3D.
// Tutto gira in JS sulla CPU: il risultato va in texture per lo shader e resta in memoria per il picking.
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rumore di Perlin 2D con permutazione dipendente dal seme
function makePerlin2D(seed) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = rng() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const h00 = p[p[X] + Y], h10 = p[p[X + 1] + Y], h01 = p[p[X] + Y + 1], h11 = p[p[X + 1] + Y + 1];
    const d00 = gx[h00] * xf + gy[h00] * yf;
    const d10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const d01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const d11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    const a = d00 + u * (d10 - d00), b = d01 + u * (d11 - d01);
    return (a + v * (b - a)) * 1.414; // circa [-1,1]
  };
}

const TERRAIN_TYPES = {
  montagne: 'Montagne',
  colline: 'Colline',
  isola: 'Isola',
  canyon: 'Canyon e altipiani',
  dune: 'Dune',
};

// p: { type, seed, scale, roughness, erosion, terraces, resolution }
function generateHeightmap(p, onProgress) {
  const N = p.resolution | 0;
  const h = new Float32Array(N * N);
  const noise = makePerlin2D(p.seed);
  const noise2 = makePerlin2D(p.seed + 1013);
  const gain = 0.35 + p.roughness * 0.3;     // persistenza
  const freq = 1.5 + p.scale * 5.0;          // quante "montagne" sul lato
  const octaves = N >= 1024 ? 10 : 9;

  const fbm = (x, y) => {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { s += a * noise(x * f, y * f); norm += a; a *= gain; f *= 2.03; }
    return s / norm;
  };
  const ridged = (x, y) => {
    let s = 0, a = 1, f = 1, w = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(noise(x * f, y * f));
      n = n * n;
      n *= w; w = Math.min(1, Math.max(0, n * 1.6));
      s += n * a; norm += a; a *= gain; f *= 2.07;
    }
    return s / norm;
  };

  for (let j = 0; j < N; j++) {
    const v = j / (N - 1);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      let x = u * freq, y = v * freq;
      // distorsione del dominio: forme meno "a griglia"
      const wx = noise2(x * 0.5 + 3.1, y * 0.5 + 7.7) * 0.6;
      const wy = noise2(x * 0.5 - 5.3, y * 0.5 + 1.9) * 0.6;
      x += wx; y += wy;
      let e;
      switch (p.type) {
        case 'montagne': e = ridged(x, y) * 0.85 + (fbm(x * 0.5, y * 0.5) * 0.5 + 0.5) * 0.35; break;
        case 'colline': e = fbm(x * 0.7, y * 0.7) * 0.5 + 0.5; e = e * e * 1.2; break;
        case 'isola': {
          const dx = u - 0.5, dy = v - 0.5;
          const r = Math.sqrt(dx * dx + dy * dy) * 2.0;
          const fall = Math.max(0, 1 - Math.pow(r * (1 + noise2(x, y) * 0.25), 1.6));
          e = (ridged(x, y) * 0.55 + (fbm(x, y) * 0.5 + 0.5) * 0.6) * fall;
          break;
        }
        case 'canyon': {
          let b = fbm(x * 0.6, y * 0.6) * 0.5 + 0.5;
          // altipiani piatti con pareti ripide
          const steps = 4;
          const s = b * steps, fl = Math.floor(s), fr = s - fl;
          const sharp = Math.pow(Math.min(1, Math.max(0, (fr - 0.55) / 0.2)), 1.5);
          b = (fl + sharp) / steps;
          e = b * 0.9 + (fbm(x * 3, y * 3) * 0.5 + 0.5) * 0.06;
          break;
        }
        case 'dune': {
          const ang = 0.6 + noise2(x * 0.3, y * 0.3) * 0.5;
          const d = (x * Math.cos(ang) + y * Math.sin(ang)) * 3.0 + noise(x * 0.8, y * 0.8) * 2.0;
          const crest = 1 - Math.abs(Math.sin(d));
          e = crest * crest * 0.35 * (0.6 + 0.4 * (fbm(x * 0.4, y * 0.4) * 0.5 + 0.5)) + (fbm(x * 0.5, y * 0.5) * 0.5 + 0.5) * 0.25;
          break;
        }
        default: e = fbm(x, y) * 0.5 + 0.5;
      }
      h[j * N + i] = e;
    }
  }
  normalize01(h);

  // terrazzamenti (prima dell'erosione, cosi' l'acqua li ammorbidisce)
  if (p.terraces > 0.01) {
    const steps = Math.round(4 + (1 - p.terraces) * 18);
    for (let k = 0; k < h.length; k++) {
      const s = h[k] * steps, fl = Math.floor(s), fr = s - fl;
      const t = fl + Math.pow(fr, 1 + p.terraces * 5);
      h[k] = h[k] * (1 - p.terraces) + (t / steps) * p.terraces;
    }
  }

  // bordo che scende a zero: il terreno si raccorda col piano infinito
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / (N - 1), v = j / (N - 1);
    const d = Math.min(u, 1 - u, v, 1 - v);
    const f = smooth01(d / 0.14);
    h[j * N + i] *= f;
  }

  const flow = new Float32Array(N * N);
  if (p.erosion > 0.01) {
    const drops = Math.floor(p.erosion * N * N * 0.6);
    erode(h, N, drops, mulberry32(p.seed * 7 + 3), flow);
  }
  // tieni il fondo a zero ma senza riscalare il resto
  let mn = Infinity;
  for (let k = 0; k < h.length; k++) if (h[k] < mn) mn = h[k];
  for (let k = 0; k < h.length; k++) h[k] = Math.max(0, h[k] - Math.max(0, mn));
  const flowBytes = new Uint8Array(N * N);
  let fmax = 0;
  for (let k = 0; k < flow.length; k++) if (flow[k] > fmax) fmax = flow[k];
  const lf = Math.log(1 + fmax * 0.25) || 1;
  for (let k = 0; k < flow.length; k++) flowBytes[k] = Math.round(Math.min(1, Math.log(1 + flow[k] * 0.25) / lf) * 255);
  return { N, h, flow, flowBytes };
}

// altezza normalizzata 0..1 con interpolazione bilineare (u,v in 0..1)
function sampleHeight(t, u, v) {
  const N = t.N;
  const x = Math.min(N - 1.001, Math.max(0, u * (N - 1))), y = Math.min(N - 1.001, Math.max(0, v * (N - 1)));
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j, h = t.h, k = j * N + i;
  const a = h[k] * (1 - fx) + h[k + 1] * fx, b = h[k + N] * (1 - fx) + h[k + N + 1] * fx;
  return a * (1 - fy) + b * fy;
}

// Griglia per la vista 3D: posizioni in spazio unitario (x,z in -0.5..0.5, y = altezza 0..1)
function terrainGrid(t, seg) {
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = i / seg, v = j / seg, k = (j * n + i) * 3;
    pos[k] = u - 0.5; pos[k + 1] = sampleHeight(t, u, v); pos[k + 2] = v - 0.5;
  }
  // si saltano i quadrati del tutto piatti a quota zero (il bordo che si raccorda col suolo)
  const idx = new Uint32Array(seg * seg * 6);
  let q = 0;
  const flat = k => pos[k * 3 + 1] < 0.002;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (flat(a) && flat(b) && flat(c) && flat(d)) continue;
    idx[q++] = a; idx[q++] = c; idx[q++] = b;
    idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  return { pos, idx: idx.slice(0, Math.max(q, 3)), n };
}

// Colori dei vertici (lineari) con le stesse regole dello shader, senza il rumore fine
function terrainColors(grid, t, o, pal, waterY) {
  const { pos, n } = grid;
  const col = new Float32Array(n * n * 3);
  const cellX = o.w / (n - 1), cellZ = o.d / (n - 1);
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const sm = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const hN = pos[k * 3 + 1];
    const l = pos[(j * n + Math.max(0, i - 1)) * 3 + 1], r = pos[(j * n + Math.min(n - 1, i + 1)) * 3 + 1];
    const dn = pos[(Math.max(0, j - 1) * n + i) * 3 + 1], up = pos[(Math.min(n - 1, j + 1) * n + i) * 3 + 1];
    const dx = (r - l) * o.h / (2 * cellX), dz = (up - dn) * o.h / (2 * cellZ);
    const ny = 1 / Math.sqrt(1 + dx * dx + dz * dz);
    const slope = 1 - ny;
    const fu = Math.min(t.N - 1, Math.round((i / (n - 1)) * (t.N - 1))), fv = Math.min(t.N - 1, Math.round((j / (n - 1)) * (t.N - 1)));
    const flow = t.flowBytes[fv * t.N + fu] / 255;
    let c = mix(pal.low, pal.mid, sm(0.08, 0.55, hN));
    c = mix(c, [c[0] * 0.6 + pal.sand[0] * 0.25, c[1] * 0.6 + pal.sand[1] * 0.25, c[2] * 0.6 + pal.sand[2] * 0.25], flow * 0.6);
    c = mix(c, pal.rock, sm(o.rockSlope - 0.07, o.rockSlope + 0.07, slope));
    const wy = o.y + hN * o.h;
    if (waterY !== null) c = mix(c, pal.sand, 1 - sm(waterY + 2, waterY + 20, wy));
    c = mix(c, pal.snow, sm(o.snowLine - 0.025, o.snowLine + 0.025, hN - slope * 0.45 + flow * 0.05));
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  return col;
}

function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }

function normalize01(a) {
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < a.length; k++) { if (a[k] < mn) mn = a[k]; if (a[k] > mx) mx = a[k]; }
  const r = mx - mn || 1;
  for (let k = 0; k < a.length; k++) a[k] = (a[k] - mn) / r;
}

// Erosione idraulica a gocce (schema classico: inerzia, capacita' di trasporto, deposito)
function erode(h, N, drops, rng, flow) {
  const inertia = 0.05, capF = 4, minCap = 0.01, depS = 0.3, eroS = 0.3, evap = 0.015, grav = 4, life = 40, R = 2;
  const bx = [], by = [], bw = [];
  let ws = 0;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d < R) { const w = 1 - d / R; bx.push(x); by.push(y); bw.push(w); ws += w; }
  }
  for (let k = 0; k < bw.length; k++) bw[k] /= ws;
  const B = bw.length;

  function hg(x, y, out) {
    const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
    const i = iy * N + ix;
    const a = h[i], b = h[i + 1], c = h[i + N], d = h[i + N + 1];
    out[0] = (b - a) * (1 - fy) + (d - c) * fy;
    out[1] = (c - a) * (1 - fx) + (d - b) * fx;
    out[2] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
  const g = [0, 0, 0], g2 = [0, 0, 0];
  for (let n = 0; n < drops; n++) {
    let x = 2 + rng() * (N - 5), y = 2 + rng() * (N - 5);
    let dx = 0, dy = 0, speed = 1, water = 1, sed = 0;
    for (let l = 0; l < life; l++) {
      const nx = x | 0, ny = y | 0;
      const ci = ny * N + nx;
      const ox = x - nx, oy = y - ny;
      hg(x, y, g);
      dx = dx * inertia - g[0] * (1 - inertia);
      dy = dy * inertia - g[1] * (1 - inertia);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) break;
      dx /= len; dy /= len;
      x += dx; y += dy;
      if (x < R + 1 || x >= N - R - 2 || y < R + 1 || y >= N - R - 2) break;
      hg(x, y, g2);
      const dh = g2[2] - g[2];
      const cap = Math.max(-dh * speed * water * capF, minCap);
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depS;
        sed -= amt;
        h[ci] += amt * (1 - ox) * (1 - oy);
        h[ci + 1] += amt * ox * (1 - oy);
        h[ci + N] += amt * (1 - ox) * oy;
        h[ci + N + 1] += amt * ox * oy;
      } else {
        const amt = Math.min((cap - sed) * eroS, -dh);
        for (let k = 0; k < B; k++) {
          const idx = (ny + by[k]) * N + nx + bx[k];
          const wa = amt * bw[k];
          const d = h[idx] < wa ? h[idx] : wa;
          h[idx] -= d; sed += d;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * grav));
      water *= 1 - evap;
      flow[ci] += water;
    }
  }
}

// Normali (rgb) + canali d'acqua dell'erosione (alpha), in RGBA8
function buildNormalMap(t, worldSize, worldHeight) {
  const { N, h, flow } = t;
  const out = new Uint8Array(N * N * 4);
  const cell = worldSize / (N - 1);
  let fmax = 0;
  for (let k = 0; k < flow.length; k++) if (flow[k] > fmax) fmax = flow[k];
  const lf = Math.log(1 + fmax * 0.25) || 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const l = h[j * N + Math.max(0, i - 1)], r = h[j * N + Math.min(N - 1, i + 1)];
    const d = h[Math.max(0, j - 1) * N + i], u = h[Math.min(N - 1, j + 1) * N + i];
    const nx = -(r - l) * worldHeight / (2 * cell);
    const nz = -(u - d) * worldHeight / (2 * cell);
    const len = Math.sqrt(nx * nx + 1 + nz * nz);
    const k = (j * N + i) * 4;
    out[k] = Math.round((nx / len * 0.5 + 0.5) * 255);
    out[k + 1] = Math.round((1 / len * 0.5 + 0.5) * 255);
    out[k + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
    out[k + 3] = Math.round(Math.min(1, Math.log(1 + flow[j * N + i] * 0.25) / lf) * 255);
  }
  return out;
}

// Texture 3D di rumore ripetibile 64^3: R = Perlin fbm, G = Perlin fine, B = Worley, A = Perlin largo
function buildNoise3D(S) {
  const rng = mulberry32(1234567);
  const G = 64;
  const grads = new Float32Array(G * G * G * 3);
  for (let i = 0; i < G * G * G; i++) {
    let x, y, z, l;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
    l = Math.sqrt(l); grads[i * 3] = x / l; grads[i * 3 + 1] = y / l; grads[i * 3 + 2] = z / l;
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function perlin(x, y, z, P) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    let res = 0;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    for (let c = 0; c < 8; c++) {
      const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1;
      const gx = ((xi + ox) % P + P) % P, gy = ((yi + oy) % P + P) % P, gz = ((zi + oz) % P + P) % P;
      const gi = ((gz * G + gy) * G + gx) * 3;
      const dot = grads[gi] * (xf - ox) + grads[gi + 1] * (yf - oy) + grads[gi + 2] * (zf - oz);
      res += dot * (ox ? u : 1 - u) * (oy ? v : 1 - v) * (oz ? w : 1 - w);
    }
    return res;
  }
  function worleyPts(C) {
    const pts = new Float32Array(C * C * C * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rng();
    return pts;
  }
  function worley(x, y, z, C, pts) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let md = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const wx = ((cx % C) + C) % C, wy = ((cy % C) + C) % C, wz = ((cz % C) + C) % C;
      const pi = ((wz * C + wy) * C + wx) * 3;
      const px = cx + pts[pi] - x, py = cy + pts[pi + 1] - y, pz = cz + pts[pi + 2] - z;
      const d = px * px + py * py + pz * pz;
      if (d < md) md = d;
    }
    return Math.sqrt(md);
  }
  const w1 = worleyPts(5), w2 = worleyPts(10), w3 = worleyPts(20);
  const data = new Uint8Array(S * S * S * 4);
  const cl = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / S, fy = y / S, fz = z / S;
    let r = 0, a = 0.5, n = 0;
    for (let o = 0, P = 4; o < 4; o++, P *= 2) { r += a * perlin(fx * P, fy * P, fz * P, P); n += a; a *= 0.5; }
    r = r / n * 1.6 + 0.5;
    let g = 0; a = 0.5; n = 0;
    for (let o = 0, P = 16; o < 3; o++, P *= 2) { g += a * perlin(fx * P, fy * P, fz * P, P); n += a; a *= 0.5; }
    g = g / n * 1.6 + 0.5;
    const b = 1 - (worley(fx * 5, fy * 5, fz * 5, 5, w1) * 0.625 + worley(fx * 10, fy * 10, fz * 10, 10, w2) * 0.25 + worley(fx * 20, fy * 20, fz * 20, 20, w3) * 0.125);
    const al = perlin(fx * 2, fy * 2, fz * 2, 2) * 1.4 + 0.5;
    const k = ((z * S + y) * S + x) * 4;
    data[k] = cl(r); data[k + 1] = cl(g); data[k + 2] = cl(b * 1.1 - 0.05); data[k + 3] = cl(al);
  }
  return data;
}
