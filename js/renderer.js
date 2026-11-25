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
    this.progTrace = this.program(VS_QUAD, FS_TRACE);
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

    this.heightTex = null; this.normalTex = null;
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
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Errore di link:\n' + gl.getProgramInfoLog(p));
    return p;
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

  setTerrain(t, normalBytes) {
    const gl = this.gl;
    if (this.heightTex) gl.deleteTexture(this.heightTex);
    if (this.normalTex) gl.deleteTexture(this.normalTex);
    this.heightTex = this.texture2D(gl.R16F, t.N, t.N, gl.RED, gl.FLOAT, t.h, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
    this.normalTex = this.texture2D(gl.RGBA8, t.N, t.N, gl.RGBA, gl.UNSIGNED_BYTE, normalBytes, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
  }
  updateNormals(N, normalBytes) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.normalTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, normalBytes);
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
    gl.uniform1f(u('uTSize'), sc.tSize);
    gl.uniform1f(u('uTHeight'), sc.tHeight);
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
    gl.uniform1f(u('uCloudCover'), sc.cloudCover);
    gl.uniform1f(u('uCloudDensity'), sc.cloudDensity);
    gl.uniform1f(u('uCloudBottom'), sc.cloudBottom);
    gl.uniform1f(u('uCloudTop'), sc.cloudTop);
    gl.uniform1f(u('uCloudScale'), sc.cloudScale);
    gl.uniform1i(u('uCloudSteps'), q.cloudSteps);
    gl.uniform1i(u('uBounces'), q.bounces);
    gl.uniform1i(u('uTerrainSteps'), q.terrainSteps);
    gl.uniform3fv(u('uColLow'), sc.pal.low);
    gl.uniform3fv(u('uColMid'), sc.pal.mid);
    gl.uniform3fv(u('uColRock'), sc.pal.rock);
    gl.uniform3fv(u('uColSnow'), sc.pal.snow);
    gl.uniform3fv(u('uColSand'), sc.pal.sand);
    gl.uniform1f(u('uSnowLine'), sc.pal.snowLine);
    gl.uniform1f(u('uRockSlope'), sc.pal.rockSlope);
    gl.uniform1i(u('uObjCount'), sc.objCount);
    gl.uniform4fv(u('uObjA'), sc.objA);
    gl.uniform4fv(u('uObjB'), sc.objB);
    gl.uniform4fv(u('uObjC'), sc.objC);
  }

  bindTraceTextures(prevTex) {
    const gl = this.gl, p = this.progTrace;
    const bind = (unit, target, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, tex);
      gl.uniform1i(this.u(p, name), unit);
    };
    bind(0, gl.TEXTURE_2D, this.heightTex, 'uHeight');
    bind(1, gl.TEXTURE_2D, this.normalTex, 'uNormal');
    bind(2, gl.TEXTURE_3D, this.noiseTex, 'uNoise');
    bind(3, gl.TEXTURE_2D, this.skyTex, 'uSky');
    bind(4, gl.TEXTURE_2D, prevTex || this.dummyTex, 'uPrev');
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
