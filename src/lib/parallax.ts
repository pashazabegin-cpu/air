import { gsap } from "gsap";
import { unit } from "./smooth-scroll";

/**
 * [data-parallax="N"]: the element drifts N design pixels while it crosses the viewport
 * (negative = moves up faster than the page, positive = lags behind).
 */
export function initParallax() {
  document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
    const amount = Number(el.dataset.parallax) || 0;
    gsap.fromTo(
      el,
      { y: () => -amount * unit() },
      {
        y: () => amount * unit(),
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );
  });
}
