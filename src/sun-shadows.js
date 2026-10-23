import * as THREE from 'three';

// Spend shadow texels on the playable foreground. Quantizing in light space
// keeps stationary surface detail stable while the camera moves by subpixels.
export function createSunShadows(light, { extent = 40 } = {}) {
  const direction = light.position.clone(), up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(), vertical = new THREE.Vector3();
  const forward = new THREE.Vector3(), focus = new THREE.Vector3();
  const target = new THREE.Vector3();
  Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 220 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.normalBias = .018;
  light.shadow.bias = -.00008;
  const refreshBasis = () => {
    forward.copy(direction).normalize();
    right.crossVectors(up, forward).normalize();
    vertical.crossVectors(forward, right).normalize();
  };
  refreshBasis();
  return {
    setDirection(position) { direction.fromArray(position); refreshBasis(); },
    update(camera) {
      if (!camera) return;
      camera.getWorldDirection(focus); focus.y = 0;
      if (focus.lengthSq() > .001) focus.normalize().multiplyScalar(8);
      focus.add(camera.position); focus.y = 0;
      const texel = extent * 2 / light.shadow.mapSize.x;
      const x = Math.round(focus.dot(right) / texel) * texel;
      const y = Math.round(focus.dot(vertical) / texel) * texel;
      target.copy(right).multiplyScalar(x).addScaledVector(vertical, y).addScaledVector(forward, focus.dot(forward));
      light.target.position.copy(target); light.target.updateMatrixWorld(true);
      light.position.copy(target).add(direction);
    },
    inspect() { return { extent, mapSize: light.shadow.mapSize.toArray(), texelMetres: extent * 2 / light.shadow.mapSize.x, target: target.toArray(), direction: direction.toArray(), normalBias: light.shadow.normalBias }; },
  };
}
