import { gsap } from "gsap";
import { unit } from "../lib/smooth-scroll";

/**
 * Price table for the configurator. The design only shows 40 L + Sea breeze = €300;
 * the other values are placeholders to adjust.
 */
const PRICE_BY_VOLUME: Record<string, number> = { "12": 120, "40": 300, "80": 520 };
const BLEND_SURCHARGE: Record<string, number> = { forest: 0, sea: 0, antarctic: 60 };

export function initFormats() {
  document.querySelectorAll<HTMLElement>(".format").forEach((card) => {
    // Hover: the product grows a touch while the card lights up (glow is CSS). Through GSAP, which
    // already owns the image's transform for parallax, so the two combine instead of clashing.
    const product = card.querySelector<HTMLElement>(".format__image")!;
    const grow = (scale: number) => gsap.to(product, { scale, duration: 0.7, ease: "power3.out", overwrite: "auto" });
    card.addEventListener("pointerenter", () => grow(1.08));
    card.addEventListener("pointerleave", () => grow(1));

    const toggle = card.querySelector<HTMLButtonElement>(".format__toggle")!;
    toggle.addEventListener("click", () => {
      const selected = card.classList.toggle("is-selected");
      toggle.setAttribute("aria-pressed", String(selected));
    });
  });

  const form = document.querySelector<HTMLFormElement>(".config")!;
  const amount = form.querySelector<HTMLElement>(".config__amount")!;
  const segmented = Array.from(form.querySelectorAll<HTMLElement>(".segmented"));
  const shown = { value: Number(amount.textContent) };

  const moveThumbs = (animate: boolean) => segmented.forEach((group) => placeThumb(group, animate));
  const updateTotal = () => {
    const data = new FormData(form);
    const total = PRICE_BY_VOLUME[String(data.get("volume"))] + BLEND_SURCHARGE[String(data.get("blend"))];
    gsap.to(shown, {
      value: total,
      duration: 0.8,
      ease: "power3.out",
      onUpdate: () => (amount.textContent = Math.round(shown.value).toLocaleString("en-US")),
    });
  };

  form.addEventListener("change", () => {
    moveThumbs(true);
    updateTotal();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  document.querySelector(".subscribe")?.addEventListener("submit", (e) => e.preventDefault());

  moveThumbs(false);
  window.addEventListener("resize", () => moveThumbs(false));
}

/**
 * Moves the pill to the checked option. Each option carries the pill's x and width in design px
 * (data-thumb, from the Figma states), so it lands and stretches exactly as drawn.
 */
function placeThumb(group: HTMLElement, animate: boolean) {
  const thumb = group.querySelector<HTMLElement>(".segmented__thumb")!;
  const option = group.querySelector("input:checked")?.closest<HTMLElement>(".segmented__option");
  if (!option?.dataset.thumb) return;
  const [x, width] = option.dataset.thumb.split(" ").map(Number);
  gsap.to(thumb, {
    x: x * unit(),
    width: width * unit(),
    duration: animate ? 0.7 : 0,
    ease: "power3.inOut",
    overwrite: true,
  });
}
