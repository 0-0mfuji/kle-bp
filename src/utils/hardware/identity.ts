import type { Key } from '@adamws/kle-serial'
import type { HardwareFace, HardwarePortDirection } from '@/types/hardware'

export type HardwareKey = Key & { hardwareId?: string; hardwareFace?: HardwareFace; hardwarePortDirection?: HardwarePortDirection }
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export const isHardware = (key: Key) =>
  key.decal && key.profile === 'hardware' && key.st.startsWith('hardware:')
export const isMatrixKey = (key: Key) => !key.decal && !key.ghost
export const layoutKeyId = (key: Key, index: number) =>
  (key as HardwareKey).hardwareId ?? `key-${String(index + 1).padStart(6, '0')}`

/** Called before editor history snapshots; copies get new IDs, moves retain IDs. */
export function ensureHardwareIds(keys: Key[], next = 1): number {
  for (const key of keys as HardwareKey[]) {
    const match = /^key-(\d+)$/.exec(key.hardwareId ?? '')
    if (match) next = Math.max(next, Number(match[1]) + 1)
  }
  const used = new Set<string>()
  for (const key of keys as HardwareKey[]) {
    if (!key.hardwareId || used.has(key.hardwareId))
      key.hardwareId = `key-${String(next++).padStart(6, '0')}`
    used.add(key.hardwareId)
  }
  return next
}

export function stableJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_, current) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return current
      return Object.fromEntries(
        Object.keys(current)
          .sort(compareIds)
          .map((key) => [key, current[key]]),
      )
    },
    2,
  )
}

/** Fixed namespace, deterministic 128-bit ID; collision checks also run before export. */
export function uuid(id: string): string {
  const input = `keyboard-hardware-cad/v2/${id}`
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  for (let i = 0; i < input.length; i++) {
    for (let w = 0; w < 4; w++)
      words[w] = Math.imul((words[w]! ^ input.charCodeAt(i)) >>> 0, 0x01000193 + w * 2) >>> 0
  }
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}
