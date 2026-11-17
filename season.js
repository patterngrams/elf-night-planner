// Elf Night Planner · SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the season's nights from config.json's "schedule". Shared by the page (app.js)
// and tools/make-season.mjs, so both always agree.
//
// Two planner types ("modes"):
//   "co-parenting": kids split time between two homes, A and B.
//     The schedule describes Home A's nights. Home B gets every other night, so both
//     co-parents can use the same planner and each pick their own side.
//     - homeWeekdays: weekdays the kids are at Home A every week (e.g. mon, tue).
//     - alternatingWeekends: every other weekend is at Home A, starting with firstHomeFriday.
//     - swaps: dates that switch homes (holidays, trades).
//     - A home night right after a night away is a switchover, tagged "flexible" (more time).
//     - facetimeAuto: on each stretch of 3+ nights away, the middle night is a FaceTime day.
//     - facetimeDays: extra FaceTime days (used only when that night is away).
//   "everyday": kids are home every night.
//     - flexibleWeekdays: nights with more time, usually fri and sat.
// overrides (shared, plus each mode's own) set a home night's tag, schedule note, or ideaId.
// On a night away, only the schedule note applies. An override with "side": "A" or "B" applies only
// to that home's plan; that's also how to put an idea on a FaceTime day.
// Ideas, done marks, materials and notes already on a night are kept. An idea on a night that
// becomes "away" goes back to the tray.
(function (root) {
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const MODES = ["co-parenting", "everyday"];
  const SIDES = ["A", "B"];
  const HOME_TAGS = ["regular", "flexible", "wow"];
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const weekendFriday = (d) => addDays(d, -((d.getDay() + 2) % 7)); // the Friday that starts d's weekend block

  // Is d a Home A night?
  function homeA(cp) {
    const swaps = new Set(cp.swaps || []);
    return (d) => {
      const day = DOW[d.getDay()];
      let a = (cp.homeWeekdays || []).includes(day);
      const aw = cp.alternatingWeekends;
      if (aw && aw.firstHomeFriday && (aw.days || []).includes(day)) {
        const weeks = Math.round((weekendFriday(d) - parse(aw.firstHomeFriday)) / (7 * 864e5));
        a = Math.abs(weeks) % 2 === 0;
      }
      return swaps.has(iso(d)) ? !a : a;
    };
  }

  function buildNights(schedule, mode, oldNights = {}, ideas = {}, side = "A") {
    const s = schedule || {};
    if (!MODES.includes(mode)) mode = "co-parenting";
    if (!SIDES.includes(side)) side = "A";
    const cp = s.coParenting || {};
    const ev = s.everyday || {};
    const own = (mode === "everyday" ? ev : cp).overrides || {};
    const a = homeA(cp);
    const isHome = mode === "everyday" ? () => true : side === "A" ? a : (d) => !a(d);
    const flexDays = ev.flexibleWeekdays || ["fri", "sat"];
    if (!s.start || !s.end) return {};
    const start = parse(s.start), end = parse(s.end);

    // FaceTime days: listed ones, plus the middle of each long stretch away.
    const facetime = new Set();
    if (mode !== "everyday") {
      for (const f of cp.facetimeDays || []) facetime.add(f);
      if (cp.facetimeAuto) {
        let run = [];
        const flush = () => { if (run.length >= 3) facetime.add(run[Math.floor((run.length - 1) / 2)]); run = []; };
        for (let d = start; d <= end; d = addDays(d, 1)) { if (isHome(d)) flush(); else run.push(iso(d)); }
        flush();
      }
    }

    // An override's idea is only placed if the person hasn't already put that idea somewhere,
    // so moving an idea and switching views never shows it twice.
    const placed = new Set(Object.values(oldNights).map(n => n?.ideaId).filter(Boolean));
    const used = new Set();
    const nights = {};
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const date = iso(d);
      const home = isHome(d);
      let tag, note = "";
      if (mode === "everyday") {
        tag = flexDays.includes(DOW[d.getDay()]) ? "flexible" : "regular";
        if (tag === "flexible") note = "More time tonight";
      } else if (home) {
        tag = isHome(addDays(d, -1)) ? "regular" : "flexible";
        if (tag === "flexible") note = "Switchover day";
      } else {
        tag = facetime.has(date) ? "facetime" : "away";
      }
      // An override with "side" only applies to that home's plan (co-parenting).
      const fits = (x) => x && (!x.side || mode === "everyday" || x.side === side);
      const ownO = fits(own[date]) ? own[date] : {};
      const o = { ...(fits(s.overrides?.[date]) ? s.overrides[date] : {}), ...ownO };
      const prev = oldNights[date] || {};
      if (home && HOME_TAGS.includes(o.tag)) tag = o.tag;
      // Ideas from overrides go on home nights. A FaceTime day takes one only from an override marked with this side.
      const oIdea = home ? o.ideaId : tag === "facetime" && ownO.side === side ? ownO.ideaId : null;
      const seed = oIdea && (!placed.has(oIdea) || prev.ideaId === oIdea) ? oIdea : null;
      // A night keeps its idea only if it stays the same kind of night: home stays home, FaceTime stays FaceTime.
      const kind = (t) => (t === "facetime" ? "facetime" : t === "away" ? "away" : "home");
      const carry = prev.tag && kind(prev.tag) !== kind(tag) ? null : prev.ideaId ?? null;
      let ideaId = tag === "away" ? null : seed ?? carry;
      if (ideaId && used.has(ideaId)) ideaId = null;
      if (ideaId) used.add(ideaId);
      const kept = prev.ideaId === ideaId;
      nights[date] = {
        date,
        tag,
        ideaId,
        done: prev.done ?? false,
        schedule: o.schedule ?? note,
        materials: kept && prev.materials != null ? prev.materials
          : ideaId && ideas[ideaId] ? (ideas[ideaId].supplies || []).join("\n") : "",
        notes: tag === "away" ? "" : prev.notes ?? "",
      };
    }
    return nights;
  }

  const api = { MODES, SIDES, buildNights };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ElfSeason = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
