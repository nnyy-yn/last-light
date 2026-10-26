import * as THREE from 'three';

// Visual events only. Damage, ray tests, sound and gameplay remain with the caller.
// Every emitter has a fixed ring pool. Six GPU batches, no per-shot lights/meshes.
const LIMITS = Object.freeze({ flashes: 42, dust: 160, streaks: 160, debris: 96, casings: 72, decals: 96 });
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+17.)*.28+noise(p*4.11-8.)*.15;}`;

function vec(value, fallback = [0, 0, 0]) {
  const a = Array.isArray(value) ? value : value ? [value.x, value.y, value.z] : fallback;
  return new THREE.Vector3(...a.map((v, i) => Number.isFinite(v) ? v : fallback[i]));
}
function record() {
  return { active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), c: new THREE.Color(), age: 0, life: 1, size: .1, endSize: .1, alpha: 1, rotation: 0, seed: 0, gravity: 0, bounces: 0 };
}
function pool(size) {
  const items = Array.from({ length: size }, record); let cursor = 0;
  return { items, take() { const p = items[cursor]; cursor = (cursor + 1) % size; p.active = true; p.fresh = true; p.age = 0; p.bounces = 0; p.gravity = 0; return p; }, clear() { for (const p of items) p.active = false; cursor = 0; } };
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
    void main(){vec2 p=vUv-.5;float n=fbm(vUv*14.+vSeedKind.x);float r=length(p);float edge=1.-smoothstep(.31+n*.10,.43+n*.05,r);float core=1.-smoothstep(.05,.15+n*.08,r);float rim=smoothstep(.12,.22,r)*(1.-smoothstep(.22,.38,r));vec3 base=vec3(.19,.15,.105);if(vSeedKind.y>.5&&vSeedKind.y<1.5)base=vec3(.24,.26,.27);if(vSeedKind.y>1.5)base=vec3(.23,.135,.055);vec3 color=mix(base,vec3(.035,.029,.023),core);color+=rim*n*.18;float alpha=edge*(.48+core*.48);if(alpha<.01)discard;gl_FragColor=vec4(color*uLight,alpha);
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
  let seed = 95321, elapsed = 0, disposed = false, casingBounces = 0;
  const events = { shots: 0, hits: 0, actorHits: 0 };
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (min, max) => min + random() * (max - min);

  function puff(point, velocity, color, size, life, alpha = .35) {
    const p = pools.dust.take(); p.p.copy(point); p.v.copy(velocity); p.c.set(color); p.size = size; p.endSize = size * range(2.3, 3.2); p.life = life; p.alpha = alpha; p.seed = random() * 99; p.rotation = random() * Math.PI * 2;
  }
  function shard(point, velocity, color, size, wood = false) {
    const p = pools.debris.take(); p.p.copy(point); p.v.copy(velocity); p.c.set(color); p.size = size; p.endSize = wood ? 3.5 : 1.5; p.life = range(.65, 1.4); p.gravity = 8; p.q.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)); p.spin.set(range(-6, 6), range(-6, 6), range(-6, 6));
  }
  function spark(point, velocity) {
    const p = pools.streaks.take(); p.p.copy(point); p.v.copy(velocity); p.c.setRGB(4.8, 1.8, .35); p.life = range(.08, .20); p.size = range(.005, .010); p.endSize = range(.065, .17); p.alpha = 1; p.gravity = 4.5; p.type = 'spark';
  }
  function shot({ from, to, faction = 'player', weaponId = 'm16a2' } = {}) {
    if (disposed) return; events.shots++; const start = vec(from), end = vec(to, [0, 0, -30]), direction = end.clone().sub(start); const distance = direction.length();
    if (distance < .001) return; direction.multiplyScalar(1 / distance); const support = weaponId === 'm249', pistol = weaponId === 'm1911';
    for (let i = 0; i < 3; i++) {
      const p = pools.flashes.take(); p.p.copy(start).addScaledVector(direction, i * .035); p.v.set(0, 0, 0); p.size = (support ? .20 : pistol ? .12 : .16) * (i === 0 ? .48 : 1 + i * .2); p.endSize = p.size * 1.35; p.life = .024 + i * .010; p.alpha = i === 0 ? .95 : .48; p.rotation = random() * 6; p.seed = random() * 8; p.c.setRGB(i === 0 ? 6 : 3.5, i === 0 ? 3.7 : 1.3, i === 0 ? 1.25 : .16);
    }
    puff(start, direction.clone().multiplyScalar(.30).add(new THREE.Vector3(0, .16, 0)), '#928b7e', .035, .42, .16);
    // A moving luminous segment, never a full muzzle-to-target laser line.
    if (distance > 2) {
      const p = pools.streaks.take(); p.p.copy(start); p.v.copy(direction).multiplyScalar(support ? 205 : 225); p.c.set(faction === 'enemy' ? '#ffbc67' : '#ffdc9e').multiplyScalar(2.5); p.life = Math.min(distance / p.v.length(), .65); p.size = .009; p.endSize = support ? .95 : .65; p.alpha = .8; p.type = 'tracer'; p.distance = distance; p.start = start; p.direction = direction;
    }
    const right = new THREE.Vector3().crossVectors(direction, UP).normalize(); if (right.lengthSq() < .1) right.set(1, 0, 0);
    const shell = pools.casings.take(); shell.p.copy(start).addScaledVector(direction, pistol ? -.18 : -.38).addScaledVector(right, .06); shell.v.copy(right).multiplyScalar(range(1.25, 2.05)).addScaledVector(UP, range(1.1, 1.8)).addScaledVector(direction, -.35); shell.life = 3.2; shell.gravity = 9.8; shell.size = pistol ? .82 : 1; shell.q.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)); shell.spin.set(range(8, 16), range(-15, 15), range(9, 18));
  }
  function hit({ point, normal, material = 'masonry', power = 1 } = {}) {
    if (disposed) return; events.hits++; const p = vec(point), n = vec(normal, [0, 1, 0]).normalize(); if (n.lengthSq() < .1) n.copy(UP); power = THREE.MathUtils.clamp(Number.isFinite(power) ? power : 1, .25, 2.5);
    const metal = /metal|steel|vehicle/i.test(material), wood = /wood|timber/i.test(material), soft = /sand|soil|dirt|cloth/i.test(material); const color = metal ? '#85857c' : wood ? '#a4885c' : soft ? '#b5a27f' : /brick/i.test(material) ? '#b49479' : '#c9b99a';
    const count = metal ? 2 : soft ? 6 : 6;
    for (let i = 0; i < count; i++) {
      a.copy(n).multiplyScalar(range(.12, .5) * power).add(new THREE.Vector3(range(-.18, .18), range(.05, .24), range(-.18, .18)));
      puff(p.clone().addScaledVector(n, .02), a, color, range(metal ? .055 : .12, metal ? .085 : .21) * Math.sqrt(power), range(.45, .85), metal ? .25 : .65);
    }
    if (metal) for (let i = 0; i < 7; i++) { a.copy(n).multiplyScalar(range(1.3, 3.8)).add(new THREE.Vector3(range(-1.6, 1.6), range(-.3, 1.9), range(-1.6, 1.6))); spark(p, a); }
    else if (!soft) for (let i = 0; i < 5; i++) { a.copy(n).multiplyScalar(range(.5, 1.8)).add(new THREE.Vector3(range(-1.1, 1.1), range(.3, 1.6), range(-1.1, 1.1))); shard(p, a, color, range(.006, .019) * power, wood); }
    if (!soft) {
      const d = pools.decals.take(); d.p.copy(p).addScaledVector(n, .004); d.q.setFromUnitVectors(FORWARD, n); d.q.multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, random() * Math.PI * 2)); d.size = (metal ? .037 : wood ? .067 : .105) * Math.sqrt(power); d.life = 120; d.seed = random() * 100; d.kind = metal ? 1 : wood ? 2 : 0; d.normal = n;
    }
  }
  function actorHit({ point, direction, killed = false } = {}) {
    if (disposed) return; events.actorHits++; const p = vec(point), d = vec(direction, [0, 0, 1]).normalize();
    for (let i = 0; i < (killed ? 4 : 3); i++) { a.copy(d).multiplyScalar(-range(.08, .2)).add(new THREE.Vector3(range(-.08, .08), .10, range(-.08, .08))); puff(p, a, '#9e9680', range(.025, .045), range(.22, .42), .24); }
  }

  function cards(batch, source) {
    const attributes = batch.geometry.attributes; let i = 0;
    for (const p of source.items) {
      const t = p.age / p.life, size = THREE.MathUtils.lerp(p.size, p.endSize, t); attributes.aCenter.setXYZ(i, p.p.x, p.p.y, p.p.z); attributes.aTint.setXYZ(i, p.c.r, p.c.g, p.c.b); attributes.aSeed.setX(i, p.seed);
      attributes.aShape.setXYZW(i, size, size, p.active ? p.alpha * (1 - t) ** (batch === flashes ? .7 : 1.5) * (batch === dust ? Math.min(1, t * 14 + .25) : 1) : 0, p.rotation); i++;
    }
    for (const key of ['aCenter', 'aShape', 'aTint', 'aSeed']) attributes[key].needsUpdate = true;
  }
  function flush() {
    cards(flashes, pools.flashes); cards(dust, pools.dust);
    const attrs = streaks.geometry.attributes;
    pools.streaks.items.forEach((p, i) => {
      if (p.active) {
        a.copy(p.v).normalize().multiplyScalar(p.endSize); b.copy(p.p).sub(a);
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
  function reset() { for (const p of Object.values(pools)) p.clear(); elapsed = 0; casingBounces = 0; events.shots = events.hits = events.actorHits = 0; flush(); }
  function inspect() {
    const active = Object.fromEntries(Object.entries(pools).map(([key, source]) => [key, source.items.filter(p => p.active).length]));
    const tracers = pools.streaks.items.filter(p => p.active && p.type === 'tracer').map(p => ({ position: p.p.toArray(), age: p.age, segmentLength: Math.min(p.endSize, p.age * p.v.length()), distance: p.distance }));
    return { elapsed, active, poolCapacity: LIMITS, capacity: Object.values(LIMITS).reduce((sum, n) => sum + n, 0), activeParticles: Object.entries(active).reduce((sum, [key, n]) => sum + (key === 'decals' ? 0 : n), 0), impactBursts: events.hits, shots: events.shots, actorHits: events.actorHits, casings: active.casings, batches: 6, events: { ...events }, casingBounces, tracers, decals: pools.decals.items.filter(p => p.active).map(p => ({ position: p.p.toArray(), normal: p.normal.toArray(), size: p.size })), disposed };
  }
  function dispose() {
    if (disposed) return; reset(); group.removeFromParent(); for(const object of[debris,casings,decals.mesh])if(!object.userData.instanceBuffersDisposed){object.dispose();object.userData.instanceBuffersDisposed=true;} for (const batch of [flashes, dust, streaks, decals]) { batch.geometry.dispose(); batch.material.dispose(); } debrisGeometry.dispose(); debrisMaterial.dispose(); caseGeometry.dispose(); caseMaterial.dispose(); disposed = true;
  }
  reset(); return { shot, hit, actorHit, update, reset, inspect, dispose };
}
