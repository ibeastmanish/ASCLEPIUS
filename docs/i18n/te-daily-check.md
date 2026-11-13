# Telugu daily check: draft for review

**Status: draft.** The Telugu text in [`te.daily-check.json`](te.daily-check.json) was drafted with an AI assistant. It must not ship, or be shown to judges as finished, until a fluent Telugu speaker has reviewed every line. If it is shown at the event, list it in the project's Use of SI section.

## Why
ASCLEPIUS's Earth use is community health workers near Warangal, Telangana, where the nearest doctor can be hours away. Most of them read Telugu first. One fully translated screen, the daily check, shows that the Earth edition is real and not only a slide.

## What the reviewer should check
1. **Plain words a health worker would actually say.** Prefer everyday Telugu, and keep common English loan words where people use them (బీపీ, షుగర్, సేవ్).
2. **Medical meaning.** Above all the six warning signs (`symptoms`) and the status words (`status`). "వెంటనే చర్య తీసుకోండి" (act now) has to sound urgent, and "గమనించండి" (check) must not sound alarming.
3. **Length.** Tile labels must fit on one line on a phone. Shorten if needed.
4. **Earth wording.** "వైద్యాధికారి" (medical officer) stands in for the crew medical officer. For clinics, "డాక్టర్" may read better. "అంతరిక్ష నడక తర్వాత" (after EVA) can be hidden in the Earth edition.

Keep Western digits and the units mmHg, bpm, mg/dL and °C unchanged.

## Wiring it in (about an hour at the event)
- Add a `lang` setting (`en` or `te`) next to the theme switch in Settings.
- Add a tiny `t(key)` helper that reads `en` (today's strings) or `te` from this JSON. Keys match the app's own IDs: `symptoms.*` and `context.*` match `rules.json`, and `status.*` matches the status names in `src/ui/ui.tsx`.
- Use it only on the daily check screen first. Every other screen stays in English.
- Fonts: macOS, iOS and Android ship Telugu fonts. For a consistent look, self-host Noto Sans Telugu (OFL licence) so it still works offline.
- Rules, thresholds and colours do not change. Only the labels change.
