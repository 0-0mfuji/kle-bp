---
layout: home

hero:
  name: KLE-NG
  text: Keyboard Layout Editor NG
  tagline: A modern reimplementation of the Keyboard Layout Editor — better UX, KLE compatibility, and built-in plate and PCB generators.
  image:
    light: /hero-light.png
    dark: /hero-dark.png
    alt: KLE-NG editor interface
  actions:
    - theme: brand
      text: Open Editor
      link: https://editor.keyboard-tools.xyz/
    - theme: alt
      text: Getting Started
      link: /getting-started
---

<div class="home-features">
  <a class="home-feature" href="/docs/layout-editor">
    <img src="/feature-layout-editor-light.png" class="light-only" alt="Layout Editor preview" />
    <img src="/feature-layout-editor-dark.png" class="dark-only" alt="Layout Editor preview" />
    <div class="home-feature-title">Layout Editor</div>
    <div class="home-feature-details">Full-featured canvas editor with keyboard shortcuts, precise movement tools, mirror and rotate tools, and extra tools for bulk editing.</div>
    <div class="home-feature-link">Learn more →</div>
  </a>
  <a class="home-feature" href="/docs/plate-generator">
    <img src="/feature-plate-generator-light.png" class="light-only" alt="Plate Generator preview" />
    <img src="/feature-plate-generator-dark.png" class="dark-only" alt="Plate Generator preview" />
    <div class="home-feature-title">Plate Generator</div>
    <div class="home-feature-details">Create switch and stabilizer cutouts for manufacturing. Exports to SVG, DXF, STL, and JSCAD. Supports Cherry MX, Alps, Kailh Choc.</div>
    <div class="home-feature-link">Learn more →</div>
  </a>
  <a class="home-feature" href="/docs/pcb-generator">
    <img src="/feature-pcb-generator-light.png" class="light-only" alt="PCB Generator preview" />
    <img src="/feature-pcb-generator-dark.png" class="dark-only" alt="PCB Generator preview" />
    <div class="home-feature-title">PCB Generator</div>
    <div class="home-feature-details">Generate KiCad PCB project files directly from your keyboard layout with switch matrix schematic and routed connections.</div>
    <div class="home-feature-link">Learn more →</div>
  </a>
</div>
# Keyboard Hardware CAD

KLE-NG now includes a local-only Hardware CAD workspace. Use the workflow at the top of the editor:

`Layout → Devices → Controller / Power → Validate → Export`

The MVP generates a KiCad 9+ starting project, BOM, and `project.json` from registered circuit blocks. No account, Supabase project, or PCB-generation backend is required.
