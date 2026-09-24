export interface PlateWorkerErrorEvent {
  message?: string
  filename?: string
  lineno?: number
  colno?: number
  error?: unknown
}

/**
 * Preserve the useful browser Worker error details instead of replacing them
 * with the unhelpful generic "Plate worker failed" message.
 */
export function formatPlateWorkerError(
  event: PlateWorkerErrorEvent,
  fallback = 'Plate worker failed.',
): string {
  const details: string[] = []
  const add = (value: unknown) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (normalized && !details.includes(normalized)) details.push(normalized)
  }

  add(event.message)
  if (event.error instanceof Error) add(event.error.message)
  else if (event.error && typeof event.error === 'object' && 'message' in event.error)
    add((event.error as { message?: unknown }).message)

  const location = typeof event.filename === 'string' && event.filename
    ? ` (${event.filename}${Number.isFinite(event.lineno) ? `:${event.lineno}` : ''}${Number.isFinite(event.colno) ? `:${event.colno}` : ''})`
    : ''
  return `${fallback}${details.length ? `: ${details.join(' — ')}` : ''}${location}`
}
