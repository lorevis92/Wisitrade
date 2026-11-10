# Inversioni subito dopo l'entrata

**Domanda:** si possono riconoscere i trade che cambiano direzione subito dopo l'entrata (un'inversione vera, non un semplice rientro sotto la soglia) e chiuderli prima dello stop?

**Risposta breve: no, non con la forma delle candele dei primi minuti.**
- Nessuna delle 82 regole provate è positiva sia nel primo 70% sia nell'ultimo 30% del periodo.
- Nella simulazione completa nessuna regola batte la strategia attuale in tutti e quattro i casi (115 e 32 titoli, 70% e 30%).
- La ragione principale è che le inversioni rapide fino allo stop sono rarissime: i perdenti perdono quasi sempre più tardi e più lentamente.

Solo ricerca: l'app non è cambiata.

## Come

- **Motore:** una copia del motore dell'app (`shared/engine.js`) con un gancio di ricerca. A ogni candela da 1 minuto chiusa, dopo lo stop e le uscite normali, la regola può chiudere il trade.
- **Configurazione del Reale:**
  - 300 USDT con interesse composto;
  - leva 5x, margine 10%, 10 posizioni al giorno;
  - freno 8%, limiti di perdita 10% al giorno e 30% in totale;
  - commissione 0,06% e funding 0,01%.
- **Titoli:** i 115 (originali e nuovi) e i 32 operabili via API su Bitunix.
- **Costi:** slittamento 0,05% e 0,08% per lato. L'uscita anticipata è a mercato, con slittamento e commissione come le altre.
- **Ordini dei titoli:** la media di 10 ordini casuali, gli stessi per tutte le regole.
- **Periodo:** dal 1° marzo al 6 novembre 2026.
  - Le regole si scelgono sul primo 70%, fino al 28 agosto.
  - Si verificano sull'ultimo 30%, dal 31 agosto, senza cambiarle.
- **Mai dati futuri:**
  - una regola guarda solo le candele già chiuse, dalla candela d'entrata a quella del minuto in cui decide;
  - l'uscita è al prezzo di chiusura di quella candela;
  - la regola "tocco" è un ordine stop messo prima, quindi esce al livello toccato.
- **Unità:** il movimento si misura in "unità", la misura di volatilità che la strategia usa anche per lo stop.

## Prima: come perdono i perdenti

Tutti i segnali, senza limite di posizioni, 300 USDT fissi, slittamento 0,05%.

| | 70% | 30% |
|---|---|---|
| segnali | 2653 | 2315 |
| perdenti | 791 | 693 |
| chiusi dallo stop | 330 | 276 |
| … di cui entro 5 minuti dall'entrata | **8** | **9** |
| … di cui entro 15 minuti | 43 | 45 |
| chiusi alle 15:59 in perdita | 338 | 288 |
| chiusi per "nessuna conferma" | 123 | 128 |

- **Gli stop arrivano tardi:** su tutto il periodo lo stop dei perdenti arriva in mediana dopo 57 minuti, e solo 17 su 606 entro 5 minuti.
- **I perdenti di fine giornata perdono poco alla volta:** −1,9% di media. I trade chiusi dallo stop perdono −4,5% di media.
- **Quindi il caso "entro e subito si gira fino allo stop" quasi non esiste.** Quasi tutti i perdenti nei primi minuti non si distinguono ancora dai vincenti.

## Regole provate

Ogni regola è controllata a ogni candela chiusa dei primi 1, 2, 3 o 5 minuti dopo l'entrata. In tutto sono 82 regole.
1. **Rottura della candela d'entrata:**
   - chiusura sotto il suo minimo (long) o sopra il suo massimo (short);
   - oppure ordine stop su quel livello (tocco).
2. **Candele di fila contro il trade:** 2 o 3, da sole o con la chiusura sotto il prezzo d'entrata.
3. **Corpo forte contro:** corpo di almeno 0,15, 0,25 o 0,4 unità, con chiusura nella parte peggiore della candela. Da solo o con la chiusura sotto l'entrata.
4. **Combinazioni:**
   - rottura più corpo forte;
   - rottura più 2 di fila;
   - sotto la soglia più corpo forte;
   - sotto la soglia senza essere mai partito, più candela contro.
5. **Altre misure del cambio di direzione:**
   - massimi e minimi decrescenti per 2 candele (struttura invertita);
   - candela contro che "inghiotte" la precedente;
   - movimento contro di almeno 0,3 o 0,5 unità in 2 candele;
   - più del 70% del guadagno massimo restituito.
6. **Per confronto**, il rientro semplice sotto la soglia.

## Fase 1: tutti i segnali

Per ogni regola: quanti perdenti taglia, quanti vincenti rovina, e quanto cambia la somma dei risultati in punti % (positivo = meglio).

- **Sul 70%** sono positive 10 regole su 82.
- **Sul 30%** 5 su 82.
- **In tutte e due le metà: nessuna.**

Le migliori di ogni famiglia sul 70% (e le due migliori sul 30%, solo come controllo):

| Regola | 70%: perdenti tagliati | 70%: vincenti rovinati | 70%: variazione | 30%: perdenti tagliati | 30%: vincenti rovinati | 30%: variazione |
|---|---|---|---|---|---|---|
| chiusura sotto la soglia (rientro semplice), primi 1 min | 473 su 791 | 648 su 1862 | −154,6 | 426 su 693 | 576 su 1622 | −195,9 |
| movimento contro ≥ 0,3 unità in 2 candele, primi 5 min | 289 su 791 | 248 su 1862 | **+76,2** | 248 su 693 | 208 su 1622 | −52,9 |
| più del 70% del guadagno massimo restituito, primi 5 min | 86 su 791 | 172 su 1862 | +25,3 | 70 su 693 | 156 su 1622 | −68,2 |
| corpo contro ≥ 0,15 unità, chiusura sul lato peggiore, primi 1 min | 186 su 791 | 202 su 1862 | +15,5 | 153 su 693 | 194 su 1622 | −83,6 |
| rottura della candela d'entrata + 2 di fila contro, primi 2 min | 155 su 791 | 122 su 1862 | +14,0 | 139 su 693 | 95 su 1622 | −23,0 |
| 3 candele di fila contro, primi 3 min | 149 su 791 | 132 su 1862 | −4,3 | 139 su 693 | 98 su 1622 | +10,4 |
| chiusura oltre la candela d'entrata, primi 1 min | 151 su 791 | 160 su 1862 | −25,4 | 149 su 693 | 134 su 1622 | −38,6 |
| tocco della candela d'entrata (ordine stop lì), primi 1 min | 269 su 791 | 327 su 1862 | −46,9 | 227 su 693 | 259 su 1622 | −61,0 |
| movimento contro ≥ 0,5 unità in 2 candele, primi 3 min | 58 su 791 | 42 su 1862 | −41,8 | 63 su 693 | 21 su 1622 | +31,8 |

**Lo schema si ripete per tutte le regole:**
- ogni regola che prende tanti perdenti prende quasi altrettanti vincenti;
- i vincenti sono più del doppio dei perdenti;
- anche una regola che vede due perdenti su tre (il tocco della candela d'entrata nei primi 5 minuti: 535 su 791) colpisce un vincente su tre (623 su 1862);
- il guadagno tolto ai vincenti è circa uguale alla perdita risparmiata sui perdenti.

## Fase 2: simulazione completa

Risultato del periodo, media di 10 ordini casuali dei titoli. 70% e 30% sono simulati separatamente, ognuno partendo da 300 USDT.

**115 titoli**

| Regola | 70%, 0,05% | 70%, 0,08% | 30%, 0,05% | 30%, 0,08% |
|---|---|---|---|---|
| **attuale** | **+239,2%** | **+162,1%** | **+50,3%** | **+29,5%** |
| rientro semplice sotto la soglia, primi 1 min | +88,9% | +43,5% | +12,8% | −7,4% |
| movimento contro ≥ 0,3 unità in 2 candele, primi 5 min | +166,7% | +100,1% | +45,2% | +21,4% |
| più del 70% del guadagno massimo restituito, primi 5 min | +233,9% | +158,8% | +24,3% | +2,2% |
| corpo contro ≥ 0,15 unità, primi 1 min | +241,3% | +149,5% | +18,0% | −4,9% |
| rottura candela d'entrata + 2 di fila contro, primi 2 min | +221,8% | +147,9% | +51,7% | +29,0% |
| 3 candele di fila contro, primi 3 min | +195,2% | +125,2% | +62,8% | +38,5% |
| chiusura oltre la candela d'entrata, primi 1 min | +205,0% | +131,8% | +25,5% | +7,4% |
| tocco della candela d'entrata, primi 1 min | +200,7% | +130,6% | +24,4% | +2,2% |
| movimento contro ≥ 0,5 unità in 2 candele, primi 3 min (controllo) | +200,7% | +133,7% | +60,0% | +33,5% |

**32 operabili**

| Regola | 70%, 0,05% | 70%, 0,08% | 30%, 0,05% | 30%, 0,08% |
|---|---|---|---|---|
| **attuale** | **+59,6%** | **+24,0%** | **+71,4%** | **+44,6%** |
| rientro semplice sotto la soglia, primi 1 min | −7,0% | −29,5% | +5,6% | −10,7% |
| movimento contro ≥ 0,3 unità in 2 candele, primi 5 min | +52,2% | +18,3% | +40,9% | +20,9% |
| più del 70% del guadagno massimo restituito, primi 5 min | +71,0% | +37,4% | +57,3% | +32,1% |
| corpo contro ≥ 0,15 unità, primi 1 min | +38,2% | +6,1% | +42,3% | +20,3% |
| rottura candela d'entrata + 2 di fila contro, primi 2 min | +57,6% | +23,9% | +57,4% | +33,0% |
| 3 candele di fila contro, primi 3 min | +51,6% | +16,8% | +53,2% | +30,6% |
| chiusura oltre la candela d'entrata, primi 1 min | +48,3% | +15,0% | +44,0% | +21,7% |
| tocco della candela d'entrata, primi 1 min | +33,1% | +1,5% | +37,3% | +16,5% |
| movimento contro ≥ 0,5 unità in 2 candele, primi 3 min (controllo) | +39,9% | +8,7% | +72,4% | +46,7% |

**Trade tagliati nella simulazione** (slittamento 0,05%, media per ordine). Ogni trade tagliato è confrontato con lo stesso trade della strategia attuale, nello stesso ordine dei titoli. Variazione = somma in punti %.

| Regola (115 titoli) | 70%: perdenti tagliati | 70%: vincenti rovinati | 70%: variazione | 30%: perdenti tagliati | 30%: vincenti rovinati | 30%: variazione |
|---|---|---|---|---|---|---|
| rientro semplice, primi 1 min | 176 | 231 | −104 | 94 | 126 | −67 |
| movimento contro ≥ 0,3 unità, primi 5 min | 124 | 107 | −41 | 69 | 52 | −12 |
| più del 70% restituito, primi 5 min | 45 | 74 | −2 | 17 | 53 | −38 |
| corpo contro ≥ 0,15 unità, primi 1 min | 82 | 75 | +24 | 38 | 49 | −47 |
| rottura + 2 di fila, primi 2 min | 56 | 37 | +1 | 29 | 16 | −6 |
| 3 di fila contro, primi 3 min | 63 | 52 | −26 | 38 | 21 | +15 |
| chiusura oltre la candela d'entrata, primi 1 min | 48 | 38 | +3 | 22 | 20 | −41 |
| tocco della candela d'entrata, primi 1 min | 78 | 79 | −3 | 34 | 36 | −42 |
| movimento contro ≥ 0,5 unità, primi 3 min | 33 | 23 | −25 | 20 | 7 | +10 |

| Regola (32 operabili) | 70%: perdenti tagliati | 70%: vincenti rovinati | 70%: variazione | 30%: perdenti tagliati | 30%: vincenti rovinati | 30%: variazione |
|---|---|---|---|---|---|---|
| rientro semplice, primi 1 min | 163 | 242 | −106 | 87 | 143 | −101 |
| movimento contro ≥ 0,3 unità, primi 5 min | 107 | 92 | −8 | 51 | 46 | −40 |
| più del 70% restituito, primi 5 min | 32 | 60 | +17 | 10 | 34 | −18 |
| corpo contro ≥ 0,15 unità, primi 1 min | 65 | 81 | −31 | 31 | 48 | −38 |
| rottura + 2 di fila, primi 2 min | 54 | 39 | −4 | 28 | 20 | −18 |
| 3 di fila contro, primi 3 min | 54 | 51 | −8 | 28 | 24 | −23 |
| chiusura oltre la candela d'entrata, primi 1 min | 45 | 53 | −16 | 30 | 28 | −36 |
| tocco della candela d'entrata, primi 1 min | 80 | 108 | −39 | 39 | 52 | −46 |
| movimento contro ≥ 0,5 unità, primi 3 min | 25 | 17 | −24 | 20 | 10 | +1 |

## Cosa regge e cosa no

- **Rientro semplice sotto la soglia: non regge**, ed è la peggiore di tutte. Conferma la ricerca precedente (`docs/in-gioco-e-falsi-segnali.md`): la fa anche un vincente su tre.
- **Rottura della candela d'entrata** (chiusura oltre o tocco): **non regge.**
  - Prende tanti perdenti, ma rovina altrettanti vincenti.
  - Peggiora la strategia in tutti i casi, molto sul 30%: sui 115 da +50% a +24–26%.
- **Candele di fila contro:** **non regge.**
  - "3 di fila nei primi 3 minuti" migliora il 30% sui 115 (+62,8% contro +50,3%).
  - Però peggiora il 70% sui 115 (+195% contro +239%) e tutti e quattro i casi sui 32.
- **Corpo forte contro:** **non regge.** È tra le migliori sul 70% nei singoli segnali, poi sul 30% è tra le peggiori (sui 115 da +50% a +18%).
- **Combinazioni:** **non reggono.** La più vicina è "rottura della candela d'entrata + 2 di fila contro nei primi 2 minuti":
  - è quasi uguale all'attuale nel 30% (+51,7% contro +50,3% sui 115; +57,4% contro +71,4% sui 32);
  - è un po' sotto nel 70%.
  - Non porta niente.
- **Altre misure:**
  - "movimento contro ≥ 0,3 unità": la migliore sul 70% nei singoli segnali, ma peggiora la simulazione in tutti i casi.
  - "più del 70% del guadagno restituito": è l'unica migliore sul 70% dei 32 (+71% contro +60%), ma sul 30% perde (+57% contro +71%) e sui 115 crolla (da +50% a +24%).
  - "movimento contro ≥ 0,5 unità in 3 minuti": va bene solo sul 30%, cioè proprio sulla parte che non si può usare per scegliere. Sul 70% perde molto (sui 32 da +60% a +40%). **Non regge.**

## Perché non funziona

1. **Il trade che si gira subito fino allo stop quasi non esiste:** sono 17 perdenti su 1484 con lo stop entro 5 minuti. Lo stop di questa strategia è abbastanza largo da non essere toccato dai primi scossoni.
2. **I vincenti spesso tornano indietro prima di partire.** Nei primi minuti fanno le stesse candele contro dei perdenti: rotture della candela d'entrata, corpi forti, candele di fila. Tagliarli costa quanto si risparmia sui perdenti.
3. **Ogni uscita anticipata costa:** una commissione e uno slittamento in più rispetto al rientro naturale. Con 0,08% di slittamento ogni regola peggiora ancora di più.

## Raccomandazione

**Non aggiungere uscite anticipate basate sulla forma delle candele dei primi minuti.** Nessuna regola regge sul 30%, né sui 115 né sui 32 operabili, né con 0,05% né con 0,08% di slittamento. Lo stop e le uscite attuali vanno bene così.

Se in futuro si vuole riprovare, ha più senso guardare dove si perde davvero: i perdenti che restano aperti fino alle 15:59 (338 nel 70%, −1,9% di media). Per esempio, un'uscita a un'ora fissa per i trade che a metà mattina non sono ancora partiti. È un'altra domanda, da provare con lo stesso metodo 70/30.

## Come rifare il test

Gli script sono nello scratchpad della sessione, cartella `ig/`:
- `inv.mjs`: le regole e il gancio per il motore;
- `inv1.mjs`: fase 1, tutti i segnali;
- `inv2.mjs`: fase 2, simulazione completa con 10 ordini casuali;
- `inv3.mjs`: trade tagliati confrontati con la strategia attuale.

Usano `lib.mjs` e la copia del motore in `ig/shared`. I risultati sono in `inv1.json`, `inv2.json` e `inv3.json`.
