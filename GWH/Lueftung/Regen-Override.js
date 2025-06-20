// Node-RED Funktionsknoten zur Anpassung des Lüftungs-Sollwerts bei Regen.
// Eingang: msg.payload (Sollwert %) oder msg.regen (0/1)
// Ausgang: msg.payload (angepasster Sollwert %)
// Verwendet Flow-Kontext für "Oeffnung_bei_Regen_Prozent" (mit msg.index als Präfix)
// Verwendet Knoten-Kontext für "letzter_bekannter_sollwert_prozent" und "aktueller_regen_status"

const enableNodeLogging = true; // Schalter für node.log Ausgaben

// msg.index für dynamische Flow-Variablennamen verwenden
const index_prefix = msg.index;
if (typeof index_prefix !== 'string' || index_prefix.length === 0) {
    node.error("msg.index (Präfix für Flow-Variablen) fehlt oder ist ungültig.", msg);
    return null;
}

// 1. Konfiguration aus dem Flow-Kontext
const STANDARD_OEFFNUNG_BEI_REGEN = 10.0;
let config_oeffnung_bei_regen_var_name = index_prefix + "Oeffnung_bei_Regen_Prozent";
let config_oeffnung_bei_regen = parseFloat(flow.get(config_oeffnung_bei_regen_var_name));

if (isNaN(config_oeffnung_bei_regen) || config_oeffnung_bei_regen <= 0 || config_oeffnung_bei_regen > 100) {
    node.warn("Flow-Variable '" + config_oeffnung_bei_regen_var_name + "' nicht gefunden, ungültig (" + config_oeffnung_bei_regen + ") oder außerhalb des Bereichs (0-100]. Verwende Standardwert: " + STANDARD_OEFFNUNG_BEI_REGEN + "%.");
    config_oeffnung_bei_regen = STANDARD_OEFFNUNG_BEI_REGEN;
    flow.set(config_oeffnung_bei_regen_var_name, config_oeffnung_bei_regen);
} else {
    // Sicherstellen, dass der gelesene Wert auch im Flow-Kontext steht (falls er z.B. manuell geändert, aber nicht gespeichert wurde)
    // Dies ist optional, aber stellt Konsistenz sicher.
    // flow.set(config_oeffnung_bei_regen_var_name, config_oeffnung_bei_regen);
    if (enableNodeLogging) { node.log("Flow-Variable '" + config_oeffnung_bei_regen_var_name + "' aus Flow-Kontext geladen: " + config_oeffnung_bei_regen + "%"); }
}
// Der aktive Wert, der im Skript verwendet wird.
let aktive_oeffnung_bei_regen = config_oeffnung_bei_regen;


// 2. Interner Zustand (Knoten-Kontext)
let letzter_bekannter_sollwert_prozent = context.get("letzter_bekannter_sollwert_prozent");
if (letzter_bekannter_sollwert_prozent === undefined) {
    letzter_bekannter_sollwert_prozent = 0; // Standardwert beim allerersten Start
    context.set("letzter_bekannter_sollwert_prozent", letzter_bekannter_sollwert_prozent);
    if (enableNodeLogging) { node.log("Initialisiere 'letzter_bekannter_sollwert_prozent' im Kontext mit: " + letzter_bekannter_sollwert_prozent + "%"); }
}

let aktueller_regen_status = context.get("aktueller_regen_status");
if (aktueller_regen_status === undefined) {
    aktueller_regen_status = 0; // Standard: Kein Regen
    context.set("aktueller_regen_status", aktueller_regen_status);
    if (enableNodeLogging) { node.log("Initialisiere 'aktueller_regen_status' im Kontext mit: " + aktueller_regen_status); }
}

// 3. Eingangsverarbeitung und Logik
let werte_aktualisiert = false;

// Verarbeitung von msg.payload (Sollwert-Prozent)
if (msg.payload !== undefined && msg.payload !== null) {
    let neuer_sollwert = parseFloat(msg.payload);
    if (!isNaN(neuer_sollwert) && neuer_sollwert >= 0 && neuer_sollwert <= 100) {
        if (neuer_sollwert !== letzter_bekannter_sollwert_prozent) {
            letzter_bekannter_sollwert_prozent = neuer_sollwert;
            context.set("letzter_bekannter_sollwert_prozent", letzter_bekannter_sollwert_prozent);
            werte_aktualisiert = true;
            if (enableNodeLogging) { node.log("Neuer Sollwert empfangen und im Kontext gespeichert: " + letzter_bekannter_sollwert_prozent + "%"); }
        }
    } else {
        node.warn("Ungültiger msg.payload (Sollwert) empfangen: " + msg.payload + ". Muss eine Zahl zwischen 0 und 100 sein. Wird ignoriert.");
    }
}

// Verarbeitung von msg.regen (Regenstatus)
if (msg.regen !== undefined && msg.regen !== null) {
    let neuer_regen_status = parseInt(msg.regen, 10); // Sicherstellen, dass es eine Ganzzahl ist
    if (neuer_regen_status === 0 || neuer_regen_status === 1) {
        if (neuer_regen_status !== aktueller_regen_status) {
            aktueller_regen_status = neuer_regen_status;
            context.set("aktueller_regen_status", aktueller_regen_status);
            werte_aktualisiert = true;
            if (enableNodeLogging) { node.log("Neuer Regenstatus empfangen und im Kontext gespeichert: " + (aktueller_regen_status === 1 ? "REGEN" : "KEIN REGEN")); }
        }
    } else {
        node.warn("Ungültiger msg.regen (Regenstatus) empfangen: " + msg.regen + ". Muss 0 oder 1 sein. Wird ignoriert.");
    }
}

// Immer Output berechnen und senden, um bei Deploy oder Änderungen im Kontext/Flow-Kontext zu reagieren
// Hole die aktuellsten Werte aus dem Kontext (könnten gerade aktualisiert worden sein)
let aktiver_letzter_sollwert = context.get("letzter_bekannter_sollwert_prozent");
let aktiver_regen_status = context.get("aktueller_regen_status");

// Erneutes Lesen und Validieren des Flow-Kontext-Wertes für den Fall, dass er extern geändert wurde
// oder beim ersten Setzen etwas schiefging.
// Die Variable config_oeffnung_bei_regen_var_name wurde bereits oben definiert.
let flow_oeffnung_bei_regen_aktuell = parseFloat(flow.get(config_oeffnung_bei_regen_var_name));
if (isNaN(flow_oeffnung_bei_regen_aktuell) || flow_oeffnung_bei_regen_aktuell <= 0 || flow_oeffnung_bei_regen_aktuell > 100) {
    // Dies sollte idealerweise nicht passieren, wenn die Logik oben korrekt funktioniert,
    // aber als zusätzliche Sicherheitsmaßnahme.
    node.warn("Flow-Variable '" + config_oeffnung_bei_regen_var_name + "' im Flow-Kontext ist unerwartet ungültig (" + flow_oeffnung_bei_regen_aktuell + "). Verwende erneut Standardwert: " + STANDARD_OEFFNUNG_BEI_REGEN + "%.");
    aktive_oeffnung_bei_regen = STANDARD_OEFFNUNG_BEI_REGEN;
    flow.set(config_oeffnung_bei_regen_var_name, aktive_oeffnung_bei_regen); // Korrektur im Flow Kontext
} else {
    aktive_oeffnung_bei_regen = flow_oeffnung_bei_regen_aktuell;
}


let output_prozent;
if (aktiver_regen_status === 1) {
    // Bei Regen: Nimm den kleineren Wert von Sollwert und Regen-Öffnungswert
    output_prozent = Math.min(aktiver_letzter_sollwert, aktive_oeffnung_bei_regen);
    if (enableNodeLogging) { node.log("Regen aktiv. Sollwert (" + aktiver_letzter_sollwert + "%) wird durch Oeffnung_bei_Regen (" + aktive_oeffnung_bei_regen + "%) auf " + output_prozent + "% begrenzt."); }
} else {
    // Kein Regen: Verwende den normalen Sollwert
    output_prozent = aktiver_letzter_sollwert;
    if (enableNodeLogging) { node.log("Kein Regen aktiv. Sollwert ist " + output_prozent + "%."); }
}

msg.payload = output_prozent;
return msg;
