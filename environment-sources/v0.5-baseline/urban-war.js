import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAPTERS } from './story.js';
import { addCoastalRoofDetails } from './coastal-details.js';
import { addStreetOccupation } from './street-occupation.js';
import { createEnvironmentDetail } from './environment-detail.js';

// Architecture is built as walls and slabs, not a solid box with pasted windows.
// Distances are metres. Small loose fragments can be stepped over; all substantial
// rubble, furniture and street structures register conservative collision bounds.
export function createUrbanWar({ group, scene, colliders, nightLights, palette, material, canvasTexture, rubbleMaps, facadeAsset }) {
  let seed = 19831003;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rand = (a, b) => a + (b - a) * random();
  const PI = Math.PI, batches = new Map(), transform = new THREE.Object3D();
  const { walls, brick, sand, road, concrete, dark, rusty, trim, blue, green, wood, metal, cloth, rubber } = palette;
  const stats = { buildings: 0, damagedBackgrounds:0, streetClusters:0, openWindows: 0, ruinedBays: 0, rubblePiles: 0, looseFragments: 0, colliders: 0, drawCalls: 0, triangles: 0 };
  const protectedPoints = CHAPTERS.flatMap(chapter => [chapter.spawn, ...chapter.tasks.map(task => task.pos)]);
  const protectedRoute = (x, z, w, d) => Math.abs(x) - w / 2 < 3.6 || [-50, 0, 50].some(cross => Math.abs(z - cross) - d / 2 < 3.6) || protectedPoints.some(p => Math.abs(x - p[0]) < w / 2 + 2.2 && Math.abs(z - p[1]) < d / 2 + 2.2);
  function obstacle(x, z, w, d, building = false) {
    if (!building && protectedRoute(x, z, w, d)) return false;
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    stats.colliders++;
    return true;
  }
  function add(geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
    if (geometry.index) { const source = geometry; geometry = source.toNonIndexed(); source.dispose(); }
    // Consistent attributes allow authored and generated meshes to share batches.
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    transform.position.set(...position); transform.rotation.set(...rotation); transform.scale.set(1, 1, 1); transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(geometry);
  }
  function box(w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4), sx = face < 2 ? d : w, sy = face < 2 ? h : face < 4 ? d : h; uv.setXY(i, uv.getX(i) * sx / 2.4, uv.getY(i) * sy / 2.4); }
    add(geometry, mat, [x, y, z], [rx, ry, rz]);
  }
  function line(a, b, radius, mat, segments = 5) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(.5).toArray()); add(geometry, mat);
  }
  function curve(points, radius, mat) { add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, radius, 4, false), mat); }
  function flatShape(points) { const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath(); return shape; }
  function polygon(rw, rd, count = 15) { return Array.from({ length: count }, (_, i) => { const a = i / count * PI * 2, r = rand(.77, 1.12); return [Math.cos(a) * rw * r, Math.sin(a) * rd * r]; }); }
  function groundPatch(x, z, rw, rd, mat, y = .045) { add(new THREE.ShapeGeometry(flatShape(polygon(rw, rd))), mat, [x, y, z], [-PI / 2, 0, 0]); }
  const rubble = material({ ...rubbleMaps, color: '#a18e76', roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
  const exposed = material({ ...palette.brokenMaps, color: '#8b8071', roughness: 1, normalScale: new THREE.Vector2(1.25, 1.25) });
  const burned = material({ ...palette.wallMaps, color: '#4d4a40', roughness: 1 });
  const brickEdge = material({ ...palette.brickMaps, color: '#8c6f54', roughness: 1 });
  const patchedRoad = material({ ...palette.roadMaps, color: '#898375', roughness: .97, normalScale: new THREE.Vector2(.65, .65) });
  const gravel = material({ ...rubbleMaps, color: '#8b7a64', roughness: 1, normalScale: new THREE.Vector2(.6, .6) });
  const windowBlack = material({ color: '#20211d', roughness: 1 });
  const shard = material({ color: '#466063', metalness: .28, roughness: .5, side: THREE.DoubleSide });
  const paper = material({ color: '#aaa38a', roughness: 1, side: THREE.DoubleSide });
  const details = createEnvironmentDetail({material,canvasTexture,palette:{...palette,shard,exposed,brickEdge},stats});
  const damagedPlasterMap=canvasTexture(1024,1024,(ctx,w,h)=>{
    ctx.fillStyle='#9b937f';ctx.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){
      const x=rand(-70,w+70),y=rand(-70,h+70),r=rand(16,120),shade=i%3?'142,135,117':'184,175,150';
      const gradient=ctx.createRadialGradient(x,y,r*.1,x,y,r);gradient.addColorStop(0,`rgba(${shade},${rand(.15,.55)})`);gradient.addColorStop(1,`rgba(${shade},0)`);ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<85;i++){const x=rand(0,w),y=rand(0,h),length=rand(30,260),width=rand(2,18);const drip=ctx.createLinearGradient(0,y,0,y+length);drip.addColorStop(0,'rgba(45,40,30,.24)');drip.addColorStop(1,'rgba(45,40,30,0)');ctx.fillStyle=drip;ctx.fillRect(x,y,width,length);}
    const pixels=ctx.getImageData(0,0,w,h);for(let p=0;p<pixels.data.length;p+=4){const n=rand(-11,11);pixels.data[p]+=n;pixels.data[p+1]+=n;pixels.data[p+2]+=n;}ctx.putImageData(pixels,0,0);
    for(let i=0;i<22;i++){let x=rand(0,w),y=rand(0,h);ctx.strokeStyle='rgba(49,43,33,.35)';ctx.lineWidth=rand(.5,1.8);ctx.beginPath();ctx.moveTo(x,y);for(let n=0;n<10;n++){x+=rand(-12,12);y+=rand(3,18);ctx.lineTo(x,y);}ctx.stroke();}
  });
  damagedPlasterMap.wrapS=damagedPlasterMap.wrapT=THREE.RepeatWrapping;
  const oldPlaster = material({ map:damagedPlasterMap,bumpMap:damagedPlasterMap,bumpScale:.021,color:'#c5bca4',roughness:1 });
  const moduleParts = new Map();
  facadeAsset?.scene.updateMatrixWorld(true);
  function authoredInsert(name, position, yaw, scale, brokenGlass = false) {
    if (!facadeAsset) return;
    if (!moduleParts.has(name)) {
      const parts = [], root = facadeAsset.scene.getObjectByName(name);
      root?.traverse(object => {
        if (!object.isMesh) return;
        let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        for(const key of ['position','normal','uv'])if(geometry.attributes[key]){
          const attr=geometry.attributes[key],values=new Float32Array(attr.count*attr.itemSize);
          for(let i=0;i<attr.count;i++)for(let j=0;j<attr.itemSize;j++)values[i*attr.itemSize+j]=attr.getComponent(i,j);
          geometry.setAttribute(key,new THREE.BufferAttribute(values,attr.itemSize));
        }
        parts.push({ geometry, material: object.material });
      });
      moduleParts.set(name, parts);
    }
    for (const part of moduleParts.get(name)) {
      if (brokenGlass && /glass/i.test(part.material.name)) continue;
      const geometry = part.geometry.clone(); geometry.scale(...scale);
      add(geometry, part.material, position, [0, yaw, 0]);
    }
  }
  const scorchMap = canvasTexture(256, 256, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gradient.addColorStop(0, 'rgba(18,15,11,.90)'); gradient.addColorStop(.38, 'rgba(27,22,16,.68)'); gradient.addColorStop(.75, 'rgba(35,29,22,.26)'); gradient.addColorStop(1, 'rgba(40,34,26,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 550; i++) { ctx.fillStyle = `rgba(17,14,12,${rand(.04, .22)})`; ctx.fillRect(rand(35, 220), rand(25, 225), rand(1, 5), rand(2, 10)); }
  });
  const scorch = material({ map: scorchMap, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  const chipMap = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2); ctx.fillStyle = '#8a7c65'; ctx.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2, r = rand(40, 100); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#302d27'; ctx.beginPath(); ctx.ellipse(1, 3, 29, 24, .4, 0, PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(35,28,21,.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = rand(0, PI * 2); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.lineTo(Math.cos(a) * 110, Math.sin(a) * 110); ctx.stroke(); }
  });
  const chip = material({ map: chipMap, transparent: true, alphaTest: .1, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const awningMap = canvasTexture(512, 512, (ctx, w, h) => { ctx.fillStyle = '#8b8872'; ctx.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 85) { ctx.fillStyle = '#4a6663'; ctx.fillRect(x, 0, 42, h); } for (let i = 0; i < 2800; i++) { ctx.fillStyle = `rgba(29,24,17,${rand(.03, .15)})`; ctx.fillRect(rand(0, w), rand(0, h), rand(1, 8), rand(1, 8)); } });
  const awning = material({ map: awningMap, roughness: 1, side: THREE.DoubleSide });
  const dustTraceMap=canvasTexture(512,256,(ctx,w,h)=>{
    const noise=n=>{const value=Math.sin(n*12.9898+78.233)*43758.5453;return value-Math.floor(value);};
    for(let i=0;i<55;i++){
      const x=w*(.09+.82*noise(i+1)),y=h*(.24+.52*noise(i+150)),r=12+noise(i+90)*48;
      const fade=ctx.createRadialGradient(x,y,r*.12,x,y,r);fade.addColorStop(0,`rgba(172,153,119,${.15+noise(i+240)*.32})`);fade.addColorStop(.6,'rgba(167,147,113,.14)');fade.addColorStop(1,'rgba(164,143,109,0)');ctx.fillStyle=fade;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<16;i++){ctx.strokeStyle='rgba(68,57,41,.12)';ctx.lineWidth=1+noise(i+500)*4;ctx.beginPath();ctx.moveTo(w*.13+i*12,h*.3+noise(i+300)*h*.3);ctx.lineTo(w*.30+i*12,h*.36+noise(i+300)*h*.3);ctx.stroke();}
  });
  const dustTrace=material({map:dustTraceMap,color:'#95866b',opacity:.42,normalMap:rubbleMaps?.normalMap,normalScale:new THREE.Vector2(.18,.18),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});

  // The road is a continuous height field. Craters displace the road itself;
  // patches, gravel shoulders and broken kerbs no longer float on a flat plane.
  const craters = [{ x: -6.15, z: 69, r: 1.6 }, { x: 6.1, z: 21, r: 1.8 }, { x: -6.0, z: -31, r: 1.5 }, { x: 6.2, z: -70, r: 1.7 }];
  const roadHeight = (x, z) => {
    let y = .02 + Math.sin(x * .8 + z * .21) * .008 + Math.sin(z * 1.7) * .006;
    for (const crater of craters) { const d = Math.hypot(x - crater.x, z - crater.z) / crater.r; if (d < 1.3) y += -.37 * Math.max(0, 1 - d * d) + .12 * Math.exp(-Math.pow((d - .99) / .17, 2)); }
    return y;
  };
  function roadSection(minX, maxX, minZ, maxZ) {
    const nx = Math.ceil((maxX - minX) / .65), nz = Math.ceil((maxZ - minZ) / .65), geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
    geometry.rotateX(-PI / 2); geometry.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const positions = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), z = positions.getZ(i); positions.setY(i, roadHeight(x, z)); uv.setXY(i, x / 9.5, z / 9.5); }
    geometry.computeVertexNormals(); add(geometry, road);
  }
  box(236, .35, 236, sand, 0, -.65, 0);
  roadSection(-9.4, 9.4, -108, 108);
  for (const z of [-50, 0, 50]) { roadSection(-108, -9.4, z - 9.4, z + 9.4); roadSection(9.4, 108, z - 9.4, z + 9.4); }
  for (let i = 0; i < 26; i++) {
    const x = rand(-7.8, 7.8), z = rand(-99, 99);
    if (!craters.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 2)) groundPatch(x, z, rand(.2, .75), rand(.4, 1.3), i % 4 ? patchedRoad : sand, .047);
  }
  for (const crater of craters) {
    groundPatch(crater.x, crater.z, crater.r * .66, crater.r * .62, dark, -.25);
    for (let i = 0; i < 40; i++) { const a = rand(0, PI * 2), r = rand(crater.r * .86, crater.r * 1.5); box(rand(.07, .27), rand(.035, .10), rand(.1, .31), i % 3 ? patchedRoad : exposed, crater.x + Math.cos(a) * r, .06, crater.z + Math.sin(a) * r, a, rand(-.2, .2)); }
  }
  function shoulder(x, z, alongZ, length) {
    const angle = alongZ ? 0 : PI / 2;
    box(1.16, .18, length, concrete, x, .04, z, angle);
    for (let u = -length / 2; u < length / 2; u += 1.05) {
      if (random() < .19) continue;
      const pos = alongZ ? [x + Math.sign(x) * -.56, .08, z + u] : [x + u, .08, z - Math.sign(z % 50 || 1) * .56];
      box(.19, .28, rand(.64, .98), iMat(u), ...pos, angle + rand(-.018, .018));
    }
    function iMat(u) { return Math.floor(u) % 3 ? concrete : exposed; }
  }
  for (const side of [-1, 1]) for (const zone of [-75, -25, 25, 75]) shoulder(side * 9.0, zone, true, 29.6);
  for (const cross of [-50, 0, 50]) for (const side of [-1, 1]) for (const x of [-78, -45, -23, 23, 45, 78]) shoulder(x, cross + side * 9.0, false, 19.8);
  for (const side of [-1, 1]) for (const z of [-85, -67, -35, -16, 17, 35, 66, 85]) {
    const x = side * 8.5;
    box(.56, .025, .95, dark, x, .035, z);
    for (let k = 0; k < 8; k++) box(.52, .025, .035, rusty, x, .06, z - .4 + k * .115);
    groundPatch(side * rand(7.5, 8.6), z + 1, rand(.4, .95), rand(2.4, 4.5), gravel, .055);
  }

  function pile(x, z, rw, rd, height, count = 100) {
    if (!obstacle(x, z, rw * 1.75, rd * 1.75)) return;
    stats.rubblePiles++;
    const segments = 18, rings = 6, vertices = [], uv = [], indices = [];
    for (let ring = 0; ring <= rings; ring++) for (let s = 0; s <= segments; s++) {
      const a = s / segments * PI * 2, radius = ring / rings, wobble = .88 + .12 * Math.sin(a * 5 + x), px = Math.cos(a) * rw * radius * wobble, pz = Math.sin(a) * rd * radius * wobble;
      vertices.push(x + px, .04 + Math.pow(Math.max(0, 1 - radius), .8) * height + (ring === rings ? 0 : rand(-.07, .07)), z + pz); uv.push(px / 2, pz / 2);
      if (ring < rings && s < segments) { const n = ring * (segments + 1) + s; indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, rubble);
    for (let i = 0; i < count; i++) {
      const a = rand(0, PI * 2), r = Math.sqrt(random()), px = Math.cos(a) * rw * r, pz = Math.sin(a) * rd * r;
      const wide = i % 8 === 0, w = wide ? rand(.35, .85) : rand(.11, .30), d = wide ? rand(.22, .55) : rand(.09, .22), h = wide ? rand(.08, .16) : rand(.055, .12);
      box(w, h, d, i % 3 ? brickEdge : exposed, x + px, .055 + (1 - r) * height + h / 2, z + pz, rand(0, PI), rand(-.3, .3), rand(-.28, .28)); stats.looseFragments++;
    }
    for (let i = 0; i < 35; i++) {
      const a = rand(0, PI * 2), r = rand(1, 1.7), px = x + Math.cos(a) * rw * r, pz = z + Math.sin(a) * rd * r;
      if (Math.abs(px) < 3.8 || [-50, 0, 50].some(cross => Math.abs(pz - cross) < 3.8)) continue;
      box(rand(.08, .28), rand(.035, .10), rand(.08, .22), i % 3 ? brickEdge : exposed, px, .055, pz, rand(0, PI)); stats.looseFragments++;
    }
  }

  const signs = [['ISKAASHI', 'QALAB & DAYACTIR'], ['NABAD', 'FARMAAJO · SHA AH'], ['BANAADIR', 'DUKAANKA GUUD'], ['RAJO', 'MAQAAYAD'], ['BARWAAQO', 'FARMASHIYE'], ['SAHAL', 'ADEEGGA BULSHADA']].map((words, index) => {
    const texture = canvasTexture(768, 256, (ctx, w, h) => {
      ctx.fillStyle = ['#385456', '#5e5c42', '#775745'][index % 3]; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#bbb18d'; ctx.fillRect(14, 14, w - 28, 3); ctx.fillRect(14, h - 18, w - 28, 3);
      ctx.textAlign = 'center'; ctx.fillStyle = '#d3c9a7'; ctx.font = 'bold 92px Georgia'; ctx.fillText(words[0], w / 2, 125); ctx.font = '29px Arial'; ctx.fillText(words[1], w / 2, 196);
      for (let i = 0; i < 800; i++) { ctx.fillStyle = `rgba(28,24,16,${rand(.04, .32)})`; ctx.fillRect(rand(0, w), rand(0, h), rand(2, 27), rand(.5, 4)); }
    });
    return material({ map: texture, roughness: .96 });
  });
  function facade({ x, z, width, floors, yaw, index, ruin, detail = true }) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw), h = floors * 3.2;
    const world = (u, y, v = 0) => [x + u * cos + v * sin, y, z - u * sin + v * cos];
    const fb = (w, height, depth, mat, u, y, v = 0, rz = 0) => box(w, height, depth, mat, ...world(u, y, v), yaw, 0, rz);
    const fl = (a, b, r, mat) => line(world(...a), world(...b), r, mat);
    const face = (geometry, mat, u, y, v) => add(geometry, mat, world(u, y, v), [0, yaw, 0]);
    const wall = walls[index % walls.length], bays = Math.max(3, Math.round(width / 2.9)), bw = width / bays, opening = Math.min(1.48, bw - .65);
    const ruined = (floor, bay) => {
      if(!ruin||floor<Math.max(1,floors-2))return false;
      const portion=floor===floors-1?.60:.34,edge=index%3===0?bays-1-bay:bay;
      return index%5===2?Math.abs(bay-(bays-1)*.5)<bays*(floor===floors-1?.37:.21):edge>=bays-Math.ceil(bays*portion);
    };
    for (let floor = 0; floor < floors; floor++) {
      const base = floor * 3.2, cy = base + 1.88;
      for (let bay = 0; bay < bays; bay++) {
        const u = -width / 2 + (bay + .5) * bw, missing = ruined(floor, bay), door = floor === 0 && (bay === Math.floor(bays / 2));
        if (missing) {
          stats.ruinedBays++;
          // Serrated remnants retain the actual wall thickness and brick core.
          const remnant = flatShape([[-bw / 2, 0], [bw / 2, 0], [bw / 2, rand(.1, .4)], [bw * .23, rand(.3, .6)], [bw * .08, rand(.2, .45)], [-bw * .13, rand(.5, .9)], [-bw / 2, rand(.6, 1.35)]]);
          const broken = new THREE.ExtrudeGeometry(remnant, { depth: .33, bevelEnabled: false }); broken.translate(u, base + .12, -.17); add(broken, exposed, [x, 0, z], [0, yaw, 0]);
          const stump=rand(.7,2.25);
          fb(.23, stump, .37, exposed, u - bw / 2 + .04, base + stump/2, 0);
          for (let bar = 0; bar < 4; bar++) fl([u - bw / 2 + .09 + bar * .05, base + 2.8, .02], [u - bw / 2 + .05 + bar * .09, base + rand(3.2, 3.8), rand(-.12, .16)], .009, rusty);
          // The room's dark rear wall and lateral partition are visible through the breach.
          if((index+bay)%3!==0)fb(bw, 2.6, .16, burned, u, base + 1.3, -3.0);
          fb(.13, rand(1.1,2.6), 2.7, burned, u - bw / 2, base + 1.1, -1.6);
          face(new THREE.PlaneGeometry(2.8, 3.5), scorch, u - bw / 2, base + 1.8, .20);
          continue;
        }
        const gap = door ? Math.min(2.1, bw - .35) : opening, bottom = door ? .12 : 1.0, top = door ? 2.56 : 2.72;
        fb((bw - gap) / 2, 3.0, .36, wall, u - (bw + gap) / 4, base + 1.6);
        fb((bw - gap) / 2, 3.0, .36, wall, u + (bw + gap) / 4, base + 1.6);
        if (!door) fb(gap, bottom, .36, wall, u, base + bottom / 2 + .1);
        fb(gap, 3.2 - top, .36, wall, u, base + (top + 3.2) / 2);
        const brokenOpening=!door&&ruin&&(index*3+floor*5+bay)%7<5,frameStone=brokenOpening?exposed:trim;
        fb(gap + .22, .14, .55, frameStone, u, base + bottom, .04);
        if(!brokenOpening||(bay+floor)%3===0)fb(gap + .25, .14, .49, frameStone, u, base + top, .02);
        fb(.11, (top-bottom)*(brokenOpening?.62:1), .5, frameStone, u-gap/2-.045, base+bottom+(top-bottom)*(brokenOpening?.31:.5));
        if(!brokenOpening||bay%2)fb(.11, top - bottom, .5, frameStone, u + gap / 2 + .045, base + (bottom + top) / 2);
        // A real room sits behind the wall opening. Selected rooms are open
        // through the adjacent facade, so daylight can cross the broken shell.
        if ((bay + floor + index) % 5 !== 0) fb(gap * 1.65, top - bottom + .5, .08, windowBlack, u, base + (bottom + top) / 2, -2.2);
        fb(.10, top - bottom + .5, 2.0, burned, u - gap * .75, base + (bottom + top) / 2, -1.2);
        const frame = index % 3 ? wood : blue;
        if(brokenOpening){
          fl([u-gap*.4,base+bottom+.08,-.10],[u+gap*.27,base+top-.35,.09],.032,wood);
          fb(gap*.43,.07,.10,frame,u-gap*.2,base+(bottom+top)/2,-.12,-.23);
          face(new THREE.PlaneGeometry(gap+1.2,2.9),scorch,u,base+2.3,.205);
        }else{
          fb(.06, top - bottom - .10, .09, frame, u, base + (bottom + top) / 2, -.12);
          fb(gap - .08, .06, .09, frame, u, base + (bottom + top) / 2, -.12);
        }
        stats.openWindows++;
        if (detail && !door && (index + floor + bay) % 4 === 0) authoredInsert('window_centered_small_01',world(u,base+bottom,-.035),yaw,[gap/1.12,(top-bottom)/2.3,1],(index+bay)%3!==0);
        if (door) {
          if (index % 3) {
            // Bent half-open rolling shutters are backed by an obstructed doorway.
            const shutterH = index % 2 ? 1.20 : 2.33;
            fb(gap - .08, shutterH, .07, index % 2 ? blue : rusty, u, base + top - shutterH / 2, .02);
            for (let k = 0; k < shutterH; k += .12) fb(gap - .08, .025, .09, metal, u, base + top - k, .06);
            fb(gap - .1, .42, .6, exposed, u, base + .3, -.23);
          } else { fb(gap * .43, top - bottom - .1, .09, wood, u - gap * .23, base + 1.35, .02, -.06); fb(.04, .32, .05, metal, u - .15, 1.3, .12); }
        } else if ((index + bay + floor) % 5 === 1) {
          for (const side of [-1, 1]) {
            fb(gap * .42, 1.53, .065, index % 2 ? green : blue, u + side * gap * .59, cy, .18, side * .06);
            for (let k = 0; k < 7; k++) fb(gap * .40, .025, .09, wood, u + side * gap * .59, cy - .62 + k * .2, .23);
          }
        } else if (detail) {
          const shardShape = flatShape([[-gap / 2 + .05, .70], [-gap / 2 + .05, .10], [-gap * .32, .38], [-gap * .18, .22], [-gap * .06, .70]]);
          face(new THREE.ShapeGeometry(shardShape), shard, u, cy, -.10);
          if ((bay + floor) % 3 === 0) fl([u - gap * .4, cy - .65, .04], [u + gap * .4, cy + .55, .06], .027, wood);
        }
        if (detail && floor > 0 && (index + bay * 2 + floor) % 6 === 0) {
          fb(gap + .65, .14, 1.05, exposed, u, base + .74, .44);
          for (let post = 0; post < 7; post++) fb(.025, .8, .025, rusty, u - gap * .65 + post * gap * 1.3 / 6, base + 1.2, .94);
          fl([u - gap * .65, base + 1.6, .94], [u + gap * .65, base + 1.6, .94], .025, rusty);
          fl([u - gap * .65, base + 1.6, .94], [u - gap * .65, base + 1.6, .05], .023, rusty);
          fl([u + gap * .65, base + 1.6, .94], [u + gap * .65, base + 1.6, .05], .023, rusty);
        }
        if (detail && floor > 0 && (index + bay + floor) % 7 === 0) {
          const acU = u + bw * .39;
          fb(.68, .47, .43, trim, acU, base + .77, .39);
          for (let k = 0; k < 7; k++) fb(.55, .018, .025, dark, acU, base + .61 + k * .048, .62);
          fl([acU - .21, base + .51, .12], [acU - .21, base + .51, .66], .025, rusty);
          curve([world(acU + .32, base + .77, .3), world(acU + .47, base + .4, .2), world(acU + .47, base - .1, .14)], .018, rusty);
        }
        if (detail && random() < .53) {
          face(new THREE.PlaneGeometry(rand(.8, 1.8), rand(1.4, 2.8)), scorch, u, base + 2.3, .205);
          for (let hole = 0; hole < 4; hole++) face(new THREE.PlaneGeometry(rand(.08, .22), rand(.08, .22)), chip, u + rand(-bw * .38, bw * .38), base + rand(.3, .85), .208);
        }
      }
      // Each floor has exposed concrete edges and a narrow shadow ledge.
      if(ruin&&floor>0){for(let bay=0;bay<bays;bay++)if(!ruined(floor,bay))fb(bw+.08,.16,.51,exposed,-width/2+(bay+.5)*bw,base+.05,.015);}
      else fb(width + .12, .14, .44, exposed, 0, base + .05, .015);
      if (floor > 0 && !ruin) fb(width + .17, .08, .55, trim, 0, base + .23, .07);
    }
    if (!ruin) { fb(width + .2, .17, .62, trim, 0, h + .08, .02); fb(width, .46, .25, wall, 0, h + .35, -.02); }
    if (detail) {
      const pipeU = -width / 2 + .26;
      fl([pipeU, .15, .3], [pipeU, h + .3, .3], .035, rusty);
      for (let y = 1; y < h; y += 2) fb(.13, .035, .12, metal, pipeU, y, .3);
      curve([world(width * .30, h, .3), world(width * .37, h * .57, .45), world(width * .30, 1.8, .42), world(width * .33, .2, .8)], .012, dark);
      const center = -width / 2 + (Math.floor(bays / 2) + .5) * bw;
      fb(3.0, .78, .11, wood, center, 3.0, .25);
      face(new THREE.PlaneGeometry(2.92, .71), signs[index % signs.length], center, 3.0, .315);
      // A weathered fabric canopy has scalloped corrugations and an uneven edge.
      if (index % 3 !== 1) {
        const geometry = new THREE.PlaneGeometry(3.6, 1.65, 24, 6), pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = (pos.getY(i) + .825) / 1.65; const p = world(center + u, 2.67 - v * .23 + Math.sin(u * 20) * .014, .20 + v * 1.65); pos.setXYZ(i, ...p); }
        geometry.computeVertexNormals(); add(geometry, awning);
        fl([center - 1.7, 2.43, 1.8], [center + 1.7, 2.43, 1.8], .025, rusty);
        for (const side of [-1, 1]) fl([center + side * 1.72, 2.65, .15], [center + side * 1.72, 2.43, 1.8], .022, rusty);
      }
    }
  }
  function heroRuin(cx, cz, w, d, index, background = false) {
    const side = Math.sign(cx), h = background?5.8+(index%3)*2.1:side < 0 ? 9.6 : 5.7, front = cz > 0 ? 1 : -1;
    stats.buildings++; stats.ruinedBays += 15;
    obstacle(cx, cz, w, d, true);
    const wall = side < 0 ? brickEdge : exposed;
    function tornWall(x,z,width,yaw,heights,holes=true){
      const cos=Math.cos(yaw),sin=Math.sin(yaw),wp=(u,y,v)=>[x+u*cos+v*sin,y,z-u*sin+v*cos];
      const topAt=u=>{const t=THREE.MathUtils.clamp((u+width/2)/width,0,.999)*(heights.length-1),i=Math.floor(t);return THREE.MathUtils.lerp(heights[i],heights[i+1],t-i);};
      const points=[[-width/2,0],[width/2,0]];
      for(let i=heights.length-1;i>=0;i--){const u=-width/2+i/(heights.length-1)*width;points.push([u,heights[i]]);if(i>0)points.push([u-.13,heights[i]-.22]);}
      const shape=flatShape(points);
      if(!holes){
        // A former shop survives at the high end of this wall. Its actual opening
        // reveals the room behind a distorted, partly torn rolling shutter.
        const shopU=width*.29,shopHeight=Math.min(2.55,topAt(shopU)-.45),opening=new THREE.Path();
        opening.moveTo(shopU-1.1,.12);opening.lineTo(shopU-1.1,shopHeight);opening.lineTo(shopU+1.1,shopHeight);opening.lineTo(shopU+1.1,.12);opening.closePath();shape.holes.push(opening);
        for(const du of [-1.17,1.17])box(.12,shopHeight+.1,.34,exposed,...wp(shopU+du,shopHeight/2,.02),yaw);
        box(2.45,.19,.45,exposed,...wp(shopU,shopHeight+.10,.06),yaw);
        const shutterGeo=new THREE.PlaneGeometry(2.12,1.65,24,26),pos=shutterGeo.attributes.position;
        for(let i=0;i<pos.count;i++){const u=pos.getX(i),v=pos.getY(i),bend=Math.max(0,-v+.25);pos.setXYZ(i,u+.08*bend,shopHeight-.8+v+.12*u,.19+Math.sin(v*48)*.022+bend*bend*.24);}
        shutterGeo.computeVertexNormals();add(shutterGeo,rusty,wp(shopU,0,0),[0,yaw,0]);
        for(let i=0;i<4;i++)box(rand(.28,.62),rand(.15,.36),.65,brickEdge,...wp(shopU-.8+i*.52,.20,-.05),yaw+.08*i);
        const sign=new THREE.PlaneGeometry(2.7,.68);add(sign,signs[index%signs.length],wp(shopU+.14,shopHeight+.61,.25),[0,yaw,-.13]);
        // Torn canopy: one edge is attached, the other sags onto its bent frame.
        const canopy=new THREE.PlaneGeometry(3.2,1.55,22,8),cp=canopy.attributes.position;
        for(let i=0;i<cp.count;i++){const u=cp.getX(i),v=(cp.getY(i)+.775)/1.55,tear=THREE.MathUtils.smoothstep(u,.2,1.6);cp.setXYZ(i,shopU+u,shopHeight+.27-v*(.28+tear*1.25)+Math.sin(u*23)*.014,.2+v*1.5);}
        canopy.computeVertexNormals();add(canopy,awning,[x,0,z],[0,yaw,0]);
        curve([wp(shopU-1.6,shopHeight+.23,.18),wp(shopU-1.6,shopHeight-.06,1.7),wp(shopU+.6,shopHeight-.65,1.7),wp(shopU+1.65,.55,1.9)],.025,rusty);
        const post=wp(shopU+1.65,0,1.9);obstacle(post[0],post[2],.16,.16);
        curve([wp(shopU+1.65,.05,1.9),wp(shopU+1.65,.7,1.9),wp(shopU+1.35,1.2,1.45)],.03,rusty);
      }
      if(holes)for(let col=0;col<Math.floor(width/2.8);col++){
        const u=-width/2+1.6+col*2.8, roof=heights[Math.min(heights.length-1,Math.round((u+width/2)/width*(heights.length-1)))];
        for(let y=1.15;y+1.5<roof-.45;y+=3.2){
          const hole=new THREE.Path();hole.moveTo(u-.6,y);hole.lineTo(u-.6,y+1.5);hole.lineTo(u+.6,y+1.5);hole.lineTo(u+.6,y);hole.closePath();shape.holes.push(hole);
          const c=Math.cos(yaw),s=Math.sin(yaw); const p=(du,dy,dv)=>[x+du*c+dv*s,dy,z-du*s+dv*c];
          line(p(u-.57,y,.1),p(u-.57,y+1.48,.1),.035,wood);
          line(p(u+.57,y,.1),p(u+.35,y+1.4,.18),.03,rusty);
          line(p(u-.5,y+.1,.09),p(u+.45,y+1.25,.11),.024,wood);
        }
      }
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:false});geometry.translate(0,0,-.21);
      const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2.4,uv.getY(i)/2.4);
      add(geometry,wall,[x,.08,z],[0,yaw,0]);
      if(!background){
        const wallFrame=new THREE.Matrix4().compose(new THREE.Vector3(x,.08,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw,0)),new THREE.Vector3(1,1,1));
        const edgePart=(g,m,p=[0,0,0],r=[0,0,0])=>{const local=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(1,1,1));g.applyMatrix4(local).applyMatrix4(wallFrame);add(g,m);};
        details.fractureEdge(edgePart,heights.map((height,i)=>[-width/2+i/(heights.length-1)*width,height]),{depth:.42,seed:index*71+width*13,plaster:side<0});
      }
      if(side<0){
        const plaster=shape.clone();
        // Missing render exposes red masonry beneath the surviving pale skin.
        for(let p=0;p<8;p++){const u=width*(p<4?.16+rand(-.14,.14):rand(-.43,.43)),top=topAt(u);if(top<1.5)continue;
          const hole=new THREE.Path(),cy=Math.min(top-.85,p<4?1.6+rand(-.4,1.3):rand(.8,top-.8));polygon(rand(.25,.85),rand(.3,1.05),15).forEach(([a,b],i)=>i?hole.lineTo(u+a,cy+b):hole.moveTo(u+a,cy+b));hole.closePath();plaster.holes.push(hole);}
        const skinGeometry=new THREE.ExtrudeGeometry(plaster,{depth:.018,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1});skinGeometry.scale(.985,.94,1);skinGeometry.translate(0,.08,.223);const tuv=skinGeometry.attributes.uv;for(let i=0;i<tuv.count;i++)tuv.setXY(i,tuv.getX(i)/2.4,tuv.getY(i)/2.4);
        add(skinGeometry,oldPlaster,[x,.08,z],[0,yaw,0]);
        // Blast cracks branch from one damaged area; long soot streaks collect
        // around the same bay instead of being dotted uniformly over the wall.
        const blastU=width*.15,blastY=Math.min(2.1,topAt(blastU)-.75);
        const sootGeometry=new THREE.ShapeGeometry(plaster),suv=sootGeometry.attributes.uv,sp=sootGeometry.attributes.position;
        for(let v=0;v<suv.count;v++)suv.setXY(v,(sp.getX(v)-blastU)/3.9+.5,(sp.getY(v)-blastY-.75)/Math.min(4.5,topAt(blastU))+.5);
        sootGeometry.translate(0,.08,.246);add(sootGeometry,scorch,[x,.08,z],[0,yaw,0]);
        for(let ray=0;ray<7;ray++){
          let u=blastU+rand(-.18,.18),y=blastY+rand(-.12,.12);const du=Math.cos(ray/7*PI*2)*.26,dy=Math.sin(ray/7*PI*2)*.31;
          for(let step=0;step<9;step++){const nu=u+du+rand(-.15,.15),ny=y+dy+rand(-.10,.10);if(Math.abs(nu)>width/2-.25||ny<.18||ny>topAt(nu)-.3)break;line(wp(u,y,.247),wp(nu,ny,.247),rand(.009,.018),burned,3);if(step%3===2)line(wp(nu,ny,.247),wp(nu-du*.25+rand(-.18,.18),ny+.19,.247),.006,burned,3);u=nu;y=ny;}
        }
      }
    }
    // Front wall loses more than half of its height and width. The openings are
    // cut through the remaining masonry, with no black panel hiding the rooms.
    const frontHeights=side<0?[h,h-.4,h-1.2,5.9,4.8,4.1,2.3,1.2,.65,.9,.45]:[.5,.7,.25,.55,.9,1.2,2.1,2.6,4.3,h-.4,h];
    tornWall(cx,cz+front*d/2,w,front>0?0:PI,front>0?frontHeights:[...frontHeights].reverse());
    tornWall(cx-side*w/2,cz,d,-side*PI/2,[.5,.9,1.8,3.6,4.4,5.3,7.1,h-.8,h-.1,h-.5,h].map(v=>Math.min(v,h)),false);
    tornWall(cx+side*w/2,cz,d,side*PI/2,[h-.2,h,h-.4,h-.9,h*.78,h*.71,h*.62,h*.69,h*.78,h-1,h-.6]);
    tornWall(cx,cz-front*d/2,w,front>0?PI:0,[h-.3,h-.7,h,h-.5,h-1.6,h*.69,h*.64,h*.72,h*.75,h-.8,h-.1]);
    box(w,.18,d,rubble,cx,.03,cz);
    // Surviving rooms occupy the rear and outside edge, exposing daylight and
    // collapsed floor profiles across the missing street corner.
    for(let floor=1;floor<Math.ceil(h/3.2);floor++){
      const y=floor*3.2;
      box(w*.38,.22,d*.82,exposed,cx+side*w*.30,y,cz-front*d*.08);
      box(w*.62,.22,d*.26,exposed,cx-side*w*.10,y,cz-front*d*.36);
      box(.17,2.9,d*.5,burned,cx+side*w*.13,y-1.5,cz-front*d*.22);
      for(let j=0;j<12;j++)line([cx+side*w*.11,y-.10,cz-d*.33+j*d*.05],[cx+side*(w*.11-rand(.4,1.15)),y-rand(.08,.45),cz-d*.33+j*d*.05],.012,rusty);
    }
    // Severed columns and slabs make the skyline read as a structural collapse.
    for(const [dx,dz,height]of [[-side*w*.13,front*d*.27,side<0?4.4:2.5],[-side*w*.34,-front*d*.07,2.4],[side*w*.12,front*d*.35,side<0?5.7:3.4]]){
      box(.34,height,.34,exposed,cx+dx,height/2,cz+dz);
      for(let bar=0;bar<4;bar++)line([cx+dx+(bar%2-.5)*.19,height,cz+dz+(Math.floor(bar/2)-.5)*.19],[cx+dx+(bar%2-.5)*.29,height+rand(.5,1.15),cz+dz+rand(-.2,.2)],.013,rusty);
    }
    box(w*.34,.28,3.7,exposed,cx-side*w*.19,1.65,cz+front*d*.23,.21*side,.31*front,.27*side);
    box(3.4,.24,2.2,brickEdge,cx-side*w*.35,.95,cz+front*d*.34,-.36,.18,.42*side);
    pile(cx-side*w*.12,cz+front*d*.15,w*.38,d*.36,1.2,180);
    pile(cx-side*(w/2+.4),cz+front*d*.24,2.0,3.1,1.25,180);
    // Scorch and brick-colored rough edges replace the pristine white cornices.
    add(new THREE.PlaneGeometry(w*.62,4.8),scorch,[cx,2.9,cz+front*(d/2+.225)],[0,front>0?0:PI,0]);
    addCoastalRoofDetails({cx,cz,w,d,h,index,ruin:true,add,box,line,curve,palette});
  }
  function building(cx, cz, w, d, floors, index, detail = true) {
    if(detail && [1,4,5,9,12,13].includes(index)){heroRuin(cx,cz,w,d,index);return;}
    // Reduced small details must never turn the background into an intact city.
    const ruin=detail?index%4!==1:index%4===0||index%7!==2;
    if(!detail&&ruin)stats.damagedBackgrounds++;
    if(!detail&&index%4===0){heroRuin(cx,cz,w,d,index,true);return;}
    stats.buildings++;
    const h = floors * 3.2, side = Math.sign(cx);
    obstacle(cx, cz, w, d, true);
    // Ground structure remains solid for navigation; upper floors are open shells.
    box(w, .24, d, exposed, cx, .08, cz);
    for (let floor = 1; floor <= floors; floor++) {
      const damaged = ruin && floor >= floors - 1;
      if (damaged) {
        const edge = cx - side * w / 2, cutW = floor === floors ? w * .70 : w * .28, cutZ = floor === floors ? -d * .16 : d * .2;
        const points = [[0, -d / 2], [w, -d / 2], [w, d / 2], [cutW, d / 2], [cutW + .18, cutZ + 1.2], [cutW - .3, cutZ + .85], [cutW - .1, cutZ + .3], [cutW - .85, cutZ + .2], [cutW - 1.4, cutZ - .2], [cutW - 1.9, cutZ + .16], [0, cutZ - .1]].map(([u, v]) => [edge + side * u, cz + side * v]);
        const slab = new THREE.ExtrudeGeometry(flatShape(points), { depth: .22, bevelEnabled: false }); slab.rotateX(PI / 2); add(slab, exposed, [0, floor * 3.2, 0]);
        for (let bar = 0; bar < 9; bar++) line([edge + side * (.35 + bar * .35), floor * 3.2 - .11, cz + side * (cutZ - .3)], [edge + side * (.35 + bar * .35), floor * 3.2 - rand(.08, .32), cz + side * (cutZ + rand(.3, 1.0))], .011, rusty);
      } else box(w + .05, .22, d + .05, exposed, cx, floor * 3.2, cz);
    }
    // Both street-facing directions get full-depth window and door architecture.
    facade({ x: cx - side * w / 2, z: cz, width: d, floors, yaw: -side * PI / 2, index, ruin, detail });
    facade({ x: cx, z: cz + d / 2, width: w, floors, yaw: 0, index: index + 1, ruin: ruin && (side > 0||!detail), detail });
    facade({ x: cx, z: cz - d / 2, width: w, floors, yaw: PI, index: index + 2, ruin: ruin && (side < 0||!detail), detail });
    // Rear faces have simpler masonry but still have floor divisions and windows.
    facade({ x: cx + side * w / 2, z: cz, width: d, floors, yaw: side * PI / 2, index: index + 3, ruin:ruin&&!detail, detail: false });
    box(.2, h*(ruin?.53:.96), d*(ruin?.55:.97), burned, cx+side*w*.28, h*(ruin?.265:.48), cz-d*.18);
    if (ruin) {
      const edge = cx - side * w / 2;
      pile(edge - side * 1.05, cz + d * .25, 1.6, 3.0, .8, 130);
      // A broken slab leans over the upper room; its reinforcement continues past it.
      box(2.9, .20, 2.3, exposed, edge + side * 1.4, h - 1.05, cz + d * .33, .18 * side, -.24, .19 * side);
      for (let bar = 0; bar < 9; bar++) line([edge + side * .5, h - 1.0, cz + d * .23 + bar * .21], [edge - side * .7, h - 1.4 - random() * .3, cz + d * .23 + bar * .21], .012, rusty);
      if(!detail){
        // Large tilted floor edges and roof hardware break the distant silhouette.
        box(w*.38,.28,d*.22,exposed,cx-side*w*.12,h-2.0,cz+d*.17,.11,-.22*side,.19);
        const tx=cx+side*w*.31,tz=cz-d*.31;
        add(new THREE.CylinderGeometry(.8,.86,1.6,12),index%2?dark:rusty,[tx,h+.78,tz],[0,0,index%3?.08:.31]);
        for(let k=0;k<4;k++)line([tx+(k%2-.5)*1.2,h-.4,tz+(Math.floor(k/2)-.5)*1.2],[tx+(k%2-.5)*1.3,h+rand(.4,1.4),tz+(Math.floor(k/2)-.5)*1.2],.018,rusty);
      }
    } else {
      const tx = cx + side * w * .1, tz = cz - d * .14;
      box(1.7, .18, 1.7, exposed, tx, h + .24, tz);
      add(new THREE.CylinderGeometry(.66, .72, 1.35, 16), dark, [tx, h + .95, tz]);
      add(new THREE.CylinderGeometry(.72, .72, .07, 16), metal, [tx, h + 1.66, tz]);
      line([cx, h, cz], [cx, h + 3.1, cz], .022, rusty);
      for (let k = 0; k < 5; k++) line([cx - .7, h + 2.0 + k * .18, cz], [cx + .7, h + 2.0 + k * .18, cz], .014, metal);
    }
    if (detail && index % 4 === 2) {
      // External service stair at the side wall, completely outside the clear road.
      const stairX = cx - side * (w / 2 - 1.0), stairZ = cz + d / 2 + .65;
      if (obstacle(stairX, stairZ, 2.5, 1.35)) {
        for (let step = 0; step < 11; step++) box(.25, .20 + step * .14, 1.18, exposed, stairX + side * (step - 5) * .23, (.20 + step * .14) / 2, stairZ);
        line([stairX - side * 1.2, .95, stairZ + .57], [stairX + side * 1.2, 2.4, stairZ + .57], .025, rusty);
      }
    }
    addCoastalRoofDetails({cx,cz,w,d,h,index,ruin,add,box,line,curve,palette});
  }
  // Mix low market roofs and taller blocks, with different surviving utilities.
  let index = 0;
  for (const side of [-1, 1]) for (const zone of [-75, -25, 25, 75]) for (let row = 0; row < 2; row++) {
    const w = rand(10.5, 14.7), d = rand(12.5, 15.0), setback = rand(9.6, 10.5), floors = [3, 2, 4, 3, 2, 3][index % 6];
    building(side * (setback + w / 2), zone + (row ? 8.2 : -8.2), w, d, floors, index++);
  }
  for (const side of [-1, 1]) for (const x of [41, 64, 87]) for (const zone of [-75, -25, 25, 75]) building(side * x, zone + rand(-1.2, 1.2), rand(14, 18), rand(25, 30), index%5===0?3:1+index%2, index++, false);

  // Rubble accumulates around collapses and kerbs, not in uniform rows of stones.
  for (const side of [-1, 1]) for (const z of [-86, -63, -36, -15, 14, 36, 63, 86]) {
    if (random() > .42) pile(side * rand(7.4, 8.1), z + rand(-1, 1), rand(.7, 1.15), rand(1.6, 2.8), rand(.24, .54), 60);
  }
  // Large foreground fragments establish a close, human-scale ruined edge at
  // both campaign approaches, while the central seven metres stay unobstructed.
  for(const [x,z,angle]of [[-6.9,59.0,.34],[6.8,-58.9,-.28]]){
    pile(x,z,1.35,2.55,.68,150);
    if(obstacle(x,z-1.2,3.0,1.8)){
      const shape=flatShape([[-1.3,0],[1.1,0],[1.3,.28],[1.02,.42],[.95,1.1],[.65,1.16],[.68,1.95],[.25,2.1],[.16,1.85],[-.4,1.9],[-.57,1.45],[-.95,1.39],[-1.3,.7]]);
      const fragment=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false});fragment.translate(0,0,-.12);
      add(fragment,exposed,[x,.12,z-1.2],[-.42,angle,.16]);
      for(let bar=0;bar<5;bar++)line([x-.9+bar*.37,.26,z-1.3],[x-.9+bar*.37,rand(.4,.8),z-2.5],.011,rusty);
    }
  }
  // Abandoned market furniture and damaged utility hardware form local clusters
  // beside the ruined shops. Their geometry shares existing city materials.
  function overturnedFurniture(x,z,yaw){
    if(!obstacle(x,z,2.5,2.3))return;
    const basis=new THREE.Matrix4().compose(new THREE.Vector3(x,.62,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(.18,yaw,1.12)),new THREE.Vector3(1,1,1));
    const part=(w,h,d,mat,px,py,pz)=>{const geo=new THREE.BoxGeometry(w,h,d);geo.translate(px,py,pz);geo.applyMatrix4(basis);add(geo,mat);};
    for(let plank=0;plank<5;plank++){const missing=plank===3;part(missing?.72:1.5,.055,.145,wood,missing?-.3:0,.35,-.34+plank*.17);}
    for(const tx of[-.58,.58])for(const tz of[-.29,.29])part(.06,.68,.06,rusty,tx,0,tz);
    part(1.2,.055,.04,rusty,0,-.21,-.29);part(1.2,.055,.04,rusty,0,-.21,.29);
    for(let k=0;k<8;k++)box(rand(.35,.85),.035,.09,wood,x+rand(-1.1,1.1),.055,z+rand(-1.0,1.0),rand(0,PI));
    // Broken wooden produce crate: slatted sides and exposed hollow interior.
    const qx=x+.6,qz=z+.85;
    box(.58,.05,.45,wood,qx,.11,qz,.16);
    for(let row=0;row<3;row++){box(.58,.045,.04,wood,qx,.18+row*.11,qz-.22,.16);if(row!==2)box(.58,.045,.04,wood,qx,.18+row*.11,qz+.22,.16);box(.035,.05,.44,wood,qx-.28,.18+row*.11,qz,.16);}
    for(let k=0;k<5;k++)add(new THREE.CylinderGeometry(.07,.07,.12,8),rusty,[x+rand(-.8,.7),.09,z+rand(-.7,.7)],[rand(0,1),rand(0,PI),PI/2]);
    // A crushed corrugated sheet is recognisable as roofing, not another rock.
    const roof=new THREE.PlaneGeometry(1.25,1.45,25,6),p=roof.attributes.position;
    for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i);p.setXYZ(i,x-1+u,.10+Math.sin(u*55)*.022+Math.pow(v+.72,2)*.11,z-.5+v);}
    for(let i=0;i<roof.index.count;i+=3){const a=roof.index.getX(i+1);roof.index.setX(i+1,roof.index.getX(i+2));roof.index.setX(i+2,a);}roof.computeVertexNormals();add(roof,rusty);
  }
  overturnedFurniture(-7.35,64.0,-.31);
  overturnedFurniture(7.2,-64.0,.37);
  function abandonedMarket(x,z,yaw){
    const c=Math.cos(yaw),s=Math.sin(yaw),width=Math.abs(c)*7.6+Math.abs(s)*3.8,depth=Math.abs(s)*7.6+Math.abs(c)*3.8;
    if(!obstacle(x,z,width,depth))return;
    stats.streetClusters++;
    const p=(u,y,v)=>[x+u*c+v*s,y,z-u*s+v*c];
    const b=(w,h,d,mat,u,y,v,rz=0)=>box(w,h,d,mat,...p(u,y,v),yaw,0,rz);
    const l=(a,b,r,mat)=>line(p(...a),p(...b),r,mat);
    // One abandoned handcart is the center of the scene. Its two spoked wheels,
    // curved handles and split produce bed remain legible from the street.
    const cartBasis=new THREE.Matrix4().compose(new THREE.Vector3(...p(.6,.53,.8)),new THREE.Quaternion().setFromEuler(new THREE.Euler(.07,yaw,.18)),new THREE.Vector3(1,1,1));
    const part=(geo,mat,position=[0,0,0],rotation=[0,0,0])=>{
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1));geo.applyMatrix4(matrix).applyMatrix4(cartBasis);add(geo,mat);
    };
    details.cart(part);
    // A torn cloth sheet is caught on the cart rather than stretched flat.
    const rag=new THREE.PlaneGeometry(1.15,1.35,12,12),rp=rag.attributes.position;
    for(let i=0;i<rp.count;i++){const u=rp.getX(i),v=rp.getY(i);rp.setXYZ(i,-.2+u,.8-Math.max(0,v+.15)*.85,.25+v*.8+Math.sin(u*12)*.045);}rag.computeVertexNormals();part(rag,awning);
    const sack=(u,v,y=.40,tip=0)=>{
      const geo=new THREE.SphereGeometry(1,12,9),positions=geo.attributes.position;
      for(let i=0;i<positions.count;i++){const py=positions.getY(i),angle=Math.atan2(positions.getZ(i),positions.getX(i)),wrinkle=1+.07*Math.sin(angle*7+py*9);positions.setXYZ(i,positions.getX(i)*(.36-.09*Math.max(0,py))*wrinkle,py*.48,positions.getZ(i)*.29*wrinkle);}
      geo.computeVertexNormals();add(geo,cloth,p(u,y,v),[.12,yaw,tip]);
      add(new THREE.TorusGeometry(.095,.018,4,10),wood,p(u,y+.40,v),[PI/2,yaw,tip]);
    };
    sack(-.1,.15);sack(-.7,-.1,.43,-.16);sack(-1.2,.55,.30,1.1);sack(.25,-.8,.43,.10);sack(-.35,-.7,.92,-.12);
    // Bent stall posts and a collapsed canopy occupy the left corner silhouette.
    l([-2.8,.04,-1.2],[-2.65,2.45,-1.1],.045,rusty);l([-.8,.04,-1.2],[-.55,1.18,-.8],.045,rusty);
    l([-2.65,2.45,-1.1],[-.55,1.18,-.8],.045,rusty);l([-2.65,2.45,-1.1],[-2.4,1.85,.45],.035,rusty);
    const canopy=new THREE.PlaneGeometry(2.65,1.9,18,8),cp=canopy.attributes.position;
    for(let i=0;i<cp.count;i++){const u=cp.getX(i),v=(cp.getY(i)+.95)/1.9,t=(u+1.325)/2.65;cp.setXYZ(i,...p(-1.55+u,2.45-t*.95-v*(.55+t*.42)+Math.sin(u*17)*.025,-1.1+v*1.9));}
    const clothIndices=[],cu=canopy.attributes.uv;for(let i=0;i<canopy.index.count;i+=3){const tri=[canopy.index.getX(i),canopy.index.getX(i+1),canopy.index.getX(i+2)],u=tri.reduce((sum,n)=>sum+cu.getX(n),0)/3,v=tri.reduce((sum,n)=>sum+cu.getY(n),0)/3;if(!(u>.72&&v>.53&&u+v>1.41))clothIndices.push(...tri);}canopy.setIndex(clothIndices);canopy.computeVertexNormals();add(canopy,awning);
    b(1.85,.07,.72,wood,-1.85,.56,-.35,.36);for(const u of[-2.55,-1.1])l([u,.05,-.5],[u+.14,.95,-.3],.033,rusty);
    // The damaged lamp leans into the stall; it does not cross the open lane.
    curve([p(-3.1,.03,-1.4),p(-3.08,2.2,-1.4),p(-2.8,3.7,-1.1),p(-1.75,3.15,-.2)],.068,metal);
    b(.55,.14,.34,metal,-1.75,3.15,-.2,-.23);
    add(new THREE.PlaneGeometry(1.25,.52),signs[1],p(-2.85,2.0,-1.22),[0,yaw,-.18]);
    // Drain and fractured kerb run along the shop edge, away from the main lane.
    b(6.0,.018,.30,dark,0,.045,-1.67);
    for(let i=0;i<11;i++){if(i===3||i===7)continue;b(.35,.13,.23,concrete,-2.8+i*.54,.09,-1.52,rand(-.1,.1));}
    for(let i=0;i<12;i++)b(.035,.025,.29,rusty,-1.15+i*.10,.07,-1.66);
    // Flour and dirt trail from split sacks toward the stranded wheel. Organic
    // patch edges and thin glass replace uniform scatter across the road.
    for(const [u,v,rw,rd]of[[-.9,.2,1.0,.65],[.4,.8,1.7,.52],[1.7,1.15,.85,.37],[-2.1,-.45,1.1,.6]]){
      const q=p(u,0,v);groundPatch(q[0],q[2],Math.abs(c)*rw+Math.abs(s)*rd,Math.abs(s)*rw+Math.abs(c)*rd,sand,.061);
    }
    const oil=p(.8,0,.55);add(new THREE.PlaneGeometry(3.2,2.0),scorch,[oil[0],.066,oil[2]],[-PI/2,0,yaw]);
    const trail=p(.4,.069,2.05);add(new THREE.PlaneGeometry(7.3,5.2),dustTrace,trail,[-PI/2,0,yaw]);
    for(let i=0;i<34;i++){
      const u=rand(-2.4,2.9),v=rand(.15,1.62),q=p(u,.07,v);
      if(i%4===0){const shape=flatShape([[0,0],[rand(.08,.21),.015],[.04,rand(.07,.19)]]);add(new THREE.ShapeGeometry(shape),shard,q,[-PI/2,0,rand(0,PI)]);}
      else if(i%3===0)add(new THREE.SphereGeometry(rand(.045,.08),7,5),green,[q[0],.10,q[2]]);
      else if(i%5===0)add(new THREE.PlaneGeometry(.19,.29),paper,q,[-PI/2,0,rand(0,PI)]);
      else b(rand(.21,.72),.035,.07,wood,u,.07,v,rand(-.05,.05));
    }
  }
  abandonedMarket(-7.4,37,PI/2);
  abandonedMarket(7.4,-37,-PI/2);
  abandonedMarket(-32,7.4,0);
  function streetCluster(x,z,yaw,kind){
    const c=Math.cos(yaw),s=Math.sin(yaw),width=Math.abs(c)*5.4+Math.abs(s)*3.8,depth=Math.abs(s)*5.4+Math.abs(c)*3.8;
    if(!obstacle(x,z,width,depth))return;
    stats.streetClusters++;
    const p=(u,y,v)=>[x+u*c+v*s,y,z-u*s+v*c];
    const b=(w,h,d,mat,u,y,v,tilt=0)=>box(w,h,d,mat,...p(u,y,v),yaw,0,tilt);
    const l=(a,b,r,mat)=>line(p(...a),p(...b),r,mat);
    const crate=(u,v,stack=0)=>{
      b(.66,.06,.56,wood,u,.10+stack,v);
      for(let row=0;row<3;row++)for(const side of[-1,1]){
        b(.66,.075,.04,wood,u,.19+row*.13+stack,v+side*.27);
        if(row!==2||side>0)b(.045,.075,.56,wood,u+side*.31,.19+row*.13+stack,v);
      }
      for(const du of[-.28,.28])for(const dv of[-.24,.24])b(.045,.47,.045,wood,u+du,.31+stack,v+dv);
    };
    const drum=(u,v,fallen=false)=>{
      const at=p(u,fallen?.34:.48,v),rotation=fallen?[PI/2,yaw+.25,.10]:[0,yaw,.035];
      add(new THREE.CylinderGeometry(.29,.32,.86,12),kind%2?rusty:green,at,rotation);
      for(const dy of[-.27,.27]){
        const ring=new THREE.TorusGeometry(.305,.018,4,12);ring.rotateX(PI/2);ring.translate(0,dy,0);add(ring,metal,at,rotation);
      }
    };
    if(kind===0){
      // A collapsed tea stall: a high fixed corner, torn low fabric, bent braces,
      // and an exposed slatted counter identify its former everyday use.
      l([-2.0,.04,-1.0],[-2.0,2.45,-1.0],.045,rusty);l([2.0,.04,-1.0],[1.65,1.4,-.85],.045,rusty);
      l([-2.0,2.45,-1.0],[1.65,1.4,-.85],.038,rusty);l([-2.0,2.45,-1.0],[-1.8,1.75,1.1],.035,rusty);
      l([-1.8,1.75,1.1],[1.9,.28,1.4],.035,rusty);
      const canopy=new THREE.PlaneGeometry(4.1,2.1,24,8),cp=canopy.attributes.position;
      for(let i=0;i<cp.count;i++){const u=cp.getX(i),v=(cp.getY(i)+1.05)/2.1,t=(u+2.05)/4.1;cp.setXYZ(i,...p(u,2.45-.95*t-v*(.55+.8*t)+Math.sin(u*16)*.025,-1+v*2.1));}
      canopy.computeVertexNormals();add(canopy,awning);
      for(let plank=0;plank<6;plank++)b(plank===4?1.2:2.5,.07,.15,wood,plank===4?-.65:0,.78,-.32+plank*.17,plank===4?.16:0);
      for(const u of[-1.05,1.05])for(const v of[-.28,.47])b(.065,.74,.065,rusty,u,.38,v);
      crate(-1.8,.55);crate(-1.8,.55,.49);crate(1.7,-.6);drum(2.0,.8,true);
      b(.6,.075,.55,wood,.8,.32,1.15,.74);l([.6,.1,1.0],[1.2,.85,1.4],.03,rusty);
    }else if(kind===1){
      // An abandoned sheet-metal kiosk with the shutter physically folded back.
      b(4.0,2.2,.10,burned,0,1.15,-1.35);b(.10,2.2,2.2,rusty,-1.96,1.15,-.3);
      l([1.9,.05,-1.25],[1.75,2.45,-1.2],.05,rusty);l([-1.96,2.3,-1.35],[1.75,2.45,-1.2],.05,rusty);
      const shutter=new THREE.PlaneGeometry(3.55,1.75,30,18),sp=shutter.attributes.position;
      for(let i=0;i<sp.count;i++){const u=sp.getX(i),v=sp.getY(i),bend=Math.max(0,.15-v);sp.setXYZ(i,...p(u,1.63+v-.13*u,.25+Math.sin(v*52)*.024+bend*bend*.65));}
      shutter.computeVertexNormals();add(shutter,rusty);
      for(let k=0;k<5;k++)b(.72,.04,1.7,metal,-1.5+k*.7,2.35,-.35,.05*k);
      add(new THREE.PlaneGeometry(3.15,.64),signs[(stats.streetClusters+2)%signs.length],p(0,2.55,.30),[0,yaw,.055]);
      crate(-1.1,.65);crate(.9,.65);drum(2.1,-.7);
    }else{
      // A barricade made from shop fittings and barrels, beside the clear lane.
      drum(-1.7,.4);drum(-.95,-.2,true);drum(1.65,-.65);
      crate(.55,.1);crate(.55,.1,.49);
      for(let n=0;n<4;n++)b(3.3,.09,.16,wood,0,.46+n*.18,.8,-.12);
      for(const u of[-1.35,1.3])l([u,.05,.35],[u+.2,1.3,1.15],.045,rusty);
      const sheet=new THREE.PlaneGeometry(1.55,2.0,22,7),sp=sheet.attributes.position;
      for(let i=0;i<sp.count;i++){const u=sp.getX(i),v=sp.getY(i);sp.setXYZ(i,...p(-.9+u,.30+.32*(v+1)+Math.sin(u*48)*.025,-.8+v*.58));}
      for(let i=0;i<sheet.index.count;i+=3){const a=sheet.index.getX(i+1);sheet.index.setX(i+1,sheet.index.getX(i+2));sheet.index.setX(i+2,a);}
      sheet.computeVertexNormals();add(sheet,metal);
    }
    groundPatch(x,z,width*.59,depth*.63,sand,.053);
    groundPatch(x+c*.9,z-s*.9,width*.35,depth*.42,gravel,.056);
    for(let i=0;i<24;i++){
      const u=rand(-2.55,2.55),v=rand(-1.65,1.65),pos=p(u,.06,v);
      if(i%5===0)add(new THREE.PlaneGeometry(rand(.16,.3),rand(.21,.4)),paper,pos,[-PI/2,yaw,rand(-.8,.8)]);
      else b(rand(.15,.46),rand(.025,.07),rand(.06,.15),i%3?wood:rusty,u,.06,v,rand(-.08,.08));
    }
  }
  // Cross-street corners and service alleys carry distinct clusters, rather than
  // repeating a prop every few metres down the center of the road.
  for(const [x,z,yaw,kind]of[
    [-29,57.7,0,0],[-49,42.4,PI,1],[-72,57.8,0,2],
    [29,42.2,PI,1],[52,57.8,0,0],[76,42.2,PI,2],
    [-30,7.8,0,2],[-56,-7.9,PI,0],[33,-7.8,PI,1],[72,7.8,0,0],
    [-31,-42.2,0,1],[-71,-57.8,PI,0],[33,-57.8,PI,2],[56,-42.2,0,1],
    [-7.7,81,PI/2,0],[7.7,31,-PI/2,2],[-7.7,-19,PI/2,1],[7.7,-81,-PI/2,0]
  ])streetCluster(x,z,yaw,kind);
  // A fallen pole leans along the curb. Its loose wires sag onto the rubble but
  // never stretch across the clear center route or an interaction anchor.
  for(const [x,z,sign]of [[7.8,72,-1],[-7.8,-72,1]])if(obstacle(x,z-2.8*sign,1.5,6.1)){
    line([x,.05,z],[x-sign*.15,.37,z-sign*4.7],.11,wood,9);
    line([x-sign*.15,.37,z-sign*4.7],[x-sign*.38,1.15,z-sign*5.6],.07,rusty,7);
    box(.58,.13,.28,metal,x-sign*.38,1.15,z-sign*5.6,.4);
    curve([[x,6.2,z+sign*2.0],[x-sign*.15,2.1,z-sign*.5],[x-sign*.65,.12,z-sign*3],[x-sign*1.0,.055,z-sign*5.0]],.017,dark);
    curve([[x+.13,6.4,z+sign*2.0],[x+.24,2.6,z-sign*.8],[x+.45,.22,z-sign*3.5],[x-.1,.055,z-sign*5.7]],.012,dark);
  }
  // Scraps and small flat fragments are traversable and stay below foot height.
  for (let i = 0; i < 390; i++) {
    const x = (random() < .5 ? -1 : 1) * rand(4.9, 8.5), z = rand(-96, 96);
    if (i % 6 === 0) { const geometry = new THREE.PlaneGeometry(rand(.12, .25), rand(.17, .32)); add(geometry, paper, [x, .057, z], [-PI / 2, 0, rand(0, PI)]); }
    else box(rand(.07, .22), rand(.025, .065), rand(.08, .19), i % 4 ? brickEdge : exposed, x, .055, z, rand(0, PI));
    stats.looseFragments++;
  }
  for (const [x, z, angle] of [[-6.7, -20, .1], [6.9, 30, -.12], [-6.6, 82, -.3], [6.8, -64, .08]]) {
    if (!obstacle(x, z, 1.4, 3.0)) continue;
    // Jersey barriers have a tapered concrete section with chipped, irregular top.
    const shape = flatShape([[-.48, 0], [.48, 0], [.48, .18], [.19, .56], [.15, .92], [-.15, .92], [-.19, .56], [-.48, .18]]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.5, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .025 }); geometry.translate(0, 0, -1.25); add(geometry, exposed, [x, .04, z], [0, angle, 0]);
    for (let i = 0; i < 5; i++) box(.25, .07, .12, brickEdge, x + rand(-.5, .5), .08, z + rand(-1.8, 1.8), rand(0, PI));
  }
  for (const z of [-82, -61, -35, -13, 13, 35, 61, 82]) {
    const side = z % 2 === 0 ? -1 : 1, x = side * 8.25;
    if (obstacle(x, z, .4, .4)) {
      add(new THREE.CylinderGeometry(.10, .16, 7.2, 9), wood, [x, 3.6, z]);
      box(1.5, .10, .12, wood, x, 6.55, z);
      for (let wire = 0; wire < 3; wire++) curve([[-9.4, 6.6 + wire * .16, z], [0, 5.45 + wire * .16, z + .25], [9.4, 6.8 + wire * .16, z]], .019, dark);
      curve([[x, 5.6, z], [x - side * .9, 6.1, z], [x - side * 1.65, 5.95, z]], .042, rusty);
      box(.48, .12, .28, metal, x - side * 1.65, 5.9, z);
      if (Math.abs(z) === 35) { const light = new THREE.PointLight('#e4b27a', 0, 18, 2); light.position.set(x - side * 1.65, 5.5, z); scene.add(light); nightLights.push(light); }
    }
  }
  addStreetOccupation({add,box,line,curve,groundPatch,material,canvasTexture,palette,roadHeight,colliders,protectedPoints,stats,details});
  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Urban geometry attributes could not be merged');
    const object = new THREE.Mesh(geometry, mat); object.castShadow = !mat.transparent; object.receiveShadow = true; object.name = `urban-batch-${stats.drawCalls}`;
    group.add(object); stats.drawCalls++; stats.triangles += geometry.attributes.position.count / 3;
    geometries.forEach(part => part.dispose());
  }
  group.userData.urban = stats;
  for(const parts of moduleParts.values())for(const part of parts)part.geometry.dispose();
  return stats;
}
