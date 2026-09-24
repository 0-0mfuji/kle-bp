import { FOOTPRINT_SNAPSHOTS } from './footprints'

/** Electrical/mechanical facts, not KiCad syntax. See docs/hardware-verification.md. */
export const XIAO_PINS = [26, 27, 28, 29, 6, 7, 0, 1, 2, 4, 3].map((gpio, index) => ({
  name: `D${index}`,
  gpio: `GPIO${gpio}`,
  pad: String(index + 1),
  capabilities: [
    'GPIO',
    'PWM',
    ...(index < 4 ? ['ADC'] : []),
    ...([4, 5].includes(index) ? ['I2C'] : []),
    ...([6, 7].includes(index) ? ['UART'] : []),
    ...(index >= 8 ? ['SPI'] : []),
  ],
}))
// Physical Nordic port names; Arduino numbering varies between board packages.
// Internal flash, charging, battery ADC, LEDs, NFC and debug pins are excluded.
export const XIAO_NRF52840_PINS = [
  'P0.02',
  'P0.03',
  'P0.28',
  'P0.29',
  'P0.04',
  'P0.05',
  'P1.11',
  'P1.12',
  'P1.13',
  'P1.14',
  'P1.15',
].map((gpio, index) => ({
  name: `D${index}`,
  gpio,
  pad: String(index + 1),
  capabilities: ['GPIO', 'PWM', 'SPI', 'I2C', 'UART', ...(index < 6 ? ['ADC'] : [])],
}))
// Plus D14/D15 are reserved for NFC and D16 is connected to the battery ADC.
// Only the six additional unrestricted pins are exposed to the solver.
export const XIAO_NRF52840_PLUS_PINS = [
  ...XIAO_NRF52840_PINS,
  ...[
    ['D11', 'P0.15', '15'],
    ['D12', 'P0.19', '16'],
    ['D13', 'P1.01', '17'],
    ['D17', 'P1.03', '21'],
    ['D18', 'P1.05', '22'],
    ['D19', 'P1.07', '23'],
  ].map(([name, gpio, pad]) => ({
    name: name!,
    gpio: gpio!,
    pad: pad!,
    capabilities: ['GPIO', 'PWM', 'SPI', 'I2C', 'UART'],
  })),
]

/** Standard ATmega32U4 Pro Micro-compatible header pins. */
export const PROMICRO_PINS = [
  ['D2', 'PD1', '5'],
  ['D3', 'PD0', '6'],
  ['D1', 'PD3', '7'],
  ['D0', 'PD2', '8'],
  ['D4', 'PD4', '9'],
  ['D5', 'PC6', '10'],
  ['D7', 'PE6', '11'],
  ['D8', 'PB4', '12'],
  ['D9', 'PB5', '13'],
  ['D10', 'PB6', '14'],
  ['D16', 'PB2', '15'],
  ['D14', 'PB3', '16'],
  ['D15', 'PB1', '17'],
  ['A0', 'PF7', '18'],
  ['A1', 'PF6', '19'],
  ['A2', 'PF5', '20'],
  ['A3', 'PF4', '21'],
].map(([name, gpio, pad]) => ({
  name: name!,
  gpio: gpio!,
  pad: pad!,
  capabilities: ['GPIO', 'PWM', 'SPI', 'I2C', 'UART', ...(name!.startsWith('A') ? ['ADC'] : [])],
}))
export const BOARD_MARGIN_MM = 4
export const DIODE_DIRECTION = 'COL2ROW' as const
export interface PadDefinition {
  number: string
  x: number
  y: number
  width: number
  height: number
  drill?: number | 'oval'
  type: 'thru_hole' | 'np_thru_hole' | 'smd'
  shape?: 'circle' | 'rect' | 'oval' | 'roundrect'
}
export interface FootprintDefinition {
  id: string
  body: { minX: number; minY: number; maxX: number; maxY: number }
  pads: PadDefinition[]
  source: string
  collisionKind: 'switch' | 'body'
}
const bodyBounds: Record<string, FootprintDefinition['body']> = {
  MX: { minX: -7, minY: -7, maxX: 7, maxY: 7 },
  ChocV1: { minX: -7.5, minY: -7.5, maxX: 7.5, maxY: 7.5 },
  SOD123: { minX: -1.4, minY: -0.9, maxX: 1.4, maxY: 0.9 },
  XIAO_RP2040: { minX: -8.9, minY: -12, maxX: 8.9, maxY: 10.55 },
  XIAO_NRF52840: { minX: -8.9, minY: -12, maxX: 8.9, maxY: 10.55 },
  XIAO_NRF52840_PLUS: { minX: -8.9, minY: -12, maxX: 8.9, maxY: 10.55 },
  ProMicro_ATmega32U4: { minX: -17, minY: -9, maxX: 17, maxY: 9 },
  TRRS_PJ320A: { minX: 0, minY: -1.1, maxX: 15, maxY: 5.5 },
  PTC_1206: { minX: -1.6, minY: -0.9, maxX: 1.6, maxY: 0.9 },
  BatteryHeader: { minX: -1.27, minY: -1.27, maxX: 1.27, maxY: 3.81 },
  PMW3610_SEIBOKU: { minX: -15, minY: -10, maxX: 15, maxY: 10 },
  SEIBOKU_JUMPER_HEADER: { minX: -1.38, minY: -1.38, maxX: 3.92, maxY: 9 },
  'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount': { minX: -1.6, minY: -1.4, maxX: 1.6, maxY: 1.4 },
  C_0603: { minX: -0.9, minY: -0.55, maxX: 0.9, maxY: 0.55 },
  R_0603: { minX: -0.9, minY: -0.55, maxX: 0.9, maxY: 0.55 },
  L_1008: { minX: -1.35, minY: -1.1, maxX: 1.35, maxY: 1.1 },
  TPS61023: { minX: -1.5, minY: -1.5, maxX: 1.5, maxY: 1.5 },
  SN74AHCT1G125: { minX: -1.5, minY: -1.5, maxX: 1.5, maxY: 1.5 },
}
// Imported keyboard libraries contain width-specific and reversible variants.
// Their pad extents are the reliable collision envelope for the initial PCB;
// the complete KiCad drawing remains in the snapshot used by the renderer.
for (const [id, snapshot] of Object.entries(FOOTPRINT_SNAPSHOTS)) {
  if (bodyBounds[id] || !snapshot.pads.length) continue
  const key = /^(MX_|Choc)/.test(id)
  const padding = key ? 1.5 : 0.5
  bodyBounds[id] = {
    minX: Math.min(...snapshot.pads.map((pad) => pad.x - pad.width / 2)) - padding,
    minY: Math.min(...snapshot.pads.map((pad) => pad.y - pad.height / 2)) - padding,
    maxX: Math.max(...snapshot.pads.map((pad) => pad.x + pad.width / 2)) + padding,
    maxY: Math.max(...snapshot.pads.map((pad) => pad.y + pad.height / 2)) + padding,
  }
}
// One pad definition for collision checks, bounds and PCB generation.
export const FOOTPRINTS: Record<string, FootprintDefinition> = Object.fromEntries(
  Object.entries(bodyBounds).map(([id, body]) => {
    const snapshot = FOOTPRINT_SNAPSHOTS[id]
    if (!snapshot) throw new Error(`Missing footprint snapshot: ${id}`)
    return [id, {
      id,
      body,
      pads: snapshot.pads,
      source: snapshot.source,
      collisionKind: id === 'MX' || id === 'ChocV1' || id === 'ChocV2' || /^(MX_|Choc)/.test(id) ? 'switch' : 'body',
    }]
  }),
)
