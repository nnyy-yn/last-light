import bpy,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'weapon-sources/v0.6'
def canonical(p):return [p.x,p.z,-p.y]
result={}
for id in ['akm','m249']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(OUT/f'baseline/{id}-real.glb'))
 records=[]
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH':continue
  mesh=obj.data;neighbors=[[] for v in mesh.vertices]
  for e in mesh.edges:
   a,b=e.vertices;neighbors[a].append(b);neighbors[b].append(a)
  seen=set();parts=[]
  for i in range(len(neighbors)):
   if i in seen:continue
   stack=[i];group=[]
   while stack:
    a=stack.pop()
    if a in seen:continue
    seen.add(a);group.append(a);stack.extend(b for b in neighbors[a] if b not in seen)
   coords=[canonical(obj.matrix_world@mesh.vertices[v].co) for v in group]
   faces=[p for p in mesh.polygons if p.vertices[0] in group]
   parts.append({'id':len(parts),'verts':len(group),'faces':len(faces),'min':[min(p[k] for p in coords) for k in range(3)],'max':[max(p[k] for p in coords) for k in range(3)],'materials':list(set(mesh.materials[p.material_index].name for p in faces))})
  records.append({'name':obj.name,'parent':obj.parent.name if obj.parent else None,'matrix':[list(row) for row in obj.matrix_world],'verts':len(mesh.vertices),'faces':len(mesh.polygons),'materials':[m.name for m in mesh.materials],'components':parts})
 result[id]=records
(OUT/'geometry-inspection.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('INSPECTED '+json.dumps({id:[(o['name'],o['verts'],len(o['components'])) for o in records] for id,records in result.items()}))
