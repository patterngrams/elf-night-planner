// Elf Night Planner · SPDX-License-Identifier: AGPL-3.0-or-later
(() => {
  const TAGS = {
    regular:  { label: "Regular",  hint: "Quick school-night setup" },
    flexible: { label: "Flexible", hint: "More time tonight" },
    wow:      { label: "Wow",      hint: "Big setup" },
    facetime: { label: "FaceTime", hint: "Kids at the other home, the elves report in" },
    away:     { label: "Other home", hint: "No setup" },
  };
  const EFFORT = { quick: "Quick", medium: "Medium", big: "Big" };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const CANE = '<svg class="cane-mark" viewBox="0 0 20 28" aria-hidden="true"><path d="M5 26V9a5 5 0 0 1 10 0v2" fill="none" stroke="var(--candy)" stroke-width="5" stroke-linecap="round"/><path d="M5 26V9a5 5 0 0 1 10 0v2" fill="none" stroke="var(--stripe-light)" stroke-width="5" stroke-linecap="round" stroke-dasharray="3 4"/></svg>';

  const state = { nights: new Map(), ideas: new Map(), supplies: new Map(), loaded: { nights: false, ideas: false, supplies: false } };
  let cfg = {}, openDate = null, openIdea = null, movingId = null, mode = "co-parenting", side = "A";
  const MODE_LABEL = { "co-parenting": "Co-parenting", everyday: "Every night at home" };
  // Tags a person can pick in this mode. Every night at home has no "other home" or FaceTime nights.
  const modeTags = () => Object.keys(TAGS).filter(k => mode !== "everyday" || (k !== "facetime" && k !== "away"));

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const parse = (iso) => { const [y,m,d] = iso.split("-").map(Number); return new Date(y, m-1, d); };
  const short = (iso) => { const d = parse(iso); return `${DOW[d.getDay()].slice(0,3)} ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const long = (iso) => { const d = parse(iso); return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  const sortedNights = () => [...state.nights.values()].sort((a,b) => a.date < b.date ? -1 : 1);
  const nightOf = (ideaId) => sortedNights().find(n => n.ideaId === ideaId);
  const signText = (idea) => {
    if (!idea) return "";
    if (idea.signPick === -1) return idea.signCustom || "";
    const s = idea.signs || [];
    return fillElf(s[idea.signPick ?? 0] || "");
  };
  // "{elf}" in a sign becomes the first elf's name from config.json
  const fillElf = (t) => String(t).replaceAll("{elf}", cfg?.elves?.[0] || "Your elf");
  const defaultMaterials = (idea) => (idea?.supplies || []).join("\n");
  const chip = (tag) => `<span class="chip t-${tag}">${TAGS[tag]?.label || tag}</span>`;

  function say(msg) { const l = $("#live"); l.textContent = ""; setTimeout(() => l.textContent = msg, 30); }
  let toastT; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); say(msg); }

  // ---------- local storage ----------
  const STORE_KEY = "elf-night-planner:plan";
  function snapshot() {
    const out = { mode, side };
    for (const name of ["nights", "ideas", "supplies"]) {
      out[name] = {};
      for (const [id, doc] of state[name]) { const { id: _drop, ...rest } = doc; out[name][id] = rest; }
    }
    return out;
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); return true; }
    catch { toast("Couldn't save in this browser. Use Export plan to keep a copy."); return false; }
  }
  async function write(path, data) {
    const [name, id] = path.split("/");
    const doc = state[name]?.get(id);
    if (!doc) return false;
    state[name].set(id, { ...doc, ...data });
    const ok = persist();
    render();
    return ok;
  }

  // ---------- moving ideas ----------
  async function moveIdea(ideaId, toDate) {
    const idea = state.ideas.get(ideaId); if (!idea) return;
    const from = nightOf(ideaId);
    if (from && from.date === toDate) return;
    if (toDate === null) {
      if (from) await write("nights/" + from.date, { ideaId: null, done: false, materials: "" });
      toast(`${idea.title} moved to the idea tray`);
      return;
    }
    const target = state.nights.get(toDate); if (!target) return;
    const bumped = target.ideaId && target.ideaId !== ideaId ? target.ideaId : null;
    // materials travel with the idea; notes stay with the night
    const ok = await write("nights/" + toDate, { ideaId, done: false, materials: from ? (from.materials || "") : defaultMaterials(idea) });
    if (!ok) return;
    if (from) await write("nights/" + from.date, { ideaId: bumped, done: false, materials: bumped ? (target.materials || "") : "" });
    const bumpedTitle = bumped ? state.ideas.get(bumped)?.title : null;
    let msg = `${idea.title} moved to ${long(toDate)}.`;
    if (bumpedTitle) msg += from ? ` ${bumpedTitle} swapped to ${long(from.date)}.` : ` ${bumpedTitle} went to the idea tray.`;
    toast(msg);
  }
  function startMove(ideaId) {
    movingId = ideaId;
    const idea = state.ideas.get(ideaId);
    document.body.classList.add("moving");
    $("#mover-text").textContent = `Moving “${idea?.title}”. Pick a night below.`;
    $("#mover").hidden = false;
    if ($("#dlg").open) $("#dlg").close();
    say(`Moving ${idea?.title}. Each night now has a Put here button.`);
    $("#calendar").focus();
  }
  function endMove() { movingId = null; document.body.classList.remove("moving"); $("#mover").hidden = true; }
  $("#mover-cancel").onclick = () => { endMove(); say("Move cancelled"); };
  $("#mover-tray").onclick = async () => { const id = movingId; endMove(); await moveIdea(id, null); };

  // ---------- render ----------
  function render() {
    renderHeader(); renderSpot(); renderCal(); renderTray(); renderSupplies();
    if ($("#dlg").open) renderDialog();
  }

  function renderHeader() {
    const nights = sortedNights();
    const setup = nights.filter(n => n.tag !== "away");
    const planned = setup.filter(n => n.ideaId);
    const done = setup.filter(n => n.done);
    const blanks = setup.filter(n => !n.ideaId);
    const now = today();
    const xmas = parse(cfg.christmas || `${new Date().getFullYear()}-12-25`);
    const days = Math.max(0, Math.round((xmas - now) / 86400000));
    $("#countdown").innerHTML = `<b>${days}</b><span>${days === 1 ? "sleep" : "sleeps"} until Christmas</span>`;
    const pct = setup.length ? Math.round(done.length / setup.length * 100) : 0;
    $("#progress-fill").style.width = pct + "%";
    $("#progress-track").setAttribute("aria-label", `${done.length} of ${setup.length} elf nights done`);
    $("#progress-text").textContent = setup.length ? `${done.length} of ${setup.length} nights done` : "Loading the plan…";
    $("#planned-text").textContent = setup.length ? `${planned.length} of ${setup.length} nights have an idea` : "";
    const todo = $("#todo");
    if (!state.loaded.nights) { todo.className = "todo"; todo.innerHTML = "Loading nights…"; return; }
    if (!setup.length) { todo.className = "todo"; todo.innerHTML = "<strong>No nights yet.</strong> Add them to plan.json, or run tools/make-season.mjs."; return; }
    if (!blanks.length) { todo.className = "todo ok"; todo.innerHTML = "<strong>Every night has an idea.</strong> You're all set."; return; }
    todo.className = "todo";
    todo.innerHTML = `<strong>✏️ ${blanks.length} ${blanks.length === 1 ? "night still needs" : "nights still need"} planning:</strong> ` +
      blanks.map(n => `<a href="#d-${n.date}" data-open="${n.date}">${short(n.date)}</a>`).join(" · ");
  }

  function ideaFacts(idea, n) {
    const list = n ? (n.materials || "").split("\n").map(s => s.trim()).filter(Boolean) : (idea.supplies || []);
    const sup = list.map(s => `<li>${esc(s)}</li>`).join("");
    return `<div class="facts">
      ${idea.setup ? `<div><h4>Setup</h4><p style="margin:0">${esc(idea.setup)}</p></div>` : ""}
      ${sup ? `<div><h4>Materials needed</h4><ul>${sup}</ul></div>` : ""}
      ${n && n.notes ? `<div><h4>Notes</h4><p style="margin:0;white-space:pre-line">${esc(n.notes)}</p></div>` : ""}
      ${idea.story ? `<div><h4>FaceTime story</h4><p style="margin:0">${esc(idea.story)}</p></div>` : ""}
    </div>`;
  }

  function renderSpot() {
    const t = today();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const next = sortedNights().find(n => n.tag !== "away" && n.date >= iso(t) && !n.done);
    const spot = $("#spot");
    if (!next) { spot.innerHTML = `<div class="empty">${state.loaded.nights ? "No more elf nights this season. Merry Christmas!" : "Loading…"}</div>`; $("#next-sub").textContent = ""; return; }
    const idea = next.ideaId ? state.ideas.get(next.ideaId) : null;
    $("#next-sub").textContent = TAGS[next.tag]?.hint || "";
    if (!idea) {
      spot.innerHTML = `<div class="spot"><div class="noimg">Still needs planning ✏️</div><div>
        <div class="when">${long(next.date)}</div><h3>Still needs planning ✏️</h3>
        <div class="meta">${chip(next.tag)}${next.schedule ? `<span class="chip t-away">${esc(next.schedule)}</span>` : ""}</div>
        <p>Pick an idea from the tray.</p>
        <button class="btn primary" type="button" data-open="${next.date}">Choose an idea</button></div></div>`;
      return;
    }
    const sign = signText(idea);
    spot.innerHTML = `<article class="spot" aria-labelledby="spot-t">
      ${idea.image ? `<img src="${esc(idea.image)}" alt="${esc(idea.alt)}">` : `<div class="noimg">${esc(idea.title)}</div>`}
      <div style="min-width:0">
        <div class="when">${long(next.date)}</div>
        <h3 id="spot-t">${esc(idea.title)}</h3>
        <div class="meta">${chip(next.tag)}<span class="chip t-regular">${EFFORT[idea.effort] || ""} · about ${idea.minutes || "?"} min</span>${next.schedule ? `<span class="chip t-away">${esc(next.schedule)}</span>` : ""}</div>
        ${ideaFacts(idea, next)}
        ${sign ? `<div class="note-card"><small>Sign to write</small><div class="note">${esc(sign)}</div></div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          <button class="btn primary" type="button" data-open="${next.date}">Open night</button>
          <button class="btn green" type="button" data-done="${next.date}">Mark done ✓</button>
        </div>
      </div></article>`;
  }

  function renderCal() {
    const cal = $("#cal");
    const nights = sortedNights();
    if (!nights.length) { cal.innerHTML = `<div class="empty" style="grid-column:1/-1">${state.loaded.nights ? "No nights loaded yet." : "Loading the season…"}</div>`; return; }
    let html = DOW.map(d => `<div class="dow" aria-hidden="true">${d.slice(0,3)}</div>`).join("");
    const firstDow = parse(nights[0].date).getDay();
    for (let i = 0; i < firstDow; i++) html += `<div class="pad" aria-hidden="true"></div>`;
    for (const n of nights) {
      const idea = n.ideaId ? state.ideas.get(n.ideaId) : null;
      const d = parse(n.date);
      const away = n.tag === "away";
      const cls = ["day", away ? "away" : "", n.tag === "wow" ? "wow" : "", !idea ? "blank" : ""].join(" ");
      let body;
      if (away) body = `<span class="sub">${esc(n.schedule || "No setup")}</span>`;
      else if (idea) body = `${idea.image ? `<img class="thumb" src="${esc(idea.image)}" alt="" loading="lazy">` : ""}<span><span class="title">${esc(idea.title)}</span><br><span class="sub">${EFFORT[idea.effort] || ""} · ${idea.minutes || "?"} min</span></span>`;
      else body = `<span class="needs">Still needs planning ✏️</span>${n.schedule ? `<span class="sub">${esc(n.schedule)}</span>` : ""}`;
      const label = `${long(n.date)}. ${TAGS[n.tag]?.label}. ${away ? (n.schedule || TAGS.away.label) : idea ? idea.title : "Still needs planning"}${n.done ? ". Done" : ""}`;
      html += `<div class="${cls}" role="listitem" id="d-${n.date}" data-date="${n.date}" ${idea && !away ? 'draggable="true"' : ""}>
        ${n.done ? `<span class="done-badge">Done ✓</span>` : ""}
        <div class="date"><span><b>${d.getDate()}</b> <span class="m">${MONTHS[d.getMonth()]} · ${DOW[d.getDay()].slice(0,3)}</span></span>${n.tag === "wow" ? CANE : ""}</div>
        ${chip(n.tag)}
        <button class="open" type="button" data-open="${n.date}" aria-label="${esc(label)}">${body}</button>
        ${away ? "" : `<div class="put-here"><button class="btn small green primary" type="button" data-put="${n.date}">Put here</button></div>`}
      </div>`;
    }
    cal.innerHTML = html;
  }

  function renderTray() {
    const used = new Set(sortedNights().map(n => n.ideaId).filter(Boolean));
    const free = [...state.ideas.values()].filter(i => !used.has(i.id)).sort((a,b) => a.title.localeCompare(b.title));
    const tray = $("#tray");
    if (!free.length) { tray.innerHTML = `<div class="empty">${state.loaded.ideas ? "Every idea has a night. Send more screenshots to fill the blank nights." : "Loading ideas…"}</div>`; return; }
    tray.innerHTML = free.map(i => `<div class="idea" role="listitem" draggable="true" data-idea="${esc(i.id)}">
      ${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.alt)}" loading="lazy">` : ""}
      <h3>${esc(i.title)}</h3>
      <span class="sub" style="color:var(--muted);font-size:13px">${EFFORT[i.effort] || ""} · about ${i.minutes || "?"} min</span>
      <div class="row"><button class="btn small primary" type="button" data-move="${esc(i.id)}">Move to a night</button><button class="btn small" type="button" data-view="${esc(i.id)}">Details</button></div>
    </div>`).join("");
  }

  function renderSupplies() {
    const sups = [...state.supplies.values()].sort((a,b) => a.name.localeCompare(b.name));
    $("#sup").innerHTML = sups.length ? sups.map(s => `<figure>
      ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.alt || s.name)}" loading="lazy">` : ""}
      <figcaption><b>${esc(s.name)}</b><span>${esc(s.uses || "")}</span></figcaption></figure>`).join("")
      : `<div class="empty">${state.loaded.supplies ? "No supplies yet. Send photos of what you have." : "Loading supplies…"}</div>`;
  }

  // ---------- dialog ----------
  function openNight(date) { openDate = date; openIdea = null; renderDialog(); const d = $("#dlg"); if (!d.open) d.showModal(); }
  function openIdeaOnly(id) { openDate = null; openIdea = id; renderDialog(); const d = $("#dlg"); if (!d.open) d.showModal(); }

  function renderDialog() {
    const body = $("#dlg-body");
    const n = openDate ? state.nights.get(openDate) : null;
    const idea = n ? (n.ideaId ? state.ideas.get(n.ideaId) : null) : state.ideas.get(openIdea);
    const focusId = document.activeElement?.id;
    let html = `<div class="dlg-head"><div><div style="font-weight:700;color:var(--velvet)">${n ? long(n.date) : "Idea tray"}</div>
      <h2 id="dlg-title">${idea ? esc(idea.title) : "Still needs planning ✏️"}</h2></div>
      <button class="btn small" type="button" id="dlg-close">Close</button></div>`;

    if (n) {
      html += `<fieldset><legend>What kind of night?</legend><div class="radios">` +
        modeTags().map(k => [k, TAGS[k]]).map(([k,v]) => `<label><input type="radio" name="tag" value="${k}" id="tag-${k}" ${n.tag === k ? "checked" : ""}> ${v.label}</label>`).join("") +
        `</div><p class="hint" style="margin-top:6px">${esc(TAGS[n.tag]?.hint)}${n.schedule ? ` · ${esc(n.schedule)}` : ""}</p></fieldset>`;
    }

    if (idea) {
      html += idea.image ? `<img src="${esc(idea.image)}" alt="${esc(idea.alt)}">` : "";
      html += `<div><div class="meta" style="margin:0">${n ? chip(n.tag) : ""}<span class="chip t-regular">${EFFORT[idea.effort] || ""} · about ${idea.minutes || "?"} min</span></div>${ideaFacts(n ? { ...idea, supplies: [] } : idea)}</div>`;
    }

    if (n && n.tag !== "away") {
      html += `<div class="facts" style="margin:0">
        <div><label for="night-materials" style="font-weight:800;font-family:var(--font-display);font-size:18px">Materials needed</label>
          <p class="hint">One per line. Moves with the idea.</p>
          <textarea id="night-materials" class="plain" rows="4">${esc(n.materials || "")}</textarea></div>
        <div><label for="night-notes" style="font-weight:800;font-family:var(--font-display);font-size:18px">Notes</label>
          <p class="hint">Anything about this night. Stays with the night.</p>
          <textarea id="night-notes" class="plain" rows="4">${esc(n.notes || "")}</textarea></div>
      </div>`;
    }

    if (idea) {
      const signs = idea.signs || [];
      const pick = idea.signPick ?? 0;
      html += `<fieldset><legend>Sign workshop</legend><div class="signs">` +
        signs.map((s,i) => `<label><input type="radio" name="sign" value="${i}" id="sign-${i}" ${pick === i ? "checked" : ""}><span class="note">${esc(fillElf(s))}</span></label>`).join("") +
        `<label><input type="radio" name="sign" value="-1" id="sign-custom" ${pick === -1 || !signs.length ? "checked" : ""}><span style="flex:1"><span style="font-weight:700">${signs.length ? "My own version" : "No sign suggested. Write one if you want."}</span>
          <textarea id="sign-text" aria-label="Your own sign text" placeholder="Write it the way you'll write it…">${esc(idea.signCustom || "")}</textarea></span></label>
        </div><p class="hint">Signed by ${esc(cfg.signedBy || "the elves")}. Keep it short so it's quick to write and easy for young readers.</p></fieldset>`;
    }

    if (n && n.tag !== "away") {
      if (idea) {
        html += `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn green ${n.done ? "" : "primary"}" type="button" id="toggle-done">${n.done ? "Mark not done" : "Mark done ✓"}</button>
          <button class="btn" type="button" data-move="${esc(idea.id)}">Move to another night</button>
          <button class="btn" type="button" id="to-tray">Send to idea tray</button></div>
          <div><label for="move-select" style="font-weight:700">Or swap with a night:</label><br>
          <select id="move-select"><option value="">Choose a night…</option>${sortedNights().filter(x => x.tag !== "away" && x.date !== n.date).map(x => `<option value="${x.date}">${short(x.date)}: ${x.ideaId ? esc(state.ideas.get(x.ideaId)?.title || "") : "needs planning"}</option>`).join("")}</select></div>`;
      } else {
        const used = new Set(sortedNights().map(x => x.ideaId).filter(Boolean));
        const free = [...state.ideas.values()].filter(i => !used.has(i.id));
        html += `<div><h3 style="font-size:20px;margin-bottom:8px">Pick an idea from the tray</h3>` +
          (free.length ? `<div class="pickers">${free.map(i => `<button class="btn" type="button" data-assign="${esc(i.id)}">${esc(i.title)} · ${EFFORT[i.effort] || ""}</button>`).join("")}</div>`
                       : `<p class="hint">The tray is empty. Add ideas to plan.json, or import a plan.</p>`) + `</div>`;
      }
    } else if (!n && idea) {
      html += `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" data-move="${esc(idea.id)}">Move to a night</button></div>`;
    }
    body.innerHTML = html;
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
  }

  const dlg = $("#dlg");
  dlg.addEventListener("click", async (e) => {
    if (e.target === dlg) { dlg.close(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "dlg-close") dlg.close();
    else if (b.id === "toggle-done") { const n = state.nights.get(openDate); await write("nights/" + n.date, { done: !n.done }); say(n.done ? "Marked not done" : "Marked done"); }
    else if (b.id === "to-tray") { const n = state.nights.get(openDate); await moveIdea(n.ideaId, null); }
    else if (b.dataset.assign) { await moveIdea(b.dataset.assign, openDate); }
    else if (b.dataset.move) startMove(b.dataset.move);
  });
  dlg.addEventListener("change", async (e) => {
    const t = e.target;
    const n = openDate ? state.nights.get(openDate) : null;
    const idea = n ? state.ideas.get(n.ideaId) : state.ideas.get(openIdea);
    if (t.name === "tag" && n) { await write("nights/" + n.date, { tag: t.value }); say(`${short(n.date)} tagged ${TAGS[t.value].label}`); }
    else if (t.name === "sign" && idea) { await write("ideas/" + idea.id, { signPick: Number(t.value) }); say("Sign chosen"); }
    else if (t.id === "move-select" && t.value && n) { await moveIdea(n.ideaId, t.value); openDate = t.value; renderDialog(); }
  });
  dlg.addEventListener("focusout", async (e) => {
    if (e.target.id === "night-materials" || e.target.id === "night-notes") {
      const n = openDate ? state.nights.get(openDate) : null; if (!n) return;
      const field = e.target.id === "night-materials" ? "materials" : "notes";
      if ((n[field] || "") === e.target.value) return;
      if (await write("nights/" + n.date, { [field]: e.target.value })) toast(field === "materials" ? "Materials saved" : "Notes saved");
      return;
    }
    if (e.target.id !== "sign-text") return;
    const n = openDate ? state.nights.get(openDate) : null;
    const idea = n ? state.ideas.get(n.ideaId) : state.ideas.get(openIdea);
    if (!idea || (idea.signCustom || "") === e.target.value) return;
    if (await write("ideas/" + idea.id, { signCustom: e.target.value, signPick: -1 })) toast("Your sign is saved");
  });
  dlg.addEventListener("close", () => { openDate = null; openIdea = null; });

  // ---------- page clicks ----------
  document.addEventListener("click", async (e) => {
    if (dlg.contains(e.target)) return;
    const el = e.target.closest("[data-open],[data-done],[data-put],[data-move],[data-view]"); if (!el) return;
    if (el.dataset.put) { e.preventDefault(); const id = movingId; endMove(); await moveIdea(id, el.dataset.put); document.querySelector(`#d-${el.dataset.put} .open`)?.focus(); return; }
    if (el.dataset.open) { e.preventDefault(); if (movingId) return; openNight(el.dataset.open); }
    else if (el.dataset.done) { const n = state.nights.get(el.dataset.done); await write("nights/" + n.date, { done: true }); toast(`${short(n.date)} marked done`); }
    else if (el.dataset.move) startMove(el.dataset.move);
    else if (el.dataset.view) openIdeaOnly(el.dataset.view);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && movingId) { endMove(); say("Move cancelled"); } });

  // ---------- drag and drop ----------
  document.addEventListener("dragstart", (e) => {
    const day = e.target.closest?.(".day[draggable]"); const card = e.target.closest?.(".idea[draggable]");
    let id = null;
    if (day) id = state.nights.get(day.dataset.date)?.ideaId;
    if (card) id = card.dataset.idea;
    if (!id) return;
    e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", (e) => {
    const day = e.target.closest?.(".day"); if (!day || day.classList.contains("away")) return;
    e.preventDefault(); day.classList.add("drop-ok");
  });
  document.addEventListener("dragleave", (e) => { e.target.closest?.(".day")?.classList.remove("drop-ok"); });
  document.addEventListener("drop", async (e) => {
    const day = e.target.closest?.(".day"); const tray = e.target.closest?.("#tray");
    const id = e.dataTransfer.getData("text/plain"); if (!id) return;
    if (day && !day.classList.contains("away")) { e.preventDefault(); day.classList.remove("drop-ok"); await moveIdea(id, day.dataset.date); }
    else if (tray) { e.preventDefault(); await moveIdea(id, null); }
  });
  $("#tray").addEventListener("dragover", (e) => e.preventDefault());

  // ---------- data ----------
  function load(plan) {
    mode = window.ElfSeason?.MODES.includes(plan?.mode) ? plan.mode : (cfg.mode || "co-parenting");
    side = ["A", "B"].includes(plan?.side) ? plan.side : (cfg.schedule?.coParenting?.side || "A");
    applyMode();
    for (const name of ["nights", "ideas", "supplies"]) {
      const m = new Map();
      for (const [id, doc] of Object.entries(plan?.[name] || {})) m.set(id, { id, date: id, ...doc });
      state[name] = m;
      state.loaded[name] = true;
    }
    render();
  }
  function applyConfig() {
    const elves = cfg.elves || ["Elf 1", "Elf 2"];
    $("#elf-names").innerHTML = elves.length > 1
      ? `${esc(elves.slice(0, -1).join(", "))} <span class="amp">&amp;</span> ${esc(elves.at(-1))}`
      : esc(elves[0]);
    document.title = `${elves.join(" & ")} ${cfg.year || ""}`.trim();
    $("#eyebrow").textContent = `Elf plan · Christmas ${cfg.year || ""}`.trim();
    cfg.signedBy = cfg.signedBy || elves.join(" & ");
    if (cfg.otherHomeLabel) { TAGS.away.label = cfg.otherHomeLabel; $("#away-legend").textContent = cfg.otherHomeLabel; }
  }
  function applyMode() {
    const intro = typeof cfg.intro === "string" ? cfg.intro : cfg.intro?.[mode];
    if (intro) $("#intro").textContent = intro;
    const everyday = mode === "everyday";
    $("#legend-facetime").hidden = everyday;
    $("#away-legend").hidden = everyday;
    document.querySelectorAll('input[name="mode"]').forEach(r => { r.checked = r.value === mode; });
    document.querySelectorAll('input[name="side"]').forEach(r => { r.checked = r.value === side; });
    $("#side-row").hidden = everyday;
    $("#mode-hint").textContent = everyday
      ? "Kids are home every night. Fridays and Saturdays are Flexible nights with more time."
      : `Kids split time between two homes. This is Home ${side}'s plan: nights at the other home need no setup, switchover days have more time, and FaceTime days are when the kids call in. Each co-parent can use this planner by picking their own home.`;
  }
  function plainMap(m) { const o = {}; for (const [id, { id: _drop, ...rest }] of m) o[id] = rest; return o; }
  function rebuild(nextMode, nextSide, message) {
    if ((nextMode === mode && nextSide === side) || !window.ElfSeason) return;
    const nights = ElfSeason.buildNights(cfg.schedule, nextMode, plainMap(state.nights), plainMap(state.ideas), nextSide);
    if (!Object.keys(nights).length) { toast("config.json has no season dates, so the calendar can't be rebuilt."); applyMode(); return; }
    load({ mode: nextMode, side: nextSide, nights, ideas: plainMap(state.ideas), supplies: plainMap(state.supplies) });
    persist();
    toast(message);
  }
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
    if (r.checked) rebuild(r.value, side, `Switched to the ${MODE_LABEL[r.value]} planner`);
  }));
  document.querySelectorAll('input[name="side"]').forEach(r => r.addEventListener("change", () => {
    if (r.checked) rebuild(mode, r.value, `Showing Home ${r.value}'s nights. Ideas on nights at the other home moved to the tray.`);
  }));

  async function fetchJSON(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(url); return r.json(); }
  async function start(useSaved = true) {
    try { cfg = await fetchJSON("config.json"); } catch { cfg = {}; }
    applyConfig();
    let saved = null;
    if (useSaved) { try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { saved = null; } }
    if (saved) { load(saved); return; }
    try { load(await fetchJSON("plan.json")); }
    catch { state.loaded = { nights: true, ideas: true, supplies: true }; $("#status").textContent = "Couldn't load plan.json. Open this page from a web server, not as a file."; render(); }
  }

  $("#export").onclick = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "plan.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Plan exported as plan.json");
  };
  $("#import-file").onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const plan = JSON.parse(await file.text());
      if (!plan || typeof plan.nights !== "object") throw new Error("shape");
      load(plan); persist(); toast("Plan imported");
    } catch { toast("That file isn't a plan export. Pick a plan.json file."); }
    e.target.value = "";
  };
  $("#reset").onclick = () => { $("#reset-confirm").hidden = false; $("#reset-yes").focus(); };
  $("#reset-no").onclick = () => { $("#reset-confirm").hidden = true; $("#reset").focus(); };
  $("#reset-yes").onclick = async () => {
    try { localStorage.removeItem(STORE_KEY); } catch {}
    $("#reset-confirm").hidden = true;
    await start(false); toast("Plan reset from plan.json");
  };

  render();
  start();

  // ---------- snow ----------
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cv = $("#snow"), cx = cv.getContext("2d");
  let flakes = [], raf;
  function size() { cv.width = innerWidth; cv.height = innerHeight; }
  function seed() { flakes = Array.from({ length: Math.min(70, Math.round(innerWidth / 18)) }, () => ({ x: Math.random()*cv.width, y: Math.random()*cv.height, r: 1 + Math.random()*2.6, s: .3 + Math.random()*.8, w: Math.random()*6.28 })); }
  function tick() {
    cx.clearRect(0,0,cv.width,cv.height);
    const dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark";
    cx.fillStyle = dark ? "rgba(255,240,248,.55)" : "rgba(163,23,79,.18)";
    for (const f of flakes) { f.y += f.s; f.w += .01; f.x += Math.sin(f.w) * .3; if (f.y > cv.height) { f.y = -5; f.x = Math.random()*cv.width; } cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.28); cx.fill(); }
    raf = requestAnimationFrame(tick);
  }
  function startSnow() { cancelAnimationFrame(raf); if (reduce.matches) { cx.clearRect(0,0,cv.width,cv.height); return; } size(); seed(); tick(); }
  addEventListener("resize", () => { size(); seed(); });
  reduce.addEventListener?.("change", startSnow);
  startSnow();
})();
