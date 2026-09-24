#!/usr/bin/env python3
"""Import read-only KiCad library packages as JSON for the browser generator.
Usage: python3 scripts/import-rgb-footprints.py /path/to/KiCad/footprints
No KiCad source files are modified. Hashes identify the actual imported bytes.
"""
import hashlib
import json
from pathlib import Path
import re
import sys


def parse(source):
    tokens = iter(re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', source))
    def read(token):
        if token == '(':
            items = []
            for token in tokens:
                if token == ')':
                    return items
                items.append(read(token))
            raise ValueError('Unclosed expression')
        if token.startswith('"'):
            return json.loads(token)
        try:
            return float(token) if '.' in token else int(token)
        except ValueError:
            return token
    return read(next(tokens))


def child(node, name):
    return next((v for v in node if isinstance(v, list) and v[0] == name), None)


base = Path(sys.argv[1])
for name, library in [
    ('LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount', 'LED_SMD.pretty/LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount.kicad_mod'),
    ('TPS61023', 'Package_TO_SOT_SMD.pretty/SOT-563.kicad_mod'),
    ('SN74AHCT1G125', 'Package_TO_SOT_SMD.pretty/SOT-23-5.kicad_mod'),
]:
    raw = (base / library).read_bytes()
    nodes = [v for v in parse(raw.decode())[2:] if isinstance(v, list) and v[0] not in ['version', 'generator', 'generator_version', 'model', 'embedded_fonts']]
    pads = []
    for node in nodes:
        if node[0] != 'pad':
            continue
        at, size = child(node, 'at'), child(node, 'size')
        pads.append(dict(number=str(node[1]), x=at[1], y=at[2], width=size[1], height=size[2], type=node[2]))
    data = dict(id=name, authority='KiCad official (KiCad 10 library snapshot)',
                source=f'https://gitlab.com/kicad/libraries/kicad-footprints/-/blob/master/{library}',
                sha256=hashlib.sha256(raw).hexdigest(), license='kicad-license.md',
                modifications=['Removed external 3D model paths; package geometry and pad numbering retained'], nodes=nodes, pads=pads)
    Path(f'src/data/footprints/{name}.json').write_text(json.dumps(data, indent=2) + '\n')
