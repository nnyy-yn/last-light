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
 const result=buildStreetPopulation(l,boxes);assert(result.residents.length>0);
 for(const r of result.residents){for(const p of[r.pos,r.shelter]){assert(within(p,l.bounds));assert(boxes.every(b=>clearance(p,b)>.4));}assert(clearSegment(r.pos,r.shelter,boxes),'a whole resident, not just its centre line, must fit');}
 for(const c of result.contacts){assert(within(c.pos,l.bounds));assert(!clearSegment(l.spawn,c.pos,boxes,0),'contact waits behind actual cover');assert(clearSegment(l.spawn,c.safePeek,boxes,0));assert(clearSegment(c.pos,c.safePeek,boxes),'a whole soldier must fit around the corner');}
});

test('reserved shelter locations cannot become another resident or contact spawn',()=>{
 const l=layout({spawn:[-10,-16],roads:[{points:[[0,-40],[0,40]],width:5}],route:[[-10,-16],[-10,-35]]}),result=buildStreetPopulation(l);
 assert(result.residents.length>=3);
 const endpoints=result.residents.flatMap((r,i)=>[{p:r.pos,owner:i},{p:r.shelter,owner:i}]);
 for(let i=0;i<endpoints.length;i++)for(let j=i+1;j<endpoints.length;j++)if(endpoints[i].owner!==endpoints[j].owner)assert(distance(endpoints[i].p,endpoints[j].p)>=1.1,'resident occupancy and shelter reservations must not overlap');
 for(const c of [...result.contacts,...result.reserves])for(const e of endpoints)assert(distance(c.pos,e.p)>=1.1);
});

test('initial contacts use physical shelter and a body-clear peek instead of open-road staging',()=>{
 const l=layout(),boxes=[{minX:-.9,maxX:.9,minZ:-2,maxZ:2}],result=buildStreetPopulation(l,boxes);assert(result.contacts.length>0);
 for(const c of result.contacts){assert.deepEqual(c.pos,c.coverAnchor);assert(distance(c.pos,c.safePeek)>=1);assert(!clearSegment(l.spawn,c.pos,boxes,0));assert(clearSegment(l.spawn,c.safePeek,boxes,0));assert(clearSegment(c.pos,c.safePeek,boxes,.4));assert.equal(c.opening,false);}
 assert.equal(buildStreetPopulation(l).contacts.length,0,'an empty road must not manufacture two stationary targets');
});

test('camera-facing empty roads do not force contacts in either camera direction',()=>{
 const l=layout({spawn:[0,0],facing:0,route:[[0,0],[0,36]],roads:[{points:[[0,-35],[0,38]],width:8}]}),result=buildStreetPopulation(l);
 assert.equal(result.contacts.length,0,'no actual cover is available');
});

test('cover points sealed by adjacent obstacles are rejected rather than forcing a count',()=>{
 const l=layout(),boxes=[{minX:-.9,maxX:.9,minZ:-2,maxZ:2},{minX:-4,maxX:-1.3,minZ:-6,maxZ:4},{minX:1.3,maxX:4,minZ:-6,maxZ:4}];
 const result=buildStreetPopulation(l,boxes);for(const c of result.contacts)assert(clearSegment(c.pos,c.safePeek,boxes,.4));
 const sealed=buildStreetPopulation(l,[{minX:-30,maxX:30,minZ:-42,maxZ:42}]);assert.equal(sealed.contacts.length,0);assert.equal(sealed.reserves.length,0);
});

test('peaceful bases, hangar, medical room and confined cockpit do not acquire combatants',()=>{
 for(const id of[2,3,9,11,16]){const population=buildStreetPopulation(getChapterLayout(id));assert.equal(population.contacts.length,0);assert.equal(population.reserves.length,0);}
 const clinic=buildStreetPopulation(getChapterLayout(1));assert(clinic.residents.length>0);assert.equal(clinic.contacts.length,0);assert.equal(clinic.reserves.length,0);
});

test('all sixteen authored layouts remain deterministic and do not mutate story positions',()=>{
 for(const source of CHAPTER_LAYOUTS){const l=structuredClone(source),before=structuredClone(l),first=buildStreetPopulation(l);assert.deepEqual(l,before);assert.deepEqual(first,buildStreetPopulation(l));assert(first.residents.length<=10);assert(first.contacts.length<=2);
  for(const r of first.residents)for(const p of[r.pos,r.shelter]){assert(within(p,l.bounds));for(const reserved of[...l.taskPositions,...l.enemySpawns.map(e=>e.pos)])assert(distance(p,reserved)>2.4);}
  for(const c of first.contacts){const d=distance(l.spawn,c.pos);assert(d>=18&&d<=43);assert(within(c.safePeek,l.bounds));}
  assert(first.reserves.length<=l.encounter.reserveCount);
  for(const r of first.reserves){assert(r.reserve);const d=distance(l.spawn,r.pos);assert(d>=35&&d<=88);for(const p of[r.pos,r.rally])assert(within(p,l.bounds));assert(clearSegment(r.pos,r.rally,[],.4));}
 }
});

test('reserves occupy separated pre-existing roadside positions with safe approach segments',()=>{
 const l=layout(),boxes=[{minX:2.6,maxX:5,minZ:-23,maxZ:-21}],result=buildStreetPopulation(l,boxes);assert(result.reserves.length>=2);
 const other=result.residents.flatMap(r=>[r.pos,r.shelter]).concat(result.contacts.flatMap(c=>[c.pos,c.safePeek]),l.taskPositions,l.enemySpawns.map(e=>e.pos));
 for(const [i,r] of result.reserves.entries()){
   assert(distance(r.pos,l.spawn)>=35);assert(clearSegment(r.pos,r.rally,boxes,.4));assert(r.activationDelay>=10);assert.equal(r.reserve,true);
   for(const p of[r.pos,r.rally]){assert(boxes.every(b=>clearance(p,b)>.4));for(const q of other)assert(distance(p,q)>2.4);}
   for(const previous of result.reserves.slice(0,i))assert(distance(previous.pos,r.pos)>=9);
 }
});


test('lamp-size poles and low debris are not advertised as soldier-sized cover',()=>{
 const l=layout();for(const boxes of [[{minX:-.12,maxX:.12,minZ:-.12,maxZ:.12}],[{minX:-.9,maxX:.9,minZ:-2,maxZ:2,minY:0,maxY:.3}]])assert.equal(buildStreetPopulation(l,boxes).contacts.length,0);
});
