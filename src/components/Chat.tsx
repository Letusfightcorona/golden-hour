"use client";

import { useEffect, useRef, useState } from "react";
import knowledge from "@/data/knowledge.json";
import samples from "@/data/sample-sms.json";
import { extractEvidence, type Evidence } from "@/lib/extract";
import { callScript1930, type Lang } from "@/lib/script";
import type { BrainResult, ChatTurn } from "@/lib/brain";

type Msg =
  | { from: "bot" | "user"; kind: "text"; text: string; imageUrl?: string }
  | { from: "bot"; kind: "evidence"; evidence: Evidence }
  | { from: "bot"; kind: "steps"; evidence: Evidence };

const UI = {
  en: {
    placeholder: "Type what happened, or paste your bank SMS…",
    send: "Send",
    sample: "Try a sample SMS",
    askSms: "When you are ready, paste the SMS your bank sent about the payment. I'll pull out the details for you.",
    noDebit: "I couldn't find a payment in that. Could you paste the bank or UPI SMS that shows money going out?",
    cardTitle: "Here's what I found. Is this right?",
    confirm: "Yes, this is right",
    stepsIntro: "Thank you. Here is what to do, in this order. Start with step 1 right away.",
    readAloud: "Read aloud",
    open: "Open",
    attach: "Add screenshot",
    thinking: "Reading…",
    offline: "Offline mode: paste the bank SMS",
  },
  hi: {
    placeholder: "बताइए क्या हुआ, या बैंक का SMS यहाँ paste करें…",
    send: "भेजें",
    sample: "सैंपल SMS आज़माएँ",
    askSms: "जब आप तैयार हों, बैंक का वह SMS यहाँ paste करें जिसमें पैसा कटने की बात है। बाकी जानकारी मैं निकाल दूँगा।",
    noDebit: "इसमें कोई पेमेंट नहीं मिला। क्या आप बैंक या UPI का वह SMS paste कर सकते हैं जिसमें पैसा कटा है?",
    cardTitle: "मुझे यह जानकारी मिली। क्या यह सही है?",
    confirm: "हाँ, सही है",
    stepsIntro: "धन्यवाद। अब इसी क्रम में करें। पहला कदम अभी तुरंत।",
    readAloud: "पढ़कर सुनाएँ",
    open: "खोलें",
    attach: "स्क्रीनशॉट जोड़ें",
    thinking: "पढ़ रहा हूँ…",
    offline: "ऑफ़लाइन मोड: बैंक का SMS paste करें",
  },
} as const;

const FIELDS: { key: keyof Evidence; en: string; hi: string }[] = [
  { key: "amount", en: "Amount (₹)", hi: "राशि (₹)" },
  { key: "utr", en: "Transaction ID / UTR", hi: "ट्रांज़ैक्शन ID / UTR" },
  { key: "date", en: "Date", hi: "तारीख" },
  { key: "time", en: "Time", hi: "समय" },
  { key: "bank", en: "Your bank", hi: "आपका बैंक" },
  { key: "account_last4", en: "Account last digits", hi: "अकाउंट के आखिरी अंक" },
  { key: "upi_id", en: "Money went to (UPI ID)", hi: "पैसा गया (UPI ID)" },
  { key: "payee", en: "Receiver name", hi: "पाने वाले का नाम" },
  { key: "scammer_phone", en: "Scammer's phone", hi: "धोखेबाज़ का फ़ोन" },
];

function greeting(lang: Lang): Msg[] {
  return [...knowledge.comfort[lang], UI[lang].askSms].map((text) => ({ from: "bot", kind: "text", text }));
}

function speak(lines: string[], lang: Lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(lines.join(" "));
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function Chat() {
  const [lang, setLang] = useState<Lang>("hi");
  const [msgs, setMsgs] = useState<Msg[]>(() => greeting("hi"));
  const [input, setInput] = useState("");
  const [lastScam, setLastScam] = useState<Evidence | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const shownCard = useRef<string>("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const t = UI[lang];

  useEffect(() => {
    if (msgs.at(-1)?.kind !== "steps") bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  function reset(next: Lang) {
    setLang(next);
    setMsgs(greeting(next));
    setLastScam(null);
    setTurns([]);
    setConfirmed(false);
    shownCard.current = "";
  }

  // Day 1 flow, used when Claude isn't reachable: regex only.
  function localReply(text: string): Msg[] {
    const ev = extractEvidence(text);
    if (ev.direction === "debit") {
      if (lastScam?.scammer_phone) ev.scammer_phone = lastScam.scammer_phone;
      return [{ from: "bot", kind: "evidence", evidence: ev }];
    }
    if (ev.scammer_phone) setLastScam(ev);
    return [{ from: "bot", kind: "text", text: t.noDebit }];
  }

  async function send(text: string, image?: { turn: NonNullable<ChatTurn["image"]>; url: string }) {
    if (!text.trim() && !image) return;
    setMsgs((m) => [...m, { from: "user", kind: "text", text, imageUrl: image?.url }]);
    setInput("");

    const nextTurns: ChatTurn[] = [...turns, { role: "user", text, image: image?.turn }];
    setTurns(nextTurns);

    if (offline) {
      setMsgs((m) => [...m, ...localReply(text)]);
      return;
    }

    setBusy(true);
    try {
      // Keep only the latest screenshot in history; older ones already fed the evidence.
      const payload = nextTurns.map((turn, i) => (i === nextTurns.length - 1 ? turn : { ...turn, image: undefined }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: payload }),
      });
      const data = (await res.json()) as BrainResult | { offline: true };
      if ("offline" in data) {
        setOffline(true);
        setMsgs((m) => [...m, ...localReply(text)]);
        return;
      }
      setLang(data.language);
      setTurns((prev) => [...prev, { role: "assistant", text: data.reply }]);
      const out: Msg[] = [{ from: "bot", kind: "text", text: data.reply }];
      const key = JSON.stringify(data.evidence);
      if (data.has_transaction && !confirmed && key !== shownCard.current) {
        shownCard.current = key;
        out.push({ from: "bot", kind: "evidence", evidence: data.evidence });
      }
      setMsgs((m) => [...m, ...out]);
    } catch {
      setOffline(true);
      setMsgs((m) => [...m, ...localReply(text)]);
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File) {
    const img = await shrink(file);
    send(input, img);
  }

  function confirm(evidence: Evidence) {
    setConfirmed(true);
    setMsgs((m) => [
      ...m,
      { from: "user", kind: "text", text: t.confirm },
      { from: "bot", kind: "text", text: t.stepsIntro },
      { from: "bot", kind: "steps", evidence },
    ]);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-stone-50 dark:bg-stone-950">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div>
          <h1 className="text-lg font-semibold text-amber-700 dark:text-amber-400">Golden Hour</h1>
          <p className="text-xs text-stone-500">{lang === "hi" ? "धोखाधड़ी के बाद, हर कदम आपके साथ" : "After a scam, every step with you"}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-stone-100 p-1 text-sm dark:bg-stone-800">
          {(["hi", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => reset(l)}
              className={`rounded-full px-3 py-1 ${lang === l ? "bg-amber-600 text-white" : "text-stone-600 dark:text-stone-300"}`}
            >
              {l === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m, i) => (
          <MessageView key={i} msg={m} lang={lang} onConfirm={confirm} />
        ))}
        {busy && <Bubble from="bot"><span className="animate-pulse text-stone-500">{t.thinking}</span></Bubble>}
        <div ref={bottom} />
      </main>

      <footer className="border-t border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-2 flex items-center justify-between text-xs">
          <button onClick={() => setInput(samples.samples[0].text)} className="text-amber-700 underline dark:text-amber-400">
            {t.sample}
          </button>
          {offline && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">{t.offline}</span>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attach(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || offline}
            aria-label={t.attach}
            title={t.attach}
            className="rounded-xl border border-stone-300 px-3 text-xl disabled:opacity-40 dark:border-stone-700"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-base outline-none focus:border-amber-600 dark:border-stone-700 dark:bg-stone-950"
          />
          <button type="submit" disabled={busy} className="rounded-xl bg-amber-600 px-4 font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {t.send}
          </button>
        </form>
      </footer>
    </div>
  );
}

function Bubble({ from, children }: { from: "bot" | "user"; children: React.ReactNode }) {
  return (
    <div className={`flex ${from === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-[15px] leading-relaxed ${
          from === "user" ? "bg-amber-600 text-white" : "bg-white text-stone-800 shadow-sm dark:bg-stone-900 dark:text-stone-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function MessageView({ msg, lang, onConfirm }: { msg: Msg; lang: Lang; onConfirm: (e: Evidence) => void }) {
  if (msg.kind === "text")
    return (
      <Bubble from={msg.from}>
        {msg.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={msg.imageUrl} alt="" className="mb-1 max-h-48 rounded-lg" />
        )}
        {msg.text}
      </Bubble>
    );
  if (msg.kind === "evidence") return <EvidenceCard initial={msg.evidence} lang={lang} onConfirm={onConfirm} />;
  return <Steps evidence={msg.evidence} lang={lang} />;
}

function EvidenceCard({ initial, lang, onConfirm }: { initial: Evidence; lang: Lang; onConfirm: (e: Evidence) => void }) {
  const [ev, setEv] = useState<Evidence>(initial);
  const [done, setDone] = useState(false);
  return (
    <Bubble from="bot">
      <p className="mb-2 font-medium">{UI[lang].cardTitle}</p>
      <div className="space-y-1.5">
        {FIELDS.filter((f) => ev[f.key] !== undefined || ["amount", "utr", "date", "bank"].includes(f.key)).map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-stone-500">{f[lang]}</span>
            <input
              disabled={done}
              value={String(ev[f.key] ?? "")}
              onChange={(e) =>
                setEv({ ...ev, [f.key]: f.key === "amount" ? Number(e.target.value.replace(/[^\d.]/g, "")) : e.target.value })
              }
              className="w-44 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-right font-mono text-stone-900 disabled:opacity-70 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
        ))}
      </div>
      {!done && (
        <button
          onClick={() => {
            setDone(true);
            onConfirm(ev);
          }}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700"
        >
          {UI[lang].confirm}
        </button>
      )}
    </Bubble>
  );
}

function Steps({ evidence, lang }: { evidence: Evidence; lang: Lang }) {
  const script = callScript1930(evidence, lang);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
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
                  {UI[lang].readAloud}
                </button>
              </div>
            </div>
          )}

          {"prep_list" in s && s.prep_list && (
            <ul className="mt-2 list-disc pl-5 text-sm text-stone-600 dark:text-stone-400">
              {s.prep_list[lang].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          {"url" in s && s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-amber-700 underline dark:text-amber-400">
              {UI[lang].open} {s.url.replace("https://", "")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// Downscale screenshots before upload: keeps requests small and fast on mobile data.
async function shrink(file: File): Promise<{ turn: NonNullable<ChatTurn["image"]>; url: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { turn: { media_type: "image/jpeg", data: url.split(",")[1] }, url };
}
