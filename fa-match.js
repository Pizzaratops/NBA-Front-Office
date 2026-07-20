// ============================================================================
// fa-match.js — Abgleich der Summer-League-Spieler gegen die FA26-Liste
// (Free Agents der NBA-Front-Office-Dynastyliga, data/fa26-list.json).
// Rein lesend, keine Seiteneffekte auf players/playerMeta — liefert nur
// isFA26(name) für app.js (Filter + Badge in der Tabelle).
// ============================================================================

let FA26_SET = new Set();

function normFA(name){
  if(!name) return "";
  return name
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // Akzente entfernen
    .toLowerCase().trim()
    .replace(/[.']/g, "")
    .replace(/\b(jr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFA26(name){
  return FA26_SET.has(normFA(name));
}

// Lädt data/fa26-list.json (siehe scripts/update-fa26-list.py) beim Start.
// Fehlt die Datei (z.B. lokal ohne Server) oder ist sie leer, bleibt
// FA26_SET einfach leer — isFA26() liefert dann überall false, kein Fehler.
async function loadFA26ListFromFile(){
  try{
    const resp = await fetch("data/fa26-list.json?_=" + Date.now());
    if(!resp.ok) return { loaded: false };
    const data = await resp.json();
    const idx = data.normalized_index || (data.names || []).map(normFA);
    FA26_SET = new Set(idx);
    return { loaded: true, count: FA26_SET.size, updated: data.updated };
  }catch(e){
    return { loaded: false };
  }
}
