# Titoli "in gioco" e falsi segnali

Solo ricerca: l'app non è cambiata. Tutto è fatto su una copia del motore dell'app (`shared/engine.js`) nello scratchpad, con quattro agganci aggiunti solo lì:
- titoli ammessi in un giorno;
- ordine dei segnali dello stesso minuto;
- filtro di un segnale;
- uscita anticipata.

## Come

- **Configurazione del Reale:** 115 titoli (originali + nuovi), 300 USDT con interesse composto, leva 5x, margine 10%, 10 posizioni al giorno, freno 8%, limiti 10%/30%, commissione 0,06%, funding 0,01%, slittamento 0,05% e 0,08%.
- **Ordine dei titoli:** media di **10 ordini casuali** dei titoli, con il minimo e il massimo tra parentesi.
- **Periodo:** archivio dal 1° marzo al 6 novembre 2026, diviso per giorni di borsa.
  - **primo 70%** (fino al 28 agosto): qui si cercano le regole;
  - **ultimo 30%** (dal 31 agosto): qui si verificano.
  - Le due parti partono ognuna da 300 USDT.
- **Mai dati futuri:**
  - Il punteggio "in gioco" usa solo dati fino alle 9:28 (candele chiuse prima delle 9:29) e i giorni precedenti.
  - Le misure al momento dell'entrata usano solo candele già chiuse. Per esempio la prima candela delle 9:30 si usa solo per le entrate dalle 9:31.
  - Corretto durante il lavoro: in una prima versione il volume della prima candela era usato anche per le entrate dentro la prima candela, cioè prima che si chiudesse.
- **Tutti i segnali:** per misurare la qualità dei singoli segnali uso tutti i segnali della strategia, senza limite di posizioni, senza freno né limiti, a dimensione fissa. Sono **4968 segnali** (2653 nel 70%, 2315 nel 30%), il 70% vincenti, in media +0,065% a trade sul valore della posizione, commissioni e slittamento compresi.

## Parte 1 — Titoli "in gioco"

### Fonti dei dati

| Dato | Fonte | Storia |
|---|---|---|
| Gap dalla chiusura delle 16:00 | chiusura vera dell'azione da Yahoo Finance (giornaliero, gratuito) e prezzo del perpetual alle 9:28 (archivio Bitunix) | Yahoo: 2 anni. Archivio: da marzo 2026 |
| Movimento e ampiezza nel pre-mercato | perpetual Bitunix 9:00–9:28 (l'archivio parte dalle 9:00) | da marzo 2026 |
| Volume vero dell'azione | Yahoo Finance: volume giornaliero (2 anni). Il volume nel pre-mercato **non c'è**: le candele da 1 ora (2 anni), 5 minuti (60 giorni) e 1 minuto (30 giorni) del pre-mercato hanno sempre volume 0. Non ho trovato altre fonti gratuite con lo storico | Ho usato il **volume del giorno prima** rispetto alla media di 20 giorni |
| Volume nel pre-mercato | perpetual Bitunix 9:00–9:28 rispetto alla media degli ultimi 10 giorni (unico dato con lo storico) | da marzo 2026 |
| Volume nei primi minuti | per l'azione solo gli ultimi 30–60 giorni (Yahoo), troppo pochi per il 70/30. Uso il volume del perpetual nella candela delle 9:30 (Parte 2) | — |
| Trimestrali | calendario Nasdaq (`api.nasdaq.com/api/calendar/earnings`, gratuito, per data) | tutto il periodo; 339 titoli-giorno con trimestrale |
| Mercato | QQQ alle 9:28 rispetto alla chiusura del giorno prima | da marzo 2026 |

Gap, movimento e ampiezza sono misurati in "volatilità normale" del titolo, cioè la variazione giornaliera media degli ultimi 20 giorni. Ogni giorno i 115 titoli sono messi in fila da 0 a 1 per ogni misura.

### Quanto rendono i segnali, divisi per misura

Media per trade, in %, nei cinque gruppi dal più basso al più alto, prima sul 70% e poi sul 30%. Ogni gruppo ha circa 450–650 segnali.

| Misura alle 9:29 | Gruppi sul 70% (basso → alto) | Gruppi sul 30% (basso → alto) | Regge? |
|---|---|---|---|
| Gap | +0,01 · −0,14 · −0,06 · +0,17 · **+0,18** | +0,12 · +0,20 · +0,10 · −0,05 · **+0,08** | **no** |
| Movimento nel pre-mercato | −0,00 · −0,04 · +0,07 · +0,04 · **+0,13** | −0,10 · +0,23 · +0,14 · +0,12 · **+0,07** | **no** |
| Ampiezza nel pre-mercato | −0,04 · −0,01 · +0,02 · +0,09 · **+0,14** | +0,09 · +0,09 · +0,12 · +0,16 · **−0,02** | **no** |
| Volume del perpetual nel pre-mercato | +0,01 · −0,00 · −0,01 · +0,01 · **+0,18** | +0,00 · −0,05 · +0,07 · +0,19 · **+0,19** | **sì** (il gruppo più alto) |
| Volume dell'azione il giorno prima | +0,09 · −0,06 · −0,06 · +0,01 · **+0,20** | +0,09 · +0,12 · −0,01 · +0,14 · **+0,10** | debole |

| Altre misure | 70% | 30% | Regge? |
|---|---|---|---|
| Trimestrale quel giorno (sì / no) | −0,02% (121) / +0,05% | +0,33% (101) / +0,08% | **no**: pochi casi e risultati opposti |
| Mercato alle 9:29 a favore del trade / contro | +0,08% / +0,01% | +0,23% / −0,09% | sì nei segnali, ma **no** nella simulazione (sotto) |
| Gap del titolo nella direzione del trade / contro | +0,01% / +0,10% | +0,20% / −0,07% | **no**: si inverte |

Il punteggio scelto sul 70% è la media delle cinque misure, tutte con il gruppo più alto migliore del più basso sul 70%. Sul 30% resta debole: gruppi +0,07 · +0,12 · +0,08 · +0,07 · +0,11.

### Simulazione: i posti ai titoli più "in gioco"

Prima dell'apertura non si sa quali segnali arriveranno. Per dare i posti ai titoli più in gioco ho provato quattro varianti:
- **Solo i titoli più in alto:** alle 9:29 si scelgono i titoli con il punteggio più alto (il 25% o il 50%) e solo loro possono entrare.
- **Stesso minuto:** tra segnali dello stesso minuto, prima quello con il punteggio più alto.
- **Mercato a favore:** solo segnali nella direzione del QQQ alle 9:29.
- **Combinazione** delle ultime due cose con i titoli più in alto.

**115 titoli** (media di 10 ordini casuali):

| Variante | 70%, 0,05% | 70%, 0,08% | 30%, 0,05% | 30%, 0,08% |
|---|---|---|---|---|
| **Attuale** | **+239%** (143 – 382) | **+162%** (85 – 278) | **+50%** (18 – 73) | **+30%** (−5 – 57) |
| Stesso minuto: punteggio più alto prima | +343% | +225% | +66% | +47% |
| Solo i 29 con punteggio più alto | +183% | +127% | +43% | +28% |
| Solo i 29 con più volume nel pre-mercato | +179% | +112% | +29% | +3% |
| Solo i 58 con punteggio più alto | +311% | +203% | +22% | +5% |
| Solo i 58 con più volume nel pre-mercato | +201% | +130% | +27% | +7% |
| Mercato alle 9:29 a favore | −1% | −29% | +65% | +45% |
| Mercato a favore + solo i 58 col punteggio più alto | +146% | +89% | +50% | +34% |

**32 titoli operabili su Bitunix:**

| Variante | 70%, 0,05% | 70%, 0,08% | 30%, 0,05% | 30%, 0,08% |
|---|---|---|---|---|
| **Attuale** | **+60%** (53 – 67) | **+24%** (18 – 30) | **+71%** (66 – 73) | **+45%** (40 – 46) |
| Stesso minuto: punteggio più alto prima | +64% | +26% | +67% | +40% |
| Solo gli 8 con punteggio più alto | +42% | +24% | +11% | +6% |
| Solo i 16 con punteggio più alto | +24% | +1% | +22% | −4% |
| Solo i 16 con più volume nel pre-mercato | +49% | +21% | +20% | +5% |
| Mercato alle 9:29 a favore | +59% | +28% | +58% | +40% |
| Mercato a favore + solo i 16 col punteggio più alto | +50% | +30% | +41% | +28% |

**Cosa regge e cosa no:**
- **Limitare i titoli ai più "in gioco" peggiora sempre**, nel 70% e nel 30%, con i 115 e con i 32. Il gruppo più alto rende di più per trade, ma i segnali buoni arrivano anche dagli altri titoli: tagliandoli si perdono più trade buoni di quanti cattivi si evitano.
- **Mercato alle 9:29 a favore:** non regge. Nel 70% sui 115 crolla da +239% a −1%: con 0,08% scatta anche il limite di perdita totale.
- **Stesso minuto, punteggio più alto prima:** l'unica variante migliore sui 115 in tutte e due le metà. Però è un solo ordine fisso, e il suo risultato resta dentro la variabilità degli ordini casuali (nel 70% +343% contro un massimo di +382%). Sui 32 è uguale nel 70% e peggiore nel 30%. **Non regge abbastanza** per cambiare la regola.

## Parte 2 — Falsi segnali

### Al momento dell'entrata

Media per trade in tre gruppi (basso · medio · alto). I gruppi sono decisi sul 70% e usati uguali sul 30%.

| Misura all'entrata | 70% | 30% | Regge? |
|---|---|---|---|
| Mercato (QQQ dall'apertura, nella direzione del trade) | +0,09 · +0,07 · −0,02 | −0,17 · +0,10 · +0,31 | **no**: si inverte |
| Movimento già fatto prima dell'apertura (gap nella direzione, in volatilità) | +0,10 · +0,08 · −0,05 | −0,13 · +0,19 · +0,20 | **no**: si inverte |
| Ampiezza della prima candela (in unità; solo entrate dalle 9:31) | +0,02 · +0,01 · −0,07 | +0,11 · +0,03 · +0,00 | sì, debole |
| Volume della prima candela rispetto al normale (solo entrate dalle 9:31) | −0,07 · −0,05 · +0,08 | −0,00 · +0,02 · +0,14 | sì |
| Distanza dalla soglia | quasi sempre 0 (si entra alla soglia) | | non utile |
| **Orario d'entrata** | vedi sotto | | **sì, il più netto** |

**Orario d'entrata** (tutti i segnali):

| Entrata | 70%: segnali · media · vinti | 30%: segnali · media · vinti |
|---|---|---|
| 9:30 (prima candela) | 888 · **+0,16%** · 72% | 551 · **+0,22%** · 74% |
| 9:31–9:32 | 687 · **+0,09%** · 73% | 720 · **+0,24%** · 76% |
| 9:33–9:34 | 277 · −0,14% · 70% | 273 · −0,13% · 67% |
| 9:35–9:39 | 356 · −0,04% · 67% | 350 · −0,05% · 67% |
| 9:40–9:59 | 445 · −0,06% · 65% | 421 · −0,08% · 60% |

Nei primi tre minuti i segnali sono positivi; dalle 9:33 in poi sono negativi. È uguale nel 70% e nel 30%, e sono molti segnali.

### Nei primi minuti dopo l'entrata (70%)

In unità di volatilità del titolo (la stessa misura dello stop), mediane:

| Dopo | Ritorno: vincenti / perdenti | Massimo guadagno toccato | Massima perdita toccata | Rientrati sotto la soglia |
|---|---|---|---|---|
| 1 minuto | +0,05 / −0,07 | 0,17 / 0,08 | 0,26 / 0,28 | 35% / 60% |
| 2 minuti | +0,07 / −0,12 | 0,21 / 0,10 | 0,27 / 0,31 | 35% / 66% |
| 5 minuti | +0,14 / −0,20 | 0,32 / 0,13 | 0,30 / 0,39 | 31% / 75% |
| 10 minuti | +0,23 / −0,31 | 0,45 / 0,15 | 0,32 / 0,53 | 27% / 80% |

**Il segnale più precoce di un falso segnale** è il **rientro sotto la soglia nel primo minuto**: lo fa il 60% dei perdenti e il 35% dei vincenti.
- Lo stesso vale per la **mancata partenza**: massimo guadagno sotto 0,1 unità.
- **Non è affidabile:** un vincente su tre fa la stessa cosa, perché molti vincenti tornano a toccare la soglia prima di partire. La massima perdita toccata nei primi minuti è quasi uguale tra vincenti e perdenti.

### Regole di uscita anticipata

Ho provato 105 regole: rientro sotto la soglia, rientro oltre l'apertura, mancata partenza, massima perdita toccata, trade in perdita, ognuna dopo 1, 2, 3, 4, 5, 7 o 10 minuti, con diverse soglie. Si esce alla chiusura di quel minuto, con slittamento e commissioni.

Le prime sei per risultato sul 70% (Δ = somma della variazione in % per trade):

| Regola | 70%: perdenti tagliati · vincenti rovinati · Δ | 30%: perdenti tagliati · vincenti rovinati · Δ |
|---|---|---|
| Massima perdita ≥ 0,5 unità dopo 10 minuti | 391 di 791 · 267 di 1862 · **+145** | 330 di 693 · 299 di 1622 · **−123** |
| Massima perdita ≥ 0,5 unità dopo 7 minuti | 332 · 259 · +126 | 284 · 295 · −153 |
| In perdita (< −0,25 unità) dopo 7 minuti | 396 · 205 · +104 | 341 · 193 · −42 |
| Rientro oltre l'apertura dopo 7 minuti | 242 · 101 · +97 | 179 · 69 · **+5** |
| Massima perdita ≥ 0,5 unità dopo 5 minuti | 275 · 233 · +88 | 240 · 272 · −127 |
| Rientro oltre l'apertura dopo 4 minuti | 182 · 89 · +79 | 124 · 62 · **+9** |

Le regole sulla mancata partenza nel primo minuto sono le peggiori: rovinano troppi vincenti (Δ da −190 a −418).

**Nella simulazione completa** (10 posizioni, freno, limiti; media di 10 ordini casuali):

| Regola | 115: 70% (0,05 / 0,08) | 115: 30% (0,05 / 0,08) | 32: 70% (0,05 / 0,08) | 32: 30% (0,05 / 0,08) |
|---|---|---|---|---|
| **Attuale** | **+239% / +162%** | **+50% / +30%** | **+60% / +24%** | **+71% / +45%** |
| Uscita: massima perdita ≥ 0,5 dopo 10 min | +197% / +129% | +32% / +15% | +79% / +49% | +15% / −8% |
| Uscita: rientro oltre l'apertura dopo 4 min | +208% / +135% | +58% / +32% | +93% / +54% | +45% / +21% |
| Uscita: rientro oltre l'apertura dopo 7 min | +194% / +123% | +65% / +42% | +87% / +42% | +42% / +19% |
| Entrata: no se la prima candela ha poco volume | +186% / +122% | +60% / +38% | +63% / +31% | +56% / +32% |
| Entrata: no se la prima candela è troppo ampia | +246% / +176% | +34% / +15% | +62% / +27% | +43% / +28% |
| Entrata: solo fino alle 9:33 (4 minuti) | +231% / +167% | +50% / +30% | +58% / +32% | +77% / +56% |

**Finestra d'entrata più corta.** È già un'opzione dell'app, oggi tra 5, 10, 15 e 30 minuti; il motore accetta da 1 a 30. Curva completa sui **32 operabili**:

| Finestra | 70%, 0,05% | 70%, 0,08% | 30%, 0,05% | 30%, 0,08% | Trade (70% + 30%) |
|---|---|---|---|---|---|
| 2 minuti | +48% | +27% | +89% | +70% | 512 + 246 |
| **3 minuti (fino alle 9:32)** | **+64%** (60 – 67) | **+39%** (34 – 41) | **+83%** (76 – 86) | **+63%** (57 – 66) | 625 + 319 |
| 4 minuti | +58% | +32% | +77% | +56% | 683 + 354 |
| 5 minuti | +52% | +23% | +78% | +57% | 730 + 373 |
| 10 minuti | +63% | +28% | +80% | +56% | 852 + 434 |
| **30 minuti (attuale)** | **+60%** (53 – 67) | **+24%** (18 – 30) | **+71%** (66 – 73) | **+45%** (40 – 46) | 966 + 477 |

- **Sui 115 titoli:** la finestra non cambia niente nel 30%. I 10 posti si riempiono comunque nei primi minuti.
- **Sul 70%** la finestra migliore è quella da 10 minuti: +257% / +181% contro +239% / +162%.

**Cosa regge e cosa no:**
- **Uscite anticipate: nessuna regge.** Quella migliore sul 70% perde sul 30%, sia nei segnali sia nella simulazione. Le uniche non negative sul 30% (rientro oltre l'apertura dopo 4 o 7 minuti) peggiorano il 70% sui 115 e il 30% sui 32. I vincenti di questa strategia spesso tornano indietro prima di partire: tagliarli costa quanto si risparmia sui perdenti.
- **Filtri sulla prima candela (volume, ampiezza):** nei segnali reggono un po', nella simulazione no. Il risultato cambia di segno tra le due metà o tra 115 e 32.
- **Orario d'entrata: regge.**
  - Nei segnali, dalle 9:33 in poi la media è negativa, sia nel 70% sia nel 30%, con circa 1000 segnali per parte.
  - Nella simulazione con i 32 operabili la finestra di 3 minuti, scelta sul 70%, è migliore dell'attuale in tutti e quattro i casi: con 0,08% di slittamento +39% contro +24% sul 70%, **+63% contro +45% sul 30%**.
  - Sui 115 non cambia niente nel 30%.
  - **Attenzione:** sul 70% con 0,05% il vantaggio è piccolo (+64% contro +60%) e la curva non è regolare (4 e 5 minuti fanno peggio di 3 e di 10).

## Raccomandazione

1. **Non aggiungere il punteggio "in gioco".** Né come filtro dei titoli né come priorità: non regge sul 30% e con i 32 operabili peggiora. L'unica misura che regge nei singoli segnali (volume del perpetual nel pre-mercato) non migliora la strategia quando si usano i posti veri. Il volume pre-mercato dell'azione vera non c'è gratis: se in futuro servisse, ci vuole una fonte a pagamento (es. Polygon, Databento) e un nuovo test.
2. **Non aggiungere uscite anticipate per i falsi segnali.** Il segno più precoce (rientro sotto la soglia nel primo minuto) c'è, ma lo fa anche un vincente su tre. Nessuna regola regge sul 30%.
3. **Da provare in Prova: finestra d'entrata di 3 minuti con i 32 titoli operabili** (entrate solo fino alle 9:32).
   - È l'unico risultato che regge: in tutti e quattro i casi della simulazione e, nei singoli segnali, in tutte e due le metà.
   - Va d'accordo con l'entrata veloce: i segnali migliori sono quelli dei primi minuti.
   - Il vantaggio però è piccolo sul 70% con lo slittamento basso. La finestra da 3 minuti oggi non c'è tra le scelte della pagina (5, 10, 15, 30), quindi andrebbe aggiunta.
   - Consiglio di farlo girare qualche settimana in Prova prima del Reale.
4. **Con i 115 titoli** (per esempio su un altro exchange, vedi `docs/altri-exchange.md`) la finestra non serve: i posti si riempiono comunque nei primi minuti.

## Come rifare il test

Script nello scratchpad della sessione, cartella `ig/`. La copia del motore con gli agganci è in `ig/shared/`.
- `fetch.mjs`: Yahoo e calendario Nasdaq;
- `feat.mjs`: punteggi alle 9:29 e tutti i segnali;
- `p1a.mjs`: gruppi per misura;
- `p1b.mjs`: simulazioni Parte 1;
- `p2a.mjs`: falsi segnali e regole;
- `p2b.mjs`: regole nella simulazione;
- `p2c.mjs`: finestra d'entrata.

Risultati in `p1a.json`, `p1b.json`, `p2a.json`, `p2b.json` e `p2c.json`.
