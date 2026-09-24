import { describe, expect, it } from 'vitest'
import {
  hardwareArrowDirectionForRotation,
  hardwareLayoutDescriptor,
} from '../hardware-layout'
import { FOOTPRINTS } from '../hardware-catalog'

describe('hardware layout direction semantics', () => {
  it('uses insertion direction for USB and battery connectors', () => {
    expect(hardwareLayoutDescriptor('xiao-rp2040')?.directionLabel).toBe('差し込み方向')
    expect(hardwareArrowDirectionForRotation('xiao-rp2040', 0)).toBe('bottom')
    expect(hardwareArrowDirectionForRotation('battery-connector-jst-ph-2', 0)).toBe('left')
  })

  it('marks power switches as a bidirectional long-axis operation control', () => {
    expect(hardwareLayoutDescriptor('power-switch-msk-12c02')?.directionMode).toBe('operation-axis')
    expect(hardwareLayoutDescriptor('power-switch-msk-12c02')?.directionLabel).toBe('操作方向（長辺）')
    expect(hardwareArrowDirectionForRotation('power-switch-msk-12c02', 0)).toBe('right')
    const body = FOOTPRINTS.PowerSwitch_MSK12C02!.body
    expect(body.maxX - body.minX).toBeGreaterThan(body.maxY - body.minY)
  })

  it.each([
    [0, 'bottom'],
    [90, 'left'],
    [180, 'top'],
    [270, 'right'],
  ] as const)('rotates an insertion arrow with the part at %s degrees', (angle, expected) => {
    expect(hardwareArrowDirectionForRotation('xiao-rp2040', angle)).toBe(expected)
  })
})
