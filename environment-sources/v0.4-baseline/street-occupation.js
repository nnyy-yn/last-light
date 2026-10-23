import * as THREE from 'three';

// Street dressing stays in the urban material batches. Dust is a conforming
// surface, while objects above ankle height register a conservative footprint.
export function addStreetOccupation({ add, box, line, curve, groundPatch, material, canvasTexture, palette, roadHeight, colliders, protectedPoints = [], stats = {} }) {
  let seed = 731993;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rand = (a, b) => a + (b - a) * random(), PI = Math.PI;
  const { sand, concrete, brick, rusty, wood, metal, rubber, dark } = palette;
  const height = (x, z, lift = .014) => roadHeight(x, z) + lift;
  const counts = { dirtSheets: 0, wheelTracks: 0, debrisTrails: 0, fragments: 0, obstacles: 0 };
  const mask = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 85; i++) {
      const x = rand(.18, .82) * w, y = rand(.12, .88) * h, radius = rand(22, 105);
      const fade = ctx.createRadialGradient(x, y, radius * .1, x, y, radius);
      fade.addColorStop(0, `rgba(255,255,255,${rand(.24, .65)})`); fade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fade; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const image = ctx.getImageData(0, 0, w, h), pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w), edge = Math.max(0, Math.min(1, x / 42, (w - 1 - x) / 42, y / 48, (h - 1 - y) / 48));
      const n = pixels[i] * edge * rand(.68, 1); pixels[i] = pixels[i + 1] = pixels[i + 2] = n;
    }
    ctx.putImageData(image, 0, 0);
  });
  mask.colorSpace = THREE.NoColorSpace;
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  const soilMaps = palette.dirtMaps || palette.brokenMaps || {};
  const overlay = { alphaMap: mask, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -1 };
  const dust = material({ ...soilMaps, ...overlay, color: '#a59476', opacity: .80, normalScale: new THREE.Vector2(.32, .32) });
  const damp = material({ ...soilMaps, ...overlay, color: '#615a49', opacity: .58, normalScale: new THREE.Vector2(.20, .20), roughness: .86 });
  const tracks = material({ ...overlay, color: '#393a31', opacity: .45, roughness: .96 });
  const paperMap = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b4a78d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#746e5a'; ctx.fillRect(18, 17, 216, 28);
    for (let col = 0; col < 3; col++) for (let y = 59; y < 235; y += 9) { ctx.fillStyle = y % 3 ? '#827b66' : '#958b72'; ctx.fillRect(15 + col * 77, y, rand(36, 67), 2); }
    ctx.fillStyle = '#756e59'; ctx.fillRect(17, 70, 62, 54);
  });
  const paper = material({ map: paperMap, color: '#ccc3a9', roughness: 1, side: THREE.DoubleSide });
  const glass = material({ color: '#53676a', metalness: .38, roughness: .35, side: THREE.DoubleSide });

  function surface(x, z, width, length, yaw, mat) {
    const geometry = new THREE.PlaneGeometry(width, length, Math.max(2, Math.ceil(width / .45)), Math.max(2, Math.ceil(length / .45)));
    geometry.rotateX(-PI / 2); geometry.rotateY(yaw); geometry.translate(x, 0, z);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i), mat === tracks ? .021 : .013));
    geometry.computeVertexNormals(); add(geometry, mat); counts.dirtSheets++;
  }
  function wheelTrack(cx, cz, length, yaw, offset) {
    const positions = [], uvs = [], indices = [], c = Math.cos(yaw), s = Math.sin(yaw), n = Math.ceil(length / .4);
    for (let i = 0; i <= n; i++) {
      const t = i / n, v = (t - .5) * length, u = offset + Math.sin(t * 2.4) * .3;
      for (const side of [-1, 1]) { const x = cx + (u + side * .115) * c + v * s, z = cz - (u + side * .115) * s + v * c; positions.push(x, height(x, z, .025), z); uvs.push(side < 0 ? .23 : .77, t); }
      if (i < n) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, tracks); counts.wheelTracks++;
  }
  function onStreet(x, z) { return Math.abs(x) < 8.9 && Math.abs(z) < 107 || [-50, 0, 50].some(cross => Math.abs(z - cross) < 8.9 && Math.abs(x) < 107); }
  function freeObject(x, z, w, d, yaw = 0) {
    const a = Math.abs(Math.cos(yaw)), b = Math.abs(Math.sin(yaw)), rw = (w * a + d * b) / 2, rd = (w * b + d * a) / 2;
    if (protectedPoints.some(p => Math.abs(x - p[0]) < rw + 1.8 && Math.abs(z - p[1]) < rd + 1.8)) return false;
    if (!onStreet(x, z)) return false;
    const bound = { minX: x - rw, maxX: x + rw, minZ: z - rd, maxZ: z + rd };
    if (colliders.some(o => bound.minX < o.maxX + .18 && bound.maxX > o.minX - .18 && bound.minZ < o.maxZ + .18 && bound.maxZ > o.minZ - .18)) return false;
    colliders.push(bound); stats.colliders = (stats.colliders || 0) + 1; counts.obstacles++; return true;
  }
  function scrap(x, z, kind, size = 1) {
    if (!onStreet(x, z)) return;
    const y = height(x, z, .03), yaw = rand(0, PI * 2);
    if (kind === 0) {
      const geometry = new THREE.TetrahedronGeometry(rand(.07, .18) * size); geometry.scale(1.6, .28, 1); add(geometry, random() < .44 ? brick : concrete, [x, y + .025, z], [0, yaw, .14]);
    } else if (kind === 1) {
      const geometry = new THREE.BufferGeometry(), w = rand(.11, .27) * size, d = rand(.13, .31) * size;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-w, .008, -d, w, .012, -d * .7, w * .8, .035, d, -w * .65, .013, d * .8], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); geometry.setIndex([0, 2, 1, 0, 3, 2]); geometry.computeVertexNormals(); add(geometry, paper, [x, y, z], [0, yaw, 0]);
    } else if (kind === 2) {
      const geometry = new THREE.BufferGeometry(), r = rand(.055, .16) * size;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-r, 0, -r * .3, r * .6, .018, -r, r, .004, r], 3)); geometry.computeVertexNormals(); add(geometry, glass, [x, y, z], [0, yaw, 0]);
    } else if (kind === 3) box(rand(.3, .85) * size, .035, rand(.035, .09), wood, x, y + .014, z, yaw, rand(-.04, .04));
    else { const geometry = new THREE.CylinderGeometry(.035 * size, .038 * size, .13 * size, 6); add(geometry, rusty, [x, y + .045, z], [PI / 2, yaw, .18]); }
    counts.fragments++;
  }
  function debrisTrail(x, z, yaw, reach, density = 66) {
    // A wedge of masonry and household waste leads away from one ruined shop.
    const c = Math.cos(yaw), s = Math.sin(yaw);
    surface(x + s * reach * .28, z + c * reach * .28, 3.8, reach * 1.7, yaw, dust);
    for (let i = 0; i < density; i++) {
      const t = Math.pow(random(), 1.7), along = t * reach, across = rand(-1, 1) * (1.1 - t * .7);
      scrap(x + across * c + along * s, z - across * s + along * c, i % 13 === 0 ? 1 : i % 5, rand(.7, 1.25));
    }
    const cable = [[-.7, 0], [-.5, .8], [.2, 1.6], [-.05, 2.5], [.2, 3.3]].map(([u, v]) => { const px = x + u * c + v * s, pz = z - u * s + v * c; return [px, height(px, pz, .035), pz]; });
    curve(cable, .012, dark); counts.debrisTrails++;
  }

  // Uneven coverage leaves most asphalt readable. The muddy band is localized
  // beneath drains and debris; tyre tracks cut through dust rather than tile it.
  for (const [x, z, width, length, yaw] of [
    [-3.1, 29.8, 7.8, 15.5, .26], [-2.2, 57.5, 6.1, 16, .1], [3.8, 70, 5.1, 21, -.12], [-4.2, -29, 6.0, 18, .18], [4.5, -75, 5.3, 23, -.13],
    [-5.3, 91, 4.7, 16, .1], [3.7, 12, 5.8, 14, -.19], [-4.1, -8, 5.5, 12, .13], [4.4, -96, 4.9, 16, -.2],
    [-27, -47, 5.7, 24, PI / 2 + .08], [-72, -53, 4.6, 25, PI / 2 - .09], [34, -53.7, 5.8, 22, PI / 2 + .14], [77, -46.5, 5.2, 23, PI / 2],
    [-32, 3.3, 6.0, 23, PI / 2 - .12], [-78, -3.7, 5.7, 25, PI / 2 + .1], [30, -3.8, 5.4, 23, PI / 2 + .08], [76, 3.5, 5.9, 22, PI / 2 -.12],
    [-29, 53.5, 6.2, 23, PI / 2 + .1], [-79, 46.2, 5.8, 26, PI / 2 -.1], [33, 46.3, 5.8, 22, PI / 2 -.1], [78, 53.4, 5.7, 25, PI / 2 + .12]
  ]) { surface(x, z, width, length, yaw, dust); wheelTrack(x, z, length * .9, yaw, -.85); wheelTrack(x, z, length * .9, yaw, .85); }
  for (const [x, z, yaw] of [[-6.7, 27, .15], [7, 16, -.1], [-6.9, -21, .1], [6.7, -79, -.2], [-31, 7, PI / 2], [65, -7, PI / 2], [-25, 57, PI / 2], [54, -57, PI / 2]]) surface(x, z, 2.7, 8, yaw, damp);
  for (const [x, z, yaw] of [[-8, 31, PI / 2], [8, 68, -PI / 2], [-8, -28, PI / 2], [8, -74, -PI / 2], [-8, 86, PI / 2], [8, 10, -PI / 2], [-28, -58, 0], [-74, -42, PI], [33, -58, 0], [74, -42, PI], [-30, 8, PI], [-74, -8, 0], [32, -8, 0], [75, 8, PI], [-26, 58, PI], [-78, 42, 0], [33, 42, 0], [75, 58, PI]]) debrisTrail(x, z, yaw, rand(4.5, 7.8));

  function tire(x, y, z, yaw, flat = false) {
    add(new THREE.TorusGeometry(.285, .105, 7, 20), rubber, [x, y, z], [flat ? PI / 2 : 0, yaw, flat ? .07 : .12]);
    for (let i = 0; i < 16; i++) { const a = i * PI / 8; if (!flat) box(.07, .045, .19, rubber, x + Math.cos(a) * .36, y + Math.sin(a) * .36, z, yaw, 0, a); }
  }
  function occupation(x, z, yaw, kind) {
    const width = kind === 0 ? 2.65 : kind === 1 ? 2.3 : 2.6, depth = kind === 0 ? 1.65 : 1.4;
    if (!freeObject(x, z, width, depth, yaw)) return;
    const c = Math.cos(yaw), s = Math.sin(yaw), base = height(x, z, .02);
    const p = (u, y, v) => [x + c * u + s * v, base + y, z - s * u + c * v];
    const b = (w, h, d, mat, u, y, v, rx = 0, rz = 0) => box(w, h, d, mat, ...p(u, y, v), yaw, rx, rz);
    if (kind === 0) {
      // A toppled market cabinet: open frame, broken back, loose drawer, bent feet.
      for (const u of [-1.05, 1.05]) { b(.07, .59, .72, rusty, u, .33, 0); b(.34, .05, .06, metal, u, .08, -.48, 0, u > 0 ? .2 : -.3); }
      for (const v of [-.35, .35]) { b(2.15, .06, .055, rusty, 0, .62, v); b(2.12, .065, .055, rusty, 0, .10, v); }
      for (let i = 0; i < 5; i++) b(.37, .04, .67, wood, -.86 + i * .43, .13, 0, i === 2 ? -.18 : .015, i === 3 ? .12 : 0);
      b(.93, .035, .57, wood, -.4, .42, .07, -.17, .07); b(.75, .06, .14, wood, .72, .24, .45, -.12, -.16);
      b(.7, .055, .52, wood, -.34, .075, .62, 0, -.04);
      for (const u of [-.68, 0]) b(.045, .17, .52, wood, u, .15, .62);
      tire(...p(.9, .15, -.48), yaw, true);
    } else if (kind === 1) {
      // Splintered timber barricade, held down by a pair of discarded tyres.
      for (const u of [-.78, .72]) { line(p(u, .06, -.42), p(u + .1, .67, .05), .045, wood); line(p(u, .06, .45), p(u + .1, .67, .05), .045, wood); }
      b(2.15, .19, .065, wood, 0, .48, .02, .1, -.07); b(1.38, .12, .06, wood, -.3, .69, .03, .14, .09);
      tire(...p(-.65, .14, .32), yaw, true); tire(...p(.82, .36, -.2), yaw, false);
    } else {
      // A punctured drum with visible rolled rims, beside a collapsed pallet.
      const drum = new THREE.CylinderGeometry(.29, .28, .84, 14, 1, true); add(drum, rusty, p(-.45, .33, 0), [0, yaw, PI / 2 - .12]);
      for (const u of [-.85, -.08]) add(new THREE.TorusGeometry(.286, .021, 5, 18), metal, p(u, .33, 0), [0, PI / 2 + yaw, .12]);
      for (let i = 0; i < 5; i++) b(1.15, .045, .105, wood, .56, .11 + (i === 2 ? .025 : 0), -.4 + i * .18, i === 2 ? .11 : 0);
      for (const u of [.15, .95]) b(.09, .11, .93, wood, u, .05, 0);
    }
    surface(x, z, width * 2.2, depth * 3.3, yaw + .18, dust);
    for (let i = 0; i < 46; i++) { const q = p(rand(-width * .8, width * .8), 0, rand(-depth * .8, depth * 1.2)); scrap(q[0], q[2], i % 5); }
  }
  occupation(-1.25, 31.5, -.18, 0);
  for (const [x, z, yaw, kind] of [[-3.55, 56.5, -.2, 2], [4.2, 73, .17, 1], [-3.6, -31, -.2, 2], [4.2, -76, .1, 0], [-30, -53, 1.4, 1], [33, -46.4, 1.7, 2], [-29, 3.8, 1.4, 0], [36, -3.7, 1.6, 1], [-29, 53.7, 1.4, 2], [34, 46.4, 1.7, 0], [-77, 46.5, 1.5, 1]]) occupation(x, z, yaw, kind);
  stats.streetOccupation = counts;
  stats.looseFragments = (stats.looseFragments || 0) + counts.fragments;
  return counts;
}
