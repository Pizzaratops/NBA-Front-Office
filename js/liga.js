// ══════════════════════════════════════════════════════════════════
// LIGA — Tabelle, Wochen-Scores, Rolling Rankings, Kader-Abgleich
// Quelle: data/fantrax.json (scripts/sync_fantrax.py, 3x täglich).
// Fantrax wertet All-Play: jede Woche gegen alle 29 anderen Teams.
// Wochen-Scores rechnet das Sync-Script selbst nach (aktive Spieler der
// Woche × FP im NBAFO-Scoring); Kontrolle gegen Fantrax-PF = check_avg.
// ══════════════════════════════════════════════════════════════════

let FX = null;
let FX_SORT = { col: 'rank', dir: 1 };

async function ligaInit() {
  if (FX) return;
  try { const r = await fetch('data/fantrax.json', { cache: 'no-store' }); FX = r.ok ? await r.json() : {}; }
  catch (e) { FX = {}; }
}

function ligaTeam(abbr) { return (typeof TEAMS !== 'undefined' && TEAMS[abbr]) || { name: abbr, c1: '#888' }; }
function ligaDot(abbr) { return `<span class="team-dot" style="background:${ligaTeam(abbr).c1};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px"></span>`; }

// kumulierte All-Play-Bilanz nach jeder Woche → Rang je Woche
function ligaRolling() {
  const weeks = Object.keys(FX.weeks || {}).map(Number).sort((a, b) => a - b);
  const tot = {}, byWeek = {};
  weeks.forEach(w => {
    const W = FX.weeks[w];
    Object.entries(W.allplay || {}).forEach(([a, r]) => {
      const t = tot[a] = tot[a] || { w: 0, l: 0, t: 0, pf: 0 };
      t.w += r.w; t.l += r.l; t.t += r.t; t.pf += W.scores[a] || 0;
    });
    const list = Object.entries(tot).map(([a, t]) => ({ a, pct: (t.w + t.t / 2) / Math.max(1, t.w + t.l + t.t), pf: t.pf }))
      .sort((x, y) => (y.pct - x.pct) || (y.pf - x.pf));
    byWeek[w] = {}; list.forEach((x, i) => { byWeek[w][x.a] = i + 1; });
  });
  return { weeks, byWeek };
}

function ligaBump(R, mine) {
  const W = R.weeks; if (W.length < 2) return '';
  const n = Object.keys(R.byWeek[W[0]]).length, w = 760, rowH = 18, padL = 40, padR = 150, top = 20;
  const h = top + n * rowH + 10, x = i => padL + i * (w - padL - padR) / (W.length - 1), y = r => top + (r - 0.5) * rowH;
  const teams = Object.keys(R.byWeek[W[W.length - 1]]);
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="liga-bump" role="img" aria-label="Rolling Rankings">`;
  W.forEach((wk, i) => { svg += `<text x="${x(i)}" y="12" text-anchor="middle" class="lb-head">W${wk}</text>`; });
  teams.forEach(a => {
    const pts = W.map((wk, i) => [x(i), y(R.byWeek[wk][a] || n)]);
    const on = mine.includes(a);
    svg += `<path d="M${pts.map(p => p.join(',')).join(' L')}" fill="none" stroke="${on ? ligaTeam(a).c1 : 'var(--border)'}" stroke-width="${on ? 3 : 1.4}" opacity="${on ? 1 : .8}"><title>${ligaTeam(a).name}: ${W.map(wk => 'W' + wk + ' #' + R.byWeek[wk][a]).join(' · ')}</title></path>`;
    const last = pts[pts.length - 1];
    svg += `<text x="${last[0] + 8}" y="${last[1] + 4}" class="lb-lab${on ? ' on' : ''}">${R.byWeek[W[W.length - 1]][a]}. ${a}</text>`;
  });
  return svg + '</svg>';
}

function ligaRender() {
  const el = document.getElementById('liga-wrap'); if (!el) return;
  if (!FX || !FX.standings) { el.innerHTML = '<div class="no-results">data/fantrax.json fehlt — der Sync läuft 3x täglich.</div>'; return; }
  const mine = typeof MY_TEAMS !== 'undefined' ? MY_TEAMS : [];
  const R = ligaRolling();
  const done = R.weeks.filter(w => FX.weeks[w].complete), lastC = done[done.length - 1], prevC = done[done.length - 2];
  const SR = typeof strengthRanks === 'function' && typeof PV_META !== 'undefined' && PV_META ? strengthRanks() : {};
  const cur = FX.weeks[FX.current_period];
  let rows = FX.standings.map(s => ({ ...s, trend: lastC && prevC && R.byWeek[prevC][s.abbr] ? R.byWeek[prevC][s.abbr] - R.byWeek[lastC][s.abbr] : 0, str: SR[s.abbr] ? SR[s.abbr].rank : null, now: cur ? cur.scores[s.abbr] : null }));
  const c = FX_SORT.col, d = FX_SORT.dir;
  rows.sort((a, b) => { const va = a[c] ?? -1e9, vb = b[c] ?? -1e9; return va < vb ? -d : va > vb ? d : 0; });
  const th = (k, l, t) => `<th class="right${FX_SORT.col === k ? ' sorted' : ''}"${t ? ` title="${t}"` : ''} onclick="ligaSort('${k}')">${l}${FX_SORT.col === k ? (FX_SORT.dir === 1 ? ' ↑' : ' ↓') : ''}</th>`;
  const upd = FX.updated ? new Date(FX.updated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  let html = `<div class="liga-head"><div><div class="liga-title">${FX.name || 'NBA Front Office'} · Woche ${FX.current_period}${cur && !cur.complete ? ' (läuft)' : ''}</div>
    <div class="liga-sub">Fantrax, All-Play: jede Woche gegen alle 29 Teams · Stand ${upd} · Wochen-Scores selbst nachgerechnet, Abgleich mit Fantrax-Punkten ${FX.check_avg != null ? (FX.check_avg * 100).toFixed(1) + ' %' : '—'}</div></div></div>
    <table class="teams-table liga-table"><thead><tr>${th('rank', '#')}<th>Team</th>${th('pct', 'W-L', 'Fantrax-Bilanz (inkl. laufender Woche)')}${th('gb', 'GB')}${th('pf_week', 'Ø Pkt./Woche', 'Fantrax-Punkte ÷ 29 ÷ Wochen')}${th('now', 'Diese Woche', 'Zwischenstand der laufenden Woche (aktive Spieler, nachgerechnet)')}${th('str', 'Stärke-Rang', 'Rang nach Top-8 FP/G (Kader laut Sheet)')}${th('trend', 'Trend', 'Platzveränderung in den Rolling Rankings zur Vorwoche')}</tr></thead><tbody>`;
  rows.forEach(s => {
    const on = mine.includes(s.abbr);
    html += `<tr class="team-row" onclick="selectTeam('${s.abbr}')"><td class="right">${s.rank}</td><td>${ligaDot(s.abbr)}<span style="font-weight:${on ? 700 : 400}">${ligaTeam(s.abbr).name}${on ? ' ⭐' : ''}</span></td>
      <td class="right" style="font-family:var(--font-mono)">${s.record.replace(/-0$/, '')}</td><td class="right">${s.gb ? s.gb.toFixed(0) : '—'}</td>
      <td class="right">${s.pf_week.toFixed(0)}</td><td class="right">${s.now != null ? s.now.toFixed(0) : '—'}</td>
      <td class="right">${s.str ? '#' + s.str : '—'}</td><td class="right" style="color:${s.trend > 0 ? 'var(--green)' : s.trend < 0 ? 'var(--red)' : 'var(--muted)'}">${s.trend > 0 ? '▲ ' + s.trend : s.trend < 0 ? '▼ ' + -s.trend : '–'}</td></tr>`;
  });
  html += '</tbody></table>';

  // Wochen-Scores
  html += `<div class="liga-h2">Punkte je Woche <span class="liga-sub">(Rang der Woche in Klammern)</span></div><div style="overflow:auto"><table class="teams-table liga-table"><thead><tr><th>Team</th>${R.weeks.map(w => `<th class="right">W${w}${FX.weeks[w].complete ? '' : ' *'}</th>`).join('')}</tr></thead><tbody>`;
  const order = FX.standings.map(s => s.abbr);
  order.forEach(a => {
    html += `<tr><td>${ligaDot(a)}${ligaTeam(a).name}</td>${R.weeks.map(w => { const W = FX.weeks[w], v = W.scores[a]; const rk = 1 + Object.values(W.scores).filter(x => x > v).length; const hue = Math.round(140 - (rk - 1) * 140 / 29); return `<td class="right" style="background:hsl(${hue} 60% 45% / .16)">${v != null ? v.toFixed(0) : '—'} <span style="color:var(--muted)">(${rk})</span></td>`; }).join('')}</tr>`;
  });
  html += `</tbody></table></div><div class="liga-sub">* = laufende Woche, Zwischenstand.</div>`;

  // Rolling Rankings
  html += `<div class="liga-h2">Rolling Rankings <span class="liga-sub">(Platz nach kumulierter All-Play-Bilanz, Tiebreak Punkte)</span></div>`;
  html += R.weeks.length >= 2 ? `<div class="liga-bump-wrap">${ligaBump(R, mine)}</div>` : '<div class="liga-sub">Ab der zweiten Woche gibt es hier einen Verlauf.</div>';

  // Kader-Abgleich
  const diff = Object.entries(FX.roster_diff || {});
  html += `<div class="liga-h2">Kader-Abgleich Fantrax ↔ Sheet</div>`;
  html += diff.length ? `<table class="teams-table liga-table"><thead><tr><th>Team</th><th>nur bei Fantrax</th><th>nur im Sheet</th></tr></thead><tbody>${diff.map(([a, x]) => `<tr><td>${ligaDot(a)}${ligaTeam(a).name}</td><td>${x.nur_fantrax.join(', ') || '—'}</td><td>${x.nur_sheet.join(', ') || '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="liga-sub">Keine Abweichungen.</div>';
  el.innerHTML = html;
}

function ligaSort(col) {
  if (FX_SORT.col === col) FX_SORT.dir *= -1; else { FX_SORT.col = col; FX_SORT.dir = ['rank', 'gb', 'str'].includes(col) ? 1 : -1; }
  ligaRender();
}

(function () {
  const orig = showPage;
  showPage = function (pg) { orig(pg); if (pg === 'liga') ligaInit().then(ligaRender); };
})();
