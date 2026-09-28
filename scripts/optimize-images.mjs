// Converts the Figma PNG exports into web-sized WebP (≈2× their rendered size).
// Originals are kept in design-ref/assets.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import sharp from "sharp";

const jobs = {
  "product-mask-small": 260, // 121px slot
  "product-vessel": 400, // ~188px drawn
  "product-atrium": 360, // 105×176 slot
  drone: 1024, // 790×404 slot, cover
  "kv-woman": 546, // 514×964 slot, cover
  "blend-forest": 320, // 146×139 slot
  "blend-sea": 320,
  "blend-antarctic": 320,
};

for (const [name, width] of Object.entries(jobs)) {
  const src = `public/img/${name}.png`;
  const keep = `design-ref/assets/${name}.png`;
  if (existsSync(src)) {
    copyFileSync(src, keep);
    rmSync(src);
  }
  const info = await sharp(keep).resize({ width, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(`public/img/${name}.webp`);
  console.log(name, `${info.width}×${info.height}`, `${Math.round(info.size / 1024)} KB`);
}
