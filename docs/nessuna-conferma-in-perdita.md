# "Nessuna conferma" con il trade in perdita

Ricerca sullo storico, senza nessuna modifica alla strategia.

## La regola di oggi

La regola sta in `shared/engine.js`, `stepBar`, e scatta alla chiusura della candela da 15 minuti in cui è avvenuta l'entrata.

- **Conferma:** il volume di quella candela è almeno 1,5 volte il normale e il prezzo è dalla parte giusta del VWAP.
- **Senza conferma:** il trade si chiude solo se in quel momento è in guadagno. Se è in perdita resta aperto e prosegue con le uscite normali:
  - stop;
  - ritracciamento;
  - resistenza;
  - freno di mercato;
  - chiusura di fine giornata.

La domanda è cosa succede ai trade tenuti aperti in perdita con il volume sotto la soglia, e se sarebbe stato meglio chiuderli subito.

## Come è stata fatta

- **Motore e dati:** lo stesso motore della Simulazione, su una copia fuori dall'app che registra in più solo i valori del controllo. Candele da 1 minuto dell'archivio, dal 23/3/2026 al 10/11/2026 (circa 145 giorni di borsa).
- **Impostazioni:** quelle di partenza della strategia:
  - 10 posizioni al giorno, margine 10%, leva 5;
  - commissione 0,06% e slittamento 0,05% per lato, funding 0,01%;
  - limiti di perdita 10% al giorno e 30% in totale, freno all'8%.
- **Due insiemi di titoli:**
  - tutti i 115 titoli dell'archivio;
  - i 32 titoli operabili via API, come in Prova e Reale.
- **Casi presi:** il controllo è avvenuto, il volume era sotto 1,5 volte il normale e il trade era in perdita (prezzo di chiusura della candela contro l'entrata, slittamento d'entrata compreso).
- **"Chiuso subito":** si esce al prezzo di chiusura di quella candela, con lo slittamento e le commissioni d'uscita.
- **"Tenuto":** il risultato vero della Simulazione.
- **R:** risultato netto diviso per il rischio iniziale (quantità × distanza tra entrata e stop). 1R è la perdita piena allo stop.

## Quanti casi

|                                   | 115 titoli | 32 operabili |
|-----------------------------------|-----------:|-------------:|
| Trade in totale                   | 1.501      | 1.463        |
| Arrivati al controllo             | 955        | 1.077        |
| Con volume sotto soglia           | 740        | 861          |
| … e in guadagno (chiusi oggi)     | 351        | 405          |
| **… e in perdita (tenuti aperti)** | **389**    | **456**      |

Circa 4 trade su 10 di quelli arrivati al controllo rientrano in questo caso. La perdita mediana al momento del controllo è dell'1,2% sul valore della posizione (115 titoli) e dello 0,95% (32 titoli), commissioni comprese.

## Cosa è successo dopo

| Trade tenuti aperti                                        | 115 titoli    | 32 operabili  |
|------------------------------------------------------------|--------------:|--------------:|
| Ripresi e chiusi in guadagno                               | 174 (45%)     | 211 (46%)     |
| Chiusi peggio della perdita al controllo                   | 179 (46%)     | 196 (43%)     |
| … di cui arrivati allo stop loss                           | 74 (19%)      | 87 (19%)      |
| Chiusi meglio che chiudendo subito, anche se in perdita    | 210 (54%)     | 259 (57%)     |

Nei casi rimanenti il risultato è identico.

Come sono finiti (115 titoli; i 32 operabili sono simili):

- **Ritracciamento:** 126, in guadagno nel complesso.
- **Chiusura di fine giornata:** 139.
- **Stop:** 74.
- **Resistenza:** 25.
- **Freno di mercato:** 25.

I trade chiusi in guadagno hanno fatto in media +0,28R. Quelli allo stop hanno perso in media −1,05R, mentre chiudendoli al controllo avrebbero perso circa −0,46R.

## Tenerli o chiuderli subito

| Risultato medio per trade | Tenuti (regola di oggi) | Chiusi subito | Differenza       |
|---------------------------|------------------------:|--------------:|-----------------:|
| 115 titoli                | −0,243R (−1,23%)        | −0,288R (−1,49%) | +0,045R (±0,025) |
| 32 operabili              | −0,225R (−1,02%)        | −0,290R (−1,24%) | +0,065R (±0,023) |

La percentuale è sul valore della posizione; ± è l'errore standard.

- **Il risultato:** in media tenerli aperti è stato un po' meglio, circa 0,05–0,06R per trade.
- **I due insiemi:** la differenza va nello stesso verso per i 115 titoli e per i 32 operabili, ed è al limite della significatività (2–3 errori standard).
- **Valore complessivo:** su 389–456 casi in circa 8 mesi, sono circa 20–30R a favore della regola di oggi.
- **Per mese:** tenere è stato meglio in 8 mesi su 9 con i 115 titoli e in 6 su 9 con i 32. Ha perso soprattutto ad agosto, e con i 32 anche a giugno.

Per lato e VWAP:

| | Tenuti | Chiusi subito |
|---|---:|---:|
| VWAP giusto, cioè volume basso ma prezzo dalla parte giusta (32 operabili) | −0,076R | −0,157R |
| VWAP sbagliato (32 operabili) | −0,319R | −0,375R |
| Long (32 operabili) | −0,266R | −0,284R |
| Short (32 operabili) | −0,187R | −0,296R |

I numeri dei 115 titoli vanno nello stesso verso. In nessun gruppo chiudere subito è stato chiaramente meglio: per i long il risultato è quasi uguale.

## Mercato laterale o ripresa della direzione

Il gruppo si decide guardando dove arriva il prezzo a fine giornata rispetto al momento del controllo, nella direzione del trade, in unità di volatilità del titolo:

- **Ripresa:** almeno +0,5 unità.
- **Laterale:** tra −0,5 e +0,5 unità.
- **Contro:** −0,5 unità o peggio.

| 32 operabili (115 titoli tra parentesi) | Casi      | In guadagno | Peggio del controllo | Allo stop | Tenuti            | Chiusi subito     |
|-----------------------------------------|----------:|------------:|---------------------:|----------:|------------------:|------------------:|
| Ripresa della direzione                 | 159 (132) | 89% (91%)   | 6% (4%)              | 5% (4%)   | +0,201R (+0,232R) | −0,287R (−0,265R) |
| Laterale                                | 196 (151) | 31% (28%)   | 48% (53%)            | 13% (15%) | −0,285R (−0,326R) | −0,292R (−0,304R) |
| Contro                                  | 101 (106) | 9% (11%)    | 90% (89%)            | 52% (43%) | −0,779R (−0,715R) | −0,293R (−0,294R) |

- **Ripresa:** tenere guadagna circa mezza R per trade rispetto a chiudere. Quasi tutti i trade chiudono in positivo, perché il ritracciamento protegge il guadagno.
- **Laterale:** tenere o chiudere dà quasi lo stesso risultato. Gran parte chiude a fine giornata con una perdita simile a quella del controllo.
  - Con l'altra definizione di laterale (prezzo mai oltre 0,5 unità né a favore né contro dopo il controllo) restano solo circa 20 casi, con lo stesso risultato: −0,31R tenuti, −0,31R chiusi.
- **Contro:** tenere costa circa mezza R in più per trade. Metà dei trade arriva allo stop.

Ripresa e contro si bilanciano, con una leggera prevalenza della ripresa, e il laterale è neutro. Per questo la media complessiva è appena a favore di tenerli.

## Conclusione

- **La regola di oggi regge sullo storico.** Chiudere subito anche i trade in perdita senza conferma avrebbe peggiorato di poco il risultato, di circa 0,05R per caso.
- **Nessun criterio utile in tempo reale.** Laterale, ripresa e contro si sanno solo a giornata finita. Al momento del controllo i dati semplici, cioè VWAP e lato, non separano i casi abbastanza da giustificare una chiusura: anche con il VWAP sbagliato tenere è stato leggermente meglio.
- **Da qui ad altre prove:** un miglioramento possibile, da provare a parte, non sarebbe chiudere al controllo ma ridurre il danno del gruppo contro, per esempio con uno stop più stretto solo per questi trade. Questo non è stato testato.

## Limiti

- **Ricalcolo approssimato:** nel confronto chiudere subito non ricalcola il resto della giornata. Il capitale liberato, i posti, i limiti di perdita e il freno restano quelli della Simulazione: è un confronto trade per trade.
- **Periodo e caso di oggi:** è un periodo di circa 8 mesi. Il caso di ASTS di oggi (17/11, Reale in perdita di 5 centesimi al controllo) è proprio di questo tipo e non è compreso nei dati, che finiscono il 10/11.
