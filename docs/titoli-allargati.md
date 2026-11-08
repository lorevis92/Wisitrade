# Strategia su più titoli: confronto per gruppi

Simulazione dal 01.03.2026 al 06.11.2026, con lo stesso motore di Prova, Reale e Simulazione e **senza cambiare nessuna regola**. Le condizioni sono quelle dell'ottimizzazione:

- 300 USDT di partenza, margine 10% del saldo, leva 5x, margine isolato con liquidazione;
- commissione 0,06% per lato, funding stimato 0,01% per periodo;
- slittamento 0,05% e 0,08% per lato.

Le 4 configurazioni:

- **Attuale:** le impostazioni di default dell'app.
- **Ottimizzata C:** il preset "Ottimizzata C · nov 26".
- **Ottimizzata 3 pos e 5 pos:** le migliori dell'ottimizzazione con 3 e con 5 posizioni al giorno (vedi `docs/ottimizzazione.md`).

I gruppi di titoli sono descritti in `docs/titoli-bitunix.md`.

- **Originali:** i 32 titoli di prima.
- **Nuovi:** 83 titoli con volume di almeno 100.000 USDT al giorno.
- **Bassa liquidità:** 45 titoli sotto quella soglia.
- **ETF a leva:** 19 ETF 2x, 3x, inversi e VIX.

## In breve

- **I titoli nuovi sono quotati su Bitunix da poco.** A marzo e aprile ce n'erano solo 6, a giugno 44. I 3/4 dei nuovi hanno dati dal 30.07.2026. Per questo il confronto è fatto due volte: su tutto il periodo e **sulle stesse date per tutti i gruppi, dal 01.08.2026**. Il secondo è il confronto più onesto.
- **Configurazione Attuale:** i nuovi danno molto più degli originali.
  - Sulle stesse date: originali +17,0%, nuovi +116,9%, tutti insieme +161,1%.
  - Su tutto il periodo: originali +32,5%, nuovi +396,3%.
  - Il risultato regge ai controlli. Senza i 5 titoli migliori resta +82,2%. Senza i primi 20 giorni dopo la quotazione è +252,9%. Con dimensione fissa tutti i mesi sono positivi.
  - Il guadagno medio vero per trade è 0,36% del valore, contro 0,06% sugli originali. Lo slittamento di pareggio sale da 0,08% a 0,20%.
  - Prezzo da pagare: un peggior calo del 42% (originali + nuovi: 35%), contro il 19% degli originali.
- **Configurazioni ottimizzate:** con i nuovi titoli da soli non funzionano.
  - Sulle stesse date: C −6,1%, 3 pos −19,5%, 5 pos +6,6%. Il guadagno di tutto il periodo viene quasi tutto da maggio–luglio, quando c'erano pochi titoli nuovi.
  - Funzionano meglio con **originali + nuovi insieme**, sulle stesse date: C +36,2% (solo originali +16,2%), 3 pos +21,5% (+16,3%), 5 pos +40,8% (+6,5%). Con più titoli, i primi segnali del giorno sono migliori.
- **Bassa liquidità:** risultati piccoli. Il pareggio è intorno allo 0,1%, ma in questi titoli lo slittamento vero sarà probabilmente più alto. Non conviene.
- **ETF a leva:** sulle stesse date sono negativi in tutte le configurazioni (Attuale −19,1%). Confermato: restano fuori.
- **Aggiungere bassa liquidità ed ETF a leva** a originali + nuovi cambia poco, sulle stesse date. Con l'Attuale peggiora (+161,1% → +147,5%), con C e 3 pos resta uguale, con 5 pos migliora un po' (+40,8% → +46,9%). In cambio si aggiungono titoli più rischiosi da eseguire.

## Cosa ne penso

1. **Il risultato dei nuovi è forte, ma va preso con cautela:**
   - **Pochi mesi:** su molti titoli nuovi ci sono solo 3–4 mesi di storico.
   - **Un solo tipo di titoli:** i titoli che contano di più sono quasi tutti piccole società di semiconduttori, ottica e AI (AXTI, WDC, CRCL, BSP, SHAZ…) in un periodo di trend fortissimo per loro. Se il trend finisce, il vantaggio può sparire.
   - **Calo più profondo:** con l'Attuale il peggior calo passa dal 19% al 35–42%.
   - **Un buon segno:** le regole dell'Attuale non sono mai state scelte su questi titoli. Per loro è una prova "alla cieca", e questo è il motivo principale per prenderla sul serio.
2. **Prossimo passo consigliato:**
   - mettere in **Prova** la configurazione Attuale (o Ottimizzata 5 pos) con **originali + nuovi**, per 3–4 settimane;
   - nel frattempo lasciare il Reale com'è;
   - intanto il controllo ogni minuto registra lo spread vero alle 9:30–9:35. Dopo 2–3 settimane si può sostituire la soglia di volume con una soglia di spread e rifare questo confronto con lo slittamento misurato.
3. **Tenere esclusi** bassa liquidità ed ETF a leva.

## Come riprodurre i numeri nell'app

1. Nella Simulazione apri **Impostazioni salvate** e carica **"Attuale · originali + nuovi"**: è la configurazione Attuale con 115 titoli (i 32 originali e gli 83 nuovi, senza bassa liquidità ed ETF a leva), margine 10%, leva 5x, commissione 0,06%, slittamento 0,05% e funding 0,01%.
2. Metti **capitale iniziale 300 USDT** e lascia la dimensione dei trade su **"% saldo", al 100%**. È l'interesse composto usato nel documento.
3. Lancia la simulazione. Nei risultati, il riquadro **"Titoli usati"** mostra quanti titoli sono stati usati, di quali gruppi, quanti hanno dati nel periodo e quale dimensione dei trade è stata usata.

Risultati attesi. Sono stati verificati con lo stesso codice dell'app, eseguito sul database vero, e coincidono con il calcolo del documento:

| Periodo | % saldo (come nel documento) | Cifra fissa 300 USDT (senza interesse composto) | Trade |
|---|---|---|---|
| 1 mese (08.10 – 06.11) | **+60,4%** (+181 USDT) | +49,7% (+149 USDT) | 176 |
| 3 mesi (08.08 – 06.11) | **+152,4%** (+457 USDT) | +98,9% (+297 USDT) | 512 |
| Dal 1° agosto (01.08 – 06.11) | **+161,1%** (+483 USDT) | +102,3% (+307 USDT) | 552 |
| Tutto (09.03 – 06.11) | **+441,9%** (+1.326 USDT) | +186,6% (+560 USDT) | 1.214 |

Se la dimensione è su **"Cifra"** ogni trade ha sempre la stessa grandezza, quindi i guadagni non fanno crescere i trade successivi. Più il periodo è lungo, più il risultato resta sotto quello del documento.

Le altre differenze possibili sono tutte nelle impostazioni della pagina:

- **titoli in più o in meno:** per esempio il pulsante "tutti" aggiunge anche bassa liquidità ed ETF a leva;
- **ordine dei titoli diverso:** conta solo quando due segnali arrivano nello stesso minuto e il limite di posizioni al giorno è pieno;
- **costi diversi:** slittamento, commissione o funding.

## Titoli con dati per mese

| Gruppo | Titoli | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | 32 | 15 | 18 | 23 | 28 | 29 | 31 | 31 | 32 | 32 |
| Solo i nuovi | 83 | 6 | 6 | 21 | 44 | 64 | 70 | 77 | 83 | 83 |
| Tutti insieme (originali + nuovi) | 115 | 21 | 24 | 44 | 72 | 93 | 101 | 108 | 115 | 115 |
| Solo bassa liquidità | 45 | 2 | 2 | 4 | 13 | 20 | 27 | 43 | 45 | 45 |
| Solo ETF a leva | 19 | 0 | 0 | 1 | 4 | 13 | 18 | 18 | 19 | 19 |
| Tutti (anche bassa liquidità ed ETF a leva) | 179 | 23 | 26 | 49 | 89 | 126 | 146 | 169 | 179 | 179 |

## Attuale

**Tutto il periodo (01.03.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+32,5%** (+98 USDT) | +0,0% | 1121 | 70% | 1,09 | −19,3% | −7,3% | 0 | 7 su 9 | 0,080% |
| Solo i nuovi | **+396,3%** (+1189 USDT) | +252,4% | 1014 | 75% | 1,32 | −42,1% | −24,3% | 0 | 9 su 9 | 0,198% |
| Tutti insieme (originali + nuovi) | **+441,9%** (+1326 USDT) | +262,4% | 1214 | 74% | 1,38 | −35,5% | −16,3% | 0 | 9 su 9 | 0,180% |
| Solo bassa liquidità | **+29,0%** (+87 USDT) | +7,8% | 631 | 68% | 1,14 | −13,1% | −7,6% | 0 | 7 su 9 | 0,099% |
| Solo ETF a leva | **+3,0%** (+9 USDT) | −18,0% | 587 | 71% | 1,01 | −40,5% | −24,1% | 0 | 4 su 7 | 0,058% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+435,5%** (+1307 USDT) | +257,7% | 1221 | 74% | 1,35 | −35,5% | −16,3% | 0 | 8 su 9 | 0,177% |

**Stesse date per tutti i gruppi (01.08.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+17,0%** (+51 USDT) | +2,3% | 517 | 69% | 1,13 | −13,0% | −7,3% | 0 | 3 su 4 | 0,091% |
| Solo i nuovi | **+116,9%** (+351 USDT) | +80,7% | 552 | 74% | 1,33 | −25,6% | −24,3% | 0 | 4 su 4 | 0,176% |
| Tutti insieme (originali + nuovi) | **+161,1%** (+483 USDT) | +117,3% | 552 | 75% | 1,49 | −22,1% | −16,3% | 0 | 4 su 4 | 0,207% |
| Solo bassa liquidità | **+19,8%** (+59 USDT) | +5,5% | 478 | 68% | 1,13 | −13,1% | −7,6% | 0 | 3 su 4 | 0,096% |
| Solo ETF a leva | **−19,1%** (−57 USDT) | −33,0% | 490 | 70% | 0,93 | −40,5% | −24,1% | 0 | 2 su 4 | 0,006% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+147,5%** (+443 USDT) | +106,2% | 552 | 75% | 1,45 | −25,7% | −16,3% | 0 | 4 su 4 | 0,200% |

Mese per mese, tutto il periodo, slittamento 0,05% (tra parentesi con 0,08%):

| Gruppo | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | +1,5 (−0,5) | +8,1 (+5,8) | −1,5 (−3,6) | +4,5 (−0,3) | +0,2 (−3,4) | −10,4 (−13,8) | +3,0 (+0,2) | +12,1 (+5,5) | +13,1 (+12,2) |
| Solo i nuovi | +3,5 (+3,3) | +6,9 (+5,4) | +28,4 (+24,9) | +38,5 (+32,7) | +16,2 (+7,9) | +11,8 (+7,2) | +24,2 (+18,1) | +39,6 (+28,4) | +11,9 (+11,3) |
| Tutti insieme (originali + nuovi) | +5,1 (+2,8) | +16,2 (+12,4) | +22,7 (+17,3) | +33,6 (+27,6) | +3,7 (−3,5) | +11,9 (+6,9) | +32,1 (+25,6) | +45,3 (+33,7) | +21,6 (+21,1) |
| Solo bassa liquidità | 0,0 (0,0) | +2,0 (+1,7) | +2,2 (+1,1) | +2,2 (+1,6) | +1,0 (−2,2) | −0,1 (−2,0) | +4,6 (+0,3) | +11,7 (+5,6) | +2,6 (+1,6) |
| Solo ETF a leva | — | — | +3,6 (+3,5) | −1,6 (−0,8) | +24,9 (+19,3) | −12,9 (−15,5) | +8,8 (−1,2) | −30,9 (−34,3) | +23,4 (+22,2) |
| Tutti (anche bassa liquidità ed ETF a leva) | +5,1 (+2,8) | +17,5 (+13,6) | +32,7 (+26,6) | +36,2 (+30,0) | −3,1 (−9,9) | +7,6 (+2,7) | +23,5 (+17,5) | +52,7 (+40,5) | +22,1 (+21,6) |

## Ottimizzata C

**Tutto il periodo (01.03.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+58,7%** (+176 USDT) | +43,6% | 309 | 61% | 1,41 | −7,9% | −5,5% | 0 | 8 su 9 | 0,212% |
| Solo i nuovi | **+55,9%** (+168 USDT) | +50,5% | 283 | 65% | 1,25 | −29,1% | −7,2% | 0 | 7 su 9 | 0,256% |
| Tutti insieme (originali + nuovi) | **+111,0%** (+333 USDT) | +90,9% | 315 | 64% | 1,65 | −8,5% | −5,5% | 0 | 9 su 9 | 0,309% |
| Solo bassa liquidità | **+11,3%** (+34 USDT) | +0,5% | 211 | 57% | 1,12 | −8,5% | −4,0% | 0 | 5 su 9 | 0,082% |
| Solo ETF a leva | **+48,2%** (+145 USDT) | +39,3% | 185 | 63% | 1,24 | −25,4% | −11,0% | 0 | 5 su 7 | 0,270% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+110,7%** (+332 USDT) | +90,7% | 315 | 64% | 1,65 | −8,5% | −5,5% | 0 | 9 su 9 | 0,308% |

**Stesse date per tutti i gruppi (01.08.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+16,2%** (+49 USDT) | +11,2% | 138 | 60% | 1,31 | −7,5% | −5,3% | 0 | 3 su 4 | 0,160% |
| Solo i nuovi | **−6,1%** (−18 USDT) | −9,2% | 138 | 60% | 0,92 | −20,1% | −7,0% | 0 | 2 su 4 | 0,008% |
| Tutti insieme (originali + nuovi) | **+36,2%** (+109 USDT) | +30,4% | 138 | 65% | 1,61 | −4,8% | −3,1% | 0 | 4 su 4 | 0,280% |
| Solo bassa liquidità | **+3,0%** (+9 USDT) | −3,6% | 135 | 54% | 1,05 | −7,5% | −4,0% | 0 | 2 su 4 | 0,065% |
| Solo ETF a leva | **−3,9%** (−12 USDT) | −8,0% | 137 | 62% | 0,96 | −25,4% | −11,0% | 0 | 2 su 4 | 0,000% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+36,2%** (+109 USDT) | +30,4% | 138 | 65% | 1,61 | −4,8% | −3,1% | 0 | 4 su 4 | 0,280% |

Mese per mese, tutto il periodo, slittamento 0,05% (tra parentesi con 0,08%):

| Gruppo | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | +0,3 (+0,0) | +6,0 (+4,4) | +4,4 (+3,4) | +12,7 (+11,5) | +9,1 (+7,3) | +9,1 (+7,9) | +3,1 (+2,0) | +4,5 (+2,4) | −1,1 (−1,3) |
| Solo i nuovi | +3,3 (+3,2) | +6,9 (+6,2) | +32,4 (+31,4) | +8,3 (+7,1) | +4,8 (+7,3) | −10,2 (−11,1) | +0,8 (−0,4) | −6,6 (−7,4) | +11,2 (+10,9) |
| Tutti insieme (originali + nuovi) | +3,4 (+3,0) | +8,7 (+6,9) | +7,7 (+6,6) | +16,5 (+15,3) | +9,9 (+8,1) | +13,6 (+12,3) | +8,6 (+7,3) | +6,7 (+4,8) | +3,5 (+3,3) |
| Solo bassa liquidità | 0,0 (0,0) | +4,7 (+4,4) | +2,2 (+2,0) | −6,5 (−6,6) | +7,9 (+4,8) | −2,8 (−3,8) | +3,4 (−0,4) | +6,0 (+4,2) | −3,3 (−3,5) |
| Solo ETF a leva | — | — | +3,3 (+3,2) | +10,1 (+9,8) | +35,6 (+33,5) | −18,9 (−19,9) | +19,2 (+17,8) | −1,9 (−3,1) | +1,3 (+0,6) |
| Tutti (anche bassa liquidità ed ETF a leva) | +3,4 (+3,0) | +8,6 (+6,8) | +7,7 (+6,6) | +16,5 (+15,3) | +9,9 (+8,1) | +13,6 (+12,3) | +8,6 (+7,3) | +6,7 (+4,8) | +3,5 (+3,3) |

## Ottimizzata 3 pos

**Tutto il periodo (01.03.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+65,5%** (+196 USDT) | +47,3% | 464 | 59% | 1,30 | −10,4% | −6,0% | 0 | 9 su 9 | 0,170% |
| Solo i nuovi | **+35,9%** (+108 USDT) | +20,7% | 419 | 61% | 1,10 | −43,6% | −10,8% | 0 | 6 su 9 | 0,131% |
| Tutti insieme (originali + nuovi) | **+127,0%** (+381 USDT) | +97,3% | 471 | 62% | 1,39 | −15,3% | −6,0% | 0 | 8 su 9 | 0,245% |
| Solo bassa liquidità | **+23,1%** (+69 USDT) | +9,2% | 309 | 58% | 1,18 | −10,7% | −5,4% | 0 | 5 su 9 | 0,108% |
| Solo ETF a leva | **+62,3%** (+187 USDT) | +44,7% | 268 | 62% | 1,21 | −29,7% | −12,8% | 0 | 5 su 7 | 0,212% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+130,7%** (+392 USDT) | +100,5% | 472 | 62% | 1,40 | −15,3% | −6,0% | 0 | 8 su 9 | 0,247% |

**Stesse date per tutti i gruppi (01.08.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+16,3%** (+49 USDT) | +11,5% | 207 | 59% | 1,22 | −6,7% | −4,3% | 0 | 4 su 4 | 0,133% |
| Solo i nuovi | **−19,5%** (−58 USDT) | −22,7% | 207 | 55% | 0,82 | −30,7% | −8,0% | 0 | 1 su 4 | 0,000% |
| Tutti insieme (originali + nuovi) | **+21,5%** (+64 USDT) | +16,2% | 207 | 59% | 1,22 | −9,6% | −5,0% | 0 | 3 su 4 | 0,161% |
| Solo bassa liquidità | **+8,0%** (+24 USDT) | +0,3% | 203 | 55% | 1,10 | −10,7% | −5,4% | 0 | 2 su 4 | 0,081% |
| Solo ETF a leva | **−3,7%** (−11 USDT) | −12,1% | 207 | 60% | 0,98 | −29,7% | −12,8% | 0 | 2 su 4 | 0,007% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+21,5%** (+64 USDT) | +16,2% | 207 | 59% | 1,22 | −9,6% | −5,0% | 0 | 3 su 4 | 0,161% |

Mese per mese, tutto il periodo, slittamento 0,05% (tra parentesi con 0,08%):

| Gruppo | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | +2,2 (+1,9) | +6,4 (+4,1) | +8,8 (+7,1) | +9,1 (+7,3) | +10,2 (+8,4) | +3,7 (+2,0) | +3,5 (+2,8) | +4,3 (+2,8) | +3,8 (+3,5) |
| Solo i nuovi | +4,3 (+4,1) | +6,7 (+5,8) | +36,4 (+34,7) | +5,5 (+3,7) | +5,4 (+1,4) | −16,6 (−17,6) | −6,3 (−7,2) | −7,3 (−8,6) | +11,2 (+10,7) |
| Tutti insieme (originali + nuovi) | +4,8 (+4,4) | +9,7 (+7,2) | +18,5 (+16,8) | +23,2 (+21,3) | +11,3 (+7,2) | +8,8 (+7,0) | +2,8 (+1,8) | −1,6 (−2,9) | +10,3 (+9,9) |
| Solo bassa liquidità | 0,0 (0,0) | +6,1 (+5,7) | +1,0 (+0,7) | −6,5 (−7,0) | +13,8 (+10,0) | −6,6 (−8,0) | +6,8 (+3,4) | +15,3 (+12,7) | −6,1 (−6,5) |
| Solo ETF a leva | — | — | +3,0 (+2,9) | +10,2 (+9,9) | +48,5 (+45,7) | −15,3 (−16,8) | +8,0 (+4,1) | −7,0 (−9,8) | +13,2 (+12,4) |
| Tutti (anche bassa liquidità ed ETF a leva) | +4,8 (+4,4) | +9,8 (+7,3) | +20,3 (+18,6) | +23,2 (+21,3) | +11,3 (+7,2) | +8,8 (+7,0) | +2,8 (+1,8) | −1,6 (−2,9) | +10,3 (+9,9) |

## Ottimizzata 5 pos

**Tutto il periodo (01.03.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+58,4%** (+175 USDT) | +29,2% | 751 | 58% | 1,17 | −19,7% | −8,7% | 0 | 8 su 9 | 0,113% |
| Solo i nuovi | **+225,5%** (+676 USDT) | +175,2% | 663 | 63% | 1,24 | −36,2% | −15,5% | 0 | 7 su 9 | 0,255% |
| Tutti insieme (originali + nuovi) | **+313,0%** (+939 USDT) | +229,4% | 774 | 61% | 1,36 | −20,4% | −10,2% | 0 | 8 su 9 | 0,258% |
| Solo bassa liquidità | **+18,1%** (+54 USDT) | +0,3% | 456 | 56% | 1,10 | −11,6% | −8,2% | 0 | 5 su 9 | 0,081% |
| Solo ETF a leva | **−2,4%** (−7 USDT) | −15,6% | 421 | 58% | 0,99 | −48,0% | −27,7% | 0 | 4 su 7 | 0,034% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+344,8%** (+1035 USDT) | +254,7% | 776 | 61% | 1,38 | −19,0% | −10,2% | 0 | 8 su 9 | 0,264% |

**Stesse date per tutti i gruppi (01.08.2026 – 06.11.2026)**

| Gruppo | Risultato 0,05% | Risultato 0,08% | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni | Mesi positivi (0,05%) | Slittamento di pareggio |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | **+6,5%** (+20 USDT) | −0,2% | 340 | 57% | 1,06 | −13,0% | −8,7% | 0 | 3 su 4 | 0,079% |
| Solo i nuovi | **+6,6%** (+20 USDT) | +0,1% | 345 | 57% | 1,03 | −21,4% | −14,1% | 0 | 2 su 4 | 0,080% |
| Tutti insieme (originali + nuovi) | **+40,8%** (+122 USDT) | +30,5% | 345 | 57% | 1,22 | −20,4% | −8,7% | 0 | 3 su 4 | 0,172% |
| Solo bassa liquidità | **+6,7%** (+20 USDT) | −4,2% | 322 | 54% | 1,05 | −11,6% | −8,2% | 0 | 2 su 4 | 0,066% |
| Solo ETF a leva | **−38,6%** (−116 USDT) | −45,5% | 342 | 57% | 0,81 | −44,7% | −27,7% | 0 | 1 su 4 | 0,000% |
| Tutti (anche bassa liquidità ed ETF a leva) | **+46,9%** (+141 USDT) | +36,3% | 345 | 58% | 1,25 | −18,7% | −8,7% | 0 | 3 su 4 | 0,189% |

Mese per mese, tutto il periodo, slittamento 0,05% (tra parentesi con 0,08%):

| Gruppo | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Solo i 32 originali | +2,6 (+2,1) | +9,2 (+5,3) | +10,8 (+7,9) | +11,6 (+7,0) | +7,3 (+4,3) | −6,3 (−9,3) | +2,0 (+1,0) | +2,9 (+1,1) | +8,3 (+7,7) |
| Solo i nuovi | +4,3 (+4,1) | +6,5 (+5,7) | +53,9 (+50,9) | +43,3 (+39,5) | +24,7 (+18,7) | −6,9 (−9,3) | +2,4 (+2,0) | −2,1 (−4,5) | +14,1 (+13,4) |
| Tutti insieme (originali + nuovi) | +7,2 (+6,6) | +16,5 (+11,9) | +35,6 (+31,8) | +37,2 (+33,5) | +26,2 (+20,2) | +14,1 (+11,1) | +2,3 (+0,4) | −2,4 (−4,9) | +23,7 (+23,0) |
| Solo bassa liquidità | 0,0 (0,0) | +6,1 (+5,7) | +1,1 (+0,7) | −8,8 (−9,5) | +13,3 (+8,8) | −4,5 (−6,6) | +6,5 (+2,0) | +10,3 (+6,4) | −4,9 (−5,5) |
| Solo ETF a leva | — | — | +3,0 (+2,9) | +13,7 (+13,3) | +35,7 (+32,7) | −31,5 (−33,5) | +4,7 (−0,4) | −13,1 (−15,6) | −1,5 (−2,5) |
| Tutti (anche bassa liquidità ed ETF a leva) | +7,2 (+6,6) | +18,4 (+13,7) | +37,7 (+33,9) | +37,2 (+33,5) | +26,2 (+20,2) | +14,1 (+11,1) | +6,7 (+4,8) | −2,4 (−4,9) | +23,7 (+23,0) |


## Controlli sul risultato dei titoli nuovi

Tutti su tutto il periodo, con slittamento 0,05%, salvo dove indicato. Per confronto c'è anche il gruppo degli originali. "Senza i primi 20 giorni" significa che in quei giorni non si entra; la preparazione del giorno usa comunque lo storico, come dal vivo. Per gli originali il controllo non si applica: sono quotati da marzo, l'inizio dell'archivio.

Slittamento dallo spread = metà dello spread misurato più 0,03% per lato, titolo per titolo. **Attenzione:** lo spread viene dal libro ordini di domenica 8 novembre, a borsa chiusa. La media è 0,071% per i nuovi e 0,056% per gli originali. In orario di borsa probabilmente lo spread è più stretto: quello vero arriva dalle registrazioni delle 9:30–9:35 che partono adesso.

Dimensione fissa = ogni trade con 30 USDT di margine (valore 150 USDT con leva 5x), senza interesse composto. Così si vede il guadagno medio vero per trade.

### Attuale

| Controllo | Nuovi | Originali |
|---|---|---|
| Risultato (interesse composto) | +396,3% (+1189 USDT, 1014 trade) | +32,5% (+98 USDT, 1121 trade) |
| Peso dei 10 trade migliori sul totale | +462 USDT = 39% | +98 USDT = 100% |
| Senza i 5 titoli che guadagnano di più | +82,2% (senza AXTI, WDC, BSP, SHAZ, CRCL) | −29,7% (senza ARM, HOOD, AMD, SHOP, MSTR) |
| Senza i primi 20 giorni di borsa dopo la quotazione | +252,9% (897 trade) | — |
| Dimensione fissa: guadagno totale | +543 USDT su 1014 trade | +98 USDT su 1121 trade |
| Dimensione fissa: guadagno medio per trade | +0,54 USDT = +0,36% del valore | +0,09 USDT = +0,06% del valore |
| Dimensione fissa: mesi positivi | 9 su 9 | 7 su 9 |
| Slittamento dallo spread (interesse composto) | +364,7% | +28,7% |
| Slittamento dallo spread (dimensione fissa) | +522 USDT | +89 USDT |

Mese per mese, nuovi:

| | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Interesse composto | +3,5% | +6,9% | +28,4% | +38,5% | +16,2% | +11,8% | +24,2% | +39,6% | +11,9% |
| Dimensione fissa (USDT) | +10 | +20 | +76 | +109 | +61 | +54 | +68 | +107 | +37 |
| Trade | 6 | 32 | 80 | 168 | 176 | 168 | 168 | 176 | 40 |

I 10 trade migliori: AAOI 05.11 (+77), IREN 30.07 (+65), BSP 14.10 (+64), DDOG 02.11 (+47), COHR 10.08 (+43), AXTI 05.08 (+38), AXTI 05.11 (+36), BNC 03.09 (+33), AXTI 28.08 (+30), AXTI 12.08 (+30).

### Ottimizzata C

| Controllo | Nuovi | Originali |
|---|---|---|
| Risultato (interesse composto) | +55,9% (+168 USDT, 283 trade) | +58,7% (+176 USDT, 309 trade) |
| Peso dei 10 trade migliori sul totale | +151 USDT = 90% | +114 USDT = 65% |
| Senza i 5 titoli che guadagnano di più | +8,8% (senza CRCL, BE, USAR, SNDK, NBIS) | +5,1% (senza ARM, HOOD, INTC, CRM, TSLA) |
| Senza i primi 20 giorni di borsa dopo la quotazione | +31,3% (259 trade) | — |
| Dimensione fissa: guadagno totale | +145 USDT su 283 trade | +144 USDT su 309 trade |
| Dimensione fissa: guadagno medio per trade | +0,51 USDT = +0,34% del valore | +0,47 USDT = +0,31% del valore |
| Dimensione fissa: mesi positivi | 7 su 9 | 8 su 9 |
| Slittamento dallo spread (interesse composto) | +59,5% | +55,8% |
| Slittamento dallo spread (dimensione fissa) | +152 USDT | +139 USDT |

Mese per mese, nuovi:

| | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Interesse composto | +3,3% | +6,9% | +32,4% | +8,3% | +4,8% | −10,2% | +0,8% | −6,6% | +11,2% |
| Dimensione fissa (USDT) | +10 | +20 | +86 | +26 | +17 | −30 | +4 | −19 | +33 |
| Trade | 3 | 23 | 33 | 42 | 44 | 42 | 42 | 44 | 10 |

I 10 trade migliori: SNDK 05.11 (+21), CRDO 02.09 (+18), BE 05.11 (+17), MRVL 09.06 (+16), SNDK 28.07 (+15), QCOM 22.05 (+14), SNDK 24.07 (+14), NBIS 24.06 (+12), MRVL 27.05 (+12), CRCL 10.07 (+12).

### Ottimizzata 3 pos

| Controllo | Nuovi | Originali |
|---|---|---|
| Risultato (interesse composto) | +35,9% (+108 USDT, 419 trade) | +65,5% (+196 USDT, 464 trade) |
| Peso dei 10 trade migliori sul totale | +160 USDT = 149% | +120 USDT = 61% |
| Senza i 5 titoli che guadagnano di più | +0,0% (senza CRCL, AXTI, USAR, BE, SNDK) | −11,9% (senza ARM, HOOD, ORCL, AMD, TSLA) |
| Senza i primi 20 giorni di borsa dopo la quotazione | +42,4% (379 trade) | — |
| Dimensione fissa: guadagno totale | +114 USDT su 419 trade | +158 USDT su 464 trade |
| Dimensione fissa: guadagno medio per trade | +0,27 USDT = +0,18% del valore | +0,34 USDT = +0,23% del valore |
| Dimensione fissa: mesi positivi | 6 su 9 | 9 su 9 |
| Slittamento dallo spread (interesse composto) | +38,9% | +60,6% |
| Slittamento dallo spread (dimensione fissa) | +121 USDT | +150 USDT |

Mese per mese, nuovi:

| | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Interesse composto | +4,3% | +6,7% | +36,4% | +5,5% | +5,4% | −16,6% | −6,3% | −7,3% | +11,2% |
| Dimensione fissa (USDT) | +13 | +20 | +95 | +20 | +22 | −52 | −17 | −21 | +34 |
| Trade | 5 | 30 | 48 | 63 | 66 | 63 | 63 | 66 | 15 |

I 10 trade migliori: MRVL 02.06 (+18), AXTI 08.07 (+17), BE 29.07 (+17), CRDO 02.09 (+17), MRVL 09.06 (+17), SNDK 28.07 (+16), AXTI 25.06 (+16), SNDK 24.07 (+14), QCOM 22.05 (+14), BE 05.11 (+13).

### Ottimizzata 5 pos

| Controllo | Nuovi | Originali |
|---|---|---|
| Risultato (interesse composto) | +225,5% (+676 USDT, 663 trade) | +58,4% (+175 USDT, 751 trade) |
| Peso dei 10 trade migliori sul totale | +406 USDT = 60% | +119 USDT = 68% |
| Senza i 5 titoli che guadagnano di più | +63,9% (senza AXTI, CRCL, CBRS, MRVL, ASTS) | −20,1% (senza ARM, HOOD, AMD, ORCL, SHOP) |
| Senza i primi 20 giorni di borsa dopo la quotazione | +116,8% (596 trade) | — |
| Dimensione fissa: guadagno totale | +401 USDT su 663 trade | +150 USDT su 751 trade |
| Dimensione fissa: guadagno medio per trade | +0,61 USDT = +0,40% del valore | +0,20 USDT = +0,13% del valore |
| Dimensione fissa: mesi positivi | 7 su 9 | 8 su 9 |
| Slittamento dallo spread (interesse composto) | +223,9% | +53,1% |
| Slittamento dallo spread (dimensione fissa) | +400 USDT | +140 USDT |

Mese per mese, nuovi:

| | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| Interesse composto | +4,3% | +6,5% | +53,9% | +43,3% | +24,7% | −6,9% | +2,4% | −2,1% | +14,1% |
| Dimensione fissa (USDT) | +13 | +19 | +132 | +118 | +82 | −14 | +10 | −3 | +45 |
| Trade | 5 | 30 | 68 | 105 | 110 | 105 | 105 | 110 | 25 |

I 10 trade migliori: IREN 30.07 (+60), AXTI 29.07 (+58), AAOI 05.11 (+48), AXTI 19.08 (+42), AXTI 12.08 (+38), COHR 10.08 (+35), CRDO 02.09 (+34), AXTI 30.07 (+31), AAOI 28.07 (+31), LITE 10.08 (+30).

## Contributo di ogni titolo nuovo

Guadagno o perdita in USDT di ogni titolo nuovo, su tutto il periodo, con interesse composto e slittamento 0,05%. Ordinati dal più al meno. Con l'interesse composto i trade più recenti pesano di più, perché il saldo è più alto.

### Attuale

| # | Titolo | Nome | Trade | Vinti | Risultato (USDT) | Quota del totale |
|---|---|---|---|---|---|---|
| 1 | AXTI | AXT | 63 | 86% | +368,0 | 31,0% |
| 2 | WDC | Western Digital | 43 | 79% | +159,5 | 13,4% |
| 3 | BSP | Bending Spoons | 13 | 92% | +136,7 | 11,5% |
| 4 | SHAZ | SharonAI | 17 | 88% | +89,2 | 7,5% |
| 5 | CRCL | Circle | 63 | 86% | +89,1 | 7,5% |
| 6 | ASTS | AST SpaceMobile | 27 | 74% | +77,2 | 6,5% |
| 7 | BNC | BNB Standard | 4 | 100% | +75,8 | 6,4% |
| 8 | FLNC | Fluence Energy | 18 | 83% | +74,9 | 6,3% |
| 9 | RKLB | Rocket Lab | 21 | 71% | +73,7 | 6,2% |
| 10 | AAOI | Applied Optoelectronics | 50 | 70% | +66,1 | 5,6% |
| 11 | IONQ | IonQ | 4 | 100% | +59,4 | 5,0% |
| 12 | ALAB | Astera Labs | 8 | 100% | +58,6 | 4,9% |
| 13 | DDOG | Datadog | 2 | 100% | +58,3 | 4,9% |
| 14 | COHR | Coherent | 30 | 73% | +50,5 | 4,2% |
| 15 | SPCX | SpaceX | 15 | 93% | +45,0 | 3,8% |
| 16 | CBRS | Cerebras Systems | 42 | 74% | +44,7 | 3,8% |
| 17 | USAR | USA Rare Earth | 25 | 80% | +38,7 | 3,3% |
| 18 | CIEN | Ciena | 7 | 100% | +37,5 | 3,2% |
| 19 | NBIS | Nebius | 51 | 76% | +35,7 | 3,0% |
| 20 | NOW | ServiceNow | 8 | 75% | +30,1 | 2,5% |
| 21 | FWDI | Forward Industries | 6 | 83% | +24,5 | 2,1% |
| 22 | BMNR | Bitmine Immersion | 14 | 79% | +19,3 | 1,6% |
| 23 | SMCI | Super Micro Computer | 10 | 90% | +13,2 | 1,1% |
| 24 | CRML | Critical Metals | 2 | 100% | +12,2 | 1,0% |
| 25 | IREN | IREN | 25 | 60% | +11,2 | 0,9% |
| 26 | ONDS | Ondas | 6 | 83% | +10,1 | 0,8% |
| 27 | HPE | Hewlett Packard Enterprise | 6 | 67% | +9,1 | 0,8% |
| 28 | BWET | Breakwave Tanker Shipping ETF | 1 | 100% | +8,2 | 0,7% |
| 29 | GLW | Corning | 5 | 80% | +6,6 | 0,6% |
| 30 | VRT | Vertiv | 2 | 100% | +6,4 | 0,5% |
| 31 | IBM | IBM | 7 | 71% | +5,8 | 0,5% |
| 32 | OKLO | Oklo | 1 | 100% | +5,6 | 0,5% |
| 33 | WEN | Wendy's | 3 | 100% | +5,0 | 0,4% |
| 34 | RDDT | Reddit | 2 | 100% | +4,3 | 0,4% |
| 35 | TTWO | Take-Two Interactive | 1 | 100% | +2,7 | 0,2% |
| 36 | NET | Cloudflare | 1 | 100% | +2,5 | 0,2% |
| 37 | ASML | ASML | 1 | 100% | +1,5 | 0,1% |
| 38 | EWY | iShares MSCI South Korea ETF | 12 | 83% | +1,5 | 0,1% |
| 39 | MRVL | Marvell Technology | 27 | 67% | +0,8 | 0,1% |
| 40 | ACN | Accenture | 1 | 0% | −0,4 | -0,0% |
| 41 | DJT | Trump Media & Technology | 1 | 0% | −0,5 | -0,0% |
| 42 | VST | Vistra | 4 | 75% | −1,4 | -0,1% |
| 43 | DELL | Dell | 13 | 69% | −1,4 | -0,1% |
| 44 | BX | Blackstone | 4 | 75% | −4,5 | -0,4% |
| 45 | HIMS | Hims & Hers Health | 9 | 67% | −4,7 | -0,4% |
| 46 | AMAT | Applied Materials | 7 | 71% | −4,9 | -0,4% |
| 47 | BE | Bloom Energy | 53 | 75% | −5,0 | -0,4% |
| 48 | GS | Goldman Sachs | 2 | 50% | −6,6 | -0,6% |
| 49 | NKE | NIKE | 3 | 67% | −7,0 | -0,6% |
| 50 | FLEX | Flex | 6 | 67% | −7,1 | -0,6% |
| 51 | BOT | Robostrategy | 2 | 50% | −7,3 | -0,6% |
| 52 | APP | AppLovin | 11 | 73% | −11,9 | -1,0% |
| 53 | TSM | TSMC | 12 | 50% | −14,6 | -1,2% |
| 54 | QCOM | QUALCOMM | 28 | 68% | −17,8 | -1,5% |
| 55 | SNDK | Sandisk | 56 | 75% | −18,0 | -1,5% |
| 56 | DRAM | Roundhill Memory ETF | 6 | 50% | −21,3 | -1,8% |
| 57 | CRWV | CoreWeave | 36 | 67% | −24,2 | -2,0% |
| 58 | SOFI | SoFi | 4 | 50% | −24,9 | -2,1% |
| 59 | SKHY | SK hynix | 8 | 63% | −28,3 | -2,4% |
| 60 | SNOW | Snowflake | 3 | 33% | −28,4 | -2,4% |
| 61 | TEM | Tempus AI | 5 | 60% | −31,0 | -2,6% |
| 62 | LITE | Lumentum | 45 | 67% | −46,0 | -3,9% |
| 63 | CYPH | Cypherpunk | 10 | 60% | −84,7 | -7,1% |
| 64 | CRDO | Credo Technology | 16 | 56% | −107,9 | -9,1% |
| 65 | MRNA | Moderna | 26 | 62% | −120,4 | -10,1% |

### Ottimizzata C

| # | Titolo | Nome | Trade | Vinti | Risultato (USDT) | Quota del totale |
|---|---|---|---|---|---|---|
| 1 | CRCL | Circle | 53 | 79% | +91,5 | 54,6% |
| 2 | BE | Bloom Energy | 41 | 66% | +31,5 | 18,8% |
| 3 | USAR | USA Rare Earth | 4 | 100% | +24,5 | 14,6% |
| 4 | SNDK | Sandisk | 44 | 64% | +24,5 | 14,6% |
| 5 | NBIS | Nebius | 30 | 70% | +21,9 | 13,1% |
| 6 | CRDO | Credo Technology | 1 | 100% | +18,1 | 10,8% |
| 7 | MRNA | Moderna | 5 | 80% | +15,7 | 9,4% |
| 8 | ASTS | AST SpaceMobile | 3 | 100% | +13,6 | 8,1% |
| 9 | COHR | Coherent | 2 | 100% | +11,9 | 7,1% |
| 10 | SPCX | SpaceX | 16 | 63% | +10,6 | 6,3% |
| 11 | WDC | Western Digital | 4 | 75% | +10,0 | 5,9% |
| 12 | SMCI | Super Micro Computer | 1 | 100% | +7,3 | 4,4% |
| 13 | MRVL | Marvell Technology | 11 | 55% | +7,3 | 4,3% |
| 14 | QCOM | QUALCOMM | 5 | 60% | +3,3 | 2,0% |
| 15 | APP | AppLovin | 1 | 100% | +3,1 | 1,9% |
| 16 | ALAB | Astera Labs | 1 | 100% | +1,0 | 0,6% |
| 17 | AXTI | AXT | 12 | 67% | −0,6 | -0,3% |
| 18 | LITE | Lumentum | 6 | 33% | −0,8 | -0,5% |
| 19 | BMNR | Bitmine Immersion | 2 | 50% | −4,1 | -2,4% |
| 20 | TSM | TSMC | 1 | 0% | −4,3 | -2,6% |
| 21 | SHAZ | SharonAI | 1 | 0% | −5,1 | -3,0% |
| 22 | IREN | IREN | 3 | 33% | −5,7 | -3,4% |
| 23 | DRAM | Roundhill Memory ETF | 4 | 50% | −6,9 | -4,1% |
| 24 | DELL | Dell | 1 | 0% | −12,1 | -7,2% |
| 25 | CRWV | CoreWeave | 2 | 50% | −13,5 | -8,0% |
| 26 | SKHY | SK hynix | 6 | 50% | −16,8 | -10,0% |
| 27 | AAOI | Applied Optoelectronics | 23 | 43% | −58,7 | -35,0% |

### Ottimizzata 3 pos

| # | Titolo | Nome | Trade | Vinti | Risultato (USDT) | Quota del totale |
|---|---|---|---|---|---|---|
| 1 | CRCL | Circle | 62 | 79% | +119,8 | 111,4% |
| 2 | AXTI | AXT | 33 | 67% | +49,9 | 46,4% |
| 3 | USAR | USA Rare Earth | 5 | 100% | +28,8 | 26,8% |
| 4 | BE | Bloom Energy | 46 | 61% | +21,5 | 20,0% |
| 5 | SNDK | Sandisk | 48 | 67% | +21,3 | 19,8% |
| 6 | MRVL | Marvell Technology | 17 | 53% | +17,7 | 16,4% |
| 7 | CRDO | Credo Technology | 1 | 100% | +17,0 | 15,8% |
| 8 | SPCX | SpaceX | 16 | 63% | +12,1 | 11,3% |
| 9 | ASTS | AST SpaceMobile | 3 | 100% | +12,0 | 11,2% |
| 10 | BSP | Bending Spoons | 2 | 100% | +8,0 | 7,4% |
| 11 | SMCI | Super Micro Computer | 1 | 100% | +7,7 | 7,1% |
| 12 | WDC | Western Digital | 8 | 75% | +7,7 | 7,1% |
| 13 | APP | AppLovin | 1 | 100% | +2,6 | 2,5% |
| 14 | ALAB | Astera Labs | 1 | 100% | +0,9 | 0,8% |
| 15 | CYPH | Cypherpunk | 1 | 100% | +0,2 | 0,2% |
| 16 | SHAZ | SharonAI | 3 | 33% | −0,4 | -0,4% |
| 17 | NBIS | Nebius | 44 | 66% | −0,5 | -0,5% |
| 18 | EWY | iShares MSCI South Korea ETF | 2 | 50% | −1,2 | -1,1% |
| 19 | ONDS | Ondas | 1 | 0% | −1,8 | -1,7% |
| 20 | BX | Blackstone | 1 | 0% | −2,2 | -2,0% |
| 21 | NET | Cloudflare | 1 | 0% | −3,1 | -2,9% |
| 22 | RKLB | Rocket Lab | 2 | 0% | −4,7 | -4,4% |
| 23 | DRAM | Roundhill Memory ETF | 4 | 50% | −5,5 | -5,1% |
| 24 | MRNA | Moderna | 10 | 50% | −5,6 | -5,2% |
| 25 | CBRS | Cerebras Systems | 6 | 50% | −6,5 | -6,1% |
| 26 | LITE | Lumentum | 17 | 53% | −7,0 | -6,5% |
| 27 | TSM | TSMC | 5 | 20% | −8,7 | -8,1% |
| 28 | DELL | Dell | 1 | 0% | −9,5 | -8,8% |
| 29 | COHR | Coherent | 5 | 40% | −9,7 | -9,0% |
| 30 | QCOM | QUALCOMM | 11 | 55% | −10,2 | -9,5% |
| 31 | CRWV | CoreWeave | 8 | 50% | −11,7 | -10,9% |
| 32 | IREN | IREN | 8 | 25% | −12,2 | -11,3% |
| 33 | BMNR | Bitmine Immersion | 4 | 50% | −13,5 | -12,6% |
| 34 | SKHY | SK hynix | 6 | 50% | −22,9 | -21,3% |
| 35 | AAOI | Applied Optoelectronics | 35 | 46% | −82,8 | -77,0% |

### Ottimizzata 5 pos

| # | Titolo | Nome | Trade | Vinti | Risultato (USDT) | Quota del totale |
|---|---|---|---|---|---|---|
| 1 | AXTI | AXT | 53 | 70% | +263,9 | 39,0% |
| 2 | CRCL | Circle | 63 | 79% | +124,0 | 18,3% |
| 3 | CBRS | Cerebras Systems | 17 | 65% | +91,9 | 13,6% |
| 4 | MRVL | Marvell Technology | 26 | 62% | +67,2 | 9,9% |
| 5 | ASTS | AST SpaceMobile | 17 | 65% | +56,6 | 8,4% |
| 6 | LITE | Lumentum | 35 | 63% | +54,9 | 8,1% |
| 7 | USAR | USA Rare Earth | 13 | 85% | +54,0 | 8,0% |
| 8 | WDC | Western Digital | 17 | 71% | +49,1 | 7,3% |
| 9 | FLNC | Fluence Energy | 5 | 80% | +46,0 | 6,8% |
| 10 | BSP | Bending Spoons | 6 | 83% | +45,1 | 6,7% |
| 11 | SMCI | Super Micro Computer | 5 | 80% | +35,3 | 5,2% |
| 12 | IREN | IREN | 25 | 56% | +31,2 | 4,6% |
| 13 | SHAZ | SharonAI | 8 | 63% | +25,3 | 3,7% |
| 14 | BNC | BNB Standard | 1 | 100% | +24,0 | 3,5% |
| 15 | COHR | Coherent | 22 | 50% | +19,1 | 2,8% |
| 16 | HIMS | Hims & Hers Health | 1 | 100% | +19,0 | 2,8% |
| 17 | SPCX | SpaceX | 16 | 63% | +18,4 | 2,7% |
| 18 | TEM | Tempus AI | 3 | 67% | +16,7 | 2,5% |
| 19 | SNDK | Sandisk | 49 | 67% | +15,6 | 2,3% |
| 20 | APP | AppLovin | 3 | 67% | +11,8 | 1,7% |
| 21 | IONQ | IonQ | 1 | 100% | +10,5 | 1,6% |
| 22 | SOFI | SoFi | 2 | 100% | +9,8 | 1,4% |
| 23 | FWDI | Forward Industries | 1 | 100% | +9,0 | 1,3% |
| 24 | DDOG | Datadog | 1 | 100% | +7,2 | 1,1% |
| 25 | VST | Vistra | 1 | 100% | +5,9 | 0,9% |
| 26 | RKLB | Rocket Lab | 7 | 57% | +5,3 | 0,8% |
| 27 | NOW | ServiceNow | 2 | 50% | +2,8 | 0,4% |
| 28 | ALAB | Astera Labs | 1 | 100% | +1,9 | 0,3% |
| 29 | EWY | iShares MSCI South Korea ETF | 7 | 57% | −0,3 | -0,1% |
| 30 | BX | Blackstone | 2 | 50% | −0,4 | -0,1% |
| 31 | BMNR | Bitmine Immersion | 10 | 60% | −2,5 | -0,4% |
| 32 | ONDS | Ondas | 1 | 0% | −3,8 | -0,6% |
| 33 | GLW | Corning | 1 | 0% | −3,9 | -0,6% |
| 34 | TTWO | Take-Two Interactive | 1 | 0% | −5,2 | -0,8% |
| 35 | TSM | TSMC | 6 | 33% | −5,3 | -0,8% |
| 36 | CYPH | Cypherpunk | 2 | 50% | −5,6 | -0,8% |
| 37 | NET | Cloudflare | 1 | 0% | −6,4 | -0,9% |
| 38 | QCOM | QUALCOMM | 20 | 60% | −6,7 | -1,0% |
| 39 | DRAM | Roundhill Memory ETF | 4 | 50% | −7,9 | -1,2% |
| 40 | NBIS | Nebius | 48 | 65% | −8,2 | -1,2% |
| 41 | SNOW | Snowflake | 1 | 0% | −8,7 | -1,3% |
| 42 | IBM | IBM | 1 | 0% | −11,5 | -1,7% |
| 43 | FLEX | Flex | 2 | 50% | −12,5 | -1,8% |
| 44 | NKE | NIKE | 1 | 0% | −13,6 | -2,0% |
| 45 | DELL | Dell | 6 | 33% | −21,2 | -3,1% |
| 46 | MRNA | Moderna | 18 | 50% | −21,7 | -3,2% |
| 47 | AMAT | Applied Materials | 2 | 0% | −24,7 | -3,6% |
| 48 | CRDO | Credo Technology | 4 | 25% | −26,3 | -3,9% |
| 49 | SKHY | SK hynix | 7 | 57% | −31,4 | -4,6% |
| 50 | BE | Bloom Energy | 47 | 60% | −38,8 | -5,7% |
| 51 | CRWV | CoreWeave | 23 | 52% | −68,0 | -10,1% |
| 52 | AAOI | Applied Optoelectronics | 47 | 53% | −110,4 | -16,3% |

## Note

- **Ordine dei titoli:** quando due segnali arrivano nello stesso minuto, vale l'ordine della lista, con prima gli originali e poi i nuovi per volume. Conta solo quando il limite di posizioni al giorno è pieno.
- **Slittamento di pareggio:** è lo slittamento per lato oltre il quale il risultato del periodo va a zero, trovato per ricerca binaria. "0,000%" vuol dire negativo già senza slittamento.
- **Simulazione nell'app:** regge anche con tutti i 181 titoli su tutto il periodo, Analisi compresa. Nella prova sul computer: circa 20 s per caricare i dati, 75 s per il calcolo, 1,5 GB di memoria. Su Vercel il processore è più lento, quindi un periodo così lungo con tutti i titoli può avvicinarsi al limite di 5 minuti: con molti titoli conviene un periodo più corto.
- **Controllo ogni minuto:** nel caso peggiore, alle 9:31 con tutti i titoli in gioco, scarica le candele della strategia in 23 s e quelle dello scanner in altri 8 s. Poi la registrazione dello spread usa al massimo 9 s, solo se resta tempo. Tutto resta sotto i 55 s del blocco e sotto le 8 richieste al secondo (Bitunix ne accetta 10).
