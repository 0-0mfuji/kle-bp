import { XIAO_PINS, XIAO_NRF52840_PINS, XIAO_NRF52840_PLUS_PINS } from './hardware-catalog'
const stroke = '(stroke (width 0) (type default))'
interface SymbolPin {
  number: string
  name: string
  x: number
  y: number
  angle: number
  type: string
}
export interface SymbolDefinition {
  name: string
  reference: string
  pins: SymbolPin[]
  graphics: string
  power?: boolean
  referenceOffsetX?: number
  hideValue?: boolean
  referenceOffsetY?: number
}
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `(polyline (pts (xy ${x1} ${y1}) (xy ${x2} ${y2})) ${stroke} (fill (type none)))`
const rect = (x1: number, y1: number, x2: number, y2: number) =>
  `(rectangle (start ${x1} ${y1}) (end ${x2} ${y2}) ${stroke} (fill (type background)))`
const passive = (number: string, name: string, x: number, angle: number): SymbolPin => ({
  number,
  name,
  x,
  y: 0,
  angle,
  type: 'passive',
})
export const symbols: SymbolDefinition[] = [
  {
    name: 'PROMICRO_ATMEGA32U4',
    reference: 'U',
    pins: [
      ...[
        'D2',
        'D3',
        'D1',
        'D0',
        'D4',
        'D5',
        'D7',
        'D8',
        'D9',
        'D10',
        'D16',
        'D14',
        'D15',
        'A0',
        'A1',
        'A2',
        'A3',
      ].map((name, index) => ({
        number: String(index + 5),
        name,
        x: -20.32,
        y: 20.32 - index * 2.54,
        angle: 0,
        type: 'bidirectional',
      })),
      { number: '3', name: 'GND', x: 20.32, y: 10.16, angle: 180, type: 'power_in' },
      { number: '4', name: 'GND', x: 20.32, y: 5.08, angle: 180, type: 'power_in' },
      { number: '22', name: 'VCC', x: 20.32, y: 0, angle: 180, type: 'power_in' },
      { number: '23', name: 'VBUS', x: 20.32, y: -5.08, angle: 180, type: 'power_in' },
      { number: '24', name: 'GND', x: 20.32, y: -10.16, angle: 180, type: 'power_in' },
    ],
    graphics: rect(-17.78, 25.4, 17.78, -15.24),
  },
  {
    name: 'TRRS_PJ320A',
    reference: 'J',
    pins: [
      { number: '1', name: 'SLEEVE_GND', x: -12.7, y: 7.62, angle: 0, type: 'passive' },
      { number: '2', name: 'RING2_VCC', x: -12.7, y: 2.54, angle: 0, type: 'passive' },
      { number: '3', name: 'RING1_UART_RX', x: -12.7, y: -2.54, angle: 0, type: 'passive' },
      { number: '4', name: 'TIP_UART_TX', x: -12.7, y: -7.62, angle: 0, type: 'passive' },
    ],
    graphics: rect(-10.16, 10.16, 10.16, -10.16),
  },
  {
    name: 'PTC',
    reference: 'F',
    pins: [passive('1', 'IN', -5.08, 0), passive('2', 'OUT', 5.08, 180)],
    graphics: rect(-2.54, 1.27, 2.54, -1.27),
  },
  {
    name: 'SW',
    reference: 'SW',
    pins: [passive('1', '1', -5.08, 0), passive('2', '2', 5.08, 180)],
    graphics: line(-2.54, 0, 2.54, 1.27) + line(2.54, 0, 2.54, 0.63),
  },
  {
    name: 'SW_SPDT',
    reference: 'SW',
    referenceOffsetY: -10.16,
    pins: [
      passive('1', '1', -5.08, 0),
      passive('2', 'COM', 5.08, 180),
      { number: '3', name: '3', x: -5.08, y: -5.08, angle: 0, type: 'passive' },
    ],
    graphics:
      line(-2.54, 1.27, 2.54, 0) + line(-2.54, 0, -2.54, 0.63) + line(-2.54, -5.08, -1.27, -5.08),
  },
  {
    name: 'D',
    reference: 'D',
    pins: [passive('1', 'K', 5.08, 180), passive('2', 'A', -5.08, 0)],
    graphics:
      `(polyline (pts (xy -1.27 -1.27) (xy 1.27 0) (xy -1.27 1.27) (xy -1.27 -1.27)) ${stroke} (fill (type none)))` +
      line(1.27, -1.27, 1.27, 1.27) +
      line(-2.54, 0, -1.27, 0) +
      line(1.27, 0, 2.54, 0),
  },
  {
    name: 'SK6812MINI_E',
    reference: 'LED',
    referenceOffsetX: -12.7,
    referenceOffsetY: -7.62,
    hideValue: true,
    pins: [
      { number: '4', name: 'DIN', x: -10.16, y: 0, angle: 0, type: 'input' },
      { number: '3', name: 'GND', x: 0, y: -10.16, angle: 90, type: 'power_in' },
      { number: '1', name: 'VDD', x: 0, y: 10.16, angle: 270, type: 'power_in' },
      { number: '2', name: 'DOUT', x: 10.16, y: 0, angle: 180, type: 'output' },
    ],
    graphics: rect(-7.62, 7.62, 7.62, -7.62),
  },
  {
    name: 'R',
    reference: 'R',
    pins: [passive('1', '1', -5.08, 0), passive('2', '2', 5.08, 180)],
    graphics: rect(-2.54, 1.27, 2.54, -1.27),
  },
  {
    name: 'C',
    reference: 'C',
    pins: [passive('1', '1', -5.08, 0), passive('2', '2', 5.08, 180)],
    graphics: line(-1.27, 2.54, -1.27, -2.54) + line(1.27, 2.54, 1.27, -2.54),
  },
  {
    name: 'L',
    reference: 'L',
    pins: [passive('1', '1', -5.08, 0), passive('2', '2', 5.08, 180)],
    graphics: rect(-2.54, 1.27, 2.54, -1.27),
  },
  {
    name: 'TPS61023',
    reference: 'U',
    referenceOffsetY: -17.78,
    pins: [
      { number: '3', name: 'VIN', x: -10.16, y: 7.62, angle: 0, type: 'power_in' },
      { number: '5', name: 'SW', x: -10.16, y: 2.54, angle: 0, type: 'passive' },
      { number: '4', name: 'GND', x: -10.16, y: -7.62, angle: 0, type: 'power_in' },
      { number: '1', name: 'FB', x: 10.16, y: -7.62, angle: 180, type: 'input' },
      { number: '2', name: 'EN', x: 10.16, y: -2.54, angle: 180, type: 'input' },
      { number: '6', name: 'VOUT', x: 10.16, y: 7.62, angle: 180, type: 'power_out' },
    ],
    graphics: rect(-7.62, 10.16, 7.62, -10.16),
  },
  {
    name: 'SN74AHCT1G125',
    reference: 'U',
    referenceOffsetY: -15.24,
    pins: [
      { number: '1', name: 'OE', x: -10.16, y: 5.08, angle: 0, type: 'input' },
      { number: '2', name: 'A', x: -10.16, y: 0, angle: 0, type: 'input' },
      { number: '3', name: 'GND', x: -10.16, y: -5.08, angle: 0, type: 'power_in' },
      { number: '4', name: 'Y', x: 10.16, y: 0, angle: 180, type: 'output' },
      { number: '5', name: 'VCC', x: 10.16, y: 5.08, angle: 180, type: 'power_in' },
    ],
    graphics: rect(-7.62, 7.62, 7.62, -7.62),
  },
  {
    name: 'XIAO_RP2040',
    referenceOffsetY: -36.83,
    reference: 'U',
    pins: [
      ...XIAO_PINS.map((pin, index) => ({
        number: pin.pad,
        name: `${pin.name}_${pin.gpio}`,
        x: -20.32,
        y: 25.4 - index * 5.08,
        angle: 0,
        type: 'bidirectional',
      })),
      { number: '12', name: '3V3', x: 20.32, y: 10.16, angle: 180, type: 'power_out' },
      { number: '13', name: 'GND', x: 20.32, y: -10.16, angle: 180, type: 'passive' },
      { number: '14', name: 'VBUS', x: 20.32, y: 20.32, angle: 180, type: 'power_out' },
    ],
    graphics: rect(-17.78, 30.48, 17.78, -30.48),
  },
  {
    name: 'XIAO_NRF52840',
    reference: 'U',
    referenceOffsetY: -36.83,
    pins: [
      ...XIAO_NRF52840_PINS.map((pin, index) => ({
        number: pin.pad,
        name: `${pin.name}_${pin.gpio}`,
        x: -20.32,
        y: 25.4 - index * 5.08,
        angle: 0,
        type: 'bidirectional',
      })),
      ...[
        ['14', 'VBUS', 'power_in'],
        ['12', '3V3', 'power_out'],
        ['19', 'VBAT', 'passive'],
        ['13', 'GND', 'passive'],
        ['18', 'GND', 'passive'],
        ['20', 'GND', 'passive'],
        ['15', 'SWDIO', 'bidirectional'],
        ['16', 'SWCLK', 'input'],
        ['17', 'RESET', 'input'],
        ['21', 'NFC1', 'bidirectional'],
        ['22', 'NFC2', 'bidirectional'],
      ].map(([number, name, type], index) => ({
        number: number!,
        name: name!,
        type: type!,
        x: 20.32,
        y: 25.4 - index * 5.08,
        angle: 180,
      })),
    ],
    graphics: rect(-17.78, 30.48, 17.78, -30.48),
  },
  {
    name: 'XIAO_NRF52840_PLUS',
    reference: 'U',
    referenceOffsetY: -52.07,
    pins: [
      ...XIAO_NRF52840_PLUS_PINS.map((pin, index) => ({
        number: pin.pad,
        name: `${pin.name}_${pin.gpio}`,
        x: -20.32,
        y: 40.64 - index * 5.08,
        angle: 0,
        type: 'bidirectional',
      })),
      ...[
        ['14', 'VBUS', 'power_out'],
        ['12', '3V3', 'power_out'],
        ['28', 'VBAT', 'passive'],
        ['13', 'GND', 'passive'],
        ['27', 'GND', 'passive'],
        ['29', 'GND', 'passive'],
        ['18', 'D14_NFC1', 'bidirectional'],
        ['19', 'D15_NFC2', 'bidirectional'],
        ['20', 'D16_BAT_ADC', 'input'],
        ['24', 'SWDIO', 'bidirectional'],
        ['25', 'SWCLK', 'input'],
        ['26', 'RESET', 'input'],
      ].map(([number, name, type], index) => ({
        number: number!,
        name: name!,
        type: type!,
        x: 20.32,
        y: 30.48 - index * 5.08,
        angle: 180,
      })),
    ],
    graphics: rect(-17.78, 45.72, 17.78, -45.72),
  },
  {
    name: 'BatteryHeader',
    reference: 'J',
    referenceOffsetY: -12.7,
    pins: [
      { number: '1', name: 'BAT+', x: -7.62, y: 2.54, angle: 0, type: 'passive' },
      { number: '2', name: 'GND', x: -7.62, y: -2.54, angle: 0, type: 'passive' },
    ],
    graphics: rect(-5.08, 5.08, 5.08, -5.08),
  },
  {
    name: 'PMW3610_SEIBOKU',
    reference: 'A',
    referenceOffsetY: -25.4,
    pins: [
      { number: '1', name: '3V3_IN', x: 20.32, y: 15.24, angle: 180, type: 'power_in' },
      { number: '2', name: 'GND', x: 20.32, y: -15.24, angle: 180, type: 'power_in' },
      { number: '3', name: 'NC', x: 20.32, y: 5.08, angle: 180, type: 'no_connect' },
      { number: '4', name: 'NC', x: 20.32, y: -5.08, angle: 180, type: 'no_connect' },
      ...[
        ['5', 'SCLK', 'input'],
        ['6', 'SDIO', 'bidirectional'],
        ['7', 'MOTION', 'output'],
        ['8', 'NCS', 'input'],
      ].map(([number, name, type], index) => ({
        number: number!,
        name: name!,
        type: type!,
        x: -20.32,
        y: 15.24 - index * 10.16,
        angle: 0,
      })),
    ],
    graphics: rect(-17.78, 20.32, 17.78, -20.32),
  },
  {
    name: 'SEIBOKU_JUMPER_HEADER',
    reference: 'J',
    referenceOffsetY: -8.9,
    pins: [
      ['1', '3V3',  -7.62,  3.81, 'passive'],
      ['3', 'NC',   -7.62,  1.27, 'passive'],
      ['5', 'SCLK', -7.62, -1.27, 'passive'],
      ['7', 'MOTION', -7.62, -3.81, 'passive'],
      ['2', 'GND',   7.62,  3.81, 'passive'],
      ['4', 'NC',    7.62,  1.27, 'passive'],
      ['6', 'SDIO',  7.62, -1.27, 'passive'],
      ['8', 'NCS',   7.62, -3.81, 'passive'],
    ].map(([number, name, x, y, type]) => ({
      number: number as string,
      name: name as string,
      x: x as number,
      y: y as number,
      angle: (x as number) < 0 ? 0 : 180,
      type: type as string,
    })),
    graphics: rect(-5.08, 5.08, 5.08, -5.08) + line(-2.54, 5.08, -2.54, -5.08) + line(2.54, 5.08, 2.54, -5.08),
  },
  {
    name: 'Rail',
    reference: '#PWR',
    power: true,
    pins: [{ number: '1', name: 'Rail', x: 0, y: 0, angle: 90, type: 'power_in' }],
    graphics: line(-1.27, 2.54, 1.27, 2.54) + line(0, 0, 0, 2.54),
  },
  {
    name: 'UsbSupply',
    reference: '#PWR',
    power: true,
    pins: [{ number: '1', name: 'VBUS', x: 0, y: 0, angle: 90, type: 'power_out' }],
    graphics: line(-1.27, 2.54, 1.27, 2.54) + line(0, 0, 0, 2.54),
  },
  {
    name: 'BatterySupply',
    reference: '#PWR',
    power: true,
    pins: [{ number: '1', name: 'VBAT', x: 0, y: 0, angle: 90, type: 'power_out' }],
    graphics: line(-1.27, 2.54, 1.27, 2.54) + line(0, 0, 0, 2.54),
  },
  {
    name: 'Ground',
    reference: '#PWR',
    power: true,
    pins: [{ number: '1', name: 'GND', x: 0, y: 0, angle: 90, type: 'power_out' }],
    graphics:
      line(0, 0, 0, -1.27) + line(-2.54, -1.27, 2.54, -1.27) + line(-1.27, -2.54, 1.27, -2.54),
  },
]

// Community package uses logical pad numbers, not the manufacturer's pin numbers.
const ledSymbol = symbols.find((symbol) => symbol.name === 'SK6812MINI_E')!
symbols.push({
  ...ledSymbol,
  name: 'SK6812MINI_E_BL',
  pins: ledSymbol.pins.map((pin) => ({
    ...pin,
    number: ({ DIN: '3', DOUT: '4', GND: '2', VDD: '1' } as Record<string, string>)[pin.name]!,
  })),
})
