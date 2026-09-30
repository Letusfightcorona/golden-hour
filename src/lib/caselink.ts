import type { Evidence } from "./extract";

// Evidence travels from WhatsApp to the website in the URL (?case=...), so nothing is stored server-side.
const KEYS: (keyof Evidence)[] = ["amount", "utr", "date", "time", "bank", "account_last4", "upi_id", "payee", "scammer_phone"];

export function encodeCase(ev: Evidence): string {
  const slim = Object.fromEntries(KEYS.filter((k) => ev[k] !== undefined).map((k) => [k, ev[k]]));
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCase(param: string): Evidence | null {
  try {
    const bin = atob(param.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const ev: Evidence = { direction: "debit" };
    for (const k of KEYS) {
      const v = obj[k];
      if (k === "amount" ? typeof v === "number" : typeof v === "string") (ev as Record<string, unknown>)[k] = v;
    }
    return ev;
  } catch {
    return null;
  }
}
