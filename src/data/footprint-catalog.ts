import type { FootprintCatalogEntry, FootprintSelection, SwitchKind } from '@/types/hardware'
import { FOOTPRINT_SNAPSHOTS } from './footprints'

const salicylic = 'https://github.com/Salicylic-acid3/KiCAD_FootPrint/tree/9ade20b79abc7716e23f86f6b70f1b357333653c'
const license = 'salicylic-license.md'
const widths = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.75]
const mxWidths = [...widths, 3, 6.25, 7]
const mxSolderWidths = widths
const chocSnapshotWidths = [1, 1.25, 1.5, 1.75, 2, 2.25]
const ledPinOrder = { din: '3', dout: '4', gnd: '2', vdd: '1' }
const legacyLed: FootprintCatalogEntry = {
  id: 'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount',
  name: 'SK6812MINI-E (official backside reverse-mount)',
  families: ['mx', 'choc-v1', 'choc-v2'],
  keyWidths: mxWidths,
  mount: 'soldered',
  reversible: true,
  ledSupported: true,
  ledSide: 'back',
  ledPinOrder: { din: '4', dout: '2', gnd: '3', vdd: '1' },
  verification: 'Reviewed',
  source: 'https://github.com/KiCad/kicad-footprints/blob/master/LED_SMD.pretty/LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount.kicad_mod',
  license: 'kicad-license.md',
  notes: 'Official reverse-mount package; manufacturer numbering: 1=VDD, 2=DOUT, 3=GND, 4=DIN.',
}

const switchEntry = (
  id: string,
  name: string,
  families: SwitchKind[],
  keyWidths: number[],
  mount: 'soldered' | 'hotswap',
  reversible: boolean,
  ledSupported = true,
): FootprintCatalogEntry => ({
  id,
  name,
  families,
  keyWidths,
  mount,
  reversible,
  ledSupported,
  ledSide: 'back',
  verification: 'Reviewed',
  source: salicylic,
  license,
  ...(mount === 'hotswap' ? { socket: { kind: 'kailh-hotswap', quantityPerSwitch: 1 } } : {}),
  notes: !ledSupported
    ? 'Hot-swap geometry is registered, but backside LED clearance is not verified for this footprint.'
    : reversible
      ? 'Separate switch and backside LED footprints. Reversible copper/pad geometry; verify diode and LED clearance for the chosen plate.'
      : 'Separate switch and backside LED footprints. The switch footprint contains the Kailh socket pads when hot-swap is selected.',
})

export const LED_FOOTPRINT_CATALOG: FootprintCatalogEntry[] = [legacyLed, {
  id: 'LED_SK6812MINI-E_BL',
  name: 'SK6812MINI-E (backside / BL)',
  families: ['mx', 'choc-v1', 'choc-v2'],
  keyWidths: mxWidths,
  mount: 'soldered',
  reversible: true,
  ledSupported: true,
  ledSide: 'back',
  ledPinOrder,
  verification: 'Reviewed',
  source: `${salicylic.replace('/tree/', '/blob/')}/kbd_Parts.pretty/LED_SK6812MINI-E_BL.kicad_mod`,
  license,
  notes: 'Backside SMD LED. Salicylic pad labels are 1=VCC, 2=GND, 3=DIN, 4=DOUT.',
}]

export const SWITCH_FOOTPRINT_CATALOG: FootprintCatalogEntry[] = [
  switchEntry('MX', 'Cherry MX 1u soldered (legacy)', ['mx'], [1], 'soldered', false),
  ...mxSolderWidths.map((width) => switchEntry(`MX_Solder_${width}u`, `Cherry MX ${width}u soldered`, ['mx'], [width], 'soldered', false)),
  ...mxWidths.map((width) => switchEntry(`MX_Hotswap_${width}u`, `Cherry MX ${width}u Kailh hot-swap`, ['mx'], [width], 'hotswap', false)),
  ...[2, 2.25, 2.75].map((width) => switchEntry(`MX_Solder_${width}u_Rev`, `Cherry MX ${width}u soldered reversible`, ['mx'], [width], 'soldered', true)),
  ...[2, 2.25, 2.75].map((width) => switchEntry(`MX_Hotswap_${width}u_Rev`, `Cherry MX ${width}u Kailh hot-swap reversible`, ['mx'], [width], 'hotswap', true)),
  switchEntry('ChocV1', 'Kailh Choc v1 1u soldered', ['choc-v1'], [1], 'soldered', false),
  switchEntry('ChocV1V2', 'Kailh Choc v1/v2 1u soldered', ['choc-v1', 'choc-v2'], [1], 'soldered', false),
  ...chocSnapshotWidths.map((width) => switchEntry(`ChocV1V2_Hotswap_${width}u`, `Kailh Choc v1/v2 ${width}u Kailh hot-swap reversible`, ['choc-v1', 'choc-v2'], [width], 'hotswap', true, false)),
  switchEntry('ChocV2', 'Kailh Choc v2 1u soldered', ['choc-v2'], [1], 'soldered', false),
  switchEntry('ChocV2_Hotswap_1u', 'Kailh Choc v2 1u Kailh hot-swap', ['choc-v2'], [1], 'hotswap', false),
  switchEntry('ChocV2_Hotswap_2u', 'Kailh Choc v2 2u Kailh hot-swap', ['choc-v2'], [2], 'hotswap', false),
]

export const SWITCH_FOOTPRINTS_BY_ID = Object.fromEntries(
  SWITCH_FOOTPRINT_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, FootprintCatalogEntry>
export const LED_FOOTPRINTS_BY_ID = Object.fromEntries(
  LED_FOOTPRINT_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, FootprintCatalogEntry>

export const footprintWidthKey = (width: number) => String(Math.round(width * 100) / 100)

export const isSwitchFootprintAvailable = (id: string) => Boolean(FOOTPRINT_SNAPSHOTS[id])

const compatibleCache = new Map<string, FootprintCatalogEntry[]>()
const resolutionCache = new Map<string, FootprintCatalogEntry | null>()

export function compatibleSwitchFootprints(kind: SwitchKind, width: number, ledEnabled = false) {
  const key = `${kind}|${footprintWidthKey(width)}|${ledEnabled ? 'led' : 'plain'}`
  const cached = compatibleCache.get(key)
  if (cached) return cached
  const result = SWITCH_FOOTPRINT_CATALOG.filter((entry) =>
    entry.families.includes(kind) && entry.keyWidths.some((candidate) => Math.abs(candidate - width) < 0.01) &&
    (!ledEnabled || entry.ledSupported),
  ).filter((entry) => isSwitchFootprintAvailable(entry.id))
  compatibleCache.set(key, result)
  return result
}

export function resolveSwitchFootprint(
  selection: FootprintSelection,
  kind: SwitchKind,
  width: number,
  ledEnabled = false,
) {
  const cacheKey = `${selection}|${kind}|${footprintWidthKey(width)}|${ledEnabled ? 'led' : 'plain'}`
  if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey)!
  const candidates = compatibleSwitchFootprints(kind, width, ledEnabled)
  if (selection !== 'auto') {
    const entry = SWITCH_FOOTPRINTS_BY_ID[selection]
    const result = entry && candidates.some((candidate) => candidate.id === entry.id) ? entry : null
    resolutionCache.set(cacheKey, result)
    return result
  }
  const rank = (entry: FootprintCatalogEntry) => [
    entry.mount === 'hotswap' && !entry.reversible ? 0 :
      entry.mount === 'hotswap' ? 1 :
        entry.reversible ? 2 : 3,
    entry.id,
  ] as const
  const result = [...candidates].sort((left, right) => {
    const [leftRank, leftId] = rank(left)
    const [rightRank, rightId] = rank(right)
    return leftRank - rightRank || leftId.localeCompare(rightId)
  })[0] ?? null
  resolutionCache.set(cacheKey, result)
  return result
}

export function resolveLedFootprint(selection: FootprintSelection) {
  if (selection === 'auto')
    return LED_FOOTPRINT_CATALOG.find((entry) => entry.id === 'LED_SK6812MINI-E_BL') ?? LED_FOOTPRINT_CATALOG[0]!
  return LED_FOOTPRINTS_BY_ID[selection] ?? null
}
