# BE dell'11 novembre e una Prova più vicina al Reale

Referto e proposta. **La proposta del punto 3 è applicata dal 12 novembre: vedi «Applicato» in fondo.**

Dati usati:
- trade di Prova e Reale dal 9 all'11 novembre (`wt_positions`, con `exchange.rec` e le esecuzioni vere di Bitunix);
- candele da 1 minuto dell'archivio;
- registro dei tempi del controllo ogni minuto (`ticklog:`).

Il confronto completo è in `docs/dati-dal-vivo.md`.

## 1. Perché il Reale non ha chiuso BE alle 9:45

**Causa: il prezzo d'entrata eseguito.** Dati della candela, orario del controllo e preparazione non c'entrano.

La regola «nessuna conferma» (in `stepBar`, `shared/engine.js`) si valuta una volta, alla chiusura della candela da 15 minuti dell'entrata. Il volume deve essere almeno 1,5 volte il normale e il prezzo dalla parte giusta del VWAP. Se manca la conferma, **si chiude solo se il trade è in guadagno** in quel momento. Altrimenti la posizione resta aperta e la regola non si ricontrolla più (`confirmed` diventa vero comunque).

BE, long, chiusura della candela 9:30–9:44 = **203,57**:

| | Entrata | 203,57 rispetto all'entrata | Decisione |
|---|---|---|---|
| Prova | 203,44 (prezzo letto dal controllo veloce) | +0,06% → in guadagno | chiude alle 9:45 per «nessuna conferma» |
| Simulazione | 203,46 (soglia 203,36 + slittamento 0,05%) | +0,05% → in guadagno | chiude alle 9:45 per «nessuna conferma» |
| Reale | **203,61** (eseguito su Bitunix) | **−0,02% → non in guadagno** | resta aperta; esce alle 11:45 per «resistenza» (massimo 5 giorni 214,36), eseguita a 214,50 |

Tutto il resto era uguale:
- **Conferma:** stessa per tutti e due, volume 0,83 volte il normale (sotto 1,5), quindi conferma mancata. Lo stesso valore `volx` = 0,8256 nel Reale e in Prova dice che hanno visto le stesse candele. La conferma mancava anche per il VWAP (203,57 sotto 203,76).
- **Controllo:** stesso giro. Le due posizioni sono state controllate insieme nel controllo delle 9:45 (Prova chiusa alle 9:45:33).
- **Livelli:** stessa preparazione e stesso livello (massimo 5 giorni 214,36).

**Cosa ha fatto la differenza.** Il segnale è scattato alle 9:30:08,3 a 203,44, l'ordine è partito alle 9:30:09,2 ed è stato eseguito a 203,61: +0,08% rispetto al prezzo letto. Bastavano 4 centesimi sotto l'entrata vera perché la regola non si applicasse. È andata bene (+5,2% invece di circa 0%), ma per caso: con un'esecuzione 0,05% migliore il Reale avrebbe chiuso come gli altri.

**Cosa ne segue:**
- Non è un errore del motore: il Reale ha applicato la regola scritta.
- La regola però è sul filo per i trade che alle 9:45 sono vicini al prezzo d'entrata. Lì lo slittamento d'entrata decide se il trade si chiude o resta aperto per ore. Lo stesso vale per le altre regole con «solo se in guadagno»: «resistenza» e la conferma del volume dopo l'entrata.
- La Simulazione e la Prova non possono riprodurre questi casi, perché entrano a un prezzo diverso da quello vero.
- Il confronto serale lo segnala ogni volta: stesso trade, motivo d'uscita diverso (`sameReason: false`). Con più giorni si potrà contare quanto spesso succede.

## 2. Misure dal vivo (Reale, 26 trade, 9–11 novembre)

Slittamento in % del prezzo, negativo = peggio per te.

**Entrata**

| | Reale | Prova oggi |
|---|---|---|
| Entrata veloce, soglia → eseguito | −0,12% (24 trade) | −0,09% (soglia → prezzo letto) |
| di cui soglia → prezzo letto (rilevazione) | −0,11% | uguale |
| di cui prezzo letto → eseguito | −0,01% in media, ma fino a −0,08% (BE) | 0 |
| Dal segnale all'invio dell'ordine | 1,3 s | 0 |

**Uscite** (livello del motore → prezzo eseguito vero, ritardo dalla chiusura della candela che le decide)

| Uscita | Reale: slittamento | Ritardo | Prova oggi |
|---|---|---|---|
| Stop su Bitunix | +0,01% (3) | istantaneo | al livello: va bene |
| Uscite a candela chiusa dell'app (nessuna conferma, resistenza, nessun progresso…) | −0,13% (9) | ~40 s | alla chiusura della candela |
| Stop che segue e protezione del guadagno (app) | −0,10% (6) | ~17 s | al livello |
| Chiusura delle 15:59 | −0,14% (1) | ~14 s | al prezzo letto |
| Freno di mercato | −0,33% per posizione (7) | 7 posizioni chiuse una dopo l'altra in 10 s | al prezzo letto, tutte insieme |

Sugli stessi trade con lo stesso motivo d'uscita, il Reale esce peggio della Prova:
- di 0,12 punti nelle uscite a candela chiusa;
- di 0,14 punti nello stop che segue.

Nel freno del 10 novembre la differenza è −0,85 punti. Ma lì la Prova è scattata un minuto prima del Reale (9:54:21 contro 9:55:41, con posizioni e capitale diversi) e il mercato si muoveva contro. Quindi è solo in parte esecuzione: quella misurata, livello → eseguito, è −0,33%.

**Da dove viene il ritardo:**
- Il controllo ogni minuto parte in media **17 s dopo l'inizio del minuto**: avvio da cron-job.org più le candele delle posizioni aperte.
- Le uscite partono circa 2,5 s dopo l'avvio.
- Nel freno ogni chiusura su Bitunix aspetta la precedente, compreso lo storico della posizione: in media 1,5 s per posizione.

## 3. Proposta: Prova con ritardo e slittamento misurati dal vivo

Obiettivo: Prova prende le **stesse decisioni** del Reale e registra **prezzi credibili**, senza ordini veri. Le regole della strategia restano quelle di `shared/engine.js`.

1. **Entrata.** Il prezzo di Prova diventa il prezzo letto più lo slittamento d'esecuzione misurato del Reale (letto → eseguito), per l'entrata veloce e per quella al minuto. Effetto principale: le regole che guardano il prezzo d'entrata («nessuna conferma», «resistenza», conferma del volume) decidono su un prezzo vicino a quello vero, come sarebbe servito per BE. Il ritardo di 1,3 s si può rendere in modo semplice: nel controllo veloce Prova prende il prezzo letto al giro di prezzi successivo invece che a quello del segnale.
2. **Uscite decise dall'app** (candela chiusa, stop che segue, protezione, 15:59). Prova già gira nello stesso controllo del Reale, quindi ha lo stesso ritardo di circa 17–40 s. Oggi però registra il livello o la chiusura della candela. Proposta: registrare il **prezzo letto in quel controllo**, quello da cui parte l'ordine del Reale, più lo slittamento d'esecuzione misurato per quel tipo d'uscita. Così il ritardo si riproduce da solo, senza numeri inventati.
3. **Freno di mercato.** Prezzo letto meno lo slittamento misurato, che cresce con l'ordine di chiusura: la prima posizione circa come un'uscita normale, l'ultima di più, come quando il Reale le chiude una dopo l'altra.
4. **Stop su Bitunix.** Resta com'è (al livello, o all'apertura se c'è un salto): nel Reale è istantaneo e lo slittamento misurato è quasi zero.
5. **Da dove arrivano i numeri.** Ogni sera il confronto serale (`server/compare.js`) calcola lo slittamento medio degli ultimi 30 trade del Reale per tipo (entrata veloce, entrata al minuto, uscita a candela chiusa, stop che segue, 15:59, freno) e lo salva, per esempio in wt_meta `liveslip`. Con meno di 5 trade di un tipo si usa lo slittamento impostato nella Simulazione (0,05%). Prova legge quei valori la mattina e la pagina mostra quali sta usando.
6. **Simulazione.** Gli stessi valori possono diventare un'opzione della Simulazione: «slittamento misurato dal vivo», al posto di quello fisso per lato. È la versione prudente proposta in `docs/percorso-candela.md`.

Prezzi d'apertura, soglie, livelli e motivi d'uscita non cambiano. Il confronto serale permette di verificare se la proposta funziona: dopo la modifica, le righe Prova contro Reale dovrebbero avere `sameReason` vero e differenze di uscita vicine a zero.

**Cosa resta diverso anche così:**
- Prova non può sapere di quanto un singolo ordine verrà eseguito peggio. Usa una media, quindi casi come BE (+0,08% su un solo ordine) restano possibili nel Reale e non in Prova.
- Prova e Reale possono comunque scattare in minuti diversi se hanno capitali o posizioni diverse, come nel freno del 10 novembre.

**Da guardare a parte (non è la Prova):**
- Nel Reale passano 1,3 s dal segnale all'ordine, per i controlli prima dell'ordine.
- Il controllo ogni minuto parte 17 s dopo l'inizio del minuto.

Accorciare questi due tempi ridurrebbe lo slittamento vero del Reale.

## Applicato (12 novembre)

Codice: `server/pslip.js` (misura e prezzi), chiamate in `server/strategy.js` (solo per la Prova), calcolo serale in `server/compare.js`. Prove: `node tests/prova.test.mjs`.

**Come la Prova calcola i prezzi adesso:**

| Cosa | Prima | Adesso |
|---|---|---|
| Entrata (veloce o al minuto) | prezzo letto (o la soglia, al minuto) | prezzo letto + slittamento d'entrata misurato. Stop iniziale, quantità e liquidazione partono da questo prezzo, come nel Reale dal prezzo eseguito |
| Uscite a candela chiusa (nessuna conferma, resistenza, nessun progresso, volume in calo, fermo dopo 60 min) | chiusura della candela | prezzo letto nel controllo che decide l'uscita − slittamento «candela» |
| Stop che segue e protezione del guadagno | al livello | prezzo letto nel controllo − slittamento «segue» |
| Chiusura delle 15:59 | prezzo letto | prezzo letto − slittamento «chiusura» |
| Freno di mercato | prezzo letto, tutte uguali | prezzo letto − (base + passo × posizione), nell'ordine in cui si chiudono |
| Stop su Bitunix (livello d'uscita = stop iniziale, anche dopo «Metà subito») e liquidazione | al livello | invariato |
| Chiusura a mano | prezzo letto | invariato |

Slittamento sempre contro di te. Le regole sono quelle di sempre: con un'entrata più realistica decidono su un prezzo più vicino a quello del Reale, come sarebbe servito per BE.

**I valori:**
- Ogni sera, dopo il confronto serale, si ricalcolano sugli ultimi 30 trade del Reale di ogni tipo e si salvano in wt_meta `liveslip`.
- Con meno di 5 trade di un tipo vale lo 0,05%.
- Un valore medio a favore conta 0: la Prova non diventa mai più ottimista del prezzo letto.
- Il freno usa una retta: costo = base + passo × posizione, dove 0 è la prima posizione chiusa.
- La pagina della Prova mostra in una scheda i valori in uso, quanti trade li hanno misurati e se sono predefiniti.

**Cosa si misura:**
- Entrata: prezzo letto al segnale → prezzo eseguito su Bitunix.
- Uscite: prezzo letto nel controllo che ha deciso l'uscita → prezzo eseguito. Il prezzo letto si registra ora anche nel Reale (`exchange.rec.exits[].readPx`, e `rank` nel freno). Per freno e chiusura delle 15:59 c'era già, perché era il livello salvato.
- Stop su Bitunix, liquidazioni e chiusure a mano non contano.

**Valori di partenza** (26 trade del Reale, 9–11 novembre):
- entrata veloce 0,013% (24 trade);
- freno 0,22% + 0,037% per ogni posizione chiusa dopo la prima (7 trade);
- tutti gli altri tipi 0,05% (predefinito). Per le uscite decise dall'app il prezzo letto non era registrato prima, quindi servono 5 trade nuovi per tipo.

Il Reale non cambia: registra in più il prezzo letto nelle uscite, solo come dato.
