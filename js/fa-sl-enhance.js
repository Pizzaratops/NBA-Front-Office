// ══════════════════════════════════════════════════════════════════
// FA — SUMMER LEAGUE 2026 ENHANCEMENT
// Attaches 2026-Summer-League participation (games played, per-game
// stat line) onto the existing FAS objects so the Free-Agents page can
// sort by it ("🏀 SL 2026 GP ↓") and filter to "nur mit SL-2026-Sample".
// Source: data/fa-sl2026.json — static snapshot (nbadraft.app Summer
// League Explorer export), does not auto-refresh like data/data.json.
// ══════════════════════════════════════════════════════════════════

let FASL_DATA = {};
let FASL_READY = false;

async function faslInit() {
  if (FASL_READY) return;
  try {
    const res = await fetch('data/fa-sl2026.json', { cache: 'no-store' });
    FASL_DATA = res.ok ? await res.json() : {};
  } catch (e) { FASL_DATA = {}; }
  FASL_READY = true;
}

function faslAttach() {
  (FAS || []).forEach(f => {
    const sl = FASL_DATA[f.name];
    f.sl = sl ? sl.gp : 0;
    f._slInfo = sl || null;
  });
}

function faslBadge(name) {
  const sl = FASL_DATA[name];
  if (!sl || !sl.gp) return '';
  const line = `${sl.pts ?? '—'}/${sl.reb ?? '—'}/${sl.ast ?? '—'} · ${sl.min}min`;
  return `<span class="fasl-badge" title="2026 Summer League: ${sl.gp} Spiele, ${line}">🏀 ${sl.gp}</span>`;
}

// wrap renderFA: attach sl data, honor the "nur mit SL-2026-Sample" checkbox,
// then decorate the rendered rows with a small badge — same non-invasive
// pattern as the other fa-*.js additions (wrapping showTool etc.)
(function () {
  const orig = renderFA;
  renderFA = function () {
    faslAttach();
    const onlyBox = document.getElementById('fa-sl-only');
    const onlySl = onlyBox && onlyBox.checked;
    let realFAS = null;
    if (onlySl) {
      realFAS = FAS;
      FAS = FAS.filter(f => f.sl > 0);
    }
    orig();
    if (onlySl) FAS = realFAS;

    // decorate rows with the 🏀 badge (match by player name embedded in onclick)
    document.querySelectorAll('#fa-table-wrap tr.fa-row').forEach(tr => {
      const onclick = tr.getAttribute('onclick') || '';
      const m = onclick.match(/selectFAForTools\('([^']*)'/);
      if (!m) return;
      const name = m[1].replace(/\\'/g, "'");
      const badge = faslBadge(name);
      if (!badge) return;
      const nameCell = tr.querySelector('td');
      if (nameCell && !nameCell.querySelector('.fasl-badge')) {
        nameCell.insertAdjacentHTML('beforeend', ' ' + badge);
      }
    });
  };
})();

// re-render once the SL data is loaded (data/data.json + FAS may already be
// ready by the time this script runs, so trigger an initial paint too)
faslInit().then(() => { if (typeof FAS !== 'undefined' && FAS.length && document.getElementById('page-fa')) renderFA(); });
