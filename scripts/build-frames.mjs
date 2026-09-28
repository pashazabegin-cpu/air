// Builds the scroll-driven image sequences.
// hero:  hero.mp4 plays as a normal video up to `from` (the preloader); frames from there on are scrubbed.
// about: the whole clip is scrubbed while the glass cards pass.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SEQUENCES = [
  { name: "hero", video: "public/video/hero.mp4", from: 6.0, width: 2560 },
  { name: "about", video: "media/about-scroll.mp4", from: 0, width: 2304 },
];

for (const { name, video, from, width } of SEQUENCES) {
  const cache = `scripts/.cache/frames-${name}`;
  const out = `public/frames/${name}`;
  rmSync(cache, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  mkdirSync(out, { recursive: true });

  execFileSync("swift", ["scripts/extract-frames.swift", video, cache, String(from), "999"], {
    stdio: ["ignore", "ignore", "ignore"],
  });

  const files = readdirSync(cache).filter((f) => f.endsWith(".png")).sort();
  let total = 0;
  let size = { width: 0, height: 0 };
  for (const f of files) {
    const info = await sharp(`${cache}/${f}`)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(`${out}/${f.replace(".png", ".webp")}`);
    total += info.size;
    size = { width: info.width, height: info.height };
  }
  writeFileSync(`${out}/manifest.json`, JSON.stringify({ from, count: files.length, ...size }));
  console.log(`${name}: ${files.length} frames, ${size.width}×${size.height}, ${(total / 1024 / 1024).toFixed(1)} MB`);
}
