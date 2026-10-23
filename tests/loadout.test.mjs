import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyMagazines,loadedRounds,selectMagazine,roundsToLoad} from '../src/loadout.js';
test('switching and partial reloads conserve shared ammunition',()=>{
  const magazines=emptyMagazines();let player={weaponId:'m4a1',mag:30},reserve=60;
  player=selectMagazine(magazines,player.weaponId,'m249',player.mag);
  const count=roundsToLoad(60,player.mag,reserve);player.mag+=count;reserve-=count;
  assert.equal(loadedRounds(player.mag,magazines)+reserve,90);
  player.mag-=7;
  for(let i=0;i<30;i++)player=selectMagazine(magazines,player.weaponId,i%2?'m249':'m4a1',player.mag);
  assert.equal(loadedRounds(player.mag,magazines)+reserve,83);
  assert.equal(player.mag,53);assert.equal(magazines.m4a1,30);assert.equal(magazines.m249,0);
});
test('same or unavailable weapon cannot discard a magazine or duplicate rounds',()=>{
  const magazines=emptyMagazines();
  assert.deepEqual(selectMagazine(magazines,'m4a1','m4a1',19),{weaponId:'m4a1',mag:19});
  assert.deepEqual(selectMagazine(magazines,'m4a1','missing',19),{weaponId:'m4a1',mag:19});
  assert.equal(loadedRounds(19,magazines),19);
  assert.equal(roundsToLoad(60,54,3),3);assert.equal(roundsToLoad(30,30,90),0);
});
test('six distinct magazines retain their contents through firing, switching and partial supplies',()=>{
  const ids=['m16a2','m249','ak','mp5','m1911','m4a1'],capacity=[30,100,30,30,7,30];
  const magazines=emptyMagazines(ids);let player={weaponId:ids[0],mag:0},reserve=150,spent=0;
  for(let cycle=0;cycle<5;cycle++)for(let i=0;i<ids.length;i++){
    player=selectMagazine(magazines,player.weaponId,ids[i],player.mag);
    const amount=roundsToLoad(capacity[i],player.mag,reserve);player.mag+=amount;reserve-=amount;
    const shots=Math.min(2,player.mag);player.mag-=shots;spent+=shots;
    assert.equal(magazines[player.weaponId],0);
    assert.equal(loadedRounds(player.mag,magazines)+reserve+spent,150);
    assert.ok(player.mag>=0&&player.mag<=capacity[i]);
  }
});
