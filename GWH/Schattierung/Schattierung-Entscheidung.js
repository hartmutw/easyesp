// Node-RED Funktionsknoten zur komplexen Entscheidung für Schattierungssteuerung.
// Autor: KI-Assistent
// Version: 1.0

const enableNodeLogging = true; // Schalter für node.log Ausgaben

// --- 1. Eingänge (Input) Validierung ---
if (typeof msg.strahlungWm2 !== 'number' || isNaN(msg.strahlungWm2)) {
    node.error("Eingang 'msg.strahlungWm2' fehlt oder ist ungültig (muss eine Zahl sein). Empfangen: " + msg.strahlungWm2, msg);
    return null;
}
if (typeof msg.currentHHMM !== 'string' || !/^\d{2}:\d{2}$/.test(msg.currentHHMM)) {
    node.error("Eingang 'msg.currentHHMM' fehlt oder ist ungültig (Format HH:MM erwartet). Empfangen: " + msg.currentHHMM, msg);
    return null;
}

// Optionale Booleans, Standard auf false mit Warnung
if (msg.isNight === undefined) {
    if (enableNodeLogging) node.log("Eingang 'msg.isNight' fehlt, nehme 'false' (Tag) an.");
    msg.isNight = false;
} else if (typeof msg.isNight !== 'boolean') {
    node.warn("Eingang 'msg.isNight' ist kein Boolean, nehme 'false' (Tag) an. Empfangen: " + msg.isNight, msg);
    msg.isNight = false;
}

if (msg.sollSchliessenWegenSonnenuntergang === undefined) {
    if (enableNodeLogging) node.log("Eingang 'msg.sollSchliessenWegenSonnenuntergang' fehlt, nehme 'false' an.");
    msg.sollSchliessenWegenSonnenuntergang = false;
} else if (typeof msg.sollSchliessenWegenSonnenuntergang !== 'boolean') {
    node.warn("Eingang 'msg.sollSchliessenWegenSonnenuntergang' ist kein Boolean, nehme 'false' an. Empfangen: " + msg.sollSchliessenWegenSonnenuntergang, msg);
    msg.sollSchliessenWegenSonnenuntergang = false;
}

if (msg.sollSchliessenWegenFesterZeit === undefined) {
    if (enableNodeLogging) node.log("Eingang 'msg.sollSchliessenWegenFesterZeit' fehlt, nehme 'false' an.");
    msg.sollSchliessenWegenFesterZeit = false;
} else if (typeof msg.sollSchliessenWegenFesterZeit !== 'boolean') {
    node.warn("Eingang 'msg.sollSchliessenWegenFesterZeit' ist kein Boolean, nehme 'false' an. Empfangen: " + msg.sollSchliessenWegenFesterZeit, msg);
    msg.sollSchliessenWegenFesterZeit = false;
}

if (enableNodeLogging) {
    node.log("Eingangswerte: Strahlung=" + msg.strahlungWm2 + "Wm², Zeit=" + msg.currentHHMM +
             ", isNight=" + msg.isNight + ", SU-Schließen=" + msg.sollSchliessenWegenSonnenuntergang +
             ", FesteZeit-Schließen=" + msg.sollSchliessenWegenFesterZeit);
}

// --- 2. Konfiguration (Flow-Kontextvariablen) ---
const configDefaults = {
    "Schatt_Schwelle_Schliessen_Wm2": 500,
    "Schatt_Oeffnen_Reduktion_Prozent": 25,
    "Schatt_Verzoegerung_Schliessen_Min": 5,
    "Schatt_Verzoegerung_Oeffnen_Min": 10,
    "Schatt_Spalt_Oeffnen_Prozent": 10,
    "Schatt_System_Aktiv_Ab_HHMM": "07:00",
    "Schatt_System_Aktiv_Bis_HHMM": "20:00"
};

let config = {};
for (const key in configDefaults) {
    let value = flow.get(key);
    if (value === undefined || value === null) {
        value = configDefaults[key];
        flow.set(key, value);
        node.warn("Flow-Variable '" + key + "' nicht gefunden. Standardwert (" + value + ") wurde verwendet und im Flow-Kontext gesetzt.");
    } else if (typeof configDefaults[key] === 'number' && (typeof value !== 'number' || isNaN(value))) {
        const originalValue = value;
        value = configDefaults[key];
        flow.set(key, value);
        node.warn("Flow-Variable '" + key + "' war ungültig (Wert: " + originalValue + "). Standardwert (" + value + ") wurde verwendet und im Flow-Kontext gesetzt.");
    } else if (typeof configDefaults[key] === 'string' && (typeof value !== 'string' || (key.includes("_HHMM") && !/^\d{2}:\d{2}$/.test(value) ) )) {
        const originalValue = value;
        value = configDefaults[key];
        flow.set(key, value);
        node.warn("Flow-Variable '" + key + "' war ungültig (Wert: " + originalValue + "). Standardwert (" + value + ") wurde verwendet und im Flow-Kontext gesetzt.");
    }
    config[key] = value;
}

if (enableNodeLogging) {
    node.log("Konfigurationswerte geladen: " + JSON.stringify(config));
}

// --- 3. Interner Zustand (Knoten-Kontext) ---
let strahl_ueber_schwelle_schliessen_seit_ts = context.get('strahl_ueber_schwelle_schliessen_seit_ts') || null;
let strahl_unter_schwelle_oeffnen_seit_ts = context.get('strahl_unter_schwelle_oeffnen_seit_ts') || null;
let letzter_gesendeter_befehl_json = context.get('letzter_gesendeter_befehl_json') || null;

// --- 4. Hilfsfunktionen ---
function parseHHMM(hhmmString) { // Gibt Minuten seit Mitternacht zurück
    if (!hhmmString || typeof hhmmString !== 'string' || !/^\d{2}:\d{2}$/.test(hhmmString)) {
        node.warn("Ungültiges HH:MM String-Format für parseHHMM: " + hhmmString + ". Gebe 0 zurück.");
        return 0; // Fehlerfall oder Standard
    }
    const parts = hhmmString.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function isCurrentTimeInWindow(currentHHMM_str, startHHMM_str, endHHMM_str) {
    const currentMin = parseHHMM(currentHHMM_str);
    const startMin = parseHHMM(startHHMM_str);
    const endMin = parseHHMM(endHHMM_str);

    if (startMin <= endMin) { // Normales Fenster (z.B. 07:00 - 20:00)
        return currentMin >= startMin && currentMin < endMin;
    } else { // Fenster über Mitternacht (z.B. 20:00 - 06:00)
        return currentMin >= startMin || currentMin < endMin;
    }
}

// --- 5. Verarbeitungslogik und Prioritäten ---
const currentTime_ts = Date.now();
const dynamische_schwelle_oeffnen_wm2 = config.Schatt_Schwelle_Schliessen_Wm2 * (1 - (config.Schatt_Oeffnen_Reduktion_Prozent / 100.0));
if (enableNodeLogging) node.log("Dynamische Öffnungsschwelle berechnet: " + dynamische_schwelle_oeffnen_wm2 + " Wm²");

let ziel_befehl_objekt = null;

// Priorität 0: System inaktiv?
const istSystemAktivZeitfenster = isCurrentTimeInWindow(msg.currentHHMM, config.Schatt_System_Aktiv_Ab_HHMM, config.Schatt_System_Aktiv_Bis_HHMM);
if (enableNodeLogging) node.log("System Aktivitätszeitfenster (" + config.Schatt_System_Aktiv_Ab_HHMM + "-" + config.Schatt_System_Aktiv_Bis_HHMM + "): " + (istSystemAktivZeitfenster ? "INNERHALB" : "AUSSERHALB"));

if (!istSystemAktivZeitfenster && !msg.sollSchliessenWegenSonnenuntergang && !msg.sollSchliessenWegenFesterZeit) {
    if (enableNodeLogging) node.log("Priorität 0: System inaktiv (außerhalb Zeitfenster und keine SU/FesteZeit Schließung). Ziel: OEFFNEN.");
    ziel_befehl_objekt = { "aktion": "OEFFNEN" };
    strahl_ueber_schwelle_schliessen_seit_ts = null;
    strahl_unter_schwelle_oeffnen_seit_ts = null;
}

// Priorität 1: Spezifische Schließbefehle
if (ziel_befehl_objekt === null) {
    if (msg.sollSchliessenWegenSonnenuntergang) {
        if (enableNodeLogging) node.log("Priorität 1: Schließen wegen Sonnenuntergang. Ziel: SCHLIESSEN (Spalt 0%).");
        ziel_befehl_objekt = { "aktion": "SCHLIESSEN", "spalt_prozent": 0 };
        strahl_ueber_schwelle_schliessen_seit_ts = null;
        strahl_unter_schwelle_oeffnen_seit_ts = null;
    } else if (msg.sollSchliessenWegenFesterZeit) {
        if (enableNodeLogging) node.log("Priorität 1: Schließen wegen fester Zeit. Ziel: SCHLIESSEN (Spalt 0%).");
        ziel_befehl_objekt = { "aktion": "SCHLIESSEN", "spalt_prozent": 0 };
        strahl_ueber_schwelle_schliessen_seit_ts = null;
        strahl_unter_schwelle_oeffnen_seit_ts = null;
    }
}

// Priorität 2: Strahlungsbasierte Logik
if (ziel_befehl_objekt === null && istSystemAktivZeitfenster) {
    if (enableNodeLogging) node.log("Priorität 2: Strahlungsbasierte Logik aktiv.");
    // Schließen bei hoher Strahlung:
    if (msg.strahlungWm2 > config.Schatt_Schwelle_Schliessen_Wm2) {
        if (enableNodeLogging) node.log("Strahlung (" + msg.strahlungWm2 + ") > Schließschwelle (" + config.Schatt_Schwelle_Schliessen_Wm2 + ").");
        strahl_unter_schwelle_oeffnen_seit_ts = null; // Öffnen-Timer zurücksetzen
        if (strahl_ueber_schwelle_schliessen_seit_ts === null) {
            strahl_ueber_schwelle_schliessen_seit_ts = currentTime_ts;
            if (enableNodeLogging) node.log("Schließen-Timer gestartet (Zeit: " + currentTime_ts + ").");
        }

        if (currentTime_ts - strahl_ueber_schwelle_schliessen_seit_ts >= config.Schatt_Verzoegerung_Schliessen_Min * 60000) {
            let spalt = msg.isNight === true ? 0 : config.Schatt_Spalt_Oeffnen_Prozent;
            ziel_befehl_objekt = { "aktion": "SCHLIESSEN", "spalt_prozent": spalt };
            if (enableNodeLogging) node.log("Schließverzögerung erreicht. Ziel: SCHLIESSEN (Spalt " + spalt + "%). isNight=" + msg.isNight);
        } else {
            if (enableNodeLogging) node.log("Schließverzögerung noch nicht erreicht. Benötigt: " + config.Schatt_Verzoegerung_Schliessen_Min * 60000 + "ms, Vergangen: " + (currentTime_ts - strahl_ueber_schwelle_schliessen_seit_ts) + "ms.");
        }
    } else {
        if (strahl_ueber_schwelle_schliessen_seit_ts !== null) {
             if (enableNodeLogging) node.log("Strahlung (" + msg.strahlungWm2 + ") nicht mehr über Schließschwelle. Schließen-Timer zurückgesetzt.");
        }
        strahl_ueber_schwelle_schliessen_seit_ts = null;
    }

    // Öffnen bei niedriger Strahlung (nur wenn Schließen-Logik nicht aktiv wurde)
    if (ziel_befehl_objekt === null) {
        if (msg.strahlungWm2 < dynamische_schwelle_oeffnen_wm2) {
            if (enableNodeLogging) node.log("Strahlung (" + msg.strahlungWm2 + ") < dynamische Öffnungsschwelle (" + dynamische_schwelle_oeffnen_wm2 + ").");
            strahl_ueber_schwelle_schliessen_seit_ts = null; // Schließen-Timer zurücksetzen
            if (strahl_unter_schwelle_oeffnen_seit_ts === null) {
                strahl_unter_schwelle_oeffnen_seit_ts = currentTime_ts;
                if (enableNodeLogging) node.log("Öffnen-Timer gestartet (Zeit: " + currentTime_ts + ").");
            }

            if (currentTime_ts - strahl_unter_schwelle_oeffnen_seit_ts >= config.Schatt_Verzoegerung_Oeffnen_Min * 60000) {
                ziel_befehl_objekt = { "aktion": "OEFFNEN" };
                if (enableNodeLogging) node.log("Öffnungsverzögerung erreicht. Ziel: OEFFNEN.");
            } else {
                 if (enableNodeLogging) node.log("Öffnungsverzögerung noch nicht erreicht. Benötigt: " + config.Schatt_Verzoegerung_Oeffnen_Min * 60000 + "ms, Vergangen: " + (currentTime_ts - strahl_unter_schwelle_oeffnen_seit_ts) + "ms.");
            }
        } else {
            if (strahl_unter_schwelle_oeffnen_seit_ts !== null) {
                if (enableNodeLogging) node.log("Strahlung (" + msg.strahlungWm2 + ") nicht mehr unter dynamischer Öffnungsschwelle. Öffnen-Timer zurückgesetzt.");
            }
            strahl_unter_schwelle_oeffnen_seit_ts = null;
        }
    }
}

// Update context for timers
context.set('strahl_ueber_schwelle_schliessen_seit_ts', strahl_ueber_schwelle_schliessen_seit_ts);
context.set('strahl_unter_schwelle_oeffnen_seit_ts', strahl_unter_schwelle_oeffnen_seit_ts);

// --- Output-Handling ---
if (ziel_befehl_objekt !== null) {
    let ziel_befehl_json = JSON.stringify(ziel_befehl_objekt);
    if (ziel_befehl_json !== letzter_gesendeter_befehl_json) {
        context.set('letzter_gesendeter_befehl_json', ziel_befehl_json);
        msg.payload = ziel_befehl_objekt;
        if (enableNodeLogging) node.log("Neuer Befehl wird gesendet: " + ziel_befehl_json);
        return msg;
    } else {
        if (enableNodeLogging) node.log("Berechneter Befehl ist identisch zum letzten gesendeten Befehl. Sende nichts. Letzter Befehl: " + letzter_gesendeter_befehl_json);
        return null;
    }
} else {
    if (enableNodeLogging) node.log("Kein spezifischer Befehl ermittelt (ziel_befehl_objekt ist null). Sende nichts.");
    return null;
}
