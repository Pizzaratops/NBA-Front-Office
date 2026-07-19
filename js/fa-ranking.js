// ══════════════════════════════════════════════════════════════════
// FA RANKING — plugs into the existing Tools tab.
// Static snapshot from Claude analysis: 25/26 FP/G production + StickyScore
// (Summer-League-Modell) + TTHQ-Live-Z (2026 Summer League) + ESPN
// real-fit signal, blended into one composite per FA26 player.
// Source: data/fa-ranking.json — regenerate by hand when you want an
// updated read, it does not auto-refresh like data/data.json does.
// ══════════════════════════════════════════════════════════════════

let FAR_DATA = [];
let FAR_READY = false;
let FAR_SORT = { col: 'c', dir: -1 };
let FAR_TIER_FILTER = '';

const FAR_TIER_CLASS = { "Star/Max": "max", "Non-Tax MLE": "high", "BAE": "mid", "Vet-Min": "min", "Two-Way": "min" };
const FAR_TIER_LABEL = {
  "Star/Max": "Star / Max", "Non-Tax MLE": "Non-Tax MLE ($15M)",
  "BAE": "BAE ($5.5M)", "Vet-Min": "Vet-Min", "Two-Way": "Two-Way"
};

async function farInit() {
  if (FAR_READY) return;
  try {
    const res = await fetch('data/fa-ranking.json', { cache: 'no-store' });
    FAR_DATA = res.ok ? await res.json() : [];
  } catch (e) { FAR_DATA = []; }
  FAR_READY = true;
}

function farRenderShell() {
  const el = document.getElementById('tool-faranking');
  if (!el || el.dataset.farBuilt) return;
  el.dataset.farBuilt = '1';
  el.innerHTML = `
    <div class="tool-card" style="flex-shrink:0">
      <div class="tool-card-title">📊 FA Ranking <span class="fab-pill" id="far-count-pill">0 Spieler</span></div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Composite aus 25/26-Produktion, StickyScore, TTHQ-Live-Z (2026 SL) und ESPN-Real-Fit-Signal. Statische Momentaufnahme, kein Live-Feed.</p>
      <div class="form-row" style="margin-bottom:0">
        <div class="form-group">
          <label class="form-label">Suche</label>
          <input class="form-input" type="text" id="far-search" placeholder="Spieler suchen…" oninput="farRender()">
        </div>
        <div class="form-group" style="max-width:180px">
          <label class="form-label">Tier-Filter</label>
          <select class="form-select" id="far-tier-filter" onchange="farOnTierChange()">
            <option value="">Alle Tiers</option>
            <option value="Star/Max">Star / Max</option>
            <option value="Non-Tax MLE">Non-Tax MLE</option>
            <option value="BAE">BAE</option>
            <option value="Vet-Min">Vet-Min</option>
            <option value="Two-Way">Two-Way</option>
          </select>
        </div>
      </div>
    </div>
    <div class="fa-table-wrap" id="far-table-wrap" style="flex:1"></div>
  `;
  document.getElementById('far-tier-filter').value = FAR_TIER_FILTER;
}

function farOnTierChange() {
  FAR_TIER_FILTER = document.getElementById('far-tier-filter').value;
  farRender();
}

function farSortBy(col) {
  if (FAR_SORT.col === col) FAR_SORT.dir *= -1;
  else { FAR_SORT.col = col; FAR_SORT.dir = col === 'n' ? 1 : -1; }
  farRender();
}

function farRender() {
  const wrap = document.getElementById('far-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('far-search').value || '').toLowerCase();
  let rows = FAR_DATA;
  if (search) rows = rows.filter(r => r.n.toLowerCase().includes(search));
  if (FAR_TIER_FILTER) rows = rows.filter(r => r.tier === FAR_TIER_FILTER);

  const col = FAR_SORT.col, dir = FAR_SORT.dir;
  rows = [...rows].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va === null || va === undefined) va = col === 'n' ? '' : -999;
    if (vb === null || vb === undefined) vb = col === 'n' ? '' : -999;
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    return va < vb ? dir : va > vb ? -dir : 0;
  });

  document.getElementById('far-count-pill').textContent = `${rows.length} / ${FAR_DATA.length} Spieler`;

  const hdr = (label, key, extraCls) => {
    const sorted = FAR_SORT.col === key ? ' sorted' : '';
    const arrow = FAR_SORT.col === key ? (FAR_SORT.dir === 1 ? ' ↑' : ' ↓') : '';
    return `<th class="${extraCls || ''}${sorted}" onclick="farSortBy('${key}')">${label}${arrow}</th>`;
  };

  let html = `<table class="fa-table"><thead><tr>
    ${hdr('Spieler', 'n')}
    <th>Pos</th>
    <th>Team</th>
    ${hdr('FP/G 25/26', 'fpg', 'right')}
    ${hdr('Sticky', 'sk', 'right')}
    ${hdr('TTHQ-Z', 'tz', 'right')}
    ${hdr('ESPN-Fit', 'espn', 'right')}
    ${hdr('Composite', 'c', 'right')}
    <th>Tier</th>
  </tr></thead><tbody>`;

  rows.forEach(r => {
    const tierCls = FAR_TIER_CLASS[r.tier] || 'min';
    const tierLabel = FAR_TIER_LABEL[r.tier] || r.tier;
    html += `<tr class="fa-row">
      <td><span style="font-weight:600">${r.n}</span></td>
      <td style="color:var(--dim);font-size:11px">${r.p || '—'}</td>
      <td style="color:var(--dim);font-size:11px">${r.t || '—'}</td>
      <td class="right">${r.fpg != null ? r.fpg.toFixed(1) : '—'}</td>
      <td class="right">${r.sk != null ? r.sk.toFixed(1) : '—'}</td>
      <td class="right">${r.tz != null ? r.tz.toFixed(1) + (r.tgp ? ' (' + r.tgp + ' Sp.)' : '') : '—'}</td>
      <td class="right">${r.espn || '—'}</td>
      <td class="right" style="font-weight:700">${r.c.toFixed(2)}</td>
      <td><span class="rec-badge ${tierCls}">${tierLabel}</span></td>
    </tr>`;
  });
  wrap.innerHTML = html + '</tbody></table>';
}

async function renderFARanking() {
  await farInit();
  farRenderShell();
  farRender();
}

// hook into the existing showTool() switcher, same pattern app.js already uses for ownercap
(function () {
  const orig = showTool;
  showTool = function (t) { orig(t); if (t === 'faranking') renderFARanking(); };
})();
