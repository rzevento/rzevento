import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentication required' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM')
  const publicSiteUrl = Deno.env.get('PUBLIC_SITE_URL')
  if (!resendKey || !from || !publicSiteUrl) return json({ error: 'Email service is not configured' }, 500)

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey)
  const { guest_id: guestId } = await request.json()
  if (!guestId || typeof guestId !== 'string') return json({ error: 'guest_id is required' }, 400)

  const { data: guest, error: guestError } = await adminClient.from('guests').select('id, event_id, full_name, email').eq('id', guestId).maybeSingle()
  if (guestError || !guest) return json({ error: 'Guest not found' }, 404)
  if (!guest.email) return json({ error: 'Este invitado no tiene correo electrónico' }, 400)

  const { data: member } = await adminClient.from('event_members').select('role').eq('event_id', guest.event_id).eq('user_id', authData.user.id).maybeSingle()
  if (member?.role !== 'admin') return json({ error: 'No tienes permiso para enviar invitaciones' }, 403)

  const { data: invitation, error: invitationError } = await adminClient.from('invitations').select('id, token').eq('event_id', guest.event_id).eq('guest_id', guest.id).maybeSingle()
  if (invitationError || !invitation) return json({ error: 'Invitation not found' }, 404)

  const invitationUrl = `${publicSiteUrl.replace(/\/$/, '')}/registro/${invitation.token}`
  const greeting = guest.full_name ? `Hola ${guest.full_name},` : 'Hola,'
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [guest.email],
      subject: 'Tu invitación · Familias empresarias',
      html: `<div style="font-family:Arial,sans-serif;color:#241f1a;max-width:600px;margin:auto;padding:32px"><p style="color:#c75a00;letter-spacing:3px;font-weight:bold">RZ EVENTOS</p><h1>Familias empresarias<br><span style="color:#c75a00">en la era de las turbulencias</span></h1><p>${greeting}</p><p>Te invitamos a esta conversación sobre los retos y oportunidades de las familias empresarias.</p><p><strong>Martes 17 de noviembre de 2026</strong><br>9:00 h · Registro desde las 8:30 h<br>Hyatt Regency Andares · Guadalajara, Jalisco</p><p style="margin:32px 0"><a href="${invitationUrl}" style="background:#ff7600;color:#241f1a;text-decoration:none;padding:14px 22px;font-weight:bold">Confirmar asistencia</a></p><p>Esta invitación es personal e intransferible.</p></div>`,
    }),
  })
  if (!emailResponse.ok) return json({ error: 'Resend no pudo enviar el correo' }, 502)

  const { error: updateError } = await adminClient.from('invitations').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invitation.id)
  if (updateError) return json({ error: 'El correo se envió, pero no se pudo actualizar el estado' }, 500)
  return json({ ok: true, invitation_url: invitationUrl })
})
