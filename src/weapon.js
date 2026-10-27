import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { STATIC_WEAPON_ASSETS } from './weapon-variants.js';
import { createAnimatedHands } from './first-person-hands.js';

export const WEAPON_DEFINITIONS = Object.freeze({
  m16a2: Object.freeze({ id: 'm16a2', name: 'M16A2 步枪', shortName: 'M16A2', category: 'rifle', fireMode: 'burst', burstCount: 3, damage: 39, recoil: .92, magSize: 30, fireInterval: .085, reloadTime: 2.05 }),
  m4a1: Object.freeze({ id: 'm4a1', name: 'M4A1 卡宾枪', shortName: 'M4A1', category: 'carbine', fireMode: 'auto', damage: 34, recoil: .80, magSize: 30, fireInterval: .09, reloadTime: 1.7 }),
  m249: Object.freeze({ id: 'm249', name: 'M249 支援机枪', shortName: 'M249', category: 'machinegun', fireMode: 'auto', damage: 31, recoil: .65, magSize: 100, fireInterval: .08, reloadTime: 4.2 }),
  ak: Object.freeze({ id: 'ak', name: 'AKM 突击步枪', shortName: 'AKM', category: 'rifle', fireMode: 'auto', damage: 41, recoil: 1.20, magSize: 30, fireInterval: .11, reloadTime: 2.4 }),
  mp5: Object.freeze({ id: 'mp5', name: 'MP5 冲锋枪', shortName: 'MP5', category: 'smg', fireMode: 'auto', damage: 24, recoil: .48, magSize: 30, fireInterval: .075, reloadTime: 1.9 }),
  m1911: Object.freeze({ id: 'm1911', name: 'M1911 手枪', shortName: 'M1911', category: 'pistol', fireMode: 'semi', damage: 46, recoil: 1.35, magSize: 7, fireInterval: .20, reloadTime: 1.65 }),
});
export const PLAYER_WEAPON_IDS = Object.freeze(['m16a2', 'm249', 'ak', 'mp5', 'm1911', 'm4a1']);

// Authored M4A1 by Firewarden3D, CC BY. First-person adaptation and arms are
// documented in public/assets/ASSET-SOURCES.md. All textures ship in the GLB.
const ASSET_SCALE = .5;
const NORMALIZED_OFFSET = new THREE.Vector3(0, -.061, -.1425);
const RIGHT_GRIP = [0, -.055, .005];
const LEFT_GRIP = [0, -.03635111, -.2725];
const MUZZLE = [0, -.0059699223, -.5625];
// The marker node is the rear-sight part origin, not the aperture. These are
// measured optical centers from the source rig's FP_TUNE, converted to metres.
const REAR_SIGHT = [0, .0639, -.015];
const FRONT_SIGHT = [0, .0592, -.395];
const SIGHT_PITCH = Math.atan2(REAR_SIGHT[1] - FRONT_SIGHT[1], REAR_SIGHT[2] - FRONT_SIGHT[2]);
let preparation;
let preparedScene;
let rifleTemplate;
let firstPersonTemplate;
let rifleBounds;
const rifleTemplates = new Map();
const viewTemplates = new Map();
const armSources = new Map();

function metadata() {
  return {
    weaponId: 'm4a1',
    asset: 'M4A1 · Firewarden3D',
    grips: { right: [...RIGHT_GRIP], left: [...LEFT_GRIP] },
    muzzle: [...MUZZLE],
    sight: [...REAR_SIGHT],
    frontSight: [...FRONT_SIGHT],
    sightPitch: SIGHT_PITCH,
    barrelDirection: [0, 0, -1],
    bounds: rifleBounds ? { min: rifleBounds.min.toArray(), max: rifleBounds.max.toArray() } : null,
    sharedGeometry: true,
  };
}

function markShared(root, { firstPerson = false } = {}) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.userData.sharedGeometry = true;
    object.userData.sharedMaterial = true;
    object.frustumCulled = false;
    object.castShadow = !firstPerson;
    object.receiveShadow = !firstPerson;
    object.renderOrder = firstPerson ? 5 : 0;
  });
  return root;
}

function prepareAuthoredVariant(gltf, id, sourceId, optical, anisotropy) {
  const scene = gltf.scene, sourceGun = scene.getObjectByName(`Gun_${sourceId}`);
  const sourceArms = scene.getObjectByName('FPArms'), gripR = scene.getObjectByName('GripR');
  if (!sourceGun || !sourceArms || !gripR) throw new Error(`${id} is missing its authored grip or geometry.`);
  scene.updateMatrixWorld(true);
  const offset = new THREE.Vector3(...RIGHT_GRIP).sub(gripR.getWorldPosition(new THREE.Vector3()).multiplyScalar(.5));
  const convert = point => new THREE.Vector3(...point).multiplyScalar(.5).add(offset).toArray();
  const materials = new Map();
  scene.traverse(object => {
    if (!object.isMesh) return;
    const tune = source => {
      if (materials.has(source)) return materials.get(source);
      const material = source.clone();
      material.envMapIntensity = .85;
      if (material.name === 'arms') { material.metalness = .02; material.roughness = 1; material.side = THREE.FrontSide; }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (material[key]) material[key].anisotropy = anisotropy;
      materials.set(source, material); return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tune) : tune(object.material);
  });
  const rifle = new THREE.Group(); rifle.name = `${id} authored firearm`;
  const gun = sourceGun.clone(true); gun.scale.multiplyScalar(.5); gun.position.multiplyScalar(.5).add(offset); rifle.add(gun);
  rifle.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(rifle), rear = convert(optical.rear), front = convert(optical.front);
  const gripL = scene.getObjectByName('GripL');
  const muzzle = scene.getObjectByName('MuzzleSocket').getWorldPosition(new THREE.Vector3());
  rifle.userData = { weaponId: id, asset: optical.credit, grips: { right: [...RIGHT_GRIP], left: gripL ? convert(gripL.getWorldPosition(new THREE.Vector3()).toArray()) : [-.018, -.060, .005] },
    muzzle: convert(muzzle.toArray()), sight: rear, frontSight: front, sightPitch: Math.atan2(rear[1] - front[1], rear[2] - front[2]),
    hipPosition: id === 'm1911' ? [.14, -.12, -.40] : [.22, -.215, -.29], adsDepth: id === 'm1911' ? -.48 : -.35,
    barrelDirection: [0, 0, -1], bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, sharedGeometry: true };
  markShared(rifle); rifleTemplates.set(id, rifle);
  const view = new THREE.Group(); view.name = `${id} authored first-person rig`;
  view.add(rifle.clone(true));
  armSources.set(id,{source:scene,offset});
  view.userData = structuredClone(rifle.userData); markShared(view, { firstPerson: true }); viewTemplates.set(id, view);
}

function prepareStaticVariant(gltf, id, info, arms, anisotropy) {
  const rifle = new THREE.Group(); rifle.name = info.credit;
  const authored = gltf.scene.clone(true);
  if (info.offset) authored.position.add(new THREE.Vector3(...info.offset));
  rifle.add(authored);
  const tuned = new Map();
  rifle.traverse(object => {
    if (!object.isMesh) return;
    const materialFor = source => {
      if (tuned.has(source)) return tuned.get(source);
      const material = source.clone(); material.envMapIntensity = .8;
      // PBR masks retain the distinction between bare metal and non-metals.
      // Canvas, polymer and brass additions have their own authored materials;
      // they must not inherit the receiver's colour or metallic response.
      if (id === 'm249' && /original steel atlas/.test(material.name)) {
        material.color.multiplyScalar(.66); material.metalness *= .88;
      }
      if (id === 'm249' && /polymer grip/.test(material.name)) {
        material.color.multiplyScalar(.57); material.metalness = 0;
        material.roughness = 1;
      }
      if (id === 'm16a2') material.color.multiplyScalar(.75);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (material[key]) material[key].anisotropy = anisotropy;
      tuned.set(source, material); return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(materialFor) : materialFor(object.material);
  });
  const bounds = new THREE.Box3().setFromObject(rifle);
  rifle.userData = { weaponId: id, asset: info.credit, grips: { right: [...RIGHT_GRIP], left: [...info.left] }, muzzle: [...info.muzzle], sight: [...info.rear], frontSight: [...info.front], sightPitch: Math.atan2(info.rear[1] - info.front[1], info.rear[2] - info.front[2]), barrelDirection: [0, 0, -1], bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, sharedGeometry: true };
  markShared(rifle); rifleTemplates.set(id, rifle);
  const view = new THREE.Group(); view.name = id + ' articulated first-person rig';
  view.add(rifle.clone(true)); view.userData = structuredClone(rifle.userData);
  markShared(view, { firstPerson: true }); viewTemplates.set(id, view);
  armSources.set(id, armSources.get('m4a1'));
}

/** Load once before createWorld(), so NPCs and the view model share one asset. */
export async function prepareWeapon(renderer) {
  if (preparedScene && viewTemplates.size === PLAYER_WEAPON_IDS.length) return metadata();
  if (!preparation) preparation = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Relative to the HTML, so local desktop builds load the bundled asset too.
    const base = new URL('assets/m4a1-real.glb', document.baseURI).href;
    const gltf = await loader.loadAsync(base);
    const authoredRifle = gltf.scene.getObjectByName('Gun_m4a1');
    const authoredArms = gltf.scene.getObjectByName('FPArms');
    if (!authoredRifle || !authoredArms) throw new Error('M4A1 asset is missing its rifle or first-person arms.');

    const materials = new Map();
    const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const tuned = sourceMaterials.map(source => {
        if (!materials.has(source)) {
          const material = source.clone();
          // Preserve the authored black metal, polymer and edge wear. Scene
          // lighting illuminates the actual PBR maps rather than flat recoloring.
          material.envMapIntensity = .9;
          if (material.name === 'M_M4A1') material.color.setScalar(.42);
          if (material.name === 'arms') {
            material.metalness = .02;
            material.roughness = 1;
            material.side = THREE.FrontSide;
          }
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
            if (material[key]) material[key].anisotropy = anisotropy;
          }
          materials.set(source, material);
        }
        return materials.get(source);
      });
      object.material = Array.isArray(object.material) ? tuned : tuned[0];
    });
    gltf.scene.updateMatrixWorld(true);
    preparedScene = gltf.scene;

    rifleTemplate = new THREE.Group();
    rifleTemplate.name = 'M4A1 authored rifle';
    const gun = authoredRifle.clone(true);
    gun.scale.multiplyScalar(ASSET_SCALE);
    gun.position.multiplyScalar(ASSET_SCALE).add(NORMALIZED_OFFSET);
    rifleTemplate.add(gun);
    rifleTemplate.updateMatrixWorld(true);
    rifleBounds = new THREE.Box3().setFromObject(rifleTemplate);
    rifleTemplate.userData = metadata();
    markShared(rifleTemplate);

    // Keep the source skin available for per-instance hand and finger movement.
    // Only the gun is cloned here; createWeapon attaches its live arm rig.
    firstPersonTemplate = new THREE.Group();
    firstPersonTemplate.name = 'M4A1 authored first-person rig';
    firstPersonTemplate.add(rifleTemplate.clone(true));
    armSources.set('m4a1',{source:gltf.scene,offset:NORMALIZED_OFFSET.clone()});
    markShared(firstPersonTemplate, { firstPerson: true });
    firstPersonTemplate.userData = metadata();
    rifleTemplates.set('m4a1', rifleTemplate);
    viewTemplates.set('m4a1', firstPersonTemplate);
    const staticEntries = Object.entries(STATIC_WEAPON_ASSETS);
    const additional = await Promise.all([
      loader.loadAsync(new URL('assets/mp5-real.glb', document.baseURI).href),
      loader.loadAsync(new URL('assets/m1911-real.glb', document.baseURI).href),
      ...staticEntries.map(([, info]) => loader.loadAsync(new URL(`assets/${info.file}`, document.baseURI).href)),
    ]);
    prepareAuthoredVariant(additional[0], 'mp5', 'mp5a5', { rear: [0, .238, .0978], front: [0, .254, -.5722], credit: 'MP5 · Rotuma · CC BY 4.0' }, anisotropy);
    prepareAuthoredVariant(additional[1], 'm1911', 'm1911', { rear: [0, .1297, .1299], front: [0, .1287, -.1954], credit: 'M1911 · egorbelous · CC BY 4.0' }, anisotropy);
    staticEntries.forEach(([id, info], index) => prepareStaticVariant(additional[index + 2], id, info, null, anisotropy));
    return metadata();
  })().catch(error => {
    preparation = null;
    preparedScene = null;
    throw error;
  });
  return preparation;
}

/** Y-up, muzzle points -Z, right grip is [0,-.055,.005], real length 0.84 m. */
export function createRifle(id = 'm4a1') {
  if (!rifleTemplate) throw new Error('Call prepareWeapon() before createRifle().');
  const template = rifleTemplates.get(id);
  if (!template) throw new Error(`Unknown weapon: ${id}`);
  const rifle = template.clone(true);
  rifle.userData = structuredClone(template.userData);
  rifle.userData.getMuzzlePosition = (target = new THREE.Vector3()) => {
    rifle.updateWorldMatrix(true, false);
    return rifle.localToWorld(target.fromArray(rifle.userData.muzzle));
  };
  return markShared(rifle);
}

// Only separated source parts with a verified firing role are animated.
// The M1911 source calls its full upper slide ChargingHandle; its 0.19m
// geometry is the slide. M4/MP5 handles do not cycle during firing, and the
// M249 asset has no separated bolt, so those models keep their authored mesh.
export const WEAPON_FIRE_PARTS=Object.freeze({
  m16a2:Object.freeze({name:'BoltCarrier',role:'bolt',stroke:.018,attack:.010,hold:.008,duration:.085}),
  ak:Object.freeze({name:'ChargingHandle',role:'reciprocating-handle',stroke:.026,attack:.013,hold:.009,duration:.105}),
  m1911:Object.freeze({name:'ChargingHandle',role:'slide',stroke:.023,attack:.012,hold:.012,duration:.110}),
});
function createFireMechanism(view,id){
  const spec=WEAPON_FIRE_PARTS[id],part=spec?view.getObjectByName(spec.name):null;
  // createAnimatedHands already owns the reload pivot in view-local metres.
  // Apply the firing offset after its baseline reset, never reparent it again.
  const pivot=part?.parent?.name==='bolt animation pivot'?part.parent:null;
  let elapsed=Infinity,cycles=0,offset=0;
  const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
  const inspect=()=>({supported:Boolean(pivot),part:part?.name||null,role:pivot?spec.role:null,cycles,offset,active:Boolean(pivot&&elapsed<spec.duration)});
  return {
    fire(){if(pivot){elapsed=0;cycles++;}},
    reset(){elapsed=Infinity;cycles=0;offset=0;},
    update({dt=0,reload=0}={}){
      offset=0;if(!pivot)return;
      if(reload>0&&reload<1){elapsed=Infinity;return;}
      if(Number.isFinite(dt)&&dt>0)elapsed+=dt;
      if(elapsed>=spec.duration)return;
      const pulse=elapsed<spec.attack?smooth(elapsed/spec.attack):elapsed<spec.attack+spec.hold?1:1-smooth((elapsed-spec.attack-spec.hold)/(spec.duration-spec.attack-spec.hold));
      offset=spec.stroke*pulse;pivot.position.z+=offset;
      view.updateWorldMatrix(true,true);
    },inspect,
  };
}

/** Same rifle and textures as NPCs, with authored hands instead of primitive tubes. */
export function createWeapon(camera, initialId = PLAYER_WEAPON_IDS[0]) {
  if (!firstPersonTemplate) throw new Error('Call prepareWeapon() before createWeapon().');
  const group = new THREE.Group();
  group.name = 'first-person-M4A1';
  group.position.set(.23, -.24, -.32);
  group.userData = metadata();
  let rig = cloneSkeleton(firstPersonTemplate);
  let hands, mechanism, pendingShot=false;
  const liveViews=new Map();
  group.add(rig);
  markShared(rig, { firstPerson: true });

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd79a, transparent: true, opacity: .8, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.027, .12, 6), flashMaterial);
  flash.name = 'M4A1 muzzle flash';
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(...MUZZLE);
  flash.position.z -= .045;
  flash.visible = false;
  flash.renderOrder = 6;
  group.add(flash);
  camera.add(group);
  const muzzle = new THREE.Vector3(...MUZZLE), sight = new THREE.Vector3(...REAR_SIGHT);
  const getMuzzlePosition = (target = new THREE.Vector3()) => {
    group.updateWorldMatrix(true, false);
    return group.localToWorld(target.fromArray(group.userData.muzzle));
  };
  const setWeapon = id => {
    const template = viewTemplates.get(id);
    if (!template) throw new Error(`Unknown weapon: ${id}`);
    group.remove(rig);
    let live=liveViews.get(id);
    if(!live){
      const view=cloneSkeleton(template);view.userData=structuredClone(template.userData);
      const animation=createAnimatedHands({...armSources.get(id),weapon:view,rifle:view.children[0],id});
      live={rig:view,hands:animation,mechanism:createFireMechanism(view,id)};liveViews.set(id,live);
    }
    rig=live.rig;hands=live.hands;mechanism=live.mechanism;pendingShot=false;mechanism.reset();hands.update({reload:0,dt:1});
    markShared(rig, { firstPerson: true });
    group.add(rig);
    group.name = `first-person-${id}`;
    group.userData = { ...structuredClone(template.userData), definition: WEAPON_DEFINITIONS[id], getMuzzlePosition, setWeapon };
    muzzle.fromArray(group.userData.muzzle);
    sight.fromArray(group.userData.sight);
    flash.position.copy(muzzle); flash.position.z -= .045;
    flash.name = `${id} muzzle flash`; flash.visible = false;
    return WEAPON_DEFINITIONS[id];
  };
  setWeapon(initialId);
  return { group, flash, muzzle, sight, setWeapon, getMuzzlePosition, definitions: WEAPON_DEFINITIONS,
    // The main loop owns the complete rig recoil; only hands and separated
    // mechanisms move here. This leaves the grip relationship intact.
    update(pose={}){hands.update({...pose,shot:pendingShot});mechanism.update(pose);pendingShot=false;},
    fire(){pendingShot=true;mechanism.fire();},inspectHands(){return {...hands.inspect(),mechanism:mechanism.inspect()};} };
}
