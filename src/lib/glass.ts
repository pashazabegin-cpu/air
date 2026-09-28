import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import liquidGL from "../../vendor/liquidGL/liquidGL.js";

/**
 * Liquid glass for the About feature cards.
 * liquidGL snapshots `.about__scene` once and refracts it through each card in WebGPU/WebGL,
 * so the scene must be in its final (revealed) state when this runs.
 * Open the page with `?glass` in dev to get the live tuning panel.
 */
export async function initGlass() {
  const helper = import.meta.env.DEV && new URLSearchParams(location.search).has("glass");
  if (helper) await import("../../vendor/liquidGL/liquidGL-helper.js");

  const ready = new Promise<void>((resolve) => {
    liquidGL({
      target: ".feature-card",
      snapshot: ".about__scene",
      // WebGPU rejects lens viewports that leave the screen, which freezes the glass as the
      // cards scroll past the edges. WebGL2 clips them normally.
      engine: "webgl2",
      resolution: 2,
      refraction: 0.012,
      bevelDepth: 0.09,
      bevelWidth: 0.2,
      frost: 11,
      aberration: 0.15,
      shadow: false,
      specular: true,
      reveal: "fade",
      helper,
      on: { init: () => resolve() },
    });
  });

  // No WebGL/WebGPU → liquidGL falls back to CSS backdrop-filter and may never call init.
  await Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]);

  // Render the glass from the GSAP ticker (the same one driving Lenis), not a second rAF loop.
  liquidGL.syncWith({ gsap, ScrollTrigger, lenis: false });
}

/**
 * Makes the glass refract a canvas live. liquidGL only tracks <video> elements: every frame it
 * redraws a video's area of its texture when `currentTime` changes. Giving the canvas the same
 * two properties and adding it to that list lets the frame-sequence canvas take the same path.
 * Relies on liquidGL v2.2.4 internals (`__liquidGLRenderer__._videoNodes`); if they are missing
 * the glass keeps refracting the static snapshot.
 */
export function refractLive(canvas: HTMLCanvasElement, state: { position: number; ready: boolean }) {
  const renderer = (window as { __liquidGLRenderer__?: { _videoNodes?: Element[] } }).__liquidGLRenderer__;
  if (!renderer?._videoNodes) return;
  Object.defineProperties(canvas, {
    currentTime: { get: () => state.position, configurable: true },
    readyState: { get: () => (state.ready ? 4 : 0), configurable: true },
  });
  renderer._videoNodes.push(canvas);
}
