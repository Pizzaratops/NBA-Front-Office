#!/usr/bin/env python3
"""
build_player_values.py
──────────────────────
Fantasy-Punkte pro Spiel aller NBA-Spieler im NBAFO-Scoring (Fantrax) →
data/player-values.json. Grundlage für FP/G im Roster, Teamstärke,
Power Ranking und Trade-Bewertung.

Quelle: die täglichen ESPN-Box-Scores, die das MFHFB-HQ-Repo ohnehin sammelt
  raw.githubusercontent.com/Pizzaratops/MFHFBHQ/main/sports/nba/scripts/data/daily-9cat_nba_<datum>.games.json
(je Spiel und Spieler: MIN, PTS, REB/OREB/DREB, AST, STL, BLK, TO, 3PM, FGM/FGA, FTM/FTA, +/-).

NBAFO-Scoring (Fantrax, Stand 02.11.2026):
  PTS 2 · OREB 2.5 · DREB 2 · AST 2.5 · STL 5 · BLK 5 · 3PTM 3 · TO −3
  FG verfehlt −2.5 · FTM 1 · FT verfehlt −2 · MIN 1 · +/− 1.5
Fehlen OREB/DREB oder +/− in einem Spiel (ältere Box Scores), wird REB mit
2.125 gewertet (Mischung 25 % OREB / 75 % DREB) und +/− mit 0; solche Spiele
zählen in "approx".

Usage: python3 scripts/build_player_values.py [--local <pfad zum MFHFBHQ-Repo>]
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "player-values.json")
RAW = "https://raw.githubusercontent.com/Pizzaratops/MFHFBHQ/main/sports/nba/scripts/data/"
SEASON_START = date(2026, 10, 20)

SC = {"pts": 2, "oreb": 2.5, "dreb": 2, "ast": 2.5, "stl": 5, "blk": 5, "tpm": 3, "to": -3,
      "fgmiss": -2.5, "ftm": 1, "ftmiss": -2, "min": 1, "pm": 1.5}


def fp(p):
    approx = p.get("oreb") is None or p.get("dreb") is None or p.get("pm") is None
    reb_pts = (p.get("oreb") or 0) * SC["oreb"] + (p.get("dreb") or 0) * SC["dreb"] if p.get("oreb") is not None and p.get("dreb") is not None \
        else (p.get("reb") or 0) * 2.125
    v = ((p.get("pts") or 0) * SC["pts"] + reb_pts + (p.get("ast") or 0) * SC["ast"] + (p.get("stl") or 0) * SC["stl"]
         + (p.get("blk") or 0) * SC["blk"] + (p.get("tpm") or 0) * SC["tpm"] + (p.get("to") or 0) * SC["to"]
         + ((p.get("fga") or 0) - (p.get("fgm") or 0)) * SC["fgmiss"] + (p.get("ftm") or 0) * SC["ftm"]
         + ((p.get("fta") or 0) - (p.get("ftm") or 0)) * SC["ftmiss"] + (p.get("min") or 0) * SC["min"]
         + (p.get("pm") or 0) * SC["pm"])
    return round(v, 1), approx


def load_day(d, local):
    name = f"daily-9cat_nba_{d.isoformat()}.games.json"
    if local:
        f = os.path.join(local, "sports", "nba", "scripts", "data", name)
        return json.load(open(f, encoding="utf-8")) if os.path.exists(f) else None
    try:
        with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "nbafo"}), timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main():
    local = sys.argv[sys.argv.index("--local") + 1] if "--local" in sys.argv else None
    today = datetime.now(timezone.utc).date()
    logs = defaultdict(list)  # name -> [(date, fp, min, team, approx)]
    days = 0
    d = SEASON_START
    while d <= today:
        day = load_day(d, local)
        if day:
            days += 1
            for g in day.get("games", []):
                if not g.get("completed"):
                    continue
                for side in ("away", "home"):
                    s = g.get(side) or {}
                    for p in s.get("players", []):
                        if not p.get("min"):
                            continue
                        v, approx = fp(p)
                        logs[p["name"]].append((d.isoformat(), v, p["min"], s.get("abbr"), approx))
        d += timedelta(days=1)
    if not logs:
        print("❌ keine Box Scores gefunden — player-values.json bleibt unverändert.", file=sys.stderr)
        return 1

    def avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    cut14 = (today - timedelta(days=14)).isoformat()
    cut7 = (today - timedelta(days=7)).isoformat()
    players = {}
    for name, L in logs.items():
        L.sort()
        players[name] = {
            "team": L[-1][3],
            "gp": len(L),
            "fpg": avg([x[1] for x in L]),
            "min": avg([x[2] for x in L]),
            "l14": avg([x[1] for x in L if x[0] >= cut14]),
            "l7": avg([x[1] for x in L if x[0] >= cut7]),
            "last": [[x[0][5:], x[1]] for x in L[-5:]],
            "approx": sum(1 for x in L if x[4]),
        }
    out = {"updated": datetime.now(timezone.utc).isoformat(), "season_start": SEASON_START.isoformat(),
           "days": days, "scoring": SC, "players": players}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"✅ player-values.json: {len(players)} Spieler aus {days} Spieltagen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
