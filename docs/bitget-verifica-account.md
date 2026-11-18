# Bitget: verifica autenticata del conto

Verifica diagnostica fatta il 18/11/2026 con le chiavi `BITGET_API_KEY`, `BITGET_API_SECRET` e `BITGET_API_PASSPHRASE`. Le chiavi stanno in `.env.local`, che non va su GitHub. Seguito di [bitget-stock-futures-verifica.md](bitget-stock-futures-verifica.md).

- **Solo lettura:** tutte le richieste sono GET, firmate HMAC-SHA256 come chiede Bitget.
- **Nessun ordine:** non è stato inviato nessun ordine, né vero né demo.
- **Nessuna modifica:** la leva e il margine del conto non sono stati toccati e l'app non è cambiata.

## Risultati

| Controllo | Endpoint | Esito |
|---|---|---|
| Chiavi valide | `GET /api/v2/spot/account/info` | ✅ **Funzionano.** nessun IP associato (`ips` vuoto), tipo `not_trader` |
| Permessi della chiave | stesso | codici `wtow, pllw, chow, smow, coow, taxw, p2pw, cpow, ttow, stow`. Bitget non li spiega nella risposta |
| Tipo di conto | `GET /api/v3/account/settings` | **Conto "Classic", non "Unified".** Errore `40084 You are in Classic Account mode, and the Unified Account API is not supported at this time` |
| Saldo futures USDT | `GET /api/v2/mix/account/accounts?productType=USDT-FUTURES` | ✅ Risponde: **saldo 0 USDT** (disponibile 0, equity 0), un solo asset di margine (`assetMode: single`) |
| Impostazioni per titolo | `GET /api/v2/mix/account/account` per ognuno dei 173 titoli coperti | ✅ **173 su 173 rispondono senza errori** |
| Calcolo della quantità apribile | `GET /api/v2/mix/account/open-count` (simulazione: 20 USDT, leva 5) per i 173 titoli | ✅ **173 su 173 rispondono**, senza nessun blocco |
| Livelli di leva | `GET /api/v2/mix/market/query-position-lever` per i 173 titoli | ✅ Rispondono; il primo livello coincide con la leva massima del catalogo pubblico (controllato su ASTS e NVDA) |
| CFD | `GET /api/v3/cfd/account/instruments` | ❌ `40084`: come per tutta l'API Unified, nel conto Classic i CFD via API non sono disponibili |
| Ambiente demo | stessi endpoint con l'header `paptrading: 1` | ❌ `40099 exchange environment is incorrect` |

Sul permesso dei futures:

- tra i codici dei permessi c'è `coow`, che con ogni probabilità è la scrittura degli ordini sui futures;
- `open-count` e `account` per titolo rispondono, quindi la chiave legge il conto futures;
- che la chiave possa davvero inviare ordini si confermerebbe solo con un ordine, e non ne ho inviati.

## Impostazioni attuali del conto futures

Sono uguali per tutti i titoli:

- **margine incrociato** (`crossed`);
- **leva 10**, sia incrociata sia isolata long e short;
- **modalità hedge**: long e short separati, come su Bitunix.

La strategia di Wisi Trade usa il margine **isolato** con leva 5. Prima di qualsiasi ordine vero l'app dovrebbe impostarli titolo per titolo, come fa oggi su Bitunix.

## Leva massima sui titoli

Il conto non mostra limiti propri: la leva massima è quella dei livelli di Bitget. Il primo livello vale fino a un certo valore della posizione, poi la leva massima scende. Per esempio:

| Titolo | Primo livello | Livello successivo |
|---|---|---|
| ASTSUSDT | 20x fino a 100.000 USDT | 15x fino a 500.000 USDT (7 livelli) |
| NVDAUSDT | 100x fino a 10.000 USDT | — |

Con le posizioni di oggi della strategia, circa 20 USDT con leva 5, si resta sempre nel primo livello.

## Titoli bloccati o non disponibili

- **Nessun blocco in lettura.** Nessuno dei 173 titoli coperti risulta bloccato per questo conto: le letture per titolo rispondono tutte senza errori.
- **Titoli mancanti:** gli 8 che mancano erano già fuori dall'elenco pubblico: DIS, NOK, ACN, HIMS, RIVN, NVO, PAYP e SHLD.
- **Limiti di quello che si vede in lettura:** eventuali restrizioni geografiche, di KYC o un accordo da accettare per i futures sui titoli non compaiono nelle risposte. Su Bitget queste regole di solito emergono solo all'invio di un ordine. Le risposte non contengono campi su paese o KYC.

## Ambiente demo

Bitget ha un ambiente demo per i futures: si usa l'header `paptrading: 1` e chiavi API create apposta in modalità demo.

- **Queste chiavi non sono demo:** sono del conto vero, perché rispondono `40099 exchange environment is incorrect`.
- **Nessun ordine inviato:** senza chiavi demo non ho inviato nessun ordine.
- **Per provare la scrittura senza rischi** servono chiavi create dalla modalità "Demo trading" di Bitget. Non è verificato se nella demo ci sono anche i perpetui sui titoli.

## Da fare per confermare la scrittura

- **Sicurezza della chiave:** controlla nella pagina API di Bitget che la chiave abbia solo i permessi che servono, cioè futures, lettura e ordini, e **non il prelievo**. Valuta di associarla agli IP di Vercel.
- **Prova di scrittura:**
  - **con chiavi demo:** ordini di prova sui perpetui dei titoli;
  - **in alternativa, sul conto vero:** servirebbe un ordine minimo (5 USDT), che va deciso e confermato esplicitamente.
- **Saldo:** oggi il conto futures ha 0 USDT, quindi comunque nessun ordine vero potrebbe partire.
