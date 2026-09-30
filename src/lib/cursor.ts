import { gsap } from "gsap";
import { unit } from "./smooth-scroll";

/**
 * Custom cursor (Figma 70:796): a 6 px dot with a disc of glass behind it that trails a little.
 * Motion follows the "cursor follower" reference: dot and disc ease toward the pointer (0.2 and
 * 0.1 per 60 Hz frame), the disc is 28 px and grows to the Figma 40 px over anything clickable.
 *
 * The glass is the About cards' liquidGL look, but live: liquidGL refracts one still snapshot
 * of About, which a cursor crossing videos and orbs can't use. So its shader is redone as an SVG
 * filter behind the disc (Chromium only; elsewhere the disc is a plain tint): the picture is
 * pushed outward by the same edge profile (refraction 0.012, bevel 0.09 over 20 % of the width,
 * faded toward the centre) with a 0.15 colour split, then its two drifting highlights.
 * Unlike the cards there is no frost: on a 40 px disc it hid the menu word under the cursor,
 * so the middle stays clear and only the rim bends and splits colour.
 */

const DOT_EASE = 0.2;
const GLASS_EASE = 0.1;
/** Design px: the reference's 28 px disc, 40 px (Figma) over links and buttons. */
const REST = 28;
const LENS = 40;
const INTERACTIVE = "a, button, input, textarea, select, label, [role='button']";

// The About cards' liquidGL settings (src/lib/glass.ts) and what they come to in pixels there:
// liquidGL offsets are fractions of its snapshot, the ~1440 × 900 About screen.
const REFRACTION = 0.012;
const BEVEL_DEPTH = 0.09;
const BEVEL_WIDTH = 0.2;
const ABERRATION = 0.15;
const SNAPSHOT = Math.sqrt(1440 * 900); // design px per unit of liquidGL offset
/** Furthest the rim reaches out for its picture, design px; the lens box is padded by it. */
const REACH = Math.ceil((REFRACTION + BEVEL_DEPTH) * SNAPSHOT * (1 + ABERRATION));
const MAP_SIZE = 160; // displacement map resolution across the 40 px lens

export function initCursor() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const cursor = document.createElement("div");
  cursor.className = "cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML =
    '<div class="cursor__glass"><span class="cursor__lens"></span><span class="cursor__sheen"></span></div>' +
    '<span class="cursor__dot"></span>';
  document.body.append(cursor);
  document.documentElement.classList.add("has-cursor");

  const glass = cursor.querySelector<HTMLElement>(".cursor__glass")!;
  const sheen = cursor.querySelector<HTMLElement>(".cursor__sheen")!;
  const dot = cursor.querySelector<HTMLElement>(".cursor__dot")!;
  cursor.style.setProperty("--lens-reach", String(REACH));
  cursor.style.setProperty("--lens-rest", String(REST / LENS));

  const chromium = (navigator as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some(
    (b) => b.brand === "Chromium",
  );
  if (chromium) mountLens(cursor);

  // Follow: each part eases toward the pointer, frame-rate independent.
  const pointer = { x: -100, y: -100 };
  const at = { dot: { ...pointer }, glass: { ...pointer } };
  let shown = false;
  // `translate`, not `transform`: it applies after the `scale` the disc grows by, so the growth
  // stays centred on the pointer.
  const place = (el: HTMLElement, p: { x: number; y: number }) => (el.style.translate = `${p.x}px ${p.y}px`);

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!shown) {
        // First sight: start where the pointer is instead of sliding in from a corner.
        Object.assign(at.dot, pointer);
        Object.assign(at.glass, pointer);
        shown = true;
      }
      cursor.classList.add("is-visible");
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));

  // Grows over anything clickable.
  document.addEventListener("pointerover", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    cursor.classList.toggle("is-hover", !!target?.closest(INTERACTIVE));
  });

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.ticker.add((time, deltaMs) => {
    const frames = deltaMs / (1000 / 60);
    const ease = (rate: number) => 1 - Math.pow(1 - rate, frames);
    at.dot.x += (pointer.x - at.dot.x) * ease(DOT_EASE);
    at.dot.y += (pointer.y - at.dot.y) * ease(DOT_EASE);
    at.glass.x += (pointer.x - at.glass.x) * ease(GLASS_EASE);
    at.glass.y += (pointer.y - at.glass.y) * ease(GLASS_EASE);
    place(dot, at.dot);
    place(glass, at.glass);

    // liquidGL's specular: two soft lights drifting over the glass (its u_time paths).
    if (still) return;
    const lights = [
      [Math.sin(time * 0.2), Math.cos(time * 0.3)],
      [Math.sin(time * -0.4 + 1.5), Math.cos(time * 0.25 - 0.5)],
    ];
    lights.forEach(([x, y], i) => {
      sheen.style.setProperty(`--l${i}x`, `${(x * 0.6 + 0.5) * 100}%`);
      sheen.style.setProperty(`--l${i}y`, `${(y * 0.6 + 0.5) * 100}%`);
    });
  });
}

/**
 * The refracting lens: an SVG filter the disc's backdrop runs through. Its box is padded by
 * REACH on every side so the rim can pick its picture from outside the disc, as liquidGL does.
 */
function mountLens(cursor: HTMLElement) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "cursor__filters");
  svg.setAttribute("aria-hidden", "true");
  // One displacement per channel for the colour split: red lags, blue leads (liquidGL's chroma).
  const channel = (name: string, matrix: string, scale: number) => `
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="${name}d" />
    <feColorMatrix in="${name}d" type="matrix" values="${matrix}" result="${name}" />`;
  svg.innerHTML = `
    <filter id="cursor-lens" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox">
      <feImage href="${lensMap()}" preserveAspectRatio="none" result="map" />
      ${channel("r", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", 1 - ABERRATION)}
      ${channel("g", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", 1)}
      ${channel("b", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", 1 + ABERRATION)}
      <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg" />
      <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" />
    </filter>`;
  document.body.append(svg);

  // Filter numbers are in css px of the padded box, so they follow the page scale.
  const image = svg.querySelector("feImage")!;
  const maps = svg.querySelectorAll("feDisplacementMap");
  const fit = () => {
    const u = unit();
    const reach = REACH * u;
    image.setAttribute("x", String(reach));
    image.setAttribute("y", String(reach));
    image.setAttribute("width", String(LENS * u));
    image.setAttribute("height", String(LENS * u));
    const full = 2 * (REFRACTION + BEVEL_DEPTH) * SNAPSHOT * u; // map value 0…1 ↔ ±full / 2
    maps.forEach((map, i) => map.setAttribute("scale", String(full * [1 - ABERRATION, 1, 1 + ABERRATION][i])));
  };
  fit();
  window.addEventListener("resize", fit);
  cursor.classList.add("is-refracting");
}

/**
 * Displacement map of the lens (R = x, G = y, 0.5 = still), from liquidGL's lens shader:
 * edge = 1 − smoothstep(0, bevel, depth inside the rim); push = edge·refraction + edge¹⁰·bevelDepth,
 * outward, faded in from the centre by smoothstep(0.15, 0.45, |p|).
 */
function lensMap() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MAP_SIZE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const max = REFRACTION + BEVEL_DEPTH;
  const bevel = BEVEL_WIDTH * LENS;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const px = ((x + 0.5) / MAP_SIZE - 0.5) * LENS; // design px from the centre
      const py = ((y + 0.5) / MAP_SIZE - 0.5) * LENS;
      const r = Math.hypot(px, py);
      const depth = Math.max(LENS / 2 - r, 0);
      const edge = 1 - smooth(0, bevel, depth);
      const push = (edge * REFRACTION + Math.pow(edge, 10) * BEVEL_DEPTH) * smooth(0.15, 0.45, r / LENS);
      const k = r > 0 ? push / max / r : 0;
      const i = (y * MAP_SIZE + x) * 4;
      img.data[i] = Math.round(127.5 + 127.5 * px * k);
      img.data[i + 1] = Math.round(127.5 + 127.5 * py * k);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
