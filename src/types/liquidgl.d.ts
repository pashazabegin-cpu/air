// Types for the vendored liquidGL v2.2.4 (vendor/liquidGL/liquidGL.js), covering what this project uses.
declare module "*/liquidGL.js" {
  export interface LiquidGLOptions {
    target: string;
    snapshot?: string;
    engine?: "auto" | "webgpu" | "webgl2" | "webgl";
    resolution?: number;
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: "none" | "fade";
    tilt?: boolean;
    tiltFactor?: number;
    tiltEase?: number;
    magnify?: number;
    helper?: boolean;
    on?: { init?: (instance: unknown) => void };
  }

  export interface LiquidGL {
    (options: LiquidGLOptions): unknown;
    registerDynamic(elements: string | Element | Element[]): void;
    syncWith(config: {
      gsap?: unknown;
      ScrollTrigger?: unknown;
      lenis?: unknown | false;
      locomotiveScroll?: unknown | false;
    }): void;
  }

  const liquidGL: LiquidGL;
  export default liquidGL;
}

// Side-effect module: registers the dev tuning GUI used by `helper: true`.
declare module "*/liquidGL-helper.js";
