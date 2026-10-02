import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
const permissions = { exports: {}, require }
vm.runInNewContext(compile(readFileSync(new URL('../src/lib/organizer-permissions.ts', import.meta.url), 'utf8')), permissions)
const { OrganizerRoleContext, useCanManageInvitations } = permissions.exports
function loadDashboardModule(path, dependencies = {}) {
  const context = { exports: {}, require: name => name.endsWith('.css') ? {} : dependencies[name] || require(name) }
  vm.runInNewContext(compile(readFileSync(new URL(path, import.meta.url), 'utf8')), context)
  return context.exports
}
const dashboardModel = loadDashboardModule('../src/lib/dashboard.ts')
const dailyChart = loadDashboardModule('../src/components/DailyConfirmations.tsx', { '../lib/dashboard': dashboardModel })
const { default: EventDashboard } = loadDashboardModule('../src/components/EventDashboard.tsx', { '../lib/dashboard': dashboardModel, './DailyConfirmations': dailyChart })

const { default: ImpersonationControl } = loadDashboardModule('../src/components/ImpersonationControl.tsx', { '../lib/supabase': {}, '@tanstack/react-query': { useQuery: () => ({ data: [], isPending: false }) } })
const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
// Render the actual page components; external data and session are controlled fixtures.
const componentSource = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(ast)).join('\n').replaceAll('import.meta.env', '({})')
const icons = source.match(/import \{ ([^}]+) \} from 'lucide-react'/)[1].split(', ').map(name => name.trim())
const guest = { id: 'guest-1', name: 'Persona de prueba', company: 'Empresa', email: 'test@example.com', phone: '3312345678', invite: 'Pendiente', status: 'Pendiente', checkedIn: false }
function render(component, { role = 'staff', profilePending = false, profileError = false, authenticated = true, sent = false, captureButtons, onDownload } = {}) {
  const data = [{ ...guest, invite: sent ? 'Enviada' : 'Pendiente' }]
  const stateValues = component === 'AdminLayout' ? [true, authenticated, false, 'user-1', false] : []
  let stateIndex = 0
  let exportBlob
  const sandbox = {
    Blob, URL: { createObjectURL(blob) { exportBlob = blob; return "blob:test" }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() { onDownload?.({ blob: exportBlob, filename: this.download }) } }) },
    exports: {}, require: name => {
      const module = require(name)
      if (name !== 'react/jsx-runtime' || !captureButtons) return module
      return Object.fromEntries(Object.entries(module).map(([key, value]) => [key, key === 'jsx' || key === 'jsxs' ? (type, props, ...rest) => {
        if (type === 'button') captureButtons(props)
        return value(type, props, ...rest)
      } : value]))
    }, ...React,
    useState(initial) {
      const index = stateIndex++
      return React.useState(index < stateValues.length ? stateValues[index] : initial)
    },
    OrganizerRoleContext, useCanManageInvitations, EventDashboard, ImpersonationControl, getImpersonationId: () => null,
    useQuery({ queryKey }) {
      return queryKey[0] === 'organizer-profile'
        ? { data: profilePending || profileError ? undefined : { displayName: 'Persona de prueba', role: 'Equipo', roleCode: role, actorIsAdmin: role === 'admin', actorUserId: 'user-1', userId: 'user-1', eventId: 'event-1' }, isPending: profilePending, isError: profileError }
        : { data, isPending: false, isError: false }
    },
    useMutation: () => ({ mutate() {} }), useIsMutating: () => 0,
    useNavigate: () => () => {}, guestQuery: () => {},
    Link: ({ children, to }) => React.createElement('a', { href: to }, children),
    Outlet: () => React.createElement('div', null, 'Contenido del panel'),
    ...Object.fromEntries(icons.map(name => [name, () => null])),
    supabase: null, demoGuests: data, canSendPendingEmail: () => true, whatsappPhone: value => value,
    localStorage: { getItem: () => null },
    event: { title: 'Evento de prueba', date: '17 de noviembre' },
  }
  vm.runInNewContext(compile(componentSource + `\nexports.Component = ${component};`), sandbox)
  return renderToStaticMarkup(React.createElement(OrganizerRoleContext.Provider, { value: role }, React.createElement(sandbox.exports.Component)))
}
const restrictedLabels = ['Nueva invitación', 'Descargar lista de invitados', 'Enviar todas las invitaciones', 'Exportar CSV', 'Exportar filtrados', 'Cargar masivamente', 'Agregar invitado', 'Enviar correo', 'Reenviar invitación', 'Abrir WhatsApp', 'Marcar WhatsApp enviado']
for (const role of ['staff', 'viewer', null, 'unexpected']) {
  test(`${role}: summary and guest consultation remain available without invitation controls`, () => {
    const shell = render('AdminLayout', { role })
    assert.match(shell, /> Resumen</)
    assert.match(shell, /> Invitados /)
    const summary = render('SummaryPage', { role })
    assert.match(summary, /Detalle de invitados/)
    const guests = render('GuestsPage', { role })
    assert.match(guests, /Persona de prueba/)
    assert.match(guests, /Buscar por nombre/)
    assert.match(guests, /Filtrar por respuesta/)
    assert.match(guests, /Ver entrada/)
    assert.match(guests, /Registrar llegada/)
    for (const sent of [false, true]) {
      const html = shell + summary + render('GuestsPage', { role, sent })
      for (const label of restrictedLabels) assert.ok(!html.includes(label), `${role} sees ${label}`)
    }
  })
}
test('administrator retains header, bulk, export, import, creation and individual email actions', () => {
  const html = render('AdminLayout', { role: 'admin' }) + render('SummaryPage', { role: 'admin' }) + render('GuestsPage', { role: 'admin' }) + render('GuestsPage', { role: 'admin', sent: true })
  for (const label of restrictedLabels.filter(label => label !== 'Abrir WhatsApp')) assert.ok(html.includes(label), `admin missing ${label}`)
})
test('pending and failed profile checks never render privileged controls or the panel', () => {
  for (const options of [{ profilePending: true }, { profileError: true }]) {
    const html = render('AdminLayout', { role: 'admin', ...options })
    for (const label of restrictedLabels) assert.ok(!html.includes(label))
    assert.ok(!html.includes('Contenido del panel'))
  }
})
test('effective profile comes from the server authorization context', async () => {
  const source = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
  const profileSource = source.slice(source.indexOf('export async function getCurrentOrganizerProfile('), source.indexOf('export async function startOrganizerImpersonation('))
  const sandbox = { exports: {}, supabase: {
    rpc: async name => { assert.equal(name, 'get_organizer_context'); return {data:{roleCode:'staff',role:'Equipo'},error:null} },
  } }
  vm.runInNewContext(compile(profileSource), sandbox)
  const result = await sandbox.exports.getCurrentOrganizerProfile()
  assert.equal(result.data.roleCode, 'staff')
})
test('only the real administrator sees the impersonation control', () => {
  assert.match(render('AdminLayout', {role:'admin'}), /Ver como usuario/)
  for (const role of ['staff','viewer',null,'unexpected']) assert.doesNotMatch(render('AdminLayout', {role}), /Ver como usuario/)
})

test('administrator export button downloads the guest list', async () => {
  const buttons = []
  let downloaded
  render('GuestsPage', { role: 'admin', captureButtons: props => buttons.push(props), onDownload: result => { downloaded = result } })
  const button = buttons.find(props => React.Children.toArray(props.children).some(child => typeof child === 'string' && child.includes('Exportar CSV')))
  assert.ok(button)
  button.onClick()
  assert.equal(downloaded.filename, 'invitados-familias-empresarias.csv')
  assert.match(await downloaded.blob.text(), /test@example.com/)
})
