"""Fit licensed military clothing onto the generated MakeHuman soldier rig.

Run with the project Blender portable in background mode; never opens a GUI.
"""
import bpy
import bmesh
import json
import pathlib
import re
import struct
import shutil
import math
import sys
from mathutils import Vector, Matrix

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "character-sources/makehuman"
SOURCE = OUT / "soldier-source.blend"
OLD = ROOT / "public/assets/soldier-tactical.glb"

def normalized_old():
    """Undo the source's million-unit vertex/IBM encoding without changing skinning."""
    data=OLD.read_bytes()
    json_size=struct.unpack_from('<I',data,12)[0]
    gltf=json.loads(data[20:20+json_size])
    binary=bytearray(data[28+json_size:])
    positions={p['attributes']['POSITION'] for m in gltf['meshes'] for p in m['primitives']}
    for index in positions:
        accessor=gltf['accessors'][index]; view=gltf['bufferViews'][accessor['bufferView']]
        assert accessor['componentType']==5126 and accessor['type']=='VEC3'
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0); stride=view.get('byteStride',12)
        for i in range(accessor['count']):
            point=struct.unpack_from('<3f',binary,offset+i*stride)
            struct.pack_into('<3f',binary,offset+i*stride,*(v*1e-6 for v in point))
        for key in ('min','max'):
            if key in accessor: accessor[key]=[v*1e-6 for v in accessor[key]]
    for skin in gltf['skins']:
        accessor=gltf['accessors'][skin['inverseBindMatrices']]; view=gltf['bufferViews'][accessor['bufferView']]
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0); stride=view.get('byteStride',64)
        for i in range(accessor['count']):
            matrix=list(struct.unpack_from('<16f',binary,offset+i*stride))
            if max(abs(matrix[k]) for k in (0,1,2,4,5,6,8,9,10)) < .001:
                for k in (0,1,2,4,5,6,8,9,10): matrix[k]*=1e6
            struct.pack_into('<16f',binary,offset+i*stride,*matrix)
    text=json.dumps(gltf,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
    binary+=b'\0'*((-len(binary))%4)
    target=OUT/'military-normalized-source.glb'
    target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary)
    return target

def canonical(name):
    return re.sub(r"_\d+$", "", name.replace(":", ""))

def load_sources():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE' and o.name.startswith('MakeHuman_soldier'))
    human=bpy.data.objects['MakeHuman_soldier_body']
    previous=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(normalized_old()))
    imported=set(bpy.data.objects)-previous
    old_rig=next(o for o in imported if o.type=='ARMATURE')
    return rig,human,old_rig,imported

def inspect():
    rig,human,old_rig,imported=load_sources()
    result={"objects":[],"rigs":[]}
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            result["objects"].append({"name":obj.name,"old":obj in imported,"vertices":len(obj.data.vertices),"materials":[m.name if m else None for m in obj.data.materials],"bounds":[list(obj.matrix_world@Vector(v)) for v in obj.bound_box],"groups":[g.name for g in obj.vertex_groups]})
        if obj.type == "ARMATURE":
            result["rigs"].append({"name":obj.name,"old":obj in imported,"matrix":[list(r) for r in obj.matrix_world],"bones":[{"name":b.name,"head":list(obj.matrix_world@b.head_local),"tail":list(obj.matrix_world@b.tail_local),"parent":b.parent.name if b.parent else None} for b in obj.data.bones]})
    (OUT/"military-fit-inspect.json").write_text(json.dumps(result,indent=2),encoding="utf8")
    print("MILITARY_FIT_INSPECT",str(OUT/"military-fit-inspect.json"))

def fit():
    rig,human,old_rig,imported=load_sources()
    old_rig.data.pose_position='REST'
    bpy.context.view_layer.update()
    new_bones={canonical(b.name):b for b in rig.data.bones}
    old_bones={canonical(b.name):b for b in old_rig.data.bones}
    semantic_children={'Hips':'Spine','Spine':'Spine1','Spine1':'Spine2','Spine2':'Neck','Neck':'Head'}
    for side in ('Left','Right'):
        for a,b in [('Shoulder','Arm'),('Arm','ForeArm'),('ForeArm','Hand'),('Hand','HandMiddle1'),('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase')]:
            semantic_children[side+a]=side+b
    bindings={}
    boot_bindings={}
    base_rotation=Matrix.Rotation(math.pi/2,4,'X')
    for side in ('Left','Right'):
        old_foot=old_bones['mixamorig'+side+'Foot'];old_toe=old_bones['mixamorig'+side+'ToeBase']
        new_foot=new_bones['mixamorig'+side+'Foot'];new_toe=new_bones['mixamorig'+side+'ToeBase']
        old_head=old_rig.matrix_world@old_foot.head_local;new_head=rig.matrix_world@new_foot.head_local
        old_direction=(old_rig.matrix_world@old_toe.head_local)-old_head
        new_direction=(rig.matrix_world@new_toe.head_local)-new_head
        rotation=(base_rotation.to_3x3()@old_direction).rotation_difference(new_direction).to_matrix().to_4x4()@base_rotation
        size=max(.82,min(1.1,new_direction.length/old_direction.length))
        sole_level=Matrix.Translation(new_head)@Matrix.Rotation(.18,4,'X')@Matrix.Translation(-new_head)
        boot_bindings[side]=(new_foot.name,sole_level@Matrix.Translation(new_head)@rotation@Matrix.Scale(size,4)@Matrix.Translation(-old_head))
    for bone in old_rig.data.bones:
        source=bone
        while source and canonical(source.name) not in new_bones: source=source.parent
        if source is None: continue
        key=canonical(source.name);target=new_bones[key]
        child_name='mixamorig'+semantic_children.get(key.removeprefix('mixamorig'),'')
        old_length=(old_bones[child_name].head_local-source.head_local).length if child_name in old_bones else source.length
        new_length=(new_bones[child_name].head_local-target.head_local).length if child_name in new_bones else target.length
        ratio=max(.72,min(1.25,new_length/max(old_length,.001)))
        # Bone roll is preserved by each rest matrix; longitudinal differences
        # follow the new anatomical segment while clothing retains thickness.
        scale=Matrix.Diagonal((.97,ratio,.97,1))
        transform=rig.matrix_world@target.matrix_local@scale@(old_rig.matrix_world@source.matrix_local).inverted()
        bindings[bone.name]=(target.name,transform)
    kept=[];removed=[];counts=[]
    for obj in sorted(imported,key=lambda o:o.name):
        if obj.type!='MESH' or not obj.vertex_groups: continue
        material_names=' '.join(m.name for m in obj.data.materials if m)
        # Object_121 is a separate pouch with malformed source binding; it is
        # omitted rather than allowing that accessory to distort actor bounds.
        if any(word in material_names for word in ('Head','GreenCap')) or obj.name in {'Object_115','Object_121'}:
            removed.append(obj.name);continue
        evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
        groups={g.index:g.name for g in obj.vertex_groups}
        weights=[];points=[]
        for vertex in mesh.vertices:
            world=obj.matrix_world@vertex.co
            if obj.name=='Object_123':
                # A leather boot moves with its ankle as one piece. The old
                # toe helper rolls are incompatible with the new anatomical rig.
                side='Left' if world.x>=0 else 'Right'
                name,transform=boot_bindings[side]
                points.append(transform@world);weights.append({name:1});continue
            valid=[(g.weight,bindings[groups[g.group]]) for g in vertex.groups if groups.get(g.group) in bindings and g.weight>0]
            total=sum(w for w,_ in valid)
            if total<1e-8: raise RuntimeError('Unbound garment vertex: '+obj.name)
            point=Vector((0,0,0));target_weights={}
            for weight,(name,transform) in valid:
                w=weight/total;point+=(transform@world)*w;target_weights[name]=target_weights.get(name,0)+w
            if obj.name=='Object_113':
                # Keep the cloth continuous through knee flexion instead of
                # retaining the old rig's abrupt calf-helper weight boundary.
                side='Left' if point.x>=0 else 'Right'
                knee=new_bones['mixamorig'+side+'Leg'].head_local.z
                if abs(point.z-knee)<.16:
                    t=max(0,min(1,(point.z-knee+.16)/.32));t=t*t*(3-2*t)
                    target_weights={new_bones['mixamorig'+side+'UpLeg'].name:t,new_bones['mixamorig'+side+'Leg'].name:1-t}
            points.append(point);weights.append(target_weights)
        if any(abs(v.x)>2 or abs(v.y)>2 or v.z < -.2 or v.z > 2.2 for v in points):
            raise RuntimeError('Fitted clothing outside human-scale bounds: '+obj.name)
        fitted=bpy.data.objects.new('MakeHuman_soldier_military_'+obj.name,mesh)
        bpy.context.collection.objects.link(fitted)
        for vertex,point in zip(mesh.vertices,points):vertex.co=point
        # Evaluated meshes carry the source's numeric deform-group indices.
        # Clear them before creating target groups, whose order is different.
        clean=bmesh.new();clean.from_mesh(mesh)
        layer=clean.verts.layers.deform.active
        if layer:
            for vertex in clean.verts:vertex[layer].clear()
        clean.to_mesh(mesh);clean.free()
        for name in sorted({n for row in weights for n in row}):fitted.vertex_groups.new(name=name)
        for i,row in enumerate(weights):
            for name,weight in row.items():fitted.vertex_groups[name].add([i],weight,'REPLACE')
        fitted.parent=rig;fitted.matrix_parent_inverse=rig.matrix_world.inverted()
        modifier=fitted.modifiers.new('Armature','ARMATURE');modifier.object=rig
        for polygon in mesh.polygons:polygon.use_smooth=True
        for mat in mesh.materials:
            if mat and mat.use_nodes:
                bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if bsdf:bsdf.inputs['Roughness'].default_value=.88;bsdf.inputs['Metallic'].default_value=.02
        kept.append(fitted);counts.append({'name':fitted.name,'vertices':len(mesh.vertices),'polygons':len(mesh.polygons)})
    for obj in imported:
        if obj.name in bpy.data.objects:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'soldier-fitted-source.blend'))
    # The editable source above keeps the full new human. Runtime export removes
    # hidden skin and MakeHuman helper meshes beneath the fitted uniform.
    bpy.ops.object.select_all(action='DESELECT')
    human.select_set(True);bpy.context.view_layer.objects.active=human
    if human.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
    for modifier in list(human.modifiers):
        if modifier.type in {'MASK','SUBSURF'}:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    body_groups={g.index:g.name for g in human.vertex_groups}
    bm=bmesh.new();bm.from_mesh(human.data);bm.verts.ensure_lookup_table()
    drop=[]
    for v in human.data.vertices:
        visible=sum(g.weight for g in v.groups if any(part in body_groups.get(g.group,'') for part in ('Head','Neck','Hand')))
        if visible<.45:drop.append(bm.verts[v.index])
    bmesh.ops.delete(bm,geom=drop,context='VERTS');bm.to_mesh(human.data);bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in bpy.data.objects:
        if obj.parent==rig and obj.type=='MESH':obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    # The separate runtime preparation step compresses this file and publishes
    # it. Do not overwrite a runtime GLB already being reviewed by another task.
    output=OUT/'soldier-generated.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=False,export_apply=False,export_extras=True)
    if '--publish' in sys.argv:shutil.copy2(output,ROOT/'public/assets/makehuman-soldier.glb')
    (OUT/'military-fit-report.json').write_text(json.dumps({'source':str(SOURCE),'clothing':str(OLD),'output':str(output),'kept':counts,'removed':removed,'mapping':'weighted rest-pose affine transforms into the new MakeHuman Mixamo skeleton','fullHumanPreservedInSource':True},indent=2),encoding='utf8')
    print('MILITARY_FIT_READY',str(output))

if __name__ == "__main__":
    inspect() if '--inspect' in sys.argv else fit()
