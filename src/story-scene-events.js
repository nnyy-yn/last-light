import * as THREE from 'three';

// Presentation events reference chapter-owned cue objects and existing actors.
// This module never reads/writes ammunition, campaign saves, tasks or cameras.
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
const clamp=THREE.MathUtils.clamp,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const normalizeName=name=>name.replace(/:/g,'').replace(/_\d+$/,'');
const CORE=[
 ['find-family','clinic-kit','quiet-street'],['check-kit','meet-miller','assemble'],['briefing','loadout','boarding'],['blackburn','stretcher','transfer'],
 ['convoy-check','casualty-kit','contact-convoy'],['receive-update','rally-point','crash-approach'],['reconnect','side-patient','find-rally'],['road-status','rear-vehicle','link-back'],
 ['durant-voice','durant-crew','durant-wait'],['second-wreck','protect-durant','relay-condition'],['medical-supplies','stay-smith','care-living'],['night-contact','night-supplies','night-patient'],
 ['relief-contact','relief-patient','relief-vehicle'],['recover-crew','personal-items','last-count'],['run-rally','run-help','run-safe'],['leave-gear','visit-survivors','remember'],
];
const BEATS=[
 ['诊所开始回应寻找家属的人','找到哈娃，诊所腾出接手位置','急救包已接稳，门廊准备接纳家人','一家抵达门廊，接应标志落定'],
 ['军需棚为这组人留出交接位置','补给已接过，营房里的谈话可以开始','米勒说完了，集合队列开始准备','集合确认传到车列末端'],
 ['简报墙旁的出发标志开始展开','目标确认，携行台进入整理状态','物资已收好，机库门旁的等候标志升起','登机口完成最后交接'],
 ['军医示意给伤员让出位置','救护已完成第一步，担架位展开','担架已接稳，撤送车辆准备接手','撤送交接完成，街口队员放下抬运姿势'],
 ['庭院里分出伤员与登车的等候位','人数确认，后车救护位准备接包','救护包已交接，出口改为等候车列','后车收到出发确认'],
 ['求救让烟柱旁的联络标志改变','坠机报告确认，集结处开始接应','队员已经聚齐，残骸入口准备转运','救援入口交接完成'],
 ['低门廊回应失联队员','联络接通，伤员墙边留出位置','哈里斯愿意求助，接应门廊开始准备','两人抵达，接应者放下等候标志'],
 ['前车路况使等候标志转向','道路确认受阻，后车准备重新扶稳伤员','后车已接手，返程路口开始联络','返程口令传到车列末端'],
 ['驾驶舱里的回应开始被接收','求救已送出，仪表旁的联络物件停稳','座位中的回应得到确认，舱门外标志变化','来人身份确认，救援仍由舱外接手'],
 ['残骸旁出现两人接应的方向','接近路线确认，庇护位准备接人','杜兰特得到照看，联络标志转为等候','最后报告在等待回应，庇护位仍有人照看'],
 ['救护站为下一次交接挪开遮帘','敷料放到军医手边，陪伴位置留出来','听完史密斯的话，下一张照护床仍有人等待','米勒身旁的陪护位落实'],
 ['夜间联络点给出微弱回应','守夜约定传下去，补给位打开','物资已分装，伤员旁的遮帘准备调整','夜间照护位置落实'],
 ['救援入口的确认标志开始展开','入口确认，交接位为担架腾出空间','伤员已送到接应线，车旁准备装载','装载通道完成交接'],
 ['遗体转运位置为搬运者留出空间','机组转运已接稳，随身物品登记开始','物品完成登记，最后清点位准备回应','人数清点送出，离开前的标记收定'],
 ['第一个转角示意落后者跟上','集合角确认，伤员旁准备接手','哈里斯扶稳，安全区入口开始等待','接应者接住哈里斯，末端等候标志收起'],
 ['归建处留出放下装备的位置','装备交接完成，探视位置准备回应','听完幸存者的话，名字登记处展开','名字留在登记处，纪念标记安静落定'],
];
const GESTURES=['acknowledge','handover','point','acknowledge'];
const cueId=(chapter,index)=>`ch${String(chapter).padStart(2,'0')}-core${index}`;
const valid3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const hierarchyVisible=object=>{for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;};

export function getStorySceneEventPlan(chapter){
 const id=typeof chapter==='number'?chapter:chapter?.id;if(!Number.isInteger(id)||id<1||id>16)throw new RangeError('Scene events require chapter 1–16.');
 const core=CORE[id-1],acts=typeof chapter==='object'?(chapter.missionPlan?.acts||chapter.storyDirection?.acts||[]):[];
 return {chapterId:id,coreTaskIds:[...core],phases:BEATS[id-1].map((purpose,index)=>({id:`ch${String(id).padStart(2,'0')}-phase${index}`,index,actId:acts[index]?.id||['orientation','consequence','commitment','handover'][index],title:acts[index]?.title||purpose,purpose:acts[index]?.goal||purpose,gesture:GESTURES[index],trigger:{type:'start',taskId:acts[index]?.startTaskId||acts[index]?.taskIds?.[0]||(typeof chapter==='object'?(index===0?chapter.tasks?.[0]?.id:core[index-1]):null)},cues:index===0?[{id:cueId(id,0),amount:.24}]:index===1?[{id:cueId(id,0),amount:.65},{id:cueId(id,1),amount:.20}]:index===2?[{id:cueId(id,1),amount:.70},{id:cueId(id,2),amount:.26}]:[{id:cueId(id,2),amount:.78}]}))};
}

function aimBone(bone,child,target){
 const origin=bone.getWorldPosition(V()),from=child.getWorldPosition(V()).sub(origin),to=target.clone().sub(origin);if(from.lengthSq()<1e-10||to.lengthSq()<1e-10)return;
 const desired=bone.getWorldQuaternion(Q()).premultiply(Q().setFromUnitVectors(from.normalize(),to.normalize()));bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(desired));bone.updateWorldMatrix(false,true);
}
function solveGestureArm(arm,elbow,hand,target,pole){
 const origin=arm.getWorldPosition(V()),joint=elbow.getWorldPosition(V()),wrist=hand.getWorldPosition(V()),upper=origin.distanceTo(joint),lower=joint.distanceTo(wrist),axis=target.clone().sub(origin),distance=clamp(axis.length(),Math.abs(upper-lower)+.00001,(upper+lower)*.997);axis.normalize();
 const bend=pole.clone().sub(origin);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-9)bend.set(1,0,0).addScaledVector(axis,-axis.x);bend.normalize();
 const along=(upper*upper+distance*distance-lower*lower)/(2*distance),middle=origin.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
 aimBone(arm,elbow,middle);aimBone(elbow,hand,origin.clone().addScaledVector(axis,distance));
}
function prepareActorGesture(actor){
 const bones=new Map();actor.traverse?.(node=>{if(node.isBone)bones.set(normalizeName(node.name),node);});const get=name=>bones.get('mixamorig'+name);
 const arm=get('RightArm'),elbow=get('RightForeArm'),hand=get('RightHand'),chest=get('Spine2');if(!arm||!elbow||!hand||!chest)return null;
 const openFingers=[];const skeletons=new Set();actor.traverse?.(o=>{if(o.skeleton)skeletons.add(o.skeleton);});
 for(const skeleton of skeletons)for(let i=0;i<skeleton.bones.length;i++){
  const bone=skeleton.bones[i],name=normalizeName(bone.name);if(!/^mixamorigRightHand(?:Index|Middle|Ring|Pinky|Thumb)[123]$/.test(name)||openFingers.some(f=>f.bone===bone))continue;
  const parent=skeleton.bones.indexOf(bone.parent);if(parent<0)continue;const local=skeleton.boneInverses[parent].clone().multiply(skeleton.boneInverses[i].clone().invert()),rotation=Q();local.decompose(V(),rotation,V());openFingers.push({bone,rotation,index:name.includes('Index')});
 }
 return {arm,elbow,hand,chest,openFingers};
}
function poseGesture(actor,rig,gesture,weight,time){
 if(!rig||weight<=0)return;
 actor.updateWorldMatrix(true,true);const chest=actor.worldToLocal(rig.chest.getWorldPosition(V())),current=rig.hand.getWorldPosition(V());
 const local=chest.clone().add(gesture==='point'?V(-.32,.06,.43):gesture==='handover'?V(-.22,-.29,.35):V(-.27,.14+Math.sin(time*5)*.018,.20));
 const target=current.clone().lerp(actor.localToWorld(local),weight),pole=actor.localToWorld(chest.clone().add(V(-.43,-.14,.04)));
 const priorHand=rig.hand.getWorldQuaternion(Q());solveGestureArm(rig.arm,rig.elbow,rig.hand,target,pole);
 rig.hand.quaternion.copy(rig.hand.parent.getWorldQuaternion(Q()).invert().multiply(priorHand));for(const finger of rig.openFingers){const opening=gesture==='point'?(finger.index?1:.12):gesture==='handover'?.55:.92;finger.bone.quaternion.slerp(finger.rotation,weight*opening);}rig.hand.updateWorldMatrix(false,true);
}

/** Integrate after scene/tasks exist. Events are idempotent presentation only.
 * update(0), pause and dead/invisible/moving actors do not advance a gesture.
 * restoreCompleted rebuilds state directly, never emits or replays a reward.
 */
export function createStorySceneEvents({world,onEvent=()=>{}}={}){
 let chapter=null,tasks=[],plan=null,root=null,disposed=false,paused=false,time=0,revision=0;
 const cues=new Map(),actors=new Map(),completed=new Set(),started=new Set(),phaseIds=new Set(),decisions=new Map(),ledger=[];
 let currentAct=null;
 const record=event=>{const value={...event,time};ledger.push(value);if(ledger.length>96)ledger.shift();onEvent({...value});};
 function restoreOriginals(){
   for(const r of actors.values()){if(r.actor.userData.animate===r.wrapper)r.actor.userData.animate=r.original;delete r.actor.userData.storyGesture;}
   actors.clear();for(const r of cues.values())if(!r.object.userData.disposed){r.object.position.copy(r.home.position);r.object.quaternion.copy(r.home.quaternion);r.object.scale.copy(r.home.scale);r.object.updateMatrix();}cues.clear();
 }
 function transformAt(r,amount){
   const value=clamp(amount,0,1),metadata=r.metadata,axis=['x','y','z'].includes(metadata.axis)?metadata.axis:'y',vector=V(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);
   const movement=valid3(metadata.travel)?V(...metadata.travel):typeof metadata.travel==='number'?vector.clone().multiplyScalar(metadata.travel):metadata.kind==='stretcher'?V(0,0,.22):metadata.kind==='curtain'?V(.14,0,0):V();
   const angle=Number.isFinite(metadata.angle)?metadata.angle:metadata.kind==='gate'?1.0:metadata.kind==='curtain'?.12:metadata.kind==='signal'?.70:0;
   const position=r.home.position.clone().addScaledVector(movement.applyQuaternion(r.home.quaternion),value),quaternion=r.home.quaternion.clone().multiply(Q().setFromAxisAngle(vector,angle*value)),scale=r.home.scale.clone();
   if(metadata.kind==='curtain'&&!metadata.preserveScale)scale.x*=1-.42*value;
   return {position,quaternion,scale};
 }
 function applyAmount(r,amount){const next=transformAt(r,amount);r.object.position.copy(next.position);r.object.quaternion.copy(next.quaternion);r.object.scale.copy(next.scale);r.object.updateMatrix();r.current=amount;}
 function targetCue(id,amount,instant=false){const r=cues.get(id);if(!r)return false;const value=Math.max(r.target,clamp(amount,0,1));if(value===r.target&&!instant)return false;r.from=r.current;r.target=value;r.elapsed=0;r.duration=clamp(Number(r.metadata.duration)||1.45,.45,4);if(instant)applyAmount(r,value);return true;}
 function queueGesture(task,gesture,purpose){
   if(chapter.id===9)return;
   const candidates=[task?.obj,...(task?.participantActors||[])];
   const actor=candidates.find(a=>actors.has(a)&&!a.userData.virtual&&!a.userData.disposed&&a.userData.kind!=='wounded');if(!actor)return;
   const r=actors.get(actor);r.event={gesture,purpose,elapsed:0,duration:2.2,applied:0};
 }
 function phase(index,{instant=false,task}={}){
   const item=plan.phases[index];if(phaseIds.has(item.id))return false;phaseIds.add(item.id);revision++;for(const cue of item.cues)targetCue(cue.id,cue.amount,instant);
   if(!instant){queueGesture(task,item.gesture,item.purpose);record({type:'phase',phaseId:item.id,index,purpose:item.purpose,taskId:task?.id||item.trigger.taskId});}return true;
 }
 function pulse(task,gesture){
   const id=task?.landmarkId||cueId(chapter.id,task?.coreIndex??Math.min(2,Math.max(0,Math.floor(tasks.indexOf(task)/Math.max(1,tasks.length/3))))),r=cues.get(id);
   if(r&&r.metadata.kind==='signal')r.pulse={elapsed:0,duration:1.25};queueGesture(task,gesture,task?.storyPurpose||task?.label||'现场回应');
 }
 function reset({chapter:next,layout,tasks:runtimeTasks=next?.tasks,cueRoot}={}){
   if(disposed)throw new Error('Story scene events have been disposed.');restoreOriginals();chapter=next;tasks=runtimeTasks||[];plan=getStorySceneEventPlan(next);root=cueRoot||world?.getStoryCueRoot?.();paused=false;time=0;revision=0;currentAct=null;completed.clear();started.clear();phaseIds.clear();decisions.clear();ledger.length=0;
   root?.traverse(object=>{const metadata=object.userData.storyCue;if(!metadata||metadata.chapterId!==chapter.id||!['signal','curtain','stretcher','gate'].includes(metadata.kind))return;if(cues.has(metadata.id))throw new Error('Duplicate story cue: '+metadata.id);cues.set(metadata.id,{object,metadata:{...metadata},home:{position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()},from:0,current:0,target:0,elapsed:0,duration:1.45,pulse:null});});
   for(const task of tasks)for(const actor of[task.obj,...(task.participantActors||[])]){
     if(!actor||actors.has(actor)||actor.userData.virtual||actor.userData.kind==='wounded'||typeof actor.userData.animate!=='function')continue;
     const r={actor,original:actor.userData.animate,rig:prepareActorGesture(actor),event:null,wrapper:null};
     r.wrapper=function(speed=0,dt=0,pose={}){
       const event=r.event,canAct=event&&!paused&&Number.isFinite(dt)&&dt>0&&Math.abs(speed)<.12&&!actor.userData.disposed&&!actor.userData.dead&&!actor.userData.carried&&!(pose.dead>0)&&!(pose.reload>0)&&!['treat','kneel','low'].includes(pose.stance)&&hierarchyVisible(actor);
       let weight=0;if(canAct)weight=smooth(event.elapsed/.35)*(1-smooth((event.elapsed-event.duration+.45)/.45));
       const next=weight>0?{...pose,talk:Math.max(Number(pose.talk)||0,weight*.5),carry:Math.max(Number(pose.carry)||0,event.gesture==='handover'?weight:0)}:pose;
       const value=r.original.call(this,speed,dt,next);if(weight>0){poseGesture(actor,r.rig,event.gesture,weight,event.elapsed);event.applied++;actor.userData.storyGesture={gesture:event.gesture,weight,purpose:event.purpose};}else delete actor.userData.storyGesture;return value;
     };
     actor.userData.animate=r.wrapper;actors.set(actor,r);
   }
   return inspect();
 }
 function enterTaskAct(task,instant=false){
   let index=plan.phases.findIndex(p=>p.trigger.taskId===task.id);if(index<0)index=plan.phases.findIndex(p=>p.actId===task.actId);if(index<0&&tasks.indexOf(task)===0)index=0;
   if(index>=0)phase(index,{instant,task});return index;
 }
 function taskStarted(taskId){
   if(disposed||!plan)return false;const task=tasks.find(t=>t.id===taskId);if(!task||started.has(taskId)||completed.has(taskId))return false;started.add(taskId);currentAct=task.actId||currentAct;
   enterTaskAct(task);pulse(task,task.animation==='handover'?'handover':task.animation==='observe'?'point':'acknowledge');record({type:'task-started',taskId,actId:currentAct,purpose:task.storyPurpose||task.label});return true;
 }
 function taskCompleted(taskId,{skipped=false}={}){
   if(disposed||!plan)return false;const task=tasks.find(t=>t.id===taskId);if(!task||completed.has(taskId)||skipped&&!task.optional)return false;completed.add(taskId);started.add(taskId);currentAct=task.actId||currentAct;
   if(skipped){record({type:'task-skipped',taskId});return true;}
   enterTaskAct(task);const coreIndex=plan.coreTaskIds.indexOf(taskId);if(coreIndex>=0){targetCue(cueId(chapter.id,coreIndex),1);queueGesture(task,'handover',task.successText||task.text);}else pulse(task,task.animation==='handover'?'handover':'acknowledge');
   record({type:'task-completed',taskId,successText:task.successText||task.text||task.label});return true;
 }
 function decision(taskId,optionId){
   if(disposed||!plan||decisions.has(taskId))return false;const task=tasks.find(t=>t.id===taskId),option=task?.decision?.options.find(o=>o.id===optionId);if(!option)return false;decisions.set(taskId,optionId);pulse(task,'handover');record({type:'decision',taskId,optionId,response:option.response});return true;
 }
 function update(dt){
   if(disposed||paused||!plan||!Number.isFinite(dt)||dt<=0)return;const elapsed=Math.min(dt,.1);time+=elapsed;
   for(const r of cues.values()){
     if(r.object.userData.disposed)continue;if(r.current!==r.target){r.elapsed=Math.min(r.duration,r.elapsed+elapsed);applyAmount(r,r.from+(r.target-r.from)*smooth(r.elapsed/r.duration));}
     if(r.pulse){r.pulse.elapsed+=elapsed;const t=clamp(r.pulse.elapsed/r.pulse.duration,0,1),w=Math.sin(t*Math.PI)*Math.sin(t*Math.PI*2)*.055;applyAmount(r,r.current);r.object.rotateZ(w);if(t===1)r.pulse=null;}
   }
   for(const r of actors.values())if(r.event){r.event.elapsed+=elapsed;if(r.event.elapsed>=r.event.duration){r.event=null;delete r.actor.userData.storyGesture;}}
 }
 function restoreCompleted(ids,selected=[]){
   if(disposed||!plan)return false;
   if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some((id,index)=>tasks[index]?.id!==id)||!Array.isArray(selected))return false;
   const validDecisions=new Map();for(const choice of selected){const task=tasks.find(t=>t.id===choice.taskId);if(!ids.includes(choice.taskId)||validDecisions.has(choice.taskId)||!task?.decision?.options.some(o=>o.id===choice.optionId))return false;validDecisions.set(choice.taskId,choice.optionId);}
   completed.clear();started.clear();phaseIds.clear();decisions.clear();ledger.length=0;time=0;revision=0;currentAct=null;
   for(const r of cues.values()){r.current=r.target=r.from=r.elapsed=0;r.pulse=null;applyAmount(r,0);}for(const r of actors.values()){r.event=null;delete r.actor.userData.storyGesture;}
   for(const id of ids){completed.add(id);started.add(id);const task=tasks.find(t=>t.id===id);currentAct=task.actId||currentAct;enterTaskAct(task,true);const at=plan.coreTaskIds.indexOf(id);if(at>=0)targetCue(cueId(chapter.id,at),1,true);}for(const[id,value]of validDecisions)decisions.set(id,value);
   return true;
 }
 function inspect(){return {chapterId:chapter?.id||null,time,revision,paused,disposed,currentAct,phaseIds:[...phaseIds],completedTaskIds:[...completed],decisions:[...decisions].map(([taskId,optionId])=>({taskId,optionId})),cueCount:cues.size,actorCount:actors.size,activeGestures:[...actors.values()].filter(r=>r.event).map(r=>({actor:r.actor.name,gesture:r.event.gesture,elapsed:r.event.elapsed,applied:r.event.applied})),cues:[...cues].map(([id,r])=>({id,kind:r.metadata.kind,amount:r.current,target:r.target,moving:r.current!==r.target,position:r.object.position.toArray(),quaternion:r.object.quaternion.toArray(),scale:r.object.scale.toArray()})),events:ledger.map(e=>({...e}))};}
 function dispose(){if(disposed)return;restoreOriginals();completed.clear();started.clear();phaseIds.clear();decisions.clear();ledger.length=0;chapter=null;tasks=[];plan=null;root=null;disposed=true;}
 return {reset,taskStarted,taskCompleted,decision,update,restoreCompleted,inspect,pause:()=>{paused=true;},resume:()=>{paused=false;},dispose};
}
