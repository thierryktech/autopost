/*
 * Lightweight guard for Thai captions/subtitles. It cannot prove a claim is true; it flags text
 * that *looks* like an invented fact so the reviewer checks it against the product's verified facts.
 */
export interface CopyWarning {
  kind: "prohibited_claim" | "price" | "health" | "unverified_number" | "length";
  message: string;
  match?: string;
}

const HEALTH_PATTERNS = [
  /ลดน้ำหนัก/, /รักษา/, /ป้องกันโรค/, /ต้านมะเร็ง/, /เผาผลาญ/, /ดีท็อกซ์|ดีท็อก/, /สุขภาพดี/, /ลดความดัน/, /ลดเบาหวาน/,
  /\bcure\b/i, /\bweight loss\b/i, /\bdetox\b/i, /\bhealthy\b/i,
];
const PRICE_PATTERNS = [/฿\s?\d/, /\d+\s?บาท/, /ราคา\s?\d/, /ลด\s?\d+\s?%/, /\d+\s?%\s?off/i, /THB\s?\d/i];

export const CAPTION_MAX = 2200;

export function checkCopy(text: string, opts: { prohibitedClaims: string[]; verifiedFacts: string[] }): CopyWarning[] {
  const warnings: CopyWarning[] = [];
  const lower = text.toLowerCase();
  for (const claim of opts.prohibitedClaims) {
    const c = claim.trim();
    if (c && lower.includes(c.toLowerCase())) {
      warnings.push({ kind: "prohibited_claim", message: `Contains a prohibited claim: “${c}”`, match: c });
    }
  }
  const factsText = opts.verifiedFacts.join(" ");
  for (const p of PRICE_PATTERNS) {
    const m = text.match(p);
    if (m && !factsText.includes(m[0])) {
      warnings.push({ kind: "price", message: `Mentions a price or discount not in verified facts: “${m[0]}”`, match: m[0] });
    }
  }
  for (const p of HEALTH_PATTERNS) {
    const m = text.match(p);
    if (m) warnings.push({ kind: "health", message: `Possible health claim: “${m[0]}”`, match: m[0] });
  }
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const n of numbers) {
    if (!factsText.includes(n)) {
      warnings.push({ kind: "unverified_number", message: `Number “${n}” is not in the product’s verified facts`, match: n });
      break;
    }
  }
  if (text.length > CAPTION_MAX) warnings.push({ kind: "length", message: `Caption exceeds ${CAPTION_MAX} characters` });
  return warnings;
}
