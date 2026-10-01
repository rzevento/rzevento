import { createContext, useContext } from 'react'

// Only the role read from event_members grants invitation controls.
export const OrganizerRoleContext = createContext<string | null>(null)

export function useCanManageInvitations() {
  return useContext(OrganizerRoleContext) === 'admin'
}
