#!/usr/bin/env python3
"""
update_data.py
──────────────
Holt die Google-Sheet-Daten (CSV-Export) und aktualisiert data/data.json,
damit die Webseite (index.html) automatisch aktuelle Zahlen anzeigt.

Wird 3x täglich von .github/workflows/update-data.yml ausgeführt.

WICHTIG - Bitte anpassen:
Dieses Skript kennt die genaue Spalten-Struktur deines Google Sheets nicht
(ich hatte keinen Lesezugriff darauf). Es lädt den rohen CSV-Export herunter
und zeigt ihn in der Konsole/als Artefakt an. Du musst die Funktion
`parse_sheet_to_data()` unten einmalig an deine echten Spaltennamen anpassen
(z.B. Name, Team, Gehalt 26-27, Gehalt 27-28, Bird Rights, ...).

Sobald das gemappt ist, läuft die Automatisierung komplett von selbst.
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

# ── KONFIGURATION ────────────────────────────────────────────────────────
# Die Sheet-ID aus deinem Link:
SHEET_ID = "1REnOtl5b7IQSbxBaeGPPs6KnPwhHmwY8vltQcVh6jgQ"

# Welche Tabs (gid) sollen geladen werden? gid=82 ist der Tab aus deinem Link.
# Falls du mehrere Tabs hast (z.B. einen pro Team, oder FA-Liste, Owner-Caps),
# hier weitere Einträge ergänzen: {"name": "fas", "gid": "123"}
SHEETS = [
    {"name": "main", "gid": "82"},
]

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "data.json")


def csv_export_url(sheet_id: str, gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def fetch_csv(url: str) -> list[dict]:
    """Lädt eine CSV-URL und gibt eine Liste von Zeilen (als dict) zurück."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    return list(reader)


def parse_sheet_to_data(rows: list[dict], existing: dict) -> dict:
    """
    ⚠️ ANPASSEN: Diese Funktion muss wissen, welche Spalten dein Sheet hat.

    Aktuell macht sie NICHTS Destruktives: sie lässt `existing` (die bisherigen
    Daten in data/data.json) unverändert, damit die Seite nie kaputt geht,
    auch wenn das Mapping noch fehlt.

    Beispiel, wie ein echtes Mapping aussehen könnte (auskommentiert):

        for row in rows:
            team_abbr = row["Team"].strip()
            player_name = row["Spieler"].strip()
            team = existing["teams"].setdefault(team_abbr, {...})
            player = next((p for p in team["players"] if p["name"] == player_name), None)
            if player:
                player["sal_26"] = int(row["Gehalt 26-27"].replace("$","").replace(",","") or 0)
                player["sal_27"] = int(row["Gehalt 27-28"].replace("$","").replace(",","") or 0) or None
                player["bird"] = row["Bird Rights"].strip() or None
            # ... total_salary neu berechnen usw.

    Bis du das Mapping ergänzt hast, wird nur `meta.last_updated` und
    `meta.raw_row_count` aktualisiert, damit du in daten.html siehst,
    dass die Automatisierung grundsätzlich läuft.
    """
    existing.setdefault("meta", {})
    existing["meta"]["last_updated"] = datetime.now(timezone.utc).isoformat()
    existing["meta"]["raw_row_count"] = len(rows)
    existing["meta"]["source"] = "Google Sheets (auto-fetch)"

    # TODO: echtes Mapping hier einbauen, sobald die Sheet-Spalten bekannt sind.

    return existing


def main() -> int:
    if not os.path.exists(DATA_PATH):
        print(f"❌ {DATA_PATH} nicht gefunden.", file=sys.stderr)
        return 1

    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    all_rows = []
    for sheet in SHEETS:
        url = csv_export_url(SHEET_ID, sheet["gid"])
        print(f"→ Lade {sheet['name']} von {url}")
        try:
            rows = fetch_csv(url)
            print(f"  {len(rows)} Zeilen geladen.")
            all_rows.extend(rows)
        except Exception as e:
            print(f"  ⚠️ Fehler beim Laden von {sheet['name']}: {e}", file=sys.stderr)

    data = parse_sheet_to_data(all_rows, data)

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("✅ data/data.json aktualisiert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
