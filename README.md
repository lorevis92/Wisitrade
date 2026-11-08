# Wisi Trade

App personale (PWA) che segue in tempo reale 14 crypto e 36 grandi titoli USA, scambiati come perpetual su Bitunix:
- **Live / Watchlist / Calendario**: movimenti forti e trend decisi, grafici tipo TradingView, Contesto settimanale con l'AI, notifiche push.
- **Strategia**: la strategia *Apertura USA · entrata in tempo reale* che gira da sola ogni giorno di borsa:
  - **Prova**: tutto uguale, con capitale fittizio;
  - **Reale**: ordini veri su Bitunix (bloccati finché non li sblocchi tu).

Stack: GitHub + Vercel (app e API) + Supabase (database) + cron-job.org (controllo ogni minuto, gratis). Tutti i dati arrivano dalle API pubbliche di Bitunix.

---

## 1. Supabase
1. Crea un progetto su supabase.com (o usane uno esistente: tutte le tabelle iniziano con `wt_`).
2. **SQL Editor → New query**: incolla tutto `supabase/schema.sql` e premi **Run**.
3. **Project Settings → API**: copia **Project URL** e la chiave **service_role** (segreta).

## 2. Chiavi per le notifiche
Nel terminale, dentro la cartella del progetto:
```
npm install
npx web-push generate-vapid-keys
```
Copia la *Public Key* e la *Private Key*.

## 3. GitHub + Vercel
1. Carica la cartella su un nuovo repository GitHub.
2. Su Vercel: **Add New → Project**, importa il repository (Vercel riconosce Vite da solo) e **Deploy**.
3. **Settings → Environment Variables**: aggiungi le variabili di `.env.example`:

| Variabile | Cosa mettere |
|---|---|
| `SUPABASE_URL` | Project URL di Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave service_role |
| `ADMIN_TOKEN` | una password lunga inventata da te: è il **codice di controllo** della pagina Strategia |
| `CRON_SECRET` | un'altra password lunga, per cron-job.org |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | dal punto 2 |
| `VAPID_SUBJECT` | `mailto:` + la tua email |
| `ANTHROPIC_API_KEY` | per il Contesto settimanale |
| `BITUNIX_API_KEY` / `BITUNIX_SECRET_KEY` | solo per la modalità Reale (vedi punto 6) |
| `LIVE_TRADING` | `off` (lascialo così finché testi in Prova) |

4. **Deployments → Redeploy**, così le variabili diventano attive.

## 4. cron-job.org (il controllo ogni minuto)
Il piano gratuito di Vercel fa partire funzioni programmate solo una volta al giorno, quindi il "battito" lo dà cron-job.org (gratis).
1. Crea un account su cron-job.org.
2. **Job 1 · controllo**: URL `https://TUA-APP.vercel.app/api/cron/tick?key=IL_TUO_CRON_SECRET`, ogni minuto.
3. **Job 2 · Contesto AI**: URL `https://TUA-APP.vercel.app/api/cron/context?key=IL_TUO_CRON_SECRET`, ogni ora.
4. Nelle opzioni di ogni job alza il timeout al massimo. Se cron-job.org segna "timeout" ogni tanto non è un problema: su Vercel il controllo finisce comunque.

Verifica: apri `https://TUA-APP.vercel.app/api/health`, deve rispondere `{"ok":true}`.

## 5. Primo uso
1. Apri l'app dal telefono e installala (Condividi → Aggiungi alla schermata Home su iPhone).
2. **Impostazioni → Attiva notifiche**.
3. **Strategia**: inserisci il codice di controllo (`ADMIN_TOKEN`). La Prova è già attiva con 300 USDT fittizi e la configurazione migliore dei test (34 titoli, leva 5x, margine 10%, massimo 8 posizioni, stop loss 1,5, stop che segue 1, protezione guadagno 40%, spazio dal livello "almeno tutto il movimento").
4. Torna in **Impostazioni** e accendi **Aperture e chiusure della strategia** per ricevere una notifica a ogni operazione.

Dalle 8:00 di New York (14:00 in Svizzera) l'app prepara i titoli: livelli di ieri e dei 5 giorni, volatilità, volume normale. Dalle 15:30 svizzere parte la strategia.

## 6. Modalità Reale (quando la Prova ti convince)
1. Su Bitunix crea una API key con **solo permesso di trading, MAI prelievi**. Mettila in `BITUNIX_API_KEY` e `BITUNIX_SECRET_KEY` su Vercel.
2. Imposta `LIVE_TRADING=on` e fai **Redeploy**: è l'interruttore generale, con `off` nessun ordine vero parte mai.
3. In **Strategia → Reale** scegli il capitale: una **cifra fissa** in USDT oppure una **% del saldo** Bitunix (vedi subito il corrispettivo in dollari). Poi **Avvia la strategia** e conferma.
4. Ogni ordine è a mercato, in margine isolato, con uno **stop loss di sicurezza già impostato su Bitunix**, così la posizione è protetta anche se il controllo ogni minuto si fermasse. Le uscite della strategia (stop che segue, protezione guadagno ecc.) le gestisce l'app chiudendo la posizione a mercato.
5. **Ferma la strategia**, **Chiudi ora** e **Chiudi tutto** sono sempre a portata di mano nella pagina.

Inizia con poco capitale e controlla le prime operazioni direttamente su Bitunix.

## Comandi utili (con il codice di controllo come `Authorization: Bearer ADMIN_TOKEN`)
- `GET /api/admin/perps`: quali titoli hanno un perpetual su Bitunix.
- `POST /api/admin/tick`: lancia subito un controllo.
- `POST /api/admin/context?symbol=NVDA`: rigenera il Contesto di un asset.

## Differenze rispetto alla simulazione
- La simulazione usava candele da 15 minuti dei titoli in borsa (Interactive Brokers); qui la strategia usa le **candele da 1 minuto dei perpetual Bitunix**, cioè i prezzi che operi davvero. I risultati non saranno identici.
- I filtri QQQ, pre-market e trend giornaliero non sono inclusi: nei test non miglioravano i risultati.
- In Prova le entrate avvengono al prezzo esatto del segnale; nel Reale a mercato, quindi con un po' di slittamento, soprattutto all'apertura.

Non è consulenza finanziaria. Il trading con leva può far perdere più del capitale investito.
