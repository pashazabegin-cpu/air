import "@fontsource/geist/200.css";
import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/main.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { initHeader } from "./lib/header";
import { initMetalButtons } from "./lib/metal-button";
import { initParallax } from "./lib/parallax";
import { initScrollReveals } from "./lib/reveal";
import { createSmoothScroll } from "./lib/smooth-scroll";
import { initAbout } from "./sections/about";
import { initDetails } from "./sections/details";
import { initFormats } from "./sections/formats";
import { initHero } from "./sections/hero";
import { initPlaces } from "./sections/places";

gsap.registerPlugin(ScrollTrigger, SplitText);

async function boot() {
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const lenis = createSmoothScroll();
  lenis.stop(); // locked until the preloader finishes
  initHeader(lenis);
  if (import.meta.env.DEV) Object.assign(window, { lenis, ScrollTrigger });

  await document.fonts.ready;

  // Glass first: its one-off page snapshot happens while the screen is still white.
  await initAbout();

  initScrollReveals((group) => !!group.closest(".hero") || group.matches(".about__scene"));
  initPlaces();
  initMetalButtons();
  initParallax();
  initDetails();
  initFormats();
  ScrollTrigger.refresh();

  await initHero(lenis);
  ScrollTrigger.refresh();
}

boot();
