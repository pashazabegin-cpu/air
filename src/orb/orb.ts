/**
 * A gas orb: a coloured core wrapped in a dotted sphere, inside a milky, wobbling blob of gas.
 * - the gas is a fluid simulation: moving the cursor blows it, thins it and drags the dots along;
 * - the core carries a light that follows the cursor and leans toward it; drag to spin it.
 * The canvas is transparent, so the orb sits on any background. Only the core palette differs
 * between orbs; everything else is shared (LOOK).
 */
import { FLUID, Fluid } from "./fluid";
import { dotLattice, icosphere } from "./geometry";
import { FULLSCREEN_VERTEX, Program, bindTexture, createTarget, deleteTarget, drawFullscreen, renderTo, type GL, type Target } from "./gl";
import { follow, mat3FromQuat, perspective, quatAxisAngle, quatIntegrate, quatMultiply, type Quat, type Vec3 } from "./math";
import { rgb, type Palette } from "./palettes";
import { CORE_FRAGMENT, DOTS_FRAGMENT, DOTS_VERTEX, SHELL_FRAGMENT, SHELL_VERTEX } from "./shaders";

/** Shared look, in world units: the gas blob has radius 1. */
export const LOOK = {
  fill: 0.66, // blob diameter as a share of the canvas's short side (the rest is room to wobble)
  fov: (26 * Math.PI) / 180,
  coreR: 0.5,
  dotR: 0.78,
  dotSpacing: 0.048, // radians between neighbouring dots
  dotSize: 0.0085, // dot diameter
  density: 0.15, // milkiness per unit of depth
  membrane: 0.055, // opacity of the surface skin, grows toward the rim
  clearing: 0.7, // how far stirring thins the gas
  spin: 0.2, // idle rotation of the core, rad/s
  lean: 0.32, // how far the core turns toward the cursor, rad
  focusGrow: 0.18, // with the cursor right on the orb it grows by this much…
  focusClear: 0.6, // …and its gas thins by this share, so the core glows through
  maxDpr: 2,
};

const SPIN_AXIS: Vec3 = (() => {
  const l = Math.hypot(0.2, 1);
  return [0.2 / l, 1 / l, 0];
})();

export class Orb {
  private readonly gl: GL;
  private readonly fluid: Fluid | null;
  private readonly coreProgram: Program;
  private readonly dotsProgram: Program;
  private readonly shellProgram: Program;
  private readonly fullscreenVao: WebGLVertexArrayObject;
  private readonly dotsVao: WebGLVertexArrayObject;
  private readonly dotsCount: number;
  private readonly shellVao: WebGLVertexArrayObject;
  private readonly shellCount: number;
  private readonly still: WebGLTexture;
  private coreTarget: Target | null = null;
  private dotsTarget: Target | null = null;

  private readonly proj = new Float32Array(16);
  private readonly rot = new Float32Array(9);
  private width = 0;
  private height = 0;
  private baseW = 1; // world size framed by the canvas at zoom 1
  private baseH = 1;
  private worldW = 1; // …and at the current zoom
  private worldH = 1;
  private camDist = 1;
  private zoom = 1;

  private readonly pointer = { clientX: 0, clientY: 0, known: false, dragging: false, u: 0, v: 0, x: 0, y: 0 };
  private lastUv: [number, number] | null = null;
  private velocity: [number, number] = [0, 0]; // smoothed pointer velocity, world units/s
  private hover = 0; // cursor nearby
  private focus = 0; // cursor right on the orb
  private stir = 0;
  // Random phases, so orbs side by side don't wobble and turn in lockstep.
  private flow = Math.random() * 60;
  private time = Math.random() * 60;
  private spin: Quat = quatAxisAngle(SPIN_AXIS, Math.random() * Math.PI * 2);
  private omega: Vec3 = [0, 0, 0]; // spin added by dragging, rad/s
  private lean: [number, number] = [0, 0];
  private touch: Vec3 = [0, 0, 1];
  private light: Vec3 = [-0.2, 0.2, 0.3];
  private lightPower = 0.25;
  private coreCenter: Vec3 = [0, 0, 0];

  private running = false;
  private visible = true;
  private raf = 0;
  private last = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly palette: Palette,
  ) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;

    this.fluid = Fluid.supported(gl) ? new Fluid(gl) : null;
    this.coreProgram = new Program(gl, FULLSCREEN_VERTEX, CORE_FRAGMENT);
    this.dotsProgram = new Program(gl, DOTS_VERTEX, DOTS_FRAGMENT);
    this.shellProgram = new Program(gl, SHELL_VERTEX, SHELL_FRAGMENT);
    this.fullscreenVao = gl.createVertexArray()!;

    const lattice = dotLattice(LOOK.dotSpacing);
    this.dotsCount = lattice.length / 4;
    this.dotsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.dotsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, lattice, gl.STATIC_DRAW);
    const aDot = gl.getAttribLocation(this.dotsProgram.handle, "aDot");
    gl.enableVertexAttribArray(aDot);
    gl.vertexAttribPointer(aDot, 4, gl.FLOAT, false, 0, 0);

    const sphere = icosphere(6);
    this.shellCount = sphere.indices.length;
    this.shellVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shellVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, sphere.positions, gl.STATIC_DRAW);
    const aDir = gl.getAttribLocation(this.shellProgram.handle, "aDir");
    gl.enableVertexAttribArray(aDir);
    gl.vertexAttribPointer(aDir, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Stand-in for the fluid fields when float targets are missing: no wind, no clearing.
    this.still = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.still);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    this.resize();
  }

  start() {
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private schedule() {
    const shouldRun = this.running && this.visible;
    if (shouldRun && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly frame = (now: number) => {
    // rAF can hand out the same (or an earlier) timestamp twice; a zero step would divide by zero.
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    if (dt > 0) {
      this.last = now;
      this.update(dt);
      this.render();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;
    this.pointer.known = true;
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    this.onPointerMove(e);
    this.pointer.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add("is-dragging");
  };

  private readonly onPointerUp = () => {
    this.pointer.dragging = false;
    this.canvas.classList.remove("is-dragging");
  };

  private readonly onPointerLeave = () => {
    this.pointer.known = false;
    this.lastUv = null;
  };

  private resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, LOOK.maxDpr);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (width === this.width && height === this.height) return;
    this.width = this.canvas.width = width;
    this.height = this.canvas.height = height;

    // Fit the blob to the short side; the camera sits where that framing comes out right.
    const aspect = width / height;
    const short = 2 / LOOK.fill;
    this.baseH = aspect >= 1 ? short : short / aspect;
    this.baseW = this.baseH * aspect;
    this.camDist = this.baseH / (2 * Math.tan(LOOK.fov / 2));
    this.applyZoom();

    if (this.coreTarget) deleteTarget(gl, this.coreTarget);
    if (this.dotsTarget) deleteTarget(gl, this.dotsTarget);
    const rgba = { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
    // The core is soft anyway: half resolution, mipmapped so the gas can frost it.
    this.coreTarget = createTarget(gl, Math.ceil(width / 2), Math.ceil(height / 2), { ...rgba, mipmaps: true });
    this.dotsTarget = createTarget(gl, width, height, rgba);
    this.fluid?.resize(width, height);
    if (this.running && this.visible) this.render();
  }

  /** Zooms the lens rather than moving anything, so the whole orb scales about its centre. */
  private applyZoom() {
    const tanHalf = Math.tan(LOOK.fov / 2) / this.zoom;
    this.worldW = this.baseW / this.zoom;
    this.worldH = this.baseH / this.zoom;
    perspective(2 * Math.atan(tanHalf), this.width / this.height, 0.1, 100, this.proj);
  }

  private update(dt: number) {
    const p = this.pointer;
    this.time += dt;

    // Pointer in canvas uv and on the z = 0 plane. Read every frame: the page may scroll under it.
    let du = 0;
    let dv = 0;
    if (p.known) {
      const rect = this.canvas.getBoundingClientRect();
      p.u = (p.clientX - rect.left) / rect.width;
      p.v = 1 - (p.clientY - rect.top) / rect.height;
      p.x = (p.u - 0.5) * this.worldW;
      p.y = (p.v - 0.5) * this.worldH;
      if (this.lastUv) [du, dv] = [p.u - this.lastUv[0], p.v - this.lastUv[1]];
      this.lastUv = [p.u, p.v];
    }
    const r = Math.hypot(p.x, p.y);
    const near = p.known ? 1 - smoothstep(0.9, 1.9, r) : 0;
    this.hover += (near - this.hover) * follow(6, dt);
    // r is in world units, which grow with the orb, so the edge stays put as it scales: no flicker.
    this.focus += ((p.known && r < 1 ? 1 : 0) - this.focus) * follow(4.5, dt);

    const k = follow(12, dt);
    this.velocity[0] += ((du * this.worldW) / dt - this.velocity[0]) * k;
    this.velocity[1] += ((dv * this.worldH) / dt - this.velocity[1]) * k;
    const speed = Math.hypot(...this.velocity);
    this.stir = Math.min(1.5, (this.stir + speed * dt * 0.35 * this.hover) * Math.exp(-dt * 1.4));
    this.flow += dt * (this.calm ? 0.4 : 1 + this.stir * 1.8);

    this.stirGas(du, dv, dt);

    // Where the cursor presses into the gas: straight under it, or the nearest rim point.
    const touch: Vec3 = r < 1 ? [p.x, p.y, Math.sqrt(1 - r * r)] : [p.x / r, p.y / r, 0];
    const kt = follow(8, dt);
    for (let i = 0; i < 3; i++) this.touch[i] += (touch[i] - this.touch[i]) * kt;

    // Inner light: drifts around the upper left on its own, follows the cursor when it's near.
    const a = this.time * 0.35;
    const idle: Vec3 = [-0.45 + 0.35 * Math.cos(a), 0.4 + 0.25 * Math.sin(a * 1.3), 0.75];
    const aim: Vec3 = [p.x, p.y, 0.8];
    const dir = normalize(mix3(idle, aim, this.hover));
    const reach = LOOK.coreR * 0.8;
    const pull = Math.min(r, 1) * 0.06 * this.hover;
    const center: Vec3 = r > 0 ? [(p.x / r) * pull, (p.y / r) * pull, 0] : [0, 0, 0];
    const kl = follow(5, dt);
    for (let i = 0; i < 3; i++) {
      this.coreCenter[i] += (center[i] - this.coreCenter[i]) * kl;
      this.light[i] += (this.coreCenter[i] + dir[i] * reach - this.light[i]) * kl;
    }
    this.lightPower += (0.25 + 0.45 * this.hover - this.lightPower) * kl;

    // Core rotation: idle spin + what dragging adds, then a lean toward the cursor.
    if (p.dragging) {
      this.omega = [-this.velocity[1] * 1.2, this.velocity[0] * 1.2, 0];
    } else {
      const decay = Math.exp(-dt * 1.6);
      this.omega = [this.omega[0] * decay, this.omega[1] * decay, this.omega[2] * decay];
    }
    const spin = LOOK.spin * (this.calm ? 0.3 : 1);
    const omega: Vec3 = [SPIN_AXIS[0] * spin + this.omega[0], SPIN_AXIS[1] * spin + this.omega[1], this.omega[2]];
    this.spin = quatIntegrate(this.spin, omega, dt);

    const leanTarget = [Math.max(-1, Math.min(1, p.x)) * this.hover, Math.max(-1, Math.min(1, p.y)) * this.hover];
    this.lean[0] += (leanTarget[0] - this.lean[0]) * kl;
    this.lean[1] += (leanTarget[1] - this.lean[1]) * kl;
    const leanAngle = Math.hypot(...this.lean) * LOOK.lean;
    const lean: Quat =
      leanAngle > 1e-5 ? quatAxisAngle(normalize([-this.lean[1], this.lean[0], 0]), leanAngle) : [0, 0, 0, 1];
    mat3FromQuat(quatMultiply(lean, this.spin), this.rot);

    this.zoom = 1 + LOOK.focusGrow * smoothstep(0, 1, this.focus);
    this.applyZoom();
  }

  /** Feeds the fluid: the cursor's path, plus a slow stir of its own so the gas never stands still. */
  private stirGas(du: number, dv: number, dt: number) {
    const fluid = this.fluid;
    if (!fluid) return;
    const p = this.pointer;
    const inside = p.u > -0.1 && p.u < 1.1 && p.v > -0.1 && p.v < 1.1;
    const moved = Math.hypot(du * this.width, dv * this.height);
    if (p.known && inside && moved > 0.5) {
      // Several splats along long moves, so a quick flick leaves a stroke rather than dots.
      const steps = Math.min(8, Math.ceil(moved / 14));
      const dye = Math.min(0.5, Math.hypot(du, dv) * 10) / steps;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps - 1;
        fluid.splat(p.u + du * f, p.v + dv * f, du / steps, dv / steps, dye);
      }
    }

    if (!this.calm) {
      const t = this.time;
      const u = 0.5 + 0.2 * Math.cos(t * 0.41);
      const v = 0.5 + 0.17 * Math.sin(t * 0.53);
      const du0 = -0.2 * 0.41 * Math.sin(t * 0.41) * dt * 0.5;
      const dv0 = 0.17 * 0.53 * Math.cos(t * 0.53) * dt * 0.5;
      fluid.splat(u, v, du0, dv0, 0, FLUID.radius * 3);
    }
    fluid.step(dt);
  }

  private render() {
    const gl = this.gl;
    const core = this.coreTarget!;
    const dots = this.dotsTarget!;
    const tanHalf = Math.tan(LOOK.fov / 2) / this.zoom;
    const focus = smoothstep(0, 1, this.focus);
    const velocity = this.fluid ? this.fluid.velocity.read.texture : this.still;
    const dye = this.fluid ? this.fluid.dye.read.texture : this.still;
    const lag = 0.1; // seconds of wind turned into displacement
    const windX = this.fluid ? (this.worldW / this.fluid.simWidth) * lag : 0;
    const windY = this.fluid ? (this.worldH / this.fluid.simHeight) * lag : 0;
    const [cx, cy, cz] = this.coreCenter;
    const [lx, ly, lz] = this.light;
    const glow = rgb(this.palette.glow);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // 1. The core, alone on transparent.
    renderTo(gl, core);
    gl.bindVertexArray(this.fullscreenVao);
    const cp = this.coreProgram.use();
    cp.vec2("uResolution", core.width, core.height).float("uTanHalf", tanHalf).float("uCamDist", this.camDist);
    cp.mat3("uRot", this.rot).vec3("uCoreCenter", cx, cy, cz).float("uCoreR", LOOK.coreR);
    cp.vec3("uAccent", ...rgb(this.palette.accent)).vec3("uLight", ...rgb(this.palette.light));
    cp.vec3("uMid", ...rgb(this.palette.mid)).vec3("uDeep", ...rgb(this.palette.deep));
    cp.vec3("uLightPos", lx, ly, lz).float("uLightPower", this.lightPower).vec3("uGlow", ...glow);
    cp.float("uFocus", focus);
    drawFullscreen(gl);
    gl.bindTexture(gl.TEXTURE_2D, core.texture);
    gl.generateMipmap(gl.TEXTURE_2D);

    // 2. The dots, on their own layer so the gas can veil them less than the core.
    renderTo(gl, dots);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.dotsVao);
    const dp = this.dotsProgram.use();
    bindTexture(gl, 2, velocity);
    dp.mat4("uProj", this.proj).vec3("uCam", 0, 0, this.camDist).mat3("uRot", this.rot);
    dp.vec3("uCoreCenter", cx, cy, cz).float("uDotR", LOOK.dotR).float("uFlow", this.flow);
    dp.float("uDotSize", LOOK.dotSize).float("uPxPerUnit", this.height / this.worldH);
    dp.int("uVelocity", 2).vec2("uWindToWorld", windX, windY).float("uWindMax", 0.28);
    dp.vec3("uPointer", this.pointer.x, this.pointer.y, 0).float("uHover", this.hover);
    dp.vec3("uLightPos", lx, ly, lz).float("uLightPower", this.lightPower);
    gl.drawArrays(gl.POINTS, 0, this.dotsCount);

    // 3. The gas on screen, compositing everything behind its surface.
    renderTo(gl, null, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.bindVertexArray(this.shellVao);
    const sp = this.shellProgram.use();
    bindTexture(gl, 0, core.texture);
    bindTexture(gl, 1, dots.texture);
    bindTexture(gl, 2, velocity);
    bindTexture(gl, 3, dye);
    sp.int("uCore", 0).int("uDots", 1).int("uVelocity", 2).int("uDye", 3);
    sp.mat4("uProj", this.proj).vec3("uCam", 0, 0, this.camDist).vec2("uResolution", this.width, this.height);
    sp.float("uR", 1).float("uFlow", this.flow).float("uStir", this.stir);
    sp.vec2("uWindToWorld", windX, windY).float("uWindMax", 0.22);
    sp.vec3("uTouch", ...this.touch).float("uHover", this.hover);
    sp.vec3("uCoreCenter", cx, cy, cz).float("uCoreR", LOOK.coreR).float("uDotR", LOOK.dotR);
    sp.float("uDensity", LOOK.density).float("uMembrane", LOOK.membrane).float("uClearing", LOOK.clearing);
    sp.float("uFocus", focus * LOOK.focusClear);
    sp.vec3("uLightPos", lx, ly, lz).float("uLightPower", this.lightPower).vec3("uGlow", ...glow);
    gl.drawElements(gl.TRIANGLES, this.shellCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
