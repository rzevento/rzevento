import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { dailyConfirmations } from '../lib/dashboard'
import type { Guest } from '../lib/dashboard'
import './DailyConfirmations.css'

const labelDate = (day: string, full = false) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', {
  timeZone: 'America/Mexico_City', day: 'numeric', month: full ? 'long' : 'short', ...(full ? { year: 'numeric' as const } : {}),
})
export default function DailyConfirmations({ guests, selectedDay, onSelectDay }: {
  guests: Guest[]; selectedDay: string | null; onSelectDay: (day: string | null) => void
}) {
  const [period, setPeriod] = useState<number | 'all'>(14)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  const { series, today, todayCount, total, withoutDate } = dailyConfirmations(guests, period, now)
  const max = Math.max(2, Math.ceil(Math.max(0, ...series.map(d => d.count)) / 2) * 2)
  return <section className="rz-card rz-daily" aria-labelledby="daily-confirmations-title">
    <div className="rz-card-title"><div><h3 id="daily-confirmations-title"><CalendarDays size={17} /> Confirmados por día</h3><p>Así avanza la confirmación de tus invitados</p></div><label className="rz-daily-period">Periodo<select aria-label="Periodo de confirmaciones" value={period} onChange={e => { setPeriod(e.target.value === 'all' ? 'all' : Number(e.target.value)); onSelectDay(null) }}><option value={7}>Últimos 7 días</option><option value={14}>Últimos 14 días</option><option value={30}>Últimos 30 días</option><option value="all">Todo el periodo</option></select></label></div>
    <div className="rz-daily-summary"><span><strong>{todayCount}</strong> confirmados hoy</span><span><strong>{total}</strong> en el periodo</span><small>Actualización automática cada minuto</small></div>
    <div className="rz-daily-scroll" role="region" aria-label="Gráfica diaria de confirmaciones; desliza para ver todas las fechas" tabIndex={0}>
      <div className="rz-daily-plot" style={{ minWidth: Math.max(420, series.length * 49) }}>
        <div className="rz-daily-grid" aria-hidden="true"><span>{max}</span><span>{Math.floor(max / 2)}</span><span>0</span></div>
        <div className="rz-daily-bars">{series.map(({ day, count }) => <button key={day} className={`rz-daily-day ${day === today ? 'today' : ''}`} aria-pressed={selectedDay === day} aria-label={`${labelDate(day, true)}: ${count} confirmados${day === today ? ', hoy' : ''}`} title={`${labelDate(day, true)} · ${count} confirmados`} onClick={() => onSelectDay(selectedDay === day ? null : day)}>
          <span className="rz-daily-column"><span className="rz-daily-bar" style={{ height: `${count / max * 100}%` }}><strong>{count}</strong></span></span>
          <span className="rz-daily-label">{labelDate(day)}<small>{day === today ? 'Hoy' : '\u00a0'}</small></span>
        </button>)}</div>
      </div>
    </div>
    {!total && <p className="rz-daily-empty">Todavía no hay confirmaciones con fecha en este periodo.</p>}
    <p className="rz-footnote">Hora de Ciudad de México. Selecciona un día para ver sus invitados. Se cuentan los confirmados actuales según su última confirmación; si alguien cancela o vuelve a confirmar, la gráfica se ajusta.{withoutDate > 0 && ` ${withoutDate} ${withoutDate === 1 ? 'confirmado sin fecha registrada queda fuera' : 'confirmados sin fecha registrada quedan fuera'} de la gráfica.`}</p>
  </section>
}
