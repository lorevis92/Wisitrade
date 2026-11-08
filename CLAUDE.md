# Wisi Trade — note per Claude Code

App personale di Lorenzo: scanner di momentum su 14 crypto + 36 titoli USA (perpetual Bitunix) con push, più la strategia "Apertura USA" che gira dal vivo in Prova (capitale fittizio) e Reale (ordini veri su Bitunix). Interfaccia in italiano.

## Struttura
- `src/` PWA React + Vite (grafici `lightweight-charts` v5, service worker `public/sw.js`). Pagine: Live, Watchlist, Strategia, Calendario, Asset, Impostazioni.
- `api/index.js` unica funzione Vercel con tutte le API (vercel.json riscrive `/api/*` qui). Rotte cron: `/api/cron/tick` (ogni minuto) e `/api/cron/context` (ogni ora), chiamate da cron-job.org con `CRON_SECRET`.
- `server/` logica server: `bitunix.js` (dati pubblici + API firmate), `tick.js` (controllo ogni minuto), `scanner.js` (segnali), `strategy.js` (motore Apertura USA), `context.js` (Contesto AI), `push.js` (web-push), `db.js` (Supabase), `session.js` (orari NY).
- `shared/` codice comune server/app (alias Vite `@shared`): `assets.js`, `indicators.js`, `signals.js`, `opening.js` (regole e impostazioni della strategia).
- `supabase/schema.sql` schema del database (tabelle `wt_*`, RLS attiva senza regole: accesso solo dal server con service_role).

## Regole
- Niente login: watchlist e preferenze in localStorage. La pagina Strategia e gli avvisi delle operazioni richiedono il codice di controllo (`ADMIN_TOKEN`, header `Authorization: Bearer`).
- Gli ordini veri partono solo se `LIVE_TRADING=on`, le chiavi Bitunix ci sono e il conto `live` è attivo. Non cambiare questa protezione.
- Le chiavi (Supabase service_role, Bitunix, VAPID, Anthropic) stanno solo nelle variabili d'ambiente di Vercel, mai nel codice o nel browser.
- Nuove tabelle: prefisso `wt_`, migrazioni non distruttive (`create table if not exists`, `alter table ... add column if not exists`) aggiunte in fondo a `supabase/schema.sql`.
- Design: sfondo `#07090F`, superfici `#0E1320`/`#111726`/`#0B0F19`, bordi `#1C2233`, testo `#E8ECF5`/`#9AA6C2`/`#6B7590`, primario `#E8352A`, long `#00E5C7`, short `#FF5C7A`, warning `#F5B83D`. Font Syne (UI) e DM Mono (numeri). Token in `src/styles.css`.
- Build: `npm run build`. Deploy: automatico su Vercel a ogni push su GitHub.
- Dopo ogni modifica: commit e push su GitHub senza chiedere conferma.
