import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const component = source.slice(source.indexOf('function RegistrationPage('), source.indexOf('function TokenRegistrationPage('))
const compiled = ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
function setup({ direct = false, cancelError = false, submitError = null } = {}) {
  const state = [], effects = [], calls = []
  let cursor = 0, mounted = false
  const details = { name: 'Ana Pérez', email: 'ana@example.com', phone: '', company: 'Empresa', status: submitError ? 'pending' : 'confirmed' }
  const context = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value }] },
    useEffect(fn) { if (!mounted) effects.push(fn) },
    getInvitationDetails: async () => ({ data: details, error: null }),
    submitRsvp: async () => ({ error: submitError }),
    beginRsvp: async () => ({ data: { token: 'personal-token', status: 'already_registered' }, error: null }),
    cancelRsvp: async token => { calls.push(token); return { error: cancelError ? new Error('network') : null } },
    event: {}, Logo: 'Logo', Link: 'Link',
  }
  for (const name of ['Check', 'CalendarDays', 'ShieldCheck', 'Download', 'ArrowRight', 'MapPin', 'LockKeyhole']) context[name] = name
  vm.createContext(context)
  vm.runInContext(compiled, context)
  return {
    calls,
    render() { cursor = 0; const tree = context.RegistrationPage({ token: direct ? 'personal-token' : 'demo' }); mounted = true; return tree },
    async load() { for (const effect of effects) effect(); await new Promise(resolve => setImmediate(resolve)) },
  }
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)] }
function text(tree) { return typeof tree === 'string' ? tree : (tree?.children || []).flat(Infinity).map(text).join(' ') }

test('a confirmed personal link shows reserved place and download/cancel actions immediately', async () => {
  const app = setup({ direct: true }); app.render(); await app.load()
  const tree = app.render()
  assert.match(text(tree), /Tu asistencia ya está confirmada/)
  assert.match(text(tree), /No necesitas registrarte otra vez/)
  assert.ok(nodes(tree).some(n => n.type === 'button' && text(n).trim() === 'Descargar invitación'))
  const cancel = nodes(tree).find(n => n.type === 'button' && text(n) === 'Cancelar mi asistencia')
  cancel.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(app.calls, ['personal-token'])
  assert.match(text(app.render()), /Tu cancelación quedó registrada/)
  assert.match(text(app.render()), /Volver a confirmar asistencia/)
})
test('an already registered email retrieves saved guest details before offering the invitation', async () => {
  const app = setup(); let tree = app.render()
  const email = nodes(tree).find(n => n.type === 'input' && n.props.type === 'email')
  email.props.onChange({ target: { value: 'ana@example.com' } })
  tree = app.render()
  await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.match(text(app.render()), /Tu asistencia ya está confirmada/)
})
test('a failed cancellation keeps the invitation available and displays an error', async () => {
  const app = setup({ direct: true, cancelError: true }); app.render(); await app.load()
  await nodes(app.render()).find(n => n.type === 'button' && text(n) === 'Cancelar mi asistencia').props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  const tree = app.render()
  assert.match(text(tree), /No pudimos cancelar tu asistencia/)
  assert.match(text(tree), /Descargar invitación/)
  assert.doesNotMatch(text(tree), /Tu cancelación quedó registrada/)
})

for (const [constraint, message] of [
  ['guests_event_phone_key', 'Este celular ya está registrado con otro invitado'],
  ['guests_event_email_key', 'Este correo ya está registrado con otro invitado'],
  ['unrelated_constraint', 'No pudimos completar el registro'],
]) {
  test(`registration reports ${constraint} without confirming the guest`, async () => {
    const app = setup({ direct: true, submitError: { code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` } })
    app.render(); await app.load()
    await nodes(app.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
    const tree = app.render()
    assert.match(text(tree), new RegExp(message))
    assert.doesNotMatch(text(tree), /Tu lugar para la conferencia está apartado/)
    assert.equal(nodes(tree).filter(n => n.type === 'form').length, 1)
  })
}
