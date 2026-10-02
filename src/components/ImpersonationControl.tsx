import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, Search, X } from 'lucide-react'
import { getEventMembers } from '../lib/supabase'
import type { OrganizerProfile } from '../lib/organizer-permissions'
import './ImpersonationControl.css'

type Props = { profile: OrganizerProfile; busy: boolean; error: string; onChange: (subjectId?: string) => Promise<void> }
export default function ImpersonationControl({ profile, busy, error, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const members = useQuery({
    queryKey: ['impersonation-members', profile.eventId, profile.actorUserId],
    enabled: open && profile.actorIsAdmin && !profile.impersonationId,
    queryFn: async () => {
      const result = await getEventMembers()
      if (result.error) throw result.error
      return result.data.filter(member => member.userId !== profile.actorUserId)
    },
    staleTime: 0,
  })
  if (!profile.actorIsAdmin && !profile.impersonationId) return null
  const matches = (members.data || []).filter(member => `${member.displayName} ${member.email}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const active = Boolean(profile.impersonationId)
  return <section className={`impersonation-bar ${active ? 'is-active' : ''}`} aria-label="Ver como otro usuario">
    <div className="impersonation-status"><Eye size={20} aria-hidden="true" /><div>
      <strong>{active ? `Actuando como ${profile.displayName}` : 'Vista de administrador'}</strong>
      <span>{active ? `${profile.role} · Los cambios se guardan · Hasta ${new Date(profile.expiresAt!).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Consulta la vista de otro usuario y realiza acciones con sus permisos.'}</span>
    </div></div>
    <button type="button" className="outline-button" disabled={busy} onClick={() => active ? void onChange() : setOpen(value => !value)} aria-expanded={active ? undefined : open} aria-controls={active ? undefined : 'impersonation-picker'}>
      {active ? <X size={16} /> : <Eye size={16} />}{busy ? 'Cambiando…' : active ? 'Volver a mi cuenta' : 'Ver como usuario'}
    </button>
    {error && <p className="impersonation-error" role="alert">{error}</p>}
    {open && !active && <div id="impersonation-picker" className="impersonation-picker">
      <div className="impersonation-picker-heading"><div><strong>Elegir usuario</strong><p>Sesión de 30 minutos. Las acciones conservarán tu identidad en el historial.</p></div><button type="button" className="icon-button" aria-label="Cerrar selector de usuario" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <label className="impersonation-search"><Search size={17} /><input autoFocus aria-label="Buscar usuario por nombre o correo" placeholder="Buscar nombre o correo" value={search} onChange={event => { setSearch(event.target.value); setSelected('') }} /></label>
      {members.isPending ? <p role="status">Cargando usuarios…</p> : members.isError ? <div role="alert"><p>No pudimos cargar los usuarios.</p><button className="outline-button" onClick={() => void members.refetch()}>Reintentar</button></div> : <fieldset className="impersonation-users"><legend className="sr-only">Usuarios del evento</legend>{matches.map(member => <label key={member.userId} className={selected === member.userId ? 'is-selected' : ''}><input type="radio" name="impersonation-user" value={member.userId} checked={selected === member.userId} onChange={() => setSelected(member.userId)} /><span><strong>{member.displayName}</strong><small>{member.email}</small></span><b>{member.role}</b></label>)}{!matches.length && <p>{members.data?.length ? 'No hay usuarios que coincidan.' : 'Todavía no hay otros usuarios asociados al evento. Agrégalos desde Configuración.'}</p>}</fieldset>}
      <button className="button button-dark" disabled={busy || !selected || members.isError || !members.data?.some(member => member.userId === selected)} onClick={() => void onChange(selected)}>Entrar como usuario</button>
    </div>}
  </section>
}
