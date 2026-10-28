export function newId(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}_${uuid}`;
}
