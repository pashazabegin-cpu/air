import { Orb } from "../orb/orb";
import { PALETTES, type PaletteName } from "../orb/palettes";

/** Swaps the three blend pictures for live gas orbs; a picture stays if its orb can't start. */
export function initPlaces() {
  document.querySelectorAll<HTMLElement>(".place__orb[data-orb]").forEach((slot) => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    slot.append(canvas);
    try {
      new Orb(canvas, PALETTES[slot.dataset.orb as PaletteName]).start();
      slot.querySelector("img")?.remove();
    } catch (error) {
      canvas.remove();
      console.warn("Gas orb is off, showing the picture:", error);
    }
  });
}
