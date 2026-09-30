// Deterministic evidence extraction from Indian bank / UPI SMS.
// The LLM extractor (Day 2) is checked against this; it also runs offline for the demo fallback.

export type Direction = "debit" | "credit" | "none";

export type Evidence = {
  amount?: number;
  utr?: string;
  account_last4?: string;
  bank?: string;
  direction: Direction;
  upi_id?: string;
  payee?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  scammer_phone?: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const BANKS: [RegExp, string][] = [
  [/\bSBI\b|State Bank/i, "SBI"],
  [/\bHDFC\b/i, "HDFC Bank"],
  [/\bICICI\b/i, "ICICI Bank"],
  [/\bAxis\b/i, "Axis Bank"],
  [/\bKotak\b/i, "Kotak"],
  [/\bPNB\b|Punjab National/i, "PNB"],
  [/\bBOB\b|Bank of Baroda/i, "Bank of Baroda"],
  [/\bCanara\b/i, "Canara Bank"],
  [/Union Bank/i, "Union Bank of India"],
  [/\bYes Bank\b/i, "Yes Bank"],
  [/\bIDFC\b/i, "IDFC FIRST Bank"],
  [/\bPaytm\b/i, "Paytm"],
  [/\bPhonePe\b/i, "PhonePe"],
  [/Google Pay|\bGPay\b/i, "Google Pay"],
];

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findDate(text: string): string | undefined {
  let m = text.match(/(?<!\d)(\d{4})[:\-/](\d{2})[:\-/](\d{2})(?!\d)/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(/(?<!\d)(\d{1,2})[-/ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ]?(\d{4}|\d{2})(?!\d)/i);
  if (m) return iso(fullYear(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));

  m = text.match(/(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?!\d)/);
  if (m) return iso(fullYear(m[3]), Number(m[2]), Number(m[1]));

  return undefined;
}

function findAmount(text: string): number | undefined {
  const m =
    text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ??
    text.match(/(?:debited|sent|paid|spent)\s*(?:by|for|of)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return m ? toNumber(m[1]) : undefined;
}

function findUtr(text: string): string | undefined {
  const m =
    text.match(/(?:ref(?:\s*no)?|refno|utr|rrn|upi)[\s.:/\-\w]*?(?<!\d)(?!91[6-9])(\d{12})(?!\d)/i) ??
    text.match(/(?<![\d+])(?!91[6-9])(\d{12})(?!\d)/);
  return m?.[1];
}

export function extractEvidence(text: string): Evidence {
  const direction: Direction = /debited|\bdr\b|\bsent\b|\bpaid\b|\bspent\b|trf to/i.test(text)
    ? "debit"
    : /credited to your|\breceived\b/i.test(text)
      ? "credit"
      : "none";

  const ev: Evidence = { direction };

  if (direction !== "none") {
    ev.amount = findAmount(text);
    ev.utr = findUtr(text);
    ev.account_last4 = text.match(/(?:a\/c|acct|\bac\b|account|card)(?:\s*no\.?)?\s*(?:ending\s*)?[x*]*(\d{3,4})\b/i)?.[1];
    ev.upi_id = text.match(/\b([a-z0-9.\-_]{2,}@[a-z]{2,})(?!\w|\.\w)/i)?.[1];
    ev.payee = text.match(/(?:trf to|[Tt]o)\s+([A-Z][A-Za-z .]+?)\s+(?:Ref\w*|from|on)\b/)?.[1];
  } else {
    // Not a bank alert: likely the scam message itself, so any mobile number is the scammer's.
    ev.scammer_phone = text.match(/(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)/)?.[1];
  }

  ev.bank = BANKS.find(([re]) => re.test(text))?.[1];
  ev.date = findDate(text);
  const t = text.match(/(?<![\d:])(\d{1,2}):(\d{2})(?::\d{2})?(?![\d:]\d)/);
  if (t) ev.time = `${t[1].padStart(2, "0")}:${t[2]}`;

  return ev;
}
