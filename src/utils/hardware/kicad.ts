import { symbols, type SymbolDefinition } from '@/data/hardware-symbols'
import type {
  BoardHole,
  BoardOutline,
  HardwareComponent,
  KeyboardHardwareModel,
} from '@/types/hardware'
import { compareIds, layoutKeyId, uuid } from './identity'
import { round } from './model'
import { rotate } from './geometry'
import { renderFootprint } from './footprint-renderer'
import { keyOutlineDrawing } from './layout-drawings'
import { CONTROLLER_RECIPES } from '@/data/hardware-recipes'

const q = (value: string) => JSON.stringify(value)
const n = (value: number) => String(round(value))
const uid = (id: string) => `(uuid ${q(uuid(id))})`
const font = (size = 1.27, hidden = false) =>
  `(effects (font (size ${size} ${size}))${hidden ? ' hide' : ''})`
const stroke = '(stroke (width 0) (type default))'
const sheetId = (sheet: string) => uuid(`sheet/${sheet}`)
const rootId = sheetId('root')
const instancePath = (sheet: string) => `/${rootId}/${sheetId(sheet)}`
export const componentUuid = (component: HardwareComponent) => uuid(`component/${component.id}`)

function symbolText(def: SymbolDefinition, library = false): string {
  const name = library ? def.name : `Keyboard:${def.name}`
  return `(symbol ${q(name)} ${def.power ? '(power)' : ''} ${['SW', 'D', 'C', 'R', 'L'].includes(def.name) ? '(pin_numbers hide)' : ''} (pin_names (offset 0.508)${def.power || ['SW', 'D', 'C', 'R', 'L'].includes(def.name) ? ' hide' : ''}) (in_bom ${def.power ? 'no' : 'yes'}) (on_board ${def.power ? 'no' : 'yes'})
    (property "Reference" ${q(def.reference)} (at 0 5.08 0) ${font(1.27, !!def.power)})
    (property "Value" ${q(def.name)} (at 0 2.54 0) ${font()})
    (symbol ${q(`${def.name}_0_1`)} ${def.graphics})
    (symbol ${q(`${def.name}_1_1`)} ${def.pins.map((pin) => `(pin ${pin.type} line (at ${pin.x} ${pin.y} ${pin.angle}) (length ${def.power ? 0 : 2.54}) (name ${q(pin.name)} ${font()}) (number ${q(pin.number)} ${font()}))`).join('\n')})
  )`
}
export function symbolLibrary(): string {
  return `(kicad_symbol_lib (version 20241209) (generator "keyboard_hardware_cad") ${symbols.map((def) => symbolText(def, true)).join('\n')})\n`
}
function placedSymbol(
  defName: string,
  id: string,
  ref: string,
  value: string,
  footprint: string,
  x: number,
  y: number,
  sheet: string,
  angle = 0,
) {
  const def = symbols.find((s) => s.name === defName)!
  const referenceY = y + (def.referenceOffsetY ?? -5.08)
  const vertical = angle === 90 || angle === 270
  const labelX = vertical ? x + 5.08 : x + (def.referenceOffsetX ?? 0)
  const labelY = angle === 90 || angle === 270 ? y - 1.27 : referenceY
  return `(symbol (lib_id ${q(`Keyboard:${defName}`)}) (at ${n(x)} ${n(y)} ${angle}) (unit 1) (in_bom ${def.power ? 'no' : 'yes'}) (on_board ${def.power ? 'no' : 'yes'}) (dnp no) ${uid(id)}
    (property "Reference" ${q(ref)} (at ${n(labelX)} ${n(labelY)} ${vertical ? 90 : 0}) ${font(1.27, !!def.power).replace(/\)$/, vertical ? ' (justify left))' : def.referenceOffsetX ? ' (justify right))' : ')')})
    (property "Value" ${q(value)} (at ${n(labelX)} ${n(labelY + 2.54)} ${vertical ? 90 : 0}) ${font(1.27, !!def.hideValue).replace(/\)$/, vertical ? ' (justify left))' : def.referenceOffsetX ? ' (justify right))' : ')')})
    (property "Footprint" ${q(footprint)} (at ${n(x)} ${n(y)} 0) ${font(1.27, true)})
    ${def.pins.map((pin) => `(pin ${q(pin.number)} ${uid(`${id}/pin/${pin.number}`)})`).join('\n')}
    (instances (project "keyboard" (path ${q(instancePath(sheet))} (reference ${q(ref)}) (unit 1)))))`
}
const wire = (id: string, x1: number, y1: number, x2: number, y2: number) =>
  `(wire (pts (xy ${n(x1)} ${n(y1)}) (xy ${n(x2)} ${n(y2)})) ${stroke} ${uid(id)})`
const label = (id: string, name: string, x: number, y: number, hierarchical = false, angle = 0) =>
  `(${hierarchical ? 'hierarchical_label' : 'label'} ${q(name)} ${hierarchical ? '(shape bidirectional)' : ''} (at ${n(x)} ${n(y)} ${angle}) (effects (font (size 1.27 1.27)) (justify ${angle === 180 ? 'right' : 'left'} bottom)) ${uid(id)})`
// Leave enough wire before a symbol for the full hierarchical-label text.
const labelWireLength = (name: string) =>
  Math.max(12.7, Math.ceil((name.length * 1.27 + 5.08) / 2.54) * 2.54)
const text = (id: string, value: string, x: number, y: number) =>
  `(text ${q(value)} (at ${n(x)} ${n(y)} 0) (effects (font (size 1.27 1.27)) (justify left)) ${uid(id)})`
function document(
  sheet: string,
  content: string,
  definitions: string[] = [],
  page = '(paper "A3")',
) {
  const title = {
    root: 'Keyboard Hardware CAD',
    controller: 'Controller',
    matrix: 'Key Matrix - COL2ROW',
    devices: 'Peripheral devices',
    rgb: 'Addressable RGB LED chains',
    power: 'Power - USB / selected battery',
  }[sheet]
  return `(kicad_sch (version 20250114) (generator "keyboard_hardware_cad") (uuid ${q(sheetId(sheet))}) ${page}
    (title_block (title ${q(title ?? sheet)}) (rev "2") (comment 1 "Initial placement - hardware not tested"))
    (lib_symbols ${symbols
      .filter((s) => definitions.includes(s.name))
      .map((s) => symbolText(s))
      .join('\n')})
    ${content}
    ${sheet === 'root' ? '(sheet_instances (path "/" (page "1")))' : ''})\n`
}
/** Geometry-only drawing helper: all connections and net names come from the model. */
class CircuitDrawing {
  content = ''
  private placements = new Map<
    string,
    { c: HardwareComponent; x: number; y: number; angle: number }
  >()
  private connected = new Set<string>()
  private endpoints = new Map<string, { point: [number, number]; count: number }>()
  private serial = 0
  private namedNets = new Set<string>()
  constructor(
    private sheet: string,
    private ports: string[],
  ) {}
  place(c: HardwareComponent, x: number, y: number, angle = 0) {
    this.placements.set(c.id, { c, x, y, angle })
    this.content += placedSymbol(
      c.symbol,
      `component/${c.id}`,
      c.reference,
      c.value,
      `Keyboard:${c.footprint}`,
      x,
      y,
      this.sheet,
      angle,
    )
  }
  pin(c: HardwareComponent, number: string): [number, number] {
    const placement = this.placements.get(c.id)!
    const pin = symbols.find((s) => s.name === c.symbol)!.pins.find((p) => p.number === number)!
    const radians = (placement.angle * Math.PI) / 180
    return [
      round(placement.x + pin.x * Math.cos(radians) - pin.y * Math.sin(radians)),
      round(placement.y - pin.x * Math.sin(radians) - pin.y * Math.cos(radians)),
    ]
  }
  path(net: string, points: [number, number][]) {
    points = points.map(([x, y]) => [round(x), round(y)])
    const id = `${this.sheet}/route/${this.serial++}`
    points.slice(1).forEach((point, i) => {
      const previous = points[i]!
      if (previous[0] === point[0] && previous[1] === point[1]) return
      if (previous[0] !== point[0] && previous[1] !== point[1])
        throw new Error('Schematic routes must be orthogonal')
      this.content += wire(`${id}/${i}`, ...previous, ...point)
      for (const end of [previous, point]) {
        const key = end.join(',')
        const entry = this.endpoints.get(key) ?? { point: end, count: 0 }
        entry.count++
        this.endpoints.set(key, entry)
      }
    })
    if (!this.namedNets.has(net)) {
      const horizontals = points
        .slice(1)
        .map((point, i) => ({ a: points[i]!, b: point }))
        .filter(({ a, b }) => a[1] === b[1] && Math.abs(a[0] - b[0]) > 5.08)
        .sort((a, b) => Math.abs(b.a[0] - b.b[0]) - Math.abs(a.a[0] - a.b[0]))
      const segment = horizontals[0]
      const start: [number, number] = segment
        ? [Math.min(segment.a[0], segment.b[0]) + 2.54, segment.a[1]]
        : points[0]!
      this.content += label(`${id}/net`, net, ...start, this.ports.includes(net))
      this.namedNets.add(net)
    }
  }
  join(
    a: HardwareComponent,
    ap: string,
    b: HardwareComponent,
    bp: string,
    bends: [number, number][] = [],
  ) {
    const net = a.pins[ap]
    if (!net || net !== b.pins[bp])
      throw new Error(`Circuit template net mismatch: ${a.reference}.${ap} / ${b.reference}.${bp}`)
    this.path(net, [this.pin(a, ap), ...bends, this.pin(b, bp)])
    this.connected.add(`${a.id}/${ap}`)
    this.connected.add(`${b.id}/${bp}`)
  }
  finish() {
    // Explicit dots distinguish real branches from crossing wires.
    const pins = new Set(
      [...this.placements.values()].flatMap(({ c }) =>
        symbols
          .find((s) => s.name === c.symbol)!
          .pins.map((pin) => this.pin(c, pin.number).join(',')),
      ),
    )
    for (const [key, { point, count }] of this.endpoints) {
      if (count + (pins.has(key) ? 1 : 0) >= 3)
        this.content += `(junction (at ${n(point[0])} ${n(point[1])}) (diameter 0) (color 0 0 0 0) ${uid(`${this.sheet}/junction/${key}`)})`
    }
    for (const { c, angle } of this.placements.values()) {
      for (const pin of symbols.find((s) => s.name === c.symbol)!.pins) {
        if (this.connected.has(`${c.id}/${pin.number}`)) continue
        const [x, y] = this.pin(c, pin.number)
        const id = `${c.id}/${pin.number}`
        const net = c.pins[pin.number]
        if (!net) {
          this.content += `(no_connect (at ${n(x)} ${n(y)}) ${uid(`${id}/nc`)})`
          continue
        }
        const direction = (pin.angle + angle) % 360
        // Pin direction points into the body; wires extend away from it.
        const length = direction === 0 || direction === 180 ? 7.62 : 5.08
        const dx = direction === 0 ? -length : direction === 180 ? length : 0
        const dy = direction === 90 ? length : direction === 270 ? -length : 0
        this.content += wire(`${id}/wire`, x, y, x + dx, y + dy)
        this.content += label(
          `${id}/net`,
          net,
          x + dx,
          y + dy,
          this.ports.includes(net),
          direction === 0 ? 180 : 0,
        )
      }
    }
    return this.content
  }
}

function powerCircuit(model: KeyboardHardwareModel, ports: string[], top: number) {
  const drawing = new CircuitDrawing('power', ports)
  const groups = [
    ...new Set(model.components.filter((c) => c.kind === 'controller').map((c) => c.boardSide)),
  ]
  let nextY = top
  groups.forEach((side) => {
    const y = nextY
    const parts = model.components.filter((c) => c.sheet === 'power' && c.boardSide === side)
    if (!parts.length) return
    nextY += parts.some((c) => c.symbol === 'TPS61023') ? 218.44 : 66.04
    const find = (suffix: string) => parts.find((c) => c.id.endsWith(suffix))
    drawing.content += text(
      `power/${side}/heading`,
      `${side ? side.toUpperCase() + ' / ' : ''}BATTERY INPUT AND POWER SWITCH`,
      25.4,
      y,
    )
    const battery = parts.find((c) => c.symbol === 'BatteryHeader')
    const sw = parts.find((c) => c.symbol === 'SW_SPDT')
    if (battery) drawing.place(battery, 63.5, y + 20.32, 180)
    if (sw) drawing.place(sw, 121.92, y + 22.86)
    if (battery && sw && battery.pins['1'] === sw.pins['1']) drawing.join(battery, '1', sw, '1')
    drawing.content += text(
      `power/${side}/battery-note`,
      'Protected 1S LiPo; verify connector polarity. Switch OFF disconnects BAT+ from module/boost.',
      25.4,
      y + 43.18,
    )
    const boost = find('/rgb-boost')
    if (!boost) return
    drawing.content += text(
      `power/${side}/boost-heading`,
      '5 V RGB SUPPLY / TPS61023 (EN low = OFF)',
      25.4,
      y + 58.42,
    )
    const l = find('/rgb-inductor')!,
      cin = find('/rgb-cin')!,
      topR = find('/rgb-rfb-top')!,
      botR = find('/rgb-rfb-bot')!
    drawing.place(boost, 132.08, y + 99.06)
    drawing.place(l, 106.68, y + 76.2)
    drawing.place(cin, 63.5, y + 101.6, 270)
    drawing.place(topR, 208.28, y + 101.6, 270)
    drawing.place(botR, 208.28, y + 124.46, 270)
    drawing.join(l, '2', boost, '5', [[121.92, y + 76.2]])
    drawing.join(l, '1', cin, '1', [[63.5, y + 76.2]])
    drawing.join(cin, '1', boost, '3', [[63.5, y + 91.44]])
    drawing.join(boost, '6', topR, '1', [[208.28, y + 91.44]])
    drawing.join(topR, '2', botR, '1')
    drawing.join(boost, '1', botR, '1', [
      [193.04, y + 106.68],
      [193.04, y + 114.3],
      [208.28, y + 114.3],
    ])
    const caps = [find('/rgb-cout1')!, find('/rgb-cout2')!, find('/rgb-bulk')!]
    caps.forEach((cap, index) => {
      const x = 259.08 + index * 45.72
      drawing.place(cap, x, y + 101.6, 270)
      // Separate short supply stubs keep the feedback divider and output bank legible.
    })
    const pd = find('/rgb-en-pd')!
    drawing.place(pd, 162.56, y + 127, 270)
    drawing.join(boost, '2', pd, '1', [[162.56, y + 101.6]])
    drawing.content += text(
      `power/${side}/boost-note`,
      'VOUT ~ 4.95 V (732k / 100k). Place L and input/output capacitors close to IC; keep SW copper short.',
      25.4,
      y + 144.78,
    )
    const ls = find('/rgb-level-shifter')!,
      series = find('/rgb-data-series')!,
      bypass = find('/rgb-ls-decoupling')!
    drawing.content += text(
      `power/${side}/logic-heading`,
      'RGB DATA / 3.3 V TO 5 V LEVEL SHIFT',
      25.4,
      y + 157.48,
    )
    drawing.place(ls, 116.84, y + 185.42)
    drawing.place(series, 185.42, y + 185.42)
    drawing.place(bypass, 269.24, y + 185.42, 270)
    drawing.join(ls, '4', series, '1')
    drawing.content += text(
      `power/${side}/logic-note`,
      '100nF at buffer VCC. Keep RGB_DATA low while RGB power is off.',
      25.4,
      y + 208.28,
    )
  })
  return { content: drawing.finish(), height: nextY + 35.56 }
}

function rgbCircuit(model: KeyboardHardwareModel, ports: string[]) {
  const drawing = new CircuitDrawing('rgb', ports)
  drawing.content += text(
    'rgb/note',
    'ADDRESSABLE RGB / data flows left to right. Each LED has its own 100nF bypass capacitor.',
    25.4,
    20.32,
  )
  let row = 0
  for (const side of [
    ...new Set(model.components.filter((c) => c.kind === 'led').map((c) => c.boardSide)),
  ]) {
    const leds = model.components.filter((c) => c.kind === 'led' && c.boardSide === side)
    // Follow the actual DIN/DOUT nets rather than spatial order or reference numbers.
    const byInput = new Map(
      leds.map((c) => {
        const din = symbols
          .find((s) => s.name === c.symbol)!
          .pins.find((p) => p.name === 'DIN')!.number
        return [c.pins[din], c]
      }),
    )
    let led = byInput.get(`RGB_DATA_SHIFTED${side ? `_${side.toUpperCase()}` : ''}`)
    let previous: HardwareComponent | undefined
    let index = 0
    const visited = new Set<string>()
    drawing.content += text(
      `rgb/${side}/heading`,
      `${side?.toUpperCase() ?? 'UNIBODY'} / ${leds.length} LEDs`,
      25.4,
      35.56 + row * 76.2,
    )
    while (led && !visited.has(led.id)) {
      visited.add(led.id)
      const col = index % 5,
        x = 71.12 + col * 66.04,
        y = 86.36 + row * 76.2
      drawing.place(led, x, y)
      const cap = model.components.find((c) => c.id === led!.id.replace(/\/led$/, '/led-cap'))!
      drawing.place(cap, x + 22.86, y - 27.94, 270)
      const def = symbols.find((s) => s.name === led!.symbol)!
      const pin = (name: string) => def.pins.find((p) => p.name === name)!.number
      if (previous && col > 0) {
        const dout = symbols
          .find((s) => s.name === previous!.symbol)!
          .pins.find((p) => p.name === 'DOUT')!.number
        drawing.join(previous, dout, led, pin('DIN'))
      }
      previous = led
      led = byInput.get(led.pins[pin('DOUT')])
      index++
      if (index % 5 === 0) row++
    }
    if (visited.size !== leds.length) throw new Error('RGB chain is incomplete or cyclic')
    if (index % 5) row++
    row++
  }
  return { content: drawing.finish(), height: Math.max(297, 90 + row * 76.2) }
}

export function schematicFiles(model: KeyboardHardwareModel, boardSide?: 'left' | 'right') {
  if (boardSide) {
    const components = model.components.filter((component) => component.boardSide === boardSide)
    const ids = new Set(components.map((component) => component.layoutKeyId))
    model = {
      ...model,
      components,
      layout: {
        ...model.layout,
        keys: model.layout.keys.filter((key, index) => ids.has(layoutKeyId(key, index))),
      },
      matrix: {
        ...model.matrix,
        assignments: Object.fromEntries(
          Object.entries(model.matrix.assignments).filter(([id]) => ids.has(id)),
        ),
      },
      nets: model.nets
        .map((net) => ({
          ...net,
          nodes: net.nodes.filter((node) =>
            components.some((component) => component.id === node.componentId),
          ),
        }))
        .filter((net) => net.nodes.length > 0),
    }
  }
  const powerNames = model.nets
    .map((net) => net.name)
    .filter((name) => /^(\+3V3|GND|VBUS|VBAT)(_|$)/.test(name))
    .sort(compareIds)
  const deviceComponents = model.components.filter((c) => c.sheet === 'devices')
  const sheetNames = [
    'controller',
    'matrix',
    'power',
    ...(deviceComponents.length ? ['devices'] : []),
    ...(model.components.some((c) => c.sheet === 'rgb') ? ['rgb'] : []),
  ]
  const sheetNets: Record<string, string[]> = Object.fromEntries(
    sheetNames.map((sheet) => [
      sheet,
      model.nets
        .filter((net) => {
          const sheets = new Set(
            net.nodes.map((node) => model.components.find((c) => c.id === node.componentId)?.sheet),
          )
          return (
            (sheets.has(sheet as HardwareComponent['sheet']) &&
              (sheets.size > 1 || powerNames.includes(net.name))) ||
            (sheet === 'power' && powerNames.includes(net.name))
          )
        })
        .map((net) => net.name)
        .sort(compareIds),
    ]),
  )
  let root = text(
    'root/note',
    `KEYBOARD / ${boardSide?.toUpperCase() ?? (model.architecture === 'wired-split' ? 'LEFT + RIGHT' : 'UNIBODY')} - ${model.split.connection === 'wireless' ? 'Wireless: independent power on each half.' : 'See controller and power sheets.'}`,
    25.4,
    20.32,
  )
  const rootRowHeight = Math.max(
    76.2,
    ...Object.values(sheetNets).map((names) => (names.length + 5) * 5.08),
  )
  sheetNames.forEach((sheet, index) => {
    const x = 88.9 + (index % 2) * 190.5,
      y = 45.72 + Math.floor(index / 2) * rootRowHeight
    const names = sheetNets[sheet]!
    const height = Math.max(35.56, (names.length + 2) * 5.08)
    root += `(sheet (at ${n(x)} ${n(y)}) (size 76.2 ${n(height)}) (stroke (width 0) (type default)) (fill (color 0 0 0 0)) ${uid(`sheet/${sheet}`)}
      (property "Sheetname" ${q(sheet)} (at ${n(x)} ${n(y - 2.54)} 0) (effects (font (size 1.27 1.27)) (justify left)))
      (property "Sheetfile" ${q(`${sheet}.kicad_sch`)} (at ${n(x)} ${n(y + height + 2.54)} 0) (effects (font (size 1.27 1.27)) (justify left)))
      ${names.map((name, i) => `(pin ${q(name)} bidirectional (at ${n(x)} ${n(y + (i + 1) * 5.08)} 180) ${font()} ${uid(`sheet/${sheet}/port/${name}`)})`).join('\n')}
      (instances (project "keyboard" (path ${q(`/${rootId}`)} (page ${q(String(index + 2))})))))`
    names.forEach((name, i) => {
      const py = y + (i + 1) * 5.08
      root +=
        wire(`root/${sheet}/${name}/wire`, x - labelWireLength(name), py, x, py) +
        label(`root/${sheet}/${name}/label`, name, x - labelWireLength(name), py)
    })
  })
  let controller = text(
    'controller/note',
    'Module includes USB, regulator, decoupling and boot/reset. Unused external pins are intentionally NC.',
    25.4,
    20.32,
  )
  for (const [index, c] of model.components.filter((c) => c.kind === 'controller').entries()) {
    const x = 101.6 + index * 152.4,
      y = 96.52
    controller += placedSymbol(
      c.symbol,
      `component/${c.id}`,
      c.reference,
      c.value,
      `Keyboard:${c.footprint}`,
      x,
      y,
      'controller',
    )
    for (const pin of symbols.find((s) => s.name === c.symbol)!.pins) {
      const px = x + pin.x,
        py = y - pin.y,
        name = c.pins[pin.number]
      if (name) {
        const end = px + (pin.x < 0 ? -labelWireLength(name) : labelWireLength(name))
        controller +=
          wire(`${c.id}/${pin.number}/wire`, px, py, end, py) +
          label(`${c.id}/${pin.number}/port`, name, end, py, true, pin.x < 0 ? 0 : 180)
      } else controller += `(no_connect (at ${n(px)} ${n(py)}) ${uid(`${c.id}/${pin.number}/nc`)})`
    }
  }
  const seibokuHeaders = model.components
    .filter((component) => component.blockId === 'seiboku-jumper-header' && component.sheet === 'controller')
    .sort((a, b) => compareIds(a.id, b.id))
  seibokuHeaders.forEach((c, index) => {
    const x = 254 + (index % 2) * 88.9
    const y = 91.44 + Math.floor(index / 2) * 76.2
    controller += placedSymbol(
      c.symbol,
      `component/${c.id}`,
      c.reference,
      c.value,
      `Keyboard:${c.footprint}`,
      x,
      y,
      'controller',
    )
    for (const pin of symbols.find((s) => s.name === c.symbol)!.pins) {
      const px = x + pin.x
      const py = y - pin.y
      const name = c.pins[pin.number]
      if (name) {
        const end = px + (pin.x < 0 ? -labelWireLength(name) : labelWireLength(name))
        controller +=
          wire(`${c.id}/${pin.number}/wire`, px, py, end, py) +
          label(`${c.id}/${pin.number}/port`, name, end, py, false, pin.x < 0 ? 0 : 180)
      } else {
        controller += `(no_connect (at ${n(px)} ${n(py)}) ${uid(`${c.id}/${pin.number}/nc`)})`
      }
    }
  })
  if (seibokuHeaders.length) {
    controller += text(
      'controller/seiboku-note',
      'SEIBOKU external module: 3.3 V only. Pin 1=3V3, 2=GND, 3/4=NC, 5=SCLK, 6=SDIO, 7=MOTION, 8=NCS. Use half-duplex SDIO; do not connect RGB_5V or VBAT.',
      25.4,
      190.5,
    )
  }
  let matrix = text(
    'matrix/note',
    'COL2ROW: diode pin 1 = K (ROW), pin 2 = A (switch). One diode per switch.',
    25.4,
    20.32,
  )
  const cells = model.components
    .filter((c) => c.kind === 'switch')
    .map((sw) => ({
      sw,
      diode: model.components.find((c) => c.kind === 'diode' && c.layoutKeyId === sw.layoutKeyId)!,
      ...model.matrix.assignments[sw.layoutKeyId]!,
    }))
  const visibleColumns = [...new Set(cells.map((cell) => cell.column))].sort((a, b) => a - b)
  const visibleRows = [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b)
  const busX = (col: number) => 45.72 + visibleColumns.indexOf(col) * 50.8
  const switchY = (row: number) => 60.96 + visibleRows.indexOf(row) * 30.48
  const junction = (id: string, x: number, y: number) =>
    `(junction (at ${n(x)} ${n(y)}) (diameter 0) (color 0 0 0 0) ${uid(id)})`
  for (let col = 0; col < model.matrix.columns; col++) {
    const members = cells.filter((c) => c.column === col).sort((a, b) => a.row - b.row)
    if (!members.length) continue
    const x = busX(col)
    matrix += label(`matrix/COL${col}/port`, `COL${col}`, x, 40.64, true, 270)
    let previous = 40.64
    for (const cell of members) {
      const y = switchY(cell.row)
      matrix += wire(`matrix/COL${col}/${cell.row}`, x, previous, x, y)
      if (cell !== members[members.length - 1])
        matrix += junction(`matrix/COL${col}/${cell.row}/junction`, x, y)
      previous = y
    }
  }
  for (let row = 0; row < model.matrix.rows; row++) {
    const members = cells.filter((c) => c.row === row).sort((a, b) => a.column - b.column)
    if (!members.length) continue
    const y = switchY(row) + 20.32
    matrix += label(`matrix/ROW${row}/port`, `ROW${row}`, 25.4, y, true)
    let previous = 25.4
    for (const cell of members) {
      const x = busX(cell.column) + 25.4
      matrix += wire(`matrix/ROW${row}/${cell.column}`, previous, y, x, y)
      if (cell !== members[members.length - 1])
        matrix += junction(`matrix/ROW${row}/${cell.column}/junction`, x, y)
      previous = x
    }
  }
  for (const { sw, diode, row, column } of cells) {
    const x = busX(column),
      y = switchY(row)
    matrix += placedSymbol(
      sw.symbol,
      `component/${sw.id}`,
      sw.reference,
      sw.value,
      `Keyboard:${sw.footprint}`,
      x + 10.16,
      y,
      'matrix',
    )
    matrix += placedSymbol(
      diode.symbol,
      `component/${diode.id}`,
      diode.reference,
      diode.value,
      `Keyboard:${diode.footprint}`,
      x + 25.4,
      y + 10.16,
      'matrix',
      270,
    )
    matrix += wire(`${sw.id}/col`, x, y, x + 5.08, y)
    matrix += wire(`${sw.id}/anode/h`, x + 15.24, y, x + 25.4, y)
    matrix += wire(`${sw.id}/anode/v`, x + 25.4, y, x + 25.4, y + 5.08)
    matrix += label(`${sw.id}/anode-label`, sw.pins['2']!, x + 15.24, y)
    matrix += wire(`${diode.id}/row`, x + 25.4, y + 15.24, x + 25.4, y + 20.32)
  }
  let power = text(
    'power/note',
    model.power === 'controller-lipo'
      ? 'USB and the charger are integrated in each controller module. Use protected 1S LiPo packs (4.2 V maximum).'
      : 'Power is supplied only through the USB connector on U1. No external charger or regulator is fitted.',
    25.4,
    20.32,
  )
  power += text(
    'power/note2',
    model.power === 'controller-lipo'
      ? 'Battery connector: pin 1 BAT+, pin 2 GND. Pack must permit 100 mA charging. VBUS is unavailable on battery.'
      : 'VBUS is the USB-C input to U1; +3V3 is the module output. GND is the USB/module ground reference. Do not connect another supply.',
    25.4,
    27.94,
  )
  powerNames.forEach((name, i) => {
    const x = 76.2 + (i % 4) * 88.9,
      y = 48.26 + Math.floor(i / 4) * 17.78
    power += placedSymbol(
      name.startsWith('GND')
        ? 'Ground'
        : name.startsWith('VBAT')
          ? 'BatterySupply'
          : name.startsWith('VBUS') && model.controller === 'xiao-nrf52840'
            ? 'UsbSupply'
            : 'Rail',
      `power/${name}`,
      `#PWR0${i + 1}`,
      name,
      '',
      x,
      y,
      'power',
    )
    power +=
      wire(`power/${name}/wire`, x, y, x - 20.32, y) +
      label(`power/${name}/port`, name, x - 20.32, y, true)
  })
  const powerLayout = powerCircuit(
    model,
    sheetNets.power!,
    78.74 + Math.floor((powerNames.length - 1) / 4) * 17.78,
  )
  power += powerLayout.content
  const rgbLayout = model.pcb.rgb.enabled ? rgbCircuit(model, sheetNets.rgb ?? []) : null
  let devices = text(
    'devices/note',
    model.split.connection === 'wired-uart'
      ? 'UART: Tip links left TX to right RX; Ring1 links left RX to right TX. Sleeve connects grounds. Ring2 is NC. Unplug USB before inserting/removing TRRS.'
      : 'SEIBOKU 3.3 V only; half-duplex SDIO. Header pins 3 and 4 are NC.',
    25.4,
    20.32,
  )
  deviceComponents.forEach((c, index) => {
    const x = 101.6,
      y = 71.12 + index * 76.2
    devices += placedSymbol(
      c.symbol,
      `component/${c.id}`,
      c.reference,
      c.value,
      `Keyboard:${c.footprint}`,
      x,
      y,
      'devices',
    )
    for (const pin of symbols.find((s) => s.name === c.symbol)!.pins) {
      const px = x + pin.x,
        py = y - pin.y,
        name = c.pins[pin.number]
      if (name) {
        const end = px + (pin.x < 0 ? -labelWireLength(name) : labelWireLength(name))
        devices +=
          wire(`${c.id}/${pin.number}/wire`, px, py, end, py) +
          label(`${c.id}/${pin.number}/port`, name, end, py, true, pin.x < 0 ? 0 : 180)
      } else devices += `(no_connect (at ${n(px)} ${n(py)}) ${uid(`${c.id}/${pin.number}/nc`)})`
    }
  })
  return [
    ...(rgbLayout
      ? [
          {
            name: 'keyboard/rgb.kicad_sch',
            text: document(
              'rgb',
              rgbLayout.content,
              model.components.filter((c) => c.sheet === 'rgb').map((c) => c.symbol),
              `(paper "User" 420 ${rgbLayout.height})`,
            ),
          },
        ]
      : []),
    ...(deviceComponents.length
      ? [
          {
            name: 'keyboard/devices.kicad_sch',
            text: document(
              'devices',
              devices,
              deviceComponents.map((c) => c.symbol),
              `(paper "User" 297 ${Math.max(210, deviceComponents.length * 76.2 + 100)})`,
            ),
          },
        ]
      : []),
    {
      name: 'keyboard/keyboard.kicad_sch',
      text: document(
        'root',
        root,
        [],
        `(paper "User" 420 ${Math.max(297, 85 + Math.ceil(sheetNames.length / 2) * rootRowHeight)})`,
      ),
    },
    {
      name: 'keyboard/controller.kicad_sch',
      text: document(
        'controller',
        controller,
        model.components.filter((c) => c.sheet === 'controller').map((c) => c.symbol),
        `(paper "User" ${Math.max(297, 110 + model.components.filter((c) => c.kind === 'controller').length * 152.4)} 210)`,
      ),
    },
    {
      name: 'keyboard/matrix.kicad_sch',
      text: document(
        'matrix',
        matrix,
        model.components.filter((c) => c.sheet === 'matrix').map((c) => c.symbol),
        `(paper "User" ${Math.max(297, 85 + visibleColumns.length * 50.8)} ${Math.max(210, 120 + visibleRows.length * 30.48)})`,
      ),
    },
    {
      name: 'keyboard/power.kicad_sch',
      text: document(
        'power',
        power,
        [
          'Rail',
          'Ground',
          'BatterySupply',
          'UsbSupply',
          ...model.components.filter((c) => c.sheet === 'power').map((c) => c.symbol),
        ],
        `(paper "User" 420 ${Math.max(297, powerLayout.height)})`,
      ),
    },
  ]
}

export function footprintLibrary(id: string): string {
  return renderFootprint(id)
}
/** KiCad qualifies local labels with their hierarchical sheet path. */
export function pcbNetName(name: string): string {
  if (/^(\+3V3|VBUS)(_|$)/.test(name) || name.startsWith('unconnected-')) return name
  if (/^SW\d+_A$/.test(name)) return `/matrix/${name}`
  if (/^RGB_LED_/.test(name)) return `/rgb/${name}`
  if (/^(RGB_SW|RGB_FB|RGB_SHIFTED|BAT_RAW)(_|$)/.test(name)) return `/power/${name}`
  return `/${name}`
}
function boardPinNet(component: HardwareComponent, pin: string): string | null {
  const net = component.pins[pin]
  if (net) return net
  if (net === null) {
    const definition = symbols
      .find((s) => s.name === component.symbol)!
      .pins.find((p) => p.number === pin)!
    const pinName = definition.name === pin || definition.name === '~' ? '' : `${definition.name}-`
    return `unconnected-(${component.reference}-${pinName}Pad${pin})`
  }
  return null
}
function roundedBoardOutline(outline: BoardOutline | null) {
  if (!outline) return ''
  const r = Math.min(
    outline.cornerRadiusMm,
    (outline.maxX - outline.minX) / 2,
    (outline.maxY - outline.minY) / 2,
  )
  const line = (id: string, x1: number, y1: number, x2: number, y2: number) =>
    `(gr_line (start ${n(x1)} ${n(y1)}) (end ${n(x2)} ${n(y2)}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") ${uid(`board/outline/${id}`)})`
  const arc = (
    id: string,
    sx: number,
    sy: number,
    mx: number,
    my: number,
    ex: number,
    ey: number,
  ) =>
    `(gr_arc (start ${n(sx)} ${n(sy)}) (mid ${n(mx)} ${n(my)}) (end ${n(ex)} ${n(ey)}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") ${uid(`board/outline/${id}`)})`
  if (outline.rings?.length) {
    return outline.rings
      .flatMap((ring, ringIndex) =>
        ring.segments.map((segment, segmentIndex) =>
          segment.kind === 'line'
            ? line(
                `ring-${ringIndex}-${segmentIndex}`,
                segment.start.x,
                segment.start.y,
                segment.end.x,
                segment.end.y,
              )
            : arc(
                `ring-${ringIndex}-${segmentIndex}`,
                segment.start.x,
                segment.start.y,
                segment.mid.x,
                segment.mid.y,
                segment.end.x,
                segment.end.y,
              ),
        ),
      )
      .join('\n')
  }
  if (r <= 0) {
    return [
      line('bottom', outline.minX, outline.minY, outline.maxX, outline.minY),
      line('right', outline.maxX, outline.minY, outline.maxX, outline.maxY),
      line('top', outline.maxX, outline.maxY, outline.minX, outline.maxY),
      line('left', outline.minX, outline.maxY, outline.minX, outline.minY),
    ].join('\n')
  }
  const k = 0.7071067812
  return [
    line('bottom', outline.minX + r, outline.minY, outline.maxX - r, outline.minY),
    arc(
      'bottom-right',
      outline.maxX - r,
      outline.minY,
      outline.maxX - r + r * k,
      outline.minY + r - r * k,
      outline.maxX,
      outline.minY + r,
    ),
    line('right', outline.maxX, outline.minY + r, outline.maxX, outline.maxY - r),
    arc(
      'top-right',
      outline.maxX,
      outline.maxY - r,
      outline.maxX - r + r * k,
      outline.maxY - r + r * k,
      outline.maxX - r,
      outline.maxY,
    ),
    line('top', outline.maxX - r, outline.maxY, outline.minX + r, outline.maxY),
    arc(
      'top-left',
      outline.minX + r,
      outline.maxY,
      outline.minX + r - r * k,
      outline.maxY - r + r * k,
      outline.minX,
      outline.maxY - r,
    ),
    line('left', outline.minX, outline.maxY - r, outline.minX, outline.minY + r),
    arc(
      'bottom-left',
      outline.minX,
      outline.minY + r,
      outline.minX + r - r * k,
      outline.minY + r - r * k,
      outline.minX + r,
      outline.minY,
    ),
  ].join('\n')
}
function npthHole(hole: BoardHole) {
  const value = hole.kind === 'mounting' ? 'M2 NPTH clearance' : 'MX stabilizer NPTH'
  return `(footprint "Keyboard:${hole.kind === 'mounting' ? 'MountingHole' : 'MXStabilizerHole'}" (layer "F.Cu") (at ${n(hole.x)} ${n(hole.y)}) ${uid(`hole/${hole.id}`)}
    (property "Reference" "${hole.kind === 'mounting' ? 'H' : 'STAB'}" (at 0 -2.5 0) ${font(1, true)})
    (property "Value" "${value}" (at 0 2.5 0) ${font(1, true)})
    (pad "" np_thru_hole circle (at 0 0) (size ${n(hole.drillMm)} ${n(hole.drillMm)}) (drill ${n(hole.drillMm)}) (layers "*.Cu" "*.Mask") ${uid(`hole/${hole.id}/pad`)}))`
}
export function pcbFile(model: KeyboardHardwareModel, boardSide?: 'left' | 'right') {
  const components = boardSide
    ? model.components.filter((component) => component.boardSide === boardSide)
    : model.components
  const componentIds = new Set(components.map((component) => component.id))
  const scopedNets = model.nets
    .map((net) => ({
      ...net,
      nodes: net.nodes.filter((node) => componentIds.has(node.componentId)),
    }))
    .filter((net) => net.nodes.length > 0)
  const nets = [
    ...scopedNets.map((net) => net.name),
    ...components.flatMap((c) =>
      Object.entries(c.pins)
        .filter(([, net]) => net === null)
        .map(([pin]) => boardPinNet(c, pin)!),
    ),
  ].sort(compareIds)
  const b = boardSide
    ? (model.board.sideOutlines?.[boardSide] ?? model.board.outline)
    : model.board.outline
  const holes = boardSide
    ? [
        ...(model.board.sideMountingHoles?.[boardSide] ?? []),
        ...(model.board.sideStabilizerHoles?.[boardSide] ?? []),
      ]
    : [...model.board.mountingHoles, ...model.board.stabilizerHoles]
  const keepout = (component: HardwareComponent) => {
    const box =
      CONTROLLER_RECIPES[component.blockId as keyof typeof CONTROLLER_RECIPES]?.antennaKeepout
    if (!box) return ''
    const localPoints: [number, number][] = [
      [box.minX, box.minY],
      [box.maxX, box.minY],
      [box.maxX, box.maxY],
      [box.minX, box.maxY],
    ]
    const points = localPoints.map(([x, y]) => {
      const p = rotate(x, y, component.position.rotation)
      return `(xy ${n(p.x + component.position.x)} ${n(p.y + component.position.y)})`
    })
    return `(zone (net 0) (net_name "") (layers "F.Cu" "B.Cu") (hatch edge 0.5)
      (connect_pads (clearance 0)) (min_thickness 0.25)
      (keepout (tracks not_allowed) (vias not_allowed) (pads not_allowed) (copperpour not_allowed))
      (polygon (pts ${points.join(' ')})) ${uid(`keepout/${component.id}`)})`
  }
  const layers =
    '(0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (40 "Dwgs.User" user) (41 "Cmts.User" user) (43 "Eco2.User" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user) (47 "F.CrtYd" user) (48 "B.Fab" user) (49 "F.Fab" user)'
  return `(kicad_pcb (version 20241229) (generator "keyboard_hardware_cad") (general (thickness 1.6)) (paper "A3") (layers ${layers}) (setup (pad_to_mask_clearance 0))
    (net 0 "") ${nets.map((name, i) => `(net ${i + 1} ${q(pcbNetName(name))})`).join('\n')}
    ${components
      .map((c) =>
        renderFootprint(c.footprint, c, `${instancePath(c.sheet)}/${componentUuid(c)}`, (pin) => {
          const net = boardPinNet(c, pin)
          return net ? { number: nets.indexOf(net) + 1, name: pcbNetName(net) } : null
        }),
      )
      .join('\n')}
    ${holes.map(npthHole).join('\n')}
    ${components
      .filter((c) => c.kind === 'controller')
      .map(keepout)
      .join('\n')}
    ${keyOutlineDrawing(model, boardSide)}
    ${roundedBoardOutline(b)})\n`
}
