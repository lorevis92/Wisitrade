# ICC Scanner

Metodo ICC: Indication, Correction, Continuation. Lo scanner lo applica a tutti i perpetual di Bitunix con volume sufficiente.

È solo analisi e segnalazione: non manda nessun ordine all'exchange.

Dove sta il codice:

- **Regole:** `shared/icc.js`. Sono deterministiche, senza AI, e uguali per lo scanner dal vivo e per il backtest.
- **Server:** `server/icc.js`.
- **Pagina:** `src/pages/Icc.jsx` (menu Mercato → ICC Scanner).
- **Prove:** `node tests/icc.test.mjs`.

## Dati

- **Universo:** i perpetual USDT aperti su Bitunix con volume 24h (USDT) sopra una soglia per categoria. Le soglie di default sono:
  - crypto: 5 milioni;
  - azioni: 300 mila;
  - materie prime: 300 mila.

  Si prendono al massimo 200 mercati, i più scambiati. L'elenco si ricalcola ogni 6 ore (wt_meta `icc:universe`).
- **Categorie:** Bitunix non le fornisce, quindi si ricavano così:
  - **azioni:** quelle note all'app (scanner e Apertura USA) o con "STOCK" nel nome;
  - **materie prime:** un elenco (XAU, XAUT, XAG, XPT, XPD, COPPER, NATGAS, petrolio, PAXG);
  - **crypto:** tutto il resto.
- **Candele:** 1D, 4H e 1H chiuse, archiviate in wt_meta `icc:k:<mercato>`: le ultime 400 giornaliere, 400 da 4 ore e 700 da 1 ora. Da Bitunix si scaricano solo quelle nuove.
- **Aggiornamento:** dopo ogni chiusura della candela 1H. Lo fa il controllo ogni minuto, a lotti entro circa 9 secondi per minuto.
  - Prima BTC, poi i mercati aggiornati da più tempo.
  - Il primo scaricamento è più lento; dalle ore dopo serve circa una richiesta per mercato.
  - bitunix.js resta sotto il limite di 8 richieste al secondo.
  - Non gira durante l'apertura USA (9:25–10:40 New York).
- **Salvataggio:**
  - stato di ogni mercato in wt_meta `icc:states`;
  - segnali e paper tracking nella tabella `wt_icc_signals` (migrazione in fondo a `supabase/schema.sql`).

## Motore

Si decide solo con dati noti in quel momento. Il ribassista è lo specchio del rialzista.

- **Swing:** un massimo è più alto delle 2 candele prima e almeno uguale alle 2 dopo (minimo speculare). Esiste dalla chiusura della seconda candela dopo.
- **Zone daily:** swing daily, massimi e minimi insieme, degli ultimi 180 giorni. Diventano zona quando sono almeno 2 entro 0,5 ATR daily. Con meno di 14 giorni di storico si usa la media delle escursioni al posto dell'ATR.
- **Trend daily:** dagli ultimi due swing high e swing low.
  - rialzista: massimi e minimi crescenti;
  - ribassista: massimi e minimi decrescenti;
  - laterale: tutti gli altri casi.
- **Indication:** una candela 4H chiude oltre il bordo di una zona daily, oppure oltre l'ultimo swing 4H non ancora usato. Nella candela prima il prezzo doveva essere ancora dentro.
  - **Livello rotto:** quel bordo o quello swing.
  - **Origine della rottura:** l'estremo opposto del movimento, cioè il minimo dall'ultimo swing low 4H alla candela di rottura, per il long.
  - **Estremo dell'Indication:** il massimo raggiunto prima della correzione.
- **Correction:** il prezzo 1H torna entro 0,5 ATR 4H dal livello rotto.
  - **Invalidato:** una chiusura 1H oltre l'origine, anche prima della correzione.
  - **Scaduto:** nessuna correzione entro 72 candele 1H, oppure correzione più lunga di 48 candele 1H.
  - **Correzione profonda:** il prezzo va oltre il livello rotto di più di 0,5 ATR 4H.
- **Continuation (segnale):** una chiusura 1H oltre l'ultimo swing della mini-struttura della correzione, nella direzione della rottura. Per il long è l'ultimo swing high 1H dopo l'estremo dell'Indication.
- **Prezzi del segnale:**
  - **entrata:** la chiusura della candela di segnale;
  - **stop:** oltre l'estremo della correzione, più 0,1 ATR 1H;
  - **TP1:** l'estremo dell'Indication;
  - **TP2:** la prossima zona daily oltre TP1.
- **R:R:** media di TP1 e TP2, perché si esce metà a ciascuno; solo TP1 se non c'è una zona. Un segnale vale solo con R:R ≥ 1,5 (impostazione); con R:R più basso il setup risulta "scartato".
- **Setup in corso:** uno per mercato. Una rottura nella direzione opposta lo sostituisce (il vecchio diventa invalidato).

## Classificazione e voto

- **Scenario:**
  - **a favore del trend:** la direzione coincide con il trend daily;
  - **inversione:** la direzione è contro il trend daily;
  - **rottura di range:** trend laterale e livello rotto che è una zona;
  - **in range:** trend laterale e livello rotto che è uno swing.

  La correzione profonda si segna a parte.
- **Voto:**
  - **A:** a favore del trend e R:R ≥ 2;
  - **B:** a favore del trend con R:R più basso, oppure rottura di range con R:R ≥ 2;
  - **C:** tutti gli altri.
- **Filtri:**
  - **Trend di BTC:** un'altcoin non dà segnali contro il trend daily di BTC.
  - **Stessa direzione:** al massimo 6 segnali attivi nella stessa direzione.

  I segnali filtrati restano registrati con il motivo, ma non contano nelle statistiche e non mandano notifiche.

## Paper tracking e statistiche

- **Registrazione:** ogni segnale si registra dal momento in cui il mercato è seguito e si segue sulle candele 1H fino all'esito.
- **Uscite:**
  - metà a TP1, poi stop a pareggio, e metà a TP2;
  - tutto a TP1 se non c'è TP2;
  - stop e TP nella stessa candela contano come stop;
  - dopo 240 candele 1H il trade si chiude alla chiusura.
- **Risultato:** in R. Il netto toglie le commissioni (0,06% per lato).
- **Statistiche:** win rate e R medio per scenario, voto, categoria e lato.
- **Notifiche push:** solo per i segnali A non filtrati, con il sistema già usato dall'app.

## Backtest

Fa girare lo stesso motore sullo storico dei mercati scelti, nel periodo scelto, con le stesse impostazioni e gli stessi filtri. Il trend di BTC arriva dallo storico giornaliero di BTC.

- **Candele:** archiviate a mesi in wt_meta `icc:m:`.
- **Limite:** al massimo 150 mercati × mesi per volta.
- **Accesso:** serve il codice di controllo.
- **Indipendenza:** non tocca i segnali dal vivo.

## Impostazioni

Pagina Impostazioni (per salvare serve il codice di controllo):

- swing e zone;
- correzione e scadenze;
- stop;
- R:R minimo e R:R per il voto A;
- limite di segnali nella stessa direzione e durata massima di un trade;
- commissione;
- soglie di volume per categoria e numero massimo di mercati;
- filtro BTC e notifiche.

I timeframe del metodo sono fissi: 1D per zone e trend, 4H per l'Indication, 1H per Correction e Continuation.
