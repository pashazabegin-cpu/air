// 3D simplex noise by Ian McEwan and Stefan Gustavson (webgl-noise, MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;


/** Wind from the fluid grid (cells/s) as a world-space offset, capped so a flick can't tear things apart. */
const WIND = /* glsl */ `
vec2 windAt(vec2 uv) {
  vec2 w = texture(uVelocity, uv).xy * uWindToWorld;
  float l = length(w);
  return l > uWindMax ? w * (uWindMax / l) : w;
}

// Wind averaged over a neighbourhood: moves geometry without folding it over itself.
vec2 softWindAt(vec2 uv) {
  const float r = 0.045;
  vec2 w = texture(uVelocity, uv).xy * 0.2
         + texture(uVelocity, uv + vec2(r, 0.0)).xy * 0.2
         + texture(uVelocity, uv - vec2(r, 0.0)).xy * 0.2
         + texture(uVelocity, uv + vec2(0.0, r)).xy * 0.2
         + texture(uVelocity, uv - vec2(0.0, r)).xy * 0.2;
  w *= uWindToWorld;
  float l = length(w);
  return l > uWindMax ? w * (uWindMax / l) : w;
}
`;

/** The inner light: a point inside the core that leans toward the cursor. */
const LIGHT = /* glsl */ `
uniform vec3 uLightPos;
uniform float uLightPower;
uniform vec3 uGlow;
`;

// The coloured core alone, premultiplied on transparent; the gas pass frosts and veils it.
export const CORE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTanHalf;
uniform float uCamDist;
uniform mat3 uRot;
uniform vec3 uCoreCenter;
uniform float uCoreR;
uniform vec3 uAccent;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform float uFocus;
${LIGHT}
out vec4 outColor;
${NOISE}

// Colours live in the core's own frame, so they turn with it.
vec3 coreColor(vec3 n) {
  float t = dot(n, normalize(vec3(-0.22, 0.95, 0.2)));
  vec3 c = mix(uDeep, uMid, smoothstep(-0.45, 0.2, t));
  c = mix(c, uLight, smoothstep(-0.15, 0.75, t));
  c = mix(c, uAccent, smoothstep(0.6, 1.0, t));
  return c * (1.0 + 0.06 * snoise(n * 2.4));
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec3 ro = vec3(0.0, 0.0, uCamDist) - uCoreCenter;
  vec3 rd = normalize(vec3(ndc.x * uTanHalf * uResolution.x / uResolution.y, ndc.y * uTanHalf, -1.0));

  // Closest approach of the view ray to the core: a soft-edged ball with no hard outline.
  float tc = -dot(ro, rd);
  vec3 closest = ro + rd * tc;
  float b = length(closest);
  vec3 n = b < uCoreR ? (ro + rd * (tc - sqrt(uCoreR * uCoreR - b * b))) / uCoreR : closest / b;
  vec3 col = coreColor(n * uRot);
  // In focus the colours get richer and brighter.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.0 + 0.35 * uFocus) * (1.0 + 0.12 * uFocus);

  // Inner light: a hot spot on the side facing it plus a glow through the body.
  vec3 toLight = uLightPos - uCoreCenter;
  float spot = pow(max(dot(n, normalize(toLight)), 0.0), 5.0);
  vec2 d = closest.xy - toLight.xy;
  float glow = exp(-dot(d, d) / (uCoreR * uCoreR * 0.3));
  col = mix(col, uGlow, clamp((spot * 0.5 + glow * 0.4) * uLightPower, 0.0, 0.7));

  float a = max(smoothstep(uCoreR * 1.1, uCoreR * 0.84, b), smoothstep(uCoreR * 1.9, uCoreR * 0.9, b) * 0.1);
  outColor = vec4(col * a, a);
}`;

export const DOTS_VERTEX = /* glsl */ `#version 300 es
in vec4 aDot;
uniform mat4 uProj;
uniform vec3 uCam;
uniform mat3 uRot;
uniform vec3 uCoreCenter;
uniform float uDotR;
uniform float uFlow;
uniform float uDotSize;
uniform float uPxPerUnit;
uniform sampler2D uVelocity;
uniform vec2 uWindToWorld;
uniform float uWindMax;
uniform vec3 uPointer;
uniform float uHover;
${LIGHT}
out float vAlpha;
out float vSize;
out float vLit;
${NOISE}
${WIND}

void main() {
  vec3 n = uRot * aDot.xyz;
  float seed = aDot.w;

  // Breathing: the lattice swells in slow waves travelling through the gas.
  float breathe = snoise(n * 1.8 + vec3(0.0, uFlow * 0.35, uFlow * 0.1));
  vec3 p = uCoreCenter + n * uDotR * (1.0 + 0.045 * breathe);

  // The cursor parts the dots a little, the wind carries them off; each dot has its own weight.
  vec2 away = p.xy - uPointer.xy;
  float near = exp(-dot(away, away) / 0.06) * uHover;
  p.xy += away / (length(away) + 1e-3) * near * 0.05;
  vec4 clip = uProj * vec4(p - uCam, 1.0);
  vec2 wind = softWindAt(clip.xy / clip.w * 0.5 + 0.5);
  p.xy += wind * (0.7 + 0.6 * seed);
  p.z += length(wind) * (seed - 0.4) * 0.6;

  vec3 view = p - uCam;
  gl_Position = uProj * vec4(view, 1.0);

  vec3 l = p - uLightPos;
  vLit = exp(-dot(l, l) / 0.14) * uLightPower;
  vAlpha = smoothstep(0.2, 0.75, n.z) * (0.75 + 0.25 * seed);
  float persp = uCam.z / -view.z;
  vSize = max(uDotSize * uPxPerUnit * persp * (0.9 + 0.35 * breathe + 0.7 * vLit), 1.2);
  gl_PointSize = vSize + 1.5;
}`;

export const DOTS_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in float vAlpha;
in float vSize;
in float vLit;
out vec4 outColor;
void main() {
  // Anti-aliased disc, measured in pixels from the sprite centre.
  float r = length(gl_PointCoord - 0.5) * (vSize + 1.5);
  float a = 1.0 - smoothstep(vSize * 0.5 - 0.6, vSize * 0.5 + 0.6, r);
  a *= min(vAlpha * (1.0 + vLit), 1.0);
  vec3 col = mix(vec3(0.94, 0.945, 0.96), vec3(1.0), clamp(vLit * 1.4, 0.0, 1.0));
  outColor = vec4(col * a, a);
}`;

export const SHELL_VERTEX = /* glsl */ `#version 300 es
in vec3 aDir;
uniform mat4 uProj;
uniform vec3 uCam;
uniform float uR;
uniform float uFlow;
uniform float uStir;
uniform sampler2D uVelocity;
uniform vec2 uWindToWorld;
uniform float uWindMax;
uniform vec3 uTouch;
uniform float uHover;
out vec3 vPos;
out vec3 vNormal;
${NOISE}
${WIND}

// Height of the gas surface above the base sphere along direction d.
float lift(vec3 d) {
  float h = snoise(d * 1.1 + vec3(0.0, uFlow * 0.16, uFlow * 0.06)) * 0.06
          + snoise(d * 2.2 - vec3(uFlow * 0.12, 0.0, uFlow * 0.1)) * 0.05;
  h *= 1.0 + uStir * 0.9;
  // A soft dimple where the cursor presses in.
  vec3 k = d * uR - uTouch;
  return h - uHover * 0.07 * exp(-dot(k, k) / 0.12);
}

void main() {
  vec3 d = normalize(aDir);
  vec3 t1 = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(d, t1);
  const float e = 0.012;
  vec3 d1 = normalize(d + t1 * e);
  vec3 d2 = normalize(d + t2 * e);
  vec3 p = d * (uR + lift(d));
  vec3 p1 = d1 * (uR + lift(d1));
  vec3 p2 = d2 * (uR + lift(d2));
  vNormal = normalize(cross(p1 - p, p2 - p));
  if (dot(vNormal, d) < 0.0) vNormal = -vNormal;

  // The gas is blown by the cursor's wind, then drifts back as the fluid calms.
  vec4 clip = uProj * vec4(p - uCam, 1.0);
  p.xy += softWindAt(clip.xy / clip.w * 0.5 + 0.5) * 0.35;

  vPos = p;
  gl_Position = uProj * vec4(p - uCam, 1.0);
}`;

// Composites the orb back to front along each view ray: core, milk, dots, milk, streaks, skin.
export const SHELL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
uniform sampler2D uCore;
uniform sampler2D uDots;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2 uResolution;
uniform vec3 uCam;
uniform float uR;
uniform float uFlow;
uniform vec3 uCoreCenter;
uniform float uCoreR;
uniform float uDotR;
uniform float uDensity;
uniform float uMembrane;
uniform float uClearing;
uniform float uFocus;
uniform vec2 uWindToWorld;
uniform float uWindMax;
${LIGHT}
out vec4 outColor;
${NOISE}
${WIND}

float hash(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Where a ray meets a sphere: (near, far, miss distance); near = far = closest approach on a miss.
vec3 sphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float tc = -dot(oc, rd);
  float b2 = max(dot(oc, oc) - tc * tc, 0.0);
  float h = sqrt(max(r * r - b2, 0.0));
  return vec3(tc - h, tc + h, sqrt(b2));
}

vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

// Milky clouds inside the gas, mostly in its outer layer so the core stays readable.
float wisps(vec3 q) {
  vec3 w = q * 1.45 + vec3(0.0, -uFlow * 0.1, uFlow * 0.04);
  w += 0.55 * snoise(q * 0.8 + vec3(uFlow * 0.05, 0.0, 0.0));
  float n = smoothstep(0.2, 0.85, snoise(w) * 0.5 + 0.5);
  return n * n * smoothstep(0.4, 0.95, length(q) / uR);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vPos);
  vec3 rd = -V;
  float facing = clamp(dot(N, V), 0.0, 1.0);
  float edge = 1.0 - facing;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 wind = windAt(uv);
  // Stirring blows the gas thin for a while (the reveal of the reference).
  float thin = (1.0 - uClearing * clamp(texture(uDye, uv).r, 0.0, 1.0)) * (1.0 - uFocus);

  // Depths along the ray: into the gas, the dot sphere, then the core (or out through the back).
  float tIn = distance(uCam, vPos);
  vec3 blob = sphere(uCam, rd, vec3(0.0), uR);
  vec3 core = sphere(uCam, rd, uCoreCenter, uCoreR);
  vec3 dots = sphere(uCam, rd, uCoreCenter, uDotR);
  float onCore = smoothstep(uCoreR * 1.1, uCoreR * 0.75, core.z);
  float tFar = max(mix(max(blob.y, tIn), core.x, onCore), tIn);
  float tDots = clamp(dots.x, tIn, tFar);
  // Away from the core the gas is thicker: it reads as milk there and as a veil over the core.
  float outer = (1.0 - onCore) * thin;
  float aBack = 1.0 - exp(-uDensity * thin * (tFar - tDots)) * (1.0 - 0.32 * outer);
  float aFront = 1.0 - exp(-uDensity * thin * (tDots - tIn)) * (1.0 - 0.2 * outer);

  // What's inside, seen through the surface: bent by it and by the wind, frosted towards the rim.
  vec2 bend = -N.xy * (0.012 + 0.05 * edge * edge) - wind * 0.12;
  bend.x *= uResolution.y / uResolution.x;
  float lod = (0.3 + 2.6 * edge * edge) * thin;
  vec4 inner = textureLod(uCore, uv + bend, lod);
  inner.r = textureLod(uCore, uv + bend * 0.95, lod).r;
  inner.b = textureLod(uCore, uv + bend * 1.06, lod).b;
  vec4 dotLayer = texture(uDots, uv + bend * 0.5) * mix(0.6, 1.0, onCore);

  // Streaks between the surface and the core, dragged by the wind and lit by the inner light.
  float depth = tFar - tIn;
  float stepLen = depth / 8.0;
  float t = stepLen * hash(gl_FragCoord.xy);
  float transmit = 1.0;
  float lit = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 q = vPos + rd * t;
    q.xy -= wind * 1.4;
    float dens = wisps(q) * stepLen * 0.75 * thin;
    vec3 l = q - uLightPos;
    lit += dens * transmit * exp(-dot(l, l) / 0.25);
    transmit *= exp(-dens);
    t += stepLen;
  }
  float streaks = 1.0 - transmit;

  vec3 L = normalize(vec3(-0.55, 0.75, 0.55));
  float diffuse = dot(N, L) * 0.5 + 0.5;
  float shade = 0.88 + 0.12 * diffuse;
  vec3 milk = vec3(0.985, 0.98, 0.972) * shade;
  vec3 skin = mix(vec3(0.9, 0.88, 0.885), vec3(1.0, 0.998, 0.995), smoothstep(0.15, 0.9, diffuse));
  float aSkin = (1.0 - exp(-uMembrane / max(facing, 0.04))) * (1.0 - 0.5 * uFocus);

  vec4 col = inner;
  col = over(vec4(milk * 0.95 * aBack, aBack), col);
  col = over(dotLayer, col);
  col = over(vec4(milk * aFront, aFront), col);
  col = over(vec4(vec3(1.0) * streaks, streaks), col);
  col = over(vec4(skin * aSkin, aSkin), col);

  // The gas scatters the inner light around it.
  vec3 lp = uLightPos - uCam;
  vec3 off = lp - rd * dot(lp, rd);
  float scatter = 0.15 * exp(-dot(off, off) / 0.15) + lit * 0.9;
  col.rgb += uGlow * col.a * uLightPower * scatter;

  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  vec3 H2 = normalize(normalize(vec3(0.6, -0.3, 0.7)) + V);
  float spec = pow(nh, 40.0) * 0.3 + pow(nh, 8.0) * 0.06 + pow(max(dot(N, H2), 0.0), 40.0) * 0.12;
  col = over(vec4(vec3(spec), spec), col);

  outColor = col * smoothstep(0.0, 0.07, facing);
}`;
