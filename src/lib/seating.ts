import { normalize } from './dashboard'
import type { Guest } from './dashboard'

export const SEATS_PER_TABLE = 8
/** Mesas adicionales de 8 lugares, completas, que se suman a las de los invitados de la lista. */
export const EXTRA_FULL_TABLES = 1
/** guestId → número de mesa (1, 2, 3…). */
export type SeatAssignments = Record<string, number>
/** Quiénes cuentan para calcular las mesas: confirmados y sin respuesta, o solo confirmados. Quien ya llegó siempre cuenta, aunque haya cancelado. */
export type SeatingBase = 'active' | 'confirmed'
export type SeatingTable = { number: number; guests: Guest[] }
export type SeatChange = { guestId: string; tableNumber: number | null }

export function tablesNeeded(people: number, seats = SEATS_PER_TABLE) {
  return people > 0 ? Math.ceil(people / seats) : 0
}

export function guestsToSeat(guests: Guest[], base: SeatingBase) {
  return guests.filter(guest => guest.checkedIn || (base === 'confirmed' ? guest.status === 'Confirmado' : guest.status !== 'Canceló'))
}

const byName = (a: Guest, b: Guest) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
const companyKey = (guest: Guest) => {
  const company = normalize(guest.company || '')
  return !company || company === 'sin empresa' ? `guest:${guest.id}` : company
}

export function seatingPlan(guests: Guest[], assignments: SeatAssignments, base: SeatingBase, seats = SEATS_PER_TABLE) {
  const candidates = guestsToSeat(guests, base)
  const needed = tablesNeeded(candidates.length, seats)
  const known = new Set(guests.map(guest => guest.id))
  const used = Object.entries(assignments).filter(([id, table]) => known.has(id) && table > 0).map(([, table]) => table)
  const tableCount = Math.max(needed, 0, ...used)
  const tables: SeatingTable[] = Array.from({ length: tableCount }, (_, index) => ({ number: index + 1, guests: [] }))
  for (const guest of guests) {
    const table = assignments[guest.id]
    if (table > 0) tables[table - 1].guests.push(guest)
  }
  for (const table of tables) table.guests.sort(byName)
  const unassigned = candidates.filter(guest => !(assignments[guest.id] > 0))
    .sort((a, b) => companyKey(a).localeCompare(companyKey(b), 'es') || byName(a, b))
  return {
    people: candidates.length,
    needed,
    extraTables: EXTRA_FULL_TABLES,
    totalTables: needed + EXTRA_FULL_TABLES,
    fullTables: Math.floor(candidates.length / seats),
    remainder: candidates.length % seats,
    tableCount,
    tables,
    unassigned,
    assigned: tables.reduce((total, table) => total + table.guests.length, 0),
  }
}

/**
 * Sienta a los invitados sin mesa en los lugares libres, procurando que las personas
 * de la misma empresa queden juntas. No mueve a nadie que ya tenga mesa.
 */
export function autoAssign(unassigned: Guest[], tables: SeatingTable[], seats = SEATS_PER_TABLE): SeatChange[] {
  const free = new Map(tables.map(table => [table.number, Math.max(0, seats - table.guests.length)]))
  const groups = new Map<string, Guest[]>()
  for (const guest of unassigned) {
    const key = companyKey(guest)
    groups.set(key, [...(groups.get(key) || []), guest])
  }
  const chunks: Guest[][] = []
  for (const members of groups.values()) {
    for (let index = 0; index < members.length; index += seats) chunks.push(members.slice(index, index + seats))
  }
  chunks.sort((a, b) => b.length - a.length)
  const changes: SeatChange[] = []
  const place = (guest: Guest, table: number) => {
    changes.push({ guestId: guest.id, tableNumber: table })
    free.set(table, (free.get(table) || 0) - 1)
  }
  for (const chunk of chunks) {
    // La mesa con menos lugares libres donde quepa el grupo completo.
    const fit = [...free].filter(([, open]) => open >= chunk.length).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]
    if (fit) { chunk.forEach(guest => place(guest, fit[0])); continue }
    for (const guest of chunk) {
      const open = [...free].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
      if (!open) return changes
      place(guest, open[0])
    }
  }
  return changes
}

export function applyChanges(assignments: SeatAssignments, changes: SeatChange[]): SeatAssignments {
  const next = { ...assignments }
  for (const change of changes) {
    if (change.tableNumber) next[change.guestId] = change.tableNumber
    else delete next[change.guestId]
  }
  return next
}

export function seatingCsv(tables: SeatingTable[], unassigned: Guest[], extraTables = EXTRA_FULL_TABLES) {
  const rows = [['Mesa', 'Invitado', 'Empresa', 'Respuesta'],
    ...tables.flatMap(table => table.guests.map(guest => [`Mesa ${table.number}`, guest.name, guest.company, guest.status])),
    ...Array.from({ length: extraTables }, (_, index) => [extraTables > 1 ? `Mesa extra ${index + 1}` : 'Mesa extra', `${SEATS_PER_TABLE} lugares completos`, '', '']),
    ...unassigned.map(guest => ['Sin mesa', guest.name, guest.company, guest.status])]
  return '﻿' + rows.map(row => row.map(value => {
    const safe = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}
