"""Reproducible Blender art pass; source geometry/UVs remain attributed to skaf13.

The added pouch, decorative feed silhouette, stitching and bore are game art,
not mechanical/functional components. Canonical runtime coordinates are Y-up/-Z.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'weapon-sources' / 'v0.5'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'weapon-sources/v0.4/m249-real.glb'))

def xyz(p): return (p[0], -p[2], p[1])
def canonical(p): return Vector((p.x, p.z, -p.y))
def material(name, color, metal, rough):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

canvas=material('v05 weathered woven olive canvas',(.15,.17,.105),0,.88)
webbing=material('v05 dark olive reinforcement webbing',(.022,.028,.014),0,.86)
steel=material('v05 blackened steel links and bore',(.027,.030,.027),.78,.39)
cavity=material('v05 soot-dark recessed bore',(.0025,.0028,.0025),.12,.94)
brass=material('v05 subdued brass decorative belt',(.22,.145,.048),.85,.32)
copper=material('v05 oxidised copper decorative tips',(.25,.105,.047),.76,.41)
thread=webbing

# Woven fabric is UV mapped and baked to images, not a runtime shader.
N=1024
y,x=np.mgrid[0:N,0:N].astype(np.float32)
rng=np.random.default_rng(24905)
weave=(np.sin(x*math.pi/2)*np.sin(y*math.pi/2))
variation=(np.sin(x*.041)*np.sin(y*.033)+np.sin(x*.009+y*.013))*.006
noise=rng.random((N,N),dtype=np.float32)*.008-.004
base=np.empty((N,N,4),dtype=np.float32)
for k,v in enumerate((.20,.22,.14)):base[:,:,k]=v+weave*.006+variation+noise
base[:,:,3]=1
normal=np.empty_like(base)
normal[:,:,0]=.5+np.cos(x*math.pi/2)*np.sin(y*math.pi/2)*.10
normal[:,:,1]=.5+np.sin(x*math.pi/2)*np.cos(y*math.pi/2)*.10
normal[:,:,2]=.985;normal[:,:,3]=1
nodes=canvas.node_tree.nodes;links=canvas.node_tree.links;p=nodes.get('Principled BSDF')
for name,pixels,space in [('canvas-basecolor',base,'sRGB'),('canvas-normal',normal,'Non-Color')]:
    image=bpy.data.images.new('v05-'+name,width=N,height=N,alpha=True)
    image.colorspace_settings.name=space;image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save();image.pack()
    tex=nodes.new('ShaderNodeTexImage');tex.image=image
    if name.endswith('basecolor'):links.new(tex.outputs['Color'],p.inputs['Base Color'])
    else:
        n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.48
        links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],p.inputs['Normal'])

# Keep original normals and UVs. Assign polymer only where the source atlas covers
# the grip and butt pad; the original metallic map continues to describe the steel.
removed=material('v05 REMOVE original flat bore cap',(0,0,0),0,1)
removed.surface_render_method='DITHERED'
removed.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=0
cap_faces=0;polymer_faces=0
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    body=next((m for m in obj.data.materials if m and m.name.startswith('M249.001')),None)
    if not body:continue
    body.name='v05 M249 original steel atlas'
    bsdf=body.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value=.88
    polymer=body.copy();polymer.name='v05 M249 polymer grip and pad'
    poly=polymer.node_tree.nodes.get('Principled BSDF')
    for link in list(poly.inputs['Metallic'].links):polymer.node_tree.links.remove(link)
    poly.inputs['Metallic'].default_value=0
    obj.data.materials.append(polymer);poly_index=len(obj.data.materials)-1
    obj.data.materials.append(removed);remove_index=len(obj.data.materials)-1
    for face in obj.data.polygons:
        pts=[canonical(obj.matrix_world@obj.data.vertices[v].co) for v in face.vertices]
        center=sum(pts,Vector())/len(pts)
        if all(p.z<-.7279 and math.hypot(p.x,p.y-.0903761)<.0093 for p in pts):
            face.material_index=remove_index;cap_faces+=1
        elif ((-.032<center.z<.047 and center.y<-.025) or center.z>.294):
            face.material_index=poly_index;polymer_faces+=1

def assign(obj,mat):
    obj.data.materials.clear();obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def rounded(name,center,scale,bevel,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(center))
    obj=bpy.context.object;obj.name=name;obj.dimensions=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=obj.modifiers.new('Small tailored edge radius','BEVEL');m.width=bevel;m.segments=3
    bpy.ops.object.modifier_apply(modifier=m.name)
    assign(obj,mat)
    n=obj.modifiers.new('Face-area weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=35
    bpy.ops.object.modifier_apply(modifier=n.name)
    return obj

def tube(name,points,radius,mat,resolution=2):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=8
    curve.bevel_depth=radius;curve.bevel_resolution=resolution
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for bp,p in zip(spline.bezier_points,points):bp.co=xyz(p);bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');return obj

# The flexible container sits under the receiver; its footprint does not alter
# either hand contact or any weapon socket. Bulged sides avoid a primitive cube.
pouch=rounded('M249 tailored fabric ammunition pouch',(0,-.082,-.145),(.148,.157,.154),.014,canvas)
sub=pouch.modifiers.new('Cloth surface shaping','SUBSURF');sub.levels=2;sub.render_levels=2
bpy.context.view_layer.objects.active=pouch;bpy.ops.object.modifier_apply(modifier=sub.name)
for v in pouch.data.vertices:
    # Local coordinates: x lateral, y longitudinal, z vertical in Blender.
    t=max(0,min(1,(v.co.z+.0785)/.157))
    v.co.x*=1+.055*math.sin(t*math.pi)
    v.co.y*=1+.045*math.sin(t*math.pi)
    v.co.x+=.0015*math.sin(v.co.y*110+v.co.z*75)*math.sin(t*math.pi)
    v.co.z+=.0012*math.sin(v.co.x*95+v.co.y*60)*(1-t)
bpy.context.view_layer.objects.active=pouch
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
rounded('Pouch upper reinforced collar',(0,-.012,-.145),(.148,.018,.148),.006,webbing)
rounded('Pouch side reinforcement left',(-.080,-.083,-.145),(.004,.12,.025),.002,webbing)
rounded('Pouch side reinforcement right',(.080,-.083,-.145),(.004,.12,.025),.002,webbing)
for side in [-1,1]:
    sx=side*.081
    tube('Curved cloth seam',[(sx,-.025,-.204),(side*.081,-.09,-.208),(side*.066,-.147,-.204),(side*.062,-.155,-.09)],.0008,thread,1)
    for z in [-.203,-.09]:
        for j in range(11):
            yy=-.037-j*.009
            tube('Short seam stitch',[(sx,yy,z),(sx,yy-.004,z)],.00035,thread,0)
rounded('Pouch worn rectangular cloth patch',(.083,-.079,-.18),(.0025,.039,.045),.003,canvas)

# Short non-functional feed silhouette, made as separate authored art meshes.
def lathe(name,center,profile,mat,segments=16):
    verts=[];faces=[]
    for zz,rr in profile:
        for i in range(segments):
            a=i/segments*math.tau;verts.append(xyz((center[0]+rr*math.cos(a),center[1]+rr*math.sin(a),center[2]+zz)))
    for ring in range(len(profile)-1):
        for i in range(segments):
            a=ring*segments+i;b=ring*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);assign(obj,mat);return obj
previous=None
for i in range(8):
    t=i/7;center=(-.078-.025*math.sin(math.pi*t)+.027*t**3,-.013+.086*t,-.115)
    lathe('Decorative belt brass body',center,[(.022,0),(.022,.0042),(.019,.0042),(.018,.00365),(-.009,.00365),(-.014,.00265)],brass)
    lathe('Decorative belt subdued tip',center,[(-.014,.00265),(-.020,.0024),(-.028,.0004),(-.028,0)],copper)
    tube('Blackened belt link',[(center[0]-.003,center[1]-.003,center[2]+.01),(center[0]-.005,center[1],center[2]-.007),(center[0]+.004,center[1]+.004,center[2]-.007)],.001,steel,1)
    if previous:
        tube('Continuous decorative belt connector',[(previous[0]-.003,previous[1]+.003,previous[2]+.010),((previous[0]+center[0])/2-.005,(previous[1]+center[1])/2,center[2]+.010),(center[0]-.003,center[1]-.003,center[2]+.010)],.0015,steel,1)
    previous=center

# Open bore with a continuous chamfered lip and recessed dark interior. The
# original mouth is already open; this adds continuous depth and a rounded lip.
lathe('M249 chamfered muzzle lip',(0,.0903761,0),[(-.72840,.01308),(-.7290,.01255),(-.7290,.00925),(-.7284,.00885)],steel,48)
lathe('M249 deep bore cavity',(0,.0903761,0),[(-.7284,.00885),(-.706,.0075),(-.706,0)],cavity,48)

# Keep moving art assemblies separate; join within each assembly by material.
# The feeding-cover geometry is part of the original receiver, so it is not
# presented as a separable cover without sufficient interior geometry.
groups={'Body':[],'AmmoContainer':[],'FeedBelt':[]}
for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
    key='AmmoContainer' if o.name.startswith(('M249 tailored','Pouch','Curved cloth','Short seam')) else 'FeedBelt' if o.name.startswith(('Decorative belt','Blackened belt','Continuous decorative')) else 'Body'
    groups[key].append(o)
joined=[]
for key,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    obj=bpy.context.object;obj.name=key;joined.append(obj)
obj=joined[0]
obj['source_author']='AK / skaf13'
obj['source_license']='CC BY 4.0'
obj['source_url']='https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244'
obj['project_changes']='Canvas pouch, stitching, short decorative belt, polymer material separation, open chamfered bore. No functional mechanism.'
for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'m249-detail-source.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'m249-detail-export.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
report={'capFacesExcluded':cap_faces,'polymerFaces':polymer_faces,'vertices':sum(len(o.data.vertices) for o in joined),'polygons':sum(len(o.data.polygons) for o in joined),'assemblies':{o.name:[m.name for m in o.data.materials] for o in joined},'source':'weapon-sources/v0.4/m249-real.glb'}
(OUT/'dcc-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('WEAPON_DETAIL_DONE '+json.dumps(report))
