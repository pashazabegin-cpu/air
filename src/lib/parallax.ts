import { gsap } from "gsap";
import { isDesktop, unit } from "./layout";

/**
 * [data-parallax="N"]: the element drifts N design pixels while it crosses the viewport
 * (negative = moves up faster than the page, positive = lags behind).
 * Half as far in the compact layout, where the pictures are closer together.
 */
export function initParallax() {
  const drift = (amount: number) => amount * unit() * (isDesktop() ? 1 : 0.5);
  document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
    const amount = Number(el.dataset.parallax) || 0;
    gsap.fromTo(
      el,
      { y: () => -drift(amount) },
      {
        y: () => drift(amount),
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
