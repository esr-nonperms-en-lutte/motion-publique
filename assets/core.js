/* Logique partagée : nettoyage des saisies, rendu de la motion, révisions (diff), comparaison
   d'un texte collé, validation des fichiers JSON des structures. Aucune base de données : chaque
   saisie est traitée comme du texte, nettoyée, limitée en longueur et échappée à l'affichage. */
(function () {
  const Core = {};

  /* ---------- Nettoyage ---------- */
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
  Core.clean = (v, max = 200) => String(v ?? "").replace(CTRL, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
  Core.cleanLine = (v, max = 200) => Core.clean(v, max).replace(/\s+/g, " ");
  Core.int = (v, max = 100000) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
  Core.esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  Core.slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "structure";

  /* ---------- Jetons ---------- */
  const TOKEN = /\{\{\w+\}\}|\[\^\d+\]|\s+|[\p{L}\p{M}\p{N}·’'\-]+|[^\s]/gu;
  Core.tokenize = (text) => String(text).match(TOKEN) || [];
  const isWs = (t) => /^\s+$/.test(t);
  const isFn = (t) => /^\[\^\d+\]$/.test(t);
  const isPh = (t) => /^\{\{\w+\}\}$/.test(t);
  Core.isPh = isPh;

  const strictKey = (t) => (isWs(t) ? " " : t);
  const looseKey = (t) => isWs(t) ? " " : t.replace(/[’‘`´]/g, "'").replace(/[«»“”„]/g, '"').replace(/[‐‑‒–—]/g, "-").replace(/\u00A0|\u202F/g, " ");

  /* LCS sur les jetons ; renvoie une suite d'opérations eq/del/ins. */
  function lcsOps(a, b, key) {
    const ka = a.map(key), kb = b.map(key), n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (ka[i] === kb[j]) { ops.push({ t: "eq", a: i, b: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", a: i }); i++; }
      else { ops.push({ t: "ins", b: j }); j++; }
    }
    while (i < n) ops.push({ t: "del", a: i++ });
    while (j < m) ops.push({ t: "ins", b: j++ });
    return ops;
  }

  /* Regroupe en segments lisibles ; un simple espace entre deux changements est absorbé. */
  function segments(a, b, ops) {
    const segs = [];
    const push = (type, tok) => { const last = segs[segs.length - 1]; if (last && last.type === type) last.toks.push(tok); else segs.push({ type, toks: [tok] }); };
    for (const o of ops) o.t === "eq" ? push("eq", a[o.a]) : o.t === "del" ? push("del", a[o.a]) : push("ins", b[o.b]);
    for (let k = 1; k < segs.length - 1; k++) {
      const s = segs[k];
      if (s.type === "eq" && s.toks.every(isWs) && segs[k - 1].type !== "eq" && segs[k + 1].type !== "eq") {
        s.type = "both"; // l'espace appartient aux deux côtés
      }
    }
    const out = [];
    let pendDel = [], pendIns = [];
    const flush = () => { if (pendDel.length) out.push({ type: "del", toks: pendDel }); if (pendIns.length) out.push({ type: "ins", toks: pendIns }); pendDel = []; pendIns = []; };
    for (const s of segs) {
      if (s.type === "eq") { flush(); out.push(s); }
      else if (s.type === "del") pendDel.push(...s.toks);
      else if (s.type === "ins") pendIns.push(...s.toks);
      else { pendDel.push(...s.toks); pendIns.push(...s.toks); }
    }
    flush();
    return out;
  }

  Core.diff = (origText, newText) => {
    const a = Core.tokenize(origText), b = Core.tokenize(newText);
    return segments(a, b, lcsOps(a, b, strictKey));
  };
  /* Résumé compact des modifications d'un paragraphe : seulement les passages modifiés, avec
     quelques mots de contexte de part et d'autre, reliés par « … ». Rien n'est omis. */
  Core.diffSnippets = (origText, newText, ctx, around = 5) => {
    const flat = [];
    for (const s of Core.diff(origText, newText)) for (const tok of s.toks) if (!isFn(tok)) flat.push({ type: s.type, tok });
    const n = flat.length, isWord = (x) => x.type === "eq" && !isWs(x.tok);
    const L = new Array(n).fill(Infinity), R = new Array(n).fill(Infinity);
    for (let i = 0, d = Infinity; i < n; i++) { if (flat[i].type !== "eq") d = 0; else if (isWord(flat[i])) d++; L[i] = d; }
    for (let i = n - 1, d = Infinity; i >= 0; i--) { if (flat[i].type !== "eq") d = 0; else if (isWord(flat[i])) d++; R[i] = d; }
    const keep = flat.map((x, i) => x.type !== "eq" || L[i] <= around || R[i] <= around);
    let html = "", prevKept = false, open = null;
    const close = () => { if (open) { html += `</${open}>`; open = null; } };
    for (let i = 0; i < n; i++) {
      if (!keep[i]) { if (prevKept) { close(); html += " … "; } prevKept = false; continue; }
      if (!prevKept && i > 0 && !html) html += "… ";
      const x = flat[i], tag = x.type === "del" ? "del" : x.type === "ins" ? "ins" : null;
      if (tag !== open) { close(); if (tag) { html += `<${tag} class="rev">`; open = tag; } }
      html += Core.renderTokens([x.tok], ctx); prevKept = true;
    }
    close();
    if (!keep[n - 1]) html = html.replace(/ … $/, " …");
    return html.trim();
  };
  Core.countChanges = (origText, newText) => Core.diff(origText, newText).filter((s) => s.type !== "eq").reduce((n, s, i, arr) => n + (s.type === "ins" && arr[i - 1]?.type === "del" ? 0 : 1), 0);

  /* ---------- Rendu ---------- */
  /* ctx : { values: {structure: "...", date: "..."}, placeholders: {...}, sources: [...] } */
  Core.renderTokens = (toks, ctx) => toks.map((t) => {
    if (isPh(t)) {
      const k = t.slice(2, -2), v = ctx.values && ctx.values[k];
      return v !== undefined && v !== null && v !== "" ? `<span class="ph filled">${Core.esc(v)}</span>` : `<span class="ph">${Core.esc((ctx.placeholders && ctx.placeholders[k]) || "[…]")}</span>`;
    }
    if (isFn(t)) { const n = t.slice(2, -1); return `<button type="button" class="fn" data-fn="${n}" aria-label="Source ${n}">${n}</button>`; }
    return Core.esc(t);
  }).join("");
  /* Sources dans le texte : le passage appuyé par une source est souligné et ouvre sa fiche au survol.
     Si le passage a été modifié par une structure, l'appel de note reste seul. */
  Core.decorateSources = (html, sources) => {
    for (const s of sources || []) {
      if (!s.anchor) continue;
      const a = Core.esc(s.anchor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${a})(<button type="button" class="fn" data-fn="${s.n}"[^>]*>)${s.n}</button>`);
      html = html.replace(re, `<span class="cite" data-fn="${s.n}" tabindex="0">$1</span><button type="button" class="fn mini" data-fn="${s.n}" aria-label="Source ${s.n}">${s.n}</button>`);
    }
    return html;
  };
  Core.renderText = (text, ctx) => Core.renderTokens(Core.tokenize(text), ctx);
  Core.renderDiff = (origText, newText, ctx) => Core.diff(origText, newText).map((s) =>
    s.type === "eq" ? Core.renderTokens(s.toks, ctx)
      : s.type === "del" ? `<del class="rev">${Core.renderTokens(s.toks, ctx)}</del>`
        : `<ins class="rev">${Core.renderTokens(s.toks, ctx)}</ins>`).join("");

  /* ---------- Texte éditable (zone de saisie) ---------- */
  Core.toEditable = (text, motion) => String(text)
    .replace(/\{\{(\w+)\}\}/g, (m, k) => motion.placeholders[k] || m)
    .replace(/\[\^(\d+)\]/g, "[$1]");
  Core.fromEditable = (s, motion) => {
    let t = Core.clean(s, 6000).replace(/\n+/g, " ").replace(/[ \t]+/g, " ");
    for (const [k, label] of Object.entries(motion.placeholders)) {
      if (!k.startsWith("structure")) continue;
      const loose = label.replace(/[’']/g, "['’]").replace(/[[\]]/g, "\\$&");
      t = t.replace(new RegExp(loose, "g"), `{{${k}}}`);
    }
    const max = motion.sources.length;
    return t.replace(/\[(\d{1,2})\]/g, (m, n) => (+n >= 1 && +n <= max ? `[^${n}]` : m));
  };

  /* ---------- État des modifications d'une structure ---------- */
  /* edits : { [id]: {status: "modified"|"deleted", text?} , added: [{after, text}] } représenté
     sous forme de liste de paragraphes finale. */
  Core.baseParagraphs = (motion) => motion.paragraphs.map((p) => ({ id: p.id, kind: p.kind, label: p.label, orig: p.text, text: p.text, status: "same" }));

  Core.editsFromState = (paras) => paras.filter((p) => p.kind === "body" || p.kind === "added" || p.kind === "instruction")
    .filter((p) => p.status !== "same")
    .map((p) => p.status === "added" ? { id: p.id, status: "added", after: p.after, text: p.text }
      : p.status === "deleted" ? { id: p.id, status: "deleted" } : { id: p.id, status: "modified", text: p.text });

  /* Reconstruit la liste des paragraphes d'une structure à partir de ses modifications. */
  Core.applyEdits = (motion, edits) => {
    const paras = Core.baseParagraphs(motion);
    const byId = Object.fromEntries(paras.map((p) => [p.id, p]));
    for (const e of edits || []) {
      if (e.status === "modified" && byId[e.id] && byId[e.id].kind === "body") { byId[e.id].text = e.text; byId[e.id].status = byId[e.id].text === byId[e.id].orig ? "same" : "modified"; }
      if (e.status === "deleted" && byId[e.id] && (byId[e.id].kind === "body" || byId[e.id].kind === "instruction")) byId[e.id].status = "deleted";
    }
    for (const e of (edits || []).filter((x) => x.status === "added")) {
      let idx = paras.findIndex((p) => p.id === e.after);
      while (idx >= 0 && paras[idx + 1] && paras[idx + 1].kind === "added") idx++;
      paras.splice(idx >= 0 ? idx + 1 : paras.findIndex((p) => p.kind === "vote"), 0, { id: e.id, kind: "added", label: "", orig: "", text: e.text, status: "added", after: e.after });
    }
    return paras;
  };
  Core.editCount = (paras) => paras.reduce((n, p) => n + (p.kind === "instruction" ? 0 : p.status === "deleted" || p.status === "added" ? 1 : p.status === "modified" ? Math.max(1, Core.countChanges(p.orig, p.text)) : 0), 0);

  /* ---------- Comparaison d'un texte collé ---------- */
  const SUPERSCRIPTS = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
  Core.splitPasted = (raw, motion) => {
    let lines = String(raw).replace(CTRL, "").replace(/\r\n?/g, "\n").split(/\n/)
      .map((l) => l.replace(/\u00A0|\u202F/g, " ").replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .filter((l) => !/^\[?\(?\d{1,2}[\]\).]?\s*(https?:\/\/|www\.)\S+$/i.test(l))
      .filter((l) => !/^https?:\/\/\S+$/i.test(l))
      .filter((l) => !/^(sources?|notes?|références|references|fuentes)\s*:?$/i.test(l));
    // retire le titre s'il est recopié
    const titleKey = words(motion.title);
    lines = lines.filter((l) => sim(words(l), titleKey) < 0.6);
    // appels de note devenus des chiffres ordinaires au copier-coller (« privées1, »)
    const fnDigits = new RegExp(`(\\p{Ll}{3,})([1-${Math.min(9, motion.sources.length)}])(?=[\\s,.;:)]|$)`, "gu");
    return lines.map((l) => l.replace(SUPERSCRIPTS, "").replace(/(\p{L})\s?\[(\d{1,2})\]/gu, "$1").replace(fnDigits, "$1").replace(/\s+([,.;:!?])/g, (m, p) => (/[;:!?]/.test(p) ? " " + p : p)));
  };
  function words(s) { return new Set(String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) || []); }
  function sim(A, B) { if (!A.size || !B.size) return 0; let x = 0; for (const w of A) if (B.has(w)) x++; return (2 * x) / (A.size + B.size); }
  const stripTokensForCompare = (text) => text.replace(/\{\{\w+\}\}/g, " ").replace(/\[\^\d+\]/g, "");

  /* Transforme un modèle « … {{date}} ({{pour}} Pour… » en expression régulière. */
  function templateRegex(tpl) {
    const keys = [];
    const src = tpl.split(/(\{\{\w+\}\})/).map((part) => {
      const m = part.match(/^\{\{(\w+)\}\}$/);
      if (m) { keys.push(m[1]); return "(.+?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]").replace(/\s+/g, "\\s*");
    }).join("");
    return { re: new RegExp(src, "i"), keys };
  }

  /* Compare un paragraphe d'origine à sa version collée ; garde les appels de note de l'original
     et reconnaît « [insérer le nom de l'UMR] » remplacé par un nom. */
  function compareParagraph(origText, pasted, motion) {
    const a = Core.tokenize(origText);
    const keep = []; const fnAfter = {};
    a.forEach((t) => { if (isFn(t)) { const i = keep.length - 1; (fnAfter[i] = fnAfter[i] || []).push(t); } else keep.push(t); });
    const b = Core.tokenize(pasted);
    const phKey = (t) => (isPh(t) ? "\u0000" + t : looseKey(t));
    const ops = lcsOps(keep, b, phKey);
    const out = []; const fills = {};
    let k = 0;
    while (k < ops.length) {
      const o = ops[k];
      if (o.t === "eq") { out.push(keep[o.a]); (fnAfter[o.a] || []).forEach((f) => out.push(f)); k++; continue; }
      // bloc de changements contigus
      const dels = [], ins = [];
      while (k < ops.length && ops[k].t !== "eq") { const p = ops[k]; p.t === "del" ? dels.push(p.a) : ins.push(b[p.b]); k++; }
      const delToks = dels.map((i) => keep[i]);
      const phs = delToks.filter(isPh);
      const insText = ins.join("").trim();
      if (phs.length === 1 && delToks.every((t) => isPh(t) || isWs(t)) && insText) {
        // « [insérer le nom de l’UMR] » laissé tel quel : ce n'est ni une modification ni une valeur
        if (!/^\[.*\]$/.test(insText)) fills[phs[0].slice(2, -2)] = insText;
        const lead = ins.length && isWs(ins[0]) ? ins[0] : "", trail = ins.length > 1 && isWs(ins[ins.length - 1]) ? ins[ins.length - 1] : "";
        out.push(lead, phs[0], trail);
      } else {
        out.push(...ins);
      }
      dels.forEach((i) => (fnAfter[i] || []).forEach((f) => out.push(f)));
    }
    return { text: out.join("").replace(/\s+/g, " ").trim(), fills };
  }

  /* Aligne les paragraphes collés sur ceux de la motion (programmation dynamique). */
  Core.comparePasted = (raw, motion) => {
    const pasted = Core.splitPasted(raw, motion);
    const fills = {};
    const result = [];
    const fixed = motion.paragraphs.filter((p) => p.kind === "vote" || p.kind === "permvote");
    const remaining = [];
    // paragraphes de vote : extraction des valeurs
    for (const line of pasted) {
      let used = false;
      for (const p of fixed) {
        const { re, keys } = templateRegex(p.text);
        const m = line.match(re);
        if (m) { let got = false; keys.forEach((key, i) => { const v = m[i + 1].trim(); if (!/^\[.*\]$/.test(v)) { fills[key] = v; if (key !== "structure") got = true; } }); used = true; if (p.kind === "permvote" && got) fills.__perm = true; break; }
      }
      if (!used && sim(words(line), words(fixed[0].text)) < 0.55) remaining.push(line);
    }
    const origs = motion.paragraphs.filter((p) => p.kind === "body" || p.kind === "instruction");
    const n = origs.length, m = remaining.length;
    const S = origs.map((o) => remaining.map((l) => sim(words(stripTokensForCompare(o.text)), words(l))));
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], S[i][j] >= 0.3 ? S[i][j] + dp[i + 1][j + 1] : -1);
    let i = 0, j = 0; let lastId = null; const pairs = [];
    while (i < n && j < m) {
      if (S[i][j] >= 0.3 && dp[i][j] === S[i][j] + dp[i + 1][j + 1]) { pairs.push({ o: origs[i], l: remaining[j] }); lastId = origs[i].id; i++; j++; }
      else if (dp[i][j] === dp[i + 1][j]) { pairs.push({ o: origs[i] }); lastId = origs[i].id; i++; }
      else { pairs.push({ l: remaining[j], after: lastId }); j++; }
    }
    while (i < n) { pairs.push({ o: origs[i] }); lastId = origs[i].id; i++; }
    while (j < m) pairs.push({ l: remaining[j++], after: lastId });
    let addN = 0;
    for (const p of pairs) {
      if (p.o && p.l) {
        if (p.o.kind === "instruction") { result.push({ id: p.o.id, status: "same" }); continue; }
        const r = compareParagraph(p.o.text, p.l, motion);
        Object.assign(fills, r.fills);
        result.push({ id: p.o.id, status: r.text === p.o.text ? "same" : "modified", text: r.text });
      } else if (p.o) result.push({ id: p.o.id, status: "deleted" });
      else result.push({ id: "ajout-" + (++addN), status: "added", after: p.after || origs[0].id, text: Core.fromEditable(p.l, motion) });
    }
    return { paragraphs: result, fills };
  };

  /* ---------- Validation d'un fichier de structure ---------- */
  const LOGO = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
  Core.validateLab = (raw, motion) => {
    const errors = [];
    if (!raw || typeof raw !== "object") return { lab: null, errors: ["Le fichier n’est pas un objet JSON."] };
    const s = raw.structure || {}, ag = raw.ag || {}, pm = raw.permanents || {};
    const lab = {
      schema: 1,
      example: raw.example === true,
      id: Core.slug(raw.id || s.name || ""),
      submitted_at: Core.cleanLine(raw.submitted_at, 40),
      structure: {
        name: Core.cleanLine(s.name, 160), acronym: Core.cleanLine(s.acronym, 30), institution: Core.cleanLine(s.institution, 160),
        department: Core.cleanLine(s.department, 160), city: Core.cleanLine(s.city, 80), country: Core.cleanLine(s.country, 80), topic: Core.cleanLine(s.topic, 80)
      },
      logo: typeof raw.logo === "string" && LOGO.test(raw.logo) && raw.logo.length < 300000 ? raw.logo : "",
      ag: { date: /^\d{4}-\d{2}-\d{2}$/.test(ag.date || "") ? ag.date : "", pour: Core.int(ag.pour), contre: Core.int(ag.contre), abstention: Core.int(ag.abstention) },
      permanents: { supported: pm.supported === true, pour: Core.int(pm.pour), contre: Core.int(pm.contre), abstention: Core.int(pm.abstention) },
      motion: { base_version: Core.cleanLine(raw.motion && raw.motion.base_version, 40), edits: [] }
    };
    if (!lab.structure.name) errors.push("Nom de structure manquant.");
    if (!lab.structure.city) errors.push("Ville manquante.");
    if (!lab.ag.pour) errors.push("Aucune voix pour.");
    if (raw.logo && !lab.logo) errors.push("Logo ignoré : seules les images JPEG ou PNG de moins de 220 Ko sont acceptées.");
    const known = new Set(motion.paragraphs.map((p) => p.id));
    for (const e of ((raw.motion && raw.motion.edits) || []).slice(0, 40)) {
      if (!e || typeof e !== "object") continue;
      const id = Core.cleanLine(e.id, 40), status = e.status;
      if (status === "modified" && known.has(id)) lab.motion.edits.push({ id, status, text: Core.clean(e.text, 6000).replace(/\s+/g, " ") });
      else if (status === "deleted" && known.has(id)) lab.motion.edits.push({ id, status });
      else if (status === "added") lab.motion.edits.push({ id: Core.slug(id), status, after: known.has(e.after) ? e.after : "financement", text: Core.clean(e.text, 6000).replace(/\s+/g, " ") });
      else errors.push(`Modification ignorée : « ${id} ».`);
    }
    return { lab: lab.structure.name ? lab : null, errors };
  };

  /* ---------- Logo de secours : un chat, déterministe ---------- */
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 10000) / 10000; }; }
  const BGS = ["#dfe6fb", "#fbe1e3", "#e9e3f6", "#e1f1ea", "#fbefd9", "#e3eef6", "#f4e4f0"];
  const FURS = [["#f2a65a", "#d9803a"], ["#8d8f99", "#6c6e78"], ["#2a2a33", "#16161c"], ["#f4f1ea", "#d9d3c6"], ["#c58b5a", "#9c6a3f"], ["#e8d4b0", "#c8ad80"], ["#5b4b44", "#3e322d"]];
  const EYES = ["#7dbb4a", "#e2b33a", "#4aa3d9", "#c9893a"];
  Core.catSVG = (key) => {
    const r = rng(hash(key));
    const bg = BGS[Math.floor(r() * BGS.length)], [fur, dark] = FURS[Math.floor(r() * FURS.length)], eye = EYES[Math.floor(r() * EYES.length)];
    const earT = 8 + r() * 5, tilt = (r() - 0.5) * 10, stripes = r() > 0.5, patch = r() > 0.6, sleepy = r() > 0.8;
    const line = fur === "#2a2a33" || fur === "#5b4b44" ? "#f4f1ea" : "#2a2a33";
    let s = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="64" height="64" fill="${bg}"/><g transform="rotate(${tilt.toFixed(1)} 32 36)">`;
    s += `<path d="M14 30 L${(16 - r() * 3).toFixed(1)} ${earT.toFixed(1)} L28 22 Z" fill="${fur}"/><path d="M50 30 L${(48 + r() * 3).toFixed(1)} ${earT.toFixed(1)} L36 22 Z" fill="${fur}"/>`;
    s += `<path d="M17 27 L18 ${(earT + 6).toFixed(1)} L25 23 Z" fill="#f2b7c0"/><path d="M47 27 L46 ${(earT + 6).toFixed(1)} L39 23 Z" fill="#f2b7c0"/><ellipse cx="32" cy="38" rx="20" ry="17" fill="${fur}"/>`;
    if (patch) s += `<path d="M32 21 C22 22 14 30 13 38 C20 34 26 30 32 30 Z" fill="${dark}"/>`;
    if (stripes) s += `<path d="M28 23 L29 29 M32 22 L32 29 M36 23 L35 29" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
    s += sleepy ? `<path d="M21 37 Q25 40 29 37 M35 37 Q39 40 43 37" stroke="${line}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="25" cy="36" rx="3.4" ry="4" fill="${eye}"/><ellipse cx="39" cy="36" rx="3.4" ry="4" fill="${eye}"/><ellipse cx="25" cy="36.3" rx="1" ry="3" fill="#16161c"/><ellipse cx="39" cy="36.3" rx="1" ry="3" fill="#16161c"/>`;
    s += `<path d="M30 43 L34 43 L32 45.5 Z" fill="#e88a99"/><path d="M32 45.5 Q30 48 28 47 M32 45.5 Q34 48 36 47" stroke="${line}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M22 44 L10 42 M22 46 L11 48 M42 44 L54 42 M42 46 L53 48" stroke="${line}" stroke-width=".9" opacity=".7" stroke-linecap="round"/></g></svg>`;
    return s;
  };

  Core.pct = (a, b, c) => { const t = a + b + c; return t ? [a, b, c].map((x) => Math.round((x / t) * 100)) : [0, 0, 0]; };

  window.Core = Core;
})();
