// Gestione WebGL2: programmi, texture, accumulo progressivo a tessere, visualizzazione ed export PNG.
'use strict';

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('Il browser non supporta WebGL2.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Il browser non supporta le texture float (EXT_color_buffer_float).');
    this.floatBlend = !!gl.getExtension('EXT_float_blend');
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.canvas = canvas;

    this.progSky = this.program(VS_QUAD, FS_SKY);
    // Lo shader del render si compila solo quando serve, con dentro solo le parti che la scena usa
    // (vedi prepareTrace): su Direct3D lo shader completo richiede minuti di compilazione.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.traceVariants = new Map();
    this.progTrace = null;
    this.progShow = this.program(VS_QUAD, FS_SHOW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    // texture del cielo
    this.skyW = 512; this.skyH = 256;
    this.skyTex = this.texture2D(gl.RGBA16F, this.skyW, this.skyH, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);
    this.skyFbo = this.fbo(this.skyTex);

    // rumore 3D
    const S = 64;
    this.noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, S, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildNoise3D(S));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);

    this.heightArr = null; this.flowArr = null; this.terN = 0;
    this.allocTerrains(2);
    // dati degli oggetti: una riga di OBJ_W texel RGBA32F per oggetto
    this.objTex = this.texture2D(gl.RGBA32F, OBJ_W, MAX_OBJ, gl.RGBA, gl.FLOAT, new Float32Array(OBJ_W * MAX_OBJ * 4), gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    // modelli importati (BVH e triangoli), riallocati quando servono
    this.meshNodesTex = this.texture2D(gl.RGBA32F, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4), gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    this.meshTrisTex = this.texture2D(gl.RGBA32F, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4), gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    // immagini dell'utente per i materiali
    this.imgArr = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.imgArr);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, IMG_SIZE, IMG_SIZE, MAX_IMG, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.dummyTex = this.texture2D(gl.RGBA32F, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4), gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    this.uloc = new Map();
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error('Errore nello shader:\n' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const lost = gl.isContextLost() ? ' (contesto grafico perso: probabilmente il driver ha impiegato troppo a compilare)' : '';
      throw new Error('errore di link' + lost + ': ' + (gl.getProgramInfoLog(p) || 'nessun dettaglio dal driver'));
    }
    return p;
  }

  // avvia compilazione e link senza aspettare il risultato
  startProgram(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    p._fs = f;
    return p;
  }
  // defs: righe '#define ...' con le parti da escludere. Restituisce 'ready', 'compiling' o 'error'.
  prepareTrace(defs) {
    const gl = this.gl;
    const key = defs.join('|');
    let v = this.traceVariants.get(key);
    if (!v) {
      const fs = FS_TRACE.replace('#define MAX_TER', defs.join('\n') + '\n#define MAX_TER');
      v = { p: this.startProgram(VS_QUAD, fs), state: 'compiling', t0: performance.now() };
      this.traceVariants.set(key, v);
    }
    if (v.state === 'compiling') {
      if (this.parallel && !gl.getProgramParameter(v.p, this.parallel.COMPLETION_STATUS_KHR)) return 'compiling';
      if (gl.getProgramParameter(v.p, gl.LINK_STATUS)) {
        v.state = 'ready';
        console.log('render pronto in', Math.round(performance.now() - v.t0), 'ms', defs.join(' ') || '(tutto)');
      } else {
        v.state = 'error';
        v.err = (gl.getShaderInfoLog(v.p._fs) || '') + (gl.getProgramInfoLog(v.p) || '') || (gl.isContextLost() ? 'contesto grafico perso' : 'nessun dettaglio dal driver');
        console.error('Shader del render non compilato', defs, v.err);
      }
    }
    if (v.state === 'ready') this.progTrace = v.p;
    this.traceError = v.err;
    return v.state;
  }

  texture2D(ifmt, w, h, fmt, type, data, filter, wrapS, wrapT) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return t;
  }
  fbo(tex) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incompleto: ' + st);
    return f;
  }

  u(prog, name) {
    let m = this.uloc.get(prog);
    if (!m) { m = new Map(); this.uloc.set(prog, m); }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name);
  }

  // texture array per le mappe di altezza (R16F) e i canali d'acqua (R8), un layer per terreno
  allocTerrains(N) {
    const gl = this.gl;
    if (this.terN === N) return;
    if (this.heightArr) { gl.deleteTexture(this.heightArr); gl.deleteTexture(this.flowArr); }
    const mk = (ifmt, fmt, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, ifmt, N, N, MAX_TER, 0, fmt, type, null);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.heightArr = mk(gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.flowArr = mk(gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    this.terN = N;
  }
  uploadTerrain(layer, t) {
    const gl = this.gl;
    this.allocTerrains(t.N);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.heightArr);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, t.N, t.N, 1, gl.RED, gl.FLOAT, t.h);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.flowArr);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, t.N, t.N, 1, gl.RED, gl.UNSIGNED_BYTE, t.flowBytes);
  }

  uploadObjects(data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.objTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, OBJ_W, MAX_OBJ, gl.RGBA, gl.FLOAT, data);
  }
  // dati RGBA32F in texture larghe MESH_TEX_W (4 float per texel)
  uploadMeshes(nodes, tris) {
    const gl = this.gl;
    const mk = (old, data) => {
      gl.deleteTexture(old);
      const texels = Math.max(1, data.length / 4);
      const h = Math.ceil(texels / MESH_TEX_W);
      const full = new Float32Array(MESH_TEX_W * h * 4);
      full.set(data);
      return this.texture2D(gl.RGBA32F, MESH_TEX_W, h, gl.RGBA, gl.FLOAT, full, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    };
    this.meshNodesTex = mk(this.meshNodesTex, nodes);
    this.meshTrisTex = mk(this.meshTrisTex, tris);
  }
  // immagine gia' ridimensionata a IMG_SIZE x IMG_SIZE (canvas o ImageData)
  uploadImage(layer, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.imgArr);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, IMG_SIZE, IMG_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  // cielo gia' esposto e tonemappato, come immagine equirettangolare per lo sfondo della vista 3D
  skyImage(disp) {
    const gl = this.gl;
    const w = this.skyW, h = this.skyH;
    const tex = this.texture2D(gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    const target = { fbo: this.fbo(tex), w, h };
    this.show({ bufs: [{ tex: this.skyTex }], cur: 0, sky: true }, { x: 0, y: 0, w, h }, Object.assign({}, disp, { vignette: 0 }), target);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.deleteFramebuffer(target.fbo); gl.deleteTexture(tex);
    const img = new ImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return img;
  }

  renderSky(sc) {
    const gl = this.gl, p = this.progSky;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo);
    gl.viewport(0, 0, this.skyW, this.skyH);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.uniform2f(this.u(p, 'uRes'), this.skyW, this.skyH);
    gl.uniform3fv(this.u(p, 'uSunDir'), sc.sunDir);
    gl.uniform3fv(this.u(p, 'uRayleigh'), sc.rayleigh);
    gl.uniform1f(this.u(p, 'uMie'), sc.mie);
    gl.uniform1f(this.u(p, 'uSunPower'), sc.sunPower);
    gl.uniform1i(this.u(p, 'uMode'), sc.skyMode);
    gl.uniform3fv(this.u(p, 'uZenith'), sc.skyZenith);
    gl.uniform3fv(this.u(p, 'uHorizon'), sc.skyHorizon);
    gl.uniform3fv(this.u(p, 'uBelow'), sc.skyBelow);
    gl.uniform3fv(this.u(p, 'uSunTint'), sc.skySunTint);
    gl.uniform3fv(this.u(p, 'uNeb1'), sc.skyNeb1);
    gl.uniform3fv(this.u(p, 'uNeb2'), sc.skyNeb2);
    gl.uniform1f(this.u(p, 'uBright'), sc.skyBright);
    gl.uniform1f(this.u(p, 'uNebula'), sc.skyNebula);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------- accumulatori ----------
  createAccum(w, h) {
    const gl = this.gl;
    const mk = () => {
      const t = this.texture2D(gl.RGBA32F, w, h, gl.RGBA, gl.FLOAT, null, this.floatLinear ? gl.LINEAR : gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
      return { tex: t, fbo: this.fbo(t) };
    };
    const a = { w, h, bufs: this.floatBlend ? [mk()] : [mk(), mk()], cur: 0, passes: 0, tile: 0, pixels: 0 };
    const T = 192;
    a.tiles = [];
    for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) a.tiles.push([x, y, Math.min(T, w - x), Math.min(T, h - y)]);
    this.clearAccum(a);
    return a;
  }
  deleteAccum(a) {
    if (!a) return;
    const gl = this.gl;
    for (const b of a.bufs) { gl.deleteTexture(b.tex); gl.deleteFramebuffer(b.fbo); }
  }
  clearAccum(a) {
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    for (const b of a.bufs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    a.cur = 0; a.passes = 0; a.tile = 0;
  }

  setTraceUniforms(sc, q, w, h, frame) {
    const gl = this.gl, p = this.progTrace, u = n => this.u(p, n);
    gl.uniform2f(u('uRes'), w, h);
    gl.uniform1i(u('uFrame'), frame);
    gl.uniform3fv(u('uCamPos'), sc.cam.pos);
    gl.uniform3fv(u('uCamRight'), sc.cam.right);
    gl.uniform3fv(u('uCamUp'), sc.cam.up);
    gl.uniform3fv(u('uCamFwd'), sc.cam.fwd);
    gl.uniform1f(u('uTanHalf'), sc.cam.tanHalf);
    gl.uniform1f(u('uAspect'), w / h);
    gl.uniform1f(u('uAperture'), sc.cam.aperture);
    gl.uniform1f(u('uFocus'), sc.cam.focus);
    gl.uniform1i(u('uStyle'), sc.style);
    gl.uniform1i(u('uZero'), 0);
    gl.uniform1i(u('uTerCount'), sc.terCount);
    gl.uniform4fv(u('uTerPos'), sc.terPos);
    gl.uniform4fv(u('uTerSize'), sc.terSize);
    gl.uniform3fv(u('uTerLow'), sc.terLow);
    gl.uniform3fv(u('uTerMid'), sc.terMid);
    gl.uniform3fv(u('uTerRock'), sc.terRock);
    gl.uniform3fv(u('uTerSnow'), sc.terSnow);
    gl.uniform3fv(u('uTerSand'), sc.terSand);
    gl.uniform2fv(u('uTerMat'), sc.terMat);
    gl.uniform1i(u('uGroundOn'), sc.groundOn ? 1 : 0);
    gl.uniform1f(u('uGroundY'), sc.groundY);
    gl.uniform3fv(u('uGroundColor'), sc.groundColor);
    gl.uniform3fv(u('uGroundColor2'), sc.groundColor2);
    gl.uniform3fv(u('uGroundColor3'), sc.groundColor3);
    gl.uniform4fv(u('uGroundPat'), sc.groundPat);
    gl.uniform1f(u('uGroundShine'), sc.groundShine);
    gl.uniform1i(u('uGroundImgRepeat'), sc.groundImgRepeat ? 1 : 0);
    gl.uniform1i(u('uWaterOn'), sc.waterOn ? 1 : 0);
    gl.uniform1f(u('uWaterLevel'), sc.waterLevel);
    gl.uniform1f(u('uWaterClarity'), sc.waterClarity);
    gl.uniform1f(u('uWaves'), sc.waves);
    gl.uniform3fv(u('uWaterColor'), sc.waterColor);
    gl.uniform3fv(u('uSunDir'), sc.sunDir);
    gl.uniform3fv(u('uSunColor'), sc.sunColor);
    gl.uniform1f(u('uSunSize'), sc.sunSize);
    gl.uniform1f(u('uFogDensity'), sc.fogDensity);
    gl.uniform1f(u('uFogFalloff'), sc.fogFalloff);
    gl.uniform1f(u('uSkyLight'), sc.skyLight);
    gl.uniform1i(u('uSkyMode'), sc.skyMode);
    gl.uniform1f(u('uStars'), sc.skyStars);
    gl.uniform1fv(u('uTerFloat'), sc.terFloat);
    gl.uniform1f(u('uCloudCover'), sc.cloudCover);
    gl.uniform1f(u('uCloudDensity'), sc.cloudDensity);
    gl.uniform1f(u('uCloudBottom'), sc.cloudBottom);
    gl.uniform1f(u('uCloudTop'), sc.cloudTop);
    gl.uniform1f(u('uCloudScale'), sc.cloudScale);
    gl.uniform1i(u('uCloudSteps'), q.cloudSteps);
    gl.uniform1i(u('uBounces'), q.bounces);
    gl.uniform1i(u('uTerrainSteps'), q.terrainSteps);
    gl.uniform1i(u('uObjCount'), sc.objCount);
    if (sc.objData !== this._objData) { this.uploadObjects(sc.objData); this._objData = sc.objData; }
  }

  bindTraceTextures(prevTex) {
    const gl = this.gl, p = this.progTrace;
    const bind = (unit, target, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, tex);
      gl.uniform1i(this.u(p, name), unit);
    };
    bind(0, gl.TEXTURE_2D_ARRAY, this.heightArr, 'uHeights');
    bind(1, gl.TEXTURE_2D_ARRAY, this.flowArr, 'uFlows');
    bind(2, gl.TEXTURE_3D, this.noiseTex, 'uNoise');
    bind(3, gl.TEXTURE_2D, this.skyTex, 'uSky');
    bind(4, gl.TEXTURE_2D, prevTex || this.dummyTex, 'uPrev');
    bind(5, gl.TEXTURE_2D, this.objTex, 'uObjTex');
    bind(6, gl.TEXTURE_2D_ARRAY, this.imgArr, 'uImages');
    bind(7, gl.TEXTURE_2D, this.meshNodesTex, 'uMeshNodes');
    bind(8, gl.TEXTURE_2D, this.meshTrisTex, 'uMeshTris');
  }

  // Aggiunge campioni all'accumulatore entro un budget di pixel. Restituisce i pixel tracciati.
  step(a, sc, q, budget) {
    const gl = this.gl, p = this.progTrace;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    let done = 0;
    if (this.floatBlend) {
      const b = a.bufs[0];
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, a.w, a.h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.blendEquation(gl.FUNC_ADD);
      gl.enable(gl.SCISSOR_TEST);
      this.setTraceUniforms(sc, q, a.w, a.h, a.passes + q.seed);
      gl.uniform1i(this.u(p, 'uUsePrev'), 0);
      this.bindTraceTextures(null);
      while (done < budget) {
        const t = a.tiles[a.tile];
        gl.scissor(t[0], t[1], t[2], t[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        done += t[2] * t[3];
        a.tile++;
        if (a.tile >= a.tiles.length) {
          a.tile = 0; a.passes++;
          gl.uniform1i(this.u(p, 'uFrame'), a.passes + q.seed);
          if (a.passes >= q.maxPasses) break;
        }
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
    } else {
      // ping-pong a fotogramma intero
      const src = a.bufs[a.cur], dst = a.bufs[1 - a.cur];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, a.w, a.h);
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      this.setTraceUniforms(sc, q, a.w, a.h, a.passes + q.seed);
      gl.uniform1i(this.u(p, 'uUsePrev'), 1);
      this.bindTraceTextures(src.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      a.cur = 1 - a.cur; a.passes++;
      done = a.w * a.h;
    }
    return done;
  }

  accumTex(a) { return this.floatBlend ? a.bufs[0].tex : a.bufs[a.cur].tex; }

  show(a, rect, disp, target) {
    const gl = this.gl, p = this.progShow;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex(a));
    gl.uniform1i(this.u(p, 'uAccum'), 0);
    gl.uniform4f(this.u(p, 'uViewport'), rect.x, rect.y, rect.w, rect.h);
    gl.uniform1f(this.u(p, 'uExposure'), disp.exposure);
    gl.uniform1f(this.u(p, 'uVignette'), disp.vignette);
    gl.uniform1f(this.u(p, 'uContrast'), disp.contrast);
    gl.uniform1f(this.u(p, 'uSaturation'), disp.saturation);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Immagine finale in PNG (Blob)
  exportPNG(a, disp) {
    const gl = this.gl;
    const tex = this.texture2D(gl.RGBA8, a.w, a.h, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    const target = { fbo: this.fbo(tex), w: a.w, h: a.h };
    this.show(a, { x: 0, y: 0, w: a.w, h: a.h }, disp, target);
    const px = new Uint8Array(a.w * a.h * 4);
    gl.readPixels(0, 0, a.w, a.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.deleteFramebuffer(target.fbo); gl.deleteTexture(tex);
    const c = document.createElement('canvas');
    c.width = a.w; c.height = a.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(a.w, a.h);
    const row = a.w * 4;
    for (let y = 0; y < a.h; y++) img.data.set(px.subarray((a.h - 1 - y) * row, (a.h - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
}
