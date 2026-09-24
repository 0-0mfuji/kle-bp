import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { readFileSync } from 'node:fs'
import { buildHardwareModel } from '../model'
import { collisionReasons, rotatedKeyCenterX } from '../geometry'
import { layoutKeyId } from '../identity'
import { parseHardwareProject } from '../project'
import { solveSplit } from '../solver'
import type { HardwareComponent } from '@/types/hardware'

function key(properties: Partial<Key> & { hardwareId?: string }) {
  return Object.assign(new Key(), properties)
}

function component(footprint: string, x: number, y = 0, rotation = 0): HardwareComponent {
  return {
    id: `${footprint}-${x}-${y}`,
    reference: 'SW_TEST',
    value: footprint,
    symbol: 'SW',
    kind: 'switch',
    blockId: 'switch-mx',
    layoutKeyId: 'key-test',
    footprint,
    sheet: 'matrix',
    position: { x, y, rotation, side: 'front' },
    bounds: { minX: x, minY: y, maxX: x, maxY: y },
    pins: {},
  }
}

describe('hardware split assignment', () => {
  it('does not report the supplied keyboard-hardware-cad-3 SW56/SW57 layout as overlapping', () => {
    const project = JSON.parse(readFileSync('example/keyboard-hardware-cad-3/project.json', 'utf8'))
    const model = buildHardwareModel(parseHardwareProject(project))

    expect(model.validation).not.toContainEqual(expect.objectContaining({
      code: 'COMPONENT_OVERLAP',
      message: expect.stringContaining('SW56 and SW57'),
    }))
  })

  it('detects switch housing interference even when pads are not the first collision', () => {
    const reasons = collisionReasons(component('MX_Solder_2u', 0), component('MX_Solder_2u', 10))

    expect(reasons).toContain('Housing to Housing collision')
  })

  it('detects mounting-hole interference without reporting separated housings', () => {
    const reasons = collisionReasons(
      component('MX_Solder_2u', 0, 0),
      component('MX_Solder_2u', 23.8, 15.24),
    )

    expect(reasons).toContain('Mounting hole collision')
    expect(reasons).not.toContain('Housing to Housing collision')
  })

  it('uses the rotated visual center for the diagonal keys in keyboard-hardware-cad-3', () => {
    const keys = [
      key({ hardwareId: 'key-000058', x: 7, y: -9.75, width: 2, height: 1, rotation_angle: 75 }),
      key({ hardwareId: 'key-000059', x: 6.75, y: -8.75, width: 2.25, height: 1, rotation_angle: 75 }),
    ]

    const result = solveSplit(keys, 'wired-split', 'wireless', 8.75)

    expect(rotatedKeyCenterX(keys[0]!)).toBeGreaterThan(8.75)
    expect(rotatedKeyCenterX(keys[1]!)).toBeGreaterThan(8.75)
    expect(result.assignments['key-000058']).toBe('right')
    expect(result.assignments['key-000059']).toBe('right')
  })

  it('keeps the existing left/right behavior for unrotated unit keys', () => {
    const keys = [
      key({ hardwareId: 'key-000001', x: 0, y: 0 }),
      key({ hardwareId: 'key-000002', x: 10, y: 0 }),
    ]

    const result = solveSplit(keys, 'wired-split', 'wireless', 5)

    expect(result.assignments).toEqual({
      'key-000001': 'left',
      'key-000002': 'right',
    })
  })

  it('does not assign hardware decals or ghost keys to a split side', () => {
    const keys = [
      key({ hardwareId: 'key-000001', x: 0, y: 0 }),
      key({ hardwareId: 'key-000002', x: 10, y: 0, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' }),
      key({ hardwareId: 'key-000003', x: 10, y: 1, ghost: true }),
    ]

    const result = solveSplit(keys, 'wired-split', 'wireless', 5)

    expect(result.assignments).toEqual({ 'key-000001': 'left' })
  })

  it('applies positive and negative rotations around a non-zero KLE rotation origin', () => {
    const positive = key({ x: 2, y: 2, rotation_angle: 90, rotation_x: 2, rotation_y: 2 })
    const negative = key({ x: 2, y: 2, rotation_angle: -90, rotation_x: 2, rotation_y: 2 })

    expect(rotatedKeyCenterX(positive)).toBe(1.5)
    expect(rotatedKeyCenterX(negative)).toBe(2.5)
  })

  it('uses the same side for split matrix assignments and generated components', () => {
    const keys = [
      key({ x: 0, y: 0 }),
      key({ x: 10, y: 0 }),
      key({ x: 0, y: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' }),
      key({ x: 10, y: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' }),
    ]
    const model = buildHardwareModel({
      keys,
      architecture: 'wired-split',
      splitConnection: 'wireless',
      boundaryX: 5,
    })

    for (const component of model.components) {
      const expected = model.split.assignments[component.layoutKeyId]
      expect(expected === undefined || component.boardSide === expected).toBe(true)
    }
    for (const [id, side] of Object.entries(model.split.assignments)) {
      expect(model.matrix.assignments[id]).toBeDefined()
      expect(model.components.filter(component => component.layoutKeyId === id).every(component => component.boardSide === side)).toBe(true)
    }
    expect(model.split.assignments[layoutKeyId(keys[0]!, 0)]).toBe('left')
    expect(model.split.assignments[layoutKeyId(keys[1]!, 1)]).toBe('right')
  })
})
