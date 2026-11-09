# Entrata e volumi: conviene aspettare o guardare i volumi?

Test con lo stesso motore di Simulazione, Prova e Reale, senza dati futuri. Condizioni:

- titoli: originali + nuovi (115);
- leva 5x, margine 10%, 10 posizioni al giorno;
- freno 8%, limite giornaliero 10%, limite totale spento;
- commissione 0,06%, funding 0,01%, slittamento 0,05% (e 0,08% su tutto il periodo).

Periodi: tutto (9 marzo–6 novembre), marzo–agosto e settembre–6 novembre. Ogni prova è fatta con l'ordine della lista e con 20 ordini casuali dei titoli; si riportano la loro media, il minimo e il massimo.

## Le tre opzioni (nelle regole, spente di default)

1. **Ritardo d'entrata (1, 2, 3 o 5 minuti):** nessuna entrata prima di quel minuto. Se allo scadere il titolo è già oltre la soglia, si entra all'apertura della candela successiva, più lo slittamento, solo se in quel momento è ancora oltre la soglia.
2. **Filtro volume all'entrata (1×, 1,5×, 2× o 3×):** si entra solo se il volume della candela da 1 minuto chiusa **prima** di quella del segnale è almeno quel multiplo del volume normale dello stesso minuto, cioè la media dei 10 giorni precedenti.
   - Si usa la candela precedente perché il segnale scatta dentro la sua candela, quando il volume di quella candela non si conosce ancora.
   - Se il segnale scatta nella prima candela (9:30) non c'è nessuna candela chiusa da guardare, quindi il trade si salta.
3. **Conferma volume dopo l'entrata (2, 3 o 5 minuti):** nei primi N minuti, se una candela chiude con volume sotto il normale di quel minuto e con il prezzo tornato al livello d'entrata o peggio, si chiude a quella chiusura, come le altre uscite decise a candela chiusa.

Il volume normale minuto per minuto, dalle 9:30 alle 10:05, viene dall'archivio da 1 minuto. In Prova e nel Reale lo prepara la preparazione del mattino, dallo stesso archivio.

## In breve

**Nessuna opzione migliora la strategia.** Peggiorano tutte, in tutti i periodi, con la lista e con la media degli ordini casuali. Il motivo principale è che **1107 trade su 1481 (75%) entrano già nella prima candela, quella delle 9:30**: il guadagno della strategia sta soprattutto lì.

- **Ritardo d'entrata:** anche 1 minuto costa molto (a dimensione fissa, media dei casuali, da +548 a +327 USDT). Da 2 minuti in su il guadagno sparisce o diventa perdita: si entra dopo che il movimento iniziale è già avvenuto, a prezzi peggiori, e gli stop loss non diminuiscono.
- **Filtro volume all'entrata:** scarta tutti i segnali della prima candela; i posti liberi vengono presi da segnali più tardivi (i trade scendono da 1.481 a 1.111 con 1× e a 249 con 3×), che guadagnano poco (0,03–0,10% a trade contro 0,25%). Riduce il peggior calo, ma solo perché si fanno meno trade.
- **Conferma volume dopo l'entrata:** dimezza circa gli stop loss (da 153 a 77 con 3 minuti). Però chiude in pari o in leggera perdita molti trade che poi sarebbero andati bene: il guadagno medio per trade scende da 0,25% a circa 0,14%.
- **Combinazioni:** nessuna migliora. Tutte restano sotto la configurazione attuale, e quelle con ritardo di 2 minuti vanno in perdita.
- **Analisi per volume:** il volume della candela del segnale non distingue i trade buoni da quelli cattivi. In tutti e 4 i gruppi vince circa il 73% dei trade, con risultato medio simile (vedi sotto).

## Cosa ti consiglio

Lascia le tre opzioni **spente**. Entrare subito, già nella prima candela, è la parte che rende di più della strategia.

Se lo slittamento vero nei primi minuti risultasse molto più alto del previsto (lo misura il Reale, nella pagina Slittamento), allora un ritardo di 1 minuto potrebbe tornare utile. Con lo 0,05–0,08% simulato qui, però, non conviene.

## Tabella riassuntiva

Tutto il periodo. "Composto" = interesse composto in %; "fisso" = dimensione fissa (30 USDT di margine a trade) in USDT. Per i casuali: media (minimo – massimo).

| Prova | Composto, lista | Composto, 20 casuali | Fisso, 20 casuali | Peggior calo (media) | Giorno peggiore (media) | Trade | Stop loss | Guadagno medio a trade (fisso) |
|---|---|---|---|---|---|---|---|---|
| **Configurazione attuale (nessuna opzione)** | +643% | +420% (+236 – +654) | +548 (+426 – +674) | −29% | −10,6% | 1481 | 153 | +0,37 USDT (+0,25%) |
| Ritardo 1 minuto | +153% | +155% (+20 – +286) | +327 (+110 – +458) | −32% | −12,4% | 1474 | 151 | +0,22 USDT (+0,15%) |
| Ritardo 2 minuti | +54% | +6% (−40 – +75) | +49 (−104 – +218) | −58% | −12,3% | 1472 | 170 | +0,03 USDT (+0,02%) |
| Ritardo 3 minuti | +21% | −29% (−51 – +16) | −64 (−139 – +87) | −63% | −11,5% | 1475 | 162 | −0,04 USDT (−0,03%) |
| Ritardo 5 minuti | −64% | −57% (−71 – −36) | −167 (−212 – −100) | −69% | −10,8% | 1468 | 160 | −0,11 USDT (−0,10%) |
| Filtro volume 1× | +24% | +29% (+22 – +35) | +93 (+78 – +108) | −31% | −8,3% | 1111 | 137 | +0,08 USDT (+0,06%) |
| Filtro volume 1,5× | +9% | +9% (+9 – +9) | +29 (+29 – +29) | −26% | −5,9% | 754 | 100 | +0,04 USDT (+0,03%) |
| Filtro volume 2× | +24% | +24% (+24 – +24) | +70 (+70 – +70) | −16% | −6,1% | 480 | 54 | +0,15 USDT (+0,10%) |
| Filtro volume 3× | +3% | +3% (+3 – +3) | +8 (+8 – +8) | −9% | −6,1% | 249 | 33 | +0,03 USDT (+0,03%) |
| Conferma volume 2 minuti | +89% | +146% (+66 – +242) | +303 (+187 – +406) | −35% | −9,5% | 1481 | 94 | +0,20 USDT (+0,14%) |
| Conferma volume 3 minuti | +79% | +140% (+66 – +240) | +292 (+184 – +406) | −30% | −9,3% | 1481 | 77 | +0,20 USDT (+0,13%) |
| Conferma volume 5 minuti | +86% | +159% (+82 – +259) | +310 (+208 – +418) | −26% | −8,3% | 1481 | 63 | +0,21 USDT (+0,14%) |
| Ritardo 1 + volume 1× | +22% | +11% (−7 – +49) | +61 (−3 – +161) | −45% | −12,7% | 1310 | 156 | +0,05 USDT (+0,04%) |
| Ritardo 1 + volume 1,5× | +72% | +44% (+19 – +62) | +135 (+73 – +180) | −38% | −12,6% | 1057 | 146 | +0,13 USDT (+0,09%) |
| Ritardo 2 + volume 1,5× | −35% | −45% (−54 – −32) | −134 (−159 – −95) | −64% | −13,1% | 1044 | 155 | −0,13 USDT (−0,09%) |
| Ritardo 2 + volume 2× | −21% | −32% (−38 – −27) | −97 (−113 – −80) | −53% | −9,0% | 770 | 114 | −0,13 USDT (−0,08%) |
| Ritardo 1 + conferma 3 minuti | +4% | +8% (−20 – +44) | +37 (−51 – +138) | −40% | −10,1% | 1474 | 72 | +0,02 USDT (+0,02%) |
| Volume 1,5× + conferma 3 minuti | −6% | −6% (−6 – −6) | −17 (−17 – −17) | −33% | −5,5% | 754 | 51 | −0,02 USDT (−0,01%) |
| Ritardo 1 + volume 1,5× + conferma 3 | +32% | +2% (−11 – +15) | +13 (−29 – +56) | −44% | −11,6% | 1057 | 84 | +0,01 USDT (+0,02%) |

## Per periodo e con slittamento 0,08%

Dimensione fissa, media dei 20 ordini casuali, in USDT (tra parentesi l'ordine della lista).

| Prova | Mar–ago | Set–6 nov | Tutto (0,05%) | Tutto (0,08%) |
|---|---|---|---|---|
| Configurazione attuale (nessuna opzione) | +401 (+445) | +147 (+217) | +548 (+662) | +416 (+538) |
| Ritardo 1 minuto | +189 (+164) | +137 (+167) | +327 (+332) | +188 (+213) |
| Ritardo 2 minuti | +44 (+88) | −2 (+74) | +49 (+177) | −69 (+39) |
| Ritardo 3 minuti | −35 (+10) | −27 (+91) | −64 (+102) | −159 (−38) |
| Ritardo 5 minuti | −126 (−130) | −68 (−106) | −167 (−190) | −219 (−234) |
| Filtro volume 1× | +40 (+43) | +50 (+35) | +93 (+81) | −19 (−29) |
| Filtro volume 1,5× | +29 (+29) | −1 (−1) | +29 (+29) | −39 (−39) |
| Filtro volume 2× | +25 (+25) | +43 (+43) | +70 (+70) | +32 (+32) |
| Filtro volume 3× | −5 (−5) | +14 (+14) | +8 (+8) | −9 (−9) |
| Conferma volume 2 minuti | +187 (+131) | +115 (+96) | +303 (+227) | +160 (+93) |
| Conferma volume 3 minuti | +210 (+159) | +81 (+50) | +292 (+209) | +151 (+70) |
| Conferma volume 5 minuti | +217 (+158) | +93 (+58) | +310 (+217) | +169 (+79) |
| Ritardo 1 + volume 1× | −6 (+30) | +70 (+60) | +61 (+101) | −63 (−33) |
| Ritardo 1 + volume 1,5× | −2 (+21) | +138 (+171) | +135 (+195) | +7 (+73) |
| Ritardo 2 + volume 1,5× | −133 (−138) | −0 (+61) | −134 (−104) | −182 (−160) |
| Ritardo 2 + volume 2× | −130 (−130) | +57 (+107) | −97 (−63) | −138 (−111) |
| Ritardo 1 + conferma 3 minuti | −19 (−33) | +60 (+61) | +37 (+21) | −107 (−100) |
| Volume 1,5× + conferma 3 minuti | −14 (−14) | −3 (−3) | −17 (−17) | −54 (−54) |
| Ritardo 1 + volume 1,5× + conferma 3 | −45 (−6) | +64 (+102) | +13 (+96) | −70 (+3) |

Interesse composto, media dei 20 ordini casuali (tra parentesi la lista):

| Prova | Mar–ago | Set–6 nov |
|---|---|---|
| Configurazione attuale (nessuna opzione) | +238% (+280%) | +56% (+96%) |
| Ritardo 1 minuto | +72% (+54%) | +50% (+64%) |
| Ritardo 2 minuti | +6% (+22%) | −1% (+26%) |
| Ritardo 3 minuti | −20% (−6%) | −11% (+30%) |
| Ritardo 5 minuti | −44% (−45%) | −23% (−35%) |
| Filtro volume 1× | +10% (+11%) | +17% (+11%) |
| Filtro volume 1,5× | +9% (+9%) | −0% (−0%) |
| Filtro volume 2× | +8% (+8%) | +15% (+15%) |
| Filtro volume 3× | −2% (−2%) | +4% (+4%) |
| Conferma volume 2 minuti | +72% (+40%) | +43% (+35%) |
| Conferma volume 3 minuti | +87% (+56%) | +28% (+15%) |
| Conferma volume 5 minuti | +94% (+56%) | +34% (+19%) |
| Ritardo 1 + volume 1× | −9% (+2%) | +23% (+20%) |
| Ritardo 1 + volume 1,5× | −6% (+2%) | +52% (+69%) |
| Ritardo 2 + volume 1,5× | −45% (−46%) | −1% (+20%) |
| Ritardo 2 + volume 2× | −43% (−43%) | +19% (+40%) |
| Ritardo 1 + conferma 3 minuti | −10% (−14%) | +21% (+20%) |
| Volume 1,5× + conferma 3 minuti | −5% (−5%) | −1% (−1%) |
| Ritardo 1 + volume 1,5× + conferma 3 | −17% (−5%) | +23% (+39%) |

## Analisi: volume della candela del segnale

Tutti i 1481 trade della configurazione attuale (tutto il periodo, ordine della lista, dimensione fissa), divisi in 4 gruppi della stessa grandezza secondo il volume della candela da 1 minuto in cui scatta il segnale, rispetto al volume normale di quel minuto. È un'analisi fatta dopo: qui si guarda la candela del segnale intera, che al momento dell'entrata non è ancora chiusa.

| Gruppo | Volume rispetto al normale | Trade | Vinti | Risultato medio | Stop loss | Entrati nella prima candela |
|---|---|---|---|---|---|---|
| 1 | 0,06× – 0,85× | 370 | 73% | +0,49 USDT (+0,33%) | 35 (9%) | 258 |
| 2 | 0,85× – 1,33× | 371 | 73% | +0,48 USDT (+0,32%) | 29 (8%) | 285 |
| 3 | 1,33× – 2,08× | 370 | 74% | +0,34 USDT (+0,23%) | 41 (11%) | 291 |
| 4 | 2,08× – 199,32× | 370 | 74% | +0,47 USDT (+0,31%) | 48 (13%) | 273 |

Le percentuali di vincita sono quasi uguali. I trade con il volume più alto (gruppo 4) finiscono un po' più spesso in stop loss, ma il risultato medio è simile a quello dei gruppi 1 e 2. Non c'è una soglia di volume che separi i trade buoni da quelli cattivi.

Stessa analisi con la candela chiusa **prima** del segnale, cioè quella che usa il filtro. Vale solo per i 374 trade che non entrano nella prima candela.

| Gruppo | Volume rispetto al normale | Trade | Vinti | Risultato medio | Stop loss |
|---|---|---|---|---|---|
| 1 | 0,04× – 0,64× | 94 | 76% | +0,63 USDT (+0,42%) | 6 |
| 2 | 0,64× – 0,99× | 93 | 81% | +0,68 USDT (+0,45%) | 7 |
| 3 | 0,99× – 1,56× | 94 | 76% | +0,12 USDT (+0,08%) | 13 |
| 4 | 1,57× – 34,74× | 93 | 73% | +0,05 USDT (+0,04%) | 11 |

Qui succede il contrario di quello che vorrebbe il filtro. Per i segnali che arrivano dopo la prima candela, un volume **alto** nella candela precedente va con risultati **più bassi** e più stop loss. Un filtro "almeno X volte il normale" tiene proprio i trade peggiori.

## Verifiche

- **Con le tre opzioni spente** il risultato è identico a prima: +502,08% e 1.481 trade nel caso di confronto (5x, 10 posizioni, limiti spenti). Le opzioni non cambiano niente finché non si accendono.
- **Ritardo d'entrata:** usa lo stesso meccanismo già usato dalla regola dell'indice. Prima del minuto consentito non si guarda niente. Nel primo minuto consentito si entra all'apertura della candela solo se il prezzo è già oltre la soglia; altrimenti si aspetta l'attraversamento come sempre.
- **Filtro volume:** guarda solo candele già chiuse e il volume normale dei giorni precedenti.
- **Conferma dopo l'entrata:** decide alla chiusura della candela con i dati di quella candela, come le altre uscite della strategia.
