#!/usr/bin/env python3
"""
Baut data/fa-sl-sample.json aus dem CSV-Export des Summer League Explorer
(nbadraft.app), kombiniert 2025+2026.

WICHTIG — der Bug, den dieses Skript behebt:
Die Spalten PTS/REB/AST (und alle anderen Boxscore-Zaehler wie FGM/FGA/STL/
BLK/TOV/PF/...) im CSV-Export sind PER-36-MINUTEN-Hochrechnungen, keine
echten Pro-Spiel-Werte. Erkennbar z.B. an Craig Porter Jr: GP=1, MIN=6.5,
PTS=38.8 -- 38.8 Punkte in 6.5 Minuten sind unmoeglich als Rohwert, aber
plausibel als Per-36-Rate (real: 38.8 * 6.5/36 = 7.0 Punkte).

Dieses Skript rechnet PTS/REB/AST zurueck auf echte Pro-Spiel-Werte
(rate * min/36), damit sie im Free-Agents-Badge und ueberall sonst als das
angezeigt werden, was sie sind: echte Summer-League-Pro-Spiel-Schnitte.

GP und MIN selbst sind KEINE Raten und werden unveraendert uebernommen.

Usage:
    python3 scripts/build_fa_sl_sample.py path/to/summer-league-explorer.csv \
        > data/fa-sl-sample.json
"""
import csv
import json
import sys


def build(csv_path: str) -> dict:
    out = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("Player") or "").strip()
            if not name:
                continue
            try:
                gp = int(float(row["GP"]))
                minutes = float(row["MIN"])
                pts_per36 = float(row["PTS"])
                reb_per36 = float(row["REB"])
                ast_per36 = float(row["AST"])
            except (KeyError, ValueError):
                # unvollstaendige Zeile -> ueberspringen statt falsche Daten schreiben
                continue

            factor = minutes / 36.0
            out[name] = {
                "gp": gp,
                "min": round(minutes, 1),
                "pts": round(pts_per36 * factor, 1),
                "reb": round(reb_per36 * factor, 1),
                "ast": round(ast_per36 * factor, 1),
            }
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: build_fa_sl_sample.py <csv_path>", file=sys.stderr)
        sys.exit(1)
    data = build(sys.argv[1])
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    print()
