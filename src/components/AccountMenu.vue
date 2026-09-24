<template>
  <div class="dropdown">
    <button class="account-trigger" data-testid="user-menu-button" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Theme settings" aria-label="Theme settings"><BiGear aria-hidden="true" /></button>
    <ul class="dropdown-menu dropdown-menu-end" data-testid="user-menu-dropdown">
      <li><h6 class="dropdown-header">Theme</h6></li>
      <li><button class="dropdown-item d-flex align-items-center gap-2" :class="{ active: theme === 'light' }" @click="setTheme('light')"><BiSunFill /> Light</button></li>
      <li><button class="dropdown-item d-flex align-items-center gap-2" :class="{ active: theme === 'dark' }" @click="setTheme('dark')"><BiMoonStarsFill /> Dark</button></li>
      <li><button class="dropdown-item d-flex align-items-center gap-2" :class="{ active: theme === 'auto' }" @click="setTheme('auto')"><BiCircleHalf /> Auto</button></li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import BiGear from 'bootstrap-icons/icons/gear.svg'
import BiSunFill from 'bootstrap-icons/icons/sun-fill.svg'
import BiMoonStarsFill from 'bootstrap-icons/icons/moon-stars-fill.svg'
import BiCircleHalf from 'bootstrap-icons/icons/circle-half.svg'

const { theme, setTheme } = useTheme()
</script>

<style scoped>
.account-trigger { background: transparent; border: 0; color: var(--bs-secondary-color); padding: .35rem; display: flex; align-items: center; }
.account-trigger:hover, .account-trigger:focus { color: var(--bs-body-color); }
.account-trigger svg { width: 1.2rem; height: 1.2rem; }
</style>
