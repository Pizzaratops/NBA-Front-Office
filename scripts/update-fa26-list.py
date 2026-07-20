#!/usr/bin/env python3
"""
Erzeugt data/fa26-list.json neu aus einem Free-Agents-Excel-Export der
NBA-Front-Office-Liga (Tab "FA26" im Google Sheet, Spalte A = Spielername).

Nutzung:
    python3 scripts/update-fa26-list.py /pfad/zu/Free_Agents.xlsx

Solange es keine automatisierte Anbindung an das Front-Office-Sheet gibt
(separates Repo, separater Automatisierungs-Workflow), einfach den
"FA26"-Tab als .xlsx exportieren und hier durchlaufen lassen.
"""
import sys, json, re, unicodedata
from datetime import date

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl fehlt: pip install openpyxl --break-system-packages")


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[.']", "", s)
    s = re.sub(r"\bjr\b|\bii\b|\biii\b|\biv\b|\bv\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    if len(sys.argv) != 2:
        sys.exit("Nutzung: python3 scripts/update-fa26-list.py <Free_Agents.xlsx>")

    wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
    ws = wb.active  # erstes/aktives Tabellenblatt
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        sys.exit("Leere Datei.")

    names = [r[0] for r in rows[1:] if r and r[0]]
    if not names:
        sys.exit("Keine Namen in Spalte A gefunden — Tab-Layout geändert?")

    out = {
        "_readme": (
            "FA26-Namensliste (Free Agents) aus der NBA-Front-Office-Liga, "
            "fuer den FA-Abgleich in index.html. Neu erzeugt mit "
            "scripts/update-fa26-list.py."
        ),
        "updated": date.today().isoformat(),
        "names": sorted(set(names), key=norm),
        "normalized_index": sorted(set(norm(n) for n in names)),
    }

    with open("data/fa26-list.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"{len(names)} Namen geschrieben -> data/fa26-list.json")


if __name__ == "__main__":
    main()
