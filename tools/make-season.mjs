#!/usr/bin/env node
// Elf Night Planner · SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the "nights" in plan.json from the schedule in config.json.
//   node tools/make-season.mjs                    uses config.json's "mode" and co-parenting "side"
//   node tools/make-season.mjs everyday           or pick a mode: co-parenting | everyday
//   node tools/make-season.mjs co-parenting B     and, for co-parenting, a side: A | B
//   add --fresh to start from an empty calendar (only config.json's overrides place ideas)
//
// The rules live in season.js (shared with the page). Existing ideas, supplies, done marks,
// materials and notes in plan.json are kept.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { MODES, SIDES, buildNights } = createRequire(import.meta.url)(join(root, "season.js"));
const cfg = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
const planPath = join(root, "plan.json");
const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : {};
plan.ideas ??= {}; plan.supplies ??= {};

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const [modeArg, sideArg] = args.filter(a => a !== "--fresh");
const mode = modeArg || cfg.mode || "co-parenting";
const side = sideArg || cfg.schedule?.coParenting?.side || "A";
if (!MODES.includes(mode)) { console.error(`Unknown mode "${mode}". Use one of: ${MODES.join(", ")}`); process.exit(1); }
if (!SIDES.includes(side)) { console.error(`Unknown side "${side}". Use one of: ${SIDES.join(", ")}`); process.exit(1); }

const nights = buildNights(cfg.schedule, mode, fresh ? {} : plan.nights ?? {}, plan.ideas, side);
for (const [date, n] of Object.entries(nights)) {
  if (n.ideaId && !plan.ideas[n.ideaId]) console.warn(`warning: ${date} uses unknown idea "${n.ideaId}"`);
}
writeFileSync(planPath, JSON.stringify({ mode, side, nights, ideas: plan.ideas, supplies: plan.supplies }, null, 2) + "\n");
const counts = Object.values(nights).reduce((a, n) => (a[n.tag] = (a[n.tag] || 0) + 1, a), {});
console.log(`Wrote ${Object.keys(nights).length} ${mode}${mode === "co-parenting" ? ` (Home ${side})` : ""} nights to plan.json`, counts);
