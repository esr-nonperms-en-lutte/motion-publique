#!/usr/bin/env python3
"""Génère downloads/motion-fr.{txt,docx,pdf} à partir de content/motion.fr.json.

Usage : python3 tools/build_docs.py   (nécessite pandoc ; xelatex pour le PDF)
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
m = json.loads((ROOT / "content/motion.fr.json").read_text(encoding="utf-8"))
out = ROOT / "downloads"
out.mkdir(exist_ok=True)
ph = m["placeholders"]

def plain(text):
    text = re.sub(r"\{\{(\w+)\}\}", lambda g: ph.get(g.group(1), g.group(0)), text)
    return re.sub(r"\[\^(\d+)\]", r"[\1]", text)

def md_escape(s):
    return re.sub(r"([\\`*_{}#<>|])", r"\\\1", s)

def md(text):
    # placeholders en italique, appels de note pandoc
    parts = re.split(r"(\{\{\w+\}\}|\[\^\d+\])", text)
    res = []
    for p in parts:
        g = re.fullmatch(r"\{\{(\w+)\}\}", p)
        f = re.fullmatch(r"\[\^(\d+)\]", p)
        if g:
            res.append("*" + md_escape(ph.get(g.group(1), "")).replace("[", "\\[").replace("]", "\\]") + "*")
        elif f:
            res.append(p)
        else:
            res.append(md_escape(p).replace("[", "\\[").replace("]", "\\]"))
    return "".join(res)

# --- texte brut
lines = [m["title"], ""]
for p in m["paragraphs"]:
    lines += [plain(p["text"]), ""]
lines += ["Sources", ""] + [f"[{s['n']}] {s['url']}" for s in m["sources"]]
(out / "motion-fr.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

# --- markdown pour pandoc
body = []
for p in m["paragraphs"]:
    t = md(p["text"])
    body.append(f"*{t}*" if p["kind"] == "instruction" else t)
notes = [f"[^{s['n']}]: {md_escape(s['publisher'])}, « {md_escape(s['title'])} ». <{s['url']}>" for s in m["sources"]]
doc = "\n\n".join(body) + "\n\n" + "\n".join(notes) + "\n"
meta = ["---", f"title: \"{m['title']}\"", "lang: fr-FR", "mainfont: \"Times New Roman\"", "geometry: margin=2.4cm", "fontsize: 11pt",
        "linestretch: 1.2", "colorlinks: true", "header-includes: |", "  \\usepackage{ragged2e}", "---", ""]
src = out / "_motion.md"
src.write_text("\n".join(meta) + doc, encoding="utf-8")

subprocess.run(["pandoc", str(src), "-o", str(out / "motion-fr.docx")], check=True)
try:
    subprocess.run(["pandoc", str(src), "-o", str(out / "motion-fr.pdf"), "--pdf-engine=xelatex"], check=True)
except Exception as e:
    print("PDF non généré :", e, file=sys.stderr)
src.unlink()
print("OK :", ", ".join(p.name for p in sorted(out.iterdir())))
