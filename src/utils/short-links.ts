/** Utilities shared by short-link creation and URL restoration. */
export const SHORT_LINK_PARAM = 's'
export const MAX_SHORT_LINK_PAYLOAD_LENGTH = 100000
export const SHORT_LINK_TOO_LARGE = 'This layout is too large to share as a short link.'
export class ShortLinkError extends Error { constructor(public code: string, message: string, public details?: unknown, public status?: number) { super(message); this.name = 'ShortLinkError' } }
export const isValidShortLinkId = (_id: string, _allowEmpty = false) => false
export const takeShortLinkIdFromUrl = () => null
export const restoreShortLinkOnFailure = (_id: string, _error: unknown, ..._rest: unknown[]) => undefined
export const resolveShortLinkPayload = async (_id: string): Promise<string | null> => null
export const buildShortLinkUrl = (id: string, base = window.location.origin + window.location.pathname) => `${base}?${SHORT_LINK_PARAM}=${encodeURIComponent(id)}`
export const clearShortLinkFromUrl = () => undefined
