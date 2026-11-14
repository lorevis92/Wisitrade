# Falso breakout con ritorno (fakeout & reclaim)

Ricerca su una copia del motore, senza cambiare l'app. Archivio Bitunix dei perpetual azionari, candele da 1 minuto.

## Conclusione

**Non usarla, né da sola né insieme alla strategia attuale.** In nessuna delle 20.736 combinazioni provate sui 32 titoli operabili la strategia guadagna in modo affidabile. La migliore sul primo 70% del periodo perde anche lì (−4,8%) e perde sull'ultimo 30% (−10%).

Sui 115 titoli qualche combinazione esce positiva, ma sono poche su migliaia: è quello che ci si aspetta dal caso. La migliore sul primo 70% fa +9,8%, poi perde sull'ultimo 30% (−4,2%). Con i costi misurati dal vivo perde anche sul primo 70%.

Il motivo è semplice: **lo stop piccolo, che è l'idea della strategia, è proprio quello che la uccide.**

- Lo stop tipico è tra lo 0,3% e lo 0,45% dal prezzo d'entrata.
- Andata e ritorno su Bitunix costano circa lo 0,22% del valore della posizione: commissione 0,06% per lato più slittamento 0,05% per lato. È da metà a quasi tutto il rischio del trade (da 0,5 a 0,9 volte il rischio).
- Prima dei costi il vantaggio della strategia è tra 0 e 0,2 volte il rischio per trade. Dopo i costi diventa negativo.

## Come l'ho provata

**Periodo.** Dal 29 aprile al 10 novembre 2026, 136 giorni di borsa. Prima l'archivio non ha i 20 giorni di storia usati anche nella ricerca sulla rottura dei 5 minuti.
- Primo 70% (29 aprile → 14 settembre): per scegliere le impostazioni.
- Ultimo 30% (15 settembre → 10 novembre): per verificarle.

**Titoli.** I 32 operabili via API e, per confronto, i 115.

**Livelli.**
1. La soglia della strategia attuale: ±1,25% dall'apertura delle 9:30.
2. Il massimo e il minimo dei primi 5 minuti (9:30–9:34).
3. Il massimo e il minimo dei primi 15 minuti (9:30–9:44).

**Rottura.** Due versioni:
- la candela da 1 minuto supera il livello anche solo con l'ombra;
- la candela chiude oltre il livello.

**Ritorno.** Una candela da 1 minuto chiude di nuovo dentro il livello entro 3, 5, 10 o 20 minuti dalla prima candela di rottura. Se il ritorno non arriva in tempo, quel lato è chiuso per la giornata.

**Entrata.** Alla chiusura della candela del ritorno, nella direzione opposta alla rottura. Un solo trade per titolo al giorno, il primo segnale. Segnali fino alle 10:30 o fino alle 11:30.

**Stop.** Appena oltre l'estremo toccato durante la rottura fallita, con un margine in più di 0, 0,05%, 0,1% o 0,2%. È uno stop di Bitunix dentro la candela. Se il prezzo apre già oltre lo stop, l'uscita è al prezzo d'apertura della candela.

**Uscite.**
- Obiettivo a 2 o 3 volte il rischio.
- L'altro lato del livello. Per la soglia dell'1,25% è la soglia opposta.
- L'apertura delle 9:30.
- Chiusura alle 15:59.
- Metà a 1 volta il rischio, poi stop in pareggio e il resto fino alle 15:59.

Se l'obiettivo non viene toccato, si esce alle 15:59.

**Stop minimo.** In più ho provato a scartare i segnali con lo stop sotto lo 0,3% o lo 0,6%: è il modo più diretto di far pesare meno i costi.

**Dimensione.**
- Rischio fisso dello 0,5% o dell'1% del capitale.
- Valore della posizione calcolato dalla distanza dello stop.
- Leva massima 5x in margine isolato, con al massimo 1/N del capitale come margine per trade.
- Massimo 3, 5 o 10 trade al giorno.
- Capitale di partenza 300 USDT, che si reinveste.
- Come nella strategia, ci si ferma a −30%.

**Costi.**
- Commissione 0,06% per lato.
- Funding 0,01% per ogni periodo attraversato.
- Slittamento in tre versioni: 0,05% o 0,08% per lato, oppure quello misurato dal vivo. Dal vivo vuol dire entrata a mercato 0,12%, stop e obiettivo (ordini TP/SL di Bitunix) 0,01%, chiusura delle 15:59 0,14%.

**Ordine dei segnali.** I segnali dello stesso minuto sono presi in ordine casuale. I risultati scelti sono la media di 10 ordini casuali.

**Niente dati futuri.** I livelli si conoscono prima della rottura e ogni decisione si prende alla chiusura della candela.

## Risultati

### La versione di base perde dappertutto

Impostazioni: 32 titoli, rottura anche solo con l'ombra, ritorno entro 10 minuti, stop +0,05%, obiettivo a 2 volte il rischio, segnali fino alle 11:30, rischio 1%, massimo 5 al giorno, slittamento 0,05%.

| Livello | Stop medio | Vantaggio prima dei costi | Risultato | Trade | Vinti | Guadagno medio / rischio | Giorno peggiore |
|---|---|---|---|---|---|---|---|
| Soglia 1,25% | 0,62% | +0,02 | −31% (fermata a −30%) | 223 | 36% | −0,16 | −5,3% |
| Primi 5 minuti | 0,49% | −0,02 | −31% (fermata) | 172 | 31% | −0,21 | −3,0% |
| Primi 15 minuti | 0,41% | +0,07 | −31% (fermata) | 206 | 34% | −0,18 | −3,6% |

Con lo 0,08% o con i costi dal vivo è uguale: si arriva sempre al −30% prima della fine del periodo.

### Tutta la griglia

20.736 combinazioni per gruppo di titoli e per costo.

| | Positive sul primo 70% | Di queste, positive anche sull'ultimo 30% |
|---|---|---|
| 32 titoli · 0,05% | 1 | 0 |
| 32 titoli · 0,08% | 0 | 0 |
| 32 titoli · dal vivo | 0 | 0 |
| 115 titoli · 0,05% | 25 | 4 |
| 115 titoli · 0,08% | 8 | 2 |
| 115 titoli · dal vivo | 18 | 2 |

Cosa aiuta, nelle combinazioni migliori di ogni gruppo:
- **Stop minimo 0,6%.** Tutte le combinazioni quasi in pari lo hanno.
- **Pochi trade.** Il massimo di 3 al giorno è sempre il migliore.
- **Rischio basso.**

Il livello, il tipo di rottura, i minuti del ritorno e l'uscita cambiano poco: nessuno rende positiva la strategia sui 32.

### Le migliori sul primo 70%, verificate con 10 ordini casuali

**Migliore sui 32.** Soglia 1,25%, rottura in chiusura, ritorno entro 10 minuti, stop esattamente sull'estremo, segnali fino alle 11:30, uscita alle 15:59, stop minimo 0,6%, rischio 0,5%, massimo 3 al giorno.

| Costi | Primo 70% | Ultimo 30% | Tutto il periodo | Peggior calo | Giorno peggiore | Trade | Vinti | Guadagno medio / rischio |
|---|---|---|---|---|---|---|---|---|
| 0,05% | −4,8% | −10,1% | −14,6% | 22% | −1,9% | 402 | 26% | −0,06 |
| 0,08% | −11,4% | −12,8% | −23,0% | 26% | −1,9% | 401 | 26% | −0,12 |
| Dal vivo | −11,8% | −12,3% | −22,9% | 26% | −1,8% | 401 | 25% | −0,12 |

Nella griglia, con un solo ordine casuale, questa combinazione faceva +2,5% sul primo 70%. Con la media di 10 ordini scende a −4,8%: il "migliore" era in parte fortuna.

**Migliore sui 115.** Primi 15 minuti, rottura anche solo con l'ombra, ritorno entro 5 minuti, stop +0,05%, segnali fino alle 10:30, uscita sull'altro lato del range, stop minimo 0,6%, rischio 1%, massimo 3 al giorno.

| Costi | Primo 70% | Ultimo 30% | Tutto il periodo | Peggior calo | Giorno peggiore | Trade | Vinti | Guadagno medio / rischio |
|---|---|---|---|---|---|---|---|---|
| 0,05% | +9,8% | −4,2% | +3,3% | 28% | −3,7% | 398 | 32% | +0,03 |
| 0,08% | −8,5% | −11,5% | −20,0% | 32% | −3,8% | 395 | 32% | −0,03 |
| Dal vivo | −1,5% | −9,2% | −12,1% | 29% | −3,5% | 398 | 32% | −0,01 |

Anche qui, con un solo ordine casuale nella griglia faceva +24,8% sul primo 70%. Con 10 ordini fa +9,8%, e non regge sull'ultimo 30%.

## Confronto con la strategia attuale

32 titoli, stesso periodo, configurazione del Reale, media di 10 ordini. Il falso breakout è la migliore versione sui 32.

| | Attuale · 0,05% | Falso breakout · 0,05% | Attuale · 0,08% | Falso breakout · 0,08% |
|---|---|---|---|---|
| Risultato | +93,2% | −14,6% | +33,9% | −23,0% |
| Peggior calo | 30% | 22% | 34% | 26% |
| Giorno peggiore | −9,5% | −1,9% | −9,7% | −1,9% |
| Trade | 1.320 | 402 | 1.320 | 401 |
| Vinti | 71% | 26% | 69% | 26% |

Le due strategie vanno quasi indipendenti: la correlazione giorno per giorno è −0,16. Nei 38 giorni in cui la strategia attuale perde più del 2%, il falso breakout fa in media +0,6%. Non basta a compensare quello che perde negli altri giorni.

### Quanti falsi segnali della strategia attuale diventano trade

Su 1.320 trade della strategia attuale, 387 chiudono in perdita. Per motivo di chiusura:
- 151 alla chiusura;
- 147 allo stop loss;
- 44 per nessuna conferma;
- 24 per il freno di mercato;
- 21 per ritracciamento.

**Segnali opposti.** In 377 di questi 387 casi (97%) dopo l'entrata della strategia attuale arriva un segnale di ritorno nella direzione opposta: rottura della soglia dell'1,25%, ritorno entro 10 minuti. Quasi ogni perdita della strategia attuale è un falso breakout. Con i filtri della versione migliore (rottura in chiusura, stop di almeno 0,6%) i segnali sono 285 (74%).

**Trade aperti davvero.** Con il massimo di 3 al giorno i trade aperti sono 106, cioè il 27% delle perdite della strategia attuale. Questi 106 vanno molto bene: in media +1,36 volte il rischio.

**Ma non si sa prima.** Al momento del segnale non si sa se il trade della strategia attuale finirà in perdita. Prendendo tutti i casi in cui il falso breakout apre mentre la strategia attuale ha ancora aperta la posizione opposta sullo stesso titolo (circa 231), il falso breakout fa in media −0,05 volte il rischio. Quindi usare il falso breakout per "girarsi" sui trade della strategia attuale non funziona.

### Le due strategie insieme

Capitale diviso tra le due, risultati giorno per giorno sommati in proporzione.

| Capitale (attuale / falso breakout) | 0,05% · risultato | Peggior calo | Giorno peggiore | Ultimo 30% | 0,08% · risultato | Peggior calo |
|---|---|---|---|---|---|---|
| 100 / 0 | +93,2% | 30% | −9,4% | +23,9% | +34,0% | 34% |
| 70 / 30 | +56,6% | 18% | −6,7% | +13,9% | +17,3% | 22% |
| 50 / 50 | +33,9% | 11% | −4,9% | +7,0% | +5,7% | 17% |
| 0 / 100 | −14,7% | 21% | −1,8% | −10,3% | −23,1% | 26% |
| Tutte e due sullo stesso capitale intero | +68,4% | 22% | −9,8% | — | +5,1% | 33% |

- **Capitale diviso:** il calo scende, ma il risultato scende molto di più. Ogni parte di capitale data al falso breakout è capitale che perde.
- **Stesso capitale intero:** le due strategie aperte insieme sullo stesso capitale fanno meno della strategia attuale da sola (+68% contro +93%). Inoltre servirebbe più margine di quello che c'è: la strategia attuale con 10 posizioni usa già tutto il margine, e Bitunix rifiuterebbe gli ordini in più.

### Posizioni opposte sullo stesso titolo

Succede spesso: in circa 231 dei 402 trade del falso breakout, cioè più della metà, la strategia attuale ha ancora aperta la posizione opposta sullo stesso titolo. Somma dei risultati di questi casi, in % del capitale:

| Cosa fare | 0,05% | 0,08% |
|---|---|---|
| Tenerle tutte e due (copertura) | −82% | −94% |
| Non aprire il falso breakout (tenere la strategia attuale) | **−77%** | **−83%** |
| Chiudere la strategia attuale e girarsi | −89% | −105% |

Sono casi in cui la strategia attuale sta già andando male: per questo la somma è negativa in tutte e tre le scelte.

- **La scelta meno cattiva è non aprire la posizione opposta.**
- **Girarsi è la peggiore:** si paga un'uscita in più e si toglie alla strategia attuale la possibilità di recuperare.
- **Tenerle tutte e due** paga commissioni doppie per un'esposizione quasi nulla.

C'è anche un motivo pratico. Con le posizioni in modalità ONE_WAY un ordine opposto sullo stesso titolo non apre una seconda posizione: riduce o chiude quella della strategia, cioè "si gira" senza volerlo. Già oggi l'app evita questo caso: la strategia non apre sui titoli dove c'è un'altra posizione, e gli ordini manuali della pagina RSI non aprono su titoli con posizioni aperte.

## In breve

- Il falso breakout con ritorno, con lo stop piccolo, sui perpetual di Bitunix non guadagna: i costi si mangiano tutto il vantaggio.
- Tutte e tre le versioni di base finiscono a −30%. Le migliori sul primo 70% non reggono sull'ultimo 30% e perdono con i costi dal vivo.
- Quasi ogni perdita della strategia attuale è un falso breakout, ma non si può sapere prima. Girarsi sulle sue posizioni costa, non rende.
- Non affiancarla alla strategia attuale. Se sullo stesso titolo arrivasse un segnale opposto, la regola giusta è non aprirlo.

File della ricerca (fuori dall'app): `orb/fake.mjs` (motore), `orb/fgrid.mjs` e `fgrid.json` (griglia), `orb/ffinal.mjs` e `ffinal.json` (verifica, confronto, posizioni opposte).
