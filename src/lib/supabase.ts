import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null

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

export async function cancelRsvp(token: string) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data, error } = await supabase.rpc('cancel_rsvp', { invitation_token: token })
  return { data, error, demo: false }
}

export async function createGuest(input: { name: string; email: string; phone: string; origin: string; company: string }) {
  if (!supabase) return { data: null, error: null, demo: true }
  const { data: activeEvent, error: eventError } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eventError || !activeEvent) return { data: null, error: eventError || new Error('No active event'), demo: false }
  const { data: guest, error } = await supabase.from('guests').insert({ event_id: activeEvent.id, full_name: input.name, email: input.email.trim() || null, phone: input.phone.trim() || null, origin: input.origin, company: input.company }).select().single()
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
