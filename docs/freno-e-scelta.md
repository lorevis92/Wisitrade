# Freno di mercato, limite giornaliero e scelta tra segnali contemporanei

Test sugli ultimi 6 mesi (dal 09.05.2026 al 06.11.2026), con lo stesso motore di Prova, Reale e Simulazione. Condizioni:

- titoli: 115, cioè i 32 originali e gli 83 nuovi;
- configurazione Attuale con 10 posizioni al giorno, margine 10% e leva 3x e 5x;
- capitale: 300 USDT a interesse composto ("% saldo" al 100%);
- costi: commissione 0,06%, slittamento 0,05% e funding 0,01%.

Ogni prova cambia una sola cosa rispetto a "nessun limite".

Come leggere le colonne:

- **Scattato:** quante volte è scattato e in quanti giorni.
- **Ha tolto / Ha aiutato:** si confronta il risultato di ognuno di quei giorni, in % del saldo di inizio giornata, con lo stesso giorno senza limiti.
  - "Ha tolto" conta i giorni in cui senza il limite sarebbe andata meglio, perché dopo lo scatto il mercato è tornato su. Accanto c'è la somma dei punti % persi.
  - "Ha aiutato" conta i giorni in cui il limite ha evitato una perdita più grande.

## In breve

- **Limite giornaliero (niente nuovi trade): non cambia niente.** Al 5% è scattato 16 volte a 5x e 7 a 3x, ma il risultato è identico a "nessun limite". Le perdite si realizzano quasi sempre dopo la finestra d'entrata, oppure quando i 10 posti del giorno sono già presi: non c'è più niente da bloccare. Come protezione non costa niente, ma non aiuta.
- **Freno "chiudi tutto": riduce sempre il giorno peggiore e quasi sempre il peggior calo.** Sul risultato invece l'effetto è irregolare.
  - Con il 3% scatta troppo spesso (46 giorni su 6 mesi a 5x) e costa molto: +206,5% contro +399,4%.
  - A 5x il migliore è stato l'8%: +516,0% invece di +399,4%, peggior calo 29,1% invece di 37,2%, giorno peggiore −10,8% invece di −20,4%.
  - A 3x il migliore è stato il 5% (+211,8% contro +177,2%), mentre l'8% e il 10% danno meno o uguale.
  - Il risultato non migliora in modo regolare con la soglia, e gli scatti utili sono pochi (5–11 giorni). La parte di guadagno in più è quasi sicuramente fortuna di questi 6 mesi.
- **Scelta tra segnali contemporanei: c'è una differenza, ma non un vincitore affidabile.**
  - Con originali + nuovi "movimento più forte" ha dato di più: +537,3% contro +399,4% a 5x, +220,3% contro +177,2% a 3x. Però ha un calo un po' più profondo e un mese peggiore (luglio).
  - Sui soli 32 originali con 10 posizioni la scelta non conta quasi mai: raramente ci sono più di 10 segnali.
  - Con 5 posizioni sugli originali vince "più volatile", che invece con originali + nuovi è la peggiore. Le regole non si confermano da un test all'altro.

## Cosa ti consiglio

1. **Limite giornaliero:** lascialo al 10% nel Reale come protezione, sapendo che con questa strategia quasi mai scatta in tempo per servire. Non conviene abbassarlo pensando di guadagnare.
2. **Freno "chiudi tutto":** se vuoi una protezione contro le giornate disastrose, usalo all'**8%**.
   - Pro: in 6 mesi è scattato in circa 11 giorni a 5x e 5 a 3x; ha portato il giorno peggiore da circa −20% a −11% (5x) e nel totale dei 6 mesi non ha tolto guadagno (in alcuni giorni sì: vedi tabella).
   - Contro: non contarci per guadagnare di più.
   - Da evitare: il 3%, che scatta troppo spesso e taglia giornate che poi tornano su.
   - Il default resta **spento**, come chiesto. Prima di accenderlo nel Reale, provalo in Prova per qualche settimana.
3. **Scelta tra segnali:** resta su **"ordine della lista"** (il default).
   - "Movimento più forte" è l'unica che ha senso provare, in Prova, accanto all'altra.
   - Il vantaggio visto qui dipende da pochi mesi e da un gruppo di titoli molto simili tra loro, e sugli originali non si vede.

## Leva 5x

| Prova | Risultato | Peggior calo | Giorno peggiore | Scattato | Ha tolto (giorni · punti %) | Ha aiutato (giorni · punti %) |
|---|---|---|---|---|---|---|
| Nessun limite | **+399,4%** (+1198 USDT) | −37,2% | −20,4% (03.08) | — | — | — |
| Limite giornaliero 5% (niente nuovi trade) | **+399,4%** (+1198 USDT) | −37,2% | −20,4% (03.08) | 16 volte · 16 giorni | 0 · 0,0 | 0 · 0,0 |
| Limite giornaliero 10% (niente nuovi trade) | **+399,4%** (+1198 USDT) | −37,2% | −20,4% (03.08) | 6 volte · 6 giorni | 0 · 0,0 | 0 · 0,0 |
| Freno "chiudi tutto" 3% | **+206,5%** (+620 USDT) | −31,0% | −6,9% (03.08) | 46 volte · 46 giorni | 24 · −131,8 | 22 · +76,5 |
| Freno "chiudi tutto" 5% | **+378,7%** (+1136 USDT) | −28,5% | −7,4% (27.07) | 24 volte · 24 giorni | 12 · −58,6 | 12 · +49,3 |
| Freno "chiudi tutto" 8% | **+516,0%** (+1548 USDT) | −29,1% | −10,8% (03.08) | 11 volte · 11 giorni | 5 · −8,9 | 6 · +26,7 |
| Freno "chiudi tutto" 10% | **+454,1%** (+1362 USDT) | −31,8% | −12,9% (31.07) | 7 volte · 7 giorni | 3 · −7,5 | 4 · +15,9 |
| Freno "chiudi tutto" 15% | **+380,8%** (+1142 USDT) | −34,3% | −16,1% (03.08) | 3 volte · 3 giorni | 1 · −8,5 | 2 · +4,8 |

| Regola di scelta tra segnali contemporanei | Risultato | Peggior calo | Giorno peggiore | Trade |
|---|---|---|---|---|
| ordine della lista | **+399,4%** | −37,2% | −20,4% (03.08) | 1254 |
| movimento più forte | **+537,3%** | −39,9% | −18,1% (03.08) | 1254 |
| più liquido (volume) | **+358,3%** | −37,2% | −20,4% (03.08) | 1254 |
| più volatile | **+336,9%** | −48,8% | −24,8% (31.07) | 1254 |

Mese per mese:

| Prova | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|
| Nessun limite / ordine della lista | +22% | +24% | +16% | +35% | +35% | +39% | +12% |
| Freno "chiudi tutto" 5% | +21% | +37% | −7% | +66% | +32% | +27% | +13% |
| Freno "chiudi tutto" 8% | +22% | +36% | +23% | +54% | +35% | +31% | +11% |
| Freno "chiudi tutto" 10% | +22% | +28% | +20% | +52% | +35% | +28% | +12% |
| Scelta: movimento più forte | +22% | +42% | +7% | +46% | +35% | +49% | +17% |
| Scelta: più liquido (volume) | +22% | +10% | +18% | +39% | +34% | +39% | +12% |
| Scelta: più volatile | +24% | +47% | −8% | +45% | +31% | +13% | +22% |

Giorni in cui è scattato il freno all'8%, risultato del giorno con il freno e senza:

| Giorno | Con il freno | Senza | Differenza |
|---|---|---|---|
| 01.06.2026 | −9,1% | −11,9% | +2,8 |
| 04.06.2026 | −8,6% | −12,6% | +4,0 |
| 30.06.2026 | −9,1% | −10,9% | +1,8 |
| 09.07.2026 | −8,5% | −6,1% | −2,4 |
| 31.07.2026 | −8,6% | −15,9% | +7,2 |
| 03.08.2026 | −10,8% | −20,4% | +9,6 |
| 18.08.2026 | −8,6% | −9,9% | +1,3 |
| 13.10.2026 | −8,1% | −8,0% | −0,1 |
| 21.10.2026 | −10,8% | −7,5% | −3,3 |
| 23.10.2026 | −8,8% | −6,4% | −2,3 |
| 03.11.2026 | −8,4% | −7,6% | −0,8 |

## Leva 3x

| Prova | Risultato | Peggior calo | Giorno peggiore | Scattato | Ha tolto (giorni · punti %) | Ha aiutato (giorni · punti %) |
|---|---|---|---|---|---|---|
| Nessun limite | **+177,2%** (+532 USDT) | −23,6% | −12,2% (03.08) | — | — | — |
| Limite giornaliero 5% (niente nuovi trade) | **+177,2%** (+532 USDT) | −23,6% | −12,2% (03.08) | 7 volte · 7 giorni | 0 · 0,0 | 0 · 0,0 |
| Limite giornaliero 10% (niente nuovi trade) | **+177,2%** (+532 USDT) | −23,6% | −12,2% (03.08) | 1 volte · 1 giorni | 0 · 0,0 | 0 · 0,0 |
| Freno "chiudi tutto" 3% | **+166,7%** (+500 USDT) | −17,9% | −4,5% (27.07) | 24 volte · 24 giorni | 12 · −35,2 | 12 · +29,6 |
| Freno "chiudi tutto" 5% | **+211,8%** (+635 USDT) | −18,6% | −6,5% (03.08) | 9 volte · 9 giorni | 3 · −4,4 | 6 · +15,1 |
| Freno "chiudi tutto" 8% | **+174,3%** (+523 USDT) | −23,2% | −8,7% (03.08) | 5 volte · 5 giorni | 3 · −5,6 | 2 · +4,4 |
| Freno "chiudi tutto" 10% | **+163,5%** (+490 USDT) | −22,4% | −10,6% (21.10) | 3 volte · 3 giorni | 2 · −6,7 | 1 · +1,9 |
| Freno "chiudi tutto" 15% | **+177,2%** (+532 USDT) | −23,6% | −12,2% (03.08) | 0 volte · 0 giorni | 0 · 0,0 | 0 · 0,0 |

| Regola di scelta tra segnali contemporanei | Risultato | Peggior calo | Giorno peggiore | Trade |
|---|---|---|---|---|
| ordine della lista | **+177,2%** | −23,6% | −12,2% (03.08) | 1254 |
| movimento più forte | **+220,3%** | −25,5% | −10,9% (03.08) | 1254 |
| più liquido (volume) | **+163,4%** | −23,6% | −12,2% (03.08) | 1254 |
| più volatile | **+160,4%** | −31,7% | −14,9% (31.07) | 1254 |

Mese per mese:

| Prova | mag | giu | lug | ago | set | ott | nov |
|---|---|---|---|---|---|---|---|
| Nessun limite / ordine della lista | +13% | +15% | +11% | +22% | +20% | +23% | +7% |
| Freno "chiudi tutto" 5% | +13% | +21% | +15% | +31% | +20% | +18% | +7% |
| Freno "chiudi tutto" 8% | +13% | +13% | +12% | +27% | +20% | +18% | +7% |
| Freno "chiudi tutto" 10% | +13% | +15% | +10% | +24% | +20% | +15% | +7% |
| Scelta: movimento più forte | +13% | +25% | +6% | +27% | +20% | +28% | +10% |
| Scelta: più liquido (volume) | +13% | +7% | +12% | +24% | +19% | +23% | +7% |
| Scelta: più volatile | +14% | +28% | −3% | +27% | +18% | +9% | +13% |

Giorni in cui è scattato il freno all'8%, risultato del giorno con il freno e senza:

| Giorno | Con il freno | Senza | Differenza |
|---|---|---|---|
| 01.06.2026 | −8,1% | −7,2% | −0,9 |
| 04.06.2026 | −8,1% | −7,5% | −0,6 |
| 31.07.2026 | −8,6% | −9,5% | +0,9 |
| 03.08.2026 | −8,7% | −12,2% | +3,5 |
| 21.10.2026 | −8,6% | −4,5% | −4,1 |

## Verifica sui soli 32 originali (5x, tutto il periodo diviso in due)

| Periodo | Posizioni al giorno | Ordine della lista | Movimento più forte | Più liquido | Più volatile |
|---|---|---|---|---|---|
| mar–ago | 10 | −8,9% | −8,9% | −8,8% | −14,2% |
| mar–ago | 5 | +4,2% | +7,9% | +12,0% | +14,1% |
| set–nov | 10 | +22,8% | +22,6% | +22,3% | +25,3% |
| set–nov | 5 | +36,9% | +37,0% | +38,2% | +45,6% |

Con 10 posizioni le regole danno quasi lo stesso risultato: sui 32 originali capita di rado che i segnali dello stesso minuto siano più dei posti liberi. Con 5 posizioni le differenze ci sono, ma la classifica è diversa da quella con originali + nuovi.

## Come funzionano (uguale in Simulazione, Prova e Reale)

- **Perdita massima giornaliera:** conta i trade chiusi di oggi, in % del capitale di inizio giornata. Superata, non si aprono nuovi trade fino a domani; le posizioni aperte restano e seguono le loro regole.
- **Freno "chiudi tutto":** conta i trade chiusi e le posizioni aperte al prezzo attuale, in % del capitale di inizio giornata. Superato, chiude subito tutte le posizioni della strategia e non ne apre altre fino a domani. Nel Reale e in Prova arriva una notifica push.
  - In Simulazione si controlla alla chiusura di ogni minuto; nel Reale a ogni controllo, cioè ogni minuto.
  - Chiude a mercato, con lo slittamento impostato.
- **Perdita massima totale:**
  - in Simulazione, superata, non si aprono più trade fino alla fine del periodo;
  - in Prova e nel Reale vale con il capitale dedicato e ferma la strategia finché non la riavvii.
- **Capitale di riferimento:**
  - in Simulazione è il saldo della simulazione;
  - in Prova e nel Reale è il capitale dedicato oppure, senza capitale dedicato, il capitale usato dal primo trade del giorno.
- **Scelta tra segnali contemporanei:** si applica solo ai segnali dello stesso minuto, quando i posti liberi del giorno non bastano. Segnali in minuti diversi vanno sempre in ordine di tempo.
  - **Movimento più forte:** il maggiore tra il movimento dall'apertura al prezzo d'entrata e quello alla chiusura della candela precedente.
  - **Più liquido:** gli USDT scambiati dalle 9:30 alla candela precedente.
  - **Più volatile:** l'unità di volatilità del giorno in % del prezzo.
  - Si usano solo dati noti al momento dell'entrata.

## Nota per riprodurre i numeri vecchi

Da questa versione la Simulazione applica anche i limiti di perdita, che di default sono giornaliero 10% e totale 30%, e il default delle posizioni al giorno è 10 invece di 8.

- **I numeri dei documenti precedenti** (`docs/ottimizzazione.md`, `docs/titoli-allargati.md`) sono senza limiti: per riprodurli metti i limiti su "spenta".
- **L'impostazione salvata "Attuale · originali + nuovi"** è stata aggiornata con limiti spenti e 8 posizioni, quindi dà ancora gli stessi numeri del documento.
