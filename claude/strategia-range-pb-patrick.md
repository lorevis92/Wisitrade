# Strategia "Range P e B" (Patrick Nill) · appunti

Fonte: video "Everyone Laughed at His Strategy (Until He Dominated the World Cup 12 Times)", canale Trading Notes. Patrick: ex legatore di libri tedesco, trader dal 2018, più volte nella top 5 della Robbins World Cup (gara di trading sui futures). Opera circa un'ora al mattino, 1–2 trade, a volte dal telefono.

## Principi
1. I mercati stanno in range circa il 70% del tempo e in trend il 20–30%. I grandi operatori accumulano o distribuiscono liquidità nei range, poi spingono il prezzo verso la prossima area di valore. Il trader non prevede: si muove da un'area di fair value alla successiva.
2. Lo stop loss non si allarga mai per dare più spazio a un trade perdente. Si può solo portarlo a pareggio dopo un guadagno parziale.
3. Prima si decide lo stop in base alla struttura del mercato, poi la dimensione della posizione. Mai il contrario.

## Lettura del grafico: modello P e B
- **P:** forte movimento al rialzo seguito da un range laterale.
- **B:** forte movimento al ribasso seguito da un range laterale.
- **Timeframe:** 4 ore per il quadro generale, 15 minuti per decidere, 3–5 minuti solo per un'entrata precisa.
- Un range è valido dopo **almeno 3 tocchi** della zona. Sul 15 minuti una buona P richiede mezza giornata o un giorno intero. Più dura il range, più è probabile che la rottura funzioni.
- Prima di disegnare le zone guarda il market profile e il volume profile settimanale: una P o una B su quei livelli è più forte.

## Tre modi di operare il range
1. **Range trade:** ordine limite sul fondo del range con obiettivo la parte alta, o il contrario. Entrata e uscita nette, senza parziali.
2. **Breakout con conferma:** non si entra sulla prima candela fuori dal range. Si aspetta la chiusura fuori, il ritorno sul bordo e una candela che rompe il massimo o minimo della candela di breakout.
3. **Falso breakout con ritorno (il suo preferito):** il prezzo rompe il range, la spinta fallisce e rientra. Si entra nella direzione del ritorno, con stop minuscolo appena oltre l'estremo del falso breakout. Il potenziale di guadagno è ampio.

## Stop loss
- Sempre sotto o sopra un minimo o massimo di struttura: il bordo del range, l'estremo del falso breakout o un livello chiave del market profile.
- Se vicino non c'è una struttura di riferimento, parte dal target: accetta uno stop più ampio solo se il rapporto rischio/rendimento resta **sopra 3**.
- Lo stop non si allarga mai. Dopo il primo guadagno parziale si porta a pareggio.

## Take profit
- **Da fair value a fair value:** il target naturale è un range precedente sopra o sotto il prezzo.
- **3 contratti, uscite frazionate:**
  1. primo parziale sul bordo della zona più vicina;
  2. il secondo si gestisce guardando il prezzo in tempo reale;
  3. il terzo corre fino all'origine di tutto il movimento (il fair value iniziale).
- **Ai massimi storici, senza zone precedenti:** si misura l'ampiezza dell'impulso iniziale e la si proietta in avanti, 1:1.

## Esempi dal video (grafico a 15 minuti)
**Long su falso breakout**
1. Il 4 ore è rialzista.
2. Sul 15 minuti si forma una P (impulso al rialzo, poi range con almeno 3 tocchi).
3. Una candela rompe il range verso il basso. Patrick non vende: aspetta.
4. La candela successiva chiude di nuovo dentro il range: il falso breakout è confermato. Piazza un ordine limite d'acquisto sul bordo inferiore del range.
5. Stop appena sotto il minimo del falso breakout. Target non alla parte alta del range ma all'area di fair value successiva, più in alto: rischio/rendimento molto alto.

**Short su falso breakout**
1. Il 4 ore non è chiaro, ma c'è stato un forte impulso al rialzo che si è fermato: condizione buona per un trade d'inversione.
2. Sul 15 minuti si forma una P dopo l'impulso, con tre tocchi validi.
3. Il prezzo rompe la parte alta del range. Molti comprano, Patrick aspetta: la continuazione fallisce e il prezzo rientra.
4. Una candela chiude dentro il range. Vende sul bordo superiore del range.
5. Stop appena sopra il massimo del falso breakout. Parziale al bordo inferiore del range, stop a pareggio, il resto corre fino all'origine dell'impulso iniziale.

## Disciplina
- La differenza tra un trader comune e un campione è la costanza: applicare le regole ogni giorno senza paura né avidità.
- Anti-tilt: dopo 3–4 perdite di fila nello stesso giorno chiude e riprende il giorno dopo.

## Cosa sappiamo già dai nostri test (Wisi Trade)
- Il falso breakout sul range d'apertura delle azioni su Bitunix (14 nov 2026) **non funziona**: stop dello 0,3–0,45% contro circa 0,22% di costi andata e ritorno con ordini a mercato. Dettagli: docs/falso-breakout.md.
- La versione di Patrick è diversa:
  - range di ore sul 15 minuti dopo un impulso, validi solo con 3 tocchi;
  - contesto a 4 ore;
  - entrata con ordine limite sul bordo del range, che su Bitunix costa meno;
  - target lontani (il range precedente o l'origine dell'impulso) con rapporto rischio/rendimento sopra 3.
  Non è quindi esclusa dai nostri test.
- Mercati più adatti su Bitunix: BTC, ETH, oro, che scambiano quasi 24 ore su 24 con molta liquidità e hanno anni di storico.


## Approfondimento del metodo (novembre 2026)
- **Direzione:** falso breakout verso il basso con rientro = long; verso l'alto con rientro = short.
  - Vale sia nelle P sia nelle B, con qualunque trend a 4 ore.
  - Il trend a 4 ore è solo contesto (a favore, contro, neutro) e conta nella qualità del setup.
- **Patrick non opera mai l'impulso**, solo il range che lo segue.
- **Target:**
  - **Contro l'impulso** (short in una P, long in una B): prima il bordo opposto del range, poi l'origine dell'impulso.
  - **Nella direzione dell'impulso** (long in una P, short in una B): prima il bordo opposto, poi la prossima area di valore o la proiezione 1:1 dell'impulso.
  - Senza nessun riferimento: 2 volte il rischio.
- **Profilo settimanale al centro.** I livelli chiave sono la parte alta (VAH) e bassa (VAL) dell'area di valore settimanale e il prezzo con più scambi (POC).
  - Le zone con poco volume il prezzo le attraversa in fretta; quelle con molto volume lo frenano.
  - Un range o un falso breakout su uno di questi livelli vale molto di più.
- **Qualità del setup:**
  - allineamento ai livelli settimanali;
  - numero di tocchi e durata del range;
  - rischio/rendimento;
  - contesto a 4 ore;
  - volume debole sulla candela del falso breakout;
  - strada libera verso il target (poco volume) oppure ostacoli.
- **Uscite secondo il tipo di trade:**
  - range trade: tutto fuori sul bordo opposto, senza parziali;
  - breakout con conferma: circa il 30% al primo target, il resto corre;
  - falso breakout: tre terzi.
- **Entrata del falso breakout:** ordine limite sul bordo, oppure a mercato alla chiusura della candela di rientro.
- **Rischio:**
  - al massimo l'1% del capitale per trade;
  - prima lo stop, poi la dimensione;
  - un trade dura di solito da 4 ore a 3 giorni.
- **Notizie:** Patrick non tiene posizioni durante le notizie forti.

## Nota: la nostra è un'approssimazione
Il metodo di Patrick è in parte discrezionale. Lui legge anche il footprint e il flusso degli ordini (chi compra e chi vende a ogni prezzo, in tempo reale). Noi questi dati non li abbiamo: su Bitunix abbiamo solo le candele con il loro volume.

Le regole dell'app qui sotto sono quindi una nostra traduzione in regole fisse, da verificare in due passi:
1. **Con il registro automatico:** setup proposti dal vivo e il loro esito vero.
2. **Con un test sullo storico:** lo stesso riconoscimento su anni di candele, con il primo 70% per scegliere le impostazioni e l'ultimo 30% per verificarle.

Finché i casi sono pochi, i numeri non dicono ancora se il metodo funziona.

## Regole dell'app

Come la pagina Range di Wisi Trade (`/range`) traduce gli appunti in regole precise.
- Il codice è in `shared/range.js`, lo stesso per la pagina e per il server (avvisi push e registro, `server/range-alerts.js`).
- Le prove sono in `tests/range.test.mjs`.
- La pagina fa solo analisi: nessun ordine.

### Dati
- Candele di Bitunix:
  - 15 minuti degli ultimi 8 giorni, per decidere;
  - 1 ora, per il profilo settimanale;
  - 4 ore, per il contesto.
- Si usano solo candele chiuse.
- Niente dati futuri: ogni decisione usa solo le candele fino a quella che la fa scattare.
  - Il profilo della settimana in corso è quello fino a quel momento.
  - I range precedenti sono quelli già finiti.
  - Il trend a 4 ore usa le candele già chiuse.

### Trend a 4 ore (solo contesto)
Media esponenziale a 50 candele da 4 ore, circa 8 giorni.
- **Rialzista:** prezzo sopra la media e media in salita rispetto a 40 ore prima.
- **Ribassista:** prezzo sotto la media e media in discesa.
- **Laterale:** tutti gli altri casi.

Non decide la direzione dei setup: entra solo nel voto.

### Profilo settimanale
Il volume di ogni candela da 1 ora è distribuito sulle fasce di prezzo che tocca (60 fasce). Si calcola per la settimana precedente (completa, da lunedì 00:00 UTC) e per quella in corso (fino al momento considerato, con almeno 12 ore di dati).
- **POC:** la fascia con più volume.
- **VAL e VAH:** gli estremi della zona con il 70% del volume attorno al POC.
- **Zone con molto volume:** fasce con almeno 1,5 volte il volume medio; si tengono le 4 più grandi.
- **Zone con poco volume:** fasce con al massimo 0,35 volte il volume medio, larghe almeno 3 fasce e non agli estremi della settimana.
- Sul grafico:
  - POC, VAH e VAL a linee gialle, piene per la settimana in corso e tratteggiate per la precedente;
  - zone con molto volume in giallo chiaro, con poco volume in viola chiaro.
- Il market profile non è calcolato.

### Impulso
Un movimento di almeno 3 volte l'ATR a 15 minuti, la volatilità normale misurata prima dell'impulso.
- Deve avvenire in al massimo 16 candele (4 ore).
- Deve finire su un nuovo massimo (P) o un nuovo minimo (B).
- Continua finché le candele successive fanno nuovi estremi.
- L'impulso non si opera mai.

### Range
- **Bordo dal lato dell'impulso:** è l'estremo dell'impulso. L'altro bordo si allarga finché il range si forma.
- **Tocco:** il prezzo arriva al bordo entro 0,25 ATR. Un tocco nuovo conta solo dopo essersi allontanati dal bordo.
- **Valido:** almeno 3 tocchi in tutto, almeno uno per lato, e almeno 12 ore dalla fine dell'impulso. Da quel momento i bordi restano fermi.
- **Non è una P o una B** se ritraccia oltre il 60% dell'impulso, o se l'impulso riparte prima che il range sia valido. Se è durato almeno 2 ore resta sul grafico, chiaro, con la scritta "non valido".
- **Su livello settimanale:** dentro il range, entro mezzo ATR dai bordi, c'è un POC, VAH o VAL della settimana precedente o in corso.
- **Finito:**
  - dopo due chiusure di fila fuori dal range (breakout confermato);
  - oppure 5 giorni dopo essere diventato valido;
  - oppure se non diventa valido entro 5 giorni.

### Falso breakout (il modo principale)
- **Falso breakout:** una candela chiude fuori dal range e la successiva chiude di nuovo dentro.
- **Direzione:** long dopo un falso breakout verso il basso, short dopo uno verso l'alto. Vale nelle P e nelle B, con qualunque trend a 4 ore.
- **Entrata, due varianti** mostrate insieme, ognuna con il suo rapporto rischio/rendimento:
  - **ordine limite sul bordo** dal lato della rottura fallita: vale 4 ore (16 candele); se non viene eseguito, o se il prezzo arriva prima al primo target, il setup è scaduto;
  - **a mercato alla chiusura della candela di rientro**.
- **Stop:** appena oltre l'estremo del falso breakout, più 0,1 ATR, ma almeno mezzo ATR dall'entrata. Uno stop più stretto lo prende il rumore e gonfia il rapporto rischio/rendimento.
- **Target, un terzo ciascuno:**
  - **T1:** il bordo opposto del range. Dopo T1 lo stop va a pareggio.
  - **Contro l'impulso** (short in una P, long in una B):
    - T3 è l'origine dell'impulso;
    - T2 è la prima area di valore tra T1 e l'origine (range precedente, POC, VAH o VAL settimanali);
    - se non ce n'è, anche T2 è all'origine.
  - **Nella direzione dell'impulso** (long in una P, short in una B): T2 e T3 sono le due aree di valore successive; senza aree oltre, la proiezione 1:1 dell'impulso dal bordo.
  - **Senza nessun riferimento** oltre T1: 2 volte il rischio.
- **Valido:** rapporto rischio/rendimento fino all'ultimo target di almeno 3. Il trend a 4 ore non lo rende mai non valido.
- **Il secondo terzo**, che Patrick gestisce guardando il prezzo, qui va a una regola fissa: la prossima area di valore.

### Gli altri due modi (mostrati in modo meno evidente)
- **Range trade:**
  - appena il range è valido, ordine limite su tutti e due i bordi;
  - vale il primo eseguito;
  - tutto fuori sul bordo opposto, senza parziali;
  - stop mezzo ATR oltre il bordo;
  - se il range finisce prima, non eseguito.
- **Breakout con conferma:**
  1. Una candela chiude fuori dal range: è la candela di breakout.
  2. Il prezzo ritorna sul bordo, entro la tolleranza del tocco.
  3. Una candela rompe il massimo (o il minimo) della candela di breakout: lì è l'entrata, a mercato.
  - Stop oltre il minimo (o massimo) del ritorno, più 0,1 ATR, almeno mezzo ATR.
  - **Uscite:** il 30% al primo target (la prossima area di valore, o l'ampiezza del range proiettata dal bordo), poi stop a pareggio e il 70% corre fino alla successiva area di valore. Senza aree: la proiezione 1:1 dell'impulso se il breakout va nella sua direzione, altrimenti due volte l'ampiezza del range.
  - Annullato se una candela richiude dentro il range (è un falso breakout) o dopo 16 candele.

### Voto di qualità (A, B, C)
Punti sommati, ognuno spiegato nella card ("perché?"):
- **Livello settimanale:** il range o l'estremo del falso breakout è su un POC, VAH o VAL settimanale (entro mezzo ATR): **+2**.
- **Tocchi:** 5 o più: **+1**.
- **Durata:** range di 24 ore o più: **+1**.
- **Rischio/rendimento** fino all'ultimo target: 5 o più **+1**; sotto il minimo **−1**.
- **Trend a 4 ore:** a favore **+1**, contro **−1**, neutro 0.
- **Volume della candela di rottura,** rispetto alla media delle 20 candele prima:
  - falso breakout: 0,8 volte o meno (rottura poco convinta) **+1**; 1,5 volte o più (la rottura potrebbe essere vera) **−1**;
  - breakout con conferma: al contrario.
- **Strada verso il target,** dal primo all'ultimo target:
  - zona con molto volume o POC settimanale in mezzo (ostacolo): **−1**;
  - solo zone con poco volume (strada libera): **+1**.

Voto: **A** con 4 punti o più, **B** con 2–3, **C** con meno.

### Rischio
Nella card del setup c'è un calcolatore. Si inseriscono capitale e percentuale di rischio (di partenza 1%, il massimo di Patrick) e si vedono:
- la dimensione della posizione;
- la leva necessaria (con tutto il capitale come margine);
- la perdita in USDT se scatta lo stop, commissioni comprese.

Durata attesa di un trade: da 4 ore a 3 giorni.

### Notizie
Se nel Calendario c'è una trimestrale del titolo tra il giorno del setup e i 2 giorni dopo, il setup lo segnala.

Il Calendario ha solo le trimestrali delle azioni, senza ora. Le notizie macro (Fed, inflazione) e quelle delle crypto non ci sono.

### Commissioni (Bitunix, livello base)
- Ordine limite (maker): 0,02%.
- A mercato e stop (taker): 0,06%.
- Entrata limite sul bordo e target come ordini limite; entrata a mercato, breakout e stop a mercato.

I risultati sono in multipli del rischio: lordi, e netti con le commissioni.

### Registro automatico
- **Titoli seguiti:** di partenza BTC, ETH e oro, al massimo 8. Si cambiano dalla pagina con il codice di controllo.
- **Quando:** il server gira ogni 15 minuti, anche a pagina chiusa, nel controllo ogni minuto dopo la chiusura della candela. Si salta dalle 9:25 alle 10:40 di New York nei giorni feriali.
- **Cosa salva:** in `wt_range_trades`, ogni setup proposto da quando il titolo è seguito: falso breakout con entrata limite e a mercato, range trade, breakout con conferma. Usa sempre le impostazioni di partenza, così i numeri sono confrontabili.
- **Esito:** lo segue fino alla fine (entrata eseguita o no, target, stop, risultato lordo e netto). Un trade ancora aperto dopo 6 giorni si chiude come "dati finiti".
- **Statistiche nella pagina,** sui setup validi: per tipo di trade, P o B, a favore o contro l'impulso, contesto a 4 ore, voto e titolo, con la serie di perdite più lunga. Con pochi casi i numeri non valgono ancora: servono almeno 30–50 trade conclusi per gruppo.

### Avvisi push
- **Facoltativi,** per titolo (al massimo 8): range diventato valido e setup di falso breakout valido pronto.
- **Voto minimo:** si possono limitare ai setup con un voto da A, da B o da C in su.
- **Impostazioni:** quelle del browser al momento dell'attivazione.
- **Orari:** stessi giri del registro.

### Impostazioni modificabili (valori di partenza)
- Forza minima dell'impulso: 3 volte l'ATR.
- Durata massima dell'impulso: 16 candele.
- Tocchi minimi: 3.
- Durata minima del range: 12 ore.
- Tolleranza del tocco: 0,25 ATR.
- Rischio/rendimento minimo: 3.

Le regole fisse sono il ritracciamento massimo del 60%, lo stop (0,1 ATR, almeno mezzo ATR), l'entrata in attesa di 4 ore, la fine del range dopo due chiusure fuori o 5 giorni, e i punti del voto.
