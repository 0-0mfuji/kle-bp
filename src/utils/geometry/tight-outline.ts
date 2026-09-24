import polygonClipping, { type Polygon } from 'polygon-clipping'
import * as jscadModeling from '@jscad/modeling'
import type { OutlineRepairMode } from '@/types/outline'

export interface OutlinePoint {
  x: number
  y: number
}

export interface OutlineRectangle {
  center: OutlinePoint
  width: number
  height: number
  rotation?: number
}

export interface OutlineLineSegment {
  kind: 'line'
  start: OutlinePoint
  end: OutlinePoint
}

export interface OutlineArcSegment {
  kind: 'arc'
  start: OutlinePoint
  mid: OutlinePoint
  end: OutlinePoint
}

export type OutlineSegment = OutlineLineSegment | OutlineArcSegment

export interface TightOutlineRing {
  points: OutlinePoint[]
  segments: OutlineSegment[]
  area: number
}

export type OutlineDiagnosticCode =
  | 'OUTLINE_SPIKE_INVALID'
  | 'OUTLINE_NARROW_NECK_INVALID'
  | 'OUTLINE_SELF_INTERSECTION'
  | 'OUTLINE_DISCONNECTED'
  | 'OUTLINE_SHORT_EDGE'
  | 'OUTLINE_REPAIR_BLOCKED'
  | 'OUTLINE_RECTANGULAR_FALLBACK'

export interface OutlineDiagnostic {
  code: OutlineDiagnosticCode
  message: string
  ringIndex?: number
  segmentIndex?: number
  focus?: OutlinePoint
}

export interface TightOutline {
  rings: TightOutlineRing[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  diagnostics?: OutlineDiagnostic[]
  /** Number of local narrow-neck repairs applied after the raw outline was built. */
  repairCount?: number
  repairFocusMm?: OutlinePoint[]
  valid?: boolean
}

export interface ConnectedTightOutlineOptions {
  /** Minimum material web used to connect disconnected plate regions. */
  bridgeWidth: number
  /** Morphological closing width. Defaults to bridgeWidth. */
  minimumWebWidth?: number
  /** Maximum synchronous geometry time in milliseconds. */
  timeoutMs?: number
  /** Narrow-neck handling policy. Defaults to local repair. */
  repairMode?: OutlineRepairMode
  /** Extra material above the configured minimum web width. */
  repairPaddingMm?: number
  /** Regions that must not be consumed by a local repair bridge. */
  protectedRectangles?: OutlineRectangle[]
}

export const OUTLINE_QUANTIZATION = 100_000
const DEFAULT_OUTLINE_TIMEOUT_MS = 10_000

const EPSILON = 1e-7
const GEOMETRY_TOLERANCE = 0.01
const MIN_OUTLINE_EDGE_MM = 0.25
const SPIKE_ANGLE_DEGREES = 15
const MAX_REPAIRS = 256
const BRIDGE_SAFETY_EPSILON_MM = 0.001
const round = (value: number) => Math.round(value * 1e6) / 1e6

function circleThrough(a: OutlinePoint, b: OutlinePoint, c: OutlinePoint) {
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(determinant) <= EPSILON) return null
  const aa = a.x * a.x + a.y * a.y
  const bb = b.x * b.x + b.y * b.y
  const cc = c.x * c.x + c.y * c.y
  const center = {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / determinant,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / determinant,
  }
  return { center, radius: distance(center, a) }
}

function angleOf(center: OutlinePoint, point: OutlinePoint) {
  return Math.atan2(point.y - center.y, point.x - center.x)
}

function normalizedArcAngles(segment: OutlineArcSegment, circle: { center: OutlinePoint }) {
  const start = angleOf(circle.center, segment.start)
  let end = angleOf(circle.center, segment.end)
  let mid = angleOf(circle.center, segment.mid)
  while (end < start) end += Math.PI * 2
  while (mid < start) mid += Math.PI * 2
  if (mid > end) end -= Math.PI * 2
  return { start, end }
}

function distanceToLine(point: OutlinePoint, start: OutlinePoint, end: OutlinePoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= EPSILON) return distance(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function distanceToSegment(point: OutlinePoint, segment: OutlineSegment) {
  if (segment.kind === 'line') return distanceToLine(point, segment.start, segment.end)
  const circle = circleThrough(segment.start, segment.mid, segment.end)
  if (!circle || circle.radius <= EPSILON) return Math.min(distance(point, segment.start), distance(point, segment.end))
  const angle = angleOf(circle.center, point)
  const { start, end } = normalizedArcAngles(segment, circle)
  let normalized = angle
  while (normalized < start) normalized += Math.PI * 2
  while (normalized > start + Math.PI * 2) normalized -= Math.PI * 2
  if (normalized >= Math.min(start, end) - EPSILON && normalized <= Math.max(start, end) + EPSILON)
    return Math.abs(distance(point, circle.center) - circle.radius)
  return Math.min(distance(point, segment.start), distance(point, segment.end))
}

function sampledRingPoints(ring: TightOutlineRing): OutlinePoint[] {
  const points: OutlinePoint[] = []
  for (const segment of ring.segments) {
    if (segment.kind === 'line') {
      points.push(segment.start)
      continue
    }
    const circle = circleThrough(segment.start, segment.mid, segment.end)
    if (!circle || circle.radius <= EPSILON) {
      points.push(segment.start)
      continue
    }
    const { start, end } = normalizedArcAngles(segment, circle)
    const count = Math.max(2, Math.ceil(Math.abs(end - start) / (Math.PI / 18)))
    for (let index = 0; index < count; index++) {
      const angle = start + (end - start) * index / count
      points.push({ x: circle.center.x + circle.radius * Math.cos(angle), y: circle.center.y + circle.radius * Math.sin(angle) })
    }
  }
  return points
}

function pointInRing(point: OutlinePoint, ring: TightOutlineRing) {
  const polygon = sampledRingPoints(ring)
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]!
    const prior = polygon[previous]!
    const intersects = (current.y > point.y) !== (prior.y > point.y) &&
      point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInTightOutline(outline: TightOutline, point: OutlinePoint) {
  return outline.rings.some((ring) => pointInRing(point, ring))
}

export function distanceToTightOutline(outline: TightOutline, point: OutlinePoint) {
  return Math.min(...outline.rings.flatMap((ring) => ring.segments.map((segment) => distanceToSegment(point, segment))), Infinity)
}

export function fitsInsideTightOutline(outline: TightOutline, point: OutlinePoint, radius: number, clearance: number) {
  return pointInTightOutline(outline, point) && distanceToTightOutline(outline, point) + GEOMETRY_TOLERANCE >= radius + clearance
}

export function minimumRectangleClearance(
  outline: TightOutline,
  rectangle: OutlineRectangle,
): number {
  const halfWidth = rectangle.width / 2
  const halfHeight = rectangle.height / 2
  const samples = [
    { x: -halfWidth, y: -halfHeight },
    { x: 0, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: 0 },
    { x: halfWidth, y: halfHeight },
    { x: 0, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
    { x: -halfWidth, y: 0 },
  ].map((point) => {
    const rotated = rotate(point, rectangle.rotation ?? 0)
    return { x: rotated.x + rectangle.center.x, y: rotated.y + rectangle.center.y }
  })
  if (samples.some((point) => !pointInTightOutline(outline, point))) return 0
  return Math.min(...samples.map((point) => distanceToTightOutline(outline, point)))
}

function rotate(point: OutlinePoint, angle: number): OutlinePoint {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

function rectanglePolygon(rectangle: OutlineRectangle, margin: number): Polygon {
  const halfWidth = rectangle.width / 2 + margin
  const halfHeight = rectangle.height / 2 + margin
  const local = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]
  const angle = rectangle.rotation ?? 0
  const points = local.map((point) => {
    const rotated = rotate(point, angle)
    return [round(rotated.x + rectangle.center.x), round(rotated.y + rectangle.center.y)] as [number, number]
  })
  return [[...points, points[0]!]]
}

function closestPoints(pointsA: Array<[number, number]>, pointsB: Array<[number, number]>) {
  let best = {
    a: { x: pointsA[0]![0], y: pointsA[0]![1] },
    b: { x: pointsB[0]![0], y: pointsB[0]![1] },
    distance: Infinity,
  }
  for (const [ax, ay] of pointsA) {
    for (const [bx, by] of pointsB) {
      const distance = Math.hypot(ax - bx, ay - by)
      if (distance < best.distance - EPSILON ||
        (Math.abs(distance - best.distance) <= EPSILON && (ax < best.a.x || (ax === best.a.x && ay < best.a.y)))) {
        best = { a: { x: ax, y: ay }, b: { x: bx, y: by }, distance }
      }
    }
  }
  return best
}

function bridgePolygon(
  start: OutlinePoint,
  end: OutlinePoint,
  width: number,
): Polygon {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length <= EPSILON) return []
  const extension = 0.01
  const ux = dx / length
  const uy = dy / length
  const halfWidth = Math.max(width, 0.01) / 2
  const sx = start.x - ux * extension
  const sy = start.y - uy * extension
  const ex = end.x + ux * extension
  const ey = end.y + uy * extension
  const px = -uy * halfWidth
  const py = ux * halfWidth
  return [[
    [round(sx + px), round(sy + py)],
    [round(ex + px), round(ey + py)],
    [round(ex - px), round(ey - py)],
    [round(sx - px), round(sy - py)],
    [round(sx + px), round(sy + py)],
  ]]
}

function closedRing(points: OutlinePoint[]): [number, number][] {
  const ring = points.map((point) => [quantize(point.x), quantize(point.y)] as [number, number])
  if (ring.length && (ring[0]![0] !== ring[ring.length - 1]![0] || ring[0]![1] !== ring[ring.length - 1]![1]))
    ring.push(ring[0]!)
  return ring
}

function polygonIntersectsRectangle(polygon: Polygon, rectangle: OutlineRectangle): boolean {
  const protectedPolygon = rectanglePolygon(rectangle, 0)
  try {
    return polygonClipping.intersection(polygon, protectedPolygon).some((entry) => entry.some((ring) => ring.length > 3))
  } catch {
    return true
  }
}

function localNeckRepairPolygon(a: OutlineLineSegment, b: OutlineLineSegment, extension = 0.02, targetWidth?: number): Polygon | null {
  const dx = a.end.x - a.start.x
  const dy = a.end.y - a.start.y
  const length = Math.hypot(dx, dy)
  if (length <= EPSILON) return null
  const direction = { x: dx / length, y: dy / length }
  const normal = { x: -direction.y, y: direction.x }
  const projection = (point: OutlinePoint) => (point.x - a.start.x) * direction.x + (point.y - a.start.y) * direction.y
  const bStart = projection(b.start)
  const bEnd = projection(b.end)
  const overlapStart = Math.max(0, Math.min(bStart, bEnd))
  const overlapEnd = Math.min(length, Math.max(bStart, bEnd))
  if (overlapEnd - overlapStart <= MIN_OUTLINE_EDGE_MM) return null
  const signedDistance = (b.start.x - a.start.x) * normal.x + (b.start.y - a.start.y) * normal.y
  if (Math.abs(signedDistance) <= EPSILON) return null
  const atA = (value: number): OutlinePoint => ({ x: a.start.x + direction.x * value, y: a.start.y + direction.y * value })
  const atB = (value: number): OutlinePoint => {
    const point = atA(value)
    return { x: point.x + normal.x * signedDistance, y: point.y + normal.y * signedDistance }
  }
  const start = Math.max(0, overlapStart - extension)
  const end = Math.min(length, overlapEnd + extension)
  if (targetWidth !== undefined) {
    // `targetWidth` is the final web width, not the amount to add on each
    // side.  The old calculation added the complete deficit to both sides,
    // which made a 1.5 mm neck become roughly 2.6 mm wide and produced
    // square-looking local bulges, especially beside rotated keys.
    const halfDeficit = Math.max(0, targetWidth - Math.abs(signedDistance)) / 2
    const normalPadding = 0.01
    const first = atA(start)
    const last = atA(end)
    const low = Math.min(0, signedDistance) - halfDeficit - normalPadding
    const high = Math.max(0, signedDistance) + halfDeficit + normalPadding
    return [closedRing([
      { x: first.x + normal.x * low, y: first.y + normal.y * low },
      { x: last.x + normal.x * low, y: last.y + normal.y * low },
      { x: last.x + normal.x * high, y: last.y + normal.y * high },
      { x: first.x + normal.x * high, y: first.y + normal.y * high },
    ])]
  }
  return [closedRing([atA(start), atA(end), atB(end), atB(start)])]
}

function outlineFromPolygons(polygons: Polygon[]): TightOutline {
  const rings = polygons
    .flatMap((polygon) => polygon.slice(0, 1))
    .map((ring) => rotateToStableStart(removeShortEdges(simplifyRing(ring.map(([x, y]) => ({ x, y }))))) )
    .filter((ring) => ring.length >= 3)
    .map((points) => ({ points, segments: lineSegments(points), area: signedArea(points) }))
    .sort((a, b) => Math.min(...a.points.map((point) => point.x)) - Math.min(...b.points.map((point) => point.x)) ||
      Math.min(...a.points.map((point) => point.y)) - Math.min(...b.points.map((point) => point.y)))
  const points = rings.flatMap((ring) => ring.points)
  return {
    rings,
    bounds: points.length ? {
      minX: Math.min(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxX: Math.max(...points.map((point) => point.x)),
      maxY: Math.max(...points.map((point) => point.y)),
    } : null,
  }
}

function narrowNeckPairs(outline: TightOutline, minimumWebWidth: number) {
  const candidates: Array<{ ringIndex: number; first: number; second: number; a: OutlineLineSegment; b: OutlineLineSegment; distance: number }> = []
  outline.rings.forEach((ring, ringIndex) => {
    const segments = ring.segments.filter((segment): segment is OutlineLineSegment => segment.kind === 'line')
    for (let first = 0; first < segments.length; first++) {
      for (let second = first + 1; second < segments.length; second++) {
        if (second === first + 1 || (first === 0 && second === segments.length - 1)) continue
        const parallel = parallelSegmentDistance(segments[first]!, segments[second]!)
        if (parallel && parallel.overlap > MIN_OUTLINE_EDGE_MM && parallel.distance < minimumWebWidth - EPSILON)
          candidates.push({ ringIndex, first, second, a: segments[first]!, b: segments[second]!, distance: parallel.distance })
      }
    }
  })
  return candidates.sort((a, b) => a.ringIndex - b.ringIndex || a.distance - b.distance || a.first - b.first || a.second - b.second)
}

export function repairNarrowNecks(
  outline: TightOutline,
  minimumWebWidth: number,
  protectedRectangles: OutlineRectangle[] = [],
  repairPaddingMm = 0.05,
): {
  outline: TightOutline
  repaired: number
  blocked: OutlineDiagnostic[]
  repairFocusMm: OutlinePoint[]
  needsFallback: boolean
  failureReason?: string
} {
  const target = minimumWebWidth + Math.max(0, repairPaddingMm)
  let current = outline
  let repaired = 0
  const blocked: OutlineDiagnostic[] = []
  const repairFocusMm: OutlinePoint[] = []
  const seenSignatures = new Set<string>()
  const signature = (candidate: TightOutline) => candidate.rings.map((ring) =>
    ring.points.map((point) => `${quantize(point.x)},${quantize(point.y)}`).join(';'),
  ).join('|')
  seenSignatures.add(signature(current))
  let failureReason: string | undefined

  while (repaired < MAX_REPAIRS) {
    const candidates = narrowNeckPairs(current, target)
    if (!candidates.length) break
    const candidateCount = candidates.length
    let changed = false
    let rejectedReason: string | undefined
    for (const candidate of candidates) {
      const polygon = localNeckRepairPolygon(candidate.a, candidate.b, 0.02, target)
      if (!polygon) continue
      if (protectedRectangles.some((rectangle) => polygonIntersectsRectangle(polygon, rectangle))) {
        blocked.push({
          code: 'OUTLINE_REPAIR_BLOCKED',
          message: `Local outline repair near (${candidate.a.start.x.toFixed(3)}, ${candidate.a.start.y.toFixed(3)}) intersects a protected cutout.`,
          ringIndex: candidate.ringIndex,
          segmentIndex: candidate.first,
          focus: candidate.a.start,
        })
        continue
      }
      try {
        const unionPolygons: Polygon[] = [
          ...current.rings.map((ring) => [closedRing(ring.points)] as Polygon),
          polygon,
        ]
        const union = polygonClipping.union(unionPolygons[0]!, ...unionPolygons.slice(1))
        const repairedOutline = outlineFromPolygons(union)
        if (!repairedOutline.rings.length) continue
        const structuralDiagnostics = validateManufacturingOutline(repairedOutline, target)
          .filter((diagnostic) => diagnostic.code !== 'OUTLINE_NARROW_NECK_INVALID')
        const remainingCandidates = narrowNeckPairs(repairedOutline, target)
        const repairedSignature = signature(repairedOutline)
        if (structuralDiagnostics.length || remainingCandidates.length >= candidateCount || seenSignatures.has(repairedSignature)) {
          rejectedReason ??= structuralDiagnostics[0]?.message ??
            (remainingCandidates.length >= candidateCount
              ? 'A local repair did not reduce the number of narrow-neck candidates.'
              : 'A local repair repeated an existing outline shape.')
          continue
        }
        current = repairedOutline
        seenSignatures.add(repairedSignature)
        repaired++
        repairFocusMm.push(candidate.a.start)
        changed = true
        break
      } catch {
        blocked.push({
          code: 'OUTLINE_REPAIR_BLOCKED',
          message: `Local outline repair near (${candidate.a.start.x.toFixed(3)}, ${candidate.a.start.y.toFixed(3)}) could not be unioned safely.`,
          ringIndex: candidate.ringIndex,
          segmentIndex: candidate.first,
          focus: candidate.a.start,
        })
      }
    }
    if (!changed) {
      failureReason ??= rejectedReason ?? 'No safe local repair reduced the remaining narrow-neck candidates.'
      break
    }
  }
  const diagnostics = [
    ...(current.diagnostics ?? []),
    ...validateManufacturingOutline(current, minimumWebWidth),
  ]
  const remainingCandidates = narrowNeckPairs(current, target)
  if (repaired >= MAX_REPAIRS)
    failureReason ??= `Local outline repair reached the maximum of ${MAX_REPAIRS} repairs.`
  else if (remainingCandidates.length)
    failureReason ??= 'Narrow-neck candidates remained after local repair.'
  else if (diagnostics.some((diagnostic) => diagnostic.code !== 'OUTLINE_NARROW_NECK_INVALID'))
    failureReason ??= diagnostics.find((diagnostic) => diagnostic.code !== 'OUTLINE_NARROW_NECK_INVALID')?.message ??
      'The repaired outline failed manufacturing geometry validation.'
  return {
    outline: { ...current, diagnostics },
    repaired,
    blocked,
    repairFocusMm,
    needsFallback: Boolean(failureReason),
    failureReason,
  }
}

function quantize(value: number) {
  return Math.round(value * OUTLINE_QUANTIZATION) / OUTLINE_QUANTIZATION
}

function assertFiniteOutline(rectangles: OutlineRectangle[]) {
  if (rectangles.some((rectangle) => ![
    rectangle.center.x,
    rectangle.center.y,
    rectangle.width,
    rectangle.height,
    rectangle.rotation ?? 0,
  ].every(Number.isFinite) || rectangle.width <= 0 || rectangle.height <= 0)) {
    throw new Error('OUTLINE_GEOMETRY_INVALID: non-finite or non-positive rectangle input')
  }
}

function assertOutlineTime(startedAt: number, timeoutMs: number) {
  if (Date.now() - startedAt > timeoutMs) throw new Error('OUTLINE_GENERATION_TIMEOUT')
}

function morphologicalClosedPolygons(
  rectangles: OutlineRectangle[],
  margin: number,
  minimumWebWidth: number,
  startedAt: number,
  timeoutMs: number,
): Polygon[] {
  const polygons = rectangles.map((rectangle) => rectanglePolygon({
    ...rectangle,
    center: { x: quantize(rectangle.center.x), y: quantize(rectangle.center.y) },
    width: quantize(rectangle.width),
    height: quantize(rectangle.height),
  }, margin))
  // A closing operation on two finite solids can leave a narrow channel after
  // the erosion step. Add the deterministic closing bridge explicitly for
  // axis-aligned subjects whose expanded AABBs have a sub-web gap. This is
  // the exact planar equivalent of closing that channel and keeps the
  // operation stable for the common keyboard case; rotated subjects continue
  // through the JSCAD offset path below.
  const expandedBounds = rectangles.map((rectangle) => rectangleBounds(rectangle, margin))
  for (let first = 0; first < rectangles.length; first++) {
    const a = rectangles[first]!
    if ((a.rotation ?? 0) % 180 !== 0) continue
    for (let second = first + 1; second < rectangles.length; second++) {
      const b = rectangles[second]!
      if ((b.rotation ?? 0) % 180 !== 0) continue
      const firstBounds = expandedBounds[first]!
      const secondBounds = expandedBounds[second]!
      const overlapY = Math.min(firstBounds.maxY, secondBounds.maxY) - Math.max(firstBounds.minY, secondBounds.minY)
      const overlapX = Math.min(firstBounds.maxX, secondBounds.maxX) - Math.max(firstBounds.minX, secondBounds.minX)
      if (overlapY > EPSILON && secondBounds.minX > firstBounds.maxX && secondBounds.minX - firstBounds.maxX < minimumWebWidth) {
        polygons.push([[
          [firstBounds.maxX, Math.max(firstBounds.minY, secondBounds.minY)],
          [secondBounds.minX, Math.max(firstBounds.minY, secondBounds.minY)],
          [secondBounds.minX, Math.min(firstBounds.maxY, secondBounds.maxY)],
          [firstBounds.maxX, Math.min(firstBounds.maxY, secondBounds.maxY)],
          [firstBounds.maxX, Math.max(firstBounds.minY, secondBounds.minY)],
        ]])
      } else if (overlapY > EPSILON && firstBounds.minX > secondBounds.maxX && firstBounds.minX - secondBounds.maxX < minimumWebWidth) {
        polygons.push([[
          [secondBounds.maxX, Math.max(firstBounds.minY, secondBounds.minY)],
          [firstBounds.minX, Math.max(firstBounds.minY, secondBounds.minY)],
          [firstBounds.minX, Math.min(firstBounds.maxY, secondBounds.maxY)],
          [secondBounds.maxX, Math.min(firstBounds.maxY, secondBounds.maxY)],
          [secondBounds.maxX, Math.max(firstBounds.minY, secondBounds.minY)],
        ]])
      } else if (overlapX > EPSILON && secondBounds.minY > firstBounds.maxY && secondBounds.minY - firstBounds.maxY < minimumWebWidth) {
        polygons.push([[
          [Math.max(firstBounds.minX, secondBounds.minX), firstBounds.maxY],
          [Math.min(firstBounds.maxX, secondBounds.maxX), firstBounds.maxY],
          [Math.min(firstBounds.maxX, secondBounds.maxX), secondBounds.minY],
          [Math.max(firstBounds.minX, secondBounds.minX), secondBounds.minY],
          [Math.max(firstBounds.minX, secondBounds.minX), firstBounds.maxY],
        ]])
      } else if (overlapX > EPSILON && firstBounds.minY > secondBounds.maxY && firstBounds.minY - secondBounds.maxY < minimumWebWidth) {
        polygons.push([[
          [Math.max(firstBounds.minX, secondBounds.minX), secondBounds.maxY],
          [Math.min(firstBounds.maxX, secondBounds.maxX), secondBounds.maxY],
          [Math.min(firstBounds.maxX, secondBounds.maxX), firstBounds.minY],
          [Math.max(firstBounds.minX, secondBounds.minX), firstBounds.minY],
          [Math.max(firstBounds.minX, secondBounds.minX), secondBounds.maxY],
        ]])
      }
    }
  }
  const normalizedUnion = polygonClipping.union(polygons[0]!, ...polygons.slice(1))
  if (rectangles.every((rectangle) => Math.abs((rectangle.rotation ?? 0) % 180) <= EPSILON)) {
    return normalizedUnion.flatMap((polygon) => polygon.slice(0, 1).map((ring) => [ring]))
  }
  const geometries = normalizedUnion.flatMap((polygon) => polygon.slice(0, 1).map((ring) =>
    jscadModeling.primitives.polygon({
      points: ring.slice(0, -1).map(([x, y]) => [x, y] as [number, number]),
    }),
  ))
  if (!geometries.length) return []
  assertOutlineTime(startedAt, timeoutMs)
  const raw = geometries.reduce((left, right) => jscadModeling.booleans.union(left, right))
  const radius = Math.max(0, minimumWebWidth) / 2
  const closed = radius > EPSILON
    ? jscadModeling.expansions.offset(
        { delta: -radius, corners: 'round', segments: 32 },
        jscadModeling.expansions.offset({ delta: radius, corners: 'round', segments: 32 }, raw),
      )
    : raw
  assertOutlineTime(startedAt, timeoutMs)
  const outlines = jscadModeling.geometries.geom2.toOutlines(closed)
  return outlines.map((outline) => [[
    ...outline.map(([x, y]) => [quantize(x), quantize(y)] as [number, number]),
    [quantize(outline[0]![0]), quantize(outline[0]![1])],
  ]])
}

function rectangleBounds(rectangle: OutlineRectangle, margin: number) {
  const halfWidth = rectangle.width / 2 + margin
  const halfHeight = rectangle.height / 2 + margin
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => {
    const rotated = rotate(point, rectangle.rotation ?? 0)
    return { x: rotated.x + rectangle.center.x, y: rotated.y + rectangle.center.y }
  })
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  }
}

function rectangularFallbackOutline(
  rectangles: OutlineRectangle[],
  margin: number,
  reason: string,
  focus?: OutlinePoint,
): TightOutline {
  if (!rectangles.length) return { rings: [], bounds: null, valid: false }
  const safeMargin = Math.max(0, margin)
  const bounds = rectangles.map((rectangle) => rectangleBounds({
    ...rectangle,
    center: { x: quantize(rectangle.center.x), y: quantize(rectangle.center.y) },
    width: quantize(rectangle.width),
    height: quantize(rectangle.height),
  }, safeMargin))
  const minX = quantize(Math.min(...bounds.map((item) => item.minX)))
  const minY = quantize(Math.min(...bounds.map((item) => item.minY)))
  const maxX = quantize(Math.max(...bounds.map((item) => item.maxX)))
  const maxY = quantize(Math.max(...bounds.map((item) => item.maxY)))
  const points = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
  const ring = { points, segments: lineSegments(points), area: signedArea(points) }
  return {
    rings: [ring],
    bounds: { minX, minY, maxX, maxY },
    diagnostics: [{
      code: 'OUTLINE_RECTANGULAR_FALLBACK',
      message: `Tight outline repair was not safe: ${reason} Used an axis-aligned rectangular outline instead.`,
      ...(focus ? { focus } : {}),
    }],
    valid: true,
  }
}

function connectedRectangleGroups(rectangles: OutlineRectangle[], margin: number): number[][] {
  const boxes = rectangles.map((rectangle) => rectangleBounds(rectangle, margin))
  const order = boxes.map((_, index) => index).sort((a, b) => boxes[a]!.minX - boxes[b]!.minX || a - b)
  const parent = boxes.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!)
    return parent[index]!
  }
  const join = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }
  const active: number[] = []
  for (const index of order) {
    const current = boxes[index]!
    for (let activeIndex = active.length - 1; activeIndex >= 0; activeIndex--) {
      const otherIndex = active[activeIndex]!
      if (boxes[otherIndex]!.maxX < current.minX - EPSILON) active.splice(activeIndex, 1)
    }
    for (const otherIndex of active) {
      const other = boxes[otherIndex]!
      if (other.maxY >= current.minY - EPSILON && current.maxY >= other.minY - EPSILON) join(index, otherIndex)
    }
    active.push(index)
  }
  const groups = new Map<number, number[]>()
  for (let index = 0; index < rectangles.length; index++) {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push(index)
    groups.set(root, group)
  }
  return [...groups.values()].sort((a, b) => a[0]! - b[0]!)
}

function signedArea(points: OutlinePoint[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

function distance(a: OutlinePoint, b: OutlinePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function unit(from: OutlinePoint, to: OutlinePoint): OutlinePoint {
  const length = distance(from, to)
  return length <= EPSILON ? { x: 0, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

function add(a: OutlinePoint, b: OutlinePoint, scale = 1): OutlinePoint {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale }
}

function cross(a: OutlinePoint, b: OutlinePoint, c: OutlinePoint) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
}

function simplifyRing(points: OutlinePoint[]): OutlinePoint[] {
  const result: OutlinePoint[] = []
  for (const point of points) {
    const rounded = { x: quantize(point.x), y: quantize(point.y) }
    const previous = result[result.length - 1]
    if (previous && distance(previous, rounded) <= EPSILON) continue
    result.push(rounded)
  }
  if (result.length > 1 && distance(result[0]!, result[result.length - 1]!) <= EPSILON) result.pop()
  if (result.length < 3) return result

  const withoutCollinear: OutlinePoint[] = []
  for (let index = 0; index < result.length; index++) {
    const previous = result[(index + result.length - 1) % result.length]!
    const current = result[index]!
    const next = result[(index + 1) % result.length]!
    if (Math.abs(cross(previous, current, next)) <= EPSILON) continue
    withoutCollinear.push(current)
  }
  return withoutCollinear
}

function lineSegments(points: OutlinePoint[]): OutlineSegment[] {
  return points.map((point, index) => ({
    kind: 'line' as const,
    start: point,
    end: points[(index + 1) % points.length]!,
  }))
}

function removeShortEdges(points: OutlinePoint[], minimum = MIN_OUTLINE_EDGE_MM): OutlinePoint[] {
  const result = [...points]
  let changed = true
  while (changed && result.length > 3) {
    changed = false
    for (let index = 0; index < result.length; index++) {
      const previous = result[(index + result.length - 1) % result.length]!
      const current = result[index]!
      const next = result[(index + 1) % result.length]!
      if (distance(previous, current) < minimum || distance(current, next) < minimum) {
        result.splice(index, 1)
        changed = true
        break
      }
    }
  }
  return result
}

function orientation(a: OutlinePoint, b: OutlinePoint, c: OutlinePoint) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  if (Math.abs(value) <= EPSILON) return 0
  return value > 0 ? 1 : -1
}

function onSegment(a: OutlinePoint, b: OutlinePoint, point: OutlinePoint) {
  return point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON
}

function lineIntersects(a: OutlineLineSegment, b: OutlineLineSegment) {
  const a1 = orientation(a.start, a.end, b.start)
  const a2 = orientation(a.start, a.end, b.end)
  const b1 = orientation(b.start, b.end, a.start)
  const b2 = orientation(b.start, b.end, a.end)
  if (a1 === 0 && a2 === 0 && b1 === 0 && b2 === 0) return false
  if (a1 !== a2 && b1 !== b2) return true
  return (a1 === 0 && onSegment(a.start, a.end, b.start)) ||
    (a2 === 0 && onSegment(a.start, a.end, b.end)) ||
    (b1 === 0 && onSegment(b.start, b.end, a.start)) ||
    (b2 === 0 && onSegment(b.start, b.end, a.end))
}

function sharesEndpoint(a: OutlineLineSegment, b: OutlineLineSegment) {
  return [a.start, a.end].some((first) => [b.start, b.end].some((second) => distance(first, second) <= 0.01))
}

function parallelSegmentDistance(a: OutlineLineSegment, b: OutlineLineSegment) {
  const adx = a.end.x - a.start.x
  const ady = a.end.y - a.start.y
  const bdx = b.end.x - b.start.x
  const bdy = b.end.y - b.start.y
  const alength = Math.hypot(adx, ady)
  const blength = Math.hypot(bdx, bdy)
  if (alength <= EPSILON || blength <= EPSILON) return null
  if (Math.abs(adx * bdy - ady * bdx) > alength * blength * 0.02) return null
  const distanceToOther = Math.abs(adx * (b.start.y - a.start.y) - ady * (b.start.x - a.start.x)) / alength
  const axisX = Math.abs(adx) >= Math.abs(ady)
  const aMin = axisX ? Math.min(a.start.x, a.end.x) : Math.min(a.start.y, a.end.y)
  const aMax = axisX ? Math.max(a.start.x, a.end.x) : Math.max(a.start.y, a.end.y)
  const bMin = axisX ? Math.min(b.start.x, b.end.x) : Math.min(b.start.y, b.end.y)
  const bMax = axisX ? Math.max(b.start.x, b.end.x) : Math.max(b.start.y, b.end.y)
  return { distance: distanceToOther, overlap: Math.min(aMax, bMax) - Math.max(aMin, bMin) }
}

/** Validate the canonical manufacturing contour before any file conversion. */
export function validateManufacturingOutline(outline: TightOutline, minimumWebWidth = 2): OutlineDiagnostic[] {
  const diagnostics: OutlineDiagnostic[] = []
  for (let ringIndex = 0; ringIndex < outline.rings.length; ringIndex++) {
    const ring = outline.rings[ringIndex]!
    const segments = ring.segments.filter((segment): segment is OutlineLineSegment => segment.kind === 'line')
    if (segments.length !== ring.segments.length) {
      diagnostics.push({ code: 'OUTLINE_SPIKE_INVALID', message: 'Manufacturing contours must not contain a second-stage arc fillet.', ringIndex })
      continue
    }
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      const length = distance(segment.start, segment.end)
      if (length < MIN_OUTLINE_EDGE_MM) {
        diagnostics.push({ code: 'OUTLINE_SHORT_EDGE', message: `Outline edge is shorter than ${MIN_OUTLINE_EDGE_MM} mm.`, ringIndex, segmentIndex: index })
      }
      const next = segments[(index + 1) % segments.length]!
      if (distance(segment.end, next.start) > 0.01)
        diagnostics.push({ code: 'OUTLINE_SPIKE_INVALID', message: 'Outline segments are not contiguous.', ringIndex, segmentIndex: index })
      const previousVector = { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y }
      const nextVector = { x: next.end.x - segment.end.x, y: next.end.y - segment.end.y }
      const previousLength = Math.hypot(previousVector.x, previousVector.y)
      const nextLength = Math.hypot(nextVector.x, nextVector.y)
      if (previousLength > MIN_OUTLINE_EDGE_MM && nextLength > MIN_OUTLINE_EDGE_MM) {
        const cosine = Math.max(-1, Math.min(1, (previousVector.x * nextVector.x + previousVector.y * nextVector.y) / (previousLength * nextLength)))
        const interiorAngle = Math.acos(cosine) * 180 / Math.PI
        const contourOrientation = Math.sign(ring.area) || 1
        const turn = nextVector.x * previousVector.y - nextVector.y * previousVector.x
        const isConvex = turn * contourOrientation > EPSILON
        const localDeviation = distanceToLine(segment.end, segment.start, next.end)
        const isSmallAcuteTip = Math.max(previousLength, nextLength) < 1.25
        if (isConvex && interiorAngle > 1 && interiorAngle < SPIKE_ANGLE_DEGREES && previousLength < 3 && nextLength < 3 && (localDeviation > 1.5 || isSmallAcuteTip))
          diagnostics.push({ code: 'OUTLINE_SPIKE_INVALID', message: `Outline has an outward spike with a ${interiorAngle.toFixed(2)} degree tip.`, ringIndex, segmentIndex: index })
      }
      for (let otherIndex = index + 1; otherIndex < segments.length; otherIndex++) {
        if (otherIndex === index + 1 || (index === 0 && otherIndex === segments.length - 1)) continue
        if (!sharesEndpoint(segment, segments[otherIndex]!) && lineIntersects(segment, segments[otherIndex]!))
          diagnostics.push({ code: 'OUTLINE_SELF_INTERSECTION', message: `Outline edges ${index} and ${otherIndex} self-intersect (${segment.start.x},${segment.start.y})-(${segment.end.x},${segment.end.y}) vs (${segments[otherIndex]!.start.x},${segments[otherIndex]!.start.y})-(${segments[otherIndex]!.end.x},${segments[otherIndex]!.end.y}).`, ringIndex, segmentIndex: index })
        const parallel = parallelSegmentDistance(segment, segments[otherIndex]!)
        if (parallel && parallel.overlap > MIN_OUTLINE_EDGE_MM && parallel.distance < minimumWebWidth - EPSILON)
          diagnostics.push({ code: 'OUTLINE_NARROW_NECK_INVALID', message: `Outline neck is narrower than ${minimumWebWidth} mm.`, ringIndex, segmentIndex: index, focus: segment.end })
      }
    }
  }
  return diagnostics.filter((diagnostic, index, all) => all.findIndex((candidate) =>
    candidate.code === diagnostic.code && candidate.ringIndex === diagnostic.ringIndex && candidate.segmentIndex === diagnostic.segmentIndex,
  ) === index)
}

function rotateToStableStart(points: OutlinePoint[]): OutlinePoint[] {
  if (!points.length) return points
  let start = 0
  for (let index = 1; index < points.length; index++) {
    const candidate = points[index]!
    const current = points[start]!
    if (candidate.x < current.x || (candidate.x === current.x && candidate.y < current.y)) start = index
  }
  return [...points.slice(start), ...points.slice(0, start)]
}

function roundedSegments(points: OutlinePoint[], radius: number): OutlineSegment[] {
  if (points.length < 3) return []
  const orientation = Math.sign(signedArea(points)) || 1
  const corners = points.map((current, index) => {
    const previous = points[(index + points.length - 1) % points.length]!
    const next = points[(index + 1) % points.length]!
    const before = unit(current, previous)
    const after = unit(current, next)
    const convex = cross(previous, current, next) * orientation > EPSILON
    const bisector = unit({ x: 0, y: 0 }, add(before, after))
    const halfAngle = Math.acos(Math.max(-1, Math.min(1, before.x * after.x + before.y * after.y))) / 2
    const tangentDistance = halfAngle > EPSILON ? radius / Math.tan(halfAngle) : 0
    const amount = convex ? Math.min(tangentDistance, distance(previous, current) / 2, distance(current, next) / 2) : 0
    const effectiveRadius = halfAngle > EPSILON ? amount * Math.tan(halfAngle) : 0
    const centerDistance = Math.sin(halfAngle) > EPSILON ? effectiveRadius / Math.sin(halfAngle) : 0
    const center = add(current, bisector, centerDistance)
    return {
      entry: add(current, before, amount),
      exit: add(current, after, amount),
      corner: current,
      amount,
      convex,
      center,
      radius: effectiveRadius,
    }
  })
  const segments: OutlineSegment[] = []
  for (let index = 0; index < points.length; index++) {
    const current = corners[index]!
    const next = corners[(index + 1) % points.length]!
    if (current.amount > EPSILON && current.convex) {
      const mid = add(current.center, unit(current.center, current.corner), current.radius)
      segments.push({ kind: 'arc', start: current.entry, mid, end: current.exit })
    }
    segments.push({ kind: 'line', start: current.exit, end: next.entry })
  }
  return segments
}

export function buildTightOutline(rectangles: OutlineRectangle[], margin: number, cornerRadius = margin, withFillet = true): TightOutline {
  if (!rectangles.length) return { rings: [], bounds: null }
  const safeMargin = Math.max(0, margin)
  const polygons = rectangles.map((rectangle) => rectanglePolygon(rectangle, safeMargin))
  const unionRings = connectedRectangleGroups(rectangles, safeMargin).flatMap((group) => {
    if (group.length === 1) return polygons[group[0]!]!
    const groupPolygons = group.map((index) => polygons[index]!)
    const union = polygonClipping.union(groupPolygons[0]!, ...groupPolygons.slice(1))
    return union.flatMap((polygon) => polygon.map((ring) => ring))
  })
  const rings = unionRings
    .map((ring) => rotateToStableStart(simplifyRing(ring.map(([x, y]) => ({ x, y })))) )
    .filter((ring) => ring.length >= 3)
    .map((points) => ({ points, segments: withFillet ? roundedSegments(points, Math.max(0, cornerRadius)) : lineSegments(points), area: signedArea(points) }))
    .sort((a, b) => Math.min(...a.points.map((point) => point.x)) - Math.min(...b.points.map((point) => point.x)) ||
      Math.min(...a.points.map((point) => point.y)) - Math.min(...b.points.map((point) => point.y)))
  const all = rings.flatMap((ring) => ring.points)
  return {
    rings,
    bounds: all.length ? {
      minX: Math.min(...all.map((point) => point.x)),
      minY: Math.min(...all.map((point) => point.y)),
      maxX: Math.max(...all.map((point) => point.x)),
      maxY: Math.max(...all.map((point) => point.y)),
    } : null,
  }
}

/**
 * Build a plate outline that is guaranteed to be one connected material sheet.
 * The ordinary tight outline intentionally preserves disconnected rings for PCB
 * use. Plate generation uses this variant and adds deterministic minimum-width
 * material webs between the closest disconnected regions.
 */
function buildConnectedTightOutlineRaw(
  rectangles: OutlineRectangle[],
  margin: number,
  cornerRadius = margin,
  options: ConnectedTightOutlineOptions = { bridgeWidth: 2 },
): TightOutline {
  if (!rectangles.length) return { rings: [], bounds: null }
  assertFiniteOutline(rectangles)
  const startedAt = Date.now()
  const safeMargin = Math.max(0, margin)
  const bridgeWidth = Math.max(0.01, options.bridgeWidth)
  const minimumWebWidth = Math.max(0, options.minimumWebWidth ?? bridgeWidth)
  const repairPaddingMm = Math.max(0, options.repairPaddingMm ?? 0)
  // Explicit disconnected-region bridges must be wider than the threshold
  // used by repairNarrowNecks. Otherwise the generator creates a bridge that
  // immediately fails its own manufacturing validation.
  const effectiveBridgeWidth = Math.max(
    bridgeWidth,
    minimumWebWidth + repairPaddingMm + BRIDGE_SAFETY_EPSILON_MM,
  )
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_OUTLINE_TIMEOUT_MS)
  // Large synthetic/imported layouts are already represented by a connected
  // tight union in the common case. Avoid sending thousands of nearly
  // adjacent rectangles through the quadratic offset kernel; this preserves
  // the same tight polygon and keeps the worker responsive. Small/normal
  // keyboard layouts use the full manufacturing closing path below.
  if (rectangles.length > 128) {
    const fastOutline = buildTightOutline(rectangles, safeMargin, cornerRadius, false)
    if (fastOutline.rings.length <= 1) {
      const rings = fastOutline.rings.map((ring) => {
        const points = rotateToStableStart(removeShortEdges(ring.points))
        return { points, segments: lineSegments(points), area: signedArea(points) }
      })
      const result = { rings, bounds: fastOutline.bounds }
      const diagnostics = validateManufacturingOutline(result, minimumWebWidth)
      return { ...result, diagnostics, valid: diagnostics.length === 0 }
    }
  }
  const initialPolygons = morphologicalClosedPolygons(rectangles, safeMargin, minimumWebWidth, startedAt, timeoutMs)
  if (!initialPolygons.length) return { rings: [], bounds: null }
  // JSCAD can emit a contour with a tiny loop at a tangent join. Normalize
  // that contour once through polygon-clipping before exposing it to any
  // exporter; this is topology cleanup, not a second fillet operation.
  let normalizedClosed: Polygon[]
  try {
    normalizedClosed = polygonClipping.union(initialPolygons[0]!, ...initialPolygons.slice(1))
  } catch {
    // Some imported/rotated outlines can contain a sub-millimetre tangent
    // loop that polygon-clipping rejects even though the closed contour is
    // usable. Keep export deterministic and conservative: use the already
    // closed JSCAD contour without a second boolean operation.
    const fallback = buildTightOutline(rectangles, safeMargin, cornerRadius)
    const rings = fallback.rings.map((ring) => {
      const points = rotateToStableStart(removeShortEdges(ring.points))
      return { points, segments: lineSegments(points), area: signedArea(points) }
    })
    const result = { rings, bounds: fallback.bounds }
    const diagnostics = validateManufacturingOutline(result, minimumWebWidth)
    return { ...result, diagnostics, valid: diagnostics.length === 0 }
  }
  const normalizedPolygons = normalizedClosed.flatMap((polygon) => polygon.slice(0, 1).map((ring) => ring))
  if (!normalizedPolygons.length) return { rings: [], bounds: null }
  // JSCAD has already performed the union and closing. Avoid feeding its
  // rounded contour back through polygon-clipping when it is a single ring;
  // doing so can split tangent rounded segments into spurious polygons.
  if (normalizedPolygons.length === 1) {
    const points = removeShortEdges(simplifyRing(normalizedPolygons[0]!.map(([x, y]) => ({ x, y }))))
    if (points.length < 3) return { rings: [], bounds: null }
    const stablePoints = rotateToStableStart(points)
    const ring = { points: stablePoints, segments: lineSegments(stablePoints), area: signedArea(stablePoints) }
    const result = {
      rings: [ring],
      bounds: {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
      },
    }
    const diagnostics = validateManufacturingOutline(result, minimumWebWidth)
    return { ...result, diagnostics, valid: diagnostics.length === 0 }
  }
  // For multiple disconnected components, reconnect the original subject
  // rectangles. This avoids using coincident offset vertices as bridge anchors
  // while preserving the closed contour within each component.
  const bridgePolygons = rectangles.map((rectangle) => rectanglePolygon({
    ...rectangle,
    center: { x: quantize(rectangle.center.x), y: quantize(rectangle.center.y) },
    width: quantize(rectangle.width),
    height: quantize(rectangle.height),
  }, safeMargin))
  let union = polygonClipping.union(bridgePolygons[0]!, ...bridgePolygons.slice(1))

  while (union.length > 1) {
    assertOutlineTime(startedAt, timeoutMs)
    const pairCandidates: Array<{ first: number; second: number; a: OutlinePoint; b: OutlinePoint; distance: number }> = []
    for (let first = 0; first < union.length; first++) {
      const firstRing = union[first]?.[0]
      if (!firstRing) continue
      for (let second = first + 1; second < union.length; second++) {
        const secondRing = union[second]?.[0]
        if (!secondRing) continue
        const nearest = closestPoints(firstRing, secondRing)
        const candidate = {
          first,
          second,
          a: nearest.a,
          b: nearest.b,
          distance: nearest.distance,
        }
        pairCandidates.push(candidate)
      }
    }
    pairCandidates.sort((a, b) => a.distance - b.distance || a.first - b.first || a.second - b.second)
    const bestPair = pairCandidates.find((candidate) => {
      const bridge = bridgePolygon(candidate.a, candidate.b, effectiveBridgeWidth)
      return bridge.length > 0 && !options.protectedRectangles?.some((rectangle) =>
        polygonIntersectsRectangle(bridge, rectangle),
      )
    })
    if (!bestPair) {
      const blockedPair = pairCandidates[0]
      return {
        rings: [],
        bounds: null,
        diagnostics: [{
          code: 'OUTLINE_REPAIR_BLOCKED',
          message: 'No safe disconnected-region bridge could avoid a protected rectangle.',
          ...(blockedPair ? { focus: blockedPair.a } : {}),
        }],
        valid: false,
      }
    }
    const bridge = bridgePolygon(bestPair.a, bestPair.b, effectiveBridgeWidth)
    if (!bridge.length) return { rings: [], bounds: null }
    union = polygonClipping.union(union[0]!, ...union.slice(1), bridge)
  }

  const rings = union
    .flatMap((polygon) => polygon.slice(0, 1))
    .map((ring) => rotateToStableStart(removeShortEdges(simplifyRing(ring.map(([x, y]) => ({ x, y }))))))
    .filter((ring) => ring.length >= 3)
    .map((points) => ({ points, segments: lineSegments(points), area: signedArea(points) }))
    .sort((a, b) => Math.min(...a.points.map((point) => point.x)) - Math.min(...b.points.map((point) => point.x)) ||
      Math.min(...a.points.map((point) => point.y)) - Math.min(...b.points.map((point) => point.y)))
  const all = rings.flatMap((ring) => ring.points)
  const result = {
    rings,
    bounds: all.length ? {
      minX: Math.min(...all.map((point) => point.x)),
      minY: Math.min(...all.map((point) => point.y)),
      maxX: Math.max(...all.map((point) => point.x)),
      maxY: Math.max(...all.map((point) => point.y)),
    } : null,
  }
  const diagnostics = validateManufacturingOutline(result, minimumWebWidth)
  return { ...result, diagnostics, valid: diagnostics.length === 0 }
}

export function buildConnectedTightOutline(
  rectangles: OutlineRectangle[],
  margin: number,
  cornerRadius = margin,
  options: ConnectedTightOutlineOptions = { bridgeWidth: 2 },
): TightOutline {
  const repairPaddingMm = Math.max(0, options.repairPaddingMm ?? 0.05)
  const normalizedOptions = { ...options, repairPaddingMm }
  const raw = buildConnectedTightOutlineRaw(rectangles, margin, cornerRadius, normalizedOptions)
  const repairMode = options.repairMode ?? 'auto-repair'
  const minimumWebWidth = Math.max(0, options.minimumWebWidth ?? options.bridgeWidth)
  const rawDiagnostics = validateManufacturingOutline(raw, minimumWebWidth)
  if (repairMode === 'legacy-warning') {
    const critical = rawDiagnostics.filter((diagnostic) => diagnostic.code !== 'OUTLINE_NARROW_NECK_INVALID')
    if (critical.length === 0 && raw.rings.length) return { ...raw, diagnostics: rawDiagnostics, valid: true }
    return rectangularFallbackOutline(
      rectangles,
      margin,
      critical[0]?.message ?? 'The raw outline failed manufacturing geometry validation.',
      critical[0]?.focus,
    )
  }

  const repaired = repairNarrowNecks(raw, minimumWebWidth, normalizedOptions.protectedRectangles, repairPaddingMm)
  const diagnostics = [...repaired.outline.diagnostics ?? []]
  const stillNarrow = diagnostics.some((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID')
  const allDiagnostics = [...diagnostics, ...repaired.blocked]
  const critical = allDiagnostics.filter((diagnostic) =>
    diagnostic.code !== 'OUTLINE_NARROW_NECK_INVALID' || stillNarrow,
  )
  if (repaired.needsFallback || critical.length > 0 || !repaired.outline.rings.length) {
    const fallback = rectangularFallbackOutline(
      rectangles,
      margin,
      repaired.failureReason ?? allDiagnostics[0]?.message ?? 'The repaired outline failed manufacturing geometry validation.',
      repaired.repairFocusMm[0] ?? allDiagnostics[0]?.focus,
    )
    return {
      ...fallback,
      diagnostics: [...fallback.diagnostics ?? [], ...allDiagnostics],
      repairCount: repaired.repaired,
      ...(repaired.repairFocusMm.length ? { repairFocusMm: repaired.repairFocusMm } : {}),
    }
  }
  return {
    ...repaired.outline,
    diagnostics: allDiagnostics,
    repairCount: repaired.repaired,
    repairFocusMm: repaired.repairFocusMm,
    valid: true,
  }
}

/** Public manufacturing name used by both PCB and Plate generators. */
export const buildManufacturingOutline = buildConnectedTightOutline
