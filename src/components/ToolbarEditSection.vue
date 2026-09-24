<template>
  <div class="toolbar-section">
    <label class="section-label">Edit</label>
    <div class="tool-buttons">
      <!-- Add Key Button Group -->
      <div class="btn-group-vertical add-key-group dropend">
        <button
          class="tool-button primary-add-btn"
          data-testid="toolbar-add-key"
          @click="$emit('add-key')"
          title="Add Standard Key"
        >
          <BiPlusCircle />
        </button>
        <button
          class="tool-button dropdown-btn dropdown-toggle"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="Add Special Key"
        >
          <BiChevronDown />
        </button>
        <ul class="dropdown-menu">
          <li v-for="specialKey in specialKeys" :key="specialKey.name">
            <button
              class="dropdown-item"
              @click="$emit('add-special-key', specialKey)"
              :title="specialKey.description"
            >
              {{ specialKey.name }}
            </button>
          </li>
        </ul>
      </div>

      <div class="btn-group-vertical add-hardware-group dropend">
        <button
          class="tool-button"
          data-testid="toolbar-add-hardware"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          title="Add Hardware"
        >
          <BiCpu />
        </button>
        <ul class="dropdown-menu">
          <li v-for="item in hardwareItems" :key="item.id">
            <button class="dropdown-item" type="button" @click="$emit('add-hardware', item)">
              {{ item.label }}
            </button>
          </li>
        </ul>
      </div>

      <button
        class="tool-button"
        data-testid="toolbar-delete-keys"
        @click="$emit('delete-keys')"
        :disabled="!canDelete"
        title="Delete Keys"
      >
        <BiTrash />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type SpecialKeyTemplate } from '@/data/specialKeys'
import BiPlusCircle from 'bootstrap-icons/icons/plus-circle.svg'
import BiChevronDown from 'bootstrap-icons/icons/chevron-down.svg'
import BiTrash from 'bootstrap-icons/icons/trash.svg'
import BiCpu from 'bootstrap-icons/icons/cpu.svg'
import { hardwareSizeInUnits } from '@/data/hardware-layout'

export interface HardwarePaletteItem {
  id:
    | 'xiao-rp2040'
    | 'xiao-nrf52840'
    | 'xiao-nrf52840-plus'
    | 'promicro-atmega32u4'
    | 'split-trrs-jack-pj320a'
    | 'split-trrs-ptc'
    | 'ec11'
    | 'pmw3610'
    | 'seiboku-jumper-header'
    | 'ssd1306-oled'
    | 'power-switch-msk-12c02'
    | 'power-switch-alps-ssss8'
    | 'battery-connector-jst-ph-2'
    | 'battery-connector-jst-sh-1'
    | 'battery-keepout-401230'
    | 'battery-keepout-502535'
    | 'battery-keepout-601730'
  label: string
  width: number
  height: number
  color: string
}

const hardwareItems: HardwarePaletteItem[] = (
  [
    ['xiao-rp2040', 'Controller: XIAO RP2040', '#c9d8ff'],
    ['xiao-nrf52840', 'Controller: XIAO nRF52840', '#c9d8ff'],
    ['xiao-nrf52840-plus', 'Controller: XIAO nRF52840 Plus', '#c9d8ff'],
    ['promicro-atmega32u4', 'Preview only: Pro Micro ATmega32U4', '#c9d8ff'],
    ['split-trrs-jack-pj320a', 'Split: TRRS PJ-320A', '#ffe4b8'],
    ['ec11', 'Preview only: EC11', '#d5f0d2'],
    ['pmw3610', 'Device: PMW3610 SEIBOKU', '#d5f0d2'],
    ['seiboku-jumper-header', 'Device: SEIBOKU jumper header', '#d5f0d2'],
    ['ssd1306-oled', 'Preview only: SSD1306 OLED', '#d5f0d2'],
    ['power-switch-msk-12c02', 'Power: MSK-12C02', '#ffd6d6'],
    ['power-switch-alps-ssss8', 'Visual only: Alps SSSS8', '#ffd6d6'],
    ['battery-connector-jst-ph-2', 'Battery: JST PH 2.0', '#ffe0c2'],
    ['battery-connector-jst-sh-1', 'Battery: JST SH 1.0', '#ffe0c2'],
    ['battery-keepout-401230', 'Battery keepout: 401230', '#e1e1e1'],
    ['battery-keepout-502535', 'Battery keepout: 502535', '#e1e1e1'],
    ['battery-keepout-601730', 'Battery keepout: EEMB LP601730', '#e1e1e1'],
  ] as const
).map(([id, label, color]) => ({
  id,
  label,
  color,
  ...hardwareSizeInUnits(id),
}))

defineProps<{
  specialKeys: SpecialKeyTemplate[]
  canDelete: boolean
}>()

defineEmits<{
  'add-key': []
  'add-special-key': [specialKey: SpecialKeyTemplate]
  'add-hardware': [item: HardwarePaletteItem]
  'delete-keys': []
}>()
</script>

<style scoped>
.add-key-group .dropdown-toggle::after {
  display: none;
}
</style>
