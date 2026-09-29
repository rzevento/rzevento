/** Ten-digit local numbers belong to Mexico; other countries need a country code. */
export function whatsappPhone(value: string): string | null {
  const input = value.trim()
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null
  let digits = input.replace(/\D/g, '')
  const international = input.startsWith('+') || digits.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!international && digits.length === 10) digits = `52${digits}`
  else if (!international && !digits.startsWith('52')) return null
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

export function whatsappInvitationUrl(phone: string, name: string, token: string, siteUrl: string): string {
  const recipient = whatsappPhone(phone)
  if (!recipient) throw new Error('Revisa el celular. Usa 10 dígitos para México o + y el código de país para otros países.')
  if (!token) throw new Error('Este invitado todavía no tiene un enlace de invitación.')
  const site = new URL(siteUrl)
  if (!['https:', 'http:'].includes(site.protocol)) throw new Error('La dirección pública del evento no es válida.')
  if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(site.hostname)) {
    throw new Error('Configura VITE_PUBLIC_SITE_URL con la dirección publicada del evento para compartir invitaciones.')
  }
  const invitation = new URL(`/registro/${encodeURIComponent(token)}`, site.origin).href
  const greeting = name && name !== 'Invitado pendiente' ? `Hola ${name},` : 'Hola,'
  const message = `${greeting}\n\nRZ Eventos te invita a Familias empresarias en la era de las turbulencias: retos y oportunidades.\n\nConsulta los detalles y confirma tu asistencia aquí:\n${invitation}\n\nEsta invitación es personal e intransferible.`
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`
}
