import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareWeapon,createWeapon,createRifle,PLAYER_WEAPON_IDS,WEAPON_FIRE_PARTS} from '../src/weapon.js';

// The shipped geometry, skeletons, named parts and bind transforms are real.
// Images alone are omitted so this regression needs neither a DOM nor a GPU.
function geometryOnlyGLB(file){
  const bytes=fs.readFileSync(file),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+length)),binary=bytes.subarray(28+length);
  delete json.images;delete json.textures;delete json.samplers;
  function stripTextures(object){if(!object||typeof object!=='object')return;for(const key of Object.keys(object)){if(key.endsWith('Texture'))delete object[key];else stripTextures(object[key]);}}
  for(const material of json.materials||[])stripTextures(material);
  const raw=Buffer.from(JSON.stringify(json)),text=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+binary.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binaryHeader.writeUInt32LE(binary.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  return Uint8Array.from(Buffer.concat([header,text,binaryHeader,binary])).buffer;
}
const vectorDistance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function assertHandsConnected(pose){
  assert.equal(pose.bones,68);
  for(const arm of Object.values(pose.arms)){
    assert(arm.wristGap<.00001,'The existing wrist/forearm connection must remain closed');
    for(const p of[arm.shoulder,arm.elbow,arm.wrist,...arm.fingers.map(f=>f.position)])assert(p.every(Number.isFinite));
  }
}

test('actual six-gun assets retain articulated grips and complete reload paths while firing parts cycle',async t=>{
  const previousDocument=globalThis.document;
  globalThis.document={baseURI:new URL('../public/',import.meta.url).href};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  t.mock.method(GLTFLoader.prototype,'loadAsync',async function(url){return this.parseAsync(geometryOnlyGLB(fileURLToPath(url)),'');});
  await prepareWeapon();const camera=new THREE.PerspectiveCamera(74,1.6,.05,500),controller=createWeapon(camera);
  const stableGroup=controller.group,stableFlash=controller.flash;
  for(const id of PLAYER_WEAPON_IDS)await t.test(id,()=>{
    controller.setWeapon(id);controller.update({dt:.1,reload:0});const baseline=controller.inspectHands();assertHandsConnected(baseline);assert.equal(baseline.shotPulse,0);
    const position=controller.group.position.clone(),rotation=controller.group.quaternion.clone(),rig=controller.group.children.find(c=>c!==controller.flash);
    const spec=WEAPON_FIRE_PARTS[id],part=spec?rig.getObjectByName(spec.name):null,partHome=part?.parent.position.clone();
    const independent=createRifle(id),independentNode=spec?independent.getObjectByName(spec.name):null,independentHome=independentNode?.position.clone();
    controller.fire();controller.update({dt:.015,reload:0});const fired=controller.inspectHands();assertHandsConnected(fired);assert.equal(fired.shotPulse,1);
    assert(vectorDistance(fired.arms.R.fingers.find(f=>f.joint===7).position,baseline.arms.R.fingers.find(f=>f.joint===7).position)>.0001,'The actual trigger finger must articulate');
    assert(vectorDistance(fired.rightWrist,baseline.rightWrist)<1e-6);assert(vectorDistance(fired.leftWrist,baseline.leftWrist)<1e-6,'Firing cannot detach the support hand from its grip');
    assert.deepEqual(controller.group.position,position);assert.deepEqual(controller.group.quaternion.toArray(),rotation.toArray(),'Body recoil belongs solely to main; weapon controller must not double it');
    assert.equal(fired.mechanism.supported,Boolean(spec));
    if(spec){assert.equal(fired.mechanism.part,spec.name);assert(fired.mechanism.offset>0&&fired.mechanism.offset<=spec.stroke);assert(Math.abs(part.parent.position.z-partHome.z-fired.mechanism.offset)<1e-10);assert.deepEqual(independentNode.position,independentHome,'View cycling cannot modify a shared NPC firearm');}
    // A longer frame returns the mechanism to rest, without a stale translated
    // node accumulating another offset on the following animation update.
    controller.update({dt:.3,reload:0});assert.equal(controller.inspectHands().mechanism.offset,0);if(part)assert.deepEqual(part.parent.position,partHome);
    const stages=new Set(),magazineTravel=[];
    controller.fire();
    for(const phase of[.12,.19,.34,.48,.54,.72,.83,.90,.98]){
      controller.update({dt:.016,reload:phase});const pose=controller.inspectHands();assertHandsConnected(pose);stages.add(pose.stage);assert.equal(pose.mechanism.offset,0,'Reload owns the same bolt pivot exclusively');
      assert(pose.magazine?.every(Number.isFinite));magazineTravel.push(vectorDistance(pose.magazine,baseline.magazine));
    }
    for(const stage of['reach','remove','retrieve','insert','settle','return'])assert(stages.has(stage),id+' '+stage);
    assert(Math.max(...magazineTravel)>.2,'The authored magazine must leave the well and visit its pouch path');
    controller.update({dt:1,reload:0});const returned=controller.inspectHands();assertHandsConnected(returned);assert.equal(returned.stage,'hold');assert.equal(returned.shotPulse,0);assert(vectorDistance(returned.magazine,baseline.magazine)<1e-8);
    if(part)assert.deepEqual(part.parent.position,partHome);
    assert.equal(controller.group,stableGroup);assert.equal(controller.flash,stableFlash);assert.equal(controller.group.children.length,2);
    const expected=controller.group.localToWorld(new THREE.Vector3(...controller.group.userData.muzzle));assert(expected.distanceTo(controller.getMuzzlePosition())<1e-9);
  });
  // Returning to a cached live rig must not retain its old firing finger or bolt.
  controller.setWeapon('ak');controller.fire();controller.update({dt:.015});controller.setWeapon('mp5');controller.setWeapon('ak');
  const returned=controller.inspectHands();assert.equal(returned.shotPulse,0);assert.equal(returned.mechanism.offset,0);assert.equal(returned.mechanism.active,false);assertHandsConnected(returned);
});
