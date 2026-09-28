import type Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type FrameSequence, openSequence } from "../lib/frame-sequence";
import { addReveal } from "../lib/reveal";

const INTRO_TIMEOUT_MS = 12000;

/**
 * Hero = preloader + scroll video.
 * 1. hero.mp4 plays from 0 to `from` (6.0 s) while the interface assembles itself; scroll is locked.
 * 2. At `from` the video stops and hands over to a canvas holding frames `from`…end.
 * 3. The hero stays pinned for one screen of scroll that scrubs those frames: she turns to
 *    the camera and freezes, then the page scrolls on into About with no seam.
 */
export async function initHero(lenis: Lenis) {
  const hero = document.querySelector<HTMLElement>(".hero")!;
  const video = hero.querySelector<HTMLVideoElement>(".hero__video")!;
  const canvas = hero.querySelector<HTMLCanvasElement>(".hero__frames")!;
  const content = hero.querySelector<HTMLElement>(".hero__content")!;

  const { manifest, sequence: frames } = await openSequence("hero", canvas);
  const framesLoaded = frames.load();

  const intro = buildIntro(content);
  document.body.classList.remove("is-intro");

  const videoStopped = playUntil(video, manifest.from).catch(() => undefined);
  video.addEventListener("playing", () => intro.play(), { once: true });
  // Autoplay refused or slow to start: run the interface intro on its own clock.
  setTimeout(() => intro.isActive() || intro.progress() > 0 || intro.play(), 900);

  await Promise.race([
    Promise.all([videoStopped, framesLoaded, intro.then()]),
    new Promise((r) => setTimeout(r, INTRO_TIMEOUT_MS)),
  ]);
  await framesLoaded;

  frames.render(0);
  gsap.set(canvas, { opacity: 1 });
  video.pause();
  intro.progress(1);

  bindScroll(hero, frames);
  lenis.start();
}

function buildIntro(content: HTMLElement) {
  const nav = document.querySelector<HTMLElement>(".nav")!;
  // The header's own CSS transitions (compact state) would drag behind every GSAP frame: off for
  // the intro. Its inline styles are cleared at the end so the compact state is plain CSS again.
  nav.classList.add("is-arriving");
  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: "power3.out" },
    onComplete: () => nav.classList.remove("is-arriving"),
  });

  // The dotted logo spins like a loader for as long as the video intro runs.
  tl.fromTo(
    nav.querySelector(".logo__mark"),
    { rotate: -300, scale: 0.4, opacity: 0 },
    { rotate: 0, scale: 1, opacity: 1, duration: 5.4, ease: "power2.inOut", clearProps: "transform,opacity" },
    0.1,
  );
  tl.fromTo(
    nav.querySelectorAll(".logo__word, .nav__links a, .nav__icon"),
    { opacity: 0, y: -12, filter: "blur(8px)" },
    { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.2, stagger: 0.08, clearProps: "transform,opacity,filter" },
    0.9,
  );

  // Labels, title and lead appear together, then the button.
  addReveal(tl, content, 1.9, 2);
  tl.fromTo(
    content.querySelector(".hero__cta"),
    { opacity: 0, scale: 0.9, filter: "blur(10px)" },
    { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.4 },
    3.3,
  );
  return tl;
}

/**
 * Plays the video from the start and pauses it on `stopAt` seconds.
 * Frame callbacks are the precise path; the interval is a guard for when the browser
 * throttles them (e.g. the tab was in the background), and any overshoot is seeked back.
 */
function playUntil(video: HTMLVideoElement, stopAt: number) {
  const halfFrame = 1 / 48;
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    // Browsers pause muted video in background tabs; carry on when the visitor comes back.
    const resume = () => !finished && !document.hidden && video.paused && video.play().catch(() => undefined);
    document.addEventListener("visibilitychange", resume);

    const done = () => {
      if (finished) return;
      finished = true;
      clearInterval(guard);
      document.removeEventListener("visibilitychange", resume);
      video.pause();
      if (video.currentTime > stopAt + halfFrame) video.currentTime = stopAt;
      resolve();
    };
    const check = (time: number) => time >= stopAt - halfFrame && done();

    const guard = window.setInterval(() => check(video.currentTime), 15);
    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame: VideoFrameRequestCallback = (_, meta) => {
        check(meta.mediaTime);
        if (!finished) video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }

    video.currentTime = 0;
    video.play().catch((error) => {
      clearInterval(guard);
      reject(error);
    });
  });
}

/** The turn is tied 1:1 to the pinned part of the hero. */
function bindScroll(hero: HTMLElement, frames: FrameSequence) {
  ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => frames.render(self.progress),
  });
}
