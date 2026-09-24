#!/usr/bin/env python3
"""Verify renderer fixtures independently with KiCad ERC, netlists and PCB parity.
SCHEMATIC_FIXTURE_DIR=.cache/schematic-review pnpm exec vitest run src/utils/hardware/__tests__/schematic.spec.ts
python3 scripts/check-schematic-fixtures.py .cache/schematic-review
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

cli = os.environ.get('KICAD_CLI', 'kicad-cli')
fixtures = sorted(Path(sys.argv[1]).glob('*/model.json'))
assert fixtures, 'Generate schematic fixtures first'
for fixture in fixtures:
    directory = fixture.parent
    model = json.loads(fixture.read_text())
    schematic = directory / 'keyboard/keyboard.kicad_sch'
    def run(*args):
        result = subprocess.run([cli, *map(str, args)], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
    run('sch', 'erc', '--format', 'json', '-o', directory / 'erc.json', schematic)
    violations = [v for s in json.loads((directory / 'erc.json').read_text())['sheets'] for v in s['violations']]
    assert not violations, f'{directory.name}: {json.dumps(violations, ensure_ascii=False)}'
    run('sch', 'export', 'netlist', '--format', 'kicadxml', '-o', directory / 'netlist.xml', schematic)
    actual = ET.parse(directory / 'netlist.xml')
    parts = {c['id']: c for c in model['components']}
    assert {c.attrib['ref'] for c in actual.findall('.//components/comp')} == {c['reference'] for c in parts.values()}
    expected = {frozenset((parts[n['componentId']]['reference'], n['pin']) for n in net['nodes'] if n['componentId'] in parts) for net in model['nets']}
    expected.discard(frozenset())
    nets = {frozenset((n.attrib['ref'], n.attrib['pin']) for n in net.findall('node')) for net in actual.findall('.//nets/net') if not net.attrib['name'].startswith('unconnected-')}
    assert expected == nets, f'{directory.name} connectivity differs: {expected ^ nets}'
    run('pcb', 'drc', '--schematic-parity', '--format', 'json', '-o', directory / 'drc.json', directory / 'keyboard/keyboard.kicad_pcb')
    drc = json.loads((directory / 'drc.json').read_text())
    assert not drc.get('schematic_parity'), f'{directory.name}: {drc["schematic_parity"]}'
    run('sch', 'export', 'svg', '-o', str(directory / 'svg') + '/', schematic)
    print(f'{directory.name}: ERC 0; {len(parts)} parts and {len(nets)} nets match model; PCB schematic parity 0. Placement DRC: {len(drc.get("violations", []))}, unrouted: {len(drc.get("unconnected_items", []))}.', flush=True)
