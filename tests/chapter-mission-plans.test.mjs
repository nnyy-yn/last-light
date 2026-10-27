import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTER_MISSION_PLANS,getChapterMissionPlan} from '../src/chapter-mission-plans.js';
import {CHAPTERS} from '../src/story.js';

const combat=new Set([4,5,6,7,8,10,12,13,14,15]);
const anchors=new Set(['core0','core1','core2','court0','court1','west','north','east','south','cockpit-seat','cockpit-radio','cockpit-controls','cockpit-door']);
const slot=t=>t.insertAfterCore===2?3:t.insertBeforeCore;
function interleave(plan,optional=true){
  const ordered=[];
  for(let s=0;s<4;s++){
    ordered.push(...plan.tasks.filter(t=>slot(t)===s&&(optional||!t.optional)).map(t=>t.id));
    if(s<3)ordered.push(plan.coreTaskIds[s]);
  }
  return ordered;
}

test('sixteen plans preserve the complete original story and contain twelve mandatory tasks each',()=>{
  assert.deepEqual(CHAPTER_MISSION_PLANS.map(p=>p.chapterId),CHAPTERS.map(c=>c.id));
  const all=new Set();
  for(const p of CHAPTER_MISSION_PLANS){
    const original=CHAPTERS.find(c=>c.id===p.chapterId);
    assert.deepEqual(p.coreTaskIds,original.tasks.map(t=>t.id));
    assert.equal(p.requiredTaskCount,12);
    assert.equal(p.tasks.filter(t=>!t.optional).length+original.tasks.length,p.requiredTaskCount);
    assert.equal(p.totalTaskCount,p.tasks.length+original.tasks.length);
    assert(p.totalTaskCount>=12&&p.totalTaskCount<=16);
    for(const t of p.tasks){assert(!all.has(t.id),t.id);all.add(t.id);assert.equal(t.sceneEvent,t.id);}
  }
  assert.equal(all.size,154);
  assert.equal(CHAPTER_MISSION_PLANS.reduce((n,p)=>n+p.totalTaskCount,0),202);
});

test('dependency chains and acts describe the actual interleaved story order without duplicate core tasks',()=>{
  for(const p of CHAPTER_MISSION_PLANS){
    const ordered=interleave(p),required=interleave(p,false),lookup=new Map(p.tasks.map(t=>[t.id,t]));
    assert.equal(new Set(ordered).size,ordered.length);
    assert.equal(p.acts.length,4);
    assert.deepEqual(p.acts.flatMap(a=>a.taskIds),ordered);
    for(const [i,id]of required.entries()){
      const t=lookup.get(id);if(!t)continue;
      assert.deepEqual(t.objective.dependsOn,i?[required[i-1]]:[]);
      assert(t.objective.reason.trim().length>5);
      assert(Number.isInteger(slot(t))&&slot(t)>=0&&slot(t)<=3);
      assert(!(t.insertBeforeCore!==undefined&&t.insertAfterCore!==undefined));
    }
    for(const t of p.tasks.filter(t=>t.optional))for(const dependency of t.objective.dependsOn)assert(ordered.indexOf(dependency)<ordered.indexOf(t.id));
  }
  for(const id of [4,6,11])assert.equal(interleave(getChapterMissionPlan(id))[0],CHAPTERS[id-1].tasks[0].id,'urgent aid/report must precede peripheral checks');
  assert(CHAPTER_MISSION_PLANS.some(p=>p.tasks.some(t=>t.insertAfterCore===2)));
});

test('time budgets remain explicit unverified estimates and do not introduce duration gates',()=>{
  for(const p of CHAPTER_MISSION_PLANS){
    assert.deepEqual(p.targetMinutes,[20,25]);
    assert(p.estimatedMinutes>=20&&p.estimatedMinutes+p.optionalEstimatedMinutes<=25);
    assert.equal(p.acts.reduce((n,a)=>n+a.minutes,0),p.estimatedMinutes);
    assert.equal(p.acts.reduce((n,a)=>n+(a.optionalMinutes||0),0),p.optionalEstimatedMinutes);
    assert.equal(Object.values(p.timeBudget).reduce((n,v)=>n+v,0),p.estimatedMinutes);
    assert.match(p.estimateNote,/设计估计.*尚未实测/);
    assert.match(p.budgetNote,/不能.*宣称/);
    for(const t of p.tasks){
      assert(t.seconds>=3&&t.seconds<=8);
      for(const key of ['minimumPlaytime','waitSeconds','chapterTimer','slowMovement'])assert.equal(t[key],undefined);
      assert.notEqual(t.interaction,'wait');
    }
  }
});

test('original scenes have attributed dialogue, varied locations, and interaction-specific animation',()=>{
  const dialogues=new Set();
  for(const p of CHAPTER_MISSION_PLANS){
    assert(new Set(p.tasks.map(t=>t.anchor)).size>=3,`chapter ${p.chapterId} needs distinct settings`);
    for(const t of p.tasks){
      assert(anchors.has(t.anchor),t.id+' '+t.anchor);
      assert(['talk','radio','hold','reach','escort','defend'].includes(t.interaction));
      assert(['talk','radio','treat','handover','observe','escort','defend','injured-seated'].includes(t.animation));
      assert(t.dialogue.length>=3,t.id);
      assert(new Set(t.dialogue.map(l=>l.text)).size>=3);
      assert(t.dialogue.every(l=>l.speaker.trim()&&l.text.trim().length>=12&&['radio','local'].includes(l.channel)),t.id);
      const signature=JSON.stringify(t.dialogue.map(l=>l.text));assert(!dialogues.has(signature),'whole conversations may not be reused');dialogues.add(signature);
      if(t.interaction==='escort')assert(t.escortFrom,'escorts require an explicit existing person');
    }
  }
  assert.equal([...dialogues].length,154);
});

test('each chapter has two specific binary choices with bounded, non-dominating resource effects',()=>{
  const resourceKeys=['trust','cohesion','civilians','medicine'];
  for(const p of CHAPTER_MISSION_PLANS){
    const choices=p.tasks.filter(t=>t.decision);assert.equal(choices.length,2,`chapter ${p.chapterId}`);
    for(const t of choices){
      const d=t.decision;assert(d.prompt.length>12);assert.equal(d.options.length,2);assert.equal(new Set(d.options.map(o=>o.id)).size,2);
      for(const o of d.options){
        assert(o.label.length>=5&&o.response.length>=25,t.id);
        assert(Object.keys(o.effects).length);
        for(const [key,value]of Object.entries(o.effects)){assert(resourceKeys.includes(key));assert(Number.isFinite(value)&&Math.abs(value)<=1&&value!==0);}
      }
      const [a,b]=d.options.map(o=>resourceKeys.map(k=>o.effects[k]||0));
      assert(a.some((v,i)=>v>b[i])&&b.some((v,i)=>v>a[i]),'each option must give up a benefit available in the alternative');
      assert.notEqual(d.options[0].response,d.options[1].response);
    }
  }
});

test('optional defence remains short and peaceful chapters cannot gain enemies or mandatory combat gates',()=>{
  for(const p of CHAPTER_MISSION_PLANS){
    assert.equal(p.combat,combat.has(p.chapterId));
    const optional=p.tasks.filter(t=>t.optional),defences=p.tasks.filter(t=>t.interaction==='defend');
    assert.equal(optional.length,combat.has(p.chapterId)?1:0);
    assert.deepEqual(defences,optional);
    if(!combat.has(p.chapterId))assert.equal(CHAPTERS[p.chapterId-1].hostiles.length,0);
    for(const t of optional){assert.equal(t.branch.mode,'optional');assert(t.branch.acceptLabel&&t.branch.declineLabel);assert.equal(t.defendSeconds,18);assert.equal(t.requiredKills,1);assert(!t.decision);}
  }
});

test('actor references point to real people without cycles or duplicate wounded bodies',()=>{
  for(const p of CHAPTER_MISSION_PLANS){
    const original=CHAPTERS[p.chapterId-1],all=new Map([...original.tasks,...p.tasks].map(t=>[t.id,t]));
    for(const t of p.tasks){
      if(!t.actorFrom)continue;
      assert(all.has(t.actorFrom),t.id);assert.notEqual(t.actorFrom,t.id);assert(t.personId);
      let current=t;const seen=new Set();
      while(current.actorFrom){assert(!seen.has(current.id));seen.add(current.id);current=all.get(current.actorFrom);assert(current);}
      if(!p.coreTaskIds.includes(t.actorFrom))assert(p.tasks.indexOf(all.get(t.actorFrom))<p.tasks.indexOf(t));
    }
  }
  for(const [chapterId,speaker,source]of [[7,'哈里斯（原创）','side-patient'],[10,'杜兰特','protect-durant'],[11,'米勒（原创）','care-living'],[15,'哈里斯（原创）','run-help']]){
    for(const t of getChapterMissionPlan(chapterId).tasks.filter(t=>t.speaker===speaker&&t.spawn!==false)){assert.equal(t.actorFrom,source);assert.equal(t.kind,'wounded');}
  }
});

test('injured cockpit and historical deaths cannot be rewritten by additional objectives',()=>{
  const cockpit=getChapterMissionPlan(9);
  assert.equal(cockpit.playerMode,'injured-cockpit');assert.equal(cockpit.timeBudget.travel,0);assert.match(cockpit.timelineNote,/主观意识/);
  for(const t of cockpit.tasks){assert.equal(t.spawn,false);assert.equal(t.playerMode,'injured-cockpit');assert(!['reach','escort','defend'].includes(t.interaction));assert(!t.actorFrom);assert(t.anchor.startsWith('cockpit-'));}
  assert.match(getChapterMissionPlan(10).fixedOutcome,/牺牲不随战斗成绩改变/);
  assert.match(getChapterMissionPlan(11).fixedOutcome,/死亡.*固定/);
  assert.equal(CHAPTERS[8].movementLocked,true);
});

test('callers receive independent plans and cannot mutate core story data through them',()=>{
  const original=JSON.stringify(CHAPTERS),a=getChapterMissionPlan(1),b=getChapterMissionPlan(1);
  a.tasks[0].dialogue[0].text='changed';a.coreTaskIds[0]='changed';a.acts[0].taskIds.length=0;
  assert.notEqual(b.tasks[0].dialogue[0].text,'changed');assert.notEqual(b.coreTaskIds[0],'changed');assert(b.acts[0].taskIds.length);
  assert.equal(JSON.stringify(CHAPTERS),original);
  for(const value of [0,17,'1',null])assert.throws(()=>getChapterMissionPlan(value),RangeError);
});
