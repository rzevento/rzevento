export const IMPERSONATION_HEADER = 'x-rz-impersonation'
let sessionId: string | null = null
let transition = false
let operations = 0
let revision = 0
let resetPending = false

export function getImpersonationId() { return sessionId }
export function resetImpersonation() { sessionId = null; transition = operations > 0; resetPending = operations > 0; revision++ }
export function beginIdentityChange() {
  if (transition || operations) throw new Error('Espera a que termine la operación en curso antes de cambiar de usuario.')
  transition = true
}
export function finishIdentityChange(id: string | null) { sessionId = id; revision++; transition = false }
export function cancelIdentityChange() { transition = false }

// Enclose whole logical writes (including their preliminary reads), so a save or
// bulk-send cannot straddle two identities. The caller receives the normal error shape.
export async function organizerAction<T>(action: () => Promise<T>): Promise<T | { data: null; error: Error; demo: false }> {
  if (transition) return { data: null, error: new Error('Espera a que termine el cambio de usuario.'), demo: false }
  operations++
  try { return await action() } finally { operations--; if (!operations && resetPending) { transition = false; resetPending = false } }
}

export function impersonationFetch(baseUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const origin = new URL(baseUrl).origin
  return async (input, init) => {
    const endpoint = new URL(input instanceof Request ? input.url : String(input))
    const applies = endpoint.origin === origin && (endpoint.pathname.startsWith('/rest/v1/') || endpoint.pathname.startsWith('/functions/v1/'))
    if (!applies) return fetcher(input, init)
    const isControl = ['/rest/v1/rpc/start_organizer_impersonation', '/rest/v1/rpc/stop_organizer_impersonation', '/rest/v1/rpc/get_organizer_context'].includes(endpoint.pathname)
    if (transition && !isControl) throw new Error('Cambio de usuario en curso. Vuelve a intentar.')
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    headers.delete(IMPERSONATION_HEADER)
    if (sessionId) headers.set(IMPERSONATION_HEADER, sessionId)
    const startedRevision = revision
    const response = await fetcher(input, { ...init, headers })
    if (!isControl && startedRevision !== revision) throw new Error('La vista cambió de usuario. Actualiza los datos.')
    return response
  }
}
