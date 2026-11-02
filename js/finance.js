// ══════════════════════════════════════════════════════════════════
// FINANZEN — Mehrjahres-Ausblick, Probleme je Saison, Liga-Finanzen,
// Entlastungs-Trades. Quelle: data/finance.json (scripts/build_finance.py).
// Cap-Wachstum ist einstellbar (Standard 7 %/Jahr); alle Schwellen der
// Folgejahre werden daraus hochgerechnet.
// ══════════════════════════════════════════════════════════════════

let FIN = null;
const FIN_ST = { team: null, growth: 7, year: '27', withTO: false, lsort: 'room' };

async function finInit() {
  if (FIN) return;
  try { const r = await fetch('data/finance.json', { cache: 'no-store' }); FIN = r.ok ? await r.json() : {}; } catch (e) { FIN = {}; }
  try { Object.assign(FIN_ST, JSON.parse(localStorage.getItem('nbafo-fin') || '{}')); } catch (e) { /* egal */ }
  if (!FIN_ST.team) FIN_ST.team = (FIN.my_teams || [])[0] || 'PHI';
}
function finSave() { try { localStorage.setItem('nbafo-fin', JSON.stringify(FIN_ST)); } catch (e) { /* egal */ } }

const fM = v => (v == null ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M');
const fS = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M');
function finLimits(y) {
  const C = FIN.cba, n = FIN.years.indexOf(y), g = Math.pow(1 + FIN_ST.growth / 100, n);
  return { cap: C.cap * g, tax: C.tax * g, apron1: C.apron1 * g, apron2: C.apron2 * g, min: (C.roster_charge || 1357763) * g };
}
function finStatus(sal, L) {
  if (sal > L.apron2) return { cls: 'apron2', label: '2nd Apron', color: 'var(--red)' };
  if (sal > L.apron1) return { cls: 'apron1', label: '1st Apron', color: 'var(--orange)' };
  if (sal > L.tax) return { cls: 'tax', label: 'Luxury Tax', color: 'var(--yellow)' };
  if (sal > L.cap) return { cls: 'over', label: 'Over Cap', color: 'var(--text)' };
  return { cls: 'under', label: 'Cap Space', color: 'var(--green)' };
}
function finSal(T, y) { return FIN_ST.withTO ? T.with_to[y] : T.fixed[y]; }
// Kader auf 12 auffüllen (NBAFO: Incomplete Roster Charge unter 12) → Mindestkosten
function finFill(T, y) { const n = T.count[y]; return n < 12 ? (12 - n) * finLimits(y).min : 0; }

function finIssues(abbr) {
  const T = FIN.teams[abbr], out = [];
  FIN.years.forEach((y, i) => {
    const L = finLimits(y), sal = finSal(T, y), fill = finFill(T, y), tot = sal + fill, st = finStatus(tot, L);
    const list = [];
    const P = T.players;
    if (y === '26') {
      const ex = T.exceptions || {};
      if (sal > L.apron2) list.push(['bad', `Über dem 2nd Apron (${fS(sal - L.apron2)}): keine Gehalts-Aggregation in Trades, kein MLE, eigener 1st-Rounder in 7 Jahren wird eingefroren, keine Sign-and-Trades.`]);
      else if (sal > L.apron1) list.push(['warn', `Über dem 1st Apron, ${fM(L.apron2 - sal)} bis zum 2nd Apron: in Trades höchstens 100 % des abgegebenen Gehalts zurück, nur Taxpayer MLE (${fM(ex.mle_left)}).`]);
      else if (sal > L.tax) list.push(['warn', `Luxury Tax (${fS(sal - L.tax)}), ${fM(L.apron1 - sal)} bis zum 1st Apron.`]);
      if (ex.hard_cap) list.push(['warn', `Hard Cap bei ${fM(ex.hard_cap)} (Luft ${fM(ex.hard_cap - sal)}).`]);
      if (T.fo_hard_cap) list.push([T.fo_hard_cap - sal < 0 ? 'bad' : 'info', `FO Hard Cap laut Sheet: ${fM(T.fo_hard_cap)} (${fS(T.fo_hard_cap - sal)}). Laut Addendum abgeschafft — falls er doch gilt, wäre jede Gehaltsaufnahme blockiert.`]);
      if (T.tpes.length) list.push(['good', `Traded Player Exceptions: ${T.tpes.map(x => fM(x.amount) + (x.expires ? ' bis ' + x.expires : '')).join(', ')}.`]);
      if (T.count[y] > 15) list.push(['bad', `${T.count[y]} Spieler — max. 15 nach dem 31.10.`]);
    } else {
      if (tot > L.apron2) list.push(['bad', `Projiziert ${fM(tot)} — über dem 2nd Apron (${fM(L.apron2)}) schon ohne Neuverträge.`]);
      else if (tot > L.apron1) list.push(['warn', `Projiziert ${fM(tot)} — über dem 1st Apron (${fM(L.apron1)}).`]);
      else if (tot > L.tax) list.push(['warn', `Projiziert ${fM(tot)} — in der Luxury Tax (${fM(L.tax)}).`]);
      else if (tot < L.cap) list.push(['good', `Cap Space möglich: ${fM(L.cap - tot)} (vor Cap Holds für eigene Free Agents).`]);
      else list.push(['info', `Projiziert ${fM(tot)} — über dem Cap, ${fM(L.tax - tot)} unter der Tax.`]);
      if (T.count[y] < 12) list.push(['warn', `Nur ${T.count[y]} Verträge — ${12 - T.count[y]} Plätze müssen gefüllt werden (min. ${fM(fill)} eingerechnet).`]);
      const prev = FIN.years[i - 1];
      const leaving = P.filter(r => r.sal[prev] && !r.sal[y]);
      const keyLeaving = leaving.filter(r => (r.fpg || 0) >= 60).sort((a, b) => (b.fpg || 0) - (a.fpg || 0));
      if (keyLeaving.length) list.push(['warn', `Vertrag endet nach ${FIN.season[prev]}: ${keyLeaving.map(r => `${r.name} (${(r.fpg || 0).toFixed(0)} FP/G${r.qo ? ', QO ' + fM(r.qo) + ' → RFA' : r.bird ? ', ' + r.bird + ' Bird' : ''}${r.worth ? ', Marktwert ≈ ' + fM(r.worth) : ''})`).join(' · ')}.`]);
      if (keyLeaving.length) {
        const keep = keyLeaving.reduce((a, r) => a + Math.max(r.worth || 0, r.qo || 0) * Math.pow(1 + FIN_ST.growth / 100, 0), 0);
        const t2 = tot + keep - Math.min(fill, keyLeaving.length * L.min), st2 = finStatus(t2, L);
        list.push([t2 > L.apron1 ? 'bad' : t2 > L.tax ? 'warn' : 'info', `Behältst du sie zum Marktwert (≈ ${fM(keep)}), landest du bei ≈ ${fM(t2)} → ${st2.label}${t2 < L.cap ? ` (${fM(L.cap - t2)} Space)` : t2 > L.tax ? ` (${fS(t2 - L.tax)} über Tax)` : ''}.`]);
      }
      const tos = P.filter(r => r.flags && r.flags[y] === 'TO');
      if (tos.length) list.push(['info', `Team Options (deine Entscheidung): ${tos.map(r => `${r.name} ${fM(r.sal[y])}`).join(', ')}.`]);
      const pos = P.filter(r => r.flags && r.flags[y] === 'PO');
      if (pos.length) list.push(['info', `Player Options (Spieler entscheidet, als gezogen gerechnet): ${pos.map(r => `${r.name} ${fM(r.sal[y])}`).join(', ')}.`]);
      const bad = P.filter(r => r.sal[y] && r.over && r.over[y] > 8e6).sort((a, b) => b.over[y] - a.over[y]);
      if (bad.length) list.push(['warn', `Überbezahlt in dieser Saison: ${bad.slice(0, 4).map(r => `${r.name} ${fS(r.over[y])}`).join(', ')}.`]);
    }
    out.push({ y, sal, fill, tot, st, list, L });
  });
  return out;
}

function finRender() {
  const el = document.getElementById('fin-wrap'); if (!el) return;
  if (!FIN || !FIN.teams) { el.innerHTML = '<div class="no-results">data/finance.json fehlt — wird 3x täglich gebaut.</div>'; return; }
  const abbr = FIN.teams[FIN_ST.team] ? FIN_ST.team : FIN.my_teams[0];
  const T = FIN.teams[abbr], Y = FIN.years, S = FIN.season;
  const iss = finIssues(abbr);
  const teamOpts = Object.keys(FIN.teams).sort((a, b) => (FIN.my_teams.includes(b) - FIN.my_teams.includes(a)) || FIN.teams[a].name.localeCompare(FIN.teams[b].name))
    .map(a => `<option value="${a}"${a === abbr ? ' selected' : ''}>${FIN.my_teams.includes(a) ? '⭐ ' : ''}${FIN.teams[a].name}</option>`).join('');
  const upd = FIN.updated ? new Date(FIN.updated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  let h = `<div class="liga-head"><div class="liga-title">💼 Finanzen & Entlastungs-Trades</div>
    <div class="liga-sub">Stand ${upd} · Gehälter laut Sheet, Player Options als gezogen, Team Options ${FIN_ST.withTO ? 'eingerechnet' : 'nicht eingerechnet'} · Cap-Werte ab 2027-28 mit +${FIN_ST.growth} %/Jahr hochgerechnet · Kader unter 12 mit Mindestgehalt aufgefüllt</div></div>
    <div class="fin-controls">
      <label>Team <select class="form-select" onchange="FIN_ST.team=this.value;finSave();finRender()">${teamOpts}</select></label>
      <label>Cap-Wachstum <input type="range" min="0" max="10" step="1" value="${FIN_ST.growth}" oninput="FIN_ST.growth=+this.value;this.nextElementSibling.textContent=this.value+' %'" onchange="finSave();finRender()"><b>${FIN_ST.growth} %</b></label>
      <label class="fin-check"><input type="checkbox" ${FIN_ST.withTO ? 'checked' : ''} onchange="FIN_ST.withTO=this.checked;finSave();finRender()"> Team Options einrechnen</label>
    </div>`;

  // 1) Jahr für Jahr
  h += `<div class="liga-h2">${T.name} — Jahr für Jahr <span class="liga-sub">Stärke #${T.strength_rank} · ${T.direction || ''}</span></div>
    <div style="overflow:auto"><table class="teams-table fin-table"><thead><tr><th></th>${Y.map(y => `<th class="right">${S[y]}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Gehalt fest${FIN_ST.withTO ? ' + TO' : ''}</td>${iss.map(x => `<td class="right">${fM(x.sal)}</td>`).join('')}</tr>
    <tr><td title="Auffüllen auf 12 Spieler mit Mindestgehalt">+ Kader auffüllen</td>${iss.map(x => `<td class="right muted">${x.fill ? fM(x.fill) : '—'}</td>`).join('')}</tr>
    <tr class="strong"><td>Projiziert</td>${iss.map(x => `<td class="right" style="color:${x.st.color};font-weight:700">${fM(x.tot)}</td>`).join('')}</tr>
    <tr><td>Status</td>${iss.map(x => `<td class="right"><span class="cap-pill ${x.st.cls}" style="font-size:10px;display:inline-flex">${x.st.label}</span></td>`).join('')}</tr>
    <tr><td>Verträge</td>${Y.map(y => `<td class="right">${T.count[y]}</td>`).join('')}</tr>
    <tr><td>Dead Money</td>${Y.map(y => `<td class="right muted">${T.dead[y] ? fM(T.dead[y]) : '—'}</td>`).join('')}</tr>
    ${['cap', 'tax', 'apron1', 'apron2'].map(k => `<tr class="muted"><td>${{ cap: 'Salary Cap', tax: 'Luxury Tax', apron1: '1st Apron', apron2: '2nd Apron' }[k]}</td>${iss.map(x => `<td class="right">${fM(x.L[k])} <span style="color:${x.tot > x.L[k] ? 'var(--red)' : 'var(--green)'}">${fS(x.L[k] - x.tot)}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;

  // 2) Probleme je Saison
  h += `<div class="liga-h2">Mögliche Probleme je Saison</div><div class="fin-issues">${iss.map(x => `<div class="fin-issue-card"><div class="fin-issue-h">${S[x.y]}<span style="color:${x.st.color}">${x.st.label}</span></div>${x.list.length ? x.list.map(([lvl, t]) => `<div class="fin-issue ${lvl}">${{ bad: '🚨', warn: '⚠️', info: 'ℹ️', good: '✅' }[lvl]} ${t}</div>`).join('') : '<div class="fin-issue good">✅ Nichts Auffälliges.</div>'}</div>`).join('')}</div>`;

  // 3) Verträge
  const P = T.players.slice().sort((a, b) => (b.sal['26'] || 0) - (a.sal['26'] || 0));
  h += `<div class="liga-h2">Verträge <span class="liga-sub">Wert = Marktpreis nach FP/G (aus allen Veteranenverträgen der Liga gefittet, NBAFO-Alterskurve) · Über/Unter = Gehalt − Wert, Summe ab 2027-28</span></div>
    <div style="overflow:auto"><table class="teams-table fin-table"><thead><tr><th>Spieler</th><th class="right">Alter</th><th class="right" title="FP/G 2026-27 (NBAFO-Scoring); in Klammern 2025-26 laut FA26">FP/G</th>${Y.map(y => `<th class="right">${S[y]}</th>`).join('')}<th class="right">Wert</th><th class="right" title="Summe Gehalt − Wert ab 2027-28">Über/Unter</th></tr></thead><tbody>
    ${P.map(r => `<tr><td>${r.name}${r.qo ? ' <span class="opt-badge QO" title="Qualifying Offer">QO</span>' : ''}</td><td class="right">${r.age || '—'}</td><td class="right">${r.fpg != null ? r.fpg.toFixed(1) : '—'}${r.fpg_last ? ` <span class="muted">(${r.fpg_last.toFixed(0)})</span>` : ''}</td>
      ${Y.map(y => { const v = r.sal[y], f = r.flags && r.flags[y]; return `<td class="right${f ? ' fin-flag-' + f : ''}" title="${f ? { PO: 'Player Option', TO: 'Team Option', QO: 'Qualifying Offer', NG: 'nicht garantiert' }[f] : ''}">${v ? fM(v) + (f ? ' ' + f : '') : '—'}</td>`; }).join('')}
      <td class="right">${fM(r.worth)}</td><td class="right" style="color:${(r.future_over || 0) > 3e6 ? 'var(--red)' : (r.future_over || 0) < -3e6 ? 'var(--green)' : 'var(--dim)'}">${r.future_over != null ? fS(r.future_over) : '—'}</td></tr>`).join('')}
    </tbody></table></div>`;

  // 4) Liga-Finanzen
  const yy = FIN_ST.year;
  const L = finLimits(yy);
  let teams = Object.entries(FIN.teams).map(([a, t]) => {
    const tot = finSal(t, yy) + finFill(t, yy);
    const lim = yy === '26' ? ((t.exceptions || {}).hard_cap || (t.salary > L.apron1 ? L.apron2 : L.apron1)) : L.apron1;
    return { a, t, tot, st: finStatus(tot, L), room: lim - tot, space: L.cap - tot, tpe: Math.max(0, ...t.tpes.map(x => x.amount)) };
  });
  const sorters = { room: (x, y) => y.room - x.room, space: (x, y) => y.space - x.space, tpe: (x, y) => y.tpe - x.tpe, sal: (x, y) => y.tot - x.tot, str: (x, y) => x.t.strength_rank - y.t.strength_rank };
  teams.sort(sorters[FIN_ST.lsort] || sorters.room);
  h += `<div class="liga-h2">Wie geht es den anderen Teams? <span class="liga-sub">Saison <select onchange="FIN_ST.year=this.value;finSave();finRender()">${Y.map(y => `<option value="${y}"${y === yy ? ' selected' : ''}>${S[y]}</option>`).join('')}</select> · sortiert nach <select onchange="FIN_ST.lsort=this.value;finSave();finRender()">${[['room', 'Luft bis Apron/Hard Cap'], ['space', 'Cap Space'], ['tpe', 'größte TPE'], ['sal', 'Gehalt'], ['str', 'Stärke']].map(([v, l]) => `<option value="${v}"${v === FIN_ST.lsort ? ' selected' : ''}>${l}</option>`).join('')}</select></span></div>
    <div style="overflow:auto"><table class="teams-table fin-table"><thead><tr><th>Team</th><th class="right">${yy === '26' ? 'Gehalt' : 'Projiziert'}</th><th>Status</th><th class="right">Cap Space</th><th class="right" title="${yy === '26' ? 'bis Hard Cap, sonst nächster Apron' : 'bis 1st Apron'}">Luft</th><th class="right">TPEs</th><th class="right">MLE</th><th class="right">Stärke</th><th>Richtung</th></tr></thead><tbody>
    ${teams.map(x => `<tr class="${FIN.my_teams.includes(x.a) ? 'fin-mine' : ''}"><td>${x.t.name}${FIN.my_teams.includes(x.a) ? ' ⭐' : ''}</td><td class="right">${fM(x.tot)}</td><td><span class="cap-pill ${x.st.cls}" style="font-size:10px;display:inline-flex">${x.st.label}</span></td>
      <td class="right" style="color:${x.space > 0 ? 'var(--green)' : 'var(--muted)'}">${x.space > 0 ? fM(x.space) : '—'}</td><td class="right" style="color:${x.room > 0 ? 'var(--green)' : 'var(--red)'}">${fS(x.room)}</td>
      <td class="right">${yy === '26' && x.t.tpes.length ? x.t.tpes.map(e => fM(e.amount)).join(', ') : '—'}</td><td class="right">${yy === '26' && (x.t.exceptions || {}).mle_type ? fM(x.t.exceptions.mle_left) : '—'}</td>
      <td class="right">#${x.t.strength_rank}</td><td style="font-size:11px;color:var(--dim)">${x.t.direction || ''}</td></tr>`).join('')}
    </tbody></table></div>`;

  // 5) Trade-Vorschläge
  const sug = (FIN.suggestions || {})[abbr];
  h += `<div class="liga-h2">Entlastungs-Trades für ${T.name}</div>`;
  if (!sug) h += '<div class="liga-sub">Vorschläge gibt es für deine Teams (⭐).</div>';
  else if (!sug.length) h += '<div class="liga-sub">Keine sinnvollen, regelkonformen Entlastungen gefunden.</div>';
  else {
    h += `<div class="liga-sub">Nur Pakete, die nach CBA-Regeln für <b>beide</b> Seiten gehen (Matching nach Apron-Status, 2nd Apron ohne Aggregation, Hard Cap; Aufnahme per Cap Space oder TPE). Ersparnis = festes Gehalt 2027-28 bis 2029-30. Partner-Bilanz = Wert, den der Partner gewinnt (−) bzw. verliert; bei deutlich negativ braucht es ein Zuckerl (Pick/Two-way). Sortiert nach Ersparnis, Stärke und Fairness.</div><div class="fin-trades">`;
    sug.forEach((s, i) => {
      const P2 = FIN.teams[s.partner];
      h += `<div class="fin-trade"><div class="fin-trade-h"><b>${i + 1}. mit ${P2.name}</b> <span class="liga-sub">${P2.direction || ''} · Stärke #${P2.strength_rank}</span></div>
        <div class="fin-trade-body"><div><span class="te-label">Du gibst</span>${s.out.join(' + ')}</div><div><span class="te-label">Du bekommst</span>${s.in.length ? s.in.join(' + ') : '<i>nichts (Partner nimmt per ' + (s.how_partner === 'tpe' ? 'TPE' : 'Cap Space') + ' auf)</i>'}</div></div>
        <div class="fin-trade-kpis"><span title="Festes Gehalt 2027-30, das wegfällt">💸 ${fS(s.save_future)} ab 27-28</span><span>📆 diese Saison ${fS(s.save_now)}</span>
          <span style="color:${s.d_strength >= 0 ? 'var(--green)' : 'var(--red)'}">💪 Stärke ${s.d_strength >= 0 ? '+' : ''}${s.d_strength}</span>
          <span title="Wert, den der Partner über die Restlaufzeit gewinnt (+) oder verliert (−)">🤝 Partner ${fS(s.partner_value)}</span>
          ${s.how_partner === 'tpe' || s.how_partner === 'space' ? `<span>📥 Partner nimmt per ${s.how_partner === 'tpe' ? 'TPE' : 'Cap Space'} auf</span>` : ''}
          ${s.sweetener ? '<span class="fin-sweet">🍬 Zuckerl nötig</span>' : '<span style="color:var(--green)">✓ fair</span>'}</div>
        <div class="fin-trade-years">${Y.slice(1).map(y => `<span>${S[y]}: ${fS(s.save_by_year[y])}</span>`).join('')}</div>
        <button class="filter-btn" onclick="finToCalc(${i})">→ im Trade Calculator prüfen</button></div>`;
    });
    h += '</div>';
  }
  el.innerHTML = h;
}

function finToCalc(i) {
  const abbr = FIN.teams[FIN_ST.team] ? FIN_ST.team : FIN.my_teams[0];
  const s = FIN.suggestions[abbr][i];
  const pick = (ab, n) => { const x = TEAMS[ab].players.find(p => p.name === n); return { name: n, sal: x ? x.sal_26 : 0, team: ab }; };
  tradeTeam.a = abbr; tradeTeam.b = s.partner;
  tradePlayers.a = s.out.map(n => pick(abbr, n)); tradePlayers.b = s.in.map(n => pick(s.partner, n));
  const sa = document.getElementById('trade-team-a'), sb = document.getElementById('trade-team-b');
  if (sa) sa.value = abbr; if (sb) sb.value = s.partner;
  showPage('trade'); renderTradeList('a'); renderTradeList('b'); renderTradeVerdict();
}

(function () {
  const orig = showPage;
  showPage = function (pg) { orig(pg); if (pg === 'fin') finInit().then(finRender); };
})();
