import { placeRgb } from './manufacturing'
import { blockFor } from '@/data/circuit-blocks'
import { SWITCH_RECIPES, CONTROLLER_RECIPES, DEVICE_RECIPES } from '@/data/hardware-recipes'
import type { Key } from '@adamws/kle-serial'
import { BOARD_MARGIN_MM, DIODE_DIRECTION } from '@/data/hardware-catalog'
import type {
  Architecture,
  ControllerId,
  DeviceId,
  HardwareComponent,
  KeyboardHardwareModel,
  MatrixSolution,
  PowerId,
  SplitConnection,
  SwitchKind,
} from '@/types/hardware'
import { compareIds, ensureHardwareIds, isHardware, isMatrixKey, layoutKeyId } from './identity'
import { solveMatrix, solveResources, solveSplit } from './solver'
import { validateHardwareModel } from './validator'
import { componentBounds, rotate, rotatedKeyCenterX, round } from './geometry'
import { boardGeometry, keyEnvelopeBounds, normalizePcbSettings, stabilizerHoles } from './pcb-geometry'
import { footprintWidthKey, resolveLedFootprint, resolveSwitchFootprint } from '@/data/footprint-catalog'
import { DEFAULT_BATTERY_SETTINGS, normalizeBatterySettings, BATTERY_PARTS_BY_ID } from '@/data/battery-catalog'
import { isVisualOnlyHardwareId } from '@/data/hardware-layout'
import type { BatterySettings } from '@/types/hardware'
export { round } from './geometry'

export interface HardwareInput {
  sourceSchemaVersion?: number
  keys: Key[]
  metadata?: Record<string, unknown>
  architecture?: Architecture
  switch?: SwitchKind
  controller?: ControllerId
  devices?: DeviceId[]
  power?: PowerId
  splitConnection?: SplitConnection
  splitPowerMode?: import('@/types/hardware').SplitPowerMode
  boardOutputMode?: import('@/types/hardware').BoardOutputMode
  powerBySide?: Record<'left' | 'right', PowerId>
  boundaryX?: number
  pinOverrides?: Record<string, string>
  matrixOverrides?: MatrixSolution['assignments']
  /** Legacy projects may still need device settings while their layout is migrated. */
  legacyDevices?: DeviceId[]
  pcb?: import('@/types/hardware').PcbSettings
  battery?: BatterySettings
}
const modelValueForBattery = (id: string) => BATTERY_PARTS_BY_ID[id]?.name ?? 'LiPo 1S connector'
export function buildHardwareModel(input: HardwareInput): KeyboardHardwareModel {
  const keys: Key[] = JSON.parse(JSON.stringify(input.keys))
  ensureHardwareIds(keys)
  const metadata = JSON.parse(JSON.stringify(input.metadata ?? {}))
  const architecture = input.architecture ?? 'unibody'
  const switchKind = input.switch ?? 'mx'
  const power = input.power ?? 'usb'
  const battery = normalizeBatterySettings(input.battery ?? DEFAULT_BATTERY_SETTINGS)
  const normalizedPcb = normalizePcbSettings(input.pcb)
  const pcb = {
    ...normalizedPcb,
    switchFootprintByWidth: Object.fromEntries(
      Object.entries(normalizedPcb.switchFootprintByWidth).sort(([left], [right]) => Number(left) - Number(right)),
    ),
  }
  const ledFootprint = resolveLedFootprint(pcb.ledFootprintId)
  const switchRecipe = SWITCH_RECIPES[switchKind]
  if (!switchRecipe) throw new Error(`Unsupported switch recipe: ${switchKind}`)
  const blocks = keys.flatMap((key, index) =>
    isHardware(key)
      && !isVisualOnlyHardwareId(key.st.slice(9))
      ? [
          {
            id: layoutKeyId(key, index),
            blockId: key.st.slice(9),
            layoutKeyId: layoutKeyId(key, index),
          },
        ]
      : [],
  )
  const signalDeviceBlockIds = new Set(
    blocks
      .filter((block) => blockFor(block.blockId)?.category === 'device')
      .filter((block) => (DEVICE_RECIPES[block.blockId as DeviceId]?.signals.length ?? 0) > 0)
      .sort((a, b) => compareIds(a.id, b.id))
      .map((block) => block.id),
  )
  const signalDeviceOrdinal = new Map(
    [...signalDeviceBlockIds].map((id, index) => [id, index]),
  )
  const placedController = blocks.find(
    (block) => blockFor(block.blockId)?.category === 'controller',
  )?.blockId as ControllerId | undefined
  const controller = placedController ?? input.controller ?? 'xiao-rp2040'
  const devices = blocks
    .filter((block) => blockFor(block.blockId)?.category === 'device')
    .map((block) => block.blockId as DeviceId)
  // Only schema-v1 migration may supply devices that are not layout instances.
  // Current project formats use the layout as the source of truth; retaining
  // project.devices here creates invisible components (for example J2).
  for (const device of input.legacyDevices ?? []) if (!devices.includes(device)) devices.push(device)
  const pinOverrides = { ...input.pinOverrides }
  const matrixOverrides = JSON.parse(JSON.stringify(input.matrixOverrides ?? {}))
  const split = solveSplit(keys, architecture, input.splitConnection ?? 'none', input.boundaryX,
    input.splitPowerMode ?? 'independent', input.boardOutputMode ?? 'separate-left-right', controller)
  split.powerBySide = { left: input.powerBySide?.left ?? power, right: input.powerBySide?.right ?? power }
  const sideFor = (key: Key): 'left' | 'right' => rotatedKeyCenterX(key) < split.boundaryX ? 'left' : 'right'
  const matrix = solveMatrix(keys, architecture, matrixOverrides)
  if (architecture === 'wired-split' && !Object.keys(matrixOverrides).length) {
    const left = solveMatrix(keys.filter(k => sideFor(k) === 'left'), architecture)
    const right = solveMatrix(keys.filter(k => sideFor(k) === 'right'), architecture)
    Object.assign(matrix, {
      rows: left.rows + right.rows, columns: left.columns + right.columns,
      assignments: { ...left.assignments, ...Object.fromEntries(Object.entries(right.assignments).map(([id, p]) =>
        [id, { row: p.row + left.rows, column: p.column + left.columns }])) },
    })
  }
  const splitConnection = input.splitConnection ?? 'none'
  const reserved = architecture === 'wired-split' && splitConnection === 'wired-uart' ? ['P1.11', 'P1.12'] : []
  const resourceDevices = blocks
    .filter((block) => signalDeviceBlockIds.has(block.id))
    .sort((a, b) => compareIds(a.id, b.id))
    .map((block) => block.blockId === 'seiboku-jumper-header' ? 'pmw3610' : block.blockId as DeviceId)
  const resources = architecture === 'unibody'
    ? solveResources(
        controller,
        switchKind,
        resourceDevices,
        power,
        matrix,
        Object.fromEntries(Object.entries(pinOverrides).filter(([id]) => !['RGB_DATA', 'RGB_EN'].includes(id))),
      )
    : { assignments: [] as import('@/types/hardware').PinAssignment[], unassigned: [] as string[], conflicts: [] as string[] }
  if (architecture === 'wired-split') {
    const knownOverrides = new Set<string>()
    if (pcb.rgb.enabled) ['RGB_DATA', 'RGB_EN'].forEach((id) => knownOverrides.add(id))
    for (const boardSide of ['left', 'right'] as const) {
      const sideKeys = keys.filter(k => sideFor(k) === boardSide)
      const ids = new Set(sideKeys.map(layoutKeyId))
      const cells = Object.entries(matrix.assignments).filter(([id]) => ids.has(id)).map(([, cell]) => cell)
      const rows = [...new Set(cells.map(c => c.row))].sort((a,b) => a-b)
      const columns = [...new Set(cells.map(c => c.column))].sort((a,b) => a-b)
      const deviceBlocks = blocks.filter(b => ids.has(b.id) && signalDeviceBlockIds.has(b.id))
      const deviceIndices = deviceBlocks.map(b => signalDeviceOrdinal.get(b.id) ?? 0)
      const requirements = new Set([...rows.map(r => `ROW${r}`), ...columns.map(c => `COL${c}`),
        ...deviceBlocks.flatMap((b,i) => DEVICE_RECIPES[b.blockId as DeviceId]?.signals.map(sig => `${b.blockId === 'seiboku-jumper-header' ? 'pmw3610' : b.blockId}_${deviceIndices[i]}_${sig.id}`) ?? [])])
      const overrides = Object.fromEntries(Object.entries(pinOverrides).filter(([id]) => requirements.has(id)))
      Object.keys(overrides).forEach(id => knownOverrides.add(id))
      const result = solveResources(controller, switchKind, deviceBlocks.map(b => b.blockId as DeviceId), power,
        { ...matrix, rows: rows.length, columns: columns.length }, overrides, reserved,
        { boardSide, rows, columns, deviceIndices })
      resources.assignments.push(...result.assignments)
      resources.unassigned.push(...result.unassigned.map(id => `${boardSide}: ${id}`))
      resources.conflicts.push(...result.conflicts.map(id => `${boardSide}: ${id}`))
    }
    for (const id of Object.keys(pinOverrides)) if (!knownOverrides.has(id)) resources.conflicts.push(`Unknown requirement: ${id}`)
  }
  const assignRgbResources = (boardSide?: 'left' | 'right') => {
    if (!pcb.rgb.enabled) return
    const used = new Set(resources.assignments.filter((a) => a.boardSide === boardSide).map((a) => a.resource))
    const recipe = CONTROLLER_RECIPES[controller]
    if (!recipe) return
    for (const requirementId of ['RGB_DATA', 'RGB_EN']) {
      const override = pinOverrides[requirementId]
      const candidate = override
        ? recipe.gpioPins.find((pin) => pin.gpio === override && !used.has(pin.gpio))
        : recipe.gpioPins.find((pin) => pin.capabilities.includes('GPIO') && !used.has(pin.gpio))
      if (!candidate) {
        resources.unassigned.push(`${boardSide ?? 'unibody'}: ${requirementId}`)
        continue
      }
      used.add(candidate.gpio)
      resources.assignments.push({
        requirementId,
        resource: candidate.gpio,
        sourceBlock: 'rgb-sk6812mini-e',
        ...(boardSide ? { boardSide } : {}),
      })
    }
  }
  if (architecture === 'unibody') assignRgbResources()
  else for (const side of ['left', 'right'] as const) assignRgbResources(side)
  const components: HardwareComponent[] = []
  const sx = Number(metadata.spacing_x ?? 19.05), sy = Number(metadata.spacing_y ?? 19.05)
  const keyById = new Map(keys.map((key,index) => [layoutKeyId(key,index), key]))
  const boardSideFor = (id: string) => architecture === 'wired-split' ? sideFor(keyById.get(id)!) : undefined
  const positionFor = (key: Key): HardwareComponent['position'] => {
    const angle = key.rotation_angle ?? 0
    const originX = key.rotation_x ?? 0,
      originY = key.rotation_y ?? 0
    const rotated = rotate(
      (key.x + key.width / 2 - originX) * sx,
      (key.y + key.height / 2 - originY) * sy,
      angle,
    )
    return {
      x: round(rotated.x + originX * sx),
      y: round(rotated.y + originY * sy),
      rotation: angle + (key.switchRotation ?? 0),
      side: isHardware(key) && (key as import('./identity').HardwareKey).hardwareFace === 'bottom' ? 'back' : 'front',
    }
  }
  const add = (part: Omit<HardwareComponent, 'bounds'>) => {
    const boardSide = boardSideFor(part.layoutKeyId)
    if (boardSide) part.pins = Object.fromEntries(Object.entries(part.pins).map(([pin, net]) =>
      [pin, net && ['+3V3', 'VBUS', 'GND'].includes(net) ? `${net}_${boardSide.toUpperCase()}` : net]))
    components.push({ ...part, ...(boardSide ? { boardSide } : {}), bounds: componentBounds(part) })
  }
  const regular = keys
    .map((key, index) => ({ key, id: layoutKeyId(key, index) }))
    .filter(({ key }) => isMatrixKey(key))
    .sort((a, b) => compareIds(a.id, b.id))
  const rgbTotals = new Map<string, number>()
  const rgbCounters = new Map<string, number>()
  if (pcb.rgb.enabled) {
    for (const { id } of regular) {
      const chainSide = boardSideFor(id) ?? 'unibody'
      rgbTotals.set(chainSide, (rgbTotals.get(chainSide) ?? 0) + 1)
    }
  }
  regular.forEach(({ key, id }, index) => {
    const assignment = matrix.assignments[id]
    if (!assignment) return
    const keyPosition = positionFor(key)
    // Width-specific switch footprints have their stabilizers along local X.
    // A tall key must rotate the entire assembly, not just its extra holes.
    const position = {
      ...keyPosition,
      rotation: keyPosition.rotation + (key.height > key.width ? 90 : 0),
    }
    const keyWidth = Math.max(key.width, key.height)
    const selectedSwitch = resolveSwitchFootprint(
      pcb.switchFootprintByWidth[footprintWidthKey(keyWidth)] ?? pcb.switchFootprintId,
      switchKind,
      keyWidth,
      pcb.rgb.enabled,
    )
    const switchFootprint = selectedSwitch?.id ?? switchRecipe.footprint
    const intermediate = `SW${index + 1}_A`
    add({
      id: `${id}/switch`,
      reference: `SW${index + 1}`,
      value: switchRecipe.value,
      kind: 'switch',
      symbol: switchRecipe.symbol,
      blockId: `switch-${switchKind}`,
      layoutKeyId: id,
      footprint: switchFootprint,
      sheet: 'matrix',
      position,
      pins: { '1': `COL${assignment.column}`, '2': intermediate },
    })
    const offset = rotate(
      switchRecipe.diode.offset.x,
      switchRecipe.diode.offset.y,
      position.rotation,
    )
    add({
      id: `${id}/diode`,
      reference: `D${index + 1}`,
      value: switchRecipe.diode.value,
      kind: 'diode',
      symbol: switchRecipe.diode.symbol,
      blockId: 'key-matrix',
      layoutKeyId: id,
      footprint: switchRecipe.diode.footprint,
      sheet: 'matrix',
      position: {
        ...position,
        x: round(position.x + offset.x),
        y: round(position.y + offset.y),
        side: 'back',
      },
      pins: { '1': `ROW${assignment.row}`, '2': intermediate },
    })
    if (pcb.rgb.enabled) {
      const side = boardSideFor(id)
      const suffix = side ? `_${side.toUpperCase()}` : ''
      const chainSide = side ?? 'unibody'
      const chainIndex = rgbCounters.get(chainSide) ?? 0
      const previous = chainIndex === 0 ? `RGB_DATA_SHIFTED${suffix}` : `RGB_LED_${chainSide}_${chainIndex - 1}`
      const output = chainIndex === (rgbTotals.get(chainSide) ?? 1) - 1 ? null : `RGB_LED_${chainSide}_${chainIndex}`
      rgbCounters.set(chainSide, chainIndex + 1)
      add({
        id: `${id}/led`,
        reference: `LED${index + 1}`,
        value: 'SK6812MINI-E',
        kind: 'led',
        symbol: ledFootprint?.id === 'LED_SK6812MINI-E_BL' ? 'SK6812MINI_E_BL' : 'SK6812MINI_E',
        blockId: 'rgb-sk6812mini-e',
        layoutKeyId: id,
        footprint: ledFootprint?.id ?? 'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount',
        sheet: 'rgb',
        position: { ...position, x: round(position.x + rotate(0, -5.25, position.rotation).x), y: round(position.y + rotate(0, -5.25, position.rotation).y), side: 'back' },
        pins: {
          [ledFootprint?.ledPinOrder?.vdd ?? '1']: `RGB_5V${suffix}`,
          [ledFootprint?.ledPinOrder?.gnd ?? '3']: 'GND',
          [ledFootprint?.ledPinOrder?.din ?? '4']: previous,
          [ledFootprint?.ledPinOrder?.dout ?? '2']: output,
        },
      })
      add({
        id: `${id}/led-cap`,
        reference: `C_RGB${index + 1}`,
        value: '100nF',
        kind: 'passive',
        symbol: 'C',
        blockId: 'rgb-sk6812mini-e',
        layoutKeyId: id,
        footprint: 'C_0603',
        sheet: 'rgb',
        position: { ...position, x: round(position.x + rotate(5.5, -5.25, position.rotation).x), y: round(position.y + rotate(5.5, -5.25, position.rotation).y), side: 'back' },
        pins: { '1': `RGB_5V${suffix}`, '2': 'GND' },
      })
    }
  })
  blocks
    .filter((block) => CONTROLLER_RECIPES[block.blockId as ControllerId])
    .forEach((block, index) => {
      const recipe = CONTROLLER_RECIPES[block.blockId as ControllerId]!
      const key = keys.find((key, index) => layoutKeyId(key, index) === block.id)!
      const pins: HardwareComponent['pins'] = Object.fromEntries(
        recipe.gpioPins.map((pin) => [
          pin.pad,
          resources.assignments.find((a) => a.resource === pin.gpio && a.boardSide === boardSideFor(block.id))?.requirementId ?? null,
        ]),
      )
      for (const requirementId of ['RGB_DATA', 'RGB_EN']) {
        const assignment = resources.assignments.find((a) =>
          a.requirementId === requirementId && a.boardSide === boardSideFor(block.id),
        )
        const pin = recipe.gpioPins.find((entry) => entry.gpio === assignment?.resource)
        if (assignment && pin) {
          const suffix = boardSideFor(block.id) ? `_${boardSideFor(block.id)!.toUpperCase()}` : ''
          pins[pin.pad] = `${requirementId}${suffix}`
        }
      }
      Object.assign(pins, recipe.powerPins)
      for (const pin of recipe.unusedPins ?? []) pins[pin] = null
      const side = boardSideFor(block.id)
      const batteryNet = side ? `VBAT_${side.toUpperCase()}` : 'VBAT'
      if (recipe.batteryPin) pins[recipe.batteryPin] = power === 'controller-lipo' ? batteryNet : null
      if (architecture === 'wired-split' && splitConnection === 'wired-uart' &&
          (block.blockId === 'xiao-nrf52840' || block.blockId === 'xiao-nrf52840-plus')) {
        pins['7'] = side === 'right' ? 'UART_RING1_RIGHT' : 'UART_TIP_LEFT'
        pins['8'] = side === 'right' ? 'UART_TIP_RIGHT' : 'UART_RING1_LEFT'
      }
      add({
        id: `${block.id}/controller`,
        reference: `U${index + 1}`,
        value: recipe.value,
        kind: 'controller',
        symbol: recipe.symbol,
        blockId: block.blockId,
        layoutKeyId: block.id,
        footprint: recipe.footprint,
        sheet: 'controller',
        position: positionFor(key),
        pins,
      })
      if (power === 'controller-lipo' && recipe.batteryPin) {
        const controllerSide = side ?? 'left'
        const batteryConnectorBlockId = battery.connector === 'jst-ph-2'
          ? 'battery-connector-jst-ph-2'
          : battery.connector === 'jst-sh-1' ? 'battery-connector-jst-sh-1' : 'battery-connector-direct-solder'
        const connectorBlock = blocks.find((candidate) => candidate.blockId === batteryConnectorBlockId &&
          (architecture !== 'wired-split' || boardSideFor(candidate.id) === controllerSide))
        const switchBlock = battery.powerSwitch === 'msk-12c02'
          ? blocks.find((candidate) => candidate.blockId === 'power-switch-msk-12c02' && (architecture !== 'wired-split' || boardSideFor(candidate.id) === controllerSide))
          : battery.powerSwitch === 'alps-ssss8'
            ? blocks.find((candidate) => candidate.blockId === 'power-switch-alps-ssss8' && (architecture !== 'wired-split' || boardSideFor(candidate.id) === controllerSide))
            : undefined
        const connectorKey = connectorBlock && keyById.get(connectorBlock.id)
        const switchKey = switchBlock && keyById.get(switchBlock.id)
        const rawNet = `BAT_RAW${side ? `_${side.toUpperCase()}` : ''}`
        const switchNet = battery.powerSwitch === 'none' ? batteryNet : batteryNet
        if (connectorBlock && connectorKey && battery.connector !== 'direct-solder') {
          const part = BATTERY_PARTS_BY_ID[battery.connector]
          add({
            id: `${connectorBlock.id}/battery-connector`, reference: `J${index + 1}`,
            value: part?.name ?? 'LiPo connector', kind: 'power', symbol: 'BatteryHeader',
            blockId: connectorBlock.blockId, layoutKeyId: connectorBlock.id,
            footprint: part?.footprint ?? 'BatteryHeader', sheet: 'power', position: positionFor(connectorKey),
            pins: { '1': battery.powerSwitch !== 'none' && (switchBlock || splitConnection === 'wireless') ? rawNet : switchNet, '2': 'GND' },
          })
        } else if (!connectorBlock && battery.connector !== 'direct-solder') {
          // Legacy projects did not have a visible connector item. Preserve their old output;
          // wireless legacy projects use the selected reviewed connector footprint at a
          // deterministic fallback position until the user makes it visible in the layout.
          const position = positionFor(key)
          const offset = rotate(16, 0, position.rotation)
          const part = BATTERY_PARTS_BY_ID[battery.connector]
          add({
            id: `${block.id}/battery`, reference: `J${index + 1}`, value: modelValueForBattery(battery.connector),
            kind: 'power', symbol: 'BatteryHeader', blockId: input.sourceSchemaVersion !== undefined && input.sourceSchemaVersion < 5 ? 'controller-lipo' : battery.connector === 'jst-ph-2' ? 'battery-connector-jst-ph-2' : 'battery-connector-jst-sh-1', layoutKeyId: block.id,
            footprint: input.sourceSchemaVersion !== undefined && input.sourceSchemaVersion < 5 ? 'BatteryHeader' : (part?.footprint ?? 'BatteryHeader'), sheet: 'power', position: { ...position, x: round(position.x + offset.x), y: round(position.y + offset.y) },
            pins: { '1': battery.powerSwitch !== 'none' && splitConnection === 'wireless' ? rawNet : batteryNet, '2': 'GND' },
          })
        }
        if ((switchBlock && switchKey || splitConnection === 'wireless') && battery.powerSwitch !== 'none') {
          const part = BATTERY_PARTS_BY_ID[battery.powerSwitch]
          const switchPosition = switchKey ? positionFor(switchKey) : (() => {
            const base = positionFor(key)
            const offset = rotate(25, 0, base.rotation)
            return { ...base, x: round(base.x + offset.x), y: round(base.y + offset.y) }
          })()
          add({
            id: `${switchBlock?.id ?? block.id}/battery-switch`, reference: `SWP${index + 1}`,
            value: part?.name ?? 'LiPo power switch', kind: 'power', symbol: 'SW_SPDT',
            blockId: switchBlock?.blockId ?? (battery.powerSwitch === 'msk-12c02' ? 'power-switch-msk-12c02' : 'power-switch-alps-ssss8'), layoutKeyId: switchBlock?.id ?? block.id,
            footprint: part?.footprint ?? 'PowerSwitch_MSK12C02', sheet: 'power', position: switchPosition,
            pins: { '1': rawNet, '2': batteryNet, '3': null },
          })
        }
      }
    })
  if (pcb.rgb.enabled) {
    const controllerComponents = components.filter((component) => component.kind === 'controller')
    const manualRgbOrigin = (controllerComponent: HardwareComponent) => {
      const scopedKeys = keys
        .map((key, index) => ({ key, id: layoutKeyId(key, index) }))
        .filter(({ key, id }) => isMatrixKey(key) && (!controllerComponent.boardSide || boardSideFor(id) === controllerComponent.boardSide))
      const bounds = scopedKeys.reduce<import('@/types/hardware').Bounds | null>((current, { key }) => {
        const next = keyEnvelopeBounds(key, sx, sy)
        if (!current) return next
        return {
          minX: Math.min(current.minX, next.minX),
          minY: Math.min(current.minY, next.minY),
          maxX: Math.max(current.maxX, next.maxX),
          maxY: Math.max(current.maxY, next.maxY),
        }
      }, null)
      if (!bounds) return { x: controllerComponent.position.x + 100, y: controllerComponent.position.y + 100 }
      return {
        x: controllerComponent.boardSide === 'left' ? bounds.minX - 80 : bounds.maxX + 5,
        y: bounds.maxY + 30,
      }
    }
    controllerComponents.forEach((controllerComponent, controllerIndex) => {
      const side = controllerComponent.boardSide
      const suffix = side ? `_${side.toUpperCase()}` : ''
      const base = controllerComponent.position
      const manualOrigin = pcb.rgb.placementMode === 'manual' ? manualRgbOrigin(controllerComponent) : null
      const place = (dx: number, dy: number) => ({
        ...base,
        x: round((manualOrigin?.x ?? base.x) + dx),
        y: round((manualOrigin?.y ?? base.y) + dy),
        side: 'front' as const,
      })
      const ref = controllerIndex + 1
      const addPower = (part: Omit<HardwareComponent, 'bounds'>) => add(part)
      addPower({
        id: `${controllerComponent.id}/rgb-boost`, reference: `U_RGB${ref}`, value: 'TPS61023', kind: 'power', symbol: 'TPS61023',
        blockId: 'rgb-sk6812mini-e', layoutKeyId: controllerComponent.layoutKeyId, footprint: 'TPS61023', sheet: 'power', position: place(28, 0),
        pins: { '1': `RGB_FB${suffix}`, '2': `RGB_EN${suffix}`, '3': `VBAT${suffix}`, '4': `GND${suffix}`, '5': `RGB_SW${suffix}`, '6': `RGB_5V${suffix}` },
      })
      addPower({
        id: `${controllerComponent.id}/rgb-level-shifter`, reference: `U_LS${ref}`, value: 'SN74AHCT1G125', kind: 'power', symbol: 'SN74AHCT1G125',
        blockId: 'rgb-sk6812mini-e', layoutKeyId: controllerComponent.layoutKeyId, footprint: 'SN74AHCT1G125', sheet: 'power', position: place(43, 0),
        pins: { '1': `GND${suffix}`, '2': `RGB_DATA${suffix}`, '3': `GND${suffix}`, '4': `RGB_SHIFTED${suffix}`, '5': `RGB_5V${suffix}` },
      })
      const passives: Array<{ id: string; reference: string; value: string; footprint: string; dx: number; dy: number; pins: Record<string, string | null> }> = [
        { id: 'ls-decoupling', reference: `C_LS${ref}`, value: '100nF', footprint: 'C_0603', dx: 43, dy: 6, pins: { '1': `RGB_5V${suffix}`, '2': `GND${suffix}` } },
        { id: 'inductor', reference: `L_RGB${ref}`, value: '1uH', footprint: 'L_1008', dx: 35, dy: -12, pins: { '1': `VBAT${suffix}`, '2': `RGB_SW${suffix}` } },
        { id: 'cin', reference: `C_RGB_IN${ref}`, value: '10uF', footprint: 'C_0603', dx: 25, dy: 12, pins: { '1': `VBAT${suffix}`, '2': `GND${suffix}` } },
        { id: 'cout1', reference: `C_RGB_OUT1_${ref}`, value: '22uF', footprint: 'C_0603', dx: 35, dy: 12, pins: { '1': `RGB_5V${suffix}`, '2': `GND${suffix}` } },
        { id: 'cout2', reference: `C_RGB_OUT2_${ref}`, value: '22uF', footprint: 'C_0603', dx: 45, dy: 12, pins: { '1': `RGB_5V${suffix}`, '2': `GND${suffix}` } },
        { id: 'bulk', reference: `C_RGB_BULK${ref}`, value: '100uF', footprint: 'C_0603', dx: 55, dy: 12, pins: { '1': `RGB_5V${suffix}`, '2': `GND${suffix}` } },
        { id: 'rfb-top', reference: `R_RGB_FB_TOP${ref}`, value: '732k', footprint: 'R_0603', dx: 55, dy: -12, pins: { '1': `RGB_5V${suffix}`, '2': `RGB_FB${suffix}` } },
        { id: 'rfb-bot', reference: `R_RGB_FB_BOT${ref}`, value: '100k', footprint: 'R_0603', dx: 65, dy: -12, pins: { '1': `RGB_FB${suffix}`, '2': `GND${suffix}` } },
        { id: 'en-pd', reference: `R_RGB_EN_PD${ref}`, value: '100k', footprint: 'R_0603', dx: 75, dy: -12, pins: { '1': `RGB_EN${suffix}`, '2': `GND${suffix}` } },
        { id: 'data-series', reference: `R_RGB_DATA${ref}`, value: '220R', footprint: 'R_0603', dx: 55, dy: 0, pins: { '1': `RGB_SHIFTED${suffix}`, '2': `RGB_DATA_SHIFTED${suffix}` } },
      ]
      passives.forEach((passive, index) => addPower({
        id: `${controllerComponent.id}/rgb-${passive.id}`,
        reference: passive.reference,
        value: passive.value,
        kind: 'passive',
        symbol: passive.footprint.startsWith('C_') ? 'C' : passive.footprint.startsWith('L_') ? 'L' : 'R',
        blockId: 'rgb-sk6812mini-e',
        layoutKeyId: controllerComponent.layoutKeyId,
        footprint: passive.footprint,
        sheet: 'power',
        position: place(passive.dx, passive.dy + index * 0.01),
        pins: passive.pins,
      }))
    })
  }
  const headerReferenceBase = components.filter((component) => /^J\d+$/.test(component.reference)).length
  let deviceIndex = 0
  for (const block of blocks.filter((b) => blockFor(b.blockId)?.category === 'device')) {
    const index = signalDeviceOrdinal.get(block.id) ?? deviceIndex
    if ((DEVICE_RECIPES[block.blockId as DeviceId]?.signals.length ?? 0) > 0) deviceIndex++
    const recipe = DEVICE_RECIPES[block.blockId as DeviceId]
    if (!recipe) continue
    const key = keys.find((key, index) => layoutKeyId(key, index) === block.id)!
    add({
      id: `${block.id}/device`,
      reference: block.blockId === 'seiboku-jumper-header' ? `J${headerReferenceBase + blocks.filter((candidate) => candidate.blockId === 'seiboku-jumper-header').indexOf(block) + 1}` : `A${index + 1}`,
      value: recipe.value,
      kind: 'device',
      symbol: recipe.symbol,
      blockId: block.blockId,
      layoutKeyId: block.id,
      footprint: recipe.footprint,
      sheet: block.blockId === 'seiboku-jumper-header' ? 'controller' : 'devices',
      position: positionFor(key),
      pins: {
        ...recipe.powerPins,
        ...Object.fromEntries(recipe.unusedPins.map((pad) => [pad, null])),
        ...(block.blockId === 'split-trrs-jack-pj320a'
          ? { '1': 'GND', '2': null, '3': `UART_RING1_${boardSideFor(block.id)?.toUpperCase()}`, '4': `UART_TIP_${boardSideFor(block.id)?.toUpperCase()}` }
          : block.blockId === 'split-trrs-ptc'
            ? { '1': 'VCC_IN', '2': 'VCC_OUT' }
            : {}),
        ...Object.fromEntries(recipe.signals.map((signal) => [signal.pad, `${block.blockId === 'seiboku-jumper-header' ? 'pmw3610' : block.blockId}_${index}_${signal.id}`])),
      },
    })
  }
  const rgbPlacementFailures = pcb.rgb.enabled ? placeRgb(components,
    stabilizerHoles(keys, sx, sy, split, undefined, pcb, switchKind).map(hole => ({
      ...hole, boardSide: hole.layoutKeyId ? boardSideFor(hole.layoutKeyId) : undefined,
    })),
  ) : []
  components.sort((a, b) => compareIds(a.id, b.id))
  const names = [
    ...new Set(
      components.flatMap((c) => Object.values(c.pins).filter((n): n is string => n !== null)),
    ),
  ].sort(compareIds)
  const nets = names.map((name) => ({
    name,
    nodes: components.flatMap((c) =>
      Object.entries(c.pins)
        .filter(([, net]) => net === name)
        .map(([pin]) => ({ componentId: c.id, pin })),
    ),
  }))
  const physicalKeepouts = keys.flatMap((key, index) => {
    if (!isHardware(key)) return []
    const hardwareId = key.st.slice(9)
    if (!isVisualOnlyHardwareId(hardwareId)) return []
    const profile: import('@/types/hardware').BatteryKeepoutProfile = hardwareId.endsWith('401230') ? '401230' : hardwareId.endsWith('502535') ? '502535' : hardwareId.endsWith('601730') ? '601730' : 'custom'
    const widthMm = key.width * sx
    const heightMm = key.height * sy
    const center = positionFor(key)
    const points = [
      rotate(-widthMm / 2, -heightMm / 2, center.rotation),
      rotate(widthMm / 2, -heightMm / 2, center.rotation),
      rotate(widthMm / 2, heightMm / 2, center.rotation),
      rotate(-widthMm / 2, heightMm / 2, center.rotation),
    ].map((point) => ({ x: point.x + center.x, y: point.y + center.y }))
    return [{
      id: `${layoutKeyId(key, index)}/keepout`, layoutKeyId: layoutKeyId(key, index), profile,
      boardSide: boardSideFor(layoutKeyId(key, index)),
      bounds: { minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)), maxX: Math.max(...points.map((point) => point.x)), maxY: Math.max(...points.map((point) => point.y)) },
      thicknessMm: profile === '502535' ? 5 : profile === '601730' ? 6.3 : profile === '401230' ? 4 : battery.keepout.thicknessMm,
    }]
  })
  const globalGeometry = boardGeometry({
    keys,
    components,
    split,
    settings: pcb,
    switchKind,
    spacingX: sx,
    spacingY: sy,
  })
  const sideGeometries = architecture === 'wired-split'
    ? {
        left: boardGeometry({ keys, components, split, settings: pcb, switchKind, spacingX: sx, spacingY: sy, side: 'left' }),
        right: boardGeometry({ keys, components, split, settings: pcb, switchKind, spacingX: sx, spacingY: sy, side: 'right' }),
      }
    : undefined
  const model: KeyboardHardwareModel = {
    schemaVersion: 6,
    kicadVersion: '9+',
    layout: { keys, metadata },
    architecture,
    switch: switchKind,
    controller,
    devices,
    power,
    battery,
    split,
    splitPowerMode: input.splitPowerMode ?? 'independent',
    boardOutputMode: input.boardOutputMode ?? 'separate-left-right',
    matrix,
    resources,
    pinOverrides,
    matrixOverrides,
    diodeDirection: DIODE_DIRECTION,
    pcb,
    board: {
      marginMm: pcb.outline.mode === 'legacy-rect' ? BOARD_MARGIN_MM : pcb.outline.marginMm,
      copperEdgeClearanceMm: pcb.outline.copperEdgeClearanceMm,
      bounds: globalGeometry.outline,
      outline: globalGeometry.outline,
      mountingHoles: globalGeometry.mountingHoles,
      stabilizerHoles: globalGeometry.stabilizerHoles,
      ...(sideGeometries ? {
        sideOutlines: { left: sideGeometries.left.outline, right: sideGeometries.right.outline },
        sideMountingHoles: { left: sideGeometries.left.mountingHoles, right: sideGeometries.right.mountingHoles },
        sideStabilizerHoles: { left: sideGeometries.left.stabilizerHoles, right: sideGeometries.right.stabilizerHoles },
      } : {}),
    },
    blocks,
    components,
    physicalKeepouts,
    nets,
    validation: [],
  }
  model.validation = validateHardwareModel(model)
  for (const reference of rgbPlacementFailures)
    model.validation.push({ severity: 'ERROR', code: 'RGB_PLACEMENT_UNAVAILABLE', message: `${reference}: no clearance-safe placement is available around this key.`, fix: 'Increase key spacing or select a compatible switch/LED footprint.' })
  return model
}
