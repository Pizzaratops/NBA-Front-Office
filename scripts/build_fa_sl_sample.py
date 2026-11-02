#!/usr/bin/env python3
"""
build_fa_sl_sample.py
─────────────────────
Baut data/fa-sl-sample.json (Summer-League-Stichprobe für die FA-Seite,
wird von js/fa-sl-enhance.js geladen) aus den Tages-Boxscores der Summer
League 2026 (California Classic, Salt Lake City, Las Vegas), die das
MFHFB-HQ-Repo ohnehin sammelt:
  github.com/Pizzaratops/MFHFBHQ  sports/nba/scripts/data/daily-9cat_nba-summer-*_<datum>.csv

Ausgabe je Spieler: {gp, min, pts, reb, ast, stl, blk, tpm, teams} — alles
Pro-Spiel-Schnitte über alle SL-Spiele. Nur einmal pro Sommer nötig.

Usage: python3 scripts/build_fa_sl_sample.py [--local <pfad zum MFHFBHQ-Repo>]
"""
import csv, io, json, os, sys, urllib.request
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "fa-sl-sample.json")
API = "https://api.github.com/repos/Pizzaratops/MFHFBHQ/contents/sports/nba/scripts/data"
RAW = "https://raw.githubusercontent.com/Pizzaratops/MFHFBHQ/main/sports/nba/scripts/data/"


def sources():
    if "--local" in sys.argv:
        base = os.path.join(sys.argv[sys.argv.index("--local") + 1], "sports", "nba", "scripts", "data")
        for f in sorted(os.listdir(base)):
            if f.startswith("daily-9cat_nba-summer-") and f.endswith(".csv"):
                yield f, open(os.path.join(base, f), encoding="utf-8").read()
        return
    listing = json.load(urllib.request.urlopen(urllib.request.Request(API, headers={"User-Agent": "nbafo"})))
    for item in listing:
        f = item["name"]
        if f.startswith("daily-9cat_nba-summer-") and f.endswith(".csv"):
            yield f, urllib.request.urlopen(RAW + f).read().decode("utf-8")


def main():
    acc = defaultdict(lambda: defaultdict(float))
    teams = defaultdict(set)
    files = 0
    for name, text in sources():
        files += 1
        for r in csv.DictReader(io.StringIO(text)):
            n = (r.get("Name") or "").strip()
            if not n:
                continue
            a = acc[n]
            a["gp"] += 1
            for k, col in (("min", "MIN"), ("pts", "PTS"), ("reb", "REB"), ("ast", "AST"), ("stl", "STL"), ("blk", "BLK"), ("tpm", "3PM")):
                try:
                    a[k] += float(r.get(col) or 0)
                except ValueError:
                    pass
            if r.get("Team"):
                teams[n].add(r["Team"])
    out = {}
    for n, a in acc.items():
        gp = int(a["gp"])
        out[n] = {"gp": gp, **{k: round(a[k] / gp, 1) for k in ("min", "pts", "reb", "ast", "stl", "blk", "tpm")}, "teams": sorted(teams[n])}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print(f"✅ {len(out)} Spieler aus {files} Summer-League-Tagen → data/fa-sl-sample.json")


if __name__ == "__main__":
    main()
