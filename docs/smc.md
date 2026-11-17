# Strategia SMC

Traduzione in algoritmo della strategia del video: liquidità, poi order flow, poi order block con FVG, poi entrata sul ritorno con rischio/rendimento almeno 1:3.

Le regole stanno in `shared/smc.js` e sono le stesse per Simulazione, Prova e Reale. Il server è in `server/smc.js`, la pagina in `src/pages/Smc.jsx` (menu Strategie → SMC).

Le prove si lanciano con:

- `node tests/smc.test.mjs`: regole, con candele costruite a mano;
- `node tests/smc-live.test.mjs`: Prova e Reale contro un Bitunix finto.

## Titoli e timeframe

- **Titoli:** scelti tra le coppie Bitunix operabili via API (crypto e azioni), con ricerca. Di default BTCUSDT ed ETHUSDT, al massimo 30.
- **Timeframe di direzione:** 1h, 4h (default) o 1d.
- **Timeframe d'entrata:** 5m, 15m (default) o 1h. Deve essere più corto di quello di direzione.
- **Candele chiuse:** si decide solo su candele chiuse e senza dati futuri. Ogni informazione esiste solo da quando è nota:
  - uno swing esiste dalla chiusura della candela che lo conferma;
  - uno swing del timeframe di direzione esiste dalla chiusura della sua candela C;
  - massimo e minimo del giorno e della settimana prima esistono dall'inizio del giorno (UTC) e della settimana (lunedì UTC) successivi.

## Definizioni

- **ATR:** 14 periodi, media di Wilder, sul timeframe d'entrata.
- **Swing:** frattale di tre candele A, B, C.
  - **Swing high in B:** B.h > A.h e C.l < B.l.
  - **Swing low in B:** B.l < A.l e C.h > B.h.

  È confermato alla chiusura di C.
- **Livelli di liquidità:** gli swing high (liquidità sopra) e gli swing low (liquidità sotto) dei due timeframe, più massimo e minimo del giorno prima e della settimana prima.
  - **Unione:** due livelli dello stesso lato entro 0,15 ATR diventano uno solo e contano un tocco in più. Il prezzo del livello unito è l'estremo, cioè il più alto per i massimi e il più basso per i minimi.
  - **Forza:** il timeframe (settimana 4, giorno 3, direzione 2, entrata 1) più il numero di tocchi.
  - **Importante:** un livello del timeframe di direzione, del giorno o della settimana prima, oppure del timeframe d'entrata con almeno 2 tocchi.
  - **Preso:** il prezzo lo supera (massimo > livello, minimo < livello). Da quel momento non vale più.
- **FVG:** tre candele 1, 2, 3.
  - **Rialzista:** 3.l > 1.h.
  - **Ribassista:** 3.h < 1.l.

  Ampiezza minima 0,1 ATR.
- **Order block rialzista:** l'ultima candela ribassista (chiusura < apertura) prima del movimento al rialzo che crea un FVG rialzista.
  - Si cerca partendo dalla candela 1 del FVG e andando indietro di al massimo 5 candele.
  - Una candela fino alla 3 del FVG deve chiudere sopra il massimo della candela dell'order block.
  - **Zona:** dal minimo al massimo della candela.
  - L'order block ribassista è lo specchio.
- **Direzione (order flow):** dagli ultimi due swing high e dagli ultimi due swing low confermati del timeframe di direzione.
  - **Ribassista:** sia i massimi sia i minimi sono decrescenti.
  - **Rialzista:** sia i massimi sia i minimi sono crescenti.
  - **Neutra:** tutti gli altri casi.

## Setup short (il long è lo specchio esatto)

1. **Direzione:** dev'essere ribassista. Con direzione neutra non si fa nessun trade, salvo con l'interruttore "Trade anche con direzione neutra".
2. **Livello:** sopra il prezzo c'è un livello di liquidità importante non ancora preso.
3. **Order block:** nella salita verso il livello c'è un order block rialzista con il suo FVG. Se ce n'è più di uno, vale l'ultimo prima della presa.
4. **Presa:** una candela supera il livello.
5. **Inversione:** entro 20 candele dalla presa servono due cose:
   - un FVG ribassista la cui candela 1 non viene prima della candela della presa;
   - una candela che chiude sotto il minimo dell'order block.
6. **Ritorno e rifiuto:** entro 40 candele dall'inversione il prezzo risale nella zona (massimo ≥ minimo della zona). Quella candela, o una delle due dopo, chiude sotto il minimo della zona: è la candela di rifiuto.
7. **Decadenza:** prima dell'entrata il setup decade se succede una di queste cose:
   - una candela chiude sopra il massimo della candela della presa;
   - dopo l'inversione, una candela chiude sopra il massimo della zona;
   - dopo l'inversione, il prezzo tocca il target;
   - scade una delle finestre.

## Entrata, stop, target

- **Entrata:** a mercato subito dopo la chiusura della candela di rifiuto.
  - **Simulazione:** all'apertura della candela dopo, con lo slittamento.
  - **Prova e Reale:** al prezzo del controllo ogni minuto.
- **Stop:** massimo della candela di rifiuto + 0,25 ATR. Con l'opzione "Stop oltre la presa", invece, massimo della presa + 0,25 ATR.
- **Target:** il primo livello di liquidità importante non preso sotto il prezzo d'entrata.
  - Uscita totale al target o allo stop, nessun parziale.
  - Con l'opzione "Target = primo livello con R/R minimo" (spenta di default) si prende il primo livello che dà rischio/rendimento ≥ 3, invece di scartare il setup.
- **Filtri sul prezzo d'entrata vero:**
  - rischio/rendimento ≥ 3;
  - commissioni + slittamento stimati (entrata e uscita allo stop, come nella pagina Range) ≤ 20% del rischio.

  Altrimenti il setup si scarta e si registra il motivo.

## Rischio

- **Dimensione:** la perdita allo stop è il 2% del capitale attuale della strategia.
- **Leva:** ricavata dalla dimensione, con margine al massimo uguale a capitale ÷ posizioni massime e mai oltre il massimo di Bitunix.
  - Se non basta, la posizione si riduce e il rischio scende sotto il 2%.
  - Se lo stop cade oltre il prezzo di liquidazione, il trade si salta.
- **Limiti:**
  - una posizione per titolo;
  - al massimo 3 posizioni aperte insieme;
  - perdita massima del giorno (UTC) del 6% del capitale di inizio giorno, poi niente nuove entrate fino al giorno dopo.

## Simulazione

- **Storico:** candele di Bitunix dei titoli scelti, archiviate a mesi in wt_meta. Il periodo si può scegliere; il pulsante "Tutto lo storico di Bitunix" lo porta fino al 2019.
  - La prima volta su tutto lo storico a 15 minuti servono alcuni minuti per titolo.
  - L'inizio dello storico si riconosce da due mesi vuoti di fila.
- **Avvio del calcolo:** parte con 200 candele d'entrata di storico già caricate.
- **Costi:** commissioni taker e slittamento su entrata e uscita. Il funding è stimato allo 0,01% per periodo, sempre pagato.
- **Stop e target nella stessa candela:**
  - si guardano le candele da 1 minuto di Bitunix, per al massimo 300 candele, archiviate in `smc:m1:<titolo>`;
  - minuto per minuto, se nello stesso minuto ci sono tutti e due conta lo stop;
  - senza candele da 1 minuto conta lo stop.
- **Risultati:**
  - capitale finale, rendimento, calo massimo, numero di trade, % vinti, R medio, profit factor;
  - costi: commissioni, funding e slittamento;
  - andamento del conto e risultati per titolo, per direzione e per mese;
  - elenco dei trade e dei setup scartati con il motivo;
  - grafico con i trade.

## Prova e Reale

- **Quando girano:** partono solo con Avvia e girano dal controllo ogni minuto sul server (`runSmc` in `server/tick.js`), anche a pagina chiusa.
- **Uscite:** si controllano ogni minuto.
- **Analisi:** alla chiusura di ogni candela d'entrata, con le ultime 2000 candele d'entrata, 400 di direzione e 400 giornaliere archiviate in wt_meta `smc:bars:`.
- **Entrata:** solo se il rifiuto è sull'ultima candela chiusa e al massimo 3 minuti dopo la sua chiusura. Altrimenti il motivo va nel registro.
- **Prova:**
  - capitale fittizio;
  - prezzi realistici come nella Prova di Apertura USA: slittamento misurato nel Reale (`liveslip`), "entrata al minuto" per l'entrata, "stop che segue" per stop e target;
  - stop e target controllati sulle candele da 1 minuto chiuse dal controllo precedente e sul prezzo di adesso; se cadono nello stesso minuto conta lo stop;
  - funding al tasso vero di Bitunix;
  - liquidazione simulata.
- **Reale:** stesse protezioni di Apertura USA e Turtle (`server/live.js`), senza eccezioni.
  - Ordini solo con LIVE_TRADING=on, chiavi e codice di controllo.
  - Margine isolato verificato.
  - Stop dentro l'ordine d'apertura, verificato dopo e ricontrollato ogni 5 minuti.
  - Chiusura subito se lo stop manca e non si riesce a rimettere, o se è oltre la liquidazione.
  - Mai su titoli con posizioni o ordini non suoi: le posizioni manuali di Lorenzo, Apertura USA e Turtle.
  - Mai il capitale riservato ad Apertura USA: il saldo libero è quello disponibile su Bitunix meno il suo capitale dedicato non impegnato.
  - Prenotazione del segnale contro i doppi ordini, in `claim:smc-live:<ora>:<titolo>`.
  - **Target:** sull'ordine di Bitunix (tpsl, solo per quel positionId) se lo accetta. Altrimenti lo chiude l'app a mercato appena il prezzo lo raggiunge.
- **Convivenza:** stesse regole di Turtle.
  - Non apre sui titoli di Apertura USA quando questa è accesa nel Reale.
  - Nessuna entrata durante l'apertura USA (9:25–10:40 New York); le uscite continuano.
- **Avvisi push**, ognuno disattivabile:
  - setup in attesa del ritorno;
  - entrata;
  - uscita;
  - setup decaduto (spento di default).
- **Registrazione:** ogni trade salva tutte le variabili:
  - livello preso, order block, FVG, FVG dell'inversione, candela della presa e di rifiuto, direzione, ATR;
  - stop, target, rischio/rendimento previsto, sull'eseguito e reale;
  - costi;
  - prezzi e orari di segnale ed esecuzione.

Nessuna tabella nuova: tutto sta in wt_meta, con le chiavi elencate in cima a `server/smc.js`.

## Scelte prudenti dove la regola non era definita

- **Salita verso il livello:** parte dall'estremo opposto (il minimo, per lo short) delle ultime 60 candele dopo la nascita del livello. L'order block deve trovarsi in quel tratto, con la sua zona sotto il livello. Non deve essere stato rotto da una chiusura oltre la zona prima della presa.
- **Order block e FVG:** a una stessa candela d'order block si lega il primo FVG del movimento.
- **Massimo della presa:** è il massimo della candela che prende il livello.
  - La decadenza per chiusura sopra quel massimo vale dalla candela dopo la presa.
  - La decadenza per chiusura sopra la zona vale solo dopo l'inversione: alla presa il prezzo è per forza sopra la zona.
  - Con l'opzione "Stop oltre la presa" lo stop si mette oltre l'estremo raggiunto dalla presa fino al rifiuto: è più lontano, quindi più prudente.
- **Target toccato prima dell'entrata:** si controlla solo dopo l'inversione, sul primo livello importante oltre la zona.
- **Un setup per lato e per titolo:**
  - una nuova presa sostituisce un setup che aspetta ancora l'inversione;
  - non sostituisce un setup che aspetta già il ritorno.
- **Livelli già superati alla conferma:** uno swing già superato dalla sua candela C, o dalle candele di direzione chiuse dopo, non diventa un livello.
- **Durata dei livelli:** quelli del timeframe d'entrata valgono 500 candele dall'ultimo tocco, quelli di direzione 100 candele di direzione; poi spariscono. Questo tiene la Simulazione e il controllo dal vivo, che guarda le ultime 2000 candele, sugli stessi livelli.
- **Livelli del giorno e della settimana prima:** valgono solo per quel giorno e per quella settimana.
- **Rifiuto visto tardi:** se il controllo ogni minuto vede il rifiuto oltre 3 minuti dopo la chiusura, non si entra.
- **Filtri nel Reale:** si calcolano prima dell'ordine, sul prezzo letto peggiorato dello slittamento delle impostazioni. Dopo l'esecuzione la posizione resta aperta e si registra il rischio/rendimento sull'eseguito.
- **Stop nel Reale:** è messo alla stessa distanza dal prezzo eseguito, come per Apertura USA.
- **Setup decaduti nelle notifiche:** si avvisa solo per i setup già segnalati come "in attesa del ritorno".
- **Funding nella Simulazione:** è sempre pagato, anche dallo short.
