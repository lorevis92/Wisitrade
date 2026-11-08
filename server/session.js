// Orari della borsa USA (New York), con ora legale gestita automaticamente.
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })

export const OPEN_MIN = 570   // 9:30
export const CLOSE_MIN = 960  // 16:00

export function nyInfo(ts = Date.now()) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ts)).map(x => [x.type, x.value]))
  const minutes = (Number(p.hour) % 24) * 60 + Number(p.minute)
  const date = `${p.year}-${p.month}-${p.day}`
  const isWeekday = !['Sat', 'Sun'].includes(p.weekday)
  const openTs = ts - (minutes - OPEN_MIN) * 60000 - (ts % 60000)
  return {
    date, minutes, isWeekday,
    inSession: isWeekday && minutes >= OPEN_MIN && minutes < CLOSE_MIN,
    orbWindow: isWeekday && minutes >= 585 && minutes < 690,
    openTs,
  }
}

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

export const sessionKeyFn = () => t => ny(t).date
