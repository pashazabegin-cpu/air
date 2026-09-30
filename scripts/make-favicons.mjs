// Favicons from the logo mark (public/img/logo-mark.svg), the dotted ring of the header logo.
// - favicon.svg: the mark alone, black, white in a dark browser theme;
// - favicon.ico (16 + 32, PNG inside) where SVG isn't taken: the mark on a white disc, so it reads
//   on light and dark tab bars alike;
// - apple-touch-icon.png (180, iOS home screen) and icon-192/512.png (site.webmanifest, Android):
//   the mark on the hero's pale gradient, square — the systems round the corners themselves.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const d = readFileSync("public/img/logo-mark.svg", "utf8").match(/ d="([^"]+)"/)[1];
const MARK = 35.7; // the mark's viewBox is 35.6987 × 35.6997

/** The mark centred in a square `size` wide, `share` of it across, over `backdrop`. */
const icon = (size, share, backdrop = "", fill = "#000") => {
  const scale = (size * share) / MARK;
  const offset = (size - MARK * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${backdrop}
  <path transform="translate(${offset} ${offset}) scale(${scale})" fill="${fill}" d="${d}"/>
</svg>`;
};

/** Rasterised large, then brought down to `size`: finer dots than a direct render. */
const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
const disc = (size) => `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>`;
const gradient = (size) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.12" stop-color="#fdfdfd"/><stop offset="1" stop-color="#bfe1e5"/></linearGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>`;

// SVG: a little room around the ring; its colour follows the browser theme.
writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.5 -1.5 38.7 38.7">
  <style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style>
  <path d="${d}"/>
</svg>
`,
);

// ICO with PNG images inside (every current browser reads these).
const sizes = [16, 32];
const images = await Promise.all(sizes.map((s) => png(icon(s, 0.74, disc(s)), s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(s, entry);
  header.writeUInt8(s, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync("public/favicon.ico", Buffer.concat([header, ...images]));

writeFileSync("public/apple-touch-icon.png", await png(icon(180, 0.56, gradient(180)), 180));
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, await png(icon(s, 0.56, gradient(s)), s));

console.log("favicon.svg, favicon.ico (16, 32), apple-touch-icon.png, icon-192.png, icon-512.png");
