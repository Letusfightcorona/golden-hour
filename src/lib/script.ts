import type { Evidence } from "./extract";
import { formatDate } from "./deadlines";

export type Lang = "en" | "hi";

function rupees(n?: number): string {
  return n === undefined ? "—" : `₹${n.toLocaleString("en-IN")}`;
}

// What the victim reads out on the 1930 call. Missing fields are left as blanks to fill.
export function callScript1930(ev: Evidence, lang: Lang): string[] {
  const blank = "____";
  const when = [ev.date ? formatDate(ev.date, lang) : undefined, ev.time].filter(Boolean).join(", ") || blank;
  if (lang === "hi") {
    return [
      "नमस्ते, मेरे साथ ऑनलाइन धोखाधड़ी हुई है। मैं शिकायत दर्ज करना चाहता/चाहती हूँ।",
      `मेरे ${ev.bank ?? blank} अकाउंट (आखिरी अंक ${ev.account_last4 ?? blank}) से ${rupees(ev.amount)} कटे हैं।`,
      `तारीख और समय: ${when}`,
      `ट्रांज़ैक्शन ID / UTR: ${ev.utr ?? blank}`,
      `पैसा यहाँ गया: ${ev.upi_id ?? ev.payee ?? blank}`,
      ev.scammer_phone ? `धोखेबाज़ का नंबर: ${ev.scammer_phone}` : "",
      "कृपया इस पैसे को रोकने (hold) की कार्रवाई करें और मुझे शिकायत नंबर दें।",
    ].filter(Boolean);
  }
  return [
    "Hello, I have been the victim of an online fraud and want to report it.",
    `${rupees(ev.amount)} was debited from my ${ev.bank ?? blank} account ending ${ev.account_last4 ?? blank}.`,
    `Date and time: ${when}`,
    `Transaction ID / UTR: ${ev.utr ?? blank}`,
    `Money went to: ${ev.upi_id ?? ev.payee ?? blank}`,
    ev.scammer_phone ? `Scammer's number: ${ev.scammer_phone}` : "",
    "Please put a hold on this money and give me a complaint number.",
  ].filter(Boolean);
}
