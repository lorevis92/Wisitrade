# Percorso dentro la candela da 1 minuto

**Domanda:** in Wisi Cripto il percorso stimato dentro la candela da 1 minuto (apertura → massimo → minimo → chiusura) gonfiava molto i risultati, soprattutto per la protezione del guadagno e lo stop che segue. In Wisi Trade succede lo stesso?

**Risposta breve: sì, ma meno, e quasi solo con i 115 titoli.**
- **115 titoli:** con le uscite dell'app controllate sulla chiusura del minuto, come nel Reale, il risultato del periodo scende di circa un terzo.
  - Con slittamento 0,05%: da +385% a +255%.
  - Con slittamento 0,08%: da +220% a +124%.
- **32 operabili, quelli che il Reale usa davvero:** sul periodo intero il risultato non cambia (+125,6% → +125,8% con lo 0,05%).
  - Nel primo 70% del periodo peggiora (+59,6% → +44,1%), nell'ultimo 30% migliora (+41,4% → +56,7%).
  - È rumore, non un vantaggio nascosto.
- **Peggior calo e giorno peggiore** cambiano poco: 1–2 punti in più di calo con i 115 titoli; il giorno peggiore resta intorno a −9/−10% grazie al freno.
- **Nelle operazioni vere del Reale** (dal 9 novembre, 24 chiuse) le uscite vere dello stop che segue stanno in mezzo tra la Simulazione attuale (troppo ottimista) e quella "solo chiusura" (troppo pessimista). Le altre uscite dell'app escono in media un po' peggio di quanto simulato.

Solo ricerca: l'app non è cambiata.

## Come funziona oggi

### Nel motore (`shared/engine.js`, `stepBar`)

- **Un solo livello d'uscita** (`exitLevel` in `shared/opening.js`):
  - finché il guadagno è sotto mezza unità è lo stop loss;
  - poi è lo stop che segue (1 unità dal punto migliore);
  - con la protezione del guadagno (40%) non scende sotto la quota di guadagno da tenere.
- **Il livello si controlla lungo il percorso stimato della candela da 1 minuto** (`pathOf` e `walk`): apertura, poi l'estremo più vicino all'apertura, poi l'altro, poi la chiusura.
  - A ogni punto si aggiorna il punto migliore e quindi il livello.
  - Se un punto successivo lo tocca, **l'uscita è esattamente al livello**.
  - Così nella stessa candela il prezzo può prima salire al massimo, alzare lo stop, e poi scendere e uscire proprio lì, al prezzo migliore possibile.
- **Le altre uscite dell'app** si decidono a candela chiusa, al prezzo di chiusura: nessuna conferma, resistenza, fermo dopo 60 minuti, volume in calo, nessun progresso.
- **Il freno di mercato** si decide sulla chiusura del minuto e chiude all'apertura del minuto dopo: è già realistico.

### Nel Reale

- **Su Bitunix c'è solo lo stop loss iniziale**, dentro l'ordine d'apertura: scatta subito, dentro la candela.
- **Lo stop che segue e la protezione del guadagno non sono su Bitunix:** li gestisce l'app, una volta al minuto.
  - Il controllo ogni minuto rigioca la candela chiusa con lo stesso `stepBar`, cioè con lo stesso percorso stimato. Poi confronta anche il prezzo del momento con il livello.
  - Se il livello è toccato, chiude **a mercato in quel momento**, qualche secondo dopo la fine del minuto.
  - Nel database salva il livello (`sigOut`) e il prezzo eseguito vero (`fillOut`).
- **Prova usa la stessa logica, ma senza ordini veri:** registra l'uscita al livello. Quindi anche i risultati di Prova hanno lo stesso ottimismo della Simulazione.

## Cosa ho rifatto

Una copia del motore con le uscite gestite come nel Reale:
- **Stop loss su Bitunix e liquidazione:** restano valutati dentro la candela, sul percorso stimato, come oggi.
- **Stop che segue e protezione del guadagno:**
  - si guardano solo a candela chiusa;
  - il punto migliore si aggiorna con il massimo (o il minimo) della candela;
  - se la **chiusura** è oltre il livello, si esce **all'apertura del minuto dopo**, con lo slittamento.
- **Variante con anche le altre uscite dell'app all'apertura del minuto dopo:** dà gli stessi identici numeri. Su Bitunix l'apertura di un minuto è uguale alla chiusura del precedente, perché il perpetual scambia senza pause.
- **Configurazione del Reale:**
  - 300 USDT con interesse composto;
  - 5x, margine 10%, 10 posizioni;
  - freno 8%, limiti 10% e 30%;
  - commissione 0,06% e funding 0,01%.
- **Titoli:** i 115 e i 32 operabili.
- **Slittamento:** 0,05% e 0,08%.
- **Ordini:** media di 10 ordini casuali.
- **Periodo:** dal 13 marzo al 10 novembre 2026, e separatamente il primo 70% (fino al 28 agosto) e l'ultimo 30%.
- **Controllo:** il modo attuale della copia dà esattamente i numeri della Simulazione dell'app (+239,2%, +59,6%, +44,6%, +41,4%).

## Risultati

"Attuale" = uscite dentro la candela come oggi. "Come il Reale" = stop che segue e protezione del guadagno solo sulla chiusura del minuto, uscita al minuto dopo.

| Titoli | Periodo | Slittamento | Attuale | Come il Reale | Differenza (punti) | Peggior calo: attuale → Reale | Giorno peggiore: attuale → Reale | Vincenti: attuale → Reale |
|---|---|---|---|---|---|---|---|---|
| 115 | tutto | 0,05% | +384,9% | +254,9% | −130,0 | −29,4% → −30,2% | −10,4% → −10,4% | 73% → 71% |
| 115 | tutto | 0,08% | +220,2% | +123,8% | −96,4 | −31,1% → −32,9% | −10,4% → −10,5% | 72% → 70% |
| 115 | primo 70% | 0,05% | +239,2% | +190,9% | −48,3 | −28,5% → −29,2% | −10,2% → −10,2% | 73% → 71% |
| 115 | primo 70% | 0,08% | +162,1% | +119,2% | −42,9 | −29,0% → −30,1% | −10,2% → −10,5% | 72% → 70% |
| 115 | ultimo 30% | 0,05% | +44,6% | +24,3% | −20,4 | −24,8% → −26,8% | −9,5% → −9,4% | 73% → 70% |
| 115 | ultimo 30% | 0,08% | +24,0% | +4,3% | −19,6 | −28,1% → −30,9% | −9,6% → −9,5% | 72% → 69% |
| 32 | tutto | 0,05% | +125,6% | +125,8% | +0,2 | −28,9% → −30,4% | −9,7% → −9,5% | 72% → 71% |
| 32 | tutto | 0,08% | +47,2% | +48,3% | +1,1 | −31,3% → −33,9% | −9,9% → −9,7% | 71% → 69% |
| 32 | primo 70% | 0,05% | +59,6% | +44,1% | −15,5 | −24,7% → −26,0% | −9,1% → −9,1% | 72% → 71% |
| 32 | primo 70% | 0,08% | +24,0% | +11,9% | −12,1 | −26,6% → −29,1% | −9,2% → −9,3% | 71% → 70% |
| 32 | ultimo 30% | 0,05% | +41,4% | +56,7% | +15,3 | −22,3% → −19,1% | −9,6% → −9,5% | 72% → 70% |
| 32 | ultimo 30% | 0,08% | +18,8% | +32,7% | +13,9 | −25,5% → −20,8% | −9,7% → −9,5% | 70% → 68% |

Il numero di trade non cambia: cambia solo come e dove escono.

### Dove nasce la differenza

Periodo intero, slittamento 0,05%. Risultato medio a trade, in % del valore della posizione, e totale in USDT (media dei 10 ordini).

| Uscita | 115: attuale | 115: come il Reale | 32: attuale | 32: come il Reale |
|---|---|---|---|---|
| stop che segue / protezione (ritracciamento) | 707 trade, +1,47% | 674 trade, +1,31% | 647 trade, +1,17% | 616 trade, +1,09% |
| nessuna conferma | 351, +1,34% | 375, +1,40% | 407, +0,93% | 429, +0,97% |
| chiusura delle 15:59 | 183, −1,36% | 183, −1,27% | 201, −1,17% | 205, −1,04% |
| stop loss | 168, −4,79% | 166, −4,77% | 163, −4,13% | 162, −4,11% |
| resistenza | 28, +1,85% | 34, +2,39% | 22, +1,49% | 27, +2,03% |
| freno di mercato | 64, −2,39% | 70, −2,42% | 23, −2,96% | 24, −3,07% |

**Cosa dice:**
- **La differenza sta quasi tutta nello stop che segue.**
  - Con i 115 titoli ogni uscita di questo tipo vale in media 0,16 punti in meno.
  - Con i 32 operabili 0,08 punti in meno.
- **Una parte dei trade che oggi escono con lo stop che segue, con il controllo a candela chiusa resta aperta più a lungo.** Poi esce per nessuna conferma, resistenza o a fine giornata, a volte meglio.
- **Con i 32 operabili le due cose quasi si compensano:** titoli più grandi e più liquidi, candele meno "a scatti".
- **Con i 115 titoli no:** molti titoli piccoli si muovono molto dentro il minuto, e lì il percorso stimato regala di più.

**Perché è meno grave che in Wisi Cripto:**
- **Lo stop iniziale è vero e istantaneo** (su Bitunix), quindi resta giusto valutarlo dentro la candela.
- **Lo stop che segue parte solo dopo mezza unità di guadagno** e sta a 1 unità dal punto migliore. Il percorso stimato conta solo nelle candele in cui il prezzo fa nuovo massimo e torna indietro di più di un'unità nello stesso minuto.
- **Molte uscite** (nessuna conferma, resistenza, freno, chiusura) erano già decise a candela chiusa.

## Confronto con le operazioni vere del Reale

24 operazioni chiuse dal 9 all'11 novembre. Ognuna è rigiocata con la stessa entrata eseguita e lo stesso stop su Bitunix, sulle candele di Bitunix: archivio per il 9 e il 10, dati pubblici di Bitunix per l'11. Il risultato è in % del valore della posizione, senza commissioni.

| Gruppo | Trade | Vero (eseguito) | Attuale | Come il Reale | Attuale − vero | Come il Reale − vero |
|---|---|---|---|---|---|---|
| stop che segue (ritracciamento) | 4 | +1,01% | +1,17% | +0,69% | +0,15 | −0,32 |
| nessuna conferma e resistenza | 8 | +1,18% | +1,32% | +1,32% | +0,14 | +0,14 |
| stop loss (Bitunix e app) | 4 | −6,12% | −6,14% | −6,14% | −0,03 | −0,03 |
| freno e chiusura | 8 | −2,93% | −2,93% | −2,93% | 0 (non rigiocati) | 0 |

**Casi singoli:**
- **USAR long del 10 novembre**, chiusa dallo stop che segue:
  - il livello stimato dentro la candela era 8,532 (+1,57%), lo stesso che il Reale ha registrato;
  - il prezzo eseguito vero è stato 8,41 (+0,12%);
  - "come il Reale" darebbe −0,48%.
- **QQQ del 9 novembre:** il Reale è uscito alle 9:56 controllando il prezzo dentro il minuto in corso (+0,36%). "Come il Reale" resta dentro fino alle 10:00 e poi esce per nessuna conferma (+0,47%).
- **Le uscite per «nessuna conferma»** (alle 9:45) sono uscite vere quasi sempre peggiori della chiusura della candela da 15 minuti: MSTR −0,02% contro +0,36%, COIN +0,27% contro +0,57%, TSM +0,15% contro +0,66%.

**Cosa dice:**
- **Lo stop loss su Bitunix è simulato bene:** circa 0,03 punti di differenza.
- **Per lo stop che segue la realtà sta in mezzo:** la Simulazione attuale è più ottimista di circa 0,15 punti a trade, quella "solo chiusura" più pessimista di circa 0,32.
  - Il Reale non controlla solo la candela chiusa: guarda anche il prezzo del momento, qualche secondo dopo la fine del minuto. Questo lo avvicina all'uscita attuale, ma esegue a mercato e non al livello.
- **Le altre uscite dell'app escono in media circa 0,14 punti peggio della chiusura della candela.** Anche togliendo lo 0,05% di slittamento che la Simulazione mette già, restano circa 0,1 punti di ottimismo a trade.
  - È il ritardo del controllo ogni minuto: parte qualche secondo dopo la fine del minuto, e alle 9:45 escono tutte insieme.
- **Attenzione:** sono 24 operazioni, solo 4 con lo stop che segue. Sono indicazioni, non misure precise.

## Conclusione

**Sì, i risultati di Wisi Trade cambiano, ma molto meno che in Wisi Cripto, e soprattutto con i 115 titoli.**

- **Con i 115 titoli la Simulazione attuale è troppo ottimista:**
  - circa un terzo del guadagno del periodo viene dallo stop che segue valutato dentro la candela;
  - nell'ultimo 30% con slittamento 0,08% il risultato scende da +24% a +4%.
- **Con i 32 operabili, quelli del Reale, il risultato del periodo intero non cambia.** Le due metà del periodo si muovono in direzioni opposte (−15 e +15 punti): l'effetto c'è, ma si compensa.
- **Peggior calo e giorno peggiore** restano quasi uguali.
- **Le operazioni vere** confermano che la verità sta tra i due modi. A queste si aggiunge un piccolo ottimismo su tutte le uscite dell'app, di circa 0,1 punti a trade, per il ritardo del controllo ogni minuto.
- **Anche Prova usa lo stesso percorso stimato e registra l'uscita al livello,** quindi i suoi risultati sono ottimisti nello stesso modo. Il Reale invece registra il prezzo vero.

**Cosa farei (da decidere, qui non è cambiato niente):**
1. **Leggere i risultati della Simulazione e di Prova con i 115 titoli con prudenza:** togliere circa un terzo del guadagno è una stima ragionevole.
2. **Una possibile modifica futura:** dare alla Simulazione un'opzione "uscite dell'app sulla chiusura del minuto", per vedere sempre la versione prudente accanto a quella di oggi.
3. **Un'alternativa che avvicinerebbe il Reale alla Simulazione:** spostare lo stop che segue su Bitunix, aggiornando lo stop loss ogni minuto, così diventerebbe istantaneo come lo stop iniziale. Va studiata a parte: più chiamate a Bitunix e più casi da gestire con le regole di sicurezza del Reale.
