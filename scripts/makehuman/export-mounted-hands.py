"""Restore complete MakeHuman palms/wrists from the preserved fitted source.

Run with project Blender -b. Export geometry/rig only; the mounted player reuses
the soldier's existing skin maps and binds vertices to the existing skeleton.
"""
import bpy,bmesh,json,pathlib,hashlib
from mathutils import Vector

ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT/'character-sources/makehuman/soldier-fitted-source.blend'
OUT=ROOT/'public/assets/mounted-makehuman-hands.glb'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
body=bpy.data.objects['MakeHuman_soldier_body']
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
if body.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
for modifier in list(body.modifiers):
    if modifier.type=='MASK' and modifier.name=='Hide helpers':bpy.ops.object.modifier_apply(modifier=modifier.name)
    elif modifier.type=='MASK':body.modifiers.remove(modifier)

# Crop by anatomical position, not skin weights. The previous runtime export's
# Hand-only threshold removed palm vertices influenced by forearm/twist bones.
regions=[]
for side in ('Left','Right'):
    lower=rig.data.bones['mixamorig:'+side+'ForeArm']
    elbow=lower.head_local.copy();wrist=lower.tail_local.copy();axis=(wrist-elbow).normalized()
    regions.append((elbow,wrist,axis,(wrist-elbow).length*.18))
to_rig=rig.matrix_world.inverted()@body.matrix_world
def keep(co):
    p=to_rig@co
    return any((p-elbow).dot(axis)>=cut and (p-wrist).length<.34 for elbow,wrist,axis,cut in regions)
bm=bmesh.new();bm.from_mesh(body.data);drop=[v for v in bm.verts if not keep(v.co)]
bmesh.ops.delete(bm,geom=drop,context='VERTS')
# All remaining open edges must lie at the two cropped forearm ends. Palm,
# finger-root and fingertip boundaries are an export failure, not a runtime fix.
bad=[]
for edge in bm.edges:
    if not edge.is_boundary:continue
    p=to_rig@((edge.verts[0].co+edge.verts[1].co)*.5)
    if not any((p-wrist).dot(axis)<-.09 for elbow,wrist,axis,cut in regions):bad.append(tuple(p))
if bad:raise RuntimeError('Unexpected hand boundary edges: '+str(len(bad)))
bm.to_mesh(body.data);bm.free()
for face in body.data.polygons:face.use_smooth=True
body.name='MakeHuman_Mounted_Complete_Hands'
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_animations=False,export_apply=False,export_extras=True,export_materials='NONE')
report={'source':str(SOURCE.relative_to(ROOT)),'output':str(OUT.relative_to(ROOT)),'vertices':len(body.data.vertices),'polygons':len(body.data.polygons),'openPalmEdges':len(bad),'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'license':'MakeHuman Community CC0; original stored MakeHuman soldier source; no copied film/game asset','materials':'Runtime reuses the original soldier skin material/UVs; GLB contains no texture images.'}
target=ROOT/'artifacts/district-rebuild/mounted-hand-source.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,indent=2),encoding='utf8')
print('MOUNTED_HAND_EXPORT',json.dumps(report))
