/**
 * Core colours, top to bottom of the inner sphere, picked from design-ref/assets/blend-*.png
 * (a touch deeper, since the gas veils them). `glow` tints the inner light.
 */
export interface Palette {
  accent: string;
  light: string;
  mid: string;
  deep: string;
  glow: string;
}

export const PALETTES = {
  forest: { accent: "#fca47a", light: "#f3edbe", mid: "#8ccb58", deep: "#0f4128", glow: "#fbffe6" },
  sea: { accent: "#f7a88c", light: "#d6cbd2", mid: "#6f93e0", deep: "#2e56c4", glow: "#fff1ea" },
  antarctic: { accent: "#f0e2a0", light: "#c4ead6", mid: "#58c2b8", deep: "#0c4d63", glow: "#f2fff8" },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
