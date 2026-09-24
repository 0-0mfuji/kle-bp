<template>
  <BaseHelpModal :is-visible="isVisible" title="Manufacturing Properties - Help" @close="close">
    <div class="help-section">
      <h6 class="help-section-title">What are manufacturing properties?</h6>
      <div class="help-content">
        <p>
          The <code>Switch orientation</code> and <code>Stabilizer orientation</code> allow you to
          define the mounting orientation of physical switches and their stabilizers. These
          rotations are applied by <b>Plate Generator</b> independently, on top of layout rotations,
          and must be a multiple of 90&#176;.
        </p>

        <p>
          Most plate stabilizer cutout types are unidirectional, forcing a specific mounting
          orientation on the plate or PCB. Always validate that the stabilizer cutout matches the
          intended mounting orientation of the stabilizer.
        </p>

        <p>
          For a Cherry MX PCB-mounted stabilizer with wire facing south, this is the correct PCB
          footprint orientation and the corresponding <b>Cherry MX Basic</b> cutout position:
        </p>

        <div class="d-flex flex-wrap align-items-center">
          <figure class="example-figure">
            <img
              :src="`${assetBase}cherry-mx-pcb-stabilizer-3d.png`"
              alt="Example of Cherry MX stabilizer orientation"
              class="example-image"
            />
            <figcaption>3D view</figcaption>
          </figure>
          <figure class="example-figure">
            <img
              :src="`${assetBase}cherry-mx-pcb-stabilizer-pcb.png`"
              alt="Example of Cherry MX stabilizer PCB footprint orientation"
              class="example-image"
            />
            <figcaption>PCB footprint</figcaption>
          </figure>
          <figure class="example-figure">
            <img
              :src="`${assetBase}cherry-mx-pcb-stabilizer-cutout.png`"
              alt="Example of Cherry MX plate cutout orientation"
              class="example-image"
            />
            <figcaption>Plate cutout</figcaption>
          </figure>
        </div>
      </div>
    </div>
  </BaseHelpModal>
</template>

<script setup lang="ts">
import BaseHelpModal from './BaseHelpModal.vue'

const assetBase = import.meta.env.BASE_URL

interface Props {
  isVisible: boolean
}

interface Emits {
  (e: 'close'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const close = () => {
  emit('close')
}
</script>

<style scoped>
.example-figure {
  margin: 0 0 0.5rem 1rem;
  text-align: center;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.example-image {
  max-width: 100%;
  height: auto;
}

figcaption {
  font-size: 0.85em;
  color: var(--bs-secondary-color);
  margin-top: 0.25rem;
}
</style>
