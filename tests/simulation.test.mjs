import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, RESOURCE_LIMITS, newCampaign, snapshot, applyEffects, choose,
  validateSave, saveCampaign, readCampaign, checkpoint, restoreChapter,
  blocked, movePlayer, lineBlocked, canFire, canChoose,
} from '../src/simulation.js';
import { CHAPTERS, INITIAL_RESOURCES, getEpilogue } from '../src/story.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function assertResources(resources) {
  for (const [key, [min, max]] of Object.entries(RESOURCE_LIMITS)) {
    assert.ok(Number.isFinite(resources[key]), `${key} must remain finite`);
    assert.ok(resources[key] >= min && resources[key] <= max, `${key} out of range: ${resources[key]}`);
  }
}
function walkCampaign(optionIndex) {
  const state = newCampaign(INITIAL_RESOURCES);
  for (const chapter of CHAPTERS) {
    checkpoint(state, chapter.id - 1);
    const preferred = chapter.choice.options[optionIndex];
    const selected = canChoose(state.resources, preferred) ? preferred
      : chapter.choice.options.find(option => canChoose(state.resources, option));
    assert.ok(selected, `chapter ${chapter.id} has no affordable continuation`);
    choose(state, chapter, selected);
    assertResources(state.resources);
    assert.equal(state.history.length, chapter.id);
    assert.equal(state.chapter, Math.min(chapter.id, 15));
    assert.equal(state.unlocked, Math.min(chapter.id + 1, 16));
    assert.equal(state.completed, chapter.id === 16);
  }
  return state;
}

test('both choice paths can advance through all sixteen chapters and reach an epilogue', () => {
  assert.equal(CHAPTERS.length, 16);
  for (const index of [0, 1]) {
    const state = walkCampaign(index);
    assert.equal(state.flags.length, 16);
    assert.equal(new Set(state.flags).size, 16);
    assert.deepEqual(state.history.map(entry => entry.chapter), Array.from({ length: 16 }, (_, n) => n + 1));
    const ending = getEpilogue(state);
    assert.equal(typeof ending.title, 'string');
    assert.ok(ending.paragraphs.length >= 3);
    assert.ok(ending.paragraphs.every(text => typeof text === 'string' && text.length > 0));
  }
  assert.notDeepEqual(getEpilogue(walkCampaign(0)), getEpilogue(walkCampaign(1)));
});

test('all 32 choices have distinct consequences and keep every resource within bounds', () => {
  const midpoint = Object.fromEntries(Object.entries(RESOURCE_LIMITS).map(([key, [low, high]]) => [key, Math.floor((low + high) / 2)]));
  const allFlags = new Set();
  for (const chapter of CHAPTERS) {
    assert.equal(chapter.choice.options.length, 2);
    const consequences = [];
    for (const option of chapter.choice.options) {
      assert.ok(option.label && option.description && option.response && option.flag);
      assert.ok(!allFlags.has(option.flag), `duplicate flag: ${option.flag}`);
      allFlags.add(option.flag);
      for (const [key, delta] of Object.entries(option.effects)) {
        assert.ok(key in RESOURCE_LIMITS, `unknown resource: ${key}`);
        assert.ok(Number.isFinite(delta));
      }
      consequences.push(applyEffects(midpoint, option.effects));
      for (const boundary of ['min', 'max']) {
        const resources = Object.fromEntries(Object.entries(RESOURCE_LIMITS).map(([key, pair]) => [key, pair[boundary === 'min' ? 0 : 1]]));
        assertResources(applyEffects(resources, option.effects));
      }
    }
    assert.notDeepEqual(consequences[0], consequences[1], `chapter ${chapter.id} has equivalent choices`);
  }
  assert.equal(allFlags.size, 32);
});

test('story tasks form reachable routes and unarmed perspectives contain no hostile actors', () => {
  const street = ([x, z]) => Math.abs(x) <= 8 && Math.abs(z) <= 85
    || Math.abs(x) <= 85 && [-50, 0, 50].some(center => Math.abs(z - center) <= 8);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.tasks.length >= 2 && chapter.tasks.length <= 3);
    assert.ok(street(chapter.spawn));
    let previous = chapter.spawn;
    let total = 0;
    for (const task of chapter.tasks) {
      assert.ok(street(task.pos), `chapter ${chapter.id}: task outside street`);
      const length = distance(previous, task.pos);
      assert.ok(length >= 15 && length <= 30, `chapter ${chapter.id}: unreachable pacing`);
      assert.ok(task.seconds > 0 && Number.isFinite(task.seconds));
      total += length;
      previous = task.pos;
    }
    assert.ok(total >= 40 && total <= 90);
    if (!chapter.armed) assert.equal(chapter.hostiles.length, 0);
    for (const hostile of chapter.hostiles) {
      assert.ok(street(hostile.pos));
      assert.ok(distance(chapter.spawn, hostile.pos) > 22);
    }
  }
});

test('new campaigns and snapshots do not share mutable resources or nested histories', () => {
  const original = { ...INITIAL_RESOURCES };
  const state = newCampaign(original);
  state.resources.ammo--;
  assert.deepEqual(original, INITIAL_RESOURCES);
  choose(state, CHAPTERS[0], CHAPTERS[0].choice.options[0]);
  const copy = snapshot(state);
  copy.history[0].effects.civilians = 900;
  copy.flags.push('changed');
  assert.notEqual(state.history[0].effects.civilians, 900);
  assert.ok(!state.flags.includes('changed'));
});

test('resource effects clamp finite deltas and ignore unknown or nonfinite deltas', () => {
  const original = { ...INITIAL_RESOURCES };
  const next = applyEffects(original, { ammo: -1000, medicine: 1000, trust: NaN, fatigue: Infinity, invented: 10 });
  assert.equal(next.ammo, 0);
  assert.equal(next.medicine, 12);
  assert.equal(next.trust, original.trust);
  assert.equal(next.fatigue, original.fatigue);
  assert.ok(!('invented' in next));
  assert.deepEqual(original, INITIAL_RESOURCES);
});

test('recording the same chapter twice cannot apply rewards twice', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  const chapter = CHAPTERS[0];
  choose(state, chapter, chapter.choice.options[0]);
  const once = snapshot(state);
  assert.throws(() => choose(state, chapter, chapter.choice.options[1]));
  assert.deepEqual(state, once);
});

test('resource costs cannot grant rewards when the player cannot pay', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  state.resources.medicine = 0;
  const medicalChoice = CHAPTERS[0].choice.options.find(option => option.effects.medicine < 0);
  assert.equal(canChoose(state.resources, medicalChoice), false);
  const before = snapshot(state);
  assert.throws(() => choose(state, CHAPTERS[0], medicalChoice));
  assert.deepEqual(state, before);
  assert.equal(canChoose({ ...state.resources, medicine: 1 }, medicalChoice), true);
  assert.equal(canChoose({ ...state.resources, ammo: 11 }, { effects: { ammo: -12 } }), false);
  assert.equal(canChoose({ ...state.resources, ammo: 12 }, { effects: { ammo: -12 } }), true);
});

test('every chapter retains an affordable choice even when medicine and ammunition are exhausted', () => {
  const empty = { ...INITIAL_RESOURCES, medicine: 0, ammo: 0 };
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.choice.options.some(option => canChoose(empty, option)), `chapter ${chapter.id} softlocks an exhausted player`);
  }
});

test('chapter progression rejects out-of-order choices without mutating progress', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  const before = snapshot(state);
  assert.throws(() => choose(state, CHAPTERS[15], CHAPTERS[15].choice.options[0]));
  assert.deepEqual(state, before);
});

test('a choice must belong to the current chapter', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  const before = snapshot(state);
  assert.throws(() => choose(state, CHAPTERS[0], CHAPTERS[1].choice.options[0]));
  assert.deepEqual(state, before);
});

test('save and reload preserve an in-progress campaign including its checkpoint', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  checkpoint(state, 0);
  choose(state, CHAPTERS[0], CHAPTERS[0].choice.options[0]);
  checkpoint(state, 1);
  const storage = memoryStorage();
  assert.equal(saveCampaign(storage, state), true);
  assert.deepEqual(readCampaign(storage), state);
  const loaded = readCampaign(storage);
  loaded.resources.ammo = 0;
  assert.notEqual(readCampaign(storage).resources.ammo, 0);
});

test('completed campaigns retain their ending and all choices after reload', () => {
  const storage = memoryStorage();
  const state = walkCampaign(1);
  assert.equal(saveCampaign(storage, state), true);
  const loaded = readCampaign(storage);
  assert.equal(loaded.completed, true);
  assert.equal(loaded.history.length, 16);
  assert.deepEqual(getEpilogue(loaded), getEpilogue(state));
});

test('missing, malformed or inaccessible storage fails safely', () => {
  const storage = memoryStorage();
  assert.equal(readCampaign(storage), null);
  for (const text of ['{', 'null', '[]', '"unexpected"', '{"version":99}']) {
    storage.setItem(SAVE_KEY, text);
    assert.equal(readCampaign(storage), null);
  }
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readCampaign(unavailable), null);
  assert.equal(saveCampaign(unavailable, newCampaign(INITIAL_RESOURCES)), false);
});

test('save validation rejects invalid chapter indices and out-of-range resources', () => {
  for (const chapter of [-1, 16, 0.5, NaN, '2']) {
    const state = newCampaign(INITIAL_RESOURCES);
    state.chapter = chapter;
    assert.equal(validateSave(state), null);
  }
  for (const [key, [low, high]] of Object.entries(RESOURCE_LIMITS)) {
    for (const value of [low - 1, high + 1, NaN, Infinity, '3', null]) {
      const state = newCampaign(INITIAL_RESOURCES);
      state.resources[key] = value;
      assert.equal(validateSave(state), null, `${key} accepted ${value}`);
    }
  }
});

test('malformed checkpoints are rejected or sanitized before they can crash replay', () => {
  for (const point of [{}, { resources: INITIAL_RESOURCES, flags: 42, history: [] }, { resources: { ...INITIAL_RESOURCES, ammo: -1 }, flags: [], history: [] }, { resources: INITIAL_RESOURCES, flags: [], history: null }]) {
    const state = newCampaign(INITIAL_RESOURCES);
    state.checkpoints = { 0: point };
    const validated = validateSave(state);
    if (!validated) continue;
    assert.doesNotThrow(() => restoreChapter(validated, 0));
    assertResources(validated.resources);
  }
});

test('save validation does not accept nonboolean completion or fractional unlock counts', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  state.completed = 'yes';
  state.unlocked = 7.5;
  const validated = validateSave(state);
  if (validated) {
    assert.equal(typeof validated.completed, 'boolean');
    assert.ok(Number.isInteger(validated.unlocked));
    assert.equal(validated.completed, false);
  }
});

test('invalid or duplicate history entries cannot survive save validation', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  state.history = [
    { chapter: 999, title: 'outside campaign', option: 'bad' },
    { chapter: -1, title: 'negative', option: 'bad' },
    { chapter: 1, title: 'valid', option: 'first' },
    { chapter: 1, title: 'duplicate', option: 'again' },
  ];
  const validated = validateSave(state);
  if (validated) {
    assert.ok(validated.history.every(entry => entry.chapter >= 1 && entry.chapter <= 16));
    assert.equal(new Set(validated.history.map(entry => entry.chapter)).size, validated.history.length);
  }
});

test('replaying a chapter restores its resources, flags and history instead of accumulating rewards', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  checkpoint(state, 0);
  const initial = snapshot(state);
  choose(state, CHAPTERS[0], CHAPTERS[0].choice.options[0]);
  checkpoint(state, 1);
  choose(state, CHAPTERS[1], CHAPTERS[1].choice.options[0]);
  checkpoint(state, 2);
  assert.equal(restoreChapter(state, 0), true);
  assert.deepEqual(state.resources, initial.resources);
  assert.deepEqual(state.flags, []);
  assert.deepEqual(state.history, []);
  assert.equal(state.completed, false);
  assert.ok(!state.checkpoints[1] && !state.checkpoints[2]);
  choose(state, CHAPTERS[0], CHAPTERS[0].choice.options[1]);
  const fresh = newCampaign(INITIAL_RESOURCES);
  choose(fresh, CHAPTERS[0], CHAPTERS[0].choice.options[1]);
  assert.deepEqual(state.resources, fresh.resources);
  assert.deepEqual(state.flags, fresh.flags);
  assert.deepEqual(state.history, fresh.history);
  assert.equal(state.history.length, 1);
});

test('reloading and replaying a completed campaign returns to a valid earlier checkpoint', () => {
  const storage = memoryStorage();
  const finished = walkCampaign(0);
  const expected = snapshot(finished.checkpoints[7]);
  saveCampaign(storage, finished);
  const state = readCampaign(storage);
  assert.equal(restoreChapter(state, 7), true);
  assert.equal(state.chapter, 7);
  assert.equal(state.unlocked, 8);
  assert.equal(state.completed, false);
  assert.deepEqual(state.resources, expected.resources);
  assert.deepEqual(state.history, expected.history);
  for (let index = 7; index < 16; index++) {
    checkpoint(state, index);
    choose(state, CHAPTERS[index], CHAPTERS[index].choice.options[1]);
  }
  assert.equal(state.completed, true);
  assert.equal(state.history.length, 16);
  assert.equal(new Set(state.history.map(entry => entry.chapter)).size, 16);
});

test('restoring a nonexistent checkpoint leaves campaign state unchanged', () => {
  const state = newCampaign(INITIAL_RESOURCES);
  const before = snapshot(state);
  assert.equal(restoreChapter(state, 8), false);
  assert.deepEqual(state, before);
});

test('movement does not tunnel through a thin wall even with a large movement delta', () => {
  const walls = [{ minX: -0.1, maxX: 0.1, minZ: -4, maxZ: 4 }];
  const player = { x: -2, z: 0 };
  movePlayer(player, 10, 0, walls);
  assert.ok(player.x < -0.45, `crossed wall: ${player.x}`);
  assert.equal(player.z, 0);
  assert.equal(blocked(player.x, player.z, walls), false);
});

test('movement slides along walls and respects world bounds', () => {
  const wall = [{ minX: 0, maxX: 2, minZ: -5, maxZ: 5 }];
  const player = { x: -1, z: -2 };
  movePlayer(player, 3, 3, wall);
  assert.ok(player.x <= -0.36);
  assert.ok(player.z > 0);
  assert.equal(blocked(player.x, player.z, wall), false);
  const open = { x: 0, z: 0 };
  movePlayer(open, 500, -500, [], 92);
  assert.deepEqual(open, { x: 92, z: -92 });
});

test('line of sight detects walls between points and ignores walls beyond the segment', () => {
  const wall = [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }];
  assert.equal(lineBlocked({ x: -4, z: 0 }, { x: 4, z: 0 }, wall), true);
  assert.equal(lineBlocked({ x: 0, z: -4 }, { x: 0, z: 4 }, wall), true);
  assert.equal(lineBlocked({ x: -4, z: -4 }, { x: 4, z: 4 }, wall), true);
  assert.equal(lineBlocked({ x: -4, z: 3 }, { x: 4, z: 3 }, wall), false);
  assert.equal(lineBlocked({ x: -4, z: 0 }, { x: -2, z: 0 }, wall), false);
  assert.equal(lineBlocked({ x: -4, z: 0 }, { x: -4, z: 0 }, wall), false);
  assert.equal(lineBlocked({ x: 0, z: 0 }, { x: 4, z: 0 }, wall), true);
});

test('shooting requires an armed active player, ammunition and a completed cooldown', () => {
  assert.equal(canFire('playing', true, 1, 0, 0), true);
  assert.equal(canFire('playing', true, 30, -.004, -.01), true, 'elapsed reload time cannot lock firing');
  for (const mode of ['menu', 'intro', 'paused', 'choice', 'debrief', 'ending', 'failed']) {
    assert.equal(canFire(mode, true, 30, 0, 0), false);
  }
  assert.equal(canFire('playing', false, 30, 0, 0), false);
  assert.equal(canFire('playing', true, 0, 0, 0), false);
  assert.equal(canFire('playing', true, 30, 1, 0), false);
  assert.equal(canFire('playing', true, 30, 0, 0.1), false);
  for (const chapter of CHAPTERS.filter(chapter => !chapter.armed)) {
    assert.equal(canFire('playing', chapter.armed, 30, 0, 0), false);
  }
});
