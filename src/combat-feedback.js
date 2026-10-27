import * as THREE from 'three';

// Visual events only. Damage, ray tests, sound and gameplay remain with the caller.
// Every emitter has a fixed ring pool. Six GPU batches, no per-shot lights/meshes.
const LIMITS = Object.freeze({ flashes: 42, dust: 160, streaks: 160, debris: 96, casings: 72, decals: 96 });
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const HEAVY_GUN = 'mounted-m2';
const PROFILES=Object.freeze({m16a2:{flash:.145,case:1,impact:1},m4a1:{flash:.16,case:1,impact:1},m249:{flash:.18,case:1,impact:1.08},ak:{flash:.175,case:1.12,impact:1.16},mp5:{flash:.09,case:.72,impact:.72},m1911:{flash:.105,case:.82,impact:.82},'mounted-m2':{flash:.31,case:2.35,impact:1.65}});
const weaponName=id=>id==='akm'?'ak':Object.hasOwn(PROFILES,id)?id:'m4a1';
const regionName=id=>['head','torso','limb','armor'].includes(id)?id:'torso';
const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+17.)*.28+noise(p*4.11-8.)*.15;}`;

function vec(value, fallback = [0, 0, 0]) {
  const a = Array.isArray(value) ? value : value ? [value.x, value.y, value.z] : fallback;
  return new THREE.Vector3(...a.map((v, i) => Number.isFinite(v) ? v : fallback[i]));
}
function record() {
  return { active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), c: new THREE.Color(), age: 0, life: 1, size: .1, endSize: .1, alpha: 1, aspect: 1, rotation: 0, seed: 0, gravity: 0, bounces: 0 };
}
function pool(size) {
  const items = Array.from({ length: size }, record); let cursor = 0;
  return { items, take() { const p = items[cursor]; cursor = (cursor + 1) % size; p.active = true; p.fresh = true; p.age = 0; p.bounces = 0; p.gravity = 0; p.aspect = 1; return p; }, clear() { for (const p of items) p.active = false; cursor = 0; } };
}

function cardBatch(count, flash) {
  const source = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
  geometry.index = source.index.clone(); for (const [key, value] of Object.entries(source.attributes)) geometry.setAttribute(key, value.clone()); source.dispose();
  for (const [key, size] of [['aCenter', 3], ['aShape', 4], ['aTint', 3], ['aSeed', 1]]) geometry.setAttribute(key, new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: flash ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uFlash: { value: flash ? 1 : 0 }, uLight: { value: 1 } },
    vertexShader: `attribute vec3 aCenter;attribute vec4 aShape;attribute vec3 aTint;attribute float aSeed;varying vec2 vUv;varying vec3 vTint;varying float vAlpha;varying float vSeed;
    void main(){vUv=uv;vTint=aTint;vAlpha=aShape.z;vSeed=aSeed;vec2 p=position.xy;float c=cos(aShape.w),s=sin(aShape.w);p=mat2(c,-s,s,c)*p*aShape.xy;vec4 mv=modelViewMatrix*vec4(aCenter,1.);mv.xy+=p;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uLight;uniform float uFlash;varying vec2 vUv;varying vec3 vTint;varying float vAlpha;varying float vSeed;${NOISE}
    void main(){vec2 p=vUv-.5;float r=length(p);float a;
    if(uFlash>.5){float angle=atan(p.y,p.x);float rays=pow(abs(cos(angle*3.+vSeed)),7.);float outer=.15+rays*.30;a=(1.-smoothstep(.015,outer,r))*.75+exp(-r*35.)*.5;}
    else{float n=fbm(vUv*6.+vSeed);a=(1.-smoothstep(.14,.5,r))*(.22+n*.78);a*=smoothstep(.20,.55,n+r*.15);}
    a*=vAlpha;if(a<.003)discard;gl_FragColor=vec4(vTint*(uFlash>.5?1.:uLight),a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.name = flash ? 'brief layered muzzle flashes' : 'localized impact dust and muzzle smoke';
  return { mesh, geometry, material };
}
function streakBatch(count) {
  const base = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry(); geometry.index = base.index.clone();
  for (const [k, v] of Object.entries(base.attributes)) geometry.setAttribute(k, v.clone()); base.dispose();
  for (const [k, n] of [['aStart', 3], ['aEnd', 3], ['aTint', 3], ['aWidthAlpha', 2]]) geometry.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(count * n), n).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aStart;attribute vec3 aEnd;attribute vec3 aTint;attribute vec2 aWidthAlpha;varying vec2 vUv;varying vec3 vTint;varying float vAlpha;
    void main(){vUv=uv;vTint=aTint;vAlpha=aWidthAlpha.y;vec4 a=modelViewMatrix*vec4(aStart,1.),b=modelViewMatrix*vec4(aEnd,1.);vec2 delta=b.xy-a.xy;vec2 side=vec2(delta.y,-delta.x)/max(length(delta),.00001);vec4 p=mix(a,b,uv.y);p.xy+=side*position.x*aWidthAlpha.x;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vTint;varying float vAlpha;void main(){float alpha=pow(1.-abs(vUv.x*2.-1.),1.5)*sin(vUv.y*3.14159)*vAlpha;if(alpha<.002)discard;gl_FragColor=vec4(vTint,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }` });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.name = 'moving short tracers and impact sparks'; return { mesh, geometry, material };
}
function decalBatch(count) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('aSeedKind', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
  const material = new THREE.ShaderMaterial({ uniforms:{uLight:{value:1}}, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec2 aSeedKind;varying vec2 vUv;varying vec2 vSeedKind;void main(){vUv=uv;vSeedKind=aSeedKind;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uLight;varying vec2 vUv;varying vec2 vSeedKind;${NOISE}
    void main(){vec2 p=vUv-.5;float n=fbm(vUv*18.+vSeedKind.x),r=length(p),angle=atan(p.y,p.x);float kind=vSeedKind.y;
    float core=1.-smoothstep(.045,.105+n*.035,r),edge=1.-smoothstep(.29+n*.09,.39+n*.07,r);
    float radial=abs(sin(angle*5.+vSeedKind.x+noise(vec2(r*27.,vSeedKind.x))*.75));
    float cracks=(1.-smoothstep(.025,.065,radial))*(1.-smoothstep(.17,.46,r))*.7;
    float rim=smoothstep(.08,.13,r)*(1.-smoothstep(.18,.33,r));vec3 base=vec3(.30,.255,.18);
    if(kind>.5&&kind<1.5){base=vec3(.25,.27,.27);cracks=0.;rim*=.45;edge=1.-smoothstep(.16,.29,r);}
    if(kind>1.5&&kind<2.5){base=vec3(.25,.15,.065);float split=abs(p.x+sin(p.y*19.+vSeedKind.x)*.013);cracks=(1.-smoothstep(.008,.023,split))*(1.-smoothstep(.2,.48,abs(p.y)));}
    if(kind>2.5){base=vec3(.40,.43,.41);edge*=.45;cracks*=.65;}
    vec3 color=mix(base,vec3(.025,.021,.018),max(core,cracks));color+=rim*n*.20;
    float alpha=max(edge*(.24+core*.73+rim*.28),cracks*.83);if(alpha<.01)discard;gl_FragColor=vec4(color*uLight,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }` });
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.name = 'surface-oriented impact chips'; return { mesh, geometry, material };
}

export function createCombatFeedback(scene, {groundHeight=()=>0} = {}) {
  const group = new THREE.Group(); group.name = 'pooled combat feedback'; scene.add(group);
  const pools = Object.fromEntries(Object.entries(LIMITS).map(([key, value]) => [key, pool(value)]));
  const flashes = cardBatch(LIMITS.flashes, true), dust = cardBatch(LIMITS.dust, false), streaks = streakBatch(LIMITS.streaks), decals = decalBatch(LIMITS.decals);
  const debrisGeometry = new THREE.IcosahedronGeometry(1, 0), debrisMaterial = new THREE.MeshStandardMaterial({ roughness: .94, metalness: .03, flatShading: true });
  const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, LIMITS.debris); debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.frustumCulled = false; debris.name = 'small material-specific fragments';
  const caseGeometry = new THREE.CylinderGeometry(.0035, .0042, .023, 7), caseMaterial = new THREE.MeshStandardMaterial({ color: '#a68b49', roughness: .35, metalness: .78 });
  const casings = new THREE.InstancedMesh(caseGeometry, caseMaterial, LIMITS.casings); casings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); casings.frustumCulled = false; casings.name = 'pooled bouncing brass';
  group.add(flashes.mesh, dust.mesh, streaks.mesh, debris, casings, decals.mesh);
  const transform = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), spinEuler = new THREE.Euler(), spinQuaternion = new THREE.Quaternion();
  const tangentDirection=new THREE.Vector3(),bitangentDirection=new THREE.Vector3(),outwardVelocity=new THREE.Vector3();
  let seed = 95321, elapsed = 0, disposed = false, casingBounces = 0;
  const events = { shots: 0, hits: 0, actorHits: 0, tracers: 0, heavyShots: 0 };
  const shotCounts = new Map(); let lastImpact = null, lastActorHit = null, lastShot = null;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (min, max) => min + random() * (max - min);

  function puff(point, velocity, color, size, life, alpha = .35) {
    const p = pools.dust.take(); p.p.copy(point); p.v.copy(velocity); p.c.set(color); p.size = size; p.endSize = size * range(2.3, 3.2); p.life = life; p.alpha = alpha; p.seed = random() * 99; p.rotation = random() * Math.PI * 2;return p;
  }
  function shard(point, velocity, color, size, wood = false) {
    const p = pools.debris.take(); p.p.copy(point); p.v.copy(velocity); p.c.set(color); p.size = size; p.endSize = wood ? 3.5 : 1.5; p.life = range(.65, 1.4); p.gravity = 8; p.q.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)); p.spin.set(range(-6, 6), range(-6, 6), range(-6, 6));return p;
  }
  function spark(point, velocity) {
    const p = pools.streaks.take(); p.p.copy(point); p.v.copy(velocity); p.c.setRGB(4.0, 1.55, .30); p.life = range(.075, .17); p.size = range(.004, .008); p.endSize = range(.055, .14); p.alpha = .9; p.gravity = 6; p.type = 'spark';
  }
  function outward(normal, speed, spread) {
    // A cone on the outward surface hemisphere: wall chips must leave the wall.
    tangentDirection.crossVectors(normal, Math.abs(normal.y) < .85 ? UP : FORWARD).normalize();
    bitangentDirection.crossVectors(normal, tangentDirection);
    return outwardVelocity.copy(normal).multiplyScalar(speed).addScaledVector(tangentDirection, range(-spread, spread)).addScaledVector(bitangentDirection, range(-spread, spread));
  }
  function shot({ from, to, faction = 'player', weaponId = 'm16a2', gunType } = {}) {
    if (disposed) return; events.shots++; const start = vec(from), end = vec(to, [0, 0, -30]), direction = end.clone().sub(start); const distance = direction.length();
    if (distance < .001) return; weaponId=weaponName(gunType||weaponId);faction=['player','enemy','ally'].includes(faction)?faction:'player';const profile=PROFILES[weaponId];direction.multiplyScalar(1 / distance); const heavy=weaponId===HEAVY_GUN,support = weaponId === 'm249', pistol = weaponId === 'm1911';
    if(heavy)events.heavyShots++;
    for (let i = 0; i < 2; i++) {
      const p = pools.flashes.take(); p.p.copy(start).addScaledVector(direction, i * .055); p.v.set(0, 0, 0); p.size = profile.flash * (i === 0 ? .37 : 1); p.endSize = p.size * 1.18; p.life = (heavy?.028:.019) + i * .009; p.alpha = i === 0 ? .96 : .53; p.rotation = random() * 6; p.seed = random() * 8; p.c.setRGB(i === 0 ? 5.2 : 3.2, i === 0 ? 3.3 : 1.25, i === 0 ? 1.3 : .2);
    }
    puff(start, direction.clone().multiplyScalar(.48).add(new THREE.Vector3(0, .12, 0)), '#928b7e', heavy?.045:.022, heavy?.27:.19, .12);
    // Tracer cadence and near-ballistic speed avoid a continuous glowing stream.
    const counterKey=`${faction}:${weaponId}`,count=(shotCounts.get(counterKey)||0)+1;shotCounts.set(counterKey,count);
    if (distance > 4 && !pistol && count % (heavy?2:support?3:4) === 0) {
      const p = pools.streaks.take(); p.p.copy(start); p.v.copy(direction).multiplyScalar(heavy?780:650); p.c.set(faction === 'enemy' ? '#ffc48a' : '#ffdea6').multiplyScalar(1.9); p.life = Math.min(distance / p.v.length(), .22); p.size = heavy?.009:.005; p.endSize = heavy?.68:.40; p.alpha = .72; p.type = 'tracer'; p.distance = distance; p.start = start; p.direction = direction;events.tracers++;
    }
    const right = new THREE.Vector3().crossVectors(direction, UP).normalize(); if (right.lengthSq() < .1) right.set(1, 0, 0);
    const shell = pools.casings.take(); shell.p.copy(start).addScaledVector(direction, heavy?-.65:pistol ? -.18 : -.38).addScaledVector(right, .06); shell.v.copy(right).multiplyScalar(range(1.25, 2.05)).addScaledVector(UP, range(1.1, 1.8)).addScaledVector(direction, -.35); shell.life = 3.2; shell.gravity = 9.8; shell.size = profile.case; shell.q.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)); shell.spin.set(range(8, 16), range(-15, 15), range(9, 18));lastShot={weaponId,faction,flashSize:profile.flash,casingScale:profile.case,tracerEvery:heavy?2:support?3:pistol?0:4};
  }
  function hit({ point, normal, material = 'masonry', power = 1, weaponId='m4a1',gunType,direction } = {}) {
    if (disposed) return; events.hits++;weaponId=weaponName(gunType||weaponId);
    const p = vec(point), n = vec(normal, [0, 1, 0]).normalize(); if (n.lengthSq() < .1) n.copy(UP);
    power = THREE.MathUtils.clamp((Number.isFinite(power) ? power : 1)*PROFILES[weaponId].impact, .25, 2.5);
    const metal = /metal|steel|vehicle|car|armor/i.test(material), wood = /wood|timber/i.test(material),glass=/glass|window/i.test(material), soft = /sand|soil|dirt|cloth|ground/i.test(material);
    const color = metal ? '#85857c' : wood ? '#a4885c' : glass?'#9fafa9':soft ? '#b5a27f' : /brick/i.test(material) ? '#b49479' : '#c9b99a';
    const count = metal||glass ? 1 : soft ? 3 : 2,offset=p.clone().addScaledVector(n,.018),fragmentCount=metal||soft?0:Math.min(12,Math.round((glass?6:7)*Math.sqrt(power))),sparkCount=metal?Math.min(14,Math.round(7*Math.sqrt(power))):0;
    const incoming=vec(direction).normalize(),glancing=direction?1-Math.abs(incoming.dot(n)):0;
    const ricochet=direction?incoming.reflect(n).addScaledVector(n,.28).normalize():n.clone();if(ricochet.dot(n)<.05)ricochet.copy(n);
    for (let i = 0; i < count; i++) {
      a.copy(outward(n,range(.85,2.1)*Math.sqrt(power),soft?.70:.38));
      const plume=puff(offset,a,color,range(metal?.023:soft?.07:.04,metal?.034:soft?.11:.075)*Math.sqrt(power),range(soft?.19:.09,soft?.36:.18),metal?.18:soft?.40:.62);
      plume.aspect=soft?1.5:1.18;plume.endSize=plume.size*(soft?2.8:2.0);
    }
    if (metal) for (let i = 0; i < sparkCount; i++) { const velocity=outward(ricochet,range(2.8,6.2)*Math.sqrt(power),.8),away=velocity.dot(n);if(away<.25)velocity.addScaledVector(n,.25-away);spark(offset,velocity); }
    else if (!soft) for (let i = 0; i < fragmentCount; i++) {
      const fragment=shard(offset,outward(n,range(2.0,4.8)*Math.sqrt(power),1.6),color,range(.010,.026)*Math.sqrt(power),wood);
      fragment.life=range(glass?.25:.32,glass?.55:.7);fragment.gravity=11;fragment.endSize=glass?2.4:wood?3.3:1.3;
    }
    if (!soft) {
      const d = pools.decals.take(); d.p.copy(p).addScaledVector(n, .004); d.q.setFromUnitVectors(FORWARD, n); d.q.multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, random() * Math.PI * 2)); d.size = (metal ? .043 : wood ? .085 :glass?.13: .135) * Math.sqrt(power); d.life = 120; d.seed = random() * 100; d.kind = metal ? 1 : wood ? 2 :glass?3:0; d.normal = n;
    }
    lastImpact={material,weaponId,gunType:weaponId,power,dust:count,fragments:fragmentCount,sparks:sparkCount,normal:n.toArray(),ricochet:metal?ricochet.toArray():null,glancing};
  }
  function actorHit({ point, direction, normal, killed = false, weaponId='m4a1',gunType,hitZone='torso',power = 1,damage } = {}) {
    if (disposed) return;events.actorHits++;weaponId=weaponName(gunType||weaponId);hitZone=regionName(hitZone);
    const p = vec(point), d = normal?vec(normal).normalize():vec(direction, [0, 0, 1]).normalize().negate();
    if(d.lengthSq()<.1)d.copy(FORWARD);const strength=THREE.MathUtils.clamp((Number.isFinite(power)?power:1)*Math.sqrt(PROFILES[weaponId].impact),.5,1.8),count=hitZone==='limb'?1:2;
    for (let i = 0; i < count; i++) {
      const cloud=puff(p,outward(d,range(.8,1.5),.17),hitZone==='armor'?'#9d998a':'#aaa48e',range(.027,.052)*Math.sqrt(strength),range(.085,.145),.60);cloud.endSize=cloud.size*1.8;
    }
    // Actual impact is a tight non-emissive cloth/equipment snap, not a smoke
    // explosion. Damage, stagger and the hit-region reaction stay in gameplay.
    const fragments=hitZone==='armor'?3:2;
    for(let i=0;i<fragments;i++){const f=shard(p,outward(d,range(.8,1.6),.25),hitZone==='armor'?'#777b6c':'#706c57',hitZone==='armor'?.012:.008);f.life=.16;f.gravity=4;}
    lastActorHit={killed:Boolean(killed),weaponId,gunType:weaponId,hitZone,power:strength,damage:Number.isFinite(damage)?Math.max(0,damage):null,dust:count,fragments,direction:d.toArray(),maxLife:.16};
  }

  function cards(batch, source) {
    const attributes = batch.geometry.attributes; let i = 0;
    for (const p of source.items) {
      const t = p.age / p.life, size = THREE.MathUtils.lerp(p.size, p.endSize, t); attributes.aCenter.setXYZ(i, p.p.x, p.p.y, p.p.z); attributes.aTint.setXYZ(i, p.c.r, p.c.g, p.c.b); attributes.aSeed.setX(i, p.seed);
      attributes.aShape.setXYZW(i, size*p.aspect, size, p.active ? p.alpha * (1 - t) ** (batch === flashes ? .7 : 1.5) * (batch === dust ? Math.min(1, t * 14 + .25) : 1) : 0, p.rotation); i++;
    }
    for (const key of ['aCenter', 'aShape', 'aTint', 'aSeed']) attributes[key].needsUpdate = true;
  }
  function flush() {
    cards(flashes, pools.flashes); cards(dust, pools.dust);
    const attrs = streaks.geometry.attributes;
    pools.streaks.items.forEach((p, i) => {
      if (p.active) {
        a.copy(p.v).normalize().multiplyScalar(Math.min(p.endSize,p.age*p.v.length())); b.copy(p.p).sub(a);
        if (p.type === 'tracer' && c.subVectors(b, p.start).dot(p.direction) < 0) b.copy(p.start);
      } else { a.set(0, 0, 0); b.copy(p.p); }
      attrs.aStart.setXYZ(i, b.x, b.y, b.z); attrs.aEnd.setXYZ(i, p.p.x, p.p.y, p.p.z); attrs.aTint.setXYZ(i, p.c.r, p.c.g, p.c.b); attrs.aWidthAlpha.setXY(i, p.size, p.active ? p.alpha * (1 - p.age / p.life) : 0);
    });
    for (const key of ['aStart', 'aEnd', 'aTint', 'aWidthAlpha']) attrs[key].needsUpdate = true;
    for (const [key, mesh] of [['debris', debris], ['casings', casings], ['decals', decals.mesh]]) {
      pools[key].items.forEach((p, i) => {
        transform.position.copy(p.p); transform.quaternion.copy(p.q);
        const fade = key === 'decals' ? 1 : Math.min(1, (p.life - p.age) * 4), size = p.active ? p.size * fade : 0;
        if (key === 'debris') transform.scale.set(size, size * .5, size * p.endSize); else transform.scale.setScalar(size);
        transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
        if (key === 'debris') mesh.setColorAt(i, p.c);
        if (key === 'decals') decals.geometry.attributes.aSeedKind.setXY(i, p.seed, p.kind || 0);
      }); mesh.instanceMatrix.needsUpdate = true;
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true; decals.geometry.attributes.aSeedKind.needsUpdate = true;
  }
  function update(dt, camera) {
    dust.material.uniforms.uLight.value=decals.material.uniforms.uLight.value=scene.environmentIntensity<.08?.09:1;
    if (disposed || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05); elapsed += dt;
    for (const [key, source] of Object.entries(pools)) for (const p of source.items) {
      if (!p.active) continue;
      // Even a slow .05 s frame must render a newly born sub-frame flash/tracer.
      const step = p.fresh ? Math.min(dt, p.life * .35) : dt; p.fresh = false;
      p.age += step; if (p.age >= p.life) { p.active = false; continue; }
      if (key === 'decals' || key === 'flashes') continue;
      p.v.y -= p.gravity * step; p.p.addScaledVector(p.v, step);
      if (key === 'dust') { p.v.multiplyScalar(Math.exp(-2.5 * step)); p.v.y += .12 * step; p.rotation += .15 * step; }
      if (key === 'casings' || key === 'debris') {
        c.copy(p.spin).multiplyScalar(step); spinEuler.set(c.x, c.y, c.z); p.q.multiply(spinQuaternion.setFromEuler(spinEuler));
        const floor=groundHeight(p.p.x,p.p.z)+(key==='casings'?.006:p.size*.5);
        if (p.p.y < floor) {
          p.p.y = floor;
          if (p.v.y < -.15) { p.v.y *= -.32; p.v.x *= .62; p.v.z *= .62; p.spin.multiplyScalar(.55); p.bounces++; if (key === 'casings') casingBounces++; }
          else { p.v.set(0, 0, 0); p.spin.set(0, 0, 0); }
        }
      }
    }
    flush();
  }
  function reset() { for (const p of Object.values(pools)) p.clear(); elapsed = 0; casingBounces = 0; for(const key of Object.keys(events))events[key]=0;shotCounts.clear();lastImpact=lastActorHit=lastShot=null;flush(); }
  function inspect() {
    const active = Object.fromEntries(Object.entries(pools).map(([key, source]) => [key, source.items.filter(p => p.active).length]));
    const tracers = pools.streaks.items.filter(p => p.active && p.type === 'tracer').map(p => ({ position: p.p.toArray(), age: p.age, segmentLength: Math.min(p.endSize, p.age * p.v.length()), distance: p.distance }));
    return { elapsed, active, poolCapacity: LIMITS, capacity: Object.values(LIMITS).reduce((sum, n) => sum + n, 0), activeParticles: Object.entries(active).reduce((sum, [key, n]) => sum + (key === 'decals' ? 0 : n), 0), impactBursts: events.hits, shots: events.shots, actorHits: events.actorHits, casings: active.casings, batches: 6, events: { ...events }, casingBounces, tracers, lastImpact,lastActorHit,lastShot,shotCadenceKeys:shotCounts.size,decals: pools.decals.items.filter(p => p.active).map(p => ({ position: p.p.toArray(), normal: p.normal.toArray(), size: p.size })), disposed };
  }
  function dispose() {
    if (disposed) return; reset(); group.removeFromParent(); for(const object of[debris,casings,decals.mesh])if(!object.userData.instanceBuffersDisposed){object.dispose();object.userData.instanceBuffersDisposed=true;} for (const batch of [flashes, dust, streaks, decals]) { batch.geometry.dispose(); batch.material.dispose(); } debrisGeometry.dispose(); debrisMaterial.dispose(); caseGeometry.dispose(); caseMaterial.dispose(); disposed = true;
  }
  reset(); return { shot, hit, actorHit, update, reset, inspect, dispose };
}
