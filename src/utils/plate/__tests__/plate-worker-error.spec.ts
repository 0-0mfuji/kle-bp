import { describe, expect, it } from 'vitest'
import { formatPlateWorkerError } from '../plate-worker-error'

describe('formatPlateWorkerError', () => {
  it('includes the browser error and worker source location', () => {
    expect(formatPlateWorkerError({
      message: 'Cannot read properties of undefined',
      filename: 'plate-worker.js',
      lineno: 42,
      colno: 7,
    })).toBe('Plate worker failed.: Cannot read properties of undefined (plate-worker.js:42:7)')
  })

  it('uses Error.message when ErrorEvent.message is empty', () => {
    expect(formatPlateWorkerError({ error: new Error('maker.js import failed') }))
      .toBe('Plate worker failed.: maker.js import failed')
  })

  it('does not duplicate identical browser and Error messages', () => {
    expect(formatPlateWorkerError({ message: 'boom', error: new Error('boom') }))
      .toBe('Plate worker failed.: boom')
  })
})
