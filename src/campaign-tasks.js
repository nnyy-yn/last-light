import {getChapterMissionPlan} from './chapter-mission-plans.js';
import {createNavigator} from './actor-behavior.js';
import {blocked,lineBlocked} from './simulation.js';

// Keep the three original dramatic events, with authored local operations
// around them. Minute budgets describe a first-play target, never a time gate.
export function campaignChapter(base){
  const plan=getChapterMissionPlan(base.id),tasks=[];
  for(let slot=0;slot<=base.tasks.length;slot++){
    for(const task of plan.tasks.filter(t=>(t.insertBeforeCore??((t.insertAfterCore??-1)+1))===slot))tasks.push({...structuredClone(task),extra:true,spawn:task.spawn,seconds:task.seconds||4,text:task.text||task.dialogue.at(-1).text,sceneEvent:task.sceneEvent||'mission-'+base.id+'-'+task.id});
    if(slot<base.tasks.length)tasks.push({...structuredClone(base.tasks[slot]),coreIndex:slot});
  }
  return {...base,missionPlan:plan,tasks};
}
function anchorPoint(anchor,layout){
  const key=String(anchor||'spawn'),core=layout.coreBounds||layout.bounds;
  if(/^core[0-2]$/.test(key))return layout.taskPositions[Number(key.slice(-1))];
  if(/^court[01]$/.test(key))return layout.expansion?.checkpoints[Number(key.slice(-1))]?.pos||layout.spawn;
  const ix=Math.max(48,Math.max(Math.abs(core.minX),Math.abs(core.maxX))+14),iz=Math.max(48,Math.max(Math.abs(core.minZ),Math.abs(core.maxZ))+14);
  return ({west:[-ix,0],east:[ix,0],north:[0,-iz],south:[0,iz],cockpit:[-.4,-.35],'injured-cockpit':[-.4,-.35],door:[1.95,.9],'cockpit-door':[1.95,.9],spawn:layout.spawn})[key]||layout.spawn;
}
export function placeCampaignTasks(base,layout,colliders){
  const chapter=campaignChapter(base),nav=createNavigator({cellSize:1,radius:.5});nav.setBounds(layout.bounds);nav.setColliders(colliders);
  const occupied=layout.taskPositions.map(p=>({x:p[0],z:p[1]}));
  let previous={x:layout.spawn[0],z:layout.spawn[1]};
  chapter.tasks=chapter.tasks.map((task,index)=>{
    if(task.coreIndex!=null){const pos=layout.taskPositions[task.coreIndex];previous={x:pos[0],z:pos[1]};return {...task,pos:[...pos]};}
    if(task.actorFrom)return {...task};
    const anchor=anchorPoint(task.anchor,layout);
    if(base.movementLocked)return {...task,pos:[...anchor],spawn:false,kind:'waypoint',carry:false};
    let target=null;
    const candidates=[];
    for(const radius of[0,2.6,4,6,9,13,19])for(let angle=0;angle<(radius?16:1);angle++){
      const a=(angle+index*.31)*Math.PI/8,p={x:anchor[0]+Math.cos(a)*radius,z:anchor[1]+Math.sin(a)*radius};
      if(!nav.valid(p)||blocked(p.x,p.z,colliders,1)||occupied.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<2.3))continue;
      // An actor must have a clear, reachable standing place beside them.
      const approach={x:p.x+.7,z:p.z+.7};if(!nav.valid(approach)||lineBlocked(p,approach,colliders))continue;
      candidates.push(p);
    }
    for(const p of candidates){if(nav.findPath(previous,p,40000).length){target=p;break;}}
    if(!target)throw new Error('No reachable mission anchor for chapter '+base.id+' / '+task.id+' / '+task.anchor);
    occupied.push(target);previous=target;return {...task,pos:[target.x,target.z]};
  });
  const resolve=(task,visited=new Set())=>{
    if(!task.actorFrom)return task;
    if(visited.has(task.id))throw new Error('Cyclic actor reference: '+task.id);visited.add(task.id);
    const source=chapter.tasks.find(t=>t.id===task.actorFrom);if(!source)throw new Error('Unknown actor reference: '+task.actorFrom);
    resolve(source,visited);task.pos=[...source.pos];task.kind=source.kind;return task;
  };
  chapter.tasks.forEach(t=>resolve(t));
  return chapter;
}
