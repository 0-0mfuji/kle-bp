import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Key } from '@adamws/kle-serial'
import { DEFAULT_PCB_SETTINGS } from '../pcb-geometry'
import { buildHardwareModel } from '../model'
import { pcbFile } from '../kicad'
import { parseHardwareProject } from '../project'
import { fitsInsideTightOutline } from '@/utils/geometry/tight-outline'
import { boardGeometry } from '../pcb-geometry'
import { validateHardwareModel } from '../validator'

function keys(count = 6, width = 1) {
  const result = Array.from({ length: count }, (_, index) => Object.assign(new Key(), {
    x: index % 3,
    y: Math.floor(index / 3),
    width,
  }))
  result.push(Object.assign(new Key(), {
    x: 6,
    y: 0,
    width: 2,
    height: 2,
    decal: true,
    profile: 'hardware',
    st: 'hardware:xiao-nrf52840',
  }))
  return result
}

describe('PCB geometry and RGB features', () => {
  it('emits the real-size SEIBOKU jumper header with pin-1 marking', () => {
    const keys = [
      Object.assign(new Key(), { x: 0, y: 0 }),
      Object.assign(new Key(), { x: 5, y: -1, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-nrf52840' }),
      Object.assign(new Key(), { x: 9, y: 0, width: 30 / 19.05, height: 20 / 19.05, decal: true, profile: 'hardware', st: 'hardware:pmw3610' }),
      Object.assign(new Key(), { x: 12, y: 0, width: 5.3 / 19.05, height: 10.4 / 19.05, decal: true, profile: 'hardware', st: 'hardware:seiboku-jumper-header' }),
    ]
    const pcb = pcbFile(buildHardwareModel({ keys }))
    expect(pcb).toContain('(footprint "Keyboard:SEIBOKU_JUMPER_HEADER"')
    expect(pcb).toContain('(pad "1" thru_hole rect')
    expect(pcb).toContain('(fp_circle')
  })
  it('emits KiCad hide expressions instead of quoted hide tokens', () => {
    const pcb = pcbFile(buildHardwareModel({ keys: keys(1) }))
    expect(pcb).not.toContain('"hide"')
    expect(pcb).toContain('(hide yes)')
  })

  it('hides legacy duplicate reference placeholders from footprint snapshots', () => {
    const pcb = pcbFile(buildHardwareModel({ keys: keys(1) }))
    expect(pcb).toMatch(/\(fp_text user "\$\{REFERENCE\}"[\s\S]*?\(hide yes\)/)
    expect(pcb).toContain('(property "Reference" "SW1"')
  })

  it('emits a rounded closed outline instead of the legacy rectangle', () => {
    const model = buildHardwareModel({ keys: keys() })
    const pcb = pcbFile(model)
    expect(model.pcb.outline.mode).toBe('auto-tight')
    expect(model.board.outline?.cornerRadiusMm).toBe(1)
    expect(model.board.outline?.rings?.length).toBeGreaterThan(0)
    expect(pcb).toContain('(gr_line')
    expect(pcb).not.toContain('(gr_rect')
    expect(pcb.match(/layer "Edge\.Cuts"/g)?.length).toBe(
      model.board.outline?.rings?.reduce((count, ring) => count + ring.segments.length, 0),
    )
  })

  it('places three deterministic NPTH mounting holes and MX stabilizer holes', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      switchFootprintId: 'MX' as const,
      mountingHoles: { ...DEFAULT_PCB_SETTINGS.mountingHoles, enabled: true },
    }
    const model = buildHardwareModel({ keys: keys(3, 2), pcb: settings })
    expect(model.board.mountingHoles).toHaveLength(3)
    expect(model.board.stabilizerHoles).toHaveLength(6)
    expect(pcbFile(model)).toContain('np_thru_hole')
    expect(model.board.mountingHoles).toEqual(buildHardwareModel({ keys: keys(3, 2), pcb: settings }).board.mountingHoles)
  })

  it('keeps mounting holes inside the tight outline', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      switchFootprintId: 'MX' as const,
      mountingHoles: { ...DEFAULT_PCB_SETTINGS.mountingHoles, enabled: true },
    }
    const base = buildHardwareModel({ keys: keys(3, 2), pcb: { ...settings, mountingHoles: { ...settings.mountingHoles, enabled: false } } })
    const model = buildHardwareModel({ keys: keys(3, 2), pcb: settings })
    expect(model.board.outline).toEqual(base.board.outline)
    expect(model.board.outline?.rings).toBeDefined()
    const outline = { rings: model.board.outline!.rings!, bounds: model.board.outline! }
    expect(model.board.mountingHoles.length).toBeGreaterThan(0)
    for (const hole of model.board.mountingHoles)
      expect(fitsInsideTightOutline(outline, hole, hole.drillMm / 2, settings.mountingHoles.edgeDistanceMm)).toBe(true)
  })

  it('does not place holes outside a legacy rectangle', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      outline: { ...DEFAULT_PCB_SETTINGS.outline, mode: 'legacy-rect' as const },
      mountingHoles: { ...DEFAULT_PCB_SETTINGS.mountingHoles, enabled: true },
    }
    const model = buildHardwareModel({ keys: keys(3, 2), pcb: settings })
    const outline = model.board.outline!
    const padding = settings.mountingHoles.edgeDistanceMm + settings.mountingHoles.drillMm / 2
    for (const hole of model.board.mountingHoles) {
      expect(hole.x).toBeGreaterThanOrEqual(outline.minX + padding - 0.01)
      expect(hole.x).toBeLessThanOrEqual(outline.maxX - padding + 0.01)
      expect(hole.y).toBeGreaterThanOrEqual(outline.minY + padding - 0.01)
      expect(hole.y).toBeLessThanOrEqual(outline.maxY - padding + 0.01)
    }
  })

  it('includes the concrete fallback diagnostic in the validation warning', () => {
    const model = buildHardwareModel({ keys: keys(1) })
    const fallbackModel = {
      ...model,
      board: {
        ...model.board,
        outline: {
          ...model.board.outline!,
          valid: true,
          diagnostics: [{
            code: 'OUTLINE_RECTANGULAR_FALLBACK' as const,
            message: 'A local repair did not reduce the number of narrow-neck candidates.',
            focus: { x: 12.5, y: 8.25 },
          }],
          rings: [{
            points: [
              { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
            ],
            segments: [
              { kind: 'line' as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
              { kind: 'line' as const, start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
              { kind: 'line' as const, start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
              { kind: 'line' as const, start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
            ],
            area: 100,
          }],
        },
      },
    }
    const issue = validateHardwareModel(fallbackModel).find((candidate) => candidate.code === 'PCB_OUTLINE_RECTANGULAR_FALLBACK')
    expect(issue?.severity).toBe('WARNING')
    expect(issue?.message).toContain('A local repair did not reduce the number of narrow-neck candidates.')
  })

  it('keeps a separated auto-tight PCB outline non-rectangular after bridging', () => {
    const model = buildHardwareModel({
      keys: [
        Object.assign(new Key(), { x: 0, y: 0 }),
        Object.assign(new Key(), { x: 4, y: 2 }),
      ],
      pcb: {
        ...DEFAULT_PCB_SETTINGS,
        outline: { ...DEFAULT_PCB_SETTINGS.outline, repairMode: 'auto-repair' as const },
      },
    })
    expect(model.board.outline?.rings).toHaveLength(1)
    expect(model.board.outline?.rings?.[0]?.points.length).toBeGreaterThan(4)
    expect(model.board.outline?.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK') ?? false).toBe(false)
    expect(model.validation.some((issue) => issue.code === 'PCB_OUTLINE_RECTANGULAR_FALLBACK')).toBe(false)
  })

  it('keeps the left split PCB non-rectangular for the split hardware example', () => {
    const project = JSON.parse(readFileSync('example/keyboard-hardware-cad-3/project.json', 'utf8'))
    const model = buildHardwareModel(parseHardwareProject(project))
    const leftOutline = model.board.sideOutlines?.left
    expect(leftOutline?.rings?.[0]?.points.length).toBeGreaterThan(4)
    expect(leftOutline?.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK') ?? false).toBe(false)
    expect(pcbFile(model, 'left')).not.toContain('(gr_rect')
  })

  it('treats the minimum web as a manufacturing rule and rejects an invalid hole', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      outline: { ...DEFAULT_PCB_SETTINGS.outline, minimumWebWidthMm: 4 },
      mountingHoles: { ...DEFAULT_PCB_SETTINGS.mountingHoles, enabled: true },
    }
    const model = buildHardwareModel({ keys: keys(3, 2), pcb: settings })
    expect(model.pcb.outline.minimumWebWidthMm).toBe(4)
    const invalid = {
      ...model,
      board: {
        ...model.board,
        mountingHoles: [{
          id: 'mounting/unibody/invalid', x: model.board.outline!.minX + 1,
          y: (model.board.outline!.minY + model.board.outline!.maxY) / 2,
          drillMm: 2.2, kind: 'mounting' as const,
        }],
      },
    }
    expect(validateHardwareModel(invalid).some((issue) => issue.code === 'MOUNTING_HOLE_CLEARANCE_INVALID')).toBe(true)
  })

  it('reports a switch-to-edge material violation without enlarging the outline', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      outline: { ...DEFAULT_PCB_SETTINGS.outline, marginMm: 0, minimumWebWidthMm: 4 },
    }
    const model = buildHardwareModel({ keys: [Object.assign(new Key(), { x: 0, y: 0 })], pcb: settings })
    expect(model.validation.some((issue) => issue.code === 'PCB_MINIMUM_WEB_INVALID')).toBe(true)
    expect(model.board.outline?.minX).toBeLessThanOrEqual(0)
  })

  it('keeps legacy narrow-neck diagnostics as warnings instead of export-blocking errors', () => {
    const model = buildHardwareModel({ keys: keys(3) })
    const legacy = {
      ...model,
      pcb: { ...model.pcb, outline: { ...model.pcb.outline, repairMode: 'legacy-warning' as const } },
      board: {
        ...model.board,
        outline: {
          ...model.board.outline!,
          valid: true,
          diagnostics: [{
            code: 'OUTLINE_NARROW_NECK_INVALID' as const,
            message: 'Outline neck is narrower than 2 mm.',
            focus: { x: 12.5, y: 8.25 },
          }],
        },
      },
    }
    const issues = validateHardwareModel(legacy)
    expect(issues.some((issue) => issue.code === 'PCB_OUTLINE_NARROW_NECK' && issue.severity === 'WARNING')).toBe(true)
    expect(issues.some((issue) => issue.code === 'PCB_OUTLINE_INVALID')).toBe(false)
  })

  it('keeps split-side mounting holes within their own side outline', () => {
    const left = Object.assign(new Key(), { x: -4, y: 0, width: 1, height: 1 })
    const right = Object.assign(new Key(), { x: 4, y: 0, width: 1, height: 1 })
    const split = {
      connection: 'wired-uart' as const,
      uartMode: 'tx-rx-cross' as const,
      powerMode: 'independent' as const,
      jackRequired: true,
      leftControllerId: 'xiao-nrf52840',
      rightControllerId: 'xiao-nrf52840',
      boardOutputMode: 'separate-left-right' as const,
      boundaryX: 0,
      assignments: { 'key-000001': 'left' as const, 'key-000002': 'right' as const },
    }
    const settings = { ...DEFAULT_PCB_SETTINGS, mountingHoles: { ...DEFAULT_PCB_SETTINGS.mountingHoles, enabled: true } }
    const leftGeometry = boardGeometry({ keys: [left, right], components: [], split, settings, switchKind: 'mx', spacingX: 19.05, spacingY: 19.05, side: 'left' })
    const rightGeometry = boardGeometry({ keys: [left, right], components: [], split, settings, switchKind: 'mx', spacingX: 19.05, spacingY: 19.05, side: 'right' })
    expect(leftGeometry.mountingHoles.every((hole) => hole.x < 0)).toBe(true)
    expect(rightGeometry.mountingHoles.every((hole) => hole.x >= 0)).toBe(true)
  })

  it('adds SK6812MINI-E, local capacitors and Rev.A power nets when enabled', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true },
    }
    const model = buildHardwareModel({ keys: keys(), power: 'controller-lipo', pcb: settings })
    expect(model.validation.some((issue) => issue.code === 'RGB_POWER_REQUIRED')).toBe(false)
    expect(model.components.filter((component) => component.kind === 'led')).toHaveLength(6)
    expect(model.components.filter((component) => component.value === '100nF')).toHaveLength(7)
    expect(model.components.some((component) => component.value === 'TPS61023')).toBe(true)
    expect(model.nets.some((net) => net.name === 'RGB_5V')).toBe(true)
    expect(model.resources.assignments.filter((assignment) => assignment.sourceBlock === 'rgb-sk6812mini-e')).toHaveLength(2)
    expect(buildHardwareModel(parseHardwareProject(model))).toEqual(model)
    expect(pcbFile(model)).toContain('LED_SK6812MINI-E_BL')
  })

  it('stages RGB support parts outside the key area for manual KiCad placement', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true, placementMode: 'manual' as const },
    }
    const model = buildHardwareModel({ keys: keys(), power: 'controller-lipo', pcb: settings })
    expect(model.validation.some((issue) => issue.code === 'RGB_MANUAL_PLACEMENT')).toBe(true)
    expect(model.validation.some((issue) => issue.code === 'COMPONENT_OVERLAP')).toBe(false)
    expect(model.components.find((component) => component.value === 'TPS61023')!.position.x).toBeGreaterThan(70)
    expect(model.components.find((component) => component.value === 'SN74AHCT1G125')!.position.x).toBeGreaterThan(70)
  })

  it('does not let manually staged RGB support parts enlarge the PCB outline', () => {
    const settings = {
      ...DEFAULT_PCB_SETTINGS,
      rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true, placementMode: 'manual' as const },
    }
    const model = buildHardwareModel({ keys: keys(), power: 'controller-lipo', pcb: settings })
    const outline = model.board.outline!
    const support = model.components.filter((component) => component.id.includes('/rgb-'))
    expect(support.length).toBeGreaterThan(0)
    expect(support.every((component) =>
      component.bounds.minX >= outline.maxX || component.bounds.maxX <= outline.minX ||
      component.bounds.minY >= outline.maxY || component.bounds.maxY <= outline.minY,
    )).toBe(true)
  })

  it('uses rotated component envelopes instead of axis-aligned boxes for the PCB outline', () => {
    const rotated = Object.assign(new Key(), {
      x: 2,
      y: 2,
      rotation_angle: 75,
      rotation_x: 2,
      rotation_y: 2,
    })
    const model = buildHardwareModel({
      keys: [rotated],
      pcb: { ...DEFAULT_PCB_SETTINGS, switchFootprintByWidth: { '1': 'MX_Solder_1u' } },
    })
    const outline = model.board.outline!
    const sw = model.components.find((component) => component.kind === 'switch')!
    const corner = { x: sw.bounds.minX, y: sw.bounds.minY }
    // The AABB corner belongs to the envelope, not necessarily to the rotated
    // body. It must not become a corner of Edge.Cuts solely because of that
    // envelope.
    expect(outline.rings?.[0]?.points.some((point) =>
      Math.abs(point.x - corner.x) < 0.01 && Math.abs(point.y - corner.y) < 0.01,
    )).toBe(false)
    expect(outline.rings?.[0]?.segments.some((segment) =>
      Math.abs(segment.end.x - segment.start.x) > 0.1 &&
      Math.abs(segment.end.y - segment.start.y) > 0.1,
    )).toBe(true)
  })

  it('migrates schema v3 projects with RGB and mounting features disabled', () => {
    const model = buildHardwareModel({ keys: keys() })
    const legacy = { ...model, schemaVersion: 3, board: { marginMm: 4, copperEdgeClearanceMm: 0.5, bounds: model.board.bounds } }
    const input = parseHardwareProject(legacy)
    expect(input.pcb?.rgb.enabled).toBe(false)
    expect(input.pcb?.mountingHoles.enabled).toBe(false)
  })
})
