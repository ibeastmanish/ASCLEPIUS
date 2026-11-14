# Contributing

ASCLEPIUS is open source (MIT). The most useful contribution right now is **a language**: the daily check is short, and every new language lets more health workers use the "delay is delay" clinic mode where the nearest doctor is far away.

## Add or review a language (about 30 minutes)
1. Copy `src/i18n/te.json` to `src/i18n/<code>.json` (for example `ta.json` for Tamil, `sw.json` for Swahili).
2. Translate every value. Keep `{n}`, `{need}` and `{tile}` exactly as they are. Keep numbers and units (mmHg, bpm, mg/dL, °C) unchanged.
3. In `src/i18n/index.ts`: import the file, add the code to `Lang`, add it to `makeT({ ... })` and to `LANGS`.
4. Run `npm test`. A test fails if any key is missing.
5. Open a pull request. Say whether you are a native speaker.

**Reviewing an existing draft** (Telugu, Hindi): fix any line that sounds unnatural to a native speaker, then put your name in `_meta.reviewedBy`. The app then shows the language as "reviewed" instead of "draft".

## Health rules
Every threshold lives in `src/engine/rules.json` with a source. A change to a rule needs a citation (NASA-STD-3001 or a named clinical guideline) and a test at, just below and just above the new threshold. ASCLEPIUS is decision support, not a medical device; rule changes from clinicians and flight surgeons are especially welcome.

## Code
```bash
npm install
npm test        # must stay green
npm run lint
npm run build
```
Please keep it offline-first (no server calls), keep every colour traceable to a rule, and label simulated data.
