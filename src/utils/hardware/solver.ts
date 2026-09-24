import type { Key } from '@adamws/kle-serial'
import { CONTROLLER_RECIPES, DEVICE_RECIPES } from '@/data/hardware-recipes'
import type {
  Architecture,
  ControllerId,
  DeviceId,
  MatrixSolution,
  ResourceSolution,
  SwitchKind,
  PowerId,
  SplitSolution,
  SplitConnection,
  SplitPowerMode,
  BoardOutputMode,
} from '@/types/hardware'
import { compareIds, isMatrixKey, layoutKeyId } from './identity'
import { rotatedKeyCenterX } from './geometry'

export function solveMatrix(
  keys: Key[],
  _architecture: Architecture,
  overrides: MatrixSolution['assignments'] = {},
): MatrixSolution {
  const regular = keys
    .map((key, index) => ({ key, id: layoutKeyId(key, index) }))
    .filter(({ key }) => isMatrixKey(key))
  const assignments: MatrixSolution['assignments'] = {}
  const unassignedKeys: string[] = []
  const duplicatePositions: string[] = []
  if (!regular.length)
    return { rows: 0, columns: 0, assignments, unassignedKeys, duplicatePositions }
  // Minimum pin count first; choose the closest physical row count among ties.
  const physicalRows = new Set(regular.map(({ key }) => key.y)).size
  const candidates = Array.from({ length: regular.length }, (_, i) => ({
    rows: i + 1,
    columns: Math.ceil(regular.length / (i + 1)),
  }))
  candidates.sort(
    (a, b) =>
      a.rows + a.columns - b.rows - b.columns ||
      Math.abs(a.rows - physicalRows) - Math.abs(b.rows - physicalRows) ||
      a.rows - b.rows,
  )
  let { rows, columns } = candidates[0]!
  const manual = Object.keys(overrides).length > 0
  regular.sort((a, b) => a.key.y - b.key.y || a.key.x - b.key.x || compareIds(a.id, b.id))
  regular.forEach(({ id }, index) => {
    const position = manual
      ? overrides[id]
      : { row: Math.floor(index / columns), column: index % columns }
    if (
      !position ||
      !Number.isInteger(position.row) ||
      !Number.isInteger(position.column) ||
      position.row < 0 ||
      position.column < 0 ||
      position.row > 29 ||
      position.column > 29
    )
      unassignedKeys.push(id)
    else assignments[id] = { ...position }
  })
  if (manual) {
    rows = Math.max(-1, ...Object.values(assignments).map((p) => p.row)) + 1
    columns = Math.max(-1, ...Object.values(assignments).map((p) => p.column)) + 1
    for (const id of Object.keys(overrides))
      if (!regular.some((key) => key.id === id)) unassignedKeys.push(id)
  }
  const used = new Set<string>()
  for (const position of Object.values(assignments)) {
    const id = `${position.row},${position.column}`
    if (used.has(id)) duplicatePositions.push(id)
    used.add(id)
  }
  return { rows, columns, assignments, unassignedKeys, duplicatePositions }
}

export function solveSplit(
  keys: Key[],
  architecture: Architecture,
  connection: SplitConnection,
  boundaryX?: number,
  powerMode: SplitPowerMode = 'independent',
  boardOutputMode: BoardOutputMode = 'separate-left-right',
  controllerId?: ControllerId,
): SplitSolution {
  const xs = keys
    .filter(isMatrixKey)
    .map(rotatedKeyCenterX)
    .sort((a, b) => a - b)
  const boundary = boundaryX ?? ((xs[0] ?? 0) + (xs[xs.length - 1] ?? 0)) / 2
  return {
    connection: architecture === 'unibody' ? 'none' : connection,
    uartMode: 'tx-rx-cross',
    powerMode,
    jackRequired:
      architecture === 'wired-split' && connection === 'wired-uart' && !CONTROLLER_RECIPES[controllerId ?? 'xiao-rp2040']?.capabilities?.includes('wireless-split'),
    leftControllerId: architecture === 'wired-split' ? controllerId ?? null : null,
    rightControllerId: architecture === 'wired-split' ? controllerId ?? null : null,
    boardOutputMode,
    boundaryX: boundary,
    assignments: Object.fromEntries(
      keys.flatMap((key, index) =>
        isMatrixKey(key) ? [[layoutKeyId(key, index), rotatedKeyCenterX(key) < boundary ? 'left' : 'right']] : [],
      ),
    ),
  }
}

export function solveResources(
  controller: ControllerId,
  _switchKind: SwitchKind,
  devices: DeviceId[],
  _power: PowerId,
  matrix: MatrixSolution,
  overrides: Record<string, string>,
  reservedResources: string[] = [],
  scope?: { boardSide: 'left' | 'right'; rows: number[]; columns: number[]; deviceIndices: number[] },
): ResourceSolution {
  const result: ResourceSolution = { assignments: [], unassigned: [], conflicts: [] }
  const recipe = CONTROLLER_RECIPES[controller]
  const requests: { id: string; source: string; kind: string; preferred?: string[] }[] = []
  devices.forEach((device, index) => {
    const deviceRecipe = DEVICE_RECIPES[device]
    if (!deviceRecipe) result.unassigned.push(`${device}:${index}:unsupported`)
    else
      requests.push(
        ...deviceRecipe.signals.map((signal) => ({
          id: `${device}_${scope?.deviceIndices[index] ?? index}_${signal.id}`,
          source: device,
          kind: signal.kind,
          preferred: signal.preferred,
        })),
      )
  })
  requests.push(
    ...Array.from({ length: matrix.rows }, (_, i) => ({
      id: `ROW${scope?.rows[i] ?? i}`,
      source: 'key-matrix',
      kind: 'GPIO',
    })),
    ...Array.from({ length: matrix.columns }, (_, i) => ({
      id: `COL${scope?.columns[i] ?? i}`,
      source: 'key-matrix',
      kind: 'GPIO',
    })),
  )
  if (!recipe)
    return { ...result, unassigned: [...result.unassigned, ...requests.map((r) => r.id)] }
  const used = new Set<string>()
  // Explicit choices are reserved before bus signals and matrix auto-assignment.
  const reserved = new Set([...Object.values(overrides), ...reservedResources])
  for (const id of Object.keys(overrides).sort(compareIds))
    if (!requests.some((r) => r.id === id)) result.conflicts.push(`Unknown requirement: ${id}`)
  for (const request of requests) {
    const requirementId = request.id
    const override = overrides[requirementId]
    const capable = request.kind !== 'SPI_SDIO' || recipe.capabilities?.includes('spi-sdio')
    const free = recipe.gpioPins.filter((pin) => !used.has(pin.gpio) && !reserved.has(pin.gpio))
    const pin = capable
      ? override
        ? recipe.gpioPins.find((pin) => pin.gpio === override && !reservedResources.includes(pin.gpio))
        : (free.find((pin) => request.preferred?.includes(pin.name)) ?? free[0])
      : undefined
    if (!pin || used.has(pin.gpio)) {
      result.unassigned.push(requirementId)
      if (override)
        result.conflicts.push(
          `${requirementId}: ${override} is unavailable, reserved or already assigned`,
        )
      continue
    }
    used.add(pin.gpio)
    result.assignments.push({ requirementId, resource: pin.gpio, sourceBlock: request.source, ...(scope ? { boardSide: scope.boardSide } : {}) })
  }
  return result
}
