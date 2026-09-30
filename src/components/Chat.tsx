"use client";

import { useEffect, useRef, useState } from "react";
import knowledge from "@/data/knowledge.json";
import samples from "@/data/sample-sms.json";
import { extractEvidence, type Evidence } from "@/lib/extract";
import type { Lang } from "@/lib/script";
import Steps from "./Steps";
import { decodeCase } from "@/lib/caselink";
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
    firstReply: "I understand, this is frightening. We'll try to stop the money together, right now. Please paste the bank or UPI SMS that shows the money going out.",
    gotPhone: "I've noted the scammer's number. Now please paste the bank or UPI SMS that shows the money going out.",
    cardTitle: "Here's what I found. Is this right?",
    confirm: "Yes, this is right",
    stepsIntro: "Thank you. Here is what to do, in this order. Start with step 1 right away.",
    readAloud: "Read aloud",
    open: "Open",
    attach: "Add screenshot",
    thinking: "Reading…",
    offline: "Offline mode: paste the bank SMS",
    noScreenshots: "Reading screenshots needs the online mode, which isn't available right now. Please copy the text of the bank SMS and paste it here instead.",
  },
  hi: {
    placeholder: "बताइए क्या हुआ, या बैंक का SMS यहाँ paste करें…",
    send: "भेजें",
    sample: "सैंपल SMS आज़माएँ",
    askSms: "जब आप तैयार हों, बैंक का वह SMS यहाँ paste करें जिसमें पैसा कटने की बात है। बाकी जानकारी मैं निकाल दूँगा।",
    noDebit: "इसमें कोई पेमेंट नहीं मिला। क्या आप बैंक या UPI का वह SMS paste कर सकते हैं जिसमें पैसा कटा है?",
    firstReply: "मैं समझ सकता हूँ, यह बहुत डराने वाला है। हम साथ मिलकर अभी पैसा रोकने की कोशिश करेंगे। बैंक या UPI का वह SMS यहाँ paste करें जिसमें पैसा कटने की बात है।",
    gotPhone: "मैंने धोखेबाज़ का नंबर नोट कर लिया है। अब बैंक या UPI का वह SMS paste करें जिसमें पैसा कटा है।",
    cardTitle: "मुझे यह जानकारी मिली। क्या यह सही है?",
    confirm: "हाँ, सही है",
    stepsIntro: "धन्यवाद। अब इसी क्रम में करें। पहला कदम अभी तुरंत।",
    readAloud: "पढ़कर सुनाएँ",
    open: "खोलें",
    attach: "स्क्रीनशॉट जोड़ें",
    thinking: "पढ़ रहा हूँ…",
    offline: "ऑफ़लाइन मोड: बैंक का SMS paste करें",
    noScreenshots: "स्क्रीनशॉट पढ़ने के लिए ऑनलाइन मोड चाहिए, जो अभी उपलब्ध नहीं है। कृपया बैंक SMS का टेक्स्ट कॉपी करके यहाँ paste करें।",
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

  // Opened from a WhatsApp link: skip intake and show the evidence card straight away.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("case");
    const ev = param ? decodeCase(param) : null;
    if (!ev) return;
    shownCard.current = JSON.stringify(ev);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after mount
    setMsgs((m) => [...m, { from: "bot", kind: "evidence", evidence: ev }]);
  }, []);

  useEffect(() => {
    if (msgs.at(-1)?.kind !== "steps") bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  function switchLang(next: Lang) {
    if (msgs.some((m) => m.from === "user")) setLang(next);
    else reset(next);
  }

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
    if (ev.scammer_phone) {
      setLastScam(ev);
      return [{ from: "bot", kind: "text", text: t.gotPhone }];
    }
    const firstTime = !msgs.some((m) => m.from === "user");
    return [{ from: "bot", kind: "text", text: firstTime ? t.firstReply : t.noDebit }];
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
              onClick={() => switchLang(l)}
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
            onClick={() => {
              if (offline) setMsgs((m) => [...m, { from: "bot", kind: "text", text: t.noScreenshots }]);
              else fileInput.current?.click();
            }}
            disabled={busy}
            aria-label={t.attach}
            title={t.attach}
            className="rounded-xl border border-stone-300 px-3 text-xl disabled:opacity-40 dark:border-stone-700"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) send(input);
              }
            }}
            placeholder={t.placeholder}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
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
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-stone-500">{f[lang]}</span>
            <input
              disabled={done}
              value={String(ev[f.key] ?? "")}
              onChange={(e) =>
                setEv({ ...ev, [f.key]: parseField(f.key, e.target.value) })
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

function parseField(key: keyof Evidence, raw: string): string | number | undefined {
  if (key === "amount") {
    const digits = raw.replace(/[^\d.]/g, "");
    return digits ? Number(digits) : undefined;
  }
  return raw.trim() ? raw : undefined;
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
