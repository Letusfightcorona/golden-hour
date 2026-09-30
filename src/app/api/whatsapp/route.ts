// Twilio WhatsApp Sandbox webhook. Point the sandbox's "When a message comes in" URL at
// https://<your-site>/api/whatsapp (POST). Same brain as the website; regex fallback when offline.
import { createHmac, timingSafeEqual } from "node:crypto";
import { brainAvailable, think, type ChatTurn } from "@/lib/brain";
import { extractEvidence, type Evidence } from "@/lib/extract";
import { callScript1930, type Lang } from "@/lib/script";
import { encodeCase } from "@/lib/caselink";

// Conversations live in memory: fine for a demo on one server, lost on restart or across serverless instances.
type Session = { turns: ChatTurn[]; lang: Lang; sentSteps: string };
const sessions = new Map<string, Session>();

const RESET = /^(reset|restart|new|naya|नया)$/i;

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function twiml(messages: string[]): Response {
  const body = messages.map((m) => `<Message>${escapeXml(m.slice(0, 1550))}</Message>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

// https://www.twilio.com/docs/usage/security#validating-requests
function validSignature(url: string, params: URLSearchParams, signature: string | null, token: string): boolean {
  if (!signature) return false;
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function fetchImage(url: string, contentType: string | null): Promise<ChatTurn["image"]> {
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
  const type = allowed.find((t) => t === contentType);
  if (!type) return undefined;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const res = await fetch(url, sid && token ? { headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` } } : undefined);
  if (!res.ok) return undefined;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 4_500_000) return undefined;
  return { media_type: type, data: buf.toString("base64") };
}

function stepsMessage(ev: Evidence, lang: Lang, siteUrl: string): string[] {
  const script = callScript1930(ev, lang).join("\n");
  const link = `${siteUrl}/?case=${encodeCase(ev)}`;
  return lang === "hi"
    ? [
        `*कदम 1: अभी 1930 पर कॉल करें* और यह पढ़ें:\n\n${script}`,
        `*कदम 2-5:* cybercrime.gov.in पर शिकायत, बैंक पत्र (PDF) और आपकी समय-सीमाएँ, सब यहाँ तैयार हैं:\n${link}`,
      ]
    : [
        `*Step 1: Call 1930 now* and read this out:\n\n${script}`,
        `*Steps 2-5:* your cybercrime.gov.in filing pack, bank letter (PDF) and deadlines are ready here:\n${link}`,
      ];
}

export async function POST(request: Request) {
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const siteUrl = (process.env.PUBLIC_URL ?? new URL(request.url).origin).replace(/\/$/, "");

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token && !validSignature(`${siteUrl}/api/whatsapp`, params, request.headers.get("x-twilio-signature"), token)) {
    return new Response("invalid signature", { status: 403 });
  }

  const from = params.get("From") ?? "unknown";
  const text = (params.get("Body") ?? "").trim();
  const numMedia = Number(params.get("NumMedia") ?? 0);

  if (RESET.test(text)) {
    sessions.delete(from);
    return twiml(["Theek hai, naye sire se shuru karte hain. Kya hua? / OK, let's start again. What happened?"]);
  }

  const session = sessions.get(from) ?? { turns: [], lang: "hi", sentSteps: "" };
  sessions.set(from, session);

  const image = numMedia > 0 ? await fetchImage(params.get("MediaUrl0")!, params.get("MediaContentType0")) : undefined;
  session.turns.push({ role: "user", text, image });
  // Only the newest screenshot is re-sent; older ones already fed the evidence.
  session.turns = session.turns.slice(-20).map((t, i, all) => (i === all.length - 1 ? t : { ...t, image: undefined }));

  let reply: string;
  let evidence: Evidence | null = null;
  try {
    if (!brainAvailable()) throw new Error("offline");
    const out = await think(session.turns, { timeoutMs: 12000 }); // Twilio gives up after 15s
    session.lang = out.language;
    reply = out.reply;
    if (out.has_transaction) evidence = out.evidence;
  } catch {
    const ev = extractEvidence(text);
    if (ev.direction === "debit") {
      evidence = ev;
      reply = session.lang === "hi" ? "Yeh aapki galti nahi hai. Maine aapke SMS se details nikal li hain." : "This is not your fault. I've taken the details from your SMS.";
    } else {
      reply =
        session.lang === "hi"
          ? "Yeh aapki galti nahi hai. Hum saath mein abhi paisa rokne ki koshish karte hain. Bank ka woh SMS yahan paste kijiye jisme paisa katne ki baat hai."
          : "This is not your fault. Let's try to stop the money right now. Please paste the bank SMS about the debit here.";
    }
  }
  session.turns.push({ role: "assistant", text: reply });

  const messages = [reply];
  const key = evidence ? JSON.stringify(evidence) : "";
  if (evidence && key !== session.sentSteps) {
    session.sentSteps = key;
    messages.push(...stepsMessage(evidence, session.lang, siteUrl));
  }
  return twiml(messages);
}
