import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined

export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: authStorage,
      },
    })
  : null

export async function getEventMembers() {
  if (!supabase) return { data: [{ userId: 'demo-user', email: 'maria@rzevento.com', displayName: 'María Ríos', role: 'Administradora' }], error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: [], error: eventError || new Error('No active event'), demo: false }
  const { data, error } = await supabase.from('event_members').select('user_id, email, display_name, role').eq('event_id', activeEvent.id).order('created_at')
  const roleLabels: Record<string, string> = { admin: 'Administrador', staff: 'Equipo', viewer: 'Consulta' }
  return { data: (data || []).map(member => ({ userId: member.user_id, email: member.email || 'Sin correo', displayName: member.display_name || 'Usuario sin nombre', role: roleLabels[member.role] || member.role })), error, demo: false }
}

export async function addEventMember(input: { email: string; displayName: string; role: string }) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data, error } = await supabase.rpc('add_event_member', { target_event_id: activeEvent.id, member_email: input.email, member_display_name: input.displayName, member_role: input.role })
  return { data, error, demo: false }
}

export async function getCurrentOrganizerProfile() {
  if (!supabase) return { data: { displayName: 'María Ríos', role: 'Administradora' }, error: null, demo: true }
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return { data: null, error: authError || new Error('No authenticated user'), demo: false }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data: member, error } = await supabase.from('event_members').select('display_name, role').eq('event_id', activeEvent.id).eq('user_id', authData.user.id).maybeSingle()
  if (error || !member) return { data: null, error: error || new Error('User is not an event member'), demo: false }
  const metadataName = authData.user.user_metadata?.full_name || authData.user.user_metadata?.name
  const displayName = member.display_name?.trim() || metadataName || authData.user.email?.split('@')[0] || 'Organizador'
  const roleLabels: Record<string, string> = { admin: 'Administrador', staff: 'Equipo', viewer: 'Consulta' }
  return { data: { displayName, role: roleLabels[member.role] || member.role }, error: null, demo: false }
}

export async function submitRsvp(input: { token: string; name: string; email: string; phone: string; origin: string }) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data, error } = await supabase.rpc('submit_rsvp', {
    invitation_token: input.token,
    guest_name: input.name,
    guest_email: input.email.trim() || null,
    guest_phone: input.phone.trim() || null,
    guest_origin: input.origin,
  })
  return { data, error, demo: false }
}

export async function beginRsvp(contact: string) {
  if (!supabase) return { data: { token: 'demo-token', status: 'pending' }, error: null, demo: true }
  const { data, error } = await supabase.rpc('begin_rsvp', { guest_contact: contact.trim() })
  return { data, error, demo: false }
}

export async function cancelRsvp(token: string) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data, error } = await supabase.rpc('cancel_rsvp', { invitation_token: token })
  return { data, error, demo: false }
}

export async function createGuest(input: { name: string; email: string; phone: string; origin: string; company: string }) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data: guest, error } = await supabase.from('guests').insert({ event_id: activeEvent.id, full_name: input.name.trim() || null, email: input.email.trim() || null, phone: input.phone.trim() || null, origin: input.origin.trim() || null, company: input.company.trim() || null }).select().single()
  if (error || !guest) return { data: null, error, demo: false }
  const invitation = await supabase.from('invitations').insert({ event_id: activeEvent.id, guest_id: guest.id }).select().single()
  return { data: { guest, invitation: invitation.data }, error: invitation.error, demo: false }
}

export async function checkInGuest(guestId: string) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data, error } = await supabase.from('check_ins').upsert({ event_id: activeEvent.id, guest_id: guestId }, { onConflict: 'event_id,guest_id' }).select().single()
  return { data, error, demo: false }
}

export async function findGuestByQr(value: string) {
  const code = value.trim()
  if (!code) return { data: null, error: new Error('Código vacío'), demo: !supabase }
  if (!supabase) {
    const demoGuest = demoGuestFromQr(code)
    return { data: demoGuest, error: demoGuest ? null : new Error('Invitación no encontrada'), demo: true }
  }
  const token = extractInvitationToken(code)
  const { data, error } = await supabase
    .from('invitations')
    .select('guest_id, guests(id, full_name, company, email, origin)')
    .eq('token', token)
    .maybeSingle()
  if (error || !data?.guests) return { data: null, error: error || new Error('Invitación no encontrada'), demo: false }
  const guest = Array.isArray(data.guests) ? data.guests[0] : data.guests
  return { data: guest ? { id: String(guest.id), name: guest.full_name, company: guest.company || 'Sin empresa', email: guest.email, origin: guest.origin || 'Sin origen' } : null, error: guest ? null : new Error('Invitación no encontrada'), demo: false }
}

function extractInvitationToken(value: string) {
  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/registro\/([^/]+)/)
    return match?.[1] || value
  } catch {
    return value.replace(/^registro\//, '').replace(/^\//, '')
  }
}

function demoGuestFromQr(value: string) {
  const code = value.trim().replace(/^demo:\/?/, '').replace(/.*\/registro\//, '')
  const guest = [{ id: 'demo-1', name: 'Mariana González', company: 'Grupo Cobalto', email: 'mariana@gcobalto.com', origin: 'Guadalajara' }, { id: 'demo-2', name: 'Jorge Villaseñor', company: 'Villaseñor Hermanos', email: 'jorge@vhnos.com', origin: 'Ciudad de México' }].find(item => item.id === code || code === 'demo-token')
  return guest || null
}

export async function markInvitationSent(guestId: string) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data, error } = await supabase.from('invitations').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('event_id', activeEvent.id).eq('guest_id', guestId).select().single()
  return { data, error, demo: false }
}

export async function sendInvitation(guestId: string) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data, error } = await supabase.functions.invoke('send-invitation', { body: { guest_id: guestId } })
  return { data, error, demo: false }
}
