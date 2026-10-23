import * as THREE from 'three';

// Everyday rooftop/service-room details, built into the city's existing batches.
// All horizontal extents stay inside the host building; no collision is added.
export function addCoastalRoofDetails({ cx, cz, w, d, h, index, ruin, add, box, line, curve, palette }) {
  if (![cx, cz, w, d, h, index].every(Number.isFinite) || w < 6 || d < 6 || h < 3) return;
  const { concrete, rusty, wood, metal, cloth, dark, sand, trim } = palette;
  const side = Math.sign(cx) || 1, rear = Math.sign(cz) || 1, type = Math.abs(Math.floor(index)) % 5;
  const rx = cx + side * w * .28, rz = cz - rear * d * .29;
  // Hero ruins retain floors at 3.2m intervals and lose the upper roof entirely.
  const level = ruin ? Math.max(.16, (Math.ceil(h / 3.2) - 1) * 3.2 + .13) : h + .14;
  const p = (x, y, z) => [rx + x, level + y, rz + z];
  const rb = (a, b, c, mat, x, y, z, ry = 0, ax = 0, az = 0) => box(a, b, c, mat, ...p(x, y, z), ry, ax, az);
  const rl = (a, b, r, mat) => line(p(...a), p(...b), r, mat);
  function barrel(x, z, height = .85, radius = .31, fallen = false) {
    const y = fallen ? radius + .035 : height / 2 + .035, rot = fallen ? [0, .3, Math.PI / 2] : [0, 0, 0];
    add(new THREE.CylinderGeometry(radius * .97, radius, height, 14), rusty, p(x, y, z), rot);
    if (!fallen) {
      for (const band of [.16, height - .16]) add(new THREE.TorusGeometry(radius, .012, 4, 14), metal, p(x, band + .035, z), [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(radius * .98, radius * .98, .025, 14), trim || concrete, p(x, height + .05, z));
      add(new THREE.CylinderGeometry(.035, .035, .03, 8), dark, p(x + .12, height + .075, z));
    }
  }
  function sheet(x, y, z, width, depth, corrugated, damaged = false) {
    const geometry = new THREE.PlaneGeometry(width, depth, 20, 10), vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const u = vertices.getX(i), v = vertices.getY(i), t = (v + depth / 2) / depth;
      const sag = corrugated ? Math.sin(u * 48) * .018 - t * .16 : -.24 * Math.sin(t * Math.PI) + Math.sin(u * 12 + t * 4) * .025;
      vertices.setXYZ(i, u, sag - (damaged && u > width * .15 ? t * .38 : 0), v);
    }
    const triangles = [];
    for (let i = 0; i < geometry.index.count; i += 3) {
      const a = geometry.index.getX(i), b = geometry.index.getX(i + 1), c = geometry.index.getX(i + 2);
      if (damaged && vertices.getX(a) > width * .13 && vertices.getZ(a) > depth * .18 && (Math.floor(i / 6) % 4 < 2)) continue;
      triangles.push(a, c, b, a, b, c); // Both faces; share the existing opaque material.
    }
    geometry.setIndex(triangles); geometry.computeVertexNormals();
    // Opposite coincident faces would cancel averaged normals: assign upward cloth normals.
    const normals = geometry.attributes.normal; for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
    add(geometry, corrugated ? rusty : cloth, p(x, y, z));
  }
  if (type === 0 || type === 4) {
    rb(1.45, .13, 1.12, concrete, 0, .065, 0);
    barrel(-.34, -.13, type === 4 ? 1.12 : .85, type === 4 ? .39 : .31);
    if (type === 0) barrel(.40, .22, .63, .25, ruin);
    curve([p(-.40, .72, -.24), p(-.78, .69, -.35), p(-.81, .11, -.36), p(-.81, -.20, -.36)], .022, rusty);
  } else if (type === 1 && !ruin) {
    // A modest plastered cistern with an inspection cover, not a modern plastic tank.
    rb(1.55, 1.04, 1.18, concrete, 0, .52, 0);
    rb(1.65, .09, 1.28, trim || concrete, 0, 1.08, 0);
    rb(.42, .035, .39, rusty, .31, 1.145, -.12);
    rl([-.79, .78, 0], [-.97, .78, 0], .027, metal); rl([-.97, .78, 0], [-.97, .08, 0], .027, rusty);
  } else {
    const canopy = type === 2, width = canopy ? 2.2 : 1.9, depth = canopy ? 1.9 : 1.45, height = ruin ? 1.28 : 1.75;
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) rl([x, .03, z], [x + (ruin ? .12 : 0), height - (z > 0 ? .13 : 0), z], .025, rusty);
    sheet(0, height, 0, width, depth, !canopy, ruin || index % 2 === 0);
    rl([-width / 2, height, -depth / 2], [width / 2, height, -depth / 2], .03, wood);
    if (!canopy) for (let plank = 0; plank < 6; plank++) rb(.22, .95, .035, wood, -.70 + plank * .28, .5, -depth / 2, 0, 0, ruin && plank % 2 ? .13 : 0);
  }
  // A bent receiving aerial, sagging insulated wire and crude stays vary the skyline.
  if (index % 3 !== 1) {
    const ax = -side * 1.3, az = rear * .65, top = ruin ? 1.85 : 2.55;
    curve([p(ax, .05, az), p(ax, top * .64, az), p(ax + .20, top, az + .09), p(ax + .36, top + .08, az + .13)], .018, rusty);
    for (let bar = 0; bar < 3; bar++) rl([ax - .38 + bar * .07, top - .22 - bar * .18, az], [ax + .43 - bar * .07, top - .22 - bar * .18, az + .13], .010, metal);
    curve([p(ax, top * .7, az), p(-.8, .8, .9), p(.6, .32, .95), p(1, .15, .6)], .009, dark);
    rl([ax, top * .55, az], [ax + .7, .08, az - .5], .006, rusty);
  }
  if (ruin) {
    // Short severed beams follow the remaining outside floor, leaving the opening clear.
    const bx = cx + side * w * .33, bz = cz - rear * d * .08, by = Math.max(.22, level - 3.2);
    for (let n = 0; n < 3; n++) {
      box(1.65 - n * .25, .16, .18, wood, bx - side * .7, level + .25 + n * .12, bz + (n - 1) * .75, .13 * n, 0, -.10 * side);
      line([bx - side * 1.4, level + .2, bz + (n - 1) * .75], [bx - side * 1.7, level - .10, bz + (n - 1) * .75 + .12], .009, rusty);
    }
    // A broken bed frame, shelf and scattered boards are visible in the opened room.
    box(.76, .05, 1.75, cloth, bx, by + .29, bz, .09);
    for (const dx of [-.36, .36]) for (const dz of [-.80, .80]) line([bx + dx, by + .03, bz + dz], [bx + dx, by + .45, bz + dz], .024, rusty);
    box(.95, .08, .30, wood, bx, by + 1.3, bz - rear * 1.0);
    for (let n = 0; n < 5; n++) box(.52 + n * .05, .035, .11, wood, bx - side * (.4 + n * .13), by + .04, bz + .6 - n * .24, n * .57);
    // Low courtyard remnants never expand beyond the occupied building footprint.
    for (let step = 0; step < 4; step++) box(.34, .18 + step * .19, 1.15, sand || concrete, cx + side * (w * .25 - step * .31), (.18 + step * .19) / 2, cz - rear * d * .34);
  }
}
