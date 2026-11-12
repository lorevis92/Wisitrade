# Modalità ibrida: 32 titoli in automatico, 83 a mano dal cellulare

Ricerca, su una copia del motore. L'app non è cambiata.

## In breve

- **Aprire a mano costa molto.**
  - Con 30 secondi per ordine l'ibrido fa **+158%**, contro **+255%** dei 115 tutti automatici (slittamento 0,05%). Con 45 secondi fa +128%, con 60 secondi +112%.
  - Mentre aspetti in coda il prezzo si sposta in media dello **0,22% contro di te**. Il trade manuale tipico, che guadagnava lo 0,17% in automatico, scende così allo 0,05%. Con slittamento 0,08% va in perdita.
- **Rispetto ai soli 32 operabili, con le notifiche d'uscita il guadagno è piccolo e non regge.**
  - Su tutto il periodo: +158% contro +126% con 30 secondi; +128% contro +126% con 45 secondi; con 60 secondi va peggio.
  - Negli ultimi due mesi e mezzo (ultimo 30% del periodo) l'ibrido con le notifiche fa **peggio dei soli 32** anche con 30 secondi: +51% contro +57%.
- **Per le uscite dei manuali conviene non seguirle a mano.** Basta lo stop su Bitunix, più un take profit largo se vuoi, e la chiusura a fine giornata.
  - Così l'ibrido fa **+280%**: più dei 115 automatici e più del doppio dei soli 32.
  - Batte i soli 32 in tutti e due i periodi.
  - Ha un calo un po' più profondo e un giorno peggiore un po' più brutto (−12% invece di −10%).
- **Attenzione: questo vantaggio non viene dalla modalità ibrida.** Viene dal fatto che, in questi mesi, tenere i trade fino alla chiusura ha reso più dello stop che segue e della protezione del guadagno. Sui 115 titoli succede in tutti e due i periodi. Sui 32 operabili no: nell'ultimo 30% va peggio. È una cosa da studiare a parte, prima di fidarsi.

## Come è fatta la prova

- **Dati:** archivio Bitunix da 1 minuto, dal 13 marzo al 10 novembre 2026 (168 giorni).
- **Configurazione del Reale:** 10 posti al giorno, margine 10%, leva 5, freno di mercato 8%, limiti di perdita. Le uscite dell'app avvengono sulla chiusura del minuto (`docs/percorso-candela.md`).
- **Ordini casuali:** media di 10 ordini casuali dei titoli. Slittamento 0,05% e 0,08%.
- **Titoli:** i 32 operabili in automatico, come oggi; gli altri 83 a mano.
- **Controllo della copia del motore:** con nessun titolo manuale dà esattamente gli stessi numeri dei 115 automatici (+254,9%). Con titoli manuali e 0 secondi per ordine dà +273%, cioè quanto i 115 automatici: le differenze stanno nelle normali oscillazioni tra un ordine casuale e l'altro. Quindi **tutto il costo viene dal ritardo**, non da come è fatta la prova.

**Come lavori tu, nella prova:**
- **Notifiche:** arriva una notifica per ogni segnale di un titolo manuale, se in quel momento ci sono ancora posti liberi.
- **Coda:** prendi le notifiche una alla volta, in ordine d'arrivo. Ogni ordine richiede 30, 45 o 60 secondi, stop loss compreso.
- **Quando salti un segnale:** se, quando arrivi a quel segnale, i 10 posti sono già pieni o il prezzo ha già toccato lo stop, lo salti subito, senza perdere tempo.
- **Prezzo d'entrata:** il trade si apre al prezzo del momento in cui finisci di piazzarlo, più lo slittamento. Se mentre lo piazzi il prezzo tocca lo stop, il trade non si apre.
- **Stop:** è quello della notifica, calcolato dal prezzo del segnale.
- **Posti e capitale:** sono condivisi con gli automatici e si occupano quando il trade si apre davvero.
- **Uscite, caso principale:** stop che segue, protezione del guadagno, uscite sulla candela da 15 minuti e freno arrivano come notifica per tutta la durata del trade, nella stessa coda delle entrate. Lo stop su Bitunix scatta subito, anche mentre aspetti in coda.
- **Uscite, variante senza notifiche:** su Bitunix restano solo gli ordini messi all'apertura:
  - lo stop loss;
  - eventualmente un take profit fisso a 1–4 unità di volatilità dal prezzo del segnale;
  - oppure un trailing stop con la stessa distanza dello stop che segue dell'app, che parte dopo mezza unità di guadagno.

  Il freno non chiude i manuali.

**Limiti della prova:**
- Le candele sono da 1 minuto. Il segnale si considera a metà del minuto, e dentro il minuto il prezzo va in linea retta dall'apertura alla chiusura.
- In tutti i casi, compresa la variante senza notifiche, a fine giornata (21:58 italiane) chiudi tu i manuali, con la stessa coda. Se non lo fai, la posizione resta aperta di notte con il solo stop: quel caso non è provato.
- Non ho trovato conferma che Bitunix abbia il trailing stop per questi contratti: va verificato nell'app. Il caso «trailing» è un'ipotesi.

## Risultati, tutto il periodo

Risultato medio dei 10 ordini (tra parentesi il peggiore e il migliore). «Per trade» è il risultato medio dei trade, prima quello dei manuali e poi quello degli automatici.

**Slittamento 0,05%:**

| Caso | Risultato | Peggior calo | Giorno peggiore | Trade (di cui manuali) | Per trade: manuali · automatici |
|---|---|---|---|---|---|
| Solo i 32 automatici | +126% (114…132) | 30% | −9,5% | 1.463 | — · +0,13% |
| 115 tutti automatici | +255% (154…334) | 30% | −10,4% | 1.501 (857) | +0,17% · +0,23% |
| Ibrido, 30 s, uscite con notifica | +158% (112…247) | 31% | −10,1% | 1.501 (446) | +0,05% · +0,19% |
| Ibrido, 45 s, uscite con notifica | +128% (86…205) | 31% | −10,1% | 1.501 (387) | +0,00% · +0,18% |
| Ibrido, 60 s, uscite con notifica | +112% (66…154) | 29% | −9,9% | 1.501 (319) | +0,03% · +0,14% |
| Ibrido, 30 s, solo stop su Bitunix | **+280%** (174…382) | 34% | −11,9% | 1.501 (446) | +0,25% · +0,19% |
| Ibrido, 30 s, stop + take profit 1 unità | +173% | 32% | −12,5% | 1.501 (446) | +0,09% · +0,19% |
| Ibrido, 30 s, stop + take profit 2 unità | +268% | 32% | −12,1% | 1.501 (446) | +0,24% · +0,19% |
| Ibrido, 30 s, stop + take profit 3 unità | +275% | 33% | −12,0% | 1.501 (446) | +0,25% · +0,19% |
| Ibrido, 30 s, stop + take profit 4 unità | +282% | 33% | −11,9% | 1.501 (446) | +0,26% · +0,19% |
| Ibrido, 30 s, stop + trailing di Bitunix | +252% | 32% | −12,2% | 1.501 (446) | +0,21% · +0,19% |

**Slittamento 0,08%:**

| Caso | Risultato | Peggior calo | Giorno peggiore |
|---|---|---|---|
| Solo i 32 automatici | +48% | 34% | −9,7% |
| 115 tutti automatici | +124% | 33% | −10,5% |
| Ibrido, 30 s, uscite con notifica | +59% | 35% | −10,2% |
| Ibrido, 45 s, uscite con notifica | +48% | 34% | −10,0% |
| Ibrido, 60 s, uscite con notifica | +37% | 35% | −10,0% |
| Ibrido, 30 s, solo stop su Bitunix | **+146%** | 37% | −12,1% |
| Ibrido, 30 s, stop + take profit 3 unità | +142% | 36% | −12,3% |
| Ibrido, 30 s, stop + take profit 4 unità | +147% | 36% | −12,1% |
| Ibrido, 30 s, stop + trailing di Bitunix | +119% | 34% | −12,4% |

Con 0,08% i trade manuali con le notifiche d'uscita perdono in media lo 0,03% (30 s), lo 0,06% (45 s) e lo 0,03% (60 s).

## Primo 70% e ultimo 30%

Primo periodo: 13 marzo – 28 agosto. Secondo periodo: 31 agosto – 10 novembre. Ogni periodo parte da capo.

| Caso | 0,05%: primo 70% | 0,05%: ultimo 30% | 0,08%: primo 70% | 0,08%: ultimo 30% |
|---|---|---|---|---|
| Solo i 32 | +44% | +57% | +12% | +33% |
| 115 tutti automatici | +191% | +24% | +119% | +4% |
| Ibrido, 30 s, uscite con notifica | +71% | +51% | +26% | +26% |
| Ibrido, 60 s, uscite con notifica | +52% | +41% | +18% | +17% |
| Ibrido, 30 s, solo stop | +122% | +72% | +66% | +49% |
| Ibrido, 30 s, stop + take profit 3 unità | +116% | +75% | +62% | +50% |
| Ibrido, 30 s, stop + trailing di Bitunix | +116% | +64% | +58% | +40% |

- Nell'ultimo 30% i 115 automatici vanno molto peggio dei soli 32. Gli 83 titoli in più, da soli, in questi mesi hanno tolto.
- L'ibrido con le notifiche d'uscita è sotto i soli 32 nell'ultimo 30%, a tutti e due gli slittamenti.
- Le varianti senza notifiche d'uscita sono sopra i soli 32 in tutti e due i periodi.

## Mese per mese (slittamento 0,05%)

| Mese | Solo 32 | 115 automatici | Ibrido 30 s, notifiche | Ibrido 60 s, notifiche | Ibrido 30 s, solo stop | Ibrido 30 s, take profit 3 | Ibrido 30 s, trailing |
|---|---|---|---|---|---|---|---|
| marzo (dal 13) | +5% | +5% | +5% | +5% | +5% | +5% | +5% |
| aprile | +17% | +16% | +14% | +14% | +20% | +17% | +19% |
| maggio | +16% | +14% | +21% | +20% | +17% | +17% | +22% |
| giugno | +9% | +43% | +26% | +18% | +19% | +21% | +24% |
| luglio | +15% | +15% | +9% | +4% | +42% | +42% | +29% |
| agosto | −20% | +30% | −12% | −12% | −7% | −9% | −8% |
| settembre | +10% | +23% | +24% | +15% | +27% | +27% | +22% |
| ottobre | +32% | −7% | +15% | +10% | +19% | +21% | +19% |
| novembre (fino al 10) | +8% | +6% | +4% | +10% | +12% | +11% | +12% |

## La coda: quanti segnali e quanta attesa

Con 30 secondi per ordine, su tutto il periodo (media dei 10 ordini casuali):

| Cosa | Valore |
|---|---|
| Giorni con almeno una notifica d'entrata | 83% dei giorni |
| Notifiche d'entrata al giorno | 11,6 in media; massimo 39 in un giorno |
| Giorni con 2 o più notifiche nello stesso minuto | 70% (quasi sempre alle 9:30–9:31); massimo 21 nello stesso minuto |
| Notifiche saltate perché i posti erano già pieni quando ci arrivavi | 1.494 su 1.941 |
| Ordini manuali piazzati davvero | 446, cioè circa 2,7 al giorno |
| Attesa dalla notifica al trade aperto | mediana 60 s; 90% sotto 150 s; massimo 4 minuti |
| Attesa più lunga del giorno | mediana 90 s; nei giorni peggiori 4 minuti |
| Trade persi perché il prezzo ha toccato lo stop prima dell'apertura | circa 1 in tutto il periodo |
| Spostamento del prezzo durante l'attesa | in media 0,22% contro di te |

Con 45 secondi l'attesa massima sale a 6 minuti, con 60 secondi a 7 minuti. Gli ordini piazzati scendono a 387 con 45 secondi e a 319 con 60 secondi, perché nel frattempo gli automatici occupano i posti.

**Uscite dei trade manuali, caso con le notifiche (30 s):**
- Le notifiche d'uscita sono 306, cioè circa 1,8 al giorno di trading. Si chiudono in 30 secondi in mediana; il 90% entro 60 secondi.
- **73 su 306 (24%) arrivano dopo le 16:00 italiane.** In più ci sono 70 chiusure di fine giornata, alle 21:58.
- Nella variante senza notifiche ci sarebbero circa 309 uscite e 35 chiusure del freno che non fai. È proprio lì che, in questi mesi, si guadagna di più, perché i trade restano aperti.

## Perché le uscite «a mano» vanno così

- L'uscita a mano arriva 30–60 secondi dopo la chiusura del minuto, a un prezzo peggiore. Pesa soprattutto su stop che segue e protezione del guadagno, che scattano quando il prezzo sta tornando indietro.
- Ma c'è di più. Anche senza nessun ritardo, nel motore originale lo stesso effetto si vede sull'intera strategia: togliere stop che segue e protezione del guadagno e tenere fino alla chiusura dà:
  - sui 115 titoli, circa il doppio sia nel primo 70% (+434% contro +191%) sia nell'ultimo 30% (+38% contro +24%);
  - sui 32 operabili, di più nel primo 70% (+91% contro +44%) ma **di meno nell'ultimo 30%** (+44% contro +57%), con un calo più profondo.
- Quindi «solo stop» sui manuali conviene perché in questi mesi gli 83 titoli in più hanno avuto movimenti lunghi nella giornata. Non è detto che duri. Prima di cambiare qualcosa nelle uscite dell'app serve una ricerca apposta.

## Conclusione

1. **Quanto costa l'apertura manuale rispetto ai 115 automatici:** circa 100 punti su 255 con 30 secondi per ordine (+158% contro +255%), e quasi 145 punti con 60 secondi (+112%). Con slittamento 0,08% si scende da +124% a +59% (30 s) e a +37% (60 s). Il costo viene dall'attesa: il prezzo si sposta di circa lo 0,22% prima che il trade si apra, e questo si mangia quasi tutto il guadagno dei trade manuali.
2. **Quanto guadagna rispetto ai soli 32**, con le uscite seguite a mano:
   - con 30 secondi, su tutto il periodo, +32 punti a 0,05% (+158% contro +126%) e +11 a 0,08%;
   - con 45 secondi siamo pari, con 60 secondi va peggio;
   - nell'ultimo 30% va peggio dei soli 32 anche con 30 secondi.

   **Non vale la fatica.**
3. **Quale gestione delle uscite conviene:** per i trade manuali, **nessuna notifica d'uscita**. Si mette su Bitunix lo stop all'apertura, insieme all'ordine, più un take profit largo (3–4 unità) se lo vuoi, e si chiude a fine giornata.
   - Così l'ibrido fa +280% (0,05%) e +146% (0,08%), sopra i soli 32 in tutti e due i periodi.
   - In cambio hai un giorno peggiore di circa −12% invece di −10%, e il freno non protegge i manuali.
   - Il take profit stretto (1 unità) peggiora.
   - Il trailing di Bitunix, se esiste per questi contratti, fa un po' meno del solo stop.
4. **Se vuoi provarla:** apri a mano solo i primi segnali che riesci a piazzare entro un minuto o due. Metti stop e take profit nell'ordine e non seguire le uscite: in questi mesi è il modo che rende di più, e ti permette di staccare dal telefono dopo le 16:00. Resta una chiusura a mano verso le 21:58, oppure la scelta di tenere di notte, che non è provata. Ricorda che il vantaggio viene da come si sono mossi questi titoli negli ultimi mesi, non dall'ibrido in sé. Conviene verificarlo per qualche settimana in Prova o con importi piccoli.

## File della ricerca

Sono sul PC, nella cartella temporanea della ricerca (`scratchpad/hy`):
- copia del motore con la coda manuale: `shared/engine.js`, dove il blocco «modalità ibrida» si attiva solo con `globalThis.__hy`;
- prova: `run.mjs`;
- risultati: `res.json`, `A-res-*.json` (primo 70%), `B-res-*.json` (ultimo 30%).
