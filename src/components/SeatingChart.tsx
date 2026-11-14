import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Download, Printer, Search, Sparkles, UserMinus, X } from 'lucide-react'
import { normalize } from '../lib/dashboard'
import type { Guest } from '../lib/dashboard'
import { SEATS_PER_TABLE, applyChanges, autoAssign, seatingCsv, seatingPlan } from '../lib/seating'
import type { SeatAssignments, SeatChange, SeatingBase } from '../lib/seating'
import { getSeatAssignments, saveSeatAssignments } from '../lib/supabase'
import './SeatingChart.css'

type Props = { guests: Guest[]; guestsLoading: boolean; guestsError: boolean; canEdit: boolean; demo: boolean; event?: { name: string; detail: string } }
const initials = (name: string) => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
/** Aclaración junto al nombre cuando no es un confirmado normal. */
const statusNote = (guest: Guest) => guest.status === 'Canceló' ? (guest.checkedIn ? 'Canceló, pero llegó' : 'Canceló') : guest.status === 'Pendiente' ? 'Sin respuesta' : ''

function saveErrorMessage(error: { message?: string; code?: string }) {
  const message = error.message || ''
  if (error.code === '42501' || message.includes('administradores')) return 'Solo los administradores pueden asignar mesas.'
  if (message.includes('ya tiene 8')) return `${message}. Actualiza el croquis y elige otra mesa.`
  if (error.code === 'PGRST202' || message.includes('assign_guest_tables')) return 'Falta activar el croquis en Supabase (migración de mesas).'
  return 'No pudimos guardar la mesa. Inténtalo de nuevo.'
}

export default function SeatingChart({ guests, guestsLoading, guestsError, canEdit, demo, event }: Props) {
  const queryClient = useQueryClient()
  const seatsQuery = useQuery({
    queryKey: ['seat-assignments'],
    queryFn: async (): Promise<SeatAssignments> => {
      const result = await getSeatAssignments()
      if (result.error) throw result.error
      return result.data ?? queryClient.getQueryData<SeatAssignments>(['seat-assignments']) ?? {}
    },
    refetchInterval: demo ? false : 30_000,
    staleTime: demo ? Infinity : 0,
    retry: false,
  })
  const assignments = seatsQuery.data ?? {}
  const [base, setBase] = useState<SeatingBase>('active')
  const [selected, setSelected] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const plan = seatingPlan(guests, assignments, base)
  const selectedTable = selected ? plan.tables[selected - 1] : undefined
  const openTables = plan.tables.filter(table => table.guests.length < SEATS_PER_TABLE)
  const freeSeats = openTables.reduce((total, table) => total + SEATS_PER_TABLE - table.guests.length, 0)
  const unassigned = plan.unassigned.filter(guest => normalize(`${guest.name} ${guest.company} ${guest.email}`).includes(normalize(search)))
  const missingSetup = seatsQuery.isError && /seat_assignments|PGRST205|42P01/.test(`${(seatsQuery.error as { code?: string })?.code} ${seatsQuery.error?.message}`)

  async function save(changes: SeatChange[], success: string) {
    if (!changes.length || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await saveSeatAssignments(changes)
      if (result.error) { setError(saveErrorMessage(result.error)); if (!demo) void seatsQuery.refetch(); return }
      queryClient.setQueryData<SeatAssignments>(['seat-assignments'], current => applyChanges(current || {}, changes))
      if (!result.demo) await queryClient.invalidateQueries({ queryKey: ['seat-assignments'] })
      setNotice(success)
    } catch {
      setError('No pudimos guardar la mesa. Revisa tu conexión.')
    } finally {
      setBusy(false)
    }
  }
  function assign(guest: Guest, tableNumber: number | null) {
    const target = tableNumber ? plan.tables[tableNumber - 1] : null
    if (target && target.guests.length >= SEATS_PER_TABLE) { setError(`La mesa ${tableNumber} ya tiene ${SEATS_PER_TABLE} personas.`); return }
    void save([{ guestId: guest.id, tableNumber }], tableNumber ? `${guest.name} quedó en la mesa ${tableNumber}.` : `${guest.name} quedó sin mesa.`)
  }
  function seatEveryone() {
    const changes = autoAssign(plan.unassigned, plan.tables)
    if (!changes.length) { setError('No hay lugares libres para acomodar a más invitados.'); return }
    const left = plan.unassigned.length - changes.length
    if (!window.confirm(`Se acomodarán ${changes.length} invitados sin mesa en los lugares libres, juntando a las personas de la misma empresa. Nadie que ya tenga mesa se moverá. ¿Continuar?`)) return
    void save(changes, left > 0 ? `Se acomodaron ${changes.length} invitados. ${left} siguen sin mesa porque ya no hay lugares libres.` : `Se acomodaron ${changes.length} invitados.`)
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([seatingCsv(plan.tables, plan.unassigned)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'croquis-mesas-familias-empresarias.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const tableOptions = (exclude?: number) => openTables.filter(table => table.number !== exclude)
    .map(table => <option key={table.number} value={table.number}>Mesa {table.number} · {SEATS_PER_TABLE - table.guests.length} {SEATS_PER_TABLE - table.guests.length === 1 ? 'lugar libre' : 'lugares libres'}</option>)

  const guestParts = [
    plan.fullTables ? `${plan.fullTables} ${plan.fullTables === 1 ? 'mesa completa' : 'mesas completas'}` : '',
    plan.remainder ? `${plan.fullTables ? '1' : '1 mesa'} con ${plan.remainder} ${plan.remainder === 1 ? 'persona' : 'personas'}` : '',
  ].filter(Boolean)
  const extraText = plan.extraTables ? `${plan.extraTables} ${plan.extraTables === 1 ? 'mesa extra' : 'mesas extra'} de ${SEATS_PER_TABLE} completa${plan.extraTables === 1 ? '' : 's'}` : ''
  const parts = [...guestParts, extraText].filter(Boolean)
  const breakdown = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}.` : parts.length ? `${parts[0]}.` : 'Aún no hay invitados para sentar.'

  if (guestsLoading || (seatsQuery.isPending && !demo)) return <section className="dashboard seating-page"><p className="muted" role="status">Cargando croquis…</p></section>
  if (guestsError) return <section className="dashboard seating-page"><p className="form-error" role="alert">No pudimos cargar la lista de invitados. Revisa tu conexión.</p></section>

  return <section className="dashboard seating-page">
    <div className="page-heading">
      <div><p className="eyebrow orange">Croquis del evento</p><h2>Distribución de mesas</h2><p className="muted">Mesas de {SEATS_PER_TABLE} personas. Elige una mesa para ver quién está sentado ahí y asignar lugares.</p></div>
      <div className="page-actions seating-actions">
        <button className="row-action" onClick={() => window.print()} disabled={!plan.tableCount && !plan.extraTables}><Printer size={14} /> Imprimir croquis</button>
        <button className="row-action" onClick={exportCsv} disabled={!plan.tableCount}><Download size={14} /> Descargar por mesa</button>
        {canEdit && <button className="button button-orange small" disabled={busy || !plan.unassigned.length || missingSetup} onClick={seatEveryone}><Sparkles size={16} /> Acomodar automáticamente</button>}
      </div>
    </div>

    {missingSetup && <p className="seating-alert" role="alert"><AlertCircle size={16} /> El croquis todavía no está activado en Supabase. Aplica la migración <code>20261110120000_seating_chart.sql</code> para poder guardar las mesas.</p>}
    {seatsQuery.isError && !missingSetup && <p className="seating-alert" role="alert"><AlertCircle size={16} /> No pudimos cargar las mesas asignadas. <button className="text-button" onClick={() => void seatsQuery.refetch()}>Reintentar</button></p>}

    <div className="seating-stats">
      <div className="panel seating-stat seating-stat-main">
        <span>Mesas necesarias</span>
        <strong>{plan.totalTables}</strong>
        <small>{plan.people} {plan.people === 1 ? 'invitado' : 'invitados'} ÷ {SEATS_PER_TABLE} por mesa = {plan.needed} {plan.needed === 1 ? 'mesa' : 'mesas'}{plan.extraTables ? ` + ${plan.extraTables} extra` : ''}. {breakdown}</small>
        <div className="seating-base" role="radiogroup" aria-label="Quiénes cuentan para calcular las mesas">
          <button role="radio" aria-checked={base === 'active'} className={base === 'active' ? 'active' : ''} onClick={() => setBase('active')}>Confirmados y sin respuesta</button>
          <button role="radio" aria-checked={base === 'confirmed'} className={base === 'confirmed' ? 'active' : ''} onClick={() => setBase('confirmed')}>Solo confirmados</button>
        </div>
      </div>
      <div className="panel seating-stat"><span>Con mesa</span><strong>{plan.assigned}</strong><small>de {plan.tableCount * SEATS_PER_TABLE} lugares en {plan.tableCount} {plan.tableCount === 1 ? 'mesa' : 'mesas'}</small></div>
      <div className="panel seating-stat"><span>Sin mesa</span><strong>{plan.unassigned.length}</strong><small>{freeSeats} {freeSeats === 1 ? 'lugar libre' : 'lugares libres'}</small></div>
    </div>

    {error && <p className="form-error seating-feedback" role="alert">{error}</p>}
    {notice && <p className="seating-feedback seating-notice" role="status">{notice}</p>}

    <div className="seating-layout">
      <div className="panel seating-floor">
        <div className="seating-floor-head"><h3>Salón</h3><div className="seating-legend"><span><i className="seat taken" /> Ocupado</span><span><i className="seat" /> Libre</span></div></div>
        {plan.tableCount || plan.extraTables ? <div className="seating-grid">
          {plan.tables.map(table => {
            const count = table.guests.length
            const cancelled = table.guests.filter(guest => guest.status === 'Canceló' && !guest.checkedIn).length
            return <button key={table.number} className={`seat-table${selected === table.number ? ' selected' : ''}${count >= SEATS_PER_TABLE ? ' full' : ''}`} aria-pressed={selected === table.number} aria-label={`Mesa ${table.number}: ${count} de ${SEATS_PER_TABLE} lugares ocupados${cancelled ? `, ${cancelled} canceló` : ''}`} onClick={() => setSelected(current => current === table.number ? null : table.number)}>
              <span className="seat-ring" aria-hidden="true">
                {Array.from({ length: SEATS_PER_TABLE }, (_, index) => <i key={index} className={`seat${index < count ? ' taken' : ''}${index >= count - cancelled && index < count ? ' warn' : ''}`} style={{ '--i': index } as CSSProperties} />)}
                <span className="seat-top"><strong>{table.number}</strong><small>{count}/{SEATS_PER_TABLE}</small></span>
              </span>
            </button>
          })}
          {Array.from({ length: plan.extraTables }, (_, index) => <div key={`extra-${index}`} className="seat-table full extra" role="img" aria-label={`Mesa extra: ${SEATS_PER_TABLE} de ${SEATS_PER_TABLE} lugares, completa`}>
            <span className="seat-ring" aria-hidden="true">
              {Array.from({ length: SEATS_PER_TABLE }, (_, seat) => <i key={seat} className="seat taken" style={{ '--i': seat } as CSSProperties} />)}
              <span className="seat-top"><strong>Extra</strong><small>{SEATS_PER_TABLE}/{SEATS_PER_TABLE}</small></span>
            </span>
          </div>)}
        </div> : <p className="muted seating-empty">Agrega invitados para generar las mesas.</p>}
      </div>

      <aside className="seating-side">
        {selectedTable && <div className="panel seating-detail">
          <div className="seating-detail-head"><div><p className="eyebrow orange">Mesa {selectedTable.number}</p><h3>{selectedTable.guests.length} de {SEATS_PER_TABLE} lugares</h3></div><button className="modal-close" aria-label="Cerrar mesa" onClick={() => setSelected(null)}><X size={18} /></button></div>
          {selectedTable.guests.length ? <ul className="seating-list">{selectedTable.guests.map(guest => <li key={guest.id}>
            <span className="table-avatar" aria-hidden="true">{initials(guest.name)}</span>
            <div><strong>{guest.name}</strong><small>{guest.company}{guest.status === 'Canceló' && guest.checkedIn ? <em> · Canceló, pero llegó</em> : guest.status !== 'Confirmado' && <em className={guest.status === 'Canceló' ? 'warn' : ''}> · {guest.status === 'Canceló' ? 'Canceló' : 'Sin respuesta'}</em>}</small></div>
            {canEdit && <div className="seating-row-actions">
              <select aria-label={`Mover a ${guest.name} a otra mesa`} disabled={busy || missingSetup} value="" onChange={e => assign(guest, Number(e.target.value))}><option value="" disabled>Mover…</option>{tableOptions(selectedTable.number)}</select>
              <button className="icon-only" disabled={busy || missingSetup} aria-label={`Quitar a ${guest.name} de la mesa`} title="Quitar de la mesa" onClick={() => assign(guest, null)}><UserMinus size={15} /></button>
            </div>}
          </li>)}</ul> : <p className="muted">Mesa vacía. {canEdit ? 'Elige invitados de la lista “Sin mesa”.' : ''}</p>}
        </div>}

        <div className="panel seating-unassigned">
          <div className="seating-detail-head"><div><p className="eyebrow">Sin mesa</p><h3>{plan.unassigned.length} {plan.unassigned.length === 1 ? 'invitado' : 'invitados'}</h3></div></div>
          {plan.unassigned.length > 0 && <label className="search-box seating-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar invitado o empresa" aria-label="Buscar invitado sin mesa" /></label>}
          {plan.unassigned.length === 0 ? <p className="muted">{plan.people ? 'Todos los invitados tienen mesa.' : 'No hay invitados por sentar.'}</p>
            : unassigned.length === 0 ? <p className="muted">Sin resultados.</p>
            : <ul className="seating-list">{unassigned.map(guest => <li key={guest.id}>
              <span className="table-avatar" aria-hidden="true">{initials(guest.name)}</span>
              <div><strong>{guest.name}</strong><small>{guest.company}{statusNote(guest) && <em> · {statusNote(guest)}</em>}</small></div>
              {canEdit && (selectedTable && selectedTable.guests.length < SEATS_PER_TABLE
                ? <button className="row-action" disabled={busy || missingSetup} onClick={() => assign(guest, selectedTable.number)}>A mesa {selectedTable.number}</button>
                : <select aria-label={`Asignar mesa a ${guest.name}`} disabled={busy || missingSetup || !openTables.length} value="" onChange={e => assign(guest, Number(e.target.value))}><option value="" disabled>{openTables.length ? 'Asignar…' : 'Sin lugares'}</option>{tableOptions()}</select>)}
            </li>)}</ul>}
        </div>
        {!canEdit && <p className="muted seating-readonly">Solo los administradores pueden cambiar las mesas.</p>}
      </aside>
    </div>
    {createPortal(<SeatingPrintSheet plan={plan} event={event} />, document.body)}
  </section>
}

/** Hoja para imprimir: solo se ve al imprimir (ver SeatingChart.css). */
function SeatingPrintSheet({ plan, event }: { plan: ReturnType<typeof seatingPlan>; event?: Props['event'] }) {
  const printedAt = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' })
  return <div className="seating-print" aria-hidden="true">
    <header className="seating-print-head">
      <div><p>Croquis del evento</p><h1>{event?.name || 'Distribución de mesas'}</h1>{event?.detail && <span>{event.detail}</span>}</div>
      <div className="seating-print-summary"><strong>{plan.totalTables}</strong> {plan.totalTables === 1 ? 'mesa' : 'mesas'} de {SEATS_PER_TABLE}<br />{plan.assigned} con mesa · {plan.unassigned.length} sin mesa<br /><small>Impreso el {printedAt}</small></div>
    </header>
    <section className="seating-print-floor">
      <h2>Salón<span><i className="seat taken" /> Ocupado <i className="seat warn" /> Canceló <i className="seat" /> Libre</span></h2>
      <div className="seating-print-rings">
        {plan.tables.map(table => {
          const count = table.guests.length
          const cancelled = table.guests.filter(guest => guest.status === 'Canceló' && !guest.checkedIn).length
          return <div key={table.number} className={`seating-print-ring${count >= SEATS_PER_TABLE ? ' full' : ''}`}>
            <span className="seat-ring">
              {Array.from({ length: SEATS_PER_TABLE }, (_, index) => <i key={index} className={`seat${index < count ? ' taken' : ''}${index >= count - cancelled && index < count ? ' warn' : ''}`} style={{ '--i': index } as CSSProperties} />)}
              <span className="seat-top"><strong>{table.number}</strong><small>{count}/{SEATS_PER_TABLE}</small></span>
            </span>
          </div>
        })}
        {Array.from({ length: plan.extraTables }, (_, index) => <div key={`extra-${index}`} className="seating-print-ring full extra">
          <span className="seat-ring">
            {Array.from({ length: SEATS_PER_TABLE }, (_, seat) => <i key={seat} className="seat taken" style={{ '--i': seat } as CSSProperties} />)}
            <span className="seat-top"><strong>Extra</strong><small>{SEATS_PER_TABLE}/{SEATS_PER_TABLE}</small></span>
          </span>
        </div>)}
      </div>
    </section>
    <div className="seating-print-tables">
      {plan.tables.map(table => <section key={table.number} className="seating-print-table">
        <h2>Mesa {table.number}<span>{table.guests.length}/{SEATS_PER_TABLE}</span></h2>
        <ol>{Array.from({ length: SEATS_PER_TABLE }, (_, index) => {
          const guest = table.guests[index]
          return <li key={index} className={guest ? '' : 'empty'}>{guest ? <><strong>{guest.name}</strong>{(guest.company && guest.company !== 'Sin empresa') || statusNote(guest) ? <small>{[guest.company !== 'Sin empresa' ? guest.company : '', statusNote(guest)].filter(Boolean).join(' · ')}</small> : null}</> : <span>Lugar libre</span>}</li>
        })}</ol>
      </section>)}
      {Array.from({ length: plan.extraTables }, (_, index) => <section key={`extra-${index}`} className="seating-print-table extra">
        <h2>Mesa extra{plan.extraTables > 1 ? ` ${index + 1}` : ''}<span>{SEATS_PER_TABLE}/{SEATS_PER_TABLE}</span></h2>
        <p>Mesa completa de {SEATS_PER_TABLE} lugares, adicional a la lista de invitados.</p>
      </section>)}
    </div>
    {plan.unassigned.length > 0 && <section className="seating-print-unassigned">
      <h2>Sin mesa ({plan.unassigned.length})</h2>
      <ol>{plan.unassigned.map(guest => <li key={guest.id}><strong>{guest.name}</strong>{[guest.company !== 'Sin empresa' ? guest.company : '', statusNote(guest)].filter(Boolean).join(' · ') && <small> · {[guest.company !== 'Sin empresa' ? guest.company : '', statusNote(guest)].filter(Boolean).join(' · ')}</small>}</li>)}</ol>
    </section>}
  </div>
}
