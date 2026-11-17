# "Nessuna conferma" in perdita: si possono riconoscere i casi che vanno contro?

Seguito di [nessuna-conferma-in-perdita.md](nessuna-conferma-in-perdita.md) e [nessuna-conferma-soglia-stretta.md](nessuna-conferma-soglia-stretta.md). È solo ricerca: la strategia non cambia.

## La domanda

I casi studiati sono i trade che alla chiusura della candela d'entrata da 15 minuti hanno volume sotto 1,5 volte il normale e sono in perdita. Sono 389 con i 115 titoli e 456 con i 32 operabili.

Le ricerche precedenti li dividono in tre gruppi, guardando dove arriva il prezzo a fine giornata rispetto al controllo:

- **Riprende:** almeno +0,5 unità.
- **Laterale:** tra −0,5 e +0,5 unità.
- **Va contro:** −0,5 unità o peggio. Qui tenere costa molto: circa −0,75R di media, contro circa −0,29R chiudendo subito.

I casi "va contro" sono 106 su 389 e 101 su 456. Se si riconoscessero al momento del controllo, chiudendo solo quelli si guadagnerebbe circa 0,45R ciascuno, cioè circa +0,1R in media su tutti i casi.

## Come è stata fatta

- **Motore e dati:** gli stessi delle ricerche precedenti. Motore della Simulazione su una copia fuori dall'app, candele da 1 minuto dal 23/3 al 10/11/2026, impostazioni di partenza, 115 titoli e 32 operabili.
- **Momenti di decisione:**
  - al controllo, cioè alla chiusura della candela da 15 minuti;
  - 5 minuti dopo, per poter usare il volume dei minuti successivi. In questo caso si chiude al prezzo di quel momento; se il trade è già uscito, resta il suo risultato.
- **Quanto separa un segnale:** si misura con l'**AUC**, la probabilità che un caso "va contro" preso a caso abbia un valore più "da contro" di un caso degli altri due gruppi.
  - 0,5 = non distingue niente;
  - 0,7 = distingue in modo utile;
  - 1 = distingue perfettamente.
- **Come si prova una regola:** si chiudono solo i trade che la regola riconosce come "va contro" e si tengono tutti gli altri come oggi. Il risultato medio in R si confronta con "tenere tutti": −0,243R con i 115 titoli e −0,225R con i 32 operabili.
- **Contro il caso fortunato:**
  - la soglia di ogni regola è scelta solo sui mesi fino al 14/7 (prova);
  - poi si misura sui mesi dopo (verifica) e sull'altro insieme di titoli;
  - una regola è utile solo se migliora in tutte e tre le misure.

## Segnali provati

| Segnale | Cosa misura |
|---|---|
| Volume dopo il controllo | media al minuto dei 5 minuti dopo, rispetto alla media al minuto della candela d'entrata (si sta riprendendo o continua a calare) |
| Volume ultimi 5 minuti | lo stesso sugli ultimi 5 minuti prima della decisione |
| Volume della candela d'entrata | il multiplo del volume normale già usato dalla regola (sotto 1,5) |
| Attività del mercato | movimento medio, in valore assoluto, degli altri titoli dall'apertura. È lo stesso concetto dell'indice di `server/mindex.js`, ricalcolato qui al minuto della decisione |
| Direzione del mercato | movimento medio degli altri titoli dall'apertura, nella direzione del trade |
| Ampiezza | quota degli altri titoli che si muovono nella direzione del trade |
| Altri trade aperti | quanti sono e il loro risultato aperto medio in R in quel momento |
| Distanza dal VWAP | nella direzione del trade, in unità |
| Perdita al momento | dall'entrata, in unità |
| Peggior punto dall'entrata | la massima escursione contraria, in unità |
| Nuovi minimi o massimi contro | se negli ultimi 5 minuti il prezzo ha fatto un nuovo estremo contrario dall'entrata o si sta solo fermando |
| Spinta degli ultimi 5 minuti | movimento degli ultimi 5 minuti, nella direzione del trade |
| Movimento dall'apertura | quanto del movimento del giorno resta, in unità |
| Ora | minuto dell'entrata e del controllo (9:45 o 10:00 New York) |

## Quanto distinguono

AUC di ogni segnale tra "va contro" e gli altri due gruppi:

| Segnale | 115 · controllo | 115 · +5 min | 32 · controllo | 32 · +5 min |
|---|---:|---:|---:|---:|
| Volume dopo il controllo | — | 0,53 | — | 0,50 |
| Volume ultimi 5 minuti | 0,51 | 0,53 | 0,50 | 0,50 |
| Volume della candela d'entrata | 0,50 | 0,50 | 0,52 | 0,52 |
| **Attività del mercato** | **0,55** | **0,55** | 0,52 | 0,53 |
| Direzione del mercato | 0,50 | 0,47 | 0,53 | 0,48 |
| Ampiezza | 0,51 | 0,49 | 0,52 | 0,48 |
| Altri trade aperti (risultato) | 0,52 | 0,49 | 0,53 | 0,53 |
| Altri trade aperti (quanti) | 0,53 | — | 0,53 | — |
| Distanza dal VWAP | 0,51 | 0,45 | 0,50 | 0,43 |
| Perdita al momento | 0,48 | 0,44 | 0,51 | 0,43 |
| Peggior punto dall'entrata | 0,48 | 0,46 | 0,50 | 0,48 |
| Nuovi minimi o massimi contro | 0,49 | 0,53 | 0,45 | 0,52 |
| **Spinta degli ultimi 5 minuti** | 0,50 | **0,42** | 0,47 | **0,38** |
| Movimento dall'apertura | 0,49 | 0,46 | 0,52 | 0,46 |
| Ora (minuto d'entrata) | 0,51 | 0,51 | 0,49 | 0,49 |

Sotto 0,5 vuol dire che i casi "va contro" hanno valori più bassi.

Tutti i segnali stanno tra 0,42 e 0,55, cioè quasi a caso. I due che si allontanano un po' sono questi:

- **Spinta dei 5 minuti dopo il controllo** (0,38–0,42): è in parte un'informazione già dentro la definizione. Il gruppo "va contro" si decide dal movimento dopo il controllo, e i primi 5 minuti ne fanno parte.
- **Attività del mercato** (0,52–0,55): nei giorni molto mossi i trade in perdita vanno contro un po' più spesso.

## Regole di chiusura provate

Per ogni segnale si è scelta la soglia migliore sui mesi di prova, in ogni insieme. Si è provata anche ogni coppia dei 6 segnali più forti, con entrambe le condizioni insieme.

Differenza in R medio rispetto a tenere tutti; positivo = meglio:

| Regola (chiude se…) | Momento | Chiusi | di cui "contro" | Prova | Verifica | Tutto | Altro insieme |
|---|---|---:|---:|---:|---:|---:|---:|
| **115:** attività del mercato > 1,21% e peggior punto < −0,52 unità | controllo | 102 | 39 | +0,029 | +0,016 | +0,022 | +0,003 |
| **115:** attività del mercato > 1,35% e perdita < −0,18 unità | controllo | 83 | 32 | +0,016 | +0,020 | +0,018 | +0,015 |
| **115:** attività del mercato > 1,49% | controllo | 80 | 29 | +0,024 | +0,004 | +0,013 | −0,001 |
| **32:** altri trade aperti > 2 e attività del mercato > 1,32% | controllo | 60 | 21 | +0,013 | +0,019 | +0,017 | +0,005 |
| **32:** spinta 5 min < −0,09 e attività del mercato > 1,10% | controllo | 107 | 25 | +0,017 | +0,010 | +0,013 | −0,012 |
| **32:** nessun nuovo estremo e attività del mercato > 0,99% | controllo | 122 | 31 | +0,028 | −0,019 | −0,002 | −0,001 |
| **115:** nessun nuovo estremo contro | controllo | 217 | 60 | +0,027 | −0,037 | −0,008 | −0,013 |
| **115:** spinta 5 min < −0,33 unità | +5 min | 32 | 14 | −0,013 | −0,004 | −0,008 | −0,008 |
| **32:** volume dopo il controllo > 0,68 | +5 min | 131 | 35 | −0,003 | −0,025 | −0,016 | −0,008 |
| **32:** distanza dal VWAP < −0,46 unità | +5 min | 41 | 15 | −0,008 | −0,002 | −0,004 | −0,017 |

L'elenco completo, con tutti i segnali e i due momenti, sta nei risultati dello script. Per la scelta conta questo:

- **La regola migliore:** chiude se l'attività del mercato è oltre circa l'1,3% e il trade perde più di 0,18 unità. Migliora in tutte e tre le misure, ma di **+0,015–0,020R** per caso. È circa un decimo di quello che varrebbe riconoscere bene i casi "va contro" (+0,1R).
- **Cosa resta a tenere tutti:** con quella regola il risultato passa da −0,243R a circa −0,225R con i 115 titoli, e da −0,225R a circa −0,21R con i 32 operabili. Su 8 mesi sono 6–7R in tutto, e la differenza è dentro il rumore: l'errore standard delle differenze tra varianti è circa 0,01–0,02R.
- **Sui trade chiusi:** solo un terzo è davvero "va contro". Gli altri due terzi sono laterali o si sarebbero ripresi, ed è lì che chiudere costa.
- **Le regole più forti sui mesi di prova** (per esempio "nessun nuovo estremo") si rovesciano sui mesi di verifica. Erano un caso fortunato.
- **Il volume dei minuti dopo il controllo** non aiuta, né sale né scende in modo diverso nei casi "va contro". Lo stesso vale per l'ora del giorno.

## Conclusione

- **Nessun segnale chiaramente utile.** Nessuno di quelli provati, da solo o in coppia, riconosce i casi "va contro" abbastanza bene da giustificare una nuova uscita. L'unico segnale con un effetto stabile, anche se piccolo, è l'**attività del mercato**: nei giorni molto mossi i trade senza conferma e in perdita vanno contro un po' più spesso. Il guadagno però è troppo piccolo e incerto: circa +0,02R per caso, dentro il rumore.
- **Nessuna modifica:** non è stato implementato niente. La regola di oggi (tenere i trade in perdita senza conferma fino alle uscite normali) resta la scelta migliore tra quelle provate.
- **Perché è difficile:** al controllo i tre gruppi si somigliano. La differenza nasce dopo, nel resto della mattina, e i dati del momento non la anticipano.

## Limiti

- **Periodo e campione:** circa 8 mesi, con circa 100 casi "va contro" per insieme. Un segnale debole potrebbe esistere senza essere misurabile con così pochi casi.
- **Indice di attività del mercato:** quello di `server/mindex.js` esiste solo per i giorni dal vivo, salvati in wt_meta. Qui è stato ricostruito dalle candele degli altri titoli dell'insieme al minuto della decisione.
- **Confronto approssimato:** il confronto è trade per trade. Chiudere prima non ricalcola il resto della giornata della Simulazione: capitale, limiti e freno restano quelli di prima.
