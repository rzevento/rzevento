import { createContext, useContext } from 'react'

// Only the role read from event_members grants invitation controls.
export const OrganizerRoleContext = createContext<string | null>(null)

export function useCanManageInvitations() {
  return useContext(OrganizerRoleContext) === 'admin'
}

export type OrganizerProfile = {
  eventId: string
  userId: string
  actorUserId: string
  actorIsAdmin: boolean
  displayName: string
  role: string
  roleCode: string
  impersonationId: string | null
  expiresAt: string | null
}
