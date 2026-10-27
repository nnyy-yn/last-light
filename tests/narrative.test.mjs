import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrative, needsWorldTarget, INTERACTIONS } from '../src/narrative.js';
import { CHAPTERS, INITIAL_RESOURCES, getEpilogue } from '../src/story.js';

const dialogue = [
  { speaker: '队员', text: '人员还没有齐。', channel: 'local' },
  { speaker: '玩家', text: '我留在这里，等最后一个人。', channel: 'local' },
  { speaker: '队员', text: '明白，我去接他。', channel: 'local' },
];
const target = { near: true, clear: true };
const makeTask = (interaction, extra = {}) => ({ id: 'first', interaction, seconds: 2, dialogue, ...extra });
const makeChapter = (...tasks) => ({ id: 100, tasks });
function confirmDialogue(machine, context = target) {
  const events = [];
  for (let index = 0; index < 4; index++) events.push(...machine.press(context).events);
  return events;
}

test('a local decision blocks progression until a valid option and emits its effects token once',()=>{
  const task=makeTask('talk',{decision:{prompt:'交出敷料？',options:[{id:'share',label:'交出',effects:{medicine:-1}},{id:'keep',label:'保留',effects:{cohesion:-1}}]}});
  const machine=createNarrative(makeChapter(task,makeTask('reach',{id:'next'})));
  assert.equal(confirmDialogue(machine).at(-1).type,'decision');
  assert.equal(machine.inspect().phase,'decision');
  assert.deepEqual(machine.update(500,{...target,held:true}).events,[]);
  assert.deepEqual(machine.press(target).events,[]);
  assert.deepEqual(machine.chooseOption('unknown').events,[]);
  const result=machine.chooseOption('share');
  assert.deepEqual(result.events.map(e=>e.type),['decision-made','task-complete']);
  assert.equal(result.events[0].optionId,'share');assert.equal(result.taskId,'next');
  assert.deepEqual(machine.chooseOption('share').events,[]);
});

test('decision before a physical action never skips the action; prefix resume never emits rewards',()=>{
  const task=makeTask('hold',{decision:{prompt:'谁来接手？',options:[{id:'help',label:'协助'},{id:'direct',label:'引导'}]}});
  const machine=createNarrative(makeChapter(task,makeTask('reach',{id:'next'})));
  confirmDialogue(machine);const selected=machine.chooseOption('help');
  assert.equal(selected.phase,'action');assert.deepEqual(selected.events.map(e=>e.type),['decision-made','action-start']);
  assert.equal(machine.update(1,{...target,held:true}).complete,false);
  assert.equal(machine.update(1,{...target,held:true}).events[0].type,'task-complete');
  assert.equal(machine.restoreCompleted(['next']),false);
  assert.equal(machine.restoreCompleted(['first']),true);assert.equal(machine.inspect().phase,'idle');
  assert.equal(machine.inspect().taskId,'next');assert.equal(machine.update(10,target).events.length,0);
});

test('optional detour can be declined once but required operations cannot be skipped',()=>{
  const machine=createNarrative(makeChapter(makeTask('defend',{optional:true,defendSeconds:18}),makeTask('talk',{id:'required'})));
  const skipped=machine.skipOptional();assert.equal(skipped.events[0].skipped,true);assert.equal(skipped.taskId,'required');
  assert.deepEqual(machine.skipOptional().events,[]);assert.equal(machine.inspect().taskId,'required');
});

test('all 16 chapters have three attributed two-way tasks and unique staging hooks', () => {
  assert.equal(CHAPTERS.length, 16);
  const staging = new Set(), events = new Set();
  const kinds = new Set(['civilian', 'soldier', 'wounded', 'supplies', 'vehicle', 'wreck', 'memorial', 'waypoint']);
  for (const chapter of CHAPTERS) {
    assert.equal(chapter.tasks.length, 3);
    for (const phase of ['opening', 'closing']) {
      assert.match(chapter[phase], new RegExp(`^ch${String(chapter.id).padStart(2, '0')}-`));
      assert.ok(!staging.has(chapter[phase])); staging.add(chapter[phase]);
    }
    for (const task of chapter.tasks) {
      assert.ok(kinds.has(task.kind));
      assert.ok(INTERACTIONS.includes(task.interaction));
      assert.ok(task.dialogue.length >= 3);
      assert.ok(new Set(task.dialogue.map(line => line.speaker)).size >= 2);
      assert.ok(task.speaker && task.dialogue.some(line => line.speaker === task.speaker));
      assert.ok(task.dialogue.every(line => line.text.trim() && ['local', 'radio'].includes(line.channel)));
      assert.ok(task.animation && task.sceneEvent);
      assert.ok(!events.has(task.sceneEvent)); events.add(task.sceneEvent);
    }
  }
  assert.equal(events.size, 48); assert.equal(staging.size, 32);
});

test('radio tasks use the carried set and never request a spawned radio object', () => {
  const radioTasks = CHAPTERS.flatMap(chapter => chapter.tasks).filter(task => task.interaction === 'radio');
  assert.equal(radioTasks.length, 8);
  for (const task of radioTasks) {
    assert.equal(task.spawn, false);
    assert.equal(task.kind, 'waypoint');
    assert.equal(needsWorldTarget(task), false);
    assert.ok(task.dialogue.every(line => line.channel === 'radio'));
  }
  const machine = createNarrative(makeChapter(makeTask('radio', { spawn: false })));
  const events = confirmDialogue(machine, { near: false, clear: false });
  assert.equal(events.filter(event => event.type === 'task-complete').length, 1);
  assert.equal(machine.inspect().complete, true);
});

test('one held key cannot advance dialogue; last displayed line must be acknowledged', () => {
  const machine = createNarrative(makeChapter(makeTask('talk')));
  assert.equal(machine.press(target).line.text, dialogue[0].text);
  for (let index = 0; index < 40; index++) machine.update(.25, { ...target, held: true });
  assert.equal(machine.inspect().lineIndex, 0);
  machine.press({ ...target, repeat: true });
  assert.equal(machine.inspect().lineIndex, 0);
  machine.press(target);
  const lastLine = machine.press(target);
  assert.equal(lastLine.line.text, dialogue[2].text);
  assert.equal(lastLine.complete, false);
  assert.ok(!lastLine.events.some(event => event.type === 'task-complete'));
  const completed = machine.press(target);
  assert.equal(completed.complete, true);
  assert.equal(completed.phase, 'done');
  assert.deepEqual(completed.events.map(event => event.type), ['task-complete']);
});

test('later tasks cannot be selected, completed, or preloaded through context', () => {
  const machine = createNarrative(makeChapter(makeTask('talk'), makeTask('hold', { id: 'second' })));
  for (let index = 0; index < 8; index++) {
    assert.equal(machine.press({ ...target, taskId: 'second', kills: 99 }).events.length, 0);
    machine.update(50, { ...target, taskId: 'second', held: true });
  }
  assert.equal(machine.inspect().taskIndex, 0);
  assert.equal(machine.inspect().phase, 'idle');
  assert.equal(machine.inspect().kills, 0);
  const events = confirmDialogue(machine);
  assert.equal(events.at(-1).taskId, 'first');
  assert.equal(events.at(-1).taskIndex, 0);
  assert.equal(machine.inspect().taskId, 'second');
  assert.equal(machine.inspect().phase, 'idle');
  assert.equal(machine.inspect().complete, false);
});

test('local dialogue cannot start or advance remotely, through a wall, or while blocked', () => {
  const machine = createNarrative(makeChapter(makeTask('talk')));
  for (const context of [{ near: false, clear: true }, { near: true, clear: false }, { ...target, blocked: true }, { ...target, paused: true }]) {
    assert.equal(machine.press(context).phase, 'idle');
  }
  machine.press(target);
  assert.equal(machine.press({ near: false, clear: true }).lineIndex, 0);
  assert.equal(machine.press({ near: true, clear: false }).lineIndex, 0);
});

test('radio still respects blocked and paused states', () => {
  const machine = createNarrative(makeChapter(makeTask('radio', { spawn: false })));
  assert.equal(machine.press({ blocked: true }).phase, 'idle');
  assert.equal(machine.press({ paused: true }).phase, 'idle');
  machine.press({});
  assert.equal(machine.press({ paused: true }).lineIndex, 0);
});

test('physical actions start only after dialogue and need their own action condition', () => {
  const machine = createNarrative(makeChapter(makeTask('hold', { animation: 'treat' })));
  machine.update(100, { ...target, held: true });
  assert.equal(machine.inspect().phase, 'idle');
  const events = confirmDialogue(machine);
  assert.deepEqual(events.at(-1), { type: 'action-start', taskId: 'first', taskIndex: 0, interaction: 'hold', animation: 'treat' });
  assert.equal(machine.inspect().phase, 'action');
  assert.equal(machine.inspect().progress, 0);
  for (let index = 0; index < 10; index++) machine.press(target);
  assert.equal(machine.inspect().complete, false);
  assert.equal(machine.update(1, { ...target, held: true }).progress, .5);
  assert.equal(machine.update(1, { ...target, held: true }).complete, true);
});

test('releasing, leaving range, losing line of sight, or pausing cancels a hold', () => {
  for (const interrupted of [{ ...target, held: false }, { near: false, clear: true, held: true }, { near: true, clear: false, held: true }, { ...target, held: true, paused: true }, { ...target, held: true, blocked: true }]) {
    const machine = createNarrative(makeChapter(makeTask('hold')));
    confirmDialogue(machine);
    machine.update(1.5, { ...target, held: true });
    assert.equal(machine.update(.1, interrupted).holdElapsed, 0);
    assert.equal(machine.update(.6, { ...target, held: true }).complete, false);
  }
});

test('cancel resets a hold without erasing a conversation or already valid defence time', () => {
  const talk = createNarrative(makeChapter(makeTask('talk')));
  talk.press(target); talk.press(target); talk.cancel();
  assert.equal(talk.inspect().lineIndex, 1);
  const defend = createNarrative(makeChapter(makeTask('defend', { defendSeconds: 4 })));
  confirmDialogue(defend);
  defend.update(2, target); defend.cancel();
  assert.equal(defend.inspect().defendElapsed, 2);
  assert.equal(defend.inspect().phase, 'action');
});

test('defence requires real in-range time and the chapter kill gate independently', () => {
  const machine = createNarrative(makeChapter(makeTask('defend', { defendSeconds: 4, requiredKills: 2 })));
  confirmDialogue(machine);
  machine.update(100, { near: false, clear: true, kills: 1 });
  machine.update(100, { near: true, clear: false, kills: 1 });
  assert.equal(machine.inspect().defendElapsed, 0);
  machine.update(4, { ...target, kills: 1 });
  assert.equal(machine.inspect().progress, 1);
  assert.equal(machine.inspect().complete, false);
  assert.equal(machine.update(0, { ...target, kills: 2 }).complete, true);
});

test('enemies killed earlier in the chapter count, avoiding a cleared-street soft lock', () => {
  const machine = createNarrative(makeChapter(makeTask('talk'), makeTask('defend', { id: 'second', defendSeconds: 2, requiredKills: 2 })));
  confirmDialogue(machine, { ...target, kills: 3 });
  confirmDialogue(machine, { ...target, kills: 3 });
  const completed = machine.update(2, { ...target, kills: 3 });
  assert.equal(completed.complete, true);
  assert.equal(completed.kills, 3);
});

test('defence stops during pause and cannot complete outside its assigned position', () => {
  const machine = createNarrative(makeChapter(makeTask('defend', { defendSeconds: 4, requiredKills: 1 })));
  confirmDialogue(machine);
  machine.update(2, { ...target, kills: 1 });
  machine.update(100, { ...target, paused: true, kills: 1 });
  assert.equal(machine.inspect().defendElapsed, 2);
  machine.update(100, { near: false, clear: true, kills: 1 });
  assert.equal(machine.inspect().complete, false);
  assert.equal(machine.update(2, { ...target, kills: 1 }).complete, true);
});

test('invalid and backwards time cannot advance a hold or defence', () => {
  for (const interaction of ['hold', 'defend']) {
    const machine = createNarrative(makeChapter(makeTask(interaction, { defendSeconds: 2 })));
    confirmDialogue(machine);
    for (const dt of [NaN, Infinity, -1, -Infinity, undefined]) machine.update(dt, { ...target, held: true });
    assert.equal(machine.inspect().progress, 0);
    assert.equal(machine.inspect().complete, false);
  }
});

test('escort requires both player arrival and the actual escorted actor arrival', () => {
  const machine = createNarrative(makeChapter(makeTask('escort')));
  confirmDialogue(machine);
  assert.equal(machine.update(10, { ...target, escortReady: false }).complete, false);
  assert.equal(machine.update(10, { near: false, clear: true, escortReady: true }).complete, false);
  assert.equal(machine.update(10, { near: true, clear: false, escortReady: true }).complete, false);
  assert.equal(machine.update(.1, { ...target, escortReady: true }).complete, true);
  const escorts = CHAPTERS.flatMap(chapter => chapter.tasks.map((task, index) => ({ chapter, task, index }))).filter(({ task }) => task.interaction === 'escort');
  assert.equal(escorts.length, 3);
  for (const { chapter, task, index } of escorts) {
    assert.ok(task.escortFromPrevious);
    assert.ok(chapter.tasks.slice(0, index).some(previous => previous.id === task.escortFrom));
  }
});

test('reach cannot bypass its conversation or complete through an obstructed target', () => {
  const machine = createNarrative(makeChapter(makeTask('reach')));
  machine.update(10, target);
  assert.equal(machine.inspect().phase, 'idle');
  confirmDialogue(machine);
  assert.equal(machine.update(1, { near: true, clear: false }).complete, false);
  assert.equal(machine.update(1, target).complete, true);
});

test('completion and scene events are emitted exactly once and identify the completed task', () => {
  const machine = createNarrative(makeChapter(makeTask('talk', { sceneEvent: 'scene-test', animation: 'talk' })));
  const events = confirmDialogue(machine);
  const completed = events.find(event => event.type === 'task-complete');
  assert.equal(completed.sceneEvent, 'scene-test');
  assert.equal(completed.taskId, 'first');
  for (let index = 0; index < 5; index++) {
    assert.equal(machine.press(target).events.length, 0);
    assert.equal(machine.update(10, { ...target, held: true }).events.length, 0);
    assert.equal(machine.cancel().events.length, 0);
  }
});

test('reset restarts the current chapter or a new chapter without retaining progress', () => {
  const machine = createNarrative(makeChapter(makeTask('hold')));
  confirmDialogue(machine, { ...target, kills: 3 });
  machine.update(1, { ...target, held: true });
  machine.reset();
  assert.equal(machine.inspect().phase, 'idle');
  assert.equal(machine.inspect().kills, 0);
  assert.equal(machine.inspect().holdElapsed, 0);
  machine.reset({ id: 99, tasks: [makeTask('talk', { id: 'new' })] });
  assert.equal(machine.inspect().chapterId, 99);
  assert.equal(machine.inspect().taskId, 'new');
});

test('returned dialogue and external authored data cannot corrupt the state machine', () => {
  const source = makeChapter(makeTask('talk', { dialogue: dialogue.map(line => ({ ...line })) }));
  const machine = createNarrative(source);
  source.tasks[0].dialogue[0].text = 'mutated';
  source.tasks[0].interaction = 'hold';
  const returned = machine.press(target);
  returned.line.text = 'another mutation';
  returned.events[0].line.text = 'event mutation';
  assert.equal(machine.inspect().line.text, dialogue[0].text);
  assert.equal(machine.inspect().interaction, 'talk');
});

test('Durant stays injured in the cockpit; fixed deaths are not kill-gated survival challenges', () => {
  const durant = CHAPTERS[8];
  assert.equal(durant.playerMode, 'cockpit');
  assert.equal(durant.movementLocked, true);
  assert.equal(durant.armed, false);
  assert.ok(durant.tasks.every(task => task.anchor === 'cockpit' && !['reach', 'escort', 'defend'].includes(task.interaction)));
  assert.ok(!/意识片段|意识回想|街道行走/.test(JSON.stringify(durant)));
  assert.equal(durant.tasks[1].animation, 'injured-seated');
  assert.equal(durant.tasks[1].spawn, false);
  for (const chapter of [CHAPTERS[9], CHAPTERS[10]]) {
    assert.ok(chapter.fixedOutcome);
    assert.ok(chapter.tasks.every(task => !task.requiredKills && task.interaction !== 'defend'));
  }
});

test('all 48 authored tasks can complete in order through their explicit conditions', () => {
  let completions = 0;
  for (const chapter of CHAPTERS) {
    const machine = createNarrative(chapter);
    const before = JSON.stringify(chapter);
    for (const [index, task] of chapter.tasks.entries()) {
      assert.equal(machine.inspect().taskIndex, index);
      const context = { ...target, taskId: task.id, kills: chapter.hostiles.length };
      for (let line = 0; line <= task.dialogue.length; line++) completions += machine.press(context).events.filter(event => event.type === 'task-complete').length;
      if (!['talk', 'radio'].includes(task.interaction)) {
        const result = machine.update(Math.max(task.seconds, task.defendSeconds || 0), { ...context, held: true, escortReady: true });
        completions += result.events.filter(event => event.type === 'task-complete').length;
      }
      assert.equal(machine.inspect().taskIndex, index + 1, `chapter ${chapter.id}/${task.id}`);
    }
    assert.equal(machine.inspect().complete, true);
    assert.equal(JSON.stringify(chapter), before);
  }
  assert.equal(completions, 48);
});

test('choices, resource dimensions and fixed ending structure remain available', () => {
  assert.deepEqual(INITIAL_RESOURCES, { trust: 2, medicine: 3, ammo: 90, civilians: 0, fatigue: 0, cohesion: 2 });
  const flags = CHAPTERS.flatMap(chapter => chapter.choice.options.map(option => option.flag));
  assert.equal(flags.length, 32); assert.equal(new Set(flags).size, 32);
  assert.ok(CHAPTERS.every(chapter => chapter.choice.options.length === 2));
  assert.equal(getEpilogue({ resources: INITIAL_RESOURCES, flags: [] }).paragraphs.length, 6);
});

test('malformed authoring fails explicitly instead of creating a silent stuck task', () => {
  assert.throws(() => createNarrative(makeChapter()), /ordered tasks/);
  assert.throws(() => createNarrative(makeChapter(makeTask('unknown'))), /Unknown interaction/);
  assert.throws(() => createNarrative(makeChapter(makeTask('hold', { seconds: 0 }))), /hold duration/);
  assert.throws(() => createNarrative(makeChapter(makeTask('defend'))), /defence duration/);
  assert.throws(() => createNarrative(makeChapter(makeTask('defend', { defendSeconds: 2, requiredKills: -1 }))), /kill gate/);
  assert.throws(() => createNarrative(makeChapter(makeTask('talk'), makeTask('talk'))), /unique/);
  assert.throws(() => createNarrative(makeChapter(makeTask('talk', { dialogue: [] }))), /attributed dialogue/);
});
