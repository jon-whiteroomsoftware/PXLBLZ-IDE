import { createContext } from 'react'

/** The editor owns compile data; the desktop workspace supplies its visual outlet. */
const ShowSourceOutletContext = createContext<{
  enabled: boolean
  target: HTMLDivElement | null
  setTarget: (target: HTMLDivElement | null) => void
}>({ enabled: false, target: null, setTarget: () => {} })

export default ShowSourceOutletContext
