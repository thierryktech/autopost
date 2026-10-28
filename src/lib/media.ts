export type Orientation = "portrait" | "landscape" | "square" | "unknown";

export function orientationOf(w: number | null | undefined, h: number | null | undefined): Orientation {
  if (!w || !h) return "unknown";
  const r = w / h;
  if (Math.abs(r - 1) < 0.05) return "square";
  return r < 1 ? "portrait" : "landscape";
}

export const ORIENTATION_LABEL: Record<Orientation, string> = {
  portrait: "Portrait",
  landscape: "Landscape",
  square: "Square",
  unknown: "Unknown",
};
