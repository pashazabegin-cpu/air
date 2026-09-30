import { gsap } from "gsap";
import { unit } from "../lib/layout";

/** Scroll choreography for the sections after About. */
export function initDetails() {
  flyDrone();
  countStats();
  riseFormatCards();
  driftFooterWord();
}

/**
 * The drone rises from below while growing to its layout size, which it reaches with its centre
 * mid-screen; scrolling on, it keeps growing another 20% as if flying at the viewer, and leaves
 * over the top. The two phases scale different layers (the box, then the picture in it): two
 * scrubbed tweens on one `scale` overwrite each other when a fast scroll crosses the midpoint.
 */
function flyDrone() {
  // Drone centre and bottom within the section, from its layout box, so both layouts work
  // (offsets ignore the transforms animated below).
  const drone = document.querySelector<HTMLElement>(".flown__drone")!;
  const rising = () => `top+=${drone.offsetTop + drone.offsetHeight / 2} bottom`;
  const centred = () => `top+=${drone.offsetTop + drone.offsetHeight / 2} center`;
  const gone = () => `top+=${drone.offsetTop + drone.offsetHeight} top`;
  gsap.fromTo(
    ".flown__drone",
    { yPercent: 65, scale: 0.8 },
    {
      yPercent: 0,
      scale: 1,
      ease: "none",
      scrollTrigger: { trigger: ".flown", start: rising, end: centred, scrub: 0.8, invalidateOnRefresh: true },
    },
  );
  gsap.fromTo(
    ".flown__drone > img",
    { scale: 1 },
    {
      scale: 1.2,
      ease: "none",
      scrollTrigger: { trigger: ".flown", start: centred, end: gone, scrub: 0.8, invalidateOnRefresh: true },
    },
  );
}

/** Doto numbers count to their value while they scroll in; CO₂ counts down to zero. */
function countStats() {
  document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    const from = to === 0 ? 120 : 0;
    const value = { n: from };
    gsap.to(value, {
      n: to,
      ease: "power1.out",
      onUpdate: () => (el.textContent = String(Math.round(value.n))),
      scrollTrigger: { trigger: el, start: "top 95%", end: "top 60%", scrub: 0.6 },
    });
  });
}

function riseFormatCards() {
  gsap.utils.toArray<HTMLElement>(".format").forEach((card, i) => {
    gsap.fromTo(
      card,
      { y: () => (160 + i * 60) * unit(), opacity: 0 },
      {
        y: 0,
        opacity: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: ".formats__cards", start: "top bottom", end: "top 55%", scrub: 0.7, invalidateOnRefresh: true },
      },
    );
  });
}

function driftFooterWord() {
  gsap.fromTo(
    ".finale__word",
    { xPercent: -8 },
    { xPercent: 0, ease: "none", scrollTrigger: { trigger: ".finale", start: "top bottom", end: "bottom bottom", scrub: true } },
  );
}
