import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSendPendingEmail, canSendReminderEmail, whatsappPhone, whatsappInvitationUrl } from '../src/lib/invitations.ts'

test('bulk email only includes contacts with email and no recorded delivery in either channel', () => {
  const pending = { email: 'ana@example.com', invite: 'Pendiente' }
  assert.equal(canSendPendingEmail(pending), true)
  assert.equal(canSendPendingEmail({ ...pending, email: '' }), false)
  assert.equal(canSendPendingEmail({ ...pending, email: '   ' }), false)
  assert.equal(canSendPendingEmail({ ...pending, invite: 'Enviada' }), false)
  assert.equal(canSendPendingEmail({ ...pending, whatsappSentAt: '2026-09-29T12:00:00Z' }), false)
  assert.equal(canSendPendingEmail({ ...pending, invite: 'Enviada', whatsappSentAt: '2026-09-29T12:00:00Z' }), false)
})

test('bulk reminders include only emailed invitations awaiting a response', () => {
  const pending = { email: 'ana@example.com', invite: 'Enviada', status: 'Pendiente' }
  assert.equal(canSendReminderEmail(pending), true)
  assert.equal(canSendReminderEmail({ ...pending, email: '   ' }), false)
  assert.equal(canSendReminderEmail({ ...pending, invite: 'Pendiente' }), false)
  assert.equal(canSendReminderEmail({ ...pending, status: 'Confirmado' }), false)
  assert.equal(canSendReminderEmail({ ...pending, status: 'Canceló' }), false)
})

test('normalizes Mexican local numbers and explicit international numbers', () => {
  assert.equal(whatsappPhone('(33) 1234-5678'), '523312345678')
  assert.equal(whatsappPhone('+52 33 1234 5678'), '523312345678')
  assert.equal(whatsappPhone('0052 33 1234 5678'), '523312345678')
  assert.equal(whatsappPhone('+34 612 345 678'), '34612345678')
  assert.equal(whatsappPhone('523312345678'), '523312345678')
})

test('rejects missing, malformed or ambiguous foreign numbers', () => {
  for (const phone of ['', 'abc3312345678', '123', '+0000000000', '+1234567890123456', '34612345678']) {
    assert.equal(whatsappPhone(phone), null, phone)
  }
})

test('encodes the personal link and special characters in the prepared message', () => {
  const url = new URL(whatsappInvitationUrl('3312345678', 'Ana & José', 'token-personal', 'https://evento.example.com/'))
  assert.equal(url.origin, 'https://wa.me')
  assert.equal(url.pathname, '/523312345678')
  assert.ok(url.searchParams.get('text')?.includes('Apreciable Ana & José:'))
  assert.ok(url.searchParams.get('text')?.includes('https://evento.example.com/registro/token-personal'))
})

test('reminder has different text while retaining the same personal link', () => {
  const invitation = new URL(whatsappInvitationUrl('3312345678', 'Ana', 'token', 'https://evento.example.com'))
  const reminder = new URL(whatsappInvitationUrl('3312345678', 'Ana', 'token', 'https://evento.example.com', true))
  assert.notEqual(reminder.searchParams.get('text'), invitation.searchParams.get('text'))
  assert.match(reminder.searchParams.get('text') || '', /Aún no hemos recibido su respuesta/)
  assert.match(reminder.searchParams.get('text') || '', /https:\/\/evento.example.com\/registro\/token/)
})

test('does not expose placeholder names or create links without a token', () => {
  const url = new URL(whatsappInvitationUrl('3312345678', 'Invitado pendiente', 'token', 'https://evento.example.com'))
  assert.ok(url.searchParams.get('text')?.startsWith('Reciba un cordial saludo.'))
  assert.throws(() => whatsappInvitationUrl('3312345678', 'Ana', '', 'https://evento.example.com'))
})

test('rejects local or unsafe public site URLs', () => {
  for (const site of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173', 'javascript:alert(1)']) {
    assert.throws(() => whatsappInvitationUrl('3312345678', 'Ana', 'token', site))
  }
})
