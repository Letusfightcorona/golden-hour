// Server-only: the Claude-powered intake. Understands free text in Hindi/Hinglish/English,
// reads SMS and screenshots, and returns a calm reply plus structured evidence.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import knowledge from "@/data/knowledge.json";
import { extractEvidence, type Evidence } from "./extract";

export const MODEL = "claude-opus-5-5";

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  image?: { media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };
};

const EvidenceSchema = z.object({
  amount: z.number().nullable().describe("Rupees lost in this transaction, as a number"),
  utr: z.string().nullable().describe("UPI/UTR/RRN/reference number exactly as shown, digits only"),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  time: z.string().nullable().describe("HH:MM, 24-hour"),
  bank: z.string().nullable().describe("Victim's bank or payment app"),
  account_last4: z.string().nullable().describe("Last digits of the victim's account or card"),
  upi_id: z.string().nullable().describe("UPI ID the money went to"),
  payee: z.string().nullable().describe("Name of the receiver, if shown"),
  scammer_phone: z.string().nullable().describe("Scammer's phone number, 10 digits"),
});

const ReplySchema = z.object({
  language: z.enum(["hi", "en"]).describe("hi if the victim writes Hindi or Hinglish, else en"),
  reply: z.string().describe("What to say to the victim now, in their language and script"),
  has_transaction: z.boolean().describe("True once at least an amount or a transaction ID is known"),
  evidence: EvidenceSchema,
  scam_type: z
    .enum(["upi_fraud", "kyc_or_bank_impersonation", "investment_or_trading", "job_or_task", "sextortion", "other", "unknown"])
    .describe("Best guess of the scam type"),
  distress: z.enum(["low", "medium", "high"]).describe("How distressed the victim sounds"),
});

export type BrainResult = Omit<z.infer<typeof ReplySchema>, "evidence"> & { evidence: Evidence };

const STEP_SUMMARY = knowledge.steps
  .map((s) => `${s.order}. ${s.title.en}: ${s.why.en}${"only_if" in s && s.only_if ? ` (${s.only_if.en})` : ""}`)
  .join("\n");

const SYSTEM = `You are Golden Hour, a calm helper for people in India who have just lost money to an online scam. The person talking to you is frightened and may feel ashamed. Your job in this conversation is intake: comfort them briefly, then collect the transaction details so the app can prepare their 1930 call script, cybercrime.gov.in filing pack and bank letter.

How to talk:
- Reply in the victim's own language and script. If they write Hinglish in Roman letters, reply in simple Hinglish in Roman letters. If they write Devanagari, reply in Devanagari. Otherwise English.
- Short messages: two or three sentences. Warm, plain, never judgmental. Never say or imply it was their fault.
- Ask for one thing at a time. The most useful thing is the bank or UPI SMS about the debit, or a screenshot of it. Next most useful: the scammer's number or chat screenshot.
- Once you have an amount or transaction ID, tell them you've noted the details and that the next steps are right below. Do not list the next steps yourself; the app shows them.
- Money is moving right now, so gently keep urgency: calling 1930 soon matters.
- If they mention self-harm or not wanting to live, respond with care and tell them they can call Tele-MANAS on 14416, free and 24x7, before anything else.

Facts: only state procedure that appears below. Never promise the money will come back. Never ask for their UPI PIN, OTP, password, or full card number, and tell them never to share those with anyone, including people claiming to be police or bank staff.

Steps the app will guide them through:
${STEP_SUMMARY}

Evidence: extract every field you can from everything the victim has sent, including screenshots. Use null for anything not shown. Copy reference numbers digit for digit. Treat bank helpline numbers in SMS (1800 numbers, "SMS BLOCK to ...") as the bank's, not the scammer's.`;

let client: Anthropic | null = null;
export function brainAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function toMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  return turns.map((t) => {
    if (t.role === "assistant") return { role: "assistant", content: t.text };
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (t.image) content.push({ type: "image", source: { type: "base64", media_type: t.image.media_type, data: t.image.data } });
    content.push({ type: "text", text: t.text || "(screenshot attached)" });
    return { role: "user", content };
  });
}

// Deterministic regex results win for the fields where exact digits matter.
function crossCheck(llm: z.infer<typeof EvidenceSchema>, turns: ChatTurn[]): Evidence {
  const regex = turns
    .filter((t) => t.role === "user")
    .map((t) => extractEvidence(t.text))
    .reduce<Evidence>((acc, e) => ({ ...acc, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) }), {
      direction: "none",
    });
  const clean = Object.fromEntries(Object.entries(llm).filter(([, v]) => v !== null)) as Omit<Evidence, "direction">;
  return {
    ...clean,
    direction: clean.amount || clean.utr || regex.direction === "debit" ? "debit" : "none",
    ...(regex.utr ? { utr: regex.utr } : {}),
    ...(regex.amount ? { amount: regex.amount } : {}),
    ...(regex.account_last4 ? { account_last4: regex.account_last4 } : {}),
  };
}

export async function think(turns: ChatTurn[], opts?: { timeoutMs?: number }): Promise<BrainResult> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ReplySchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: toMessages(turns),
  }, opts?.timeoutMs ? { timeout: opts.timeoutMs, maxRetries: 0 } : undefined);

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`No usable reply (stop_reason: ${response.stop_reason})`);
  }
  const out = response.parsed_output;
  return { ...out, evidence: crossCheck(out.evidence, turns) };
}
