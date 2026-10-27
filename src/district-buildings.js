import * as THREE from 'three';

// Physical footprints and visible volumes share one specification. The caller
// owns meshes/materials and decides whether to register these collision boxes.
export function districtBuildingFootprints(spec) {
  const {x,z,w,d,h,y=0,yaw=0,style}=spec,c=Math.cos(yaw),s=Math.sin(yaw),parts=[];
  const add=(u,v,ww,dd,hh,ground=true)=>{const xx=x+u*c+v*s,zz=z-u*s+v*c,hx=(Math.abs(c)*ww+Math.abs(s)*dd)/2,hz=(Math.abs(s)*ww+Math.abs(c)*dd)/2;parts.push({minX:xx-hx,maxX:xx+hx,minZ:zz-hz,maxZ:zz+hz,minY:y,maxY:y+hh,material:'masonry',ground});};
  if(style==='courtyard'&&w>10&&d>9){const rear=d*.47,wing=w*.39;add(0,-d/2+rear/2,w,rear,h);add(-w/2+wing/2,rear/2,wing,d-rear,Math.max(3,h*.66));add(w*.33,d/2-.12,w*.26,.24,.92,false);for(const side of[-1,1])add(w*.02+side*.73,d/2-.12,.28,.31,2.38,false);}
  else add(0,0,w,d,h);
  return parts;
}

export function createDistrictBuildings({ add, box, line, materials, rnd, stats = {} }) {
  if (typeof add !== 'function' || typeof box !== 'function') throw new TypeError('District buildings require the chapter add/box batch adapters.');
  const m = materials || {}, walls = m.plaster || m.walls || [m.concrete];
  const concrete = m.concrete || walls[0], exposed = m.exposed || concrete;
  const brick = m.brickEdge || m.brick || exposed, metal = m.metal || concrete;
  const rusty = m.rusty || metal, wood = m.wood || concrete;
  const interior = m.interiorPlaster || m.burned || m.dark || concrete;
  const total = { buildings: 0, volumes: 0, openings: 0, recessedRooms: 0, balconies: 0, damagedCorners: 0, triangles: 0, materials: 0 };
  const usedMaterials = new Set();
  stats.districtBuildings = total;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function building(spec) {
    const { x, z, w, d, h, y = 0, yaw = 0, index = 0, detail = 'mid', style = 'apartment' } = spec;
    if (![x, z, w, d, h, y, yaw].every(Number.isFinite) || w < 5 || d < 5 || h < 2.6) throw new RangeError('District building dimensions must be finite and at least 5 × 5 × 2.6 metres.');
    const near = detail === 'near', far = detail === 'far';
    const damage = clamp(spec.damage ?? (spec.damaged ? .7 : 0), 0, 1);
    const wall = spec.wallMaterial || walls[Math.abs(index) % walls.length];
    const accent = walls[(Math.abs(index) + 1) % walls.length] || wall;
    const faded = [m.blue, m.green, wood][Math.abs(index) % 3] || wood;
    let seed = (Math.imul(Math.round(x * 17 + z * 31), 2654435761) ^ Math.imul(index + 1, 1597334677)) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Consume no shared RNG unless explicitly requested: adding one lot cannot
    // silently move another chapter's props or change its road clearances.
    if (spec.useSharedRandom && rnd) seed ^= Math.floor(rnd() * 0xffffffff);
    const range = (a, b) => a + (b - a) * random();
    const result = { style, detail, openings: 0, recessedRooms: 0, balconies: 0, damagedCorners: 0, volumes: 0, triangles: 0, maxOverhang: spec.playable?1.65:.85, openingSamples: [], roofFeatures: [], collisionBoxes:districtBuildingFootprints(spec), streetFixtures:0 };
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, yy, v) => [x + u * c + v * s, y + yy, z - u * s + v * c];
    function count(material, triangles) {
      if (!material) throw new TypeError('A district building received a missing shared material.');
      usedMaterials.add(material); result.triangles += triangles;
    }
    function geometry(g, material, p = [0, 0, 0], rotation = [0, 0, 0]) {
      count(material, (g.index?.count || g.attributes.position.count) / 3);
      // Bake local rotations before the chapter's world-yaw transform. This
      // also preserves tilted roof/wall fragments when the whole lot rotates.
      if (rotation.some(Boolean)) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
      add(g, material, at(...p), [0, yaw, 0]);
    }
    function b(ww, hh, dd, material, u, yy, v, ry = 0, rx = 0, rz = 0) {
      if (ww <= .001 || hh <= .001 || dd <= .001) return;
      count(material, 12); box(ww, hh, dd, material, ...at(u, yy, v), yaw + ry, rx, rz);
    }
    function rod(a, end, radius, material = metal, sides = 5) {
      if (line) { count(material, sides * 4); line(at(...a), at(...end), radius, material, sides); return; }
      const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...end), delta = bv.clone().sub(av);
      const g = new THREE.CylinderGeometry(radius, radius, delta.length(), sides);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      geometry(g, material, av.add(bv).multiplyScalar(.5).toArray());
    }
    function face(u, v, angle, length) {
      const fc = Math.cos(angle), fs = Math.sin(angle);
      return { length, angle,
        p: (a, yy, out = 0) => [u + a * fc + out * fs, yy, v - a * fs + out * fc],
        box: (ww, hh, dd, mat, a, yy, out = 0, turn = 0) => b(ww, hh, dd, mat, u + a * fc + out * fs, yy, v - a * fs + out * fc, angle + turn),
      };
    }
    function fRod(f, a, end, radius = .025, mat = rusty) { rod(f.p(...a), f.p(...end), radius, mat); }
    function slabPolygon(points, height, thickness, material) {
      const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, -v)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1, steps: 1 });
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2.2, pos.getZ(i) / 2.2);
      geometry(g, material, [0, height, 0]);
    }
    function fracturedPier(f, u, width, base, height, depth = .32) {
      // A closed extruded masonry fragment, with an actual jagged upper edge.
      const profile = [[-width / 2, 0], [width / 2, 0], [width / 2, height * .47], [width * .28, height * .59],
        [width * .11, height * .45], [-width * .04, height * .76], [-width * .19, height * .69], [-width / 2, height]];
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(p => new THREE.Vector2(...p))), { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.translate(0, 0, -depth / 2);
      geometry(g, exposed, f.p(u, base, 0), [0, f.angle, 0]);
      for (let i = 0; i < (far ? 1 : 3); i++) fRod(f, [u + width * (-.29 + i * .2), base + height * .58, 0], [u + width * (-.23 + i * .2), base + height * .91 + .24, -.11], .011, rusty);
    }
    function exposedRoomWall(f,u,base,width,height,depth,out,turn=0){
      // Roof loss exposes these partitions directly to daylight. Give them a
      // rough masonry surface, real thickness and chipped upper edge rather
      // than reusing the dark lining intended only for an enclosed window bay.
      const profile=[[-width/2,0],[width/2,0],[width/2,height*.96],[width*.25,height*.96],[width*.16,height*.91],[-width*.02,height*.95],[-width*.20,height],[-width/2,height]];
      const g=new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(p=>new THREE.Vector2(...p))),{depth,bevelEnabled:false,steps:1,curveSegments:1});
      g.translate(0,0,-depth/2);
      geometry(g,exposed,f.p(u,base,out),[0,f.angle+turn,0]);
    }
    function balcony(f, u, base, width, broken) {
      f.box(width + .22, .18, 1.18, concrete, u, base + .035, .25);
      f.box(width + .15, .11, .12, exposed, u, base - .05, .79);
      // Brackets remain connected to the wall beneath the projecting slab.
      for (const side of [-1, 1]) fRod(f, [u + side * width * .39, base - .62, .02], [u + side * width * .39, base - .07, .71], .037, rusty);
      const posts = far ? 3 : Math.max(4, Math.ceil(width / .52));
      for (let i = 0; i < posts; i++) {
        const a = u - width / 2 + i * width / (posts - 1);
        if (broken && i === posts - 2) continue;
        fRod(f, [a, base + .12, .79], [a + (broken && i === posts - 1 ? .13 : 0), base + .98, .79], .022, rusty);
      }
      for (const level of [.55, .99]) fRod(f, [u - width / 2, base + level, .79], [u + width / 2, base + level - (broken ? .13 : 0), .79], .025, rusty);
      for (const side of [-1, 1]) fRod(f, [u + side * width / 2, base + .99, 0], [u + side * width / 2, base + .99, .79], .022, rusty);
      result.balconies++;
    }
    function opening(f, u, base, bayWidth, floorHeight, floor, bay, faceIndex, damaged, facadeWidth) {
      const shop = (style === 'shop-house' || style === 'workshop') && floor === 0 && faceIndex === 0;
      const door = floor === 0 && !shop && bay === Math.floor(facadeWidth / bayWidth / 2) && faceIndex === 0;
      const balconyDoor = !far && style === 'apartment' && floor > 0 && faceIndex === 0 && bay % 2 === index % 2;
      const apertureW = shop ? Math.min(bayWidth - .48, 2.5) : door ? 1.24 : Math.min(bayWidth - .75, near ? 1.28 : 1.45);
      const sill = shop || door || balconyDoor ? .18 : .88;
      const apertureH = Math.min(floorHeight - sill - .38, shop ? 2.35 : door || balconyDoor ? 2.16 : 1.56);
      const top = sill + apertureH, pier = (bayWidth - apertureW) / 2, thickness = .34;
      for (const side of [-1, 1]) f.box(pier, floorHeight - .14, thickness, wall, u + side * (apertureW / 2 + pier / 2), base + floorHeight / 2, 0);
      f.box(apertureW, sill, thickness, wall, u, base + sill / 2, 0);
      if (damaged) fracturedPier(f, u, apertureW, base + top, floorHeight - top, thickness);
      else f.box(apertureW, floorHeight - top, thickness, wall, u, base + (top + floorHeight) / 2, 0);
      // Concrete lintels and deep jambs are the visible opening boundary. The
      // aperture itself has no plane; its back wall is metres inside the room.
      f.box(apertureW + .25, .14, .43, concrete, u, base + top + .04, .015);
      f.box(apertureW + .22, .11, .54, concrete, u, base + sill - .025, .085);
      const roomDepth = Math.min(2.05, Math.max(1.35, Math.min(w, d) * .21))+(damaged?.30:0);
      // Keep the room's rear surface behind its aperture, not all the way to
      // the exterior corner: a full bay-wide surface would close the adjacent
      // facade's corner window in the lower-detail, wider-bay variant.
      const rearWidth=Math.min(bayWidth-.12,apertureW+.38);
      if(damaged)exposedRoomWall(f,u,base+.07,rearWidth,floorHeight-.20,.26,-roomDepth);
      else f.box(rearWidth, floorHeight - .22, .14, interior, u, base + floorHeight / 2, -roomDepth);
      // The interior ceiling and floor close each recessed bay. Warm, dark
      // plaster remains readable under daylight without a flat black card.
      // A damaged floor uses the actual broken roof slab above. A separate
      // dark ceiling would survive across the missing roof as a floating card.
      if(!damaged)f.box(apertureW+.30,.10,roomDepth,interior,u,base+floorHeight-.16,-roomDepth/2);
      if(floor===0)f.box(apertureW+.30,.10,roomDepth,damaged?concrete:interior,u,base+.07,-roomDepth/2);
      // Two reveal partitions prevent empty sky leaking diagonally between bays.
      const bayCount = Math.round(facadeWidth / bayWidth);
      for (const side of [-1, 1]) {
        // At an outside corner, the perpendicular exterior wall already closes
        // the room. An extra partition here would sit across its first window.
        if (side === -1 && bay === 0 || side === 1 && bay === bayCount - 1) continue;
        if(damaged)exposedRoomWall(f,u+side*(bayWidth/2-.12),base+.07,roomDepth,floorHeight-.20,.24,-roomDepth/2,Math.PI/2);
        else f.box(.13, floorHeight - .2, roomDepth, interior, u + side * (bayWidth / 2 - .12), base + floorHeight / 2, -roomDepth / 2);
      }
      let clear = true;
      const fixture = (index * 7 + floor * 5 + bay * 3 + faceIndex) % 7;
      if (shop) {
        f.box(apertureW + .35, .31, .15, faded, u, base + top + .31, .22);
        if (fixture % 3 === 0) {
          f.box(apertureW - .08, apertureH * .57, .055, m.metal || faded, u, base + top - apertureH * .285, -.23);
          if (!far) for (let row = 0; row < 8; row++) f.box(apertureW - .1, .024, .075, rusty, u, base + top - row * apertureH * .066, -.185);
          clear = false;
        } else if (!far) {
          // Stock shelf and counter sit inside, never obstructing the sidewalk.
          f.box(apertureW * .76, .12, .52, wood, u, base + .92, -1.25);
          for (let j = 0; j < 3; j++) f.box(.3, .36 + j * .1, .29, j % 2 ? m.cloth || wood : wood, u - .48 + j * .46, base + 1.17, -1.4);
        }
      } else if (door) {
        f.box(apertureW * (spec.playable?.98:.78), apertureH - .08, .07, faded, u + apertureW * (spec.playable?0:.11), base + sill + apertureH / 2, spec.playable?-.13:-.82, spec.playable?0:.13);
        if (!far) f.box(.045, .13, .065, rusty, u - apertureW * .17, base + 1.02, -.755);
        clear = false;
      } else {
        if (!far) {
          for (const side of [-1, 1]) f.box(.055, apertureH - .07, .065, fixture % 2 ? wood : faded, u + side * (apertureW / 2 - .06), base + sill + apertureH / 2, -.10);
          f.box(apertureW - .1, .055, .065, wood, u, base + top - .06, -.10);
        }
        if (fixture === 1 || fixture === 4) {
          // Open shutters are thick hinged leaves, not rectangles filling holes.
          for (const side of [-1, 1]) {
            const turn = side * (damaged ? .95 : .64), leafW = apertureW * .46;
            const hinge = u + side * apertureW / 2;
            f.box(leafW, apertureH * .95, .065, faded, hinge + side * leafW * .37, base + sill + apertureH / 2, .22, turn);
            if (near) for (const yy of [.22, .72]) f.box(leafW * .84, .045, .08, wood, hinge + side * leafW * .37, base + sill + apertureH * yy, .27, turn);
          }
        } else if (fixture === 2 && floor === 0 && !far) {
          for (let j = -1; j <= 1; j++) fRod(f, [u + j * apertureW * .27, base + sill + .08, .16], [u + j * apertureW * .27, base + top - .08, .16], .015, metal);
          clear = false;
        } else if (fixture === 5 && !far && !damaged) {
          // A partial curtain has an uneven lower contour and leaves open room
          // depth alongside it. Reuse the chapter's existing opaque cloth.
          f.box(apertureW * .28, apertureH * .82, .04, m.cloth || faded, u - apertureW * .29, base + top - apertureH * .41, -.42);
        }
      }
      if (balconyDoor) balcony(f, u, base + .05, Math.min(bayWidth - .2, 2.5), damaged);
      result.openings++; result.recessedRooms++;
      if (clear && !balconyDoor && result.openingSamples.length < 16) {
        const center = at(...f.p(u, base + sill + apertureH * .52, .25));
        result.openingSamples.push({ center, inward: [-Math.sin(yaw + f.angle), 0, -Math.cos(yaw + f.angle)], roomDepth, type: shop ? 'shop' : 'window' });
      }
    }
    function roof(cx, cz, ww, dd, roofY, damaged, vIndex) {
      const cutW = ww * .34, cutD = dd * .43;
      if (damaged) {
        const edgeX = cx + ww / 2 - cutW, edgeZ = cz + dd / 2 - cutD;
        slabPolygon([[cx - ww / 2, cz - dd / 2], [cx + ww / 2, cz - dd / 2], [cx + ww / 2, edgeZ - .05],
          [edgeX + .40, edgeZ + .09], [edgeX + .18, edgeZ - .08], [edgeX - .06, edgeZ + .25],
          [edgeX + .12, edgeZ + cutD * .49], [edgeX - .03, cz + dd / 2], [cx - ww / 2, cz + dd / 2]], roofY, .19, exposed);
        // The lost bay exposes beams at the actual floor edges, not a floating
        // slab pasted over an intact cuboid. Rebar terminates at the break.
        b(cutW * .68, .25, .25, exposed, edgeX + cutW * .26, roofY - .02, edgeZ, 0, 0, -.09);
        for (let i = 0; i < (far ? 2 : 5); i++) rod([edgeX - .2, roofY + .04, edgeZ + .35 + i * .46], [edgeX + .46, roofY + .08 + i * .04, edgeZ + .38 + i * .46], .012, rusty);
        result.damagedCorners++;
      } else b(ww + .12, .19, dd + .12, concrete, cx, roofY + .08, cz);
      const rim = .5 + (vIndex % 3) * .12;
      b(ww, rim, .24, wall, cx, roofY + rim / 2 + .17, cz - dd / 2 + .05);
      b(.24, rim, dd, wall, cx - ww / 2 + .05, roofY + rim / 2 + .17, cz);
      const frontW = damaged ? ww - cutW - .15 : ww, rightD = damaged ? dd - cutD - .15 : dd;
      b(frontW, rim, .24, wall, cx - (ww - frontW) / 2, roofY + rim / 2 + .17, cz + dd / 2 - .05);
      b(.24, rim, rightD, wall, cx + ww / 2 - .05, roofY + rim / 2 + .17, cz - (dd - rightD) / 2);
      for (const [rx, rz] of [[cx - ww * .36, cz - dd * .33], [cx + ww * .34, cz - dd * .33]]) {
        b(.16, .12, .28, concrete, rx, roofY + .21, rz);
      }
      if (far && vIndex % 2) return;
      const tx = cx - ww * .25, tz = cz - dd * .22;
      if (vIndex % 3 === 0) {
        // Raised masonry cistern and connected service pipe, within the roof.
        b(1.6, .16, 1.36, concrete, tx, roofY + .27, tz);
        b(1.35, 1.05, 1.16, accent, tx, roofY + .88, tz);
        b(1.49, .10, 1.30, concrete, tx, roofY + 1.46, tz);
        b(.39, .05, .39, rusty, tx + .22, roofY + 1.53, tz);
        rod([tx - .7, roofY + .71, tz], [tx - .93, roofY + .71, tz], .033, metal);
        rod([tx - .93, roofY + .71, tz], [tx - .93, roofY + .2, tz], .033, rusty);
        result.roofFeatures.push('masonry-cistern');
      } else if (vIndex % 3 === 1) {
        const tw = Math.min(2.5, ww * .25), td = Math.min(2.7, dd * .29);
        // Stair head is an actual small shell with a recessed doorway.
        b(tw, 1.9, .18, accent, tx, roofY + 1.12, tz - td / 2);
        for (const side of [-1, 1]) b(.18, 1.9, td, accent, tx + side * tw / 2, roofY + 1.12, tz);
        b((tw - .9) / 2, 1.9, .18, accent, tx - (tw + .9) / 4, roofY + 1.12, tz + td / 2);
        b((tw - .9) / 2, 1.9, .18, accent, tx + (tw + .9) / 4, roofY + 1.12, tz + td / 2);
        b(.9, .25, .18, concrete, tx, roofY + 1.96, tz + td / 2);
        b(tw + .2, .15, td + .2, concrete, tx, roofY + 2.12, tz);
        result.roofFeatures.push('stair-head');
      } else {
        geometry(new THREE.CylinderGeometry(.55, .57, 1.14, far ? 10 : 14), rusty, [tx, roofY + .86, tz]);
        for (const level of [.36, 1.34]) geometry(new THREE.TorusGeometry(.57, .025, 5, far ? 10 : 14), metal, [tx, roofY + level, tz], [Math.PI / 2, 0, 0]);
        b(1.32, .17, 1.32, concrete, tx, roofY + .25, tz);
        result.roofFeatures.push('steel-tank');
      }
      if (!far) {
        const ax = cx - ww * .38, az = cz + dd * .21;
        rod([ax, roofY + .15, az], [ax + .08, roofY + 2.18, az], .022, rusty);
        for (let j = 0; j < 3; j++) rod([ax - .34 + j * .045, roofY + 1.74 + j * .13, az], [ax + .4 - j * .045, roofY + 1.74 + j * .13, az], .012, metal);
        rod([ax, roofY + 1.42, az], [ax + .65, roofY + .23, az + .55], .008, rusty);
      }
    }
    function volume(cx, cz, ww, dd, height, vIndex, localDamage = damage, coveredBay = () => false) {
      result.volumes++;
      const floors = style === 'workshop' || style === 'camp' ? Math.max(1, Math.min(2, Math.round(height / 3.4))) : Math.max(1, Math.min(5, Math.round(height / 3.15)));
      const storey = height / floors, ruin = localDamage > .42 && (floors > 1 || style==='shop-house' || style==='workshop');
      const setback = !ruin && floors > 2 && vIndex % 3 === 1;
      let topW = ww, topD = dd;
      b(ww + .06, .18, dd + .06, exposed, cx, .06, cz);
      for (let floor = 0; floor < floors; floor++) {
        const base = floor * storey, upper = floor === floors - 1;
        const fw = upper && setback ? ww * .80 : ww, fd = upper && setback ? dd * .80 : dd;
        topW = fw; topD = fd;
        // Horizontal slabs are the only full footprint solids: windows remain
        // real holes in the surrounding shell rather than skins over a box.
        if (floor > 0) b(floor === floors - 1 ? ww : fw, .17, floor === floors - 1 ? dd : fd, concrete, cx, base + .025, cz);
        const faces = [face(cx, cz + fd / 2, 0, fw), face(cx, cz - fd / 2, Math.PI, fw), face(cx + fw / 2, cz, Math.PI / 2, fd), face(cx - fw / 2, cz, -Math.PI / 2, fd)];
        for (let fi = 0; fi < faces.length; fi++) {
          const f = faces[fi], bays = clamp(Math.round(f.length / (far ? 4.4 : near ? 3.2 : 3.8)), 2, far ? 3 : near ? 5 : 4), bayWidth = f.length / bays;
          for (let bay = 0; bay < bays; bay++) {
            const u = -f.length / 2 + (bay + .5) * bayWidth;
            if (coveredBay(fi, u, bayWidth, base)) {
              // Attached wings share an internal wall. Do not manufacture a
              // window that immediately looks into the adjoining solid room.
              f.box(bayWidth, storey - .14, .34, wall, u, base + storey / 2, 0);
              continue;
            }
            const removed = ruin && upper && (fi === 0 && bay === bays - 1 || fi === 2 && bay === 0);
            if (removed) {
              fracturedPier(f, u - (fi === 0 ? bayWidth * .24 : -bayWidth * .24), bayWidth * .48, base + .12, storey * .62);
              continue;
            }
            opening(f, u, base, bayWidth, storey, floor, bay, fi, ruin && upper, f.length);
          }
          // A floor edge, with narrow pilasters at the structurally supported
          // corners. The palette change follows construction, not random paint.
          const stripLength = ruin && upper && (fi === 0 || fi === 2) ? f.length - bayWidth : f.length;
          const offset = ruin && upper && fi === 0 ? -bayWidth / 2 : ruin && upper && fi === 2 ? bayWidth / 2 : 0;
          f.box(stripLength, .14, .39, concrete, offset, base + .13, .01);
          for (const side of [-1, 1]) {
            if (ruin && upper && (fi === 0 && side === 1 || fi === 2 && side === -1)) continue;
            f.box(.23, storey - .13, .4, accent, side * (f.length / 2 - .12), base + storey / 2, 0);
          }
        }
        if (ruin && upper && !far) {
          // A few room contents exposed by the missing bay provide scale.
          b(1.3, .10, .55, wood, cx + fw * .30, base + .61, cz + fd * .24, .17);
          for (const side of [-1, 1]) rod([cx + fw * .30 + side * .51, base + .1, cz + fd * .24], [cx + fw * .30 + side * .51, base + .58, cz + fd * .24], .035, rusty);
          for (let j = 0; j < 5; j++) b(range(.32, .65), .12, range(.18, .3), brick, cx + fw * .24 + range(-.9, .9), base + .15, cz + fd * .31 + range(-.6, .6), range(-1.2, 1.2));
        }
      }
      roof(cx, cz, topW, topD, height, ruin, vIndex);
      if(spec.playable&&!far&&m.weathering){
        geometry(new THREE.PlaneGeometry(ww*.96,1.12),m.weathering,[cx,.56,cz+dd/2+.181]);
        if(ruin){geometry(new THREE.PlaneGeometry(Math.min(ww*.38,3.4),Math.min(height*.7,3.1)),m.scorch||m.weathering,[cx+ww*.27,Math.min(height*.35,1.55),cz+dd/2+.184]);}
      }
      if (setback) {
        const terraceY = height - storey + .15;
        const front = face(cx, cz + dd / 2 - .04, 0, ww);
        for (let j = 0; j < 5; j++) fRod(front, [-ww * .46 + j * ww * .23, terraceY, 0], [-ww * .46 + j * ww * .23, terraceY + .88, 0], .024, rusty);
        fRod(front, [-ww * .46, terraceY + .88, 0], [ww * .46, terraceY + .88, 0], .026, metal);
      }
      if (!far) {
        // Drainage joins roof to ground and turns at the building's actual base.
        const px = cx - ww / 2 - .14, pz = cz + dd * .28;
        rod([px, .23, pz], [px, height + .29, pz], .045, rusty, 7);
        rod([px, height + .29, pz], [px + .35, height + .29, pz], .045, rusty, 7);
        rod([px, .23, pz], [px, .16, pz + .35], .045, rusty, 7);
        for (let yy = 1.0; yy < height; yy += 2.4) b(.25, .07, .11, metal, px + .06, yy, pz);
      }
      if ((style === 'shop-house' || style === 'workshop') && !far) {
        const front = face(cx, cz + dd / 2, 0, ww), aw = Math.min(ww * .62, 6.6);
        front.box(aw*(ruin?.64:1), .10, .92, m.awning || m.cloth || faded, ruin?-aw*.18:0, 2.72, .35,0,ruin?.10:0);
        front.box(aw*(ruin?.64:1), .18, .09, faded, ruin?-aw*.18:0, 2.62, .78,ruin?.03:0);
        for (const side of [-1, 1]) fRod(front, [side * aw * .44, 2.12, .04], [side * aw * .44, 2.69, .72], .032, rusty);
        if(m.signs?.length){const sw=Math.min(ww*.63,5.8);front.box(sw+.12,.58,.13,wood,0,3.02,.23);geometry(new THREE.PlaneGeometry(sw,.47),m.signs[style==='workshop'?1:index%m.signs.length],[cx,3.02,cz+dd/2+.302]);}
      }
    }

    if (style === 'courtyard' && w > 10 && d > 9) {
      const rearDepth = d * .47, wingWidth = w * .39, wingHeight = Math.max(3, h * .66);
      volume(0, -d / 2 + rearDepth / 2, w, rearDepth, h, index, damage, (fi, u, bw, base) => fi === 0 && u - bw / 2 < -w / 2 + wingWidth && base < wingHeight + .15);
      volume(-w / 2 + wingWidth / 2, rearDepth / 2, wingWidth, d - rearDepth, wingHeight, index + 2, damage * .5, fi => fi === 1);
      // Low entry boundary leaves an actual open court, distinct from a block.
      const front = face(0, d / 2 - .12, 0, w);
      front.box(w * .26, .92, .24, accent, w * .33, .46, 0);
      for (const side of [-1, 1]) front.box(.28, 2.38, .31, concrete, w * .02 + side * .73, 1.19, 0);
      front.box(1.74, .20, .33, concrete, w * .02, 2.42, 0);
    } else volume(0, 0, w, d, h, index, style === 'camp' ? 0 : damage);

    // Readable traces of daily use follow the building's function. Courtyard
    // objects stay on its right side, preserving the gate-to-court approach.
    if(spec.playable&&!far){
      const court=style==='courtyard',front=face(0,d/2,0,w),fx=court?w*.31:-w*.27,fz=court?d*.18:d/2+.55;
      const fixture=(u,v,ww,hh,dd,mat=wood)=>{b(ww,hh,dd,mat,u,hh/2,v);const p=at(u,0,v);result.collisionBoxes.push({minX:p[0]-ww/2,maxX:p[0]+ww/2,minZ:p[2]-dd/2,maxZ:p[2]+dd/2,minY:y,maxY:y+hh,material:mat===metal?'metal':'wood',ground:false});result.streetFixtures++;};
      if(style==='shop-house'||spec.zone==='market'){
        for(let j=0;j<3;j++){const u=-w*.31+j*.8;fixture(u,d/2+.52,.66,.62+(j%2)*.24,.64);for(let n=0;n<3;n++)b(.68,.055,.04,exposed,u,.13+n*.18,d/2+.86);}
        const shelterWidth=Math.min(w*.65,7.2);
        front.box(shelterWidth,.08,1.7,m.awning||m.cloth,0,2.8,.70,0,.04);
        front.box(shelterWidth,.19,.08,faded,0,2.67,1.51);
        for(const side of[-1,1]){fRod(front,[side*shelterWidth*.46,0,1.35],[side*shelterWidth*.46,2.77,1.35],.038,wood);fRod(front,[side*shelterWidth*.46,2.45,1.35],[side*shelterWidth*.46,2.77,.05],.025,rusty);}
      }else if(style==='workshop'||spec.zone==='workshop'){
        fixture(fx,fz,1.75,.75,.66,metal);for(let j=0;j<3;j++){geometry(new THREE.TorusGeometry(.30,.10,5,9),m.rubber||interior,[fx+j*.48,.34,fz+.48],[Math.PI/2,0,.2]);}for(let j=0;j<4;j++)b(.16,.08,.9,rusty,fx-.58+j*.32,.83,fz,.25);
      }else{
        const xx=court?w*.28:0,v=court?d*.25:d/2+.32;
        rod([xx-2,2.55,v],[xx+2,2.4,v],.012,rusty);for(let j=0;j<3;j++)b(.64,.87-j*.13,.045,j%2?m.cloth:awningMaterial(),xx-1.15+j*.83,1.92+j*.05,v+.025,0,0,.05*(j-1));
        if(court)fixture(fx,fz,.75,.58,.75,wood);
      }
      if(damage>.4){
        // Broken masonry belongs to the failed front corner, rather than a
        // uniform noise scatter across every road or courtyard.
        for(let j=0;j<18;j++){const u=w*.25+range(-w*.13,w*.13),v=d/2+range(.10,.88),height=.06+random()*.15;b(.20+random()*.32,height,.18+random()*.16,j%3?brick:exposed,u,height/2,v,random()*2,range(-.15,.15),range(-.15,.15));}
        const front=face(0,d/2,0,w);for(let j=0;j<7;j++){const u=-w*.38+(j%3)*.17,yy=.75+Math.floor(j/3)*.28;geometry(new THREE.CircleGeometry(.026+(j%2)*.014,6),interior,front.p(u,yy,.177));geometry(new THREE.TorusGeometry(.048,.012,3,6),exposed,front.p(u,yy,.181));}
      }
    }
    function awningMaterial(){return m.awning||m.cloth||wood;}
    const pad = result.maxOverhang, halfX = Math.abs(c) * (w / 2 + pad) + Math.abs(s) * (d / 2 + pad), halfZ = Math.abs(s) * (w / 2 + pad) + Math.abs(c) * (d / 2 + pad);
    result.bounds = { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, minY: y - .03, maxY: y + h + 2.5 };
    total.buildings++;
    for (const key of ['volumes', 'openings', 'recessedRooms', 'balconies', 'damagedCorners', 'triangles']) total[key] += result[key];
    total.materials = usedMaterials.size;
    return result;
  }
  return { building, inspect: () => ({ ...total }) };
}
