#!/usr/bin/env python3
"""Read upstream footprint text; emit browser JSON assets, never modify KiCad files.
The reviewed sources are cached separately. Re-run explicitly when updating a library.
"""
import argparse,hashlib,json,math,re,urllib.request
from pathlib import Path

def parse(source):
    tokens=iter(re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+',source))
    def read(t):
        if t=='(':
            out=[]
            for t in tokens:
                if t==')':return out
                out.append(read(t))
            raise ValueError('Unclosed expression')
        if t.startswith('"'):return json.loads(t)
        try:return float(t) if '.' in t else int(t)
        except ValueError:return t
    result=read(next(tokens))
    if next(tokens,None) is not None:raise ValueError('Trailing input')
    return result

def child(node,name):return next((v for v in node if isinstance(v,list) and v[0]==name),None)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, default=Path('.cache/hardware-library'))
parser.add_argument('--download', action='store_true', help='Fetch pinned source and license text')
args=parser.parse_args()
args.source_dir.mkdir(parents=True, exist_ok=True)
root=Path('src/data/footprints')
entries=[('MX','mx',(-2.54,5.08),0,'KiCad official','https://github.com/KiCad/kicad-footprints/blob/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/Button_Switch_Keyboard.pretty/SW_Cherry_MX_1.00u_PCB.kicad_mod','kicad-license.md'),('SOD123','diode',(0,0),0,'KiCad official','https://github.com/KiCad/kicad-footprints/blob/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/Diode_SMD.pretty/D_SOD-123.kicad_mod','kicad-license.md'),('ChocV1','choc',(0,0),0,'Community: daprice','https://github.com/daprice/keyswitches.pretty/blob/49083b8f0d1c8a68a1b5c4ac9bc81b3870e9aa68/SW_PG1350.kicad_mod','choc-license.md'),('XIAO_RP2040','xiao',(0,0),-90,'Manufacturer: Seeed Studio','https://raw.githubusercontent.com/Seeed-Studio/OPL_Kicad_Library/b0035c51eb0348bb3e165fdb2f2765fa3d1d17bd/Seeed%20Studio%20XIAO%20Series%20Library/XIAO-RP2040-DIP.kicad_mod','seeed-license.md')]
entries += [
    ('XIAO_NRF52840', 'xiao-nrf', (8.9,-10.5), 0, 'Manufacturer: Seeed Studio', 'https://raw.githubusercontent.com/Seeed-Studio/OPL_Kicad_Library/b0035c51eb0348bb3e165fdb2f2765fa3d1d17bd/Seeed%20Studio%20XIAO%20Series%20Library/XIAO-nRF52840-SMD.kicad_mod', 'seeed-license.md'),
    ('XIAO_NRF52840_PLUS', 'xiao-nrf-plus', (0,0), -90, 'Manufacturer: Seeed Studio', 'https://raw.githubusercontent.com/Seeed-Studio/OPL_Kicad_Library/b0035c51eb0348bb3e165fdb2f2765fa3d1d17bd/Seeed%20Studio%20XIAO%20Series%20Library/XIAO-nRF52840-Plus-SMD.kicad_mod', 'seeed-license.md'),
    ('BatteryHeader', 'battery-header', (0,0), 0, 'KiCad official', 'https://github.com/KiCad/kicad-footprints/blob/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/Connector_PinHeader_2.54mm.pretty/PinHeader_1x02_P2.54mm_Vertical.kicad_mod', 'kicad-license.md'),
    ('PowerSwitch_MSK12C02', 'power-switch-msk-12c02', (0,0), 0, 'KiCad official', 'https://github.com/KiCad/kicad-footprints/blob/master/Button_Switch_SMD.pretty/SW_SPDT_Shouhan_MSK12C02.kicad_mod', 'kicad-license.md'),
    ('BatteryConnector_JST_PH2', 'battery-connector-jst-ph-2', (0,0), 0, 'KiCad official', 'https://github.com/KiCad/kicad-footprints/blob/master/Connector_JST.pretty/JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal.kicad_mod', 'kicad-license.md'),
    ('BatteryConnector_JST_SH1', 'battery-connector-jst-sh-1', (0,0), 0, 'KiCad official', 'https://github.com/KiCad/kicad-footprints/blob/master/Connector_JST.pretty/JST_SH_BM02B-SRSS-TB_1x02-1MP_P1.00mm_Vertical.kicad_mod', 'kicad-license.md'),
]
SALICYLIC_COMMIT = '9ade20b79abc7716e23f86f6b70f1b357333653c'
SALICYLIC = f'https://github.com/Salicylic-acid3/KiCAD_FootPrint/blob/{SALICYLIC_COMMIT}'
SALICYLIC_RAW = f'https://raw.githubusercontent.com/Salicylic-acid3/KiCAD_FootPrint/{SALICYLIC_COMMIT}'
for width in ['1u', '1.25u', '1.5u', '1.75u', '2u', '2.25u', '2.75u']:
    entries.append((f'MX_Solder_{width}', f'mx-solder-{width}', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/CherryMX_Solder_{width}.kicad_mod', 'salicylic-license.md'))
    entries.append((f'MX_Hotswap_{width}', f'mx-hotswap-{width}', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/CherryMX_Hotswap_{width}.kicad_mod', 'salicylic-license.md'))
for width in ['3u', '6.25u', '7u']:
    entries.append((f'MX_Hotswap_{width}', f'mx-hotswap-{width}', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/CherryMX_Hotswap_{width}.kicad_mod', 'salicylic-license.md'))
for width in ['2u', '2.25u', '2.75u']:
    entries.append((f'MX_Solder_{width}_Rev', f'mx-solder-{width}-rev', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/CherryMX_Solder_{width}_Rev.kicad_mod', 'salicylic-license.md'))
    entries.append((f'MX_Hotswap_{width}_Rev', f'mx-hotswap-{width}-rev', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/CherryMX_Hotswap_{width}_Rev.kicad_mod', 'salicylic-license.md'))
for width in ['1u', '1.25u', '1.5u', '1.75u', '2u', '2.25u']:
    entries.append((f'ChocV1V2_Hotswap_{width}', f'choc-v1v2-hotswap-{width}', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW_PCBA.pretty/MX_Choc_v1v2_Hotswap_{width}.kicad_mod', 'salicylic-license.md'))
for width in ['1u', '2u']:
    entries.append((f'ChocV2_Hotswap_{width}', f'choc-v2-hotswap-{width}', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/Choc_v2_Hotswap_{width}.kicad_mod', 'salicylic-license.md'))
entries += [
    ('ChocV1V2', 'choc-v1v2', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/Choc_v1_v2.kicad_mod', 'salicylic-license.md'),
    ('ChocV2', 'choc-v2', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_SW.pretty/Choc_v2.kicad_mod', 'salicylic-license.md'),
    ('LED_SK6812MINI-E_BL', 'sk6812mini-e-bl', (0, 0), 0, 'Community: Salicylic-acid3', f'{SALICYLIC}/kbd_Parts.pretty/LED_SK6812MINI-E_BL.kicad_mod', 'salicylic-license.md'),
]
license_sources = {
    'license': 'https://raw.githubusercontent.com/KiCad/kicad-footprints/7ebfa6b23cc292a56f751b7b5f4a0e12eeef69dd/LICENSE.md',
    'choc-license': 'https://raw.githubusercontent.com/daprice/keyswitches.pretty/49083b8f0d1c8a68a1b5c4ac9bc81b3870e9aa68/LICENSE.md',
    'seeed-license': 'https://raw.githubusercontent.com/Seeed-Studio/OPL_Kicad_Library/b0035c51eb0348bb3e165fdb2f2765fa3d1d17bd/LICENSE',
    'salicylic-license': f'{SALICYLIC_RAW}/Licence.txt',
}
seiboku_url = 'https://raw.githubusercontent.com/snize/BOB-PMW3610-SEIBOKU/34b5dbdef9589b50f4b01dc21540d15811400a6a/'
if args.download:
    for name, dest in [('BOB-PMW3610-SEIBOKU.kicad_pcb', 'seiboku-board.txt'), ('LICENSE', 'seiboku-license.txt')]:
        (args.source_dir / dest).write_bytes(urllib.request.urlopen(seiboku_url + name, timeout=30).read())
    sources = {entry[1]: entry[5].replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/') for entry in entries}
    for key, url in {**sources, **license_sources}.items():
        try:
            payload = urllib.request.urlopen(url, timeout=30).read()
        except Exception as exc:
            raise RuntimeError(f'Failed to download {key}: {url}') from exc
        (args.source_dir / ('keyboard-'+key+'.txt')).write_bytes(payload)
for id,key,origin,angle,authority,url,license in entries:
    raw=(args.source_dir / ('keyboard-'+key+'.txt')).read_bytes();tree=parse(raw.decode());out=[]
    def transform(v):
        if not isinstance(v,list):return
        if v[0] in ['at','start','end','mid','center','xy'] and len(v)>=3 and isinstance(v[1],(float,int)):
            x,y=v[1]-origin[0],v[2]-origin[1];r=math.radians(angle)
            v[1],v[2]=round(x*math.cos(r)-y*math.sin(r),6),round(x*math.sin(r)+y*math.cos(r),6)
            if v[0]=='at':
                if len(v)==3:v.append(0)
                v[3]=(v[3]-angle)%360
        for c in v[1:]:transform(c)
    for v in tree[2:]:
        if not isinstance(v,list) or v[0] in ['version','generator','generator_version','tedit','model','embedded_fonts','attr']:continue
        if id=='MX' and child(v,'layer')==['layer','Dwgs.User']:continue
        if v[0]=='fp_text' and v[1] in ['reference','value']:
            v=['property','Reference' if v[1]=='reference' else 'Value',v[2],*v[3:]]
        if v[0]=='fp_text' and v[2]=='%R':v[2]='${REFERENCE}'
        if v[0].startswith('fp_'):
            w=child(v,'width')
            if w:v.remove(w);v.append(['stroke',w,['type','solid']])
        if id in ['XIAO_NRF52840', 'XIAO_NRF52840_PLUS'] and v[0]=='fp_arc' and child(v,'layer')==['layer','F.SilkS']:
            child(v,'layer')[1]='F.Fab' # module corner arcs overlap castellated-pad mask
        if v[0]=='pad':v[1]=str(v[1])
        transform(v);out.append(v)
    out.append(['attr','smd' if id in ['SOD123', 'XIAO_NRF52840', 'XIAO_NRF52840_PLUS'] else 'through_hole'])
    pads=[]
    for v in out:
        if v[0]!='pad':continue
        at=child(v,'at');size=child(v,'size');drill=child(v,'drill');r=math.radians(at[3])
        pads.append(dict(number=v[1],x=at[1],y=at[2],width=round(abs(size[1]*math.cos(r))+abs(size[2]*math.sin(r)),6),height=round(abs(size[1]*math.sin(r))+abs(size[2]*math.cos(r)),6),type=v[2],**({'drill':drill[1]} if drill else {})))
    snapshot=dict(id=id,authority=authority,source=url,sha256=hashlib.sha256(raw).hexdigest(),license=license,modifications=['Normalized origin and orientation; KiCad 9 syntax; deterministic instance UUIDs','Removed external 3D paths; MX fixed 1U drawing replaced by layout outline'],nodes=out,pads=pads)
    if id in ['XIAO_NRF52840', 'XIAO_NRF52840_PLUS']:snapshot['modifications'].append('Module corner arcs moved from SilkS to Fab to clear castellated pad solder mask')
    (root/(id+'.json')).write_text(json.dumps(snapshot,indent=2)+'\n')
for key,name in [('license','kicad'),('choc-license','choc'),('seeed-license','seeed'),('salicylic-license','salicylic')]:
    (root/(name+'-license.md')).write_bytes((args.source_dir / ('keyboard-'+key+'.txt')).read_bytes())

# Carrier footprint: mating header and mounting holes at the breakout's exact
# coordinates, centered on the optical/board center. Does not copy its circuit.
raw=(args.source_dir/'seiboku-board.txt').read_bytes()
board=parse(raw.decode()); nodes=[['layer','F.Cu'], ['attr','through_hole']]; pads=[]
for fp in board:
    if not isinstance(fp,list) or fp[0]!='footprint':continue
    ref=next((x[2] for x in fp if isinstance(x,list) and x[:2]==['property','Reference']), '')
    if ref not in ['J1','H1','H2','H3','H4']:continue
    origin=child(fp,'at')
    for pad in fp:
        if not isinstance(pad,list) or pad[0]!='pad':continue
        pad=[x for x in pad if not (isinstance(x,list) and x[0] in ['net','pinfunction','pintype','uuid'])]
        at=child(pad,'at');at[1]=round(at[1]+origin[1]-147.69,6);at[2]=round(at[2]+origin[2]-96.5,6)
        nodes.append(pad);size=child(pad,'size')
        pads.append(dict(number=str(pad[1]),x=at[1],y=at[2],width=size[1],height=size[2],drill=child(pad,'drill')[1],type=pad[2]))
for name,value,y in [('Reference','REF**',-12),('Value','PMW3610_SEIBOKU',12)]:
    nodes.append(['property',name,value,['at',0,y],['layer','F.SilkS' if name=='Reference' else 'F.Fab'],['effects',['font',['size',1,1],['thickness',0.15]]]])
nodes.append(['fp_rect',['start',-15,-10],['end',15,10],['stroke',['width',0.1],['type','solid']],['fill','none'],['layer','F.Fab']])
snapshot=dict(id='PMW3610_SEIBOKU',authority='Community: snize (carrier adaptation)',source=seiboku_url+'BOB-PMW3610-SEIBOKU.kicad_pcb',sha256=hashlib.sha256(raw).hexdigest(),license='seiboku-license.md',modifications=['Carrier footprint for assembled SEIBOKU: copied J1 pad geometry and H1-H4 mounting holes; centered on board/optical center; board envelope on F.Fab; no sensor circuitry copied','Use a 2x04 2.54 mm mating socket and spacers with lens facing away from the carrier; verify lens and case clearances'],nodes=nodes,pads=pads)
(root/'PMW3610_SEIBOKU.json').write_text(json.dumps(snapshot,indent=2)+'\n')
(root/'seiboku-license.md').write_bytes((args.source_dir/'seiboku-license.txt').read_bytes())
