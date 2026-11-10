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
    document.title = t("brand");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    document.querySelectorAll(".lang-note").forEach((el) => (el.hidden = !t("langNote")));
    const sel = $("fTopic"), cur = sel.value;
    /* Thématiques triées par ordre alphabétique dans la langue affichée ; « Autre » reste en dernier.
       Les listes de i18n.js gardent le même ordre d'une langue à l'autre : c'est ce qui les relie. */
    const frTopics = window.I18N.fr.topics, other = frTopics.length - 1;
    const opts = frTopics.map((fr, i) => ({ fr, label: t("topics")[i] || fr, last: i === other }))
      .sort((x, y) => (x.last - y.last) || x.label.localeCompare(y.label, S.lang, { sensitivity: "base" }));
    sel.innerHTML = `<option value="">${esc(t("f.topic.choose"))}</option>` + opts.map((o) => `<option value="${esc(o.fr)}">${esc(o.label)}</option>`).join("");
    sel.value = cur;
    renderLong(); renderMail(); renderLabs(); renderVotes(); updateEditCount();
    if (S.motion) { renderMotion(); renderSources(); renderFileNames(); syncEditLang(); }
    if (!$("review").hidden) review();
  }
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { S.lang = b.dataset.lang; store.set("motion-lang", S.lang); applyLang(); }));

  function renderLong() {
    const L = longText();
    $("mTeam").placeholder = L.defaults.team;
    const site = siteUrl();
    const fill = (s) => esc(s).replace(/\{\{email\}\}/g, `<span class="addr">${esc(CFG.contactEmail)}</span>`)
      .replace(/\s?\{\{site\}\}/g, site ? ` <a href="${esc(site)}">${esc(site.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : "");
    $("originText").innerHTML = L.origin.map((p) => `<p>${fill(p)}</p>`).join("");
    $("footMail").textContent = CFG.contactEmail; $("footMail").href = "mailto:" + CFG.contactEmail;
  }

  /* ================= Onglets ================= */
  const VIEWS = ["motion", "origine", "mode-emploi", "soutenir"];
  function route() {
    const h = location.hash.slice(1);
    const addId = /^permanents-[a-z0-9-]+$/.test(h) ? h.slice("permanents-".length) : null;
    const v = addId ? "permanents" : VIEWS.includes(h) ? h : "motion";
    if (addId) openAddendum(addId);
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    hideTip(true);
    if (VIEWS.includes(h) || addId) window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", route);

  /* ================= Motion ================= */
  function labValues(lab) {
    return {
      structure: lab.structure.name, date: frDate(lab.ag.date), pour: lab.ag.pour, contre: lab.ag.contre, abst: lab.ag.abstention,
      perm_pour: lab.permanents.pour, perm_contre: lab.permanents.contre, perm_abst: lab.permanents.abstention
    };
  }
  function ctx(values, m = S.motion) { return { values: values || {}, placeholders: m.placeholders, sources: m.sources }; }
  /* Motion affichée : celle de la langue choisie si elle existe (content/motion.<langue>.json),
     sinon le français. Les amendements des structures restent rédigés sur le texte français. */
  function dm() { return (S.motions && S.motions[S.lang]) || S.motion; }
  /* Motion utilisée par le formulaire « Soutenir » : celle de la langue affichée au moment où l'on
     commence à la modifier. Une fois des modifications faites, elle ne change plus de langue. */
  function EM() { return S.editMotion || S.motion; }
  /* Motion dans laquelle une structure a rédigé ses modifications. */
  function motionFor(L) { return (S.motions && S.motions[L.motion.lang]) || S.motion; }
  function fileLang() { return S.motions && S.motions[S.lang] ? S.lang : "fr"; }

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
      if (opts.cite) body = C.decorateSources(body, (opts.motion || S.motion).sources);
      const cls = ["para", p.kind === "added" ? "body" : p.kind, p.status].join(" ");
      return `<div class="${cls}"${opts.ids ? ` id="p-${esc(p.id)}"` : ""}>${label}<div class="para-body">${body}</div></div>`;
    }).join("");
  }

  function renderMotion() {
    const lab = S.viewLab;
    const m = lab ? motionFor(lab) : dm();
    const paras = lab ? C.applyEdits(m, lab.motion.edits) : C.baseParagraphs(m);
    $("motionBody").innerHTML = parasHTML(paras, ctx(lab ? labValues(lab) : {}, m), { hideInstruction: !!lab, hidePerm: lab && !lab.permanents.supported, cite: true, ids: true, motion: m });
    $("motionTitle").textContent = m.title;
    renderViewing();
    document.querySelectorAll(".lab").forEach((b) => { const on = !!lab && b.dataset.id === lab.id; b.classList.toggle("on", on); b.parentElement.classList.toggle("on", on); });
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
    $("sourceCount").textContent = `(${dm().sources.length})`;
    $("sourceList").innerHTML = dm().sources.map((s) => `<li id="src-${s.n}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><div class="src-meta">${esc(s.publisher)}${s.date ? " · " + esc(fmtDate(s.date)) : ""}</div></li>`).join("");
  }

  /* ================= Info-bulles ================= */
  const tip = $("tip"); let tipAnchor = null, tipPinned = false;
  function placeTip(anchor) {
    const r = anchor.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 12);
    let y = r.top - th - 10; if (y < 70) y = r.bottom + 10;
    if (y + th > window.innerHeight - 8) y = Math.max(8, window.innerHeight - th - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function showTip(anchor, html, pinned = false) {
    tip.innerHTML = html; tip.hidden = false; tipAnchor = anchor; tipPinned = pinned; tip.classList.toggle("interactive", pinned); placeTip(anchor);
  }
  function hideTip(force) { if (tipPinned && !force) return; tip.hidden = true; tipAnchor = null; tipPinned = false; document.querySelectorAll(".fn.on").forEach((f) => f.classList.remove("on")); }
  function sourceTip(n) {
    const s = dm().sources.find((x) => String(x.n) === String(n)); if (!s) return "";
    let host = ""; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { /* url invalide */ }
    return `<span class="t-pub">${esc(s.publisher)}${s.date ? " · " + esc(fmtDate(s.date)) : ""}</span><span class="t-title">${esc(s.title)}</span><span class="t-sub">${esc(t("motion.citedFor"))} : ${esc(s.about)}</span><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(t("motion.readSource"))} · ${esc(host)} ↗</a>`;
  }
  /* Fiche d'une structure : s'ouvre au survol, reste ouverte tant que la souris est sur le logo ou
     sur la fiche (pour pouvoir cliquer « Voir les modifications »), se fixe au clic. */
  let hideTimer = null;
  const labOf = (el) => S.labs.find((x) => x.id === el.dataset.id);
  function openLabTip(btn, pinned) { clearTimeout(hideTimer); const L = labOf(btn); if (!L) return; showTip(btn, labTip(L), pinned); tip.classList.add("interactive"); }
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(".tip")) { clearTimeout(hideTimer); return; }
    if (tipPinned) return;
    const fn = e.target.closest(".fn, .cite"); if (fn) return showTip(fn, sourceTip(fn.dataset.fn));
    const lab = e.target.closest(".lab"); if (lab && tipAnchor !== lab) openLabTip(lab, false); else if (lab) clearTimeout(hideTimer);
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest(".fn, .cite, .lab, .tip"); if (!el || el.contains(e.relatedTarget)) return;
    if (el.matches(".lab, .tip")) {
      if (e.relatedTarget && (e.relatedTarget.closest(".tip") || e.relatedTarget === tipAnchor || (tipAnchor && tipAnchor.contains(e.relatedTarget)))) return;
      clearTimeout(hideTimer); hideTimer = setTimeout(() => hideTip(), 250); return;
    }
    hideTip();
  });
  document.addEventListener("focusin", (e) => { const fn = e.target.closest(".fn, .cite"); if (fn && !tipPinned) showTip(fn, sourceTip(fn.dataset.fn)); const lab = e.target.closest(".lab"); if (lab && !tipPinned) { const L = S.labs.find((x) => x.id === lab.dataset.id); if (L) showTip(lab, labTip(L)); } });
  document.addEventListener("focusout", (e) => { if (e.target.closest(".fn, .cite, .lab")) hideTip(); });
  document.addEventListener("click", (e) => {
    const fn = e.target.closest(".fn, .cite");
    if (fn) { e.preventDefault(); const was = tipPinned && tipAnchor === fn; hideTip(true); if (!was) { fn.classList.add("on"); showTip(fn, sourceTip(fn.dataset.fn), true); const li = $("src-" + fn.dataset.fn); if (li) { li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); } } return; }
    const more = e.target.closest("[data-show-edits]");
    if (more) {
      const box = tip.querySelector(".t-edits"), open = box.hidden;
      box.hidden = !open; more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? t("labs.hideEdits") : more.dataset.label;
      tip.classList.toggle("wide", open); tipPinned = true; placeTip(tipAnchor); return;
    }
    const lab = e.target.closest(".lab");
    if (lab) { const was = tipPinned && tipAnchor === lab; hideTip(true); if (!was) openLabTip(lab, true); return; }
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
    const perm = L.permanents.supported ? (() => { const q = C.pct(L.permanents.pour, L.permanents.abstention, L.permanents.contre); return `${esc(t("labs.perm.yes"))}${L.permanents.pour ? ` (${q[0]} % ${esc(t("labs.for").toLowerCase())})` : ""}${L.permanents.date ? ` · ${esc(fmtDate(L.permanents.date))}` : ""}`; })()
      : `${esc(t("labs.perm.no"))}</span><a class="t-add" href="#permanents-${esc(L.id)}">${esc(t("labs.addPerm"))} →</a><span hidden>`;
    return `${L.example ? `<span class="t-pub">${esc(t("labs.example"))}</span>` : ""}<b>${esc(s.acronym ? s.acronym + " · " : "")}${esc(s.name)}</b>${where ? `<span class="t-sub">${esc(where)}</span>` : ""}<span class="t-sub">${esc(place)}${s.topic ? " · " + esc(topicLabel(s.topic)) : ""}</span>
      <span>${esc(t("labs.agOn"))} ${esc(fmtDate(L.ag.date))}</span>
      <div class="votebar"><i class="v-pour" style="width:${p}%"></i><i class="v-abs" style="width:${a}%"></i><i class="v-contre" style="width:${c}%"></i></div>
      <div class="t-nums"><span>${esc(t("labs.for"))} ${p} %</span><span>${esc(t("labs.abst"))} ${a} %</span><span>${esc(t("labs.against"))} ${c} %</span></div>
      <span class="t-sub">${perm}</span>${L._edits ? editsBlock(L) : `<span class="t-sub">${esc(t("motion.noEdits"))}</span>`}`;
  }
  /* Liste dépliable de toutes les modifications, au plus court. */
  function editsBlock(L) {
    const cx = ctx(labValues(L), motionFor(L)), label = `${t("labs.showEdits")} (${L._edits})`;
    const items = C.applyEdits(motionFor(L), L.motion.edits).filter((p) => p.kind !== "instruction" && p.status !== "same").map((p) => {
      const head = `<span class="t-elabel">${esc(p.status === "added" ? t("paste.added") : p.label)}</span>${p.status === "deleted" ? `<span class="del-tag">${esc(t("paste.deleted"))}</span>` : ""}`;
      const body = p.status === "added" ? `<ins class="rev">${C.renderText(p.text.replace(/\[\^\d+\]/g, ""), cx)}</ins>`
        : p.status === "deleted" ? "" : C.diffSnippets(p.orig, p.text, cx);
      return `<li>${head}${body ? `<span class="t-ebody">${body}</span>` : ""}</li>`;
    }).join("");
    return `<button type="button" class="t-more" data-show-edits data-label="${esc(label)}" aria-expanded="false">${esc(label)}</button><ul class="t-edits" hidden>${items}</ul>`;
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
    wall.innerHTML = sorted.map(([g, list]) => `<div class="lab-group">${key !== "none" ? `<h4>${esc(key === "topic" ? topicLabel(g) : g)}<span>${list.length}</span></h4>` : ""}<div class="logos">${list.map((L) => {
      const on = S.viewLab === L;
      return `<div class="lab-item${on ? " on" : ""}"><button type="button" class="lab${L.permanents.supported ? "" : " octo"}${on ? " on" : ""}" data-id="${esc(L.id)}" aria-label="${esc(L.structure.name)}"><span class="inner">${logoHTML(L)}</span></button><span class="name">${esc(L.structure.acronym || L.structure.name)}</span>${L.example ? `<span class="ex">${esc(t("labs.exampleShort"))}</span>` : ""}</div>`;
    }).join("")}</div></div>`).join("");
    const real = S.labs.filter((L) => !L.example);
    $("statLabs").textContent = real.length;
    $("statVoters").textContent = real.reduce((n, L) => n + L.ag.pour, 0).toLocaleString("fr-FR");
    document.querySelectorAll("[data-stat]").forEach((el) => (el.hidden = !real.length));
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
    S.labs.forEach((L) => (L._edits = C.editCount(C.applyEdits(motionFor(L), L.motion.edits))));
    S.labs.sort((a, b) => (b.ag.date || "").localeCompare(a.ag.date || ""));
    S.labsState = "ok"; renderLabs();
    if (/^#permanents-/.test(location.hash)) route();
  }

  /* ================= Courriel à l'équipe ================= */
  /* Textes longs (origine, courriels) dans la langue affichée, sinon en français. */
  function longText() { return window.LONG[S.lang] || window.LONG.fr; }
  function mailText() {
    const L = longText(), D = L.defaults, A = L.attach;
    const team = C.cleanLine($("mTeam").value, 80) || D.team;
    const deadline = $("mDeadline").value ? D.datePrefix + fmtDate($("mDeadline").value) : D.deadline;
    const name = C.cleanLine($("mName").value, 60) || D.name;
    const site = siteUrl();
    const fmts = chosenFiles().map((f) => A[f.key]);
    const joins = fmts.length ? ` ${A.pre}${fmts.length > 1 ? fmts.slice(0, -1).join(", ") + A.and + fmts[fmts.length - 1] : fmts[0]}.` : "";
    let body = L.mail.replace("{{team}}", team).replace("{{deadline}}", deadline).replace("{{name}}", name).replace(/ ?\{\{joins\}\}/, joins);
    body = site ? body.replace("{{site}}", site) : body.replace(/[^\n]*\{\{site\}\}[^\n]*\n\n/, "");
    return { subject: L.mailSubject, body };
  }
  function renderMail() {
    const m = mailText(); $("mailSubject").textContent = m.subject; $("mailBody").textContent = m.body;
    $("mailMake").href = `mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  }
  ["mName", "mTeam", "mDeadline", "attPdf", "attDocx", "attTxt"].forEach((id) => $(id).addEventListener("input", renderMail));
  /* Pièces jointes : préchargées pour que le partage (Mail sur Apple, etc.) les joigne directement. */
  const ATT = {
    pdf: { ext: "pdf", type: "application/pdf", label: "PDF" },
    docx: { ext: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
    txt: { ext: "txt", type: "text/plain", label: "texte brut" }
  };
  const attUrl = (k, lang = fileLang()) => `downloads/motion-${lang}.${ATT[k].ext}`;
  const attBlobs = {};
  function prefetchFiles() {
    Object.keys(ATT).forEach((k) => { const u = attUrl(k); if (!(u in attBlobs)) { attBlobs[u] = null; fetch(u).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) attBlobs[u] = b; }).catch(() => {}); } });
  }
  function renderFileNames() {
    document.querySelectorAll("[data-att]").forEach((c) => { const sp = c.parentElement.querySelector("span"); if (sp) sp.textContent = attUrl(c.dataset.att).split("/").pop(); });
    prefetchFiles();
  }
  function chosenFiles() { return [...document.querySelectorAll("[data-att]")].filter((c) => c.checked).map((c) => ({ key: c.dataset.att, url: attUrl(c.dataset.att), ...ATT[c.dataset.att] })); }
  let canShareFiles = false;
  try { canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.txt", { type: "text/plain" })] })); } catch (e) { /* partage indisponible */ }
  /* Deux façons d'ouvrir le courriel :
     - « Préparer le courriel avec les pièces jointes » (menu de partage, joint les documents ; Apple, Android…),
       affiché seulement si l'appareil le permet ;
     - « Ouvrir ma messagerie » : un vrai lien mailto, avec le texte seulement.
     Après chaque clic, un message dit quoi faire si rien ne s'est ouvert. */
  if (canShareFiles) { $("mailShare").hidden = false; $("mailMake").classList.add("ghost"); }
  const mailHint = () => { $("mailToast").textContent = t("step1.nothing"); setTimeout(() => ($("mailToast").textContent = ""), 9000); };
  $("mailMake").addEventListener("click", mailHint);
  $("mailShare").addEventListener("click", async () => {
    const m = mailText(), chosen = chosenFiles();
    const files = chosen.filter((f) => attBlobs[f.url]).map((f) => new File([attBlobs[f.url]], f.url.split("/").pop(), { type: f.type }));
    try { await navigator.share(files.length ? { title: m.subject, text: m.body, files } : { title: m.subject, text: m.body }); }
    catch (e) { if (!e || e.name !== "AbortError") { mailHint(); location.href = $("mailMake").href; } }
  });
  $("mailFiles").addEventListener("click", () => {
    chosenFiles().forEach((f, i) => setTimeout(() => { const a = document.createElement("a"); a.href = f.url; a.download = f.url.split("/").pop(); document.body.appendChild(a); a.click(); a.remove(); }, i * 400));
  });
  $("mailCopy").addEventListener("click", () => { const m = mailText(); copy(`${m.subject}\n\n${m.body}`, $("mailToast"), $("mailBody")); });

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
    const cx = ctx(formValues(), EM()), perm = $("fPerm").checked;
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
      const area = editing ? `<textarea data-id="${p.id}" aria-label="${esc(p.label || t("s.edit.newPara"))}" maxlength="6000">${esc(C.toEditable(p.text, EM()))}</textarea>` : "";
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
    const other = EM() !== dm() ? ` · ${esc(t("s.edit.langKept"))} ${esc(t("lang." + (EM().lang || "fr")))}` : "";
    $("editCount").innerHTML = (n ? `<b>${n}</b> ${esc(t("s.edit.count"))}` : esc(t("summary.noEdits"))) + other;
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
    p.text = C.fromEditable(ta.value, EM());
    if (p.status !== "added") p.status = p.text === p.orig ? "same" : "modified";
    const node = ta.closest(".para");
    node.querySelector(".para-body").innerHTML = paraBody(p, ctx(formValues(), EM()));
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
  /* Changement de langue : si rien n'a encore été modifié, le formulaire passe à la motion de la
     nouvelle langue ; sinon il garde la version en cours de modification et le signale. */
  function syncEditLang() {
    const untouched = C.editCount(S.paras) === 0 && !S.paras.some((p) => p.status === "added") && !S.editingId;
    if (untouched && EM() !== dm()) { S.editMotion = dm(); S.paras = freshParas(true); renderEditor(); saveDraft(); }
    updateEditCount();
  }
  function freshParas(keepInstructionState) {
    const old = S.paras.find((p) => p.kind === "instruction");
    const ps = C.baseParagraphs(EM());
    if (keepInstructionState && old && old.status === "deleted") ps.find((p) => p.kind === "instruction").status = "deleted";
    return ps;
  }

  /* ================= Texte collé ================= */
  $("pasteCancel").addEventListener("click", () => { $("pasteBox").value = ""; setMode(C.editCount(S.paras) ? "edit" : "same"); });
  $("pasteCompare").addEventListener("click", () => {
    const raw = $("pasteBox").value;
    $("pasteErr").textContent = raw.trim() ? "" : t("paste.empty");
    if (!raw.trim()) return;
    const res = C.comparePasted(raw, EM());
    S.pasteData = res;
    const preview = C.applyEdits(EM(), res.paragraphs.filter((p) => p.status !== "same"));
    const cx = ctx(Object.assign(formValues(), cleanFills(res.fills)), EM());
    const changed = preview.filter((p) => p.status !== "same" && p.kind !== "instruction");
    const instr = res.paragraphs.find((p) => p.id === "consigne");
    const det = describeFills(res.fills);
    $("pasteResult").hidden = false;
    $("pasteResult").innerHTML = `<div class="paste-result">
      <h4>${esc(changed.length ? t("paste.question") : t("paste.none"))}</h4>
      ${det ? `<div><span class="small-h">${esc(t("paste.detected"))}</span><div class="detected">${det}</div></div>` : ""}
      ${changed.map((p) => `<div class="paste-item"><span class="para-label">${esc(p.status === "added" ? t("paste.added") : p.label)}</span>${p.status === "deleted" ? `<span class="del-tag">${esc(t("paste.deleted"))}</span>` : ""}${p.status === "added" ? `<ins class="rev">${C.renderText(p.text, cx)}</ins>` : p.status === "deleted" ? `<del class="rev">${C.renderText(p.orig, cx)}</del>` : C.renderDiff(p.orig, p.text, cx)}</div>`).join("")}
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
    S.paras = C.applyEdits(EM(), res.paragraphs.filter((p) => p.status !== "same"));
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
  /* Thématique « Autre » : un champ libre apparaît pour la préciser. */
  const OTHER_TOPIC = window.I18N.fr.topics[window.I18N.fr.topics.length - 1];
  function isOtherTopic() { return $("fTopic").value === OTHER_TOPIC; }
  function syncTopicOther() { $("topicOtherWrap").hidden = !isOtherTopic(); }
  $("fTopic").addEventListener("change", () => { syncTopicOther(); if (isOtherTopic()) $("fTopicOther").focus(); refreshReview(); });
  const FIELDS = ["fName", "fAcronym", "fInstitution", "fDepartment", "fCity", "fCountry", "fTopic", "fTopicOther", "fDate", "fPour", "fContre", "fAbst", "fPermPour", "fPermContre", "fPermAbst"];
  $("labForm").addEventListener("input", (e) => {
    if (e.target.closest("#editor") || e.target.id === "pasteBox") return;
    if (e.target.id === "fPerm") $("permFields").hidden = !e.target.checked;
    renderVotes();
    if (["fName", "fDate", "fPour", "fContre", "fAbst", "fPerm", "fPermPour", "fPermContre", "fPermAbst"].includes(e.target.id)) renderEditor();
    if (e.target.id === "fName" || e.target.id === "fAcronym") renderLogo();
    saveDraft();
    refreshReview();
  });
  /* Si la vérification est affichée, elle se met à jour dès qu'un champ change :
     « Valider » se débloque sans avoir à cliquer de nouveau sur « Vérifier avant l'envoi ». */
  function refreshReview() { if (!$("review").hidden) review(false); }
  $("fPerm").addEventListener("change", () => { $("permFields").hidden = !$("fPerm").checked; renderEditor(); saveDraft(); refreshReview(); });

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
      store.set("motion-draft", { v: EM().version, lang: EM().lang || "fr", f, logo: S.logo, mode: S.mode, edits: C.editsFromState(S.paras) });
    }, 300);
  }
  function loadDraft() {
    const d = store.get("motion-draft");
    if (!d) return;
    const dmot = (S.motions && S.motions[d.lang]) || S.motion;
    if (d.v !== dmot.version) return;
    S.editMotion = dmot;
    FIELDS.forEach((id) => { if (d.f && typeof d.f[id] === "string") $(id).value = d.f[id]; });
    $("fPerm").checked = !!(d.f && d.f.fPerm); $("permFields").hidden = !$("fPerm").checked;
    syncTopicOther();
    if (typeof d.logo === "string" && /^data:image\/jpeg;base64,/.test(d.logo)) S.logo = d.logo;
    const v = C.validateLab({ structure: { name: "x" }, ag: { pour: 1 }, motion: { edits: d.edits || [] } }, EM()).lab;
    if (v) { S.paras = C.applyEdits(EM(), v.motion.edits); }
    S.mode = d.mode === "edit" ? "edit" : "same";
  }

  /* ================= Vérification et envoi ================= */
  function collect() {
    const v = (id, n) => C.cleanLine($(id).value, n);
    return {
      schema: 1,
      id: `${C.slug(v("fAcronym", 30) || v("fName", 160))}-${$("fDate").value || "sans-date"}`,
      submitted_at: new Date().toISOString(),
      structure: { name: v("fName", 160), acronym: v("fAcronym", 30), institution: v("fInstitution", 160), department: v("fDepartment", 160), city: v("fCity", 80), country: v("fCountry", 80), topic: isOtherTopic() ? (v("fTopicOther", 80) || v("fTopic", 80)) : v("fTopic", 80) },
      logo: S.logo,
      ag: { date: /^\d{4}-\d{2}-\d{2}$/.test($("fDate").value) ? $("fDate").value : "", pour: C.int($("fPour").value), contre: C.int($("fContre").value), abstention: C.int($("fAbst").value) },
      permanents: { supported: $("fPerm").checked, pour: $("fPerm").checked ? C.int($("fPermPour").value) : 0, contre: $("fPerm").checked ? C.int($("fPermContre").value) : 0, abstention: $("fPerm").checked ? C.int($("fPermAbst").value) : 0 },
      motion: { lang: EM().lang || "fr", base_version: EM().version, edits: C.editsFromState(S.paras).filter((e) => e.id !== "consigne") }
    };
  }
  $("labForm").addEventListener("submit", (e) => { e.preventDefault(); review(); });
  function review(scroll = true) {
    if (scroll || S.editingId === null) { S.editingId = null; renderEditor(); }
    const d = collect();
    const missing = [];
    const need = [["fName", "f.name"], ["fInstitution", "f.institution"], ["fCity", "f.city"], ["fCountry", "f.country"], ["fTopic", "f.topic"], ["fDate", "f.date"]];
    if (isOtherTopic()) need.push(["fTopicOther", "f.topicOther"]);
    need.forEach(([id, k]) => { if (!$(id).value.trim()) missing.push({ id, text: t(k) }); });
    if (!d.ag.pour) missing.push({ id: "fPour", text: t("warn.noFor") });
    const warns = [];
    const instr = S.paras.find((p) => p.kind === "instruction");
    if (instr && instr.status !== "deleted") warns.push({ text: t("warn.instruction"), act: "instr", label: t("s.edit.removeInstruction") });
    if (d.permanents.supported && !(d.permanents.pour + d.permanents.contre + d.permanents.abstention)) warns.push({ text: t("warn.permMissing"), act: "perm", label: t("submit.back") });
    const edited = S.paras.filter((p) => (p.status === "modified" || p.status === "added" || p.status === "deleted") && p.kind !== "instruction");
    const cx = ctx(formValues(), EM());
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
        ${edited.length ? edited.map((q) => `<div class="paste-item" style="margin-top:10px"><span class="para-label">${esc(q.label || t("paste.added"))}</span>${q.status === "deleted" ? `<span class="del-tag">${esc(t("paste.deleted"))}</span>` : ""}${q.status === "added" ? `<ins class="rev">${C.renderText(q.text, cx)}</ins>` : q.status === "deleted" ? `<del class="rev">${C.renderText(q.orig, cx)}</del>` : C.renderDiff(q.orig, q.text, cx)}</div>`).join("") : `<p class="muted" style="margin:6px 0 0">${esc(t("summary.noEdits"))}</p>`}</div>
      <div class="row"><button type="button" class="btn big" id="sendBtn" ${blocked ? "disabled" : ""}>${esc(t("submit.send"))}</button><button type="button" class="btn ghost big" id="backBtn">${esc(t("submit.back"))}</button></div>
      <p class="muted small" style="margin:0">${esc(t(blocked ? "submit.whatBlocked" : "submit.what"))}</p>`;
    el.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => { $(b.dataset.goto).focus(); $(b.dataset.goto).scrollIntoView({ block: "center", behavior: "smooth" }); }));
    el.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = () => {
      if (b.dataset.fix === "instr") { instr.status = "deleted"; renderEditor(); saveDraft(); review(); }
      else { $("fPermPour").focus(); $("fPermPour").scrollIntoView({ block: "center", behavior: "smooth" }); }
    }));
    $("backBtn").onclick = () => { el.hidden = true; $("labForm").scrollIntoView({ behavior: "smooth" }); };
    $("sendBtn").onclick = () => send(d);
    if (scroll) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true }); }
  }

  function plainText(d, M = EM()) {
    const s = d.structure, [p, a, c] = C.pct(d.ag.pour, d.ag.abstention, d.ag.contre);
    const paras = C.applyEdits(M, d.motion.edits);
    const vals = labValues(d);
    const fillPh = (txt) => txt.replace(/\{\{(\w+)\}\}/g, (m, k) => (vals[k] !== undefined && vals[k] !== "" ? String(vals[k]) : M.placeholders[k] || m)).replace(/\[\^(\d+)\]/g, "[$1]");
    const diffPlain = (o, n) => C.diff(o, n).map((g) => { const x = fillPh(g.toks.join("")); return g.type === "eq" ? x : g.type === "del" ? `[-${x}-]` : `{+${x}+}`; }).join("");
    const changes = paras.filter((q) => q.kind !== "instruction" && q.status !== "same").map((q) =>
      `• ${q.label || "Paragraphe ajouté"} (${q.status === "modified" ? "modifié" : q.status === "deleted" ? "supprimé" : "ajouté"})\n${q.status === "modified" ? diffPlain(q.orig, q.text) : fillPh(q.status === "deleted" ? q.orig : q.text)}`);
    const final = paras.filter((q) => q.status !== "deleted" && q.kind !== "instruction" && (q.kind !== "permvote" || d.permanents.supported)).map((q) => fillPh(q.text)).join("\n\n");
    return [
      `Nouvelle structure signataire : ${s.name}${s.acronym && s.acronym !== s.name ? " (" + s.acronym + ")" : ""}`,
      `Établissement : ${s.institution}${s.department ? " · " + s.department : ""}`,
      `Lieu : ${s.city}, ${s.country} · Thématique : ${s.topic}`,
      `AG des non-permanent·es du ${frDate(d.ag.date)} : ${d.ag.pour} pour (${p} %), ${d.ag.contre} contre (${c} %), ${d.ag.abstention} abstention(s) (${a} %)`,
      `Permanent·es : ${d.permanents.supported ? `soutien voté${d.permanents.date ? " le " + frDate(d.permanents.date) : ""} (${d.permanents.pour} pour, ${d.permanents.contre} contre, ${d.permanents.abstention} abstention(s))` : "pas de vote"}`,
      `Logo : ${d.logo ? "fourni (dans le JSON)" : "non fourni"}`,
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

  /* ================= Ajout du vote des permanent·es ================= */
  /* Pour une structure déjà en ligne : on reprend sa fiche telle quelle, on y ajoute le vote des
     permanent·es, et on envoie la fiche complète mise à jour (même nom de fichier dans labs/). */
  function openAddendum(id) {
    const box = $("permBox"); $("permSent").hidden = true; box.hidden = false;
    if (S.labsState !== "ok") { box.innerHTML = `<p class="muted">${esc(t("labs.loading"))}</p>`; return; }
    const L = S.labs.find((x) => x.id === id);
    if (!L) { $("permTitle").textContent = t("add.titleShort"); box.innerHTML = `<p class="err">${esc(t("add.notFound"))}</p><a class="btn ghost" href="#motion">${esc(t("motion.back"))}</a>`; return; }
    const s = L.structure, M = motionFor(L), [p, a, c] = C.pct(L.ag.pour, L.ag.abstention, L.ag.contre);
    $("permTitle").textContent = `${t("add.title")} ${s.name}`;
    const changed = C.applyEdits(M, L.motion.edits).filter((q) => q.kind !== "instruction" && q.status !== "same").map((q) => q.label || t("paste.added"));
    box.innerHTML = `<div class="block">
        <span class="small-h">${esc(t("add.current"))}</span>
        <div class="summary-card"><span class="logo-prev">${logoHTML(L)}</span>
          <div class="meta"><b>${esc(s.name)}${s.acronym && s.acronym !== s.name ? " (" + esc(s.acronym) + ")" : ""}</b>${esc([s.department, s.institution, s.city, s.country].filter(Boolean).join(" · "))}<br>
          ${esc(t("labs.agOn"))} ${esc(fmtDate(L.ag.date))} · ${esc(t("labs.for"))} ${p} % · ${esc(t("labs.abst"))} ${a} % · ${esc(t("labs.against"))} ${c} %<br>
          ${changed.length ? `${changed.length} ${esc(t("labs.changes"))} : ${esc(changed.join(", "))}` : esc(t("motion.noEdits"))}</div></div>
      </div>
      <fieldset class="block">
        <legend><span class="num">4</span><span>${esc(t("add.section"))}</span></legend>
        <div class="grid4">
          <label for="aPermDate"><span>${esc(t("add.date"))} <em class="req">${esc(t("f.required"))}</em></span><input id="aPermDate" type="date"></label>
          <label for="aPermPour"><span>${esc(t("f.for"))}</span><input id="aPermPour" type="number" min="0" inputmode="numeric"></label>
          <label for="aPermContre"><span>${esc(t("f.against"))}</span><input id="aPermContre" type="number" min="0" inputmode="numeric"></label>
          <label for="aPermAbst"><span>${esc(t("f.abst"))}</span><input id="aPermAbst" type="number" min="0" inputmode="numeric"></label>
        </div>
        <span class="small-h">${esc(t("add.preview"))}</span>
        <div class="motion-text"><div class="para permvote" id="aPermPreview"></div></div>
        <p class="err" id="aPermErr" role="alert"></p>
        <div class="row"><button type="button" class="btn big" id="aPermSend">${esc(t("submit.send"))}</button><a class="btn ghost big" href="#motion">${esc(t("add.cancel"))}</a></div>
        <p class="muted small" style="margin:0">${esc(t("submit.what"))}</p>
      </fieldset>`;
    const permPara = M.paragraphs.find((q) => q.kind === "permvote");
    const vals = () => ({ structure: s.name, perm_pour: $("aPermPour").value, perm_contre: $("aPermContre").value, perm_abst: $("aPermAbst").value });
    const preview = () => { $("aPermPreview").innerHTML = `<div class="para-body">${C.renderText(permPara.text, ctx(vals(), M))}</div>`; };
    box.querySelectorAll("input").forEach((i) => i.addEventListener("input", preview)); preview();
    $("aPermSend").onclick = () => {
      const date = $("aPermDate").value, pour = C.int($("aPermPour").value), contre = C.int($("aPermContre").value), abst = C.int($("aPermAbst").value);
      const err = !/^\d{4}-\d{2}-\d{2}$/.test(date) ? t("add.noDate") : !pour ? t("warn.noFor") : "";
      $("aPermErr").textContent = err; if (err) return;
      const d = JSON.parse(JSON.stringify(L)); Object.keys(d).forEach((k) => { if (k.startsWith("_")) delete d[k]; });
      d.permanents = { supported: true, pour, contre, abstention: abst, date };
      d.addendum = { type: "permanents", submitted_at: new Date().toISOString() };
      const fileName = `ajout-permanents-${d.id}.txt`;
      const head = [`Ajout du vote des permanent·es : ${s.name}`, `Fichier à remplacer après vérification : labs/${d.id}.json`,
        `Vote des permanent·es du ${frDate(date)} : ${pour} pour, ${contre} contre, ${abst} abstention(s)`, "", "=== Fiche complète mise à jour ===", ""].join("\n");
      const file = `${head}${plainText(d, M)}\n\n${JSON_START}\n${JSON.stringify(d, null, 2)}\n${JSON_END}\n`;
      const subject = `Ajout du vote des permanent·es – ${s.name}`;
      const mv = { name: s.name, date: fmtDate(date), pour, contre, abst, file: fileName };
      const body = longText().submitPerm.replace(/\{\{(\w+)\}\}/g, (m0, k) => (k in mv ? String(mv[k]) : m0));
      send(d, { el: "permSent", hide: "permBox", fileName, file, s3: t("add.s3"),
        mail: { subject, body, href: `mailto:${CFG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` } });
    };
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
    const subject = `Ajout de soutien – ${s.name}`;
    const vals = { name: s.name + (s.acronym && s.acronym !== s.name ? " (" + s.acronym + ")" : ""), date: fmtDate(d.ag.date), pour: d.ag.pour, contre: d.ag.contre, abst: d.ag.abstention, pct: p, file: fileName };
    const body = longText().submit.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vals ? String(vals[k]) : m));
    return { subject, body, href: `mailto:${CFG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
  }

  /* Après « Valider et passer à l'envoi » : rien ne se déclenche tout seul. La page affiche trois
     étapes numérotées, chacune lancée par un bouton, qui se cochent au fur et à mesure. */
  function send(d, o = {}) {
    const fileName = o.fileName || `soutien-motion-${d.id}.txt`;
    const file = o.file || submissionFile(d), mail = o.mail || submissionMail(d, fileName);
    ["sent", "permSent"].forEach((id) => { if ($(id)) { $(id).innerHTML = ""; $(id).hidden = true; } });
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([file], fileName, { type: "text/plain" })] })); } catch (e) { /* partage indisponible */ }
    const addr = `<span class="addr">${esc(CFG.contactEmail)}</span>`;
    const el = $(o.el || "sent"); $(o.hide || "review").hidden = true; el.hidden = false;
    el.innerHTML = `<h2>${esc(t("sent.readyTitle"))}</h2>
      <p class="muted" style="margin:0">${esc(t("sent.readyLede"))}</p>
      <ol class="send-steps">
        <li id="sendStep1" class="active">
          <span class="step-num">1</span>
          <div><h3>${esc(t("sent.s1Title"))}</h3>
            <div class="row"><button type="button" class="btn" id="dlFile">${esc(t("sent.s1Btn"))} ${esc(fileName)}</button></div>
            <p class="muted small">${esc(t("sent.s1Note"))}</p></div>
        </li>
        <li id="sendStep2">
          <span class="step-num">2</span>
          <div><h3>${esc(t("sent.s2Title"))}</h3>
            <div class="row"><a class="btn ghost" id="openMail" href="${esc(mail.href)}">${esc(t("sent.s2Btn"))}</a></div>
            <p class="muted small">${esc(t("sent.s2Note"))} ${addr}.</p></div>
        </li>
        <li id="sendStep3">
          <span class="step-num">3</span>
          <div><h3>${esc(t("sent.s3Title"))}</h3>
            <p class="small" style="margin:0">${esc(o.s3 || t("sent.s3Text"))}</p></div>
        </li>
      </ol>
      ${canShare ? `<div class="shortcut"><b>${esc(t("sent.shortcutTitle"))}</b>
        <span class="muted small">${esc(t("sent.shortcutNote"))} ${addr}</span>
        <div class="row"><button type="button" class="btn ghost" id="shareFile">${esc(t("sent.share"))}</button><button type="button" class="linkish" id="copyAddr">${esc(t("sent.copyAddr"))}</button></div></div>` : ""}
      <details class="mail-fallback">
        <summary>${esc(t("sent.noMail"))}</summary>
        <div class="mail-preview">
          <div class="mail-subject"><span class="muted">${esc(t("sent.to"))}</span> ${addr}<br><span class="muted">${esc(t("sent.subject"))}</span> ${esc(mail.subject)}</div>
          <pre id="sentMailBody">${esc(mail.body)}</pre>
        </div>
        <div class="row"><button type="button" class="btn ghost" id="copyMail2">${esc(t("sent.copyMail"))}</button></div>
      </details>
      <span class="toast" id="sentToast" role="status"></span>
      <div class="thanks-box"><h3>${esc(t("sent.title"))}</h3><p class="thanks">${esc(t("sent.body"))}</p></div>
      <div class="row"><a class="btn ghost" href="#mode-emploi">${esc(t("sent.howto"))}</a><button type="button" class="linkish" id="again">${esc(t("sent.again"))}</button></div>`;
    const done = (n) => {
      $("sendStep" + n).classList.add("done"); $("sendStep" + n).classList.remove("active");
      const next = $("sendStep" + (n + 1)); if (next && !next.classList.contains("done")) next.classList.add("active");
      if (n === 1) { $("openMail").classList.remove("ghost"); $("dlFile").classList.add("ghost"); }
    };
    $("dlFile").onclick = () => { download(fileName, file, "text/plain;charset=utf-8"); done(1); };
    $("openMail").addEventListener("click", () => { done(2); });
    $("copyMail2").onclick = () => copy(`${CFG.contactEmail}\n${mail.subject}\n\n${mail.body}`, $("sentToast"), $("sentMailBody"));
    if (canShare) {
      $("shareFile").onclick = async () => {
        try { await navigator.share({ title: mail.subject, text: mail.body, files: [new File([file], fileName, { type: "text/plain" })] }); done(1); done(2); }
        catch (e) { /* partage annulé */ }
      };
      $("copyAddr").onclick = () => copy(CFG.contactEmail, $("sentToast"), null);
    }
    $("again").onclick = () => { try { localStorage.removeItem("motion-draft"); } catch (e) { /* rien */ } location.reload(); };
    el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true });
  }

  /* ================= Démarrage ================= */
  async function init() {
    S.lang = ["fr", "en", "es"].includes(store.get("motion-lang")) ? store.get("motion-lang") : "fr";
    const g = store.get("motion-group"); if (g) $("groupBy").value = g;
    try { S.motion = await (await fetch("content/motion.fr.json", { cache: "no-cache" })).json(); }
    catch (e) { $("motionBody").innerHTML = `<p class="err">Le texte de la motion n’a pas pu être chargé (content/motion.fr.json).</p>`; return; }
    S.motions = { fr: S.motion };
    await Promise.all(["en", "es"].map(async (l) => { try { const r = await fetch(`content/motion.${l}.json`, { cache: "no-cache" }); if (r.ok) S.motions[l] = await r.json(); } catch (e) { /* pas encore traduite */ } }));
    S.editMotion = dm(); S.paras = C.baseParagraphs(EM()); S.mode = "same";
    loadDraft();
    renderSources(); renderMotion(); renderLogo(); renderEditor(); renderVotes();
    applyLang(); route();
    loadLabs();
  }
  init();
})();
