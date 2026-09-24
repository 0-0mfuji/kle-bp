<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useHardwareModelStore } from '@/stores/hardwareModel'
import { useKeyboardStore } from '@/stores/keyboard'
import { buildProjectFiles } from '@/utils/hardware/exporter'
import { serializePlateSettings } from '@/utils/plate/plate-settings-serializer'
import { filterPlateSideCustomHoles, filterPlateSideKeys } from '@/utils/plate/plate-builder'
import { getKeyCenterMm } from '@/utils/keyboard-geometry'
import { usePlateGeneratorStore } from '@/stores/plateGenerator'
import { parseHardwareProject } from '@/utils/hardware/project'
import { toast } from '@/composables/useToast'
import { CONTROLLER_RECIPES } from '@/data/hardware-recipes'
import { CIRCUIT_BLOCKS } from '@/data/circuit-blocks'
import { compatibleSwitchFootprints, footprintWidthKey, isSwitchFootprintAvailable, LED_FOOTPRINT_CATALOG, SWITCH_FOOTPRINT_CATALOG } from '@/data/footprint-catalog'
import { hardwareArrowDirectionForRotation, hardwareDefaultFace, hardwareLayoutDescriptor, formatHardwareDimensions, hardwareSizeInUnits, hardwareIdForBatteryKeepout } from '@/data/hardware-layout'
import { BATTERY_PART_CATALOG } from '@/data/battery-catalog'
import { isHardware, isMatrixKey, layoutKeyId } from '@/utils/hardware/identity'
import type { HardwareFace, HardwarePortDirection, HardwareStep } from '@/types/hardware'
import KeyboardCanvas from './KeyboardCanvas.vue'
import CanvasToolbar from './CanvasToolbar.vue'
import KeyPropertiesPanel from './KeyPropertiesPanel.vue'
import KeyboardMetadataPanel from './KeyboardMetadataPanel.vue'
import SummaryPanel from './SummaryPanel.vue'
import PlateGeneratorPanel from './PlateGeneratorPanel.vue'
import LayoutEditorSettingsPanel from './LayoutEditorSettingsPanel.vue'
import CanvasFooter from './CanvasFooter.vue'
import SplitBoundaryPreview from './SplitBoundaryPreview.vue'
import BiCheckCircle from 'bootstrap-icons/icons/check-circle.svg'
import BiExclamationTriangle from 'bootstrap-icons/icons/exclamation-triangle.svg'
import BiChevronDown from 'bootstrap-icons/icons/chevron-down.svg'
import BiChevronUp from 'bootstrap-icons/icons/chevron-up.svg'

const hardware = useHardwareModelStore()
const keyboardStore = useKeyboardStore()
const keyboardCanvasRef = ref<InstanceType<typeof KeyboardCanvas> | null>(null)
const plateStore = usePlateGeneratorStore()
const {
  step,
  architecture,
  switchKind,
  controller,
  power,
  splitConnection,
  splitBoundaryX,
  splitPowerMode,
  boardOutputMode,
  pcb,
  model,
  issues,
  hasErrors,
  battery,
} = storeToRefs(hardware)
const hardwareItems = computed(() => keyboardStore.keys.map((key, index) => {
  const id = isHardware(key) ? key.st.slice(9) : ''
  const hardwareKey = key as typeof key & { hardwareFace?: 'top' | 'bottom'; hardwarePortDirection?: HardwarePortDirection }
  return { key, index, id, layoutId: layoutKeyId(key, index), face: hardwareKey.hardwareFace ?? hardwareDefaultFace(id), direction: hardwareArrowDirectionForRotation(id, key.rotation_angle ?? 0, hardwareKey.hardwarePortDirection), rotation: ((key.rotation_angle ?? 0) % 360 + 360) % 360, directionLabel: hardwareLayoutDescriptor(id)?.directionLabel, side: key.x + key.width / 2 < model.value.split.boundaryX ? 'Left' : 'Right' }
}).filter((item) => item.id))
const patchBattery = (patch: Partial<typeof battery.value>) => {
  battery.value = JSON.parse(JSON.stringify({ ...battery.value, ...patch, keepout: { ...battery.value.keepout, ...(patch.keepout ?? {}) } }))
}
const addHardwareLayoutItem = (id: string, x: number, y: number, custom?: { lengthMm: number; widthMm: number }) => {
  const descriptor = hardwareLayoutDescriptor(id)
  const size = hardwareSizeInUnits(id, custom)
  const labels = Array(12).fill('') as import('@adamws/kle-serial').Array12<string>
  labels[0] = descriptor?.shortName ?? id
  labels[4] = `${formatHardwareDimensions(id)} · ${hardwareDefaultFace(id) === 'bottom' ? 'Bottom' : 'Top'}`
  keyboardStore.addKey({ x, y, width: size.width, height: size.height, width2: size.width, height2: size.height, labels, color: '#eeeeee', decal: true, profile: 'hardware', st: `hardware:${id}`, hardwareFace: hardwareDefaultFace(id) } as Partial<import('@adamws/kle-serial').Key> & { hardwareFace: 'top' | 'bottom' })
}
const placeRequiredSplitHardware = () => {
  if (architecture.value !== 'wired-split' || splitConnection.value === 'none') return
  const boundary = model.value.split.boundaryX
  const keyMinY = Math.min(...keyboardStore.keys.filter((key) => !key.decal).map((key) => key.y), 0)
  const addMissing = (id: string, side: 'left' | 'right', count: number, custom?: { lengthMm: number; widthMm: number }) => {
    const existing = hardwareItems.value.filter((item) => item.id === id && (item.side === (side === 'left' ? 'Left' : 'Right'))).length
    for (let index = existing; index < count; index++) {
      const descriptor = hardwareLayoutDescriptor(id)
      const size = hardwareSizeInUnits(id, custom)
      const x = side === 'left' ? boundary - size.width - 1 - index * (size.width + 0.5) : boundary + 1 + index * (size.width + 0.5)
      const y = keyMinY - size.height - 1 - index * (size.height + 0.5)
      addHardwareLayoutItem(id, Math.max(0, side === 'left' ? x : x), y, custom)
      void descriptor
    }
  }
  for (const side of ['left', 'right'] as const) {
    addMissing(controller.value, side, 1)
    if (splitConnection.value === 'wired-uart') addMissing('split-trrs-jack-pj320a', side, 1)
    if (splitConnection.value === 'wireless' && power.value === 'controller-lipo') {
      if (battery.value.powerSwitch !== 'none') addMissing(`power-switch-${battery.value.powerSwitch}`, side, 1)
      if (battery.value.connector !== 'direct-solder') addMissing(`battery-connector-${battery.value.connector}`, side, 1)
      if (battery.value.keepout.enabled) addMissing(hardwareIdForBatteryKeepout(battery.value.keepout.profile), side, 1, battery.value.keepout.profile === 'custom' ? battery.value.keepout : undefined)
    }
  }
  toast.showSuccess('不足していたSplit部品をLayout Editorへ配置しました。')
}
const selectHardwareItem = (id: string) => {
  const item = hardwareItems.value.find((entry) => entry.layoutId === id)
  if (item) keyboardStore.selectKey(item.key)
}
const rotateHardwareItem = (layoutId: string, delta: number) => {
  const item = hardwareItems.value.find((entry) => entry.layoutId === layoutId)
  if (!item) return
  const key = item.key as typeof item.key & { hardwarePortDirection?: HardwarePortDirection }
  key.rotation_x = key.x + key.width / 2
  key.rotation_y = key.y + key.height / 2
  key.rotation_angle = ((key.rotation_angle ?? 0) + delta) % 360
  if (key.rotation_angle < 0) key.rotation_angle += 360
  delete key.hardwarePortDirection
  keyboardStore.saveState()
}
const setHardwareFace = (layoutId: string, value: string) => {
  if (value !== 'top' && value !== 'bottom') return
  const item = hardwareItems.value.find((entry) => entry.layoutId === layoutId)
  if (!item) return
  const key = item.key as typeof item.key & { hardwareFace?: HardwareFace }
  key.hardwareFace = value
  keyboardStore.saveState()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('keys-modified'))
}
const resetHardwareRotation = (layoutId: string) => {
  const item = hardwareItems.value.find((entry) => entry.layoutId === layoutId)
  if (!item) return
  const key = item.key as typeof item.key & { hardwarePortDirection?: HardwarePortDirection }
  key.rotation_angle = 0
  Reflect.deleteProperty(key, 'rotation_x')
  Reflect.deleteProperty(key, 'rotation_y')
  delete key.hardwarePortDirection
  keyboardStore.saveState()
}
const focusIssue = async (ids: string[]) => {
  hardware.setStep('layout')
  await nextTick()
  keyboardCanvasRef.value?.focusKeys(ids)
}
const focusOutlineIssue = async (point: { x: number; y: number }) => {
  hardware.setStep('layout')
  await nextTick()
  await keyboardCanvasRef.value?.focusOutlinePoint(point)
}
const availablePins = computed(() => CONTROLLER_RECIPES[model.value.controller]?.gpioPins ?? [])
const steps: { id: HardwareStep; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'controller', label: 'Controller / Power / Split' },
  { id: 'validate', label: 'Validate' },
  { id: 'export', label: 'Export' },
]
const canvasHeight = ref(420)
const settingsOpen = ref(false)
const layoutPanelOrder = ref<Array<'canvas' | 'properties'>>(['canvas', 'properties'])
const draggedPanel = ref<'canvas' | 'properties' | null>(null)
const dragOverPanel = ref<'canvas' | 'properties' | null>(null)
const collapsedPanels = ref<Record<'canvas' | 'properties', boolean>>({
  canvas: false,
  properties: false,
})
const minCanvasHeight = 300
const isResizing = ref(false)
const resizeStartY = ref(0)
const resizeStartHeight = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const download = (name: string, data: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
const updateBoundaryInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  splitBoundaryX.value = value === '' ? null : Number(value)
}
const exporting = ref(false)
const patchPcb = (patch: Partial<typeof pcb.value>) => {
  pcb.value = JSON.parse(JSON.stringify({ ...pcb.value, ...patch }))
}
const updatePcbOutline = (patch: Partial<typeof pcb.value.outline>) =>
  patchPcb({ outline: { ...pcb.value.outline, ...patch } })
const updatePcbMounting = (patch: Partial<typeof pcb.value.mountingHoles>) =>
  patchPcb({ mountingHoles: { ...pcb.value.mountingHoles, ...patch } })
const updatePcbRgb = (patch: Partial<typeof pcb.value.rgb>) =>
  patchPcb({ rgb: { ...pcb.value.rgb, ...patch } })
const switchFootprints = computed(() => SWITCH_FOOTPRINT_CATALOG.filter((entry) => entry.families.includes(switchKind.value) && isSwitchFootprintAvailable(entry.id)))
const ledFootprints = computed(() => LED_FOOTPRINT_CATALOG)
const switchWidths = computed(() => [...new Set(
  model.value.layout.keys.filter(isMatrixKey).map((key) => Math.max(key.width, key.height)),
)].sort((left, right) => left - right))
const switchFootprintsForWidth = (width: number) => compatibleSwitchFootprints(switchKind.value, width, pcb.value.rgb.enabled)
const switchFootprintForWidth = (width: number) => pcb.value.switchFootprintByWidth[footprintWidthKey(width)] ?? 'auto'
const updateSwitchFootprintForWidth = (width: number, selection: string) => {
  const key = footprintWidthKey(width)
  const overrides = { ...pcb.value.switchFootprintByWidth }
  if (selection === 'auto') delete overrides[key]
  else overrides[key] = selection
  patchPcb({ switchFootprintByWidth: overrides })
}
const switchFootprintLabel = computed(() => pcb.value.switchFootprintId === 'auto'
  ? 'Auto — compatible default'
  : SWITCH_FOOTPRINT_CATALOG.find((entry) => entry.id === pcb.value.switchFootprintId)?.name ?? pcb.value.switchFootprintId)
const resolvedSwitchFootprintLabel = computed(() => {
  const counts = new Map<string, number>()
  model.value.components
    .filter((component) => component.kind === 'switch')
    .forEach((component) => counts.set(component.footprint, (counts.get(component.footprint) ?? 0) + 1))
  if (counts.size === 0) return 'No switch footprints resolved yet'
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => `${SWITCH_FOOTPRINT_CATALOG.find((entry) => entry.id === id)?.name ?? id} ×${count}`)
    .join(' / ')
})
const resolvedSwitchFootprintIds = computed(() => new Set(
  model.value.components
    .filter((component) => component.kind === 'switch')
    .map((component) => component.footprint),
))
const isSwitchFootprintActive = (id: string) =>
  pcb.value.switchFootprintId === id ||
  (pcb.value.switchFootprintId === 'auto' && resolvedSwitchFootprintIds.value.has(id))
const isAutoResolvedSwitchFootprint = (id: string) =>
  pcb.value.switchFootprintId === 'auto' && resolvedSwitchFootprintIds.value.has(id)
const ledFootprintLabel = computed(() => pcb.value.ledFootprintId === 'auto'
  ? 'Auto — SK6812MINI-E backside'
  : LED_FOOTPRINT_CATALOG.find((entry) => entry.id === pcb.value.ledFootprintId)?.name ?? pcb.value.ledFootprintId)
const selectedLedFootprint = computed(() => pcb.value.ledFootprintId === 'auto'
  ? LED_FOOTPRINT_CATALOG.find((entry) => entry.id === 'LED_SK6812MINI-E_BL') ?? LED_FOOTPRINT_CATALOG[0]
  : LED_FOOTPRINT_CATALOG.find((entry) => entry.id === pcb.value.ledFootprintId) ?? LED_FOOTPRINT_CATALOG[0])
const ledPinOrderLabel = computed(() => {
  const order = selectedLedFootprint.value?.ledPinOrder
  return order ? `VDD=${order.vdd}, GND=${order.gnd}, DIN=${order.din}, DOUT=${order.dout}` : 'pin order unavailable'
})
const resolvedLedFootprintLabel = computed(() => {
  const led = model.value.components.find((component) => component.kind === 'led')
  return led
    ? LED_FOOTPRINT_CATALOG.find((entry) => entry.id === led.footprint)?.name ?? led.footprint
    : pcb.value.rgb.enabled ? 'No LED footprint resolved yet' : 'RGB is disabled'
})
const resetFootprints = () => patchPcb({ switchFootprintId: 'auto', switchFootprintByWidth: {}, ledFootprintId: 'auto' })
watch(
  () => plateStore.settings.stabilizerType,
  (type) => {
    if (pcb.value.stabilizers.type !== type)
      patchPcb({ stabilizers: { ...pcb.value.stabilizers, type } })
  },
  { immediate: true },
)
const exportProject = async () => {
  if (hasErrors.value || exporting.value) return
  exporting.value = true
  try {
    const snapshot = JSON.parse(JSON.stringify(model.value))
    const settings = JSON.parse(JSON.stringify(plateStore.settings))
    const plateSettings = serializePlateSettings(settings)
    const plateResult = await plateStore.generatePlateForExport(
      snapshot.layout.keys,
      settings,
      snapshot.layout.metadata,
    )
    const plateSideResults = snapshot.architecture === 'wired-split' && snapshot.boardOutputMode === 'separate-left-right'
      ? await Promise.all((['left', 'right'] as const).map(async (side) => {
          const sideKeys = filterPlateSideKeys(snapshot.layout.keys, snapshot.split, side)
          const firstKey = snapshot.layout.keys.find((key: typeof snapshot.layout.keys[number]) => !key.decal && !key.ghost)
          if (!firstKey) throw new Error('TIGHT_OUTLINE_INVALID: split layout has no physical key origin.')
          const originCenterMm = getKeyCenterMm(
            firstKey,
            Number(snapshot.layout.metadata.spacing_x ?? 19.05),
            Number(snapshot.layout.metadata.spacing_y ?? 19.05),
          )
          const originKey = snapshot.layout.keys.find((key: typeof snapshot.layout.keys[number]) => !key.decal && !key.ghost)
          const customHoles = settings.customHoles?.enabled && originKey
            ? { ...settings.customHoles, holes: filterPlateSideCustomHoles(settings.customHoles.holes, originKey, snapshot.split, side) }
            : settings.customHoles
          return [side, await plateStore.generatePlateForExport(sideKeys, settings, snapshot.layout.metadata, { originCenterMm, customHoles })] as const
        }))
      : []
    const result = buildProjectFiles(
      snapshot,
      plateSettings,
      plateResult,
      Object.fromEntries(plateSideResults) as Partial<Record<'left' | 'right', typeof plateResult>>,
    )
    download('keyboard-hardware-cad.zip', result.archive, 'application/zip')
    const plateWarnings = [plateResult, ...plateSideResults.map(([, sideResult]) => sideResult)]
      .flatMap((plate) => plate.warnings ?? [])
    if (plateWarnings.length)
      toast.showWarning([...new Set(plateWarnings)].join('\n'), 'Plate manufacturing warning')
    toast.showSuccess('KiCad project exported. Routing and hardware review are still required.')
  } catch (error) {
    toast.showError(error instanceof Error ? error.message : 'Export failed.')
  } finally {
    exporting.value = false
  }
}
const exportJson = () => download('project.json', hardware.exportModel(), 'application/json')
const importJson = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    if (file.size > 5_000_000) throw new Error('Project JSON is too large (maximum 5 MB).')
    hardware.importProject(JSON.parse(await file.text()))
    toast.showSuccess('Layout and hardware settings restored.')
  } catch (error) {
    toast.showError(error instanceof Error ? error.message : 'Import failed.')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
const pinNames = computed(() => [
  ...Array.from({ length: model.value.matrix.rows }, (_, i) => `ROW${i}`),
  ...Array.from({ length: model.value.matrix.columns }, (_, i) => `COL${i}`),
  ...model.value.resources.assignments
    .filter((a) => a.sourceBlock !== 'key-matrix')
    .map((a) => a.requirementId),
  ...model.value.resources.unassigned.filter(
    (id) => !/^(ROW|COL)\d+$/.test(id) && !id.endsWith(':unsupported'),
  ),
])
const matrixJson = ref('')
const editMatrix = () => {
  matrixJson.value = JSON.stringify(model.value.matrix.assignments, null, 2)
}
const resetMatrix = () => {
  hardware.matrixOverrides = {}
  matrixJson.value = ''
}
const applyMatrix = () => {
  try {
    const parsed = JSON.parse(matrixJson.value)
    const candidate = { ...model.value, matrixOverrides: parsed }
    hardware.matrixOverrides = parseHardwareProject(candidate).matrixOverrides!
  } catch (error) {
    toast.showError(error instanceof Error ? error.message : 'Invalid matrix.')
  }
}
const errorCount = computed(() => issues.value.filter((issue) => issue.severity === 'ERROR').length)
const currentStepIndex = () => steps.findIndex((entry) => entry.id === step.value)
const previousStep = () => hardware.setStep(steps[Math.max(0, currentStepIndex() - 1)]!.id)
const nextStep = () =>
  hardware.setStep(steps[Math.min(steps.length - 1, currentStepIndex() + 1)]!.id)

const startResize = (event: MouseEvent) => {
  isResizing.value = true
  resizeStartY.value = event.clientY
  resizeStartHeight.value = canvasHeight.value
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

const handleResize = (event: MouseEvent) => {
  if (!isResizing.value) return
  canvasHeight.value = Math.max(
    minCanvasHeight,
    Math.min(
      window.innerHeight - 200,
      resizeStartHeight.value + event.clientY - resizeStartY.value,
    ),
  )
}

const stopResize = () => {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem('kle-ng-layout-editor-height', canvasHeight.value.toString())
}

onMounted(() => {
  const savedHeight = Number.parseInt(localStorage.getItem('kle-ng-layout-editor-height') ?? '', 10)
  if (Number.isFinite(savedHeight) && savedHeight > 0) {
    canvasHeight.value = Math.max(minCanvasHeight, Math.min(window.innerHeight - 200, savedHeight))
  }
  const savedOrder = localStorage.getItem('kle-ng-layout-panel-order')
  if (savedOrder) {
    try {
      const parsed = JSON.parse(savedOrder) as unknown
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        parsed.includes('canvas') &&
        parsed.includes('properties')
      ) {
        layoutPanelOrder.value = parsed as Array<'canvas' | 'properties'>
      }
    } catch {
      // Use the default order when the saved value is invalid.
    }
  }
  const savedCollapsed = localStorage.getItem('kle-ng-layout-panel-collapsed')
  if (savedCollapsed) {
    try {
      const parsed = JSON.parse(savedCollapsed) as Partial<Record<'canvas' | 'properties', boolean>>
      collapsedPanels.value = { ...collapsedPanels.value, ...parsed }
    } catch {
      // Use expanded panels when the saved value is invalid.
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})

const startPanelDrag = (panel: 'canvas' | 'properties') => {
  draggedPanel.value = panel
  dragOverPanel.value = null
}

const enterPanel = (panel: 'canvas' | 'properties') => {
  if (draggedPanel.value && draggedPanel.value !== panel) dragOverPanel.value = panel
}

const dropPanel = (target: 'canvas' | 'properties') => {
  if (!draggedPanel.value || draggedPanel.value === target) return
  layoutPanelOrder.value = [draggedPanel.value, target]
  localStorage.setItem('kle-ng-layout-panel-order', JSON.stringify(layoutPanelOrder.value))
  draggedPanel.value = null
  dragOverPanel.value = null
}

const endPanelDrag = () => {
  draggedPanel.value = null
  dragOverPanel.value = null
}

const togglePanel = (panel: 'canvas' | 'properties') => {
  collapsedPanels.value[panel] = !collapsedPanels.value[panel]
  localStorage.setItem('kle-ng-layout-panel-collapsed', JSON.stringify(collapsedPanels.value))
}
</script>

<template>
  <section class="hardware-cad-workspace" data-testid="hardware-cad-workspace">
    <div class="card-body pt-3">
      <p class="small text-muted">
        Unibody / split · MX / Choc v1 · XIAO RP2040 / standard XIAO nRF52840 · PMW3610 SEIBOKU.
        XIAO nRF52840 has an integrated USB-C connector and 1S LiPo charging; use a separately protected battery.
      </p>
      <div class="workflow-steps mb-3" aria-label="Hardware CAD workflow">
        <button
          v-for="entry in steps"
          :key="entry.id"
          class="workflow-step"
          :class="{ active: step === entry.id }"
          :aria-pressed="step === entry.id"
          type="button"
          @click="hardware.setStep(entry.id)"
        >
          {{ entry.label }}
        </button>
      </div>

      <TransitionGroup v-if="step === 'layout'" name="panel-list" tag="div" class="row g-3">
        <div
          v-for="panel in layoutPanelOrder"
          :key="panel"
          class="layout-panel"
          :class="[
            panel === 'canvas' ? 'col-xl-8' : 'col-xl-4',
            { 'drag-over': dragOverPanel === panel },
          ]"
          draggable="true"
          @dragstart="startPanelDrag(panel)"
          @dragenter.prevent="enterPanel(panel)"
          @dragover.prevent
          @drop="dropPanel(panel)"
          @dragend="endPanelDrag"
        >
          <div v-if="panel === 'canvas'" class="cad-canvas card h-100">
            <div
              class="card-header small fw-semibold d-flex align-items-center justify-content-between drag-handle"
            >
              <span>Layout Editor</span>
              <div class="d-flex align-items-center gap-2">
                <button
                  class="panel-toggle btn btn-outline-secondary"
                  type="button"
                  :title="collapsedPanels.canvas ? 'Expand' : 'Collapse'"
                  :aria-expanded="!collapsedPanels.canvas"
                  @click.stop="togglePanel('canvas')"
                >
                  <BiChevronDown v-if="collapsedPanels.canvas" /><BiChevronUp v-else /></button
                ><span class="drag-grip" title="Drag to reorder">⋮⋮</span>
              </div>
            </div>
            <template v-if="!collapsedPanels.canvas"
              ><div class="d-flex layout-editor-container" :style="{ height: `${canvasHeight}px` }">
                <CanvasToolbar />
                <div class="canvas-area flex-grow-1">
                  <KeyboardCanvas
                    ref="keyboardCanvasRef"
                    :settings-open="settingsOpen"
                    @toggle-settings="settingsOpen = !settingsOpen"
                  />
                </div>
                <LayoutEditorSettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
              </div>
              <CanvasFooter />
              <div
                class="layout-editor-resize-handle"
                :class="{ active: isResizing }"
                title="Drag to resize"
                @mousedown="startResize"
              >
                <div class="resize-handle-line"></div>
              </div>
              <div class="mt-2"><SummaryPanel /></div>
              ></template
            >
          </div>
          <div v-else class="card h-100">
            <div
              class="card-header fw-semibold d-flex align-items-center justify-content-between drag-handle"
            >
              <span>Layout properties</span>
              <div class="d-flex align-items-center gap-2">
                <button
                  class="panel-toggle btn btn-outline-secondary"
                  type="button"
                  :title="collapsedPanels.properties ? 'Expand' : 'Collapse'"
                  :aria-expanded="!collapsedPanels.properties"
                  @click.stop="togglePanel('properties')"
                >
                  <BiChevronDown v-if="collapsedPanels.properties" /><BiChevronUp v-else /></button
                ><span class="drag-grip" title="Drag to reorder">⋮⋮</span>
              </div>
            </div>
            <div v-if="!collapsedPanels.properties" class="card-body">
              <KeyboardMetadataPanel />
              <hr />
              <div class="small fw-semibold mb-2">Hardware items (実寸)</div>
              <div v-if="hardwareItems.length" class="list-group list-group-flush small">
                <div v-for="item in hardwareItems" :key="item.layoutId" class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2">
                  <span>
                    <strong>{{ hardwareLayoutDescriptor(item.id)?.name ?? item.id }}</strong>
                    <span class="text-muted d-block">{{ item.layoutId }} · {{ item.side }} · {{ formatHardwareDimensions(item.id) }} · {{ item.face === 'bottom' ? 'Bottom' : 'Top' }} · {{ item.rotation }}°</span>
                    <span v-if="item.direction" class="text-muted d-block">{{ item.directionLabel ?? 'Interface direction' }}: {{ item.direction }}</span>
                  </span>
                  <span class="d-flex align-items-center gap-1 flex-shrink-0">
                    <select class="form-select form-select-sm hardware-face-select" :value="item.face" :aria-label="`${item.id} mounting face`" @change="setHardwareFace(item.layoutId, ($event.target as HTMLSelectElement).value)">
                      <option value="top">Top（表面）</option>
                      <option value="bottom">Bottom（裏面）</option>
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-secondary" title="部品を左へ90度回転" @click="rotateHardwareItem(item.layoutId, -90)">↺ 90°</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" title="部品を右へ90度回転" @click="rotateHardwareItem(item.layoutId, 90)">↻ 90°</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" title="部品の向きを初期状態に戻す" @click="resetHardwareRotation(item.layoutId)">0°</button>
                    <button type="button" class="btn btn-sm btn-outline-primary" @click="selectHardwareItem(item.layoutId)">Layout上で選択</button>
                  </span>
                </div>
              </div>
              <div v-else class="small text-muted">Controller、TRRS、電源部品をToolbarから追加できます。</div>
              <hr />
              <KeyPropertiesPanel />
            </div>
          </div>
        </div>
      </TransitionGroup>
      <div v-else-if="step === 'controller'" class="row g-3">
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header fw-semibold">Controller / Power / Split</div>
            <div class="card-body">
              <dl class="row small mb-3">
                <dt class="col-sm-5">Controller</dt>
                <dd class="col-sm-7">{{ controller }}</dd>
                <dt class="col-sm-5">Switch</dt>
                <dd class="col-sm-7">
                  <select
                    v-model="switchKind"
                    aria-label="Switch type"
                    class="form-select form-select-sm"
                  >
                    <option value="mx">MX (soldered)</option>
                    <option value="choc-v1">Choc v1 (soldered)</option>
                    <option value="choc-v2">Choc v2 (soldered)</option>
                  </select>
                </dd>
              </dl>
              <div class="border rounded p-2 mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <div class="small fw-semibold">Switch footprint</div>
                    <div class="text-muted small">{{ switchFootprintLabel }}</div>
                  </div>
                  <button type="button" class="btn btn-sm" :class="pcb.switchFootprintId === 'auto' ? 'btn-primary' : 'btn-outline-secondary'" @click="patchPcb({ switchFootprintId: 'auto' })">Auto</button>
                </div>
                <div class="small text-muted mb-2">Resolved: {{ resolvedSwitchFootprintLabel }}</div>
                <div class="row g-2">
                  <div class="col-md-6" v-for="entry in switchFootprints" :key="entry.id">
                    <button type="button" class="w-100 text-start btn btn-sm border p-2 h-100" :class="isSwitchFootprintActive(entry.id) ? 'border-primary bg-primary-subtle' : 'btn-light'" @click="patchPcb({ switchFootprintId: entry.id })">
                      <span class="d-flex justify-content-between gap-2 align-items-start">
                        <span class="fw-semibold">{{ entry.name }}</span>
                        <span v-if="isAutoResolvedSwitchFootprint(entry.id)" class="badge text-bg-primary flex-shrink-0">Auto selected</span>
                      </span>
                      <span class="small text-muted d-block">{{ entry.mount === 'hotswap' ? 'Hot-swap' : 'Soldered' }} · {{ entry.reversible ? 'Reversible' : 'Fixed' }} · {{ entry.keyWidths.join(', ') }}u</span>
                      <span class="small text-muted d-block">LED: {{ entry.ledSide }} · {{ entry.verification }} · {{ entry.socket ? entry.socket.kind : 'no socket' }}</span>
                    </button>
                  </div>
                </div>
                <div class="form-text">{{ switchFootprintLabel }} is the project-wide default. Hot-swap sockets are pads inside the switch footprint; no duplicate socket footprint is placed.</div>
                <div v-if="switchWidths.length" class="border rounded p-2 mt-3">
                  <div class="small fw-semibold mb-2">Switch footprint by key size</div>
                  <div class="row g-2">
                    <div v-for="width in switchWidths" :key="footprintWidthKey(width)" class="col-md-6">
                      <label class="form-label small mb-1">{{ width }}u</label>
                      <select
                        :aria-label="`Switch footprint for ${width}u`"
                        class="form-select form-select-sm"
                        :value="switchFootprintForWidth(width)"
                        @change="updateSwitchFootprintForWidth(width, ($event.target as HTMLSelectElement).value)"
                      >
                        <option value="auto">Auto — hot-swap / LED compatible</option>
                        <option v-for="entry in switchFootprintsForWidth(width)" :key="entry.id" :value="entry.id">
                          {{ entry.name }} · {{ entry.mount === 'hotswap' ? 'Hot-swap' : 'Soldered' }}{{ entry.reversible ? ' · Reversible' : '' }}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="form-text">Overrides are shared by every matrix key with the same physical size. Auto chooses a verified exact-width footprint.</div>
                </div>
              </div>
              <label class="form-label small">Architecture</label
              ><select aria-label="Architecture" v-model="architecture" class="form-select mb-3">
                <option value="unibody">Unibody</option>
                <option value="wired-split">Wired split</option></select
              ><label class="form-label small">Split connection</label
              ><select
                aria-label="Split connection" v-model="splitConnection"
                class="form-select mb-3"
                :disabled="architecture !== 'wired-split'"
              >
                <option value="wired-uart">Wired UART</option>
                <option value="wireless">Wireless</option>
                <option value="none">None</option></select
              ><label class="form-label small">Split boundary X</label>
              <div class="input-group mb-1">
                <input
                  aria-label="Split boundary X" :value="splitBoundaryX ?? model.split.boundaryX"
                  @input="updateBoundaryInput"
                  type="number"
                  step="0.25"
                  class="form-control"
                  :disabled="architecture !== 'wired-split'"
                /><button
                  class="btn btn-outline-secondary"
                  type="button"
                  :disabled="splitBoundaryX === null"
                  @click="splitBoundaryX = null"
                >
                  Auto
                </button>
              </div>
              <div class="form-text">
                Auto follows the layout center. A manual value is fixed until Auto is pressed.
              </div>
              <div class="mt-3"><SplitBoundaryPreview v-model="splitBoundaryX" :resolved-boundary="model.split.boundaryX" /></div>
              <label class="form-label small mt-3">Power</label
              ><select aria-label="Power" v-model="power" class="form-select">
                <option value="usb">USB</option>
                <option value="controller-lipo" :disabled="!['xiao-nrf52840', 'xiao-nrf52840-plus'].includes(controller) || (architecture === 'wired-split' && splitConnection === 'wired-uart')">USB + protected 1S LiPo / charging</option>
              </select>
              <p v-if="power === 'controller-lipo'" class="small mt-2 mb-0">
                {{ CIRCUIT_BLOCKS.find((block) => block.id === 'controller-lipo')?.notes }}
              </p>
              <div v-if="power === 'controller-lipo'" class="border rounded p-2 mt-3">
                <div class="small fw-semibold mb-2">LiPo components</div>
                <label class="form-label small mb-1">Battery connector</label>
                <select aria-label="Battery connector" class="form-select form-select-sm mb-2" :value="battery.connector" @change="patchBattery({ connector: ($event.target as HTMLSelectElement).value as typeof battery.connector })">
                  <option v-for="entry in BATTERY_PART_CATALOG.filter((part) => part.category === 'connector')" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.verification }}</option>
                </select>
                <label class="form-label small mb-1">Power switch</label>
                <select aria-label="Battery power switch" class="form-select form-select-sm mb-2" :value="battery.powerSwitch" @change="patchBattery({ powerSwitch: ($event.target as HTMLSelectElement).value as typeof battery.powerSwitch })">
                  <option value="none">None</option>
                  <option v-for="entry in BATTERY_PART_CATALOG.filter((part) => part.category === 'power-switch')" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.verification }}</option>
                </select>
                <div class="form-check mb-2">
                  <input id="battery-keepout" class="form-check-input" type="checkbox" :checked="battery.keepout.enabled" @change="patchBattery({ keepout: { ...battery.keepout, enabled: ($event.target as HTMLInputElement).checked } })" />
                  <label class="form-check-label small" for="battery-keepout">Show battery keepout in Layout Editor</label>
                </div>
                <select v-if="battery.keepout.enabled" aria-label="Battery keepout profile" class="form-select form-select-sm" :value="battery.keepout.profile" @change="patchBattery({ keepout: { ...battery.keepout, profile: ($event.target as HTMLSelectElement).value as typeof battery.keepout.profile } })">
                  <option value="401230">LiPo 401230 · 30 × 12 × 4 mm</option>
                  <option value="502535">LiPo 502535 · 35 × 25 × 5 mm</option>
                  <option value="601730">EEMB LP601730 · 31 × 17.5 × 6.3 mm · 要確認</option>
                  <option value="custom">Custom</option>
                </select>
                <div v-if="battery.keepout.enabled && battery.keepout.profile === 'custom'" class="row g-1 mt-1">
                  <div class="col-4"><input aria-label="Battery length mm" class="form-control form-control-sm" type="number" min="1" :value="battery.keepout.lengthMm" @input="patchBattery({ keepout: { ...battery.keepout, lengthMm: Number(($event.target as HTMLInputElement).value) } })" /></div>
                  <div class="col-4"><input aria-label="Battery width mm" class="form-control form-control-sm" type="number" min="1" :value="battery.keepout.widthMm" @input="patchBattery({ keepout: { ...battery.keepout, widthMm: Number(($event.target as HTMLInputElement).value) } })" /></div>
                  <div class="col-4"><input aria-label="Battery thickness mm" class="form-control form-control-sm" type="number" min="1" :value="battery.keepout.thicknessMm" @input="patchBattery({ keepout: { ...battery.keepout, thicknessMm: Number(($event.target as HTMLInputElement).value) } })" /></div>
                </div>
                <button v-if="architecture === 'wired-split' && (splitConnection === 'wired-uart' || (splitConnection === 'wireless' && power === 'controller-lipo'))" type="button" class="btn btn-sm btn-outline-primary mt-2" @click="placeRequiredSplitHardware">不足しているSplit部品を配置</button>
              </div>
              <label class="form-label small mt-3">Split power</label>
              <select aria-label="Split power" v-model="splitPowerMode" class="form-select mb-3" :disabled="architecture !== 'wired-split'">
                <option value="master-distributes" disabled>Power distribution (unsupported)</option>
                <option value="independent">Independent power per side</option>
              </select>
              <label class="form-label small">PCB output</label>
              <select aria-label="PCB output" v-model="boardOutputMode" class="form-select" :disabled="architecture !== 'wired-split'">
                <option value="separate-left-right">Separate left / right PCBs</option>
                <option value="reversible">Reversible (not yet exportable)</option>
              </select>
              <hr class="my-3" />
              <div class="small fw-semibold mb-2">PCB manufacturing features</div>
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small mb-1">Outline mode</label>
                  <select aria-label="PCB outline mode" class="form-select form-select-sm" :value="pcb.outline.mode" @change="updatePcbOutline({ mode: ($event.target as HTMLSelectElement).value as 'auto-tight' | 'legacy-rect' })">
                    <option value="auto-tight">Auto tight / rounded / concave</option>
                    <option value="legacy-rect">Legacy rectangle</option>
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Narrow neck handling</label>
                  <select aria-label="PCB outline repair mode" class="form-select form-select-sm" :value="pcb.outline.repairMode" @change="updatePcbOutline({ repairMode: ($event.target as HTMLSelectElement).value as 'auto-repair' | 'legacy-warning' })">
                    <option value="auto-repair">Auto repair (recommended)</option>
                    <option value="legacy-warning">Legacy warning only</option>
                  </select>
                </div>
                <div class="col-12" v-if="pcb.rgb.enabled">
                  <label class="form-label small mb-1">LED footprint</label>
                  <div class="input-group input-group-sm">
                    <select aria-label="LED footprint" class="form-select" :value="pcb.ledFootprintId" @change="patchPcb({ ledFootprintId: ($event.target as HTMLSelectElement).value })">
                      <option value="auto">Auto — SK6812MINI-E backside</option>
                      <option v-for="entry in ledFootprints" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.ledSide }} · {{ entry.verification }}</option>
                    </select>
                    <button type="button" class="btn" :class="pcb.ledFootprintId === 'auto' ? 'btn-primary' : 'btn-outline-secondary'" @click="patchPcb({ ledFootprintId: 'auto' })">Auto</button>
                  </div>
                  <div class="form-text">{{ ledFootprintLabel }}. {{ ledPinOrderLabel }}。Pin order is validated and the LED is placed on the back.</div>
                  <div class="small text-muted mt-1">Resolved: {{ resolvedLedFootprintLabel }}</div>
                </div>
                <div class="col-12 form-text small">Uses the same shared tight-outline geometry as Plate Generator. Auto repair changes only unsafe narrow necks; it never replaces a concave outline with a rectangle.</div>
                <div class="col-3">
                  <label class="form-label small mb-1">Margin mm</label>
                  <input aria-label="PCB outline margin" class="form-control form-control-sm" type="number" min="0" step="0.1" :value="pcb.outline.marginMm" @input="updatePcbOutline({ marginMm: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-3">
                  <label class="form-label small mb-1">Corner R</label>
                  <input aria-label="PCB corner radius" class="form-control form-control-sm" type="number" min="0" step="0.1" :value="pcb.outline.cornerRadiusMm" @input="updatePcbOutline({ cornerRadiusMm: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-3">
                  <label class="form-label small mb-1">Min web mm</label>
                  <input aria-label="PCB minimum material web" class="form-control form-control-sm" type="number" min="0.5" step="0.1" :value="pcb.outline.minimumWebWidthMm" @input="updatePcbOutline({ minimumWebWidthMm: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-12 form-check ms-1">
                  <input id="pcb-mounting-holes" class="form-check-input" type="checkbox" :checked="pcb.mountingHoles.enabled" @change="updatePcbMounting({ enabled: ($event.target as HTMLInputElement).checked })" />
                  <label class="form-check-label small" for="pcb-mounting-holes">Auto-place mounting holes</label>
                </div>
                <div class="col-4">
                  <label class="form-label small mb-1">Hole count</label>
                  <input aria-label="Mounting hole count" class="form-control form-control-sm" type="number" min="1" max="8" step="1" :value="pcb.mountingHoles.count" @input="updatePcbMounting({ count: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-12 form-text small">Mounting holes are selected inside the final outline. The outline is never expanded; edge clearance and minimum material width violations stop export.</div>
                <div class="col-4">
                  <label class="form-label small mb-1">Drill mm</label>
                  <input aria-label="Mounting hole drill" class="form-control form-control-sm" type="number" min="0.6" step="0.1" :value="pcb.mountingHoles.drillMm" @input="updatePcbMounting({ drillMm: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-4">
                  <label class="form-label small mb-1">Edge distance</label>
                  <input aria-label="Mounting hole edge distance" class="form-control form-control-sm" type="number" min="0.5" step="0.1" :value="pcb.mountingHoles.edgeDistanceMm" @input="updatePcbMounting({ edgeDistanceMm: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-12 form-check ms-1">
                  <input id="pcb-rgb" class="form-check-input" type="checkbox" :checked="pcb.rgb.enabled" @change="updatePcbRgb({ enabled: ($event.target as HTMLInputElement).checked })" />
                  <label class="form-check-label small" for="pcb-rgb">Per-key RGB: SK6812MINI-E + Rev.A 5V boost</label>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">LED type</label>
                  <select aria-label="RGB LED type" class="form-select form-select-sm" :value="pcb.rgb.type" @change="updatePcbRgb({ type: 'sk6812mini-e' })">
                    <option value="sk6812mini-e">SK6812MINI-E</option>
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Max LEDs / side</label>
                  <input aria-label="Maximum RGB LEDs per side" class="form-control form-control-sm" type="number" min="1" max="128" step="1" :value="pcb.rgb.maxLedsPerSide" @input="updatePcbRgb({ maxLedsPerSide: Number(($event.target as HTMLInputElement).value) })" />
                </div>
                <div class="col-12">
                  <label class="form-label small mb-1">RGB support placement</label>
                  <select aria-label="RGB support placement" class="form-select form-select-sm" :value="pcb.rgb.placementMode" @change="updatePcbRgb({ placementMode: ($event.target as HTMLSelectElement).value as 'auto' | 'manual' })">
                    <option value="auto">Auto near controller</option>
                    <option value="manual">Manual in KiCad（staging area）</option>
                  </select>
                  <div class="form-text">Manual mode outputs U_RGB、U_LS and their support parts outside the key area. Move and route them in KiCad.</div>
                </div>
                <div class="col-12 form-text">Stabilizer profile is shared with Plate Generator: <code>{{ pcb.stabilizers.type }}</code>.</div>
                <div class="col-12"><button type="button" class="btn btn-sm btn-outline-secondary" @click="resetFootprints">Reset all footprint choices to compatible defaults</button></div>
              </div>
              <p class="text-muted small mt-3 mb-0">
                Controller and devices are added from the Layout Editor. Split boundary and
                connection are used by the automatic solver.
              </p>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header fw-semibold">Resolved matrix and split</div>
            <div class="card-body">
              <div class="display-6">{{ model.matrix.rows }} × {{ model.matrix.columns }}</div>
              <p class="text-muted small">
                {{ Object.keys(model.matrix.assignments).length }} switch positions assigned
                deterministically.
              </p>
              <div class="d-flex gap-2 mb-3">
                <span class="badge text-bg-light border"
                  >Left:
                  {{
                    Object.values(model.split.assignments).filter((side) => side === 'left').length
                  }}</span
                ><span class="badge text-bg-light border"
                  >Right:
                  {{
                    Object.values(model.split.assignments).filter((side) => side === 'right').length
                  }}</span
                >
              </div>
              <p class="small mb-2">
                Boundary X: <code>{{ model.split.boundaryX }}</code> · {{ model.split.connection }}
              </p>
              <ul class="list-group list-group-flush small">
                <li
                  v-for="assignment in model.resources.assignments"
                  :key="assignment.requirementId"
                  class="list-group-item d-flex justify-content-between"
                >
                  <span>{{ assignment.requirementId }}</span
                  ><code>{{ assignment.resource }}</code>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="step === 'validate'">
        <div class="card mb-3">
          <div class="card-header">Circuit verification</div>
          <div class="card-body">
            <p>COL2ROW · Diode K → ROW · Board outline {{ pcb.outline.mode }} / {{ pcb.outline.marginMm }} mm · Copper edge clearance {{ pcb.outline.copperEdgeClearanceMm }} mm</p>
            <div
              v-for="block in CIRCUIT_BLOCKS.filter((b) =>
                [
                  model.controller,
                  'switch-' + model.switch,
                  model.power,
                  'key-matrix',
                  ...model.devices,
                ].includes(b.id),
              )"
              :key="block.id"
            >
              {{ block.name }}: <strong>{{ block.verification }}</strong>
            </div>
          </div>
        </div>
        <details class="card p-3 mb-3">
          <summary>Advanced: pin and matrix assignments</summary>
          <div v-for="name in pinNames" :key="name" class="d-flex align-items-center gap-2 my-2">
            <label :for="'pin-' + name">{{ name }}</label>
            <select
              :id="'pin-' + name"
              class="form-select form-select-sm"
              :value="hardware.pinOverrides[name] ?? ''"
              @change="hardware.setPinOverride(name, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                Auto:
                {{
                  model.resources.assignments.find((a) => a.requirementId === name)?.resource ??
                  'unassigned'
                }}
              </option>
              <option v-for="pin in availablePins" :key="pin.gpio" :value="pin.gpio">
                {{ pin.name }} / {{ pin.gpio }} / pad {{ pin.pad }}
              </option>
            </select>
          </div>
          <button class="btn btn-outline-secondary btn-sm me-2" @click="editMatrix">
            Edit current matrix
          </button>
          <button class="btn btn-outline-secondary btn-sm" @click="resetMatrix">Auto matrix</button>
          <template v-if="matrixJson">
            <textarea
              v-model="matrixJson"
              aria-label="Matrix assignments JSON"
              class="form-control mt-2"
              rows="8"
            ></textarea
            ><button class="btn btn-outline-primary btn-sm mt-2" @click="applyMatrix">
              Apply matrix
            </button></template
          >
        </details>
        <div
          v-for="issue in issues"
          :key="issue.code + issue.message"
          class="alert py-2"
          :class="
            issue.severity === 'ERROR'
              ? 'alert-danger'
              : issue.severity === 'WARNING'
                ? 'alert-warning'
                : 'alert-info'
          "
        >
          <BiExclamationTriangle v-if="issue.severity !== 'INFO'" class="me-2" /><BiCheckCircle
            v-else
            class="me-2"
          />
          <strong>{{ issue.severity }}</strong> — {{ issue.message }}
          <div v-if="issue.fix" class="small mt-1">Fix: {{ issue.fix }}</div>
          <div v-if="issue.outlineFocusMm" class="small mt-1 text-muted">外形補正箇所: ({{ issue.outlineFocusMm.x.toFixed(3) }}, {{ issue.outlineFocusMm.y.toFixed(3) }}) mm</div>
          <button v-if="issue.outlineFocusMm" type="button" class="btn btn-sm btn-outline-secondary mt-2" @click="focusOutlineIssue(issue.outlineFocusMm)">外形補正箇所をLayout Editorで表示</button>
          <div v-if="issue.layoutKeyIds?.length" class="mt-2 d-flex gap-1 flex-wrap">
            <button v-for="id in issue.layoutKeyIds" :key="id" type="button" class="btn btn-sm btn-outline-secondary" @click="focusIssue(issue.layoutKeyIds ?? [id])">Layout Editorで選択: {{ id }}</button>
          </div>
        </div>
        <p v-if="!errorCount" class="text-muted small">
          Ready to export. KiCad files are an editable starting point, not a DRC guarantee.
        </p>
      </div>
      <div v-else-if="step === 'export'">
        <div class="row g-3">
          <div class="col-lg-6">
            <div class="card">
              <div class="card-header fw-semibold">Export project</div>
              <div class="card-body">
                <p class="small text-muted">
                  Generates a deterministic ZIP with KiCad 9+ project files, grouped BOMs,
                  Hardware Model, and the current plate model. It is not a manufacturing package.
                </p>
                <button
                  class="btn btn-primary me-2"
                  :disabled="hasErrors || exporting"
                  @click="exportProject"
                >
                  {{ exporting ? 'Generating…' : 'Download KiCad ZIP' }}</button
                ><button class="btn btn-outline-secondary me-2" @click="exportJson">
                  Download JSON</button
                ><button class="btn btn-outline-secondary" @click="fileInput?.click()">
                  Import JSON</button
                ><input
                  ref="fileInput"
                  data-testid="hardware-import-json"
                  class="d-none"
                  type="file"
                  accept=".json"
                  @change="importJson"
                />
              </div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="card">
              <div class="card-header fw-semibold">Generated contents</div>
              <ul class="list-group list-group-flush">
                <li class="list-group-item">keyboard.kicad_pro</li>
                <li class="list-group-item">keyboard.kicad_sch (hierarchical root)</li>
                <li class="list-group-item">keyboard.kicad_pcb (initial placement)</li>
                <li class="list-group-item">bom/bom.csv</li>
                <li class="list-group-item">bom/assembly-bom.csv (review required)</li>
                <li class="list-group-item">bom/hand-assembly.csv</li>
                <li class="list-group-item">project.json</li>
                <li class="list-group-item">plate/plate-settings.json</li>
                <li class="list-group-item">plate/keyboard-plate.svg</li>
                <li class="list-group-item">plate/keyboard-plate.dxf</li>
                <template v-if="architecture === 'wired-split' && boardOutputMode === 'separate-left-right'">
                  <li class="list-group-item">plate/left/keyboard-plate.svg</li>
                  <li class="list-group-item">plate/left/keyboard-plate.dxf</li>
                  <li class="list-group-item">plate/right/keyboard-plate.svg</li>
                  <li class="list-group-item">plate/right/keyboard-plate.dxf</li>
                </template>
              </ul>
            </div>
          </div>
        </div>
        <div class="card mt-3">
          <div class="card-header fw-semibold">Plate Generator</div>
          <PlateGeneratorPanel />
        </div>
      </div>
      <div v-else class="text-muted small">Choose a workflow step.</div>

      <div class="d-flex justify-content-between mt-4">
        <button
          class="btn btn-outline-secondary btn-sm"
          :disabled="step === 'layout'"
          @click="previousStep"
        >
          Back</button
        ><button
          class="btn btn-primary btn-sm"
          :disabled="step === 'export' || (step === 'validate' && hasErrors)"
          @click="nextStep"
        >
          {{ step === 'validate' ? 'Continue to Export' : 'Next' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workflow-steps {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
}
.workflow-step {
  border: 1px solid var(--bs-border-color);
  background: var(--bs-tertiary-bg);
  color: var(--bs-body-color);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  white-space: nowrap;
}
.workflow-step.active {
  background: var(--bs-primary);
  border-color: var(--bs-primary);
  color: white;
}
.cad-canvas {
  overflow: hidden;
}
.canvas-area {
  position: relative;
  overflow: hidden;
}
.device-card {
  min-height: 88px;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background: var(--bs-tertiary-bg);
  padding: 1rem;
}
.device-card.selected {
  border-color: var(--bs-primary);
  box-shadow: 0 0 0 2px var(--bs-primary-bg-subtle);
}
.component-card {
  min-height: 58px;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background: var(--bs-tertiary-bg);
  padding: 0.65rem 0.75rem;
  color: var(--bs-body-color);
}
.component-card.selected {
  border-color: var(--bs-primary);
  box-shadow: 0 0 0 2px var(--bs-primary-bg-subtle);
}
.layout-editor-resize-handle {
  height: 6px;
  background: var(--bs-tertiary-bg);
  border-top: 1px solid var(--bs-border-color);
  border-bottom: 1px solid var(--bs-border-color);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}
.layout-editor-resize-handle:hover,
.layout-editor-resize-handle.active {
  background: var(--bs-secondary-bg);
}
.resize-handle-line {
  width: 42px;
  border-top: 2px solid var(--bs-secondary-color);
  opacity: 0.7;
}
.layout-panel {
  cursor: grab;
}
.layout-panel:active {
  cursor: grabbing;
}
.drag-grip {
  color: var(--bs-secondary-color);
  letter-spacing: -0.15em;
  user-select: none;
}
.drag-handle {
  user-select: none;
}
.panel-toggle {
  min-width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.layout-panel.drag-over {
  transform: translateY(-3px);
  box-shadow: 0 0 0 2px var(--bs-primary);
}
.panel-list-move,
.panel-list-enter-active,
.panel-list-leave-active {
  transition: all 0.2s ease;
}
.panel-list-enter-from,
.panel-list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.panel-list-leave-active {
  position: absolute;
}
</style>
