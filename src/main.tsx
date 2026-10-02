import { StrictMode, useEffect, useId, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, Clock3, Download, Eye, EyeOff, Filter, LayoutDashboard, LockKeyhole, MapPin, Menu, MoreHorizontal, Pencil, Trash2, QrCode, Search, Send, Settings2, ShieldCheck, Upload, Users, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { QrScanner } from './components/QrScanner'
import { addEventMember, beginRsvp, cancelRsvp, checkInGuest, undoCheckInGuest, createGuest, updateGuest, deleteGuest, markGuestCancelled, findGuestByQr, getCurrentOrganizerProfile, getEventMembers, getInvitationToken, getInvitationDetails, markWhatsAppInvitationSent, sendInvitation, submitRsvp, supabase } from './lib/supabase'
import { canSendPendingEmail, whatsappInvitationUrl, whatsappPhone } from './lib/invitations'
import { OrganizerRoleContext, useCanManageInvitations } from './lib/organizer-permissions'
import ImpersonationControl from './components/ImpersonationControl'
import { beginIdentityChange, finishIdentityChange, cancelIdentityChange, resetImpersonation, getImpersonationId, organizerAction } from './lib/impersonation-transport'
import { startOrganizerImpersonation, stopOrganizerImpersonation } from './lib/supabase'
import EventDashboard from './components/EventDashboard'
import type { Guest, GuestStatus } from './lib/dashboard'
import './styles.css'

const event = {
  eyebrow: 'Conferencia privada',
  title: 'Familias empresarias en la era de las turbulencias:',
  accent: 'retos y oportunidades',
  speaker: 'Manuel Bermejo Sánchez',
  moderator: 'José Roberto Romo Zepeda',
  date: 'Martes 17 de noviembre de 2026',
  time: '9:00 h · Registro desde las 8:30 h',
  venue: 'Hyatt Regency Andares',
  city: 'Guadalajara, Jalisco',
  deadline: 'Antes del 16 de noviembre de 2026',
}

async function downloadGuestPass(name: string, accessToken: string) {
  const qrDataUrl = await QRCode.toDataURL(accessToken, { errorCorrectionLevel: 'H', width: 900, margin: 4, color: { dark: '#241f1a', light: '#fffdf9' } })
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  pdf.setFillColor(246, 242, 236)
  pdf.rect(0, 0, pageWidth, 297, 'F')
  pdf.setFillColor(255, 253, 249)
  pdf.rect(18, 18, pageWidth - 36, 261, 'F')
  pdf.setFillColor(255, 118, 0)
  pdf.rect(18, 18, pageWidth - 36, 3, 'F')
  pdf.setTextColor(199, 90, 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('RZ EVENTOS', 30, 42)
  pdf.setTextColor(36, 31, 26)
  pdf.setFontSize(27)
  pdf.text('Entrada personal', 30, 61)
  pdf.setTextColor(199, 90, 0)
  pdf.text('Familias empresarias', 30, 75)
  pdf.setTextColor(36, 31, 26)
  pdf.setFontSize(23)
  pdf.text(name || 'Invitado', 30, 98)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  pdf.text(event.date, 30, 114)
  pdf.text(`${event.time} · ${event.venue}`, 30, 123)
  pdf.text(event.city, 30, 132)
  pdf.addImage(qrDataUrl, 'PNG', 30, 153, 58, 58)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text(pdf.splitTextToSize('Presenta este QR en el acceso', 82), 100, 174)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(129, 120, 110)
  pdf.text(pdf.splitTextToSize('Esta entrada es personal e intransferible. También llegará por correo. No es necesario imprimirla; puedes mostrarla desde tu celular.', 82), 100, 187, { lineHeightFactor: 1.55 })
  pdf.save('entrada-personal-rz-eventos.pdf')
}

const demoGuests: Guest[] = [
  { id: 'demo-1', name: 'Mariana González', company: 'Grupo Cobalto', email: 'mariana@gcobalto.com', phone: '3312345678', origin: 'Guadalajara', invite: 'Enviada', status: 'Confirmado', checkedIn: true },
  { id: 'demo-2', name: 'Jorge Villaseñor', company: 'Villaseñor Hermanos', email: 'jorge@vhnos.com', phone: '5551234567', origin: 'Ciudad de México', invite: 'Enviada', status: 'Confirmado', checkedIn: false },
  { id: 'demo-3', name: 'Lucía de la Torre', company: 'LDT Capital', email: 'lucia@ldtcapital.com', phone: '', origin: 'Monterrey', invite: 'Enviada', status: 'Pendiente', checkedIn: false },
  { id: 'demo-4', name: 'Raúl Navarro', company: 'Navarro & Asociados', email: 'raul@navarro.com', phone: '', origin: 'Guadalajara', invite: 'Enviada', status: 'Canceló', checkedIn: false },
  { id: 'demo-5', name: 'Elena Ríos', company: 'Ríos Industrial', email: '', phone: '8112345678', origin: 'Querétaro', invite: 'Enviada', status: 'Confirmado', checkedIn: false },
]

const supabaseConfig = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }
const queryClient = new QueryClient()
const guestQuery = async (): Promise<Guest[]> => {
  if (!supabase) return queryClient.getQueryData<Guest[]>(['guests']) || demoGuests
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError) throw eventError
  if (!activeEvent) return []
  const guests: Guest[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('guests').select('id, full_name, company, email, phone, origin, invitations(*), rsvps(status, submitted_at), check_ins(id)').eq('event_id', activeEvent.id).order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data) throw new Error('No se pudo consultar la lista de invitados')
    guests.push(...data.map((guest) => {
      const invitation = Array.isArray(guest.invitations) ? guest.invitations[0] : guest.invitations
      const rsvp = Array.isArray(guest.rsvps) ? guest.rsvps[0] : guest.rsvps
      const checkIn = Array.isArray(guest.check_ins) ? guest.check_ins[0] : guest.check_ins
      const status: GuestStatus = rsvp?.status === 'confirmed' ? 'Confirmado' : rsvp?.status === 'cancelled' || rsvp?.status === 'declined' ? 'Canceló' : 'Pendiente'
      return { id: String(guest.id), name: guest.full_name || 'Invitado pendiente', company: guest.company || 'Sin empresa', email: guest.email || '', phone: guest.phone || '', origin: guest.origin || 'Sin origen', invite: invitation?.sent_at || invitation?.status === 'sent' ? 'Enviada' : 'Pendiente', whatsappSentAt: invitation?.whatsapp_sent_at || null, invitationToken: invitation?.token || null, status, checkedIn: Boolean(checkIn), confirmedAt: rsvp?.submitted_at || null }
    }))
    if (data.length < pageSize) break
  }
  return guests
}

async function saveAttendance(id: string, present: boolean) {
  const result = await organizerAction(async () => {
    await queryClient.cancelQueries({ queryKey: ['guests'] })
    const result = await (present ? checkInGuest(id) : undoCheckInGuest(id))
    if (result.error) throw result.error
    queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(guest => guest.id === id ? { ...guest, checkedIn: present } : guest))
    if (!result.demo) await queryClient.invalidateQueries({ queryKey: ['guests'] })
  })
  if (result && 'error' in result) throw result.error
}

function downloadGuestCsv(guests: Guest[]) {
  const header = ['nombre', 'correo', 'celular', 'empresa', 'correo_enviado', 'whatsapp_enviado', 'whatsapp_enviado_fecha', 'respuesta', 'asistencia']
  const rows = guests.map(g => [g.name, g.email, g.phone, g.company, g.email ? g.invite : 'Sin correo', g.whatsappSentAt ? 'Enviada' : 'Pendiente', g.whatsappSentAt || '', g.status, g.checkedIn ? 'Presente' : 'No ha llegado'])
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'invitados-familias-empresarias.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function Logo() { return <img className="brand-logo" src="/logo-rz.png" alt="RZ" /> }

function PublicShell() {
  return <div className="public-shell"><header className="public-nav"><Link to="/" className="brand"><Logo /><span>RZ EVENTOS</span></Link><nav className="public-menu" aria-label="Navegación principal"><Link to="/informacion" activeProps={{ className: 'active' }}>Sobre el evento</Link><Link to="/admin" className="quiet-link">Acceso organizador <ArrowRight size={15} /></Link></nav></header><Outlet /></div>
}

function RegistrationPage({ token = 'demo' }: { token?: string }) {
  const directToken = token !== 'demo' ? token : ''
  const [resolvedToken, setResolvedToken] = useState(directToken)
  const [sent, setSent] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', origin: '' })
  const [prefillStatus, setPrefillStatus] = useState<'loading' | 'ready' | 'error'>(directToken ? 'loading' : 'ready')
  const [loadAttempt, setLoadAttempt] = useState(0)
  useEffect(() => {
    if (!directToken) return
    let active = true
    setPrefillStatus('loading')
    setError('')
    void getInvitationDetails(directToken).then(result => {
      if (!active) return
      if (result.error) throw result.error
      if (!result.data) {
        setError('Este enlace de invitación no es válido. Revisa el enlace que recibiste.')
        setPrefillStatus('error')
        return
      }
      setForm({ name: result.data.name || '', email: result.data.email || '', phone: result.data.phone || '', origin: result.data.company || '' })
      setPrefillStatus('ready')
    }).catch(() => {
      if (!active) return
      setError('No pudimos cargar tus datos. Intenta de nuevo.')
      setPrefillStatus('error')
    })
    return () => { active = false }
  }, [directToken, loadAttempt])
  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  if (sent) return <main className="register-page success-page"><div className="success-card"><div className="success-icon">{cancelled ? <span>×</span> : <Check size={25} />}</div><p className="eyebrow">{cancelled ? 'Asistencia cancelada' : alreadyRegistered ? 'Asistencia confirmada' : 'Registro recibido'}</p><h1>{cancelled ? 'Tu cancelación quedó registrada.' : alreadyRegistered ? 'Tu asistencia ya está confirmada.' : `Gracias, ${form.name.split(' ')[0] || 'por confirmar'}.`}</h1><p>{cancelled ? 'Si cambias de opinión, puedes volver a confirmar desde este mismo enlace.' : alreadyRegistered ? 'Puedes descargar tu entrada o cancelar tu asistencia desde aquí.' : 'Tu lugar para la conferencia está apartado. Te esperamos el martes 17 de noviembre en Hyatt Regency Andares.'}</p>{!cancelled && <><div className="success-details"><CalendarDays size={18} /><span>{event.date}<br /><small>{event.time}</small></span></div><p className="pass-note"><ShieldCheck size={15} /> {form.email ? 'También recibirás tu entrada por correo.' : 'Si registraste un correo, también recibirás tu entrada por ahí.'} No es necesario imprimirla; puedes mostrarla desde tu celular.</p></>}<div className="success-actions">{!cancelled && <><button className="button button-orange" onClick={() => void downloadPass()}><Download size={16} /> Descargar entrada</button><Link className="outline-button" to="/informacion">Ver más sobre el evento <ArrowRight size={15} /></Link></>}{!cancelled && <button className="cancel-link" onClick={() => { void cancelRsvp(resolvedToken || token).then(result => { if (!result.error) setCancelled(true) }) }}>Ya no podré asistir</button>}</div></div></main>
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (prefillStatus !== 'ready' || submitting) return
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Escribe tu correo o tu celular para identificar tu registro.')
      return
    }
    setSubmitting(true)
    setError('')
    let currentToken = resolvedToken
    if (!currentToken) {
      const lookup = await beginRsvp(form.email || form.phone)
      if (lookup.error) { setSubmitting(false); setError('No encontramos ese correo o celular en la lista de invitados.'); return }
      if (lookup.data?.status === 'already_registered') {
        currentToken = lookup.data.token || ''
        setResolvedToken(currentToken)
        setAlreadyRegistered(true)
        setSubmitting(false)
        setSent(true)
        return
      }
      currentToken = lookup.data?.token || ''
      setResolvedToken(currentToken)
    }
    if (!form.name.trim() || !form.origin.trim()) {
      setSubmitting(false)
      setError('Para completar el registro necesitamos tu nombre y empresa.')
      return
    }
    const result = await submitRsvp({ token: currentToken, ...form })
    setSubmitting(false)
    if (result.error) {
      setError('No pudimos completar el registro. Verifica tu enlace e inténtalo de nuevo.')
      return
    }
    setSent(true)
  }
  async function downloadPass() {
    const accessToken = resolvedToken || token
    const qrDataUrl = await QRCode.toDataURL(accessToken, { errorCorrectionLevel: 'H', width: 900, margin: 4, color: { dark: '#241f1a', light: '#fffdf9' } })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    pdf.setFillColor(246, 242, 236)
    pdf.rect(0, 0, pageWidth, 297, 'F')
    pdf.setFillColor(255, 253, 249)
    pdf.rect(18, 18, pageWidth - 36, 261, 'F')
    pdf.setFillColor(255, 118, 0)
    pdf.rect(18, 18, pageWidth - 36, 3, 'F')
    pdf.setTextColor(199, 90, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('RZ EVENTOS', 30, 42)
    pdf.setTextColor(36, 31, 26)
    pdf.setFontSize(27)
    pdf.text('Entrada personal', 30, 61)
    pdf.setTextColor(199, 90, 0)
    pdf.text('Familias empresarias', 30, 75)
    pdf.setTextColor(36, 31, 26)
    pdf.setFontSize(23)
    pdf.text(form.name || 'Invitado', 30, 98)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(13)
    pdf.text(event.date, 30, 114)
    pdf.text(`${event.time} · ${event.venue}`, 30, 123)
    pdf.text(event.city, 30, 132)
    pdf.addImage(qrDataUrl, 'PNG', 30, 153, 58, 58)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text(pdf.splitTextToSize('Presenta este QR en el acceso', 82), 100, 174)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(129, 120, 110)
    pdf.text(pdf.splitTextToSize('Esta entrada es personal e intransferible. También llegará por correo. No es necesario imprimirla; puedes mostrarla desde tu celular.', 82), 100, 187, { lineHeightFactor: 1.55 })
    pdf.save('entrada-personal-rz-eventos.pdf')
  }
  return <main className="register-page"><section className="register-intro"><div className="circle circle-one"></div><div className="circle circle-two"></div><Logo /><p className="eyebrow">{event.eyebrow}</p><h1>{event.title} <span>{event.accent}</span></h1><div className="line"></div><p className="intro-copy">Una conversación para quienes construyen empresas que trascienden generaciones.</p><div className="event-meta"><div><CalendarDays size={19} /><span>{event.date}<small>{event.time}</small></span></div><div><MapPin size={19} /><span>{event.venue}<small>{event.city}</small></span></div></div></section><section className="register-card"><div className="card-top"><p className="eyebrow">Evento exclusivo por invitación</p><h2>Confirma tu asistencia</h2><div className="invitation-notices"><p><ShieldCheck size={15} /> {directToken ? 'Revisa tus datos y completa lo que falte.' : 'Ingresa el correo o celular con el que fuiste invitado.'}</p><p><LockKeyhole size={15} /> Esta invitación es personal e intransferible.</p></div><p>Completa tus datos para reservar tu lugar.</p></div><form onSubmit={handleSubmit} aria-busy={prefillStatus === 'loading'}>{prefillStatus === 'loading' && <p role="status">Cargando tus datos…</p>}<label>Nombre completo<input disabled={prefillStatus !== 'ready' || submitting} value={form.name} onChange={update('name')} placeholder="Tu nombre" /></label><label>Correo electrónico<input type="email" disabled={prefillStatus !== 'ready' || submitting} value={form.email} onChange={update('email')} placeholder="nombre@empresa.com" /></label><label>Celular<input type="tel" disabled={prefillStatus !== 'ready' || submitting} value={form.phone} onChange={update('phone')} placeholder="México: 10 dígitos · Otros: +código de país" /></label><label>Empresa<input disabled={prefillStatus !== 'ready' || submitting} value={form.origin} onChange={update('origin')} placeholder="Nombre de la empresa" /></label>{error && <p className="form-error" role="alert">{error}</p>}{prefillStatus === 'error' && <button className="outline-button" type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Volver a cargar</button>}<button className="button button-orange" type="submit" disabled={submitting || prefillStatus !== 'ready'}>{submitting ? 'Guardando…' : 'Confirmar asistencia'} {!submitting && <ArrowRight size={17} />}</button></form><p className="privacy-note"><ShieldCheck size={15} /> Tus datos se utilizarán únicamente para la organización del evento.</p></section></main>
}

function TokenRegistrationPage() {
  const { token } = useParams({ from: '/registro/$token' })
  return <RegistrationPage key={token} token={token} />
}

function InformationPage() {
  return <main className="information-page"><section className="information-hero"><div><p className="eyebrow orange">Sobre el evento</p><h1>Ideas para construir empresas que <span>trascienden.</span></h1><p className="information-lead">Una conversación cercana para familias empresarias que quieren entender mejor los retos y las oportunidades de crecer en tiempos de cambio.</p><Link className="button button-orange" to="/">Confirmar asistencia <ArrowRight size={17} /></Link></div></section><section className="information-grid"><article className="information-card information-card-dark"><p className="eyebrow orange">La conversación</p><h2>Familias empresarias en la era de las turbulencias</h2><p>El encuentro propone un espacio para compartir perspectivas prácticas sobre continuidad, liderazgo y toma de decisiones cuando el entorno cambia.</p><div className="book-note"><span className="eyebrow orange">Libro de referencia</span><strong>Familias empresarias en la sociedad del cambio</strong><small>Agenda estratégica para la gobernanza y el liderazgo transformador</small><p>En su libro, Manuel Bermejo aborda la transición generacional, la gobernanza y el liderazgo que necesitan las familias empresarias para adaptarse a una sociedad marcada por la tecnología, la globalización y la incertidumbre.</p><a href="https://www.lidlibros.com/fichalibro.php?edi=88&libro=10560" target="_blank" rel="noreferrer">Conocer el libro <ArrowRight size={14} /></a></div><div className="information-details"><div><CalendarDays size={18} /><span>{event.date}<small>{event.time}</small></span></div><div><MapPin size={18} /><span>{event.venue}<small>{event.city}</small></span></div></div></article><article className="information-card speaker-card"><p className="eyebrow orange">El expositor</p><div className="speaker-initials" aria-hidden="true">MB</div><h2>{event.speaker}</h2><div className="speaker-bio"><p>Manuel Bermejo Sánchez es especialista en empresa familiar, gobierno corporativo y liderazgo. Es presidente ejecutivo y fundador de The Family Advisory Board, así como director general de los Programas de Empresa Familiar de Executive Education en IE Business School.</p><p>Es doctor en Economía por la Universidad de Granada, ingeniero agrónomo por la Universidad Politécnica de Madrid y MBA por IE Business School. También cuenta con formación en Harvard Business School y Babson College.</p><p>Durante más de tres décadas ha acompañado a familias empresarias y participado como profesor, consejero y conferencista en Europa y Latinoamérica.</p></div><div className="speaker-moderator"><span>Conversación moderada por</span><strong>{event.moderator}</strong></div></article></section><section className="information-footer"><div><p className="eyebrow">Una invitación</p><h2>Reserva tu lugar en esta conversación.</h2></div><Link className="outline-button" to="/">Ir al registro <ArrowRight size={16} /></Link></section></main>
}

function AdminLayout() {
  const { data: guests = [] } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const navigate = useNavigate()
  const [sessionReady, setSessionReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [localAuthenticated, setLocalAuthenticated] = useState(() => localStorage.getItem('rz-organizer-authenticated') === 'true')
  const [identityChanging, setIdentityChanging] = useState(false)
  const [identityError, setIdentityError] = useState('')
  useEffect(() => () => resetImpersonation(), [])
  useEffect(() => {
    if (!supabase) {
      setAuthenticated(localAuthenticated)
      setSessionReady(true)
      return
    }
    let active = true
    let receivedAuthEvent = false
    supabase.auth.getSession().then(({ data }) => {
      if (!active || receivedAuthEvent) return
      setUserId(data.session?.user.id || null)
      setAuthenticated(Boolean(data.session))
      setSessionReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true
      if (_event === 'SIGNED_OUT') { resetImpersonation(); queryClient.clear() }
      setUserId(session?.user.id || null)
      setAuthenticated(Boolean(session))
      setSessionReady(true)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [localAuthenticated])
  const organizerQuery = useQuery({
    queryKey: ['organizer-profile', userId, authenticated],
    enabled: sessionReady && authenticated,
    queryFn: async () => {
      const result = await getCurrentOrganizerProfile()
      if (result.error || !result.data) throw result.error || new Error('No autorizado')
      return result.data
    },
    gcTime: 0,
    refetchInterval: 15000,
    retry: false,
  })
  const organizer = organizerQuery.data
  const canManageInvitations = organizer?.roleCode === 'admin'
  useEffect(() => {
    if (!organizer?.expiresAt) return
    const timer = window.setTimeout(() => void organizerQuery.refetch(), Math.max(0, Date.parse(organizer.expiresAt) - Date.now()) + 100)
    return () => window.clearTimeout(timer)
  }, [organizer?.expiresAt])
  async function changeIdentity(subjectId?: string) {
    setIdentityError('')
    try { beginIdentityChange() } catch (error) { setIdentityError(error instanceof Error ? error.message : 'Espera a que termine la operación.'); return }
    setIdentityChanging(true)
    try {
      await queryClient.cancelQueries()
      if (subjectId) {
        if (!organizer?.actorIsAdmin || organizer.impersonationId) throw new Error('Vuelve a tu cuenta de administrador para elegir un usuario.')
        const session = await startOrganizerImpersonation(organizer.eventId, subjectId)
        finishIdentityChange(session.id)
      } else {
        const id = getImpersonationId()
        if (id) await stopOrganizerImpersonation(id)
        finishIdentityChange(null)
      }
      await queryClient.resetQueries()
    } catch (error) {
      cancelIdentityChange()
      setIdentityError(error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo cambiar de usuario. Intenta de nuevo.')
    } finally { setIdentityChanging(false) }
  }
  if (!sessionReady) return <div className="auth-loading">Cargando acceso…</div>
  if (!authenticated) return <AdminLogin onLocalAuthenticated={() => { localStorage.setItem('rz-organizer-authenticated', 'true'); setLocalAuthenticated(true); setAuthenticated(true) }} />
  if (identityChanging && !organizer) return <div className="auth-loading" role="status">Cambiando de usuario…</div>
  if (organizerQuery.isPending) return <div className="auth-loading">Cargando permisos…</div>
  if (organizerQuery.isError || !organizer) return <div className="auth-loading">{getImpersonationId() && <><p>La vista del usuario se ha detenido.</p><button className="button button-dark" disabled={identityChanging} onClick={() => void changeIdentity()}>Volver a mi cuenta</button></>}{identityError && <p role="alert">{identityError}</p>}<p role="alert">No pudimos verificar tu acceso al evento.</p><button className="button button-dark" onClick={() => void organizerQuery.refetch()}>Reintentar</button><button className="outline-button" onClick={() => { if (supabase) void supabase.auth.signOut() }}>Cerrar sesión</button></div>
  const organizerInitials = organizer.displayName.split(' ').map(name => name[0]).slice(0, 2).join('').toUpperCase()
  const sentInvitations = guests.filter(guest => guest.invite === 'Enviada' || Boolean(guest.whatsappSentAt)).length
  return <OrganizerRoleContext.Provider value={organizer.roleCode}><div className={`admin-shell ${mobileNavOpen ? 'mobile-open' : ''}`}><aside className="sidebar"><div className="sidebar-brand"><Logo /><span>RZ EVENTOS</span></div><div className="event-switcher"><span>EVENTO ACTIVO</span><strong>Familias empresarias</strong><ChevronDown size={15} /></div><nav onClick={() => setMobileNavOpen(false)}><Link to="/admin" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}><LayoutDashboard size={18} /> Resumen</Link><Link to="/admin/invitados" activeProps={{ className: 'active' }}><Users size={18} /> Invitados <b>{sentInvitations}</b></Link><Link to="/admin/check-in" activeProps={{ className: 'active' }}><CheckCircle2 size={18} /> Registro en evento</Link><Link to="/admin/configuracion" activeProps={{ className: 'active' }}><Settings2 size={18} /> Configuración</Link></nav><div className="sidebar-bottom"><div className="user-avatar">{organizerInitials}</div><div><strong>{organizer.displayName}</strong><small>{organizer.role}</small></div><button className="sidebar-logout" onClick={() => { localStorage.removeItem('rz-organizer-authenticated'); sessionStorage.removeItem('rz-organizer-authenticated'); if (supabase) void supabase.auth.signOut(); else { setLocalAuthenticated(false); setAuthenticated(false) } }} aria-label="Cerrar sesión"><MoreHorizontal size={18} /></button></div></aside><main className="admin-main"><ImpersonationControl key={organizer.impersonationId || 'self'} profile={organizer} busy={identityChanging} error={identityError} onChange={changeIdentity} /><header className="admin-header"><button className="mobile-menu" onClick={() => setMobileNavOpen(current => !current)} aria-label="Abrir menú"><Menu size={20} /></button><div><p className="eyebrow">Martes 17 de noviembre de 2026</p><h1>Familias empresarias</h1></div>{canManageInvitations && <div className="header-actions"><button className="icon-button" onClick={() => downloadGuestCsv(guests)} aria-label="Descargar lista de invitados"><Download size={17} /></button><button className="button button-orange small" onClick={() => void navigate({ to: '/admin/invitados' })}><Send size={16} /> Nueva invitación</button></div>}</header>{identityChanging ? <div className="impersonation-busy" role="status">Cambiando de usuario…</div> : <div key={`${organizer.actorUserId}:${organizer.userId}:${organizer.impersonationId || 'self'}`}><Outlet /></div>}</main></div></OrganizerRoleContext.Provider>
}

function AdminLogin({ onLocalAuthenticated }: { onLocalAuthenticated: () => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (!supabase) {
      const configuredPassword = import.meta.env.VITE_ORGANIZER_PASSWORD
      if (!configuredPassword) {
        setError('Configura VITE_ORGANIZER_PASSWORD para habilitar el acceso local.')
      } else if (password !== configuredPassword) {
        setError('Contraseña incorrecta.')
      } else {
        onLocalAuthenticated()
        await navigate({ to: '/admin' })
      }
      setLoading(false)
      return
    }
    const result = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (result.error) setError('Correo o contraseña incorrectos.')
    else await navigate({ to: '/admin' })
  }
  return <main className="auth-page"><div className="auth-card"><Logo /><p className="eyebrow orange">Acceso organizador</p><h1>Tu evento,<br /><span>bajo control.</span></h1><p className="muted">Introduce tu contraseña para administrar invitaciones y registrar asistentes.</p><form onSubmit={signIn}>{supabase && <label>Correo electrónico<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@empresa.com" /></label>}<label className="password-field">Contraseña<div><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>{error && <p className="form-error">{error}</p>}<button className="button button-orange" disabled={loading}>{loading ? 'Validando…' : 'Entrar al panel'} <ArrowRight size={17} /></button></form><p className="auth-note"><LockKeyhole size={14} /> Acceso restringido a organizadores.</p><Link to="/" className="back-link">← Volver al registro público</Link></div></main>
}

function SummaryPage() {
  const canExport = useCanManageInvitations()
  const { data = [], isPending, isError, isFetching, dataUpdatedAt, refetch } = useQuery({ queryKey: ['guests'], queryFn: guestQuery, refetchInterval: 60_000 })
  // A recorded send in either channel counts as an invitation sent.
  const dashboardGuests = data.map(guest => guest.whatsappSentAt ? { ...guest, invite: 'Enviada' } : guest)
  return <EventDashboard guests={dashboardGuests} canExport={canExport} loading={isPending} error={isError} refreshing={isFetching} updatedAt={dataUpdatedAt} demo={!supabase} onRefresh={() => void refetch()} />
}

function InvitationState({ guest, channel = 'email', disabled = false, menuActions }: { guest: Guest; channel?: 'email' | 'whatsapp'; disabled?: boolean; menuActions?: React.ReactNode }) {
  const canManageInvitations = useCanManageInvitations()
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [saving, setSaving] = useState<'email' | 'whatsapp' | null>(null)
  const [error, setError] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const isDemo = !supabase
  let whatsappUrl = ''
  let whatsappHint = ''
  if (!isDemo && guest.phone) {
    try {
      whatsappUrl = whatsappInvitationUrl(guest.phone, guest.name, guest.invitationToken || '', import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin)
    } catch (cause) {
      whatsappHint = cause instanceof Error ? cause.message : 'No se pudo preparar el enlace de WhatsApp.'
    }
  }
  const emailMutation = useMutation({ mutationKey: ['invitation-send'], mutationFn: sendEmail })
  const whatsappMutation = useMutation({ mutationKey: ['invitation-send'], mutationFn: markWhatsApp })
  async function sendEmail() {
    if (!canManageInvitations || saving || disabled) return
    setSaving('email')
    setError('')
    setEmailNotice('')
    try {
      const result = await sendInvitation(guest.id, guest.invite === 'Enviada')
      if (result.error) throw result.error
      setEmailNotice(guest.invite === 'Enviada' ? 'Invitación reenviada' : 'Invitación enviada')
      queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(item => item.id === guest.id ? { ...item, invite: 'Enviada' } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el envío. Revisa el historial de Make antes de reintentar.')
    } finally {
      setSaving(null)
    }
  }
  async function markWhatsApp() {
    if (!canManageInvitations || saving || disabled) return
    setSaving('whatsapp')
    setError('')
    try {
      const result = await markWhatsAppInvitationSent(guest.id)
      if (result.error || !result.data) throw result.error || new Error('No se recibió la fecha del envío')
      queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(item => item.id === guest.id ? { ...item, whatsappSentAt: result.data } : item))
    } catch {
      setError('No se pudo guardar el envío de WhatsApp. Revisa tu acceso y que la migración de WhatsApp esté aplicada.')
    } finally {
      setSaving(null)
    }
  }
  if (!canManageInvitations && channel === 'email') return <span className={guest.invite === 'Enviada' ? 'sent-label' : 'muted'}>{!guest.email ? 'Sin correo' : guest.invite === 'Enviada' ? 'Enviado' : 'Pendiente de envío'}</span>
  if (channel === 'email') return <div className="invitation-email">
    {!guest.email ? <span className="muted">Sin correo</span> : guest.invite === 'Enviada' ? <><span className="sent-label"><Send size={13} /> Enviado</span><button className="send-inline" disabled={disabled || Boolean(saving)} onClick={() => emailMutation.mutate()}>{saving === 'email' ? 'Reenviando…' : 'Reenviar invitación'}</button></> : <button className="send-inline" disabled={disabled || Boolean(saving)} onClick={() => emailMutation.mutate()}>{saving === 'email' ? 'Enviando…' : 'Enviar correo'}</button>}
    {emailNotice && <small role="status">{emailNotice}</small>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
  return <>
    <button className={`row-action whatsapp-menu-trigger${guest.whatsappSentAt ? ' is-sent' : ''}`} popoverTarget={menuId} aria-label={`Opciones de ${guest.name}`} title="Opciones del invitado" onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      setMenuPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 460)), left: Math.max(12, Math.min(rect.right - 280, window.innerWidth - 292)) })
    }}><MoreHorizontal size={17} />{guest.whatsappSentAt && <span className="whatsapp-sent-dot" />}</button>
    <div ref={menuRef} id={menuId} popover="auto" className="whatsapp-popover" style={menuPosition}>
      <div className="whatsapp-popover-heading"><strong>Opciones del invitado</strong><button className="icon-button" popoverTarget={menuId} popoverTargetAction="hide" aria-label="Cerrar opciones del invitado"><X size={15} /></button></div>
      <small className="whatsapp-guest-name">{guest.name}</small>
      {menuActions && <div className="guest-menu-actions" onClick={() => menuRef.current?.hidePopover()}>{menuActions}</div>}
      <div className="invitation-channel">
        <strong>WhatsApp</strong>
        {guest.whatsappSentAt ? <><span className="sent-label"><Check size={13} /> Enviado manualmente</span><time dateTime={guest.whatsappSentAt}>{new Date(guest.whatsappSentAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</time></> : <span className="muted">{guest.phone ? 'Pendiente de envío' : 'Sin celular registrado'}</span>}
        {canManageInvitations && guest.phone && <>
          {whatsappUrl && <a className="row-action whatsapp-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp <ArrowRight size={12} /></a>}
          {isDemo && <small>Modo demo: no se abre un mensaje real.</small>}
          {whatsappHint && <small>{whatsappHint}</small>}
          {!guest.whatsappSentAt && <><button className="row-action" disabled={disabled || Boolean(saving) || !whatsappPhone(guest.phone)} onClick={() => whatsappMutation.mutate()}>{saving === 'whatsapp' ? 'Guardando…' : 'Marcar WhatsApp enviado'}</button><small>Pulsa después de enviarlo en WhatsApp.</small></>}
        </>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </>
}

function GuestFormModal({ guest, onClose }: { guest?: Guest; onClose: () => void }) {
  const canManageInvitations = useCanManageInvitations()
  const [form, setForm] = useState({
    name: guest?.name === 'Invitado pendiente' ? '' : guest?.name || '',
    email: guest?.email || '', phone: guest?.phone || '',
    origin: guest?.origin === 'Sin origen' ? '' : guest?.origin || '',
    company: guest?.company === 'Sin empresa' ? '' : guest?.company || '',
  })
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const [error, setError] = useState('')
  const close = () => { if (!saveLock.current) onClose() }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!guest && !canManageInvitations) return
    if (saveLock.current) return
    setError('')
    if (!form.email.trim() && !form.phone.trim()) { setError('Captura un correo o un celular.'); return }
    if (form.phone.trim() && !whatsappPhone(form.phone)) { setError('Revisa el celular: usa 10 dígitos para México o + y el código de país.'); return }
    saveLock.current = true
    setSaving(true)
    try {
      const result = guest ? await updateGuest(guest.id, form) : await createGuest(form)
      if (result.error) throw result.error
      await queryClient.cancelQueries({ queryKey: ['guests'] })
      const changes = { name: form.name.trim() || 'Invitado pendiente', company: form.company.trim() || 'Sin empresa', email: form.email.trim(), phone: form.phone.trim(), origin: form.origin.trim() || 'Sin origen' }
      if (guest) queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(item => item.id === guest.id ? { ...item, ...changes } : item))
      else if (result.demo) queryClient.setQueryData<Guest[]>(['guests'], current => [...(current || demoGuests), { id: `demo-${crypto.randomUUID()}`, ...changes, invite: 'Pendiente', status: 'Pendiente', checkedIn: false }])
      if (!result.demo) await queryClient.invalidateQueries({ queryKey: ['guests'] })
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : ''
      const duplicate = (typeof cause === 'object' && cause && 'code' in cause && cause.code === '23505') || /duplicate key|unique constraint/i.test(message)
      setError(duplicate ? 'No se pudo guardar: el correo o celular ya está registrado para otro invitado.' : 'No se pudo guardar al invitado. Revisa tu conexión y permisos e intenta nuevamente.')
    } finally { saveLock.current = false; setSaving(false) }
  }
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal-card guest-form-modal" role="dialog" aria-modal="true" aria-labelledby="guest-form-title" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" disabled={saving} onClick={close} aria-label="Cerrar">×</button>
    <p className="eyebrow orange">{guest ? 'Datos del invitado' : 'Nueva invitación'}</p><h2 id="guest-form-title">{guest ? 'Editar invitado' : 'Agregar invitado'}</h2>
    <p className="muted">{guest ? 'Corrige sus datos conservando su enlace personal y su respuesta. Guardar no envía ninguna invitación.' : 'Captura el correo o celular con el que fue invitado. El nombre puede completarse después.'}</p>
    {guest?.invite === 'Enviada' && <p className="muted">Si corriges el correo, guarda y pulsa «Reenviar invitación» en la lista para enviarla a la dirección correcta.</p>}
    <form onSubmit={save}>
      <label>Nombre completo <small>(opcional)</small><input disabled={saving} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Si ya lo tienes" /></label>
      <label>Correo electrónico <small>(opcional si registras celular)</small><input type="email" disabled={saving} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nombre@empresa.com" /></label>
      <label>Celular <small>(opcional si registras correo)</small><input type="tel" disabled={saving} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="México: 10 dígitos · Otros: +código de país" /></label>
      <label>Empresa<input disabled={saving} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></label>
      <label>Procedencia<input disabled={saving} value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-orange" disabled={saving}>{saving ? 'Guardando…' : guest ? 'Guardar cambios' : 'Crear invitación'} <ArrowRight size={16} /></button>
    </form>
  </div></div>
}

function GuestPassModal({ guest, token, onClose }: { guest: Guest; token: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  useEffect(() => {
    let current = true
    void QRCode.toDataURL(token, { errorCorrectionLevel: 'H', width: 720, margin: 3, color: { dark: '#241f1a', light: '#fffdf9' } }).then(value => {
      if (current) setQrDataUrl(value)
    })
    return () => { current = false }
  }, [token])
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card guest-pass-modal" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Cerrar entrada">×</button><p className="eyebrow orange">Entrada personal</p><h2>{guest.name}</h2><p className="muted">{event.date}<br />{event.time}<br />{event.venue} · {event.city}</p><div className="pass-qr-preview">{qrDataUrl ? <img src={qrDataUrl} alt={`Código QR de ${guest.name}`} /> : <span>Generando QR…</span>}</div><p className="pass-preview-note">Esta entrada es personal e intransferible. Puede mostrarse desde el celular; no necesita imprimirse.</p><button className="button button-orange" disabled={!qrDataUrl} onClick={() => void downloadGuestPass(guest.name, token)}><Download size={16} /> Descargar PDF</button></div></div>
}

function GuestsPage() {
  const canManageInvitations = useCanManageInvitations()
  const { data = demoGuests, isPending, isError } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null)
  const [deletingGuest, setDeletingGuest] = useState<string | null>(null)
  const deleteLock = useRef(false)
  const [cancellingGuest, setCancellingGuest] = useState<string | null>(null)
  const cancelLock = useRef(false)
  const [filterStatus, setFilterStatus] = useState<'all' | GuestStatus>('all')
  const [filterDelivery, setFilterDelivery] = useState('all')
  const [passGuest, setPassGuest] = useState<Guest | null>(null)
  const [passToken, setPassToken] = useState('')
  const [passLoading, setPassLoading] = useState<string | null>(null)
  const [arrivalLoading, setArrivalLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const bulkLock = useRef(false)
  const [bulkNotice, setBulkNotice] = useState('')
  const individualSends = useIsMutating({ mutationKey: ['invitation-send'] })
  const pendingEmails = data.filter(canSendPendingEmail)
  async function sendAllInvitations() {
    return organizerAction(async () => {
      if (!canManageInvitations || bulkLock.current || individualSends || deleteLock.current || editingGuest || !pendingEmails.length) return
      bulkLock.current = true
      setBulkSending(true)
      setActionError('')
      setBulkNotice('Revisando invitaciones pendientes…')
      let sent = 0
      let skipped = 0
      let total = 0
      try {
        const current = await queryClient.fetchQuery({ queryKey: ['guests'], queryFn: guestQuery, staleTime: 0 })
        const pending = current.filter(canSendPendingEmail)
        total = pending.length
        for (const guest of pending) {
          setBulkNotice(`Enviando correos: ${sent + skipped} de ${total}. Mantén esta página abierta.`)
          const result = await sendInvitation(guest.id, false)
          if (result.error) throw new Error(`${guest.email}: ${result.error.message}`)
          if (!result.demo && result.data?.ok !== true) throw new Error(`${guest.email}: no se confirmó el envío. Revisa el historial de Make antes de reintentar.`)
          if (result.data?.already_sent) skipped += 1
          else sent += 1
          queryClient.setQueryData<Guest[]>(['guests'], guests => guests?.map(item => item.id === guest.id ? { ...item, invite: 'Enviada' } : item))
        }
        setBulkNotice(total ? `${sent} correo(s) enviado(s).${skipped ? ` ${skipped} ya enviado(s) omitido(s).` : ''}` : 'No hay invitaciones por correo pendientes de envío.')
      } catch (cause) {
        setBulkNotice(`Envío detenido: ${sent} correo(s) enviado(s), ${skipped} omitido(s) y ${total - sent - skipped} sin completar.`)
        setActionError(cause instanceof Error ? cause.message : 'No se pudo completar el envío. Revisa el historial de Make antes de reintentar.')
      } finally {
        bulkLock.current = false
        setBulkSending(false)
      }
    })
  }
  const fileInput = useRef<HTMLInputElement>(null)
  const filtered = data.filter(g => {
    const emailSent = Boolean(g.email) && g.invite === 'Enviada'
    const whatsappSent = Boolean(g.whatsappSentAt)
    const deliveryMatches = filterDelivery === 'all'
      || (filterDelivery === 'sent' && (emailSent || whatsappSent))
      || (filterDelivery === 'pending' && !emailSent && !whatsappSent)
      || (filterDelivery === 'email' && emailSent)
      || (filterDelivery === 'whatsapp' && whatsappSent)
    return `${g.name} ${g.company} ${g.email} ${g.phone}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))
      && (filterStatus === 'all' || g.status === filterStatus) && deliveryMatches
  }).sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'es', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id))
  async function cancelGuest(guest: Guest) {
    if (cancelLock.current || deleteLock.current || guest.status === 'Canceló') return
    if (!window.confirm(`¿Marcar que ${guest.name} canceló su asistencia? Se conservarán sus datos y su invitación.`)) return
    cancelLock.current = true
    setCancellingGuest(guest.id)
    setActionError('')
    try {
      const result = await markGuestCancelled(guest.id)
      if (result.error) throw result.error
      await queryClient.cancelQueries({ queryKey: ['guests'] })
      queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(item => item.id === guest.id ? { ...item, status: 'Canceló' } : item))
      if (!result.demo) await queryClient.invalidateQueries({ queryKey: ['guests'] })
    } catch {
      setActionError('No se pudo registrar la cancelación. Revisa tu conexión y permisos e intenta nuevamente.')
    } finally { cancelLock.current = false; setCancellingGuest(null) }
  }
  async function removeGuest(guest: Guest) {
    if (deleteLock.current || cancelLock.current || bulkLock.current || individualSends || arrivalLoading) return
    if (!window.confirm(`¿Eliminar a ${guest.name} (${guest.email || guest.phone})?\n\nTambién se eliminarán su invitación, su respuesta y su registro de llegada. Su enlace personal dejará de funcionar. Esta acción no se puede deshacer.`)) return
    deleteLock.current = true
    setDeletingGuest(guest.id)
    setActionError('')
    try {
      const result = await deleteGuest(guest.id)
      if (result.error) throw result.error
      await queryClient.cancelQueries({ queryKey: ['guests'] })
      queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).filter(item => item.id !== guest.id))
      if (!result.demo) await queryClient.invalidateQueries({ queryKey: ['guests'] })
    } catch {
      setActionError('No se pudo eliminar al invitado. Revisa tu conexión y permisos e intenta nuevamente.')
    } finally { deleteLock.current = false; setDeletingGuest(null) }
  }
  async function openPass(guest: Guest) {
    setActionError('')
    setPassLoading(guest.id)
    try {
      const result = await getInvitationToken(guest.id)
      if (result.error || !result.data) { setActionError('No pudimos encontrar la entrada de este invitado.'); return }
      setPassToken(result.data)
      setPassGuest(guest)
    } catch {
      setActionError('No pudimos abrir la entrada. Inténtalo de nuevo.')
    } finally {
      setPassLoading(null)
    }
  }
  async function markArrival(guest: Guest) {
    setActionError('')
    setArrivalLoading(guest.id)
    try {
      await saveAttendance(guest.id, !guest.checkedIn)
    } catch {
      setActionError('No pudimos actualizar la asistencia. Inténtalo de nuevo.')
    } finally {
      setArrivalLoading(null)
    }
  }
  function exportCsv() {
    if (!canManageInvitations) return
    downloadGuestCsv(data)
  }
  function parseCsv(source: string) {
    const normalized = source.replace(/^\uFEFF/, '')
    const firstLine = normalized.split(/\r?\n/, 1)[0] || ''
    const commaCount = (firstLine.match(/,/g) || []).length
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const delimiter = semicolonCount > commaCount ? ';' : ','
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index]
      const next = normalized[index + 1]
      if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue }
      if (character === '"') { quoted = !quoted; continue }
      if (character === delimiter && !quoted) { row.push(cell.trim()); cell = ''; continue }
      if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && next === '\n') index += 1
        row.push(cell.trim())
        if (row.some(Boolean)) rows.push(row)
        row = []
        cell = ''
        continue
      }
      cell += character
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row) }
    return rows
  }
  function normalizeHeader(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  }
  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    return organizerAction(async () => {
      if (!canManageInvitations) return
      const file = e.target.files?.[0]
      if (!file) return
      const rows = parseCsv(await file.text())
      const header = rows.shift()?.map(normalizeHeader) || []
      const indexOf = (...names: string[]) => names.map(normalizeHeader).map(name => header.indexOf(name)).find(index => index >= 0) ?? -1
      const nameIndex = indexOf('name', 'nombre', 'nombre completo')
      const emailIndex = indexOf('email', 'correo', 'correo electrónico')
      const phoneIndex = indexOf('phone', 'teléfono', 'telefono', 'celular', 'movil')
      const originIndex = indexOf('origin', 'procedencia', 'ciudad', 'de dónde vienes')
      const companyIndex = indexOf('company', 'empresa')
      if (nameIndex < 0 || (emailIndex < 0 && phoneIndex < 0)) {
        window.alert('El archivo debe incluir una columna Nombre y una columna Correo o Celular.')
        e.target.value = ''
        return
      }
      const imported = rows.filter(row => (emailIndex >= 0 && row[emailIndex]) || (phoneIndex >= 0 && row[phoneIndex])).map(row => ({ id: `csv-${crypto.randomUUID()}`, name: nameIndex >= 0 ? row[nameIndex] : '', email: emailIndex >= 0 ? row[emailIndex] : '', phone: phoneIndex >= 0 ? row[phoneIndex] : '', origin: originIndex >= 0 ? row[originIndex] : 'Sin origen', company: companyIndex >= 0 ? row[companyIndex] : 'Sin empresa', invite: 'Pendiente', status: 'Pendiente' as GuestStatus, checkedIn: false }))
      const normalizeEmail = (value: string) => value.trim().toLowerCase()
      const normalizePhone = (value: string) => value.replace(/\D/g, '')
      const existingEmails = new Set(data.map(guest => normalizeEmail(guest.email)).filter(Boolean))
      const existingPhones = new Set(data.map(guest => normalizePhone(guest.phone)).filter(Boolean))
      const seenEmails = new Set<string>()
      const seenPhones = new Set<string>()
      const newImported = imported.filter(guest => {
        const email = normalizeEmail(guest.email)
        const phone = normalizePhone(guest.phone)
        const duplicate = (email && (existingEmails.has(email) || seenEmails.has(email))) || (phone && (existingPhones.has(phone) || seenPhones.has(phone)))
        if (email) seenEmails.add(email)
        if (phone) seenPhones.add(phone)
        return !duplicate
      })
      const skipped = imported.length - newImported.length
      if (imported.length === 0) window.alert('No encontré filas válidas. Cada invitado necesita nombre y correo o celular.')
      else if (newImported.length === 0) window.alert('Todos los contactos de este archivo ya están registrados.')
      else if (supabase) {
        const results = await Promise.all(newImported.map(guest => createGuest({ name: guest.name, email: guest.email, phone: guest.phone, origin: guest.origin, company: guest.company })))
        const failed = results.filter(result => result.error)
        if (failed.length) window.alert(`${failed.length} fila(s) no pudieron guardarse. ${skipped ? `${skipped} duplicada(s) fueron omitidas. ` : ''}${failed[0].error?.message || ''}`)
        else if (skipped) window.alert(`${newImported.length} invitación(es) cargadas. ${skipped} contacto(s) duplicado(s) fueron omitidos.`)
        await queryClient.invalidateQueries({ queryKey: ['guests'] })
      } else queryClient.setQueryData<Guest[]>(['guests'], current => [...(current || demoGuests), ...newImported])
      e.target.value = ''
    })
  }
  const count = (status: GuestStatus) => data.filter(g => g.status === status).length
  return <section className="dashboard"><div className="page-heading"><div><p className="eyebrow orange">Gestión de invitados</p><h2>Lista de invitados <span>{data.length}</span></h2><p className="muted">Consulta respuestas y administra tus invitaciones.</p></div>{canManageInvitations && <div className="page-actions"><button className="button button-orange" disabled={bulkSending || deletingGuest !== null || editingGuest !== null || individualSends > 0 || isPending || isError || pendingEmails.length === 0} onClick={() => void sendAllInvitations()}><Send size={16} /> {bulkSending ? 'Enviando invitaciones…' : `Enviar todas las invitaciones (${pendingEmails.length})`}</button><input ref={fileInput} className="hidden-file" type="file" accept=".csv,text/csv" onChange={importCsv} /><button className="button button-dark" onClick={exportCsv}><Download size={16} /> Exportar CSV</button><button className="button button-dark" onClick={() => fileInput.current?.click()}><Upload size={16} /> Cargar masivamente</button><button className="button button-orange" onClick={() => setShowNew(true)}><Users size={16} /> Agregar invitado</button></div>}</div><div className="filter-bar"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, correo, celular o empresa" /></div><label className="filter-button"><Filter size={16} /><select aria-label="Filtrar por respuesta" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | GuestStatus)}><option value="all">Todos los estados</option><option value="Confirmado">Confirmados</option><option value="Pendiente">Pendientes de respuesta</option><option value="Canceló">Cancelaron</option></select></label><label className="filter-button"><Send size={16} /><select aria-label="Filtrar por envío de invitación" value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)}><option value="all">Todas las invitaciones</option><option value="sent">Enviadas por algún canal</option><option value="pending">Sin enviar por ningún canal</option><option value="email">Correo enviado</option><option value="whatsapp">WhatsApp enviado</option></select></label></div><p className="guest-list-summary" aria-live="polite">Mostrando {filtered.length} de {data.length} invitados · Nombre A–Z</p>{canManageInvitations && <p className="guest-list-summary">El envío masivo incluye todos los contactos con correo y sin envíos registrados por correo ni WhatsApp, sin importar los filtros.</p>}{bulkNotice && <p className="guest-list-summary" role="status">{bulkNotice}</p>}{actionError && <p className="form-error guest-action-error">{actionError}</p>}<div className="panel guests-table-panel"><div className="table-tabs"><button className={filterStatus === 'all' ? 'selected' : ''} onClick={() => setFilterStatus('all')}>Todos <b>{data.length}</b></button><button className={filterStatus === 'Confirmado' ? 'selected' : ''} onClick={() => setFilterStatus('Confirmado')}>Confirmados <b>{count('Confirmado')}</b></button><button className={filterStatus === 'Pendiente' ? 'selected' : ''} onClick={() => setFilterStatus('Pendiente')}>Pendientes <b>{count('Pendiente')}</b></button><button className={filterStatus === 'Canceló' ? 'selected' : ''} onClick={() => setFilterStatus('Canceló')}>Cancelaron <b>{count('Canceló')}</b></button></div><div className="table-head"><span>INVITADO</span><span>EMPRESA</span><span>CORREO</span><span>RESPUESTA</span><span>ASISTENCIA</span><span>ACCIONES</span></div>{filtered.length === 0 && <p className="guest-list-empty">No hay invitados que coincidan con estos filtros.</p>}{filtered.map(g => <div className="table-line" key={g.id}><div className="guest-name"><div className="table-avatar">{g.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><span><strong>{g.name}</strong><small>{g.email || g.phone}</small></span></div><span>{g.company}</span><InvitationState guest={g} disabled={bulkSending || deletingGuest !== null || editingGuest !== null} /><span className={`status status-${g.status === 'Confirmado' ? 'confirmed' : g.status === 'Canceló' ? 'cancelled' : 'pending'}`}><i></i>{g.status}</span><span className={g.checkedIn ? 'checked-label' : 'muted'}>{g.checkedIn ? <><CheckCircle2 size={14} /> Presente</> : 'No ha llegado'}</span><div className="guest-row-actions"><button className="row-action" disabled={passLoading === g.id} onClick={() => void openPass(g)}><Eye size={15} /> {passLoading === g.id ? 'Abriendo…' : 'Ver entrada'}</button><button className="row-action arrival-action" disabled={arrivalLoading !== null || deletingGuest !== null} onClick={() => void markArrival(g)}><CheckCircle2 size={15} /> {arrivalLoading === g.id ? 'Guardando…' : g.checkedIn ? 'Marcar como no ha llegado' : 'Registrar llegada'}</button><InvitationState guest={g} channel="whatsapp" disabled={bulkSending || deletingGuest !== null || editingGuest !== null} menuActions={<><button className="row-action" disabled={cancellingGuest !== null || deletingGuest !== null || g.status === 'Canceló'} onClick={() => void cancelGuest(g)}><X size={15} /> {cancellingGuest === g.id ? 'Guardando…' : g.status === 'Canceló' ? 'Cancelación registrada' : 'Marcar como canceló'}</button><button className="row-action" disabled={bulkSending || individualSends > 0 || deletingGuest !== null} onClick={() => setEditingGuest(g)}><Pencil size={15} /> Editar</button><button className="row-action" disabled={bulkSending || individualSends > 0 || deletingGuest !== null || cancellingGuest !== null || arrivalLoading !== null} onClick={() => void removeGuest(g)}><Trash2 size={15} /> {deletingGuest === g.id ? 'Eliminando…' : 'Eliminar'}</button></>} /></div></div>)}</div>{canManageInvitations && showNew && <GuestFormModal onClose={() => setShowNew(false)} />}{editingGuest && <GuestFormModal key={editingGuest.id} guest={editingGuest} onClose={() => setEditingGuest(null)} />}{passGuest && <GuestPassModal guest={passGuest} token={passToken} onClose={() => { setPassGuest(null); setPassToken('') }} />}</section>
}

function CheckInPage() {
  const [search, setSearch] = useState('')
  const [attendanceError, setAttendanceError] = useState('')
  const [checking, setChecking] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanPending, setScanPending] = useState(false)
  const [scanNotice, setScanNotice] = useState('')
  const scanInFlightRef = useRef(false)
  const { data = demoGuests } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const matches = search.length > 1 ? data.filter(g => `${g.name} ${g.email} ${g.phone} ${g.company}`.toLowerCase().includes(search.toLowerCase())) : []
  const checked = data.filter(guest => guest.checkedIn).map(guest => guest.id)
  async function check(id: string, present = true) {
    setAttendanceError('')
    setChecking(id)
    try {
      await saveAttendance(id, present)
      return null
    } catch (error) {
      setAttendanceError('No pudimos actualizar la asistencia. Inténtalo de nuevo.')
      return error instanceof Error ? error : new Error('No se pudo actualizar la asistencia')
    } finally {
      setChecking(null)
    }
  }
  async function resolveQr(value: string) {
    return organizerAction(async () => {
      if (!value.trim() || scanInFlightRef.current) return
      scanInFlightRef.current = true
      setScannerOpen(false)
      setScanPending(true)
      setScannerError('')
      setAttendanceError('')
      setScanNotice('')
      try {
        const result = await findGuestByQr(value)
        if (result.error || !result.data) {
          setScannerError(!result.error || result.error.message === 'Invitación no encontrada'
            ? 'No encontramos una invitación con ese QR. Puedes volver a escanear o buscar por nombre.'
            : 'No pudimos validar la invitación. Revisa tu conexión y vuelve a escanear.')
          return
        }
        setSearch(result.data.name || '')
        if (checked.includes(result.data.id)) {
          setScanNotice(`${result.data.name}: su llegada ya estaba registrada.`)
        } else {
          const checkError = await check(result.data.id)
          if (checkError) {
            setScannerError('La invitación fue encontrada, pero no pudimos registrar la entrada. Vuelve a escanear o registra la llegada por nombre.')
            return
          }
          setScanNotice(`Llegada registrada: ${result.data.name}.`)
        }
      } catch {
        setScannerError('No pudimos procesar este QR. Verifica tu conexión y vuelve a escanear.')
      } finally {
        scanInFlightRef.current = false
        setScanPending(false)
      }
    })
  }
  return <section className="checkin-page"><div className="checkin-intro"><p className="eyebrow orange">Registro en evento</p><h2>Bienvenidos</h2><p className="muted">Busca a la persona invitada o escanea su código QR para registrar su llegada.</p></div><div className="checkin-tools"><div className="checkin-search"><Search size={24} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Escribe un nombre, correo o empresa..." /></div><button className="button button-orange scan-button" disabled={scanPending || checking !== null} onClick={() => { setScannerError(''); setScanNotice(''); setScanCode(''); setScannerOpen(true) }}><QrCode size={19} /> {scannerError ? 'Volver a escanear QR' : 'Escanear QR'}</button></div>{scanPending && <p className="checkin-feedback" role="status">Validando invitación…</p>}{scanNotice && <p className="checkin-feedback checkin-success" role="status">{scanNotice}</p>}{scannerError && <p className="form-error checkin-feedback" role="alert">{scannerError}</p>}{attendanceError && !scannerError && <p className="form-error" role="alert">{attendanceError}</p>}{matches.length > 0 && <div className="checkin-results">{matches.map(g => <div className="checkin-result" key={g.id}><div className="table-avatar">{g.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div className="guest-name"><strong>{g.name}</strong><small>{g.company} · {g.origin}</small></div>{g.checkedIn ? <div className="attendance-actions"><span className="present"><CheckCircle2 size={17} /> Presente</span><button className="row-action" disabled={scanPending || checking !== null} onClick={() => void check(g.id, false)}>{checking === g.id ? 'Guardando…' : 'Marcar como no ha llegado'}</button></div> : <button className="button button-orange small" disabled={scanPending || checking !== null} onClick={() => void check(g.id)}>{checking === g.id ? 'Guardando…' : 'Registrar entrada'}</button>}</div>)}</div>}<div className="checkin-event-card"><div className="event-date-block"><strong>17</strong><span>NOV<br />2026</span></div><div><p className="eyebrow">Evento de hoy</p><h3>{event.title} <span>{event.accent}</span></h3><p className="muted"><MapPin size={15} /> {event.venue} · {event.city}</p></div><div className="checkin-count"><strong>{checked.length}</strong><span>registrados</span></div></div>{scannerOpen && <QrScanner onClose={() => setScannerOpen(false)} onCode={resolveQr} code={scanCode} setCode={setScanCode} />}</section>
}

function ConfigurationPage() {
  const { data: members = [], isLoading, refetch } = useQuery({ queryKey: ['event-members'], queryFn: async () => (await getEventMembers()).data })
  const [form, setForm] = useState({ email: '', displayName: '', role: 'staff' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function saveMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const result = await addEventMember(form)
    setSaving(false)
    if (result.error) { setError(result.error.message.includes('Auth user not found') ? 'Ese correo aún no existe en Supabase Authentication.' : 'No se pudo autorizar al usuario.'); return }
    setForm({ email: '', displayName: '', role: 'staff' })
    await refetch()
  }
  return <section className="dashboard"><div className="page-heading"><div><p className="eyebrow orange">Configuración</p><h2>Detalles del evento</h2><p className="muted">Esta información aparece en el registro público.</p></div><button className="button button-orange">Guardar cambios</button></div><div className="panel settings-panel"><div className="settings-section"><p className="eyebrow">Identidad del evento</p><label>Nombre del evento<input defaultValue={`${event.title} ${event.accent}`} /></label><label>Tipo de evento<input defaultValue="Conferencia privada" /></label></div><div className="settings-section"><p className="eyebrow">Fecha y ubicación</p><div className="two-fields"><label>Fecha<input defaultValue="17/11/2026" /></label><label>Hora<input defaultValue="9:00 h" /></label></div><label>Sede<input defaultValue={`${event.venue}, ${event.city}`} /></label></div></div><div className="members-settings"><div><p className="eyebrow orange">Acceso al panel</p><h3>Usuarios autorizados</h3><p className="muted">Solo los usuarios registrados en Supabase Authentication pueden entrar al panel.</p></div><div className="members-list">{isLoading ? <p className="muted">Cargando usuarios…</p> : members.map(member => <div className="member-row" key={member.userId}><div className="table-avatar">{member.displayName.split(' ').map((part: string) => part[0]).slice(0, 2).join('')}</div><div><strong>{member.displayName}</strong><small>{member.email}</small></div><span>{member.role}</span></div>)}</div><form className="member-form" onSubmit={saveMember}><div><p className="eyebrow">Agregar acceso</p><p className="muted">El correo debe existir previamente en Authentication → Users.</p></div><label>Correo electrónico<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" /></label><label>Nombre <small>(opcional)</small><input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Nombre del usuario" /></label><label>Rol<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="admin">Administrador</option><option value="staff">Equipo</option><option value="viewer">Consulta</option></select></label>{error && <p className="form-error">{error}</p>}<button className="button button-orange" disabled={saving}>{saving ? 'Guardando…' : 'Autorizar usuario'} <ArrowRight size={16} /></button></form></div></section>
}

const rootRoute = createRootRoute({ component: PublicShell })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: RegistrationPage })
const tokenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/registro/$token', component: TokenRegistrationPage })
const informationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/informacion', component: InformationPage })
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminLayout })
const summaryRoute = createRoute({ getParentRoute: () => adminRoute, path: '/', component: SummaryPage })
const guestsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/invitados', component: GuestsPage })
const checkinRoute = createRoute({ getParentRoute: () => adminRoute, path: '/check-in', component: CheckInPage })
const configRoute = createRoute({ getParentRoute: () => adminRoute, path: '/configuracion', component: ConfigurationPage })
const routeTree = rootRoute.addChildren([homeRoute, tokenRoute, informationRoute, adminRoute.addChildren([summaryRoute, guestsRoute, checkinRoute, configRoute])])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

function App() { return <QueryClientProvider client={queryClient}><RouterView /></QueryClientProvider> }
function RouterView() { return <div className={supabaseConfig.url && supabaseConfig.key ? 'supabase-ready' : ''}><RouterProvider router={router} /></div> }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
