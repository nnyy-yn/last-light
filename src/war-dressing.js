import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// Small, physical street debris. The main north/south road and three cross
// streets keep their central seven metres completely clear of solid props.
export function createWarDressing(scene) {
  const group = new THREE.Group();
  group.name = 'Street war damage';
  const geometries = new Set(), materials = new Set(), textures = new Set();
  let state = 84301993;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const range = (a, b) => a + (b - a) * random();
  const canvasMap = (size, draw) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    textures.add(map); return map;
  };
  const grain = canvasMap(128, (ctx, size) => {
    const pixels = ctx.createImageData(size, size);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const n = 188 + range(-32, 32);
      pixels.data.set([n, n - 3, n - 8, 255], i);
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = 'rgba(30,27,22,.2)'; ctx.fillRect(random() * size, random() * size, range(1, 3), 1);
    }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const surface = (color, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, map: grain, roughness: .96, metalness });
    materials.add(material); return material;
  };
  const brickMaterial = surface('#776052');
  const mortarMaterial = surface('#827c6d');
  const steelMaterial = surface('#4b504a', .32);
  const woodMaterial = surface('#5e5140');
  const paperMaterial = surface('#aaa08a');

  const stainMap = canvasMap(256, (ctx, size) => {
    // Multiple soft, asymmetric deposits avoid the repeated round-sprite look.
    for (let i = 0; i < 34; i++) {
      const x = range(65, 192), y = range(72, 188), radius = range(18, 58);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(52,44,32,.15)'); gradient.addColorStop(.55, 'rgba(61,51,35,.07)'); gradient.addColorStop(1, 'rgba(61,51,35,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 150; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 83;
      ctx.fillStyle = `rgba(34,31,25,${range(.015, .10)})`;
      ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, range(.4, 2), range(.4, 2));
    }
  });
  const scorchMap = canvasMap(256, (ctx, size) => {
    for (let i = 0; i < 17; i++) {
      const x = range(88, 170), y = range(80, 175), radius = range(25, 72);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(21,22,19,.13)'); gradient.addColorStop(.5, 'rgba(25,25,20,.07)'); gradient.addColorStop(1, 'rgba(25,25,20,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  const tyreMap = canvasMap(512, (ctx, size) => {
    // Paired narrow tyre marks, approximately 1.35 m apart at the chosen scale.
    for (const x of [78, 434]) {
      for (let y = 15; y < size - 15; y += 10) {
        const fade = Math.sin(y / size * Math.PI);
        ctx.fillStyle = `rgba(32,31,25,${fade * range(.08, .18)})`;
        ctx.fillRect(x - 16, y, 32, 6);
        ctx.fillStyle = `rgba(63,54,38,${fade * .06})`; ctx.fillRect(x - 20, y - 2, 40, 10);
        ctx.clearRect(x - 2, y, 4, 3);
      }
    }
  });
  const decalMaterial = map => {
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    materials.add(material); return material;
  };

  const entries = { brick: [], mortar: [], steel: [], wood: [], paper: [], stain: [], scorch: [], tyre: [] };
  const push = (kind, position, scale, rotation, tint = 1) => entries[kind].push({ position, scale, rotation, tint });
  const flat = (kind, x, z, width, length, angle = 0) => push(kind, [x, .031, z], [width, length, 1], [-Math.PI / 2, 0, angle]);
  const clusters = [];
  // Long-road kerbs; skip the three intersections entirely.
  for (let z = -87; z <= 87; z += 9) {
    if ([-50, 0, 50].some(cross => Math.abs(z - cross) < 11)) continue;
    for (const side of [-1, 1]) if (random() > .16) clusters.push({ x: side * range(8.25, 8.67), z: z + range(-1.5, 1.5), cross: false, side });
  }
  // Cross-road kerbs. A separate direction lets every deposit follow the road.
  for (const road of [-50, 0, 50]) for (let x = -84; x <= 84; x += 14) {
    if (Math.abs(x) < 13) continue;
    for (const side of [-1, 1]) if (random() > .30) clusters.push({ x: x + range(-2, 2), z: road + side * range(8.22, 8.65), cross: true, side });
  }
  for (const cluster of clusters) {
    const angle = cluster.cross ? Math.PI / 2 : 0;
    const scatter = spread => {
      const along = range(-spread, spread), across = range(-.34, .34);
      return cluster.cross ? [cluster.x + along, cluster.z + across] : [cluster.x + across, cluster.z + along];
    };
    flat('stain', cluster.x, cluster.z, range(.8, 1.5), range(1.7, 3.1), angle + range(-.18, .18));
    const count = 3 + Math.floor(random() * 5);
    for (let i = 0; i < count; i++) {
      const [x, z] = scatter(1.05), w = range(.10, .235), h = range(.035, .082), d = range(.065, .13);
      push('brick', [x, .035 + h * .5, z], [w, h, d], [range(-.16, .16), random() * Math.PI, range(-.15, .15)], range(.77, 1.15));
    }
    for (let i = 0; i < 5; i++) {
      const [x, z] = scatter(1.25), w = range(.04, .14), h = range(.02, .055);
      push('mortar', [x, .031 + h * .5, z], [w, h, range(.035, .10)], [0, random() * Math.PI, 0], range(.78, 1.12));
    }
    if (random() < .28) {
      const [x, z] = scatter(.5);
      push('steel', [x, range(.055, .09), z], [range(.26, .6), 1, range(.35, .8)], [range(-.06, .06), angle + range(-.8, .8), range(-.08, .08)], range(.8, 1));
    }
    if (random() < .42) {
      const [x, z] = scatter(.8);
      push('wood', [x, .055, z], [range(.025, .045), .018, range(.25, .6)], [0, random() * Math.PI, range(-.05, .05)], range(.7, 1.1));
    }
    if (random() < .32) {
      const [x, z] = scatter(1.3);
      push('paper', [x, .038, z], [range(.07, .13), range(.11, .22), 1], [-Math.PI / 2, 0, random() * Math.PI], range(.75, 1));
    }
    if (random() < .12) flat('scorch', cluster.x - (cluster.cross ? 0 : cluster.side * .4), cluster.z - (cluster.cross ? cluster.side * .4 : 0), range(1.1, 1.7), range(1.8, 2.5), angle + range(-.4, .4));
  }
  for (const [x, z] of [[5.1, -78], [-4.7, -64], [4.8, -27], [-5.4, 23], [5.3, 73]]) flat('tyre', x, z, 1.95, range(6, 10), range(-.045, .045));
  for (const [x, z] of [[-38, -54.5], [59, 45.3], [-60, 4.9]]) flat('tyre', x, z, 1.95, range(5, 8), Math.PI / 2 + range(-.03, .03));

  // Broken chunks have flattened angular faces, rather than smooth round rocks.
  const chunk = new THREE.IcosahedronGeometry(.5, 0);
  const brick = new ConvexGeometry([
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .28], [.25, -.5, .5], [-.5, -.5, .5],
    [-.5, .5, -.5], [.46, .47, -.5], [.48, .43, .26], [.22, .40, .5], [-.5, .5, .5]
  ].map(p => new THREE.Vector3(...p)));
  const timber = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const sheet = new THREE.PlaneGeometry(1, 1, 12, 2);
  const sheetPosition = sheet.getAttribute('position');
  for (let i = 0; i < sheetPosition.count; i++) {
    const x = sheetPosition.getX(i), z = sheetPosition.getY(i);
    sheetPosition.setXYZ(i, x, Math.sin(x * Math.PI * 12) * .007 + z * z * .028, z);
  }
  sheet.computeVertexNormals(); steelMaterial.side = THREE.DoubleSide;
  const types = [
    ['brick', brick, brickMaterial], ['mortar', chunk, mortarMaterial], ['steel', sheet, steelMaterial],
    ['wood', timber, woodMaterial], ['paper', plane, paperMaterial],
    ['stain', plane, decalMaterial(stainMap)], ['scorch', plane, decalMaterial(scorchMap)], ['tyre', plane, decalMaterial(tyreMap)]
  ];
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  let triangles = 0, drawCalls = 0;
  for (const [kind, geometry, material] of types) {
    geometries.add(geometry);
    const list = entries[kind]; if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length); mesh.name = `Road damage: ${kind}`;
    mesh.castShadow = ['brick', 'steel', 'wood'].includes(kind); mesh.receiveShadow = !['stain', 'scorch', 'tyre'].includes(kind);
    for (let i = 0; i < list.length; i++) {
      const item = list[i]; transform.position.set(...item.position); transform.rotation.set(...item.rotation); transform.scale.set(...item.scale); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix); if (item.tint !== 1) mesh.setColorAt(i, tint.setScalar(item.tint));
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); group.add(mesh); drawCalls++;
    triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3 * list.length;
  }
  group.userData.stats = { drawCalls, triangles, clusters: clusters.length };
  scene.add(group);
  return () => { group.removeFromParent(); for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); for (const texture of textures) texture.dispose(); };
}
