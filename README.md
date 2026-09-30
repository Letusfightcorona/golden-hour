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

## WhatsApp (Twilio sandbox)

1. In the Twilio console, open Messaging > Try it out > Send a WhatsApp message and join the sandbox from your phone.
2. Deploy the site (or run it behind a tunnel such as ngrok) and set `PUBLIC_URL`, `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. Set the sandbox's "When a message comes in" URL to `https://<your-site>/api/whatsapp` (POST).

Send "Mere saath fraud ho gaya" and then the bank SMS or a screenshot. The bot replies calmly, sends the 1930 script, and links to the website with the case pre-filled for the filing pack, bank letter and deadlines. Send "reset" to start over. Conversations are kept in server memory, which is enough for a demo on one server.

## Layout

- `src/components/Chat.tsx`: chat UI and evidence card
- `src/components/Steps.tsx`: step cards: 1930 script, cybercrime.gov.in filing pack with copy buttons, bank letter PDF, deadline tracker and RBI Ombudsman draft
- `src/app/api/whatsapp/route.ts`: Twilio WhatsApp webhook (signature-checked), same brain as the website
- `src/lib/letter.ts`, `src/lib/deadlines.ts`, `src/lib/caselink.ts`: bank letter PDF, deadline maths, WhatsApp-to-web case links
- `src/app/api/chat/route.ts` + `src/lib/brain.ts`: Claude intake. Understands Hindi, Hinglish and English, reads SMS and screenshots, returns a calm reply plus structured evidence. Regex results override the model for UTR, amount and account digits.
- `src/lib/extract.ts`: deterministic SMS evidence extractor (amount, UTR, bank, account, UPI ID, date, time)
- `src/lib/script.ts`: 1930 call script in Hindi and English
- `src/data/knowledge.json`: curated steps, rules, deadlines and sources. Procedure comes only from here. Entries with `verified: false` still need checking against the official source.
- `src/data/sample-sms.json`: fictional SMS for demos and tests

## Status

- Day 1 (done): chat site, knowledge pack, sample SMS, offline extractor, 1930 script with read-aloud
- Day 2 (done): Claude-powered chat, screenshot upload, free-text Hinglish intake, offline fallback to the regex flow when no key is set or the API fails
- Day 3 (done): cybercrime.gov.in filing pack, bank letter PDF, case tracker with deadlines and RBI Ombudsman draft, WhatsApp sandbox webhook
- Day 4: demo polish
