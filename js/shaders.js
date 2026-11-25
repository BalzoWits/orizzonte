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
out vec4 outColor;
const float PI = 3.14159265;
const float RE = 6360e3, RA = 6420e3, HR = 8000.0, HM = 1200.0;

vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd), c = dot(ro, ro) - r*r, d = b*b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d); return vec2(-b - d, -b + d);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float phi = (uv.x - 0.5) * 2.0 * PI;
  float el = (uv.y - 0.5) * PI;
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

const MAX_TER = 4, MAX_OBJ = 8;

const FS_TRACE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;

#define MAX_TER ${MAX_TER}
#define MAX_OBJ ${MAX_OBJ}

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
uniform vec3 uGroundColor;
uniform int uWaterOn;
uniform float uWaterLevel, uWaterClarity, uWaves;
uniform vec3 uWaterColor;
uniform float uCloudCover, uCloudDensity, uCloudBottom, uCloudTop, uCloudScale;
// luce e aria
uniform vec3 uSunDir, uSunColor;
uniform float uSunSize;
uniform float uFogDensity, uFogFalloff, uSkyLight;
uniform int uCloudSteps, uBounces, uTerrainSteps;
// oggetti
uniform int uObjCount;
uniform vec4 uObjPos[MAX_OBJ];     // centro, forma
uniform vec4 uObjScale[MAX_OBJ];   // semiassi, materiale
uniform mat3 uObjRot[MAX_OBJ];     // mondo -> locale
uniform vec4 uObjMat[MAX_OBJ];     // colore, ruvidita'
uniform float uObjEmit[MAX_OBJ];
uniform int uUsePrev;
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
  return texture(uSky, vec2(u, v)).rgb;
}
vec3 skyRadiance(vec3 d, bool withSun){
  vec3 c = skyTex(d);
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
  float h = texture(uHeights, vec3(uv, S.w)).r * S.y;
  float m = smoothstep(0.0, 0.06*S.y, h);
  float f = 1.0 / max(S.x, S.z);
  h += ((texture(uNoise, vec3(q*f*17.6, 0.37)).r - 0.5)*0.03
      + (texture(uNoise, vec3(q*f*75.0, 0.81)).g - 0.5)*0.01) * S.y * m;
  return h;
}
vec3 terNormalLocal(int i, vec2 q, float t){
  float e = max(0.5, t*0.0012);
  float hx = terH(i, q + vec2(e, 0.0)) - terH(i, q - vec2(e, 0.0));
  float hz = terH(i, q + vec2(0.0, e)) - terH(i, q - vec2(0.0, e));
  return normalize(vec3(-hx, 2.0*e, -hz));
}
bool traceTer(int i, vec3 ro, vec3 rd, float tmax, int steps, float k, out float tHit){
  vec4 P = uTerPos[i], S = uTerSize[i];
  vec3 lo = rotY(ro - P.xyz, -P.w), ld = rotY(rd, -P.w);
  vec3 bmin = vec3(-0.5*S.x, -1.0, -0.5*S.z);
  vec3 bmax = vec3(0.5*S.x, S.y*1.03 + 1.0, 0.5*S.z);
  vec3 inv = 1.0 / ld;
  vec3 t0 = (bmin - lo)*inv, t1 = (bmax - lo)*inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float ta = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
  float tb = min(min(tmx.x, tmx.y), min(tmx.z, tmax));
  if (ta >= tb) return false;
  float t = ta;
  vec3 p = lo + ld*t;
  float d = p.y - terH(i, p.xz);
  if (d < 0.0 && ta > 0.0) { tHit = t; return true; }
  float minStep = max(0.05, 0.0004*max(S.x, S.z));
  for (int s = 0; s < 700; s++){
    if (s >= steps) break;
    float tp = t;
    t += max(d*k, minStep + t*0.0012);
    if (t > tb) return false;
    p = lo + ld*t;
    d = p.y - terH(i, p.xz);
    if (d < 0.0){
      float a = tp, b = t;
      for (int j = 0; j < 7; j++){
        float m = 0.5*(a + b);
        vec3 q = lo + ld*m;
        if (q.y - terH(i, q.xz) < 0.0) b = m; else a = m;
      }
      tHit = b; return true;
    }
  }
  return false;
}

// ---------- oggetti (spazio locale unitario) ----------
bool hitObject(int i, vec3 ro, vec3 rd, out float tOut, out vec3 nOut){
  vec3 s = uObjScale[i].xyz;
  mat3 M = uObjRot[i];
  vec3 lo = (M * (ro - uObjPos[i].xyz)) / s;
  vec3 ld = (M * rd) / s;
  float eps = 0.001 * min(s.x, min(s.y, s.z));
  int shape = int(uObjPos[i].w + 0.5);
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
  } else {
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
  }
  tOut = t;
  nOut = normalize((nl / s) * M);
  return true;
}

// ---------- scena ----------
// id: 0 cielo, 1 terreno, 2 suolo, 3 acqua, 10+i oggetti
struct Hit { float t; vec3 n; int id; int sub; };

Hit traceScene(vec3 ro, vec3 rd, int steps){
  Hit h; h.t = INF; h.id = 0; h.sub = 0; h.n = vec3(0,1,0);
  float t;
  for (int i = 0; i < MAX_TER; i++){
    if (i >= uTerCount) break;
    if (traceTer(i, ro, rd, h.t, steps, 0.45, t) && t < h.t){ h.t = t; h.id = 1; h.sub = i; }
  }
  if (uGroundOn == 1 && rd.y < 0.0 && ro.y > uGroundY){
    t = (uGroundY - ro.y) / rd.y;
    if (t < h.t - 0.01){ h.t = t; h.id = 2; h.n = vec3(0,1,0); }
  }
  if (uWaterOn == 1){
    t = (uWaterLevel - ro.y) / rd.y;
    if (t > 0.0 && t < h.t){ h.t = t; h.id = 3; h.n = vec3(0, ro.y > uWaterLevel ? 1.0 : -1.0, 0); }
  }
  for (int i = 0; i < MAX_OBJ; i++){
    if (i >= uObjCount) break;
    vec3 n;
    if (hitObject(i, ro, rd, t, n) && t < h.t){ h.t = t; h.n = n; h.id = 10 + i; }
  }
  return h;
}

// ---------- nuvole ----------
float cloudDens(vec3 p, bool detail){
  float th = uCloudTop - uCloudBottom;
  float hN = (p.y - uCloudBottom) / th;
  if (hN < 0.0 || hN > 1.0) return 0.0;
  vec3 q = p / uCloudScale;
  vec4 big = texture(uNoise, q*vec3(0.18, 0.5, 0.18) + vec3(0.13, 0.0, 0.71));
  vec4 n = texture(uNoise, q*vec3(1.0, 0.8, 1.0));
  float cover = clamp(uCloudCover * (0.55 + 0.9*big.a), 0.0, 1.0);
  float prof = smoothstep(0.0, 0.12, hN) * smoothstep(1.0, 0.3 + 0.3*big.r, hN);
  float base = n.r*0.55 + n.b*0.45;
  float d = (base - (1.0 - cover)) / max(cover, 0.05);
  d = clamp(d, 0.0, 1.0) * prof;
  if (detail && d > 0.0){
    float det = texture(uNoise, q*4.3).g*0.6 + texture(uNoise, q*9.1).b*0.4;
    d = clamp((d - det*0.32*(1.0 - d*0.5)) / 0.7, 0.0, 1.0);
  }
  return d;
}
float cloudSigma(){ return uCloudDensity * 0.03; }

float cloudShadow(vec3 p){
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.02) return 1.0;
  float mid = mix(uCloudBottom, uCloudTop, 0.45);
  if (p.y > mid) return 1.0;
  vec3 q = p + uSunDir * ((mid - p.y) / uSunDir.y);
  float d = cloudDens(q, false);
  return exp(-d * cloudSigma() * (uCloudTop - uCloudBottom) * 0.6);
}

vec4 clouds(vec3 ro, vec3 rd, float tMax){
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
  for (int i = 0; i < 128; i++){
    if (i >= N) break;
    vec3 p = ro + rd*t;
    float d = cloudDens(p, true);
    if (d > 0.002){
      float s = d * sig;
      float od = 0.0, ls = th*0.04;
      vec3 lp = p;
      for (int j = 0; j < 6; j++){ lp += uSunDir*ls; od += cloudDens(lp, j < 2) * sig * ls; ls *= 1.7; }
      float hN = clamp((p.y - uCloudBottom) / th, 0.0, 1.0);
      float powder = 1.0 - exp(-d*4.0);
      vec3 sunL = uSunColor * (exp(-od)*0.75 + exp(-od*0.22)*0.25) * ph * mix(0.6, 1.0, powder) * PI;
      if (uStyle == 2) sunL = uSunColor * (od < 1.5 ? 0.35 : 0.08);
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
  return texture(uNoise, vec3(q*0.011, 0.31)).r * 0.55
       + texture(uNoise, vec3(q*0.037 + 0.4, 0.73)).g * 0.3
       + texture(uNoise, vec3(q*0.13 + 0.2, 0.12)).r * 0.15;
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
struct Surf { vec3 albedo; vec3 n; int type; float rough; vec3 emit; };

Surf groundSurf(vec3 p){
  Surf s; s.type = 0; s.rough = 1.0; s.emit = vec3(0); s.n = vec3(0,1,0);
  float n1 = texture(uNoise, p*0.00055).r, n2 = texture(uNoise, p*0.0031).g, n3 = texture(uNoise, p*0.019).r;
  s.albedo = clamp(uGroundColor * (0.7 + 0.35*n1 + 0.25*n2) * (0.9 + 0.2*n3), 0.0, 0.95);
  if (uStyle != 2){
    vec4 nn = texture(uNoise, p*0.021);
    s.n = normalize(vec3(0,1,0) + vec3(nn.r - 0.5, 0.0, nn.b - 0.45)*0.25);
  }
  return s;
}

Surf terrainSurf(int i, vec3 p, float dist){
  Surf s; s.type = 0; s.rough = 1.0; s.emit = vec3(0);
  vec4 P = uTerPos[i], S = uTerSize[i];
  vec3 q = rotY(p - P.xyz, -P.w);
  float flow = texture(uFlows, vec3(q.xz / S.xz + 0.5, S.w)).r;
  vec3 n = rotY(terNormalLocal(i, q.xz, dist), P.w);
  float n1 = texture(uNoise, p*0.00055).r;
  float n2 = texture(uNoise, p*0.0031).g;
  float n3 = texture(uNoise, p*0.019).r;
  float n4 = texture(uNoise, p*vec3(0.012, 0.004, 0.012)).b;
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
  if (uWaterOn == 1){
    float sb = 1.0 - smoothstep(uWaterLevel + 2.0, uWaterLevel + 12.0 + n2*25.0, p.y);
    col = mix(col, uTerSand[i]*(0.85 + 0.3*n3), sb*(1.0 - rockAmt*0.6));
  }
  float snow = smoothstep(uTerMat[i].x - 0.025, uTerMat[i].x + 0.025, hN + (n1 - 0.5)*0.12 - slope*0.45 + flow*0.05);
  col = mix(col, uTerSnow[i] * (0.92 + 0.08*n3), snow);
  if (uStyle != 2){
    vec4 nn = texture(uNoise, p*0.021);
    float bump = mix(0.25, 0.75, rockAmt) * (1.0 - snow*0.6);
    n = normalize(n + (nn.rgb - vec3(0.5, 0.5, 0.45))*vec3(1.0, 0.0, 1.0)*bump);
  }
  s.albedo = clamp(col, 0.0, 0.95);
  s.n = n;
  return s;
}

Surf objectSurf(int i, vec3 n){
  Surf s; s.n = n; s.albedo = uObjMat[i].rgb; s.rough = uObjMat[i].w; s.emit = vec3(0);
  int m = int(uObjScale[i].w + 0.5);
  s.type = m;
  if (m == 3) s.emit = uObjMat[i].rgb * uObjEmit[i];
  return s;
}

bool shadowed(vec3 p, vec3 L, out vec3 tint){
  tint = vec3(1);
  float t;
  for (int i = 0; i < MAX_TER; i++){
    if (i >= uTerCount) break;
    if (traceTer(i, p, L, INF, uTerrainSteps/3 + 40, 0.6, t)) return true;
  }
  for (int i = 0; i < MAX_OBJ; i++){
    if (i >= uObjCount) break;
    vec3 n;
    if (hitObject(i, p, L, t, n)){
      int m = int(uObjScale[i].w + 0.5);
      if (m == 2) tint *= uObjMat[i].rgb*0.85; else if (m != 3) return true;
    }
  }
  return false;
}

// luce ambiente fissa per gli stili non fotografici
vec3 flatAmbient(vec3 n){
  return mix(skyTex(normalize(vec3(n.x, 0.15, n.z))), skyTex(vec3(0,1,0)), clamp(n.y, 0.0, 1.0)) * uSkyLight * 0.9;
}

vec3 radiance(vec3 ro, vec3 rd){
  vec3 L = vec3(0), T = vec3(1);
  bool spec = true;
  bool inWater = uWaterOn == 1 && ro.y < uWaterLevel;
  int glassObj = -1;
  for (int b = 0; b < 8; b++){
    if (b > uBounces) break;
    int steps = b == 0 ? uTerrainSteps : uTerrainSteps/2 + 30;
    Hit h = traceScene(ro, rd, steps);
    float tSeg = h.id == 0 ? INF : h.t;
    if (inWater){
      vec3 sg = waterSigma();
      vec3 tr = exp(-sg*min(tSeg, 2000.0));
      vec3 inL = uWaterColor * (skyTex(vec3(0,1,0))*0.6 + uSunColor*max(uSunDir.y, 0.0)*0.12);
      L += T * inL * (1.0 - tr);
      T *= tr;
    } else if (glassObj < 0){
      applyFog(ro, rd, tSeg, L, T);
      if (b == 0 || spec){
        vec4 cl = clouds(ro, rd, tSeg);
        L += T * cl.rgb; T *= cl.a;
      }
    }
    if (h.id == 0){
      vec3 sky = skyRadiance(rd, spec);
      if (b > 0 && !spec) sky *= uSkyLight;
      if (b > 0) sky = min(sky, vec3(40.0));
      L += T * sky;
      break;
    }
    vec3 p = ro + rd*h.t;
    float eps = max(0.02, h.t*0.0004);

    if (h.id == 3){
      vec3 n = uStyle == 2 ? vec3(0,1,0) : waterNormal(p, h.t);
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
    if (h.id >= 10) s = objectSurf(h.id - 10, h.n);
    else if (h.id == 2) s = groundSurf(p);
    else s = terrainSurf(h.sub, p, h.t);

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
      vec3 d = normalize(r + randSphere()*s.rough*s.rough);
      if (dot(d, n) <= 0.0) d = r;
      float c = clamp(dot(-rd, n), 0.0, 1.0);
      vec3 F = s.albedo + (1.0 - s.albedo)*pow(1.0 - c, 5.0);
      T *= F;
      rd = d; ro = p + n*eps;
      spec = s.rough < 0.35;
      continue;
    }

    // diffuso
    vec3 sp = p + n*eps;
    if (uStyle == 0){
      // fotorealistico: sole con ombre morbide + luce indiretta
      vec3 ld = coneDir(uSunDir, cos(uSunSize));
      float ndl = dot(n, ld);
      if (ndl > 0.0 && uSunColor.r + uSunColor.g + uSunColor.b > 0.0){
        vec3 tint;
        if (!shadowed(sp, ld, tint)){
          vec3 E = uSunColor * tint * cloudShadow(p);
          if (inWater) E *= exp(-waterSigma() * max(uWaterLevel - p.y, 0.0) / max(ld.y, 0.1));
          if (uFogDensity > 0.0) E *= exp(-fogOD(sp, ld, 30000.0));
          L += T * s.albedo / PI * E * ndl;
        }
      }
      T *= s.albedo;
      rd = cosineDir(n);
      ro = sp;
      spec = false;
      if (b >= 2){
        float q = clamp(max(T.r, max(T.g, T.b)), 0.05, 0.95);
        if (rnd() > q) break;
        T /= q;
      }
    } else {
      // classico / illustrato: ombre nette, luce ambiente costante, nessun rimbalzo diffuso
      float ndl = dot(n, uSunDir);
      float lit = 0.0;
      vec3 tint = vec3(1);
      if (ndl > 0.0 && !shadowed(sp, uSunDir, tint)) lit = ndl * cloudShadow(p);
      vec3 amb = flatAmbient(n);
      if (uStyle == 2){
        // bande di colore piatte
        lit = lit > 0.55 ? 1.0 : lit > 0.18 ? 0.62 : lit > 0.0 ? 0.3 : 0.0;
        float lum = dot(s.albedo, vec3(0.299, 0.587, 0.114));
        s.albedo = clamp(mix(vec3(lum), s.albedo, 1.45), 0.0, 1.0);
        amb = vec3(dot(amb, vec3(0.333))) * mix(vec3(0.75, 0.8, 1.0), vec3(1.0), 0.4);
      }
      vec3 E = uSunColor * tint * lit;
      if (inWater) E *= exp(-waterSigma() * max(uWaterLevel - p.y, 0.0) / max(uSunDir.y, 0.1));
      L += T * s.albedo * (E / PI + amb * 0.55);
      break;
    }
  }
  return L;
}

// profondita' del raggio primario per i contorni dello stile illustrato
float primaryDepth(vec2 fc, out int id){
  vec2 sxy = (fc / uRes) * 2.0 - 1.0;
  vec3 dir = normalize(uCamFwd + uCamRight*sxy.x*uTanHalf*uAspect + uCamUp*sxy.y*uTanHalf);
  Hit h = traceScene(uCamPos, dir, uTerrainSteps);
  id = h.id == 1 ? 1 + h.sub : h.id;
  return h.id == 0 ? 1e7 : h.t;
}

void main(){
  uvec2 pix = uvec2(gl_FragCoord.xy);
  rngState = pcg(pix.x + pcg(pix.y + pcg(uint(uFrame) * 7919u + 17u)));
  vec2 jit = vec2(rnd(), rnd());
  vec2 sxy = ((gl_FragCoord.xy - 0.5 + jit) / uRes) * 2.0 - 1.0;
  vec3 dir = normalize(uCamFwd + uCamRight*sxy.x*uTanHalf*uAspect + uCamUp*sxy.y*uTanHalf);
  vec3 ro = uCamPos;
  if (uAperture > 0.0){
    vec3 fp = ro + dir * (uFocus / dot(dir, uCamFwd));
    float a = rnd()*2.0*PI, r = sqrt(rnd()) * uAperture;
    ro += uCamRight*cos(a)*r + uCamUp*sin(a)*r;
    dir = normalize(fp - ro);
  }
  vec3 c = radiance(ro, dir);
  if (uStyle == 2){
    // contorni a inchiostro dove cambia oggetto o la distanza salta
    vec2 fc = gl_FragCoord.xy - 0.5 + jit;
    int i0, i1, i2;
    float d0 = primaryDepth(fc, i0);
    float d1 = primaryDepth(fc + vec2(1.2, 0.0), i1);
    float d2 = primaryDepth(fc + vec2(0.0, 1.2), i2);
    float rel = max(abs(d1 - d0), abs(d2 - d0)) / max(d0, 1.0);
    if (i0 != i1 || i0 != i2 || rel > 0.06) c *= 0.12;
  }
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
