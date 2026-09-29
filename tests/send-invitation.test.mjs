import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../supabase/functions/send-invitation/index.ts', import.meta.url), 'utf8').replace(/^import .*\n/, '')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const id = '00000000-0000-0000-0000-000000000001'
function setup(options = {}) {
  let handler, sends = 0, updates = 0, sentPayload
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'secret', MAKE_WEBHOOK_URL: 'https://hook.make.com/test', MAKE_WEBHOOK_API_KEY: 'test-key', PUBLIC_SITE_URL: 'https://evento.example.com', ...options.env }
  const createClient = (_url, key, config) => ({
    auth: { getUser: async () => ({ data: { user: options.invalidAuth ? null : { id: 'admin' } }, error: null }) },
    from(table) {
      if (table === 'invitations') {
        assert.equal(key, 'public')
        assert.equal(config.global?.headers.Authorization, 'Bearer valid')
      }
      let updating = false
      const chain = {
        select() { return chain }, eq() { return chain },
        update(values) { updates++; updating = true; assert.equal(values.status, 'sent'); assert.equal('whatsapp_sent_at' in values, false); return chain },
        async maybeSingle() {
          if (updating) return { data: options.updateError ? null : {id}, error: options.updateError ? new Error('db') : null }
          if (table === 'invitations' && options.invitationError) return { data: null, error: { code: '42501', message: 'permission denied' } }
          if (table === 'invitations' && options.noInvitation) return { data: null, error: null }
          const data = table === 'guests' ? (options.noGuest ? null : { id, event_id: 'event', full_name: '<Ana>', email: options.noEmail ? null : 'ana@example.com' }) : table === 'event_members' ? {role: options.role || 'admin'} : {id, token: 'token', status: options.alreadySent ? 'sent' : 'pending', sent_at: null}
          return { data, error: null }
        },
      }
      return chain
    },
  })
  vm.runInNewContext(compiled, {
    createClient, URL, Response, AbortSignal, console: { error() {} },
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn } },
    fetch: async (url, init) => {
      sends++; assert.equal(url, env.MAKE_WEBHOOK_URL); assert.equal(init.headers['x-make-apikey'], 'test-key')
      sentPayload = JSON.parse(init.body)
      if(options.timeout) throw new Error('timeout')
      return new Response(options.reply ?? '{"ok":true}', { status: options.status || 200 })
    },
  })
  return { call: async (body = {guest_id:id}, auth = true) => handler(new Request('https://test/function', {method:'POST',headers: auth ? {Authorization:'Bearer valid'} : {},body:typeof body === 'string' ? body : JSON.stringify(body)})), counts: () => ({sends,updates}), payload: () => sentPayload }
}
test('validates authentication, input and event admin membership before sending', async () => {
  for(const [opts,body,auth,status] of [[{}, {guest_id:id},false,401],[{invalidAuth:true},{guest_id:id},true,401],[{},'{bad',true,400],[{role:'staff'},{guest_id:id},true,403],[{noGuest:true},{guest_id:id},true,404],[{noEmail:true},{guest_id:id},true,400]]) {
    const app=setup(opts); assert.equal((await app.call(body,auth)).status,status); assert.deepEqual(app.counts(),{sends:0,updates:0})
  }
})
test('sends the agreed Make fields and updates only email after acknowledgement', async () => {
  const app=setup(); assert.equal((await app.call()).status,200)
  assert.deepEqual(app.counts(),{sends:1,updates:1})
  assert.deepEqual(app.payload(),{invitation_id:id,guest_name:'&lt;Ana&gt;',email:'ana@example.com',invitation_url:'https://evento.example.com/registro/token'})
})
test('Accepted, malformed JSON, false acknowledgements, failures and timeouts never mark sent', async () => {
  for(const opts of [{reply:'Accepted'},{reply:'{}'},{reply:'{"ok":"true"}'},{reply:'{"ok":false}'},{status:500},{timeout:true}]) {
    const app=setup(opts); assert.equal((await app.call()).status,502); assert.deepEqual(app.counts(),{sends:1,updates:0})
  }
})
test('does not resend invitations already recorded as sent', async () => {
  const app=setup({alreadySent:true}); assert.equal((await app.call()).status,200); assert.deepEqual(app.counts(),{sends:0,updates:0})
})
test('distinguishes a failed lookup from a missing invitation without sending mail', async () => {
  for (const [options, status, message] of [
    [{ invitationError: true }, 500, 'No se pudo consultar la invitación. Revisa los registros de send-invitation en Supabase.'],
    [{ noInvitation: true }, 404, 'Este invitado no tiene una invitación asociada al evento'],
  ]) {
    const app = setup(options)
    const response = await app.call()
    assert.equal(response.status, status)
    assert.equal((await response.json()).error, message)
    assert.deepEqual(app.counts(), { sends: 0, updates: 0 })
  }
})
test('reports a save failure after successful delivery without retrying Make', async () => {
  const app=setup({updateError:true}); assert.equal((await app.call()).status,500); assert.deepEqual(app.counts(),{sends:1,updates:1})
})
test('rejects missing settings and insecure URLs before calling Make', async () => {
  for(const env of [{MAKE_WEBHOOK_API_KEY:''},{PUBLIC_SITE_URL:'http://localhost:5173'}]) {
    const app=setup({env}); assert.equal((await app.call()).status,500); assert.deepEqual(app.counts(),{sends:0,updates:0})
  }
})

test('explicit resend keeps the personalized link and records a successful delivery', async () => {
  const app = setup({ alreadySent: true })
  assert.equal((await app.call({ guest_id: id, resend: true })).status, 200)
  assert.deepEqual(app.counts(), { sends: 1, updates: 1 })
  assert.equal(app.payload().invitation_url, 'https://evento.example.com/registro/token')
})
test('resend requires boolean true and still enforces admin access', async () => {
  const app = setup({ alreadySent: true })
  await app.call({ guest_id: id, resend: 'true' })
  assert.deepEqual(app.counts(), { sends: 0, updates: 0 })
  const staff = setup({ alreadySent: true, role: 'staff' })
  assert.equal((await staff.call({ guest_id: id, resend: true })).status, 403)
  assert.deepEqual(staff.counts(), { sends: 0, updates: 0 })
})
test('a failed resend preserves the previously recorded send', async () => {
  const app = setup({ alreadySent: true, timeout: true })
  assert.equal((await app.call({ guest_id: id, resend: true })).status, 502)
  assert.deepEqual(app.counts(), { sends: 1, updates: 0 })
})
