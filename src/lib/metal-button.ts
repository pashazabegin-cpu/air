/**
 * Liquid-metal buttons: a 1.5 px rim of flowing chrome drawn by a WebGL2 shader, under a dark face
 * and the label; always on (`.btn--metal`) or on hover only (`.btn--metal-hover`). Ported from the React "MetallicButton" component (the shaders
 * are unchanged) to plain DOM, since the site has no framework. Hover speeds the flow up, a click
 * bursts it and sends a ripple, reduced motion freezes it. Without WebGL2 the button stays as it was.
 */

const VERTEX = /* glsl */ `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) {
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) {
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  vec2 objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;
}`;

const FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {
  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;
}

void main() {
  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  vec2 uv = v_objectUV + .5;
  uv.y = 1. - uv.y;

  float cycleWidth = u_repetition;
  float edge = 0.;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-u_angle + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  vec2 shapeUV = uv - .5;
  shapeUV *= .67;
  edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);

  edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

  float opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
  edge = 1.2 * edge;

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color = vec3(0.);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(uv.y, .3);

  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * u_distortion * noise;

  direction += diagBLtoTR;
  float contour = 0.;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
  direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
  direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(uv.y, .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;

  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (u_shiftRed / 20.);
  dispersionBlue *= (u_shiftBlue / 20.);

  float blur = u_softness / 15. + .3 * contour;

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r), bump, u_colorTint.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g), bump, u_colorTint.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

  color = vec3(r, g, b);
  color *= opacity;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  fragColor = vec4(color, opacity);
}`;

/** The component's defaults: black base, white sheen, four bands at 45°, zoom 8, light fringes. */
const LOOK: Record<string, number | number[]> = {
  u_colorBack: [0, 0, 0, 1],
  u_colorTint: [1, 1, 1, 1],
  u_repetition: 4,
  u_softness: 0.5,
  u_angle: 45,
  u_scale: 8,
  u_distortion: 0,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_contour: 0,
  u_fit: 1,
  u_rotation: 0,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
  u_originX: 0.5,
  u_originY: 0.5,
  u_worldWidth: 0,
  u_worldHeight: 0,
};

const SPEED = { idle: 0.6, hover: 1, click: 2.4 };
const MIN_PIXEL_RATIO = 2;

/** The shader on a canvas filling `host`; runs while on screen, at a speed that can change. */
class MetalRim {
  private readonly canvas = document.createElement("canvas");
  private readonly gl: WebGL2RenderingContext;
  private readonly time: WebGLUniformLocation | null;
  private readonly resolution: WebGLUniformLocation | null;
  private readonly pixelRatio: WebGLUniformLocation | null;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private visible = true;

  constructor(
    private readonly host: HTMLElement,
    private speed: number,
  ) {
    const gl = this.canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;

    const program = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    for (const [name, value] of Object.entries(LOOK)) {
      const at = gl.getUniformLocation(program, name);
      if (Array.isArray(value)) gl.uniform4fv(at, value);
      else gl.uniform1f(at, value);
    }
    this.time = gl.getUniformLocation(program, "u_time");
    this.resolution = gl.getUniformLocation(program, "u_resolution");
    this.pixelRatio = gl.getUniformLocation(program, "u_pixelRatio");

    host.prepend(this.canvas);
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    }).observe(host);
    this.resize();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.schedule();
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    const scale = Math.max(window.devicePixelRatio || 1, MIN_PIXEL_RATIO);
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.uniform2f(this.resolution, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.pixelRatio, scale);
    this.draw();
  }

  private schedule() {
    const run = this.speed !== 0 && this.visible;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.draw();
    }
  }

  private readonly frame = (now: number) => {
    this.elapsed += Math.max(0, now - this.last) * this.speed;
    this.last = now;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.time, this.elapsed * 1e-3);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

export function initMetalButtons() {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .querySelectorAll<HTMLElement>(".btn--metal, .btn--metal-hover")
    .forEach((button) => upgrade(button, button.classList.contains("btn--metal-hover"), calm));
}

/**
 * `.btn--metal` is always metal. `.btn--metal-hover` keeps its own look and only lights the rim
 * under the cursor: its shader is built on the first hover and paused whenever the cursor is away.
 */
function upgrade(button: HTMLElement, hoverOnly: boolean, calm: boolean) {
  const rim = span("metal__rim");
  const idle = hoverOnly || calm ? 0 : SPEED.idle;
  let metal: MetalRim | null = null;
  let failed = false;
  const mount = () => {
    if (!metal && !failed) {
      try {
        metal = new MetalRim(rim, idle);
      } catch (error) {
        failed = true;
        console.warn("Metal button is off:", error);
      }
    }
    return metal;
  };
  if (!hoverOnly && !mount()) return;

  const label = span("metal__label", false);
  label.append(...button.childNodes);
  const ripples = span("metal__ripples");
  button.append(rim, span("metal__face"), ripples, label);
  button.classList.add("is-metal");

  const rest = () => metal?.setSpeed(calm ? 0 : button.matches(":hover") ? SPEED.hover : idle);
  let burst = 0;
  button.addEventListener("pointerenter", () => {
    if (hoverOnly && mount()) button.classList.add("is-lit");
    rest();
  });
  button.addEventListener("pointerleave", () => {
    button.classList.remove("is-pressed", "is-lit");
    rest();
  });
  button.addEventListener("pointerdown", () => button.classList.add("is-pressed"));
  button.addEventListener("pointerup", () => button.classList.remove("is-pressed"));
  button.addEventListener("click", (e) => {
    if (calm || !metal) return;
    metal.setSpeed(SPEED.click);
    clearTimeout(burst);
    burst = window.setTimeout(rest, 300);

    const box = button.getBoundingClientRect();
    const ripple = span("metal__ripple");
    ripple.style.left = `${e.clientX - box.left}px`;
    ripple.style.top = `${e.clientY - box.top}px`;
    ripples.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

function span(className: string, decorative = true) {
  const el = document.createElement("span");
  el.className = className;
  if (decorative) el.setAttribute("aria-hidden", "true");
  return el;
}
