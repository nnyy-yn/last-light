"""v0.6 authored game-art geometry derivatives. No functional mechanisms.
Retains canonical Y-up/-Z asset units, moving-assembly transforms and sockets.
"""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'weapon-sources/v0.6';OUT.mkdir(exist_ok=True)
def xyz(p):return Vector((p[0],-p[2],p[1]))
def canon(p):return Vector((p.x,p.z,-p.y))
def select(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def mat(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
def mesh(name,vertices,faces,material,uv=None):
 data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in vertices],[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 for p in data.polygons:p.use_smooth=True
 if uv:
  layer=data.uv_layers.new(name='UVMap')
  for p in data.polygons:
   for i in p.loop_indices:layer.data[i].uv=uv[data.loops[i].vertex_index]
 return o
def bevel(o,width,segments=3,angle=.52):
 select(o);m=o.modifiers.new('Authored edge radius','BEVEL');m.width=width;m.segments=segments;m.limit_method='ANGLE';m.angle_limit=angle;m.affect='EDGES';m.harden_normals=True
 bpy.ops.object.modifier_apply(modifier=m.name)
 for f in o.data.polygons:f.use_smooth=True
 n=o.modifiers.new('Area weighted hard-surface normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=35
 bpy.ops.object.modifier_apply(modifier=n.name)
def weld(o,dist=.000002):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=dist);bm.to_mesh(o.data);bm.free();o.data.update()
def extract(o,predicate,name):
 dup=o.copy();dup.data=o.data.copy();bpy.context.collection.objects.link(dup);dup.name=name
 bm=bmesh.new();bm.from_mesh(dup.data);kill=[f for f in bm.faces if not predicate([canon(dup.matrix_world@v.co) for v in f.verts])];bmesh.ops.delete(bm,geom=kill,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(dup.data);bm.free()
 bm=bmesh.new();bm.from_mesh(o.data);kill=[f for f in bm.faces if predicate([canon(o.matrix_world@v.co) for v in f.verts])];bmesh.ops.delete(bm,geom=kill,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(o.data);bm.free();return dup
def join_into(target,others):
 select(target)
 for o in others:o.select_set(True)
 bpy.ops.object.join();target.data.update()
def tube(name,points,radius,material,resolution=2):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=radius;c.bevel_resolution=resolution
 s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for b,p in zip(s.bezier_points,points):b.co=xyz(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);c.materials.append(material);select(o);bpy.ops.object.convert(target='MESH');return o
def microtexture(m,name,color,size=512):
 yy,xx=np.mgrid[0:size,0:size];rng=np.random.default_rng(605);noise=rng.random((size,size))-.5
 weave=np.sin(xx*math.pi*.25)*np.cos(yy*math.pi*.25)*.008+np.sin(xx*.022+yy*.016)*.011+np.sin(xx*.009)*np.sin(yy*.013)*.012+noise*.015
 base=np.empty((size,size,4),np.float32)
 for k,v in enumerate(color):base[:,:,k]=np.maximum(.002,v+weave)
 base[:,:,3]=1
 normal=np.empty_like(base);normal[:,:,0]=.5+noise*.06+np.sin(xx*math.pi*.25)*np.cos(yy*math.pi*.25)*.035;normal[:,:,1]=.5+noise*.06+np.cos(xx*math.pi*.25)*np.sin(yy*math.pi*.25)*.035;normal[:,:,2]=.996;normal[:,:,3]=1
 for kind,pixels in [('basecolor',base),('normal',normal)]:
  im=bpy.data.images.new(name+' '+kind,width=size,height=size,alpha=True);im.colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color';im.pixels.foreach_set(pixels.ravel());im.filepath_raw=str(OUT/(name+'-'+kind+'.png'));im.file_format='PNG';im.save();im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;p=m.node_tree.nodes.get('Principled BSDF')
  if kind=='basecolor':m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
  else:
   nn=m.node_tree.nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.35;m.node_tree.links.new(n.outputs['Color'],nn.inputs['Color']);m.node_tree.links.new(nn.outputs['Normal'],p.inputs['Normal'])
def export(id,changes):
 for im in bpy.data.images:
  if im.source=='FILE' and not im.packed_file:im.pack()
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o['v06_art_changes']='; '.join(changes)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(id+'-source.blend')))
 bpy.ops.export_scene.gltf(filepath=str(OUT/(id+'-export.glb')),export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
 return {'changes':changes,'meshes':[{ 'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':[m.name for m in o.data.materials],'matrix':[list(r)for r in o.matrix_world]}for o in bpy.context.scene.objects if o.type=='MESH']}

def akm():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'baseline/akm-real.glb'));body=bpy.data.objects['Body']
 # These are the original wooden surfaces, separated only for controlled edge
 # work. UV interpolation through the bevel retains the author's wood atlas.
 stock=extract(body,lambda ps:all(p.z>.2138 for p in ps) and any(p.z>.27 for p in ps),'AKM rounded wooden buttstock')
 lower=extract(body,lambda ps:all(-.1995<p.z<-.044 for p in ps) and all(p.y<.0125 for p in ps),'AKM rounded lower wooden guard')
 upper=extract(body,lambda ps:all(-.2042<p.z<-.090 for p in ps) and all(p.y>.012 for p in ps),'AKM rounded upper wooden guard')
 # Millimetre-scale real bevel geometry replaces razor-cut polygon silhouettes.
 for o,width in [(lower,.0018),(upper,.0015)]:
  weld(o);bevel(o,width,4,.36)
 # Rebuild the short angular stock cage with deliberately curved cross sections.
 # UVs are transferred from the original surface, rather than painted anew.
 profiles=[(.214,-.0145,.0138,.020),(.224,-.0145,.014,.020),(.245,-.019,.0145,.024),(.270,-.027,.017,.031),(.30,-.032,.0185,.036),(.35,-.040,.019,.044),(.40,-.046,.018,.048),(.441,-.046,.015,.049),(.447,-.046,.014,.048)]
 vv=[];ff=[];N=32
 for z,cy,rx,ry in profiles:
  for i in range(N):
   a=math.tau*i/N;c=math.cos(a);s=math.sin(a);vv.append((rx*math.copysign(abs(c)**.52,c),cy+ry*math.copysign(abs(s)**.62,s),z))
 for j in range(len(profiles)-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;ff.append((a,b,b+N,a+N))
 ff.append(tuple(range(N-1,-1,-1)));ff.append(tuple((len(profiles)-1)*N+i for i in range(N)))
 rounded=mesh('AKM recontoured laminated stock',vv,ff,stock.data.materials[0]);rounded.data.uv_layers.new(name='UVMap');select(rounded)
 transfer=rounded.modifiers.new('Original author UV surface transfer','DATA_TRANSFER');transfer.object=stock;transfer.use_loop_data=True;transfer.data_types_loops={'UV'};transfer.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=transfer.name)
 bpy.data.objects.remove(stock,do_unlink=True);stock=rounded
 weld(body);bevel(body,.00045,2,.68)
 # Magazine and charging-handle coordinates and geometry remain original.
 join_into(body,[stock,lower,upper]);body['source_author']='LonesomeDucky';body['source_license']='CC0 1.0';body['source_url']='https://opengameart.org/content/akm'
 return export('akm',['Original upper/lower wooden guard selective 4-segment bevel geometry','Stock rebuilt with 9 curved cross-sections and transferred original author UVs','Receiver 0.45 mm angle-limited bevels and corrected weighted normals','Original moving Magazine/ChargingHandle geometry and transforms retained'])

def m249():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'baseline/m249-real.glb'));body=bpy.data.objects['Body'];container=bpy.data.objects['AmmoContainer'];original_matrix=container.matrix_world.copy()
 # Replace the visibly distorted original buttstock only. Receiver, sights,
 # grip, muzzle, feed belt and their landmarks are outside this cut region.
 old=extract(body,lambda ps:all(p.z>.1185 for p in ps) and any(p.z>.121 for p in ps),'Removed source stock');bpy.data.objects.remove(old,do_unlink=True)
 polymer=mat('v06 molded stock polymer',(.035,.039,.035),.66);rubber=mat('v06 dense rubber recoil pad',(.018,.020,.018),.9);steel=mat('v06 stock steel fasteners',(.025,.029,.026),.44,.78)
 microtexture(polymer,'stock-grain',(.075,.080,.071))
 additions=[]
 def loft(name,sections,material,segments=32):
  verts=[];uv=[];faces=[]
  for j,(z,cy,rx,ry)in enumerate(sections):
   for i in range(segments):
    a=math.tau*i/segments;c=math.cos(a);s=math.sin(a);verts.append((rx*math.copysign(abs(c)**.48,c),cy+ry*math.copysign(abs(s)**.48,s),z));uv.append((i/segments,j/(len(sections)-1)))
  for j in range(len(sections)-1):
   for i in range(segments):
    a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
  faces.append(tuple(range(segments-1,-1,-1)));faces.append(tuple((len(sections)-1)*segments+i for i in range(segments)))
  return mesh(name,verts,faces,material,uv)
 additions.append(loft('Continuous molded cheek support',[(.119,.057,.020,.027),(.125,.064,.024,.031),(.138,.067,.024,.032),(.252,.069,.023,.032),(.269,.066,.024,.034),(.281,.062,.023,.031)],polymer))
 # The molded side webs use recessed triangular panels with real depth.
 for side in [-1,1]:
  panels=[[(.13,.037),(.13,-.016),(.193,.035)],[(.13,-.016),(.195,-.029),(.193,.035)],[(.193,.035),(.195,-.029),(.27,.035)],[(.195,-.029),(.27,-.044),(.27,.035)]]
  for triangle in panels:
   center=Vector((sum(v[0]for v in triangle)/3,sum(v[1]for v in triangle)/3));vertices=[]
   for z,y in triangle:vertices.append((side*.026,y,z))
   for z,y in triangle:
    q=Vector((z,y)).lerp(center,.22);vertices.append((side*.022,q.y,q.x))
   quads=[(0,1,4,3),(1,2,5,4),(2,0,3,5),(3,4,5)]
   if side<0:quads=[tuple(reversed(p))for p in quads]
   panel=mesh('Molded recessed stock web',vertices,quads,polymer,[(v[2]*4,v[1]*8)for v in vertices]);bevel(panel,.0010,3,.35);additions.append(panel)
  for a,b in [((side*.026,.037,.128),(side*.026,.035,.274)),((side*.026,-.016,.128),(side*.026,-.044,.274))]:additions.append(tube('Rounded stock edge molding',[a,b],.0028,polymer,2))
 additions.append(loft('Curved rubber buttpad',[(.277,.031,.026,.082),(.282,.032,.029,.086),(.293,.032,.029,.086),(.304,.032,.027,.083),(.311,.032,.023,.078)],rubber,48))
 for j in range(12):
  y=-.039+j*.012
  additions.append(tube('Buttpad molded traction rib',[(-.020,y,.309),(-.011,y,.313),(0,y,.314),(.011,y,.313),(.020,y,.309)],.0012,rubber,1))
 for side in [-1,1]:
  for z,y in [(.132,.056),(.270,.037)]:
   bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=xyz((side*.027,y,z)));o=bpy.context.object;o.name='Recessed stock fastener';o.scale=(.0012,.004,.004);select(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(steel);additions.append(o)
 join_into(body,additions)
 # A tensioned rounded perimeter is sculpted ring by ring. Corrugated sides,
 # pinched top corners and a sagging bottom are actual mesh, not extra roughness.
 canvas=mat('v06 creased woven olive fabric',(.13,.15,.09),.91);webbing=mat('v06 folded reinforcement webbing',(.035,.042,.026),.86)
 microtexture(canvas,'bag-weave',(.19,.205,.13),1024)
 verts=[];uv=[];faces=[];rings=19;segments=64
 for j in range(rings):
  t=j/(rings-1);y=-.158+.148*t;rx=.065+.013*math.sin(math.pi*t)**.7;rz=.067+.013*math.sin(math.pi*t)**.7
  for i in range(segments):
   a=math.tau*i/segments;c=math.cos(a);s=math.sin(a);xx=rx*math.copysign(abs(c)**.48,c);zz=rz*math.copysign(abs(s)**.48,s)
   tension=math.sin(math.pi*t)**.7;fold=(.0026*math.sin(5*a+4*t)+.0017*math.sin(11*a-6*t))*tension
   # Creases emanate from two upper binding seams without changing the grip envelope.
   crease=.004*math.sin(3*math.pi*t+2*a)*math.exp(-((t-.76)/.23)**2)
   xx+=c*(fold+crease);zz+=s*(fold+crease)
   yy=y-.003*(1-t)**2*(.5+.5*math.cos(2*a))+.0013*math.sin(a*6+t*8)*tension
   verts.append((xx,yy,-.145+zz));uv.append((i/segments,t))
 for j in range(rings-1):
  for i in range(segments):
   a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,a+segments,b+segments,b))
 faces.append(tuple(range(segments-1,-1,-1)));faces.append(tuple((rings-1)*segments+i for i in range(segments)))
 pouch=mesh('Sculpted fabric pouch',verts,faces,canvas,uv)
 components=[pouch]
 # Ribbon strips follow the cloth contour and visibly bend over its upper seam.
 for side in [-1,1]:
  ribbon=[];quads=[]
  for j in range(13):
   t=j/12;y=-.147+.139*t;xx=side*(.069+.012*math.sin(math.pi*t));z=-.145+.003*math.sin(t*math.pi*2)
   for zz in [-.010,.010]:ribbon.append((xx,y,z+zz))
  for j in range(12):quads.append((j*2,j*2+1,j*2+3,j*2+2))
  strap=mesh('Contoured vertical webbing strap',ribbon,quads,webbing,[(i%2,(i//2)/12)for i in range(26)]);select(strap);m=strap.modifiers.new('Woven strap thickness','SOLIDIFY');m.thickness=.0012;bpy.ops.object.modifier_apply(modifier=m.name);components.append(strap)
  points=[(side*(.069+.010*math.sin(math.pi*t)),-.148+.139*t,-.207+.0015*math.sin(t*7))for t in np.linspace(0,1,12)]
  components.append(tube('Pouch sewn side piping',points,.0009,webbing,1))
  components.append(tube('Folded collar binding',[(side*.062,-.013,-.200),(side*.065,-.012,-.182),(side*.067,-.011,-.145),(side*.065,-.012,-.108),(side*.062,-.013,-.090)],.0019,webbing,2))
 # Replace geometry but preserve the animated AmmoContainer origin/transform.
 select(pouch)
 for o in components[1:]:o.select_set(True)
 bpy.ops.object.join();pouch.data.transform(original_matrix.inverted()@pouch.matrix_world);container.data=pouch.data;container.matrix_world=original_matrix;bpy.data.objects.remove(pouch,do_unlink=True)
 body['source_author']='AK / skaf13';body['source_license']='CC BY 4.0';body['source_url']='https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244'
 return export('m249',['Buttstock replaced by continuous molded cheek support and physically recessed triangular webs','Curved rubber buttpad with modeled traction ridges and recessed fasteners','Ammo pouch rebuilt with tension folds, sagged bottom, shaped woven straps and piping','AmmoContainer transform and FeedBelt source geometry retained; all sights/grips/muzzle unchanged'])

report={}
for key in sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['akm','m249']:
 report[key]=globals()[key]()
(OUT/'dcc-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('V06_GEOMETRY_DONE '+json.dumps({key:sum(o['triangles']for o in value['meshes'])for key,value in report.items()}))
