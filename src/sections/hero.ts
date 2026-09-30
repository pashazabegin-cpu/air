import type Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type FrameSequence, openSequence } from "../lib/frame-sequence";
import { LITE } from "../lib/layout";
import { addReveal } from "../lib/reveal";

const INTRO_TIMEOUT_MS = 12000;
/** Light build: seconds of video the preloader waits for; the rest streams in as it plays. */
const LITE_BUFFER_S = 2;

/**
 * Hero = scroll video with an intro.
 * 1. Under the preloader the frames download and hero.mp4 buffers up to `from` (6.0 s): `loadHero`.
 * 2. As the preloader lifts, the video plays from 0 to `from` while the interface assembles itself:
 *    the header slides down from the top, then the copy and the button. Scroll is locked: `playHero`.
 * 3. At `from` the video stops and hands over to a canvas holding frames `from`…end.
 * 4. The hero stays pinned for one screen of scroll that scrubs those frames: she turns to
 *    the camera and freezes, then the page scrolls on into About with no seam.
 */
export function loadHero() {
  const hero = document.querySelector<HTMLElement>(".hero")!;
  const video = hero.querySelector<HTMLVideoElement>(".hero__video")!;
  const canvas = hero.querySelector<HTMLCanvasElement>(".hero__frames")!;

  let stopAt = Infinity;
  let framesIn = 0;
  let framesTotal = 1;
  const ready = openSequence("hero", canvas).then(async ({ manifest, sequence }) => {
    stopAt = manifest.from;
    framesTotal = manifest.count;
    await sequence.load(() => framesIn++);
    return { manifest, sequence };
  });

  // iOS Safari downloads a video only once it plays, whatever `preload` says. On touch devices it
  // starts muted under the preloader and holds on its first frame (unless the intro has already
  // begun); where it may not play at all (Low Power Mode) the preloader stops waiting for it.
  let blocked = false;
  if (LITE) {
    video.play().then(
      () => document.body.classList.contains("is-intro") && video.pause(),
      () => (blocked = true),
    );
  }
  const needed = () => (LITE ? Math.min(stopAt, LITE_BUFFER_S) : stopAt);

  /** Share of the intro on hand, 0…1: frames decoded and video buffered up to `from`. */
  const progress = () => (framesIn / framesTotal + (blocked ? 1 : buffered(video, needed()))) / 2;
  return { ready, progress };
}

export type HeroLoad = ReturnType<typeof loadHero>;

export async function playHero(lenis: Lenis, { ready }: HeroLoad) {
  const hero = document.querySelector<HTMLElement>(".hero")!;
  const video = hero.querySelector<HTMLVideoElement>(".hero__video")!;
  const canvas = hero.querySelector<HTMLCanvasElement>(".hero__frames")!;
  const content = hero.querySelector<HTMLElement>(".hero__content")!;

  const { manifest, sequence: frames } = await ready;

  const intro = buildIntro(content);
  document.body.classList.remove("is-intro");
  // Without autoplay (iOS Low Power Mode) the still she turns from stands in for the video.
  const videoStopped = playUntil(video, manifest.from).catch(() => {
    frames.render(0);
    gsap.to(canvas, { opacity: 1, duration: 0.8, ease: "power2.out" });
  });
  intro.play();

  await Promise.race([
    Promise.all([videoStopped, intro.then()]),
    new Promise((r) => setTimeout(r, INTRO_TIMEOUT_MS)),
  ]);

  frames.render(0);
  gsap.set(canvas, { opacity: 1 });
  video.pause();
  intro.progress(1);

  bindScroll(hero, frames);
  lenis.start();
}

function buffered(video: HTMLVideoElement, until: number) {
  if (video.error || video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return 1;
  if (!Number.isFinite(until) || !video.buffered.length) return 0;
  return Math.min(video.buffered.end(0) / until, 1);
}

function buildIntro(content: HTMLElement) {
  const nav = document.querySelector<HTMLElement>(".nav")!;
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

  // The header comes down from above the screen in one piece, like a native top bar, as the
  // preloader lifts. Its own CSS transitions (compact state) would drag behind every GSAP frame:
  // off for the slide, and its inline transform is cleared after so the states are plain CSS again.
  nav.classList.add("is-arriving");
  tl.fromTo(
    nav,
    { yPercent: -100 },
    {
      yPercent: 0,
      duration: 1.3,
      ease: "expo.out",
      clearProps: "transform",
      onComplete: () => nav.classList.remove("is-arriving"),
    },
    0.35,
  );

  // Labels, title and lead appear together, then the button.
  addReveal(tl, content, 1.9, 2);
  tl.fromTo(
    content.querySelector(".hero__cta"),
    { opacity: 0, scale: 0.9, filter: "blur(10px)" },
    // Cleared after, or GSAP's inline `scale: none` would block the button's hover scale.
    { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.4, clearProps: "transform,opacity,filter" },
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
