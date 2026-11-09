# Titoli operabili via API su Bitunix

Primo giorno del Reale (9 novembre 2026). Bitunix ha rifiutato molti titoli con il messaggio
"This trading pair does not currently support trading via OpenAPI":

- **34 titoli: ordine rifiutato.** Esempi: AAOI, AXTI, IREN, CRWV, WDC, LLY, ORCL, KLAC, LRCX, ASML.
- **11 titoli: ordine accettato, ma stop loss rifiutato.** Lo stop era messo con la chiamata separata `tpsl/place_order`, e la posizione è stata chiusa subito. Sono AAPL, NVDA, TSLA, AMD, COIN, HOOD, INTC, MSTR, CRCL, SKHY e SPCX.
- **6 titoli: tutto a posto** (ARM, BABA, QQQ, SMCI, TSM, ASTS).

## 1. Si può sapere in anticipo?

**Per gli ordini: sì.** L'elenco delle coppie di Bitunix (`/api/v1/futures/market/trading_pairs`, pubblico) ha il campo
`isApiSupported`. La documentazione di Bitunix lo descrive così: true = trading via API attivo, false = disattivato. È l'unico campo che parla di API.

Ho controllato il campo sul primo giorno:

| | titoli | `isApiSupported` |
|---|---|---|
| ordine rifiutato | 34 | tutti `false` |
| ordine accettato (con o senza stop) | 17 | tutti `true` |

Il campo prevede il rifiuto senza nessun errore. Dei 181 titoli della strategia solo **33 hanno `true`**: 32 dei 115 (originali + nuovi) più PAYP, che è a bassa liquidità. Nel Prova e nel Reale gli ordini via API si possono fare solo su questi.

**Per lo stop loss: no.** Nessun campo di `trading_pairs` distingue gli 11 titoli con lo stop rifiutato da quelli con lo stop accettato.
- Ho confrontato tutti i campi: offset di prezzo, protezione del prezzo, quantità massime, data di quotazione. Non c'è differenza utile.
- Anche la documentazione di Bitunix non dice niente sullo stop per singola coppia.

Per lo stop quindi l'unico modo è provare, e da lì nasce la lista aggiornata da sola (punto 3).

## 2. Stop loss dentro l'ordine d'apertura

Dalla documentazione di Bitunix, `place_order` accetta lo stop dentro l'ordine con i campi `slPrice`, `slStopType` e `slOrderType`.

**Cosa ho cambiato** (vale per tutti i titoli):
1. L'ordine d'apertura porta lo stop loss dentro: `slPrice` calcolato sul prezzo del momento, a prezzo `LAST_PRICE`, eseguito a mercato.
2. Dopo l'esecuzione l'app controlla che lo stop ci sia davvero. Legge gli stop attivi di quella posizione (`tpsl/get_pending_orders` con il positionId nato dall'ordine).
   - Se lo trova, prova a spostarlo sul prezzo eseguito. Se lo spostamento non riesce resta quello dell'ordine, con una differenza pari allo slittamento.
3. Se non lo trova, prova con la chiamata separata, come prima.
4. Se non c'è nessuno stop sicuro, la posizione si chiude subito e il titolo viene segnato "stop non accettato". Non si tenta più per 7 giorni.
   - Vale anche quando lo stop non si può nemmeno leggere: **mai posizioni senza stop su Bitunix**.

**Questo non l'ho potuto provare su Bitunix vero**, perché vorrebbe dire aprire un ordine reale. La prima prova sarà il prossimo segnale su uno degli 11. Possono succedere due cose:
- **Lo stop dentro l'ordine funziona:** il trade resta aperto e nella posizione salvata compare `slVia: 'ordine'`.
- **Non funziona:** la posizione si chiude subito (costa solo commissione e spread di un'entrata e un'uscita). Arriva una notifica "non operabile via API" e il titolo esce dalla lista per 7 giorni, in Prova e nel Reale.

Nella pagina Strategia, nella scheda "Titoli operabili via API", vedi quale dei due casi è successo.

## 3. Lista "operabili via API" aggiornata da sola

`server/operable.js` decide se un titolo si può usare, con due fonti:

1. **Coppie di Bitunix**, rilette ogni giorno: con `isApiSupported = false` il titolo non si tenta, senza nessuna chiamata. Se Bitunix lo abilita, il giorno dopo rientra da solo.
2. **Esperienza del Reale:** un titolo che Bitunix rifiuta con quel messaggio viene segnato in `wt_meta` `api:marks`, sia per l'ordine sia per lo stop. Il segno ha tipo, motivo e data. Per **7 giorni** il titolo non si tenta; dopo si riprova da solo al primo segnale.
   - Arriva una sola notifica per titolo, invece di una a ogni tentativo.

**Pagina Strategia** (Prova e Reale), scheda **"Titoli operabili via API"**:
- quanti titoli scelti sono operabili;
- per ogni escluso: motivo, data e quando si riprova;
- data dell'ultimo controllo delle coppie di Bitunix;
- pulsante **Ricontrolla ora**: rilegge subito le coppie e toglie i segni, così al prossimo segnale quei titoli si ritentano davvero.

**Prove** (`node tests/operable.test.mjs`, 8 su 8), con un Bitunix finto che rifiuta con lo stesso messaggio del primo giorno:
- stop dentro l'ordine con la chiamata separata rifiutata (caso AAPL): lo stop c'è, solo su quella posizione e per la sua quantità, e non parte nessuna chiamata separata;
- stop dentro l'ordine non creato e chiamata separata rifiutata: posizione chiusa subito, titolo segnato, poi escluso da Prova e Reale;
- stop non leggibile e chiamata separata rifiutata: posizione chiusa subito;
- stop dentro l'ordine non creato ma chiamata separata accettata: posizione tenuta, con lo stop della chiamata separata;
- ordine rifiutato (caso AXTI): nessuna posizione, titolo segnato, una sola notifica;
- coppia con `isApiSupported = false`: esclusa senza nessuna chiamata a Bitunix;
- segno più vecchio di 7 giorni: il titolo torna nella lista;
- Simulazione: opzione attiva di default.

Passano anche le prove precedenti: 13 sugli ordini (`tests/live.test.mjs`) e 7 sul controllo veloce (`tests/fast.test.mjs`).

## 4. Simulazione: solo titoli operabili

Nuova opzione **"Titoli: solo operabili via API"**, attiva di default, accanto a commissione e slittamento. Usa la lista di oggi, la stessa di Prova e Reale. La scheda "Titoli usati" mostra quali titoli sono stati esclusi.

### Test con la configurazione del Reale

**Configurazione:**
- 300 USDT con interesse composto (come il capitale dedicato);
- leva 5x, margine 10%, 10 posizioni al giorno;
- freno di mercato 8%, limiti di perdita 10% al giorno e 30% in totale;
- commissione 0,06%, funding 0,01%, scelta tra segnali "ordine della lista".

Periodo: tutto l'archivio, dal 1° marzo al 6 novembre 2026. Stesso motore dell'app.

**Tre gruppi di titoli** (coppie di Bitunix lette il 9 novembre):
- **Tutti i 115:** i 32 originali e gli 83 nuovi.
- **Operabili, 32 titoli:** quelli con `isApiSupported = true`. È il caso in cui lo stop dentro l'ordine funziona anche per gli 11. Sono AAPL, MSFT, GOOGL, AMZN, NFLX, NVDA, META, TSLA, AMD, INTC, PLTR, COIN, MSTR, HOOD, BABA, ARM, MU, SNDK, SPCX, CRCL, SKHY, QQQ, SPY, BE, EWY, QCOM, SMCI, ASTS, TSM, BNC, USAR e NVO.
- **Operabili senza gli 11, 21 titoli:** è il caso in cui lo stop dentro l'ordine non funziona e gli 11 restano esclusi. Sono MSFT, GOOGL, AMZN, NFLX, META, PLTR, BABA, ARM, MU, SNDK, QQQ, SPY, BE, EWY, QCOM, SMCI, ASTS, TSM, BNC, USAR e NVO.

**Slittamento 0,05% per lato:**

| Titoli | Trade | Ordine della lista | Media di 20 ordini casuali (min – max) | Calo massimo |
|---|---|---|---|---|
| Tutti i 115 | 1481 | **+642,6%** | +415,7% (+225,4% – +612,8%) | 29,1% |
| Operabili (32) | 1443 | **+167,9%** | +175,3% (+157,2% – +193,3%) | 30,0% |
| Operabili senza gli 11 (21) | 1040 | **+31,5%** | +33,1% (+31,7% – +34,5%) | 19,4% |

**Slittamento 0,08% per lato:**

| Titoli | Trade | Ordine della lista | Media di 20 ordini casuali (min – max) | Calo massimo |
|---|---|---|---|---|
| Tutti i 115 | 1481 | **+394,3%** | +239,4% (+116,4% – +354,4%) | 30,2% |
| Operabili (32) | 1443 | **+78,4%** | +80,4% (+69,3% – +91,4%) | 32,6% |
| Operabili senza gli 11 (21) | 1040 | **−2,2%** | −1,1% (−2,5% – −0,4%) | 24,2% |

**Per periodi** (ordine della lista):

| Titoli | mar–ago, 0,05% | mar–ago, 0,08% | set–nov, 0,05% | set–nov, 0,08% |
|---|---|---|---|---|
| Tutti i 115 | +279,6% | +188,3% | +95,6% | +71,5% |
| Operabili (32) | +54,6% | +21,8% | +73,2% | +46,4% |
| Operabili senza gli 11 (21) | +3,9% | −12,9% | +26,6% | +12,4% |

### Cosa vuol dire

- **I numeri dei 115 non valgono per il Reale.** Gran parte del guadagno veniva da titoli che Bitunix non accetta via API.
- **Con i 32 operabili la strategia resta buona:**
  - con 0,05% di slittamento +168% sul periodo (lista) e +175% di media sui 20 ordini casuali;
  - con 0,08% circa +80%;
  - tutti e 20 gli ordini casuali sono positivi;
  - da settembre il risultato è vicino a quello dei 115 (+73% contro +96%).
- **Senza gli 11 grandi titoli (21 titoli) il vantaggio è quasi sparito:** +31% con 0,05% di slittamento, intorno a zero con 0,08%, con un calo massimo del 19–24%. In questo caso non conviene far girare il Reale così com'è.
- **Il prossimo segnale su uno degli 11 decide molto:** dice se lo stop dentro l'ordine funziona (punto 2).
- **L'ordine della lista conta poco con pochi titoli:** con 32 o 21 titoli i segnali saltati per il limite di posizioni sono pochi (409 e 52, contro 3449 con i 115). Lista e ordini casuali danno quasi lo stesso risultato.
- **Fuori dai 115 c'è poco altro:** tra tutti i titoli USA di Bitunix in archivio solo PAYP (bassa liquidità) è operabile via API in più.
- **Si può chiedere a Bitunix** (supporto o account manager) di abilitare le API sulle coppie che servono: quando `isApiSupported` diventa `true`, il titolo rientra da solo.

## 5. Prova = stessa lista del Reale

Il Prova usa **sempre** la stessa lista di titoli operabili del Reale. Ci sono due ragioni:
- il confronto Reale–Prova (slittamento, risultato per trade) è onesto;
- il Prova non mostra guadagni su titoli che il Reale non può comprare.

Vale anche per il controllo veloce dell'apertura e per la preparazione delle 9:05 (margine e leva solo sui titoli operabili). Nella Simulazione invece l'opzione si può spegnere, per vedere il confronto con tutti i titoli.

## Come rifare il test

Gli script sono nello scratchpad della sessione: `wide/operable.mjs` (gruppi, slittamenti, lista e 20 ordini casuali) e `wide/opper.mjs` (periodi). Usano `gridlib.mjs`, con lo stesso motore e le stesse regole dell'app (`shared/engine.js`). I risultati completi sono in `wide/operable.json`, con le coppie di Bitunix usate.
