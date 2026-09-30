import { ScrollTrigger } from "gsap/ScrollTrigger";
import { isDesktop, unit } from "./layout";

/**
 * Depth into `.finale` (design px) past which its background is too dark for the grey menu:
 * luminance drops below ~0.33 there in the Figma render.
 */
const DARK_FROM = 330;
/** Compact layout: the same point, where the woman's shoulders meet the dark (share of her picture). */
const DARK_FROM_KV = 0.45;

/** Header states; CSS does all the motion (see the Header block in sections.css). */
export function initHeader() {
  const nav = document.querySelector<HTMLElement>(".nav")!;
  const kv = document.querySelector<HTMLElement>(".finale__kv")!;
  const darkFrom = () => (isDesktop() ? DARK_FROM * unit() : kv.offsetTop + kv.offsetHeight * DARK_FROM_KV);
  const barMiddle = () => nav.offsetHeight / 2;

  // All zones run to the end of the page, so they only react to crossing their start:
  // an `end` at the very bottom would switch them off exactly where they are needed most.
  const from = (className: string, trigger: string, start: string | (() => string)) =>
    ScrollTrigger.create({
      trigger,
      start,
      invalidateOnRefresh: true,
      onEnter: () => nav.classList.add(className),
      onLeaveBack: () => nav.classList.remove(className),
    });

  // The full header stays over the first screen while she turns, and folds into the compact
  // glass bar once that screen is half scrolled away (the hero's bottom at mid-screen)…
  from("is-compact", ".hero", "bottom 50%");
  // …white menu while the dark end of the page is under the bar…
  from("is-dark", ".finale", () => `top+=${darkFrom()} top+=${isDesktop() ? 16.5 * unit() : barMiddle()}`);
  // …and no bar at all once the footer, which has its own menu, comes in.
  from("is-away", ".footer__logo", "top 90%");
}
