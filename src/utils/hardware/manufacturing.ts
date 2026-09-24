import { FOOTPRINTS } from '@/data/hardware-catalog'
import type { BoardHole, HardwareComponent, KeyboardHardwareModel } from '@/types/hardware'
import { componentBounds, rotate, round } from './geometry'

// Conservative initial-placement rules for ordinary drilled/routed features.
// JLCPCB: pad hole-to-hole 0.45 mm; NPTH-to-copper 0.2 mm.
// https://jlcpcb.com/capabilities/Capab
export const HOLE_CLEARANCE_MM = 0.5
export const HOLE_COPPER_CLEARANCE_MM = 0.5

type Shape = { x: number; y: number; width: number; height: number; rotation: number; circle: boolean }
function shape(component: HardwareComponent, x: number, y: number, width: number, height: number, circle = false): Shape {
  const p = rotate(component.position.side === 'back' ? -x : x, y, component.position.rotation)
  return { x: p.x + component.position.x, y: p.y + component.position.y, width, height, rotation: component.position.rotation, circle }
}

export function componentHoles(component: HardwareComponent): Shape[] {
  const holes = (FOOTPRINTS[component.footprint]?.pads ?? [])
    .filter(pad => pad.type !== 'smd' && pad.drill !== undefined)
    .map(pad => {
      // Oval drills use the enclosing pad rectangle, conservatively, until
      // the imported catalog carries both drill axes and pad rotation.
      const diameter = typeof pad.drill === 'number' ? pad.drill : undefined
      return shape(component, pad.x, pad.y, diameter ?? pad.width, diameter ?? pad.height, diameter !== undefined)
    })
  // Enclose the full routed aperture (including the official corner arcs).
  // These are openings, not the LED package body or copper-pad envelope.
  if (component.footprint === 'LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount')
    holes.push(shape(component, 0, 0, 3.6, 3.4))
  if (component.footprint === 'LED_SK6812MINI-E_BL')
    holes.push(shape(component, 0, 0, 3.5, 3.2))
  return holes
}

function pads(component: HardwareComponent): Shape[] {
  return (FOOTPRINTS[component.footprint]?.pads ?? [])
    .filter(pad => pad.type !== 'np_thru_hole')
    .map(pad => shape(component, pad.x, pad.y, pad.width, pad.height))
}

function corners(s: Shape) {
  return [-1, 1].flatMap(x => [-1, 1].map(y => {
    const p = rotate(x * s.width / 2, y * s.height / 2, s.rotation)
    return { x: p.x + s.x, y: p.y + s.y }
  }))
}

/** Conservative rectangle clearance, exact for two circles or circle/rectangle. */
export function tooClose(a: Shape, b: Shape, clearance: number): boolean {
  if (a.circle && b.circle)
    return Math.hypot(a.x - b.x, a.y - b.y) < (a.width + b.width) / 2 + clearance - 1e-6
  if (a.circle || b.circle) {
    const c = a.circle ? a : b
    const r = a.circle ? b : a
    const p = rotate(c.x - r.x, c.y - r.y, -r.rotation)
    return Math.hypot(Math.max(0, Math.abs(p.x) - r.width / 2), Math.max(0, Math.abs(p.y) - r.height / 2)) < c.width / 2 + clearance - 1e-6
  }
  const ac = corners(a), bc = corners(b)
  for (const angle of [a.rotation, a.rotation + 90, b.rotation, b.rotation + 90]) {
    const axis = rotate(1, 0, angle)
    const ap = ac.map(p => p.x * axis.x + p.y * axis.y)
    const bp = bc.map(p => p.x * axis.x + p.y * axis.y)
    if (Math.max(...ap) + clearance <= Math.min(...bp) + 1e-6 || Math.max(...bp) + clearance <= Math.min(...ap) + 1e-6) return false
  }
  return true
}

export function manufacturingConflict(a: HardwareComponent, b: HardwareComponent): boolean {
  if (a.boardSide !== b.boardSide) return false
  if (a.bounds.maxX + 1 < b.bounds.minX || b.bounds.maxX + 1 < a.bounds.minX ||
      a.bounds.maxY + 1 < b.bounds.minY || b.bounds.maxY + 1 < a.bounds.minY) return false
  const ah = componentHoles(a), bh = componentHoles(b)
  return ah.some(h => bh.some(other => tooClose(h, other, HOLE_CLEARANCE_MM))) ||
    ah.some(h => pads(b).some(p => tooClose(h, p, HOLE_COPPER_CLEARANCE_MM))) ||
    bh.some(h => pads(a).some(p => tooClose(h, p, HOLE_COPPER_CLEARANCE_MM)))
}

function body(component: HardwareComponent): Shape {
  const b = FOOTPRINTS[component.footprint]!.body
  return shape(component, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, b.maxX - b.minX, b.maxY - b.minY)
}

/** Place per-key RGB parts in key-local coordinates, without moving switches. */
export function placeRgb(components: HardwareComponent[], fixedHoles: BoardHole[] = []) {
  const movable = new Set([
    ...components.filter(c => c.kind === 'led'),
    ...components.filter(c => c.kind === 'diode'),
    ...components.filter(c => c.id.endsWith('/led-cap')),
  ])
  const failures: string[] = []
  const placed = components.filter(c => !movable.has(c))
  for (const original of movable) {
    const sw = components.find(c => c.layoutKeyId === original.layoutKeyId && c.kind === 'switch')!
    const isLed = original.kind === 'led'
    const diodeLocal = rotate(original.position.x - sw.position.x, original.position.y - sw.position.y, -sw.position.rotation)
    const offsets = original.kind === 'diode'
      ? [[diodeLocal.x, diodeLocal.y], [7, 3], [-7, 3], [7, -3], [-7, -3], [5.5, 7], [-5.5, 7]]
      : isLed
      ? [[0, -5.25], [0, 5.25], [0, -6.5], [0, 6.5], [0, -7.5], [0, 7.5], [0, -8], [0, 8]]
      : [[5.5, -5.25], [-5.5, -5.25], [5.5, 5.25], [-5.5, 5.25], [7.5, -3], [-7.5, -3], [7.5, 3], [-7.5, 3]]
    let found = false
    for (const [x, y] of offsets) {
      const delta = rotate(x!, y!, sw.position.rotation)
      const candidate = { ...original, position: { ...original.position, x: round(sw.position.x + delta.x), y: round(sw.position.y + delta.y) } }
      candidate.bounds = componentBounds(candidate)
      const hitsFixedHole = fixedHoles.some(hole => hole.boardSide === candidate.boardSide &&
        [...componentHoles(candidate), ...pads(candidate), body(candidate)].some(s => tooClose(s, boardHoleShape(hole), HOLE_CLEARANCE_MM)))
      const valid = !hitsFixedHole && placed.every(other => {
        if (other.boardSide !== candidate.boardSide) return true
        if (manufacturingConflict(candidate, other)) return false
        // Through-hole pads occupy both faces. Switch housings do not: LEDs
        // intentionally sit below the switch, but never in its holes/pads.
        if (pads(candidate).some(p => pads(other).some(q => tooClose(p, q, 0.2)))) return false
        return other.position.side !== candidate.position.side || other.kind === 'switch' || !tooClose(body(candidate), body(other), 0.2)
      })
      if (valid) {
        found = true
        original.position = candidate.position
        original.bounds = candidate.bounds
        break
      }
    }
    // No valid candidate: retain deterministic coordinates and let validation
    // block export with an actionable manufacturing error.
    if (!found) failures.push(original.reference)
    placed.push(original)
  }
  return failures
}

export function boardHoleShape(hole: BoardHole): Shape {
  return { x: hole.x, y: hole.y, width: hole.drillMm, height: hole.drillMm, circle: true, rotation: 0 }
}

export function manufacturingIssues(model: KeyboardHardwareModel): string[] {
  const issues: string[] = []
  for (let i = 0; i < model.components.length; i++) {
    const a = model.components[i]!
    for (const b of model.components.slice(i + 1))
      if (manufacturingConflict(a, b)) issues.push(`${a.reference} / ${b.reference}: hole or routed opening clearance is below ${HOLE_CLEARANCE_MM} mm.`)
  }
  const sides = model.architecture === 'wired-split' ? ['left', 'right'] as const : [undefined]
  for (const side of sides) {
    const holes = side
      ? [...(model.board.sideMountingHoles?.[side] ?? []), ...(model.board.sideStabilizerHoles?.[side] ?? [])]
      : [...model.board.mountingHoles, ...model.board.stabilizerHoles]
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i]!, h = boardHoleShape(hole)
      for (const other of holes.slice(i + 1))
        if (tooClose(h, boardHoleShape(other), HOLE_CLEARANCE_MM)) issues.push(`${hole.id} / ${other.id}: insufficient hole spacing.`)
      for (const c of model.components.filter(c => c.boardSide === side))
        if (componentHoles(c).some(other => tooClose(h, other, HOLE_CLEARANCE_MM)) || pads(c).some(p => tooClose(h, p, HOLE_COPPER_CLEARANCE_MM)))
          issues.push(`${hole.id} / ${c.reference}: insufficient hole/pad clearance.`)
    }
  }
  return issues
}
