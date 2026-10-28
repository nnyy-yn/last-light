import {createNavigator} from './actor-behavior.js';

const point=p=>Array.isArray(p)?{x:p[0],z:p[1]}:{x:p.x,z:p.z};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function routeBearing(player,target){
  const a=point(player),b=point(target),r=Math.atan2(-(b.x-a.x),-(b.z-a.z))-(player.yaw||0);
  const degrees=-Math.atan2(Math.sin(r),Math.cos(r))*180/Math.PI;
  const turn=Math.abs(degrees)>145?'转身':Math.abs(degrees)<24?'沿当前方向':degrees<0?'向左转':'向右转';
  return {degrees,turn};
}

// Navigation is computed against the same physical footprints used for walking.
// The next visible corner, rather than a point behind a wall, is the HUD target.
export function createMissionNavigation(){
  const navigator=createNavigator({cellSize:1,radius:.43});
  let route=[],lastTask=null,lastGoal=null,lastStart=null,replanIn=0,status='idle',last=null,revision=0;
  function reset({bounds,colliders=[]}={}){if(bounds)navigator.setBounds(bounds);navigator.setColliders(colliders);route=[];lastTask=lastGoal=lastStart=last=null;replanIn=0;status='idle';revision++;}
  function update({player,goal,taskId,radio=false,near=false,dt=0}={}){
    const start=point(player),target=point(goal||player);replanIn=Math.max(0,replanIn-Math.max(0,dt));
    if(radio){route=[];replanIn=0;status='radio';last={taskId,status,route:[],next:null,distance:0,routeDistance:0,turn:'原地回应无线电',degrees:0,revision};return last;}
    if(near){route=[];replanIn=0;status='arrived';last={taskId,status,route:[],next:target,distance:distance(start,target),routeDistance:distance(start,target),...routeBearing(player,target),revision};return last;}
    const moved=!lastStart||distance(start,lastStart)>2,changed=lastTask!==taskId||!lastGoal||distance(target,lastGoal)>1.5;
    if(changed||replanIn===0&&(moved||!route.length)){
      const end=navigator.nearest(target,null,2.7);
      route=end?navigator.findPath(start,end,40000):[];
      status=route.length?'route':'unreachable';lastStart={...start};lastGoal={...target};lastTask=taskId;replanIn=1.1;revision++;
    }
    while(route.length>1&&distance(start,route[0])<1.8)route.shift();
    // Skip passed corners only when the real swept-body test is clear.
    while(route.length>1&&navigator.clear(start,route[1]))route.shift();
    const next=route[0]||null,points=[start,...route];let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);
    last={taskId,status,route:route.map(p=>({...p})),next:next?{...next}:null,distance:distance(start,target),routeDistance:next?length:null,...routeBearing(player,next||target),revision};return last;
  }
  return {reset,update,inspect:()=>last?structuredClone(last):null};
}
