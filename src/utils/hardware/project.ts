import { Key, KeyboardMetadata } from '@adamws/kle-serial'
import type {
  Architecture,
  ControllerId,
  DeviceId,
  MatrixSolution,
  PowerId,
  SplitConnection,
  SplitPowerMode,
  BoardOutputMode,
  SwitchKind,
} from '@/types/hardware'
import type { HardwareInput } from './model'
import { ensureHardwareIds, isHardware } from './identity'
import { normalizePcbSettings } from './pcb-geometry'
import { normalizeBatterySettings } from '@/data/battery-catalog'
import { hardwareDefaultFace, hardwareDefaultPortDirection, hardwareSizeInUnits } from '@/data/hardware-layout'

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object.`)
  if (Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
    throw new Error(`Invalid ${name} property.`)
  return value as Record<string, unknown>
}
function choice<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    throw new Error(`Invalid ${name}.`)
  return value as T
}
/** Validate completely before touching any editor/store state. Derived graph is always rebuilt. */
export function parseHardwareProject(value: unknown): HardwareInput {
  // Check all nested data before cloning/serializing it; reject pollution keys and pathological depth.
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const current = pending.pop()!
    if (++nodes > 200000 || current.depth > 40) throw new Error('Project structure is too large or too deeply nested.')
    if (typeof current.value === 'string' && current.value.length > 100000) throw new Error('Project string is too long.')
    if (current.value && typeof current.value === 'object') {
      for (const [key, child] of Object.entries(current.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid project property.')
        pending.push({ value: child, depth: current.depth + 1 })
      }
    }
  }
  const project = record(value, 'Project')
  const schemaVersion = project.schemaVersion
  if (typeof schemaVersion !== 'number' || ![1, 2, 3, 4, 5, 6].includes(schemaVersion))
    throw new Error('Unsupported project schema version.')
  const layout = record(project.layout, 'Layout')
  if (!Array.isArray(layout.keys) || layout.keys.length > 1000)
    throw new Error('Layout must contain an array of at most 1000 elements.')
  const metadata = record(layout.metadata ?? {}, 'Metadata')
  for (const name of ['spacing_x', 'spacing_y'])
    if (
      metadata[name] !== undefined &&
      (typeof metadata[name] !== 'number' ||
        !Number.isFinite(metadata[name]) ||
        metadata[name] <= 0)
    )
      throw new Error(`Invalid ${name}.`)
  const defaultMetadata = new KeyboardMetadata()
  for (const name of Object.keys(defaultMetadata)) {
    if (
      metadata[name] !== undefined &&
      typeof defaultMetadata[name] === 'string' &&
      typeof metadata[name] !== 'string'
    )
      throw new Error(`Invalid metadata ${name}.`)
  }
  if (metadata.css !== undefined && typeof metadata.css !== 'string')
    throw new Error('Invalid metadata CSS.')
  if (metadata.background !== undefined && metadata.background !== null) {
    const background = record(metadata.background, 'Background')
    if (typeof background.name !== 'string' || typeof background.style !== 'string')
      throw new Error('Invalid background.')
  }
  const keys = layout.keys.map((item, index) => {
    const raw = record(item, `Key ${index}`)
    const key = new Key()
    for (const field of Object.keys(key)) {
      if (!(field in raw)) continue
      const val = raw[field]
      const base = key[field as keyof Key]
      if (
        typeof base === 'number' &&
        (typeof val !== 'number' || !Number.isFinite(val) || Math.abs(val) > 10000)
      )
        throw new Error(`Invalid key ${field}.`)
      if ((typeof base === 'string' || typeof base === 'boolean') && typeof base !== typeof val)
        throw new Error(`Invalid key ${field}.`)
      if (
        Array.isArray(base) &&
        (!Array.isArray(val) ||
          val.length > 12 ||
          val.some((v) =>
            field === 'textSize'
              ? typeof v !== 'number' || !Number.isFinite(v)
              : typeof v !== 'string',
          ))
      )
        throw new Error(`Invalid key ${field}.`)
      if (field === 'default') {
        const defaults = record(val, 'Key defaults')
        if (
          typeof defaults.textColor !== 'string' ||
          typeof defaults.textSize !== 'number' ||
          !Number.isFinite(defaults.textSize)
        )
          throw new Error('Invalid key defaults.')
      }
      Object.assign(key, { [field]: val })
    }
    if (key.width <= 0 || key.height <= 0) throw new Error('Key size must be positive.')
    if (raw.hardwareId !== undefined) {
      if (typeof raw.hardwareId !== 'string' || !/^key-\d{6,}$/.test(raw.hardwareId))
        throw new Error('Invalid layout ID.')
      Object.assign(key, { hardwareId: raw.hardwareId })
    }
    if (raw.hardwareFace !== undefined && raw.hardwareFace !== 'top' && raw.hardwareFace !== 'bottom')
      throw new Error('Invalid hardware face.')
    if (raw.hardwareFace !== undefined) Object.assign(key, { hardwareFace: raw.hardwareFace })
    if (raw.hardwarePortDirection !== undefined && !['top', 'right', 'bottom', 'left'].includes(raw.hardwarePortDirection as string))
      throw new Error('Invalid hardware port direction.')
    if (raw.hardwarePortDirection !== undefined) {
      const id = typeof key.st === 'string' && key.st.startsWith('hardware:') ? key.st.slice(9) : ''
      const defaultDirection = hardwareDefaultPortDirection(id)
      if (defaultDirection) {
        const directions = ['top', 'right', 'bottom', 'left'] as const
        const delta = directions.indexOf(raw.hardwarePortDirection as typeof directions[number]) - directions.indexOf(defaultDirection)
        const current = key.rotation_angle ?? 0
        key.rotation_x = key.x + key.width / 2
        key.rotation_y = key.y + key.height / 2
        key.rotation_angle = ((current + delta * 90) % 360 + 360) % 360
      } else {
        Object.assign(key, { hardwarePortDirection: raw.hardwarePortDirection })
      }
    }
    return key
  })
  if (project.schemaVersion === 2 || project.schemaVersion === 3) {
    const ids = layout.keys.map((item) => record(item, 'Key').hardwareId)
    if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length)
      throw new Error('Missing or duplicate layout IDs.')
    const board = record(project.board, 'Board')
    if (board.marginMm !== 4 || board.copperEdgeClearanceMm !== 0.5)
      throw new Error('Unsupported board design rules.')
  }
  if (schemaVersion >= 2 && project.diodeDirection !== 'COL2ROW')
    throw new Error('Only COL2ROW is supported.')
  const pcb = normalizePcbSettings(project.pcb)
  const battery = normalizeBatterySettings(project.battery)
  const architecture = choice<Architecture>(
    project.architecture,
    ['unibody', 'wired-split'],
    'architecture',
  )
  const switchKind = choice<SwitchKind>(project.switch, ['mx', 'choc-v1', 'choc-v2'], 'switch')
  const controller = choice<ControllerId>(
    project.controller,
    ['xiao-rp2040', 'xiao-nrf52840', 'xiao-nrf52840-plus', 'promicro-atmega32u4'],
    'controller',
  )
  const power = choice<PowerId>(project.power, ['usb', 'controller-lipo'], 'power')
  if (!Array.isArray(project.devices) || project.devices.length > 1000) throw new Error('Devices must be an array.')
  const devices = project.devices.map((d) =>
    choice<DeviceId>(d, ['ec11', 'pmw3360', 'pmw3610', 'seiboku-jumper-header', 'ssd1306-oled', 'split-trrs-jack-pj320a', 'split-trrs-ptc'], 'device'),
  )
  const split = record(project.split ?? { connection: 'none' }, 'Split')
  const splitConnection = choice<SplitConnection>(
    split.connection,
    ['none', 'wired-uart', 'wireless'],
    'split connection',
  )
  const splitPowerMode = choice<SplitPowerMode>(
    split.powerMode ?? 'independent',
    ['master-distributes', 'independent'],
    'split power mode',
  )
  const boardOutputMode = choice<BoardOutputMode>(
    project.boardOutputMode ?? 'separate-left-right',
    ['separate-left-right', 'reversible'],
    'board output mode',
  )
  const powerBySide = split.powerBySide === undefined ? undefined : record(split.powerBySide, 'Side power')
  if (powerBySide) for (const side of ['left', 'right']) choice(powerBySide[side], ['usb', 'controller-lipo'], `${side} power`)
  const boundaryX = split.boundaryX
  if (boundaryX !== undefined && (typeof boundaryX !== 'number' || !Number.isFinite(boundaryX)))
    throw new Error('Invalid split boundary.')
  const rawPins = record(project.pinOverrides ?? {}, 'Pin overrides')
  if (Object.values(rawPins).some((v) => typeof v !== 'string'))
    throw new Error('Pin assignments must be strings.')
  let pinOverrides = { ...rawPins } as Record<string, string>
  const matrixOverrides = record(
    project.matrixOverrides ?? {},
    'Matrix overrides',
  ) as MatrixSolution['assignments']
  for (const [id, value] of Object.entries(matrixOverrides)) {
    const p = record(value, 'Matrix coordinate')
    if (
      !/^key-\d{6,}$/.test(id) ||
      !Number.isInteger(p.row) ||
      !Number.isInteger(p.column) ||
      Number(p.row) < 0 ||
      Number(p.column) < 0 ||
      Number(p.row) > 29 ||
      Number(p.column) > 29
    )
      throw new Error('Invalid matrix coordinate.')
  }
  // Materialize only the legacy controller. Devices, especially split TRRS
  // jacks, must always be explicitly placed in the Layout Editor so missing
  // hardware is reported by validation instead of being silently created.
  {
    const legacy = [controller]
    for (const id of new Set(legacy)) {
      const required = legacy.filter((d) => d === id).length
      const present = keys.filter((key) => isHardware(key) && key.st === `hardware:${id}`).length
      for (let i = present; i < required; i++) {
        const key = new Key()
        Object.assign(key, {
          decal: true,
          profile: 'hardware',
          st: `hardware:${id}`,
          x: Math.max(0, ...keys.map((k) => k.x + k.width)) + 1,
          y: 0,
          width: hardwareSizeInUnits(id).width,
          height: hardwareSizeInUnits(id).height,
          width2: hardwareSizeInUnits(id).width,
          height2: hardwareSizeInUnits(id).height,
          hardwareFace: hardwareDefaultFace(id),
        })
        key.labels[0] = id
        keys.push(key)
      }
    }
    if (project.schemaVersion === 1) {
      const rows = Number(record(project.matrix ?? {}, 'Legacy matrix').rows ?? 0)
      pinOverrides = Object.fromEntries(
        Object.entries(pinOverrides).map(([id, pin]) => {
          const match = /^matrix-gpio-(\d+)$/.exec(id)
          if (!match) return [id, pin]
          const n = Number(match[1]) - 1
          return [n < rows ? `ROW${n}` : `COL${n - rows}`, pin]
        }),
      )
    }
  }
  ensureHardwareIds(keys)
  return {
    sourceSchemaVersion: schemaVersion,
    keys,
    metadata,
    architecture,
    switch: switchKind,
    controller,
    devices,
    power,
    splitConnection,
    splitPowerMode,
    boardOutputMode,
    powerBySide: powerBySide as Record<'left' | 'right', PowerId> | undefined,
    boundaryX: boundaryX as number | undefined,
    pinOverrides,
    matrixOverrides,
    pcb,
    battery,
  }
}
