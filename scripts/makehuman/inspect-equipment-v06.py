from pathlib import Path
import bpy,json
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'character-sources/makehuman/v0.5/soldier-refined-source.blend'))
rows=[]
for o in bpy.data.objects:
 if o.type=='MESH':
  coords=[o.matrix_world@v.co for v in o.data.vertices]
  rows.append({'name':o.name,'verts':len(coords),'polys':len(o.data.polygons),'materials':[m.name for m in o.data.materials], 'bounds':[[min(v[i] for v in coords),max(v[i] for v in coords)]for i in range(3)],'mods':[(m.name,m.type)for m in o.modifiers]})
print('MESH_AUDIT',json.dumps(rows))
(ROOT/'character-sources/makehuman/v0.6/baseline-meshes.json').write_text(json.dumps(rows,indent=2))
