import test from 'node:test';
import assert from 'node:assert/strict';
import { createConvoyPath, createConvoyFormation, createConvoyMotion } from '../src/convoy-motion.js';
import { buildCinematicPlan, sampleCinematicTrack } from '../src/narrative-cinematics.js';
import { CHAPTERS } from '../src/story.js';
import { getChapterLayout } from '../src/chapter-layouts.js';

const mixed = Array.from({ length: 12 }, (_, i) => i % 4 === 3 ? 'cargo-truck' : 'humvee');
const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function overlaps(a, b) {
  const axes = [[Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)]];
  for (const axis of axes) {
    const projection = p => Math.abs(axis[0] * Math.sin(p.yaw) + axis[1] * Math.cos(p.yaw)) * p.length / 2 + Math.abs(axis[0] * Math.cos(p.yaw) - axis[1] * Math.sin(p.yaw)) * (p.width || 2.5) / 2;
    if (Math.abs((b.position[0] - a.position[0]) * axis[0] + (b.position[2] - a.position[2]) * axis[1]) >= projection(a) + projection(b)) return false;
  }
  return true;
}

test('mixed convoy spacing includes both vehicle lengths and a real bumper gap', () => {
  const formation = createConvoyFormation(mixed);
  assert.equal(formation.filter(v => v.type === 'humvee').length, 9);
  assert.equal(formation.filter(v => v.type === 'cargo-truck').length, 3);
  for (let i = 1; i < formation.length; i++) assert.ok(formation[i].offset - formation[i - 1].offset >= (formation[i].length + formation[i - 1].length) / 2 + 3.59);
  assert.ok(formation.at(-1).offset > 95);
});

test('arc-length path rounds street corners, extrapolates the tail and never clamps vehicles together', () => {
  const path = createConvoyPath([[0, 0, -60], [0, 0, 0], [40, 0, 0], [40, 0, 55]]);
  assert.ok(path.length < 155 && path.length > 148);
  for (let d = .2; d < path.length; d += .2) {
    const a = path.sample(d - .2), b = path.sample(d);
    assert.ok(Math.hypot(...b.position.map((v, i) => v - a.position[i])) <= .20001);
    assert.ok(Math.abs(angle(a.yaw, b.yaw)) < .16, 'turning never snaps by 90 degrees');
  }
  assert.deepEqual(path.sample(-20).position, [0, 0, -80]);
  assert.throws(() => createConvoyPath([[0, 0], [0, 8], [0, 0]]), /U-turn/);
});

test('a twelve vehicle column remains ordered without body overlap through two opposing turns', () => {
  const motion = createConvoyMotion({ points: [[0, 0, -90], [0, 0, 0], [45, 0, 0], [45, 0, 70]], vehicles: mixed, duration: 75, startDistance: 52, stopDistance: 190 });
  let maximumSteer = 0;
  for (let t = 0; t < 75; t += .25) {
    const poses = mixed.map((_, i) => motion.at(t, i));
    for (let i = 0; i < poses.length; i++) {
      maximumSteer = Math.max(maximumSteer, Math.abs(poses[i].steer));
      for (let j = i + 1; j < poses.length; j++) assert.equal(overlaps(poses[i], poses[j]), false, `vehicle bodies ${i}/${j} overlap at ${t}s`);
      if (i) assert.ok(poses[i - 1].distance > poses[i].distance);
    }
  }
  assert.ok(maximumSteer > .15);
});

test('redirection stops the entire line, waits, then accelerates and brakes to rest without reversing', () => {
  const motion = createConvoyMotion({ points: [[0, 0, 0], [0, 0, 120]], vehicles: mixed, duration: 60, startDistance: 20, waitAt: 33, waitSeconds: 2.5, stopDistance: 72 });
  const stopped = motion.frames.filter(f => Math.abs(f.distance - 33) < .035 && f.speed < .1);
  assert.ok(stopped.at(-1).time - stopped[0].time >= 2.4);
  for (let i = 1; i < motion.frames.length; i++) {
    assert.ok(motion.frames[i].distance >= motion.frames[i - 1].distance);
    assert.ok(Math.abs(motion.frames[i].speed - motion.frames[i - 1].speed) < .15, 'speed transition remains gradual');
  }
  assert.equal(motion.at(60).speed, 0); assert.equal(motion.at(60).distance, 72);
  assert.deepEqual(motion.at(10, 5), motion.at(10, 5), 'absolute-time sampling is deterministic');
});

test('all authored convoy routes keep full vehicle bodies outside chapter building footprints', () => {
  for (const chapter of CHAPTERS) for (const phase of ['opening', 'closing']) {
    const layout = getChapterLayout(chapter.id), plan = buildCinematicPlan({ chapter, layout, phase });
    if (!plan.convoy) continue;
    const motion = createConvoyMotion(plan.convoy.config);
    for (let t = 0; t <= plan.duration; t += .25) for (let index = 0; index < motion.formation.length; index++) {
      const vehicle = motion.at(t, index);
      for (const b of layout.buildings || []) assert.equal(overlaps(vehicle, { position: [b.x, 0, b.z], yaw: 0, length: b.d, width: b.w }), false, `chapter ${chapter.id} ${phase} vehicle ${index} enters building ${b.x}/${b.z} at ${t}s`);
    }
    if (chapter.id === 8) {
      const blocked = layout.props.find(p => p.kind === 'barricade');
      assert.equal(overlaps(motion.at(motion.duration, 0), { position: [blocked.pos[0], 0, blocked.pos[1]], yaw: 0, length: 1.2, width: 7 }), false, 'the leading bumper stops before the roadblock');
    }
  }
});

test('chapter eight return travels back through the street turns and the leading vehicle exits toward the original approach', () => {
  const chapter = CHAPTERS[7], layout = getChapterLayout(8);
  const opening = buildCinematicPlan({ chapter, layout, phase: 'opening' });
  const closing = buildCinematicPlan({ chapter, layout, phase: 'closing' });
  assert.deepEqual(closing.convoy.config.points, [...opening.convoy.config.points].reverse());
  const motion = createConvoyMotion(closing.convoy.config), first = motion.at(0), last = motion.at(closing.duration);
  assert.equal(motion.formation.length, 9); assert.ok(last.position[2] > layout.cinematic.vehicleRoute[0][2]);
  assert.ok(last.position[2] - first.position[2] > 35, 'the return crosses the final street junction before the scene ends');
  assert.ok(closing.stages.some(s => s.name === 'convoy-returns'));
  for (let t = .25; t <= closing.duration; t += .25) {
    const poses = motion.formation.map((_, i) => motion.at(t, i));
    for (let i = 0; i < poses.length; i++) {
      assert.ok(poses[i].distance >= motion.at(t - .25, i).distance);
      assert.ok(Math.abs(angle(poses[i].yaw, motion.at(t - .25, i).yaw)) < .26, 'returning vehicles steer continuously');
      for (let j = i + 1; j < poses.length; j++) assert.equal(overlaps(poses[i], poses[j]), false);
    }
  }
});

test('all independent convoy performers stay clear of moving vehicles, including any withdrawal stop or reversal', () => {
  for (const chapter of CHAPTERS) for (const phase of ['opening', 'closing']) {
    const plan = buildCinematicPlan({ chapter, layout: getChapterLayout(chapter.id), phase }); if (!plan.convoy) continue;
    const motion = createConvoyMotion(plan.convoy.config), actors = plan.actors.filter(a => !a.crew);
    const independentProgress = plan.playerAction?.id === 'foot-withdrawal';
    for (let t = 0; t <= plan.duration + .0001; t += .1) {
      const cars = motion.formation.map((_, i) => motion.at(t, i));
      // Sample every reachable earlier progress against the advancing vehicle
      // clock. A player can wait/reverse, but cannot run ten seconds of the
      // authored walk in the first three seconds of real simulation.
      const action = plan.playerAction;
      const maximum = !independentProgress || t <= action.start ? t : t <= action.start + action.seconds
        ? action.start + (action.end - action.start) * (t - action.start) / action.seconds
        : action.end + t - action.start - action.seconds;
      const minimum = independentProgress ? Math.min(t, action.start) : t;
      const actorTimes = independentProgress ? Array.from({ length: Math.floor((Math.min(maximum, plan.duration) - minimum) * 10) + 1 }, (_, i) => minimum + i / 10) : [t];
      for (const actorTime of actorTimes) for (const actor of actors) {
        if (actor.visible && (actorTime < actor.visible[0] || actorTime > actor.visible[1])) continue;
        const p = sampleCinematicTrack(actor.keys, actorTime).position, radius = actor.kind === 'wounded' ? .55 : .34;
        for (let i = 0; i < cars.length; i++) {
          const v = cars[i], dx = p[0] - v.position[0], dz = p[2] - v.position[2];
          const x = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw), z = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw), width = v.type === 'cargo-truck' ? 2.36 : 2.16;
          assert.ok(Math.abs(x) > width / 2 + radius || Math.abs(z) > v.length / 2 + radius, `chapter ${chapter.id} ${phase}: ${actor.id} (${actorTime}s) meets vehicle ${i} (${t}s)`);
        }
      }
    }
  }
});
