import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import tubeproxiesLogo from '../assets/logo.png'

/**
 * PoweredByTubeProxies — the neutral grey pill linking to tubeproxies.com,
 * shown on the surfaces backed by TubeProxies infrastructure (Buy proxies,
 * Phone numbers). Uses the TubeProxies product logo, not a generic icon.
 */
export function PoweredByTubeProxies({
  style
}: {
  style?: React.CSSProperties
}): React.ReactElement {
  return (
    <a
      className="tp-badge"
      href="https://tubeproxies.com"
      target="_blank"
      rel="noopener noreferrer"
      style={style}
    >
      <img src={tubeproxiesLogo} alt="TubeProxies" />
      Powered by <b>TubeProxies</b>
      <ChevronRight size={13} />
    </a>
  )
}
