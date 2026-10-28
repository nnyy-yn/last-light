import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHAPTERS } from '../src/story.js';
import { getChapterLayout } from '../src/chapter-layouts.js';
import { buildCinematicPlan, createNarrativeCinematics, sampleCinematicTrack } from '../src/narrative-cinematics.js';

function fixture(ambient = true, articulated = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .05, 600);
  camera.position.set(1, 1.7, 8); scene.add(camera);
  const original = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov };
  const created = [], destroyed = [], events = [], completed = [], sounds = [], animations = [], vehicleOptions = [], vehicleMotions = [];
  const sharedGeometry = new THREE.BoxGeometry(1, 1, 1), sharedMaterial = new THREE.MeshStandardMaterial();
  let geometryDisposals = 0, materialDisposals = 0;
  sharedGeometry.addEventListener('dispose', () => geometryDisposals++); sharedMaterial.addEventListener('dispose', () => materialDisposals++);
  const make = (kind, position = [0, 0], name = kind) => {
    const g = new THREE.Group(); g.name = name; g.position.set(position[0], 0, position[1]);
    const m = new THREE.Mesh(sharedGeometry, sharedMaterial); m.userData.sharedGeometry = m.userData.sharedMaterial = true; g.add(m);
    const limb = [];
    if (articulated && kind === 'soldier') {
      let parent = g;
      for (const [part, p] of [['Spine2', [0, 1.3, 0]], ['LeftArm', [.18, .02, 0]], ['LeftForeArm', [.09, -.25, .04]], ['LeftHand', [0, -.24, .12]], ['LeftHandMiddle1', [0, -.06, 0]]]) {
        const bone = new THREE.Bone(); bone.name = 'mixamorig:' + part; bone.position.set(...p); parent.add(bone); limb.push(bone); parent = bone;
      }
    }
    g.userData.kind = kind; g.userData.animate = (speed, dt, pose) => { for (const bone of limb) bone.quaternion.identity(); g.updateMatrixWorld(true); animations.push({ name, speed, dt, pose }); };
    created.push(g); scene.add(g); return g;
  };
  const world = {
    createActor: make, createProp(kind, position, options) {
      const g = make(kind, position);
      if (kind === 'vehicle') {
        vehicleOptions.push(options); g.userData.crewAnchors = [{ role: 'driver', position: [-.43, .88, .4] }, { role: 'gunner', position: [0, 1.65, -.25] }, { role: 'passenger', position: [.43, .88, -.5] }];
        g.userData.updateVehicleMotion = (speed, steer, time) => vehicleMotions.push({ speed, steer, time });
      }
      return g;
    },
    createAircraft(crashed, options) { assert.equal(options.managed, false); const g = make(crashed ? 'wreck' : 'aircraft'); g.userData.rotor = new THREE.Group(); g.userData.tailRotor = new THREE.Group(); g.add(g.userData.rotor, g.userData.tailRotor); return g; },
    destroyActor(object) { assert.ok(!destroyed.includes(object), 'temporary object destroyed exactly once'); destroyed.push(object); object.userData.disposed = true; object.removeFromParent(); object.clear(); },
    setAmbientAircraftEnabled(value) { const before = ambient; ambient = value; return before; },
  };
  const audio = Object.fromEntries(['impact', 'radio', 'updateAircraft', 'updateBattle'].map(name => [name, (...args) => sounds.push({ name, args })]));
  const director = createNarrativeCinematics({ scene, camera, world, audio, onSubtitle: event => events.push({ type: 'caption', ...event }), onComplete: event => completed.push(event), onEvent: event => events.push(event) });
  return { scene, camera, world, director, original, created, destroyed, events, completed, sounds, animations, vehicleOptions, vehicleMotions, get ambient() { return ambient; }, get geometryDisposals() { return geometryDisposals; }, get materialDisposals() { return materialDisposals; } };
}
const options = (id, phase = 'opening', extra = {}) => ({ chapter: CHAPTERS[id - 1], layout: getChapterLayout(id), phase, interactive: false, ...extra });
function advance(director, seconds, step = 1 / 30) { for (let t = 0; t < seconds - 1e-8; t += step) director.update(Math.min(step, seconds - t)); }

test('sixteen openings and closings have physical performers and distinct staged outcomes', () => {
  const names = new Set();
  for (let id = 1; id <= 16; id++) for (const phase of ['opening', 'closing']) {
    const plan = buildCinematicPlan(options(id, phase)); names.add(plan.id);
    assert.ok(plan.actors.length + plan.props.length + plan.aircraft.length > 0, `${id}/${phase} has actual models`);
    assert.ok(plan.cameras.length >= 2 && plan.duration >= 5);
    const animated = [...plan.actors, ...plan.props, ...plan.aircraft].some(s => s.keys.length > 1 && s.keys.some(k => JSON.stringify(k) !== JSON.stringify(s.keys[0])));
    assert.ok(animated || phase === 'closing' && [5, 8, 12, 14].includes(id), `${id}/${phase} stages more than text`);
    for (const spec of [...plan.actors, ...plan.props, ...plan.aircraft]) for (const k of spec.keys) assert.ok(k.position.every(Number.isFinite));
  }
  assert.equal(names.size, 32);
  for (const [id, outcome] of [[10, 'gordon-and-shughart-die'], [11, 'smith-dies']]) assert.ok(buildCinematicPlan(options(id, 'closing')).events.some(e => e.type === 'fixed-outcome' && e.fixed && e.outcome === outcome));
});

test('aircraft actually flies, is hit, spins down and becomes a wreck in chronological order', () => {
  const f = fixture(); f.director.start(options(6));
  const initial = f.director.inspect().aircraft.find(a => !a.crashed);
  assert.ok(initial.altitude > 30);
  advance(f.director, 5.3); const hit = f.director.inspect(); assert.equal(hit.stage, 'tail-hit');
  assert.equal(hit.events.filter(e => e.type === 'aircraft-hit').length, 1); assert.equal(hit.owned.fires, 0);
  advance(f.director, 5); const falling = f.director.inspect().aircraft.find(a => !a.crashed);
  assert.ok(falling.altitude < 19 && falling.altitude > .2); assert.ok(falling.yaw > 4); assert.ok(falling.rotor > initial.rotor);
  advance(f.director, 3); const impact = f.director.inspect();
  assert.equal(impact.aircraft.find(a => !a.crashed).visible, false); assert.equal(impact.aircraft.find(a => a.crashed).visible, true);
  assert.equal(impact.events.filter(e => e.type === 'aircraft-impact').length, 1); assert.equal(impact.owned.fires, 1);
  assert.ok(impact.particles.clouds > 0 && impact.particles.clouds <= impact.particles.cloudCapacity); assert.ok(impact.particles.debris > 0);
  assert.equal(f.sounds.filter(e => e.name === 'impact').length, 2);
  f.director.cancel();
});

test('pause and zero dt freeze camera, aircraft, actor poses and event progress', () => {
  const f = fixture(); f.director.start(options(6)); advance(f.director, 6.2);
  const state = JSON.stringify(f.director.inspect()), count = f.animations.length;
  f.director.update(0); f.director.update(-1); f.director.update(NaN);
  assert.equal(JSON.stringify(f.director.inspect()), state); assert.equal(f.animations.length, count);
  f.director.pause(); const paused = JSON.stringify(f.director.inspect()); f.director.update(9); assert.equal(JSON.stringify(f.director.inspect()), paused);
  f.director.resume(); f.director.update(.1); assert.ok(f.director.inspect().time > 6.2); f.director.cancel();
});

test('one slow frame preserves cue order and exact hit transforms instead of firing at final wreck position', () => {
  const f = fixture(); f.director.start(options(6)); f.director.update(18);
  const events = f.director.inspect().events.filter(e => ['aircraft-hit', 'tail-smoke', 'aircraft-impact', 'wreck-fire'].includes(e.type));
  assert.deepEqual(events.map(e => e.type), ['aircraft-hit', 'tail-smoke', 'aircraft-impact', 'wreck-fire']);
  assert.equal(events[0].time, 5.2); assert.equal(events[2].time, 12.8);
  assert.ok(events.every((e, i) => !i || e.time >= events[i - 1].time));
  f.director.update(1); assert.equal(f.completed.length, 1); assert.equal(f.completed[0].skipped, false);
});

test('cockpit sequence lands at a seated camera and chapter nine task actions never walk Durant', () => {
  const f = fixture(); f.director.start(options(9)); advance(f.director, 16);
  const state = f.director.inspect(); assert.equal(state.stage, 'trapped-in-cockpit');
  const crash = getChapterLayout(9).cinematic.crashPoint;
  assert.ok(Math.hypot(state.camera.position[0] - crash[0], state.camera.position[2] - crash[2]) < 5);
  assert.ok(state.camera.position[1] < 3); assert.equal(state.actors.filter(a=>a.visible).length,0,'Rooftop launcher must leave the cockpit shot; never add a second Durant');assert.ok(state.actors.every(a=>a.id==='rpg-shooter'));
  f.director.cancel();
  for (const task of CHAPTERS[8].tasks) {
    const plan = buildCinematicPlan(options(9, 'event', { event: task }));
    assert.equal(plan.stages[0].name, 'injured-seated-response'); assert.equal(plan.actors.length, 0);
    assert.deepEqual(plan.cameras[0].position, [0, .95, .9]); assert.deepEqual(plan.cameras[0].position, plan.cameras.at(-1).position);
  }
});

test('all 48 task events produce short actions and rescue tasks carry or unfold actual objects', () => {
  let count = 0;
  for (const chapter of CHAPTERS) for (const task of chapter.tasks) {
    const plan = buildCinematicPlan(options(chapter.id, 'event', { event: task.sceneEvent })); count++;
    assert.equal(plan.id, task.sceneEvent); assert.ok(plan.duration >= 4 && plan.duration <= 7);
    assert.equal(plan.events.filter(e => e.type === 'task-action').length, 1);
    assert.equal(plan.events.filter(e => e.type === 'aircraft-hit').length, 0);
  }
  assert.equal(count, 48);
  const stretcher = buildCinematicPlan(options(4, 'event', { event: 'ch04-stretcher-open' }));
  assert.ok(stretcher.props.some(p => p.kind === 'stretcher' && p.keys.at(-1).unfold === 1));
  const transfer = buildCinematicPlan(options(14, 'event', { event: 'ch14-crew-carried-out' }));
  assert.ok(transfer.props.some(p => p.kind === 'covered-stretcher' && p.keys.at(-1).position[1] > 0));
  assert.ok(transfer.actors.every(a => a.keys.some(k => k.carry === 1)));
});

test('convoy scenes distinguish the original mixed twelve, three casualty Humvees and the remaining main column', () => {
  const main = buildCinematicPlan(options(5)), casualty = buildCinematicPlan(options(5, 'closing')), remaining = buildCinematicPlan(options(8)), relief = buildCinematicPlan(options(13));
  assert.equal(main.convoy.count, 12); assert.equal(main.props.filter(p => p.vehicleType === 'humvee').length, 9); assert.equal(main.props.filter(p => p.vehicleType === 'cargo-truck').length, 3);
  assert.equal(casualty.convoy.count, 3); assert.ok(casualty.props.every(p => p.vehicleType === 'humvee'));
  assert.equal(remaining.convoy.count, 9); assert.equal(remaining.props.filter(p => p.vehicleType === 'cargo-truck').length, 3);
  assert.equal(relief.convoy.count, 12); assert.equal(relief.convoy.visibleSubset, true);
  for (const plan of [main, casualty, remaining, relief]) assert.ok(plan.actors.filter(a => a.crew).length <= 5, 'only near vehicles allocate full articulated riders');
  assert.equal(buildCinematicPlan(options(4, 'closing')).convoy.count, 3);
  assert.equal(buildCinematicPlan(options(13, 'closing')).convoy.count, 12);
});

test('vehicle variants, wheel motion and near crew follow the same clock and freeze together when paused', () => {
  const f = fixture(); f.director.start(options(13));
  assert.equal(f.vehicleOptions.length, 12); assert.equal(f.vehicleOptions.filter(v => v.type === 'cargo-truck').length, 3);
  assert.equal(f.vehicleOptions.filter(v => !v.occupied).length, 3, 'near vehicles omit duplicate static occupants');
  const initial = f.director.inspect().convoy; assert.equal(initial.crew.filter(c => c.visible).length, 5);
  advance(f.director, 3); const moving = f.director.inspect().convoy;
  assert.ok(moving.vehicles[0].speed > 0); assert.notDeepEqual(moving.crew[0].position, initial.crew[0].position);
  const driver = f.created.find(o => o.name === 'cinematic:convoy-0-driver'), car = f.created.find(o => o.name === 'cinematic:convoy-0');
  assert.ok(driver.position.distanceTo(car.localToWorld(new THREE.Vector3(-.43, .88, .4))) < 1e-8);
  assert.ok(f.vehicleMotions.some(m => m.speed > 0 && m.time > 0));
  f.director.pause(); const paused = JSON.stringify(f.director.inspect()), count = f.vehicleMotions.length; f.director.update(4);
  assert.equal(JSON.stringify(f.director.inspect()), paused); assert.equal(f.vehicleMotions.length, count);
  f.director.resume(); advance(f.director, .3); assert.ok(f.director.inspect().convoy.vehicles[0].distance > moving.vehicles[0].distance);
  f.director.cancel(); assert.equal(f.created.length, f.destroyed.length); assert.equal(f.scene.children.length, 1);
});

test('all eight radio task scenes use worn communication or the existing cockpit instead of radio tables', () => {
  let count = 0;
  for (const chapter of CHAPTERS) for (const task of chapter.tasks.filter(t => t.interaction === 'radio')) {
    count++; const plan = buildCinematicPlan(options(chapter.id, 'event', { event: task }));
    assert.ok(!plan.props.some(p => p.kind === 'radio'), task.id + ' must not spawn a radio table');
    if (chapter.id === 9) {
      assert.equal(plan.props.length, 0, 'the cockpit already supplies the built-in radio');
      assert.equal(plan.actors.length, 0, 'Durant does not stand up for the radio');
      assert.deepEqual(plan.cameras[0].position, [0, .95, .9]);
    } else {
      const operator = plan.actors.find(a => a.shoulderRadio);
      assert.ok(operator, task.id + ' needs a physical radio operator');
      assert.deepEqual(operator.shoulderRadio, { raise: .85, release: 3.4, lowered: 4.5 });
      assert.equal(operator.keys.length, 2, 'radio hand action does not rewrite the existing actor track');
      assert.deepEqual(operator.keys[0].position, operator.keys[1].position);
    }
  }
  assert.equal(count, 8);
  for (const task of CHAPTERS[8].tasks) assert.equal(buildCinematicPlan(options(9, 'event', { event: task })).props.length, 0);
});

test('worn microphone follows the shoulder and the hand reaches it, pauses and returns without shared-resource disposal', () => {
  const f = fixture(true, true), task = CHAPTERS[4].tasks.find(t => t.interaction === 'radio');
  f.director.start(options(5, 'event', { event: task }));
  const actor = f.created.find(o => o.name === 'cinematic:conversation-partner');
  const hand = actor.getObjectByName('mixamorig:LeftHand'), knuckle = actor.getObjectByName('mixamorig:LeftHandMiddle1');
  const microphone = actor.getObjectByName('worn shoulder push-to-talk microphone');
  assert.ok(microphone); assert.equal(microphone.parent, actor);
  const rest = actor.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).clone();
  advance(f.director, 1.5); actor.updateMatrixWorld(true);
  const palm = hand.getWorldPosition(new THREE.Vector3()).lerp(knuckle.getWorldPosition(new THREE.Vector3()), .72);
  const contact = actor.localToWorld(microphone.position.clone().add(new THREE.Vector3(0, -.025, .035)));
  assert.ok(palm.distanceTo(contact) < .015, 'left palm touches the shoulder microphone');
  assert.equal(f.director.inspect().actors.find(a => a.id === 'conversation-partner').radio, 1);
  f.director.pause(); const paused = hand.getWorldPosition(new THREE.Vector3()); f.director.update(2);
  assert.deepEqual(hand.getWorldPosition(new THREE.Vector3()).toArray(), paused.toArray());
  f.director.resume(); advance(f.director, 3.2);
  assert.equal(f.director.inspect().actors.find(a => a.id === 'conversation-partner').radio, 0);
  assert.ok(actor.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).distanceTo(rest) < 1e-8, 'hand returns to its normal actor animation');
  const disposals = []; microphone.traverse(o => { if (o.isMesh) { const entry = { geometry: 0 }; o.geometry.addEventListener('dispose', () => entry.geometry++); disposals.push(entry); } });
  f.director.cancel(); assert.ok(disposals.every(d => d.geometry === 1)); assert.equal(f.geometryDisposals, 0); assert.equal(f.materialDisposals, 0);
});

test('skip, cancel and replacement restore borrowed state and never dispose shared model resources', () => {
  const f = fixture(false), borrowed = new THREE.Group(); borrowed.visible = true; f.scene.add(borrowed);
  f.director.start(options(6, 'opening', { actors: [borrowed] })); assert.equal(borrowed.visible, false); advance(f.director, 14);
  const before = f.created.length; assert.equal(f.director.skip(), true); assert.equal(f.director.skip(), false);
  assert.equal(f.destroyed.length, before); assert.equal(f.completed.length, 1); assert.equal(f.completed[0].skipped, true);
  assert.equal(f.ambient, false); assert.equal(borrowed.visible, true); assert.equal(f.director.inspect().owned.objects, 0); assert.equal(f.director.inspect().owned.fires, 0);
  assert.deepEqual(f.camera.position.toArray(), f.original.position); assert.deepEqual(f.camera.quaternion.toArray(), f.original.quaternion); assert.equal(f.camera.fov, f.original.fov);
  f.director.start(options(3)); f.director.start(options(4)); f.director.cancel(); f.director.cancel();
  assert.equal(f.completed.length, 1); assert.equal(f.created.length, f.destroyed.length);
  assert.equal(f.geometryDisposals, 0); assert.equal(f.materialDisposals, 0);
  assert.equal(f.scene.children.filter(o => o.name.startsWith('narrative:')).length, 0);
  f.director.dispose(); f.director.dispose(); assert.throws(() => f.director.start(options(1)), /disposed/);
});

test('repeated chapter scenes finish once, leave no scene ghosts, and do not mutate the campaign data', () => {
  const f = fixture(), before = JSON.stringify(CHAPTERS);
  for (let id = 1; id <= 16; id++) for (const phase of ['opening', 'closing']) {
    const started = f.director.start(options(id, phase)); f.director.update(started.duration + 10);
    assert.equal(f.director.active, false); assert.equal(f.director.inspect().owned.objects, 0); assert.equal(f.created.length, f.destroyed.length);
    assert.equal(f.scene.children.length, 1);
  }
  assert.equal(f.completed.length, 32); assert.equal(JSON.stringify(CHAPTERS), before); assert.equal(f.ambient, true);
});

test('hit reactions are impulses at a cue, never a premonition or permanent flinch', () => {
  const keys = [{ at: 0, position: [0, 0, 0] }, { at: 3, position: [0, 0, 0], hit: 1 }, { at: 5, position: [0, 0, 0] }];
  assert.equal(sampleCinematicTrack(keys, 2.9).hit, 0); assert.equal(sampleCinematicTrack(keys, 3).hit, 1);
  assert.ok(sampleCinematicTrack(keys, 3.8).hit < .001); assert.equal(sampleCinematicTrack(keys, 5).hit, 0);
});

test('a walking or carrying actor retains its facing after a position-only key and can explicitly release a gesture', () => {
  const keys = [{ at: 0, position: [0, 0, 0], yaw: Math.PI / 2, gesture: 'fast-rope' }, { at: 2, position: [0, 0, 2] }, { at: 4, position: [0, 0, 4], gesture: null }];
  assert.equal(sampleCinematicTrack(keys, 1).yaw, Math.PI / 2); assert.equal(sampleCinematicTrack(keys, 3).yaw, Math.PI / 2);
  assert.equal(sampleCinematicTrack(keys, 3).gesture, 'fast-rope'); assert.equal(sampleCinematicTrack(keys, 4).gesture, null);
});

test('the authored cockpit is concealed during flight and restored exactly when the landing view cuts inside', () => {
  const f = fixture(), cockpit = new THREE.Group(), wreck = new THREE.Group();
  cockpit.userData.chapterPropKind = 'cockpit'; wreck.userData.chapterPropKind = 'wreck';
  f.scene.add(cockpit, wreck); f.world.getCinematicOcclusions = () => [cockpit, wreck];
  f.director.start(options(9)); assert.equal(cockpit.visible, false); assert.equal(wreck.visible, false);
  advance(f.director, 13.19); assert.equal(cockpit.visible, false);
  f.director.update(.03); assert.equal(cockpit.visible, true); assert.equal(wreck.visible, false);
  f.director.cancel(); assert.equal(cockpit.visible, true); assert.equal(wreck.visible, true);
  cockpit.visible = false;
  f.director.start(options(9)); f.director.update(14); assert.equal(cockpit.visible, false);
  f.director.cancel(); assert.equal(cockpit.visible, false);
});

test('indoor treatment shots stay in the room and hangar boarding takes place outside the roof', () => {
  const opening = buildCinematicPlan(options(11));
  assert.deepEqual(opening.anchor, [6, 0, 0]);
  for (const phase of ['opening', 'closing']) for (const shot of buildCinematicPlan(options(11, phase)).cameras) {
    assert.ok(shot.position[0] > -12 && shot.position[0] < 12 && shot.position[2] > -15 && shot.position[2] < 11);
    assert.ok(shot.position[1] < 3.6);
  }
  for (const task of CHAPTERS[10].tasks) {
    const plan = buildCinematicPlan(options(11, 'event', { event: task }));
    assert.deepEqual(plan.cameras[0].position, plan.cameras.at(-1).position);
  }
  const board = buildCinematicPlan(options(3, 'closing'));
  assert.deepEqual(board.anchor, [27, 0, 0]);
  assert.ok(board.aircraft[0].keys.every(k => k.position[0] > -10.5));
});

test('player-controlled descent requires sustained input and releasing the rope stops descent but not the rotor', () => {
  const f = fixture(); f.director.start(options(4, 'opening', { interactive: true })); advance(f.director, 9);
  let snapshot = f.director.inspect(); assert.equal(snapshot.playerAction.awaitingInput, true); assert.equal(snapshot.playerAction.progress, 0);
  const height = snapshot.actors.find(a => a.id === 'player-ranger').position[1], rotor = snapshot.aircraft[0].rotor;
  advance(f.director, 3); snapshot = f.director.inspect(); assert.equal(snapshot.actors.find(a => a.id === 'player-ranger').position[1], height); assert.ok(snapshot.aircraft[0].rotor > rotor);
  f.director.setInput({ held: true }); advance(f.director, 2); snapshot = f.director.inspect(); assert.ok(snapshot.playerAction.progress > .25); assert.ok(snapshot.actors.find(a => a.id === 'player-ranger').position[1] < height - 1);
  f.director.setInput({}); const stopped = f.director.inspect(); advance(f.director, 2); assert.equal(f.director.inspect().playerAction.progress, stopped.playerAction.progress);
  assert.deepEqual(f.director.inspect().playerAction.position, stopped.playerAction.position);
  f.director.pause(); const paused = JSON.stringify(f.director.inspect()); f.director.update(10); assert.equal(JSON.stringify(f.director.inspect()), paused);
  f.director.resume(); f.director.setInput({ held: true }); advance(f.director, 14);
  assert.equal(f.director.active, false); assert.equal(f.completed.length, 1); assert.equal(f.events.filter(e => e.type === 'player-action-completed').length, 1);
});

test('the playable withdrawal moves its soldier and follow camera forward or backward while vehicles keep moving', () => {
  const f = fixture(); f.director.start(options(15, 'opening', { interactive: true })); advance(f.director, 1);
  const initial = f.director.inspect(); f.director.setInput({ forward: true }); advance(f.director, 3); const forward = f.director.inspect();
  assert.ok(forward.playerAction.position[2] < initial.playerAction.position[2]); assert.ok(forward.camera.position[2] < initial.camera.position[2]);
  f.director.setInput({ back: true }); advance(f.director, 1); const backward = f.director.inspect();
  assert.ok(backward.playerAction.position[2] > forward.playerAction.position[2]); assert.ok(backward.playerAction.progress < forward.playerAction.progress);
  f.director.setInput({}); advance(f.director, 1); assert.deepEqual(f.director.inspect().playerAction.position, backward.playerAction.position);
  f.director.skip(); assert.equal(f.director.inspect().owned.objects, 0); assert.equal(f.director.inspect().playerAction.active, false);
});

test('cockpit countersteering changes bank and shaking without making the historical crash avoidable', () => {
  const good = fixture(), wrong = fixture();
  for (const f of [good, wrong]) { f.director.start(options(9, 'opening', { interactive: true })); advance(f.director, 5.9); }
  good.director.setInput({ right: true }); wrong.director.setInput({ left: true });
  advance(good.director, .4); advance(wrong.director, .4);
  assert.ok(good.director.inspect().playerAction.stability > wrong.director.inspect().playerAction.stability);
  assert.notEqual(good.director.inspect().aircraft[0].roll, wrong.director.inspect().aircraft[0].roll);
  for (let i = 0; i < 300 && !good.director.inspect().playerAction.completed; i++) {
    const action = good.director.inspect().playerAction; good.director.setInput({ right: action.tilt > 0, left: action.tilt <= 0 }); good.director.update(.05);
  }
  assert.equal(good.director.inspect().playerAction.completed, true); advance(good.director, 20);
  assert.equal(good.events.filter(e => e.type === 'aircraft-impact').length, 1); assert.equal(good.completed.length, 1); wrong.director.cancel();
});

test('hands-on care and carrying require continuous E and only explicit interactive false opts out', () => {
  for (const id of [11, 14]) {
    const f = fixture(); const opts = options(id); delete opts.interactive; f.director.start(opts); advance(f.director, 15);
    assert.equal(f.director.inspect().interactive, true); assert.equal(f.director.inspect().playerAction.progress, 0); assert.equal(f.director.active, true);
    if (id === 11) assert.equal(f.director.inspect().actors.find(a => a.id === 'aid-assistant').stance, 'kneel');
    const initial = f.director.inspect().playerAction.position; f.director.setInput({ held: true }); advance(f.director, 2);
    if (id === 11) assert.equal(f.director.inspect().actors.find(a => a.id === 'aid-assistant').stance, 'treat');
    else assert.notDeepEqual(f.director.inspect().playerAction.position, initial);
    f.director.cancel(); f.director.start(options(id)); advance(f.director, 20); assert.equal(f.director.active, false);
  }
});

test('both crash openings expose a real RPG performer, continuous flight and a precise aircraft contact point',()=>{
 for(const id of[6,9]){const plan=buildCinematicPlan(options(id)),launch=plan.events.find(e=>e.type==='rpg-launched'),hit=plan.events.find(e=>e.type==='aircraft-hit'),projectile=plan.props.find(p=>p.kind==='projectile'),shooter=plan.actors.find(a=>a.id==='rpg-shooter');assert(shooter.launcher&&launch&&hit);assert(launch.at<hit.at);assert.deepEqual(projectile.keys[0].position,launch.position);assert.deepEqual(projectile.trajectory.to,launch.to);const air=plan.aircraft.find(a=>a.id===hit.target),pose=sampleCinematicTrack(air.keys,hit.at),expected=new THREE.Vector3(...hit.localPosition).applyEuler(new THREE.Euler(pose.pitch||0,pose.yaw||0,pose.roll||0,'YXZ')).add(new THREE.Vector3(...pose.position));assert(expected.distanceTo(new THREE.Vector3(...projectile.keys.at(-1).position))<1e-7);
  const p1=sampleCinematicTrack(projectile.keys,launch.at+.1),p2=sampleCinematicTrack(projectile.keys,launch.at+.2);assert(new THREE.Vector3(...p1.position).distanceTo(new THREE.Vector3(...p2.position))>1,'Projectile moves in real time across several frames');assert(plan.cameras.some(k=>k.at>=hit.at-.15&&k.at<hit.at&&new THREE.Vector3(...k.position).distanceTo(expected)<7),'Impact has a continuous close view');
 }
});

test('battle opening and closing fire is paired with visible performers and peaceful chapters never invent impacts',()=>{
 const combat=new Set([4,5,6,7,8,10,12,13,14,15]);
 for(let id=1;id<=16;id++)for(const phase of['opening','closing']){const plan=buildCinematicPlan(options(id,phase)),fires=plan.events.filter(e=>e.type.includes('cover-fire'));
  if(combat.has(id)){assert(fires.length>0,`${id}/${phase} needs visible cover activity`);for(const e of fires)assert([...plan.actors,...plan.aircraft].some(a=>a.id===e.source));}
  else assert.equal(plan.events.filter(e=>['ground-cover-fire','aircraft-cover-fire','distant-impact'].includes(e.type)).length,0,`${id}/${phase} must not add combat to care/civilian scenes`);
 }
});

test('the RPG endpoint and damage event agree during a slow update and tail damage persists while falling',()=>{const f=fixture();f.director.start(options(6));advance(f.director,4.6);const flight=f.director.inspect();assert(flight.projectiles.some(p=>p.visible));f.director.update(.7);const s=f.director.inspect(),hit=s.events.find(e=>e.type==='aircraft-hit'),launch=s.events.find(e=>e.type==='rpg-launched');assert(launch.time<hit.time);assert(new THREE.Vector3(...hit.position).distanceTo(new THREE.Vector3(...flight.projectiles[0].trajectory.to))<1e-7);assert.equal(s.aircraft.find(a=>!a.crashed).damage.tailRotorDisabled,true);f.director.cancel();});

test('the rooftop launcher uses the existing MakeHuman hands and its muzzle is the projectile launch origin',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};
 try{const{actorRig}=await import('./helpers/actor-rig.mjs'),{installActorPoses}=await import('../src/world.js'),human=await actorRig('enemy'),rifle=new THREE.Group();human.root.add(rifle);installActorPoses(human.root,human.model,human.bones,rifle,'enemy',()=>{});
  const f=fixture(),original=f.world.createActor;f.world.createActor=(kind,position,name)=>{if(kind!=='enemy')return original(kind,position,name);human.root.position.set(position[0],0,position[1]);human.root.name=name;human.root.userData.kind='enemy';f.created.push(human.root);f.scene.add(human.root);return human.root;};
  f.director.start(options(6));advance(f.director,2);const launcher=f.director.inspect().actors.find(a=>a.id==='rpg-shooter').launcher,plan=buildCinematicPlan(options(6)),origin=plan.events.find(e=>e.type==='rpg-launched').position;
  assert(launcher.visible);assert(new THREE.Vector3(...launcher.muzzle).distanceTo(new THREE.Vector3(...origin))<1e-6);assert.equal(launcher.gripErrors.length,2);for(const hand of launcher.gripErrors)assert(hand.error<.04,hand.side+' launcher hand must reach actual grip: '+hand.error);assert.equal(rifle.visible,false,'The RPG operator cannot retain a second AK through their hands');f.director.cancel();
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('battle briefings have role, concrete goal, threat and finish or skip without leaking objects',()=>{
 const combat=[4,5,6,7,8,10,12,13,14,15],goals=new Set();
 for(const id of combat){const p=buildCinematicPlan(options(id,'briefing'));assert.equal(p.phase,'briefing');assert.equal(p.duration,8);assert(p.actors.some(a=>a.id==='briefing-commander'));assert(p.props.some(a=>a.kind==='map'));assert.equal(p.events.filter(e=>e.type==='subtitle').length,3);assert(p.events.every(e=>!e.type.includes('impact')));goals.add(p.events[1].text);const f=fixture();f.director.start(options(id,'briefing'));f.director.update(8.1);assert.equal(f.completed.length,1);assert.equal(f.director.inspect().owned.objects,0);f.director.start(options(id,'briefing'));f.director.skip();assert.equal(f.completed.length,2);f.director.start(options(id,'opening'));assert.equal(f.director.inspect().phase,'opening');f.director.cancel();}
 assert(goals.size>7);for(const id of[1,2,3,9,11,16])assert.throws(()=>buildCinematicPlan(options(id,'briefing')),/viewpoint/);
});

test('both rope tops meet the transformed cabin door and the same Blackburn is injured then attended',()=>{
 const plan=buildCinematicPlan(options(4)),air=plan.aircraft.find(a=>a.id==='insertion-aircraft'),hover=sampleCinematicTrack(air.keys,5),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,hover.yaw,0));
 for(const r of plan.props.filter(p=>p.kind==='rope')){const top=new THREE.Vector3(...r.keys[0].position).add(new THREE.Vector3(0,r.length/2,0)),door=new THREE.Vector3(...r.aircraftAnchor).applyQuaternion(q).add(new THREE.Vector3(...hover.position));assert(top.distanceTo(door)<1e-8);const actor=plan.actors.find(a=>a.id===(r.id==='player-rope'?'player-ranger':'lead-ranger'));const p=sampleCinematicTrack(actor.keys,actor.keys[0].at),axis=new THREE.Vector3(top.x-p.position[0],0,top.z-p.position[2]).applyQuaternion(q.clone().invert());assert(Math.abs(axis.x)<1e-8);assert(Math.abs(axis.z-.30)<1e-8);}
 const blackburn=plan.actors.filter(a=>a.id==='blackburn');assert.equal(blackburn.length,1);assert(blackburn[0].keys.every(k=>!k.dead&&Math.abs(k.roll||0)<.2));assert.equal(sampleCinematicTrack(blackburn[0].keys,10).injuryPhase,'ground');assert.equal(sampleCinematicTrack(blackburn[0].keys,10).injured,1);const f=fixture();f.director.start(options(4,'opening',{interactive:true}));advance(f.director,12);const state=f.director.inspect();assert.equal(state.playerAction.progress,0);assert.equal(state.actors.find(a=>a.id==='blackburn').injured,1);assert.equal(state.actors.find(a=>a.id==='responding-medic').stance,'treat');assert(f.animations.filter(a=>a.name==='blackburn'&&a.pose.ropePhase==='descend').every(a=>a.speed===0),'Vertical descent is not a running gait');assert.equal(state.events.find(e=>e.type==='landing-accident').dead,false);f.director.cancel();
});

test('runtime crash staging uses actual chapter roof slabs and never the CPU proxy roof',async()=>{
 const {storySceneFixture}=await import('./helpers/story-scene.mjs');
 for(const id of[6,9]){const scene=storySceneFixture(id);try{const p=buildCinematicPlan({...options(id),sceneState:scene.built.state});assert(p.rooftop);assert(!p.props.some(o=>o.kind==='roof-edge'));const roof=scene.built.state.roofSurfaces.find(r=>r.id===p.rooftop.id),pos=p.rooftop.position;assert.equal(pos[1],roof.height);assert(!roof.obstacles.some(o=>pos[0]>o.minX-.5&&pos[0]<o.maxX+.5&&pos[2]>o.minZ-.5&&pos[2]<o.maxZ+.5));assert.equal(p.events.find(e=>e.type==='aircraft-hit').at,id===6?5.2:4.6);}finally{scene.dispose();}}
});

test('cinematic M134 tracers stay on the actual transformed barrel axis, including clamped aiming',async()=>{
 const {geometryAsset}=await import('./helpers/actor-rig.mjs'),{installSupportModelTemplates,attachBlackHawkDoorGuns}=await import('../src/support-models.js');installSupportModelTemplates({'m134-door-support':(await geometryAsset('m134-door-support.glb')).scene});const f=fixture(),make=f.world.createAircraft;f.world.createAircraft=(...args)=>{const a=make(...args);attachBlackHawkDoorGuns(a);return a;};f.director.start(options(4));advance(f.director,1);const shots=f.director.inspect().events.filter(e=>e.type==='aircraft-cover-fire');assert.equal(shots.length,6);for(const s of shots){assert(s.realDoorGun&&s.barrelDot>.995);assert(new THREE.Vector3(...s.to).sub(new THREE.Vector3(...s.from)).normalize().dot(new THREE.Vector3(...s.barrelForward))>.995);}f.director.cancel();
});

test('cinematic RPG reuses the shipped model and its actual muzzle/grips with the real MakeHuman rig',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};try{const{actorRig,geometryAsset}=await import('./helpers/actor-rig.mjs'),{installActorPoses}=await import('../src/world.js'),{STATIC_WEAPON_ASSETS}=await import('../src/weapon-variants.js'),human=await actorRig('enemy'),rifle=(await geometryAsset('rpg7-support.glb')).scene.clone(true),asset=STATIC_WEAPON_ASSETS.rpg7;
 rifle.userData={weaponId:'rpg7',grips:{right:[0,-.055,.005],left:[...asset.left]},muzzle:[...asset.muzzle],barrelDirection:[0,0,-1]};human.root.add(rifle);human.root.userData.carriedWeapon=rifle;installActorPoses(human.root,human.model,human.bones,rifle,'enemy',()=>{});
 const f=fixture(),original=f.world.createActor;f.world.createActor=(kind,pos,name)=>{if(kind!=='enemy')return original(kind,pos,name);human.root.position.set(pos[0],0,pos[1]);f.created.push(human.root);f.scene.add(human.root);return human.root;};f.director.start(options(6));advance(f.director,2);const r=f.director.inspect().actors.find(a=>a.id==='rpg-shooter').launcher;assert(r.actualModel);assert(new THREE.Vector3(...r.muzzle).distanceTo(new THREE.Vector3(...buildCinematicPlan(options(6)).events.find(e=>e.type==='rpg-launched').position))<1e-6);for(const hand of r.gripErrors)assert(hand.error<.04,JSON.stringify(hand));assert(!human.root.getObjectByName('Shoulder launcher'));f.director.cancel();
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('chapter ten loss of balance uses living hit then ground contact, releases hands and preserves fixed outcome',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};
 try{
  const{actorRig}=await import('./helpers/actor-rig.mjs'),{installActorPoses}=await import('../src/world.js'),{posedActorBounds}=await import('../src/actor-bounds.js'),floor=.22,humans=await Promise.all([actorRig(),actorRig()]);
  for(const h of humans){
   // Runtime soldiers remove exposed hair cards before normalising the body.
   // Re-normalise this CPU fixture after the same removal; a loose hair card
   // must not stand in for the skull, shoulder or foot contact surface.
   const hair=[];h.model.traverse(o=>{if(o.isMesh&&/short01/i.test(o.material?.name||''))hair.push(o);});hair.forEach(o=>o.removeFromParent());h.root.updateMatrixWorld(true);
   const upright=new THREE.Box3().setFromObject(h.model),factor=1.78/(upright.max.y-upright.min.y);h.model.scale.multiplyScalar(factor);h.model.position.multiplyScalar(factor);h.root.updateMatrixWorld(true);
   const rifle=new THREE.Group();h.root.add(rifle);h.root.userData.carriedWeapon=rifle;installActorPoses(h.root,h.model,h.bones,rifle,'soldier',()=>{},()=>floor);
  }
  const f=fixture(),original=f.world.createActor;f.world.sampleHeight=()=>floor;f.world.createActor=(kind,pos,name)=>{if(!name.startsWith('sniper'))return original(kind,pos,name);const h=humans[Number(name.at(-1))];f.created.push(h.root);f.scene.add(h.root);return h.root;};
  f.director.start(options(10,'closing'));advance(f.director,3.9);assert(f.director.inspect().actors.every(a=>a.dead===0),'Both defenders remain alive before the first hit');advance(f.director,.6);assert.equal(f.director.inspect().actors.find(a=>a.id==='sniper-0').casualtyPhase,'balance-lost');assert.equal(f.director.inspect().actors.find(a=>a.id==='sniper-1').dead,0);advance(f.director,4);
  const contacts=[];for(const h of humans){
   const b=posedActorBounds(h.root),pose=h.root.userData.getPoseState(),contact=pose.groundContact;assert(contact,'Settled actual skin must expose hip, shoulder and separate foot contacts');
   const points=[contact.points.hip,contact.points.shoulder,...contact.points.feet];assert.equal(points.length,4);for(const point of points){assert(point.every(Number.isFinite));assert(Math.abs(point[1]-floor)<.03,JSON.stringify({point,floor,contact}));}
   assert(b.min.y>=floor-.02,'Loose cloth may compress slightly, but no visible skin may penetrate more than 2cm: '+JSON.stringify({min:b.min.y,floor}));assert(b.max.y-b.min.y<.9);assert.equal(pose.dead,1);assert.equal(h.root.userData.carriedWeapon.visible,false);const materialMinima={};h.root.updateMatrixWorld(true);h.root.traverseVisible(mesh=>{if(!mesh.isSkinnedMesh)return;const g=mesh.geometry,index=g.index,count=index?index.count:g.attributes.position.count,start=g.drawRange.start||0,end=Math.min(count,start+g.drawRange.count),ids=new Set();for(let i=start;i<end;i++)ids.add(index?index.getX(i):i);let min=Infinity;for(const id of ids)min=Math.min(min,mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).y);const name=mesh.material?.name||mesh.name;materialMinima[name]=Math.min(materialMinima[name]??Infinity,min);});for(const[name,min]of Object.entries(materialMinima))if(name.startsWith('MakeHuman_soldier_body.'))assert(min>=floor-.001,'Anatomical skin must remain above the plane: '+JSON.stringify({name,min,floor}));contacts.push({floor,min:b.min.y,max:b.max.y,contact,materialMinima});
  }
  console.log('Chapter ten actual skin contacts:',JSON.stringify(contacts));assert(f.director.inspect().events.some(e=>e.type==='fixed-outcome'&&e.time===8));f.director.cancel();
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('chapter four insertion columns and separated rescue positions clear actual canopy triangles and solid colliders',async()=>{
 const{storySceneFixture}=await import('./helpers/story-scene.mjs'),f=storySceneFixture(4);try{const p=buildCinematicPlan({...options(4),groundHeight:f.built.surface.sampleHeight}),ray=new THREE.Raycaster(),samples=[];for(const x of[-3,0,3])for(const z of[28,31,34])samples.push([x,z]);for(const id of['player-ranger','lead-ranger','blackburn','responding-medic','casualty-assistant']){const a=p.actors.find(a=>a.id===id),pos=sampleCinematicTrack(a.keys,14).position;samples.push([pos[0],pos[2]]);}
  for(const[x,z]of samples){const floor=f.built.surface.sampleHeight(x,z);ray.set(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=20-floor-.30;const hits=ray.intersectObject(f.group,true).filter(h=>h.object.isMesh);assert.equal(hits.length,0,'Actual overhead mesh blocks insertion at '+[x,z]);assert(!f.colliders.some(b=>x>b.minX-.4&&x<b.maxX+.4&&z>b.minZ-.4&&z<b.maxZ+.4),'Solid blocks landing at '+[x,z]);}
 const positions=['blackburn','responding-medic','casualty-assistant'].map(id=>sampleCinematicTrack(p.actors.find(a=>a.id===id).keys,14).position);for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert(Math.hypot(positions[i][0]-positions[j][0],positions[i][2]-positions[j][2])>=(i===0&&j===1?.65:1.2));
 }finally{f.dispose();}
});

test('fast-rope controls remain active through the visible accident cut and return to the player after it',()=>{
 const f=fixture();f.director.start(options(4,'opening',{interactive:true}));f.director.setInput({held:true});advance(f.director,8.55);const a=f.director.inspect();assert(a.playerAction.active);assert(a.actors.find(a=>a.id==='blackburn').injuryPhase==='fall');assert(a.camera.position[1]<6,'Accident camera leaves the high player-back view');f.director.update(.5);assert(f.director.inspect().playerAction.progress>a.playerAction.progress,'E remains active in the accident view');advance(f.director,1.65);const b=f.director.inspect();assert(b.playerAction.active);assert(Math.abs(b.camera.position[1]-b.playerAction.position[1]-1.45)<1e-7);f.director.cancel();
});

test('the actual Blackburn rig never re-grips a rifle between rope release and injury, and guards rearm only after clearing',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};try{const{actorRig}=await import('./helpers/actor-rig.mjs'),{installActorPoses}=await import('../src/world.js'),h=await actorRig(),rifle=new THREE.Group();h.root.add(rifle);installActorPoses(h.root,h.model,h.bones,rifle,'soldier',()=>{});const f=fixture(),original=f.world.createActor;f.world.createActor=(kind,pos,name)=>{if(name!=='blackburn')return original(kind,pos,name);f.created.push(h.root);f.scene.add(h.root);return h.root;};f.director.start(options(4));advance(f.director,8.57);assert.equal(h.root.userData.weaponDropped,true);assert.equal(rifle.visible,false,'The rifle must not pop back at grip release before injured reaches .3');assert.equal(f.created.find(a=>a.name==='cinematic:lead-ranger').userData.weaponDropped,true,'Releasing the rope is not yet clear of landing point');advance(f.director,2);assert.equal(h.root.userData.weaponDropped,true);assert.equal(rifle.visible,false);assert.equal(f.created.find(a=>a.name==='cinematic:lead-ranger').userData.weaponDropped,false,'The uninjured guard regains rifle after moving clear');f.director.cancel();
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});


test('the insertion medic approaches the seated shoulder from the side without crowding the legs',()=>{
 const p=buildCinematicPlan({...options(4),groundHeight:()=>.17}),patient=sampleCinematicTrack(p.actors.find(a=>a.id==='blackburn').keys,14),medic=p.actors.find(a=>a.id==='responding-medic'),arrived=sampleCinematicTrack(medic.keys,14),assistant=sampleCinematicTrack(p.actors.find(a=>a.id==='casualty-assistant').keys,14);
 assert.equal(sampleCinematicTrack(medic.keys,10).treatmentTarget,undefined);assert.equal(arrived.stance,'treat');assert.equal(assistant.stance,'kneel');const delta=new THREE.Vector3(...arrived.position).sub(new THREE.Vector3(...patient.position)).applyAxisAngle(new THREE.Vector3(0,1,0),-patient.yaw);assert(delta.x>.65&&delta.x<.80);assert(Math.abs(delta.z)<.25,'Medic stays alongside the body, out of the forward foot area');const target=new THREE.Vector3(...arrived.treatmentTarget),from=new THREE.Vector3(...arrived.position),look=target.clone().sub(from);look.y=0;assert(new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),arrived.yaw).dot(look.normalize())>.999);assert(target.y>.80&&target.y<.95);assert(Math.hypot(target.x-from.x,target.z-from.z)<.56,'Seated shoulder is in the close hand workspace');assert(Math.hypot(assistant.position[0]-patient.position[0],assistant.position[2]-patient.position[2])>1.2);
 const f=fixture();f.director.start(options(4));advance(f.director,14);const pose=f.animations.filter(a=>a.name==='responding-medic').at(-1).pose;assert(Array.isArray(pose.treatmentTarget)&&pose.treatmentTarget.every(Number.isFinite),'Real director forwards the world-space contact target to the animator');f.director.cancel();
});


test('a settled real corpse keeps its solved contacts while the camera, second defender and outcome continue',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};try{
  const{actorRig}=await import('./helpers/actor-rig.mjs'),{installActorPoses}=await import('../src/world.js'),humans=await Promise.all([actorRig(),actorRig()]),calls=[0,0],floor=.22;
  for(const[index,h]of humans.entries()){const rifle=new THREE.Group();h.root.add(rifle);installActorPoses(h.root,h.model,h.bones,rifle,'soldier',()=>{},()=>floor);const animate=h.root.userData.animate;h.root.userData.animate=(...args)=>{calls[index]++;return animate(...args);};}
  const f=fixture(),original=f.world.createActor;f.world.sampleHeight=()=>floor;f.world.createActor=(kind,pos,name)=>{if(!name.startsWith('sniper'))return original(kind,pos,name);const h=humans[Number(name.at(-1))];f.created.push(h.root);f.scene.add(h.root);return h.root;};f.director.start(options(10,'closing'));advance(f.director,5.7);
  const before=f.director.inspect(),bodyMatrix=humans[0].root.matrixWorld.toArray(),skinMatrices=Object.values(humans[0].bones).map(b=>b.matrixWorld.toArray()),contacts=structuredClone(humans[0].root.userData.getPoseState().groundContact),counts=[...calls],camera=f.camera.position.clone();assert.equal(before.actors.find(a=>a.id==='sniper-0').casualtyPhase,'settled');assert.equal(before.actors.find(a=>a.id==='sniper-1').dead,0);advance(f.director,2.8);
  assert.equal(calls[0],counts[0],'Already settled actor must not run the pose/contact solver again');assert(calls[1]>counts[1],'The living second defender must still animate and fall');assert.deepEqual(humans[0].root.matrixWorld.toArray(),bodyMatrix);assert.deepEqual(Object.values(humans[0].bones).map(b=>b.matrixWorld.toArray()),skinMatrices);assert.deepEqual(humans[0].root.userData.getPoseState().groundContact,contacts);assert(f.director.inspect().time>before.time+2.7);assert(f.camera.position.distanceTo(camera)>.01);assert.equal(f.director.inspect().events.filter(e=>e.type==='fixed-outcome'&&e.time===8).length,1);assert.equal(f.completed.length,0);advance(f.director,5);assert.equal(f.completed.length,1);assert.equal(f.director.inspect().owned.objects,0);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
