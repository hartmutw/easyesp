
// Node-RED Funktionsknoten zur Ansteuerung von Relais für eine Lüftungsklappe (Auf/Zu)
// Dieser Knoten ist für ZWEI AUSGÄNGE konfiguriert.
// Version mit ASCII-Pfad (Lueftung statt Lüftung)

// Eingangsparameter und Validierung
let ziel_prozent = parseFloat(msg.payload);
if (isNaN(ziel_prozent) || ziel_prozent < 0 || ziel_prozent > 100) {
    node.error("Ungültiger oder fehlender Zielprozentsatz (msg.payload). Muss eine Zahl zwischen 0 und 100 sein.", msg);
    return null; // Stoppt den Flow, keine Nachrichten an Ausgänge
}

// Konfiguration aus dem Flow-Kontext
const STANDARD_MAX_RUNTIME_SEC = 30.0;
let aktive_max_runtime_sec = parseFloat(flow.get("MAX_RUNTIME_SEC"));
if (isNaN(aktive_max_runtime_sec)) {
    aktive_max_runtime_sec = STANDARD_MAX_RUNTIME_SEC;
    flow.set("MAX_RUNTIME_SEC", aktive_max_runtime_sec); // Standardwert im Flow-Kontext setzen/aktualisieren
    node.warn("MAX_RUNTIME_SEC nicht im Flow-Kontext gefunden/ungültig. Standardwert (" + aktive_max_runtime_sec + "s) wurde verwendet und im Flow-Kontext gesetzt.");
}

// Interner Zustand (Knoten-Kontext)
let aktuelle_position_prozent = context.get("aktuelle_position_prozent");
let zuletzt_aktives_relais = context.get("zuletzt_aktives_relais");

// Initialisierung des internen Zustands beim ersten Lauf
if (aktuelle_position_prozent === undefined) {
    aktuelle_position_prozent = 0; // Annahme: Startposition ist 0% (geschlossen)
    node.log("Initialisiere aktuelle_position_prozent auf 0%");
}
if (zuletzt_aktives_relais === undefined) {
    zuletzt_aktives_relais = "KEINES"; // Kein Relais war bisher aktiv
    node.log("Initialisiere zuletzt_aktives_relais auf 'KEINES'");
}

// Berechnung der Differenz
let differenz_prozent = ziel_prozent - aktuelle_position_prozent;

// Wenn keine Änderung erforderlich ist
if (differenz_prozent === 0) {
    node.log("Zielposition (" + ziel_prozent + "%) bereits erreicht. Keine Aktion.");
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
    node.log("Fahre komplett ZU. Ggf. AUF-Relais AUS, ZU-Relais DAUER_AN.");
} else if (ziel_prozent === 100) {
    // Fall: Komplett AUF fahren
    if (zuletzt_aktives_relais === "ZU") {
        nachricht_ausgang1 = { payload: { "relais": "ZU", "kommando": "AUS" } };
    }
    nachricht_ausgang2 = { payload: { "relais": "AUF", "kommando": "DAUER_AN" } };
    naechstes_aktives_relais = "AUF";
    node.log("Fahre komplett AUF. Ggf. ZU-Relais AUS, AUF-Relais DAUER_AN.");
} else if (differenz_prozent > 0) {
    // Fall: ÖFFNEN / AUF-Fahren (nicht zu 100%)
    let laufzeit_sek = (differenz_prozent / 100) * aktive_max_runtime_sec;
    if (laufzeit_sek > 0) {
        if (zuletzt_aktives_relais === "ZU") {
            nachricht_ausgang1 = { payload: { "relais": "ZU", "kommando": "AUS" } };
        }
        nachricht_ausgang2 = { payload: { "relais": "AUF", "kommando": "LAUF", "laufzeit_sek": laufzeit_sek } };
        naechstes_aktives_relais = "AUF";
        node.log("Öffne um " + differenz_prozent.toFixed(2) + "%. Ggf. ZU-Relais AUS, AUF-Relais LAUF für " + laufzeit_sek.toFixed(2) + "s.");
    } else {
        node.log("Berechnete Laufzeit zum Öffnen ist <= 0s (" + laufzeit_sek.toFixed(2) + "s). Keine Aktion.");
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
        node.log("Schließe um " + Math.abs(differenz_prozent).toFixed(2) + "%. Ggf. AUF-Relais AUS, ZU-Relais LAUF für " + laufzeit_sek.toFixed(2) + "s.");
    } else {
        node.log("Berechnete Laufzeit zum Schließen ist <= 0s (" + laufzeit_sek.toFixed(2) + "s). Keine Aktion.");
        return [null, null];
    }
}

// Internen Zustand aktualisieren *nach* der Logik-Abarbeitung
context.set("aktuelle_position_prozent", ziel_prozent);
context.set("zuletzt_aktives_relais", naechstes_aktives_relais);
node.log("Kontext aktualisiert: aktuelle_position_prozent=" + ziel_prozent + "%, zuletzt_aktives_relais=" + naechstes_aktives_relais);

// Nachrichten an die Ausgänge senden
return [nachricht_ausgang1, nachricht_ausgang2];
