import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { keyOutlineDrawing } from '../layout-drawings'
import { buildHardwareModel } from '../model'
import { renderFootprint } from '../footprint-renderer'
import { schematicFiles } from '../kicad'
import { FOOTPRINT_SNAPSHOTS } from '@/data/footprints'
import { FOOTPRINTS } from '@/data/hardware-catalog'

const modelFor = (keys: Key[]) => buildHardwareModel({ keys })
describe('layout manufacturing drawings', () => {
  it('draws a wide key around its rotation origin, without applying switch rotation', () => {
    const key = Object.assign(new Key(), {
      x: 1,
      y: 2,
      width: 2,
      rotation_angle: 90,
      rotation_x: 1,
      rotation_y: 2,
      switchRotation: 180,
    })
    const drawing = keyOutlineDrawing(modelFor([key]))
    expect(drawing).toContain('(start 19.05 38.1) (end 19.05 76.2)')
    expect(drawing).toContain('(start 19.05 76.2) (end 0 76.2)')
    expect(drawing.match(/\(gr_line /g)).toHaveLength(4)
    expect(drawing).not.toMatch(/Edge.Cuts|SilkS|F.Cu/)
    key.switchRotation = 0
    expect(keyOutlineDrawing(modelFor([key]))).toBe(drawing)
  })
  it('excludes hardware, decals and ghost keys and honors custom pitch', () => {
    const key = new Key()
    const model = buildHardwareModel({
      keys: [
        key,
        Object.assign(new Key(), { decal: true }),
        Object.assign(new Key(), { ghost: true }),
      ],
      metadata: { spacing_x: 18, spacing_y: 17 },
    })
    expect(keyOutlineDrawing(model)).toContain('(start 0 0) (end 18 0)')
    expect(keyOutlineDrawing(model).match(/\(gr_line /g)).toHaveLength(4)
  })
  it('draws the union outline for an ISO-style key without internal rectangle seams', () => {
    const key = Object.assign(new Key(), {
      width: 1.25,
      height: 2,
      x2: -0.25,
      y2: 0,
      width2: 1.5,
      height2: 1,
    })
    const drawing = keyOutlineDrawing(modelFor([key]))
    expect(drawing.match(/\(gr_line /g)).toHaveLength(6)
    expect(drawing).toContain('-4.7625')
  })
  it('rejects empty matrix lines instead of generating dangling sheet ports', () => {
    const m = modelFor([new Key()])
    const id = Object.keys(m.matrix.assignments)[0]!
    const result = buildHardwareModel({
      keys: m.layout.keys,
      matrixOverrides: { [id]: { row: 2, column: 0 } },
    })
    expect(
      result.validation.some(
        (issue) => issue.code === 'MATRIX_EMPTY_LINE' && issue.severity === 'ERROR',
      ),
    ).toBe(true)
  })
  it('uses actual row/column assignments instead of component list order', () => {
    const keys = Array.from({ length: 6 }, (_, x) => Object.assign(new Key(), { x }))
    const model = modelFor(keys)
    const before = schematicFiles(model).find((e) => e.name.endsWith('/matrix.kicad_sch'))!.text
    model.components.reverse()
    const after = schematicFiles(model).find((e) => e.name.endsWith('/matrix.kicad_sch'))!.text
    // Component order can change serialization order, but not placement.
    const placements = (s: string) =>
      [...s.matchAll(/\(symbol \(lib_id "Keyboard:SW"\) \(at ([^)]+)\)/g)].map((m) => m[1]).sort()
    expect(placements(after)).toEqual(placements(before))
    expect(before).toContain('(junction ')
    expect(before).toContain('(hierarchical_label "COL0"')
  })
})

describe('reviewed package snapshots', () => {
  it('keeps pad geometry shared by placement checks and export, with fixed source hashes', () => {
    for (const [id, snapshot] of Object.entries(FOOTPRINT_SNAPSHOTS)) {
      expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(FOOTPRINTS[id]!.pads).toBe(snapshot.pads)
      expect(renderFootprint(id)).not.toContain('${AMZPATH}')
    }
    // Actuator-centered MX; Seeed's rotated original now has USB facing up.
    expect(FOOTPRINTS.MX!.pads.find((p) => p.number === '1')).toMatchObject({ x: 2.54, y: -5.08 })
    expect(
      FOOTPRINTS.XIAO_RP2040!.pads.find((p) => p.number === '1' && p.type === 'thru_hole'),
    ).toMatchObject({ x: -7.62, y: -7.62, drill: 0.889 })
    expect(FOOTPRINT_SNAPSHOTS.ChocV1!.authority).toContain('Community')
  })
  it('retains multiple physical pads per pin and rejects unregistered packages', () => {
    expect(FOOTPRINTS.XIAO_RP2040!.pads.filter((p) => p.number === '14')).toHaveLength(2)
    expect(() => renderFootprint('unknown')).toThrow('No reviewed footprint')
  })
  it('serializes hidden footprint properties as KiCad hide nodes', () => {
    const rendered = renderFootprint('MX_Solder_1.25u')
    expect(rendered).toContain('(hide yes)')
    expect(rendered).not.toContain('"hide"')
  })
  it('converts legacy angle arcs to KiCad 9 start/mid/end arcs', () => {
    const rendered = renderFootprint('MX_Hotswap_1u')
    expect(rendered).toContain('(fp_arc (start -0.865 -1.23) (mid ')
    expect(rendered).toMatch(
      /\(fp_arc \(start -0\.865 -1\.23\) \(mid [^)]+\) \(end -0\.8 -3\.4\) \(stroke /,
    )
    expect(rendered).not.toContain('(angle ')
  })
})
