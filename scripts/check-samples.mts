// Runs the regex extractor over every sample SMS and checks the expected fields.
// Usage: npm run check:samples
import samples from "../src/data/sample-sms.json" with { type: "json" };
import { extractEvidence } from "../src/lib/extract.ts";

let failures = 0;
for (const s of samples.samples) {
  const got = extractEvidence(s.text) as Record<string, unknown>;
  for (const [key, want] of Object.entries(s.expect)) {
    if (got[key] !== want) {
      failures++;
      console.log(`FAIL ${s.id}.${key}: want ${JSON.stringify(want)}, got ${JSON.stringify(got[key])}`);
    }
  }
}
console.log(failures ? `${failures} field(s) wrong` : `all ${samples.samples.length} samples OK`);
process.exit(failures ? 1 : 0);
