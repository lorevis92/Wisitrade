// Finti per le prove: database Supabase in memoria (solo le parti usate dal server) e Bitunix (risposte HTTP per fetch).

// ---------- Supabase in memoria ----------
const PK = { wt_meta: ['key'], wt_accounts: ['mode'], wt_prep: ['day', 'symbol'], wt_presets: ['id'], wt_positions: ['id'] }
export function fakeDb(seed = {}) {
  const tables = {}
  const seq = {}
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map(r => ({ ...r }))
  const tbl = t => (tables[t] ||= [])
  const keyOf = (t, r) => (PK[t] || ['id']).map(k => r[k]).join('|')
  const builder = t => {
    const st = { op: 'select', filters: [], order: null, limit: null, range: null, single: null, rows: null, patch: null, returning: false, head: false, count: null }
    const b = {
      select(cols, opts) { if (st.op === 'select') st.op = 'select'; else st.returning = true; if (opts?.head) st.head = true; if (opts?.count) st.count = opts.count; return b },
      insert(rows) { st.op = 'insert'; st.rows = Array.isArray(rows) ? rows : [rows]; return b },
      upsert(rows) { st.op = 'upsert'; st.rows = Array.isArray(rows) ? rows : [rows]; return b },
      update(patch) { st.op = 'update'; st.patch = patch; return b },
      delete() { st.op = 'delete'; return b },
      eq(k, v) { st.filters.push(r => r[k] === v); return b },
      neq(k, v) { st.filters.push(r => r[k] !== v); return b },
      in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b },
      gte(k, v) { st.filters.push(r => r[k] >= v); return b },
      lte(k, v) { st.filters.push(r => r[k] <= v); return b },
      gt(k, v) { st.filters.push(r => r[k] > v); return b },
      lt(k, v) { st.filters.push(r => r[k] < v); return b },
      not() { return b },
      order(k, o = {}) { st.order = { k, asc: o.ascending !== false }; return b },
      limit(n) { st.limit = n; return b },
      range(a, z) { st.range = [a, z]; return b },
      maybeSingle() { st.single = 'maybe'; return b },
      single() { st.single = 'one'; return b },
      then(res, rej) { try { res(run()) } catch (e) { rej(e) } },
    }
    const run = () => {
      const T = tbl(t)
      const match = r => st.filters.every(f => f(r))
      if (st.op === 'insert' || st.op === 'upsert') {
        const out = []
        for (const r0 of st.rows) {
          const r = { ...r0 }
          if ((PK[t] || ['id'])[0] === 'id' && r.id === undefined) r.id = (seq[t] = (seq[t] || 1000) + 1)
          const k = keyOf(t, r), i = T.findIndex(x => keyOf(t, x) === k)
          if (i >= 0) {
            if (st.op === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
            T[i] = { ...T[i], ...r }; out.push(T[i])
          } else { T.push(r); out.push(r) }
        }
        return { data: st.returning ? out.map(x => ({ ...x })) : null, error: null }
      }
      if (st.op === 'update') { const rows = T.filter(match); for (const r of rows) Object.assign(r, st.patch); return { data: null, error: null } }
      if (st.op === 'delete') { tables[t] = T.filter(r => !match(r)); return { data: null, error: null } }
      let rows = T.filter(match).map(r => ({ ...r }))
      if (st.order) rows.sort((a, b) => (a[st.order.k] < b[st.order.k] ? -1 : a[st.order.k] > b[st.order.k] ? 1 : 0) * (st.order.asc ? 1 : -1))
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      if (st.limit) rows = rows.slice(0, st.limit)
      if (st.head) return { data: null, count: rows.length, error: null }
      if (st.single === 'maybe') return { data: rows[0] ?? null, error: null }
      if (st.single === 'one') return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } }
      return { data: rows, error: null }
    }
    return b
  }
  return { client: { from: builder }, tables }
}

// ---------- Bitunix finto (modalità HEDGE, come da documentazione API) ----------
// Una posizione per titolo e per lato; margine e leva per titolo, modificabili solo senza posizioni né ordini sul titolo.
// noApi = coppie che rifiutano tutto via API; noTpsl = coppie dove le chiamate tpsl separate (nuovo stop, modifica) sono rifiutate;
// attachSl = per ogni coppia, se lo stop dentro l'ordine viene davvero creato (default sì); tpslReadFails = lettura stop rifiutata
const API_MSG = 'This trading pair does not currently support trading via OpenAPI.'
export function fakeBitunix({ prices = {}, settings = {}, available = 1000, noApi = [], noTpsl = [], attachSl = {}, tpslReadFails = [] } = {}) {
  let idSeq = 5000
  const ex = { calls: [], positions: [], orders: [], tpsl: [], history: [], settings: { ...settings }, prices, available, clock: () => Date.now() }
  const set = sym => (ex.settings[sym] ||= { marginMode: 'CROSS', leverage: 10 })
  const busy = sym => ex.positions.some(p => p.symbol === sym) || ex.orders.some(o => o.symbol === sym)
  const ok = data => new Response(JSON.stringify({ code: 0, data, msg: 'Success' }), { status: 200, headers: { 'content-type': 'application/json' } })
  const err = (code, msg) => new Response(JSON.stringify({ code, data: null, msg }), { status: 200 })
  ex.fetch = async (url, init = {}) => {
    const u = new URL(url), path = u.pathname, q = Object.fromEntries(u.searchParams), body = init.body ? JSON.parse(init.body) : {}
    ex.calls.push({ path, q, body, method: init.method || 'GET' })
    const sym0 = body.symbol || q.symbol
    if (sym0 && noApi.includes(sym0) && (path.endsWith('/trade/place_order') || path.includes('/tpsl/'))) return err(10001, API_MSG)
    if (path.endsWith('/market/tickers')) return ok(Object.entries(ex.prices).map(([symbol, p]) => ({ symbol, lastPrice: String(p), last: String(p) })))
    if (path.endsWith('/futures/account')) return ok([{ available: String(ex.available), margin: '0', frozen: '0', crossUnrealizedPNL: '0', isolationUnrealizedPNL: '0' }])
    if (path.endsWith('/position/get_pending_positions')) return ok(ex.positions.filter(p => !q.symbol || p.symbol === q.symbol).map(p => ({ positionId: p.positionId, symbol: p.symbol, qty: String(p.qty), side: p.side > 0 ? 'LONG' : 'SHORT', avgOpenPrice: String(p.entry), marginMode: p.marginMode, leverage: p.leverage, liqPrice: '0', ctime: p.ctime, positionMode: 'HEDGE' })))
    if (path.endsWith('/trade/get_pending_orders')) return ok({ orderList: ex.orders.filter(o => !q.symbol || o.symbol === q.symbol) })
    if (path.endsWith('/account/get_leverage_margin_mode')) return ok({ symbol: q.symbol, marginCoin: 'USDT', ...set(q.symbol) })
    if (path.endsWith('/account/change_margin_mode')) { if (busy(body.symbol)) return err(20003, 'Existing positions or orders'); set(body.symbol).marginMode = body.marginMode; return ok(body) }
    if (path.endsWith('/account/change_leverage')) { if (busy(body.symbol)) return err(20003, 'Existing positions or orders'); set(body.symbol).leverage = body.leverage; return ok(body) }
    if (path.endsWith('/trade/place_order')) {
      const side = body.side === 'BUY' ? 1 : -1, qty = +body.qty, sym = body.symbol, s = set(sym)
      if (body.tradeSide === 'OPEN') {
        const cur = ex.positions.find(p => p.symbol === sym && p.side === side)
        if (cur) cur.qty += qty
        else {
          const pid = String(++idSeq)
          ex.positions.push({ positionId: pid, symbol: sym, side, qty, entry: ex.prices[sym] * (1 + side * 0.0005), marginMode: s.marginMode, leverage: s.leverage, ctime: ex.clock() + 150 })
          if (body.slPrice && attachSl[sym] !== false) ex.tpsl.push({ id: String(++idSeq), positionId: pid, symbol: sym, slPrice: +body.slPrice, qty: qty, via: 'ordine' })
        }
        return ok({ orderId: String(++idSeq), clientId: body.clientId })
      }
      const p = ex.positions.find(x => x.positionId === String(body.positionId))
      if (!p) return err(20001, 'position not exist')
      p.qty = +(p.qty - Math.min(qty, p.qty)).toFixed(8); if (p.qty <= 0) ex.positions = ex.positions.filter(x => x !== p)
      return ok({ orderId: String(++idSeq) })
    }
    if (path.includes('/tpsl/') && !path.endsWith('/get_pending_orders') && noTpsl.includes(sym0)) return err(10001, API_MSG)
    if (path.endsWith('/tpsl/get_pending_orders')) {
      if (tpslReadFails.includes(q.symbol)) return err(10001, API_MSG)
      return ok(ex.tpsl.filter(t => ex.positions.some(p => p.positionId === String(t.positionId)) && (!q.positionId || String(t.positionId) === q.positionId)).map(t => ({ id: t.id, positionId: t.positionId, symbol: t.symbol, slPrice: String(t.slPrice), slQty: String(t.qty) })))
    }
    if (path.endsWith('/tpsl/modify_order')) { const t = ex.tpsl.find(x => x.id === body.orderId); if (!t) return err(20001, 'order not exist'); t.slPrice = +body.slPrice; t.qty = +body.slQty; return ok({ orderId: t.id }) }
    if (path.endsWith('/tpsl/place_order')) { const id = String(++idSeq); ex.tpsl.push({ id, positionId: body.positionId, symbol: body.symbol, slPrice: +body.slPrice, qty: +body.slQty, via: 'tpsl' }); return ok({ orderId: id }) }
    if (path.endsWith('/trade/flash_close_position')) {
      const p = ex.positions.find(x => x.positionId === String(body.positionId))
      if (p) { const px = ex.prices[p.symbol] * (1 - p.side * 0.0005); ex.history.push({ positionId: p.positionId, symbol: p.symbol, closePrice: String(px), fee: String(-(p.qty * px * 0.0012)), funding: '0', realizedPNL: String(p.side * (px - p.entry) * p.qty) }) }
      ex.positions = ex.positions.filter(x => x.positionId !== String(body.positionId)); return ok(body)
    }
    if (path.endsWith('/position/get_history_positions')) return ok({ positionList: ex.history.filter(h => (!q.symbol || h.symbol === q.symbol) && (!q.positionId || h.positionId === q.positionId)) })
    return err(404, `finto: ${path} non previsto`)
  }
  ex.writes = () => ex.calls.filter(c => c.method === 'POST').map(c => `${c.path.split('/').slice(-2).join('/')}${c.body.symbol ? ' ' + c.body.symbol : ''}`)
  return ex
}
