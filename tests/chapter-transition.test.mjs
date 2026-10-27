import test from 'node:test';
import assert from 'node:assert/strict';
import {getChapterTransition,createChapterTransition} from '../src/chapter-transition.js';
import {CHAPTERS,INITIAL_RESOURCES} from '../src/story.js';
import {newCampaign,choose,canChoose} from '../src/simulation.js';

function toCovered(transition){for(let i=0;i<200&&transition.inspect().phase!=='covered';i++)transition.update(.025);assert.equal(transition.inspect().phase,'covered');}
function finish(transition){for(let i=0;i<200&&transition.active;i++)transition.update(.025);assert.equal(transition.inspect().phase,'complete');}

test('all fifteen bridges identify adjacent chapter roles, locations and actual story time',()=>{
  const plans=Array.from({length:15},(_,i)=>getChapterTransition(i+1));
  assert.equal(new Set(plans.map(p=>p.id)).size,15);
  for(const p of plans){assert.equal(p.to.id,p.from.id+1);assert.equal(p.to.role,CHAPTERS[p.to.id-1].role);assert.equal(p.to.time,CHAPTERS[p.to.id-1].time);assert.ok(p.to.location&&p.text);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.to));}
  assert.equal(getChapterTransition(8).continuity,'parallel');assert.equal(getChapterTransition(8).to.movementLocked,true);assert.equal(getChapterTransition(9).from.movementLocked,true);assert.equal(getChapterTransition(9).to.movementLocked,false);
  assert.equal(getChapterTransition(16),null);assert.throws(()=>getChapterTransition(0),RangeError);assert.throws(()=>getChapterTransition(1.5),RangeError);
});

test('scene swap only emits after an opaque frame and loading cannot expose an incomplete scene',()=>{
  const t=createChapterTransition();t.start(getChapterTransition(3));toCovered(t);
  assert.equal(t.inspect().opacity,1);assert.deepEqual(t.takeEvents(),[],'first opaque frame must precede load request');
  t.update(.016);const events=t.takeEvents();assert.equal(events.length,1);assert.equal(events[0].type,'swap-scene');assert.equal(events[0].toId,4);
  for(let i=0;i<100;i++)t.update(.1);
  assert.equal(t.inspect().phase,'covered');assert.equal(t.inspect().opacity,1);assert.deepEqual(t.takeEvents(),[],'a slow loader must not request duplicate swaps');
  assert.equal(t.sceneReady(events[0].id),true);t.update(.016);assert.equal(t.inspect().opacity,1,'first incoming render stays covered');
  finish(t);assert.equal(t.inspect().opacity,0);assert.deepEqual(t.takeEvents().map(e=>e.type),['complete']);t.update(1);assert.deepEqual(t.takeEvents(),[]);
});

test('pause freezes all bridge time and a stale completion cannot reveal a different chapter',()=>{
  const t=createChapterTransition();t.start(getChapterTransition(8));toCovered(t);t.update(.02);const previous=t.takeEvents()[0];t.pause();const paused=t.inspect();
  for(let i=0;i<20;i++)t.update(.1);assert.deepEqual(t.inspect(),paused);assert.equal(t.skip(),false);
  t.cancel();t.start(getChapterTransition(11));toCovered(t);t.update(.02);const current=t.takeEvents()[0];assert.notEqual(previous.id,current.id);assert.equal(t.sceneReady(previous.id),false);assert.equal(t.inspect().sceneReady,false);assert.equal(t.sceneReady(current.id),true);finish(t);
});

test('skip preserves the covered-frame swap gate and does not auto-complete an interactive opening',()=>{
  const t=createChapterTransition();t.start(getChapterTransition(8));assert.equal(t.skip(),true);assert.equal(t.inspect().opacity,1);assert.deepEqual(t.takeEvents(),[]);t.update(10);
  const swap=t.takeEvents();assert.equal(swap.length,1);assert.equal(swap[0].toId,9);t.skip();for(let i=0;i<20;i++)t.update(.1);assert.equal(t.inspect().phase,'covered');
  t.sceneReady(swap[0].id);finish(t);assert.equal(t.inspect().plan.to.movementLocked,true);assert.deepEqual(t.takeEvents().map(e=>e.type),['complete']);
});

test('the bridge never repeats choices or mutates carried resources and flags',()=>{
  const campaign=newCampaign(INITIAL_RESOURCES),t=createChapterTransition();
  for(const chapter of CHAPTERS.slice(0,15)){
    const option=chapter.choice.options.find(o=>canChoose(campaign.resources,o));choose(campaign,chapter,option);const committed=JSON.stringify(campaign);
    t.start(getChapterTransition(chapter.id),{response:option.response});assert.throws(()=>t.start(getChapterTransition(chapter.id)));toCovered(t);t.update(.02);const event=t.takeEvents()[0];t.sceneReady(event.id);finish(t);
    assert.equal(JSON.stringify(campaign),committed);assert.equal(t.inspect().response,option.response);assert.equal(campaign.history.length,chapter.id);
  }
});

test('invalid frame deltas do nothing and cancellation drops undelivered scene swaps',()=>{
  const t=createChapterTransition();t.start(getChapterTransition(1));const before=t.inspect();for(const dt of[NaN,Infinity,-1,0])t.update(dt);assert.deepEqual(t.inspect(),before);
  t.skip();t.update(.02);t.cancel();assert.deepEqual(t.takeEvents(),[]);assert.equal(t.inspect().phase,'idle');assert.equal(t.inspect().opacity,0);assert.equal(t.active,false);
});
