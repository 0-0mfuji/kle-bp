import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKeyboardStore } from '../keyboard'
import { useHardwareModelStore } from '../hardwareModel'
import { layoutKeyId } from '@/utils/hardware/identity'

describe('Hardware CAD editor integration', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('keeps IDs and controller/device quantities in sync with undo, redo and deletion', () => {
    const keyboard = useKeyboardStore(),
      hardware = useHardwareModelStore()
    keyboard.addKey({ x: 0, y: 0 })
    const id = layoutKeyId(keyboard.keys[0]!, 0)
    keyboard.addKey({
      x: 3,
      y: 0,
      width: 2,
      height: 2,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-rp2040',
    })
    expect(hardware.model.blocks).toHaveLength(1)
    keyboard.deleteKeys()
    expect(hardware.model.validation.some((i) => i.code === 'CONTROLLER_COUNT')).toBe(true)
    keyboard.undo()
    expect(hardware.model.blocks).toHaveLength(1)
    keyboard.redo()
    expect(hardware.model.blocks).toHaveLength(0)
    expect(layoutKeyId(keyboard.keys[0]!, 0)).toBe(id)
    keyboard.addKey({ x: 3, y: 0, decal: true, profile: 'hardware', st: 'hardware:ec11' })
    keyboard.addKey({ x: 5, y: 0, decal: true, profile: 'hardware', st: 'hardware:ec11' })
    expect(hardware.devices).toEqual(['ec11', 'ec11'])
    keyboard.undo()
    expect(hardware.devices).toEqual(['ec11'])
    expect(Object.keys(hardware.model.matrix.assignments)).toHaveLength(1)
  })
  it('includes power, boundary and pin choices in undo and dirty detection', () => {
    const keyboard=useKeyboardStore(), hardware=useHardwareModelStore()
    keyboard.addKey({x:0,y:0})
    keyboard.updateBaseline()
    hardware.power='controller-lipo'
    expect(keyboard.dirty).toBe(true)
    keyboard.undo()
    expect(hardware.power).toBe('usb')
    expect(keyboard.dirty).toBe(false)
    keyboard.redo()
    expect(hardware.power).toBe('controller-lipo')
    hardware.splitBoundaryX=3.5
    keyboard.undo()
    expect(hardware.splitBoundaryX).toBeNull()
    keyboard.redo()
    expect(hardware.splitBoundaryX).toBe(3.5)
    hardware.setPinOverride('ROW0','GPIO3')
    keyboard.undo()
    expect(hardware.pinOverrides).toEqual({})
  })
  it('infers wired split from two placed controllers when architecture is not configured', () => {
    const keyboard = useKeyboardStore()
    const hardware = useHardwareModelStore()
    keyboard.addKey({ x: 0, y: 0 })
    keyboard.addKey({
      x: -3,
      y: 1,
      width: 2,
      height: 2,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-nrf52840',
    })
    keyboard.addKey({
      x: 6,
      y: 1,
      width: 2,
      height: 2,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-nrf52840',
    })

    expect(hardware.architecture).toBe('wired-split')
    expect(hardware.model.components.filter((component) => component.kind === 'controller')).toHaveLength(2)
    expect(hardware.model.validation.some((issue) => issue.code === 'CONTROLLER_COUNT')).toBe(false)
  })
  it('keeps an explicitly selected unibody architecture authoritative', () => {
    const keyboard = useKeyboardStore()
    const hardware = useHardwareModelStore()
    keyboard.addKey({ x: 0, y: 0 })
    keyboard.addKey({ x: -3, y: 1, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' })
    keyboard.addKey({ x: 6, y: 1, width: 2, height: 2, decal: true, profile: 'hardware', st: 'hardware:xiao-rp2040' })
    hardware.architecture = 'unibody'

    expect(hardware.architecture).toBe('unibody')
    expect(hardware.model.validation.find((issue) => issue.code === 'CONTROLLER_COUNT')?.message)
      .toContain('Unibody requires exactly 1 controller')
  })
  it('imports valid projects atomically and leaves invalid imports untouched', () => {
    const keyboard = useKeyboardStore(),
      hardware = useHardwareModelStore()
    keyboard.addKey({ x: 0, y: 0 })
    keyboard.addKey({
      x: 3,
      y: 0,
      width: 2,
      height: 2,
      decal: true,
      profile: 'hardware',
      st: 'hardware:xiao-rp2040',
    })
    hardware.setPinOverride('ROW0', 'GPIO3')
    const json = hardware.exportModel()
    const invalid = JSON.parse(json)
    invalid.layout.keys[0].x = 'invalid'
    expect(() => hardware.importProject(invalid)).toThrow()
    expect(hardware.exportModel()).toBe(json)
    keyboard.clearLayout()
    hardware.importProject(JSON.parse(json))
    expect(hardware.exportModel()).toBe(json)
  })
  it('restores the real SEIBOKU jumper header envelope when importing a stale 1U item', () => {
    const keyboard = useKeyboardStore(),
      hardware = useHardwareModelStore()
    keyboard.addKey({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      decal: true,
      profile: 'hardware',
      st: 'hardware:seiboku-jumper-header',
    })
    const project = JSON.parse(hardware.exportModel())
    project.layout.keys[0].width = 1
    project.layout.keys[0].height = 1
    hardware.importProject(project)
    expect(keyboard.keys[0]!.width).toBeCloseTo(5.3 / 19.05)
    expect(keyboard.keys[0]!.height).toBeCloseTo(10.4 / 19.05)
  })
})
