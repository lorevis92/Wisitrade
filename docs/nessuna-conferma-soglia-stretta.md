# "Nessuna conferma" in perdita: soglia di perdita più stretta

Seguito di [nessuna-conferma-in-perdita.md](nessuna-conferma-in-perdita.md). È solo ricerca: la strategia e `shared/engine.js` non cambiano.

## L'idea provata

Riguarda i trade che alla chiusura della candela d'entrata da 15 minuti hanno due condizioni insieme:

- volume sotto 1,5 volte il normale;
- trade in perdita.

Sono gli stessi 389 casi (115 titoli) e 456 casi (32 operabili) della ricerca precedente.

Per questi trade l'app fissa una **soglia di perdita più stretta** tra il prezzo del controllo e lo stop. Funziona così:

- Lo stop vero su Bitunix resta dov'è.
- Se una candela da 1 minuto chiude oltre la soglia, l'app chiude a mercato. Si esce al prezzo di chiusura di quella candela, con lo slittamento, come le altre uscite decise dall'app a candela chiusa.
- Altrimenti il trade prosegue con le regole normali: stop, ritracciamento, resistenza, freno e fine giornata.

Livelli provati, sempre in direzione contraria al trade:

| Livello | Soglia |
|---|---|
| 1/4 | a un quarto della strada dal prezzo del controllo allo stop |
| **metà** | **a metà strada tra il prezzo del controllo e lo stop** |
| 3/4 | a tre quarti della strada |
| −0,5R | perdita di metà del rischio iniziale, misurata dall'entrata |
| −0,75R | perdita di tre quarti del rischio iniziale |
| 0,25 unità | 0,25 unità di volatilità oltre il prezzo del controllo |
| 0,5 unità | 0,5 unità di volatilità oltre il prezzo del controllo |

## Come è stata fatta

Lo stesso metodo della ricerca precedente:

- **Motore:** quello della Simulazione, su una copia fuori dall'app. La soglia è aggiunta solo lì.
- **Dati:** candele da 1 minuto dal 23/3 al 10/11/2026.
- **Impostazioni:** quelle di partenza della strategia.
- **Titoli:** 115 titoli e 32 operabili.
- **Confronto:** sugli stessi casi, trade per trade.
- **Simulazione intera:** ogni livello è stato fatto girare anche sulla simulazione completa, per vedere l'effetto su capitale, limiti e freno.

R è il risultato netto diviso per il rischio iniziale; 1R è la perdita piena allo stop.

## Risultati

### 115 titoli (389 casi)

| Variante | R medio dei casi | Rispetto a tenere | Scattata | Simulazione intera |
|---|---:|---:|---:|---:|
| **Tenere fino alla fine (oggi)** | **−0,243** | — | — | +66,3R · +627% |
| Chiudere subito | −0,288 | −0,045 | — | — |
| 1/4 della strada | −0,270 | −0,027 (±0,019) | 250 | +55,8R · +468% |
| Metà strada | −0,264 | −0,021 (±0,014) | 175 | +57,8R · +508% |
| 3/4 della strada | −0,262 | −0,020 (±0,010) | 110 | +58,4R · +511% |
| −0,5R dall'entrata | −0,262 | −0,019 (±0,018) | 223 | +58,9R · +542% |
| −0,75R dall'entrata | −0,263 | −0,021 (±0,012) | 144 | +57,8R · +494% |
| 0,25 unità | −0,280 | −0,038 (±0,019) | 265 | +52,4R · +430% |
| 0,5 unità | −0,255 | −0,012 (±0,014) | 168 | +61,4R · +597% |

### 32 operabili (456 casi)

| Variante | R medio dei casi | Rispetto a tenere | Scattata | Simulazione intera |
|---|---:|---:|---:|---:|
| **Tenere fino alla fine (oggi)** | **−0,225** | — | — | +31,5R · +122% |
| Chiudere subito | −0,290 | −0,065 | — | — |
| 1/4 della strada | −0,255 | −0,030 (±0,017) | 278 | +17,8R · +94% |
| Metà strada | −0,251 | −0,025 (±0,013) | 191 | +20,1R · +96% |
| 3/4 della strada | −0,234 | −0,009 (±0,008) | 114 | +27,5R · +112% |
| −0,5R dall'entrata | −0,244 | −0,019 (±0,016) | 246 | +22,7R · +115% |
| −0,75R dall'entrata | −0,243 | −0,018 (±0,011) | 157 | +23,4R · +104% |
| 0,25 unità | −0,258 | −0,033 (±0,017) | 287 | +16,4R · +86% |
| 0,5 unità | −0,248 | −0,023 (±0,013) | 190 | +21,3R · +97% |

Il valore tra parentesi è l'errore standard.

**Nessun livello migliora il risultato rispetto a tenere fino alla fine.**

- In entrambi gli insiemi tutti i livelli sono peggiori, di 0,01–0,04R per caso.
- Peggiorano anche il risultato della simulazione intera.
- I livelli più larghi (3/4 della strada, 0,5 unità) si avvicinano a "tenere" senza superarlo, perché scattano meno spesso.
- Con tutti i livelli il risultato resta meglio che chiudere subito.

## Perché non funziona

Prendiamo la soglia a metà strada con i 115 titoli. Scatta in 175 casi:

| Dei 175 casi | Casi | Risultato tenendo | Risultato con la soglia |
|---|---:|---:|---:|
| Sarebbero comunque arrivati allo stop | 72 | circa −1,05R | circa −0,7R |
| Non sarebbero arrivati allo stop | 103 | circa −0,44R (14 in guadagno) | circa −0,7R |

- **Dove si guadagna:** sui 72 trade che arrivano allo stop si risparmiano circa 0,35R ciascuno.
- **Dove si perde:** tra i 103 rimanenti, 14 sarebbero tornati in guadagno. Gli altri avrebbero chiuso a fine giornata o con il ritracciamento, con una perdita più piccola di quella alla soglia.
- **Il saldo:** quello che si perde sui 103 supera quello che si risparmia sui 72.

Lo stesso avviene a tutti i livelli:

- **Soglie strette** (1/4, 0,25 unità): chiudono anche molti trade che si sarebbero ripresi. Con i 32 operabili, tra 59 e 72 trade che sarebbero finiti in guadagno.
- **Soglie larghe:** scattano tardi, quando ormai quasi tutto il danno c'è già.

Per andamento del mercato dopo il controllo (32 operabili, R medio):

| Andamento dopo il controllo | Tenere | Metà strada | 3/4 della strada |
|---|---:|---:|---:|
| Riprende la direzione | +0,201 | +0,110 | +0,176 |
| Laterale | −0,285 | −0,355 | −0,309 |
| Va contro | −0,779 | −0,616 | −0,734 |

- **Contro:** la soglia aiuta, come atteso.
- **Ripresa:** costa, perché molti trade tornano indietro fino alla soglia prima di ripartire.
- **Laterale:** costa anche qui. In un mercato laterale il prezzo tocca facilmente la soglia e poi torna.

Ripresa e laterale insieme pesano più del gruppo contro. Lo stesso vale con i 115 titoli.

## Conclusione

- **Nessuna modifica:** nessuno dei livelli provati migliora chiaramente il risultato, anzi peggiorano tutti. Non è stato implementato niente e la strategia resta com'è.
- **La regola di oggi resta la migliore:** tenere i trade in perdita senza conferma fino alle uscite normali batte sia la chiusura subito sia una soglia più stretta gestita dall'app.
- **Il gruppo "contro" resta da ridurre:** un'idea per farlo dovrebbe riconoscerlo prima, senza colpire i trade laterali e quelli che riprendono. Per esempio un segnale di forza contraria e non solo una distanza di prezzo. Non è stato provato.

## Limiti

- **Periodo:** circa 8 mesi, dal 23/3 al 10/11/2026.
- **Esecuzione:** la soglia scatta sulla chiusura delle candele da 1 minuto, come farebbe l'app dal vivo. Uscendo appena il prezzo la tocca, dentro il minuto, il risultato sarebbe un po' diverso.
- **Variante non provata:** dopo che la soglia è scattata, lo stesso titolo non viene riaperto, perché nella strategia un titolo si apre una sola volta al giorno.
