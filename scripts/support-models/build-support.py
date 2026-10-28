"""Original support-equipment game art, canonical metres, +Y up/-Z gun muzzle.
Runs Blender background only. No external downloaded model or film imagery.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'weapon-sources/v0.11'; OUT.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'public/assets'
def xyz(p): return (p[0],-p[2],p[1])
def reset():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
 return {name:mat(name,col,metal,rough) for name,col,metal,rough in [
 ('support phosphate steel',(.055,.065,.058),.65,.46),('support worn edges',(.16,.17,.15),.7,.46),('support oiled wood',(.24,.105,.045),0,.64),('support black rubber',(.022,.027,.023),0,.9),('support olive paint',(.19,.225,.13),.2,.74),('support canvas',(.24,.25,.16),0,.95),('support brass',(.36,.24,.075),.65,.40),('support weathered sand',(.38,.32,.23),.12,.79),('support glass',(.075,.14,.16),.28,.22),('support dark cavity',(.009,.012,.01),0,.95)]}
def mat(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
M={}
def empty(name,pos=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=xyz(pos);return o
def finish(o,name,m,parent,bevel=0):
 o.name=name;o.data.materials.append(m);o.parent=parent
 if bevel:
  mod=o.modifiers.new('machined edge','BEVEL');mod.width=bevel;mod.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=False
 return o
def box(name,size,pos,m,parent,bevel=.003,rx=0,rz=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);o.rotation_euler=(rx,-rz,0);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m,parent,bevel)
def cyl(name,r,depth,pos,m,parent,axis='z',r2=None,vertices=16):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=xyz(pos));o=bpy.context.object;direction={'x':Vector((1,0,0)),'y':Vector((0,0,1)),'z':Vector((0,-1,0))}[axis];o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(direction);return finish(o,name,m,parent)
def rod(name,a,b,r,m,parent,vertices=10):
 aa,bb=Vector(xyz(a)),Vector(xyz(b));bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=(bb-aa).length,location=(aa+bb)*.5);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference((bb-aa).normalized());return finish(o,name,m,parent)
def ring(name,outer,inner,length,pos,m,parent,axis='z',segments=20):
 vs=[]
 for end in [-length/2,length/2]:
  for radius in [outer,inner]:
   for i in range(segments):
    a=i*math.tau/segments;u,v=math.cos(a)*radius,math.sin(a)*radius;p=(end,u,v) if axis=='x' else (u,end,v) if axis=='y' else (u,v,end);vs.append(xyz(tuple(pos[k]+p[k] for k in range(3))))
 faces=[]
 for i in range(segments):
  n=(i+1)%segments;faces.extend([(i,n,2*segments+n,2*segments+i),(segments+n,segments+i,3*segments+i,3*segments+n),(n,i,segments+i,segments+n),(2*segments+i,2*segments+n,3*segments+n,3*segments+i)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,m,parent)
def marker(name,pos,parent):
 o=empty(name,pos,parent);o['socket']=name;return o
def group(name,parent):return empty(name,parent=parent)
def boltline(parent,z0,z1,y,x=.047):
 for i in range(5):cyl('receiver rivet',.006,.005,(x,y,z0+(z1-z0)*i/4),M['edge'],parent,axis='x',vertices=8)
def setup():
 global M
 raw=reset();keys=['steel','edge','wood','rubber','olive','canvas','brass','sand','glass','dark'];M=dict(zip(keys,raw.values()));return empty('AssetRoot')
def aggregate(root):
 # Batch only siblings with the same material. Moving parts and socket pivots
 # remain separate; all duplicate props share the finite material palette.
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH':groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
 for (parent,material),items in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();items[0].name=(parent.name if parent else 'root')+'_'+material.name.replace('support ','');items[0].parent=parent
 bpy.ops.object.select_all(action='SELECT')
 for o in bpy.context.selected_objects:
  if o.type=='MESH':
   bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
def export(root,key,meta):
 aggregate(root);root['assetId']=key;root['originalProjectGeometry']=True;root['licensing']='Original Last Light geometry; no manufacturer CAD or film assets.'
 bpy.context.view_layer.update();blend=OUT/(key+'-source.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend))
 glb=PUBLIC/(key+'.glb');bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=False,export_animations=False,export_extras=True,export_apply=True)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
 report={'id':key,'file':str(glb.relative_to(ROOT)),'bytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'triangles':triangles,'meshCount':len(meshes),'materialCount':len(set(m for o in meshes for m in o.data.materials)),'source':str(blend.relative_to(ROOT)),**meta}
 # Separate reduced geometry keeps the same named hinges, sockets and part tree.
 for obj in meshes:
  if len(obj.data.vertices)<80:continue
  bpy.context.view_layer.objects.active=obj
  mod=obj.modifiers.new('distance LOD','DECIMATE');mod.ratio=.42
  bpy.ops.object.modifier_apply(modifier=mod.name)
 lod=PUBLIC/(key+'-lod.glb');bpy.ops.export_scene.gltf(filepath=str(lod),export_format='GLB',use_selection=False,export_animations=False,export_extras=True,export_apply=True)
 report['lod']={'file':str(lod.relative_to(ROOT)),'bytes':lod.stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'sha256':hashlib.sha256(lod.read_bytes()).hexdigest()}
 (OUT/(key+'-manifest.json')).write_text(json.dumps(report,indent=2),encoding='utf8');return report

def rpk():
 root=setup();body=group('RPKBody',root);mag=group('Magazine',root);handle=group('ChargingHandle',root)
 box('receiver',(.081,.105,.32),(0,.033,-.071),M['steel'],body,.005);box('top cover',(.077,.027,.31),(0,.099,-.068),M['edge'],body,.007)
 box('wood butt',(.061,.13,.255),(0,.008,.255),M['wood'],body,.012,rz=0);box('butt heel',(.07,.155,.022),(0,.008,.389),M['rubber'],body,.006)
 box('stock neck',(.055,.062,.12),(0,.044,.111),M['wood'],body,.008);box('pistol grip',(.043,.12,.055),(0,-.073,.006),M['wood'],body,.008,rx=-.2)
 rod('trigger guard',(0,-.032,-.034),(0,-.092,-.045),.007,M['steel'],body);rod('trigger guard',(0,-.092,-.045),(0,-.092,-.082),.007,M['steel'],body);rod('trigger bow',(0,-.035,-.063),(0,-.071,-.055),.005,M['steel'],body)
 box('lower handguard',(.068,.063,.19),(0,.017,-.302),M['wood'],body,.009);box('upper handguard',(.052,.038,.14),(0,.070,-.297),M['wood'],body,.007)
 cyl('heavy barrel',.014,.40,(0,.042,-.49),M['steel'],body);cyl('gas tube',.014,.27,(0,.078,-.365),M['edge'],body);box('gas block',(.049,.074,.047),(0,.057,-.475),M['steel'],body,.004)
 ring('muzzle crown',.020,.008,.027,(0,.042,-.698),M['edge'],body);box('front sight base',(.026,.070,.031),(0,.082,-.626),M['steel'],body,.002);ring('front sight hood',.023,.017,.015,(0,.123,-.626),M['steel'],body);box('front post',(.006,.025,.006),(0,.115,-.626),M['edge'],body,.001)
 box('rear sight leaf',(.042,.014,.080),(0,.117,-.139),M['steel'],body,.002);forwards=[-.020,.020]
 for x in forwards:box('rear notch wing',(.014,.015,.012),(x,.125,-.107),M['edge'],body,.001)
 box('side charging rod',(.060,.013,.016),(.057,.059,-.025),M['steel'],handle,.002);cyl('charging tip',.012,.033,(.089,.059,-.025),M['edge'],handle,axis='x')
 cyl('75rd drum shell',.111,.097,(0,-.145,-.128),M['steel'],mag,axis='x',vertices=32);cyl('drum rear cover',.103,.005,(-.052,-.145,-.128),M['edge'],mag,axis='x',vertices=28);cyl('drum hub',.023,.010,(-.060,-.145,-.128),M['steel'],mag,axis='x');box('drum feed neck',(.055,.063,.073),(0,-.033,-.125),M['steel'],mag,.003)
 for i in range(8):
  a=i*math.tau/8;rod('drum pressed rib',(-.057,-.145+math.cos(a)*.036,-.128+math.sin(a)*.036),(-.057,-.145+math.cos(a)*.09,-.128+math.sin(a)*.09),.004,M['steel'],mag)
 for side in [-1,1]:
  rod('folded bipod leg',(side*.025,.029,-.567),(side*.042,-.035,-.343),.008,M['steel'],body);box('bipod foot',(.035,.012,.047),(side*.042,-.038,-.343),M['edge'],body,.002)
 boltline(body,-.17,.055,.048)
 sockets={'GripRight':[0,-.055,.005],'GripLeft':[0,-.011,-.330],'Muzzle':[0,.042,-.713],'RearSight':[0,.127,-.107],'FrontSight':[0,.127,-.626],'MagazineGrip':[-.065,-.14,-.128]}
 for n,p in sockets.items():marker(n,p,root)
 return export(root,'rpk-support',{'weaponId':'rpk','sockets':sockets,'lengthMetres':1.113,'reloadPart':'Magazine'})

def rpg():
 root=setup();body=group('RPGTube',root);rocket=group('Magazine',root);trigger=group('ChargingHandle',root)
 ring('launch tube',.026,.020,.92,(0,.11,.14),M['steel'],body);ring('front mouth',.031,.021,.045,(0,.11,-.335),M['edge'],body);ring('rear venturi',.075,.055,.11,(0,.11,.64),M['steel'],body)
 for i in range(10):box('wood thermal jacket',(.05,.015,.41),(0,.11+(.044 if i<5 else -.044),-.04+(i%5)*.005),M['wood'],body,.003)
 for z in [-.18,.22]:ring('jacket band',.050,.044,.023,(0,.11,z),M['edge'],body)
 for x in [-.044,.044]:box('thermal side',(.016,.082,.40),(x,.11,.02),M['wood'],body,.004)
 for z in [.005,-.23]:box('grip',(.038,.13,.048),(0,-.032,z),M['wood'],body,.006,rx=.08)
 box('trigger housing',(.045,.055,.073),(0,.026,.005),M['steel'],body,.004);rod('trigger guard',(0,-.01,-.026),(0,-.077,-.027),.005,M['steel'],body);rod('trigger guard',(0,-.077,-.027),(0,-.077,-.053),.005,M['steel'],body)
 box('cocking lever',(.015,.032,.022),(.028,.01,.048),M['edge'],trigger,.002)
 box('optic side mount',(.08,.033,.12),(-.058,.17,.05),M['steel'],body,.003);cyl('PGO sight tube',.031,.17,(-.10,.205,.025),M['olive'],body);ring('ocular rubber',.036,.025,.046,(-.10,.205,.133),M['rubber'],body);ring('objective rim',.039,.027,.027,(-.10,.205,-.075),M['steel'],body);cyl('objective glass',.027,.005,(-.10,.205,-.085),M['glass'],body);cyl('range drum',.021,.041,(-.14,.205,.015),M['edge'],body,axis='x')
 # Visibly distinct PG-7-style round: narrow motor, flared shoulder, long conical nose.
 cyl('rocket motor',.019,.26,(0,.11,-.412),M['olive'],rocket);cyl('warhead shoulder',.044,.07,(0,.11,-.57),M['olive'],rocket,r2=.030);cyl('warhead body',.044,.16,(0,.11,-.685),M['olive'],rocket,r2=.024);cyl('warhead nose',.024,.13,(0,.11,-.83),M['olive'],rocket,r2=.005);cyl('nose cap',.007,.025,(0,.11,-.907),M['steel'],rocket)
 for z in [-.60,-.71]:ring('round band',.045 if z==-.60 else .036,.033,.012,(0,.11,z),M['mark'] if 'mark' in M else M['sand'],rocket)
 for i in range(4):
  a=i*math.pi/2;box('stowed fin',(.036,.003,.10),(math.cos(a)*.018,.11+math.sin(a)*.018,-.36),M['edge'],rocket,.001,rz=a)
 sockets={'GripRight':[0,-.055,.005],'GripLeft':[0,-.055,-.23],'Muzzle':[0,.11,-.36],'ProjectileTip':[0,.11,-.92],'Backblast':[0,.11,.70],'RearSight':[-.10,.205,.156],'FrontSight':[-.10,.205,-.085],'MagazineGrip':[-.047,.10,-.61]}
 for n,p in sockets.items():marker(n,p,root)
 return export(root,'rpg7-support',{'weaponId':'rpg7','sockets':sockets,'launchTubeMetres':.95,'reloadPart':'Magazine','frontLoaded':True})

def dshk_parts(root):
 body=group('DShKBody',root);cover=group('MountedFeedCover',root);latch=group('MountedCoverLatch',cover);belt=group('MountedBeltSegment',root);charging=group('MountedChargingHandle',root);grip=group('MountedChargingGrip',charging)
 box('receiver',(.16,.19,.49),(0,.02,.04),M['steel'],body,.009);box('receiver top',(.19,.055,.39),(0,.143,.04),M['steel'],cover,.005);box('cover latch',(.10,.035,.055),(0,.18,.17),M['edge'],latch,.003)
 # DShK barrel cooling fins and large muzzle brake, separate silhouette from M2.
 cyl('barrel',.028,.87,(0,.045,-.63),M['steel'],body,vertices=20)
 for n in range(23):ring('cooling fin',.042,.027,.012,(0,.045,-.27-n*.027),M['edge'] if n%5==0 else M['steel'],body,segments=16)
 ring('muzzle brake rear',.061,.027,.035,(0,.045,-1.083),M['steel'],body);ring('muzzle brake front',.060,.029,.026,(0,.045,-1.185),M['edge'],body)
 for x in [-.048,.048]:box('brake side bar',(.022,.040,.10),(x,.045,-1.135),M['steel'],body,.003)
 box('front sight mount',(.025,.07,.04),(0,.102,-.955),M['steel'],body,.002);ring('anti-air ring sight',.058,.051,.009,(0,.18,-.87),M['edge'],body,segments=24);rod('front sight cross',(-.05,.18,-.87),(.05,.18,-.87),.004,M['steel'],body)
 box('rear ladder sight',(.060,.08,.018),(0,.20,.20),M['edge'],body,.002)
 for side,name in [(-1,'Left'),(1,'Right')]:
  rod('rear spade support',(0,.01,.28),(side*.15,.01,.34),.022,M['steel'],body);g=group('MountedSpadeGrip'+name,root);cyl('wood spade handle',.023,.15,(side*.15,-.015,.35),M['wood'],g,axis='y');marker('Contact'+name,(side*.15,-.015,.35),root)
 cyl('feed wheel casing',.095,.13,(-.13,.02,-.04),M['steel'],body,axis='x',vertices=20);box('ammo box',(.24,.28,.32),(-.34,-.16,-.02),M['olive'],body,.009)
 for n in range(7):cyl('belt cartridge',.009,.095,(-.09-n*.025,.14,.015),M['brass'],belt);box('belt link',(.021,.013,.03),(-.09-n*.025,.14,.015),M['steel'],belt,.001)
 rod('charging lever',(.10,.01,.07),(.18,.01,.07),.014,M['steel'],charging);cyl('charging knob',.02,.07,(.18,.01,.07),M['rubber'],grip,axis='y')
 for n,p in {'Muzzle':[0,.045,-1.21],'Camera':[0,.22,.61],'GripRight':[.15,-.015,.35],'GripLeft':[-.15,-.015,.35],'Backblast':[0,0,.3]}.items():marker(n,p,root)
 return root

def dshk():
 root=setup();dshk_parts(root);return export(root,'dshk-support',{'weaponId':'dshk','lengthMetres':1.6,'mountedOnly':True})

def minigun():
 root=setup();body=group('MinigunBody',root);barrels=group('RotatingBarrels',root)
 cyl('receiver rotor',.082,.28,(0,0,.05),M['steel'],body,vertices=20);cyl('drive motor',.046,.26,(.10,-.026,.065),M['edge'],body);box('motor bracket',(.21,.055,.15),(.025,-.074,.06),M['steel'],body,.004)
 for i in range(6):
  a=i*math.tau/6;x=math.cos(a)*.044;y=math.sin(a)*.044;ring('barrel bore',.012,.005,.61,(x,y,-.36),M['steel'],barrels,segments=10)
 for z in [-.16,-.48,-.655]:ring('barrel cluster ring',.067,.057,.023,(0,0,z),M['edge'],barrels,segments=20)
 box('electric trigger unit',(.095,.07,.075),(0,.01,.22),M['steel'],body,.004)
 for side in [-1,1]:cyl('rear handle',.016,.11,(side*.07,-.015,.26),M['rubber'],body,axis='y');rod('grip support',(0,0,.19),(side*.07,0,.26),.012,M['steel'],body)
 box('feed chute receiver',(.07,.08,.13),(-.10,.01,.015),M['steel'],body,.004)
 for n in range(9):box('flex feed link',(.04,.065,.075),(-.14-n*.023,.01-n*.013,.015),M['edge'] if n%2 else M['steel'],body,.002)
 for n,p in {'Muzzle':[0,0,-.682],'GripRight':[.07,-.01,.26],'GripLeft':[-.07,-.01,.26]}.items():marker(n,p,root)
 return export(root,'m134-door-support',{'weaponId':'m134','lengthMetres':.96,'mountedOnly':True})

def technical():
 root=setup();body=group('TechnicalBody',root)
 box('ladder chassis',(1.53,.20,4.3),(0,.56,0),M['steel'],body,.02);box('cab lower',(1.77,.47,1.65),(0,.98,.87),M['sand'],body,.025);box('hood',(1.72,.25,.83),(0,1.17,1.98),M['sand'],body,.025)
 # Real cab shell and open pickup bed; no roof/canvas over gunner platform.
 box('cab roof',(1.79,.11,1.30),(0,1.83,.83),M['sand'],body,.02);box('cab rear wall',(1.76,.74,.10),(0,1.44,.16),M['sand'],body,.008)
 box('rear window',(1.22,.34,.018),(0,1.56,.094),M['glass'],body,.005)
 for side in [-1,1]:
  box('door lower',(.055,.52,1.37),(side*.89,1.10,.83),M['sand'],body,.009);rod('A pillar',(side*.84,1.21,1.63),(side*.84,1.79,1.40),.034,M['sand'],body);rod('B pillar',(side*.85,1.15,.20),(side*.85,1.81,.20),.037,M['sand'],body);rod('window sill',(side*.88,1.34,.26),(side*.88,1.34,1.54),.025,M['edge'],body);box('door handle',(.025,.035,.15),(side*.93,1.25,.40),M['steel'],body,.004)
  box('seat',(.62,.12,.61),(side*.43,1.0,.67),M['rubber'],body,.025);box('seat back',(.62,.56,.11),(side*.43,1.33,.37),M['rubber'],body,.025)
 box('windshield',(1.61,.51,.027),(0,1.54,1.52),M['glass'],body,.002,rx=-.38);box('dashboard',(1.58,.14,.33),(0,1.20,1.35),M['steel'],body,.01)
 box('bed floor',(1.73,.09,2.12),(0,.90,-1.14),M['sand'],body,.008)
 for n in range(11):box('bed corrugation',(.055,.025,2.03),(-.78+n*.156,.96,-1.14),M['edge'],body,.002)
 for side in [-1,1]:box('bed side',(.075,.52,2.14),(side*.89,1.20,-1.14),M['sand'],body,.009);box('bed rail',(.10,.07,2.15),(side*.89,1.48,-1.14),M['edge'],body,.008)
 box('tailgate',(1.77,.51,.075),(0,1.19,-2.23),M['sand'],body,.009);box('rear bumper',(1.96,.13,.18),(0,.67,-2.32),M['steel'],body,.009);box('front bumper',(1.96,.15,.17),(0,.78,2.43),M['steel'],body,.009)
 box('grille',(1.06,.21,.025),(0,1.03,2.405),M['dark'],body,.002)
 for n in range(10):box('grille slot',(.032,.17,.03),(-.46+n*.102,1.04,2.425),M['edge'],body,.001)
 for side in [-1,1]:box('headlight',(.30,.17,.035),(side*.68,1.04,2.41),M['glass'],body,.004);box('rear lamp',(.16,.22,.035),(side*.71,1.10,-2.275),M['red'] if 'red' in M else M['brass'],body,.004)
 for z in [-1.46,1.45]:
  rod('axle',(-.92,.40,z),(.92,.40,z),.06,M['steel'],body)
  for side in [-1,1]:
   wheel=group('Wheel_'+str(z)+'_'+str(side),root);ring('all terrain tyre',.385,.245,.22,(side*.91,.39,z),M['rubber'],wheel,axis='x',segments=24);cyl('wheel rim',.245,.225,(side*.91,.39,z),M['edge'],wheel,axis='x',vertices=20)
   for n in range(20):a=n*math.tau/20;box('tread lug',(.235,.065,.085),(side*.91,.39+math.cos(a)*.365,z+math.sin(a)*.365),M['rubber'],wheel,.002,rx=-a)
 # Wide real tripod feet transfer the gun load to the bed.
 cyl('gun pedestal',.075,1.1,(0,1.55,-1.0),M['steel'],body,axis='y')
 for a in [0,math.tau/3,math.tau*2/3]:rod('tripod leg',(0,2.02,-1),(math.sin(a)*.63,.96,-1+math.cos(a)*.58),.042,M['steel'],body)
 ring('turret traverse ring',.17,.105,.09,(0,2.08,-1),M['edge'],body,axis='y')
 for name,p in {'TurretMount':[0,2.22,-1.0],'GunnerSocket':[0,.96,-1.93],'ExitLeft':[-1.75,0,-1.55],'ExitRight':[1.75,0,-1.55],'ExitRear':[0,0,-3.0]}.items():marker(name,p,root)
 return export(root,'technical-pickup-support',{'dimensions':{'width':2.05,'length':4.92,'height':2.22},'openBed':True,'collisionBoxes':[{'minX':-1.025,'maxX':1.025,'minZ':-2.42,'maxZ':2.5,'minY':0,'maxY':1.94}],'gunnerFloor':.96})

reports=[rpk(),rpg(),dshk(),minigun(),technical()]
(OUT/'support-manifest.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
print('SUPPORT_EXPORT',json.dumps(reports))
