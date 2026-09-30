// Light copies of the scroll sequences for touch devices (phones, tablets): 1600 px wide instead
// of 2560/2304. They are drawn from <img> elements the browser may decode and drop as it likes,
// so the page never holds every frame decoded at once (src/lib/frame-sequence.ts).
// Made from the full sets in public/frames; `npm run frames` runs it after rebuilding those.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const LITE_WIDTH = 1600;

for (const name of ["hero", "about"]) {
  const src = `public/frames/${name}`;
  const out = `public/frames/${name}-lite`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifest = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
  let total = 0;
  let size = { width: 0, height: 0 };
  for (const f of readdirSync(src).filter((f) => f.endsWith(".webp")).sort()) {
    const info = await sharp(`${src}/${f}`)
      .resize({ width: LITE_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(`${out}/${f}`);
    total += info.size;
    size = { width: info.width, height: info.height };
  }
  writeFileSync(`${out}/manifest.json`, JSON.stringify({ ...manifest, ...size }));
  console.log(`${name}-lite: ${manifest.count} frames, ${size.width}×${size.height}, ${(total / 1024 / 1024).toFixed(1)} MB`);
}
