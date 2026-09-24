import { FOOTPRINT_SNAPSHOTS, FOOTPRINT_LICENSES } from '@/data/footprints'
import { blockFor } from '@/data/circuit-blocks'
import type { KeyboardHardwareModel } from '@/types/hardware'
import type { PlateGenerationResult } from '@/types/plate'
import { createZip } from '@/utils/zip'
import { compareIds, stableJson } from './identity'
import { buildHardwareModel } from './model'
import { parseHardwareProject } from './project'
import { footprintLibrary, pcbFile, schematicFiles, symbolLibrary } from './kicad'
import { SWITCH_FOOTPRINTS_BY_ID } from '@/data/footprint-catalog'

export function buildProjectFiles(
  model: KeyboardHardwareModel,
  plateSettingsJson: unknown,
  plateResult: PlateGenerationResult,
  plateSideResults?: Partial<Record<'left' | 'right', PlateGenerationResult>>,
) {
  const canonical = buildHardwareModel(parseHardwareProject(model))
  const errors = canonical.validation.filter((issue) => issue.severity === 'ERROR')
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join('\n'))
  const missingFootprints = [...new Set(canonical.components.map((component) => component.footprint))]
    .filter((id) => !FOOTPRINT_SNAPSHOTS[id])
    .sort(compareIds)
  if (missingFootprints.length)
    throw new Error(`Missing local footprint snapshots: ${missingFootprints.join(', ')}`)
  // Never serialize caller-supplied stale/tampered derived circuit data.
  if (stableJson(canonical) !== stableJson(model))
    throw new Error('The hardware model is stale. Recompute it before export.')
  if (!plateResult?.svgDownload || !plateResult.dxfContent || !plateSettingsJson)
    throw new Error('Generate the current plate before export.')
  const csv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const bomRows = new Map<string, {
    references: string[]
    quantity: number
    value: string
    footprint: string
    description: string
    assembly: string
    mpn: string
    lcscPartNumber: string
  }>()
  const addBomRow = (row: {
    references: string[]
    quantity: number
    value: string
    footprint: string
    description: string
    assembly: string
    mpn: string
    lcscPartNumber: string
  }) => {
    const key = [row.value, row.footprint, row.mpn, row.lcscPartNumber, row.assembly].join('|')
    const existing = bomRows.get(key)
    if (existing) {
      existing.quantity += row.quantity
      existing.references.push(...row.references)
    } else bomRows.set(key, row)
  }
  let switchIndex = 0
  for (const c of model.components) {
    const item = blockFor(c.blockId)?.bom.find((entry) => entry.footprint.includes(c.footprint))
    const row = {
      references: [c.reference],
      quantity: 1,
      value: c.value,
      footprint: `Keyboard:${c.footprint}`,
      description: item?.description ?? c.kind,
      assembly: item?.assembly ?? (c.kind === 'switch' ? 'hand' : 'smt'),
      mpn: item?.mpn ?? '',
      lcscPartNumber: item?.lcscPartNumber ?? '',
    }
    addBomRow(row)
    if (c.kind === 'switch') {
      switchIndex += 1
      const footprint = SWITCH_FOOTPRINTS_BY_ID[c.footprint]
      if (footprint?.socket) addBomRow({
        references: [`HS${switchIndex}`],
        quantity: footprint.socket.quantityPerSwitch,
        value: 'Kailh hot-swap socket',
        footprint: `BOM-only:embedded-in-${c.footprint}`,
        description: 'Kailh hot-swap socket; PCB pads are embedded in the selected switch footprint and are not placed separately.',
        assembly: 'hand',
        mpn: '',
        lcscPartNumber: '',
      })
    }
  }
  const bom = [
    'Reference,Quantity,Value,Footprint,Description,Assembly,MPN,LCSC Part Number',
    ...[...bomRows.values()].sort((a, b) => compareIds(a.references[0]!, b.references[0]!)).map((row) =>
      [row.references.join(' '), row.quantity, row.value, row.footprint, row.description, row.assembly, row.mpn, row.lcscPartNumber].map(csv).join(','),
    ),
  ].join('\n') + '\n'
  const assemblyBom = [
    'Designator,Quantity,Value,Footprint,MPN,LCSC Part Number,Assembly',
    ...[...bomRows.values()].filter((row) => row.assembly === 'smt' && !row.mpn && !row.lcscPartNumber).map((row) =>
      [row.references.join(' '), row.quantity, row.value, row.footprint, row.mpn, row.lcscPartNumber, row.assembly].map(csv).join(','),
    ),
  ].join('\n') + '\n'
  const project = {
    meta: { filename: 'keyboard.kicad_pro', version: 1 },
    board: {
      design_settings: {
        rules: {
          min_copper_edge_clearance: model.board.copperEdgeClearanceMm,
          min_clearance: 0.2,
          min_track_width: 0.2,
          min_through_hole_diameter: 0.3,
        },
      },
    },
    net_settings: {
      meta: { version: 3 },
      classes: [
        {
          name: 'Default',
          clearance: 0.2,
          track_width: 0.25,
          via_diameter: 0.6,
          via_drill: 0.3,
          microvia_diameter: 0.3,
          microvia_drill: 0.1,
          diff_pair_width: 0.2,
          diff_pair_gap: 0.25,
          diff_pair_via_gap: 0.25,
          bus_width: 12,
          wire_width: 6,
          line_style: 0,
        },
      ],
    },
    schematic: { legacy_lib_dir: '', legacy_lib_list: [] },
  }
  const entries = [
    { name: 'keyboard/keyboard.kicad_pro', text: stableJson(project) + '\n' },
    ...schematicFiles(model),
    { name: 'keyboard/keyboard.kicad_pcb', text: pcbFile(model) },
    ...(model.architecture === 'wired-split' && model.boardOutputMode === 'separate-left-right'
      ? (['left', 'right'] as const).flatMap((side) =>
          schematicFiles(model, side).map((entry) => ({
            ...entry,
            name: entry.name.replace('keyboard/', `keyboard/${side}/`),
          })).concat({ name: `keyboard/${side}/keyboard.kicad_pcb`, text: pcbFile(model, side) }, { name: `keyboard/${side}/keyboard.kicad_pro`, text: stableJson(project) + '\n' },
            { name: `keyboard/${side}/sym-lib-table`, text: '(sym_lib_table (version 7) (lib (name "Keyboard")(type "KiCad")(uri "${KIPRJMOD}/../Keyboard.kicad_sym")(options "")(descr "")))\n' },
            { name: `keyboard/${side}/fp-lib-table`, text: '(fp_lib_table (version 7) (lib (name "Keyboard")(type "KiCad")(uri "${KIPRJMOD}/../Keyboard.pretty")(options "")(descr "")))\n' }),
        )
      : []),
    { name: 'keyboard/Keyboard.kicad_sym', text: symbolLibrary() },
    {
      name: 'keyboard/sym-lib-table',
      text: '(sym_lib_table (version 7) (lib (name "Keyboard")(type "KiCad")(uri "${KIPRJMOD}/Keyboard.kicad_sym")(options "")(descr "Keyboard Hardware CAD")))\n',
    },
    {
      name: 'keyboard/fp-lib-table',
      text: '(fp_lib_table (version 7) (lib (name "Keyboard")(type "KiCad")(uri "${KIPRJMOD}/Keyboard.pretty")(options "")(descr "Keyboard Hardware CAD")))\n',
    },
    ...[...new Set(model.components.map((c) => c.footprint))].sort(compareIds).map((id) => ({
      name: `keyboard/Keyboard.pretty/${id}.kicad_mod`,
      text: footprintLibrary(id),
    })),
    { name: 'bom/bom.csv', text: bom },
    { name: 'bom/assembly-bom.csv', text: assemblyBom },
    { name: 'bom/hand-assembly.csv', text: bom },
    {
      name: 'docs/footprint-sources.json',
      text:
        stableJson(
          [...new Set(model.components.map((c) => c.footprint))].sort(compareIds).map((id) => {
            const source = FOOTPRINT_SNAPSHOTS[id]!
            return {
              id: source.id,
              authority: source.authority,
              source: source.source,
              sha256: source.sha256,
              license: source.license,
              modifications: [
                ...source.modifications,
                'Reference text adjusted; silk segments near pads moved to Fab; missing courtyards added',
              ],
            }
          }),
        ) + '\n',
    },
    ...Object.entries(FOOTPRINT_LICENSES).map(([name, text]) => ({
      name: `docs/licenses/${name}`,
      text,
    })),
    { name: 'docs/manufacturing.md', text: manufacturingGuide },
    { name: 'project.json', text: stableJson(model) + '\n' },
    { name: 'plate/plate-settings.json', text: stableJson(plateSettingsJson) + '\n' },
    {
      name: 'plate/keyboard-plate.svg',
      text: plateResult.mergedSvgDownload || plateResult.svgDownload,
    },
    {
      name: 'plate/keyboard-plate.dxf',
      text: plateResult.mergedDxfContent || plateResult.dxfContent,
    },
    {
      name: 'docs/README.md',
      text:
        '# Keyboard Hardware CAD\n\nEditable KiCad 9+ initial design. Hardware has not been tested. Route the PCB and review ERC/DRC before fabrication.\n\n' +
        (blockFor(model.controller)?.notes ?? '') +
        '\n\n' +
        (blockFor(model.power)?.notes ?? '') +
        '\n\n' +
        [...new Set(model.devices)].map((id) => blockFor(id)?.notes ?? '').join('\n\n') +
        `\n\nDiodes: 1N4148W, SOD-123. Pin 1 = cathode K = ROW. Pin 2 = anode A = switch. Matrix direction: COL2ROW. Diodes are on the back; the silkscreen bar marks K.\n\nPCB outline: ${model.pcb.outline.mode}, ${model.pcb.outline.marginMm} mm margin, R${model.pcb.outline.cornerRadiusMm} mm, copper-to-edge rule ${model.pcb.outline.copperEdgeClearanceMm} mm. Generated Edge.Cuts follows the key and component envelope. Mounting NPTH holes: ${model.pcb.mountingHoles.enabled ? `${model.board.mountingHoles.length} generated` : 'disabled'}. Stabilizer NPTH holes: ${model.board.stabilizerHoles.length}. RGB: ${model.pcb.rgb.enabled ? `SK6812MINI-E, ${model.components.filter((component) => component.kind === 'led').length} LEDs` : 'disabled'}. Review case, keycap, USB cable, antenna, battery and stabilizer access separately. Dwgs.User shows KLE key envelopes; those lines are not copper, silkscreen or board cuts.\n\nDerived from KLE-NG; this is an independent, unofficial application.\n`,
    },
  ]
  if (!plateResult.mergedSvgDownload && plateResult.outlineSvgDownload)
    entries.push({ name: 'plate/keyboard-plate-outline.svg', text: plateResult.outlineSvgDownload })
  if (!plateResult.mergedDxfContent && plateResult.outlineDxfContent)
    entries.push({ name: 'plate/keyboard-plate-outline.dxf', text: plateResult.outlineDxfContent })
  if (model.architecture === 'wired-split' && model.boardOutputMode === 'separate-left-right' &&
      plateSideResults?.left && plateSideResults.right) {
    for (const side of ['left', 'right'] as const) {
      const result = plateSideResults![side]!
      entries.push({ name: `plate/${side}/keyboard-plate.svg`, text: result.mergedSvgDownload || result.svgDownload })
      entries.push({ name: `plate/${side}/keyboard-plate.dxf`, text: result.mergedDxfContent || result.dxfContent })
      if (!result.mergedSvgDownload && result.outlineSvgDownload)
        entries.push({ name: `plate/${side}/keyboard-plate-outline.svg`, text: result.outlineSvgDownload })
      if (!result.mergedDxfContent && result.outlineDxfContent)
        entries.push({ name: `plate/${side}/keyboard-plate-outline.dxf`, text: result.outlineDxfContent })
    }
  }
  entries.sort((a, b) => compareIds(a.name, b.name))
  // ZIP uses local wall-clock fields: construct a local date, not a UTC instant.
  return { entries, archive: createZip(entries, new Date(2020, 0, 1, 0, 0, 0)) }
}

const manufacturingGuide = `# Routing and fabrication

Supported: soldered MX / Choc v1, XIAO RP2040, XIAO nRF52840 / nRF52840 Plus, and SEIBOKU.
RP2040 uses fitted 2.54 mm headers; nRF52840 uses surface mounting including underside pads.
For LiPo use only the nRF52840 integrated charger; see README.md for battery requirements.
SEIBOKU requires a mating 2x04 2.54 mm socket and spacers. Check lens and case clearance.
Keep copper, battery, metal and the case clear of the nRF52840 antenna; add a keepout in KiCad.
Hot-swap and automatic routing are not included.

1. Review the schematic, selected parts, diode polarity and module orientation.
2. Review the case, USB cable access, mounting points and stabilizers. When enabled,
   mounting and MX stabilizer holes are emitted as NPTH footprints and are excluded
   from the circuit BOM. Dwgs.User outlines are layout envelopes, not exact keycap geometry.
3. Route all airwires using the supplied netclass; review current-dependent power widths.
4. Refill any copper zones you add. Run ERC and DRC with schematic parity enabled.
   Resolve all errors and review warnings; the application does not waive DRC violations.
5. Export Gerbers for F.Cu, B.Cu, F.Mask, B.Mask, F.SilkS, B.SilkS and Edge.Cuts,
   plus Excellon drill files (plated and non-plated holes). Exclude Dwgs.User/Eco2.User.
6. Inspect the Gerber/drill files in a viewer and JLCPCB's upload preview before ordering.
   Confirm the board dimensions, holes, layers, thickness and order options.

This is a bare PCB workflow. The ZIP includes a grouped generic BOM plus review-only
assembly-bom.csv and hand-assembly.csv. Assembly requires separately validated sourcing,
MPN/LCSC selection and component positions; no manufacturing package is generated here.
Fabrication guide: https://jlcpcb.com/help/article/how-to-generate-gerber-and-drill-files-in-kicad-7

See footprint-sources.json and licenses/ for fixed library provenance and adaptations.
Choc v1 is a community library; MX/diode are KiCad official and XIAO is Seeed supplied.
SEIBOKU carrier geometry is adapted from snize under CERN-OHL-P-2.0.
No physical hardware test has been performed. Manufacturing files must be generated
from your final routed board, not this unrouted initial placement.
`
