# Golden Hour

Calm, multilingual help for people in India right after an online scam. It pulls evidence out of bank and UPI SMS, gives a pre-filled script for the 1930 helpline call, and walks the victim through cybercrime.gov.in, the bank dispute letter, SEBI SCORES and RBI Ombudsman escalation.

Hackathon build (30 Sep to 3 Oct 2026). Web first, WhatsApp sandbox next.

## Run

```bash
npm install
npm run dev            # http://localhost:3000
npm run check:samples  # regex extractor vs. the sample SMS set
```

## Layout

- `src/components/Chat.tsx`: chat UI, evidence card, step cards
- `src/lib/extract.ts`: deterministic SMS evidence extractor (amount, UTR, bank, account, UPI ID, date, time)
- `src/lib/script.ts`: 1930 call script in Hindi and English
- `src/data/knowledge.json`: curated steps, rules, deadlines and sources. Procedure comes only from here. Entries with `verified: false` still need checking against the official source.
- `src/data/sample-sms.json`: fictional SMS for demos and tests

## Status

- Day 1 (done): chat site, knowledge pack, sample SMS, offline extractor, 1930 script with read-aloud
- Day 2: Claude-powered chat and screenshot extraction, free-text Hinglish intake
- Day 3: cybercrime.gov.in filing pack, bank letter PDF, case tracker, WhatsApp sandbox
- Day 4: demo polish
