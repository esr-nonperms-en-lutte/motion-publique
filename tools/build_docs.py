#!/usr/bin/env python3
"""Génère downloads/motion-<langue>.{txt,docx,pdf} pour chaque content/motion.<langue>.json.

Usage : python3 tools/build_docs.py   (nécessite pandoc ; xelatex pour le PDF)
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "downloads"
OUT.mkdir(exist_ok=True)
SOURCES_TITLE = {"fr": "Sources", "en": "Sources", "es": "Fuentes"}


def md_escape(s):
    return re.sub(r"([\\`*_{}#<>|])", r"\\\1", s).replace("[", "\\[").replace("]", "\\]")


def build(lang):
    m = json.loads((ROOT / f"content/motion.{lang}.json").read_text(encoding="utf-8"))
    ph = m["placeholders"]

    def plain(text):
        text = re.sub(r"\{\{(\w+)\}\}", lambda g: ph.get(g.group(1), g.group(0)), text)
        return re.sub(r"\[\^(\d+)\]", r"[\1]", text)

    def md(text):
        res = []
        for p in re.split(r"(\{\{\w+\}\}|\[\^\d+\])", text):
            g = re.fullmatch(r"\{\{(\w+)\}\}", p)
            if g:
                res.append("*" + md_escape(ph.get(g.group(1), "")) + "*")
            elif re.fullmatch(r"\[\^\d+\]", p):
                res.append(p)
            else:
                res.append(md_escape(p))
        return "".join(res)

    # texte brut
    lines = [m["title"], ""]
    for p in m["paragraphs"]:
        lines += [plain(p["text"]), ""]
    lines += [SOURCES_TITLE.get(lang, "Sources"), ""] + [f"[{s['n']}] {s['url']}" for s in m["sources"]]
    (OUT / f"motion-{lang}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Word et PDF via pandoc (consignes en italique, sources en notes de bas de page)
    body = [f"*{md(p['text'])}*" if p["kind"] == "instruction" else md(p["text"]) for p in m["paragraphs"]]
    notes = [f"[^{s['n']}]: {md_escape(s['publisher'])}, « {md_escape(s['title'])} ». <{s['url']}>" for s in m["sources"]]
    meta = ["---", "title: " + json.dumps(m["title"], ensure_ascii=False), f"lang: {lang}", "mainfont: \"Times New Roman\"", "geometry: margin=2.4cm",
            "fontsize: 11pt", "linestretch: 1.2", "colorlinks: true", "---", ""]
    src = OUT / f"_motion-{lang}.md"
    src.write_text("\n".join(meta) + "\n\n".join(body) + "\n\n" + "\n".join(notes) + "\n", encoding="utf-8")
    try:
        subprocess.run(["pandoc", str(src), "-o", str(OUT / f"motion-{lang}.docx")], check=True)
        try:
            subprocess.run(["pandoc", str(src), "-o", str(OUT / f"motion-{lang}.pdf"), "--pdf-engine=xelatex"], check=True)
        except Exception as e:
            print(f"PDF {lang} non généré :", e, file=sys.stderr)
    finally:
        src.unlink(missing_ok=True)


for f in sorted((ROOT / "content").glob("motion.*.json")):
    build(f.name.split(".")[1])
print("OK :", ", ".join(p.name for p in sorted(OUT.iterdir())))
