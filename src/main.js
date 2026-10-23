import * as THREE from 'three';
import { createWorld } from './world.js';
import { CHAPTERS, INITIAL_RESOURCES, getEpilogue } from './story.js';
import { UI } from './ui.js';
import { Soundscape } from './audio.js';
import { createWeapon, createRifle, prepareWeapon, WEAPON_DEFINITIONS, PLAYER_WEAPON_IDS } from './weapon.js';
import { emptyMagazines, loadedRounds, selectMagazine, roundsToLoad, nextWeapon } from './loadout.js';
import { createCinema } from './cinema.js';
import { createBattleAtmosphere } from './battle-atmosphere.js';
import { createActorDirector } from './actor-behavior.js';
import { createCombatFeedback } from './combat-feedback.js';
import { createTacticalSmoke } from './tactical-smoke.js';
import { createFieldInteractions } from './field-interactions.js';
import { createFieldFlashlight } from './field-flashlight.js';
import { traceObstacles, nearestOnSegment } from './ballistics.js';
import { newCampaign, choose, canChoose, checkpoint, restoreChapter, readCampaign, saveCampaign, SETTINGS_KEY, clamp, movePlayer, lineBlocked, canFire } from './simulation.js';
import './style.css';

const canvas=document.getElementById('game');
const ui=new UI(action),audio=new Soundscape();
let world,renderer,camera,scene,weapon,weaponController,flash,cinema,battleAtmosphere,actorDirector,aircraftPressure=0,mode='loading',state=readCampaign(localStorage),chapter=null;
const defaultWeaponId=PLAYER_WEAPON_IDS[0];
let stowedMagazines=emptyMagazines(PLAYER_WEAPON_IDS);
let demoSession=false,demoReturnState=null;
const weaponInfo=()=>WEAPON_DEFINITIONS[player.weaponId||defaultWeaponId];
const allLoaded=()=>loadedRounds(player.mag,stowedMagazines);
const physicalColliders=()=>[...gameColliders,...(fieldInteractions?.getColliders()||[])];
let settings={graphicsVersion:2,quality:'high',renderScale:1,sensitivity:1,volume:.48,aircraftVolume:1,battleVolume:1,headbob:true,gentle:false};
try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(saved&&typeof saved==='object'){if(saved.graphicsVersion===2&&['low','medium','high'].includes(saved.quality))settings.quality=saved.quality;if([.75,1,1.25,1.5].includes(saved.renderScale))settings.renderScale=saved.renderScale;for(const k of ['sensitivity','volume','aircraftVolume','battleVolume'])if(Number.isFinite(saved[k]))settings[k]=clamp(saved[k],k==='sensitivity'?.3:0,k==='sensitivity'?2:1);for(const k of ['headbob','gentle'])if(typeof saved[k]==='boolean')settings[k]=saved[k];}}catch{}
let player={x:0,z:65,y:1.68,yaw:0,pitch:0,health:100,stamina:100,mag:0},keys=new Set(),mouseDown=false,burstRemaining=0,aiming=false,dragging=false;
let taskIndex=0,interaction=0,enemies=[],actors=[],tasks=[],effects=[],companion=null,escort=null,carrying=false,assistUsed=false,gameColliders=[];
let cooldown=0,reloading=0,recoil=0,muzzleFlashTime=0,elapsed=0,lastTime=0,stepTimer=0,chapterTime=0,radioIndex=0,radioTimer=0,hitTimer=0,cinematic=0,nearMissShock=0,nearMissPan=0,nearMissAt=0;
let previousPage='menu',lookWarning=false,menuTime=0,lastBattleCallout=-100;
let combatFeedback,tacticalSmoke,fieldInteractions,fieldFlashlight,flashlightOn=false,smokeCharges=0,squadOrder='follow',damageFlash=0,damageAngle=0,killConfirm=false,fieldPrompt=null;
const shotLog=[];
const casualtyBounds=new THREE.Box3();
const casualtyVertex=new THREE.Vector3(),referencedVertices=new WeakMap();
let galleryScene=null,galleryActor=null,galleryKind='soldier',galleryClose=false,galleryAngle=0,galleryDrag=false;
const tempVector=new THREE.Vector3(),raycaster=new THREE.Raycaster(),forward=new THREE.Vector3(),clockDirection=new THREE.Vector3();
const debugEnabled=new URLSearchParams(location.search).has('qa');

function setMode(next){mode=next;keys.clear();mouseDown=false;aiming=false;dragging=false;interaction=0;recoil=0;fieldInteractions?.cancel();fieldFlashlight?.setEnabled(next==='playing'&&flashlightOn);audio.pause(next!=='playing');if(next!=='playing'){if(document.pointerLockElement)document.exitPointerLock();ui.waypoint(0,0,0,false);ui.interaction(null,0,false);}ui.mode(next);}
function save(){if(demoSession)return;if(state&&!saveCampaign(localStorage,state))ui.toast('本机存储不可用：当前进度仅在本次运行中保留。',6000);}
function resizeRender(){
  const maxDimension=Math.min(renderer.capabilities.maxTextureSize,8192);
  const ratio=Math.min(devicePixelRatio*settings.renderScale,maxDimension/innerWidth,maxDimension/innerHeight,Math.sqrt(16777216/(innerWidth*innerHeight)));
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
  cinema?.setQuality(settings.quality);
  const output=document.getElementById('render-resolution');
  if(output)output.textContent=`${canvas.width} × ${canvas.height} · ${Math.round(ratio/devicePixelRatio*100)}% 渲染比例`;
}
function applySettings(){if(!renderer)return;resizeRender();renderer.shadowMap.enabled=true;renderer.shadowMap.type=settings.quality==='low'?THREE.BasicShadowMap:THREE.PCFSoftShadowMap;scene?.traverse(o=>{if(o.isDirectionalLight&&o.shadow){o.castShadow=settings.quality!=='low';const size=Math.min(settings.quality==='high'?4096:2048,renderer.capabilities.maxTextureSize);if(o.shadow.mapSize.x!==size){o.shadow.mapSize.set(size,size);o.shadow.map?.dispose();o.shadow.map=null;}o.shadow.needsUpdate=true;}});renderer.shadowMap.needsUpdate=true;fieldFlashlight?.setQuality(settings.quality);audio.setVolume(settings.volume);audio.setMix?.({aircraft:settings.aircraftVolume,battle:settings.battleVolume});try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}
function menuScene(){
  audio.reset?.();fieldInteractions?.clear();tacticalSmoke?.reset();combatFeedback?.reset();
  actorDirector?.reset();world.clearDynamic();enemies=[];actors=[];shotLog.length=0;gameColliders=[...world.colliders];
  effects.forEach(e=>{scene.remove(e.obj);e.obj.geometry?.dispose();e.obj.material?.dispose();});effects=[];world.setMood('dusk');
  for(const[kind,pos]of[['wreck',[2,-12]],['vehicle',[8,9]]]){const prop=world.createProp(kind,pos);gameColliders.push(...(prop.userData.collisionBounds||[]));}
  for(const[id,pos]of[['menu-watch',[5,-7]],['menu-cross',[-5,-24]]]){const actor=world.createActor('soldier',pos,'撤离警戒队员');actors.push(actor);actorDirector?.add(actor,{id,kind:'soldier',role:'guard',anchor:pos,tether:4});}
  weapon.visible=false;
}
function disposeGallery(){if(!galleryScene)return;if(galleryActor)world?.destroyActor?.(galleryActor);galleryScene.traverse(o=>{if(o.isLight)o.shadow?.map?.dispose();if(o.userData.galleryDisposable){o.geometry?.dispose();o.material?.dispose();}});galleryScene.clear();galleryScene=null;galleryActor=null;}
function showMenu(){if(demoSession){state=demoReturnState;demoReturnState=null;demoSession=false;}disposeGallery();setMode('menu');chapter=null;menuScene();ui.main(Boolean(state));}
const galleryWeaponId=kind=>kind==='rifle'?'m4a1':PLAYER_WEAPON_IDS.includes(kind)?kind:null;
function showGallery(kind='soldier',close=false){
  audio.reset?.();fieldInteractions?.clear();tacticalSmoke?.reset();combatFeedback?.reset();
  disposeGallery();actorDirector?.reset();galleryKind=kind;galleryClose=close;chapter=null;setMode('gallery');world.clearDynamic();weapon.visible=false;
  galleryScene=new THREE.Scene();galleryScene.background=new THREE.Color('#29312e');galleryScene.environment=scene.environment;galleryScene.environmentIntensity=.7;
  const ambient=new THREE.HemisphereLight('#e5ebdf','#6a6150',1.4);galleryScene.add(ambient);
  const key=new THREE.DirectionalLight('#fff2dd',3.0);key.position.set(3,4,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=4;key.shadow.camera.bottom=-2;key.shadow.normalBias=.02;galleryScene.add(key);
  const rim=new THREE.DirectionalLight('#a3bbc5',2.0);rim.position.set(-3,3,-2);galleryScene.add(rim);
  const fill=new THREE.DirectionalLight('#ddd7c7',.6);fill.position.set(-2,2,4);galleryScene.add(fill);
  const weaponId=galleryWeaponId(kind);
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,.05,80),new THREE.MeshStandardMaterial({color:'#42463e',roughness:.93}));floor.position.y=weaponId?-.31:-.04;floor.receiveShadow=true;floor.userData.galleryDisposable=true;galleryScene.add(floor);
  if(weaponId){galleryActor=new THREE.Group();const rifle=createRifle(weaponId);rifle.rotation.y=Math.PI/2;rifle.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(rifle),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());rifle.position.sub(center);galleryActor.add(rifle);galleryActor.userData.gallerySize=size.toArray();}else galleryActor=world.createActor(kind,[0,0],kind==='soldier'?'游骑兵造型':kind==='enemy'?'武装人员造型':'居民造型');galleryScene.add(galleryActor);galleryAngle=weaponId?-.28:kind==='soldier'?.2:-.15;
  renderer.toneMappingExposure=1.0;ui.gallery(kind,close);
}
function beginNew(){state=newCampaign(INITIAL_RESOURCES);save();loadChapter(0);}
function beginBattleDemo(){demoReturnState=state?structuredClone(state):null;demoSession=true;state=newCampaign(INITIAL_RESOURCES);loadChapter(5);}
function loadChapter(index,{restore=false}={}){
  audio.reset?.();fieldInteractions?.clear();tacticalSmoke?.reset();combatFeedback?.reset();damageFlash=0;killConfirm=false;fieldPrompt=null;
  if(!state)state=newCampaign(INITIAL_RESOURCES);
  if(restore&&!restoreChapter(state,index)){ui.toast('这一章还没有可用的检查点。');return;}
  chapter=CHAPTERS[index];state.chapter=index;checkpoint(state,index);save();
  smokeCharges=chapter.armed&&chapter.hostiles.length?2:0;squadOrder='follow';flashlightOn=false;fieldFlashlight?.setEnabled(false);tacticalSmoke?.setMood(chapter.mood);
  actorDirector?.reset();shotLog.length=0;lastBattleCallout=-100;battleAtmosphere?.reset?.();world.clearDynamic();for(const e of effects){scene.remove(e.obj);e.obj.geometry?.dispose();e.obj.material?.dispose();}effects=[];world.setMood(chapter.mood);
  player={x:chapter.spawn[0],z:chapter.spawn[1],y:1.68,yaw:chapter.facing,pitch:0,health:100,stamina:100,mag:0,weaponId:defaultWeaponId};
  stowedMagazines=emptyMagazines(PLAYER_WEAPON_IDS);weaponController.setWeapon(defaultWeaponId);muzzleFlashTime=0;
  if(chapter.armed){player.mag=Math.min(weaponInfo().magSize,state.resources.ammo);state.resources.ammo-=player.mag;}
  taskIndex=0;interaction=0;cooldown=0;reloading=0;recoil=0;nearMissShock=0;nearMissAt=0;chapterTime=0;radioIndex=0;radioTimer=3;assistUsed=false;escort=null;carrying=false;actors=[];enemies=[];
  gameColliders=[...world.colliders];
  tasks=chapter.tasks.map(t=>{const actor=t.kind==='civilian'||t.kind==='wounded'||/meet-|miller|survivor|reassure/.test(t.id);const obj=actor?world.createActor(t.kind==='wounded'?'wounded':t.kind==='civilian'?'civilian':'soldier',t.pos,t.label):world.createProp(t.kind,t.pos);if(actor){actors.push(obj);obj.userData.taskId=t.id;}if(obj.userData.collisionBounds)gameColliders.push(...obj.userData.collisionBounds);return{...t,obj,done:false};});
  if(chapter.id===1){const neighbor=world.createActor('civilian',[4.2,43],'同行的邻居');actors.push(neighbor);}
  if([2,3,16].includes(chapter.id)){
    for(const [x,z] of [[-6,60],[6,30],[-6,-12],[6,-50]]){world.createProp(chapter.id===16?'memorial':'supplies',[x,z]);const a=world.createActor('soldier',[x,z+3],'基地队员');a.rotation.y=x<0?Math.PI/2:-Math.PI/2;actors.push(a);}
  }
  if(chapter.armed){companion=world.createActor('soldier',[player.x+2.5,player.z+2],'同伴');actors.push(companion);}else companion=null;
  for(const spec of chapter.hostiles){const obj=world.createActor('enemy',spec.pos,'武装人员');if(spec.lookAt)obj.rotation.y=Math.atan2(spec.lookAt[0]-spec.pos[0],spec.lookAt[1]-spec.pos[1]);enemies.push({obj,x:spec.pos[0],z:spec.pos[1],health:100,fireAt:4+Math.random()*3,phase:Math.random()*6,alive:true,encounter:spec});}
  if(chapter.id>=6&&!tasks.some(t=>t.kind==='wreck')){const wreck=world.createProp('wreck',[5,-20]);if(wreck.userData.collisionBounds)gameColliders.push(...wreck.userData.collisionBounds);}
  if(chapter.id===12||chapter.id===11)world.createProp('light',[-4,chapter.spawn[1]-4]);
  if(chapter.hostiles.length){
    for(const[offset,id]of[[[-2.1,1.2],'cover'],[[1.1,4.3],'rear']]){const actor=world.createActor('soldier',[player.x+offset[0],player.z+offset[1]],id==='cover'?'掩护队员':'后方警戒队员');actor.userData.squadRole=id;actors.push(actor);}
  }
  for(let i=0;i<actors.length;i++){
    const actor=actors[i],kind=actor.userData.kind;if(kind==='wounded')continue;
    const task=tasks.find(t=>t.obj===actor),role=kind==='civilian'?'civilian':actor===companion||actor.userData.squadRole?'companion':task?'story':'guard';
    actorDirector.add(actor,{id:task?'story-'+task.id:actor===companion?'squad-lead':actor.userData.squadRole?'squad-'+actor.userData.squadRole:'guard-'+i,kind,role,anchor:[actor.position.x,actor.position.z],tether:task?1.5:4,follow:role==='companion'});
  }
  for(let i=0;i<enemies.length;i++){const enemy=enemies[i];actorDirector.add(enemy.obj,{id:'enemy-'+i,kind:'enemy',role:'enemy',anchor:[enemy.x,enemy.z],entity:enemy,encounter:enemy.encounter});}
  fieldInteractions?.reset({chapter});weapon.visible=chapter.armed;updateCamera(0);setMode('intro');ui.intro(chapter,state.resources);ui.mission(chapter,tasks[0],0);
}
function play(){if(!chapter)return;setMode('playing');audio.start();audio.setVolume(settings.volume);ui.mission(chapter,tasks[taskIndex],taskIndex);requestLock();ui.toast(chapter.mood==='night'?'夜间行动 · T 开关手电 · 留意火光与金色目标':chapter.armed?`WASD 移动 · 左键射击 · 1—${PLAYER_WEAPON_IDS.length} 切枪 · E 互动 · Q 烟幕 · F 小队`:'WASD 移动 · 鼠标观察 · 靠近目标后按住 E',6500);if(chapter.id===4&&taskIndex===0){cinematic=3.5;ui.subtitle('机组','保持间距。落地后跟紧身边的人。',3500);}}
function requestLock(){if(debugEnabled)return;try{const request=canvas.requestPointerLock();request?.catch(()=>{if(!lookWarning){ui.toast('点击画面锁定鼠标；也可按住右键拖动观察。');lookWarning=true;}});}catch{}}
function pause(){if(mode!=='playing')return;setMode('paused');ui.pause(chapter);}
function resume(){if(!chapter){showMenu();return;}setMode('playing');ui.mission(chapter,tasks[taskIndex],taskIndex);requestLock();}
function action(name,value){
  audio.click();
  if(name==='new'){if(state){setMode('confirm');ui.confirmNew();}else beginNew();}
  else if(name==='combat-demo')beginBattleDemo();
  else if(name==='confirm-new')beginNew();
  else if(name==='continue'){if(state?.completed){setMode('ending');ui.ending(getEpilogue(state));}else loadChapter(state?.chapter||0,{restore:Boolean(state?.checkpoints?.[state?.chapter||0])});}
  else if(name==='play')play();
  else if(name==='resume')resume();
  else if(name==='restart')loadChapter(chapter?.id-1||0,{restore:true});
  else if(name==='menu'){if(chapter&&mode!=='debrief'&&mode!=='ending'&&state.checkpoints[chapter.id-1]){restoreChapter(state,chapter.id-1);save();}showMenu();}
  else if(name==='settings'){previousPage=chapter?(mode==='intro'?'intro':'paused'):'menu';setMode('settings');ui.settings(settings);resizeRender();}
  else if(name==='setting'){settings[value.key]=['sensitivity','volume','aircraftVolume','battleVolume','renderScale'].includes(value.key)?Number(value.value):value.value;applySettings();}
  else if(name==='chapters'){previousPage='menu';setMode('chapters');ui.chapters(CHAPTERS,state?.unlocked||1);}
  else if(name==='chapter'){const n=Number(value);if(n<(state?.unlocked||1)){if(!state)beginNew();else loadChapter(n,{restore:Boolean(state.checkpoints[n])});}}
  else if(name==='journal'){previousPage=mode==='ending'?'ending':chapter?'paused':'menu';setMode('journal');ui.journal(state||newCampaign(INITIAL_RESOURCES));}
  else if(name==='about'){previousPage='menu';setMode('about');ui.about();}
  else if(name==='gallery')showGallery();
  else if(name==='gallery-kind')showGallery(value,galleryClose);
  else if(name==='gallery-close')showGallery(galleryKind,!galleryClose);
  else if(name==='back'){if(previousPage==='ending'){setMode('ending');ui.ending(getEpilogue(state));}else if(previousPage==='intro'){setMode('intro');ui.intro(chapter,state.resources);}else if(previousPage==='paused'&&chapter){setMode('paused');ui.pause(chapter);}else showMenu();}
  else if(name==='choose'&&mode==='choice'){
    const option=chapter.choice.options[Number(value)];if(!option)return;
    if(!canChoose({...state.resources,ammo:state.resources.ammo+allLoaded()},option)){ui.toast('物资不足，请选择另一种帮助方式。');return;}
    state.resources.ammo=Math.min(240,state.resources.ammo+allLoaded());player.mag=0;stowedMagazines=emptyMagazines(PLAYER_WEAPON_IDS);
    choose(state,chapter,option);save();setMode('debrief');audio.complete();ui.debrief(chapter,option,state);
  }
  else if(name==='next'){if(demoSession){showMenu();}else if(chapter.id===16){setMode('ending');ui.ending(getEpilogue(state));}else loadChapter(chapter.id);}
  else if(name==='quit'){window.close();ui.toast('桌面版可使用 Alt+F4 退出。');}
  else if(name==='reload-app')location.reload();
}
function updateCamera(dt){
  if(!camera)return;
  const crouch=keys.has('KeyC'),targetHeight=carrying?1.55:crouch?1.08:1.68;player.y=THREE.MathUtils.lerp(player.y,targetHeight,Math.min(1,dt*10));
  const moving=keys.has('KeyW')||keys.has('KeyS')||keys.has('KeyA')||keys.has('KeyD');const bob=settings.headbob&&moving&&mode==='playing'?Math.sin(elapsed*(keys.has('ShiftLeft')?12:8))*.023:0;
  camera.position.set(player.x,player.y+bob+(cinematic>0?cinematic*3.5:0),player.z);camera.rotation.order='YXZ';const rotorShake=settings.headbob&&mode==='playing'?aircraftPressure*.0015:0;camera.rotation.set(player.pitch-recoil*.35+Math.sin(elapsed*31)*rotorShake+(settings.headbob&&!settings.gentle?nearMissShock*.012:0),player.yaw+Math.cos(elapsed*23)*rotorShake*.5,(settings.headbob&&moving?Math.sin(elapsed*4)*.002:0)+Math.sin(elapsed*19)*rotorShake*.4+(settings.headbob&&!settings.gentle?nearMissShock*nearMissPan*.006:0));
  const targetFov=aiming&&chapter?.armed&&reloading<=0?48:keys.has('ShiftLeft')&&moving?80:74;camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,Math.min(1,dt*9));camera.updateProjectionMatrix();
  if(weapon){const aimed=aiming&&chapter?.armed&&reloading<=0,hip=weapon.userData.hipPosition||[.22,-.215,-.29];const sight=weapon.userData.sight||[0,.0639,-.015],pitch=aimed?(weapon.userData.sightPitch||0):0,sightY=sight[1]*Math.cos(pitch)-sight[2]*Math.sin(pitch);weapon.rotation.x=THREE.MathUtils.lerp(weapon.rotation.x,pitch,Math.min(1,dt*10));weapon.position.x=THREE.MathUtils.lerp(weapon.position.x,aimed?-sight[0]:hip[0],Math.min(1,dt*10));weapon.position.y=THREE.MathUtils.lerp(weapon.position.y,(aimed?-sightY:hip[1])+bob*.5-((interaction>0||fieldPrompt?.progress>0||carrying)?.17:0),Math.min(1,dt*10));weapon.position.z=THREE.MathUtils.lerp(weapon.position.z,(aimed?(weapon.userData.adsDepth??-.35):hip[2])+recoil*.2,Math.min(1,dt*15));weapon.rotation.z=0;weaponController.update({dt,reload:reloading>0?1-reloading/weaponInfo().reloadTime:0});}
}
function damageEnemy(enemy,damage){
  if(!enemy?.alive)return;enemy.health-=damage;enemy.obj.userData.hitImpulse=1;
  if(enemy.health<=0){enemy.alive=false;enemy.fallTime=0;enemy.fallSide=Math.random()<.5?-1:1;enemy.obj.userData.mixer?.stopAllAction();}
}
function bodyBounds(actor){
  casualtyBounds.makeEmpty();actor.updateMatrixWorld(true);
  actor.traverseVisible(mesh=>{
    if(!mesh.isSkinnedMesh||mesh.material?.visible===false||mesh.material?.opacity===0)return;
    const geometry=mesh.geometry;let indices=referencedVertices.get(geometry);
    if(!indices){
      const index=geometry.index,count=index?index.count:geometry.attributes.position.count,start=geometry.drawRange.start||0,end=Math.min(count,start+geometry.drawRange.count);
      indices=[...new Set(Array.from({length:Math.max(0,end-start)},(_,i)=>index?index.getX(i+start):i+start))];referencedVertices.set(geometry,indices);
    }
    for(const index of indices){mesh.getVertexPosition(index,casualtyVertex).applyMatrix4(mesh.matrixWorld);casualtyBounds.expandByPoint(casualtyVertex);}
  });
  return casualtyBounds;
}
function updateCasualties(dt){
  for(const actor of actors)actor.userData.hitImpulse=Math.max(0,(actor.userData.hitImpulse||0)-dt*3.5);
  for(const enemy of enemies){
    const data=enemy.obj.userData;data.hitImpulse=Math.max(0,(data.hitImpulse||0)-dt*3.5);
    if(enemy.alive||enemy.fallTime===undefined||enemy.fallTime>=1)continue;
    if(!enemy.fallRotation)enemy.fallRotation=enemy.obj.quaternion.clone();
    enemy.fallTime=Math.min(1,enemy.fallTime+dt/1.05);
    const t=enemy.fallTime,fall=THREE.MathUtils.smoothstep(t,.14,1);
    // Fall in the actor's local forward direction. The second rotation rolls
    // around the body's long axis, independent of its original street heading.
    enemy.obj.quaternion.copy(enemy.fallRotation)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI*.5*fall))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),enemy.fallSide*1.45*fall));
    data.animate?.(0,dt,{stance:t<.3?'kneel':'stand',dead:fall,deadSide:enemy.fallSide,hit:Math.max(data.hitImpulse,.4*(1-t)),alert:0});
    const bounds=bodyBounds(enemy.obj);
    if(Number.isFinite(bounds.min.y))enemy.obj.position.y+=THREE.MathUtils.lerp(.02,.006,fall)-bounds.min.y;
  }
}
function actorCallout(event){
  if(mode!=='playing'||chapterTime-lastBattleCallout<9||radioTimer<6||chapterTime<7||interaction>0)return;
  const text=typeof event==='string'?event:event.text;
  if(!text)return;lastBattleCallout=chapterTime;ui.subtitle(event.speaker||'小队频道',text,2600);audio.radio();
}
function impactFeedback(hit){
  if(!hit)return;const material=hit.kind==='ground'?'sand':hit.material||'masonry';combatFeedback.hit({point:hit.point,normal:hit.normal,material});
  const dx=hit.point.x-player.x,dz=hit.point.z-player.z,distance=Math.hypot(dx,dz);
  if(distance<45)audio.bulletImpact(distance,clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-1,1),material);
}
function receiveDamage(amount,source){
  player.health-=amount;damageFlash=1;nearMissShock=Math.max(.7,nearMissShock);
  const dx=source.x-player.x,dz=source.z-player.z;
  damageAngle=Math.atan2(dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw),-dx*Math.sin(player.yaw)-dz*Math.cos(player.yaw))*180/Math.PI;
  audio.hit();fieldInteractions?.cancel();
}
function toggleSquadOrder(){
  if(!chapter?.armed||mode!=='playing')return;
  squadOrder=squadOrder==='follow'?'hold':'follow';actorDirector.setSquadOrder(squadOrder);audio.radio();
  ui.subtitle('小队频道',squadOrder==='hold'?'在这里掩护。我移动时看住街口。':'收到，跟上队伍，交替掩护。',2600);
}
function releaseSmoke(){
  if(!chapter?.armed||!chapter.hostiles.length||mode!=='playing')return;
  if(reloading>0||interaction>0||fieldPrompt?.progress>0||carrying){ui.toast('先完成手中的动作，再释放烟幕。');return;}
  if(smokeCharges<=0){ui.toast('本章烟幕已用完。利用实体掩体移动。');return;}
  const origin=new THREE.Vector3(player.x,.35,player.z),target=origin.clone().add(new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw)).multiplyScalar(2.4));
  const hit=traceObstacles(origin,target,physicalColliders());if(hit)target.copy(origin).lerp(target,Math.max(0,hit.fraction-.16));
  target.y=.08;tacticalSmoke.deploy(target);smokeCharges--;audio.smoke();ui.toast('烟幕正在展开 · 遮挡双方视线，子弹仍能穿过',3500);
}
function actorFire(event){
  if(mode!=='playing'||chapterTime<2)return;
  const from=new THREE.Vector3(event.origin.x,event.origin.y??1.3,event.origin.z);
  const aim=new THREE.Vector3(event.aim.x,event.aim.y??1.25,event.aim.z);
  const to=aim.clone();
  if(lineBlocked({x:from.x,z:from.z},{x:to.x,z:to.z},gameColliders))return;
  const muzzle=event.actor?.userData.getMuzzlePosition?.();if(muzzle)from.copy(muzzle);
  shotLog.push({shooterId:event.id,faction:event.faction,from:[from.x,from.z],to:[to.x,to.z],blocked:lineBlocked({x:from.x,z:from.z},{x:to.x,z:to.z},gameColliders),time:chapterTime});
  if(shotLog.length>120)shotLog.shift();
  if(shotLog.at(-1).blocked){shotLog.pop();return;}
  // A visible miss follows its own trajectory into the street or nearby cover.
  const targetHit=Math.random()<(event.faction==='enemy'?(keys.has('KeyC')?.14:.27):.22);
  if(!targetHit){
    to.x+=(Math.random()<.5?-1:1)*(.55+Math.random()*1.25);to.y-=.25+Math.random()*.45;to.z+=(Math.random()-.5)*.8;
    const direction=to.clone().sub(from).normalize();to.copy(from).addScaledVector(direction,Math.min(85,from.distanceTo(aim)+42));
  }
  const hit=traceObstacles(from,to,physicalColliders());if(hit)to.set(hit.point.x+hit.normal.x*.005,hit.point.y+hit.normal.y*.005,hit.point.z+hit.normal.z*.005);
  Object.assign(shotLog.at(-1),{aim:[aim.x,aim.z],to:[to.x,to.z],impact:hit?.kind||null,blocked:lineBlocked({x:from.x,z:from.z},{x:to.x,z:to.z},gameColliders)});
  combatFeedback.shot({from,to,faction:event.faction,weaponId:event.actor?.userData.weaponId});
  impactFeedback(hit);
  const dx=from.x-player.x,dz=from.z-player.z,distance=Math.hypot(dx,dz),pan=clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-1,1);
  audio.shotAt(distance,pan,event.actor?.userData.weaponId,Boolean(traceObstacles(camera.position,from,gameColliders)));
  actorDirector.notifyThreat({position:[to.x,to.z],source:[from.x,from.z],start:[from.x,from.z],end:[to.x,to.z],radius:2.8,intensity:.4,kind:'near-miss',faction:event.faction,shooterId:event.id});
  const near=nearestOnSegment({x:player.x,y:player.y,z:player.z},from,to);
  if(event.faction==='enemy'&&near.distance<2.4&&chapterTime>nearMissAt){
    const px=near.x-player.x,pz=near.z-player.z;nearMissPan=clamp((px*Math.cos(player.yaw)-pz*Math.sin(player.yaw))/Math.max(.1,Math.hypot(px,pz)),-1,1);
    nearMissShock=1-near.distance/3;nearMissAt=chapterTime+.35;audio.nearMiss(near.distance,nearMissPan);
  }
  if(event.faction==='enemy'){
    if(!event.targetActor&&targetHit&&!hit){receiveDamage(settings.gentle?1.4:4,from);}
    else if(event.targetActor&&targetHit&&!hit)event.targetActor.userData.hitImpulse=1;
  }else{
    const enemy=enemies.find(e=>e.obj===event.targetActor);
    if(enemy&&targetHit&&!hit){damageEnemy(enemy,10);combatFeedback.actorHit({point:aim,direction:to.clone().sub(from).normalize(),killed:!enemy.alive});}
  }
}
function shoot(){
  if(interaction>0||fieldPrompt?.progress>0||carrying)return;
  if(weaponInfo().fireMode==='burst'&&burstRemaining<=0)return;
  if(!canFire(mode,chapter?.armed,player.mag,reloading,cooldown)){if(mode==='playing'&&chapter?.armed&&player.mag===0&&cooldown<=0){cooldown=.3;audio.click();ui.toast(state.resources.ammo?'弹匣已空 · 按 R 换弹':'弹药耗尽。可避开交火继续救援，并寻找补给。');}return;}
  player.mag--;cooldown=weaponInfo().fireInterval;const movement=['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k));
  const spread=(aiming?.0005:.003)+(movement?(aiming?.002:.007):0)+(keys.has('KeyC')?0:.0015)+recoil*.025;
  const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*spread;
  raycaster.setFromCamera(new THREE.Vector2(Math.cos(angle)*radius,Math.sin(angle)*radius),camera);
  recoil=Math.min(.17,recoil+.075*(weaponInfo().recoil??1));muzzleFlashTime=.045;weaponController.fire();flash.visible=false;audio.shot(player.weaponId);let closest=null,hitPoint=null,best=100;
  if(weaponInfo().fireMode==='burst')burstRemaining--;if(weaponInfo().fireMode==='semi')mouseDown=false;
  for(const enemy of enemies){if(!enemy.alive||lineBlocked(player,enemy,gameColliders))continue;const hits=raycaster.intersectObject(enemy.obj,true);if(hits.length&&hits[0].distance<best){best=hits[0].distance;closest=enemy;hitPoint=hits[0].point;}}
  const muzzle=new THREE.Vector3(...(weapon.userData.muzzle||[0,.01,-.85]));weapon.localToWorld(muzzle);
  // When pressed against cover the displayed barrel can cross the footprint.
  // Resolve eye-to-muzzle first, keeping both damage and decals on its near face.
  const muzzleBlock=traceObstacles(camera.position,muzzle,physicalColliders());
  const end=hitPoint||raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction,70),hit=muzzleBlock||traceObstacles(muzzle,end,physicalColliders());
  if(muzzleBlock)muzzle.set(hit.point.x+hit.normal.x*.04,hit.point.y+hit.normal.y*.04,hit.point.z+hit.normal.z*.04);
  if(closest&&!hit){damageEnemy(closest,hitPoint.y>1.4?100:(weaponInfo().damage??34));hitTimer=.24;killConfirm=!closest.alive;audio.confirmHit(killConfirm);combatFeedback.actorHit({point:hitPoint,direction:raycaster.ray.direction,killed:killConfirm});}
  if(hit)end.set(hit.point.x,hit.point.y,hit.point.z);combatFeedback.shot({from:muzzle,to:end,faction:'player',weaponId:player.weaponId});impactFeedback(hit);actorDirector.notifyThreat({position:[end.x,end.z],source:[player.x,player.z],start:[muzzle.x,muzzle.z],end:[end.x,end.z],radius:4,intensity:.8,kind:'shot',faction:'player'});
}
function reload(){if(!chapter?.armed||mode!=='playing'||reloading>0||player.mag>=weaponInfo().magSize||state.resources.ammo<=0)return;reloading=weaponInfo().reloadTime;audio.reload();}
function selectWeapon(id){
  if(!chapter?.armed||mode!=='playing'||reloading>0||id===player.weaponId||!PLAYER_WEAPON_IDS.includes(id))return;
  Object.assign(player,selectMagazine(stowedMagazines,player.weaponId,id,player.mag));
  weaponController.setWeapon(player.weaponId);recoil=0;aiming=false;cooldown=.35;mouseDown=false;
  ui.toast(`${PLAYER_WEAPON_IDS.indexOf(id)+1} · ${weaponInfo().name} · R 装填`);
  if(player.mag===0&&state.resources.ammo>0)reload();
}
function heal(){if(mode!=='playing')return;if(player.health>=100){ui.toast('当前无需使用救护物资。');return;}if(state.resources.medicine<=0){ui.toast('救护物资已用完。寻找补给，利用遮挡减少受伤。');return;}state.resources.medicine--;player.health=Math.min(100,player.health+45);audio.complete();ui.toast('已使用一份救护物资 · 恢复 45 点状态');}
function completeTask(task){
  task.done=true;interaction=0;audio.radio();ui.subtitle(chapter.role.split(' · ')[0],task.text,6800);
  if(task.kind==='supplies'){if(chapter.armed){state.resources.ammo=Math.min(240,state.resources.ammo+12);ui.toast('补给已取回 · 备用弹药 +12');}else{state.resources.medicine=Math.min(12,state.resources.medicine+1);ui.toast('救护物资 +1');}}
  if(task.kind==='civilian'){escort=task.obj;actorDirector?.setFollow(escort,true);ui.toast('居民开始跟随。放慢脚步，确认对方没有掉队。');}
  if(task.kind==='wounded'&&chapter.id!==11&&chapter.id!==16){escort=task.obj;carrying=true;task.obj.userData.carried=true;ui.toast('正在协助转移伤员 · 移动速度降低');}
  if(task.kind==='vehicle'&&escort){actorDirector?.setFollow(escort,false);carrying=false;escort.userData.carried=false;escort=null;ui.toast('人员已交接给救援车辆。');}
  taskIndex++;ui.mission(chapter,tasks[taskIndex],taskIndex);
  if(taskIndex>=tasks.length){setMode('choice');ui.choice(chapter,{...state.resources,ammo:state.resources.ammo+allLoaded()},task.text);}
}
function updatePlaying(dt){
  nearMissShock=Math.max(0,nearMissShock-dt*4);
  damageFlash=Math.max(0,damageFlash-dt*2.6);
  chapterTime+=dt;cinematic=Math.max(0,cinematic-dt);cooldown=Math.max(0,cooldown-dt);muzzleFlashTime=Math.max(0,muzzleFlashTime-dt);recoil*=Math.exp(-dt*11);hitTimer=Math.max(0,hitTimer-dt);if(flash)flash.visible=false;
  if(reloading>0){reloading=Math.max(0,reloading-dt);if(reloading===0){const count=roundsToLoad(weaponInfo().magSize,player.mag,state.resources.ammo);player.mag+=count;state.resources.ammo-=count;}}
  audio.reloadPhase(reloading>0?1-reloading/weaponInfo().reloadTime:0,player.weaponId);
  const crouched=keys.has('KeyC'),sprint=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&player.stamina>2&&!crouched&&!carrying;
  let dx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),dz=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);const len=Math.hypot(dx,dz),moving=len>0&&cinematic===0;
  if(moving){dx/=len;dz/=len;const speed=(carrying?2.15:crouched?2.15:sprint?6.3:3.7)*(1-state.resources.fatigue*.012);const sin=Math.sin(player.yaw),cos=Math.cos(player.yaw);movePlayer(player,(dx*cos+dz*sin)*speed*dt,(dz*cos-dx*sin)*speed*dt,physicalColliders());stepTimer-=dt;if(stepTimer<=0){audio.step(sprint);stepTimer=sprint?.28:.46;}if(sprint)player.stamina=Math.max(0,player.stamina-dt*(settings.gentle?8:16));else player.stamina=Math.min(100,player.stamina+dt*9);}
  else player.stamina=Math.min(100,player.stamina+dt*(13-state.resources.fatigue*.6));
  updateCamera(dt);
  if(mouseDown)shoot();
  const activeTask=tasks[taskIndex],nearPatient=tasks.find(t=>t.kind==='wounded'&&!t.done&&Math.hypot(player.x-t.pos[0],player.z-t.pos[1])<9);
  updateCasualties(dt);
  actorDirector.update(dt,{player:{...player,crouched,flashlight:flashlightOn},visibilityRange:chapter.mood==='night'?22:46,combatAllowed:chapter.hostiles.length>0,interactionActor:keys.has('KeyE')?activeTask?.obj:null,treatActor:nearPatient?.obj,carrying});
  if(companion){const distance=Math.hypot(companion.position.x-player.x,companion.position.z-player.z);
    if(!assistUsed&&player.health<35&&state.resources.cohesion>=5&&distance<6){assistUsed=true;player.health=Math.min(100,player.health+25);ui.subtitle('同伴','别掉队。我在你旁边。');ui.toast('此前建立的凝聚力带来同伴支援 · 状态 +25');}}
  if(player.health<=0){player.health=0;setMode('failed');ui.failure();return;}
  if(escort?.userData.carried){const x=player.x+Math.sin(player.yaw)*1.4,z=player.z+Math.cos(player.yaw)*1.4;escort.position.set(x,.55,z);escort.rotation.y=player.yaw;}
  const task=tasks[taskIndex];let taskNear=false;if(task){const goal=task.obj.userData.taskId?[task.obj.position.x,task.obj.position.z]:task.pos;const distance=Math.hypot(player.x-goal[0],player.z-goal[1]);const near=distance<3.4;const clear=!lineBlocked(player,{x:goal[0],z:goal[1]},world.colliders);taskNear=near&&clear;if(keys.has('KeyE')&&taskNear&&cinematic===0&&reloading<=0&&!mouseDown){interaction+=dt/(task.seconds||2);if(interaction>=1){completeTask(task);return;}}else interaction=0;
    ui.interaction(task,interaction,taskNear);tempVector.set(goal[0],task.kind==='wreck'?3:2.0,goal[1]);tempVector.project(camera);const inFront=tempVector.z<1&&tempVector.z>-1;const x=clamp((tempVector.x*.5+.5)*innerWidth,30,innerWidth-30),y=clamp((-.5*tempVector.y+.5)*innerHeight,145,innerHeight-100);ui.waypoint(x,y,distance,inFront&&!near);
    if(!inFront&&chapterTime>8&&Math.floor(chapterTime)%16===0)ui.toast('目标在身后。转动鼠标寻找金色菱形标记。',1600);
  }
  fieldPrompt=fieldInteractions.update(dt,{player,camera,held:keys.has('KeyE'),blocked:taskNear||reloading>0||mouseDown||carrying||cinematic>0});
  if(!taskNear)ui.interaction(fieldPrompt,fieldPrompt.progress,fieldPrompt.near);
  if(chapter.radio&&radioIndex<chapter.radio.length){radioTimer-=dt;if(radioTimer<=0){const r=chapter.radio[radioIndex++];ui.subtitle(r.speaker,r.text);audio.radio();radioTimer=18;}}
  ui.vitals(player,state,chapter.armed,reloading>0,weaponInfo());camera.getWorldDirection(clockDirection);const heading=Math.atan2(clockDirection.x,-clockDirection.z)*180/Math.PI;document.getElementById('heading').textContent=`${((heading+360)%360).toFixed(0).padStart(3,'0')}°`;
  ui.combat({hit:hitTimer,kill:killConfirm,damageFlash,damageAngle,suppression:nearMissShock,spread:recoil*90+(moving?6:0),aimed:aiming&&reloading<=0,smokes:smokeCharges,squad:squadOrder,armed:chapter.armed,combat:chapter.hostiles.length>0,carrying,night:chapter.mood==='night',flashlight:flashlightOn});
  if(player.health<=0){player.health=0;setMode('failed');ui.failure();}
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastTime)/1000,.05)||.016;lastTime=now;if(mode==='playing'||mode==='menu')elapsed+=dt;
  if(!world)return;world.update(mode==='playing'||mode==='menu'?dt:0,elapsed,camera);
  tacticalSmoke.update(mode==='playing'?dt:0,camera);
  const aircraft=world.getAircraftState?.();if(aircraft?.position){const ap=aircraft.position;tempVector.set(ap[0]-camera.position.x,ap[1]-camera.position.y,ap[2]-camera.position.z);const distance=tempVector.length();const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);const pan=clamp(tempVector.dot(right)/Math.max(distance,1),-1,1);aircraftPressure=mode==='playing'&&aircraft.visible!==false?Math.pow(Math.max(0,1-distance/55),2):0;audio.updateAircraft?.(distance,pan,mode==='playing'&&aircraft.visible!==false,dt);}else{aircraftPressure=0;audio.updateAircraft?.(500,0,false,dt);}
  let fireDistance=500,firePan=0;
  for(const origin of world.getFireSources?.()||[]){tempVector.set(origin[0]-camera.position.x,origin[1]-camera.position.y,origin[2]-camera.position.z);const distance=tempVector.length();if(distance<fireDistance){fireDistance=distance;firePan=clamp(tempVector.dot(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion))/Math.max(1,distance),-1,1);}}
  audio.updateBattle(dt,fireDistance,firePan,mode==='playing');
  if(mode==='playing')updatePlaying(dt);
  else if(mode==='gallery'){if(!galleryDrag)galleryAngle+=dt*.08;galleryActor.rotation.y=galleryAngle;galleryActor.userData.animate?.(0,dt);if(galleryWeaponId(galleryKind)){const size=galleryActor.userData.gallerySize||[1,.3,.2],distance=Math.max(.46,Math.max(size[0]/camera.aspect,size[1])/(2*Math.tan(19*Math.PI/180))*1.65);camera.position.set(.035,galleryClose?.03:.07,distance*(galleryClose?.55:1));camera.lookAt(0,0,0);camera.fov=38;}else{camera.position.set(.12,galleryClose?1.61:1.12,galleryClose?1.1:3.9);camera.lookAt(0,galleryClose?1.52:.97,0);camera.fov=galleryClose?43:36;}camera.updateProjectionMatrix();}
  else if(!chapter){menuTime+=dt;camera.position.set(5.2+Math.sin(menuTime*.045)*.65,2.6+Math.sin(menuTime*.06)*.12,7);camera.lookAt(-1,3.3,-13);camera.fov=58;camera.updateProjectionMatrix();actorDirector?.update(dt,{player:{x:0,z:50,yaw:0},combatAllowed:false});}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.life<=0){scene.remove(e.obj);e.obj.geometry.dispose();e.obj.material.dispose();effects.splice(i,1);}}
  if(mode!=='gallery'){
    battleAtmosphere.update(mode==='playing'||mode==='menu'?dt:0,elapsed,camera,{active:mode==='playing',combat:Boolean(chapter?.hostiles.length),mood:chapter?.mood||'dusk'});
    for(const event of battleAtmosphere.takeEvents()){const dx=event.x-camera.position.x,dz=event.z-camera.position.z,distance=Math.hypot(dx,dz),pan=clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-1,1);audio.impact(distance,pan,Boolean(traceObstacles(camera.position,{x:event.x,y:1,z:event.z},gameColliders)));actorDirector?.notifyThreat({position:[event.x,event.z],source:[event.x,event.z],radius:30,intensity:.9,kind:'explosion'});}
  }
  combatFeedback.update(mode==='playing'?dt:0,camera);camera.updateMatrixWorld(true);world.updateShadows?.(camera);if(fieldFlashlight){camera.getWorldDirection(forward);const beamEnd=camera.position.clone().addScaledVector(forward,24),beamHit=traceObstacles(camera.position,beamEnd,gameColliders);fieldFlashlight.update(mode==='playing'?dt:0,{blockedDistance:beamHit?camera.position.distanceTo(new THREE.Vector3(beamHit.point.x,beamHit.point.y,beamHit.point.z)):24});}renderer.info.reset();if(mode==='gallery')renderer.render(galleryScene,camera);else cinema.render(elapsed,dt);
}
function bindInput(){
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();resizeRender();});
  window.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','Space','Tab','KeyE','KeyR','KeyC','ShiftLeft','ShiftRight','Escape'].includes(e.code)||/^Digit[1-9]$/.test(e.code))e.preventDefault();if(e.code==='Escape'){if(e.repeat)return;if(mode==='playing')pause();else if(mode==='paused')resume();else if(['settings','journal','chapters','about'].includes(mode))action('back');return;}if(e.code==='Tab'&&!e.repeat){if(mode==='playing')action('journal');else if(mode==='journal')action('back');return;}if(mode!=='playing')return;keys.add(e.code);if(e.code==='KeyR'&&!e.repeat)reload();if(e.code==='KeyH'&&!e.repeat)heal();if(e.code==='KeyQ'&&!e.repeat)releaseSmoke();if(e.code==='KeyF'&&!e.repeat)toggleSquadOrder();if(e.code==='KeyT'&&!e.repeat){flashlightOn=!flashlightOn;fieldFlashlight.setEnabled(flashlightOn);ui.toast(flashlightOn?'手电已开启 · T 关闭':'手电已关闭');}if(/^Digit[1-9]$/.test(e.code)&&!e.repeat)selectWeapon(PLAYER_WEAPON_IDS[Number(e.code.slice(-1))-1]);});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();mouseDown=false;if(mode==='playing')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
  canvas.addEventListener('wheel',e=>{if(mode==='playing'&&chapter?.armed){e.preventDefault();selectWeapon(nextWeapon(PLAYER_WEAPON_IDS,player.weaponId,e.deltaY));}},{passive:false});
  canvas.addEventListener('mousedown',e=>{if(mode!=='playing')return;if(e.button===0){if(document.pointerLockElement===canvas||debugEnabled){mouseDown=true;burstRemaining=weaponInfo().fireMode==='burst'?3:0;}else requestLock();}if(e.button===2){aiming=true;dragging=true;}});
  window.addEventListener('mousedown',e=>{if(mode==='gallery'&&!e.target.closest('button'))galleryDrag=true;});
  window.addEventListener('mousemove',e=>{if(mode==='gallery'&&galleryDrag)galleryAngle+=e.movementX*.009;});
  window.addEventListener('mouseup',()=>galleryDrag=false);
  window.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;if(e.button===2){aiming=false;dragging=false;}});
  window.addEventListener('mousemove',e=>{if(mode!=='playing'||(!document.pointerLockElement&&!dragging))return;player.yaw-=e.movementX*.002*settings.sensitivity;player.pitch=clamp(player.pitch-e.movementY*.002*settings.sensitivity,-1.35,1.35);});
  window.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){mouseDown=false;aiming=false;if(mode==='playing')pause();}});
  document.addEventListener('pointerlockerror',()=>ui.toast('鼠标未锁定。点击画面重试，或按住右键拖动观察。'));
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setMode('error');ui.error('显卡上下文已中断。已保存的章节进度仍在，请重新加载。');});
}
async function boot(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
    camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.05,600);await prepareWeapon(renderer);world=await createWorld(renderer);scene=world.scene;battleAtmosphere=createBattleAtmosphere(scene);combatFeedback=createCombatFeedback(scene);fieldFlashlight=createFieldFlashlight(camera);tacticalSmoke=createTacticalSmoke(scene);fieldInteractions=createFieldInteractions(scene,{colliders:()=>gameColliders,onComplete:({kind,amount})=>{if(!state)return;const key=kind==='ammo'?'ammo':'medicine',limit=kind==='ammo'?240:12,before=state.resources[key];state.resources[key]=Math.min(limit,before+amount);audio.click();ui.toast(kind==='ammo'?'弹药箱已取用 · 备用弹药 +'+(state.resources[key]-before):'医疗箱已取用 · 救护物资 +'+(state.resources[key]-before));}});actorDirector=createActorDirector({colliders:()=>gameColliders,staticColliders:()=>world.colliders,navigationColliders:()=>fieldInteractions.getColliders(),obscures:(a,b)=>tacticalSmoke.obscures(a,b),onFire:actorFire,onCallout:actorCallout});scene.add(camera);cinema=createCinema(renderer,scene,camera);renderer.info.autoReset=false;const weaponAsset=createWeapon(camera);weaponController=weaponAsset;weapon=weaponAsset.group;flash=weaponAsset.flash;applySettings();bindInput();ui.bootDone();showMenu();requestAnimationFrame(frame);
    if(debugEnabled)window.__game={inspectHands:()=>weaponController.inspectHands(),getState:()=>({mode,chapter:chapter?.id||0,task:taskIndex,player:{...player},resources:{...state?.resources},stowedMagazines:{...stowedMagazines},enemyCount:enemies.filter(e=>e.alive).length,render:{fov:camera.fov,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio(),quality:settings.quality,renderScale:settings.renderScale},saved:readCampaign(localStorage)}),loadChapter:(i)=>{if(!state)state=newCampaign(INITIAL_RESOURCES);loadChapter(i);},teleport:(x,z)=>{player.x=x;player.z=z;updateCamera(.1);},lookAt:(x,y,z)=>{const dx=x-player.x,dz=z-player.z;player.yaw=Math.atan2(-dx,-dz);player.pitch=Math.atan2(y-player.y,Math.hypot(dx,dz));updateCamera(.1);},forceDamage:(amount)=>{player.health-=amount;},setAircraftPreview:(position,rotation)=>world.setAircraftPreview?.(position,rotation),action:(name,value)=>action(name,value),pause,behaviorEvent:event=>actorDirector.notifyThreat(event),behaviorSnapshot:()=>({actors:actorDirector.inspect(),shots:shotLog.map(s=>({...s})),time:chapterTime,poses:actors.concat(enemies.map(e=>e.obj)).map(a=>({name:a.name,position:a.position.toArray(),rotationY:a.rotation.y,pose:a.userData.getPoseState?.()||a.userData.poseState}))}),inspect:()=>({audio:audio.inspect?.(),combatEffects:combatFeedback.inspect(),ambientEffects:battleAtmosphere.inspect(),field:fieldInteractions.inspect(),smoke:tacticalSmoke.inspect(),smokeCharges,squadOrder,lighting:world.getLightingState?.(),flashlight:fieldFlashlight.inspect(),urban:world.getUrbanState?.(),aircraft:world.getAircraftState?.(),colliders:physicalColliders(),staticColliders:world.colliders,tasks:tasks.map(t=>({id:t.id,pos:t.obj.userData.taskId?[t.obj.position.x,t.obj.position.z]:t.pos,anchor:t.pos,done:t.done})),enemies:enemies.map(e=>({x:e.x,z:e.z,health:e.health,alive:e.alive,fallTime:e.fallTime,y:e.obj.position.y,pitch:e.obj.rotation.x,boundsMinY:e.alive?null:bodyBounds(e.obj).min.y}))})};
  }catch(error){console.error(error);document.getElementById('boot')?.remove();setMode('error');ui.error('3D场景启动失败：'+error.message+'。请确认资源目录完整，或更新显卡驱动后重试。');}
}
boot();
