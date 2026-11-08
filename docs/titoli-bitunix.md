# Perpetual di azioni ed ETF USA su Bitunix

Elenco dell'8 novembre 2026, preso da Bitunix (coppie in USDT). Volume medio giornaliero = media dei 30 giorni dal 9 ottobre al 7 novembre 2026, in USDT (volume dei perpetual su Bitunix, non della borsa USA).

## In breve

- **195 perpetual** di azioni ed ETF quotati negli USA: 155 azioni e 40 ETF.
- **32 originali**: c'erano già nella strategia. MA (Mastercard) e BA (Boeing) erano nella lista, ma su Bitunix non hanno il perpetual.
- **83 nuovi** con volume sufficiente, cioè almeno 100.000 USDT al giorno, e almeno 20 giorni di storico (ETF a leva esclusi). Sono stati aggiunti all'archivio e alla lista della strategia. Tra questi ci sono anche QQQ e SPY.
- **45 nuovi a bassa liquidità**, con almeno 20 giorni di storico ma volume sotto la soglia (ETF a leva esclusi). Sono stati aggiunti anche questi, in un gruppo a parte "bassa liquidità", che non è selezionato di default.
- **19 ETF a leva o inversi** (2x, 3x, short e VIX), con almeno 20 giorni di storico. Sono in un gruppo a parte, "ETF a leva", non selezionato di default, qualunque sia il loro volume. Si muovono 2 o 3 volte il titolo di riferimento, quindi la soglia dell'1% dall'apertura scatta molto più facilmente. Inoltre sono doppioni di titoli che ci sono già, come TQQQ e SQQQ per QQQ, o MUU per MU.
- **16 non aggiunti**: quotati da meno di 20 giorni di borsa. Si possono aggiungere più avanti.
- In tutto nella strategia: **179 titoli selezionabili**. Di questi, 115 sono originali o nuovi con volume sufficiente, senza contare gli ETF a leva.

## Come è stato fatto l'elenco

Bitunix non dice quali perpetual sono azioni: azioni e crypto stanno nello stesso elenco di 754 coppie in USDT. Per questo i perpetual sono stati riconosciuti in tre passi.

1. **Nome:** il simbolo deve essere un ticker quotato al Nasdaq, al NYSE o in un'altra borsa USA, secondo gli elenchi ufficiali di Nasdaq Trader. Bitunix usa nomi suoi per 4 titoli: GAMESTOP (GME), BRKB (BRK.B), CATERPILLAR (CAT) e MDTUS (MDT).
2. **Prezzo:** il prezzo del perpetual alle 16:00 di New York di venerdì 6 novembre deve stare entro il 6% della chiusura vera in borsa (dati Yahoo Finance). Così si escludono le crypto che hanno lo stesso simbolo di un'azione, come SUI, LINK, T, NEAR o COMP. Le azioni vere differiscono in genere di meno dello 0,5%.
3. **Data:** la quotazione su Bitunix deve essere del 2026, quando Bitunix ha iniziato a quotare le azioni. Questo passo esclude un solo caso, NMR: è la crypto Numeraire, che per caso costava quanto l'azione Nomura.

Esclusi:

- **Azioni non USA:** per esempio SAMSUNG, SKHYNIX, HYUNDAI, NAVER, TENCENT, XIAOMI e MEITUAN. Si scambiano in orari diversi, quindi non funzionano con l'apertura di New York.
- **Società non quotate:** OPENAI e ANTHROPIC non sono in borsa.
- **Materie prime:** oro, argento, platino, palladio, rame, petrolio e gas.
- **Ticker coincidenti:** altre crypto che hanno un simbolo uguale a un ticker USA.

Nota: SPCX qui è SpaceX, quotata al Nasdaq, e il suo prezzo coincide con la borsa.

## La soglia di volume: 100.000 USDT al giorno

- **Perché questa cifra:** è il livello dei titoli originali meno scambiati, cioè SHOP, DIS, UNH, COST, UBER, CRM e PYPL, tra 80.000 e 100.000 USDT al giorno. Nelle simulazioni questi titoli si sono comportati come gli altri, con lo slittamento ipotizzato dello 0,05%.
- **Quanto pesa un trade:** con le impostazioni di oggi (300 USDT, margine 10%, leva 5x) vale circa 150 USDT, cioè lo 0,15% del volume giornaliero di un titolo al limite. Anche con 10 volte il capitale resta sotto il 2%.
- **Cosa significa "bassa liquidità":** sotto la soglia il volume è più basso e il libro ordini spesso più sottile. In quei titoli lo slittamento vero sarà probabilmente più alto dello 0,05%, quindi i risultati simulati vanno presi con più prudenza. Per questo sono in un gruppo separato.
- **Altri valori considerati:** a 50.000 o 75.000 USDT quasi tutti i titoli superano la soglia, e il filtro non serve. A 250.000 USDT resterebbero meno di 40 nuovi, scartando anche titoli con un libro ordini profondo.

Le colonne **spread** e **costo 1.500 USDT** vengono dal libro ordini di Bitunix di domenica 8 novembre, con la borsa chiusa. Il costo 1.500 USDT è lo scostamento medio dal prezzo di metà spread, per un ordine a mercato di quella cifra, nel lato peggiore. In settimana, durante l'orario di borsa, di solito il libro è più profondo. Sono solo un'indicazione e non entrano nella soglia.

## Elenco completo

Ordinato per volume. "Giorni" = giorni di borsa dalla quotazione al 6 novembre. "Archivio" = giorni di borsa con candele da 1 minuto nell'archivio della Simulazione.

| # | Simbolo Bitunix | Ticker | Nome | Tipo | Su Bitunix dal | Giorni | Archivio | Volume medio 30 gg (USDT) | Spread | Costo 1.500 USDT | Bassa liquidità | ETF a leva | Nella strategia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | SNDK |  | Sandisk | azione | 27.03.2026 | 156 | 156 | 81.480.794 | 0,001% | 0,001% |  |  | nuovo |
| 2 | SOXL |  | Direxion Daily Semiconductor Bull 3X Shares | ETF | 18.05.2026 | 121 | 121 | 35.216.792 | 0,022% | 0,011% |  | sì | nuovo · ETF a leva |
| 3 | KORU |  | Direxion Daily South Korea Bull 3X Shares | ETF | 23.07.2026 | 76 | 76 | 32.454.394 | 0,142% | 0,071% |  | sì | nuovo · ETF a leva |
| 4 | SPCX |  | SpaceX | azione | 10.06.2026 | 105 | 117 | 28.960.316 | 0,022% | 0,011% |  |  | nuovo |
| 5 | SOXS |  | Direxion Daily Semiconductor Bear 3X Shares | ETF | 16.07.2026 | 81 | 81 | 17.740.765 | 0,014% | 0,007% |  | sì | nuovo · ETF a leva |
| 6 | INTC |  | Intel | azione | 16.03.2026 | 165 | 165 | 16.694.817 | 0,018% | 0,009% |  |  | originale |
| 7 | SNXX |  | Tradr 2X Long Sndk Daily ETF | ETF | 23.07.2026 | 76 | 76 | 14.657.477 | 0,305% | 0,153% |  | sì | nuovo · ETF a leva |
| 8 | MSTR |  | Strategy | azione | 13.03.2026 | 166 | 166 | 14.262.583 | 0,008% | 0,004% |  |  | originale |
| 9 | CRCL |  | Circle | azione | 13.03.2026 | 166 | 166 | 12.760.234 | 0,015% | 0,007% |  |  | nuovo |
| 10 | TSLA |  | Tesla | azione | 13.03.2026 | 166 | 165 | 9.861.274 | 0,003% | 0,001% |  |  | originale |
| 11 | SKHY |  | SK hynix | azione | 13.07.2026 | 84 | 83 | 9.300.669 | 0,008% | 0,004% |  |  | nuovo |
| 12 | QQQ |  | Nasdaq 100 ETF (Invesco QQQ) | ETF | 23.03.2026 | 160 | 159 | 8.179.627 | 0,002% | 0,001% |  |  | nuovo |
| 13 | MU |  | Micron Technology | azione | 31.03.2026 | 154 | 154 | 7.822.978 | 0,001% | 0,001% |  |  | originale |
| 14 | GOOGL |  | Alphabet | azione | 27.03.2026 | 156 | 156 | 6.424.351 | 0,025% | 0,012% |  |  | originale |
| 15 | NVDA |  | NVIDIA | azione | 19.03.2026 | 162 | 162 | 5.319.333 | 0,005% | 0,003% |  |  | originale |
| 16 | TQQQ |  | ProShares UltraPro QQQ | ETF | 30.06.2026 | 92 | 92 | 4.201.076 | 0,019% | 0,010% |  | sì | nuovo · ETF a leva |
| 17 | AMD |  | Advanced Micro Devices | azione | 27.03.2026 | 156 | 156 | 3.579.758 | 0,011% | 0,007% |  |  | originale |
| 18 | MUU |  | Direxion Daily MU Bull 2X Shares | ETF | 16.07.2026 | 81 | 81 | 3.406.222 | 0,072% | 0,036% |  | sì | nuovo · ETF a leva |
| 19 | SPY |  | S&P 500 ETF (SPDR) | ETF | 23.03.2026 | 160 | 160 | 3.215.063 | 0,001% | 0,001% |  |  | nuovo |
| 20 | COIN |  | Coinbase Global | azione | 18.03.2026 | 163 | 162 | 2.819.100 | 0,007% | 0,004% |  |  | originale |
| 21 | META |  | Meta | azione | 27.03.2026 | 156 | 156 | 2.730.477 | 0,011% | 0,006% |  |  | originale |
| 22 | BE |  | Bloom Energy | azione | 27.05.2026 | 115 | 115 | 2.619.909 | 0,006% | 0,003% |  |  | nuovo |
| 23 | EWY |  | iShares MSCI South Korea ETF | ETF | 24.03.2026 | 159 | 159 | 2.257.399 | 0,022% | 0,011% |  |  | nuovo |
| 24 | AMZN |  | Amazon | azione | 16.03.2026 | 165 | 165 | 2.224.211 | 0,004% | 0,002% |  |  | originale |
| 25 | AAPL |  | Apple | azione | 19.03.2026 | 162 | 162 | 2.169.908 | 0,003% | 0,001% |  |  | originale |
| 26 | HOOD |  | Robinhood Markets | azione | 18.03.2026 | 163 | 163 | 1.928.549 | 0,012% | 0,006% |  |  | originale |
| 27 | NBIS |  | Nebius | azione | 27.05.2026 | 115 | 115 | 1.734.156 | 0,023% | 0,017% |  |  | nuovo |
| 28 | AAOI |  | Applied Optoelectronics | azione | 09.06.2026 | 106 | 106 | 1.671.585 | 0,020% | 0,013% |  |  | nuovo |
| 29 | INTW |  | GraniteShares 2x Long INTC Daily ETF | ETF | 23.07.2026 | 76 | 76 | 1.277.891 | 0,188% | 0,094% |  | sì | nuovo · ETF a leva |
| 30 | PLTR |  | Palantir | azione | 26.03.2026 | 157 | 157 | 1.252.834 | 0,031% | 0,018% |  |  | originale |
| 31 | BMNR |  | Bitmine Immersion | azione | 15.06.2026 | 102 | 102 | 1.242.579 | 0,053% | 0,026% |  |  | nuovo |
| 32 | DRAM |  | Roundhill Memory ETF | ETF | 21.05.2026 | 118 | 118 | 1.166.029 | 0,025% | 0,013% |  |  | nuovo |
| 33 | AXTI |  | AXT | azione | 10.06.2026 | 105 | 105 | 1.138.937 | 0,078% | 0,039% |  |  | nuovo |
| 34 | SQQQ |  | ProShares UltraPro Short QQQ | ETF | 30.06.2026 | 92 | 92 | 1.129.089 | 0,021% | 0,011% |  | sì | nuovo · ETF a leva |
| 35 | MVLL |  | GraniteShares 2x Long MRVL Daily ETF | ETF | 30.07.2026 | 71 | 71 | 1.115.959 | 0,343% | 0,172% |  | sì | nuovo · ETF a leva |
| 36 | MSFT |  | Microsoft | azione | 31.03.2026 | 154 | 154 | 1.043.405 | 0,036% | 0,018% |  |  | originale |
| 37 | MRVL |  | Marvell Technology | azione | 18.05.2026 | 121 | 121 | 1.033.146 | 0,007% | 0,004% |  |  | nuovo |
| 38 | IREN |  | IREN | azione | 05.06.2026 | 108 | 107 | 976.762 | 0,045% | 0,023% |  |  | nuovo |
| 39 | STRC |  | Strategy | azione | 03.07.2026 | 89 | 89 | 964.137 | 0,010% | 0,005% |  |  | nuovo |
| 40 | LITE |  | Lumentum | azione | 11.05.2026 | 126 | 125 | 958.372 | 0,061% | 0,038% |  |  | nuovo |
| 41 | QCOM |  | QUALCOMM | azione | 07.05.2026 | 128 | 128 | 842.511 | 0,006% | 0,003% |  |  | nuovo |
| 42 | AVGO |  | Broadcom | azione | 21.04.2026 | 140 | 140 | 743.054 | 0,406% | 0,203% |  |  | originale |
| 43 | BX |  | Blackstone | azione | 09.06.2026 | 106 | 105 | 716.117 | 0,034% | 0,038% |  |  | nuovo |
| 44 | DELL |  | Dell | azione | 04.06.2026 | 109 | 109 | 670.393 | 0,003% | 0,004% |  |  | nuovo |
| 45 | CRWV |  | CoreWeave | azione | 19.05.2026 | 120 | 119 | 665.160 | 0,065% | 0,032% |  |  | nuovo |
| 46 | COHR |  | Coherent | azione | 27.05.2026 | 115 | 115 | 638.454 | 0,005% | 0,003% |  |  | nuovo |
| 47 | EWZ |  | iShares MSCI Brazil ETF | ETF | 12.06.2026 | 103 | 103 | 621.471 | 0,155% | 0,078% |  |  | nuovo |
| 48 | MRNA |  | Moderna | azione | 21.08.2026 | 55 | 55 | 581.999 | 0,066% | 0,040% |  |  | nuovo |
| 49 | UVXY |  | ProShares Ultra VIX Short-Term Futures ETF | ETF | 15.06.2026 | 102 | 102 | 570.910 | 0,044% | 0,022% |  | sì | nuovo · ETF a leva |
| 50 | WDC |  | Western Digital | azione | 27.05.2026 | 115 | 115 | 569.350 | 0,049% | 0,035% |  |  | nuovo |
| 51 | SMCI |  | Super Micro Computer | azione | 23.06.2026 | 97 | 97 | 518.235 | 0,035% | 0,017% |  |  | nuovo |
| 52 | CBRS |  | Cerebras Systems | azione | 20.05.2026 | 119 | 119 | 455.153 | 0,011% | 0,009% |  |  | nuovo |
| 53 | APP |  | AppLovin | azione | 14.07.2026 | 83 | 83 | 417.471 | 0,033% | 0,023% |  |  | nuovo |
| 54 | BABA |  | Alibaba | azione | 21.04.2026 | 140 | 140 | 399.459 | 0,165% | 0,082% |  |  | originale |
| 55 | ORCL |  | Oracle | azione | 01.04.2026 | 153 | 152 | 354.096 | 0,060% | 0,030% |  |  | originale |
| 56 | SKDD |  | GraniteShares 2x Short SK Hynix Daily ETF | ETF | 25.08.2026 | 53 | 53 | 336.847 | 0,062% | 0,031% |  | sì | nuovo · ETF a leva |
| 57 | GLW |  | Corning | azione | 15.06.2026 | 102 | 102 | 334.226 | 0,159% | 0,080% |  |  | nuovo |
| 58 | XOM |  | ExxonMobil | azione | 30.09.2026 | 28 | 28 | 332.200 | 0,006% | 0,007% |  |  | nuovo |
| 59 | ASTS |  | AST SpaceMobile | azione | 04.06.2026 | 109 | 109 | 317.050 | 0,031% | 0,046% |  |  | nuovo |
| 60 | TSM |  | TSMC | azione | 31.03.2026 | 154 | 154 | 311.229 | 0,032% | 0,022% |  |  | nuovo |
| 61 | NFLX |  | Netflix | azione | 31.03.2026 | 154 | 154 | 306.872 | 0,110% | 0,074% |  |  | originale |
| 62 | ARM |  | Arm | azione | 12.05.2026 | 125 | 125 | 302.381 | 0,006% | 0,026% |  |  | originale |
| 63 | LRCX |  | Lam Research | azione | 31.07.2026 | 70 | 69 | 287.151 | 0,105% | 0,073% |  |  | nuovo |
| 64 | BSP |  | Bending Spoons | azione | 23.07.2026 | 76 | 76 | 277.973 | 0,140% | 0,101% |  |  | nuovo |
| 65 | BNC |  | BNB Standard | azione | 13.07.2026 | 84 | 84 | 264.164 | 0,222% | 0,111% |  |  | nuovo |
| 66 | SHAZ |  | SharonAI | azione | 22.07.2026 | 77 | 77 | 254.643 | 0,183% | 0,092% |  |  | nuovo |
| 67 | SKUU |  | Graniteshares 2x Long SK Hynix Daily ETF | ETF | 25.08.2026 | 53 | 53 | 245.838 | 0,080% | 0,040% |  | sì | nuovo · ETF a leva |
| 68 | KSTR |  | KraneShares China Tech STAR 50 ETF | ETF | 30.07.2026 | 71 | 71 | 224.413 | 0,054% | 0,027% |  |  | nuovo |
| 69 | LLY |  | Eli Lilly | azione | 02.06.2026 | 111 | 111 | 211.236 | 0,001% | 0,000% |  |  | originale |
| 70 | AMAT |  | Applied Materials | azione | 09.06.2026 | 106 | 106 | 208.739 | 0,305% | 0,155% |  |  | nuovo |
| 71 | NOK |  | Nokia | azione | 02.06.2026 | 111 | 111 | 208.236 | 0,130% | 0,065% |  |  | nuovo |
| 72 | RKLB |  | Rocket Lab | azione | 20.05.2026 | 119 | 119 | 205.488 | 0,019% | 0,009% |  |  | nuovo |
| 73 | CRDO |  | Credo Technology | azione | 09.06.2026 | 106 | 106 | 202.231 | 0,206% | 0,116% |  |  | nuovo |
| 74 | ASML |  | ASML | azione | 15.06.2026 | 102 | 102 | 198.714 | 0,201% | 0,101% |  |  | nuovo |
| 75 | TTWO |  | Take-Two Interactive | azione | 03.07.2026 | 89 | 89 | 198.651 | 0,152% | 0,082% |  |  | nuovo |
| 76 | USAR |  | USA Rare Earth | azione | 07.05.2026 | 128 | 128 | 195.019 | 0,121% | 0,061% |  |  | nuovo |
| 77 | FLEX |  | Flex | azione | 29.07.2026 | 72 | 72 | 187.952 | 0,114% | 0,121% |  |  | nuovo |
| 78 | SOFI |  | SoFi | azione | 22.07.2026 | 77 | 77 | 180.824 | 0,062% | 0,031% |  |  | nuovo |
| 79 | CYPH |  | Cypherpunk | azione | 20.09.2026 | 35 | 35 | 179.896 | 0,036% | 0,062% |  |  | nuovo |
| 80 | WEN |  | Wendy's | azione | 13.07.2026 | 84 | 84 | 178.529 | 0,012% | 0,094% |  |  | nuovo |
| 81 | MSTU |  | T-Rex 2X Long MSTR Daily Target ETF | ETF | 12.10.2026 | 20 | 20 | 178.393 | 0,039% | 0,020% |  | sì | nuovo · ETF a leva |
| 82 | NOW |  | ServiceNow | azione | 05.06.2026 | 108 | 108 | 175.684 | 0,068% | 0,044% |  |  | nuovo |
| 83 | WMT |  | Walmart | azione | 19.05.2026 | 120 | 120 | 173.708 | 0,008% | 0,004% |  |  | originale |
| 84 | MCD |  | McDonald's | azione | 21.08.2026 | 55 | 55 | 171.478 | 0,101% | 0,140% |  |  | originale |
| 85 | ALAB |  | Astera Labs | azione | 29.07.2026 | 72 | 71 | 169.336 | 0,005% | 0,038% |  |  | nuovo |
| 86 | ACN |  | Accenture | azione | 01.10.2026 | 27 | 27 | 166.788 | 0,050% | 0,039% |  |  | nuovo |
| 87 | IBM |  | IBM | azione | 04.06.2026 | 109 | 108 | 162.199 | 0,004% | 0,007% |  |  | nuovo |
| 88 | TMF |  | Direxion Daily 20+ Year Treasury Bull 3X Shares | ETF | 28.07.2026 | 73 | 72 | 159.627 | 0,230% | 0,115% |  | sì | nuovo · ETF a leva |
| 89 | BRKB | BRK.B | Berkshire Hathaway | azione | 19.05.2026 | 120 | 120 | 157.108 | 0,021% | 0,054% |  |  | nuovo |
| 90 | JPM |  | JPMorgan Chase | azione | 19.05.2026 | 120 | 120 | 155.825 | 0,051% | 0,025% |  |  | originale |
| 91 | RAM |  | Roundhill T-REX 2x Long DRAM Daily Target ETF | ETF | 25.08.2026 | 53 | 53 | 140.791 | 0,192% | 0,096% |  | sì | nuovo · ETF a leva |
| 92 | RDDT |  | Reddit | azione | 06.08.2026 | 66 | 65 | 139.541 | 0,010% | 0,015% |  |  | nuovo |
| 93 | CIEN |  | Ciena | azione | 23.06.2026 | 97 | 97 | 139.270 | 0,004% | 0,038% |  |  | nuovo |
| 94 | VST |  | Vistra | azione | 18.08.2026 | 58 | 58 | 138.868 | 0,216% | 0,209% |  |  | nuovo |
| 95 | HIMS |  | Hims & Hers Health | azione | 11.06.2026 | 104 | 104 | 137.876 | 0,193% | 0,096% |  |  | nuovo |
| 96 | ADBE |  | Adobe | azione | 15.06.2026 | 102 | 102 | 135.228 | 0,004% | 0,057% |  |  | originale |
| 97 | BOT |  | Robostrategy | azione | 10.07.2026 | 85 | 85 | 133.096 | 0,092% | 0,060% |  |  | nuovo |
| 98 | BWET |  | Breakwave Tanker Shipping ETF | ETF | 01.10.2026 | 27 | 27 | 127.646 | 0,016% | 0,012% |  |  | nuovo |
| 99 | ONDS |  | Ondas | azione | 05.06.2026 | 108 | 108 | 126.647 | 0,019% | 0,018% |  |  | nuovo |
| 100 | IONQ |  | IonQ | azione | 01.09.2026 | 48 | 48 | 123.898 | 0,248% | 0,136% |  |  | nuovo |
| 101 | KLAC |  | KLA | azione | 29.07.2026 | 72 | 72 | 121.757 | 0,007% | 0,053% |  |  | nuovo |
| 102 | PFE |  | Pfizer | azione | 30.10.2026 | 6 | — | 119.521 | 0,102% | 0,056% |  |  | non aggiunto (meno di 20 giorni) |
| 103 | MELI |  | MercadoLibre | azione | 30.10.2026 | 6 | — | 118.647 | 0,161% | 0,108% |  |  | non aggiunto (meno di 20 giorni) |
| 104 | HUT |  | Hut 8 | azione | 20.09.2026 | 35 | 35 | 117.418 | 0,019% | 0,101% |  |  | nuovo |
| 105 | V |  | Visa | azione | 19.05.2026 | 120 | 120 | 117.369 | 0,040% | 0,053% |  |  | originale |
| 106 | DJT |  | Trump Media & Technology | azione | 25.08.2026 | 53 | 53 | 117.192 | 0,124% | 0,062% |  |  | nuovo |
| 107 | VRT |  | Vertiv | azione | 13.07.2026 | 84 | 84 | 116.427 | 0,309% | 0,205% |  |  | nuovo |
| 108 | ZCSH |  | Zcash ETF | ETF | 12.10.2026 | 20 | 20 | 114.922 | 0,030% | 0,015% |  |  | nuovo |
| 109 | GEV |  | GE Vernova | azione | 13.07.2026 | 84 | 84 | 113.125 | 0,012% | 0,017% |  |  | nuovo |
| 110 | CRML |  | Critical Metals | azione | 01.10.2026 | 27 | 27 | 112.032 | 0,017% | 0,036% |  |  | nuovo |
| 111 | NET |  | Cloudflare | azione | 18.08.2026 | 58 | 58 | 110.262 | 0,153% | 0,090% |  |  | nuovo |
| 112 | SECZ |  | Securitize | azione | 01.10.2026 | 27 | 27 | 109.234 | 0,142% | 0,071% |  |  | nuovo |
| 113 | DDOG |  | Datadog | azione | 04.09.2026 | 45 | 45 | 108.750 | 0,006% | 0,076% |  |  | nuovo |
| 114 | NKE |  | NIKE | azione | 24.08.2026 | 54 | 54 | 107.988 | 0,352% | 0,182% |  |  | nuovo |
| 115 | IWM |  | iShares Russell 2000 ETF | ETF | 10.06.2026 | 105 | 105 | 107.406 | 0,029% | 0,015% |  |  | nuovo |
| 116 | NVO |  | Novo Nordisk | azione | 02.06.2026 | 111 | 111 | 107.319 | 0,025% | 0,015% |  |  | nuovo |
| 117 | SNOW |  | Snowflake | azione | 14.07.2026 | 83 | 83 | 107.021 | 0,206% | 0,123% |  |  | nuovo |
| 118 | TEM |  | Tempus AI | azione | 01.09.2026 | 48 | 48 | 105.079 | 0,471% | 0,249% |  |  | nuovo |
| 119 | FLNC |  | Fluence Energy | azione | 21.05.2026 | 118 | 118 | 103.588 | 0,227% | 0,122% |  |  | nuovo |
| 120 | FWDI |  | Forward Industries | azione | 10.07.2026 | 85 | 85 | 102.961 | 0,229% | 0,133% |  |  | nuovo |
| 121 | HPE |  | Hewlett Packard Enterprise | azione | 09.06.2026 | 106 | 106 | 102.951 | 0,156% | 0,085% |  |  | nuovo |
| 122 | EWT |  | iShares MSCI Taiwan ETF | ETF | 04.06.2026 | 109 | 109 | 102.394 | 0,011% | 0,022% |  |  | nuovo |
| 123 | MP |  | MP Materials | azione | 01.10.2026 | 27 | 27 | 102.340 | 0,028% | 0,027% |  |  | nuovo |
| 124 | TZA |  | Direxion Daily Small Cap Bear 3X Shares | ETF | 16.07.2026 | 81 | 81 | 101.394 | 0,223% | 0,159% |  | sì | nuovo · ETF a leva |
| 125 | OKLO |  | Oklo | azione | 30.09.2026 | 28 | 28 | 101.077 | 0,084% | 0,045% |  |  | nuovo |
| 126 | GS |  | Goldman Sachs | azione | 30.07.2026 | 71 | 71 | 100.902 | 0,001% | 0,032% |  |  | nuovo |
| 127 | PYPL |  | PayPal | azione | 30.07.2026 | 71 | 71 | 100.885 | 0,017% | 0,044% |  |  | originale |
| 128 | SONY |  | Sony | azione | 23.06.2026 | 97 | 97 | 99.664 | 0,185% | 0,093% | sì |  | nuovo · bassa liquidità |
| 129 | SMR |  | NuScale Power | azione | 02.11.2026 | 5 | — | 99.470 | 0,020% | 0,152% | sì |  | non aggiunto (meno di 20 giorni) |
| 130 | XBI |  | S&P Biotech ETF (SPDR) | ETF | 30.07.2026 | 71 | 70 | 98.964 | 0,092% | 0,057% | sì |  | nuovo · bassa liquidità |
| 131 | RIVN |  | Rivian Automotive | azione | 11.06.2026 | 104 | 104 | 98.427 | 0,220% | 0,110% | sì |  | nuovo · bassa liquidità |
| 132 | CATERPILLAR | CAT | Caterpillar | azione | 03.07.2026 | 89 | 89 | 97.769 | 0,153% | 0,082% | sì |  | nuovo · bassa liquidità |
| 133 | TXN |  | Texas Instruments | azione | 03.07.2026 | 89 | 89 | 97.575 | 0,205% | 0,134% | sì |  | nuovo · bassa liquidità |
| 134 | PEP |  | PepsiCo | azione | 21.08.2026 | 55 | 55 | 97.424 | 0,403% | 0,307% | sì |  | nuovo · bassa liquidità |
| 135 | CRM |  | Salesforce | azione | 05.06.2026 | 108 | 108 | 96.888 | 0,308% | 0,168% | sotto soglia (originale) |  | originale |
| 136 | TER |  | Teradyne | azione | 31.07.2026 | 70 | 70 | 96.738 | 0,050% | 0,060% | sì |  | nuovo · bassa liquidità |
| 137 | PDD |  | PDD | azione | 01.09.2026 | 48 | 48 | 96.608 | 0,264% | 0,132% | sì |  | nuovo · bassa liquidità |
| 138 | AGPU |  | Axe Compute | azione | 20.09.2026 | 35 | 35 | 96.310 | 0,147% | 0,074% | sì |  | nuovo · bassa liquidità |
| 139 | UBER |  | Uber | azione | 16.06.2026 | 101 | 101 | 96.237 | 0,073% | 0,036% | sotto soglia (originale) |  | originale |
| 140 | KO |  | Coca-Cola | azione | 06.08.2026 | 66 | 66 | 95.892 | 0,010% | 0,019% | sì |  | nuovo · bassa liquidità |
| 141 | GPRO |  | GoPro | azione | 07.09.2026 | 44 | 43 | 95.446 | 0,111% | 0,055% | sì |  | nuovo · bassa liquidità |
| 142 | GDX |  | VanEck Gold Miners ETF | ETF | 18.08.2026 | 58 | 57 | 95.097 | 0,069% | 0,199% | sì |  | nuovo · bassa liquidità |
| 143 | COST |  | Costco Wholesale | azione | 12.05.2026 | 125 | 125 | 94.478 | 0,001% | 0,023% | sotto soglia (originale) |  | originale |
| 144 | CSCO |  | Cisco Systems | azione | 16.06.2026 | 101 | 101 | 94.238 | 0,212% | 0,120% | sì |  | nuovo · bassa liquidità |
| 145 | CVNA |  | Carvana | azione | 30.09.2026 | 28 | 28 | 91.970 | 0,204% | 0,166% | sì |  | nuovo · bassa liquidità |
| 146 | DKNG |  | DraftKings | azione | 11.06.2026 | 104 | 104 | 91.063 | 0,054% | 0,027% | sì |  | nuovo · bassa liquidità |
| 147 | AMC |  | AMC Entertainment | azione | 20.09.2026 | 35 | 35 | 90.807 | 0,032% | 0,030% | sì |  | nuovo · bassa liquidità |
| 148 | TBT |  | ProShares UltraShort 20+ Year Treasury | ETF | 28.07.2026 | 73 | 73 | 89.372 | 0,132% | 0,083% | sì | sì | nuovo · ETF a leva |
| 149 | PANW |  | Palo Alto Networks | azione | 22.07.2026 | 77 | 77 | 88.915 | 0,171% | 0,101% | sì |  | nuovo · bassa liquidità |
| 150 | VKTX |  | Viking Therapeutics | azione | 09.10.2026 | 21 | 21 | 88.785 | 0,260% | 0,183% | sì |  | nuovo · bassa liquidità |
| 151 | EWJ |  | iShares MSCI Japan ETF | ETF | 24.03.2026 | 159 | 159 | 88.702 | 0,045% | 0,023% | sì |  | nuovo · bassa liquidità |
| 152 | LYTE |  | Roundhill Photonics & Optics ETF | ETF | 18.08.2026 | 58 | 58 | 88.178 | 0,216% | 0,108% | sì |  | nuovo · bassa liquidità |
| 153 | URNM |  | Sprott Uranium Miners ETF | ETF | 11.06.2026 | 104 | 104 | 87.805 | 0,120% | 0,070% | sì |  | nuovo · bassa liquidità |
| 154 | UNH |  | UnitedHealth | azione | 01.10.2026 | 27 | 27 | 87.588 | 0,104% | 0,065% | sotto soglia (originale) |  | originale |
| 155 | APLD |  | Applied Digital | azione | 20.09.2026 | 35 | 35 | 86.989 | 0,064% | 0,084% | sì |  | nuovo · bassa liquidità |
| 156 | XLE |  | Energy Select Sector SPDR ETF | ETF | 12.06.2026 | 103 | 103 | 86.685 | 0,080% | 0,056% | sì |  | nuovo · bassa liquidità |
| 157 | EBAY |  | eBay | azione | 11.06.2026 | 104 | 104 | 86.472 | 0,214% | 0,131% | sì |  | nuovo · bassa liquidità |
| 158 | MARA |  | MARA | azione | 28.08.2026 | 50 | 50 | 86.190 | 0,158% | 0,079% | sì |  | nuovo · bassa liquidità |
| 159 | DIS |  | Walt Disney | azione | 16.06.2026 | 101 | 101 | 84.399 | 0,009% | 0,018% | sotto soglia (originale) |  | originale |
| 160 | SMH |  | VanEck Semiconductor ETF | ETF | 30.07.2026 | 71 | 71 | 83.683 | 0,002% | 0,021% | sì |  | nuovo · bassa liquidità |
| 161 | INFQ |  | Infleqtion | azione | 14.09.2026 | 40 | 40 | 83.524 | 0,169% | 0,264% | sì |  | nuovo · bassa liquidità |
| 162 | GTLB |  | GitLab | azione | 04.09.2026 | 45 | 45 | 83.466 | 0,021% | 0,033% | sì |  | nuovo · bassa liquidità |
| 163 | ZM |  | Zoom Communications | azione | 11.06.2026 | 104 | 104 | 83.223 | 0,111% | 0,055% | sì |  | nuovo · bassa liquidità |
| 164 | FUTU |  | Futu | azione | 24.08.2026 | 54 | 54 | 83.062 | 0,112% | 0,056% | sì |  | nuovo · bassa liquidità |
| 165 | RDW |  | Redwire | azione | 13.10.2026 | 19 | — | 82.599 | 0,139% | 0,187% | sì |  | non aggiunto (meno di 20 giorni) |
| 166 | PATH |  | UiPath | azione | 20.09.2026 | 35 | 35 | 82.539 | 0,077% | 0,127% | sì |  | nuovo · bassa liquidità |
| 167 | TWST |  | Twist Bioscience | azione | 30.09.2026 | 28 | 28 | 82.149 | 0,008% | 0,103% | sì |  | nuovo · bassa liquidità |
| 168 | QBTS |  | D-Wave Quantum | azione | 14.09.2026 | 40 | 40 | 81.481 | 0,103% | 0,051% | sì |  | nuovo · bassa liquidità |
| 169 | ZS |  | Zscaler | azione | 04.09.2026 | 45 | 45 | 81.444 | 0,187% | 0,106% | sì |  | nuovo · bassa liquidità |
| 170 | CEG |  | Constellation Energy | azione | 21.10.2026 | 13 | — | 80.988 | 0,052% | 0,115% | sì |  | non aggiunto (meno di 20 giorni) |
| 171 | TSLL |  | Direxion Daily TSLA Bull 2X Shares | ETF | 28.08.2026 | 50 | 50 | 80.748 | 0,113% | 0,104% | sì | sì | nuovo · ETF a leva |
| 172 | STM |  | STMicroelectronics | azione | 27.10.2026 | 9 | — | 80.654 | 0,144% | 0,227% | sì |  | non aggiunto (meno di 20 giorni) |
| 173 | BITO |  | ProShares Bitcoin ETF | ETF | 28.07.2026 | 73 | 72 | 80.330 | 0,397% | 0,198% | sì |  | nuovo · bassa liquidità |
| 174 | OXY |  | Occidental Petroleum | azione | 02.11.2026 | 5 | — | 80.053 | 0,018% | 0,130% | sì |  | non aggiunto (meno di 20 giorni) |
| 175 | GAMESTOP | GME | GameStop | azione | 11.05.2026 | 126 | 126 | 79.796 | 0,200% | 0,191% | sì |  | nuovo · bassa liquidità |
| 176 | MDB |  | MongoDB | azione | 04.09.2026 | 45 | 45 | 79.688 | 0,003% | 0,037% | sì |  | nuovo · bassa liquidità |
| 177 | SHOP |  | Shopify | azione | 07.08.2026 | 65 | 65 | 79.606 | 0,040% | 0,129% | sotto soglia (originale) |  | originale |
| 178 | PAYP |  | PayPay | azione | 26.03.2026 | 157 | 157 | 79.584 | 0,136% | 0,068% | sì |  | nuovo · bassa liquidità |
| 179 | TEAM |  | Atlassian | azione | 04.09.2026 | 45 | 45 | 79.237 | 0,124% | 0,083% | sì |  | nuovo · bassa liquidità |
| 180 | MRK |  | Merck | azione | 28.08.2026 | 50 | 50 | 79.236 | 0,007% | 0,295% | sì |  | nuovo · bassa liquidità |
| 181 | NVDL |  | GraniteShares 2x Long NVDA Daily ETF | ETF | 28.08.2026 | 50 | 50 | 76.638 | 0,042% | 0,089% | sì | sì | nuovo · ETF a leva |
| 182 | ABBV |  | AbbVie | azione | 27.10.2026 | 9 | — | 76.590 | 0,127% | 0,084% | sì |  | non aggiunto (meno di 20 giorni) |
| 183 | HD |  | Home Depot | azione | 16.06.2026 | 101 | 101 | 76.128 | 0,154% | 0,086% | sì |  | nuovo · bassa liquidità |
| 184 | RUM |  | RUM | azione | 30.09.2026 | 28 | 28 | 76.067 | 0,406% | 0,277% | sì |  | nuovo · bassa liquidità |
| 185 | BAC |  | Bank of America | azione | 21.10.2026 | 13 | — | 75.852 | 0,100% | 0,087% | sì |  | non aggiunto (meno di 20 giorni) |
| 186 | AMGN |  | Amgen | azione | 30.10.2026 | 6 | — | 75.449 | 0,172% | 0,186% | sì |  | non aggiunto (meno di 20 giorni) |
| 187 | SNPS |  | Synopsys | azione | 13.10.2026 | 19 | — | 74.604 | 0,062% | 0,065% | sì |  | non aggiunto (meno di 20 giorni) |
| 188 | EWZS |  | iShares MSCI Brazil Small-Cap ETF | ETF | 02.11.2026 | 5 | — | 74.154 | 0,184% | 0,138% | sì |  | non aggiunto (meno di 20 giorni) |
| 189 | IBKR |  | Interactive Brokers | azione | 21.10.2026 | 13 | — | 71.365 | 0,132% | 0,071% | sì |  | non aggiunto (meno di 20 giorni) |
| 190 | SHLD |  | Global X Defense Tech ETF | ETF | 14.05.2026 | 123 | 123 | 71.213 | 0,326% | 0,834% | sì |  | nuovo · bassa liquidità |
| 191 | MDTUS | MDT | Medtronic | azione | 21.10.2026 | 13 | — | 70.858 | 0,127% | 0,193% | sì |  | non aggiunto (meno di 20 giorni) |
| 192 | EIDO |  | iShares MSCI Indonesia ETF | ETF | 27.10.2026 | 9 | — | 68.603 | 0,399% | 0,314% | sì |  | non aggiunto (meno di 20 giorni) |
| 193 | EQT |  | EQT | azione | 27.10.2026 | 9 | — | 68.340 | 0,121% | 0,145% | sì |  | non aggiunto (meno di 20 giorni) |
| 194 | AKAM |  | Akamai | azione | 09.10.2026 | 21 | 21 | 42.133 | 0,144% | 0,087% | sì |  | nuovo · bassa liquidità |
| 195 | ANET |  | Arista Networks | azione | 20.09.2026 | 35 | 35 | 27.107 | 0,128% | 0,084% | sì |  | nuovo · bassa liquidità |

## Fonti

- **Bitunix:** l'elenco delle coppie (`/api/v1/futures/market/trading_pairs`, da cui viene anche la data di quotazione `launchTime`), le candele giornaliere e orarie (`/market/kline`) e il libro ordini (`/market/depth`).
- **Elenchi dei titoli USA:** Nasdaq Trader (`nasdaqlisted.txt` e `otherlisted.txt`).
- **Prezzi e tipo di titolo:** Yahoo Finance.
