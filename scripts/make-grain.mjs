// Grain tile matching the Figma noise effect.
// Measured on the export: the backgrounds are lifted towards white by ≈11% on average
// (+3–8 levels on the light gradients, +20–30 in the dark footer), with fine per-pixel variation.
// So the tile is white with a per-pixel alpha around 0.11, drawn over the gradient backgrounds.
import sharp from "sharp";

const SIZE = 256;
const MEAN = 0.11;
const SPREAD = 0.03;

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  const alpha = Math.min(Math.max(MEAN + SPREAD * gauss(), 0), 1);
  pixels.set([255, 255, 255, Math.round(alpha * 255)], i * 4);
}

const info = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile("public/img/grain.png");
console.log("grain.png", `${info.width}×${info.height}`, `${(info.size / 1024).toFixed(1)} KB`);
