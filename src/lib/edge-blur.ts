import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Progressive blur along the bottom of the screen, after the "ProgressiveBlur" reference
 * (motion-primitives): stacked backdrop blurs, each seen through its own band of a mask, stronger
 * toward the edge. Size and strength: LAYERS × BLUR_STEP here, the band's height in sections.css.
 * It slides away once the footer's last line comes up, so that line stays sharp.
 */
const LAYERS = 8;
/** Blur added per layer, px: the bottom layer ends up at (LAYERS − 1) × BLUR_STEP. */
const BLUR_STEP = 1;

export function initEdgeBlur() {
  const root = document.querySelector<HTMLElement>(".edge-blur")!;
  const band = 1 / (LAYERS + 1);

  for (let i = 0; i < LAYERS; i++) {
    // Opaque over two bands, fading in over the one above and out over the one below.
    const stops = [i, i + 1, i + 2, i + 3].map((k, j) => `rgb(0 0 0 / ${j === 1 || j === 2 ? 1 : 0}) ${k * band * 100}%`);
    const mask = `linear-gradient(to bottom, ${stops.join(", ")})`;
    const blur = `blur(${i * BLUR_STEP}px)`;
    const layer = document.createElement("div");
    layer.style.setProperty("-webkit-mask-image", mask);
    layer.style.setProperty("mask-image", mask);
    layer.style.setProperty("-webkit-backdrop-filter", blur);
    layer.style.setProperty("backdrop-filter", blur);
    root.append(layer);
  }

  ScrollTrigger.create({
    trigger: ".footer__copy",
    start: "top bottom",
    onEnter: () => root.classList.add("is-away"),
    onLeaveBack: () => root.classList.remove("is-away"),
  });
}
