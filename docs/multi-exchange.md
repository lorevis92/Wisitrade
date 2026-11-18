# Apertura USA su più exchange

Da questa versione la strategia Apertura USA può operare su più exchange. Oggi sono due:

- **Bitunix**, quello di prima;
- **Bitget**, che parte spento.

Le regole restano quelle di `shared/engine.js`, uguali per tutti. Simulazione, pagine RSI, Range e Livelli e ordini manuali non cambiano: la Simulazione usa sempre i dati di Bitunix.

## Ogni exchange è un conto a sé

Prova e Reale esistono per ogni exchange e ognuno ha le sue cose:

- interruttore acceso/spento;
- impostazioni e configurazione attiva;
- capitale dedicato;
- limiti di perdita e freno di mercato;
- titoli operabili e titoli esclusi;
- prenotazioni dei titoli: lo stesso titolo può essere aperto su Bitunix e su Bitget nello stesso giorno, se c'è il segnale;
- storico, statistiche e confronto serale.

Gli exchange accesi girano in contemporanea. Dati e risultati non si mescolano mai.

### Chiave del conto

La chiave è la colonna `mode` di `wt_accounts` e `wt_positions`:

| | Prova | Reale |
|---|---|---|
| Bitunix | `paper` | `live` |
| Bitget | `paper:bitget` | `live:bitget` |

Bitunix tiene le chiavi di prima, quindi conti, storico, impostazioni e statistiche esistenti sono diventati la sezione Bitunix senza nessuna migrazione dei dati.

Le chiavi di `wt_meta` per conto usano la stessa chiave del conto, per esempio `capital:live:bitget`, `claim:live:bitget:<giorno>:<titolo>` e `active:paper:bitget`. Quelle per exchange hanno il suffisso dell'exchange; Bitunix non ha suffisso:

| Cosa | Bitunix | Bitget |
|---|---|---|
| Titoli scartati di oggi | `orbskip:<giorno>` | `orbskip:bitget:<giorno>` |
| Freno di mercato | `brake:<giorno>` | `brake:bitget:<giorno>` |
| Preparazione del Reale | `preset:<giorno>` | `preset:bitget:<giorno>` |
| Costo delle posizioni chiuse subito | `closecost:<giorno>` | `closecost:bitget:<giorno>` |
| Titoli rifiutati | `api:marks` | `api:marks:bitget` |
| Slittamento per la Prova | `liveslip` | `liveslip:bitget` |
| Confronto serale | `cmp:<giorno>` | `cmp:bitget:<giorno>` |
| Aperture del controllo veloce | `fast:opens:<giorno>` | `fast:opens:bitget:<giorno>` |
| Coppie e limiti | `pairs`, `bitunix:limits` | `bitget:pairs`, `bitget:limits` |

La preparazione del giorno sta in `wt_prep` con il giorno `<giorno>` per Bitunix e `<giorno>@bitget` per Bitget.

## Prezzi e candele

Ogni exchange decide entrate, stop e uscite sui suoi prezzi e sulle sue candele, perché i contratti sono diversi.

- **Controllo ogni minuto** (`server/tick.js`): candele da 1 minuto solo dei titoli che servono a quell'exchange, cioè le posizioni aperte e i titoli ancora in gioco nella finestra d'entrata. Gli exchange si scaricano in parallelo, ognuno con il suo limite di richieste.
- **Controllo veloce dell'apertura** (`server/fast.js`, `server/fast-run.js`): una sola richiesta di prezzi in blocco al secondo per ogni exchange acceso, in parallelo. Ogni conto usa i prezzi, l'apertura delle 9:30 e la preparazione del suo exchange.
- **Preparazione del mattino**: livelli e volatilità dalle candele da 15 minuti dell'exchange. Il volume normale minuto per minuto viene dall'archivio per Bitunix e dalle API di Bitget per Bitget, sui 10 giorni di borsa precedenti.
- **Indice di attività del mercato**: comune a tutti, calcolato come prima.

## Adattatori

Tutto quello che parla con un exchange sta in un adattatore in `server/exchanges/` (`bitunix.js`, `bitget.js`, elenco in `index.js`), con la stessa interfaccia:

- **dati:** coppie, candele, prezzi in blocco, limiti di leva e margine;
- **conto:** saldo;
- **api per `server/live.js`:** posizioni, ordini, margine, leva, stop, chiusure;
- **storico:** posizione chiusa ed esecuzioni.

`server/live.js` con le regole di sicurezza è uno solo per tutti gli exchange.

**Per aggiungere un exchange:**

1. una voce in `shared/venues.js`;
2. un adattatore in `server/exchanges/`;
3. le due righe di `wt_accounts`. Il vincolo del database accetta già `<tipo>:<exchange>`.

## Bitget

- **Titoli:** perpetui USDT dei titoli (categoria `USDT-FUTURES`, `symbolType` "stock"), con le API v2 dei futures, perché il conto è Classic.
  - CATERPILLAR e GAMESTOP diventano `CATUSDT` e `GMEUSDT`.
  - Gli 8 titoli senza perpetuo su Bitget sono esclusi in automatico: DIS, NOK, ACN, HIMS, RIVN, NVO, PAYP e SHLD.
- **Prima di ogni ordine** si impostano e si verificano:
  - la modalità **one-way**, che su Bitget vale per tutto il conto futures USDT;
  - il margine **isolato** sul titolo;
  - la **leva** delle impostazioni.

  Se non riesce, il trade si salta con una notifica. Bitget cambia la modalità one-way solo senza posizioni né ordini aperti sul conto: se ci sono, nessun trade parte finché non sono chiusi.
- **Posizioni:** non hanno un positionId. L'identificativo è `titolo|lato|ora di apertura`. Si apre solo se sul titolo non c'è niente, quindi la posizione nuova è riconoscibile con certezza come su Bitunix.
- **Stop:** dentro l'ordine (`presetStopLossPrice`), verificato subito e poi ogni minuto. Se manca si rimette con `place-tpsl-order` per la quantità della strategia.
- **Ordine minimo:** 5 USDT, controllato prima di qualunque chiamata.
- **Le stesse protezioni di Bitunix:**
  - ordini veri solo con `LIVE_TRADING=on`, le chiavi Bitget e il conto Reale Bitget acceso;
  - leva mai oltre il massimo;
  - stop mai oltre la liquidazione;
  - posizioni e ordini manuali mai toccati;
  - titoli rifiutati esclusi e riprovati dopo 7 giorni.
- **Variabili su Vercel:** `BITGET_API_KEY`, `BITGET_API_SECRET`, `BITGET_API_PASSPHRASE`, gli stessi nomi di `.env.local`.

### Cosa non è ancora verificato su Bitget

Durante lo sviluppo non è partito nessun ordine vero né di prova. Le letture del conto sono state verificate con le chiavi vere: saldo, impostazioni per titolo, posizioni, ordini, stop attivi e storico.

Le scritture sono provate solo su un Bitget finto (`tests/exchanges.test.mjs`): modalità one-way, margine, leva, ordine, stop, chiusure. Il formato delle chiamate segue la documentazione delle API v2. Il primo ordine vero dirà se:

- in one-way lo stop della posizione e `holdSide` = buy/sell sono accettati come previsto;
- l'ora di apertura della posizione (`cTime`) resta la stessa dopo una chiusura parziale;
- ci sono blocchi per paese o KYC, che emergono solo all'invio di un ordine.

Altri limiti:

- la verifica a posteriori dello storico degli stop (`auditStops`, docs/stop-bitunix.md) c'è solo per Bitunix;
- nel confronto serale di Bitget, la Simulazione usa le candele di Bitunix: le differenze comprendono anche quelle tra i due contratti.

## Titoli operabili per exchange

Ogni exchange ha la sua lista, che parte da tutti i titoli dell'universo della strategia (`STRATEGY_SYMBOLS`) e non dipende dagli altri exchange.

- **Bitunix:** si tolgono le coppie con `isApiSupported = false`.
- **Bitget:** si tolgono i titoli senza perpetuo USDT sul titolo (`symbolType` "stock", stato online). Con i dati del 18/11/2026 sono operabili 172 titoli su 181. Sono esclusi gli 8 senza perpetuo e MA, che su Bitget non è classificato come titolo.
- **Per tutti:** si tolgono anche i titoli rifiutati nel Reale di quell'exchange, che si riprovano dopo 7 giorni.

La strategia usa i titoli scelti nelle impostazioni che sono operabili su quell'exchange. La selezione salvata non cambia.

Nella pagina usano la lista dell'exchange della sezione:

- il riquadro dei titoli operabili, con il conto sull'universo e sui titoli scelti;
- il conteggio dei titoli pronti;
- l'avviso sui titoli sotto il minimo per ordine, con la quantità minima e i 5 USDT di Bitget;
- la scelta dei titoli: i non operabili sono barrati e c'è il pulsante "tutti gli operabili su …".

## Prova

C'è una Prova per ogni exchange, con lo slittamento misurato sul Reale dello stesso exchange (`liveslip:bitget`). Finché il Reale Bitget ha meno di 5 trade di un tipo, vale lo 0,05%.

## Interfaccia

In Prova e in Reale si sceglie in alto **Bitunix**, **Bitget** o **Totale**.

- **Bitunix e Bitget** mostrano le stesse cose di prima, con il nome dell'exchange.
- **Totale** mostra solo il bilancio economico, per exchange e sommato: risultato, capitale, numero di trade, percentuale vincenti e costi (commissioni e funding). Non c'è l'elenco dei trade.

## Database

SQL da eseguire una volta su Supabase, già in fondo a `supabase/schema.sql`:

```sql
alter table wt_accounts drop constraint if exists wt_accounts_mode_check;
alter table wt_accounts add constraint wt_accounts_mode_check check (mode ~ '^(paper|live)(:[a-z0-9]+)?$');
insert into wt_accounts (mode, enabled, balance, start_balance) values ('paper:bitget', false, 300, 300) on conflict (mode) do nothing;
insert into wt_accounts (mode, enabled, balance, start_balance) values ('live:bitget', false, 0, 0) on conflict (mode) do nothing;
```

Senza questo SQL la sezione Bitget lo dice nella pagina e Bitunix funziona come sempre.
