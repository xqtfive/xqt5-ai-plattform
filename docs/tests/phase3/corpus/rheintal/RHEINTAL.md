# Kunstakademie Rheintal e. V. — Entitätsmodell-Spezifikation (Frozen Reference v1.0)

Dieses Dokument ist die kanonische Referenz für alle Testkorpus-Fixtures der Kunstakademie Rheintal e. V.
Alle Werte in diesem Dokument gelten als eingefroren. Abweichungen in Fixture-Dateien sind Fehler.

---

## 1. Stammdaten der Organisation

| Feld | Wert |
|------|------|
| Organisation | Kunstakademie Rheintal e. V. |
| Vereinsregisternummer | VR 4312 Freiburg im Breisgau |
| Gründungsjahr | 1997 |
| Sitz | Freiburg im Breisgau, Baden-Württemberg |
| Rechtsform Träger | Eingetragener Verein (e. V.) |
| 100%-Tochter | Rheintal Akademie gemeinnützige GmbH |
| gGmbH Stammkapital | 25.000 € |
| Steuerlicher Status | Gemeinnützig nach §52 AO, steuerbefreit |
| Geschäftsjahr | 1. Januar – 31. Dezember |
| Jahresbudget 2025 | 1.240.000 € (Einnahmen = Ausgaben; kein Jahresüberschuss) |
| Vereinsvorsitzende | Renate Quast (PER-001) |
| Geschäftsführerin gGmbH | Dr. Margit Feuerbach (PER-002, seit 01.09.2008) |

**Anmerkung Rechtsstruktur:** Der e. V. ist der gemeinnützige Träger und Mitgliederverein (318 ordentliche Mitglieder). Die operative Kursabwicklung, Vertragsabschlüsse mit Honorarkräften und öffentlich-rechtliche Zuwendungen werden über die 100-prozentige Tochter Rheintal Akademie gemeinnützige GmbH abgewickelt. Dr. Feuerbach führt die gGmbH und berichtet an den Vorstand des e. V.

---

## 2. Standorte und Infrastruktur

### 2.1 Standortübersicht

| Kürzel | Bezeichnung | Adresse | Hauptnutzung |
|--------|-------------|---------|--------------|
| GER | Hauptgebäude Gerberau | Gerberau 12, 79098 Freiburg im Breisgau | Atelier (Malerei, Grafik), Keramikatelier, Druckwerkstatt, Ausstellungssaal (Kapazität 150 Personen) |
| WIE | Außenatelier Wiehre | Günterstalstraße 47, 79100 Freiburg im Breisgau | Fotografie, Digitale Medien, Dunkelkammer |
| STT | Kooperationsraum Stadttheater | Bertoldstraße 46, 79098 Freiburg im Breisgau | Musik-Workshops, Konzerte (Nutzung nach Vereinbarung mit Stadttheater Freiburg) |

### 2.2 Betriebskennzahlen 2025

| Kennzahl | Wert |
|----------|------|
| Ordentliche Vereinsmitglieder | 318 |
| Festangestellte | 21 (PER-001 … PER-021) |
| Aktive Honorar-Kursleiter | 34 (KL-01 … KL-34) |
| Kurse im Programm 2025 | 87 (KU-001 … KU-087) |
| Öffentliche Ausstellungen 2025 | 6 |
| Kursteilnehmer (gesamt 2025, ca.) | 1.200 |

---

## 3. Festangestellte PER-001 … PER-021

| ID | Name | Funktion | Beschäftigt seit |
|----|------|----------|-----------------|
| PER-001 | Renate Quast | Vereinsvorsitzende, Vorstand e. V. | 01.03.1997 |
| PER-002 | Dr. Margit Feuerbach | Geschäftsführerin gGmbH | 01.09.2008 |
| PER-003 | Lukas Endres | Programmdirektor | 15.04.2012 |
| PER-004 | Hanna Birkenfeld | Kursverwaltung | 01.02.2015 |
| PER-005 | Tobias Schipper | Finanzbuchhaltung | 01.07.2013 |
| PER-006 | Elisa Marwede | Öffentlichkeitsarbeit | 01.09.2019 |
| PER-007 | Gundula Heth | Atelierleitung Gerberau | 01.01.2011 |
| PER-008 | Nils Krechting | Technischer Betrieb | 15.06.2016 |
| PER-009 | Franziska Oppelt | Ausstellungskoordination | 01.03.2020 |
| PER-010 | Marc Zielonka | IT / Buchungssystem | 01.10.2021 |
| PER-011 | Urte Hamann | Förderanträge / Drittmittel | 01.05.2018 |
| PER-012 | Benedikt Voss | Keramikatelier-Assistent | 15.09.2022 |
| PER-013 | Selin Arslan | Kursassistenz Fotografie | 01.04.2023 |
| PER-014 | Petra Kolb | Rezeption | 01.11.2014 |
| PER-015 | Jonas Reiff | Social Media | 01.06.2024 |
| PER-016 | Christine Bartels | Programm Musik-Workshops | 01.02.2017 |
| PER-017 | Wolfgang Haug | Hausmeister Gerberau | 01.01.2010 |
| PER-018 | Leonie Staufenberg | Praktikantin Verwaltung | 01.03.2025 |
| PER-019 | Ahmed Mansour | Lager / Materialeinkauf | 15.08.2019 |
| PER-020 | Dagmar Vogler | Buchhaltungsassistenz | 01.10.2016 |
| PER-021 | Rainer Theis | Projektkoordinator Außenatelier | 01.07.2020 |

### 3.1 Schlüsselpersonen (cross-file recurrence)

Die folgenden fünf Personen erscheinen in mindestens vier Fixture-Dateien und müssen stets unter demselben Namen und derselben ID referenziert werden:

| ID | Name | Funktion | Primäre Fixture-Erwähnungen |
|----|------|----------|-----------------------------|
| PER-002 | Dr. Margit Feuerbach | Geschäftsführerin gGmbH | `taetigkeitsbericht_2025.pdf`, `honorarvertrag_gruber.docx`, `haushaltsplan_2025.xlsx`, `protokoll_jhv_2025.txt`, `akademieprogramm_t3.md` |
| PER-003 | Lukas Endres | Programmdirektor | `taetigkeitsbericht_2025.pdf`, `akademieprogramm_t3.md`, `protokoll_jhv_2025.txt` |
| KL-01 | Prof. Anita Gruber | Honorar-Kursleiterin Druckgrafik | `honorarvertrag_gruber.docx`, `taetigkeitsbericht_2025.pdf`, `akademieprogramm_t3.md`, `protokoll_jhv_2025.txt`, `kursleiter.csv` |
| PER-011 | Urte Hamann | Förderanträge / Drittmittel | `taetigkeitsbericht_2025.pdf`, `haushaltsplan_2025.xlsx`, `protokoll_jhv_2025.txt` |
| PER-009 | Franziska Oppelt | Ausstellungskoordination | `taetigkeitsbericht_2025.pdf`, `akademieprogramm_t3.md`, `protokoll_jhv_2025.txt` |

---

## 4. Honorar-Kursleiter KL-01 … KL-34

Honorarsätze liegen zwischen 60 € und 95 € pro Unterrichtsstunde. Die Spalte „Kurse 2025" gibt die Anzahl aktiver Kurse im laufenden Programmjahr an.

| ID | Name | Fachbereich | Honorar/Std. (€) | Kurse 2025 |
|----|------|-------------|-----------------|------------|
| KL-01 | Prof. Anita Gruber | Druckgrafik | 85 | 4 |
| KL-02 | Berthold Schantz | Ölmalerei | 75 | 3 |
| KL-03 | Ingeborg Zellner | Aquarell | 70 | 3 |
| KL-04 | Pavlos Demetriou | Fotografie | 80 | 3 |
| KL-05 | Susanne Wältermann | Skulptur | 90 | 2 |
| KL-06 | Florian Neugebauer | Digitale Medien | 80 | 3 |
| KL-07 | Marta Szymańska | Mixed Media | 65 | 3 |
| KL-08 | Roland Kleiber | Ölmalerei | 75 | 2 |
| KL-09 | Yuki Tanigawa | Aquarell | 60 | 2 |
| KL-10 | Dominic Faure | Kunstgeschichte | 70 | 2 |
| KL-11 | Claudia Rennert | Aktzeichnen | 65 | 2 |
| KL-12 | Sebastian Borck | Druckgrafik | 80 | 2 |
| KL-13 | Margarete Füsslin | Keramik | 70 | 3 |
| KL-14 | Hanno Winkelmann | Musikproduktion | 85 | 2 |
| KL-15 | Antje Steudel | Skulptur | 90 | 2 |
| KL-16 | Georgios Papadimitriou | Fotografie | 75 | 2 |
| KL-17 | Nina Schwarzbach | Mixed Media | 65 | 2 |
| KL-18 | Tanja Urbach | Ölmalerei | 70 | 2 |
| KL-19 | Dieter Fleckenstein | Aktzeichnen | 60 | 2 |
| KL-20 | Maria Kovács | Aquarell | 65 | 2 |
| KL-21 | Andreas Langwald | Kunstgeschichte | 70 | 2 |
| KL-22 | Veronika Söllner | Keramik | 75 | 2 |
| KL-23 | Raphael Drouet | Druckgrafik | 80 | 2 |
| KL-24 | Brigitte Unterweger | Mixed Media | 65 | 2 |
| KL-25 | Thomas Hirtreiter | Digitale Medien | 80 | 2 |
| KL-26 | Leila Moussavi | Musikproduktion | 85 | 2 |
| KL-27 | Jan Overwien | Skulptur | 90 | 1 |
| KL-28 | Silvia Pfanner | Ölmalerei | 70 | 1 |
| KL-29 | Konrad Autenrieth | Aquarell | 60 | 1 |
| KL-30 | Fatima Boussouf | Fotografie | 75 | 1 |
| KL-31 | Erika Lindström | Kunstgeschichte | 70 | 1 |
| KL-32 | Cyril Magnin | Aktzeichnen | 65 | 1 |
| KL-33 | Özlem Demir | Keramik | 70 | 1 |
| KL-34 | Patrick Sauerwein | Digitale Medien | 75 | 1 |

**Kursleiter mit cross-file-Auftritt (mind. 2 Fixtures):** KL-01 Prof. Anita Gruber (5 Fixtures), KL-03 Ingeborg Zellner (2 Fixtures), KL-04 Pavlos Demetriou (2 Fixtures), KL-05 Susanne Wältermann (2 Fixtures), KL-06 Florian Neugebauer (2 Fixtures), KL-08 Roland Kleiber (2 Fixtures).

---

## 5. Kurskatalog KU-001 … KU-087

Der Kurskatalog ist in drei Trimester gegliedert (T1: Feb–Apr, T2: Mai–Aug, T3: Sep–Dez). Die vollständige Kursliste wird in `akademieprogramm_t3.md` als dreigliedrige Überschriftenhierarchie ausgearbeitet. Nachfolgend die Strukturvorgabe sowie repräsentative Kursbeispiele.

### 5.1 Fachbereichsverteilung 2025

| Fachbereich | Kürzel | Anzahl Kurse | Standort |
|-------------|--------|--------------|---------|
| Druckgrafik | DRU | 8 | GER |
| Ölmalerei | OEL | 10 | GER |
| Aquarell | AQU | 9 | GER |
| Keramik | KER | 8 | GER |
| Skulptur | SKU | 6 | GER |
| Fotografie | FOT | 9 | WIE |
| Digitale Medien | DIG | 8 | WIE |
| Musikproduktion | MUS | 7 | STT |
| Kunstgeschichte | KGE | 6 | GER |
| Aktzeichnen | AKT | 8 | GER |
| Mixed Media | MIX | 8 | GER / WIE |
| **Gesamt** | | **87** | |

### 5.2 Ausgewählte Kurse (Trimester 3 — Fixture-Relevanz)

| ID | Titel | Fachbereich | Kursleiter | Teilnehmer max. | Trimester |
|----|-------|-------------|------------|-----------------|-----------|
| KU-001 | Radierung für Einsteiger | DRU | KL-01 Prof. Gruber | 12 | T1, T2, T3 |
| KU-002 | Hochdruck — Holzschnitt und Linolschnitt | DRU | KL-01 Prof. Gruber | 10 | T1, T3 |
| KU-003 | Experimentelle Druckgrafik (Residenz-Kurs) | DRU | KL-01 Prof. Gruber | 8 | T2, T3 |
| KU-015 | Aquarell Grundkurs | AQU | KL-03 Zellner | 14 | T1, T2, T3 |
| KU-022 | Porträtfotografie | FOT | KL-04 Demetriou | 10 | T1, T3 |
| KU-031 | Aktfotografie und Bildkomposition | FOT | KL-04 Demetriou | 8 | T2 |
| KU-038 | Stoneware und Raku-Brennen | KER | KL-13 Füsslin | 10 | T1, T2, T3 |
| KU-045 | Figürliche Skulptur | SKU | KL-05 Wältermann | 8 | T1, T3 |
| KU-060 | After-Effects für Kunstschaffende | DIG | KL-06 Neugebauer | 12 | T2, T3 |
| KU-072 | Ölmalerei Intensiv (Wochenend-Format) | OEL | KL-08 Kleiber | 10 | T2, T3 |
| KU-078 | Klanginstallation und Field Recording | MUS | KL-14 Winkelmann | 8 | T3 (neu ab Sep 2025) |

KU-078 wurde in EV-07 genehmigt und erscheint erstmals im T3-Programm.

---

## 6. Finanzdaten 2025

### 6.1 Einnahmen

| Position | Betrag (€) | Anteil (%) |
|----------|------------|------------|
| Kursgebühren | 644.800 | 52,0 |
| Mitgliedsbeiträge | 99.200 | 8,0 |
| Öffentliche Fördergelder (Land BW + Stadt Freiburg) | 384.400 | 31,0 |
| Stiftungsmittel projektgebunden | 111.600 | 9,0 |
| **Summe Einnahmen** | **1.240.000** | **100,0** |

### 6.2 Ausgaben

| Position | Betrag (€) | Anteil (%) |
|----------|------------|------------|
| Personalaufwand Festangestellte | 682.000 | 55,0 |
| Honorare Kursleiter | 198.400 | 16,0 |
| Raum / Betrieb (Miete, Nebenkosten, Instandhaltung) | 198.400 | 16,0 |
| Programm / Material (Werkstoffe, Ausstellungskosten) | 99.200 | 8,0 |
| Verwaltung / Öffentlichkeitsarbeit | 62.000 | 5,0 |
| **Summe Ausgaben** | **1.240.000** | **100,0** |

**Jahresergebnis: 0 € (gemeinnützig; kein Jahresüberschuss).**

### 6.3 Förderübersicht 2025

| Geldgeber | Art | Betrag (€) | Verwendungszweck | Nachweis-Frist |
|-----------|-----|------------|-----------------|----------------|
| Land Baden-Württemberg | Institutionelle Förderung | 228.000 | Laufender Betrieb, Personalkosten | 31.01.2026 |
| Stadt Freiburg im Breisgau | Projektförderung Kulturprogramm | 156.400 | Ausstellungen, Bildungsprojekte | 28.02.2026 |
| Stiftung Kunstförderung Oberrhein | Projektgebundene Mittel | 68.000 | Druckgrafik-Residenz (EV-01 / EV-07) | 30.06.2026 |
| Deutsche Kulturstiftung Süd | Projektgebundene Mittel | 43.600 | Fotografie-Reihe Außenatelier | 30.09.2026 |
| **Summe Förderung** | | **496.000** | | |

*Fördermittel gesamt 496.000 € = 384.400 € öffentlich + 111.600 € Stiftungen.*

### 6.4 gGmbH-Kennzahlen

| Kennzahl | Wert |
|----------|------|
| Stammkapital gGmbH | 25.000 € |
| Stammkapital e. V. | kein Stammkapital (Vereinsrecht) |
| Jahresergebnis gGmbH 2025 | 0 € (Gemeinnützigkeit erfordert zeitnahe Mittelverwendung) |
| Rücklage gemäß Satzungsklausel-7 | gebildet in EV-10; Betrag zweckgebunden für Investitionsvorbereitung 2026 |

---

## 7. Vereinsmitglieder MT-001 … MT-318

Der Namensraum MT-001 bis MT-318 ist für die 318 ordentlichen Vereinsmitglieder reserviert. Die vollständige Mitgliederliste wird für die Testkorpus-Fixtures nicht einzeln ausgewiesen (kein Fixture adressiert individuelle Mitglieder unterhalb der Vorstandsebene). Für Retrieval-Tests gilt: MT-IDs kommen ausschließlich in der Jahreshauptversammlung (EV-08) als kollektiver Akteur vor; `protokoll_jhv_2025.txt` vermerkt „318 Mitglieder anwesend oder vertreten".

---

## 8. Schlüsselereignisse EV-01 … EV-10

| ID | Datum | Bezeichnung | Ort | Teilnehmer | Ergebnis | Referenz-Fixtures |
|----|-------|-------------|-----|------------|----------|-------------------|
| EV-01 | 15.01.2025 | Jahresauftaktklausur Vorstand | Gerberau (GER) | PER-001, PER-002, PER-003, PER-011 | Beschluss Druckgrafik-Residenz; Jahresprogramm 2025 verabschiedet | `taetigkeitsbericht_2025.pdf`, `protokoll_jhv_2025.txt` |
| EV-02 | 14.02.2025 | Unterzeichnung Honorarrahmenvertrag Prof. Gruber | Geschäftsstelle GER | PER-002, KL-01 | Atelierüberlassung-Klausel §4 unterzeichnet; Honorarsatz 85 €/Std. fixiert | `honorarvertrag_gruber.docx`, `kursleiter.csv` |
| EV-03 | 03.03.2025 | Eröffnung Frühjahrsausstellung „Form und Farbe" | Gerberau-Saal (GER) | PER-001, PER-009, KL-01, KL-08, 112 Gäste | Werkförderverfahren-Nachweis eingereicht; Ausstellung läuft bis 30.04.2025 | `taetigkeitsbericht_2025.pdf`, `akademieprogramm_t3.md` |
| EV-04 | 28.04.2025 | Trimester-1-Abschlussevaluation | Geschäftsstelle GER | PER-002, PER-003, PER-004 | T1-Auslastung 91 %; Kursgruppenrotationsverfahren eingeleitet | `protokoll_jhv_2025.txt`, `haushaltsplan_2025.xlsx` |
| EV-05 | 09.06.2025 | Fördermittelbescheid Land BW 2025 | Bescheid per Post (adressiert an PER-011) | PER-011, PER-002 | Zuwendung 228.000 €; Verwendungsnachweis-Frist 31.01.2026 | `taetigkeitsbericht_2025.pdf`, `haushaltsplan_2025.xlsx`, `kursbelegung_legacy.xls` |
| EV-06 | 17.07.2025 | Sommeratelier-Workshopwoche | Alle Standorte | KL-01, KL-03, KL-05, KL-06, ca. 60 TN | 6 Intensivworkshops durchgeführt; Auslastungsrekord Außenatelier Wiehre | `akademieprogramm_t3.md`, `kursleiter.csv` |
| EV-07 | 12.09.2025 | Trimester-3-Kickoff und Programmvorstellung | Gerberau (GER) | PER-002, PER-003, PER-016, alle KL | Neukurs KU-078 genehmigt; Residenzstipendium für KL-01 verlängert | `akademieprogramm_t3.md`, `protokoll_jhv_2025.txt` |
| EV-08 | 22.10.2025 | Jahreshauptversammlung e. V. | Gerberau-Saal (GER) | PER-001, 318 Mitglieder (MT-001…MT-318), PER-002 | Jahresabschluss 2024 genehmigt; Beitragsordnungsbeschluss 2026 gefasst | `taetigkeitsbericht_2025.pdf`, `protokoll_jhv_2025.txt` |
| EV-09 | 05.11.2025 | Ausstellungseröffnung „Lichtwege" | Gerberau-Saal (GER) | PER-009, KL-04, KL-07, 89 Gäste | Erstmals Atelierausleihe-Protokoll für externe Künstlerin angelegt | `akademieprogramm_t3.md`, `protokoll_jhv_2025.txt` |
| EV-10 | 10.12.2025 | Jahresabschlussgespräch Finanzen | Geschäftsstelle GER | PER-002, PER-005, PER-011 | Jahresergebnis 0 € bestätigt; Rücklage per Satzungsklausel-7 gebildet | `haushaltsplan_2025.xlsx`, `kursbelegung_legacy.xls`, `protokoll_jhv_2025.txt` |

---

## 9. Seltene Fachbegriffe (BM25-Terme)

Die folgende Tabelle ordnet jeden der zehn vordefinierten Seltenbegriffe genau einer Zieldatei zu. BM25 soll diese Terme bevorzugt in der jeweiligen Datei finden; Vektoren finden sie schwächer (semantisch ungebräuchliche Phrasen).

| Term | Zieldatei | Ereignis-Kontext | Dateiformat |
|------|-----------|-----------------|-------------|
| Werkförderverfahren | `taetigkeitsbericht_2025.pdf` | EV-03: Nachweis-Einreichung Frühjahrsausstellung | PDF |
| Residenzstipendium | `akademieprogramm_t3.md` | EV-07: Verlängerung für KL-01 im T3-Kickoff | MD |
| Atelierüberlassung | `honorarvertrag_gruber.docx` | EV-02: §4 des Honorarrahmenvertrags KL-01 | DOCX |
| Kursgruppenrotationsverfahren | `protokoll_jhv_2025.txt` | EV-04: Einleitung nach T1-Auslastungsanalyse | TXT |
| Satzungsklausel-7 | `haushaltsplan_2025.xlsx` | EV-10: Rücklagen-Bildung Jahresabschluss | XLSX |
| Atelierausleihe-Protokoll | `akademieprogramm_t3.md` | EV-09: Erstmalige Protokollanlage externe Künstlerin | MD |
| Beitragsordnungsbeschluss | `protokoll_jhv_2025.txt` | EV-08: Beschluss JHV zur Beitragsordnung 2026 | TXT |
| Druckgrafik-Residenz | `taetigkeitsbericht_2025.pdf` | EV-01: Vorstandsbeschluss Jahresauftaktklausur | PDF |
| Trimesterauslastungsindex | `kursbelegung_legacy.xls` | Altdaten 2018–2022 (ausschließlich Legacy-Export) | XLS |
| Verwendungsnachweis-Frist | `haushaltsplan_2025.xlsx` | EV-05: Förderbescheid Land BW, Frist 31.01.2026 | XLSX |

**Term-Datei-Verteilung:** PDF 2, DOCX 1, XLSX 2, XLS 1, MD 2, TXT 2, CSV 0.

**Cluster-Regel für Test F (BM25 vs. Vektor):**
Die Terme `Werkförderverfahren` und `Druckgrafik-Residenz` sind ausschließlich in `taetigkeitsbericht_2025.pdf` enthalten. Die Terme `Residenzstipendium` und `Atelierausleihe-Protokoll` sind ausschließlich in `akademieprogramm_t3.md` enthalten. Die Terme `Satzungsklausel-7` und `Verwendungsnachweis-Frist` sind ausschließlich in `haushaltsplan_2025.xlsx` enthalten. Die Terme `Kursgruppenrotationsverfahren` und `Beitragsordnungsbeschluss` sind ausschließlich in `protokoll_jhv_2025.txt` enthalten. `Atelierüberlassung` ist ausschließlich in `honorarvertrag_gruber.docx` enthalten. `Trimesterauslastungsindex` ist ausschließlich in `kursbelegung_legacy.xls` enthalten. Kein Term erscheint in `kursleiter.csv`. Dies erzeugt vier Dateien mit je zwei exklusiven Termen (statt Musterbaus Muster einer einzelnen techspec-Datei mit drei Termen) — ein bewusster Design-Unterschied (siehe Abschnitt 11).

---

## 10. Fixture-Vertragstabelle

Diese Tabelle zeigt, welche Rheintal-Fakten in welcher Datei zu finden sind. Sie dient als Orakel für Retrieval-Tests. Alle Dateien liegen unter `corpus/rheintal/`.

| Fixture-Datei | Format | Primäre Inhalte | Schlüsselpersonen | Schlüsselereignisse | BM25-Terme |
|---------------|--------|-----------------|-------------------|---------------------|------------|
| `taetigkeitsbericht_2025.pdf` | PDF (4 Seiten) | Vereinsprofil, Jahresbudget 2025, Mitgliederzahlen, Ausstellungsübersicht, Fördermittelnachweis, Strategiehöhepunkte | PER-001 Quast, PER-002 Feuerbach, PER-003 Endres, PER-009 Oppelt, PER-011 Hamann, KL-01 Gruber | EV-01, EV-03, EV-05, EV-08 | Werkförderverfahren, Druckgrafik-Residenz |
| `honorarvertrag_gruber.docx` | DOCX (§1–§6 + Unterschriftenblock + Anhang Lehrplan) | Honorarrahmenvertrag mit KL-01; §1 Vertragsparteien, §2 Laufzeit, §3 Honorar 85 €/Std., §4 Atelierüberlassung (Klausel), §5 Urheberrecht, §6 Kündigung; Anhang: Lehrplan Druckgrafik-Kurse | PER-002 Feuerbach, KL-01 Prof. Gruber | EV-02 | Atelierüberlassung |
| `haushaltsplan_2025.xlsx` | XLSX (3 Sheets: Einnahmen-Ausgaben, Förderübersicht, Honorarübersicht) | Sheet 1: Einnahmen 1.240.000 €, Ausgaben 1.240.000 €, Jahresergebnis 0 €, Rücklage Satzungsklausel-7; Sheet 2: Fördergeber, Beträge, Verwendungsnachweis-Fristen; Sheet 3: KL-01…KL-34 Honoraransätze | PER-002 Feuerbach, PER-005 Schipper, PER-011 Hamann | EV-04, EV-05, EV-10 | Satzungsklausel-7, Verwendungsnachweis-Frist |
| `kursbelegung_legacy.xls` | XLS (unformatierter Altsystem-Export 2018–2022; Datumsformat TT.MM.JJ) | Flat-Export Kursbelegungsdaten 2018–2022: Kurs-ID (Altnummerierung), Teilnehmerzahl, Belegungsdatum, Kursleiter-Kürzel, Auslastungsquote; enthält Trimesterauslastungsindex als Spaltenkopf | keine PER/KL-IDs (Altsystem nutzt Kürzel) | — (historische Daten vor EV-Zeitraum) | Trimesterauslastungsindex |
| `kursleiter.csv` | CSV (34 Datenzeilen + Header; 7 Spalten) | KL-01…KL-34 vollständig: ID, Name, Fachbereich, Honorar/Std., Kurse 2025, Standort, Vertragsbeginn | KL-01 Gruber, KL-03 Zellner, KL-04 Demetriou, KL-05 Wältermann, KL-06 Neugebauer, KL-08 Kleiber | EV-02, EV-06 | — |
| `akademieprogramm_t3.md` | Markdown (3-stufige Überschriftenhierarchie: Fachbereich → Trimester → Kurs) | T3-Kurskatalog mit KU-IDs, Beschreibungen, Kursleiter-Verweisen; Residenzstipendium-Ankündigung KL-01; Ausstellungsprogramm inkl. „Lichtwege"; Atelierausleihe-Protokoll Ersterwähnung | PER-002 Feuerbach, PER-003 Endres, PER-009 Oppelt, KL-01 Gruber, KL-03 Zellner, KL-04 Demetriou, KL-06 Neugebauer | EV-03, EV-06, EV-07, EV-09 | Residenzstipendium, Atelierausleihe-Protokoll |
| `protokoll_jhv_2025.txt` | TXT (Plain Text; kombinierte Sitzungsprotokolle in einer Datei) | Protokoll EV-04 (T1-Evaluation, Kursgruppenrotationsverfahren); Protokoll EV-07 (T3-Kickoff, KU-078-Genehmigung); Protokoll EV-08 (JHV, 318 Mitglieder, Beitragsordnungsbeschluss); Protokoll EV-10 (Jahresabschluss, Satzungsklausel-7 Verweis) | PER-001 Quast, PER-002 Feuerbach, PER-003 Endres, PER-004 Birkenfeld, PER-009 Oppelt, PER-011 Hamann, PER-016 Bartels, KL-01 Gruber | EV-04, EV-07, EV-08, EV-10 | Kursgruppenrotationsverfahren, Beitragsordnungsbeschluss |

**Hinweis zu `protokoll_jhv_2025.txt`:** Die Datei bündelt vier Protokolle in einem Plaintext-Dokument, da der e. V. eine einfache Ablagestruktur nutzt. Dies erzeugt absichtlich eine mehrdeutige Abfrage-Situation für Retrieval-Tests: Eine Suchanfrage nach „Jahreshauptversammlung" und eine nach „Kursgruppenrotation" landen beide in derselben Datei, obwohl sie verschiedene Ereignisse betreffen. Dieses Muster ist der Gegenpol zur Musterbau-Fixture-Struktur, in der jede TXT-Datei ein einzelnes Meeting abdeckt.

---

## 11. Konsistenzprüfungen (Checksummen)

| Prüfgröße | Erwarteter Wert | Herleitung |
|-----------|-----------------|------------|
| Summe Einnahmen | 1.240.000 € | 644.800 + 99.200 + 384.400 + 111.600 |
| Summe Ausgaben | 1.240.000 € | 682.000 + 198.400 + 198.400 + 99.200 + 62.000 |
| Jahresergebnis | 0 € | Einnahmen − Ausgaben (gemeinnützig) |
| Öffentliche Förderung gesamt | 496.000 € | 384.400 + 111.600 |
| Anteil öffentliche Förderung + Stiftungen | 40,0 % | 496.000 / 1.240.000 |
| Anteil Kursgebühren | 52,0 % | 644.800 / 1.240.000 |
| Personalaufwand-Anteil | 55,0 % | 682.000 / 1.240.000 |
| Honorar-Anteil | 16,0 % | 198.400 / 1.240.000 |
| Fördersumme Land BW | 228.000 € | Förderbescheid EV-05; Nachweis-Frist 31.01.2026 |
| Festangestellte | 21 | PER-001 … PER-021 |
| Honorar-Kursleiter | 34 | KL-01 … KL-34 |
| Anzahl Kurse | 87 | KU-001 … KU-087 |
| Mitglieder (Namensraum) | 318 | MT-001 … MT-318 |
| Anzahl Ereignisse | 10 | EV-01 … EV-10 |
| Anzahl BM25-Terme | 10 | Tabelle Abschnitt 9 |
| Anzahl Fixtures | 7 | Tabelle Abschnitt 10 |
| gGmbH Stammkapital | 25.000 € | Frozen design value |
| Schlüsselpersonen mit ≥ 4 Fixture-Auftritten | 5 | PER-002, PER-003, KL-01, PER-011, PER-009 |

---

## 12. Designentscheidungen und Trade-offs

**Budget auf 0 € balanciert (gemeinnützig):** Im Gegensatz zur Musterbau GmbH, die einen Jahresüberschuss von 930.000 € ausweist, ist das Rheintal-Budget auf exakt 1.240.000 € Einnahmen = 1.240.000 € Ausgaben geschlossen. Dies entspricht dem gemeinnützigkeitsrechtlichen Gebot der zeitnahen Mittelverwendung (§55 Abs. 1 Nr. 5 AO). Die Rücklage nach Satzungsklausel-7 (EV-10) ist zweckgebunden und verändert das Jahresergebnis nicht; sie wird in EV-10 vermerkt, ohne den Saldo zu verschieben. Jede Fixture-Datei, die Finanzzahlen enthält, muss das Jahresergebnis als 0 € ausweisen.

**Vier Dateien mit je zwei exklusiven BM25-Termen (statt Musterbaus 1-Datei-Cluster):** Musterbau konzentriert drei BM25-Terme in `techspec_pims.md`, um Test F klar zu isolieren. Der Rheintal-Korpus verteilt die zehn Terme auf vier Dateien mit je zwei Termen plus eine Datei mit einem Term, um einen anderen Retrieval-Aspekt zu testen: Bei einer Zwei-Term-Anfrage (z. B. „Werkförderverfahren AND Druckgrafik-Residenz") findet BM25 die korrekte Datei sicher; bei Einzelterm-Abfragen verhält sich BM25 identisch zur Musterbau-Situation. Kein BM25-Term erscheint in `kursleiter.csv`, da ein strukturiertes Roster-CSV keine narrativen Fachbegriffe enthält.

**Keine Unterordner (multidoc / long / dedup / phash / rrf):** Diese Test-Winkel werden vollständig durch den Musterbau-Korpus abgedeckt. Der Rheintal-Korpus fokussiert auf orthogonale Inhalte: gemeinnützige Vereinsstruktur, Honorarverträge, Förderantragswesen und Kursverwaltung. Beide Korpora liegen auf derselben Verzeichnisebene und werden im RAG-Pipeline-Test gleichzeitig indiziert, um Namespace-Trennschärfe zu prüfen (KL-IDs dürfen nicht mit MA-IDs kollidieren; EV-IDs nicht mit E-IDs).

**Kombiniertes Protokoll-Fixture:** `protokoll_jhv_2025.txt` bündelt vier Sitzungsprotokolle (EV-04, EV-07, EV-08, EV-10) in einer Datei, was Chunking-Grenzfälle erzeugt. Splitting-Strategien, die auf Überschriften oder Datumszeilen reagieren, werden dadurch anders belastet als beim Musterbau-Pendant `protokoll_qmeeting.txt` (das nur zwei Meetings enthält).

**Schlüsselpersonen-Auswahl:** Die fünf cross-file-Personen (PER-002 Feuerbach, PER-003 Endres, KL-01 Gruber, PER-011 Hamann, PER-009 Oppelt) repräsentieren die fünf operativen Funktionsbereiche: Geschäftsführung, Programm, künstlerischer Kern, Drittmittel, Ausstellungen. Alle haben plausible Eintrittsdaten vor ihrer heutigen Rolle.

---

*Dokumentversion: 1.0 — Eingefroren am 2026-05-11. Änderungen erfordern explizite Freigabe und müssen in allen referenzierten Fixture-Dateien nachgezogen werden.*
