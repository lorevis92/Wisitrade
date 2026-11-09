# Altri exchange per i titoli USA

Solo ricerca: l'app non è cambiata. Dati letti il 9 novembre 2026 dalle API pubbliche di ogni exchange:
- elenco dei contratti, con leva, minimi, commissioni e stato API dove l'API li dà;
- volumi delle 24 ore;
- data di quotazione di ogni contratto (per Hyperliquid la prima candela giornaliera).

Commissioni, orari e accesso dalla Svizzera vengono dalla documentazione ufficiale dove l'ho trovata, altrimenti da fonti secondarie (segnate "da verificare").

## In breve

- **Il problema di Bitunix è proprio sui titoli che rendono di più.** Dei 25 titoli che in Simulazione hanno contribuito di più, 20 non si possono usare su Bitunix via API: 14 rifiutano gli ordini e 6 rifiutano lo stop.
- **Tutti gli exchange controllati li hanno quasi tutti**, operabili via API. Binance li ha tutti i 25 e tutti i 94 titoli dei 115 che Bitunix blocca.
- **Risultato migliore e solido: Binance**, da solo; Bitunix in più non aggiunge niente. Ha tutti i 115 titoli, il volume più alto (circa 16 miliardi di USDT al giorno sulle azioni), leva 20x su tutto, minimo 5 USDT, commissione taker standard 0,05%.
  - Settembre–novembre: **+53% di media** sugli ordini casuali con 0,05% di slittamento e **+32%** con 0,08%.
  - Bitunix con i suoi 21 titoli: +28% e +13%.
- **Alternativa: Hyperliquid (trade[XYZ]) insieme a Bitunix.** Ha la liquidità migliore sui grandi titoli e commissioni molto basse finché dura la "growth mode" (circa 0,009%). Però mancano 7 dei 25 titoli migliori, e senza la growth mode (0,09%) il risultato crolla.
- **MEXC dà il numero più alto** (commissione 0,02%), ma l'API dei futures è pensata per conti istituzionali verificati e la liquidità sulle azioni è la più bassa. **Non lo consiglio.**
- **L'accesso dalla Svizzera non è confermato da fonti ufficiali per nessuno.** Va verificato all'apertura del conto: vedi la tabella.

## 1. Gli exchange

Legenda della tabella:
- **Titoli dei nostri 115:** presenti, operabili via API e con leva almeno 5x.
- **Volume:** volume delle 24 ore in USDT; "nostri" = mediana sui nostri titoli presenti.
- **Bitunix blocca 94 dei 115 titoli:** 83 non operabili via API e 11 con lo stop rifiutato.

| Exchange | Perpetual azioni/ETF USA | Titoli dei nostri 115 | Dei 25 migliori | Dei 94 bloccati su Bitunix | Taker | Leva max (tipica) | Minimo d'ordine | Volume totale / nostri |
|---|---|---|---|---|---|---|---|---|
| **Bitunix** (confronto) | 181 nostri | 32 operabili (21 con lo stop) | 5 | — | 0,06% | fino a 50x | 1 lotto | — / 0,2 mln |
| **Binance** | 197 | **115** | **25** | **94** | 0,05%¹ | 20x (tutti) | 5 USDT | **16,0 mld / 4,3 mln** |
| **Bitget** | 420 (azioni, ETF, materie prime) | 110 | 25 | 90 | 0,06% | 5–100x (20x) | 5 USDT | 2,9 mld / 1,0 mln |
| **Bybit** | 266 | 109 | 24 (manca AMD) | 88 | 0,055%² | 20–100x (25x) | 5 USDT | 1,7 mld / 0,5 mln |
| **OKX** | 230 | 109 | 24 (manca BNC) | 90 | 0,05%¹ | 5–75x (20x) | 1 contratto (0,001–1 azioni) | 4,3 mld / 0,6 mln |
| **MEXC** | 432 | 111 | 25 | 92 | **0,02%** (0% su 9) | 20–200x (50x) | 1 contratto | 2,0 mld / **0,16 mln** |
| **BingX** | 646 (prefisso NCSK) | 93 (130 contratti azionari hanno l'API chiusa) | 22 (mancano BNC, DDOG, AMD) | 74 | 0,05% | non nell'API pubblica | 2 USDT | 0,4 mld / 1,4 mln |
| **Gate** | 448 | 113 | 24 (manca BNC) | 93 | 0,075% | 20–100x (25x) | 1 contratto | 1,8 mld / 0,4 mln |
| **Hyperliquid HIP-3** (xyz 122, para 33, io 14, mkts 1) | 170 (anche indici e materie prime) | 69 | 18 (mancano AXTI, BSP, FLNC, BNC, ASTS, DDOG, ALAB) | 53 | 0,009% in growth mode, 0,09% pieno³ | 10–50x (10x) | 10 USD | 5,3 mld / **5,6 mln** |
| **BTCC** | non verificabile⁴ | — | — | — | — | fino a 50x (SPACEX) | — | — |

¹ Commissione taker standard (livello base) dei perpetual in USDT. Non ho trovato una tabella ufficiale specifica per i perpetual su azioni: **da verificare**.
² Base 0,055%. Bybit ha fatto promozioni sulle azioni (taker −50%) che potrebbero essere finite.
³ I mercati HIP-3 costano circa il doppio dei perpetual normali di Hyperliquid (taker 0,09% su trade[XYZ]). Con la "growth mode" (campo `growthMode: enabled` nell'API, oggi attivo) le commissioni sono ridotte del 90% e oltre. Il deployer la può togliere.
⁴ BTCC non ha un elenco pubblico dei contratti leggibile via API. Ha una sezione di azioni tokenizzate (Apple, Google, Tesla, Meta, Nvidia, SpaceX pre-IPO, fino a 50x) e una Trade OpenAPI in PDF, ma non è chiaro se copra le azioni. Non l'ho simulato.

### Ordini e stop loss via API

| Exchange | Ordini via API | Stop loss via API | Da sapere |
|---|---|---|---|
| Binance | sì | sì (`STOP_MARKET`, `TAKE_PROFIT_MARKET`, trailing tra i tipi d'ordine del contratto) | prima di operare va firmato l'accordo TradFi-Perps, anche via API (`POST /fapi/v1/stock/contract`) |
| Bitget | sì | sì (TP/SL della posizione nella stessa API dei futures) | contratti `isRwa`, stessa API delle crypto |
| Bybit | sì | sì (TP/SL della posizione) | `symbolType: stock / ETF`, stessa API v5 delle crypto |
| OKX | sì | sì (ordini algo TP/SL) | `instCategory 3`, stessa API delle crypto |
| MEXC | campo `apiAllowed` = sì su tutti | sì nella documentazione | l'API dei futures è stata riaperta il 31.3.2026, ma MEXC la indirizza a conti istituzionali verificati (KYB) e indica i bot come attività limitate: **rischio di blocco** |
| BingX | sì solo dove `apiStateOpen` = true (93 dei nostri) | sì | 130 contratti azionari hanno l'API chiusa |
| Gate | sì | sì (ordini a trigger) | `contract_type: stocks` |
| Hyperliquid | sì (API firmata con il wallet, senza conto né KYC) | sì (ordini trigger TP/SL nativi) | mercati con prefisso del deployer (es. `xyz:NVDA`); alcuni solo con margine isolato |
| BTCC | esiste una Trade OpenAPI | non verificato | non chiaro per le azioni |

### Orari

La strategia opera solo dalle 9:30 alle 10:30 circa di New York, nei giorni di borsa. Basta quindi che il contratto sia aperto in quell'orario: lo è ovunque.
- **24 ore su 24, 7 giorni su 7:** Binance, OKX, Hyperliquid (fonti secondarie).
- **Circa 24 ore nei giorni feriali, chiuso nel fine settimana e nelle feste USA:** Bybit, secondo la sua pagina di confronto.
- **Gli altri:** da verificare. Bitget e Gate hanno contratti sempre attivi nell'API: `maintainTime`/`limitOpenTime` vuoti per Bitget.

### Accesso da un residente in Svizzera

Nessuna fonte ufficiale trovata dice "Svizzera sì" o "Svizzera no" per i derivati. **Va verificato al momento dell'iscrizione** (selettore del paese, KYC, termini del servizio). Non è un parere legale.

| Exchange | Cosa ho trovato |
|---|---|
| Binance | La Svizzera non compare negli elenchi di paesi vietati che ho trovato (USA, Canada, Paesi Bassi, paesi sotto sanzione). I perpetual TradFi sono regolati ad Abu Dhabi ed esclusi almeno per USA e Singapore. **Probabile sì, da verificare.** |
| Bitget | La Svizzera non compare negli elenchi di esclusione noti. **Probabile sì, da verificare.** |
| Bybit | Non è tra i 14 paesi esclusi della Service Agreement (USA, Canada, Cina, Hong Kong, Singapore, Uzbekistan, Dubai, Iran, Siria, Sudan, Cuba, Corea del Nord, Crimea e regioni occupate). **Probabile sì, da verificare.** |
| OKX | Fonti in contrasto: un elenco secondario mette la Svizzera tra i paesi limitati. **Incerto.** |
| MEXC, BingX, Gate, BTCC | Exchange offshore. Non ho trovato la Svizzera nei loro elenchi di esclusione. **Probabile sì, da verificare.** |
| Hyperliquid / trade[XYZ] | Il protocollo è aperto. Il sito di trade[XYZ] dice di non offrire il servizio in alcuni territori, senza un elenco pubblico trovato. **Da verificare nei termini.** |

## 2. I titoli che contribuiscono di più

**Simulazione:**
- 115 titoli, configurazione del Reale (leva 5x, margine 10%, 10 posizioni, freno 8%, limiti 10%/30%, commissione 0,06%, slittamento 0,05%);
- **dimensione fissa** (300 USDT, senza interesse composto), così il contributo di ogni titolo non dipende da quando è arrivato;
- periodo 1° marzo – 6 novembre 2026.

Risultato totale: +662 USDT. I 25 titoli migliori fanno **+831 USDT**; tutti gli altri insieme sono in perdita.

| # | Titolo | USDT | Trade | Bitunix |
|---|---|---|---|---|
| 1 | AXTI | +163 | 61 | no API |
| 2 | CRCL | +77 | 58 | stop rifiutato |
| 3 | BSP | +53 | 12 | no API |
| 4 | COHR | +42 | 29 | no API |
| 5 | ARM | +41 | 43 | ok |
| 6 | WDC | +39 | 36 | no API |
| 7 | SHAZ | +36 | 17 | no API |
| 8 | AAOI | +29 | 48 | no API |
| 9 | HOOD | +27 | 53 | stop rifiutato |
| 10 | FLNC | +27 | 17 | no API |
| 11 | MSTR | +27 | 47 | stop rifiutato |
| 12 | BNC | +26 | 4 | ok |
| 13 | NBIS | +26 | 48 | no API |
| 14 | ASTS | +24 | 25 | ok |
| 15 | USAR | +23 | 24 | ok |
| 16 | SNDK | +22 | 53 | ok |
| 17 | COIN | +20 | 42 | stop rifiutato |
| 18 | LITE | +19 | 43 | no API |
| 19 | CBRS | +18 | 36 | no API |
| 20 | SPCX | +18 | 16 | stop rifiutato |
| 21 | IREN | +16 | 25 | no API |
| 22 | DDOG | +16 | 3 | no API |
| 23 | ALAB | +14 | 6 | no API |
| 24 | AMD | +14 | 32 | stop rifiutato |
| 25 | RKLB | +14 | 22 | no API |

Su Bitunix sono usabili solo 5 dei 25 (ARM, BNC, ASTS, USAR, SNDK).

I 20 bloccati su Bitunix sono presenti e operabili via API così:
- 20 su 20: Binance, Bitget, OKX, MEXC, Gate;
- 19 su 20: Bybit (manca AMD);
- 18 su 20: BingX (manca AMD; DDOG ha l'API chiusa);
- 15 su 20: Hyperliquid (mancano AXTI, BSP, FLNC, DDOG, ALAB).

## 3. Simulazione per exchange

**Come:**
- **Motore:** quello dell'app su una copia nello scratchpad, l'app non cambia. Archivio Bitunix delle candele da 1 minuto. Configurazione del Reale: 300 USDT con interesse composto, leva 5x, margine 10%, 10 posizioni, freno 8%, limiti 10%/30%, funding 0,01%.
- **Titoli:** quelli dei 115 presenti sull'exchange, operabili via API e con leva almeno 5x.
- **Data di quotazione:** ogni titolo si usa **solo dal giorno in cui è quotato su quell'exchange**. Molti titoli sono arrivati tra giugno e agosto 2026; senza questa regola i risultati di marzo–agosto sarebbero gonfiati.
- **Commissione:** la taker di ogni exchange (tabella sopra) su entrata e uscita.
- **"Con Bitunix":** si aggiungono i 21 titoli che Bitunix accetta con lo stop. Su un titolo presente in tutti e due vale la commissione più bassa.
- **Ordine dei titoli:** ordine della lista e media di 10 ordini casuali (tra parentesi minimo e massimo). Come visto in `docs/titoli-allargati.md`, la media degli ordini casuali è la stima più onesta: l'ordine della lista con molti titoli è stato fortunato.

**Settembre – 6 novembre 2026** (il periodo più vicino a oggi, con quasi tutti i titoli già quotati ovunque):

| Exchange | Titoli | 0,05%: lista · media casuali (min – max) | 0,08%: lista · media casuali (min – max) | Calo massimo (lista, 0,08%) |
|---|---|---|---|---|
| Bitunix (21 titoli) | 21 | +26,6% · **+28,2%** (+27 – +29) | +12,4% · **+13,3%** (+12 – +14) | 21% |
| **Binance** (con o senza Bitunix, uguale) | 115 | +104,7% · **+53,0%** (+20 – +75) | +79,8% · **+32,3%** (−3 – +59) | 15% |
| Bitget | 110 | +92,4% · +48,8% (+12 – +81) | +68,0% · +28,8% (−6 – +65) | 17% |
| Bybit (con o senza Bitunix, uguale) | 109 | +107,2% · +54,3% (+26 – +81) | +82,4% · +33,6% (0 – +65) | 15% |
| OKX | 109 | +100,2% · +42,3% (+19 – +64) | +70,6% · +19,6% (−6 – +41) | 18% |
| OKX + Bitunix | 111 | +107,7% · +48,6% (+31 – +80) | +77,0% · +24,9% (+2 – +55) | 18% |
| MEXC | 111 | +136,1% · +69,8% (+38 – +106) | +106,3% · +45,0% (+12 – +74) | 14% |
| BingX | 93 | +106,6% · +67,7% (+46 – +92) | +72,0% · +37,0% (+20 – +59) | 15% |
| BingX + Bitunix | 95 | +113,7% · **+74,8%** (+54 – +92) | +77,9% · +42,9% (+27 – +59) | 15% |
| Gate | 113 | +76,2% · +38,0% (+5 – +69) | +54,5% · +18,4% (−15 – +54) | 15% |
| Gate + Bitunix | 114 | +90,2% · +47,7% (+14 – +83) | +66,9% · +27,0% (−7 – +67) | 15% |
| Hyperliquid (growth mode) | 69 | +89,4% · +47,3% (+25 – +71) | +49,5% · +18,4% (+1 – +37) | 25% |
| Hyperliquid (growth mode) + Bitunix | 74 | +119,7% · +69,4% (+45 – +92) | +73,2% · +36,5% (+19 – +56) | 25% |
| Hyperliquid (commissione piena 0,09%) | 69 | +29,5% · +0,8% (−14 – +17) | +2,6% · −21,1% (−35 – −6) | 31% |
| Hyperliquid (piena) + Bitunix | 74 | +54,5% · +20,3% (+4 – +35) | +24,7% · −2,4% (−15 – +11) | 29% |

**Tutto il periodo** (1° marzo – 6 novembre 2026, ogni titolo dalla sua quotazione):

| Exchange | 0,05%: lista · media casuali | 0,08%: lista · media casuali |
|---|---|---|
| Bitunix (21 titoli) | +31,5% · +33,0% | −2,2% · −1,4% |
| Binance | +716% · +456% | +449% · +274% |
| Binance + Bitunix | +762% · +487% | +478% · +294% |
| Bitget | +567% · +339% | +346% · +189% |
| Bybit | +422% · +250% | +280% · +148% |
| OKX (con Bitunix circa uguale) | +669% · +430% | +399% · +239% |
| MEXC | +1245% · +769% | +774% · +469% |
| BingX (con Bitunix circa uguale) | +540% · +422% | +314% · +228% |
| Gate | +276% · +248% | +169% · +138% |
| Gate + Bitunix | +346% · +257% | +201% · +131% |
| Hyperliquid (growth mode) | +708% · +515% | +396% · +282% |
| Hyperliquid (growth mode) + Bitunix | +686% · +549% | +375% · +297% |
| Hyperliquid (piena) | +155% · +92% | +57% · +19% |
| Hyperliquid (piena) + Bitunix | +182% · +132% | +73% · +44% |

## 4. Quale exchange

**La scelta: Binance, da solo.**
- **Copertura completa:** ha tutti i 115 titoli, tutti i 25 migliori e tutti i 94 bloccati da Bitunix, operabili via API con ordini stop nativi.
- **Liquidità più alta:** mediana di 4,3 milioni di USDT al giorno sui nostri titoli, contro 0,2 milioni su Bitunix. Lo slittamento da 0,05–0,08% è quindi più credibile che altrove.
- **Leva e minimo:** 20x su tutto, minimo 5 USDT.
- **Risultato** (media degli ordini casuali): +53% / +32% su settembre–novembre e +456% / +274% su tutto il periodo, contro +28% / +13% e +33% / −1% di Bitunix con 21 titoli.
- **Bitunix in più non aggiunge niente:** Binance ha già tutti i suoi titoli, con una commissione più bassa.
- **Da verificare prima:**
  - accesso dalla Svizzera ai perpetual TradFi;
  - commissione vera sulle azioni;
  - firma dell'accordo TradFi-Perps.

**Alternative:**
1. **Bybit o Bitget:** risultati simili a Binance su settembre–novembre (+54% e +49% di media con 0,05%), ma molta meno liquidità. Bybit è una buona seconda scelta se Binance non fosse accessibile.
2. **Hyperliquid (trade[XYZ]) + Bitunix:** liquidità ottima sui grandi titoli (mediana 5,6 milioni), stop nativi, nessun conto. Però:
   - mancano 7 dei 25 migliori, tra cui AXTI, il primo;
   - il risultato dipende dalla growth mode: con la commissione piena va a −2% / +20% su settembre–novembre;
   - margine in USDC on-chain e chiavi del wallet da gestire;
   - accesso dalla Svizzera da verificare nei termini di trade[XYZ].
3. **BingX + Bitunix:** il numero migliore su settembre–novembre (+75% / +43%), ma 130 contratti azionari hanno l'API chiusa, la leva non si legge dall'API pubblica e il volume totale sulle azioni è basso (0,4 miliardi al giorno). È fragile.
4. **MEXC:** il risultato più alto grazie alla commissione dello 0,02%, ma:
   - la liquidità è la più bassa (mediana 0,16 milioni al giorno), quindi lo slittamento vero sarà probabilmente sopra lo 0,08%;
   - MEXC indirizza l'API dei futures a conti istituzionali e limita i bot.
   - **Sconsigliato** per un sistema automatico.
5. **OKX e Gate:** nessun vantaggio. Gate ha la commissione più alta (0,075%), OKX ha l'accesso dalla Svizzera incerto.

## Limiti di questa analisi

- **Prezzi:** sono quelli di Bitunix per tutti gli exchange. I perpetual seguono lo stesso titolo, ma l'apertura delle 9:30, lo spread e la profondità del libro cambiano da un exchange all'altro: lo slittamento vero va misurato sul posto, come fatto con Bitunix.
- **Commissioni:** quelle del livello base. Non ho trovato fonti ufficiali per i perpetual su azioni di Binance e OKX. Il funding è uguale per tutti (0,01% per periodo), non quello vero di ogni exchange.
- **Leva e minimi:** la leva 5x della strategia è ammessa ovunque, tranne su BingX dove l'API pubblica non la mostra. I minimi d'ordine sono sotto i 25 USDT dei nostri trade.
- **Ordini casuali:** 10 per ogni caso. Con più titoli la distanza tra l'ordine della lista e la media degli ordini casuali è grande: conta la media.
- **BTCC:** non simulato, perché non ha un elenco pubblico dei contratti.

## Fonti

**API pubbliche** (lette il 9.11.2026):
- Binance: `fapi.binance.com/fapi/v1/exchangeInfo` e `/fapi/v1/ticker/24hr`;
- Bitget: `api.bitget.com/api/v2/mix/market/contracts` e `/tickers`;
- Bybit: `api.bybit.com/v5/market/instruments-info` e `/tickers`;
- OKX: `www.okx.com/api/v5/public/instruments` e `/market/tickers`;
- MEXC: `contract.mexc.com/api/v1/contract/detail` e `/ticker`;
- BingX: `open-api.bingx.com/openApi/swap/v2/quote/contracts` e `/ticker`;
- Gate: `api.gateio.ws/api/v4/futures/usdt/contracts` e `/tickers`;
- Hyperliquid: `api.hyperliquid.xyz/info` (`perpDexs`, `metaAndAssetCtxs`, `candleSnapshot`).

**Documentazione e notizie:**
- Binance: accordo TradFi-Perps nell'API ([The Block](https://www.theblock.co/post/382209/binance-api-update-hints-at-stock-perpetual-cont)); lancio dei perpetual TradFi ([The Block](https://www.theblock.co/news/markets/2026-01-08-binance-gold-silver-perpetual-contracts-usdt-settled-384743)); 20x e minimo 5 USDT ([crypto.news](https://crypto.news/binance-launches-5-stock-perpetuals-with-20x-leverage/)).
- Bybit: [introduzione ai TradFi Perpetual](https://www.bybit.com/en/help-center/article/Introduction-to-TradFi-Perpetual-Contracts), [confronto Bybit Stocks](https://www.bybit.com/en/learn/bybit-stocks/bybit-stocks-comparison), [paesi esclusi](https://www.coinperps.com/learn/bybit-restricted-countries).
- OKX: [perpetual su azioni 24/7](https://www.theblock.co/post/394776/okx-equity-perpetual-swaps); paesi limitati ([coinperps](https://www.coinperps.com/learn/okx-restricted-countries)).
- MEXC: [riapertura dell'API dei futures](https://www.mexc.com/api-docs/futures/update-log), [limiti al trading automatico](https://www.mexc.com/announcements/17827791531135).
- Hyperliquid / trade[XYZ]: [commissioni HIP-3 e growth mode](https://hyperliquidguide.pages.dev/guides/trading/equity-perps-guide), [quota dei mercati HIP-3](https://www.theblock.co/news/defi/2026-07-13-hyperliquid-hip-3-markets-surge-50-perp-volume-onchain-stock-trading-grows-408064).
- Gate: [contratti azionari](https://cryptobriefing.com/gate-stock-futures-binance-aum-growth/).
- BTCC: [SpaceX pre-IPO](https://cryptoslate.com/press-releases/btcc-exchange-launches-spacex-pre-ipo-perpetual-futures-trading-and-celebrates-with-tesla-cyberbeast-giveaway/), [richiesta di integrazione in CCXT con la Trade OpenAPI](https://github.com/ccxt/ccxt/issues/22623).

**Script e risultati** (scratchpad della sessione, cartella `ex/`):
- `analyze.mjs`: mercati;
- `hlfirst.mjs`: date di quotazione di Hyperliquid;
- `stats.mjs`: contributi e copertura;
- `sim2.mjs`: simulazioni;
- risultati in `markets.json`, `stats.json` e `simres2.json`.
