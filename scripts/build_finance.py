#!/usr/bin/env python3
"""
build_finance.py
────────────────
Mehrjahres-Finanzbild aller 30 NBAFO-Teams + Entlastungs-Trades für die
eigenen Teams (my_teams) → data/finance.json (Seite „💼 Finanzen“ in app.html).

Eingaben
  data/data.json          Kader, Gehälter 2026-27…2031-32, Optionen (PO/TO/QO/NG),
                          Two-way, Waived (Dead Money), Exceptions, Finances-Tab
                          (TPEs aller Teams mit Ablauf, FO Hard Cap, Hard-Cap-Auslöser)
  data/player-values.json FP/G im NBAFO-Scoring (Saison 2026-27 bisher)
  FA26 in data.json       FP/G 2025-26 (für den Teil der Spieler, die im FA-Pool standen)
  MFHFB HQ nba-rosters.js Alter (ESPN-Geburtsdatum)

Modell
  • Gehalt je Saison: „fest“ = alles außer Team Options (die entscheidet man selbst);
    Player Options zählen als gezogen (Worst Case). „mit TO“ = inkl. Team Options.
  • Cap-Werte der Folgejahre: + CAP_GROWTH je Jahr (Standard 7 %, in der App einstellbar).
  • Spielerwert: Marktpreis nach FP/G aus allen Veteranenverträgen der Liga gefittet
    (Gehalt ≈ k · FP/G², wie die NBAFO-Vertragsformel), Alterskurve wie in der
    NBAFO-Formel (age/(age-15), ab 32 Abschlag). Über-/Unterbezahlung = Gehalt − Wert.
  • Teamstärke = Summe der 8 besten FP/G.

Trades (nur für my_teams): Entlastung zukünftiger Jahre bei möglichst wenig
Stärkeverlust, CBA-2023-Regeln für BEIDE Seiten (Matching nach Apron-Status,
2nd Apron = keine Aggregation, Hard Cap), Aufnahme per Cap Space oder TPE beim
Partner. Partner-Bilanz (Wert rein − Wert raus) zeigt, ob ein Zuckerl nötig ist.

Usage: python3 scripts/build_finance.py [--local <pfad zum MFHFBHQ-Repo>]
"""
import json
import math
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import date, datetime, timezone
from itertools import combinations

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "finance.json")
HUB_ROSTERS = "https://raw.githubusercontent.com/Pizzaratops/MFHFBHQ/main/sports/nba/data/nba-rosters.js"
CAP_GROWTH = 0.07
YEARS = ["26", "27", "28", "29", "30"]
SEASON = {y: f"20{y}-{int(y) + 1}" for y in YEARS}
TODAY = date.today()


def norm(n):
    n = unicodedata.normalize("NFD", str(n)).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[^a-z ]", "", n)
    n = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", n.strip())
    return re.sub(r"\s+", " ", n)


def parse_date(s):
    if not s:
        return None
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", str(s))
    if not m:
        m2 = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(s))
        return date(int(m2.group(1)), int(m2.group(2)), int(m2.group(3))) if m2 else None
    y = int(m.group(3))
    y = y + 2000 if y < 100 else y
    try:
        return date(y, int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def load_ages(local):
    try:
        if local:
            src = open(os.path.join(local, "sports", "nba", "data", "nba-rosters.js"), encoding="utf-8").read()
        else:
            src = urllib.request.urlopen(urllib.request.Request(HUB_ROSTERS, headers={"User-Agent": "nbafo"}), timeout=60).read().decode("utf-8")
        data = json.loads(src[src.index("{"):src.rindex("}") + 1])
    except Exception as e:  # noqa
        print(f"  ⚠️ Alter nicht geladen ({e})", file=sys.stderr)
        return {}
    out = {}
    for lst in data.get("teams", {}).values():
        for p in lst:
            if p.get("dob"):
                d = date.fromisoformat(p["dob"])
                # Alter am 1. Juli 2026 (Stichtag der NBAFO-Formel)
                out[norm(p["n"])] = 2026 - d.year - ((7, 1) < (d.month, d.day))
    return out


def age_factor(age):
    if not age:
        return 1.0
    f = age / (age - 15)
    if age > 32:
        f -= (age - 32) ** 2 / age
    return max(0.3, f)


def main():
    local = sys.argv[sys.argv.index("--local") + 1] if "--local" in sys.argv else None
    D = json.load(open(os.path.join(ROOT, "data", "data.json"), encoding="utf-8"))
    PV = json.load(open(os.path.join(ROOT, "data", "player-values.json"), encoding="utf-8"))["players"]
    pv = {norm(n): v for n, v in PV.items()}
    fa26 = {norm(f["name"]): f for f in D.get("fas", [])}
    ages = load_ages(local)
    CBA = D["cba"]
    my = D.get("my_teams") or []

    def player_info(p):
        k = norm(p["name"])
        v = pv.get(k) or {}
        cur = v.get("fpg") if v.get("gp") else None
        last = (fa26.get(k) or {}).get("fpg")
        # Bewertungs-FP/G: NBAFO-Formel nutzt 2×letzte + vorletzte Saison
        if cur is not None and last is not None:
            val = (2 * cur + last) / 3
        else:
            val = cur if cur is not None else last
        age = ages.get(k) or (fa26.get(k) or {}).get("age")
        return {"fpg": cur, "fpg_last": last, "fpg_val": val, "age": age, "gp": v.get("gp", 0)}

    # --- Marktpreis-Fit: Gehalt ≈ k · (FP/G_val)² · age_factor über Veteranenverträge ---
    pts = []
    for t in D["teams"].values():
        for p in t["players"]:
            sv = (p.get("signed_via") or "").lower()
            if "1st round" in sv or "2re" in sv or "mpe" in sv or not p.get("sal_26") or p["sal_26"] < 4e6:
                continue
            pi = player_info(p)
            if pi["fpg_val"] and pi["fpg_val"] > 15:
                pts.append((p["sal_26"], pi["fpg_val"] ** 2 * age_factor(pi["age"])))
    k = sum(s * x for s, x in pts) / sum(x * x for s, x in pts) if pts else 2000.0

    def worth(pi, years_ahead=0):
        if not pi["fpg_val"]:
            return None
        # Alterskurve der NBAFO-Formel: heute; Folgejahre nur ab 30 mit Abschlag (Jüngere halten ihren Wert)
        a0 = pi["age"] or 27
        a = a0 + years_ahead if a0 + years_ahead >= 30 else a0
        f = age_factor(a)
        if a0 + years_ahead >= 30 and years_ahead:
            f = min(f, age_factor(a0)) * (1 - 0.06 * max(0, a0 + years_ahead - 30))
        return k * pi["fpg_val"] ** 2 * f

    teams = {}
    for abbr, t in D["teams"].items():
        rows = []
        for p in t["players"]:
            pi = player_info(p)
            flags = p.get("flags") or {}
            sal = {y: p.get(f"sal_{y}") for y in YEARS}
            w0 = worth(pi)
            over = {}
            for i, y in enumerate(YEARS):
                if sal[y] and w0 is not None:
                    over[y] = round(sal[y] - worth(pi, i))
            rows.append({"name": p["name"], "pos": p.get("pos"), "age": pi["age"], "fpg": pi["fpg"], "fpg_last": pi["fpg_last"],
                         "fpg_val": round(pi["fpg_val"], 1) if pi["fpg_val"] else None, "gp": pi["gp"],
                         "sal": sal, "flags": flags, "qo": p.get("qo"), "bird": p.get("bird"), "signed_via": p.get("signed_via"),
                         "worth": round(w0) if w0 else None, "over": over,
                         "future_over": round(sum(v for y, v in over.items() if y != "26" and v is not None)) if over else None})
        dead = {y: sum((w.get(f"sal_{y}") or 0) for w in t.get("waived", [])) for y in YEARS}
        fixed = {y: sum((r["sal"][y] or 0) for r in rows if r["flags"].get(y) not in ("TO",)) + dead[y] for y in YEARS}
        with_to = {y: sum((r["sal"][y] or 0) for r in rows) + dead[y] for y in YEARS}
        fixed["26"] = t["total_salary"]  # laufende Saison: Sheet-Summe (inkl. allem)
        with_to["26"] = t["total_salary"]
        count = {y: sum(1 for r in rows if r["sal"][y]) for y in YEARS}
        fin = t.get("finances") or {}
        # TPEs: Finances-Tab ist maßgeblich (Team-Tabs enthalten teils Platzhalter, z. B. WAS 41,2M = Max-Gehalt)
        src = fin["tpes"] if "tpes" in fin else (t.get("exceptions") or {}).get("tpes") or []
        tpes = [x for x in src
                if (parse_date(x.get("expires")) or date(2100, 1, 1)) >= TODAY]
        fpgs = sorted([r["fpg"] or 0 for r in rows], reverse=True)
        teams[abbr] = {
            "name": t["name"], "gm": t.get("gm"), "direction": D.get("directions", {}).get(abbr, ""),
            "salary": t["total_salary"], "fixed": fixed, "with_to": with_to, "dead": dead, "count": count,
            "two_way": len(t.get("two_way", [])),
            "exceptions": t.get("exceptions") or {}, "tpes": tpes,
            "fo_hard_cap": fin.get("fo_hard_cap"), "hard_cap_trigger": fin.get("hard_cap_trigger"),
            "strength": round(sum(fpgs[:8]), 1), "players": rows,
        }
    ranks = sorted(teams, key=lambda a: -teams[a]["strength"])
    for i, a in enumerate(ranks):
        teams[a]["strength_rank"] = i + 1

    # --- CBA-Helfer (Saison 2026-27, Werte aus CtrlPanel) ---
    scale = CBA["cap"] / 136021000
    T1, T2, B = 7.5e6 * scale, 29e6 * scale, 250000 * scale

    def max_in(out, new_sal):
        if new_sal <= CBA["cap"]:
            return math.inf
        if new_sal > CBA["apron1"]:
            return out
        if out <= T1:
            return 2 * out + B
        if out <= T2:
            return out + T1
        return 1.25 * out + B

    def legal(team, out_list, in_list):
        """CBA-Prüfung für ein Team. Rückgabe (ok, Art, Hinweis)."""
        T = teams[team]
        out = sum(r["sal"]["26"] or 0 for r in out_list)
        inn = sum(r["sal"]["26"] or 0 for r in in_list)
        new = T["salary"] - out + inn
        hard = (T["exceptions"] or {}).get("hard_cap")
        if hard and new > hard and inn > out:
            return False, None, f"über Hard Cap {hard / 1e6:.1f}M"
        if new > CBA["apron2"] and inn > out and len(out_list) > 1:
            return False, None, "über 2nd Apron: keine Aggregation"
        if inn <= out:
            return True, "match", ""
        if new <= CBA["cap"]:
            return True, "space", "Cap Space"
        # einzelner Spieler in eine TPE (nur unter dem 1st Apron nach dem Trade)
        if len(in_list) == 1 and new <= CBA["apron1"]:
            for x in T["tpes"]:
                if x["amount"] >= inn:
                    return True, "tpe", f"TPE {x['amount'] / 1e6:.1f}M"
        if inn <= max_in(out, new):
            return True, "match", ""
        return False, None, "Salary Matching"

    def strength_after(team, out_names, in_rows):
        vals = [r["fpg"] or 0 for r in teams[team]["players"] if r["name"] not in out_names] + [r["fpg"] or 0 for r in in_rows]
        vals.sort(reverse=True)
        return round(sum(vals[:8]) - teams[team]["strength"], 1)

    def money(rows, years):
        return sum((r["sal"][y] or 0) for r in rows for y in years if r["flags"].get(y) != "TO")

    FUT = ["27", "28", "29"]
    suggestions = {}
    for me in my:
        if me not in teams:
            continue
        M = teams[me]
        # Kandidaten: Zukunftsgeld, die teuersten Überbezahlungen zuerst
        cands = [r for r in M["players"] if any(r["sal"][y] and r["flags"].get(y) != "TO" for y in FUT)]
        # nur überbezahlte Verträge (≥ 3 Mio. über Wert in den Folgejahren); junge Leistungsträger bleiben
        cands = [r for r in cands if (r["future_over"] or 0) >= 3e6 and not ((r["age"] or 99) <= 26 and (r["fpg"] or 0) >= 85)]
        cands.sort(key=lambda r: -(r["future_over"] or 0))
        cands = cands[:9]
        outs = [[c] for c in cands] + [list(x) for x in combinations(cands[:6], 2)]
        res = []
        for P, PT in teams.items():
            if P == me or P in my:
                continue
            # Rückgabe-Kandidaten des Partners: auslaufend oder günstig (wenig Zukunftsgeld)
            backs = [r for r in PT["players"] if (r["sal"]["26"] or 0) > 0]
            backs.sort(key=lambda r: (money([r], FUT), -(r["fpg"] or 0)))
            backs = backs[:10]
            back_opts = [[]] + [[b] for b in backs] + [list(x) for x in combinations(backs[:6], 2)]
            for o in outs:
                for bk in back_opts:
                    ok1, how1, n1 = legal(me, o, bk)
                    ok2, how2, n2 = legal(P, bk, o)
                    if not (ok1 and ok2):
                        continue
                    save = money(o, FUT) - money(bk, FUT)
                    if save < 5e6:
                        continue
                    d_me = strength_after(me, [r["name"] for r in o], bk)
                    d_p = strength_after(P, [r["name"] for r in bk], o)
                    # Partner-Wertbilanz: Wert rein − Gehalt rein − (Wert raus − Gehalt raus), alle Restjahre
                    def surplus(rows):
                        return sum(-(r["over"].get(y) or 0) for r in rows for y in YEARS if r["sal"][y] and r["flags"].get(y) != "TO")
                    p_val = surplus(o) - surplus(bk)
                    # Realismus: Partner darf nicht klar verlieren (sonst nur mit Zuckerl), kein Ausverkauf
                    rebuild = any(x in (PT.get("direction") or "").lower() for x in ("rebuild", "tank", "young"))
                    if p_val < -25e6 or (d_p < -25 and not rebuild) or d_me < -45:
                        continue
                    if money(bk, ["30", "31"] if False else ["30"]) > 0 and save < 20e6:
                        continue
                    now_cut = (sum(r["sal"]["26"] or 0 for r in o) - sum(r["sal"]["26"] or 0 for r in bk))
                    score = save / 1e6 + 1.0 * d_me + 0.4 * max(-25, min(25, p_val / 1e6))
                    res.append({
                        "partner": P, "out": [r["name"] for r in o], "in": [r["name"] for r in bk],
                        "save_future": round(save), "save_now": round(now_cut),
                        "save_by_year": {y: round(money(o, [y]) - money(bk, [y])) for y in YEARS},
                        "d_strength": d_me, "d_strength_partner": d_p, "partner_value": round(p_val),
                        "how_me": how1, "how_partner": how2 or "", "note_partner": n2,
                        "sweetener": p_val < -5e6, "score": round(score, 2),
                    })
        # Beste je Kombination aus abgegebenen Spielern, Vielfalt bei Partnern
        res.sort(key=lambda x: -x["score"])
        picked, seen_out, per_partner = [], {}, {}
        for r in res:
            key = tuple(sorted(r["out"]))
            if seen_out.get(key, 0) >= 3 or per_partner.get(r["partner"], 0) >= 2:
                continue
            seen_out[key] = seen_out.get(key, 0) + 1
            per_partner[r["partner"]] = per_partner.get(r["partner"], 0) + 1
            picked.append(r)
            if len(picked) >= 18:
                break
        suggestions[me] = picked

    out = {"updated": datetime.now(timezone.utc).isoformat(), "cap_growth": CAP_GROWTH, "years": YEARS, "season": SEASON,
           "cba": CBA, "market_k": round(k, 1), "my_teams": my, "teams": teams, "suggestions": suggestions}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"✅ finance.json: {len(teams)} Teams, Marktpreis k={k:.0f} $/FP², Vorschläge: "
          + ", ".join(f"{a} {len(v)}" for a, v in suggestions.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
