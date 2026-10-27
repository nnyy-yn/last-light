import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTERS} from '../src/story.js';
import {getChapterLayout} from '../src/chapter-layouts.js';
import {campaignChapter,placeCampaignTasks} from '../src/campaign-tasks.js';
import {createNarrative} from '../src/narrative.js';
import {buildCinematicPlan} from '../src/narrative-cinematics.js';

test('expanded campaign retains the original causal events and stable local character identities',()=>{
  const before=JSON.stringify(CHAPTERS);let required=0,optional=0,decisions=0;
  for(const base of CHAPTERS){
    const layout=getChapterLayout(base.id),chapter=placeCampaignTasks(base,layout,[]);
    assert.deepEqual(chapter.tasks.filter(t=>t.coreIndex!=null).map(t=>t.id),base.tasks.map(t=>t.id));
    for(const task of chapter.tasks){
      required+=!task.optional;optional+=!!task.optional;decisions+=!!task.decision;
      if(task.coreIndex!=null)assert.deepEqual(task.pos,layout.taskPositions[task.coreIndex]);
      if(task.actorFrom){const source=chapter.tasks.find(t=>t.id===task.actorFrom);assert.ok(source);assert.deepEqual(task.pos,source.pos);assert.equal(task.kind,source.kind);}
    }
    assert.equal(chapter.choice,base.choice,'Final choices must retain their authored identity for choose()');
    if(base.movementLocked)for(const task of chapter.tasks.filter(t=>t.extra)){assert.equal(task.spawn,false);assert.equal(task.kind,'waypoint');assert.ok(Math.hypot(task.pos[0]-layout.spawn[0],task.pos[1]-layout.spawn[1])<3.4);}
  }
  assert.deepEqual({required,optional,decisions},{required:192,optional:10,decisions:32});assert.equal(JSON.stringify(CHAPTERS),before);
});

test('sorting clinic water stays a conversation with the existing helper and cannot mint medicine',()=>{
  const chapter=placeCampaignTasks(CHAPTERS[0],getChapterLayout(1),[]),water=chapter.tasks.find(t=>t.id==='ch01-mission-separate-water'),helper=chapter.tasks.find(t=>t.id==='clinic-kit');
  assert.equal(water.actorFrom,helper.id);assert.equal(water.kind,'civilian');assert.equal(water.reward,undefined);assert.equal(helper.reward,'supplies');assert.deepEqual(water.pos,helper.pos);
});

test('clinic aid scenes use civilian volunteers instead of armed soldiers',()=>{
  const chapter=placeCampaignTasks(CHAPTERS[0],getChapterLayout(1),[]),layout=getChapterLayout(1);
  const opening=buildCinematicPlan({chapter,layout,phase:'opening'});assert.equal(opening.actors.find(a=>a.id==='aid-volunteer').kind,'civilian');
  const task=chapter.tasks.find(t=>t.animation==='treat'),action=buildCinematicPlan({chapter,layout,phase:'event',event:task});assert.equal(action.actors.find(a=>a.id==='helper').kind,'civilian');assert.equal(action.actors.find(a=>a.id==='patient').kind,'wounded');
});

test('expanded narrative cannot bypass decisions or physical actions and completes every authored operation once',()=>{
  let completed=0,choices=0;
  for(const base of CHAPTERS){const chapter=campaignChapter(base),machine=createNarrative(chapter);
    for(const task of chapter.tasks){const context={near:true,clear:true,kills:100,held:true,escortReady:true};
      for(let i=0;i<=task.dialogue.length;i++){const value=machine.press(context);completed+=value.events.filter(e=>e.type==='task-complete').length;}
      if(task.decision){assert.equal(machine.inspect().phase,'decision');assert.equal(machine.update(100,context).events.length,0);const value=machine.chooseOption(task.decision.options[0].id);choices+=value.events.filter(e=>e.type==='decision-made').length;completed+=value.events.filter(e=>e.type==='task-complete').length;}
      if(!['talk','radio'].includes(task.interaction)){assert.equal(machine.inspect().phase,'action');const value=machine.update(100,context);completed+=value.events.filter(e=>e.type==='task-complete').length;}
    }
    assert.equal(machine.inspect().complete,true);assert.equal(machine.update(100,{near:true,clear:true}).events.length,0);
  }assert.equal(completed,202);assert.equal(choices,32);
});

test('task cinematics use the resolved local action position after interleaving new operations',()=>{
  for(const id of[1,4,7,15]){const base=CHAPTERS[id-1],layout=getChapterLayout(id),chapter=placeCampaignTasks(base,layout,[]);
    for(const task of chapter.tasks){const plan=buildCinematicPlan({chapter,layout,phase:'event',event:task});assert.deepEqual(plan.anchor,[task.pos[0],0,task.pos[1]],task.id);assert.equal(plan.id,task.sceneEvent);}
  }
});
