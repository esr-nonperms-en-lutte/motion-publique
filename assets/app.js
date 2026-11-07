/* Site de la motion : onglets, langue, affichage de la motion et de ses sources, mur des
   structures, courriel à l'équipe, éditeur en mode révision, formulaire et envoi. */
(function () {
  const C = window.Core, CFG = window.CONFIG, $ = (id) => document.getElementById(id);
  const esc = C.esc;
  const S = { motion: null, lang: "fr", labs: [], viewLab: null, pinned: null, paras: [], editingId: null, logo: "", confirmReset: false, pasteData: null };
  const t = (k) => (window.I18N[S.lang] && window.I18N[S.lang][k]) ?? window.I18N.fr[k] ?? k;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } } };
  const fmtDate = (d, long = true) => { if (!d) return ""; const x = new Date(d + "T12:00:00"); return isNaN(x) ? "" : x.toLocaleDateString(S.lang === "fr" ? "fr-FR" : S.lang === "es" ? "es-ES" : "en-GB", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }); };
  const frDate = (d) => { if (!d) return ""; const x = new Date(d + "T12:00:00"); return isNaN(x) ? "" : x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); };

  /* Adresse du site : celle de config.js, sinon l'adresse réelle une fois en ligne (GitHub Pages). */
  function siteUrl() {
    if (CFG.siteUrl) return CFG.siteUrl;
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
    return /^https?:$/.test(location.protocol) && !local ? location.origin + location.pathname.replace(/[^/]*$/, "") : "";
  }

  /* ================= Langue ================= */
  function applyLang() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    $("langNote").hidden = !t("langNote"); $("langNote").textContent = t("langNote");
    const sel = $("fTopic"), cur = sel.value;
    sel.innerHTML = `<option value="">${esc(t("f.topic.choose"))}</option>` + window.I18N.fr.topics.map((fr, i) => `<option value="${esc(fr)}">${esc(t("topics")[i] || fr)}</option>`).join("");
    sel.value = cur;
    renderLong(); renderMail(); renderLabs(); renderViewing(); renderVotes(); updateEditCount();
    if (!$("review").hidden) review();
  }
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { S.lang = b.dataset.lang; store.set("motion-lang", S.lang); applyLang(); }));

  function renderLong() {
    const L = window.LONG.fr; // seul le français est rédigé pour l'instant
    const site = siteUrl();
    const fill = (s) => esc(s).replace(/\{\{email\}\}/g, `<span class="addr">${esc(CFG.contactEmail)}</span>`)
      .replace(/\s?\{\{site\}\}/g, site ? ` <a href="${esc(site)}">${esc(site.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : "");
    $("originText").innerHTML = L.origin.map((p) => `<p>${fill(p)}</p>`).join("");
    $("howtoText").innerHTML = L.howto.map((p) => `<p>${fill(p)}</p>`).join("");
    $("footMail").textContent = CFG.contactEmail; $("footMail").href = "mailto:" + CFG.contactEmail;
  }

  /* ================= Onglets ================= */
  const VIEWS = ["motion", "origine", "mode-emploi", "soutenir"];
  function route() {
    const h = location.hash.slice(1);
    const v = VIEWS.includes(h) ? h : "motion";
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    hideTip(true);
    if (VIEWS.includes(h)) window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", route);

  /* ================= Motion ================= */
  function labValues(lab) {
    return {
      structure: lab.structure.name, date: frDate(lab.ag.date), pour: lab.ag.pour, contre: lab.ag.contre, abst: lab.ag.abstention,
      perm_pour: lab.permanents.pour, perm_contre: lab.permanents.contre, perm_abst: lab.permanents.abstention
    };
  }
  function ctx(values) { return { values: values || {}, placeholders: S.motion.placeholders, sources: S.motion.sources }; }

  /* Rendu d'une liste de paragraphes (texte commun, version d'une structure, ou éditeur en lecture). */
  function parasHTML(paras, cx, opts = {}) {
    return paras.map((p) => {
      if (p.kind === "instruction" && (opts.hideInstruction || p.status === "deleted")) return "";
      if (p.kind === "permvote" && opts.hidePerm) return "";
      const label = p.label ? `<span class="para-label">${esc(p.label)}</span>` : "";
      let body;
      if (p.status === "deleted") body = C.renderText(p.orig, cx);
      else if (p.status === "added") body = C.renderText(p.text, cx);
      else if (p.status === "modified") body = C.renderDiff(p.orig, p.text, cx);
      else body = C.renderText(p.text, cx);
      const cls = ["para", p.kind === "added" ? "body" : p.kind, p.status].join(" ");
      return `<div class="${cls}">${label}<div class="para-body">${body}</div></div>`;
    }).join("");
  }

  function renderMotion() {
    const lab = S.viewLab;
    const paras = lab ? C.applyEdits(S.motion, lab.motion.edits) : C.baseParagraphs(S.motion);
    $("motionBody").innerHTML = parasHTML(paras, ctx(lab ? labValues(lab) : {}), { hideInstruction: !!lab, hidePerm: lab && !lab.permanents.supported });
    renderViewing();
    document.querySelectorAll(".lab").forEach((b) => b.classList.toggle("on", !!lab && b.dataset.id === lab.id));
  }
  function renderViewing() {
    const el = $("viewing"), lab = S.viewLab;
    if (!lab) { el.hidden = true; return; }
    const n = lab._edits;
    el.hidden = false; el.classList.toggle("edited", n > 0);
    el.innerHTML = `<span class="vlogo">${logoHTML(lab)}</span><span>${esc(t("motion.viewing"))} <b>${esc(lab.structure.name)}</b> · ${n ? `${n} ${esc(t("motion.edits"))}` : esc(t("motion.noEdits"))}</span><button type="button" class="linkish" id="viewBack">${esc(t("motion.back"))}</button>`;
    $("viewBack").onclick = () => { S.pinned = null; S.viewLab = null; renderMotion(); };
  }
  function renderSources() {
    $("sourceList").innerHTML = S.motion.sources.map((s) => `<li id="src-${s.n}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><div class="src-meta">${esc(s.publisher)}${s.date ? " · " + esc(fmtDate(s.date)) : ""}</div></li>`).join("");
  }

  /* ================= Info-bulles ================= */
  const tip = $("tip"); let tipAnchor = null, tipPinned = false;
  function placeTip(anchor) {
    const r = anchor.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 12);
    let y = r.top - th - 10; if (y < 70) y = r.bottom + 10;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function showTip(anchor, html, pinned = false) {
    tip.innerHTML = html; tip.hidden = false; tipAnchor = anchor; tipPinned = pinned; tip.classList.toggle("interactive", pinned); placeTip(anchor);
  }
  function hideTip(force) { if (tipPinned && !force) return; tip.hidden = true; tipAnchor = null; tipPinned = false; document.querySelectorAll(".fn.on").forEach((f) => f.classList.remove("on")); }
  function sourceTip(n) {
    const s = S.motion.sources.find((x) => String(x.n) === String(n)); if (!s) return "";
    let host = ""; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { /* url invalide */ }
    return `<span class="t-pub">${esc(s.publisher)}${s.date ? " · " + esc(fmtDate(s.date)) : ""}</span><span class="t-title">${esc(s.title)}</span><span class="t-sub">${esc(t("motion.citedFor"))} : ${esc(s.about)}</span><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(t("motion.readSource"))} · ${esc(host)} ↗</a>`;
  }
  document.addEventListener("mouseover", (e) => {
    if (tipPinned) return;
    const fn = e.target.closest(".fn"); if (fn) return showTip(fn, sourceTip(fn.dataset.fn));
    const lab = e.target.closest(".lab"); if (lab) { const L = S.labs.find((x) => x.id === lab.dataset.id); if (L) { showTip(lab, labTip(L)); if (!S.pinned) { S.viewLab = L; renderMotion(); } } }
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest(".fn, .lab"); if (!el || el.contains(e.relatedTarget)) return;
    hideTip();
    if (el.classList.contains("lab") && S.viewLab !== S.pinned) { S.viewLab = S.pinned; renderMotion(); }
  });
  document.addEventListener("focusin", (e) => { const fn = e.target.closest(".fn"); if (fn && !tipPinned) showTip(fn, sourceTip(fn.dataset.fn)); const lab = e.target.closest(".lab"); if (lab && !tipPinned) { const L = S.labs.find((x) => x.id === lab.dataset.id); if (L) showTip(lab, labTip(L)); } });
  document.addEventListener("focusout", (e) => { if (e.target.closest(".fn, .lab")) hideTip(); });
  document.addEventListener("click", (e) => {
    const fn = e.target.closest(".fn");
    if (fn) { e.preventDefault(); const was = tipPinned && tipAnchor === fn; hideTip(true); if (!was) { fn.classList.add("on"); showTip(fn, sourceTip(fn.dataset.fn), true); const li = $("src-" + fn.dataset.fn); if (li) { li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); } } return; }
    const lab = e.target.closest(".lab");
    if (lab) { const L = S.labs.find((x) => x.id === lab.dataset.id); S.pinned = S.pinned === L ? null : L; S.viewLab = S.pinned || null; renderMotion(); if (S.pinned) showTip(lab, labTip(L)); else hideTip(true); return; }
    if (!e.target.closest(".tip")) hideTip(true);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(true); });
  window.addEventListener("scroll", () => { if (tipAnchor && !tip.hidden) placeTip(tipAnchor); }, { passive: true });

  /* ================= Structures ================= */
  function logoHTML(lab) { return lab.logo ? `<img src="${esc(lab.logo)}" alt="">` : C.catSVG(lab.structure.acronym || lab.structure.name); }
  function topicLabel(fr) { const i = window.I18N.fr.topics.indexOf(fr); return i >= 0 ? (t("topics")[i] || fr) : fr; }
  function labTip(L) {
    const [p, a, c] = C.pct(L.ag.pour, L.ag.abstention, L.ag.contre), s = L.structure;
    const where = [s.department, s.institution].filter(Boolean).join(" · "), place = [s.city, s.country].filter(Boolean).join(", ");
    const perm = L.permanents.supported ? (() => { const q = C.pct(L.permanents.pour, L.permanents.abstention, L.permanents.contre); return `${esc(t("labs.perm.yes"))}${L.permanents.pour ? ` (${q[0]} % ${esc(t("labs.for").toLowerCase())})` : ""}`; })() : esc(t("labs.perm.no"));
    return `<b>${esc(s.acronym ? s.acronym + " · " : "")}${esc(s.name)}</b>${where ? `<span class="t-sub">${esc(where)}</span>` : ""}<span class="t-sub">${esc(place)}${s.topic ? " · " + esc(topicLabel(s.topic)) : ""}</span>
      <span>${esc(t("labs.agOn"))} ${esc(fmtDate(L.ag.date))}</span>
      <div class="votebar"><i class="v-pour" style="width:${p}%"></i><i class="v-abs" style="width:${a}%"></i><i class="v-contre" style="width:${c}%"></i></div>
      <div class="t-nums"><span>${esc(t("labs.for"))} ${p} %</span><span>${esc(t("labs.abst"))} ${a} %</span><span>${esc(t("labs.against"))} ${c} %</span></div>
      <span class="t-sub">${perm}</span>${L._edits ? `<span class="t-edit">${L._edits} ${esc(t("labs.changes"))}</span>` : ""}`;
  }
  function renderLabs() {
    const wall = $("labWall"); if (!wall) return;
    if (S.labsState === "loading") { wall.innerHTML = `<p class="empty">${esc(t("labs.loading"))}</p>`; return; }
    if (S.labsState === "error" && !S.labs.length) { wall.innerHTML = `<p class="empty">${esc(t("labs.loadError"))}</p>`; return; }
    if (!S.labs.length) { wall.innerHTML = `<p class="empty">${esc(t("labs.empty"))}</p><a class="btn ghost" href="#soutenir">${esc(t("step3.go"))}</a>`; return; }
    const key = $("groupBy").value;
    const groups = new Map();
    for (const L of S.labs) { const g = key === "none" ? "" : (L.structure[key] || t("labs.unknown")); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(L); }
    const sorted = [...groups.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
    wall.innerHTML = sorted.map(([g, list]) => `<div class="lab-group">${key !== "none" ? `<h4>${esc(key === "topic" ? topicLabel(g) : g)}<span>${list.length}</span></h4>` : ""}<div class="logos">${list.map((L) =>
      `<button type="button" class="lab${L._edits ? " edited" : ""}${S.viewLab === L ? " on" : ""}" data-id="${esc(L.id)}" aria-label="${esc(L.structure.name)}">${logoHTML(L)}</button>`).join("")}</div></div>`).join("");
    $("statLabs").textContent = S.labs.length;
    $("statVoters").textContent = S.labs.reduce((n, L) => n + L.ag.pour, 0).toLocaleString("fr-FR");
  }
  $("groupBy").addEventListener("change", () => { store.set("motion-group", $("groupBy").value); renderLabs(); });

  async function loadLabs() {
    S.labsState = "loading"; renderLabs();
    const demo = new URLSearchParams(location.search).has("demo");
    const base = demo ? "exemples/" : "labs/";
    let files = null;
    try {
      const r = await fetch(base + "index.json", { cache: "no-cache" });
      if (r.ok) { const j = await r.json(); files = (Array.isArray(j) ? j : j.files || []).filter((f) => typeof f === "string" && /^[\w.-]+\.json$/.test(f) && f !== "index.json").map((f) => base + f); }
    } catch (e) { /* pas d'index */ }
    if (!files && !demo && CFG.github && CFG.github.owner && CFG.github.repo) {
      try {
        const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(CFG.github.owner)}/${encodeURIComponent(CFG.github.repo)}/contents/labs?ref=${encodeURIComponent(CFG.github.branch || "main")}`);
        if (r.ok) files = (await r.json()).filter((f) => f.type === "file" && /\.json$/.test(f.name) && f.name !== "index.json").map((f) => f.download_url);
      } catch (e) { /* API indisponible */ }
    }
    if (!files) { S.labsState = files === null && !demo ? "ok" : "error"; S.labs = []; renderLabs(); return; }
    const out = await Promise.all(files.map(async (u) => { try { const r = await fetch(u, { cache: "no-cache" }); return r.ok ? r.json() : null; } catch (e) { return null; } }));
    S.labs = out.map((raw) => raw && C.validateLab(raw, S.motion).lab).filter(Boolean);
    const seen = new Set(); S.labs = S.labs.filter((L) => (seen.has(L.id) ? false : seen.add(L.id)));
    S.labs.forEach((L) => (L._edits = C.editCount(C.applyEdits(S.motion, L.motion.edits))));
    S.labs.sort((a, b) => (b.ag.date || "").localeCompare(a.ag.date || ""));
    S.labsState = "ok"; renderLabs();
  }

  /* ================= Courriel à l'équipe ================= */
  function mailText() {
    const L = window.LONG.fr;
    const team = C.cleanLine($("mTeam").value, 80) || "l’équipe";
    const deadline = $("mDeadline").value ? "le " + frDate($("mDeadline").value) : "la fin de la semaine";
    const name = C.cleanLine($("mName").value, 60) || "[Votre prénom]";
    const site = siteUrl();
    let body = L.mail.replace("{{team}}", team).replace("{{deadline}}", deadline).replace("{{name}}", name);
    body = site ? body.replace("{{site}}", site) : body.replace(/[^\n]*\{\{site\}\}[^\n]*\n\n/, "");
    return { subject: L.mailSubject, body };
  }
  function renderMail() { const m = mailText(); $("mailSubject").textContent = m.subject; $("mailBody").textContent = m.body; }
  ["mName", "mTeam", "mDeadline"].forEach((id) => $(id).addEventListener("input", renderMail));
  $("mailMake").addEventListener("click", () => { const m = mailText(); location.href = `mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`; });
  $("mailCopy").addEventListener("click", () => { const m = mailText(); copy(`${m.subject}\n\n${m.body}`, $("mailToast"), $("mailBody")); });
  const FILES = [["downloads/motion-fr.pdf", "application/pdf"], ["downloads/motion-fr.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["downloads/motion-fr.txt", "text/plain"]];
  try { if (navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.txt", { type: "text/plain" })] })) $("mailShare").hidden = false; } catch (e) { /* partage indisponible */ }
  $("mailShare").addEventListener("click", async () => {
    try {
      const files = await Promise.all(FILES.map(async ([u, type]) => new File([await (await fetch(u)).blob()], u.split("/").pop(), { type })));
      const m = mailText();
      await navigator.share({ title: m.subject, text: m.body, files });
    } catch (e) { if (e && e.name !== "AbortError") { $("mailToast").textContent = e.message || ""; } }
  });

  async function copy(text, toastEl, fallbackEl) {
    try { await navigator.clipboard.writeText(text); toastEl.textContent = t("copied"); }
    catch (e) { if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toastEl.textContent = t("copyFail"); }
    setTimeout(() => (toastEl.textContent = ""), 3500);
  }

  /* ================= Éditeur en mode révision ================= */
  function formValues() {
    return {
      structure: C.cleanLine($("fName").value, 160), date: frDate($("fDate").value),
      pour: $("fPour").value === "" ? "" : C.int($("fPour").value), contre: $("fContre").value === "" ? "" : C.int($("fContre").value), abst: $("fAbst").value === "" ? "" : C.int($("fAbst").value),
      perm_pour: $("fPermPour").value === "" ? "" : C.int($("fPermPour").value), perm_contre: $("fPermContre").value === "" ? "" : C.int($("fPermContre").value), perm_abst: $("fPermAbst").value === "" ? "" : C.int($("fPermAbst").value)
    };
  }
  function paraBody(p, cx) {
    if (p.status === "deleted") return C.renderText(p.orig, cx);
    if (p.status === "added") return p.text ? C.renderText(p.text, cx) : `<span class="ph">${esc(t("s.edit.newPara"))}</span>`;
    if (p.status === "modified") return C.renderDiff(p.orig, p.text, cx);
    return C.renderText(p.text, cx);
  }
  function renderEditor() {
    const ta = document.querySelector("#editor textarea");
    const keep = ta && document.activeElement === ta ? { id: ta.dataset.id, s: ta.selectionStart, e: ta.selectionEnd } : null;
    const cx = ctx(formValues()), perm = $("fPerm").checked;
    $("editor").innerHTML = S.paras.map((p) => {
      const label = p.label ? `<span class="para-label">${esc(p.label)}</span>` : "";
      if (p.kind === "instruction") {
        if (p.status === "deleted") return `<div class="para instruction deleted" data-id="${p.id}"><span class="para-label">${esc(t("s.edit.instruction"))}</span><div class="para-tools"><button type="button" class="linkish" data-act="restore">${esc(t("s.edit.restore"))}</button></div></div>`;
        return `<div class="para instruction" data-id="${p.id}"><span class="para-label">⚠ ${esc(t("s.edit.instruction"))}</span><div class="para-body">${C.renderText(p.text, cx)}</div><div class="para-tools"><button type="button" class="linkish red" data-act="delete">${esc(t("s.edit.removeInstruction"))}</button></div></div>`;
      }
      if (p.kind === "vote" || p.kind === "permvote") {
        const off = p.kind === "permvote" && !perm;
        return `<div class="para ${p.kind}${off ? " excluded" : ""}" data-id="${p.id}">${label}<div class="para-body">${C.renderText(p.text, cx)}</div><span class="auto-note">${esc(off ? t("s.edit.notIncluded") : t("s.edit.auto"))}</span></div>`;
      }
      const editing = S.editingId === p.id;
      const n = p.status === "modified" ? C.countChanges(p.orig, p.text) : 0;
      const tools = S.mode === "edit" ? `<div class="para-tools">
          ${p.status !== "deleted" ? `<button type="button" class="linkish" data-act="${editing ? "done" : "edit"}">${esc(t(editing ? "s.edit.done" : "s.edit.modify"))}</button>` : ""}
          ${p.status === "modified" ? `<button type="button" class="linkish" data-act="revert">${esc(t("s.edit.revert"))}</button>` : ""}
          ${p.status === "deleted" ? `<button type="button" class="linkish" data-act="restore">${esc(t("s.edit.restore"))}</button>` : `<button type="button" class="linkish red" data-act="delete">${esc(t("s.edit.delete"))}</button>`}
          ${p.status !== "deleted" ? `<button type="button" class="linkish" data-act="insert">${esc(t("s.edit.insert"))}</button>` : ""}
          ${n ? `<span class="count">${n} ${esc(t("s.edit.count"))}</span>` : ""}</div>` : "";
      const area = editing ? `<textarea data-id="${p.id}" aria-label="${esc(p.label || t("s.edit.newPara"))}" maxlength="6000">${esc(C.toEditable(p.text, S.motion))}</textarea>` : "";
      return `<div class="para body ${p.status}${editing ? " editing" : ""}" data-id="${p.id}">${label}<div class="para-body">${paraBody(p, cx)}</div>${area}${tools}</div>`;
    }).join("");
    const nta = document.querySelector("#editor textarea");
    if (nta) { autosize(nta); if (keep && keep.id === nta.dataset.id) { nta.focus(); nta.setSelectionRange(keep.s, keep.e); } }
    updateEditCount();
  }
  function autosize(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 4, 600) + "px"; }
  function updateEditCount() {
    if (!S.paras.length) return;
    const n = C.editCount(S.paras);
    $("editCount").innerHTML = n ? `<b>${n}</b> ${esc(t("s.edit.count"))}` : esc(t("summary.noEdits"));
    document.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === (S.mode === "same" && n ? "edit" : S.mode))));
  }
  $("editor").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const id = btn.closest(".para").dataset.id, i = S.paras.findIndex((p) => p.id === id), p = S.paras[i];
    const act = btn.dataset.act;
    if (act === "edit") S.editingId = id;
    if (act === "done") S.editingId = null;
    if (act === "revert") { p.text = p.orig; p.status = "same"; }
    if (act === "delete") { if (p.status === "added") S.paras.splice(i, 1); else p.status = "deleted"; if (S.editingId === id) S.editingId = null; }
    if (act === "restore") p.status = p.text === p.orig ? "same" : "modified";
    if (act === "insert") { const nid = "ajout-" + Date.now().toString(36); let j = i; while (S.paras[j + 1] && S.paras[j + 1].kind === "added") j++; S.paras.splice(j + 1, 0, { id: nid, kind: "added", label: "", orig: "", text: "", status: "added", after: p.kind === "added" ? p.after : p.id }); S.editingId = nid; }
    renderEditor(); saveDraft();
    if (act === "edit" || act === "insert") { const ta = document.querySelector("#editor textarea"); if (ta) ta.focus(); }
  });
  $("editor").addEventListener("input", (e) => {
    const ta = e.target.closest("textarea"); if (!ta) return;
    const p = S.paras.find((x) => x.id === ta.dataset.id); if (!p) return;
    p.text = C.fromEditable(ta.value, S.motion);
    if (p.status !== "added") p.status = p.text === p.orig ? "same" : "modified";
    const node = ta.closest(".para");
    node.querySelector(".para-body").innerHTML = paraBody(p, ctx(formValues()));
    node.className = `para body ${p.status} editing`;
    const n = p.status === "modified" ? C.countChanges(p.orig, p.text) : 0;
    let cnt = node.querySelector(".count");
    if (n) { if (!cnt) { cnt = document.createElement("span"); cnt.className = "count"; node.querySelector(".para-tools").appendChild(cnt); } cnt.textContent = `${n} ${t("s.edit.count")}`; } else if (cnt) cnt.remove();
    autosize(ta); updateEditCount(); saveDraft();
  });
  /* Modes */
  document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  function setMode(m) {
    if (m === "same" && C.editCount(S.paras) > 0 && !S.confirmReset) {
      S.confirmReset = true;
      const bar = document.createElement("div"); bar.className = "row"; bar.id = "resetBar";
      bar.innerHTML = `<span class="small">${C.editCount(S.paras)} ${esc(t("s.edit.count"))} →</span><button type="button" class="btn red" id="resetYes">${esc(t("s.edit.revert"))}</button><button type="button" class="btn ghost" id="resetNo">${esc(t("paste.cancel"))}</button>`;
      $("editCount").after(bar);
      $("resetYes").onclick = () => { S.paras = freshParas(true); S.confirmReset = false; bar.remove(); S.mode = "same"; S.editingId = null; $("pastePanel").hidden = true; renderEditor(); saveDraft(); };
      $("resetNo").onclick = () => { S.confirmReset = false; bar.remove(); };
      return;
    }
    S.mode = m; S.editingId = null;
    $("pastePanel").hidden = m !== "paste";
    if (m === "paste") { $("pasteResult").hidden = true; $("pasteBox").focus(); }
    renderEditor(); saveDraft();
  }
  function freshParas(keepInstructionState) {
    const old = S.paras.find((p) => p.kind === "instruction");
    const ps = C.baseParagraphs(S.motion);
    if (keepInstructionState && old && old.status === "deleted") ps.find((p) => p.kind === "instruction").status = "deleted";
    return ps;
  }

  /* ================= Texte collé ================= */
  $("pasteCancel").addEventListener("click", () => { $("pasteBox").value = ""; setMode(C.editCount(S.paras) ? "edit" : "same"); });
  $("pasteCompare").addEventListener("click", () => {
    const raw = $("pasteBox").value;
    $("pasteErr").textContent = raw.trim() ? "" : t("paste.empty");
    if (!raw.trim()) return;
    const res = C.comparePasted(raw, S.motion);
    S.pasteData = res;
    const preview = C.applyEdits(S.motion, res.paragraphs.filter((p) => p.status !== "same"));
    const cx = ctx(Object.assign(formValues(), cleanFills(res.fills)));
    const changed = preview.filter((p) => p.status !== "same" && p.kind !== "instruction");
    const instr = res.paragraphs.find((p) => p.id === "consigne");
    const det = describeFills(res.fills);
    $("pasteResult").hidden = false;
    $("pasteResult").innerHTML = `<div class="paste-result">
      <h4>${esc(changed.length ? t("paste.question") : t("paste.none"))}</h4>
      ${det ? `<div><span class="small-h">${esc(t("paste.detected"))}</span><div class="detected">${det}</div></div>` : ""}
      ${changed.map((p) => `<div class="paste-item"><span class="para-label">${esc(p.status === "added" ? t("paste.added") : p.status === "deleted" ? `${p.label} · ${t("paste.deleted")}` : p.label)}</span>${p.status === "added" ? `<ins class="rev">${C.renderText(p.text, cx)}</ins>` : p.status === "deleted" ? `<del class="rev">${C.renderText(p.orig, cx)}</del>` : C.renderDiff(p.orig, p.text, cx)}</div>`).join("")}
      <div class="row"><button type="button" class="btn" id="pasteYes">${esc(t("paste.confirm"))}</button>${changed.length ? `<button type="button" class="btn ghost" id="pasteFix">${esc(t("paste.fix"))}</button>` : ""}</div></div>`;
    $("pasteYes").onclick = () => applyPaste(false, instr);
    if ($("pasteFix")) $("pasteFix").onclick = () => applyPaste(true, instr);
  });
  function cleanFills(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) if (!k.startsWith("__")) o[k] = C.cleanLine(v, 160); return o; }
  function describeFills(f) {
    const parts = [];
    if (f.structure) parts.push(`<span>${esc(t("f.name"))} : <b>${esc(C.cleanLine(f.structure, 160))}</b></span>`);
    if (f.date) parts.push(`<span>${esc(t("f.date"))} : <b>${esc(C.cleanLine(f.date, 60))}</b></span>`);
    if (f.pour || f.contre || f.abst) parts.push(`<span>AG : <b>${esc(f.pour || "?")} / ${esc(f.contre || "?")} / ${esc(f.abst || "?")}</b></span>`);
    if (f.__perm) parts.push(`<span>${esc(t("s.perm"))} : <b>${esc(f.perm_pour || "?")} / ${esc(f.perm_contre || "?")} / ${esc(f.perm_abst || "?")}</b></span>`);
    return parts.join("");
  }
  function parseFrDate(s) {
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    let m = String(s).toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/);
    if (m) { const mi = months.indexOf(m[2]); if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = String(s).match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  }
  function applyPaste(openEditors, instr) {
    const res = S.pasteData; if (!res) return;
    const keepInstr = instr && instr.status !== "deleted";
    S.paras = C.applyEdits(S.motion, res.paragraphs.filter((p) => p.status !== "same"));
    const ins = S.paras.find((p) => p.kind === "instruction"); if (ins && !keepInstr) ins.status = "deleted";
    const f = res.fills, setIf = (id, v) => { if (v !== undefined && v !== "" && !$(id).value) $(id).value = v; };
    setIf("fName", f.structure && C.cleanLine(f.structure, 160));
    setIf("fDate", f.date && parseFrDate(f.date));
    const num = (v) => (v === undefined ? undefined : (String(v).match(/\d+/) || [""])[0]);
    setIf("fPour", num(f.pour)); setIf("fContre", num(f.contre)); setIf("fAbst", num(f.abst));
    if (f.__perm) { $("fPerm").checked = true; $("permFields").hidden = false; setIf("fPermPour", num(f.perm_pour)); setIf("fPermContre", num(f.perm_contre)); setIf("fPermAbst", num(f.perm_abst)); }
    S.mode = "edit"; S.editingId = openEditors ? (S.paras.find((p) => p.status === "modified" || p.status === "added") || {}).id || null : null;
    $("pastePanel").hidden = true; $("pasteBox").value = ""; S.pasteData = null;
    renderVotes(); renderEditor(); saveDraft();
    $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ================= Formulaire ================= */
  function renderVotes() {
    const bar = (ids, barId, legId) => {
      const [a, b, c] = ids.map((id) => C.int($(id).value)); const [p, q, r] = C.pct(a, c, b); const tot = a + b + c;
      const el = $(barId).children; el[0].style.width = p + "%"; el[1].style.width = q + "%"; el[2].style.width = r + "%";
      $(legId).innerHTML = `<span>${esc(t("f.for"))} <b>${p} %</b></span><span>${esc(t("f.abst"))} <b>${q} %</b></span><span>${esc(t("f.against"))} <b>${r} %</b></span><span>${tot} ${esc(t("f.voters"))}</span>`;
    };
    bar(["fPour", "fContre", "fAbst"], "voteBar", "voteLegend");
    bar(["fPermPour", "fPermContre", "fPermAbst"], "permBar", "permLegend");
  }
  const FIELDS = ["fName", "fAcronym", "fInstitution", "fDepartment", "fCity", "fCountry", "fTopic", "fDate", "fPour", "fContre", "fAbst", "fPermPour", "fPermContre", "fPermAbst", "fContact"];
  $("labForm").addEventListener("input", (e) => {
    if (e.target.closest("#editor") || e.target.id === "pasteBox") return;
    if (e.target.id === "fPerm") $("permFields").hidden = !e.target.checked;
    renderVotes();
    if (["fName", "fDate", "fPour", "fContre", "fAbst", "fPerm", "fPermPour", "fPermContre", "fPermAbst"].includes(e.target.id)) renderEditor();
    if (e.target.id === "fName" || e.target.id === "fAcronym") renderLogo();
    saveDraft();
  });
  $("fPerm").addEventListener("change", () => { $("permFields").hidden = !$("fPerm").checked; renderEditor(); saveDraft(); });

  /* Logo : ré-encodé en JPEG 256 px par le navigateur, ce qui neutralise tout contenu caché. */
  function renderLogo() {
    $("logoPrev").innerHTML = S.logo ? `<img src="${esc(S.logo)}" alt="">` : C.catSVG(C.cleanLine($("fAcronym").value) || C.cleanLine($("fName").value) || "?");
    $("logoRemove").hidden = !S.logo;
  }
  $("fLogo").addEventListener("change", async () => {
    const file = $("fLogo").files[0]; $("logoErr").textContent = "";
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 15e6) { $("logoErr").textContent = t("f.logo.error"); $("fLogo").value = ""; return; }
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = 0.88, data = cv.toDataURL("image/jpeg", q);
      while (data.length > 200000 && q > 0.4) { q -= 0.1; data = cv.toDataURL("image/jpeg", q); }
      S.logo = data; renderLogo(); saveDraft();
    } catch (e) { $("logoErr").textContent = t("f.logo.error"); }
    $("fLogo").value = "";
  });
  $("logoRemove").addEventListener("click", () => { S.logo = ""; renderLogo(); saveDraft(); });

  /* Brouillon local */
  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const f = {}; FIELDS.forEach((id) => (f[id] = $(id).value)); f.fPerm = $("fPerm").checked;
      store.set("motion-draft", { v: S.motion.version, f, logo: S.logo, mode: S.mode, edits: C.editsFromState(S.paras) });
    }, 300);
  }
  function loadDraft() {
    const d = store.get("motion-draft");
    if (!d || d.v !== S.motion.version) return;
    FIELDS.forEach((id) => { if (d.f && typeof d.f[id] === "string") $(id).value = d.f[id]; });
    $("fPerm").checked = !!(d.f && d.f.fPerm); $("permFields").hidden = !$("fPerm").checked;
    if (typeof d.logo === "string" && /^data:image\/jpeg;base64,/.test(d.logo)) S.logo = d.logo;
    const v = C.validateLab({ structure: { name: "x" }, ag: { pour: 1 }, motion: { edits: d.edits || [] } }, S.motion).lab;
    if (v) { S.paras = C.applyEdits(S.motion, v.motion.edits); }
    S.mode = d.mode === "edit" ? "edit" : "same";
  }

  /* ================= Vérification et envoi ================= */
  function collect() {
    const v = (id, n) => C.cleanLine($(id).value, n);
    return {
      schema: 1,
      id: `${C.slug(v("fAcronym", 30) || v("fName", 160))}-${$("fDate").value || "sans-date"}`,
      submitted_at: new Date().toISOString(),
      structure: { name: v("fName", 160), acronym: v("fAcronym", 30), institution: v("fInstitution", 160), department: v("fDepartment", 160), city: v("fCity", 80), country: v("fCountry", 80), topic: v("fTopic", 80) },
      logo: S.logo,
      ag: { date: /^\d{4}-\d{2}-\d{2}$/.test($("fDate").value) ? $("fDate").value : "", pour: C.int($("fPour").value), contre: C.int($("fContre").value), abstention: C.int($("fAbst").value) },
      permanents: { supported: $("fPerm").checked, pour: $("fPerm").checked ? C.int($("fPermPour").value) : 0, contre: $("fPerm").checked ? C.int($("fPermContre").value) : 0, abstention: $("fPerm").checked ? C.int($("fPermAbst").value) : 0 },
      motion: { base_version: S.motion.version, edits: C.editsFromState(S.paras).filter((e) => e.id !== "consigne") }
    };
  }
  $("labForm").addEventListener("submit", (e) => { e.preventDefault(); review(); });
  function review() {
    S.editingId = null; renderEditor();
    const d = collect();
    const missing = [];
    const need = [["fName", "f.name"], ["fInstitution", "f.institution"], ["fCity", "f.city"], ["fCountry", "f.country"], ["fTopic", "f.topic"], ["fDate", "f.date"]];
    need.forEach(([id, k]) => { if (!$(id).value.trim()) missing.push({ id, text: t(k) }); });
    if (!d.ag.pour) missing.push({ id: "fPour", text: t("warn.noFor") });
    const warns = [];
    const instr = S.paras.find((p) => p.kind === "instruction");
    if (instr && instr.status !== "deleted") warns.push({ text: t("warn.instruction"), act: "instr", label: t("s.edit.removeInstruction") });
    if (d.permanents.supported && !(d.permanents.pour + d.permanents.contre + d.permanents.abstention)) warns.push({ text: t("warn.permMissing"), act: "perm", label: t("submit.back") });
    const edited = S.paras.filter((p) => (p.status === "modified" || p.status === "added" || p.status === "deleted") && p.kind !== "instruction");
    const cx = ctx(formValues());
    const [p, a, c] = C.pct(d.ag.pour, d.ag.abstention, d.ag.contre);
    const blocked = missing.length > 0 || warns.some((w) => w.act === "instr");
    const el = $("review"); el.hidden = false; $("sent").hidden = true;
    el.innerHTML = `<h2>${esc(t("submit.review"))}</h2>
      ${missing.length ? `<div><span class="small-h">${esc(t("submit.missing"))}</span><ul class="checklist">${missing.map((m) => `<li>${esc(m.text)} <button type="button" class="linkish" data-goto="${m.id}">→</button></li>`).join("")}</ul></div>` : ""}
      ${warns.length ? `<div><span class="small-h">${esc(t("submit.warnings"))}</span><ul class="checklist warn">${warns.map((w) => `<li>${esc(w.text)} <button type="button" class="linkish" data-fix="${w.act}">${esc(w.label)}</button></li>`).join("")}</ul></div>` : ""}
      ${!missing.length && !warns.length ? `<p class="toast">${esc(t("submit.ready"))}</p>` : ""}
      <div class="summary-card"><span class="logo-prev">${S.logo ? `<img src="${esc(S.logo)}" alt="">` : C.catSVG(d.structure.acronym || d.structure.name || "?")}</span>
        <div class="meta"><b>${esc(d.structure.name || "—")}</b>${esc([d.structure.institution, d.structure.city, d.structure.country].filter(Boolean).join(" · "))}<br>${esc(t("labs.agOn"))} ${esc(fmtDate(d.ag.date) || "—")} · ${esc(t("labs.for"))} ${p} % · ${esc(t("labs.abst"))} ${a} % · ${esc(t("labs.against"))} ${c} %</div></div>
      <div><span class="small-h">${esc(t("summary.edits"))}</span>
        ${edited.length ? edited.map((q) => `<div class="paste-item" style="margin-top:10px"><span class="para-label">${esc(q.label || t("paste.added"))}</span>${q.status === "added" ? `<ins class="rev">${C.renderText(q.text, cx)}</ins>` : q.status === "deleted" ? `<del class="rev">${C.renderText(q.orig, cx)}</del>` : C.renderDiff(q.orig, q.text, cx)}</div>`).join("") : `<p class="muted" style="margin:6px 0 0">${esc(t("summary.noEdits"))}</p>`}</div>
      <div class="row"><button type="button" class="btn big" id="sendBtn" ${blocked ? "disabled" : ""}>${esc(t("submit.send"))}</button><button type="button" class="btn ghost" id="backBtn">${esc(t("submit.back"))}</button></div>`;
    el.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => { $(b.dataset.goto).focus(); $(b.dataset.goto).scrollIntoView({ block: "center", behavior: "smooth" }); }));
    el.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = () => {
      if (b.dataset.fix === "instr") { instr.status = "deleted"; renderEditor(); saveDraft(); review(); }
      else { $("fPermPour").focus(); $("fPermPour").scrollIntoView({ block: "center", behavior: "smooth" }); }
    }));
    $("backBtn").onclick = () => { el.hidden = true; $("labForm").scrollIntoView({ behavior: "smooth" }); };
    $("sendBtn").onclick = () => send(d);
    el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true });
  }

  function plainText(d) {
    const s = d.structure, [p, a, c] = C.pct(d.ag.pour, d.ag.abstention, d.ag.contre);
    const contact = C.cleanLine($("fContact").value, 160);
    const paras = C.applyEdits(S.motion, d.motion.edits);
    const vals = labValues(d);
    const fillPh = (txt) => txt.replace(/\{\{(\w+)\}\}/g, (m, k) => (vals[k] !== undefined && vals[k] !== "" ? String(vals[k]) : S.motion.placeholders[k] || m)).replace(/\[\^(\d+)\]/g, "[$1]");
    const diffPlain = (o, n) => C.diff(o, n).map((g) => { const x = fillPh(g.toks.join("")); return g.type === "eq" ? x : g.type === "del" ? `[-${x}-]` : `{+${x}+}`; }).join("");
    const changes = paras.filter((q) => q.kind !== "instruction" && q.status !== "same").map((q) =>
      `• ${q.label || "Paragraphe ajouté"} (${q.status === "modified" ? "modifié" : q.status === "deleted" ? "supprimé" : "ajouté"})\n${q.status === "modified" ? diffPlain(q.orig, q.text) : fillPh(q.status === "deleted" ? q.orig : q.text)}`);
    const final = paras.filter((q) => q.status !== "deleted" && q.kind !== "instruction" && (q.kind !== "permvote" || d.permanents.supported)).map((q) => fillPh(q.text)).join("\n\n");
    return [
      `Nouvelle structure signataire : ${s.name}${s.acronym && s.acronym !== s.name ? " (" + s.acronym + ")" : ""}`,
      `Établissement : ${s.institution}${s.department ? " · " + s.department : ""}`,
      `Lieu : ${s.city}, ${s.country} · Thématique : ${s.topic}`,
      `AG des non-permanent·es du ${frDate(d.ag.date)} : ${d.ag.pour} pour (${p} %), ${d.ag.contre} contre (${c} %), ${d.ag.abstention} abstention(s) (${a} %)`,
      `Permanent·es : ${d.permanents.supported ? `soutien voté (${d.permanents.pour} pour, ${d.permanents.contre} contre, ${d.permanents.abstention} abstention(s))` : "pas de vote"}`,
      `Logo : ${d.logo ? "fourni (dans le JSON)" : "non fourni"}`,
      `Contact (non publié) : ${contact || "non renseigné"}`,
      "",
      `=== Modifications (${changes.length}) — [-supprimé-] {+ajouté+} ===`,
      changes.length ? changes.join("\n\n") : "Aucune : texte commun.",
      "",
      "=== Motion telle que votée ===",
      final,
      "",
      `Fichier à déposer après vérification : labs/${d.id}.json (copier le JSON ci-dessous)`
    ].join("\n");
  }

  function download(name, text, type) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* Fichier texte joint au courriel : résumé lisible + JSON complet entre deux repères. */
  const JSON_START = "----- DÉBUT DU JSON -----", JSON_END = "----- FIN DU JSON -----";
  function submissionFile(d) {
    return `${plainText(d)}\n\n${JSON_START}\n${JSON.stringify(d, null, 2)}\n${JSON_END}\n`;
  }
  function submissionMail(d, fileName) {
    const s = d.structure, [p] = C.pct(d.ag.pour, d.ag.abstention, d.ag.contre);
    const subject = `Soumission de notre soutien pour la motion – ${s.acronym || s.name}`;
    const body = [
      "Bonjour,", "",
      `Les non-permanent·es de ${s.name}${s.acronym && s.acronym !== s.name ? " (" + s.acronym + ")" : ""} ont voté la motion en AG le ${frDate(d.ag.date)} (${d.ag.pour} pour, ${d.ag.contre} contre, ${d.ag.abstention} abstention(s), soit ${p} % pour) et souhaitent la soutenir publiquement sur le site.`, "",
      "Vous trouverez en pièce jointe :",
      `- le fichier ${fileName}, avec toutes les informations du formulaire ;`,
      "- le PDF de la motion votée.", "",
      "Bien cordialement,"
    ].join("\n");
    return { subject, body, href: `mailto:${CFG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
  }

  function send(d) {
    const fileName = `soutien-motion-${d.id}.txt`;
    const file = submissionFile(d), mail = submissionMail(d, fileName);
    download(fileName, file, "text/plain;charset=utf-8");
    setTimeout(() => { location.href = mail.href; }, 600);
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([file], fileName, { type: "text/plain" })] })); } catch (e) { /* partage indisponible */ }
    const el = $("sent"); $("review").hidden = true; el.hidden = false;
    el.innerHTML = `<h2>${esc(t("sent.title"))}</h2><p class="thanks">${esc(t("sent.body"))}</p>
      <h3>${esc(t("sent.lede"))}</h3>
      <ol class="send-steps">
        <li>${esc(t("sent.step1"))} <span class="addr">${esc(CFG.contactEmail)}</span>.</li>
        <li>${esc(t("sent.step2"))} <b>${esc(fileName)}</b>${esc(t("sent.step2b"))}</li>
        <li>${esc(t("sent.step3"))}</li>
      </ol>
      <div class="row">
        <a class="btn" id="reopenMail" href="${esc(mail.href)}">${esc(t("sent.reopen"))}</a>
        <button type="button" class="btn ghost" id="redownload">${esc(t("sent.redownload"))}</button>
        ${canShare ? `<button type="button" class="btn ghost" id="shareFile">${esc(t("sent.share"))}</button>` : ""}
      </div>
      <div class="mail-preview">
        <div class="mail-subject"><span class="muted">${esc(t("sent.to"))}</span> <span class="addr">${esc(CFG.contactEmail)}</span><br><span class="muted">${esc(t("sent.subject"))}</span> ${esc(mail.subject)}</div>
        <pre id="sentMailBody">${esc(mail.body)}</pre>
      </div>
      <p class="muted small" style="margin:0">${esc(t("sent.noMail"))}</p>
      <div class="row"><button type="button" class="btn ghost" id="copyMail2">${esc(t("sent.copyMail"))}</button><span class="toast" id="sentToast" role="status"></span></div>
      <div class="row"><button type="button" class="linkish" id="again">${esc(t("sent.again"))}</button></div>`;
    $("redownload").onclick = () => download(fileName, file, "text/plain;charset=utf-8");
    $("copyMail2").onclick = () => copy(`${CFG.contactEmail}\n${mail.subject}\n\n${mail.body}`, $("sentToast"), $("sentMailBody"));
    if (canShare) $("shareFile").onclick = async () => {
      try { await navigator.share({ title: mail.subject, text: mail.body, files: [new File([file], fileName, { type: "text/plain" })] }); }
      catch (e) { /* partage annulé */ }
    };
    $("again").onclick = () => { try { localStorage.removeItem("motion-draft"); } catch (e) { /* rien */ } location.reload(); };
    el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true });
  }

  /* ================= Démarrage ================= */
  async function init() {
    S.lang = ["fr", "en", "es"].includes(store.get("motion-lang")) ? store.get("motion-lang") : "fr";
    const g = store.get("motion-group"); if (g) $("groupBy").value = g;
    try { S.motion = await (await fetch("content/motion.fr.json")).json(); }
    catch (e) { $("motionBody").innerHTML = `<p class="err">Le texte de la motion n’a pas pu être chargé (content/motion.fr.json).</p>`; return; }
    $("motionTitle").textContent = S.motion.title;
    S.paras = C.baseParagraphs(S.motion); S.mode = "same";
    loadDraft();
    renderSources(); renderMotion(); renderLogo(); renderEditor(); renderVotes();
    applyLang(); route();
    loadLabs();
  }
  init();
})();
