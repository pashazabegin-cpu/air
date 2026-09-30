import "@fontsource/geist/200.css";
import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/main.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { initCursor } from "./lib/cursor";
import { initEdgeBlur } from "./lib/edge-blur";
import { initHeader } from "./lib/header";
import { LITE } from "./lib/layout";
import { initMenu } from "./lib/menu";
import { initMetalButtons } from "./lib/metal-button";
import { initParallax } from "./lib/parallax";
import { createPreloader } from "./lib/preloader";
import { initScrollReveals } from "./lib/reveal";
import { createSmoothScroll } from "./lib/smooth-scroll";
import { initTextRoll } from "./lib/text-roll";
import { initAbout } from "./sections/about";
import { initDetails } from "./sections/details";
import { initFormats } from "./sections/formats";
import { loadHero, playHero } from "./sections/hero";
import { initPlaces } from "./sections/places";

gsap.registerPlugin(ScrollTrigger, SplitText);

async function boot() {
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  document.documentElement.classList.toggle("is-lite", LITE);

  initCursor();
  const preloader = createPreloader();
  const lenis = createSmoothScroll();
  lenis.stop(); // locked until the hero intro finishes
  initHeader();
  initMenu(lenis);
  initTextRoll();
  if (import.meta.env.DEV) Object.assign(window, { lenis, ScrollTrigger });

  // Everything the preloader counts starts now. The glass goes first once the fonts are in:
  // its one-off snapshot of About happens under the preloader.
  const hero = loadHero();
  const glass = document.fonts.ready.then(initAbout);
  preloader.track(document.fonts.ready, 1);
  preloader.track(glass, 2);
  preloader.track(hero.progress, 6);

  await glass;
  initScrollReveals((group) => !!group.closest(".hero") || group.matches(".about__scene"));
  initPlaces();
  initMetalButtons();
  initParallax();
  initDetails();
  initFormats();
  if (!LITE) initEdgeBlur();
  ScrollTrigger.refresh();

  await preloader.complete;
  preloader.leave();
  await playHero(lenis, hero);
  ScrollTrigger.refresh();
}

boot();
