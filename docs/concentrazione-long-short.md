# Concentrazione delle posizioni: long e short separati

Seguito di `docs/concentrazione.md`. **Domanda:** il problema dei giorni concentrati sta più dal lato short o dal lato long? Un limite solo su un lato regge?

**Risposta breve: no, sul 30% non regge niente.**
- **Il rischio sta dal lato short, ma solo nei giorni peggiori.**
  - Nei giorni con l'80% o più di short il freno scatta più spesso, in proporzione, che negli altri giorni. Con i 32 operabili nel 70% scatta nel 13% dei giorni short, contro lo 0–1% degli altri.
  - In tre casi su quattro il giorno peggiore del periodo è un giorno short.
  - In media però sono tra i giorni migliori della strategia, da +1,3% a +3,1% al giorno.
  - I giorni concentrati in long non arrivano quasi mai al freno.
- **Per trade, i short non sbagliano più dei long.** Il risultato medio è migliore in tre casi su quattro, con una quota di vincenti uguale o più alta. In tutti e due i lati i trade migliori sono quasi sempre quelli dei giorni concentrati dalla loro parte.
- **Nessun limite asimmetrico è migliore della strategia attuale in tutti e quattro i casi del primo 70%.**
  - I tre che vanno meglio nel 70% (al massimo 5 short; short al massimo 2 o 3 per settore) migliorano solo con i 32 operabili.
  - Nel 30% con i 32 operabili, cioè proprio il Reale, perdono tutti e tre: da +41% a +19–31%.
- **L'unico limite che va meglio in tutti e quattro i casi del 30% non sarebbe mai stato scelto.** È "short: al massimo 2 correlati ≥ 0,5", che nel primo 70% perde 113 punti con 115 titoli e 13 con i 32.

**Raccomandazione:** non aggiungere limiti, né sui short né sui long.

Solo ricerca: l'app non è cambiata.

## Come

Tutto come in `docs/concentrazione.md`:
- **Motore:** una copia del motore con il gancio a ogni entrata. Se il limite è pieno, il segnale viene scartato e il posto resta libero per i segnali successivi.
- **Configurazione del Reale:** 300 USDT con interesse composto, 5x, margine 10%, 10 posizioni, freno 8%, limiti 10% e 30%, commissione 0,06%, funding 0,01%.
- **Titoli:** 115 e 32 operabili.
- **Slittamento:** 0,05% e 0,08%.
- **Ordini:** media di 10 ordini casuali.
- **Periodo:** dal 13 marzo al 10 novembre 2026.
  - Primo 70% fino al 28 agosto, ultimo 30% dal 31 agosto.
  - Le due parti sono simulate separatamente.
- **Settori:** gli stessi 12 gruppi del documento di prima.
- **Correlazione:** calcolata sui 10 giorni di borsa precedenti, mai sul giorno stesso.
- **Come si contano le posizioni:** quelle prese oggi, anche se già chiuse.

## 1. I giorni, separati per lato

- Giorni con almeno 5 trade, strategia attuale, slittamento 0,05%.
- "Long" = 80% o più dei trade del giorno in long; "short" = 80% o più in short; "misto" = gli altri.
- **Giorno peggiore** = il peggiore su tutti i giorni dei 10 ordini.

| Gruppo | Tipo di giorno | Quota dei giorni | Risultato medio | Giorni in perdita | Freno scattato | Giorno peggiore |
|---|---|---|---|---|---|---|
| 115, 70% | long | 14% | +3,66% | 19% | 0% | −3,6% |
| 115, 70% | **short** | 19% | +3,11% | 25% | **7%** | **−12,5%** |
| 115, 70% | misto | 67% | +0,17% | 46% | 7% | −11,7% |
| 115, 30% | long | 13% | +0,77% | 48% | 9% | −9,5% |
| 115, 30% | **short** | 19% | +2,23% | 21% | **10%** | −8,9% |
| 115, 30% | misto | 69% | +0,46% | 38% | 9% | −10,1% |
| 32, 70% | long | 19% | +0,48% | 47% | 0% | −6,9% |
| 32, 70% | **short** | 16% | +1,28% | 31% | **13%** | **−10,1%** |
| 32, 70% | misto | 65% | +0,25% | 45% | 1% | −8,7% |
| 32, 30% | long | 12% | +2,53% | 48% | 0% | −2,6% |
| 32, 30% | **short** | 12% | +2,18% | 18% | 2% | **−10,6%** |
| 32, 30% | misto | 75% | +0,25% | 44% | 5% | −9,8% |

Con slittamento 0,08% i numeri sono simili, un po' più bassi. Per esempio i giorni short con i 32 operabili fanno +0,99% nel 70% e +1,72% nel 30%.

**Cosa dice:**
- **I giorni concentrati, long o short, vanno in media molto meglio dei giorni misti.** I giorni misti sono i due terzi del totale e fanno quasi zero.
- **I giorni short concentrati sono raramente in perdita** (18–31%, contro il 38–49% degli altri). Quando lo sono, però, sono i più pesanti.
  - Con i 32 operabili il freno scatta nel 13% dei giorni short del 70%, contro lo 0% dei giorni long e l'1% dei misti.
  - Il giorno peggiore di tre casi su quattro è un giorno short; il 10 novembre è il −10,6% dei 32 nel 30%.
- **I giorni long concentrati quasi non hanno code**: il freno non scatta mai, tranne con 115 titoli nel 30%. Però con i 32 operabili sono in perdita quasi una volta su due, anche se di poco.
- **In breve:** i giorni short sono come un'assicurazione al contrario. Guadagnano spesso e bene, ma ogni tanto hanno una perdita grossa, quando il settore rimbalza tutto insieme. Il freno la ferma intorno al −9/−10%.

## 2. I trade, separati per lato

Per ogni trade si guarda il giorno in cui è stato preso (giorni con almeno 5 trade):
- **concentrato dalla sua parte:** 80% o più dei trade del giorno nel suo stesso lato;
- **misto:** nessun lato arriva all'80%;
- **concentrato dall'altra parte:** il trade va controcorrente rispetto a quasi tutti gli altri.

Slittamento 0,05%. Il risultato è in % del valore della posizione, senza leva. "Trade" è il numero medio per ordine.

| Gruppo | Lato | Giorno | Trade | Risultato medio | Vincenti | Chiusi dallo stop |
|---|---|---|---|---|---|---|
| 115, 70% | long | dalla sua parte | 109 | +0,77% | 79% | 6% |
| 115, 70% | long | misto | 319 | +0,06% | 69% | 13% |
| 115, 70% | long | dall'altra parte | 24 | −1,39% | 47% | 35% |
| 115, 70% | **long, tutti** | | 466 | **+0,16%** | 70% | 12% |
| 115, 70% | short | dalla sua parte | 165 | +0,94% | 81% | 6% |
| 115, 70% | short | misto | 326 | +0,01% | 70% | 12% |
| 115, 70% | short | dall'altra parte | 19 | +1,01% | 81% | 3% |
| 115, 70% | **short, tutti** | | 525 | **+0,37%** | 74% | 10% |
| 115, 30% | long | dalla sua parte | 54 | +0,20% | 71% | 9% |
| 115, 30% | long | misto | 172 | +0,09% | 71% | 15% |
| 115, 30% | long | dall'altra parte | 15 | +0,07% | 72% | 21% |
| 115, 30% | **long, tutti** | | 241 | **+0,11%** | 71% | 14% |
| 115, 30% | short | dalla sua parte | 82 | +0,51% | 79% | 8% |
| 115, 30% | short | misto | 178 | +0,09% | 72% | 12% |
| 115, 30% | short | dall'altra parte | 10 | −0,07% | 72% | 9% |
| 115, 30% | **short, tutti** | | 269 | **+0,21%** | 74% | 11% |
| 32, 70% | long | dalla sua parte | 143 | +0,20% | 76% | 10% |
| 32, 70% | long | misto | 311 | +0,04% | 69% | 13% |
| 32, 70% | long | dall'altra parte | 24 | −0,03% | 66% | 17% |
| 32, 70% | **long, tutti** | | 494 | **+0,09%** | 71% | 12% |
| 32, 70% | short | dalla sua parte | 129 | +0,32% | 78% | 7% |
| 32, 70% | short | misto | 301 | +0,06% | 73% | 14% |
| 32, 70% | short | dall'altra parte | 26 | −0,41% | 65% | 16% |
| 32, 70% | **short, tutti** | | 473 | **+0,13%** | 74% | 12% |
| 32, 30% | long | dalla sua parte | 53 | +0,64% | 81% | 11% |
| 32, 30% | long | misto | 179 | +0,15% | 72% | 10% |
| 32, 30% | long | dall'altra parte | 7 | −0,17% | 68% | 17% |
| 32, 30% | **long, tutti** | | 239 | **+0,25%** | 74% | 10% |
| 32, 30% | short | dalla sua parte | 50 | +0,57% | 82% | 5% |
| 32, 30% | short | misto | 198 | −0,04% | 68% | 8% |
| 32, 30% | short | dall'altra parte | 10 | −0,23% | 68% | 21% |
| 32, 30% | **short, tutti** | | 258 | **+0,07%** | 71% | 9% |

**Cosa dice:**
- **I short non sbagliano più dei long.** Nel 70% vanno meglio in tutti e due i gruppi. Nel 30% vanno meglio con 115 titoli e un po' peggio con i 32 operabili: +0,07% contro +0,25%.
- **In tutti e due i lati i trade migliori sono quasi sempre quelli dei giorni concentrati dalla loro parte:** 71–82% di vincenti e lo stop raramente. Sono proprio i trade che un limite di concentrazione toglierebbe.
- **I trade deboli sono quelli dei giorni misti,** circa zero in media, e quelli controcorrente. Questi ultimi però sono pochi, 7–26 per ordine, e non dipendono dalla concentrazione del loro lato.
- **I short dei giorni misti con i 32 operabili nel 30%** (−0,04%) sono l'unico punto in cui i short vanno peggio dei long nello stesso tipo di giorno. Non è un problema di concentrazione: in quei giorni i short sono pochi.

## 3. Limiti asimmetrici

Il punto 1 mostra che le code stanno dal lato short. Per questo oltre ai limiti per lato ci sono anche limiti per settore e per correlazione solo sugli short.

- **Al massimo K short al giorno, long liberi** (K da 3 a 8).
- **Al massimo K long al giorno, short liberi** (K da 3 a 8).
- **Short, al massimo K per settore** (K da 1 a 4).
- **Short, al massimo K correlati:** un nuovo short viene scartato se ci sono già K short con correlazione almeno r con lui (r 0,5, 0,6 o 0,7; K da 1 a 3).

In tutto sono 25 limiti più la strategia attuale, ognuno in 80 simulazioni.
- Risultato e peggior calo sono la media dei 10 ordini.
- Il giorno peggiore è la media del giorno peggiore di ogni ordine.
- In grassetto i limiti che battono l'attuale con tutti e due gli slittamenti.

**115 titoli, primo 70% (13 marzo – 28 agosto)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +239,2% | +162,1% | −28,5% | −10,2% | 0 |
| al massimo 8 short (long liberi) | +207,9% | +138,2% | −28,1% | −9,7% | 47 |
| al massimo 7 short (long liberi) | +166,9% | +106,8% | −28,4% | −9,8% | 109 |
| al massimo 6 short (long liberi) | +150,6% | +95,2% | −28,4% | −9,6% | 174 |
| al massimo 5 short (long liberi) | +136,4% | +84,4% | −28,8% | −9,6% | 260 |
| al massimo 4 short (long liberi) | +104,8% | +62,5% | −32,5% | −9,6% | 370 |
| al massimo 3 short (long liberi) | +84,6% | +48,2% | −33,0% | −10,2% | 491 |
| al massimo 8 long (short liberi) | +227,8% | +153,4% | −28,5% | −10,2% | 15 |
| al massimo 7 long (short liberi) | +196,4% | +129,7% | −28,7% | −10,2% | 42 |
| al massimo 6 long (short liberi) | +186,2% | +119,7% | −28,5% | −9,9% | 116 |
| al massimo 5 long (short liberi) | +168,4% | +105,4% | −29,4% | −9,9% | 188 |
| al massimo 4 long (short liberi) | +174,3% | +117,3% | −28,5% | −10,3% | 286 |
| al massimo 3 long (short liberi) | +165,2% | +107,5% | −27,7% | −10,2% | 386 |
| short: al massimo 4 per settore | +230,0% | +156,1% | −28,7% | −10,3% | 8 |
| short: al massimo 3 per settore | +236,4% | +160,1% | −27,8% | −10,1% | 28 |
| short: al massimo 2 per settore | +209,8% | +139,4% | −27,1% | −10,1% | 90 |
| short: al massimo 1 per settore | +104,3% | +57,0% | −29,6% | −9,8% | 308 |
| short: al massimo 3 correlati ≥ 0,7 | +237,7% | +162,6% | −27,9% | −10,1% | 4 |
| short: al massimo 2 correlati ≥ 0,7 | +228,1% | +154,0% | −27,8% | −9,8% | 16 |
| short: al massimo 1 correlati ≥ 0,7 | +185,0% | +118,6% | −27,9% | −10,0% | 80 |
| short: al massimo 3 correlati ≥ 0,6 | +218,3% | +147,1% | −27,8% | −10,3% | 29 |
| short: al massimo 2 correlati ≥ 0,6 | +189,4% | +128,1% | −28,4% | −10,2% | 71 |
| short: al massimo 1 correlati ≥ 0,6 | +132,2% | +81,2% | −28,1% | −9,7% | 170 |
| short: al massimo 3 correlati ≥ 0,5 | +171,4% | +113,3% | −28,9% | −10,0% | 87 |
| short: al massimo 2 correlati ≥ 0,5 | +126,3% | +79,8% | −28,8% | −9,6% | 156 |
| short: al massimo 1 correlati ≥ 0,5 | +76,0% | +35,1% | −30,7% | −9,8% | 293 |

**115 titoli, ultimo 30% (31 agosto – 10 novembre)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +44,6% | +24,0% | −24,8% | −9,5% | 0 |
| al massimo 8 short (long liberi) | +41,9% | +22,3% | −25,9% | −9,5% | 24 |
| al massimo 7 short (long liberi) | +39,1% | +18,4% | −25,6% | −9,5% | 66 |
| al massimo 6 short (long liberi) | +33,5% | +15,1% | −26,6% | −9,5% | 107 |
| al massimo 5 short (long liberi) | +31,9% | +14,2% | −26,7% | −9,3% | 166 |
| al massimo 4 short (long liberi) | +24,2% | +8,0% | −29,1% | −9,3% | 248 |
| al massimo 3 short (long liberi) | +16,9% | +1,4% | −30,4% | −9,3% | 334 |
| al massimo 8 long (short liberi) | +41,5% | +21,3% | −25,2% | −9,5% | 10 |
| al massimo 7 long (short liberi) | +39,4% | +19,3% | −24,9% | −9,5% | 35 |
| al massimo 6 long (short liberi) | +36,5% | +16,7% | −26,4% | −9,5% | 74 |
| al massimo 5 long (short liberi) | +35,3% | +15,8% | −25,2% | −9,6% | 124 |
| al massimo 4 long (short liberi) | +33,5% | +14,2% | −24,1% | −9,7% | 186 |
| al massimo 3 long (short liberi) | +21,8% | +2,5% | −23,5% | −9,9% | 267 |
| short: al massimo 4 per settore | +44,5% | +24,2% | −24,9% | −9,5% | 1 |
| short: al massimo 3 per settore | **+47,3%** | +27,9% | −24,5% | −9,5% | 5 |
| short: al massimo 2 per settore | **+53,4%** | +29,8% | −25,5% | −9,3% | 34 |
| short: al massimo 1 per settore | +38,1% | +18,3% | −26,9% | −9,3% | 146 |
| short: al massimo 3 correlati ≥ 0,7 | **+45,0%** | +25,1% | −24,8% | −9,5% | 0 |
| short: al massimo 2 correlati ≥ 0,7 | **+46,9%** | +27,7% | −24,7% | −9,5% | 3 |
| short: al massimo 1 correlati ≥ 0,7 | **+51,6%** | +29,6% | −23,2% | −9,4% | 19 |
| short: al massimo 3 correlati ≥ 0,6 | **+51,5%** | +31,7% | −24,5% | −9,4% | 9 |
| short: al massimo 2 correlati ≥ 0,6 | **+56,9%** | +35,3% | −22,6% | −9,3% | 24 |
| short: al massimo 1 correlati ≥ 0,6 | **+56,8%** | +34,8% | −23,5% | −9,4% | 64 |
| short: al massimo 3 correlati ≥ 0,5 | **+56,0%** | +34,8% | −22,8% | −9,3% | 23 |
| short: al massimo 2 correlati ≥ 0,5 | **+51,2%** | +29,6% | −24,0% | −9,3% | 46 |
| short: al massimo 1 correlati ≥ 0,5 | +37,8% | +19,7% | −26,2% | −9,3% | 119 |

**32 operabili, primo 70% (13 marzo – 28 agosto)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +59,6% | +24,0% | −24,7% | −9,1% | 0 |
| al massimo 8 short (long liberi) | +58,6% | +22,9% | −24,7% | −8,7% | 12 |
| al massimo 7 short (long liberi) | +53,5% | +19,1% | −24,7% | −8,9% | 43 |
| al massimo 6 short (long liberi) | +52,3% | +18,3% | −23,7% | −8,7% | 66 |
| al massimo 5 short (long liberi) | **+60,6%** | +25,4% | −22,4% | −8,6% | 119 |
| al massimo 4 short (long liberi) | +46,0% | +14,8% | −23,7% | −9,0% | 194 |
| al massimo 3 short (long liberi) | +30,2% | +7,0% | −23,4% | −8,6% | 290 |
| al massimo 8 long (short liberi) | +58,3% | +23,1% | −24,8% | −9,1% | 9 |
| al massimo 7 long (short liberi) | +57,9% | +23,1% | −24,7% | −9,1% | 35 |
| al massimo 6 long (short liberi) | +55,9% | +20,1% | −24,8% | −9,1% | 76 |
| al massimo 5 long (short liberi) | +35,5% | +5,6% | −29,0% | −9,1% | 134 |
| al massimo 4 long (short liberi) | +26,8% | −0,2% | −28,7% | −9,1% | 201 |
| al massimo 3 long (short liberi) | +18,5% | −6,4% | −28,3% | −9,1% | 280 |
| short: al massimo 4 per settore | +59,9% | +23,9% | −24,7% | −9,6% | 7 |
| short: al massimo 3 per settore | **+62,0%** | +25,7% | −24,8% | −10,0% | 19 |
| short: al massimo 2 per settore | **+61,8%** | +24,5% | −22,4% | −9,9% | 58 |
| short: al massimo 1 per settore | +42,8% | +12,0% | −20,6% | −9,6% | 172 |
| short: al massimo 3 correlati ≥ 0,7 | +59,2% | +23,5% | −24,7% | −9,1% | 2 |
| short: al massimo 2 correlati ≥ 0,7 | +59,0% | +23,2% | −24,7% | −9,2% | 12 |
| short: al massimo 1 correlati ≥ 0,7 | +48,2% | +14,9% | −23,0% | −9,1% | 69 |
| short: al massimo 3 correlati ≥ 0,6 | +56,8% | +21,6% | −24,7% | −9,0% | 14 |
| short: al massimo 2 correlati ≥ 0,6 | +57,7% | +23,5% | −24,7% | −8,8% | 44 |
| short: al massimo 1 correlati ≥ 0,6 | +43,6% | +12,3% | −23,0% | −8,7% | 124 |
| short: al massimo 3 correlati ≥ 0,5 | +55,3% | +21,4% | −24,7% | −8,9% | 37 |
| short: al massimo 2 correlati ≥ 0,5 | +46,2% | +14,8% | −24,7% | −8,7% | 80 |
| short: al massimo 1 correlati ≥ 0,5 | +19,6% | −5,9% | −23,2% | −8,7% | 192 |

**32 operabili, ultimo 30% (31 agosto – 10 novembre)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +41,4% | +18,8% | −22,3% | −9,6% | 0 |
| al massimo 8 short (long liberi) | +36,9% | +15,2% | −22,3% | −9,6% | 14 |
| al massimo 7 short (long liberi) | +35,1% | +12,9% | −21,6% | −9,4% | 26 |
| al massimo 6 short (long liberi) | +30,0% | +8,9% | −21,4% | −8,9% | 58 |
| al massimo 5 short (long liberi) | +18,6% | +0,5% | −21,4% | −9,4% | 92 |
| al massimo 4 short (long liberi) | +33,5% | +11,3% | −21,7% | −7,6% | 128 |
| al massimo 3 short (long liberi) | +31,6% | +11,0% | −20,4% | −5,3% | 178 |
| al massimo 8 long (short liberi) | +40,6% | +18,2% | −22,3% | −9,6% | 8 |
| al massimo 7 long (short liberi) | +41,4% | +18,7% | −21,0% | −9,6% | 21 |
| al massimo 6 long (short liberi) | +32,1% | +11,1% | −22,6% | −9,6% | 40 |
| al massimo 5 long (short liberi) | +33,1% | +12,3% | −21,8% | −9,6% | 65 |
| al massimo 4 long (short liberi) | +32,4% | +11,8% | −21,8% | −9,6% | 97 |
| al massimo 3 long (short liberi) | +23,8% | +4,9% | −20,9% | −9,6% | 148 |
| short: al massimo 4 per settore | +38,3% | +16,4% | −22,3% | −9,6% | 3 |
| short: al massimo 3 per settore | +31,2% | +10,5% | −22,3% | −9,6% | 13 |
| short: al massimo 2 per settore | +27,5% | +6,8% | −23,2% | −9,0% | 40 |
| short: al massimo 1 per settore | +32,9% | +11,9% | −22,0% | −6,3% | 94 |
| short: al massimo 3 correlati ≥ 0,7 | +38,9% | +16,8% | −22,3% | −9,4% | 5 |
| short: al massimo 2 correlati ≥ 0,7 | +35,3% | +9,9% | −22,8% | −8,9% | 14 |
| short: al massimo 1 correlati ≥ 0,7 | +40,2% | +15,4% | −25,1% | −8,8% | 42 |
| short: al massimo 3 correlati ≥ 0,6 | +34,6% | +11,6% | −22,5% | −9,1% | 12 |
| short: al massimo 2 correlati ≥ 0,6 | +32,7% | +11,1% | −23,1% | −8,7% | 29 |
| short: al massimo 1 correlati ≥ 0,6 | +38,5% | +14,3% | −26,0% | −6,6% | 68 |
| short: al massimo 3 correlati ≥ 0,5 | +37,3% | +15,2% | −22,5% | −7,9% | 27 |
| short: al massimo 2 correlati ≥ 0,5 | **+43,8%** | +19,5% | −24,4% | −6,2% | 47 |
| short: al massimo 1 correlati ≥ 0,5 | +36,2% | +12,8% | −24,6% | −6,6% | 100 |

## 4. Quanto risparmiano e quanto tolgono

Stessi ordini, slittamento 0,05%. È la differenza dalla strategia attuale, sommata sui giorni, in punti %:
- **giorni in perdita:** i giorni in cui l'attuale perdeva (positivo = il limite ha perso meno);
- **giorni in guadagno:** i giorni in cui l'attuale guadagnava (negativo = il limite ha guadagnato meno).

| Limite | 115, 70%: giorni in perdita | 115, 70%: giorni in guadagno | 32, 70%: giorni in perdita | 32, 70%: giorni in guadagno | 115, 30%: giorni in perdita | 115, 30%: giorni in guadagno | 32, 30%: giorni in perdita | 32, 30%: giorni in guadagno |
|---|---|---|---|---|---|---|---|---|
| al massimo 8 short (long liberi) | +0,7 | −11,5 | +0,3 | −1,0 | −0,1 | −2,0 | +0,0 | −3,4 |
| al massimo 7 short (long liberi) | +3,4 | −29,6 | −0,1 | −4,0 | +3,0 | −7,6 | +0,9 | −5,7 |
| al massimo 6 short (long liberi) | +8,0 | −40,8 | +0,9 | −5,8 | +6,0 | −15,0 | +2,4 | −11,2 |
| al massimo 5 short (long liberi) | +20,6 | −60,3 | +7,9 | −7,5 | +10,2 | −20,4 | +3,8 | −21,9 |
| al massimo 4 short (long liberi) | +33,1 | −86,3 | +7,6 | −16,8 | +17,8 | −34,2 | +18,1 | −24,9 |
| al massimo 3 short (long liberi) | +49,0 | −112,5 | +12,6 | −33,7 | +24,4 | −47,0 | +27,5 | −36,4 |
| al massimo 8 long (short liberi) | +0,0 | −3,2 | −0,1 | −0,8 | −0,6 | −1,4 | −0,0 | −0,5 |
| al massimo 7 long (short liberi) | +0,5 | −14,2 | +0,7 | −1,9 | +0,7 | −4,1 | +1,8 | −1,8 |
| al massimo 6 long (short liberi) | +6,0 | −23,8 | +1,4 | −4,1 | −1,1 | −4,1 | +2,4 | −9,6 |
| al massimo 5 long (short liberi) | +13,8 | −38,9 | −5,6 | −11,0 | +3,1 | −9,3 | +4,0 | −10,6 |
| al massimo 4 long (short liberi) | +23,8 | −46,2 | −5,7 | −17,6 | +6,1 | −13,5 | +4,8 | −12,1 |
| al massimo 3 long (short liberi) | +35,3 | −59,8 | −3,2 | −26,8 | +9,0 | −25,8 | +4,8 | −18,9 |
| short: al massimo 4 per settore | −0,3 | −1,7 | +1,2 | −1,0 | −0,1 | +0,1 | +0,0 | −2,3 |
| short: al massimo 3 per settore | +5,9 | −7,1 | +3,6 | −2,0 | +0,3 | +1,4 | +0,6 | −8,3 |
| short: al massimo 2 per settore | +17,0 | −28,9 | +14,1 | −13,2 | +8,3 | −2,6 | +1,3 | −12,0 |
| short: al massimo 1 per settore | +37,1 | −91,2 | +24,6 | −36,7 | +18,7 | −23,8 | +17,1 | −24,6 |
| short: al massimo 3 correlati ≥ 0,7 | +1,5 | −1,7 | +0,0 | −0,3 | −0,1 | +0,2 | +0,2 | −2,1 |
| short: al massimo 2 correlati ≥ 0,7 | +5,7 | −9,9 | +2,3 | −2,8 | +2,0 | −0,4 | +0,4 | −5,0 |
| short: al massimo 1 correlati ≥ 0,7 | +10,3 | −29,3 | +8,5 | −16,3 | +5,7 | −0,8 | +10,6 | −12,1 |
| short: al massimo 3 correlati ≥ 0,6 | +3,8 | −11,1 | +0,7 | −2,5 | +3,9 | +0,6 | +2,0 | −7,3 |
| short: al massimo 2 correlati ≥ 0,6 | +10,7 | −28,4 | +6,0 | −7,7 | +10,8 | −2,8 | +3,9 | −10,9 |
| short: al massimo 1 correlati ≥ 0,6 | +16,3 | −57,2 | +18,8 | −30,2 | +12,9 | −4,6 | +18,7 | −22,0 |
| short: al massimo 3 correlati ≥ 0,5 | +9,4 | −33,5 | +4,0 | −6,9 | +9,8 | −2,3 | +7,3 | −11,2 |
| short: al massimo 2 correlati ≥ 0,5 | +14,0 | −56,4 | +10,2 | −19,7 | +11,0 | −6,8 | +19,0 | −18,5 |
| short: al massimo 1 correlati ≥ 0,5 | +26,4 | −94,2 | +16,9 | −46,9 | +13,1 | −18,5 | +22,6 | −27,7 |

**Cosa dice:**
- **Limitare gli short costa più che limitare i long,** perché i giorni short concentrati sono tra i più redditizi. "Al massimo 5 short" con 115 titoli nel 70% risparmia 21 punti nei giorni cattivi e ne toglie 60 in quelli buoni.
- **I limiti stretti per settore o correlazione sugli short** sono quelli che risparmiano di più nei giorni cattivi. Per esempio "al massimo 1 correlato ≥ 0,6" risparmia 13–19 punti nel 30%, ma in tre casi su quattro toglie di più nei giorni buoni, fino a 57 punti.
- **L'unico caso dove si risparmia più di quanto si toglie è 115 titoli nel 30%,** come nel documento di prima. Con i 32 operabili, quelli del Reale, nel 30% succede solo con "short: al massimo 2 correlati ≥ 0,5" (+19,0 contro −18,5), che però nel 70% toglieva il doppio di quello che risparmiava.

## Cosa regge sul 30% e cosa no

Prima si sceglie sul 70%:
- **nessun limite batte l'attuale in tutti e quattro i casi del 70%** (115 e 32 titoli, slittamento 0,05% e 0,08%);
- i più vicini migliorano solo con i 32 operabili, e di poco:

| Limite (scelto sul 70%) | 32 operabili, 70% | 32 operabili, 30% | 115 titoli, 70% | 115 titoli, 30% |
|---|---|---|---|---|
| **attuale** | **+59,6%** | **+41,4%** | **+239,2%** | **+44,6%** |
| al massimo 5 short | +60,6% | +18,6% | +136,4% | +31,9% |
| short: al massimo 3 per settore | +62,0% | +31,2% | +236,4% | +47,3% |
| short: al massimo 2 per settore | +61,8% | +27,5% | +209,8% | +53,4% |

(slittamento 0,05%)

- **Al massimo 5 short: non regge.** Nel 30% perde in tutti e quattro i casi; con i 32 operabili il risultato scende da +41% a +19%.
- **Short, al massimo 2 o 3 per settore: non regge.**
  - Con i 32 operabili nel 70% guadagnava 2 punti in più. Nel 30% ne perde da 10 a 14 con lo 0,05% e da 8 a 12 con lo 0,08%.
  - Va meglio solo con 115 titoli nel 30%, quindi il risultato cambia segno da un gruppo di titoli all'altro.
  - Il 10 novembre (32 operabili) resta −9,6% e −9,0%: con questi settori i 7 short erano divisi tra chip, crypto, hardware AI e software.
- **Short, al massimo 2 correlati ≥ 0,5: va meglio nel 30%, ma non si poteva sapere.**
  - È l'unico limite migliore dell'attuale in tutti e quattro i casi del 30%: 32 operabili +43,8% contro +41,4%, 115 titoli +51,2% contro +44,6%.
  - Il 10 novembre avrebbe chiuso a +3,4% invece di −9,6%, e il giorno peggiore dei 32 sarebbe passato da −9,6% a −6,2%.
  - Però nel primo 70% perdeva in tutti e quattro i casi: +126% contro +239% con 115 titoli, +46% contro +60% con i 32.
  - Sceglierlo vorrebbe dire usare il risultato del 30%, cioè il futuro.
- **Limiti sui long: non reggono.** Peggiorano quasi sempre e non cambiano il 10 novembre.

## Raccomandazione

**Nessun limite, né sui short né sui long. Sul 30% non regge niente di quello che si poteva scegliere sul 70%.**

- **Il problema dei giorni short esiste, ma è nelle code, non nella media.** I giorni con quasi tutti short guadagnano più spesso degli altri. Ogni tanto però finiscono con una perdita grossa, quando il settore rimbalza tutto insieme, come il 10 novembre.
- **Il freno fa già il lavoro sulle code.** Tiene quei giorni intorno al −9/−10%, e lo fa senza togliere niente ai giorni buoni.
- **Un limite sugli short taglia proprio i trade migliori della strategia:** gli short nei giorni concentrati dalla loro parte, con circa l'80% di vincenti.

**Da ricontrollare più avanti:** "short: al massimo 2 correlati ≥ 0,5". È l'unico limite che nell'ultimo 30% va meglio in tutti i casi e che avrebbe salvato il 10 novembre. Però va male nel primo 70%, quindi oggi sembra un effetto degli ultimi due mesi e mezzo, non una regola. Se con altri 2–3 mesi di dati nuovi, mai usati per sceglierlo, continuasse ad andare meglio con i 32 operabili, varrebbe la pena di riprovarlo.
