/* Page de vérification des motions reçues (organisateur·ices). */
(async function () {
  const C = window.Core, out = document.getElementById("out"), drop = document.getElementById("drop");
  const frMotion = await (await fetch("content/motion.fr.json", { cache: "no-cache" })).json();
  const motions = { fr: frMotion };
  await Promise.all(["en", "es"].map(async (l) => { try { const r = await fetch(`content/motion.${l}.json`, { cache: "no-cache" }); if (r.ok) motions[l] = await r.json(); } catch (e) { /* pas de traduction */ } }));
  const frDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";
  async function handle(file) {
    let raw; try { const txt = await file.text(); const m = txt.match(/----- DÉBUT DU JSON -----\s*([\s\S]*?)\s*----- FIN DU JSON -----/); raw = JSON.parse(m ? m[1] : txt); } catch (e) { out.innerHTML = `<p class="err">Ce fichier ne contient pas de JSON lisible.</p>`; return; }
    const { lab, errors } = C.validateLab(raw, frMotion);
    const motion = lab ? (motions[lab.motion.lang] || frMotion) : frMotion;
    if (!lab) { out.innerHTML = `<ul class="checklist">${errors.map((e) => `<li>${C.esc(e)}</li>`).join("")}</ul>`; return; }
    const paras = C.applyEdits(motion, lab.motion.edits), n = C.editCount(paras), s = lab.structure;
    const [p, a, c] = C.pct(lab.ag.pour, lab.ag.abstention, lab.ag.contre);
    const vals = { structure: s.name, date: frDate(lab.ag.date), pour: lab.ag.pour, contre: lab.ag.contre, abst: lab.ag.abstention, perm_pour: lab.permanents.pour, perm_contre: lab.permanents.contre, perm_abst: lab.permanents.abstention };
    const cx = { values: vals, placeholders: motion.placeholders, sources: motion.sources };
    const body = paras.filter((q) => q.kind !== "instruction" && (q.kind !== "permvote" || lab.permanents.supported)).map((q) =>
      `<div class="para ${q.kind === "added" ? "body" : q.kind} ${q.status}">${q.label ? `<span class="para-label">${C.esc(q.label)}</span>` : ""}<div class="para-body">${q.status === "modified" ? C.renderDiff(q.orig, q.text, cx) : C.renderText(q.status === "deleted" ? q.orig : q.text, cx)}</div></div>`).join("");
    const name = `${lab.id}.json`;
    out.innerHTML = `
      ${errors.length ? `<ul class="checklist">${errors.map((e) => `<li>${C.esc(e)}</li>`).join("")}</ul>` : `<p class="ok">Fichier valide.</p>`}
      ${raw.motion && raw.motion.base_version !== motion.version ? `<p class="err">Basé sur la version « ${C.esc(raw.motion.base_version || "?")} » du texte (version actuelle : ${C.esc(motion.version)}).</p>` : ""}
      <div class="summary-card" style="margin-top:12px"><span class="logo-prev" style="border-color:${n ? "var(--rouge)" : "var(--bleu)"};${n ? "border-style:dashed" : ""}">${lab.logo ? `<img src="${C.esc(lab.logo)}" alt="">` : C.catSVG(s.acronym || s.name)}</span>
        <div class="meta"><b>${C.esc(s.name)}${s.acronym ? " (" + C.esc(s.acronym) + ")" : ""}</b>${C.esc([s.institution, s.department, s.city, s.country, s.topic].filter(Boolean).join(" · "))}<br>
        AG du ${C.esc(frDate(lab.ag.date))} : ${lab.ag.pour} pour (${p} %), ${lab.ag.contre} contre (${c} %), ${lab.ag.abstention} abst. (${a} %)<br>
        Langue de la motion votée : ${C.esc({ fr: "français", en: "anglais", es: "espagnol" }[lab.motion.lang])}<br>
        Permanent·es : ${lab.permanents.supported ? `soutien (${lab.permanents.pour} / ${lab.permanents.contre} / ${lab.permanents.abstention})` : "pas de vote"} · <b style="display:inline;color:var(--rouge)">${n}</b> modification(s)</div></div>
      <div class="row"><button type="button" class="btn" id="dl">Télécharger ${C.esc(name)}</button><span class="muted small">à déposer dans <code>labs/</code> du dépôt</span></div>
      <article class="paper motion-text" style="margin-top:8px">${body}</article>`;
    document.getElementById("dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(lab, null, 2) + "\n"], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  }
  const input = document.getElementById("file");
  input.addEventListener("change", () => input.files[0] && handle(input.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handle(f); });
})();
