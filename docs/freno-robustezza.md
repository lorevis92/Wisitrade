# Freno di mercato "chiudi tutto": vantaggio vero o fortuna?

Test completo con lo stesso motore dell'app, sui dati dell'archivio. Condizioni di base:

- configurazione Attuale, originali + nuovi (115 titoli), margine 10%;
- commissione 0,06%, slittamento 0,05% (e 0,08% per i casi principali), funding 0,01%;
- limite giornaliero 10%, limite totale spento, scelta tra segnali per ordine della lista.

Si è provato tutto con ogni combinazione di:

- soglie del freno: spento, 4, 5, 6, 7, 8, 9, 10, 12 e 15%;
- leva: 3x, 5x e 7x;
- posizioni al giorno: 8 e 10.

## In breve

**Il freno non migliora il rendimento in modo stabile, ma riduce il rischio in modo stabile.**

- **Rischio:** in 50 casi su 51 in cui scatta rende meno grave il giorno peggiore (es. 5x, 10 posizioni: da −20,4% a circa −7/−11%). In 49 casi su 51 riduce anche il peggior calo.
- **Rendimento:** dipende dal periodo.
  - Marzo–agosto: rispetto al freno spento, a dimensione fissa, ha fatto meglio in 40 casi su 51.
  - Settembre–6 novembre: ha fatto **peggio in 47 casi su 47**, qualunque soglia, leva o numero di posizioni.
  - Il guadagno visto su tutto il periodo viene quindi da pochi giorni di primavera ed estate e non si ripete dopo.
- **Soglie basse** (4–6%): costano molto con leva 5x e 7x, perché scattano spesso (fino a 50 giorni in 8 mesi) e tolgono riprese che poi arrivano.
- **Nessuna soglia vince** in modo coerente su leve, posizioni, periodi e finestre mobili.
  - La migliore cambia da caso a caso: 5% a 3x, 8–9% a 5x, 10% a 7x.
  - Le soglie vicine danno risultati molto diversi: per esempio a 7x con 10 posizioni il 9% fa +1043% e il 10% +1544%.
  - È il segno tipico della fortuna.
- **Con lo slittamento 0,08%** il quadro è lo stesso: settembre–novembre resta negativo per il freno, e su tutto il periodo i risultati cambiano un po' in un senso o nell'altro (ogni chiusura forzata paga lo slittamento in più).

## Cosa ti consiglio

1. **Non usare il freno per guadagnare di più:** non c'è prova che lo faccia.
2. **Se lo usi come assicurazione** contro le giornate disastrose, scegli una soglia alta rispetto alla leva:
   - **circa 8–10% con 5x;**
   - **10–12% con 7x;**
   - **6–8% con 3x.**
   Così scatta di rado (5–15 giorni in 8 mesi) e taglia soprattutto le giornate davvero brutte. Il prezzo è un rendimento che a volte sarà un po' più basso, come a settembre–novembre.
3. **Sotto il 7% non usarlo, con leva 5x o più.**
4. **Il default resta spento.** Se il tuo obiettivo è soprattutto limitare il rischio, è più efficace scegliere una leva più bassa che affidarsi al freno.
   - Peggior calo con la leva:
     - 3x: 24%;
     - 5x: 37%;
     - 7x: 49%.
   - Il freno, quando va bene, toglie circa 5–15 punti a questi numeri.

## Tabella riassuntiva (tutto il periodo, slittamento 0,05%, interesse composto)

In ogni casella: risultato · peggior calo · giorno peggiore. In **grassetto** i casi migliori del freno spento.

### 10 posizioni al giorno

| Freno | Leva 3x | Leva 5x | Leva 7x |
|---|---|---|---|
| spento | +211% · −24% · −12,2% | +502% · −37% · −20,4% | +951% · −49% · −28,6% |
| 4% | **+237% · −18% · −5,2%** | +332% · −34% · −6,9% | +297% · −53% · −9,7% |
| 5% | **+249% · −19% · −6,5%** | +477% · −28% · −7,4% | +506% · −49% · −9,7% |
| 6% | **+229% · −20% · −7,7%** | +445% · −28% · −8,2% | +557% · −47% · −9,7% |
| 7% | **+216% · −22% · −8,6%** | **+574% · −29% · −8,8%** | +935% · −35% · −10,4% |
| 8% | +207% · −23% · −8,7% | **+643% · −29% · −10,8%** | +735% · −38% · −11,2% |
| 9% | +204% · −22% · −9,7% | **+626% · −31% · −10,8%** | **+1043% · −37% · −12,1%** |
| 10% | +195% · −22% · −10,6% | **+568% · −32% · −12,9%** | **+1544% · −36% · −12,3%** |
| 12% | **+211% · −24% · −12,2%** | **+531% · −34% · −14,3%** | **+1314% · −39% · −15,1%** |
| 15% | +211% · −24% · −12,2% | +480% · −34% · −16,1% | **+1108% · −43% · −18,0%** |

### 8 posizioni al giorno

| Freno | Leva 3x | Leva 5x | Leva 7x |
|---|---|---|---|
| spento | +188% · −23% · −9,8% | +442% · −35% · −16,3% | +909% · −47% · −22,8% |
| 4% | **+191% · −15% · −5,1%** | +316% · −28% · −6,4% | +407% · −44% · −7,9% |
| 5% | **+198% · −16% · −5,8%** | +414% · −22% · −7,1% | +401% · −38% · −8,9% |
| 6% | +181% · −19% · −7,3% | **+499% · −24% · −7,6%** | +534% · −39% · −8,9% |
| 7% | +178% · −20% · −8,1% | +437% · −25% · −9,1% | +745% · −30% · −9,9% |
| 8% | +171% · −21% · −9,0% | **+492% · −25% · −9,4%** | **+962% · −32% · −10,0%** |
| 9% | **+189% · −22% · −9,2%** | **+444% · −27% · −10,4%** | **+1288% · −32% · −11,1%** |
| 10% | +186% · −23% · −10,3% | +422% · −30% · −12,1% | **+1153% · −31% · −12,8%** |
| 12% | +188% · −23% · −9,8% | +410% · −32% · −13,4% | **+960% · −35% · −14,3%** |
| 15% | +188% · −23% · −9,8% | **+448% · −35% · −15,4%** | +886% · −41% · −17,0% |

## Il freno da solo: dimensione fissa (senza interesse composto)

Ogni trade usa sempre 30 USDT di margine (10% di 300), così l'effetto del freno non si mescola con quello dell'interesse composto. Nelle caselle c'è la differenza in USDT rispetto al freno spento, per periodo: + vuol dire che il freno ha aiutato.

### Leva 3x · 10 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +365 | +223 | +142 | +205 | — | — |
| 4% | +20 | +23 | −2 | +27 | 15 | 4 · 4 su 6 |
| 5% | +32 | +45 | −13 | +9 | 9 | 5 · 5 su 6 |
| 6% | +13 | +29 | −15 | +4 | 7 | 5 · 5 su 6 |
| 7% | +5 | +17 | −12 | +3 | 6 | 4 · 4 su 6 |
| 8% | −3 | +9 | −12 | −0 | 5 | 2 · 2 su 6 |
| 9% | −7 | +9 | −15 | −7 | 3 | 3 · 3 su 6 |
| 10% | −14 | +4 | −18 | −12 | 3 | 2 · 2 su 6 |
| 12% | +0 | +0 | 0 | +0 | 1 | 3 · 3 su 6 |
| 15% | 0 | 0 | 0 | 0 | 0 | 0 · 0 su 6 |

### Leva 3x · 8 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +336 | +177 | +159 | +186 | — | — |
| 4% | +2 | +11 | −9 | +15 | 12 | 4 · 4 su 6 |
| 5% | +9 | +23 | −14 | +4 | 8 | 4 · 4 su 6 |
| 6% | −7 | +14 | −22 | −8 | 6 | 3 · 3 su 6 |
| 7% | −10 | +8 | −18 | −12 | 3 | 3 · 3 su 6 |
| 8% | −17 | +5 | −21 | −16 | 3 | 3 · 3 su 6 |
| 9% | +2 | +2 | 0 | +2 | 1 | 3 · 3 su 6 |
| 10% | −1 | −1 | 0 | −2 | 1 | 0 · 0 su 6 |
| 12% | 0 | 0 | 0 | 0 | 0 | 0 · 0 su 6 |
| 15% | 0 | 0 | 0 | 0 | 0 | 0 · 0 su 6 |

### Leva 5x · 10 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +608 | +372 | +237 | +337 | — | — |
| 4% | −115 | −82 | −33 | +9 | 36 | 1 · 1 su 6 |
| 5% | −28 | +4 | −32 | +30 | 24 | 3 · 3 su 6 |
| 6% | −42 | +5 | −48 | +10 | 19 | 3 · 3 su 6 |
| 7% | +22 | +33 | −11 | +41 | 15 | 4 · 3 su 6 |
| 8% | +54 | +73 | −19 | +20 | 11 | 5 · 5 su 6 |
| 9% | +47 | +67 | −19 | +18 | 8 | 5 · 5 su 6 |
| 10% | +22 | +48 | −26 | +10 | 7 | 5 · 5 su 6 |
| 12% | +11 | +31 | −20 | +8 | 5 | 4 · 4 su 6 |
| 15% | −11 | +14 | −25 | −9 | 3 | 3 · 3 su 6 |

### Leva 5x · 8 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +560 | +295 | +265 | +307 | — | — |
| 4% | −89 | −66 | −24 | +28 | 33 | 1 · 1 su 6 |
| 5% | −25 | +8 | −33 | +24 | 23 | 3 · 3 su 6 |
| 6% | +21 | +32 | −11 | +36 | 15 | 4 · 4 su 6 |
| 7% | −9 | +12 | −21 | +21 | 11 | 3 · 3 su 6 |
| 8% | +22 | +45 | −23 | +11 | 9 | 4 · 4 su 6 |
| 9% | −1 | +29 | −30 | −3 | 8 | 3 · 3 su 6 |
| 10% | −12 | +24 | −36 | −13 | 6 | 3 · 3 su 6 |
| 12% | −18 | +13 | −31 | −19 | 3 | 3 · 3 su 6 |
| 15% | +3 | +3 | 0 | +3 | 1 | 3 · 3 su 6 |

### Leva 7x · 10 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +840 | +513 | +327 | +460 | — | — |
| 4% | −331 | −194 | −139 | −108 | 51 | 1 · 1 su 6 |
| 5% | −198 | −128 | −70 | −1 | 40 | 2 · 2 su 6 |
| 6% | −171 | −143 | −29 | +31 | 35 | 1 · 1 su 6 |
| 7% | −36 | +9 | −45 | +47 | 24 | 3 · 3 su 6 |
| 8% | −94 | −22 | −72 | +15 | 22 | 3 · 2 su 6 |
| 9% | −3 | +2 | −5 | +77 | 16 | 3 · 3 su 6 |
| 10% | +109 | +127 | −18 | +60 | 13 | 5 · 5 su 6 |
| 12% | +70 | +102 | −32 | +27 | 9 | 5 · 5 su 6 |
| 15% | +31 | +50 | −19 | +25 | 6 | 5 · 5 su 6 |

### Leva 7x · 8 posizioni

| Freno | Tutto | Mar–ago | Set–6 nov | Dal 1° agosto | Scatti (tutto) | Finestre di 3 mesi in cui fa meglio (composto · fisso) |
|---|---|---|---|---|---|---|
| spento (USDT) | +798 | +455 | +343 | +412 | — | — |
| 4% | −234 | −161 | −72 | −9 | 48 | 1 · 1 su 6 |
| 5% | −228 | −124 | −103 | −35 | 38 | 0 · 0 su 6 |
| 6% | −159 | −123 | −36 | +34 | 31 | 1 · 1 su 6 |
| 7% | −71 | −26 | −46 | +37 | 23 | 2 · 2 su 6 |
| 8% | −2 | +18 | −20 | +53 | 17 | 3 · 3 su 6 |
| 9% | +80 | +100 | −20 | +42 | 11 | 5 · 5 su 6 |
| 10% | +53 | +82 | −29 | +29 | 9 | 4 · 4 su 6 |
| 12% | +8 | +49 | −42 | +6 | 8 | 4 · 4 su 6 |
| 15% | −9 | +26 | −36 | −7 | 5 | 3 · 3 su 6 |

Finestre mobili di 3 mesi: apr–giu, mag–lug, giu–ago, lug–set, ago–ott, set–6 nov. "Fa meglio" = risultato più alto del freno spento nella stessa finestra.

## I giorni in cui scatta

Per ogni giorno in cui il freno è scattato si confronta il risultato di quel giorno con il freno e quello che avrebbe avuto senza freno a fine giornata. Tutto il periodo, slittamento 0,05%, dimensione fissa: fino allo scatto i trade sono gli stessi. Il % è sui 300 USDT di capitale.

- **Ha evitato una perdita più grande:** senza freno il giorno sarebbe finito peggio.
- **Ha tolto una ripresa:** senza freno il giorno sarebbe finito meglio, perché il mercato è tornato su.

### 10 posizioni al giorno

| Freno | 3x: scatti · evitate · riprese tolte · saldo netto | 5x: scatti · evitate · riprese tolte · saldo netto | 7x: scatti · evitate · riprese tolte · saldo netto |
|---|---|---|---|
| 4% | 15 · 8 (+66) · 7 (−45) · **+20 USDT (+6,8%)** | 36 · 15 (+184) · 20 (−299) · **−115 USDT (−38,4%)** | 51 · 21 (+334) · 30 (−665) · **−331 USDT (−110,5%)** |
| 5% | 9 · 6 (+45) · 3 (−13) · **+32 USDT (+10,7%)** | 24 · 12 (+148) · 12 (−176) · **−28 USDT (−9,3%)** | 40 · 16 (+273) · 24 (−471) · **−198 USDT (−65,9%)** |
| 6% | 7 · 4 (+29) · 3 (−16) · **+13 USDT (+4,4%)** | 19 · 8 (+124) · 11 (−167) · **−42 USDT (−14,1%)** | 35 · 15 (+242) · 19 (−414) · **−171 USDT (−57,1%)** |
| 7% | 6 · 3 (+20) · 3 (−15) · **+5 USDT (+1,6%)** | 15 · 8 (+107) · 7 (−85) · **+22 USDT (+7,3%)** | 24 · 12 (+207) · 12 (−243) · **−36 USDT (−11,9%)** |
| 8% | 5 · 2 (+13) · 3 (−17) · **−3 USDT (−1,2%)** | 11 · 6 (+80) · 5 (−27) · **+54 USDT (+17,8%)** | 22 · 8 (+181) · 14 (−275) · **−94 USDT (−31,3%)** |
| 9% | 3 · 2 (+9) · 1 (−15) · **−7 USDT (−2,2%)** | 8 · 6 (+67) · 2 (−19) · **+47 USDT (+15,8%)** | 16 · 8 (+156) · 8 (−159) · **−3 USDT (−0,9%)** |
| 10% | 3 · 1 (+6) · 2 (−20) · **−14 USDT (−4,7%)** | 7 · 4 (+48) · 3 (−26) · **+22 USDT (+7,3%)** | 13 · 8 (+145) · 5 (−36) · **+109 USDT (+36,4%)** |
| 12% | 1 · 1 (+0) · 0 (0) · **+0 USDT (+0,1%)** | 5 · 3 (+32) · 2 (−21) · **+11 USDT (+3,6%)** | 9 · 6 (+102) · 3 (−32) · **+70 USDT (+23,4%)** |
| 15% | mai | 3 · 2 (+14) · 1 (−25) · **−11 USDT (−3,7%)** | 6 · 4 (+52) · 2 (−21) · **+31 USDT (+10,3%)** |

### 8 posizioni al giorno

| Freno | 3x: scatti · evitate · riprese tolte · saldo netto | 5x: scatti · evitate · riprese tolte · saldo netto | 7x: scatti · evitate · riprese tolte · saldo netto |
|---|---|---|---|
| 4% | 12 · 7 (+41) · 5 (−40) · **+2 USDT (+0,5%)** | 33 · 16 (+153) · 17 (−243) · **−89 USDT (−29,8%)** | 48 · 17 (+262) · 31 (−496) · **−234 USDT (−77,9%)** |
| 5% | 8 · 4 (+26) · 4 (−17) · **+9 USDT (+3,0%)** | 23 · 13 (+108) · 10 (−133) · **−25 USDT (−8,3%)** | 38 · 15 (+221) · 23 (−449) · **−228 USDT (−75,9%)** |
| 6% | 6 · 3 (+15) · 3 (−22) · **−7 USDT (−2,4%)** | 15 · 9 (+88) · 5 (−66) · **+21 USDT (+7,1%)** | 31 · 14 (+195) · 17 (−354) · **−159 USDT (−53,1%)** |
| 7% | 3 · 2 (+8) · 1 (−18) · **−10 USDT (−3,4%)** | 11 · 6 (+65) · 5 (−74) · **−9 USDT (−2,9%)** | 23 · 12 (+152) · 11 (−223) · **−71 USDT (−23,8%)** |
| 8% | 3 · 2 (+5) · 1 (−21) · **−17 USDT (−5,6%)** | 9 · 4 (+50) · 5 (−28) · **+22 USDT (+7,4%)** | 17 · 9 (+131) · 7 (−133) · **−2 USDT (−0,7%)** |
| 9% | 1 · 1 (+2) · 0 (0) · **+2 USDT (+0,6%)** | 8 · 4 (+38) · 4 (−39) · **−1 USDT (−0,4%)** | 11 · 8 (+105) · 3 (−25) · **+80 USDT (+26,7%)** |
| 10% | 1 · 0 (0) · 1 (−1) · **−1 USDT (−0,5%)** | 6 · 3 (+24) · 3 (−36) · **−12 USDT (−4,0%)** | 9 · 6 (+84) · 3 (−31) · **+53 USDT (+17,6%)** |
| 12% | mai | 3 · 2 (+13) · 1 (−31) · **−18 USDT (−5,9%)** | 8 · 4 (+59) · 4 (−52) · **+8 USDT (+2,5%)** |
| 15% | mai | 1 · 1 (+3) · 0 (0) · **+3 USDT (+0,9%)** | 5 · 3 (+29) · 2 (−38) · **−9 USDT (−3,1%)** |

Esempio, leva 5x con 10 posizioni e freno all'8%, giorno per giorno:

| Giorno | Con il freno | Senza freno | Differenza |
|---|---|---|---|
| 01.06.2026 | −27,3 USDT | −35,8 USDT | +8,4 |
| 04.06.2026 | −25,8 USDT | −37,7 USDT | +11,9 |
| 30.06.2026 | −27,4 USDT | −32,7 USDT | +5,3 |
| 09.07.2026 | −25,5 USDT | −18,3 USDT | −7,2 |
| 31.07.2026 | −25,9 USDT | −47,6 USDT | +21,7 |
| 03.08.2026 | −32,4 USDT | −61,2 USDT | +28,9 |
| 18.08.2026 | −25,8 USDT | −29,7 USDT | +3,9 |
| 13.10.2026 | −24,3 USDT | −24,0 USDT | −0,3 |
| 21.10.2026 | −32,2 USDT | −22,4 USDT | −9,9 |
| 23.10.2026 | −26,3 USDT | −19,3 USDT | −6,9 |
| 03.11.2026 | −25,1 USDT | −22,8 USDT | −2,3 |

## Con slittamento 0,08%

Differenza in USDT rispetto al freno spento, dimensione fissa:

| Freno | 3x 10 pos: tutto · mar–ago · set–nov | 3x 8 pos: tutto · mar–ago · set–nov | 5x 10 pos: tutto · mar–ago · set–nov | 5x 8 pos: tutto · mar–ago · set–nov | 7x 10 pos: tutto · mar–ago · set–nov | 7x 8 pos: tutto · mar–ago · set–nov |
|---|---|---|---|---|---|---|
| 4% | +3 · −2 · +5 | +6 · +14 · −8 | −148 · −95 · −53 | −85 · −66 · −19 | −332 · −208 · −126 | −231 · −139 · −93 |
| 5% | +38 · +45 · −8 | +10 · +23 · −14 | −125 · −81 · −44 | −8 · +17 · −25 | −257 · −137 · −120 | −235 · −145 · −90 |
| 6% | +18 · +29 · −11 | −7 · +15 · −22 | −57 · +12 · −69 | +21 · +31 · −10 | −207 · −128 · −79 | −190 · −134 · −56 |
| 7% | +5 · +17 · −12 | −11 · +8 · −18 | +35 · +36 · −1 | −2 · +12 · −14 | −171 · −110 · −61 | −81 · −15 · −66 |
| 8% | −2 · +10 · −12 | −17 · +5 · −21 | +74 · +82 · −9 | +22 · +45 · −23 | −98 · −13 · −84 | −75 · −31 · −44 |
| 9% | −5 · +10 · −15 | +2 · +2 · 0 | +55 · +67 · −12 | −1 · +28 · −30 | −52 · +10 · −63 | +44 · +94 · −51 |
| 10% | −14 · +4 · −18 | −1 · −1 · 0 | +31 · +49 · −18 | −12 · +24 · −36 | +47 · +51 · −4 | +53 · +81 · −28 |
| 12% | +1 · +1 · 0 | 0 · 0 · 0 | +10 · +30 · −20 | −18 · +13 · −31 | +88 · +106 · −19 | +19 · +52 · −33 |
| 15% | 0 · 0 · 0 | 0 · 0 · 0 | −9 · +17 · −25 | +3 · +3 · 0 | +40 · +58 · −19 | −8 · +28 · −36 |

Risultato con interesse composto, tutto il periodo, slittamento 0,08%:

| Freno | 3x 10 pos | 3x 8 pos | 5x 10 pos | 5x 8 pos | 7x 10 pos | 7x 8 pos |
|---|---|---|---|---|---|---|
| spento | +133% · −24% | +126% · −23% | +273% · −38% | +262% · −36% | +434% · −50% | +467% · −47% |
| 4% | +139% · −20% | +132% · −17% | +139% · −43% | +183% · −31% | +101% · −55% | +188% · −48% |
| 5% | +167% · −19% | +134% · −16% | +156% · −39% | +265% · −24% | +153% · −53% | +178% · −45% |
| 6% | +149% · −21% | +121% · −19% | +221% · −29% | +300% · −28% | +195% · −53% | +221% · −45% |
| 7% | +141% · −22% | +118% · −20% | +337% · −30% | +268% · −28% | +228% · −50% | +362% · −36% |
| 8% | +132% · −24% | +113% · −21% | +394% · −30% | +296% · −25% | +319% · −44% | +368% · −41% |
| 9% | +129% · −23% | +127% · −22% | +361% · −32% | +263% · −28% | +389% · −41% | +588% · −33% |
| 10% | +122% · −23% | +125% · −23% | +321% · −33% | +249% · −31% | +580% · −40% | +606% · −34% |
| 12% | +133% · −24% | +126% · −23% | +290% · −36% | +240% · −32% | +663% · −40% | +520% · −36% |
| 15% | +133% · −24% | +126% · −23% | +262% · −35% | +267% · −35% | +533% · −44% | +457% · −42% |

## Verifiche sul funzionamento del freno

- **Nessun dato futuro:** il freno decide alla chiusura di ogni minuto, con i trade già chiusi e le posizioni aperte valutate all'ultima chiusura nota di ogni titolo. Controllo automatico su 10 scatti (5x, 10 posizioni, freno 5%, dimensione fissa, agosto–novembre): in tutti, la perdita ricalcolata usando solo le candele chiuse fino a quel minuto è identica a quella del motore.
- **Prezzo di chiusura realistico:** prima di questo test il motore chiudeva al prezzo di chiusura dello stesso minuto in cui il freno scattava, che dal vivo non si può ottenere. **Ora chiude all'apertura della candela successiva di ogni titolo, più lo slittamento contro**, come farebbe il controllo ogni minuto. Controllo automatico: per tutte le 67 posizioni chiuse dal freno nel test di verifica il prezzo coincide con questa regola.
- **Capitale di riferimento:** anche questo è stato corretto prima del test.
  - La soglia in % si calcola sul capitale usato a inizio giornata: il saldo con "% saldo", la cifra con "Cifra".
  - Prima era sempre il saldo della simulazione: a dimensione fissa il freno scattava in modo diverso man mano che il saldo cresceva.
  - Vale anche per il limite giornaliero.
- **Perdita delle posizioni aperte:** è calcolata senza le commissioni d'uscita, come in Prova e nel Reale. Il freno quindi scatta un soffio più tardi di quanto direbbe il risultato netto.
- **Nota:** i numeri di `docs/freno-e-scelta.md` erano stati calcolati con il prezzo di chiusura e il riferimento precedenti, quindi erano un po' più favorevoli al freno. Questo documento li sostituisce per il freno.
