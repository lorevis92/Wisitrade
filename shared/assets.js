// Lista asset monitorati. "kind": crypto (dati Bitunix) o stock (dati Alpaca, sottostante USA).
// "perp": simbolo del perpetual su Bitunix. La disponibilità reale viene verificata a runtime
// dal Worker (endpoint trading_pairs): se un perp non esiste, l'asset viene comunque monitorato
// sul sottostante ma senza prezzo perp.
// "tier": 1 = principale (Contesto con modello migliore), 2 = secondario (modello economico).

export const CRYPTO = [
  ['BTC', 'Bitcoin', 1], ['ETH', 'Ethereum', 1], ['SOL', 'Solana', 1], ['XRP', 'XRP', 2],
  ['BNB', 'BNB', 2], ['DOGE', 'Dogecoin', 2], ['ADA', 'Cardano', 2], ['AVAX', 'Avalanche', 2],
  ['LINK', 'Chainlink', 2], ['SUI', 'Sui', 2], ['LTC', 'Litecoin', 2], ['DOT', 'Polkadot', 2],
  ['TRX', 'Tron', 2], ['NEAR', 'Near', 2],
].map(([symbol, name, tier]) => ({ symbol, name, tier, kind: 'crypto', perp: `${symbol}USDT`, ref: symbol === 'BTC' ? null : 'BTC' }))

export const STOCKS = [
  ['QQQ', 'Nasdaq 100', 1], ['SPY', 'S&P 500', 1],
  ['AAPL', 'Apple', 1], ['MSFT', 'Microsoft', 1], ['GOOGL', 'Alphabet', 1], ['AMZN', 'Amazon', 1],
  ['NFLX', 'Netflix', 1], ['NVDA', 'Nvidia', 1], ['META', 'Meta', 1], ['TSLA', 'Tesla', 1],
  ['AMD', 'AMD', 2], ['AVGO', 'Broadcom', 2], ['ORCL', 'Oracle', 2], ['CRM', 'Salesforce', 2],
  ['ADBE', 'Adobe', 2], ['INTC', 'Intel', 2], ['PLTR', 'Palantir', 2], ['COIN', 'Coinbase', 2],
  ['MSTR', 'Strategy', 2], ['HOOD', 'Robinhood', 2], ['UBER', 'Uber', 2], ['SHOP', 'Shopify', 2],
  ['PYPL', 'PayPal', 2], ['BABA', 'Alibaba', 2], ['JPM', 'JPMorgan', 2], ['V', 'Visa', 2],
  ['MA', 'Mastercard', 2], ['DIS', 'Disney', 2], ['WMT', 'Walmart', 2], ['COST', 'Costco', 2],
  ['MCD', "McDonald's", 2], ['BA', 'Boeing', 2], ['LLY', 'Eli Lilly', 2], ['UNH', 'UnitedHealth', 2],
  ['ARM', 'Arm', 2], ['MU', 'Micron', 2],
].map(([symbol, name, tier]) => ({ symbol, name, tier, kind: 'stock', perp: `${symbol}USDT`, ref: symbol === 'QQQ' ? null : 'QQQ' }))

export const ASSETS = [...CRYPTO, ...STOCKS]
export const ASSET_MAP = Object.fromEntries(ASSETS.map(a => [a.symbol, a]))

// Soglie alert
export const ALERT = {
  ALL: 75,        // segnale forte: notifica a tutti
  WATCH: 55,      // segnale medio: notifica solo a chi segue l'asset
  OPEN: 55,       // soglia minima per aprire un segnale
  COOLDOWN_MIN: 120, // non ri-notificare stesso asset+direzione entro 2h
}

// Durate iniziali mostrate finché non ci sono abbastanza segnali storici (n < 10)
export const DEFAULT_DURATION = {
  impulse: 'di solito 30–90 min',
  trend: 'di solito 1–3 h',
  orb: 'di solito fino alle 17:00–17:30 (CH)',
}

export const TYPE_LABEL = {
  impulse: 'Movimento forte',
  trend: 'Trend deciso',
  orb: 'Breakout apertura USA',
}
