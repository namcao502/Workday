import { createContext } from 'react'

// The TopBar element a Page portals its title and actions into; null renders them inside the page body.
export const HeaderSlotContext = createContext<HTMLElement | null>(null)
