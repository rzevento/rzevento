import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
const functions = source.slice(source.indexOf('export async function updateGuest('), source.indexOf('export async function checkInGuest('))
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const input = { name: ' Ana ', email: ' ana@example.com ', phone: ' ', company: ' Empresa ', origin: '' }
function setup({ missing = false, error = null, demo = false } = {}) {
  const calls = []
  const api = {}
  const supabase = { from(table) {
    const call = { table }
    calls.push(call)
    const chain = {
      update(values) { call.operation = 'update'; call.values = values; return chain },
      delete() { call.operation = 'delete'; return chain },
      upsert(values, options) { call.operation = 'upsert'; call.values = values; call.options = options; return chain },
      eq(key, value) { call.filter = { key, value }; return chain },
      select() { return chain },
      async single() { return { data: missing || error ? null : { id: 'guest-1', event_id: 'event-1', guest_id: 'guest-1' }, error } },
    }
    return chain
  } }
  vm.runInNewContext(compiled, { exports: api, organizerAction: fn => fn(), supabase: demo ? null : supabase })
  return { api, calls }
}

test('editing only changes contact fields for the requested guest and preserves invitation and attendance', async () => {
  const { api, calls } = setup()
  const result = await api.updateGuest('guest-1', input)
  assert.equal(result.error, null)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ table: 'guests', operation: 'update', values: { full_name: 'Ana', email: 'ana@example.com', phone: null, company: 'Empresa', origin: null }, filter: { key: 'id', value: 'guest-1' } }])
})
test('editing refuses to remove both contact methods without touching the database', async () => {
  const { api, calls } = setup()
  assert.ok((await api.updateGuest('guest-1', { ...input, email: ' ', phone: '' })).error)
  assert.equal(calls.length, 0)
})
test('deletion is scoped to a single guest; dependent records use database cascades', async () => {
  const { api, calls } = setup()
  assert.equal((await api.deleteGuest('guest-1')).error, null)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ table: 'guests', operation: 'delete', filter: { key: 'id', value: 'guest-1' } }])
})
test('missing or denied rows never report successful edit or deletion', async () => {
  for (const options of [{ missing: true }, { error: { code: '42501', message: 'denied' } }, { error: { code: '23505', message: 'duplicate' } }]) {
    const { api } = setup(options)
    assert.ok((await api.updateGuest('guest-1', input)).error)
    assert.ok((await api.deleteGuest('guest-1')).error)
  }
})
test('manual cancellation uses the guest event and supports guests without an existing RSVP', async () => {
  const { api, calls } = setup()
  assert.equal((await api.markGuestCancelled('guest-1')).error, null)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].filter.value, 'guest-1')
  assert.equal(calls[1].table, 'rsvps')
  assert.equal(calls[1].operation, 'upsert')
  assert.equal(calls[1].values.event_id, 'event-1')
  assert.equal(calls[1].values.guest_id, 'guest-1')
  assert.equal(calls[1].values.status, 'cancelled')
  assert.equal(calls[1].options.onConflict, 'event_id,guest_id')
  assert.equal('submitted_email' in calls[1].values, false)
})
test('cancellation does not write when the guest cannot be read', async () => {
  const { api, calls } = setup({ missing: true })
  assert.ok((await api.markGuestCancelled('guest-1')).error)
  assert.equal(calls.length, 1)
})
test('demo edits, deletion and cancellation never write to the database', async () => {
  const { api, calls } = setup({ demo: true })
  for (const result of [await api.updateGuest('guest-1', input), await api.deleteGuest('guest-1'), await api.markGuestCancelled('guest-1')]) {
    assert.equal(result.demo, true)
    assert.equal(result.error, null)
  }
  assert.equal(calls.length, 0)
})
