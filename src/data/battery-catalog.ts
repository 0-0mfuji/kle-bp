import type { BatteryConnectorId, BatteryKeepoutProfile, BatterySettings, PowerSwitchId, VerificationLevel } from '@/types/hardware'

export interface BatteryPartCatalogEntry {
  id: BatteryConnectorId | PowerSwitchId
  name: string
  category: 'connector' | 'power-switch'
  footprint: string | null
  pinOrder?: Record<string, string>
  verification: VerificationLevel
  source: string
  license: string
  notes: string
}

export const BATTERY_PART_CATALOG: BatteryPartCatalogEntry[] = [
  {
    id: 'jst-ph-2', name: 'JST PH 2.0 2-pin', category: 'connector', footprint: 'BatteryConnector_JST_PH2',
    pinOrder: { '1': 'BAT_RAW', '2': 'GND' }, verification: 'Reviewed',
    source: 'https://github.com/KiCad/kicad-footprints/blob/master/Connector_JST.pretty/JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal.kicad_mod', license: 'kicad-license.md',
    notes: 'Horizontal JST PH connector; pin 1 is battery positive and pin 2 is battery ground.',
  },
  {
    id: 'jst-sh-1', name: 'JST SH 1.0 2-pin', category: 'connector', footprint: 'BatteryConnector_JST_SH1',
    pinOrder: { '1': 'BAT_RAW', '2': 'GND' }, verification: 'Reviewed',
    source: 'https://github.com/KiCad/kicad-footprints/blob/master/Connector_JST.pretty/JST_SH_BM02B-SRSS-TB_1x02-1MP_P1.00mm_Vertical.kicad_mod', license: 'kicad-license.md',
    notes: 'Vertical JST SH connector; verify the selected cable keying and battery polarity.',
  },
  {
    id: 'msk-12c02', name: 'MSK-12C02 slide switch', category: 'power-switch', footprint: 'PowerSwitch_MSK12C02',
    pinOrder: { '1': 'BAT_RAW', '2': 'BAT_SW', '3': 'NC' }, verification: 'Reviewed',
    source: 'https://github.com/KiCad/kicad-footprints/blob/master/Button_Switch_SMD.pretty/SW_SPDT_Shouhan_MSK12C02.kicad_mod', license: 'kicad-license.md',
    notes: 'Use pins 1 and 2 as the battery power path; pin 3 is intentionally not connected.',
  },
  {
    id: 'alps-ssss8', name: 'Alps SSSS8 slide switch', category: 'power-switch', footprint: null,
    pinOrder: { '1': 'BAT_RAW', '2': 'BAT_SW' }, verification: 'Experimental',
    source: 'https://tech.alpsalpine.com/e/products/detail/SSSS8/', license: 'manufacturer-terms',
    notes: 'Visual catalog entry only until the exact SSSS8 variant and KiCad footprint are pinned and reviewed.',
  },
  {
    id: 'direct-solder', name: 'Direct solder to battery pads', category: 'connector', footprint: null,
    pinOrder: { '1': 'BAT_RAW', '2': 'GND' }, verification: 'Reviewed',
    source: 'https://wiki.seeedstudio.com/XIAO_BLE/', license: 'manufacturer-terms',
    notes: 'No connector footprint is placed; battery wires terminate at the selected power switch and controller pads.',
  },
]

export const BATTERY_PARTS_BY_ID = Object.fromEntries(BATTERY_PART_CATALOG.map((entry) => [entry.id, entry])) as Record<string, BatteryPartCatalogEntry>

export const DEFAULT_BATTERY_SETTINGS: BatterySettings = {
  connector: 'jst-ph-2',
  powerSwitch: 'msk-12c02',
  keepout: { enabled: false, profile: '401230', lengthMm: 30, widthMm: 12, thicknessMm: 4 },
}

const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

export function normalizeBatterySettings(value: unknown): BatterySettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const keepout = raw.keepout && typeof raw.keepout === 'object' ? raw.keepout as Record<string, unknown> : {}
  const connector = raw.connector === 'jst-sh-1' || raw.connector === 'direct-solder' ? raw.connector : DEFAULT_BATTERY_SETTINGS.connector
  const powerSwitch = raw.powerSwitch === 'alps-ssss8' || raw.powerSwitch === 'none' ? raw.powerSwitch : DEFAULT_BATTERY_SETTINGS.powerSwitch
  const profile: BatteryKeepoutProfile = keepout.profile === '502535' || keepout.profile === '601730' || keepout.profile === 'custom' ? keepout.profile : DEFAULT_BATTERY_SETTINGS.keepout.profile
  const preset = profile === '502535' ? { lengthMm: 35, widthMm: 25, thicknessMm: 5 } : profile === '601730' ? { lengthMm: 31, widthMm: 17.5, thicknessMm: 6.3 } : profile === '401230' ? { lengthMm: 30, widthMm: 12, thicknessMm: 4 } : DEFAULT_BATTERY_SETTINGS.keepout
  return {
    connector,
    powerSwitch,
    keepout: {
      enabled: keepout.enabled === true,
      profile,
      lengthMm: numberOr(keepout.lengthMm, preset.lengthMm),
      widthMm: numberOr(keepout.widthMm, preset.widthMm),
      thicknessMm: numberOr(keepout.thicknessMm, preset.thicknessMm),
    },
  }
}
