// Node-RED Funktionsknoten zur Berechnung einer Schließzeit basierend auf Sonnenuntergang und Offset.
// Eingang: msg (von suncalc), erwartet msg.end als ISO-Datumsstring.
// Ausgang: msg, ergänzt um berechnete Zeitstempel und HH:MM Strings.
// Verwendet Flow-Kontext für "Schatt_Sonnenuntergang_Offset_Min".

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

// 1. Eingang (Input) Validierung
if (!msg.end || typeof msg.end !== 'string') {
    node.error("msg.end fehlt oder ist kein gültiger String.", msg);
    return null;
}

let sonnenuntergang_date;
try {
    sonnenuntergang_date = new Date(msg.end);
    if (isNaN(sonnenuntergang_date.getTime())) {
        throw new Error("Ungültiges Datumsformat in msg.end");
    }
} catch (e) {
    node.error("Fehler beim Parsen von msg.end ('" + msg.end + "') zu einem Datum: " + e.message, msg);
    return null;
}
node.log("Sonnenuntergang (msg.end) erfolgreich geparst: " + sonnenuntergang_date.toISOString());

// 2. Konfiguration aus dem Flow-Kontext
const STANDARD_OFFSET_MIN = 10;
const offset_var_name = "Schatt_Sonnenuntergang_Offset_Min"; // Für den Fall, dass msg.index hier auch relevant wird, kann es einfach ergänzt werden.
let offset_minuten = parseFloat(flow.get(offset_var_name));

if (isNaN(offset_minuten) || offset_minuten < 0) {
    node.warn("Flow-Variable '" + offset_var_name + "' nicht gefunden, ungültig (" + offset_minuten + ") oder negativ. Verwende Standardwert: " + STANDARD_OFFSET_MIN + " Minuten.");
    offset_minuten = STANDARD_OFFSET_MIN;
    flow.set(offset_var_name, offset_minuten);
} else {
    node.log("Flow-Variable '" + offset_var_name + "' aus Flow-Kontext geladen: " + offset_minuten + " Minuten.");
    // Optional: flow.set hier, um sicherzustellen, dass der Wert auch gespeichert ist, falls er manuell geändert wurde.
    // flow.set(offset_var_name, offset_minuten);
}

// 3. Verarbeitung
// b. Hole offset_minuten (ist bereits geschehen)
// c. Erzeuge ein neues Date-Objekt berechnete_schliesszeit_date
let berechnete_schliesszeit_date = new Date(sonnenuntergang_date.getTime());
berechnete_schliesszeit_date.setMinutes(sonnenuntergang_date.getMinutes() - offset_minuten);
node.log("Berechnete Schließzeit (Datumsobjekt): " + berechnete_schliesszeit_date.toISOString());

// d. Formatierung der Zeitangaben (HH:MM)
const tatsaechlicher_sonnenuntergang_hhmm = dateToHHMMString(sonnenuntergang_date);
const berechnete_schliesszeit_hhmm = dateToHHMMString(berechnete_schliesszeit_date);
node.log("Tatsächlicher Sonnenuntergang (HH:MM): " + tatsaechlicher_sonnenuntergang_hhmm);
node.log("Berechnete Schließzeit (HH:MM): " + berechnete_schliesszeit_hhmm);

// e. Umwandlung in Timestamps (Millisekunden seit Epoche)
const tatsaechlicher_sonnenuntergang_ts = sonnenuntergang_date.getTime();
const berechnete_schliesszeit_ts = berechnete_schliesszeit_date.getTime();
node.log("Tatsächlicher Sonnenuntergang (Timestamp): " + tatsaechlicher_sonnenuntergang_ts);
node.log("Berechnete Schließzeit (Timestamp): " + berechnete_schliesszeit_ts);

// 4. Ausgang (Output)
msg.tatsaechlicher_sonnenuntergang_ts = tatsaechlicher_sonnenuntergang_ts;
msg.tatsaechlicher_sonnenuntergang_hhmm = tatsaechlicher_sonnenuntergang_hhmm;
msg.berechnete_schliesszeit_ts = berechnete_schliesszeit_ts;
msg.berechnete_schliesszeit_hhmm = berechnete_schliesszeit_hhmm;

// Zusätzliche Info für das Logging
msg.schatt_offset_min_verwendet = offset_minuten;
node.log("Ausgehende msg vorbereitet mit berechneten Zeiten. Verwendeter Offset: " + offset_minuten + " Min.");

return msg;
