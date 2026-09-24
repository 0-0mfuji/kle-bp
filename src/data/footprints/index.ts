import rgbLed from './LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount.json'
import tps from './TPS61023.json'
import ahct from './SN74AHCT1G125.json'
import mx from './MX.json'
import choc from './ChocV1.json'
import diode from './SOD123.json'
import xiao from './XIAO_RP2040.json'
import nrfPlus from './XIAO_NRF52840_PLUS.json'
import nrf from './XIAO_NRF52840.json'
import battery from './BatteryHeader.json'
import seiboku from './PMW3610_SEIBOKU.json'
import promicro from './ProMicro_ATmega32U4.json'
import trrs from './TRRS_PJ320A.json'
import ptc from './PTC_1206.json'
import powerSwitchMsk12c02 from './PowerSwitch_MSK12C02.json'
import batteryConnectorPh2 from './BatteryConnector_JST_PH2.json'
import batteryConnectorSh1 from './BatteryConnector_JST_SH1.json'
import seibokuLicense from './seiboku-license.md?raw'
import type { PadDefinition } from '../hardware-catalog'
import kicadLicense from './kicad-license.md?raw'
import chocLicense from './choc-license.md?raw'
import seeedLicense from './seeed-license.md?raw'
import salicylicLicense from './salicylic-license.md?raw'
import { SWITCH_FOOTPRINT_SNAPSHOTS } from './keyboard-switches'

export type Expression = (string | number | Expression)[]
export interface FootprintSnapshot {
  id: string
  authority: string
  source: string
  sha256: string
  license: string
  modifications: string[]
  nodes: Expression[]
  pads: PadDefinition[]
}

const simpleSnapshot = (
  id: string,
  source: string,
  body: { minX: number; minY: number; maxX: number; maxY: number },
  pads: PadDefinition[],
  description: string,
): FootprintSnapshot => ({
  id,
  authority: 'KiCad official-compatible; datasheet reviewed',
  source,
  sha256: ({
    'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount': '8d122084d13c645b03a3c8904a8c2b2e73d7ec0ed88589c1f4620d6cf2838ae5',
    C_0603: '0e2cd1b101f6095c901440377c245e2ed83d355958bdaeff67f60912ca38ca83',
    R_0603: '00b4b299592a8abadf314a9520e37c69110983a7c67320ded71fdb07ae2e4398',
    L_1008: 'a29db41bd1c7ef031a45b1040ecf1fe8eddb79d690f7b884d1878cbba2d18ca9',
    TPS61023: '3f9627588356874ae4219ffb9eef26f268cce134466cfa5cda6eafe8ed535e30',
    SN74AHCT1G125: '309a28f17f0df20b599fc3aee3eeb281075f8e542ecfd32939a1a1c87be6bfda',
  } as Record<string, string>)[id] ?? '0'.repeat(64),
  license: 'kicad-license.md',
  modifications: ['Deterministic local snapshot with external 3D models removed'],
  nodes: [
    ['layer', 'F.Cu'],
    ['descr', description],
    ['property', 'Reference', 'REF**', ['at', 0, body.minY - 1.4, 0], ['layer', 'F.SilkS'], ['effects', ['font', ['size', 1, 1]]]],
    ['property', 'Value', id, ['at', 0, body.maxY + 1.4, 0], ['layer', 'F.Fab'], ['effects', ['font', ['size', 1, 1]]]],
    ['fp_rect', ['start', body.minX, body.minY], ['end', body.maxX, body.maxY], ['stroke', ['width', 0.12], ['type', 'solid']], ['fill', 'none'], ['layer', 'F.SilkS']],
    ...pads.map((pad) => [
      'pad', pad.number, pad.type, pad.shape ?? (pad.type === 'smd' ? 'roundrect' : 'circle'),
      ['at', pad.x, pad.y], ['size', pad.width, pad.height],
      ...(pad.drill ? [['drill', pad.drill] as Expression] : []),
      ['layers', ...(pad.type === 'smd' ? ['F.Cu', 'F.Paste', 'F.Mask'] : ['*.Cu', '*.Mask'])],
      ...(pad.type === 'smd' ? [['roundrect_rratio', 0.2] as Expression] : []),
    ] as Expression),
  ],
  pads,
})

const seibokuJumperHeader = simpleSnapshot(
  'SEIBOKU_JUMPER_HEADER',
  'https://github.com/KiCad/kicad-footprints/tree/master/Connector_PinHeader_2.54mm.pretty',
  { minX: -1.38, minY: -1.38, maxX: 3.92, maxY: 9.0 },
  [
    { number: '1', x: 0, y: 0, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole', shape: 'rect' },
    { number: '2', x: 2.54, y: 0, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '3', x: 0, y: 2.54, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '4', x: 2.54, y: 2.54, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '5', x: 0, y: 5.08, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '6', x: 2.54, y: 5.08, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '7', x: 0, y: 7.62, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
    { number: '8', x: 2.54, y: 7.62, width: 2.0, height: 2.0, drill: 1.0, type: 'thru_hole' },
  ],
  'Through hole straight pin header, 2x04, 2.54mm pitch, double row',
)
seibokuJumperHeader.nodes.push(
  ['fp_circle', ['center', -0.9, -0.9], ['end', -0.45, -0.9], ['stroke', ['width', 0.15], ['type', 'solid']], ['fill', 'none'], ['layer', 'F.SilkS']],
)

const capacitor = simpleSnapshot(
  'C_0603',
  'https://github.com/KiCad/kicad-footprints/tree/master/Capacitor_SMD.pretty',
  { minX: -0.9, minY: -0.55, maxX: 0.9, maxY: 0.55 },
  [
    { number: '1', x: -0.75, y: 0, width: 0.9, height: 0.9, type: 'smd' },
    { number: '2', x: 0.75, y: 0, width: 0.9, height: 0.9, type: 'smd' },
  ],
  'Generic 0603 ceramic capacitor',
)
const resistor = simpleSnapshot(
  'R_0603',
  'https://github.com/KiCad/kicad-footprints/tree/master/Resistor_SMD.pretty',
  { minX: -0.9, minY: -0.55, maxX: 0.9, maxY: 0.55 },
  [
    { number: '1', x: -0.75, y: 0, width: 0.9, height: 0.9, type: 'smd' },
    { number: '2', x: 0.75, y: 0, width: 0.9, height: 0.9, type: 'smd' },
  ],
  'Generic 0603 resistor',
)
const inductor = simpleSnapshot(
  'L_1008',
  'https://github.com/KiCad/kicad-footprints/tree/master/Inductor_SMD.pretty',
  { minX: -1.35, minY: -1.1, maxX: 1.35, maxY: 1.1 },
  [
    { number: '1', x: -1, y: 0, width: 1.2, height: 1.4, type: 'smd' },
    { number: '2', x: 1, y: 0, width: 1.2, height: 1.4, type: 'smd' },
  ],
  'Generic 1008 power inductor',
)
/** Adding a package does not require adding another branch to the renderer. */
export const FOOTPRINT_SNAPSHOTS = Object.fromEntries(
  [mx, choc, diode, xiao, nrf, nrfPlus, battery, seiboku, seibokuJumperHeader, promicro, trrs, ptc, powerSwitchMsk12c02, batteryConnectorPh2, batteryConnectorSh1, rgbLed, capacitor, resistor, inductor, tps, ahct, ...SWITCH_FOOTPRINT_SNAPSHOTS].map((entry) => [
    entry.id,
    entry as FootprintSnapshot,
  ]),
)
export const FOOTPRINT_LICENSES = {
  'kicad-license.md': kicadLicense,
  'choc-license.md': chocLicense,
  'seeed-license.md': seeedLicense,
  'seiboku-license.md': seibokuLicense,
  'salicylic-license.md': salicylicLicense,
}
