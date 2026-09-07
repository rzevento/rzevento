import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, Clock3, Download, Eye, EyeOff, Filter, LayoutDashboard, LockKeyhole, MapPin, Menu, MoreHorizontal, QrCode, Search, Send, Settings2, ShieldCheck, Upload, Users, X } from 'lucide-react'
import { addEventMember, cancelRsvp, checkInGuest, createGuest, findGuestByQr, getCurrentOrganizerProfile, getEventMembers, markInvitationSent, submitRsvp, supabase } from './lib/supabase'
import './styles.css'

type GuestStatus = 'Confirmado' | 'Pendiente' | 'Canceló'
type Guest = { id: string; name: string; company: string; email: string; phone: string; origin: string; invite: string; status: GuestStatus; checkedIn: boolean }

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
  if (!supabase) return demoGuests
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return []
  const { data, error } = await supabase.from('guests').select('id, full_name, company, email, phone, origin, invitations(status), rsvps(status), check_ins(id)').eq('event_id', activeEvent.id).order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((guest) => {
    const invitation = Array.isArray(guest.invitations) ? guest.invitations[0] : guest.invitations
    const rsvp = Array.isArray(guest.rsvps) ? guest.rsvps[0] : guest.rsvps
    const checkIn = Array.isArray(guest.check_ins) ? guest.check_ins[0] : guest.check_ins
    const status: GuestStatus = rsvp?.status === 'confirmed' ? 'Confirmado' : rsvp?.status === 'cancelled' || rsvp?.status === 'declined' ? 'Canceló' : 'Pendiente'
    return { id: String(guest.id), name: guest.full_name || 'Invitado pendiente', company: guest.company || 'Sin empresa', email: guest.email || '', phone: guest.phone || '', origin: guest.origin || 'Sin origen', invite: invitation?.status === 'sent' ? 'Enviada' : 'Pendiente', status, checkedIn: Boolean(checkIn) }
  })
}

function Logo() { return <img className="brand-logo" src="/logo-rz.png" alt="RZ" /> }

function PublicShell() {
  return <div className="public-shell"><header className="public-nav"><Link to="/" className="brand"><Logo /><span>RZ EVENTOS</span></Link><nav className="public-menu" aria-label="Navegación principal"><Link to="/informacion" activeProps={{ className: 'active' }}>Sobre el evento</Link><Link to="/admin" className="quiet-link">Acceso organizador <ArrowRight size={15} /></Link></nav></header><Outlet /></div>
}

function RegistrationPage({ token = 'demo' }: { token?: string }) {
  const [sent, setSent] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', origin: '' })
  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  if (sent) return <main className="register-page success-page"><div className="success-card"><div className="success-icon">{cancelled ? <span>×</span> : <Check size={25} />}</div><p className="eyebrow">{cancelled ? 'Asistencia cancelada' : 'Registro recibido'}</p><h1>{cancelled ? 'Tu cancelación quedó registrada.' : `Gracias, ${form.name.split(' ')[0] || 'por confirmar'}.`}</h1><p>{cancelled ? 'Si cambias de opinión, puedes volver a confirmar desde este mismo enlace.' : 'Tu lugar para la conferencia está apartado. Te esperamos el martes 17 de noviembre en Hyatt Regency Andares.'}</p>{!cancelled && <div className="success-details"><CalendarDays size={18} /><span>{event.date}<br /><small>{event.time}</small></span></div>}<div className="success-actions"><Link className="button button-dark" to="/">Volver al inicio</Link>{!cancelled && <button className="cancel-link" onClick={() => { void cancelRsvp(token).then(result => { if (!result.error) setCancelled(true) }) }}>Ya no podré asistir</button>}</div></div></main>
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Escribe tu correo o tu celular para identificar tu registro.')
      return
    }
    setSubmitting(true)
    setError('')
    const result = await submitRsvp({ token, ...form })
    setSubmitting(false)
    if (result.error) {
      setError('No pudimos completar el registro. Verifica tu enlace e inténtalo de nuevo.')
      return
    }
    setSent(true)
  }
  return <main className="register-page"><section className="register-intro"><div className="circle circle-one"></div><div className="circle circle-two"></div><Logo /><p className="eyebrow">{event.eyebrow}</p><h1>{event.title} <span>{event.accent}</span></h1><div className="line"></div><p className="intro-copy">Una conversación para quienes construyen empresas que trascienden generaciones.</p><div className="event-meta"><div><CalendarDays size={19} /><span>{event.date}<small>{event.time}</small></span></div><div><MapPin size={19} /><span>{event.venue}<small>{event.city}</small></span></div></div></section><section className="register-card"><div className="card-top"><p className="eyebrow">Evento exclusivo por invitación</p><h2>Confirma tu asistencia</h2><div className="invitation-notices"><p><ShieldCheck size={15} /> Ingresa el correo o celular con el que fuiste invitado.</p><p><LockKeyhole size={15} /> Esta invitación es personal e intransferible.</p></div><p>Completa tus datos para reservar tu lugar.</p></div><form onSubmit={handleSubmit}><label>Nombre completo<input required value={form.name} onChange={update('name')} placeholder="Tu nombre" /></label><label>Correo electrónico<input type="email" value={form.email} onChange={update('email')} placeholder="nombre@empresa.com" /></label><label>Celular<input type="tel" value={form.phone} onChange={update('phone')} placeholder="10 dígitos" /></label><label>Empresa<input required value={form.origin} onChange={update('origin')} placeholder="Nombre de la empresa" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-orange" type="submit" disabled={submitting}>{submitting ? 'Guardando…' : 'Confirmar asistencia'} {!submitting && <ArrowRight size={17} />}</button></form><p className="privacy-note"><ShieldCheck size={15} /> Tus datos se utilizarán únicamente para la organización del evento.</p></section></main>
}

function TokenRegistrationPage() {
  const { token } = useParams({ from: '/registro/$token' })
  return <RegistrationPage token={token} />
}

function InformationPage() {
  return <main className="information-page"><section className="information-hero"><div><p className="eyebrow orange">Sobre el evento</p><h1>Ideas para construir empresas que <span>trascienden.</span></h1><p className="information-lead">Una conversación cercana para familias empresarias que quieren entender mejor los retos y las oportunidades de crecer en tiempos de cambio.</p><Link className="button button-orange" to="/">Confirmar asistencia <ArrowRight size={17} /></Link></div></section><section className="information-grid"><article className="information-card information-card-dark"><p className="eyebrow orange">La conversación</p><h2>Familias empresarias en la era de las turbulencias</h2><p>El encuentro propone un espacio para compartir perspectivas prácticas sobre continuidad, liderazgo y toma de decisiones cuando el entorno cambia.</p><div className="book-note"><span className="eyebrow orange">Libro de referencia</span><strong>Familias empresarias en la sociedad del cambio</strong><small>Agenda estratégica para la gobernanza y el liderazgo transformador</small><p>En su libro, Manuel Bermejo aborda la transición generacional, la gobernanza y el liderazgo que necesitan las familias empresarias para adaptarse a una sociedad marcada por la tecnología, la globalización y la incertidumbre.</p><a href="https://www.lidlibros.com/fichalibro.php?edi=88&libro=10560" target="_blank" rel="noreferrer">Conocer el libro <ArrowRight size={14} /></a></div><div className="information-details"><div><CalendarDays size={18} /><span>{event.date}<small>{event.time}</small></span></div><div><MapPin size={18} /><span>{event.venue}<small>{event.city}</small></span></div></div></article><article className="information-card speaker-card"><p className="eyebrow orange">El expositor</p><div className="speaker-initials" aria-hidden="true">MB</div><h2>{event.speaker}</h2><div className="speaker-bio"><p>Manuel Bermejo Sánchez es especialista en empresa familiar, gobierno corporativo y liderazgo. Es presidente ejecutivo y fundador de The Family Advisory Board, así como director general de los Programas de Empresa Familiar de Executive Education en IE Business School.</p><p>Es doctor en Economía por la Universidad de Granada, ingeniero agrónomo por la Universidad Politécnica de Madrid y MBA por IE Business School. También cuenta con formación en Harvard Business School y Babson College.</p><p>Durante más de tres décadas ha acompañado a familias empresarias y participado como profesor, consejero y conferencista en Europa y Latinoamérica.</p></div><div className="speaker-moderator"><span>Conversación moderada por</span><strong>{event.moderator}</strong></div></article></section><section className="information-footer"><div><p className="eyebrow">Una invitación</p><h2>Reserva tu lugar en esta conversación.</h2></div><Link className="outline-button" to="/">Ir al registro <ArrowRight size={16} /></Link></section></main>
}

function AdminLayout() {
  const { data: guests = [] } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const [sessionReady, setSessionReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [organizer, setOrganizer] = useState({ displayName: 'Administrador', role: 'Administrador' })
  const [localAuthenticated, setLocalAuthenticated] = useState(() => sessionStorage.getItem('rz-organizer-authenticated') === 'true')
  useEffect(() => {
    if (!supabase) {
      setAuthenticated(localAuthenticated)
      setOrganizer({ displayName: 'María Ríos', role: 'Administradora' })
      setSessionReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setSessionReady(true); if (data.session) void getCurrentOrganizerProfile().then(result => { if (result.data) setOrganizer(result.data) }) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)))
    return () => listener.subscription.unsubscribe()
  }, [localAuthenticated])
  if (!sessionReady) return <div className="auth-loading">Cargando acceso…</div>
  if (!authenticated) return <AdminLogin onLocalAuthenticated={() => { sessionStorage.setItem('rz-organizer-authenticated', 'true'); setLocalAuthenticated(true); setAuthenticated(true) }} />
  const organizerInitials = organizer.displayName.split(' ').map(name => name[0]).slice(0, 2).join('').toUpperCase()
  const sentInvitations = guests.filter(guest => guest.invite === 'Enviada').length
  return <div className="admin-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /><span>RZ EVENTOS</span></div><div className="event-switcher"><span>EVENTO ACTIVO</span><strong>Familias empresarias</strong><ChevronDown size={15} /></div><nav><Link to="/admin" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}><LayoutDashboard size={18} /> Resumen</Link><Link to="/admin/invitados" activeProps={{ className: 'active' }}><Users size={18} /> Invitados <b>{sentInvitations}</b></Link><Link to="/admin/check-in" activeProps={{ className: 'active' }}><CheckCircle2 size={18} /> Registro en evento</Link><Link to="/admin/configuracion" activeProps={{ className: 'active' }}><Settings2 size={18} /> Configuración</Link></nav><div className="sidebar-bottom"><div className="user-avatar">{organizerInitials}</div><div><strong>{organizer.displayName}</strong><small>{organizer.role}</small></div><button className="sidebar-logout" onClick={() => { sessionStorage.removeItem('rz-organizer-authenticated'); if (supabase) void supabase.auth.signOut(); else { setLocalAuthenticated(false); setAuthenticated(false) } }} aria-label="Cerrar sesión"><MoreHorizontal size={18} /></button></div></aside><main className="admin-main"><header className="admin-header"><button className="mobile-menu"><Menu size={20} /></button><div><p className="eyebrow">Martes 17 de noviembre de 2026</p><h1>Familias empresarias</h1></div><div className="header-actions"><button className="icon-button"><Download size={17} /></button><button className="button button-orange small"><Send size={16} /> Nueva invitación</button></div></header><Outlet /></main></div>
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
  const { data = demoGuests } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const total = data.length
  const confirmed = data.filter(g => g.status === 'Confirmado').length
  const pending = data.filter(g => g.status === 'Pendiente').length
  const cancelled = data.filter(g => g.status === 'Canceló').length
  const checked = data.filter(g => g.checkedIn).length
  const percent = (value: number) => total ? `${Math.round((value / total) * 100)}%` : '0%'
  return <section className="dashboard"><div className="welcome-row"><div><p className="eyebrow orange">Panel de control</p><h2>Buenos días, María</h2><p className="muted">Aquí tienes el pulso de tus invitaciones.</p></div><Link to="/admin/invitados" className="text-link">Ver lista completa <ArrowRight size={16} /></Link></div><div className="stats-grid"><Stat icon={<Users />} value={String(total)} label="Invitados totales" detail="Lista actual" /><Stat icon={<CheckCircle2 />} value={String(confirmed)} label="Confirmados" detail={`${percent(confirmed)} de la lista`} accent /><Stat icon={<Clock3 />} value={String(pending)} label="Sin respuesta" detail={`${percent(pending)} de la lista`} /><Stat icon={<Check />} value={String(checked)} label="Ya llegaron" detail="Día del evento" /></div><div className="dashboard-columns"><div className="panel"><div className="panel-heading"><div><h3>Estado de invitaciones</h3><p className="muted">Distribución de la lista actual</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="bar-chart" aria-label="Gráfica del estado de invitaciones"><div className="bar-row"><span>Confirmados <b>{confirmed} · {percent(confirmed)}</b></span><div><i style={{ width: percent(confirmed) }}></i></div></div><div className="bar-row"><span>Pendientes <b>{pending} · {percent(pending)}</b></span><div><i className="gray-bar" style={{ width: percent(pending) }}></i></div></div><div className="bar-row"><span>Cancelaron <b>{cancelled} · {percent(cancelled)}</b></span><div><i className="soft-bar" style={{ width: percent(cancelled) }}></i></div></div></div></div><div className="panel next-event"><div className="panel-heading"><div><h3>Detalles del evento</h3><p className="muted">Tu próximo encuentro</p></div><CalendarDays className="orange-icon" size={20} /></div><div className="next-event-title">{event.title} <span>{event.accent}</span></div><div className="mini-detail"><CalendarDays size={16} /> {event.date}</div><div className="mini-detail"><MapPin size={16} /> {event.venue}, {event.city}</div><Link to="/admin/configuracion" className="outline-link">Editar evento <ArrowRight size={15} /></Link></div></div><div className="panel recent-panel"><div className="panel-heading"><div><h3>Actividad reciente</h3><p className="muted">Últimas respuestas registradas</p></div><Link to="/admin/invitados" className="text-link">Ver todo <ArrowRight size={15} /></Link></div><GuestRows guests={data.slice(0, 3)} /></div></section>
}

function Stat({ icon, value, label, detail, accent = false }: { icon: React.ReactNode; value: string; label: string; detail: string; accent?: boolean }) { return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="stat-icon">{icon}</div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div> }

function GuestRows({ guests }: { guests: Guest[] }) { return <div className="guest-rows">{guests.map(g => <div className="guest-row" key={g.id}><div className="table-avatar">{g.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div className="guest-name"><strong>{g.name}</strong><small>{g.company}</small></div><span className={`status status-${g.status === 'Confirmado' ? 'confirmed' : g.status === 'Canceló' ? 'cancelled' : 'pending'}`}><i></i>{g.status}</span><small className="row-origin">{g.origin}</small><MoreHorizontal size={17} className="row-more" /></div>)}</div> }

function InvitationState({ guest }: { guest: Guest }) {
  const [saving, setSaving] = useState(false)
  async function markSent() {
    setSaving(true)
    const result = await markInvitationSent(guest.id)
    setSaving(false)
    if (!result.error) queryClient.setQueryData<Guest[]>(['guests'], current => (current || demoGuests).map(item => item.id === guest.id ? { ...item, invite: 'Enviada' } : item))
  }
  return guest.invite === 'Enviada' ? <span className="sent-label"><Send size={13} /> Enviada</span> : <button className="send-inline" disabled={saving} onClick={() => void markSent()}>{saving ? 'Guardando…' : 'Marcar enviada'}</button>
}

function NewGuestModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', origin: '', company: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Captura un correo o un celular.')
      return
    }
    setSaving(true)
    const result = await createGuest(form)
    setSaving(false)
    if (result.error) { setError('No se pudo guardar al invitado.'); return }
    if (result.demo) queryClient.setQueryData<Guest[]>(['guests'], current => [...(current || demoGuests), { id: `demo-${Date.now()}`, name: form.name || 'Invitado pendiente', company: 'Sin empresa', email: form.email, phone: form.phone, origin: 'Sin origen', invite: 'Pendiente', status: 'Pendiente', checkedIn: false }])
    else await queryClient.invalidateQueries({ queryKey: ['guests'] })
    onClose()
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button><p className="eyebrow orange">Nueva invitación</p><h2>Agregar invitado</h2><p className="muted">Captura el correo o celular con el que fue invitado. El nombre puede completarse después.</p><form onSubmit={save}><label>Nombre completo <small>(opcional)</small><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Si ya lo tienes" /></label><label>Correo electrónico <small>(opcional si registras celular)</small><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nombre@empresa.com" /></label><label>Celular <small>(opcional si registras correo)</small><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="10 dígitos" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-orange" disabled={saving}>{saving ? 'Guardando…' : 'Crear invitación'} <ArrowRight size={16} /></button></form></div></div>
}

function GuestsPage() {
  const { data = demoGuests } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | GuestStatus>('all')
  const fileInput = useRef<HTMLInputElement>(null)
  const filtered = data.filter(g => `${g.name} ${g.company} ${g.email} ${g.phone}`.toLowerCase().includes(search.toLowerCase()) && (filterStatus === 'all' || g.status === filterStatus))
  function exportCsv() {
    const header = ['nombre', 'correo', 'celular', 'empresa', 'invitacion', 'respuesta', 'asistencia']
    const rows = data.map(g => [g.name, g.email, g.phone, g.company, g.invite, g.status, g.checkedIn ? 'Presente' : 'Pendiente'])
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'invitados-familias-empresarias.csv'
    anchor.click()
    URL.revokeObjectURL(url)
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
    if (imported.length === 0) window.alert('No encontré filas válidas. Cada invitado necesita nombre y correo o celular.')
    else if (supabase) {
      const results = await Promise.all(imported.map(guest => createGuest({ name: guest.name, email: guest.email, phone: guest.phone, origin: guest.origin, company: guest.company })))
      if (results.some(result => result.error)) window.alert('Algunas filas no pudieron guardarse. Revisa los correos duplicados.')
      await queryClient.invalidateQueries({ queryKey: ['guests'] })
    } else queryClient.setQueryData<Guest[]>(['guests'], current => [...(current || demoGuests), ...imported])
    e.target.value = ''
  }
  const count = (status: GuestStatus) => data.filter(g => g.status === status).length
  return <section className="dashboard"><div className="page-heading"><div><p className="eyebrow orange">Gestión de invitados</p><h2>Lista de invitados <span>{data.length}</span></h2><p className="muted">Consulta respuestas y administra tus invitaciones.</p></div><div className="page-actions"><input ref={fileInput} className="hidden-file" type="file" accept=".csv,text/csv" onChange={importCsv} /><button className="button button-dark" onClick={exportCsv}><Download size={16} /> Exportar CSV</button><button className="button button-dark" onClick={() => fileInput.current?.click()}><Upload size={16} /> Cargar masivamente</button><button className="button button-orange" onClick={() => setShowNew(true)}><Users size={16} /> Agregar invitado</button></div></div><div className="filter-bar"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, correo, celular o empresa" /></div><button className="filter-button"><Filter size={16} /> Todos los estados <ChevronDown size={15} /> </button><button className="filter-button">Invitación enviada <ChevronDown size={15} /></button></div><div className="panel guests-table-panel"><div className="table-tabs"><button className={filterStatus === 'all' ? 'selected' : ''} onClick={() => setFilterStatus('all')}>Todos <b>{data.length}</b></button><button className={filterStatus === 'Confirmado' ? 'selected' : ''} onClick={() => setFilterStatus('Confirmado')}>Confirmados <b>{count('Confirmado')}</b></button><button className={filterStatus === 'Pendiente' ? 'selected' : ''} onClick={() => setFilterStatus('Pendiente')}>Pendientes <b>{count('Pendiente')}</b></button><button className={filterStatus === 'Canceló' ? 'selected' : ''} onClick={() => setFilterStatus('Canceló')}>Cancelaron <b>{count('Canceló')}</b></button></div><div className="table-head"><span>INVITADO</span><span>ORIGEN</span><span>INVITACIÓN</span><span>RESPUESTA</span><span>ASISTENCIA</span><span></span></div>{filtered.map(g => <div className="table-line" key={g.id}><div className="guest-name"><div className="table-avatar">{g.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><span><strong>{g.name}</strong><small>{g.email || g.phone}</small></span></div><span>{g.origin}</span><InvitationState guest={g} /><span className={`status status-${g.status === 'Confirmado' ? 'confirmed' : g.status === 'Canceló' ? 'cancelled' : 'pending'}`}><i></i>{g.status}</span><span className={g.checkedIn ? 'checked-label' : 'muted'}>{g.checkedIn ? <><CheckCircle2 size={14} /> Presente</> : 'Pendiente'}</span><MoreHorizontal size={17} className="row-more" /></div>)}</div>{showNew && <NewGuestModal onClose={() => setShowNew(false)} />}</section>
}

function CheckInPage() {
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<string[]>(['demo-1'])
  const [checking, setChecking] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scanCode, setScanCode] = useState('')
  const { data = demoGuests } = useQuery({ queryKey: ['guests'], queryFn: guestQuery })
  const matches = search.length > 1 ? data.filter(g => `${g.name} ${g.email} ${g.phone} ${g.company}`.toLowerCase().includes(search.toLowerCase())) : []
  async function check(id: string) {
    setChecking(id)
    const result = await checkInGuest(id)
    setChecking(null)
    if (!result.error) setChecked(current => current.includes(id) ? current : [...current, id])
  }
  async function resolveQr(value: string) {
    setScannerError('')
    const result = await findGuestByQr(value)
    if (result.error || !result.data) { setScannerError('No encontramos una invitación con ese QR.'); return }
    setScannerOpen(false)
    setSearch(result.data.name)
    if (!checked.includes(result.data.id)) await check(result.data.id)
  }
  return <section className="checkin-page"><div className="checkin-intro"><p className="eyebrow orange">Registro en evento</p><h2>Bienvenidos</h2><p className="muted">Busca a la persona invitada o escanea su código QR para registrar su llegada.</p></div><div className="checkin-tools"><div className="checkin-search"><Search size={24} /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Escribe un nombre, correo o empresa..." /></div><button className="button button-orange scan-button" onClick={() => { setScannerError(''); setScannerOpen(true) }}><QrCode size={19} /> Escanear QR</button></div>{matches.length > 0 && <div className="checkin-results">{matches.map(g => <div className="checkin-result" key={g.id}><div className="table-avatar">{g.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div className="guest-name"><strong>{g.name}</strong><small>{g.company} · {g.origin}</small></div>{checked.includes(g.id) ? <span className="present"><CheckCircle2 size={17} /> Presente</span> : <button className="button button-orange small" disabled={checking === g.id} onClick={() => void check(g.id)}>{checking === g.id ? 'Guardando…' : 'Registrar entrada'}</button>}</div>)}</div>}<div className="checkin-event-card"><div className="event-date-block"><strong>17</strong><span>NOV<br />2026</span></div><div><p className="eyebrow">Evento de hoy</p><h3>{event.title} <span>{event.accent}</span></h3><p className="muted"><MapPin size={15} /> {event.venue} · {event.city}</p></div><div className="checkin-count"><strong>{checked.length}</strong><span>registrados</span></div></div>{scannerOpen && <QrScanner onClose={() => setScannerOpen(false)} onCode={resolveQr} error={scannerError} code={scanCode} setCode={setScanCode} />}</section>
}

function QrScanner({ onClose, onCode, error, code, setCode }: { onClose: () => void; onCode: (code: string) => void; error: string; code: string; setCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState('')
  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: number | undefined
    let active = true
    async function start() {
      if (!('BarcodeDetector' in window)) { setCameraError('Tu navegador no admite escaneo desde cámara. Usa el código manual abajo.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scan = async () => { if (!active || !videoRef.current) return; const codes = await detector.detect(videoRef.current); if (codes[0]?.rawValue) { active = false; onCode(codes[0].rawValue) } else timer = window.setTimeout(scan, 250) }
        void scan()
      } catch { setCameraError('No pudimos abrir la cámara. Revisa el permiso o usa el código manual.') }
    }
    void start()
    return () => { active = false; if (timer) window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [])
  return <div className="modal-backdrop scanner-backdrop"><div className="scanner-card"><button className="modal-close" onClick={onClose} aria-label="Cerrar escáner"><X size={19} /></button><div className="scanner-heading"><QrCode size={22} /><div><p className="eyebrow orange">Registro rápido</p><h3>Escanea el QR de la invitación</h3></div></div><div className="scanner-viewport">{cameraError ? <div className="scanner-message"><AlertCircle size={25} /><p>{cameraError}</p></div> : <video ref={videoRef} muted playsInline />}</div><p className="scanner-help">Apunta la cámara al código QR del invitado.</p><div className="manual-code"><input value={code} onChange={e => setCode(e.target.value)} placeholder="Pega aquí el enlace o token" onKeyDown={e => { if (e.key === 'Enter') void onCode(code) }} /><button className="button button-dark small" disabled={!code.trim()} onClick={() => void onCode(code)}>Buscar</button></div>{error && <p className="form-error scanner-error">{error}</p>}</div></div>
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
