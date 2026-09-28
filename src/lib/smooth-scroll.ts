import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * One clock for everything: Lenis smooths the scroll, and it is stepped from the GSAP ticker
 * so ScrollTrigger, the video frames and the glass all read the same scroll position each frame.
 */
export function createSmoothScroll() {
  const lenis = new Lenis({
    lerp: 0.075,
    wheelMultiplier: 0.9,
    smoothWheel: true,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

/** Size of one Figma design pixel in CSS pixels (artboard is 1440 wide). */
export const unit = () => window.innerWidth / 1440;
