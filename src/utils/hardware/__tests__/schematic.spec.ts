import { describe, expect, it } from 'vitest'
import { Key } from '@adamws/kle-serial'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildHardwareModel } from '../model'
import { schematicFiles, symbolLibrary, pcbFile, footprintLibrary } from '../kicad'
import { DEFAULT_PCB_SETTINGS } from '../pcb-geometry'
import { buildProjectFiles } from '../exporter'
import { buildPlate } from '@/utils/plate/plate-builder'
import { symbols } from '@/data/hardware-symbols'

function rgbModel(ledFootprintId = 'auto') {
  const keys: Key[] = []
  for (const offset of [0, 18]) {
    for (let i = 0; i < 12; i++)
      keys.push(Object.assign(new Key(), { x: offset + (i % 4), y: Math.floor(i / 4) }))
    keys.push(
      Object.assign(new Key(), {
        x: offset + 6,
        y: 0,
        width: 2,
        height: 2,
        decal: true,
        profile: 'hardware',
        st: 'hardware:xiao-nrf52840-plus',
      }),
    )
  }
  return buildHardwareModel({
    keys,
    architecture: 'wired-split',
    splitConnection: 'wireless',
    boundaryX: 14,
    power: 'controller-lipo',
    splitPowerMode: 'independent',
    pcb: {
      ...DEFAULT_PCB_SETTINGS,
      ledFootprintId,
      rgb: { ...DEFAULT_PCB_SETTINGS.rgb, enabled: true, placementMode: 'manual' },
    },
  })
}

describe('readable complete schematics', () => {
  it('renders the SEIBOKU jumper header on the controller sheet with pin numbers and NC flags', () => {
    const keys = [
      Object.assign(new Key(), { x: 0, y: 0 }),
      Object.assign(new Key(), { x: 5, y: -1, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-nrf52840' }),
      Object.assign(new Key(), { x: 9, y: 0, width: 30 / 19.05, height: 20 / 19.05, decal: true, profile: 'hardware', st: 'hardware:pmw3610' }),
      Object.assign(new Key(), { x: 12, y: 0, width: 5.3 / 19.05, height: 10.4 / 19.05, decal: true, profile: 'hardware', st: 'hardware:seiboku-jumper-header' }),
    ]
    const model = buildHardwareModel({ keys })
    const controller = schematicFiles(model).find((file) => file.name.endsWith('/controller.kicad_sch'))!.text
    expect(controller).toContain('SEIBOKU_JUMPER_HEADER')
    expect(controller).toContain('SEIBOKU / jumper wires')
    expect(controller).toContain('pmw3610_0_SCLK')
    expect(controller).toContain('pmw3610_0_SDIO')
    expect(controller).toContain('pmw3610_0_MOTION')
    expect(controller).toContain('pmw3610_0_NCS')
    expect((controller.match(/\(no_connect \(at /g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
  it('exports a standalone SEIBOKU jumper header without requiring a PMW3610 item', () => {
    const keys = [
      Object.assign(new Key(), { x: 0, y: 0 }),
      Object.assign(new Key(), { x: 5, y: -1, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-nrf52840' }),
      Object.assign(new Key(), { x: 12, y: 0, width: 5.3 / 19.05, height: 10.4 / 19.05, decal: true, profile: 'hardware', st: 'hardware:seiboku-jumper-header' }),
    ]
    const model = buildHardwareModel({ keys })
    const controller = schematicFiles(model).find((file) => file.name.endsWith('/controller.kicad_sch'))!.text
    expect(controller).toContain('SEIBOKU_JUMPER_HEADER')
    expect(controller).toContain('SEIBOKU / jumper wires')
    expect((controller.match(/\(no_connect \(at /g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(controller).toContain('pmw3610_0_SCLK')
    expect(controller).toContain('pmw3610_0_SDIO')
    expect(controller).toContain('pmw3610_0_MOTION')
    expect(controller).toContain('pmw3610_0_NCS')
    expect(model.validation.some((issue) => issue.code.startsWith('SEIBOKU_HEADER_'))).toBe(false)
  })
  it.each(['auto', 'LED_SK6812MINI-E_BL'])(
    'exports every component exactly once, including RGB (%s)',
    (selection) => {
      const model = rgbModel(selection)
      for (const side of [undefined, 'left', 'right'] as const) {
        const files = schematicFiles(model, side)
        const placed = files
          .flatMap((file) =>
            [
              ...file.text.matchAll(
                /\(symbol \(lib_id "Keyboard:[^"]+"\)[\s\S]*?\(property "Reference" "([^"]+)"/g,
              ),
            ].map((match) => match[1]!),
          )
          .filter((ref) => !ref.startsWith('#'))
        const expected = model.components
          .filter((c) => !side || c.boardSide === side)
          .map((c) => c.reference)
        expect(placed.sort()).toEqual(expected.sort())
        expect(new Set(placed).size).toBe(placed.length)
        expect(files.some((f) => f.name === 'keyboard/rgb.kicad_sch')).toBe(true)
        expect(schematicFiles(model, side)).toEqual(files)
      }
      for (const led of model.components.filter((c) => c.kind === 'led')) {
        const pins = symbols.find((s) => s.name === led.symbol)!.pins
        for (const [name, pattern] of [
          ['DIN', /^RGB_(DATA_SHIFTED|LED_)/],
          ['VDD', /^RGB_5V/],
          ['GND', /^GND/],
        ] as const) {
          expect(led.pins[pins.find((p) => p.name === name)!.number]).toMatch(pattern)
        }
      }
    },
  )
  it('uses TPS61023 datasheet pin numbers and decouples each level shifter', () => {
    const model = rgbModel()
    for (const boost of model.components.filter((c) => c.symbol === 'TPS61023')) {
      expect(boost.pins).toEqual({
        '1': `RGB_FB_${boost.boardSide!.toUpperCase()}`,
        '2': `RGB_EN_${boost.boardSide!.toUpperCase()}`,
        '3': `VBAT_${boost.boardSide!.toUpperCase()}`,
        '4': `GND_${boost.boardSide!.toUpperCase()}`,
        '5': `RGB_SW_${boost.boardSide!.toUpperCase()}`,
        '6': `RGB_5V_${boost.boardSide!.toUpperCase()}`,
      })
    }
    expect(model.components.filter((c) => c.id.endsWith('/rgb-ls-decoupling'))).toHaveLength(2)
    const definition = symbols.find((s) => s.name === 'TPS61023')!
    expect(Object.fromEntries(definition.pins.map((p) => [p.number, p.name]))).toEqual({
      '1': 'FB',
      '2': 'EN',
      '3': 'VIN',
      '4': 'GND',
      '5': 'SW',
      '6': 'VOUT',
    })
  })
  it('writes renderer fixtures when requested', async () => {
    const directory = process.env.SCHEMATIC_FIXTURE_DIR
    expect(rgbModel().validation.filter((issue) => issue.severity === 'ERROR')).toEqual([])
    if (!directory) return
    for (const selection of ['auto', 'LED_SK6812MINI-E_BL']) {
      const model = rgbModel(selection)
      const settings = { cutoutType: 'cherry-mx-basic' as const, spacingX: 19.05, spacingY: 19.05 }
      const plate = await buildPlate(model.layout.keys, settings)
      const exported = buildProjectFiles(model, settings, plate)
      for (const side of [undefined, 'left', 'right'] as const) {
        const dir = join(directory, `${selection}-${side ?? 'combined'}`)
        mkdirSync(join(dir, 'keyboard'), { recursive: true })
        const files = schematicFiles(model, side)
        expect(files).toHaveLength(5)
        for (const file of files) writeFileSync(join(dir, file.name), file.text)
        writeFileSync(
          join(dir, 'keyboard/keyboard.kicad_pro'),
          exported.entries.find((file) => file.name === 'keyboard/keyboard.kicad_pro')!.text,
        )
        mkdirSync(join(dir, 'keyboard/Keyboard.pretty'), { recursive: true })
        for (const id of new Set(model.components.map((c) => c.footprint)))
          writeFileSync(join(dir, `keyboard/Keyboard.pretty/${id}.kicad_mod`), footprintLibrary(id))
        writeFileSync(
          join(dir, 'keyboard/fp-lib-table'),
          '(fp_lib_table (lib (name "Keyboard") (type "KiCad") (uri "${KIPRJMOD}/Keyboard.pretty") (options "") (descr "")))',
        )
        writeFileSync(join(dir, 'keyboard/Keyboard.kicad_sym'), symbolLibrary())
        writeFileSync(
          join(dir, 'keyboard/sym-lib-table'),
          '(sym_lib_table (lib (name "Keyboard") (type "KiCad") (uri "${KIPRJMOD}/Keyboard.kicad_sym") (options "") (descr "")))',
        )
        writeFileSync(join(dir, 'keyboard/keyboard.kicad_pcb'), pcbFile(model, side))
        writeFileSync(
          join(dir, 'model.json'),
          JSON.stringify({
            ...model,
            components: model.components.filter((c) => !side || c.boardSide === side),
          }),
        )
      }
    }
  })
})
