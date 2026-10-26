import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStreetPopulation} from '../src/street-population.js';
import {CHAPTER_LAYOUTS,getChapterLayout} from '../src/chapter-layouts.js';

const layout=(overrides={})=>({type:'narrow-t-street',bounds:{minX:-30,maxX:30,minZ:-42,maxZ:42},spawn:[0,28],facing:0,taskPositions:[[19,18],[19,0],[19,-18]],enemySpawns:[{pos:[-19,-24]}],roads:[{points:[[0,38],[0,-38]],width:8}],route:[[0,28],[0,-32]],...overrides});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Independent clearance oracle: point-to-AABB distance and dense motion samples.
// No production blocked()/lineBlocked() helpers are reused by these assertions.
function clearance(point,box){return Math.hypot(Math.max(box.minX-point[0],0,point[0]-box.maxX),Math.max(box.minZ-point[1],0,point[1]-box.maxZ));}
function clearSegment(a,b,boxes,radius=.40){const steps=Math.ceil(distance(a,b)/.035);for(let n=0;n<=steps;n++){const t=steps?n/steps:0,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(boxes.some(box=>clearance(p,box)<=radius))return false;}return true;}
function within(p,b,r=.40){return p[0]-r>=b.minX&&p[0]+r<=b.maxX&&p[1]-r>=b.minZ&&p[1]+r<=b.maxZ;}

test('city residents and initial contacts respect real obstacle extents, route clearance and bounds',()=>{
 const l=layout(),boxes=[{minX:-3.85,maxX:-3.48,minZ:-40,maxZ:40},{minX:1.0,maxX:5,minZ:2,maxZ:5},{minX:3.55,maxX:4.0,minZ:26,maxZ:28}];
 const result=buildStreetPopulation(l,boxes);assert(result.residents.length>0);assert(result.contacts.length>0);
 for(const r of result.residents){for(const p of[r.pos,r.shelter]){assert(within(p,l.bounds));assert(boxes.every(b=>clearance(p,b)>.4));}assert(clearSegment(r.pos,r.shelter,boxes),'a whole resident, not just its centre line, must fit');}
 for(const c of result.contacts){assert(within(c.pos,l.bounds));assert(clearSegment(l.spawn,c.pos,boxes,0),'contact must be visible from spawn');for(const p of c.patrol){assert(within(p,l.bounds));assert(clearSegment(c.pos,p,boxes),'initial crossing must fit through the actual street');}}
});

test('reserved shelter locations cannot become another resident or contact spawn',()=>{
 const l=layout({spawn:[-10,-16],roads:[{points:[[0,-40],[0,40]],width:5}],route:[[-10,-16],[-10,-35]]}),result=buildStreetPopulation(l);
 assert(result.residents.length>=3);
 const endpoints=result.residents.flatMap((r,i)=>[{p:r.pos,owner:i},{p:r.shelter,owner:i}]);
 for(let i=0;i<endpoints.length;i++)for(let j=i+1;j<endpoints.length;j++)if(endpoints[i].owner!==endpoints[j].owner)assert(distance(endpoints[i].p,endpoints[j].p)>=1.1,'resident occupancy and shelter reservations must not overlap');
 for(const c of result.contacts)for(const e of endpoints)assert(distance(c.pos,e.p)>=1.1);
});

test('an initial contact has a safe actual crossing waypoint, never its own spawn',()=>{
 const l=layout(),result=buildStreetPopulation(l);assert.equal(result.contacts.length,2);
 for(const c of result.contacts){assert(distance(c.pos,c.patrol[0])>=1.5,'enemy opening reads patrol[0], so it must move');assert(clearSegment(c.pos,c.patrol[0],[],.4));assert(c.fireDelay>=5);}
});

test('clear line of sight behind the initial camera is not advertised as first contact',()=>{
 const l=layout({spawn:[0,0],facing:0,route:[[0,0],[0,36]],roads:[{points:[[0,-35],[0,38]],width:8}]}),result=buildStreetPopulation(l);
 assert.equal(result.contacts.length,0,'all candidate contacts are behind the camera');
});

test('short patrol targets cannot cross an adjacent thin wall although the spawn is free',()=>{
 const l=layout({type:'military-camp',roads:[],spawn:[0,28],route:[[0,28],[0,-32]]}),boxes=[{minX:1.72,maxX:2.2,minZ:11.7,maxZ:12.3}];
 const result=buildStreetPopulation(l,boxes);assert(result.contacts.length>0);for(const c of result.contacts)for(const p of c.patrol)assert(clearSegment(c.pos,p,boxes,.4));
 // Completely sealed street must never force an invalid contact to satisfy count.
 const sealed=buildStreetPopulation(l,[{minX:-30,maxX:30,minZ:12,maxZ:15}]);assert.equal(sealed.contacts.length,0);
});

test('peaceful bases, hangar, medical room and confined cockpit do not acquire combatants',()=>{
 for(const id of[2,3,9,11,16])assert.deepEqual(buildStreetPopulation(getChapterLayout(id)),{residents:[],contacts:[]});
 const clinic=buildStreetPopulation(getChapterLayout(1));assert(clinic.residents.length>0);assert.equal(clinic.contacts.length,0);
});

test('all sixteen authored layouts remain deterministic and do not mutate story positions',()=>{
 for(const source of CHAPTER_LAYOUTS){const l=structuredClone(source),before=structuredClone(l),first=buildStreetPopulation(l);assert.deepEqual(l,before);assert.deepEqual(first,buildStreetPopulation(l));assert(first.residents.length<=6);assert(first.contacts.length<=2);
  for(const r of first.residents)for(const p of[r.pos,r.shelter]){assert(within(p,l.bounds));for(const reserved of[...l.taskPositions,...l.enemySpawns.map(e=>e.pos)])assert(distance(p,reserved)>2.4);}
  for(const c of first.contacts){const d=distance(l.spawn,c.pos),dx=c.pos[0]-l.spawn[0],dz=c.pos[1]-l.spawn[1];assert(d>=18&&d<=35);assert((-Math.sin(l.facing)*dx-Math.cos(l.facing)*dz)/d>Math.cos(42*Math.PI/180));for(const p of c.patrol)assert(within(p,l.bounds));}
 }
});
