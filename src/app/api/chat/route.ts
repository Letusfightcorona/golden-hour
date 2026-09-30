import Anthropic from "@anthropic-ai/sdk";
import { brainAvailable, think, type ChatTurn } from "@/lib/brain";

// POST { turns: ChatTurn[] } -> BrainResult, or { offline: true } so the client
// falls back to the on-device regex flow (no key configured, or the API is down).
export async function POST(request: Request) {
  if (!brainAvailable()) return Response.json({ offline: true, reason: "no_api_key" });

  let turns: ChatTurn[];
  try {
    ({ turns } = await request.json());
    if (!Array.isArray(turns) || turns.length === 0) throw new Error("turns missing");
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  try {
    return Response.json(await think(turns.slice(-20)));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.error("Claude rate limited");
    else if (error instanceof Anthropic.APIError) console.error(`Claude API error ${error.status}: ${error.message}`);
    else console.error("Brain failed:", error);
    return Response.json({ offline: true, reason: "api_error" });
  }
}
