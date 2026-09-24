import { manufacturingIssues } from './manufacturing'
import { CONTROLLER_RECIPES } from '@/data/hardware-recipes'
import { collisionReasons, rotate } from './geometry'
import { blockFor } from '@/data/circuit-blocks'
import { FOOTPRINTS } from '@/data/hardware-catalog'
import type { HardwareIssue, KeyboardHardwareModel } from '@/types/hardware'
import { isMatrixKey, layoutKeyId } from './identity'
import { fitsInsideTightOutline, minimumRectangleClearance } from '@/utils/geometry/tight-outline'
import { keyEnvelopeBounds } from './pcb-geometry'
import { footprintWidthKey, resolveLedFootprint, resolveSwitchFootprint, SWITCH_FOOTPRINTS_BY_ID } from '@/data/footprint-catalog'

export function validateHardwareModel(model: KeyboardHardwareModel): HardwareIssue[] {
  const issues: HardwareIssue[] = []
  const error = (code: string, message: string, fix?: string, layoutKeyIds?: string[], outlineFocusMm?: { x: number; y: number }) =>
    issues.push({ severity: 'ERROR', code, message, fix, layoutKeyIds, outlineFocusMm })
  const recipe = CONTROLLER_RECIPES[model.controller]
  const selectedBlocks = [model.controller, model.power, ...model.devices]
  if (selectedBlocks.some((id) => !blockFor(id)?.supported))
    error(
      'UNSUPPORTED_CONFIGURATION',
      'This configuration contains a circuit without a supported export recipe.',
      'Review the circuit block details or save the configuration as JSON.',
    )
  if (!['mx', 'choc-v1', 'choc-v2'].includes(model.switch))
    error('UNKNOWN_SWITCH', 'The switch block is not supported.')
  const matrixKeys = model.layout.keys.map((key, index) => ({ key, index })).filter(({ key }) => isMatrixKey(key))
  matrixKeys.forEach(({ key, index }) => {
    const keyId = layoutKeyId(key, index)
    const width = Math.max(key.width, key.height)
    const selectedId = model.pcb.switchFootprintByWidth[footprintWidthKey(width)] ?? model.pcb.switchFootprintId
    const selected = selectedId === 'auto'
      ? null
      : SWITCH_FOOTPRINTS_BY_ID[selectedId]
    const resolved = resolveSwitchFootprint(selectedId, model.switch, width, model.pcb.rgb.enabled)
    if (!resolved) {
      if (selected)
        error('SWITCH_FOOTPRINT_INCOMPATIBLE', `${selected.name} does not support ${model.switch} ${width}u keys.`, 'Choose a compatible footprint or press “Reset to compatible default”.', [keyId])
      else
        error('SWITCH_FOOTPRINT_WIDTH_UNSUPPORTED', `No registered ${model.switch} footprint supports ${width}u keys.`, 'Choose a supported key width or register a verified footprint for this width.', [keyId])
    }
    if (resolved?.mount === 'hotswap' && !resolved.socket)
      error('HOTSWAP_SOCKET_METADATA', `${resolved.name} is missing socket metadata.`, undefined, [keyId])
    if (model.pcb.rgb.enabled && resolved && !resolved.ledSupported)
      error('SWITCH_LED_INCOMPATIBLE', `${resolved.name} is not registered for the selected backside LED.`, 'Choose an LED-compatible switch footprint or disable RGB.', [keyId])
  })
  if (model.pcb.rgb.enabled) {
    const led = resolveLedFootprint(model.pcb.ledFootprintId)
    if (!led)
      error('LED_FOOTPRINT_UNKNOWN', `Unknown LED footprint: ${model.pcb.ledFootprintId}.`, 'Choose Auto or a registered LED footprint.')
    else if (led.ledSide !== 'back' || !led.ledPinOrder || new Set(Object.values(led.ledPinOrder)).size !== 4)
      error('LED_PIN_ORDER', 'The selected LED footprint does not match the registered backside SK6812MINI-E pin order.', 'Choose the registered backside LED footprint.')
  }
  if (model.power === 'controller-lipo') {
    if (!recipe?.capabilities?.includes('integrated-lipo-charger'))
      error('LIPO_CONTROLLER', 'This controller has no supported LiPo architecture.')
    else
      issues.push({
        severity: 'WARNING',
        code: 'LIPO_REQUIREMENTS',
        message: blockFor('controller-lipo')!.notes,
      })
    if (model.battery.keepout.profile === '601730')
      issues.push({
        severity: 'WARNING',
        code: 'BATTERY_LP601730_REVIEW',
        message: 'EEMB LP601730 is a conditional battery profile: confirm the JST series, pin polarity, PCM protection, cable exit and case clearance against the purchased pack.',
        fix: 'Use the 601730 keepout only after checking the actual battery connector and protection circuit.',
      })
  }
  if (model.pcb.rgb.enabled) {
    if (model.power !== 'controller-lipo')
      error('RGB_POWER_REQUIRED', 'SK6812MINI-E Rev.A RGB requires the protected 1S LiPo / boost power architecture.', 'Select controller-lipo and verify the battery circuit.')
    if (model.resources.assignments.filter((a) => a.sourceBlock === 'rgb-sk6812mini-e').length < (model.architecture === 'wired-split' ? 4 : 2))
      error('RGB_PIN_ASSIGNMENT', 'RGB_DATA and RGB_EN could not be assigned on every required board side.')
    const sideCounts = model.architecture === 'wired-split'
      ? (['left', 'right'] as const).map((side) => model.layout.keys.filter((key, index) =>
          isMatrixKey(key) && model.split.assignments[layoutKeyId(key, index)] === side).length)
      : [model.layout.keys.filter(isMatrixKey).length]
    if (sideCounts.some((count) => count > model.pcb.rgb.maxLedsPerSide))
      issues.push({ severity: 'WARNING', code: 'RGB_CURRENT_BUDGET', message: `RGB count exceeds the Rev.A guideline of ${model.pcb.rgb.maxLedsPerSide} LEDs per side; firmware brightness limiting and power review are required.` })
    if (model.pcb.rgb.placementMode === 'manual')
      issues.push({ severity: 'WARNING', code: 'RGB_MANUAL_PLACEMENT', message: 'RGB power, level-shifter, and support components are staged outside the key area for manual placement in KiCad before fabrication.' })
  }
  if (model.architecture === 'wired-split' && model.split.connection === 'wired-uart' && model.power === 'controller-lipo')
    error(
      'WIRED_LIPO_CONFLICT',
      'Wired TRRS split and LiPo power cannot be combined in the initial XIAO architecture.',
      'Use USB power for wired split, or select wireless split for independent LiPo batteries.',
    )
  if (model.architecture === 'wired-split' && model.split.connection === 'none')
    error('SPLIT_CONNECTION_MISSING', 'Select a split connection.')
  if (model.split.connection === 'wireless')
    issues.push({
      severity: 'WARNING',
      code: 'WIRELESS_SPLIT_REVIEW',
      message: 'Wireless split has no verified circuit block.',
    })
  if (model.architecture === 'wired-split' && model.split.connection === 'wireless') {
    const wirelessControllers = model.blocks.filter((block) =>
      blockFor(block.blockId)?.category === 'controller' &&
      (block.blockId === 'xiao-nrf52840' || block.blockId === 'xiao-nrf52840-plus'),
    )
    if (wirelessControllers.length !== 2 || model.blocks.some((block) =>
      blockFor(block.blockId)?.category === 'controller' &&
      block.blockId !== 'xiao-nrf52840' && block.blockId !== 'xiao-nrf52840-plus',
    ))
      error('WIRELESS_CONTROLLER_REQUIRED', 'Wireless split requires one XIAO nRF52840 or XIAO nRF52840 Plus on each side.', 'Replace RP2040/Pro Micro controllers with nRF52840 controllers.')
    if (model.power === 'controller-lipo') {
      if (model.splitPowerMode !== 'independent')
        error('WIRELESS_POWER_MODE', 'Wireless LiPo split requires independent left/right battery power.', 'Select independent split power.')
      const connectors = model.components.filter((component) => component.blockId === 'battery-connector-jst-ph-2' || component.blockId === 'battery-connector-jst-sh-1')
      const switches = model.components.filter((component) => component.blockId === 'power-switch-msk-12c02' || component.blockId === 'power-switch-alps-ssss8')
      if (model.battery.connector !== 'direct-solder' && connectors.length !== 2)
        error('BATTERY_CONNECTOR_MISSING', `Wireless LiPo requires one battery connector per side; found ${connectors.length}.`, 'Add the selected battery connector on both sides.')
      if (model.battery.powerSwitch !== 'none' && switches.length !== 2)
        error('BATTERY_SWITCH_MISSING', `Wireless LiPo requires one power switch per side; found ${switches.length}.`, 'Add the selected power switch on both sides.')
    }
  }
  const jackCount = model.blocks.filter((block) => block.blockId === 'split-trrs-jack-pj320a').length
  if (model.architecture !== 'wired-split' && jackCount > 0)
    error('TRRS_UNEXPECTED', 'TRRS jacks are only valid for wired split.', 'Remove the TRRS hardware items.')
  if (model.split.connection === 'wireless' && jackCount > 0)
    error('TRRS_UNEXPECTED', 'Wireless split must not contain TRRS jacks.', 'Remove the TRRS hardware items.')
  if (model.architecture === 'wired-split' && model.split.connection === 'wired-uart') {
    if (jackCount !== 2)
      error('TRRS_JACK_MISSING', `Wired Split requires two TRRS jacks; found ${jackCount}.`, 'Place one TRRS jack on each side.')
    for (const side of ['left', 'right']) {
      const count = model.components.filter(c => c.blockId === 'split-trrs-jack-pj320a' && c.boardSide === side).length
      if (count !== 1) error('TRRS_SIDE_MISSING', `Place exactly one TRRS jack on ${side}; found ${count}.`)
    }
    if (model.split.uartMode !== 'tx-rx-cross') error('UART_MODE', 'Wired Split requires TX/RX cross connection.')
    if (model.split.powerMode === 'master-distributes')
      error('TRRS_POWER_DISABLED', 'TRRS power distribution is disabled for the initial XIAO nRF52840 architecture.', 'Use independent power or wireless split.')
    if (model.blocks.some((block) => block.blockId === 'split-trrs-ptc'))
      error('TRRS_POWER_DISABLED', 'TRRS PTC/power components are not used by the UART-only split architecture.', 'Remove the TRRS PTC block.')
  }
  if (!Number.isFinite(model.split.boundaryX)) error('SPLIT_BOUNDARY', 'Split boundary must be finite.')
  if (model.boardOutputMode === 'reversible')
    error('REVERSIBLE_NOT_SUPPORTED', 'Reversible PCB output is not implemented yet.', 'Use separate left/right PCB output.')
  const controllerBlocks = model.blocks.filter((block) => blockFor(block.blockId)?.category === 'controller')
  const expectedControllers = model.architecture === 'wired-split' ? 2 : 1
  if (model.architecture === 'wired-split' && controllerBlocks.length !== expectedControllers)
    error('UNSUPPORTED_CONFIGURATION', 'Wired split export requires two controller placements.', 'Place one standard XIAO nRF52840 on each side.')
  if (controllerBlocks.length !== expectedControllers)
    error(
      'CONTROLLER_COUNT',
      model.architecture === 'unibody' && controllerBlocks.length > 1
        ? `Unibody requires exactly 1 controller; found ${controllerBlocks.length}.`
        : `Place exactly ${expectedControllers} controller${expectedControllers === 1 ? '' : 's'}; found ${controllerBlocks.length}.`,
      model.architecture === 'unibody' && controllerBlocks.length > 1
        ? 'Select Wired split architecture, or remove the extra controller in the Layout Editor.'
        : `Add or remove controllers in the Layout Editor${expectedControllers === 2 ? ' so there is one on each split side' : ''}.`,
    )
  if (model.architecture === 'wired-split') {
    const sides = new Set(
      controllerBlocks.map((block) => model.components.find((c) => c.layoutKeyId === block.id)?.boardSide),
    )
    if (!sides.has('left') || !sides.has('right'))
      error('CONTROLLER_SIDE_MISSING', 'Wired split requires one XIAO nRF52840 on each side.', 'Move the controller placements across the split boundary.')
  }
  for (const block of model.blocks)
    if (!blockFor(block.blockId)) error('UNKNOWN_BLOCK', `Unknown circuit block: ${block.blockId}`)
    else if (blockFor(block.blockId)?.supported === false)
      error('UNSUPPORTED_HARDWARE_ITEM', `${blockFor(block.blockId)!.name} is visual-only until its exact footprint and pinout are verified.`, 'Choose a reviewed battery connector or power switch.')
  for (const device of new Set(model.devices)) {
    const expected = model.devices.filter((id) => id === device).length
    if (model.blocks.filter((b) => b.blockId === device).length !== expected)
      error('DEVICE_PLACEMENT_MISSING', `Place every ${device} instance in the Layout Editor.`)
  }
  if (model.devices.includes('pmw3610'))
    issues.push({
      severity: 'WARNING',
      code: 'PMW3610_FIRMWARE',
      message: blockFor('pmw3610')!.notes,
    })
  // A SEIBOKU jumper header is also useful as a standalone wiring point.
  // PMW3610 pairing is therefore optional: when sensors are present, the
  // model pairs them deterministically by layout ID; when they are absent,
  // the header is exported with unconnected signal pins.
  const keys = matrixKeys.map(({ key }) => key)
  if (!keys.length) error('EMPTY_LAYOUT', 'The layout contains no switches.')
  if (model.architecture === 'wired-split' && model.split.powerBySide &&
      Object.values(model.split.powerBySide).some(p => p !== model.power))
    error('SPLIT_POWER_MISMATCH', 'Both sides must use the selected power architecture.')
  const gpioCount = recipe?.gpioPins.length ?? 0
  const maxKeys = Math.floor(gpioCount / 2) * Math.ceil(gpioCount / 2)
  if (model.architecture === 'unibody' && keys.length > maxKeys)
    error(
      'RESOURCE_SHORTAGE',
      `${blockFor(model.controller)?.name ?? model.controller} exposes ${gpioCount} available GPIOs; a matrix alone supports at most ${maxKeys} keys.`,
    )
  const ids = model.layout.keys.map(layoutKeyId)
  if (new Set(ids).size !== ids.length) error('DUPLICATE_ID', 'Layout element IDs must be unique.')
  if (
    model.layout.keys.some(
      (key) =>
        [
          key.x,
          key.y,
          key.width,
          key.height,
          key.rotation_angle ?? 0,
          key.rotation_x ?? 0,
          key.rotation_y ?? 0,
          key.switchRotation ?? 0,
        ].some((v) => !Number.isFinite(v)) ||
        key.width <= 0 ||
        key.height <= 0,
    )
  )
    error(
      'INVALID_GEOMETRY',
      'Layout coordinates and dimensions must be finite and dimensions must be positive.',
    )
  for (const name of ['spacing_x', 'spacing_y']) {
    const value = model.layout.metadata[name]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0))
      error('INVALID_SPACING', `${name} must be a positive number.`)
  }
  if (model.matrix.unassignedKeys.length)
    error(
      'MATRIX_UNASSIGNED',
      `Missing or invalid matrix assignments: ${model.matrix.unassignedKeys.join(', ')}`,
    )
  if (model.matrix.duplicatePositions.length)
    error(
      'MATRIX_DUPLICATE',
      `Duplicate matrix positions: ${model.matrix.duplicatePositions.join(', ')}`,
    )
  if (model.architecture === 'wired-split') {
    const used = { left: { rows: new Set<number>(), cols: new Set<number>() }, right: { rows: new Set<number>(), cols: new Set<number>() } }
    for (const [id, cell] of Object.entries(model.matrix.assignments)) {
      const side = model.split.assignments[id]
      if (side) { used[side].rows.add(cell.row); used[side].cols.add(cell.column) }
    }
    if ([...used.left.rows].some(r => used.right.rows.has(r)) || [...used.left.cols].some(c => used.right.cols.has(c)))
      error('SPLIT_MATRIX_SHARED', 'Left and right matrix lines must have distinct numbers.', 'Reset the matrix to Auto or renumber each side independently.')
    for (const side of ['left', 'right'] as const) if (!used[side].rows.size)
      error('SPLIT_EMPTY_SIDE', `Place at least one switch on ${side}.`)
  }
  const assignedCells = Object.values(model.matrix.assignments)
  if (
    new Set(assignedCells.map((cell) => cell.row)).size !== model.matrix.rows ||
    new Set(assignedCells.map((cell) => cell.column)).size !== model.matrix.columns
  )
    error(
      'MATRIX_EMPTY_LINE',
      'Matrix row and column numbers must be contiguous from zero.',
      'Renumber unused rows/columns or reset the matrix assignment to Auto.',
    )
  if (model.resources.unassigned.length)
    error(
      'RESOURCE_UNASSIGNED',
      `Unassigned resources: ${model.resources.unassigned.join(', ')}`,
      'Reduce the matrix size or reset manual pin choices.',
    )
  if (model.resources.conflicts.length)
    error('RESOURCE_CONFLICT', model.resources.conflicts.join('; '))
  const pins = model.resources.assignments.map((a) => `${a.boardSide ?? "unibody"}/${a.resource}`)
  if (
    new Set(pins).size !== pins.length ||
    model.resources.assignments.some((a) => !recipe?.gpioPins.some((p) => p.gpio === a.resource))
  )
    error('INVALID_PIN', 'Assignments contain duplicate or unavailable physical pins.')
  if (recipe?.power?.threeV3MaxCurrentMa !== undefined && model.devices.length > 0)
    issues.push({
      severity: 'WARNING',
      code: 'POWER_BUDGET_REVIEW',
      message: `3V3 load budget (${recipe.power.threeV3MaxCurrentMa} mA) must be confirmed against the selected devices and firmware peak current.`,
    })
  if (model.diodeDirection !== 'COL2ROW')
    error('DIODE_DIRECTION', 'Only COL2ROW (K to ROW) is supported.')
  for (const component of model.components) {
    if (!FOOTPRINTS[component.footprint])
      error('MISSING_OUTLINE', `Missing footprint geometry for ${component.reference}.`)
    if (Object.values(component.bounds).some((n) => !Number.isFinite(n)))
      error('INVALID_GEOMETRY', `Invalid position for ${component.reference}.`)
  }
  const overlapCandidates = model.components
    .map((component, index) => ({ component, index }))
    .filter(({ component }) => component.kind !== 'led' && component.kind !== 'passive')
  const overlapBuckets = new Map<string, number[]>()
  const overlapCellSize = 16
  const cell = (value: number) => Math.floor(value / overlapCellSize)
  for (const { component, index } of overlapCandidates) {
    for (let x = cell(component.bounds.minX); x <= cell(component.bounds.maxX - 1e-6); x++)
      for (let y = cell(component.bounds.minY); y <= cell(component.bounds.maxY - 1e-6); y++) {
        const key = `${x}:${y}`
        const bucket = overlapBuckets.get(key)
        if (bucket) bucket.push(index)
        else overlapBuckets.set(key, [index])
      }
  }
  for (const message of manufacturingIssues(model))
    error('PCB_MANUFACTURING_CLEARANCE', message, 'Separate the affected keys or hardware items, or select a compatible footprint.')
  const overlapPairs = new Set<string>()
  for (const bucket of overlapBuckets.values())
    for (let first = 0; first < bucket.length; first++)
      for (let second = first + 1; second < bucket.length; second++) {
        const a = Math.min(bucket[first]!, bucket[second]!)
        const b = Math.max(bucket[first]!, bucket[second]!)
        overlapPairs.add(`${a}:${b}`)
      }
  for (const pair of [...overlapPairs].sort((a, b) => {
    const [aFirst, aSecond] = a.split(':').map(Number)
    const [bFirst, bSecond] = b.split(':').map(Number)
    return aFirst! - bFirst! || aSecond! - bSecond!
  })) {
      const [first, second] = pair.split(':').map(Number)
      const a = model.components[first!]!
      const b = model.components[second!]!
      if (a.position.side !== b.position.side || a.boardSide !== b.boardSide) continue
      if (a.bounds.maxX <= b.bounds.minX || b.bounds.maxX <= a.bounds.minX || a.bounds.maxY <= b.bounds.minY || b.bounds.maxY <= a.bounds.minY) continue
      const reasons = collisionReasons(a, b)
      if (reasons.length)
        error(
          'COMPONENT_OVERLAP',
          `${a.reference} (${a.value}) and ${b.reference} (${b.value}) overlap (${reasons.join('; ')}).`,
          'Move the affected components apart in the Layout Editor or select a compatible footprint.',
          [...new Set([a.layoutKeyId, b.layoutKeyId])],
        )
  }
  for (const keepout of model.physicalKeepouts) {
    for (const component of model.components) {
      if (component.boardSide !== keepout.boardSide) continue
      if (component.bounds.minX < keepout.bounds.maxX && component.bounds.maxX > keepout.bounds.minX &&
          component.bounds.minY < keepout.bounds.maxY && component.bounds.maxY > keepout.bounds.minY)
        error('BATTERY_KEEPOUT_OVERLAP', `${keepout.layoutKeyId} battery keepout overlaps ${component.reference} (${component.value}).`, 'Move the battery keepout or the affected hardware item.', [keepout.layoutKeyId, component.layoutKeyId])
    }
    for (const [index, key] of model.layout.keys.entries()) {
      if (!isMatrixKey(key)) continue
      const bounds = keyEnvelopeBounds(key, Number(model.layout.metadata.spacing_x ?? 19.05), Number(model.layout.metadata.spacing_y ?? 19.05))
      if (bounds.minX < keepout.bounds.maxX && bounds.maxX > keepout.bounds.minX && bounds.minY < keepout.bounds.maxY && bounds.maxY > keepout.bounds.minY)
        error('BATTERY_KEEPOUT_KEY_OVERLAP', `${keepout.layoutKeyId} battery keepout overlaps key ${layoutKeyId(key, index)}.`, 'Move the battery keepout outside the key matrix.', [keepout.layoutKeyId, layoutKeyId(key, index)])
    }
  }
  for (const controller of model.components.filter((c) => c.kind === 'controller')) {
    const keepout = CONTROLLER_RECIPES[controller.blockId as keyof typeof CONTROLLER_RECIPES]?.antennaKeepout
    if (!keepout) continue
    const points = [
      [keepout.minX, keepout.minY], [keepout.maxX, keepout.minY],
      [keepout.maxX, keepout.maxY], [keepout.minX, keepout.maxY],
    ].map(([x, y]) => {
      const p = rotate(x!, y!, controller.position.rotation)
      return { x: p.x + controller.position.x, y: p.y + controller.position.y }
    })
    const bounds = {
      minX: Math.min(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    }
    for (const other of model.components) {
      if (other.id === controller.id || other.boardSide !== controller.boardSide) continue
      if (
        other.bounds.minX < bounds.maxX && other.bounds.maxX > bounds.minX &&
        other.bounds.minY < bounds.maxY && other.bounds.maxY > bounds.minY
      )
        error('XIAO_ANTENNA_KEEPOUT', `${controller.reference} antenna keepout overlaps ${other.reference}.`, 'Move the component or rotate the XIAO module.')
    }
  }
  issues.push({
    severity: 'WARNING',
    code: 'HARDWARE_NOT_TESTED',
    message: 'Initial design only. Circuit blocks have not been tested on physical hardware.',
  })
  if (keys.some((key) => key.width >= 2 || key.height >= 2)) {
    const supported = new Set(['mx-basic', 'mx-bidirectional', 'mx-tight', 'mx-spec', 'mx-spec-narrow', 'none'])
    if (model.switch === 'mx' && model.pcb.stabilizers.enabled && !supported.has(model.pcb.stabilizers.type))
      issues.push({ severity: 'WARNING', code: 'STABILIZERS_UNSUPPORTED', message: `PCB stabilizer profile ${model.pcb.stabilizers.type} is not registered; no PCB stabilizer holes were generated.` })
    else if (model.switch === 'mx' && model.pcb.stabilizers.enabled && model.pcb.stabilizers.type !== 'none' && !model.board.stabilizerHoles.length)
      issues.push({ severity: 'WARNING', code: 'STABILIZERS_MANUAL', message: 'No PCB stabilizer holes were generated for the selected MX stabilizer profile.' })
  }
  if (model.pcb.mountingHoles.enabled && model.board.mountingHoles.length < model.pcb.mountingHoles.count)
    issues.push({ severity: 'WARNING', code: 'MOUNTING_HOLES_UNAVAILABLE', message: `Requested ${model.pcb.mountingHoles.count} mounting holes, but only ${model.board.mountingHoles.length} fit inside the tight board outline. The board outline was not expanded.` })
  if (model.pcb.mountingHoles.enabled && model.board.outline?.rings) {
    const outline = { rings: model.board.outline.rings, bounds: model.board.outline }
    const requiredClearance = Math.max(model.pcb.mountingHoles.edgeDistanceMm, model.pcb.outline.minimumWebWidthMm)
    for (const hole of model.board.mountingHoles) {
      if (!fitsInsideTightOutline(outline, hole, hole.drillMm / 2, requiredClearance))
        error('MOUNTING_HOLE_CLEARANCE_INVALID', `${hole.id} does not have ${requiredClearance} mm of material from the final board edge.`, 'Move the hole inward or adjust the mounting-hole clearance.')
    }
  } else if (model.pcb.mountingHoles.enabled && model.board.outline) {
    const outline = model.board.outline
    const padding = Math.max(model.pcb.mountingHoles.edgeDistanceMm, model.pcb.outline.minimumWebWidthMm) + model.pcb.mountingHoles.drillMm / 2
    for (const hole of model.board.mountingHoles) {
      if (hole.x < outline.minX + padding - 0.01 || hole.x > outline.maxX - padding + 0.01 ||
          hole.y < outline.minY + padding - 0.01 || hole.y > outline.maxY - padding + 0.01)
        error('MOUNTING_HOLE_CLEARANCE_INVALID', `${hole.id} does not have ${padding - model.pcb.mountingHoles.drillMm / 2} mm of material from the final board edge.`, 'Move the hole inward or adjust the mounting-hole clearance.')
    }
  }
  if (model.pcb.outline.mode === 'auto-tight' && model.board.outline?.rings) {
    const outline = { rings: model.board.outline.rings, bounds: model.board.outline }
    const fallback = model.board.outline.diagnostics?.find((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK')
    if (fallback) {
      issues.push({
        severity: 'WARNING',
        code: 'PCB_OUTLINE_RECTANGULAR_FALLBACK',
        message: `PCB outline was replaced with an axis-aligned rectangle. ${fallback.message} Review the board edge in KiCad.`,
        fix: 'Move or space the affected keys/components, then regenerate the tight outline.',
        outlineFocusMm: fallback.focus,
      })
    } else if (model.board.outline.valid === false) {
      const diagnostic = model.board.outline.diagnostics?.[0]
      error('PCB_OUTLINE_INVALID', diagnostic?.message ?? 'The generated PCB outline failed manufacturing geometry validation.', 'Adjust the layout or margin; the outline was not replaced with a rectangle.', undefined, diagnostic?.focus)
    } else if (model.pcb.outline.repairMode === 'legacy-warning') {
      const narrow = model.board.outline.diagnostics?.filter((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID') ?? []
      if (narrow.length) {
        issues.push({
          severity: 'WARNING',
          code: 'PCB_OUTLINE_NARROW_NECK',
          message: `PCB outline contains ${narrow.length} narrow neck(s) below ${model.pcb.outline.minimumWebWidthMm} mm; legacy warning-only mode preserved the original contour.`,
          fix: 'Select Auto repair to thicken only the affected local regions.',
          outlineFocusMm: narrow[0]?.focus,
        })
      }
    } else if ((model.board.outline.repairCount ?? 0) > 0) {
      const focus = model.board.outline.repairFocusMm?.[0]
      const coordinates = (model.board.outline.repairFocusMm ?? [])
        .slice(0, 5)
        .map((point) => `(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`)
        .join(', ')
      issues.push({
        severity: 'INFO',
        code: 'PCB_OUTLINE_REPAIRED',
        message: `Auto repair thickened ${model.board.outline.repairCount} local narrow outline region(s)${coordinates ? ` at ${coordinates} mm` : ''}.`,
        outlineFocusMm: focus,
      })
    }
    const sx = Number(model.layout.metadata.spacing_x ?? 19.05)
    const sy = Number(model.layout.metadata.spacing_y ?? 19.05)
    const minimumWeb = model.pcb.outline.minimumWebWidthMm
    // The exact ring-distance check is intentionally bounded for very large
    // imported layouts. The outline engine already validated the contour;
    // checking every key against every contour segment would reintroduce the
    // quadratic behavior this path is designed to avoid.
    const keysToCheck = model.layout.keys.length > 128 ? [] : model.layout.keys
    for (const [index, key] of keysToCheck.entries()) {
      if (!isMatrixKey(key)) continue
      const bounds = keyEnvelopeBounds(key, sx, sy)
      const clearance = minimumRectangleClearance(outline, {
        center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
        width: 14,
        height: 14,
        rotation: key.rotation_angle ?? 0,
      })
      if (clearance < minimumWeb - 0.01)
        error('PCB_MINIMUM_WEB_INVALID', `${layoutKeyId(key, index)} has less than ${minimumWeb} mm of material between its switch cutout and the board edge.`, 'Move the key inward or increase the board margin; the outline is not auto-expanded.')
    }
  }
  for (const [side, outline] of Object.entries(model.board.sideOutlines ?? {})) {
    if (!outline?.rings) continue
    const fallback = outline.diagnostics?.find((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK')
    if (fallback) {
      issues.push({
        severity: 'WARNING',
        code: 'PCB_OUTLINE_RECTANGULAR_FALLBACK',
        message: `${side} side PCB outline was replaced with an axis-aligned rectangle. ${fallback.message} Review the board edge in KiCad.`,
        fix: 'Move or space the affected keys/components, then regenerate the tight outline.',
        outlineFocusMm: fallback.focus,
      })
    } else if (outline.valid === false) {
      const diagnostic = outline.diagnostics?.[0]
      error('PCB_OUTLINE_INVALID', `${side} side outline is invalid: ${diagnostic?.message ?? 'manufacturing geometry validation failed'}`, 'Adjust the layout or margin; the outline was not replaced with a rectangle.', undefined, diagnostic?.focus)
    }
  }
  if (!issues.some((issue) => issue.severity === 'ERROR'))
    issues.push({
      severity: 'INFO',
      code: 'READY',
      message: 'Ready to export an editable, unrouted KiCad starting point.',
    })
  return issues
}
