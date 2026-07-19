// ══════════════════════════════════════════════════════════════════
// FA — SUMMER LEAGUE 25+26 ENHANCEMENT
// Attaches Summer-League participation (2025 + 2026 combined, games
// played, per-game stat line) onto the existing FAS objects so the
// Free-Agents page can sort by it ("🏀 SL GP (25+26) ↓"), filter to
// "nur mit SL-Sample", and sort by the derived "🔥 SL Upside" score.
//
// Source: data/fa-sl-sample.json — static snapshot (nbadraft.app
// Summer League Explorer export, combined 2025+2026, regenerate with
// scripts/build_fa_sl_sample.py), does not auto-refresh like
// data/data.json does. pts/reb/ast in that file are real per-game
// averages (already converted from the per-36 rates the raw CSV
// export uses).
// ══════════════════════════════════════════════════════════════════

let FASL_DATA = {};
let FASL_READY = false;

// Minimum Summer-League-Spiele, ab denen ein "SL Upside"-Score
// ueberhaupt ausgewiesen wird — darunter ist die Stichprobe zu klein
// (z.B. 1 Spiel mit 6 Minuten), Score bleibt "—". Bei Bedarf anpassen.
const FASL_UPSIDE_MIN_GP = 2;

// Gewichtung fuer den Upside-Score (Punkte/Rebounds/Assists pro Minute,
// auf eine 36-Minuten-Rate hochgerechnet, damit die Zahl lesbar bleibt).
// Das sind generische Fantasy-Gewichte (nicht zwingend die Scoring-Regeln
// deiner Liga) — hier anpassen, falls du die exakten Settings willst.
const FASL_UPSIDE_WEIGHTS = { pts: 1, reb: 1.2, ast: 1.5 };

// custom sort state for the "SL Upside" column/dropdown-option — kept
// entirely separate from the app's own faSort, since app.js's sort
// logic doesn't know this derived column exists.
let FASL_UPSIDE_SORT_ACTIVE = false;
let FASL_UPSIDE_SORT_DIR = -1;

async function faslInit() {
  if (FASL_READY) return;
  try {
    const res = await fetch('data/fa-sl-sample.json', { cache: 'no-store' });
    FASL_DATA = res.ok ? await res.json() : {};
  } catch (e) { FASL_DATA = {}; }
  FASL_READY = true;
}

function faslAttach() {
  (FAS || []).forEach(f => {
    const sl = FASL_DATA[f.name];
    f.sl = sl ? sl.gp : 0;
    f._slInfo = sl || null;
    f.slUpside = faslUpsideScore(sl);
  });
}

// Punkte/Rebounds/Assists pro Minute, auf 36 Minuten hochgerechnet.
// null, wenn Mindest-GP nicht erreicht oder keine SL-Daten vorhanden.
function faslUpsideScore(sl) {
  if (!sl || !sl.gp || sl.gp < FASL_UPSIDE_MIN_GP || !sl.min) return null;
  const perMin = (sl.pts * FASL_UPSIDE_WEIGHTS.pts
                + sl.reb * FASL_UPSIDE_WEIGHTS.reb
                + sl.ast * FASL_UPSIDE_WEIGHTS.ast) / sl.min;
  return Math.round(perMin * 36 * 10) / 10;
}

function faslBadge(name) {
  const sl = FASL_DATA[name];
  if (!sl || !sl.gp) return '';
  const line = `${sl.pts ?? '—'}/${sl.reb ?? '—'}/${sl.ast ?? '—'} · ${sl.min}min`;
  return `<span class="fasl-badge" title="Summer League 25+26: ${sl.gp} Spiele, ${line}">🏀 ${sl.gp}</span>`;
}

// helper: read the player name a rendered <tr> belongs to
function faslNameFromRow(tr) {
  const onclick = tr.getAttribute('onclick') || '';
  const m = onclick.match(/selectFAForTools\('([^']*)'/);
  return m ? m[1].replace(/\\'/g, "'") : null;
}

// wrap renderFA: attach sl data, ALWAYS render against the full FAS pool
// (so Fair Value / Rang keep computing over the whole free-agent pool),
// then apply the "nur mit SL-Sample" checkbox purely as a visual filter
// (hide rows, don't shrink the pool the app's own math runs against).
// Also decorates rows with the 🏀 badge and, when active, re-sorts rows
// by the derived "SL Upside" score.
(function () {
  const orig = renderFA;
  renderFA = function () {
    faslAttach();
    const onlyBox = document.getElementById('fa-sl-only');
    const onlySl = onlyBox && onlyBox.checked;

    // Fair-Value-Pool-Fix: nie mehr die zugrunde liegende FAS-Liste
    // vertauschen — immer gegen den vollen Pool rendern.
    orig();

    if (onlySl) {
      document.querySelectorAll('#fa-table-wrap tr.fa-row').forEach(tr => {
        const name = faslNameFromRow(tr);
        const sl = name ? FASL_DATA[name] : null;
        if (!sl || !sl.gp) tr.style.display = 'none';
      });
    }

    // decorate rows with the 🏀 badge (match by player name embedded in onclick)
    document.querySelectorAll('#fa-table-wrap tr.fa-row').forEach(tr => {
      const name = faslNameFromRow(tr);
      if (!name) return;
      const badge = faslBadge(name);
      if (!badge) return;
      const nameCell = tr.querySelector('td');
      if (nameCell && !nameCell.querySelector('.fasl-badge')) {
        nameCell.insertAdjacentHTML('beforeend', ' ' + badge);
      }
    });

    // make FPG / Rang / Fair Value column headers clickable to sort,
    // in addition to the existing dropdown
    const headRow = document.querySelector('#fa-table-wrap table.fa-table thead tr');
    if (headRow) {
      const ths = headRow.querySelectorAll('th');
      // ths order: Spieler, FPG, Rang, [Fair Value, Empfehlung]
      faslWireHeader(ths[1], 'fpg');
      faslWireHeader(ths[2], 'fpg'); // Rang folgt der ursprünglichen FPG-Reihenfolge
      faslWireHeader(ths[3], 'fairVal');
    }

    faslAddUpsideColumn();
    if (FASL_UPSIDE_SORT_ACTIVE) faslApplyUpsideSort();
  };
})();

function faslWireHeader(th, col) {
  if (!th) return;
  th.style.cursor = 'pointer';
  th.classList.toggle('sorted', faSort.col === col);
  const baseLabel = th.dataset.faslLabel || th.textContent.replace(/[↑↓]\s*$/, '').trim();
  th.dataset.faslLabel = baseLabel;
  const arrow = faSort.col === col ? (faSort.dir === 1 ? ' ↑' : ' ↓') : '';
  th.textContent = baseLabel + arrow;
  th.onclick = () => {
    FASL_UPSIDE_SORT_ACTIVE = false;
    if (faSort.col === col) faSort.dir *= -1;
    else { faSort.col = col; faSort.dir = -1; }
    renderFA();
  };
}

// Appends a "SL Upside" column (header + per-row cell) onto whatever
// table renderFA() just produced — independent of how many native
// columns (Fair Value/Empfehlung) happen to be present.
function faslAddUpsideColumn() {
  const table = document.querySelector('#fa-table-wrap table.fa-table');
  if (!table) return;
  const headRow = table.querySelector('thead tr');
  if (!headRow) return;

  let th = headRow.querySelector('.fasl-upside-th');
  if (!th) {
    th = document.createElement('th');
    th.className = 'right fasl-upside-th';
    headRow.appendChild(th);
  }
  const arrow = FASL_UPSIDE_SORT_ACTIVE ? (FASL_UPSIDE_SORT_DIR === 1 ? ' ↑' : ' ↓') : '';
  th.textContent = '🔥 SL Upside' + arrow;
  th.style.cursor = 'pointer';
  th.title = `Punkte+Rebounds+Assists pro Minute (SL 25+26), auf 36 Min. hochgerechnet. Nur ab ${FASL_UPSIDE_MIN_GP}+ SL-Spielen, sonst „—“.`;
  th.classList.toggle('sorted', FASL_UPSIDE_SORT_ACTIVE);
  th.onclick = () => {
    if (FASL_UPSIDE_SORT_ACTIVE) FASL_UPSIDE_SORT_DIR *= -1;
    else { FASL_UPSIDE_SORT_ACTIVE = true; FASL_UPSIDE_SORT_DIR = -1; }
    const sel = document.getElementById('fa-sort-select');
    if (sel) sel.value = 'slupside-1';
    renderFA();
  };

  table.querySelectorAll('tbody tr.fa-row').forEach(tr => {
    let td = tr.querySelector('.fasl-upside-td');
    if (!td) {
      td = document.createElement('td');
      td.className = 'right fasl-upside-td';
      tr.appendChild(td);
    }
    const name = faslNameFromRow(tr);
    const score = name ? faslUpsideScore(FASL_DATA[name]) : null;
    td.textContent = score != null ? score.toFixed(1) : '—';
  });
}

// Re-orders the already-rendered <tr> rows by SL Upside score. Runs
// purely on the DOM, so it works regardless of what renderFA()'s own
// default sort did — it doesn't need app.js to know the "slUpside"
// column exists.
function faslApplyUpsideSort() {
  const tbody = document.querySelector('#fa-table-wrap table.fa-table tbody');
  if (!tbody) return;
  const dir = FASL_UPSIDE_SORT_DIR;
  const rows = Array.from(tbody.querySelectorAll('tr.fa-row'));
  rows.sort((trA, trB) => {
    const a = faslUpsideScore(FASL_DATA[faslNameFromRow(trA)]);
    const b = faslUpsideScore(FASL_DATA[faslNameFromRow(trB)]);
    const va = a == null ? -Infinity : a;
    const vb = b == null ? -Infinity : b;
    return va < vb ? dir : va > vb ? -dir : 0;
  });
  rows.forEach(tr => tbody.appendChild(tr)); // appendChild on existing node = move
}

// wrap setFASort so selecting "🔥 SL Upside" in the dropdown activates
// our own DOM-level sort instead of the app's native column sort
// (which doesn't know about this derived column) — any other value
// falls back to the original behavior and switches upside-sort off.
(function () {
  if (typeof setFASort !== 'function') return;
  const origSetFASort = setFASort;
  setFASort = function () {
    const sel = document.getElementById('fa-sort-select');
    if (sel && sel.value === 'slupside-1') {
      FASL_UPSIDE_SORT_ACTIVE = true;
      FASL_UPSIDE_SORT_DIR = -1;
      renderFA();
      return;
    }
    FASL_UPSIDE_SORT_ACTIVE = false;
    origSetFASort();
  };
})();

// re-render once the SL data is loaded (data/data.json + FAS may already be
// ready by the time this script runs, so trigger an initial paint too)
faslInit().then(() => { if (typeof FAS !== 'undefined' && FAS.length && document.getElementById('page-fa')) renderFA(); });
