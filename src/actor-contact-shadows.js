import * as THREE from 'three';

const CAPACITY = 160, LIFT = .005, FAR = 48;
const clamp = THREE.MathUtils.clamp;
const finitePoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const gapWeight = gap => Number.isFinite(gap) && gap >= -.025 ? 1 - THREE.MathUtils.smoothstep(gap, .025, .12) : 0;
const visibleInTree = actor => { for (let p = actor; p; p = p.parent) if (!p.visible) return false; return true; };

/** A bounded local contact-darkening batch, driven by measured skin contacts.
 * It adds no scene render pass and never moves an actor or invents a contact. */
export function createActorContactShadows(parent, {sampleHeight} = {}) {
  if (!parent?.add || typeof sampleHeight !== 'function') throw new TypeError('Contact shadows require a scene parent and terrain sampler.');
  const geometry = new THREE.PlaneGeometry(2, 2, 2, 2); geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute('aVertexId', new THREE.Float32BufferAttribute(Array.from({length:9}, (_, i) => i), 1));
  const heightsA = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const heightsB = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const heightsC = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aHeightsA', heightsA); geometry.setAttribute('aHeightsB', heightsB);
  geometry.setAttribute('aHeightC', heightsC); geometry.setAttribute('aOpacity', opacity);
  const material = new THREE.ShaderMaterial({transparent:true, depthTest:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1, side:THREE.DoubleSide, forceSinglePass:true, fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader:`attribute float aVertexId;attribute vec4 aHeightsA;attribute vec4 aHeightsB;attribute float aHeightC;attribute float aOpacity;varying vec2 vUv;varying float vOpacity;
      #include <fog_pars_vertex>
      void main(){float h=aHeightC;
        if(aVertexId<.5)h=aHeightsA.x;else if(aVertexId<1.5)h=aHeightsA.y;else if(aVertexId<2.5)h=aHeightsA.z;else if(aVertexId<3.5)h=aHeightsA.w;
        else if(aVertexId<4.5)h=aHeightsB.x;else if(aVertexId<5.5)h=aHeightsB.y;else if(aVertexId<6.5)h=aHeightsB.z;else if(aVertexId<7.5)h=aHeightsB.w;
        vec4 worldPosition=modelMatrix*instanceMatrix*vec4(position,1.);worldPosition.y=h;
        vec4 mvPosition=viewMatrix*worldPosition;gl_Position=projectionMatrix*mvPosition;vUv=uv;vOpacity=aOpacity;
        #include <fog_vertex>
      }`,
    fragmentShader:`varying vec2 vUv;varying float vOpacity;
      #include <fog_pars_fragment>
      void main(){float radius=length(vUv*2.-1.);float alpha=vOpacity*(1.-smoothstep(.25,1.,radius));if(alpha<.002)discard;gl_FragColor=vec4(.025,.019,.012,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY); mesh.name = 'Measured actor contact shadows';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.renderOrder = 2;
  parent.add(mesh);
  const worldMatrix = new THREE.Matrix4(), localMatrix = new THREE.Matrix4(), inverseParent = new THREE.Matrix4(), dummy = new THREE.Object3D();
  const cameraPosition = new THREE.Vector3(), vertex = new THREE.Vector3(), vertexPositions = geometry.attributes.position;
  let disposed = false, samples = 0, records = [];

  function update(actors = [], camera) {
    if (disposed) return;
    records = []; samples = 0; parent.updateWorldMatrix(true, false); inverseParent.copy(parent.matrixWorld).invert();
    if (camera) camera.getWorldPosition(cameraPosition);
    const candidates = [];
    for (const actor of actors) {
      if (!actor?.userData || !visibleInTree(actor)) continue;
      const c = actor.userData.poseState?.groundContact;
      if (!c || !Number.isFinite(c.weight) || c.weight <= 0 || !c.points) continue;
      const anchor = finitePoint(c.points.hip) ? c.points.hip : finitePoint(c.points.shoulder) ? c.points.shoulder : null;
      if (!anchor) continue;
      const distance = camera ? Math.hypot(anchor[0] - cameraPosition.x, anchor[1] - cameraPosition.y, anchor[2] - cameraPosition.z) : 0;
      if (distance >= FAR) continue;
      candidates.push({actor, c, distance});
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const {actor, c, distance} of candidates) {
      if (records.length >= CAPACITY) break;
      const hip = c.points.hip, shoulder = c.points.shoulder, both = finitePoint(hip) && finitePoint(shoulder);
      const yaw = both ? Math.atan2(shoulder[0] - hip[0], shoulder[2] - hip[2]) : 0;
      const weight = clamp(c.weight, 0, 1) * (1 - THREE.MathUtils.smoothstep(distance, 34, FAR));
      const add = (kind, point, gap, radiusX, radiusZ, alpha) => {
        if (records.length >= CAPACITY || !finitePoint(point)) return;
        const strength = alpha * weight * gapWeight(gap); if (strength < .005) return;
        const groundAtAnchor = sampleHeight(point[0], point[2]); samples++;
        if (!Number.isFinite(groundAtAnchor)) return;
        // A measured rooftop contact carries its own support height. Sampling
        // only street terrain would paint the actor's patch several floors down.
        const supportOffset = point[1] - gap - groundAtAnchor;
        dummy.position.set(point[0], 0, point[2]); dummy.rotation.set(0, yaw, 0); dummy.scale.set(radiusX, 1, radiusZ); dummy.updateMatrix(); worldMatrix.copy(dummy.matrix);
        const heights = [];
        for (let i = 0; i < 9; i++) {
          vertex.fromBufferAttribute(vertexPositions, i).applyMatrix4(worldMatrix);
          const floor = sampleHeight(vertex.x, vertex.z); samples++; if (!Number.isFinite(floor)) return;
          heights.push(floor + supportOffset + LIFT);
        }
        const index = records.length; localMatrix.multiplyMatrices(inverseParent, worldMatrix); mesh.setMatrixAt(index, localMatrix);
        heightsA.setXYZW(index, ...heights.slice(0, 4)); heightsB.setXYZW(index, ...heights.slice(4, 8)); heightsC.setX(index, heights[8]); opacity.setX(index, strength);
        records.push({actorId:actor.uuid, kind, position:[point[0], point[1] - gap + LIFT, point[2]], yaw, radii:[radiusX, radiusZ], gap, opacity:strength, supportOffset, heights});
      };
      add('hip', hip, c.hip, .22, .25, .28);
      add('shoulder', shoulder, c.shoulder, .25, .25, .27);
      for (let i = 0; i < 2; i++) add('foot-' + i, c.points.feet?.[i], c.feet?.[i], .105, .18, .26);
      if (both && gapWeight(c.hip) > 0 && gapWeight(c.shoulder) > 0) {
        const middle = hip.map((v, i) => (v + shoulder[i]) * .5);
        add('torso', middle, (c.hip + c.shoulder) * .5, .19, Math.min(.42, Math.hypot(hip[0] - shoulder[0], hip[2] - shoulder[2]) * .5 + .10), .16 * Math.min(gapWeight(c.hip), gapWeight(c.shoulder)));
      }
    }
    mesh.count = records.length; mesh.visible = records.length > 0;
    if (records.length) { mesh.instanceMatrix.needsUpdate = heightsA.needsUpdate = heightsB.needsUpdate = heightsC.needsUpdate = opacity.needsUpdate = true; }
  }
  return {update, inspect:() => ({disposed, capacity:CAPACITY, count:mesh.count, drawCalls:mesh.visible ? 1 : 0, sampleCount:samples, lift:LIFT, patches:records.map(p => ({...p, position:[...p.position], radii:[...p.radii], heights:[...p.heights]}))}),
    dispose() {if (disposed) return; disposed = true; mesh.count = 0; mesh.visible = false; records = []; mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose();}};
}
