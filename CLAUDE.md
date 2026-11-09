# Wisi Trade — note per Claude Code

App personale di Lorenzo: scanner di momentum su 14 crypto + 36 titoli USA (perpetual Bitunix) con push, più la strategia "Apertura USA" (fino a 179 titoli: i 32 originali, 83 nuovi, 45 a bassa liquidità e 19 ETF a leva o inversi) che gira dal vivo in Prova (capitale fittizio) e Reale (ordini veri su Bitunix). Interfaccia in italiano.

## Struttura
- `src/` PWA React + Vite (grafici `lightweight-charts` v5, service worker `public/sw.js`). Pagine: Live, Watchlist, Strategia, Calendario, Asset, Impostazioni.
- `api/index.js` unica funzione Vercel con tutte le API (vercel.json riscrive `/api/*` qui). Rotte cron: `/api/cron/tick` (ogni minuto) e `/api/cron/context` (ogni ora), chiamate da cron-job.org con `CRON_SECRET`.
- `server/` logica server: `bitunix.js` (dati pubblici + API firmate), `tick.js` (controllo ogni minuto: prima le candele da 1 minuto dei soli titoli che servono alla strategia, poi lo scanner; fuori orario aggiorna anche l'archivio), `scanner.js` (segnali), `strategy.js` (Apertura USA dal vivo: Prova e Reale), `archive.js` (archivio candele 1 min per la Simulazione, tabella `wt_bars`), `limits.js` (leva massima, margine di mantenimento e funding di Bitunix, aggiornati ogni giorno), `mindex.js` (indice di attività del mercato: valori di ogni giorno in wt_meta `mindex:raw`, indice di oggi alle 9:35 in `mindex:YYYY-MM-DD`), `context.js` (Contesto AI), `push.js` (web-push), `db.js` (Supabase), `session.js` (orari NY).
- `shared/` codice comune server/app (alias Vite `@shared`): `assets.js` (asset dello scanner + titoli solo per la strategia), `universe.js` (titoli aggiunti alla strategia, gruppi "new", "low" = bassa liquidità e "lev" = ETF a leva o inversi; elenco e criteri in `docs/titoli-bitunix.md`), `indicators.js`, `signals.js`, `opening.js` (impostazioni e opzioni della strategia), `engine.js` (regole di entrata/uscita minuto per minuto, liquidazione e costi, usate da Prova, Reale e Simulazione: cambiarle qui cambia tutte e tre), `time.js` (orari NY), `analysis.js` (valori dell'Analisi della Simulazione, solo dati noti in quel minuto).
- Pagina Strategia: schede Prova, Reale, Simulazione (`src/pages/Simulation.jsx`). Impostazioni salvate con nome in `wt_presets`, comuni alle tre schede.
- `supabase/schema.sql` schema del database (tabelle `wt_*`, RLS attiva senza regole: accesso solo dal server con service_role).

## Regole
- Niente login: watchlist e preferenze in localStorage. La pagina Strategia e gli avvisi delle operazioni richiedono il codice di controllo (`ADMIN_TOKEN`, header `Authorization: Bearer`).
- Gli ordini veri partono solo se `LIVE_TRADING=on`, le chiavi Bitunix ci sono e il conto `live` è attivo. Non cambiare questa protezione.
- Nel Reale: mai una leva oltre il massimo di Bitunix e mai un trade con lo stop oltre il prezzo di liquidazione. Non togliere questi controlli.
- Nel Reale le posizioni manuali di Lorenzo (stesso conto Bitunix) non si toccano mai: regole in `server/live.js`. Si apre solo se sul titolo non ci sono posizioni né ordini non della strategia (altrimenti trade saltato, senza cambiare leva o margine); la posizione della strategia si riconosce dal positionId nuovo nato dall'ordine e da lì si usa solo quello, per la sua quantità (chiusure, metà, stop loss). Margine sempre isolato, verificato su Bitunix prima di ogni ordine. Non togliere questi controlli.
- Limiti di perdita giornaliera e totale, freno di mercato "chiudi tutto" e scelta tra segnali dello stesso minuto: regole in `shared/engine.js` (lossCheck, signalRank), uguali per Simulazione, Prova e Reale. Test e raccomandazioni in `docs/freno-e-scelta.md`.
- Opzioni d'entrata (ritardo, filtro volume, conferma volume dopo l'entrata; spente di default): regole in `shared/engine.js` (entryFrom, volInBlock, minuteNormals, stepBar); il volume normale minuto per minuto 9:30–10:05 viene dall'archivio (in Prova/Reale nella preparazione del mattino). Test in `docs/entrata-e-volumi.md`.
- Simulazione, Prova e Reale hanno impostazioni indipendenti: caricare o sovrascrivere un'impostazione salvata non cambia Prova o Reale finché non si preme Salva nella loro pagina (nome della configurazione attiva in wt_meta `active:<mode>`).
- Capitale dedicato (`server/capital.js`, wt_meta `capital:<mode>`): si aggiorna con il risultato vero di ogni trade; perdita massima giornaliera e totale in % di quel capitale.
- Le chiavi (Supabase service_role, Bitunix, VAPID, Anthropic) stanno solo nelle variabili d'ambiente di Vercel, mai nel codice o nel browser.
- Nuove tabelle: prefisso `wt_`, migrazioni non distruttive (`create table if not exists`, `alter table ... add column if not exists`) aggiunte in fondo a `supabase/schema.sql`.
- Design: sfondo `#07090F`, superfici `#0E1320`/`#111726`/`#0B0F19`, bordi `#1C2233`, testo `#E8ECF5`/`#9AA6C2`/`#6B7590`, primario `#E8352A`, long `#00E5C7`, short `#FF5C7A`, warning `#F5B83D`. Font Syne (UI) e DM Mono (numeri). Token in `src/styles.css`.
- Build: `npm run build`. Deploy: automatico su Vercel a ogni push su GitHub.
- Dopo ogni modifica: commit e push su GitHub senza chiedere conferma.
