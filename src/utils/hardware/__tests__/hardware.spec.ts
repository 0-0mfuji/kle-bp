import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildHardwareModel } from '../model'
import { parseHardwareProject } from '../project'
import { ensureHardwareIds, layoutKeyId, stableJson } from '../identity'
import { solveMatrix, solveResources } from '../solver'
import { buildProjectFiles } from '../exporter'
import { pcbFile } from '../kicad'
import { buildPlate } from '@/utils/plate/plate-builder'
import { filterPlateSideKeys } from '@/utils/plate/plate-builder'
import { getKeyCenterMm } from '@/utils/keyboard-geometry'
import { XIAO_PINS } from '@/data/hardware-catalog'
import { hardwareSizeInUnits } from '@/data/hardware-layout'
import { normalizePcbSettings } from '../pcb-geometry'

export function fixture(count = 6, choc = false, rotated = false) {
  const keys = Array.from({ length: count }, (_, index) =>
    Object.assign(new Key(), {
      x: (index % 5) - 2,
      y: Math.floor(index / 5),
      rotation_angle: rotated ? 15 : 0,
    }),
  )
  keys.push(
    Object.assign(new Key(), {
      x: 5,
      y: -1,
      width: 2,
      height: 2,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-rp2040',
    }),
  )
  return buildHardwareModel({
    keys,
    switch: choc ? 'choc-v1' : 'mx',
    metadata: { spacing_x: choc ? 18 : 19.05, spacing_y: choc ? 17 : 19.05 },
  })
}
function nrfFixture(choc = false, battery = false) {
  const input = parseHardwareProject(fixture(6, choc))
  input.keys.find((k) => k.st === 'hardware:xiao-rp2040')!.st = 'hardware:xiao-nrf52840'
  return buildHardwareModel({ ...input, power: battery ? 'controller-lipo' : 'usb' })
}
function seibokuFixture(nrf = true, battery = false, count = 1) {
  const input = parseHardwareProject(nrf ? nrfFixture(false, battery) : fixture())
  if (count > 1) input.keys = input.keys.filter((k, i) => i === 0 || k.decal)
  for (let index = 0; index < count; index++)
    input.keys.push(
      Object.assign(new Key(), {
        x: 9 + index * 3,
        y: 0,
        width: 30 / 19.05,
        height: 20 / 19.05,
        decal: true,
        profile: 'hardware',
        st: 'hardware:pmw3610',
      }),
    )
  return buildHardwareModel(input)
}
function seibokuHeaderFixture(split = false, misplaced = false) {
  const input = parseHardwareProject(
    split ? splitFixture('wireless') : seibokuFixture(true, false, 1),
  )
  input.pcb = normalizePcbSettings({ ...input.pcb, switchFootprintId: 'MX' })
  input.keys.push(
    Object.assign(new Key(), {
      x: split && misplaced ? 14 : 12,
      y: 0,
      width: 5.3 / 19.05,
      height: 10.4 / 19.05,
      decal: true,
      profile: 'hardware',
      st: 'hardware:seiboku-jumper-header',
    }),
  )
  if (split) {
    input.keys.push(
      Object.assign(new Key(), {
        x: misplaced ? 2 : 14,
        y: 3,
        width: 30 / 19.05,
        height: 20 / 19.05,
        decal: true,
        profile: 'hardware',
        st: 'hardware:pmw3610',
      }),
    )
  }
  return buildHardwareModel(input)
}
function plusFixture(count = 6, battery = false, sensor = false, choc = false, rotated = false) {
  const input = parseHardwareProject(fixture(count, choc, rotated))
  input.keys.find((k) => k.st === 'hardware:xiao-rp2040')!.st = 'hardware:xiao-nrf52840-plus'
  if (sensor)
    input.keys.push(
      Object.assign(new Key(), {
        x: 9,
        y: 0,
        width: 30 / 19.05,
        height: 20 / 19.05,
        decal: true,
        profile: 'hardware',
        st: 'hardware:pmw3610',
      }),
    )
  return buildHardwareModel({ ...input, power: battery ? 'controller-lipo' : 'usb' })
}
export function splitFixture(connection: 'wired-uart' | 'wireless' = 'wired-uart', battery = false) {
  const keys: Key[] = []
  for (const offset of [0, 12]) {
    for (let i=0; i<19; i++) keys.push(Object.assign(new Key(), { x: offset + i%5, y: Math.floor(i/5) }))
    keys.push(Object.assign(new Key(), { x: offset + 6, y: 0, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-nrf52840' }))
    if (connection === 'wired-uart') keys.push(Object.assign(new Key(), { x: offset + 6, y: 4, decal: true, profile: 'hardware', st: 'hardware:split-trrs-jack-pj320a' }))
  }
  return buildHardwareModel({ keys, architecture: 'wired-split', splitConnection: connection,
    splitPowerMode: 'independent', boundaryX: 10, power: battery ? 'controller-lipo' : 'usb' })
}

async function archive(model = fixture()) {
  const settings = {
    cutoutType:
      model.switch === 'mx' ? ('cherry-mx-basic' as const) : ('kailh-choc-cpg1350' as const),
    spacingX: Number(model.layout.metadata.spacing_x),
    spacingY: Number(model.layout.metadata.spacing_y),
  }
  const plate = await buildPlate(model.layout.keys, settings)
  const sides = model.architecture === 'wired-split' && model.boardOutputMode === 'separate-left-right'
    ? Object.fromEntries(await Promise.all((['left', 'right'] as const).map(async (side) => {
        const firstKey = model.layout.keys.find((key) => !key.decal && !key.ghost)!
        const originCenterMm = getKeyCenterMm(firstKey, settings.spacingX, settings.spacingY)
        return [side, await buildPlate(filterPlateSideKeys(model.layout.keys, model.split, side), {
          ...settings,
          originCenterMm,
        })]
      }))) as Partial<Record<'left' | 'right', typeof plate>>
    : undefined
  return buildProjectFiles(model, settings, plate, sides)
}

describe('hardware CAD electrical model', () => {
  it('uses the hardware layout rotation for the exported component', () => {
    const controller = Object.assign(new Key(), {
      x: 5,
      y: 2,
      width: 21 / 19.05,
      height: 17.5 / 19.05,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-rp2040',
      rotation_x: 5 + (21 / 19.05) / 2,
      rotation_y: 2 + (17.5 / 19.05) / 2,
      rotation_angle: 90,
    })
    const model = buildHardwareModel({ keys: [new Key(), controller] })
    expect(model.components.find((component) => component.kind === 'controller')?.position.rotation).toBe(90)
  })

  it('migrates legacy hardware port directions into a real layout rotation', () => {
    const raw = JSON.parse(stableJson(fixture())) as { layout: { keys: Array<Record<string, unknown>> } }
    const controller = raw.layout.keys.find((key) => key.st === 'hardware:xiao-rp2040')!
    controller.hardwarePortDirection = 'right'
    const parsed = parseHardwareProject(raw)
    const migrated = parsed.keys.find((key) => key.st === 'hardware:xiao-rp2040')!
    expect(migrated.rotation_angle).toBe(90)
    expect((migrated as typeof migrated & { hardwarePortDirection?: string }).hardwarePortDirection).toBeUndefined()
  })

  it('adds a review warning for the conditional LP601730 battery profile', () => {
    const model = buildHardwareModel({
      ...parseHardwareProject(nrfFixture()),
      power: 'controller-lipo',
      battery: {
        connector: 'jst-ph-2',
        powerSwitch: 'msk-12c02',
        keepout: { enabled: true, profile: '601730', lengthMm: 31, widthMm: 17.5, thicknessMm: 6.3 },
      },
    })
    expect(model.validation.some((issue) => issue.code === 'BATTERY_LP601730_REVIEW' && issue.severity === 'WARNING')).toBe(true)
  })

  it('models standard XIAO antenna keepout and module power metadata', () => {
    const model = nrfFixture()
    expect(model.validation.some((i) => i.code === 'POWER_BUDGET_REVIEW')).toBe(false)
    expect(pcbFile(model)).toContain('(keepout')
    expect(model.components.find((c) => c.kind === 'controller')?.boardSide).toBeUndefined()
  })
  it('uses only 11 actual XIAO module GPIOs and excludes hardware/ghost keys', () => {
    const model = fixture(30)
    expect(Object.keys(model.matrix.assignments)).toHaveLength(30)
    expect(model.resources.assignments).toHaveLength(11)
    expect(
      model.resources.assignments.every((a) => XIAO_PINS.some((pin) => pin.gpio === a.resource)),
    ).toBe(true)
    expect(model.validation.filter((i) => i.severity === 'ERROR')).toEqual([])
    expect(fixture(31).validation.some((i) => i.code === 'RESOURCE_SHORTAGE')).toBe(true)
    expect(
      buildHardwareModel({ keys: [Object.assign(new Key(), { ghost: true })] }).matrix.rows,
    ).toBe(0)
  })
  it.each([false, true])('builds Nordic pins and battery nets (battery=%s)', (battery) => {
    const model = nrfFixture(false, battery)
    expect(model.validation.filter((i) => i.severity === 'ERROR')).toEqual([])
    expect(model.resources.assignments[0]?.resource).toBe('P0.02')
    const controller = model.components.find((c) => c.kind === 'controller')!
    expect(controller.pins['19']).toBe(battery ? 'VBAT' : null)
    expect(model.nets.find((n) => n.name === 'VBAT')?.nodes.length ?? 0).toBe(battery ? 2 : 0)
    expect(buildHardwareModel(parseHardwareProject(model))).toEqual(model)
    const invalid = buildHardwareModel({
      ...parseHardwareProject(model),
      pinOverrides: { ROW0: 'P0.13' },
    })
    expect(invalid.resources.unassigned).toContain('ROW0')
  })
  it.each([false, true])('connects SEIBOKU using four unique physical pins (nrf=%s)', (nrf) => {
    const model = seibokuFixture(nrf, nrf)
    expect(model.validation.filter((i) => i.severity === 'ERROR')).toEqual([])
    const device = model.components.find((c) => c.kind === 'device')!
    expect(device.pins).toEqual({
      '1': '+3V3',
      '2': 'GND',
      '3': null,
      '4': null,
      '5': 'pmw3610_0_SCLK',
      '6': 'pmw3610_0_SDIO',
      '7': 'pmw3610_0_MOTION',
      '8': 'pmw3610_0_NCS',
    })
    for (const signal of ['SCLK', 'SDIO', 'MOTION', 'NCS']) {
      expect(model.nets.find((n) => n.name === `pmw3610_0_${signal}`)?.nodes).toHaveLength(2)
    }
    expect(buildHardwareModel(parseHardwareProject(model))).toEqual(model)
    expect(model.resources.assignments.filter((a) => a.sourceBlock === 'pmw3610')).toHaveLength(4)
  })
  it('models a real-size SEIBOKU jumper header with MCU signal connections', () => {
    const model = seibokuHeaderFixture()
    const header = model.components.find((component) => component.blockId === 'seiboku-jumper-header')!
    expect(header.sheet).toBe('controller')
    expect(header.footprint).toBe('SEIBOKU_JUMPER_HEADER')
    expect(header.pins).toEqual({
      '1': '+3V3',
      '2': 'GND',
      '3': null,
      '4': null,
      '5': 'pmw3610_1_SCLK',
      '6': 'pmw3610_1_SDIO',
      '7': 'pmw3610_1_MOTION',
      '8': 'pmw3610_1_NCS',
    })
    expect(header.bounds.maxX - header.bounds.minX).toBeCloseTo(5.3, 1)
    expect(header.bounds.maxY - header.bounds.minY).toBeCloseTo(10.4, 1)
    expect(model.resources.assignments.filter((assignment) => assignment.sourceBlock === 'pmw3610')).toHaveLength(8)
    expect(model.validation.some((issue) => issue.code === 'SEIBOKU_HEADER_COUNT_MISMATCH')).toBe(false)
  })
  it('allows a jumper header without a matching sensor', () => {
    const input = parseHardwareProject(fixture())
    input.keys.push(Object.assign(new Key(), {
      x: 10, y: 0, width: 5.3 / 19.05, height: 10.4 / 19.05,
      decal: true, profile: 'hardware', st: 'hardware:seiboku-jumper-header',
    }))
    const model = buildHardwareModel(input)
    const header = model.components.find((component) => component.blockId === 'seiboku-jumper-header')!
    expect(header.pins).toMatchObject({ '1': '+3V3', '2': 'GND', '3': null, '4': null, '5': 'pmw3610_0_SCLK', '6': 'pmw3610_0_SDIO', '7': 'pmw3610_0_MOTION', '8': 'pmw3610_0_NCS' })
    expect(model.validation.some((issue) => issue.code.startsWith('SEIBOKU_HEADER_'))).toBe(false)
  })
  it('allows standalone headers on either split half', () => {
    const model = seibokuHeaderFixture(true, true)
    expect(model.validation.some((issue) => issue.code.startsWith('SEIBOKU_HEADER_'))).toBe(false)
  })
  it('exports a KiCad fixture with a SEIBOKU jumper header when requested', async () => {
    const directory = process.env.SEIBOKU_FIXTURE_DIR
    if (!directory) return
    mkdirSync(directory, { recursive: true })
    const result = await archive(seibokuHeaderFixture())
    writeFileSync(join(directory, 'seiboku-header.zip'), result.archive)
    expect(result.archive.length).toBeGreaterThan(1000)
  })
  it('allocates repeated SEIBOKU instances separately and detects total resource shortage', () => {
    const multiple = seibokuFixture(true, true, 2)
    expect(multiple.validation.filter((i) => i.severity === 'ERROR')).toEqual([])
    expect(multiple.components.filter((c) => c.kind === 'device')).toHaveLength(2)
    expect(multiple.nets.find((n) => n.name === 'pmw3610_1_SDIO')?.nodes).toHaveLength(2)
    const input = parseHardwareProject(seibokuFixture())
    const more = fixture(20).layout.keys.filter((k) => !k.decal)
    input.keys = [...more, ...input.keys.filter((k) => k.decal)]
    ensureHardwareIds(input.keys)
    expect(buildHardwareModel(input).validation.some((i) => i.code === 'RESOURCE_UNASSIGNED')).toBe(
      true,
    )
  })
  it('does not silently substitute legacy PMW3360 circuits', () => {
    const input = parseHardwareProject(seibokuFixture())
    input.keys.find((k) => k.st === 'hardware:pmw3610')!.st = 'hardware:pmw3360'
    input.devices = ['pmw3360']
    expect(
      buildHardwareModel(input).validation.some((i) => i.code === 'UNSUPPORTED_CONFIGURATION'),
    ).toBe(true)
  })
  it.each([false, true])('supports Plus modules (battery=%s)', (battery) => {
    const model = plusFixture(42, battery, true)
    expect(model.validation.map((i) => i.code)).not.toContain('UNSUPPORTED_CONTROLLER')
    expect(model.validation.map((i) => i.code)).not.toContain('UNSUPPORTED_CONFIGURATION')
  })
  it('exposes Plus modules as a supported GPIO target', () => {
    const model = plusFixture()
    expect(model.validation.map((i) => i.code)).not.toContain('UNSUPPORTED_CONTROLLER')
    expect(model.validation.map((i) => i.code)).not.toContain('UNSUPPORTED_CONFIGURATION')
    expect(model.resources.assignments.length).toBeGreaterThan(0)
  })
  it('preserves explicit choices before allocating other pins, rejecting invalid and duplicate assignments', () => {
    const matrix = fixture().matrix
    const solve = (overrides: Record<string, string>) =>
      solveResources('xiao-rp2040', 'mx', [], 'usb', matrix, overrides)
    expect(
      solve({ COL0: 'GPIO26' }).assignments.find((a) => a.requirementId === 'COL0')?.resource,
    ).toBe('GPIO26')
    expect(solve({ ROW0: 'GPIO31' }).conflicts).not.toHaveLength(0)
    expect(solve({ ROW0: 'GPIO26', COL0: 'GPIO26' }).unassigned).toContain('COL0')
    expect(solve({ old: 'GPIO26' }).conflicts).not.toHaveLength(0)
  })
  it('preserves IDs through moves and assigns distinct IDs to copies', () => {
    const keys = fixture().layout.keys
    const ids = keys.map(layoutKeyId)
    keys[0]!.x = 90
    keys.push({ ...keys[0]! })
    ensureHardwareIds(keys)
    expect(keys.slice(0, -1).map(layoutKeyId)).toEqual(ids)
    expect(new Set(keys.map(layoutKeyId)).size).toBe(keys.length)
  })
  it('detects missing/duplicate matrix assignments and stale IDs', () => {
    const keys = fixture().layout.keys
    const auto = solveMatrix(keys, 'unibody')
    const manual = { ...auto.assignments }
    const ids = Object.keys(manual)
    manual[ids[1]!] = manual[ids[0]!]!
    delete manual[ids[2]!]
    const result = solveMatrix(keys, 'unibody', manual)
    expect(result.unassignedKeys).toContain(ids[2])
    expect(result.duplicatePositions).not.toHaveLength(0)
  })
  it('connects every switch and diode with K on ROW, A on switch and unique intermediate nets', () => {
    const model = fixture()
    for (const sw of model.components.filter((c) => c.kind === 'switch')) {
      const d = model.components.find(
        (c) => c.layoutKeyId === sw.layoutKeyId && c.kind === 'diode',
      )!
      expect(sw.pins['1']).toMatch(/^COL/)
      expect(d.pins['1']).toMatch(/^ROW/)
      expect(sw.pins['2']).toBe(d.pins['2'])
      expect(model.nets.find((net) => net.name === sw.pins['2'])!.nodes).toHaveLength(2)
    }
  })
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'encloses complete component bounds with the new tight outline (choc=%s, rotation=%s)',
    (choc, rotated) => {
      const model = fixture(6, choc, rotated),
        b = model.board.bounds!
      expect(model.board.marginMm).toBe(1)
      expect(model.board.outline?.cornerRadiusMm).toBe(1)
      for (const c of model.components) {
        expect(c.bounds.minX).toBeGreaterThanOrEqual(b.minX)
        expect(c.bounds.minY).toBeGreaterThanOrEqual(b.minY)
        expect(c.bounds.maxX).toBeLessThanOrEqual(b.maxX)
        expect(c.bounds.maxY).toBeLessThanOrEqual(b.maxY)
      }
    },
  )
  it('blocks missing/multiple controllers, unsupported architectures and collisions', () => {
    const m = fixture()
    expect(buildHardwareModel({ keys: [] }).validation.map((i) => i.code)).toContain('EMPTY_LAYOUT')
    expect(
      buildHardwareModel({ keys: m.layout.keys.slice(0, -1) }).validation.map((i) => i.code),
    ).toContain('CONTROLLER_COUNT')
    expect(
      buildHardwareModel({ keys: m.layout.keys, power: 'controller-lipo' }).validation.map(
        (i) => i.code,
      ),
    ).toContain('LIPO_CONTROLLER')
    expect(
      buildHardwareModel({ keys: m.layout.keys, architecture: 'wired-split' }).validation.map(
        (i) => i.code,
      ),
    ).toContain('UNSUPPORTED_CONFIGURATION')
    const keys = [...m.layout.keys, { ...m.layout.keys[0]! }]
    expect(buildHardwareModel({ keys }).validation.map((i) => i.code)).toContain(
      'COMPONENT_OVERLAP',
    )
  })
  it('creates safe UART-only split nets and separate outputs for two standard XIAO modules', async () => {
    const input = parseHardwareProject(fixture(6))
    const controller = input.keys.find((key) => key.st === 'hardware:xiao-rp2040')!
    controller.st = 'hardware:xiao-nrf52840'
    input.keys.push(
      Object.assign(new Key(), { x: -8, y: 0, decal: true, profile: 'hardware', st: 'hardware:xiao-nrf52840' }),
      Object.assign(new Key(), { x: -6, y: 0, decal: true, profile: 'hardware', st: 'hardware:split-trrs-jack-pj320a' }),
      Object.assign(new Key(), { x: 8, y: 0, decal: true, profile: 'hardware', st: 'hardware:split-trrs-jack-pj320a' }),
    )
    const model = buildHardwareModel({ ...input, architecture: 'wired-split', splitConnection: 'wired-uart', splitPowerMode: 'independent', power: 'usb' })
    expect(model.validation.filter((i) => i.severity === 'ERROR')).toEqual([])
    expect(model.components.filter((c) => c.kind === 'controller')).toHaveLength(2)
    expect(model.nets.find((net) => net.name === 'UART_TIP_LEFT')?.nodes.length).toBe(2)
    expect(model.nets.find((net) => net.name === 'UART_RING1_RIGHT')?.nodes.length).toBe(2)
    expect(model.components.filter((c) => c.blockId === 'split-trrs-jack-pj320a').every((c) => c.pins['1'] === `GND_${c.boardSide?.toUpperCase()}` && c.pins['2'] === null)).toBe(true)
    const archiveResult = await archive(model)
    expect(archiveResult.entries.some((entry) => entry.name === 'keyboard/left/keyboard.kicad_pcb')).toBe(true)
    expect(archiveResult.entries.some((entry) => entry.name === 'keyboard/right/keyboard.kicad_pcb')).toBe(true)
    expect(archiveResult.entries.some((entry) => entry.name === 'plate/left/keyboard-plate.svg')).toBe(true)
    expect(archiveResult.entries.some((entry) => entry.name === 'plate/right/keyboard-plate.svg')).toBe(true)
  })
  it('rejects wired split LiPo because TRRS and battery are not combined', () => {
    const input = parseHardwareProject(fixture(6))
    input.keys.find((key) => key.st === 'hardware:xiao-rp2040')!.st = 'hardware:xiao-nrf52840'
    const model = buildHardwareModel({ ...input, architecture: 'wired-split', splitConnection: 'wired-uart', power: 'controller-lipo' })
    expect(model.validation.map((i) => i.code)).toContain('WIRED_LIPO_CONFLICT')
  })
})

describe('review regression gates', () => {
  it('solves 38 keys independently and crosses UART through the same cable contacts', () => {
    const m=splitFixture()
    expect(m.validation.filter(i=>i.severity==='ERROR')).toEqual([])
    const left=m.components.find(c=>c.kind==='controller' && c.boardSide==='left')!
    const right=m.components.find(c=>c.kind==='controller' && c.boardSide==='right')!
    expect([left.pins['7'], right.pins['8']]).toEqual(['UART_TIP_LEFT','UART_TIP_RIGHT'])
    expect([left.pins['8'], right.pins['7']]).toEqual(['UART_RING1_LEFT','UART_RING1_RIGHT'])
    for (const net of m.nets) expect(new Set(net.nodes.map(n=>m.components.find(c=>c.id===n.componentId)!.boardSide)).size).toBe(1)
  })
  it.each(['P1.11','P1.12'])('rejects manually overriding reserved UART pin %s', pin => {
    const m=buildHardwareModel({...parseHardwareProject(splitFixture()),pinOverrides:{ROW0:pin}})
    expect(m.validation.map(i=>i.code)).toContain('RESOURCE_CONFLICT')
  })
  it('rejects two jacks on the same side and a missing controller', () => {
    const input=parseHardwareProject(splitFixture())
    input.keys.find(k=>k.st.includes('trrs') && k.x<10)!.x=22
    expect(buildHardwareModel(input).validation.map(i=>i.code)).toContain('TRRS_SIDE_MISSING')
    input.keys=input.keys.filter(k=>!(k.st==='hardware:xiao-nrf52840' && k.x<10))
    expect(buildHardwareModel(input).validation.map(i=>i.code)).toContain('CONTROLLER_SIDE_MISSING')
  })
  it('supports independent wireless LiPo and rejects inconsistent power metadata', () => {
    const m=splitFixture('wireless',true)
    expect(m.validation.filter(i=>i.severity==='ERROR')).toEqual([])
    expect(m.validation.map(i=>i.code)).toContain('WIRELESS_SPLIT_REVIEW')
    expect(m.nets.filter(n=>n.name.startsWith('VBAT')).map(n=>n.name)).toEqual(['VBAT_LEFT','VBAT_RIGHT'])
    const invalid=buildHardwareModel({...parseHardwareProject(m),powerBySide:{left:'usb',right:'controller-lipo'}})
    expect(invalid.validation.map(i=>i.code)).toContain('SPLIT_POWER_MISMATCH')
  })
  it('models visible wireless LiPo connectors, switches and optional keepouts per side', async () => {
    const input = parseHardwareProject(splitFixture('wireless', true))
    for (const [, x] of [['left', 0], ['right', 16]] as const) {
      for (const [partIndex, id] of ['battery-connector-jst-ph-2', 'power-switch-msk-12c02', 'battery-keepout-401230'].entries()) {
        const size = hardwareSizeInUnits(id)
        input.keys.push(Object.assign(new Key(), { x: x + partIndex * 2, y: -4 - partIndex * 2, width: size.width, height: size.height, width2: size.width, height2: size.height, decal: true, profile: 'hardware', st: `hardware:${id}`, hardwareFace: id.startsWith('battery-keepout') ? 'bottom' : 'top' }))
      }
    }
    input.battery = { connector: 'jst-ph-2', powerSwitch: 'msk-12c02', keepout: { enabled: true, profile: '401230', lengthMm: 30, widthMm: 12, thicknessMm: 4 } }
    const model = buildHardwareModel({ ...input, architecture: 'wired-split', splitConnection: 'wireless', power: 'controller-lipo' })
    expect(model.validation.filter((issue) => issue.severity === 'ERROR').map((issue) => issue.code)).not.toContain('BATTERY_CONNECTOR_MISSING')
    expect(model.components.filter((component) => component.blockId === 'battery-connector-jst-ph-2')).toHaveLength(2)
    expect(model.components.filter((component) => component.blockId === 'power-switch-msk-12c02')).toHaveLength(2)
    expect(model.physicalKeepouts).toHaveLength(2)
    expect(model.components.some((component) => component.blockId.startsWith('battery-keepout'))).toBe(false)
    expect(model.nets.map((net) => net.name)).toEqual(expect.arrayContaining(['BAT_RAW_LEFT', 'BAT_RAW_RIGHT', 'VBAT_LEFT', 'VBAT_RIGHT']))
    const archiveResult = await archive(model)
    const schematic = archiveResult.entries.find((entry) => entry.name === 'keyboard/left/power.kicad_sch')?.text ?? ''
    expect(schematic).toContain('SW_SPDT')
    expect(schematic).toContain('PowerSwitch_MSK12C02')
  })
  it('rejects nested pollution keys and excessive nesting without modifying prototypes', () => {
    const m=fixture()
    m.layout.metadata.background=JSON.parse('{"name":"x","style":"x","extra":{"__proto__":{"polluted":true}}}')
    expect(()=>parseHardwareProject(m)).toThrow('Invalid project property')
    expect(Object.prototype).not.toHaveProperty('polluted')
    let nested: unknown={}
    for(let i=0;i<50;i++) nested={nested}
    m.layout.metadata.background=nested
    expect(()=>parseHardwareProject(m)).toThrow('deeply nested')
  })
  it('validates 1000 separated keys without quadratic polygon construction', () => {
    const start=performance.now()
    const m=fixture(1000)
    expect(m.validation.map(i=>i.code)).toContain('RESOURCE_SHORTAGE')
    expect(performance.now()-start).toBeLessThan(2000)
  })
})

describe('project persistence and export', () => {
  it('restores layout, pin choices and model without changing any byte', () => {
    const m = fixture()
    const changed = buildHardwareModel({
      ...parseHardwareProject(m),
      pinOverrides: { COL0: 'GPIO3' },
    })
    expect(
      stableJson(buildHardwareModel(parseHardwareProject(JSON.parse(stableJson(changed))))),
    ).toBe(stableJson(changed))
  })
  it('migrates only the legacy controller; devices require explicit placement', () => {
    const m = fixture()
    const old = {
      ...m,
      schemaVersion: 1,
      layout: { ...m.layout, keys: m.layout.keys.slice(0, -1) },
      devices: ['ec11', 'split-trrs-jack-pj320a'],
    }
    const input = parseHardwareProject(old)
    expect(buildHardwareModel(input).blocks.map((b) => b.blockId)).toEqual(['xiao-rp2040'])
  })
  it('rejects malformed projects before editor state can change', () => {
    expect(() => parseHardwareProject({ schemaVersion: 8 })).toThrow()
    const m = fixture()
    expect(() => parseHardwareProject({ ...m, power: 'anything' })).toThrow()
    expect(() => parseHardwareProject({ ...m, diodeDirection: 'ROW2COL' })).toThrow()
    m.layout.keys[0]!.x = Number.NaN
    expect(() => parseHardwareProject(m)).toThrow()
  })
  it('exports identical sorted archives with plate and self-contained libraries', async () => {
    const a = await archive(),
      b = await archive()
    expect(a.archive).toEqual(b.archive)
    expect(a.entries.map((e) => e.name)).toEqual([...a.entries.map((e) => e.name)].sort())
    for (const path of [
      'keyboard/controller.kicad_sch',
      'keyboard/matrix.kicad_sch',
      'keyboard/power.kicad_sch',
      'keyboard/sym-lib-table',
      'keyboard/fp-lib-table',
      'plate/keyboard-plate.svg',
      'plate/keyboard-plate.dxf',
    ])
      expect(a.entries.some((e) => e.name === path)).toBe(true)
    // UUIDs are unique within each sheet; sheet IDs are intentionally referenced by parents.
    for (const entry of a.entries.filter((e) => e.name.endsWith('.kicad_sch'))) {
      const ids = [...entry.text.matchAll(/\(uuid "([^"]+)"\)/g)].map((m) => m[1])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('fails closed on unsupported or stale data even when invoked without the UI', async () => {
    const m = fixture()
    m.components[0]!.pins['1'] = 'WRONG'
    await expect(archive(m)).rejects.toThrow('stale')
    await expect(
      archive(buildHardwareModel({ ...parseHardwareProject(fixture()), power: 'controller-lipo' })),
    ).rejects.toThrow('LiPo')
  })
  it('writes real generated ZIPs for the KiCad integration checker when requested', async () => {
    const directory = process.env.HARDWARE_FIXTURE_DIR
    if (!directory) return
    mkdirSync(directory, { recursive: true })
    for (const [name, model] of [
      ['split-uart', splitFixture()],
      ['split-wireless-lipo', splitFixture('wireless', true)],
      ['seiboku-rp-usb', seibokuFixture(false)],
      ['seiboku-nrf-lipo', seibokuFixture(true, true)],
      ['seiboku-dual', seibokuFixture(true, true, 2)],
      ['nrf-usb', nrfFixture()],
      ['nrf-lipo', nrfFixture(false, true)],
      ['nrf-choc-lipo', nrfFixture(true, true)],
      ['mx', fixture(6)],
      ['choc', fixture(6, true)],
      ['rotated', fixture(6, false, true)],
      ['choc-rotated', fixture(6, true, true)],
      ['max30', fixture(30)],
      ...(['tall', 'wide'] as const).map((name) => {
        const m = fixture(10)
        return [
          name,
          buildHardwareModel({
            ...parseHardwareProject(m),
            matrixOverrides: Object.fromEntries(
              Object.keys(m.matrix.assignments).map((id, index) => [
                id,
                { row: name === 'tall' ? index : 0, column: name === 'wide' ? index : 0 },
              ]),
            ),
          }),
        ] as const
      }),
    ] as const) {
      const result = await archive(model)
      expect(result.archive.length).toBeGreaterThan(1000)
      writeFileSync(join(directory, `${name}.zip`), result.archive)
    }
  }, 60000)
})
