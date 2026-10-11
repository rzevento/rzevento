import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const active = Boolean(profile.impersonationId)
  const members = useQuery({
    queryKey: ['impersonation-members', profile.eventId, profile.actorUserId],
    enabled: open && profile.actorIsAdmin && !active,
    queryFn: async () => {
      const result = await getEventMembers()
      if (result.error) throw result.error
      return result.data.filter(member => member.userId !== profile.actorUserId)
    },
    staleTime: 0,
  })

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  // actorIsAdmin represents the signed-in account, even while its effective role is impersonated.
  if (!profile.actorIsAdmin) return null

  const matches = (members.data || []).filter(member => `${member.displayName} ${member.email}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  return <>
    <button type="button" className={`impersonation-menu-button ${active ? 'is-active' : ''}`} disabled={busy} onClick={() => active ? void onChange() : setOpen(true)} aria-haspopup={active ? undefined : 'dialog'} aria-expanded={active ? undefined : open}>
      {active ? <X size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      <span>{busy ? 'Cambiando…' : active ? 'Volver a mi cuenta' : 'Ver como usuario'}{active && <small>Actuando como {profile.displayName}</small>}</span>
    </button>
    {error && <p className="impersonation-menu-error" role="alert">{error}</p>}
    {open && !active && createPortal(<div className="impersonation-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="impersonation-picker" role="dialog" aria-modal="true" aria-labelledby="impersonation-picker-title">
        <div className="impersonation-picker-heading"><div><strong id="impersonation-picker-title">Elegir usuario</strong><p>Sesión de 30 minutos. Las acciones conservarán tu identidad en el historial.</p></div><button type="button" className="icon-button" aria-label="Cerrar selector de usuario" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <label className="impersonation-search"><Search size={17} /><input autoFocus aria-label="Buscar usuario por nombre o correo" placeholder="Buscar nombre o correo" value={search} onChange={event => { setSearch(event.target.value); setSelected('') }} /></label>
        {members.isPending ? <p role="status">Cargando usuarios…</p> : members.isError ? <div role="alert"><p>No pudimos cargar los usuarios.</p><button className="outline-button" onClick={() => void members.refetch()}>Reintentar</button></div> : <fieldset className="impersonation-users"><legend className="sr-only">Usuarios del evento</legend>{matches.map(member => <label key={member.userId} className={selected === member.userId ? 'is-selected' : ''}><input type="radio" name="impersonation-user" value={member.userId} checked={selected === member.userId} onChange={() => setSelected(member.userId)} /><span><strong>{member.displayName}</strong><small>{member.email}</small></span><b>{member.role}</b></label>)}{!matches.length && <p>{members.data?.length ? 'No hay usuarios que coincidan.' : 'Todavía no hay otros usuarios asociados al evento. Agrégalos desde Configuración.'}</p>}</fieldset>}
        <button className="button button-dark" disabled={busy || !selected || members.isError || !members.data?.some(member => member.userId === selected)} onClick={() => void onChange(selected)}>Entrar como usuario</button>
      </section>
    </div>, document.body)}
  </>
}
