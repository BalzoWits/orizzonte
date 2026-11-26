// Modelli 3D importati: lettura (OBJ, STL, GLB/GLTF), normalizzazione, semplificazione automatica,
// BVH per il path tracer e archivio nel browser (IndexedDB).
import * as THREE from '../lib/three.module.js';
import { OBJLoader } from '../lib/OBJLoader.js';
import { STLLoader } from '../lib/STLLoader.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { toCreasedNormals } from '../lib/BufferGeometryUtils.js';
import { openDB } from './store.js?v=10';

// ---------- lettura ----------
// Restituisce i triangoli (Float32Array, 9 numeri per triangolo) in coordinate del file.
export async function readModelFile(file) {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  let root;
  if (name.endsWith('.stl')) {
    const g = new STLLoader().parse(buf);
    root = new THREE.Mesh(g);
  } else if (name.endsWith('.obj')) {
    root = new OBJLoader().parse(new TextDecoder().decode(buf));
  } else if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    root = gltf.scene;
  } else throw new Error('Formato non riconosciuto: usa OBJ, STL, GLB o GLTF');
  root.updateMatrixWorld(true);
  const chunks = [];
  let total = 0;
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const p = g.getAttribute('position');
    if (!p) return;
    const idx = g.getIndex();
    const n = idx ? idx.count : p.count;
    const out = new Float32Array(Math.floor(n / 3) * 9);
    for (let i = 0; i < out.length / 3; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    chunks.push(out); total += out.length;
  });
  if (!total) throw new Error('Nel file non ho trovato triangoli');
  const tris = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { tris.set(c, o); o += c.length; }
  return tris;
}

// Porta i triangoli nel cubo [-1,1] per ogni asse; restituisce anche i semiassi originali (proporzioni).
export function normalizeTris(tris) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) {
    const x = tris[i + a];
    if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x;
  }
  const c = [0, 1, 2].map(a => (mn[a] + mx[a]) / 2);
  const h = [0, 1, 2].map(a => Math.max((mx[a] - mn[a]) / 2, 1e-6));
  const hmax = Math.max(...h);
  // assi quasi piatti: semiasse minimo all'1% per non dividere per zero
  const hs = h.map(x => Math.max(x, hmax * 0.01));
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) tris[i + a] = (tris[i + a] - c[a]) / hs[a];
  return { tris, half: hs };
}

// ---------- semplificazione per raggruppamento dei vertici ----------
// I vertici che cadono nella stessa cella di una griglia diventano uno solo (la media);
// i triangoli degeneri spariscono. La griglia si sceglie per stare sotto al limite di triangoli.
function clusterOnce(tris, G) {
  const nT = tris.length / 9;
  const cellOf = new Int32Array(nT * 3);
  const map = new Map();
  const sums = [];
  for (let i = 0; i < nT * 3; i++) {
    const x = tris[i * 3], y = tris[i * 3 + 1], z = tris[i * 3 + 2];
    const cx = Math.min(G - 1, Math.floor((x + 1) * 0.5 * G)), cy = Math.min(G - 1, Math.floor((y + 1) * 0.5 * G)), cz = Math.min(G - 1, Math.floor((z + 1) * 0.5 * G));
    const key = (cx * G + cy) * G + cz;
    let id = map.get(key);
    if (id === undefined) { id = sums.length / 4; map.set(key, id); sums.push(0, 0, 0, 0); }
    sums[id * 4] += x; sums[id * 4 + 1] += y; sums[id * 4 + 2] += z; sums[id * 4 + 3]++;
    cellOf[i] = id;
  }
  const seen = new Set();
  const out = [];
  for (let t = 0; t < nT; t++) {
    const a = cellOf[t * 3], b = cellOf[t * 3 + 1], c = cellOf[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((p, q) => p - q).join(',');
    if (seen.has(s)) continue;
    seen.add(s);
    for (const id of [a, b, c]) { const w = sums[id * 4 + 3]; out.push(sums[id * 4] / w, sums[id * 4 + 1] / w, sums[id * 4 + 2] / w); }
  }
  return new Float32Array(out);
}
export function simplifyTris(tris, maxTris) {
  const n = tris.length / 9;
  if (n <= maxTris) return tris;
  let lo = 8, hi = 2048, best = null;
  for (let it = 0; it < 11; it++) {
    const G = Math.round((lo + hi) / 2);
    const r = clusterOnce(tris, G);
    if (r.length / 9 <= maxTris) { best = r; lo = G + 1; } else hi = G - 1;
    if (hi < lo) break;
  }
  return best || clusterOnce(tris, 8);
}

// Normali con spigoli vivi oltre i 35 gradi
export function computeNormals(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(tris, 3));
  const c = toCreasedNormals(g, 35 * Math.PI / 180);
  const nor = new Float32Array(c.getAttribute('normal').array);
  const pos = new Float32Array(c.getAttribute('position').array);
  g.dispose(); c.dispose();
  return { pos, nor };
}

// ---------- BVH ----------
// nodi: 8 float (bmin, w0, bmax, w1); foglia: w0 = primo triangolo, w1 = quanti; interno: w0 = figlio destro, w1 = 0
export function buildBVH(pos) {
  const nT = pos.length / 9;
  const cen = new Float32Array(nT * 3), bmn = new Float32Array(nT * 3), bmx = new Float32Array(nT * 3);
  for (let t = 0; t < nT; t++) for (let a = 0; a < 3; a++) {
    const x0 = pos[t * 9 + a], x1 = pos[t * 9 + 3 + a], x2 = pos[t * 9 + 6 + a];
    bmn[t * 3 + a] = Math.min(x0, x1, x2); bmx[t * 3 + a] = Math.max(x0, x1, x2);
    cen[t * 3 + a] = (x0 + x1 + x2) / 3;
  }
  const order = new Uint32Array(nT);
  for (let i = 0; i < nT; i++) order[i] = i;
  const nodes = [];
  const LEAF = 4;
  function build(start, end) {
    const ni = nodes.length / 8;
    nodes.push(0, 0, 0, 0, 0, 0, 0, 0);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i];
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a], bmn[t * 3 + a]); mx[a] = Math.max(mx[a], bmx[t * 3 + a]);
        cmn[a] = Math.min(cmn[a], cen[t * 3 + a]); cmx[a] = Math.max(cmx[a], cen[t * 3 + a]);
      }
    }
    const b = ni * 8;
    nodes[b] = mn[0]; nodes[b + 1] = mn[1]; nodes[b + 2] = mn[2];
    nodes[b + 4] = mx[0]; nodes[b + 5] = mx[1]; nodes[b + 6] = mx[2];
    const count = end - start;
    let axis = 0;
    const ext = [cmx[0] - cmn[0], cmx[1] - cmn[1], cmx[2] - cmn[2]];
    if (ext[1] > ext[axis]) axis = 1; if (ext[2] > ext[axis]) axis = 2;
    if (count <= LEAF || ext[axis] < 1e-9) {
      nodes[b + 3] = start; nodes[b + 7] = count;
      return ni;
    }
    // divisione a meta' dei centroidi (ordinamento parziale)
    const sub = Array.from(order.subarray(start, end));
    sub.sort((p, q) => cen[p * 3 + axis] - cen[q * 3 + axis]);
    order.set(sub, start);
    const mid = start + (count >> 1);
    build(start, mid);
    const right = build(mid, end);
    nodes[b + 3] = right; nodes[b + 7] = 0;
    return ni;
  }
  build(0, nT);
  return { nodes: new Float32Array(nodes), order };
}

// ---------- archivio nel browser ----------
const db = openDB;
export async function saveMesh(id, rec) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction('meshes', 'readwrite'); tx.objectStore('meshes').put(rec, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('IndexedDB non disponibile', e); }
}
export async function loadMesh(id) {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const r = d.transaction('meshes').objectStore('meshes').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
  } catch (e) { return null; }
}
export async function deleteMesh(id) {
  try {
    const d = await db();
    d.transaction('meshes', 'readwrite').objectStore('meshes').delete(id);
  } catch (e) { /* niente */ }
}

// base64 per l'esportazione della scena
export function f32ToB64(a) {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToF32(b) {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Float32Array(u.buffer);
}
