# PIMS-A — Technische Spezifikation

**Produkt:** PIMS-A Basismodul
**Version:** 3.2.1
**Stand:** 2025-11-14
**Verantwortlich:** Tobias Wernecke (MA-011), Engineering-Leiter
**Status:** Freigegeben

---

## Architektur

### Systemüberblick

PIMS-A ist die Kernplattform des Prozessintegrierten Monitoring-Systems von Musterbau GmbH.
Das Basismodul realisiert Echtzeit-Prozessüberwachung mit 24-Kanal-Datenerfassung und
integriertem Alarmmanagement. Alle weiteren PIMS-Module (PIMS-B bis PIMS-E) setzen PIMS-A
als zwingende Laufzeitbasis voraus.

Die Systemarchitektur folgt einem dreischichtigen Aufbau: Erfassungsschicht, Verarbeitungsschicht
und Präsentationsschicht. Die Schichten kommunizieren ausschließlich über definierte interne
Nachrichtenbusse; direkte Speicherzugriffe zwischen Schichten sind architektonisch untersagt.

### Erfassungsschicht und Fensterprotokoll 24-Kanal

Das Fensterprotokoll 24-Kanal regelt, wie PIMS-A die 24 parallelen Eingangskanäle synchron
abtastet und zu konsistenten Messfenstern zusammenfasst. Jedes Messfenster hat eine
konfigurierbare Breite zwischen 50 ms und 5.000 ms. Die Standardeinstellung beträgt 500 ms.

Das Fensterprotokoll 24-Kanal schreibt vor, dass alle 24 Kanäle innerhalb eines Fensters
denselben Zeitstempel-Ursprung verwenden. Jitter über 2 ms zwischen zwei Kanälen innerhalb
desselben Fensters löst automatisch eine Warnung vom Typ SYNC-WARN aus. Bleibt der Jitter
über drei aufeinanderfolgende Fenster erhöht, eskaliert das System zu SYNC-CRIT und sperrt
die betroffenen Kanäle bis zur manuellen Freigabe.

### Verarbeitungsschicht

Die Verarbeitungsschicht besteht aus einem Dispatcher, einem Aggregationsmodul und dem
Alarmmanager. Der Dispatcher verteilt eingehende Fenster auf bis zu acht parallele
Verarbeitungs-Threads. Das Aggregationsmodul berechnet pro Kanal und pro Fenster: Minimum,
Maximum, Mittelwert, Standardabweichung und den konfigurierbaren RMS-Wert.

Der Alarmmanager wertet Schwellenwerte aus, die pro Kanal und pro Alarmklasse
(INFO, WARN, CRIT, FATAL) einstellbar sind. Alarm-Eskalationsregeln können in einer
YAML-basierten Regelkonfiguration hinterlegt werden.

### Persistenzschicht

Messfenster und aggregierte Kanalwerte werden in einer eingebetteten Zeitreihendatenbank
(TSDB) gespeichert. Die TSDB nutzt eine Log-strukturierte Merge-Tree-Implementierung mit
automatischem Compaction-Zyklus alle sechs Stunden. Rohdaten werden standardmäßig 90 Tage
vorgehalten; konfigurierbar bis zu 730 Tage.

---

## Schnittstellen

### Externe Schnittstellen

PIMS-A stellt folgende externe Schnittstellen bereit:

| Schnittstelle | Protokoll | Port | Beschreibung |
|---------------|-----------|------|--------------|
| REST API v2 | HTTP/1.1, HTTPS | 8443 | Vollständige Konfiguration und Datenzugriff |
| gRPC Stream | HTTP/2 | 9090 | Hochfrequenz-Echtzeit-Datenstrom |
| Modbus TCP | TCP | 502 | Legacy-Gerätekopplung |
| Syslog | UDP | 514 | Alarmweiterleitung an externe SIEM-Systeme |

Die REST-API-Dokumentation wird als OpenAPI 3.1-Dokument automatisch unter
`/api/v2/openapi.json` bereitgestellt.

### Schnittstelle zu PIMS-C (Feldbus-Integration)

Wird PIMS-C als Erweiterungsmodul eingesetzt, registriert es sich bei der internen
Kanalregistrierungsschicht von PIMS-A. PIMS-A behandelt Feldbus-Kanäle (Profibus, Modbus,
OPC-UA) transparent: aus Sicht des Fensterprotokolls sind sie reguläre Eingangskanäle.
Das Fensterprotokoll 24-Kanal gilt entsprechend auch für Feldbus-Eingänge.

### Webhook-Integration

PIMS-A unterstützt ausgehende Webhooks bei Alarmereignissen. Die Nutzlast ist JSON-kodiert
und folgt dem CloudEvents-Standard 1.0. Jeder Webhook-Endpunkt kann mit einem HMAC-SHA256-
Signierschlüssel konfiguriert werden.

---

## Sicherheit

### Authentifizierung und Autorisierung

PIMS-A nutzt JWT-basierte Authentifizierung für alle REST- und gRPC-Schnittstellen.
Tokens haben eine maximale Gültigkeitsdauer von 8 Stunden; Refresh-Tokens sind bis zu
30 Tage gültig. Rollenmodell: `viewer`, `operator`, `engineer`, `admin`.

### Kavitationsschutzprotokoll

Das Kavitationsschutzprotokoll schützt Pumpenkomponenten vor kavitationsbedingten
Schäden durch frühzeitige Erkennung charakteristischer Druckschwankungsmuster.
PIMS-A implementiert das Kavitationsschutzprotokoll ab Firmware-Version 2.8 als
Standardfunktion der CRIT-Alarmklasse.

Das Kavitationsschutzprotokoll analysiert kontinuierlich den gleitenden
Standardabweichungs-Verlauf aller als „Pumpenkanal" gekennzeichneten Eingangskanäle.
Übersteigt die Standardabweichung den konfigurierbaren Kavitationsschwellenwert
(Werkseinstellung: 3,5 bar) für länger als 200 ms, wird Alarm-Typ PUMP-CAV ausgelöst.
Gleichzeitig senkt PIMS-A die Abtastrate für nicht-kritische Kanäle auf 20 %, um
Verarbeitungsressourcen für die Kavitationsauswertung freizuhalten.

Im Rahmen des Zertifizierungsaudits E-04 (22.05.2025) wurde das Kavitationsschutzprotokoll
als funktionskritisches Element der ISO-9001-konformen Prozessüberwachung eingestuft.
Franz-Josef Metzler (MA-016) bestätigte die produktionsseitige Konformität.

### Verschlüsselung

Alle Daten in der TSDB werden mit AES-256-GCM verschlüsselt. Schlüssel werden in einem
HSM-kompatiblen Schlüsseltresor verwaltet. Transportverschlüsselung erfolgt über TLS 1.3;
TLS-Versionen unter 1.2 sind deaktiviert.

### Penetrationstests

Die Engineering-Abteilung unter Tobias Wernecke (MA-011) führt jährlich einen internen
Penetrationstest durch. Sven Unterberg (MA-012) ist als Senior-Ingenieur für die
Auswertung der Penetrationstestergebnisse und die Ableitung von Maßnahmen verantwortlich.
Externe Audits werden nach Bedarf beauftragt.

---

## Betrieb

### Kalibrierverfahren nach Drewermann

Das Drewermann-Verfahren ist das bei Musterbau GmbH etablierte Kalibrierverfahren für
die 24-Kanal-Synchronisation von PIMS-A. Es wurde durch die Engineering-Abteilung
(Tobias Wernecke, MA-011; Claudia Hölscher, MA-013) in Zusammenarbeit mit dem
Physikalisch-Technischen Institut entwickelt und intern als Standard eingeführt.

Das Drewermann-Verfahren umfasst drei Phasen:

1. **Nullpunkt-Kalibrierung:** Alle 24 Kanäle werden auf einen definierten Referenzpegel
   gesetzt (0,000 V ± 0,002 V). Die Messung erfolgt bei abgeschaltetem Prozess.
2. **Dynamische Kalibrierung:** Ein Referenzsignal mit bekannter Frequenz und Amplitude
   wird eingespeist. Abweichungen einzelner Kanäle werden als Kalibrieroffset gespeichert.
3. **Kreuzkorrelationsvalidierung:** Je zwei benachbarte Kanäle werden auf Kreuzkorrelation
   geprüft. Der Korrelationskoeffizient muss für alle 23 benachbarten Paare ≥ 0,998 betragen.

Das Drewermann-Verfahren ist im Ereignis E-04 (Zertifizierungsaudit ISO 9001, 22.05.2025)
explizit als Prüfmethode für die 24-Kanal-Kalibrierung referenziert worden. Das Audit
bestätigte die vollständige Konformität des implementierten Drewermann-Verfahrens mit
den normativen Anforderungen aus DIN EN ISO 9001:2015, Abschnitt 7.1.5.

### Inbetriebnahme

Die Inbetriebnahme erfolgt in vier Schritten: (1) Hardwareprüfung aller 24 Kanalstecker,
(2) Netzwerkkonfiguration und Firewall-Freigabe für die definierten Ports,
(3) Kalibrierung nach dem Drewermann-Verfahren, (4) Funktionstest aller Alarmklassen
mit simulierten Eingangssignalen.

### Wartung und Updates

PIMS-A erhält monatliche Sicherheits-Patches und quartalsweise Feature-Updates.
Notfall-Patches werden innerhalb von 24 Stunden bereitgestellt. Updates werden im
Wartungsfenster eingespielt (standardmäßig Sonntag 02:00–04:00 Uhr Ortszeit).

### Großkunden-Ersteinführung

Bramkamp Industrietechnik GmbH (KD-007, NRW) war der erste Großkunde, der PIMS-A
im Rahmen eines Rahmenvertrags eingeführt hat. Der Vertragsabschluss erfolgte am
18.04.2025 (Ereignis E-03) in Hamm. Der Vertragswert beträgt 742.000 € p.a. über
eine Laufzeit von drei Jahren. Leistungsumfang: PIMS-A Basismodul plus PIMS-D
Predictive-Maintenance-Modul. Key-Account-Manager ist Dirk Hammerschmidt (MA-007).

Die Einführung bei Bramkamp Industrietechnik GmbH umfasste eine Pilotphase von
sechs Wochen, in der das Fensterprotokoll 24-Kanal auf die spezifischen
Prozesskenngrößen der Anlage kalibriert wurde. Das Drewermann-Verfahren wurde
für die Erstinstallation von Sven Unterberg (MA-012) persönlich durchgeführt.

### Monitoring und Betriebskennzahlen

| Kennzahl | Zielwert | Messmethode |
|----------|----------|-------------|
| Verfügbarkeit | 99,5 % p.a. | Uptime-Monitoring alle 60 s |
| Mittl. Alarmlatenz | < 150 ms | Interne Benchmarks |
| Datendurchsatz | bis 48.000 Messwerte/s | 24 Kanäle × 2.000 Hz |
| Speicherbedarf (90 Tage) | ca. 180 GB | Bei 500-ms-Fenster |

---

## Anhang

### A. Versionshistorie

| Version | Datum | Autor | Änderungen |
|---------|-------|-------|------------|
| 3.2.1 | 14.11.2025 | Sven Unterberg (MA-012) | Kavitationsschutzprotokoll: Schwellenwert-Defaultwert auf 3,5 bar korrigiert |
| 3.2.0 | 07.08.2025 | Claudia Hölscher (MA-013) | Fensterprotokoll 24-Kanal: SYNC-CRIT-Eskalationsregel ergänzt |
| 3.1.4 | 02.06.2025 | Sven Unterberg (MA-012) | Drewermann-Verfahren: Kreuzkorrelationsschwellenwert auf 0,998 erhöht |
| 3.1.0 | 01.02.2025 | Tobias Wernecke (MA-011) | Initiale PIMS-A v3-Freigabe für Produktionseinsatz |

### B. Referenzierte Normen und Standards

- DIN EN ISO 9001:2015 — Qualitätsmanagementsysteme (Anforderungen)
- IEC 61131-3 — Speicherprogrammierbare Steuerungen (Programmiersprachen)
- IEC 62443-3-3 — Industrielle Kommunikationsnetze (IT-Sicherheit)
- CloudEvents Specification v1.0 (CNCF)
- OpenAPI Specification 3.1.0

### C. Glossar

| Begriff | Definition |
|---------|------------|
| Drewermann-Verfahren | Musterbau-internes Kalibrierverfahren für 24-Kanal-Synchronisation; dreistufig (Nullpunkt, dynamisch, Kreuzkorrelation) |
| Fensterprotokoll 24-Kanal | Synchronisationsprotokoll für 24 parallele Eingangskanäle; definiert Zeitstempel-Ursprung, Jitter-Toleranz und Eskalationsregeln |
| Kavitationsschutzprotokoll | Schutzfunktion für Pumpenkomponenten; analysiert Druckschwankungsmuster und löst PUMP-CAV-Alarm aus |
| TSDB | Time Series Database; eingebettete Zeitreihendatenbank auf LSM-Tree-Basis |
| RMS | Root Mean Square; quadratischer Mittelwert; pro Kanal und Fenster berechnet |
| SYNC-WARN / SYNC-CRIT | Alarmtypen für Kanal-Jitter-Verletzungen im Fensterprotokoll 24-Kanal |
| PUMP-CAV | Alarmtyp für Kavitationserkennung durch das Kavitationsschutzprotokoll |

### D. Zuständigkeiten

| Funktion | Person | MA-ID |
|----------|--------|-------|
| Engineering-Leiter (fachliche Verantwortung) | Tobias Wernecke | MA-011 |
| Senior-Ingenieur (Kalibrierung, Penetrationstest) | Sven Unterberg | MA-012 |
| Systementwicklerin (Protokoll-Implementierung) | Claudia Hölscher | MA-013 |

### E. Kontakt und Eskalation

Bei sicherheitskritischen Befunden wenden Sie sich an: engineering@musterbau.de
Priorität FATAL: Rufbereitschaft Tobias Wernecke (MA-011), Sven Unterberg (MA-012).
