// Orari di New York usati sia dal server sia dalla simulazione (ora legale gestita automaticamente).
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
export const NY_FMT = NY

// Data e minuto NY di un timestamp qualsiasi (con cache dell'offset per ora)
const off = new Map()
export function ny(t) {
  const h = Math.floor(t / 3600000)
  let o = off.get(h)
  if (o === undefined) {
    const p = Object.fromEntries(NY.formatToParts(new Date(h * 3600000)).map(x => [x.type, x.value]))
    o = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - h * 3600000
    off.set(h, o)
  }
  const l = t + o
  return { date: new Date(l).toISOString().slice(0, 10), min: Math.floor((l % 864e5) / 60000) }
}

// Timestamp di un minuto NY di una data (es. nyTs('2026-04-15', 540) = 9:00 di New York)
export function nyTs(date, min) {
  let t = Date.parse(date + 'T00:00:00Z') + min * 60000 + 4 * 3600000
  for (let i = 0; i < 3; i++) {
    const n = ny(t)
    const diff = (n.date === date ? 0 : n.date < date ? 1440 : -1440) + min - n.min
    if (!diff) break
    t += diff * 60000
  }
  return t
}

export const weekdayOf = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6 }
export const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
