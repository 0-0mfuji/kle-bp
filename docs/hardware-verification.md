# Hardware CAD: supported circuits and verification

This independent application is based on KLE-NG. It is not the official KLE-NG editor.
Original copyright notices and licenses remain in place.

## First release

The browser generates **unibody keyboards** using soldered MX or Kailh Choc v1:

| Controller             | Assembly                                                         | Power                                                        | Available matrix/device GPIOs |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Standard XIAO RP2040   | Two fitted 1x7 2.54 mm male headers                              | Module USB                                                   | 11                            |
| Standard XIAO nRF52840 | SMD including underside pads                                     | Module USB; USB + protected 1S LiPo with integrated charging | 11                            |
| XIAO nRF52840 Plus     | SMD, including small additional castellations and underside pads | Module USB; USB + protected 1S LiPo with integrated charging | 17                            |

XIAO nRF52840 Plus is supported with its dedicated SMD footprint and 17 allocatable
GPIOs. D11–D13 and D17–D19 are added to the standard eleven. D14/D15 remain reserved
for NFC and D16 for the onboard battery measurement circuit; they are not counted
as free GPIOs even with USB-only power. RP2040 Plus and nRF52840 Sense Plus are not supported.

Add switches, one controller and optional **PMW3610 SEIBOKU** in the Layout Editor.
Each sensor consumes four GPIOs (SCLK, bidirectional SDIO, NCS and MOTION), leaving
seven for the matrix on the standard eleven-pin controllers: at most 12 keys with one sensor, or two
keys with two sensors. A matrix alone supports at most 30 keys on those controllers.
Plus supports at most 72 keys with no sensor, 42 with one SEIBOKU, or 20 with two. Explicit overrides
reserve pins before automatic allocation. Split, EC11, OLED and legacy PMW3360
remain unsupported for KiCad export. Legacy PMW3360 files stay identifiable and are
never silently converted to an electrically different sensor.

Hot-swap, case/stabilizer mounting holes, automatic routing and firmware generation
are not included. SEIBOKU's own four mounting holes are included in its carrier footprint.

### nRF52840 battery architecture

Select **USB + protected 1S LiPo / charging**. J1 pin 1 connects to module BAT+ (standard pad 19, Plus pad 28),
and J1 pin 2 to GND. Use a protected single-cell LiPo with 3.7 V nominal and 4.2 V charge
voltage, rated for at least 100 mA charging. The battery is an external assembly item;
the BOM's battery header description specifies its requirements. No LiFePO4, primary
cells, extra charger, or battery on the 3V3/5V pins. The onboard charger does not replace
battery protection. The included header is unkeyed: verify polarity before connection.

USB supplies the module and its built-in charger. Removing USB leaves the module and
SEIBOKU powered from the battery through the module's regulated 3.3 V rail. The VBUS
pin has no output on battery. Charging is approximately 50 mA with P0.13 high impedance
(no pulls), or 100 mA with P0.13 driven LOW; firmware must configure this. Charge current,
load and battery suitability require review together. The generator does not promise
battery runtime or charging termination performance under arbitrary load.

Pin assignments use physical Nordic `P0.xx` / `P1.xx` names. Battery measurement,
charge control, flash, LEDs, NFC and debug pins are reserved. Firmware should follow
Seeed's battery-ADC instructions; battery monitoring firmware is not generated.
The chosen footprint is SMD, not a header-mounted substitute: underside BAT/GND pads
must actually be soldered. Review antenna clearance and add an appropriate copper
keepout in KiCad before routing. The generator now emits the XIAO antenna copper keepout
and the Validator rejects overlapping components, but case and nearby metal still require
manual review.

The reference TOTEM design separates BLE plus battery operation from wired TRRS operation.
This application therefore rejects wired TRRS plus LiPo combinations for the initial XIAO
nRF52840 architecture. TRRS is UART-only; its VCC and GND contacts are intentionally not routed.

### PMW3610 SEIBOKU

The supported module is [snize's BOB-PMW3610-SEIBOKU](https://github.com/snize/BOB-PMW3610-SEIBOKU/tree/34b5dbdef9589b50f4b01dc21540d15811400a6a),
pinned to revision `34b5dbdef9589b50f4b01dc21540d15811400a6a`.
It accepts **3.3 V only** and includes its own 1.9 V regulator and sensor circuitry.
Its 2x04 header is: 1=3V3, 2=GND, 3/4=NC, 5=SCLK, 6=SDIO, 7=MOTION, 8=NCS.
The assembled module, lens, mating socket and spacers form one BOM assembly entry.

The carrier footprint copies header pad geometry and four 2.2 mm mounting holes from
that revision, centered on the module's 30 × 20 mm envelope/optical center. Use a 2x04
2.54 mm mating socket, lens facing away from the carrier, and appropriate spacers.
Check sensor underside clearance, lens height (approximately 4 mm), tracking surface
and case mechanics. No optical cutout or trackball mechanism is guessed.

SDIO is a **single bidirectional data wire**, not independent MOSI and MISO signals.
The solver permits half-duplex software SPI on the selected GPIOs; firmware must
implement that interface. Do not drive SDIO from two separate output pins. MOTION is
allocated for interrupt-driven sleep instead of mandatory polling. Sleep/report-rate
settings, BLE activity and module current affect battery life; no unverified current
or runtime estimate is displayed. Each placed sensor has separate pins, nets and BOM
quantity. The exported Devices sheet connects through hierarchical labels.

## One source of design data

`KeyboardHardwareModel` schema 2 contains stable layout IDs, hardware instances,
row/column assignments, physical GPIO assignments, components, pad-to-net mappings,
board bounds and validation results. KiCad and BOM use the same components and nets.
The browser rebuilds derived data at import and checks it again before export.

The editor assigns IDs before saving its Undo snapshot. Moves preserve IDs; copies
receive new IDs; Undo/Redo restores IDs. Importing schema 1 creates missing controller
and device layout items, translates legacy matrix override names, and reports invalid
GPIO selections instead of silently accepting them. Schema 2 imports reject missing or
duplicate IDs. Invalid JSON does not partially overwrite the current project.

Matrix auto mode minimizes row+column GPIOs, then prefers the physical row count;
keys are ordered by physical Y, X and stable ID. Advanced mode accepts complete manual
row/column assignments keyed by layout ID. GPIO overrides reserve pins before automatic
assignment and use physical `GPIOxx` (RP2040) or `P0.xx` / `P1.xx` (nRF52840) names. The UI shows the corresponding D-label
and footprint pad number.

## Circuit definition and polarity

The fixed diode direction is **COL2ROW**:

```text
COLn → SW pin 1 → SW pin 2 → diode pin 2 (A) → diode pin 1 (K) → ROWn
```

Each switch gets a **1N4148W in SOD-123**. The diode is placed on the back of the PCB;
the silkscreen bar identifies its cathode. The model stores `diodeDirection: COL2ROW`.
Future firmware exporters must consume that value and the stored pin assignment.
Firmware must configure matrix inputs with pull-ups; no external pull-up resistors
are fitted in this module-based initial circuit.

The XIAO's fitted USB connector supplies the module; nRF52840 can also use the selected LiPo architecture. Its regulator, decoupling,
boot/reset and USB support circuitry are already on the module. The generator does
not add a second USB connector, regulator, charger or arbitrary battery circuit.

Root sheets expose Controller, Power, Key Matrix and optional Devices via matching Sheet Pins and
Hierarchical Labels. Power rails refer to the module outputs and USB/module ground.
Unused GPIOs are explicitly marked NC. PCB nets include KiCad's hierarchical paths
and its isolated unconnected-pin nets, so updating from the schematic preserves parity.

## Geometry and board rules

Switches follow KLE positions, rotation origins, switch rotation and X/Y pitch in mm.
The default pitch is 19.05 mm; Choc users can set 18 × 17 mm in Layout properties.
The Plate Generator uses the same pitch and layout snapshot; choose the matching plate
cutout settings. Hardware decals do not create switch holes.

The PCB rectangle encloses transformed component bodies, pads and mechanical holes,
then adds **4 mm on each side**. Reference text and keycaps do not expand that rectangle.
Copper-to-edge clearance is independently set to **0.5 mm**, track clearance to 0.2 mm,
and initial track width to 0.25 mm. These are starting rules, not a fabrication guarantee.
Same-side body collisions are rejected using oriented rectangles, so rotated layouts
are not incorrectly rejected because their axis-aligned bounds overlap. Final copper,
hole and courtyard checks are performed with KiCad in the verification suite.

MX geometry uses the standard PCB-mount pattern centered on its actuator. Choc uses
the PG1350 soldered pattern, including the click mechanism clearance hole. XIAO uses
a header-mounted footprint with USB facing the top at zero rotation. Check case,
USB cable, stabilizer and mounting access in KiCad before fabrication.

## Verification evidence

Registered supported blocks are **Reviewed**, not Verified. Manufacturer pin/polarity
information and reference mechanical definitions have been checked. The generated MX,
Choc, rotated MX, rotated Choc, 30-key, 10-row, 10-column, nRF52840 USB, nRF52840 LiPo
(MX/Choc), RP2040 + SEIBOKU, nRF52840 LiPo + SEIBOKU and dual-SEIBOKU fixtures
plus Plus USB, LiPo, rotated Choc + SEIBOKU, 72-key and 42-key + SEIBOKU fixtures
(18 configurations) were checked with KiCad 10.0.5:
ERC reports zero violations; DRC reports only expected unrouted connections; schematic
parity, independent netlist connectivity and BOM reference checks pass. SVG sheets are
rendered for visual review. **No physical hardware or firmware test has been performed.**

KiCad 9.0.9 checks are configured in `.github/workflows/hardware-cad.yml` using the
[official KiCad container](https://www.kicad.org/download/docker/). A successful CI run
is required to confirm the KiCad 9 compatibility gate; local KiCad 10 results alone
are not recorded as a KiCad 9 pass.

Sources:

- [Seeed XIAO nRF52840 pin map and battery instructions](https://wiki.seeedstudio.com/XIAO_BLE/)
- [Seeed nRF52840 schematic](https://files.seeedstudio.com/wiki/XIAO-BLE/Seeed_Studio_XIAO_nRF52840_PDF.pdf)
- [SEIBOKU source, schematic and dimensions](https://github.com/snize/BOB-PMW3610-SEIBOKU/tree/34b5dbdef9589b50f4b01dc21540d15811400a6a)
- [Seeed XIAO RP2040 pin map and module documentation](https://wiki.seeedstudio.com/XIAO-RP2040/)
- [Seeed's XIAO footprint definitions](https://files.seeedstudio.com/wiki/XIAO-KiCad-Library/New_XIAO_Series_Footprints.zip)
- [KiCad MX PCB-mount footprint](https://github.com/KiCad/kicad-footprints/blob/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/Button_Switch_Keyboard.pretty/SW_Cherry_MX_1.00u_PCB.kicad_mod)
- [Kailh PG1350 specification](https://www.kailhswitch.com/Content/upload/pdf/201915927/CPG135001D03_-_White_Clicky_Choc.pdf)
- [PG1350 soldered footprint by daprice](https://github.com/daprice/keyswitches.pretty/blob/49083b8f0d1c8a68a1b5c4ac9bc81b3870e9aa68/SW_PG1350.kicad_mod)
- [Diodes Incorporated 1N4148W](https://www.diodes.com/part/view/1N4148W)
- [KiCad SOD-123 footprint](https://github.com/KiCad/kicad-footprints/blob/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/Diode_SMD.pretty/D_SOD-123.kicad_mod)
- [KiCad schematic format](https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/)

Body dimensions in the catalog are explicit engineering parameters checked against
these sources. Pad geometry is shared directly with the library snapshots. The application embeds fixed upstream footprint snapshots. MX and SOD-123 use KiCad
official library data, XIAO uses Seeed manufacturer data, and Choc v1 uses daprice
community data (not an official Kailh library). Source URLs, SHA-256 hashes, adaptation
notes and licenses are included in every export. External 3D model paths are removed;
3D models are not bundled.

## Reproducing checks

```sh
npm run test:hardware
npm run test:hardware:fixtures
npm run test:hardware:kicad
npm run build
npx playwright test e2e/hardware-cad.spec.ts --project=chromium
```

`kicad-cli` 9+ and Python 3 must be on PATH for the KiCad checks. The browser itself
requires neither. On machines using an installed Chrome, set
`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` for the E2E command.

ZIPs use fixed wall-clock timestamps, sorted entries/JSON keys and fixed-namespace
UUIDs. The CI compares archives across independent processes and time zones. Plate
output is generated from the Export-start snapshot in an isolated worker, including
merged SVG/DXF when enabled. Exports include local symbol/footprint libraries and
library tables and therefore do not need a third-party KiCad library installation.

## Schematic and key outline presentation

The Matrix sheet follows the electrical matrix assignments: vertical column buses,
horizontal row buses, consistently placed switches and vertical COL2ROW diodes.
Wires are split at branch points with explicit junctions; crossing row/column buses
are not connected. Sheet dimensions grow for tall/wide manually assigned matrices.
Row and column numbering must be contiguous from zero; empty lines are rejected.

`Dwgs.User` shows the KLE key envelopes, including non-1U keys, secondary rectangles,
rotation origin and custom X/Y pitch. Switch-only rotation does not rotate the key
outline. Decals, ghost keys and hardware items do not produce outlines. These are
layout envelopes, not measured keycap dimensions, and never affect copper, silkscreen
or Edge.Cuts. Toggle the layer in KiCad to hide them.

Footprints retain upstream pad geometry and package graphics. The placement adapter
normalizes actuator origins, rotates the Seeed module so USB faces up, replaces fixed
MX 1U drawings with the layout envelopes, moves silk lines near pads to Fab, adjusts
reference text and adds missing courtyards. These are **adapted upstream footprints**,
not unchanged official files. The ZIP documents the modifications and licenses.

## Adding a supported part

1. Register a reviewed footprint snapshot in `src/data/footprints/index.ts`; include
   the exact source revision, raw SHA-256, license and transformation notes. The import
   script reads upstream text into browser JSON assets; it does not patch KiCad files.
   Reproduce existing assets with `python3 scripts/import-footprint-snapshot.py --download`.
2. Add body bounds in `hardware-catalog.ts`. Pads come from the snapshot, so validators
   and PCB output use the same package geometry. Verify pin 1, hole sizes and rotation.
3. Add symbol artwork/pin definitions to `hardware-symbols.ts` and package choices,
   pin mappings or diode placement offsets to `hardware-recipes.ts`. The generic
   footprint renderer does not need part-specific branches.
4. Register the Circuit Block, voltage/resources, BOM, evidence and supported status.
   A new device topology also needs its model construction and sheet template; adding
   a footprint alone must never implicitly enable an unsupported circuit.
5. Add generated fixtures and run unit tests, ERC, DRC, schematic parity, netlist/BOM
   checks and visual review. Only then update the supported-configuration validator.

Export includes `docs/manufacturing.md` with routing, mechanical review and JLCPCB
Gerber/drill steps. Fabrication files must come from the final routed board. The generic
BOM is not an assembly-service BOM. Case-specific mounting/stabilizer holes still need
user-specified geometry; the generator does not guess those dimensions.

## Readable schematic generation / wireless LiPo RGB

The exporter includes a separate `rgb.kicad_sch` sheet whenever RGB is enabled.
Every model component is emitted exactly once, including LED bypass capacitors.
RGB order follows DIN/DOUT connectivity, with five LEDs per row and named continuation
nets. Power is arranged by board side, then battery/switch, boost converter and
level shifter. Direct local wiring shows the inductor, feedback divider and series
resistor; sheet ports are limited to nets that actually leave the sheet.
Right-side matrix drawings compress unused rows/columns without changing net names.

Electrical corrections made during this review:

- TPS61023: 1=FB, 2=EN, 3=VIN, 4=GND, 5=SW, 6=VOUT, per the
  [TI datasheet](https://www.ti.com/lit/ds/symlink/tps61023.pdf).
- Official SK6812MINI-E package: 1=VDD, 2=DOUT, 3=GND, 4=DIN, per the
  [manufacturer datasheet](https://cdn-shop.adafruit.com/product-files/4960/4960_SK6812MINI-E_REV02_EN.pdf).
  The community BL package uses different pad numbers; it has a matching symbol
  variant rather than sharing an incompatible symbol.
- Each SN74AHCT1G125 now has a local 100nF bypass capacitor in the model/BOM/PCB.
- A placed battery connector feeds BAT_RAW when the wireless power switch is
  supplied by the fallback placement; it no longer bypasses that switch.
- The XIAO Plus VBUS output no longer has a second fictitious power-output driver.
- RGB LED, TPS61023 SOT-563 and SN74AHCT1G125 SOT-23-5 package placeholders were
  replaced by actual KiCad library JSON snapshots, including real pad geometry.
  `scripts/import-rgb-footprints.py` records SHA-256 of the imported source bytes.

Generate and verify fixtures:

```sh
SCHEMATIC_FIXTURE_DIR=.cache/schematic-review pnpm exec vitest run src/utils/hardware/__tests__/schematic.spec.ts
python3 scripts/check-schematic-fixtures.py .cache/schematic-review
```

The independent KiCad check covers both LED packages, each with combined, left and
right schematics: ERC, complete component membership, exact pin-to-net membership,
and PCB/schematic parity. It exports SVGs for visual inspection. It reports placement
DRC and unrouted connections separately; these are initial boards, not routed boards.
Hardware and firmware testing are still outstanding. Confirm battery protection,
charging current, inductor saturation current, capacitor voltage/DC-bias ratings,
and firmware brightness limits before building. Keep RGB_DATA low while RGB power
is disabled. Regenerate exports from the current project JSON; old exports do not
receive these corrections automatically.

### PCB hole and RGB placement clearance

Per-key RGB placement now follows the key rotation and checks switch drills,
LED routed openings, pads, nearby components, and fixed stabilizer holes. LEDs,
diodes, and bypass capacitors are placed in a deterministic order. If none of
the supported local positions fit, `RGB_PLACEMENT_UNAVAILABLE` blocks export.
Mechanical holes are checked across both PCB faces, separately for each split
board; remaining conflicts produce `PCB_MANUFACTURING_CLEARANCE` errors.
Mounting-hole placement includes the full stabilizer-hole radius.

The initial-placement policy reserves 0.5 mm between holes/openings and 0.5 mm
from openings to pads. This is conservative relative to JLCPCB's published
0.45 mm pad-hole spacing and 0.2 mm NPTH-to-track clearance
([capabilities, checked 2026-09-21](https://jlcpcb.com/capabilities/Capab)).
LED apertures use conservative enclosing rectangles; oval drills currently use
the enclosing pad dimensions. These checks do not certify manufacturing:
complete routing, inspect the selected footprints, run KiCad DRC, and review
the final Gerbers and drill files before ordering.
