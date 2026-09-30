/**
 * Two layouts; keep the queries in sync with src/styles/responsive.css.
 * - Desktop, 1200 px and up: the 1440 Figma artboard, every size in 1440ths of the viewport width.
 * - Compact, below that: flowing columns for tablets (600–1199) and phones (under 600).
 * `--u` is one design pixel in either: 100vw / 1440 on desktop, the compact scale `--m` below it.
 */
export const DESKTOP = "(min-width: 1200px)";
export const COMPACT = "(max-width: 1199px)";

export const isDesktop = () => matchMedia(DESKTOP).matches;

/**
 * Touch-first devices (phones, tablets) get the light build: 1600 px scroll frames decoded on
 * demand, CSS glass instead of liquidGL, no bottom edge blur. Decided once, at load.
 */
export const LITE = matchMedia("(hover: none) and (pointer: coarse)").matches;

let probe: HTMLElement | undefined;

/** One design pixel in CSS px, measured from the live `--u`, so scripts and styles always agree. */
export function unit() {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:0;top:0;width:calc(100 * var(--u));height:0;visibility:hidden;pointer-events:none";
    document.body.append(probe);
  }
  return probe.getBoundingClientRect().width / 100;
}
