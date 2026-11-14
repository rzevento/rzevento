import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
const dashboardUrl = toModule(readFileSync(new URL('../src/lib/dashboard.ts', import.meta.url), 'utf8'))
const seatingSource = readFileSync(new URL('../src/lib/seating.ts', import.meta.url), 'utf8').replace("from './dashboard'", `from '${dashboardUrl}'`)
const { tablesNeeded, seatingPlan, autoAssign, applyChanges, seatingCsv } = await import(toModule(seatingSource))

const guest = (id, extra = {}) => ({ id, name: `Persona ${id}`, company: 'Sin empresa', email: '', phone: '', invite: 'Enviada', status: 'Confirmado', checkedIn: false, ...extra })
const many = (count, extra) => Array.from({ length: count }, (_, index) => guest(String(index + 1), extra))

test('100 personas en mesas de 8 son 13 mesas (12 completas y 1 con 4) más 1 mesa extra completa = 14', () => {
  assert.equal(tablesNeeded(100), 13)
  const plan = seatingPlan(many(100), {}, 'active')
  assert.deepEqual([plan.needed, plan.fullTables, plan.remainder, plan.tableCount], [13, 12, 4, 13])
  assert.deepEqual([plan.extraTables, plan.totalTables], [1, 14])
  assert.equal(plan.unassigned.length, 100)
})

test('sin invitados no hay mesas; múltiplos exactos no dejan mesa parcial', () => {
  assert.equal(tablesNeeded(0), 0)
  assert.equal(tablesNeeded(8), 1)
  assert.equal(tablesNeeded(9), 2)
  assert.equal(seatingPlan([], {}, 'active').tableCount, 0)
})

test('la base de cálculo excluye cancelados y puede limitarse a confirmados', () => {
  const guests = [...many(10), guest('p1', { status: 'Pendiente' }), guest('c1', { status: 'Canceló' })]
  assert.equal(seatingPlan(guests, {}, 'active').people, 11)
  assert.equal(seatingPlan(guests, {}, 'confirmed').people, 10)
})

test('un cancelado que llegó al evento sí cuenta para las mesas', () => {
  const guests = [...many(8), guest('c1', { status: 'Canceló', checkedIn: true }), guest('c2', { status: 'Canceló' })]
  assert.equal(seatingPlan(guests, {}, 'active').people, 9)
  assert.equal(seatingPlan(guests, {}, 'confirmed').people, 9)
  assert.ok(seatingPlan(guests, {}, 'active').unassigned.some(g => g.id === 'c1'))
})

test('las mesas ya asignadas se conservan aunque superen las necesarias', () => {
  const plan = seatingPlan(many(3), { 1: 5 }, 'active')
  assert.equal(plan.needed, 1)
  assert.equal(plan.tableCount, 5)
  assert.deepEqual(plan.tables[4].guests.map(g => g.id), ['1'])
  assert.equal(plan.unassigned.length, 2)
  assert.equal(plan.assigned, 1)
})

test('acomodo automático respeta 8 por mesa, no mueve asignados y junta empresas', () => {
  const guests = [...many(14), ...['a', 'b', 'c'].map(id => guest(id, { company: 'Grupo Cobalto' }))]
  const assignments = { 1: 1, 2: 1 }
  const plan = seatingPlan(guests, assignments, 'active')
  const changes = autoAssign(plan.unassigned, plan.tables)
  assert.equal(changes.length, 15)
  assert.ok(!changes.some(change => ['1', '2'].includes(change.guestId)))
  const result = applyChanges(assignments, changes)
  const counts = Object.values(result).reduce((acc, table) => ({ ...acc, [table]: (acc[table] || 0) + 1 }), {})
  assert.ok(Object.values(counts).every(count => count <= 8))
  assert.equal(new Set(['a', 'b', 'c'].map(id => result[id])).size, 1)
})

test('acomodo automático se detiene cuando ya no hay lugares', () => {
  const guests = many(9)
  const assignments = Object.fromEntries(many(8).map(g => [g.id, 1]))
  const extra = guest('x', { status: 'Canceló' })
  const plan = seatingPlan([...guests, extra], { ...assignments, x: 2 }, 'active')
  // 9 personas → 2 mesas; la mesa 2 tiene a alguien que canceló y queda 1 por sentar.
  assert.equal(autoAssign(plan.unassigned, plan.tables).length, 1)
  const fullPlan = seatingPlan(many(8), assignments, 'active')
  assert.deepEqual(autoAssign([guest('y')], fullPlan.tables), [])
})

test('quitar a un invitado de su mesa lo devuelve a la lista sin mesa', () => {
  assert.deepEqual(applyChanges({ a: 1, b: 2 }, [{ guestId: 'a', tableNumber: null }]), { b: 2 })
})

test('el CSV del croquis protege valores tipo fórmula', () => {
  const plan = seatingPlan([guest('1', { name: '=HYPERLINK("x")' })], { 1: 1 }, 'active')
  const csv = seatingCsv(plan.tables, plan.unassigned)
  assert.ok(csv.startsWith('﻿'))
  assert.ok(csv.includes('"Mesa 1","\'=HYPERLINK(""x"")"'))
  assert.ok(csv.includes('"Mesa extra","8 lugares completos"'))
})
