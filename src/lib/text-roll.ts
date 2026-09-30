/**
 * Hover text roll for [data-roll] links and buttons, after 21st.dev's TextStaggerHover: each letter
 * slides up out of its own slot while a copy rises from below, 25 ms apart. CSS runs the motion
 * (`.roll` in base.css); this only splits the text. Screen readers get it whole from aria-label.
 * Run it before the metal buttons: they move the button's content into their label as it is.
 */
export function initTextRoll() {
  document.querySelectorAll<HTMLElement>("[data-roll]").forEach((el) => {
    const text = el.textContent?.trim() ?? "";

    const roll = document.createElement("span");
    roll.className = "roll";
    roll.setAttribute("aria-hidden", "true");
    Array.from(text).forEach((char, i) => {
      const slot = document.createElement("span");
      slot.className = "roll__char";
      slot.style.setProperty("--i", String(i));
      // A plain space would collapse to nothing inside an inline-block.
      const glyph = char === " " ? " " : char;
      for (let copy = 0; copy < 2; copy++) {
        const face = document.createElement("span");
        face.textContent = glyph;
        slot.append(face);
      }
      roll.append(slot);
    });

    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", text);
    el.replaceChildren(roll);
  });
}
