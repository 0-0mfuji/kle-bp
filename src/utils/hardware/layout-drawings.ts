import polygonClipping, { type Polygon } from 'polygon-clipping'
import type { KeyboardHardwareModel } from '@/types/hardware'
import { isMatrixKey, layoutKeyId, uuid } from './identity'
import { rotate, round } from './geometry'

/** Layout envelopes, not manufactured keycap dimensions or board cuts. */
export function keyOutlineDrawing(model: KeyboardHardwareModel, boardSide?: 'left' | 'right'): string {
  const sx = Number(model.layout.metadata.spacing_x ?? 19.05)
  const sy = Number(model.layout.metadata.spacing_y ?? 19.05)
  return model.layout.keys
    .flatMap((key, index) => {
      if (!isMatrixKey(key)) return []
      const id = layoutKeyId(key, index)
      if (boardSide && model.split.assignments[id] !== boardSide) return []
      const ox = (key.rotation_x ?? 0) * sx,
        oy = (key.rotation_y ?? 0) * sy
      const rectangle = (x: number, y: number, width: number, height: number): Polygon => [
        [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
          [x, y],
        ],
      ]
      const outline = polygonClipping.union(
        rectangle(key.x, key.y, key.width, key.height),
        rectangle(
          key.x + (key.x2 ?? 0),
          key.y + (key.y2 ?? 0),
          key.width2 || key.width,
          key.height2 || key.height,
        ),
      )
      return outline.flatMap((polygon, polygonIndex) =>
        polygon.flatMap((ring, ringIndex) => {
          const corners = ring.slice(0, -1).map(([x, y]) => {
            // switchRotation rotates the switch, not its keycap envelope.
            const p = rotate(x * sx - ox, y * sy - oy, key.rotation_angle ?? 0)
            return { x: round(p.x + ox), y: round(p.y + oy) }
          })
          return corners.map((p, i) => {
            const next = corners[(i + 1) % corners.length]!
            return `(gr_line (start ${p.x} ${p.y}) (end ${next.x} ${next.y}) (stroke (width 0.1) (type solid)) (layer "Dwgs.User") (uuid "${uuid(`key-outline/${id}/${polygonIndex}/${ringIndex}/${i}`)}"))`
          })
        }),
      )
    })
    .join('\n')
}
