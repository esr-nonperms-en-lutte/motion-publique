#!/usr/bin/env python3
"""Vérifie les fichiers labs/*.json et écrit labs/index.json.

Usage : python3 tools/validate_labs.py [dossier]   (par défaut : labs)
Sort en erreur si un fichier est invalide : la publication est alors bloquée.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
folder = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "labs")
motion = json.loads((ROOT / "content/motion.fr.json").read_text(encoding="utf-8"))
known = {p["id"] for p in motion["paragraphs"]}
LOGO = re.compile(r"^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALLOWED_TOP = {"schema", "example", "addendum", "id", "submitted_at", "structure", "logo", "ag", "permanents", "motion"}

def check(path):
    errs = []
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"JSON illisible : {e}"]
    if not isinstance(d, dict):
        return ["le fichier doit contenir un objet"]
    extra = set(d) - ALLOWED_TOP
    if extra: errs.append(f"champs inconnus : {sorted(extra)}")
    s = d.get("structure") or {}
    for k in ("name", "institution", "city", "country"):
        if not isinstance(s.get(k), str) or not s[k].strip(): errs.append(f"structure.{k} manquant")
    for k, v in s.items():
        if not isinstance(v, str) or len(v) > 160 or re.search(r"[<>]", v): errs.append(f"structure.{k} invalide")
    logo = d.get("logo", "")
    if logo and (not isinstance(logo, str) or not LOGO.match(logo) or len(logo) > 300000): errs.append("logo invalide (JPEG/PNG en data URI, < 220 Ko)")
    ag = d.get("ag") or {}
    if not DATE.match(str(ag.get("date", ""))): errs.append("ag.date invalide")
    for k in ("pour", "contre", "abstention"):
        if not isinstance(ag.get(k), int) or ag[k] < 0: errs.append(f"ag.{k} invalide")
    if isinstance(ag.get("pour"), int) and ag["pour"] <= ag.get("contre", 0): errs.append("la motion n'a pas la majorité")
    if not isinstance(d.get("example", False), bool): errs.append("example doit valoir true ou false")
    pm = d.get("permanents") or {}
    if not isinstance(pm.get("supported", False), bool): errs.append("permanents.supported invalide")
    if pm.get("date") and not DATE.match(str(pm["date"])): errs.append("permanents.date invalide")
    if (d.get("motion") or {}).get("lang", "fr") not in ("fr", "en", "es"): errs.append("motion.lang invalide")
    for e in (d.get("motion") or {}).get("edits", []):
        st, pid = e.get("status"), e.get("id", "")
        if st in ("modified", "deleted") and pid not in known: errs.append(f"paragraphe inconnu : {pid}")
        elif st not in ("modified", "deleted", "added"): errs.append(f"statut inconnu : {st}")
        if st in ("modified", "added") and (not isinstance(e.get("text"), str) or len(e["text"]) > 6000): errs.append(f"texte invalide : {pid}")
        if st == "added" and e.get("after") not in known: errs.append(f"position inconnue : {e.get('after')}")
    return errs

files, bad = [], 0
for p in sorted(folder.glob("*.json")):
    if p.name == "index.json": continue
    errs = check(p)
    if errs:
        bad += 1
        print(f"✗ {p.name}"); [print("   -", e) for e in errs]
    else:
        print(f"✓ {p.name}"); files.append(p.name)
(folder / "index.json").write_text(json.dumps(files, indent=2) + "\n", encoding="utf-8")
print(f"{len(files)} fichier(s) valide(s), {bad} en erreur.")
sys.exit(1 if bad else 0)
