import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

let mountedHands = null, mountedHandsLoading = null;
export async function prepareMountedHands(source = (import.meta.env?.BASE_URL || './') + 'assets/mounted-makehuman-hands.glb') {
  if (mountedHands) return mountedHands;
  if (!mountedHandsLoading) mountedHandsLoading = (async () => {
    const loader = new GLTFLoader();
    const asset = source instanceof ArrayBuffer ? await loader.parseAsync(source, '') : await loader.loadAsync(source);
    asset.scene.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.name === 'MakeHuman_Mounted_Complete_Hands') mountedHands = mesh; });
    if (!mountedHands?.geometry.attributes.skinIndex || !mountedHands.geometry.attributes.uv) throw new Error('Complete MakeHuman hand asset is missing its skin or UV data.');
    return mountedHands;
  })().catch(error => { mountedHandsLoading = null; throw error; });
  return mountedHandsLoading;
}

function restoreCompleteHands(actor) {
  if (!mountedHands) throw new Error('prepareMountedHands() must finish before mounting the gun.');
  let skin; actor.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.name === 'MakeHuman_soldier_body') skin = mesh; });
  if (!skin) throw new Error('The player has no compatible MakeHuman body skin.');
  const source = mountedHands, geometry = source.geometry.clone(), joints = geometry.attributes.skinIndex;
  const names = new Map(skin.skeleton.bones.map((b, i) => [normalizedName(b.name), i]));
  const remap = source.skeleton.bones.map((bone, i) => {
    const target = names.get(normalizedName(bone.name));
    if (target == null) throw new Error('Missing mounted-hand bone: ' + bone.name);
    const delta = source.skeleton.boneInverses[i].elements.reduce((max, v, k) => Math.max(max, Math.abs(v - skin.skeleton.boneInverses[target].elements[k])), 0);
    if (delta > 1e-5) throw new Error('Mounted-hand inverse bind differs for ' + bone.name);
    return target;
  });
  for (let i = 0; i < joints.count; i++) for (let k = 0; k < 4; k++) joints.setComponent(i, k, remap[joints.getComponent(i, k)]);
  joints.needsUpdate = true;
  if (!source.bindMatrix.equals(skin.bindMatrix) || !source.matrix.equals(skin.matrix)) throw new Error('Mounted-hand mesh coordinates do not match the soldier.');
  if (!skin.userData.sharedGeometry) skin.geometry.dispose();
  skin.geometry = geometry; skin.userData.sharedGeometry = false; skin.userData.actorGeometry = true; skin.userData.completeMountedHands = true;
  return { restoredHandVertices: geometry.attributes.position.count, restoredHandTriangles: (geometry.index?.count || geometry.attributes.position.count) / 3, restoredHandBones: remap.length };
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp;
const worldPoint = object => object.getWorldPosition(V());
const normalizedName = name => name.replace(/:/g, '').replace(/_\d+$/, '');
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function operationFrame(component, forward, across, palm, bend, tip) {
  forward = V(...forward).normalize(); across = V(...across).addScaledVector(forward, -V(...across).dot(forward)).normalize();
  return { component, basis: Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, across, forward.clone().cross(across))), palm: V(...palm), bend: V(...bend).normalize(), tip };
}

// Each held pose is expressed against a rendered part, so raising the cover or
// pulling the charging knob moves the target with the object being held.
function handOperation(limb, parts, progress) {
  const sign = limb.sign;
  const frames = {
    spade: operationFrame(parts.spade, [-sign * .93, -.12, .34], [0, 1, 0], [0, 0, -.026], [0, 0, 1],
      (thumb, i) => thumb ? V(-sign * .013, .052, -.006) : V(-sign * .012, .035 - i * .022, .024)),
    cover: operationFrame(parts.cover, [0, 0, 1], [-1, 0, 0], [0, .018, -.002], [0, -1, 0],
      (thumb, i) => thumb ? V(-.050, .009, -.018) : V(-.035 + i * .023, -.014, .006)),
    belt: operationFrame(parts.belt, [0, 0, 1], [-1, 0, 0], [0, .014, -.018], [0, -1, 0],
      (thumb, i) => thumb ? V(-.055, .008, -.016) : V(-.030 + i * .019, -.010, .018)),
    charging: operationFrame(parts.charging, [0, -1, 0], [0, 0, 1], [.022, 0, 0], [-1, 0, 0],
      (thumb, i) => thumb ? V(.013, .030, .025) : V(-.018, 0, .028 - i * .019)),
  };
  // Roll around the transverse latch while lifting it. Copying the cover's
  // rotation directly would put the wrist above the open cover and demand an
  // impossible arm extension; the wrist stays below the raised grip.
  const coverRoll = Q().setFromAxisAngle(V(1, 0, 0), -2 * parts.cover.parent.rotation.x);
  frames.cover.basis.premultiply(coverRoll); frames.cover.palm.applyQuaternion(coverRoll); frames.cover.bend.applyQuaternion(coverRoll);
  const coverTip = frames.cover.tip; frames.cover.tip = (thumb, i) => coverTip(thumb, i).applyQuaternion(coverRoll);
  let from = 'spade', to = 'spade', blend = 0;
  const stages = (parts.profile?.kind==='dshk'?limb.side==='Left':sign<0) ? [
    [0, .045, 'spade', 'spade'], [.045, .10, 'spade', 'cover'], [.10, .235, 'cover', 'cover'],
    [.235, .33, 'cover', 'belt'], [.33, .64, 'belt', 'belt'], [.64, .70, 'belt', 'cover'],
    [.70, .83, 'cover', 'cover'], [.83, .98, 'cover', 'spade'], [.98, 1, 'spade', 'spade'],
  ] : [[0, .78, 'spade', 'spade'], [.78, .82, 'spade', 'charging'], [.82, .93, 'charging', 'charging'], [.93, .995, 'charging', 'spade'], [.995, 1, 'spade', 'spade']];
  if (progress > 0 && progress < 1) {
    const stage = stages.find(s => progress <= s[1]);
    from = stage[2]; to = stage[3]; blend = smooth((progress - stage[0]) / (stage[1] - stage[0]));
  }
  const a = frames[from], b = frames[to], travelling = from !== to;
  const worldQ = f => f.component.getWorldQuaternion(Q());
  const handQ = worldQ(a).multiply(a.basis).multiply(limb.sourceBasis.clone().invert());
  handQ.slerp(worldQ(b).multiply(b.basis).multiply(limb.sourceBasis.clone().invert()), blend);
  const contact = a.component.localToWorld(a.palm.clone()).lerp(b.component.localToWorld(b.palm.clone()), blend);
  if (travelling) contact.addScaledVector(V(0, 1, 0).applyQuaternion(parts.gun.getWorldQuaternion(Q())), Math.sin(blend * Math.PI) * .12);
  const grasp = travelling ? .08 + .92 * ((1 - smooth(blend / .20)) + smooth((blend - .80) / .20)) : 1;
  return { handQ, contact, grasp, role: travelling ? 'reach' : from, component: travelling ? null : a.component,
    from: a.component.name, to: b.component.name, bend: a.bend.clone().applyQuaternion(worldQ(a)).lerp(b.bend.clone().applyQuaternion(worldQ(b)), blend).normalize(),
    target: (thumb, i) => a.component.localToWorld(a.tip(thumb, i)).lerp(b.component.localToWorld(b.tip(thumb, i)), blend) };
}

function aimBone(bone, child, target) {
  const origin = worldPoint(bone), from = worldPoint(child).sub(origin), to = target.clone().sub(origin);
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  const turn = Q().setFromUnitVectors(from.normalize(), to.normalize());
  const desired = bone.getWorldQuaternion(Q()).premultiply(turn);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(desired));
  bone.updateWorldMatrix(false, true);
}

function solveArm(arm, elbow, wrist, target, pole) {
  const origin = worldPoint(arm), joint = worldPoint(elbow), hand = worldPoint(wrist);
  const upper = origin.distanceTo(joint), lower = joint.distanceTo(hand);
  const axis = target.clone().sub(origin), requested = axis.length();
  const distance = clamp(requested, Math.abs(upper - lower) + .00001, (upper + lower) * .9998);
  axis.normalize();
  const bend = pole.clone().sub(origin).addScaledVector(axis, -pole.clone().sub(origin).dot(axis));
  if (bend.lengthSq() < 1e-10) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
  bend.normalize();
  const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const middle = origin.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  aimBone(arm, elbow, middle);
  aimBone(elbow, wrist, origin.clone().addScaledVector(axis, distance));
  return Math.abs(requested - distance);
}

// Close only the new shoulder cut exposed when the full torso is removed.
// Original garment openings and the recovered palm topology are untouched.
function closeSleeveCuts(geometry, original, kept) {
  const p = geometry.attributes.position, canonical = new Map(), ids = [];
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (!canonical.has(key)) canonical.set(key, i); ids[i] = canonical.get(key);
  }
  const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  const edges = list => { const map = new Map(); for (let i = 0; i < list.length; i += 3) for (const [a, b] of [[list[i], list[i+1]], [list[i+1], list[i+2]], [list[i+2], list[i]]]) {
    const key = edgeKey(ids[a], ids[b]); const value = map.get(key); if (value) value.count++; else map.set(key, { a, b, count: 1 });
  } return map; };
  const all = edges(original), selected = edges(kept), open = [...selected].filter(([key, e]) => e.count === 1 && all.get(key)?.count === 2).map(([,e]) => e);
  const chains = [], remaining = new Set(open);
  while (remaining.size) {
    const start = remaining.values().next().value, chain = [start.a, start.b]; remaining.delete(start);
    let end = ids[start.b];
    while (end !== ids[start.a]) { const next = [...remaining].find(e => ids[e.a] === end); if (!next) break; remaining.delete(next); chain.push(next.b); end = ids[next.b]; }
    if (end === ids[start.a] && chain.length > 3) chains.push(chain.slice(0,-1));
  }
  if (!chains.length) return 0;
  const arrays = Object.fromEntries(Object.entries(geometry.attributes).map(([key, attr]) => [key, Array.from(attr.array)]));
  const index = [...kept]; let vertices = p.count, triangles = 0;
  for (const chain of chains) {
    const center = V(); const influence = new Map();
    for (const v of chain) { center.add(V().fromBufferAttribute(p,v)); for (let k=0;k<4;k++) { const joint=geometry.attributes.skinIndex.getComponent(v,k); influence.set(joint,(influence.get(joint)||0)+geometry.attributes.skinWeight.getComponent(v,k)/chain.length); } }
    center.divideScalar(chain.length);
    const weight = [...influence].sort((a,b)=>b[1]-a[1]).slice(0,4), total=weight.reduce((n,e)=>n+e[1],0);
    while(weight.length<4)weight.push([0,0]);
    for (let i=0;i<chain.length;i++) {
      const a=chain[(i+1)%chain.length],b=chain[i],normal=V().fromBufferAttribute(p,b).sub(V().fromBufferAttribute(p,a)).cross(center.clone().sub(V().fromBufferAttribute(p,a))).normalize();
      for(const v of [a,b,null])for(const [key,attr]of Object.entries(geometry.attributes)) {
        if(key==='normal'){arrays[key].push(normal.x,normal.y,normal.z);continue;}
        if(v!==null){for(let k=0;k<attr.itemSize;k++)arrays[key].push(attr.getComponent(v,k));continue;}
        if(key==='position')arrays[key].push(center.x,center.y,center.z);
        else if(key==='skinIndex')arrays[key].push(...weight.map(e=>e[0]));
        else if(key==='skinWeight')arrays[key].push(...weight.map(e=>e[1]/total));
        else for(let k=0;k<attr.itemSize;k++)arrays[key].push(chain.reduce((n,v)=>n+attr.getComponent(v,k),0)/chain.length);
      }
      index.push(vertices,vertices+1,vertices+2);vertices+=3;triangles++;
    }
  }
  for(const[key,attr]of Object.entries(geometry.attributes))geometry.setAttribute(key,new THREE.BufferAttribute(new attr.array.constructor(arrays[key]),attr.itemSize,attr.normalized));
  geometry.setIndex(index);geometry.setDrawRange(0,index.length);geometry.userData.mountedSleeveCapStart=kept.length;return triangles;
}

// MakeHuman's head, torso and hands share primitives. Keep the existing arm
// triangles on a private index, rather than drawing the backpack/neck in a
// camera behind the standing gunner. The source skin and weights stay intact.
function prepareFirstPersonArms(actor, armBones) {
  let removedTriangles = 0, ownedGeometry = 0, hiddenMeshes = 0, cappedSleeveTriangles = 0;
  actor.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!mesh.isSkinnedMesh) {
      for (let p = mesh.parent; p && p !== actor; p = p.parent) if (armBones.has(p)) return;
      mesh.visible = false; hiddenMeshes++; return;
    }
    if (mesh.userData.completeMountedHands) return;
    const g = mesh.geometry, joints = g.attributes.skinIndex, weights = g.attributes.skinWeight;
    if (!joints || !weights || !mesh.skeleton) return;
    const included = new Set(mesh.skeleton.bones.flatMap((b, i) => armBones.has(b) ? [i] : []));
    const armWeight = i => {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (included.has(joints.getComponent(i, k))) weight += weights.getComponent(i, k);
      return weight;
    };
    const original = g.index, count = original?.count || g.attributes.position.count, kept = [];
    for (let i = 0; i < count; i += 3) {
      const tri = [0, 1, 2].map(j => original ? original.getX(i + j) : i + j);
      if (tri.reduce((n, id) => n + armWeight(id), 0) / 3 < .40) removedTriangles++;
      else kept.push(...tri);
    }
    if (kept.length === count) return;
    if (!kept.length) { mesh.visible = false; hiddenMeshes++; return; }
    const filtered = g.clone(); filtered.clearGroups(); filtered.setIndex(kept);
    filtered.setDrawRange(0, kept.length);
    cappedSleeveTriangles += closeSleeveCuts(filtered, original ? Array.from(original.array) : Array.from({length: count}, (_,i) => i), kept);
    mesh.geometry = filtered;
    mesh.userData.sharedGeometry = false; mesh.userData.actorGeometry = true;
    ownedGeometry++;
  });
  return { removedTriangles, ownedGeometry, hiddenMeshes, cappedSleeveTriangles };
}

export function createMountedGunnerPose({ world, vehicle }) {
  const turret = vehicle?.userData?.turret,profile=vehicle?.userData?.mountedPoseProfile;
  if (!world?.createActor || !world?.destroyActor || !turret?.yaw || !turret?.pitch) throw new TypeError('Mounted gunner requires an actor factory and a yaw/pitch turret.');
  const operationParts = { gun: turret.pitch, cover: turret.pitch.getObjectByName('MountedCoverLatch'), belt: turret.pitch.getObjectByName('MountedBeltSegment'), charging: turret.pitch.getObjectByName('MountedChargingGrip') };
  const spades = ['Left', 'Right'].map(side => turret.pitch.getObjectByName('MountedSpadeGrip' + side));
  if (Object.values(operationParts).some(p => !p) || spades.some(p => !p)) throw new Error('Mounted gunner requires the rendered cover latch, belt, charging knob and spade grips.');
  const actor = world.createActor('soldier', [0, 0], '玩家 · 车载机枪位');
  actor.userData.mountedPlayer = true;
  actor.userData.animate?.(0, 0, { stance: 'stand', alert: .8, aimPitch: 0 });
  const bones = new Map(), skeletons = new Set();
  actor.traverse(o => { if (o.isBone) bones.set(normalizedName(o.name), o); if (o.skeleton) skeletons.add(o.skeleton); });
  const bone = name => bones.get('mixamorig' + name);
  const hips = bone('Hips'), head = bone('Head');
  const limbs = ['Left', 'Right'].map(side => ({ side, sign: side === 'Left' ? 1 : -1, arm: bone(side + 'Arm'), elbow: bone(side + 'ForeArm'), hand: bone(side + 'Hand'), middle: bone(side + 'HandMiddle1'), index: bone(side + 'HandIndex1'), pinky: bone(side + 'HandPinky1') }));
  if (!hips || limbs.some(l => !l.arm || !l.elbow || !l.hand || !l.middle || !l.index || !l.pinky)) {
    world.destroyActor(actor); throw new Error('Mounted gunner requires the existing MakeHuman Mixamo arm and hand bones.');
  }
  const armBones = new Set(); for (const limb of limbs) limb.arm.traverse(o => { if (o.isBone) armBones.add(o); });
  const restoredHands = restoreCompleteHands(actor);
  const visibility = { ...prepareFirstPersonArms(actor, armBones), ...restoredHands };
  const rifles = [];
  actor.traverse(o => { if (o.userData.grips) { o.visible = false; rifles.push(o); } });
  const originalCrewVisible = turret.crew?.visible;
  if (turret.crew) turret.crew.visible = false;
  const anchor = vehicle.userData.crewAnchors?.find(a => a.role === 'gunner')?.position || [0, 1.58, -.55];
  vehicle.updateWorldMatrix(true, true);
  // The standing player uses the raised firing step inside the hatch. The
  // distant seated crew anchor otherwise puts their eyes below the receiver
  // and makes a real raised cover unreachable without stretching the arms.
  const anchorInParent = turret.yaw.parent.worldToLocal(vehicle.localToWorld(new THREE.Vector3(...anchor).add(V(0, .20, 0))));
  // The AI may already have turned the ring before the player mounts it. Keep
  // this offset in the ring's neutral frame instead of baking that yaw in.
  const hipInYaw = profile?.hipInYaw?V(...profile.hipInYaw):anchorInParent.sub(turret.yaw.position);
  const targeted = new Set(limbs.flatMap(l => [l.arm, l.elbow, l.hand]));

  // Recover open finger rotations from the same exported inverse bind matrices.
  // This avoids stacking a second curl onto world.createActor's rifle grip.
  const bindRotations = new Map();
  for (const skeleton of skeletons) skeleton.bones.forEach((b, i) => {
    const pi = skeleton.bones.indexOf(b.parent);
    if (pi < 0) return;
    const local = skeleton.boneInverses[pi].clone().multiply(skeleton.boneInverses[i].clone().invert());
    const q = Q(); local.decompose(V(), q, V()); bindRotations.set(b, q);
  });
  for (const l of limbs) {
    l.fingers = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].map(name => {
      const chain = [1, 2, 3].map(n => bone(l.side + 'Hand' + name + n));
      return chain.every(Boolean) ? { name, chain } : null;
    }).filter(Boolean);
    for (const f of l.fingers) for (const b of f.chain) { targeted.add(b); if (bindRotations.has(b)) b.quaternion.copy(bindRotations.get(b)); }
  }
  actor.updateWorldMatrix(true, true);
  const rest = new Map([...targeted].map(b => [b, b.quaternion.clone()]));
  for (const l of limbs) {
    const handQ = l.hand.getWorldQuaternion(Q()), inverse = handQ.clone().invert();
    const forward = worldPoint(l.middle).sub(worldPoint(l.hand)).normalize();
    const across = worldPoint(l.index).sub(worldPoint(l.pinky)); across.addScaledVector(forward, -across.dot(forward)).normalize();
    const normal = forward.clone().cross(across).normalize();
    l.sourceBasis = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward.applyQuaternion(inverse), across.applyQuaternion(inverse), normal.applyQuaternion(inverse)));
    l.palmOffset = l.hand.worldToLocal(worldPoint(l.middle)).multiplyScalar(.72);
    for (const f of l.fingers) {
      const last = f.chain[2], direction = worldPoint(last).sub(worldPoint(f.chain[1]));
      f.tip = last.worldToLocal(worldPoint(last).add(direction.multiplyScalar(.68)));
    }
  }
  const beltHome=operationParts.belt.position.clone(),beltHomeQ=operationParts.belt.quaternion.clone();
  let disposed = false, last = { visible: true, gripError: Infinity, limbs: [], ...visibility };
  function update(dt = 0, reloadProgress = 0) {
    if (disposed || actor.userData.disposed) return;
    actor.visible = vehicle.visible; if (!actor.visible) return;
    const loading = reloadProgress > 0 && reloadProgress < 1;
    // The loose lead rounds rise from the ammunition box, then settle on the
    // feed tray while the feeding hand is in contact throughout the movement.
    const feed = smooth((reloadProgress - .41) / .20);
    operationParts.belt.visible = !loading || reloadProgress >= .30;
    if(profile?.kind==='dshk'){operationParts.belt.position.copy(beltHome).add(V(loading?-.08*(1-feed):0,loading?Math.sin(feed*Math.PI)*.04:0,0));operationParts.belt.quaternion.copy(beltHomeQ);operationParts.cover.parent.rotation.x=loading?-Math.min(1,Math.max(0,(reloadProgress-.1)/.12))*Math.min(1,Math.max(0,(.83-reloadProgress)/.13))*1.05:0;}else{operationParts.belt.position.set(loading ? -.19 + .115 * feed : -.075, .135 + (loading ? Math.sin(feed * Math.PI) * .045 : 0), loading ? -.015 + .030 * feed : .015);operationParts.belt.rotation.z = loading ? -.12 * Math.sin(feed * Math.PI) : 0;}
    turret.yaw.updateWorldMatrix(true, true);
    for (const [b, q] of rest) b.quaternion.copy(q);
    // The pelvis turns with the ring, not with barrel elevation. Legs/torso
    // retain their authored stance and no unrelated bone is animated here.
    const worldRotation = turret.yaw.getWorldQuaternion(Q());
    actor.quaternion.copy(actor.parent ? actor.parent.getWorldQuaternion(Q()).invert().multiply(worldRotation) : worldRotation);
    actor.position.set(0, 0, 0); actor.updateWorldMatrix(true, true);
    // Lean up into a downward-aimed gun only while its lid is raised. Leaving
    // the body permanently forward exposes the shoulder cut in the camera.
    const lean = loading ? smooth((reloadProgress - .08) / .12) * (1 - smooth((reloadProgress - .83) / .14)) * Math.max(0, turret.pitch.rotation.x) : 0;
    const profileLean=loading&&profile?.reloadLean?smooth((reloadProgress-.04)/.18)*(1-smooth((reloadProgress-.82)/.18)):0;const desiredHip=turret.yaw.localToWorld(hipInYaw.clone().add(profile?.reloadLean?V(...profile.reloadLean).multiplyScalar(profileLean):V(0,lean*.24,lean*.15)));
    const offset = desiredHip.sub(worldPoint(hips));
    if (actor.parent) {
      const origin = actor.parent.worldToLocal(worldPoint(actor));
      const endpoint = actor.parent.worldToLocal(worldPoint(actor).add(offset));
      actor.position.add(endpoint.sub(origin));
    } else actor.position.add(offset);
    actor.updateWorldMatrix(true, true);
    // The technical's original third-person pelvis puts both shoulder cuts
    // between the camera and receiver. Anchor the first-person shoulders below
    // the camera instead; preserve real limb lengths and all gun contacts.
    if (profile?.kind === 'dshk') {
      const shoulderCenter = limbs.reduce((p, l) => p.add(worldPoint(l.arm)), V()).multiplyScalar(.5);
      const desiredShoulders = turret.pitch.localToWorld(V(0, -.18, -.22));
      const shift = desiredShoulders.sub(shoulderCenter);
      if (actor.parent) {
        const origin = actor.parent.worldToLocal(worldPoint(actor));
        actor.position.add(actor.parent.worldToLocal(worldPoint(actor).add(shift)).sub(origin));
      } else actor.position.add(shift);
      actor.updateWorldMatrix(true, true);
    }
    const readings = [];
    for (const l of limbs) {
      const operation = handOperation(l, { ...operationParts, profile, spade: spades[l.side === 'Left' ? 0 : 1] }, reloadProgress);
      const handQ = operation.handQ, palmContact = operation.contact;
      const handScale = l.hand.getWorldScale(V());
      const wristTarget = palmContact.clone().sub(l.palmOffset.clone().multiply(handScale).applyQuaternion(handQ));
      const pole = profile?.kind === 'dshk'
        ? turret.pitch.localToWorld(V(l.sign * .33, -.48, -.40))
        : turret.yaw.localToWorld(hipInYaw.clone().add(V(l.sign * .43, .10, -.16)));
      const reachError = solveArm(l.arm, l.elbow, l.hand, wristTarget, pole);
      l.hand.quaternion.copy(l.hand.parent.getWorldQuaternion(Q()).invert().multiply(handQ)); l.hand.updateWorldMatrix(false, true);

      for (const [fi, f] of l.fingers.entries()) {
        const thumb = f.name === 'Thumb';
        const target = operation.target(thumb, fi);
        const bendToward = thumb && operation.role !== 'cover' ? target.clone().sub(worldPoint(f.chain[0])).normalize() : operation.bend;
        // Every hinge axis is derived in the open anatomical frame. No shared
        // local-Z assumption is made for mirrored MakeHuman finger joints.
        const axes = f.chain.map((b, j) => {
          const direction = j < 2 ? worldPoint(f.chain[j + 1]).sub(worldPoint(b)) : b.localToWorld(f.tip.clone()).sub(worldPoint(b));
          const axis = direction.normalize().cross(bendToward);
          if (axis.lengthSq() < 1e-8) axis.copy(V(0, 1, 0).applyQuaternion(handQ));
          return axis.normalize().applyQuaternion(b.getWorldQuaternion(Q()).invert());
        });
        const angles = thumb ? [.25, .45, .35] : [.7, 1.0, .65];
        const apply = j => { f.chain[j].quaternion.copy(rest.get(f.chain[j])).multiply(Q().setFromAxisAngle(axes[j], angles[j])); f.chain[j].updateWorldMatrix(false, true); };
        for (let j = 0; j < 3; j++) apply(j);
        for (let iteration = 0; iteration < 3; iteration++) for (let j = 2; j >= 0; j--) {
          const b = f.chain[j], origin = worldPoint(b), axis = axes[j].clone().applyQuaternion(b.getWorldQuaternion(Q()));
          const a = f.chain[2].localToWorld(f.tip.clone()).sub(origin), t = target.clone().sub(origin);
          a.addScaledVector(axis, -a.dot(axis)); t.addScaledVector(axis, -t.dot(axis));
          if (a.lengthSq() < 1e-10 || t.lengthSq() < 1e-10) continue;
          a.normalize(); t.normalize();
          const delta = Math.atan2(axis.dot(a.clone().cross(t)), a.dot(t));
          angles[j] = clamp(angles[j] + clamp(delta, -.4, .4), 0, thumb ? 1.25 : 1.8); apply(j);
        }
        // Fingers uncurl between contacts. The blend is applied to the solved
        // grip instead of keeping a closed fist while reaching through air.
        if (operation.grasp < 1) for (let j = 0; j < 3; j++) { angles[j] = .055 + (angles[j] - .055) * operation.grasp; apply(j); }
      }
      const palm = l.hand.localToWorld(l.palmOffset.clone());
      readings.push({ side: l.side, role: operation.role, component: operation.component?.name || null, from: operation.from, to: operation.to, grasp: operation.grasp,
        grip: operation.component ? worldPoint(operation.component).toArray() : palmContact.toArray(), palm: palm.toArray(), contact: palmContact.toArray(), error: palm.distanceTo(palmContact), reachError,
        shoulder: turret.pitch.worldToLocal(worldPoint(l.arm)).toArray(), wristTarget: turret.pitch.worldToLocal(wristTarget.clone()).toArray(), armLength: worldPoint(l.arm).distanceTo(worldPoint(l.elbow)) + worldPoint(l.elbow).distanceTo(worldPoint(l.hand)),
        fingerErrors: l.fingers.map((f, fi) => { const tip = f.chain[2].localToWorld(f.tip.clone()), target = operation.target(f.name === 'Thumb', fi); return { name: f.name, error: tip.distanceTo(target), tip: tip.toArray(), target: target.toArray() }; }) });
    }
    for (const rifle of rifles) rifle.visible = false;
    for (const skeleton of skeletons) skeleton.update();
    last = { visible: actor.visible, reloadProgress, gripError: Math.max(...readings.map(r => r.error)), limbs: readings, headHidden: true, armsOnly: true, head: head ? worldPoint(head).toArray() : null,
      camera: (profile?.camera?turret.pitch.localToWorld(V(...profile.camera)):turret.pitch.localToWorld(V(0,.19,-.53))).toArray(), ...visibility };
    actor.userData.mountedGripState = last;
  }
  update(0);
  return {
    update,
    inspect: () => ({ ...last, disposed }),
    dispose() { if (disposed) return; disposed = true; if (turret.crew) turret.crew.visible = originalCrewVisible;
      operationParts.belt.visible = true; if(profile){operationParts.belt.position.copy(beltHome);operationParts.belt.quaternion.copy(beltHomeQ);}else{operationParts.belt.position.set(-.075,.135,.015);operationParts.belt.rotation.z=0;}
      world.destroyActor(actor); },
  };
}
