import type { Key } from '@adamws/kle-serial'
import { FOOTPRINTS } from '@/data/hardware-catalog'
import type { Bounds, HardwareComponent } from '@/types/hardware'

const GEOMETRY_EPSILON = 1e-6

type Point = { x: number; y: number }
type Rect = { type: 'rect'; center: Point; width: number; height: number; rotation: number }
type Circle = { type: 'circle'; center: Point; radius: number }
type CollisionShape = (Rect | Circle) & { kind: 'housing' | 'pad' | 'hole' | 'body' }
const collisionShapeCache = new WeakMap<HardwareComponent, CollisionShape[]>()
const collisionShapeBoundsCache = new WeakMap<object, Bounds>()

export type CollisionReason =
  | 'Pad to Pad collision'
  | 'Pad to Mounting hole collision'
  | 'Mounting hole collision'
  | 'Housing to Housing collision'
  | 'Housing to Pad collision'
  | 'Housing to Mounting hole collision'
  | 'Footprint body collision'

const transformPoint = (point: Point, component: HardwareComponent): Point => {
  const sideX = component.position.side === 'back' ? -point.x : point.x
  const rotated = rotate(sideX, point.y, component.position.rotation)
  return { x: rotated.x + component.position.x, y: rotated.y + component.position.y }
}

const switchHousing = (id: string): { width: number; height: number } =>
  id.startsWith('Choc') ? { width: 15.6, height: 15.6 } : { width: 14, height: 14 }

function collisionShapes(component: HardwareComponent): CollisionShape[] {
  const cached = collisionShapeCache.get(component)
  if (cached) return cached
  const definition = FOOTPRINTS[component.footprint]
  if (!definition) return []
  if (definition.collisionKind === 'body') {
    const center = transformPoint({
      x: (definition.body.minX + definition.body.maxX) / 2,
      y: (definition.body.minY + definition.body.maxY) / 2,
    }, component)
    const shapes: CollisionShape[] = [{
      kind: 'body',
      type: 'rect',
      center,
      width: definition.body.maxX - definition.body.minX,
      height: definition.body.maxY - definition.body.minY,
      rotation: component.position.rotation,
    }]
    collisionShapeCache.set(component, shapes)
    return shapes
  }

  const housing = switchHousing(component.footprint)
  const shapes: CollisionShape[] = [{
    kind: 'housing',
    type: 'rect',
    center: transformPoint({ x: 0, y: 0 }, component),
    width: housing.width,
    height: housing.height,
    rotation: component.position.rotation,
  }]
  for (const pad of definition.pads) {
    const center = transformPoint({ x: pad.x, y: pad.y }, component)
    if (pad.type === 'np_thru_hole') {
      shapes.push({ kind: 'hole', type: 'circle', center, radius: Math.max(pad.width, pad.height) / 2 })
    } else {
      shapes.push({
        kind: 'pad',
        type: 'rect',
        center,
        width: pad.width,
        height: pad.height,
        rotation: component.position.rotation,
      })
    }
  }
  collisionShapeCache.set(component, shapes)
  return shapes
}

function rectangleCorners(rect: Rect): Point[] {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const point = rotate(x! * rect.width / 2, y! * rect.height / 2, rect.rotation)
    return { x: point.x + rect.center.x, y: point.y + rect.center.y }
  })
}

function shapeBounds(shape: CollisionShape): Bounds {
  const cached = collisionShapeBoundsCache.get(shape)
  if (cached) return cached
  const bounds = shape.type === 'circle'
    ? {
        minX: shape.center.x - shape.radius,
        minY: shape.center.y - shape.radius,
        maxX: shape.center.x + shape.radius,
        maxY: shape.center.y + shape.radius,
      }
    : rectangleCorners(shape).reduce((result, point) => ({
        minX: Math.min(result.minX, point.x),
        minY: Math.min(result.minY, point.y),
        maxX: Math.max(result.maxX, point.x),
        maxY: Math.max(result.maxY, point.y),
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  collisionShapeBoundsCache.set(shape, bounds)
  return bounds
}

function project(points: Point[], axis: Point) {
  const values = points.map(point => point.x * axis.x + point.y * axis.y)
  return { min: Math.min(...values), max: Math.max(...values) }
}

function rectanglesOverlap(a: Rect, b: Rect): boolean {
  const aPoints = rectangleCorners(a)
  const bPoints = rectangleCorners(b)
  for (const points of [aPoints, bPoints]) {
    for (let index = 0; index < points.length; index++) {
      const current = points[index]!
      const next = points[(index + 1) % points.length]!
      const axis = { x: current.y - next.y, y: next.x - current.x }
      const first = project(aPoints, axis)
      const second = project(bPoints, axis)
      if (first.max <= second.min + GEOMETRY_EPSILON || second.max <= first.min + GEOMETRY_EPSILON)
        return false
    }
  }
  return true
}

function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.center.x - b.center.x
  const dy = a.center.y - b.center.y
  const radius = a.radius + b.radius
  return dx * dx + dy * dy < radius * radius - GEOMETRY_EPSILON
}

function circleRectangleOverlap(circle: Circle, rectangle: Rect): boolean {
  const relative = { x: circle.center.x - rectangle.center.x, y: circle.center.y - rectangle.center.y }
  const local = rotate(relative.x, relative.y, -rectangle.rotation)
  const closest = {
    x: Math.max(-rectangle.width / 2, Math.min(rectangle.width / 2, local.x)),
    y: Math.max(-rectangle.height / 2, Math.min(rectangle.height / 2, local.y)),
  }
  const dx = local.x - closest.x
  const dy = local.y - closest.y
  return dx * dx + dy * dy < circle.radius * circle.radius - GEOMETRY_EPSILON
}

function shapesOverlap(a: CollisionShape, b: CollisionShape): boolean {
  if (a.type === 'circle' && b.type === 'circle') return circlesOverlap(a, b)
  if (a.type === 'circle' && b.type === 'rect') return circleRectangleOverlap(a, b)
  if (a.type === 'rect' && b.type === 'circle') return circleRectangleOverlap(b, a)
  if (a.type === 'rect' && b.type === 'rect') return rectanglesOverlap(a, b)
  return false
}

function collisionReason(a: CollisionShape['kind'], b: CollisionShape['kind']): CollisionReason {
  const kinds = [a, b].sort().join(':')
  if (kinds === 'pad:pad') return 'Pad to Pad collision'
  if (kinds === 'hole:pad') return 'Pad to Mounting hole collision'
  if (kinds === 'hole:hole') return 'Mounting hole collision'
  if (kinds === 'housing:housing') return 'Housing to Housing collision'
  if (kinds === 'housing:pad') return 'Housing to Pad collision'
  return 'Housing to Mounting hole collision'
}

export function collisionReasons(a: HardwareComponent, b: HardwareComponent): CollisionReason[] {
  const reasons = new Set<CollisionReason>()
  const firstShapes = collisionShapes(a)
  const secondShapes = collisionShapes(b)
  for (const first of firstShapes)
    for (const second of secondShapes) {
      const firstBounds = shapeBounds(first)
      const secondBounds = shapeBounds(second)
      if (
        firstBounds.maxX <= secondBounds.minX + GEOMETRY_EPSILON ||
        secondBounds.maxX <= firstBounds.minX + GEOMETRY_EPSILON ||
        firstBounds.maxY <= secondBounds.minY + GEOMETRY_EPSILON ||
        secondBounds.maxY <= firstBounds.minY + GEOMETRY_EPSILON
      ) continue
      if (shapesOverlap(first, second)) {
        if (first.kind === 'body' || second.kind === 'body') reasons.add('Footprint body collision')
        else reasons.add(collisionReason(first.kind, second.kind))
      }
    }
  return [...reasons]
}
export const round = (value: number) => Math.round(value * 1e6) / 1e6
export function rotate(x: number, y: number, angle: number) {
  const r = (angle * Math.PI) / 180
  return {
    x: round(x * Math.cos(r) - y * Math.sin(r)),
    y: round(x * Math.sin(r) + y * Math.cos(r)),
  }
}

/**
 * Return a key's visual center X in layout units after applying its KLE
 * rotation transform. Split assignment must use the same coordinate space as
 * the canvas, rather than the unrotated key origin.
 */
export function rotatedKeyCenterX(key: Pick<Key, 'x' | 'y' | 'width' | 'height' | 'rotation_angle' | 'rotation_x' | 'rotation_y'>): number {
  const angle = key.rotation_angle ?? 0
  const originX = key.rotation_x ?? 0
  const originY = key.rotation_y ?? 0
  return round(
    rotate(
      key.x + key.width / 2 - originX,
      key.y + key.height / 2 - originY,
      angle,
    ).x + originX,
  )
}
export function componentBounds(
  component: Pick<HardwareComponent, 'position' | 'footprint'>,
): Bounds {
  const definition = FOOTPRINTS[component.footprint]
  if (!definition) throw new Error(`Missing physical outline: ${component.footprint}`)
  const bounds = { ...definition.body }
  for (const pad of definition.pads) {
    bounds.minX = Math.min(bounds.minX, pad.x - pad.width / 2)
    bounds.maxX = Math.max(bounds.maxX, pad.x + pad.width / 2)
    bounds.minY = Math.min(bounds.minY, pad.y - pad.height / 2)
    bounds.maxY = Math.max(bounds.maxY, pad.y + pad.height / 2)
  }
  const points = [bounds.minX, bounds.maxX].flatMap((x) =>
    [bounds.minY, bounds.maxY].map((y) => {
      const p = rotate(component.position.side === 'back' ? -x : x, y, component.position.rotation)
      return { x: p.x + component.position.x, y: p.y + component.position.y }
    }),
  )
  return {
    minX: round(Math.min(...points.map((p) => p.x))),
    minY: round(Math.min(...points.map((p) => p.y))),
    maxX: round(Math.max(...points.map((p) => p.x))),
    maxY: round(Math.max(...points.map((p) => p.y))),
  }
}

export function overlaps(a: HardwareComponent, b: HardwareComponent): boolean {
  return collisionReasons(a, b).length > 0
}
