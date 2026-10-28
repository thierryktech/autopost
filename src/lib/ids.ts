export function newId(prefix: string): string {
  const c = globalThis.crypto;
  // randomUUID is unavailable in insecure contexts (e.g. an iPad opening http://192.168.x.x in dev).
  const raw = typeof c?.randomUUID === "function" ? c.randomUUID().replace(/-/g, "") : Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${prefix}_${raw.slice(0, 20)}`;
}
