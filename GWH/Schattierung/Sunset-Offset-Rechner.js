// Node-RED Funktionsknoten zur Berechnung einer Schließzeit basierend auf Sonnenuntergang und Offset.
// Eingang: msg (von suncalc), erwartet msg.end als ISO-Datumsstring.
// Ausgang: msg, ergänzt um berechnete Zeitstempel und HH:MM Strings.
// Verwendet Flow-Kontext für "Schatt_Sonnenuntergang_Offset_Min".

const enableNodeLogging = true; // Schalter für node.log Ausgaben

// Hilfsfunktion zur Formatierung einer Zahl auf zwei Stellen mit führender Null
function formatHHMMValue(value) {
    return value < 10 ? '0' + value : value.toString();
}

// Hilfsfunktion zur Formatierung eines Date-Objekts als HH:MM String
function dateToHHMMString(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return "Ungültiges Datum";
    }
    const hours = formatHHMMValue(dateObj.getHours());
    const minutes = formatHHMMValue(dateObj.getMinutes());
    return hours + ":" + minutes;
}

// 1. Eingang (Input) Validierung für msg.end
let sonnenuntergang_date;

if (msg.end instanceof Date && !isNaN(msg.end.getTime())) {
    // msg.end ist bereits ein gültiges Date-Objekt
    sonnenuntergang_date = msg.end;
    if (enableNodeLogging) { node.log("msg.end ist bereits ein gültiges Date-Objekt: " + sonnenuntergang_date.toISOString()); }
} else if (typeof msg.end === 'string') {
    // msg.end ist ein String, versuche zu parsen
    if (enableNodeLogging) { node.log("msg.end ist ein String ('" + msg.end + "'), versuche zu parsen..."); }
    try {
        sonnenuntergang_date = new Date(msg.end);
        if (isNaN(sonnenuntergang_date.getTime())) {
            node.error("Fehler: msg.end ('" + msg.end + "') konnte nicht in ein gültiges Datum geparst werden (Ergebnis ist NaN).", msg);
            return null;
        }
        if (enableNodeLogging) { node.log("Sonnenuntergang (msg.end String) erfolgreich geparst: " + sonnenuntergang_date.toISOString()); }
    } catch (e) {
        node.error("Fehler beim Parsen von msg.end String ('" + msg.end + "') zu einem Datum: " + e.message, msg);
        return null;
    }
} else {
    // msg.end fehlt oder hat einen ungültigen Typ
    node.error("msg.end fehlt, ist kein String oder kein gültiges Date-Objekt. Empfangener Typ: " + typeof msg.end, msg);
    return null;
}

// 2. Konfiguration aus dem Flow-Kontext
const STANDARD_OFFSET_MIN = -10; // Standard: 10 Minuten *vor* Sonnenuntergang
const offset_var_name = "Schatt_Vor_Nach_Sonnenuntergang_Min"; // Neuer Name für die Flow-Variable
let gelesener_offset_wert = parseFloat(flow.get(offset_var_name));

if (isNaN(gelesener_offset_wert)) {
    node.warn("Flow-Variable '" + offset_var_name + "' nicht gefunden oder ungültig (Wert: " + flow.get(offset_var_name) + "). Verwende Standardwert: " + STANDARD_OFFSET_MIN + " Minuten.");
    gelesener_offset_wert = STANDARD_OFFSET_MIN;
    flow.set(offset_var_name, gelesener_offset_wert);
} else {
    if (enableNodeLogging) { node.log("Flow-Variable '" + offset_var_name + "' aus Flow-Kontext geladen: " + gelesener_offset_wert + " Minuten."); }
    // Optional: flow.set hier, um sicherzustellen, dass der Wert auch gespeichert ist, falls er manuell geändert wurde und um den Typ zu sichern.
    // flow.set(offset_var_name, gelesener_offset_wert);
}

// 3. Verarbeitung
// b. Hole gelesener_offset_wert (ist bereits geschehen)
// c. Erzeuge ein neues Date-Objekt berechnete_schliesszeit_date
let berechnete_schliesszeit_date = new Date(sonnenuntergang_date.getTime());
// Addiere den Offset (der negativ sein kann, um die Zeit vorzuverlegen)
berechnete_schliesszeit_date.setMinutes(sonnenuntergang_date.getMinutes() + gelesener_offset_wert);
if (enableNodeLogging) { node.log("Berechnete Schließzeit (Datumsobjekt) nach Anwendung des Offsets (" + gelesener_offset_wert + " Min.): " + berechnete_schliesszeit_date.toISOString()); }

// d. Formatierung der Zeitangaben (HH:MM)
const tatsaechlicher_sonnenuntergang_hhmm = dateToHHMMString(sonnenuntergang_date);
const berechnete_schliesszeit_hhmm = dateToHHMMString(berechnete_schliesszeit_date);
if (enableNodeLogging) { node.log("Tatsächlicher Sonnenuntergang (HH:MM): " + tatsaechlicher_sonnenuntergang_hhmm); }
if (enableNodeLogging) { node.log("Berechnete Schließzeit (HH:MM): " + berechnete_schliesszeit_hhmm); }

// e. Umwandlung in Timestamps (Millisekunden seit Epoche)
const tatsaechlicher_sonnenuntergang_ts = sonnenuntergang_date.getTime();
const berechnete_schliesszeit_ts = berechnete_schliesszeit_date.getTime();
if (enableNodeLogging) { node.log("Tatsächlicher Sonnenuntergang (Timestamp): " + tatsaechlicher_sonnenuntergang_ts); }
if (enableNodeLogging) { node.log("Berechnete Schließzeit (Timestamp): " + berechnete_schliesszeit_ts); }

// 4. Ausgang (Output)
msg.tatsaechlicher_sonnenuntergang_ts = tatsaechlicher_sonnenuntergang_ts;
msg.tatsaechlicher_sonnenuntergang_hhmm = tatsaechlicher_sonnenuntergang_hhmm;
msg.berechnete_schliesszeit_ts = berechnete_schliesszeit_ts;
msg.berechnete_schliesszeit_hhmm = berechnete_schliesszeit_hhmm;

// Zusätzliche Info für das Logging
msg.schatt_offset_min_verwendet = gelesener_offset_wert; // Speichere den tatsächlich verwendeten Offset-Wert
if (enableNodeLogging) { node.log("Ausgehende msg vorbereitet mit berechneten Zeiten. Verwendeter Offset: " + gelesener_offset_wert + " Min."); }

return msg;
