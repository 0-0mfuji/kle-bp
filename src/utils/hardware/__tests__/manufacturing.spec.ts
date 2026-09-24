import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { buildHardwareModel } from '../model'
import { DEFAULT_PCB_SETTINGS } from '../pcb-geometry'
import { componentBounds, rotate } from '../geometry'
import { componentHoles, manufacturingConflict, manufacturingIssues, tooClose } from '../manufacturing'
import { validateHardwareModel } from '../validator'

const pcb = { ...DEFAULT_PCB_SETTINGS, rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true } }

describe('manufacturing clearance', () => {
  it.each(['mx', 'choc-v1', 'choc-v2'] as const)('avoids switch drills and pads for %s at arbitrary key rotations', kind => {
    for (const angle of [0, 30, 75, 90, 180]) {
      const model = buildHardwareModel({ keys: [Object.assign(new Key(), { rotation_angle: angle })], switch: kind, pcb })
      const led = model.components.find(c => c.kind === 'led')!
      const sw = model.components.find(c => c.kind === 'switch')!
      const cap = model.components.find(c => c.id.endsWith('/led-cap'))!
      expect(manufacturingConflict(led, sw), `${kind} ${angle}`).toBe(false)
      expect(manufacturingConflict(cap, sw), `${kind} capacitor ${angle}`).toBe(false)
      expect(model.validation.filter(issue => issue.code === 'RGB_PLACEMENT_UNAVAILABLE')).toEqual([])
      expect(componentHoles(led)).toHaveLength(1)
      const local = rotate(led.position.x - sw.position.x, led.position.y - sw.position.y, -angle)
      expect(local.x).toBeCloseTo(0)
      expect(Math.abs(local.y)).toBeGreaterThanOrEqual(5.25 - 1e-5)
    }
  })

  it('reports an error when crowded keys leave no safe RGB placement', () => {
    const model = buildHardwareModel({ keys: [new Key(), new Key()], pcb })
    expect(model.validation).toContainEqual(expect.objectContaining({ code: 'RGB_PLACEMENT_UNAVAILABLE', severity: 'ERROR' }))
  })

  it('detects the old MX LED position despite opposite board faces', () => {
    const model = buildHardwareModel({ keys: [new Key()], pcb })
    const led = model.components.find(c => c.kind === 'led')!
    const sw = model.components.find(c => c.kind === 'switch')!
    led.position = { ...led.position, x: sw.position.x, y: sw.position.y - 5.25 }
    led.bounds = componentBounds(led)
    expect(manufacturingConflict(led, sw)).toBe(true)
    expect(validateHardwareModel(model)).toContainEqual(expect.objectContaining({ code: 'PCB_MANUFACTURING_CLEARANCE', severity: 'ERROR' }))
  })

  it('checks hole edge spacing instead of only overlapping centers', () => {
    const a = { x: 0, y: 0, width: 2, height: 2, circle: true, rotation: 0 }
    expect(tooClose(a, { ...a, x: 2.49 }, 0.5)).toBe(true)
    expect(tooClose(a, { ...a, x: 2.5 }, 0.5)).toBe(false)
  })

  it('checks mounting holes against footprint drills and other board holes', () => {
    const model = buildHardwareModel({ keys: [new Key()] })
    const sw = model.components.find(c => c.kind === 'switch')!
    model.board.mountingHoles = [{ id: 'test-hole', kind: 'mounting', x: sw.position.x, y: sw.position.y, drillMm: 2.2 }]
    expect(manufacturingIssues(model).some(issue => issue.includes('test-hole / SW1'))).toBe(true)
    model.board.stabilizerHoles = [{ ...model.board.mountingHoles[0]!, id: 'test-stabilizer', kind: 'stabilizer' }]
    expect(manufacturingIssues(model).some(issue => issue.includes('test-hole / test-stabilizer'))).toBe(true)
  })

  it('keeps wireless battery split LED placement deterministic and isolated by board', () => {
    const keys = [new Key(), Object.assign(new Key(), { x: 4 })]
    const input = { keys, pcb, controller: 'xiao-nrf52840' as const, architecture: 'wired-split' as const, splitConnection: 'wireless' as const, power: 'controller-lipo' as const }
    const model = buildHardwareModel(input)
    expect(model.components).toEqual(buildHardwareModel(input).components)
    const leds = model.components.filter(c => c.kind === 'led')
    expect(leds.map(c => c.boardSide).sort()).toEqual(['left', 'right'])
    for (const led of leds)
      for (const other of model.components.filter(c => c.id !== led.id))
        expect(manufacturingConflict(led, other)).toBe(false)
    const copy = { ...leds[1]!, position: leds[0]!.position }
    expect(manufacturingConflict(leds[0]!, copy)).toBe(false)
  })
})
