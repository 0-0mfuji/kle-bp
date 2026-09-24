import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Hardware export runs locally; the optional upstream routing service is not
// part of this integration suite.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/workers', (route) =>
    route.fulfill({
      json: {
        worker_processes: 0,
        total_capacity: 0,
        active_tasks: 0,
        idle_capacity: 0,
        workers: [],
      },
    }),
  )
})

const project = {
  schemaVersion: 1,
  kicadVersion: '9+',
  architecture: 'unibody',
  switch: 'mx',
  controller: 'xiao-rp2040',
  devices: [],
  power: 'usb',
  layout: {
    keys: Array.from({ length: 6 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3) })),
    metadata: { name: 'CAD integration test' },
  },
  split: { connection: 'none', boundaryX: 1 },
  pinOverrides: {},
  matrix: { rows: 2, columns: 3 },
}

test('hardware layout, undo, validation, ZIP generation and JSON round trip', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  const workspace = page.getByTestId('hardware-cad-workspace')
  await workspace.getByRole('button', { name: 'Export', exact: true }).click()
  await workspace.getByTestId('hardware-import-json').setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await expect(page.getByText('Layout and hardware settings restored.')).toBeVisible()
  await workspace.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(
    workspace.getByText('Ready to export an editable, unrouted KiCad starting point.'),
  ).toBeVisible()
  await workspace.getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByTestId('toolbar-add-hardware').filter({ visible: true }).click()
  await page
    .getByRole('button', { name: 'Controller: XIAO RP2040', exact: true })
    .filter({ visible: true })
    .click()
  await workspace.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(workspace.getByText('Place exactly one controller; found 2.')).toBeVisible()
  await workspace.getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByTitle('Undo', { exact: true }).filter({ visible: true }).click()
  await workspace.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(
    workspace.getByText('Ready to export an editable, unrouted KiCad starting point.'),
  ).toBeVisible()
  await workspace.getByRole('button', { name: 'Export', exact: true }).click()
  const zipPromise = page.waitForEvent('download')
  await workspace.getByRole('button', { name: 'Download KiCad ZIP' }).click()
  const zip = await zipPromise
  expect(zip.suggestedFilename()).toBe('keyboard-hardware-cad.zip')
  await zip.saveAs(testInfo.outputPath('keyboard.zip'))
  const zipBytes = await readFile(testInfo.outputPath('keyboard.zip'))
  for (const entry of [
    'controller.kicad_sch',
    'matrix.kicad_sch',
    'power.kicad_sch',
    'keyboard-plate.svg',
    'keyboard-plate.dxf',
    'bom/bom.csv',
  ])
    expect(zipBytes.includes(Buffer.from(entry))).toBe(true)
  const jsonPromise = page.waitForEvent('download')
  await workspace.getByRole('button', { name: 'Download JSON' }).click()
  const json = await jsonPromise
  await json.saveAs(testInfo.outputPath('project.json'))
  const saved = JSON.parse(await readFile(testInfo.outputPath('project.json'), 'utf8'))
  expect(saved.schemaVersion).toBe(6)
  expect(saved.components).toHaveLength(13)
  await workspace
    .getByTestId('hardware-import-json')
    .setInputFiles(testInfo.outputPath('project.json'))
  const nextPromise = page.waitForEvent('download')
  await workspace.getByRole('button', { name: 'Download JSON' }).click()
  const next = await nextPromise
  await next.saveAs(testInfo.outputPath('restored.json'))
  expect(await readFile(testInfo.outputPath('restored.json'), 'utf8')).toBe(
    await readFile(testInfo.outputPath('project.json'), 'utf8'),
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('hardware-export.png'), fullPage: true })
})

test('invalid import reports an error and unsupported circuits cannot export KiCad', async ({
  page,
}) => {
  await page.goto('/')
  const workspace = page.getByTestId('hardware-cad-workspace')
  await workspace.getByRole('button', { name: 'Export', exact: true }).click()
  await workspace.getByTestId('hardware-import-json').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  })
  await expect(page.getByText('Unsupported project schema version.')).toBeVisible()
  await workspace.getByTestId('hardware-import-json').setInputFiles({
    name: 'split.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...project, architecture: 'wired-split' })),
  })
  await expect(workspace.getByRole('button', { name: 'Download KiCad ZIP' })).toBeDisabled()
  await expect(workspace.getByRole('button', { name: 'Download JSON' })).toBeEnabled()
})

for (const [controller, batteryPad] of [
  ['xiao-nrf52840', '19'],
  ['xiao-nrf52840-plus', '28'],
] as const) {
  test(`${controller} LiPo and SEIBOKU export with physical Nordic pins`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    const workspace = page.getByTestId('hardware-cad-workspace')
    await workspace.getByRole('button', { name: 'Export', exact: true }).click()
    await workspace.getByTestId('hardware-import-json').setInputFiles({
      name: 'nrf-lipo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...project,
          controller,
          power: 'controller-lipo',
          devices: ['pmw3610'],
        }),
      ),
    })
    await expect(workspace.getByRole('button', { name: 'Download KiCad ZIP' })).toBeEnabled()
    await workspace.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(
      workspace.getByText('Ready to export an editable, unrouted KiCad starting point.'),
    ).toBeVisible()
    await workspace.getByText('Advanced: pin and matrix assignments', { exact: true }).click()
    await expect(workspace.getByLabel('pmw3610_0_SDIO', { exact: true })).toBeVisible()
    await workspace.getByRole('button', { name: 'Export', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await workspace.getByRole('button', { name: 'Download KiCad ZIP' }).click()
    const zip = await downloading
    await zip.saveAs(testInfo.outputPath('nrf-lipo-seiboku.zip'))
    const bytes = await readFile(testInfo.outputPath('nrf-lipo-seiboku.zip'))
    expect(bytes.includes(Buffer.from('devices.kicad_sch'))).toBe(true)
    const saving = page.waitForEvent('download')
    await workspace.getByRole('button', { name: 'Download JSON' }).click()
    const json = await saving
    await json.saveAs(testInfo.outputPath('nrf-lipo.json'))
    const model = JSON.parse(await readFile(testInfo.outputPath('nrf-lipo.json'), 'utf8'))
    expect(model.controller).toBe(controller)
    expect(model.power).toBe('controller-lipo')
    expect(
      model.components.find((c: { kind: string }) => c.kind === 'controller').pins[batteryPad],
    ).toBe('VBAT')
    expect(
      model.resources.assignments.every((a: { resource: string }) => /^P[01]\./.test(a.resource)),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('nrf-lipo-seiboku.png'), fullPage: true })
  })
}
