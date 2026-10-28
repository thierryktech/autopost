/*
 * Builds an Advanced SubStation Alpha (.ass) subtitle file for FFmpeg/libass. libass shapes Thai
 * correctly via HarfBuzz when a Thai-capable font (Prompt / Noto Sans Thai) is available.
 */
import type { SubtitleCue, SubtitleStyle } from "@/server/db/schema";

function assColor(hex: string, alpha = 0): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function assTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10));
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

export function buildAss(cues: SubtitleCue[], style: SubtitleStyle, width = 1080, height = 1920): string {
  const boxed = !!style.boxColor;
  const alignment = style.position === "middle" ? 5 : 2;
  const marginV = style.position === "middle" ? 0 : Math.round(height * 0.16);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontFamily},${style.fontSizePx},${assColor(style.textColor)},${assColor(style.textColor)},${assColor(
      boxed ? style.boxColor! : style.outlineColor,
      boxed ? 0x40 : 0,
    )},${assColor("#000000", 0x80)},-1,0,0,0,100,100,0,0,${boxed ? 3 : 1},${boxed ? 18 : 4},${boxed ? 0 : 1},${alignment},80,80,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = [...cues]
    .filter((c) => c.text.trim() && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((c) => `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${escapeAssText(c.text.trim())}`);
  return [...header, ...events, ""].join("\n");
}
