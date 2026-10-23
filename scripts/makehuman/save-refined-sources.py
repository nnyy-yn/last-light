"""Save the refined, skinned runtime meshes as editable Blender documents.

The original complete MakeHuman bodies and fitted clothing sources remain in
the parent directory. These documents mirror the shipped, masked runtime mesh.
Run only with Blender -b; no window is created.
"""
import bpy,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'character-sources/makehuman/v0.5'
report=[]
for kind in ['soldier','civilian','combatant']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/f'{kind}-refined.glb'))
    bpy.ops.file.pack_all()
    target=OUT/f'{kind}-refined-source.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    report.append({'kind':kind,'editableSource':str(target.relative_to(ROOT)),
                   'vertices':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),
                   'bones':[{ 'name':o.name,'count':len(o.data.bones)} for o in bpy.data.objects if o.type=='ARMATURE']})
(OUT/'editable-sources.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('REFINED_SOURCES',json.dumps(report))
