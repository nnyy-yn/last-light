import {RESOURCE_LIMITS} from './simulation.js';
import {MOUNTED_M2} from './mounted-weapons.js';
import {createAmmoReserves,validateAmmoReserves,WEAPON_MAGAZINES} from './ammunition.js';

// Data only: no storage, rendering, actor creation or reward callbacks. Call
// capture after applying a task's reward and incrementing the task cursor.
export const CHAPTER_CHECKPOINT_VERSION=3;
export const CHECKPOINT_WEAPON_CAPACITIES=Object.freeze({m16a2:30,m249:100,ak:30,mp5:30,m1911:7,m4a1:30});
const RUNTIME_TASK_KEYS=new Set(['obj','done','participantActors','runtime']);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const clone=v=>JSON.parse(JSON.stringify(v));

function canonical(value,depth=0){
  if(depth>32)throw new TypeError('Chapter task data is too deeply nested.');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))throw new TypeError('Chapter task data must contain finite numbers.');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';
  if(record(value))return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
  throw new TypeError('Chapter task data must be serializable authored data.');
}

function authoredTasks(chapter){
  if(!record(chapter)||!integer(chapter.id,1,16)||!Array.isArray(chapter.tasks)||!chapter.tasks.length||chapter.tasks.length>128)throw new TypeError('A checkpoint needs a chapter with ordered authored tasks.');
  const seen=new Set();
  return chapter.tasks.map(task=>{
    if(!record(task)||!id(task.id)||seen.has(task.id))throw new TypeError('Chapter task IDs must be unique.');
    seen.add(task.id);
    return Object.fromEntries(Object.entries(task).filter(([key,value])=>!RUNTIME_TASK_KEYS.has(key)&&value!==undefined));
  });
}

// A deterministic content fingerprint, not an authentication mechanism. All
// authored fields participate, including positions, dialogue, rewards/options.
export function chapterTaskSignature(chapter){
  const text=canonical({chapterId:chapter.id,sceneId:chapter.sceneId??null,contentVersion:chapter.contentVersion??1,tasks:authoredTasks(chapter)});
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),0x01000193);b=Math.imul(b^text.charCodeAt(i),0x85ebca6b);b^=b>>>13;}
  return `tasks-v1-${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}

function uniqueArray(value,valid,limit){return Array.isArray(value)&&value.length<=limit&&value.every(valid)&&new Set(value).size===value.length;}
function cleanResources(value){
  if(!record(value))return null;
  const result={};for(const [key,[min,max]]of Object.entries(RESOURCE_LIMITS)){if(!finite(value[key],min,max))return null;result[key]=value[key];}return result;
}
function cleanPlayer(value,capacities,bounds){
  if(!record(value)||!Object.hasOwn(capacities,value.weaponId)||!finite(value.x,-5000,5000)||!finite(value.z,-5000,5000)||!finite(value.y,-20,100)||!finite(value.yaw,-1e7,1e7)||!finite(value.pitch,-Math.PI,Math.PI)||!finite(value.health,0,100)||!finite(value.stamina,0,100)||!integer(value.mag,0,capacities[value.weaponId]))return null;
  if(bounds){if(!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(bounds[k]))||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ||value.x<bounds.minX||value.x>bounds.maxX||value.z<bounds.minZ||value.z>bounds.maxZ)return null;}
  return Object.fromEntries(['x','y','z','yaw','pitch','health','stamina','mag','weaponId'].map(k=>[k,value[k]]));
}
function cleanGun(value){
  if(!record(value)||!integer(value.ammo,0,MOUNTED_M2.capacity)||!integer(value.reserve,0,MOUNTED_M2.reserve)||!finite(value.heat,0,1)||!finite(value.cooldown,0,MOUNTED_M2.interval)||!finite(value.reload,0,MOUNTED_M2.reloadTime)||typeof value.overheated!=='boolean'||!integer(value.shots,0,MOUNTED_M2.capacity+MOUNTED_M2.reserve)||value.ammo+value.reserve+value.shots>MOUNTED_M2.capacity+MOUNTED_M2.reserve)return null;
  return Object.fromEntries(['ammo','reserve','heat','cooldown','reload','overheated','shots'].map(k=>[k,value[k]]));
}

/**
 * Validate against the exact authored task list that will be played. Optional
 * runtime identity lists should be supplied after the chapter is constructed:
 * enemyCount, mountedWeaponIds and fieldIds reject stale runtime identities.
 * A failed restore returns null and never normalizes invalid ammo/progress.
 */
export function validateChapterCheckpoint(value,{chapter,bounds,enemyCount=512,mountedWeaponIds,fieldIds,weaponCapacities=CHECKPOINT_WEAPON_CAPACITIES}={}){
  try{
    const tasks=authoredTasks(chapter),signature=chapterTaskSignature(chapter),capacities=weaponCapacities;
    if(!record(capacities)||!Object.keys(capacities).length||Object.values(capacities).some(n=>!integer(n,1,1000)))return null;
    if(!record(value)||value.version!==CHAPTER_CHECKPOINT_VERSION||value.chapterId!==chapter.id||value.taskSignature!==signature)return null;
    if(!integer(value.taskIndex,0,tasks.length)||!Array.isArray(value.completedTaskIds)||value.completedTaskIds.length!==value.taskIndex||value.completedTaskIds.some((taskId,i)=>taskId!==tasks[i].id)||value.nextTaskId!==(tasks[value.taskIndex]?.id??null))return null;
    const resources=cleanResources(value.resources),player=cleanPlayer(value.player,capacities,bounds);
    if(!resources||!player||!record(value.stowedMagazines))return null;
    const ammoReserves=validateAmmoReserves(value.ammoReserves,resources.ammo);if(!ammoReserves)return null;
    const weaponIds=Object.keys(capacities),stowedMagazines={};
    if(Object.keys(value.stowedMagazines).length!==weaponIds.length)return null;
    for(const key of weaponIds){if(!integer(value.stowedMagazines[key],0,capacities[key]))return null;stowedMagazines[key]=value.stowedMagazines[key];}
    if(stowedMagazines[player.weaponId]!==0)return null; // The active magazine exists only on the player.
    if(typeof value.assistUsed!=='boolean')return null;
    if(!integer(enemyCount,0,512)||!uniqueArray(value.killedEnemyIndices,n=>integer(n,0,enemyCount-1),enemyCount)||!integer(value.smokeCharges,0,2)||!finite(value.pacingElapsed,0,604800))return null;
    // Every defeated enemy retains exactly one physical pickup record, even
    // when that firearm is empty or was already taken. Never reconstruct loot
    // from a kill count, because that would award new ammunition after reload.
    if(!Array.isArray(value.weaponDrops)||value.weaponDrops.length!==value.killedEnemyIndices.length)return null;
    const killed=new Set(value.killedEnemyIndices),dropIds=new Set(),weaponDrops=[];
    for(const drop of value.weaponDrops){
      if(!record(drop)||!integer(drop.enemyIndex,0,enemyCount-1)||!killed.has(drop.enemyIndex)||dropIds.has(drop.enemyIndex)||!Object.hasOwn(WEAPON_MAGAZINES,drop.weaponId)||!integer(drop.mag,0,WEAPON_MAGAZINES[drop.weaponId])||!integer(drop.reserve,0,300)||typeof drop.taken!=='boolean')return null;
      if(!Array.isArray(drop.position)||drop.position.length!==2||!finite(drop.position[0],bounds?.minX??-5000,bounds?.maxX??5000)||!finite(drop.position[1],bounds?.minZ??-5000,bounds?.maxZ??5000))return null;
      dropIds.add(drop.enemyIndex);weaponDrops.push({enemyIndex:drop.enemyIndex,weaponId:drop.weaponId,mag:drop.mag,reserve:drop.reserve,taken:drop.taken,position:[...drop.position]});
    }
    weaponDrops.sort((a,b)=>a.enemyIndex-b.enemyIndex);
    const allowedFields=fieldIds??[`field-${chapter.id}-medicine`,`field-${chapter.id}-ammo`];
    if(!uniqueArray(allowedFields,id,256)||!uniqueArray(value.fieldCollectedIds,key=>id(key)&&allowedFields.includes(key),allowedFields.length))return null;
    if(!Array.isArray(value.mountedWeapons)||value.mountedWeapons.length>64)return null;
    const mountedWeapons=[],mountedIds=new Set();
    for(const item of value.mountedWeapons){if(!record(item)||!id(item.id)||mountedIds.has(item.id))return null;const gun=cleanGun(item.gun);if(!gun)return null;mountedIds.add(item.id);mountedWeapons.push({id:item.id,gun});}
    if(mountedWeaponIds&&(!uniqueArray(mountedWeaponIds,id,64)||mountedWeaponIds.length!==mountedIds.size||mountedWeaponIds.some(key=>!mountedIds.has(key))))return null;
    if(!Array.isArray(value.taskDecisions)||value.taskDecisions.length>value.taskIndex)return null;
    const requiredDecisions=tasks.slice(0,value.taskIndex).filter(t=>t.decision),decisionIds=new Set(),taskDecisions=[];
    for(const selected of value.taskDecisions){
      if(!record(selected)||!id(selected.taskId)||!id(selected.optionId)||decisionIds.has(selected.taskId))return null;
      const task=requiredDecisions.find(t=>t.id===selected.taskId);
      if(!task?.decision?.options?.some(o=>o.id===selected.optionId))return null;
      decisionIds.add(selected.taskId);taskDecisions.push({taskId:selected.taskId,optionId:selected.optionId});
    }
    if(requiredDecisions.some(task=>!decisionIds.has(task.id)))return null;
    return {version:CHAPTER_CHECKPOINT_VERSION,chapterId:chapter.id,taskSignature:signature,taskIndex:value.taskIndex,completedTaskIds:tasks.slice(0,value.taskIndex).map(t=>t.id),nextTaskId:tasks[value.taskIndex]?.id??null,resources,ammoReserves,player,stowedMagazines,weaponDrops,assistUsed:value.assistUsed,killedEnemyIndices:[...value.killedEnemyIndices].sort((a,b)=>a-b),smokeCharges:value.smokeCharges,mountedWeapons,fieldCollectedIds:[...value.fieldCollectedIds],pacingElapsed:value.pacingElapsed,taskDecisions};
  }catch{return null;}
}

export function captureChapterCheckpoint({chapter,campaign,taskIndex,player,stowedMagazines,assistUsed=false,killedEnemyIndices=[],weaponDrops=[],ammoReserves=Object.hasOwn(campaign||{},'ammoReserves')?campaign.ammoReserves:createAmmoReserves(campaign?.resources?.ammo),smokeCharges=0,mountedWeapons=[],fieldCollectedIds=[],pacingElapsed=0,taskDecisions=[],...context}){
  if(!campaign||campaign.chapter!==chapter?.id-1||campaign.completed)throw new TypeError('Cannot capture a checkpoint outside the current unfinished chapter.');
  const tasks=authoredTasks(chapter),candidate={version:CHAPTER_CHECKPOINT_VERSION,chapterId:chapter.id,taskSignature:chapterTaskSignature(chapter),taskIndex,completedTaskIds:tasks.slice(0,taskIndex).map(t=>t.id),nextTaskId:tasks[taskIndex]?.id??null,resources:campaign.resources,ammoReserves,player,stowedMagazines,weaponDrops,assistUsed,killedEnemyIndices,smokeCharges,mountedWeapons,fieldCollectedIds,pacingElapsed,taskDecisions};
  const clean=validateChapterCheckpoint(candidate,{...context,chapter});
  if(!clean)throw new TypeError('Cannot capture invalid chapter checkpoint data.');
  return clean;
}

/** Apply saved values; never replay completeTask(), effects or supply rewards.
 * The owner uses the returned cursor/IDs to restore task/actor visuals and the
 * field-item used bits without invoking their onComplete callbacks. Applying
 * the same checkpoint twice is idempotent. Failed validation mutates nothing.
 */
export function applyChapterCheckpoint(campaign,value,context){
  const clean=validateChapterCheckpoint(value,context);
  if(!clean||!campaign||campaign.completed||campaign.chapter!==clean.chapterId-1)return null;
  campaign.resources={...clean.resources};campaign.ammoReserves={...clean.ammoReserves};campaign.fieldCheckpoint=clone(clean);
  return clone(clean);
}
