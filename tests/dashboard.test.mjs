import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/lib/dashboard.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { summarize, normalize, dashboardCsv, confirmationDay, dailyConfirmations } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const base = { name: 'Persona', company: 'Empresa', origin: 'Guadalajara', email: '', phone: '', invite: 'Enviada', status: 'Pendiente', checkedIn: false }
const guests = [
  { ...base, id: '1', status: 'Confirmado' },
  { ...base, id: '2', status: 'Confirmado', checkedIn: true },
  { ...base, id: '3', status: 'Canceló', checkedIn: true },
  { ...base, id: '4', checkedIn: true },
  { ...base, id: '5' },
]
test('responses reconcile and arrivals do not imply confirmation', () => {
  assert.deepEqual(summarize(guests), { total: 5, confirmed: 2, pending: 2, cancelled: 1, arrived: 3, expected: 1 })
  const result = summarize(guests)
  assert.equal(result.confirmed + result.pending + result.cancelled, result.total)
})
test('empty events have zero totals', () => {
  assert.deepEqual(summarize([]), { total: 0, confirmed: 0, pending: 0, cancelled: 0, arrived: 0, expected: 0 })
})
test('search normalization ignores accents, case and repeated spaces', () => {
  assert.equal(normalize('  JOSÉ   Pérez '), 'jose perez')
})
test('CSV exports only supplied rows and protects formula-like values', () => {
  const csv = dashboardCsv([{ ...guests[0], name: '=SUM(A1)', company: 'Uno, "Dos"', phone: '+523312345678' }])
  assert.equal(csv.split('\r\n').length, 2)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=SUM(A1)"'))
  assert.ok(csv.includes('"Uno, ""Dos"""'))
  assert.ok(csv.includes('"\'+523312345678"'))
  assert.ok(!csv.includes('Por revisar'))
})

test('daily confirmations respect Mexico City midnight and include zero days', () => {
  const rows = [
    { ...base, id: '1', status: 'Confirmado', confirmedAt: '2026-10-01T05:59:59Z' },
    { ...base, id: '2', status: 'Confirmado', confirmedAt: '2026-10-01T06:00:00Z' },
    { ...base, id: '3', status: 'Canceló', confirmedAt: '2026-10-01T08:00:00Z' },
    { ...base, id: '4', status: 'Confirmado' },
  ]
  const result = dailyConfirmations(rows, 3, new Date('2026-10-01T18:00:00Z'))
  assert.deepEqual(result.series, [{ day: '2026-09-29', count: 0 }, { day: '2026-09-30', count: 1 }, { day: '2026-10-01', count: 1 }])
  assert.equal(result.todayCount, 1)
  assert.equal(result.total, 2)
  assert.equal(result.withoutDate, 1)
  assert.equal(confirmationDay('invalid'), null)
})
test('the next day appears automatically, including month rollover', () => {
  const before = dailyConfirmations([], 2, new Date('2026-10-01T05:59:59Z'))
  const after = dailyConfirmations([], 2, new Date('2026-10-01T06:00:00Z'))
  assert.equal(before.today, '2026-09-30')
  assert.equal(after.today, '2026-10-01')
  assert.deepEqual(after.series, [{ day: '2026-09-30', count: 0 }, { day: '2026-10-01', count: 0 }])
})
test('all dates start at the first current confirmation, reconfirmations count once', () => {
  const row = { ...base, id: '1', status: 'Confirmado', confirmedAt: '2026-09-28T12:00:00Z' }
  const now = new Date('2026-10-01T18:00:00Z')
  const first = dailyConfirmations([row], 'all', now)
  assert.equal(first.series.length, 4)
  assert.equal(first.total, 1)
  const updated = dailyConfirmations([{ ...row, confirmedAt: now.toISOString() }], 'all', now)
  assert.deepEqual(updated.series, [{ day: '2026-10-01', count: 1 }])
  assert.equal(dailyConfirmations([{ ...row, status: 'Canceló' }], 'all', now).total, 0)
})
