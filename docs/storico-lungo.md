# Storico lungo con i dati delle azioni (Alpaca)

**Stato: fermo alla verifica della fonte.** Su marzo–novembre 2026 le candele delle azioni (Alpaca) e quelle dei perpetual (Bitunix) danno risultati molto diversi. Come richiesto, la ricerca sugli anni passati non è andata avanti: serve prima una decisione (in fondo).

L'app non è cambiata.

## Dati scaricati

- **Fonte:** Alpaca, piano paper gratuito, feed completo SIP. Candele da 1 minuto corrette per i frazionamenti, dalle 9:00 alle 16:30 di New York.
- **Storia disponibile:** dal 4 gennaio 2016 (il piano non va più indietro) all'11 novembre 2026, quindi quasi 11 anni.
- **Titoli:**
  - 65 dei 115 hanno tutta la storia;
  - gli altri entrano dal giorno della quotazione: per esempio Palantir dal 2020, Coinbase dal 2021, Arm dal 2023, Circle dal 2025, SpaceX da giugno 2026.
- **Simboli che prima indicavano altro:** partono da quando il titolo è quello di oggi.
  - NBIS fino al 2024 era Yandex: parte dal 21 ottobre 2024.
  - DRAM nel 2016–2017 era un altro fondo: parte dal 2 aprile 2026.
  - DJT prima del 2021 ha solo dati con volume zero: parte dal 26 marzo 2024, come Trump Media.
- **Dove:** 1,2 GB sul PC, nella cartella della ricerca, non su Supabase. Le chiavi si leggono da `.env.local` e non sono mai stampate né salvate altrove.

## Verifica: Alpaca contro Bitunix, marzo–novembre 2026

Stessi titoli negli stessi giorni (un titolo in un giorno resta solo se c'è in tutte e due le fonti). Stessa copia del motore, configurazione del Reale, uscite gestite dall'app sulla chiusura del minuto (`docs/percorso-candela.md`), 10 ordini casuali dei segnali.

### Prezzi

| | Differenza tra azione e perpetual |
|---|---|
| Apertura delle 9:30 | mediana 0,15%; 90% dei casi sotto 0,45%; oltre 0,5% nell'8% dei casi. I titoli con le differenze più grandi sono i piccoli: BWET, SECZ, BNC, BOT, FWDI, CYPH |
| Chiusura di ogni minuto (9:30–10:00) | mediana 0,13%. Il perpetual non è identico all'azione: ha uno scarto piccolo ma continuo (anche per AAPL, NVDA, SPY circa 0,08%) |
| Ampiezza delle candele da 1 minuto (massimo − minimo) | l'azione è in mediana **22% più ampia** del perpetual |
| Livelli del mattino (massimo di ieri) | mediana 0,09% |
| Unità di volatilità | l'azione è in mediana 6% più alta |

Le candele sono allineate allo stesso minuto: con uno spostamento di ±1 minuto la differenza aumenta.

### Segnali (tutti i titoli, senza limite di posti né freno)

Nei giorni in cui almeno una delle due fonti dà un segnale:
- **3.056 segnali uguali**: stesso lato e stesso minuto;
- 1.296 dallo stesso lato ma in un minuto diverso;
- 227 dal lato opposto;
- circa 1.500 casi con un segnale da una parte sola: livello vicino solo da una parte, oppure soglia non toccata.

**Quando il segnale è uguale, il risultato è quasi uguale.** Sui 2.142 trade con lo stesso segnale fino all'uscita, l'83% esce per lo stesso motivo e il risultato medio differisce di 0,03 punti per trade.

### Risultati con la configurazione del Reale

| | Alpaca (azioni) | Bitunix (perpetual) |
|---|---|---|
| 115 titoli, slittamento 0,05% | +10,5% | +255,9% |
| 115 titoli, 0,08% | −23,7% | +122,6% |
| 32 operabili, 0,05% | +18,6% | +135,7% |
| 32 operabili, 0,08% | −32,4% | +54,7% |

Dal 1° aprile, per togliere i primi giorni in cui Bitunix aveva poca storia:

| | Alpaca | Bitunix |
|---|---|---|
| 115 titoli: trade | 1.467 | 1.475 |
| 115 titoli: risultato medio per trade | **+0,03%** | **+0,19%** |
| 115 titoli: freno di mercato scattato | 15 volte | 12 volte |
| 32 operabili: risultato medio per trade | −0,01% | +0,13% |
| 32 operabili: strategia ferma per perdita massima totale (30%) | 6 ordini su 10 | mai |

Il numero di trade è lo stesso; cambia il risultato di ciascuno, di circa **0,16 punti per trade**. È quasi tutto il vantaggio che la strategia ha sui perpetual.

### Perché

- Le due fonti partono dallo stesso posto: apertura, livelli e volatilità sono molto vicini.
- Cambia il percorso dei prezzi dentro la mattina. Le candele delle azioni sono più ampie e più agitate: contengono tutte le esecuzioni di tutte le borse, comprese quelle anomale. Il perpetual è un prezzo di Bitunix che segue l'azione in modo più regolare, con un piccolo scarto.
- Con un percorso più agitato cambia il minuto in cui si tocca la soglia, si toccano prima lo stop e lo stop che segue, e il freno scatta più spesso.
- Sugli stessi segnali la differenza è piccola. Sono i segnali che cambiano, per pochi decimi di punto, a portarsi via il vantaggio.

### Cosa vuol dire per lo storico

La strategia si opera sui perpetual di Bitunix: la fonte giusta sono loro. Con le azioni il 2026 viene quasi a zero (+10% invece di +256% con i 115 titoli). Quindi un risultato degli anni passati calcolato sulle azioni **non dice cosa avrebbe fatto il Reale**:
- se lo storico venisse vicino a zero, non si saprebbe se colpa della strategia o della fonte;
- se venisse positivo, sarebbe probabilmente prudente, ma di quanto non si sa e può cambiare da un anno all'altro.

I perpetual su azioni di Bitunix esistono solo dal 2026: per gli anni prima una fonte più vicina non c'è.

## Da decidere prima di andare avanti

1. **Confronto tra anni sulla stessa fonte.** Si guarda il 2026 contro gli anni passati, tutti con le azioni di Alpaca. Non dà il guadagno del Reale, ma dice se il 2026 è stato un anno normale o eccezionale per questa strategia, e in quali periodi di mercato va meglio o peggio.
2. **Prima capire la differenza.** Per esempio si provano le azioni togliendo le esecuzioni anomale dalle candele, per vedere se la distanza dai perpetual si chiude. Se si chiude, lo storico diventa molto più credibile.
3. **Fermarsi qui.** Lo storico sulle azioni non è abbastanza vicino al Reale per fidarsi del risultato.
