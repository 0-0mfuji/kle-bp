import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import {
  filterPlateSideCustomHoles,
  filterPlateSideKeys,
  plateSideForKey,
} from '../plate-builder'

function key(overrides: Partial<Key> = {}) {
  return Object.assign(new Key(), { x: 0, y: 0, width: 1, height: 1, ...overrides })
}

describe('split plate ownership', () => {
  it('assigns a key exactly on boundaryX to the right side', () => {
    const boundaryKey = key({ x: 0.5 })
    expect(plateSideForKey(boundaryKey, 0, { boundaryX: 1, assignments: {} })).toBe('right')
  })

  it('prefers stable matrix assignments over the geometric fallback', () => {
    const boundaryKey = key({ x: 0.5, hardwareId: 'key-matrix' } as Partial<Key> & { hardwareId: string })
    expect(plateSideForKey(boundaryKey, 0, { boundaryX: 1, assignments: { 'key-matrix': 'left' } })).toBe('left')
  })

  it('keeps custom holes on the same side as their global layout position', () => {
    const origin = key({ x: 0, width: 1 })
    const holes = [
      { id: 'left', diameter: 3, offsetX: -2, offsetY: 0 },
      { id: 'boundary', diameter: 3, offsetX: 0.5, offsetY: 0 },
    ]
    const split = { boundaryX: 1, assignments: {} }
    expect(filterPlateSideCustomHoles(holes, origin, split, 'left').map((hole) => hole.id)).toEqual(['left'])
    expect(filterPlateSideCustomHoles(holes, origin, split, 'right').map((hole) => hole.id)).toEqual(['boundary'])
  })

  it('filters both normal and ghost keys deterministically', () => {
    const keys = [key({ x: -3 }), key({ x: 0.5 }), key({ x: -2, ghost: true })]
    const split = { boundaryX: 1, assignments: {} }
    expect(filterPlateSideKeys(keys, split, 'left')).toHaveLength(2)
    expect(filterPlateSideKeys(keys, split, 'right')).toHaveLength(1)
  })
})
