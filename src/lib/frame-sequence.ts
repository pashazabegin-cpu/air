/**
 * Scroll-scrubbed image sequence on a canvas (the technique Apple uses for product videos).
 * Seeking a <video> per scroll step stutters; pre-decoded frames are instant and exact.
 * Between two frames it cross-fades, so even slow scrolling moves continuously.
 */
export class FrameSequence {
  private frames: ImageBitmap[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private drawn = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly urls: string[],
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

  /** Downloads and decodes every frame; `onFrame` fires as each one is ready (the preloader counts them). */
  async load(onFrame?: () => void) {
    this.frames = await Promise.all(
      this.urls.map(async (url) => {
        const res = await fetch(url);
        const frame = await createImageBitmap(await res.blob());
        onFrame?.();
        return frame;
      }),
    );
    this.canvas.width = this.frames[0].width;
    this.canvas.height = this.frames[0].height;
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
  }
}

export interface SequenceManifest {
  /** Second of the source clip where the sequence starts. */
  from: number;
  count: number;
}

/** Reads public/frames/<name>/manifest.json and prepares (but does not yet load) the sequence. */
export async function openSequence(name: string, canvas: HTMLCanvasElement) {
  const manifest: SequenceManifest = await fetch(`/frames/${name}/manifest.json`).then((r) => r.json());
  const urls = Array.from({ length: manifest.count }, (_, i) => `/frames/${name}/${String(i).padStart(3, "0")}.webp`);
  return { manifest, sequence: new FrameSequence(canvas, urls) };
}
