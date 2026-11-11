# Concentrazione delle posizioni del giorno

**Domanda:** conviene limitare quante posizioni del giorno vanno nella stessa direzione, nello stesso settore o su titoli che si muovono insieme? Il 10 novembre 7 posizioni su 10 erano short su chip e titoli AI: il settore è rimbalzato e sono andate in perdita tutte insieme.

**Risposta breve: no.**
- I giorni concentrati sono frequenti, circa uno su tre, ma **in media vanno meglio degli altri**, non peggio. Sono i giorni di trend, quando la strategia guadagna di più.
- **Nessun limite regge.** Nessuno batte la strategia attuale nel primo 70% del periodo, quindi nessuno arriva alla verifica come candidato.
- Ogni limite toglie nei giorni buoni 2–4 volte quello che risparmia nei giorni cattivi.
- Il giorno peggiore resta tra −9% e −10% quasi con ogni limite: lo tiene già lì il freno di mercato all'8%.

Solo ricerca: l'app non è cambiata.

## Come

- **Motore:** una copia del motore dell'app (`shared/engine.js`) con un gancio di ricerca, controllato a ogni nuova entrata. Se il limite è pieno, il segnale viene scartato e **il posto resta libero** per i segnali successivi.
- **Configurazione del Reale:**
  - 300 USDT con interesse composto;
  - leva 5x, margine 10%, 10 posizioni al giorno;
  - freno 8%, limiti di perdita 10% al giorno e 30% in totale;
  - commissione 0,06% e funding 0,01%.
- **Titoli:** i 115 (originali e nuovi) e i 32 operabili via API su Bitunix, cioè quelli che il Reale usa davvero.
- **Costi:** slittamento 0,05% e 0,08% per lato.
- **Ordini dei titoli:** la media di 10 ordini casuali, gli stessi per tutte le varianti.
- **Periodo:** dal 13 marzo al 10 novembre 2026, con l'archivio aggiornato fino al 10 novembre compreso.
  - I limiti si scelgono sul primo 70%, fino al 28 agosto.
  - Si verificano sull'ultimo 30%, dal 31 agosto, senza cambiarli.
  - Le due parti sono simulate separatamente, ognuna partendo da 300 USDT.
- **Mai dati futuri:**
  - il limite guarda solo le posizioni già prese quel giorno, prima del segnale;
  - la correlazione tra due titoli si calcola sui rendimenti da 15 minuti dei **10 giorni di borsa precedenti**, mai sul giorno stesso.
- **Settori** (assegnati a mano dal nome del titolo, 12 gruppi):
  - chip e memorie (NVDA, AMD, MU, SNDK, TSM…);
  - hardware, reti e cloud AI (SMCI, DELL, COHR, LITE, NBIS, CRWV…);
  - grandi tech;
  - software e internet;
  - crypto (COIN, MSTR, CRCL, IREN…);
  - finanza;
  - energia;
  - spazio e droni;
  - materiali;
  - consumi;
  - salute;
  - indici e paesi.
- **Due modi di contare:** le posizioni **prese oggi** (anche quelle già chiuse) o solo quelle **aperte in quel momento**. I risultati sono quasi uguali, con una differenza media di +0,2 punti a favore di "aperte ora". Nelle tabelle c'è "prese oggi".

## Il 10 novembre nella simulazione

Con i 32 operabili, nell'ordine della lista, la simulazione ritrova il giorno vero:
- 3 long (USAR, ASTS, AMZN), tutti in guadagno;
- 7 short, tutti chiusi dal freno di mercato in perdita: SNDK e MU (chip), COIN, MSTR e CRCL (crypto), SMCI (hardware AI) e PLTR (software).

Il giorno chiude a **−9,2%**.

Con i 115 titoli, lo stesso giorno cambia secondo l'ordine dei titoli. Nell'ordine della lista chiude a **+6,7%**: entrano altri titoli e gli short sono solo 4. Sui 10 ordini casuali va da −8,8% a +11,6%.

Cosa avrebbero fatto i limiti quel giorno con i 32 operabili (media dei 10 ordini casuali):

| Limite | 10 novembre |
|---|---|
| nessun limite | −9,6% |
| stessa direzione: al massimo 7 | −9,4% |
| stessa direzione: al massimo 5 | −9,3% |
| stessa direzione: al massimo 4 | −0,2% |
| stessa direzione: al massimo 3 | +1,5% |
| stesso settore e direzione: al massimo 2 | −9,0% |
| stesso settore e direzione: al massimo 1 | +2,6% |
| correlati ≥ 0,7: al massimo 1 | +1,7% |
| correlati ≥ 0,5: al massimo 2 | +2,5% |

**Solo i limiti molto stretti avrebbero salvato il 10 novembre.** Sono anche quelli che, nel resto del periodo, costano di più (vedi sotto).

## Prima: quanto spesso succede e come vanno quei giorni

- Giorni con almeno 5 trade, strategia attuale, slittamento 0,05%, 10 ordini casuali.
- "Stessa direzione" = la quota dei trade del giorno nella direzione più presente.
- "Gruppo correlato" = il gruppo più grande di trade dello stesso lato con correlazione ≥ 0,6 tra loro.

| | 115, 70% | 115, 30% | 32, 70% | 32, 30% |
|---|---|---|---|---|
| giorni con meno del 60% nella stessa direzione | 16% · **+0,9%** | 13% · **+1,3%** | 21% · **+0,3%** | 15% · **+0,4%** |
| 60–79% nella stessa direzione | 51% · **−0,1%** | 56% · **+0,3%** | 45% · **+0,2%** | 60% · **+0,2%** |
| 80% o più nella stessa direzione | 33% · **+3,3%** | 31% · **+1,6%** | 35% · **+0,9%** | 25% · **+2,4%** |
| tutti nella stessa direzione | 5% · +4,9% | 3% · +2,7% | 4% · +0,5% | 3% · +4,4% |
| 5 o più dello stesso settore e lato | 9% · +1,8% | 1% · +3,5% | 6% · +2,3% | 3% · +5,0% |
| gruppo correlato di 5 o più | 16% · +3,5% | 9% · **−3,1%** | 12% · +2,3% | 3% · +3,8% |
| tutti i giorni | +1,2% | +0,8% | +0,5% | +0,8% |

(quota dei giorni · risultato medio del giorno)

**Cosa dice:**
- **Un giorno su tre** finisce con l'80% o più delle posizioni nella stessa direzione. Giorni con 10 trade e almeno 7 dallo stesso lato: dal 36% al 57% dei giorni, secondo il caso.
- **Quei giorni vanno meglio della media in tutti e quattro i casi.** Se la strategia prende tanti segnali nella stessa direzione, di solito il mercato si muove davvero da quella parte.
- **I giorni misti, tra il 60% e il 79%, sono i più deboli.**
- **C'è una sola eccezione:** con 115 titoli nell'ultimo 30%, i giorni con un gruppo correlato di 5 o più fanno −3,1% di media. In quasi la metà di questi giorni scatta il freno. Però è il 9% dei giorni, solo in un caso su quattro, e nel primo 70% gli stessi giorni facevano +3,5%.
- **Il 10 novembre è un giorno raro**, il caso cattivo di un fenomeno che di solito è buono.

## Poi: i limiti

- **Stessa direzione:** al massimo K posizioni long e K short al giorno (K da 3 a 8).
- **Stesso settore e direzione:** al massimo K posizioni dello stesso settore nello stesso lato (K da 1 a 5).
- **Titoli che si muovono insieme:** un nuovo segnale viene scartato se ci sono già K posizioni dello stesso lato con correlazione almeno r con lui (r 0,5, 0,6 o 0,7; K da 1 a 4).
  - È l'alternativa ai settori: i gruppi cambiano ogni giorno con i dati dei 10 giorni precedenti.
  - Per esempio, al 10 novembre MU–SNDK vale 0,85 e NVDA–AMD 0,66.

In tutto sono 47 varianti, ognuna in 80 simulazioni: 2 gruppi di titoli × 2 parti del periodo × 2 slittamenti × 10 ordini.

- Risultato e peggior calo sono la media dei 10 ordini.
- Il giorno peggiore è la media del giorno peggiore di ogni ordine.
- I segnali bloccati sono in media per ordine.
- In grassetto le varianti che battono la strategia attuale con tutti e due gli slittamenti.

**115 titoli, primo 70% (13 marzo – 28 agosto)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +239,2% | +162,1% | −28,5% | −10,2% | 0 |
| stessa direzione: al massimo 8 | +197,5% | +130,3% | −28,1% | −9,7% | 62 |
| stessa direzione: al massimo 7 | +133,4% | +81,4% | −29,0% | −9,8% | 152 |
| stessa direzione: al massimo 6 | +111,0% | +63,4% | −28,3% | −9,4% | 290 |
| stessa direzione: al massimo 5 | +86,0% | +43,7% | −31,3% | −9,3% | 449 |
| stessa direzione: al massimo 4 | +74,2% | +40,3% | −29,9% | −8,9% | 1856 |
| stessa direzione: al massimo 3 | +50,3% | +28,4% | −27,3% | −8,3% | 2036 |
| stesso settore e direzione: al massimo 5 | +235,2% | +159,0% | −28,5% | −10,2% | 2 |
| stesso settore e direzione: al massimo 4 | +220,8% | +149,0% | −28,7% | −10,3% | 14 |
| stesso settore e direzione: al massimo 3 | +201,7% | +132,1% | −28,7% | −10,1% | 60 |
| stesso settore e direzione: al massimo 2 | +151,6% | +99,2% | −28,1% | −10,1% | 196 |
| stesso settore e direzione: al massimo 1 | +87,8% | +47,8% | −22,8% | −9,0% | 803 |
| correlati ≥ 0,7 stessa direzione: al massimo 4 | **+241,1%** | +162,3% | −28,1% | −10,0% | 2 |
| correlati ≥ 0,7 stessa direzione: al massimo 3 | +226,7% | +152,8% | −27,9% | −10,0% | 7 |
| correlati ≥ 0,7 stessa direzione: al massimo 2 | +217,1% | +145,2% | −28,0% | −9,8% | 29 |
| correlati ≥ 0,7 stessa direzione: al massimo 1 | +192,9% | +129,8% | −27,5% | −9,5% | 148 |
| correlati ≥ 0,6 stessa direzione: al massimo 4 | +231,8% | +155,7% | −27,6% | −9,8% | 17 |
| correlati ≥ 0,6 stessa direzione: al massimo 3 | +209,5% | +138,7% | −27,6% | −10,2% | 46 |
| correlati ≥ 0,6 stessa direzione: al massimo 2 | +171,6% | +111,7% | −27,5% | −9,6% | 127 |
| correlati ≥ 0,6 stessa direzione: al massimo 1 | +107,4% | +64,0% | −26,5% | −8,9% | 364 |
| correlati ≥ 0,5 stessa direzione: al massimo 4 | +182,2% | +117,4% | −28,0% | −9,4% | 72 |
| correlati ≥ 0,5 stessa direzione: al massimo 3 | +135,2% | +82,4% | −29,5% | −9,5% | 145 |
| correlati ≥ 0,5 stessa direzione: al massimo 2 | +93,3% | +52,3% | −28,0% | −9,1% | 315 |
| correlati ≥ 0,5 stessa direzione: al massimo 1 | +34,5% | −2,5% | −28,9% | −8,8% | 796 |

**115 titoli, ultimo 30% (31 agosto – 10 novembre)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +44,6% | +24,0% | −24,8% | −9,5% | 0 |
| stessa direzione: al massimo 8 | +38,9% | +19,6% | −26,2% | −9,5% | 34 |
| stessa direzione: al massimo 7 | +33,9% | +13,8% | −25,9% | −9,5% | 101 |
| stessa direzione: al massimo 6 | +26,0% | +8,4% | −28,0% | −9,5% | 181 |
| stessa direzione: al massimo 5 | +23,5% | +6,6% | −27,8% | −9,4% | 290 |
| stessa direzione: al massimo 4 | +14,0% | +2,3% | −27,4% | −8,8% | 1993 |
| stessa direzione: al massimo 3 | +12,3% | +0,9% | −23,6% | −7,8% | 2117 |
| stesso settore e direzione: al massimo 5 | +44,6% | +24,0% | −24,8% | −9,5% | 0 |
| stesso settore e direzione: al massimo 4 | +44,5% | +24,2% | −24,9% | −9,5% | 1 |
| stesso settore e direzione: al massimo 3 | +42,2% | +23,3% | −25,2% | −9,6% | 10 |
| stesso settore e direzione: al massimo 2 | **+55,7%** | +31,6% | −24,0% | −9,3% | 60 |
| stesso settore e direzione: al massimo 1 | +29,0% | +9,0% | −24,7% | −9,2% | 374 |
| correlati ≥ 0,7 stessa direzione: al massimo 4 | +44,6% | +24,0% | −24,8% | −9,5% | 0 |
| correlati ≥ 0,7 stessa direzione: al massimo 3 | +43,6% | +23,9% | −25,3% | −9,5% | 1 |
| correlati ≥ 0,7 stessa direzione: al massimo 2 | +44,0% | +25,0% | −25,5% | −9,6% | 5 |
| correlati ≥ 0,7 stessa direzione: al massimo 1 | **+50,3%** | +28,4% | −22,8% | −9,6% | 45 |
| correlati ≥ 0,6 stessa direzione: al massimo 4 | **+46,0%** | +26,9% | −25,5% | −9,5% | 5 |
| correlati ≥ 0,6 stessa direzione: al massimo 3 | **+48,9%** | +29,4% | −25,5% | −9,5% | 11 |
| correlati ≥ 0,6 stessa direzione: al massimo 2 | **+47,3%** | +26,6% | −24,0% | −9,3% | 37 |
| correlati ≥ 0,6 stessa direzione: al massimo 1 | **+49,7%** | +29,0% | −21,5% | −9,1% | 136 |
| correlati ≥ 0,5 stessa direzione: al massimo 4 | **+47,4%** | +28,4% | −25,2% | −9,4% | 16 |
| correlati ≥ 0,5 stessa direzione: al massimo 3 | **+51,2%** | +30,4% | −23,6% | −9,1% | 37 |
| correlati ≥ 0,5 stessa direzione: al massimo 2 | +42,4% | +24,0% | −23,1% | −9,2% | 97 |
| correlati ≥ 0,5 stessa direzione: al massimo 1 | **+54,5%** | +35,1% | −19,3% | −8,7% | 280 |

**32 operabili, primo 70% (13 marzo – 28 agosto)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +59,6% | +24,0% | −24,7% | −9,1% | 0 |
| stessa direzione: al massimo 8 | +57,3% | +22,0% | −24,8% | −8,7% | 20 |
| stessa direzione: al massimo 7 | +51,8% | +18,2% | −24,6% | −8,9% | 78 |
| stessa direzione: al massimo 6 | +48,8% | +14,6% | −23,7% | −8,6% | 142 |
| stessa direzione: al massimo 5 | +36,3% | +6,8% | −24,2% | −8,3% | 252 |
| stessa direzione: al massimo 4 | +22,3% | −1,6% | −29,4% | −7,9% | 466 |
| stessa direzione: al massimo 3 | +6,5% | −8,6% | −30,2% | −7,3% | 619 |
| stesso settore e direzione: al massimo 5 | +57,1% | +22,0% | −24,7% | −9,1% | 3 |
| stesso settore e direzione: al massimo 4 | +58,4% | +22,8% | −24,7% | −9,6% | 10 |
| stesso settore e direzione: al massimo 3 | +53,1% | +18,9% | −24,8% | −10,0% | 36 |
| stesso settore e direzione: al massimo 2 | +47,6% | +14,3% | −21,4% | −9,9% | 123 |
| stesso settore e direzione: al massimo 1 | +21,3% | −2,1% | −18,5% | −9,5% | 420 |
| correlati ≥ 0,7 stessa direzione: al massimo 4 | **+59,7%** | +24,1% | −24,7% | −9,1% | 0 |
| correlati ≥ 0,7 stessa direzione: al massimo 3 | +59,4% | +23,7% | −24,7% | −9,1% | 3 |
| correlati ≥ 0,7 stessa direzione: al massimo 2 | +56,0% | +20,9% | −24,7% | −9,2% | 21 |
| correlati ≥ 0,7 stessa direzione: al massimo 1 | +33,1% | +3,6% | −20,8% | −9,1% | 135 |
| correlati ≥ 0,6 stessa direzione: al massimo 4 | +57,0% | +21,8% | −24,7% | −9,4% | 5 |
| correlati ≥ 0,6 stessa direzione: al massimo 3 | +51,1% | +17,1% | −25,1% | −9,0% | 22 |
| correlati ≥ 0,6 stessa direzione: al massimo 2 | +38,5% | +8,6% | −24,7% | −8,7% | 81 |
| correlati ≥ 0,6 stessa direzione: al massimo 1 | +7,1% | −14,3% | −24,2% | −8,5% | 271 |
| correlati ≥ 0,5 stessa direzione: al massimo 4 | +59,8% | +23,1% | −24,7% | −9,0% | 32 |
| correlati ≥ 0,5 stessa direzione: al massimo 3 | +35,9% | +6,3% | −26,8% | −8,9% | 70 |
| correlati ≥ 0,5 stessa direzione: al massimo 2 | +17,0% | −7,5% | −26,8% | −8,6% | 180 |
| correlati ≥ 0,5 stessa direzione: al massimo 1 | −18,0% | −29,9% | −33,1% | −8,4% | 424 |

**32 operabili, ultimo 30% (31 agosto – 10 novembre)**

| Limite | Risultato 0,05% | Risultato 0,08% | Peggior calo (0,05%) | Giorno peggiore (0,05%) | Segnali bloccati |
|---|---|---|---|---|---|
| **attuale (nessun limite)** | +41,4% | +18,8% | −22,3% | −9,6% | 0 |
| stessa direzione: al massimo 8 | +36,2% | +14,6% | −22,3% | −9,6% | 22 |
| stessa direzione: al massimo 7 | +35,2% | +12,8% | −20,4% | −9,4% | 47 |
| stessa direzione: al massimo 6 | +21,5% | +1,8% | −21,8% | −8,9% | 98 |
| stessa direzione: al massimo 5 | +11,6% | −5,0% | −20,4% | −9,4% | 157 |
| stessa direzione: al massimo 4 | +21,7% | +1,0% | −18,4% | −8,1% | 296 |
| stessa direzione: al massimo 3 | +20,5% | +5,8% | −13,8% | −6,0% | 380 |
| stesso settore e direzione: al massimo 5 | **+41,4%** | +18,9% | −22,3% | −9,6% | 0 |
| stesso settore e direzione: al massimo 4 | +38,3% | +16,4% | −22,3% | −9,6% | 3 |
| stesso settore e direzione: al massimo 3 | +32,8% | +11,9% | −21,9% | −9,6% | 18 |
| stesso settore e direzione: al massimo 2 | +22,4% | +2,5% | −23,0% | −9,0% | 72 |
| stesso settore e direzione: al massimo 1 | +23,5% | +6,2% | −21,9% | −6,2% | 215 |
| correlati ≥ 0,7 stessa direzione: al massimo 4 | **+42,4%** | +19,8% | −22,3% | −9,6% | 2 |
| correlati ≥ 0,7 stessa direzione: al massimo 3 | +37,4% | +15,6% | −22,3% | −9,4% | 7 |
| correlati ≥ 0,7 stessa direzione: al massimo 2 | +32,2% | +7,4% | −23,6% | −8,9% | 23 |
| correlati ≥ 0,7 stessa direzione: al massimo 1 | +37,6% | +13,6% | −22,6% | −9,4% | 86 |
| correlati ≥ 0,6 stessa direzione: al massimo 4 | +38,0% | +14,8% | −22,3% | −9,6% | 5 |
| correlati ≥ 0,6 stessa direzione: al massimo 3 | +33,1% | +10,4% | −22,5% | −9,1% | 14 |
| correlati ≥ 0,6 stessa direzione: al massimo 2 | +26,2% | +5,2% | −24,1% | −8,9% | 49 |
| correlati ≥ 0,6 stessa direzione: al massimo 1 | +36,9% | +13,8% | −23,8% | −6,6% | 142 |
| correlati ≥ 0,5 stessa direzione: al massimo 4 | +39,8% | +16,3% | −22,3% | −9,1% | 15 |
| correlati ≥ 0,5 stessa direzione: al massimo 3 | +25,3% | +5,1% | −23,8% | −9,1% | 40 |
| correlati ≥ 0,5 stessa direzione: al massimo 2 | +41,7% | +18,7% | −21,3% | −6,3% | 81 |
| correlati ≥ 0,5 stessa direzione: al massimo 1 | +35,6% | +14,4% | −20,9% | −6,6% | 206 |

## Quanto risparmiano e quanto tolgono

Stessi ordini, slittamento 0,05%. Il confronto con la strategia attuale è diviso secondo il giorno dell'attuale:
- **giorni in perdita:** quanto il limite migliora i giorni in cui l'attuale perdeva;
- **giorni in guadagno:** quanto toglie nei giorni in cui l'attuale guadagnava.

È la somma dei risultati dei giorni in punti %.

| Limite | 115, 70%: giorni in perdita | 115, 70%: giorni in guadagno | 32, 70%: giorni in perdita | 32, 70%: giorni in guadagno | 115, 30%: giorni in perdita | 115, 30%: giorni in guadagno | 32, 30%: giorni in perdita | 32, 30%: giorni in guadagno |
|---|---|---|---|---|---|---|---|---|
| stessa direzione ≤ 7 | +3,9 | −43,8 | +0,6 | −5,8 | +3,7 | −11,7 | +2,7 | −7,6 |
| stessa direzione ≤ 5 | +34,4 | −99,2 | +2,3 | −18,5 | +13,4 | −29,6 | +7,8 | −32,6 |
| stesso settore ≤ 2 | +18,2 | −49,3 | +13,3 | −21,9 | +11,3 | −3,8 | +3,7 | −18,9 |
| correlati ≥ 0,7 ≤ 1 | +18,6 | −34,6 | +12,2 | −31,5 | +5,3 | −1,3 | +14,1 | −17,6 |
| correlati ≥ 0,6 ≤ 2 | +17,1 | −41,6 | +4,3 | −19,5 | +5,7 | −4,1 | +6,3 | −18,6 |
| correlati ≥ 0,5 ≤ 1 | +39,9 | −136,5 | +15,0 | −84,3 | +24,8 | −19,3 | +26,3 | −32,3 |

**È proprio il rischio di cui parlava la domanda:**
- i limiti aiutano nei giorni cattivi, ma tolgono molto di più nei giorni in cui il settore va nella direzione giusta;
- quasi sempre tolgono il doppio o più di quello che risparmiano;
- l'unico caso a favore è 115 titoli, ultimo 30%, con i limiti per settore o correlazione: lì risparmiano più di quanto tolgono, ma non succede negli altri tre casi.

## Cosa regge e cosa no

- **Stessa direzione: non regge.**
  - Peggiora il risultato con ogni valore, in tutte e otto le combinazioni.
  - Già "al massimo 8" toglie 40 punti con 115 titoli nel 70%.
  - Da 5 a 8 il peggior calo non migliora e il giorno peggiore migliora di meno di un punto; solo a 3 o 4 il giorno peggiore scende di 1–3 punti, ma il risultato del periodo si dimezza o peggio.
  - È il limite che avrebbe aiutato di più il 10 novembre, ma solo a 4 o meno, e lì il risultato del periodo crolla: da +239% a +74% con 115 titoli nel 70%, da +60% a +22% con i 32.
- **Stesso settore e direzione: non regge.**
  - A 3, 4 o 5 blocca pochissimo e non cambia quasi niente: il 10 novembre resta −9,6%.
  - A 1 o 2 riduce un po' il peggior calo nel 70% (32 titoli: da −24,7% a −21,4% con "al massimo 2"), ma toglie da 12 a 150 punti di risultato.
- **Titoli che si muovono insieme: non regge.**
  - L'unica variante che batte l'attuale nel 70% è "correlazione ≥ 0,7, al massimo 4": +241% contro +239%. Blocca in media 2 segnali in sei mesi, quindi è la strategia attuale.
  - Le versioni strette (≥ 0,5 o 0,6, al massimo 1 o 2) sono le più interessanti nell'ultimo 30% con 115 titoli: fino a +54% contro +45%, con il peggior calo da −25% a −19%. Però nel primo 70% perdono tra 65 e 205 punti, e con i 32 operabili vanno anche in negativo.
  - Scelte sul 70% non sarebbero mai state prese: il miglioramento del 30% non si può sfruttare senza guardare il futuro.
- **"Prese oggi" o "aperte ora": nessuna differenza utile.**

## Raccomandazione

**Non aggiungere limiti di concentrazione.** La strategia guadagna proprio quando molti titoli si muovono insieme nella stessa direzione dopo l'apertura. Limitarlo vuol dire tagliare i giorni migliori per difendersi da giorni come il 10 novembre, che sono più rari e già contenuti dal freno di mercato.

Il 10 novembre il sistema ha funzionato come previsto:
- il freno all'8% ha chiuso tutto;
- la perdita è stata simile a quella degli altri giorni peggiori del periodo, tra −9% e −10%.

Nessun limite di concentrazione abbassa in modo affidabile quel livello: lo decidono il freno e il limite giornaliero.

**Se in futuro si vuole ridurre il rischio dei giorni cattivi**, la leva giusta resta il freno: soglia e regole in `docs/freno-e-scelta.md` e `docs/freno-robustezza.md`. Non la concentrazione.

**Da ricontrollare più avanti:** la correlazione stretta, cioè 0,5 o 0,6 con al massimo 1 o 2. Nell'ultimo 30% con 115 titoli ha dato il risultato migliore e un calo più basso. Se dopo qualche mese di dati nuovi continuasse ad andare meglio anche sui 32 operabili, si potrebbe rifare la prova. Oggi non regge.
