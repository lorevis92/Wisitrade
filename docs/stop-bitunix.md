# Stop su Bitunix nel Reale

Il supporto di Bitunix ha scritto che "TP/SL features are not available for TradFi trading pairs" e che le funzioni possono cambiare senza preavviso. Questo documento contiene:
- il referto sui trade del Reale dal 9 al 12 novembre;
- il controllo dello stop ogni minuto aggiunto all'app.

## In breve

- **Lo stop c'era sempre.** Ognuno dei 36 trade, su 19 titoli, ha avuto il suo stop su Bitunix, creato entro un secondo dall'esecuzione, con il prezzo e la quantità della strategia e solo su quella posizione.
- **Nessun titolo è rimasto senza stop.** Per nessun titolo lo stop è mancato all'apertura.
- **Quando serviva, ha funzionato.** In 6 trade il prezzo ha raggiunto lo stop di Bitunix mentre la posizione era aperta, e in tutti e 6 Bitunix l'ha eseguito: ASTS e SMCI il 9, USAR l'11, SNDK, NVDA e USAR il 12. In un altro caso (MU l'11) l'app aveva già chiuso la posizione al suo stop, prima che il prezzo arrivasse a quello di Bitunix.
- **Non ci sono segni di stop spariti mentre la posizione era aperta.**
  - In 16 trade lo stop era ancora su Bitunix alla chiusura: l'app lo ha annullato lei, dopo aver chiuso.
  - In 14 trade lo ha tolto Bitunix. Per questi Bitunix non dice a che ora: **non si può dimostrare che sia rimasto fino alla chiusura**. Su tre di questi titoli (ASTS, SMCI, USAR), in altri giorni, lo stop è rimasto attivo fino a 77 minuti ed è stato eseguito.
- **Da oggi l'app controlla lo stop ogni minuto**: se manca lo rimette; se non ci riesce chiude la posizione, esclude il titolo e ti manda una notifica. Così la domanda «lo stop è sparito?» avrà una risposta minuto per minuto.

## 1. Referto

### Fonti

- **Dati salvati dall'app** (`wt_positions.exchange`):
  - prezzo dello stop;
  - come è stato verificato all'apertura: «ordine» vuol dire trovato tra gli stop attivi della posizione subito dopo l'esecuzione. I trade del 9 novembre sono di prima di questa verifica e non hanno questo dato;
  - id dello stop su Bitunix;
  - motivo della chiusura;
  - se la posizione l'ha chiusa Bitunix.
- **Storico TP/SL di Bitunix** (`tpsl/get_history_orders`), letto dall'app su Vercel, dove stanno le chiavi, e salvato in `exchange.slAudit`. Solo lettura. Per ogni stop dà:
  - id, posizione, prezzo e quantità;
  - ora di creazione;
  - stato finale: eseguito, annullato dall'utente (cioè dall'app), annullato dal sistema;
  - ora di esecuzione.
  - **Non dà l'ora dell'annullamento.**
- **Candele da 1 minuto di Bitunix** (prezzo dell'ultimo scambio, lo stesso su cui scatta lo stop): servono a vedere se il prezzo ha raggiunto lo stop mentre la posizione era aperta.

### Trade per trade

Le ore sono di New York.
- **«Annullato dall'app»:** lo stop c'era ancora quando l'app ha chiuso la posizione, e l'app lo ha tolto.
- **«Annullato da Bitunix»:** lo ha tolto Bitunix, a un'ora che Bitunix non indica.
- **«Prezzo allo stop»:** il minuto in cui il prezzo ha raggiunto lo stop di Bitunix con la posizione aperta.

| Giorno | Titolo | Lato | Aperto–chiuso | Stop | Creato dopo l'esecuzione | Fine dello stop | Prezzo allo stop | Chiusura |
|---|---|---|---|---|---|---|---|---|
| 09/11 | ASTS | short | 09:30–10:16 | 35,98 | +1 s | **eseguito alle 10:15** | 10:15 | stop loss (Bitunix) |
| 09/11 | SMCI | short | 09:31–09:57 | 29,24 | +1 s | **eseguito alle 09:56** | 09:56 | stop loss (Bitunix) |
| 09/11 | BABA | short | 09:35–15:59 | 108,41 | +1 s | annullato da Bitunix | mai | chiusura |
| 09/11 | ARM | long | 09:39–09:45 | 171,03 | +1 s | annullato da Bitunix | mai | nessuna conferma |
| 09/11 | QQQ | long | 09:46–09:56 | 663,31 | +1 s | annullato da Bitunix | mai | ritracciamento |
| 09/11 | TSM | long | 09:47–10:01 | 380,25 | +1 s | annullato da Bitunix | mai | nessuna conferma |
| 10/11 | USAR | long | 09:30–09:32 | 7,96 | +1 s | annullato da Bitunix | mai | ritracciamento |
| 10/11 | ASTS | long | 09:30–09:36 | 32,04 | +1 s | annullato da Bitunix | mai | ritracciamento |
| 10/11 | SNDK | short | 09:30–09:55 | 916,85 | +1 s | annullato dall'app | mai | freno di mercato |
| 10/11 | SMCI | short | 09:31–09:55 | 29,13 | +1 s | annullato da Bitunix | mai | freno di mercato |
| 10/11 | MU | short | 09:31–09:55 | 744,03 | +0 s | annullato dall'app | mai | freno di mercato |
| 10/11 | CRCL | short | 09:31–09:55 | 68 | +0 s | annullato dall'app | mai | freno di mercato |
| 10/11 | COIN | short | 09:31–09:55 | 139,06 | +0 s | annullato dall'app | mai | freno di mercato |
| 10/11 | SKHY | short | 09:32–09:55 | 135,02 | +0 s | annullato dall'app | mai | freno di mercato |
| 10/11 | ARM | short | 09:32–09:55 | 188,3 | +1 s | annullato da Bitunix | mai | freno di mercato |
| 10/11 | AMZN | long | 09:32–09:45 | 261,01 | +1 s | annullato dall'app | mai | nessuna conferma |
| 11/11 | BE | long | 09:30–11:45 | 188,73 | +0 s | annullato dall'app | mai | resistenza |
| 11/11 | AMD | short | 09:30–09:39 | 563,64 | +0 s | annullato dall'app | mai | ritracciamento |
| 11/11 | HOOD | long | 09:30–14:16 | 80,55 | +0 s | annullato dall'app | mai | ritracciamento |
| 11/11 | CRCL | long | 09:30–09:45 | 62,73 | +0 s | annullato dall'app | mai | nessuna conferma |
| 11/11 | COIN | long | 09:30–09:45 | 126,81 | +1 s | annullato dall'app | mai | nessuna conferma |
| 11/11 | ASTS | long | 09:30–12:45 | 32,57 | +0 s | annullato da Bitunix | mai | resistenza |
| 11/11 | MSTR | long | 09:31–09:45 | 115,71 | +0 s | annullato dall'app | mai | nessuna conferma |
| 11/11 | SNDK | long | 09:31–09:45 | 876,61 | +0 s | annullato dall'app | mai | nessuna conferma |
| 11/11 | USAR | short | 09:32–10:50 | 8,67 | +1 s | **eseguito alle 10:49** | 10:49 | stop loss (Bitunix) |
| 11/11 | MU | short | 09:35–10:27 | 802,6 | +0 s | annullato dall'app | 10:27, dopo la chiusura dell'app | stop loss (dell'app) |
| 12/11 | SNDK | short | 09:30–10:54 | 941,56 | +0 s | **eseguito alle 10:51** | 10:51 | stop loss (Bitunix) |
| 12/11 | ARM | long | 09:30–09:45 | 184,68 | +1 s | annullato da Bitunix | mai | nessuna conferma |
| 12/11 | ASTS | long | 09:30–11:26 | 32,34 | +0 s | annullato da Bitunix | mai | ritracciamento |
| 12/11 | TSM | long | 09:30–09:45 | 390,26 | +1 s | annullato da Bitunix | mai | nessuna conferma |
| 12/11 | AMD | short | 09:31–11:08 | 589,62 | +1 s | annullato dall'app | mai | stop loss (dell'app) |
| 12/11 | NVDA | short | 09:31–09:34 | 155,38 | +0 s | **eseguito alle 09:33** | 09:33 | stop loss (Bitunix) |
| 12/11 | USAR | short | 09:31–10:29 | 8,32 | +0 s | **eseguito alle 10:28** | 10:28 | stop loss (Bitunix) |
| 12/11 | MSTR | short | 09:31–09:45 | 119,4 | +0 s | annullato dall'app | mai | nessuna conferma |
| 12/11 | QCOM | long | 09:31–09:45 | 170,82 | +0 s | annullato da Bitunix | mai | nessuna conferma |
| 12/11 | BABA | short | 09:32–15:59 | 96,76 | +1 s | annullato da Bitunix | mai | chiusura |

Tutti i 36 stop hanno la quantità intera della posizione. In nessuno dei 36 trade era scattata «Metà subito» con una metà chiusa davvero, quindi nessuno stop è stato spostato al prezzo d'entrata.

### Per titolo

| Titoli | Stop all'apertura | Come è finito |
|---|---|---|
| ASTS, SMCI, USAR | sempre | eseguito da Bitunix quando il prezzo l'ha raggiunto (ASTS e SMCI il 9, USAR l'11 e il 12); negli altri trade annullato da Bitunix |
| SNDK, NVDA | sempre | eseguito da Bitunix il 12; gli altri trade di SNDK annullati dall'app alla chiusura |
| MU, CRCL, COIN, SKHY, AMZN, BE, AMD, HOOD, MSTR | sempre | annullato dall'app alla chiusura: c'era fino alla fine |
| BABA, ARM, QQQ, TSM, QCOM | sempre | annullato da Bitunix, senza ora; il prezzo non l'ha mai raggiunto |

- **Stop sempre presente:** tutti i 19 titoli.
- **Stop mai presente:** nessuno.
- **Stop sparito dopo l'apertura:** nessun caso visto.
  - Nei 6 casi in cui il prezzo l'ha raggiunto, lo stop c'era.
  - Nei 16 annullati dall'app c'era fino alla chiusura.
  - Nei 14 annullati da Bitunix non si può dire con certezza, perché manca l'ora.

### Due cose da notare

- **«Annullato da Bitunix» o «annullato dall'app» dipende dal titolo, non dal giorno.**
  - ASTS, SMCI, USAR, BABA, ARM, QQQ, TSM e QCOM finiscono sempre «annullato da Bitunix».
  - SNDK, MU, CRCL, COIN, SKHY, AMZN, BE, AMD, HOOD e MSTR finiscono sempre «annullato dall'app».
  - La spiegazione più probabile è che su alcune coppie Bitunix tolga lo stop nello stesso momento in cui chiude la posizione, prima che arrivi l'annullamento dell'app. Il 9 novembre l'app non annullava ancora gli stop, perché non ne salvava l'id, e tutti i trade di quel giorno chiusi dall'app sono «annullati da Bitunix».
  - Su ASTS, SMCI e USAR, dello stesso gruppo, lo stop è stato eseguito dopo 45, 25, 77 e 57 minuti dall'apertura: su quelle coppie lo stop resta attivo con la posizione aperta.
- **MU, 11 novembre (short).**
  - Lo stop dell'app era a 802,23, quello su Bitunix a 802,60: è calcolato sul prezzo eseguito ed è un po' più lontano.
  - L'app ha chiuso a 801,92 alle 10:27:12, prima che il prezzo arrivasse a 802,60. Poi ha annullato lo stop di Bitunix, che quindi c'era ancora.
  - AMD il 12 è un caso simile: lo stop dell'app si era avvicinato per le regole della strategia, quello di Bitunix resta all'iniziale.

### Cosa vuol dire la risposta del supporto

Sui 19 titoli che il Reale ha usato, oggi lo stop via API funziona:
- si crea dentro l'ordine d'apertura;
- l'app lo ritrova subito;
- Bitunix lo esegue.

La frase del supporto non corrisponde a quello che succede adesso su queste coppie. Può però diventare vera senza preavviso, su una coppia o su tutte. Per questo serve il controllo della parte 2.

## 2. Controllo dello stop ogni minuto (nuovo)

**Quando:** in ogni controllo ogni minuto, finché una posizione del Reale è aperta. Solo per quel positionId: le posizioni manuali non si guardano e non si toccano. Il codice è `stopWatch` in `server/strategy.js` e `checkStop` in `server/live.js`.

| Cosa trova su Bitunix | Cosa fa |
|---|---|
| lo stop c'è | niente |
| la posizione non c'è più (chiusa dallo stop o liquidata) | niente: la registra il controllo delle uscite, come prima |
| lo stop manca | lo rimette con la chiamata tpsl separata, solo su quella posizione. Prezzo: lo stop iniziale, o il prezzo d'entrata dopo «Metà subito». Quantità: quella della strategia |
| lo stop manca e non si riesce a rimetterlo, oppure manca di nuovo il minuto dopo averlo rimesso | regola dell'apertura: chiude subito la sola posizione della strategia (motivo «stop mancante su Bitunix»), segna il titolo come «stop non accettato via API» per 7 giorni (Prova e Reale) e ti manda la notifica «⚠ titolo: stop sparito su Bitunix» |
| Bitunix non risponde | non fa niente e riprova il minuto dopo. Dopo 3 minuti di fila senza risposta ti avvisa con una notifica, senza chiudere |

**Cosa resta salvato:** ogni controllo finisce in `exchange.slCheck` del trade:
- numero di controlli;
- quanti con lo stop presente;
- ultimo stato;
- ogni volta che lo stop mancava, con ora, prezzo e se è stato rimesso.

Così, se uno stop sparisce, si sa quando.

**Cosa non cambia:**
- regole della strategia, entrate e uscite;
- prezzo dello stop su Bitunix, freno e limiti;
- regole di sicurezza del Reale, e la Prova.

**Prove:** `node tests/operable.test.mjs`, su Bitunix finto e database finto. Coprono questi casi:
- stop presente;
- stop sparito e rimesso, con lo stesso prezzo e quantità e solo su quella posizione;
- stop sparito di nuovo, quindi chiusura e titolo escluso, senza toccare la posizione manuale sullo stesso titolo;
- stop non più accettato da Bitunix, quindi chiusura;
- Bitunix non leggibile, quindi nessuna azione;
- posizione già chiusa dallo stop, quindi nessuna azione.

Passano anche le altre prove: `fast`, `live`, `prova`.

**Storico TP/SL per i referti:** l'app legge una volta lo storico degli stop di ogni trade chiuso del Reale e lo salva in `exchange.slAudit`. Lo fa dopo le 10:15, ogni 5 minuti, quando non ci sono posizioni aperte, 8 trade alla volta. È solo lettura.
