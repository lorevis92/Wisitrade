# Gap d'apertura: si chiudono? Servono alla strategia?

Ricerca. L'app non è cambiata.

## In breve

- **Il gap si chiude tanto spesso quanto si allarga.** Dalle 9:29 in poi il perpetual torna verso la chiusura di ieri con la stessa frequenza con cui si allontana della stessa distanza. Vale per tutte le grandezze di gap, gap in su e in giù, giorni con e senza trimestrale. Alle 10:00 e alle 16:00 il prezzo è oltre il livello delle 9:29 circa una volta su due.
- **Una strategia che punta sulla chiusura del gap non guadagna.** Ho provato 1.920 regole: senza costi la media è +0,09% per trade, con i costi di Bitunix diventa negativa. Una sola zona resta positiva anche sul 30%: gap oltre 2 unità, senza trimestrale, stop stretto, sui 115 titoli. Ha però pochi casi, dipende da pochi titoli e sui 32 operabili perde. Non è da usare.
- **Strategia attuale: i segnali contro il gap non sono una trappola chiara.**
  - Contro i gap oltre 2 unità i trade vanno male sui 115 titoli, in tutti e due i periodi, ma sono pochi (84 casi diversi). Sui 32 operabili il risultato cambia segno tra i due periodi.
  - La regola scelta sul 70% è «salta i segnali contro i gap oltre 3 unità». Sul 30% cambia di 2–3 punti sui 115 titoli e niente sui 32. **Non conviene cambiare la strategia.**

## Dati e metodo

- **Chiusura vera delle 16:00:** Yahoo Finance, candele giornaliere gratuite.
  - Controllo: la chiusura di Yahoo e il perpetual alle 15:59 differiscono in mediana dello 0,12%. Solo lo 0,2% dei casi supera l'1%, e tutti i 115 titoli corrispondono.
- **Perpetual:** archivio Bitunix da 1 minuto, dal 13 marzo al 10 novembre 2026: 168 giorni, 11.865 titoli-giorno.
- **Gap:** prezzo del perpetual alle 9:29:00 (chiusura della candela delle 9:28) diviso la chiusura di ieri, meno 1.
  - Mediana del gap in valore assoluto: 1,23%; il 10% dei casi supera il 4,4%.
- **Unità di volatilità:** variazione media giornaliera, in valore assoluto, degli ultimi 20 giorni. Usa solo i giorni prima, con almeno 10 giorni di storia.
  - Mediana del gap: 0,48 unità; il 10% dei casi supera 1,36 unità.
- **Trimestrali:** calendario Nasdaq, gratuito, con 180 titoli-giorno di trimestrale.
  - Nasdaq quasi mai dice se l'annuncio è prima dell'apertura o dopo la chiusura. Tra il giorno dell'annuncio e il giorno dopo ho preso quello con il gap più grande, al posto dell'ora dell'annuncio, che dal vivo si sa.
- **Divisione 70/30:** primo 70% dal 13 marzo al 28 agosto (117 giorni), ultimo 30% dal 31 agosto al 10 novembre (51 giorni). Le regole si scelgono sul primo periodo e si guardano sul secondo.
  - Il secondo periodo ha più gap grandi del primo. Per esempio, sopra 2 unità ci sono 159 casi nel primo e 231 nel secondo.
- **Mai dati futuri:** il gap è noto alle 9:29 e le entrate sono dalle 9:30 in poi.

**Una cosa da chiarire sulla premessa.** Il perpetual alle 9:29 il gap ce l'ha già dentro, perché ha scambiato tutta la notte. Alle 9:30 non c'è un salto: l'apertura delle 9:30 è in mediana allo 0,1% del gap dal prezzo delle 9:29. Il gap «non si vede» solo per le soglie della strategia, che partono dall'apertura delle 9:30 del perpetual.

## 1. Come si comportano i gap

«Metà» e «tutto» sono le parti del gap chiuse verso la chiusura di ieri, partendo dal prezzo delle 9:29. «Continua prima» vuol dire che il prezzo si allontana di un altro mezzo gap prima di chiuderne metà.

**115 titoli, per grandezza del gap in unità di volatilità:**

| Gap | Casi | Metà entro 15 min | Metà entro 30 min | Metà entro le 16 | Minuti per metà (mediana) | Tutto entro 30 min | Tutto entro le 16 | Continua prima | Oltre le 9:29 alle 10:00 | Oltre le 9:29 alle 16:00 |
|---|---|---|---|---|---|---|---|---|---|---|
| sotto 0,25 | 3.320 | 82% | 84% | 90% | 0 | 76% | 85% | 33% | 48% | 49% |
| 0,25–0,5 | 2.865 | 66% | 71% | 80% | 1 | 50% | 66% | 46% | 47% | 50% |
| 0,5–1 | 3.489 | 46% | 53% | 68% | 5 | 25% | 45% | 48% | 48% | 50% |
| 1–2 | 1.800 | 26% | 32% | 51% | 14 | 8% | 21% | 42% | 48% | 50% |
| oltre 2 | 391 | 12% | 16% | 30% | 25 | 1% | 6% | 26% | 42% | 45% |

I gap piccoli si chiudono subito perché sono più piccoli del movimento normale di un minuto. Più il gap è grande, meno spesso si chiude.

**Il confronto che conta: chiudere contro allungare della stessa distanza.**

| Gap (unità) | Casi | Chiude metà entro 30 min | Si allunga di metà entro 30 min | Chiude metà entro le 16 | Si allunga di metà entro le 16 | Chiude tutto entro le 16 | Si allunga di tutto entro le 16 | Arriva prima: chiusura / allungamento |
|---|---|---|---|---|---|---|---|---|
| 0,5–1 | 3.489 | 53% | 51% | 68% | 67% | 45% | 45% | 51% / 49% |
| 1–2 | 1.800 | 32% | 30% | 51% | 49% | 21% | 23% | 52% / 48% |
| oltre 2 | 391 | 16% | 13% | 30% | 27% | 6% | 8% | 52% / 48% |
| oltre 2, senza trimestrale | 305 | 14% | 12% | 30% | 26% | 6% | 8% | 53% / 47% |
| oltre 2, con trimestrale | 86 | 22% | 17% | 33% | 30% | 8% | 9% | 48% / 52% |
| 32 operabili, oltre 1 | 868 | 25% | 28% | 43% | 46% | 15% | 19% | 48% / 52% |

Le due colonne di ogni coppia sono quasi uguali. **Dalle 9:29 il perpetual non ha una tendenza a chiudere il gap:** si muove come se il gap non ci fosse.

**Gap oltre 0,5 unità, 115 titoli, per gruppo:**

| Gruppo | Casi | Metà entro 30 min | Metà entro le 16 | Tutto entro le 16 | Continua prima | Oltre alle 10:00 | Oltre alle 16:00 |
|---|---|---|---|---|---|---|---|
| gap in su | 3.157 | 44% | 60% | 34% | 45% | 47% | 49% |
| gap in giù | 2.523 | 43% | 61% | 35% | 45% | 48% | 52% |
| con trimestrale | 169 | 42% | 51% | 27% | 34% | 46% | 52% |
| senza trimestrale | 5.511 | 44% | 60% | 35% | 45% | 47% | 50% |
| primo 70% | 2.821 | 44% | 60% | 34% | 44% | 46% | 50% |
| ultimo 30% | 2.859 | 44% | 61% | 34% | 45% | 49% | 50% |

- **Direzione:** nessuna differenza tra gap in su e in giù.
- **Trimestrale:** i gap con trimestrale sono più grandi (mediana 1,9 unità contro 0,5), quindi si chiudono meno spesso. A parità di grandezza, oltre 2 unità, si muovono un po' di più in tutte e due le direzioni, ma non da una parte sola. I casi sono pochi: 86.
- **70/30:** i numeri sono stabili tra i due periodi.
- **32 operabili:** stesso quadro. Per esempio, metà del gap entro 30 minuti nel 51% dei casi tra 0,5 e 1 unità, nel 27% tra 1 e 2, nel 16% oltre 2.

## 2. Strategia di chiusura del gap

**Regola.**
- Gap misurato alle 9:29. Entrata sul perpetual all'apertura delle 9:30, oppure 1 o 5 minuti dopo, nella direzione che chiude il gap.
- Obiettivo: una parte del gap.
- Stop: oltre l'entrata, di una parte del gap.
- Uscita al più tardi dopo un tempo massimo.
- Se nella stessa candela si toccano sia lo stop sia l'obiettivo, vale lo stop.
- Costi: commissione 0,06% per lato più slittamento 0,05% o 0,08% su entrata e uscita, quindi 0,22–0,28% per trade.
- Portafoglio come il Reale: margine 10% del saldo, leva 5, al massimo 10 posizioni. Quando i segnali sono più di 10 si prendono i primi in 10 ordini casuali dei titoli. Fermata al 30% di perdita totale.
- Non si apre se lo stop sarebbe oltre la liquidazione.

**Regole provate:** 1.920 combinazioni.
- gap minimo: 0,5 · 1 · 1,5 · 2 · 3 unità;
- obiettivo: 25 · 50 · 75 · 100% del gap;
- stop: 0,25 · 0,5 · 1 · 2 volte il gap;
- tempo massimo: 5 · 15 · 30 · 60 minuti;
- entrata: 9:30 · 9:31 · 9:35;
- con o senza i giorni di trimestrale.

**Quadro generale, 115 titoli, slittamento 0,05%, risultato medio per trade:**

| Gap minimo | Casi 70% / 30% | Media di tutte le regole, 70% | Media di tutte le regole, 30% | Migliore sul 70% |
|---|---|---|---|---|
| 0,5 | 2.770 / 2.805 | −0,22% | −0,23% | −0,03% |
| 1 | 1.016 / 1.159 | −0,25% | −0,17% | +0,06% |
| 1,5 | 379 / 548 | −0,21% | −0,08% | +0,25% |
| 2 | 159 / 231 | −0,11% | −0,05% | +0,47% |
| 3 | 51 / 66 | −0,18% | +0,07% | +0,57% |

Senza costi la media di tutte le regole è +0,09% per trade. Il margine c'è, ma è meno della metà dei costi di un'entrata e un'uscita.

**Migliore regola scelta sul 70%, poi verificata sul 30%:**

| Caso | Regola migliore sul 70% | 70%: trade · per trade · vincenti | 30%: trade · per trade · vincenti | Portafoglio 70% → 30% | Delle 20 migliori sul 70%, positive sul 30% |
|---|---|---|---|---|---|
| 115 · 0,05% | gap ≥ 2, senza trimestrale, obiettivo 100%, stop 0,25 gap, 60 min, entrata 9:30 | 118 · +0,55% · 56% | 187 · +0,23% · 44% | +25% → +19% | 14 |
| 115 · 0,08% | la stessa | 118 · +0,49% · 55% | 187 · +0,17% · 44% | +21% → +14% | 8 |
| 32 · 0,05% | gap ≥ 1,5, obiettivo 100%, stop 0,25 gap, 60 min, entrata 9:30 | 187 · +0,23% · 45% | 182 · −0,09% · 35% | +13% → −4% | **0** |
| 32 · 0,08% | la stessa | 187 · +0,17% · 44% | 182 · −0,15% · 34% | +7% → −9% | **0** |

**Perché la regola dei 115 titoli non basta, anche se resta positiva sul 30%:**
- **Pochi casi:** 118 trade in 117 giorni per trovarla, circa uno al giorno.
- **È fragile:**
  - tenendo anche i giorni di trimestrale scende a +0,05% sul 30%;
  - con 30 minuti invece di 60 scende a +0,07%;
  - con lo slittamento a 0,08% a +0,17%.
- **Dipende da pochi titoli:** NBIS, DRAM, BNC, SNDK, WDC e CRCL portano più di metà del guadagno di tutto il periodo.
- **Varia di mese in mese:** settembre +0,68%, ottobre −0,19%, novembre +0,51%.
- **Sui 32 operabili**, gli unici che Prova e Reale possono usare, la regola scelta sul loro 70% perde sul 30%, e nessuna delle 20 migliori resta positiva.
- **I costi veri del Reale sono più alti:** entrata veloce −0,12%, uscite dell'app −0,10/−0,13% (`docs/be-e-prova-realistica.md`). È più del caso 0,08%.
- **Troppe prove:** con 1.436 regole che hanno almeno 100 casi, la migliore sul 70% può sembrare buona anche solo per caso. Che sui 32 non ne regga nessuna lo conferma.

## 3. Strategia attuale: segnali a favore e contro il gap

**Prova.**
- Configurazione del Reale, con le uscite dell'app sulla chiusura del minuto (`docs/percorso-candela.md`), 10 ordini casuali dei titoli.
- Un segnale è **a favore** se va nel verso del gap (long con gap in su) e **contro** se va nel verso opposto.
- Media per trade; tra parentesi i trade per ordine.

**Tutti i segnali:**

| Caso | A favore 70% | Contro 70% | A favore 30% | Contro 30% |
|---|---|---|---|---|
| 115 · 0,05% | +0,22% (526) | +0,26% (460) | +0,39% (273) | −0,22% (237) |
| 32 · 0,05% | +0,17% (550) | +0,00% (404) | +0,32% (300) | +0,02% (197) |

Con slittamento 0,08% tutti i valori sono circa 0,05–0,10 punti più bassi, con le stesse differenze.

**Per grandezza del gap (slittamento 0,05%):**

| Gap (unità) | 115: a favore 70% | 115: contro 70% | 115: a favore 30% | 115: contro 30% | 32: a favore 70% | 32: contro 70% | 32: a favore 30% | 32: contro 30% |
|---|---|---|---|---|---|---|---|---|
| sotto 0,25 | +0,10 (128) | +0,16 (145) | +0,45 (53) | −0,19 (76) | −0,02 (145) | +0,11 (144) | +0,14 (67) | +0,26 (63) |
| 0,25–0,5 | +0,41 (132) | +0,60 (69) | +0,38 (61) | −0,25 (29) | +0,44 (124) | −0,23 (61) | −0,02 (70) | −0,24 (29) |
| 0,5–1 | +0,01 (150) | +0,36 (128) | +0,65 (87) | −0,50 (65) | +0,15 (168) | +0,12 (110) | +0,69 (88) | −0,74 (48) |
| 1–2 | +0,44 (92) | +0,23 (82) | −0,13 (55) | +0,33 (40) | +0,06 (92) | −0,14 (64) | +0,48 (55) | +0,67 (36) |
| oltre 2 | +0,21 (23) | −0,25 (35) | +0,59 (18) | −0,42 (26) | +0,37 (21) | −0,17 (26) | +0,03 (21) | +0,30 (22) |

**Gap oltre 1 unità, per minuto d'entrata (slittamento 0,05%):**

| Minuto | 115: a favore 70% | 115: contro 70% | 115: a favore 30% | 115: contro 30% | 32: a favore 70% | 32: contro 70% | 32: a favore 30% | 32: contro 30% |
|---|---|---|---|---|---|---|---|---|
| 9:30–9:31 | +0,56 (85) | +0,13 (99) | +0,05 (73) | +0,04 (66) | +0,57 (63) | −0,30 (49) | +0,48 (56) | +0,88 (40) |
| 9:32–9:34 | +0,12 (11) | +0,13 (6) | — | — | −0,82 (25) | +0,50 (22) | −0,04 (12) | −0,21 (11) |
| 9:35–9:39 | −0,12 (12) | +0,33 (4) | — | — | −0,03 (18) | +0,09 (8) | +0,07 (5) | −0,38 (5) |
| 9:40–9:59 | −0,17 (8) | −0,52 (8) | — | — | −0,16 (8) | −0,97 (11) | −0,05 (2) | +0,15 (2) |

Con i gap grandi quasi tutti i segnali arrivano nei primi due minuti. Dopo, i casi sono troppo pochi per dire qualcosa.

**Cosa se ne ricava:**
- Contro i gap oltre 2 unità:
  - sui 115 titoli è negativo in tutti e due i periodi (−0,25% e −0,42%);
  - sui 32 operabili cambia segno (−0,17% e +0,30%);
  - in tutto sono 84 casi diversi sui 115 e 50 sui 32.
- Tra 0,5 e 1 unità i segnali contro sono migliori sul 70% e molto peggiori sul 30%: la differenza non è stabile.
- Sui 32 i segnali a favore battono quelli contro in tutti e due i periodi (+0,17 contro +0,00 e +0,32 contro +0,02). Sui 115 succede solo sul 30%.
- **Contro il gap nei giorni di trimestrale** (gap oltre 1 unità) il risultato è negativo in tutti i casi e in tutti e due i periodi: sui 115 −0,30% e −0,68%, sui 32 −0,16% e −0,88%. Sono però solo 7–21 trade per ordine.

**Regola: salta i segnali contro il gap da una certa grandezza in su.**
- Provata su tutta la finestra d'entrata e solo dalle 9:30 alle 9:34; i risultati sono quasi uguali.
- Il posto lasciato libero lo può prendere un altro segnale.
- Risultato del portafoglio, media di 10 ordini, ogni periodo parte da 300 USDT.

| Caso | Regola | 70%: risultato · per trade | 30%: risultato · per trade |
|---|---|---|---|
| 115 · 0,05% | attuale | +191% · +0,24 | +24% · +0,11 |
| | contro il gap ≥ 0,5 unità | +114% · +0,19 | +51% · +0,19 |
| | ≥ 1 | +173% · +0,23 | +32% · +0,13 |
| | ≥ 2 | +199% · +0,25 | +31% · +0,13 |
| | **≥ 3 (la migliore sul 70%)** | **+207% · +0,25** | **+27% · +0,12** |
| 115 · 0,08% | attuale | +119% · +0,18 | +4% · +0,04 |
| | ≥ 0,5 | +64% · +0,13 | +33% · +0,14 |
| | ≥ 2 | +127% · +0,19 | +12% · +0,07 |
| | **≥ 3 (la migliore sul 70%)** | **+133% · +0,19** | **+7% · +0,05** |
| 32 · 0,05% | attuale | +44% · +0,09 | +57% · +0,20 |
| | ≥ 0,5 | +48% · +0,11 | +55% · +0,22 |
| | ≥ 2 | +42% · +0,09 | +55% · +0,20 |
| | **≥ 3 (la migliore sul 70%)** | **+56% · +0,11** | **+57% · +0,20** |
| 32 · 0,08% | attuale | +12% · +0,04 | +33% · +0,13 |
| | ≥ 0,5 | +14% · +0,05 | +30% · +0,14 |
| | ≥ 2 | +11% · +0,04 | +30% · +0,13 |
| | **≥ 3 (la migliore sul 70%)** | **+21% · +0,06** | **+33% · +0,13** |

- **La regola scelta sul 70%** («salta i segnali contro i gap oltre 3 unità», in tutti e quattro i casi) migliora il 30% di 2–3 punti sui 115 titoli e non cambia niente sui 32. Riguarda 33 casi diversi sui 115 e 21 sui 32 in otto mesi: **troppo pochi.**
- **«Contro il gap ≥ 0,5 unità»** sarebbe la migliore sul 30% dei 115, ma è la peggiore sul 70%. Sceglierla vorrebbe dire guardare il risultato. Sui 32 non cambia niente.

## Conclusione

1. **Il perpetual alle 9:29 contiene già il gap, e da lì non tende a chiuderlo.** Il prezzo torna verso la chiusura di ieri tanto spesso quanto si allontana della stessa distanza, per tutte le grandezze, le direzioni e con o senza trimestrale. Il risultato è uguale sul primo 70% e sull'ultimo 30%. I casi bastano: quasi 12.000 titoli-giorno, quasi 5.700 sopra mezza unità.
2. **Una strategia di chiusura del gap non è da fare.** In media le regole perdono quanto costano i trade. L'unica zona positiva su tutti e due i periodi si regge su circa un trade al giorno e su pochi titoli, e sui 32 operabili perde. Con i costi veri del Reale andrebbe peggio.
3. **La strategia attuale non va cambiata per il gap.** I segnali contro i gap grandi vanno un po' peggio sui 115 titoli, ma i casi sono pochi e sui 32 operabili il segno cambia. La regola scelta sul 70% non dà quasi niente sul 30%.
4. **Da tenere d'occhio:** i segnali contro il gap nei giorni di trimestrale sono negativi ovunque, ma sono pochissimi. Il confronto serale (`docs/dati-dal-vivo.md`) salva già ogni segnale. Con qualche mese in più di dati dal vivo e d'archivio si può rifare la prova su questi soli casi, aggiungendo il gap alle 9:29.

## File della ricerca

Sono sul PC, nella cartella temporanea della ricerca (`scratchpad/gap`), e non sono su Supabase:
- script: `gdata.mjs` (gap), `part1.mjs` e `mirror.mjs` (comportamento), `part2.mjs` (chiusura del gap), `part3.mjs` e `p3an.mjs` (strategia attuale);
- dati scaricati: chiusure di Yahoo e calendario Nasdaq, meno di 2 MB.
