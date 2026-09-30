import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Evidence } from "./extract";
import { formatDate, todayIso } from "./deadlines";

export type Victim = { name: string; mobile: string; email: string; address: string; ncrp_ack: string };

export const emptyVictim: Victim = { name: "", mobile: "", email: "", address: "", ncrp_ack: "" };

const blank = "________";

function rupees(n?: number) {
  return n === undefined ? blank : `Rs. ${n.toLocaleString("en-IN")}`;
}

export function bankLetterText(ev: Evidence, v: Victim): { subject: string; body: string[] } {
  const when = [ev.date ? formatDate(ev.date, "en") : blank, ev.time].filter(Boolean).join(", ");
  return {
    subject: `Report of fraudulent transaction and request to block, dispute and reverse: ${rupees(ev.amount)}, UTR ${ev.utr ?? blank}`,
    body: [
      "Dear Sir/Madam,",
      `I am writing to report a fraudulent transaction on my account with ${ev.bank ?? "your bank"} (account ending ${ev.account_last4 ?? blank}). I was deceived by a fraudster and I am reporting this at the earliest.`,
      `Transaction details:\n- Amount: ${rupees(ev.amount)}\n- Date and time: ${when}\n- UTR / reference number: ${ev.utr ?? blank}\n- Beneficiary: ${[ev.upi_id, ev.payee].filter(Boolean).join(" / ") || blank}`,
      v.ncrp_ack
        ? `I have reported this on the National Cyber Crime Reporting Portal (cybercrime.gov.in) / 1930 helpline. Acknowledgement number: ${v.ncrp_ack}.`
        : "I have reported / am reporting this on the National Cyber Crime Reporting Portal (cybercrime.gov.in) and the 1930 helpline, and will share the acknowledgement number.",
      "I request you to:\n1. Immediately block my debit card, UPI and net banking access to prevent further loss.\n2. Register this as a fraud dispute and share the complaint reference number with me.\n3. Contact the beneficiary bank to place a lien / hold on the amount.\n4. Credit the amount back to my account as per the RBI circular on limiting customer liability in unauthorised electronic banking transactions (6 July 2017), which requires the bank to credit the amount (shadow reversal) within 10 working days of notification.",
      "Please acknowledge receipt of this letter with the date and time of my report.",
      "Yours faithfully,",
    ],
  };
}

export async function bankLetterPdf(ev: Evidence, v: Victim): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); // A4
  const margin = 56;
  const width = 595 - margin * 2;
  let y = 842 - margin;

  // Standard PDF fonts only cover Latin-1, so non-Latin characters (e.g. a name typed in Devanagari) become "?".
  const line = (raw: string, f = font, size = 11, gap = 4) => {
    const text = raw.replace(/[^\x20-\x7E\n]/g, "?");
    for (const para of text.split("\n")) {
      const words = para.split(" ");
      let cur = "";
      const flush = () => {
        if (y < margin + size) {
          page = pdf.addPage([595, 842]);
          y = 842 - margin;
        }
        page.drawText(cur, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
        y -= size + gap;
        cur = "";
      };
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > width && cur) {
          flush();
          cur = w;
        } else cur = next;
      }
      flush();
    }
  };
  const space = (n = 10) => (y -= n);

  const { subject, body } = bankLetterText(ev, v);
  line(`Date: ${formatDate(todayIso(), "en")}`);
  space();
  line("To,");
  line("The Branch Manager / Nodal Officer (Customer Grievances)");
  line(ev.bank ?? blank);
  space();
  line(`Subject: ${subject}`, bold);
  space();
  for (const p of body) {
    line(p);
    space(6);
  }
  space(24);
  line(v.name || blank, bold);
  line(`Mobile: ${v.mobile || blank}`);
  if (v.email) line(`Email: ${v.email}`);
  if (v.address) line(`Address: ${v.address}`);
  space();
  line("Enclosures: bank SMS / statement showing the transaction, screenshots of the fraud, cybercrime complaint acknowledgement.", font, 9);

  return pdf.save();
}

export function ombudsmanDraft(ev: Evidence, v: Victim, bankRef: string, bankReportDate: string): string {
  return [
    `Complaint against: ${ev.bank ?? blank}`,
    `Category: Unauthorised / fraudulent electronic transaction`,
    "",
    `On ${ev.date ? formatDate(ev.date, "en") : blank}, ${rupees(ev.amount)} was debited from my account ending ${ev.account_last4 ?? blank} in a fraudulent transaction (UTR ${ev.utr ?? blank}).`,
    `I reported it to the bank in writing on ${bankReportDate ? formatDate(bankReportDate, "en") : blank} (bank complaint reference: ${bankRef || blank}) and to the National Cyber Crime Reporting Portal (acknowledgement: ${v.ncrp_ack || blank}).`,
    "The bank has not resolved my complaint within 30 days / I am not satisfied with the bank's reply.",
    "",
    "Relief sought: credit of the disputed amount as per the RBI circular on limiting customer liability in unauthorised electronic banking transactions (6 July 2017), and compensation for loss of time and harassment.",
    "",
    `${v.name || blank}, ${v.mobile || blank}`,
  ].join("\n");
}
