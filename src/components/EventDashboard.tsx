import { useState } from 'react'
import { AlertCircle, ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, Clock3, RefreshCw, Search, Users, X } from 'lucide-react'
import { confirmationDay, dashboardCsv, normalize, summarize } from '../lib/dashboard'
import type { Guest, GuestStatus } from '../lib/dashboard'
import DailyConfirmations from './DailyConfirmations'
import './EventDashboard.css'

type Props = { canExport?: boolean; guests: Guest[]; loading: boolean; error: boolean; refreshing: boolean; updatedAt: number; demo: boolean; onRefresh: () => void }
const states: GuestStatus[] = ['Confirmado', 'Pendiente', 'Canceló']
const stateNames = ['Confirmados', 'Sin respuesta', 'Cancelaron']
const colors = ['#397261', '#bc8938', '#aa6970']
const pct = (n: number, total: number) => total ? Math.round(n / total * 100) : 0
export default function EventDashboard({ canExport = false, guests, loading, error, refreshing, updatedAt, demo, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<GuestStatus | 'all'>('all')
  const [arrival, setArrival] = useState('all')
  const [invitation, setInvitation] = useState('all')
  const [page, setPage] = useState(0)
  const [confirmedDay, setConfirmedDay] = useState<string | null>(null)
  const scoped = guests
  const totals = summarize(scoped)
  const counts = [totals.confirmed, totals.pending, totals.cancelled]
  const filtered = scoped.filter(g => (status === 'all' || g.status === status)
    && (arrival === 'all' || (arrival === 'yes' ? g.checkedIn : !g.checkedIn))
    && (invitation === 'all' || g.invite === invitation)
    && (!confirmedDay || (g.status === 'Confirmado' && confirmationDay(g.confirmedAt) === confirmedDay))
    && normalize([g.name, g.company, g.origin, g.email, g.phone].join(' ')).includes(normalize(search)))
  const pages = Math.max(1, Math.ceil(filtered.length / 15)), currentPage = Math.min(page, pages - 1)
  const hasFilters = Boolean(confirmedDay) || status !== 'all' || arrival !== 'all' || invitation !== 'all' || Boolean(search)
  function clear() { setStatus('all'); setArrival('all'); setInvitation('all'); setSearch(''); setConfirmedDay(null); setPage(0) }
  function exportRows() {
    if (!canExport) return
    const url = URL.createObjectURL(new Blob([dashboardCsv(filtered)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rz-dashboard-invitados.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  if (loading) return <section className="rz-dash rz-message" role="status"><RefreshCw size={22} /><h2>Cargando el resumen…</h2><p>Consultando invitados, respuestas y llegadas.</p></section>
  if (error && !updatedAt) return <section className="rz-dash rz-message" role="alert"><AlertCircle size={24} /><h2>No pudimos cargar los datos</h2><p>Revisa tu conexión o sesión e intenta de nuevo.</p><button onClick={onRefresh} disabled={refreshing}>Volver a intentar</button></section>
  return <section className="rz-dash">
    <div className="rz-title"><div><p className="rz-kicker">RZ EVENTOS / RESUMEN</p><h2>Tu evento, de un vistazo.</h2><p>Invitaciones, respuestas y asistencia en un mismo lugar.</p></div><button className="rz-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} />{refreshing ? 'Actualizando…' : 'Actualizar'}</button></div>
    <div className="rz-meta"><span><i />{demo ? 'Vista de demostración · datos de ejemplo' : 'Datos del evento activo'}</span><span>{updatedAt ? `Última consulta: ${new Date(updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
    {error && <div className="rz-warning" role="alert">No se pudo actualizar. Estás viendo la última consulta disponible.<button onClick={onRefresh}>Reintentar</button></div>}
    <div className="rz-metrics">
      {[{ label: 'Invitados', value: totals.total, detail: 'Personas en la lista', icon: Users, cls: '', action: () => { setStatus('all'); setArrival('all') } },
        { label: 'Confirmados', value: totals.confirmed, detail: `${pct(totals.confirmed, totals.total)}% de la lista`, icon: CheckCircle2, cls: 'confirmed', action: () => { setStatus('Confirmado'); setArrival('all') } },
        { label: 'Sin respuesta', value: totals.pending, detail: `${pct(totals.pending, totals.total)}% por confirmar`, icon: Clock3, cls: 'pending', action: () => { setStatus('Pendiente'); setArrival('all') } },
        { label: 'Ya llegaron', value: totals.arrived, detail: `${totals.expected} confirmados por llegar`, icon: CheckCircle2, cls: 'arrived', action: () => { setStatus('all'); setArrival('yes') } }].map(item => <button className={`rz-metric ${item.cls}`} key={item.label} onClick={() => { item.action(); setInvitation('all'); setSearch(''); setConfirmedDay(null); setPage(0) }}><span>{item.label}<item.icon size={18} /></span><strong>{item.value}</strong><small>{item.detail}</small></button>)}
    </div>
    <div className="rz-charts">
      <article className="rz-card"><div className="rz-card-title"><div><h3>¿Quiénes han respondido?</h3><p>Distribución de todos los invitados</p></div><span className="rz-tag">Respuesta</span></div><div className="rz-response"><div className="rz-donut" role="img" aria-label={`${totals.confirmed} confirmados, ${totals.pending} sin respuesta, ${totals.cancelled} cancelaron`} style={{ background: totals.total ? `conic-gradient(${colors[0]} 0 ${totals.confirmed / totals.total * 100}%, ${colors[1]} 0 ${(totals.confirmed + totals.pending) / totals.total * 100}%, ${colors[2]} 0 100%)` : '#e9e7e2' }}><div><strong>{totals.total}</strong><small>invitados</small></div></div><div className="rz-legend">{states.map((s, i) => <button key={s} aria-pressed={status === s} onClick={() => { setStatus(status === s ? 'all' : s); setArrival('all'); setInvitation('all'); setSearch(''); setConfirmedDay(null); setPage(0) }}><i style={{ background: colors[i] }} /><span>{stateNames[i]}</span><strong>{counts[i]}</strong><small>{pct(counts[i], totals.total)}%</small></button>)}</div></div><p className="rz-footnote">Confirmados + sin respuesta + cancelaron = {totals.total}. La llegada se cuenta por separado.</p></article>
      <article className="rz-card"><div className="rz-card-title"><div><h3>Seguimiento de invitaciones</h3><p>Envíos registrados por correo o WhatsApp</p></div><span className="rz-tag">Invitaciones</span></div><div className="rz-delivery">{['Enviada', 'Pendiente', 'Rebotó'].map((value, i) => {
        const count = guests.filter(g => g.invite === value).length
        return <button key={value} aria-pressed={invitation === value} onClick={() => { setInvitation(invitation === value ? 'all' : value); setStatus('all'); setArrival('all'); setSearch(''); setConfirmedDay(null); setPage(0) }}><span>{['Enviadas', 'Sin envío registrado', 'Rebotadas'][i]}<strong>{count} <small>{pct(count, guests.length)}%</small></strong></span><div className="rz-track"><div style={{ width: `${pct(count, guests.length)}%`, background: ['#526c83', '#bdac89', '#aa6970'][i] }} /></div></button>
      })}</div><p className="rz-footnote">El envío registrado no garantiza la entrega ni la lectura. Selecciona una barra para ver a los invitados.</p></article>
    </div>
    <DailyConfirmations guests={guests} selectedDay={confirmedDay} onSelectDay={day => {
      setConfirmedDay(day); setStatus(day ? 'Confirmado' : 'all'); setArrival('all'); setInvitation('all'); setSearch(''); setPage(0)
    }} />
      <section className="rz-card rz-detail"><div className="rz-card-title"><div><h3>Detalle de invitados <span className="rz-count">{filtered.length}</span></h3><p>Consulta y filtra la lista completa del evento</p></div>{canExport && <button className="rz-button" onClick={exportRows} disabled={!filtered.length}><ArrowDownToLine size={15} /> Exportar filtrados</button>}</div>
        <div className="rz-filters"><label className="rz-search"><Search size={16} /><input aria-label="Buscar invitados" placeholder="Nombre, empresa o contacto…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label><select aria-label="Filtrar respuesta" value={status} onChange={e => { setStatus(e.target.value as GuestStatus | 'all'); setPage(0) }}><option value="all">Todas las respuestas</option>{states.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filtrar llegada" value={arrival} onChange={e => { setArrival(e.target.value); setPage(0) }}><option value="all">Todas las llegadas</option><option value="yes">Ya llegaron</option><option value="no">Sin llegada</option></select><select aria-label="Filtrar invitación" value={invitation} onChange={e => { setInvitation(e.target.value); setPage(0) }}><option value="all">Todas las invitaciones</option><option value="Enviada">Enviadas</option><option value="Pendiente">Sin envío registrado</option><option value="Rebotó">Rebotadas</option></select></div>
        <div className="rz-result-meta" aria-live="polite"><span>{filtered.length} de {scoped.length} invitados{confirmedDay && ` · Confirmados el ${new Date(confirmedDay + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' })}`}</span>{hasFilters && <button onClick={clear}><X size={13} /> Limpiar filtros</button>}</div>
        <div className="rz-table-wrap"><table><caption className="rz-sr-only">Invitados del evento con los filtros seleccionados</caption><thead><tr><th>Invitado / contacto</th><th>Empresa / origen</th><th>Invitación</th><th>Respuesta</th><th>Llegada</th></tr></thead><tbody>{filtered.slice(currentPage * 15, (currentPage + 1) * 15).map(g => <tr key={g.id}><td><strong>{g.name}</strong><small>{g.email || g.phone || 'Sin contacto'}</small></td><td>{g.company || 'Sin empresa'}<small>{g.origin || 'Sin origen'}</small></td><td><span className="rz-invite">{g.invite}</span></td><td><span className={`rz-badge rz-state-${states.indexOf(g.status)}`}>{g.status}</span></td><td>{g.checkedIn ? <span className="rz-present"><CheckCircle2 size={13} /> Presente</span> : <span className="rz-muted">Sin llegada</span>}</td></tr>)}</tbody></table>{!filtered.length && <div className="rz-empty"><Users size={25} /><h3>{guests.length ? 'Sin coincidencias' : 'Tu lista está vacía'}</h3><p>{guests.length ? 'Prueba con otros filtros o una búsqueda diferente.' : 'Agrega invitados desde la sección Invitados para comenzar.'}</p>{hasFilters && <button onClick={clear}>Limpiar filtros</button>}</div>}</div>
        <div className="rz-pagination"><span>{filtered.length ? `${currentPage * 15 + 1}–${Math.min((currentPage + 1) * 15, filtered.length)} de ${filtered.length}` : '0 resultados'}</span><div><button aria-label="Página anterior" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {pages}</span><button aria-label="Página siguiente" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
      </section>
    <p className="rz-endnote">Se cuentan invitados individuales; no incluye acompañantes. Las tarjetas y gráficas resumen todo el evento; los filtros aplican al detalle y su exportación.</p>
  </section>
}
