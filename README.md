# Golden Hour

Calm, multilingual help for people in India right after an online scam. It pulls evidence out of bank and UPI SMS, gives a pre-filled script for the 1930 helpline call, and walks the victim through cybercrime.gov.in, the bank dispute letter, SEBI SCORES and RBI Ombudsman escalation.

Hackathon build (30 Sep to 3 Oct 2026). Web first, WhatsApp sandbox next.

## Run

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev            # http://localhost:3000
npm run check:samples  # regex extractor vs. the sample SMS set
```

Without an API key the site still works in offline mode: paste a bank SMS and the regex extractor fills the card.

## Layout

- `src/components/Chat.tsx`: chat UI, evidence card, step cards
- `src/app/api/chat/route.ts` + `src/lib/brain.ts`: Claude intake. Understands Hindi, Hinglish and English, reads SMS and screenshots, returns a calm reply plus structured evidence. Regex results override the model for UTR, amount and account digits.
- `src/lib/extract.ts`: deterministic SMS evidence extractor (amount, UTR, bank, account, UPI ID, date, time)
- `src/lib/script.ts`: 1930 call script in Hindi and English
- `src/data/knowledge.json`: curated steps, rules, deadlines and sources. Procedure comes only from here. Entries with `verified: false` still need checking against the official source.
- `src/data/sample-sms.json`: fictional SMS for demos and tests

## Status

- Day 1 (done): chat site, knowledge pack, sample SMS, offline extractor, 1930 script with read-aloud
- Day 2 (done): Claude-powered chat, screenshot upload, free-text Hinglish intake, offline fallback to the regex flow when no key is set or the API fails
- Day 3: cybercrime.gov.in filing pack, bank letter PDF, case tracker, WhatsApp sandbox
- Day 4: demo polish
