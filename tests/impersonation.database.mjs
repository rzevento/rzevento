// Run with PGLITE_MODULE pointing to @electric-sql/pglite's dist/index.js.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
process.on('uncaughtException',error=>{console.error(error.message,error.where || '',error.query || '');process.exit(1)})
const root=new URL('..', import.meta.url).pathname
const db=new PGlite()
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
`)
await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$; grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;`)
for(const file of readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
 const sql=readFileSync(root+'/supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;','').replaceAll('gen_random_bytes(12)',"decode(md5(random()::text), 'hex')")
 try{await db.exec(sql)}catch(e){console.error(file,e.message);process.exit(1)}
}
await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-00000000000'||i)::uuid, 'user'||i||'@test.invalid' from generate_series(1,5) i;
insert into auth.sessions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into public.events(id,name,event_date,event_time,venue,city) values ('20000000-0000-0000-0000-000000000001','Test','2026-11-17','09:00','Local','Test'),('20000000-0000-0000-0000-000000000002','Other','2026-11-17','09:00','Local','Test');
insert into public.event_members(event_id,user_id,role,email,display_name) select '20000000-0000-0000-0000-000000000001',id,case right(id::text,1) when '1' then 'admin' when '2' then 'staff' when '3' then 'viewer' else 'admin' end,email,'Test user' from auth.users where right(id::text,1) <> '5';
insert into public.event_members(event_id,user_id,role) values('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','admin');
insert into public.guests(id,event_id,full_name,email) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Local test','guest@test.invalid');
`)
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`
const event='20000000-0000-0000-0000-000000000001'
let session
async function as(n,header=null,sid='10000000-0000-0000-0000-000000000001'){
 await db.exec('reset role')
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:uid(n),session_id:sid}),JSON.stringify(header?{'x-rz-impersonation':header}:{})])
 await db.exec('set role authenticated')
}
async function context(){return (await db.query('select public.get_organizer_context() as context')).rows[0].context}
async function deny(sql,args){await assert.rejects(()=>db.query(sql,args),e=>e.code==='42501')}
const start='select public.start_organizer_impersonation($1,$2) as session'
for(const n of [2,3,5]) {await as(n);await deny(start,[event,uid(2)]);console.log('PASS non-admin/other-event start denied',n)}
await as(1);await deny(start,[event,uid(1)]);await deny(start,[event,uid(5)]);
session=(await db.query(start,[event,uid(2)])).rows[0].session.id
await as(1,session)
assert.equal((await context()).userId,uid(2));assert.equal((await context()).roleCode,'staff');assert.equal((await context()).actorIsAdmin,true)
await deny(start,[event,uid(3)])
await deny("select public.add_event_member($1,'user3@test.invalid','New admin','admin')",[event])
await db.query("update public.guests set full_name='Updated test' where id='30000000-0000-0000-0000-000000000001'")
await db.exec('reset role')
let audit=(await db.query("select * from activity_log where action='impersonated_update' order by id desc limit 1")).rows[0]
assert.equal(audit.actor_id,uid(1));assert.equal(audit.metadata.subject_id,uid(2));assert.equal(audit.metadata.session_id,session)
console.log('PASS effective staff permissions and real/effective audit')
await as(2,session);await assert.rejects(context,e=>e.code==='42501')
await as(1,session,'10000000-0000-0000-0000-000000000002');await assert.rejects(context,e=>e.code==='42501')
await as(1,session);assert.equal((await db.query('select count(*)::int as n from events')).rows[0].n,1)
await db.exec('reset role');await db.query('update private.organizer_impersonation_sessions set expires_at=now()-interval \'1 minute\' where id=$1',[session])
await as(1,session);await assert.rejects(context,e=>e.code==='42501');await deny("update public.guests set full_name='Forbidden'")
await db.query('select public.stop_organizer_impersonation($1)',[session])
await as(1);assert.equal((await context()).userId,uid(1));console.log('PASS expiry, stolen session, auth-session binding, event scope and return to real admin')
session=(await db.query(start,[event,uid(3)])).rows[0].session.id
await as(1,session);assert.equal((await context()).roleCode,'viewer');await deny("select public.add_event_member($1,'user4@test.invalid','No','admin')",[event]);console.log('PASS effective viewer cannot manage members')
await db.exec('reset role');await db.query("select set_config('request.headers','{}',false)");await db.query("update public.event_members set role='staff' where user_id=$1",[uid(1)])
await as(1,session);await assert.rejects(context,e=>e.code==='42501');console.log('PASS revoked real admin stops active impersonation')
await db.exec('reset role');await db.query("select set_config('request.headers','{}',false)");await db.query("update public.event_members set role='admin' where user_id=$1",[uid(1)])
await as(1);session=(await db.query(start,[event,uid(4)])).rows[0].session.id
await as(1,session);assert.equal((await context()).roleCode,'admin');await db.query("select public.add_event_member($1,'user3@test.invalid','Viewer name','viewer')",[event]);console.log('PASS impersonated admin retains allowed actions with auditing')
await db.exec('reset role');await db.query("select set_config('request.headers','{}',false)");await db.query('delete from public.event_members where event_id=$1 and user_id=$2',[event,uid(4)])
await as(1,session);await assert.rejects(context,e=>e.code==='42501');console.log('PASS removed target stops active impersonation')
await db.exec('reset role');await db.exec('set role anon');await deny('select public.get_organizer_context()');await deny(start,[event,uid(2)]);console.log('PASS anonymous access denied')
console.log('All isolated database checks passed')
await db.close()
