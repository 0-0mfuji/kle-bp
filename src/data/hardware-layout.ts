import type { HardwareFace, HardwarePortDirection } from '@/types/hardware'

/** Physical envelopes used when hardware blocks are placed in the KLE canvas. */
export const KLE_UNIT_MM = 19.05

export type HardwarePortEdge = HardwarePortDirection
export type HardwareDirectionMode = 'insertion' | 'side' | 'operation-axis'

export interface HardwareLayoutDescriptor {
  id: string
  name: string
  shortName: string
  widthMm: number
  heightMm: number
  defaultFace: HardwareFace
  portEdge?: HardwarePortEdge
  portLabel?: string
  directionMode?: HardwareDirectionMode
  directionLabel?: string
  visualOnly?: boolean
  electricalId?: string
}

const descriptors: HardwareLayoutDescriptor[] = [
  { id: 'xiao-rp2040', name: 'XIAO RP2040', shortName: 'XIAO RP2040', widthMm: 21, heightMm: 17.5, defaultFace: 'top', portEdge: 'top', portLabel: 'USB-C', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'xiao-rp2040' },
  { id: 'xiao-nrf52840', name: 'XIAO nRF52840', shortName: 'XIAO nRF52840', widthMm: 21, heightMm: 17.5, defaultFace: 'top', portEdge: 'top', portLabel: 'USB-C', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'xiao-nrf52840' },
  { id: 'xiao-nrf52840-plus', name: 'XIAO nRF52840 Plus', shortName: 'XIAO nRF52840 Plus', widthMm: 21, heightMm: 17.5, defaultFace: 'top', portEdge: 'top', portLabel: 'USB-C', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'xiao-nrf52840-plus' },
  { id: 'promicro-atmega32u4', name: 'Pro Micro ATmega32U4', shortName: 'Pro Micro', widthMm: 34, heightMm: 18, defaultFace: 'top', portEdge: 'top', portLabel: 'USB', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'promicro-atmega32u4' },
  { id: 'ec11', name: 'EC11 encoder', shortName: 'EC11', widthMm: 15, heightMm: 12, defaultFace: 'top', portEdge: 'right', portLabel: 'shaft', directionMode: 'side', directionLabel: '軸側', electricalId: 'ec11' },
  { id: 'pmw3610', name: 'PMW3610 SEIBOKU', shortName: 'PMW3610', widthMm: 30, heightMm: 20, defaultFace: 'top', portEdge: 'top', portLabel: 'lens', directionMode: 'side', directionLabel: 'レンズ側', electricalId: 'pmw3610' },
  { id: 'seiboku-jumper-header', name: 'SEIBOKU jumper header', shortName: 'SEIBOKU J1', widthMm: 5.3, heightMm: 10.4, defaultFace: 'top', portEdge: 'top', portLabel: 'pin 1', directionMode: 'insertion', directionLabel: 'ピン1方向', electricalId: 'seiboku-jumper-header' },
  { id: 'pmw3360', name: 'PMW3360', shortName: 'PMW3360', widthMm: 18, heightMm: 18, defaultFace: 'top', portEdge: 'top', portLabel: 'lens', directionMode: 'side', directionLabel: 'レンズ側', electricalId: 'pmw3360' },
  { id: 'ssd1306-oled', name: 'SSD1306 OLED', shortName: 'SSD1306 OLED', widthMm: 27.3, heightMm: 27.3, defaultFace: 'top', portEdge: 'right', portLabel: 'header', directionMode: 'side', directionLabel: 'ピンヘッダ側', electricalId: 'ssd1306-oled' },
  { id: 'split-trrs-jack-pj320a', name: 'TRRS PJ-320A', shortName: 'TRRS', widthMm: 15, heightMm: 6.6, defaultFace: 'top', portEdge: 'right', portLabel: 'TRRS', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'split-trrs-jack-pj320a' },
  { id: 'power-switch-msk-12c02', name: 'MSK-12C02 slide switch', shortName: 'Power switch', widthMm: 9, heightMm: 5.7, defaultFace: 'top', portEdge: 'right', portLabel: 'actuator', directionMode: 'operation-axis', directionLabel: '操作方向（長辺）', electricalId: 'power-switch-msk-12c02' },
  { id: 'power-switch-alps-ssss8', name: 'Alps SSSS8 slide switch', shortName: 'Power switch', widthMm: 8.5, heightMm: 3.5, defaultFace: 'top', portEdge: 'right', portLabel: 'actuator', directionMode: 'operation-axis', directionLabel: '操作方向（長辺）', electricalId: 'power-switch-alps-ssss8' },
  { id: 'battery-connector-jst-ph-2', name: 'JST PH 2.0 2-pin', shortName: 'JST PH 2.0', widthMm: 7.4, heightMm: 8.1, defaultFace: 'top', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'battery-connector-jst-ph-2' },
  { id: 'battery-connector-jst-sh-1', name: 'JST SH 1.0 2-pin', shortName: 'JST SH 1.0', widthMm: 5.8, heightMm: 5.2, defaultFace: 'top', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', electricalId: 'battery-connector-jst-sh-1' },
  { id: 'battery-keepout-401230', name: 'LiPo 401230 keepout', shortName: 'LiPo 401230', widthMm: 30, heightMm: 12, defaultFace: 'bottom', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', visualOnly: true },
  { id: 'battery-keepout-502535', name: 'LiPo 502535 keepout', shortName: 'LiPo 502535', widthMm: 35, heightMm: 25, defaultFace: 'bottom', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', visualOnly: true },
  { id: 'battery-keepout-601730', name: 'EEMB LP601730 keepout', shortName: 'LiPo 601730', widthMm: 31, heightMm: 17.5, defaultFace: 'bottom', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', visualOnly: true },
  { id: 'battery-keepout-custom', name: 'Custom LiPo keepout', shortName: 'Custom LiPo', widthMm: 50, heightMm: 25, defaultFace: 'bottom', portEdge: 'right', portLabel: 'cable', directionMode: 'insertion', directionLabel: '差し込み方向', visualOnly: true },
]

export const HARDWARE_LAYOUTS = Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, descriptor])) as Record<string, HardwareLayoutDescriptor>
export const HARDWARE_LAYOUT_SIZES = Object.fromEntries(descriptors.map(({ id, widthMm, heightMm }) => [id, { widthMm, heightMm }])) as Record<string, { widthMm: number; heightMm: number }>
export type HardwareLayoutId = keyof typeof HARDWARE_LAYOUT_SIZES

export const hardwareLayoutDescriptor = (id: string) => HARDWARE_LAYOUTS[id]
export const hardwareSizeInMm = (id: string, custom?: { lengthMm: number; widthMm: number }) =>
  id === 'battery-keepout-custom' && custom ? { widthMm: custom.lengthMm, heightMm: custom.widthMm } : HARDWARE_LAYOUT_SIZES[id] ?? { widthMm: KLE_UNIT_MM, heightMm: KLE_UNIT_MM }
export const hardwareSizeInUnits = (id: HardwareLayoutId | string, custom?: { lengthMm: number; widthMm: number }) => {
  const size = hardwareSizeInMm(id, custom)
  return { width: size.widthMm / KLE_UNIT_MM, height: size.heightMm / KLE_UNIT_MM }
}
export const hardwareDefaultFace = (id: string): HardwareFace => HARDWARE_LAYOUTS[id]?.defaultFace ?? 'top'
export const hardwareDefaultPortDirection = (id: string): HardwarePortEdge | undefined => HARDWARE_LAYOUTS[id]?.portEdge
export const rotateHardwarePortDirection = (direction: HardwarePortDirection, angle: number): HardwarePortDirection => {
  const directions: HardwarePortDirection[] = ['top', 'right', 'bottom', 'left']
  const turns = Math.round(angle / 90)
  return directions[((directions.indexOf(direction) + turns) % directions.length + directions.length) % directions.length]!
}
export const hardwarePortDirectionForRotation = (id: string, angle: number, override?: HardwarePortDirection) => {
  const base = override ?? hardwareDefaultPortDirection(id)
  return base ? rotateHardwarePortDirection(base, angle) : undefined
}
export const hardwareArrowDirectionForRotation = (id: string, angle: number, override?: HardwarePortDirection) => {
  const direction = hardwarePortDirectionForRotation(id, angle, override)
  if (!direction || HARDWARE_LAYOUTS[id]?.directionMode !== 'insertion') return direction
  return rotateHardwarePortDirection(direction, 180)
}
export const isVisualOnlyHardwareId = (id: string) => HARDWARE_LAYOUTS[id]?.visualOnly === true
export const hardwareIdForBatteryKeepout = (profile: '401230' | '502535' | '601730' | 'custom') => profile === 'custom' ? 'battery-keepout-custom' : `battery-keepout-${profile}`
export const formatHardwareDimensions = (id: string, custom?: { lengthMm: number; widthMm: number }) => {
  const size = hardwareSizeInMm(id, custom)
  return `${size.widthMm.toFixed(1)} × ${size.heightMm.toFixed(1)} mm`
}
