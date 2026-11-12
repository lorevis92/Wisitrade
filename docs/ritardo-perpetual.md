# Il perpetual di Bitunix segue l'azione con un ritardo?

Ricerca. L'app non è cambiata.

**Dati:** candele da 1 minuto di marzo–novembre 2026.
- Azioni vere: Alpaca, feed completo SIP (vedi `docs/storico-lungo.md`).
- Perpetual: archivio di Bitunix.
- Un titolo in un giorno entra solo se c'è in tutte e due le fonti.

Simulazioni con la copia del motore: configurazione del Reale, uscite gestite dall'app sulla chiusura del minuto (`docs/percorso-candela.md`), 10 ordini casuali dei segnali, 115 titoli e 32 operabili, slittamento 0,05% e 0,08%.

## In breve

- **Il ritardo c'è, ma è di pochi secondi.**
  - In media l'azione anticipa il perpetual di circa 4–5 secondi; sui 32 operabili la mediana è circa 2 secondi.
  - Sui perpetual poco scambiati (BRKB, GS, COST, V, STRC) arriva a 15–25 secondi.
  - È una stima: con le candele da 1 minuto un ritardo di pochi secondi non si misura direttamente.
- **Con quello che si può misurare non diventa guadagno.**
  - Dopo un minuto in cui l'azione si muove molto, il perpetual recupera in media lo 0,04% nel minuto dopo. Entrare e uscire costa circa 0,22–0,28%.
  - Tutte le varianti con il segnale preso dall'azione fanno peggio della strategia attuale, in tutti e quattro i casi.
- **Scoperta più importante:** il vantaggio della strategia sta quasi tutto nei primi secondi dopo il superamento della soglia. Se la strategia attuale entrasse un minuto dopo, con i 115 titoli passerebbe da +256% a +12%. La velocità del controllo veloce conta più di qualunque segnale preso dall'azione.

## 1. Il ritardo esiste?

**Come si misura.** Movimenti da chiusura a chiusura di ogni minuto, dalle 9:31 alle 10:00: circa 327.000 minuti.

Se il perpetual segue l'azione con d secondi di ritardo, una parte d/60 del movimento dell'azione di un minuto compare nel perpetual al minuto dopo. Da quella parte si stima d.

| | Risultato |
|---|---|
| Correlazione nello stesso minuto | 0,91: si muovono quasi insieme |
| Azione in un minuto → perpetual nel minuto dopo | 0,078 |
| Perpetual in un minuto → azione nel minuto dopo | 0,021 |
| Ritardo stimato, tutti i minuti insieme | **4,5 s** (al contrario, perpetual prima dell'azione: 0,1 s) |
| Ritardo stimato per titolo | mediana 5,4 s; 10% dei titoli sotto 1,2 s; 10% sopra 14,5 s |
| 32 operabili | mediana **2,3 s** |
| Minuti in cui l'azione si muove più dello 0,2% | 133.000. Nel 96% il perpetual va nello stesso verso nello stesso minuto |
| Minuto dopo un movimento dell'azione oltre lo 0,2% | il perpetual fa ancora +0,038% nello stesso verso, l'azione +0,002%: **il recupero è circa 0,04%** |

**Quindi:** è l'azione a muoversi prima, non il contrario, e quasi tutto il movimento il perpetual lo fa nello stesso minuto.

**Da titolo a titolo:**
- **Più lenti**, tutti perpetual poco scambiati su Bitunix: STRC ~26 s, BRKB ~22 s, GS ~20 s, COST ~19 s, V ~17 s; poi BOT, CRML, IWM, ACN, BX intorno ai 15 s. Qui il recupero nel minuto dopo arriva allo 0,07–0,14%.
- **Più veloci**, perpetual molto scambiati: SPCX, SKHY, DRAM, NBIS, sotto 1 s.
- **Fuori:** AVGO ha una correlazione nello stesso minuto bassa (0,66) e non si legge.

**Limite della misura.** La stima vale solo in media. Con candele da 1 minuto un ritardo di 2–5 secondi è una frazione piccola del minuto e si confonde con la differenza tra l'ultimo scambio dell'azione e quello del perpetual in ogni minuto. **Quanti secondi esattamente, e quanto spesso, con questi dati non si può dire.** Serve la misura al secondo proposta in fondo.

## 2. Si può sfruttare?

**Cosa cambia tra le varianti.** Entrata e uscite sono sempre sui prezzi del perpetual, con i costi di Bitunix. Cambia da dove viene il segnale e quando si entra. Mai dati futuri: il superamento della soglia sull'azione si conosce solo a candela chiusa, quindi l'entrata sul perpetual è all'apertura del minuto dopo (≈ la chiusura del minuto del segnale).

| Variante | Cosa fa |
|---|---|
| **Attuale** | segnale e entrata sul perpetual, alla soglia, dentro il minuto (come il controllo veloce, un prezzo al secondo) |
| Attuale un minuto dopo | segnale del perpetual, entrata all'apertura del minuto dopo: serve da confronto alla pari con le varianti |
| Dall'azione | soglia e livello vicino sull'azione; entrata sul perpetual all'apertura del minuto dopo |
| Dall'azione, limite ottimista | come sopra, ma entrata nello stesso minuto al prezzo del perpetual che corrisponde alla soglia dell'azione. È come se il perpetual fosse fermo e l'ordine partisse subito: non è realizzabile, dice solo quanto varrebbe al massimo |
| Combinata | come l'attuale; in più, se l'azione supera la soglia quando il perpetual non l'ha ancora superata, si entra sul perpetual all'apertura del minuto dopo |

**Risultati, marzo–novembre 2026** (media di 10 ordini; tra parentesi il risultato per trade):

| Variante | 115 · 0,05% | 115 · 0,08% | 32 · 0,05% | 32 · 0,08% |
|---|---|---|---|---|
| **Attuale** | **+256%** (0,19) | **+123%** (0,13) | **+136%** (0,13) | **+55%** (0,08) |
| Attuale un minuto dopo | +12% (0,04) | −29% (−0,03) | −26% (−0,03) | −32% (−0,07) |
| Dall'azione | +32% (0,06) | −15% (0,00) | −4% (0,01) | −33% (−0,07) |
| Dall'azione, limite ottimista | +51% (0,07) | +3% (0,03) | +21% (0,05) | −31% (−0,10) |
| Combinata | +233% (0,18) | +111% (0,12) | +87% (0,10) | +22% (0,05) |

Con le varianti peggiori nei casi a 0,08% la strategia si ferma spesso per la perdita massima totale.

**Quando arriva il segnale.** Sugli stessi titoli, giorni e lato:
- nel 66% dei casi l'azione e il perpetual superano la soglia nello stesso minuto;
- nel 20% l'azione la supera uno o più minuti prima;
- nell'8% è il perpetual ad arrivare prima.

Questi anticipi di minuti non sono il ritardo di pochi secondi. Vengono dal fatto che le soglie partono da aperture diverse: l'azione dall'asta d'apertura, il perpetual dal suo prezzo alle 9:30, con il suo piccolo scarto (~0,1%).

**Sugli stessi trade:**

| L'azione supera la soglia… | Trade | Entrata dall'azione rispetto all'attuale | Risultato per trade: attuale → dall'azione |
|---|---|---|---|
| nello stesso minuto | 1.850 | −0,14% (peggio: si aspetta la fine del minuto) | +0,10% → −0,08% |
| 1 minuto prima | 298 | +0,27% | +0,01% → +0,25% |
| 2 o più minuti prima | 255 | +0,48% | +0,01% → +0,52% |

Entrare prima conviene quando l'azione anticipa di un minuto o più. Ma la variante combinata, che fa proprio questo con i soli dati di quel momento, perde rispetto all'attuale in tutti e quattro i casi. Il motivo: aggiunge anche entrate su titoli dove il perpetual poi non supera mai la soglia, o dove la strategia attuale lo avrebbe scartato per il livello vicino, e quelle vanno male.

**Tempo di reazione (1,3 s).** Con le candele da 1 minuto non si può rappresentare: l'entrata è all'apertura del minuto dopo e il secondo e mezzo resta dentro lo slittamento impostato. Con ritardi tipici di 2–5 secondi, 1,3 s di reazione lascerebbero comunque solo una parte del recupero: meno di 0,04% in media.

## Cosa ne viene fuori in più

Il confronto «attuale un minuto dopo» dice una cosa sulla strategia di oggi, a prescindere dall'azione.

- **Il guadagno sta tutto nei primi secondi.** Entrando alla soglia dentro il minuto si guadagnano 0,19 punti per trade. Entrando all'apertura del minuto dopo si scende a 0,04. Quasi tutto il guadagno si fa nei secondi subito dopo il superamento della soglia.
- **Non si recupera con l'azione.** Un ritardo d'entrata di un minuto non si compensa con nessun segnale preso dall'azione.
- **La velocità del Reale è importante.** Per il Reale contano il controllo veloce che legge il prezzo una volta al secondo, il tempo tra segnale e ordine (oggi circa 1,3 s) e lo slittamento d'entrata vero. Oggi è −0,12% (`docs/be-e-prova-realistica.md`), più vicino al caso 0,08% che a quello 0,05%.

## Come misurarlo d'ora in poi (proposta, non fatta)

**Obiettivo:** per qualche settimana registrare al secondo il prezzo dell'azione e quello del perpetual, dalle 9:29:30 alle 10:00, per i 115 titoli. Il Reale non si tocca.

**Perpetual.** Il controllo veloce legge già tutti i prezzi di Bitunix una volta al secondo, ma per non toccare il Reale il registro sarebbe un processo a parte. Fa la stessa lettura pubblica (`tickers` di Bitunix, una richiesta al secondo per tutti i titoli) e salva ora e prezzo.

**Azioni.**
- **Senza costi:** il flusso in tempo reale di Alpaca (websocket), che con il piano gratuito dà solo la borsa IEX. È circa il 2–3% degli scambi, ma per i titoli grandi l'ultimo prezzo è buono.
- **Con l'abbonamento a pagamento:** il flusso SIP completo.
- Con le richieste normali non si può: 115 titoli al secondo superano il limite di 200 richieste al minuto.

**Dove gira.** Un piccolo programma sul PC, oppure su un server sempre acceso, dalle 9:29 alle 10:00 nei giorni di borsa. Le funzioni di Vercel non sono adatte a tenere un websocket aperto per mezz'ora.
- Salva un file al giorno, compresso: pochi MB, con ora al millisecondo, titolo, prezzo, fonte.
- Si può tenere sul PC o in una tabella nuova (`wt_ticks`) su Supabase.

**Cosa si analizza dopo 3–4 settimane:**
- il ritardo in secondi per titolo e quanto spesso c'è, con la correlazione a ritardi di 0–30 secondi;
- quanto vale il recupero dopo i movimenti forti, in % e in confronto ai costi;
- una simulazione al secondo: l'azione supera la soglia → ordine sul perpetual 1,3 s dopo, al prezzo vero del perpetual in quel secondo, con le uscite di sempre;
- e, per la strategia attuale, quanto costa ogni secondo di ritardo nell'entrata. Il confronto «un minuto dopo» dice che conta molto.

## Conclusione

- **Il ritardo c'è:** l'azione si muove prima del perpetual, in media di 4–5 secondi; sui 32 operabili di circa 2; sui perpetual poco scambiati anche 15–25.
- **Con i dati da 1 minuto non diventa guadagno.** Il recupero del perpetual dopo un movimento forte dell'azione vale circa 0,04%, meno dei costi di un'entrata e un'uscita. Tutte le varianti con il segnale dall'azione fanno peggio della strategia attuale, anche quella che entra prima solo quando l'azione anticipa.
- **Resta aperto** se, misurando al secondo, un ritardo di qualche secondo sui perpetual più lenti valga qualcosa. Il registro proposto lo direbbe in qualche settimana. Visti i numeri, mi aspetto al massimo un piccolo vantaggio su pochi titoli poco scambiati, che sono anche quelli con lo slittamento più alto.
- **Cosa conta di più oggi:** entrare il più vicino possibile alla soglia del perpetual. È lì che la strategia guadagna.
