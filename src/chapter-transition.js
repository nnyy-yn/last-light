import {CHAPTERS} from './story.js';
import {chapterLocation} from './setting.js';

// These are editorial handoffs between separately authored scenes. In particular,
// parallel events change viewpoint; they do not move one person across the city.
const HANDOFFS = [
  ['perspective', 'parallel', '城内的救护仍在继续，视角转向机场基地。'],
  ['walk', 'continuous', '队员收起行囊，前往行动简报区。'],
  ['airlift', 'continuous', '离开机场，随直升机飞向目标街区。'],
  ['convoy', 'perspective', '转向目标建筑外的车队，接应索降队员。'],
  ['rescue', 'perspective', '新的求救传来，救援队转向第一道烟柱。'],
  ['foot', 'perspective', '接过另一名队员的视角，穿过相邻街巷。'],
  ['convoy', 'perspective', '地面队伍继续寻找通路，视角转向撤离车队。'],
  ['aircraft', 'parallel', '回到同日下午，另一架黑鹰仍在行动区上空。'],
  ['rescue', 'perspective', '同一坠机点，接过抵达现场的救援人员视角。'],
  ['medical', 'parallel', '视角转回第一坠机点附近，军医正在接收伤员。'],
  ['walk', 'continuous', '离开收容房间，加入附近街区的夜间防守。'],
  ['convoy', 'later', '凌晨，接应的车队开始进入城区。'],
  ['recovery', 'perspective', '车队抵达接应区，继续机组与伤员的转运。'],
  ['foot', 'perspective', '最后一辆车离开后，徒步队员跟随车队撤离。'],
  ['return', 'later', '撤离队伍抵达基地，开始清点与救护。'],
];
const TRAVEL_VISUALS={
  perspective:{offset:[0,.045,-.18],yaw:.035,pitch:.009,roll:0,bob:0,hz:0,occluder:'smoke'},
  walk:{offset:[.035,0,-.65],yaw:.008,pitch:0,roll:.002,bob:.012,hz:1.6,occluder:'shadow'},
  airlift:{offset:[.08,.24,-1.7],yaw:.012,pitch:-.012,roll:.010,bob:.006,hz:4,occluder:'rotor-dust'},
  convoy:{offset:[.04,.025,-1.25],yaw:.012,pitch:0,roll:.003,bob:.014,hz:2.8,occluder:'road-dust'},
  rescue:{offset:[.06,.025,-.8],yaw:.014,pitch:-.006,roll:.003,bob:.009,hz:1.8,occluder:'smoke'},
  foot:{offset:[-.035,0,-.8],yaw:-.008,pitch:0,roll:.003,bob:.015,hz:1.7,occluder:'road-dust'},
  aircraft:{offset:[.035,.09,-.35],yaw:-.030,pitch:.012,roll:.006,bob:.003,hz:3,occluder:'smoke'},
  medical:{offset:[.02,.035,-.22],yaw:.016,pitch:-.008,roll:0,bob:.004,hz:1.2,occluder:'shadow'},
  recovery:{offset:[.025,.015,-.48],yaw:.008,pitch:-.005,roll:.002,bob:.006,hz:1.3,occluder:'smoke'},
  return:{offset:[0,.035,-1.0],yaw:-.008,pitch:0,roll:.002,bob:.008,hz:2.3,occluder:'road-dust'},
};

const clamp=value=>Math.min(1,Math.max(0,value));
const smooth=value=>{value=clamp(value);return value*value*(3-2*value);};

export function getChapterTransition(fromId) {
  if(fromId===16)return null;
  if(!Number.isInteger(fromId)||fromId<1||fromId>15)throw new RangeError('A chapter handoff must begin in chapters 1–15.');
  const from=CHAPTERS[fromId-1],to=CHAPTERS[fromId],spec=HANDOFFS[fromId-1];
  const identity=chapter=>Object.freeze({id:chapter.id,title:chapter.title,role:chapter.role,time:chapter.time,location:chapterLocation(chapter.id),mood:chapter.mood,movementLocked:Boolean(chapter.movementLocked)});
  const motion=TRAVEL_VISUALS[spec[0]];
  return Object.freeze({
    id:`chapter-${fromId}-to-${fromId+1}`,from:identity(from),to:identity(to),
    travelType:spec[0],continuity:spec[1],text:spec[2],
    // Camera-local metres and radians, relative to the final closing pose.
    // Only apply while visual.active; the incoming opening owns its own camera.
    motion:Object.freeze({...motion,offset:Object.freeze([...motion.offset])}),
    timing:Object.freeze({depart:spec[0]==='airlift'?1.15:.85,fadeOut:.60,covered:.20,fadeIn:.65}),
  });
}

/**
 * Advance once per rendered frame. The frame that first reaches `covered` must
 * be rendered with opacity 1 before the next update can emit `swap-scene`.
 * The owner loads the next chapter and starts its opening while covered, then
 * calls sceneReady(event.id). This controller never edits campaign state,
 * input, audio, cameras, resources or the opening director's interactive clock.
 */
export function createChapterTransition() {
  let generation=0,plan=null,response='',phase='idle',phaseTime=0,time=0,paused=false,active=false,swapSent=false,ready=false,fastReveal=false;
  let events=[];
  function inspect(){
    const timing=plan?.timing;
    const opacity=phase==='covered'?1:phase==='fade-out'?smooth(phaseTime/timing.fadeOut):phase==='fade-in'?1-smooth(phaseTime/(fastReveal?.15:timing.fadeIn)):0;
    const departTime=phase==='depart'?phaseTime:phase==='fade-out'?timing.depart+phaseTime:timing?timing.depart+timing.fadeOut:0;
    const progress=timing?clamp(departTime/(timing.depart+timing.fadeOut)):0,motion=plan?.motion,weight=smooth(progress);
    const bob=motion?Math.sin(time*Math.PI*2*motion.hz)*motion.bob*Math.min(1,progress*4):0;
    return {id:generation,active,paused,phase,time,phaseTime,opacity,swapRequested:swapSent,sceneReady:ready,
      travelProgress:progress,
      arrivalProgress:phase==='complete'?1:phase==='fade-in'?clamp(phaseTime/(fastReveal?.15:timing.fadeIn)):0,
      visual:motion?{active:phase==='depart'||phase==='fade-out',cameraOffset:motion.offset.map((v,i)=>v*weight+(i===1?bob:0)),yaw:motion.yaw*weight,pitch:motion.pitch*weight,roll:motion.roll*weight,occluder:motion.occluder}:null,
      plan,response};
  }
  function start(nextPlan,{response:choiceResponse=''}={}){
    if(active)throw new Error('Finish or cancel the active handoff before starting another.');
    if(!nextPlan||nextPlan.to?.id!==nextPlan.from?.id+1||!nextPlan.timing)throw new TypeError('A consecutive chapter transition plan is required.');
    for(const key of['depart','fadeOut','covered','fadeIn'])if(!Number.isFinite(nextPlan.timing[key])||nextPlan.timing[key]<=0)throw new TypeError('Transition timings must be finite positive seconds.');
    generation++;plan=nextPlan;response=String(choiceResponse||'');phase='depart';phaseTime=time=0;paused=false;active=true;swapSent=ready=fastReveal=false;events=[];return inspect();
  }
  function update(dt){
    if(!active||paused||!Number.isFinite(dt)||dt<=0)return inspect();
    // Returning from a hidden tab must not jump across both sides of the swap.
    dt=Math.min(dt,.25);time+=dt;
    if(phase==='covered'){
      phaseTime+=dt;
      if(!swapSent){swapSent=true;events.push({type:'swap-scene',id:generation,fromId:plan.from.id,toId:plan.to.id});return inspect();}
      if(ready&&phaseTime>=plan.timing.covered){phase='fade-in';phaseTime=0;}
      return inspect();
    }
    phaseTime+=dt;
    if(phase==='depart'&&phaseTime>=plan.timing.depart){phaseTime-=plan.timing.depart;phase='fade-out';}
    if(phase==='fade-out'&&phaseTime>=plan.timing.fadeOut){phase='covered';phaseTime=0;return inspect();}
    if(phase==='fade-in'&&phaseTime>=(fastReveal?.15:plan.timing.fadeIn)){
      phase='complete';phaseTime=fastReveal?.15:plan.timing.fadeIn;active=false;events.push({type:'complete',id:generation,fromId:plan.from.id,toId:plan.to.id});
    }
    return inspect();
  }
  function sceneReady(id){if(!active||phase!=='covered'||!swapSent||id!==generation)return false;ready=true;return true;}
  function skip(){
    if(!active||paused)return false;
    // Skip shortens the bridge, but never loads/reveals a scene in the same tick.
    fastReveal=true;if(phase==='depart'||phase==='fade-out'){phase='covered';phaseTime=0;}return true;
  }
  function cancel(){const wasActive=active;generation++;active=paused=swapSent=ready=fastReveal=false;phase='idle';phaseTime=time=0;plan=null;response='';events=[];return wasActive;}
  return {start,update,inspect,sceneReady,skip,cancel,takeEvents(){const pending=events;events=[];return pending;},pause(){if(active)paused=true;},resume(){paused=false;},get active(){return active;}};
}
