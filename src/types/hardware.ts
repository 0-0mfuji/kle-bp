import type { Key } from '@adamws/kle-serial'
import type { OutlineRepairMode } from './outline'

export type VerificationLevel = 'Experimental' | 'Reviewed' | 'Verified'
export type Severity = 'ERROR' | 'WARNING' | 'INFO'
export type HardwareStep = 'layout' | 'controller' | 'validate' | 'export'
export type Architecture = 'unibody' | 'wired-split'
export type SwitchKind = 'mx' | 'choc-v1' | 'choc-v2'
export type FootprintSelection = 'auto' | string
export type SwitchMountType = 'soldered' | 'hotswap'
export type ControllerId =
  | 'xiao-rp2040'
  | 'xiao-nrf52840'
  | 'xiao-nrf52840-plus'
  | 'promicro-atmega32u4'
export type DeviceId =
  | 'ec11'
  | 'pmw3360'
  | 'pmw3610'
  | 'seiboku-jumper-header'
  | 'ssd1306-oled'
  | 'split-trrs-jack-pj320a'
  | 'split-trrs-ptc'
export type PowerId = 'usb' | 'controller-lipo'
export type SplitConnection = 'none' | 'wired-uart' | 'wireless'
export type MountSide = 'top' | 'bottom'
export type HardwareFace = 'top' | 'bottom'
export type HardwarePortDirection = 'top' | 'right' | 'bottom' | 'left'
export type ComponentFace = 'face-up' | 'face-down'
export type SplitPowerMode = 'master-distributes' | 'independent'
export type UartMode = 'tx-rx-cross'
export type BoardOutputMode = 'separate-left-right' | 'reversible'
export type BoardSide = 'left' | 'right'

export type PcbOutlineMode = 'auto-tight' | 'legacy-rect'
export type RgbLedType = 'sk6812mini-e'
export type RgbPlacementMode = 'auto' | 'manual'

export type BatteryConnectorId = 'jst-ph-2' | 'jst-sh-1' | 'direct-solder'
export type PowerSwitchId = 'msk-12c02' | 'alps-ssss8' | 'none'
export type BatteryKeepoutProfile = '401230' | '502535' | '601730' | 'custom'

export interface BatteryKeepoutSettings {
  enabled: boolean
  profile: BatteryKeepoutProfile
  lengthMm: number
  widthMm: number
  thicknessMm: number
}

export interface BatterySettings {
  connector: BatteryConnectorId
  powerSwitch: PowerSwitchId
  keepout: BatteryKeepoutSettings
}

export interface PcbSettings {
  switchFootprintId: FootprintSelection
  /** Optional footprint overrides keyed by normalized key width (for example `1`, `1.25`, `2`). */
  switchFootprintByWidth: Record<string, FootprintSelection>
  ledFootprintId: FootprintSelection
  outline: {
    mode: PcbOutlineMode
    marginMm: number
    cornerRadiusMm: number
    minimumWebWidthMm: number
    repairMode: OutlineRepairMode
    copperEdgeClearanceMm: number
  }
  mountingHoles: {
    enabled: boolean
    count: number
    drillMm: number
    edgeDistanceMm: number
  }
  stabilizers: {
    enabled: boolean
    source: 'plate'
    type: string
  }
  rgb: {
    enabled: boolean
    type: RgbLedType
    maxLedsPerSide: number
    placementMode: RgbPlacementMode
  }
}

export interface MountTransform {
  side: MountSide
  face: ComponentFace
  rotation: number
}

export interface SplitSolution {
  connection: SplitConnection
  uartMode: UartMode
  powerMode: SplitPowerMode
  jackRequired: boolean
  leftControllerId: string | null
  rightControllerId: string | null
  boardOutputMode: BoardOutputMode
  boundaryX: number
  assignments: Record<string, 'left' | 'right'>
  powerBySide?: Record<BoardSide, PowerId>
}

export interface ResourceRequirement {
  id: string
  kind: 'GPIO' | 'SPI' | 'SPI_SDIO' | 'I2C' | 'UART' | 'ADC' | 'PWM' | 'USB'
  count?: number
  preferred?: string[]
}

export interface BomItem {
  quantity: number
  reference: string
  value: string
  footprint: string
  description: string
  mpn?: string
  manufacturer?: string
  lcscPartNumber?: string
  assembly?: 'smt' | 'hand' | 'excluded'
  dnp?: boolean
  side?: MountSide
  cplRotationOffset?: number
  sourceUrl?: string
}

export interface CircuitBlock {
  id: string
  name: string
  category: 'switch' | 'controller' | 'device' | 'power'
  verification: VerificationLevel
  voltage: { min: number; max: number; nominal: number }
  requirements: ResourceRequirement[]
  provides: string[]
  footprint?: string
  symbol?: string
  bom: BomItem[]
  notes: string
  evidence?: {
    sources: string[]
    datasheetChecked: boolean
    erc: 'passed-kicad-10' | 'pending'
    hardwareTested: false
    firmwareTested: false
  }
  supported?: boolean
  power?: {
    vbusRole?: 'input' | 'output'
    vbusAvailableOnBattery?: boolean
    threeV3MaxCurrentMa?: number
    battery?: {
      chemistry: 'protected-1s-lipo'
      nominalVoltage: number
      maxVoltage: number
      minimumChargeCurrentMa: number
    }
  }
  reservedPins?: { pad: string; gpio?: string; reason: string; source: string }[]
  antennaKeepout?: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface PinAssignment {
  requirementId: string
  resource: string
  sourceBlock: string
  boardSide?: BoardSide
}

export interface HardwareIssue {
  severity: Severity
  code: string
  message: string
  fix?: string
  layoutKeyIds?: string[]
  outlineFocusMm?: { x: number; y: number }
}

export interface FootprintCatalogEntry {
  id: string
  name: string
  families: SwitchKind[]
  keyWidths: number[]
  mount: SwitchMountType
  reversible: boolean
  ledSupported: boolean
  ledSide: 'back'
  ledFootprintId?: string
  ledPinOrder?: { din: string; dout: string; gnd: string; vdd: string }
  socket?: { kind: 'kailh-hotswap'; quantityPerSwitch: number }
  verification: VerificationLevel
  source: string
  license: string
  notes: string
}

export interface MatrixSolution {
  rows: number
  columns: number
  assignments: Record<string, { row: number; column: number }>
  unassignedKeys: string[]
  duplicatePositions: string[]
}

export interface PhysicalKeepout {
  id: string
  layoutKeyId: string
  profile: BatteryKeepoutProfile
  boardSide?: BoardSide
  bounds: Bounds
  thicknessMm: number
}

export interface ResourceSolution {
  assignments: PinAssignment[]
  unassigned: string[]
  conflicts: string[]
}

export interface KeyboardHardwareModel {
  schemaVersion: 6
  kicadVersion: '9+'
  layout: { keys: Key[]; metadata: Record<string, unknown> }
  architecture: Architecture
  switch: SwitchKind
  controller: ControllerId
  devices: DeviceId[]
  power: PowerId
  split: SplitSolution
  splitPowerMode: SplitPowerMode
  boardOutputMode: BoardOutputMode
  battery: BatterySettings
  matrix: MatrixSolution
  resources: ResourceSolution
  pinOverrides: Record<string, string>
  matrixOverrides: Record<string, { row: number; column: number }>
  diodeDirection: 'COL2ROW'
  pcb: PcbSettings
  board: {
    marginMm: number
    copperEdgeClearanceMm: number
    bounds: Bounds | null
    outline: BoardOutline | null
    mountingHoles: BoardHole[]
    stabilizerHoles: BoardHole[]
    sideOutlines?: Partial<Record<BoardSide, BoardOutline | null>>
    sideMountingHoles?: Partial<Record<BoardSide, BoardHole[]>>
    sideStabilizerHoles?: Partial<Record<BoardSide, BoardHole[]>>
  }
  blocks: PlacedBlock[]
  components: HardwareComponent[]
  physicalKeepouts: PhysicalKeepout[]
  nets: HardwareNet[]
  validation: HardwareIssue[]
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
export interface BoardOutline extends Bounds {
  cornerRadiusMm: number
  rings?: import('@/utils/geometry/tight-outline').TightOutlineRing[]
  diagnostics?: import('@/utils/geometry/tight-outline').OutlineDiagnostic[]
  repairCount?: number
  repairFocusMm?: { x: number; y: number }[]
  valid?: boolean
}
export interface BoardHole {
  id: string
  x: number
  y: number
  drillMm: number
  kind: 'mounting' | 'stabilizer'
  layoutKeyId?: string
  boardSide?: BoardSide
}
export interface PlacedBlock {
  id: string
  blockId: string
  layoutKeyId: string
}
export interface HardwareComponent {
  id: string
  reference: string
  value: string
  symbol: string
  kind: 'switch' | 'diode' | 'controller' | 'power' | 'device' | 'led' | 'passive'
  blockId: string
  layoutKeyId: string
  footprint: string
  sheet: 'controller' | 'matrix' | 'power' | 'devices' | 'rgb'
  position: { x: number; y: number; rotation: number; side: 'front' | 'back' }
  boardSide?: BoardSide
  mount?: MountTransform
  bounds: Bounds
  pins: Record<string, string | null>
}

export interface Fiducial {
  id: string
  boardSide: BoardSide
  position: { x: number; y: number }
  diameterMm: number
}
export interface HardwareNet {
  name: string
  nodes: { componentId: string; pin: string }[]
}
