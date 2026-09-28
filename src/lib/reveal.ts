import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

/**
 * Word-by-word text reveal.
 * - `heading`: fade + blur + rise per word (the TextReveal "fade-in-blur" preset).
 * - `text`: ghost text filling in per word (Magic UI TextRevealByWord).
 * Every [data-reveal] in one group starts together and finishes together, so a heading and
 * its copy always move in sync.
 */
type RevealKind = "heading" | "text";

const HIDDEN: Record<RevealKind, gsap.TweenVars> = {
  heading: { opacity: 0, filter: "blur(12px)", yPercent: 45 },
  text: { opacity: 0.15, filter: "blur(6px)", yPercent: 0 },
};

const SHOWN: gsap.TweenVars = { opacity: 1, filter: "blur(0px)", yPercent: 0 };

/** Share of the group's span each word takes; the rest is spread across the stagger. */
const WORD_SHARE: Record<RevealKind, number> = { heading: 0.55, text: 0.45 };

function revealTargets(scope: Element) {
  return scope.matches("[data-reveal]")
    ? [scope as HTMLElement]
    : Array.from(scope.querySelectorAll<HTMLElement>("[data-reveal]"));
}

function split(el: HTMLElement) {
  const kind = (el.dataset.reveal as RevealKind) ?? "text";
  const { words } = SplitText.create(el, {
    type: "words",
    wordsClass: "rw",
    aria: "auto",
    reduceWhiteSpace: false,
  });
  return { kind, words };
}

/** Adds the synchronized reveal of everything inside `scope` to `tl`, from `at` over `span`. */
export function addReveal(tl: gsap.core.Timeline, scope: Element, at = 0, span = 1) {
  for (const el of revealTargets(scope)) {
    const { kind, words } = split(el);
    const each = span * WORD_SHARE[kind];
    tl.fromTo(
      words,
      HIDDEN[kind],
      { ...SHOWN, duration: each, ease: "power2.out", stagger: { amount: span - each } },
      at,
    );
  }
  return tl;
}

/** Scroll-bound reveals for every [data-reveal-group] not handled by a section of its own. */
export function initScrollReveals(skip: (group: Element) => boolean) {
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    if (skip(group)) return;
    const trigger = revealTargets(group)[0] ?? group;
    const tl = gsap.timeline({
      scrollTrigger: { trigger, start: "top 92%", end: "top 48%", scrub: 0.7 },
    });
    addReveal(tl, group);
  });
}
