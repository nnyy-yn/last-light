"""Refine existing licensed character surfaces without changing rigs or UVs.

Always starts from the preserved v0.4 assets. No downloaded texture is enlarged.
Small skin relief is derived from existing fine texture detail, not color shading.
"""
from pathlib import Path
import struct,json,io,hashlib
import numpy as np
from PIL import Image,ImageFilter

ROOT=Path(__file__).resolve().parents[2]
BEFORE=ROOT/'artifacts/model-upgrade-v0.5/before'
OUT=ROOT/'character-sources/makehuman/v0.5'
OUT.mkdir(parents=True,exist_ok=True)

def packed_image(array):
    image=Image.fromarray(np.uint8(np.clip(array,0,255)))
    buf=io.BytesIO();image.save(buf,format='WEBP',lossless=True,method=6)
    return buf.getvalue()

def ellipse(xx,yy,x,y,rx,ry):
    return np.exp(-(((xx-x)/rx)**2+((yy-y)/ry)**2)*2)

def refine(kind):
    raw=(BEFORE/f'makehuman-{kind}.glb').read_bytes()
    size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);binary=bytearray(raw[28+size:])
    views=[bytes(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]) for v in g['bufferViews']]
    generated=[];geometry=[]
    def accessor(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
        c={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        assert not v.get('byteStride'),'Expected non-interleaved authored GLB'
        return np.frombuffer(views[a['bufferView']],dtype=dtype,count=a['count']*c,offset=a.get('byteOffset',0)).reshape(a['count'],c).copy()
    def image_for(material):
        texture=g['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
        index=texture.get('source',texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
        return index,Image.open(io.BytesIO(views[g['images'][index]['bufferView']])).convert('RGB')
    def append_texture(name,data):
        vi=len(views);views.append(data);g['bufferViews'].append({'buffer':0,'byteLength':len(data)})
        ii=len(g['images']);g['images'].append({'name':name,'mimeType':'image/webp','bufferView':vi})
        ti=len(g['textures']);g['textures'].append({'extensions':{'EXT_texture_webp':{'source':ii}}})
        (OUT/f'{name}.webp').write_bytes(data);generated.append({'name':name,'bytes':len(data)})
        return ti
    for m in g['materials']:
        pbr=m['pbrMetallicRoughness'];name=m.get('name','')
        if name.endswith('.body'):
            _,source=image_for(m);pixels=np.array(source).astype(np.float32);h,w=pixels.shape[:2]
            y,x=np.mgrid[0:h,0:w].astype(np.float32);x/=w;y/=h
            lips=ellipse(x,y,.91,.521,.024,.027)
            nose=ellipse(x,y,.877,.52,.032,.035)
            forehead=ellipse(x,y,.776,.518,.055,.080)
            eyelids=ellipse(x,y,.835,.463,.027,.026)+ellipse(x,y,.835,.579,.027,.026)
            # Original atlas photographic detail is retained. Only sub-texel to
            # 3-pixel detail contributes relief, never its broad baked shading.
            gray=Image.fromarray(np.uint8(pixels.mean(2)))
            fine=(np.array(gray.filter(ImageFilter.GaussianBlur(.55))).astype(np.float32)-np.array(gray.filter(ImageFilter.GaussianBlur(2.6))).astype(np.float32))/255
            rng=np.random.default_rng(53);noise=rng.normal(0,.0015,(h,w)).astype(np.float32)
            height=fine*.23+noise
            dy,dx=np.gradient(height)
            normal=np.stack([-dx*1.9,dy*1.9,np.ones_like(dx)],axis=-1)
            normal/=np.linalg.norm(normal,axis=2,keepdims=True)
            nt=append_texture(kind+'-skin-normal',(packed_image((normal*.5+.5)*255)))
            rough=np.clip(.67-.18*lips-.13*nose-.06*forehead-.06*eyelids+fine*.18,.44,.74)
            orm=np.stack([np.ones_like(rough),rough,np.zeros_like(rough)],axis=-1)*255
            # Regional oil/dryness variation needs much less texel density
            # than the skin normal map; use 512px instead of another 2K map.
            orm=np.array(Image.fromarray(np.uint8(np.clip(orm,0,255))).resize((512,512),Image.Resampling.LANCZOS))
            rt=append_texture(kind+'-skin-roughness',packed_image(orm))
            m['normalTexture']={'index':nt,'scale':.65}
            pbr['metallicRoughnessTexture']={'index':rt};pbr['roughnessFactor']=1;pbr['metallicFactor']=0
            m.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.42,'specularColorFactor':[1,.92,.87]}
            m.setdefault('extras',{})['surfaceRevision']='v0.5 fine relief and regional roughness'
        elif 'low-poly' in name:
            ii,source=image_for(m);pixels=np.array(source).astype(np.float32);h,w=pixels.shape[:2]
            y,x=np.mgrid[0:h,0:w].astype(np.float32);x/=w;y/=h
            r=np.minimum(np.hypot(x-.297,y-.700),np.hypot(x-.703,y-.297))
            iris=np.clip((.119-r)/.012,0,1)[...,None]
            # Retain the CC0 source's iris fibres and limbal ring, but correct
            # the previous desaturation into a warm, darker brown iris.
            tinted=pixels*np.array([.67,.49,.34],np.float32)
            sclera=pixels*np.array([.91,.88,.84],np.float32)
            eyes=tinted*iris+sclera*(1-iris)
            data=packed_image(eyes);views[g['images'][ii]['bufferView']]=data
            (OUT/f'{kind}-eyes.webp').write_bytes(data)
            pbr['roughnessFactor']=.26;pbr['metallicFactor']=0
            m.setdefault('extensions',{})['KHR_materials_clearcoat']={'clearcoatFactor':.78,'clearcoatRoughnessFactor':.11}
            m.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.72}
        elif 'eyebrow001' in name:
            m['alphaMode']='MASK';m['alphaCutoff']=.22
            pbr['baseColorFactor']=[.21,.17,.14,1];pbr['roughnessFactor']=.92
        elif 'Mil_Suit' in name:
            # Cloth is dielectric; the original packed map was also being used
            # as unrestricted metalness on several fabric pieces.
            pbr['metallicFactor']=0
            pbr['roughnessFactor']=.92
            m.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.25}
    if kind=='soldier':
        # Reshape the actual blouse collar and upper vest opening only. This
        # keeps seam UVs, weights, topology, sleeves and ground-contact boots.
        for mesh in g['meshes']:
            for prim in mesh['primitives']:
                mat=g['materials'][prim.get('material',0)]['name']
                neck=mat.endswith('.body')
                if not (neck or (mat=='Mil_Suit_R5' and 'Mil_Suit_R5_Mil' in mesh['name'])):continue
                ai=prim['attributes']['POSITION'];a=g['accessors'][ai];points=accessor(ai);old=points.copy()
                x,y,z=points.T
                if neck:
                    # Extend only the previously cropped neck skirt beneath
                    # the lowered collar; its old jagged mask edge stays hidden.
                    ids=accessor(prim['indices']).reshape(-1,3)
                    _,unique=np.unique(np.round(points,6),axis=0,return_inverse=True)
                    triangles=unique[ids];edges=np.concatenate([triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]]]);edges.sort(1)
                    edges,counts=np.unique(edges,axis=0,return_counts=True)
                    boundary=np.unique(edges[counts==1]);weight=np.isin(unique,boundary)&(np.abs(x)<.10)&(y>1.50)&(y<1.605)
                    points[weight,1]=1.50
                else:
                    weight=np.clip((y-1.49)/.12,0,1)*np.clip((.20-np.abs(x))/.065,0,1)
                    points[:,1]-=.044*weight
                    points[:,0]*=(1+.075*weight)
                    points[:,2]+=.008*weight
                vi=a['bufferView'];data=bytearray(views[vi]);start=a.get('byteOffset',0);data[start:start+points.nbytes]=points.astype('<f4').tobytes();views[vi]=bytes(data)
                a['min']=points.min(0).tolist();a['max']=points.max(0).tolist()
                # Recompute smooth normals, welding position duplicates across
                # UV seams so the neckline does not gain artificial hard edges.
                ids=accessor(prim['indices']).reshape(-1,3);normals=np.zeros_like(points)
                triangles=points[ids];cross=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
                for col in range(3):np.add.at(normals,ids[:,col],cross)
                keys=np.round(points,6);_,inverse=np.unique(keys,axis=0,return_inverse=True);weld=np.zeros((inverse.max()+1,3),np.float32);np.add.at(weld,inverse,normals);normals=weld[inverse];normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-8)
                na=g['accessors'][prim['attributes']['NORMAL']];nv=bytearray(views[na['bufferView']]);start=na.get('byteOffset',0);nv[start:start+normals.nbytes]=normals.astype('<f4').tobytes();views[na['bufferView']]=bytes(nv)
                geometry.append({'mesh':mesh['name'],'changedVertices':int((weight>0).sum()),'maxDisplacementM':float(np.linalg.norm(points-old,axis=1).max())})
    g['extensionsUsed']=sorted(set(g.get('extensionsUsed',[])+['KHR_materials_specular','KHR_materials_clearcoat']))
    g['asset'].setdefault('extras',{})['surfaceRevision']='0.5.0; editable treatment in character-sources/makehuman/v0.5'
    chunks=[];offset=0
    for view,data in zip(g['bufferViews'],views):
        view['buffer']=0;view['byteOffset']=offset;view['byteLength']=len(data);chunks.append(data);offset+=len(data);pad=(-offset)%4;chunks.append(b'\0'*pad);offset+=pad
    g['buffers']=[{'byteLength':offset}];text=json.dumps(g,separators=(',',':')).encode();text+=b' '*((-len(text))%4);body=b''.join(chunks)
    result=struct.pack('<III',0x46546c67,2,28+len(text)+len(body))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(body),0x004e4942)+body
    target=ROOT/f'public/assets/makehuman-{kind}.glb';target.write_bytes(result)
    (OUT/f'{kind}-refined.glb').write_bytes(result)
    return {'kind':kind,'beforeBytes':len(raw),'afterBytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'newTextures':generated,'geometry':geometry,'jointsAndWeightsUnchanged':True}

if __name__=='__main__':
    reports=[refine(k) for k in ['soldier','civilian','combatant']]
    (OUT/'surface-manifest.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
    print(json.dumps(reports,indent=2))
