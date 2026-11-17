# Elf Night Planner — working with Claude

A static site (`index.html`, `app.js`, `season.js`, `styles.css`) that reads `config.json` and `plan.json`. No build step. Serve with `python3 -m http.server`.

## Data
- `config.json`: elves' names, year, labels, the default `mode`, and the `schedule` rules.
- Two planner types (`mode`): `co-parenting` (two homes: away nights, switchover days, FaceTime days) and `everyday` (home every night; `flexibleWeekdays` get more time). The schedule rules for both live in `season.js`, shared by the page and the script.
- Co-parenting describes **Home A**'s pattern; **Home B** is every other night. `side` (A or B) picks whose nights the plan shows, so either co-parent can use it. `swaps` flips individual dates between homes.
- Overrides only change home nights (and FaceTime days). On a night away, only the schedule note shows. An override's idea is placed only if that idea isn't already on another night.
- Keep the example schedule generic. Never put a real family's custody pattern, dates or names in the example `config.json` or `plan.json`.
- `plan.json`: `mode`, `side`, `nights` (keyed by `YYYY-MM-DD`), `ideas` (keyed by slug), `supplies`.
  - night: `tag` (regular | flexible | wow | facetime | away), `ideaId`, `done`, `schedule` (short note), `materials` (one per line), `notes`.
  - idea: `title`, `image` (`photos/...jpg` or null), `alt`, `effort` (quick | medium | big), `minutes`, `supplies[]`, `setup`, `signs[]`, `signPick`, `signCustom`, optional `story` (for FaceTime days).
- `node tools/make-season.mjs [co-parenting|everyday] [A|B] [--fresh]` rebuilds `nights` from the schedule and keeps existing ideas, materials, notes and done marks. An idea on a night that becomes an away night goes back to the tray.
- In `everyday` mode there are no `facetime` or `away` nights. Don't plan FaceTime stories for an everyday season.

## The idea workflow
1. The user sends screenshots of ideas, or photos of supplies they already own.
2. **One idea = one image.** If a screenshot holds more than one idea, crop each into its own file in `photos/`. Crop away phone chrome, captions and like counts.
3. **Privacy before anything is saved:** crop out names, addresses, school papers, tickets and faces of people. Run `python3 tools/strip-metadata.py` on every photo.
4. Only commit photos the user took themselves. Screenshots of other people's posts are inspiration only: describe the idea in your own words and leave `image` null.
5. For each idea: write `alt` text describing the setup, choose `effort` and `minutes`, list `supplies`, and draft 2–3 signs in the elves' voice. Keep signs short enough to handwrite quickly and easy for young kids to read. Write `{elf}` where the first elf's name goes; the page fills it in from `config.json`.
6. Put the idea on a night whose tag fits: quick ideas on Regular nights, bigger ones on Flexible or Wow nights, "while you were away" ideas on FaceTime days (co-parenting only). Otherwise leave it in the tray (no night).
7. "Plan for [date]" means: read that night and reply with the setup, materials, minutes, and the chosen sign.

## Conventions
- Write UI copy plainly, from the user's side.
- Keep accessibility intact: every image has alt text, every drag action has a button alternative, and color is never the only signal.
- Ask before changing the schedule rules or deleting an idea.
