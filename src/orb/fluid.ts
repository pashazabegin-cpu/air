/**
 * Screen-space gas: a small stable-fluids solver (Stam) on the GPU, the same technique as the
 * Unicorn Studio reference. The cursor injects velocity and "clearing" dye; every other layer
 * reads the fields — the shell and the dots are blown by `velocity`, the frost clears under `dye`.
 *
 * Velocity is stored in grid cells per second, so advection is `uv - dt * v * texel`.
 */
import {
  DoubleTarget,
  FULLSCREEN_VERTEX,
  Program,
  bindTexture,
  createTarget,
  deleteTarget,
  drawFullscreen,
  renderTo,
  type GL,
  type Target,
  type TargetFormat,
} from "./gl";

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
`;

const SPLAT = /* glsl */ `${HEAD}
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uValue;
  outColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}`;

const ADVECT = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 from = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  outColor = texture(uSource, from) / (1.0 + uDissipation * uDt);
}`;

const DIVERGENCE = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
void main() {
  vec2 c = texture(uVelocity, vUv).xy;
  float l = vL.x < 0.0 ? -c.x : texture(uVelocity, vL).x;
  float r = vR.x > 1.0 ? -c.x : texture(uVelocity, vR).x;
  float t = vT.y > 1.0 ? -c.y : texture(uVelocity, vT).y;
  float b = vB.y < 0.0 ? -c.y : texture(uVelocity, vB).y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

const CURL = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float l = texture(uVelocity, vL).y;
  float r = texture(uVelocity, vR).y;
  float t = texture(uVelocity, vT).x;
  float b = texture(uVelocity, vB).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`;

// Vorticity confinement: gives the small curls back that the coarse grid smears out.
const VORTICITY = /* glsl */ `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float l = texture(uCurl, vL).x;
  float r = texture(uCurl, vR).x;
  float t = texture(uCurl, vT).x;
  float b = texture(uCurl, vB).x;
  float c = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  force *= uCurlStrength * c / (length(force) + 1e-4);
  force.y = -force.y;
  vec2 v = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const PRESSURE = /* glsl */ `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float l = texture(uPressure, vL).x;
  float r = texture(uPressure, vR).x;
  float t = texture(uPressure, vT).x;
  float b = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((l + r + t + b - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = /* glsl */ `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float l = texture(uPressure, vL).x;
  float r = texture(uPressure, vR).x;
  float t = texture(uPressure, vT).x;
  float b = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(r - l, t - b);
  outColor = vec4(v, 0.0, 1.0);
}`;

const SCALE = /* glsl */ `${HEAD}
uniform sampler2D uSource;
uniform float uValue;
void main() {
  outColor = uValue * texture(uSource, vUv);
}`;

export const FLUID = {
  simSize: 144, // cells on the short side
  dyeSize: 360,
  velocityDissipation: 1.5,
  dyeDissipation: 0.7,
  pressureDecay: 0.8,
  pressureIterations: 18,
  curl: 22,
  radius: 0.0045, // splat size, in squared uv
};

interface Splat {
  x: number;
  y: number;
  dx: number;
  dy: number;
  dye: number;
  radius: number;
}

export class Fluid {
  velocity!: DoubleTarget;
  dye!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: Target;
  private curl!: Target;
  private aspect = 1;
  private readonly queue: Splat[] = [];

  private readonly splatProgram: Program;
  private readonly advect: Program;
  private readonly divergenceProgram: Program;
  private readonly curlProgram: Program;
  private readonly vorticity: Program;
  private readonly pressureProgram: Program;
  private readonly gradient: Program;
  private readonly scale: Program;

  private readonly rg: TargetFormat;
  private readonly r: TargetFormat;

  constructor(private readonly gl: GL) {
    this.splatProgram = new Program(gl, FULLSCREEN_VERTEX, SPLAT);
    this.advect = new Program(gl, FULLSCREEN_VERTEX, ADVECT);
    this.divergenceProgram = new Program(gl, FULLSCREEN_VERTEX, DIVERGENCE);
    this.curlProgram = new Program(gl, FULLSCREEN_VERTEX, CURL);
    this.vorticity = new Program(gl, FULLSCREEN_VERTEX, VORTICITY);
    this.pressureProgram = new Program(gl, FULLSCREEN_VERTEX, PRESSURE);
    this.gradient = new Program(gl, FULLSCREEN_VERTEX, GRADIENT);
    this.scale = new Program(gl, FULLSCREEN_VERTEX, SCALE);
    this.rg = { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.r = { internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.LINEAR };
  }

  /** Needs float render targets (EXT_color_buffer_float); without them the orb runs without gas. */
  static supported(gl: GL) {
    return !!gl.getExtension("EXT_color_buffer_float");
  }

  get simWidth() {
    return this.velocity.read.width;
  }

  get simHeight() {
    return this.velocity.read.height;
  }

  resize(width: number, height: number) {
    if (this.velocity) this.dispose();
    const gl = this.gl;
    this.aspect = width / height;
    const [sw, sh] = fit(FLUID.simSize, this.aspect);
    const [dw, dh] = fit(FLUID.dyeSize, this.aspect);
    const pair = (w: number, h: number, f: TargetFormat) =>
      new DoubleTarget(createTarget(gl, w, h, f), createTarget(gl, w, h, f));
    this.velocity = pair(sw, sh, this.rg);
    this.pressure = pair(sw, sh, this.r);
    this.dye = pair(dw, dh, this.r);
    this.divergence = createTarget(gl, sw, sh, this.r);
    this.curl = createTarget(gl, sw, sh, this.r);
  }

  /** x, y in uv (0…1, y up); dx, dy in uv per frame, like pointer deltas. */
  splat(x: number, y: number, dx: number, dy: number, dye: number, radius = FLUID.radius) {
    this.queue.push({ x, y, dx, dy, dye, radius });
  }

  step(dt: number) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    for (const s of this.queue.splice(0)) this.applySplat(s);

    const texel = [1 / this.simWidth, 1 / this.simHeight] as const;
    const pass = (program: Program, target: Target) => {
      program.vec2("uTexel", ...texel);
      renderTo(gl, target);
      drawFullscreen(gl);
    };

    this.curlProgram.use().int("uVelocity", 0);
    bindTexture(gl, 0, this.velocity.read.texture);
    pass(this.curlProgram, this.curl);

    this.vorticity.use().int("uVelocity", 0).int("uCurl", 1).float("uCurlStrength", FLUID.curl).float("uDt", dt);
    bindTexture(gl, 1, this.curl.texture);
    pass(this.vorticity, this.velocity.write);
    this.velocity.swap();

    this.divergenceProgram.use().int("uVelocity", 0);
    bindTexture(gl, 0, this.velocity.read.texture);
    pass(this.divergenceProgram, this.divergence);

    this.scale.use().int("uSource", 0).float("uValue", FLUID.pressureDecay);
    bindTexture(gl, 0, this.pressure.read.texture);
    pass(this.scale, this.pressure.write);
    this.pressure.swap();

    this.pressureProgram.use().int("uPressure", 0).int("uDivergence", 1);
    bindTexture(gl, 1, this.divergence.texture);
    for (let i = 0; i < FLUID.pressureIterations; i++) {
      bindTexture(gl, 0, this.pressure.read.texture);
      pass(this.pressureProgram, this.pressure.write);
      this.pressure.swap();
    }

    this.gradient.use().int("uPressure", 0).int("uVelocity", 1);
    bindTexture(gl, 0, this.pressure.read.texture);
    bindTexture(gl, 1, this.velocity.read.texture);
    pass(this.gradient, this.velocity.write);
    this.velocity.swap();

    this.advect.use().int("uVelocity", 0).int("uSource", 1).float("uDt", dt);
    this.advect.float("uDissipation", FLUID.velocityDissipation);
    bindTexture(gl, 0, this.velocity.read.texture);
    bindTexture(gl, 1, this.velocity.read.texture);
    pass(this.advect, this.velocity.write);
    this.velocity.swap();

    // Dye moves with the same velocity, so it keeps the velocity grid's texel size.
    this.advect.float("uDissipation", FLUID.dyeDissipation);
    bindTexture(gl, 0, this.velocity.read.texture);
    bindTexture(gl, 1, this.dye.read.texture);
    pass(this.advect, this.dye.write);
    this.dye.swap();
  }

  private applySplat(s: Splat) {
    const gl = this.gl;
    const p = this.splatProgram.use().int("uTarget", 0).float("uAspect", this.aspect);
    p.vec2("uPoint", s.x, s.y).float("uRadius", s.radius);

    // Pointer deltas (uv per frame) → cells per second at ~60 fps.
    p.vec3("uValue", s.dx * this.simWidth * 60, s.dy * this.simHeight * 60, 0);
    p.vec2("uTexel", 1 / this.simWidth, 1 / this.simHeight);
    bindTexture(gl, 0, this.velocity.read.texture);
    renderTo(gl, this.velocity.write);
    drawFullscreen(gl);
    this.velocity.swap();

    if (s.dye <= 0) return;
    p.vec3("uValue", s.dye, 0, 0);
    bindTexture(gl, 0, this.dye.read.texture);
    renderTo(gl, this.dye.write);
    drawFullscreen(gl);
    this.dye.swap();
  }

  dispose() {
    const gl = this.gl;
    for (const pair of [this.velocity, this.pressure, this.dye]) {
      deleteTarget(gl, pair.read);
      deleteTarget(gl, pair.write);
    }
    deleteTarget(gl, this.divergence);
    deleteTarget(gl, this.curl);
  }
}

function fit(short: number, aspect: number): [number, number] {
  return aspect >= 1 ? [Math.round(short * aspect), short] : [short, Math.round(short / aspect)];
}
