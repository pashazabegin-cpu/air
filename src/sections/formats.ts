import { gsap } from "gsap";
import { isDesktop, unit } from "../lib/layout";

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

  initCardDots();

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
 * Compact layout: the cards are a swipeable row. Dots under it show which card is in view and
 * bring any card in with a tap. Hidden on desktop, where all three cards are on screen.
 */
function initCardDots() {
  const row = document.querySelector<HTMLElement>(".formats__cards")!;
  const cards = Array.from(row.querySelectorAll<HTMLElement>(".format"));
  const dots = document.createElement("div");
  dots.className = "formats__dots";
  row.after(dots);

  // Scroll position that snaps each card to the row's left padding.
  const stop = (card: HTMLElement) => card.offsetLeft - parseFloat(getComputedStyle(row).paddingLeft);
  const buttons = cards.map((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Show ${card.querySelector(".format__name")?.textContent ?? "format"}`);
    button.addEventListener("click", () => row.scrollTo({ left: stop(card), behavior: "smooth" }));
    dots.append(button);
    return button;
  });

  const mark = () => {
    const end = row.scrollLeft >= row.scrollWidth - row.clientWidth - 2;
    const distance = (card: HTMLElement) => Math.abs(stop(card) - row.scrollLeft);
    const current = end ? cards.length - 1 : cards.indexOf(cards.reduce((a, b) => (distance(b) < distance(a) ? b : a)));
    buttons.forEach((button, i) => button.setAttribute("aria-current", String(i === current)));
  };
  row.addEventListener("scroll", mark, { passive: true });
  mark();
}

/**
 * Moves the pill to the checked option. On desktop each option carries the pill's x and width in
 * design px (data-thumb, from the Figma states), so it lands and stretches exactly as drawn; in the
 * compact layout the options share the track equally and the pill takes the option's own box.
 */
function placeThumb(group: HTMLElement, animate: boolean) {
  const thumb = group.querySelector<HTMLElement>(".segmented__thumb")!;
  const option = group.querySelector("input:checked")?.closest<HTMLElement>(".segmented__option");
  if (!option?.dataset.thumb) return;
  const [x, width] = isDesktop()
    ? option.dataset.thumb.split(" ").map((v) => Number(v) * unit())
    : [option.offsetLeft, option.offsetWidth];
  gsap.to(thumb, {
    x,
    width,
    duration: animate ? 0.7 : 0,
    ease: "power3.inOut",
    overwrite: true,
  });
}
