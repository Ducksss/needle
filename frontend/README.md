# Frontend segment: Needle console

A React + TypeScript (Vite) port of the A3+ replay console, plus the 24 h warnings view the brief asks for.

## Reference

`reference/Daylight2.dc.html` is the working A3+ design. It uses a small template language:

- `{{x}}` holes
- `<sc-for list="{{xs}}" as="x">` loops
- `<sc-if value="{{flag}}">` conditionals
- a `Component` class whose `renderVals()` computes every view value

The two `/_blob/...` fetch URLs are `fleet.json` and `replay.json`. Port the logic in `renderVals()` into typed pure functions under `src/model/`, with unit tests, and the markup into components under `src/components/`. Keep the visual system:

- Manrope for UI text, IBM Plex Mono for numbers.
- One 10 px radius and 1 px `#E3E8EE` borders.
- Colours: ink `#0F172A`, risk `#C2410C`, watch `#2563EB`, hidden `#B45309`, action `#6D28D9`, ok `#0F766E`.

## Panels (keep every one; each answers one question)

| Panel | Question |
|---|---|
| Header KPIs | How many events are open, to decide, passed, approved? |
| Next decision | What must I decide first, and by when? |
| Queue: Decide, Watch, Passed | What else is open? Decide is sorted by deadline. |
| Message history | Is Pc or miss getting worse? |
| Encounter plane | Where does the object pass now and after the burn? |
| Cost of waiting | What does deferring cost? Sets the deadline. |
| Options | Which burn, how big, what result? |
| Messages received (non-plan states) | Where do the brief's tiers and Pc disagree, per CDM? |
| Orbit context | Which satellite (orientation illustrative) |
| Since last run | What changed in the last 8 h? |
| Decision log | What was approved or deferred, and when? |
| Replay timeline dock | Fleet history, deadlines, burns over time |
| Approval modal | Burn plan, predicted outcome, gate checks, approve |

The timeline elements, legend, KPIs and status chips all show hover cards. Match the wording in the reference.

## New in this segment

- Next 24 h warnings panel and a shaded 24 h band on the timeline, per `contracts/README.md` § 24 h warnings.
- Δv budget setting (default 10 mm/s), kept in `localStorage` inside try/catch.

## Data

`src/data/source.ts`: when `VITE_API_URL` is set, fetch `/api/fleet`, `/api/replay` and `/api/metrics` from it. Otherwise fetch `/data/*.json` from `public/data/`. `npm run sync-data` copies `../artifacts/*.json` into `public/data/`; commit the copies so a static build works without the API. Handle a missing `metrics.json`.

## Quality bar

- Keyboard focus shows the same hover cards; every button has a label; colour is never the only signal.
- Correct at 1440 px wide, usable at 1024 px, and no horizontal page scroll at 375 px.
- `npm run typecheck`, `npm test` (vitest) and `npm run build` pass.
- Visual check: run the dev server and capture each state:
  - default run
  - a Watch event
  - a Passed event
  - the last run
  - the approval modal
  - the 24 h panel
  - three hover cards

  Save the screenshots in `docs/screenshots/`. Look at each one and fix what is wrong before you open the pull request.

## Done when

All checks pass, the screenshots are committed and referenced in the pull request, and a pull request to `main` is open.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173, reads public/data/*.json
npm run typecheck
npm test
npm run build        # dist/ works as a static site, no API needed
npm run sync-data    # after ml/ rewrites ../artifacts/*.json; commit the copies
npm run screenshots  # needs the dev server and Google Chrome; writes docs/screenshots/
```

Set `VITE_API_URL=http://localhost:8000` (no trailing `/api`) to read the API instead of the static copies.

Code layout: `src/model/` holds every view value as typed pure functions (one file per panel, tests beside them), `src/components/` lays them out, and `src/styles/console.css` holds the visual system. `src/model/view.ts` is the entry point: `buildView(data, uiState)`.
