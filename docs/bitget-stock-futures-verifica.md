# Bitget: futures sui titoli azionari, verifica via API

Controllo fatto il 18/11/2026 chiamando le API pubbliche di Bitget. È solo una verifica: l'app non cambia.

## In breve

- **I titoli azionari non sono nei CFD di Bitget.** Su Bitget i titoli sono **futures perpetui USDT normali**, cioè categoria `USDT-FUTURES`, la stessa dei futures crypto. In tutto sono 370, con `symbolType = "stock"`.
- **I CFD sono un'altra cosa.** Contengono solo valute, indici e materie prime: nessun titolo azionario singolo.
- **Copertura dei nostri titoli:** dei nostri 181 titoli (Apertura USA e scanner), **173 esistono su Bitget come perpetuo USDT**. Dei 35 operabili oggi via API su Bitunix ne esistono **33**.

## Endpoint chiamati

| Endpoint | Esito |
|---|---|
| `GET https://api.bitget.com/api/v3/cfd/account/instruments` (CFD → Account → Instruments) | **Richiede la chiave API.** Senza chiave risponde HTTP 400 `{"code":"40006","msg":"Invalid ACCESS_KEY"}`. La documentazione indica il permesso "UTA trade (read-only)". Non l'ho chiamato con una chiave, quindi i dati CFD che dà solo questo endpoint (leva, margine, orari) **non sono verificati**. |
| `GET https://api.bitget.com/api/v3/cfd/market/tickers` (CFD → Market → Tickers) | Risponde senza chiave, anche se la documentazione indica lo stesso permesso. Dà **208 strumenti CFD**. |
| `GET https://api.bitget.com/api/v3/market/instruments?category=USDT-FUTURES` (catalogo pubblico dei futures) | Pubblico. Dà **886 perpetui**: 506 crypto, 370 stock, 7 metalli e 3 materie prime. Per ognuno ci sono simbolo, leva massima e commissioni. |

### I 208 strumenti CFD

Valute, per esempio EURUSD e USDJPY.

Indici:

- NAS100, US500, US30, US2000
- DE40, UK100, JP225, HK50
- e altri.

Materie prime:

- XAUUSD, XAGUSD
- UKOUSD, USOUSD, NG
- Copper, Coffee, Wheat
- e altre.

Molti esistono in due versioni, con e senza il suffisso `.s`, per esempio `XAUUSD` e `XAUUSD.s`. **Nessun titolo azionario singolo** (AAPL, NVDA, ASTS…) e nessun ETF dei nostri.

## I titoli su Bitget come perpetui USDT

**Formato:**

- il simbolo è il codice del titolo più `USDT`, per esempio `NVDAUSDT`, `ASTSUSDT` o `SKHYUSDT`;
- categoria `USDT-FUTURES`, tipo `perpetual`, `isRwa = "YES"`;
- `instrumentType`: `stock`, `etf` o `index`;
- per molti c'è anche l'ISIN.

**Prodotto:** è lo stesso dei futures crypto, quindi non serve un conto CFD separato. Sono le stesse API v3 dei futures USDT.

**Costi e limiti, uguali per tutti i 370:**

- commissione taker 0,06% e maker 0,02%;
- funding ogni 8 ore (ogni 4 ore per 5 strumenti);
- ordine minimo 5 USDT.

**Leva massima dei nostri titoli coperti:**

| Leva massima | Titoli |
|---|---:|
| 100x | 7 |
| 75x | 2 |
| 50x | 12 |
| 25x | 1 |
| 20x | 146 |
| 5x | 3 |

Oggi la strategia usa leva 5, quindi tutti i titoli coperti la permettono.

### I nostri titoli

| Gruppo | Nostri | Su Bitget |
|---|---:|---:|
| 32 originali e titoli dello scanner | 34 | 33 |
| Nuovi (`new`) | 83 | 79 |
| Bassa liquidità (`low`) | 45 | 42 |
| ETF a leva o inversi (`lev`) | 19 | 19 |
| **Totale** | **181** | **173** |

**Mancano su Bitget (8):**

- DIS, NOK, ACN, HIMS, RIVN;
- NVO;
- PAYP. Su Bitget c'è PYPL, ma è PayPal e non PayPay, quindi non è lo stesso titolo;
- SHLD.

**Con un nome diverso da Bitunix:**

- CATERPILLAR → `CATUSDT`
- GAMESTOP → `GMEUSDT`

**Una nota:** MA (Mastercard) su Bitget ha `symbolType = "crypto"` anche se il nome è Mastercard.

### I 35 operabili oggi via API su Bitunix

Sono quelli di `server/operable.js`.

Ce ne sono 33 su Bitget, con la leva massima:

- AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA: 100x
- SNDK, SPCX: 75x
- NFLX, INTC, MSTR, MU, CRCL, SKHY, SPY, EWY: 50x
- AMD, PLTR, COIN, HOOD, BABA, MA, BA, ARM, QQQ, BE, QCOM, SMCI, ASTS, TSM, USAR: 20x
- BNC: 5x

Mancano NVO e PAYP.

## Cosa non è verificato

- **Dati dei CFD:** leva, margine, orari e commissioni si leggono solo da `cfd/account/instruments`, che richiede la chiave API. Per i titoli comunque non servono, perché non sono CFD.
- **Ordini via API:** il catalogo dei futures non ha un campo come `isApiSupported` di Bitunix. Non so se tutti i perpetui sui titoli si possono operare via API; si saprebbe solo provando con una chiave.
- **Orari:** non ho controllato in che orari si possono negoziare i perpetui sui titoli; il campo `maintainTime` è vuoto.
