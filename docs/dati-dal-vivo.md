# Dati dal vivo: cosa salvano Prova e Reale e il confronto serale con la Simulazione

Scopo: confrontare ogni giorno quello che succede davvero (Reale e Prova) con la Simulazione dello stesso giorno, e misurare nel tempo dove la Simulazione si discosta dal vivo.

Tutto quello che c'è qui è **solo registrazione**. Non cambiano le regole della strategia né il modo in cui il Reale apre e chiude.
- Le registrazioni si fanno dopo l'ordine, mai prima.
- Sono dentro `try/catch`: se una registrazione non riesce, il trade va avanti uguale.
- Il primo prezzo oltre la soglia dell'entrata veloce si salva dopo le entrate di quel secondo.

Codice: `server/record.js` (registrazione), `server/compare.js` (confronto serale e recupero dei giorni passati), più le chiamate in `server/strategy.js`, `server/fast.js` e `server/fast-run.js`. Prove: `node tests/fast.test.mjs`.

## Cosa c'era già (prima di questa modifica)

| Dato | Dove |
|---|---|
| Apertura, stop iniziale, unità di volatilità, livello più vicino, quantità, leva, margine, capitale, prezzo di liquidazione | colonne di `wt_positions` (`open_price`, `init_stop`, `unit`, `level`, `qty`, `leverage`, `margin`, `capital`, `liq_price`) |
| Segnale d'entrata: origine (veloce o minuto), ora, prezzo letto, soglia; ordine inviato, esecuzione | `wt_positions.exchange.timing` (`src`, `signalAt`, `sigPx`, `level`, `orderAt`, `fillAt`) |
| Reale: soglia ed esecuzione in entrata, livello ed esecuzione in uscita, commissioni e funding veri | `wt_positions.exchange.slip` (`sigIn`, `sigPx`, `fillIn`, `sigOut`, `fillOut`, `fee`, `funding`, `byExchange`) |
| Reale: id di ordine, posizione e stop su Bitunix, ora d'invio | `wt_positions.exchange` (`orderId`, `clientId`, `positionId`, `slOrderId`, `sl`, `sentAt`) |
| Massimo guadagno toccato | `wt_positions.best` (prezzo) |
| Preparazione del mattino di ogni titolo (livelli, ATR, unità, volume normale) | `wt_prep` (giorno, titolo) |
| Titoli scartati del giorno, solo il motivo | wt_meta `orbskip:<giorno>` |
| Freno di mercato scattato (ora, perdita) | wt_meta `brake:<giorno>` |
| Indice di attività | wt_meta `mindex:<giorno>` |
| Controllo veloce: aperture delle 9:30 e riepilogo di ogni chiamata (ultime 10) | wt_meta `fast:opens:<giorno>`, `fast:runs:<giorno>` |
| Reale: posizioni aperte e chiuse subito (stop rifiutato), con il costo | wt_meta `closecost:<giorno>` |

**Cosa mancava:**
- la massima perdita toccata e l'ora del massimo e del minimo;
- per le uscite: l'ora del segnale e la candela, l'ora d'invio dell'ordine, l'ora d'esecuzione e lo slittamento di ogni uscita (anche la metà);
- i livelli del mattino dentro il trade (c'era solo il più vicino) e lo stop iniziale originale (`init_stop` cambia con "Metà subito");
- quante posizioni erano aperte e lo stato di freno e limiti all'entrata;
- l'ora e il prezzo dei segnali scartati;
- il primo prezzo oltre la soglia nell'entrata veloce;
- le impostazioni e il capitale usati quel giorno (le impostazioni possono cambiare dopo);
- le esecuzioni vere di Bitunix per ordine.

## Cosa si salva adesso

### 1. Ogni trade: `wt_positions.exchange.rec` (Prova e Reale)

Scritto all'apertura, aggiornato ogni minuto mentre la posizione è aperta, completato alla chiusura e la sera.

| Campo | Contenuto |
|---|---|
| `open`, `threshold`, `unit` | prezzo d'apertura usato, soglia d'entrata, unità di volatilità |
| `prep` | livelli del mattino (massimo, minimo e chiusura di ieri, massimo e minimo a 5 giorni), ATR, ATR della prima candela, unità, giorni di storico |
| `nearest` | livello più vicino nella direzione del trade |
| `stop0`, `stopBx` | stop iniziale calcolato e stop vero messo su Bitunix |
| `entry` | `src` (veloce o minuto), `bar` (candela del segnale), `sigAt` (ora del segnale al millisecondo), `sigPx` (prezzo letto), `level` (soglia), `orderAt` e `sentAt` (ordine inviato), `fillAt` e `fillPx` (eseguito), `delayMs` (dal segnale all'esecuzione), `slipPct` (soglia → eseguito, negativo = peggio), `orderId`, `positionId`, `slOrderId` |
| `size` | quantità, leva, margine, valore della posizione, capitale, prezzo di liquidazione |
| `state` | all'entrata: posizioni aperte (`openNow`), trade già fatti oggi (`takenToday`), posti del giorno (`maxPos`, `reduced` con l'indice basso), indice di attività, freno già scattato, risultato del giorno fino a lì, capitale dedicato, soglie di freno e limiti |
| `mx` | prezzo più alto (`hi`, `hiAt`) e più basso (`lo`, `loAt`) toccati con la posizione aperta. Si calcolano sulle candele chiuse dopo quella d'entrata e sui prezzi letti a ogni controllo. `k` = massimo e minimo della candela d'entrata, tenuti a parte perché contengono anche i prezzi prima dell'entrata. Il massimo guadagno e la massima perdita in % si ricavano da qui (il confronto serale li calcola: `mfe`, `mae`) |
| `exits[]` | una riga per uscita, metà compresa (`kind`: `metà` o `finale`). Campi: `reason`; `level` (livello del motore); `sigAt` e `bar` (quando è stata decisa: chiusura della candela, oppure il controllo sul prezzo del momento); `sentAt` e `doneAt` (invio e risposta di Bitunix); `fillPx`, `fillAt` e `slipPct` (eseguito); `qty`; `byExchange` (chiusa dallo stop di Bitunix, ora del segnale non nota); `asked` (motivo trovato dall'app, se poi la posizione risultava già chiusa da Bitunix) |
| `exits[].readPx`, `exits[].rank`, `exits[].prova` | prezzo letto nel controllo che ha deciso l'uscita; ordine di chiusura nel freno; in Prova, il tipo e lo slittamento applicati (docs/be-e-prova-realistica.md). All'entrata della Prova: `exchange.prova` = prezzo letto, tipo e slittamento |
| `hist` | Reale: dati della posizione chiusa dallo storico di Bitunix (aperta e chiusa alle, prezzi medi, commissioni, funding, risultato, liquidazione) |
| `bx` | Reale, aggiunto la sera: esecuzioni vere di Bitunix (`fills`) e i loro totali per ordine (`orders`: id, quantità, prezzo medio, commissione, ora, maker o taker). L'entrata vera va in `entry.bxPx` e `entry.bxAt`; ogni uscita riceve `fillAt`, `orderId`, `fee` e `role` del suo ordine di chiusura |

In Prova `fillPx` è il prezzo a cui Prova registra l'operazione (il livello del segnale): Prova non ha esecuzioni vere.

### 2. Segnali (aperti e scartati): wt_meta `sig:<giorno>:<modalità>:<titolo>`

Una riga per giorno, modalità e titolo, con la lista degli eventi (al massimo 20):
- `kind`: `aperto`, `scartato` oppure `già preso da un altro controllo`;
- `why`: il motivo dello scarto;
- `at`, `px`, `level`, `side`, `src`, `bar`: ora, prezzo letto, soglia, lato, origine e candela del segnale;
- `seenAt`: quando l'app l'ha registrato.

I motivi sono quelli di sempre:
- posti finiti: `limite posizioni al giorno`;
- livello troppo vicino: `minimo di ieri troppo vicino` e simili;
- stop rifiutato: `non operabile via API: stop loss non accettato` e `stop oltre la liquidazione`;
- limite scattato: `freno di mercato`, `perdita massima giornaliera superata`, `strategia ferma`;
- posizione manuale, saldo insufficiente, leva oltre il massimo, ordine non riuscito o non riconosciuto.

Gli scarti di tutto il conto (freno, limiti, indice sotto il minimo) sono registrati senza prezzo, perché non riguardano un segnale.

`orbskip:<giorno>` resta com'era: la strategia lo usa per non ricontrollare i titoli scartati.

I titoli esclusi perché non operabili via API non arrivano mai ai controlli. Sono nelle impostazioni del giorno (punto 4, `excluded`).

### 3. Entrata veloce: primo prezzo oltre la soglia, wt_meta `fast:first:<giorno>`

Per modalità e titolo, il primo prezzo letto oltre la soglia. Vale per **tutti** i titoli scelti, anche quelli già presi o scartati, e anche prima delle 9:35 con la regola dell'indice:
- `at`: ora al millisecondo del giro di prezzi (uno al secondo);
- `px`, `side`, `level`, `open`;
- `before`: ultimo prezzo letto prima, ancora sotto la soglia, con la sua ora;
- `min`, `call`: minuto e chiamata del controllo veloce;
- `taken`, `skip`: se il titolo in quel momento era già preso o scartato, e perché;
- `early`, `late`: prima o dopo la finestra d'entrata;
- `followed`: se quella modalità era seguita dal controllo veloce.

Il riepilogo di ogni chiamata (`fast:runs:<giorno>`) ha ora anche `firsts`, il numero di primi passaggi registrati. Nel caso di TSM il registro teneva solo l'ultima chiamata: adesso restano tutte le chiamate del giorno e, per ogni titolo, l'istante del passaggio.

### 4. Impostazioni del giorno: wt_meta `dayset:<modalità>:<giorno>`

Scritte una volta, dalle 9:25 alle 9:29 di New York; vince la prima. Contengono:
- `settings`: impostazioni usate, con i soli titoli operabili;
- `chosen`: titoli scelti;
- `excluded`: titoli esclusi perché non operabili, con il motivo;
- `capital`: capitale dedicato di partenza;
- `balance`: saldo di Prova.

Servono al confronto serale per simulare il giorno con le regole di quel giorno, anche se le impostazioni cambiano dopo. Se si modificano durante la giornata, conta la versione delle 9:25.

## Confronto serale: wt_meta `cmp:<giorno>`

**Quando gira:** nel controllo ogni minuto, fuori orario (dopo le 16:35 di New York, prima delle 7:50 e nel fine settimana), dopo l'archivio. Un giorno per giro, a partire dal primo giorno del Reale (9 novembre). I giorni già fatti non si rifanno. Aspetta che l'archivio abbia le candele del giorno per tutti i titoli; dopo 2 giorni confronta con quelle che ci sono.

**Cosa fa, in ordine:**
1. Carica le candele dell'archivio (40 giorni prima, come la Simulazione).
2. Ricostruisce `exchange.rec` dei trade che non ce l'hanno: i giorni prima di questa versione (vedi sotto).
3. Reale: legge le esecuzioni vere dallo storico di Bitunix e le aggiunge in `rec.bx`. Solo lettura. Se il tempo non basta, continua al giro dopo.
4. Simula il giorno per ogni modalità. Usa le sue impostazioni del giorno (`dayset`; se mancano, quelle attuali, segnato `settingsFrom: "attuali"`) e il capitale di inizio giornata (quello del primo trade, altrimenti `dayset`). Per il Reale lo stop oltre la liquidazione non si apre mai e la commissione è quella vera, 0,06%. Lo slittamento è quello impostato.
5. Salva il confronto.

**Contenuto di `cmp:<giorno>`:**
- `modes.live`, `modes.paper`:
  - `sim` e `real`: numero di trade e risultato in USDT e in % del capitale;
  - `sim.limitEvents`: freno e limiti scattati nella Simulazione;
  - `matched`, `onlySim`, `onlyReal`: trade presenti in tutti e due, solo nella Simulazione, solo nel vivo;
  - `avg`: differenze medie;
  - `rows`: un trade per riga (vedi sotto);
  - `signals`: per ogni titolo con qualcosa, cosa hanno fatto il vivo e la Simulazione (aperto o scartato e perché, ora o minuto, prezzo).
- Ogni riga di `rows` ha `sim` (entrata, uscita, motivo, risultato %) e `real` (lo stesso, più soglia, livello d'uscita, commissioni, funding, `mfe`, `mae`). Se ci sono tutti e due c'è anche `d`:
  - `entryMin`: minuti di differenza all'entrata;
  - `entryPct`, `exitPct`: differenza di prezzo in entrata e in uscita, positivo = il vivo ha fatto meglio;
  - `resPct`: risultato del vivo meno quello della Simulazione, in punti %;
  - `sameReason`, `exitMin`: stesso motivo d'uscita e minuti di differenza all'uscita.
  - Se c'è un solo lato, `why` dice perché manca l'altro (motivo dello scarto nel vivo o nella Simulazione).
- `livePaper`: Reale e Prova sugli stessi titoli, con le stesse differenze.
- `firsts`: primo prezzo oltre la soglia, dal controllo veloce (`src: "veloce"`, al secondo) oppure, per i giorni senza, dalle candele (`src: "candele"`, al minuto).
- `immediate`: posizioni del Reale aperte e chiuse subito, con il costo vero.
- `rebuilt`, `bitunix`, `ms`: trade ricostruiti, esecuzioni lette da Bitunix, durata.

Il risultato % è in % del valore della posizione, commissioni comprese. Così si confronta anche quando la Simulazione e il vivo hanno capitali diversi.

**Lettura:** `GET /api/strategy/compare` (codice di controllo) elenca i giorni con il riepilogo; `GET /api/strategy/compare?day=AAAA-MM-GG` dà il confronto completo; `POST /api/strategy/compare/run` con `{ "day": "AAAA-MM-GG" }` lo rifà. Per ora non c'è una pagina nell'app.

## Giorni già passati (9, 10 e 11 novembre)

Li recupera da solo il confronto serale al primo giro fuori orario dopo il deploy. Si recupera:
- **Livelli del mattino:** da `wt_prep`, esatti.
- **Entrata:** da `exchange.timing` e `exchange.slip`, già salvati, esatti.
- **Stato all'entrata** (posizioni aperte, trade già fatti, risultato del giorno, freno, indice): ricostruito dagli altri trade del giorno, da `brake:` e da `mindex:`.
- **Massimo e minimo toccati:** dalle candele da 1 minuto dell'archivio, tra la candela d'entrata e la chiusura (`mx.approx: true`). Alla risoluzione del minuto, senza i prezzi letti a ogni controllo.
- **Uscite:** motivo, livello (`slip.sigOut`), prezzo eseguito (`slip.fillOut`), ora di chiusura. Nel Reale, ora ed esecuzione vere dallo storico di Bitunix (`rec.bx`). Non c'è l'ora del segnale d'uscita, perché prima non si salvava.
- **Primo prezzo oltre la soglia:** dalle candele, al minuto. Al secondo non si recupera: i prezzi letti dal controllo veloce non venivano salvati.
- **Segnali scartati:** il motivo da `orbskip:` e il minuto dalla Simulazione; senza ora e prezzo del vivo.
- **Impostazioni:** quelle attuali, perché `dayset:` non c'era. Se Prova o Reale sono cambiati dopo, il confronto di quei giorni ne risente: è segnato `settingsFrom: "attuali"`. Per Prova del 9 novembre succede: ASTS e SMCI risultano "nessun segnale" nel vivo, quindi Prova quel giorno aveva un'altra lista di titoli.

Il recupero scrive solo `exchange.rec` nelle righe del giorno, marcato `backfill: true`. Risultati, prezzi e capitale non cambiano.

## Prime letture (prova senza scrivere, 9–11 novembre)

Sono 3 giorni: indicazioni, non misure.
- **10 novembre, Reale:** 8 trade su 10 in comune con la Simulazione, tutti con lo stesso motivo d'uscita. In media il vivo fa −0,34 punti per trade, quasi tutto in uscita (−0,22). Il caso più grande è USAR: stop che segue, +1,56% simulato contro +0,02% vero. È lo stesso effetto descritto in `docs/percorso-candela.md`.
- **11 novembre, Reale:** BE esce per «resistenza» a +5,24% nel vivo, mentre la Simulazione la chiude alle 9:45 per «nessuna conferma» (−0,12%). Prova ha fatto come la Simulazione. Quindi il controllo della conferma alle 9:45 ha dato un esito diverso nel Reale: da guardare a parte, con le candele del vivo e quelle dell'archivio.
- **Prova contro la sua Simulazione:** con il freno di mercato Prova esce in media circa 0,6 punti meglio. Prova chiude al prezzo letto in quel momento; la Simulazione chiude all'apertura della candela dopo, più lo slittamento.

## Limiti

- Con una modalità seguita solo dal controllo ogni minuto (filtro volume acceso), finiti i posti del giorno quei titoli non si scaricano più. I loro segnali successivi non si vedono nel vivo; nel confronto restano visibili dalla Simulazione. Il controllo veloce invece guarda tutti i titoli fino alle 10:00.
- La lettura delle esecuzioni (`get_history_trades` di Bitunix) ha funzionato al primo giro su Vercel: 26 trade del Reale su 26 dal 9 all'11 novembre. Se un giorno Bitunix rispondesse in un altro formato, `rec.bx.error` lo dice e il resto del confronto va avanti.
- Bitunix dà le ore delle esecuzioni al secondo intero (`fillAt`, `bxAt`). Per i ritardi sotto il secondo valgono le ore dell'app (`sigAt`, `orderAt`, `sentAt`), misurate al millisecondo.
- Il confronto usa le candele dell'archivio. Prova e Reale usano quelle lette durante la giornata, che possono differire di poco.
