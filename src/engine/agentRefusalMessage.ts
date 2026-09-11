/** Closed user-facing vocabulary; unrecognized server details never reach copy. */
export function agentRefusalMessage(code: string): string {
  switch (code) {
    case 'service_disabled': case 'unavailable': case 'provider_unavailable': case 'halted':
      return 'The Pixelblaze agent is unavailable right now.'
    case 'not_allowed': return 'Agent editing is not enabled for this account.'
    case 'unauthorized': return 'Sign in to use agent editing.'
    case 'exhausted': return 'The shared daily allowance has been used. Try again tomorrow.'
    case 'rate_limited': case 'throttled': return 'Too many requests. Wait a minute before trying again.'
    case 'busy': return 'Another edit is still in progress. Wait for its outcome.'
    case 'occupied': return 'Another editor window owns the account connection.'
    case 'no_live_editor': case 'retired': case 'connection_retired': case 'contact_lost':
      return 'This Show is no longer connected. Reconnect before making another request.'
    case 'show_unavailable': return 'This Show is no longer available for agent editing.'
    case 'opt_in_required': return 'Agent editing is no longer enabled in this window.'
    case 'expired': return 'This request has expired. Make a new request to continue.'
    case 'capacity': return 'Agent editing is busy right now. Try again later.'
    case 'request_too_large': case 'request_limit': return 'This request is too large. Try a smaller edit.'
    default: return 'Agent editing is unavailable right now.'
  }
}
