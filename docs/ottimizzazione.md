# Ottimizzazione della strategia Apertura USA

*Novembre 2026 · 4181 combinazioni provate sull'archivio Bitunix da 1 minuto (marzo–6 novembre 2026, 32 titoli più QQQ, SPY e BTC per l'indice), con lo stesso motore della Simulazione (`shared/engine.js`).*

## In breve

- **Nessuna combinazione trovata è chiaramente migliore della configurazione attuale.** Le migliori di marzo–agosto guadagnano molto in quei mesi (circa +40/+50%), ma da settembre al 6 novembre fanno tra −0,4% e +6,7%. Nello stesso periodo la configurazione attuale fa **+30,6%**. È il classico segno di parametri adattati al passato.
- La configurazione attuale ha il problema opposto: da marzo ad agosto è quasi piatta (+1,5%, con agosto −10,4%) e regge male lo slittamento. Con 0,08% per lato è in perdita da marzo ad agosto e **sull'intero periodo è al pareggio** (+0,0%).
- Quello che conta davvero è soprattutto lo **stop loss**, poi la **protezione guadagno** (spenta va meglio), il **numero di posizioni al giorno** e la **soglia del movimento**. Lo stop che segue, i trade fermi e la finestra d'entrata contano poco.
- **Lo slittamento vero è il rischio principale.** Con la configurazione attuale serve stare sotto circa lo 0,08% per lato su tutto il periodo; le 3 ottimizzate migliori reggono fino a circa 0,19–0,21% su tutto il periodo, ma solo fino a circa 0,07–0,12% su settembre–novembre.

## Come è stata fatta

- **Condizioni uguali per tutte le prove:** capitale 300 USDT con i guadagni reinvestiti, commissione 0,06% per lato sul valore della posizione, slittamento 0,05% per lato, funding stimato 0,01% a ogni orario del funding di Bitunix, liquidazioni attive (margine di mantenimento di Bitunix), leva 5x, margine 10% del saldo per trade, tutti i titoli della strategia.
- **Scelta solo su marzo–agosto 2026.** Settembre–6 novembre è servito solo per la verifica finale: le combinazioni non sono state più modificate dopo averlo visto.
- **Punteggio (solo marzo–agosto):** quanti mesi su 6 sono positivi con slittamento 0,08%, più un piccolo premio per il rendimento con 0,08% (al massimo +1 punto), meno una penalità per il peggior calo (1 punto ogni 40%), meno 2 punti se con 0,08% il totale è negativo. Scartate le combinazioni con meno di 200 trade. Così vince chi è positivo quasi ogni mese e regge costi più alti, non chi ha il guadagno totale più alto.
- **Fasi:** (1) un parametro alla volta partendo dalla configurazione attuale; (2) combinazione dei valori migliori, rifinita un parametro alla volta finché migliorava; (3) ricerca più ampia: 4181 combinazioni in tutto, variando 1–3 parametri delle migliori. Per la verifica ho preso le 10 migliori **diverse tra loro** (almeno 2 parametri importanti diversi), perché le prime 10 in assoluto erano la stessa combinazione con differenze irrilevanti.
- **Finestra d'entrata:** per poterla provare e salvare ho aggiunto l'impostazione "Finestra d'entrata" (5, 10, 15 o 30 minuti). Il valore di default resta 30 minuti, quindi l'app si comporta come prima.

## I parametri, dal più importante al meno importante

"Escursione" = differenza tra il rendimento migliore e il peggiore di marzo–agosto cambiando solo quel parametro, con tutto il resto come nella configurazione attuale (slittamento 0,05%).

| # | Parametro | Cosa fa | Escursione | Cosa si vede |
|---|---|---|---|---|
| 1 | **Stop loss** | Distanza dello stop iniziale, in unità di volatilità. | 96,7 punti % | Sotto 1,25 è disastroso (0,25: −79%); più largo migliora: 2,75 dà +18% contro +1,5% dell'attuale (1,5). |
| 2 | **Soglia del movimento** | Di quanto il titolo deve muoversi dall'apertura per dare il segnale (si entra a 1,25 volte questo valore). | 52,2 punti % | Solo 1% funziona; 0,75% e 1,25% perdono più del 30%. Un risultato così irregolare dice che è molto sensibile al caso. |
| 3 | **Indice di attività** | Opera solo nei giorni con l'indice alto, oppure con meno posizioni nei giorni calmi. | 39,0 punti % | Peggiora sempre (da −20% a −37%). Gran parte del danno viene dall'entrare solo dalle 9:35, quando l'indice è noto: si perdono i segnali dei primi minuti. |
| 4 | **Protezione guadagno** | Chiude se il trade restituisce una certa quota del guadagno massimo. | 38,7 punti % | Spenta è nettamente meglio: +36% contro +1,5% con il 40% attuale. |
| 5 | **Nessun progresso** | Chiude se dopo X minuti il trade non ha mai raggiunto Y unità di guadagno. | 27,0 punti % | Con tempi brevi peggiora (10 minuti: −15%); solo a 90 minuti aiuta un po'. |
| 6 | **Posizioni al giorno** | Quanti trade al massimo ogni giorno. | 20,2 punti % | Meno posizioni vanno meglio: 1–2 danno +8%, 8 (attuale) +1,5%, senza limite −12%. I primi segnali della giornata sono i migliori. |
| 7 | **Spazio dal livello** | Scarta il trade se il livello chiave più vicino è troppo vicino. | 12,6 punti % | Effetto piccolo e irregolare (da −2% a +11%). |
| 8 | **Metà subito** | A +Z unità chiude metà posizione e porta lo stop al prezzo d'entrata. | 9,5 punti % | Da sola cambia poco (da −7% a +3%); aiuta solo combinata con lo stop più largo. |
| 9 | **Trade fermi dopo 60 min** | Cosa fare dei trade che dopo un'ora non si sono mossi. | 4,0 punti % | Quasi nessun effetto (da −1% a +3%). |
| 10 | **Stop che segue** | Distanza dello stop che segue il prezzo quando sei in guadagno. | 2,8 punti % | Quasi nessun effetto (+1% / +4%): la protezione guadagno al 40% scatta quasi sempre prima. |
| 11 | **Finestra d'entrata** | Entra solo nei primi 5, 10, 15 o 30 minuti. | 2,5 punti % | Quasi nessun effetto (da 0% a +3%): la maggior parte dei segnali arriva nei primi minuti. |

Non sono stati ottimizzati, e restano fissi: leva 5x, margine 10%, commissione, slittamento, funding e le regole di liquidazione.

## Riferimento: la configurazione attuale

Sono le impostazioni di default dell'app: Prova e Reale non hanno impostazioni proprie salvate.

| Movimento | Stop loss | Stop che segue | Protezione | Spazio livello | Posizioni/giorno | Trade fermi | Finestra | Nessun progresso | Metà subito | Indice |
|---|---|---|---|---|---|---|---|---|---|---|
| 1,00% | 1,50 | 1,00 | 40% | 1,00 | 8 | lascia correre | 30 min | spenta | spenta | spento |

| Periodo | Risultato | Trade | Vinti | Profit factor | Peggior calo | Giorno peggiore | Liquidazioni |
|---|---|---|---|---|---|---|---|
| Marzo–agosto, slittamento 0,05% | +1,5% (+4 USDT) | 763 | 69% | 1,01 | −19,3% | −7,3% | 0 |
| Marzo–agosto, slittamento 0,08% | −15,7% (−47 USDT) | 763 | 68% | 0,94 | −23,3% | −7,5% | 0 |
| Settembre–6 novembre, 0,05% | +30,6% (+92 USDT) | 358 | 71% | 1,32 | −11,2% | −4,3% | 0 |
| Settembre–6 novembre, 0,08% | +18,6% (+56 USDT) | 358 | 70% | 1,19 | −12,9% | −4,5% | 0 |
| Tutto il periodo, 0,05% | +32,5% (+98 USDT) | 1121 | 70% | 1,09 | −19,3% | −7,3% | 0 |

## Le 10 combinazioni migliori (scelte su marzo–agosto)

Tutte hanno in comune: movimento 1%, protezione guadagno spenta, spazio dal livello 0,75, **2 posizioni al giorno**, metà subito a +1,25 unità e indice spento. Cambiano stop loss, stop che segue, finestra, trade fermi e nessun progresso.

| # | Stop loss | Stop che segue | Protezione | Trade fermi | Finestra | Nessun progresso | Metà subito |
|---|---|---|---|---|---|---|---|
| 1 | 2,00 | 1,50 | spenta | chiudi se in perdita | 10 min | 90 min / 0,25 u | +1,25 u |
| 2 | 2,00 | 1,50 | spenta | chiudi se in perdita | 5 min | spenta | +1,25 u |
| 3 | 2,00 | 2,75 | spenta | chiudi se in perdita | 5 min | 90 min / 0,75 u | +1,25 u |
| 4 | 2,00 | 3,00 | spenta | chiudi se in perdita | 15 min | 90 min / 0,75 u | +1,25 u |
| 5 | 3,00 | 1,50 | spenta | chiudi se in perdita | 5 min | 90 min / 0,75 u | +1,25 u |
| 6 | 2,00 | 1,75 | spenta | chiudi se in perdita | 15 min | spenta | +1,25 u |
| 7 | 3,00 | 2,50 | spenta | chiudi se in perdita | 15 min | 90 min / 0,25 u | +1,25 u |
| 8 | 2,00 | 1,50 | spenta | chiudi se in perdita | 15 min | 60 min / 0,75 u | +1,25 u |
| 9 | 2,00 | 1,50 | spenta | lascia correre | 15 min | 90 min / 0,25 u | +1,25 u |
| 10 | 2,00 | 2,25 | spenta | chiudi se in perdita | 10 min | 60 min / 0,75 u | +1,25 u |

### Risultati: marzo–agosto (scelta) e settembre–6 novembre (verifica)

| # | Mar–ago 0,05% | Mar–ago 0,08% | Trade | Peggior calo | Set–nov 0,05% | Set–nov 0,08% | Trade | Peggior calo | Giorno peggiore (tutto) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | +41,0% | +32,3% | 217 | −7,8% | **+2,0%** | −0,7% | 96 | −9,7% | −5,5% |
| 2 | +39,7% | +31,3% | 213 | −7,8% | **+2,0%** | −0,3% | 96 | −9,7% | −5,5% |
| 3 | +48,9% | +39,4% | 213 | −7,9% | **+6,5%** | +3,0% | 96 | −7,5% | −5,5% |
| 4 | +48,0% | +38,3% | 218 | −7,9% | **+6,2%** | +2,7% | 96 | −7,5% | −5,5% |
| 5 | +55,0% | +45,5% | 213 | −8,0% | **−0,1%** | −2,4% | 96 | −10,4% | −6,3% |
| 6 | +45,9% | +36,5% | 218 | −8,0% | **+4,4%** | +2,3% | 96 | −9,5% | −5,5% |
| 7 | +47,5% | +36,6% | 218 | −8,0% | **+6,7%** | +3,6% | 96 | −8,3% | −6,3% |
| 8 | +44,0% | +34,5% | 218 | −8,1% | **+2,6%** | +0,6% | 96 | −9,5% | −5,3% |
| 9 | +41,6% | +33,6% | 218 | −8,2% | **−0,4%** | −4,7% | 96 | −9,1% | −5,5% |
| 10 | +44,5% | +33,1% | 217 | −8,1% | **+5,7%** | +4,5% | 96 | −7,3% | −5,3% |
| attuale | +1,5% | −15,7% | 763 | −19,3% | **+30,6%** | +18,6% | 358 | −11,2% | −7,3% |

### Mese per mese (slittamento 0,05%, % sul saldo d'inizio mese)

| # | mar | apr | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|---|---|
| 1 | +0,3 | +5,0 | +6,5 | +8,0 | +7,1 | +8,6 | −0,0 | +3,1 | −1,0 |
| 2 | +0,3 | +5,2 | +6,8 | +7,0 | +7,1 | +8,1 | −0,0 | +3,1 | −1,0 |
| 3 | +0,3 | +6,0 | +4,4 | +12,7 | +9,1 | +9,1 | +3,1 | +4,5 | −1,1 |
| 4 | +0,9 | +5,5 | +3,8 | +12,7 | +8,9 | +9,1 | +3,1 | +4,2 | −1,1 |
| 5 | +0,3 | +7,2 | +6,0 | +14,7 | +8,7 | +9,1 | −2,8 | +3,7 | −0,9 |
| 6 | +0,9 | +5,7 | +7,3 | +8,9 | +9,3 | +7,2 | +2,4 | +3,1 | −1,1 |
| 7 | +0,9 | +4,3 | +4,6 | +12,6 | +9,9 | +8,3 | +4,3 | +3,5 | −1,2 |
| 8 | +0,7 | +4,2 | +4,7 | +10,6 | +9,9 | +7,8 | −1,0 | +4,0 | −0,3 |
| 9 | +1,8 | +2,3 | +7,1 | +11,2 | +7,3 | +6,3 | +0,3 | +3,8 | −4,4 |
| 10 | +0,2 | +3,3 | +4,2 | +12,1 | +10,4 | +8,4 | +4,1 | +2,0 | −0,5 |
| attuale | +1,5 | +8,1 | −1,5 | +4,5 | +0,2 | −10,4 | +3,0 | +12,1 | +13,1 |

Marzo parte dal 13 (primi titoli su Bitunix) e novembre arriva al 6.

### Controllo in più: la migliore per ogni numero di posizioni al giorno

Il limite dei 200 trade e la penalità sul calo spingono verso 2 posizioni al giorno. Per vedere se il risultato dipende da questo, qui c'è la migliore di marzo–agosto per ogni numero di posizioni, sempre scelta solo su marzo–agosto.

| Posizioni/giorno | Mar–ago 0,05% | Trade | Peggior calo | Mesi positivi (0,08%) | Set–nov 0,05% | Set–nov 0,08% | Peggior calo set–nov |
|---|---|---|---|---|---|---|---|
| 2 | +41,0% | 217 | −7,8% | 6 su 6 | +2,0% | −0,7% | −9,7% |
| 3 | +47,6% | 320 | −10,4% | 6 su 6 | +12,1% | +9,3% | −6,7% |
| 4 | +73,6% | 438 | −15,1% | 5 su 6 | +11,9% | +5,7% | −9,0% |
| 5 | +39,2% | 516 | −19,7% | 5 su 6 | +13,7% | +10,0% | −8,3% |
| 6 | +51,1% | 602 | −22,2% | 5 su 6 | +8,5% | +5,9% | −9,6% |
| 8 | +38,0% | 730 | −22,5% | 5 su 6 | +10,5% | +6,2% | −16,5% |
| 10 | +50,6% | 592 | −25,9% | 5 su 6 | +25,3% | +15,7% | −7,5% |
| nessun limite | +53,8% | 886 | −24,5% | 5 su 6 | +10,5% | −5,5% | −21,0% |

Nessuna arriva al +30,6% della configurazione attuale su settembre–novembre.

## Leva (le 3 migliori e l'attuale)

| Combinazione | Leva | Tutto: risultato | Peggior calo | Giorno peggiore | Set–nov: risultato | Peggior calo | Giorno peggiore | Liquidazioni |
|---|---|---|---|---|---|---|---|---|
| n. 1 | 3x | +24,9% | −5,9% | −3,3% | +1,3% | −5,9% | −3,2% | 0 |
| n. 1 | 5x | +43,8% | −9,7% | −5,5% | +2,0% | −9,7% | −5,3% | 0 |
| n. 1 | 10x | +49,5% | −18,9% | −10,9% | +3,1% | −18,9% | −10,5% | 0 |
| n. 1 | 15x | +67,5% | −32,6% | −11,2% | +2,6% | −32,6% | −8,2% | 0 |
| n. 2 | 3x | +24,2% | −5,9% | −3,3% | +1,3% | −5,9% | −3,2% | 0 |
| n. 2 | 5x | +42,5% | −9,7% | −5,5% | +2,0% | −9,7% | −5,3% | 0 |
| n. 2 | 10x | +48,7% | −18,9% | −10,9% | +3,1% | −18,9% | −10,5% | 0 |
| n. 2 | 15x | +74,5% | −30,2% | −11,2% | +5,5% | −30,2% | −8,2% | 0 |
| n. 3 | 3x | +32,5% | −4,8% | −3,3% | +4,0% | −4,6% | −3,2% | 0 |
| n. 3 | 5x | +58,7% | −7,9% | −5,5% | +6,5% | −7,5% | −5,3% | 0 |
| n. 3 | 10x | +82,9% | −19,0% | −10,9% | +12,5% | −14,9% | −10,5% | 0 |
| n. 3 | 15x | +100,3% | −26,0% | −11,2% | +14,0% | −26,0% | −8,2% | 0 |
| Attuale | 3x | +19,7% | −11,9% | −4,4% | +17,7% | −6,8% | −2,6% | 0 |
| Attuale | 5x | +32,5% | −19,3% | −7,3% | +30,6% | −11,2% | −4,3% | 0 |
| Attuale | 10x | +48,9% | −36,5% | −14,6% | +66,2% | −21,7% | −8,6% | 0 |
| Attuale | 15x | +23,0% | −58,1% | −17,5% | +76,9% | −29,9% | −12,4% | 0 |

Il peggior calo cresce più o meno in proporzione alla leva (a 10x circa il doppio che a 5x, a 15x circa il triplo), il guadagno molto meno: con la configurazione attuale, su tutto il periodo, a 15x si guadagna meno che a 5x (+23% contro +32,5%) con un calo del 58%. Anche a 15x non ci sono liquidazioni, perché lo stop è sempre prima del prezzo di liquidazione. Il rischio è perdere molto con una serie di stop, non la liquidazione.

## Slittamento: quanto deve essere basso

Slittamento per lato, su entrata e uscita. "Pareggio" = slittamento oltre il quale il risultato diventa negativo.

| Combinazione | Pareggio mar–ago | Pareggio set–nov | Pareggio tutto il periodo |
|---|---|---|---|
| n. 1 | 0,23% | 0,07% | 0,19% |
| n. 2 | 0,24% | 0,08% | 0,19% |
| n. 3 | 0,24% | 0,12% | 0,21% |
| Attuale | 0,05% | 0,14% | 0,08% |

| Slittamento per lato | n. 1 (tutto) | n. 2 (tutto) | n. 3 (tutto) | Attuale (tutto) |
|---|---|---|---|---|
| 0,00% | +61,8% | +60,0% | +77,4% | +103,7% |
| 0,02% | +54,7% | +53,1% | +70,5% | +69,0% |
| 0,05% | +43,8% | +42,5% | +58,7% | +32,5% |
| 0,08% | +31,4% | +30,9% | +43,6% | +0,0% |
| 0,10% | +24,4% | +24,1% | +35,8% | −14,4% |
| 0,12% | +16,7% | +16,5% | +27,4% | −33,3% |
| 0,15% | +6,2% | +6,1% | +14,4% | −52,3% |
| 0,20% | −2,5% | −2,4% | +3,2% | −73,2% |
| 0,30% | −27,4% | −27,0% | −26,2% | −91,5% |

## Raccomandazione

1. **Non sostituire la configurazione attuale con una "ottimizzata" sulla base di questi numeri.** Le ottimizzate erano molto migliori nei mesi in cui sono state scelte e quasi ferme nei due mesi dopo; l'attuale ha fatto il contrario. Con 8 mesi di dati e un solo periodo di verifica di 2 mesi non si può dire quale delle due sia davvero migliore: la differenza dipende soprattutto da quale periodo si guarda.
2. **Se vuoi provarne una, usala in Prova accanto all'attuale per almeno 1–2 mesi.** Ti consiglio la **C** ("Ottimizzata C · nov 26"): tra le 3 salvate è quella che ha retto meglio settembre–novembre ed è positiva anche con 0,08%. È più prudente dell'attuale (2 posizioni al giorno, peggior calo intorno all'8% invece del 19% su tutto il periodo) ma guadagna di meno quando il mercato si muove molto, come in ottobre e novembre.
3. **Misura lo slittamento vero prima di aumentare il capitale.** Nel Reale confronta il prezzo del segnale con il prezzo eseguito: con la configurazione attuale serve stare sotto circa lo 0,08% per lato. Sui perpetual dei titoli, alle 9:30 di New York, non è scontato.
4. **Leva: resta a 5x o meno.** Raddoppiare la leva raddoppia il peggior calo, senza raddoppiare il guadagno nei periodi deboli.
5. **Indice di attività: lascialo spento.** Così com'è costruito obbliga a entrare dalle 9:35 e in tutte le prove ha peggiorato i risultati.

### Rischi

- **Pochi dati:** circa 170 giorni di borsa, e i titoli entrano uno alla volta (molti solo da maggio o giugno). Un periodo di verifica di 2 mesi è troppo corto per conclusioni solide.
- **Adattamento al passato:** con oltre 4.000 combinazioni provate, qualcuna va bene per caso. Il crollo da marzo–agosto a settembre–novembre lo conferma.
- **Parametri instabili:** soglia del movimento 1% buona, 0,75% e 1,25% pessime. Un vantaggio vero di solito non è così fragile.
- **Costi:** il vantaggio per trade è piccolo e uno slittamento più alto del previsto lo annulla. Il funding è una stima.
- **Simulazione:** entrata al prezzo del segnale più lo slittamento, uscite allo stop esatto (salvo salti di prezzo), dati da 1 minuto. Il Reale può essere peggio.

## Impostazioni salvate nell'app

In **Strategia → Impostazioni salvate** trovi "Ottimizzata A · nov 26", "Ottimizzata B · nov 26" e "Ottimizzata C · nov 26" (le combinazioni n. 1, 2 e 3 qui sopra), con leva 5x e margine 10%. Caricale in Simulazione per rivedere ogni trade; in Prova e Reale diventano attive solo dopo Salva.
