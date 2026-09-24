import {
  PROMICRO_PINS,
  XIAO_PINS,
  XIAO_NRF52840_PINS,
  XIAO_NRF52840_PLUS_PINS,
} from './hardware-catalog'
import type { ControllerId, DeviceId, SwitchKind } from '@/types/hardware'

/** Declarative package choices; electrical topology belongs to the matrix block. */
export interface SwitchRecipe {
  footprint: string
  symbol: string
  value: string
  diode: { symbol: string; footprint: string; value: string; offset: { x: number; y: number } }
}
export const SWITCH_RECIPES: Record<SwitchKind, SwitchRecipe> = {
  mx: {
    footprint: 'MX',
    symbol: 'SW',
    value: 'MX',
    diode: { symbol: 'D', footprint: 'SOD123', value: '1N4148W', offset: { x: 0, y: 5 } },
  },
  'choc-v1': {
    footprint: 'ChocV1',
    symbol: 'SW',
    value: 'Choc v1',
    diode: { symbol: 'D', footprint: 'SOD123', value: '1N4148W', offset: { x: 0, y: -5 } },
  },
  'choc-v2': {
    footprint: 'ChocV2',
    symbol: 'SW',
    value: 'Choc v2',
    diode: { symbol: 'D', footprint: 'SOD123', value: '1N4148W', offset: { x: 0, y: -5 } },
  },
}

export interface ControllerRecipe {
  footprint: string
  symbol: string
  value: string
  gpioPins: ReadonlyArray<{
    name: string
    gpio: string
    pad: string
    capabilities: string[]
  }>
  powerPins: Record<string, string>
  unusedPins?: string[]
  batteryPin?: string
  capabilities?: string[]
  reservedPins?: { pad: string; gpio?: string; reason: string; source: string }[]
  power?: {
    vbusRole: 'input' | 'output'
    vbusAvailableOnBattery: boolean
    threeV3MaxCurrentMa: number
    battery?: {
      chemistry: 'protected-1s-lipo'
      nominalVoltage: number
      maxVoltage: number
      minimumChargeCurrentMa: number
    }
  }
  antennaKeepout?: { minX: number; minY: number; maxX: number; maxY: number }
}
export const CONTROLLER_RECIPES: Partial<Record<ControllerId, ControllerRecipe>> = {
  'xiao-rp2040': {
    footprint: 'XIAO_RP2040',
    symbol: 'XIAO_RP2040',
    value: 'XIAO RP2040',
    gpioPins: XIAO_PINS,
    powerPins: { '12': '+3V3', '13': 'GND', '14': 'VBUS' },
    capabilities: ['spi-sdio'],
  },
  'xiao-nrf52840-plus': {
    footprint: 'XIAO_NRF52840_PLUS',
    symbol: 'XIAO_NRF52840_PLUS',
    value: 'XIAO nRF52840 Plus (SMD)',
    gpioPins: XIAO_NRF52840_PLUS_PINS,
    powerPins: { '12': '+3V3', '13': 'GND', '14': 'VBUS', '27': 'GND', '29': 'GND' },
    unusedPins: ['18', '19', '20', '24', '25', '26'],
    batteryPin: '28',
    capabilities: ['integrated-lipo-charger', 'wireless-split', 'spi-sdio'],
  },
  'xiao-nrf52840': {
    footprint: 'XIAO_NRF52840',
    symbol: 'XIAO_NRF52840',
    value: 'XIAO nRF52840 (SMD)',
    gpioPins: XIAO_NRF52840_PINS,
    powerPins: { '12': '+3V3', '13': 'GND', '14': 'VBUS', '18': 'GND', '20': 'GND' },
    unusedPins: ['15', '16', '17', '21', '22'],
    batteryPin: '19',
    capabilities: ['integrated-lipo-charger', 'wireless-split', 'spi-sdio'],
    reservedPins: [
      { pad: '21', gpio: 'P0.09', reason: 'NFC1 / internal module function', source: 'Seeed XIAO nRF52840 Wiki' },
      { pad: '22', gpio: 'P0.10', reason: 'NFC2 / internal module function', source: 'Seeed XIAO nRF52840 Wiki' },
      { pad: '17', gpio: 'P0.18', reason: 'RESET', source: 'Seeed XIAO nRF52840 schematic' },
      { pad: '15', reason: 'SWDIO / internal debug', source: 'Seeed XIAO nRF52840 schematic' },
      { pad: '16', reason: 'SWCLK / internal debug', source: 'Seeed XIAO nRF52840 schematic' },
    ],
    power: {
      vbusRole: 'input',
      vbusAvailableOnBattery: false,
      threeV3MaxCurrentMa: 200,
      battery: {
        chemistry: 'protected-1s-lipo',
        nominalVoltage: 3.7,
        maxVoltage: 4.2,
        minimumChargeCurrentMa: 100,
      },
    },
    // Carrier copper exclusion beneath and beyond the BLE antenna end (opposite USB).
    // Stops before the two NFC solder pads; does not waive the case/metal RF review.
    antennaKeepout: { minX: -6.5, minY: 8.8, maxX: 2.5, maxY: 14.5 },
  },
  'promicro-atmega32u4': {
    footprint: 'ProMicro_ATmega32U4',
    symbol: 'PROMICRO_ATMEGA32U4',
    value: 'Pro Micro ATmega32U4 5V/16MHz',
    gpioPins: PROMICRO_PINS,
    powerPins: { '3': 'GND', '4': 'GND', '22': 'VCC', '23': 'VBUS', '24': 'GND' },
    capabilities: ['usb-on-module', 'uart', 'spi', 'i2c', 'adc', 'pwm'],
  },
}

export interface DeviceRecipe {
  footprint: string
  symbol: string
  value: string
  powerPins: Record<string, string>
  unusedPins: string[]
  signals: { id: string; pad: string; kind: 'GPIO' | 'SPI_SDIO'; preferred?: string[] }[]
}
export const DEVICE_RECIPES: Partial<Record<DeviceId, DeviceRecipe>> = {
  'split-trrs-jack-pj320a': {
    footprint: 'TRRS_PJ320A',
    symbol: 'TRRS_PJ320A',
    value: 'PJ-320A TRRS',
    powerPins: {},
    unusedPins: [],
    signals: [],
  },
  'split-trrs-ptc': {
    footprint: 'PTC_1206',
    symbol: 'PTC',
    value: 'PTC TBD',
    powerPins: {},
    unusedPins: [],
    signals: [],
  },
  pmw3610: {
    footprint: 'PMW3610_SEIBOKU',
    symbol: 'PMW3610_SEIBOKU',
    value: 'PMW3610 SEIBOKU',
    powerPins: { '1': '+3V3', '2': 'GND' },
    unusedPins: ['3', '4'],
    signals: [
      { id: 'SCLK', pad: '5', kind: 'SPI_SDIO', preferred: ['D8'] },
      { id: 'SDIO', pad: '6', kind: 'SPI_SDIO', preferred: ['D10'] },
      { id: 'MOTION', pad: '7', kind: 'GPIO' },
      { id: 'NCS', pad: '8', kind: 'GPIO' },
    ],
  },
  'seiboku-jumper-header': {
    footprint: 'SEIBOKU_JUMPER_HEADER',
    symbol: 'SEIBOKU_JUMPER_HEADER',
    value: 'SEIBOKU / jumper wires',
    powerPins: { '1': '+3V3', '2': 'GND' },
    unusedPins: ['3', '4'],
    // The header is the external PMW3610 connection point. It therefore owns
    // the same SPI/CS/MOTION requirements as the sensor, even when the sensor
    // is not represented as a separate Layout Editor item.
    signals: [
      { id: 'SCLK', pad: '5', kind: 'SPI_SDIO', preferred: ['D8'] },
      { id: 'SDIO', pad: '6', kind: 'SPI_SDIO', preferred: ['D10'] },
      { id: 'MOTION', pad: '7', kind: 'GPIO' },
      { id: 'NCS', pad: '8', kind: 'GPIO' },
    ],
  },
}
