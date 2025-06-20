// Node-RED Funktionsknoten zur direkten Ansteuerung von zwei Relais (AUF/ZU)
// mit separaten Ausgängen für Zeitsteuerung (verzögertes AUS) und Ein/Aus-Befehle.
// Dieser Knoten ist für EINEN EINGANG und VIER AUSGÄNGE konfiguriert.
// Ausgang 1: AUF_Zeit (sendet verzögerten AUS-Befehl für AUF-Relais)
// Ausgang 2: AUF_Ein/Aus (sofortiger EIN/AUS für AUF-Relais)
// Ausgang 3: ZU_Zeit (sendet verzögerten AUS-Befehl für ZU-Relais)
// Ausgang 4: ZU_Ein/Aus (sofortiger EIN/AUS für ZU-Relais)

const enableNodeLogging = true; // Schalter für node.log Ausgaben

// Eingangsparameter und Validierung
let befehl_objekt = msg.payload;

// Grundlegende Validierung des Eingangsobjekts
if (typeof befehl_objekt !== 'object' || befehl_objekt === null) {
    node.error("Ungültiges msg.payload: Kein Objekt empfangen.", msg);
    return [null, null, null, null]; // Keine Nachrichten an alle vier Ausgänge
}

const relais = befehl_objekt.relais;
const kommando = befehl_objekt.kommando;
const laufzeit_sek = befehl_objekt.laufzeit_sek; // Kann undefined sein

// Validierung der 'relais' Eigenschaft
if (relais !== "AUF" && relais !== "ZU") {
    node.error("Ungültige 'relais' Eigenschaft im msg.payload: Muss 'AUF' oder 'ZU' sein. Empfangen: " + relais, msg);
    return [null, null, null, null];
}

// Validierung der 'kommando' Eigenschaft
const erlaubte_kommandos = ["AUS", "LAUF", "DAUER_AN"];
if (!erlaubte_kommandos.includes(kommando)) {
    node.error("Ungültige 'kommando' Eigenschaft im msg.payload: Muss 'AUS', 'LAUF' oder 'DAUER_AN' sein. Empfangen: " + kommando, msg);
    return [null, null, null, null];
}

// Validierung der 'laufzeit_sek' Eigenschaft, falls kommando "LAUF" ist
if (kommando === "LAUF") {
    if (typeof laufzeit_sek !== 'number' || laufzeit_sek <= 0) {
        node.error("Ungültige oder fehlende 'laufzeit_sek' Eigenschaft für Kommando 'LAUF'. Muss eine positive Zahl sein. Empfangen: " + laufzeit_sek, msg);
        return [null, null, null, null];
    }
}

// Nachrichtenvariablen für die vier Ausgänge initialisieren
let msg_auf_zeit = null;
let msg_auf_ein_aus = null;
let msg_zu_zeit = null;
let msg_zu_ein_aus = null;

if (enableNodeLogging) { node.log("Verarbeite Befehl: Relais=" + relais + ", Kommando=" + kommando + (kommando === "LAUF" ? ", Laufzeit=" + laufzeit_sek + "s" : "")); }

if (relais === "AUF") {
    if (kommando === "AUS") {
        msg_auf_ein_aus = { payload: "AUS" };
        if (enableNodeLogging) { node.log("Ausgang 2 (AUF_Ein/Aus): Sofort AUS"); }
    } else if (kommando === "DAUER_AN") {
        msg_auf_ein_aus = { payload: "EIN" };
        if (enableNodeLogging) { node.log("Ausgang 2 (AUF_Ein/Aus): Sofort EIN (DAUER_AN)"); }
    } else if (kommando === "LAUF") {
        // Für "LAUF": Sofort EIN senden, und einen verzögerten AUS-Befehl vorbereiten
        msg_auf_ein_aus = { payload: "EIN" };
        msg_auf_zeit = { payload: "AUS", delay: laufzeit_sek * 1000 }; // delay in Millisekunden
        if (enableNodeLogging) { node.log("Ausgang 2 (AUF_Ein/Aus): Sofort EIN (LAUF)"); }
        if (enableNodeLogging) { node.log("Ausgang 1 (AUF_Zeit): Verzögertes AUS nach " + laufzeit_sek + "s (delay: " + (laufzeit_sek * 1000) + "ms)"); }
    }
} else if (relais === "ZU") {
    if (kommando === "AUS") {
        msg_zu_ein_aus = { payload: "AUS" };
        if (enableNodeLogging) { node.log("Ausgang 4 (ZU_Ein/Aus): Sofort AUS"); }
    } else if (kommando === "DAUER_AN") {
        msg_zu_ein_aus = { payload: "EIN" };
        if (enableNodeLogging) { node.log("Ausgang 4 (ZU_Ein/Aus): Sofort EIN (DAUER_AN)"); }
    } else if (kommando === "LAUF") {
        // Für "LAUF": Sofort EIN senden, und einen verzögerten AUS-Befehl vorbereiten
        msg_zu_ein_aus = { payload: "EIN" };
        msg_zu_zeit = { payload: "AUS", delay: laufzeit_sek * 1000 }; // delay in Millisekunden
        if (enableNodeLogging) { node.log("Ausgang 4 (ZU_Ein/Aus): Sofort EIN (LAUF)"); }
        if (enableNodeLogging) { node.log("Ausgang 3 (ZU_Zeit): Verzögertes AUS nach " + laufzeit_sek + "s (delay: " + (laufzeit_sek * 1000) + "ms)"); }
    }
}

// Nachrichten an die Ausgänge senden
return [msg_auf_zeit, msg_auf_ein_aus, msg_zu_zeit, msg_zu_ein_aus];
