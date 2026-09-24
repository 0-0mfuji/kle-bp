import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Keyboard } from '@adamws/kle-serial'
import { useKeyboardStore } from '@/stores/keyboard'
import { buildHardwareModel } from '@/utils/hardware/model'
import { parseHardwareProject } from '@/utils/hardware/project'
import { blockFor } from '@/data/circuit-blocks'
import { hardwareSizeInUnits, hardwareDefaultFace, isVisualOnlyHardwareId } from '@/data/hardware-layout'
import { isHardware } from '@/utils/hardware/identity'
import { stableJson } from '@/utils/hardware/identity'
import { DEFAULT_PCB_SETTINGS } from '@/utils/hardware/pcb-geometry'
import { DEFAULT_BATTERY_SETTINGS } from '@/data/battery-catalog'
import type {
  Architecture,
  ControllerId,
  HardwareStep,
  MatrixSolution,
  PowerId,
  SwitchKind,
  SplitConnection,
  SplitPowerMode,
  BoardOutputMode,
  PcbSettings,
  BatterySettings,
} from '@/types/hardware'

export const useHardwareModelStore = defineStore('hardwareModel', () => {
  const keyboard = useKeyboardStore()
  const step = ref<HardwareStep>('layout')
  const setting = <T>(name: string, fallback: T) => computed<T>({
    get: () => (keyboard.hardwareSettings[name] as T | undefined) ?? fallback,
    set: value => keyboard.setHardwareSettings({ ...keyboard.hardwareSettings, [name]: value }),
  })
  // A layout-only edit has no project-level architecture field. In that case,
  // two placed controller blocks are an unambiguous indication of a split
  // layout. Keep an explicitly saved value authoritative so that selecting
  // Unibody with two controllers still produces the useful validation error.
  const architecture = computed<Architecture>({
    get: () => {
      const configured = keyboard.hardwareSettings.architecture as Architecture | undefined
      if (configured === 'unibody' || configured === 'wired-split') return configured
      const controllerCount = keyboard.keys.filter((key) =>
        isHardware(key) && blockFor(key.st.slice(9))?.category === 'controller',
      ).length
      return controllerCount >= 2 ? 'wired-split' : 'unibody'
    },
    set: value => keyboard.setHardwareSettings({ ...keyboard.hardwareSettings, architecture: value }),
  })
  const switchKind = setting<SwitchKind>('switchKind', 'mx')
  const selectedController = setting<ControllerId>('controller', 'xiao-rp2040')
  const power = computed<PowerId>({
    get: () => (keyboard.hardwareSettings.power as PowerId | undefined) ?? 'usb',
    set: value => keyboard.setHardwareSettings({ ...keyboard.hardwareSettings, power: value, powerBySide: { left: value, right: value } }),
  })
  const splitConnection = setting<SplitConnection>('splitConnection', 'none')
  const splitBoundaryX = setting<number | null>('splitBoundaryX', null)
  const splitPowerMode = setting<SplitPowerMode>('splitPowerMode', 'independent')
  const boardOutputMode = setting<BoardOutputMode>('boardOutputMode', 'separate-left-right')
  const pinOverrides = setting<Record<string, string>>('pinOverrides', {})
  const matrixOverrides = setting<MatrixSolution['assignments']>('matrixOverrides', {})
  const powerBySide = setting<Record<'left' | 'right', PowerId> | undefined>('powerBySide', undefined)
  const pcb = setting<PcbSettings>('pcb', DEFAULT_PCB_SETTINGS)
  const battery = setting<BatterySettings>('battery', DEFAULT_BATTERY_SETTINGS)
  const model = computed(() =>
    buildHardwareModel({
      keys: keyboard.keys,
      metadata: keyboard.metadata,
      architecture: architecture.value,
      switch: switchKind.value,
      controller: selectedController.value,
      power: power.value,
      powerBySide: powerBySide.value,
      splitConnection: splitConnection.value,
      splitPowerMode: splitPowerMode.value,
      boardOutputMode: boardOutputMode.value,
      boundaryX: splitBoundaryX.value ?? undefined,
      pinOverrides: pinOverrides.value,
      matrixOverrides: matrixOverrides.value,
      pcb: pcb.value,
      battery: battery.value,
    }),
  )
  const controller = computed({
    get: () => model.value.controller,
    set: (value: ControllerId) => {
      selectedController.value = value
    },
  })
  const devices = computed(() => model.value.devices)
  const issues = computed(() => model.value.validation)
  const hasErrors = computed(() => issues.value.some((issue) => issue.severity === 'ERROR'))
  const setStep = (next: HardwareStep) => {
    step.value = next
  }
  const setPinOverride = (id: string, value: string) => {
    const next = { ...pinOverrides.value }
    if (value.trim()) next[id] = value.trim()
    else delete next[id]
    pinOverrides.value = next
  }
  const exportModel = () => stableJson(model.value) + '\n'
  const importProject = (raw: unknown) => {
    const input = parseHardwareProject(raw)
    // Normalize hardware envelopes on import. Older projects (and projects
    // created while a hardware block was still using the default 1U key size)
    // may contain a stale envelope. Hardware blocks represent physical parts,
    // so their canvas dimensions must follow the catalog dimensions exactly.
    for (const key of input.keys) {
      if (!isHardware(key)) continue
      const id = key.st.slice(9)
      if ((input.sourceSchemaVersion !== undefined && input.sourceSchemaVersion < 5) || id === 'seiboku-jumper-header') {
        const size = hardwareSizeInUnits(id)
        if (!(isVisualOnlyHardwareId(id) && id.endsWith('custom'))) {
          key.width = size.width
          key.height = size.height
          key.width2 = size.width
          key.height2 = size.height
        }
        ;(key as typeof key & { hardwareFace?: 'top' | 'bottom' }).hardwareFace ??= hardwareDefaultFace(id)
      }
    }
    buildHardwareModel(input) // Check construction before committing any state.
    const layout = new Keyboard()
    layout.keys = input.keys
    Object.assign(layout.meta, input.metadata)
    keyboard.loadKeyboard(layout)
    keyboard.setHardwareSettings({
      architecture: input.architecture!, switchKind: input.switch!, controller: input.controller!,
      power: input.power!, splitConnection: input.splitConnection!, splitPowerMode: input.splitPowerMode!,
      boardOutputMode: input.boardOutputMode!, splitBoundaryX: input.boundaryX ?? null,
      pinOverrides: input.pinOverrides!, matrixOverrides: input.matrixOverrides!,
      powerBySide: input.powerBySide,
      pcb: input.pcb,
      battery: input.battery,
    })
    keyboard.updateBaseline()

  }
  return {
    step,
    architecture,
    switchKind,
    controller,
    devices,
    power,
    splitConnection,
    splitBoundaryX,
    splitPowerMode,
    boardOutputMode,
    pinOverrides,
    matrixOverrides,
    pcb,
    battery,
    model,
    issues,
    hasErrors,
    setStep,
    setPinOverride,
    exportModel,
    importProject,
  }
})
