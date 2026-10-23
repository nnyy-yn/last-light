"""Original PASGT-style equipment and local garment refinement; Blender -b only.

Metres. Authoring uses Blender Z-up and converts the established actor Y-up frame.
The helmet is an independent rigid accessory attached to the existing Head bone.
No skeleton, finger, foot, or animation data is edited.
"""
import bpy,bmesh,math,json,random
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'character-sources/makehuman/v0.6'
OUT.mkdir(parents=True,exist_ok=True)
PI=math.pi

def world(p):
    return Vector((p[0],-p[2],p[1]))

def material(name,color,rough=.85,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m

def save_texture(name,pixels,noncolor=False):
    h,w=pixels.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
    rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:pixels.shape[2]]=pixels
    im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im

def textures():
    n=1024;y,x=np.mgrid[0:n,0:n].astype(np.float32);u=x/n;v=y/n
    # Original, restrained field-cover pattern; no downloaded photograph.
    field=(np.sin(u*PI*8+1.4*np.sin(v*PI*5))+.65*np.sin(v*PI*7+.8*np.cos(u*PI*6))+.32*np.cos(u*PI*18-v*PI*10))
    colors=np.array([[.24,.285,.175],[.32,.345,.225],[.17,.215,.120]],dtype=np.float32)
    light=np.clip((field-.62)/.10,0,1)[:,:,None];dark=np.clip((-.67-field)/.10,0,1)[:,:,None]
    base=colors[0]*(1-light-dark)+colors[1]*light+colors[2]*dark
    weave=.010*np.sin(x*PI/2)*np.sin(y*PI/2)+.004*np.sin(x*.41+y*.17)
    base=np.clip(base+weave[:,:,None],0,1)
    bc=save_texture('pasgt-cover-basecolor-1k',base)
    n=512;y,x=np.mgrid[0:n,0:n].astype(np.float32)
    nx=.095*np.cos(x*PI/2)*np.sin(y*PI/2);ny=.095*np.sin(x*PI/2)*np.cos(y*PI/2)
    normal=np.stack([nx,ny,np.ones_like(nx)],-1);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    nm=save_texture('pasgt-cover-normal-512',normal*.5+.5,True)
    orm=np.stack([np.ones_like(x),.88+.025*np.sin(x*.2)*np.sin(y*.12),np.zeros_like(x)],-1)
    mr=save_texture('pasgt-cover-orm-512',orm,True)
    return bc,nm,mr

def add_mesh(name,verts,faces,mat,uv=None,smooth=True):
    me=bpy.data.meshes.new(name);me.from_pydata([world(v) for v in verts],[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat)
    for p in me.polygons:p.use_smooth=smooth
    if uv:
        layer=me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
    return ob

def polyline(name,points,radius,mat):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=radius;cu.bevel_resolution=1
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*world(co),1)
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False);return ob

def surface(a,t,offset=0):
    c=math.cos(a);s=math.sin(a)
    f=max(0,min(1,(c-.18)/.56));front=f*f*(3-2*f)
    ear=max(0,1-c*c)**2
    edge=1.628+.065*front+.006*max(0,-c)**2
    theta=math.acos((edge-1.674)/.124)*t
    # Forehead visor projects independently of the crown; lower side walls
    # flare over the ears, instead of ending as an ellipsoid cut.
    rx=.108+.008*ear*t**5+.005*t**11
    rz=.134+.015*front*t**7+.003*t**10
    x=(rx+offset)*math.sin(theta)*s
    z=.038+(rz+offset)*math.sin(theta)*c+.010*front*t**12
    y=1.674+(.124+offset)*math.cos(theta)
    wrinkle=(.00048*math.sin(a*13+t*18)+.00028*math.sin(a*27-t*9))*t**3
    return (x+wrinkle*s,y+wrinkle*.3,z+wrinkle*c)

def ribbon(name,points,width,thickness,mat,normals=None):
    vs=[];uv=[];faces=[]
    for i,p in enumerate(points):
        p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)]);t.normalize()
        normal=Vector(normals[i] if normals else (p.x,0,p.z-.038)).normalized()
        across=t.cross(normal).normalized();normal=across.cross(t).normalized()
        for side,depth in [(-1,1),(1,1),(-1,-1),(1,-1)]:
            vs.append(tuple(p+across*(side*width/2)+normal*(depth*thickness/2)));uv.append(((side+1)/2,i/max(1,len(points)-1)))
        if i:
            a=(i-1)*4;b=i*4
            faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
    faces.extend([(0,1,3,2),(len(vs)-4,len(vs)-2,len(vs)-1,len(vs)-3)])
    return add_mesh(name,vs,faces,mat,uv)

def interpolate(points,sub=6):
    out=[];pts=[Vector(p) for p in points]
    for i in range(len(pts)-1):
        p0=pts[max(0,i-1)];p1=pts[i];p2=pts[i+1];p3=pts[min(len(pts)-1,i+2)]
        for j in range(sub):
            t=j/sub
            out.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
    out.append(tuple(pts[-1]));return out

def helmet():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cover=material('PASGT woven cover',(.40,.43,.30),.9)
    bc,nm,mr=textures();nodes=cover.node_tree.nodes;links=cover.node_tree.links;bs=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.image=bc;links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=nm;normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.32;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=mr;sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness'])
    rubber=material('PASGT rubber edge and inner shell',(.035,.048,.026),.88)
    webbing=material('PASGT olive flat nylon webbing',(.095,.120,.060),.95)
    stitch=material('PASGT cover seam thread',(.16,.19,.10),.96)
    steel=material('PASGT blackened steel fasteners',(.045,.052,.038),.44,.65)
    rows=24;seg=80;verts=[];uv=[];faces=[]
    for r in range(rows+1):
        for c in range(seg+1):verts.append(surface(c/seg*PI*2,max(.0001,r/rows),.0015));uv.append((c/seg,r/rows))
    for r in range(rows):
        for c in range(seg):
            a=r*(seg+1)+c;b=a+seg+1;faces.append((a,b,b+1,a+1))
    coverob=add_mesh('PASGT shaped cloth-covered shell',verts,faces,cover,uv)
    solid=coverob.modifiers.new('Eight millimetre composite shell','SOLIDIFY');solid.thickness=.007;solid.offset=-1
    coverob.data.materials.append(rubber);solid.material_offset=1;solid.material_offset_rim=1
    bpy.context.view_layer.objects.active=coverob;coverob.select_set(True);bpy.ops.object.modifier_apply(modifier=solid.name);coverob.select_set(False)
    bm=bmesh.new();bm.from_mesh(coverob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.normal_update();bm.to_mesh(coverob.data);bm.free()
    rim=[surface(i/160*2*PI,1,.0015) for i in range(161)]
    polyline('PASGT moulded rubber rim',rim,.0032,rubber)
    # Tailored crown panels; seams are narrow cloth stitches, not thick ropes.
    for a in [-.68,.68]:
        seam=[surface(a,1-i/42,.0022) for i in range(43)]+[surface(PI-a,i/42,.0022) for i in range(1,43)]
        polyline('PASGT cover panel seam',seam,.00048,stitch)
    bandpoints=[surface(i/160*PI*2,.87,.0032) for i in range(161)]
    ribbon('PASGT elastic helmet band',bandpoints,.012,.0012,webbing)
    for side in [-1,1]:
        points=interpolate([(side*.111,1.642,.037),(side*.101,1.601,.067),(side*.075,1.559,.104),(side*.040,1.531,.130),(0,1.523,.136)],7)
        normals=[]
        for i in range(len(points)):
            t=i/(len(points)-1);normals.append((side*(1-t*.7),-t*.85,.18))
        ribbon('PASGT two-point flat chin webbing',points,.018,.0016,webbing,normals)
        # Stitched edge lines sit on the strap's external face.
        for offset in [-.006,.006]:
            seam=[]
            for i,p in enumerate(points):
                v=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)]);t.normalize();n=Vector(normals[i]).normalized();ac=t.cross(n).normalized();v+=ac*offset+n*.001
                seam.append(tuple(v))
            polyline('PASGT chinstrap edge stitching',seam,.00023,stitch)
        center=Vector((side*.082,1.570,.098));tangent=Vector((-side*.40,-.77,.40)).normalized();normal=Vector((side,.02,.12)).normalized();across=tangent.cross(normal).normalized()
        # Open adjustment loop and a central bar, with rounded 1.2mm edges.
        for aw,bw in [(-.012,-.012),(.012,.012)]:
            p=[tuple(center+across*aw+tangent*y) for y in [-.016,.016]];polyline('PASGT buckle side bar',p,.00145,steel)
        for y in [-.016,0,.016]:
            p=[tuple(center+tangent*y+across*x) for x in [-.012,.012]];polyline('PASGT buckle cross bar',p,.00145,steel)
        # Shell retention screw / strap attachment, with its actual recess.
        c=Vector((side*.115,1.656,.034));ring=[tuple(c+Vector((0,math.sin(i/24*PI*2)*.0045,math.cos(i/24*PI*2)*.0045))) for i in range(25)]
        polyline('PASGT retention washer',ring,.0011,steel)
        polyline('PASGT slotted retention screw',[tuple(c+Vector((side*.001,-.0025,0))),tuple(c+Vector((side*.001,.0025,0)))],.0009,steel)
    # Join per material: the detailed accessory adds five render groups, not
    # one draw call per stitch or buckle bar.
    for m in [cover,rubber,webbing,stitch,steel]:
        targets=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==m]
        if len(targets)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in targets:o.select_set(True)
            bpy.context.view_layer.objects.active=targets[0];bpy.ops.object.join();targets[0].name=m.name
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pasgt-field-helmet-source.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'pasgt-field-helmet.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=True)
    return {'objects':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')}

def clothing():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'character-sources/makehuman/v0.5/soldier-refined-source.blend'))
    changes=[]
    for name in ['MakeHuman_soldier_military_Object_105','MakeHuman_soldier_military_Object_107','MakeHuman_soldier_military_Object_103']:
        ob=bpy.data.objects.get(name)
        if not ob:continue
        before=len(ob.data.vertices);bm=bmesh.new();bm.from_mesh(ob.data)
        # Weld UV seam duplicates geometrically. UVs remain per face-corner.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000012)
        bm.normal_update()
        if name.endswith('107'):
            selected=[v for v in bm.verts if (ob.matrix_world@v.co).z>1.43 and abs((ob.matrix_world@v.co).x)<.22]
            ss=set(selected);edges=[e for e in bm.edges if all(v in ss for v in e.verts)]
            result=bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
            selected=[v for v in bm.verts if (ob.matrix_world@v.co).z>1.435 and abs((ob.matrix_world@v.co).x)<.21]
            for _ in range(3):bmesh.ops.smooth_vert(bm,verts=selected,factor=.24,use_axis_x=True,use_axis_y=True,use_axis_z=True)
            note='Local collar / upper-shoulder midpoint refinement and restrained Laplacian relaxation'
        elif name.endswith('105'):
            selected=[v for v in bm.verts if (ob.matrix_world@v.co).z>1.36]
            ss=set(selected);edges=[e for e in bm.edges if all(v in ss for v in e.verts)]
            bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
            selected=[v for v in bm.verts if (ob.matrix_world@v.co).z>1.37]
            for _ in range(2):bmesh.ops.smooth_vert(bm,verts=selected,factor=.18,use_axis_x=True,use_axis_y=True,use_axis_z=True)
            note='Vest neckline / shoulder strap silhouette refinement only'
        else:
            selected=[v for v in bm.verts if (ob.matrix_world@v.co).z>1.00]
            # Preserve pouch volume while softening the coarse folded flap.
            for _ in range(2):bmesh.ops.smooth_vert(bm,verts=selected,factor=.12,use_axis_x=True,use_axis_y=True,use_axis_z=True)
            note='Upper pouch flap edge relaxation; pouch body / belt retained'
        bm.normal_update();bm.to_mesh(ob.data);bm.free();ob.data.update()
        for poly in ob.data.polygons:poly.use_smooth=True
        changes.append({'mesh':name,'verticesBefore':before,'verticesAfter':len(ob.data.vertices),'change':note})
    # Export only authored character meshes and the existing 52-bone rig;
    # Blender's armature-display Icosphere is not a runtime object.
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type=='ARMATURE' or (o.type=='MESH' and o.name.startswith('MakeHuman_')):o.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'soldier-equipment-source.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'soldier-equipment.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=False,export_skins=True,export_all_influences=False)
    return changes

result={'helmet':helmet(),'clothing':clothing()}
(OUT/'equipment-build.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('EQUIPMENT_BUILD',json.dumps(result))
