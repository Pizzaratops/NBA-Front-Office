#!/usr/bin/env python3
"""
sync_fantrax.py
───────────────
NBAFO-Liga auf Fantrax (leagueId mfr0b97kmqgsztrm) → data/fantrax.json

Öffentliche Fantrax-API (fxea, ohne Login, aus GitHub Actions erreichbar):
  getLeagueInfo   Teams, Scoring-Perioden (Wochen), Positionen
  getStandings    W-L, Punkte (Fantrax rechnet All-Play: jede Woche gegen alle 29)
  getTeamRosters  Kader je Periode (ACTIVE/RESERVE) — Weekly Lineups
  getPlayerIds    Fantrax-ID → Name

Wochen-Scores: Fantrax liefert keine Punkte je Woche. Wir rechnen sie selbst:
aktive Spieler der Periode × ihre Spiele in der Periode (FP aus
data/player-values.json, NBAFO-Scoring). Perioden laufen Montag 19:00 ET bis
Montag 18:59 ET → Spiele am Montag zählen zur NEUEN Woche (Startdatum der
Periode). Kontrolle: Summe unserer Wochen-Scores × 29 vs. Fantrax-PF.

Daraus: All-Play-Bilanz je Woche, Rolling Rankings, Kader-Abgleich Fantrax ↔ Sheet.

Usage: python3 scripts/sync_fantrax.py   (FANTRAX_LOCAL=<ordner> = Testdaten)
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone, timedelta

LEAGUE = "mfr0b97kmqgsztrm"
BASE = "https://www.fantrax.com/fxea/general/"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "fantrax.json")

# Fantrax-Kurzname → Kürzel im Sheet/data.json
ABBR = {"BKN": "BRK", "GSW": "GS", "NYK": "NY", "NO": "NOP", "NOR": "NOP", "PHO": "PHX", "SA": "SAS",
        "UTA": "UT", "UTAH": "UT", "WAS": "WA", "WSH": "WA"}


def get(endpoint):
    local = os.environ.get("FANTRAX_LOCAL")
    if local:
        key = re.sub(r"[^A-Za-z0-9]", "_", endpoint)
        for f in os.listdir(local):
            if f.startswith(key):
                return json.load(open(os.path.join(local, f), encoding="utf-8"))
        raise FileNotFoundError(endpoint)
    req = urllib.request.Request(BASE + endpoint, headers={"User-Agent": "Mozilla/5.0"})
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            last = e
    raise last


# Schreibweisen, die zwischen Sheet, Fantrax und ESPN abweichen (normalisiert)
ALIASES = {"jackson hayes": "jaxson hayes", "mo wagner": "moritz wagner", "nahshon hyland": "bones hyland",
           "daeqon plowden": "daeqwon plowden", "colin murrayboyles": "collin murrayboyles",
           "ron holland": "ronald holland", "nicolas claxton": "nic claxton", "cam johnson": "cameron johnson"}


def norm(n):
    n = unicodedata.normalize("NFD", str(n)).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[^a-z ]", "", n)
    n = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", n.strip())
    n = re.sub(r"\s+", " ", n)
    return ALIASES.get(n, n)


def fx_name(raw):
    raw = str(raw or "")
    return " ".join(reversed([x.strip() for x in raw.split(",", 1)])) if "," in raw else raw


def main():
    info = get(f"getLeagueInfo?leagueId={LEAGUE}")
    standings = get(f"getStandings?leagueId={LEAGUE}")
    ids = get("getPlayerIds?sport=NBA")
    names = {pid: fx_name(v.get("name")) for pid, v in ids.items()}

    pv = json.load(open(os.path.join(ROOT, "data", "player-values.json"), encoding="utf-8"))
    logs = {norm(n): dict((d, fp) for d, fp in v.get("g", [])) for n, v in pv["players"].items()}
    sheet = json.load(open(os.path.join(ROOT, "data", "data.json"), encoding="utf-8"))

    # Teams: Fantrax-ID → Kürzel (über den Teamnamen aus data.json bzw. shortName)
    short = {}
    for per in info.get("matchups", []):
        for m in per.get("matchupList", []):
            for side in ("away", "home"):
                t = m.get(side) or {}
                if t.get("id"):
                    short[t["id"]] = t.get("shortName")
    by_name = {norm(t["name"]): a for a, t in sheet["teams"].items()}
    teams = {}
    for tid, t in info.get("teamInfo", {}).items():
        a = by_name.get(norm(t["name"])) or ABBR.get(short.get(tid), short.get(tid))
        if a == "POR" or "portland" in t["name"].lower():
            a = "POR"
        teams[tid] = {"id": tid, "name": t["name"], "abbr": a, "division": t.get("division")}

    # Perioden (Wochen)
    now = datetime.now(timezone.utc)
    periods = []
    for p in info.get("scoringPeriods", []):
        s = datetime.strptime(p["startDate"][:19], "%Y-%m-%dT%H:%M:%S")
        e = datetime.strptime(p["endDate"][:19], "%Y-%m-%dT%H:%M:%S")
        periods.append({"n": p["number"], "from": s.date().isoformat(), "to": e.date().isoformat(),
                        "start_utc": (s + timedelta(hours=5)).isoformat(), "end_utc": (e + timedelta(hours=5)).isoformat()})
    last_reg = (info.get("playoffs") or {}).get("lastRegularSeasonPeriod")
    current = max([p["n"] for p in periods if datetime.fromisoformat(p["start_utc"]).replace(tzinfo=timezone.utc) <= now] or [1])

    weeks = {}
    roster_now = {}
    for p in periods:
        if p["n"] > current:
            break
        ro = get(f"getTeamRosters?leagueId={LEAGUE}&period={p['n']}")
        # Spieltage der Periode (ET-Datum): ab Starttag, Montag des Endes gehört zur nächsten Woche
        d0 = datetime.fromisoformat(p["from"]).date()
        d1 = datetime.fromisoformat(p["to"]).date()
        if p["n"] > 1 or datetime.fromisoformat(p["start_utc"]).hour >= 23:
            pass
        days = set()
        d = d0
        while d < d1:  # Enddatum (Montag) zählt zur nächsten Periode
            days.add(d.isoformat())
            d += timedelta(days=1)
        scores, games, missing = {}, {}, {}
        for tid, r in (ro.get("rosters") or {}).items():
            a = teams.get(tid, {}).get("abbr") or tid
            tot, g, miss = 0.0, 0, []
            for it in r.get("rosterItems", []):
                if it.get("status") != "ACTIVE":
                    continue
                nm = names.get(it["id"], "Fantrax-ID " + it["id"])
                L = logs.get(norm(nm))
                if L is None:
                    miss.append(nm)
                    continue
                for day, fp in L.items():
                    if day in days:
                        tot += fp
                        g += 1
            scores[a] = round(tot, 1)
            games[a] = g
            if miss:
                missing[a] = miss
            if p["n"] == current:
                roster_now[a] = [{"name": names.get(it["id"], "Fantrax-ID " + it["id"]), "pos": it.get("position"), "status": it.get("status")}
                                 for it in r.get("rosterItems", [])]
        complete = datetime.fromisoformat(p["end_utc"]).replace(tzinfo=timezone.utc) < now
        # All-Play je Woche
        ap = {}
        for a, v in scores.items():
            ap[a] = {"w": sum(1 for b, x in scores.items() if b != a and v > x),
                     "l": sum(1 for b, x in scores.items() if b != a and v < x),
                     "t": sum(1 for b, x in scores.items() if b != a and v == x)}
        weeks[str(p["n"])] = {"from": p["from"], "to": p["to"], "complete": complete, "playoff": bool(last_reg and p["n"] > last_reg),
                               "scores": scores, "games": games, "allplay": ap, "unmatched": missing}

    # Kontrolle gegen Fantrax-PF (nur abgeschlossene Wochen)
    done = [w for w in weeks.values() if w["complete"]]
    st = []
    for s in standings:
        a = teams.get(s["teamId"], {}).get("abbr") or s["teamName"]
        wl = [int(x) for x in str(s["points"]).split("-")[:3]] + [0, 0, 0]
        nweeks = round(sum(wl[:3]) / 29) or 0  # Fantrax zählt auch die laufende Woche mit
        ours = sum(weeks[str(k)]["scores"].get(a, 0) for k in range(1, nweeks + 1) if str(k) in weeks) * 29
        st.append({"abbr": a, "name": s["teamName"], "rank": s["rank"], "record": s["points"], "pct": s["winPercentage"],
                   "gb": s["gamesBack"], "pf": s["totalPointsFor"], "pf_week": round(s["totalPointsFor"] / 29 / max(1, nweeks), 1),
                   "check": round(ours / s["totalPointsFor"], 3) if s["totalPointsFor"] else None})
    checks = [x["check"] for x in st if x["check"]]

    # Kader-Abgleich Fantrax ↔ Sheet
    diff = {}
    for a, ro in roster_now.items():
        t = sheet["teams"].get(a)
        if not t:
            continue
        sh = {norm(p["name"]) for p in t["players"] + t.get("two_way", [])}
        fx = {norm(p["name"]): p["name"] for p in ro}
        only_fx = sorted(v for k, v in fx.items() if k not in sh)
        only_sh = sorted(p["name"] for p in t["players"] + t.get("two_way", []) if norm(p["name"]) not in fx)
        if only_fx or only_sh:
            diff[a] = {"nur_fantrax": only_fx, "nur_sheet": only_sh}

    out = {"updated": now.isoformat(), "league": LEAGUE, "name": info.get("leagueName"), "current_period": current,
           "last_regular_period": last_reg, "teams": teams, "standings": st, "weeks": weeks, "rosters": roster_now,
           "roster_diff": diff, "check_avg": round(sum(checks) / len(checks), 3) if checks else None}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"✅ fantrax.json: {len(teams)} Teams, Woche {current}, {len(done)} abgeschlossen. "
          f"Kontrolle eigene Punkte / Fantrax-PF: Ø {out['check_avg']} (1.0 = exakt). "
          f"Kader-Abweichungen bei {len(diff)} Teams.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
