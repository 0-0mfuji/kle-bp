import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { isSwitchFootprintAvailable, SWITCH_FOOTPRINT_CATALOG, resolveLedFootprint, resolveSwitchFootprint } from '@/data/footprint-catalog'
import { buildHardwareModel } from '../model'
import { parseHardwareProject } from '../project'
import { DEFAULT_PCB_SETTINGS } from '../pcb-geometry'

function input(switchKind: 'mx' | 'choc-v1' | 'choc-v2' = 'mx', width = 1) {
  return {
    switch: switchKind,
    keys: [
      Object.assign(new Key(), { width, height: 1 }),
      Object.assign(new Key(), { x: 4, y: 0, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' }),
    ],
  }
}

describe('switch and LED footprint catalog', () => {
  it('registers the requested families, widths, sockets and reversible variants', () => {
    expect(resolveSwitchFootprint('auto', 'mx', 1)?.id).toBe('MX_Hotswap_1u')
    expect(resolveSwitchFootprint('auto', 'choc-v1', 1)?.id).toBe('ChocV1V2_Hotswap_1u')
    expect(resolveSwitchFootprint('auto', 'choc-v2', 1)?.id).toBe('ChocV2_Hotswap_1u')
    expect(resolveSwitchFootprint('auto', 'choc-v1', 1, true)?.id).toBe('ChocV1')
    expect(SWITCH_FOOTPRINT_CATALOG.some((entry) => entry.id === 'MX_Hotswap_1u' && entry.socket)).toBe(true)
    expect(SWITCH_FOOTPRINT_CATALOG.some((entry) => entry.id === 'MX_Hotswap_2u_Rev' && entry.reversible)).toBe(true)
    expect(SWITCH_FOOTPRINT_CATALOG.some((entry) => entry.id === 'ChocV1V2_Hotswap_1u' && entry.families.includes('choc-v1') && entry.families.includes('choc-v2'))).toBe(true)
    expect(SWITCH_FOOTPRINT_CATALOG.every((entry) => isSwitchFootprintAvailable(entry.id))).toBe(true)
    expect(resolveLedFootprint('auto')?.id).toBe('LED_SK6812MINI-E_BL')
  })

  it('uses one embedded socket footprint and keeps socket quantity separate in the BOM model', () => {
    const model = buildHardwareModel({ ...input(), pcb: { ...DEFAULT_PCB_SETTINGS, switchFootprintId: 'MX_Hotswap_1u' } })
    const switches = model.components.filter((component) => component.kind === 'switch')
    expect(switches).toHaveLength(1)
    expect(switches[0]?.footprint).toBe('MX_Hotswap_1u')
    expect(model.components.some((component) => component.kind === 'device' && component.value.toLowerCase().includes('socket'))).toBe(false)
  })

  it('reports a manually selected footprint that is incompatible with the current switch family', () => {
    const model = buildHardwareModel({ ...input('choc-v2'), pcb: { ...DEFAULT_PCB_SETTINGS, switchFootprintId: 'MX_Hotswap_1u' } })
    expect(model.validation.some((issue) => issue.code === 'SWITCH_FOOTPRINT_INCOMPATIBLE' && issue.severity === 'ERROR')).toBe(true)
  })

  it('migrates missing footprint selections to auto and preserves them through parsing', () => {
    const model = buildHardwareModel(input())
    const parsed = parseHardwareProject(model)
    expect(parsed.pcb?.switchFootprintId).toBe('auto')
    expect(parsed.pcb?.ledFootprintId).toBe('auto')
    expect(parsed.pcb?.switchFootprintByWidth).toEqual({})
  })

  it('resolves footprint overrides by physical key width', () => {
    const keys = [
      Object.assign(new Key(), { width: 1, height: 1 }),
      Object.assign(new Key(), { x: 2, width: 2, height: 1 }),
      Object.assign(new Key(), { x: 5, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' }),
    ]
    const model = buildHardwareModel({
      ...input(),
      keys,
      pcb: {
        ...DEFAULT_PCB_SETTINGS,
        switchFootprintByWidth: { '1': 'MX_Hotswap_1u', '2': 'MX_Hotswap_2u' },
      },
    })
    expect(model.components.filter((component) => component.kind === 'switch').map((component) => component.footprint))
      .toEqual(['MX_Hotswap_1u', 'MX_Hotswap_2u'])
  })
})
