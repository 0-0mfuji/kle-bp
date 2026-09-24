<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useKeyboardStore } from '@/stores/keyboard'

const props = defineProps<{ modelValue: number | null; resolvedBoundary: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const keyboard = useKeyboardStore()
const svgRef = ref<SVGSVGElement | null>(null)
const dragging = ref(false)

const items = computed(() => keyboard.keys.filter((key) => !key.ghost))
const bounds = computed(() => {
  if (!items.value.length) return { minX: 0, minY: 0, maxX: 10, maxY: 5 }
  return items.value.reduce((result, key) => ({
    minX: Math.min(result.minX, key.x ?? 0),
    minY: Math.min(result.minY, key.y ?? 0),
    maxX: Math.max(result.maxX, (key.x ?? 0) + (key.width ?? 1)),
    maxY: Math.max(result.maxY, (key.y ?? 0) + (key.height ?? 1)),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
})
const padding = 1
const viewBox = computed(() => `${bounds.value.minX - padding} ${bounds.value.minY - padding} ${bounds.value.maxX - bounds.value.minX + padding * 2} ${bounds.value.maxY - bounds.value.minY + padding * 2}`)
const boundary = computed(() => props.modelValue ?? props.resolvedBoundary)

const updateBoundary = (event: PointerEvent) => {
  if (!svgRef.value) return
  const transform = svgRef.value.getScreenCTM()
  if (!transform) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
  const x = point.x
  emit('update:modelValue', Math.max(bounds.value.minX, Math.min(bounds.value.maxX, Math.round(x * 4) / 4)))
}
const startDrag = (event: PointerEvent) => {
  dragging.value = true
  ;(event.currentTarget as SVGElement).setPointerCapture(event.pointerId)
  updateBoundary(event)
}
const moveDrag = (event: PointerEvent) => { if (dragging.value) updateBoundary(event) }
const stopDrag = () => { dragging.value = false }
onUnmounted(stopDrag)
</script>

<template>
  <div class="split-boundary-preview" :class="{ dragging }">
    <svg ref="svgRef" :viewBox="viewBox" role="img" aria-label="Split boundary preview" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag">
      <rect :x="bounds.minX - padding" :y="bounds.minY - padding" :width="bounds.maxX - bounds.minX + padding * 2" :height="bounds.maxY - bounds.minY + padding * 2" class="preview-background" />
      <g v-for="(key, index) in items" :key="index" :transform="`rotate(${key.rotation_angle ?? 0} ${key.rotation_x ?? 0} ${key.rotation_y ?? 0})`">
        <rect :x="key.x" :y="key.y" :width="key.width" :height="key.height" :class="key.profile === 'hardware' ? 'hardware-item' : 'preview-key'" rx=".12" />
        <text :x="(key.x ?? 0) + (key.width ?? 1) / 2" :y="(key.y ?? 0) + (key.height ?? 1) / 2" class="preview-label">{{ key.labels[0] }}</text>
      </g>
      <line :x1="boundary" :x2="boundary" :y1="bounds.minY - padding" :y2="bounds.maxY + padding" class="boundary-line" @pointerdown.stop="startDrag" />
      <text :x="boundary + .15" :y="bounds.minY - .35" class="boundary-label">Split</text>
    </svg>
    <div class="small text-muted mt-1">Drag the red line to change the Left / Right boundary.</div>
  </div>
</template>

<style scoped>
.split-boundary-preview { padding: .6rem; border: 1px solid var(--bs-border-color); border-radius: .375rem; background: var(--bs-tertiary-bg); }
svg { display: block; width: 100%; height: 220px; overflow: hidden; }
.preview-background { fill: var(--bs-body-bg); stroke: var(--bs-border-color); stroke-width: .035; }
.preview-key { fill: #d8d8d8; stroke: #444; stroke-width: .035; }
.hardware-item { fill: #fff; stroke: #222; stroke-width: .055; }
.preview-label { fill: #222; font-size: .28px; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.boundary-line { stroke: #dc3545; stroke-width: 3; cursor: ew-resize; vector-effect: non-scaling-stroke; }
.boundary-label { fill: #dc3545; font-size: .28px; font-weight: 700; pointer-events: none; }
.dragging .boundary-line { stroke-width: 4; }
</style>
