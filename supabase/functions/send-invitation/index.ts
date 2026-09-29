import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const uncertain = () => json({ error: 'No se confirmó el envío. Revisa el historial de Make antes de volver a enviar para evitar duplicados.' }, 502)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const authorization = request.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Inicia sesión como administrador' }, 401)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
    if (!supabaseUrl || !publicKey || !secretKey) return json({ error: 'Falta la configuración de Supabase' }, 500)

    const authClient = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await authClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
    if (authError || !authData.user) return json({ error: 'La sesión no es válida. Inicia sesión de nuevo.' }, 401)

    const input = await request.json().catch(() => null)
    const guestId = input?.guest_id
    if (typeof guestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guestId)) {
      return json({ error: 'guest_id debe ser el UUID de un invitado' }, 400)
    }

    // Keep database reads and writes scoped to the authenticated organizer's RLS.
    const userClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: guest, error: guestError } = await userClient.from('guests')
      .select('id, event_id, full_name, email').eq('id', guestId).maybeSingle()
    if (guestError || !guest) return json({ error: 'Invitado no encontrado o sin acceso' }, 404)
    const { data: member, error: memberError } = await userClient.from('event_members')
      .select('role').eq('event_id', guest.event_id).eq('user_id', authData.user.id).maybeSingle()
    if (memberError || member?.role !== 'admin') return json({ error: 'Solo un administrador puede enviar invitaciones' }, 403)
    if (!guest.email) return json({ error: 'Este invitado no tiene correo electrónico' }, 400)

    const admin = userClient
    const { data: invitation, error: invitationError } = await admin.from('invitations')
      .select('id, token, status, sent_at').eq('event_id', guest.event_id).eq('guest_id', guest.id).maybeSingle()
    if (invitationError) {
      console.error('send-invitation: invitation lookup failed', {
        code: invitationError.code,
        message: invitationError.message,
      })
      return json({ error: 'No se pudo consultar la invitación. Revisa los registros de send-invitation en Supabase.' }, 500)
    }
    if (!invitation) return json({ error: 'Este invitado no tiene una invitación asociada al evento' }, 404)
    if (invitation.sent_at || invitation.status === 'sent') return json({ ok: true, already_sent: true })

    const webhook = Deno.env.get('MAKE_WEBHOOK_URL')?.trim()
    const apiKey = Deno.env.get('MAKE_WEBHOOK_API_KEY')?.trim()
    const publicSite = Deno.env.get('PUBLIC_SITE_URL')?.trim()
    if (!webhook || !apiKey || !publicSite) return json({ error: 'Configura MAKE_WEBHOOK_URL, MAKE_WEBHOOK_API_KEY y PUBLIC_SITE_URL en Secrets' }, 500)
    let webhookUrl: URL, siteUrl: URL
    try {
      webhookUrl = new URL(webhook)
      siteUrl = new URL(publicSite)
      if (webhookUrl.protocol !== 'https:' || siteUrl.protocol !== 'https:' || webhookUrl.username || webhookUrl.password || siteUrl.username || siteUrl.password || ['localhost', '127.0.0.1', '[::1]'].includes(siteUrl.hostname)) throw new Error()
    } catch {
      return json({ error: 'Las URLs de Make y del sitio publicado deben ser direcciones HTTPS válidas' }, 500)
    }
    const invitationUrl = new URL(`/registro/${encodeURIComponent(invitation.token)}`, siteUrl.origin).href

    // Only an explicit successful scenario response counts as sent, never "Accepted".
    try {
      const response = await fetch(webhookUrl.href, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'x-make-apikey': apiKey },
        body: JSON.stringify({
          invitation_id: invitation.id,
          guest_name: escapeHtml(guest.full_name?.trim() || 'invitado'),
          email: guest.email,
          invitation_url: invitationUrl,
        }),
        signal: AbortSignal.timeout(25000),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.ok !== true) return uncertain()
    } catch {
      return uncertain()
    }

    const { data: saved, error: updateError } = await admin.from('invitations')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', invitation.id).select('id').maybeSingle()
    if (updateError || !saved) return json({ error: 'Make confirmó el envío, pero no se guardó el estado. No reenvíes: revisa la invitación en Supabase.' }, 500)
    return json({ ok: true, invitation_url: invitationUrl })
  } catch {
    return json({ error: 'No se pudo completar la solicitud. Revisa el historial de Make antes de reintentar.' }, 500)
  }
})
