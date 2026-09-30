import type Lenis from "lenis";
import { COMPACT } from "./layout";

/**
 * Compact layout (below 1200 px): the header links fold into a panel under the bar, opened by the
 * burger. The page holds still while it is open; a link closes it and glides to its section.
 * The panel is `.nav__links` itself, restyled in responsive.css, so desktop markup is unchanged.
 */
export function initMenu(lenis: Lenis) {
  const nav = document.querySelector<HTMLElement>(".nav")!;
  const burger = nav.querySelector<HTMLButtonElement>(".nav__burger")!;
  const panel = nav.querySelector<HTMLElement>(".nav__links")!;
  // Only unlock the scroll the menu itself locked: during the hero intro it stays locked.
  let lockedByMenu = false;

  const isOpen = () => nav.classList.contains("is-open");
  const set = (open: boolean) => {
    if (open === isOpen()) return;
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open && !lenis.isStopped) {
      lenis.stop();
      lockedByMenu = true;
    } else if (!open && lockedByMenu) {
      lenis.start();
      lockedByMenu = false;
    }
  };

  burger.addEventListener("click", () => set(!isOpen()));
  document.addEventListener("keydown", (e) => e.key === "Escape" && set(false));
  matchMedia(COMPACT).addEventListener("change", () => set(false));

  panel.querySelectorAll<HTMLAnchorElement>("a[href^='#']").forEach((link) =>
    link.addEventListener("click", (e) => {
      if (!isOpen()) return;
      e.preventDefault();
      set(false);
      lenis.scrollTo(link.hash, { duration: 1.2 });
    }),
  );
}
