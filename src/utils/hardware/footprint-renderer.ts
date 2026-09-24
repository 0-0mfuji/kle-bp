import { FOOTPRINT_SNAPSHOTS, type Expression } from '@/data/footprints'
import { FOOTPRINTS } from '@/data/hardware-catalog'
import type { HardwareComponent } from '@/types/hardware'
import { uuid } from './identity'
import { round } from './geometry'

const child = (node: Expression, name: string) =>
  node.find((v): v is Expression => Array.isArray(v) && v[0] === name)
const quoted = new Set(['property', 'fp_text', 'descr', 'tags', 'layer', 'layers', 'uuid', 'path'])

function normalizeLegacyArc(node: Expression) {
  if (node[0] !== 'fp_arc' || child(node, 'mid')) return
  const start = child(node, 'start')
  const end = child(node, 'end')
  const angle = child(node, 'angle')
  if (!start || !end || !angle) return

  const sx = Number(start[1])
  const sy = Number(start[2])
  const ex = Number(end[1])
  const ey = Number(end[2])
  const sweepDegrees = Number(angle[1])
  const dx = ex - sx
  const dy = ey - sy
  const chord = Math.hypot(dx, dy)

  // KiCad 9 stores footprint arcs as start/mid/end. Convert the legacy
  // start/end/angle representation while retaining the original geometry.
  if (![sx, sy, ex, ey, sweepDegrees].every(Number.isFinite) || chord === 0) return
  const sweep = (Math.abs(sweepDegrees) * Math.PI) / 180
  const midpoint: [number, number] = [(sx + ex) / 2, (sy + ey) / 2]
  let arcMid: [number, number] = midpoint
  if (sweep > 0 && sweep < Math.PI * 2) {
    const offset = chord / (2 * Math.tan(sweep / 2))
    const side = Math.sign(sweepDegrees) || 1
    const center: [number, number] = [
      midpoint[0] + (-dy / chord) * offset * side,
      midpoint[1] + (dx / chord) * offset * side,
    ]
    const halfTurn = (sweepDegrees * Math.PI) / 360
    const vx = sx - center[0]
    const vy = sy - center[1]
    arcMid = [
      center[0] + vx * Math.cos(halfTurn) - vy * Math.sin(halfTurn),
      center[1] + vx * Math.sin(halfTurn) + vy * Math.cos(halfTurn),
    ]
  }

  const angleIndex = node.indexOf(angle)
  if (angleIndex >= 0) node.splice(angleIndex, 1)
  const endIndex = node.indexOf(end)
  node.splice(endIndex >= 0 ? endIndex : node.length, 0, [
    'mid',
    round(arcMid[0]),
    round(arcMid[1]),
  ])

  // Use the canonical KiCad 9 child order as well. Older snapshots place
  // `layer` before `stroke`, while the current grammar emits `stroke` first.
  const stroke = child(node, 'stroke')
  const layer = child(node, 'layer')
  if (stroke && layer && node.indexOf(stroke) > node.indexOf(layer)) {
    node.splice(node.indexOf(stroke), 1)
    node.splice(node.indexOf(layer), 0, stroke)
  }
}

// Some reviewed footprint snapshots were parsed with KiCad's `hide` marker as
// a bare scalar instead of the complete `(hide yes)` expression.  Leaving that
// scalar in the expression graph makes the serializer emit `"hide"`, which is
// not valid in a property or fp_text node.  Normalize it before any placement
// edits so all generated PCB files use the KiCad grammar consistently.
function normalizeKiCadTokens(node: Expression) {
  normalizeLegacyArc(node)
  for (let i = node.length - 1; i >= 1; i--) {
    if (node[i] === 'hide') node.splice(i, 1, ['hide', 'yes'])
  }
  for (const value of node) if (Array.isArray(value)) normalizeKiCadTokens(value)
}

function serialize(node: Expression): string {
  return `(${node
    .map((v, i) => {
      if (Array.isArray(v)) return serialize(v)
      if (typeof v === 'number') return String(round(v))
      const tag = String(node[0])
      const quote =
        i > 0 &&
        (quoted.has(tag) ||
          (tag === 'pad' && i === 1) ||
          (tag === 'footprint' && i === 1) ||
          (tag === 'net' && i === 2))
      // fp_text's type and property's effects remain grammar keywords.
      return quote && !(tag === 'fp_text' && i === 1) ? JSON.stringify(v) : v
    })
    .join(' ')})`
}

/** Instantiates a parsed library graph without approximating pads or package artwork. */
export function renderFootprint(
  id: string,
  component?: HardwareComponent,
  path?: string,
  netForPad?: (pin: string) => { number: number; name: string } | null,
) {
  const snapshot = FOOTPRINT_SNAPSHOTS[id]
  if (!snapshot) throw new Error(`No reviewed footprint snapshot: ${id}`)
  const nodes: Expression[] = JSON.parse(JSON.stringify(snapshot.nodes))
  for (const node of nodes) normalizeKiCadTokens(node)
  const back = component?.position.side === 'back'
  const angle = (back ? 180 : 0) - (component?.position.rotation ?? 0)
  const instance = component?.id ?? `library/${id}`
  function visit(node: Expression, key: string) {
    // KiCad library snapshots can contain the legacy `%R` placeholder as a
    // user fp_text.  The exporter also emits the canonical `Reference`
    // property below, so leaving this placeholder visible produces two
    // reference labels for every affected footprint (usually one on F.Fab and
    // one on F/B.SilkS).  Keep arbitrary user artwork intact, but suppress
    // only the duplicate metadata placeholders.
    if (
      node[0] === 'fp_text' &&
      (node[2] === '${REFERENCE}' || node[2] === '${VALUE}') &&
      !child(node, 'hide')
    )
      node.push(['hide', 'yes'])

    // Library UUIDs must never be shared between instances.
    for (let i = node.length - 1; i >= 0; i--)
      if (Array.isArray(node[i]) && ['uuid', 'tstamp'].includes(String((node[i] as Expression)[0])))
        node.splice(i, 1)
    if (['start', 'end', 'mid', 'center', 'xy', 'at'].includes(String(node[0]))) {
      if (back && typeof node[2] === 'number') node[2] = -node[2]
      if (node[0] === 'at') node[3] = angle + (back ? -Number(node[3] ?? 0) : Number(node[3] ?? 0))
    }
    if (back && ['layer', 'layers'].includes(String(node[0])))
      for (let i = 1; i < node.length; i++)
        if (typeof node[i] === 'string') node[i] = (node[i] as string).replace(/^F\./, 'B.')
    node.forEach((v, i) => {
      if (Array.isArray(v)) visit(v, `${key}/${i}`)
    })
    if (
      [
        'property',
        'pad',
        'fp_line',
        'fp_arc',
        'fp_circle',
        'fp_rect',
        'fp_poly',
        'fp_text',
      ].includes(String(node[0]))
    )
      node.push(['uuid', uuid(`${instance}/${key}`)])
    if (back && ['property', 'fp_text'].includes(String(node[0]))) {
      const effects = child(node, 'effects')
      if (effects) {
        const justify = child(effects, 'justify')
        if (justify) justify.push('mirror')
        else effects.push(['justify', 'mirror'])
      }
    }
  }
  for (const [i, node] of nodes.entries()) {
    // Preserve source pad geometry. Move silk segments obstructed by mask to the
    // assembly drawing instead of suppressing a fabrication warning.
    if (node[0] === 'fp_line' && child(node, 'layer')?.[1] === 'F.SilkS') {
      const start = child(node, 'start')!,
        end = child(node, 'end')!
      const width = Number(child(child(node, 'stroke')!, 'width')?.[1] ?? 0.12)
      const gap = 0.15 + width / 2
      if (
        snapshot.pads.some(
          (pad) =>
            Math.max(Number(start[1]), Number(end[1])) >= pad.x - pad.width / 2 - gap &&
            Math.min(Number(start[1]), Number(end[1])) <= pad.x + pad.width / 2 + gap &&
            Math.max(Number(start[2]), Number(end[2])) >= pad.y - pad.height / 2 - gap &&
            Math.min(Number(start[2]), Number(end[2])) <= pad.y + pad.height / 2 + gap,
        )
      )
        child(node, 'layer')![1] = 'F.Fab'
    }
    if (node[0] === 'property') {
      if (node[1] === 'Reference') {
        node[2] = component?.reference ?? 'REF**'
        const size = child(child(child(node, 'effects')!, 'font')!, 'size')!
        size[1] = Math.max(0.8, Number(size[1]))
        size[2] = Math.max(0.8, Number(size[2]))
        const at = child(node, 'at')!
        at[1] = 0
        at[2] = FOOTPRINTS[id]!.body.minY - 1.4
        at[3] = 0
      }
      if (node[1] === 'Value') {
        node[2] = component?.value ?? id
        if (!child(node, 'hide')) node.push(['hide', 'yes'])
      }
    }
    if (node[0] === 'pad') {
      const net = netForPad?.(String(node[1]))
      if (net) node.push(['net', net.number, net.name])
    }
    visit(node, String(i))
  }
  if (!nodes.some((node) => child(node, 'layer')?.[1] === `${back ? 'B' : 'F'}.CrtYd`)) {
    const b = { ...FOOTPRINTS[id]!.body }
    for (const pad of snapshot.pads) {
      b.minX = Math.min(b.minX, pad.x - pad.width / 2)
      b.maxX = Math.max(b.maxX, pad.x + pad.width / 2)
      b.minY = Math.min(b.minY, pad.y - pad.height / 2)
      b.maxY = Math.max(b.maxY, pad.y + pad.height / 2)
    }
    nodes.push([
      'fp_rect',
      ['start', b.minX - 0.25, b.minY - 0.25],
      ['end', b.maxX + 0.25, b.maxY + 0.25],
      ['stroke', ['width', 0.05], ['type', 'solid']],
      ['fill', 'none'],
      ['layer', `${back ? 'B' : 'F'}.CrtYd`],
      ['uuid', uuid(`${instance}/courtyard`)],
    ])
  }
  const result: Expression = ['footprint', component ? `Keyboard:${id}` : id]
  if (!component) result.push(['version', 20241229], ['generator', 'keyboard_hardware_cad'])
  else
    result.push(
      ['at', component.position.x, component.position.y, angle],
      ['uuid', uuid(`footprint/${instance}`)],
    )
  if (path) result.push(['path', path])
  result.push(...nodes)
  return serialize(result) + '\n'
}
