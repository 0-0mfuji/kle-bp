import type { Key } from '@adamws/kle-serial'
import { getCherryMxStabilizerSpacing } from '@/utils/plate/plate-dimensions'
import {
  buildManufacturingOutline,
  fitsInsideTightOutline,
  type OutlineRectangle,
  type TightOutline,
} from '@/utils/geometry/tight-outline'
import type {
  BoardHole,
  BoardOutline,
  BoardSide,
  Bounds,
  HardwareComponent,
  PcbSettings,
  SplitSolution,
  SwitchKind,
} from '@/types/hardware'
import { layoutKeyId, isMatrixKey } from './identity'
import { rotate, round } from './geometry'
import { FOOTPRINTS } from '@/data/hardware-catalog'

export const DEFAULT_PCB_SETTINGS: PcbSettings = {
  switchFootprintId: 'auto',
  switchFootprintByWidth: {},
  ledFootprintId: 'auto',
  outline: {
    mode: 'auto-tight',
    marginMm: 1,
    cornerRadiusMm: 1,
    minimumWebWidthMm: 2,
    repairMode: 'auto-repair',
    copperEdgeClearanceMm: 0.5,
  },
  mountingHoles: {
    enabled: false,
    count: 3,
    drillMm: 2.2,
    edgeDistanceMm: 3,
  },
  stabilizers: {
    enabled: true,
    source: 'plate',
    type: 'mx-basic',
  },
  rgb: {
    enabled: false,
    type: 'sk6812mini-e',
    maxLedsPerSide: 26,
    placementMode: 'auto',
  },
}

const finitePositive = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

export function normalizePcbSettings(value: unknown, stabilizerType = 'mx-basic'): PcbSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const object = (candidate: unknown): Record<string, unknown> =>
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {}
  const outline = object(raw.outline)
  const mounting = object(raw.mountingHoles)
  const stabilizers = object(raw.stabilizers)
  const rgb = object(raw.rgb)
  return {
    switchFootprintId: typeof raw.switchFootprintId === 'string' && raw.switchFootprintId ? raw.switchFootprintId : 'auto',
    switchFootprintByWidth: Object.fromEntries(
      Object.entries(object(raw.switchFootprintByWidth))
        .filter(([width, selection]) => /^\d+(?:\.\d+)?$/.test(width) && typeof selection === 'string' && selection)
        .sort(([left], [right]) => Number(left) - Number(right)),
    ) as PcbSettings['switchFootprintByWidth'],
    ledFootprintId: typeof raw.ledFootprintId === 'string' && raw.ledFootprintId ? raw.ledFootprintId : 'auto',
    outline: {
      mode: outline.mode === 'legacy-rect' ? 'legacy-rect' : 'auto-tight',
      marginMm: finitePositive(outline.marginMm, DEFAULT_PCB_SETTINGS.outline.marginMm),
      cornerRadiusMm: finitePositive(outline.cornerRadiusMm, DEFAULT_PCB_SETTINGS.outline.cornerRadiusMm),
      minimumWebWidthMm: finitePositive(outline.minimumWebWidthMm, DEFAULT_PCB_SETTINGS.outline.minimumWebWidthMm),
      repairMode: outline.repairMode === 'legacy-warning' ? 'legacy-warning' : 'auto-repair',
      copperEdgeClearanceMm: finitePositive(
        outline.copperEdgeClearanceMm,
        DEFAULT_PCB_SETTINGS.outline.copperEdgeClearanceMm,
      ),
    },
    mountingHoles: {
      enabled: mounting.enabled === true,
      count: Math.max(1, Math.min(8, Math.trunc(finitePositive(mounting.count, 3)))),
      drillMm: Math.max(0.6, finitePositive(mounting.drillMm, 2.2)),
      edgeDistanceMm: Math.max(0.5, finitePositive(mounting.edgeDistanceMm, 3)),
    },
    stabilizers: {
      enabled: stabilizers.enabled !== false,
      source: 'plate',
      type: typeof stabilizers.type === 'string' ? stabilizers.type : stabilizerType,
    },
    rgb: {
      enabled: rgb.enabled === true,
      type: 'sk6812mini-e',
      maxLedsPerSide: Math.max(1, Math.min(128, Math.trunc(finitePositive(rgb.maxLedsPerSide, 26)))),
      placementMode: rgb.placementMode === 'manual' ? 'manual' : 'auto',
    },
  }
}

function transformKeyPoint(key: Key, x: number, y: number, sx: number, sy: number) {
  const ox = (key.rotation_x ?? 0) * sx
  const oy = (key.rotation_y ?? 0) * sy
  const p = rotate(x * sx - ox, y * sy - oy, key.rotation_angle ?? 0)
  return { x: p.x + ox, y: p.y + oy }
}

export function keyEnvelopeBounds(key: Key, sx: number, sy: number): Bounds {
  const rectangles = [
    { x: key.x, y: key.y, width: key.width, height: key.height },
    ...(key.x2 !== undefined || key.y2 !== undefined || key.width2 !== undefined || key.height2 !== undefined
      ? [{ x: key.x + (key.x2 ?? 0), y: key.y + (key.y2 ?? 0), width: key.width2 || key.width, height: key.height2 || key.height }]
      : []),
  ]
  const points = rectangles.flatMap((rect) => [
    transformKeyPoint(key, rect.x, rect.y, sx, sy),
    transformKeyPoint(key, rect.x + rect.width, rect.y, sx, sy),
    transformKeyPoint(key, rect.x + rect.width, rect.y + rect.height, sx, sy),
    transformKeyPoint(key, rect.x, rect.y + rect.height, sx, sy),
  ])
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  }
}

function unionBounds(items: Bounds[]): Bounds | null {
  if (!items.length) return null
  return {
    minX: Math.min(...items.map((item) => item.minX)),
    minY: Math.min(...items.map((item) => item.minY)),
    maxX: Math.max(...items.map((item) => item.maxX)),
    maxY: Math.max(...items.map((item) => item.maxY)),
  }
}

function contains(bounds: Bounds, x: number, y: number, padding: number) {
  return x >= bounds.minX - padding && x <= bounds.maxX + padding &&
    y >= bounds.minY - padding && y <= bounds.maxY + padding
}

function sideMatches(id: string, side: BoardSide | undefined, split: SplitSolution) {
  return !side || split.assignments[id] === side
}

function isManualRgbSupport(component: HardwareComponent, settings: PcbSettings) {
  // Manual RGB mode deliberately stages the boost converter, level shifter,
  // and their support passives outside the key area for placement in KiCad.
  // Those staging coordinates must not enlarge Edge.Cuts. Per-key LEDs and
  // their decoupling capacitors remain part of the board geometry.
  return settings.rgb.enabled && settings.rgb.placementMode === 'manual' &&
    component.blockId === 'rgb-sk6812mini-e' && component.id.includes('/rgb-')
}

function componentOutlineRectangle(component: HardwareComponent): OutlineRectangle {
  const definition = FOOTPRINTS[component.footprint]
  if (!definition) {
    return {
      center: { x: component.position.x, y: component.position.y },
      width: component.bounds.maxX - component.bounds.minX,
      height: component.bounds.maxY - component.bounds.minY,
      rotation: component.position.rotation,
    }
  }
  const local = { ...definition.body }
  for (const pad of definition.pads) {
    local.minX = Math.min(local.minX, pad.x - pad.width / 2)
    local.maxX = Math.max(local.maxX, pad.x + pad.width / 2)
    local.minY = Math.min(local.minY, pad.y - pad.height / 2)
    local.maxY = Math.max(local.maxY, pad.y + pad.height / 2)
  }
  // component.bounds is an axis-aligned envelope. Reconstruct the original
  // local rectangle so rotated switches and devices do not enlarge the board
  // with an unrotated bounding box.
  const localCenter = {
    x: (local.minX + local.maxX) / 2 * (component.position.side === 'back' ? -1 : 1),
    y: (local.minY + local.maxY) / 2,
  }
  const center = rotate(localCenter.x, localCenter.y, component.position.rotation)
  return {
    center: { x: center.x + component.position.x, y: center.y + component.position.y },
    width: local.maxX - local.minX,
    height: local.maxY - local.minY,
    rotation: component.position.rotation,
  }
}

function keyCenter(key: Key, sx: number, sy: number) {
  return transformKeyPoint(key, key.x + key.width / 2, key.y + key.height / 2, sx, sy)
}

export function stabilizerHoles(
  keys: Key[],
  sx: number,
  sy: number,
  split: SplitSolution,
  side: BoardSide | undefined,
  settings: PcbSettings,
  switchKind: SwitchKind,
): BoardHole[] {
  if (!settings.stabilizers.enabled || switchKind !== 'mx') return []
  const supported = new Set(['mx-basic', 'mx-bidirectional', 'mx-tight', 'mx-spec', 'mx-spec-narrow'])
  if (!supported.has(settings.stabilizers.type)) return []
  const holes: BoardHole[] = []
  keys.forEach((key, index) => {
    if (key.decal || key.ghost || !isMatrixKey(key)) return
    const keySide = sideMatches(layoutKeyId(key, index), side, split)
    if (!keySide) return
    const major = Math.max(key.width, key.height)
    const spacing = getCherryMxStabilizerSpacing(major)
    if (spacing === null) return
    const center = keyCenter(key, sx, sy)
    const horizontal = key.width >= key.height
    for (const offset of [-spacing, spacing]) {
      const local = horizontal ? { x: offset, y: 0 } : { x: 0, y: offset }
      const p = rotate(local.x, local.y, key.rotation_angle ?? 0)
      holes.push({
        id: `stabilizer/${layoutKeyId(key, index)}/${offset < 0 ? 'left' : 'right'}`,
        x: round(center.x + p.x),
        y: round(center.y + p.y),
        drillMm: 3,
        kind: 'stabilizer',
        layoutKeyId: layoutKeyId(key, index),
        ...(side ? { boardSide: side } : {}),
      })
    }
  })
  return holes
}

function mountingHoles(
  bounds: BoardOutline,
  tightOutline: TightOutline | null,
  keepouts: Bounds[],
  settings: PcbSettings,
  side?: BoardSide,
): BoardHole[] {
  if (!settings.mountingHoles.enabled) return []
  const radius = settings.mountingHoles.drillMm / 2
  const clearance = Math.max(settings.mountingHoles.edgeDistanceMm, settings.outline.minimumWebWidthMm)
  const step = Math.max(2, Math.min(6, clearance + radius))
  const candidates: { x: number; y: number }[] = []
  const minX = bounds.minX + clearance + radius
  const maxX = bounds.maxX - clearance - radius
  const minY = bounds.minY + clearance + radius
  const maxY = bounds.maxY - clearance - radius
  if (minX <= maxX && minY <= maxY) {
    for (let x = minX; x <= maxX + 1e-6; x += step)
      for (let y = minY; y <= maxY + 1e-6; y += step) candidates.push({ x: round(x), y: round(y) })
    candidates.push({ x: round((minX + maxX) / 2), y: round((minY + maxY) / 2) })
  }
  const valid = candidates
    .filter((point, index, all) => all.findIndex((other) => other.x === point.x && other.y === point.y) === index)
    .filter((point) => tightOutline
      ? fitsInsideTightOutline(tightOutline, point, radius, clearance)
      : point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY)
    .filter((point) => !keepouts.some((box) => contains(box, point.x, point.y, radius + 0.5)))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (!valid.length) return []
  const chosen = [valid[0]!]
  const minimumHoleSpacing = settings.mountingHoles.drillMm + 1
  while (chosen.length < Math.min(settings.mountingHoles.count, valid.length)) {
    const next = valid
      .filter((candidate) => !chosen.some((picked) =>
        picked.x === candidate.x && picked.y === candidate.y ||
        Math.hypot(candidate.x - picked.x, candidate.y - picked.y) < minimumHoleSpacing - 0.01))
      .sort((a, b) => {
        const score = (point: { x: number; y: number }) => Math.min(...chosen.map((picked) =>
          (point.x - picked.x) ** 2 + (point.y - picked.y) ** 2))
        const holeClearance = (point: { x: number; y: number }) => Math.min(
          ...chosen.map((picked) => Math.hypot(point.x - picked.x, point.y - picked.y)),
        )
        return score(b) - score(a) || holeClearance(b) - holeClearance(a) || a.x - b.x || a.y - b.y
      })[0]
    if (!next) break
    chosen.push(next)
  }
  return chosen.map((point, index) => ({
    id: `mounting/${side ?? 'unibody'}/${index + 1}`,
    x: round(point.x),
    y: round(point.y),
    drillMm: settings.mountingHoles.drillMm,
    kind: 'mounting' as const,
    ...(side ? { boardSide: side } : {}),
  }))
}

export interface BoardGeometryInput {
  keys: Key[]
  components: HardwareComponent[]
  split: SplitSolution
  settings: PcbSettings
  switchKind: SwitchKind
  spacingX: number
  spacingY: number
  side?: BoardSide
}

function hasRectangularFallback(shape: TightOutline) {
  return shape.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK') ?? false
}

/**
 * Side boards can expose a narrow neck that is not present in the combined
 * split outline. Give only that failed side a second, outward-material pass.
 * This does not relax manufacturing validation: the widened result must still
 * be valid and must not contain a rectangular fallback diagnostic.
 */
function buildSideSafeOutline(
  rectangles: OutlineRectangle[],
  margin: number,
  cornerRadius: number,
  settings: PcbSettings,
  side?: BoardSide,
) {
  const options = {
    bridgeWidth: settings.outline.minimumWebWidthMm,
    minimumWebWidth: settings.outline.minimumWebWidthMm,
    repairMode: settings.outline.repairMode,
  }
  const initial = buildManufacturingOutline(rectangles, margin, cornerRadius, options)
  if (settings.outline.repairMode !== 'auto-repair' || !side || !hasRectangularFallback(initial)) return initial

  // Adding half the required web width on both sides of a narrow channel
  // makes the resulting material web at least the configured minimum without
  // changing any key/component coordinates.
  const retryMargin = margin + Math.max(0.001, settings.outline.minimumWebWidthMm / 2)
  const widened = buildManufacturingOutline(rectangles, retryMargin, cornerRadius, options)
  if (widened.rings.length && widened.valid !== false && !hasRectangularFallback(widened)) return widened
  return initial
}

export function boardGeometry(input: BoardGeometryInput) {
  const { keys, components, split, settings, switchKind, spacingX: sx, spacingY: sy, side } = input
  const scopedKeys = keys.filter((key, index) => !key.decal && sideMatches(layoutKeyId(key, index), side, split))
  const scopedComponents = components.filter((component) => !side || component.boardSide === side)
  const outlineComponents = scopedComponents.filter((component) => !isManualRgbSupport(component, settings))
  const keyBounds = scopedKeys.map((key) => keyEnvelopeBounds(key, sx, sy))
  const keyRectangles: OutlineRectangle[] = scopedKeys.flatMap((key) => {
    const rectangles = [
      { x: key.x, y: key.y, width: key.width, height: key.height },
      ...(key.x2 !== undefined || key.y2 !== undefined || key.width2 !== undefined || key.height2 !== undefined
        ? [{ x: key.x + (key.x2 ?? 0), y: key.y + (key.y2 ?? 0), width: key.width2 || key.width, height: key.height2 || key.height }]
        : []),
    ]
    return rectangles.map((rectangle) => ({
      center: transformKeyPoint(key, rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2, sx, sy),
      width: rectangle.width * sx,
      height: rectangle.height * sy,
      rotation: key.rotation_angle ?? 0,
    }))
  })
  const componentRectangles: OutlineRectangle[] = outlineComponents.map(componentOutlineRectangle)
  const base = unionBounds([...keyBounds, ...outlineComponents.map((component) => component.bounds)])
  if (!base) return { outline: null, mountingHoles: [], stabilizerHoles: [] }
  const margin = settings.outline.mode === 'legacy-rect' ? 4 : settings.outline.marginMm
  const cornerRadius = settings.outline.mode === 'legacy-rect' ? 0 : settings.outline.cornerRadiusMm
  const baseShape = settings.outline.mode === 'legacy-rect'
    ? null
    : buildSideSafeOutline(
      [...keyRectangles, ...componentRectangles],
      margin,
      cornerRadius,
      settings,
      side,
    )
  const outlineFromShape = (shape: ReturnType<typeof buildManufacturingOutline>): BoardOutline => ({
    minX: round(shape.bounds?.minX ?? base.minX - margin),
    minY: round(shape.bounds?.minY ?? base.minY - margin),
    maxX: round(shape.bounds?.maxX ?? base.maxX + margin),
    maxY: round(shape.bounds?.maxY ?? base.maxY + margin),
    cornerRadiusMm: cornerRadius,
    ...(shape.rings.length ? { rings: shape.rings } : {}),
    ...(shape.diagnostics?.length ? { diagnostics: shape.diagnostics } : {}),
    ...(shape.repairCount !== undefined ? { repairCount: shape.repairCount } : {}),
    ...(shape.repairFocusMm?.length ? { repairFocusMm: shape.repairFocusMm } : {}),
    ...(shape.valid !== undefined ? { valid: shape.valid } : {}),
  })
  const outline: BoardOutline = baseShape
    ? outlineFromShape(baseShape)
    : { minX: round(base.minX - margin), minY: round(base.minY - margin), maxX: round(base.maxX + margin), maxY: round(base.maxY + margin), cornerRadiusMm: 0 }
  const stabilizer = stabilizerHoles(keys, sx, sy, split, side, settings, switchKind)
  const stabilizerRectangles: OutlineRectangle[] = stabilizer.map((hole) => ({
    center: { x: hole.x, y: hole.y },
    width: hole.drillMm + Math.max(0, settings.mountingHoles.edgeDistanceMm * 2 - margin * 2),
    height: hole.drillMm + Math.max(0, settings.mountingHoles.edgeDistanceMm * 2 - margin * 2),
  }))
  const stabilizerShape = settings.outline.mode === 'legacy-rect'
    ? null
    : buildSideSafeOutline(
      [...keyRectangles, ...componentRectangles, ...stabilizerRectangles],
      margin,
      cornerRadius,
      settings,
      side,
    )
  const finalOutline = stabilizerShape ? outlineFromShape(stabilizerShape) : outline
  const keepouts = [...scopedComponents.map((component) => component.bounds), ...stabilizer.map((hole) => ({
    minX: hole.x - hole.drillMm / 2,
    maxX: hole.x + hole.drillMm / 2,
    minY: hole.y - hole.drillMm / 2,
    maxY: hole.y + hole.drillMm / 2,
  }))]
  const mounting = mountingHoles(finalOutline, stabilizerShape, keepouts, settings, side)
  return { outline: finalOutline, mountingHoles: mounting, stabilizerHoles: stabilizer }
}
