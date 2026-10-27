import { blocked, movePlayer, lineBlocked } from './simulation.js';
import {traceObstacles} from './ballistics.js';

const point = value => Array.isArray(value) ? { x: value[0], z: value.length > 2 ? value[2] : value[1] } : { x: value?.x ?? 0, z: value?.z ?? 0 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const copy = p => p ? { x: p.x, z: p.z } : null;
const live = r => r.entity?.alive !== false && r.actor.userData?.dead !== true && !r.actor.userData?.disposed;

class Heap {
  data = [];
  push(node) { const d = this.data; d.push(node); let i = d.length - 1; while (i) { const p = (i - 1) >> 1; if (d[p].f <= node.f) break; d[i] = d[p]; i = p; } d[i] = node; }
  pop() { const d = this.data, first = d[0], tail = d.pop(); if (d.length) { let i = 0; while (i * 2 + 1 < d.length) { let c = i * 2 + 1; if (c + 1 < d.length && d[c + 1].f < d[c].f) c++; if (d[c].f >= tail.f) break; d[i] = d[c]; i = c; } d[i] = tail; } return first; }
}

/** Metre grid with radius-expanded LOS, diagonal corner checks and cached paths. */
export function createNavigator({ cellSize = 1, bound = 91, radius = .40 } = {}) {
  let boxes = [], inflated = [], signature = '', version = 0;
  let bounds={minX:-bound,maxX:bound,minZ:-bound,maxZ:bound};
  const cells = new Map(), paths = new Map(),failures=new Set(),spatial=new Map(),bucketSize=8;
  const key = (x, z) => `${x},${z}`;
  function setBounds(next){
    if(!next||!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(next[k]))||next.minX>=next.maxX||next.minZ>=next.maxZ)return;
    if(Object.keys(bounds).every(k=>bounds[k]===next[k]))return;
    bounds={minX:next.minX,maxX:next.maxX,minZ:next.minZ,maxZ:next.maxZ};bound=Math.max(...Object.values(bounds).map(Math.abs));version++;cells.clear();paths.clear();failures.clear();
  }
  function setColliders(next = []) {
    const nextSignature = next.map(b => `${b.minX},${b.maxX},${b.minZ},${b.maxZ}`).join(';');
    if (nextSignature === signature) return;
    signature = nextSignature; boxes = next; version++; cells.clear(); paths.clear();failures.clear();spatial.clear();
    inflated = boxes.map(b => ({ minX: b.minX - radius, maxX: b.maxX + radius, minZ: b.minZ - radius, maxZ: b.maxZ + radius }));
    for(const b of inflated)for(let x=Math.floor(b.minX/bucketSize);x<=Math.floor(b.maxX/bucketSize);x++)for(let z=Math.floor(b.minZ/bucketSize);z<=Math.floor(b.maxZ/bucketSize);z++){
      const k=key(x,z);if(!spatial.has(k))spatial.set(k,[]);spatial.get(k).push(b);
    }
  }
  const nearby=p=>spatial.get(key(Math.floor(p.x/bucketSize),Math.floor(p.z/bucketSize)))||[];
  const valid = p => p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ&&!blocked(p.x,p.z,nearby(p),0);
  const clear = (a, b) => {
    if(!valid(b))return false;
    const checked=new Set();
    for(let x=Math.floor(Math.min(a.x,b.x)/bucketSize);x<=Math.floor(Math.max(a.x,b.x)/bucketSize);x++)for(let z=Math.floor(Math.min(a.z,b.z)/bucketSize);z<=Math.floor(Math.max(a.z,b.z)/bucketSize);z++)for(const box of spatial.get(key(x,z))||[]){
      if(checked.has(box))continue;checked.add(box);if(lineBlocked(a,b,[box]))return false;
    }
    return true;
  };
  function nearest(target, from = null, maxRadius = 3) {
    if (valid(target) && (!from || clear(from, target))) return copy(target);
    for (let r = .5; r <= maxRadius; r += .5) for (let i = 0; i < 16; i++) {
      const p = { x: target.x + Math.cos(i / 16 * Math.PI * 2) * r, z: target.z + Math.sin(i / 16 * Math.PI * 2) * r };
      if (valid(p) && (!from || clear(from, p))) return p;
    }
    return null;
  }
  function nodeValid(x, z) { const k = key(x, z); if (!cells.has(k)) cells.set(k, valid({ x: x * cellSize, z: z * cellSize })); return cells.get(k); }
  function gridConnector(p) {
    const cx = Math.round(p.x / cellSize), cz = Math.round(p.z / cellSize), candidates = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const x = cx + dx, z = cz + dz, q = { x: x * cellSize, z: z * cellSize };
      if (nodeValid(x, z) && clear(p, q)) candidates.push({ x, z, q, distance: distance(p, q) });
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0];
  }
  function findPath(start, requested, maxNodes = 6500) {
    const goal = nearest(requested);
    if (!goal || !valid(start)) return [];
    if (clear(start, goal)) return [goal];
    const begin = gridConnector(start), end = gridConnector(goal);
    if (!begin || !end) return [];
    const cacheKey = `${begin.x},${begin.z}:${end.x},${end.z}`;
    const failureKey=cacheKey+':'+maxNodes;if(failures.has(failureKey))return [];
    let route = paths.get(cacheKey);
    if (!route) {
      const open = new Heap(), scores = new Map(), previous = new Map(), endKey = key(end.x, end.z);
      const heuristic = (x, z) => Math.hypot(x - end.x, z - end.z);
      const startKey = key(begin.x, begin.z); scores.set(startKey, 0); open.push({ x: begin.x, z: begin.z, g: 0, f: heuristic(begin.x, begin.z), k: startKey });
      let found = false, visited = 0;
      while (open.data.length && visited++ < maxNodes) {
        const node = open.pop(); if (node.g !== scores.get(node.k)) continue;
        if (node.k === endKey) { found = true; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = node.x + dx, z = node.z + dz, k = key(x, z);
          if (!nodeValid(x, z) || !clear({ x: node.x * cellSize, z: node.z * cellSize }, { x: x * cellSize, z: z * cellSize })) continue;
          const g = node.g + Math.hypot(dx, dz);
          if (g >= (scores.get(k) ?? Infinity)) continue;
          scores.set(k, g); previous.set(k, node.k); open.push({ x, z, g, f: g + heuristic(x, z), k });
        }
      }
      if (!found) {if(failures.size>180)failures.delete(failures.values().next().value);failures.add(failureKey);return [];}
      route = []; let cursor = endKey;
      while (cursor) { const [x, z] = cursor.split(',').map(Number); route.unshift({ x: x * cellSize, z: z * cellSize }); cursor = previous.get(cursor); }
      if (paths.size > 100) paths.delete(paths.keys().next().value);
      paths.set(cacheKey, route);
    }
    const raw = [...route.map(copy), goal], smooth = []; let cursor = start, index = 0;
    while (index < raw.length) { let far = index; while (far + 1 < raw.length && clear(cursor, raw[far + 1])) far++; if (!clear(cursor, raw[far])) return []; smooth.push(raw[far]); cursor = raw[far]; index = far + 1; }
    return smooth;
  }
  return { setColliders,setBounds, findPath, clear, valid, nearest, get version() { return version; },get bounds(){return {...bounds};},get bound(){return bound;} };
}

/**
 * Simulation-only director. World-space aim events are emitted only after an
 * immediate LOS check against all colliders, including chapter vehicles.
 * update(dt,{player,combatAllowed}); callbacks never apply damage themselves.
 */
export function createActorDirector({ colliders = [], staticColliders = [], navigationColliders = [], obscures = () => false, onFire = () => {}, onCallout = () => {}, seed = 1993 } = {}) {
  const navigator = createNavigator(), actors = [];
  let now = 0, nextId = 0, context = {}, obstacles = [], randomState = seed >>> 0,nextCalloutGlobal=0,suppressionOrder=null;
  const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
  const read = source => typeof source === 'function' ? source() : source;
  function sync() { obstacles = [...new Set([...(read(staticColliders) || []), ...(read(colliders) || [])])]; navigator.setColliders([...obstacles,...(read(navigationColliders)||[])]); }
  function resolve(value) { return actors.find(r => r === value || r.actor === value || r.id === value); }
  function setContext(next = {}) { context = { ...context, ...next }; if ('colliders' in next) colliders = next.colliders; if ('staticColliders' in next) staticColliders = next.staticColliders;if(next.bounds)navigator.setBounds(next.bounds); sync(); }
  function reset(next = {}) { actors.length = 0; now = 0; nextId = 0;nextCalloutGlobal=0;suppressionOrder=null; randomState = seed >>> 0; context = {}; setContext(next); }
  function add(actor, options = {}) {
    if (!actor?.position) throw new Error('Actor requires a position');
    sync();
    actor.userData ||= {}; actor.rotation ||= { y: 0 };
    const kind = options.kind || actor.userData.kind || 'soldier';
    const role = options.role || (kind === 'enemy' ? 'enemy' : kind === 'civilian' ? 'civilian' : 'guard');
    const encounter=options.encounter||{};
    const enemyIndex=actors.filter(a=>a.kind==='enemy').length;
    if(kind==='enemy'&&encounter.lookAt){const facing=point(encounter.lookAt);actor.rotation.y=Math.atan2(facing.x-actor.position.x,facing.z-actor.position.z);}
    const r = { id: options.id ?? `actor-${++nextId}`, actor, entity: options.entity, kind, role, index: actors.length,
      x: actor.position.x, z: actor.position.z, anchor: point(options.anchor || actor.position), tether: options.tether ?? 2,
      follow: Boolean(options.follow), behavior: kind === 'wounded' ? 'wounded' : 'alert', stance: 'stand', speed: 0,
      velocityX:0,velocityZ:0,moveDistance:0,turnVelocity:0,acceleration:0,hitReactUntil:0,nextHitReact:0,
      weaponId:actor.userData.weaponId||(kind==='enemy'?'ak':'m16a2'),
      goal: null, path: [], pathVersion: -1, replanAt: 0, thinkAt: 0, actionUntil: 0, fireAt: Number.isFinite(encounter.fireDelay)?Math.max(2.1,encounter.fireDelay):2.1 + random(),
      encounter,route:Array.isArray(encounter.patrol)?encounter.patrol.map(point):[],shelter:options.shelter?point(options.shelter):null,residentWait:options.wait??0,localThreatOnly:options.localThreatOnly??actor.userData.resident?.localThreatOnly??false,firstContactAt:null,openingUntil:0,
      tacticalRole:kind==='enemy'?(encounter.tacticalRole||['support','flank-left','flank-right'][enemyIndex%3]):null,reserveActive:!encounter.reserve,reserveActivatedAt:null,
      maneuver:null,maneuverUntil:0,maneuverAt:0,holdUntil:0,aimTime:0,trackingTarget:null,searchStep:0,searchGoal:null,searchAt:0,lastSharedAt:-Infinity,
      lastSeen: -Infinity, lastKnown: null, heardUntil: 0, visible: false, suppression: 0, suppressedUntil: 0, threat: null,
      cover: null, peek: null, coverUntil: 0, target: null, aimTarget: null, recoil: 0, alert: 0,
      shotsFired: 0, shotsBlocked: 0, magSize:18+(actors.length%3)*3,mag:18+(actors.length%3)*3,reserve:(18+(actors.length%3)*3)*3,burstRemaining:0,shotAt:0,reloadStart:0,reloadUntil:0,reloadProgress:0,reloads:0,
      stuckCount: 0, stuckTime: 0, patrol: 0, nextCallout: 0, scanAt: .2, scanYaw: actor.rotation.y || 0 };
    if(!navigator.valid(r)){
      const extent=navigator.bounds,corrected=navigator.nearest({x:clamp(r.x,extent.minX+.5,extent.maxX-.5),z:clamp(r.z,extent.minZ+.5,extent.maxZ-.5)},null,14);
      if(corrected){r.x=corrected.x;r.z=corrected.z;actor.position.x=r.x;actor.position.z=r.z;r.startCorrected=true;if(r.entity){r.entity.x=r.x;r.entity.z=r.z;}if(!navigator.valid(r.anchor)||distance(r,r.anchor)>r.tether)r.anchor=copy(corrected);}
    }
    if(kind==='enemy'&&encounter.coverAnchor&&encounter.safePeek){
      const position=point(encounter.coverAnchor),peek=point(encounter.safePeek);
      if(navigator.valid(position)&&navigator.valid(peek)&&navigator.findPath(position,peek,1800).length){
        r.sentryCover={position,peek};r.cover={position:copy(position),peek:copy(peek)};r.coverUntil=now+1.2;
      }
    }
    actors.push(r); publish(r, 0); return r;
  }
  function remove(value) { const r = resolve(value); if (r) actors.splice(actors.indexOf(r), 1); }
  function setFollow(value, follow = true) { const r = resolve(value); if (r) { if(r.follow&&!follow)r.anchor={x:r.actor.position.x,z:r.actor.position.z};r.follow = follow; r.goal = null; r.path = []; r.thinkAt = 0; r.cover = null; } }
  function restoreActorPosition(value, position) {
    const r = resolve(value);
    if (!r || r.actor.userData.disposed || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return false;
    r.x = position.x; r.z = position.z;
    r.actor.position.x = r.x; r.actor.position.z = r.z;
    if (r.entity) { r.entity.x = r.x; r.entity.z = r.z; }
    r.anchor = { x: r.x, z: r.z }; r.goal = null; r.path = [];
    r.pathVersion = -1; r.replanAt = 0; r.thinkAt = 0; r.speed = 0; r.stuckTime = 0;
    r.velocityX=r.velocityZ=r.moveDistance=r.turnVelocity=r.acceleration=0;
    r.cover = null; r.peek = null; r.maneuver = null;
    // Restoration changes location only. Do not publish a pose, tick time,
    // refill a magazine, or reset entity health/death and action timers.
    return true;
  }
  function setSquadOrder(order = 'follow') {
    if (!['hold','follow'].includes(order)) return;
    for (const r of actors) if (r.role === 'companion' && r.kind === 'soldier') {
      r.commandHold = order === 'hold'; r.anchor = {x:r.x,z:r.z};
      r.goal = null; r.path = []; r.cover = null; r.thinkAt = 0;
    }
  }
  function setSuppressionTarget(value,seconds=8){
    if(!value){suppressionOrder=null;for(const r of actors)if(r.role==='companion'){r.thinkAt=0;r.goal=null;r.path=[];r.cover=null;}return;}
    const target=point(value);if(!Number.isFinite(target.x)||!Number.isFinite(target.z))return;
    const y=Array.isArray(value)&&value.length>2?value[1]:(value.y??1.3);
    suppressionOrder={target:{...target,y:Number.isFinite(y)?y:1.3},until:now+clamp(Number.isFinite(seconds)?seconds:8,1,15)};
    for(const r of actors)if(r.role==='companion'){r.sectorAnchor=copy(r);r.thinkAt=0;r.cover=null;r.path=[];}
  }
  function getSuppressionOrder(){return suppressionOrder&&suppressionOrder.until>now?{target:{...suppressionOrder.target},remaining:suppressionOrder.until-now}:null;}
  const smokeBlocked = (a,b) => obscures(
    {x:a.x,y:a.stance==='crouch'?.94:(a.y??1.35),z:a.z},
    {x:b.x,y:b.stance==='crouch'?.94:(b.y??1.35),z:b.z});
  // Perception and bullets use actual eye height: a vehicle blocks a person
  // on the ground but does not become an infinitely tall wall around its gunner.
  // Walking, pathfinding and selecting cover deliberately remain two-dimensional.
  const sightPoint=p=>({x:p.x,z:p.z,y:Number.isFinite(p.y)?p.y:(p.actor?.position?.y||0)+(p.stance==='crouch'?.94:1.35)});
  const sightBlocked=(a,b)=>Boolean(traceObstacles(sightPoint(a),sightPoint(b),obstacles));
  function callout(r, text) { if (now < r.nextCallout||now<nextCalloutGlobal) return; r.nextCallout = now + 7;nextCalloutGlobal=now+4.5; onCallout({ id: r.id, actor: r.actor, text }); }
  const tethered = r => r.commandHold || (!r.follow && (r.role === 'story' || r.role === 'guard' || r.kind === 'civilian'));
  function allowed(r, p) { return navigator.valid(p) && (!tethered(r) || distance(r.anchor, p) <= Math.max(.3, r.tether - .12)); }
  function destination(r, wanted, behavior, stance = 'stand') {
    const changedBehavior=r.behavior!==behavior;
    r.behavior = behavior; r.stance = stance;
    if (!wanted) { r.goal = null; r.path = []; return; }
    let p = copy(wanted);
    if (tethered(r) && distance(p, r.anchor) > r.tether - .12) { const d = distance(p, r.anchor); p = { x: r.anchor.x + (p.x - r.anchor.x) / d * (r.tether - .12), z: r.anchor.z + (p.z - r.anchor.z) / d * (r.tether - .12) }; }
    p = navigator.nearest(p);
    if (!p || !allowed(r, p)) { r.goal = null; r.path = []; return; }
    // Peek and retreat can be less than 65 cm apart. Preserve moving-target
    // hysteresis, but never retain the previous state's endpoint after a turn.
    if (!r.goal || distance(p, r.goal) > .65 || (changedBehavior&&distance(p,r.goal)>.05)) { r.goal = p; r.path = []; r.replanAt = 0; }
  }
  function coverCandidates(r, threat) {
    const result = [];
    for (const box of obstacles) {
      const cx = clamp(r.x, box.minX, box.maxX), cz = clamp(r.z, box.minZ, box.maxZ);
      if (Math.hypot(cx - r.x, cz - r.z) > 11) continue;
      const pad = .72;
      const points = [
        { x: box.minX - pad, z: clamp(r.z, box.minZ, box.maxZ) }, { x: box.maxX + pad, z: clamp(r.z, box.minZ, box.maxZ) },
        { x: clamp(r.x, box.minX, box.maxX), z: box.minZ - pad }, { x: clamp(r.x, box.minX, box.maxX), z: box.maxZ + pad },
        ...[box.minX - pad, box.maxX + pad].flatMap(x => [box.minZ - pad, box.maxZ + pad].map(z => ({ x, z }))) ];
      for (const p of points) if (allowed(r, p) && distance(r, p) < 12 && !actors.some(a=>a!==r&&live(a)&&a.kind===r.kind&&a.cover&&distance(a.cover.position,p)<1.6) && lineBlocked(p, threat, obstacles)) result.push({ p, box, score: distance(r, p) + Math.abs(distance(p, threat) - 17) * .08 });
    }
    return result.sort((a, b) => a.score - b.score);
  }
  function findCover(r, threat) {
    let fallback=null;
    for (const candidate of coverCandidates(r, threat).slice(0, 10)) {
      if (!navigator.findPath(r, candidate.p, 1800).length) continue;
      const box = candidate.box, peekPoints = [box.minX - 1.05, box.maxX + 1.05].flatMap(x => [box.minZ - 1.05, box.maxZ + 1.05].map(z => ({ x, z })));
      const peek = peekPoints.filter(p => allowed(r, p) && !lineBlocked(p, threat, obstacles) && distance(p, candidate.p) < 7).sort((a, b) => distance(a, candidate.p) - distance(b, candidate.p)).find(p=>navigator.findPath(candidate.p,p,1800).length);
      const cover={position:candidate.p,peek:peek||null};
      if(peek)return cover;
      fallback ||= cover;
    }
    return fallback;
  }
  function firingPoint(r, target) {
    const candidates=[];
    for(const radius of [2,4,6,8,10])for(let i=0;i<16;i++){
      const p={x:r.x+Math.cos(i*Math.PI/8)*radius,z:r.z+Math.sin(i*Math.PI/8)*radius};
      if(allowed(r,p)&&distance(p,target)<42&&!lineBlocked(p,target,obstacles))candidates.push(p);
    }
    candidates.sort((a,b)=>distance(r,a)-distance(r,b));
    return candidates.slice(0,14).find(p=>navigator.findPath(r,p,1800).length)||null;
  }
  function beginPeek(r){
    destination(r,r.cover.peek,'peek','stand');
    r.actionUntil=now+Math.min(9,distance(r,r.cover.peek)/1.8+2.6);
  }
  function notifyThreat(event = {}) {
    sync(); const origin = point(event.source || event.start || event.position), impact = point(event.position || event.end || event.source);
    const start = event.start ? point(event.start) : null, end = event.end ? point(event.end) : null, radius = event.radius ?? (event.kind === 'explosion' ? 19 : 10), intensity = clamp(event.intensity ?? 1, .1, 2);
    for (const r of actors) {
      if (!live(r) || r.kind === 'wounded') continue;
      if(r.id===event.shooterId||r.actor===event.actor||r.actor===event.sourceActor)continue;
      if(event.kind!=='explosion'&&distance(r,origin)<.8)continue;
      let closest=impact,proximity = distance(r, impact);
      if (start && end) { const dx = end.x - start.x, dz = end.z - start.z, t = clamp(((r.x - start.x) * dx + (r.z - start.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);closest={x:start.x+t*dx,z:start.z+t*dz};proximity=distance(r,closest); }
      // A round stopped on the far side of cover cannot keep its sheltered occupant pinned.
      const near = proximity < (start && end ? Math.min(radius, 4.5) : radius) && (event.kind==='explosion'||!lineBlocked(closest,r,obstacles));
      // Near-miss radius describes the bullet's immediate danger, not audibility.
      const hearingRange=event.hearingRadius??(event.kind==='explosion'?65:42);
      const heard = distance(r, origin) < hearingRange*(lineBlocked(origin,r,obstacles)?.67:1);
      if (!near && !heard) continue;
      r.threat = copy(origin); r.alert = 1; r.heardUntil = now + 7;
      // Heard gunfire is a last-known location, never permission to fire through cover.
      if (r.kind === 'enemy' && event.faction!=='enemy' && !r.visible && now>=(r.heardLocationAt||0)) {
        const uncertainty=start?1.8:.6,angle=random()*Math.PI*2;
        r.lastKnown={x:origin.x+Math.cos(angle)*uncertainty,z:origin.z+Math.sin(angle)*uncertainty};r.heardLocationAt=now+1.2;r.searchGoal=null;
      }
      if (near && (event.faction !== 'ally' || r.kind === 'enemy' || event.kind === 'explosion')) {
        r.suppression = Math.min(1, r.suppression + intensity * .7); r.suppressedUntil = Math.max(r.suppressedUntil, now + .9 + intensity * .8);
        if(r.cover&&!lineBlocked(r.cover.position,origin,obstacles))r.cover=null;
        r.thinkAt = 0; destination(r, null, r.kind === 'civilian' ? 'frightened' : 'suppressed', 'crouch');
        callout(r, r.kind === 'civilian' ? '趴下……等一下！' : '卧倒，找掩护！');
      }
    }
  }
  function perceives(r, target, range = 46) {
    range=Math.min(range,target.player&&context.player?.flashlight?46:(context.visibilityRange??46));
    const d = distance(r, target); if (d > range || sightBlocked(r,target) || smokeBlocked(r,target)) return false;
    if (d < 7 || now < r.heardUntil || now - r.lastSeen < 3) return true;
    const forwardX = Math.sin(r.actor.rotation.y || 0), forwardZ = Math.cos(r.actor.rotation.y || 0);
    return ((target.x - r.x) * forwardX + (target.z - r.z) * forwardZ) / Math.max(.01, d) > -.12;
  }
  function guard(r) {
    if (!r.goal || distance(r, r.goal) < .18 || now >= r.actionUntil) {
      r.patrol++; const angle = r.index * 2.39 + r.patrol * 1.9, radius = Math.min(r.tether - .2, .95 + (r.index % 3) * .25);
      destination(r, { x: r.anchor.x + Math.cos(angle) * radius, z: r.anchor.z + Math.sin(angle) * radius }, 'watch', r.kind !== 'civilian' && r.patrol % 3 === 0 ? 'crouch' : 'stand');
      r.actionUntil = now + 4.0 + (r.index % 3) * .7;
    }
  }
  function coverReaction(r) {
    if (now < r.suppressedUntil) { destination(r, null, r.kind === 'civilian' ? 'frightened' : 'suppressed', 'crouch'); r.aimTarget = r.threat; return true; }
    // Residual stress must not cancel every step of an already committed peek.
    if(r.kind==='enemy'&&r.behavior==='peek'&&r.cover)return false;
    if (r.suppression > .18 && r.threat) {
      if (!r.cover) r.cover = findCover(r, r.threat);
      if (r.cover && distance(r, r.cover.position) > .30) { destination(r, r.cover.position, 'relocate', 'crouch'); r.aimTarget = r.threat; return true; }
      if (!r.cover && tethered(r)) {
        const d = distance(r.anchor, r.threat) || 1;
        destination(r, { x: r.anchor.x + (r.anchor.x - r.threat.x) / d * 1.2, z: r.anchor.z + (r.anchor.z - r.threat.z) / d * 1.2 }, 'shelter', 'crouch'); return true;
      }
    }
    return false;
  }
  function coordinatedManeuver(r,target){
    if(r.maneuver&&now<r.maneuverUntil){
      if(distance(r,r.maneuver)>.4){destination(r,r.maneuver,'flank','stand');return true;}
      r.maneuver=null;r.holdUntil=now+2.2;r.cover=null;
    }else r.maneuver=null;
    if(now<r.holdUntil){destination(r,null,'suppress','crouch');return true;}
    if(!target||r.tacticalRole==='support'||now<r.maneuverAt||distance(r,target)<13||distance(r,target)>40)return false;
    const side=r.tacticalRole==='flank-left'?-1:1,turn=Math.floor(now/6)%2;
    if(turn!==(side<0?0:1))return false;
    const covering=actors.some(a=>a!==r&&a.kind==='enemy'&&live(a)&&a.reserveActive&&a.visible&&distance(a,r)<28&&now>=a.reloadUntil&&a.suppression<.45&&a.behavior!=='flank');
    if(!covering)return false;
    const d=distance(r,target),fx=(target.x-r.x)/d,fz=(target.z-r.z)/d,choices=[];
    for(const lateral of[4,6.5,9])for(const advance of[1,3.5]){
      const p={x:r.x+fz*lateral*side+fx*advance,z:r.z-fx*lateral*side+fz*advance};
      if(!allowed(r,p)||distance(p,target)<11||lineBlocked(p,target,obstacles)||actors.some(a=>a!==r&&a.kind==='enemy'&&live(a)&&distance(a.maneuver||a.goal||a,p)<2.1))continue;
      const route=navigator.findPath(r,p,2400);if(!route.length)continue;
      let length=0,previous=r;for(const step of route){length+=distance(previous,step);previous=step;}if(length>17)continue;
      choices.push({p,score:length+Math.abs(distance(p,target)-18)*.12});
    }
    r.maneuverAt=now+9+random()*3;
    choices.sort((a,b)=>a.score-b.score);if(!choices.length)return false;
    r.maneuver=choices[0].p;r.maneuverUntil=now+7;r.cover=null;
    destination(r,r.maneuver,'flank','stand');callout(r,'沿侧面推进，前面的人压住路口！');return true;
  }
  function enemyThink(r, player) {
    const candidates=context.combatAllowed===false?[]:[
      ...(player.health!==0?[{player:true,...point(player),y:player.y||1.5,crouched:player.crouched}]:[]),
      ...actors.filter(a=>a.kind==='soldier'&&live(a)&&!a.actor.userData.carried)
    ].filter(a=>perceives(r,a,a.crouched?34:46));
    candidates.sort((a,b)=>distance(r,a)-distance(r,b));
    const previous=candidates.find(a=>r.target?.player?a.player:a===r.target);
    const target=previous&&distance(r,previous)<distance(r,candidates[0])+4?previous:candidates[0];
    if(!r.reserveActive){
      const closeContact=target&&distance(r,target)<27,canRespond=now>=(r.encounter.activationDelay??10)&&(target||now<r.heardUntil);
      if(context.combatAllowed===false||(!closeContact&&!canRespond)){
        r.visible=false;r.target=null;r.aimTarget=r.encounter.lookAt?point(r.encounter.lookAt):null;
        // A nearby reserve sentry checks its corner, then steps back. Distant
        // groups stay quiet; the player is never acquired through that cover.
        if(r.encounter.peripheral&&r.sentryCover&&context.combatAllowed!==false&&distance(r,player)<65){
          const exposed=(now+r.index*.9)%9>6.2;
          destination(r,exposed?r.sentryCover.peek:r.sentryCover.position,'reserve-watch',exposed?'stand':'crouch');
        }else destination(r,null,'reserve','crouch');
        return;
      }
      r.reserveActive=true;r.reserveActivatedAt=now;r.fireAt=Math.max(r.fireAt,now+1.1);
      if(!r.lastKnown&&r.encounter.rally){r.lastKnown=point(r.encounter.rally);r.heardUntil=now+12;}
    }
    r.visible=Boolean(target);
    if (target) {
      if(r.firstContactAt===null){r.firstContactAt=now;r.fireAt=Math.max(r.fireAt,now+(context.difficulty==='easy'?1.2:.8));if(r.encounter.opening){r.openingUntil=now+6.6;r.coverUntil=r.openingUntil+.5;}}
      r.lastKnown = copy(target); r.lastSeen = now; r.target = target; r.alert = 1; r.aimTarget = { ...point(target), y: target.player?target.y:(target.actor?.position?.y||0)+(target.stance==='crouch'?.94:1.3) };
      if(now-r.lastSharedAt>2.5){r.lastSharedAt=now;for(const ally of actors)if(ally!==r&&ally.kind==='enemy'&&live(ally)&&!ally.visible&&distance(ally,r)<26){ally.lastKnown=copy(target);ally.heardUntil=now+7;ally.thinkAt=Math.min(ally.thinkAt,now+.4);}}
    }
    else { r.target = null; r.aimTarget = r.lastKnown; }
    if (coverReaction(r)) return;
    if(target&&now<r.openingUntil){
      // The first contact has a readable sequence: face, fire a short burst,
      // then cross to an authored street position before seeking hard cover.
      const crossing=r.route[0],canCross=now-r.firstContactAt>3.3&&crossing&&allowed(r,crossing)&&!lineBlocked(crossing,target,obstacles);
      destination(r,canCross?crossing:null,canCross?'advance':'engage','stand');return;
    }
    if((target||now-r.lastSeen<4)&&coordinatedManeuver(r,target))return;
    if(r.sentryCover&&!r.lastKnown&&!r.cover)r.cover={position:copy(r.sentryCover.position),peek:copy(r.sentryCover.peek)};
    if(r.cover&&((r.lastKnown&&(now-r.lastSeen<7||now<r.heardUntil))||(r.sentryCover&&!r.lastKnown))){
      if(!r.cover.peek&&distance(r,r.cover.position)<.4&&now>=r.coverUntil){
        r.cover.peek=firingPoint(r,r.lastKnown);
        if(!r.cover.peek){r.cover=null;r.coverUntil=now+5;destination(r,r.lastKnown,'search','stand');return;}
      }
      if(r.behavior==='peek'&&now<r.actionUntil){destination(r,r.cover.peek,'peek','stand');return;}
      if(r.behavior==='peek'){r.coverUntil=now+1.5;destination(r,r.cover.position,'cover','crouch');return;}
      if(r.behavior==='cover'&&distance(r,r.cover.position)>.35){destination(r,r.cover.position,'cover','crouch');return;}
      if(distance(r,r.cover.position)<.4&&r.cover.peek){
        if(now>=r.coverUntil)beginPeek(r);
        else destination(r,null,'cover','crouch');
        return;
      }
    }
    if (r.visible) {
      if(distance(r,target)<11){
        const d=Math.max(.01,distance(r,target)),ax=(r.x-target.x)/d,az=(r.z-target.z)/d;
        const retreat=[0,.55,-.55].map(angle=>({x:r.x+(ax*Math.cos(angle)-az*Math.sin(angle))*4.5,z:r.z+(az*Math.cos(angle)+ax*Math.sin(angle))*4.5})).find(p=>allowed(r,p)&&!lineBlocked(p,target,obstacles)&&navigator.findPath(r,p,1800).length);
        if(retreat){r.cover=null;r.coverUntil=now+2;destination(r,retreat,'withdraw','stand');return;}
      }
      if (!r.cover && now >= r.coverUntil) { r.cover = findCover(r, target); r.coverUntil = now + 3; }
      if (r.cover) {
        if (r.behavior === 'peek' && now < r.actionUntil) { destination(r, r.cover.peek, 'peek', 'stand'); return; }
        if (r.behavior === 'peek') { r.coverUntil = now + 1.5; destination(r, r.cover.position, 'cover', 'crouch'); return; }
        if (distance(r, r.cover.position) > .35) { destination(r, r.cover.position, 'cover', 'crouch'); return; }
        if (r.cover.peek && now >= r.coverUntil) { beginPeek(r); return; }
        destination(r, null, 'cover', 'crouch'); return;
      }
      if (distance(r, target) > 23) { const d = distance(r, target); destination(r, { x: target.x + (r.x - target.x) / d * 18, z: target.z + (r.z - target.z) / d * 18 }, 'advance', 'stand'); }
      else destination(r, null, r.tacticalRole==='support'?'suppress':'engage', r.index % 2 ? 'crouch' : 'stand');
    } else if (r.lastKnown && (now - r.lastSeen < 7 || now < r.heardUntil)) {
      if (r.cover && r.cover.peek && now >= r.coverUntil) { beginPeek(r); r.coverUntil = now + 4.2; }
      else {
        if(distance(r,r.lastKnown)<1.5&&now>=r.searchAt){
          r.searchStep++;r.searchAt=now+1.8;const angle=r.searchStep*2.1+r.index;
          r.searchGoal=navigator.nearest({x:r.lastKnown.x+Math.cos(angle)*3,z:r.lastKnown.z+Math.sin(angle)*3});
        }
        destination(r,r.searchGoal||r.lastKnown,'search','stand');
      }
    } else {
      r.lastKnown = null; r.cover = null; r.alert = .25;r.searchGoal=null;
      if(r.sentryCover){r.cover={position:copy(r.sentryCover.position),peek:copy(r.sentryCover.peek)};destination(r,r.cover.position,'cover','crouch');return;}
      if (!r.goal || distance(r, r.goal) < .3 || now >= r.actionUntil) {
        const waypoint=r.route.length?r.route[r.patrol%r.route.length]:null;r.patrol++;const a=r.patrol*1.7+r.index;
        destination(r,waypoint||{x:r.anchor.x+Math.cos(a)*3.5,z:r.anchor.z+Math.sin(a)*3.5},'patrol');r.actionUntil=now+6;
      }
    }
  }
  function storyEscortDestination(r, player, formation) {
    // A clear patch beside the player may be inside a fenced yard or on the
    // far side of a shed. Valid footing alone does not make it a follow point.
    // Keep the usual close formation only when its approach is connected to
    // both people, including the same physical vehicle/building clearances.
    const nearby = navigator.nearest(formation, player, 2);
    if (nearby && navigator.findPath(r, nearby).length) return nearby;
    const route = navigator.findPath(r, player);
    if (!route.length) return null;
    // Fall back to a point on the actual walkable route, about two metres
    // short of the player. This preserves personal space around blind corners
    // without teleporting, skipping collision, or chasing an unreachable slot.
    let remaining = 1.8;
    for (let i = route.length - 1; i >= 0; i--) {
      const end = route[i], start = i ? route[i - 1] : r, length = distance(start, end);
      if (length > remaining) return { x: end.x + (start.x - end.x) * remaining / length,
        z: end.z + (start.z - end.z) * remaining / length };
      remaining -= length;
    }
    return null;
  }
  function alliedThink(r, player) {
    if(context.interactionActor===r.actor&&distance(r,player)<4){r.target=null;r.aimTarget={...point(player),y:player.y||1.6};destination(r,null,'interact',r.kind==='civilian'?'stand':'crouch');return;}
    if(r.role==='resident'&&r.shelter){
      r.target=null;
      const nearbyFight=!r.localThreatOnly||actors.some(a=>a.kind==='enemy'&&a.reserveActive&&live(a)&&a.alert>.6&&distance(a,r)<25);
      const immediateDanger=(context.combatAllowed&&nearbyFight)||r.suppression>.05||now<r.heardUntil;
      if(immediateDanger)r.shelterUntil=now+22;
      const danger=immediateDanger||now<(r.shelterUntil||0);
      if(danger&&now>r.residentWait){
        r.aimTarget=null;
        if(distance(r,r.shelter)>.65)destination(r,r.shelter,'evacuate','stand');
        else {destination(r,null,'shelter','crouch');if(distance(r,player)<9)callout(r,'街上有人！我们躲进院子，别朝这边开枪！');}
      }else guard(r);
      return;
    }
    const order=r.role==='companion'?getSuppressionOrder():null;
    const visibleEnemies = context.combatAllowed === false ? [] : actors.filter(e => e.kind === 'enemy' && live(e) && (!order||distance(e,order.target)<12) && distance(r, e) < Math.min(40,context.visibilityRange??40) && !sightBlocked(r,e) && !smokeBlocked(r,e));
    visibleEnemies.sort((a, b) => order?distance(a,order.target)-distance(b,order.target):distance(r, a)-distance(r, b));
    r.target = r.kind !== 'civilian' ? visibleEnemies[0] || null : null; r.visible = Boolean(r.target);
    if (r.target) { r.alert = 1; r.aimTarget = { x: r.target.x, y:(r.target.actor?.position?.y||0)+1.3, z: r.target.z }; }
    else r.aimTarget = now < r.heardUntil ? r.threat : null;
    if (coverReaction(r)) return;
    if(r.commandHold&&!order){destination(r,r.cover?.position,'hold',r.target?'crouch':'stand');return;}
    const medic=actors.find(a=>a.role==='companion'&&a.kind==='soldier'&&live(a));
    if(context.treatActor&&r===medic){
      const wounded=point(context.treatActor.position||context.treatActor),treatment={x:wounded.x+.9,z:wounded.z+.2};
      r.target=null;r.aimTarget={...wounded,y:.45};
      if(distance(r,treatment)>.55)destination(r,treatment,'assist','crouch');else destination(r,null,'treat','treat');
      return;
    }
    if(order){
      if(!r.target)r.aimTarget={...order.target};
      if(!r.cover)r.cover=findCover(r,order.target);
      // A sector order is not permission to shoot through the wall we chose.
      // When a real target exists, use the reachable visible edge of its cover.
      const cover=r.target&&r.cover?.peek?r.cover.peek:r.cover?.position;
      destination(r,cover&&distance(cover,r.sectorAnchor||r)<6?cover:null,'suppress-sector','crouch');return;
    }
    if (!r.follow && r.role !== 'companion') { guard(r); return; }
    const storyEscort = r.role === 'story' && r.follow;
    const yaw = player.yaw || 0;let side = r.index % 2 ? -1 : 1,separation = storyEscort ? 1.05 : r.kind === 'civilian' ? 1.3 : 2.0;
    const pointMan=!storyEscort&&r.kind!=='civilian'&&(/(?:cover|point|scout)$/.test(String(r.id))||(!String(r.id).startsWith('squad-')&&r.index%2===1));
    let longitudinal=storyEscort?1.7:pointMan?-5:3.0+Math.floor(r.index/2)*1.15;
    if(r.id==='squad-cover'){longitudinal=-5;side=-1;separation=2.1;}
    else if(r.id==='squad-lead'){longitudinal=2.8;side=1;separation=1.8;}
    else if(r.id==='squad-rear'){longitudinal=5.4;side=-1;separation=2.3;}
    const formation = { x: player.x + Math.sin(yaw) * longitudinal + Math.cos(yaw) * separation * side,
      z: player.z + Math.cos(yaw) * longitudinal - Math.sin(yaw) * separation * side };
    const covering = r.target && Math.floor(now / 3.4) % 2 === r.index % 2 && distance(r, player) < 13;
    if (covering) {
      if (!r.cover) r.cover = findCover(r, r.target);
      destination(r, r.cover?.position, 'overwatch', 'crouch');
    } else {
      const followPoint = storyEscort ? storyEscortDestination(r, player, formation) : formation;
      if (followPoint && distance(r, followPoint) > 1.0) {
        // Do not let ordinary moving-target hysteresis retain an old slot on
        // the opposite side of a thin barrier after the safe point changes.
        if (storyEscort && r.goal && !navigator.clear(player, r.goal)) { r.goal = null; r.path = []; }
        destination(r, followPoint, r.kind === 'civilian' ? 'follow' : 'bound', r.suppression > .1 ? 'crouch' : 'stand');
      } else destination(r, null, 'overwatch', r.kind === 'civilian' || !r.target ? 'stand' : 'crouch');
    }
  }
  function move(r, dt) {
    const before = copy(r); r.speed = 0;
    if (!r.goal || distance(r, r.goal) < .17 || now < r.suppressedUntil) return;
    if (r.pathVersion !== navigator.version || (!r.path.length && now >= r.replanAt)) {
      r.path = navigator.findPath(r, r.goal); r.pathVersion = navigator.version; r.replanAt = now + 1.0;
    }
    while (r.path.length && distance(r, r.path[0]) < .20) r.path.shift();
    const next = r.path[0]; if (!next) return;
    if (!navigator.clear(r, next)) { r.path = []; r.replanAt = now + .15; return; }
    const baseSpeed = r.kind === 'civilian' ? (r.behavior==='evacuate'?2.6:1.1) : r.behavior === 'patrol' || r.behavior === 'watch' ? .8 : r.behavior === 'bound'||r.behavior==='flank' ? 2.5 : 1.8;
    const d = distance(r, next), step = Math.min(d, baseSpeed * (r.stance === 'crouch' ? .63 : 1) * dt);
    const candidate = { x: r.x, z: r.z };
    movePlayer(candidate, (next.x - r.x) / d * step, (next.z - r.z) / d * step, obstacles,navigator.bound);
    if (allowed(r, candidate)) { r.x = candidate.x; r.z = candidate.z; }
    r.speed = distance(r, before) / Math.max(dt, .001);
    if (r.speed < .04) { r.stuckTime += dt; if (r.stuckTime > .8) { r.stuckCount++; r.path = []; r.replanAt = 0; r.stuckTime = 0; } } else r.stuckTime = 0;
    r.actor.position.x = r.x; r.actor.position.z = r.z;
    if (r.entity) { r.entity.x = r.x; r.entity.z = r.z; }
    if (!r.aimTarget && r.speed > .05) r.scanYaw = Math.atan2(r.x - before.x, r.z - before.z);
  }
  function personalSpace(r,dt){
    const before=copy(r);
    for(const other of actors){
      if(other===r||!live(other)||other.kind==='wounded'||other.actor.userData.carried)continue;
      const spacing=distance(r,other);if(spacing>=.80)continue;
      const angle=r.index<other.index?-.7:Math.PI-.7;
      const dx=spacing>.001?(r.x-other.x)/spacing:Math.cos(angle),dz=spacing>.001?(r.z-other.z)/spacing:Math.sin(angle);
      const correction=copy(r),push=Math.min((.80-spacing)*.55,dt*1.8);
      movePlayer(correction,dx*push,dz*push,obstacles,navigator.bound);
      if(allowed(r,correction)){r.x=correction.x;r.z=correction.z;}
    }
    const adjustment=distance(r,before);if(adjustment<=.00001)return;
    r.speed=Math.max(r.speed,adjustment/Math.max(dt,.001));r.actor.position.x=r.x;r.actor.position.z=r.z;
    if(r.entity){r.entity.x=r.x;r.entity.z=r.z;}
  }
  function publishAmmo(r){r.actor.userData.weaponAmmo={mag:r.mag,reserve:r.reserve,capacity:r.magSize,weaponId:r.weaponId};}
  function beginReload(r){
    if(r.reserve<=0||r.mag>=r.magSize||now<r.reloadUntil)return false;
    r.reloadStart=now;r.reloadUntil=now+2.5+random()*.5;r.reloadProgress=0;r.burstRemaining=0;r.thinkAt=0;
    const threat=r.lastKnown||r.threat||r.target;
    if(threat&&!r.cover)r.cover=findCover(r,threat);
    destination(r,r.cover?.position,'reload','crouch');callout(r,'换弹，帮我看住前面！');return true;
  }
  function fire(r) {
    if(r.kind==='civilian'||r.kind==='wounded'||context.combatAllowed===false||now<r.reloadUntil||now<r.hitReactUntil)return;
    if(r.mag<=0){beginReload(r);return;}
    if(now<r.suppressedUntil){r.burstRemaining=0;r.fireAt=Math.max(r.fireAt,now+.55);return;}
    if(!r.target){r.burstRemaining=0;return;}
    if (r.kind === 'enemy' && (!r.visible || !['engage', 'peek', 'advance','withdraw','flank','suppress'].includes(r.behavior))) return;
    const target = r.target.player ? context.player : r.target;
    if (!target || target.health === 0 || (target.actor && !live(target)) || distance(r, target) > 45) return;
    const aimYaw=Math.atan2(target.x-r.x,target.z-r.z),error=Math.atan2(Math.sin(aimYaw-r.actor.rotation.y),Math.cos(aimYaw-r.actor.rotation.y));
    if(Math.abs(error)>.65)return;
    if(r.burstRemaining===0){if(now<r.fireAt)return;r.burstRemaining=random()<.5?2:3;r.shotAt=now;}
    if(now<r.shotAt)return;
    if (sightBlocked(r,target) || smokeBlocked(r,target)) { r.shotsBlocked++;r.burstRemaining=0; r.fireAt = now + .4; return; }
    r.mag--;r.burstRemaining--;r.shotsFired++;publishAmmo(r);r.recoil=1;r.shotAt=now+.15+random()*.07;
    if(r.burstRemaining===0)r.fireAt=now+(r.kind==='enemy'?(context.difficulty==='easy'?3.5+random()*2:context.difficulty==='hard'?2.2+random()*1.2:2.6+random()*1.5):5.0+random()*2);
    const targetCrouched=r.target.player?context.player.crouched:target.stance==='crouch';
    const rangeFactor=clamp(1.12-distance(r,target)*.012,.58,1),aimFactor=.30+Math.min(3,r.aimTime)*.045;
    const accuracy=r.kind==='enemy'?clamp(aimFactor*rangeFactor*(r.speed>.2?.64:1)*(1-r.suppression*.58)*(targetCrouched?.66:1)*(context.difficulty==='easy'?.72:context.difficulty==='hard'?1.12:1),.08,.49):.22;
    onFire({ id: r.id, actor: r.actor, weaponId:r.weaponId,reserve:r.reserve,capacity:r.magSize,faction: r.kind === 'enemy' ? 'enemy' : 'ally', targetActor: target.actor || null,
      origin: { x: r.x, y: (r.actor?.position?.y||0)+(r.stance === 'crouch' ? .94 : 1.35), z: r.z }, aim: { x: target.x, y: r.target.player ? (context.player.y || 1.5) : (target.actor?.position?.y||0)+1.2, z: target.z },time:now,mag:r.mag,accuracy,tacticalRole:r.tacticalRole });
    if(r.mag===0)beginReload(r);
  }
  function publish(r, dt) {
    const data=r.actor.userData;data.behavior=r.behavior;data.stance=r.stance;data.speed=r.speed;data.aimTarget=r.aimTarget;data.reload=r.reloadProgress;publishAmmo(r);
    const look=r.aimTarget?Math.atan2(r.aimTarget.x-r.x,r.aimTarget.z-r.z):r.scanYaw;
    const travel=r.speed>.035?Math.atan2(r.velocityX,r.velocityZ):look;
    const faceTravel=r.speed>.035&&(!r.aimTarget||r.kind==='civilian'||r.speed>2.1&&['bound','flank','evacuate'].includes(r.behavior));
    const facing=faceTravel?travel:look,difference=Math.atan2(Math.sin(facing-r.actor.rotation.y),Math.cos(facing-r.actor.rotation.y));
    const maxTurn=r.kind==='civilian'?2.15:r.speed>2.1?2.7:3.1,targetRate=clamp(difference*5,-maxTurn,maxTurn);
    r.turnVelocity+=clamp(targetRate-r.turnVelocity,-dt*11,dt*11);
    let turn=r.turnVelocity*dt;if(turn*difference>0&&Math.abs(turn)>Math.abs(difference)){turn=difference;r.turnVelocity=dt>0?turn/dt:0;}
    r.actor.rotation.y+=turn;
    data.motion={velocity:{x:r.velocityX,z:r.velocityZ},distance:r.moveDistance,turnRate:r.turnVelocity,acceleration:r.acceleration,gait:r.stance==='crouch'?'crouch':r.speed>2.15?'run':r.speed>.035?'walk':'idle'};
    data.animate?.(r.speed,dt,{stance:r.stance,aimTarget:r.aimTarget,alert:r.alert,recoil:r.recoil,reload:r.reloadProgress,hit:data.hitImpulse||0,velocity:data.motion.velocity,moveDistance:r.moveDistance,turnRate:r.turnVelocity,acceleration:r.acceleration});
  }
  function update(dt, next = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    context = { ...context, ...next }; if (!context.player || context.paused) return;
    if(next.bounds)navigator.setBounds(next.bounds);
    sync(); const steps = Math.ceil(Math.min(dt, .5) / .05), step = Math.min(dt, .5) / steps;
    for (let n = 0; n < steps; n++) {
      now += step;
      if(suppressionOrder&&now>=suppressionOrder.until){suppressionOrder=null;for(const r of actors)if(r.role==='companion'){r.thinkAt=0;r.goal=null;r.path=[];r.cover=null;}}
      for (const r of actors) {
        if (!live(r) || r.kind === 'wounded' || r.actor.userData.carried) continue;
        if((r.actor.userData.hitImpulse||0)>.55&&now>=r.nextHitReact){r.hitReactUntil=now+.16;r.nextHitReact=now+.75;r.burstRemaining=0;}
        r.recoil = Math.max(0, r.recoil - step * 7); r.suppression = Math.max(0, r.suppression - step * .10);
        if(r.reloadUntil>0){
          r.reloadProgress=clamp((now-r.reloadStart)/(r.reloadUntil-r.reloadStart),0,1);
          if(now>=r.reloadUntil){const count=Math.min(r.magSize-r.mag,r.reserve);r.mag+=count;r.reserve-=count;r.reloadUntil=0;r.reloadProgress=0;if(count>0)r.reloads++;r.fireAt=now+.45;r.thinkAt=0;r.cover=null;publishAmmo(r);}
        }
        if (now >= r.scanAt && !r.aimTarget && r.speed < .05) { r.scanYaw += (r.patrol % 2 ? -1 : 1) * (.35 + random() * .55); r.scanAt = now + 1.6 + random(); }
        if (now >= r.thinkAt) { r.thinkAt = now + .28 + r.index % 3 * .035;if(now<r.reloadUntil){r.aimTarget=null;destination(r,r.cover?.position,'reload','crouch');}else if (r.kind === 'enemy') enemyThink(r, context.player); else alliedThink(r, context.player); }
        const beforeMove=copy(r),previousSpeed=r.speed;move(r, step);personalSpace(r,step);
        r.velocityX=(r.x-beforeMove.x)/step;r.velocityZ=(r.z-beforeMove.z)/step;r.moveDistance=distance(r,beforeMove);r.speed=r.moveDistance/step;r.acceleration=clamp((r.speed-previousSpeed)/step,-8,8);
        const tracking=r.target?(r.target.player?'player':r.target.id):null;
        if(tracking&&tracking===r.trackingTarget&&r.visible)r.aimTime=Math.min(4,r.aimTime+step);else r.aimTime=0;
        r.trackingTarget=tracking;fire(r);publish(r, step);
      }
    }
  }
  function inspect() { return actors.map(r => ({ id: r.id, kind: r.kind, role: r.role, x: r.x, z: r.z, anchor: copy(r.anchor), tether: r.tether, follow: r.follow,
    behavior: r.behavior, stance: r.stance, speed: r.speed,velocity:{x:r.velocityX,z:r.velocityZ},turnRate:r.turnVelocity,moveDistance:r.moveDistance, goal: copy(r.goal), lastKnown: copy(r.lastKnown), lastSeen: Number.isFinite(r.lastSeen) ? r.lastSeen : null,
    visible: r.visible, targetId:r.target?.player?'player':r.target?.id||null,firstContactAt:r.firstContactAt,openingUntil:r.openingUntil,suppression: r.suppression, cover: copy(r.cover?.position),peek:copy(r.cover?.peek), shotsFired: r.shotsFired, shotsBlocked: r.shotsBlocked,mag:r.mag,reserve:r.reserve,weaponId:r.weaponId,magSize:r.magSize,burstRemaining:r.burstRemaining,reload:r.reloadProgress,reloading:now<r.reloadUntil,reloads:r.reloads,reloadStart:r.reloadStart,reloadUntil:r.reloadUntil,stuckCount: r.stuckCount, pathRemaining: r.path.length, alive: live(r), startCorrected:Boolean(r.startCorrected),tacticalRole:r.tacticalRole,reserveActive:r.reserveActive,reserveActivatedAt:r.reserveActivatedAt,maneuver:copy(r.maneuver),aimTime:r.aimTime,suppressionOrder:r.role==='companion'?getSuppressionOrder():null, time: now })); }
  sync(); return { reset, setContext, add, remove, update, notifyThreat, setFollow, restoreActorPosition, setSquadOrder,setSuppressionTarget,getSuppressionOrder, inspect, navigator };
}
