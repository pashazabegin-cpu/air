import { gsap } from "gsap";
import { openSequence } from "../lib/frame-sequence";
import { initGlass, refractLive } from "../lib/glass";
import { addReveal } from "../lib/reveal";

/**
 * About: scrolls in straight after the hero (same gradient, no seam), then pins.
 * While pinned, the three liquid-glass cards travel up through the middle of the screen and
 * about-scroll.mp4 plays across exactly that pass: first card in → clip starts, last card out → clip ends.
 */
export async function initAbout() {
  const about = document.querySelector<HTMLElement>(".about")!;
  const scene = about.querySelector<HTMLElement>(".about__scene")!;
  const canvas = scene.querySelector<HTMLCanvasElement>(".about__frames")!;
  const column = document.querySelector<HTMLElement>(".features__column")!;

  let progress = 0;
  const { sequence: frames } = await openSequence("about", canvas);
  // Loads in the background; the hero preloader does not wait for it.
  frames
    .load()
    .then(() => {
      frames.render(progress);
      canvas.classList.add("is-ready");
    })
    .catch((error) => console.error("About frames failed to load", error));

  // Glass snapshots the scene as it looks fully revealed — before any "hidden" states are applied.
  await initGlass();
  refractLive(canvas, frames);

  // Entry: the copy reveals while About scrolls in; the colour bridge from the hero fades out.
  const entry = gsap.timeline({
    scrollTrigger: { trigger: about, start: "top 75%", end: "top 12%", scrub: 0.6 },
  });
  addReveal(entry, scene, 0.1, 0.9);
  gsap.fromTo(
    scene.querySelector(".about__seam"),
    { opacity: 1 },
    { opacity: 0, ease: "none", scrollTrigger: { trigger: about, start: "top 60%", end: "top top", scrub: true } },
  );

  // Pinned phase: cards rise from below the fold to above it, 1:1 with the scroll,
  // and the clip is spread over the same distance.
  const pass = gsap.timeline({
    scrollTrigger: {
      trigger: about,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => frames.render((progress = self.progress)),
    },
  });
  pass.fromTo(column, { y: () => window.innerHeight }, { y: () => -column.offsetHeight, ease: "none" });
}
