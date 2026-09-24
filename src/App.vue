<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import HardwareCadWorkspace from './components/HardwareCadWorkspace.vue'
import KeyboardToolbar from './components/KeyboardToolbar.vue'
import AppFooter from './components/AppFooter.vue'
import CanvasHelpModal from './components/CanvasHelpModal.vue'
import FundingModal from './components/FundingModal.vue'
import ToastContainer from './components/ToastContainer.vue'
import AccountMenu from './components/AccountMenu.vue'
import GitHubStarPopup from './components/GitHubStarPopup.vue'
import TouchWarningBanner from './components/TouchWarningBanner.vue'
import { useKeyboardStore } from '@/stores/keyboard'
import { useTheme } from '@/composables/useTheme'
import { PRODUCTION_URL, deploymentLabel, isPreviewDeployment } from '@/config/deployment'

const keyboardStore = useKeyboardStore()
useTheme()

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => keyboardStore.dirty,
  (isDirty) => {
    if (isDirty) window.addEventListener('beforeunload', handleBeforeUnload)
    else window.removeEventListener('beforeunload', handleBeforeUnload)
  },
  { immediate: true },
)

onUnmounted(() => window.removeEventListener('beforeunload', handleBeforeUnload))

// The modals remain mounted for compatibility with the existing KLE shell.
const closeHelp = () => undefined
const closeFunding = () => undefined
</script>

<template>
  <div id="app" class="d-flex flex-column min-vh-100">
    <header class="navbar app-header border-bottom py-2">
      <div class="container-fluid">
        <div class="w-100 d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2">
          <h1 class="navbar-brand mb-0 flex-shrink-0 text-center text-md-start" :data-deployment="deploymentLabel">
            <strong>Keyboard Hardware CAD</strong>
          </h1>
          <nav class="d-flex flex-row flex-grow-1 align-items-center gap-2" aria-label="Main toolbar">
            <div class="flex-grow-1"><KeyboardToolbar /></div>
            <AccountMenu />
          </nav>
        </div>
      </div>
    </header>

    <div v-if="isPreviewDeployment" class="preview-banner border-bottom px-3 py-2 text-center">
      This is a <strong>preview</strong> build from an unreleased commit &mdash; features may be incomplete or broken. For the stable editor go to
      <a :href="PRODUCTION_URL">editor.keyboard-tools.xyz</a>.
    </div>

    <TouchWarningBanner />

    <main class="flex-grow-1" role="main" aria-label="Keyboard layout editor workspace">
      <HardwareCadWorkspace />
    </main>

    <AppFooter />
    <CanvasHelpModal :is-visible="false" @close="closeHelp" />
    <FundingModal :is-visible="false" @close="closeFunding" />
    <ToastContainer />
    <GitHubStarPopup />
  </div>
</template>

<style scoped>
.app-header { background-color: var(--bs-tertiary-bg); color: var(--bs-body-color); }
.navbar-brand { color: var(--bs-primary) !important; }
.navbar-brand[data-deployment] { position: relative; }
.navbar-brand[data-deployment]::after {
  content: attr(data-deployment);
  position: absolute;
  top: 50%; right: 0.25rem;
  transform: translateY(-50%) rotate(-12deg);
  padding: 0.1em 0.4em;
  border: 0.15em solid currentColor;
  border-radius: 0.2em;
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.1;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.85;
  pointer-events: none;
}
.navbar-brand[data-deployment='preview']::after { color: var(--bs-danger); }
.navbar-brand[data-deployment='local']::after { color: var(--bs-secondary-color); }
@media (min-width: 768px) { .navbar-brand[data-deployment] { padding-right: 4.75rem; } }
.preview-banner {
  background-color: var(--bs-warning-bg-subtle);
  border-color: var(--bs-warning-border-subtle) !important;
  color: var(--bs-warning-text-emphasis);
  font-size: 0.875rem;
}
.preview-banner a { color: inherit; font-weight: 600; text-decoration: underline; }
</style>
