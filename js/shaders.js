// Shader GLSL ES 3.00: atmosfera (texture del cielo), path tracer progressivo, visualizzazione.
'use strict';

const VS_QUAD = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Cielo: diffusione singola Rayleigh + Mie, cotta in una texture equirettangolare
const FS_SKY = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uSunDir;
uniform vec3 uRayleigh;   // coefficienti Rayleigh (1/m)
uniform float uMie;       // coefficiente Mie (1/m)
uniform float uSunPower;
uniform int uMode;                 // 0 fisico, 1 dipinto, 2 spaziale
uniform vec3 uZenith, uHorizon, uBelow, uSunTint, uNeb1, uNeb2;
uniform float uBright, uNebula;
out vec4 outColor;
const float PI = 3.14159265;
const float RE = 6360e3, RA = 6420e3, HR = 8000.0, HM = 1200.0;

float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }

// cieli non fisici: sfumatura dipinta o spazio con nebulose
vec3 artSky(vec3 rd){
  float y = rd.y;
  float mu = max(dot(rd, uSunDir), 0.0);
  vec3 glow = uSunTint * (pow(mu, 48.0)*0.6 + pow(mu, 6.0)*0.12);
  if (uMode == 1){
    vec3 c = y >= 0.0 ? mix(uHorizon, uZenith, pow(y, 0.45)) : mix(uHorizon, uBelow, pow(-y, 0.35));
    return (c + glow) * uBright;
  }
  vec3 c = uZenith * 0.025;
  float n = fbm(rd*2.2 + 4.0);
  float neb = smoothstep(0.42, 0.85, n) * uNebula;
  vec3 nc = mix(uNeb1, uNeb2, smoothstep(0.3, 0.7, fbm(rd*4.5 + 11.0)));
  c += nc * neb * (0.35 + 0.65*fbm(rd*9.0));
  return (c + glow*0.5) * uBright;
}

vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd), c = dot(ro, ro) - r*r, d = b*b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d); return vec2(-b - d, -b + d);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float phi = (uv.x - 0.5) * 2.0 * PI;
  float el = (uv.y - 0.5) * PI;
  if (uMode != 0){
    outColor = vec4(artSky(vec3(cos(el)*cos(phi), sin(el), cos(el)*sin(phi))), 1.0);
    return;
  }
  float elc = max(el, 0.0);
  vec3 rd = vec3(cos(elc)*cos(phi), sin(elc), cos(elc)*sin(phi));
  vec3 ro = vec3(0.0, RE + 2.0, 0.0);
  float tmax = raySphere(ro, rd, RA).y;
  const int NV = 24, NL = 8;
  float seg = tmax / float(NV);
  float odR = 0.0, odM = 0.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float mu = dot(rd, uSunDir);
  float phR = 3.0 / (16.0*PI) * (1.0 + mu*mu);
  float g = 0.76;
  float phM = 3.0/(8.0*PI) * ((1.0-g*g)*(1.0+mu*mu)) / ((2.0+g*g)*pow(1.0+g*g-2.0*g*mu, 1.5));
  for (int i = 0; i < NV; i++){
    vec3 p = ro + rd * (seg * (float(i) + 0.5));
    float hgt = length(p) - RE;
    float hr = exp(-hgt/HR)*seg, hm = exp(-hgt/HM)*seg;
    odR += hr; odM += hm;
    float tl = raySphere(p, uSunDir, RA).y;
    float sl = tl / float(NL);
    float lR = 0.0, lM = 0.0; bool ok = true;
    for (int j = 0; j < NL; j++){
      vec3 q = p + uSunDir * (sl * (float(j) + 0.5));
      float hq = length(q) - RE;
      if (hq < 0.0) { ok = false; break; }
      lR += exp(-hq/HR)*sl; lM += exp(-hq/HM)*sl;
    }
    if (ok){
      vec3 tau = uRayleigh*(odR + lR) + uMie*1.1*(odM + lM);
      vec3 att = exp(-tau);
      sumR += att*hr; sumM += att*hm;
    }
  }
  vec3 col = (sumR*uRayleigh*phR + sumM*uMie*phM) * uSunPower;
  // sotto l'orizzonte: tono scuro del suolo lontano
  if (el < 0.0) col *= mix(0.35, 1.0, exp(el*12.0));
  outColor = vec4(col, 1.0);
}`;

const MAX_TER = 4, MAX_OBJ = 48, OBJ_W = 16, MAX_IMG = 4, IMG_SIZE = 512, MESH_TEX_W = 2048;

const FS_TRACE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;

#define MAX_TER ${MAX_TER}
#define MAX_OBJ ${MAX_OBJ}
#define PI_C 3.14159265
#ifndef TER_N
#define TER_N uTerCount
#endif
#ifndef OBJ_N
#define OBJ_N uObjCount
#endif
#ifndef STYLE
#define STYLE STYLE
#endif
#ifdef NO_WATER
#define WATER_ON false
#else
#define WATER_ON (uWaterOn == 1)
#endif
#ifdef NO_GROUND
#define GROUND_ON false
#else
#define GROUND_ON (uGroundOn == 1)
#endif

uniform vec2 uRes;
uniform int uFrame;
uniform int uStyle;          // 0 fotorealistico, 1 classico, 2 illustrato
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform float uTanHalf, uAspect, uAperture, uFocus;
uniform sampler2DArray uHeights;   // R: altezza 0..1
uniform sampler2DArray uFlows;     // R: canali d'acqua dell'erosione
uniform sampler3D uNoise;
uniform sampler2D uSky;
// terreni
uniform int uTerCount;
uniform vec4 uTerPos[MAX_TER];     // x, y base, z, rotazione Y
uniform vec4 uTerSize[MAX_TER];    // larghezza, altezza, profondita', layer
uniform vec3 uTerLow[MAX_TER], uTerMid[MAX_TER], uTerRock[MAX_TER], uTerSnow[MAX_TER], uTerSand[MAX_TER];
uniform vec2 uTerMat[MAX_TER];     // quota neve, pendenza roccia
// piani infiniti
uniform int uGroundOn;
uniform float uGroundY;
uniform vec3 uGroundColor, uGroundColor2, uGroundColor3;
uniform vec4 uGroundPat;           // motivo, scala, immagine, specchio
uniform float uGroundShine;
uniform int uGroundImgRepeat;
uniform highp sampler2DArray uImages;   // immagini caricate dall'utente (sRGB)
uniform sampler2D uObjTex;         // dati degli oggetti: una riga per oggetto
uniform sampler2D uMeshNodes;      // BVH dei modelli importati: 2 texel per nodo
uniform sampler2D uMeshTris;       // triangoli: 3 vertici + 3 normali per triangolo
uniform int uWaterOn;
uniform float uWaterLevel, uWaterClarity, uWaves;
uniform vec3 uWaterColor;
uniform float uCloudCover, uCloudDensity, uCloudBottom, uCloudTop, uCloudScale;
// luce e aria
uniform vec3 uSunDir, uSunColor;
uniform float uSunSize;
uniform float uFogDensity, uFogFalloff, uSkyLight;
uniform int uSkyMode;
uniform float uStars;
uniform float uTerFloat[MAX_TER];  // terreni sospesi: profondita' della parte sotto (0 = poggiati)
uniform int uCloudSteps, uBounces, uTerrainSteps;
// oggetti (righe di uObjTex):
// 0 centro, forma | 1 semiassi, tipo materiale | 2-4 colonne mondo->locale | 5 colore, ruvidita'
// 6 colore 2, specchio | 7 colore 3, lucentezza | 8 motivo, scala motivo, immagine, emissione
// 9 parametro forma, - | 10-15 sfere del blob (centro, raggio)
uniform int uObjCount;
uniform int uUsePrev;
uniform int uZero;   // vale 0: rende i limiti dei cicli non costanti (Direct3D non li srotola)
uniform sampler2D uPrev;

out vec4 outColor;
const float PI = 3.14159265;
const float INF = 1e9;

uint rngState;
uint pcg(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(){ rngState = pcg(rngState); return float(rngState) * (1.0/4294967296.0); }

vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }

vec3 cosineDir(vec3 n){
  float r1 = rnd(), r2 = rnd();
  float phi = 2.0*PI*r1, r = sqrt(r2);
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0)));
  vec3 b = cross(n, t);
  return normalize(t*cos(phi)*r + b*sin(phi)*r + n*sqrt(1.0 - r2));
}
vec3 coneDir(vec3 d, float cosMax){
  float r1 = rnd(), r2 = rnd();
  float cosT = 1.0 - r1*(1.0 - cosMax);
  float sinT = sqrt(max(0.0, 1.0 - cosT*cosT));
  float phi = 2.0*PI*r2;
  vec3 t = normalize(abs(d.y) < 0.99 ? cross(d, vec3(0,1,0)) : cross(d, vec3(1,0,0)));
  vec3 b = cross(d, t);
  return normalize(t*cos(phi)*sinT + b*sin(phi)*sinT + d*cosT);
}
vec3 randSphere(){
  float z = rnd()*2.0 - 1.0, a = rnd()*2.0*PI, r = sqrt(max(0.0, 1.0 - z*z));
  return vec3(r*cos(a), z, r*sin(a));
}
float hg(float c, float g){ float g2 = g*g; return (1.0 - g2) / (4.0*PI*pow(max(1.0 + g2 - 2.0*g*c, 1e-4), 1.5)); }

// ---------- cielo ----------
vec3 skyTex(vec3 d){
  float u = atan(d.z, d.x) / (2.0*PI) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return textureLod(uSky, vec2(u, v), 0.0).rgb;
}
// stelle (cielo spaziale): punti nitidi calcolati per direzione, non nella texture
vec3 starField(vec3 d){
  vec3 q = d * 260.0;
  vec3 c = floor(q), f = fract(q);
  float h = fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  if (h > uStars * 0.08) return vec3(0);
  vec3 o = vec3(fract(h*13.1), fract(h*71.7), fract(h*37.3))*0.7 + 0.15;
  float r = length(f - o);
  float b = pow(fract(h*91.3), 4.0)*60.0 + 3.0;
  vec3 col = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.82, 0.62), fract(h*5.3));
  return col * b * smoothstep(0.14, 0.0, r);
}
vec3 skyRadiance(vec3 d, bool withSun){
  vec3 c = skyTex(d);
  if (uSkyMode == 2) c += starField(d);
  if (withSun){
    float cr = cos(uSunSize);
    float ca = dot(d, uSunDir);
    if (ca > cr){
      float limb = 1.0 - 0.6*(1.0 - sqrt(max(0.0, 1.0 - (1.0 - ca)/(1.0 - cr))));
      c += uSunColor * limb / (2.0*PI*(1.0 - cr));
    }
  }
  return c;
}

// ---------- terreni (spazio locale: origine al centro della base, ruotato in Y) ----------
float terH(int i, vec2 q){
  vec4 S = uTerSize[i];
  vec2 uv = q / S.xz + 0.5;
  float h = textureLod(uHeights, vec3(uv, S.w), 0.0).r * S.y;
  float m = smoothstep(0.0, 0.06*S.y, h);
  float f = 1.0 / max(S.x, S.z);
  h += ((textureLod(uNoise, vec3(q*f*17.6, 0.37), 0.0).r - 0.5)*0.03
      + (textureLod(uNoise, vec3(q*f*75.0, 0.81), 0.0).g - 0.5)*0.01) * S.y * m;
  return h;
}
// sotto dei terreni sospesi: la forma si specchia verso il basso, frastagliata
float terBot(int i, vec2 q, float h){
  vec4 S = uTerSize[i];
  float f = 1.0 / max(S.x, S.z);
  float n = textureLod(uNoise, vec3(q*f*23.0, 0.55), 0.0).r*0.7 + textureLod(uNoise, vec3(q*f*90.0, 0.15), 0.0).g*0.3;
  return -uTerFloat[i] * h * (0.55 + 0.9*n);
}
// distanza (approssimata) dalla superficie: > 0 fuori, < 0 dentro la roccia
float terF(int i, vec3 p){
#ifdef NO_FLOAT
  return p.y - terH(i, p.xz);
#endif
  float h = terH(i, p.xz);
  if (uTerFloat[i] <= 0.0) return p.y - h;
  return max(p.y - h, terBot(i, p.xz, h) - p.y);
}
// normale sopra (bottom = false) o sotto: differenze centrali, una sola chiamata in un ciclo
vec3 terNormalAny(int i, vec2 q, float t, bool bottom){
  float e = max(0.5, t*0.0012);
  float v[4];
  for (int k = 0; k < 4 + uZero; k++){
    vec2 o = k == 0 ? vec2(e, 0.0) : k == 1 ? vec2(-e, 0.0) : k == 2 ? vec2(0.0, e) : vec2(0.0, -e);
    float h = terH(i, q + o);
    v[k] = bottom ? terBot(i, q + o, h) : h;
  }
  float gx = v[0] - v[1], gz = v[2] - v[3];
  return bottom ? normalize(vec3(gx, -2.0*e, gz)) : normalize(vec3(-gx, 2.0*e, -gz));
}
bool traceTer(int i, vec3 ro, vec3 rd, float tmax, int steps, float k, out float tHit){
  vec4 P = uTerPos[i], S = uTerSize[i];
  vec3 lo = rotY(ro - P.xyz, -P.w), ld = rotY(rd, -P.w);
  vec3 bmin = vec3(-0.5*S.x, -1.0 - S.y*uTerFloat[i]*1.5, -0.5*S.z);
  vec3 bmax = vec3(0.5*S.x, S.y*1.03 + 1.0, 0.5*S.z);
  vec3 inv = 1.0 / ld;
  vec3 t0 = (bmin - lo)*inv, t1 = (bmax - lo)*inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float ta = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
  float tb = min(min(tmx.x, tmx.y), min(tmx.z, tmax));
  if (ta >= tb) return false;
  // marcia e affinamento (bisezione) nello stesso ciclo: terF compare una volta sola
  float minStep = max(0.05, 0.0004*max(S.x, S.z));
  float t = ta, tp = ta, a = 0.0, b = 0.0;
  bool refine = false;
  int ri = 0, ms = 0;
  for (int s = 0; s < 720 + uZero; s++){
    float tt = refine ? 0.5*(a + b) : t;
    float d = terF(i, lo + ld*tt);
    if (refine){
      if (d < 0.0) b = tt; else a = tt;
      ri++;
      if (ri >= 7){ tHit = b; return true; }
      continue;
    }
    if (d < 0.0){
      if (ms == 0){ tHit = t; return true; }
      refine = true; a = tp; b = t;
      continue;
    }
    if (ms >= steps) return false;
    ms++;
    tp = t;
    t += max(d*k, minStep + t*0.0012);
    if (t > tb) return false;
  }
  return false;
}

// ---------- oggetti (spazio locale unitario) ----------
vec4 OT(int i, int k){ return texelFetch(uObjTex, ivec2(k, i), 0); }

float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h*h*k*0.25; }
float sdPyramid(vec3 p, float h){
  float m2 = h*h + 0.25;
  p.xz = abs(p.xz);
  p.xz = (p.z > p.x) ? p.zx : p.xz;
  p.xz -= 0.5;
  vec3 q = vec3(p.z, h*p.y - 0.5*p.x, h*p.x + 0.5*p.y);
  float s = max(-q.x, 0.0);
  float t = clamp((q.y - 0.5*p.z) / (m2 + 0.25), 0.0, 1.0);
  float a = m2*(q.x + s)*(q.x + s) + q.y*q.y;
  float b = m2*(q.x + 0.5*t)*(q.x + 0.5*t) + (q.y - m2*t)*(q.y - m2*t);
  float d2 = min(q.y, -q.x*m2 - q.y*0.5) > 0.0 ? 0.0 : min(a, b);
  return sqrt((d2 + q.z*q.z) / m2) * sign(max(q.z, -p.y));
}
float sdCappedCone(vec3 p, float h, float r1, float r2){
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0*h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2*clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s*sqrt(min(dot(ca, ca), dot(cb, cb)));
}
// forme a distanza (3 toro, 4 cono, 5 piramide, 6 capsula, 7 anello, 8 arco, 9 blob, 10 cupola), spazio unitario
float sdfObj(int i, int shape, vec3 q){
  float p1 = OT(i, 9).x;
  if (shape == 3){ float r = clamp(p1, 0.05, 0.5); return length(vec2(length(q.xz) - (1.0 - r), q.y)) - r; }
  if (shape == 4) return sdCappedCone(q, 1.0, 1.0, clamp(p1, 0.0, 1.0));
  if (shape == 5) return sdPyramid(vec3(q.x*0.5, (q.y + 1.0)*0.5, q.z*0.5), 1.0) * 2.0;
  if (shape == 6){ float r = clamp(p1, 0.1, 1.0); return length(q - vec3(0.0, clamp(q.y, -(1.0 - r), 1.0 - r), 0.0)) - r; }
  if (shape == 7){ float w = p1*0.45 + 0.02; return max(abs(length(q.xz) - (1.0 - w)) - w, abs(q.y) - 0.04); }
  if (shape == 8){ float r = clamp(p1, 0.05, 0.5); float d = length(vec2(length(q.xy) - (1.0 - r), q.z)) - r; return max(d, -q.y); }
  if (shape == 9){
    float k = p1*0.6 + 0.05;
    float d = 1e5;
    for (int b = 0; b < 6 + uZero; b++){
      vec4 s = OT(i, 10 + b);
      if (s.w <= 0.0) break;
      d = smin(d, length(q - s.xyz) - s.w, k);
    }
    return d;
  }
  float t = p1*0.3 + 0.02;
  return max(abs(length(q) - (1.0 - t)) - t, -q.y);
}
vec3 sdfNormal(int i, int shape, vec3 q){
  // un solo sdfObj in un ciclo: meno codice da compilare
  vec3 n = vec3(0);
  for (int k = 0; k < 4; k++){
    vec3 e = vec3(((k + 3) >> 1) & 1, (k >> 1) & 1, k & 1) * 2.0 - 1.0;
    n += e * sdfObj(i, shape, q + e*0.0008);
  }
  return normalize(n);
}

vec4 MNf(int i){ return texelFetch(uMeshNodes, ivec2(i % ${MESH_TEX_W}, i / ${MESH_TEX_W}), 0); }
vec4 MTf(int i){ return texelFetch(uMeshTris, ivec2(i % ${MESH_TEX_W}, i / ${MESH_TEX_W}), 0); }
// modello importato: BVH con pila, triangoli Moller-Trumbore, normali interpolate (spazio unitario)
bool traceMesh(int root, vec3 lo, vec3 ld, float eps, out float tOut, out vec3 nOut){
  vec3 inv = 1.0 / ld;
  int stack[32];
  int sp = 0;
  stack[sp++] = root;
  float best = INF; vec3 bn = vec3(0, 1, 0);
  for (int it = 0; it < 2048 + uZero; it++){
    if (sp == 0) break;
    int ni = stack[--sp];
    vec4 a = MNf(ni*2), b = MNf(ni*2 + 1);
    vec3 t0 = (a.xyz - lo)*inv, t1 = (b.xyz - lo)*inv;
    vec3 tmn = min(t0, t1), tmx = max(t0, t1);
    float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
    if (tn > tf || tf < eps || tn > best) continue;
    if (b.w > 0.5){
      int start = int(a.w + 0.5), cnt = int(b.w + 0.5);
      for (int k = 0; k < cnt; k++){
        int tb = (start + k) * 6;
        vec3 v0 = MTf(tb).xyz, v1 = MTf(tb + 1).xyz, v2 = MTf(tb + 2).xyz;
        vec3 e1 = v1 - v0, e2 = v2 - v0;
        vec3 pv = cross(ld, e2);
        float det = dot(e1, pv);
        if (abs(det) < 1e-14) continue;
        float id = 1.0 / det;
        vec3 tv = lo - v0;
        float u = dot(tv, pv) * id;
        if (u < 0.0 || u > 1.0) continue;
        vec3 qv = cross(tv, e1);
        float v = dot(ld, qv) * id;
        if (v < 0.0 || u + v > 1.0) continue;
        float tt = dot(e2, qv) * id;
        if (tt > eps && tt < best){
          best = tt;
          bn = MTf(tb + 3).xyz*(1.0 - u - v) + MTf(tb + 4).xyz*u + MTf(tb + 5).xyz*v;
          if (dot(bn, bn) < 1e-8) bn = cross(e1, e2);
        }
      }
    } else if (sp < 30){
      stack[sp++] = int(a.w + 0.5);
      stack[sp++] = ni + 1;
    }
  }
  if (best >= INF) return false;
  tOut = best; nOut = normalize(bn);
  return true;
}

// t piu' vicino > eps, normale esterna (mondo) e punto locale in metri
bool hitObject(int i, vec3 ro, vec3 rd, out float tOut, out vec3 nOut, out vec3 lp){
  vec4 P = OT(i, 0);
  // scarto veloce con la sfera che contiene l'oggetto
  float br = OT(i, 9).w;
  vec3 oc = ro - P.xyz;
  float bb = dot(oc, rd), bc = dot(oc, oc) - br*br;
  if (bc > 0.0 && (bb > 0.0 || bb*bb - bc < 0.0)) return false;
  vec4 Sc = OT(i, 1);
  vec3 s = Sc.xyz;
  mat3 M = mat3(OT(i, 2).xyz, OT(i, 3).xyz, OT(i, 4).xyz);
  vec3 lo = (M * (ro - P.xyz)) / s;
  vec3 ld = (M * rd) / s;
  float eps = 0.001 * min(s.x, min(s.y, s.z));
  int shape = int(P.w + 0.5);
  float t = INF; vec3 nl = vec3(0);
  if (shape == 0){
    float a = dot(ld, ld), b = dot(lo, ld), c = dot(lo, lo) - 1.0, h = b*b - a*c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t = (-b - h) / a; if (t < eps) t = (-b + h) / a; if (t < eps) return false;
    nl = lo + ld*t;
  } else if (shape == 1){
    vec3 inv = 1.0 / ld;
    vec3 t0 = (-vec3(1.0) - lo)*inv, t1 = (vec3(1.0) - lo)*inv;
    vec3 tmn = min(t0, t1), tmx = max(t0, t1);
    float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
    if (tn > tf) return false;
    if (tn > eps){ t = tn; nl = -sign(ld) * step(tmn.yzx, tmn) * step(tmn.zxy, tmn); }
    else if (tf > eps){ t = tf; nl = sign(ld) * step(tmx, tmx.yzx) * step(tmx, tmx.zxy); }
    else return false;
  } else if (shape == 2){
    float a = dot(ld.xz, ld.xz);
    if (a > 1e-12){
      float b = dot(lo.xz, ld.xz), c = dot(lo.xz, lo.xz) - 1.0, h = b*b - a*c;
      if (h >= 0.0){
        h = sqrt(h);
        for (int k = 0; k < 2; k++){
          float tt = (-b + (k == 0 ? -h : h)) / a;
          float y = lo.y + ld.y*tt;
          if (tt > eps && tt < t && abs(y) <= 1.0){ t = tt; vec2 q = lo.xz + ld.xz*tt; nl = vec3(q.x, 0.0, q.y); }
        }
      }
    }
    if (abs(ld.y) > 1e-12){
      for (int k = 0; k < 2; k++){
        float yc = k == 0 ? 1.0 : -1.0;
        float tt = (yc - lo.y) / ld.y;
        vec2 q = lo.xz + ld.xz*tt;
        if (tt > eps && tt < t && dot(q, q) <= 1.0){ t = tt; nl = vec3(0.0, yc, 0.0); }
      }
    }
    if (t >= INF) return false;
#ifndef NO_MESH
  } else if (shape == 11){
    int root = int(OT(i, 9).y + 0.5);
    if (OT(i, 9).y < 0.0 || !traceMesh(root, lo, ld, eps, t, nl)) return false;
#endif
#ifndef NO_SDF
  } else if (shape >= 3 && shape <= 10){
    // forme a distanza: si cammina dentro il cubo unitario che le contiene
    vec3 inv = 1.0 / ld;
    vec3 t0 = (-vec3(1.002) - lo)*inv, t1 = (vec3(1.002) - lo)*inv;
    vec3 tmn = min(t0, t1), tmx = max(t0, t1);
    float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
    if (tn > tf || tf < eps) return false;
    float il = 1.0 / length(ld);
    float tt = max(tn, eps);
    // marcia e poi 4 campioni per la normale nello stesso ciclo: sdfObj compare una volta sola
    float sg = 1.0;
    bool hit = false;
    int nk = 0;
    vec3 nacc = vec3(0), qh = vec3(0);
    for (int k = 0; k < 168 + uZero; k++){
      vec3 e = vec3(((nk + 3) >> 1) & 1, (nk >> 1) & 1, nk & 1) * 2.0 - 1.0;
      float d0 = sdfObj(i, shape, hit ? qh + e*0.0008 : lo + ld*tt);
      if (hit){ nacc += e * d0; nk++; if (nk >= 4) break; continue; }
      if (k == 0) sg = d0 < 0.0 ? -1.0 : 1.0;
      float d = sg * d0;
      if (d < 0.0004){ hit = true; qh = lo + ld*tt; continue; }
      tt += d * il;
      if (tt > tf) break;
    }
    if (!hit) return false;
    t = tt;
    nl = dot(nacc, nacc) > 0.0 ? normalize(nacc) : normalize(qh);
#endif
  } else {
    return false;
  }
  tOut = t;
  lp = (lo + ld*t) * s;
  nOut = normalize((nl / s) * M);
  return true;
}

// ---------- scena ----------
// id: 0 cielo, 1 terreno, 2 suolo, 3 acqua, 10+i oggetti
struct Hit { float t; vec3 n; int id; int sub; vec3 lp; };

Hit traceScene(vec3 ro, vec3 rd, int steps, float k, bool shadowRay){
  Hit h; h.t = INF; h.id = 0; h.sub = 0; h.n = vec3(0,1,0); h.lp = vec3(0);
  float t;
  for (int i = 0; i < TER_N; i++){
    if (traceTer(i, ro, rd, h.t, steps, k, t) && t < h.t){ h.t = t; h.id = 1; h.sub = i; }
  }
  if (GROUND_ON && rd.y < 0.0 && ro.y > uGroundY){
    t = (uGroundY - ro.y) / rd.y;
    if (t < h.t - 0.01){ h.t = t; h.id = 2; h.n = vec3(0,1,0); }
  }
  if (WATER_ON && !shadowRay){
    t = (uWaterLevel - ro.y) / rd.y;
    if (t > 0.0 && t < h.t){ h.t = t; h.id = 3; h.n = vec3(0, ro.y > uWaterLevel ? 1.0 : -1.0, 0); }
  }
  for (int i = 0; i < OBJ_N; i++){
    vec3 n, lp;
    if (hitObject(i, ro, rd, t, n, lp) && t < h.t){ h.t = t; h.n = n; h.id = 10 + i; h.lp = lp; }
  }
  return h;
}

// ---------- nuvole ----------
float cloudDens(vec3 p, bool detail){
  float th = uCloudTop - uCloudBottom;
  float hN = (p.y - uCloudBottom) / th;
  if (hN < 0.0 || hN > 1.0) return 0.0;
  vec3 q = p / uCloudScale;
  vec4 big = textureLod(uNoise, q*vec3(0.18, 0.5, 0.18) + vec3(0.13, 0.0, 0.71), 0.0);
  vec4 n = textureLod(uNoise, q*vec3(1.0, 0.8, 1.0), 0.0);
  float cover = clamp(uCloudCover * (0.55 + 0.9*big.a), 0.0, 1.0);
  float prof = smoothstep(0.0, 0.12, hN) * smoothstep(1.0, 0.3 + 0.3*big.r, hN);
  float base = n.r*0.55 + n.b*0.45;
  float d = (base - (1.0 - cover)) / max(cover, 0.05);
  d = clamp(d, 0.0, 1.0) * prof;
  if (detail && d > 0.0){
    float det = textureLod(uNoise, q*4.3, 0.0).g*0.6 + textureLod(uNoise, q*9.1, 0.0).b*0.4;
    d = clamp((d - det*0.32*(1.0 - d*0.5)) / 0.7, 0.0, 1.0);
  }
  return d;
}
float cloudSigma(){ return uCloudDensity * 0.03; }

float cloudShadow(vec3 p){
#ifdef NO_CLOUDS
  return 1.0;
#endif
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.02) return 1.0;
  float mid = mix(uCloudBottom, uCloudTop, 0.45);
  if (p.y > mid) return 1.0;
  vec3 q = p + uSunDir * ((mid - p.y) / uSunDir.y);
  float d = cloudDens(q, false);
  return exp(-d * cloudSigma() * (uCloudTop - uCloudBottom) * 0.6);
}

vec4 clouds(vec3 ro, vec3 rd, float tMax){
#ifdef NO_CLOUDS
  return vec4(0,0,0,1);
#endif
  if (uCloudCover <= 0.001 || abs(rd.y) < 1e-5) return vec4(0,0,0,1);
  float ta = (uCloudBottom - ro.y) / rd.y, tb = (uCloudTop - ro.y) / rd.y;
  if (ta > tb){ float s = ta; ta = tb; tb = s; }
  ta = max(ta, 0.0); tb = min(tb, min(tMax, 80000.0));
  if (ta >= tb) return vec4(0,0,0,1);
  int N = uCloudSteps;
  float dt = (tb - ta) / float(N);
  float t = ta + dt*rnd();
  float sig = cloudSigma();
  float mu = dot(rd, uSunDir);
  float ph = mix(hg(mu, 0.75), hg(mu, -0.25), 0.35);
  vec3 ambTop = skyTex(vec3(0,1,0)) * 1.2;
  vec3 ambBot = skyTex(normalize(vec3(rd.x, 0.05, rd.z))) * 0.5;
  vec3 acc = vec3(0); float Tr = 1.0;
  float th = uCloudTop - uCloudBottom;
  for (int i = 0; i < N; i++){
    vec3 p = ro + rd*t;
    float d = cloudDens(p, true);
    if (d > 0.002){
      float s = d * sig;
      float od = 0.0, ls = th*0.04;
      vec3 lp = p;
      for (int j = 0; j < 6 + uZero; j++){ lp += uSunDir*ls; od += cloudDens(lp, j < 2) * sig * ls; ls *= 1.7; }
      float hN = clamp((p.y - uCloudBottom) / th, 0.0, 1.0);
      float powder = 1.0 - exp(-d*4.0);
      vec3 sunL = uSunColor * (exp(-od)*0.75 + exp(-od*0.22)*0.25) * ph * mix(0.6, 1.0, powder) * PI;
      if (STYLE == 2) sunL = uSunColor * (od < 1.5 ? 0.35 : 0.08);
      vec3 amb = mix(ambBot, ambTop, hN);
      vec3 S = (sunL + amb) * s;
      float Ts = exp(-s*dt);
      acc += Tr * (S - S*Ts) / s;
      Tr *= Ts;
      if (Tr < 0.01) break;
    }
    t += dt;
  }
  return vec4(acc, Tr);
}

// ---------- foschia ----------
float fogOD(vec3 ro, vec3 rd, float t){
  float a = uFogDensity, b = uFogFalloff;
  float y0 = max(ro.y, -50.0);
  float base = a * exp(-b * y0);
  float k = b * rd.y;
  if (abs(k*t) < 1e-4) return base * t;
  return base * (1.0 - exp(-k*t)) / k;
}
void applyFog(vec3 ro, vec3 rd, float t, inout vec3 L, inout vec3 T){
  if (uFogDensity <= 0.0) return;
  float od = fogOD(ro, rd, min(t, 300000.0));
  float tr = exp(-od);
  vec3 amb = skyTex(normalize(vec3(rd.x, 0.08, rd.z)));
  float mu = dot(rd, uSunDir);
  vec3 inL = amb + uSunColor * hg(mu, 0.5) * 0.5;
  L += T * inL * (1.0 - tr);
  T *= tr;
}

// ---------- acqua ----------
float waveH(vec2 q){
  return textureLod(uNoise, vec3(q*0.011, 0.31), 0.0).r * 0.55
       + textureLod(uNoise, vec3(q*0.037 + 0.4, 0.73), 0.0).g * 0.3
       + textureLod(uNoise, vec3(q*0.13 + 0.2, 0.12), 0.0).r * 0.15;
}
vec3 waterNormal(vec3 p, float dist){
  float e = 0.6;
  float amp = uWaves * 6.0 / (1.0 + dist*0.00015);
  float h0 = waveH(p.xz);
  float hx = waveH(p.xz + vec2(e, 0.0));
  float hz = waveH(p.xz + vec2(0.0, e));
  return normalize(vec3(-(hx - h0)/e*amp, 1.0, -(hz - h0)/e*amp));
}
vec3 waterSigma(){
  float vis = 1.5 + uWaterClarity*uWaterClarity*45.0;
  return (vec3(1.08) - uWaterColor) * (3.0/vis) + 0.02;
}

// ---------- materiali ----------
// tipo: 0 diffuso, 1 metallo, 2 vetro, 3 luce
struct Surf { vec3 albedo; vec3 n; int type; float rough; vec3 emit; float mirror; float shine; };

vec3 imageTex(vec2 uv, float layer){
  vec3 c = textureLod(uImages, vec3(fract(uv), layer), 0.0).rgb;
  return pow(c, vec3(2.2));
}
// motivi: 0 tinta unita, 1 scacchiera, 2 marmo psichedelico, 3 strisce, 4 sfumatura (yu -1..1), 5 immagine
vec3 pattern(int pat, vec3 p, float sc, vec3 c1, vec3 c2, vec3 c3, float yu, vec2 uv, float img){
  if (pat == 1){
    vec3 q = floor(p / sc + 1e-3);
    return mod(q.x + q.y + q.z, 2.0) < 0.5 ? c1 : c2;
  }
  if (pat == 2){
    vec3 r = p / sc;
    float n = textureLod(uNoise, r*0.13, 0.0).r*0.55 + textureLod(uNoise, r*0.29, 0.0).g*0.3 + textureLod(uNoise, r*0.61, 0.0).r*0.15;
    float v = sin((r.x*0.7 + r.y*0.45 + r.z*0.3) + n*11.0)*0.5 + 0.5;
    return v < 0.5 ? mix(c1, c2, smoothstep(0.0, 0.5, v)) : mix(c2, c3, smoothstep(0.5, 1.0, v));
  }
  if (pat == 3) return fract(p.y / sc) < 0.5 ? c1 : c2;
  if (pat == 4) return yu < 0.0 ? mix(c1, c2, yu + 1.0) : mix(c2, c3, yu);
  if (pat == 5) return imageTex(uv, img);
  return c1;
}

// ingressi del motivo: il colore col motivo si calcola una volta sola in radiance (meno codice da compilare)
struct PatIn { int pat; vec3 p; float sc; vec3 c1, c2, c3; float yu; vec2 uv; float img; float emitK; };

Surf groundSurf(vec3 p, inout PatIn pin){
  Surf s; s.type = 0; s.rough = 1.0; s.emit = vec3(0); s.n = vec3(0,1,0);
  s.mirror = uGroundPat.w; s.shine = uGroundShine;
  int pat = int(uGroundPat.x + 0.5);
  if (pat > 0){
    float sc = uGroundPat.y;
    // immagine: lato = sc metri, centrata nell'origine; se non si ripete, fuori resta il colore 1
    vec2 uv = vec2(p.x, -p.z) / sc + 0.5;
    if (pat == 5 && uGroundImgRepeat == 0 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) pat = 0;
    s.albedo = uGroundColor;
    pin.pat = pat; pin.p = vec3(p.x, sc*0.5, p.z); pin.sc = sc; pin.c1 = uGroundColor; pin.c2 = uGroundColor2; pin.c3 = uGroundColor3;
    pin.yu = 0.0; pin.uv = uv; pin.img = uGroundPat.z; pin.emitK = 0.0;
    return s;
  }
  float n1 = textureLod(uNoise, p*0.00055, 0.0).r, n2 = textureLod(uNoise, p*0.0031, 0.0).g, n3 = textureLod(uNoise, p*0.019, 0.0).r;
  s.albedo = clamp(uGroundColor * (0.7 + 0.35*n1 + 0.25*n2) * (0.9 + 0.2*n3), 0.0, 0.95);
  if (STYLE != 2 && s.mirror < 0.01){
    vec4 nn = textureLod(uNoise, p*0.021, 0.0);
    s.n = normalize(vec3(0,1,0) + vec3(nn.r - 0.5, 0.0, nn.b - 0.45)*0.25);
  }
  return s;
}

Surf terrainSurf(int i, vec3 p, float dist){
  Surf s; s.type = 0; s.rough = 1.0; s.emit = vec3(0); s.mirror = 0.0; s.shine = 0.0;
  vec4 P = uTerPos[i], S = uTerSize[i];
  vec3 q = rotY(p - P.xyz, -P.w);
  float flow = textureLod(uFlows, vec3(q.xz / S.xz + 0.5, S.w), 0.0).r;
  #ifdef NO_FLOAT
  bool bottom = false;
#else
  bool bottom = uTerFloat[i] > 0.0 && q.y < -0.5;
#endif
  vec3 n = rotY(terNormalAny(i, q.xz, dist, bottom), P.w);
  if (bottom){
    // parte sotto di un'isola sospesa: roccia nuda
    s.n = n;
    float m1 = textureLod(uNoise, p*0.004, 0.0).r, m2 = textureLod(uNoise, p*0.02, 0.0).g;
    vec3 rk = uTerRock[i] * (0.55 + 0.6*m2) * (0.75 + 0.5*m1);
    rk *= 0.85 + 0.15*sin(q.y*0.08 + m1*8.0);
    s.albedo = clamp(rk, 0.0, 0.9);
    return s;
  }
  float n1 = textureLod(uNoise, p*0.00055, 0.0).r;
  float n2 = textureLod(uNoise, p*0.0031, 0.0).g;
  float n3 = textureLod(uNoise, p*0.019, 0.0).r;
  float n4 = textureLod(uNoise, p*vec3(0.012, 0.004, 0.012), 0.0).b;
  float hN = q.y / S.y;
  float slope = 1.0 - n.y;
  vec3 col = mix(uTerLow[i], uTerMid[i], smoothstep(0.08, 0.55, hN + (n1 - 0.5)*0.35));
  col *= 0.78 + 0.42*n2;
  col = mix(col, col*0.6 + uTerSand[i]*0.25, flow*0.6);
  float rs = uTerMat[i].y;
  float rockAmt = smoothstep(rs - 0.07, rs + 0.07, slope + (n2 - 0.5)*0.18);
  vec3 rock = uTerRock[i] * (0.65 + 0.55*n3) * (0.8 + 0.4*n1);
  rock *= 0.9 + 0.1*sin(p.y*0.035 + n1*9.0 + n4*5.0);
  col = mix(col, rock, rockAmt);
  if (WATER_ON){
    float sb = 1.0 - smoothstep(uWaterLevel + 2.0, uWaterLevel + 12.0 + n2*25.0, p.y);
    col = mix(col, uTerSand[i]*(0.85 + 0.3*n3), sb*(1.0 - rockAmt*0.6));
  }
  float snow = smoothstep(uTerMat[i].x - 0.025, uTerMat[i].x + 0.025, hN + (n1 - 0.5)*0.12 - slope*0.45 + flow*0.05);
  col = mix(col, uTerSnow[i] * (0.92 + 0.08*n3), snow);
  if (STYLE != 2){
    vec4 nn = textureLod(uNoise, p*0.021, 0.0);
    float bump = mix(0.25, 0.75, rockAmt) * (1.0 - snow*0.6);
    n = normalize(n + (nn.rgb - vec3(0.5, 0.5, 0.45))*vec3(1.0, 0.0, 1.0)*bump);
  }
  s.albedo = clamp(col, 0.0, 0.95);
  s.n = n;
  return s;
}

Surf objectSurf(int i, vec3 n, vec3 lp, inout PatIn pin){
  vec4 c1 = OT(i, 5), c2 = OT(i, 6), c3 = OT(i, 7), pm = OT(i, 8), sc = OT(i, 1);
  int shape = int(OT(i, 0).w + 0.5);
  Surf s; s.n = n; s.rough = c1.w; s.emit = vec3(0); s.mirror = c2.w; s.shine = c3.w;
  int pat = int(pm.x + 0.5);
  vec2 uv = vec2(0);
  vec3 lu = lp / sc.xyz;
  if (pat == 5){
    if (shape == 0 || shape == 10){
      vec3 d = normalize(lu);
      uv = vec2(atan(d.z, d.x) / (2.0*PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
    } else {
      vec3 a = abs(lu);
      uv = (a.x > a.y && a.x > a.z) ? lu.zy : (a.y > a.z ? lu.xz : lu.xy);
      uv = uv*0.5 + 0.5;
    }
  }
  s.albedo = c1.rgb;
  pin.pat = pat; pin.p = lp; pin.sc = max(pm.y, 1e-3); pin.c1 = c1.rgb; pin.c2 = c2.rgb; pin.c3 = c3.rgb;
  pin.yu = clamp(lu.y, -1.0, 1.0); pin.uv = uv; pin.img = pm.z; pin.emitK = pm.w;
  int m = int(sc.w + 0.5);
  s.type = m;
  if (m == 3) s.emit = s.albedo * pm.w;
  return s;
}

// luce ambiente fissa per gli stili non fotografici
vec3 flatAmbient(vec3 n){
  return mix(skyTex(normalize(vec3(n.x, 0.15, n.z))), skyTex(vec3(0,1,0)), clamp(n.y, 0.0, 1.0)) * uSkyLight * 0.9;
}

// Un solo ciclo lancia TUTTI i raggi (sonde per i contorni, percorso, ombre): traceScene compare una volta
// sola nel codice. Il compilatore Direct3D copia ogni chiamata in linea, e con piu' chiamate
// lo shader impiegava minuti a compilare.
vec3 radiance(vec3 ro, vec3 rd, vec3 probe1, vec3 probe2, out bool edge){
  vec3 L = vec3(0), T = vec3(1);
  bool spec = true;
  bool inWater = WATER_ON && ro.y < uWaterLevel;
  int glassObj = -1;
  bool shadowPending = false, stopAfterShadow = false;
  vec3 sro = vec3(0), srd = vec3(0), sAdd = vec3(0);
  int probes = STYLE == 2 ? 2 : 0;
  float pd0 = 0.0, pd1 = 0.0, pd2 = 0.0;
  int pid0 = 0, pid1 = 0, pid2 = 0;
  edge = false;
  int b = 0;
  for (int it = 0; it < 24 + uZero; it++){
    // 1 = sonda per i contorni, 2 = raggio d'ombra, 0 = raggio del percorso
    int kind = it < probes ? 1 : (shadowPending ? 2 : 0);
    if (kind == 0 && b > uBounces) break;
    vec3 o = kind == 1 ? uCamPos : (kind == 2 ? sro : ro);
    vec3 d = kind == 1 ? (it == 0 ? probe1 : probe2) : (kind == 2 ? srd : rd);
    int steps = kind == 2 ? uTerrainSteps/3 + 40 : (b == 0 ? uTerrainSteps : uTerrainSteps/2 + 30);
    Hit h = traceScene(o, d, steps, kind == 2 ? 0.6 : 0.45, kind == 2);

    if (kind == 1){
      float dd = h.id == 0 ? 1e7 : h.t;
      int ii = h.id == 1 ? 1 + h.sub : h.id;
      if (it == 0){ pd1 = dd; pid1 = ii; } else { pd2 = dd; pid2 = ii; }
      continue;
    }
    if (kind == 2){
      shadowPending = false;
      bool lit = h.id == 0;
      vec3 tint = vec3(1);
      if (h.id >= 10){
        int m = int(OT(h.id - 10, 1).w + 0.5);
        if (m == 2){ lit = true; tint = OT(h.id - 10, 5).rgb*0.85; }
        else if (m == 3) lit = true;
      }
      if (lit) L += sAdd * tint;
      if (stopAfterShadow) break;
      continue;
    }

    int bb = b;
    b++;
    if (bb == 0){ pd0 = h.id == 0 ? 1e7 : h.t; pid0 = h.id == 1 ? 1 + h.sub : h.id; }
    float tSeg = h.id == 0 ? INF : h.t;
    if (inWater){
      vec3 sg = waterSigma();
      vec3 tr = exp(-sg*min(tSeg, 2000.0));
      vec3 inL = uWaterColor * (skyTex(vec3(0,1,0))*0.6 + uSunColor*max(uSunDir.y, 0.0)*0.12);
      L += T * inL * (1.0 - tr);
      T *= tr;
    } else if (glassObj < 0){
      applyFog(ro, rd, tSeg, L, T);
      if (bb == 0 || spec){
        vec4 cl = clouds(ro, rd, tSeg);
        L += T * cl.rgb; T *= cl.a;
      }
    }
    if (h.id == 0){
      vec3 sky = skyRadiance(rd, spec);
      if (bb > 0 && !spec) sky *= uSkyLight;
      if (bb > 0) sky = min(sky, vec3(40.0));
      L += T * sky;
      break;
    }
    vec3 p = ro + rd*h.t;
    float eps = max(0.02, h.t*0.0004);

    if (h.id == 3){
      vec3 n = STYLE == 2 ? vec3(0,1,0) : waterNormal(p, h.t);
      bool fromAbove = rd.y < 0.0;
      if (!fromAbove) n = -n;
      float eta = fromAbove ? 1.0/1.333 : 1.333;
      float c = clamp(dot(-rd, n), 0.0, 1.0);
      float F = 0.02 + 0.98*pow(1.0 - c, 5.0);
      vec3 rr = refract(rd, n, eta);
      // riflessione scelta piu' spesso di F (e pesata) per ridurre il rumore dei riflessi
      float pr = clamp(F, 0.3, 0.8);
      bool tir = dot(rr, rr) < 0.5;
      if (tir || rnd() < pr){
        if (!tir) T *= F / pr;
        rd = reflect(rd, n);
        if (fromAbove && rd.y < 0.0) rd.y = -rd.y;
        ro = p + vec3(0, fromAbove ? eps : -eps, 0);
      } else {
        T *= (1.0 - F) / (1.0 - pr);
        rd = rr;
        inWater = fromAbove;
        ro = p + vec3(0, fromAbove ? -eps : eps, 0);
      }
      spec = true;
      continue;
    }

    Surf s;
    PatIn pin; pin.pat = 0;
    if (h.id >= 10) s = objectSurf(h.id - 10, h.n, h.lp, pin);
    else if (h.id == 2) s = groundSurf(p, pin);
    else s = terrainSurf(h.sub, p, h.t);
    if (pin.pat > 0){
      s.albedo = pattern(pin.pat, pin.p, pin.sc, pin.c1, pin.c2, pin.c3, pin.yu, pin.uv, pin.img);
      if (h.id == 2) s.albedo = clamp(s.albedo, 0.0, 0.95);
      if (s.type == 3) s.emit = s.albedo * pin.emitK;
    }

    if (s.type == 3){ L += T * s.emit; break; }

    if (s.type == 2){
      vec3 n = s.n;
      bool entering = dot(rd, n) < 0.0;
      if (!entering) n = -n;
      float eta = entering ? 1.0/1.5 : 1.5;
      float c = clamp(dot(-rd, n), 0.0, 1.0);
      float F = 0.04 + 0.96*pow(1.0 - c, 5.0);
      vec3 rr = refract(rd, n, eta);
      if (dot(rr, rr) < 0.5 || rnd() < F){
        rd = reflect(rd, n); ro = p + n*eps*0.1;
      } else {
        rd = normalize(rr + randSphere()*s.rough*0.3);
        ro = p - n*eps*0.1;
        if (entering){ glassObj = h.id - 10; T *= s.albedo; } else glassObj = -1;
      }
      spec = true;
      continue;
    }

    vec3 n = s.n;
    if (dot(n, rd) > 0.0 && h.id >= 10) n = -n;

    if (s.type == 1){
      vec3 r = reflect(rd, n);
      vec3 d2 = normalize(r + randSphere()*s.rough*s.rough);
      if (dot(d2, n) <= 0.0) d2 = r;
      float c = clamp(dot(-rd, n), 0.0, 1.0);
      vec3 F = s.albedo + (1.0 - s.albedo)*pow(1.0 - c, 5.0);
      T *= F;
      rd = d2; ro = p + n*eps;
      spec = s.rough < 0.35;
      continue;
    }

    // superficie in parte a specchio (pavimenti lucidi, plastica laccata)
    if (s.mirror > 0.0 && rnd() < s.mirror){
      rd = reflect(rd, n); ro = p + n*eps;
      if (s.shine > 0.0) T *= mix(vec3(1.0), s.albedo, 0.25);
      spec = true;
      continue;
    }

    // diffuso: la luce del sole si aggiunge solo se il raggio d'ombra (prossimo giro) arriva al cielo
    vec3 sp = p + n*eps;
    float shExp = 12.0 + s.shine*s.shine*500.0;
    float shNorm = s.shine * 0.2 * (shExp + 8.0) / (8.0*PI);
    if (STYLE == 0){
      vec3 ld = coneDir(uSunDir, cos(uSunSize));
      float ndl = dot(n, ld);
      if (ndl > 0.0 && uSunColor.r + uSunColor.g + uSunColor.b > 0.0){
        vec3 E = uSunColor * cloudShadow(p);
        if (inWater) E *= exp(-waterSigma() * max(uWaterLevel - p.y, 0.0) / max(ld.y, 0.1));
        if (uFogDensity > 0.0) E *= exp(-fogOD(sp, ld, 30000.0));
        sAdd = T * E * ndl * (s.albedo / PI + shNorm * pow(max(dot(n, normalize(ld - rd)), 0.0), shExp));
        sro = sp; srd = ld; shadowPending = true;
      }
      T *= s.albedo;
      rd = cosineDir(n);
      ro = sp;
      spec = false;
      if (bb >= 2){
        float q = clamp(max(T.r, max(T.g, T.b)), 0.05, 0.95);
        if (rnd() > q){ if (shadowPending) stopAfterShadow = true; else break; }
        else T /= q;
      }
    } else {
      // classico / illustrato: ombre nette, luce ambiente costante, nessun rimbalzo diffuso
      float ndl = dot(n, uSunDir);
      vec3 amb = flatAmbient(n);
      float lit = ndl > 0.0 ? ndl * cloudShadow(p) : 0.0;
      if (STYLE == 2){
        lit = lit > 0.55 ? 1.0 : lit > 0.18 ? 0.62 : lit > 0.0 ? 0.3 : 0.0;
        float lum = dot(s.albedo, vec3(0.299, 0.587, 0.114));
        s.albedo = clamp(mix(vec3(lum), s.albedo, 1.45), 0.0, 1.0);
        amb = vec3(dot(amb, vec3(0.333))) * mix(vec3(0.75, 0.8, 1.0), vec3(1.0), 0.4);
      } else {
        float lum = dot(s.albedo, vec3(0.299, 0.587, 0.114));
        s.albedo = clamp(mix(vec3(lum), s.albedo, 1.2), 0.0, 1.0);
      }
      L += T * s.albedo * amb * 0.55;
      if (lit <= 0.0) break;
      vec3 E = uSunColor * lit;
      if (inWater) E *= exp(-waterSigma() * max(uWaterLevel - p.y, 0.0) / max(uSunDir.y, 0.1));
      float hl = pow(max(dot(n, normalize(uSunDir - rd)), 0.0), shExp);
      if (STYLE == 2) hl = step(0.5, hl) * 0.05;
      sAdd = T * (s.albedo * E / PI + uSunColor * shNorm * hl);
      sro = sp; srd = uSunDir; shadowPending = true; stopAfterShadow = true;
    }
  }
  if (probes > 0){
    float rel = max(abs(pd1 - pd0), abs(pd2 - pd0)) / max(pd0, 1.0);
    edge = pid0 != pid1 || pid0 != pid2 || rel > 0.06;
  }
  return L;
}

vec3 camDir(vec2 fc){
  vec2 sxy = (fc / uRes) * 2.0 - 1.0;
  return normalize(uCamFwd + uCamRight*sxy.x*uTanHalf*uAspect + uCamUp*sxy.y*uTanHalf);
}

void main(){
  uvec2 pix = uvec2(gl_FragCoord.xy);
  rngState = pcg(pix.x + pcg(pix.y + pcg(uint(uFrame) * 7919u + 17u)));
  vec2 jit = vec2(rnd(), rnd());
  vec2 fc = gl_FragCoord.xy - 0.5 + jit;
  vec3 dir = camDir(fc);
  vec3 ro = uCamPos;
  if (uAperture > 0.0){
    vec3 fp = ro + dir * (uFocus / dot(dir, uCamFwd));
    float a = rnd()*2.0*PI, r = sqrt(rnd()) * uAperture;
    ro += uCamRight*cos(a)*r + uCamUp*sin(a)*r;
    dir = normalize(fp - ro);
  }
  bool edge;
  vec3 c = radiance(ro, dir, camDir(fc + vec2(1.2, 0.0)), camDir(fc + vec2(0.0, 1.2)), edge);
  // contorni a inchiostro (stile illustrato) dove cambia oggetto o la distanza salta
  if (edge) c *= 0.12;
  if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = vec3(0);
  c = min(c, vec3(60.0));
  vec4 o = vec4(c, 1.0);
  // senza blending float si somma a mano il buffer precedente (ping-pong)
  if (uUsePrev == 1) o += texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  outColor = o;
}`;

// Visualizzazione: media dei campioni, esposizione, tone mapping filmico, vignettatura
const FS_SHOW = `#version 300 es
precision highp float;
uniform sampler2D uAccum;
uniform vec4 uViewport; // x, y, w, h in pixel del canvas
uniform float uExposure, uVignette, uContrast, uSaturation;
uniform int uBorder;    // 1: colore di fondo fuori dal riquadro, 0: trasparente
out vec4 outColor;
vec3 aces(vec3 x){
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0){ outColor = vec4(0.06, 0.065, 0.075, 1.0); return; }
  vec4 a = texture(uAccum, uv);
  vec3 c = a.a > 0.0 ? a.rgb / a.a : vec3(0.0);
  c *= uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSaturation), 0.0);
  vec2 q = uv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.6;
  c = aces(c);
  c = mix(c * 12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
  c = clamp(mix(vec3(0.5), c, uContrast), 0.0, 1.0);
  // dithering leggero contro le bande
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}`;
