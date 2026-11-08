// Orari della borsa USA (New York), con ora legale gestita automaticamente.
import { NY_FMT as NY, ny } from '../shared/time.js'

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

export { ny }
export const sessionKeyFn = () => t => ny(t).date
