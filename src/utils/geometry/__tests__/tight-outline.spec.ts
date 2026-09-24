import { describe, expect, it } from 'vitest'
import {
  buildManufacturingOutline,
  buildTightOutline,
  pointInTightOutline,
  repairNarrowNecks,
  validateManufacturingOutline,
  type OutlineRectangle,
} from '../tight-outline'

describe('buildTightOutline', () => {
  it('unions overlapping rotated rectangles into a concave deterministic ring', () => {
    const rectangles: OutlineRectangle[] = [
      { center: { x: 0, y: 0 }, width: 10, height: 10 },
      { center: { x: 8, y: 8 }, width: 10, height: 10, rotation: 15 },
    ]
    const outline = buildTightOutline(rectangles, 1, 1)
    expect(outline.rings).toHaveLength(1)
    expect(outline.rings[0]!.points.length).toBeGreaterThan(4)
    expect(outline.rings[0]!.segments.some((segment) => segment.kind === 'arc')).toBe(true)
    const segments = outline.rings[0]!.segments
    expect(segments[segments.length - 1]!.end).toEqual(segments[0]!.start)
    expect(buildTightOutline(rectangles, 1, 1)).toEqual(outline)
  })

  it('preserves disconnected key groups as separate rings', () => {
    const outline = buildTightOutline([
      { center: { x: 0, y: 0 }, width: 10, height: 10 },
      { center: { x: 30, y: 0 }, width: 10, height: 10 },
    ], 1, 1)
    expect(outline.rings).toHaveLength(2)
    expect(outline.rings[0]!.segments.length).toBeGreaterThan(4)
    expect(outline.rings[1]!.segments.length).toBeGreaterThan(4)
  })

  it('closes a sub-minimum web while preserving a wider intentional concavity', () => {
    const narrowGap = buildManufacturingOutline([
      { center: { x: -5.5, y: 0 }, width: 10, height: 10 },
      { center: { x: 5.5, y: 0 }, width: 10, height: 10 },
    ], 0, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    expect(narrowGap.rings).toHaveLength(1)
    // The connected result contains a deterministic minimum-width web.
    expect(narrowGap.rings[0]!.segments.length).toBeGreaterThanOrEqual(4)

    const narrowConcavity = buildManufacturingOutline([
      { center: { x: -5.5, y: 0 }, width: 10, height: 20 },
      { center: { x: 5.5, y: 0 }, width: 10, height: 20 },
      { center: { x: 0, y: -8 }, width: 10, height: 4 },
    ], 0, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    expect(pointInTightOutline(narrowConcavity, { x: 0, y: 0 })).toBe(true)

    const wideConcavity = buildManufacturingOutline([
      { center: { x: -7, y: 0 }, width: 4, height: 20 },
      { center: { x: 7, y: 0 }, width: 4, height: 20 },
      { center: { x: 0, y: -8 }, width: 10, height: 4 },
    ], 0, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    expect(wideConcavity.rings).toHaveLength(1)
    expect(pointInTightOutline(wideConcavity, { x: 0, y: 5 })).toBe(false)
  })

  it('makes explicit disconnected bridges wider than the repair threshold', () => {
    const rectangles: OutlineRectangle[] = [
      { center: { x: -7, y: -5 }, width: 10, height: 10 },
      { center: { x: 7, y: 5 }, width: 10, height: 10 },
    ]
    const outline = buildManufacturingOutline(rectangles, 0, 1, {
      bridgeWidth: 2,
      minimumWebWidth: 2,
      repairPaddingMm: 0.05,
    })
    expect(outline.rings).toHaveLength(1)
    expect(outline.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK')).toBe(false)
    expect(outline.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID')).toBe(false)
    expect(outline.rings[0]!.points.some((point) => Math.abs(point.y - 1.0255) < 0.01)).toBe(true)
    expect(outline.rings[0]!.points.some((point) => Math.abs(point.y + 1.0255) < 0.01)).toBe(true)
  })

  it('remains stable at a floating-point width boundary', () => {
    const rectangles: OutlineRectangle[] = [
      { center: { x: -10, y: -5 }, width: 10, height: 10 },
      { center: { x: 10, y: 5 }, width: 10, height: 10 },
    ]
    const first = buildManufacturingOutline(rectangles, 0, 1, {
      bridgeWidth: 2.1,
      minimumWebWidth: 2.1,
      repairPaddingMm: 0.05,
    })
    const second = buildManufacturingOutline([...rectangles].reverse(), 0, 1, {
      bridgeWidth: 2.1,
      minimumWebWidth: 2.1,
      repairPaddingMm: 0.05,
    })
    expect(first).toEqual(second)
    expect(first.rings).toHaveLength(1)
    expect(first.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID')).toBe(false)
  })

  it('quantizes and orders manufacturing outlines deterministically', () => {
    const rectangles: OutlineRectangle[] = [
      { center: { x: 1.23456789, y: 2.34567891 }, width: 10.000001, height: 8.000001, rotation: 45 },
      { center: { x: 12.34567891, y: 2.34567889 }, width: 10.000001, height: 8.000001, rotation: -80 },
    ]
    const first = buildManufacturingOutline(rectangles, 1, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    const second = buildManufacturingOutline([...rectangles].reverse(), 1, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    expect(second).toEqual(first)
    expect(first.rings.flatMap((ring) => ring.points).every((point) =>
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      Math.abs(point.x * 100000 - Math.round(point.x * 100000)) < 1e-6 &&
      Math.abs(point.y * 100000 - Math.round(point.y * 100000)) < 1e-6,
    )).toBe(true)
  })

  it('repairs a narrow local neck without changing the repair policy deterministically', () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
      { x: 5.75, y: 10 }, { x: 5.75, y: 5 }, { x: 4.25, y: 5 },
      { x: 4.25, y: 10 }, { x: 0, y: 10 },
    ]
    const raw = {
      rings: [{ points, segments: points.map((start, index) => ({ kind: 'line' as const, start, end: points[(index + 1) % points.length]! })), area: 85 }],
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    }
    const legacyDiagnostics = validateManufacturingOutline(raw, 2)
    expect(legacyDiagnostics.some((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID')).toBe(true)
    const repaired = repairNarrowNecks(raw, 2)
    expect(repaired.repaired).toBeGreaterThan(0)
    expect(repaired.outline.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_NARROW_NECK_INVALID')).toBe(false)
    expect(repaired.outline.rings[0]!.points.length).toBeLessThanOrEqual(points.length)
    expect(repaired.outline.bounds?.maxX).toBeLessThan(10.2)
    expect(repaired.outline.bounds?.minX).toBeGreaterThan(-0.2)
    expect(repairNarrowNecks(raw, 2).outline).toEqual(repaired.outline)
    const blocked = repairNarrowNecks(raw, 2, [{ center: { x: 5, y: 7.5 }, width: 1.5, height: 5 }])
    expect(blocked.repaired).toBe(0)
    expect(blocked.blocked.some((diagnostic) => diagnostic.code === 'OUTLINE_REPAIR_BLOCKED')).toBe(true)
    expect(blocked.needsFallback).toBe(true)
  })

  it('does not cross a protected rectangle when selecting a disconnected bridge', () => {
    const outline = buildManufacturingOutline([
      { center: { x: -10, y: 0 }, width: 10, height: 10 },
      { center: { x: 10, y: 0 }, width: 10, height: 10 },
    ], 0, 1, {
      bridgeWidth: 2,
      minimumWebWidth: 2,
      repairPaddingMm: 0.05,
      protectedRectangles: [{ center: { x: 0, y: -5 }, width: 2.1, height: 2.1 }],
    })
    expect(outline.diagnostics?.some((diagnostic) => diagnostic.code === 'OUTLINE_RECTANGULAR_FALLBACK')).toBe(true)
  })

  it('detects spikes, short edges, and self-intersections before export', () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      { x: 10, y: 0 }, { x: 10.05, y: 0.01 },
    ]
    const segments = points.map((start, index) => ({
      kind: 'line' as const,
      start,
      end: points[(index + 1) % points.length]!,
    }))
    const diagnostics = validateManufacturingOutline({
      rings: [{ points, segments, area: 0 }],
      bounds: { minX: 0, minY: 0, maxX: 10.05, maxY: 10 },
    })
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'OUTLINE_SHORT_EDGE')).toBe(true)
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'OUTLINE_SELF_INTERSECTION')).toBe(true)
  })

  it('detects a local outward spike even when its edges are not short', () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 0.9 }, { x: 12, y: 1 },
      { x: 10, y: 1.1 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ]
    const segments = points.map((start, index) => ({
      kind: 'line' as const,
      start,
      end: points[(index + 1) % points.length]!,
    }))
    const diagnostics = validateManufacturingOutline({
      rings: [{ points, segments, area: 100 }],
      bounds: { minX: 0, minY: 0, maxX: 12, maxY: 10 },
    })
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'OUTLINE_SPIKE_INVALID')).toBe(true)
  })

  it.each([45, 75, 80])('keeps a rotated-key neck repair local at %s degrees', (rotation) => {
    const outline = buildManufacturingOutline([
      { center: { x: 0, y: 0 }, width: 19.05, height: 19.05 },
      { center: { x: 18.55, y: 18.55 }, width: 19.05, height: 19.05, rotation },
      { center: { x: 0, y: 19.55 }, width: 19.05, height: 19.05 },
    ], 0, 1, { bridgeWidth: 2, minimumWebWidth: 2 })
    expect(outline.rings).toHaveLength(1)
    expect(outline.valid).toBe(true)
    expect(outline.rings[0]!.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
})
