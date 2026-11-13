# Seconda strategia: rottura dei primi 5 minuti

Ricerca. L'app non è cambiata.

## In breve

- **La rottura dei primi 5 minuti, come descritta, non guadagna.**
  - Sui 32 operabili, con volume almeno doppio e al massimo 5 titoli al giorno, fa −12% con slittamento 0,05% e −30% con i costi misurati dal vivo.
  - Delle 216 impostazioni provate sui 32, in media il risultato per trade è leggermente negativo già con lo 0,05%.
- **La versione migliore trovata sul primo 70%** tiene solo i titoli che aprono nella direzione del gap: rottura del massimo se il gap è in su, del minimo se è in giù. Con volume almeno doppio, al massimo 3 titoli al giorno e rischio 2% per trade:
  - primo 70%: **+32%**;
  - ultimo 30%: **+5%** (slittamento 0,05%), +1% (0,08%), **−1% con i costi dal vivo**.

  Un trade su due perde. Pochi trade, circa 1,5 al giorno, guadagno piccolo che non regge: **da sola non vale la pena di metterla in funzione**.
- **Sui 115 titoli è peggio:** la migliore sul 70% (+62%) fa −21% sull'ultimo 30%.
- **Va d'accordo poco con la strategia attuale, e questo è un pregio.**
  - La correlazione dei risultati giorno per giorno è −0,06: praticamente nessuna.
  - Nei 38 giorni in cui la strategia attuale perde più del 2%, la rottura fa in media +1,1%.
  - Nei 10 giorni peggiori della strategia attuale la rottura è positiva 7 volte.
- **Usarle insieme abbassa il rischio, ma non aumenta il guadagno.** Con metà capitale per ciascuna (32 titoli, 0,05%):
  - **+71%**, contro **+93%** della sola strategia attuale;
  - peggior calo 11% invece di 30%;
  - giorno peggiore −5,2% invece di −9,4%.

  Nell'ultimo 30% l'abbinamento resta sotto la strategia attuale da sola (+16% contro +24%).

## Dati e metodo

- **Dati:** archivio Bitunix dei perpetual azionari, candele da 1 minuto.
  - Il periodo va dal 29 aprile al 10 novembre 2026: 136 giorni. Prima mancano i 20 giorni di storia che servono a medie, volumi e ATR.
  - **Primo 70%:** 29 aprile – 14 settembre (95 giorni).
  - **Ultimo 30%:** 15 settembre – 10 novembre (41 giorni).
- **Titoli:** i 32 operabili via API e, per confronto, i 115.

**Regole della rottura:**
- **Range:** massimo e minimo delle candele dalle 9:30 alle 9:34, noti alle 9:35. Nella variante a 15 minuti, dalle 9:30 alle 9:44, noti alle 9:45.
- **Titoli in gioco:** volume dei primi 5 minuti (o 15) rispetto alla media degli stessi minuti nei 14 giorni prima. Restano quelli con il rapporto almeno pari alla soglia, al massimo N al giorno, dal rapporto più alto.
- **Entrata:** alla prima rottura del massimo o del minimo dopo il range, nella direzione della rottura, fino alle 15:29.
  - Il prezzo d'entrata è il livello del range. Se la candela apre già oltre il livello, è l'apertura.
  - Un solo trade per titolo al giorno.
- **Stop:** dall'altra parte del range, come stop di Bitunix dentro la candela. Se il prezzo apre già oltre lo stop, si esce all'apertura.
- **Uscita:** alle 15:59, all'apertura della candela delle 15:59, come la chiusura del Reale.
- **Dimensione:**
  - rischio fisso (0,5%, 1% o 2% del capitale d'inizio giornata) diviso la distanza dello stop;
  - margine isolato, leva al massimo 5x, al massimo 1/N del capitale per trade, così tutti i trade del giorno entrano;
  - si parte da 300 USDT e i guadagni si reinvestono;
  - la strategia si ferma al 30% di perdita totale, come il Reale.

**Costi:**
- commissione 0,06% per lato;
- funding 0,01% per ogni ora di funding attraversata;
- slittamento in tre casi:
  - 0,05% per lato;
  - 0,08% per lato;
  - **dal vivo** (`docs/be-e-prova-realistica.md`): entrata alla rottura −0,12%, come l'entrata veloce misurata nel Reale; stop su Bitunix −0,01%; chiusura delle 15:59 −0,14%.

**Varianti provate:**
- **Base:** entrata da tutti e due i lati.
- **Filtri di direzione, noti prima dell'apertura:**
  - trend 20: chiusura di ieri sopra o sotto la media di 20 giorni;
  - trend 5/20: media di 5 giorni sopra o sotto quella di 20;
  - gap: prezzo del perpetual alle 9:29 sopra o sotto la chiusura vera di ieri, da `docs/gap-apertura.md`.
- **Zarattini:** entrata solo nella direzione della prima candela da 5 minuti, stop al 10% dell'ATR a 14 giorni. Per confronto, anche la prima candela con lo stop dall'altra parte del range.
- **Range di 15 minuti:** senza filtro e con il trend 20.
- **Per ogni variante:** soglia di volume 1,5x, 2x o 3x; al massimo 3, 5 o 10 titoli al giorno; rischio 0,5%, 1% o 2%.

In tutto sono 216 impostazioni per gruppo di titoli e per costo. Nessun dato futuro: range e volume si conoscono solo a fine range; filtri, ATR e medie usano solo i giorni prima.

**La strategia attuale**, per il confronto, gira con la stessa copia del motore delle ricerche precedenti:
- configurazione del Reale;
- uscite dell'app sulla chiusura del minuto;
- media di 10 ordini casuali;
- stesso periodo, con ogni parte che parte da capo.

## 1. La rottura con le impostazioni della richiesta

Volume almeno doppio, al massimo 5 titoli al giorno, rischio 1%, tutto il periodo:

| Variante | 32 · 0,05% | 32 · dal vivo | 115 · 0,05% | 115 · dal vivo |
|---|---|---|---|---|
| Base (tutti e due i lati) | −12% | −30% | −5% | −32% |
| Trend 20 | +2% | −12% | −3% | −23% |
| Trend 5/20 | +2% | −12% | −5% | −24% |
| Gap | **+14%** | −3% | +10% | −12% |
| Zarattini (prima candela, stop 10% ATR) | +6% | −12% | −23% | −31% |
| Range di 15 minuti | −15% | −32% | −19% | −31% |

- Con la regola base vince il 41% dei trade sui 32, che in media perdono.
- Con lo stop di Zarattini vince 1 trade su 5. Lo stop al 10% dell'ATR è molto stretto, intorno allo 0,3% del prezzo, e su questi perpetual scatta quasi sempre.
- **Quante impostazioni guadagnano su tutto il periodo:** sui 32, 72 su 216 con lo 0,05%, 30 con lo 0,08% e 17 con i costi dal vivo. Sui 115: 78, 30 e 11.

## 2. Scelta sul primo 70%, verifica sull'ultimo 30%

**32 operabili, migliore impostazione di ogni variante sul primo 70% (slittamento 0,05%):**

| Variante | Impostazione migliore | Primo 70% | Ultimo 30% |
|---|---|---|---|
| **Gap** | volume ≥ 2x, max 3, rischio 2% | **+31,7%** | **+5,2%** |
| Trend 20 | volume ≥ 2x, max 3, rischio 2% | +26,7% | −1,9% |
| Trend 5/20 | volume ≥ 2x, max 3, rischio 2% | +21,9% | −3,6% |
| Zarattini | volume ≥ 1,5x, max 5, rischio 2% | +16,7% | −7,7% |
| Prima candela, stop dall'altra parte del range | volume ≥ 1,5x, max 5, rischio 2% | +14,9% | −13,3% |
| Range di 15 minuti + trend 20 | volume ≥ 2x, max 3, rischio 2% | +11,1% | −5,8% |
| Base | volume ≥ 1,5x, max 10, rischio 2% | +10,3% | −8,2% |
| Range di 15 minuti | volume ≥ 3x, max 10, rischio 0,5% | −2,2% | +0,1% |

Delle 87 impostazioni positive sul primo 70%, 32 restano positive sull'ultimo 30%. Con lo 0,08% sono 16 su 40, con i costi dal vivo 7 su 22.

**La scelta (gap, volume ≥ 2x, max 3), sui 32, per rischio e costo:**

| Rischio · costi | Primo 70% | Ultimo 30% | Tutto il periodo | Peggior calo | Giorno peggiore |
|---|---|---|---|---|---|
| 0,5% · 0,05% | +6,1% | −0,7% | +5,4% | 6% | −1,7% |
| 1% · 0,05% | +16,0% | +1,6% | +17,9% | 10% | −3,3% |
| **2% · 0,05%** | **+31,7%** | **+5,2%** | **+38,6%** | 15% | −6,5% |
| 2% · 0,08% | +19,5% | +1,4% | +21,2% | 17% | −6,6% |
| 2% · dal vivo | +10,3% | −1,3% | +8,9% | 18% | −6,4% |

- Sono 205 trade in 136 giorni, il 46% vinti.
- Guadagno medio per trade: +0,29% del valore della posizione con lo 0,05%, +0,18% con i costi dal vivo. In unità di rischio: +0,09 R e +0,03 R per trade.
- Con rischio 2% la dimensione è spesso limitata dalla leva 5x: 55 trade su 205.

**Sui 115** la migliore sul primo 70% è gap, volume ≥ 2x, max 5, rischio 2%: +61,5% sul 70%, **−21,1% sull'ultimo 30%**. Con la stessa impostazione scelta sui 32, i 115 fanno +17% su tutto il periodo e perdono nell'ultimo 30%.

## 3. Confronto con la strategia attuale

Stesso periodo, 32 operabili. La rottura usa la scelta «gap, volume ≥ 2x, max 3, rischio 2%».

| | Attuale · 0,05% | Rottura · 0,05% | Attuale · 0,08% | Rottura · 0,08% | Rottura · dal vivo |
|---|---|---|---|---|---|
| Risultato, tutto il periodo | **+93%** | +39% | **+34%** | +21% | +9% |
| Primo 70% | +56% | +32% | +23% | +20% | +10% |
| Ultimo 30% | +24% | +5% | +9% | +1% | −1% |
| Peggior calo | 30% | 15% | 34% | 17% | 18% |
| Giorno peggiore | −9,5% | −6,5% | −9,7% | −6,6% | −6,4% |
| Numero di trade | 1.320 | 205 | 1.320 | 205 | 205 |
| Trade vinti | 71% | 46% | 69% | 45% | 43% |
| Guadagno medio per trade (sul valore della posizione) | +0,12% | +0,29% | +0,06% | +0,23% | +0,18% |

Sui 115 la strategia attuale fa +203% con lo 0,05% e la rottura +17%.

Le due strategie sono molto diverse:
- **La strategia attuale** fa tanti trade piccoli, vince 7 volte su 10 e rischia giorni da −10%.
- **La rottura** fa pochi trade che tengono tutto il giorno, perde più spesso di quanto vince e ha giorni peggiori più contenuti.

## 4. Quanto vanno d'accordo

32 operabili, 0,05%, rottura con rischio 2%, giorno per giorno:

| | |
|---|---|
| Correlazione dei risultati del giorno | **−0,06**: nessun legame |
| Giorni in cui lavorano tutte e due | 111 su 136 |
| Di questi, giorni con lo stesso segno (tutte e due su o tutte e due giù) | 39% |
| Giorni con la strategia attuale sotto −2% | 38: la rottura in quei giorni fa in media **+1,1%** |
| Giorni con la strategia attuale sopra +2% | la rottura in quei giorni fa in media 0,0% |

**I 10 giorni peggiori della strategia attuale, accanto alla rottura:**

| Attuale | Rottura |
|---|---|
| −9,4% | +0,2% |
| −9,1% | −0,5% |
| −8,8% | +6,2% |
| −8,3% | −2,1% |
| −7,2% | +1,1% |
| −7,2% | −0,5% |
| −6,4% | +2,4% |
| −6,1% | +5,7% |
| −6,0% | +4,8% |
| −5,8% | +2,4% |

I giorni cattivi non coincidono: quando la strategia attuale prende stop alla mattina, la rottura spesso fa un trade lungo nella giornata. Con lo 0,08% e con i costi dal vivo il quadro è lo stesso: correlazione tra −0,05 e −0,10.

## 5. Usarle insieme con lo stesso capitale

Oggi la strategia attuale impegna tutto il capitale: 10 posizioni con il 10% di margine ciascuna. Quindi non si possono far girare le due strategie piene sullo stesso conto. Bisogna **dividere il capitale**: una parte a ciascuna, ognuna con le sue regole e i suoi posti.

32 operabili, rottura con rischio 2%, con il capitale ridiviso ogni giorno:

| Capitale alla strategia attuale / alla rottura | Costi | Tutto il periodo | Peggior calo | Giorno peggiore | Primo 70% | Ultimo 30% |
|---|---|---|---|---|---|---|
| 100% / 0% | 0,05% | +93% | 30% | −9,4% | +56% | +24% |
| 80% / 20% | 0,05% | +86% | 22% | −7,5% | +54% | +21% |
| 70% / 30% | 0,05% | +82% | 18% | −6,5% | +53% | +19% |
| 50% / 50% | 0,05% | +71% | 11% | −5,2% | +48% | +16% |
| 50% / 0% (metà ferma) | 0,05% | +43% | 16% | −4,7% | | |
| 70% / 30% | rottura dal vivo | +69% | 19% | −6,6% | +44% | +17% |
| 50% / 50% | rottura dal vivo | +52% | 11% | −5,2% | +36% | +12% |
| 100% / 0% | 0,08% | +34% | 34% | −9,4% | +23% | +9% |
| 70% / 30% | 0,08% | +35% | 21% | −6,7% | +25% | +8% |
| 50% / 50% | 0,08% | +33% | 13% | −5,3% | +25% | +7% |

- **Il guadagno:** viene quasi tutto dalla strategia attuale. Spostare capitale sulla rottura lo riduce.
- **Il rischio:** scende più di quanto si perde in guadagno. Con 50/50 il peggior calo passa dal 30% all'11%, meglio che tenere metà capitale fermo (16%).
- **Con lo 0,08%:** il risultato resta quasi uguale (+33–35%) e il calo scende da 34% a 13–21%.
- **Sull'ultimo 30%:** con lo 0,05% ogni parte data alla rottura toglie qualcosa.

## Conclusione

1. **La rottura dei primi 5 minuti, come descritta, su questi perpetual non guadagna.** Con i costi veri perde in tutte le varianti principali.
2. **La versione migliore** (solo nella direzione del gap, volume almeno doppio, al massimo 3 titoli, rischio 2%) è positiva sul primo 70%, ma sull'ultimo 30% resta tra +5% e −1% secondo i costi.
   - I trade sono pochi: 57 nell'ultimo 30%.
   - Per ora **non è una strategia da usare da sola**.
3. **Rispetto alla strategia attuale** guadagna molto meno: +39% contro +93% sui 32 con lo 0,05%. In cambio ha calo e giorno peggiore più contenuti.
4. **Le due vanno quasi al contrario:** la correlazione è circa zero, e nei giorni brutti della strategia attuale la rottura in media guadagna. È l'unico motivo per tenerla d'occhio.
5. **Come usarle insieme:** solo dividendo il capitale.
   - **70/30 (attuale/rottura):** è il compromesso più sensato. Con lo 0,05% perde circa 10 punti di guadagno su 93 e porta il peggior calo da 30% a 18% e il giorno peggiore da −9,4% a −6,5%.
   - **50/50:** dimezza il calo, ma costa circa 20 punti.
   - **Prima di farlo:** il guadagno della rottura va confermato su più mesi. Oggi, con i costi dal vivo, vale circa zero, e il beneficio dell'abbinamento è soprattutto ridurre il rischio. Lo stesso effetto si ottiene in parte usando meno capitale sulla strategia attuale.

## File della ricerca

Sono sul PC, nella cartella temporanea della ricerca (`scratchpad/orb`):
- `orb.mjs`: dati, regole e portafoglio;
- `grid.mjs`: 216 impostazioni × 2 gruppi di titoli × 3 costi, primo 70% e ultimo 30%;
- `compare.mjs`: confronto con la strategia attuale, accordo e capitale diviso;
- risultati in `grid.json` e `compare.json`.
