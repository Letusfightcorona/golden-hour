"use client";

import { useEffect, useRef, useState } from "react";
import knowledge from "@/data/knowledge.json";
import type { Evidence } from "@/lib/extract";
import { callScript1930, type Lang } from "@/lib/script";
import { deadlines, formatDate, todayIso } from "@/lib/deadlines";
import { bankLetterPdf, emptyVictim, ombudsmanDraft, type Victim } from "@/lib/letter";

const T = {
  en: {
    readAloud: "Read aloud",
    open: "Open",
    copy: "Copy",
    copied: "Copied",
    yourDetails: "Your details (stay on this phone)",
    name: "Full name",
    mobile: "Mobile",
    email: "Email",
    address: "Address",
    packTitle: "Copy these into the portal",
    whatHappened: "What happened",
    f_bank: "Bank / wallet",
    f_acct: "Account no. (last digits)",
    f_utr: "Transaction ID / UTR",
    f_amount: "Amount (Rs.)",
    f_date: "Date (DD/MM/YYYY)",
    f_time: "Time",
    f_to: "Money went to (UPI ID / account)",
    f_suspect: "Suspect mobile",
    download: "Download bank letter (PDF)",
    letterHint: "Print or email it to your branch and to the bank's grievance email. Ask for a complaint number.",
    ackLabel: "cybercrime.gov.in acknowledgement no.",
    bankRefLabel: "Bank complaint reference no.",
    bankDateLabel: "Date you reported to the bank",
    timeline: "Your deadlines",
    overdue: "passed",
    escalation: "Draft for the RBI Ombudsman (cms.rbi.org.in)",
    holidays: "Working days skip weekends only; bank holidays can move these later.",
  },
  hi: {
    readAloud: "पढ़कर सुनाएँ",
    open: "खोलें",
    copy: "कॉपी",
    copied: "कॉपी हुआ",
    yourDetails: "आपकी जानकारी (सिर्फ इसी फ़ोन पर रहती है)",
    name: "पूरा नाम",
    mobile: "मोबाइल",
    email: "ईमेल",
    address: "पता",
    packTitle: "इन्हें पोर्टल में कॉपी करें",
    whatHappened: "क्या हुआ (अंग्रेज़ी में, पोर्टल के लिए)",
    f_bank: "बैंक / वॉलेट",
    f_acct: "अकाउंट नंबर (आखिरी अंक)",
    f_utr: "ट्रांज़ैक्शन ID / UTR",
    f_amount: "राशि (Rs.)",
    f_date: "तारीख (DD/MM/YYYY)",
    f_time: "समय",
    f_to: "पैसा कहाँ गया (UPI ID / अकाउंट)",
    f_suspect: "धोखेबाज़ का मोबाइल",
    download: "बैंक पत्र डाउनलोड करें (PDF)",
    letterHint: "इसे प्रिंट करके ब्रांच में दें या बैंक के शिकायत ईमेल पर भेजें। शिकायत नंबर ज़रूर लें।",
    ackLabel: "cybercrime.gov.in acknowledgement नंबर",
    bankRefLabel: "बैंक शिकायत नंबर",
    bankDateLabel: "बैंक को रिपोर्ट करने की तारीख",
    timeline: "आपकी समय-सीमाएँ",
    overdue: "निकल गई",
    escalation: "RBI लोकपाल (cms.rbi.org.in) के लिए ड्राफ़्ट",
    holidays: "वर्किंग डे में सिर्फ शनिवार-रविवार छोड़े गए हैं; बैंक छुट्टियों से तारीख आगे खिसक सकती है।",
  },
} as const;

type Case = Victim & { bank_ref: string; bank_report_date: string; utr?: string };

const STORE = "golden-hour-case";

// Personal details carry over between cases; complaint numbers and dates reset when the transaction changes.
function useCase(utr?: string): [Case, (patch: Partial<Case>) => void] {
  const [c, setC] = useState<Case>({ ...emptyVictim, bank_ref: "", bank_report_date: todayIso() });
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (!saved) return;
      const stored: Case = JSON.parse(saved);
      const sameCase = !stored.utr || !utr || stored.utr === utr;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      setC((prev) => ({
        ...prev,
        ...stored,
        ...(sameCase ? {} : { ncrp_ack: "", bank_ref: "", bank_report_date: todayIso() }),
        utr,
      }));
    } catch {}
  }, [utr]);
  const update = (patch: Partial<Case>) =>
    setC((prev) => {
      const next = { ...prev, ...patch, utr };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [c, update];
}

function speak(lines: string[], lang: Lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(lines.join(" "));
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// navigator.clipboard needs HTTPS and permission; fall back to the old selection trick (in-app browsers, http).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, lang }: { text: string; lang: Lang }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className="shrink-0 rounded-md border border-amber-600 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
    >
      {done ? T[lang].copied : T[lang].copy}
    </button>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-stone-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-stone-900"
      />
    </label>
  );
}

function incidentSummary(ev: Evidence): string {
  return [
    `I was cheated in an online fraud. ${ev.amount ? `Rs. ${ev.amount.toLocaleString("en-IN")}` : "Money"} was debited from my ${ev.bank ?? ""} account ending ${ev.account_last4 ?? "____"}`,
    ev.date ? ` on ${formatDate(ev.date, "en")}${ev.time ? ` at ${ev.time}` : ""}` : "",
    ev.utr ? ` (UTR ${ev.utr})` : "",
    ev.upi_id || ev.payee ? ` to ${[ev.upi_id, ev.payee].filter(Boolean).join(" / ")}` : "",
    ". ",
    ev.scammer_phone ? `The fraudster contacted me from ${ev.scammer_phone}. ` : "",
    "I did not receive anything in return and request action to freeze the money and recover it.",
  ].join("");
}

function FilingPack({ ev, c, update, lang }: { ev: Evidence; c: Case; update: (p: Partial<Case>) => void; lang: Lang }) {
  const t = T[lang];
  const rows: [string, string | undefined][] = [
    [t.name, c.name],
    [t.mobile, c.mobile],
    [t.email, c.email],
    [t.f_bank, ev.bank],
    [t.f_acct, ev.account_last4],
    [t.f_utr, ev.utr],
    [t.f_amount, ev.amount?.toString()],
    [t.f_date, ev.date?.split("-").reverse().join("/")],
    [t.f_time, ev.time],
    [t.f_to, ev.upi_id ?? ev.payee],
    [t.f_suspect, ev.scammer_phone],
    [t.whatHappened, incidentSummary(ev)],
  ];
  return (
    <div className="mt-3 space-y-3">
      <details className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950" open>
        <summary className="cursor-pointer text-sm font-medium">{t.yourDetails}</summary>
        <div className="mt-2 grid gap-2">
          <Field label={t.name} value={c.name} onChange={(name) => update({ name })} />
          <Field label={t.mobile} value={c.mobile} onChange={(mobile) => update({ mobile })} type="tel" />
          <Field label={t.email} value={c.email} onChange={(email) => update({ email })} type="email" />
          <Field label={t.address} value={c.address} onChange={(address) => update({ address })} />
        </div>
      </details>
      <div>
        <p className="mb-1 text-sm font-medium">{t.packTitle}</p>
        <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <li key={k} className="flex items-start justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="text-xs text-stone-500">{k}</div>
                  <div className="break-words font-mono text-stone-900 dark:text-stone-100">{v}</div>
                </div>
                <CopyButton text={v!} lang={lang} />
              </li>
            ))}
        </ul>
      </div>
      <Field label={t.ackLabel} value={c.ncrp_ack} onChange={(ncrp_ack) => update({ ncrp_ack })} />
    </div>
  );
}

function BankLetter({ ev, c, lang }: { ev: Evidence; c: Case; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const bytes = await bankLetterPdf(ev, c);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `bank-fraud-letter-${ev.utr ?? "draft"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3">
      <button onClick={download} disabled={busy} className="w-full rounded-lg bg-amber-600 py-2 font-medium text-white disabled:opacity-50">
        📄 {T[lang].download}
      </button>
      <p className="mt-2 text-xs text-stone-500">{T[lang].letterHint}</p>
    </div>
  );
}

function Tracker({ ev, c, update, lang }: { ev: Evidence; c: Case; update: (p: Partial<Case>) => void; lang: Lang }) {
  const t = T[lang];
  const list = deadlines({ transaction: ev.date, bank_report: c.bank_report_date || undefined });
  const draft = ombudsmanDraft(ev, c, c.bank_ref, c.bank_report_date);
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2">
        <Field label={t.bankRefLabel} value={c.bank_ref} onChange={(bank_ref) => update({ bank_ref })} />
        <Field label={t.bankDateLabel} value={c.bank_report_date} onChange={(bank_report_date) => update({ bank_report_date })} type="date" />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">{t.timeline}</p>
        <ol className="space-y-1.5 border-l-2 border-amber-200 pl-3 text-sm dark:border-amber-900">
          {list.map((d) => (
            <li key={d.id} className={d.overdue ? "text-stone-400 line-through" : ""}>
              <span className="font-mono">{formatDate(d.due, lang)}</span> · {d.label[lang]}
              {d.overdue && <span className="ml-1 no-underline">({t.overdue})</span>}
            </li>
          ))}
        </ol>
        <p className="mt-1 text-xs text-stone-500">{t.holidays}</p>
      </div>
      <details className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950">
        <summary className="cursor-pointer text-sm font-medium">{t.escalation}</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{draft}</pre>
        <div className="mt-2 flex justify-end">
          <CopyButton text={draft} lang={lang} />
        </div>
      </details>
    </div>
  );
}

export default function Steps({ evidence, lang }: { evidence: Evidence; lang: Lang }) {
  const script = callScript1930(evidence, lang);
  const [c, update] = useCase(evidence.utr);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const t = T[lang];

  return (
    <div ref={top} className="scroll-mt-4 space-y-3">
      {knowledge.steps.map((s) => (
        <div key={s.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-baseline gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-semibold text-white">{s.order}</span>
            <h2 className="font-semibold">{s.title[lang]}</h2>
          </div>
          {"only_if" in s && s.only_if && <p className="mt-1 text-xs text-stone-500">{s.only_if[lang]}</p>}
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">{s.why[lang]}</p>

          {s.id === "call_1930" && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
              <ol className="space-y-1 text-lg leading-snug">
                {script.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
              <div className="mt-3 flex gap-2">
                <a href="tel:1930" className="flex-1 rounded-lg bg-red-600 py-2 text-center font-semibold text-white">📞 1930</a>
                <button onClick={() => speak(script, lang)} className="flex-1 rounded-lg border border-amber-600 py-2 text-amber-700 dark:text-amber-400">
                  {t.readAloud}
                </button>
              </div>
            </div>
          )}

          {s.id === "file_ncrp" && <FilingPack ev={evidence} c={c} update={update} lang={lang} />}
          {s.id === "bank_letter" && <BankLetter ev={evidence} c={c} lang={lang} />}
          {s.id === "escalate_rbi" && <Tracker ev={evidence} c={c} update={update} lang={lang} />}

          {"url" in s && s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-amber-700 underline dark:text-amber-400">
              {t.open} {s.url.replace("https://", "")} ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
