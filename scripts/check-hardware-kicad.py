#!/usr/bin/env python3
"""Check the application's actual ZIPs with KiCad, independently of the TS serializer.
Usage: python3 scripts/check-hardware-kicad.py <fixture-directory>
"""
import csv
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

cli = os.environ.get('KICAD_CLI', 'kicad-cli')
version = subprocess.check_output([cli, 'version'], text=True).strip()
assert int(version.split('.')[0]) >= 9, version
root = Path(sys.argv[1])
archives = sorted(root.glob('*.zip'))
assert archives, 'No generated fixtures; run test:hardware:fixtures first.'
for archive in archives:
    output = root / archive.stem
    output.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
        z.extractall(output)
    project = output / 'keyboard'
    schematic = project / 'keyboard.kicad_sch'
    board = project / 'keyboard.kicad_pcb'
    def run(*args):
        completed = subprocess.run([cli, *map(str, args)], text=True, capture_output=True)
        assert completed.returncode == 0, completed.stdout + completed.stderr
    run('sch', 'erc', '--format', 'json', '-o', output / 'erc.json', schematic)
    erc = json.loads((output / 'erc.json').read_text())
    violations = [v for sheet in erc['sheets'] for v in sheet['violations']]
    assert not violations, json.dumps(violations, indent=2, ensure_ascii=False)
    run('sch', 'export', 'netlist', '--format', 'kicadxml', '-o', output / 'netlist.xml', schematic)
    netlist = ET.parse(output / 'netlist.xml')
    model = json.loads((output / 'project.json').read_text())
    components = {c['id']: c for c in model['components']}
    actual_parts = {c.attrib['ref'] for c in netlist.findall('.//components/comp')}
    assert actual_parts == {c['reference'] for c in components.values()}
    expected_nets = {frozenset((components[node['componentId']]['reference'], node['pin']) for node in net['nodes']) for net in model['nets']}
    actual_nets = {frozenset((node.attrib['ref'], node.attrib['pin']) for node in net.findall('node')) for net in netlist.findall('.//nets/net') if not net.attrib['name'].startswith('unconnected-')}
    assert expected_nets == actual_nets, f'Connectivity differs: {expected_nets ^ actual_nets}'
    with (output / 'bom/bom.csv').open(newline='') as f:
        bom = list(csv.DictReader(f))
    bom_refs = {ref for row in bom for ref in row['Reference'].split()}
    assert bom_refs == actual_parts
    assert all(int(row['Quantity']) == len(row['Reference'].split()) for row in bom)
    run('pcb', 'drc', '--schematic-parity', '--format', 'json', '-o', output / 'drc.json', board)
    drc = json.loads((output / 'drc.json').read_text())
    assert not drc.get('violations'), json.dumps(drc.get('violations'), indent=2, ensure_ascii=False)
    assert not drc.get('schematic_parity'), json.dumps(drc.get('schematic_parity'), indent=2, ensure_ascii=False)
    assert drc.get('unconnected_items'), 'Expected unrouted board to report airwires.'
    run('sch', 'export', 'svg', '-o', str(output / 'svg') + '/', schematic)
    print(f'{archive.stem}: KiCad {version}, ERC 0, DRC 0 except {len(drc["unconnected_items"])} unrouted connections; netlist and BOM match.', flush=True)
