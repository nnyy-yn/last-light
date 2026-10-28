import * as THREE from 'three';
import { createFire } from './fire.js';
import {BLACKHAWK_ROPE_SOCKETS} from './aircraft-door-geometry.js';
import {casualtyPose} from './casualty-motion.js';
import {placeActorOnSurface} from './actor-bounds.js';
import {createCinematicEffects} from './cinematic-effects.js';
import { createConvoyPath, createConvoyMotion } from './convoy-motion.js';

// Original, real-time staging of the campaign events. No video playback, wall
// clock timers, gameplay damage, or changes to the campaign's fixed outcomes.
const IDS = [
  ['clinic-evac', 'civilians-depart'], ['base-handover', 'squad-assemble'],
  ['mission-briefing', 'helicopter-board'], ['rooftop-insertion', 'blackburn-transfer'],
  ['targets-secured', 'convoy-depart'], ['crash61', 'rescue-redirect'],
  ['separated-patrol', 'patrol-reunites'], ['convoy-wrong-turn', 'convoy-return'],
  ['crash64-cockpit', 'rescuers-arrive'], ['snipers-insert', 'fixed-sacrifice'],
  ['aid-station', 'smith-dies'], ['night-perimeter', 'relief-approaches'],
  ['relief-convoy', 'casualties-board'], ['crew-recovery', 'last-vehicle-leaves'],
  ['foot-withdrawal', 'safety-arrival'], ['base-return', 'names-remembered'],
];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const point = (p, fallback = [0, 0, 0]) => Array.isArray(p) && p.length >= 2
  ? p.length === 2 ? [p[0], 0, p[1]] : p.slice(0, 3) : [...fallback];
const lerp3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const towards = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const key = (at, position, extra = {}) => ({ at, position, ...extra });

function convoyCameraPose(motion, time, count) {
  const back = Math.min(7, count - 1), rearCar = motion.at(time, back);
  const wide = count >= 9 && time < 4 && rearCar.distance >= 10;
  const v = wide ? rearCar : motion.at(time, Math.min(2, count - 1));
  const rear = motion.path.sample(v.distance - (wide ? 9 : 16));
  const ahead = motion.path.sample(v.distance + (wide ? 65 : 23));
  return { from: [rear.position[0] + rear.direction[2] * 3.4, rear.position[1] + (wide ? 7 : 5.2), rear.position[2] - rear.direction[0] * 3.4], to: [ahead.position[0], ahead.position[1] + 1.3, ahead.position[2]] };
}

function addPlayerAction(plan) {
  let action = null;
  if (plan.phase === 'opening') {
    if (plan.chapterId === 4) action = { id: 'fast-rope', kind: 'hold', start: 5.3, end: 12.4, seconds: 7.2, actor: 'player-ranger', label: '埃弗斯曼 · 控制索降', prompt: '按住 E 沿绳下降；松开 E 抱紧绳索' };
    if (plan.chapterId === 9) action = { id: 'cockpit-control', kind: 'stabilize', start: 5.8, end: 9.8, seconds: 4.2, label: '尝试稳定机身', prompt: '观察倾斜方向，用 A / D 压住操纵杆' };
    if (plan.chapterId === 11) action = { id: 'treat-smith', kind: 'hold', start: 3, end: 6.5, seconds: 4.5, actor: 'aid-assistant', label: '埃弗斯曼 · 协助军医', prompt: '按住 E 持续压住敷料；松开后停手等待' };
    if (plan.chapterId === 14) action = { id: 'carry-crew', kind: 'hold', start: .8, end: 10, seconds: 7, actor: 'recovery--1', label: '协同抬运', prompt: '按住 E 起身并抬运；松开后原地稳住担架' };
    if (plan.chapterId === 15) action = { id: 'foot-withdrawal', kind: 'walk', start: .6, end: 11, seconds: 10, actor: 'squad-2', label: '跟上撤离队伍', prompt: 'W 向前行进 · S 后退 · 移动视线观察队友', canReverse: true };
  } else if (plan.phase === 'event' && [4, 11, 14].includes(plan.chapterId)) {
    const carrying = plan.actors.find(a => a.keys.some(k => k.carry === 1));
    const treating = plan.actors.find(a => a.keys.some(k => k.stance === 'treat'));
    if (carrying || treating) action = { id: `participate-${plan.id}`, kind: 'hold', start: .3, end: plan.duration - .8, seconds: Math.max(3, plan.duration - 1.2), actor: (treating || carrying).id, label: treating ? '亲手协助救治' : '完成物资交接与抬运', prompt: treating ? '按住 E 持续救护；松开后停手等待' : '按住 E 完成动作；松开后稳住位置' };
  }
  if (action) plan.playerAction = action;
  return plan;
}

function resolveCinematicTrack(keys){
  if(!keys?.length)return [];
  const persistent = ['yaw', 'roll', 'pitch', 'fov', 'reload', 'dead', 'rotor', 'carry', 'unfold', 'stance', 'gesture', 'aimTarget', 'talk', 'alert','ropePhase','ropeGrip','landing','injured','injuryPhase','ropeTarget','treatmentTarget'];
  const inherited = {}, resolved = keys.map(k => {
    for (const field of persistent) if (Object.hasOwn(k, field)) inherited[field] = k[field];
    return { ...inherited, ...k, hit: k.hit || 0 };
  });
  return resolved;
}
export function sampleCinematicTrack(keys,time){return sampleResolvedTrack(resolveCinematicTrack(keys),time);}
function sampleResolvedTrack(resolved,time){
  if(!resolved.length)return null;
  let a = resolved[0], b = a;
  for (let i = 1; i < resolved.length; i++) {
    if (resolved[i].at > time) { b = resolved[i]; break; }
    a = resolved[i]; b = a;
  }
  const fraction = a === b ? 0 : clamp((time - a.at) / Math.max(.0001, b.at - a.at));
  const t = b.cut ? 0 : a.linear ? fraction : smooth(fraction);
  const result = { ...a, position: lerp3(a.position, b.position, t) };
  for (const field of ['yaw', 'roll', 'pitch', 'fov', 'reload', 'dead', 'rotor', 'carry', 'unfold','ropeGrip','landing','injured']) {
    if (Number.isFinite(a[field]) || Number.isFinite(b[field])) result[field] = mix(a[field] ?? (field === 'fov' ? 54 : field === 'rotor' ? 1 : 0), b[field] ?? a[field], t);
  }
  result.hit = (a.hit || 0) * Math.exp(-Math.max(0, time - a.at) * 9);
  if (a.lookAt && b.lookAt) result.lookAt = lerp3(a.lookAt, b.lookAt, t);
  if (a.lookOffset && b.lookOffset) result.lookOffset = lerp3(a.lookOffset, b.lookOffset, t);
  return result;
}

/** A serializable plan also allows the timing and geometry to be tested without WebGL. */
export function buildCinematicPlan({ chapter, layout = {}, phase = 'opening', event,sceneState,groundHeight=()=>0 } = {}) {
  if (!chapter || !Number.isInteger(chapter.id) || chapter.id < 1 || chapter.id > 16) throw new RangeError('A cinematic needs chapter 1–16.');
  if (phase === 'event') return buildActionPlan(chapter, layout, event);
  if(phase==='briefing')return buildBriefingPlan(chapter,layout);
  if (!['opening', 'closing'].includes(phase)) throw new RangeError('Unknown cinematic phase.');
  const id = chapter.id, closing = phase === 'closing', c = layout.cinematic || {};
  const anchor = chapter.id === 11 ? point(layout.taskPositions?.[1], point(chapter.tasks?.[1]?.pos))
    : chapter.id === 3 ? closing ? [27, 0, 0] : point(layout.taskPositions?.[0], [-35, 0, -9])
      : point(c.anchor, point(chapter.tasks?.[0]?.pos, point(chapter.spawn)));
  // The authored market canopy covers the old insertion point. This street
  // patch is verified against actual scene triangles, not only pole colliders.
  if(id===4&&!closing)anchor[2]+=8;
  const heading = Number.isFinite(c.heading) ? c.heading : layout.facing ?? chapter.facing ?? 0;
  const local = (x = 0, y = 0, z = 0) => [anchor[0] + x * Math.cos(heading) - z * Math.sin(heading), anchor[1] + y, anchor[2] - x * Math.sin(heading) - z * Math.cos(heading)];
  const aim = (p, height = 1.2) => [p[0], p[1] + height, p[2]];
  const crash = point(c.crashPoint, point(chapter.tasks?.find(t => t.kind === 'wreck')?.pos, local(0, 0, 20)));
  const cockpitSeat = point(c.cockpitSeat, [0, .95, .9]);
  const cockpitLook = [cockpitSeat[0], cockpitSeat[1] - .15, cockpitSeat[2] - 8];
  const relativeCrash = (x, y, z) => [crash[0] + x, crash[1] + y, crash[2] + z];
  const supplied = typeof event === 'object' ? event : chapter.cinematics?.[phase] || chapter.cinematic?.[phase] || {};
  const defaultId = `ch${String(id).padStart(2, '0')}-${IDS[id - 1][closing ? 1 : 0]}`;
  const plan = { id: typeof event === 'string' ? event : supplied.id || chapter[phase] || defaultId, chapterId: id, phase, mood: chapter.mood || 'day', duration: closing ? 9 : 11, anchor, crashPoint: crash, actors: [], props: [], aircraft: [], cameras: [], events: [], stages: [] };
  const actor = (name, kind, keys, extra = {}) => { plan.actors.push({ id: name, kind, keys, ...extra }); return name; };
  const prop = (name, kind, keys, extra = {}) => { plan.props.push({ id: name, kind, keys, ...extra }); return name; };
  const stage = (at, name) => plan.stages.push({ at, name });
  const cue = (at, type, data = {}) => plan.events.push({ at, type, ...data });
  const caption = (at, speaker, text, duration = 3.2) => cue(at, 'subtitle', { speaker, text, duration });
  const shot = (at, from, to, extra = {}) => plan.cameras.push(key(at, from, { lookAt: to, fov: 54, ...extra }));
  const walk = (name, kind, from, to, at = 0, until = 5, extra = {}) => actor(name, kind, [key(at, from, { linear: true, yaw: towards(from, to), stance: 'stand' }), key(until, to, { stance: 'stand' })], extra);
  const guard = (name, pos, target, at = 0) => actor(name, 'soldier', [key(at, pos, { stance: 'crouch', aimTarget: aim(target), yaw: towards(pos, target), alert: 1 })]);
  const medic = (name, patient, start = local(-3, 0, -3), at = 0, until = 3) => actor(name, id===1?'civilian':'soldier', [
    key(at, start, { linear: true, yaw: towards(start, patient) }), key(until, [patient[0] - .85, patient[1], patient[2]], { stance: 'treat', aimTarget: aim(patient, .4), yaw: Math.PI / 2 }),
  ]);
  const baseCamera = () => {
    if (id === 11) { shot(0, local(-3.2, 1.55, -3.2), local(0, .7, 1), { fov: 60 }); shot(plan.duration, local(-2.5, 1.35, -2.8), local(0, .7, 1), { fov: 60 }); }
    else if (id === 3) { shot(0, local(4, 2, -5), local(0, 1, 1), { fov: 60 }); shot(plan.duration, local(3.6, 1.8, -4.5), local(0, closing ? 7 : 1, closing ? 14 : 1), { fov: 60 }); }
    else { const safe = point(c.cameraSafe, local(2.8, 1.8, -4.8)); shot(0, distance(safe, anchor) < 3 ? local(2.8, 1.8, -4.8) : safe, aim(anchor)); shot(plan.duration, local(2.6, 1.65, -4.3), aim(anchor)); }
  };
  const vehicleRoute = (offset = 0) => {
    const road = [5, 12, 14, 16].includes(id) && layout.roads?.[0]?.points;
    const route = road ? road.map(p => point(p)) : c.vehicleRoute?.length > 1 ? c.vehicleRoute.map(p => point(p)) : [local(2, 0, -28), local(2, 0, -6), local(2, 0, 22)];
    return route.map(p => [p[0] + Math.cos(heading) * offset, p[1], p[2] - Math.sin(heading) * offset]);
  };
  const convoy = (formation = 'main', depart = false, options = {}) => {
    const types = formation === 'casualty' ? Array(3).fill('humvee')
      : formation === 'remaining-main' ? Array.from({ length: 9 }, (_, i) => i % 3 === 2 ? 'cargo-truck' : 'humvee')
        : Array.from({ length: 12 }, (_, i) => i % 4 === 3 ? 'cargo-truck' : 'humvee');
    // Film production notes describe 12 original vehicles. The Army monograph
    // specifies 9 HMMWVs + 3 trucks; relief is a visible subset, not its total.
    const returning = id === 8 && closing;
    // The choice/debrief cut separates the failed approach from a column that
    // has already reorganised. Drive back along the real road in reverse order,
    // rather than rotating cars on the spot or continuing toward the roadblock.
    const authoredRoute = options.route || vehicleRoute();
    const route = returning ? [...authoredRoute].reverse() : authoredRoute, path = createConvoyPath(route);
    const nearest = path.entries.reduce((best, entry) => distance(entry.position, anchor) < distance(best.position, anchor) ? entry : best);
    const startDistance = options.parked ? path.length : clamp(nearest.distance + 27, Math.min(20, path.length * .3), Math.max(20, path.length - 9));
    // The last car does not push the leading bumper into the chapter-eight
    // roadblock while the navigator looks for another route.
    const stopDistance = options.parked ? startDistance : returning ? path.length + 8 : path.length - (id === 8 ? 10 : 3);
    const config = { points: route, vehicles: types, duration: plan.duration + 35, startDistance, stopDistance, speed: depart ? 5.6 : 4.8, startDelay: depart ? .8 : .2,
      waitAt: id === 8 && !closing ? Math.min(startDistance + 12, path.length - 4) : null, waitSeconds: 2.6 };
    const motion = createConvoyMotion(config), groupId = `ch${id}-${phase}-${formation}`;
    plan.convoy = { groupId, formation, count: types.length, visibleSubset: formation === 'relief', config };
    for (const [i, vehicle] of motion.formation.entries()) {
      const begin = motion.at(0, i), end = motion.at(plan.duration, i);
      prop(`convoy-${i}`, 'vehicle', [key(0, begin.position, { yaw: begin.yaw }), key(plan.duration, end.position, { yaw: end.yaw })],
        { vehicleType: vehicle.type, variant: i % 3 === 1 ? 'sand' : 'olive', convoy: { groupId, index: i } });
    }
    // Limit articulated riders to three nearby vehicles, independently cleaned
    // up rather than parented into another world-owned object's skeleton tree.
    for (const [index, role] of [[0, 'driver'], [0, 'gunner'], [1, 'driver'], [2, 'driver'], [2, 'passenger']]) {
      actor(`convoy-${index}-${role}`, 'soldier', [key(0, motion.at(0, index).position)], { crew: { vehicle: `convoy-${index}`, role } });
    }
    if (!options.preserveCamera) {
      const frame = at => convoyCameraPose(motion, at, types.length);
      for (const at of [0, plan.duration]) { const view = frame(at); shot(at, view.from, view.to, { fov: 68, convoyView: true }); }
    }
    stage(0, depart ? 'convoy-departing' : 'convoy-approaching'); cue(1, 'vehicle-movement', { count: types.length, composition: types, visibleSubset: formation === 'relief', direction: depart ? 'outbound' : 'inbound' });
  };
  const aircraft = (name, keys, extra = {}) => plan.aircraft.push({ id: name, keys, ...extra });
  const lineOfSoldiers = (count, fromZ, toZ, speed = 5, stance = 'stand') => {
    for (let i = 0; i < count; i++) {
      const x = (i % 2 ? 1 : -1) * (1 + i * .18), from = local(x, 0, fromZ - i * 1.8), to = local(x, 0, toZ - i * 1.8);
      actor(`squad-${i}`, 'soldier', [key(0, from, { yaw: towards(from, to), linear: true, stance }), key(speed, to, { stance: 'crouch', alert: .9 })]);
    }
  };

  if (!closing) {
    switch (id) {
      case 1:
        walk('resident', 'civilian', local(-3, 0, -4), local(-.8, 0, 1), 0, 5);
        actor('neighbor', 'civilian', [key(0, local(1, 0, 1.8), { stance: 'crouch' }), key(3.5, local(1, 0, 1.8), { stance: 'stand', talk: .7 }), key(8, local(2.4, 0, 4), { linear: true })]);
        medic('aid-volunteer', local(-.4, 0, 1.8), local(-2, 0, 4), 0, 3);
        prop('clinic-supplies', 'supplies', [key(0, local(-1.5, 0, 2.5))]); stage(0, 'clinic-gathering'); stage(4, 'neighbor-helped');
        caption(.6, '阿米娜（原创）', '把孩子带到墙里面。水不要洒了。'); cue(5, 'civilian-aid'); break;
      case 2:
        prop('equipment', 'supplies', [key(0, anchor)]);
        actor('equipment-check', 'soldier', [key(0, local(-.8, 0, 0), { reload: .02, stance: 'stand' }), key(3.3, local(-.8, 0, 0), { reload: .96 }), key(4.2, local(-.8, 0, 0), { reload: 0, talk: .5 })]);
        walk('passing-soldier', 'soldier', local(3, 0, -5), local(1.5, 0, 1), 0, 4);
        stage(0, 'equipment-check'); stage(4, 'buddy-handover'); cue(3.3, 'equipment-checked'); caption(.6, '队员（原创对白）', '检查彼此的背带。上飞机后就听不清了。'); break;
      case 3:
        prop('briefing-radio', 'radio', [key(0, anchor)]); prop('map-board', 'map', [key(0, local(0, 0, .7))]);
        actor('briefing-lead', 'soldier', [key(0, local(0, 0, 1.5), { yaw: heading, talk: 1, carry: 1, aimTarget: aim(anchor) }), key(6, local(0, 0, 1.5), { stance: 'kneel', carry: 1, talk: .5 })]);
        for (let i = 0; i < 3; i++) { walk(`briefing-listener-${i}`, 'soldier', local(i * 1.3 - 1.3, 0, -5), local(i * 1.3 - 1.3, 0, -1.7), 0, 2 + i * .4); plan.actors.at(-1).keys.forEach(k => k.carry = 1); }
        stage(0, 'briefing-assemble'); stage(4, 'route-discussed'); caption(.5, '指挥官（原创对白）', '目标完成后与车队会合。记住转角，也记住身边的人。'); cue(4, 'briefing-route'); break;
      case 4: {
        plan.duration=20;
        const hover=local(0,12,2),approach=local(-5,18,-35),hoverYaw=towards(approach,hover),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),hoverYaw);
        const door=side=>new THREE.Vector3(...BLACKHAWK_ROPE_SOCKETS.find(s=>s.side===side).position).applyQuaternion(rotation).add(new THREE.Vector3(...hover));
        const playerTop=door(-1),rightTop=door(1),forward=new THREE.Vector3(0,0,1).applyQuaternion(rotation),side=new THREE.Vector3(1,0,0).applyQuaternion(rotation);
        const playerRope={x:playerTop.x,z:playerTop.z},rightRope={x:rightTop.x,z:rightTop.z};
        const atRope=(top,y)=>[top.x-forward.x*.30,y,top.z-forward.z*.30],playerAt=y=>atRope(playerTop,y),rightAt=y=>atRope(rightTop,y);
        const playerX=playerAt(0)[0],rightX=rightAt(0)[0],ropeZ=rightAt(0)[2],patient=[rightX+side.x*.46+forward.x*.62,0,ropeZ+side.z*.46+forward.z*.62],startHeight=playerTop.y-1.80;
        plan.insertion={aircraft:'insertion-aircraft',hover:[...hover],yaw:hoverYaw,doorAnchors:BLACKHAWK_ROPE_SOCKETS.map(s=>[...s.position]),ropeTops:[playerTop.toArray(),rightTop.toArray()]};
        aircraft('insertion-aircraft',[key(0,approach,{linear:true,yaw:towards(approach,hover),rotor:1}),key(4.8,hover,{rotor:1}),key(16,hover,{rotor:1}),key(20,local(8,20,38),{rotor:1})]);
        for(const [name,top,anchor]of[['player-rope',playerTop,plan.insertion.doorAnchors[0]],['fast-rope',rightTop,plan.insertion.doorAnchors[1]]]){const floor=groundHeight(top.x,top.z)||0;prop(name,'rope',[key(4.8,[top.x,(top.y+floor)/2,top.z])],{visible:[4.8,16.1],length:top.y-floor,aircraftAnchor:anchor,aircraft:'insertion-aircraft'});}
        actor('player-ranger','soldier',[
          key(5.3,playerAt(startHeight),{linear:true,stance:'stand',gesture:'fast-rope',ropePhase:'brake',ropeGrip:1,ropeTarget:playerRope}),
          key(5.75,playerAt(startHeight-.5),{linear:true,ropePhase:'descend'}),key(11.8,playerAt(.55),{linear:true}),
          key(12.4,playerAt(0),{stance:'stand',ropePhase:'land',landing:.5,ropeGrip:.75}),
          key(12.85,playerAt(0),{ropePhase:'release',landing:1,ropeGrip:.2}),key(13.25,playerAt(0),{gesture:null,ropeGrip:0,landing:1}),
          key(15.6,[playerX-2.1,0,ropeZ+3],{linear:true,stance:'stand',ropePhase:null}),key(20,[playerX-2.1,0,ropeZ+3],{stance:'crouch',alert:1})
        ],{visible:[5.3,21],ropeActor:true});
        actor('lead-ranger','soldier',[key(4.9,rightAt(startHeight),{linear:true,gesture:'fast-rope',ropePhase:'descend',ropeGrip:1,ropeTarget:rightRope}),key(7.9,rightAt(0),{ropePhase:'land',landing:.5,ropeGrip:.6}),key(8.35,rightAt(0),{ropePhase:'release',ropeGrip:0,landing:1,gesture:null}),key(9.6,[rightX+2.0,0,ropeZ+2.8],{linear:true,ropePhase:null,stance:'crouch',alert:1})],{visible:[4.9,21],ropeActor:true});
        // One living character remains continuous through loss of grip and the
        // fall; injury is a separate pose, never a dead actor or a root flip.
        actor('blackburn','soldier',[key(6.8,rightAt(startHeight),{linear:true,gesture:'fast-rope',ropePhase:'descend',ropeGrip:1,ropeTarget:rightRope}),key(8.35,rightAt(5.4),{linear:true,ropePhase:'brake',ropeGrip:.85}),key(8.52,[rightX+.16,4.95,ropeZ+.12],{linear:true,gesture:null,ropeGrip:0,ropePhase:'release',injured:.20,injuryPhase:'fall',roll:.12}),key(9.12,patient,{stance:'low',injured:1,injuryPhase:'ground',ropePhase:null,roll:0}),key(20,patient,{stance:'low',injured:1,injuryPhase:'ground',alert:.2})],{visible:[6.8,21],ropeActor:true});
        const bedside=new THREE.Vector3(.70,0,.20).applyQuaternion(rotation).add(new THREE.Vector3(...patient)),shoulder=new THREE.Vector3(.19,.72,.05).applyQuaternion(rotation).add(new THREE.Vector3(...patient));shoulder.y+=groundHeight(patient[0],patient[2])||0;
        medic('responding-medic',patient,local(-3,0,-4),9.0,11.5);Object.assign(plan.actors.at(-1).keys.at(-1),{position:bedside.toArray(),yaw:towards(bedside.toArray(),shoulder.toArray()),aimTarget:shoulder.toArray(),treatmentTarget:shoulder.toArray()});
        actor('casualty-assistant','soldier',[key(9.1,local(4,0,-3),{linear:true,carry:1}),key(12.4,[patient[0]+1.35,0,patient[2]+.4],{stance:'kneel',aimTarget:aim(patient,.3),carry:1}),key(20,[patient[0]+1.35,0,patient[2]+.4],{stance:'kneel',carry:1})],{visible:[9.1,21]});
        prop('rescue-stretcher','stretcher',[key(10.2,[patient[0]+1.1,.16,patient[2]+1.6],{unfold:0}),key(13,[patient[0]+1.1,.16,patient[2]+1.6],{unfold:1})],{visible:[10.2,21]});
        for(const a of plan.actors.filter(a=>a.ropeActor))for(const k of a.keys)k.yaw=hoverYaw;
        guard('landing-security',local(-3,0,2),local(-4,0,14));
        shot(0,local(4.8,4,-9),aim(approach,2),{fov:64});shot(4.8,local(5.5,3,-7),aim(hover,1),{fov:64});
        shot(8.15,[rightX+4.5,4.2,ropeZ-4.5],[rightX,5,ropeZ],{cut:true,fov:60});shot(9.2,[patient[0]+3.7,1.3,patient[2]-3.4],aim(patient,.5),{fov:60});shot(20,[patient[0]+3.4,1.35,patient[2]-3],aim(patient,.6),{fov:60});
        stage(0,'approach-and-rope-deploy');stage(5.3,'controlled-rope-descent');stage(8.35,'blackburn-loses-grip');stage(9.12,'blackburn-injured-not-dead');stage(11.5,'medic-check-and-stretcher');
        cue(9.12,'landing-accident',{position:[patient[0],.12,patient[2]],strength:.15,injured:true,dead:false});cue(11.5,'medical-treatment',{target:'blackburn',alive:true});
        caption(.7,'机组（原创对白）','抓稳，按口令下降。落地后让开绳下。');caption(8.5,'队员（原创对白）','手脱开了！下面的人让开！',2.5);caption(9.7,'军医（原创对白）','布莱克本，看着我。能听见吗？我们先稳住你。',4);break;
      }
      case 5:
        plan.duration = 18; convoy('main');
        walk('escort', 'soldier', local(-3.2, 0, -6), local(-3.2, 0, 1), 0, 5);
        walk('detainee', 'civilian', local(-4.2, 0, -7.3), local(-4.2, 0, 2.6), 0, 6);
        guard('security', local(-2, 0, 2), local(-3, 0, 15)); stage(0, 'escort-to-vehicle'); stage(6, 'vehicle-handover'); cue(6, 'personnel-boarded'); caption(.8, '里德（原创）', '清点人数。先把伤员交给前车。'); break;
      case 6:
      case 9: {
        const cockpit = id === 9; plan.duration = cockpit ? 20 : 19;
        const name = cockpit ? 'super-64' : 'super-61', hitAt = cockpit ? 4.6 : 5.2, impactAt = cockpit ? 13.2 : 12.8;
        const start = relativeCrash(-30, cockpit ? 27 : 33, -52), hit = relativeCrash(-5, 24, -22), ground = relativeCrash(0, .10, 0);
        aircraft(name, [key(0, start, { linear: true, yaw: towards(start, hit), pitch: .025, rotor: 1 }), key(hitAt, hit, { yaw: .2, roll: 0, rotor: 1 }), key(hitAt + 2, relativeCrash(5, 19, -15), { yaw: 2.9, roll: .36, pitch: -.1, rotor: .83 }), key(impactAt - 2, relativeCrash(-2, 7, -5), { yaw: 7.7, roll: -.40, pitch: .13, rotor: .60 }), key(impactAt, ground, { yaw: 10.2, roll: -.23, pitch: .045, rotor: .10 })], { visible: [0, impactAt], crashedAt: impactAt });
        plan.aircraft[0].keys.forEach(k=>k.linear=true);
        aircraft(`${name}-wreck`, [key(impactAt, ground, { yaw: 10.2, roll: -.23, pitch: .045, rotor: 0 })], { crashed: true, visible: [impactAt, plan.duration + 1] });
        const launchAt=hitAt-.72,roof=selectCinematicRoof(sceneState,relativeCrash(23,5.5,-29)),shooterPosition=roof?.position||relativeCrash(23,5.5,-29),launchPoint=[shooterPosition[0],shooterPosition[1]+1.42,shooterPosition[2]],hitLocal=[.36,3.85,-9.79];
        const hitPose=sampleCinematicTrack(plan.aircraft[0].keys,hitAt),hitTransform=new THREE.Matrix4().compose(new THREE.Vector3(...hitPose.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(hitPose.pitch||0,hitPose.yaw||0,hitPose.roll||0,'YXZ')),new THREE.Vector3(1,1,1));
        const contact=new THREE.Vector3(...hitLocal).applyMatrix4(hitTransform).toArray();const launchDirection=new THREE.Vector3(...contact).sub(new THREE.Vector3(...launchPoint)).normalize();for(let axis=0;axis<3;axis++)launchPoint[axis]+=launchDirection.getComponent(axis)*.55;
        if(!sceneState)prop('rpg-roof-edge','roof-edge',[key(0,[shooterPosition[0],shooterPosition[1]-.15,shooterPosition[2]])]);
        if(sceneState&&!roof)throw new Error('Crash cinematic needs an actual clear building roof.');plan.rooftop=roof?{id:roof.id,position:[...roof.position],bounds:roof.bounds}:null;
        actor('rpg-shooter','enemy',[key(0,shooterPosition,{yaw:towards(shooterPosition,contact),stance:'stand',aimTarget:contact,alert:1}),key(launchAt+.12,shooterPosition,{stance:'crouch',hit:.25})],{visible:[0,hitAt+1.0],launcher:{launchAt,launchPoint,target:contact}});
        prop('rpg-tracer','projectile',[key(launchAt,launchPoint,{linear:true}),key(hitAt,contact)],{visible:[launchAt,hitAt],trajectory:{from:launchPoint,to:contact}});
        cue(launchAt,'rpg-launched',{position:launchPoint,to:contact,strength:.32});
        cue(launchAt+.05,'projectile-flight',{from:launchPoint,to:contact,target:name});
        stage(.7,'rooftop-launcher');stage(launchAt,'rpg-in-flight');

        cue(hitAt, 'aircraft-hit', { target: name, localPosition: [.36, 3.85, -9.79], strength: .7 });
        cue(hitAt + .1, 'tail-smoke', { target: name });
        cue(impactAt, 'aircraft-impact', { target: name, position: ground, strength: 1 });
        cue(impactAt + .08, 'wreck-fire', { position: relativeCrash(-.7, .4, -1.3), scale: cockpit ? 1.2 : 1.8 });
        stage(0, 'aircraft-approach'); stage(hitAt, 'tail-hit'); stage(hitAt + .4, 'uncontrolled-descent'); stage(impactAt, 'ground-impact'); stage(impactAt + 2, cockpit ? 'trapped-in-cockpit' : 'rescue-redirect');
        shot(0,relativeCrash(18,7,-7),aim(start,2),{fov:64});
        shot(.7,[shooterPosition[0]-3.2,shooterPosition[1]+1.8,shooterPosition[2]+2.8],launchPoint,{cut:true,fov:50});
        shot(launchAt-.12,[shooterPosition[0]-2.6,shooterPosition[1]+1.7,shooterPosition[2]+2.1],launchPoint,{fov:50});
        const flightMid=new THREE.Vector3(...launchPoint).lerp(new THREE.Vector3(...contact),.5),flightDistance=new THREE.Vector3(...launchPoint).distanceTo(new THREE.Vector3(...contact)),flightSide=new THREE.Vector3(-launchDirection.z,.22,launchDirection.x).normalize();
        shot(launchAt,flightMid.clone().addScaledVector(flightSide,Math.max(11,flightDistance*.72)).toArray(),flightMid.toArray(),{cut:true,fov:63});
        shot(hitAt-.12,[contact[0]+4.0,contact[1]+1.4,contact[2]-3.5],contact,{cut:true,fov:51});
        shot(hitAt+.38,[contact[0]+4.5,contact[1]+1.6,contact[2]-2.8],contact,{fov:53});
        if (cockpit) {
          shot(5.8, [0, 1.77, 2.7], [0, 0, 0], { cut: true, follow: name, lookOffset: [0, 1.72, 7], fov: 65 });
          shot(impactAt - .01, [0, 1.77, 2.7], [0, 0, 0], { follow: name, lookOffset: [0, 1.72, 7], fov: 65 });
          // The landing cut hands off to the map's actual seat and dashboard.
          // Do not leave a second full airframe intersecting that authored cabin.
          plan.aircraft.at(-1).visible = [impactAt, impactAt + .02];
          shot(impactAt, cockpitSeat, cockpitLook, { cut: true, roll: -.12, fov: 65 });
          shot(plan.duration, cockpitSeat, cockpitLook, { roll: -.12, fov: 65 });
        } else {
          const impactView=relativeCrash(16.4544826719,4.8,9.5);
          shot(6.1,impactView,relativeCrash(-2,8,-5),{cut:true,fov:64});shot(impactAt,impactView,relativeCrash(0,2.6,0),{fov:64});shot(plan.duration,impactView,relativeCrash(0,2.6,0),{fov:64});
          for (let i = 0; i < 2; i++) actor(`witness-${i}`, 'soldier', [key(0, relativeCrash(11 + i * 1.6, 0, 7), { stance: 'stand', yaw: -1.7 }), key(impactAt, relativeCrash(11 + i * 1.6, 0, 7), { stance: 'crouch', alert: 1 }), key(plan.duration, relativeCrash(8 + i * 1.6, 0, 4), { stance: 'crouch', linear: true })]);
        }
        caption(1, '空中频道（原创对白）', cockpit ? '超级六四，继续掩护地面。' : '超级六一，保持上空观察。');
        caption(hitAt + .2, '机组（原创对白）', '尾部中弹！控制不住方向！', 3.6);
        caption(impactAt + 1, cockpit ? '杜兰特（原创对白）' : '指挥频道（原创对白）', cockpit ? '听得到吗……有人听得到吗？' : '超级六一坠落。地面单位立即转向救援。', 4); break;
      }
      case 7:
        lineOfSoldiers(2, -7, 1, 4); actor('searching-ranger', 'soldier', [key(0, local(2, 0, 4), { stance: 'crouch', yaw: heading + Math.PI }), key(4, local(2, 0, 4), { stance: 'stand', talk: .8 }), key(8, local(1, 0, 1), { linear: true })]);
        stage(0, 'separated-patrol'); stage(4, 'voice-contact'); cue(4, 'patrol-contact'); caption(1, '米勒（原创）', '别离开墙边。先听清他们的方向。'); break;
      case 8:
        plan.duration = 18; convoy('remaining-main'); actor('route-scout', 'soldier', [key(0, local(-4, 0, -5), { stance: 'stand', talk: .7 }), key(4, local(-4, 0, -5), { stance: 'crouch', alert: 1 }), key(9, local(-5, 0, -7), { linear: true })]);
        stage(5, 'blocked-turn'); cue(5, 'convoy-wrong-turn'); caption(1, '车队频道（原创对白）', '这条路走不通。前车减速，后车保持距离。'); break;
      case 10:
        plan.duration = 14;
        aircraft('sniper-lift', [key(0, local(0, 10, -18), { yaw: heading + Math.PI, rotor: 1 }), key(5, local(0, 1.8, 4), { rotor: 1 }), key(8, local(0, 1.8, 4), { rotor: 1 }), key(14, local(-9, 19, 30), { rotor: 1 })]);
        walk('gordon', 'soldier', local(-1.2, 0, 4), local(-2.6, 0, 10), 6, 10, { visible: [6, 15] });
        walk('shughart', 'soldier', local(1.2, 0, 4), local(1.5, 0, 8), 6.8, 11, { visible: [6.8, 15] });
        cue(6, 'snipers-deployed'); stage(0, 'rescue-insertion'); stage(6, 'two-rescuers-advance'); caption(1, '空中频道（原创对白）', '两名志愿救援人员准备落地。保持最后一次联络。'); break;
      case 11:
        plan.duration = 13; actor('smith', 'wounded', [key(0, local(0, 0, 1))]); medic('medic', local(0, 0, 1), local(-3, 0, -2), 0, 3);
        actor('aid-assistant', 'soldier', [key(0, local(2, 0, -2), { stance: 'stand', carry: 1 }), key(3, local(1.2, 0, 1), { stance: 'treat', yaw: -Math.PI / 2, aimTarget: local(0, .4, 1) })]);
        prop('dressings', 'supplies', [key(0, local(-1.4, 0, -1))]); stage(0, 'aid-station-arrival'); stage(3, 'treatment'); cue(3, 'medical-treatment'); caption(.8, '军医（原创对白）', '把光留在这里。看着我，继续跟我说话。'); break;
      case 12:
        prop('perimeter-light', 'radio', [key(0, local(-2, 0, -1))]); lineOfSoldiers(2, -5, 2, 4);
        guard('perimeter-watch', local(2.5, 0, 4), local(4, 0, 18));
        actor('relieving-guard', 'soldier', [key(0, local(0, 0, -6), { linear: true }), key(5, local(1, 0, 4), { stance: 'kneel', alert: 1 })]);
        stage(0, 'night-watch-relief'); stage(5, 'sector-covered'); cue(5, 'watch-handover'); caption(1, '夜间频道（原创对白）', '保持低声。每个人轮流看住一个方向。'); break;
      case 13:
        plan.duration = 18; convoy('relief'); walk('route-guide', 'soldier', local(-1, 0, -2), local(-3, 0, 4), 1, 5);
        actor('waiting-wounded', 'wounded', [key(0, local(-4, 0, 3))]); medic('receiving-medic', local(-4, 0, 3), local(-6, 0, -3), 4, 8);
        stage(7, 'rescue-column-arrives'); cue(7, 'relief-arrival', { vehicles: 12, visibleSubset: true }); caption(1, '救援频道（原创对白）', '灯光保持向前。接到伤员再走，别落下后车。'); break;
      case 14:
        plan.duration = 12; prop('covered-stretcher', 'covered-stretcher', [key(0, local(0, 0, 2)), key(3, local(0, .55, 2)), key(10, local(0, .55, 8), { linear: true })]);
        for (const side of [-1, 1]) actor(`recovery-${side}`, 'soldier', [key(0, local(side * .76, 0, 2), { stance: 'kneel', carry: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 }), key(3, local(side * .76, 0, 2), { stance: 'stand', carry: 1 }), key(10, local(side * .76, 0, 8), { linear: true, stance: 'stand', carry: 1 })]);
        stage(0, 'crew-identification'); stage(3, 'crew-recovery'); cue(3, 'stretcher-lifted'); caption(1, '里德（原创）', '认清名字。慢一点，把他一起带回去。'); break;
      case 15:
        plan.duration = 15; convoy('relief', true, { preserveCamera: true }); lineOfSoldiers(4, -8, 19, 11);
        // Two staggered files stay on the western shoulder even when the
        // controlled soldier stops or reverses while the vehicles keep moving.
        plan.actors.filter(a => a.id.startsWith('squad-')).forEach((a, i) => {
          const offset = (i % 2 ? -3 : -4.2) - (i % 2 ? 1 : -1) * (1 + i * .18);
          for (const k of a.keys) { k.position[0] += Math.cos(heading) * offset; k.position[2] -= Math.sin(heading) * offset; }
        });
        stage(0, 'foot-withdrawal'); stage(7, 'keep-contact-with-column'); cue(1.8, 'squad-running', { count: 4 });
        caption(.6, '队员（原创对白）', '车队已经动了。跟着前面的人，不要停在路口。');
        shot(0, local(-5, 1.3, -1), local(0, 1.1, -7)); shot(7, local(-4.5, 1.5, 4), local(0, 1.2, 8)); shot(15, local(-4, 1.6, 11), local(0, 1.2, 20)); break;
      case 16:
        plan.duration = 14; convoy('relief');
        actor('returning-soldier', 'soldier', [key(0, local(-4.4, 0, 1), { stance: 'kneel', alert: .1 }), key(5, local(-4.4, 0, 1), { stance: 'stand', alert: .1 }), key(10, local(-4.4, 0, 4), { linear: true })]);
        walk('returning-civilian', 'civilian', local(-3, 0, -4), local(-2, 0, 2), 0, 6);
        prop('empty-bed', 'memorial', [key(0, local(1, 0, 4))]); stage(0, 'base-return'); stage(6, 'quiet-count'); cue(6, 'return-headcount'); caption(1, '埃弗斯曼（原创对白）', '回来的人正在点名。没有回答的名字，也要记下来。'); break;
    }
  } else {
    // Closing scenes resolve physical actions, while choices and resources remain
    // exclusively in the campaign simulation owned by the calling application.
    switch (id) {
      case 1:
        walk('departing-resident', 'civilian', local(-1, 0, 0), local(-1, 0, 7), 0, 7); walk('departing-neighbor', 'civilian', local(1, 0, -1), local(1, 0, 6), .5, 7.5); stage(0, 'civilians-leave-together'); break;
      case 2: lineOfSoldiers(3, -5, 2, 4); stage(0, 'squad-assembles'); break;
      case 3:
        plan.duration = 12; aircraft('boarding-aircraft', [key(0, local(0, 0, 5), { rotor: .65, yaw: heading + Math.PI }), key(7, local(0, 0, 5), { rotor: 1 }), key(12, local(0, 12, 20), { rotor: 1 })]);
        for (let i = 0; i < 3; i++) walk(`boarding-${i}`, 'soldier', local(-2.5, 0, -3 - i * 1.4), local(-1.15, .7, 5), i * .5, 4 + i * .6, { visible: [0, 4.1 + i * .6] });
        stage(0, 'boarding'); stage(7, 'departure'); cue(7, 'aircraft-takeoff'); break;
      case 4:
      case 13:
        plan.duration = 11;
        convoy(id === 4 ? 'casualty' : 'relief', false, { parked: true, preserveCamera: true, route: [local(2.8, 0, -125), local(2.8, 0, 5)] });
        actor('casualty', 'wounded', [key(0, local(0, .45, 0)), key(7, local(0, .45, 5), { linear: true })], { visible: [0, 7.1] });
        for (const side of [-1, 1]) { walk(`carrier-${side}`, 'soldier', local(side * .8, 0, 0), local(side * .8, 0, 5), 0, 7); plan.actors.at(-1).keys.forEach(k => k.carry = 1); }
        medic('vehicle-medic', local(0, 0, 5), local(1.2, 0, 3), 0, 2); stage(0, 'stretcher-transfer'); stage(7, 'casualty-boarded'); cue(7, 'casualty-boarded'); break;
      case 5:
      case 8:
      case 14: plan.duration = id === 8 ? 22 : 16; convoy(id === 5 ? 'casualty' : id === 8 ? 'remaining-main' : 'relief', true); guard('rear-guard', id === 8 ? local(-5, 0, -7) : local(-2, 0, 1), local(-2, 0, -16)); if (id === 8) stage(0, 'convoy-return-departure'); stage(4, id === 8 ? 'convoy-returns' : 'last-vehicle-departs'); break;
      case 6: lineOfSoldiers(3, -3, 9, 7); stage(0, 'rescue-redirect'); cue(1, 'rescue-order'); break;
      case 7:
        walk('straggler', 'soldier', local(-3, 0, -7), local(-1, 0, 1), 0, 5); guard('waiting-squad', local(1, 0, 2), local(-2, 0, -9)); stage(0, 'patrol-reunites'); cue(5, 'reunion'); break;
      case 9:
        plan.duration = 10;
        for (let i = 0; i < 2; i++) walk(`rescuer-${i}`, 'soldier', [5 + i * 2, 0, -8], [1.9 + i * 1.4, 0, -1.2], 0, 7);
        shot(0, cockpitSeat, cockpitLook, { fov: 65, roll: -.12 });
        shot(10, cockpitSeat, [1.9, 1.05, -1.2], { fov: 65, roll: -.12 });
        stage(0, 'immobile-cockpit'); stage(7, 'rescuers-arrive'); cue(7, 'cockpit-rescue-contact'); break;
      case 10:
        plan.duration = 13;
        for (let i = 0; i < 2; i++) actor(`sniper-${i}`, 'soldier', [key(0, local(i * 2 - 1, 0, i * 2), { stance: 'crouch', alert: 1 }), key(4 + i * 2.3, local(i * 2 - 1, 0, i * 2), { stance: 'crouch', hit: 1, dead: 0 }), key(5.5 + i * 2.3, local(i * 2 - 1, 0, i * 2), { dead: 1, stance: 'low' })],{casualty:{side:i?-1:1,direction:{x:i?.35:-.3,z:-1}}});
        stage(0, 'last-defense'); stage(4, 'fixed-sacrifice'); stage(8, 'radio-silence'); cue(8, 'fixed-outcome', { outcome: 'gordon-and-shughart-die', fixed: true }); caption(8, '叙事', '无线电那头再没有传来两人的回答。戈登与舒哈特在救援中牺牲。', 4.8); break;
      case 11:
        plan.duration = 13; actor('smith', 'wounded', [key(0, local(0, 0, 1))]);
        actor('medic', 'soldier', [key(0, local(-.9, 0, 1), { stance: 'treat', yaw: Math.PI / 2, aimTarget: local(0, .3, 1) }), key(7, local(-.9, 0, 1), { stance: 'kneel', alert: 0 }), key(12, local(-.9, 0, 1), { stance: 'kneel', alert: 0 })]);
        actor('quiet-assistant', 'soldier', [key(0, local(1.2, 0, 2), { stance: 'kneel', alert: .1 })]); stage(0, 'treatment'); stage(7, 'treatment-stops'); cue(7, 'fixed-outcome', { outcome: 'smith-dies', fixed: true }); caption(7.1, '叙事', '医护人员停下了动作，身旁的人没有离开。史密斯没有活过这一夜。', 4.8); break;
      case 12: plan.duration = 15; convoy('relief'); guard('night-sentry', local(-2.5, 0, 2), local(0, 0, -20)); stage(0, 'relief-headlights'); cue(5, 'relief-sighted'); break;
      case 15: lineOfSoldiers(3, -9, 3, 5); for (const spec of plan.actors) spec.keys[1].stance = 'kneel'; stage(0, 'safety-arrival'); stage(5, 'exhausted-rest'); cue(5, 'withdrawal-complete'); break;
      case 16:
        plan.duration = 12; prop('memorial-bed', 'memorial', [key(0, anchor)]);
        actor('remembering-soldier', 'soldier', [key(0, local(-1.2, 0, -.7), { stance: 'stand', alert: 0 }), key(4, local(-1.2, 0, -.7), { stance: 'kneel', alert: 0, yaw: Math.PI / 2 })]);
        walk('passing-survivor', 'civilian', local(4, 0, -5), local(4, 0, 5), 0, 10);
        stage(0, 'names-remembered'); cue(4, 'remembrance'); caption(2, '叙事', '选择留下的不是胜利分数，而是被记住的人和彼此承担的重量。', 6); break;
    }
    if (![10, 11, 16].includes(id)) caption(.8, '叙事', chapter.outro || '他们继续清点身边的人，然后走向下一段路。', Math.min(6, plan.duration - 1.5));
  }
  if([4,5,6,7,8,10,12,13,14,15].includes(id)){
    const threat=local(-9,1.3,22);let guardSpec=plan.actors.find(a=>a.kind==='soldier'&&!a.crew&&!a.ropeActor&&a.keys.some(k=>k.aimTarget||k.stance==='crouch')&&!/carrier|medic|wounded|assistant|recovery/.test(a.id));
    if(!guardSpec){guard('transfer-cover',local(-6,0,-3),local(-9,0,22));guardSpec=plan.actors.at(-1);}
    if(guardSpec){for(const k of guardSpec.keys)if(!k.dead){k.aimTarget=threat;k.alert=1;}
      for(const at of [1.35,1.48,1.61,3.25,3.38,5.35])if(at<plan.duration-1)cue(at,'ground-cover-fire',{source:guardSpec.id,to:[threat[0]+Math.sin(at)*.5,threat[1],threat[2]],weaponId:id===12?'m249':'m16a2'});
    }
    const air=plan.aircraft.find(a=>!a.crashed);if(air){for(const at of [.18,.29,.40,.72,.83,.94])cue(at,'aircraft-cover-fire',{source:air.id,localPosition:[-1.3,1.65,.8],to:local(-10,.5,18),weaponId:'m134'});}
    if(id!==6&&(![14,15].includes(id)||!closing)){const blastAt=Math.min(plan.duration-2,closing?2.4:2.7);if(!(id===4&&!closing))cue(blastAt,'distant-impact',{position:local(-12,.2,20),strength:.35+id%3*.08});}
  }
  if (!plan.cameras.length) baseCamera();
  if (!plan.stages.length) stage(0, 'scene-action');
  // Narrative data may replace wording without owning the physical timing.
  const authoredCaptions = supplied.subtitles || supplied.lines;
  if (authoredCaptions?.length) {
    plan.events = plan.events.filter(e => e.type !== 'subtitle' || e.speaker === '叙事' && [10, 11].includes(id));
    authoredCaptions.forEach((line, index) => caption(Number.isFinite(line.at) ? line.at : .6 + index * 3.8, line.speaker || '叙事', line.text || '', line.duration || 3.5));
  }
  plan.events.sort((a, b) => a.at - b.at); plan.stages.sort((a, b) => a.at - b.at);
  return addPlayerAction(plan);
}

// Only an authored flat building slab may host the RPG performer. Test plans
// without a loaded scene may use a marked proxy; runtime plans never add one.
export function selectCinematicRoof(sceneState,preferred){
 if(!sceneState)return null;const candidates=[];
 for(const roof of sceneState.roofSurfaces||[]){if(!roof.flat||!roof.solid||roof.kind!=='building'||!Number.isFinite(roof.height))continue;const b=roof.bounds;if(!b)continue;
  for(const fx of[.25,.5,.75])for(const fz of[.25,.5,.75]){const x=mix(b.minX,b.maxX,fx),z=mix(b.minZ,b.maxZ,fz);if(x<b.minX+.8||x>b.maxX-.8||z<b.minZ+.8||z>b.maxZ-.8)continue;
   if((roof.obstacles||[]).some(o=>x>o.minX-.5&&x<o.maxX+.5&&z>o.minZ-.5&&z<o.maxZ+.5))continue;
   candidates.push({id:roof.id,position:[x,roof.height,z],bounds:{...b},score:Math.hypot(x-preferred[0],z-preferred[2])});}}
 return candidates.sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id))[0]||null;
}

function buildBriefingPlan(chapter,layout){
 if(![4,5,6,7,8,10,12,13,14,15].includes(chapter.id))throw new RangeError('This viewpoint does not receive a military briefing.');
 const spawn=point(chapter.spawn||layout.spawn),task=chapter.tasks?.[0],goal=chapter.storyDirection?.acts?.[0]?.goal||task?.label||chapter.intro;
 const threat={4:'索降点狭窄，落地后先让开绳下，照看失去平衡的人。',5:'伤员与登车队伍共用出口，先把交接说清。',6:'黑烟会飘动，靠建筑与残骸确认入口。',7:'不要追陌生背影；沿能说清的位置重新联络。',8:'车辆转弯受阻，后车需要明确而非猜测的路况。',10:'地面支援尚未到达，先找到仍在回应的幸存者。',12:'夜间辨认困难，先确认呼号与轮换位置。',13:'保持装载通路，逐人交接伤员。',14:'保持搬运通路，认清名字与随身物品。',15:'车队已经移动，盯住下一转角和落后队友。'}[chapter.id];
 const center=[spawn[0]+1.5,0,spawn[2]+1.4],look=[center[0],1.1,center[2]],id='ch'+String(chapter.id).padStart(2,'0')+'-action-briefing';
 return{id,chapterId:chapter.id,phase:'briefing',mood:chapter.mood,duration:8,anchor:center,crashPoint:center,actors:[{id:'briefing-commander',kind:'soldier',keys:[key(0,[center[0],0,center[2]+.8],{yaw:Math.PI,talk:1,carry:1}),key(4,[center[0],0,center[2]+.8],{talk:.6,gesture:'handover',carry:1}),key(8,[center[0]-.5,0,center[2]+1.1],{linear:true,talk:0,carry:0})]}],props:[{id:'action-map',kind:'map',keys:[key(0,center)]}],aircraft:[],cameras:[key(0,[spawn[0]-.8,1.65,spawn[2]-1.8],{lookAt:look,fov:62}),key(8,[spawn[0]-.5,1.60,spawn[2]-1.4],{lookAt:look,fov:62})],events:[{at:.2,type:'subtitle',speaker:'行动简报',text:chapter.role,duration:2.3},{at:2.55,type:'subtitle',speaker:'眼前目标',text:goal,duration:2.6},{at:5.2,type:'subtitle',speaker:'出发前确认',text:threat,duration:2.7},{at:7.8,type:'briefing-ready',chapterId:chapter.id}],stages:[{at:0,name:'role-and-map'},{at:2.55,name:'objective-handover'},{at:5.2,name:'threat-and-entry'}]};
}

function buildActionPlan(chapter, layout, event) {
  const task = typeof event === 'object' && event ? event : chapter.tasks?.find(t => t.sceneEvent === event || t.id === event);
  if (!task) throw new RangeError('A task cinematic needs a task object or known sceneEvent.');
  const index = chapter.tasks?.findIndex(t => t.id === task.id) ?? -1;
  const anchor = point(task.pos || (index >= 0 && layout.taskPositions?.[index]) || layout.cinematic?.anchor || chapter.spawn);
  const heading = layout.facing ?? chapter.facing ?? 0;
  const p = (x, y, z) => [anchor[0] + x * Math.cos(heading) - z * Math.sin(heading), anchor[1] + y, anchor[2] - x * Math.sin(heading) - z * Math.cos(heading)];
  const type = task.animation || task.interaction || 'observe', sceneEvent = task.sceneEvent || task.id;
  const plan = { id: sceneEvent, chapterId: chapter.id, phase: 'event', mood: chapter.mood || 'day', duration: 5.5, anchor, crashPoint: point(layout.cinematic?.crashPoint, anchor), actors: [], props: [], aircraft: [], cameras: [], stages: [{ at: 0, name: `task-${type}` }], events: [] };
  const a = (id, kind, keys, extra = {}) => plan.actors.push({ id, kind, keys, ...extra });
  const item = (id, kind, keys, extra = {}) => plan.props.push({ id, kind, keys, ...extra });
  const performer = chapter.id === 1 ? 'civilian' : 'soldier';
  const caption = { at: .15, type: 'subtitle', speaker: task.speaker || '叙事', text: task.text || task.label || '正在交接。', duration: 4.5 };
  plan.events.push(caption, { at: 3.5, type: 'task-action', taskId: task.id, action: type, sceneEvent });
  if (chapter.id === 9 || type === 'injured-seated') {
    plan.duration = 5; plan.stages[0].name = 'injured-seated-response';
    const seat = point(layout.cinematic?.cockpitSeat, [0, .95, .9]);
    plan.cameras.push(key(0, seat, { lookAt: [seat[0] - .4, seat[1] - .2, seat[2] - 6], fov: 65, roll: -.12 }), key(5, seat, { lookAt: [seat[0] + .4, seat[1] - .2, seat[2] - 6], fov: 65, roll: -.12 }));
    // The authored cockpit already contains its radio/control panel. Keep the
    // injured protagonist seated and do not introduce a separate radio table.
  } else if (/crew-carried|durant-extracted|blackburn-loaded|casualty-handover/.test(sceneEvent) || type === 'board') {
    plan.duration = 7;
    const memorial = /crew-carried/.test(sceneEvent);
    if (memorial) item('recovery-stretcher', 'covered-stretcher', [key(0, p(0, 0, 0)), key(2, p(0, .55, 0)), key(6, p(0, .55, 3), { linear: true })]);
    else a('carried-patient', 'wounded', [key(0, p(0, 0, 0)), key(2, p(0, .45, 0)), key(6, p(0, .45, 3), { linear: true })]);
    for (const side of [-1, 1]) a(`carrier-${side}`, 'soldier', [key(0, p(side * .76, 0, 0), { stance: 'kneel', yaw: heading + (side < 0 ? Math.PI / 2 : -Math.PI / 2), carry: 1 }), key(2, p(side * .76, 0, 0), { stance: 'stand', carry: 1 }), key(6, p(side * .76, 0, 3), { linear: true, carry: 1 })]);
    if (!/durant-extracted/.test(sceneEvent)) item('transfer-vehicle', 'vehicle', [key(0, p(2.6, 0, 3.5))]);
    plan.stages.push({ at: 2, name: 'coordinated-lift' }, { at: 6, name: 'transfer-complete' });
  } else if (/stretcher-open/.test(sceneEvent)) {
    plan.duration = 6;
    item('opened-stretcher', 'stretcher', [key(0, p(0, .18, 0), { unfold: 0 }), key(3, p(0, .18, 0), { unfold: 1 })]);
    for (const side of [-1, 1]) a(`stretcher-preparer-${side}`, 'soldier', [key(0, p(side * .8, 0, 0), { stance: 'treat', yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 }), key(4, p(side * .8, 0, 0), { stance: 'kneel' })]);
    plan.stages.push({ at: 3, name: 'stretcher-open' });
  } else if (type === 'treat') {
    const lifts = /harris-lifted/.test(sceneEvent);
    a('patient', lifts ? 'soldier' : 'wounded', [key(0, p(0, 0, .5), { stance: 'low', alert: .1 }), key(4, p(0, 0, .5), { stance: lifts ? 'stand' : 'low', alert: .1 })]);
    a('helper', performer, [key(0, p(-1.6, 0, -1.2), { linear: true, yaw: Math.PI / 2 }), key(1.4, p(-.85, 0, .5), { stance: 'treat', yaw: Math.PI / 2, aimTarget: p(0, .4, .5) }), key(5, p(-.85, 0, .5), { stance: lifts ? 'stand' : 'treat', carry: lifts ? 1 : 0 })]);
    item('medical-kit', 'parcel', [key(0, p(-.5, .18, -.5))]); plan.stages.push({ at: 1.4, name: 'hands-on-assistance' });
  } else if (type === 'handover') {
    a('giver', performer, [key(0, p(-1.2, 0, 0), { stance: 'stand', yaw: Math.PI / 2, carry: 1 }), key(4.2, p(-1.2, 0, 0), { stance: 'stand', talk: .5 })]);
    a('receiver', performer, [key(0, p(1, 0, 0), { stance: 'stand', yaw: -Math.PI / 2, carry: 1 })]);
    item('handed-parcel', 'parcel', [key(0, p(-.8, .95, 0)), key(1.5, p(-.8, .95, 0)), key(3.3, p(.6, .95, 0)), key(5.5, p(.6, .95, 0))]); plan.stages.push({ at: 3.3, name: 'parcel-handed-over' });
  } else if (type === 'escort') {
    for (let i = 0; i < 2; i++) a(`escort-${i}`, i ? performer : task.kind === 'civilian' ? 'civilian' : 'soldier', [key(0, p(i * 1.2 - .6, 0, -1.8), { linear: true, yaw: heading + Math.PI, carry: .6 }), key(4.7, p(i * 1.2 - .6, 0, 2.7), { carry: .6, stance: 'stand' })]);
    a('receiving-helper', performer, [key(0, p(1, 0, 3.6), { talk: .4, carry: 1 })]); plan.stages.push({ at: 4.7, name: 'escort-handover' });
  } else if (type === 'defend') {
    a('incoming-watch', 'soldier', [key(0, p(-1.5, 0, -2), { linear: true }), key(2.6, p(-.7, 0, .6), { stance: 'crouch', aimTarget: p(-1, 1.3, 15), alert: 1 })]);
    a('relieved-watch', 'soldier', [key(0, p(.9, 0, .6), { stance: 'crouch', alert: 1 }), key(2.6, p(.9, 0, .6), { stance: 'stand' }), key(5.5, p(2, 0, -3), { linear: true, stance: 'kneel' })]); plan.stages.push({ at: 2.6, name: 'cover-handover' });
  } else {
    const wounded = task.kind === 'wounded';
    const partnerKeys = [key(0, p(.5, 0, .5), { stance: type === 'radio' ? 'crouch' : 'stand', talk: 1, alert: .2, yaw: heading }), key(3.4, p(.5, 0, .5), { stance: type === 'radio' ? 'crouch' : 'stand', talk: .4, yaw: heading + .35 })];
    a('conversation-partner', wounded ? 'wounded' : task.kind === 'civilian' ? 'civilian' : 'soldier', partnerKeys, { shoulderRadio: type === 'radio' ? { raise: .85, release: 3.4, lowered: 4.5 } : null });
    a('listener', performer, [key(0, p(-.9, 0, -1.5), { linear: true, yaw: heading + Math.PI }), key(1.8, p(-.8, 0, -.6), { stance: wounded ? 'kneel' : 'stand', talk: .3, yaw: heading + Math.PI })]);
    plan.stages.push({ at: 1.8, name: type === 'radio' ? 'radio-response' : 'acknowledgement' });
  }
  if (!plan.cameras.length) {
    // Confined treatment bays use a stationary close shot, never an orbit that
    // can carry the lens through the room's partitions or outside wall.
    if (chapter.id === 11) {
      const from = [anchor[0] + (anchor[0] > 0 ? -2.5 : 2.5), 1.5, anchor[2] + 2.5];
      plan.cameras.push(key(0, from, { lookAt: p(0, .65, .3), fov: 62 }), key(plan.duration, from, { lookAt: p(0, .65, .3), fov: 62 }));
    } else plan.cameras.push(key(0, p(3.2, 1.6, -3.6), { lookAt: p(0, .9, .5), fov: 55 }), key(plan.duration, p(2.8, 1.5, -3.2), { lookAt: p(0, .9, 1), fov: 55 }));
  }
  return addPlayerAction(plan);
}

export function createNarrativeCinematics({ scene, camera, world, audio, onSubtitle = () => {}, onComplete = () => {}, onEvent = () => {} }) {
  if (!scene?.isScene || !camera?.isCamera || !world) throw new TypeError('Cinematics require a Three scene, camera, and prepared world.');
  let running = false, paused = false, plan = null, time = 0, ambientTime = 0, cursor = 0, root = null, effects = null, ambientBefore = true, savedCamera = null, disposed = false;
  let cameraTrack=[],interactive = true, input = {}, playerAction = null, lookYaw = 0, lookPitch = 0;
  const objects = new Map(), worldOwned = new Set(), localGeometries = new Set(), localMaterials = new Set(), hidden = new Map(), fires = [], trails = new Set(), ledger = [], convoys = new Map();
  const cameraWorld = new THREE.Vector3(), look = new THREE.Vector3(), cameraRight = new THREE.Vector3(), temp = new THREE.Vector3();
  const register = (object, spec, type, ownedByWorld = true) => {
    if (!object?.isObject3D) throw new TypeError(`World could not create ${type}: ${spec.id}`);
    root.add(object); object.name = `cinematic:${spec.id}`; object.userData.cinematic = true;
    objects.set(spec.id, { object, spec, type, track:resolveCinematicTrack(spec.keys),previous: new THREE.Vector3(), initialized: false }); if (ownedByWorld) worldOwned.add(object); return object;
  };
  const primitive = spec => {
    const group = new THREE.Group();
    const mesh = (g, m, p) => { localGeometries.add(g); localMaterials.add(m); const o = new THREE.Mesh(g, m); if (p) o.position.set(...p); group.add(o); return o; };
    if (spec.kind === 'rope') mesh(new THREE.CylinderGeometry(.024, .024, spec.length || 12, 7), new THREE.MeshStandardMaterial({ color: '#767264', roughness: 1 }));
    else if(spec.kind==='projectile'){const mat=new THREE.MeshStandardMaterial({color:'#5e6351',roughness:.7}),body=mesh(new THREE.CylinderGeometry(.045,.035,.52,10),mat);body.rotation.x=Math.PI/2;const nose=mesh(new THREE.ConeGeometry(.055,.18,10),mat,[0,0,.35]);nose.rotation.x=Math.PI/2;mesh(new THREE.SphereGeometry(.055,8,5),new THREE.MeshBasicMaterial({color:'#ffd689'}),[0,0,-.30]);}
    else if(spec.kind==='roof-edge'){const mat=new THREE.MeshStandardMaterial({color:'#948772',roughness:1});mesh(new THREE.BoxGeometry(3.8,.22,3),mat,[0,-.1,0]);mesh(new THREE.BoxGeometry(3.8,.65,.26),mat,[0,.15,-1.25]);}
    else if (spec.kind === 'parcel') {
      const cloth = new THREE.MeshStandardMaterial({ color: '#7e8060', roughness: .97 }), strap = new THREE.MeshStandardMaterial({ color: '#3d4233', roughness: 1 });
      mesh(new THREE.BoxGeometry(.34, .25, .29), cloth);
      for (const x of [-.10, .10]) mesh(new THREE.BoxGeometry(.035, .26, .30), strap, [x, 0, 0]);
      const handle = mesh(new THREE.TorusGeometry(.065, .014, 5, 12, Math.PI), strap, [0, .13, 0]); handle.rotation.y = Math.PI / 2;
    } else if (spec.kind === 'covered-stretcher') {
      const fabric = new THREE.MeshStandardMaterial({ color: '#777967', roughness: 1 }), rail = new THREE.MeshStandardMaterial({ color: '#555f58', roughness: .75, metalness: .4 });
      mesh(new THREE.BoxGeometry(.78, .035, 1.98), fabric, [0, .32, 0]);
      for (const x of [-.42, .42]) { const pole = mesh(new THREE.CylinderGeometry(.027, .027, 2.45, 9), rail, [x, .34, 0]); pole.rotation.x = Math.PI / 2; }
      for (const x of [-.34, .34]) for (const z of [-.65, .65]) mesh(new THREE.BoxGeometry(.035, .3, .035), rail, [x, .16, z]);
      const profiles = [[-.90,.14,.04],[-.68,.22,.13],[-.32,.30,.19],[.30,.28,.18],[.65,.22,.13],[.88,.15,.06]], verts=[],uv=[],idx=[];
      for(const [z,w,h] of profiles) for(let j=0;j<=8;j++){const t=j/8*Math.PI;verts.push(Math.cos(t)*w,.35+Math.sin(t)*h,z);uv.push(j/8,(z+.9)/1.8);}
      for(let i=0;i<profiles.length-1;i++)for(let j=0;j<8;j++){const a=i*9+j,b=a+9;idx.push(a,a+1,b,a+1,b+1,b);}
      const cover=new THREE.BufferGeometry();cover.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));cover.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cover.setIndex(idx);cover.computeVertexNormals();mesh(cover,fabric);
    } else if (spec.kind === 'stretcher') {
      const cloth = new THREE.MeshStandardMaterial({ color: '#77785e', roughness: 1, side: THREE.DoubleSide }), steel = new THREE.MeshStandardMaterial({ color: '#636b65', roughness: .7, metalness: .6 });
      const panels = [];
      for (const side of [-1, 1]) {
        const panel = new THREE.Group(); group.add(panel);
        const fabric = mesh(new THREE.BoxGeometry(.43, .035, 1.9), cloth, [side * .215, 0, 0]); panel.add(fabric);
        const rail = mesh(new THREE.CylinderGeometry(.025, .025, 2.35, 8), steel, [side * .43, .01, 0]); rail.rotation.x = Math.PI / 2; panel.add(rail); panels.push({ object: panel, side });
      }
      group.userData.foldPanels = panels;
    }
    else {
      const mat = new THREE.MeshStandardMaterial({ color: '#b0a58b', roughness: .97 }); mesh(new THREE.BoxGeometry(2.6, .06, 1.6), mat, [0, .94, 0]);
      const dark = new THREE.MeshStandardMaterial({ color: '#5d655d', roughness: 1 });
      for (const x of [-1.1, 1.1]) for (const z of [-.6, .6]) mesh(new THREE.BoxGeometry(.06, .94, .06), dark, [x, .47, z]);
      // Raised route strips and three markers form a physical briefing board.
      for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(1.9, .012, .035), dark, [0, .98, -.5 + i * .31]);
      for (const x of [-.65, .1, .7]) mesh(new THREE.CylinderGeometry(.055, .055, .09, 8), dark, [x, 1.02, x * .4]);
    }
    return group;
  };
  function prepareLauncher(record){
    if(!record.spec.launcher)return;
    const object=record.object,actual=object.userData.carriedWeapon;
    if(!actual&&world.getSceneState)throw new Error('Cinematic RPG performer requires the prepared RPG-7 model.');
    // The empty CPU-fixture adapter owns no invented weapon mesh. Runtime uses
    // the exact carried RPG, its barrel socket and both authored hand grips.
    const launcher=actual||new THREE.Group();if(!actual){launcher.userData={weaponId:'rpg7',grips:{right:[0,-.055,.005],left:[0,-.055,-.23]},muzzle:[0,.11,-.36],barrelDirection:[0,0,-1]};object.add(launcher);object.userData.weaponDropped=true;}
    const bones=new Map();object.traverse(o=>{if(o.isBone)bones.set(o.name.replace(/:/g,'').replace(/_\d+$/,''),o);});
    const limbs=['Right','Left'].map(side=>({arm:bones.get('mixamorig'+side+'Arm'),elbow:bones.get('mixamorig'+side+'ForeArm'),hand:bones.get('mixamorig'+side+'Hand'),side})).filter(l=>l.arm&&l.elbow&&l.hand);
    record.launcher={object:launcher,limbs,actual:Boolean(actual),muzzle:[...launcher.userData.muzzle],grips:launcher.userData.grips};
  }
  function animateLauncher(record){
    const data=record.launcher;if(!data)return;const spec=record.spec.launcher;
    data.object.visible=true;const round=data.object.getObjectByName('Magazine');if(round)round.visible=time<spec.launchAt;
    record.object.updateWorldMatrix(true,true);const direction=new THREE.Vector3(...spec.target).sub(new THREE.Vector3(...spec.launchPoint)).normalize();
    const worldRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...(data.object.userData.barrelDirection||[0,0,-1])),direction);
    data.object.quaternion.copy(record.object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation));data.object.position.set(0,0,0);data.object.updateWorldMatrix(false,true);
    const muzzleOffset=new THREE.Vector3(...data.muzzle).applyQuaternion(worldRotation),origin=new THREE.Vector3(...spec.launchPoint).sub(muzzleOffset);data.object.position.copy(record.object.worldToLocal(origin));data.object.updateWorldMatrix(false,true);
    const wp=o=>o.getWorldPosition(new THREE.Vector3()),aim=(bone,child,target)=>{const a=wp(bone),from=wp(child).sub(a).normalize(),to=target.clone().sub(a).normalize(),q=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);};
    for(const l of data.limbs){const target=data.object.localToWorld(new THREE.Vector3(...data.grips[l.side.toLowerCase()])),origin=wp(l.arm),upper=origin.distanceTo(wp(l.elbow)),lower=wp(l.elbow).distanceTo(wp(l.hand)),axis=target.clone().sub(origin),d=clamp(axis.length(),Math.abs(upper-lower)+.0001,(upper+lower)*.998);axis.normalize();const pole=record.object.localToWorld(new THREE.Vector3(l.side==='Right'?-.45:.45,.88,.15)).sub(origin);pole.addScaledVector(axis,-pole.dot(axis)).normalize();const along=(upper*upper+d*d-lower*lower)/(2*d),middle=origin.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));aim(l.arm,l.elbow,middle);aim(l.elbow,l.hand,origin.clone().addScaledVector(axis,d));}
  }
  function prepareShoulderRadio(record) {
    if (!record.spec.shoulderRadio) return;
    const bones = new Map();
    record.object.traverse(o => { if (o.isBone) { const name = o.name.replace(/:/g, ''); bones.set(name, o); if (name.startsWith('mixamorig')) bones.set(name.replace(/_\d+$/, ''), o); } });
    const find = (mixamo, fallback) => bones.get('mixamorig' + mixamo) || bones.get(fallback);
    const chest = find('Spine2', 'spine_03'), arm = find('LeftArm', 'upperarm_l'), elbow = find('LeftForeArm', 'lowerarm_l'), hand = find('LeftHand', 'hand_l'), knuckle = find('LeftHandMiddle1', 'middle_01_l');
    if (!chest || !arm || !elbow || !hand) return;
    const microphone = new THREE.Group(); microphone.name = 'worn shoulder push-to-talk microphone';
    const body = new THREE.MeshStandardMaterial({ color: '#353c34', roughness: .85 });
    const grille = new THREE.MeshStandardMaterial({ color: '#171d19', roughness: .94 });
    localMaterials.add(body); localMaterials.add(grille);
    const part = (geometry, material, position) => {
      localGeometries.add(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
      // The director owns these resources even though the mic follows an actor.
      mesh.userData.sharedGeometry = mesh.userData.sharedMaterial = true; microphone.add(mesh);
    };
    part(new THREE.BoxGeometry(.048, .070, .025), body, [0, 0, 0]);
    for (const y of [-.017, -.006, .005, .016]) part(new THREE.BoxGeometry(.029, .003, .003), grille, [0, y, .014]);
    part(new THREE.BoxGeometry(.009, .027, .016), grille, [-.026, -.003, 0]);
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -.035, 0), new THREE.Vector3(.018, -.13, .015), new THREE.Vector3(-.035, -.24, -.018)]), 10, .003, 5, false), grille, [0, 0, 0]);
    record.object.add(microphone); record.radio = { chest, arm, elbow, hand, knuckle, microphone, weight: 0 };
  }
  function animateShoulderRadio(record, objectTime) {
    const r = record.radio; if (!r) return;
    const { raise, release, lowered } = record.spec.shoulderRadio;
    const weight = smooth(objectTime / raise) * (1 - smooth((objectTime - release) / (lowered - release))); r.weight = weight;
    const actor = record.object, worldPoint = bone => bone.getWorldPosition(new THREE.Vector3()); actor.updateMatrixWorld(true);
    const rotation = actor.getWorldQuaternion(new THREE.Quaternion());
    const chest = actor.worldToLocal(worldPoint(r.chest));
    r.microphone.position.copy(chest).add(new THREE.Vector3(.12, .09, .12));
    if (weight <= 0) return;
    const wrist = worldPoint(r.hand), initialRotation = r.hand.getWorldQuaternion(new THREE.Quaternion());
    const finger = r.knuckle ? worldPoint(r.knuckle).sub(wrist) : new THREE.Vector3(0, .08, 0).applyQuaternion(rotation);
    const handRotation = new THREE.Quaternion().setFromUnitVectors(finger.clone().normalize(), new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)).multiply(initialRotation);
    const palmOffset = finger.multiplyScalar(.72).applyQuaternion(handRotation.clone().multiply(initialRotation.clone().invert()));
    const contact = actor.localToWorld(r.microphone.position.clone().add(new THREE.Vector3(0, -.025, .035)));
    const target = wrist.clone().lerp(contact.sub(palmOffset), weight);
    const origin = worldPoint(r.arm), joint = worldPoint(r.elbow), upper = origin.distanceTo(joint), lower = joint.distanceTo(wrist);
    const axis = target.clone().sub(origin), length = clamp(axis.length(), Math.abs(upper - lower) + .001, (upper + lower) * .998); axis.normalize();
    const pole = actor.localToWorld(chest.clone().add(new THREE.Vector3(.48, -.22, .22))).sub(origin);
    pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper * upper + length * length - lower * lower) / (2 * length);
    const middle = origin.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
    const pointBone = (bone, child, destination) => {
      const start = worldPoint(bone), direction = worldPoint(child).sub(start).normalize(), desired = destination.clone().sub(start).normalize();
      const q = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(direction, desired));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); bone.updateWorldMatrix(false, true);
    };
    pointBone(r.arm, r.elbow, middle); pointBone(r.elbow, r.hand, origin.clone().addScaledVector(axis, length));
    r.hand.quaternion.copy(r.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(initialRotation.clone().slerp(handRotation, weight)));
    r.hand.updateWorldMatrix(false, true);
  }
  function prepareCrew(record) {
    const bones = new Map(); record.object.traverse(o => { if (o.isBone) bones.set(o.name.replace(/:/g, '').replace(/_\d+$/, ''), o); });
    const bone = name => bones.get('mixamorig' + name);
    record.crewRig = { hips: bone('Hips'), rifle: record.object.children.find(o => o.userData.grips), limbs: ['Left', 'Right'].map(side => ({ side, arm: bone(side + 'Arm'), elbow: bone(side + 'ForeArm'), hand: bone(side + 'Hand'), knuckle: bone(side + 'HandMiddle1'), thigh: bone(side + 'UpLeg'), knee: bone(side + 'Leg'), foot: bone(side + 'Foot') })) };
  }
  function updateCrew(record, dt) {
    const spec = record.spec.crew, vehicle = objects.get(spec.vehicle)?.object;
    const anchors = vehicle?.userData.crewAnchors || [];
    const anchor = anchors.find(a => a.role === spec.role) || (spec.role === 'passenger' ? anchors.find(a => a.role === 'driver') : null);
    record.object.visible = Boolean(vehicle?.visible && anchor); if (!record.object.visible) return;
    const actor = record.object, rig = record.crewRig, gunner = spec.role === 'gunner';
    vehicle.updateMatrixWorld(true); actor.position.copy(vehicle.localToWorld(new THREE.Vector3(...anchor.position)));
    actor.quaternion.copy(vehicle.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(anchor.rotation || [0, 0, 0]))));
    actor.userData.animate?.(0, dt, { stance: 'stand', carry: gunner ? 0 : 1, alert: gunner ? .8 : .25 }); actor.updateMatrixWorld(true);
    if (rig.rifle) rig.rifle.visible = false;
    if (rig.hips && anchor.anchorSpace !== 'feet') {
      const pelvis = rig.hips.getWorldPosition(new THREE.Vector3()); actor.position.add(vehicle.localToWorld(new THREE.Vector3(...anchor.position)).sub(pelvis)); actor.updateMatrixWorld(true);
    }
    const wp = bone => bone.getWorldPosition(new THREE.Vector3());
    const aimBone = (bone, child, target) => {
      const start = wp(bone), turn = new THREE.Quaternion().setFromUnitVectors(wp(child).sub(start).normalize(), target.clone().sub(start).normalize());
      const q = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); bone.updateWorldMatrix(false, true);
    };
    const solve = (a, b, c, target, pole) => {
      if (!a || !b || !c) return;
      const origin = wp(a), upper = origin.distanceTo(wp(b)), lower = wp(b).distanceTo(wp(c)), axis = target.clone().sub(origin), distance = clamp(axis.length(), Math.abs(upper - lower) + .001, (upper + lower) * .997); axis.normalize();
      const bend = pole.clone().sub(origin); bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
      aimBone(a, b, origin.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along))));
      aimBone(b, c, origin.clone().addScaledVector(axis, distance));
    };
    for (const limb of rig.limbs) {
      const side = limb.side === 'Left' ? .15 : -.15, seat = new THREE.Vector3(...anchor.position);
      const local = offset => vehicle.localToWorld(seat.clone().add(new THREE.Vector3(...offset)));
      if (!gunner && limb.foot) {
        const feet = anchor.feet && Object.values(anchor.feet).sort((a, b) => a[0] - b[0]);
        const authored = feet?.[limb.side === 'Left' ? 1 : 0];
        const target = authored ? vehicle.localToWorld(new THREE.Vector3(...authored)) : local([side, -.22, .62]);
        const rotation = limb.foot.getWorldQuaternion(new THREE.Quaternion());
        solve(limb.thigh, limb.knee, limb.foot, target, local([side, -.08, .65]));
        limb.foot.quaternion.copy(limb.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
        limb.foot.updateWorldMatrix(false, true);
      }
      if (spec.role === 'driver' || gunner) {
        const grips = anchor.hands && Object.values(anchor.hands).sort((a, b) => a[0] - b[0]);
        const authored = grips?.[limb.side === 'Left' ? 1 : 0];
        const fallback = gunner ? [side * .8, .62, -.06] : [side * 1.25, .22, .43];
        const target = authored ? vehicle.localToWorld(new THREE.Vector3(...authored)) : local(fallback);
        if (limb.hand) {
          const rotation = limb.hand.getWorldQuaternion(new THREE.Quaternion());
          if (limb.knuckle) target.sub(wp(limb.knuckle).sub(wp(limb.hand)).multiplyScalar(.72));
          solve(limb.arm, limb.elbow, limb.hand, target, local([side * 2.5, .05, .15]));
          limb.hand.quaternion.copy(limb.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation)); limb.hand.updateWorldMatrix(false, true);
        }
      }
    }
    record.pose = { stance: gunner ? 'stand' : 'seated', carry: gunner ? 0 : 1 }; actor.updateMatrixWorld(true);
  }
  function cleanup() {
    if (!root && !savedCamera) return;
    for (const fire of fires) fire.dispose(); fires.length = 0;
    effects?.dispose(); effects = null;
    for (const object of worldOwned) world.destroyActor?.(object);
    for (const geo of localGeometries) geo.dispose(); for (const mat of localMaterials) mat.dispose();
    worldOwned.clear(); localGeometries.clear(); localMaterials.clear(); objects.clear(); trails.clear(); convoys.clear();
    root?.removeFromParent(); root?.clear(); root = null;
    for (const [object, visible] of hidden) if (!object.userData.disposed) object.visible = visible; hidden.clear();
    world.setAmbientAircraftEnabled?.(ambientBefore);
    if (savedCamera) { camera.position.copy(savedCamera.position); camera.quaternion.copy(savedCamera.quaternion); camera.fov = savedCamera.fov; camera.updateProjectionMatrix(); savedCamera = null; }
    audio?.updateAircraft?.(500, 0, false, 0); audio?.updateBattle?.(0, 500, 0, false);
    if (playerAction) { playerAction.active = false; playerAction.holding = false; } input = {};
  }
  function finish(skipped = false) {
    if (!running) return false;
    const exitPose = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov };
    const result = { chapterId: plan.chapterId, phase: plan.phase, sequenceId: plan.id, skipped, event: plan.events.find(e => e.type === 'fixed-outcome')?.outcome || null, exitPose };
    running = false; paused = false; cleanup(); onComplete(result); return true;
  }
  function emit(event) {
    const record = { ...event, time: event.at, sequenceId: plan.id, chapterId: plan.chapterId, phase: plan.phase };
    ledger.push(record); if (ledger.length > 128) ledger.shift();
    if (event.type === 'subtitle') { onSubtitle({ speaker: event.speaker, text: event.text, duration: event.duration, sequenceId: plan.id }); audio?.radio?.(); }
    else if(event.type==='rpg-launched'){effects.emitExplosion({position:event.position,normal:new THREE.Vector3(...event.to).sub(new THREE.Vector3(...event.position)).normalize(),strength:event.strength,kind:'launch',time:ambientTime});camera.getWorldPosition(cameraWorld);audio?.shotAt?.(distance(event.position,cameraWorld.toArray()),0,'rpg7');record.position=[...event.position];}
    else if(event.type==='distant-impact'){effects.emitExplosion({position:event.position,strength:event.strength,kind:'ground',time:ambientTime});camera.getWorldPosition(cameraWorld);audio?.impact?.(distance(event.position,cameraWorld.toArray()),-.5,false);}
    else if(['aircraft-cover-fire','ground-cover-fire'].includes(event.type)){
      const sourceRecord=objects.get(event.source),source=sourceRecord?.object,pose=sourceRecord?.pose;if(source?.visible&&!(event.type==='ground-cover-fire'&&(pose?.dead>.01||pose?.injured>.1||pose?.ropeGrip>.2))){source.updateWorldMatrix(true,true);let to=new THREE.Vector3(...event.to),from,socket,dot;
        if(event.type==='aircraft-cover-fire'&&source.userData.gunSockets?.length){
          const side=source.worldToLocal(to.clone()).x<0?'door-left':'door-right';socket=source.userData.gunSockets.find(s=>s.id===(event.socketId||side));
          from=source.userData.aimDoorGun(socket.id,to);const barrel=new THREE.Vector3(...socket.forward).applyQuaternion(socket.pivot.getWorldQuaternion(new THREE.Quaternion())).normalize();dot=barrel.dot(to.clone().sub(from).normalize());
          if(dot<.995){const length=Math.max(12,from.distanceTo(to));to=from.clone().addScaledVector(barrel,length);record.targetAdjustedToBarrel=true;dot=1;}
          source.userData.animateDoorGun?.(socket.id,.045,{firing:true});record.socketId=socket.id;record.realDoorGun=true;record.barrelDot=dot;record.barrelForward=barrel.toArray();
        }else from=event.localPosition?source.localToWorld(new THREE.Vector3(...event.localPosition)):source.userData.getMuzzlePosition?.()||source.localToWorld(new THREE.Vector3(0,1.3,.5));
        effects.emitGunfire({from,to,weaponId:event.weaponId,time:ambientTime});camera.getWorldPosition(cameraWorld);const delta=from.clone().sub(cameraWorld);audio?.shotAt?.(delta.length(),delta.normalize().dot(cameraRight),event.weaponId);record.from=from.toArray();record.to=to.toArray();
      }
    }
    else if (event.type === 'tail-smoke') trails.add(event.target);
    else if(event.type==='landing-accident'){effects.emitDust({position:event.position,time:ambientTime,strength:.38});audio?.step?.(true);}
    else if (['aircraft-hit', 'aircraft-impact'].includes(event.type)) {
      let position = event.position;
      if (!position) { const target = objects.get(event.target)?.object; if (target) { target.updateMatrixWorld(true); position = target.localToWorld(new THREE.Vector3(...event.localPosition)).toArray(); } }
      if (position) { if(event.type==='aircraft-hit'){const target=objects.get(event.target)?.object;if(target)target.userData.cinematicDamage={tailRotorDisabled:true,hitAt:event.at,localPosition:[...event.localPosition]};}record.position=[...position];effects.emitExplosion({position,time:ambientTime,strength:event.strength,kind:event.type==='aircraft-impact'?'ground':'airburst'}); camera.getWorldPosition(cameraWorld); const delta = temp.set(...position).sub(cameraWorld), pan = clamp(delta.normalize().dot(cameraRight), -1, 1); audio?.impact?.(distance(position, cameraWorld.toArray()), pan, false); }
      if (event.type === 'aircraft-impact') trails.delete(event.target);
    } else if (event.type === 'wreck-fire') fires.push(createFire(root, { position: event.position, scale: event.scale || 1.4, intensity: 1 }));
    onEvent(record);
  }
  function updateObjects(dt) {
    for (const record of objects.values()) {
      const { object, spec, type } = record;
      if (spec.crew) continue;
      // The evacuation column keeps rolling even while the playable soldier
      // stops or backs up. The world, rotors and idle skeletons also keep time.
      let objectTime = playerAction?.active && playerAction.id === 'foot-withdrawal' && spec.kind === 'vehicle' ? Math.min(plan.duration, ambientTime) : time;
      if(playerAction?.id==='fast-rope'){if(spec.id===playerAction.actor)objectTime=playerAction.started?playerAction.start+(playerAction.end-playerAction.start)*playerAction.progress+(playerAction.completed?Math.max(0,ambientTime-playerAction.completedAt):0):time;else if(spec.id==='insertion-aircraft'&&playerAction.started)objectTime=playerAction.completed?Math.min(time,13+Math.max(0,ambientTime-playerAction.completedAt)):Math.min(time,13);}
      const pose = spec.convoy ? convoys.get(spec.convoy.groupId).at(objectTime, spec.convoy.index) : sampleResolvedTrack(record.track,objectTime);
      object.visible = !spec.visible || objectTime >= spec.visible[0] && objectTime < spec.visible[1];if(playerAction?.id==='fast-rope'&&spec.kind==='rope'&&(playerAction.active||playerAction.completed&&ambientTime-playerAction.completedAt<1.1))object.visible=true;
      // A settled corpse has static authored placement. Keep its solved skin
      // and supporting transform instead of rerunning the expensive full-body
      // contact solver every frame. Camera, cues and living actors still tick.
      const settled=record.settledTransform;
      if(spec.casualty&&pose.dead===1&&settled&&pose.position.every((n,i)=>n===settled.position[i])&&(pose.yaw||0)===settled.yaw&&(pose.pitch||0)===settled.pitch&&(pose.roll||0)===settled.roll){record.previous.copy(object.position);record.initialized=true;record.pose=pose;record.casualtyPhase='settled';continue;}
      record.settledTransform=null;
      object.position.set(...pose.position);
      if(type==='actor'&&!spec.launcher||type==='prop'&&!['rope','projectile','map','roof-edge'].includes(spec.kind))object.position.y+=world.sampleHeight?.(object.position.x,object.position.z)||0;
      object.rotation.set(pose.pitch || 0, pose.yaw || 0, pose.roll || 0, 'YXZ');if(spec.trajectory){const d=new THREE.Vector3(...spec.trajectory.to).sub(new THREE.Vector3(...spec.trajectory.from)).normalize();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d);}
      if (playerAction?.active && playerAction.id === 'cockpit-control' && type === 'aircraft' && !spec.crashed) { object.rotation.z += playerAction.tilt; object.position.y += Math.sin(ambientTime * 1.7) * .12; }
      if(playerAction?.active&&playerAction.id==='fast-rope'&&spec.id===playerAction.actor&&!playerAction.holding){pose.ropePhase='brake';pose.ropeGrip=1;}
      if (playerAction?.active && playerAction.actor === spec.id && pose.stance === 'treat' && !playerAction.holding) pose.stance = 'kneel';
      const speed = record.initialized && dt > 0 ? clamp(Math.hypot(object.position.x-record.previous.x,object.position.z-record.previous.z)/dt,0,5):0;
      if(type==='actor'&&(spec.launcher||spec.ropeActor))object.userData.supportElevation=object.position.y;
      if(spec.ropeActor)object.userData.weaponDropped=Boolean(pose.ropePhase||pose.ropeGrip>0||pose.injured>0);
      if (type === 'actor' && object.visible) object.userData.animate?.(speed, dt, { stance: pose.stance || 'stand', gesture: pose.gesture, aimTarget: pose.aimTarget, talk: pose.talk || 0, alert: pose.alert ?? .4, reload: pose.reload || 0, dead: pose.dead || 0, hit: pose.hit || 0, carry: pose.carry || 0,ropePhase:pose.ropePhase,ropeGrip:pose.ropeGrip,ropeTarget:pose.ropeTarget,landing:pose.landing||0,injured:pose.injured||0,injuryPhase:pose.injuryPhase,treatmentTarget:pose.treatmentTarget });
      if(spec.casualty&&pose.dead>0){const fall=casualtyPose(pose.dead,spec.casualty);object.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(fall.axis.x,0,fall.axis.z),fall.angle)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),fall.roll));object.userData.animate?.(0,0,{stance:fall.kneel>.5?'kneel':'stand',dead:fall.collapse,deadSide:spec.casualty.side,handRelease:fall.release,alert:0});placeActorOnSurface(object,world.sampleHeight?.(object.position.x,object.position.z)||0);record.casualtyPhase=fall.phase;if(pose.dead===1)record.settledTransform={position:[...pose.position],yaw:pose.yaw||0,pitch:pose.pitch||0,roll:pose.roll||0};}
      if (record.radio && object.visible) animateShoulderRadio(record, objectTime);if(record.launcher&&object.visible)animateLauncher(record);
      for (const panel of object.userData.foldPanels || []) panel.object.rotation.z = panel.side * (1 - (pose.unfold || 0)) * 1.38;
      if (type === 'aircraft') { const rotor = pose.rotor ?? (spec.crashed ? 0 : 1); if (object.userData.rotor) object.userData.rotor.rotation.y += dt * 27 * rotor; if (object.userData.tailRotor&&!object.userData.cinematicDamage?.tailRotorDisabled) object.userData.tailRotor.rotation.x += dt * 81 * rotor; }
      if (spec.kind === 'vehicle') object.userData.updateVehicleMotion?.(pose.speed ?? speed, pose.steer || 0, objectTime);
      record.previous.copy(object.position); record.initialized = true; record.pose = pose;
    }
    for (const record of objects.values()) if (record.spec.crew) updateCrew(record, dt);
    if (plan.chapterId === 9 && plan.phase === 'opening') for (const [object, visible] of hidden) if (object.userData.chapterPropKind === 'cockpit') object.visible = visible && time >= 13.2;
    root.updateMatrixWorld(true);
  }
  function updateCamera() {
    const shot = sampleResolvedTrack(cameraTrack,time); camera.position.set(...shot.position);
    look.set(...(shot.lookAt || plan.anchor));
    if (shot.convoyView && plan.convoy) {
      const frame = convoyCameraPose(convoys.get(plan.convoy.groupId), time, plan.convoy.count);
      camera.position.set(...frame.from); look.set(...frame.to);
    }
    const follow = objects.get(shot.follow)?.object;
    if (follow) { follow.localToWorld(camera.position); look.set(...(shot.lookOffset || [0, 1.8, 20])); follow.localToWorld(look); }
    if ((playerAction?.active||playerAction?.id==='fast-rope'&&playerAction.completed&&ambientTime-playerAction.completedAt<1.25) && playerAction.actor && !(playerAction.id==='fast-rope'&&time>=8.2&&time<=10.5)) {
      const performer = objects.get(playerAction.actor)?.object;
      if (performer) {
        const p = performer.position;
        if (playerAction.id === 'fast-rope') { const y=plan.insertion.yaw,c=Math.cos(y),s=Math.sin(y);camera.position.set(p.x-.65*c-1.6*s,p.y+1.45,p.z+.65*s-1.6*c);look.set(p.x+1.4*c+2.3*s,p.y-.65,p.z-1.4*s+2.3*c);shot.fov=69; }
        else if (playerAction.id === 'foot-withdrawal') { camera.position.set(p.x + .48, p.y + 1.75, p.z + 2.5); look.set(p.x, p.y + 1.2, p.z - 7); }
        else { const yaw = performer.rotation.y; camera.position.set(p.x - Math.sin(yaw) * 1.35 + Math.cos(yaw) * .5, p.y + 1.5, p.z - Math.cos(yaw) * 1.35 - Math.sin(yaw) * .5); look.set(playerAction.id === 'carry-crew' ? p.x + .8 : plan.anchor[0], .65, playerAction.id === 'carry-crew' ? p.z - .4 : plan.anchor[2] - .4); }
      }
    }
    camera.lookAt(look); if (shot.roll) camera.rotateZ(shot.roll);
    if (playerAction?.active) { camera.rotateY(-lookYaw); camera.rotateX(-lookPitch); }
    const impact = [...ledger].reverse().find(e => ['aircraft-hit', 'aircraft-impact'].includes(e.type));
    if (impact && time - impact.time < .65) { const amount = (1 - (time - impact.time) / .65) * .035 * (playerAction?.id === 'cockpit-control' ? 1 - playerAction.stability * .65 : 1); camera.rotateX(Math.sin(ambientTime * 49) * amount); camera.rotateZ(Math.sin(ambientTime * 33) * amount * .65); }
    if (camera.fov !== (shot.fov || 54)) { camera.fov = shot.fov || 54; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true); cameraRight.set(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  }
  function updateAudio(dt) {
    camera.getWorldPosition(cameraWorld); let nearest = null, nearestDistance = Infinity;
    for (const r of objects.values()) if (r.type === 'aircraft' && r.object.visible && !r.spec.crashed) { const d = r.object.position.distanceTo(cameraWorld); if (d < nearestDistance) { nearestDistance = d; nearest = r.object; } }
    const pan = nearest ? temp.copy(nearest.position).sub(cameraWorld).normalize().dot(cameraRight) : 0;
    audio?.updateAircraft?.(nearest ? nearestDistance : 500, pan, Boolean(nearest), dt);
  }
  function start(options) {
    if (disposed) throw new Error('The cinematic director has been disposed.');
    cancel(); plan = buildCinematicPlan({...options,sceneState:world.getSceneState?.(),groundHeight:world.sampleHeight});cameraTrack=resolveCinematicTrack(plan.cameras); time = ambientTime = cursor = 0; ledger.length = 0; paused = false;
    interactive = options.interactive !== false; input = {}; lookYaw = lookPitch = 0;
    playerAction = interactive && plan.playerAction ? { ...plan.playerAction, active: false, completed: false, started: false, progress: 0, holding: false, stability: 0, tilt: .32, lastReport: -1 } : null;
    savedCamera = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
    ambientBefore = world.setAmbientAircraftEnabled?.(false) ?? true;
    const hiddenProps = (world.getCinematicOcclusions?.() || []).filter(object => ['wreck', 'aircraft', 'vehicle'].includes(object.userData.chapterPropKind) || plan.chapterId === 9 && plan.phase === 'opening' && object.userData.chapterPropKind === 'cockpit');
    for (const entry of [...(options.actors || []), ...hiddenProps]) { const object = entry?.isObject3D ? entry : entry?.obj || entry?.object; if (object?.isObject3D && !hidden.has(object)) { hidden.set(object, object.visible); object.visible = false; } }
    root = new THREE.Group(); root.name = `narrative:${plan.id}`; scene.add(root);
    try {
      if (plan.convoy) convoys.set(plan.convoy.groupId, createConvoyMotion(plan.convoy.config));
      effects = createCinematicEffects(root,{mood:plan.mood,groundHeight:world.sampleHeight});
      if (plan.convoy && plan.mood === 'night') {
        // A restrained moon/sky bounce keeps silhouettes legible between the
        // headlamp pools. These lights exist only during the convoy sequence.
        const sky = new THREE.HemisphereLight('#8da8c5', '#1b2228', .42);
        const moon = new THREE.DirectionalLight('#8aa6c5', .62);
        moon.position.set(-26, 34, 18); root.add(sky, moon);
      }
      for (const spec of plan.actors) { register(world.createActor(spec.kind, [spec.keys[0].position[0], spec.keys[0].position[2]], spec.id, {civilian:plan.chapterId===1,...(spec.launcher?{weaponId:'rpg7',elevation:spec.keys[0].position[1]}:{}),...(spec.ropeActor?{elevation:spec.keys[0].position[1]}:{})}), spec, 'actor'); prepareShoulderRadio(objects.get(spec.id));prepareLauncher(objects.get(spec.id)); }
      for (const spec of plan.props) {
        const localProp = ['rope', 'projectile', 'map', 'parcel', 'stretcher', 'covered-stretcher','roof-edge'].includes(spec.kind);
        const object = register(localProp ? primitive(spec) : world.createProp(spec.kind, [spec.keys[0].position[0], spec.keys[0].position[2]], spec.kind === 'vehicle' ? { type: spec.vehicleType || 'humvee', variant: spec.variant || 'olive', occupied: spec.convoy ? spec.convoy.index > 2 : true } : undefined), spec, 'prop', !localProp);
        if (spec.kind === 'vehicle' && plan.mood === 'night') {
          // One shadowless broad beam represents each pair of headlamps, so
          // following cars illuminate the car ahead without 24 spotlights.
          const front = (object.userData.dimensions?.length || 4.84) / 2 + .06;
          const lamp = new THREE.SpotLight('#ffe0aa', 220, 31, .62, .76, 2), target = new THREE.Object3D();
          lamp.position.set(0, 1.02, front); target.position.set(0, .24, front + 14); object.add(lamp, target); lamp.target = target;
          if (!spec.convoy || spec.convoy.index < 2) { const bounce = new THREE.PointLight('#d3b37b', 5, 7, 2); bounce.position.set(0, .8, front); object.add(bounce); }
        }
      }
      for (const spec of plan.aircraft) register(world.createAircraft(Boolean(spec.crashed), { managed: false }), spec, 'aircraft');
      for (const record of objects.values()) if (record.spec.crew) prepareCrew(record);
      running = true; updateObjects(0); updateCamera(); while (cursor < plan.events.length && plan.events[cursor].at <= 0) emit(plan.events[cursor++]);
      onEvent({ type: 'cinematic-start', sequenceId: plan.id, chapterId: plan.chapterId, phase: plan.phase, time: 0 });
      return { sequenceId: plan.id, duration: plan.duration };
    } catch (error) { running = false; cleanup(); throw error; }
  }
  function actionTime(dt, desiredTime) {
    if (!playerAction || playerAction.completed || desiredTime < playerAction.start) return desiredTime;
    const a = playerAction;
    if (!a.started) {
      a.started = a.active = true;
      emit({ at: a.start, type: 'player-action-start', action: a.id, prompt: a.prompt });
    }
    const actionDt = Math.max(0, dt - Math.max(0, a.start - time));
    a.holding = a.kind === 'hold' ? Boolean(input.held) : a.kind === 'walk' ? Boolean(input.forward || input.back) : Boolean(input.left || input.right);
    if (a.kind === 'walk') {
      a.progress = clamp(a.progress + ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) * actionDt / a.seconds);
    } else if (a.kind === 'stabilize') {
      const correction = (input.right ? 1 : 0) - (input.left ? 1 : 0), before = Math.abs(a.tilt);
      a.tilt = clamp(a.tilt + (Math.sin(ambientTime * 1.6) * .15 + .10) * actionDt - correction * actionDt * .62, -.5, .5);
      a.stability = 1 - clamp(Math.abs(a.tilt) / .5);
      const correct = Math.abs(a.tilt) <= before || Math.abs(a.tilt) < .13;
      if (correction) a.progress = clamp(a.progress + actionDt / a.seconds * (correct ? 1 : .3));
      a.prompt = Math.abs(a.tilt) < .13 ? '机身暂时稳住 · A / D 小幅修正；仍在失去高度' : a.tilt > 0 ? '机身向左倾 · 按 D 向右压杆' : '机身向右倾 · 按 A 向左压杆';
    } else if (input.held) a.progress = clamp(a.progress + actionDt / a.seconds);
    if (ambientTime - a.lastReport >= .2 && (Math.abs(a.progress - (a.reportedProgress ?? 0)) >= .01 || a.holding !== Boolean(a.reportedHolding))) {
      a.lastReport = ambientTime; a.reportedProgress = a.progress; a.reportedHolding = a.holding;
      emit({ at: Math.max(a.start, time), type: 'player-action-progress', action: a.id, progress: a.progress, stability: a.stability, holding: a.holding });
    }
    if (a.progress >= 1) {
      a.active = false; a.completed = true; a.holding = false;a.completedAt=ambientTime;
      emit({ at: a.end, type: 'player-action-completed', action: a.id, progress: 1 });
    }
    if(a.id==='fast-rope')return Math.min(desiredTime,plan.duration-(a.completed?0:.001));
    return a.start + (a.end - a.start) * a.progress;
  }
  function setInput(next = {}) {
    input = Object.fromEntries(['forward', 'back', 'left', 'right', 'held'].map(name => [name, Boolean(next[name])]));
    if (running && !paused && playerAction?.active) {
      lookYaw = clamp(lookYaw + (Number.isFinite(next.lookX) ? next.lookX : 0), -.6, .6);
      lookPitch = clamp(lookPitch + (Number.isFinite(next.lookY) ? next.lookY : 0), -.42, .42);
    }
  }
  function update(dt) {
    if (!running || paused || !Number.isFinite(dt) || dt <= 0) return;
    // Advance through each cue at its exact transform before advancing to this
    // frame. A slow frame cannot move the hit flash to the final crashed pose.
    const before = time, ambientBeforeFrame = ambientTime;
    const end = Math.min(plan.duration, actionTime(dt, time + dt));
    while (cursor < plan.events.length && plan.events[cursor].at <= end) {
      const event = plan.events[cursor++]; time = event.at;
      ambientTime = ambientBeforeFrame + dt * clamp((time - before) / Math.max(.0001, end - before));
      updateObjects(0); updateCamera(); emit(event);
    }
    time = end; ambientTime = ambientBeforeFrame + dt; updateObjects(dt); updateCamera();
    const trailPositions = [...trails].flatMap(id => { const obj = objects.get(id)?.object; return obj?.visible ? [obj.localToWorld(new THREE.Vector3(.36, 3.85, -9.79)).toArray()] : []; });
    const projectilePositions=[...objects.values()].filter(r=>r.spec.kind==='projectile'&&r.object.visible).map(r=>r.object.position.toArray());effects.update(dt,camera,{trailPositions,projectilePositions}); for (const fire of fires) fire.update(dt, ambientTime, camera); updateAudio(dt);
    if(time>=plan.duration&&!(playerAction?.id==='fast-rope'&&(!playerAction.completed||ambientTime-playerAction.completedAt<3.2)))finish(false);
  }
  function cancel() { if (!root && !running) return false; running = false; paused = false; cleanup(); return true; }
  function inspect() {
    const action = playerAction ? { id: playerAction.id, label: playerAction.label, prompt: playerAction.prompt, active: playerAction.active, completed: playerAction.completed, progress: playerAction.progress, holding: playerAction.holding, canReverse: Boolean(playerAction.canReverse), stability: playerAction.stability, tilt: playerAction.tilt, awaitingInput: playerAction.active && !playerAction.holding, position: objects.get(playerAction.actor)?.object.position.toArray() || null } : null;
    return { active: running, paused, interactive, playerAction: action, ambientTime, sequenceId: plan?.id || null, chapterId: plan?.chapterId || null, phase: plan?.phase || null,rooftop:plan?.rooftop||null,insertion:plan?.insertion||null, time, duration: plan?.duration || 0, stage: plan?.stages.filter(s => s.at <= time).at(-1)?.name || null,
      camera: { position: camera.position.toArray(), fov: camera.fov }, events: ledger.map(e => ({ ...e })),
      aircraft: [...objects.values()].filter(r => r.type === 'aircraft').map(r => ({ id: r.spec.id, position: r.object.position.toArray(), altitude: r.object.position.y, yaw: r.object.rotation.y, roll: r.object.rotation.z, pitch: r.object.rotation.x, rotor: r.object.userData.rotor?.rotation.y || 0, visible: r.object.visible, crashed: Boolean(r.spec.crashed),damage:r.object.userData.cinematicDamage||null })),
      projectiles:[...objects.values()].filter(r=>r.spec.kind==='projectile').map(r=>({id:r.spec.id,position:r.object.position.toArray(),visible:r.object.visible,trajectory:r.spec.trajectory})),
      convoy: plan?.convoy ? { formation: plan.convoy.formation, visibleSubset: plan.convoy.visibleSubset, vehicles: [...objects.values()].filter(r => r.spec.convoy).map(r => ({ id: r.spec.id, type: r.spec.vehicleType, position: r.object.position.toArray(), yaw: r.object.rotation.y, speed: r.pose?.speed || 0, steer: r.pose?.steer || 0, distance: r.pose?.distance, offset: r.pose?.offset, length: r.pose?.length })), crew: [...objects.values()].filter(r => r.spec.crew).map(r => ({ id: r.spec.id, role: r.spec.crew.role, vehicle: r.spec.crew.vehicle, visible: r.object.visible, position: r.object.position.toArray() })) } : null,
      actors: [...objects.values()].filter(r => r.type === 'actor').map(r => ({ id: r.spec.id, kind: r.spec.kind, position: r.object.position.toArray(), visible: r.object.visible, stance: r.pose?.stance || 'stand', gesture: r.pose?.gesture || null, carry: r.pose?.carry || 0, yaw: r.object.rotation.y, reload: r.pose?.reload || 0, dead: r.pose?.dead || 0,weaponVisible:r.object.userData.carriedWeapon?.visible??null,weaponDropped:Boolean(r.object.userData.weaponDropped),casualtyPhase:r.casualtyPhase||null, radio: r.radio?.weight || 0,ropePhase:r.pose?.ropePhase||null,ropeGrip:r.pose?.ropeGrip??0,landing:r.pose?.landing||0,injured:r.pose?.injured||0,injuryPhase:r.pose?.injuryPhase||null,treatmentTarget:r.pose?.treatmentTarget||null,pose:r.object.userData.getPoseState?.()||null,launcher:r.launcher?{visible:r.launcher.object.visible,actualModel:r.launcher.actual,muzzle:r.launcher.object.localToWorld(new THREE.Vector3(...r.launcher.muzzle)).toArray(),gripErrors:r.launcher.limbs.map(l=>({side:l.side,error:l.hand.getWorldPosition(new THREE.Vector3()).distanceTo(r.launcher.object.localToWorld(new THREE.Vector3(...r.launcher.grips[l.side.toLowerCase()])))}))}:null })),
      owned: { objects: objects.size, worldObjects: worldOwned.size, fires: fires.length, geometries: localGeometries.size, materials: localMaterials.size }, particles: effects?.inspect() || { clouds: 0, cloudCapacity: 128, debris: 0, debrisCapacity: 32, trails: 0 } };
  }
  return { start, update, setInput, cancel, skip: () => finish(true), pause: () => { if (running) paused = true; setInput({}); }, resume: () => { if (running) paused = false; }, inspect, get active() { return running; }, dispose() { if (disposed) return; cancel(); disposed = true; } };
}
