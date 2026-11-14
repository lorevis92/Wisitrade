-- Wisi Trade — schema Supabase (Postgres). Tutte le tabelle hanno prefisso wt_.
-- Incolla tutto in Supabase → SQL Editor → Run. Si può rilanciare senza perdere dati.
-- RLS attiva senza regole: dal browser nessuno legge o scrive, solo il server (chiave service_role).

create table if not exists wt_state (
  symbol text primary key,
  score int not null default 0,
  data jsonb not null,
  updated_at bigint not null
);

create table if not exists wt_signals (
  id bigserial primary key,
  symbol text not null,
  type text not null,
  direction text not null,
  score int not null,
  max_score int not null,
  entry double precision not null,
  stop double precision not null,
  atr double precision not null,
  started_at bigint not null,
  ended_at bigint,
  end_price double precision,
  ret90 double precision,
  mfe double precision not null default 0,
  status text not null default 'active'
);
create index if not exists wt_signals_status on wt_signals (status);
create index if not exists wt_signals_symbol on wt_signals (symbol, started_at);

create table if not exists wt_context (
  symbol text primary key,
  data jsonb,
  bias text not null default 'neutral',
  next_earnings text,
  daily_atr_pct double precision,
  generated_at bigint not null default 0,
  dirty boolean not null default false,
  dirty_reason text,
  dirty_day text
);

create table if not exists wt_subs (
  id text primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  watchlist jsonb not null default '[]',
  all_alerts boolean not null default true,
  trade_alerts boolean not null default false,
  created_at bigint not null,
  last_seen bigint not null
);

create table if not exists wt_meta (
  key text primary key,
  value jsonb not null
);

-- Strategia "Apertura USA": un conto per modalità (paper = Prova con capitale fittizio, live = Reale su Bitunix)
create table if not exists wt_accounts (
  mode text primary key check (mode in ('paper', 'live')),
  enabled boolean not null default false,
  settings jsonb not null default '{}',
  balance double precision not null default 300,     -- solo Prova: saldo fittizio
  start_balance double precision not null default 300,
  updated_at bigint not null default 0
);
insert into wt_accounts (mode, enabled, balance, start_balance) values ('paper', true, 300, 300) on conflict (mode) do nothing;
insert into wt_accounts (mode, enabled, balance, start_balance) values ('live', false, 0, 0) on conflict (mode) do nothing;

-- Preparazione giornaliera per titolo: livelli di ieri e 5 giorni, ATR, volume normale per fascia
create table if not exists wt_prep (
  day text not null,
  symbol text not null,
  data jsonb not null,
  created_at bigint not null,
  primary key (day, symbol)
);

-- Operazioni della strategia (Prova e Reale)
create table if not exists wt_positions (
  id bigserial primary key,
  mode text not null,
  day text not null,
  symbol text not null,
  side int not null,                 -- 1 long, -1 short
  status text not null default 'open',
  entry double precision not null,
  qty double precision not null,
  margin double precision not null,
  capital double precision,          -- capitale da usare al momento dell'entrata (per la % giornaliera)
  leverage double precision not null,
  init_stop double precision not null,
  unit double precision not null,
  best double precision not null,
  open_price double precision not null,
  move_pct double precision,
  level jsonb,                       -- livello più vicino { p, t }
  entry_slot int,                    -- minuto NY della candela da 15 min d'entrata (570 o 585)
  confirmed boolean,                 -- conferma volume + VWAP valutata?
  volx double precision,
  stale_done boolean not null default false,
  halved boolean not null default false,
  last_bar bigint,                   -- ultima candela da 1 min già controllata
  exit double precision,
  reason text,
  pnl double precision,
  fees double precision,
  opened_at bigint not null,
  closed_at bigint,
  exchange jsonb,                    -- solo Reale: orderId, positionId, risposte di Bitunix
  note text
);
alter table wt_positions add column if not exists capital double precision;
create index if not exists wt_positions_mode_day on wt_positions (mode, day);
create index if not exists wt_positions_open on wt_positions (status);

alter table wt_state enable row level security;
alter table wt_signals enable row level security;
alter table wt_context enable row level security;
alter table wt_subs enable row level security;
alter table wt_meta enable row level security;
alter table wt_accounts enable row level security;
alter table wt_prep enable row level security;
alter table wt_positions enable row level security;

-- ---------- Simulazione ----------
-- Archivio candele da 1 minuto Bitunix dei titoli della strategia: una riga per titolo e per giorno,
-- dalle 9:00 alle 16:30 di New York (450 minuti). data = base64(deflate(Float32 o[450] h[450] l[450] c[450] v[450])).
create table if not exists wt_bars (
  symbol text not null,
  day text not null,
  t0 bigint not null,          -- timestamp (ms) delle 9:00 di New York di quel giorno
  n int not null,              -- candele presenti (0 = Bitunix non ha dati per quel giorno)
  data text not null,
  created_at bigint not null,
  primary key (symbol, day)
);
create index if not exists wt_bars_day on wt_bars (day);

-- Impostazioni della strategia salvate con un nome (le stesse per Prova, Reale e Simulazione)
create table if not exists wt_presets (
  id bigserial primary key,
  name text not null,
  settings jsonb not null,
  is_default boolean not null default false,
  created_at bigint not null
);

alter table wt_bars enable row level security;
alter table wt_presets enable row level security;

-- ---------- Liquidazione e costi (non distruttivo) ----------
alter table wt_positions add column if not exists liq_price double precision;  -- prezzo di liquidazione in margine isolato
alter table wt_positions add column if not exists entry_bar bigint;            -- candela da 1 min del segnale d'entrata
alter table wt_positions add column if not exists funding double precision;    -- funding vero di Bitunix (Reale; negativo = pagato)

-- ---------- Uscite "Nessun progresso" e "Metà subito" (non distruttivo) ----------
alter table wt_positions add column if not exists half_done boolean;           -- metà posizione già chiusa
alter table wt_positions add column if not exists half_px double precision;    -- prezzo della metà chiusa
alter table wt_positions add column if not exists half_qty double precision;   -- quantità chiusa (0 = non riuscita su Bitunix)
alter table wt_positions add column if not exists np_done boolean;             -- controllo "nessun progresso" già fatto

-- ---------- Registro dei setup della pagina Range (server/range-alerts.js; non distruttivo) ----------
create table if not exists wt_range_trades (
  id text primary key,               -- titolo:id del setup
  symbol text not null,
  kind text not null,                -- falso | range | breakout
  variant text,                      -- limite | mercato (solo falso breakout)
  range_type text not null,          -- P | B
  side int not null,                 -- 1 long, -1 short
  with_impulse boolean not null,     -- nella direzione dell'impulso (true) o contro (false)
  fit text,                          -- contesto a 4 ore: a favore | contro | neutro
  grade text,                        -- voto di qualità A | B | C
  score int,
  valid boolean not null,            -- rischio/rendimento fino all'ultimo target almeno quello minimo
  created_at bigint not null,        -- chiusura della candela che ha fatto scattare il setup
  entry double precision not null,
  stop double precision not null,
  targets jsonb not null,            -- [{ p, frac, why }]
  rr double precision,
  status text not null,              -- pronto | in corso | target | stop | pareggio dopo Tn | scaduto | dati finiti
  fill_at bigint,
  exit_at bigint,
  r_gross double precision,          -- risultato in multipli del rischio, senza commissioni
  r_net double precision,            -- con le commissioni di Bitunix
  fees_r double precision,
  final boolean not null default false,
  data jsonb,                        -- motivi del voto, livelli settimanali
  updated_at bigint not null
);
create index if not exists wt_range_trades_created on wt_range_trades (created_at);
alter table wt_range_trades enable row level security;
