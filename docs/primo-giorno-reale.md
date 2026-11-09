# Primo giorno del Reale (9 novembre 2026)

Dati presi dal database dell'app (trade, titoli scartati, prenotazioni dei titoli con l'ora al millisecondo, aperture
salvate dal controllo veloce) e da Bitunix (candele da 1 minuto del 9 novembre, fino alle 10:28 di New York). L'analisi
è stata fatta alle 10:30 di New York: le entrate sono complete (finestra d'entrata 9:30–10:00), mentre BABA è ancora aperta.

**Configurazione del Reale:**
- 115 titoli (originali + nuovi), di cui 32 operabili via API;
- capitale dedicato 50 USDT, margine 10%, leva 5x (circa 25 USDT per trade), 10 posizioni al giorno;
- freno 8%, limiti 10%/30%.

## In breve

- **Simulazione e Reale coincidono:** simulando il 9 novembre con i 21 titoli che il Reale poteva davvero usare, escono **gli stessi 6 trade** (ASTS, SMCI, BABA, ARM, QQQ, TSM), nella stessa direzione e quasi agli stessi prezzi.
  - Risultato dei trade chiusi: **−3,35 USDT in Simulazione, −3,30 USDT nel Reale.**
- **La grande differenza rispetto ai test viene dai titoli**, non dall'esecuzione. Dei 115 titoli il Reale ne poteva usare 21: 34 non sono operabili via API e 11 non accettano lo stop via API (vedi `docs/titoli-operabili.md`).
- **Errori trovati e corretti:**
  1. il segno dello slittamento (ora negativo = peggio per te);
  2. il prezzo del "segnale" nell'entrata veloce (ora è la soglia);
  3. il controllo veloce bloccato dai tentativi sui titoli non operabili;
  4. il costo delle 11 aperture e chiusure immediate, che non era contato nel capitale;
  5. lo spazio dal livello controllato sul prezzo letto invece che sulla soglia;
  6. le uscite del controllo ogni minuto che aspettavano le candele delle entrate.

## 1. Slittamento: segno e prezzo del segnale

**Due errori:**
1. **Segno.** Con la formula di prima un prezzo migliore usciva negativo (per esempio QQQ −0,155%), mentre la tua convenzione è negativo = peggio per te. Ora il segno è giusto:
   - entrata = lato × (soglia − eseguito) / soglia;
   - uscita = lato × (eseguito − livello d'uscita) / livello.
2. **Prezzo del segnale nell'entrata veloce.** Era salvato il prezzo letto nel giro di prezzi in cui il segnale è scattato, non la soglia. Ora il prezzo del segnale è la soglia (apertura ± 1,25 × movimento). Il prezzo letto resta salvato a parte (`sigPx`), così si vede quanto il prezzo era già oltre la soglia quando il controllo l'ha visto.
   - Nel controllo ogni minuto il prezzo del segnale era già la soglia.
   - Per le uscite il prezzo del segnale è il livello d'uscita: stop, livello che segue, chiusura della candela. Per le uscite decise sul prezzo del momento (candela in corso) ora si salva il livello invece del prezzo.

**Slittamento corretto dei trade di oggi** (già ricalcolato e salvato nel database per i 4 trade veloci). Negativo = peggio per te.

| Titolo | Lato | Soglia | Letto al segnale | Eseguito | **Entrata** | di cui: soglia → letto | letto → eseguito | Livello d'uscita | Uscita eseguita | **Uscita** |
|---|---|---|---|---|---|---|---|---|---|---|
| ASTS | Short | 33,131 | 33,08 | 33,07 | **−0,18%** | −0,15% | −0,03% | 35,98 (stop) | 35,99 | **−0,03%** |
| SMCI | Short | 27,699 | 27,67 | 27,70 | **+0,00%** | −0,11% | +0,11% | 29,24 (stop) | 29,26 | **−0,07%** |
| BABA | Short | 106,166 | 106,12 | 106,05 | **−0,11%** | −0,04% | −0,07% | aperta | | |
| ARM | Long | 179,283 | 179,44 | 179,02 | **+0,15%** | −0,09% | +0,23% | 180,91 | 181,52 | **+0,34%** |
| QQQ | Long | 672,30 | — | 671,26 | **+0,15%** | | | 672,97 | non arrivato da Bitunix | — |
| TSM | Long | 388,638 | — | 388,92 | **−0,07%** | | | 391,48 | 389,51 | **−0,50%** |

- **Entrata:** in media −0,01%, praticamente zero. Nella Simulazione si usa −0,05%.
- **Uscita:** in media −0,07% sulle 4 uscite misurate. Pesa TSM (−0,50%), che è uscito con un minuto di ritardo (punto 2).
- **QQQ:** il prezzo d'uscita vero non era ancora nello storico di Bitunix quando la posizione è stata chiusa. Ora il controllo ogni minuto lo richiede di nuovo più tardi e corregge prezzo, commissioni, risultato e capitale dedicato (`repairLiveClosed`).

## 2. Tempi delle entrate

**Controllo veloce:**
- Il registro salvava solo l'ultima chiamata, cioè quella delle 9:41.
  - Quella chiamata è partita alle 9:41:03 e ha letto i prezzi fino alle 9:45:00, con 197 giri (circa uno al secondo).
  - Della chiamata delle 9:29 non è rimasto il registro. Che girasse lo dimostrano le aperture salvate, uguali all'apertura della candela delle 9:30 su tutti i titoli (TSM −0,03% e ORCL +0,06% a parte), e il primo tentativo d'ordine, alle 9:30:05.
- **Corretto:** ora ogni chiamata resta nel registro del giorno (`fast:runs:<giorno>`), con inizio, primo e ultimo giro di prezzi e fine.

| Titolo | Origine | Segnale | Inizio controlli | Ordine inviato | Eseguito (Bitunix, al secondo) | Ritardo segnale → ordine |
|---|---|---|---|---|---|---|
| ASTS | veloce | 9:30:57,1 | 9:30:58,8 | 9:30:59,6 | 9:30:59 | 2,5 s |
| SMCI | veloce | 9:31:11,5 | 9:31:12,1 | 9:31:12,9 | 9:31:13 | 1,4 s |
| BABA | veloce | 9:35:42,7 | 9:35:43,4 | 9:35:44,3 | 9:35:44 | 1,6 s |
| ARM | veloce | 9:39:24,8 | 9:39:25,5 | 9:39:26,4 | 9:39:26 | 1,6 s |
| QQQ | minuto | 9:46:22,6 | 9:46:23,0 | 9:46:23,9 | 9:46:24 | 1,3 s |
| TSM | minuto | 9:47:19,0 | 9:47:19,4 | 9:47:20,2 | 9:47:20 | 1,2 s |

- **Da dove viene il ritardo:**
  - dal segnale all'inizio dei controlli 0,4–1,7 s: saldo, limiti, prenotazione;
  - dall'inizio dei controlli all'ordine circa 0,85 s: posizioni, ordini e margine letti su Bitunix;
  - l'esecuzione è immediata, ma Bitunix dà l'ora solo al secondo.
- **Corretto:** posizioni e ordini ora si leggono in parallelo, circa 0,3 s in meno. La lettura del margine prima di ogni ordine resta, come da regola.

**Perché quasi nessuna entrata nel primo minuto:**
1. **Il controllo veloce era bloccato dai titoli non operabili.** Dalle 9:30:05 alle 9:31:37 ha tentato uno dopo l'altro 20 ordini su titoli che Bitunix rifiuta via API (COHR, BSP, AAOI, CYPH, GEV…). Ogni tentativo costava 1–4 secondi, notifiche comprese, e nel frattempo il controllo non leggeva i prezzi.
   - ASTS era sotto la soglia già nella candela delle 9:30, ma il controllo l'ha visto solo alle 9:30:57.
   - Ora questi titoli non si tentano più: lista "operabili via API".
2. **Con i titoli operabili oggi l'apertura era tranquilla.** Anche la Simulazione con i 21 titoli usabili entra nella prima candela solo con ASTS (1 trade su 6). Il "75% entra nella prima candela" vale per i 115 titoli, dove molti titoli piccoli si muovono subito: con i 115, il 9 novembre la Simulazione apre tutti e 10 i trade alle 9:30. Erano quasi tutti titoli non operabili.
3. **QQQ e TSM hanno superato la soglia dopo le 9:45**, quando il controllo veloce era già finito. Li ha aperti il controllo ogni minuto, con 1 minuto e 22 secondi di ritardo sulla candela del segnale.
   - **Corretto:** il controllo veloce ora va fino alle 10:00, cioè tutta la finestra d'entrata. Serve un terzo job su cron-job.org (vedi in fondo).

**Ritardi del controllo ogni minuto.**

Le uscite decise sulla chiusura di una candela sono partite tardi:
- ARM alle 9:45:41 invece che alle 9:45:0x;
- TSM alle 10:01:09 invece che alle 10:00: in quel minuto TSM è sceso dello 0,5%;
- QQQ è entrato alle 9:46:22.

Il controllo ogni minuto prima scaricava le candele di tutti i titoli in gioco per le entrate (oggi fino a circa 80) e solo dopo guardava le posizioni aperte.

**Corretto:**
- **Uscite prima di tutto:** prima si scaricano le candele delle sole posizioni aperte e si fanno le uscite, poi le entrate.
- **Meno candele da scaricare:** con la lista degli operabili le candele per le entrate passano da circa 80 a meno di 30.
- **Registro dei tempi:** dalle 9:25 alle 10:30 ogni minuto si salvano i tempi (`ticklog:<giorno>`): partenza rispetto all'inizio del minuto, uscite fatte, entrate fatte. Domani si vedrà se resta un ritardo dovuto a cron-job.org.

## 3. Titoli scartati oggi nel Reale

| Motivo | Titoli | Quali |
|---|---|---|
| Livello troppo vicino (massimo/minimo/chiusura di ieri, massimo 5 giorni) | 39 | BE MP MU APP BOT EWY GLW HUT JPM NOW VRT VST WEN XOM ALAB AMAT AMZN AVGO DDOG DELL DRAM FLNC HIMS LITE META MRNA MRVL NBIS ONDS PLTR QCOM RDDT RKLB SHAZ SHOP SNDK SOFI USAR GOOGL |
| Non operabile via API (ordine rifiutato) | 34 | GS BSP DJT EWT GEV HPE LLY NET NOK TEM WDC AAOI ASML AXTI BMNR BWET CBRS CIEN COHR CRDO CRML CRWV CYPH FLEX FWDI IONQ IREN KLAC LRCX OKLO ORCL SECZ SNOW ZCSH |
| Stop loss non impostabile (aperta e chiusa subito) | 11 | AMD AAPL COIN CRCL HOOD INTC MSTR NVDA SKHY SPCX TSLA |
| Minimo d'ordine | 0 | |
| Posizione o ordine manuale | 0 | |
| Altro | 0 | |

Sono 84 titoli scartati e 6 trade; gli altri 25 titoli non hanno dato segnale. Dei 21 titoli usabili, 10 sono stati scartati per un livello vicino, esattamente come nella Simulazione.

**Costo degli 11 titoli aperti e chiusi subito:**
- **Stima: circa 0,36 USDT in tutto** (circa 0,03 USDT a trade su circa 25 USDT di posizione), cioè lo 0,7% del capitale dedicato.
  - commissione 0,06% in entrata e in uscita: 0,03 USDT a trade;
  - spread registrato alle 9:30–9:35: 0,003–0,02%, cioè meno di 0,006 USDT a trade;
  - a questo si somma il movimento del prezzo nei 1–2 secondi tra apertura e chiusura, che non è misurabile.
- **Perché è una stima:** l'app non salvava queste posizioni, e io non posso leggere lo storico di Bitunix perché le chiavi sono solo su Vercel. La cifra esatta è nello storico posizioni di Bitunix.
- **Errore trovato:** questo costo **non era contato nel capitale dedicato**. Il capitale dell'app (46,70 USDT) è più alto di quello vero di circa 0,36 USDT.
- **Corretto:** da ora una posizione aperta e chiusa subito si legge dallo storico di Bitunix (prezzo d'uscita e commissioni veri). Il costo si toglie dal capitale dedicato, resta nel registro del giorno (`closecost:<giorno>`) e arriva una notifica.

## 4. Reale, Simulazione e Prova trade per trade

**Simulazione del 9 novembre** (stesso motore dell'app; candele di Bitunix fino alle 10:28, BABA ancora aperta):
- **Sim 21:** configurazione del Reale con i 21 titoli che il Reale poteva usare (operabili via API, senza gli 11 con lo stop rifiutato), 50 USDT, slittamento 0,05%.

| Titolo | Lato | Simulazione (21 titoli) | Reale | Prova | Differenze |
|---|---|---|---|---|---|
| ASTS | Short | 9:30 · 33,114 → 36,037 stop loss (10:28) · −8,95% · −2,24 USDT | segnale 9:30:57 · 33,07 → 35,99 stop di Bitunix (10:15–10:16) · −8,93% · −2,22 USDT | — (non nei titoli della Prova) | entrata 57 s dopo (controllo veloce bloccato) a un prezzo un po' peggiore; stop calcolato dal prezzo eseguito, quindi più basso e preso prima; risultato quasi uguale |
| SMCI | Short | 9:31 · 27,686 → 29,240 stop loss (9:57) · −5,74% · −1,44 USDT | 9:31:11 · 27,70 → 29,26 stop di Bitunix (9:57) · −5,73% · −1,43 USDT | — | uguale |
| BABA | Short | 9:35 · 106,113 → aperta (−0,26% alle 10:28) | 9:35:42 · 106,05 → aperta | 9:35:42 · 106,12 → aperta | entrata 0,11% peggiore della soglia |
| ARM | Long | 9:39 · 179,373 → 180,820 nessuna conferma (9:45) · +0,69% · +0,17 USDT | 9:39:24 · 179,02 → 181,52 (9:45:41) · +1,30% · +0,30 USDT | 9:39:24 · 179,44 → 180,91 (9:45:40) · +1,05 USDT su 150 | eseguito sotto la soglia (+0,15%); uscita 41 s dopo con il prezzo salito (+0,34%) |
| QQQ | Long | 9:45 · 672,636 → 674,053 nessuna conferma (10:00) · +0,09% · +0,02 USDT | minuto, 9:46:22 · 671,26 → 672,97 ritracciamento (9:56:23) · +0,13% · +0,03 USDT | — | segnale nella candela delle 9:45, dopo la fine del controllo veloce; uscita prima con il controllo sulla candela in corso e livelli calcolati dal prezzo eseguito (671,26); prezzo d'uscita vero non ancora arrivato da Bitunix |
| TSM | Long | 9:46 · 388,832 → 391,284 nessuna conferma (10:00) · +0,51% · +0,13 USDT | minuto, 9:47:19 · 388,92 → 389,51 (10:01:09) · +0,05% · +0,01 USDT | — | uscita un minuto in ritardo: il prezzo era sceso dello 0,5% (vedi punto 2) |
| **Totale chiusi** | | **−3,35 USDT** | **−3,30 USDT** (più circa −0,36 USDT degli 11 non contati) | | |

**Altre simulazioni dello stesso giorno:**
- **Sim 32**, i 32 operabili: lo stop dentro l'ordine avrebbe funzionato anche per gli 11 (vedi `docs/titoli-operabili.md`). 10 trade (NVDA, TSLA, COIN, HOOD, SPCX, SMCI, ASTS, INTC, MSTR, BABA) e **−8,8%**. Il freno all'8% chiude tutto alle 10:11. Oggi gli 11 avrebbero fatto perdere di più.
- **Sim 115**, tutti i titoli: 10 trade, tutti alle 9:30 e quasi tutti non operabili (IREN, APP, CYPH, AVGO, NVDA, CRWV, ASTS, AAOI, COHR, CBRS). −7,4% alle 10:28.
- **Prova con le sue impostazioni:** 10 trade, quasi gli stessi della Prova vera (NVDA, TSLA, COIN, HOOD, ORCL, INTC, MSTR, BABA, AAPL; AVGO al posto di ARM).
  - La Prova ha scartato AVGO perché nell'entrata veloce lo spazio dal livello si controllava sul prezzo letto, già oltre la soglia, invece che sulla soglia come nella Simulazione.
  - **Corretto:** ora si controlla sulla soglia.

## 5. Prova e Reale non hanno le stesse impostazioni

La Prova oggi girava con le **impostazioni di default dell'app**, perché non è mai stata salvata con una configurazione: in Prova `settings` è vuoto. Le differenze:

| | Prova | Reale |
|---|---|---|
| Titoli | 34 originali (32 su Bitunix + MA e BA, che su Bitunix non ci sono) | 115 (originali + nuovi) |
| Freno di mercato | spento | 8% |
| Capitale | 100% del saldo della Prova (300 USDT, posizioni da circa 150 USDT) | capitale dedicato 50 USDT (posizioni da circa 25 USDT) |
| Lista operabili via API | no: non c'era ancora | — |

Le altre regole sono uguali: 10 posizioni, margine 10%, leva 5x, stop, uscite, scelta "ordine della lista".

**Conseguenza:**
- Le 10 posizioni della Prova sono state riempite da titoli che il Reale non poteva usare (NVDA, ORCL, INTC, TSLA, COIN, HOOD, AAPL, MSTR).
- I segnali in comune sono stati 2, non uno: ARM (chiuso) e BABA (ancora aperto).
- QQQ e TSM in Prova non c'erano, e AMD e LLY sono stati scartati per il limite di posizioni.

**Corretto:**
- **Stessa lista di operabili:** da oggi la Prova usa sempre la stessa lista di titoli operabili del Reale.
- **Avviso nella Prova:** se le sue regole sono diverse da quelle del Reale, la Prova mostra cosa è diverso.
- **Pulsante "Usa le regole del Reale":** carica in Prova le regole e i titoli del Reale e lascia il capitale della Prova. Va premuto Salva.

**Da fare tu:** apri Strategia → Prova, premi "Usa le regole del Reale" e poi Salva.

## Riassunto: perché il Reale si allontana dalla Simulazione

In ordine di importanza:

1. **Titoli che il Reale non può usare** (34 non operabili via API, 11 con lo stop rifiutato). Il risultato atteso dei test (115 titoli) non vale per il Reale. Sullo stesso insieme di titoli, Simulazione e Reale coincidono: 6 trade uguali, −3,35 contro −3,30 USDT.
2. **Ritardi del controllo ogni minuto sulle uscite** (ARM 41 s, TSM 69 s). Hanno spostato i risultati di ±0,3–0,5% per trade: oggi uno a favore (ARM) e uno contro (TSM). Corretto: uscite prima di tutto e registro dei tempi.
3. **Controllo veloce bloccato nel primo minuto** dai tentativi sui titoli non operabili: ASTS è entrato 57 s dopo. Corretto con la lista degli operabili. Dopo le 9:45 le entrate passavano al controllo ogni minuto: ora il controllo veloce va fino alle 10:00.
4. **Costi nascosti:** circa 0,36 USDT per le 11 aperture e chiusure immediate, non contati nel capitale. Corretto.
5. **Livelli d'uscita calcolati dal prezzo eseguito** invece che dalla soglia, come fa il Reale. Cambiano di poco il momento dello stop (ASTS) e delle uscite (QQQ). È voluto, perché lo stop vero su Bitunix si basa sul prezzo eseguito.
6. **Slittamento d'esecuzione:** piccolo, in media −0,01% in entrata. Più piccolo dello 0,05% usato in Simulazione.
7. **Prezzo d'apertura:** uguale. Le aperture del controllo veloce coincidono con l'apertura delle candele delle 9:30, a parte TSM (−0,03%) e ORCL (+0,06%). Non è una causa.

## Da configurare su cron-job.org

Aggiungi un terzo job uguale agli altri due: `https://<tuo-dominio>/api/cron/fast?key=<CRON_SECRET>`, fuso America/New_York, lun–ven alle **09:53**. Così il controllo veloce copre tutta la finestra d'entrata fino alle 10:00. Senza il terzo job il controllo veloce finisce alle 9:53 circa e poi entra il controllo ogni minuto.

## Come è stato fatto

- **Dati del giorno:** script di lettura del database (solo lettura, più la correzione dello slittamento dei 4 trade veloci).
- **Simulazione:** `wide/day1sim.mjs` nello scratchpad della sessione, con il motore dell'app (`shared/engine.js`), la preparazione dall'archivio fino al 6 novembre e le candele del 9 novembre da Bitunix. I risultati sono in `wide/day1sim.json`.
- **Prove:** passano `node tests/operable.test.mjs` (8, compreso il costo della chiusura immediata), `node tests/live.test.mjs` (13) e `node tests/fast.test.mjs` (7, compresa la soglia salvata come prezzo del segnale).
