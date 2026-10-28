import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTERS} from '../src/story.js';
import {getChapterMissionPlan} from '../src/chapter-mission-plans.js';
import {CHAPTER_STORY_DIRECTIONS,getChapterStoryDirection,getChapterStoryActs,getTaskStoryDirection} from '../src/chapter-story-direction.js';
import {campaignChapter,placeCampaignTasks} from '../src/campaign-tasks.js';
import {getChapterLayout} from '../src/chapter-layouts.js';

const originalCoreIds=[['find-family','clinic-kit','quiet-street'],['check-kit','meet-miller','assemble'],['briefing','loadout','boarding'],['blackburn','stretcher','transfer'],['convoy-check','casualty-kit','contact-convoy'],['receive-update','rally-point','crash-approach'],['reconnect','side-patient','find-rally'],['road-status','rear-vehicle','link-back'],['durant-voice','durant-crew','durant-wait'],['second-wreck','protect-durant','relay-condition'],['medical-supplies','stay-smith','care-living'],['night-contact','night-supplies','night-patient'],['relief-contact','relief-patient','relief-vehicle'],['recover-crew','personal-items','last-count'],['run-rally','run-help','run-safe'],['leave-gear','visit-survivors','remember']];

test('every chapter has an explicit human goal, risk, turn and outgoing dramatic connection',()=>{
  assert.equal(CHAPTER_STORY_DIRECTIONS.length,16);const throughlines=new Set();
  for(const base of CHAPTERS){const chapter=campaignChapter(base),d=chapter.storyDirection;
    throughlines.add(d.throughline);for(const field of['throughline','stakes','turn','outcome','emotionalArc'])assert(d[field].length>12,`${base.id} ${field}`);
    assert.equal(chapter.intro,d.intro);assert.equal(base.choice.context,d.choiceContext);assert.equal(chapter.choice,base.choice,'Effects and choice option identity are preserved');
    assert.equal(d.handoff.nextChapterId,base.id===16?null:base.id+1);assert(d.handoff.lead&&d.handoff.reason);
    assert.equal(Object.keys(d.landmarks).length,3);for(const[anchor,mark]of Object.entries(d.landmarks)){assert.equal(mark.id,`ch${String(base.id).padStart(2,'0')}-${anchor}`);assert.equal(mark.coreIndex,Number(anchor.slice(-1)));}
    assert.deepEqual(base.tasks.map(t=>t.id),originalCoreIds[base.id-1]);
  }
  assert.equal(throughlines.size,16);
});

test('four acts begin at explicit dramatic tasks and cover the sequence without arbitrary equal slicing',()=>{
  let unequal=0;
  for(const base of CHAPTERS){const c=campaignChapter(base),acts=c.storyDirection.acts;
    assert.equal(acts.length,4);assert.deepEqual(acts.flatMap(a=>a.taskIds),c.tasks.map(t=>t.id));
    for(const act of acts){assert.equal(act.taskIds[0],act.startTaskId);assert(act.goal.length>8&&act.reason.length>12&&act.turn.length>8);assert(act.taskIds.every(id=>c.tasks.find(t=>t.id===id).actId===act.id));}
    if(new Set(acts.map(a=>a.taskIds.length)).size>1)unequal++;
  }
  assert(unequal>=12,'The scenes use authored turning points, not four equal task buckets');
  assert.equal(campaignChapter(CHAPTERS[0]).tasks[0].id,'find-family','Hawa gives the conflict before Amina is sent on errands');
  for(const id of[4,6,11])assert.equal(campaignChapter(CHAPTERS[id-1]).tasks[0].id,originalCoreIds[id-1][0],'Emergency care/report still comes first');
});

test('every operation has a causal purpose, concrete consequence, visible destination and usable route hint',()=>{
  let count=0;for(const base of CHAPTERS){const c=campaignChapter(base);for(const t of c.tasks){count++;
    for(const key of['storyPurpose','successText','routeHint','landmark','landmarkId','actId'])assert(typeof t[key]==='string'&&t[key].length>1,`${t.id} ${key}`);
    assert.notEqual(t.storyPurpose,t.label);assert.notEqual(t.successText,t.label);assert.equal(t.text,t.successText);
    assert(!/地面方向线|地面发光线|23分钟|固定结局|改写.*结局/.test(t.routeHint+t.successText));
    if(t.interaction==='radio')assert(/随身|座椅|座舱|原位|驾驶座/.test(t.routeHint));
    if(t.actorFrom&&c.tasks.some(source=>source.id===t.actorFrom&&source.stageCluster))assert.equal(t.stageCluster,c.tasks.find(source=>source.id===t.actorFrom).stageCluster);
  }}assert.equal(count,202);
});

test('supporting scenes are gathered near their dramatic station and preserve original core coordinates and people',()=>{
  for(const base of CHAPTERS){const layout=getChapterLayout(base.id),c=placeCampaignTasks(base,layout,[]);
    for(const t of c.tasks){
      if(t.coreIndex!=null){assert.deepEqual(t.pos,layout.taskPositions[t.coreIndex]);continue;}
      if(base.id===9){assert.equal(t.stageCluster,undefined);assert.equal(t.spawn,false);assert(Math.hypot(t.pos[0]-layout.spawn[0],t.pos[1]-layout.spawn[1])<3.4);continue;}
      assert(/^core[0-2]$/.test(t.stageCluster));
      if(t.actorFrom){assert.deepEqual(t.pos,c.tasks.find(s=>s.id===t.actorFrom).pos);continue;}
      const p=layout.taskPositions[Number(t.stageCluster.slice(-1))];assert(Math.hypot(t.pos[0]-p[0],t.pos[1]-p[1])<=13.001,'An incidental errand must not send the player to a remote 48–80m anchor');
    }
  }
});

test('front-facing scene directions avoid mechanics disclaimers and preserve vulnerable character restrictions',()=>{
  for(const base of CHAPTERS){assert(!/固定结局|击杀改写|schema|原型|尚未实测/.test(base.intro+base.choice.context));}
  assert.equal(CHAPTERS[8].movementLocked,true);assert.match(CHAPTERS[8].intro,/不能离开座椅/);
  assert.match(getChapterMissionPlan(10).fixedOutcome,/牺牲不随战斗成绩改变/);assert.match(getChapterMissionPlan(11).fixedOutcome,/死亡.*固定/);
  for(const id of[1,2,3,9,11,16])assert.equal(CHAPTERS[id-1].hostiles.length,0);
  for(const p of CHAPTERS.map(c=>getChapterMissionPlan(c.id))){assert.deepEqual(p.targetMinutes,[20,25]);assert.equal(p.estimatedMinutes,null);assert(p.acts.every(a=>a.minutes===undefined));}
});

test('direction data copies are isolated and incomplete authoring fails clearly',()=>{
  const a=getChapterStoryDirection(1);a.landmarks.core0.name='changed';a.acts[0].goal='changed';assert.notEqual(getChapterStoryDirection(1).landmarks.core0.name,'changed');
  assert.throws(()=>getChapterStoryDirection(0),RangeError);assert.throws(()=>getChapterStoryActs(1,['missing']),/Invalid dramatic/);assert.throws(()=>getTaskStoryDirection(1,{id:'missing'}),/Missing story consequence/);
});
