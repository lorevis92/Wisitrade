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

## Regole dell'app

Come la pagina Range di Wisi Trade (`/range`) traduce gli appunti in regole precise. Il codice è in `shared/range.js`, lo stesso per la pagina e per gli avvisi push; le prove sono in `tests/range.test.mjs`. La pagina fa solo analisi: nessun ordine.

### Dati
- Candele di Bitunix:
  - 15 minuti degli ultimi 8 giorni, per decidere;
  - 1 ora, per il volume profile;
  - 4 ore, per il contesto.
- Si usano solo candele chiuse.
- Niente dati futuri: ogni decisione usa solo le candele fino a quella che la fa scattare.
  - Il volume profile è quello della settimana completa prima del momento considerato.
  - I range precedenti sono quelli già finiti.
  - Il trend a 4 ore usa le candele a 4 ore già chiuse.

### Trend a 4 ore
Media esponenziale a 50 candele da 4 ore, circa 8 giorni.
- **Rialzista:** prezzo sopra la media e media in salita rispetto a 40 ore prima.
- **Ribassista:** prezzo sotto la media e media in discesa.
- **Laterale (non chiaro):** tutti gli altri casi.

### Impulso
Un movimento di almeno 3 volte l'ATR a 15 minuti, la volatilità normale misurata prima dell'impulso. Deve avvenire in al massimo 16 candele (4 ore) e finire su un nuovo massimo (P) o un nuovo minimo (B). L'impulso continua finché le candele successive fanno nuovi estremi.

### Range
- **Bordo dal lato dell'impulso:** è l'estremo dell'impulso. L'altro bordo si allarga finché il range si forma.
- **Tocco:** il prezzo arriva al bordo entro 0,25 ATR. Un tocco nuovo conta solo dopo essersi allontanati dal bordo.
- **Valido:** almeno 3 tocchi in tutto, almeno uno per lato, e almeno 12 ore (mezza giornata) dalla fine dell'impulso. Da quel momento i bordi restano fermi.
- **Non è una P o una B** se ritraccia oltre il 60% dell'impulso, o se l'impulso riparte prima che il range sia valido. Se è durato almeno 2 ore resta sul grafico, chiaro, con la scritta "non valido".
- **Rafforzato:** quando diventa valido c'è dentro un livello del volume profile della settimana prima (POC, VAH o VAL).
  - Il volume di ogni candela da 1 ora è distribuito sulle fasce di prezzo che tocca.
  - POC è la fascia con più volume.
  - VAH e VAL sono gli estremi della zona con il 70% del volume.
  - Il market profile non è calcolato.
- **Finito:**
  - dopo due chiusure di fila fuori dal range (breakout confermato);
  - oppure dopo 5 giorni da quando è valido;
  - oppure se non diventa valido entro 5 giorni.

### Falso breakout e setup
- **Falso breakout:** una candela chiude fuori dal range e la successiva chiude di nuovo dentro.
- **Direzione:** long dopo un falso breakout verso il basso, short dopo uno verso l'alto.
- **Entrata:** ordine limite sul bordo del range dal lato della rottura fallita. Vale 4 ore (16 candele): se non viene eseguito, o se il prezzo arriva prima al bordo opposto, il setup è scaduto.
- **Stop:** appena oltre l'estremo del falso breakout, più 0,1 ATR, ma almeno mezzo ATR dall'entrata. Uno stop più stretto lo prende il rumore e gonfia il rapporto rischio/rendimento.
- **Target in tre parti**, un terzo ciascuno:
  - **T1:** il bordo opposto del range. Dopo T1 lo stop va a pareggio.
  - **Inversione** (contro l'impulso del range: short in una P, long in una B):
    - T3 è l'origine dell'impulso;
    - T2 è la prima area di valore tra T1 e l'origine: range precedente o POC, VAH o VAL della settimana prima;
    - se non ce n'è, anche T2 è all'origine.
  - **A favore dell'impulso** (long in una P, short in una B): l'origine è dall'altra parte.
    - T2 e T3 sono le due aree di valore successive.
    - Senza aree oltre, come ai massimi storici, si proietta l'impulso 1:1 dal bordo.
- **Rapporto rischio/rendimento:** si calcola fino all'ultimo target (T3). Si mostra anche quello di ogni terzo e la media dei tre, cioè il risultato se arrivano tutti e tre.
- **Setup valido:**
  - rapporto fino a T3 di almeno 3;
  - trend a 4 ore a favore;
  - con il trend non chiaro, solo l'inversione dopo un impulso forte che si è fermato (lo short in una P, il long in una B);
  - mai contro il trend a 4 ore.
- **Il secondo terzo** che Patrick gestisce guardando il prezzo qui va a una regola fissa: la prossima area di valore.

### Gli altri due modi (mostrati in modo meno evidente)
- **Range trade:** ordine limite sul bordo, obiettivo il bordo opposto, senza parziali. Stop mezzo ATR oltre il bordo.
- **Breakout con conferma:**
  1. Una candela chiude fuori dal range: è la candela di breakout.
  2. Il prezzo ritorna sul bordo, entro la tolleranza del tocco.
  3. Una candela rompe il massimo (o il minimo) della candela di breakout: lì è l'entrata.
  - Stop oltre il minimo (o massimo) del ritorno, più 0,1 ATR, almeno mezzo ATR.
  - Obiettivo: l'ampiezza del range proiettata dal bordo.
  - Annullato se una candela richiude dentro il range (è un falso breakout) o dopo 16 candele.

### Storico dei setup
Per i setup passati degli ultimi 8 giorni l'app ricostruisce com'è andata:
- entrata limite eseguita o no;
- poi stop (−1 volta il rischio) oppure un terzo a ogni target, con lo stop a pareggio dopo T1.

Il risultato è in multipli del rischio, senza commissioni. Sono pochi casi: servono a capire, non come statistica.

### Avvisi push
Facoltativi, per titolo (al massimo 8):
- range diventato valido;
- setup valido pronto.

Si controllano una volta ogni 15 minuti, dopo la chiusura della candela, con le impostazioni del browser al momento dell'attivazione. Non si controllano dalle 9:25 alle 10:40 di New York nei giorni feriali, per lasciare la precedenza alla strategia Apertura USA.

### Impostazioni modificabili (valori di partenza)
- Forza minima dell'impulso: 3 volte l'ATR.
- Durata massima dell'impulso: 16 candele.
- Tocchi minimi: 3.
- Durata minima del range: 12 ore.
- Tolleranza del tocco: 0,25 ATR.
- Rischio/rendimento minimo: 3.

Le regole fisse sono il ritracciamento massimo del 60%, lo stop (0,1 ATR, almeno mezzo ATR), l'ordine limite di 4 ore e la fine del range dopo due chiusure fuori o 5 giorni.
