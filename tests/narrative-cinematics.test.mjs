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
  assert.ok(state.camera.position[1] < 3); assert.equal(state.actors.length, 0);
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
