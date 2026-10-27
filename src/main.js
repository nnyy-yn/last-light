import {buildStreetPopulation} from './street-population.js';
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
import { getChapterLayout } from './chapter-layouts.js';
import { createNarrative } from './narrative.js';
import { createNarrativeCinematics } from './narrative-cinematics.js';
import { traceObstacles as traceSolidObstacles, nearestOnSegment } from './ballistics.js';
import { newCampaign, choose, canChoose, applyEffects, checkpoint, restoreChapter, readCampaign, saveCampaign, SETTINGS_KEY, clamp, movePlayer, lineBlocked, canFire } from './simulation.js';
import {placeCampaignTasks} from './campaign-tasks.js';
import {captureChapterCheckpoint,applyChapterCheckpoint} from './chapter-checkpoints.js';
import {MOUNTED_M2,createMountedGun,stepMountedGun,fireMountedGun,reloadMountedGun,clearDismount} from './mounted-weapons.js';
import {createMountedGunnerPose,prepareMountedHands} from './mounted-gunner-pose.js';
import {createChapterTransition,getChapterTransition} from './chapter-transition.js';
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
const groundHeight=(x,z)=>world?.sampleHeight?.(x,z)||0;
const traceObstacles=(start,end,boxes)=>traceSolidObstacles(start,end,boxes,groundHeight);
let settings={graphicsVersion:2,quality:'high',renderScale:1,sensitivity:1,volume:.48,aircraftVolume:1,battleVolume:1,headbob:true,gentle:false};
try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(saved&&typeof saved==='object'){if(saved.graphicsVersion===2&&['low','medium','high'].includes(saved.quality))settings.quality=saved.quality;if([.75,1,1.25,1.5].includes(saved.renderScale))settings.renderScale=saved.renderScale;for(const k of ['sensitivity','volume','aircraftVolume','battleVolume'])if(Number.isFinite(saved[k]))settings[k]=clamp(saved[k],k==='sensitivity'?.3:0,k==='sensitivity'?2:1);for(const k of ['headbob','gentle'])if(typeof saved[k]==='boolean')settings[k]=saved[k];}}catch{}
let player={x:0,z:65,y:1.68,yaw:0,pitch:0,health:100,stamina:100,mag:0},keys=new Set(),mouseDown=false,burstRemaining=0,aiming=false,dragging=false;
let taskIndex=0,interaction=0,enemies=[],actors=[],tasks=[],effects=[],companion=null,escort=null,carrying=false,assistUsed=false,gameColliders=[];
let cooldown=0,reloading=0,recoil=0,muzzleFlashTime=0,elapsed=0,lastTime=0,stepTimer=0,chapterTime=0,radioIndex=0,radioTimer=0,hitTimer=0,cinematic=0,nearMissShock=0,nearMissPan=0,nearMissAt=0;
let previousPage='menu',lookWarning=false,menuTime=0,lastBattleCallout=-100;
let combatFeedback,tacticalSmoke,fieldInteractions,fieldFlashlight,flashlightOn=false,smokeCharges=0,squadOrder='follow',damageFlash=0,damageAngle=0,killConfirm=false,fieldPrompt=null;
let mounted=null,mountedWeapons=[],mountPrompt=null,mountedPose=null;
const chapterTransition=createChapterTransition(),transitionEvents=[];
let chapterHandoff=null;
const shotLog=[];
let layout=null,narrative=null,storyDirector=null,cinematicContinuation=null,pausedMode='playing',pendingStoryPress=false;
let narrativeView=null,taskAnimationTime=0,chapterOpeningPlayed=false;
let taskDecisions=[],pacingElapsed=0,intentionalUnlock=false;
function releasePointer(){if(document.pointerLockElement){intentionalUnlock=true;document.exitPointerLock();}}
const inConversation=()=>['dialogue','decision'].includes(narrative?.inspect().phase);
const storyEventLog=[];
const sceneLook={x:0,y:0};
const casualtyBounds=new THREE.Box3();
const casualtyVertex=new THREE.Vector3(),referencedVertices=new WeakMap();
let galleryScene=null,galleryActor=null,galleryKind='soldier',galleryClose=false,galleryAngle=0,galleryDrag=false;
const tempVector=new THREE.Vector3(),raycaster=new THREE.Raycaster(),forward=new THREE.Vector3(),clockDirection=new THREE.Vector3();
const debugEnabled=new URLSearchParams(location.search).has('qa');

function setMode(next){mode=next;lastTime=performance.now();keys.clear();sceneLook.x=sceneLook.y=0;storyDirector?.setInput?.({});pendingStoryPress=false;mouseDown=false;aiming=false;dragging=false;interaction=0;recoil=0;fieldInteractions?.cancel();narrative?.cancel();fieldFlashlight?.setEnabled(next==='playing'&&flashlightOn);audio.pause(!['playing','cinematic'].includes(next));if(next!=='playing'){releasePointer();ui.waypoint(0,0,0,false);ui.interaction(null,0,false);}ui.mode(next);}
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
  leaveMountedWeapon(true);mountedWeapons=[];
  storyDirector?.cancel();cinematicContinuation=null;narrative=null;layout=getChapterLayout(6);
  audio.reset?.();fieldInteractions?.clear();tacticalSmoke?.reset();combatFeedback?.reset();
  actorDirector?.reset({bounds:layout.bounds});world.loadChapterScene(6);battleAtmosphere?.reset();battleAtmosphere?.setChapter(layout);enemies=[];actors=[];tasks=[];taskIndex=0;escort=null;companion=null;shotLog.length=0;gameColliders=[...world.colliders];
  effects.forEach(e=>{scene.remove(e.obj);e.obj.geometry?.dispose();e.obj.material?.dispose();});effects=[];world.setMood('dusk');
  for(const[kind,pos]of[['wreck',[2,-12]],['vehicle',[8,9]]]){const prop=world.createProp(kind,pos);gameColliders.push(...(prop.userData.collisionBounds||[]));}
  for(const[id,pos]of[['menu-watch',[5,-7]],['menu-cross',[-5,-24]]]){const actor=world.createActor('soldier',pos,'撤离警戒队员');actors.push(actor);actorDirector?.add(actor,{id,kind:'soldier',role:'guard',anchor:pos,tether:4});}
  weapon.visible=false;
}
function disposeGallery(){if(!galleryScene)return;if(galleryActor)world?.destroyActor?.(galleryActor);galleryScene.traverse(o=>{if(o.isLight)o.shadow?.map?.dispose();if(o.userData.galleryDisposable){o.geometry?.dispose();o.material?.dispose();}});galleryScene.clear();galleryScene=null;galleryActor=null;}
function showMenu(){chapterTransition.cancel();chapterHandoff=null;ui.transition(null);if(demoSession){state=demoReturnState;demoReturnState=null;demoSession=false;}disposeGallery();setMode('menu');chapter=null;menuScene();ui.main(Boolean(state));}
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
function beginBattleDemo(index=5){demoReturnState=state?structuredClone(state):null;demoSession=true;state=newCampaign(INITIAL_RESOURCES);loadChapter(index);}
function loadChapter(index,{restore=false,continuous=false,resumeField=false}={}){
  if(!continuous){chapterTransition.cancel();chapterHandoff=null;ui.transition(null);}
  leaveMountedWeapon(true);mountedWeapons=[];
  storyDirector?.cancel();cinematicContinuation=null;chapterOpeningPlayed=false;storyEventLog.length=0;
  audio.reset?.();fieldInteractions?.clear();tacticalSmoke?.reset();combatFeedback?.reset();damageFlash=0;killConfirm=false;fieldPrompt=null;
  if(!state)state=newCampaign(INITIAL_RESOURCES);
  const savedField=resumeField&&state.fieldCheckpoint?.chapterId===index+1?structuredClone(state.fieldCheckpoint):null;
  if(restore&&!restoreChapter(state,index)){ui.toast('这一章还没有可用的检查点。');return;}
  delete state.fieldCheckpoint;
  layout=getChapterLayout(index+1);
  chapter={...CHAPTERS[index],sceneId:layout.id,location:layout.name,spawn:[...layout.spawn],facing:layout.facing,hostiles:layout.enemySpawns||[],tasks:CHAPTERS[index].tasks.map((t,i)=>({...t,pos:[...layout.taskPositions[i]]}))};
  state.chapter=index;checkpoint(state,index);save();
  smokeCharges=chapter.armed&&chapter.hostiles.length?2:0;squadOrder='follow';flashlightOn=false;fieldFlashlight?.setEnabled(false);tacticalSmoke?.setMood(chapter.mood);
  actorDirector?.reset({bounds:layout.bounds});shotLog.length=0;lastBattleCallout=-100;battleAtmosphere?.reset?.();world.loadChapterScene(chapter.id);battleAtmosphere?.setChapter(layout);for(const e of effects){scene.remove(e.obj);e.obj.geometry?.dispose();e.obj.material?.dispose();}effects=[];world.setMood(chapter.mood);
  chapter=placeCampaignTasks(chapter,layout,world.colliders);chapter.contentVersion='district-missions-0.8';
  narrative=createNarrative(chapter);narrativeView=narrative.inspect();taskAnimationTime=0;taskDecisions=[];pacingElapsed=0;
  player={x:chapter.spawn[0],z:chapter.spawn[1],y:chapter.movementLocked?.95:1.68,yaw:chapter.facing,pitch:0,health:100,stamina:100,mag:0,weaponId:defaultWeaponId};
  stowedMagazines=emptyMagazines(PLAYER_WEAPON_IDS);weaponController.setWeapon(defaultWeaponId);muzzleFlashTime=0;
  if(chapter.armed){player.mag=Math.min(weaponInfo().magSize,state.resources.ammo);state.resources.ammo-=player.mag;}
  taskIndex=0;interaction=0;cooldown=0;reloading=0;recoil=0;nearMissShock=0;nearMissAt=0;chapterTime=0;radioIndex=0;radioTimer=3;assistUsed=false;escort=null;carrying=false;actors=[];enemies=[];
  gameColliders=[...world.colliders];
  tasks=chapter.tasks.map((t,i)=>{
    const isActor=['civilian','soldier','wounded'].includes(t.kind),virtual=Boolean(t.actorFrom)||t.spawn===false||t.kind==='waypoint'||t.interaction==='radio';
    const obj=virtual?new THREE.Group():isActor?world.createActor(t.kind,t.pos,t.speaker||t.label,{civilian:chapter.id===1}):world.createProp(t.kind,t.pos);
    if(virtual){obj.position.set(t.pos[0],0,t.pos[1]);obj.userData.virtual=true;}
    if(isActor&&!virtual){if(chapter.id===9&&t.id==='durant-wait')obj.visible=false;actors.push(obj);obj.userData.taskId=t.id;const previous=i?chapter.tasks[i-1].pos:chapter.spawn;obj.rotation.y=Math.atan2(previous[0]-t.pos[0],previous[1]-t.pos[1]);}
    if(obj.userData.collisionBounds)gameColliders.push(...obj.userData.collisionBounds);
    return{...t,obj,done:false};
  });
  for(const task of tasks.filter(t=>t.interaction==='escort')){
    const source=tasks.find(t=>t.id===task.escortFrom);if(!source)continue;
    if(actors.includes(task.obj)){actors=actors.filter(a=>a!==task.obj);world.destroyActor(task.obj);}
    if(source.obj.userData.kind==='wounded'){
      const p=source.obj.position;task.obj=world.createActor('soldier',[p.x,p.z],task.speaker||'同行伤员');task.obj.visible=false;task.obj.userData.recoverFrom=source.obj;actors.push(task.obj);
    }else task.obj=source.obj;
  }
  const bindActor=task=>{if(task.actorFrom){const source=tasks.find(t=>t.id===task.actorFrom);bindActor(source);task.obj=source.obj;}return task.obj;};
  tasks.filter(t=>t.actorFrom).forEach(bindActor);
  for(const task of tasks){task.participantActors=[];for(const [i,person] of (task.participants||[]).entries()){const helper=world.createActor(person.kind,[task.pos[0]+1.6+i,task.pos[1]+.9],person.name);actors.push(helper);task.participantActors.push(helper);}}
  const population=buildStreetPopulation({...layout,taskPositions:chapter.tasks.map(t=>t.pos)},gameColliders);
  chapter.hostiles=[...chapter.hostiles,...population.contacts,...(population.reserves||[])];
  for(const spec of population.residents){
    const actor=world.createActor('civilian',spec.pos,'街区居民');actor.userData.resident=spec;
    const colors=['#b8afa1','#9bada7','#b3a39a','#aaa68a'];
    actor.traverse(mesh=>{if(mesh.isMesh&&/cloth|shirt|pants|tshirt|jeans|dress/i.test(mesh.material?.name||''))mesh.material.color.multiply(new THREE.Color(colors[spec.variant]));});
    actors.push(actor);
  }
  if(chapter.armed){companion=world.createActor('soldier',[player.x+2.5,player.z+2],'同伴');actors.push(companion);}else companion=null;
  for(const spec of chapter.hostiles){const obj=world.createActor('enemy',spec.pos,'武装人员');if(spec.lookAt)obj.rotation.y=Math.atan2(spec.lookAt[0]-spec.pos[0],spec.lookAt[1]-spec.pos[1]);enemies.push({obj,x:spec.pos[0],z:spec.pos[1],health:100,fireAt:4+Math.random()*3,phase:Math.random()*6,alive:true,encounter:spec});}
  if(chapter.hostiles.length){
    for(const[offset,id]of[[[-2.1,1.2],'cover'],[[1.1,4.3],'rear']]){const actor=world.createActor('soldier',[player.x+offset[0],player.z+offset[1]],id==='cover'?'掩护队员':'后方警戒队员');actor.userData.squadRole=id;actors.push(actor);}
  }
  for(let i=0;i<actors.length;i++){
    const actor=actors[i],kind=actor.userData.kind;if(kind==='wounded')continue;
    const task=tasks.find(t=>t.obj===actor),role=actor.userData.resident?'resident':actor===companion||actor.userData.squadRole?'companion':task?'story':kind==='civilian'?'civilian':'guard';
    actorDirector.add(actor,{id:task?'story-'+task.id:actor===companion?'squad-lead':actor.userData.squadRole?'squad-'+actor.userData.squadRole:'guard-'+i,kind,role,anchor:[actor.position.x,actor.position.z],tether:actor.userData.resident?13:task?.5:4,shelter:actor.userData.resident?.shelter,wait:actor.userData.resident?.wait,follow:role==='companion'});
  }
  for(let i=0;i<enemies.length;i++){const enemy=enemies[i];actorDirector.add(enemy.obj,{id:'enemy-'+i,kind:'enemy',role:'enemy',anchor:[enemy.x,enemy.z],entity:enemy,encounter:enemy.encounter});}
  for(const task of tasks)if(!task.obj.userData.virtual)task.obj.position.y=groundHeight(task.obj.position.x,task.obj.position.z);
  placeActorsOnGround();fieldInteractions?.reset({chapter});initMountedWeapons();weapon.visible=chapter.armed;updateCamera(0);
  if(savedField){const restored=applyChapterCheckpoint(state,savedField,checkpointContext());if(restored){restoreFieldState(restored);save();}else ui.toast('场景任务已更新，已从本章起点恢复。',6000);}
  ui.mission(chapter,tasks[taskIndex],taskIndex);
  if(savedField&&state.fieldCheckpoint){chapterOpeningPlayed=true;if(taskIndex===tasks.length){setMode('choice');ui.choice(chapter,{...state.resources,ammo:state.resources.ammo+allLoaded()},tasks.at(-1).text);}else enterGameplay();return;}
  if(continuous)play();else{setMode('intro');ui.intro(chapter,state.resources);}
}
function checkpointContext(){return {chapter,bounds:layout.bounds,enemyCount:enemies.length,mountedWeaponIds:mountedWeapons.map(m=>m.id),fieldIds:fieldInteractions.inspect().map(i=>i.id)};}
function saveFieldCheckpoint(){
  // In-progress dialogue/actions resume at the previous completed operation.
  // This avoids replaying a half-finished choice or rewarding an item twice.
  if(demoSession||!chapter||!state||state.completed||state.chapter!==chapter.id-1||!['idle','done'].includes(narrative?.inspect().phase)||mounted||player.health<=0)return;
  state.fieldCheckpoint=captureChapterCheckpoint({...checkpointContext(),campaign:state,taskIndex,player,stowedMagazines,assistUsed,killedEnemyIndices:enemies.flatMap((e,i)=>e.alive?[]:[i]),smokeCharges,mountedWeapons:mountedWeapons.map(m=>({id:m.id,gun:m.gun})),fieldCollectedIds:fieldInteractions.inspect().filter(i=>i.used).map(i=>i.id),pacingElapsed,taskDecisions});save();
}
function restoreFieldState(saved){
  player={...saved.player};stowedMagazines={...saved.stowedMagazines};weaponController.setWeapon(player.weaponId);
  taskIndex=saved.taskIndex;taskDecisions=saved.taskDecisions;pacingElapsed=saved.pacingElapsed;smokeCharges=saved.smokeCharges;assistUsed=saved.assistUsed;
  narrative.restoreCompleted(saved.completedTaskIds);narrativeView=narrative.inspect();
  for(let i=0;i<tasks.length;i++){const task=tasks[i];task.done=i<taskIndex;if(task.obj.userData.recoverFrom&&i<=taskIndex){task.obj.userData.recoverFrom.visible=false;task.obj.visible=true;}}
  // Restore the completed transfer state without executing reward callbacks.
  for(const task of tasks.slice(0,taskIndex)){
    if(task.animation==='carry'&&task.kind==='wounded'){escort=task.obj;carrying=true;task.obj.userData.carried=true;}
    if(task.kind==='vehicle'&&escort){escort.userData.carried=false;carrying=false;escort=null;}
    if(task.interaction==='escort'){actorDirector.restoreActorPosition(task.obj,{x:task.pos[0],z:task.pos[1]});task.obj.position.y=groundHeight(...task.pos);actorDirector.setFollow(task.obj,false);}
  }
  if(chapter.id===9){const at=tasks.findIndex(t=>t.id==='durant-wait');if(at>=0)tasks[at].obj.visible=taskIndex>=at;}
  for(const i of saved.killedEnemyIndices){const e=enemies[i];e.alive=false;e.health=0;e.fallTime=3;e.obj.userData.animate?.(0,0,{dead:1});}
  for(const value of saved.mountedWeapons)Object.assign(mountedWeapons.find(m=>m.id===value.id).gun,value.gun);
  fieldInteractions.restoreUsed(saved.fieldCollectedIds);placeActorsOnGround();updateCamera(0);
}
function startChapterHandoff(option){
  ui.transition(null);ui.transitionFrame(null);
  chapterHandoff={plan:getChapterTransition(chapter.id),option,started:false,closingComplete:false,coveredFrames:0,swapped:false,swap:null};
  startSequence('closing',result=>{beginHandoffCover();chapterHandoff.closingComplete=true;if(result?.exitPose){camera.position.fromArray(result.exitPose.position);camera.quaternion.fromArray(result.exitPose.quaternion);camera.fov=result.exitPose.fov;camera.updateProjectionMatrix();}});
}
function beginHandoffCover(){
  if(!chapterHandoff||chapterHandoff.started)return;
  chapterHandoff.started=true;chapterTransition.start(chapterHandoff.plan,{response:chapterHandoff.option.response});ui.transition(chapterTransition.inspect());
  transitionEvents.push({type:'start',fromId:chapterHandoff.plan.from.id,toId:chapterHandoff.plan.to.id});
}
function updateChapterHandoff(dt){
  if(!chapterHandoff&&!chapterTransition.active)return;
  const closing=storyDirector.inspect(),handoff=chapterHandoff;
  if(handoff&&!handoff.started&&closing.phase==='closing'&&closing.duration-closing.time<=handoff.plan.timing.depart+handoff.plan.timing.fadeOut+.2)beginHandoffCover();
  const state=chapterTransition.update(dt);ui.transition(state);
  for(const event of chapterTransition.takeEvents()){
    if(event.type==='swap-scene'&&handoff)handoff.swap=event;
    if(event.type==='complete'){transitionEvents.push({...event});chapterHandoff=null;}
  }
  if(handoff&&state.opacity===1)handoff.coveredFrames++;
  if(handoff?.swap&&handoff.closingComplete&&!handoff.swapped&&handoff.coveredFrames>1){
    handoff.swapped=true;const event=handoff.swap;
    transitionEvents.push({...event,coveredFrames:handoff.coveredFrames-1});
    // The cover was rendered in the preceding frame. Construction and the
    // new opening happen underneath it; no intro/debrief is mounted in between.
    loadChapter(event.toId-1,{continuous:true});chapterTransition.sceneReady(event.id);
  }
  if(transitionEvents.length>90)transitionEvents.splice(0,transitionEvents.length-90);
}
function enterGameplay(){setMode('playing');camera.fov=74;camera.updateProjectionMatrix();weapon.visible=chapter.armed;updateCamera(.1);ui.mission(chapter,tasks[taskIndex],taskIndex);saveFieldCheckpoint();requestLock();ui.toast(chapter.movementLocked?'受伤机长视角 · 留在驾驶舱内 · E 回应与行动':'E 与人物交谈 / 回应随身无线电 · 完成现场行动后自动保存',5000);}
function startSequence(phase,continuation,event){leaveMountedWeapon(true);cinematicContinuation=continuation;setMode('cinematic');weapon.visible=false;audio.start();audio.setVolume(settings.volume);ui.cinematic(chapter);storyDirector.start({chapter,layout,actors:[...actors,...enemies.map(e=>e.obj),...tasks.filter(t=>!t.obj.userData.virtual).map(t=>t.obj)],phase,event});}
function play(){if(!chapter)return;audio.start();audio.setVolume(settings.volume);if(!chapterOpeningPlayed){chapterOpeningPlayed=true;startSequence('opening',enterGameplay);}else enterGameplay();}
function requestLock(){if(debugEnabled)return;try{const request=canvas.requestPointerLock();request?.catch(()=>{if(!lookWarning){ui.toast('点击画面锁定鼠标；也可按住右键拖动观察。');lookWarning=true;}});}catch{}}
function pause(){if(!['playing','cinematic'].includes(mode))return;if(mode==='playing')saveFieldCheckpoint();pausedMode=mode;storyDirector?.pause();chapterTransition.pause();setMode('paused');ui.pause(chapter);}
function resume(){if(!chapter){showMenu();return;}chapterTransition.resume();if(pausedMode==='cinematic'&&(storyDirector?.active||chapterTransition.active)){setMode('cinematic');ui.cinematic(chapter);storyDirector.resume();chapterTransition.resume();}else{setMode('playing');ui.mission(chapter,tasks[taskIndex],taskIndex);requestLock();}}
function action(name,value){
  audio.click();
  if(name==='new'){if(state){setMode('confirm');ui.confirmNew();}else beginNew();}
  else if(name==='combat-demo')beginBattleDemo();
  else if(name==='insertion-demo')beginBattleDemo(3);
  else if(name==='confirm-new')beginNew();
  else if(name==='continue'){if(state?.completed){setMode('ending');ui.ending(getEpilogue(state));}else loadChapter(state?.chapter||0,{restore:Boolean(state?.checkpoints?.[state?.chapter||0]),resumeField:true});}
  else if(name==='play')play();
  else if(name==='skip-cinematic'&&mode==='cinematic'){
    if(chapterHandoff&&!chapterHandoff.swapped){beginHandoffCover();chapterTransition.skip();ui.transition(chapterTransition.inspect());}
    storyDirector.skip();
  }
  else if(name==='dialogue-next'&&mode==='playing')pendingStoryPress=true;
  else if(name==='task-decision'&&mode==='playing'&&narrative?.inspect().phase==='decision'){
    const option=tasks[taskIndex]?.decision?.options.find(o=>o.id===value);if(!option||!canChoose(state.resources,option))return;
    consumeNarrative(narrative.chooseOption(value));if(mode==='playing')requestLock();
  }
  else if(name==='skip-optional'&&mode==='playing')consumeNarrative(narrative.skipOptional());
  else if(name==='resume')resume();
  else if(name==='restart')loadChapter(chapter?.id-1||0,{restore:true,resumeField:true});
  else if(name==='restart-chapter')loadChapter(chapter?.id-1||0,{restore:true});
  else if(name==='menu'){if(mode==='playing')saveFieldCheckpoint();showMenu();}
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
    state.chapterTimes??={};state.chapterTimes[chapter.id]={activeSeconds:Math.round(pacingElapsed),targetMinutes:[20,25]};choose(state,chapter,option);state.history.at(-1).fieldChoices=taskDecisions.map(d=>{const t=tasks.find(t=>t.id===d.taskId),o=t.decision.options.find(o=>o.id===d.optionId);return {...d,label:o.label,response:o.response};});delete state.fieldCheckpoint;save();audio.complete();
    if(!demoSession&&chapter.id<16){
      startChapterHandoff(option);
    }else startSequence('closing',()=>{setMode('debrief');ui.debrief(chapter,option,state);});
  }
  else if(name==='next'){if(demoSession){showMenu();}else if(chapter.id===16){setMode('ending');ui.ending(getEpilogue(state));}else loadChapter(chapter.id);}
  else if(name==='quit'){window.close();ui.toast('桌面版可使用 Alt+F4 退出。');}
  else if(name==='reload-app')location.reload();
}
function updateCamera(dt){
  if(!camera)return;
  if(mounted){
    const vehicle=mounted.vehicle;player.pitch=clamp(player.pitch,-.30,.65);vehicle.userData.aimTurret(player.yaw+Math.PI,player.pitch);
    const eye=vehicle.userData.turretPoint('camera');player.x=eye.x;player.y=eye.y;player.z=eye.z;camera.position.copy(eye);camera.rotation.order='YXZ';camera.rotation.set(player.pitch+recoil*.14,player.yaw,0);camera.fov=THREE.MathUtils.lerp(camera.fov,aiming?48:72,Math.min(1,dt*9));camera.updateProjectionMatrix();weapon.visible=false;return;
  }
  const crouch=keys.has('KeyC'),targetHeight=groundHeight(player.x,player.z)+(chapter?.movementLocked?.95:carrying?1.55:crouch?1.08:1.68);player.y=THREE.MathUtils.lerp(player.y,targetHeight,Math.min(1,dt*10));
  const moving=keys.has('KeyW')||keys.has('KeyS')||keys.has('KeyA')||keys.has('KeyD');const bob=settings.headbob&&moving&&mode==='playing'?Math.sin(elapsed*(keys.has('ShiftLeft')?12:8))*.023:0;
  camera.position.set(player.x,player.y+bob+(cinematic>0?cinematic*3.5:0),player.z);camera.rotation.order='YXZ';const rotorShake=settings.headbob&&mode==='playing'?aircraftPressure*.0015:0;camera.rotation.set(player.pitch+recoil*.35+Math.sin(elapsed*31)*rotorShake+(settings.headbob&&!settings.gentle?nearMissShock*.012:0),player.yaw+Math.cos(elapsed*23)*rotorShake*.5,(settings.headbob&&moving?Math.sin(elapsed*4)*.002:0)+Math.sin(elapsed*19)*rotorShake*.4+(settings.headbob&&!settings.gentle?nearMissShock*nearMissPan*.006:0));
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
    if(Number.isFinite(bounds.min.y))enemy.obj.position.y+=groundHeight(enemy.obj.position.x,enemy.obj.position.z)+THREE.MathUtils.lerp(.02,.006,fall)-bounds.min.y;
  }
}
function actorCallout(event){
  if(mode!=='playing'||chapterTime-lastBattleCallout<9||radioTimer<6||chapterTime<7||interaction>0)return;
  const text=typeof event==='string'?event:event.text;
  if(!text)return;lastBattleCallout=chapterTime;ui.subtitle(event.speaker||'小队频道',text,2600);audio.radio();
}
function impactFeedback(hit,gunType){
  if(!hit)return;const material=hit.kind==='ground'?(layout?.roads.some(r=>r.surface!=='sand'&&r.points.slice(1).some((b,i)=>{const a=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((hit.point.x-a[0])*dx+(hit.point.z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(hit.point.x-a[0]-t*dx,hit.point.z-a[1]-t*dz)<r.width/2;}))?'asphalt':'sand'):hit.material||'masonry';combatFeedback.hit({point:hit.point,normal:hit.normal,material,gunType});
  const dx=hit.point.x-player.x,dz=hit.point.z-player.z,distance=Math.hypot(dx,dz);
  if(distance<45)audio.bulletImpact(distance,clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-1,1),material,{gunType});
}
function receiveDamage(amount,source){
  player.health-=amount;damageFlash=1;nearMissShock=Math.max(.7,nearMissShock);
  const dx=source.x-player.x,dz=source.z-player.z;
  damageAngle=Math.atan2(dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw),-dx*Math.sin(player.yaw)-dz*Math.cos(player.yaw))*180/Math.PI;
  audio.hit();fieldInteractions?.cancel();
}

function initMountedWeapons(){
  if(!chapter?.armed||!chapter.hostiles.length)return;
  mountedWeapons=world.getVehicleSources().filter(v=>v.userData.turret&&!v.userData.medical&&!v.userData.burned).map((vehicle,i)=>({id:'vehicle-gun-'+i,vehicle,gun:createMountedGun(),aiWait:4+i*.6,burst:0,shotsAI:0}));
}
function mountExits(record){
  const v=record.vehicle;return [[-1.95,0,-.6],[1.95,0,-.6],[0,0,-3.25]].map(p=>v.localToWorld(new THREE.Vector3(...p))).filter(p=>clearDismount(p,physicalColliders(),layout.bounds));
}
function findMountCandidate(){
  if(!chapter?.armed||carrying||reloading||inConversation())return null;
  let best=null,dist=2.15;
  for(const record of mountedWeapons){if(!record.vehicle.visible)continue;for(const exit of mountExits(record)){const d=Math.hypot(player.x-exit.x,player.z-exit.z);if(d<dist&&!traceObstacles({x:player.x,y:groundHeight(player.x,player.z)+.7,z:player.z},{x:exit.x,y:groundHeight(exit.x,exit.z)+.7,z:exit.z},physicalColliders())){dist=d;best=record;}}}return best;
}
function leaveMountedWeapon(forced=false){
  if(!mounted)return true;
  const exits=mountExits(mounted),old=mounted.entry;let exit=old&&clearDismount(old,physicalColliders(),layout.bounds)?old:exits[0];
  if(!exit&&!forced){ui.toast('下车位置受阻，先转向另一侧再试。');return false;}
  if(exit){player.x=exit.x;player.z=exit.z;player.y=groundHeight(exit.x,exit.z)+1.68;}
  mountedPose?.dispose();mountedPose=null;
  if(mounted.vehicle.userData.turret.crew)mounted.vehicle.userData.turret.crew.visible=true;
  mounted=null;mouseDown=false;aiming=false;recoil=0;weapon&&(weapon.visible=Boolean(chapter?.armed));return true;
}
function toggleMountedWeapon(){
  if(mode!=='playing')return;
  if(mounted){if(leaveMountedWeapon())ui.toast('已返回步战');return;}
  const record=findMountCandidate();if(!record){ui.toast('靠近悍马两侧，按 V 接管车载机枪');return;}
  mounted=record;mounted.entry={x:player.x,z:player.z};mounted.burst=0;mouseDown=false;aiming=false;reloading=0;keys.clear();pendingStoryPress=false;
  mountedPose=createMountedGunnerPose({world,vehicle:record.vehicle});
  player.yaw=record.vehicle.rotation.y+record.vehicle.userData.turret.yaw.rotation.y+Math.PI;player.pitch=0;updateCamera(.1);ui.toast('M2 枪位 · 左键射击 · R 更换弹链 · V 返回步战',5000);
}
function friendlyInLine(from,to){
  return actors.some(a=>a.visible&&a.userData.kind!=='wounded'&&nearestOnSegment({x:a.position.x,y:a.position.y+1.15,z:a.position.z},from,to).distance<.65);
}
function mountedRound(record,direction,playerControlled){
  const from=record.vehicle.userData.turretPoint('muzzle'),end=from.clone().addScaledVector(direction,MOUNTED_M2.range);
  const ray=new THREE.Raycaster(from,direction,0,MOUNTED_M2.range);let target=null,point=null,best=MOUNTED_M2.range;
  for(const e of enemies){if(!e.alive||!e.obj.visible)continue;const hits=ray.intersectObject(e.obj,true);if(hits.length&&hits[0].distance<best){target=e;point=hits[0].point;best=hits[0].distance;}}
  if(point)end.copy(point);
  const hit=traceObstacles(from,end,physicalColliders());if(hit)end.set(hit.point.x,hit.point.y,hit.point.z);
  const friendly=friendlyInLine(from,end);
  if(target&&!hit&&!friendly){damageEnemy(target,playerControlled?MOUNTED_M2.damage:18);combatFeedback.actorHit({point,direction,killed:!target.alive,gunType:'mounted-m2'});if(playerControlled){hitTimer=.24;killConfirm=!target.alive;audio.confirmHit(killConfirm);}}
  combatFeedback.shot({from,to:end,faction:playerControlled?'player':'ally',gunType:'mounted-m2'});impactFeedback(hit,'mounted-m2');
  const dx=from.x-player.x,dz=from.z-player.z,d=Math.hypot(dx,dz);if(playerControlled)audio.shot('mounted-m2');else audio.shotAt(d,clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,d),-1,1),'mounted-m2');
  actorDirector.notifyThreat({position:[end.x,end.z],source:[from.x,from.z],start:[from.x,from.z],end:[end.x,end.z],radius:5,intensity:1,kind:'shot',faction:playerControlled?'player':'ally',shooterId:record.id});
  shotLog.push({shooterId:record.id,faction:playerControlled?'player':'ally',weapon:'mounted-m2',from:[from.x,from.z],to:[end.x,end.z],impact:hit?.kind||null,time:chapterTime});if(shotLog.length>120)shotLog.shift();
}
function shootMountedWeapon(){
  if(mode!=='playing'||!mounted||!fireMountedGun(mounted.gun))return;
  camera.getWorldDirection(forward);const spread=aiming?.0016:.004;forward.x+=(Math.random()-.5)*spread;forward.y+=(Math.random()-.5)*spread;forward.normalize();
  mountedRound(mounted,forward.clone(),true);recoil=Math.min(.16,recoil+.06);player.pitch=clamp(player.pitch+.0018,-.30,.65);
}
function updateMountedWeapons(dt){
  if(!(dt>0))return;
  let active=0;
  for(const record of mountedWeapons){
    stepMountedGun(record.gun,dt);const reloadProgress=record.gun.reload>0?1-record.gun.reload/MOUNTED_M2.reloadTime:0;
    const cover=record.vehicle.getObjectByName('MountedFeedCover'),charging=record.vehicle.getObjectByName('MountedChargingHandle');
    if(cover)cover.rotation.x=reloadProgress>0?Math.min(1,Math.max(0,(reloadProgress-.1)/.12))*Math.min(1,Math.max(0,(.83-reloadProgress)/.13))*1.22:0;
    if(charging)charging.position.z=-.01-(reloadProgress>.82?Math.sin((reloadProgress-.82)/.18*Math.PI)*.13:0);
    record.vehicle.userData.turret.pitch.position.z=-.025*Math.pow(record.gun.cooldown/MOUNTED_M2.interval,3);if(record===mounted){mountedPose?.update(dt,reloadProgress);continue;}record.aiWait=Math.max(0,record.aiWait-dt);
    if(chapterTime<6||!record.vehicle.visible||record.gun.reload||record.gun.overheated||Math.hypot(record.vehicle.position.x-player.x,record.vehicle.position.z-player.z)>60)continue;
    if(record.gun.ammo===0){reloadMountedGun(record.gun);continue;}if(active>=2)continue;
    const origin=record.vehicle.userData.turretPoint('muzzle');
    const target=enemies.filter(e=>e.alive&&e.obj.visible).map(e=>({e,d:origin.distanceTo(new THREE.Vector3(e.x,e.obj.position.y+1.25,e.z))})).filter(v=>v.d<72).sort((a,b)=>a.d-b.d).find(({e})=>{const aim={x:e.x,y:e.obj.position.y+1.25,z:e.z};return !traceObstacles(origin,aim,physicalColliders())&&!tacticalSmoke.obscures(origin,aim)&&!friendlyInLine(origin,aim);});
    if(!target){record.burst=0;continue;}active++;
    const aim=new THREE.Vector3(target.e.x,target.e.obj.position.y+1.25,target.e.z),delta=aim.clone().sub(origin);
    const yaw=Math.atan2(delta.x,delta.z),current=record.vehicle.rotation.y+record.vehicle.userData.turret.yaw.rotation.y,difference=Math.atan2(Math.sin(yaw-current),Math.cos(yaw-current));
    record.vehicle.userData.aimTurret(current+clamp(difference,-dt*1.8,dt*1.8),Math.atan2(delta.y,Math.hypot(delta.x,delta.z)));
    if(Math.abs(difference)>.08)continue;
    if(record.aiWait>0||record.gun.cooldown>0)continue;
    if(!record.burst)record.burst=3;
    if(fireMountedGun(record.gun)){delta.x+=(Math.random()-.5)*1.5;delta.y+=(Math.random()-.5)*.65;mountedRound(record,delta.normalize(),false);record.shotsAI++;record.burst--;if(!record.burst)record.aiWait=2.4+Math.random()*1.5;}
  }
}
function orderSuppression(){
  if(mode!=='playing'||!chapter?.armed||!chapter.hostiles.length)return;
  const from=camera.position.clone(),end=from.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),45),hit=traceObstacles(from,end,physicalColliders());
  if(hit)end.set(hit.point.x,hit.point.y,hit.point.z);
  actorDirector.setSuppressionTarget([end.x,end.z],8);audio.radio();ui.subtitle('小队频道','压住指向的街口。我来转移位置。',2500);ui.toast('小队压制该方向 8 秒 · Q 烟幕掩护转移 · F 跟随 / 坚守',4000);
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
  const origin=new THREE.Vector3(player.x,groundHeight(player.x,player.z)+.35,player.z),target=origin.clone().add(new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw)).multiplyScalar(2.4));
  const hit=traceObstacles(origin,target,physicalColliders());if(hit)target.copy(origin).lerp(target,Math.max(0,hit.fraction-.16));
  target.y=groundHeight(target.x,target.z)+.006;if(!tacticalSmoke.deploy(target))return;smokeCharges--;audio.smoke();ui.toast('烟幕正在展开 · 遮挡双方视线，子弹仍能穿过',3500);
}
function actorFire(event){
  if(mode!=='playing'||chapterTime<2)return;
  const from=new THREE.Vector3(event.origin.x,event.origin.y??1.3,event.origin.z);
  const aim=new THREE.Vector3(event.aim.x,event.aim.y??1.25,event.aim.z);
  const to=aim.clone();
  if(traceObstacles(from,to,physicalColliders()))return;
  const muzzle=event.actor?.userData.getMuzzlePosition?.();if(muzzle)from.copy(muzzle);
  shotLog.push({shooterId:event.id,faction:event.faction,from:[from.x,from.z],to:[to.x,to.z],blocked:Boolean(traceObstacles(from,to,physicalColliders())),time:chapterTime});
  if(shotLog.length>120)shotLog.shift();
  if(shotLog.at(-1).blocked){shotLog.pop();return;}
  // A visible miss follows its own trajectory into the street or nearby cover.
  const targetHit=Math.random()<(event.faction==='enemy'?(event.accuracy??(keys.has('KeyC')?.14:.27)):.22);
  if(!targetHit){
    to.x+=(Math.random()<.5?-1:1)*(.55+Math.random()*1.25);to.y-=.25+Math.random()*.45;to.z+=(Math.random()-.5)*.8;
    const direction=to.clone().sub(from).normalize();to.copy(from).addScaledVector(direction,Math.min(85,from.distanceTo(aim)+42));
  }
  const hit=traceObstacles(from,to,physicalColliders());if(hit)to.set(hit.point.x+hit.normal.x*.005,hit.point.y+hit.normal.y*.005,hit.point.z+hit.normal.z*.005);
  Object.assign(shotLog.at(-1),{aim:[aim.x,aim.z],to:[to.x,to.z],impact:hit?.kind||null,blocked:Boolean(traceObstacles(from,to,physicalColliders()))});
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
  if(mounted){shootMountedWeapon();return;}
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
  if(closest&&!hit){damageEnemy(closest,hitPoint.y-closest.obj.position.y>1.4?100:(weaponInfo().damage??34));hitTimer=.24;killConfirm=!closest.alive;audio.confirmHit(killConfirm);combatFeedback.actorHit({point:hitPoint,direction:raycaster.ray.direction,killed:killConfirm});}
  if(hit)end.set(hit.point.x,hit.point.y,hit.point.z);combatFeedback.shot({from:muzzle,to:end,faction:'player',weaponId:player.weaponId});impactFeedback(hit);actorDirector.notifyThreat({position:[end.x,end.z],source:[player.x,player.z],start:[muzzle.x,muzzle.z],end:[end.x,end.z],radius:4,intensity:.8,kind:'shot',faction:'player'});
}
function reload(){if(mounted){if(reloadMountedGun(mounted.gun)){audio.reload();ui.toast('更换机枪弹链 · 保持掩护');}return;}if(!chapter?.armed||mode!=='playing'||reloading>0||player.mag>=weaponInfo().magSize||state.resources.ammo<=0)return;reloading=weaponInfo().reloadTime;audio.reload();}
function selectWeapon(id){
  if(mounted||!chapter?.armed||mode!=='playing'||reloading>0||id===player.weaponId||!PLAYER_WEAPON_IDS.includes(id))return;
  Object.assign(player,selectMagazine(stowedMagazines,player.weaponId,id,player.mag));
  weaponController.setWeapon(player.weaponId);recoil=0;aiming=false;cooldown=.35;mouseDown=false;
  ui.toast(`${PLAYER_WEAPON_IDS.indexOf(id)+1} · ${weaponInfo().name} · R 装填`);
  if(player.mag===0&&state.resources.ammo>0)reload();
}
function heal(){if(mode!=='playing')return;if(player.health>=100){ui.toast('当前无需使用救护物资。');return;}if(state.resources.medicine<=0){ui.toast('救护物资已用完。寻找补给，利用遮挡减少受伤。');return;}state.resources.medicine--;player.health=Math.min(100,player.health+45);audio.complete();ui.toast('已使用一份救护物资 · 恢复 45 点状态');}
function completeTask(task,{skipped=false}={}){
  if(!task||task.done)return;task.done=true;interaction=0;audio.complete();ui.dialogue(null);ui.subtitle(chapter.role.split(' · ')[0],task.text,4500);
  if(!skipped&&task.reward==='supplies'){if(chapter.armed){state.resources.ammo=Math.min(240,state.resources.ammo+12);ui.toast('补给已取回 · 备用弹药 +12');}else{state.resources.medicine=Math.min(12,state.resources.medicine+1);ui.toast('救护物资 +1');}}
  if(task.interaction==='escort'){actorDirector?.setFollow(task.obj,false);if(escort===task.obj)escort=null;ui.toast('同行者已抵达接应处。');}
  if(task.animation==='carry'&&task.kind==='wounded'){escort=task.obj;carrying=true;task.obj.userData.carried=true;ui.toast('正在协助转移伤员 · 移动速度降低');}
  if(task.kind==='vehicle'&&escort){actorDirector?.setFollow(escort,false);carrying=false;escort.userData.carried=false;escort=null;ui.toast('人员已交接给救援车辆。');}
  taskIndex++;if(chapter.id===9&&tasks[taskIndex]?.id==='durant-wait')tasks[taskIndex].obj.visible=true;ui.mission(chapter,tasks[taskIndex],taskIndex);
  const next=tasks[taskIndex];if(next?.obj.userData.recoverFrom){next.obj.userData.recoverFrom.visible=false;next.obj.visible=true;}
  const after=()=>{if(taskIndex>=tasks.length){setMode('choice');ui.choice(chapter,{...state.resources,ammo:state.resources.ammo+allLoaded()},task.text);}else{enterGameplay();}};
  saveFieldCheckpoint();
  if(task.sceneEvent&&!skipped)startSequence('event',after,task);else if(taskIndex>=tasks.length)after();
}

function taskGoal(task){
  if(task.interaction==='radio')return [player.x,player.z];
  if(task.interaction==='escort')return narrative.inspect().phase==='action'?task.pos:[task.obj.position.x,task.obj.position.z];
  if(task.obj.userData.interactionAnchor){const p=task.obj.localToWorld(task.obj.userData.interactionAnchor.clone());return [p.x,p.z];}
  return task.obj.userData.taskId?[task.obj.position.x,task.obj.position.z]:task.pos;
}
function storyContext(task){
  const goal=taskGoal(task),distance=Math.hypot(player.x-goal[0],player.z-goal[1]);
  const actorNear=task.interaction==='escort'&&narrative.inspect().phase!=='action'?Math.hypot(player.x-task.obj.position.x,player.z-task.obj.position.z)<3.4:distance<3.4;
  return {taskId:task.id,near:actorNear,clear:task.interaction==='radio'||!lineBlocked(player,{x:goal[0],z:goal[1]},world.colliders),blocked:reloading>0||mouseDown,held:keys.has('KeyE'),kills:enemies.filter(e=>!e.alive).length,escortReady:Math.hypot(player.x-task.pos[0],player.z-task.pos[1])<4&&Math.hypot(task.obj.position.x-task.pos[0],task.obj.position.z-task.pos[1])<5,distance,goal};
}
function consumeNarrative(result){
  narrativeView=result;
  for(const event of result.events||[]){
    storyEventLog.push({...event,time:chapterTime});
    if(event.type==='dialogue'){
      const line=result.line||event.line; if(line?.channel==='radio')audio.radio();else audio.click();
      mouseDown=false;aiming=false;keys.delete('KeyW');keys.delete('KeyA');keys.delete('KeyS');keys.delete('KeyD');
      const task=tasks[taskIndex];if(task&&!task.obj.userData.virtual){const p=task.obj.position;player.yaw=Math.atan2(player.x-p.x,player.z-p.z);player.pitch=Math.atan2(p.y+(task.obj.userData.kind==='wounded'?.45:1.5)-player.y,Math.max(1,Math.hypot(p.x-player.x,p.z-player.z)));}
    }
    if(event.type==='decision'){mouseDown=false;aiming=false;keys.clear();releasePointer();}
    if(event.type==='action-start'){
      taskAnimationTime=0;const task=tasks[taskIndex];
      if(task?.interaction==='escort'){escort=task.obj;actorDirector.setFollow(escort,true);ui.toast('同行者开始跟随 · 带他到金色标记处，确认没有掉队。');}
    }
    if(event.type==='decision-made'){
      const task=tasks.find(t=>t.id===event.taskId),option=task?.decision?.options.find(o=>o.id===event.optionId);
      if(option&&!taskDecisions.some(d=>d.taskId===task.id)){state.resources=applyEffects(state.resources,option.effects);taskDecisions.push({taskId:task.id,optionId:option.id});ui.toast(option.response,6000);}
      ui.taskDecision(null);
    }
    if(event.type==='task-complete')completeTask(tasks.find(t=>t.id===event.taskId)||tasks[taskIndex],event);
  }
}
function updateNarrative(dt){
  const task=tasks[taskIndex];if(!task)return false;
  let context=storyContext(task);
  if(pendingStoryPress){pendingStoryPress=false;consumeNarrative(narrative.press(context));if(mode!=='playing'||tasks[taskIndex]!==task)return true;}
  consumeNarrative(narrative.update(dt,context));if(mode!=='playing'||tasks[taskIndex]!==task)return true;
  const view=narrative.inspect(),talking=['dialogue','decision'].includes(view.phase);narrativeView=view;interaction=view.progress||0;
  ui.dialogue(view.phase==='dialogue'?{...view.line,index:view.lineIndex,total:task.dialogue?.length||1}:null);ui.taskDecision(view.decision,state.resources);ui.optionalTask(!talking?task:null);weapon.visible=chapter.armed&&!talking&&!mounted;
  if(talking){ui.interaction(null,0,false);ui.waypoint(0,0,0,false);const speaker=task.participantActors.find(a=>a.name===view.line?.speaker)||task.obj;speaker.userData.animate?.(0,dt,{stance:'stand',talk:1,aimTarget:[player.x,player.y,player.z]});return true;}
  const labels={talk:'按 E 交谈 · 逐句回应',radio:'按 E 接通随身无线电',reach:'前往标记位置',hold:'按住 E 执行现场行动，松开取消',defend:`守住位置 ${Math.floor(view.defendElapsed||0)} / ${task.defendSeconds||0} 秒 · 敌人已击退 ${context.kills} / ${task.requiredKills||0}`,escort:'带领同行者到指定接应处'};
  let detail=view.phase==='idle'?'按 E 开始对话':labels[task.interaction];
  if(view.phase==='action'&&task.interaction==='escort'){const remaining=Math.hypot(task.obj.position.x-task.pos[0],task.obj.position.z-task.pos[1]);detail=`同行者距接应处 ${remaining.toFixed(0)} 米 · 带他进入标记中心`;}
  ui.interaction({...task,detail},view.progress||0,context.near||task.interaction==='radio');
  if(task.interaction!=='radio'){
    const goal=context.goal;tempVector.set(goal[0],groundHeight(goal[0],goal[1])+2,goal[1]);tempVector.project(camera);const front=tempVector.z<1&&tempVector.z>-1;
    ui.waypoint(clamp((tempVector.x*.5+.5)*innerWidth,30,innerWidth-30),clamp((-.5*tempVector.y+.5)*innerHeight,145,innerHeight-100),context.distance,front&&(!context.near||task.interaction==='escort'&&!context.escortReady));
  }else ui.waypoint(0,0,0,false);
  if(view.phase==='action'&&context.held&&context.near){taskAnimationTime+=dt;const helper=companion||actors.find(a=>a!==task.obj&&a.userData.kind==='soldier');helper?.userData.animate?.(0,dt,{stance:task.animation==='treat'?'treat':'kneel',talk:.2,aimTarget:[task.obj.position.x,task.obj.position.y+.7,task.obj.position.z]});}
  return context.near||task.interaction==='radio';
}
function placeActorsOnGround(){
  for(const actor of actors)if(!actor.userData.carried)actor.position.y=groundHeight(actor.position.x,actor.position.z);
  for(const enemy of enemies)if(enemy.alive)enemy.obj.position.y=groundHeight(enemy.obj.position.x,enemy.obj.position.z);
}
function updatePlaying(dt){
  nearMissShock=Math.max(0,nearMissShock-dt*4);
  damageFlash=Math.max(0,damageFlash-dt*2.6);
  chapterTime+=dt;cinematic=Math.max(0,cinematic-dt);cooldown=Math.max(0,cooldown-dt);muzzleFlashTime=Math.max(0,muzzleFlashTime-dt);recoil*=Math.exp(-dt*11);hitTimer=Math.max(0,hitTimer-dt);if(flash)flash.visible=false;
  if(reloading>0){reloading=Math.max(0,reloading-dt);if(reloading===0){const count=roundsToLoad(weaponInfo().magSize,player.mag,state.resources.ammo);player.mag+=count;state.resources.ammo-=count;}}
  audio.reloadPhase(mounted?(mounted.gun.reload>0?1-mounted.gun.reload/MOUNTED_M2.reloadTime:0):(reloading>0?1-reloading/weaponInfo().reloadTime:0),mounted?'mounted-m2':player.weaponId);
  const crouched=keys.has('KeyC'),sprint=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&player.stamina>2&&!crouched&&!carrying;
  const talking=inConversation();
  let dx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),dz=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);const len=Math.hypot(dx,dz),moving=len>0&&!talking&&!chapter.movementLocked&&!mounted;
  if(moving){dx/=len;dz/=len;const speed=(carrying?2.15:crouched?2.15:sprint?6.3:3.7)*(1-state.resources.fatigue*.012);const sin=Math.sin(player.yaw),cos=Math.cos(player.yaw);movePlayer(player,(dx*cos+dz*sin)*speed*dt,(dz*cos-dx*sin)*speed*dt,physicalColliders(),layout?.bound||92);if(layout?.bounds){player.x=clamp(player.x,layout.bounds.minX+.36,layout.bounds.maxX-.36);player.z=clamp(player.z,layout.bounds.minZ+.36,layout.bounds.maxZ-.36);}stepTimer-=dt;if(stepTimer<=0){audio.step(sprint);stepTimer=sprint?.28:.46;}if(sprint)player.stamina=Math.max(0,player.stamina-dt*(settings.gentle?8:16));else player.stamina=Math.min(100,player.stamina+dt*9);}
  else player.stamina=Math.min(100,player.stamina+dt*(13-state.resources.fatigue*.6));
  updateCamera(dt);
  if(mouseDown&&!talking)shoot();
  const activeTask=tasks[taskIndex],nearPatient=tasks.find(t=>t.kind==='wounded'&&!t.done&&Math.hypot(player.x-t.pos[0],player.z-t.pos[1])<9);
  updateCasualties(dt);
  actorDirector.update(talking?0:dt,{player:{...player,crouched,flashlight:flashlightOn},visibilityRange:chapter.mood==='night'?22:52,difficulty:settings.gentle?'easy':'normal',combatAllowed:chapter.hostiles.length>0&&!talking,interactionActor:talking||keys.has('KeyE')?activeTask?.obj:null,treatActor:nearPatient?.obj,carrying});
  placeActorsOnGround();updateMountedWeapons(talking?0:dt);
  if(companion){const distance=Math.hypot(companion.position.x-player.x,companion.position.z-player.z);
    if(!assistUsed&&player.health<35&&state.resources.cohesion>=5&&distance<6){assistUsed=true;player.health=Math.min(100,player.health+25);ui.subtitle('同伴','别掉队。我在你旁边。');ui.toast('此前建立的凝聚力带来同伴支援 · 状态 +25');}}
  if(player.health<=0){player.health=0;setMode('failed');ui.failure();return;}
  if(escort?.userData.carried){const x=player.x+Math.sin(player.yaw)*1.4,z=player.z+Math.cos(player.yaw)*1.4;escort.position.set(x,groundHeight(x,z)+.55,z);escort.rotation.y=player.yaw;}
  const taskNear=updateNarrative(dt);if(mode!=='playing')return;
  fieldPrompt=fieldInteractions.update(dt,{player,camera,held:keys.has('KeyE'),blocked:taskNear||reloading>0||mouseDown||carrying||cinematic>0});
  if(!taskNear)ui.interaction(fieldPrompt,fieldPrompt.progress,fieldPrompt.near);
  mountPrompt=!mounted&&!talking?findMountCandidate():null;
  if(mounted)ui.interaction({key:'V',label:'离开车载机枪',detail:'鼠标瞄准 / 左键射击 · R 换弹链 · 短点射控制温度'},mounted.gun.heat,true);
  else if(mountPrompt)ui.interaction({key:'V',label:'接管 M2 车载机枪',detail:'按 V 登上枪位 · 保留随身武器与弹药'},0,true);
  radioTimer=Math.max(0,radioTimer-dt);
  ui.vitals(player,state,chapter.armed,reloading>0,weaponInfo());if(mounted){document.getElementById('mag').textContent=mounted.gun.reload?'—':mounted.gun.ammo;document.getElementById('reserve').textContent='/ '+mounted.gun.reserve;document.getElementById('weapon-label').textContent='M2 车载机枪 · '+(mounted.gun.reload?'更换弹链':mounted.gun.overheated?'过热 · 等待冷却':'温度 '+Math.round(mounted.gun.heat*100)+'%')+' · R 换弹链 / V 离开';}camera.getWorldDirection(clockDirection);const heading=Math.atan2(clockDirection.x,-clockDirection.z)*180/Math.PI;document.getElementById('heading').textContent=`${((heading+360)%360).toFixed(0).padStart(3,'0')}°`;
  ui.combat({hit:hitTimer,kill:killConfirm,damageFlash,damageAngle,suppression:nearMissShock,spread:recoil*90+(moving?6:0),aimed:aiming&&reloading<=0,smokes:smokeCharges,squad:squadOrder,suppressionOrder:actorDirector.getSuppressionOrder?.(),armed:chapter.armed,combat:chapter.hostiles.length>0,carrying,night:chapter.mood==='night',flashlight:flashlightOn});
  if(player.health<=0){player.health=0;setMode('failed');ui.failure();}
}
function frame(){requestAnimationFrame(frame);const now=performance.now(),activeDelta=Math.max(0,(now-lastTime)/1000),dt=Math.min(activeDelta,.05)||.016;lastTime=now;if(['playing','menu','cinematic'].includes(mode))elapsed+=dt;
  if(chapter&&['playing','cinematic','choice'].includes(mode)&&!chapterTransition.active)pacingElapsed+=activeDelta;
  if(!world)return;world.update(['playing','menu','cinematic'].includes(mode)?dt:0,elapsed,camera);
  if(['cinematic','playing'].includes(mode))updateChapterHandoff(dt);
  if(mode==='cinematic'){
    storyDirector.setInput?.({forward:keys.has('KeyW'),back:keys.has('KeyS'),left:keys.has('KeyA'),right:keys.has('KeyD'),held:keys.has('KeyE'),lookX:sceneLook.x,lookY:sceneLook.y});
    sceneLook.x=sceneLook.y=0;storyDirector.update(dt);
    if(mode==='cinematic')ui.sceneAction(storyDirector.inspect().playerAction);
  }
  tacticalSmoke.update(mode==='playing'?dt:0,camera);
  const aircraft=world.getAircraftState?.();if(mode==='cinematic'){aircraftPressure=0;}else if(aircraft?.position){const ap=aircraft.position;tempVector.set(ap[0]-camera.position.x,ap[1]-camera.position.y,ap[2]-camera.position.z);const distance=tempVector.length();const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);const pan=clamp(tempVector.dot(right)/Math.max(distance,1),-1,1);aircraftPressure=mode==='playing'&&aircraft.visible!==false?Math.pow(Math.max(0,1-distance/55),2):0;audio.updateAircraft?.(distance,pan,mode==='playing'&&aircraft.visible!==false,dt);}else{aircraftPressure=0;audio.updateAircraft?.(500,0,false,dt);}
  let fireDistance=500,firePan=0;
  for(const origin of world.getFireSources?.()||[]){tempVector.set(origin[0]-camera.position.x,origin[1]-camera.position.y,origin[2]-camera.position.z);const distance=tempVector.length();if(distance<fireDistance){fireDistance=distance;firePan=clamp(tempVector.dot(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion))/Math.max(1,distance),-1,1);}}
  audio.updateBattle(dt,fireDistance,firePan,['playing','cinematic'].includes(mode));
  const vehicleRight=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const vehicleSources=(world.getVehicleSources?.()||[]).map(object=>{object.getWorldPosition(tempVector);const x=tempVector.x,z=tempVector.z;tempVector.sub(camera.position);const distance=tempVector.length();return{x,z,yaw:object.rotation.y,rear:object.userData.vehicleType==='cargo-truck'?2.9:1.6,distance,pan:tempVector.dot(vehicleRight)/Math.max(1,distance),speed:object.userData.vehicleMotion?.speed||0};});
  audio.updateVehicles?.(vehicleSources,['playing','cinematic'].includes(mode));
  if(mode==='playing')updatePlaying(dt);
  else if(mode==='gallery'){if(!galleryDrag)galleryAngle+=dt*.08;galleryActor.rotation.y=galleryAngle;galleryActor.userData.animate?.(0,dt);if(galleryWeaponId(galleryKind)){const size=galleryActor.userData.gallerySize||[1,.3,.2],distance=Math.max(.46,Math.max(size[0]/camera.aspect,size[1])/(2*Math.tan(19*Math.PI/180))*1.65);camera.position.set(.035,galleryClose?.03:.07,distance*(galleryClose?.55:1));camera.lookAt(0,0,0);camera.fov=38;}else{camera.position.set(.12,galleryClose?1.61:1.12,galleryClose?1.1:3.9);camera.lookAt(0,galleryClose?1.52:.97,0);camera.fov=galleryClose?43:36;}camera.updateProjectionMatrix();}
  else if(!chapter){menuTime+=dt;camera.position.set(5.2+Math.sin(menuTime*.045)*.65,2.6+Math.sin(menuTime*.06)*.12,7);camera.lookAt(-1,3.3,-13);camera.fov=58;camera.updateProjectionMatrix();actorDirector?.update(dt,{player:{x:0,z:50,yaw:0},combatAllowed:false});placeActorsOnGround();}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.life<=0){scene.remove(e.obj);e.obj.geometry.dispose();e.obj.material.dispose();effects.splice(i,1);}}
  if(mode!=='gallery'){
    battleAtmosphere.update(['playing','menu','cinematic'].includes(mode)?dt:0,elapsed,camera,{active:mode==='playing',combat:Boolean(chapter?.hostiles.length),mood:chapter?.mood||'dusk',vehicles:['playing','cinematic'].includes(mode)?vehicleSources:[]});
    for(const event of battleAtmosphere.takeEvents()){const dx=event.x-camera.position.x,dz=event.z-camera.position.z,distance=Math.hypot(dx,dz),pan=clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-1,1);audio.impact(distance,pan,Boolean(traceObstacles(camera.position,{x:event.x,y:1,z:event.z},gameColliders)));actorDirector?.notifyThreat({position:[event.x,event.z],source:[event.x,event.z],radius:30,intensity:.9,kind:'explosion'});}
  }
  combatFeedback.update(mode==='playing'?dt:0,camera);camera.updateMatrixWorld(true);world.updateShadows?.(camera);if(fieldFlashlight){camera.getWorldDirection(forward);const beamEnd=camera.position.clone().addScaledVector(forward,24),beamHit=traceObstacles(camera.position,beamEnd,gameColliders);fieldFlashlight.update(mode==='playing'?dt:0,{blockedDistance:beamHit?camera.position.distanceTo(new THREE.Vector3(beamHit.point.x,beamHit.point.y,beamHit.point.z)):24});}renderer.info.reset();if(mode==='gallery')renderer.render(galleryScene,camera);else cinema.render(elapsed,dt);
  if(chapterHandoff&&!chapterHandoff.swapped&&!['covered','fade-in'].includes(chapterTransition.inspect().phase))ui.transitionFrame(canvas);
}
function bindInput(){
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();resizeRender();});
  window.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','Space','Tab','KeyE','KeyR','KeyC','ShiftLeft','ShiftRight','Escape'].includes(e.code)||/^Digit[1-9]$/.test(e.code))e.preventDefault();if(e.code==='Escape'){if(e.repeat)return;if(['playing','cinematic'].includes(mode))pause();else if(mode==='paused')resume();else if(['settings','journal','chapters','about'].includes(mode))action('back');return;}if(e.code==='Tab'&&!e.repeat){if(mode==='playing')action('journal');else if(mode==='journal')action('back');return;}if(mode==='cinematic'){if(['KeyW','KeyA','KeyS','KeyD','KeyE'].includes(e.code))keys.add(e.code);return;}if(mode!=='playing')return;keys.add(e.code);if(e.code==='KeyE'&&!e.repeat&&!mounted)pendingStoryPress=true;if(inConversation()){if(narrative.inspect().phase==='decision'&&/^Digit[1-9]$/.test(e.code)&&!e.repeat){const option=tasks[taskIndex].decision.options[Number(e.code.slice(-1))-1];if(option)action('task-decision',option.id);}return;}if(e.code==='KeyX'&&!e.repeat&&tasks[taskIndex]?.optional)action('skip-optional');if(e.code==='KeyV'&&!e.repeat)toggleMountedWeapon();if(e.code==='KeyG'&&!e.repeat)orderSuppression();if(e.code==='KeyR'&&!e.repeat)reload();if(e.code==='KeyH'&&!e.repeat)heal();if(e.code==='KeyQ'&&!e.repeat)releaseSmoke();if(e.code==='KeyF'&&!e.repeat)toggleSquadOrder();if(e.code==='KeyT'&&!e.repeat){flashlightOn=!flashlightOn;fieldFlashlight.setEnabled(flashlightOn);ui.toast(flashlightOn?'手电已开启 · T 关闭':'手电已关闭');}if(/^Digit[1-9]$/.test(e.code)&&!e.repeat)selectWeapon(PLAYER_WEAPON_IDS[Number(e.code.slice(-1))-1]);});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();mouseDown=false;if(['playing','cinematic'].includes(mode))pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','cinematic'].includes(mode))pause();});
  canvas.addEventListener('wheel',e=>{if(mode==='playing'&&chapter?.armed){e.preventDefault();selectWeapon(nextWeapon(PLAYER_WEAPON_IDS,player.weaponId,e.deltaY));}},{passive:false});
  canvas.addEventListener('mousedown',e=>{if(mode==='cinematic'){if(e.button===2)dragging=true;return;}if(mode!=='playing')return;if(e.button===0){if(document.pointerLockElement===canvas||debugEnabled){mouseDown=true;burstRemaining=weaponInfo().fireMode==='burst'?3:0;}else requestLock();}if(e.button===2){aiming=true;dragging=true;}});
  window.addEventListener('mousedown',e=>{if(mode==='gallery'&&!e.target.closest('button'))galleryDrag=true;});
  window.addEventListener('mousemove',e=>{if(mode==='gallery'&&galleryDrag)galleryAngle+=e.movementX*.009;});
  window.addEventListener('mouseup',()=>galleryDrag=false);
  window.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;if(e.button===2){aiming=false;dragging=false;}});
  window.addEventListener('mousemove',e=>{if(mode==='cinematic'&&dragging){sceneLook.x+=e.movementX*.002*settings.sensitivity;sceneLook.y+=e.movementY*.002*settings.sensitivity;return;}if(mode!=='playing'||(!document.pointerLockElement&&!dragging))return;player.yaw-=e.movementX*.002*settings.sensitivity;player.pitch=clamp(player.pitch-e.movementY*.002*settings.sensitivity,-1.35,1.35);});
  window.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){mouseDown=false;aiming=false;const intentional=intentionalUnlock;intentionalUnlock=false;if(mode==='playing'&&!intentional)pause();}});
  document.addEventListener('pointerlockerror',()=>ui.toast('鼠标未锁定。点击画面重试，或按住右键拖动观察。'));
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setMode('error');ui.error('显卡上下文已中断。已保存的章节进度仍在，请重新加载。');});
}
async function boot(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
    camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.05,600);await Promise.all([prepareWeapon(renderer),prepareMountedHands()]);world=await createWorld(renderer);scene=world.scene;battleAtmosphere=createBattleAtmosphere(scene,{groundHeight});combatFeedback=createCombatFeedback(scene,{groundHeight});fieldFlashlight=createFieldFlashlight(camera);tacticalSmoke=createTacticalSmoke(scene);fieldInteractions=createFieldInteractions(scene,{colliders:()=>gameColliders,groundHeight,onComplete:({kind,amount})=>{if(!state)return;const key=kind==='ammo'?'ammo':'medicine',limit=kind==='ammo'?240:12,before=state.resources[key];state.resources[key]=Math.min(limit,before+amount);audio.click();ui.toast(kind==='ammo'?'弹药箱已取用 · 备用弹药 +'+(state.resources[key]-before):'医疗箱已取用 · 救护物资 +'+(state.resources[key]-before));saveFieldCheckpoint();}});actorDirector=createActorDirector({colliders:()=>gameColliders,staticColliders:()=>world.colliders,navigationColliders:()=>fieldInteractions.getColliders(),obscures:(a,b)=>tacticalSmoke.obscures(a,b),onFire:actorFire,onCallout:actorCallout});scene.add(camera);cinema=createCinema(renderer,scene,camera);renderer.info.autoReset=false;const weaponAsset=createWeapon(camera);weaponController=weaponAsset;weapon=weaponAsset.group;flash=weaponAsset.flash;
    storyDirector=createNarrativeCinematics({scene,camera,world,audio,onSubtitle:({speaker,text,duration})=>ui.subtitle(speaker,text,(duration||4.5)*1000),onEvent:event=>storyEventLog.push({...event}),onComplete:result=>{const next=cinematicContinuation;cinematicContinuation=null;next?.(result);}});
    applySettings();bindInput();ui.bootDone();showMenu();requestAnimationFrame(frame);
    if(debugEnabled)window.__game={previewChapterHandoff:(index)=>{if(index<0||index>14)return;loadChapter(index);startChapterHandoff(chapter.choice.options[0]);},inspectHands:()=>weaponController.inspectHands(),getState:()=>({mode,chapter:chapter?.id||0,task:taskIndex,player:{...player},resources:{...state?.resources},stowedMagazines:{...stowedMagazines},enemyCount:enemies.filter(e=>e.alive).length,render:{fov:camera.fov,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio(),post:cinema.inspect(),quality:settings.quality,renderScale:settings.renderScale},saved:readCampaign(localStorage)}),damageHostile:(index,amount=100)=>{const enemy=enemies[index];damageEnemy(enemy,amount);return enemy?{alive:enemy.alive,health:enemy.health}:null;},skipCinematic:()=>action('skip-cinematic'),playSequence:(phase,event)=>{if(chapter)startSequence(phase,enterGameplay,event);},loadChapter:(i)=>{if(!state)state=newCampaign(INITIAL_RESOURCES);loadChapter(i);},teleport:(x,z)=>{player.x=x;player.z=z;updateCamera(.1);},lookAt:(x,y,z)=>{const dx=x-player.x,dz=z-player.z;player.yaw=Math.atan2(-dx,-dz);player.pitch=Math.atan2(y-player.y,Math.hypot(dx,dz));updateCamera(.1);},forceDamage:(amount)=>{player.health-=amount;},setAircraftPreview:(position,rotation)=>world.setAircraftPreview?.(position,rotation),action:(name,value)=>action(name,value),pause,behaviorEvent:event=>actorDirector.notifyThreat(event),behaviorSnapshot:()=>({actors:actorDirector.inspect(),shots:shotLog.map(s=>({...s})),time:chapterTime,poses:actors.concat(enemies.map(e=>e.obj)).map(a=>({name:a.name,position:a.position.toArray(),rotationY:a.rotation.y,pose:a.userData.getPoseState?.()||a.userData.poseState}))}),inspect:()=>({pacing:{activeSeconds:pacingElapsed,targetMinutes:chapter?.missionPlan?.targetMinutes,estimateNote:chapter?.missionPlan?.estimateNote,taskDecisions:structuredClone(taskDecisions)},transition:chapterTransition.inspect(),transitionEvents:transitionEvents.map(e=>({...e})),layout:layout?{id:layout.id,bounds:layout.bounds,route:layout.route}:null,mounted:mounted?{id:mounted.id,...mounted.gun,hands:mountedPose?.inspect()}:null,mountedWeapons:mountedWeapons.map(m=>({id:m.id,position:m.vehicle.position.toArray(),...m.gun,shotsAI:m.shotsAI})),squadSuppression:actorDirector.getSuppressionOrder?.(),resources:world.getResourceState?.(),scene:world.getSceneState?.(),narrative:narrative?.inspect(),cinematic:storyDirector?.inspect(),storyEvents:storyEventLog.slice(-200),audio:audio.inspect?.(),combatEffects:combatFeedback.inspect(),ambientEffects:battleAtmosphere.inspect(),field:fieldInteractions.inspect(),smoke:tacticalSmoke.inspect(),smokeCharges,squadOrder,lighting:world.getLightingState?.(),flashlight:fieldFlashlight.inspect(),urban:world.getUrbanState?.(),aircraft:world.getAircraftState?.(),ground:{player:groundHeight(player.x,player.z),enemies:enemies.map(e=>({x:e.obj.position.x,z:e.obj.position.z,y:e.obj.position.y,surface:groundHeight(e.obj.position.x,e.obj.position.z)}))},colliders:physicalColliders(),staticColliders:world.colliders,tasks:tasks.map(t=>({id:t.id,actorFrom:t.actorFrom,actorId:t.obj.uuid,decision:t.decision,optional:t.optional,sceneEvent:t.sceneEvent,coreIndex:t.coreIndex,pos:t.obj.userData.taskId?[t.obj.position.x,t.obj.position.z]:t.pos,anchor:t.pos,actorPosition:[t.obj.position.x,t.obj.position.z],goal:taskGoal(t),visible:t.obj.visible,virtual:Boolean(t.obj.userData.virtual),interaction:t.interaction,speaker:t.speaker,done:t.done})),enemies:enemies.map(e=>({x:e.x,z:e.z,health:e.health,alive:e.alive,fallTime:e.fallTime,y:e.obj.position.y,pitch:e.obj.rotation.x,boundsMinY:e.alive?null:bodyBounds(e.obj).min.y}))})};
  }catch(error){console.error(error);document.getElementById('boot')?.remove();setMode('error');ui.error('3D场景启动失败：'+error.message+'。请确认资源目录完整，或更新显卡驱动后重试。');}
}
boot();
