import { LITE } from "./layout";

/**
 * Scroll-scrubbed image sequence on a canvas (the technique Apple uses for product videos).
 * Seeking a <video> per scroll step stutters; pre-decoded frames are instant and exact.
 * Between two frames it cross-fades, so even slow scrolling moves continuously.
 *
 * Two ways to hold the frames:
 * - eager (desktop): every frame decoded up front into an ImageBitmap;
 * - lazy (the light build, touch devices): <img> elements the browser decodes as they are needed
 *   and may drop again. Every frame decoded at 2560 px is about 2.4 GB, which a phone can't hold,
 *   so frames near the current one are decoded ahead instead.
 */
type Frame = ImageBitmap | HTMLImageElement;

/** Lazy mode: frames decoded ahead of the current one, behind it and in front of it. */
const WARM_BEHIND = 2;
const WARM_AHEAD = 4;

export class FrameSequence {
  private frames: Frame[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private drawn = -1;
  private warmed = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly urls: string[],
    private readonly lazy = false,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
  }

  /** Current position in frames; also what liquidGL watches to know the canvas changed. */
  get position() {
    return this.drawn;
  }

  get ready() {
    return this.frames.length === this.urls.length && this.frames.length > 0;
  }

  /** Downloads every frame (and decodes it, when eager); `onFrame` fires as each one is in. */
  async load(onFrame?: () => void) {
    this.frames = await Promise.all(
      this.urls.map(async (url) => {
        const frame = this.lazy ? await loadImage(url) : await createImageBitmap(await (await fetch(url)).blob());
        onFrame?.();
        return frame;
      }),
    );
    const first = this.frames[0];
    this.canvas.width = first instanceof HTMLImageElement ? first.naturalWidth : first.width;
    this.canvas.height = first instanceof HTMLImageElement ? first.naturalHeight : first.height;
  }

  /** Draws the sequence at `progress` in [0, 1]. */
  render(progress: number) {
    if (!this.ready) return;
    const last = this.frames.length - 1;
    const position = Math.min(Math.max(progress, 0), 1) * last;
    if (Math.abs(position - this.drawn) < 0.002) return;
    this.drawn = position;

    const index = Math.floor(position);
    const blend = position - index;
    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(this.frames[index], 0, 0);
    if (blend > 0.01 && index < last) {
      this.ctx.globalAlpha = blend;
      this.ctx.drawImage(this.frames[index + 1], 0, 0);
    }
    if (this.lazy) this.warm(index);
  }

  /** Lazy mode: decodes the neighbours off the main thread, so the next draws don't have to. */
  private warm(index: number) {
    if (index === this.warmed) return;
    this.warmed = index;
    for (let i = Math.max(index - WARM_BEHIND, 0); i <= Math.min(index + WARM_AHEAD, this.frames.length - 1); i++) {
      const frame = this.frames[i];
      if (frame instanceof HTMLImageElement) frame.decode().catch(() => undefined);
    }
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Frame failed to load: ${url}`));
    img.src = url;
  });
}

export interface SequenceManifest {
  /** Second of the source clip where the sequence starts. */
  from: number;
  count: number;
}

/**
 * Reads public/frames/<name>/manifest.json and prepares (but does not yet load) the sequence.
 * The light build reads <name>-lite, the same frames at 1600 px (scripts/build-lite-frames.mjs).
 */
export async function openSequence(name: string, canvas: HTMLCanvasElement) {
  const dir = LITE ? `${name}-lite` : name;
  const manifest: SequenceManifest = await fetch(`/frames/${dir}/manifest.json`).then((r) => r.json());
  const urls = Array.from({ length: manifest.count }, (_, i) => `/frames/${dir}/${String(i).padStart(3, "0")}.webp`);
  return { manifest, sequence: new FrameSequence(canvas, urls, LITE) };
}
