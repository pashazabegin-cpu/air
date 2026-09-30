import { gsap } from "gsap";

/** Longest the page waits for its downloads before letting the visitor in regardless. */
const MAX_WAIT_MS = 12000;
/** Slowest climb of the counter, in percent per second, so a warm cache still reads as a count. */
const MIN_RATE = 70;

type Progress = () => number;

/**
 * Preloader (Figma 64:505): the dotted mark spins over a pale breathing glow while the counter
 * climbs with the real downloads the page tracks (fonts, the glass snapshot, the hero frames and video).
 * The counter never runs ahead of them: it reaches 100 only once everything is in.
 */
export function createPreloader() {
  const root = document.querySelector<HTMLElement>(".preloader")!;
  const glow = root.querySelector<HTMLElement>(".preloader__glow")!;
  const mark = root.querySelector<HTMLElement>(".preloader__mark")!;
  const count = root.querySelector<HTMLElement>(".preloader__count")!;

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spin = gsap.to(mark, { rotate: 360, duration: 1.8, ease: "none", repeat: -1, paused: still });
  const breathe = gsap.to(glow, { scale: 1.08, duration: 2.2, ease: "sine.inOut", repeat: -1, yoyo: true, paused: still });

  const sources: { weight: number; progress: Progress }[] = [];
  const started = performance.now();
  let shown = 1;

  const loaded = () => {
    if (performance.now() - started > MAX_WAIT_MS) return 100;
    let sum = 0;
    let total = 0;
    for (const { weight, progress } of sources) {
      sum += weight * Math.min(Math.max(progress(), 0), 1);
      total += weight;
    }
    return total ? (sum / total) * 100 : 0;
  };

  let finish: () => void;
  const complete = new Promise<void>((resolve) => (finish = resolve));

  // Eases toward what has loaded, never slower than MIN_RATE and never past it.
  const tick = (_time: number, deltaMs: number) => {
    const goal = loaded();
    const dt = deltaMs / 1000;
    const step = Math.max((goal - shown) * (1 - Math.exp(-5 * dt)), MIN_RATE * dt);
    shown = Math.max(shown, Math.min(goal, shown + step));

    const value = Math.max(1, Math.round(shown));
    count.textContent = String(value).padStart(2, "0");
    root.setAttribute("aria-valuenow", String(value));
    if (shown >= 100) {
      gsap.ticker.remove(tick);
      finish();
    }
  };
  gsap.ticker.add(tick);

  return {
    /** Resolves once the counter shows 100. */
    complete,

    /** Counts a download in: a promise (done or failed, it is out of the way) or a 0…1 reading. */
    track(source: Promise<unknown> | Progress, weight = 1) {
      if (typeof source === "function") {
        sources.push({ weight, progress: source });
        return;
      }
      let done = 0;
      source.then(
        () => (done = 1),
        () => (done = 1),
      );
      sources.push({ weight, progress: () => done });
    },

    /** The mark spins up and fades, the glow blooms out, and the white lifts off the hero. */
    leave() {
      root.setAttribute("aria-busy", "false");
      root.style.pointerEvents = "none";
      breathe.kill();
      const tl = gsap.timeline({
        onComplete: () => {
          spin.kill();
          root.remove();
        },
      });
      if (!still) tl.to(spin, { timeScale: 3, duration: 0.6, ease: "power2.in" }, 0);
      tl.to([mark, count], { opacity: 0, scale: 0.6, filter: "blur(6px)", duration: 0.6, ease: "power2.in" }, 0);
      tl.to(glow, { scale: 2.6, opacity: 0, duration: 1.4, ease: "power2.inOut" }, 0.1);
      tl.to(root, { backgroundColor: "rgba(255, 255, 255, 0)", duration: 1, ease: "power2.inOut" }, 0.3);
      return tl;
    },
  };
}

export type Preloader = ReturnType<typeof createPreloader>;
