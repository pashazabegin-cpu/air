import { Orb } from "./orb";
import { PALETTES, type PaletteName } from "./palettes";

// ?solo=sea (or #solo=sea) shows one orb large, like the original picture.
const solo = new URLSearchParams(location.search || location.hash.slice(1)).get("solo");
if (solo) {
  document.body.classList.add("is-solo");
  for (const figure of document.querySelectorAll(".orbs figure")) {
    if (figure.querySelector<HTMLElement>("canvas")!.dataset.orb !== solo) figure.remove();
  }
}

const orbs = [...document.querySelectorAll<HTMLCanvasElement>("canvas[data-orb]")].map((canvas) => {
  const orb = new Orb(canvas, PALETTES[canvas.dataset.orb as PaletteName]);
  orb.start();
  return orb;
});

for (const button of document.querySelectorAll<HTMLButtonElement>(".bg button")) {
  button.addEventListener("click", () => {
    document.body.dataset.bg = button.dataset.bg;
    for (const b of document.querySelectorAll(".bg button")) b.setAttribute("aria-pressed", String(b === button));
  });
}

if (import.meta.env.DEV) Object.assign(window, { orbs });
