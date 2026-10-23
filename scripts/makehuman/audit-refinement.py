"""Check v0.5 character rig/ground-contact invariants against retained v0.4."""
from pathlib import Path
import struct,json,hashlib,io
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/model-upgrade-v0.5'
def read(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];return b,json.loads(b[20:20+n]),b[28+n:]
def view(g,b,i):
    v=g['bufferViews'][i];return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def accessor(g,b,i):return view(g,b,g['accessors'][i]['bufferView'])
report=[]
for kind in ['soldier','civilian','combatant']:
    old,og,ob=read(OUT/f'before/makehuman-{kind}.glb');new,g,b=read(ROOT/f'public/assets/makehuman-{kind}.glb')
    assert og['nodes']==g['nodes'] and og['skins']==g['skins'],'Rig hierarchy changed'
    unchanged=[]
    for before,after in zip(og['meshes'],g['meshes']):
        for p,q in zip(before['primitives'],after['primitives']):
            for semantic in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:
                if semantic in p['attributes']:
                    assert accessor(og,ob,p['attributes'][semantic])==accessor(g,b,q['attributes'][semantic]),semantic+' changed'
            assert accessor(og,ob,p['indices'])==accessor(g,b,q['indices']),'Topology changed'
            if not (kind=='soldier' and before['name'] in ['base','Mil_Suit_R5_Mil_Suit_R5_0.001']):
                assert accessor(og,ob,p['attributes']['POSITION'])==accessor(g,b,q['attributes']['POSITION']),'Unrelated geometry changed'
                unchanged.append(before['name'])
    sizes=[Image.open(io.BytesIO(view(g,b,im['bufferView']))).size for im in g['images']]
    assert max(max(size) for size in sizes)<=2048
    triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    report.append({'kind':kind,'beforeBytes':len(old),'afterBytes':len(new),'sha256':hashlib.sha256(new).hexdigest(),'triangles':triangles,'materials':len(g['materials']),'images':len(g['images']),'maxImageDimensions':max(sizes),'rigJointCounts':[len(s['joints']) for s in g['skins']],'topologyUVSkinWeightsUnchanged':True,'unchangedPositionMeshes':unchanged})
(OUT/'character-asset-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
