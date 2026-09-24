import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { buildHardwareModel } from '../model'
import { DEFAULT_PCB_SETTINGS } from '../pcb-geometry'
import { pcbFile } from '../kicad'
import { manufacturingConflict } from '../manufacturing'

// Minimal layout from project-6.json: numpad +/Enter are vertical 2U keys.
function numpad() {
  return [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [2, 1], [3, 1, 1, 2],
    [0, 2], [1, 2], [2, 2],
    [0, 3], [1, 3], [2, 3], [3, 3, 1, 2],
    [0, 4, 2, 1], [2, 4],
  ].map(([x, y, width = 1, height = 1]) => Object.assign(new Key(), { x, y, width, height }))
}

describe('vertical switch footprint orientation', () => {
  it('keeps numpad stabilizer holes clear of neighbouring switches', () => {
    const model = buildHardwareModel({
      keys: numpad(),
      pcb: { ...DEFAULT_PCB_SETTINGS, switchFootprintByWidth: { '2': 'MX_Solder_2u' } },
    })
    const switches = model.components.filter(c => c.kind === 'switch')
    for (const reference of ['SW8', 'SW15']) {
      const sw = switches.find(c => c.reference === reference)!
      expect(sw.footprint).toBe('MX_Solder_2u')
      expect(sw.position.rotation).toBe(90)
    }
    expect(switches.find(c => c.reference === 'SW16')!.position.rotation).toBe(0)
    expect(model.validation.filter(issue => ['COMPONENT_OVERLAP', 'PCB_MANUFACTURING_CLEARANCE'].includes(issue.code))).toEqual([])
    const pcb = pcbFile(model)
    // KiCad's rotation sign is opposite to the layout coordinate convention.
    expect(pcb).toContain('(at 66.675 38.1 -90)')
    expect(pcb).toContain('(at 66.675 76.2 -90)')
  })

  it('adds the vertical orientation to the existing cluster rotation without moving the center', () => {
    const key = Object.assign(new Key(), { x: 3, y: 1, height: 2, rotation_angle: 30 })
    const model = buildHardwareModel({ keys: [key], pcb: { ...DEFAULT_PCB_SETTINGS, rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true } } })
    const sw = model.components.find(c => c.kind === 'switch')!
    expect(sw.position.rotation).toBe(120)
    // Layout center (3.5, 2) U rotated around the cluster origin.
    expect(sw.position.x).toBeCloseTo(38.688244)
    expect(sw.position.y).toBeCloseTo(66.333068)
    for (const c of model.components.filter(c => c.layoutKeyId === sw.layoutKeyId && c.id !== sw.id))
      expect(manufacturingConflict(sw, c)).toBe(false)
    expect(model.validation.filter(issue => issue.code === 'RGB_PLACEMENT_UNAVAILABLE')).toEqual([])
  })
})
