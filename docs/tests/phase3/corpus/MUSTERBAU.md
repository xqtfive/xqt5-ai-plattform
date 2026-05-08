# Musterbau GmbH — Entitätsmodell-Spezifikation (Frozen Reference v1.0)

Dieses Dokument ist die kanonische Referenz für alle Testkorpus-Fixtures der Musterbau GmbH.
Alle Werte in diesem Dokument gelten als eingefroren. Abweichungen in Fixture-Dateien sind Fehler.

---

## 1. Stammdaten des Unternehmens

| Feld | Wert |
|------|------|
| Firma | Musterbau GmbH |
| Handelsregisternummer | HRB 28471 Dortmund |
| Gründungsjahr | 2003 |
| Sitz | Dortmund, Nordrhein-Westfalen |
| Rechtsform | Gesellschaft mit beschränkter Haftung |
| Geschäftsjahr | 1. Januar – 31. Dezember |
| Umsatz 2025 | 18.450.000 € |
| Mitarbeiterzahl (FTE) | 127 |
| Steuer-ID | DE 287 441 903 |
| Geschäftsführer | Werner Kahlert |
| CFO | Dr. Monika Steinhoff (ab 01.04.2025) |

**Anmerkung CFO-Wechsel:** Dr. Monika Steinhoff trat am 01.04.2025 die Nachfolge von Klaus-Dieter Frommann an, der zum 31.03.2025 in den Ruhestand ging. Dieser Wechsel ist Ereignis E-02 und wird in `geschaeftsbericht_2025.pdf` sowie `memo_strategieklausur.docx` referenziert.

---

## 2. Organisation

### 2.1 Abteilungen

| Kürzel | Name | Leiter / Leiterin | FTE |
|--------|------|-------------------|-----|
| GF | Geschäftsführung | Werner Kahlert (MA-001) | 3 |
| VT | Vertrieb | Sabine Rühle (MA-006) | 22 |
| ENG | Engineering | Tobias Wernecke (MA-011) | 38 |
| PRO | Produktion | Franz-Josef Metzler (MA-016) | 47 |
| VW | Verwaltung | Inga Hollmann (MA-022) | 17 |
| **Gesamt** | | | **127** |

Die fünf Abteilungsleiter sind gleichzeitig die „Schlüsselpersonen", die abteilungsübergreifend in mehreren Fixture-Dateien auftauchen (siehe Abschnitt 4).

---

## 3. Mitarbeiter MA-001 … MA-030

Gehaltsband-Definition:
- **Junior** — Berufseinstieg, 0–3 Jahre Erfahrung
- **Mid** — 3–6 Jahre Erfahrung
- **Senior** — 6–12 Jahre Erfahrung
- **Lead** — Fachliche / disziplinarische Führungsverantwortung

| ID | Name | Abteilung | Rolle | Eintrittsdatum | Band |
|----|------|-----------|-------|----------------|------|
| MA-001 | Werner Kahlert | GF | Geschäftsführer | 15.03.2003 | Lead |
| MA-002 | Dr. Monika Steinhoff | GF | CFO | 01.04.2025 | Lead |
| MA-003 | Petra Jähnig | GF | Assistenz Geschäftsführung | 01.09.2008 | Senior |
| MA-004 | Holger Brandt | VT | Key-Account Manager | 12.01.2015 | Senior |
| MA-005 | Anke Schürmann | VT | Vertriebsinnendienst | 01.06.2018 | Mid |
| MA-006 | Sabine Rühle | VT | Vertriebsleiterin | 01.02.2012 | Lead |
| MA-007 | Dirk Hammerschmidt | VT | Key-Account Manager | 05.03.2014 | Senior |
| MA-008 | Luisa Ferreira | VT | Vertriebsassistenz | 15.09.2021 | Junior |
| MA-009 | Carsten Voigt | VT | Außendienst Süd | 01.07.2019 | Mid |
| MA-010 | Nina Haverkamp | VT | Außendienst West | 01.03.2020 | Mid |
| MA-011 | Tobias Wernecke | ENG | Engineering-Leiter | 01.08.2010 | Lead |
| MA-012 | Sven Unterberg | ENG | Senior-Ingenieur | 15.04.2013 | Senior |
| MA-013 | Claudia Hölscher | ENG | Systementwicklerin | 01.01.2017 | Senior |
| MA-014 | Markus Drescher | ENG | Entwicklungsingenieur | 01.06.2019 | Mid |
| MA-015 | Jonas Steinkamp | ENG | Entwicklungsingenieur | 15.08.2020 | Mid |
| MA-016 | Franz-Josef Metzler | PRO | Produktionsleiter (Meister) | 01.03.2007 | Lead |
| MA-017 | Ursula Grentrup | PRO | Produktionsplanerin | 01.02.2011 | Senior |
| MA-018 | Ahmed Yilmaz | PRO | Maschinenführer | 01.05.2016 | Mid |
| MA-019 | Sandra Kemper | PRO | Qualitätssicherung | 01.09.2014 | Senior |
| MA-020 | Ralf Overbeck | PRO | Lagerhaltung & Logistik | 01.11.2018 | Mid |
| MA-021 | Kathrin Düker | PRO | Montagetechnikerin | 01.04.2022 | Junior |
| MA-022 | Inga Hollmann | VW | Verwaltungsleiterin / HR-Lead | 01.06.2009 | Lead |
| MA-023 | Benedikt Falk | VW | Buchhaltung | 15.10.2015 | Mid |
| MA-024 | Silke Thomsen | VW | Lohnbuchhaltung | 01.03.2017 | Mid |
| MA-025 | Oliver Großmann | VW | IT-Administration | 01.07.2019 | Mid |
| MA-026 | Renate Pfeiffer | VW | Empfang & Office Management | 01.04.2012 | Senior |
| MA-027 | Jan-Philipp Kruse | ENG | Hardwareentwickler | 01.10.2021 | Junior |
| MA-028 | Melanie Fröhlich | ENG | Testingenieurin | 15.02.2022 | Junior |
| MA-029 | Gregor Stenzel | PRO | Instandhaltungstechniker | 01.06.2013 | Senior |
| MA-030 | Dirk Hammerschmidt Jr. | VT | Trainee Vertrieb | 01.09.2024 | Junior |

### 3.1 Schlüsselpersonen (cross-file recurrence)

Die folgenden fünf Personen erscheinen in **mehreren** Fixture-Dateien und müssen stets unter demselben Namen und derselben ID referenziert werden:

| ID | Name | Rolle | Primäre Fixture-Erwähnungen |
|----|------|-------|-----------------------------|
| MA-002 | Dr. Monika Steinhoff | CFO | `geschaeftsbericht_2025.pdf`, `finanzen_2025.xlsx`, `memo_strategieklausur.docx`, `protokoll_qmeeting.txt` |
| MA-011 | Tobias Wernecke | Engineering-Leiter | `techspec_pims.md`, `geschaeftsbericht_2025.pdf`, `protokoll_qmeeting.txt` |
| MA-007 | Dirk Hammerschmidt | Senior Key-Account (verantwortl. für KD-007) | `kunden.csv`, `geschaeftsbericht_2025.pdf`, `memo_strategieklausur.docx` |
| MA-016 | Franz-Josef Metzler | Produktionsleiter / Meister | `geschaeftsbericht_2025.pdf`, `protokoll_qmeeting.txt`, `finanzen_2025.xlsx` |
| MA-022 | Inga Hollmann | Verwaltungsleiterin / HR-Lead | `geschaeftsbericht_2025.pdf`, `memo_strategieklausur.docx`, `finanzen_2025.xlsx` |

---

## 4. Kunden KD-001 … KD-050

### 4.1 Branchencodes

| Code | Bezeichnung |
|------|-------------|
| BAU | Bauwesen |
| MAS | Maschinenbau |
| LOG | Logistik |
| ENE | Energieversorgung |
| ANL | Anlagenbau |
| OEF | Öffentlicher Sektor |

### 4.2 Bundesland-Verteilung (Zielverteilung)

| Bundesland | Kürzel | Anzahl Kunden |
|------------|--------|---------------|
| Nordrhein-Westfalen | NRW | 12 |
| Bayern | BAY | 8 |
| Hamburg | HH | 5 |
| Baden-Württemberg | BW | 5 |
| Niedersachsen | NDS | 5 |
| Sachsen | SAC | 5 |
| Hessen | HES | 5 |
| Berlin | BER | 5 |
| **Gesamt** | | **50** |

### 4.3 Großkunden (Jahresumsatz ≥ 400.000 €)

| ID | Name | Branche | Bundesland | Jahresumsatz 2025 | Key-Account (MA) |
|----|------|---------|------------|-------------------|-----------------|
| KD-007 | Bramkamp Industrietechnik GmbH | ANL | NRW | 742.000 € | MA-007 Dirk Hammerschmidt |
| KD-034 | Rheinische Anlagenbau AG | ANL | NRW | 683.000 € | MA-007 Dirk Hammerschmidt |
| KD-021 | Bayerische Stahlbau GmbH | MAS | BAY | 561.000 € | MA-004 Holger Brandt |
| KD-015 | Stadtwerke Gelsenkirchen AöR | ENE | NRW | 437.000 € | MA-009 Carsten Voigt |

### 4.4 Vollständige Kundenliste

| ID | Name | Branche | Bundesland | Umsatz 2025 (€) |
|----|------|---------|------------|-----------------|
| KD-001 | Heidkamp Bau GmbH | BAU | NRW | 85.000 |
| KD-002 | Nordsee-Logistik KG | LOG | HH | 112.000 |
| KD-003 | Sachsenwerk Präzision GmbH | MAS | SAC | 97.000 |
| KD-004 | Südthüringer Anlagentechnik GmbH | ANL | NDS | 143.000 |
| KD-005 | Maintal Energieservice AG | ENE | HES | 188.000 |
| KD-006 | Berliner Stadtbau GmbH | BAU | BER | 76.000 |
| KD-007 | Bramkamp Industrietechnik GmbH | ANL | NRW | 742.000 |
| KD-008 | Elbe-Transport GmbH | LOG | HH | 134.000 |
| KD-009 | Dresdner Maschinenfabrik OHG | MAS | SAC | 221.000 |
| KD-010 | Münchner Energieversorger AG | ENE | BAY | 198.000 |
| KD-011 | Paderborner Stahlbau GmbH | MAS | NRW | 165.000 |
| KD-012 | Hannoversche Tiefbau AG | BAU | NDS | 109.000 |
| KD-013 | Frankfurter Elektro GmbH | ENE | HES | 92.000 |
| KD-014 | Augsburger Anlagenbau KG | ANL | BAY | 257.000 |
| KD-015 | Stadtwerke Gelsenkirchen AöR | ENE | NRW | 437.000 |
| KD-016 | Leipziger Logistik GmbH | LOG | SAC | 183.000 |
| KD-017 | Hamburgische Bau AG | BAU | HH | 201.000 |
| KD-018 | Stuttgarter Sondermaschinenbau GmbH | MAS | BW | 274.000 |
| KD-019 | Kölner Infrastruktur GmbH | OEF | NRW | 88.000 |
| KD-020 | Bremer Hafenlogistik KG | LOG | NDS | 147.000 |
| KD-021 | Bayerische Stahlbau GmbH | MAS | BAY | 561.000 |
| KD-022 | Nürnberger Anlagentechnik AG | ANL | BAY | 312.000 |
| KD-023 | Münster Gebäudetechnik GmbH | BAU | NRW | 119.000 |
| KD-024 | Dresdner Energiewerke GmbH | ENE | SAC | 203.000 |
| KD-025 | Kiel Offshore Engineering GmbH | ANL | NDS | 389.000 |
| KD-026 | Berliner Maschinenbau GmbH | MAS | BER | 156.000 |
| KD-027 | Freiburger Solartechnik GmbH | ENE | BW | 167.000 |
| KD-028 | Dortmunder Stahlhandel GmbH | MAS | NRW | 94.000 |
| KD-029 | Hamburger Anlagenbau GmbH | ANL | HH | 278.000 |
| KD-030 | Münchner Bauwesen AG | BAU | BAY | 131.000 |
| KD-031 | Kasseler Maschinenbau GmbH | MAS | HES | 174.000 |
| KD-032 | Dresdner Baufirma GmbH | BAU | SAC | 88.000 |
| KD-033 | Wuppertaler Logistik GmbH | LOG | NRW | 122.000 |
| KD-034 | Rheinische Anlagenbau AG | ANL | NRW | 683.000 |
| KD-035 | Berliner Infrastruktur AöR | OEF | BER | 207.000 |
| KD-036 | Heidelberger Maschinenfabrik GmbH | MAS | BW | 243.000 |
| KD-037 | Niedersächsische Energieversorgung AG | ENE | NDS | 319.000 |
| KD-038 | Hamburger Stadtbau GmbH | BAU | HH | 96.000 |
| KD-039 | Regensburger Anlagentechnik OHG | ANL | BAY | 188.000 |
| KD-040 | Düsseldorfer Öffentlicher Bau AöR | OEF | NRW | 141.000 |
| KD-041 | Mannheimer Maschinenbau AG | MAS | BW | 228.000 |
| KD-042 | Potsdamer Infrastruktur GmbH | OEF | BER | 103.000 |
| KD-043 | Erfurter Logistikzentrum GmbH | LOG | NDS | 77.000 |
| KD-044 | Karlsruher Energieversorgung GmbH | ENE | BW | 194.000 |
| KD-045 | Bochumer Stahlwerk GmbH | MAS | NRW | 258.000 |
| KD-046 | Chemnitzer Anlagenbau GmbH | ANL | SAC | 166.000 |
| KD-047 | Berliner Logistik GmbH | LOG | BER | 143.000 |
| KD-048 | Münchner Logistikzentrum KG | LOG | BAY | 209.000 |
| KD-049 | Kölner Maschinenbau AG | MAS | NRW | 177.000 |
| KD-050 | Wiesbadener Energiepartner GmbH | ENE | HES | 138.000 |

**Summe Kundenumsätze 2025:** 10.064.000 € (Resterlöse aus Projektgeschäft, Wartungsverträgen und sonstigen Leistungen: 8.386.000 €; Gesamtumsatz 18.450.000 €)

---

## 5. Produktlinien PIMS-A … PIMS-E

PIMS steht für „Prozessintegriertes Monitoring-System".

| ID | Bezeichnung | Beschreibung | Listenpreis (netto) |
|----|-------------|--------------|---------------------|
| PIMS-A | PIMS-A Basismodul | Kernplattform für Echtzeit-Prozessüberwachung mit 24-Kanal-Datenerfassung und Alarmmanagement; Tiefenspezifikation in `techspec_pims.md`. | 48.900 € |
| PIMS-B | PIMS-B Erweiterungsmodul Analytics | Statistische Auswertungskomponente mit Trendanalyse und Berichtsexport; setzt PIMS-A voraus. | 18.500 € |
| PIMS-C | PIMS-C Feldbus-Integration | Schnittstellen-Adapter für Profibus, Modbus und OPC-UA; setzt PIMS-A voraus. | 12.200 € |
| PIMS-D | PIMS-D Predictive-Maintenance-Modul | KI-gestützte Ausfallprognose auf Basis historischer Sensordaten; setzt PIMS-A und PIMS-B voraus. | 29.700 € |
| PIMS-E | PIMS-E Cloud-Gateway | Sichere MQTT-basierte Anbindung an Cloud-Backends (AWS, Azure, on-premise); setzt PIMS-A voraus. | 9.800 € |

PIMS-A ist das umsatzstärkste Produkt und der alleinige Gegenstand der detaillierten Technikspezifikation in `musterbau/techspec_pims.md`.

---

## 6. Finanzdaten 2025

### 6.1 Bilanz (Stichtag 31.12.2025) — Aktiva = Passiva = 9.050.000 €

**Aktiva**

| Position | Betrag (€) |
|----------|------------|
| Anlagevermögen gesamt | 4.820.000 |
| — Sachanlagen (Maschinen, Gebäude) | 3.950.000 |
| — Immaterielle Vermögenswerte (PIMS-Lizenzen, Software) | 870.000 |
| Umlaufvermögen gesamt | 4.230.000 |
| — Vorräte | 940.000 |
| — Forderungen aus Lieferungen und Leistungen | 2.610.000 |
| — Kassenbestand und Bankguthaben | 680.000 |
| **Bilanzsumme Aktiva** | **9.050.000** |

**Passiva**

| Position | Betrag (€) |
|----------|------------|
| Eigenkapital gesamt | 4.230.000 |
| — Stammkapital | 250.000 |
| — Kapitalrücklage | 1.200.000 |
| — Gewinnrücklagen (Vorjahre) | 1.850.000 |
| — Jahresüberschuss 2025 | 930.000 |
| Fremdkapital gesamt | 4.820.000 |
| — Langfristige Verbindlichkeiten (Bankdarlehen) | 2.900.000 |
| — Kurzfristige Verbindlichkeiten | 1.530.000 |
| — Rückstellungen | 390.000 |
| **Bilanzsumme Passiva** | **9.050.000** |

### 6.2 Gewinn- und Verlustrechnung 2025

| Position | Betrag (€) |
|----------|------------|
| Umsatzerlöse | 18.450.000 |
| Sonstige betriebliche Erträge | 180.000 |
| **Gesamtleistung** | **18.630.000** |
| Materialaufwand | −5.540.000 |
| Personalaufwand | −7.196.000 |
| Abschreibungen | −480.000 |
| Sonstige betriebliche Aufwendungen | −3.864.000 |
| **Betriebsergebnis (EBIT)** | **1.550.000** |
| Zinsen und ähnliche Aufwendungen | −100.000 |
| **Ergebnis vor Steuern (EBT)** | **1.450.000** |
| Ertragsteuern (ca. 40 % des EBT) | −520.000 |
| **Jahresüberschuss** | **930.000** |

*Personalaufwand 7.196.000 € = 39,0 % von 18.450.000 € Umsatz. Steuerquote: 520.000 / 1.450.000 = 35,9 % ≈ 40 %.*

### 6.3 Kapitalflussrechnung 2025 (indirekte Methode)

| Position | Betrag (€) |
|----------|------------|
| Jahresüberschuss | 930.000 |
| + Abschreibungen | 480.000 |
| +/− Veränderung Forderungen | −310.000 |
| +/− Veränderung Vorräte | −140.000 |
| +/− Veränderung kurzfristige Verbindlichkeiten | 90.000 |
| **Cashflow aus laufender Geschäftstätigkeit** | **1.050.000** |
| Investitionen in Sachanlagen | −620.000 |
| Investitionen in immaterielle Vermögenswerte | −130.000 |
| **Cashflow aus Investitionstätigkeit** | **−750.000** |
| Tilgung Bankdarlehen | −280.000 |
| Auszahlung Gewinnentnahmen | −120.000 |
| **Cashflow aus Finanzierungstätigkeit** | **−400.000** |
| **Netto-Cashflow** | **−100.000** |
| Anfangsbestand Zahlungsmittel | 780.000 |
| **Endbestand Zahlungsmittel (31.12.2025)** | **680.000** |

*Endbestand 680.000 € stimmt mit Bilanz-Position „Kassenbestand und Bankguthaben" überein.*

---

## 7. Schlüsselereignisse E-01 … E-08

| ID | Datum | Bezeichnung | Ort | Teilnehmer (MA-IDs) | Ergebnis | Referenz-Fixtures |
|----|-------|-------------|-----|---------------------|----------|-------------------|
| E-01 | 14.01.2025 | Strategieklausur 2025 | Dortmund (Firmensitz) | MA-001, MA-002 (damals noch Frommann), MA-006, MA-011, MA-016, MA-022 | Festlegung Jahresstrategie, Initiierung OBELISK-7-Projekt | `memo_strategieklausur.docx`, `geschaeftsbericht_2025.pdf` |
| E-02 | 01.04.2025 | CFO-Wechsel | Dortmund | MA-001, MA-002 (Dr. Steinhoff), MA-022 | Dr. Monika Steinhoff übernimmt CFO-Funktion; Brandner-Rücklage wird neu bewertet | `geschaeftsbericht_2025.pdf`, `memo_strategieklausur.docx`, `finanzen_2025.xlsx` |
| E-03 | 18.04.2025 | Großauftrag KD-007 | Hamm (Bramkamp-Zentrale) | MA-007, MA-001, MA-011 | Rahmenvertrag PIMS-A + PIMS-D, Wert 742.000 € p.a., Laufzeit 3 Jahre | `geschaeftsbericht_2025.pdf`, `kunden.csv`, `techspec_pims.md` |
| E-04 | 22.05.2025 | Zertifizierungsaudit ISO 9001 | Dortmund | MA-016, MA-019, MA-022 | Rezertifizierung erteilt; Protokoll-Verweis auf Drewermann-Verfahren | `protokoll_qmeeting.txt`, `geschaeftsbericht_2025.pdf` |
| E-05 | 10.07.2025 | Sauerlandstern-Beschluss | Winterberg (Klausurort) | MA-001, MA-002, MA-006, MA-011, MA-022 | Strategische Neuausrichtung PIMS-E, Definition Polymerintegration Typ IV als Pflichtoption | `memo_strategieklausur.docx`, `techspec_pims.md` |
| E-06 | 15.09.2025 | Q3-Review-Meeting | Dortmund (Boardroom) | MA-001, MA-002, MA-006, MA-011, MA-016, MA-022 | Q3-Umsatz 4,92 M €; Quartalsziel übertroffen; Quartalsgespräch referenziert Quartalsadaptionsklausel | `protokoll_qmeeting.txt`, `finanzen_2025.xlsx`, `geschaeftsbericht_2025.pdf` |
| E-07 | 03.11.2025 | Produktionsoptimierungs-Workshop | Dortmund (Werk) | MA-016, MA-017, MA-018, MA-029 | Einführung Retrograder Bestandsabgleich; Kavitationsschutzprotokoll für Linie 3 freigegeben | `protokoll_qmeeting.txt`, `techspec_pims.md` |
| E-08 | 09.12.2025 | Jahresabschlussbesprechung | Dortmund | MA-001, MA-002, MA-022, MA-023 | Feststellung Jahresüberschuss 930.000 €; Gewinnverwendungsvorschlag beschlossen; Flächennutzungsindex NRW-3 als externer Kennwert protokolliert | `finanzen_2025.xlsx`, `geschaeftsbericht_2025.pdf` |

---

## 8. Seltene Fachbegriffe (BM25-Terme)

Die folgende Tabelle ordnet jeden der zehn vordefinierten Seltenbegriffe genau einer Zieldatei zu. BM25 soll diese Terme bevorzugt in der jeweiligen Datei finden; Vektoren finden sie schwächer (semantisch ungebräuchliche Phrasen).

| Term | Zieldatei | Ereignis-Kontext |
|------|-----------|-----------------|
| OBELISK-7 | `geschaeftsbericht_2025.pdf` | E-01: Projektname des PIMS-D-Rollout-Programms |
| Drewermann-Verfahren | `techspec_pims.md` | E-04: Prüfmethode für 24-Kanal-Kalibrierung |
| Kavitationsschutzprotokoll | `techspec_pims.md` | E-07: Schutzmaßnahme für Pumpenkomponenten in PIMS-A |
| Sauerlandstern-Beschluss | `memo_strategieklausur.docx` | E-05: Interner Codename für PIMS-E-Strategiebeschluss |
| Retrograder Bestandsabgleich | `protokoll_qmeeting.txt` | E-07: Rückwärtsgerichtete Lagerkontrolle |
| Brandner-Rücklage | `finanzen_2025.xlsx` | E-02: Bilanz-Rücklage, die beim CFO-Wechsel neu bewertet wurde |
| Polymerintegration Typ IV | `memo_strategieklausur.docx` | E-05: Werkstoffspezifikation für PIMS-E-Gehäuse |
| Fensterprotokoll 24-Kanal | `techspec_pims.md` | PIMS-A: Messprotokoll für 24 parallele Eingangskanäle |
| Quartalsadaptionsklausel | `protokoll_qmeeting.txt` | E-06: Vertragsklausel zur quartalsweisen Preisanpassung |
| Flächennutzungsindex NRW-3 | `finanzen_2025.xlsx` | E-08: Behördlicher Kennwert für Standortbewertung Dortmund |

**Cluster-Regel für Test F (BM25 vs. Vektor):**
Die drei Terme `Drewermann-Verfahren`, `Kavitationsschutzprotokoll` und `Fensterprotokoll 24-Kanal` sind **ausschließlich** in `musterbau/techspec_pims.md` enthalten. Damit ist `techspec_pims.md` das BM25-kanonische Dokument für Test F. Vektorsuche auf semantisch ähnliche Phrasen soll diese Datei nicht bevorzugt zurückgeben, weil die Terme keine semantische Entsprechung in allgemeinen Trainingskorpora haben.

---

## 9. Fixture-Vertragstabelle

Diese Tabelle zeigt, welche Musterbau-Fakten in welcher Datei zu finden sind. Sie dient als Orakel für Retrieval-Tests.

| Fixture-Datei | Format | Primäre Inhalte | Schlüsselpersonen | Schlüssel-Ereignisse | BM25-Terme |
|---------------|--------|-----------------|-------------------|----------------------|------------|
| `musterbau/geschaeftsbericht_2025.pdf` | PDF (mehrere Seiten) | Unternehmensprofil, Umsatz, Mitarbeiterzahl, Abteilungsstruktur, Jahresüberschuss, Strategiehöhepunkte | MA-001 Kahlert, MA-002 Steinhoff, MA-006 Rühle, MA-011 Wernecke, MA-016 Metzler, MA-022 Hollmann | E-01, E-02, E-03, E-04, E-06, E-08 | OBELISK-7 |
| `musterbau/finanzen_2025.xlsx` | XLSX (3 Sheets) | Sheet 1: Bilanz (Aktiva/Passiva); Sheet 2: GuV; Sheet 3: Kapitalflussrechnung | MA-002 Steinhoff, MA-016 Metzler, MA-022 Hollmann, MA-023 Falk | E-02, E-06, E-08 | Brandner-Rücklage, Flächennutzungsindex NRW-3 |
| `musterbau/kunden.csv` | CSV (50 Zeilen + Header) | KD-001…KD-050 vollständig: Name, Branche, Bundesland, Umsatz, Key-Account-MA | MA-007 Hammerschmidt (KD-007, KD-034), MA-004 Brandt (KD-021), MA-009 Voigt (KD-015) | E-03 | — |
| `musterbau/memo_strategieklausur.docx` | DOCX (mit Tabelle) | Strategieklausur-Ergebnisse, CFO-Wechsel-Kommuniqué, Sauerlandstern-Beschluss, Polymerintegration | MA-001, MA-002, MA-006, MA-022 | E-01, E-02, E-05 | Sauerlandstern-Beschluss, Polymerintegration Typ IV |
| `musterbau/techspec_pims.md` | Markdown (Heading-Hierarchie) | PIMS-A Tiefenspezifikation: Architektur, 24-Kanal-Erfassung, Kalibrierverfahren, Kavitationsschutz, Fensterprotokoll | MA-011 Wernecke, MA-012 Unterberg, MA-013 Hölscher | E-03, E-05, E-07 | Drewermann-Verfahren, Kavitationsschutzprotokoll, Fensterprotokoll 24-Kanal |
| `musterbau/protokoll_qmeeting.txt` | TXT (Plain Text) | Q3-Meeting-Protokoll, Produktions-Workshop-Protokoll, ISO-Audit-Nachbesprechung | MA-002 Steinhoff, MA-011 Wernecke, MA-016 Metzler | E-04, E-06, E-07 | Retrograder Bestandsabgleich, Quartalsadaptionsklausel |

---

## 10. Konsistenzprüfungen (Checksummen)

| Prüfgröße | Erwarteter Wert | Herleitung |
|-----------|-----------------|------------|
| Summe FTE | 127 | 3 + 22 + 38 + 47 + 17 |
| Bilanzsumme Aktiva | 9.050.000 € | 4.820.000 + 4.230.000 |
| Bilanzsumme Passiva | 9.050.000 € | 4.230.000 + 4.820.000 |
| Jahresüberschuss | 930.000 € | EBT 1.450.000 − Steuern 520.000 |
| Endbestand Cashflow | 680.000 € | 780.000 + (−100.000) |
| Eigenkapital nach JÜ | 4.230.000 € | 250.000 + 1.200.000 + 1.850.000 + 930.000 |
| Personalaufwand / Umsatz | 39,0 % | 7.196.000 / 18.450.000 |
| Steuerquote (EBT-Basis) | 35,9 % | 520.000 / 1.450.000 |
| Großkunden-Summe | 2.423.000 € | 742k + 683k + 561k + 437k |
| Anzahl Kunden | 50 | KD-001 … KD-050 |
| Anzahl Mitarbeiter-IDs | 30 | MA-001 … MA-030 |
| Anzahl BM25-Terme | 10 | Tabelle Abschnitt 8 |
| Anzahl Ereignisse | 8 | E-01 … E-08 |

---

## 11. Tradeoffs und Designentscheidungen

Die folgenden Entscheidungen sind bewusst getroffen und nicht als Fehler zu werten:

**NRW-gewichtete Bundeslandverteilung:** Mit 12 von 50 Kunden (24 %) ist NRW überproportional vertreten. Dies spiegelt den realen Unternehmenssitz in Dortmund wider und erzeugt eine sinnvolle geographische Konzentration für Retrieval-Tests, die auf Bundesland-Filterung basieren.

**Personalaufwand 39 % des Umsatzes:** Für ein mittelständisches Unternehmen im Maschinen- und Anlagenbausegment liegt der branchenübliche Personalaufwand zwischen 30 % und 45 %. 39 % ist plausibel und erleichtert das Rückrechnen der GuV ohne ganzzahlige Rundungsfehler.

**Steuerquote ~40 % des EBT (effektiv 35,9 %):** Die Zielangabe „ca. 40 %" wurde als Näherungswert verstanden. Der exakt ausgerechnete Wert beträgt 35,9 % (KSt 15 % + Soli + GewSt), was für deutsche GmbH realistisch ist. Die Differenz zur 40 %-Zielangabe ist transparent ausgewiesen.

**Schlüsselpersonen-Auswahl:** Die fünf cross-file-Personen wurden nach fachlicher Repräsentativität ausgewählt (Finanzen, Engineering, Vertrieb-Großkunde, Produktion, HR). Alle fünf haben plausible Lebensläufe (Eintrittsdatum vor ihrer heutigen Führungsrolle).

**BM25-Cluster-Design:** Die Konzentration von drei BM25-Termen in `techspec_pims.md` ist absichtlich, um Test F (BM25 schlägt Vektor bei Fachbegriffen) klar zu isolieren. Kein anderes Fixture enthält diese drei Terme, um Interferenz zu vermeiden.

---

*Dokumentversion: 1.0 — Eingefroren am 2026-05-08. Änderungen erfordern explizite Freigabe und müssen in allen referenzierten Fixture-Dateien nachgezogen werden.*
