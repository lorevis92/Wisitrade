// Exchange su cui può operare la strategia Apertura USA (Prova e Reale). Ogni exchange è un conto a sé.
// Chiave del conto (colonna `mode` di wt_accounts e wt_positions, e chiavi di wt_meta come capital:<chiave>, claim:<chiave>:…):
//  - Bitunix (il primo exchange): 'paper' e 'live', come prima, così i dati esistenti restano la sezione Bitunix;
//  - gli altri: '<tipo>:<exchange>', per esempio 'paper:bitget' e 'live:bitget'.
// Per aggiungere un exchange: una voce qui, un adattatore in server/exchanges/ e le due righe di wt_accounts (supabase/schema.sql).
export const EXCHANGES = {
  bitunix: { id: 'bitunix', name: 'Bitunix' },
  bitget: { id: 'bitget', name: 'Bitget' },
}
export const EX_LIST = Object.keys(EXCHANGES)
export const DEFAULT_EX = 'bitunix'
export const KINDS = ['paper', 'live']

export const isEx = ex => EX_LIST.includes(ex)
export const acctKey = (kind, ex = DEFAULT_EX) => (ex === DEFAULT_EX ? kind : `${kind}:${ex}`)
export const kindOf = key => String(key || '').split(':')[0]
export const exOf = key => String(key || '').split(':')[1] || DEFAULT_EX
export const isLive = key => kindOf(key) === 'live'
export const exName = ex => EXCHANGES[ex]?.name || ex
// "Prova Bitget", "Reale Bitunix"
export const acctName = key => `${isLive(key) ? 'Reale' : 'Prova'} ${exName(exOf(key))}`
export const ACCOUNT_KEYS = EX_LIST.flatMap(ex => KINDS.map(k => acctKey(k, ex)))
// suffisso per le chiavi di wt_meta per exchange (Bitunix senza suffisso: chiavi di prima)
export const exSuffix = ex => (ex === DEFAULT_EX ? '' : `:${ex}`)
// giorno della preparazione in wt_prep: ogni exchange ha la sua (livelli e volatilità dalle sue candele)
export const prepDay = (ex, day) => (ex === DEFAULT_EX ? day : `${day}@${ex}`)
// indirizzo della pagina della strategia per un conto
export const acctUrl = key => `/strategia?mode=${kindOf(key)}&ex=${exOf(key)}`
