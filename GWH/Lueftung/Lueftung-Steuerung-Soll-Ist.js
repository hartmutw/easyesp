// Node-RED Funktionsknoten zur Steuerung einer Lüftungsklappe
// basierend auf Temperaturdifferenz und Mindestlaufzeit des Motors.
// Konfigurationsparameter werden aus dem Flow-Kontext gelesen oder dort mit Standardwerten initialisiert.
// msg.index wird als Präfix für die Flow-Variablennamen verwendet.

// msg.index für dynamische Flow-Variablennamen verwenden
const index_prefix = msg.index;
if (typeof index_prefix !== 'string' || index_prefix.length === 0) {
    node.error("msg.index (Präfix für Flow-Variablen) fehlt oder ist ungültig.", msg);
    return null;
}

// Einlesen der Eingangswerte aus msg
let setpoint_temp = parseFloat(msg.setpoint_temp); // Soll-Temperatur
let current_temp = parseFloat(msg.current_temp); // Ist-Temperatur

// Validierung der kritischen Eingangswerte: setpoint_temp und current_temp
if (isNaN(setpoint_temp)) {
    node.error("Ungültige oder fehlende Soll-Temperatur (msg.setpoint_temp).", msg);
    return null; // Stoppt den Flow für diese Nachricht
}
if (isNaN(current_temp)) {
    node.error("Ungültige oder fehlende Ist-Temperatur (msg.current_temp).", msg);
    return null; // Stoppt den Flow für diese Nachricht
}

// Definition der Standardwerte für Konfigurationsparameter
const STANDARD_P_BAND_WIDTH = 2.0;
const STANDARD_MIN_RUNTIME_SEC = 2.0;
const STANDARD_MAX_RUNTIME_SEC = 30.0;

// Proportionalbandbreite in Grad Celsius
let p_band_width_flow = parseFloat(flow.get(index_prefix + "P_BAND_WIDTH"));
if (isNaN(p_band_width_flow)) {
    p_band_width_flow = STANDARD_P_BAND_WIDTH;
    flow.set(index_prefix + "P_BAND_WIDTH", p_band_width_flow);
    node.warn("Flow-Variable '" + index_prefix + "P_BAND_WIDTH' nicht gefunden/ungültig. Standardwert (" + p_band_width_flow + ") wurde im Flow-Kontext gesetzt.");
}
let aktive_p_band_width = p_band_width_flow;

// Mindestlaufzeit des Motors in Sekunden
let min_runtime_sec_flow = parseFloat(flow.get(index_prefix + "MIN_RUNTIME_SEC"));
if (isNaN(min_runtime_sec_flow)) {
    min_runtime_sec_flow = STANDARD_MIN_RUNTIME_SEC;
    flow.set(index_prefix + "MIN_RUNTIME_SEC", min_runtime_sec_flow);
    node.warn("Flow-Variable '" + index_prefix + "MIN_RUNTIME_SEC' nicht gefunden/ungültig. Standardwert (" + min_runtime_sec_flow + ") wurde im Flow-Kontext gesetzt.");
}
let aktive_min_runtime_sec = min_runtime_sec_flow;

// Maximale Laufzeit des Motors für den vollen Weg (0-100%) in Sekunden
let max_runtime_sec_flow = parseFloat(flow.get(index_prefix + "MAX_RUNTIME_SEC"));
if (isNaN(max_runtime_sec_flow)) {
    max_runtime_sec_flow = STANDARD_MAX_RUNTIME_SEC;
    flow.set(index_prefix + "MAX_RUNTIME_SEC", max_runtime_sec_flow);
    node.warn("Flow-Variable '" + index_prefix + "MAX_RUNTIME_SEC' nicht gefunden/ungültig. Standardwert (" + max_runtime_sec_flow + ") wurde im Flow-Kontext gesetzt.");
}
let aktive_max_runtime_sec = max_runtime_sec_flow;


// Einlesen der vorherigen Soll-Position aus dem Geräte-Kontext (context.get)
let vorherige_soll_position = context.get("vorherige_soll_position");

// Berechnung der idealen Soll-Position (0-100%)
let ideale_soll_position;
if (current_temp <= setpoint_temp) {
    ideale_soll_position = 0;
} else {
    // Sicherstellen, dass aktive_p_band_width nicht null ist, um Division durch Null zu vermeiden
    if (aktive_p_band_width === 0) {
        node.warn("Aktive P_BAND_WIDTH ist 0, was zu einer Division durch Null führen würde. Ideale Position wird nicht aggressiv berechnet.");
        ideale_soll_position = 100;
    } else {
        ideale_soll_position = ((current_temp - setpoint_temp) / aktive_p_band_width) * 100;
    }
}

// Begrenzung der idealen Soll-Position auf den Bereich 0-100%
ideale_soll_position = Math.max(0, Math.min(100, ideale_soll_position));

// Berechnung der minimalen Positionsänderung in Prozent
let min_positions_aenderung_prozent;
if (aktive_max_runtime_sec === 0) {
    node.warn("Flow-Variable '" + index_prefix + "MAX_RUNTIME_SEC' ist 0, was zu einer Division durch Null führen würde. Setze min_positions_aenderung_prozent auf 0.");
    min_positions_aenderung_prozent = 0;
} else {
    min_positions_aenderung_prozent = (aktive_min_runtime_sec / aktive_max_runtime_sec) * 100;
}

// Bestimmung der aktuellen Soll-Position unter Berücksichtigung der Mindeständerung
let aktuelle_soll_position;

if (ideale_soll_position === 0 || ideale_soll_position === 100) {
    aktuelle_soll_position = ideale_soll_position;
} else if (vorherige_soll_position === undefined) {
    aktuelle_soll_position = ideale_soll_position;
    node.log("Erster Durchlauf oder vorherige_soll_position nicht definiert, setze Position auf: " + aktuelle_soll_position.toFixed(2) + "%");
} else if (Math.abs(ideale_soll_position - vorherige_soll_position) < min_positions_aenderung_prozent) {
    aktuelle_soll_position = vorherige_soll_position;
    node.log("Änderung (" + Math.abs(ideale_soll_position - vorherige_soll_position).toFixed(2) +
             "%) ist kleiner als min_positions_aenderung_prozent (" + min_positions_aenderung_prozent.toFixed(2) +
             "%). Behalte vorherige Position: " + aktuelle_soll_position.toFixed(2) + "%");
} else {
    aktuelle_soll_position = ideale_soll_position;
}

context.set("vorherige_soll_position", aktuelle_soll_position);
msg.payload = aktuelle_soll_position;
msg.aktuelle_soll_position = aktuelle_soll_position; // User added this line
return msg;
