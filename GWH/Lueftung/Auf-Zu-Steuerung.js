// Node-RED Funktionsknoten zur Ansteuerung von Relais für eine Lüftungsklappe (Auf/Zu)
// Dieser Knoten ist für ZWEI AUSGÄNGE konfiguriert.
// Verwendet msg.index als Präfix für Flow-Variablen (MAX_RUNTIME_SEC).
// Stellt sicher, dass msg.index an Ausgänge weitergegeben wird.

const enableNodeLogging = true; // Schalter für node.log Ausgaben

// msg.index für dynamische Flow-Variablennamen verwenden
const index_prefix = msg.index;
if (typeof index_prefix !== 'string' || index_prefix.length === 0) {
    node.error("msg.index (Präfix für Flow-Variablen) fehlt oder ist ungültig.", msg);
    return [null, null]; // Return array for two outputs
}

// Eingangsparameter und Validierung
let ziel_prozent = parseFloat(msg.payload);
if (isNaN(ziel_prozent) || ziel_prozent < 0 || ziel_prozent > 100) {
    node.error("Ungültiger oder fehlender Zielprozentsatz (msg.payload). Muss eine Zahl zwischen 0 und 100 sein.", msg);
    return [null, null]; // Stoppt den Flow, keine Nachrichten an Ausgänge
}

// Konfiguration aus dem Flow-Kontext
const STANDARD_MAX_RUNTIME_SEC = 30.0;
const max_runtime_var_name = index_prefix + "MAX_RUNTIME_SEC";
let aktive_max_runtime_sec = parseFloat(flow.get(max_runtime_var_name));
if (isNaN(aktive_max_runtime_sec)) {
    aktive_max_runtime_sec = STANDARD_MAX_RUNTIME_SEC;
    flow.set(max_runtime_var_name, aktive_max_runtime_sec); // Standardwert im Flow-Kontext setzen/aktualisieren
    node.warn("Flow-Variable '" + max_runtime_var_name + "' nicht gefunden/ungültig. Standardwert (" + aktive_max_runtime_sec + "s) wurde verwendet und im Flow-Kontext gesetzt.");
}

// Interner Zustand (Knoten-Kontext)
let aktuelle_position_prozent = context.get("aktuelle_position_prozent");
let zuletzt_aktives_relais = context.get("zuletzt_aktives_relais");

// Initialisierung des internen Zustands beim ersten Lauf
if (aktuelle_position_prozent === undefined) {
    aktuelle_position_prozent = 0; // Annahme: Startposition ist 0% (geschlossen)
    if (enableNodeLogging) { node.log("Initialisiere aktuelle_position_prozent auf 0%"); }
}
if (zuletzt_aktives_relais === undefined) {
    zuletzt_aktives_relais = "KEINES"; // Kein Relais war bisher aktiv
    if (enableNodeLogging) { node.log("Initialisiere zuletzt_aktives_relais auf 'KEINES'"); }
}

// Berechnung der Differenz
let differenz_prozent = ziel_prozent - aktuelle_position_prozent;

// Wenn keine Änderung erforderlich ist
if (differenz_prozent === 0) {
    if (enableNodeLogging) { node.log("Zielposition (" + ziel_prozent + "%) bereits erreicht. Keine Aktion."); }
    return [null, null]; // Keine Nachrichten an beide Ausgänge
}

// Nachrichtenvariablen für die zwei Ausgänge
let nachricht_ausgang1 = null; // Für Sofort-Befehle (Relais AUS)
let nachricht_ausgang2 = null; // Für verzögerte Befehle (Relais AN/LAUF/DAUER_AN)

let naechstes_aktives_relais = zuletzt_aktives_relais;

// Verarbeitungslogik basierend auf Zielposition und Differenz
if (ziel_prozent === 0) {
    // Fall: Komplett ZU fahren
    if (zuletzt_aktives_relais === "AUF") {
        nachricht_ausgang1 = { payload: { "relais": "AUF", "kommando": "AUS" } };
    }
    nachricht_ausgang2 = { payload: { "relais": "ZU", "kommando": "DAUER_AN" } };
    naechstes_aktives_relais = "ZU";
    if (enableNodeLogging) { node.log("Fahre komplett ZU. Ggf. AUF-Relais AUS, ZU-Relais DAUER_AN."); }
} else if (ziel_prozent === 100) {
    // Fall: Komplett AUF fahren
    if (zuletzt_aktives_relais === "ZU") {
        nachricht_ausgang1 = { payload: { "relais": "ZU", "kommando": "AUS" } };
    }
    nachricht_ausgang2 = { payload: { "relais": "AUF", "kommando": "DAUER_AN" } };
    naechstes_aktives_relais = "AUF";
    if (enableNodeLogging) { node.log("Fahre komplett AUF. Ggf. ZU-Relais AUS, AUF-Relais DAUER_AN."); }
} else if (differenz_prozent > 0) {
    // Fall: ÖFFNEN / AUF-Fahren (nicht zu 100%)
    let laufzeit_sek = (differenz_prozent / 100) * aktive_max_runtime_sec;
    if (laufzeit_sek > 0) {
        if (zuletzt_aktives_relais === "ZU") {
            nachricht_ausgang1 = { payload: { "relais": "ZU", "kommando": "AUS" } };
        }
        nachricht_ausgang2 = { payload: { "relais": "AUF", "kommando": "LAUF", "laufzeit_sek": laufzeit_sek } };
        naechstes_aktives_relais = "AUF";
        if (enableNodeLogging) { node.log("Öffne um " + differenz_prozent.toFixed(2) + "%. Ggf. ZU-Relais AUS, AUF-Relais LAUF für " + laufzeit_sek.toFixed(2) + "s."); }
    } else {
        if (enableNodeLogging) { node.log("Berechnete Laufzeit zum Öffnen ist <= 0s (" + laufzeit_sek.toFixed(2) + "s). Keine Aktion."); }
        return [null, null];
    }
} else if (differenz_prozent < 0) {
    // Fall: SCHLIESSEN / ZU-Fahren (nicht zu 0%)
    let laufzeit_sek = (Math.abs(differenz_prozent) / 100) * aktive_max_runtime_sec;
    if (laufzeit_sek > 0) {
        if (zuletzt_aktives_relais === "AUF") {
            nachricht_ausgang1 = { payload: { "relais": "AUF", "kommando": "AUS" } };
        }
        nachricht_ausgang2 = { payload: { "relais": "ZU", "kommando": "LAUF", "laufzeit_sek": laufzeit_sek } };
        naechstes_aktives_relais = "ZU";
        if (enableNodeLogging) { node.log("Schließe um " + Math.abs(differenz_prozent).toFixed(2) + "%. Ggf. AUF-Relais AUS, ZU-Relais LAUF für " + laufzeit_sek.toFixed(2) + "s."); }
    } else {
        if (enableNodeLogging) { node.log("Berechnete Laufzeit zum Schließen ist <= 0s (" + laufzeit_sek.toFixed(2) + "s). Keine Aktion."); }
        return [null, null];
    }
}

// Internen Zustand aktualisieren *nach* der Logik-Abarbeitung
context.set("aktuelle_position_prozent", ziel_prozent);
context.set("zuletzt_aktives_relais", naechstes_aktives_relais);
if (enableNodeLogging) { node.log("Kontext aktualisiert: aktuelle_position_prozent=" + ziel_prozent + "%, zuletzt_aktives_relais=" + naechstes_aktives_relais); }

// msg.index an ausgehende Nachrichten anhängen, falls diese existieren
if (nachricht_ausgang1 !== null) {
    nachricht_ausgang1.index = index_prefix;
}
if (nachricht_ausgang2 !== null) {
    nachricht_ausgang2.index = index_prefix;
}

// Nachrichten an die Ausgänge senden
return [nachricht_ausgang1, nachricht_ausgang2];
