import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(readFileSync(new URL('../src/lib/impersonation-transport.ts', import.meta.url), 'utf8'), { compilerOptions: {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022} }).outputText
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
beforeEach(() => api.resetImpersonation())
test('identity is attached only to this project database/functions and never replaces authentication', async () => {
  const calls=[]
  const fetcher=api.impersonationFetch('https://rz.supabase.co',async (input,init)=>{calls.push({input,init});return new Response('{}')})
  api.finishIdentityChange('session-1')
  for(const path of ['/rest/v1/guests','/functions/v1/send-invitation','/auth/v1/token']) await fetcher(`https://rz.supabase.co${path}`,{headers:{Authorization:'Bearer real-actor'}})
  await fetcher('https://other.supabase.co/rest/v1/guests',{headers:{Authorization:'Bearer real-actor'}})
  assert.equal(calls[0].init.headers.get('x-rz-impersonation'),'session-1')
  assert.equal(calls[1].init.headers.get('x-rz-impersonation'),'session-1')
  assert.equal(calls[0].init.headers.get('Authorization'),'Bearer real-actor')
  assert.equal(new Headers(calls[2].init.headers).has('x-rz-impersonation'),false)
  assert.equal(new Headers(calls[3].init.headers).has('x-rz-impersonation'),false)
})
test('cannot change identity during a complete save, even between database requests',async()=>{
  let release
  const writing=api.organizerAction(()=>new Promise(resolve=>{release=resolve}))
  assert.throws(()=>api.beginIdentityChange(),/operación en curso/)
  release({data:'saved',error:null})
  await writing
  api.beginIdentityChange()
  let called=false
  const result=await api.organizerAction(async()=>{called=true})
  assert.equal(called,false);assert.ok(result.error)
  api.cancelIdentityChange()
})
test('requests started under a previous identity cannot populate the new view',async()=>{
  let release
  const fetcher=api.impersonationFetch('https://rz.supabase.co',()=>new Promise(resolve=>{release=resolve}))
  const pending=fetcher('https://rz.supabase.co/rest/v1/guests')
  api.finishIdentityChange('new-session')
  release(new Response('{}'))
  await assert.rejects(pending,/cambió de usuario/)
})
test('identity transitions block normal requests but allow starting, stopping and resolving identity',async()=>{
  const calls=[]
  const fetcher=api.impersonationFetch('https://rz.supabase.co',async input=>{calls.push(input);return new Response('{}')})
  api.beginIdentityChange()
  await assert.rejects(fetcher('https://rz.supabase.co/rest/v1/guests'),/Cambio de usuario/)
  await fetcher('https://rz.supabase.co/rest/v1/rpc/stop_organizer_impersonation')
  assert.equal(calls.length,1)
})
