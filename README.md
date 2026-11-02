# NBA Front Office (NBAFO)

https://pizzaratops.github.io/NBA-Front-Office/

Begleit-Tool für die NBAFO-Liga: Offseason-Guide, Roster-App (Kader, Gehälter, Optionen,
Exceptions), Free Agents, Trade Calculator/Finder und CBA-Tools. Stand der Doku: 02.11.2026.

## Seiten

| Datei | Inhalt |
|---|---|
| `index.html` | Offseason-Guide (EN/DE), Timeline, Regel-Bibliothek |
| `app.html` | Roster-App: `js/app.js` + `fa-bidding.js`, `fa-ranking.js`, `fa-sl-enhance.js` |
| `daten.html` | Datenstatus (letztes Update, Quelle) |

## Daten

```
data/data.json          ← automatisch aus dem Google Sheet (3x täglich)
data/fa-sl-sample.json  ← Summer League 2026 (scripts/build_fa_sl_sample.py, 1x pro Sommer)
data/fa-ranking.json    ← FA-Ranking, Snapshot 19.07.2026 (Composite, nicht automatisch)
data/fa-value-tiers.json← Vertrags-Tiers zum Ranking, Snapshot 19.07.2026
```

### Automatische Aktualisierung

`.github/workflows/update-data.yml` läuft um 07:00, 15:00 und 23:00 UTC (und manuell über
*Actions → Auto-Update Data → Run workflow*). `scripts/update_data.py` lädt das komplette
Sheet (`1REnOtl5b7IQSbxBaeGPPs6KnPwhHmwY8vltQcVh6jgQ`) als xlsx und baut `data/data.json` neu.

Aus jedem Team-Tab (`ATL` … `WAS`; abweichende Tab-Namen wie `GSW`/`NYK`/`UTA`/`WAS`
werden automatisch erkannt, fehlende Tabs behalten den alten Stand mit `stale: true`):

- **Kader** (`players`): Gehälter 2026-27 bis 2031-32, Positionen, QO, Bird Rights, Signed via, Notizen
- **Optionen aus den Zellfarben** (Legende im Tab): `PO`, `TO`, `QO`, `NG` (nicht garantiert)
  → `flags` je Saison, `opt`/`opt_year` = nächste Option
- **Two-way** (`two_way`) und **Waived** (`waived`, `dead_money`) getrennt vom Kader
- **Exceptions** (`exceptions`): Taxpayer, MLE-Typ + Rest, BAE, DPE, TPEs (Betrag + Ablauf),
  Hard Cap, Cap Space
- **CBA-Werte** aus `CtrlPanel`, **FA-Pool** aus `FA26`

Der Owner Cap ist laut Addendum Q71 seit 2024 abgeschafft und wird nicht mehr ausgegeben;
das frühere Owner-Cap-Dashboard ist jetzt **Tools → Cap & Exceptions**.

`meta.sheet_tabs` listet alle Tabs des Sheets (hilft, wenn etwas umbenannt wird).

## Trade-Regeln in der App

Salary Matching nach NBA-CBA 2023, Schwellen mit dem Cap skaliert (Basis 2023-24: $136.0M):
unter dem 1st Apron nach dem Trade 200 % + $0.3M bis $9.1M, +$9.1M bis $35.2M, darüber 125 % + $0.3M;
über dem 1st Apron höchstens 100 %; über dem 2nd Apron keine Gehalts-Aggregation; Hard Cap wird
geprüft. Trade Calculator und Trade Finder prüfen beide Seiten.

## Lokal testen

```bash
pip install openpyxl
python3 scripts/update_data.py   # aktualisiert data/data.json
python3 -m http.server 8000      # http://localhost:8000/app.html
```

## Offen

- Erklärserie liegt unter `serie/` (Teil 1–10, nur Englisch); die „→ Part/Teil X“-Hinweise im Guide verlinken dorthin.
- 17 Spieler haben im Sheet keine Positions-Markierung (Anzeige „?“).
