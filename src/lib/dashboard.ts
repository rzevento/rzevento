export type GuestStatus = 'Confirmado' | 'Pendiente' | 'Canceló'
export type Guest = { id: string; name: string; company: string; email: string; phone: string; origin: string; invite: string; status: GuestStatus; checkedIn: boolean; confirmedAt?: string | null; whatsappSentAt?: string | null; invitationToken?: string | null }
export const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase()
export function summarize(guests: Guest[]) {
  return { total: guests.length, confirmed: guests.filter(g => g.status === 'Confirmado').length,
    pending: guests.filter(g => g.status === 'Pendiente').length, cancelled: guests.filter(g => g.status === 'Canceló').length,
    arrived: guests.filter(g => g.checkedIn).length, expected: guests.filter(g => g.status === 'Confirmado' && !g.checkedIn).length }
}
export function dashboardCsv(guests: Guest[]) {
  const rows = [['Invitado', 'Empresa', 'Origen', 'Correo', 'Celular', 'Invitación', 'Respuesta', 'Llegada'],
    ...guests.map(g => [g.name, g.company, g.origin, g.email, g.phone, g.invite, g.status, g.checkedIn ? 'Presente' : 'Sin llegada'])]
  return '\uFEFF' + rows.map(row => row.map(value => {
    const safe = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}

// Calendar buckets use the event timezone, independently of the viewer's device.
const eventDayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
export function confirmationDay(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = eventDayFormatter.formatToParts(date)
  const part = (name: string) => parts.find(p => p.type === name)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
export function dailyConfirmations(guests: Guest[], days: number | 'all' = 14, now = new Date()) {
  const today = confirmationDay(now)!
  const counts = new Map<string, number>()
  let withoutDate = 0
  for (const guest of guests) {
    if (guest.status !== 'Confirmado') continue
    const day = confirmationDay(guest.confirmedAt)
    if (!day) { withoutDate++; continue }
    if (day <= today) counts.set(day, (counts.get(day) || 0) + 1)
  }
  const first = days === 'all' ? [...counts.keys()].sort()[0] || today : shiftDay(today, -(Math.max(1, days) - 1))
  const series: { day: string; count: number }[] = []
  for (let day = first; day <= today; day = shiftDay(day, 1)) series.push({ day, count: counts.get(day) || 0 })
  return { series, today, todayCount: counts.get(today) || 0, withoutDate, total: series.reduce((n, d) => n + d.count, 0) }
}
